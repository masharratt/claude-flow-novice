# Claude Flow Hooks Documentation (v2)

## Overview

Claude Flow implements a sophisticated, multi-layered hooks system for automated validation, testing, security, coordination, and workflow management.

## Post-Edit Validation Hook

### `/hooks/post-edit.sh`

**Purpose**: Validate and process file modifications across the system

**Configuration**: `.claude/hooks/post-edit.config.json`

**Parameters:**
- `$EDITED_FILE`: Path to modified file
- `--agent-id`: ID of agent performing edit
- `--memory-key`: Optional memory tracking key

**Validation Stages:**
- Syntax checking
- Security scanning
- Format validation
- TDD compliance check

**Example:**
```bash
./.claude/hooks/invoke-post-edit.sh "$EDITED_FILE" \
  --agent-id "coder-1" \
  --memory-key "coder/task-123"
```

**Key Features:**
- Language-agnostic validation
- Non-blocking by default
- Configurable validation levels
- Redis coordination support

## Validation Hook Configuration

**Configuration Options:**
```json
{
  "validationLevels": {
    "minimal": 0.3,
    "standard": 0.7,
    "comprehensive": 0.9
  },
  "blockedPatterns": [
    "*.env",
    "*secrets*",
    "*credentials*"
  ],
  "requiredCoverage": {
    "default": 0.80,
    "critical": 0.95
  }
}
```

## Hook Types

### Security Hooks
- Prevent secret exposure
- Validate file permissions
- Analyze potential vulnerabilities

### Testing Hooks
- Run appropriate test suite
- Validate test coverage
- Enforce TDD principles

### Formatting Hooks
- Apply language-specific formatters
- Check coding standards
- Normalize file structure

### Coordination Hooks
- Update Redis memory key
- Signal edit completion
- Trigger agent notifications

## Skills Integration

### Redis Coordination Hook
- Automatically track file modifications
- Update agent memory state
- Signal workflow progression

**Example:**
```bash
# Automatic Redis coordination
./.claude/skills/redis-coordination/signal-edit.sh \
  --file "$EDITED_FILE" \
  --agent-id "coder-1" \
  --task-id "task-123"
```

## Best Practices

1. **Always Run Post-Edit Hook**
2. **Use Configurable Validation**
3. **Leverage Skills Integration**
4. **Monitor Hook Performance**

## Monitoring Commands

### `/hooks-status`
**Purpose**: Check hook system health and configuration

**Example:**
```bash
/hooks-status --detailed
```

### `/hooks-validate`
**Purpose**: Manually trigger comprehensive hook validation

**Example:**
```bash
/hooks-validate --level comprehensive
```

## Related Documentation
- [Skills Documentation](./log-skills.md)
- [Redis Coordination](./logs-cli-redis.md)
- [CFN Loop Validation](./cfn-loop-modes.md)