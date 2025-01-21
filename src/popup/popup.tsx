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
    noProvidersConfigured: boolean;
}

const classNames = (...classes: (string | boolean | undefined)[]) => {
    return classes.filter(Boolean).join(' ');
};

const NoProvidersMessage: React.FC = () => {
    const handleSettings = () => {
        StorageManager.getInstance().openOptionsPage();
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

export const Popup: React.FC = () => {
    const logger = Logger.getInstance();
    const storageManager = StorageManager.getInstance();
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
        isProcessing: false,
        noProvidersConfigured: false
    });

    const responseRef = useRef<HTMLDivElement>(null);

    const handleChromeUrl = async () => {
        const tab = await storageManager.getCurrentTab();
        return tab?.url?.startsWith('chrome://') || false;
    };

    useEffect(() => {
        const initialize = async () => {
            try {
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

                const [providers, commands] = await Promise.all([
                    storageManager.listProviders(),
                    storageManager.listCommands()
                ]);

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

                const firstProvider = validProviders[0];
                const initResult = await storageManager.sendRuntimeMessage({
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

                const tab = await storageManager.getCurrentTab();
                if (!tab?.id) {
                    throw new Error('No active tab found');
                }

                try {
                    const contentResponse = await storageManager.sendMessageToTab(tab.id, { 
                        type: 'GET_PAGE_CONTENT' 
                    });
                    
                    handleContentResponse(contentResponse, validProviders, firstProvider, commands);
                } catch (error) {
                    logger.debug('Content script not ready, injecting...', { error });
                    
                    await storageManager.executeScriptInTab(tab.id, ['content/content.js']);

                    await new Promise(resolve => setTimeout(resolve, 500));

                    try {
                        const contentResponse = await storageManager.sendMessageToTab(tab.id, { 
                            type: 'GET_PAGE_CONTENT' 
                        });
                        
                        handleContentResponse(contentResponse, validProviders, firstProvider, commands);
                    } catch (retryError) {
                        throw new Error('Failed to get page content after script injection');
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
                setState(prev => ({
                    ...prev,
                    isInitializing: false,
                    error: errorMessage,
                    isChromeUrl: false,
                    isInputExpanded: false,
                    noProvidersConfigured: errorMessage === 'No valid providers configured'
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
                isProcessing: false,
                noProvidersConfigured: false
            });
        };

        initialize();
    }, []);

    useEffect(() => {
        if (responseRef.current) {
            responseRef.current.scrollTop = responseRef.current.scrollHeight;
        }
    }, [state.responseHtml]);

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
            const port = storageManager.connectToRuntime('llm_stream');
            
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
                        
                        // If this is the final chunk, complete the streaming
                        if (message.done) {
                            port.disconnect();
                            return {
                                ...prev,
                                response: newResponse,
                                responseHtml: newHtml,
                                isLoading: false,
                                streamingPort: null,
                                isProcessing: false
                            };
                        }

                        return {
                            ...prev,
                            response: newResponse,
                            responseHtml: newHtml,
                            isLoading: true
                        };
                    });
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
                config: {
                    apiKey: selectedProvider.apiKey,
                    endpoint: selectedProvider.endpoint,
                    model: selectedProvider.model
                },
                providerId: selectedProvider.providerId,
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
        storageManager.openOptionsPage();
    };

    const handleExpand = async () => {
        if (!state.responseHtml) return;
        
        // Generate a unique ID for this result
        const resultId = `result_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        // Store the content in chrome.storage.local
        await chrome.storage.local.set({
            [`lirum_${resultId}`]: {
                content: state.responseHtml,
                timestamp: Date.now()
            }
        });
        
        // Open result page with just the ID
        const resultUrl = chrome.runtime.getURL(`result/result.html?id=${resultId}`);
        await chrome.tabs.create({ url: resultUrl });
    };

    const toggleInput = () => {
        setState(prev => ({ ...prev, isInputExpanded: !prev.isInputExpanded }));
    };

    // Check if we're in fullpage mode
    const isFullPage = new URLSearchParams(window.location.search).get('mode') === 'fullpage';

    useEffect(() => {
        return () => {
            if (state.streamingPort) {
                state.streamingPort.disconnect();
            }
        };
    }, [state.streamingPort]);

    useEffect(() => {
        if (isFullPage) {
            document.body.classList.add('fullpage-mode');
        }
        return () => {
            document.body.classList.remove('fullpage-mode');
        };
    }, [isFullPage]);

    if (state.isInitializing) {
        return (
            <div className={classNames('popup-container', isFullPage && 'fullpage')}>
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                </div>
            </div>
        );
    }

    if (state.isChromeUrl) {
        return (
            <div className={classNames('popup-container', isFullPage && 'fullpage')}>
                <div className="header-section">
                    <div className="header-icon">
                        <img src="../assets/icon128.png" alt="Lirum Logo" />
                    </div>
                    <div className="header-title">
                        <h1>Lirum</h1>
                    </div>
                    <div className="header-actions">
                        {!isFullPage && (
                            <button 
                                className="icon-button" 
                                onClick={handleExpand} 
                                title="Open in new tab">
                                <i className="fa-solid fa-expand"></i>
                            </button>
                        )}
                        <button 
                            className="icon-button" 
                            onClick={handleSettings} 
                            title="Settings">
                            <i className="fa-solid fa-gear"></i>
                        </button>
                    </div>
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
                            <p>Click the Lirum icon to analyze the content</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={classNames('popup-container', isFullPage && 'fullpage')}>
            <div className="header-section">
                <div className="header-icon">
                    <img src="../assets/icon128.png" alt="Lirum Logo" />
                </div>
                <div className="header-title">
                    <h1>Lirum</h1>
                </div>
                <div className="header-actions">
                    {!isFullPage && (
                        <button 
                            className="icon-button" 
                            onClick={handleExpand} 
                            title="Open in new tab">
                            <i className="fa-solid fa-expand"></i>
                        </button>
                    )}
                    <button 
                        className="icon-button" 
                        onClick={handleSettings} 
                        title="Settings">
                        <i className="fa-solid fa-gear"></i>
                    </button>
                </div>
            </div>

            {state.noProvidersConfigured ? (
                <NoProvidersMessage />
            ) : (
                <>
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

                    <div className="response">
                        <div className="response-header">
                            <h2>Output</h2>
                            {state.isLoading && (
                                <div className="streaming-indicator">
                                    <div className="loading-dots"></div>
                                    <span>Streaming...</span>
                                </div>
                            )}
                            {!state.isLoading && state.responseHtml && (
                                <button 
                                    className="icon-button" 
                                    onClick={handleExpand} 
                                    title="Open in new tab">
                                    <i className="fa-solid fa-expand"></i>
                                </button>
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
                </>
            )}
        </div>
    );
};

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