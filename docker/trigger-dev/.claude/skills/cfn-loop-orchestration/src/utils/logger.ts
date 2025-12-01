/**
 * Logging utility for orchestration engine
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Simple logger utility
 */
export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  debug(message: string, data?: unknown): void {
    console.log(`[DEBUG] [${this.context}] ${message}`, data ?? '');
  }

  info(message: string, data?: unknown): void {
    console.log(`[INFO] [${this.context}] ${message}`, data ?? '');
  }

  warn(message: string, data?: unknown): void {
    console.warn(`[WARN] [${this.context}] ${message}`, data ?? '');
  }

  error(message: string, error?: unknown): void {
    console.error(`[ERROR] [${this.context}] ${message}`, error ?? '');
  }
}
