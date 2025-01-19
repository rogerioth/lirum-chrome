import { LLMProvider, LLMResponse, LLMOptions, LLMStreamResponse } from './LLMProvider';
import { Logger } from '../utils/Logger';

export class DeepseekProvider implements LLMProvider {
  name = 'Deepseek';
  defaultModel = 'deepseek-chat';
  availableModels = ['deepseek-chat', 'deepseek-coder'];

  private readonly logger: Logger;
  private readonly API_URL = 'https://api.deepseek.com/v1/chat/completions';
  private readonly API_KEY_PATTERN = /^.{5,}$/;

  private readonly STORAGE_KEY = 'deepseek_provider_state';
  private endpoint: string = 'https://api.deepseek.com';

  constructor() {
    this.logger = Logger.getInstance();
  }

  private async loadState(): Promise<void> {
    try {
      const data = await chrome.storage.local.get(this.STORAGE_KEY);
      const state = data[this.STORAGE_KEY];
      if (state) {
        await this.logger.debug('Deepseek provider state loaded', {
          hasApiKey: Boolean(state.apiKey),
          endpoint: state.endpoint || this.endpoint,
          currentModel: state.currentModel || this.defaultModel
        });
      }
    } catch (error) {
      await this.logger.error('Failed to load Deepseek provider state', { error });
    }
  }

  private async saveState(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEY]: {
          apiKey: null,
          endpoint: this.endpoint,
          currentModel: this.defaultModel
        }
      });
      await this.logger.debug('Deepseek provider state saved', {
        hasApiKey: false,
        endpoint: this.endpoint,
        currentModel: this.defaultModel
      });
    } catch (error) {
      await this.logger.error('Failed to save Deepseek provider state', { error });
    }
  }

  async test(apiKey?: string, endpoint?: string): Promise<void> {
    if (!apiKey || !this.validateApiKey(apiKey)) {
      throw new Error('Invalid API key format. Key should be at least 5 characters long.');
    }

    // Test the API key with a simple models list request
    try {
      const testEndpoint = endpoint || this.endpoint;
      const response = await fetch(`${testEndpoint}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to validate API key');
      }

      await this.logger.info('Deepseek provider validated successfully');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Deepseek API key validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    // Load configuration
    const config = await chrome.storage.local.get('deepseek_provider_config');
    const providerConfig = config['deepseek_provider_config'];
    
    if (!providerConfig?.apiKey) {
      throw new Error('Deepseek provider not configured. Please provide a valid API key in settings.');
    }

    const requestBody = {
      model: providerConfig.model || this.defaultModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      top_p: options.topP ?? 1,
      frequency_penalty: options.frequencyPenalty ?? 0,
      presence_penalty: options.presencePenalty ?? 0,
      stop: options.stop,
      stream: false
    };

    try {
      const response = await fetch(`${providerConfig.endpoint || this.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${providerConfig.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Deepseek API request failed');
      }

      const data = await response.json();
      
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from Deepseek API');
      }

      await this.logger.llm('Deepseek completion successful', {
        model: providerConfig.model || this.defaultModel,
        usage: data.usage
      });

      return {
        content: data.choices[0].message.content,
        model: providerConfig.model || this.defaultModel,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        },
        raw: data
      };
    } catch (error) {
      await this.logger.error('Deepseek completion failed', { error });
      throw error;
    }
  }

  async *completeStream(prompt: string, options: LLMOptions = {}): AsyncGenerator<LLMStreamResponse> {
    // Load configuration
    const config = await chrome.storage.local.get('deepseek_provider_config');
    const providerConfig = config['deepseek_provider_config'];
    
    if (!providerConfig?.apiKey) {
        throw new Error('Deepseek provider not configured. Please provide a valid API key in settings.');
    }

    const requestBody = {
        model: providerConfig.model || this.defaultModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        top_p: options.topP ?? 1,
        frequency_penalty: options.frequencyPenalty ?? 0,
        presence_penalty: options.presencePenalty ?? 0,
        stop: options.stop,
        stream: true
    };

    try {
        const response = await fetch(`${providerConfig.endpoint || this.endpoint}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${providerConfig.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Deepseek API request failed');
        }

        if (!response.body) {
            throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || trimmedLine === 'data: [DONE]') {
                        if (trimmedLine === 'data: [DONE]') {
                            yield { content: '', done: true };
                        }
                        continue;
                    }

                    if (trimmedLine.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(trimmedLine.slice(6));
                            if (data.choices?.[0]?.delta?.content) {
                                yield {
                                    content: data.choices[0].delta.content,
                                    done: false
                                };
                            }
                        } catch (e) {
                            this.logger.error('Failed to parse streaming response', { 
                                error: e,
                                line: trimmedLine
                            });
                        }
                    }
                }
            }

            // Handle any remaining content in the buffer
            if (buffer) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.choices?.[0]?.delta?.content) {
                        yield {
                            content: data.choices[0].delta.content,
                            done: true
                        };
                    }
                } catch (e) {
                    // Ignore parse error for final chunk
                }
            }
        } finally {
            reader.releaseLock();
        }
    } catch (error) {
        await this.logger.error('Deepseek streaming failed', { error });
        throw error;
    }
  }

  getCurrentModel(): string {
    return this.defaultModel; // Return default model since current model is loaded from config
  }

  setModel(model: string): void {
    // Do nothing since model is now loaded from config
  }

  validateApiKey(apiKey: string): boolean {
    return this.API_KEY_PATTERN.test(apiKey);
  }

  validateEndpoint(endpoint: string): boolean {
    return true; // Deepseek doesn't support custom endpoints
  }
}