import React, { useState, useEffect } from 'react';
import { LLMProviderFactory, ProviderType } from '../llm/LLMProviderFactory';
import { Logger } from '../utils/Logger';
import '../styles/ProviderModal.css';

interface ProviderModalProps {
  onClose: () => void;
  onSave: (config: ProviderConfig) => void;
  initialConfig?: ProviderConfig;
}

interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  endpoint?: string;
  model: string;
}

interface ValidationState {
  apiKey: boolean;
  endpoint: boolean;
  model: boolean;
  message?: string;
}

export const ProviderModal: React.FC<ProviderModalProps> = ({
  onClose,
  onSave,
  initialConfig
}) => {
  const [providerType, setProviderType] = useState<ProviderType>(initialConfig?.type || 'openai');
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey || '');
  const [endpoint, setEndpoint] = useState(initialConfig?.endpoint || '');
  const [selectedModel, setSelectedModel] = useState(initialConfig?.model || '');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({
    apiKey: true,
    endpoint: true,
    model: true
  });

  const logger = Logger.getInstance();

  useEffect(() => {
    const provider = LLMProviderFactory.getProvider(providerType);
    setAvailableModels(LLMProviderFactory.getAvailableModels(providerType));
    setSelectedModel(LLMProviderFactory.getDefaultModel(providerType));
    
    if (LLMProviderFactory.isLocalProvider(providerType)) {
      setEndpoint(provider.defaultEndpoint || '');
    }
  }, [providerType]);

  const validateConfig = (): ValidationState => {
    const newValidation: ValidationState = {
      apiKey: true,
      endpoint: true,
      model: true
    };

    const provider = LLMProviderFactory.getProvider(providerType);
    const isLocal = LLMProviderFactory.isLocalProvider(providerType);

    if (!isLocal) {
      if (!apiKey) {
        newValidation.apiKey = false;
        newValidation.message = 'API key is required';
      } else if (provider.validateApiKey && !provider.validateApiKey(apiKey)) {
        newValidation.apiKey = false;
        newValidation.message = 'Invalid API key format';
      }
    } else {
      if (!endpoint) {
        newValidation.endpoint = false;
        newValidation.message = 'Endpoint is required';
      } else if (provider.validateEndpoint && !provider.validateEndpoint(endpoint)) {
        newValidation.endpoint = false;
        newValidation.message = 'Invalid endpoint URL format';
      }
    }

    if (!selectedModel) {
      newValidation.model = false;
      newValidation.message = 'Please select a model';
    }

    return newValidation;
  };

  const handleProviderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = event.target.value as ProviderType;
    setProviderType(newType);
    setTestResult('');
    setValidation({
      apiKey: true,
      endpoint: true,
      model: true
    });
  };

  const handleTest = async () => {
    const newValidation = validateConfig();
    setValidation(newValidation);

    if (!newValidation.apiKey || !newValidation.endpoint || !newValidation.model) {
      setTestResult(`Validation failed: ${newValidation.message}`);
      return;
    }

    setIsLoading(true);
    setTestResult('Testing connection...');

    try {
      const provider = LLMProviderFactory.getProvider(providerType);
      
      if (LLMProviderFactory.isLocalProvider(providerType)) {
        await provider.initialize(endpoint);
      } else {
        await provider.initialize(apiKey);
      }

      provider.setModel(selectedModel);
      
      const response = await provider.complete('Hello!');
      
      setTestResult(`Test successful!\nProvider: ${providerType}\nModel: ${selectedModel}\nResponse: ${response.content}`);
      
      await logger.info('Provider test successful', {
        provider: providerType,
        model: selectedModel
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      setTestResult(`Test failed: ${errorMessage}`);
      await logger.error('Provider test failed', {
        error: error instanceof Error ? error : String(error),
        provider: providerType
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    const newValidation = validateConfig();
    setValidation(newValidation);

    if (!newValidation.apiKey || !newValidation.endpoint || !newValidation.model) {
      setTestResult(`Validation failed: ${newValidation.message}`);
      return;
    }

    const config: ProviderConfig = {
      type: providerType,
      model: selectedModel
    };

    if (LLMProviderFactory.isLocalProvider(providerType)) {
      config.endpoint = endpoint;
    } else {
      config.apiKey = apiKey;
    }

    onSave(config);
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>{initialConfig ? 'Edit Provider' : 'Add Provider'}</h2>
        
        <div className="form-group">
          <label>Provider Type:</label>
          <select value={providerType} onChange={handleProviderChange}>
            {LLMProviderFactory.getProviderTypes().map(type => (
              <option key={type} value={type}>
                {LLMProviderFactory.getProviderName(type)}
              </option>
            ))}
          </select>
        </div>

        {!LLMProviderFactory.isLocalProvider(providerType) ? (
          <div className="form-group">
            <label>API Key:</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={!validation.apiKey ? 'error' : ''}
              placeholder="Enter your API key"
            />
            {!validation.apiKey && <span className="error-message">{validation.message}</span>}
          </div>
        ) : (
          <div className="form-group">
            <label>Endpoint:</label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className={!validation.endpoint ? 'error' : ''}
              placeholder="Enter the endpoint URL"
            />
            {!validation.endpoint && <span className="error-message">{validation.message}</span>}
          </div>
        )}

        <div className="form-group">
          <label>Model:</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className={!validation.model ? 'error' : ''}
          >
            <option value="">Select a model</option>
            {availableModels.map(model => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          {!validation.model && <span className="error-message">{validation.message}</span>}
        </div>

        <div className="test-result">
          {testResult && (
            <pre className={testResult.includes('failed') ? 'error' : 'success'}>
              {testResult}
            </pre>
          )}
        </div>

        <div className="button-group">
          <button onClick={handleTest} disabled={isLoading}>
            {isLoading ? 'Testing...' : 'Test Connection'}
          </button>
          <button onClick={handleSave} disabled={isLoading}>Save</button>
          <button onClick={onClose} disabled={isLoading}>Cancel</button>
        </div>
      </div>
    </div>
  );
}; 