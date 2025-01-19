import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { LLMProviderFactory, ProviderType } from '../llm/LLMProviderFactory';
import { Logger } from '../utils/Logger';
import { markdownToHtml } from '../utils/markdown';
import '../styles/popup.css';
import '../styles/markdown.css';
import { StorageManager } from '../utils/StorageManager';

interface Provider {
    type: ProviderType;
    name: string;
    apiKey?: string;
    endpoint?: string;
    model?: string;
    providerId: string;
}

interface Command {
    name: string;
    icon: string;
    prompt: string;
}

const DEFAULT_COMMANDS: Command[] = [
    { name: 'Summarize', icon: 'fa-solid fa-compress', prompt: 'Please provide a concise summary of the following content:' },
    { name: 'Paraphrase', icon: 'fa-solid fa-pen', prompt: 'Please rewrite the following content in different words while maintaining its meaning:' },
    { name: 'Bullet Points', icon: 'fa-solid fa-list', prompt: 'Please convert the following content into clear, organized bullet points:' },
    { name: 'Translate', icon: 'fa-solid fa-language', prompt: 'Please translate the following content to English (or specify target language):' },
    { name: 'Analyze Tone', icon: 'fa-solid fa-face-smile', prompt: 'Please analyze the tone and emotional content of the following text:' }
];

interface PopupState {
    providers: Provider[];
    selectedProviderId: string;
    command: string;
    commands: Command[];
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

// Add a new class name helper function at the top level
const classNames = (...classes: (string | boolean | undefined)[]) => {
    return classes.filter(Boolean).join(' ');
};

// Add NoProvidersMessage component after the PopupState interface
const NoProvidersMessage: React.FC = () => {
    const handleSettings = () => {
        chrome.runtime.openOptionsPage();
    };

    return (
        <div className="no-providers-message">
            <div className="welcome-icon">
                <i className="fa-solid fa-wand-magic-sparkles fa-2x"></i>
            </div>
            <h2>Welcome to Lirum! 🎉</h2>
            <p>
                Let's get you started with your first AI provider! 🚀
            </p>
            <p>
                Lirum supports various AI providers like OpenAI, Anthropic, and local models through Ollama. 
                Click below to set up your preferred provider. ✨
            </p>
            <button className="primary-button" onClick={handleSettings}>
                <i className="fa-solid fa-gear"></i>
                Configure Provider
            </button>
        </div>
    );
};

const Popup: React.FC = () => {
    const logger = Logger.getInstance();
    const [state, setState] = useState<PopupState>({
        providers: [],
        selectedProviderId: '',
        command: '',
        commands: [],
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

                const storageManager = StorageManager.getInstance();
                const [providers, commands] = await Promise.all([
                    storageManager.listProviders(),
                    storageManager.listCommands()
                ]);

                // Filter valid providers
                const validProviders = providers.filter(provider => {
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
                    
                    handleContentResponse(contentResponse, validProviders, firstProvider, commands);
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
                        
                        handleContentResponse(contentResponse, validProviders, firstProvider, commands);
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
            validProviders: Provider[], 
            firstProvider: Provider,
            commands: Command[]
        ) => {
            if (contentResponse?.error) {
                throw new Error(`Content extraction failed: ${contentResponse.error}`);
            }

            setState({
                providers: validProviders,
                selectedProviderId: firstProvider.providerId,
                command: commands[0]?.name || '',
                commands: commands,
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
        if (!state.content || !state.selectedProviderId) return;

        const selectedProvider = state.providers.find(p => p.providerId === state.selectedProviderId);
        if (!selectedProvider) return;

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
                        
                        // Convert the entire response to HTML
                        const newHtml = markdownToHtml(newResponse);
                        
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
                provider: selectedProvider.type,
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

    if (state.error === 'No valid providers configured') {
        return (
            <NoProvidersMessage />
        );
    }

    if (state.error) {
        return (
            <div className="popup-container">
                <div className="header">
                    <img src="../assets/logo.png" alt="Lirum Logo" className="logo" />
                    <h1>Lirum Chrome LLMs</h1>
                </div>
                <div className="error-message">
                    <i className="fa-solid fa-exclamation-circle"></i>
                    <p>{state.error}</p>
                </div>
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
                    value={state.selectedProviderId} 
                    onChange={e => setState(prev => ({ ...prev, selectedProviderId: e.target.value }))}
                    disabled={state.isLoading}
                >
                    <option value="">Select Provider</option>
                    {state.providers.map(provider => (
                        <option key={provider.providerId} value={provider.providerId}>
                            {provider.name}
                        </option>
                    ))}
                </select>

                <select
                    className="command-select"
                    value={state.command}
                    onChange={e => setState(prev => ({ ...prev, command: e.target.value }))}
                    disabled={state.isLoading}
                >
                    {state.providers.length > 0 && state.commands.map(command => (
                        <option key={command.name} value={command.name}>
                            {command.name}
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