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

            await this.logger.debug('Raw Ollama response', {
                url,
                status: response.status,
                statusText: response.statusText,
                type: response.type
            });

            // For opaque responses (no-cors mode), we can't read the response
            // but if the status is 0, it means the request was sent successfully
            if (response.type === 'opaque' || response.type === 'opaqueredirect') {
                if (response.status === 0) {
                    return {
                        content: "Request sent successfully, but response cannot be read due to CORS restrictions. The model should be processing your request.",
                        model: this.currentModel,
                        usage: {
                            promptTokens: 0,
                            completionTokens: 0,
                            totalTokens: 0
                        },
                        raw: {}
                    };
                }
                throw new Error('Request failed due to CORS restrictions. Try running Ollama with CORS enabled.');
            }

            const responseText = await response.text();
            if (!response.ok) {
                throw new Error(`Ollama API request failed with status ${response.status}: ${responseText}`);
            }

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (error) {
                await this.logger.error('Failed to parse Ollama response', {
                    url,
                    status: response.status,
                    rawResponse: responseText,
                    error: error instanceof Error ? error.message : String(error)
                });
                throw new Error('Invalid JSON response from Ollama API');
            }

            return {
                content: data.response,
                model: this.currentModel,
                usage: {
                    promptTokens: data.prompt_eval_count,
                    completionTokens: data.eval_count,
                    totalTokens: data.prompt_eval_count + data.eval_count
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
