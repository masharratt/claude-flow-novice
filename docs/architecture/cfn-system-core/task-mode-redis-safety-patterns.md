# Task Mode Redis Safety Patterns - ANTI-023 Memory Leak Protection

**Version:** 1.0
**Date:** 2025-11-06
**Status:** Complete Design Specification
**Priority:** CRITICAL (Memory Leak Resolution)

---

## Executive Summary

This document provides comprehensive Redis safety patterns for Task mode execution, designed to maintain the benefits of Redis coordination while preventing memory leaks caused by mode confusion (ANTI-023 pattern).

**Key Insight:** Task mode agents (spawned via Task() tool) should use direct JSON output, while CLI mode agents (spawned via npx claude-flow-novice) use Redis coordination.

## Architecture Overview

### Mode-Specific Behaviors

```yaml
Task Mode (Main Chat Coordination):
├── No Redis operations
├── Direct JSON output to Main Chat
├── Simple completion protocol
├── Full visibility in chat
└── Cost: ~$0.150/iteration

CLI Mode (Background Coordination):
├── Redis-based coordination
├── LPUSH/BLPOP signaling
├── Background execution
├── Progress monitoring
└── Cost: ~$0.054/iteration (95-98% savings)
```

---

## 1. Task-Mode-Safe Redis Coordination Patterns

### Pattern 1: Mode Detection and Enforcement

#### Detection Mechanism
```bash
#!/bin/bash
# cfn-task-mode-detect.sh

is_task_mode() {
    # Check if running in Task mode (spawned via Task() tool)
    if [[ -z "${TASK_ID:-}" || -z "${AGENT_ID:-}" ]]; then
        # Task mode - no Redis coordination parameters
        return 0
    else
        # CLI mode - Redis coordination available
        return 1
    fi
}
```

#### Enforcement Script
```bash
#!/bin/bash
# cfn-enforce-mode-compliance.sh

enforce_mode_compliance() {
    if is_task_mode; then
        echo "❌ TASK MODE DETECTED - Redis coordination forbidden" >&2
        echo "🚨 ANTI-023: Using Redis in Task mode causes memory leaks" >&2
        echo "💡 Use direct JSON output instead of Redis commands" >&2
        exit 1
    fi
}

# Block Redis operations in Task mode
enforce_mode_compliance

# Allow CLI mode Redis operations
redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete" 2>/dev/null || true
```

### Pattern 2: Safe Task Mode Coordination

#### Agent Compliance Wrapper
```bash
#!/bin/bash
# cfn-agent-safe-execution.sh

# Parse mode-specific execution parameters
MODE_DETECTION="${MODE_DETECTION:-auto}"
TASK_ID="${TASK_ID:-}"
AGENT_ID="${AGENT_ID:-}"

if [[ "$MODE_DETECTION" == "task" ]]; then
    # Task mode: Execute with direct output
    echo "🔧 Task mode execution: $*"
    exec "$@"
elif [[ "$MODE_DETECTION" == "cli" && -n "$TASK_ID" && -n "$AGENT_ID" ]]; then
    # CLI mode: Execute with Redis coordination
    echo "🔧 CLI mode execution with Redis coordination: $*"
    exec "$@"
else
    # Default to Task mode for safety
    echo "🔧 Defaulting to Task mode execution: $*"
    exec "$@"
fi
```

---

## 2. Redis Usage Specifications: CLI vs Task Modes

### CLI Mode Redis Operations

#### Allowed Operations (CLI Mode Only)
```bash
#!/bin/bash
# cfn-cli-redis-safe.sh

# Task mode check
if is_task_mode; then
    exit 1
fi

# CLI mode - Safe Redis operations
redis_cli() {
    if ! is_task_mode; then
        redis-cli "$@"
    else
        echo "❌ Redis operation forbidden in Task mode" >&2
        return 1
    fi
}

# Safe coordination operations
redis_cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
redis_cli SET "swarm:${TASK_ID}:${AGENT_ID}:confidence" "$CONFIDENCE" EX 3600
redis_cli HSET "swarm:${TASK_ID}:${AGENT_ID}:result" "confidence" "$CONFIDENCE"
```

