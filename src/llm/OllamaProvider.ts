import { LLMProvider, LLMResponse, LLMOptions } from './LLMProvider';
import { Logger } from '../utils/Logger';

export class OllamaProvider implements LLMProvider {
  name = 'Ollama';
  defaultModel = 'llama2';
  availableModels = [
    'llama2',
    'codellama',
    'mistral',
    'mixtral',
    'phi',
    'neural-chat',
    'starling-lm'
  ];
  defaultEndpoint = 'http://localhost:11434';

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
      const response = await fetch(`${endpoint}/api/tags`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to validate endpoint');
      }

      this.endpoint = endpoint;
      await this.logger.info('Ollama provider initialized');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Ollama endpoint validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    if (!this.isInitialized()) {
      throw new Error('Ollama provider not initialized. Please provide a valid endpoint.');
    }

    const requestBody = {
      model: this.currentModel,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: {
        num_predict: options.maxTokens,
        temperature: options.temperature ?? 0.7,
        top_p: options.topP ?? 1,
        stop: options.stop
      }
    };

    try {
      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Ollama API request failed');
      }

      const data = await response.json();
      
      if (!data.message?.content) {
        throw new Error('Invalid response format from Ollama API');
      }

      await this.logger.llm('Ollama completion successful', {
        model: this.currentModel,
        usage: data.timings
      });

      return {
        content: data.message.content,
        model: this.currentModel,
        usage: {
          promptTokens: data.timings?.prompt_tokens ?? 0,
          completionTokens: data.timings?.completion_tokens ?? 0,
          totalTokens: (data.timings?.prompt_tokens ?? 0) + (data.timings?.completion_tokens ?? 0)
        },
        raw: data
      };
    } catch (error) {
      await this.logger.error('Ollama completion failed', { error });
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