# SQLite ↔ Redis Schema Mapping

**Version:** 1.0.0
**Purpose:** Unified schema mapping for bidirectional data transformation between SQLite, Redis, and PostgreSQL
**Task:** Integration Standardization Plan - Task 2.2

---

## Overview

This document defines the canonical mapping between SQLite and Redis schemas, ensuring data consistency and enabling cross-system queries without data loss.

### Design Principles

1. **Bidirectional Consistency**: All transformations must be reversible
2. **No Data Loss**: Round-trip transformations preserve all data
3. **Type Safety**: Strong typing with runtime validation
4. **Edge Case Handling**: Explicit handling of null, undefined, NaN, empty values
5. **Schema Evolution**: Versioned mappings support schema changes

---

## Schema Mappings

### 1. Agent Executions

**Purpose:** Track agent lifecycle events
**Primary Storage:** Redis (real-time), SQLite (archive)
**TTL:** Redis: 24 hours, SQLite: permanent

#### Field Mapping

| SQLite Column | SQLite Type | Redis Key | Redis Type | Transformation |
|--------------|-------------|-----------|------------|----------------|
| `id` | TEXT PRIMARY KEY | `agent_id` | string | None (identity) |
| `agent_id` | TEXT NOT NULL | `agent_id` | string | None (identity) |
| `task_id` | TEXT NOT NULL | `task_id` | string | None (identity) |
| `type` | TEXT NOT NULL | `type` | string | None (identity) |
| `status` | TEXT NOT NULL | `status` | string | None (identity) |
| `confidence` | REAL | `confidence` | string | parseFloat / toString |
| `spawned_at` | DATETIME | `spawned_at` | number (unix ms) | ISO string ↔ timestamp |
| `completed_at` | DATETIME | `completed_at` | number (unix ms) | ISO string ↔ timestamp |
| `metadata` | TEXT (JSON) | `metadata` | string (JSON) | JSON.parse / JSON.stringify |

#### Type Conversions

```typescript
// SQLite → Redis
{
  agent_id: row.agent_id,                    // string → string
  task_id: row.task_id,                      // string → string
  confidence: row.confidence.toString(),      // REAL → string
  spawned_at: new Date(row.spawned_at).getTime(), // DATETIME → number
  metadata: row.metadata                      // TEXT (already JSON string)
}

// Redis → SQLite
{
  agent_id: data.agent_id,                   // string → TEXT
  task_id: data.task_id,                     // string → TEXT
  confidence: parseFloat(data.confidence),    // string → REAL
  spawned_at: new Date(data.spawned_at).toISOString(), // number → DATETIME
  metadata: data.metadata                     // string → TEXT
}
```

#### Redis Key Pattern

```
agent:execution:{agent_id}
agent:execution:{task_id}:agents
```

---

### 2. Skill Executions

**Purpose:** Track skill performance metrics
**Primary Storage:** PostgreSQL (production), SQLite (analytics)
**Migration:** PostgreSQL → SQLite (one-way)

#### Field Mapping

| PostgreSQL Column | PG Type | SQLite Column | SQLite Type | Transformation |
|------------------|---------|---------------|-------------|----------------|
| `id` | SERIAL PRIMARY KEY | `id` | INTEGER PRIMARY KEY | None (identity) |
| `skill_id` | INTEGER NOT NULL | `skill_id` | INTEGER NOT NULL | None (identity) |
| `execution_time_ms` | INTEGER | `execution_time_ms` | INTEGER | None (identity) |
| `cost_usd` | DECIMAL(10,6) | `cost_usd` | REAL | parseFloat |
| `tokens_avoided` | INTEGER | `tokens_avoided` | INTEGER | None (identity) |
| `status` | ENUM('success','failure','timeout') | `status` | TEXT | toString |
| `executed_at` | TIMESTAMP | `executed_at` | DATETIME | ISO string |
| `metadata` | JSONB | `metadata` | TEXT | JSON.stringify |

#### Type Conversions

