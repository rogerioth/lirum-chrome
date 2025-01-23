import { BaseLLMProvider } from './BaseLLMProvider';
import { LLMProvider } from './LLMProvider';

export abstract class KeyedProvider extends BaseLLMProvider implements LLMProvider {
    abstract name: string;
    abstract defaultModel: string;
    abstract availableModels: string[];
    abstract defaultEndpoint?: string;

    abstract test(apiKey?: string, endpoint?: string): Promise<void>;
    abstract complete(prompt: string, options?: any): Promise<any>;
    abstract completeStream(prompt: string, options?: any): AsyncGenerator<any>;
    abstract configure(config: { apiKey?: string; model?: string; endpoint?: string }): Promise<void>;
}
