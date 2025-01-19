import { LLMProvider, LLMResponse, LLMOptions, LLMStreamResponse } from './LLMProvider';
import { Logger } from '../utils/Logger';
import { KeyedProvider } from './KeyedProvider';

export class AnthropicProvider extends KeyedProvider implements LLMProvider {
  name = 'Anthropic';
  defaultModel = 'claude-3-5-sonnet-latest';
  availableModels = [
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
    'claude-3-opus-latest',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-haiku-20240307'
  ];

  defaultEndpoint = 'https://api.anthropic.com';

  private currentModel: string;
  protected readonly logger: Logger;
  private readonly API_URL = 'https://api.anthropic.com/v1/messages';
  private readonly API_VERSION = '2023-06-01';
  private readonly API_KEY_PATTERN = /^.{5,}$/;
  private readonly ENDPOINT_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

  private apiKey: string | null = null;
  private endpoint: string = this.defaultEndpoint;

  constructor() {
    super();
    this.currentModel = this.defaultModel;
    this.logger = Logger.getInstance();
    this.loadState();
  }

  private async loadState(): Promise<void> {
    try {
      const data = await chrome.storage.local.get(this.getStorageKey('anthropic'));
      const state = data[this.getStorageKey('anthropic')];
      if (state) {
        this.apiKey = state.apiKey;
        this.currentModel = state.model || this.defaultModel;
        this.endpoint = state.endpoint || this.defaultEndpoint;
        await this.logger.debug('Anthropic provider state loaded', {
          currentModel: this.currentModel,
          key: this.key
        });
      }
    } catch (error) {
      await this.logger.error('Failed to load Anthropic provider state', { error });
    }
  }

  private async saveState(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [this.getStorageKey('anthropic')]: {
          apiKey: this.apiKey,
          model: this.currentModel,
          endpoint: this.endpoint
        }
      });
      await this.logger.debug('Anthropic provider state saved', {
        currentModel: this.currentModel,
        key: this.key
      });
    } catch (error) {
      await this.logger.error('Failed to save Anthropic provider state', { error });
    }
  }

  async test(apiKey?: string, endpoint?: string): Promise<void> {
    if (!apiKey || !this.validateApiKey(apiKey)) {
      throw new Error('Invalid API key format. Key should be at least 5 characters long.');
    }

    // Test the API key with a simple models list request
    try {
      const response = await fetch(`${endpoint}/v1/models`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': this.API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to validate API key');
      }

      await this.logger.info('Anthropic provider validated successfully');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Anthropic API key validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    // Load configuration
    if (!this.apiKey) {
      throw new Error('Anthropic provider not configured. Please provide a valid API key in settings.');
    }

    const requestBody = {
      model: this.currentModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1,
      stop_sequences: options.stop,
      stream: false
    };

    try {
      const response = await fetch(`${this.endpoint}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Anthropic API request failed');
      }

      const data = await response.json();
      
      if (!data.content?.[0]?.text) {
        throw new Error('Invalid response format from Anthropic API');
      }

      await this.logger.llm('Anthropic completion successful', {
        model: this.currentModel,
        usage: data.usage
      });

      return {
        content: data.content[0].text,
        model: this.currentModel,
        usage: {
          promptTokens: data.usage?.input_tokens ?? 0,
          completionTokens: data.usage?.output_tokens ?? 0,
          totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
        },
        raw: data
      };
    } catch (error) {
      await this.logger.error('Anthropic completion failed', { error });
      throw error;
    }
  }

  async *completeStream(prompt: string, options: LLMOptions = {}): AsyncGenerator<LLMStreamResponse> {
    // Load configuration
    if (!this.apiKey) {
      throw new Error('Anthropic provider not configured. Please provide a valid API key in settings.');
    }

    const requestBody = {
      model: this.currentModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1,
      stop_sequences: options.stop,
      stream: true
    };

    try {
      const response = await fetch(`${this.endpoint}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Anthropic API request failed');
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
            if (!trimmedLine) continue;

            // Handle stream end event
            if (trimmedLine === 'event: done' || trimmedLine === 'data: [DONE]') {
              yield { content: '', done: true };
              return;
            }

            if (trimmedLine.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmedLine.slice(6));
                if (data.type === 'content_block_delta' && data.delta?.text) {
                  yield {
                    content: data.delta.text,
                    done: false
                  };
                } else if (data.type === 'message_stop') {
                  yield { content: '', done: true };
                  return;
                }
              } catch (e) {
                this.logger.error('Failed to parse streaming response', { error: e });
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      await this.logger.error('Anthropic streaming failed', { error });
      yield { content: '', done: true };
      throw error;
    }
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  setApiKey(apiKey: string): void {
    if (!this.validateApiKey(apiKey)) {
      throw new Error('Invalid API key format');
    }
    this.apiKey = apiKey;
    this.logger.debug('Anthropic API key set');
    this.saveState();
  }

  setModel(model: string): void {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model. Available models: ${this.availableModels.join(', ')}`);
    }
    this.currentModel = model;
    this.logger.debug('Anthropic model set', { model });
    this.saveState();
  }

  setEndpoint(endpoint: string): void {
    if (!this.validateEndpoint(endpoint)) {
      throw new Error('Invalid endpoint URL format');
    }
    this.endpoint = endpoint;
    this.logger.debug('Anthropic endpoint set', { endpoint });
    this.saveState();
  }

  validateApiKey(apiKey: string): boolean {
    return this.API_KEY_PATTERN.test(apiKey);
  }

  validateEndpoint(endpoint: string): boolean {
    return this.ENDPOINT_PATTERN.test(endpoint);
  }
}