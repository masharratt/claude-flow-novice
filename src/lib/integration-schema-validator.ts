/**
 * Integration Schema Validator
 *
 * Task: P2-3.2 - JSON Schema Validation Enforcement
 * Enforces JSON Schema validation at all 47 integration points
 *
 * Features:
 * - Automatic validation at data boundaries
 * - Schema registry with versioning
 * - Migration support between schema versions
 * - Performance: <50ms validation, <100ms schema loading
 * - Comprehensive error reporting with StandardError
 *
 * @module integration-schema-validator
 */

import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { StandardError, ErrorCode, createValidationError } from './errors.js';
import { getGlobalLogger } from './logging.js';
import fs from 'fs/promises';
import path from 'path';

const logger = getGlobalLogger();

// ============================================================================
// Type Definitions
// ============================================================================

export interface SchemaValidatorConfig {
  /**
   * Path to directory containing JSON schemas
   */
  schemaPath: string;

  /**
   * Enable schema caching for performance
   * @default true
   */
  enableCache?: boolean;

  /**
   * Strict mode - fail on additional properties
   * @default true
   */
  strictMode?: boolean;

  /**
   * Maximum cache size (number of schemas)
   * @default 1000
   */
  maxCacheSize?: number;

  /**
   * Schema file extension
   * @default '.schema.json'
   */
  schemaExtension?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  warnings?: string[];
}

export interface ValidationError {
  path: string;
  message: string;
  keyword?: string;
  params?: Record<string, any>;
}

export interface BatchValidationResult {
  valid: boolean;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  errors: Array<{
    index: number;
    errors: ValidationError[];
  }>;
}

export interface BatchValidationOptions {
  /**
   * Stop validation on first error
   * @default false
   */
  failFast?: boolean;

  /**
   * Include valid records in result
   * @default false
   */
  includeValidRecords?: boolean;
}

export type MigrationFunction = (data: any, fromVersion: string, toVersion: string) => Promise<any>;

interface SchemaMetadata {
  id: string;
  version: string;
  category: string;
  description?: string;
  validator: ValidateFunction;
}

interface MigrationRegistry {
  [schemaId: string]: {
    [transition: string]: MigrationFunction; // "1.0.0->2.0.0"
  };
}

// ============================================================================
// Integration Categories (6 categories, 47 points total)
// ============================================================================

const INTEGRATION_CATEGORIES = [
  'database-handoffs',       // 9 points
  'file-operations',         // 11 points
  'cfn-loop-communication',  // 8 points
  'phase4-workflow',         // 7 points
  'api-layer',               // 7 points
  'data-format-transformations', // 5 points
] as const;

export type IntegrationCategory = typeof INTEGRATION_CATEGORIES[number];

// ============================================================================
// IntegrationSchemaValidator Class
// ============================================================================

export class IntegrationSchemaValidator {
  private config: Required<SchemaValidatorConfig>;
  private ajv: Ajv;
  private schemaCache: Map<string, SchemaMetadata>;
  private migrations: MigrationRegistry;
  private initialized: boolean = false;

  constructor(config: SchemaValidatorConfig) {
    this.config = {
      schemaPath: config.schemaPath,
      enableCache: config.enableCache ?? true,
      strictMode: config.strictMode ?? true,
      maxCacheSize: config.maxCacheSize ?? 1000,
      schemaExtension: config.schemaExtension ?? '.schema.json',
    };

    // Initialize Ajv with formats support
    this.ajv = new Ajv({
      allErrors: true, // Report all errors, not just first
      strict: this.config.strictMode,
      validateFormats: true,
      verbose: true, // Include schema and data in error messages
    });

    addFormats(this.ajv); // Add format validators (date-time, email, uri, etc.)

    this.schemaCache = new Map();
    this.migrations = {};

    logger.debug('IntegrationSchemaValidator initialized', {
      schemaPath: this.config.schemaPath,
      enableCache: this.config.enableCache,
      strictMode: this.config.strictMode,
    });
  }

