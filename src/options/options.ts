import { LLMProvider as Provider } from '../llm/LLMProvider';
import { OpenAIProvider } from '../llm/OpenAIProvider';
import { AnthropicProvider } from '../llm/AnthropicProvider';
import { OllamaProvider } from '../llm/OllamaProvider';
import { DeepseekProvider } from '../llm/DeepseekProvider';
import { LMStudioProvider } from '../llm/LMStudioProvider';
import { Logger, LogLevel } from '../utils/Logger';
import '../styles/options.css';

interface LLMProvider {
    type: string;
    name: string;
    endpoint?: string;
    apiKey?: string;
    model: string;
}

type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'deepseek' | 'lmstudio';

const PROVIDER_TYPES: ProviderType[] = ['openai', 'anthropic', 'ollama', 'deepseek', 'lmstudio'];

interface Command {
    name: string;
    description: string;
}

const DEFAULT_COMMANDS: Command[] = [
    { name: 'Summarize', description: 'Create a summary of the page content' },
    { name: 'Paraphrase', description: 'Rewrite the content in different words' },
    { name: 'Bullet Points', description: 'Convert content into bullet points' },
    { name: 'Translate', description: 'Translate the content to another language' },
    { name: 'Analyze Tone', description: 'Analyze the tone of the content' }
];

// Add navigation handling
function initializeNavigation(): void {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = (link as HTMLAnchorElement).getAttribute('href')?.substring(1);
            
            // Update active states
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Show target section
            sections.forEach(section => {
                if (section instanceof HTMLElement) {
                    if (section.id === targetId) {
                        section.classList.add('active');
                    } else {
                        section.classList.remove('active');
                    }
                }
            });
        });
    });
}

class OptionsManager {
    private providers: LLMProvider[] = [];
    private commands: Command[] = [];
    private selectedProviderIndex: number = -1;
    private readonly logger: Logger;

    constructor() {
        this.logger = Logger.getInstance();
        this.initializeEventListeners();
        this.loadSettings();
    }

    private getProviderInstance(type: ProviderType): Provider {
        switch (type) {
            case 'openai':
                return new OpenAIProvider();
            case 'anthropic':
                return new AnthropicProvider();
            case 'ollama':
                return new OllamaProvider();
            case 'deepseek':
                return new DeepseekProvider();
            case 'lmstudio':
                return new LMStudioProvider();
            default:
                throw new Error(`Unknown provider type: ${type}`);
        }
    }

    private isLocalProvider(type: ProviderType): boolean {
        return type === 'ollama' || type === 'lmstudio';
    }

    private async testProvider(): Promise<void> {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
        const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement;
        const modelInput = document.getElementById('provider-model') as HTMLInputElement;
        const testButton = document.getElementById('test-provider') as HTMLButtonElement;

        try {
            this.setLoading(testButton, true);
            const type = typeSelect.value as ProviderType;
            const provider = this.getProviderInstance(type);
            const isLocal = this.isLocalProvider(type);

            // Validate inputs
            if (!endpointInput.value) {
                throw new Error('Endpoint is required');
            }
            if (endpointInput.value && provider.validateEndpoint?.(endpointInput.value) === false) {
                throw new Error('Invalid endpoint URL format. Please provide a valid HTTP/HTTPS URL.');
            }

            if (!isLocal && !apiKeyInput.value) {
                throw new Error('API key is required');
            }
            if (!isLocal && apiKeyInput.value && provider.validateApiKey?.(apiKeyInput.value) === false) {
                throw new Error('Invalid API key format.');
            }

            // Set endpoint before initialization
            provider.defaultEndpoint = endpointInput.value;

            // Initialize provider
            await provider.initialize(isLocal ? endpointInput.value : apiKeyInput.value);

            // Set model if provided (no validation)
            const modelToUse = modelInput.value || provider.defaultModel;
            provider.setModel(modelToUse);

            const response = await provider.complete('Hello!');
            
            await this.logger.info('Provider test successful', {
                type,
                model: modelToUse,
                endpoint: endpointInput.value,
                response: response.content
            });

            this.showMessage(`Connection test successful!\nEndpoint: ${endpointInput.value}\nModel: ${modelToUse}\nResponse: ${response.content}`, false, true);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Test failed';
            await this.logger.error('Provider test failed', { 
                error: errorMessage,
                endpoint: endpointInput.value
            });
            this.showMessage(errorMessage, true, true);
        } finally {
            this.setLoading(testButton, false);
        }
    }

    private showMessage(message: string, isError: boolean = false, isTest: boolean = false): void {
        const messageContainer = document.getElementById('modal-message');
        if (!messageContainer) return;

        messageContainer.textContent = message;
        messageContainer.className = `message-container ${isError ? 'error' : 'success'}`;
        messageContainer.style.display = 'block';

        if (!isTest) {
            setTimeout(() => {
                messageContainer.style.display = 'none';
            }, 3000);
        }
    }

