# Defensive Programming Patterns

Patterns learned from TEST 5 fix (orchestrator hang prevention) and production coordination systems.

---

## 1. Defensive File Handling

**Problem:** Reading agent output files fails when file missing or empty, causing bash script errors under `set -e`.

**Pattern:**
```bash
# Check existence AND size before reading
if [ -f "$FILE" ] && [ -s "$FILE" ]; then
  DATA=$(cat "$FILE")
  # Parse DATA safely
else
  # Set safe defaults
  DATA=""
  DECISION="ABORT"
  REASON="File missing or empty"
  echo "[WARNING] $FILE missing or empty, using defaults" >&2
fi
```

**Key Principles:**
- Test existence (`-f`) AND size (`-s`)
- Provide explicit defaults for all variables
- Log warnings for debugging
- Never leave coordination variables uninitialized

**When to Use:**
- Reading agent output files
- Parsing external process results
- Any file read with `set -e` active
- Coordination handoffs between processes

**Applied In:**
- `.claude/skills/cfn-product-owner-decision/execute-decision.sh`
- Orchestrator decision parsing
- Agent confidence collection

---

## 2. Process Group Management

**Problem:** Parent process exits but child processes remain running (zombie processes), causing resource leaks and port conflicts.

**Pattern:**
```bash
# Create process group for cleanup control
setsid long_running_command &
PID=$!
PGID=$(ps -o pgid= -p $PID | tr -d ' ')

# Trap for guaranteed cleanup
cleanup() {
  echo "[INFO] Cleaning up process group $PGID"
  kill -TERM -$PGID 2>/dev/null || true
  sleep 1
  kill -KILL -$PGID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait with timeout
timeout 300 wait $PID || {
  echo "[ERROR] Process timeout, forcing cleanup"
  cleanup
  exit 1
}
```

**Key Principles:**
- Use `setsid` to create new process group
- Store both PID and PGID
- Trap EXIT, INT, TERM for all exit paths
- TERM first, then KILL after grace period
- Never assume process exits cleanly

**When to Use:**
- Long-running background processes
- Orchestrator spawning multiple agents
- Test suites with subprocess coordination
- Any process that may spawn children

**Applied In:**
- `tests/cfn-v3/test-e2e-cfn-loop.sh`
- CFN Loop orchestrator tests
- Background agent spawning

---

## 3. Redis Key Guarantees

**Problem:** Blocking operations (BLPOP) hang indefinitely when dependent keys never created due to upstream errors.

**Pattern:**
```bash
# ALWAYS create key, even on error path
DECISION="${PARSED_DECISION:-ABORT}"
CONFIDENCE="${EXTRACTED_CONFIDENCE:-0.0}"

# Guarantee key creation
redis-cli LPUSH "swarm:$TASK_ID:decision" "$DECISION" >/dev/null
redis-cli LPUSH "swarm:$TASK_ID:confidence:$AGENT_ID" "$CONFIDENCE" >/dev/null

# Log what was stored
echo "[INFO] Stored $DECISION to Redis (confidence: $CONFIDENCE)"
```

**Key Principles:**
- Create coordination keys in all code paths (success and error)
- Use fallback defaults (`:-ABORT`, `:-0.0`)
- Never leave BLPOP dependencies unsatisfied
- Log key creation for debugging

**When to Use:**
- Coordination keys (decision, confidence, status)
- BLPOP dependencies
- Critical handoffs between agents
- Any key that blocks downstream processes

**Applied In:**
- `.claude/skills/cfn-product-owner-decision/execute-decision.sh`
- Orchestrator confidence collection
- Loop 2/Loop 3 completion signals

---

## 4. Error Propagation with Context

**Pattern:**
```bash
# Capture error with context
operation() {
  local file="$1"
  if ! process_file "$file"; then
    echo "[ERROR] Failed to process $file: $(cat error.log 2>/dev/null || echo 'no details')" >&2
    return 1
  fi
}

# Propagate with enriched context
if ! operation "$TARGET_FILE"; then
  echo "[ERROR] Operation failed at step 3 (file processing)" >&2
  cleanup
  exit 1
fi
```

**Key Principles:**
- Capture error details at source
- Add context at each propagation layer
- Include relevant state (file names, IDs, step numbers)
- Write to stderr for visibility

**When to Use:**
- Multi-layer operations
- Error debugging in production
- Complex coordination flows

---

## 5. Timeout with Fallback

**Pattern:**
```bash
# Timeout with explicit fallback
RESULT=$(timeout 60 redis-cli BLPOP "swarm:$TASK_ID:key" 60 2>/dev/null || echo "")

if [ -z "$RESULT" ]; then
  echo "[WARNING] Timeout waiting for key, using default" >&2
  RESULT="default_value"
fi
```

**Key Principles:**
- Use `timeout` command for external operations
- Provide explicit fallback values
- Log timeout events
- Never block indefinitely

**When to Use:**
- Redis BLPOP operations
- External API calls
- Agent spawn waits
- File system waits

---

## Summary: Defensive Checklist

**Before Reading Files:**
- [ ] Check existence AND size
- [ ] Provide defaults for all variables
- [ ] Log warnings on failure

**Before Spawning Processes:**
- [ ] Use setsid for process groups
- [ ] Setup cleanup trap
- [ ] Store PID and PGID

**Before BLPOP Operations:**
- [ ] Ensure upstream creates key in ALL paths
- [ ] Use timeout with fallback
- [ ] Log key creation/consumption

**Before Returning Errors:**
- [ ] Add context (step, file, ID)
- [ ] Write to stderr
- [ ] Propagate with enrichment

---

**Reference:**
- TEST 5 Fix: `tests/cfn-v3/test-e2e-cfn-loop.sh`
- Decision Pattern: `.claude/skills/cfn-product-owner-decision/execute-decision.sh`
- Process Management: `tests/test-orchestrator.sh`
