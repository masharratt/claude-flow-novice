/**
 * Schema Transform Library
 *
 * Provides bidirectional transformations between SQLite and Redis schemas.
 * Ensures data consistency and prevents data loss during transformations.
 *
 * Task: Integration Standardization Plan - Task 2.2
 * Version: 1.0.0
 */

import { getGlobalLogger } from './logging.js';
import { StandardError } from './errors.js';

const logger = getGlobalLogger();

// ============================================================================
// Type Definitions
// ============================================================================

export type TransformDirection = 'sqlite-to-redis' | 'redis-to-sqlite' | 'postgres-to-sqlite';

export type SchemaName = 'agent_executions' | 'skill_executions' | 'artifacts' | 'coordination_events';

export interface SQLiteRow {
  [key: string]: string | number | null;
}

export interface RedisData {
  [key: string]: string | number;
}

export interface PostgresRow {
  [key: string]: any;
}

export interface TransformResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
}

export interface SchemaMapping {
  version: string;
  schema: SchemaName;
  fields: FieldMapping[];
  primaryKey: string;
  ttl?: number;
}

export interface FieldMapping {
  source: string;
  destination: string;
  sourceType: string;
  destinationType: string;
  transform: ((val: any) => any) | null;
  required: boolean;
  defaultValue?: any;
}

// ============================================================================
// Type Converters
// ============================================================================

export const TYPE_CONVERTERS = {
  /**
   * DECIMAL to REAL (PostgreSQL → SQLite)
   */
  'DECIMAL_TO_REAL': (val: string | number | null): number | null => {
    if (val === null || val === undefined) return null;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? null : num;
  },

  /**
   * INTEGER conversion (handles string/number inputs)
   */
  'INTEGER': (val: number | string | null): number | null => {
    if (val === null || val === undefined) return null;
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    return isNaN(num) ? null : num;
  },

  /**
   * REAL conversion (handles string/number inputs)
   */
  'REAL': (val: number | string | null): number | null => {
    if (val === null || val === undefined) return null;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? null : num;
  },

  /**
   * Number to string (for Redis storage)
   */
  'NUMBER_TO_STRING': (val: number | null): string | null => {
    if (val === null || val === undefined) return null;
    if (isNaN(val)) return null;
    return val.toString();
  },

  /**
   * String to number (from Redis)
   */
  'STRING_TO_NUMBER': (val: string | null): number | null => {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  },

  /**
   * ENUM to TEXT (PostgreSQL → SQLite)
   */
  'ENUM_TO_TEXT': (val: string | null): string | null => {
    if (val === null || val === undefined) return null;
    return val.toString();
  },

  /**
   * DATETIME string to Unix timestamp (SQLite → Redis)
   */
  'DATETIME_TO_TIMESTAMP': (val: string | null): number | null => {
    if (val === null || val === undefined) return null;
    const timestamp = new Date(val).getTime();
    return isNaN(timestamp) ? null : timestamp;
  },

  /**
   * Unix timestamp to DATETIME string (Redis → SQLite)
   */
  'TIMESTAMP_TO_DATETIME': (val: number | string | null): string | null => {
    if (val === null || val === undefined) return null;
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num)) return null;
    return new Date(num).toISOString();
  },

  /**
   * PostgreSQL TIMESTAMP to SQLite DATETIME
   */
  'TIMESTAMP_TO_ISO': (val: Date | string | number | null): string | null => {
    if (val === null || val === undefined) return null;
    try {
      if (val instanceof Date) return val.toISOString();
      if (typeof val === 'number') return new Date(val * 1000).toISOString();
      return new Date(val).toISOString();
    } catch {
      return null;
    }
  },

  /**
   * Parse JSON string to object
   */
  'TEXT_TO_JSON': (val: string | null): any => {
    if (val === null || val === undefined || val === '') return null;
    try {
      return JSON.parse(val);
    } catch (err) {
      logger.warn('Failed to parse JSON', { value: val, error: (err as Error).message });
      return null;
    }
  },

  /**
   * Stringify object to JSON
   */
  'JSON_TO_TEXT': (val: any): string | null => {
    if (val === null || val === undefined) return null;
    try {
      return JSON.stringify(val);
    } catch (err) {
      logger.warn('Failed to stringify JSON', { value: val, error: (err as Error).message });
      return null;
    }
  },

  /**
   * Boolean to INTEGER (0/1 for SQLite)
   */
  'BOOLEAN_TO_INTEGER': (val: boolean | number | null): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val === 1 ? 1 : 0;
    return val ? 1 : 0;
  },

  /**
   * INTEGER to Boolean (SQLite → JavaScript)
   */
  'INTEGER_TO_BOOLEAN': (val: number | string | null): boolean | null => {
    if (val === null || val === undefined) return null;
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    return num === 1;
  },

  /**
   * Identity transform (no conversion needed)
   */
  'IDENTITY': (val: any): any => val,
};