#### Task Mode Alternative (Direct Output)
```bash
#!/bin/bash
# cfn-task-mode-completion.sh

# Task mode completion protocol
task_mode_complete() {
    local confidence="$1"
    local status="${2:-COMPLETE}"
    local summary="${3:-Work completed}"
    local deliverables=("${@:4}")

    # Generate JSON response
    local json_output="{"
    json_output+="\"confidence\": $confidence,"
    json_output+="\"status\": \"$status\","
    json_output+="\"summary\": \"$summary\","

    if [[ ${#deliverables[@]} -gt 0 ]]; then
        json_output+="\"deliverables\": ["
        local first=true
        for deliverable in "${deliverables[@]}"; do
            if [[ "$first" == true ]]; then
                first=false
            else
                json_output+=","
            fi
            json_output+="\"$deliverable\""
        done
        json_output+="],"
    fi

    json_output+="\"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
    json_output+="}"

    # Output directly to Main Chat
    echo "$json_output"
}

# Usage in Task mode agents
task_mode_complete 0.85 "COMPLETE" "API implementation complete" \
    "src/api/auth.js" "src/api/auth.test.js" "docs/API_AUTH.md"
```

### Mode-Specific Configuration

#### Environment Variable Patterns
```bash
# Task Mode Environment
export TASK_MODE=true
export CFN_MODE=task
export NO_REDIS_COORDINATION=true

# CLI Mode Environment
export TASK_MODE=false
export CFN_MODE=cli
export TASK_ID="task-123"
export AGENT_ID="agent-001"
```

#### Configuration File Structure
```json
{
  "cfn_loop": {
    "mode": "task|cli",
    "task_id": "task-123",
    "agent_id": "agent-001",
    "redis_coordination": {
      "enabled": false,
      "ttl": 3600,
      "host": "localhost",
      "port": 6379
    }
  }
}
```

---

## 3. Audit Trail and History Storage for Task Mode

### Task Mode Audit System

#### Local File-Based Audit Trail
```bash
#!/bin/bash
# cfn-task-mode-audit.sh

setup_task_audit() {
    local task_id="$1"
    local agent_id="$2"
    local audit_dir="./.claude/audit/task-mode"

    mkdir -p "$audit_dir"
    local audit_file="$audit_dir/${task_id}_${agent_id}_$(date +%Y%m%d_%H%M%S).json"

    export CFN_TASK_AUDIT_FILE="$audit_file"
}

log_task_execution() {
    local event="$1"
    local data="$2"
    local timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    if [[ -n "${CFN_TASK_AUDIT_FILE:-}" ]]; then
        cat >> "$CFN_TASK_AUDIT_FILE" <<EOF
{
  "timestamp": "$timestamp",
  "event": "$event",
  "data": $data,
  "mode": "task"
}
EOF
    fi
}

# Usage in Task mode agents
setup_task_audit "$TASK_ID" "$AGENT_ID"
log_task_execution "start" "{\"task\": \"API implementation\"}"
# ... agent work ...
log_task_execution "complete" "{\"confidence\": 0.85, \"deliverables\": [\"api.js\"]}"
```

### Centralized Audit Storage (Optional)

#### SQLite-Based Audit System
```javascript
// audit-storage.js
class TaskModeAudit {
    constructor() {
        this.dbPath = './.claude/audit/task-mode.db';
        this.initDatabase();
    }

    initDatabase() {
        const sqlite3 = require('sqlite3').verbose();
        this.db = new sqlite3.Database(this.dbPath);

        this.db.run(`
            CREATE TABLE IF NOT EXISTS task_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                event TEXT NOT NULL,
                data TEXT,
                mode TEXT DEFAULT 'task'
            )
        `);
    }

    logAudit(taskId, agentId, event, data) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO task_audit (task_id, agent_id, timestamp, event, data, mode)
                 VALUES (?, ?, ?, ?, ?, 'task')`,
                [taskId, agentId, new Date().toISOString(), event, JSON.stringify(data)],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
}

