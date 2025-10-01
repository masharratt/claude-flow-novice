# Post-Edit Pipeline Agent Information Tracking

## Overview

The enhanced post-edit pipeline now logs all validation runs to `post-edit-pipeline.log` in the project root, with entries prepended to the top of the file. Each log entry captures agent context and comprehensive validation results.

## Available Agent Information

### 1. **Directly Provided via CLI Arguments**
When calling the pipeline manually, you can provide:

```bash
node config/hooks/post-edit-pipeline.js <file> \
  --memory-key "swarm/coder/step-1" \
  --agent-type "coder" \
  --agent-name "Agent-42" \
  --swarm-id "swarm-abc123" \
  --task-id "task-xyz789" \
  --session-id "session-001"
```

### 2. **Environment Variables**
The pipeline checks for these environment variables:
- `MEMORY_KEY` - Memory coordination key
- `AGENT_TYPE` - Type of agent (coder, tester, reviewer, etc.)
- `AGENT_NAME` - Name/identifier of the agent
- `SWARM_ID` - Swarm coordination identifier
- `TASK_ID` - Task tracking identifier
- `SESSION_ID` - Session identifier

### 3. **Memory Key Parsing**
If memory key follows the pattern `swarm/[agent-type]/[step]`, the pipeline automatically extracts:
- **Agent Type** from the second segment
- **Task Step** from the third segment

Example: `swarm/coder/jwt-implementation` → `agentType: "coder"`, `taskStep: "jwt-implementation"`

## Log File Format

### Location
```
/mnt/c/Users/masha/Documents/claude-flow-novice/post-edit-pipeline.log
```

### Entry Limit
- **Maximum entries**: 500
- **Auto-cleanup**: When the 501st entry is added, the oldest entry is automatically removed
- **Retention**: Only the 500 most recent validations are kept
- **Counter display**: Shows current entry count (e.g., "3/500 entries")

### Entry Structure
Each log entry contains:

```
════════════════════════════════════════════════════════════════════════════════
TIMESTAMP: 09/30/2025 21:14
FILE: /path/to/file.js
LANGUAGE: javascript
STATUS: PASSED

AGENT CONTEXT:
  Memory Key: system/coder/logging-enhancement
  Agent Type: coder
  Agent Name: Claude
  Swarm ID: N/A
  Task ID: N/A
  Session ID: N/A

VALIDATION STEPS:
  ✓ Formatting: ✅
  ✓ Linting: ✅
  ✓ Type Check: ✅
  ✓ Dependencies: ✅
  ✓ Security: ✅
  ✓ Tests: ✅

ERRORS (0):

WARNINGS (2):
  • Warning message 1
  • Warning message 2

SUGGESTIONS (1):
  • 🤖 Suggestion message

JSON:
{
  "timestamp": "2025-10-01T04:14:45.243Z",
  "displayTimestamp": "09/30/2025 21:14",
  "file": "...",
  "language": "...",
  "agent": {
    "memoryKey": "...",
    "agentType": "...",
    "agentName": "...",
    "swarmId": null,
    "taskId": null,
    "sessionId": null
  },
  "status": "PASSED|FAILED",
  "errors": 0,
  "warnings": 2,
  "suggestions": 1,
  "steps": { ... },
  "details": { ... }
}
════════════════════════════════════════════════════════════════════════════════
```

## Usage Examples

