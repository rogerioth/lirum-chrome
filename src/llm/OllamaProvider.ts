import { LLMProvider, LLMResponse, LLMOptions, LLMStreamResponse } from './LLMProvider';
import { Logger } from '../utils/Logger';
import { KeyedProvider } from './KeyedProvider';

export class OllamaProvider extends KeyedProvider implements LLMProvider {
    name = 'Ollama';
    defaultModel = 'llama2';
    availableModels = [
        'llama2',
        'llama2-uncensored',
        'llama2:13b',
        'llama2:70b',
        'codellama',
        'mistral',
        'mixtral',
        'phi',
        'neural-chat',
        'starling-lm'
    ];
    defaultEndpoint = 'http://localhost:11434';
    private currentModel: string;
    private endpoint: string;
    private readonly API_URL = '/api/generate';
    protected readonly logger: Logger;
    private readonly ENDPOINT_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

    constructor() {
        super();
        this.currentModel = this.defaultModel;
        this.endpoint = this.defaultEndpoint;
        this.logger = Logger.getInstance();
    }

    protected async fetchWithExtension(url: string, options: RequestInit): Promise<Response> {
        try {
            const response = await fetch(url, {
                ...options,
                // Add CORS mode and credentials
                mode: 'cors',
                credentials: 'omit'
            });

            if (!response.ok) {
                const error = await response.text();
                await this.logger.error('Ollama request failed', {
                    status: response.status,
                    statusText: response.statusText,
                    error,
                    endpoint: this.endpoint
                });
                throw new Error(`HTTP error! status: ${response.status}, message: ${error}`);
            }

            await this.logger.debug('Ollama request successful', {
                status: response.status,
                endpoint: this.endpoint
            });

            return response;
        } catch (error) {
            await this.logger.error('Ollama network error', { 
                url,
                error: error instanceof Error ? error.message : String(error),
                endpoint: this.endpoint 
            });
            throw new Error(`Failed to connect to Ollama endpoint: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async test(apiKey?: string, endpoint?: string): Promise<void> {
        try {
            const testEndpoint = endpoint || this.defaultEndpoint;
            if (!this.validateEndpoint(testEndpoint)) {
                throw new Error('Invalid endpoint URL format. Please provide a valid HTTP/HTTPS URL.');
            }

            await this.logger.info('Testing Ollama connection', { endpoint: testEndpoint });

            // Test the endpoint with a simple models list request
            const response = await this.fetchWithExtension(`${testEndpoint}/api/tags`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();
            await this.logger.info('Ollama models available', { models: data.models });

        } catch (error) {
            await this.logger.error('Ollama test failed', { 
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
        await this.logger.debug('Ollama request config', { 
            endpoint: this.endpoint,
            model,
            options
        });

        try {
            const response = await this.fetchWithExtension(`${this.endpoint}${this.API_URL}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    prompt,
                    stream: false,
                    temperature: options.temperature || 0.7,
                    top_p: 1,
                    max_tokens: options.maxTokens || 1000
                })
            });

            const data = await response.json();
            return {
                content: data.response,
                model,
                usage: {
                    promptTokens: data.prompt_eval_count || 0,
                    completionTokens: data.eval_count || 0,
                    totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
                },
                raw: data
            };
        } catch (error) {
            await this.logger.error('Ollama completion failed', { 
                endpoint: this.endpoint,
                model,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async *completeStream(prompt: string, options: LLMOptions = {}): AsyncGenerator<LLMStreamResponse> {
        if (!this.endpoint) {
            throw new Error('Endpoint not configured');
        }

        const model = this.currentModel;
        await this.logger.debug('Ollama streaming request config', { 
            endpoint: this.endpoint,
            model,
            options
        });

        try {
            const response = await this.fetchWithExtension(`${this.endpoint}${this.API_URL}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    prompt,
                    stream: true,
                    temperature: options.temperature ?? 0.7,
                    top_p: 1,
                    max_tokens: options.maxTokens || 1000
                })
            });

            if (!response.body) {
                throw new Error('Response body is null');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let hasReceivedContent = false;

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    
                    if (done) {
                        if (!hasReceivedContent) {
                            await this.logger.error('Stream completed without content', {
                                model,
                                endpoint: this.endpoint
                            });
                            throw new Error('Stream completed without receiving any content');
                        }
                        yield { content: '', done: true };
                        break;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) continue;

                        try {
                            const data = JSON.parse(trimmedLine);
                            await this.logger.debug('Ollama stream chunk', {
                                responseLength: data.response?.length || 0,
                                done: data.done || false
                            });

                            if (data.response) {
                                hasReceivedContent = true;
                                yield {
                                    content: data.response,
                                    done: false
                                };
                            }

                            if (data.done === true) {
                                if (!hasReceivedContent) {
                                    await this.logger.error('Ollama returned done without content', {
                                        model,
                                        endpoint: this.endpoint
                                    });
                                    throw new Error('Ollama returned done without providing any content');
                                }
                                yield { content: '', done: true };
                                return;
                            }
                        } catch (e) {
                            await this.logger.error('Failed to parse Ollama stream chunk', { 
                                error: e instanceof Error ? e.message : String(e),
                                line: trimmedLine,
                                model,
                                endpoint: this.endpoint
                            });
                            throw e;
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }
        } catch (error) {
            await this.logger.error('Ollama streaming failed', { 
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

    private validateEndpoint(endpoint: string): boolean {
        return this.ENDPOINT_PATTERN.test(endpoint);
    }

    configure(config: { apiKey?: string; model?: string; endpoint?: string }): void {
        if (config.model) {
            this.currentModel = config.model;
        }
        if (config.endpoint) {
            if (!this.validateEndpoint(config.endpoint)) {
                throw new Error('Invalid endpoint URL format');
            }
            this.endpoint = config.endpoint;
        }
    }
}