// Usage in Task mode agents
const audit = new TaskModeAudit();
await audit.logAudit('task-123', 'agent-001', 'complete', {
    confidence: 0.85,
    deliverables: ['api.js'],
    summary: 'API implementation complete'
});
```

---

## 4. Architectural Solutions for Redis Benefits Without Memory Leaks

### Solution 1: Mode-Aware Coordination System

#### Hybrid Coordination Architecture
```bash
#!/bin/bash
# cfn-hybrid-coordination.sh

CFN_HYBRID_COORDINATION="true"

cfn_hybrid_signal() {
    local event="$1"
    local data="$2"

    if is_task_mode; then
        # Task mode: Write to local file
        write_task_signal "$event" "$data"
    else
        # CLI mode: Use Redis
        write_redis_signal "$event" "$data"
    fi
}

write_task_signal() {
    local event="$1"
    local data="$2"
    local timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    echo "TASK_SIGNAL: $event at $timestamp" >> "./.claude/task-signals.log"
    echo "TASK_DATA: $data" >> "./.claude/task-signals.log"
}

write_redis_signal() {
    # CLI mode Redis implementation
    redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "$event" > /dev/null
}

# Usage across both modes
cfn_hybrid_signal "complete" "{\"confidence\": 0.85}"
```

### Solution 2: Context Preservation Without Redis

#### Task Mode Context Preservation
```javascript
// task-mode-context.js
class TaskModeContext {
    constructor(taskId) {
        this.taskId = taskId;
        this.contextPath = `./.claude/context/task-${taskId}.json`;
        this.loadContext();
    }

    loadContext() {
        if (fs.existsSync(this.contextPath)) {
            const data = fs.readFileSync(this.contextPath, 'utf8');
            this.context = JSON.parse(data);
        } else {
            this.context = {};
        }
    }

    saveContext() {
        fs.writeFileSync(this.contextPath, JSON.stringify(this.context, null, 2));
    }

    set(key, value) {
        this.context[key] = value;
        this.saveContext();
    }

    get(key, defaultValue = null) {
        return this.context[key] || defaultValue;
    }
}

// Usage in Task mode agents
const context = new TaskModeContext('task-123');
context.set('deliverables', ['api.js', 'test.js']);
context.set('confidence', 0.85);
const deliverables = context.get('deliverables', []);
```

### Solution 3: Agent Communication Without Redis

#### Direct File-Based Communication
```bash
#!/bin/bash
# cfn-task-communication.sh

# Task mode inter-agent communication
cfn_task_send_message() {
    local sender_id="$1"
    local receiver_id="$2"
    local message="$3"
    local timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    local message_file="./.claude/messages/${receiver_id}_$(date +%s).json"
    mkdir -p "$(dirname "$message_file")"

    cat > "$message_file" <<EOF
{
  "sender": "$sender_id",
  "receiver": "$receiver_id",
  "timestamp": "$timestamp",
  "message": $message
}
EOF
}

cfn_task_receive_messages() {
    local agent_id="$1"
    local message_dir="./.claude/messages"

    # Find messages for this agent
    find "$message_dir" -name "${agent_id}_*.json" -type f | head -10
}

# Usage between Task mode agents
cfn_task_send_message "coder" "reviewer" "{\"code\": \"function test() { return 42; }\"}"
```

---

## 5. Mode Detection and Enforcement Mechanisms

### Detection Strategy

#### Multi-Layer Detection
```bash
#!/bin/bash
# cfn-mode-detection.sh

