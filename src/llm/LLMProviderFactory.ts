import { LLMProvider } from './LLMProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { OllamaProvider } from './OllamaProvider';
import { DeepseekProvider } from './DeepseekProvider';
import { LMStudioProvider } from './LMStudioProvider';

export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'deepseek' | 'lmstudio';

export class LLMProviderFactory {
    private static readonly providers = {
        openai: OpenAIProvider,
        anthropic: AnthropicProvider,
        ollama: OllamaProvider,
        deepseek: DeepseekProvider,
        lmstudio: LMStudioProvider
    };

    private static readonly providerNames = {
        openai: 'OpenAI',
        anthropic: 'Anthropic',
        ollama: 'Ollama',
        deepseek: 'Deepseek',
        lmstudio: 'LM Studio'
    };

    private static readonly defaultEndpoints = {
        openai: 'https://api.openai.com',
        anthropic: 'https://api.anthropic.com',
        deepseek: 'https://api.deepseek.com',
        ollama: 'http://localhost:11434',
        lmstudio: 'http://localhost:1234'
    };

    private constructor() {
        // Private constructor to prevent instantiation
    }

    static getProvider(type: ProviderType): LLMProvider {
        const Provider = this.providers[type];
        return new Provider();
    }

    static getProviderTypes(): ProviderType[] {
        return Object.keys(this.providers) as ProviderType[];
    }

    static getProviderName(type: ProviderType): string {
        return this.providerNames[type];
    }

    static getDefaultModel(type: ProviderType): string {
        return this.getProvider(type).defaultModel;
    }

    static getAvailableModels(type: ProviderType): string[] {
        return this.getProvider(type).availableModels;
    }

    static isLocalProvider(type: ProviderType): boolean {
        return type === 'ollama' || type === 'lmstudio';
    }

    static getDefaultEndpoint(type: ProviderType): string {
        return this.defaultEndpoints[type];
    }
} 