```typescript
// PostgreSQL → SQLite
{
  id: row.id,                                // SERIAL → INTEGER
  skill_id: row.skill_id,                    // INTEGER → INTEGER
  execution_time_ms: row.execution_time_ms,  // INTEGER → INTEGER
  cost_usd: parseFloat(row.cost_usd),        // DECIMAL → REAL
  tokens_avoided: row.tokens_avoided,        // INTEGER → INTEGER
  status: row.status.toString(),             // ENUM → TEXT
  executed_at: row.executed_at.toISOString(), // TIMESTAMP → DATETIME
  metadata: JSON.stringify(row.metadata)     // JSONB → TEXT
}
```

**Note:** One-way transformation only (PostgreSQL is source of truth)

---

### 3. Artifacts

**Purpose:** Centralized artifact management with TTL
**Primary Storage:** SQLite
**Secondary Storage:** Redis (cache layer for active artifacts)

#### Field Mapping

| SQLite Column | SQLite Type | Redis Key | Redis Type | Transformation |
|--------------|-------------|-----------|------------|----------------|
| `id` | TEXT PRIMARY KEY | `artifact_id` | string | None (identity) |
| `name` | TEXT NOT NULL | `name` | string | None (identity) |
| `type` | TEXT NOT NULL | `type` | string | None (identity) |
| `content` | TEXT | `content` | string | None (identity) |
| `content_hash` | TEXT | `content_hash` | string | None (identity) |
| `size_bytes` | INTEGER | `size_bytes` | string | parseInt / toString |
| `metadata` | TEXT (JSON) | `metadata` | string (JSON) | None (identity) |
| `created_at` | DATETIME | `created_at` | number (unix ms) | ISO string ↔ timestamp |
| `expires_at` | DATETIME | `expires_at` | number (unix ms) | ISO string ↔ timestamp |
| `retention_days` | INTEGER | `ttl` | number (seconds) | days * 86400 |
| `status` | TEXT | `status` | string | None (identity) |

#### Type Conversions

```typescript
// SQLite → Redis (cache layer)
{
  artifact_id: row.id,                       // TEXT → string
  name: row.name,                            // TEXT → string
  type: row.type,                            // TEXT → string
  content: row.content,                      // TEXT → string
  size_bytes: row.size_bytes.toString(),     // INTEGER → string
  created_at: new Date(row.created_at).getTime(), // DATETIME → number
  expires_at: new Date(row.expires_at).getTime(), // DATETIME → number
  metadata: row.metadata                     // TEXT → string
}

// Redis → SQLite (cache miss, write through)
{
  id: data.artifact_id,                      // string → TEXT
  name: data.name,                           // string → TEXT
  type: data.type,                           // string → TEXT
  content: data.content,                     // string → TEXT
  size_bytes: parseInt(data.size_bytes),     // string → INTEGER
  created_at: new Date(data.created_at).toISOString(), // number → DATETIME
  expires_at: new Date(data.expires_at).toISOString(), // number → DATETIME
  metadata: data.metadata                    // string → TEXT
}
```

#### Redis Key Pattern

```
artifact:{artifact_id}
artifact:by-type:{type}
```

---

### 4. Coordination Events

**Purpose:** Real-time agent coordination and event tracking
**Primary Storage:** Redis (real-time)
**Secondary Storage:** SQLite (archive after TTL)

#### Field Mapping

| Redis Key | Redis Type | SQLite Column | SQLite Type | Transformation |
|-----------|------------|---------------|-------------|----------------|
| `event_id` | string | `id` | TEXT PRIMARY KEY | None (identity) |
| `task_id` | string | `task_id` | TEXT NOT NULL | None (identity) |
| `agent_id` | string | `agent_id` | TEXT | None (identity) |
| `event_type` | string | `event_type` | TEXT NOT NULL | None (identity) |
| `timestamp` | number (unix ms) | `timestamp` | DATETIME | timestamp ↔ ISO string |
| `payload` | string (JSON) | `payload` | TEXT (JSON) | None (identity) |
| `ttl` | number (seconds) | N/A | N/A | Redis-only field |

#### Type Conversions

