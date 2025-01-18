import { LLMProvider, LLMResponse, LLMOptions } from './LLMProvider';
import { Logger } from '../utils/Logger';

export class AnthropicProvider implements LLMProvider {
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

  private currentModel: string;
  private readonly logger: Logger;
  private readonly API_URL = 'https://api.anthropic.com/v1/messages';
  private readonly API_VERSION = '2023-06-01';
  private readonly API_KEY_PATTERN = /^.{5,}$/;

  constructor() {
    this.currentModel = this.defaultModel;
    this.logger = Logger.getInstance();
  }

  async test(apiKey?: string, endpoint?: string): Promise<void> {
    if (!apiKey || !this.validateApiKey(apiKey)) {
      throw new Error('Invalid API key format. Key should be at least 5 characters long.');
    }

    // Test the API key with a simple models list request
    try {
      const response = await fetch('https://api.anthropic.com/v1/models', {
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
    const config = await chrome.storage.local.get('anthropic_provider_config');
    const providerConfig = config['anthropic_provider_config'];
    
    if (!providerConfig?.apiKey) {
      throw new Error('Anthropic provider not configured. Please provide a valid API key in settings.');
    }

    const requestBody = {
      model: this.currentModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1,
      stop_sequences: options.stop
    };

    try {
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': providerConfig.apiKey,
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

  getCurrentModel(): string {
    return this.defaultModel; // Return default model since current model is loaded from config
  }

  setModel(model: string): void {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model. Available models: ${this.availableModels.join(', ')}`);
    }
    this.currentModel = model;
  }

  validateApiKey(apiKey: string): boolean {
    return this.API_KEY_PATTERN.test(apiKey);
  }
} 