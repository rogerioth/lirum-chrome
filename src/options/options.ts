/**
 * Options Page Manager for Lirum Chrome Extension
 * 
 * This module manages the configuration and settings interface for the Lirum Chrome extension.
 * It provides a user interface for managing LLM providers and custom commands.
 * 
 * Key Features:
 * 1. Provider Management:
 *    - Add, edit, and remove LLM providers (OpenAI, Anthropic, etc.)
 *    - Configure provider-specific settings (endpoints, API keys, models)
 *    - Test provider connections with live validation
 *    - Support for both cloud and local LLM providers
 * 
 * 2. Command Management:
 *    - Maintain a list of custom commands with associated prompts
 *    - Default commands for common operations (Summarize, Paraphrase, etc.)
 *    - Add, edit, and remove custom commands
 *    - Command validation and persistence
 * 
 * 3. UI Features:
 *    - Tabbed navigation interface for organized settings
 *    - Modal dialogs for adding/editing providers and commands
 *    - Real-time validation and feedback
 *    - Persistent storage of settings
 * 
 * Navigation Structure:
 * - Providers Tab: Manage LLM provider configurations
 * - Commands Tab: Customize text processing commands
 * - Settings Tab: General extension settings
 * 
 * @module options
 */

import { LLMProvider } from '../llm/LLMProvider';
import { LLMProviderFactory, ProviderType } from '../llm/LLMProviderFactory';
import { Logger, LogLevel } from '../utils/Logger';
import { StorageManager, Provider, Command, DEFAULT_COMMANDS } from '../utils/StorageManager';
import '../styles/options.css';

