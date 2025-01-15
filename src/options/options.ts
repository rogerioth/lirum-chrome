interface LLMProvider {
    type: string;
    name: string;
    endpoint: string;
    apiKey: string;
}

type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'deepseek';

const PROVIDER_TYPES: ProviderType[] = ['openai', 'anthropic', 'ollama', 'deepseek'];

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

type LogLevel = 'info' | 'debug' | 'error' | 'llm';

interface LogEntry {
    timestamp: number;
    level: LogLevel;
    message: string;
    details?: any;
}

class Logger {
    private static instance: Logger;
    private logs: LogEntry[] = [];
    private maxLogs: number = 1000;
    private listeners: ((entry: LogEntry) => void)[] = [];

    private constructor() {
        // Load existing logs from storage
        chrome.storage.local.get(['logs'], (result) => {
            if (result.logs) {
                this.logs = result.logs;
                this.notifyListeners(this.logs[this.logs.length - 1]);
            }
        });
    }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    addListener(callback: (entry: LogEntry) => void): void {
        this.listeners.push(callback);
    }

    private notifyListeners(entry: LogEntry): void {
        this.listeners.forEach(listener => listener(entry));
    }

    private async saveToStorage(): Promise<void> {
        await chrome.storage.local.set({ logs: this.logs });
    }

    log(level: LogLevel, message: string, details?: any): void {
        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            message,
            details
        };

        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.notifyListeners(entry);
        this.saveToStorage();
    }

    info(message: string, details?: any): void {
        this.log('info', message, details);
    }

    debug(message: string, details?: any): void {
        this.log('debug', message, details);
    }

    error(message: string, details?: any): void {
        this.log('error', message, details);
    }

    llm(message: string, details?: any): void {
        this.log('llm', message, details);
    }

    clear(): void {
        this.logs = [];
        this.saveToStorage();
        this.notifyListeners({ timestamp: Date.now(), level: 'info', message: 'Logs cleared' });
    }

    getFilteredLogs(levels: LogLevel[]): LogEntry[] {
        return this.logs.filter(log => levels.includes(log.level));
    }

    exportLogs(): string {
        return JSON.stringify(this.logs, null, 2);
    }
}

class OptionsManager {
    private providers: LLMProvider[] = [];
    private commands: Command[] = [...DEFAULT_COMMANDS];
    private selectedProviderIndex: number = -1;
    private logger: Logger;
    private activeLogLevels: Set<LogLevel> = new Set(['info', 'debug', 'error', 'llm']);

    constructor() {
        this.logger = Logger.getInstance();
        this.initializeEventListeners();
        this.loadSettings();
        this.initializeLogging();
    }

