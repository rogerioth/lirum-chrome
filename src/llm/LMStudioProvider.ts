import { LLMProvider, LLMResponse, LLMOptions } from './LLMProvider';
import { Logger } from '../utils/Logger';

export class LMStudioProvider implements LLMProvider {
  name = 'LM Studio';
  defaultModel = 'local-model';  // LM Studio uses locally loaded models
  availableModels: string[] = [];  // Will be populated when a model is loaded

  private currentModel: string;
  private readonly logger: Logger;
  private baseUrl: string | null = null;
  private readonly DEFAULT_PORT = 1234;

  constructor() {
    this.currentModel = this.defaultModel;
    this.logger = Logger.getInstance();
  }

  async initialize(baseUrl: string): Promise<void> {
    if (!this.validateApiKey(baseUrl)) {
      throw new Error('Invalid LM Studio base URL format');
    }
    this.baseUrl = baseUrl;
    
    // Test connection
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`);
      if (!response.ok) {
        throw new Error('Failed to connect to LM Studio server');
      }
      const data = await response.json();
      this.availableModels = data.data.map((model: any) => model.id);
      
      await this.logger.info('LM Studio provider initialized', {
        availableModels: this.availableModels
      });
    } catch (error) {
      await this.logger.error('LM Studio initialization failed', { error });
      throw new Error('Failed to connect to LM Studio server');
    }
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    if (!this.isInitialized()) {
      throw new Error('LM Studio provider not initialized');
    }

    const requestBody = {
      messages: [{ role: 'user', content: prompt }],
      model: this.currentModel,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      top_p: options.topP ?? 1,
      frequency_penalty: options.frequencyPenalty ?? 0,
      presence_penalty: options.presencePenalty ?? 0,
      stop: options.stop
    };

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
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

  async listAvailableModels(): Promise<string[]> {
    if (!this.isInitialized()) {
      throw new Error('LM Studio provider not initialized');
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/models`);
      if (!response.ok) {
        throw new Error('Failed to fetch available models');
      }

      const data = await response.json();
      this.availableModels = data.data.map((model: any) => model.id);
      return this.availableModels;
    } catch (error) {
      await this.logger.error('Failed to fetch LM Studio models', { error });
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.baseUrl !== null;
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

  validateApiKey(baseUrl: string): boolean {
    try {
      const url = new URL(baseUrl);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  static getDefaultBaseUrl(): string {
    return `http://localhost:${LMStudioProvider.prototype.DEFAULT_PORT}`;
  }
} 