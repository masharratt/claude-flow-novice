// Stub: logging utilities
// Created to satisfy test imports

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export class ConsoleLogger implements Logger {
  constructor(private context: string = 'default') {}

  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(`[${this.context}] ${message}`, meta || '');
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.info(`[${this.context}] ${message}`, meta || '');
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[${this.context}] ${message}`, meta || '');
  }

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[${this.context}] ${message}`, meta || '');
  }
}

export function createLogger(context: string): Logger {
  return new ConsoleLogger(context);
}
