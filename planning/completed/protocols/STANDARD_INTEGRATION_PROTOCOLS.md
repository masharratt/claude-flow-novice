# Claude Flow Novice - Standard Integration Protocols

**Version:** 1.0.0
**Status:** Design
**Last Updated:** 2025-11-15
**Architecture:** Distributed Agent Coordination with Redis/SQLite

---

## Executive Summary

This document defines standardized integration protocols for the Claude Flow Novice system. These protocols enable consistent, maintainable communication between distributed agents, skills, and infrastructure components while maintaining backward compatibility with existing implementations.

**Key Objectives:**
- Reduce integration complexity through standardized patterns
- Enable autonomous agent operation with minimal coordination overhead
- Provide clear error handling and retry strategies
- Support distributed tracing and observability
- Enable graceful degradation and fallback mechanisms

---

## Table of Contents

1. [Core Protocols](#core-protocols)
2. [Data Envelope Format](#data-envelope-format)
3. [Error Protocol](#error-protocol)
4. [Logging Protocol](#logging-protocol)
5. [API Contracts](#api-contracts)
6. [Database Handoff Protocol](#database-handoff-protocol)
7. [File Operation Protocol](#file-operation-protocol)
8. [Agent Communication Protocol](#agent-communication-protocol)
9. [Sequence Diagrams](#sequence-diagrams)
10. [Implementation Examples](#implementation-examples)
11. [Migration Strategy](#migration-strategy)

---

## Core Protocols

### Protocol Categories

The Claude Flow Novice system uses **7 core integration protocols** that work together:

```
┌─────────────────────────────────────────────────────────────┐
│                    Integration Protocols                      │
├─────────────────────────────────────────────────────────────┤
│ 1. Data Envelope       → Message structure & metadata        │
│ 2. Error Protocol      → Error handling & retries           │
│ 3. Logging Protocol    → Structured logging & tracing       │
│ 4. API Contracts       → Interface definitions               │
│ 5. Database Handoff    → Cross-system data exchange          │
│ 6. File Operations     → Atomic writes & backups             │
│ 7. Agent Communication → Spawn & completion signaling        │
└─────────────────────────────────────────────────────────────┘
```

### Protocol Versioning

All protocols use **semantic versioning** (MAJOR.MINOR.PATCH):

```
MAJOR: Breaking changes, incompatible with previous versions
MINOR: Backward-compatible additions
PATCH: Bug fixes, no functional changes
```

Each message includes its protocol version to enable graceful upgrades.

---

## Data Envelope Format

### Overview

All inter-component communication uses a standard JSON envelope containing metadata, payload, and control information.

### Standard Envelope Structure (v1.0)

```typescript
interface DataEnvelope<T = any> {
  // Metadata Section
  metadata: {
    timestamp: string;           // ISO 8601 (e.g., "2025-11-15T10:30:00Z")
    source: string;              // Agent ID, Skill name, or system component
    destination?: string;        // Target agent/skill (optional for broadcasts)
    correlationId: string;       // UUID for request tracing
    traceId: string;             // Parent trace for nested calls
    sessionId?: string;          // Session context (Task ID for CFN Loops)
  };

  // Control Section
  control: {
    version: string;             // Protocol version (e.g., "1.0.0")
    schemaVersion: string;       // Data schema version
    operationType: 'request' | 'response' | 'event' | 'signal';
    priority: 'critical' | 'high' | 'normal' | 'low';
    timeout?: number;            // Milliseconds before timeout
    idempotencyKey?: string;     // For deduplication
  };

  // Tracking Section
  tracking: {
    taskId: string;              // CFN Loop task identifier
    agentId: string;             // Spawned agent identifier
    phase: 'initialization' | 'execution' | 'validation' | 'completion';
    iteration?: number;          // CFN Loop iteration count
    retryCount: number;          // Number of retries attempted
  };

  // Payload
  payload: T;                     // Actual message data

  // Status
  status: {
    success: boolean;
    code: string;                // Status code (HTTP-like: 200, 400, 500)
    message?: string;            // Human-readable status
  };
}
```

### Envelope Examples

**Agent Spawning Request:**
```json
{
  "metadata": {
    "timestamp": "2025-11-15T10:30:00Z",
    "source": "cfn-v3-coordinator",
    "destination": "cli-spawner",
    "correlationId": "req-12345-67890",
    "traceId": "trace-cfn-loop-001",
    "sessionId": "task-20251115-001"
  },
  "control": {
    "version": "1.0.0",
    "schemaVersion": "1.0.0",
    "operationType": "request",
    "priority": "high",
    "timeout": 30000
  },
  "tracking": {
    "taskId": "task-20251115-001",
    "agentId": "agent-backend-dev-uuid",
    "phase": "initialization",
    "iteration": 1,
    "retryCount": 0
  },
  "payload": {
    "agentType": "backend-developer",
    "parameters": {
      "skill": "authentication",
      "task": "Implement JWT token validation"
    },
    "environment": {
      "MODE": "cli",
      "DEBUG": "true"
    }
  },
  "status": {
    "success": true,
    "code": "200",
    "message": "Spawning initiated"
  }
}
```

**Agent Completion Response:**
```json
{
  "metadata": {
    "timestamp": "2025-11-15T10:45:30Z",
    "source": "agent-backend-dev-uuid",
    "destination": "cfn-v3-coordinator",
    "correlationId": "req-12345-67890",
    "traceId": "trace-cfn-loop-001",
    "sessionId": "task-20251115-001"
  },
  "control": {
    "version": "1.0.0",
    "schemaVersion": "1.0.0",
    "operationType": "response",
    "priority": "critical"
  },
  "tracking": {
    "taskId": "task-20251115-001",
    "agentId": "agent-backend-dev-uuid",
    "phase": "completion",
    "iteration": 1,
    "retryCount": 0
  },
  "payload": {
    "decision": "PROCEED",
    "confidence": 0.92,
    "deliverables": [
      "/home/user/src/auth/jwt-validator.ts",
      "/home/user/tests/auth/jwt-validator.test.ts"
    ],
    "summary": "Implemented JWT token validation with comprehensive test coverage",
    "metrics": {
      "filesCreated": 2,
      "linesOfCode": 342,
      "testCoverage": 94.5,
      "duration": 915000
    }
  },
  "status": {
    "success": true,
    "code": "200",
    "message": "Completion reported successfully"
  }
}
```

### Envelope Validation Rules

```typescript
// Validation rules for all envelopes
interface EnvelopeValidation {
  rules: {
    // All timestamps must be ISO 8601
    timestampFormat: (ts: string) => boolean;

    // Correlation IDs must be UUIDs
    correlationIdFormat: (id: string) => boolean;

    // Task IDs must be present and non-empty
    taskIdRequired: (taskId?: string) => boolean;

    // Agent IDs must follow format: agent-{type}-{uuid}
    agentIdFormat: (id: string) => boolean;

    // Control version must match supported protocol versions
    protocolVersionSupported: (version: string) => boolean;
  };
}
```

---

## Error Protocol

### Overview

Standardized error handling with retry policies, fallback strategies, and error categorization.

### Error Structure (v1.0)

```typescript
interface StandardError {
  // Error identification
  id: string;                      // UUID for error tracking
  code: string;                    // Error code (see categories below)
  category: ErrorCategory;         // Categorization

  // Error details
  message: string;                 // User-facing message
  details?: Record<string, any>;   // Error-specific details

  // Stack trace (only in DEBUG mode)
  stack?: string;                  // Stack trace

  // Context information
  context: {
    componentId: string;           // Which component generated error
    timestamp: string;             // ISO 8601 timestamp
    operationId: string;           // Operation being performed
    phase: string;                 // Phase when error occurred
  };

  // Recovery information
  recovery: {
    retryable: boolean;            // Can operation be retried?
    fallbackAction?: string;       // Fallback strategy
    estimatedRecoveryTime?: number; // Seconds until retry
  };

  // Envelope for message transmission
  envelope: DataEnvelope<StandardError>;
}

type ErrorCategory = 'DATABASE' | 'FILE' | 'NETWORK' | 'VALIDATION' |
                    'TIMEOUT' | 'AUTHORIZATION' | 'SYSTEM';
```

### Error Code Reference

**Database Errors (DB-\*):**
```
DB-001: Connection failed
DB-002: Query execution failed
DB-003: Transaction rollback
DB-004: Schema mismatch
DB-005: Data integrity violation
DB-006: Deadlock detected
DB-007: Constraint violation
```

**File Errors (FILE-\*):**
```
FILE-001: File not found
FILE-002: Permission denied
FILE-003: Disk full
FILE-004: Invalid path
FILE-005: Atomic write failure
FILE-006: Backup creation failed
FILE-007: Content hash mismatch
```

**Network Errors (NET-\*):**
```
NET-001: Connection refused
NET-002: Timeout
NET-003: DNS resolution failed
NET-004: TLS handshake failed
NET-005: Rate limited
NET-006: Service unavailable
NET-007: Bad gateway
```

**Validation Errors (VAL-\*):**
```
VAL-001: Schema validation failed
VAL-002: Type mismatch
VAL-003: Missing required field
VAL-004: Invalid format
VAL-005: Out of range
VAL-006: Enum value invalid
VAL-007: Constraint violation
```

**Timeout Errors (TIMEOUT-\*):**
```
TIMEOUT-001: Request timeout
TIMEOUT-002: Heartbeat missed
TIMEOUT-003: Lock timeout
TIMEOUT-004: Database timeout
TIMEOUT-005: Agent execution timeout
```

### Retry Policy

```typescript
interface RetryPolicy {
  maxRetries: number;              // Maximum retry attempts (default: 3)
  initialDelayMs: number;          // Initial delay in milliseconds (default: 100)
  maxDelayMs: number;              // Maximum delay in milliseconds (default: 30000)
  exponentialBase: number;         // Backoff multiplier (default: 2)

  // Retry on these conditions
  retryableErrors: ErrorCategory[];
  retryableHttpCodes: number[];   // 408, 429, 500, 502, 503, 504

  // Do NOT retry on these errors
  nonRetryableErrors: string[];   // VAL-*, AUTH-*, etc.

  // Jitter to prevent thundering herd
  jitterMs: number;               // Random jitter (default: 0-100ms)
}

// Default retry policy
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 30000,
  exponentialBase: 2,
  retryableErrors: ['DATABASE', 'NETWORK', 'TIMEOUT'],
  retryableHttpCodes: [408, 429, 500, 502, 503, 504],
  nonRetryableErrors: ['VAL-*', 'AUTH-*', 'FILE-001'],
  jitterMs: 100
};
```

### Fallback Strategy

```typescript
interface FallbackStrategy {
  strategy: 'immediate_retry' | 'exponential_backoff' | 'circuit_breaker' |
            'dead_letter_queue' | 'manual_intervention';

  conditions: {
    // When to apply this strategy
    maxRetriesExceeded?: boolean;
    errorCodes?: string[];
    duration?: number;              // Seconds to wait before fallback
  };

  actions: {
    primary: string;               // What to do first
    secondary?: string;            // What if primary fails
    final?: string;                // Last resort
  };
}
```

### Error Handling Example (TypeScript)

```typescript
async function handleWithRetry<T>(
  operation: () => Promise<T>,
  errorHandler?: (error: StandardError) => Promise<void>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): Promise<T> {
  let lastError: StandardError;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = normalizeError(error, { attempt });

      if (!shouldRetry(lastError, policy)) {
        throw lastError;
      }

      const delay = calculateBackoff(attempt, policy);
      if (errorHandler) {
        await errorHandler(lastError);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}
```

### Error Handling Example (Bash)

```bash
# Retry with exponential backoff
retry_with_backoff() {
  local max_retries=3
  local timeout=1
  local attempt=1
  local exitcode=0

  while [[ $attempt -le $max_retries ]]; do
    if "$@"; then
      return 0
    else
      exitcode=$?
    fi

    if [[ $attempt -lt $max_retries ]]; then
      echo "Attempt $attempt failed. Retrying in ${timeout}s..." >&2
      sleep "$timeout"
      timeout=$((timeout * 2))
      attempt=$((attempt + 1))
    else
      return $exitcode
    fi
  done
}

# Usage
retry_with_backoff curl -f https://api.example.com/health
```

---

## Logging Protocol

### Overview

Structured JSON logging with correlation IDs, trace IDs, and consistent formatting for observability.

### Log Entry Structure (v1.0)

```typescript
interface LogEntry {
  // Timestamp
  timestamp: string;               // ISO 8601 with milliseconds

  // Levels: DEBUG, INFO, WARN, ERROR, FATAL
  level: LogLevel;

  // Identification
  correlationId: string;           // Request trace ID
  traceId: string;                 // Parent trace
  source: string;                  // Component generating log

  // Message
  message: string;                 // Human-readable message

  // Context
  context: {
    taskId?: string;
    agentId?: string;
    phase?: string;
    operation?: string;
  };

  // Structured data
  data?: Record<string, any>;

  // Error information (if applicable)
  error?: {
    code: string;
    message: string;
    stack?: string;
  };

  // Performance metrics
  metrics?: {
    duration?: number;             // Milliseconds
    memoryUsage?: number;          // Bytes
    itemsProcessed?: number;
  };
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
```

### Log Levels

```
DEBUG:  Detailed diagnostic information (development only)
INFO:   General informational messages
WARN:   Warning conditions (recoverable issues)
ERROR:  Error conditions (non-fatal failures)
FATAL:  Fatal errors (process termination)
```

### Logging Examples

**TypeScript/JavaScript:**
```typescript
interface Logger {
  debug(message: string, data?: Record<string, any>): void;
  info(message: string, data?: Record<string, any>): void;
  warn(message: string, data?: Record<string, any>): void;
  error(message: string, error?: Error, data?: Record<string, any>): void;
  fatal(message: string, error?: Error): void;
}

// Usage
logger.info('Agent spawning initiated', {
  taskId: 'task-001',
  agentId: 'agent-backend-dev',
  agentType: 'backend-developer'
});

logger.error('Agent execution failed', error, {
  taskId: 'task-001',
  agentId: 'agent-backend-dev',
  phase: 'execution',
  retryCount: 2
});
```

**Bash:**
```bash
# Log function
log_structured() {
  local level=$1
  local message=$2
  local correlation_id=${CORRELATION_ID:-}
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)

  # Create JSON log entry
  local log_entry=$(jq -n \
    --arg timestamp "$timestamp" \
    --arg level "$level" \
    --arg message "$message" \
    --arg correlationId "$correlation_id" \
    --arg source "${AGENT_ID:-system}" \
    '{timestamp, level, message, correlationId, source}')

  echo "$log_entry" >&2
}

# Usage
log_structured "INFO" "Agent spawning initiated"
log_structured "ERROR" "Database connection failed"
```

### Log Aggregation

```yaml
# Elasticsearch/Kibana Configuration
index_pattern: "cfn-logs-{YYYY}.{MM}.{DD}"
retention_period: 30_days

# Field mapping
mappings:
  properties:
    timestamp:
      type: "date"
    level:
      type: "keyword"
    source:
      type: "keyword"
    correlationId:
      type: "keyword"
    message:
      type: "text"
    error.code:
      type: "keyword"
```

---

## API Contracts

### Overview

Formal interface definitions for all system components using TypeScript interfaces and Bash function signatures.

### Core API Categories

```
1. Agent Lifecycle APIs      → Spawn, execute, complete
2. Coordination APIs         → Lock, wake, signal
3. Storage APIs              → Read, write, query
4. Monitoring APIs           → Health, metrics, alerts
5. Configuration APIs        → Get, set, validate
```

### Agent Lifecycle API (v1.0)

```typescript
// Agent spawn request
interface SpawnAgentRequest {
  agentType: string;              // e.g., "backend-developer"
  taskId: string;                 // Parent task ID
  parameters: {
    skill?: string;               // Primary skill
    task: string;                 // Task description
    context?: Record<string, any>; // Additional context
  };
  environment?: Record<string, string>;
  timeout?: number;               // Milliseconds
  priority?: 'critical' | 'high' | 'normal' | 'low';
}

// Agent spawn response
interface SpawnAgentResponse {
  agentId: string;                // UUID for spawned agent
  taskId: string;
  startTime: string;              // ISO 8601
  processId?: number;             // System PID (if CLI mode)
  status: 'spawned' | 'failed';
  error?: StandardError;
}

// Agent completion notification
interface AgentCompletion {
  agentId: string;
  taskId: string;
  decision: 'PROCEED' | 'ITERATE' | 'ABORT';
  confidence: number;             // 0.0 - 1.0
  deliverables: string[];         // File paths
  metrics: {
    duration: number;             // Milliseconds
    filesCreated?: number;
    filesModified?: number;
    linesOfCode?: number;
    testCoverage?: number;
  };
  summary: string;
  endTime: string;                // ISO 8601
}
```

**Bash Function Signatures:**

```bash
# Spawn agent function
# Usage: spawn_agent --agent-type TYPE --task-id ID --task DESCRIPTION [--priority LEVEL]
# Returns: Agent ID on success, error message on failure
spawn_agent() {
  local agent_type=""
  local task_id=""
  local task=""
  local priority="normal"

  while [[ $# -gt 0 ]]; do
    case $1 in
      --agent-type) agent_type="$2"; shift 2 ;;
      --task-id) task_id="$2"; shift 2 ;;
      --task) task="$2"; shift 2 ;;
      --priority) priority="$2"; shift 2 ;;
      *) echo "Unknown option: $1" >&2; return 1 ;;
    esac
  done

  [[ -z "$agent_type" || -z "$task_id" || -z "$task" ]] && return 1

  # Implementation...
}

# Health check function
# Usage: check_agent_health --agent-id ID
# Returns: JSON with status, metrics
check_agent_health() {
  local agent_id=$1
  # Implementation...
  echo '{"status":"healthy","uptime":12345}'
}

# Wait for agent completion
# Usage: wait_for_agent --agent-id ID --timeout SECONDS
# Returns: 0 on success, 1 on timeout
wait_for_agent() {
  local agent_id=$1
  local timeout=${2:-300}
  # Implementation...
}
```

### Coordination API (v1.0)

```typescript
// Lock acquisition
interface AcquireLockRequest {
  resourceId: string;             // Resource to lock
  ownerId: string;                // Who is locking it
  ttlSeconds: number;             // Lock expiration
  waitIfLocked?: boolean;         // Block until acquired
  timeoutSeconds?: number;        // Max wait time
}

// Signal/wake notification
interface SignalRequest {
  taskId: string;
  agentId?: string;               // Target agent (optional)
  signalType: 'wake' | 'proceed' | 'iterate' | 'abort' | 'heartbeat';
  data?: Record<string, any>;
  priority?: 'critical' | 'normal';
}

// Gate check
interface GateCheckRequest {
  iteration: number;
  phase: 'loop3' | 'loop2';
  threshold: number;              // Minimum confidence
  scores: Array<{
    agentId: string;
    confidence: number;
  }>;
}

interface GateCheckResponse {
  passed: boolean;
  overallConfidence: number;
  reason: string;
  failedAgents?: string[];
}
```

**Bash Function Signatures:**

```bash
# Acquire distributed lock
# Usage: acquire_lock --resource-id ID --owner-id OWNER [--ttl SECONDS]
# Returns: Lock ID on success, empty string on failure
acquire_lock() {
  local resource_id=$1
  local owner_id=$2
  local ttl=${3:-300}
  # Implementation...
}

# Release distributed lock
# Usage: release_lock --lock-id ID
# Returns: 0 on success, 1 on failure
release_lock() {
  local lock_id=$1
  # Implementation...
}

# Send wake signal to agent
# Usage: signal_agent --agent-id ID --signal-type TYPE [--data JSON]
# Returns: 0 on success, 1 on failure
signal_agent() {
  local agent_id=$1
  local signal_type=$2
  local data=${3:-}
  # Implementation...
}
```

### Storage API (v1.0)

```typescript
// Read operation
interface ReadRequest {
  storage: 'redis' | 'sqlite' | 'file';
  key: string;
  format?: 'json' | 'raw' | 'text';
}

interface ReadResponse<T = any> {
  key: string;
  value?: T;
  exists: boolean;
  metadata?: {
    createdAt: string;
    updatedAt: string;
    ttl?: number;
    version?: string;
  };
}

// Write operation
interface WriteRequest<T = any> {
  storage: 'redis' | 'sqlite' | 'file';
  key: string;
  value: T;
  ttl?: number;                   // Seconds (Redis only)
  atomic?: boolean;               // Atomic write (file only)
  backup?: boolean;               // Create backup (file only)
}

interface WriteResponse {
  key: string;
  status: 'written' | 'updated';
  version?: string;
  checksum?: string;
}

// Query operation
interface QueryRequest {
  storage: 'redis' | 'sqlite' | 'file';
  pattern?: string;               // Glob or SQL pattern
  filter?: Record<string, any>;   // Filter criteria
  limit?: number;
  offset?: number;
}

interface QueryResponse<T = any> {
  results: T[];
  totalCount: number;
  hasMore: boolean;
}
```

**Bash Function Signatures:**

```bash
# Read from storage
# Usage: storage_read --storage TYPE --key KEY [--format FORMAT]
# Returns: Value as JSON to stdout
storage_read() {
  local storage=$1
  local key=$2
  local format=${3:-json}
  # Implementation...
}

# Write to storage with atomic guarantee
# Usage: storage_write --storage TYPE --key KEY --value VALUE [--ttl SECONDS]
# Returns: 0 on success, 1 on failure
storage_write() {
  local storage=$1
  local key=$2
  local value=$3
  local ttl=${4:-}
  # Implementation...
}

# Query storage
# Usage: storage_query --storage TYPE --pattern PATTERN [--limit N]
# Returns: JSON array of results
storage_query() {
  local storage=$1
  local pattern=$2
  local limit=${3:-100}
  # Implementation...
}
```

---

## Database Handoff Protocol

### Overview

Standardized patterns for data exchange between Redis, SQLite, and file storage with correlation keys and eventual consistency.

### Correlation Key Strategy

All data is tracked using a universal **correlation key** hierarchy:

```
Task Level:     task:{task_id}:{entity_type}
Agent Level:    task:{task_id}:agent:{agent_id}:{entity_type}
Resource Level: task:{task_id}:agent:{agent_id}:resource:{resource_id}:{type}
```

**Examples:**
```
task:task-001:agents
task:task-001:agent:agent-backend-dev-uuid:status
task:task-001:agent:agent-backend-dev-uuid:deliverables
task:task-001:agent:agent-backend-dev-uuid:resource:file-123:metadata
```

### Cross-Database Query Pattern

```typescript
// Query across databases
interface CrossDatabaseQuery {
  correlationKey: string;         // Universal lookup key
  sources: Array<{
    storage: 'redis' | 'sqlite' | 'file';
    pattern: string;              // Storage-specific pattern
    priority: number;             // Query priority
  }>;

  // How to handle missing data
  fallback: {
    strategy: 'use_cache' | 'use_latest' | 'merge' | 'fail';
    maxAge?: number;              // Maximum acceptable age in seconds
  };
}

// Result merging strategy
interface MergeStrategy {
  conflictResolution: 'latest_write' | 'highest_confidence' | 'consensus';
  includeMetadata: boolean;
  validateConsistency: boolean;
}
```

**Query Execution Flow:**
```
1. Generate correlation key from task_id/agent_id
2. Query Redis (fast, in-memory cache)
   └─ If found: return immediately
   └─ If not found: continue
3. Query SQLite (persistent store)
   └─ If found: write to Redis (re-cache)
   └─ If not found: continue
4. Query file system (last resort)
   └─ If found: persist to SQLite and Redis
5. Fallback strategy if not found anywhere
   └─ Use cache, fail, or return default
```

### Transaction Boundaries

```typescript
interface TransactionBoundary {
  // Atomic operations within task
  taskLevel: {
    begins: 'agent spawn';
    commits: 'all agents complete';
    rollback: 'iteration triggered or task abort';
  };

  // Isolation levels
  isolation: {
    agentData: 'serializable',      // Agent to agent: no interference
    sharedData: 'read_committed',   // Task level: eventual consistency
    metadata: 'read_uncommitted'    // For monitoring only
  };
}
```

**Transaction Example:**
```sql
-- Begin task transaction
BEGIN TRANSACTION;

-- Phase 1: Initialize
INSERT INTO tasks (id, status, created_at)
  VALUES ('task-001', 'initializing', NOW());

-- Phase 2: Agent operations (may update same rows)
INSERT INTO agent_executions (task_id, agent_id, status)
  VALUES ('task-001', 'agent-1', 'running');

-- Phase 3: Completion
UPDATE tasks SET status = 'completed' WHERE id = 'task-001';

-- Commit or rollback based on agent decisions
COMMIT; -- or ROLLBACK;
```

### Eventual Consistency Pattern

```typescript
// Handling inconsistent state across systems
interface EventualConsistencyHandler {
  // Tolerate temporary inconsistency
  maxInconsistencyWindowSeconds: number;

  // Verify consistency periodically
  consistencyCheck: {
    enabled: boolean;
    intervalSeconds: number;
    action: 'repair' | 'alert' | 'ignore';
  };

  // Conflict resolution
  conflictResolver: (
    redisData: any,
    sqliteData: any,
    fileData: any
  ) => any;  // Returns authoritative version
}
```

---

## File Operation Protocol

### Overview

Atomic file operations with backup/restore, content hashing, and safe concurrent access.

### Atomic Write Pattern

All file writes follow the **write-then-move** pattern:

```bash
# Atomic write function
atomic_write() {
  local target_file=$1
  local content=$2
  local backup_enabled=${3:-true}

  # Step 1: Create temporary file in same directory
  local temp_file="${target_file}.tmp.$$"
  echo "$content" > "$temp_file" || return 1

  # Step 2: Calculate checksum
  local expected_hash=$(echo "$content" | sha256sum | cut -d' ' -f1)
  local actual_hash=$(sha256sum < "$temp_file" | cut -d' ' -f1)
  [[ "$expected_hash" != "$actual_hash" ]] && return 1

  # Step 3: Backup existing file (if enabled)
  if [[ -f "$target_file" && "$backup_enabled" == "true" ]]; then
    local backup_file="${target_file}.backup.$(date +%s)"
    cp "$target_file" "$backup_file" || return 1
  fi

  # Step 4: Move atomic (single filesystem operation)
  mv "$temp_file" "$target_file" || return 1

  # Step 5: Verify final state
  [[ -f "$target_file" ]] && return 0
  return 1
}
```

### File Locking Strategy

```typescript
interface FileLock {
  filePath: string;
  ownerId: string;                // Agent or process ID
  acquiredAt: string;             // ISO 8601
  expiresAt: string;              // Auto-release timeout

  // Lock state
  status: 'acquired' | 'waiting' | 'expired';
  waitingQueue?: string[];        // Other processes waiting
}

// Lock mechanism
interface FileLockManager {
  acquire(file: string, owner: string, ttl: number): Promise<boolean>;
  release(file: string, owner: string): Promise<boolean>;
  waitFor(file: string, timeout: number): Promise<boolean>;
  forceRelease(file: string): Promise<void>; // Admin only
}
```

**Bash Lock Implementation:**
```bash
# Acquire file lock
acquire_file_lock() {
  local file=$1
  local owner=$2
  local timeout=${3:-300}
  local lock_file="${file}.lock"

  local elapsed=0
  while [[ -f "$lock_file" && $elapsed -lt $timeout ]]; do
    sleep 1
    elapsed=$((elapsed + 1))
  done

  [[ -f "$lock_file" && $elapsed -ge $timeout ]] && return 1

  echo "$owner" > "$lock_file" || return 1
  return 0
}

# Release file lock
release_file_lock() {
  local file=$1
  local lock_file="${file}.lock"
  rm -f "$lock_file"
}
```

### Backup/Restore Protocol

```typescript
interface BackupProtocol {
  // Backup on write
  createBackup: {
    enabled: boolean;
    location: string;             // e.g., ".backups/{agent-id}/{timestamp}/"
    retention: {
      count: number;              // Keep last N backups
      ageSeconds: number;         // Keep backups newer than X seconds
    };
  };

  // Restore from backup
  restore: {
    strategy: 'latest' | 'by_timestamp' | 'by_hash';
    verify: boolean;              // Verify restored content
    maxRestore: number;           // Max restores per hour
  };
}

// Backup entry structure
interface BackupEntry {
  id: string;                     // UUID
  originalFile: string;
  backupPath: string;
  timestamp: string;              // ISO 8601
  agentId: string;                // Who created backup
  originalHash: string;           // SHA256
  size: number;                   // Bytes
  compression: 'none' | 'gzip';
}
```

### Content Hashing

All files use **SHA256** for integrity verification:

```bash
# Content hash function
get_file_hash() {
  local file=$1
  sha256sum "$file" | cut -d' ' -f1
}

# Verify file integrity
verify_file_integrity() {
  local file=$1
  local expected_hash=$2

  local actual_hash=$(get_file_hash "$file")
  [[ "$actual_hash" == "$expected_hash" ]] && return 0
  return 1
}
```

---

## Agent Communication Protocol

### Overview

Standardized lifecycle for agent spawning, execution monitoring, and completion signaling.

### Agent Spawn Protocol (v1.0)

```typescript
interface AgentSpawnRequest {
  // Identity
  agentType: string;              // e.g., "backend-developer"
  agentId?: string;               // Pre-assigned ID (optional)

  // Context
  taskId: string;
  iteration: number;
  phase: 'initialization' | 'execution' | 'validation';

  // Specification
  specification: {
    skill?: string;
    task: string;
    context?: Record<string, any>;
    constraints?: {
      maxDuration?: number;       // Milliseconds
      maxTokens?: number;
      maxIterations?: number;
    };
  };

  // Environment
  environment: {
    MODE: 'cli' | 'task';
    DEBUG?: 'true' | 'false';
    TASK_ID: string;
    AGENT_ID: string;
    // Custom variables
    [key: string]: string;
  };

  // Lifecycle
  lifecycle: {
    timeout: number;              // Milliseconds
    priority: 'critical' | 'high' | 'normal' | 'low';
    heartbeatInterval?: number;   // Seconds
    retryOnFailure?: boolean;
  };
}

interface AgentSpawnResponse {
  agentId: string;
  taskId: string;
  startTime: string;              // ISO 8601
  processId?: number;             // CLI mode
  status: 'spawned' | 'failed';
  error?: StandardError;
}
```

### Agent Execution Monitoring

```typescript
interface AgentHeartbeat {
  agentId: string;
  taskId: string;
  timestamp: string;              // ISO 8601
  status: 'running' | 'idle' | 'blocked';
  phase: string;
  progress: {
    percentComplete?: number;     // 0-100
    currentStep?: string;
    estimatedTimeRemaining?: number; // Seconds
  };
  resources: {
    cpuUsage?: number;            // Percent
    memoryUsage?: number;          // MB
    openFiles?: number;
  };
}

interface AgentExecution {
  agentId: string;
  taskId: string;
  startTime: string;
  endTime?: string;
  duration?: number;              // Milliseconds
  status: 'running' | 'succeeded' | 'failed' | 'timeout' | 'cancelled';
  phase: string;

  // Execution metrics
  metrics: {
    filesCreated?: number;
    filesModified?: number;
    linesOfCode?: number;
    testCases?: number;
    testsPassed?: number;
    coverage?: number;             // Percent
  };
}
```

### Agent Completion Protocol

```typescript
interface AgentCompletionSignal {
  // Required
  agentId: string;
  taskId: string;
  decision: 'PROCEED' | 'ITERATE' | 'ABORT';
  confidence: number;             // 0.0 - 1.0, must be ≥ gate threshold

  // Work summary
  summary: string;                // 100-500 characters
  deliverables: string[];         // File paths (absolute)

  // Metrics
  metrics: {
    duration: number;             // Milliseconds
    filesCreated?: number;
    filesModified?: number;
    linesOfCode?: number;
    testCoverage?: number;
  };

  // Context
  completionTime: string;         // ISO 8601
  phase: string;
  iteration: number;

  // Optional
  reasoning?: string;             // Why this decision
  issues?: Array<{
    severity: 'info' | 'warning' | 'error';
    message: string;
  }>;
}

interface CompletionAckResponse {
  agentId: string;
  taskId: string;
  decision: 'PROCEED' | 'ITERATE' | 'ABORT';
  nextAction?: string;            // What happens next
  feedbackForAgent?: string;      // Feedback on this iteration
  timestamp: string;
}
```

### Timeout Handling

```typescript
interface TimeoutPolicy {
  // Hard timeout - agent must stop
  hardTimeout: number;            // Milliseconds

  // Soft timeout - warning, allow graceful shutdown
  softTimeout: number;            // Milliseconds (≈ 80% of hard)

  // Recovery actions
  onSoftTimeout: 'warn' | 'checkpoint' | 'interrupt';
  onHardTimeout: 'kill' | 'checkpoint_then_kill';

  // Timeout grace period
  gracePeriod: number;            // Milliseconds to save state
}
```

---

## Sequence Diagrams

### CFN Loop Execution Flow

```
Agent Spawning
==============

Main Chat                CLI Spawner              Agent              Coordinator
   |                        |                       |                    |
   |-- Spawn Request ------->|                       |                    |
   |                        |-- Envelope Validate -->|                    |
   |                        |                       |-- Start Exec ------>|
   |                        |<-- Spawn Response -----|                    |
   |<-- Spawn Response ------|                       |                    |
   |                        |                       |-- Heartbeat ------->|
   |                        |                       |  (periodic)         |
   |                        |                       |-- Completion ------>|
   |                        |                       |  Signal             |
```

### Error Recovery Flow

```
Agent Execution with Retry
===========================

Agent              Storage         Error Handler        Retry Queue
  |                   |                  |                   |
  |-- Write -------->  |                  |                   |
  |                   |-- Error -------->  |                   |
  |                   |                  |-- Check Policy -->  |
  |                   |                  |  (Retryable?)      |
  |                   |                  |-- Retry ----->     |
  |                   |                  |                   |
  |<-- Wake Signal ----|<-- Wake Result ----|<-- Dequeue ----|
  |-- Retry Write -->  |
  |                   |-- Success ------>  |
  |                   |                  |-- Mark Complete   |
```

### Database Consistency Check

```
Eventual Consistency Verification
==================================

Consistency         Redis      SQLite       File      Resolver
Checker             Store      DB           System
  |                  |          |           |          |
  |-- Query -------->|          |           |          |
  |                 |-- Result  |           |          |
  |-- Query -------->|          |           |          |
  |                 |-- Result  |           |          |
  |-- Query -------->|          |           |          |
  |                 |-- Result  |           |          |
  |-- Merge Results -------->   |           |          |
  |                            |-- Resolve -------->   |
  |                            |<-- Authoritative ---  |
  |<-- Verified State ---------|           |           |
```

---

## Implementation Examples

### Example 1: Standard Data Envelope Creation (TypeScript)

```typescript
import { v4 as uuidv4 } from 'uuid';

function createEnvelope<T>(
  payload: T,
  options: {
    source: string;
    destination?: string;
    taskId: string;
    agentId: string;
    operationType: 'request' | 'response' | 'event';
    priority?: 'critical' | 'high' | 'normal' | 'low';
  }
): DataEnvelope<T> {
  const correlationId = options.destination ? uuidv4() : undefined;

  return {
    metadata: {
      timestamp: new Date().toISOString(),
      source: options.source,
      destination: options.destination,
      correlationId: correlationId || uuidv4(),
      traceId: process.env.TRACE_ID || uuidv4(),
      sessionId: options.taskId
    },
    control: {
      version: '1.0.0',
      schemaVersion: '1.0.0',
      operationType: options.operationType,
      priority: options.priority || 'normal',
      idempotencyKey: uuidv4()
    },
    tracking: {
      taskId: options.taskId,
      agentId: options.agentId,
      phase: 'execution',
      retryCount: 0
    },
    payload,
    status: {
      success: true,
      code: '200'
    }
  };
}
```

### Example 2: Atomic File Write (Bash)

```bash
#!/bin/bash
set -euo pipefail

# Atomic write with backup
atomic_write_with_backup() {
  local target=$1
  local content=$2
  local agent_id=${AGENT_ID:-system}

  # Backup function
  backup_file() {
    local file=$1
    [[ ! -f "$file" ]] && return 0

    local backup_dir=".backups/${agent_id}/$(date +%s)"
    mkdir -p "$backup_dir"
    cp "$file" "$backup_dir/$(basename "$file")"
    echo "Backup created: $backup_dir"
  }

  # Write function
  local temp_file="${target}.tmp.$$"

  # Create temp file
  echo "$content" > "$temp_file"

  # Verify write
  local actual_size=$(wc -c < "$temp_file")
  local expected_size=$(echo -n "$content" | wc -c)

  if [[ $actual_size -ne $expected_size ]]; then
    rm -f "$temp_file"
    echo "Write verification failed" >&2
    return 1
  fi

  # Backup existing
  backup_file "$target"

  # Atomic move
  mv "$temp_file" "$target"

  echo "File written: $target"
  return 0
}

# Usage
atomic_write_with_backup "/path/to/file.txt" "new content"
```

### Example 3: Structured Error Handling (TypeScript)

```typescript
class ProtocolError extends Error {
  constructor(
    public code: string,
    public category: string,
    message: string,
    public context: Record<string, any> = {}
  ) {
    super(message);
  }

  toEnvelope(): DataEnvelope<StandardError> {
    return {
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'error-handler',
        correlationId: this.context.correlationId || uuidv4(),
        traceId: this.context.traceId || uuidv4(),
        sessionId: this.context.taskId
      },
      control: {
        version: '1.0.0',
        schemaVersion: '1.0.0',
        operationType: 'event',
        priority: this.category === 'CRITICAL' ? 'critical' : 'normal'
      },
      tracking: {
        taskId: this.context.taskId || 'unknown',
        agentId: this.context.agentId || 'unknown',
        phase: this.context.phase || 'unknown',
        retryCount: this.context.retryCount || 0
      },
      payload: {
        id: uuidv4(),
        code: this.code,
        category: this.category,
        message: this.message,
        details: this.context,
        context: {
          componentId: 'error-handler',
          timestamp: new Date().toISOString(),
          operationId: this.context.operationId || 'unknown',
          phase: this.context.phase || 'unknown'
        },
        recovery: {
          retryable: this.isRetryable(),
          fallbackAction: this.getFallback(),
          estimatedRecoveryTime: 5
        }
      },
      status: {
        success: false,
        code: this.getHttpCode(),
        message: this.message
      }
    };
  }

  private isRetryable(): boolean {
    const retryableCategories = ['DATABASE', 'NETWORK', 'TIMEOUT'];
    return retryableCategories.includes(this.category);
  }

  private getFallback(): string {
    const fallbacks: Record<string, string> = {
      'DB-001': 'use_cache',
      'NET-002': 'exponential_backoff',
      'TIMEOUT-001': 'circuit_breaker'
    };
    return fallbacks[this.code] || 'manual_intervention';
  }

  private getHttpCode(): string {
    const mapping: Record<string, string> = {
      'DATABASE': '503',
      'NETWORK': '502',
      'VALIDATION': '400',
      'TIMEOUT': '408'
    };
    return mapping[this.category] || '500';
  }
}
```

### Example 4: Structured Logging (Bash)

```bash
#!/bin/bash

# Structured logging
log_json() {
  local level=$1
  local message=$2
  shift 2

  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  local correlation_id=${CORRELATION_ID:-}
  local agent_id=${AGENT_ID:-system}

  # Build JSON
  local log_json=$(jq -n \
    --arg timestamp "$timestamp" \
    --arg level "$level" \
    --arg message "$message" \
    --arg correlationId "$correlation_id" \
    --arg source "$agent_id" \
    --arg taskId "${TASK_ID:-}" \
    --arg phase "${PHASE:-}" \
    '{timestamp, level, message, correlationId, source, taskId, phase}')

  # Add extra fields if provided
  while [[ $# -gt 0 ]]; do
    local key=$1
    local value=$2
    log_json=$(echo "$log_json" | jq --arg k "$key" --arg v "$value" '.[$k] = $v')
    shift 2
  done

  echo "$log_json" >&2
}

# Usage examples
log_json "INFO" "Agent spawning" agentType "backend-developer" priority "high"
log_json "ERROR" "Database connection failed" errorCode "DB-001" retryCount "2"
log_json "WARN" "Memory usage high" memoryUsageMB "512" threshold "400"
```

### Example 5: Database Handoff (SQLite/Bash)

```bash
#!/bin/bash
set -euo pipefail

# Database paths
REDIS_DB="redis://localhost:6379/0"
SQLITE_DB="${HOME}/.claude/memory/cfn-loop.db"

# Cross-database query
cross_db_query() {
  local correlation_key=$1
  local entity_type=$2

  local entity_json=""

  # Step 1: Try Redis (fast)
  entity_json=$(redis-cli -u "$REDIS_DB" GET "$correlation_key" 2>/dev/null) || true

  if [[ -n "$entity_json" && "$entity_json" != "nil" ]]; then
    echo "$entity_json"
    return 0
  fi

  # Step 2: Query SQLite (persistent)
  entity_json=$(sqlite3 "$SQLITE_DB" \
    "SELECT json_object('data', data, 'updated_at', updated_at)
     FROM entities
     WHERE correlation_key = '$correlation_key'
     LIMIT 1" 2>/dev/null) || true

  if [[ -n "$entity_json" ]]; then
    # Re-cache in Redis
    redis-cli -u "$REDIS_DB" SET "$correlation_key" "$entity_json" EX 300 >/dev/null 2>&1 || true
    echo "$entity_json"
    return 0
  fi

  # Step 3: Not found
  echo "null"
  return 1
}

# Write with consistency
write_with_consistency() {
  local correlation_key=$1
  local entity_json=$2
  local agent_id=${AGENT_ID:-}

  # Write to SQLite first (source of truth)
  sqlite3 "$SQLITE_DB" <<EOF
  INSERT OR REPLACE INTO entities
    (correlation_key, data, agent_id, updated_at)
  VALUES
    ('$correlation_key', '$entity_json', '$agent_id', datetime('now'));
EOF

  # Update Redis cache
  redis-cli -u "$REDIS_DB" SET "$correlation_key" "$entity_json" EX 300 >/dev/null 2>&1 || true

  echo "Written successfully"
}
```

---

## Migration Strategy

### Phase 1: Assessment (Week 1-2)

1. **Catalog current patterns** in each component:
   - How data is exchanged
   - Error handling approach
   - Logging format
   - File operations

2. **Identify non-conforming patterns:**
   - Missing correlation IDs
   - Inconsistent error codes
   - Ad-hoc retry logic
   - Unstructured logs

3. **Create compatibility matrix:**
   - Which components need updates
   - Estimated effort per component
   - Dependencies between components

### Phase 2: Implementation (Week 3-8)

**Priority Order:**

1. **Core Protocols** (Week 3)
   - Implement `DataEnvelope` in all TypeScript/Node code
   - Add envelope validation middleware
   - Update configuration format

2. **Error Handling** (Week 4)
   - Create `StandardError` class
   - Implement retry policies
   - Create fallback strategies

3. **Logging** (Week 5)
   - Update all log statements to structured format
   - Add correlation ID tracking
   - Configure log aggregation

4. **API Contracts** (Week 5-6)
   - Document all public APIs
   - Create TypeScript interfaces
   - Add Bash function signatures

5. **Database Integration** (Week 6-7)
   - Implement correlation key strategy
   - Add cross-database query functions
   - Create consistency checks

6. **File Operations** (Week 7)
   - Implement atomic writes
   - Add file locking
   - Create backup/restore functions

7. **Agent Communication** (Week 8)
   - Implement spawn protocol
   - Add execution monitoring
   - Create completion signaling

### Phase 3: Validation (Week 9-10)

1. **Unit testing:** Test each protocol independently
2. **Integration testing:** Test protocol interactions
3. **Performance testing:** Verify no degradation
4. **Backward compatibility:** Ensure existing code still works

### Phase 4: Rollout (Week 11-12)

1. **Documentation:** Create operator guides
2. **Training:** Educate team on new patterns
3. **Gradual rollout:** Enable one component at a time
4. **Monitoring:** Track adoption and issues
5. **Feedback:** Gather team feedback for improvements

### Migration Checklist

**For each component:**
- [ ] Add protocol version support
- [ ] Implement DataEnvelope creation
- [ ] Add error handling with StandardError
- [ ] Update logging to structured format
- [ ] Implement retry policies
- [ ] Add correlation ID tracking
- [ ] Update API documentation
- [ ] Create/update tests
- [ ] Validate backward compatibility
- [ ] Update operator runbook

---

## Protocol Governance

### Change Management

All protocol changes require:

1. **Proposal:** RFC with rationale and examples
2. **Review:** Architecture team consensus (≥0.75 confidence)
3. **Test:** Comprehensive test coverage
4. **Documentation:** Updated examples and migration guide
5. **Rollout:** Phased implementation with monitoring

### Versioning Rules

- **Major version:** Only when breaking changes are necessary
- **Minor version:** When adding new optional fields
- **Patch version:** Bug fixes only, no new functionality
- **Deprecation period:** 6 months minimum before removal

### Monitoring & Observability

All protocol implementation includes:

```typescript
interface ProtocolMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;         // Milliseconds
  p95Latency: number;
  p99Latency: number;
  errorRate: number;              // Percent
  retryRate: number;
  timeout: number;
}
```

---

## Conclusion

These standardized integration protocols provide the foundation for robust, maintainable, and observable distributed agent coordination in Claude Flow Novice. By following these patterns, teams can:

- **Reduce complexity** through consistent interfaces
- **Improve reliability** via standardized error handling
- **Enable observability** through structured logging and tracing
- **Support scalability** with protocol versioning and gradual migration

The migration from ad-hoc patterns to these standards should be phased over 12 weeks, with careful validation at each step to ensure backward compatibility and system stability.

---

## Appendix: Quick Reference

### Correlation ID Generation
```bash
CORRELATION_ID=$(uuidgen)  # macOS/Linux
CORRELATION_ID=$(python3 -c "import uuid; print(uuid.uuid4())")  # Cross-platform
```

### Error Code Format
```
CATEGORY-NNN
- CATEGORY: DB, FILE, NET, VAL, TIMEOUT, etc.
- NNN: 001-999 unique error number
```

### Log Level Hierarchy
```
FATAL > ERROR > WARN > INFO > DEBUG
```

### Storage Priorities
```
Redis (fastest) → SQLite (persistent) → File (slow)
```

### Gate Thresholds
```
MVP:        ≥0.70 confidence
Standard:   ≥0.75 confidence
Enterprise: ≥0.85 confidence
```
