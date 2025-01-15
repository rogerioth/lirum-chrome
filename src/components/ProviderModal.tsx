import React, { useState, useEffect } from 'react';
import { LLMProviderFactory, ProviderType } from '../llm/LLMProviderFactory';
import { Logger } from '../utils/Logger';

interface ProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: ProviderConfig) => void;
  initialConfig?: ProviderConfig;
}

interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  model: string;
  endpoint?: string;
}

export const ProviderModal: React.FC<ProviderModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialConfig
}) => {
  const [config, setConfig] = useState<ProviderConfig>({
    type: 'openai',
    apiKey: '',
    model: '',
    endpoint: ''
  });
  const [testResult, setTestResult] = useState<string>('');
  const [isTesting, setIsTesting] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
  }, [initialConfig]);

  useEffect(() => {
    // Update available models when provider type changes
    const models = LLMProviderFactory.getAvailableModels(config.type);
    setAvailableModels(models);
    setConfig(prev => ({
      ...prev,
      model: LLMProviderFactory.getDefaultModel(config.type)
    }));

    // Set default endpoint for local providers
    if (LLMProviderFactory.isLocalProvider(config.type)) {
      setConfig(prev => ({
        ...prev,
        endpoint: LLMProviderFactory.getDefaultEndpoint(config.type) || ''
      }));
    }
  }, [config.type]);

  const handleProviderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setConfig(prev => ({
      ...prev,
      type: event.target.value as ProviderType,
      apiKey: ''
    }));
    setTestResult('');
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setConfig(prev => ({ ...prev, [name]: value }));
    setTestResult('');
  };

  const handleModelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setConfig(prev => ({ ...prev, model: event.target.value }));
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult('');

    try {
      const provider = LLMProviderFactory.getProvider(config.type);
      
      // Initialize with API key or endpoint
      if (LLMProviderFactory.isLocalProvider(config.type)) {
        await provider.initialize(config.endpoint!);
      } else {
        await provider.initialize(config.apiKey);
      }

      // Set the selected model
      provider.setModel(config.model);

      // Send a test message
      const response = await provider.complete('Hello!');
      setTestResult(`Test successful! Response: ${response.content}`);
      
      await Logger.getInstance().info('Provider test successful', {
        provider: config.type,
        model: config.model
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      setTestResult(`Test failed: ${errorMessage}`);
      await Logger.getInstance().error('Provider test failed', { 
        error: error instanceof Error ? error : String(error)
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>{initialConfig ? 'Edit Provider' : 'Add Provider'}</h2>
        
        <div className="form-group">
          <label>Provider:</label>
          <select value={config.type} onChange={handleProviderChange}>
            {LLMProviderFactory.getProviderTypes().map(type => (
              <option key={type} value={type}>
                {LLMProviderFactory.getProviderName(type)}
              </option>
            ))}
          </select>
        </div>

        {LLMProviderFactory.isLocalProvider(config.type) ? (
          <div className="form-group">
            <label>Endpoint:</label>
            <input
              type="text"
              name="endpoint"
              value={config.endpoint}
              onChange={handleInputChange}
              placeholder="http://localhost:port"
            />
          </div>
        ) : (
          <div className="form-group">
            <label>API Key:</label>
            <input
              type="password"
              name="apiKey"
              value={config.apiKey}
              onChange={handleInputChange}
              placeholder="Enter API key"
            />
          </div>
        )}

        <div className="form-group">
          <label>Model:</label>
          <select value={config.model} onChange={handleModelChange}>
            {availableModels.map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>

        <div className="test-section">
          <button 
            onClick={handleTest} 
            disabled={isTesting || (!config.apiKey && !config.endpoint)}
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          {testResult && (
            <div className={`test-result ${testResult.includes('failed') ? 'error' : 'success'}`}>
              {testResult}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button 
            onClick={handleSave}
            disabled={!config.model || (!config.apiKey && !config.endpoint)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}; 