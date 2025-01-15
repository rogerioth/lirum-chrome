import { CommandManager } from '../../services/CommandManager';

describe('CommandManager', () => {
  let commandManager: CommandManager;

  beforeEach(() => {
    chrome.storage.sync.clear();
    commandManager = new CommandManager();
  });

  describe('Default Commands', () => {
    it('should initialize with default commands', async () => {
      const commands = await commandManager.getCommands();
      
      expect(commands).toContain('Summarize');
      expect(commands).toContain('Paraphrase');
      expect(commands).toContain('Bullet Points');
      expect(commands).toContain('Translate');
      expect(commands).toContain('Analyze Tone');
    });

    it('should not allow deletion of default commands', async () => {
      await expect(
        commandManager.deleteCommand('Summarize')
      ).rejects.toThrow('Cannot delete default command');
    });
  });

  describe('Custom Commands', () => {
    it('should add custom commands', async () => {
      const customCommand = 'Find Keywords';
      await commandManager.addCommand(customCommand);
      
      const commands = await commandManager.getCommands();
      expect(commands).toContain(customCommand);
    });

    it('should delete custom commands', async () => {
      const customCommand = 'Custom Analysis';
      await commandManager.addCommand(customCommand);
      await commandManager.deleteCommand(customCommand);
      
      const commands = await commandManager.getCommands();
      expect(commands).not.toContain(customCommand);
    });

    it('should prevent duplicate commands', async () => {
      const command = 'Test Command';
      await commandManager.addCommand(command);
      
      await expect(
        commandManager.addCommand(command)
      ).rejects.toThrow('Command already exists');
    });
  });

  describe('Command Validation', () => {
    it('should validate command format', async () => {
      await expect(
        commandManager.addCommand('')
      ).rejects.toThrow('Invalid command format');

      await expect(
        commandManager.addCommand(' ')
      ).rejects.toThrow('Invalid command format');

      const longCommand = 'A'.repeat(101);
      await expect(
        commandManager.addCommand(longCommand)
      ).rejects.toThrow('Command too long');
    });

    it('should sanitize command input', async () => {
      const command = '  Find Keywords  ';
      await commandManager.addCommand(command);
      
      const commands = await commandManager.getCommands();
      expect(commands).toContain('Find Keywords');
    });
  });

  describe('Command History', () => {
    it('should track recently used commands', async () => {
      await commandManager.recordCommandUse('Summarize');
      await commandManager.recordCommandUse('Translate');
      
      const recentCommands = await commandManager.getRecentCommands();
      expect(recentCommands[0]).toBe('Translate');
      expect(recentCommands[1]).toBe('Summarize');
    });

    it('should limit recent commands list', async () => {
      const maxRecentCommands = 5;
      
      for (let i = 0; i < 10; i++) {
        await commandManager.recordCommandUse(`Command ${i}`);
      }
      
      const recentCommands = await commandManager.getRecentCommands();
      expect(recentCommands.length).toBe(maxRecentCommands);
    });
  });

  describe('Command Categories', () => {
    it('should organize commands by category', async () => {
      await commandManager.addCommand('Count Words', 'Analysis');
      await commandManager.addCommand('Find Citations', 'Research');
      
      const categories = await commandManager.getCommandCategories();
      expect(categories.Analysis).toContain('Count Words');
      expect(categories.Research).toContain('Find Citations');
    });

    it('should move commands between categories', async () => {
      const command = 'Analyze Sources';
      await commandManager.addCommand(command, 'Research');
      await commandManager.updateCommandCategory(command, 'Analysis');
      
      const categories = await commandManager.getCommandCategories();
      expect(categories.Analysis).toContain(command);
      expect(categories.Research).not.toContain(command);
    });
  });

  describe('Command Persistence', () => {
    it('should persist custom commands across sessions', async () => {
      const command = 'Persistent Command';
      await commandManager.addCommand(command);
      
      // Simulate new session
      const newCommandManager = new CommandManager();
      const commands = await newCommandManager.getCommands();
      expect(commands).toContain(command);
    });

    it('should persist command categories across sessions', async () => {
      const command = 'Category Test';
      const category = 'Test Category';
      await commandManager.addCommand(command, category);
      
      // Simulate new session
      const newCommandManager = new CommandManager();
      const categories = await newCommandManager.getCommandCategories();
      expect(categories[category]).toContain(command);
    });
  });
}); 