    private initializeLogging(): void {
        // Toggle logs container visibility
        const logsHeader = document.getElementById('logs-header');
        const logsContainer = document.getElementById('logs-container');
        
        logsHeader?.addEventListener('click', (e) => {
            if (!(e.target as HTMLElement).closest('button')) {
                if (logsContainer) {
                    logsContainer.style.display = logsContainer.style.display === 'none' ? 'block' : 'none';
                }
            }
        });

        // Clear logs
        document.getElementById('clear-logs')?.addEventListener('click', () => {
            this.logger.clear();
            this.renderLogs();
        });

        // Export logs
        document.getElementById('export-logs')?.addEventListener('click', () => {
            const blob = new Blob([this.logger.exportLogs()], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lirum-logs-${new Date().toISOString()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        // Log filters
        document.querySelectorAll('.log-filters input').forEach((checkbox) => {
            checkbox.addEventListener('change', (e) => {
                const level = (e.target as HTMLInputElement).dataset.level as LogLevel;
                if ((e.target as HTMLInputElement).checked) {
                    this.activeLogLevels.add(level);
                } else {
                    this.activeLogLevels.delete(level);
                }
                this.renderLogs();
            });
        });

        // Subscribe to log updates
        this.logger.addListener(() => this.renderLogs());
        
        // Initial render
        this.renderLogs();
    }

    private renderLogs(): void {
        const logsContent = document.getElementById('logs-content');
        if (!logsContent) return;

        const filteredLogs = this.logger.getFilteredLogs(Array.from(this.activeLogLevels));
        logsContent.innerHTML = filteredLogs.map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const details = log.details ? ` ${JSON.stringify(log.details)}` : '';
            return `<div class="log-entry ${log.level}">[${time}] [${log.level.toUpperCase()}] ${log.message}${details}</div>`;
        }).join('\n');

        logsContent.scrollTop = logsContent.scrollHeight;
    }

    private initializeEventListeners(): void {
        document.getElementById('save')?.addEventListener('click', () => this.saveSettings());
        document.getElementById('add-command')?.addEventListener('click', () => this.addNewCommand());
        document.getElementById('add-provider')?.addEventListener('click', () => {
            this.logger.info('Opening add provider modal');
            this.showProviderModal();
        });
        document.getElementById('edit-provider')?.addEventListener('click', () => {
            this.logger.info('Opening edit provider modal', { providerIndex: this.selectedProviderIndex });
            this.editSelectedProvider();
        });
        document.getElementById('remove-provider')?.addEventListener('click', () => {
            this.logger.info('Removing provider', { providerIndex: this.selectedProviderIndex });
            this.removeSelectedProvider();
        });
        
        // Modal event listeners
        document.getElementById('modal-close')?.addEventListener('click', () => this.hideProviderModal());
        document.getElementById('modal-save')?.addEventListener('click', () => this.saveProviderModal());
        document.getElementById('test-provider')?.addEventListener('click', () => this.testProvider());
        
        // Provider type change listener
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        if (typeSelect) {
            typeSelect.addEventListener('change', () => this.updateProviderName());
        }

        // Provider selection listener
        const providersList = document.getElementById('providers-list') as HTMLSelectElement;
        if (providersList) {
            providersList.addEventListener('change', () => {
                this.selectedProviderIndex = providersList.selectedIndex;
                this.updateProviderButtons();
                this.logger.debug('Provider selected', { index: this.selectedProviderIndex });
            });
        }
    }

    private async loadSettings(): Promise<void> {
        try {
            const settings = await chrome.storage.sync.get(['providers', 'commands']);
            
            if (settings.providers) {
                this.providers = settings.providers;
                this.logger.info('Providers loaded', { count: this.providers.length });
            }

            if (settings.commands) {
                this.commands = settings.commands;
                this.logger.info('Commands loaded', { count: this.commands.length });
            }
            
            this.renderProviders();
            this.renderCommands();
        } catch (error) {
            this.logger.error('Failed to load settings', { error });
        }
    }

    private async testProvider(): Promise<void> {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
        const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement;

        try {
            if (!endpointInput.value || !apiKeyInput.value) {
                throw new Error('Please fill in all fields');
            }
            
            this.logger.info('Testing provider connection', {
                type: typeSelect.value,
                endpoint: endpointInput.value
            });
            
            // Here you would make the actual API call
            this.showMessage('Connection test successful!', false, true);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Test failed';
            this.logger.error('Provider test failed', { error: errorMessage });
            this.showMessage(errorMessage, true, true);
        }
    }

    private saveProviderModal(): void {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const nameInput = document.getElementById('provider-name') as HTMLInputElement;
        const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
        const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement;

        const provider: LLMProvider = {
            type: typeSelect.value as ProviderType,
            name: nameInput.value,
            endpoint: endpointInput.value,
            apiKey: apiKeyInput.value
        };

        try {
            if (this.selectedProviderIndex !== -1) {
                this.providers[this.selectedProviderIndex] = provider;
                this.logger.info('Provider updated', { name: provider.name, type: provider.type });
            } else {
                this.providers.push(provider);
                this.logger.info('New provider added', { name: provider.name, type: provider.type });
            }

            this.renderProviders();
            this.hideProviderModal();
            this.saveSettings();
        } catch (error) {
            this.logger.error('Failed to save provider', { error });
        }
    }

    private renderProviders(): void {
        const providersList = document.getElementById('providers-list');
        if (!providersList) return;

        providersList.innerHTML = '';
        this.providers.forEach((provider, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            option.textContent = `${provider.name} (${provider.type})`;
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

        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const nameInput = document.getElementById('provider-name') as HTMLInputElement;
        const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
        const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement;

        if (provider) {
            typeSelect.value = provider.type;
            nameInput.value = provider.name;
            endpointInput.value = provider.endpoint;
            apiKeyInput.value = provider.apiKey;
        } else {
            typeSelect.value = PROVIDER_TYPES[0];
            nameInput.value = PROVIDER_TYPES[0];
            endpointInput.value = '';
            apiKeyInput.value = '';
        }

        modal.style.display = 'block';
    }

    private hideProviderModal(): void {
        const modal = document.getElementById('provider-modal');
        const messageContainer = document.getElementById('modal-message');
        if (modal) {
            modal.style.display = 'none';
        }
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

    private showMessage(message: string, isError: boolean = false, inModal: boolean = false): void {
        if (inModal) {
            const messageContainer = document.getElementById('modal-message');
            if (messageContainer) {
                messageContainer.textContent = message;
                messageContainer.style.display = 'block';
                messageContainer.className = `message-container ${isError ? 'error' : 'success'}`;
                
                // Hide the message after 3 seconds
                setTimeout(() => {
                    messageContainer.style.display = 'none';
                }, 3000);
            }
            return;
        }

        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        messageDiv.style.padding = '10px';
        messageDiv.style.margin = '10px 0';
        messageDiv.style.backgroundColor = isError ? '#ffebee' : '#e8f5e9';
        messageDiv.style.color = isError ? '#c62828' : '#2e7d32';
        messageDiv.style.borderRadius = '4px';

        document.body.insertBefore(messageDiv, document.body.firstChild);
        setTimeout(() => messageDiv.remove(), 3000);
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
}

// Initialize options when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new OptionsManager();
}); 