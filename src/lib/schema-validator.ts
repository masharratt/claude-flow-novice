/**
 * Schema Validator Library
 *
 * Provides consistency checks, drift detection, and data loss verification
 * for SQLite ↔ Redis schema transformations.
 *
 * Task: Integration Standardization Plan - Task 2.2
 * Version: 1.0.0
 */

import { getGlobalLogger } from './logging.js';
import { StandardError } from './errors.js';

const logger = getGlobalLogger();
import {
  SchemaName,
  SQLiteRow,
  RedisData,
  sqliteToRedis,
  redisToSqlite,
  postgrestoSqlite,
  TransformDirection,
  SCHEMA_MAPPINGS,
} from './schema-transform.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  timestamp: Date;
  schema?: SchemaName;
  details?: Record<string, any>;
}

export interface DriftReport {
  schema: SchemaName;
  driftDetected: boolean;
  mismatches: FieldMismatch[];
  missingInSqlite: string[];
  missingInRedis: string[];
  typeMismatches: TypeMismatch[];
  timestamp: Date;
  affectedRecords?: number;
}

export interface FieldMismatch {
  field: string;
  sqliteValue: any;
  redisValue: any;
  difference: string;
}

export interface TypeMismatch {
  field: string;
  expectedType: string;
  actualType: string;
  location: 'sqlite' | 'redis';
}

export interface DataLossCheck {
  lossDetected: boolean;
  lostFields: string[];
  modifiedFields: FieldModification[];
  nullifications: string[];
  details: string;
}

export interface FieldModification {
  field: string;
  originalValue: any;
  transformedValue: any;
  reason: string;
}

// ============================================================================
// Consistency Validation
// ============================================================================

/**
 * Validate consistency between SQLite and Redis data
 *
 * Compares data from both sources and reports mismatches
 */
export function validateConsistency(
  schema: SchemaName,
  sqliteData: SQLiteRow,
  redisData: RedisData
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Get schema mapping
    const mapping = SCHEMA_MAPPINGS[schema];
    if (!mapping) {
      return {
        valid: false,
        errors: [`Unknown schema: ${schema}`],
        warnings: [],
        timestamp: new Date(),
      };
    }

    // Transform SQLite data to Redis format for comparison
    const transformResult = sqliteToRedis(schema, sqliteData);
    if (!transformResult.success) {
      errors.push(`Failed to transform SQLite data: ${transformResult.errors?.join(', ')}`);
    }

    const transformedData = transformResult.data;
    if (!transformedData) {
      return {
        valid: false,
        errors: ['Transformation produced no data'],
        warnings: transformResult.warnings || [],
        timestamp: new Date(),
        schema,
      };
    }

    // Compare each field
    for (const field of mapping.fields) {
      const redisField = field.destination;
      const expectedValue = transformedData[redisField];
      const actualValue = redisData[redisField];

      // Skip if both are null/undefined
      if ((expectedValue === null || expectedValue === undefined) &&
          (actualValue === null || actualValue === undefined)) {
        continue;
      }

      // Check for missing fields
      if (expectedValue !== null && expectedValue !== undefined &&
          (actualValue === null || actualValue === undefined)) {
        if (field.required) {
          errors.push(`Required field '${redisField}' is missing in Redis data`);
        } else {
          warnings.push(`Optional field '${redisField}' is missing in Redis data`);
        }
        continue;
      }

      // Compare values (handle type coercion for numbers/strings)
      if (!valuesEqual(expectedValue, actualValue)) {
        const diff = `expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`;

        if (field.required) {
          errors.push(`Mismatch on field '${redisField}': ${diff}`);
        } else {
          warnings.push(`Mismatch on optional field '${redisField}': ${diff}`);
        }
      }
    }

    // Check for extra fields in Redis (not in mapping)
    for (const key in redisData) {
      const hasField = mapping.fields.some(f => f.destination === key);
      if (!hasField) {
        warnings.push(`Unexpected field '${key}' in Redis data`);
      }
    }

    const valid = errors.length === 0;

    logger.debug('Consistency validation completed', {
      schema,
      valid,
      errorCount: errors.length,
      warningCount: warnings.length,
    });

    return {
      valid,
      errors,
      warnings,
      timestamp: new Date(),
      schema,
      details: {
        fieldsCompared: mapping.fields.length,
        mismatches: errors.length + warnings.length,
      },
    };
  } catch (err) {
    logger.error('Consistency validation failed', err as Error, { schema });
    return {
      valid: false,
      errors: [`Validation error: ${(err as Error).message}`],
      warnings: [],
      timestamp: new Date(),
      schema,
    };
  }
}

