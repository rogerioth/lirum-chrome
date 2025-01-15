import { LLMProvider, LLMResponse, LLMOptions } from './LLMProvider';
import { Logger } from '../utils/Logger';

export class OllamaProvider implements LLMProvider {
  name = 'Ollama';
  defaultModel = 'llama2';
  availableModels = [
    'llama2',
    'mistral',
    'codellama',
    'phi',
    'neural-chat',
    'starling-lm'
  ];

  private currentModel: string;
  private readonly logger: Logger;
  private baseUrl: string | null = null;
  private readonly DEFAULT_PORT = 11434;

  constructor() {
    this.currentModel = this.defaultModel;
    this.logger = Logger.getInstance();
  }

  async initialize(baseUrl: string): Promise<void> {
    if (!this.validateApiKey(baseUrl)) {
      throw new Error('Invalid Ollama base URL format');
    }
    this.baseUrl = baseUrl;
    
    // Test connection
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error('Failed to connect to Ollama server');
      }
      await this.logger.info('Ollama provider initialized');
    } catch (error) {
      await this.logger.error('Ollama initialization failed', { error });
      throw new Error('Failed to connect to Ollama server');
    }
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    if (!this.isInitialized()) {
      throw new Error('Ollama provider not initialized');
    }

    const requestBody = {
      model: this.currentModel,
      prompt,
      options: {
        temperature: options.temperature ?? 0.7,
        top_p: options.topP ?? 1,
        stop: options.stop
      }
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Ollama API request failed');
      }

      const data = await response.json();
      await this.logger.llm('Ollama completion successful', {
        model: this.currentModel
      });

      // Ollama doesn't provide token usage information
      return {
        content: data.response,
        model: this.currentModel,
        raw: data
      };
    } catch (error) {
      await this.logger.error('Ollama completion failed', { error });
      throw error;
    }
  }

  async listAvailableModels(): Promise<string[]> {
    if (!this.isInitialized()) {
      throw new Error('Ollama provider not initialized');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error('Failed to fetch available models');
      }

      const data = await response.json();
      this.availableModels = data.models.map((model: any) => model.name);
      return this.availableModels;
    } catch (error) {
      await this.logger.error('Failed to fetch Ollama models', { error });
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
    return `http://localhost:${OllamaProvider.prototype.DEFAULT_PORT}`;
  }
} 