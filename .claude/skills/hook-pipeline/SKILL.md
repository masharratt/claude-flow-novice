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

When agents use Edit/Write tools, they can invoke the post-edit pipeline:

```bash
# Agent workflow
./.claude/skills/hook-pipeline/post-edit-handler.sh "$EDITED_FILE" \
  --agent-id "coder-1" \
  --coordinator-id "cfn-coordinator" \
  --memory-key "swarm/coder-1/implementation"
```

Results are automatically published to Redis channel: `swarm:skills:sprint-2.2:{agentId}:hooks`