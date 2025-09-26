/**
 * Configuration Export/Import Utilities
 * Handles configuration backup, export, and import with various formats
 */

import { promises as fs } from 'fs';
import path from 'path';
import { Config, ConfigManager } from '../config-manager.js';

export interface ExportOptions {
  format: 'json' | 'yaml' | 'toml' | 'env';
  includeSecrets?: boolean;
  includeComments?: boolean;
  minify?: boolean;
  outputPath?: string;
}

export interface ImportOptions {
  format?: 'auto' | 'json' | 'yaml' | 'toml' | 'env';
  merge?: boolean;
  validate?: boolean;
  backup?: boolean;
}

export interface ExportResult {
  success: boolean;
  outputPath: string;
  format: string;
  size: number;
  warnings: string[];
}

export interface ImportResult {
  success: boolean;
  importedSettings: string[];
  warnings: string[];
  backupPath?: string;
}

/**
 * Configuration export and import manager
 */
export class ConfigExportImport {
  private configManager: ConfigManager;

  constructor() {
    this.configManager = ConfigManager.getInstance();
  }

  /**
   * Export configuration to various formats
   */
  async export(options: ExportOptions): Promise<ExportResult> {
    const result: ExportResult = {
      success: false,
      outputPath: '',
      format: options.format,
      size: 0,
      warnings: []
    };

    try {
      const config = this.configManager.show();
      const sanitizedConfig = options.includeSecrets ? config : this.sanitizeSecrets(config);

      let content: string;
      let extension: string;

      switch (options.format) {
        case 'json':
          content = this.exportToJSON(sanitizedConfig, options);
          extension = '.json';
          break;
        case 'yaml':
          content = this.exportToYAML(sanitizedConfig, options);
          extension = '.yaml';
          break;
        case 'toml':
          content = this.exportToTOML(sanitizedConfig, options);
          extension = '.toml';
          break;
        case 'env':
          content = this.exportToEnv(sanitizedConfig, options);
          extension = '.env';
          break;
        default:
          throw new Error(`Unsupported format: ${options.format}`);
      }

      // Determine output path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = options.outputPath ||
        `claude-flow-config-export-${timestamp}${extension}`;

      // Write to file
      await fs.writeFile(outputPath, content, 'utf8');

      result.success = true;
      result.outputPath = outputPath;
      result.size = Buffer.byteLength(content, 'utf8');

      if (!options.includeSecrets) {
        result.warnings.push('Sensitive data excluded from export');
      }

      return result;
    } catch (error) {
      result.warnings.push(`Export failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Import configuration from various formats
   */
  async import(filePath: string, options: ImportOptions = {}): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      importedSettings: [],
      warnings: []
    };

    try {
      // Create backup if requested
      if (options.backup) {
        result.backupPath = await this.createBackup();
        result.importedSettings.push(`Created backup: ${result.backupPath}`);
      }

      // Read and parse file
      const content = await fs.readFile(filePath, 'utf8');
      const format = options.format === 'auto' ?
        this.detectFormat(filePath, content) :
        options.format || 'json';

      let importedConfig: Partial<Config>;

      switch (format) {
        case 'json':
          importedConfig = JSON.parse(content);
          break;
        case 'yaml':
          importedConfig = this.parseYAML(content);
          break;
        case 'toml':
          importedConfig = this.parseTOML(content);
          break;
        case 'env':
          importedConfig = this.parseEnv(content);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      // Validate imported config if requested
      if (options.validate) {
        const validation = await this.validateImportedConfig(importedConfig);
        if (!validation.isValid) {
          result.warnings.push(...validation.errors);
          if (validation.errors.some(e => e.severity === 'critical')) {
            throw new Error('Critical validation errors in imported configuration');
          }
        }
      }

      // Apply imported configuration
      if (options.merge) {
        await this.mergeConfig(importedConfig, result);
      } else {
        await this.replaceConfig(importedConfig, result);
      }

      result.success = true;
      return result;
    } catch (error) {
      result.warnings.push(`Import failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Export current configuration to JSON
   */
  private exportToJSON(config: Config, options: ExportOptions): string {
    if (options.minify) {
      return JSON.stringify(config);
    }

    let jsonStr = JSON.stringify(config, null, 2);

    if (options.includeComments) {
      jsonStr = this.addJSONComments(jsonStr);
    }

    return jsonStr;
  }

  /**
   * Export configuration to YAML format
   */
  private exportToYAML(config: Config, options: ExportOptions): string {
    // Simple YAML export (in production, use a proper YAML library)
    let yaml = '# Claude-Flow Configuration\n';
    yaml += `# Exported: ${new Date().toISOString()}\n\n`;

    yaml += this.objectToYAML(config, 0);
    return yaml;
  }

  /**
   * Export configuration to TOML format
   */
  private exportToTOML(config: Config, options: ExportOptions): string {
    // Simple TOML export (in production, use a proper TOML library)
    let toml = '# Claude-Flow Configuration\n';
    toml += `# Exported: ${new Date().toISOString()}\n\n`;

    toml += this.objectToTOML(config);
    return toml;
  }

  /**
   * Export configuration to environment variables format
   */
  private exportToEnv(config: Config, options: ExportOptions): string {
    let env = '# Claude-Flow Configuration - Environment Variables\n';
    env += `# Exported: ${new Date().toISOString()}\n\n`;

    const flatConfig = this.flattenConfig(config);

    for (const [key, value] of Object.entries(flatConfig)) {
      const envKey = `CLAUDE_FLOW_${key.toUpperCase().replace(/\./g, '_')}`;
      env += `${envKey}=${this.escapeEnvValue(value)}\n`;
    }

    return env;
  }

  /**
   * Simple object to YAML converter
   */
  private objectToYAML(obj: any, indent: number): string {
    let yaml = '';
    const spaces = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        yaml += this.objectToYAML(value, indent + 1);
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          yaml += `${spaces}  - ${JSON.stringify(item)}\n`;
        }
      } else {
        yaml += `${spaces}${key}: ${JSON.stringify(value)}\n`;
      }
    }

    return yaml;
  }