/**
 * Compare two values with type coercion handling
 */
function valuesEqual(a: any, b: any): boolean {
  // Exact match
  if (a === b) return true;

  // Null/undefined equivalence
  if ((a === null || a === undefined) && (b === null || b === undefined)) {
    return true;
  }

  // Number/string coercion
  if (typeof a === 'number' && typeof b === 'string') {
    return a.toString() === b;
  }
  if (typeof a === 'string' && typeof b === 'number') {
    return a === b.toString();
  }

  // Deep equality for objects
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return false;
}

// ============================================================================
// Schema Drift Detection
// ============================================================================

/**
 * Detect schema drift between SQLite and Redis data sets
 *
 * Analyzes multiple records to find structural inconsistencies
 */
export async function detectDrift(
  schema: SchemaName,
  sqliteRecords: SQLiteRow[],
  redisRecords: RedisData[]
): Promise<DriftReport> {
  const mismatches: FieldMismatch[] = [];
  const missingInSqlite: Set<string> = new Set();
  const missingInRedis: Set<string> = new Set();
  const typeMismatches: TypeMismatch[] = [];

  try {
    // Get schema mapping
    const mapping = SCHEMA_MAPPINGS[schema];
    if (!mapping) {
      throw new StandardError(`Unknown schema: ${schema}`, 'SCHEMA_VALIDATION_ERROR');
    }

    // Analyze SQLite records
    const sqliteFields = new Set<string>();
    for (const record of sqliteRecords) {
      for (const key in record) {
        sqliteFields.add(key);
      }
    }

    // Analyze Redis records
    const redisFields = new Set<string>();
    for (const record of redisRecords) {
      for (const key in record) {
        redisFields.add(key);
      }
    }

    // Find missing fields in SQLite
    for (const field of mapping.fields) {
      if (!sqliteFields.has(field.source)) {
        missingInSqlite.add(field.source);
      }
    }

    // Find missing fields in Redis
    for (const field of mapping.fields) {
      if (!redisFields.has(field.destination)) {
        missingInRedis.add(field.destination);
      }
    }

    // Compare sample records for value drift
    const sampleSize = Math.min(sqliteRecords.length, redisRecords.length, 100);
    for (let i = 0; i < sampleSize; i++) {
      const sqliteRow = sqliteRecords[i];
      const redisRow = redisRecords[i];

      // Transform SQLite to Redis for comparison
      const transformResult = sqliteToRedis(schema, sqliteRow);
      if (!transformResult.success || !transformResult.data) {
        continue;
      }

      const transformed = transformResult.data;

      // Compare fields
      for (const field of mapping.fields) {
        const redisField = field.destination;
        const expected = transformed[redisField];
        const actual = redisRow[redisField];

        if (!valuesEqual(expected, actual)) {
          mismatches.push({
            field: redisField,
            sqliteValue: expected,
            redisValue: actual,
            difference: `SQLite: ${JSON.stringify(expected)}, Redis: ${JSON.stringify(actual)}`,
          });
        }

        // Check type consistency
        if (expected !== null && actual !== null) {
          const expectedType = typeof expected;
          const actualType = typeof actual;
          if (expectedType !== actualType) {
            typeMismatches.push({
              field: redisField,
              expectedType,
              actualType,
              location: 'redis',
            });
          }
        }
      }
    }

    const driftDetected = mismatches.length > 0 ||
                          missingInSqlite.size > 0 ||
                          missingInRedis.size > 0 ||
                          typeMismatches.length > 0;

    logger.info('Schema drift detection completed', {
      schema,
      driftDetected,
      mismatches: mismatches.length,
      missingInSqlite: missingInSqlite.size,
      missingInRedis: missingInRedis.size,
      typeMismatches: typeMismatches.length,
    });

    return {
      schema,
      driftDetected,
      mismatches: mismatches.slice(0, 50), // Limit to first 50
      missingInSqlite: Array.from(missingInSqlite),
      missingInRedis: Array.from(missingInRedis),
      typeMismatches,
      timestamp: new Date(),
      affectedRecords: sampleSize,
    };
  } catch (err) {
    logger.error('Schema drift detection failed', err as Error, { schema });
    throw new StandardError(`Drift detection failed: ${(err as Error).message}`, 'SCHEMA_VALIDATION_ERROR');
  }
}

