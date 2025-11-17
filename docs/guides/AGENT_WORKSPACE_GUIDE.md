# Agent Workspace Guide

**Task 2.1: Persistent Agent Output Workspace**
**Version:** 1.0.0
**Status:** ✅ Implementation Complete

---

## Overview

The Agent Workspace system provides persistent, organized storage for agent outputs with reliable completion signaling. It replaces ephemeral `/tmp/` storage with a structured workspace that preserves agent outputs and enables robust coordinator-agent communication.

### Key Features

- **Persistent Storage:** Outputs survive process termination and system restarts
- **Organized Structure:** Logs, reports, metrics, and deliverables stored in separate directories
- **Completion Signals:** Reliable signaling mechanism for coordinators to detect agent completion
- **Atomic Operations:** Race-condition safe writes prevent data corruption
- **Automatic Cleanup:** 30-day retention with archival support
- **Concurrent Safety:** Multiple agents can write to separate workspaces simultaneously

---

## Workspace Directory Structure

```
artifacts/agent-workspaces/
├── {task_id}/
│   ├── {agent_id}/
│   │   ├── logs/
│   │   │   ├── stdout.log          # Standard output
│   │   │   └── stderr.log          # Standard error
│   │   ├── reports/
│   │   │   ├── analysis.json       # Analysis reports
│   │   │   └── findings.json       # Bug/issue findings
│   │   ├── metrics/
│   │   │   └── performance.json    # Execution metrics
│   │   ├── deliverables/
│   │   │   ├── feature.ts          # Code deliverables
│   │   │   └── documentation.md    # Documentation
│   │   └── COMPLETION_SIGNAL.json  # Completion signal
│   └── {another_agent_id}/
│       └── ...
└── {another_task_id}/
    └── ...
```

---

## TypeScript API Reference

### Creating a Workspace

```typescript
import { createWorkspace } from './lib/agent-workspace';

// Create workspace for agent
const workspace = await createWorkspace('task-123', 'agent-backend-001');

console.log(workspace.path);                      // artifacts/agent-workspaces/task-123/agent-backend-001
console.log(workspace.subdirectories.logs);       // .../logs
console.log(workspace.subdirectories.reports);    // .../reports
console.log(workspace.subdirectories.metrics);    // .../metrics
console.log(workspace.subdirectories.deliverables); // .../deliverables
```

### Writing Output Files

```typescript
import { writeOutput } from './lib/agent-workspace';

// Write logs
await writeOutput(workspace, 'logs', 'stdout.log', 'Starting task execution...\n');
await writeOutput(workspace, 'logs', 'stderr.log', 'Warning: deprecated API\n');

// Write JSON reports
await writeOutput(workspace, 'reports', 'analysis.json', {
  status: 'complete',
  findings: [
    { type: 'bug', severity: 'high', file: 'auth.ts', line: 42 },
    { type: 'improvement', severity: 'low', file: 'utils.ts', line: 18 }
  ]
});

// Write metrics
await writeOutput(workspace, 'metrics', 'performance.json', {
  executionTimeMs: 5420,
  tokensUsed: 12500,
  costUsd: 0.025,
  memoryMb: 128
});

// Write deliverables
await writeOutput(workspace, 'deliverables', 'feature.ts',
  'export function newFeature() { /* ... */ }'
);
```

### Reading Output Files

```typescript
import { readOutput } from './lib/agent-workspace';

// Read logs (returns string)
const logs = await readOutput(workspace, 'logs', 'stdout.log');
console.log(logs);

// Read JSON (auto-parsed)
const analysis = await readOutput(workspace, 'reports', 'analysis.json');
console.log(analysis.findings);
```

### Signaling Completion

```typescript
import { signalCompletion } from './lib/agent-workspace';

// Agent signals completion
await signalCompletion(workspace, {
  success: true,
  confidence: 0.88,
  deliverables: ['feature.ts', 'feature.test.ts', 'README.md'],
  errors: [],
  metrics: {
    executionTimeMs: 5420,
    tokensUsed: 12500,
    costUsd: 0.025
  }
});
```

### Polling for Completion (Coordinators)