const PROVIDER_TYPES: ProviderType[] = LLMProviderFactory.getProviderTypes();

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
    private providers: Provider[] = [];
    private commands: Command[] = [];
    private selectedProviderIndex: number = -1;
    private selectedCommandIndex: number = -1;
    private readonly logger: Logger;
    private readonly storageManager: StorageManager;

    constructor() {
        this.logger = Logger.getInstance();
        this.storageManager = StorageManager.getInstance();
        this.initializeEventListeners();
        this.loadSettings();
        this.displayStorageData();  // Initialize storage display
    }

    private getProviderInstance(type: ProviderType): LLMProvider {
        return LLMProviderFactory.getProvider(type);
    }

    private isLocalProvider(type: ProviderType): boolean {
        return LLMProviderFactory.isLocalProvider(type);
    }

    private async testProvider(): Promise<void> {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
        const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement;
        const testButton = document.getElementById('test-provider') as HTMLButtonElement;

        try {
            this.setLoading(testButton, true);
            const type = typeSelect.value as ProviderType;
            const provider = this.getProviderInstance(type);
            const isLocal = this.isLocalProvider(type);

            // Validate required fields
            if (!endpointInput.value) {
                throw new Error('Endpoint is required');
            }

            if (!isLocal && !apiKeyInput.value) {
                throw new Error('API key is required');
            }

            // Request host permission for the endpoint
            const endpointUrl = new URL(endpointInput.value);
            const origin = endpointUrl.origin + '/*';
            
            const granted = await chrome.permissions.request({
                origins: [origin]
            });

            if (!granted) {
                throw new Error('Permission to access the endpoint was denied. Please grant permission to test the connection.');
            }

            // Test the provider configuration
            if (isLocal) {
                await provider.test(undefined, endpointInput.value);
            } else {
                await provider.test(apiKeyInput.value, endpointInput.value);
            }

            this.showMessage('Connection test successful!', false, true);
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

        // Initialize custom dropdowns
        this.initializeModelDropdown();

        // Provider management
        document.getElementById('add-provider')?.addEventListener('click', () => {
            this.selectedProviderIndex = -1;
            this.showProviderModal();
        });

        document.getElementById('edit-provider')?.addEventListener('click', () => {
            const select = document.getElementById('providers-list') as HTMLSelectElement;
            if (select?.value) {
                const provider = this.providers.find(p => p.providerId === select.value);
                if (provider) {
                    this.showProviderModal(provider);
                }
            }
        });

        document.getElementById('remove-provider')?.addEventListener('click', () => {
            const select = document.getElementById('providers-list') as HTMLSelectElement;
            if (select?.value && confirm('Are you sure you want to delete this provider?')) {
                this.deleteProvider(select.value);
            }
        });

        // Command management
        document.getElementById('add-command')?.addEventListener('click', () => {
            this.selectedCommandIndex = -1;
            this.showCommandModal();
        });
        
        document.getElementById('edit-command')?.addEventListener('click', () => {
            if (this.selectedCommandIndex !== -1) {
                this.showCommandModal(true);
            }
        });
        
        document.getElementById('remove-command')?.addEventListener('click', () => {
            if (this.selectedCommandIndex !== -1 && confirm('Are you sure you want to delete this command?')) {
                this.deleteCommand(this.selectedCommandIndex);
            }
        });

        // Import/Export commands
        document.getElementById('import-commands')?.addEventListener('click', () => {
            this.importCommands();
        });

        document.getElementById('export-commands')?.addEventListener('click', () => {
            this.exportCommands();
        });

        // Modal events
        document.getElementById('modal-cancel')?.addEventListener('click', () => {
            this.hideProviderModal();
        });

        document.querySelector('#provider-modal .close-button')?.addEventListener('click', () => {
            this.hideProviderModal();
        });

        document.getElementById('cancel-command')?.addEventListener('click', () => {
            this.hideCommandModal();
        });

        document.querySelector('#command-modal .close-button')?.addEventListener('click', () => {
            this.hideCommandModal();
        });

        document.getElementById('test-provider')?.addEventListener('click', () => {
            this.testProvider();
        });

        document.getElementById('modal-save')?.addEventListener('click', async () => {
            const select = document.getElementById('providers-list') as HTMLSelectElement;
            if (this.selectedProviderIndex !== -1 && select?.value) {
                await this.updateProvider(select.value);
            } else {
                await this.addProvider();
            }
        });

        document.getElementById('save-command')?.addEventListener('click', async () => {
            if (this.selectedCommandIndex !== -1) {
                await this.updateCommand(this.selectedCommandIndex);
            } else {
                await this.addCommand();
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

        // Icon preview update
        const iconInput = document.getElementById('command-icon') as HTMLInputElement;
        const iconPreview = document.getElementById('icon-preview') as HTMLElement;
        
        iconInput?.addEventListener('input', () => {
            iconPreview.className = iconInput.value;
        });

        // Command list click handling
        const commandsList = document.getElementById('commands-list') as HTMLUListElement;
        commandsList?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const listItem = target.closest('.command-item') as HTMLLIElement;
            
            if (listItem) {
                // Remove selected class from all items
                commandsList.querySelectorAll('.command-item').forEach(item => {
                    item.classList.remove('selected');
                });
                
                // Add selected class to clicked item
                listItem.classList.add('selected');
                
                // Update selected index
                this.selectedCommandIndex = parseInt(listItem.dataset.index || '-1');
                this.updateCommandButtons();
            }
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

        // Add factory reset button handler
        document.getElementById('factory-reset')?.addEventListener('click', async () => {
            if (confirm('Are you sure you want to reset all settings to factory defaults? This will remove all providers and reset commands to default values.')) {
                await this.factoryReset();
            }
        });

        // Storage management
        document.getElementById('refresh-storage')?.addEventListener('click', async () => {
            await this.displayStorageData();
        });
    }

    private initializeModelDropdown(): void {
        const modelInput = document.getElementById('provider-model') as HTMLInputElement;
        const modelList = document.getElementById('provider-model-list') as HTMLDivElement;
        let currentModels: string[] = [];

        const updateModelsForType = (type: ProviderType) => {
            currentModels = LLMProviderFactory.getAvailableModels(type);
            this.updateModelListItems(currentModels, modelList, modelInput);
            modelInput.value = LLMProviderFactory.getDefaultModel(type);
        };

        // Toggle dropdown on input focus
        modelInput.addEventListener('focus', () => {
            modelList.classList.add('show');
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (event) => {
            if (!modelInput.contains(event.target as Node) && !modelList.contains(event.target as Node)) {
                modelList.classList.remove('show');
            }
        });

        // Handle input changes
        modelInput.addEventListener('input', () => {
            const value = modelInput.value.toLowerCase();
            
            // Filter and update dropdown items
            const filteredModels = currentModels.filter(model => 
                model.toLowerCase().includes(value)
            );
            
            this.updateModelListItems(filteredModels, modelList, modelInput);
        });

        // Initialize dropdown items when provider type changes
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        typeSelect.addEventListener('change', () => {
            const type = typeSelect.value as ProviderType;
            updateModelsForType(type);
        });

        // Export the update function so we can call it from showProviderModal
        this.updateModelsForType = updateModelsForType;
    }

    private updateModelsForType: ((type: ProviderType) => void) | null = null;

    private updateModelListItems(models: string[], modelList: HTMLDivElement, modelInput: HTMLInputElement): void {
        // Clear current items
        modelList.innerHTML = '';
        
        // Add new items
        models.forEach(model => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            if (model === modelInput.value) {
                item.classList.add('selected');
            }
            item.textContent = model;
            
            // Handle item click
            item.addEventListener('click', () => {
                modelInput.value = model;
                modelList.classList.remove('show');
            });
            
            modelList.appendChild(item);
        });
        
        // Show/hide dropdown based on whether there are items
        if (models.length > 0) {
            modelList.classList.add('show');
        } else {
            modelList.classList.remove('show');
        }
    }

    private async loadSettings(): Promise<void> {
        try {
            const [providers, commands] = await Promise.all([
                this.storageManager.listProviders(),
                this.storageManager.listCommands()
            ]);

            this.providers = providers;
            this.commands = commands;

            this.renderProviders();
            this.updateCommandsList();
        } catch (error) {
            this.showMessage('Failed to load settings', true);
            await this.logger.error('Failed to load settings', { error });
        }
    }

    private async saveSettings(): Promise<void> {
        try {
            await Promise.all([
                ...this.providers.map(provider => {
                    const { providerId, ...updates } = provider;
                    return providerId 
                        ? this.storageManager.updateProvider(providerId, updates)
                        : this.storageManager.createProvider(updates);
                }),
                this.storageManager.updateCommands(this.commands)
            ]);
        } catch (error) {
            throw new Error('Failed to save settings: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
    }

    private updateCommandsList(): void {
        const commandsList = document.getElementById('commands-list') as HTMLUListElement;
        commandsList.innerHTML = '';
        
        this.commands.forEach((command, index) => {
            const li = document.createElement('li');
            li.className = 'command-item';
            li.dataset.index = index.toString();
            
            const icon = document.createElement('i');
            icon.className = command.icon;
            
            const span = document.createElement('span');
            span.textContent = command.name;
            
            li.appendChild(icon);
            li.appendChild(span);
            li.title = command.prompt;
            
            li.addEventListener('click', () => {
                // Remove selected class from all items
                commandsList.querySelectorAll('.command-item').forEach(item => {
                    item.classList.remove('selected');
                });
                
                // Add selected class to clicked item
                li.classList.add('selected');
                
                // Update selected index
                this.selectedCommandIndex = index;
                this.updateCommandButtons();
            });
            
            commandsList.appendChild(li);
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
        const iconInput = document.getElementById('command-icon') as HTMLInputElement;
        const iconPreview = document.getElementById('icon-preview') as HTMLElement;
        const promptInput = document.getElementById('command-prompt') as HTMLTextAreaElement;
        
        title.textContent = isEdit ? 'Edit Command' : 'Add Command';
        
        if (isEdit && this.selectedCommandIndex !== -1) {
            const command = this.commands[this.selectedCommandIndex];
            nameInput.value = command.name;
            iconInput.value = command.icon;
            iconPreview.className = command.icon;
            promptInput.value = command.prompt;
        } else {
            nameInput.value = '';
            iconInput.value = 'fa-solid fa-terminal';
            iconPreview.className = 'fa-solid fa-terminal';
            promptInput.value = '';
        }
        
        modal.style.display = 'flex';
    }

    private hideCommandModal(): void {
        const modal = document.getElementById('command-modal') as HTMLElement;
        modal.style.display = 'none';
    }

    private async addCommand(): Promise<void> {
        const nameInput = document.getElementById('command-name') as HTMLInputElement;
        const iconInput = document.getElementById('command-icon') as HTMLInputElement;
        const promptInput = document.getElementById('command-prompt') as HTMLTextAreaElement;

        if (!nameInput.value || !promptInput.value) {
            this.showMessage('Please fill in all required fields', true);
            return;
        }

        const command: Command = {
            name: nameInput.value,
            icon: iconInput.value || 'fa-solid fa-terminal',
            prompt: promptInput.value
        };

        try {
            this.commands.push(command);
            await this.storageManager.updateCommands(this.commands);
            
            this.updateCommandsList();
            this.hideCommandModal();
            this.showMessage('Command added successfully');
        } catch (error) {
            await this.logger.error('Failed to add command', { error });
            this.showMessage('Failed to add command', true);
        }
    }

    private async updateCommand(index: number): Promise<void> {
        const nameInput = document.getElementById('command-name') as HTMLInputElement;
        const iconInput = document.getElementById('command-icon') as HTMLInputElement;
        const promptInput = document.getElementById('command-prompt') as HTMLTextAreaElement;

        if (!nameInput.value || !promptInput.value) {
            this.showMessage('Please fill in all required fields', true);
            return;
        }

        const command: Command = {
            name: nameInput.value,
            icon: iconInput.value || 'fa-solid fa-terminal',
            prompt: promptInput.value
        };

        try {
            this.commands[index] = command;
            await this.storageManager.updateCommands(this.commands);
            
            this.updateCommandsList();
            this.hideCommandModal();
            this.showMessage('Command updated successfully');
        } catch (error) {
            await this.logger.error('Failed to update command', { error });
            this.showMessage('Failed to update command', true);
        }
    }

    private async deleteCommand(index: number): Promise<void> {
        try {
            this.commands.splice(index, 1);
            await this.storageManager.updateCommands(this.commands);
            
            this.selectedCommandIndex = -1;
            this.updateCommandsList();
            this.showMessage('Command deleted successfully');
        } catch (error) {
            await this.logger.error('Failed to delete command', { error });
            this.showMessage('Failed to delete command', true);
        }
    }

    private async resetCommands(): Promise<void> {
        try {
            this.commands = [...DEFAULT_COMMANDS];
            await this.storageManager.updateCommands(this.commands);
            
            this.selectedCommandIndex = -1;
            this.updateCommandsList();
            this.showMessage('Commands reset to defaults');
        } catch (error) {
            await this.logger.error('Failed to reset commands', { error });
            this.showMessage('Failed to reset commands', true);
        }
    }

    private async importCommands(): Promise<void> {
        try {
            // Create a file input element
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            // Handle file selection
            input.onchange = async (event) => {
                const file = (event.target as HTMLInputElement).files?.[0];
                if (!file) {
                    await this.logger.error('No file selected for import');
                    return;
                }
                
                try {
                    const content = await file.text();
                    const importedCommands = JSON.parse(content);
                    
                    // Validate imported commands
                    if (!Array.isArray(importedCommands)) {
                        throw new Error('Invalid commands format: expected an array');
                    }
                    
                    // Validate each command
                    const validCommands = importedCommands.filter(cmd => {
                        return (
                            typeof cmd === 'object' &&
                            cmd !== null &&
                            typeof cmd.name === 'string' &&
                            typeof cmd.icon === 'string' &&
                            typeof cmd.prompt === 'string'
                        );
                    });
                    
                    if (validCommands.length === 0) {
                        throw new Error('No valid commands found in import file');
                    }
                    
                    if (validCommands.length !== importedCommands.length) {
                        await this.logger.info('Some commands were skipped during import', {
                            total: importedCommands.length,
                            valid: validCommands.length,
                            skipped: importedCommands.length - validCommands.length
                        });
                    }
                    
                    // Ask for confirmation if there are existing commands
                    if (this.commands.length > 0) {
                        if (confirm('Do you want to replace all existing commands with the imported ones?')) {
                            this.commands = validCommands;
                        } else if (confirm('Do you want to append the imported commands to the existing ones?')) {
                            this.commands = [...this.commands, ...validCommands];
                        } else {
                            await this.logger.info('Import cancelled by user');
                            return;
                        }
                    } else {
                        this.commands = validCommands;
                    }
                    
                    // Save and update UI
                    await this.saveSettings();
                    this.updateCommandsList();
                    
                    const message = `Successfully imported ${validCommands.length} commands`;
                    this.showMessage(message);
                    await this.logger.info(message, { commandCount: validCommands.length });
                    
                } catch (error) {
                    const message = 'Failed to import commands: ' + (error instanceof Error ? error.message : 'Unknown error');
                    this.showMessage(message, true);
                    await this.logger.error('Import failed', { error });
                }
            };
            
            // Trigger file selection
            input.click();
            
        } catch (error) {
            await this.logger.error('Failed to initiate import', { error });
            this.showMessage('Failed to import commands', true);
        }
    }

    private async exportCommands(): Promise<void> {
        try {
            // Create a JSON string with proper formatting
            const commandsJson = JSON.stringify(this.commands, null, 2);
            
            // Create a blob with the JSON data
            const blob = new Blob([commandsJson], { type: 'application/json' });
            
            // Create a temporary URL for the blob
            const url = URL.createObjectURL(blob);
            
            // Create a temporary link element
            const link = document.createElement('a');
            link.href = url;
            link.download = `lirum-commands-${new Date().toISOString().split('T')[0]}.json`;
            
            // Append link to body, click it, and remove it
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up the URL
            URL.revokeObjectURL(url);
            
            await this.logger.info('Commands exported successfully');
        } catch (error) {
            await this.logger.error('Failed to export commands', { error });
            this.showMessage('Failed to export commands', true);
        }
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
        await this.storageManager.clearLogs();
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

    private setLoading(button: HTMLButtonElement, loading: boolean): void {
        const spinner = button.querySelector('.spinner');
        if (spinner) {
            button.classList.toggle('loading', loading);
            button.disabled = loading;
        }
    }

    private async addProvider(): Promise<void> {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const nameInput = document.getElementById('provider-name') as HTMLInputElement;
        const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement;
        const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
        const modelInput = document.getElementById('provider-model') as HTMLInputElement;

        const type = typeSelect.value as ProviderType;
        const name = nameInput.value;
        const apiKey = apiKeyInput.value;
        const endpoint = endpointInput.value;
        const model = modelInput.value;

        if (!name || !model) {
            this.showMessage('Please fill in all required fields', true);
            return;
        }

        try {
            const newProvider = await this.storageManager.createProvider({
                type,
                name,
                apiKey,
                endpoint,
                model
            });

            this.providers.push(newProvider);
            await this.logger.info('Provider added', { type, name });
            
            this.renderProviders();
            this.hideProviderModal();
            this.showMessage('Provider added successfully');
        } catch (error) {
            await this.logger.error('Failed to add provider', { error });
            this.showMessage('Failed to add provider', true);
        }
    }

    private async updateProvider(providerId: string): Promise<void> {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const nameInput = document.getElementById('provider-name') as HTMLInputElement;
        const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement;
        const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
        const modelInput = document.getElementById('provider-model') as HTMLInputElement;

        const updates = {
            type: typeSelect.value as ProviderType,
            name: nameInput.value,
            apiKey: apiKeyInput.value,
            endpoint: endpointInput.value,
            model: modelInput.value
        };

        if (!updates.name || !updates.model) {
            this.showMessage('Please fill in all required fields', true);
            return;
        }

        try {
            const updatedProvider = await this.storageManager.updateProvider(providerId, updates);
            const index = this.providers.findIndex(p => p.providerId === providerId);
            if (index !== -1) {
                this.providers[index] = updatedProvider;
            }

            await this.logger.info('Provider updated', { providerId });
            this.renderProviders();
            this.hideProviderModal();
            this.showMessage('Provider updated successfully');
        } catch (error) {
            await this.logger.error('Failed to update provider', { error });
            this.showMessage('Failed to update provider', true);
        }
    }

    private async deleteProvider(providerId: string): Promise<void> {
        try {
            await this.storageManager.deleteProvider(providerId);
            this.providers = this.providers.filter(p => p.providerId !== providerId);
            this.selectedProviderIndex = -1;

            await this.logger.info('Provider deleted', { providerId });
            this.renderProviders();
            this.showMessage('Provider deleted successfully');
        } catch (error) {
            await this.logger.error('Failed to delete provider', { error });
            this.showMessage('Failed to delete provider', true);
        }
    }

    private renderProviders(): void {
        const providersList = document.getElementById('providers-list');
        if (!providersList) return;

        providersList.innerHTML = '';
        this.providers.forEach((provider, index) => {
            const option = document.createElement('option');
            option.value = provider.providerId;
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

    private showProviderModal(provider?: Provider): void {
        const modal = document.getElementById('provider-modal') as HTMLElement;
        const modalTitle = modal.querySelector('.modal-header-content h2') as HTMLElement;
        const saveButton = modal.querySelector('#modal-save span') as HTMLElement;
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const nameInput = document.getElementById('provider-name') as HTMLInputElement;
        const apiKeyGroup = document.getElementById('api-key-group');
        const endpointGroup = document.getElementById('endpoint-group');
        const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement;
        const endpointInput = document.getElementById('provider-endpoint') as HTMLInputElement;
        const modelInput = document.getElementById('provider-model') as HTMLInputElement;

        // Reset form and update UI for add/edit mode
        const isEditMode = Boolean(provider);
        modalTitle.textContent = isEditMode ? 'Edit Provider' : 'Add Provider';
        saveButton.textContent = isEditMode ? 'Update' : 'Save';
        
        // Populate provider types if empty
        if (typeSelect.children.length === 0) {
            PROVIDER_TYPES.forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = LLMProviderFactory.getProviderName(type);
                typeSelect.appendChild(option);
            });
        }

        // Set initial values
        const initialType = (provider?.type || PROVIDER_TYPES[0]) as ProviderType;
        typeSelect.value = initialType;
        nameInput.value = provider?.name || LLMProviderFactory.getProviderName(initialType);
        apiKeyInput.value = provider?.apiKey || '';
        endpointInput.value = provider?.endpoint || LLMProviderFactory.getDefaultEndpoint(initialType);
        
        // Initialize models for the current type
        if (this.updateModelsForType) {
            this.updateModelsForType(initialType);
        }
        
        // If editing, set the specific model after populating the list
        if (provider?.model) {
            modelInput.value = provider.model;
        }
        
        // Add type change handler
        typeSelect.onchange = () => {
            const selectedType = typeSelect.value as ProviderType;
            nameInput.value = LLMProviderFactory.getProviderName(selectedType);
            endpointInput.value = LLMProviderFactory.getDefaultEndpoint(selectedType);
            this.updateProviderFields();
        };

        // Update fields visibility
        this.updateProviderFields();

        // Show modal
        modal.style.display = 'flex';
    }

    private hideProviderModal(): void {
        const modal = document.getElementById('provider-modal') as HTMLElement;
        modal.style.display = 'none';
    }

    private updateProviderName(): void {
        const typeSelect = document.getElementById('provider-type') as HTMLSelectElement;
        const nameInput = document.getElementById('provider-name') as HTMLInputElement;
        
        if (typeSelect && nameInput && !nameInput.value) {
            nameInput.value = typeSelect.value;
        }
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

    private async factoryReset(): Promise<void> {
        try {
            await this.storageManager.resetToDefaults();
            
            // Reset local state
            this.providers = [];
            this.commands = [...DEFAULT_COMMANDS];
            this.selectedProviderIndex = -1;
            this.selectedCommandIndex = -1;

            // Update UI
            this.renderProviders();
            this.updateCommandsList();
            this.showMessage('Settings have been reset to factory defaults');
            
            await this.logger.info('Factory reset completed');
        } catch (error) {
            const message = 'Failed to reset settings: ' + (error instanceof Error ? error.message : 'Unknown error');
            this.showMessage(message, true);
            await this.logger.error('Factory reset failed', { error });
        }
    }

    private async displayStorageData(): Promise<void> {
        try {
            const storageData = await this.storageManager.getAllStorageData();

            // Create a copy of the data to modify
            const displayData = {
                sync: { ...storageData.sync },
                local: { ...storageData.local }
            };

            // Redact logs from display
            if (displayData.local.logs) {
                displayData.local.logs = "<logs - check Settings/Logs>";
            }

            const storageOutput = document.getElementById('storage-output');
            if (storageOutput) {
                storageOutput.textContent = JSON.stringify(displayData, null, 2);
            }
        } catch (error) {
            await this.logger.error('Failed to display storage data', { error });
            this.showMessage('Failed to load storage data', true);
        }
    }
}

// Initialize options when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new OptionsManager();
});