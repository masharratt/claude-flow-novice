# Task Mode Safety Integration Guide for Developers

**Version:** 1.0
**Date:** 2025-11-06
**Status:** Implementation Ready
**Priority:** HIGH (ANTI-023 Memory Leak Protection)

---

## Overview

This guide helps developers integrate Task mode safety patterns into existing CFN Loop workflows while maintaining compatibility with CLI mode operations.

**Key Principle:** Task mode agents use direct JSON output, CLI mode agents use Redis coordination.

## Quick Start

### For New Agents

1. **Use the safety scripts:**
   ```bash
   # In your agent script
   source .claude/skills/cfn-task-mode-safety/mode-detection.sh
   ```

2. **Use mode-compliant completion:**
   ```bash
   # Task mode completion
   task_mode_complete 0.85 "COMPLETE" "Work done" "file1.js" "file2.js"
   ```

### For Existing Agents

1. **Replace Redis operations with mode-compliant alternatives:**
   ```bash
   # OLD (causes memory leaks)
   redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

   # NEW (mode-aware)
   cfn_coordination_safe "signal-complete" "$TASK_ID" "$AGENT_ID"
   ```

## Integration Patterns

### Pattern 1: Agent Completion Protocol

#### Task Mode (Safe)
```bash
#!/bin/bash
# task-mode-agent.sh

# Source safety scripts
source .claude/skills/cfn-task-mode-safety/mode-detection.sh

# Agent work here...
# ... implementation ...

# Mode-compliant completion
if is_task_mode; then
    # Task mode: Direct JSON output
    task_mode_complete 0.85 "COMPLETE" "API implementation" \
        "src/api/auth.js" "src/api/auth.test.js" "docs/API.md"
else
    # CLI mode: Redis coordination
    cfn_coordination_safe "signal-complete" "$TASK_ID" "$AGENT_ID"
    cfn_coordination_safe "store-confidence" "$TASK_ID" "$AGENT_ID" 0.85
    cfn_coordination_safe "store-result" "$TASK_ID" "$AGENT_ID" 0.85 1
fi
```

#### CLI Mode (Enhanced)
```bash
#!/bin/bash
# cli-mode-agent.sh

# Source safety scripts
source .claude/skills/cfn-task-mode-safety/mode-detection.sh
source .claude/skills/cfn-task-mode-safety/cli-coordination.sh

# Agent work here...
# ... implementation ...

# CLI mode coordination
cfn_signal_agent_complete "$TASK_ID" "$AGENT_ID"
cfn_store_agent_result "$TASK_ID" "$AGENT_ID" 0.85 1
```

### Pattern 2: Agent-to-Agent Communication

#### Task Mode Communication
```bash
#!/bin/bash
# agent-communication-task.sh

source .claude/skills/cfn-task-mode-safety/mode-detection.sh

send_agent_message() {
    local sender="$1"
    local receiver="$2"
    local message="$3"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Task mode: File-based messaging
    local message_file="./.claude/messages/${receiver}_${timestamp}.json"
    mkdir -p "$(dirname "$message_file")"

    cat > "$message_file" <<EOF
{
  "sender": "$sender",
  "receiver": "$receiver",
  "timestamp": "$timestamp",
  "message": $message
}
EOF
}

receive_agent_messages() {
    local agent="$1"
    local message_dir="./.claude/messages"

    # Find messages for this agent
    find "$message_dir" -name "${agent}_*.json" -type f -mtime -1
}

# Usage
send_agent_message "coder" "reviewer" "{\"status\": \"ready for review\"}"
```

#### CLI Mode Communication
```bash
#!/bin/bash
# agent-communication-cli.sh

source .claude/skills/cfn-task-mode-safety/mode-detection.sh
source .claude/skills/cfn-task-mode-safety/cli-coordination.sh

# CLI mode uses Redis pub/sub
send_cli_message() {
    local sender="$1"
    local receiver="$2"
    local message="$3"

    # Redis pub/sub for CLI mode
    redis_cli_safe PUBLISH "agent:${receiver}" "$sender:$message"
}

receive_cli_messages() {
    local agent="$1"
    local timeout="${2:-30}"

    # Subscribe to messages (blocking)
    redis_cli_safe SUBSCRIBE "agent:${agent}" | head -1
}
```

### Pattern 3: Context Management

#### Task Mode Context
```bash
#!/bin/bash
# task-mode-context.sh

source .claude/skills/cfn-task-mode-safety/mode-detection.sh

class TaskContext {
    local task_id="$1"
    local context_file="./.claude/context/task-${task_id}.json"

    load_context() {
        if [[ -f "$context_file" ]]; then
            jq '.' "$context_file"
        else
            echo "{}"
        fi
    }

    save_context() {
        local data="$1"
        echo "$data" | jq '.' > "$context_file"
    }

    set_value() {
        local key="$1"
        local value="$2"
        local context=$(load_context)
        echo "$context" | jq --arg key "$key" --argjson value "$value" '.[$key] = $value' | save_context
    }

    get_value() {
        local key="$1"
        local context=$(load_context)
        echo "$context" | jq -r ".[\"$key\"] // empty"
    }
}

# Usage
context=$(new TaskContext "task-123")
context.set_value "deliverables" '["file1.js", "file2.js"]'
deliverables=$(context.get_value "deliverables")
```