```typescript
import { pollForCompletion } from './lib/completion-signal-handler';
import { getWorkspacePath } from './lib/agent-workspace';

// Get workspace path without creating directories
const workspace = getWorkspacePath('task-123', 'agent-backend-001');

// Poll for completion with 5-minute timeout
try {
  const signal = await pollForCompletion(workspace, 300000);

  if (signal.success) {
    console.log(`Agent completed with confidence: ${signal.confidence}`);
    console.log(`Deliverables: ${signal.deliverables.join(', ')}`);
  } else {
    console.error(`Agent failed: ${signal.errors?.join(', ')}`);
  }
} catch (error) {
  console.error('Agent timeout - no completion signal received');
}
```

### Listing Workspaces

```typescript
import { listWorkspaces } from './lib/agent-workspace';

// List all agent workspaces for a task
const agentIds = await listWorkspaces('task-123');
console.log(`Task has ${agentIds.length} agent workspaces`);
```

---

## Completion Signal Format

### CompletionSignal Interface

```typescript
interface CompletionSignal {
  success: boolean;           // Task completed successfully
  confidence: number;         // Agent confidence (0.0 - 1.0)
  deliverables: string[];     // List of deliverable file paths
  errors?: string[];          // List of errors (if any)
  metrics?: {
    executionTimeMs?: number; // Execution time in milliseconds
    tokensUsed?: number;      // AI tokens consumed
    costUsd?: number;         // Estimated cost in USD
    [key: string]: any;       // Custom metrics
  };
  timestamp: Date;            // Signal timestamp
  agentId: string;            // Agent identifier
  taskId: string;             // Task identifier
}
```

### Example COMPLETION_SIGNAL.json

```json
{
  "success": true,
  "confidence": 0.88,
  "deliverables": [
    "src/features/auth/jwt-validator.ts",
    "tests/auth/jwt-validator.test.ts",
    "docs/AUTH_IMPLEMENTATION.md"
  ],
  "errors": [],
  "metrics": {
    "executionTimeMs": 5420,
    "tokensUsed": 12500,
    "costUsd": 0.025,
    "filesCreated": 3,
    "testsAdded": 12
  },
  "timestamp": "2025-01-15T10:30:45.123Z",
  "agentId": "backend-dev-001",
  "taskId": "task-auth-jwt-123"
}
```

---

## Integration with Coordinators

### Coordinator Workflow

1. **Spawn Agent:** Create workspace and spawn agent with workspace path
2. **Monitor Progress:** Optionally read logs for real-time progress
3. **Poll for Completion:** Use `pollForCompletion()` with timeout
4. **Process Results:** Read deliverables and metrics from workspace
5. **Cleanup:** Archive or cleanup workspace after processing

### Example Coordinator Implementation

```typescript
import { createWorkspace, getWorkspacePath } from './lib/agent-workspace';
import { pollForCompletion } from './lib/completion-signal-handler';

async function coordinateTask(taskId: string, agentId: string) {
  // 1. Create workspace
  const workspace = await createWorkspace(taskId, agentId);

  // 2. Spawn agent (pseudo-code)
  spawnAgent(agentId, {
    taskId,
    workspacePath: workspace.path,
    // ... other config
  });

  // 3. Poll for completion (5 minutes timeout)
  try {
    const signal = await pollForCompletion(workspace, 300000);

    if (signal.success) {
      console.log(`✅ Agent ${agentId} completed successfully`);
      console.log(`   Confidence: ${signal.confidence}`);
      console.log(`   Deliverables: ${signal.deliverables.length} files`);

      // 4. Process deliverables
      for (const deliverable of signal.deliverables) {
        console.log(`   - ${deliverable}`);
      }

      return signal;
    } else {
      console.error(`❌ Agent ${agentId} failed`);
      console.error(`   Errors: ${signal.errors?.join(', ')}`);
      throw new Error('Agent execution failed');
    }
  } catch (error) {
    console.error(`⏱️ Agent ${agentId} timeout`);
    throw error;
  }
}
```

---

## Cleanup and Archival

### Automatic Cleanup Script

The workspace management script provides automated cleanup and archival:

