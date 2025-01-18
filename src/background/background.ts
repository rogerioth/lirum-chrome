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
    title: string
): Promise<{ content: string }> {
    const requestId = Math.random().toString(36).substring(7);
    
    await logger.info('Processing content request', {
        requestId,
        provider,
        command,
        contentLength: content.length,
        titleLength: title.length,
        contentPreview: content.slice(0, 100)
    });

    // Get provider instance and config
    const llmProvider = LLMProviderFactory.getProvider(provider);
    
    // Try to get provider config from both formats and storage types
    const [legacySyncConfig, legacyLocalConfig, providerConfig] = await Promise.all([
        chrome.storage.sync.get('providers'),
        chrome.storage.local.get('providers'),
        chrome.storage.local.get(`${provider}_provider_config`)
    ]);

    // Check both legacy array format and new format
    const legacyProvider = legacySyncConfig.providers?.find((p: any) => p.type === provider) || 
                          legacyLocalConfig.providers?.find((p: any) => p.type === provider);
    const config = providerConfig[`${provider}_provider_config`] || legacyProvider;
    
    if (!config) {
        const error = `Provider ${provider} is not configured. Please go to extension settings and configure a valid API key or endpoint.`;
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
            name: config.name,
            hasApiKey: Boolean(config.apiKey),
            hasEndpoint: Boolean(config.endpoint),
            model: config.model,
            endpoint: config.endpoint // Include endpoint for debugging local providers
        }
    });

    // Set up the provider with the configuration
    if (config.endpoint) {
        try {
            llmProvider.setEndpoint?.(config.endpoint);
        } catch (error) {
            await logger.error('Failed to set provider endpoint', {
                requestId,
                provider,
                endpoint: config.endpoint,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    if (config.model) {
        try {
            llmProvider.setModel(config.model);
        } catch (error) {
            await logger.error('Failed to set provider model', {
                requestId,
                provider,
                model: config.model,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    // Check if we have the required configuration
    if (config.apiKey === undefined && config.endpoint === undefined) {
        const error = `Provider ${provider} is missing required configuration. ${
            provider === 'openai' || provider === 'anthropic' || provider === 'deepseek' 
                ? 'Please configure an API key in the extension settings.'
                : 'Please configure a valid endpoint in the extension settings.'
        }`;
        await logger.error('Invalid provider configuration', {
            requestId,
            provider,
            error,
            hasApiKey: Boolean(config.apiKey),
            hasEndpoint: Boolean(config.endpoint)
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
                maxTokens: 1000
            }
        });

        const response = await llmProvider.complete(prompt, {
            temperature: 0.7,
            maxTokens: 1000
        });

        await logger.info('Provider response received', {
            requestId,
            provider,
            responseLength: response.content.length,
            model: response.model,
            usage: response.usage
        });

        return { content: response.content };
    } catch (error) {
        await logger.error('Provider request failed', {
            requestId,
            provider,
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
            title: request.title
        });

        processContent(request.provider, request.command, request.content, request.title)
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