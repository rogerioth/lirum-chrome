interface LLMProvider {
    name: string;
    apiKey: string;
}

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

class OptionsManager {
    private providers: { [key: string]: LLMProvider } = {};
    private commands: Command[] = [...DEFAULT_COMMANDS];

    constructor() {
        this.initializeEventListeners();
        this.loadSettings();
    }

    private initializeEventListeners(): void {
        document.getElementById('save')?.addEventListener('click', () => this.saveSettings());
        document.getElementById('add-command')?.addEventListener('click', () => this.addNewCommand());
        
        // Initialize provider input listeners
        ['openai', 'anthropic', 'deepseek'].forEach(provider => {
            const input = document.getElementById(`${provider}-key`) as HTMLInputElement;
            if (input) {
                input.addEventListener('input', () => {
                    this.providers[provider] = {
                        name: provider,
                        apiKey: input.value
                    };
                });
            }
        });
    }

    private async loadSettings(): Promise<void> {
        const settings = await chrome.storage.sync.get(['providers', 'commands']);
        
        if (settings.providers) {
            this.providers = settings.providers;
            Object.entries(this.providers).forEach(([name, provider]) => {
                const input = document.getElementById(`${name}-key`) as HTMLInputElement;
                if (input) {
                    input.value = provider.apiKey;
                }
            });
        }

        if (settings.commands) {
            this.commands = settings.commands;
        }
        
        this.renderCommands();
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

    private showMessage(message: string, isError: boolean = false): void {
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
}

// Initialize options when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new OptionsManager();
}); 