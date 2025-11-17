/**
 * Configuration Manager v2
 * YAML-based configuration management with hot reload and migration support
 *
 * @version 2.0.0
 * @description Standardized configuration management for CFN
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import Ajv, { JSONSchemaType } from 'ajv';
import { EventEmitter } from 'events';
import * as chokidar from 'chokidar';

export interface ConfigValue {
  [key: string]: string | number | boolean | ConfigValue | ConfigValue[] | null;
}

export interface ConfigSchema {
  version?: string;
  [key: string]: ConfigValue | string | number | boolean | null | undefined;
}

export interface ConfigManagerOptions {
  enableHotReload?: boolean;
  validateOnLoad?: boolean;
  coerceTypes?: boolean;
}

/**
 * ConfigManager - Type-safe YAML configuration management
 */
export class ConfigManager extends EventEmitter {
  private config: ConfigSchema = {};
  private configPath: string;
  private schemaPath: string;
  private ajv: Ajv;
  private watcher: chokidar.FSWatcher | null = null;
  private environment: string = 'default';
  private options: ConfigManagerOptions;

  constructor(
    configPath: string,
    schemaPath: string,
    options: ConfigManagerOptions = {}
  ) {
    super();
    this.configPath = configPath;
    this.schemaPath = schemaPath;
    this.ajv = new Ajv({ allErrors: true, strict: false });
    this.options = {
      enableHotReload: false,
      validateOnLoad: true,
      coerceTypes: true,
      ...options
    };
  }

