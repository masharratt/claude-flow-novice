# Quick Start Guide

**Version:** 1.0
**Last Updated:** 2025-11-16
**Status:** Complete

## Get Up and Running in 15 Minutes

This guide gets you from zero to working integration in under 15 minutes.

---

## Step 1: Install (2 minutes)

```bash
# Install the standardized system
npm install claude-flow-novice

# Initialize databases
npm run init:database -- --name primary

# Start services
npm run start:services
```

Verify services are running:
```bash
curl http://localhost:8000/health
curl http://localhost:8001/health
```

---

## Step 2: Register Your First Schema (2 minutes)

Before querying, define what data looks like:

```typescript
import { databaseService } from 'claude-flow-novice';

// Register schema
await databaseService.registerSchema({
  schema_id: "users-v1",
  schema_version: 1,
  source_database: "primary",
  fields: [
    {
      name: "id",
      type: "string",
      required: true,
      description: "User ID"
    },
    {
      name: "email",
      type: "string",
      required: true,
      description: "Email address"
    },
    {
      name: "status",
      type: "enum",
      enum_values: ["active", "inactive", "suspended"],
      required: true
    }
  ]
});

console.log("✓ Schema registered");
```

---

## Step 3: Insert Your First Record (2 minutes)

```typescript
// Insert with automatic validation
const response = await databaseService.query({
  correlation_key: `quickstart-001:iter-1:${Date.now()}`,
  operation: "insert",
  table: "users",
  schema: "users-v1",
  values: {
    id: "user-123",
    email: "alice@example.com",
    status: "active"
  }
});

console.log(response.status);  // "success"
console.log(response.result);  // {affected_rows: 1}
```

---

## Step 4: Query Your Data (2 minutes)

```typescript
// Query with automatic caching
const response = await databaseService.query({
  correlation_key: `quickstart-002:iter-1:${Date.now()}`,
  operation: "select",
  table: "users",
  schema: "users-v1",
  filters: {
    status: "active"
  },
  options: {
    cache_ttl_seconds: 300  // Cache for 5 minutes
  }
});

console.log(response.result.rows);        // Array of users
console.log(response.metadata.from_cache); // true/false
```

---

## Step 5: Coordinate Between Agents (3 minutes)

```typescript
import { coordinationManager } from 'claude-flow-novice';

// Agent 1: Wait for Agent 2
const waitResponse = await coordinationManager.wait({
  agent_id: "agent-1",
  topic: "quickstart:agent-2:ready",
  timeout_seconds: 60
});

console.log(waitResponse.status);  // "signaled" or "timeout"
```

In a separate process (Agent 2):

```typescript
// Agent 2: Signal readiness
await coordinationManager.broadcastSignal({
  signal_type: "broadcast",
  topic: "quickstart:agent-2:ready",
  agents: ["agent-1"],
  message: {
    status: "ready",
    timestamp: new Date().toISOString()
  }
});

console.log("✓ Signal sent");
```

---

## Step 6: Store an Artifact (2 minutes)

```typescript
import { artifactStorage } from 'claude-flow-novice';

// Store document
const response = await artifactStorage.storeArtifact({
  correlation_key: `quickstart-003:iter-1:${Date.now()}`,
  artifact_name: "analysis-report",
  artifact_type: "document",
  content: "# Analysis Report\n\nKey findings: ...",
  format: "markdown",
  metadata: {
    created_by: "agent-1",
    tags: ["important"]
  }
});

console.log(response.artifact_info.version);  // 1
```

Retrieve artifact:
```typescript
// Get latest version
const artifact = await artifactStorage.retrieveArtifact({
  artifact_name: "analysis-report",
  version: "latest"
});

console.log(artifact.content);  // Markdown content
```

---

## Step 7: Run a Skill (2 minutes)

Create a skill file `analyze-data.sh`:

```bash
#!/bin/bash
# SKILL_NAME: "analyze-data"
# SKILL_VERSION: "1.0"
# REQUIRED_ENVIRONMENT: ["DATA_PATH"]
# OUTPUT_FORMAT: "json"

set -euo pipefail

# Read and analyze data
DATA_PATH="${DATA_PATH:-.}"
LINE_COUNT=$(wc -l < "$DATA_PATH")

# Return JSON
cat <<EOF
{
  "status": "success",
  "result": {
    "lines": $LINE_COUNT,
    "analysis_time_ms": 42
  }
}
EOF
```

Execute the skill:

```typescript
import { skillDeployment } from 'claude-flow-novice';

const response = await skillDeployment.executeSkill({
  correlation_key: `quickstart-004:iter-1:${Date.now()}`,
  skill_name: "analyze-data",
  environment: {
    DATA_PATH: "/data/sample.txt"
  },
  timeout_seconds: 30
});

console.log(response.output.result);  // {lines: 1000, analysis_time_ms: 42}
```

---

## Common Patterns

### Pattern 1: Query with Error Handling

```typescript
try {
  const response = await databaseService.query({
    correlation_key: `op-001:iter-1:${Date.now()}`,
    operation: "select",
    table: "users",
    schema: "users-v1",
    filters: {status: "active"}
  });

  if (response.status === "success") {
    console.log(`Found ${response.result.rows.length} users`);
  } else {
    console.error("Query failed:", response.errors);
  }
} catch (error) {
  console.error("System error:", error);
}
```

### Pattern 2: Atomic Transaction

