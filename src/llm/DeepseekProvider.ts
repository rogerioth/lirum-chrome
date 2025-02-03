import { LLMProvider, LLMResponse, LLMOptions, LLMStreamResponse } from './LLMProvider';
import { Logger } from '../utils/Logger';
import { KeyedProvider } from './KeyedProvider';

export class DeepseekProvider extends KeyedProvider implements LLMProvider {
  name = 'Deepseek';
  defaultModel = 'deepseek-chat';
  availableModels = ['deepseek-chat', 'deepseek-coder'];
  defaultEndpoint = 'https://api.deepseek.com';

  protected readonly logger: Logger;
  private readonly API_KEY_PATTERN = /^.{5,}$/;
  private readonly ENDPOINT_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

  private apiKey: string | null = null;
  private currentModel: string;
  private endpoint: string;

  constructor() {
    super();
    this.currentModel = this.defaultModel;
    this.endpoint = this.defaultEndpoint;
    this.logger = Logger.getInstance();
  }

  async test(apiKey?: string, endpoint?: string): Promise<void> {
    if (!apiKey || !this.validateApiKey(apiKey)) {
      throw new Error('Invalid API key format. Key should be at least 5 characters long.');
    }

    const testEndpoint = endpoint || this.defaultEndpoint;
    if (!this.validateEndpoint(testEndpoint)) {
      throw new Error('Invalid endpoint URL format');
    }

    // Test the API key with a simple models list request
    try {
      await this.logger.info('Testing Deepseek connection', { endpoint: testEndpoint });

      const response = await fetch(`${testEndpoint}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to validate API key');
      }

      // Update endpoint if test was successful
      if (endpoint) {
        this.endpoint = endpoint;
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
    if (!this.apiKey) {
      throw new Error('Deepseek provider not configured. Please provide a valid API key in settings.');
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
      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
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
      await this.logger.error('Deepseek completion failed', { error });
      throw error;
    }
  }

  async *completeStream(prompt: string, options: LLMOptions = {}): AsyncGenerator<LLMStreamResponse> {
    if (!this.apiKey) {
      throw new Error('Deepseek provider not configured. Please provide a valid API key in settings.');
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
      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
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
            yield { content: '', done: true };
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

            try {
              const data = JSON.parse(trimmedLine.slice(6));
              const choice = data.choices?.[0];
              
              // Send content if available
              if (choice?.delta?.content) {
                yield {
                  content: choice.delta.content,
                  done: false
                };
              }
              
              // Check if this is the final message with a finish_reason
              if (choice?.finish_reason) {
                yield { content: '', done: true };
                return;
              }
            } catch (e) {
              this.logger.error('Failed to parse streaming response', { 
                error: e,
                line: trimmedLine
              });
            }
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

  async configure(config: { apiKey?: string; model?: string; endpoint?: string }): Promise<void> {
    if (config.apiKey) {
      if (!this.validateApiKey(config.apiKey)) {
        throw new Error('Invalid API key format. Key should be at least 5 characters long.');
      }
      this.apiKey = config.apiKey;
    }

    if (config.model) {
      this.validateModel(config.model, this.availableModels);
      this.currentModel = config.model;
    }

    if (config.endpoint) {
      if (!this.validateEndpoint(config.endpoint)) {
        throw new Error('Invalid endpoint URL format');
      }
      this.endpoint = config.endpoint;
    }

    await this.logger.debug('Deepseek provider configured', {
      hasKey: !!this.apiKey,
      model: this.currentModel,
      endpoint: this.endpoint
    });
  }

  private validateApiKey(apiKey: string): boolean {
    return this.API_KEY_PATTERN.test(apiKey);
  }

  private validateEndpoint(endpoint: string): boolean {
    return this.ENDPOINT_PATTERN.test(endpoint);
  }
}