  /**
   * Load configuration from file
   */
  async load(environment: string = 'default'): Promise<void> {
    this.environment = environment;

    try {
      // Load base configuration
      const baseConfig = await this.loadConfigFile(this.configPath);

      // Load environment-specific overrides if not default
      let envConfig: ConfigSchema = {};
      if (environment !== 'default') {
        const envPath = this.getEnvironmentConfigPath(environment);
        try {
          envConfig = await this.loadConfigFile(envPath);
        } catch (error) {
          // Environment override file doesn't exist - that's okay
          this.emit('warning', `Environment config not found: ${envPath}`);
        }
      }

      // Merge configurations (environment overrides base)
      this.config = this.deepMerge(baseConfig, envConfig);

      // Type coercion if enabled
      if (this.options.coerceTypes) {
        this.config = this.coerceTypes(this.config);
      }

      // Validate against schema
      if (this.options.validateOnLoad) {
        await this.validate();
      }

      this.emit('loaded', this.config);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load configuration: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load configuration from YAML or JSON file
   */
  private async loadConfigFile(filePath: string): Promise<ConfigSchema> {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    try {
      if (ext === '.yml' || ext === '.yaml') {
        return yaml.load(content) as ConfigSchema;
      } else if (ext === '.json') {
        this.emit('warning', `JSON format is deprecated. Please migrate to YAML: ${filePath}`);
        return JSON.parse(content) as ConfigSchema;
      } else {
        throw new Error(`Unsupported configuration format: ${ext}`);
      }
    } catch (error) {
      if (error instanceof yaml.YAMLException) {
        throw new Error(`YAML parsing error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get environment-specific config path
   */
  private getEnvironmentConfigPath(environment: string): string {
    const dir = path.dirname(this.configPath);
    const ext = path.extname(this.configPath);
    return path.join(dir, `${environment}${ext}`);
  }

  /**
   * Validate configuration against JSON schema
   */
  private async validate(): Promise<void> {
    const schemaContent = await fs.readFile(this.schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);

    const validate = this.ajv.compile(schema);
    const valid = validate(this.config);

    if (!valid) {
      const errors = validate.errors?.map(err =>
        `${err.instancePath} ${err.message}`
      ).join(', ');
      throw new Error(`Configuration schema validation failed: ${errors}`);
    }
  }

  /**
   * Coerce types from strings to proper types
   */
  private coerceTypes(obj: any, parentKey?: string): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.coerceTypes(item));
    }

    if (typeof obj === 'object') {
      const coerced: any = {};
      for (const [key, value] of Object.entries(obj)) {
        coerced[key] = this.coerceTypes(value, key);
      }
      return coerced;
    }

    if (typeof obj === 'string') {
      // Don't coerce 'version' fields - keep as strings
      if (parentKey === 'version') {
        return obj;
      }

      // Boolean coercion (case insensitive)
      const lower = obj.toLowerCase();
      if (lower === 'true') return true;
      if (lower === 'false') return false;

      // Null coercion
      if (lower === 'null') return null;

      // Number coercion - only if it looks like a pure number
      // Don't coerce version strings like "1.0", "2.5.0"
      if (/^-?\d+$/.test(obj)) {
        return parseInt(obj, 10);
      }
      if (/^-?\d+\.\d+$/.test(obj) && !obj.match(/\d+\.\d+\.\d+/)) {
        return parseFloat(obj);
      }
    }

    return obj;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    if (!source) return target;
    if (!target) return source;

    const output = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (
          typeof source[key] === 'object' &&
          source[key] !== null &&
          !Array.isArray(source[key])
        ) {
          if (key in output) {
            output[key] = this.deepMerge(output[key], source[key]);
          } else {
            output[key] = source[key];
          }
        } else {
          output[key] = source[key];
        }
      }
    }

    return output;
  }

  /**
   * Get configuration value by key path
   */
  get<T = any>(keyPath: string, defaultValue?: T): T {
    const keys = keyPath.split('.');
    let value: any = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue as T;
      }
    }

    return value as T;
  }

  /**
   * Get all configuration
   */
  getAll(): ConfigSchema {
    return { ...this.config };
  }

  /**
   * Set configuration value (runtime only, not persisted)
   */
  set(keyPath: string, value: any): void {
    const keys = keyPath.split('.');
    let current: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
    this.emit('changed', keyPath, value);
  }

  /**
   * Enable hot reload (file watching)
   */
  async enableHotReload(): Promise<void> {
    if (this.watcher) {
      return; // Already watching
    }

    const watchPaths = [this.configPath];

    // Add environment-specific config if not default
    if (this.environment !== 'default') {
      watchPaths.push(this.getEnvironmentConfigPath(this.environment));
    }

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    this.watcher.on('change', async (filePath: string) => {
      try {
        await this.reload();
        this.emit('reload', this.config);
      } catch (error) {
        this.emit('error', error);
      }
    });

    this.emit('hotReloadEnabled');
  }

  /**
   * Disable hot reload
   */
  async disableHotReload(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.emit('hotReloadDisabled');
    }
  }

  /**
   * Reload configuration from disk
   */
  async reload(): Promise<void> {
    await this.load(this.environment);
  }

  /**
   * Check if configuration has a key
   */
  has(keyPath: string): boolean {
    const keys = keyPath.split('.');
    let value: any = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return false;
      }
    }

    return true;
  }

  /**
   * Export configuration to YAML string
   */
  toYAML(): string {
    return yaml.dump(this.config, {
      indent: 2,
      lineWidth: 80,
      noRefs: true
    });
  }

  /**
   * Export configuration to JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    await this.disableHotReload();
    this.removeAllListeners();
    this.config = {};
  }
}

/**
 * Singleton instance for global configuration
 */
let globalInstance: ConfigManager | null = null;

export function getGlobalConfigManager(): ConfigManager {
  if (!globalInstance) {
    throw new Error('ConfigManager not initialized. Call initializeConfigManager() first.');
  }
  return globalInstance;
}

export function initializeConfigManager(
  configPath: string,
  schemaPath: string,
  options?: ConfigManagerOptions
): ConfigManager {
  globalInstance = new ConfigManager(configPath, schemaPath, options);
  return globalInstance;
}

export function resetGlobalConfigManager(): void {
  if (globalInstance) {
    globalInstance.destroy();
    globalInstance = null;
  }
}
