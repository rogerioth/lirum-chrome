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

// Initialize providers from storage
async function initializeProviders(): Promise<void> {
    try {
        const data = await chrome.storage.sync.get(['providers', 'defaultProvider']);
        await logger.debug('Raw storage data loaded', { 
            hasProviders: Boolean(data.providers),
            isArray: Array.isArray(data.providers)
        });

        const providers = normalizeProviderData(data.providers);
        
        await logger.debug('Normalized provider data', { 
            providers: Object.keys(providers).map(type => ({
                type,
                hasApiKey: Boolean(providers[type]?.apiKey),
                hasEndpoint: Boolean(providers[type]?.endpoint),
                name: providers[type]?.name
            }))
        });

        const availableTypes = LLMProviderFactory.getProviderTypes();
        await logger.debug('Available provider types', { types: availableTypes });
        
        for (const type of availableTypes) {
            const config = providers[type];
            if (config?.apiKey || config?.endpoint) {
                try {
                    await logger.debug(`Initializing provider: ${type}`, {
                        hasApiKey: Boolean(config.apiKey),
                        hasEndpoint: Boolean(config.endpoint)
                    });

                    const provider = LLMProviderFactory.getProvider(type);
                    await provider.initialize(config.apiKey, config.endpoint);
                    
                    await logger.info(`Provider initialized: ${type}`, {
                        hasApiKey: Boolean(config.apiKey),
                        hasEndpoint: Boolean(config.endpoint),
                        defaultModel: provider.defaultModel,
                        availableModels: provider.availableModels
                    });
                } catch (error) {
                    await logger.error(`Failed to initialize provider: ${type}`, { 
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined
                    });
                }
            } else {
                await logger.debug(`Skipping unconfigured provider: ${type}`);
            }
        }
    } catch (error) {
        await logger.error('Failed to load providers from storage', { 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
    }
}

// Initialize a single provider
async function initializeProvider(type: ProviderType, config: StoredProviderConfig): Promise<void> {
    const requestId = Math.random().toString(36).substring(7);
    try {
        await logger.debug(`Initializing provider: ${type}`, {
            requestId,
            hasApiKey: Boolean(config.apiKey),
            hasEndpoint: Boolean(config.endpoint)
        });

        const provider = LLMProviderFactory.getProvider(type);
        await provider.initialize(config.apiKey, config.endpoint);
        
        await logger.info(`Provider initialized: ${type}`, {
            requestId,
            hasApiKey: Boolean(config.apiKey),
            hasEndpoint: Boolean(config.endpoint),
            defaultModel: provider.defaultModel,
            availableModels: provider.availableModels
        });
    } catch (error) {
        await logger.error(`Failed to initialize provider: ${type}`, { 
            requestId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
    }
}

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

    const llmProvider = LLMProviderFactory.getProvider(provider);
    
    if (!llmProvider.isInitialized()) {
        const error = `Provider ${provider} is not initialized. Please check your settings.`;
        await logger.error('Provider not initialized', { 
            requestId,
            provider,
            error
        });
        throw new Error(error);
    }

    await logger.debug('Provider status', {
        requestId,
        provider,
        model: llmProvider.getCurrentModel(),
        isInitialized: llmProvider.isInitialized()
    });

    const prompt = `
Command: ${command}
Title: ${title}
Content:
${content}

Please ${command.toLowerCase()} the above content.
`.trim();

    try {
        await logger.debug('Sending prompt to provider', { 
            requestId,
            provider,
            promptLength: prompt.length,
            promptPreview: prompt.slice(0, 100)
        });

        const response = await llmProvider.complete(prompt, {
            temperature: 0.7,
            maxTokens: 1000
        });

        await logger.info('Received response from provider', {
            requestId,
            provider,
            responseLength: response.content.length,
            model: response.model,
            usage: response.usage,
            responsePreview: response.content.slice(0, 100)
        });

        return { content: response.content };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logger.error('Error processing content', { 
            requestId,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            provider,
            command
        });
        throw new Error(`Failed to process content: ${errorMessage}`);
    }
}

// Message handlers
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const requestId = Math.random().toString(36).substring(7);
    
    // Handle provider initialization
    if (request.type === 'INITIALIZE_PROVIDER') {
        logger.debug(`Processing provider initialization request ${requestId}`, { 
            provider: request.provider,
            hasApiKey: Boolean(request.config?.apiKey),
            hasEndpoint: Boolean(request.config?.endpoint)
        });

        initializeProvider(request.provider, request.config)
            .then(() => {
                logger.info(`Provider initialization successful ${requestId}`);
                sendResponse({ success: true });
            })
            .catch(error => {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`Provider initialization failed ${requestId}`, { error: errorMessage });
                sendResponse({ error: `Failed to initialize provider: ${errorMessage}` });
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

// Initialize on install/update
chrome.runtime.onInstalled.addListener(() => {
    logger.info('Extension installed/updated');
    initializeProviders().catch(error => {
        logger.error('Failed to initialize providers on install', { 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
    });
});

// Reinitialize providers when service worker activates
chrome.runtime.onStartup.addListener(() => {
    logger.info('Extension starting up');
    initializeProviders().catch(error => {
        logger.error('Failed to initialize providers on startup', { 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
    });
});

// Also reinitialize when service worker wakes up
chrome.runtime.onConnect.addListener(() => {
    logger.info('Service worker connected');
    initializeProviders().catch(error => {
        logger.error('Failed to initialize providers on connect', { 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
    });
});