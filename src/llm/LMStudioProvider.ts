import { LLMProvider, LLMResponse, LLMOptions, LLMStreamResponse } from './LLMProvider';
import { Logger } from '../utils/Logger';
import { KeyedProvider } from './KeyedProvider';

export class LMStudioProvider extends KeyedProvider implements LLMProvider {
  name = 'LM Studio';
  defaultModel = 'local-model';
  availableModels = ['local-model'];
  defaultEndpoint = 'http://localhost:1234';
  private currentModel: string;
  private endpoint: string | null = null;
  private readonly API_URL = '/v1/chat/completions';
  private readonly ENDPOINT_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
  protected readonly logger: Logger;

  constructor() {
    super();
    this.currentModel = this.defaultModel;
    this.endpoint = this.defaultEndpoint;
    this.logger = Logger.getInstance();
    this.loadState();
  }

  private async loadState(): Promise<void> {
    try {
      const data = await chrome.storage.sync.get('providers');
      const providers = data.providers || [];
      const config = providers.find((p: any) => p.type === 'lmstudio' && p.key === this.key);
      
      if (config) {
        this.endpoint = config.endpoint || this.defaultEndpoint;
        this.currentModel = config.model || this.defaultModel;
        await this.logger.debug('LM Studio provider state loaded', {
          endpoint: this.endpoint,
          currentModel: this.currentModel,
          key: this.key
        });
      }
    } catch (error) {
      await this.logger.error('Failed to load LM Studio provider state', { error });
    }
  }

  private async saveState(): Promise<void> {
    try {
      const data = await chrome.storage.sync.get('providers');
      const providers = data.providers || [];
      const index = providers.findIndex((p: any) => p.type === 'lmstudio' && p.key === this.key);
      
      const config = {
        type: 'lmstudio',
        key: this.key,
        endpoint: this.endpoint,
        model: this.currentModel,
        name: this.name
      };

      if (index >= 0) {
        providers[index] = { ...providers[index], ...config };
      } else {
        providers.push(config);
      }

      await chrome.storage.sync.set({ providers });
      await this.logger.debug('LM Studio provider state saved', {
        endpoint: this.endpoint,
        currentModel: this.currentModel,
        key: this.key
      });
    } catch (error) {
      await this.logger.error('Failed to save LM Studio provider state', { error });
    }
  }

  private getEndpointUrl(path: string): string {
    if (!this.endpoint) {
      throw new Error('Endpoint not configured');
    }
    // Ensure endpoint doesn't end with slash and path starts with slash
    const baseUrl = this.endpoint.replace(/\/+$/, '');
    const cleanPath = path.replace(/^\/+/, '');
    return `${baseUrl}/v1/${cleanPath}`;
  }

  protected async fetchWithExtension(url: string, options: RequestInit): Promise<Response> {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${error}`);
      }
      return response;
    } catch (error) {
      await this.logger.error('LM Studio request failed', { 
        url,
        error: error instanceof Error ? error.message : String(error),
        endpoint: this.endpoint 
      });
      throw error;
    }
  }

  async test(apiKey?: string, endpoint?: string): Promise<void> {
    try {
      const testEndpoint = endpoint || this.defaultEndpoint;
      if (!this.validateEndpoint(testEndpoint)) {
        throw new Error('Invalid endpoint URL format. Please provide a valid HTTP/HTTPS URL.');
      }

      await this.logger.info('Testing LM Studio connection', { endpoint: testEndpoint });

      // Temporarily set endpoint for testing
      const originalEndpoint = this.endpoint;
      this.endpoint = testEndpoint;

      try {
        // Test the endpoint with a simple models list request
        const response = await this.fetchWithExtension(this.getEndpointUrl('models'), {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        await this.logger.info('LM Studio models available', { models: data.data });
      } finally {
        // Restore original endpoint
        this.endpoint = originalEndpoint;
      }

    } catch (error) {
      await this.logger.error('LM Studio test failed', { 
        endpoint: endpoint || this.defaultEndpoint,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    if (!this.endpoint) {
      throw new Error('Endpoint not configured');
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
      const response = await this.fetchWithExtension(this.getEndpointUrl('chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from LM Studio API');
      }

      await this.logger.llm('LM Studio completion successful', {
        model: this.currentModel,
        usage: data.usage
      });

      return {
        content: data.choices[0].message.content,
        model: this.currentModel,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0
        },
        raw: data
      };
    } catch (error) {
      await this.logger.error('LM Studio completion failed', { error });
      throw error;
    }
  }

  async *completeStream(prompt: string, options: LLMOptions = {}): AsyncGenerator<LLMStreamResponse> {
    if (!this.endpoint) {
      throw new Error('Endpoint not configured');
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
      const response = await this.fetchWithExtension(this.getEndpointUrl('chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'LM Studio API request failed');
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
            if (!trimmedLine || trimmedLine === 'data: [DONE]') {
              if (trimmedLine === 'data: [DONE]') {
                yield { content: '', done: true };
                return;
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
                // Check for completion in the delta
                if (data.choices?.[0]?.finish_reason === 'stop') {
                  yield { content: '', done: true };
                  return;
                }
              } catch (e) {
                await this.logger.error('Failed to parse streaming response', { error: e });
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      await this.logger.error('LM Studio streaming failed', { error });
      throw error;
    }
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  setModel(model: string): void {
    this.currentModel = model;
    this.logger.debug('LM Studio model set', { model });
    this.saveState();
  }

  validateEndpoint(endpoint: string): boolean {
    return this.ENDPOINT_PATTERN.test(endpoint);
  }

  setEndpoint(endpoint: string): void {
    if (!this.validateEndpoint(endpoint)) {
      throw new Error('Invalid endpoint URL format');
    }
    this.endpoint = endpoint;
    this.logger.debug('LM Studio endpoint set', { endpoint });
    this.saveState();
  }

  validateApiKey(apiKey: string): boolean {
    return true; // LM Studio doesn't use API keys
  }

  configure(config: { apiKey?: string; model?: string; endpoint?: string }): void {
    if (config.model) {
      this.setModel(config.model);
    }
    if (config.endpoint) {
      this.setEndpoint(config.endpoint);
    }
    // LM Studio doesn't use API keys, so we ignore that config
  }
}