import { LLMProvider, LLMResponse, LLMOptions } from './LLMProvider';
import { Logger } from '../utils/Logger';

export class LMStudioProvider implements LLMProvider {
  name = 'LM Studio';
  defaultModel = 'local-model';
  availableModels = ['local-model'];
  defaultEndpoint = 'http://localhost:1234/v1';

  private currentModel: string;
  private readonly logger: Logger;
  private readonly ENDPOINT_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

  constructor() {
    this.currentModel = this.defaultModel;
    this.logger = Logger.getInstance();
  }

  async test(apiKey?: string, endpoint?: string): Promise<void> {
    try {
      const testEndpoint = endpoint || this.defaultEndpoint;
      if (!this.validateEndpoint(testEndpoint)) {
        throw new Error('Invalid endpoint URL format. Please provide a valid HTTP/HTTPS URL.');
      }

      // Test the endpoint with a simple models list request
      const response = await fetch(`${testEndpoint}/models`, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to validate endpoint');
      }

      await this.logger.info('LM Studio provider validated successfully');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`LM Studio endpoint validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    // Load configuration
    const config = await chrome.storage.local.get('lmstudio_provider_config');
    const providerConfig = config['lmstudio_provider_config'];
    
    if (!providerConfig?.endpoint) {
      throw new Error('LM Studio provider not configured. Please configure the endpoint in settings.');
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
      const response = await fetch(`${providerConfig.endpoint}/chat/completions`, {
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

  getCurrentModel(): string {
    return this.defaultModel; // Return default model since current model is loaded from config
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

  private getHeaders(): { [key: string]: string } {
    return {
      'Content-Type': 'application/json'
    };
  }
} 