import { LLMProvider, LLMResponse, LLMOptions, LLMStreamResponse } from './LLMProvider';
import { Logger } from '../utils/Logger';

export class OpenAIProvider implements LLMProvider {
  name = 'OpenAI';
  defaultModel = 'gpt-3.5-turbo';
  availableModels = [
    'gpt-4',
    'gpt-4-turbo-preview',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-16k'
  ];

  private apiKey: string | null = null;
  private currentModel: string;
  private readonly logger: Logger;
  private readonly API_URL = 'https://api.openai.com/v1/chat/completions';
  private readonly API_KEY_PATTERN = /^.{5,}$/;
  private readonly STORAGE_KEY = 'openai_provider_state';

  constructor() {
    this.currentModel = this.defaultModel;
    this.logger = Logger.getInstance();
    this.loadState();
  }

  private async loadState(): Promise<void> {
    try {
      const data = await chrome.storage.local.get(this.STORAGE_KEY);
      const state = data[this.STORAGE_KEY];
      if (state) {
        this.apiKey = state.apiKey;
        this.currentModel = state.currentModel || this.defaultModel;
        await this.logger.debug('OpenAI provider state loaded', {
          hasApiKey: Boolean(this.apiKey),
          currentModel: this.currentModel
        });
      }
    } catch (error) {
      await this.logger.error('Failed to load OpenAI provider state', { error });
    }
  }

  private async saveState(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEY]: {
          apiKey: this.apiKey,
          currentModel: this.currentModel
        }
      });
      await this.logger.debug('OpenAI provider state saved', {
        hasApiKey: Boolean(this.apiKey),
        currentModel: this.currentModel
      });
    } catch (error) {
      await this.logger.error('Failed to save OpenAI provider state', { error });
    }
  }

  async test(apiKey?: string, endpoint?: string): Promise<void> {
    if (!apiKey || !this.validateApiKey(apiKey)) {
      throw new Error('Invalid API key format. Key should be at least 5 characters long.');
    }

    // Test the API key with a simple models list request
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to validate API key');
      }

      // Store configuration after successful test
      const config = {
        apiKey,
        model: this.defaultModel
      };

      // Save in both formats for compatibility
      await Promise.all([
        chrome.storage.local.get('providers').then(data => {
          const providers = data.providers || [];
          const existingIndex = providers.findIndex((p: any) => p.type === 'openai');
          
          if (existingIndex >= 0) {
            providers[existingIndex] = { ...providers[existingIndex], ...config };
          } else {
            providers.push({ type: 'openai', name: 'OpenAI', ...config });
          }
          
          return chrome.storage.local.set({ providers });
        }),
        chrome.storage.local.set({ 'openai_provider_config': config })
      ]);

      await this.logger.info('OpenAI provider validated successfully');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI API key validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    await this.loadState();
    if (!this.apiKey) {
      throw new Error('OpenAI provider not configured. Please provide a valid API key in settings.');
    }

    const requestBody = {
      model: this.currentModel,
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
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API request failed');
      }

      const data = await response.json();
      
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from OpenAI API');
      }

      await this.logger.llm('OpenAI completion successful', {
        model: this.currentModel,
        usage: data.usage
      });

      return {
        content: data.choices[0].message.content,
        model: this.currentModel,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        },
        raw: data
      };
    } catch (error) {
      await this.logger.error('OpenAI completion failed', { error });
      throw error;
    }
  }

  async *completeStream(prompt: string, options: LLMOptions = {}): AsyncGenerator<LLMStreamResponse> {
    await this.loadState();
    if (!this.apiKey) {
        throw new Error('OpenAI provider not configured. Please provide a valid API key in settings.');
    }

    const requestBody = {
        model: this.currentModel,
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
        const response = await fetch(this.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API request failed');
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
        await this.logger.error('OpenAI streaming failed', { error });
        throw error;
    }
  }

  getCurrentModel(): string {
    return this.defaultModel; // Return default model since current model is loaded from config
  }

  setModel(model: string): void {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model. Available models: ${this.availableModels.join(', ')}`);
    }
    this.currentModel = model;
    this.saveState().catch(error => {
      this.logger.error('Failed to save model change', { error });
    });
  }

  validateApiKey(apiKey: string): boolean {
    return this.API_KEY_PATTERN.test(apiKey);
  }
}