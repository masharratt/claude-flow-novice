/**
 * Schema Transform and Validation Test Suite
 *
 * Comprehensive tests for SQLite ↔ Redis schema transformations,
 * consistency validation, drift detection, and data loss verification.
 *
 * Task: Integration Standardization Plan - Task 2.2
 * Version: 1.0.0
 *
 * Coverage Target: ≥100% (deterministic transforms)
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  sqliteToRedis,
  redisToSqlite,
  postgrestoSqlite,
  transformBatch,
  TYPE_CONVERTERS,
  SCHEMA_MAPPINGS,
  getSchemaMapping,
  isTransformSupported,
  SchemaName,
  SQLiteRow,
  RedisData,
  TransformDirection,
} from '../src/lib/schema-transform.js';

import {
  validateConsistency,
  detectDrift,
  verifyNoDataLoss,
  validateBatch,
  verifyBatchNoDataLoss,
} from '../src/lib/schema-validator.js';

// ============================================================================
// Test Data Fixtures
// ============================================================================

const AGENT_EXECUTION_SQLITE: SQLiteRow = {
  id: 'agent-123',
  agent_id: 'agent-123',
  task_id: 'task-456',
  type: 'backend-developer',
  status: 'completed',
  confidence: 0.92,
  spawned_at: '2025-11-16T00:00:00.000Z',
  completed_at: '2025-11-16T00:05:00.000Z',
  metadata: '{"retries":0,"cost":0.05}',
};

const AGENT_EXECUTION_REDIS: RedisData = {
  agent_id: 'agent-123',
  task_id: 'task-456',
  type: 'backend-developer',
  status: 'completed',
  confidence: '0.92',
  spawned_at: 1731715200000,
  completed_at: 1731715500000,
  metadata: '{"retries":0,"cost":0.05}',
};

const SKILL_EXECUTION_POSTGRES = {
  id: 1,
  skill_id: 42,
  execution_time_ms: 1250,
  cost_usd: '0.003500',
  tokens_avoided: 5000,
  status: 'success',
  executed_at: new Date('2025-11-16T00:00:00.000Z'),
  metadata: { tool: 'grep', pattern: '*.ts' },
};

const SKILL_EXECUTION_SQLITE: SQLiteRow = {
  id: 1,
  skill_id: 42,
  execution_time_ms: 1250,
  cost_usd: 0.0035,
  tokens_avoided: 5000,
  status: 'success',
  executed_at: '2025-11-16T00:00:00.000Z',
  metadata: '{"tool":"grep","pattern":"*.ts"}',
};

const ARTIFACT_SQLITE: SQLiteRow = {
  id: 'artifact-789',
  name: 'test-report.json',
  type: 'report',
  content: '{"tests":100,"passed":98}',
  content_hash: 'abc123',
  size_bytes: 256,
  metadata: '{"format":"json","version":"1.0"}',
  created_at: '2025-11-16T00:00:00.000Z',
  expires_at: '2025-12-16T00:00:00.000Z',
  status: 'active',
};

const COORDINATION_EVENT_REDIS: RedisData = {
  event_id: 'event-001',
  task_id: 'task-456',
  agent_id: 'agent-123',
  event_type: 'task_completed',
  timestamp: 1731715200000,
  payload: '{"result":"success","duration":5000}',
};

// ============================================================================
// Type Converter Tests
// ============================================================================

describe('Type Converters', () => {
  describe('DECIMAL_TO_REAL', () => {
    test('converts string decimal to number', () => {
      expect(TYPE_CONVERTERS.DECIMAL_TO_REAL('123.456')).toBe(123.456);
      expect(TYPE_CONVERTERS.DECIMAL_TO_REAL('0.000001')).toBe(0.000001);
    });

    test('converts number decimal to number', () => {
      expect(TYPE_CONVERTERS.DECIMAL_TO_REAL(123.456)).toBe(123.456);
    });

    test('handles null and undefined', () => {
      expect(TYPE_CONVERTERS.DECIMAL_TO_REAL(null)).toBeNull();
      expect(TYPE_CONVERTERS.DECIMAL_TO_REAL(undefined)).toBeNull();
    });

    test('handles invalid values', () => {
      expect(TYPE_CONVERTERS.DECIMAL_TO_REAL('invalid')).toBeNull();
      expect(TYPE_CONVERTERS.DECIMAL_TO_REAL('NaN')).toBeNull();
    });
  });

  describe('INTEGER', () => {
    test('converts string to integer', () => {
      expect(TYPE_CONVERTERS.INTEGER('42')).toBe(42);
      expect(TYPE_CONVERTERS.INTEGER('0')).toBe(0);
    });

    test('handles number input', () => {
      expect(TYPE_CONVERTERS.INTEGER(42)).toBe(42);
    });

    test('handles null and undefined', () => {
      expect(TYPE_CONVERTERS.INTEGER(null)).toBeNull();
      expect(TYPE_CONVERTERS.INTEGER(undefined)).toBeNull();
    });

    test('handles invalid values', () => {
      expect(TYPE_CONVERTERS.INTEGER('abc')).toBeNull();
    });
  });

  describe('DATETIME_TO_TIMESTAMP', () => {
    test('converts ISO string to Unix timestamp', () => {
      const result = TYPE_CONVERTERS.DATETIME_TO_TIMESTAMP('2025-11-16T00:00:00.000Z');
      expect(result).toBe(1731715200000);
    });

    test('handles null and undefined', () => {
      expect(TYPE_CONVERTERS.DATETIME_TO_TIMESTAMP(null)).toBeNull();
      expect(TYPE_CONVERTERS.DATETIME_TO_TIMESTAMP(undefined)).toBeNull();
    });

    test('handles invalid date strings', () => {
      expect(TYPE_CONVERTERS.DATETIME_TO_TIMESTAMP('invalid')).toBeNull();
    });
  });

  describe('TIMESTAMP_TO_DATETIME', () => {
    test('converts Unix timestamp to ISO string', () => {
      const result = TYPE_CONVERTERS.TIMESTAMP_TO_DATETIME(1731715200000);
      expect(result).toBe('2025-11-16T00:00:00.000Z');
    });

    test('converts string timestamp to ISO string', () => {
      const result = TYPE_CONVERTERS.TIMESTAMP_TO_DATETIME('1731715200000');
      expect(result).toBe('2025-11-16T00:00:00.000Z');
    });

    test('handles null and undefined', () => {
      expect(TYPE_CONVERTERS.TIMESTAMP_TO_DATETIME(null)).toBeNull();
      expect(TYPE_CONVERTERS.TIMESTAMP_TO_DATETIME(undefined)).toBeNull();
    });

    test('handles NaN', () => {
      expect(TYPE_CONVERTERS.TIMESTAMP_TO_DATETIME(NaN)).toBeNull();
    });
  });

  describe('JSON_TO_TEXT', () => {
    test('stringifies objects', () => {
      const obj = { foo: 'bar', baz: 123 };
      expect(TYPE_CONVERTERS.JSON_TO_TEXT(obj)).toBe('{"foo":"bar","baz":123}');
    });

    test('handles null and undefined', () => {
      expect(TYPE_CONVERTERS.JSON_TO_TEXT(null)).toBeNull();
      expect(TYPE_CONVERTERS.JSON_TO_TEXT(undefined)).toBeNull();
    });

    test('handles circular references gracefully', () => {
      const circular: any = { a: 1 };
      circular.self = circular;
      expect(TYPE_CONVERTERS.JSON_TO_TEXT(circular)).toBeNull();
    });
  });

  describe('TEXT_TO_JSON', () => {
    test('parses valid JSON strings', () => {
      expect(TYPE_CONVERTERS.TEXT_TO_JSON('{"foo":"bar"}')).toEqual({ foo: 'bar' });
    });

    test('handles null, undefined, and empty string', () => {
      expect(TYPE_CONVERTERS.TEXT_TO_JSON(null)).toBeNull();
      expect(TYPE_CONVERTERS.TEXT_TO_JSON(undefined)).toBeNull();
      expect(TYPE_CONVERTERS.TEXT_TO_JSON('')).toBeNull();
    });

    test('handles invalid JSON gracefully', () => {
      expect(TYPE_CONVERTERS.TEXT_TO_JSON('invalid json')).toBeNull();
      expect(TYPE_CONVERTERS.TEXT_TO_JSON('{broken')).toBeNull();
    });
  });

  describe('BOOLEAN_TO_INTEGER', () => {
    test('converts boolean to 0/1', () => {
      expect(TYPE_CONVERTERS.BOOLEAN_TO_INTEGER(true)).toBe(1);
      expect(TYPE_CONVERTERS.BOOLEAN_TO_INTEGER(false)).toBe(0);
    });

    test('handles number input', () => {
      expect(TYPE_CONVERTERS.BOOLEAN_TO_INTEGER(1)).toBe(1);
      expect(TYPE_CONVERTERS.BOOLEAN_TO_INTEGER(0)).toBe(0);
      expect(TYPE_CONVERTERS.BOOLEAN_TO_INTEGER(42)).toBe(0);
    });

    test('handles null and undefined', () => {
      expect(TYPE_CONVERTERS.BOOLEAN_TO_INTEGER(null)).toBeNull();
      expect(TYPE_CONVERTERS.BOOLEAN_TO_INTEGER(undefined)).toBeNull();
    });
  });

  describe('INTEGER_TO_BOOLEAN', () => {
    test('converts 1 to true, 0 to false', () => {
      expect(TYPE_CONVERTERS.INTEGER_TO_BOOLEAN(1)).toBe(true);
      expect(TYPE_CONVERTERS.INTEGER_TO_BOOLEAN(0)).toBe(false);
    });

    test('converts string numbers', () => {
      expect(TYPE_CONVERTERS.INTEGER_TO_BOOLEAN('1')).toBe(true);
      expect(TYPE_CONVERTERS.INTEGER_TO_BOOLEAN('0')).toBe(false);
    });

    test('handles null and undefined', () => {
      expect(TYPE_CONVERTERS.INTEGER_TO_BOOLEAN(null)).toBeNull();
      expect(TYPE_CONVERTERS.INTEGER_TO_BOOLEAN(undefined)).toBeNull();
    });
  });
});

// ============================================================================
// Schema Transform Tests
// ============================================================================

describe('Schema Transforms', () => {
  describe('sqliteToRedis - agent_executions', () => {
    test('transforms complete record successfully', () => {
      const result = sqliteToRedis('agent_executions', AGENT_EXECUTION_SQLITE);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.agent_id).toBe('agent-123');
      expect(result.data?.task_id).toBe('task-456');
      expect(result.data?.confidence).toBe('0.92');
      expect(result.data?.spawned_at).toBe(1731715200000);
    });

    test('handles missing optional fields', () => {
      const partial = { ...AGENT_EXECUTION_SQLITE };
      delete partial.completed_at;
      delete partial.metadata;

      const result = sqliteToRedis('agent_executions', partial);

      expect(result.success).toBe(true);
      expect(result.data?.completed_at).toBeUndefined();
      expect(result.data?.metadata).toBeUndefined();
    });

    test('fails on missing required fields', () => {
      const invalid = { ...AGENT_EXECUTION_SQLITE };
      delete invalid.agent_id;

      const result = sqliteToRedis('agent_executions', invalid);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Required field 'agent_id' is missing");
    });
  });

  describe('redisToSqlite - agent_executions', () => {
    test('transforms complete record successfully', () => {
      const result = redisToSqlite('agent_executions', AGENT_EXECUTION_REDIS);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.agent_id).toBe('agent-123');
      expect(result.data?.confidence).toBe(0.92);
      expect(result.data?.spawned_at).toBe('2025-11-16T00:00:00.000Z');
    });

    test('sets null for missing optional fields', () => {
      const partial = { ...AGENT_EXECUTION_REDIS };
      delete partial.completed_at;

      const result = redisToSqlite('agent_executions', partial);

      expect(result.success).toBe(true);
      expect(result.data?.completed_at).toBeNull();
    });
  });

  describe('postgrestoSqlite - skill_executions', () => {
    test('transforms complete record successfully', () => {
      const result = postgrestoSqlite('skill_executions', SKILL_EXECUTION_POSTGRES);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(1);
      expect(result.data?.skill_id).toBe(42);
      expect(result.data?.cost_usd).toBe(0.0035);
      expect(result.data?.status).toBe('success');
      expect(result.data?.metadata).toBe('{"tool":"grep","pattern":"*.ts"}');
    });

    test('rejects non-skill_executions schema', () => {
      expect(() => {
        postgrestoSqlite('agent_executions' as SchemaName, SKILL_EXECUTION_POSTGRES);
      }).toThrow();
    });
  });

  describe('transformBatch', () => {
    test('transforms batch of SQLite to Redis', () => {
      const batch = [
        AGENT_EXECUTION_SQLITE,
        { ...AGENT_EXECUTION_SQLITE, agent_id: 'agent-456' },
        { ...AGENT_EXECUTION_SQLITE, agent_id: 'agent-789' },
      ];

      const result = transformBatch('agent_executions', batch, 'sqlite-to-redis');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.data?.[0].agent_id).toBe('agent-123');
      expect(result.data?.[1].agent_id).toBe('agent-456');
      expect(result.data?.[2].agent_id).toBe('agent-789');
    });

    test('handles partial failures in batch', () => {
      const batch = [
        AGENT_EXECUTION_SQLITE,
        { invalid: 'record' }, // Missing required fields
        { ...AGENT_EXECUTION_SQLITE, agent_id: 'agent-789' },
      ];

      const result = transformBatch('agent_executions', batch, 'sqlite-to-redis');

      expect(result.success).toBe(false);
      expect(result.data).toHaveLength(2); // Two valid records
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    test('transforms empty batch', () => {
      const result = transformBatch('agent_executions', [], 'sqlite-to-redis');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });
});

// ============================================================================
// Bidirectional Transformation Tests (Round-Trip)
// ============================================================================

describe('Bidirectional Transforms (Round-Trip)', () => {
  test('agent_executions: SQLite → Redis → SQLite', () => {
    // SQLite → Redis
    const toRedis = sqliteToRedis('agent_executions', AGENT_EXECUTION_SQLITE);
    expect(toRedis.success).toBe(true);
    expect(toRedis.data).toBeDefined();

    // Redis → SQLite
    const backToSqlite = redisToSqlite('agent_executions', toRedis.data!);
    expect(backToSqlite.success).toBe(true);
    expect(backToSqlite.data).toBeDefined();

    // Verify data preservation
    expect(backToSqlite.data?.agent_id).toBe(AGENT_EXECUTION_SQLITE.agent_id);
    expect(backToSqlite.data?.task_id).toBe(AGENT_EXECUTION_SQLITE.task_id);
    expect(backToSqlite.data?.confidence).toBe(AGENT_EXECUTION_SQLITE.confidence);
    expect(backToSqlite.data?.spawned_at).toBe(AGENT_EXECUTION_SQLITE.spawned_at);
  });

  test('agent_executions: Redis → SQLite → Redis', () => {
    // Redis → SQLite
    const toSqlite = redisToSqlite('agent_executions', AGENT_EXECUTION_REDIS);
    expect(toSqlite.success).toBe(true);
    expect(toSqlite.data).toBeDefined();

    // SQLite → Redis
    const backToRedis = sqliteToRedis('agent_executions', toSqlite.data!);
    expect(backToRedis.success).toBe(true);
    expect(backToRedis.data).toBeDefined();

    // Verify data preservation
    expect(backToRedis.data?.agent_id).toBe(AGENT_EXECUTION_REDIS.agent_id);
    expect(backToRedis.data?.confidence).toBe(AGENT_EXECUTION_REDIS.confidence);
    expect(backToRedis.data?.spawned_at).toBe(AGENT_EXECUTION_REDIS.spawned_at);
  });

  test('artifacts: SQLite → Redis → SQLite', () => {
    // SQLite → Redis
    const toRedis = sqliteToRedis('artifacts', ARTIFACT_SQLITE);
    expect(toRedis.success).toBe(true);

    // Redis → SQLite
    const backToSqlite = redisToSqlite('artifacts', toRedis.data!);
    expect(backToSqlite.success).toBe(true);

    // Verify data preservation
    expect(backToSqlite.data?.id).toBe(ARTIFACT_SQLITE.id);
    expect(backToSqlite.data?.name).toBe(ARTIFACT_SQLITE.name);
    expect(backToSqlite.data?.size_bytes).toBe(ARTIFACT_SQLITE.size_bytes);
  });
});

// ============================================================================
// Consistency Validation Tests
// ============================================================================

describe('Consistency Validation', () => {
  test('validates matching SQLite and Redis data', () => {
    const result = validateConsistency(
      'agent_executions',
      AGENT_EXECUTION_SQLITE,
      AGENT_EXECUTION_REDIS
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('detects field value mismatches', () => {
    const mismatchedRedis = { ...AGENT_EXECUTION_REDIS, confidence: '0.50' };

    const result = validateConsistency(
      'agent_executions',
      AGENT_EXECUTION_SQLITE,
      mismatchedRedis
    );

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('detects missing required fields', () => {
    const incomplete = { ...AGENT_EXECUTION_REDIS };
    delete incomplete.agent_id;

    const result = validateConsistency(
      'agent_executions',
      AGENT_EXECUTION_SQLITE,
      incomplete
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Required field 'agent_id' is missing in Redis data");
  });

  test('warns on unexpected fields', () => {
    const extraFields = { ...AGENT_EXECUTION_REDIS, extra_field: 'unexpected' };

    const result = validateConsistency(
      'agent_executions',
      AGENT_EXECUTION_SQLITE,
      extraFields
    );

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('extra_field'))).toBe(true);
  });
});

// ============================================================================
// Data Loss Verification Tests
// ============================================================================

describe('Data Loss Verification', () => {
  test('detects no data loss on valid round-trip (SQLite → Redis)', () => {
    const check = verifyNoDataLoss(
      'agent_executions',
      AGENT_EXECUTION_SQLITE,
      'sqlite-to-redis'
    );

    expect(check.lossDetected).toBe(false);
    expect(check.lostFields).toHaveLength(0);
    expect(check.nullifications).toHaveLength(0);
  });

  test('detects no data loss on valid round-trip (Redis → SQLite)', () => {
    const check = verifyNoDataLoss(
      'agent_executions',
      AGENT_EXECUTION_REDIS,
      'redis-to-sqlite'
    );

    expect(check.lossDetected).toBe(false);
    expect(check.lostFields).toHaveLength(0);
  });

  test('detects field loss', () => {
    const incompleteData = {
      agent_id: 'agent-123',
      task_id: 'task-456',
      // Missing other required fields
    };

    const check = verifyNoDataLoss(
      'agent_executions',
      incompleteData as any,
      'sqlite-to-redis'
    );

    expect(check.lossDetected).toBe(true);
  });

  test('handles PostgreSQL → SQLite (one-way)', () => {
    const check = verifyNoDataLoss(
      'skill_executions',
      SKILL_EXECUTION_POSTGRES,
      'postgres-to-sqlite'
    );

    expect(check.lossDetected).toBe(false);
    expect(check.details).toContain('one-way');
  });
});

// ============================================================================
// Schema Drift Detection Tests
// ============================================================================

describe('Schema Drift Detection', () => {
  test('detects no drift with matching data sets', async () => {
    const sqliteRecords = [AGENT_EXECUTION_SQLITE];
    const redisRecords = [AGENT_EXECUTION_REDIS];

    const report = await detectDrift('agent_executions', sqliteRecords, redisRecords);

    expect(report.driftDetected).toBe(false);
    expect(report.mismatches).toHaveLength(0);
    expect(report.missingInSqlite).toHaveLength(0);
    expect(report.missingInRedis).toHaveLength(0);
  });

  test('detects value drift between data sets', async () => {
    const sqliteRecords = [AGENT_EXECUTION_SQLITE];
    const mismatchedRedis = [{ ...AGENT_EXECUTION_REDIS, confidence: '0.50' }];

    const report = await detectDrift('agent_executions', sqliteRecords, mismatchedRedis);

    expect(report.driftDetected).toBe(true);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });

  test('detects missing fields in Redis', async () => {
    const sqliteRecords = [AGENT_EXECUTION_SQLITE];
    const incompleteRedis = [{ agent_id: 'agent-123', task_id: 'task-456' }];

    const report = await detectDrift('agent_executions', sqliteRecords, incompleteRedis as RedisData[]);

    expect(report.driftDetected).toBe(true);
    expect(report.missingInRedis.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Batch Operations Tests
// ============================================================================

describe('Batch Operations', () => {
  test('validates batch with all valid records', () => {
    const sqliteBatch = [
      AGENT_EXECUTION_SQLITE,
      { ...AGENT_EXECUTION_SQLITE, agent_id: 'agent-456' },
    ];

    const redisBatch = [
      AGENT_EXECUTION_REDIS,
      { ...AGENT_EXECUTION_REDIS, agent_id: 'agent-456' },
    ];

    const result = validateBatch('agent_executions', sqliteBatch, redisBatch);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('detects invalid records in batch', () => {
    const sqliteBatch = [AGENT_EXECUTION_SQLITE];
    const redisBatch = [{ ...AGENT_EXECUTION_REDIS, confidence: 'invalid' }];

    const result = validateBatch('agent_executions', sqliteBatch, redisBatch);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('verifies no data loss in batch', () => {
    const batch = [
      AGENT_EXECUTION_SQLITE,
      { ...AGENT_EXECUTION_SQLITE, agent_id: 'agent-456' },
    ];

    const check = verifyBatchNoDataLoss('agent_executions', batch, 'sqlite-to-redis');

    expect(check.lossDetected).toBe(false);
  });
});

// ============================================================================
// Schema Mapping Tests
// ============================================================================

describe('Schema Mappings', () => {
  test('getSchemaMapping returns valid mapping', () => {
    const mapping = getSchemaMapping('agent_executions');

    expect(mapping).toBeDefined();
    expect(mapping.schema).toBe('agent_executions');
    expect(mapping.fields.length).toBeGreaterThan(0);
    expect(mapping.primaryKey).toBe('agent_id');
  });

  test('getSchemaMapping throws on unknown schema', () => {
    expect(() => {
      getSchemaMapping('unknown_schema' as SchemaName);
    }).toThrow();
  });

  test('isTransformSupported validates directions', () => {
    expect(isTransformSupported('agent_executions', 'sqlite-to-redis')).toBe(true);
    expect(isTransformSupported('agent_executions', 'redis-to-sqlite')).toBe(true);
    expect(isTransformSupported('skill_executions', 'postgres-to-sqlite')).toBe(true);
    expect(isTransformSupported('skill_executions', 'sqlite-to-redis')).toBe(false);
  });

  test('all schemas have required fields defined', () => {
    const schemas: SchemaName[] = [
      'agent_executions',
      'skill_executions',
      'artifacts',
      'coordination_events',
    ];

    schemas.forEach(schema => {
      const mapping = SCHEMA_MAPPINGS[schema];
      expect(mapping).toBeDefined();
      expect(mapping.version).toBe('1.0.0');
      expect(mapping.primaryKey).toBeDefined();
      expect(mapping.fields.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  test('handles null values in transforms', () => {
    const dataWithNulls = {
      ...AGENT_EXECUTION_SQLITE,
      completed_at: null,
      metadata: null,
    };

    const result = sqliteToRedis('agent_executions', dataWithNulls);
    expect(result.success).toBe(true);
  });

  test('handles undefined values in transforms', () => {
    const dataWithUndefined = {
      ...AGENT_EXECUTION_SQLITE,
      completed_at: undefined,
      metadata: undefined,
    };

    const result = sqliteToRedis('agent_executions', dataWithUndefined);
    expect(result.success).toBe(true);
  });

  test('handles empty strings', () => {
    const dataWithEmpty = {
      ...AGENT_EXECUTION_SQLITE,
      metadata: '',
    };

    const result = sqliteToRedis('agent_executions', dataWithEmpty);
    expect(result.success).toBe(true);
  });

  test('handles NaN in numeric fields', () => {
    const dataWithNaN = {
      ...AGENT_EXECUTION_SQLITE,
      confidence: NaN,
    };

    const result = sqliteToRedis('agent_executions', dataWithNaN);
    expect(result.success).toBe(true);
    expect(result.data?.confidence).toBeNull();
  });

  test('handles Infinity in numeric fields', () => {
    const dataWithInfinity = {
      ...ARTIFACT_SQLITE,
      size_bytes: Infinity,
    };

    const result = sqliteToRedis('artifacts', dataWithInfinity);
    expect(result.success).toBe(true);
  });

  test('handles very large batch sizes', () => {
    const largeBatch = Array(10000).fill(AGENT_EXECUTION_SQLITE).map((item, i) => ({
      ...item,
      agent_id: `agent-${i}`,
    }));

    const result = transformBatch('agent_executions', largeBatch, 'sqlite-to-redis');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(10000);
  });
});
