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

    async test(apiKey?: string, endpoint?: string): Promise<void> {
        try {
            const testEndpoint = endpoint || this.defaultEndpoint;
            if (!this.validateEndpoint(testEndpoint)) {
                throw new Error('Invalid endpoint URL format. Please provide a valid HTTP/HTTPS URL.');
            }

            // Test the endpoint with a simple models list request
            const response = await this.fetchWithExtension(`${testEndpoint}/api/tags`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Failed to validate endpoint');
            }

            await this.logger.info('Ollama provider validated successfully');
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Ollama endpoint validation failed: ${error.message}`);
            }
            throw error;
        }
    }

    async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
        // Load configuration
        const config = await chrome.storage.local.get('ollama_provider_config');
        const providerConfig = config['ollama_provider_config'];
        
        if (!providerConfig?.endpoint) {
            throw new Error('Ollama provider not configured. Please configure the endpoint in settings.');
        }

        const requestBody = {
            model: providerConfig.model || this.defaultModel,
            prompt,
            stream: false,
            temperature: options.temperature ?? 0.7,
            top_p: options.topP ?? 1,
            stop: options.stop,
            max_tokens: options.maxTokens
        };

        const url = `${providerConfig.endpoint}/api/generate`;

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
                    model: providerConfig.model || this.defaultModel,
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
            model: providerConfig.model || this.defaultModel,
            usage: {
                promptTokens: data.prompt_eval_count,
                completionTokens: data.eval_count,
                totalTokens: data.prompt_eval_count + data.eval_count
            },
            raw: data
        };
    }

    getCurrentModel(): string {
        return this.defaultModel; // Return default model since current model is loaded from config
    }

    setModel(model: string): void {
        // Do nothing since the model is now loaded from the configuration
    }

    validateEndpoint(endpoint: string): boolean {
        return this.ENDPOINT_PATTERN.test(endpoint);
    }

    validateApiKey(apiKey: string): boolean {
        return true; // Not used for local providers
    }
}
