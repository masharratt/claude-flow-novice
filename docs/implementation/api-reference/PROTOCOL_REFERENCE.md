# Protocol Reference Guide

**Version:** 1.0
**Last Updated:** 2025-11-16
**Status:** Complete

## Table of Contents

1. [Protocol Overview](#protocol-overview)
2. [Database Query Protocol](#database-query-protocol)
3. [Coordination Protocol](#coordination-protocol)
4. [Artifact Storage Protocol](#artifact-storage-protocol)
5. [Transaction Protocol](#transaction-protocol)
6. [Skill Deployment Protocol](#skill-deployment-protocol)
7. [Schema Mapping Protocol](#schema-mapping-protocol)
8. [Reflection Persistence Protocol](#reflection-persistence-protocol)
9. [Error Handling](#error-handling)
10. [Protocol Best Practices](#protocol-best-practices)

---

## Protocol Overview

The standardized system uses 7 core protocols for inter-system communication:

| Protocol | Use Case | Transport | Format | Reliability |
|----------|----------|-----------|--------|-------------|
| Database Query | Query execution | Direct/Cache | JSON | Cached |
| Coordination | Agent signaling | Redis Pub/Sub | Signal strings | Best effort |
| Artifact Storage | Content versioning | Filesystem + DB | Binary + JSON | ACID |
| Transaction | Distributed operations | Database | SQL + Logs | ACID |
| Skill Deployment | Script execution | Process | Frontmatter + Shell | At-most-once |
| Schema Mapping | Heterogeneous queries | Multi-DB | Mapping JSON | At-least-once |
| Reflection Persistence | Analysis caching | Database | JSON | ACID |

---

## Database Query Protocol

### Purpose

Standardized interface for all database operations with automatic caching, schema validation, and connection pooling.

### Request Format

```json
{
  "correlation_key": "string (required)",
  "operation": "select" | "insert" | "update" | "delete" | "upsert" (required),
  "database": "string (optional, default: primary)",
  "table": "string (required)",
  "schema": "string (optional, auto-discover if missing)",
  "fields": ["field1", "field2"] (optional, default: *),
  "filters": {
    "field": "value" or {"$operator": "value"}
  },
  "values": {
    "field": "value"
  },
  "options": {
    "cache_ttl_seconds": 3600,
    "timeout_seconds": 30,
    "max_retries": 3,
    "use_cache": true
  }
}
```

### Response Format

```json
{
  "status": "success" | "error" | "cached",
  "correlation_key": "string",
  "timestamp": "ISO8601",
  "result": {
    "rows": [],
    "row_count": 0,
    "affected_rows": 0
  },
  "metadata": {
    "execution_time_ms": 125,
    "from_cache": false,
    "schema_version": 3,
    "database": "primary"
  },
  "errors": []
}
```

### Protocol Rules

1. **Correlation Key**: Every request MUST include unique correlation key
2. **Schema Validation**: All inserts/updates validated against schema
3. **Type Coercion**: Values automatically converted to schema types
4. **Connection Pooling**: Automatic connection reuse from pool
5. **Caching**: SELECT results cached by default (configurable TTL)
6. **Timeout**: All queries timeout after 30 seconds (configurable)
7. **Retry**: Failed queries retry up to 3 times with exponential backoff

### Example Request

```json
{
  "correlation_key": "query-001:iter-1:1731752400000",
  "operation": "select",
  "table": "agents",
  "schema": "cfn_schema",
  "fields": ["id", "status", "confidence"],
  "filters": {
    "status": "completed",
    "confidence": {"$gte": 0.75}
  },
  "options": {
    "cache_ttl_seconds": 300,
    "timeout_seconds": 10
  }
}
```

### Example Response

```json
{
  "status": "success",
  "correlation_key": "query-001:iter-1:1731752400000",
  "timestamp": "2025-11-16T10:00:00Z",
  "result": {
    "rows": [
      {
        "id": "agent-123",
        "status": "completed",
        "confidence": 0.92
      }
    ],
    "row_count": 1,
    "affected_rows": 0
  },
  "metadata": {
    "execution_time_ms": 45,
    "from_cache": false,
    "schema_version": 3,
    "database": "primary"
  },
  "errors": []
}
```

### Error Handling

**Validation Errors** (HTTP 400)
```json
{
  "status": "error",
  "errors": [
    {
      "code": "SCHEMA_VALIDATION_FAILED",
      "message": "Field 'confidence' must be number 0-1",
      "field": "confidence",
      "value": "invalid"
    }
  ]
}
```

**Timeout Error** (HTTP 504)
```json
{
  "status": "error",
  "errors": [
    {
      "code": "QUERY_TIMEOUT",
      "message": "Query exceeded 30 second timeout",
      "timeout_seconds": 30,
      "execution_time_ms": 30001
    }
  ]
}
```

**Connection Error** (HTTP 503)
```json
{
  "status": "error",
  "errors": [
    {
      "code": "DATABASE_UNAVAILABLE",
      "message": "Cannot establish database connection",
      "retry_after_seconds": 5
    }
  ]
}
```

---

## Coordination Protocol

### Purpose

Standardized signaling for agent coordination, using Redis Pub/Sub for efficient broadcast and acknowledgment mechanisms.

### Signal Format

```
topic: swarm:{task_id}:{agent_id}:{event_type}
message: {operation}|{metadata}|{timestamp}

Examples:
  swarm:task-123:agent-456:done
  Message: "complete|confidence:0.92|1731752400000"

  swarm:task-123:gate:check
  Message: "verify|phase:loop2|1731752400000"
```

### Broadcast Message Format

```json
{
  "signal_type": "broadcast" | "unicast" | "wait",
  "topic": "swarm:{task_id}:*",
  "agents": ["agent-1", "agent-2"],
  "message": {
    "operation": "start_loop" | "wait_gate" | "report_confidence",
    "phase": "loop1" | "loop2" | "loop3",
    "context": {
      "iteration": 1,
      "confidence_threshold": 0.75,
      "consensus_threshold": 0.90
    }
  },
  "timestamp": "ISO8601",
  "retry_count": 0
}
```

### Wait Mechanism

```
Agent → CoordinationManager:
  {
    "operation": "wait",
    "topic": "swarm:task-123:gate:passed",
    "timeout_seconds": 300
  }

CoordinationManager blocks agent (non-blocking in system)

When signal arrives:
  "swarm:task-123:gate:passed" → {status: "passed", threshold: 0.75}

Agent wakes and continues (timeout or signal)
```

### Protocol Rules

1. **Atomic Broadcast**: All messages broadcast atomically (all-or-nothing)
2. **Ordering**: Messages ordered FIFO per topic
3. **Idempotency**: Duplicate signals (within 1 second) ignored
4. **Timeout**: All waits timeout after 5 minutes (configurable)
5. **Expiration**: Signals expire after 24 hours in Redis
6. **Backpressure**: Coordinator monitors queue depth

### Example Broadcast

```json
{
  "signal_type": "broadcast",
  "topic": "swarm:loop-001:*:start",
  "agents": ["agent-1", "agent-2", "agent-3"],
  "message": {
    "operation": "start_loop",
    "phase": "loop3",
    "context": {
      "iteration": 1,
      "confidence_threshold": 0.75,
      "task_description": "Implement feature X"
    }
  },
  "timestamp": "2025-11-16T10:00:00Z",
  "retry_count": 0
}
```

### Error Handling

**Message Not Delivered**
```
Signal expires after 1 minute if no subscribers
Coordinator retries up to 3 times
Falls back to direct agent invocation if pub/sub fails
```

**Agent Timeout**
```
If agent doesn't report within 5 minutes:
  1. Send reminder signal
  2. Check agent process status
  3. If dead, restart agent
  4. If alive, continue waiting
```

---

## Artifact Storage Protocol

### Purpose

Standardized versioning for artifacts with Git-like revision history, metadata tracking, and format preservation.

### Store Request

```json
{
  "correlation_key": "string (required)",
  "artifact_name": "string (required)",
  "artifact_type": "document" | "code" | "data" | "analysis" (required)",
  "content": "string or binary (required)",
  "format": "markdown" | "json" | "csv" | "binary" (required)",
  "metadata": {
    "created_by": "agent-123",
    "description": "Brief description",
    "tags": ["important", "release"],
    "parent_correlation_key": "optional-parent-id"
  }
}
```

### Store Response

```json
{
  "status": "success" | "error",
  "correlation_key": "string",
  "artifact_info": {
    "name": "artifact-name",
    "version": 1,
    "created_at": "ISO8601",
    "size_bytes": 12345,
    "format": "markdown",
    "content_hash": "sha256:abc123...",
    "url": "file:///artifacts/artifact-name/v1/content"
  },
  "metadata": {
    "execution_time_ms": 45,
    "storage_location": "filesystem"
  }
}
```

### Retrieve Request

```json
{
  "correlation_key": "string",
  "artifact_name": "string",
  "version": "latest" | "1" | "2" | "3" (default: latest)
}
```

### Retrieve Response

```json
{
  "status": "success",
  "artifact_info": {
    "name": "artifact-name",
    "version": 2,
    "created_at": "ISO8601",
    "format": "markdown",
    "size_bytes": 12500
  },
  "content": "string or binary",
  "metadata": {
    "created_by": "agent-456",
    "tags": ["important"],
    "parent_version": 1
  }
}
```

### List Versions Request

```json
{
  "artifact_name": "string",
  "limit": 10,
  "offset": 0
}
```

### List Versions Response

```json
{
  "artifact_name": "string",
  "total_versions": 5,
  "versions": [
    {
      "version": 5,
      "created_at": "2025-11-16T10:05:00Z",
      "created_by": "agent-789",
      "size_bytes": 12600,
      "description": "Final version"
    },
    {
      "version": 4,
      "created_at": "2025-11-16T10:04:00Z",
      "created_by": "agent-456",
      "size_bytes": 12500
    }
  ]
}
```

### Protocol Rules

1. **Versioning**: Auto-increment version numbers (1, 2, 3...)
2. **Immutability**: Previous versions never modified
3. **Content Hash**: SHA256 hash of content stored
4. **Metadata**: All metadata indexed for search
5. **Cleanup**: Versions older than 90 days marked for archival
6. **Conflicts**: Concurrent writes detected (same artifact name)
7. **Format Preservation**: Original format always preserved

### Version Diff Request

```json
{
  "artifact_name": "string",
  "from_version": 1,
  "to_version": 2
}
```

### Version Diff Response

```json
{
  "artifact_name": "string",
  "from_version": 1,
  "to_version": 2,
  "diff": {
    "added_lines": 15,
    "removed_lines": 3,
    "modified_lines": 8,
    "diff_content": "unified diff format"
  }
}
```

### Error Handling

**Version Not Found**
```json
{
  "status": "error",
  "error": {
    "code": "VERSION_NOT_FOUND",
    "message": "Version 99 does not exist",
    "latest_version": 5
  }
}
```

---

## Transaction Protocol

### Purpose

Standardized distributed transaction management with ACID guarantees across multiple databases.

### Begin Transaction Request

```json
{
  "correlation_key": "string (required)",
  "transaction_type": "read" | "write" | "mixed" (required),
  "databases": ["primary", "cache"] (required),
  "timeout_seconds": 30 (optional, default: 60),
  "isolation_level": "read_uncommitted" | "read_committed" | "repeatable_read" | "serializable"
}
```

### Begin Transaction Response

```json
{
  "status": "success",
  "correlation_key": "string",
  "transaction_id": "txn-abc123",
  "savepoint_id": "sp-1",
  "metadata": {
    "started_at": "ISO8601",
    "isolation_level": "repeatable_read",
    "databases": ["primary", "cache"]
  }
}
```

### Execute Operation Request (within transaction)

```json
{
  "transaction_id": "txn-abc123",
  "correlation_key": "string",
  "operation": "select" | "insert" | "update" | "delete",
  "database": "primary",
  "table": "agents",
  "filters": {},
  "values": {}
}
```

### Create Savepoint Request

```json
{
  "transaction_id": "txn-abc123",
  "savepoint_name": "before_critical_update"
}
```

### Create Savepoint Response

```json
{
  "status": "success",
  "savepoint_id": "sp-2",
  "timestamp": "ISO8601"
}
```

### Commit Transaction Request

```json
{
  "transaction_id": "txn-abc123",
  "correlation_key": "string"
}
```

### Commit Transaction Response

```json
{
  "status": "success" | "conflict" | "error",
  "transaction_id": "txn-abc123",
  "metadata": {
    "committed_at": "ISO8601",
    "operations_committed": 5,
    "conflicts_detected": 0
  }
}
```

### Rollback to Savepoint Request

```json
{
  "transaction_id": "txn-abc123",
  "savepoint_id": "sp-2",
  "correlation_key": "string"
}
```

### Protocol Rules

1. **Atomicity**: All operations commit or all rollback
2. **Consistency**: Invariants maintained after commit
3. **Isolation**: Concurrent transactions don't interfere
4. **Durability**: Committed changes survive failures
5. **Logging**: All operations logged with correlation key
6. **Conflict Detection**: Automatic write-write conflict detection
7. **Rollback**: Automatic rollback on timeout or conflict

### Error Handling

**Write-Write Conflict**
```json
{
  "status": "conflict",
  "transaction_id": "txn-abc123",
  "conflict_info": {
    "type": "write_write",
    "field": "status",
    "my_value": "pending",
    "other_value": "completed",
    "resolution": "automatic_rollback"
  }
}
```

**Transaction Timeout**
```json
{
  "status": "error",
  "error": {
    "code": "TRANSACTION_TIMEOUT",
    "message": "Transaction exceeded 60 second timeout",
    "resolution": "automatic_rollback"
  }
}
```

---

## Skill Deployment Protocol

### Purpose

Standardized execution of scripts and tools with metadata injection, environment configuration, and output capture.

### Skill File Format

```bash
#!/bin/bash
# SKILL_NAME: "analyze-database"
# SKILL_VERSION: "1.0"
# SKILL_DESCRIPTION: "Analyze database performance and patterns"
# SKILL_AUTHOR: "cfn-system"
# REQUIRED_ENVIRONMENT: ["DATABASE_URL", "REDIS_URL"]
# OPTIONAL_ENVIRONMENT: ["LOG_LEVEL"]
# TIMEOUT_SECONDS: 60
# RETRY_ATTEMPTS: 3
# OUTPUT_FORMAT: "json"
# DEPENDENCIES: ["sqlite3", "jq"]

set -euo pipefail

# Actual skill logic
```

### Skill Execution Request

```json
{
  "correlation_key": "string",
  "skill_name": "analyze-database",
  "skill_version": "1.0" (optional, default: latest),
  "parameters": {
    "database": "primary",
    "metric_type": "performance"
  },
  "environment": {
    "DATABASE_URL": "sqlite:///data/primary.db",
    "REDIS_URL": "redis://localhost:6379",
    "CORRELATION_KEY": "correlation-key-value"
  },
  "timeout_seconds": 60,
  "retry_policy": {
    "max_attempts": 3,
    "backoff_seconds": 5
  }
}
```

### Skill Execution Response

```json
{
  "status": "success" | "error" | "timeout",
  "skill_name": "analyze-database",
  "correlation_key": "string",
  "execution": {
    "started_at": "ISO8601",
    "completed_at": "ISO8601",
    "duration_ms": 4523
  },
  "output": {
    "result": {
      "metrics": {
        "query_count": 1523,
        "avg_latency_ms": 45,
        "cache_hit_rate": 0.87
      }
    }
  },
  "metadata": {
    "exit_code": 0,
    "stdout_lines": 150,
    "stderr_lines": 0,
    "process_id": 12345
  }
}
```

### Protocol Rules

1. **Frontmatter Parsing**: Metadata extracted from comments before execution
2. **Environment Injection**: All declared environment variables set
3. **Timeout Enforcement**: Process killed after timeout (configurable)
4. **JSON Output**: Expected output parsed as JSON
5. **Exit Code Check**: Non-zero exit treated as failure
6. **Output Capture**: Both stdout and stderr captured
7. **Dependency Check**: Required dependencies verified before execution
8. **Retry Logic**: Failed skills automatically retried with backoff

### Example Skill

```bash
#!/bin/bash
# SKILL_NAME: "collect-metrics"
# SKILL_VERSION: "1.0"
# REQUIRED_ENVIRONMENT: ["DATABASE_URL"]
# OUTPUT_FORMAT: "json"

set -euo pipefail

# Extract environment
DATABASE_URL="${DATABASE_URL:-}"
CORRELATION_KEY="${CORRELATION_KEY:-}"

if [ -z "$DATABASE_URL" ]; then
  echo '{"status":"error","error":"DATABASE_URL not set"}'
  exit 1
fi

# Collect metrics
QUERY_COUNT=$(sqlite3 "$DATABASE_URL" "SELECT COUNT(*) FROM queries")
AVG_LATENCY=$(sqlite3 "$DATABASE_URL" "SELECT AVG(latency_ms) FROM queries")

# Return JSON
cat <<EOF
{
  "status": "success",
  "metrics": {
    "query_count": $QUERY_COUNT,
    "avg_latency_ms": $AVG_LATENCY
  },
  "correlation_key": "$CORRELATION_KEY"
}
EOF
```

### Error Handling

**Timeout Error**
```json
{
  "status": "timeout",
  "skill_name": "analyze-database",
  "error": {
    "code": "EXECUTION_TIMEOUT",
    "message": "Skill exceeded 60 second timeout",
    "timeout_seconds": 60
  }
}
```

**Dependency Missing**
```json
{
  "status": "error",
  "error": {
    "code": "MISSING_DEPENDENCY",
    "message": "Required command 'jq' not found",
    "missing_dependencies": ["jq"]
  }
}
```

---

## Schema Mapping Protocol

### Purpose

Standardized mapping and querying across heterogeneous databases with automatic type conversion.

### Schema Definition

```json
{
  "schema_id": "cfn-agents-v1",
  "schema_version": 1,
  "source_database": "primary",
  "fields": [
    {
      "name": "id",
      "type": "string",
      "required": true,
      "description": "Unique agent identifier"
    },
    {
      "name": "status",
      "type": "enum",
      "enum_values": ["spawned", "running", "completed", "failed"],
      "required": true
    },
    {
      "name": "confidence",
      "type": "number",
      "min": 0,
      "max": 1,
      "required": false
    }
  ]
}
```

### Mapping Definition

```json
{
  "mapping_id": "agents-cache-mapping",
  "source_schema": "cfn-agents-v1",
  "target_schema": "cache-agents-v1",
  "field_mappings": [
    {
      "source_field": "id",
      "target_field": "agent_id",
      "transformation": "identity"
    },
    {
      "source_field": "status",
      "target_field": "state",
      "transformation": "status_to_state"
    },
    {
      "source_field": "confidence",
      "target_field": "score",
      "transformation": "multiply_100"
    }
  ],
  "transformations": {
    "status_to_state": "map(spawned→pending, running→active, ...)",
    "multiply_100": "value * 100"
  }
}
```

### Cross-Database Query Request

```json
{
  "correlation_key": "string",
  "query_type": "select_mapped",
  "source_database": "primary",
  "target_database": "cache",
  "schema": "cfn-agents-v1",
  "mapping": "agents-cache-mapping",
  "filters": {
    "status": "completed"
  }
}
```

### Cross-Database Query Response

```json
{
  "status": "success",
  "correlation_key": "string",
  "result": {
    "rows": [
      {
        "id": "agent-123",
        "status": "completed",
        "confidence": 0.92
      }
    ],
    "row_count": 1
  },
  "metadata": {
    "source_database": "primary",
    "mapped_database": "cache",
    "transformation_applied": true,
    "execution_time_ms": 78
  }
}
```

### Protocol Rules

1. **Schema Discovery**: Schemas auto-discovered if not provided
2. **Type Validation**: All values validated against schema
3. **Type Conversion**: Values converted automatically (string → number, etc.)
4. **Mapping Application**: Field mappings applied to result rows
5. **Caching**: Schemas cached (1-hour TTL)
6. **Validation Errors**: Schema violations returned as error
7. **Missing Fields**: Missing required fields cause error

---

## Reflection Persistence Protocol

### Purpose

Standardized caching of analysis results, patterns, and insights for reuse across iterations.

### Persist Reflection Request

```json
{
  "correlation_key": "string",
  "analysis_type": "pattern" | "insight" | "anomaly" | "metric",
  "subject": "agents" | "database" | "coordination" | "performance",
  "reflection_data": {
    "pattern": "high_variance_confidence",
    "description": "Confidence scores vary significantly across iterations",
    "severity": "medium",
    "affected_agents": ["agent-123", "agent-456"],
    "recommendation": "Investigate validator inconsistency"
  },
  "metadata": {
    "iteration": 1,
    "confidence": 0.87,
    "created_by": "edge-case-analyzer"
  }
}
```

### Persist Reflection Response

```json
{
  "status": "success",
  "correlation_key": "string",
  "reflection_id": "refl-abc123",
  "metadata": {
    "persisted_at": "ISO8601",
    "ttl_days": 30,
    "indexed_for_search": true
  }
}
```

### Query Reflection Request

```json
{
  "analysis_type": "pattern",
  "subject": "agents",
  "limit": 10
}
```

### Query Reflection Response

```json
{
  "status": "success",
  "reflections": [
    {
      "reflection_id": "refl-abc123",
      "analysis_type": "pattern",
      "pattern": "high_variance_confidence",
      "affected_agents": ["agent-123", "agent-456"],
      "created_at": "ISO8601",
      "confidence": 0.87
    }
  ],
  "total_count": 23
}
```

### Protocol Rules

1. **TTL-Based Expiration**: Reflections expire after 30 days
2. **Indexing**: All reflections indexed by type, subject, creation date
3. **Immutability**: Stored reflections cannot be modified
4. **Correlation Linking**: Reflections linked to correlation keys
5. **Aggregation**: Multiple reflections auto-aggregated by pattern
6. **Confidence Tracking**: Confidence score persisted with reflection
7. **Deduplication**: Identical reflections within 1 hour deduplicated

---

## Error Handling

### Standard Error Response

All protocols return consistent error format:

```json
{
  "status": "error",
  "correlation_key": "string",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "specific field that caused error",
      "expected": "what was expected",
      "received": "what was received"
    },
    "retry_after_seconds": 5,
    "suggested_action": "what to do next"
  }
}
```

### Common Error Codes

| Code | Meaning | Retry | Action |
|------|---------|-------|--------|
| VALIDATION_FAILED | Input validation error | No | Fix input |
| TIMEOUT | Operation exceeded timeout | Yes | Increase timeout or simplify |
| CONNECTION_ERROR | Cannot connect to service | Yes | Check service health |
| RESOURCE_UNAVAILABLE | Required resource missing | Yes | Wait and retry |
| PERMISSION_DENIED | Insufficient permissions | No | Check authorization |
| CONFLICT | Data conflict detected | Conditional | Resolve conflict manually |
| INTERNAL_ERROR | Unexpected error | Maybe | File bug report |

### Retry Policy

```
Attempt 1: Immediate
Attempt 2: Wait 1s, retry
Attempt 3: Wait 2s, retry
Attempt 4: Wait 4s, retry
Attempt 5: Wait 8s, retry
Max retries: 3 (configurable)
Max wait: 8s (configurable)
```

---

## Protocol Best Practices

### 1. Always Include Correlation Keys

Every request must include a correlation key for traceability:

```json
{
  "correlation_key": "${OPERATION_ID}:${ITERATION}:${TIMESTAMP}"
}
```

### 2. Use Appropriate Timeouts

Choose timeouts based on operation complexity:

- **Queries**: 10-30 seconds (default: 30s)
- **Coordination**: 5-10 minutes (default: 5m)
- **Skills**: 30-120 seconds (default: 60s)
- **Transactions**: 30-60 seconds (default: 60s)

### 3. Implement Exponential Backoff

When retrying, increase wait time exponentially:

```bash
wait_time=1
for attempt in {1..3}; do
  try_operation && break
  sleep $wait_time
  wait_time=$((wait_time * 2))
done
```

### 4. Cache Strategically

Cache results when appropriate:

- **Rarely changing**: 1 hour TTL
- **Frequently accessed**: 5 minute TTL
- **Session-specific**: Duration of operation
- **Dynamic data**: No cache

### 5. Validate Before Using

Always validate external data:

```json
{
  "validation": {
    "schema": "validate against schema",
    "type": "check expected type",
    "range": "verify min/max bounds",
    "required": "ensure non-null for required fields"
  }
}
```

### 6. Use Standardized Logging

Log all protocol interactions with correlation key:

```
[CORRELATION_KEY] [TIMESTAMP] [OPERATION] [STATUS] [DURATION_MS]
[query-001:iter-1:1731752400000] 2025-11-16T10:00:00Z SELECT success 45
```

### 7. Handle Partial Failures Gracefully

Design for partial success scenarios:

```json
{
  "status": "partial",
  "successful": 8,
  "failed": 2,
  "results": [{...}, {...}],
  "errors": [{...}]
}
```

---

**Document Reference:** PROTOCOL_REFERENCE.md
**Maintained By:** API Documentation Specialist
**Last Reviewed:** 2025-11-16