  /**
   * Simple object to TOML converter
   */
  private objectToTOML(obj: any): string {
    let toml = '';

    // Handle top-level simple values first
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value !== 'object' || value === null) {
        toml += `${key} = ${JSON.stringify(value)}\n`;
      }
    }

    toml += '\n';

    // Handle objects as sections
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        toml += `[${key}]\n`;
        for (const [subKey, subValue] of Object.entries(value)) {
          toml += `${subKey} = ${JSON.stringify(subValue)}\n`;
        }
        toml += '\n';
      }
    }

    return toml;
  }

  /**
   * Parse YAML content (simplified)
   */
  private parseYAML(content: string): any {
    // In production, use a proper YAML parser like 'yaml' package
    // This is a simplified implementation
    const lines = content.split('\n').filter(line =>
      line.trim() && !line.trim().startsWith('#')
    );

    const result: any = {};
    let currentSection = result;
    let sectionPath: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();

        if (value === '') {
          // Section header
          const indent = line.length - line.trimLeft().length;
          const depth = Math.floor(indent / 2);

          sectionPath = sectionPath.slice(0, depth);
          sectionPath.push(key.trim());

          let current = result;
          for (let i = 0; i < sectionPath.length - 1; i++) {
            current = current[sectionPath[i]];
          }
          current[key.trim()] = {};
          currentSection = current[key.trim()];
        } else {
          // Key-value pair
          try {
            currentSection[key.trim()] = JSON.parse(value);
          } catch {
            currentSection[key.trim()] = value.replace(/^["']|["']$/g, '');
          }
        }
      }
    }

    return result;
  }

  /**
   * Parse TOML content (simplified)
   */
  private parseTOML(content: string): any {
    // In production, use a proper TOML parser
    const result: any = {};
    let currentSection = result;

    const lines = content.split('\n').filter(line =>
      line.trim() && !line.trim().startsWith('#')
    );

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        // Section header
        const sectionName = trimmed.slice(1, -1);
        result[sectionName] = {};
        currentSection = result[sectionName];
      } else if (trimmed.includes('=')) {
        // Key-value pair
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();

        try {
          currentSection[key.trim()] = JSON.parse(value);
        } catch {
          currentSection[key.trim()] = value.replace(/^["']|["']$/g, '');
        }
      }
    }

    return result;
  }

  /**
   * Parse environment variables content
   */
  private parseEnv(content: string): any {
    const result: any = {};
    const lines = content.split('\n').filter(line =>
      line.trim() && !line.trim().startsWith('#')
    );

    for (const line of lines) {
      if (line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=');

        if (key.startsWith('CLAUDE_FLOW_')) {
          const configPath = key.replace('CLAUDE_FLOW_', '').toLowerCase().replace(/_/g, '.');
          this.setNestedValue(result, configPath, this.parseEnvValue(value));
        }
      }
    }

    return result;
  }

  /**
   * Utility methods
   */
  private sanitizeSecrets(config: Config): Config {
    const sanitized = JSON.parse(JSON.stringify(config));

    // Remove sensitive data
    if (sanitized.claude) {
      delete sanitized.claude.apiKey;
    }

    return sanitized;
  }

  private detectFormat(filePath: string, content: string): string {
    const extension = path.extname(filePath).toLowerCase();

    switch (extension) {
      case '.json': return 'json';
      case '.yaml':
      case '.yml': return 'yaml';
      case '.toml': return 'toml';
      case '.env': return 'env';
      default:
        // Try to detect from content
        try {
          JSON.parse(content);
          return 'json';
        } catch {
          if (content.includes('[') && content.includes('=')) {
            return 'toml';
          }
          if (content.includes(':') && !content.includes('=')) {
            return 'yaml';
          }
          return 'env';
        }
    }
  }

  private flattenConfig(obj: any, prefix = ''): Record<string, any> {
    const flattened: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenConfig(value, fullKey));
      } else {
        flattened[fullKey] = value;
      }
    }

    return flattened;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
  }

  private parseEnvValue(value: string): any {
    // Remove quotes
    const cleaned = value.replace(/^["']|["']$/g, '');

    // Try to parse as JSON
    try {
      return JSON.parse(cleaned);
    } catch {
      // Try boolean
      if (cleaned.toLowerCase() === 'true') return true;
      if (cleaned.toLowerCase() === 'false') return false;

      // Try number
      if (!isNaN(Number(cleaned))) return Number(cleaned);

      // Return as string
      return cleaned;
    }
  }

  private escapeEnvValue(value: any): string {
    if (typeof value === 'string' && (value.includes(' ') || value.includes('\n'))) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return String(value);
  }

  private addJSONComments(jsonStr: string): string {
    // Add helpful comments to JSON export
    const lines = jsonStr.split('\n');
    const commented: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Add comments for important sections
      if (line.includes('"orchestrator"')) {
        commented.push('  // Core orchestrator settings');
      } else if (line.includes('"experienceLevel"')) {
        commented.push('  // User experience level: novice, intermediate, advanced, enterprise');
      } else if (line.includes('"featureFlags"')) {
        commented.push('  // Progressive disclosure feature flags');
      }

      commented.push(line);
    }

    return commented.join('\n');
  }

  private async validateImportedConfig(config: any): Promise<{isValid: boolean, errors: any[]}> {
    // Basic validation - in production, use the full ConfigValidator
    const errors: any[] = [];

    if (!config.orchestrator) {
      errors.push({ field: 'orchestrator', severity: 'critical', message: 'Missing orchestrator configuration' });
    }

    if (!config.experienceLevel) {
      errors.push({ field: 'experienceLevel', severity: 'high', message: 'Missing experience level' });
    }

    return {
      isValid: errors.filter(e => e.severity === 'critical').length === 0,
      errors
    };
  }

  private async mergeConfig(importedConfig: Partial<Config>, result: ImportResult): Promise<void> {
    // Merge imported config with existing config
    for (const [key, value] of Object.entries(importedConfig)) {
      this.configManager.set(key, value);
      result.importedSettings.push(`Merged ${key}`);
    }

    await this.configManager.save();
  }

  private async replaceConfig(importedConfig: Partial<Config>, result: ImportResult): Promise<void> {
    // Replace current config with imported config
    const currentConfig = this.configManager.show();
    const mergedConfig = { ...currentConfig, ...importedConfig };

    // Apply the merged config (this is simplified - in production, handle this more carefully)
    for (const [key, value] of Object.entries(mergedConfig)) {
      this.configManager.set(key, value);
    }

    result.importedSettings.push('Replaced entire configuration');
    await this.configManager.save();
  }

  private async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `claude-flow-config-backup-${timestamp}.json`;

    const currentConfig = this.configManager.show();
    await fs.writeFile(backupPath, JSON.stringify(currentConfig, null, 2), 'utf8');

    return backupPath;
  }
}

/**
 * Convenience functions
 */
export async function exportConfig(options: ExportOptions): Promise<ExportResult> {
  const exporter = new ConfigExportImport();
  return await exporter.export(options);
}

export async function importConfig(filePath: string, options?: ImportOptions): Promise<ImportResult> {
  const importer = new ConfigExportImport();
  return await importer.import(filePath, options);
}