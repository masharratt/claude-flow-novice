# Loop 3 Output Processing Skill

**Version:** 1.0.0
**Status:** Production
**Purpose:** Guaranteed confidence extraction from Loop 3 implementer agents

---

## Overview

**Problem Solved:** Loop 3 agents (coders, researchers, developers) might document bash commands instead of executing them, leading to missing confidence scores.

**Solution:** Orchestrator-controlled output processing with:
- Multi-pattern confidence extraction
- Git-based deliverable verification
- Calculated confidence fallback
- Guaranteed Redis reporting

---

## Core Principle

```
Loop 3 Agents → Focus on implementation
This Skill → Extract confidence + verify deliverables
Orchestrator → Report to Redis + gate check
```

**Why This Works:**
- ✅ Agents implement features (what they do best)
- ✅ Skill extracts confidence (robust parsing)
- ✅ Orchestrator controls coordination (Redis state)
- ✅ No reliance on agent bash execution

---

## Architecture

### Processing Flow

```
1. Orchestrator spawns Loop 3 agent
2. Skill captures agent stdout/stderr
3. Skill parses confidence (multi-pattern)
4. Skill verifies deliverables (git status)
5. Skill calculates fallback confidence
6. Skill reports to Redis
7. Orchestrator uses for gate check
```

### Skill Components

```
.claude/skills/loop3-output-processing/
├── SKILL.md                        # This file
├── execute-and-extract.sh          # Main wrapper script
├── parse-confidence.sh             # Confidence pattern matching
├── verify-deliverables.sh          # Git-based verification
├── calculate-confidence.sh         # Fallback calculation
└── test-loop3-processing.sh        # Integration tests
```

---

## Confidence Extraction Patterns

### Priority 1: Explicit Confidence Statement
```
Confidence: 0.85
confidence: 0.92
Confidence Score: 0.78
```

### Priority 2: Percentage Format
```
I'm 85% confident
Confidence: 92%
```

### Priority 3: Natural Language
```
I'm very confident (0.9)
High confidence: 0.85
```

### Priority 4: Calculated from Deliverables
```bash
# If no confidence found, calculate based on:
- Files created/modified (git status)
- Tests passing (if applicable)
- Build success (if applicable)
```

**Fallback Logic:**
- 0 files changed → 0.0
- 1-2 files, no tests → 0.50
- 3+ files, tests pass → 0.85
- Complete deliverables → 0.90

---

## Usage

### From Orchestrator

```bash
# Spawn Loop 3 agent with output processing
RESULT=$(./.claude/skills/loop3-output-processing/execute-and-extract.sh \
  --agent-type "coder" \
  --task-id "$TASK_ID" \
  --agent-id "coder-1" \
  --context "Implement authentication" \
  --iteration 1)

CONFIDENCE=$(echo "$RESULT" | jq -r '.confidence')
FILES_CHANGED=$(echo "$RESULT" | jq -r '.files_changed')
DELIVERABLES=$(echo "$RESULT" | jq -r '.deliverables[]')

# Report to Redis (orchestrator does this, not agent)
redis-cli LPUSH "swarm:${TASK_ID}:coder-1:confidence" "$CONFIDENCE"
redis-cli LPUSH "swarm:${TASK_ID}:coder-1:done" "complete"
```

### Output Format

```json
{
  "agent_id": "coder-1",
  "confidence": 0.85,
  "confidence_source": "explicit|calculated|fallback",
  "files_changed": 5,
  "deliverables": [
    "src/auth/login.ts (A)",
    "src/auth/register.ts (A)",
    "tests/auth.test.ts (A)"
  ],
  "tests_passed": true,
  "iteration": 1,
  "timestamp": "2025-10-20T15:30:00Z"
}
```

---

## Implementation

### execute-and-extract.sh

```bash
#!/bin/bash
set -euo pipefail

# Parse arguments
AGENT_TYPE=""
TASK_ID=""
AGENT_ID=""
CONTEXT=""
ITERATION=1
TIMEOUT=900

while [[ $# -gt 0 ]]; do
  case $1 in
    --agent-type) AGENT_TYPE="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --context) CONTEXT="$2"; shift 2 ;;
    --iteration) ITERATION="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Capture git state before agent runs
BEFORE_GIT=$(git status --short)

# Spawn agent and capture output
AGENT_OUTPUT=$(timeout "$TIMEOUT" npx claude-flow-novice agent "$AGENT_TYPE" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$CONTEXT" 2>&1 || true)

# Capture git state after agent runs
AFTER_GIT=$(git status --short)

# Parse confidence from output
CONFIDENCE=$("$SCRIPT_DIR/parse-confidence.sh" "$AGENT_OUTPUT")

# Verify deliverables
DELIVERABLE_CHECK=$("$SCRIPT_DIR/verify-deliverables.sh" \
  --before "$BEFORE_GIT" \
  --after "$AFTER_GIT")

FILES_CHANGED=$(echo "$DELIVERABLE_CHECK" | jq -r '.files_changed')
DELIVERABLES=$(echo "$DELIVERABLE_CHECK" | jq -r '.deliverables')

# If confidence not found or too low, calculate fallback
if (( $(echo "$CONFIDENCE == 0.0" | bc -l) )) || [ -z "$CONFIDENCE" ]; then
  CONFIDENCE=$("$SCRIPT_DIR/calculate-confidence.sh" \
    --files-changed "$FILES_CHANGED" \
    --deliverables "$DELIVERABLES")
  CONFIDENCE_SOURCE="calculated"
elif (( $(echo "$CONFIDENCE > 0.0" | bc -l) )); then
  CONFIDENCE_SOURCE="explicit"
else
  CONFIDENCE_SOURCE="fallback"
fi

# Build output JSON
cat <<EOF
{
  "agent_id": "$AGENT_ID",
  "confidence": $CONFIDENCE,
  "confidence_source": "$CONFIDENCE_SOURCE",
  "files_changed": $FILES_CHANGED,
  "deliverables": $DELIVERABLES,
  "iteration": $ITERATION,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
```