  /**
   * Initialize validator by loading all schemas
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Verify schema directory exists
      await fs.access(this.config.schemaPath);

      // Load all schemas from directory
      const categories = await this.loadSchemaDirectory();

      logger.info('Schema validator initialized', {
        categories: categories.length,
        schemasLoaded: this.schemaCache.size,
      });

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize schema validator', error as Error, {
        schemaPath: this.config.schemaPath,
      });

      throw new StandardError(
        ErrorCode.CONFIGURATION_ERROR,
        `Failed to initialize schema validator: ${(error as Error).message}`,
        { schemaPath: this.config.schemaPath },
        error as Error
      );
    }
  }

  /**
   * Shutdown validator and clear caches
   */
  async shutdown(): Promise<void> {
    this.schemaCache.clear();
    this.migrations = {};
    this.initialized = false;

    logger.debug('Schema validator shutdown complete');
  }

  /**
   * Validate data against a schema
   *
   * @param data - Data to validate
   * @param schemaId - Schema identifier (e.g., "database-handoffs/pattern-deployment")
   * @param version - Schema version (defaults to latest)
   * @throws StandardError with VALIDATION_FAILED code if validation fails
   */
  async validate(data: any, schemaId: string, version?: string): Promise<void> {
    this.ensureInitialized();

    const startTime = Date.now();

    try {
      // Get schema validator
      const schema = await this.getSchema(schemaId, version);

      // Perform validation
      const valid = schema.validator(data);

      if (!valid) {
        const errors = this.formatErrors(schema.validator.errors || []);

        logger.warn('Schema validation failed', {
          schemaId,
          version: schema.version,
          errorCount: errors.length,
          duration: Date.now() - startTime,
        });

        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          `Schema validation failed for ${schemaId}@${schema.version}`,
          {
            schemaId,
            version: schema.version,
            errors,
            suggestions: this.generateSuggestions(errors, data),
          }
        );
      }

      logger.debug('Schema validation succeeded', {
        schemaId,
        version: schema.version,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }

      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        `Validation error: ${(error as Error).message}`,
        { schemaId, version },
        error as Error
      );
    }
  }

  /**
   * Validate batch of records
   */
  async validateBatch(
    records: any[],
    schemaId: string,
    version?: string,
    options: BatchValidationOptions = {}
  ): Promise<BatchValidationResult> {
    this.ensureInitialized();

    const result: BatchValidationResult = {
      valid: true,
      totalRecords: records.length,
      validRecords: 0,
      invalidRecords: 0,
      errors: [],
    };

    for (let i = 0; i < records.length; i++) {
      try {
        await this.validate(records[i], schemaId, version);
        result.validRecords++;
      } catch (error) {
        result.invalidRecords++;
        result.valid = false;

        if (error instanceof StandardError) {
          result.errors.push({
            index: i,
            errors: error.context?.errors || [],
          });
        }

        if (options.failFast) {
          break;
        }
      }
    }

    logger.info('Batch validation completed', {
      schemaId,
      version,
      total: result.totalRecords,
      valid: result.validRecords,
      invalid: result.invalidRecords,
    });

    return result;
  }

  /**
   * Migrate data from one schema version to another
   */
  async migrate(
    data: any,
    schemaId: string,
    fromVersion: string,
    toVersion: string
  ): Promise<any> {
    this.ensureInitialized();

    const transition = `${fromVersion}->${toVersion}`;
    const migrationFn = this.migrations[schemaId]?.[transition];

    if (!migrationFn) {
      // Check if migration is needed (same version)
      if (fromVersion === toVersion) {
        return data;
      }

      // No migration function registered
      throw new StandardError(
        ErrorCode.CONFIGURATION_ERROR,
        `No migration available for ${schemaId} from ${fromVersion} to ${toVersion}`,
        { schemaId, fromVersion, toVersion, transition }
      );
    }

    try {
      const migrated = await migrationFn(data, fromVersion, toVersion);

      logger.info('Schema migration completed', {
        schemaId,
        fromVersion,
        toVersion,
      });

      return migrated;
    } catch (error) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        `Migration failed: ${(error as Error).message}`,
        { schemaId, fromVersion, toVersion },
        error as Error
      );
    }
  }

  /**
   * Register a migration function
   */
  registerMigration(
    schemaId: string,
    fromVersion: string,
    toVersion: string,
    migrationFn: MigrationFunction
  ): void {
    const transition = `${fromVersion}->${toVersion}`;

    if (!this.migrations[schemaId]) {
      this.migrations[schemaId] = {};
    }

    this.migrations[schemaId][transition] = migrationFn;

    logger.debug('Migration registered', { schemaId, transition });
  }

  /**
   * Get schema metadata
   */
  async getSchema(schemaId: string, version?: string): Promise<SchemaMetadata> {
    const cacheKey = `${schemaId}@${version || 'latest'}`;

    // Check cache
    if (this.config.enableCache && this.schemaCache.has(cacheKey)) {
      return this.schemaCache.get(cacheKey)!;
    }

    // Load schema from file
    const schema = await this.loadSchema(schemaId, version);

    // Cache schema
    if (this.config.enableCache) {
      this.schemaCache.set(cacheKey, schema);

      // Enforce cache size limit
      if (this.schemaCache.size > this.config.maxCacheSize) {
        const firstKey = this.schemaCache.keys().next().value;
        this.schemaCache.delete(firstKey);
      }
    }

    return schema;
  }

  /**
   * Check if schema exists
   */
  async hasSchema(schemaId: string, version?: string): Promise<boolean> {
    try {
      await this.getSchema(schemaId, version);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all available schemas
   */
  async listSchemas(category?: IntegrationCategory): Promise<string[]> {
    this.ensureInitialized();

    const schemas = Array.from(this.schemaCache.keys())
      .map((key) => key.split('@')[0]) // Remove version
      .filter((id, index, self) => self.indexOf(id) === index); // Unique

    if (category) {
      return schemas.filter((id) => id.startsWith(`${category}/`));
    }

    return schemas;
  }

  /**
   * Get all available versions for a schema
   */
  async getVersions(schemaId: string): Promise<string[]> {
    const versions = Array.from(this.schemaCache.keys())
      .filter((key) => key.startsWith(`${schemaId}@`))
      .map((key) => key.split('@')[1])
      .filter((v) => v !== 'latest');

    // Also check filesystem for versions not yet cached
    const schemaDir = path.join(this.config.schemaPath, schemaId);

    try {
      const files = await fs.readdir(schemaDir);
      const fileVersions = files
        .filter((f) => f.endsWith(this.config.schemaExtension))
        .map((f) => {
          const match = f.match(/v([\d.]+)/);
          return match ? match[1] : null;
        })
        .filter((v): v is string => v !== null);

      // Merge and deduplicate
      const allVersions = [...new Set([...versions, ...fileVersions])];
      return allVersions.sort();
    } catch {
      return versions;
    }
  }

  /**
   * Get integration categories
   */
  async getCategories(): Promise<IntegrationCategory[]> {
    return [...INTEGRATION_CATEGORIES];
  }

  /**
   * Get validator configuration
   */
  getConfig(): Required<SchemaValidatorConfig> {
    return { ...this.config };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new StandardError(
        ErrorCode.CONFIGURATION_ERROR,
        'Schema validator not initialized. Call initialize() first.',
        { initialized: this.initialized }
      );
    }
  }

  private async loadSchemaDirectory(): Promise<IntegrationCategory[]> {
    const loadedCategories: IntegrationCategory[] = [];

    for (const category of INTEGRATION_CATEGORIES) {
      const categoryPath = path.join(this.config.schemaPath, category);

      try {
        await fs.access(categoryPath);
        await this.loadCategorySchemas(category);
        loadedCategories.push(category);
      } catch (error) {
        logger.warn(`Category directory not found: ${category}`, {
          categoryPath,
        });
      }
    }

    return loadedCategories;
  }

  private async loadCategorySchemas(category: IntegrationCategory): Promise<void> {
    const categoryPath = path.join(this.config.schemaPath, category);

    try {
      const entries = await fs.readdir(categoryPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Schema subdirectory (e.g., pattern-deployment/)
          const schemaName = entry.name;
          const schemaId = `${category}/${schemaName}`;
          await this.loadSchemaVersions(schemaId, path.join(categoryPath, schemaName));
        } else if (entry.isFile() && entry.name.endsWith(this.config.schemaExtension)) {
          // Direct schema file
          const schemaName = entry.name.replace(this.config.schemaExtension, '');
          const schemaId = `${category}/${schemaName}`;
          await this.loadSchemaFile(schemaId, path.join(categoryPath, entry.name), '1.0.0');
        }
      }
    } catch (error) {
      logger.error(`Failed to load schemas for category: ${category}`, error as Error, {
        categoryPath,
      });
    }
  }

  private async loadSchemaVersions(schemaId: string, schemaDir: string): Promise<void> {
    try {
      const files = await fs.readdir(schemaDir);

      for (const file of files) {
        if (file.endsWith(this.config.schemaExtension)) {
          const versionMatch = file.match(/v([\d.]+)/);
          const version = versionMatch ? versionMatch[1] : '1.0.0';
          const filePath = path.join(schemaDir, file);

          await this.loadSchemaFile(schemaId, filePath, version);
        }
      }
    } catch (error) {
      logger.error(`Failed to load schema versions: ${schemaId}`, error as Error, {
        schemaDir,
      });
    }
  }

  private async loadSchemaFile(
    schemaId: string,
    filePath: string,
    version: string
  ): Promise<void> {
    try {
      // Check if already loaded in cache
      const cacheKey = `${schemaId}@${version}`;
      if (this.schemaCache.has(cacheKey)) {
        logger.debug('Schema already cached', { schemaId, version });
        return;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const schema = JSON.parse(content);

      // Check if schema with this $id already exists in Ajv
      const schemaKey = schema.$id || `${schemaId}/${version}`;
      if (this.ajv.getSchema(schemaKey)) {
        logger.debug('Schema already compiled in Ajv', { schemaId, version, schemaKey });
        // Use existing compiled schema
        const validator = this.ajv.getSchema(schemaKey)!;

        const category = schemaId.split('/')[0] as IntegrationCategory;
        const metadata: SchemaMetadata = {
          id: schemaId,
          version,
          category,
          description: schema.description,
          validator,
        };

        this.schemaCache.set(cacheKey, metadata);
        return;
      }

      // Compile schema with Ajv
      const validator = this.ajv.compile(schema);

      // Extract category from schemaId
      const category = schemaId.split('/')[0] as IntegrationCategory;

      const metadata: SchemaMetadata = {
        id: schemaId,
        version,
        category,
        description: schema.description,
        validator,
      };

      // Cache with version
      this.schemaCache.set(cacheKey, metadata);

      logger.debug('Schema loaded', { schemaId, version, filePath });
    } catch (error) {
      logger.error(`Failed to load schema file: ${filePath}`, error as Error, {
        schemaId,
        version,
      });
      throw error;
    }
  }

  private async loadSchema(schemaId: string, version?: string): Promise<SchemaMetadata> {
    const category = schemaId.split('/')[0] as IntegrationCategory;
    const schemaName = schemaId.split('/').slice(1).join('/');

    // Determine file path
    const categoryPath = path.join(this.config.schemaPath, category);
    const schemaPath = path.join(categoryPath, schemaName);

    // Try versioned schema directory
    try {
      const versionedFile = version
        ? `v${version}${this.config.schemaExtension}`
        : `v1.0.0${this.config.schemaExtension}`;

      const filePath = path.join(schemaPath, versionedFile);
      await fs.access(filePath);

      const actualVersion = version || '1.0.0';
      await this.loadSchemaFile(schemaId, filePath, actualVersion);

      return this.schemaCache.get(`${schemaId}@${actualVersion}`)!;
    } catch {
      // Try direct schema file
      const directFile = path.join(categoryPath, `${schemaName}${this.config.schemaExtension}`);

      try {
        await fs.access(directFile);

        const actualVersion = version || '1.0.0';
        await this.loadSchemaFile(schemaId, directFile, actualVersion);

        return this.schemaCache.get(`${schemaId}@${actualVersion}`)!;
      } catch (error) {
        throw new StandardError(
          ErrorCode.FILE_NOT_FOUND,
          `Schema not found: ${schemaId}${version ? `@${version}` : ''}`,
          { schemaId, version, searchPaths: [schemaPath, directFile] },
          error as Error
        );
      }
    }
  }

  private formatErrors(errors: ErrorObject[]): ValidationError[] {
    return errors.map((error) => ({
      path: error.instancePath || error.schemaPath,
      message: error.message || 'Validation failed',
      keyword: error.keyword,
      params: error.params,
    }));
  }

  private generateSuggestions(errors: ValidationError[], data: any): string[] {
    const suggestions: string[] = [];

    for (const error of errors) {
      if (error.keyword === 'required' && error.params?.missingProperty) {
        const missing = error.params.missingProperty;
        suggestions.push(missing);

        // Check for typos in data keys
        const dataKeys = Object.keys(data);
        const similar = dataKeys.filter(
          (key) => this.levenshteinDistance(key, missing) <= 2
        );

        if (similar.length > 0) {
          suggestions.push(`Did you mean: ${similar.join(', ')}?`);
        }
      }
    }

    return [...new Set(suggestions)]; // Deduplicate
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}
