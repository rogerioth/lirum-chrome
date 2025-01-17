import { LLMProvider, LLMResponse, LLMOptions } from './LLMProvider';
import { Logger } from '../utils/Logger';

export class DeepseekProvider implements LLMProvider {
  name = 'Deepseek';
  defaultModel = 'deepseek-chat';
  availableModels = ['deepseek-chat', 'deepseek-coder'];

  private apiKey: string | null = null;
  private currentModel: string;
  private readonly logger: Logger;
  private readonly API_URL = 'https://api.deepseek.com/v1/chat/completions';
  private readonly API_KEY_PATTERN = /^.{5,}$/;

  private readonly STORAGE_KEY = 'deepseek_provider_state';
  private endpoint: string = 'https://api.deepseek.com';

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
        this.endpoint = state.endpoint || this.endpoint;
        this.currentModel = state.currentModel || this.defaultModel;
        await this.logger.debug('Deepseek provider state loaded', {
          hasApiKey: Boolean(this.apiKey),
          endpoint: this.endpoint,
          currentModel: this.currentModel
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
          apiKey: this.apiKey,
          endpoint: this.endpoint,
          currentModel: this.currentModel
        }
      });
      await this.logger.debug('Deepseek provider state saved', {
        hasApiKey: Boolean(this.apiKey),
        endpoint: this.endpoint,
        currentModel: this.currentModel
      });
    } catch (error) {
      await this.logger.error('Failed to save Deepseek provider state', { error });
    }
  }

  async initialize(apiKey?: string, endpoint?: string): Promise<void> {
    if (!apiKey || !this.validateApiKey(apiKey)) {
      throw new Error('Invalid API key format. Key should be at least 5 characters long.');
    }

    if (endpoint) {
      if (!this.validateEndpoint(endpoint)) {
        throw new Error('Invalid endpoint URL format. Please provide a valid HTTP/HTTPS URL.');
      }
      this.endpoint = endpoint;
    }

    // Test the API key with a simple models list request
    try {
      const response = await fetch(`${this.endpoint}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to validate API key');
      }

      this.apiKey = apiKey;
      await this.saveState();
      await this.logger.info('Deepseek provider initialized');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Deepseek API key validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    if (!this.isInitialized()) {
      // Try to load state one more time
      await this.loadState();
      if (!this.isInitialized()) {
        throw new Error('Deepseek provider not initialized. Please provide a valid API key.');
      }
    }

    const requestBody = {
      model: this.currentModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1,
      stop: options.stop
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
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0
        },
        raw: data
      };
    } catch (error) {
      await this.logger.error('Deepseek completion failed', { error });
      throw error;
    }
  }

  isInitialized(): boolean {
    return Boolean(this.apiKey);
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  setModel(model: string): void {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model. Available models: ${this.availableModels.join(', ')}`);
    }
    this.currentModel = model;
    this.saveState();
  }

  validateApiKey(apiKey: string): boolean {
    return this.API_KEY_PATTERN.test(apiKey);
  }

  validateEndpoint(endpoint: string): boolean {
    return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(endpoint);
  }
}