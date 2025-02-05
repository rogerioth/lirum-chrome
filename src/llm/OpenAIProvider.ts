import { LLMProvider, LLMResponse, LLMOptions, LLMStreamResponse } from './LLMProvider';
import { Logger } from '../utils/Logger';
import { KeyedProvider } from './KeyedProvider';

export class OpenAIProvider extends KeyedProvider implements LLMProvider {
  name = 'OpenAI';
  defaultModel = 'gpt-4o-mini-latest';
  availableModels = [
    'gpt-4o-latest',
    'gpt-4o-mini-latest',
    'gpt-4-turbo-latest',
    'gpt-3.5-turbo-latest',
    'gpt-4o-2024-10-21',
    'gpt-4o-mini-2024-10-21',
    'gpt-4-turbo-2024-10-21',
    'gpt-3.5-turbo-2024-10-21'
  ];

  defaultEndpoint = 'https://api.openai.com';

  private apiKey: string | null = null;
  private currentModel: string;
  private endpoint: string;
  protected readonly logger: Logger;
  private readonly API_KEY_PATTERN = /^.{5,}$/;
  private readonly ENDPOINT_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

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
      await this.logger.info('Testing OpenAI connection', { endpoint: testEndpoint });

      const response = await fetch(`${testEndpoint}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to validate API key');
      }

      const data = await response.json();
      
      // Update endpoint if test was successful
      if (endpoint) {
        this.endpoint = endpoint;
      }

      // Update available models from the server
      if (data.data) {
        this.availableModels = data.data.map((m: any) => m.id);
      }

      await this.logger.info('OpenAI models available', { 
        modelCount: data.data?.length,
        models: this.availableModels.slice(0, 5)
      });

    } catch (error) {
      await this.logger.error('OpenAI test failed', { 
        endpoint: endpoint || this.defaultEndpoint,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
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

    await this.logger.debug('OpenAI provider configured', {
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