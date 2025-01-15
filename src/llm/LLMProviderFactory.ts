import { LLMProvider } from './LLMProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { DeepseekProvider } from './DeepseekProvider';
import { OllamaProvider } from './OllamaProvider';
import { LMStudioProvider } from './LMStudioProvider';

export type ProviderType = 'openai' | 'anthropic' | 'deepseek' | 'ollama' | 'lmstudio';

export class LLMProviderFactory {
  private static providers: Map<ProviderType, LLMProvider> = new Map();

  static getProvider(type: ProviderType): LLMProvider {
    let provider = this.providers.get(type);
    
    if (!provider) {
      provider = this.createProvider(type);
      this.providers.set(type, provider);
    }
    
    return provider;
  }

  private static createProvider(type: ProviderType): LLMProvider {
    switch (type) {
      case 'openai':
        return new OpenAIProvider();
      case 'anthropic':
        return new AnthropicProvider();
      case 'deepseek':
        return new DeepseekProvider();
      case 'ollama':
        return new OllamaProvider();
      case 'lmstudio':
        return new LMStudioProvider();
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  static getProviderTypes(): ProviderType[] {
    return ['openai', 'anthropic', 'deepseek', 'ollama', 'lmstudio'];
  }

  static getProviderName(type: ProviderType): string {
    return this.getProvider(type).name;
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

  static getDefaultEndpoint(type: ProviderType): string | null {
    if (type === 'ollama') {
      return OllamaProvider.getDefaultBaseUrl();
    } else if (type === 'lmstudio') {
      return LMStudioProvider.getDefaultBaseUrl();
    }
    return null;
  }
} 