/**
 * Configuration Migrator
 * Migrate legacy configuration formats to YAML
 *
 * @version 1.0.0
 * @description Handles migration from JSON, ENV, and bash variable formats
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import { ConfigSchema } from './config-manager.js';

export interface MigrationOptions {
  dryRun?: boolean;
  createBackup?: boolean;
  validate?: boolean;
}

export interface MigrationResult {
  success: boolean;
  sourcePath: string;
  targetPath: string;
  backupPath?: string;
  preview?: string;
  errors?: string[];
}

/**
 * ConfigMigrator - Convert legacy formats to YAML
 */
export class ConfigMigrator {
  private schemaPath?: string;
  private ajv: Ajv;

  constructor(schemaPath?: string) {
    this.schemaPath = schemaPath;
    this.ajv = new Ajv({ allErrors: true, strict: false });
  }

  /**
   * Migrate JSON configuration to YAML
   */
  async migrateJsonToYaml(
    jsonPath: string,
    yamlPath: string,
    options: MigrationOptions = {}
  ): Promise<string> {
    const opts = {
      dryRun: false,
      createBackup: true,
      validate: true,
      ...options
    };

    try {
      // Read JSON file
      const jsonContent = await fs.readFile(jsonPath, 'utf-8');
      const config = JSON.parse(jsonContent) as ConfigSchema;

      // Validate if schema provided
      if (opts.validate && this.schemaPath) {
        await this.validateConfig(config);
      }

      // Convert to YAML
      const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 80,
        noRefs: true,
        quotingType: "'"
      });

      // Dry run - return preview without writing
      if (opts.dryRun) {
        return yamlContent;
      }

      // Create backup of source file
      if (opts.createBackup) {
        await this.createBackup(jsonPath);
      }

      // Write YAML file
      await fs.writeFile(yamlPath, yamlContent, 'utf-8');

      return yamlContent;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`JSON to YAML migration failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Migrate .env file to YAML
   */
  async migrateEnvToYaml(
    envPath: string,
    yamlPath: string,
    options: MigrationOptions = {}
  ): Promise<string> {
    const opts = {
      dryRun: false,
      createBackup: true,
      validate: false, // ENV files typically don't match schema directly
      ...options
    };

    try {
      // Read ENV file
      const envContent = await fs.readFile(envPath, 'utf-8');

      // Parse ENV variables
      const config = this.parseEnvFile(envContent);

      // Convert flat structure to nested
      const nestedConfig = this.unflattenObject(config);

      // Validate if schema provided
      if (opts.validate && this.schemaPath) {
        await this.validateConfig(nestedConfig);
      }

      // Convert to YAML
      const yamlContent = yaml.dump(nestedConfig, {
        indent: 2,
        lineWidth: 80,
        noRefs: true
      });

      // Dry run - return preview
      if (opts.dryRun) {
        return yamlContent;
      }

      // Create backup
      if (opts.createBackup) {
        await this.createBackup(envPath);
      }

      // Write YAML file
      await fs.writeFile(yamlPath, yamlContent, 'utf-8');

      return yamlContent;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`ENV to YAML migration failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Migrate bash variable file to YAML
   */
  async migrateBashToYaml(
    bashPath: string,
    yamlPath: string,
    options: MigrationOptions = {}
  ): Promise<string> {
    const opts = {
      dryRun: false,
      createBackup: true,
      validate: false,
      ...options
    };

    try {
      // Read bash file
      const bashContent = await fs.readFile(bashPath, 'utf-8');

      // Parse bash variables
      const config = this.parseBashFile(bashContent);

      // Convert flat structure to nested
      const nestedConfig = this.unflattenObject(config);

      // Validate if schema provided
      if (opts.validate && this.schemaPath) {
        await this.validateConfig(nestedConfig);
      }

      // Convert to YAML
      const yamlContent = yaml.dump(nestedConfig, {
        indent: 2,
        lineWidth: 80,
        noRefs: true
      });

      // Dry run - return preview
      if (opts.dryRun) {
        return yamlContent;
      }

      // Create backup
      if (opts.createBackup) {
        await this.createBackup(bashPath);
      }

      // Write YAML file
      await fs.writeFile(yamlPath, yamlContent, 'utf-8');

      return yamlContent;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bash to YAML migration failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Parse .env file into key-value pairs
   */
  private parseEnvFile(content: string): Record<string, any> {
    const config: Record<string, any> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse KEY=value format
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        config[this.toCamelCase(key)] = this.inferType(value.trim());
      }
    }

    return config;
  }

  /**
   * Parse bash variable file
   */
  private parseBashFile(content: string): Record<string, any> {
    const config: Record<string, any> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments, empty lines, and shebang
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('export ')) {
        continue;
      }