```bash
# Clean up workspaces older than 30 days (default retention)
./scripts/manage-agent-workspaces.sh cleanup --older-than=30d

# Archive a specific task before cleanup
./scripts/manage-agent-workspaces.sh archive --task-id=task-123

# Archive a specific agent workspace
./scripts/manage-agent-workspaces.sh archive --task-id=task-123 --agent-id=agent-456

# Show workspace statistics
./scripts/manage-agent-workspaces.sh stats

# Clean up archives older than 90 days
./scripts/manage-agent-workspaces.sh cleanup-archives --older-than=90d
```

### Cleanup Policies

| Stage | Retention | Action | Location |
|-------|-----------|--------|----------|
| **Active** | 30 days | None | `artifacts/agent-workspaces/` |
| **Archive** | 90 days | Compress to `.tar.gz` | `artifacts/workspace-archives/` |
| **Purge** | After 90 days | Delete archive | - |

### Environment Variables

Configure cleanup behavior via environment variables:

```bash
export WORKSPACE_ROOT="artifacts/agent-workspaces"
export ARCHIVE_ROOT="artifacts/workspace-archives"
export RETENTION_DAYS=30
export ARCHIVE_RETENTION_DAYS=90
export DISK_ALERT_THRESHOLD=80
export ARCHIVE_BEFORE_CLEANUP=true

./scripts/manage-agent-workspaces.sh cleanup
```

### Workspace Statistics

```bash
$ ./scripts/manage-agent-workspaces.sh stats

Active Workspaces:
  Tasks:      15
  Agents:     42
  Files:      328
  Total Size: 156MB

Workspaces by Age:
  < 7 days:   12
  < 30 days:  28
  < 90 days:  42

Archives:
  Count:      8
  Total Size: 42MB

Disk Usage: 45%
```

---

## Best Practices

### For Agents

1. **Create workspace early:** Call `createWorkspace()` at agent startup
2. **Write incrementally:** Stream logs and metrics during execution
3. **Signal completion:** Always call `signalCompletion()` when done
4. **Include metadata:** Provide detailed metrics and deliverable lists
5. **Handle errors:** Signal completion even on failure (with `success: false`)

### For Coordinators

1. **Use timeouts:** Set realistic timeouts for `pollForCompletion()`
2. **Handle timeouts:** Gracefully handle agents that don't complete
3. **Process deliverables:** Read and validate deliverables after completion
4. **Cleanup old workspaces:** Run cleanup scripts regularly (cron job)
5. **Monitor disk usage:** Set up alerts for disk space

### For System Administrators

1. **Set up cron jobs:** Schedule regular cleanup and archival
2. **Monitor disk space:** Use `manage-agent-workspaces.sh stats`
3. **Archive important tasks:** Archive before cleanup for forensics
4. **Adjust retention:** Tune retention policies based on disk space
5. **Review metrics:** Use workspace metrics for performance analysis

---

## Error Handling

### Common Errors

| Error Code | Description | Solution |
|------------|-------------|----------|
| `INVALID_INPUT` | Invalid task/agent ID | Validate IDs before calling |
| `DIRECTORY_CREATE_FAILED` | Failed to create workspace | Check permissions and disk space |
| `FILE_WRITE_FAILED` | Failed to write output | Check permissions and disk space |
| `FILE_NOT_FOUND` | Output file not found | Verify file was written successfully |
| `TIMEOUT` | Completion signal timeout | Increase timeout or check agent health |

### Example Error Handling

