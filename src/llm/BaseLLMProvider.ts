import { LLMProvider } from './LLMProvider';
import { generateGuid } from '../utils/guid';
import { Logger } from '../utils/Logger';

export abstract class BaseLLMProvider {
    readonly key: string;
    protected readonly logger: Logger;

    constructor() {
        this.key = generateGuid();
        this.logger = Logger.getInstance();
    }

    protected getStorageKey(prefix: string): string {
        return `${prefix}_provider_${this.key}`;
    }

    protected async saveProviderState(type: string, config: any): Promise<void> {
        try {
            await Promise.all([
                chrome.storage.local.get('providers').then(data => {
                    const providers = data.providers || [];
                    const existingIndex = providers.findIndex((p: any) => p.type === type && p.key === this.key);
                    
                    if (existingIndex >= 0) {
                        providers[existingIndex] = { ...providers[existingIndex], ...config, key: this.key };
                    } else {
                        providers.push({ type, key: this.key, ...config });
                    }
                    
                    return chrome.storage.local.set({ providers });
                }),
                chrome.storage.local.set({ [this.getStorageKey(type)]: config })
            ]);

            await this.logger.debug(`${type} provider state saved`, {
                key: this.key,
                ...config
            });
        } catch (error) {
            await this.logger.error(`Failed to save ${type} provider state`, { error });
            throw error;
        }
    }

    protected async loadProviderState(type: string): Promise<any> {
        try {
            const data = await chrome.storage.local.get(this.getStorageKey(type));
            const state = data[this.getStorageKey(type)];
            
            if (state) {
                await this.logger.debug(`${type} provider state loaded`, {
                    key: this.key,
                    ...state
                });
            }
            
            return state;
        } catch (error) {
            await this.logger.error(`Failed to load ${type} provider state`, { error });
            throw error;
        }
    }
}
