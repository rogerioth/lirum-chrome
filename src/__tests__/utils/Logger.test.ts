import { Logger } from '../../utils/Logger';

describe('Logger', () => {
  let logger: Logger;
  
  beforeEach(() => {
    // Clear chrome.storage.local before each test
    chrome.storage.local.clear();
    logger = Logger.getInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when getInstance is called multiple times', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Log Levels', () => {
    beforeEach(() => {
      jest.spyOn(chrome.storage.local, 'set');
    });

    it('should log info messages correctly', () => {
      const message = 'Test info message';
      logger.info(message);
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          logs: expect.arrayContaining([
            expect.objectContaining({
              level: 'info',
              message,
              timestamp: expect.any(String)
            })
          ])
        })
      );
    });

    it('should log debug messages with details', () => {
      const message = 'Test debug message';
      const details = { key: 'value' };
      logger.debug(message, details);
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          logs: expect.arrayContaining([
            expect.objectContaining({
              level: 'debug',
              message,
              details,
              timestamp: expect.any(String)
            })
          ])
        })
      );
    });

    it('should log error messages with error objects', () => {
      const message = 'Test error message';
      const error = new Error('Test error');
      logger.error(message, { error });
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          logs: expect.arrayContaining([
            expect.objectContaining({
              level: 'error',
              message,
              details: { error: expect.any(Error) },
              timestamp: expect.any(String)
            })
          ])
        })
      );
    });

    it('should log LLM-specific messages', () => {
      const message = 'Test LLM operation';
      const details = { prompt: 'test prompt', model: 'gpt-4' };
      logger.llm(message, details);
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          logs: expect.arrayContaining([
            expect.objectContaining({
              level: 'llm',
              message,
              details,
              timestamp: expect.any(String)
            })
          ])
        })
      );
    });
  });

  describe('Log Rotation', () => {
    it('should maintain maximum of 1000 entries', async () => {
      // Fill with 1001 entries
      for (let i = 0; i < 1001; i++) {
        logger.info(`Log entry ${i}`);
      }

      const logs = await chrome.storage.local.get('logs');
      expect(logs.logs.length).toBe(1000);
      // Verify the oldest entry was removed
      expect(logs.logs[0].message).toBe('Log entry 1');
    });
  });

  describe('Log Export', () => {
    it('should export logs in correct JSON format', async () => {
      const testMessage = 'Test export message';
      logger.info(testMessage);
      
      const exported = await logger.exportLogs();
      const parsed = JSON.parse(exported);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toEqual(
        expect.objectContaining({
          level: 'info',
          message: testMessage,
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('Log Filtering', () => {
    beforeEach(async () => {
      logger.info('Info message');
      logger.debug('Debug message');
      logger.error('Error message');
      logger.llm('LLM message');
    });

    it('should filter logs by level', async () => {
      const infoLogs = await logger.filterByLevel('info');
      expect(infoLogs.every(log => log.level === 'info')).toBe(true);
      
      const debugLogs = await logger.filterByLevel('debug');
      expect(debugLogs.every(log => log.level === 'debug')).toBe(true);
    });
  });
}); 