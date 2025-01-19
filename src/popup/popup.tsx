import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { LLMProviderFactory, ProviderType } from '../llm/LLMProviderFactory';
import { Logger } from '../utils/Logger';
import { markdownToHtml } from '../utils/markdown';
import '../styles/popup.css';
import '../styles/markdown.css';

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
    isInitializing: boolean;
    error: string | null;
    content: string | null;
    response: string | null;
    responseHtml: string;
    isChromeUrl: boolean;
    isInputExpanded: boolean;
    streamingPort: chrome.runtime.Port | null;
    isProcessing: boolean;
}

const DEFAULT_COMMANDS = [
    'Summarize',
    'Paraphrase',
    'Bullet Points',
    'Translate',
    'Analyze Tone'
];

// Add a new class name helper function at the top level
const classNames = (...classes: (string | boolean | undefined)[]) => {
    return classes.filter(Boolean).join(' ');
};

const Popup: React.FC = () => {
    const logger = Logger.getInstance();
    const [state, setState] = useState<PopupState>({
        providers: [],
        selectedProvider: '',
        command: DEFAULT_COMMANDS[0],
        isLoading: false,
        isInitializing: true,
        error: null,
        content: null,
        response: null,
        responseHtml: '',
        isChromeUrl: false,
        isInputExpanded: false,
        streamingPort: null,
        isProcessing: false
    });

    // Add a ref to track the response container for auto-scrolling
    const responseRef = useRef<HTMLDivElement>(null);

    // Add effect to auto-scroll as content streams in
    useEffect(() => {
        if (responseRef.current && state.response) {
            responseRef.current.scrollTop = responseRef.current.scrollHeight;
        }
    }, [state.response]);

    const handleChromeUrl = async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab.url?.startsWith('chrome://');
    };

    useEffect(() => {
        const initialize = async () => {
            try {
                // Check if we're on a chrome:// URL
                const isChromeUrl = await handleChromeUrl();
                if (isChromeUrl) {
                    setState(prev => ({
                        ...prev,
                        isInitializing: false,
                        error: null,
                        content: null,
                        response: null,
                        responseHtml: '',
                        isChromeUrl: true,
                        isInputExpanded: false,
                        isProcessing: false
                    }));
                    return;
                }

                // Load providers from both storage types
                const [syncData, localData, providerConfigs] = await Promise.all([
                    chrome.storage.sync.get('providers'),
                    chrome.storage.local.get('providers'),
                    chrome.storage.local.get(
                        Object.values(LLMProviderFactory.getProviderTypes())
                            .map(type => `${type}_provider_config`)
                    )
                ]);

                // Start with sync providers
                let allProviders = syncData.providers || [];

                // Merge with local storage providers
                if (localData.providers) {
                    localData.providers.forEach(localProvider => {
                        const existingIndex = allProviders.findIndex(p => p.type === localProvider.type);
                        if (existingIndex !== -1) {
                            allProviders[existingIndex] = {
                                ...allProviders[existingIndex],
                                ...localProvider
                            };
                        } else {
                            allProviders.push(localProvider);
                        }
                    });
                }

                // Merge with provider-specific configs
                Object.entries(providerConfigs).forEach(([key, config]) => {
                    if (!config) return;
                    const type = key.replace('_provider_config', '') as ProviderType;
                    const existingIndex = allProviders.findIndex(p => p.type === type);
                    
                    if (existingIndex !== -1) {
                        allProviders[existingIndex] = {
                            ...allProviders[existingIndex],
                            ...config,
                            type,
                            name: config.name || allProviders[existingIndex].name || LLMProviderFactory.getProviderName(type)
                        };
                    } else {
                        allProviders.push({
                            type,
                            name: config.name || LLMProviderFactory.getProviderName(type),
                            ...config
                        });
                    }
                });
                
                if (!Array.isArray(allProviders) || allProviders.length === 0) {
                    throw new Error('No providers configured');
                }

                // Log loaded providers (with redacted API keys)
                const redactedProviders = allProviders.map(p => ({
                    ...p,
                    apiKey: p.apiKey ? `${p.apiKey.slice(0,2)}....${p.apiKey.slice(-2)}` : undefined
                }));
                logger.info('Popup providers loaded', { count: allProviders.length, providers: redactedProviders });

                // Filter valid providers
                const validProviders = allProviders.filter(provider => {
                    const isValid = (provider.apiKey || provider.endpoint) && 
                                 provider.type && 
                                 Object.values(LLMProviderFactory.getProviderTypes()).includes(provider.type);
                    if (!isValid) {
                        logger.debug('Invalid provider', { 
                            type: provider.type,
                            name: provider.name,
                            hasApiKey: Boolean(provider.apiKey),
                            hasEndpoint: Boolean(provider.endpoint)
                        });
                    }
                    return isValid;
                });

                if (validProviders.length === 0) {
                    throw new Error('No valid providers configured');
                }

                logger.info('Valid providers filtered', { count: validProviders.length });

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
                    isInitializing: false,
                    error: errorMessage,
                    isChromeUrl: false,
                    isInputExpanded: false
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
                isInitializing: false,
                error: null,
                content: contentResponse.content,
                response: null,
                responseHtml: '',
                isChromeUrl: false,
                isInputExpanded: false,
                streamingPort: null,
                isProcessing: false
            });
        };

        initialize();
    }, []);

    const handleProcess = async () => {
        if (!state.content || !state.selectedProvider) return;

        setState(prev => ({ 
            ...prev, 
            isLoading: true, 
            error: null, 
            response: '', 
            responseHtml: '',
            isChromeUrl: false,
            isInputExpanded: false,
            isProcessing: true
        }));

        try {
            // Create a port for streaming
            const port = chrome.runtime.connect({ name: 'llm_stream' });
            
            setState(prev => ({ ...prev, streamingPort: port }));

            // Set up port message handlers
            port.onMessage.addListener((message) => {
                if (message.type === 'STREAM_CHUNK') {
                    setState(prev => {
                        // Only process if we're still streaming
                        if (!prev.streamingPort) return prev;

                        // Create new response by concatenating the new chunk
                        const newResponse = (prev.response || '') + message.content;
                        
                        // Only convert the new chunk to HTML for efficiency
                        const newChunkHtml = message.content ? markdownToHtml(message.content) : '';
                        const newHtml = prev.responseHtml + newChunkHtml;
                        
                        return {
                            ...prev,
                            response: newResponse,
                            responseHtml: newHtml,
                            isLoading: true
                        };
                    });

                    if (message.done) {
                        setState(prev => {
                            if (!prev.streamingPort) return prev;

                            port.disconnect();
                            return {
                                ...prev,
                                isLoading: false,
                                streamingPort: null,
                                isProcessing: false
                            };
                        });
                    }
                } else if (message.type === 'STREAM_ERROR') {
                    setState(prev => {
                        if (!prev.streamingPort) return prev;
                        
                        port.disconnect();
                        return {
                            ...prev,
                            isLoading: false,
                            error: message.error,
                            streamingPort: null,
                            isProcessing: false
                        };
                    });
                }
            });

            // Send the request through the port
            port.postMessage({
                type: 'PROCESS_CONTENT',
                provider: state.selectedProvider,
                command: state.command,
                content: state.content,
                title: document.title || '',
                stream: true
            });

        } catch (error) {
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: error instanceof Error ? error.message : String(error),
                isProcessing: false
            }));
        }
    };

    const handleSettings = () => {
        chrome.runtime.openOptionsPage();
    };

    const toggleInput = () => {
        setState(prev => ({ ...prev, isInputExpanded: !prev.isInputExpanded }));
    };

    // Add cleanup on unmount
    useEffect(() => {
        return () => {
            if (state.streamingPort) {
                state.streamingPort.disconnect();
            }
        };
    }, [state.streamingPort]);

    if (state.isInitializing) {
        return (
            <div className="popup-container">
                <div className="header">
                    <img src="../assets/logo.png" alt="Lirum Logo" className="logo" />
                    <h1>Lirum Chrome LLMs</h1>
                </div>
                <div className="loading-bar" />
            </div>
        );
    }

    if (state.isChromeUrl) {
        return (
            <div className="popup-container">
                <div className="header">
                    <img src="../assets/logo.png" alt="Lirum Logo" className="logo" />
                    <h1>Welcome to Lirum</h1>
                </div>
                
                <div className="onboarding-message">
                    <p>👋 Hi! Lirum can't work directly on Chrome system pages, but here's how to get started:</p>
                    
                    <div className="steps">
                        <div className="step">
                            <span className="step-number">1</span>
                            <p>Navigate to any website (e.g., news article, blog post, documentation)</p>
                        </div>
                        <div className="step">
                            <span className="step-number">2</span>
                            <p>(Optional) Select some text on the page</p>
                        </div>
                        <div className="step">
                            <span className="step-number">3</span>
                            <p>Open the Lirum extension and choose your action!</p>
                        </div>
                    </div>

                    <div className="button-group">
                        <button
                            onClick={handleSettings}
                            className="secondary"
                        >
                            Configure Settings
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (state.error) {
        return (
            <div className="popup-container">
                <div className="header">
                    <img src="../assets/logo.png" alt="Lirum Logo" className="logo" />
                    <h1>Lirum Chrome LLMs</h1>
                </div>
                <div className="error-message">{state.error}</div>
            </div>
        );
    }

    return (
        <div className="popup-container">
            <div className="header">
                <img src="../assets/logo.png" alt="Lirum Logo" className="logo" />
                <h1>Lirum Chrome LLMs</h1>
            </div>

            <div className="controls">
                <select 
                    value={state.selectedProvider} 
                    onChange={e => setState(prev => ({ ...prev, selectedProvider: e.target.value }))}
                    disabled={state.isLoading}
                >
                    <option value="">Select Provider</option>
                    {state.providers.map(provider => (
                        <option key={provider.type} value={provider.type}>
                            {provider.name}
                        </option>
                    ))}
                </select>

                <select 
                    value={state.command}
                    onChange={e => setState(prev => ({ ...prev, command: e.target.value }))}
                    disabled={state.isLoading}
                >
                    {DEFAULT_COMMANDS.map(command => (
                        <option key={command} value={command}>
                            {command}
                        </option>
                    ))}
                </select>
            </div>

            {state.content && (
                <div className="preview">
                    <button 
                        className="expand-input"
                        onClick={toggleInput}
                        aria-expanded={state.isInputExpanded}
                    >
                        <span className="expand-icon">{state.isInputExpanded ? '▼' : '▶'}</span>
                        Input
                    </button>
                    {state.isInputExpanded && (
                        <div className="input-content">
                            <p>{state.content}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Response container - always visible */}
            <div className="response">
                <div className="response-header">
                    <h2>Output</h2>
                    {state.isLoading && (
                        <div className="streaming-indicator">
                            <div className="loading-dots"></div>
                            <span>Streaming...</span>
                        </div>
                    )}
                </div>
                {state.isLoading && <div className="loading-bar" />}
                <div 
                    ref={responseRef}
                    className={classNames(
                        'markdown-content',
                        state.isLoading ? 'streaming' : 'done'
                    )}
                    dangerouslySetInnerHTML={{ 
                        __html: state.responseHtml || ''
                    }}
                    style={{
                        minHeight: '60px',
                        opacity: 1,
                        visibility: 'visible',
                        display: 'block'
                    }}
                />
            </div>

            <div className="button-group">
                <button
                    onClick={handleProcess}
                    disabled={!state.content || state.isLoading}
                >
                    Process
                </button>
                <button
                    onClick={handleSettings}
                    disabled={state.isLoading}
                >
                    Settings
                </button>
            </div>

            {state.error && (
                <div className="error-message">
                    {state.error}
                </div>
            )}
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