#### CLI Mode Context
```bash
#!/bin/bash
# cli-mode-context.sh

source .claude/skills/cfn-task-mode-safety/mode-detection.sh
source .claude/skills/cfn-task-mode-safety/cli-coordination.sh

# CLI mode uses Redis for context management
save_context() {
    local task_id="$1"
    local agent_id="$2"
    local context="$3"

    local key="context:${task_id}:${agent_id}"
    redis_cli_safe SET "$key" "$context" EX 3600
}

load_context() {
    local task_id="$1"
    local agent_id="$2"

    local key="context:${task_id}:${agent_id}"
    redis_cli_safe GET "$key"
}
```

## Migration Guide

### From Old Agent to Task Mode Safe Agent

#### Before (Problematic)
```bash
#!/bin/bash
# OLD agent implementation

# This causes memory leaks in Task mode
redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
redis-cli SET "swarm:${TASK_ID}:${AGENT_ID}:confidence" "0.85"

# Direct JSON output (inconsistent)
echo '{"confidence": 0.85}'
```

#### After (Mode Safe)
```bash
#!/bin/bash
# NEW agent implementation

# Source safety scripts
source .claude/skills/cfn-task-mode-safety/mode-detection.sh

# Agent work continues...
# ... implementation ...

# Mode-compliant completion
task_mode_complete 0.85 "COMPLETE" "Work completed" "file1.js" "file2.js"

# Optional: Task mode audit logging
task_mode_audit "complete" "{\"deliverables\": [\"file1.js\", \"file2.js\"]}"
```

### CLI Mode Agent Migration

#### Before
```bash
#!/bin/bash
# OLD CLI agent implementation

# Manual Redis operations (error-prone)
redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
redis-cli SET "swarm:${TASK_ID}:${AGENT_ID}:confidence" "0.85"
redis-cli HSET "swarm:${TASK_ID}:${AGENT_ID}:result" "confidence" "0.85"
```

#### After
```bash
#!/bin/bash
# NEW CLI agent implementation

# Enhanced safety scripts
source .claude/skills/cfn-task-mode-safety/mode-detection.sh
source .claude/skills/cfn-task-mode-safety/cli-coordination.sh

# Safe CLI operations
cfn_signal_agent_complete "$TASK_ID" "$AGENT_ID"
cfn_store_agent_confidence "$TASK_ID" "$AGENT_ID" 0.85
cfn_store_agent_result "$TASK_ID" "$AGENT_ID" 0.85 1

# Enhanced connection handling
if ! redis_check_connection; then
    echo "❌ Redis connection failed" >&2
    exit 1
fi
```

## Testing Integration

### Unit Test Template
```bash
#!/bin/bash
# test-new-agent.sh

set -euo pipefail

# Test Task mode
unset TASK_ID AGENT_ID
source .claude/skills/cfn-task-mode-safety/mode-detection.sh

echo "🔬 Testing Task mode..."
if is_task_mode; then
    result=$(task_mode_complete 0.90 "COMPLETE" "Test passed")
    if echo "$result" | grep -q '"confidence": 0.90'; then
        echo "✅ Task mode test passed"
    else
        echo "❌ Task mode test failed"
        exit 1
    fi
fi

# Test CLI mode
export TASK_ID="test-cli" AGENT_ID="test-agent"

echo "🔬 Testing CLI mode..."
if is_cli_mode; then
    result=$(cfn_signal_agent_complete "$TASK_ID" "$AGENT_ID")
    if [[ $? -eq 0 ]]; then
        echo "✅ CLI mode test passed"
    else
        echo "❌ CLI mode test failed"
        exit 1
    fi
fi

echo "✅ All integration tests passed"
```

### Integration Test Template
```bash
#!/bin/bash
# test-agent-integration.sh

set -euo pipefail

# Test the full integration
echo "🧪 Testing agent integration..."

# Setup test environment
export TEST_TASK_ID="integration-test"
export TEST_AGENT_ID="integration-agent"

# Test both modes
source .claude/skills/cfn-task-mode-safety/mode-detection.sh

# Task mode test
unset TASK_ID AGENT_ID
if is_task_mode; then
    task_result=$(task_mode_complete 0.85 "COMPLETE" "Integration test")
    if echo "$task_result" | grep -q '"mode": "task"'; then
        echo "✅ Task mode integration test passed"
    else
        echo "❌ Task mode integration test failed"
        exit 1
    fi
fi

# CLI mode test
export TASK_ID="$TEST_TASK_ID" AGENT_ID="$TEST_AGENT_ID"
if is_cli_mode; then
    cfn_signal_agent_complete "$TASK_TASK_ID" "$TEST_AGENT_ID"
    if [[ $? -eq 0 ]]; then
        echo "✅ CLI mode integration test passed"
    else
        echo "❌ CLI mode integration test failed"
        exit 1
    fi
fi

echo "✅ Full integration test passed"
```

