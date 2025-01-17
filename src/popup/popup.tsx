import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LLMProviderFactory, ProviderType } from '../llm/LLMProviderFactory';
import { Logger } from '../utils/Logger';
import '../styles/popup.css';

interface Provider {
    type: ProviderType;
    name: string;
    apiKey?: string;
    endpoint?: string;
    model?: string;
}

interface PopupState {
    providers: Provider[];
    selectedProvider: string;
    command: string;
    isLoading: boolean;
    error: string | null;
    content: string | null;
    response: string | null;
}

const DEFAULT_COMMANDS = [
    'Summarize',
    'Paraphrase',
    'Bullet Points',
    'Translate',
    'Analyze Tone'
];

const Popup: React.FC = () => {
    const logger = Logger.getInstance();
    const [state, setState] = useState<PopupState>({
        providers: [],
        selectedProvider: '',
        command: DEFAULT_COMMANDS[0],
        isLoading: true,
        error: null,
        content: null,
        response: null
    });

    useEffect(() => {
        const initialize = async () => {
            try {
                // Load providers from storage
                const data = await chrome.storage.sync.get('providers');
                const storedProviders = data.providers || [];
                
                if (!Array.isArray(storedProviders) || storedProviders.length === 0) {
                    throw new Error('No providers configured');
                }

                logger.debug('Loaded providers', { providers: storedProviders });

                // Filter valid providers
                const validProviders = storedProviders.filter(provider => {
                    const isValid = (provider.apiKey || provider.endpoint) && 
                                 provider.type && 
                                 Object.values(LLMProviderFactory.getProviderTypes()).includes(provider.type);
                    if (!isValid) {
                        logger.debug('Invalid provider', { provider });
                    }
                    return isValid;
                });

                if (validProviders.length === 0) {
                    throw new Error('No valid providers configured');
                }

                logger.info('Found valid providers', { count: validProviders.length, providers: validProviders });

                // Initialize first provider
                const firstProvider = validProviders[0];
                const initResult = await chrome.runtime.sendMessage({
                    type: 'INITIALIZE_PROVIDER',
                    provider: firstProvider.type,
                    config: {
                        apiKey: firstProvider.apiKey,
                        endpoint: firstProvider.endpoint,
                        model: firstProvider.model
                    }
                });

                if (initResult?.error) {
                    throw new Error(`Provider initialization failed: ${initResult.error}`);
                }

                // Get page content
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab?.id) {
                    throw new Error('No active tab found');
                }

                // Try to get content first, if it fails then inject the script
                try {
                    const contentResponse = await chrome.tabs.sendMessage(tab.id, { 
                        type: 'GET_PAGE_CONTENT' 
                    });
                    
                    handleContentResponse(contentResponse, validProviders, firstProvider.type);
                } catch (error) {
                    logger.debug('Content script not ready, injecting...', { error });
                    
                    // Inject content script
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content/content.js']
                    });

                    // Wait for script to initialize
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Try getting content again
                    try {
                        const contentResponse = await chrome.tabs.sendMessage(tab.id, { 
                            type: 'GET_PAGE_CONTENT' 
                        });
                        
                        handleContentResponse(contentResponse, validProviders, firstProvider.type);
                    } catch (retryError) {
                        throw new Error('Failed to get page content after script injection');
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error('Initialization failed', { error: errorMessage });
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: errorMessage
                }));
            }
        };

        const handleContentResponse = (
            contentResponse: any, 
            validProviders: any[], 
            selectedProvider: string
        ) => {
            if (contentResponse?.error) {
                throw new Error(`Content extraction failed: ${contentResponse.error}`);
            }

            setState({
                providers: validProviders,
                selectedProvider: selectedProvider,
                command: DEFAULT_COMMANDS[0],
                isLoading: false,
                error: null,
                content: contentResponse.content,
                response: null
            });
        };

        initialize();
    }, []);

    const handleProcess = async () => {
        if (!state.content || !state.selectedProvider) return;

        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'PROCESS_CONTENT',
                provider: state.selectedProvider,
                command: state.command,
                content: state.content,
                title: document.title || ''
            });

            if (response?.error) {
                throw new Error(response.error);
            }

            setState(prev => ({
                ...prev,
                isLoading: false,
                response: response.content || ''
            }));

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Processing failed', { error: errorMessage });
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: errorMessage
            }));
        }
    };

    if (state.isLoading) {
        return (
            <div className="popup-container">
                <h1>Lirum Chrome LLMs</h1>
                <div className="loading">Loading...</div>
            </div>
        );
    }

    if (state.error) {
        return (
            <div className="popup-container">
                <h1>Lirum Chrome LLMs</h1>
                <div className="error-message">{state.error}</div>
                <div className="settings-link">
                    <a href="#" onClick={() => chrome.runtime.openOptionsPage()}>
                        Open Settings
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="popup-container">
            <h1>Lirum Chrome LLMs</h1>
            
            <div className="provider-section">
                <select 
                    value={state.selectedProvider}
                    onChange={e => setState(prev => ({ ...prev, selectedProvider: e.target.value }))}
                >
                    {state.providers.map(provider => (
                        <option key={provider.type} value={provider.type}>
                            {provider.name || provider.type}
                        </option>
                    ))}
                </select>
            </div>

            <div className="command-section">
                <select
                    value={state.command}
                    onChange={e => setState(prev => ({ ...prev, command: e.target.value }))}
                >
                    {DEFAULT_COMMANDS.map(cmd => (
                        <option key={cmd} value={cmd}>{cmd}</option>
                    ))}
                </select>
            </div>

            {state.response ? (
                <div className="response-section">
                    <pre>{state.response}</pre>
                </div>
            ) : state.content ? (
                <div className="content-preview">
                    <p>Content preview:</p>
                    <p className="content-snippet">
                        {state.content.length > 100 
                            ? `${state.content.slice(0, 100)}...` 
                            : state.content}
                    </p>
                </div>
            ) : null}

            <button 
                onClick={handleProcess}
                disabled={state.isLoading || !state.content}
                className={`submit-button ${state.isLoading ? 'loading' : ''}`}
            >
                {state.isLoading ? (
                    <span>
                        <span className="loading-spinner"></span>
                        Processing...
                    </span>
                ) : 'Process'}
            </button>

            <div className="settings-link">
                <a href="#" onClick={() => chrome.runtime.openOptionsPage()}>
                    Settings
                </a>
            </div>
        </div>
    );
};

// Initialize the popup
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>
); 