// ============================================================================
// Schema Mappings
// ============================================================================

export const SCHEMA_MAPPINGS: Record<SchemaName, SchemaMapping> = {
  /**
   * Agent Executions: Redis ↔ SQLite
   */
  agent_executions: {
    version: '1.0.0',
    schema: 'agent_executions',
    primaryKey: 'agent_id',
    ttl: 86400, // 24 hours in Redis
    fields: [
      {
        source: 'id',
        destination: 'agent_id',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: true,
      },
      {
        source: 'agent_id',
        destination: 'agent_id',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: true,
      },
      {
        source: 'task_id',
        destination: 'task_id',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: true,
      },
      {
        source: 'type',
        destination: 'type',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: true,
      },
      {
        source: 'status',
        destination: 'status',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: true,
      },
      {
        source: 'confidence',
        destination: 'confidence',
        sourceType: 'REAL',
        destinationType: 'string',
        transform: null, // Direction-specific
        required: false,
      },
      {
        source: 'spawned_at',
        destination: 'spawned_at',
        sourceType: 'DATETIME',
        destinationType: 'number',
        transform: null, // Direction-specific
        required: true,
      },
      {
        source: 'completed_at',
        destination: 'completed_at',
        sourceType: 'DATETIME',
        destinationType: 'number',
        transform: null, // Direction-specific
        required: false,
      },
      {
        source: 'metadata',
        destination: 'metadata',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: false,
      },
    ],
  },

  /**
   * Skill Executions: PostgreSQL → SQLite (one-way)
   */
  skill_executions: {
    version: '1.0.0',
    schema: 'skill_executions',
    primaryKey: 'id',
    fields: [
      {
        source: 'id',
        destination: 'id',
        sourceType: 'SERIAL',
        destinationType: 'INTEGER',
        transform: TYPE_CONVERTERS.INTEGER,
        required: true,
      },
      {
        source: 'skill_id',
        destination: 'skill_id',
        sourceType: 'INTEGER',
        destinationType: 'INTEGER',
        transform: TYPE_CONVERTERS.INTEGER,
        required: true,
      },
      {
        source: 'execution_time_ms',
        destination: 'execution_time_ms',
        sourceType: 'INTEGER',
        destinationType: 'INTEGER',
        transform: TYPE_CONVERTERS.INTEGER,
        required: true,
      },
      {
        source: 'cost_usd',
        destination: 'cost_usd',
        sourceType: 'DECIMAL',
        destinationType: 'REAL',
        transform: TYPE_CONVERTERS.DECIMAL_TO_REAL,
        required: false,
      },
      {
        source: 'tokens_avoided',
        destination: 'tokens_avoided',
        sourceType: 'INTEGER',
        destinationType: 'INTEGER',
        transform: TYPE_CONVERTERS.INTEGER,
        required: false,
      },
      {
        source: 'status',
        destination: 'status',
        sourceType: 'ENUM',
        destinationType: 'TEXT',
        transform: TYPE_CONVERTERS.ENUM_TO_TEXT,
        required: true,
      },
      {
        source: 'executed_at',
        destination: 'executed_at',
        sourceType: 'TIMESTAMP',
        destinationType: 'DATETIME',
        transform: TYPE_CONVERTERS.TIMESTAMP_TO_ISO,
        required: true,
      },
      {
        source: 'metadata',
        destination: 'metadata',
        sourceType: 'JSONB',
        destinationType: 'TEXT',
        transform: TYPE_CONVERTERS.JSON_TO_TEXT,
        required: false,
      },
    ],
  },

  /**
   * Artifacts: SQLite ↔ Redis (cache layer)
   */
  artifacts: {
    version: '1.0.0',
    schema: 'artifacts',
    primaryKey: 'id',
    ttl: 2592000, // 30 days in Redis cache
    fields: [
      {
        source: 'id',
        destination: 'artifact_id',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: true,
      },
      {
        source: 'name',
        destination: 'name',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: true,
      },
      {
        source: 'type',
        destination: 'type',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: true,
      },
      {
        source: 'content',
        destination: 'content',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: false,
      },
      {
        source: 'content_hash',
        destination: 'content_hash',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: false,
      },
      {
        source: 'size_bytes',
        destination: 'size_bytes',
        sourceType: 'INTEGER',
        destinationType: 'string',
        transform: null, // Direction-specific
        required: false,
      },
      {
        source: 'metadata',
        destination: 'metadata',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: false,
      },
      {
        source: 'created_at',
        destination: 'created_at',
        sourceType: 'DATETIME',
        destinationType: 'number',
        transform: null, // Direction-specific
        required: true,
      },
      {
        source: 'expires_at',
        destination: 'expires_at',
        sourceType: 'DATETIME',
        destinationType: 'number',
        transform: null, // Direction-specific
        required: false,
      },
      {
        source: 'status',
        destination: 'status',
        sourceType: 'TEXT',
        destinationType: 'string',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: true,
      },
    ],
  },

  /**
   * Coordination Events: Redis → SQLite (archival)
   */
  coordination_events: {
    version: '1.0.0',
    schema: 'coordination_events',
    primaryKey: 'event_id',
    ttl: 3600, // 1 hour in Redis
    fields: [
      {
        source: 'event_id',
        destination: 'id',
        sourceType: 'string',
        destinationType: 'TEXT',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: true,
      },
      {
        source: 'task_id',
        destination: 'task_id',
        sourceType: 'string',
        destinationType: 'TEXT',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: true,
      },
      {
        source: 'agent_id',
        destination: 'agent_id',
        sourceType: 'string',
        destinationType: 'TEXT',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: false,
      },
      {
        source: 'event_type',
        destination: 'event_type',
        sourceType: 'string',
        destinationType: 'TEXT',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: true,
      },
      {
        source: 'timestamp',
        destination: 'timestamp',
        sourceType: 'number',
        destinationType: 'DATETIME',
        transform: null, // Direction-specific
        required: true,
      },
      {
        source: 'payload',
        destination: 'payload',
        sourceType: 'string',
        destinationType: 'TEXT',
        transform: TYPE_CONVERTERS.IDENTITY,
        required: false,
      },
    ],
  },
};

