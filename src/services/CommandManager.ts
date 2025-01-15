interface CommandCategory {
  [category: string]: string[];
}

export class CommandManager {
  private readonly STORAGE_KEY = 'commands';
  private readonly CATEGORIES_KEY = 'command_categories';
  private readonly RECENT_COMMANDS_KEY = 'recent_commands';
  private readonly DEFAULT_COMMANDS = ['Summarize', 'Paraphrase', 'Bullet Points', 'Translate', 'Analyze Tone'];
  private readonly MAX_COMMAND_LENGTH = 100;
  private readonly MAX_RECENT_COMMANDS = 5;

  constructor() {
    this.initializeDefaultCommands();
  }

  private async initializeDefaultCommands(): Promise<void> {
    const existingCommands = await this.getCommands();
    if (existingCommands.length === 0) {
      await chrome.storage.sync.set({ [this.STORAGE_KEY]: this.DEFAULT_COMMANDS });
    }
  }

  async getCommands(): Promise<string[]> {
    const result = await chrome.storage.sync.get(this.STORAGE_KEY);
    return result[this.STORAGE_KEY] || [];
  }

  async addCommand(command: string, category?: string): Promise<void> {
    const trimmedCommand = command.trim();
    
    if (!trimmedCommand) {
      throw new Error('Invalid command format');
    }

    if (trimmedCommand.length > this.MAX_COMMAND_LENGTH) {
      throw new Error('Command too long');
    }

    const commands = await this.getCommands();
    if (commands.includes(trimmedCommand)) {
      throw new Error('Command already exists');
    }

    commands.push(trimmedCommand);
    await chrome.storage.sync.set({ [this.STORAGE_KEY]: commands });

    if (category) {
      await this.addCommandToCategory(trimmedCommand, category);
    }
  }

  async deleteCommand(command: string): Promise<void> {
    if (this.DEFAULT_COMMANDS.includes(command)) {
      throw new Error('Cannot delete default command');
    }

    const commands = await this.getCommands();
    const updatedCommands = commands.filter(cmd => cmd !== command);
    await chrome.storage.sync.set({ [this.STORAGE_KEY]: updatedCommands });

    // Remove from categories
    const categories = await this.getCommandCategories();
    for (const category of Object.keys(categories)) {
      categories[category] = categories[category].filter(cmd => cmd !== command);
    }
    await chrome.storage.sync.set({ [this.CATEGORIES_KEY]: categories });
  }

  async recordCommandUse(command: string): Promise<void> {
    const recentCommands = await this.getRecentCommands();
    const updatedRecent = [command, ...recentCommands.filter(cmd => cmd !== command)]
      .slice(0, this.MAX_RECENT_COMMANDS);
    
    await chrome.storage.sync.set({ [this.RECENT_COMMANDS_KEY]: updatedRecent });
  }

  async getRecentCommands(): Promise<string[]> {
    const result = await chrome.storage.sync.get(this.RECENT_COMMANDS_KEY);
    return result[this.RECENT_COMMANDS_KEY] || [];
  }

  async getCommandCategories(): Promise<CommandCategory> {
    const result = await chrome.storage.sync.get(this.CATEGORIES_KEY);
    return result[this.CATEGORIES_KEY] || {};
  }

  private async addCommandToCategory(command: string, category: string): Promise<void> {
    const categories = await this.getCommandCategories();
    
    if (!categories[category]) {
      categories[category] = [];
    }

    if (!categories[category].includes(command)) {
      categories[category].push(command);
      await chrome.storage.sync.set({ [this.CATEGORIES_KEY]: categories });
    }
  }

  async updateCommandCategory(command: string, newCategory: string): Promise<void> {
    const categories = await this.getCommandCategories();
    
    // Remove from all existing categories
    for (const category of Object.keys(categories)) {
      categories[category] = categories[category].filter(cmd => cmd !== command);
    }

    // Add to new category
    await this.addCommandToCategory(command, newCategory);
  }
} 