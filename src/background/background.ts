import { LLMProviderFactory, ProviderType } from '../llm/LLMProviderFactory';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

interface StoredProviderData {
    type: ProviderType;
    apiKey?: string;
    endpoint?: string;
    name?: string;
    model?: string;
}

interface StoredProviderConfig {
    apiKey?: string;
    endpoint?: string;
    name?: string;
}

interface StoredConfig {
    providers: StoredProviderData[] | Record<ProviderType, StoredProviderConfig>;
    defaultProvider: ProviderType;
}

// Convert array format to object format
function normalizeProviderData(data: any): Record<ProviderType, StoredProviderConfig> {
    if (Array.isArray(data)) {
        return data.reduce<Record<ProviderType, StoredProviderConfig>>((acc, provider) => ({

            ...acc,
            [provider.type]: {
                apiKey: provider.apiKey,
                endpoint: provider.endpoint,
                name: provider.name
            }
        }), {} as Record<ProviderType, StoredProviderConfig>);
    }
    return data || {};
}

const getPromptForCommand = (command: string, content: string): string => {
    switch (command) {
        case 'Summarize':
            return `Please provide a concise summary of the following text. Format your response in markdown, using appropriate headings, bullet points, or emphasis where relevant:\n\n${content}`;
        case 'Paraphrase':
            return `Please rewrite the following text in a different way while maintaining its meaning. Format your response in markdown, using appropriate styling where it enhances readability:\n\n${content}`;
        case 'Bullet Points':
            return `Please convert the following text into a well-organized list of key points. Use markdown formatting with proper bullet points, sub-points, and emphasis where appropriate:\n\n${content}`;
        case 'Translate':
            return `Please translate the following text to English (if not already in English) or to Spanish (if already in English). Format your response in markdown, with the translation and any notes properly styled:\n\n${content}`;
        case 'Analyze Tone':
            return `Please analyze the tone, style, and emotional content of the following text. Format your response in markdown, using headings for different aspects and appropriate formatting for examples and emphasis:\n\n${content}`;
        default:
            return `Please ${command.toLowerCase()} the following text. Format your response in markdown:\n\n${content}`;
    }
};