### Example 1: Basic Usage
```bash
node config/hooks/post-edit-pipeline.js src/app.js
```
**Result**: Logs with minimal agent context (only what's in env vars)

### Example 2: With Memory Key
```bash
node config/hooks/post-edit-pipeline.js src/app.js \
  --memory-key "swarm/coder/feature-auth"
```
**Result**: Extracts `agentType: "coder"` automatically from memory key

### Example 3: Full Agent Context
```bash
node config/hooks/post-edit-pipeline.js src/app.js \
  --memory-key "swarm/security-specialist/audit-jwt" \
  --agent-name "Security-Agent-1" \
  --swarm-id "auth-security-swarm" \
  --task-id "TASK-2025-001"
```
**Result**: Complete agent tracking with all context fields populated

### Example 4: Via Enhanced Hooks CLI
```bash
npx enhanced-hooks post-edit src/app.js \
  --memory-key "swarm/tester/coverage-validation" \
  --minimum-coverage 90 \
  --structured
```
**Result**: Integrated with enhanced pipeline features + agent tracking

## What Agent Information is NOT Available

The following information is **NOT automatically captured** unless explicitly provided:

1. **Agent ID/Name** - Must be passed via CLI or env var
2. **Swarm Coordination Details** - Requires explicit swarm-id parameter
3. **Task Hierarchy** - Not automatically tracked
4. **Agent Performance Metrics** - Not included in basic logging
5. **Inter-Agent Communication** - Not captured by this pipeline
6. **Agent Capabilities** - Not tracked in logs

## Recommendations for Agent Coordination

To enable comprehensive agent tracking, agents should:

1. **Always provide memory key** in the format `swarm/[agent-type]/[task-step]`
2. **Set environment variables** before running hooks:
   ```javascript
   process.env.AGENT_TYPE = 'coder';
   process.env.SWARM_ID = 'feature-development-swarm';
   process.env.TASK_ID = 'implement-auth';
   ```

3. **Use structured memory keys** for automatic parsing:
   - ✅ `swarm/coder/step-1` → Auto-extracts agent type
   - ✅ `validation/security-specialist/jwt-audit`
   - ❌ `random-key-123` → No auto-extraction

4. **Pass full context in programmatic calls**:
   ```javascript
   const options = {
     memoryKey: 'swarm/tester/coverage',
     agentType: 'tester',
     agentName: 'TDD-Agent-1',
     swarmId: 'test-swarm-abc',
     taskId: 'TASK-001',
     sessionId: 'session-xyz'
   };
   await pipeline.run(filePath, options);
   ```

## Log Analysis

### Querying Recent Agent Activity
```bash
# View last 100 lines (most recent entry)
head -n 100 post-edit-pipeline.log

# Search for specific agent type
grep -A 20 "Agent Type: coder" post-edit-pipeline.log

# Extract JSON entries
grep -A 30 "JSON:" post-edit-pipeline.log | grep -v "═"

# Count entries per agent type
grep "Agent Type:" post-edit-pipeline.log | sort | uniq -c
```

### JSON Parsing for Analytics
```javascript
// Extract all JSON entries from log
const fs = require('fs');
const log = fs.readFileSync('post-edit-pipeline.log', 'utf8');
const jsonEntries = log
  .split('JSON:')
  .slice(1)
  .map(section => {
    const jsonStr = section.split('════')[0].trim();
    return JSON.parse(jsonStr);
  });

// Analyze by agent type
const byAgent = jsonEntries.reduce((acc, entry) => {
  const type = entry.agent.agentType || 'unknown';
  acc[type] = (acc[type] || 0) + 1;
  return acc;
}, {});

console.log('Validations by Agent Type:', byAgent);
```

## Integration with Swarm Coordination

The post-edit pipeline integrates with the swarm memory system:

```javascript
// When using mcp__claude-flow-novice__memory_usage
await memory_usage({
  action: 'store',
  key: 'swarm/coder/validation-results',
  value: JSON.stringify(pipelineResults),
  namespace: 'validation'
});

// Pass the same key to post-edit pipeline
node config/hooks/post-edit-pipeline.js file.js \
  --memory-key "swarm/coder/validation-results"
```

This ensures validation results are coordinated with swarm memory for cross-agent visibility.

## Timestamp Format

The pipeline uses a human-readable timestamp format for easy scanning:

- **Format**: `MM/DD/YYYY HH:MM` (24-hour time)
- **Example**: `09/30/2025 21:14` (September 30, 2025 at 9:14 PM)
- **Timezone**: Local system time
- **JSON field**: Both `timestamp` (ISO 8601 for programmatic use) and `displayTimestamp` (formatted for humans)

### Why This Format?

1. **Readability**: Easy to quickly scan chronological order
2. **Compact**: Fits nicely in terminal display
3. **Sortable**: Naturally sorts by date/time when parsed
4. **Standard**: Common US date format widely recognized
5. **Dual storage**: Keeps ISO format in JSON for precise parsing

## Entry Limit & Auto-Cleanup

The log file automatically maintains a maximum of **500 entries**:

### How It Works

1. **New entry added**: Pipeline parses existing log and extracts all JSON entries
2. **Count check**: If count exceeds 500, oldest entries are removed
3. **Rebuild**: Log file is rebuilt with newest 500 entries only
4. **Notification**: Console displays `🗑️ Trimmed log to 500 most recent entries`

### Benefits

- **Bounded file size**: Log won't grow indefinitely
- **Performance**: Fast parsing with limited entries
- **Disk space**: Predictable storage requirements
- **Focus**: Keeps only recent, relevant validations

### Manual Cleanup

If you need to preserve old entries before they're auto-deleted:

```bash
# Backup current log
cp post-edit-pipeline.log post-edit-pipeline-$(date +%Y%m%d).log

# Or extract JSON entries for archival
grep -A 30 "JSON:" post-edit-pipeline.log > archive.json
```

## Future Enhancements

Potential additions to agent tracking:

1. **Agent Performance Metrics** - Execution time, resource usage
2. **Dependency Graph** - Track which agents triggered which validations
3. **Consensus Tracking** - Record agreement/disagreement between validators
4. **Error Attribution** - Link errors to specific agent actions
5. **Audit Trail** - Complete history of file changes by agent
6. **Real-time Streaming** - WebSocket-based live log streaming
7. **Dashboard Integration** - Visual analytics of agent activity

## Troubleshooting

### Issue: Agent context shows "N/A"
**Solution**: Provide agent information via CLI args or environment variables

### Issue: Memory key not parsed correctly
**Solution**: Use format `namespace/agent-type/task-step` (minimum 2 segments)

### Issue: Log file not created
**Solution**: Ensure write permissions in project root directory

### Issue: Duplicate entries
**Solution**: Each pipeline run appends to the top - this is expected behavior

## Summary

The enhanced post-edit pipeline captures:
- ✅ File path and language
- ✅ Timestamp
- ✅ Validation results (formatting, linting, type checking, dependencies, security, tests)
- ✅ Agent context (when provided)
- ✅ Memory key for swarm coordination
- ✅ Structured JSON for programmatic parsing
- ✅ Errors, warnings, and suggestions

Entries are prepended to `post-edit-pipeline.log` for easy access to most recent validations.
