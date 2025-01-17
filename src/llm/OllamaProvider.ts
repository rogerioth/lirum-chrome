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
    private initialized = false;

    constructor() {
        this.currentModel = this.defaultModel;
        this.logger = Logger.getInstance();
    }

    protected async fetchWithExtension(url: string, options: RequestInit): Promise<Response> {
        const response = await chrome.runtime.sendMessage({
            type: 'fetch',
            url,
            options
        });
        
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(response.headers)
        });
    }

    private getHeaders(): HeadersInit {
        return {
            'Content-Type': 'application/json'
        };
    }

    async initialize(apiKey?: string, endpoint?: string): Promise<void> {
        try {
            this.endpoint = endpoint || this.defaultEndpoint;
            const url = `${this.endpoint}/api/version`;

            await this.logger.info('Testing Ollama endpoint', {
                url,
                method: 'GET',
                headers: this.getHeaders()
            });

            const response = await this.fetchWithExtension(url, {
                method: 'GET',
                headers: this.getHeaders()
            });

            const responseText = await response.text();
            await this.logger.debug('Raw Ollama response', {
                url,
                status: response.status,
                statusText: response.statusText,
                rawResponse: responseText
            });

            if (!response.ok) {
                throw new Error(`Ollama API request failed with status ${response.status}: ${responseText}`);
            }

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                await this.logger.error('Failed to parse Ollama response', {
                    url,
                    status: response.status,
                    rawResponse: responseText,
                    parseError: parseError instanceof Error ? parseError.message : String(parseError)
                });
                throw new Error(`Invalid JSON response from Ollama API: ${responseText}`);
            }

            this.initialized = true;
            await this.logger.info('Ollama endpoint test successful', { version: data.version });

            await this.fetchAvailableModels();
        } catch (error) {
            this.initialized = false;
            this.endpoint = null;
            if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
                throw new Error(`Failed to connect to Ollama endpoint: ${this.endpoint} - Is Ollama running?`);
            }
            throw error;
        }
    }

    private async fetchAvailableModels(): Promise<void> {
        try {
            const url = `${this.endpoint}/api/tags`;
            const response = await this.fetchWithExtension(url, {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data.models)) {
                    this.availableModels = data.models.map(model => model.name);
                    await this.logger.info('Updated available models', { models: this.availableModels });
                }
            }
        } catch (error) {
            await this.logger.info('Failed to fetch available models', { error });
            // Don't throw - just keep default models list
        }
    }

    async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
        try {
            if (!this.endpoint || !this.initialized) {
                throw new Error('Ollama provider not initialized. Please provide a valid endpoint.');
            }

            const url = `${this.endpoint}/api/generate`;
            const requestBody = {
                model: this.currentModel,
                prompt,
                stream: false,
                temperature: options?.temperature ?? 0.7,
                top_p: options?.topP ?? 1,
                stop: options?.stop,
                max_tokens: options?.maxTokens
            };

            await this.logger.info('Sending request to Ollama', {
                url,
                method: 'POST',
                headers: this.getHeaders(),
                body: requestBody
            });

            const response = await this.fetchWithExtension(url, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(requestBody)
            });

            const responseText = await response.text();
            await this.logger.debug('Raw Ollama response', {
                url,
                status: response.status,
                statusText: response.statusText,
                rawResponse: responseText
            });

            if (!response.ok) {
                throw new Error(`Ollama API request failed with status ${response.status}: ${responseText}`);
            }

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                await this.logger.error('Failed to parse Ollama response', {
                    url,
                    status: response.status,
                    rawResponse: responseText,
                    parseError: parseError instanceof Error ? parseError.message : String(parseError)
                });
                throw new Error(`Invalid JSON response from Ollama API: ${responseText}`);
            }

            if (!data.response) {
                throw new Error('Invalid response format from Ollama API: missing response field');
            }

            await this.logger.info('Ollama response received', { data });

            return {
                content: data.response,
                model: this.currentModel,
                usage: {
                    promptTokens: data.prompt_eval_count || 0,
                    completionTokens: data.eval_count || 0,
                    totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
                },
                raw: data
            };
        } catch (error) {
            await this.logger.error('Ollama request failed', { error });
            throw error;
        }
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    getCurrentModel(): string {
        return this.currentModel;
    }

    setModel(model: string): void {
        this.currentModel = model;
    }

    validateEndpoint(endpoint: string): boolean {
        return this.ENDPOINT_PATTERN.test(endpoint);
    }

    validateApiKey(apiKey: string): boolean {
        return true; // Not used for local providers
    }
}