    private initializeEventListeners(): void {
        // Initialize navigation
        initializeNavigation();

        // Provider management
        document.getElementById('add-provider')?.addEventListener('click', async () => {
            await this.logger.info('Opening add provider modal');
            this.showProviderModal();
        });

        document.getElementById('edit-provider')?.addEventListener('click', async () => {
            await this.logger.info('Opening edit provider modal', { providerIndex: this.selectedProviderIndex });
            this.editSelectedProvider();
        });

        document.getElementById('remove-provider')?.addEventListener('click', async () => {
            await this.logger.info('Removing provider', { providerIndex: this.selectedProviderIndex });
            this.removeSelectedProvider();
        });

        // Provider selection
        const providersList = document.getElementById('providers-list') as HTMLSelectElement;
        if (providersList) {
            providersList.addEventListener('change', async () => {
                this.selectedProviderIndex = parseInt(providersList.value);
                await this.logger.debug('Provider selected', { index: this.selectedProviderIndex });
                this.updateProviderButtons();
            });
        }

        // Modal events
        document.getElementById('modal-cancel')?.addEventListener('click', () => {
            this.hideProviderModal();
        });

        document.getElementById('test-provider')?.addEventListener('click', () => {
            this.testProvider();
        });

        document.getElementById('modal-save')?.addEventListener('click', () => {
            this.saveProviderModal();
        });

        // Provider type change
        const typeSelect = document.getElementById('provider-type');
        const nameInput = document.getElementById('provider-name') as HTMLInputElement;
        
        typeSelect?.addEventListener('change', () => {
            // Only update name if it's empty or matches a previous type
            if (!nameInput.value || PROVIDER_TYPES.includes(nameInput.value as ProviderType)) {
                nameInput.value = (typeSelect as HTMLSelectElement).value;
            }
            this.updateProviderFields();
            this.updateModelsList();
        });

        // Logs management
        document.getElementById('clear-logs')?.addEventListener('click', async () => {
            await this.logger.info('Clearing logs');
            await this.clearLogs();
        });

        document.getElementById('export-logs')?.addEventListener('click', async () => {
            await this.logger.info('Exporting logs');
            await this.exportLogs();
        });

        // Log filters
        const logFilters = document.querySelectorAll('.log-filter input');
        logFilters.forEach(filter => {
            filter.addEventListener('change', () => {
                this.updateLogFilters();
            });
        });

        // Initialize logs display
        this.initializeLogs();
    }

    private async initializeLogs(): Promise<void> {
        await this.displayLogs();
        
        // Set up periodic refresh
        setInterval(async () => {
            await this.displayLogs();
        }, 2000); // Refresh every 2 seconds
    }