detect_execution_mode() {
    local mode=""

    # 1. Environment variable check
    if [[ -n "${CFN_MODE:-}" ]]; then
        mode="$CFN_MODE"
        echo "🔍 Mode detected from CFN_MODE: $mode"
        return
    fi

    # 2. Task ID/Agent ID presence check
    if [[ -n "${TASK_ID:-}" && -n "${AGENT_ID:-}" ]]; then
        mode="cli"
        echo "🔍 Mode detected from TASK_ID/AGENT_ID: $mode"
        return
    fi

    # 3. Process inspection (check if spawned by Task() tool)
    if [[ "${PPID:-}" -gt 0 ]]; then
        local parent_cmd=$(ps -o comm= -p "$PPID" 2>/dev/null || echo "unknown")
        if [[ "$parent_cmd" == *"claude"* ]]; then
            mode="task"
            echo "🔍 Mode detected from parent process: $mode"
            return
        fi
    fi

    # 4. Fallback to task mode for safety
    mode="task"
    echo "🔍 Defaulting to safe mode: $mode"
}

enforce_mode_compliance() {
    local mode="$1"

    case "$mode" in
        "task")
            # Block Redis operations
            block_redis_operations
            ;;
        "cli")
            # Allow Redis operations
            allow_redis_operations
            ;;
        *)
            echo "❓ Unknown mode: $mode, defaulting to task mode"
            block_redis_operations
            ;;
    esac
}
```

### Runtime Enforcement

#### Dynamic Mode Switching
```bash
#!/bin/bash
# cfn-runtime-mode-enforcement.sh

CFN_RUNTIME_MODE="${CFN_RUNTIME_MODE:-task}"

runtime_mode_check() {
    local operation="$1"
    local required_mode="$2"

    if [[ "$CFN_RUNTIME_MODE" != "$required_mode" ]]; then
        echo "❌ Operation '$operation' requires $required_mode mode, current: $CFN_RUNTIME_MODE" >&2
        echo "💡 Switch mode: export CFN_RUNTIME_MODE=$required_mode" >&2
        return 1
    fi

    return 0
}

# Usage in scripts
if runtime_mode_check "redis_operation" "cli"; then
    redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
else
    # Task mode alternative
    echo "TASK_COMPLETE: $(date)" >> "./.claude/completion.log"
fi
```

---

## 6. Background Process Management for Task Mode

### Task Mode Background Execution

#### Safe Background Process Handling
```bash
#!/bin/bash
# cfn-task-background.sh

cfn_task_background() {
    local command="$1"
    local background_file="./.claude/background/$(date +%s)_$$.log"
    local pid_file="./.claude/background/$(date +%s)_$$.pid"

    mkdir -p "$(dirname "$background_file")"

    # Run in background with safe cleanup
    (
        echo "Background task started: $(date)"
        echo "Command: $command"
        echo "PID: $$"

        # Execute command
        eval "$command"

        echo "Background task completed: $(date)"
    ) > "$background_file" 2>&1 &

    echo $! > "$pid_file"
    echo "Background process started: $! (logs: $background_file)"

    # Set up cleanup trap
    trap 'cfn_task_cleanup_background $$' EXIT
}

cfn_task_cleanup_background() {
    local pid="$1"
    local pid_file="./.claude/background/$(date +%s)_$pid.pid"

    if [[ -f "$pid_file" ]]; then
        local bg_pid=$(cat "$pid_file")
        if kill -0 "$bg_pid" 2>/dev/null; then
            kill "$bg_pid" 2>/dev/null || true
        fi
        rm -f "$pid_file"
    fi
}

# Usage in Task mode agents
cfn_task_background "npm test --watch"
```

### Process Monitoring

#### Task Mode Process Monitor
```bash
#!/bin/bash
# cfn-task-monitor.sh

monitor_task_processes() {
    local task_id="$1"
    local monitor_file="./.claude/monitor/${task_id}_monitor.log"

    mkdir -p "$(dirname "$monitor_file")"

    while true; do
        echo "Monitor check: $(date)" >> "$monitor_file"

        # Check for stuck processes
        find /proc -name cmdline -exec grep -l "claude" {} \; 2>/dev/null | head -5 | \
        while read pid_file; do
            local pid=$(basename "$pid_file")
            local runtime=$(ps -o etimes= -p "$pid" 2>/dev/null || echo "0")
            echo "Process $pid runtime: $runtime seconds" >> "$monitor_file"
        done

        sleep 60
    done
}

