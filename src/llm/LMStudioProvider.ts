import { LLMProvider, LLMResponse, LLMOptions } from './LLMProvider';
import { Logger } from '../utils/Logger';

export class LMStudioProvider implements LLMProvider {
  name = 'LM Studio';
  defaultModel = 'local-model';
  availableModels = ['local-model'];
  defaultEndpoint = 'http://localhost:1234/v1';

  private endpoint: string | null = null;
  private currentModel: string;
  private readonly logger: Logger;
  private readonly ENDPOINT_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

  constructor() {
    this.currentModel = this.defaultModel;
    this.logger = Logger.getInstance();
  }

  async initialize(endpoint: string = this.defaultEndpoint): Promise<void> {
    if (!this.validateEndpoint(endpoint)) {
      throw new Error('Invalid endpoint URL format. Please provide a valid HTTP/HTTPS URL.');
    }

    // Test the endpoint with a simple health check
    try {
      const response = await fetch(`${endpoint}/models`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to validate endpoint');
      }

      this.endpoint = endpoint;
      await this.logger.info('LM Studio provider initialized');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`LM Studio endpoint validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    if (!this.isInitialized()) {
      throw new Error('LM Studio provider not initialized. Please provide a valid endpoint.');
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
      const response = await fetch(`${this.endpoint}/chat/completions`, {
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

      const data = await response.json();
      
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from LM Studio API');
      }

      await this.logger.llm('LM Studio completion successful', {
        model: this.currentModel
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

  isInitialized(): boolean {
    return this.endpoint !== null;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  setModel(model: string): void {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model. Available models: ${this.availableModels.join(', ')}`);
    }
    this.currentModel = model;
  }

  validateEndpoint(endpoint: string): boolean {
    return this.ENDPOINT_PATTERN.test(endpoint);
  }

  validateApiKey(apiKey: string): boolean {
    return true; // Not used for local providers
  }
} 