```typescript
// Redis → SQLite (archival)
{
  id: data.event_id,                         // string → TEXT
  task_id: data.task_id,                     // string → TEXT
  agent_id: data.agent_id,                   // string → TEXT
  event_type: data.event_type,               // string → TEXT
  timestamp: new Date(data.timestamp).toISOString(), // number → DATETIME
  payload: data.payload                      // string → TEXT
}

// SQLite → Redis (replay/restore)
{
  event_id: row.id,                          // TEXT → string
  task_id: row.task_id,                      // TEXT → string
  agent_id: row.agent_id,                    // TEXT → string
  event_type: row.event_type,                // TEXT → string
  timestamp: new Date(row.timestamp).getTime(), // DATETIME → number
  payload: row.payload                       // TEXT → string
}
```

#### Redis Key Pattern

```
coordination:event:{event_id}
coordination:task:{task_id}:events
coordination:agent:{agent_id}:events
```

---

## Type Conversion Rules

### Universal Converters

```typescript
const TYPE_CONVERTERS = {
  // Numeric Types
  'DECIMAL → REAL': (val: string) => {
    if (val === null || val === undefined) return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  },

  'INTEGER → number': (val: number | string) => {
    if (val === null || val === undefined) return null;
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    return isNaN(num) ? null : num;
  },

  'REAL → number': (val: number | string) => {
    if (val === null || val === undefined) return null;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? null : num;
  },

  'number → string': (val: number) => {
    if (val === null || val === undefined) return null;
    if (isNaN(val)) return null;
    return val.toString();
  },

  // String Types
  'TEXT → string': (val: string) => val === null || val === undefined ? null : val,
  'VARCHAR → string': (val: string) => val === null || val === undefined ? null : val,
  'ENUM → TEXT': (val: string) => val === null || val === undefined ? null : val.toString(),

  // Date/Time Types
  'DATETIME → number': (val: string) => {
    if (val === null || val === undefined) return null;
    const timestamp = new Date(val).getTime();
    return isNaN(timestamp) ? null : timestamp;
  },

  'number → DATETIME': (val: number) => {
    if (val === null || val === undefined) return null;
    if (isNaN(val)) return null;
    return new Date(val).toISOString();
  },

  'TIMESTAMP → DATETIME': (val: number | string) => {
    if (val === null || val === undefined) return null;
    const timestamp = typeof val === 'number' ? val * 1000 : new Date(val).getTime();
    return isNaN(timestamp) ? null : new Date(timestamp).toISOString();
  },

  // JSON Types
  'TEXT → JSON': (val: string) => {
    if (val === null || val === undefined || val === '') return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  },

  'JSON → TEXT': (val: any) => {
    if (val === null || val === undefined) return null;
    try {
      return JSON.stringify(val);
    } catch {
      return null;
    }
  },

  // Boolean Types
  'BOOLEAN → INTEGER': (val: boolean) => {
    if (val === null || val === undefined) return null;
    return val ? 1 : 0;
  },

  'INTEGER → BOOLEAN': (val: number) => {
    if (val === null || val === undefined) return null;
    return val === 1;
  },
};
```

---

## Edge Case Handling

### Null Values

```typescript
// Preserve NULL semantics across systems
SQLite NULL → Redis: omit field (Redis doesn't have NULL)
Redis missing field → SQLite: NULL
PostgreSQL NULL → SQLite: NULL
```

### Undefined Values

```typescript
// Convert undefined to NULL for databases
undefined → SQLite: NULL
undefined → Redis: omit field
Redis missing field → JavaScript: undefined
```

### NaN and Infinity

```typescript
// Numeric edge cases
NaN → SQLite: NULL
Infinity → SQLite: NULL
-Infinity → SQLite: NULL

SQLite NULL → JavaScript: null (not NaN)
```

### Empty Strings

```typescript
// Preserve empty string semantics
'' → SQLite: '' (empty TEXT)
'' → Redis: '' (empty string)
```

### JSON Parsing Failures

```typescript
// Handle malformed JSON gracefully
Invalid JSON → null with warning logged
Circular references → null with warning logged
```

---

## Bidirectional Validation

### Round-Trip Test Pattern

```typescript
async function validateRoundTrip(schema: SchemaName, originalData: any) {
  // SQLite → Redis → SQLite
  const redisData = sqliteToRedis(schema, originalData);
  const backToSqlite = redisToSqlite(schema, redisData);

  assert.deepEqual(originalData, backToSqlite, 'Round-trip failed');

  // Redis → SQLite → Redis
  const sqliteData = redisToSqlite(schema, originalData);
  const backToRedis = sqliteToRedis(schema, sqliteData);

  assert.deepEqual(originalData, backToRedis, 'Round-trip failed');
}
```