```typescript
const txn = await transactionManager.beginTransaction({
  transaction_type: "write",
  databases: ["primary"],
  timeout_seconds: 30
});

try {
  // Update user
  await txn.query({
    operation: "update",
    table: "users",
    filters: {id: "user-123"},
    values: {status: "inactive"}
  });

  // Update audit log
  await txn.query({
    operation: "insert",
    table: "audit_log",
    values: {
      user_id: "user-123",
      action: "deactivate",
      timestamp: new Date().toISOString()
    }
  });

  // Commit atomically
  await txn.commit();
  console.log("✓ User deactivated and logged");
} catch (error) {
  await txn.rollback();
  console.error("Transaction failed, rolled back");
}
```

### Pattern 3: Agent Consensus

```typescript
const consensus = await coordinationManager.collectConsensus({
  task_id: "feature-vote",
  validator_ids: ["validator-1", "validator-2", "validator-3"],
  consensus_type: "threshold",
  threshold: 0.90,  // Need 90% agreement
  timeout_seconds: 300
});

if (consensus.status === "passed") {
  console.log(`✓ Feature approved (${consensus.average_confidence * 100}% confidence)`);
  // Proceed with implementation
} else {
  console.log(`✗ Feature rejected (${consensus.average_confidence * 100}% confidence)`);
  // Stop implementation
}
```

---

## Next Steps

After completing this quick start:

1. **Deep Dive Documentation**:
   - [PROTOCOL_REFERENCE.md](./PROTOCOL_REFERENCE.md) - All protocols explained
   - [API_REFERENCE.md](./API_REFERENCE.md) - Complete API documentation
   - [INTEGRATION_FAQ.md](./INTEGRATION_FAQ.md) - Answers to common questions

2. **Operational Procedures**:
   - [OPERATIONAL_RUNBOOKS.md](./OPERATIONAL_RUNBOOKS.md) - Deploy, backup, monitor
   - [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md) - Debug issues

3. **Advanced Topics**:
   - [ARCHITECTURE_DECISION_RECORDS.md](./ARCHITECTURE_DECISION_RECORDS.md) - Why things work this way
   - [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Migrate from legacy system

---

## Troubleshooting Quick Start

### Service won't start

```bash
# Check if ports are in use
lsof -i :8000
lsof -i :8001

# Kill existing processes
pkill -f database-service
pkill -f coordination-manager

# Try starting again
npm run start:services
```

### Can't connect to database

```bash
# Verify database file exists
ls -la /data/

# Check SQLite is working
sqlite3 /data/primary.db "SELECT 1"

# See error logs
tail -f /var/log/cfn/error.log
```

### Schema validation fails

```bash
# List registered schemas
npm run list:schemas

# Verify your data matches schema
# Check field types and required fields
# Re-register schema if needed
await databaseService.registerSchema({...})
```

### Coordination timeout

```bash
# Check Redis is running
redis-cli ping

# Monitor Pub/Sub
redis-cli SUBSCRIBE "quickstart:*"

# Check if agent is waiting
# Increase timeout_seconds if agents are slow
```

---

## Quick Command Reference

| Task | Command |
|------|---------|
| Start services | `npm run start:services` |
| Initialize database | `npm run init:database` |
| List schemas | `npm run list:schemas` |
| Check health | `curl http://localhost:8000/health` |
| View logs | `tail -f /var/log/cfn/error.log` |
| Run tests | `npm test` |
| Stop services | `npm run stop:services` |

---

## Sample Code Templates

### Complete Node.js Example

```javascript
import {
  databaseService,
  coordinationManager,
  artifactStorage,
  skillDeployment
} from 'claude-flow-novice';

async function main() {
  const correlationKey = `quickstart:${Date.now()}`;

  // 1. Register schema
  await databaseService.registerSchema({
    schema_id: "demo-v1",
    schema_version: 1,
    source_database: "primary",
    fields: [{name: "id", type: "string", required: true}]
  });

  // 2. Insert data
  const insertResult = await databaseService.query({
    correlation_key: correlationKey,
    operation: "insert",
    table: "demo",
    values: {id: "test-1"}
  });
  console.log("Insert:", insertResult.status);

  // 3. Query data
  const queryResult = await databaseService.query({
    correlation_key: correlationKey,
    operation: "select",
    table: "demo"
  });
  console.log("Rows:", queryResult.result.row_count);

  // 4. Store artifact
  const artifactResult = await artifactStorage.storeArtifact({
    correlation_key: correlationKey,
    artifact_name: "demo",
    artifact_type: "document",
    content: "Demo content",
    format: "text"
  });
  console.log("Artifact v:", artifactResult.artifact_info.version);

  console.log("✓ Quick start complete!");
}

main().catch(console.error);
```

### Bash Integration

```bash
#!/bin/bash
set -euo pipefail

CORRELATION_KEY="bash-quickstart:$(date +%s)"

# Query using CLI
npm run query -- \
  --correlation-key "$CORRELATION_KEY" \
  --operation select \
  --table users \
  --schema users-v1

# Store artifact using CLI
npm run store-artifact -- \
  --correlation-key "$CORRELATION_KEY" \
  --name results \
  --content "Results" \
  --format text

echo "✓ Bash integration works"
```

---

## Support

- **Documentation**: See docs/ directory for detailed guides
- **Issues**: Check [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md)
- **Questions**: See [INTEGRATION_FAQ.md](./INTEGRATION_FAQ.md)
- **Errors**: Check error logs: `tail -f /var/log/cfn/error.log`

---

**Document Reference:** QUICK_START_GUIDE.md
**Maintained By:** API Documentation Specialist
**Last Reviewed:** 2025-11-16
