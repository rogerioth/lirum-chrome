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

    // Cache for provider instances
    private static readonly providerInstances: Record<ProviderType, LLMProvider | null> = {
        openai: null,
        anthropic: null,
        ollama: null,
        deepseek: null,
        lmstudio: null
    };

    private constructor() {
        // Private constructor to prevent instantiation
    }

    static getProvider(type: ProviderType): LLMProvider {
        // Return cached instance if it exists
        if (this.providerInstances[type]) {
            return this.providerInstances[type]!;
        }

        // Create new instance and cache it
        const Provider = this.providers[type];
        const instance = new Provider();
        this.providerInstances[type] = instance;
        return instance;
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

    // Clear the cached instance of a specific provider
    static clearProvider(type: ProviderType): void {
        this.providerInstances[type] = null;
    }

    // Clear all cached provider instances
    static clearAllProviders(): void {
        Object.keys(this.providerInstances).forEach(type => {
            this.providerInstances[type as ProviderType] = null;
        });
    }
}