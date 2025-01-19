import { generateGuid } from '../utils/guid';
import { LLMProvider, LLMResponse, LLMOptions, LLMStreamResponse } from './LLMProvider';
import { Logger } from '../utils/Logger';

export abstract class KeyedProvider implements LLMProvider {
    readonly key: string;
    abstract name: string;
    abstract defaultModel: string;
    abstract availableModels: string[];
    abstract defaultEndpoint?: string;
    protected readonly logger: Logger;

    constructor() {
        this.key = generateGuid();
        this.logger = Logger.getInstance();
    }

    protected getStorageKey(prefix: string): string {
        return `${prefix}_provider_${this.key}`;
    }

    abstract test(apiKey?: string, endpoint?: string): Promise<void>;
    abstract complete(prompt: string, options?: LLMOptions): Promise<LLMResponse>;
    abstract completeStream(prompt: string, options?: LLMOptions): AsyncGenerator<LLMStreamResponse>;
    abstract getCurrentModel(): string;
    abstract setModel(model: string): void;
    abstract validateApiKey?(apiKey: string): boolean;
    abstract validateEndpoint?(endpoint: string): boolean;
    abstract setEndpoint?(endpoint: string): void;
}
