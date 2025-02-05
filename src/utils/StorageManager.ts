import { Logger } from './Logger';
import { LLMProviderFactory, ProviderType } from '../llm/LLMProviderFactory';

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

    // Provider CRUD Operations
    public async listProviders(): Promise<Provider[]> {
        try {
            const data = await chrome.storage.sync.get('providers');
            return data.providers || [];
        } catch (error) {
            await this.logger.error('Failed to list providers', { error });
            throw error;
        }
    }

    public async getProvider(providerId: string): Promise<Provider | null> {
        try {
            const providers = await this.listProviders();
            return providers.find(p => p.providerId === providerId) || null;
        } catch (error) {
            await this.logger.error('Failed to get provider', { error });
            throw error;
        }
    }

    public async createProvider(provider: Omit<Provider, 'providerId'>): Promise<Provider> {
        try {
            const newProvider: Provider = {
                ...provider,
                providerId: crypto.randomUUID()
            };

            const providers = await this.listProviders();
            providers.push(newProvider);
            
            await chrome.storage.sync.set({ providers });
            await this.logger.info('Provider created', { providerId: newProvider.providerId });
            
            return newProvider;
        } catch (error) {
            await this.logger.error('Failed to create provider', { error });
            throw error;
        }
    }

    public async updateProvider(providerId: string, updates: Partial<Provider>): Promise<Provider> {
        try {
            const providers = await this.listProviders();
            const index = providers.findIndex(p => p.providerId === providerId);
            
            if (index === -1) {
                throw new Error(`Provider with ID ${providerId} not found`);
            }

            providers[index] = {
                ...providers[index],
                ...updates,
                providerId // Ensure ID doesn't change
            };

            await chrome.storage.sync.set({ providers });
            await this.logger.info('Provider updated', { providerId });

            return providers[index];
        } catch (error) {
            await this.logger.error('Failed to update provider', { error });
            throw error;
        }
    }

    public async deleteProvider(providerId: string): Promise<void> {
        try {
            const providers = await this.listProviders();
            const filteredProviders = providers.filter(p => p.providerId !== providerId);
            
            await chrome.storage.sync.set({ providers: filteredProviders });
            await this.logger.info('Provider deleted', { providerId });
        } catch (error) {
            await this.logger.error('Failed to delete provider', { error });
            throw error;
        }
    }

    // Command Operations
    public async listCommands(): Promise<Command[]> {
        try {
            const data = await chrome.storage.sync.get('commands');
            return data.commands || DEFAULT_COMMANDS;
        } catch (error) {
            await this.logger.error('Failed to list commands', { error });
            throw error;
        }
    }

    public async updateCommands(commands: Command[]): Promise<void> {
        try {
            await chrome.storage.sync.set({ commands });
            await this.logger.info('Commands updated', { count: commands.length });
        } catch (error) {
            await this.logger.error('Failed to update commands', { error });
            throw error;
        }
    }

    public async resetToDefaults(): Promise<void> {
        try {
            await Promise.all([
                chrome.storage.sync.clear(),
                chrome.storage.local.clear(),
                this.updateCommands(DEFAULT_COMMANDS)
            ]);
            await this.logger.info('Reset to defaults completed');
        } catch (error) {
            await this.logger.error('Failed to reset to defaults', { error });
            throw error;
        }
    }

    // Provider state management
    public async saveProviderState(type: string, key: string, config: any): Promise<void> {
        try {
            await Promise.all([
                chrome.storage.local.get('providers').then(data => {
                    const providers = data.providers || [];
                    const existingIndex = providers.findIndex((p: any) => p.type === type && p.key === key);
                    
                    if (existingIndex >= 0) {
                        providers[existingIndex] = { ...providers[existingIndex], ...config, key };
                    } else {
                        providers.push({ type, key, ...config });
                    }
                    
                    return chrome.storage.local.set({ providers });
                }),
                chrome.storage.local.set({ [`${type}_provider_${key}`]: config })
            ]);

            await this.logger.debug(`${type} provider state saved`, {
                key,
                ...config
            });
        } catch (error) {
            await this.logger.error(`Failed to save ${type} provider state`, { error });
            throw error;
        }
    }

    public async loadProviderState(type: string, key: string): Promise<any> {
        try {
            const data = await chrome.storage.local.get(`${type}_provider_${key}`);
            const state = data[`${type}_provider_${key}`];
            
            if (state) {
                await this.logger.debug(`${type} provider state loaded`, {
                    key,
                    ...state
                });
            }
            
            return state;
        } catch (error) {
            await this.logger.error(`Failed to load ${type} provider state`, { error });
            throw error;
        }
    }

    public async getAllStorageData(): Promise<{ sync: any, local: any }> {
        try {
            const [syncData, localData] = await Promise.all([
                chrome.storage.sync.get(null),
                chrome.storage.local.get(null)
            ]);
            return { sync: syncData, local: localData };
        } catch (error) {
            await this.logger.error('Failed to get all storage data', { error });
            throw error;
        }
    }

    public async clearLogs(): Promise<void> {
        try {
            await chrome.storage.local.set({ logs: [] });
            await this.logger.info('Logs cleared');
        } catch (error) {
            await this.logger.error('Failed to clear logs', { error });
            throw error;
        }
    }

    public async getCurrentTab(): Promise<chrome.tabs.Tab | null> {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return tab || null;
        } catch (error) {
            await this.logger.error('Failed to get current tab', { error });
            throw error;
        }
    }

    public async executeScriptInTab(tabId: number, files: string[]): Promise<void> {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files
            });
        } catch (error) {
            await this.logger.error('Failed to execute script in tab', { error });
            throw error;
        }
    }

    public async sendMessageToTab(tabId: number, message: any): Promise<any> {
        try {
            return await chrome.tabs.sendMessage(tabId, message);
        } catch (error) {
            await this.logger.error('Failed to send message to tab', { error });
            throw error;
        }
    }

    public async sendRuntimeMessage(message: any): Promise<any> {
        try {
            return await chrome.runtime.sendMessage(message);
        } catch (error) {
            await this.logger.error('Failed to send runtime message', { error });
            throw error;
        }
    }

    public connectToRuntime(name: string): chrome.runtime.Port {
        try {
            return chrome.runtime.connect({ name });
        } catch (error) {
            this.logger.error('Failed to connect to runtime', { error });
            throw error;
        }
    }

    public openOptionsPage(): void {
        try {
            chrome.runtime.openOptionsPage();
        } catch (error) {
            this.logger.error('Failed to open options page', { error });
            throw error;
        }
    }
} 