```typescript
import { createWorkspace, writeOutput } from './lib/agent-workspace';
import { pollForCompletion } from './lib/completion-signal-handler';

try {
  const workspace = await createWorkspace('task-123', 'agent-456');
  await writeOutput(workspace, 'logs', 'output.log', 'Starting...');

  const signal = await pollForCompletion(workspace, 300000);
  console.log('Agent completed successfully');
} catch (error) {
  if (error.code === 'TIMEOUT') {
    console.error('Agent did not complete within timeout');
    // Handle timeout (kill agent, retry, etc.)
  } else if (error.code === 'FILE_WRITE_FAILED') {
    console.error('Failed to write output - check disk space');
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

---

## Performance Considerations

### Disk Space

- Average workspace size: 2-5 MB
- With 100 active agents: ~500 MB
- With 30-day retention: ~2-3 GB
- Recommendation: Monitor disk usage and adjust retention

### Polling Performance

- Default poll interval: 500ms
- Recommended timeout: 5-10 minutes for typical tasks
- For long-running tasks: Use longer timeouts (30+ minutes)
- Avoid polling too frequently (increases CPU usage)

### Concurrent Agents

- Workspace creation is atomic and race-condition safe
- Multiple agents can write to separate workspaces simultaneously
- Recommended: Use separate workspaces per agent (not shared)

---

## Migration from /tmp/

### Before (Ephemeral Storage)

```typescript
// Old pattern - data lost on restart
const outputPath = `/tmp/agent-${agentId}-output.json`;
fs.writeFileSync(outputPath, JSON.stringify(data));
```

### After (Persistent Workspace)

```typescript
// New pattern - data persisted and organized
const workspace = await createWorkspace(taskId, agentId);
await writeOutput(workspace, 'reports', 'output.json', data);
await signalCompletion(workspace, {
  success: true,
  confidence: 0.9,
  deliverables: ['output.json']
});
```

---

## Troubleshooting

### Workspace not created

**Symptom:** `DIRECTORY_CREATE_FAILED` error
**Causes:**
- Insufficient permissions
- Disk space full
- Invalid task/agent IDs

**Solution:**
```bash
# Check permissions
ls -la artifacts/
chmod -R u+w artifacts/

# Check disk space
df -h

# Sanitize IDs (done automatically, but verify)
const workspace = await createWorkspace(
  taskId.replace(/[^a-zA-Z0-9_-]/g, '_'),
  agentId.replace(/[^a-zA-Z0-9_-]/g, '_')
);
```

### Completion signal not received

**Symptom:** `TIMEOUT` error
**Causes:**
- Agent crashed before signaling
- Agent is stuck/hanging
- Network/disk issues

**Solution:**
```bash
# Check if agent process is running
ps aux | grep agent-456

# Check workspace for partial output
ls -la artifacts/agent-workspaces/task-123/agent-456/

# Read logs for errors
cat artifacts/agent-workspaces/task-123/agent-456/logs/stderr.log

# Increase timeout if agent needs more time
const signal = await pollForCompletion(workspace, 600000); // 10 minutes
```

### Disk space issues

**Symptom:** `FILE_WRITE_FAILED` error, disk full alerts
**Solution:**
```bash
# Check disk usage
./scripts/manage-agent-workspaces.sh stats

# Clean up old workspaces
./scripts/manage-agent-workspaces.sh cleanup --older-than=7d

# Archive important tasks
./scripts/manage-agent-workspaces.sh archive --task-id=important-task

# Clean up old archives
./scripts/manage-agent-workspaces.sh cleanup-archives --older-than=30d
```

---

## Future Enhancements

### Planned Features (v1.1)

- [ ] Workspace compression (gzip logs on-the-fly)
- [ ] Remote storage support (S3, GCS)
- [ ] Workspace search/query API
- [ ] Automatic metrics aggregation
- [ ] Real-time log streaming API
- [ ] Workspace tagging and categorization

### Experimental Features

- [ ] Distributed workspace (multi-node coordination)
- [ ] Workspace versioning (track changes over time)
- [ ] Cost tracking and budgeting
- [ ] Performance analytics dashboard

---

## Related Documentation

- **Artifact Registry:** `docs/ARTIFACT_REGISTRY.md`
- **File Operations:** `src/lib/file-operations.ts`
- **Error Handling:** `src/lib/errors.ts`
- **Logging:** `src/lib/logging.ts`
- **CFN Coordination:** `.claude/skills/cfn-coordination/SKILL.md`

---

## Support

For issues or questions:
1. Check this guide and related documentation
2. Review test suite (`tests/agent-workspace.test.ts`) for examples
3. Check error codes in `src/lib/errors.ts`
4. File an issue with workspace diagnostics

---

**Last Updated:** 2025-01-15
**Maintained By:** Integration Team
**Version:** 1.0.0