### Data Loss Detection

```typescript
function detectDataLoss(original: any, transformed: any): string[] {
  const losses: string[] = [];

  // Check for missing fields
  for (const key in original) {
    if (!(key in transformed)) {
      losses.push(`Field '${key}' missing after transformation`);
    }
  }

  // Check for value changes (excluding expected type conversions)
  for (const key in original) {
    const orig = original[key];
    const trans = transformed[key];

    if (orig !== null && trans === null) {
      losses.push(`Field '${key}' became NULL`);
    }
  }

  return losses;
}
```

---

## Schema Evolution Strategy

### Versioning

All schema mappings include a version field:

```typescript
interface SchemaMapping {
  version: string;           // Semantic version (1.0.0)
  schema: string;            // Schema name
  effectiveDate: Date;       // When this version became active
  deprecatedDate?: Date;     // When this version was deprecated
  fields: FieldMapping[];
}
```

### Backward Compatibility

1. **Additive Changes Only**: New fields are optional
2. **Field Deprecation**: Mark as deprecated, maintain for 2 versions
3. **Type Changes**: Create new field, maintain old field with conversion
4. **Breaking Changes**: Increment major version, provide migration path

### Migration Path

```typescript
// Example: Adding new field
// v1.0.0 → v1.1.0
{
  version: '1.1.0',
  schema: 'agent_executions',
  changes: [
    {
      type: 'add_field',
      field: 'retry_count',
      sqliteType: 'INTEGER DEFAULT 0',
      redisType: 'string',
      defaultValue: '0'
    }
  ]
}
```

---

## Known Limitations

### 1. Precision Loss

**Issue:** SQLite REAL has limited precision compared to PostgreSQL DECIMAL
**Impact:** Cost calculations may have rounding errors
**Mitigation:** Store costs in cents (INTEGER) instead of dollars (REAL)

### 2. Redis TTL Expiration

**Issue:** Redis data may expire before archival to SQLite
**Impact:** Data loss for coordination events
**Mitigation:** Archive events before TTL expiration (80% of TTL)

### 3. Enum Value Changes

**Issue:** PostgreSQL ENUM values can change, SQLite stores as TEXT
**Impact:** Invalid enum values in SQLite after PG schema change
**Mitigation:** Validate ENUM values during transformation

### 4. Large Binary Data

**Issue:** SQLite TEXT fields have size limits, Redis memory constraints
**Impact:** Large artifacts may fail to store
**Mitigation:** Store content in filesystem, store path in database

### 5. Concurrent Modifications

**Issue:** No distributed locking between SQLite and Redis
**Impact:** Last-write-wins conflicts
**Mitigation:** Use correlation IDs and timestamps for conflict detection

---

## Performance Considerations

### Batch Operations

```typescript
// Process in batches to avoid memory exhaustion
const BATCH_SIZE = 1000;

for (let i = 0; i < data.length; i += BATCH_SIZE) {
  const batch = data.slice(i, i + BATCH_SIZE);
  await transformBatch(batch, 'sqlite-to-redis');
}
```

### Index Strategy

```sql
-- SQLite indexes for correlation lookups
CREATE INDEX idx_agent_executions_task_id ON agent_executions(task_id);
CREATE INDEX idx_coordination_events_task_id ON coordination_events(task_id);
CREATE INDEX idx_artifacts_type_status ON artifacts(type, status);
```

### Redis Key Expiration

```typescript
// Set TTL based on schema
const TTL_CONFIG = {
  agent_executions: 86400,      // 24 hours
  coordination_events: 3600,    // 1 hour
  artifacts: 2592000,           // 30 days (cached only)
};
```

---

## References

- Database Service Types: `src/lib/database-service/types.ts`
- Transform Implementation: `src/lib/schema-transform.ts`
- Validator Implementation: `src/lib/schema-validator.ts`
- Migration Utility: `scripts/migrate-schema.sh`

---

**Last Updated:** 2025-11-16
**Maintainer:** Database Architecture Team
**Review Cycle:** Quarterly
