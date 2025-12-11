// Stub: config types
// Created to satisfy test imports

export interface AppConfig {
  env: string;
  port?: number;
  logLevel?: string;
  [key: string]: unknown;
}

export interface DatabaseConfig {
  type: 'sqlite' | 'redis' | 'postgres';
  host?: string;
  port?: number;
  database?: string;
}

export interface AgentConfig {
  type: string;
  timeout?: number;
  maxRetries?: number;
  [key: string]: unknown;
}

export interface SystemConfig {
  app: AppConfig;
  database: DatabaseConfig;
  agents?: AgentConfig[];
}