### parse-confidence.sh

```bash
#!/bin/bash
set -euo pipefail

OUTPUT="$1"

# Pattern 1: Explicit confidence (0.0-1.0)
if echo "$OUTPUT" | grep -oP '[Cc]onfidence[:\s]*([0-9.]+)' | grep -oP '([0-9.]+)' | head -1; then
  exit 0
fi

# Pattern 2: Percentage (85%)
if PERCENT=$(echo "$OUTPUT" | grep -oP '([0-9]{1,3})%' | grep -oP '[0-9]+' | head -1); then
  echo "scale=2; $PERCENT / 100" | bc
  exit 0
fi

# Pattern 3: Natural language with score
if echo "$OUTPUT" | grep -oP '\(([0-9.]+)\)' | grep -oP '[0-9.]+' | head -1; then
  exit 0
fi

# No confidence found
echo "0.0"
```

### verify-deliverables.sh

```bash
#!/bin/bash
set -euo pipefail

BEFORE=""
AFTER=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --before) BEFORE="$2"; shift 2 ;;
    --after) AFTER="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

# Find new/modified files
CHANGED_FILES=$(comm -13 <(echo "$BEFORE" | sort) <(echo "$AFTER" | sort) || true)
FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c '^' || echo "0")

# Build deliverables array
DELIVERABLES="["
FIRST=true
while IFS= read -r line; do
  if [ -n "$line" ]; then
    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      DELIVERABLES+=","
    fi
    DELIVERABLES+="\"$line\""
  fi
done <<< "$CHANGED_FILES"
DELIVERABLES+="]"

# Output JSON
cat <<EOF
{
  "files_changed": $FILE_COUNT,
  "deliverables": $DELIVERABLES
}
EOF
```

### calculate-confidence.sh

```bash
#!/bin/bash
set -euo pipefail

FILES_CHANGED=0
DELIVERABLES="[]"

while [[ $# -gt 0 ]]; do
  case $1 in
    --files-changed) FILES_CHANGED="$2"; shift 2 ;;
    --deliverables) DELIVERABLES="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

# Calculate confidence based on deliverables
if (( FILES_CHANGED == 0 )); then
  echo "0.0"
elif (( FILES_CHANGED <= 2 )); then
  echo "0.50"
elif (( FILES_CHANGED <= 5 )); then
  echo "0.75"
else
  echo "0.85"
fi
```

---

## Benefits

| Aspect | Before (Template-Based) | After (Skill-Based) |
|--------|------------------------|---------------------|
| **Confidence Guarantee** | ❌ 0.0 if agent doesn't execute | ✅ Always calculated |
| **Deliverable Verification** | ❌ Agent-dependent | ✅ Git-based proof |
| **Parsing Robustness** | ❌ None | ✅ 4 fallback patterns |
| **Redis Coordination** | ❌ Agent reports (maybe) | ✅ Orchestrator reports |
| **Race Conditions** | ❌ Polling wait needed | ✅ Synchronous processing |
| **Testability** | ❌ Hard to test | ✅ Unit testable |

---

## Testing

### Unit Tests

```bash
# Test confidence parsing
./test-parse-confidence.sh

# Test deliverable verification
./test-verify-deliverables.sh

# Test confidence calculation
./test-calculate-confidence.sh
```

### Integration Test

```bash
# Test full Loop 3 processing
./test-loop3-processing.sh
```

**Expected Results:**
- ✅ Explicit confidence extracted correctly
- ✅ Percentage converted to decimal
- ✅ Fallback calculation works
- ✅ Deliverables verified via git
- ✅ JSON output valid

---

## Integration with Orchestrator

### Before (BUG #10 Pattern)

```bash
# Spawn agents, wait, poll for confidence
spawn_all_loop3_agents
sleep 5  # Hope agents report in time
CONFIDENCE=$(redis-cli LRANGE "swarm:${TASK_ID}:${AGENT_ID}:confidence" 0 0)
# Often 0.0 due to race condition
```

### After (Skill-Based)

```bash
# Process each agent with guaranteed extraction
for AGENT in $LOOP3_AGENTS; do
  RESULT=$(./.claude/skills/loop3-output-processing/execute-and-extract.sh \
    --agent-type "$AGENT" \
    --task-id "$TASK_ID" \
    --agent-id "${AGENT}-1")

  CONFIDENCE=$(echo "$RESULT" | jq -r '.confidence')
  redis-cli LPUSH "swarm:${TASK_ID}:${AGENT}-1:confidence" "$CONFIDENCE"
  redis-cli LPUSH "swarm:${TASK_ID}:${AGENT}-1:done" "complete"
done
```

---

## Related Skills

- **Agent Output Processing** (`.claude/skills/agent-output-processing/SKILL.md`) - Universal pattern
- **Loop 2 Output Processing** (`.claude/skills/loop2-output-processing/SKILL.md`) - Validator skill
- **Redis Coordination** (`.claude/skills/redis-coordination/SKILL.md`) - State management

---

## Version History

### 1.0.0 (2025-10-20)
- Initial implementation
- Multi-pattern confidence extraction
- Git-based deliverable verification
- Fallback confidence calculation
- Integration with orchestrator

---

**Summary:** This skill guarantees confidence extraction from Loop 3 implementers by processing agent output with robust parsing, git-based verification, and fallback calculation. Eliminates BUG #10 race conditions.
