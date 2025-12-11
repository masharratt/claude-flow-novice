// Stub: config manager
// Created to satisfy test imports

export interface ConfigOptions {
  configPath?: string;
  env?: string;
}

export class ConfigManager {
  private config: Record<string, unknown> = {};

  constructor(options?: ConfigOptions) {
    // Stub implementation
  }

  get<T = unknown>(key: string, defaultValue?: T): T {
    return (this.config[key] as T) ?? (defaultValue as T);
  }

  set(key: string, value: unknown): void {
    this.config[key] = value;
  }

  has(key: string): boolean {
    return key in this.config;
  }

  async load(): Promise<void> {
    // Stub implementation
  }

  async save(): Promise<void> {
    // Stub implementation
  }
}
