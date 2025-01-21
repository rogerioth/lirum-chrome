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

    protected validateModel(model: string, availableModels: string[]): void {
        if (!model) {
            throw new Error('Model cannot be empty');
        }
        if (!availableModels.includes(model)) {
            throw new Error(`Invalid model: ${model}. Available models: ${availableModels.join(', ')}`);
        }
    }
}
