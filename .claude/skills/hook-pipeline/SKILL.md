---
name: Hook Pipeline
version: 1.2.0
complexity: High
keywords: [
    "post-edit validation",
    "automated code quality",
    "ROOT_WARNING detection",
    "real-time feedback",
    "code enforcement",
    "TDD mechanism",
    "validation pipeline"
]
triggers: [
    "code quality improvement",
    "automated validation workflow",
    "continuous code correction"
]
performance_targets: {
    "hook_execution_time_ms": 200,
    "redis_feedback_delivery_ms": 100,
    "auto_resolution_rate_pct": 95,
    "feedback_accuracy_pct": 90
}
---

# Hook Pipeline Skill: Post-Edit Automation & Feedback Resolution

## Overview
Automated post-edit validation pipeline with intelligent feedback resolution. Executes comprehensive validation after Edit/Write/MultiEdit operations and automatically resolves common issues like ROOT_WARNING violations.

## Quick Start

### Run Post-Edit Validation
```bash
# Validate a TypeScript file after edit
./.claude/skills/hook-pipeline/post-edit-handler.sh src/path/to/file.ts

# With memory context
./.claude/skills/hook-pipeline/post-edit-handler.sh src/file.ts --memory-key "swarm/coder-1/step-2"

# Direct pipeline call
node config/hooks/post-edit-pipeline.js src/file.ts
```

### Pipeline Features (v2.0)
- ✅ **TypeScript Validation**: Immediate type checking on edited files
- ✅ **Error Categorization**: Groups errors by type (syntax, implicit any, property missing)
- ✅ **Actionable Feedback**: Provides specific guidance for common error types
- ✅ **Non-blocking**: Type warnings don't fail pipeline (syntax errors do)
- ✅ **Redis Integration**: Publishes results to swarm coordination channels
- ✅ **Audit Trail**: Logs all validation results to `.artifacts/logs/post-edit-pipeline.log`

## Error Categories

| Status | Exit Code | Description |
|--------|-----------|-------------|
| `SUCCESS` | 0 | No TypeScript errors |
| `SKIPPED` | 0 | Non-TypeScript file |
| `TYPE_WARNING` | 0 | Minor type issues (non-blocking) |
| `LINT_ISSUES` | 0 | 5+ type errors detected |
| `SYNTAX_ERROR` | 2 | Critical syntax errors (blocking) |

## Integration with Agents

### ✅ Recommended: Automatic Post-Edit Validation

After using Edit/Write tools, agents should invoke the post-edit hook:

```bash
# Simple invocation (non-blocking)
./.claude/hooks/invoke-post-edit.sh "$EDITED_FILE" --agent-id "$AGENT_ID"

# Blocking mode (fails if validation errors)
./.claude/hooks/invoke-post-edit.sh "$EDITED_FILE" --agent-id "$AGENT_ID" --blocking
```

### Manual Validation (Alternative)

```bash
# Direct pipeline call
node config/hooks/post-edit-pipeline.js src/file.ts --memory-key "swarm/agent-1/validation"

# Via legacy skill wrapper
./.claude/skills/hook-pipeline/post-edit-handler.sh "$EDITED_FILE" \
  --agent-id "coder-1" \
  --coordinator-id "cfn-coordinator"
```

### Configuration

Edit `.claude/hooks/post-edit.config.json` to customize:
- Enable/disable hooks globally
- Configure blocking vs non-blocking behavior
- Set Redis publish channels
- Adjust validation settings
- Control logging verbosity

### Redis Integration

Results are published to channel: `swarm:hooks:post-edit`

Message format:
```json
{
  "file": "src/path/to/file.ts",
  "agentId": "coder-1",
  "exitCode": 0,
  "timestamp": 1729276694
}
```

### Agent Workflow Example

```bash
# 1. Agent performs edit
echo "Editing file..."
# ... Edit/Write operation ...

# 2. Immediately validate (non-blocking by default)
./.claude/hooks/invoke-post-edit.sh "$EDITED_FILE" --agent-id "$AGENT_ID"

# 3. Check exit code (optional)
if [ $? -eq 0 ]; then
  echo "✅ Validation passed"
else
  echo "⚠️  Validation warnings (see logs)"
fi

# 4. Results available in Redis and logs
# Channel: swarm:hooks:post-edit
# Log: .artifacts/logs/post-edit-pipeline.log
```

### For Coordinator Agents

Coordinators can monitor validation results via Redis:

```bash
# Subscribe to all post-edit validation events
redis-cli SUBSCRIBE swarm:hooks:post-edit

# Query recent results from memory
redis-cli GET "swarm/coder-1/hook-results"
```