import { LLMProvider } from './LLMProvider';
import { generateGuid } from '../utils/guid';
import { Logger } from '../utils/Logger';
import { StorageManager } from '../utils/StorageManager';

export abstract class BaseLLMProvider {
    readonly key: string;
    protected readonly logger: Logger;
    protected readonly storageManager: StorageManager;

    constructor() {
        this.key = generateGuid();
        this.logger = Logger.getInstance();
        this.storageManager = StorageManager.getInstance();
    }

    protected getStorageKey(prefix: string): string {
        return `${prefix}_provider_${this.key}`;
    }

    protected async saveProviderState(type: string, config: any): Promise<void> {
        await this.storageManager.saveProviderState(type, this.key, config);
    }

    protected async loadProviderState(type: string): Promise<any> {
        return await this.storageManager.loadProviderState(type, this.key);
    }
}
