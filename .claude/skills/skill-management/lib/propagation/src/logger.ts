/**
 * Logger implementation for Skill Propagation System
 */

import type { Logger, LoggerConfig } from './types';

export class ConsoleLogger implements Logger {
  private debugEnabled: boolean;

  constructor(config?: LoggerConfig) {
    this.debugEnabled = config?.debug ?? false;
  }

  info(message: string): void {
    console.error(`[INFO] ${message}`);
  }

  success(message: string): void {
    console.error(`[SUCCESS] ${message}`);
  }

  error(message: string): void {
    console.error(`[ERROR] ${message}`);
  }

  warning(message: string): void {
    console.error(`[WARNING] ${message}`);
  }

  debug(message: string): void {
    if (this.debugEnabled) {
      console.error(`[DEBUG] ${message}`);
    }
  }
}

export class NoOpLogger implements Logger {
  info(): void {}
  success(): void {}
  error(): void {}
  warning(): void {}
  debug(): void {}
}