// ============================================================================
// Data Loss Verification
// ============================================================================

/**
 * Verify no data loss during transformation
 *
 * Performs round-trip transformation and compares with original
 */
export function verifyNoDataLoss(
  schema: SchemaName,
  original: any,
  direction: TransformDirection
): DataLossCheck {
  const lostFields: string[] = [];
  const modifiedFields: FieldModification[] = [];
  const nullifications: string[] = [];

  try {
    let roundTrip: any;

    // Perform round-trip transformation
    if (direction === 'sqlite-to-redis') {
      const toRedis = sqliteToRedis(schema, original);
      if (!toRedis.success || !toRedis.data) {
        return {
          lossDetected: true,
          lostFields: ['ALL'],
          modifiedFields: [],
          nullifications: [],
          details: `Forward transformation failed: ${toRedis.errors?.join(', ')}`,
        };
      }

      const backToSqlite = redisToSqlite(schema, toRedis.data);
      if (!backToSqlite.success || !backToSqlite.data) {
        return {
          lossDetected: true,
          lostFields: ['ALL'],
          modifiedFields: [],
          nullifications: [],
          details: `Reverse transformation failed: ${backToSqlite.errors?.join(', ')}`,
        };
      }

      roundTrip = backToSqlite.data;
    } else if (direction === 'redis-to-sqlite') {
      const toSqlite = redisToSqlite(schema, original);
      if (!toSqlite.success || !toSqlite.data) {
        return {
          lossDetected: true,
          lostFields: ['ALL'],
          modifiedFields: [],
          nullifications: [],
          details: `Forward transformation failed: ${toSqlite.errors?.join(', ')}`,
        };
      }

      const backToRedis = sqliteToRedis(schema, toSqlite.data);
      if (!backToRedis.success || !backToRedis.data) {
        return {
          lossDetected: true,
          lostFields: ['ALL'],
          modifiedFields: [],
          nullifications: [],
          details: `Reverse transformation failed: ${backToRedis.errors?.join(', ')}`,
        };
      }

      roundTrip = backToRedis.data;
    } else if (direction === 'postgres-to-sqlite') {
      // One-way transform - cannot perform round-trip
      return {
        lossDetected: false,
        lostFields: [],
        modifiedFields: [],
        nullifications: [],
        details: 'PostgreSQL → SQLite is one-way; round-trip verification not applicable',
      };
    } else {
      throw new StandardError(`Unknown direction: ${direction}`, 'SCHEMA_VALIDATION_ERROR');
    }

    // Compare original with round-trip result
    for (const key in original) {
      const originalValue = original[key];
      const roundTripValue = roundTrip[key];

      // Check for lost fields
      if (originalValue !== null && originalValue !== undefined &&
          (roundTripValue === null || roundTripValue === undefined)) {
        lostFields.push(key);
        continue;
      }

      // Check for nullifications
      if (originalValue !== null && roundTripValue === null) {
        nullifications.push(key);
        continue;
      }

      // Check for modifications (with tolerance for type coercion)
      if (!valuesEqual(originalValue, roundTripValue)) {
        modifiedFields.push({
          field: key,
          originalValue,
          transformedValue: roundTripValue,
          reason: detectModificationReason(originalValue, roundTripValue),
        });
      }
    }

    const lossDetected = lostFields.length > 0 || nullifications.length > 0 || modifiedFields.length > 0;

    logger.debug('Data loss verification completed', {
      schema,
      direction,
      lossDetected,
      lostFields: lostFields.length,
      nullifications: nullifications.length,
      modifications: modifiedFields.length,
    });

    return {
      lossDetected,
      lostFields,
      modifiedFields,
      nullifications,
      details: lossDetected
        ? `Lost: ${lostFields.length}, Nullified: ${nullifications.length}, Modified: ${modifiedFields.length}`
        : 'No data loss detected',
    };
  } catch (err) {
    logger.error('Data loss verification failed', err as Error, { schema, direction });
    return {
      lossDetected: true,
      lostFields: ['UNKNOWN'],
      modifiedFields: [],
      nullifications: [],
      details: `Verification error: ${(err as Error).message}`,
    };
  }
}