// ============================================================================
// Transform Functions
// ============================================================================

/**
 * Transform SQLite row to Redis data
 */
export function sqliteToRedis(schema: SchemaName, row: SQLiteRow): TransformResult<RedisData> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const result: RedisData = {};

  const mapping = SCHEMA_MAPPINGS[schema];
  if (!mapping) {
    throw new StandardError(`Unknown schema: ${schema}`, 'SCHEMA_TRANSFORM_ERROR');
  }

  for (const field of mapping.fields) {
    const value = row[field.source];

    // Handle required fields
    if (field.required && (value === null || value === undefined)) {
      errors.push(`Required field '${field.source}' is missing`);
      continue;
    }

    // Skip null/undefined for optional fields
    if (value === null || value === undefined) {
      continue;
    }

    // Apply transformation
    let transformed: any;
    if (field.transform) {
      transformed = field.transform(value);
    } else {
      // Direction-specific transforms
      if (field.sourceType === 'REAL' && field.destinationType === 'string') {
        transformed = TYPE_CONVERTERS.NUMBER_TO_STRING(value as number);
      } else if (field.sourceType === 'INTEGER' && field.destinationType === 'string') {
        transformed = TYPE_CONVERTERS.NUMBER_TO_STRING(value as number);
      } else if (field.sourceType === 'DATETIME' && field.destinationType === 'number') {
        transformed = TYPE_CONVERTERS.DATETIME_TO_TIMESTAMP(value as string);
      } else {
        transformed = value;
      }
    }

    // Validate transformation
    if (transformed === null && field.required) {
      warnings.push(`Transformation of required field '${field.source}' resulted in null`);
    }

    // Only add non-null values to Redis (Redis doesn't have NULL)
    if (transformed !== null) {
      result[field.destination] = transformed;
    }
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings };
  }

  logger.debug('SQLite → Redis transformation completed', {
    schema,
    fieldCount: Object.keys(result).length,
    warnings: warnings.length
  });

  return { success: true, data: result, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Transform Redis data to SQLite row
 */
export function redisToSqlite(schema: SchemaName, data: RedisData): TransformResult<SQLiteRow> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const result: SQLiteRow = {};

  const mapping = SCHEMA_MAPPINGS[schema];
  if (!mapping) {
    throw new StandardError(`Unknown schema: ${schema}`, 'SCHEMA_TRANSFORM_ERROR');
  }

  for (const field of mapping.fields) {
    const value = data[field.destination];

    // Handle required fields
    if (field.required && (value === null || value === undefined)) {
      errors.push(`Required field '${field.destination}' is missing`);
      continue;
    }

    // Set null for missing optional fields
    if (value === null || value === undefined) {
      result[field.source] = null;
      continue;
    }

    // Apply transformation
    let transformed: any;
    if (field.transform) {
      transformed = field.transform(value);
    } else {
      // Direction-specific transforms
      if (field.destinationType === 'string' && field.sourceType === 'REAL') {
        transformed = TYPE_CONVERTERS.STRING_TO_NUMBER(value as string);
      } else if (field.destinationType === 'string' && field.sourceType === 'INTEGER') {
        transformed = TYPE_CONVERTERS.STRING_TO_NUMBER(value as string);
      } else if (field.destinationType === 'number' && field.sourceType === 'DATETIME') {
        transformed = TYPE_CONVERTERS.TIMESTAMP_TO_DATETIME(value as number);
      } else {
        transformed = value;
      }
    }

    // Validate transformation
    if (transformed === null && field.required) {
      warnings.push(`Transformation of required field '${field.destination}' resulted in null`);
    }

    result[field.source] = transformed;
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings };
  }

  logger.debug('Redis → SQLite transformation completed', {
    schema,
    fieldCount: Object.keys(result).length,
    warnings: warnings.length
  });

  return { success: true, data: result, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Transform PostgreSQL row to SQLite row (one-way)
 */
export function postgrestoSqlite(schema: SchemaName, row: PostgresRow): TransformResult<SQLiteRow> {
  if (schema !== 'skill_executions') {
    throw new StandardError(`PostgreSQL → SQLite transform only supports 'skill_executions', got: ${schema}`, 'SCHEMA_TRANSFORM_ERROR');
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const result: SQLiteRow = {};

  const mapping = SCHEMA_MAPPINGS[schema];

  for (const field of mapping.fields) {
    const value = row[field.source];

    // Handle required fields
    if (field.required && (value === null || value === undefined)) {
      errors.push(`Required field '${field.source}' is missing`);
      continue;
    }

    // Set null for missing optional fields
    if (value === null || value === undefined) {
      result[field.destination] = null;
      continue;
    }

    // Apply transformation
    const transformed = field.transform ? field.transform(value) : value;

    // Validate transformation
    if (transformed === null && field.required) {
      warnings.push(`Transformation of required field '${field.source}' resulted in null`);
    }

    result[field.destination] = transformed;
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings };
  }

  logger.debug('PostgreSQL → SQLite transformation completed', {
    schema,
    fieldCount: Object.keys(result).length,
    warnings: warnings.length
  });

  return { success: true, data: result, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Transform batch of records
 */
export function transformBatch(
  schema: SchemaName,
  data: any[],
  direction: TransformDirection
): TransformResult<any[]> {
  const results: any[] = [];
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    let transformResult: TransformResult<any>;

    try {
      switch (direction) {
        case 'sqlite-to-redis':
          transformResult = sqliteToRedis(schema, item);
          break;
        case 'redis-to-sqlite':
          transformResult = redisToSqlite(schema, item);
          break;
        case 'postgres-to-sqlite':
          transformResult = postgrestoSqlite(schema, item);
          break;
        default:
          throw new StandardError(`Unknown transform direction: ${direction}`, 'SCHEMA_TRANSFORM_ERROR');
      }

      if (transformResult.success && transformResult.data) {
        results.push(transformResult.data);
      } else {
        allErrors.push(`Record ${i}: ${transformResult.errors?.join(', ')}`);
      }

      if (transformResult.warnings) {
        allWarnings.push(...transformResult.warnings.map(w => `Record ${i}: ${w}`));
      }
    } catch (err) {
      allErrors.push(`Record ${i}: ${(err as Error).message}`);
    }
  }

  logger.info('Batch transformation completed', {
    schema,
    direction,
    total: data.length,
    succeeded: results.length,
    failed: allErrors.length,
    warnings: allWarnings.length,
  });

  if (allErrors.length > 0) {
    return {
      success: false,
      data: results,
      errors: allErrors,
      warnings: allWarnings.length > 0 ? allWarnings : undefined
    };
  }

  return {
    success: true,
    data: results,
    warnings: allWarnings.length > 0 ? allWarnings : undefined
  };
}

/**
 * Get schema mapping for a given schema
 */
export function getSchemaMapping(schema: SchemaName): SchemaMapping {
  const mapping = SCHEMA_MAPPINGS[schema];
  if (!mapping) {
    throw new StandardError(`Unknown schema: ${schema}`, 'SCHEMA_TRANSFORM_ERROR');
  }
  return mapping;
}

/**
 * Check if transformation is supported
 */
export function isTransformSupported(schema: SchemaName, direction: TransformDirection): boolean {
  if (!SCHEMA_MAPPINGS[schema]) {
    return false;
  }

  // skill_executions only supports postgres-to-sqlite
  if (schema === 'skill_executions') {
    return direction === 'postgres-to-sqlite';
  }

  // Other schemas support bidirectional
  return direction === 'sqlite-to-redis' || direction === 'redis-to-sqlite';
}
