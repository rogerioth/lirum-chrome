export class CredentialManager {
  private readonly STORAGE_PREFIX = 'llm_api_key_';
  private readonly DEFAULT_PROVIDER_KEY = 'default_provider';

  constructor() {}

  private getStorageKey(provider: string): string {
    return `${this.STORAGE_PREFIX}${provider}`;
  }

  private async encryptApiKey(apiKey: string): Promise<string> {
    // In a real implementation, this would use proper encryption
    // For now, we'll use a simple encoding to demonstrate the concept
    return btoa(apiKey);
  }

  private async decryptApiKey(encryptedKey: string): Promise<string> {
    // In a real implementation, this would use proper decryption
    return atob(encryptedKey);
  }

  async storeApiKey(provider: string, apiKey: string): Promise<void> {
    if (!provider || !apiKey) {
      throw new Error('Provider and API key are required');
    }

    if (!this.validateApiKeyFormat(provider, apiKey)) {
      throw new Error('Invalid API key format');
    }

    const encryptedKey = await this.encryptApiKey(apiKey);
    await chrome.storage.sync.set({ [this.getStorageKey(provider)]: encryptedKey });
  }

  async getApiKey(provider: string): Promise<string | null> {
    const result = await chrome.storage.sync.get(this.getStorageKey(provider));
    const encryptedKey = result[this.getStorageKey(provider)];
    
    if (!encryptedKey) {
      return null;
    }

    return this.decryptApiKey(encryptedKey);
  }

  async deleteApiKey(provider: string): Promise<void> {
    await chrome.storage.sync.remove(this.getStorageKey(provider));
    
    // If this was the default provider, clear that setting
    const defaultProvider = await this.getDefaultProvider();
    if (defaultProvider === provider) {
      await this.setDefaultProvider(null);
    }
  }

  async getConfiguredProviders(): Promise<string[]> {
    const allStorage = await chrome.storage.sync.get(null);
    return Object.keys(allStorage)
      .filter(key => key.startsWith(this.STORAGE_PREFIX))
      .map(key => key.replace(this.STORAGE_PREFIX, ''));
  }

  validateApiKeyFormat(provider: string, apiKey: string): boolean {
    // Basic validation - can be expanded based on provider-specific requirements
    if (!apiKey || apiKey.length < 8) {
      return false;
    }

    switch (provider) {
      case 'openai':
        return apiKey.startsWith('sk-');
      case 'anthropic':
        return apiKey.startsWith('sk-ant');
      case 'deepseek':
        return apiKey.startsWith('sk-');
      default:
        return true;
    }
  }

  async setDefaultProvider(provider: string | null): Promise<void> {
    if (provider) {
      const hasKey = await this.getApiKey(provider);
      if (!hasKey) {
        throw new Error('Cannot set default provider without API key');
      }
    }
    await chrome.storage.sync.set({ [this.DEFAULT_PROVIDER_KEY]: provider });
  }

  async getDefaultProvider(): Promise<string | null> {
    const result = await chrome.storage.sync.get(this.DEFAULT_PROVIDER_KEY);
    return result[this.DEFAULT_PROVIDER_KEY] || null;
  }
} 