      // Parse variable assignments
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=["']?([^"']*)["']?$/);
      if (match) {
        const [, key, value] = match;
        config[this.toCamelCase(key)] = this.inferType(value.trim());
      }
    }

    return config;
  }

  /**
   * Infer type from string value
   */
  private inferType(value: string): any {
    // Remove quotes if present
    const unquoted = value.replace(/^["']|["']$/g, '');

    // Boolean
    if (unquoted.toLowerCase() === 'true') return true;
    if (unquoted.toLowerCase() === 'false') return false;

    // Null
    if (unquoted.toLowerCase() === 'null') return null;

    // Number (integer)
    if (/^-?\d+$/.test(unquoted)) {
      return parseInt(unquoted, 10);
    }

    // Number (float)
    if (/^-?\d+\.\d+$/.test(unquoted)) {
      return parseFloat(unquoted);
    }

    // String
    return unquoted;
  }

  /**
   * Convert SCREAMING_SNAKE_CASE to camelCase
   */
  private toCamelCase(str: string): string {
    return str
      .toLowerCase()
      .replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Convert flat object to nested structure
   * Example: { databaseType: 'sqlite', databasePath: './data' }
   * Becomes: { database: { type: 'sqlite', path: './data' } }
   */
  private unflattenObject(flat: Record<string, any>): any {
    const nested: any = {};

    // Group by common prefixes
    for (const [key, value] of Object.entries(flat)) {
      // Try to detect nested structure by camelCase boundaries
      const parts = this.splitCamelCase(key);

      if (parts.length === 1) {
        // No nesting detected
        nested[key] = value;
      } else if (parts.length === 2) {
        // Two-level nesting: databaseType → database.type
        const [prefix, suffix] = parts;
        if (!(prefix in nested)) {
          nested[prefix] = {};
        }
        if (typeof nested[prefix] === 'object') {
          nested[prefix][suffix] = value;
        }
      } else if (parts.length >= 3) {
        // Multi-level nesting: databasePoolMin → database.pool.min
        let current = nested;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!(part in current)) {
            current[part] = {};
          }
          if (typeof current[part] !== 'object' || Array.isArray(current[part])) {
            // Can't nest further, use flat key instead
            nested[key] = value;
            break;
          }
          current = current[part];
        }
        if (typeof current === 'object' && !Array.isArray(current)) {
          current[parts[parts.length - 1]] = value;
        }
      }
    }

    return nested;
  }

  /**
   * Split camelCase string into parts
   */
  private splitCamelCase(str: string): string[] {
    // Handle common patterns: databaseType, redisHost, etc.
    // Split on uppercase boundaries, keeping the uppercase letter
    const parts: string[] = [];
    let current = '';

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (char === char.toUpperCase() && char !== char.toLowerCase()) {
        // Uppercase letter - start new part
        if (current) {
          parts.push(current.toLowerCase());
        }
        current = char;
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current.toLowerCase());
    }

    return parts.length > 0 ? parts : [str.toLowerCase()];
  }

  /**
   * Validate configuration against schema
   */
  private async validateConfig(config: ConfigSchema): Promise<void> {
    if (!this.schemaPath) {
      throw new Error('Schema path not provided for validation');
    }

    const schemaContent = await fs.readFile(this.schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);

    const validate = this.ajv.compile(schema);
    const valid = validate(config);

    if (!valid) {
      const errors = validate.errors?.map(err =>
        `${err.instancePath} ${err.message}`
      ).join(', ');
      throw new Error(`Configuration validation failed: ${errors}`);
    }
  }

  /**
   * Create backup of file
   */
  private async createBackup(filePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath);

    const backupPath = path.join(dir, `${base}.${timestamp}.backup${ext}`);

    await fs.copyFile(filePath, backupPath);

    return backupPath;
  }

  /**
   * Scan directory for legacy configuration files
   */
  async scanForLegacyConfigs(directory: string): Promise<string[]> {
    const legacyFiles: string[] = [];

    try {
      const files = await fs.readdir(directory, { withFileTypes: true });

      for (const file of files) {
        if (file.isFile()) {
          const fullPath = path.join(directory, file.name);

          // Check for legacy formats
          if (
            file.name.endsWith('.json') ||
            file.name === '.env' ||
            file.name.endsWith('.env') ||
            (file.name.endsWith('.sh') && file.name.includes('config'))
          ) {
            legacyFiles.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or not accessible
      return [];
    }

    return legacyFiles;
  }

  /**
   * Batch migrate multiple files
   */
  async batchMigrate(
    files: string[],
    outputDir: string,
    options: MigrationOptions = {}
  ): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];

    for (const filePath of files) {
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const yamlPath = path.join(outputDir, `${base}.yml`);

      try {
        let preview: string | undefined;

        if (ext === '.json') {
          preview = await this.migrateJsonToYaml(filePath, yamlPath, options);
        } else if (filePath.includes('.env')) {
          preview = await this.migrateEnvToYaml(filePath, yamlPath, options);
        } else if (ext === '.sh') {
          preview = await this.migrateBashToYaml(filePath, yamlPath, options);
        } else {
          results.push({
            success: false,
            sourcePath: filePath,
            targetPath: yamlPath,
            errors: [`Unsupported file format: ${ext}`]
          });
          continue;
        }

        results.push({
          success: true,
          sourcePath: filePath,
          targetPath: yamlPath,
          preview: options.dryRun ? preview : undefined
        });
      } catch (error) {
        results.push({
          success: false,
          sourcePath: filePath,
          targetPath: yamlPath,
          errors: [error instanceof Error ? error.message : 'Unknown error']
        });
      }
    }

    return results;
  }
}
