import { LLMProvider, LLMResponse, LLMOptions } from './LLMProvider';
import { Logger } from '../utils/Logger';

export class LMStudioProvider implements LLMProvider {
  name = 'LM Studio';
  defaultModel = 'local-model';
  availableModels = ['local-model'];
  defaultEndpoint = 'http://localhost:1234';

  private endpoint: string | null = null;
  private currentModel: string;
  private readonly logger: Logger;
  private readonly ENDPOINT_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

  constructor() {
    this.currentModel = this.defaultModel;
    this.logger = Logger.getInstance();
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

    const model = this.currentModel;
    await this.logger.debug('LM Studio request config', { 
      endpoint: this.endpoint,
      model,
      options
    });

    const requestBody = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 1000,
      top_p: 1,
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

      let data;
      try {
        data = await response.json();
      } catch (e) {
        // Log the raw response if JSON parsing fails
        const rawText = await response.text();
        await this.logger.error('Failed to parse LM Studio response', {
          rawResponse: rawText,
          error: e instanceof Error ? e.message : String(e)
        });
        throw new Error('Invalid JSON response from LM Studio API');
      }

      // Log the full response for debugging
      const headerObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headerObj[key] = value;
      });

      await this.logger.debug('LM Studio raw response', { 
        data,
        statusCode: response.status,
        headers: headerObj
      });

      if (!data.choices?.[0]?.message?.content) {
        await this.logger.error('Invalid LM Studio response format', { response: data });
        throw new Error('Invalid response format from LM Studio API');
      }

      return {
        content: data.choices[0].message.content,
        model,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0
        },
        raw: data
      };
    } catch (error) {
      await this.logger.error('LM Studio completion failed', { 
        endpoint: this.endpoint,
        model,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  setModel(model: string): void {
    this.currentModel = model;
    this.logger.debug('LM Studio model set', { model });
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
  }
}