    private async displayLogs(): Promise<void> {
        const logsOutput = document.getElementById('logs-output');
        if (!logsOutput) return;

        const logsJson = await this.logger.exportLogs();
        const logs = JSON.parse(logsJson);
        const activeFilters = this.getActiveLogFilters();

        const filteredLogs = logs.filter(log => activeFilters.includes(log.level));
        
        logsOutput.innerHTML = filteredLogs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            const details = log.details ? ` ${JSON.stringify(log.details)}` : '';
            
            return `<div class="log-entry ${log.level}"><span class="log-timestamp">[${timestamp}]</span> <span class="log-level">[${log.level.toUpperCase()}]</span> <span class="log-message">${log.message}${details}</span></div>`;
        }).join('');

        // Scroll to bottom if already at bottom
        if (logsOutput.scrollHeight - logsOutput.scrollTop === logsOutput.clientHeight) {
            logsOutput.scrollTop = logsOutput.scrollHeight;
        }
    }

    private getActiveLogFilters(): LogLevel[] {
        const filters = document.querySelectorAll('.log-filter input:checked');
        return Array.from(filters).map(filter => (filter as HTMLInputElement).value as LogLevel);
    }

    private updateLogFilters(): void {
        this.displayLogs();
    }

    private async clearLogs(): Promise<void> {
        // Clear logs by setting an empty array
        await chrome.storage.local.set({ logs: [] });
        await this.displayLogs();
    }

    private async exportLogs(): Promise<void> {
        const logsJson = await this.logger.exportLogs();
        const blob = new Blob([logsJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `lirum-logs-${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private async loadSettings(): Promise<void> {
        try {
            const settings = await chrome.storage.sync.get(['providers', 'commands']);
            
            if (settings.providers) {
                this.providers = settings.providers;
                await this.logger.info('Providers loaded', { count: this.providers.length });
            }

            if (settings.commands) {
                this.commands = settings.commands;
                await this.logger.info('Commands loaded', { count: this.commands.length });
            }
            
            this.renderProviders();
            this.renderCommands();
        } catch (error) {
            await this.logger.error('Failed to load settings', { error });
        }
    }

    private async saveProviderModal(): Promise<void> {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const nameInput = document.getElementById('provider-name') as HTMLInputElement;
        const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
        const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement;
        const modelInput = document.getElementById('provider-model') as HTMLInputElement;
        const saveButton = document.getElementById('modal-save') as HTMLButtonElement;

        try {
            this.setLoading(saveButton, true);
            const type = typeSelect.value as ProviderType;
            const isLocal = this.isLocalProvider(type);

            if (!nameInput.value) {
                throw new Error('Provider name is required');
            }

            if (isLocal && !endpointInput.value) {
                throw new Error('Endpoint is required');
            }

            if (!isLocal && !apiKeyInput.value) {
                throw new Error('API key is required');
            }

            const provider: LLMProvider = {
                type,
                name: nameInput.value,
                model: modelInput.value || this.getProviderInstance(type).defaultModel
            };

            if (isLocal) {
                provider.endpoint = endpointInput.value;
            } else {
                provider.apiKey = apiKeyInput.value;
            }

            if (this.selectedProviderIndex !== -1) {
                this.providers[this.selectedProviderIndex] = provider;
                await this.logger.info('Provider updated', { name: provider.name, type: provider.type });
            } else {
                this.providers.push(provider);
                await this.logger.info('New provider added', { name: provider.name, type: provider.type });
            }

            await this.saveSettings();
            this.renderProviders();
            this.hideProviderModal();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to save provider';
            this.showMessage(errorMessage, true);
            await this.logger.error('Failed to save provider', { error });
        } finally {
            this.setLoading(saveButton, false);
        }
    }

    private renderProviders(): void {
        const providersList = document.getElementById('providers-list');
        if (!providersList) return;

        providersList.innerHTML = '';
        this.providers.forEach((provider, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            option.textContent = `  ${provider.name} (${provider.type})`;
            providersList.appendChild(option);
        });

        this.updateProviderButtons();
    }

    private updateProviderButtons(): void {
        const editBtn = document.getElementById('edit-provider') as HTMLButtonElement;
        const removeBtn = document.getElementById('remove-provider') as HTMLButtonElement;
        
        if (editBtn && removeBtn) {
            const hasSelection = this.selectedProviderIndex !== -1;
            editBtn.disabled = !hasSelection;
            removeBtn.disabled = !hasSelection;
        }
    }

    private showProviderModal(provider?: LLMProvider): void {
        const modal = document.getElementById('provider-modal');
        if (!modal) return;

        // Reset form
        const nameInput = document.getElementById('provider-name') as HTMLInputElement;
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement;
        const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
        const modelInput = document.getElementById('provider-model') as HTMLInputElement;
        
        // Populate provider types with correct capitalization
        typeSelect.innerHTML = '';
        const providerNames = {
            'openai': 'OpenAI',
            'anthropic': 'Anthropic',
            'ollama': 'Ollama',
            'deepseek': 'Deepseek',
            'lmstudio': 'LMStudio'
        };
        
        PROVIDER_TYPES.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = providerNames[type];
            typeSelect.appendChild(option);
        });
        
        if (provider) {
            nameInput.value = provider.name;
            typeSelect.value = provider.type;
            apiKeyInput.value = provider.apiKey || '';
            endpointInput.value = provider.endpoint || '';
            modelInput.value = provider.model || '';
        } else {
            nameInput.value = '';
            typeSelect.value = PROVIDER_TYPES[0];
            apiKeyInput.value = '';
            endpointInput.value = '';
            modelInput.value = '';
        }
        
        this.updateProviderFields();
        this.updateModelsList();
        modal.style.display = 'flex';
    }

    private hideProviderModal(): void {
        const modal = document.getElementById('provider-modal');
        if (!modal) return;

        modal.style.display = 'none';
        const messageContainer = document.getElementById('modal-message');
        if (messageContainer) {
            messageContainer.style.display = 'none';
        }
    }

    private updateProviderName(): void {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const nameInput = document.getElementById('provider-name') as HTMLInputElement;
        
        if (typeSelect && nameInput && !nameInput.value) {
            nameInput.value = typeSelect.value;
        }
    }

    private addNewCommand(): void {
        const commandsList = document.getElementById('commands-list');
        if (!commandsList) return;

        const commandDiv = document.createElement('div');
        commandDiv.className = 'provider-section';
        commandDiv.innerHTML = `
            <input type="text" placeholder="Command name" class="api-key-input">
            <input type="text" placeholder="Command description" class="api-key-input">
            <button class="save-button">Remove</button>
        `;

        const removeBtn = commandDiv.querySelector('button');
        removeBtn?.addEventListener('click', () => {
            commandDiv.remove();
            this.updateCommandsList();
        });

        commandsList.appendChild(commandDiv);
    }

    private updateCommandsList(): void {
        const commandDivs = document.querySelectorAll('#commands-list > div');
        this.commands = Array.from(commandDivs).map(div => {
            const inputs = div.querySelectorAll('input');
            return {
                name: inputs[0].value,
                description: inputs[1].value
            };
        });
    }

    private renderCommands(): void {
        const commandsList = document.getElementById('commands-list');
        if (!commandsList) return;

        commandsList.innerHTML = '';
        this.commands.forEach(command => {
            const commandDiv = document.createElement('div');
            commandDiv.className = 'provider-section';
            commandDiv.innerHTML = `
                <input type="text" value="${command.name}" placeholder="Command name" class="api-key-input">
                <input type="text" value="${command.description}" placeholder="Command description" class="api-key-input">
                <button class="save-button">Remove</button>
            `;

            const removeBtn = commandDiv.querySelector('button');
            removeBtn?.addEventListener('click', () => {
                commandDiv.remove();
                this.updateCommandsList();
            });

            commandsList.appendChild(commandDiv);
        });
    }

    private editSelectedProvider(): void {
        const select = document.getElementById('providers-list') as HTMLSelectElement;
        if (!select || select.selectedIndex === -1) return;

        this.selectedProviderIndex = parseInt(select.value);
        const provider = this.providers[this.selectedProviderIndex];
        this.showProviderModal(provider);
    }

    private removeSelectedProvider(): void {
        const select = document.getElementById('providers-list') as HTMLSelectElement;
        if (!select || select.selectedIndex === -1) return;

        this.selectedProviderIndex = parseInt(select.value);
        this.providers.splice(this.selectedProviderIndex, 1);
        this.selectedProviderIndex = -1;
        
        this.renderProviders();
        this.saveSettings();
    }

    private async saveSettings(): Promise<void> {
        try {
            await chrome.storage.sync.set({
                providers: this.providers,
                commands: this.commands
            });
            this.showMessage('Settings saved successfully!');
        } catch (error) {
            this.showMessage('Error saving settings!', true);
            console.error('Error saving settings:', error);
        }
    }

    private updateProviderFields(): void {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const apiKeyGroup = document.getElementById('api-key-group');
        const endpointGroup = document.getElementById('endpoint-group');
        
        const type = typeSelect.value as ProviderType;
        const isLocal = this.isLocalProvider(type);
        const provider = this.getProviderInstance(type);
        
        // Show/hide API key field based on provider type
        if (apiKeyGroup) {
            apiKeyGroup.style.display = isLocal ? 'none' : 'block';
        }
        
        // Always show endpoint field and set default values
        if (endpointGroup) {
            endpointGroup.style.display = 'block';
            const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
            
            // Clear the current value and set the new default
            endpointInput.value = '';
            if (provider.defaultEndpoint) {
                endpointInput.value = provider.defaultEndpoint;
            }
            
            // Set appropriate placeholder text
            if (isLocal) {
                endpointInput.placeholder = 'Enter endpoint URL (e.g., http://localhost:11434)';
                if (type === 'ollama') {
                    endpointInput.value = 'http://localhost:11434';
                } else if (type === 'lmstudio') {
                    endpointInput.value = 'http://localhost:1234';
                }
            } else if (type === 'openai') {
                endpointInput.placeholder = 'Enter endpoint URL (optional, defaults to api.openai.com)';
                endpointInput.value = 'https://api.openai.com/v1';
            } else if (type === 'anthropic') {
                endpointInput.placeholder = 'Enter endpoint URL (optional, defaults to api.anthropic.com)';
                endpointInput.value = 'https://api.anthropic.com';
            } else {
                endpointInput.placeholder = 'Enter endpoint URL';
            }
        }
    }

    private updateModelsList(): void {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const modelInput = document.getElementById('provider-model') as HTMLInputElement;
        const modelDatalist = document.getElementById('model-options') as HTMLDataListElement;
        
        if (!modelInput || !modelDatalist) return;

        const type = typeSelect.value as ProviderType;
        const provider = this.getProviderInstance(type);
        const models = provider.availableModels;
        const defaultModel = provider.defaultModel;

        // Clear and populate the datalist
        modelDatalist.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            modelDatalist.appendChild(option);
        });

        // Set default value if empty
        if (!modelInput.value) {
            modelInput.value = defaultModel;
        }
    }

    private setLoading(button: HTMLButtonElement, loading: boolean): void {
        const spinner = button.querySelector('.spinner');
        if (spinner) {
            button.classList.toggle('loading', loading);
            button.disabled = loading;
        }
    }
}

// Initialize options when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new OptionsManager();
}); 