// Handle content processing
async function processContent(
    provider: ProviderType,
    command: string,
    content: string,
    title: string,
    port?: chrome.runtime.Port,
    config?: {
        apiKey?: string;
        endpoint?: string;
        model?: string;
    }
): Promise<{ content: string }> {
    const requestId = Math.random().toString(36).substring(7);
    
    await logger.info('Processing content request', {
        requestId,
        provider,
        command,
        contentLength: content.length,
        titleLength: title.length,
        contentPreview: content.slice(0, 100),
        isStreaming: Boolean(port)
    });

    try {
        // Get provider instance
        const llmProvider = LLMProviderFactory.getProvider(provider);
        
        // Use provided config or get from storage
        let providerConfig = config;
        if (!providerConfig) {
            const data = await chrome.storage.sync.get('providers');
            const providers = data.providers || [];
            providerConfig = providers.find((p: any) => p.type === provider);
        }
        
        if (!providerConfig) {
            const error = `Provider ${provider} is not configured. Please go to extension settings and configure the provider.`;
            await logger.error('Provider not configured', { 
                requestId,
                provider,
                error
            });
            throw new Error(error);
        }

        await logger.debug('Provider status', {
            requestId,
            provider,
            config: {
                name: providerConfig.name,
                hasApiKey: Boolean(providerConfig.apiKey),
                hasEndpoint: Boolean(providerConfig.endpoint),
                model: providerConfig.model,
                endpoint: providerConfig.endpoint
            }
        });

        // Configure the provider with provided settings
        try {
            llmProvider.configure({
                apiKey: providerConfig.apiKey,
                model: providerConfig.model,
                endpoint: providerConfig.endpoint
            });
        } catch (error) {
            await logger.error('Failed to configure provider', {
                requestId,
                provider,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }

        // Check if we have the required configuration
        if (!providerConfig.apiKey && !providerConfig.endpoint) {
            const error = `Provider ${provider} is missing required configuration. ${
                provider === 'openai' || provider === 'anthropic' || provider === 'deepseek' 
                    ? 'Please configure an API key in the extension settings.'
                    : 'Please configure a valid endpoint in the extension settings.'
            }`;
            await logger.error('Invalid provider configuration', {
                requestId,
                provider,
                error,
                hasApiKey: Boolean(providerConfig.apiKey),
                hasEndpoint: Boolean(providerConfig.endpoint)
            });
            throw new Error(error);
        }

        const prompt = getPromptForCommand(command, content);

        try {
            await logger.debug('Sending prompt to provider', { 
                requestId,
                provider,
                prompt,
                model: llmProvider.getCurrentModel(),
                options: {
                    temperature: 0.7,
                    maxTokens: 1000,
                    stream: Boolean(port)
                }
            });

            if (port) {
                // Handle streaming response
                let fullContent = '';
                let hasReceivedContent = false;
                let chunkCount = 0;
                let retryCount = 0;
                const MAX_RETRIES = 2;

                const attemptStream = async () => {
                    await logger.debug('Starting stream attempt', {
                        requestId,
                        provider,
                        model: llmProvider.getCurrentModel(),
                        attempt: retryCount + 1
                    });

                    // For Ollama, verify the endpoint is responding before streaming
                    if (provider === 'ollama') {
                        try {
                            const response = await fetch(`${providerConfig.endpoint}/api/version`);
                            if (!response.ok) {
                                throw new Error(`Ollama endpoint check failed: ${response.status} ${response.statusText}`);
                            }
                            const version = await response.json();
                            await logger.debug('Ollama endpoint check successful', {
                                requestId,
                                version
                            });
                        } catch (error) {
                            await logger.error('Ollama endpoint check failed', {
                                requestId,
                                endpoint: providerConfig.endpoint,
                                error: error instanceof Error ? error.message : String(error)
                            });
                            throw new Error(`Failed to connect to Ollama endpoint: ${error instanceof Error ? error.message : String(error)}`);
                        }
                    }

                    const stream = llmProvider.completeStream(prompt, {
                        temperature: 0.7,
                        maxTokens: 1000,
                        stream: true
                    });

                    for await (const chunk of stream) {
                        chunkCount++;
                        
                        await logger.debug('Stream chunk received', {
                            requestId,
                            provider,
                            chunkNumber: chunkCount,
                            hasContent: Boolean(chunk?.content),
                            isDone: Boolean(chunk?.done),
                            chunkContent: chunk?.content?.slice(0, 50),
                            chunkDetails: JSON.stringify(chunk).slice(0, 200) // Log raw chunk for debugging
                        });

                        if (!chunk) {
                            await logger.error('Empty chunk received', {
                                requestId,
                                provider,
                                chunkNumber: chunkCount,
                                fullContentLength: fullContent.length
                            });
                            continue;
                        }

                        if (chunk.content) {
                            hasReceivedContent = true;
                            fullContent += chunk.content;
                            port.postMessage({ type: 'STREAM_CHUNK', content: chunk.content, done: chunk.done });

                            if (fullContent.length % 500 === 0) {
                                await logger.debug('Streaming progress', {
                                    requestId,
                                    provider,
                                    contentLength: fullContent.length,
                                    chunkCount
                                });
                            }
                        }

                        if (chunk.done) {
                            await logger.debug('Stream done signal received', {
                                requestId,
                                provider,
                                hasReceivedContent,
                                totalChunks: chunkCount,
                                finalContentLength: fullContent.length
                            });

                            // For Ollama, if we get a done signal without content on first chunk, retry
                            if (!hasReceivedContent && chunkCount === 1 && provider === 'ollama' && retryCount < MAX_RETRIES) {
                                retryCount++;
                                await logger.info('Retrying Ollama stream due to empty response', {
                                    requestId,
                                    attempt: retryCount,
                                    maxRetries: MAX_RETRIES
                                });
                                return attemptStream();
                            }

                            if (!hasReceivedContent) {
                                throw new Error(`Stream completed without receiving any content after ${chunkCount} chunks (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
                            }
                            break;
                        }
                    }

                    return fullContent;
                };

                try {
                    const content = await attemptStream();
                    
                    await logger.info('Provider streaming response complete', {
                        requestId,
                        provider,
                        responseLength: content.length,
                        hasContent: Boolean(content),
                        totalChunks: chunkCount,
                        retryCount
                    });

                    if (!content) {
                        throw new Error(`Stream completed but no content was received after ${chunkCount} chunks and ${retryCount} retries`);
                    }

                    return { content };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    await logger.error('Streaming response failed', {
                        requestId,
                        provider,
                        error: errorMessage,
                        stack: error instanceof Error ? error.stack : undefined,
                        streamState: {
                            hasContent: Boolean(fullContent),
                            contentLength: fullContent.length,
                            totalChunks: chunkCount,
                            retryAttempts: retryCount
                        }
                    });
                    port.postMessage({ type: 'STREAM_ERROR', error: errorMessage });
                    throw error;
                }
            } else {
                // Handle non-streaming response
                const response = await llmProvider.complete(prompt, {
                    temperature: 0.7,
                    maxTokens: 1000
                });

                if (!response || !response.content) {
                    throw new Error('Provider returned empty response');
                }

                await logger.info('Provider response received', {
                    requestId,
                    provider,
                    responseLength: response.content.length,
                    model: response.model,
                    usage: response.usage
                });

                return { content: response.content };
            }
        } catch (error) {
            await logger.error('Provider request failed', {
                requestId,
                provider,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    } catch (error) {
        await logger.error('Content processing failed', {
            requestId,
            provider,
            command,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
    }
}

// Message handlers
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const requestId = Math.random().toString(36).substring(7);
    
    // Handle fetch requests
    if (request.type === 'fetch') {
        logger.debug(`Processing fetch request ${requestId}`, { 
            url: request.url,
            method: request.options?.method || 'GET'
        });

        // Add headers to the request
        const options = {
            ...request.options,
            headers: {
                ...request.options?.headers,
                'Content-Type': 'application/json',
            },
            // Use no-cors mode for POST requests to bypass CORS restrictions
            mode: (request.options?.method === 'POST' ? 'no-cors' : 'cors') as RequestMode,
            credentials: 'omit' as RequestCredentials
        };

        fetch(request.url, options)
            .then(async response => {
                // For no-cors mode, we won't be able to read the response
                // but at least the request will go through
                let responseBody = '';
                try {
                    responseBody = await response.text();
                } catch (error) {
                    logger.debug('Could not read response body (expected for no-cors mode)', {
                        status: response.status,
                        type: response.type
                    });
                }

                // Convert headers to a plain object
                const headers: Record<string, string> = {};
                response.headers.forEach((value, key) => {
                    headers[key] = value;
                });
                
                sendResponse({
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                    body: responseBody
                });
            })
            .catch(error => {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`Fetch request failed ${requestId}`, { 
                    error: errorMessage,
                    stack: error instanceof Error ? error.stack : undefined
                });
                sendResponse({ error: `Fetch request failed: ${errorMessage}` });
            });
        return true;
    }

    // Handle content processing
    if (request.type === 'PROCESS_CONTENT') {
        if (!request.provider || !request.command || !request.content) {
            const error = 'Missing required fields: provider, command, or content';
            logger.error(`Invalid request ${requestId}`, { error });
            sendResponse({ error });
            return true;
        }

        logger.debug(`Processing content request ${requestId}`, {
            provider: request.provider,
            command: request.command,
            contentLength: request.content.length,
            title: request.title,
            stream: request.stream
        });

        if (request.stream) {
            // For streaming, we'll use a long-lived connection
            sendResponse({ status: 'STREAMING' });
            return false;
        }

        processContent(request.provider, request.command, request.content, request.title, request.stream ? request.port : undefined, request.config)
            .then(response => {
                logger.info(`Content processing successful ${requestId}`, {
                    responseLength: response.content.length
                });
                sendResponse(response);
            })
            .catch(error => {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`Content processing failed ${requestId}`, { 
                    error: errorMessage,
                    stack: error instanceof Error ? error.stack : undefined
                });
                sendResponse({ error: `Failed to process content: ${errorMessage}` });
            });
        return true;
    }

    return false;
});

// Handle streaming connections
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'llm_stream') {
        port.onMessage.addListener((request) => {
            if (request.type === 'PROCESS_CONTENT') {
                if (!request.provider || !request.command || !request.content) {
                    port.postMessage({ 
                        type: 'STREAM_ERROR', 
                        error: 'Missing required fields: provider, command, or content' 
                    });
                    return;
                }

                processContent(
                    request.provider, 
                    request.command, 
                    request.content, 
                    request.title, 
                    port,
                    request.config
                ).catch(error => {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    port.postMessage({ 
                        type: 'STREAM_ERROR', 
                        error: `Failed to process content: ${errorMessage}` 
                    });
                });
            }
        });
    }
});