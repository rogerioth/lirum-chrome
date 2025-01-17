import { LLMProvider as Provider } from '../llm/LLMProvider';
import { LLMProviderFactory, ProviderType } from '../llm/LLMProviderFactory';
import { Logger, LogLevel } from '../utils/Logger';
import '../styles/options.css';

interface LLMProvider {
    type: string;
    name: string;
    endpoint?: string;
    apiKey?: string;
    model: string;
}

const PROVIDER_TYPES: ProviderType[] = LLMProviderFactory.getProviderTypes();

interface Command {
    name: string;
    prompt: string;
}

const DEFAULT_COMMANDS: Command[] = [
    { name: 'Summarize', prompt: 'Please provide a concise summary of the following content:' },
    { name: 'Paraphrase', prompt: 'Please rewrite the following content in different words while maintaining its meaning:' },
    { name: 'Bullet Points', prompt: 'Please convert the following content into clear, organized bullet points:' },
    { name: 'Translate', prompt: 'Please translate the following content to English (or specify target language):' },
    { name: 'Analyze Tone', prompt: 'Please analyze the tone and emotional content of the following text:' }
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
    private selectedCommandIndex: number = -1;
    private readonly logger: Logger;

    constructor() {
        this.logger = Logger.getInstance();
        this.initializeEventListeners();
        this.loadSettings();
    }

    private getProviderInstance(type: ProviderType): Provider {
        return LLMProviderFactory.getProvider(type);
    }

    private isLocalProvider(type: ProviderType): boolean {
        return LLMProviderFactory.isLocalProvider(type);
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

            // Initialize provider with appropriate parameters based on type
            if (isLocal) {
                await provider.initialize(undefined, endpointInput.value);
            } else {
                await provider.initialize(apiKeyInput.value);
            }

            // Set model if provided (no validation)
            const modelToUse = modelInput.value || provider.defaultModel;
            provider.setModel(modelToUse);

            const response = await provider.complete('Hello! Please respond with a short greeting.');
            
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
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const nameInput = document.getElementById('provider-name') as HTMLInputElement;
        const modelInput = document.getElementById('provider-model') as HTMLInputElement;
        const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
        
        typeSelect?.addEventListener('change', () => {
            const type = typeSelect.value as ProviderType;
            
            // Update name with provider name
            nameInput.value = LLMProviderFactory.getProviderName(type);

            // Clear model input to ensure it gets the new default
            if (modelInput) {
                modelInput.value = '';
            }

            // Set default endpoint for all providers
            if (endpointInput) {
                const defaultEndpoint = LLMProviderFactory.getDefaultEndpoint(type);
                endpointInput.value = defaultEndpoint;
            }

            // Update fields and models list
            this.updateProviderFields();
            this.updateModelsList();
        });

        // Model input change
        modelInput?.addEventListener('change', () => {
            const type = typeSelect.value as ProviderType;
            const models = LLMProviderFactory.getAvailableModels(type);
            
            this.logger.debug('Model input changed', {
                newValue: modelInput.value,
                availableModels: models
            });

            // If the value is not in the available models, reset to default
            if (!models.includes(modelInput.value)) {
                const defaultModel = LLMProviderFactory.getDefaultModel(type);
                modelInput.value = defaultModel;
                this.logger.debug('Reset to default model', { model: defaultModel });
            }
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

        document.getElementById('copy-logs')?.addEventListener('click', async () => {
            await this.logger.info('Copying logs to clipboard');
            await this.copyLogs();
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

        // Command event listeners
        document.getElementById('add-command')?.addEventListener('click', () => this.showCommandModal());
        document.getElementById('edit-command')?.addEventListener('click', () => this.showCommandModal(true));
        document.getElementById('remove-command')?.addEventListener('click', () => this.removeCommand());
        document.getElementById('import-commands')?.addEventListener('click', () => this.importCommands());
        document.getElementById('export-commands')?.addEventListener('click', () => this.exportCommands());
        document.getElementById('reset-commands')?.addEventListener('click', () => this.resetCommands());
        document.getElementById('save-command')?.addEventListener('click', () => this.saveCommand());
        
        const commandsList = document.getElementById('commands-list') as HTMLSelectElement;
        commandsList?.addEventListener('change', () => {
            this.selectedCommandIndex = commandsList.selectedIndex;
            this.updateCommandButtons();
        });

        // Close modal buttons
        document.querySelectorAll('.close-button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.modal').forEach(modal => {
                    if (modal instanceof HTMLElement) {
                        modal.style.display = 'none';
                    }
                });
            });
        });
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
            } else {
                this.commands = [...DEFAULT_COMMANDS];
            }
            await this.logger.info('Commands loaded', { count: this.commands.length });
            
            this.renderProviders();
            this.updateCommandsList();
        } catch (error) {
            await this.logger.error('Failed to load settings', { error });
        }
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
            this.logger.error('Error saving settings:', { error });
        }
    }

    private updateCommandsList(): void {
        const commandsList = document.getElementById('commands-list') as HTMLSelectElement;
        commandsList.innerHTML = '';
        
        this.commands.forEach(command => {
            const option = document.createElement('option');
            option.textContent = command.name;
            option.title = command.prompt;
            commandsList.appendChild(option);
        });
        
        this.updateCommandButtons();
    }

    private updateCommandButtons(): void {
        const editButton = document.getElementById('edit-command') as HTMLButtonElement;
        const removeButton = document.getElementById('remove-command') as HTMLButtonElement;
        const hasSelection = this.selectedCommandIndex !== -1;
        
        editButton.disabled = !hasSelection;
        removeButton.disabled = !hasSelection;
    }

    private showCommandModal(isEdit: boolean = false): void {
        const modal = document.getElementById('command-modal') as HTMLElement;
        const title = document.getElementById('command-modal-title') as HTMLElement;
        const nameInput = document.getElementById('command-name') as HTMLInputElement;
        const promptInput = document.getElementById('command-prompt') as HTMLTextAreaElement;
        
        title.textContent = isEdit ? 'Edit Command' : 'Add Command';
        
        if (isEdit && this.selectedCommandIndex !== -1) {
            const command = this.commands[this.selectedCommandIndex];
            nameInput.value = command.name;
            promptInput.value = command.prompt;
        } else {
            nameInput.value = '';
            promptInput.value = '';
        }
        
        modal.style.display = 'block';
    }

    private async saveCommand(): Promise<void> {
        const nameInput = document.getElementById('command-name') as HTMLInputElement;
        const promptInput = document.getElementById('command-prompt') as HTMLTextAreaElement;
        
        if (!nameInput.value || !promptInput.value) {
            alert('Please fill in all fields');
            return;
        }
        
        const command: Command = {
            name: nameInput.value,
            prompt: promptInput.value
        };
        
        if (this.selectedCommandIndex !== -1) {
            // Edit existing command
            this.commands[this.selectedCommandIndex] = command;
        } else {
            // Add new command
            this.commands.push(command);
        }
        
        await this.saveSettings();
        this.updateCommandsList();
        
        const modal = document.getElementById('command-modal') as HTMLElement;
        modal.style.display = 'none';
    }

    private async removeCommand(): Promise<void> {
        if (this.selectedCommandIndex === -1) return;
        
        if (confirm('Are you sure you want to remove this command?')) {
            this.commands.splice(this.selectedCommandIndex, 1);
            this.selectedCommandIndex = -1;
            await this.saveSettings();
            this.updateCommandsList();
        }
    }

    private async resetCommands(): Promise<void> {
        if (confirm('Are you sure that you want to reset all commands to the built-in ones?')) {
            this.commands = [...DEFAULT_COMMANDS];
            this.selectedCommandIndex = -1;
            await this.saveSettings();
            this.updateCommandsList();
        }
    }

    private async importCommands(): Promise<void> {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const commands = JSON.parse(text);
                
                if (!Array.isArray(commands) || !commands.every(cmd => cmd.name && cmd.prompt)) {
                    throw new Error('Invalid commands format');
                }
                
                this.commands = commands;
                this.selectedCommandIndex = -1;
                await this.saveSettings();
                this.updateCommandsList();
            } catch (error) {
                alert('Failed to import commands: ' + (error instanceof Error ? error.message : 'Invalid file'));
            }
        };
        
        input.click();
    }

    private exportCommands(): void {
        const data = JSON.stringify(this.commands, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lirum-commands.json';
        a.click();
        
        URL.revokeObjectURL(url);
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

    private async copyLogs(): Promise<void> {
        try {
            const logsJson = await this.logger.exportLogs();
            await navigator.clipboard.writeText(logsJson);
            this.showMessage('Logs copied to clipboard', false);
        } catch (error) {
            this.showMessage('Failed to copy logs to clipboard', true);
            await this.logger.error('Failed to copy logs', { error });
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
        
        this.logger.debug('Opening provider modal', {
            provider: provider ? {
                type: provider.type,
                name: provider.name,
                model: provider.model
            } : 'new provider'
        });
        
        // Populate provider types with correct capitalization
        typeSelect.innerHTML = '';
        
        PROVIDER_TYPES.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = LLMProviderFactory.getProviderName(type);
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

        // Important: First update fields, then update models list
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

    private updateProviderFields(): void {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const apiKeyGroup = document.getElementById('api-key-group');
        const endpointGroup = document.getElementById('endpoint-group');
        
        const type = typeSelect.value as ProviderType;
        const isLocal = this.isLocalProvider(type);
        
        // Show/hide API key field based on provider type
        if (apiKeyGroup) {
            apiKeyGroup.style.display = isLocal ? 'none' : 'block';
        }
        
        // Always show endpoint field and set default values
        if (endpointGroup) {
            endpointGroup.style.display = 'block';
            const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
            
            // Only set default endpoint if the field is empty
            if (!endpointInput.value) {
                const defaultEndpoint = LLMProviderFactory.getDefaultEndpoint(type);
                endpointInput.placeholder = `Enter endpoint URL (default: ${defaultEndpoint})`;
                endpointInput.value = defaultEndpoint;
            }
        }
    }

    private updateModelsList(): void {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const modelInput = document.getElementById('provider-model') as HTMLInputElement;
        const modelDatalist = document.getElementById('model-options') as HTMLDataListElement;
        
        if (!modelInput || !modelDatalist) {
            this.logger.error('Failed to find model input or datalist elements', {
                modelInput: !!modelInput,
                modelDatalist: !!modelDatalist
            });
            return;
        }

        const type = typeSelect.value as ProviderType;
        const models = LLMProviderFactory.getAvailableModels(type);
        const defaultModel = LLMProviderFactory.getDefaultModel(type);

        this.logger.debug('Updating models list', {
            type,
            models,
            defaultModel,
            currentValue: modelInput.value
        });

        // Clear and populate the datalist
        modelDatalist.innerHTML = '';
        
        // Create a default option in the datalist
        const defaultOption = document.createElement('option');
        defaultOption.value = defaultModel;
        defaultOption.textContent = defaultModel;
        modelDatalist.appendChild(defaultOption);

        // Add all other models
        models.forEach(model => {
            if (model !== defaultModel) {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                modelDatalist.appendChild(option);
            }
        });

        // Set default value if empty
        if (!modelInput.value) {
            modelInput.value = defaultModel;
            this.logger.debug('Set default model', { model: defaultModel });
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