## Best Practices

### 1. Mode Detection
- Always source the mode detection script first
- Check `is_task_mode()` before using Task mode features
- Check `is_cli_mode()` before using Redis operations

### 2. Completion Protocol
- Use `task_mode_complete()` in Task mode
- Use Redis coordination functions in CLI mode
- Never mix protocols in the same agent

### 3. Error Handling
- Always check Redis connection status
- Validate confidence values (0.0-1.0 range)
- Handle timeouts gracefully

### 4. Performance
- Use mode detection caching if needed
- Minimize file I/O in Task mode
- Use connection pooling for Redis operations

### 5. Security
- Validate all environment variables
- Use proper escaping for Redis commands
- Implement proper file permissions

## Troubleshooting

### Common Issues

#### Issue 1: Mode Detection Fails
```bash
# Problem: Mode detection not working
# Solution: Check environment variables
echo "CFN_MODE: ${CFN_MODE:-not set}"
echo "TASK_ID: ${TASK_ID:-not set}"
echo "AGENT_ID: ${AGENT_ID:-not set}"
```

#### Issue 2: Redis Connection Fails
```bash
# Problem: Redis connection issues
# Solution: Check Redis status
redis-cli ping
if [[ $? -ne 0 ]]; then
    echo "Redis not running, starting..."
    redis-server --daemonize yes
fi
```

#### Issue 3: Memory Leaks in Task Mode
```bash
# Problem: Memory leaks when using Redis in Task mode
# Solution: Use mode detection
source .claude/skills/cfn-task-mode-safety/mode-detection.sh

if is_task_mode; then
    task_mode_complete 0.85 "COMPLETE" "Work done"
else
    cfn_coordination_safe "signal-complete" "$TASK_ID" "$AGENT_ID"
fi
```

### Debug Mode
```bash
#!/bin/bash
# debug-agent.sh

set -x  # Enable debugging

# Source with debug output
source .claude/skills/cfn-task-mode-safety/mode-detection.sh

echo "Mode: $(detect_execution_mode)"
echo "Task Mode: $(is_task_mode && echo 'YES' || echo 'NO')"
echo "CLI Mode: $(is_cli_mode && echo 'YES' || echo 'NO')"
```

## Deployment Strategy

### Phase 1: Safety First (Week 1)
1. Deploy mode detection scripts to all environments
2. Update all existing agents to use mode-compliant completion
3. Run comprehensive test suite
4. Monitor for memory leaks

### Phase 2: Enhanced Features (Week 2)
1. Implement advanced coordination features
2. Add performance monitoring
3. Deploy audit trail system
4. Document new capabilities

### Phase 3: Optimization (Week 3)
1. Optimize mode detection performance
2. Add advanced caching
3. Implement auto-recovery mechanisms
4. Fine-tune based on usage patterns

## Monitoring and Maintenance

### Log Monitoring
```bash
# Monitor mode detection logs
tail -f /tmp/cfn-mode-safety.log

# Monitor Redis operations
redis-cli MONITOR | grep "swarm"

# Monitor agent completion
find /tmp -name "*completion*.json" -type f -exec grep -l "mode" {} \;
```

### Health Checks
```bash
#!/bin/bash
# health-check.sh

# Check mode detection
if ! source .claude/skills/cfn-task-mode-safety/mode-detection.sh; then
    echo "❌ Mode detection script failed"
    exit 1
fi

# Check Redis connection (CLI mode)
if is_cli_mode; then
    if ! redis_check_connection; then
        echo "❌ Redis connection failed"
        exit 1
    fi
fi

echo "✅ Health check passed"
```

---

## Support and Resources

### Documentation
- [Task Mode Safety Patterns](../../docs/task-mode-redis-safety-patterns.md)
- [Test Suite](../../tests/test-task-mode-safety.sh)
- [API Reference](../../docs/developers/task-mode-integration-guide.md)

### Tools and Scripts
- Mode Detection: `.claude/skills/cfn-task-mode-safety/mode-detection.sh`
- CLI Coordination: `.claude/skills/cfn-task-mode-safety/cli-coordination.sh`
- Test Suite: `tests/test-task-mode-safety.sh`

### Contact
- **Priority:** HIGH for memory leak issues
- **Response Time:** 2 hours for critical issues
- **Update Schedule:** Weekly security patches

---

**Next Steps:**
1. Review this guide with your team
2. Begin Phase 1 deployment
3. Run test suite in development
4. Monitor production deployment

**Remember:** Task mode safety is critical for preventing memory leaks. Always use the provided safety scripts and test thoroughly before production deployment.