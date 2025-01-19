import { Logger } from './Logger';
import { LLMProviderFactory, ProviderType } from '../llm/LLMProviderFactory';
import { LLMProvider } from '../llm/LLMProvider';

export interface Provider {
    type: ProviderType;
    name: string;
    apiKey?: string;
    endpoint?: string;
    model: string;
    providerId: string;
}

export interface Command {
    name: string;
    icon: string;
    prompt: string;
}

export const DEFAULT_COMMANDS: Command[] = [
    { name: 'Summarize', icon: 'fa-solid fa-compress', prompt: 'Please provide a concise summary of the following content:' },
    { name: 'Paraphrase', icon: 'fa-solid fa-pen', prompt: 'Please rewrite the following content in different words while maintaining its meaning:' },
    { name: 'Bullet Points', icon: 'fa-solid fa-list', prompt: 'Please convert the following content into clear, organized bullet points:' },
    { name: 'Translate', icon: 'fa-solid fa-language', prompt: 'Please translate the following content to English (or specify target language):' },
    { name: 'Analyze Tone', icon: 'fa-solid fa-face-smile', prompt: 'Please analyze the tone and emotional content of the following text:' }
];

export class StorageManager {
    private static instance: StorageManager;
    private readonly logger: Logger;

    private constructor() {
        this.logger = Logger.getInstance();
    }

    public static getInstance(): StorageManager {
        if (!StorageManager.instance) {
            StorageManager.instance = new StorageManager();
        }
        return StorageManager.instance;
    }

    public async getProviders(): Promise<Provider[]> {
        try {
            const [syncData, localData, providerConfigs] = await Promise.all([
                chrome.storage.sync.get('providers'),
                chrome.storage.local.get('providers'),
                chrome.storage.local.get(
                    Object.values(LLMProviderFactory.getProviderTypes())
                        .map(type => `${type}_provider_config`)
                )
            ]);

            let allProviders = syncData.providers || [];

            // Merge with local storage providers
            if (localData.providers) {
                localData.providers.forEach(localProvider => {
                    const existingIndex = allProviders.findIndex(p => p.providerId === localProvider.providerId);
                    if (existingIndex !== -1) {
                        allProviders[existingIndex] = {
                            ...allProviders[existingIndex],
                            ...localProvider
                        };
                    } else {
                        allProviders.push({
                            ...localProvider,
                            providerId: localProvider.providerId || crypto.randomUUID()
                        });
                    }
                });
            }

            // Merge with provider-specific configs
            Object.entries(providerConfigs).forEach(([key, config]) => {
                if (!config) return;
                const type = key.replace('_provider_config', '') as ProviderType;
                const existingIndex = allProviders.findIndex(p => p.providerId === config.providerId);
                
                if (existingIndex !== -1) {
                    allProviders[existingIndex] = {
                        ...allProviders[existingIndex],
                        ...config,
                        type,
                        name: config.name || allProviders[existingIndex].name || LLMProviderFactory.getProviderName(type)
                    };
                } else {
                    allProviders.push({
                        type,
                        name: config.name || LLMProviderFactory.getProviderName(type),
                        providerId: config.providerId || crypto.randomUUID(),
                        ...config
                    });
                }
            });

            // Ensure all providers have a providerId
            allProviders = allProviders.map(provider => ({
                ...provider,
                providerId: provider.providerId || crypto.randomUUID()
            }));

            return allProviders;
        } catch (error) {
            await this.logger.error('Failed to get providers', { error });
            throw error;
        }
    }

    public async saveProvider(provider: Provider): Promise<void> {
        try {
            // Ensure provider has a providerId
            if (!provider.providerId) {
                provider.providerId = crypto.randomUUID();
            }

            // Save to both storage formats for backward compatibility
            await Promise.all([
                chrome.storage.sync.get('providers').then(data => {
                    const providers = data.providers || [];
                    const index = providers.findIndex(p => p.providerId === provider.providerId);
                    if (index !== -1) {
                        providers[index] = provider;
                    } else {
                        providers.push(provider);
                    }
                    return chrome.storage.sync.set({ providers });
                }),
                chrome.storage.local.set({
                    [`${provider.providerId}_${provider.type}_provider_config`]: provider
                })
            ]);

            await this.logger.info('Provider saved', { 
                providerId: provider.providerId,
                type: provider.type,
                name: provider.name 
            });
        } catch (error) {
            await this.logger.error('Failed to save provider', { error });
            throw error;
        }
    }

    public async removeProvider(provider: Provider): Promise<void> {
        try {
            await Promise.all([
                chrome.storage.sync.get('providers').then(data => {
                    const providers = (data.providers || []).filter(p => p.providerId !== provider.providerId);
                    return chrome.storage.sync.set({ providers });
                }),
                chrome.storage.local.remove(`${provider.providerId}_${provider.type}_provider_config`)
            ]);

            await this.logger.info('Provider removed', { 
                providerId: provider.providerId,
                type: provider.type 
            });
        } catch (error) {
            await this.logger.error('Failed to remove provider', { error });
            throw error;
        }
    }

    public async getCommands(): Promise<Command[]> {
        try {
            const data = await chrome.storage.sync.get('commands');
            return data.commands || DEFAULT_COMMANDS;
        } catch (error) {
            await this.logger.error('Failed to get commands', { error });
            throw error;
        }
    }

    public async saveCommands(commands: Command[]): Promise<void> {
        try {
            await chrome.storage.sync.set({ commands });
            await this.logger.info('Commands saved', { count: commands.length });
        } catch (error) {
            await this.logger.error('Failed to save commands', { error });
            throw error;
        }
    }

    public async factoryReset(): Promise<void> {
        try {
            await Promise.all([
                // Clear all storage
                chrome.storage.sync.clear(),
                chrome.storage.local.clear(),
                
                // Reset commands to defaults
                this.saveCommands(DEFAULT_COMMANDS)
            ]);

            await this.logger.info('Factory reset completed');
        } catch (error) {
            await this.logger.error('Failed to perform factory reset', { error });
            throw error;
        }
    }
} 