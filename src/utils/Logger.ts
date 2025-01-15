export type LogLevel = 'info' | 'debug' | 'error' | 'llm';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export class Logger {
  private static instance: Logger;
  private readonly maxEntries = 1000;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private async getLogs(): Promise<LogEntry[]> {
    const result = await chrome.storage.local.get('logs');
    return result.logs || [];
  }

  private async saveLogs(logs: LogEntry[]): Promise<void> {
    // Keep only the last maxEntries
    const trimmedLogs = logs.slice(-this.maxEntries);
    await chrome.storage.local.set({ logs: trimmedLogs });
  }

  private async addLog(level: LogLevel, message: string, details?: Record<string, unknown>): Promise<void> {
    const logs = await this.getLogs();
    const newLog: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      details
    };
    logs.push(newLog);
    await this.saveLogs(logs);
  }

  async info(message: string, details?: Record<string, unknown>): Promise<void> {
    await this.addLog('info', message, details);
  }

  async debug(message: string, details?: Record<string, unknown>): Promise<void> {
    await this.addLog('debug', message, details);
  }

  async error(message: string, details?: Record<string, unknown>): Promise<void> {
    await this.addLog('error', message, details);
  }

  async llm(message: string, details?: Record<string, unknown>): Promise<void> {
    await this.addLog('llm', message, details);
  }

  async exportLogs(): Promise<string> {
    const logs = await this.getLogs();
    return JSON.stringify(logs, null, 2);
  }

  async filterByLevel(level: LogLevel): Promise<LogEntry[]> {
    const logs = await this.getLogs();
    return logs.filter(log => log.level === level);
  }
} 