# Start monitoring in background
monitor_task_processes "task-123" &
```

---

## Implementation Roadmap

### Phase 1: Core Protection (Week 1)
- [ ] Deploy mode detection scripts
- [ ] Implement Redis enforcement in Task mode
- [ ] Update all Task mode agents to use direct output
- [ ] Create audit trail system

### Phase 2: Enhanced Features (Week 2)
- [ ] Implement hybrid coordination system
- [ ] Add context preservation for Task mode
- [ ] Create inter-agent communication system
- [ ] Deploy background process management

### Phase 3: Optimization (Week 3)
- [ ] Performance testing and optimization
- [ ] Integration with existing CFN Loop validation
- [ ] Documentation and training materials
- [ ] Roll out to production agents

---

## Testing Strategy

### Unit Tests
```bash
#!/bin/bash
# test-mode-detection.sh
test_mode_detection() {
    # Test Task mode detection
    unset TASK_ID AGENT_ID CFN_MODE
    assert_equals "detect_execution_mode" "task" "$(detect_execution_mode)"

    # Test CLI mode detection
    export TASK_ID="test-123" AGENT_ID="agent-001"
    assert_equals "detect_execution_mode" "cli" "$(detect_execution_mode)"

    echo "✅ Mode detection tests passed"
}
```

### Integration Tests
```bash
#!/bin/bash
# test-task-mode-completion.sh
test_task_mode_completion() {
    # Test Task mode completion protocol
    local result=$(task_mode_complete 0.90 "COMPLETE" "Test completed")
    assert_contains "$result" "\"confidence\": 0.90"
    assert_contains "$result" "\"status\": \"COMPLETE\""

    echo "✅ Task mode completion tests passed"
}
```

---

## Risk Assessment

### Low Risk
- Mode detection scripts
- Local file-based audit trails
- Direct JSON output protocol

### Medium Risk
- Hybrid coordination system
- Background process management
- Context preservation

### High Risk
- SQLite integration (requires additional dependencies)
- Complex inter-agent communication

### Mitigation Strategies
1. **Rollout Strategy**: Start with low-risk features, gradually add complexity
2. **Fallback Mechanism**: Always provide safe fallback to Task mode
3. **Monitoring**: Implement comprehensive logging and monitoring
4. **Testing**: Thorough testing in development environment first

---

## Success Metrics

### Technical Metrics
- Zero memory leaks caused by mode confusion
- 100% mode detection accuracy
- < 100ms mode detection overhead
- 95%+ compliance with mode-specific protocols

### Business Metrics
- Successful transition from CLI to Task mode without disruption
- Maintained functionality across both modes
- Improved cost efficiency (95-98% savings for CLI mode)
- Enhanced debugging capabilities (Task mode visibility)

---

## Conclusion

This Task Mode Redis Safety Patterns document provides a comprehensive solution to the ANTI-023 memory leak issue while maintaining the benefits of both CLI and Task mode execution. The key principles are:

1. **Clear Mode Separation**: Task mode uses direct output, CLI mode uses Redis
2. **Automatic Detection**: Scripts detect mode and enforce compliance
3. **Fallback Safety**: Default to Task mode when uncertain
4. **Gradual Migration**: Enable new features while maintaining backward compatibility

By implementing these patterns, we can prevent memory leaks while preserving the architectural benefits of both execution modes.

---

**Next Steps:**
1. Review with team and stakeholders
2. Develop implementation plan based on roadmap
3. Begin Phase 1 implementation
4. Set up testing infrastructure
5. Prepare rollout strategy

**Related Documents:**
- `docs/bugs/BUG_MEMORY_LEAK_VALIDATOR_FIX.md` - ANTI-023 analysis
- `.claude/commands/cfn-loop-task.md` - Task mode specification
- `.claude/commands/cfn-loop-cli.md` - CLI mode specification