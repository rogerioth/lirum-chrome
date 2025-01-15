import { CredentialManager } from '../../services/CredentialManager';

describe('CredentialManager', () => {
  let credentialManager: CredentialManager;

  beforeEach(() => {
    chrome.storage.sync.clear();
    credentialManager = new CredentialManager();
  });

  describe('API Key Management', () => {
    it('should securely store API keys', async () => {
      const provider = 'openai';
      const apiKey = 'sk-test123';
      
      await credentialManager.storeApiKey(provider, apiKey);
      
      // Verify the key is stored securely (encrypted)
      const stored = await chrome.storage.sync.get(provider);
      expect(stored[provider]).not.toBe(apiKey);
      expect(stored[provider]).toBeTruthy();
    });

    it('should retrieve stored API keys', async () => {
      const provider = 'anthropic';
      const apiKey = 'sk-ant123';
      
      await credentialManager.storeApiKey(provider, apiKey);
      const retrieved = await credentialManager.getApiKey(provider);
      
      expect(retrieved).toBe(apiKey);
    });

    it('should handle multiple providers', async () => {
      const credentials = {
        openai: 'sk-test123',
        anthropic: 'sk-ant123',
        deepseek: 'sk-deep123'
      };

      for (const [provider, key] of Object.entries(credentials)) {
        await credentialManager.storeApiKey(provider, key);
      }

      for (const [provider, key] of Object.entries(credentials)) {
        const retrieved = await credentialManager.getApiKey(provider);
        expect(retrieved).toBe(key);
      }
    });

    it('should delete API keys', async () => {
      const provider = 'openai';
      const apiKey = 'sk-test123';
      
      await credentialManager.storeApiKey(provider, apiKey);
      await credentialManager.deleteApiKey(provider);
      
      const retrieved = await credentialManager.getApiKey(provider);
      expect(retrieved).toBeNull();
    });
  });

  describe('Provider Management', () => {
    it('should list all configured providers', async () => {
      const providers = {
        openai: 'sk-test123',
        anthropic: 'sk-ant123'
      };

      for (const [provider, key] of Object.entries(providers)) {
        await credentialManager.storeApiKey(provider, key);
      }

      const configuredProviders = await credentialManager.getConfiguredProviders();
      expect(configuredProviders).toEqual(expect.arrayContaining(Object.keys(providers)));
    });

    it('should validate API key format', async () => {
      const validKey = 'sk-test123';
      const invalidKey = '123';

      expect(credentialManager.validateApiKeyFormat('openai', validKey)).toBe(true);
      expect(credentialManager.validateApiKeyFormat('openai', invalidKey)).toBe(false);
    });
  });

  describe('Default Provider', () => {
    it('should set and get default provider', async () => {
      const provider = 'openai';
      await credentialManager.setDefaultProvider(provider);
      
      const defaultProvider = await credentialManager.getDefaultProvider();
      expect(defaultProvider).toBe(provider);
    });

    it('should clear default provider when provider is deleted', async () => {
      const provider = 'openai';
      await credentialManager.storeApiKey(provider, 'sk-test123');
      await credentialManager.setDefaultProvider(provider);
      
      await credentialManager.deleteApiKey(provider);
      const defaultProvider = await credentialManager.getDefaultProvider();
      expect(defaultProvider).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing API keys gracefully', async () => {
      const retrieved = await credentialManager.getApiKey('nonexistent');
      expect(retrieved).toBeNull();
    });

    it('should throw error for invalid provider names', async () => {
      await expect(
        credentialManager.storeApiKey('', 'sk-test123')
      ).rejects.toThrow();
    });

    it('should throw error for invalid API key format', async () => {
      await expect(
        credentialManager.storeApiKey('openai', '')
      ).rejects.toThrow();
    });
  });
}); 