/**
 * Detect reason for field modification
 */
function detectModificationReason(original: any, transformed: any): string {
  const origType = typeof original;
  const transType = typeof transformed;

  if (origType !== transType) {
    return `Type conversion: ${origType} → ${transType}`;
  }

  if (origType === 'number') {
    const diff = Math.abs(original - transformed);
    if (diff < 0.000001) {
      return 'Floating point precision loss';
    }
    return `Value change: ${original} → ${transformed}`;
  }

  if (origType === 'string') {
    if (original.length !== transformed.length) {
      return `String length change: ${original.length} → ${transformed.length}`;
    }
    return 'String content modification';
  }

  return 'Unknown modification';
}

// ============================================================================
// Batch Validation
// ============================================================================

/**
 * Validate batch of records for consistency
 */
export function validateBatch(
  schema: SchemaName,
  sqliteRecords: SQLiteRow[],
  redisRecords: RedisData[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (sqliteRecords.length !== redisRecords.length) {
    warnings.push(`Record count mismatch: SQLite has ${sqliteRecords.length}, Redis has ${redisRecords.length}`);
  }

  const count = Math.min(sqliteRecords.length, redisRecords.length);
  let validCount = 0;

  for (let i = 0; i < count; i++) {
    const result = validateConsistency(schema, sqliteRecords[i], redisRecords[i]);

    if (result.valid) {
      validCount++;
    } else {
      errors.push(`Record ${i}: ${result.errors.join(', ')}`);
    }

    if (result.warnings.length > 0) {
      warnings.push(`Record ${i}: ${result.warnings.join(', ')}`);
    }
  }

  const valid = errors.length === 0;

  logger.info('Batch validation completed', {
    schema,
    total: count,
    valid: validCount,
    invalid: count - validCount,
    warnings: warnings.length,
  });

  return {
    valid,
    errors,
    warnings,
    timestamp: new Date(),
    schema,
    details: {
      total: count,
      valid: validCount,
      invalid: count - validCount,
    },
  };
}

/**
 * Verify no data loss for batch of records
 */
export function verifyBatchNoDataLoss(
  schema: SchemaName,
  records: any[],
  direction: TransformDirection
): DataLossCheck {
  const allLostFields: Set<string> = new Set();
  const allModifiedFields: FieldModification[] = [];
  const allNullifications: Set<string> = new Set();
  let lossDetected = false;

  for (let i = 0; i < records.length; i++) {
    const check = verifyNoDataLoss(schema, records[i], direction);

    if (check.lossDetected) {
      lossDetected = true;
    }

    check.lostFields.forEach(f => allLostFields.add(f));
    check.nullifications.forEach(f => allNullifications.add(f));
    allModifiedFields.push(...check.modifiedFields.map(m => ({
      ...m,
      field: `Record ${i}.${m.field}`,
    })));
  }

  logger.info('Batch data loss verification completed', {
    schema,
    direction,
    total: records.length,
    lossDetected,
    lostFields: allLostFields.size,
    nullifications: allNullifications.size,
    modifications: allModifiedFields.length,
  });

  return {
    lossDetected,
    lostFields: Array.from(allLostFields),
    modifiedFields: allModifiedFields.slice(0, 100), // Limit to first 100
    nullifications: Array.from(allNullifications),
    details: `Validated ${records.length} records`,
  };
}
