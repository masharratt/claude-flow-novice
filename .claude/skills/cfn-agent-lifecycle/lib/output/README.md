# Agent Output Processing Skill (Universal)

**Version:** 1.0.0
**Status:** Production
**Purpose:** Guaranteed structured output extraction from any agent type

---

## Overview

**Problem Solved:** Agent templates cannot force tool execution or guarantee output format.

**Solution:** Orchestrator-controlled output processing with robust parsing, validation, and Redis coordination.

**Applicable To:** Any agent requiring structured output (Product Owner, validators, analyzers, decision-makers)

---

## Core Principle

```
Agent Templates → Focus on analysis/decision-making
Skills → Handle execution/coordination/formatting
Orchestrators → Control workflow and Redis state
```

**Why This Works:**
- ✅ Agents do what they're good at (analysis)
- ✅ Skills enforce structure (parsing, validation)
- ✅ Orchestrators maintain coordination (Redis, timing)
- ✅ No reliance on agent tool usage compliance

---

## Architecture

### Generic Flow

```
1. Orchestrator → Spawn agent with structured context
2. Skill → Capture agent stdout/stderr
3. Skill → Parse output (pattern matching with fallbacks)
4. Skill → Validate output (business logic checks)
5. Skill → Transform to required format (JSON, etc.)
6. Skill → Push to Redis (coordination state)
7. Skill → Signal completion
```

### Skill Components

```
.claude/skills/agent-output-processing/
├── SKILL.md                          # This file
├── execute-with-parsing.sh           # Generic agent wrapper
├── parse-structured-output.sh        # Multi-pattern parser
├── validate-output.sh                # Validation framework
└── patterns/                         # Agent-specific patterns
    ├── product-owner.json            # PROCEED/ITERATE/ABORT
    ├── validator.json                # confidence + feedback
    ├── analyzer.json                 # metrics + recommendations
    └── decision-maker.json           # choice + reasoning
```

---

## Usage Patterns

### Pattern 1: Decision Output (Product Owner)

**Output Requirements:** Must extract PROCEED/ITERATE/ABORT

```bash
RESULT=$(./.claude/skills/agent-output-processing/execute-with-parsing.sh \
  --agent-type "product-owner" \
  --pattern-file "patterns/product-owner.json" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "Loop 2 consensus: 0.92" \
  --redis-key "swarm:${TASK_ID}:${AGENT_ID}:decision")

DECISION=$(echo "$RESULT" | jq -r '.decision')
```

**Pattern File (patterns/product-owner.json):**
```json
{
  "name": "product-owner-decision",
  "required_fields": ["decision"],
  "patterns": [
    {
      "field": "decision",
      "regex": "Decision:\\s*(PROCEED|ITERATE|ABORT)",
      "extract": "keyword",
      "fallbacks": [
        "(PROCEED|ITERATE|ABORT)",
        "(?i)(proceed|iterate|abort)"
      ]
    },
    {
      "field": "reasoning",
      "regex": "Reasoning:\\s*(.+)",
      "extract": "capture_group"
    }
  ],
  "validation": {
    "decision": {
      "type": "enum",
      "values": ["PROCEED", "ITERATE", "ABORT"]
    }
  }
}
```

### Pattern 2: Confidence + Feedback (Validators)

**Output Requirements:** Must extract confidence score and feedback list

```bash
RESULT=$(./.claude/skills/agent-output-processing/execute-with-parsing.sh \
  --agent-type "reviewer" \
  --pattern-file "patterns/validator.json" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "Review Loop 3 implementation" \
  --redis-key "swarm:${TASK_ID}:${AGENT_ID}:result")

CONFIDENCE=$(echo "$RESULT" | jq -r '.confidence')
FEEDBACK=$(echo "$RESULT" | jq -r '.feedback[]')
```

**Pattern File (patterns/validator.json):**
```json
{
  "name": "validator-result",
  "required_fields": ["confidence"],
  "patterns": [
    {
      "field": "confidence",
      "regex": "Confidence:\\s*([0-9.]+)",
      "extract": "float",
      "fallbacks": [
        "confidence[:\\s]+([0-9.]+)",
        "score[:\\s]+([0-9.]+)"
      ]
    },
    {
      "field": "feedback",
      "regex": "Feedback:\\s*\\n([\\s\\S]+?)(?=\\n\\n|$)",
      "extract": "multiline_list"
    }
  ],
  "validation": {
    "confidence": {
      "type": "float",
      "min": 0.0,
      "max": 1.0
    }
  }
}
```

### Pattern 3: Metrics + Recommendations (Analyzers)

**Output Requirements:** Must extract metrics object and recommendation list

```bash
RESULT=$(./.claude/skills/agent-output-processing/execute-with-parsing.sh \
  --agent-type "code-analyzer" \
  --pattern-file "patterns/analyzer.json" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "Analyze codebase quality" \
  --redis-key "swarm:${TASK_ID}:${AGENT_ID}:analysis")

COMPLEXITY=$(echo "$RESULT" | jq -r '.metrics.complexity')
RECOMMENDATIONS=$(echo "$RESULT" | jq -r '.recommendations[]')
```

---

## Implementation

### execute-with-parsing.sh

```bash
#!/bin/bash
set -euo pipefail

# Parse arguments
AGENT_TYPE=""
PATTERN_FILE=""
TASK_ID=""
AGENT_ID=""
CONTEXT=""
REDIS_KEY=""
TIMEOUT=900

while [[ $# -gt 0 ]]; do
  case $1 in
    --agent-type) AGENT_TYPE="$2"; shift 2 ;;
    --pattern-file) PATTERN_FILE="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --context) CONTEXT="$2"; shift 2 ;;
    --redis-key) REDIS_KEY="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

# Spawn agent and capture output
AGENT_OUTPUT=$(timeout "$TIMEOUT" npx claude-flow-novice agent "$AGENT_TYPE" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$CONTEXT" 2>&1 || true)

# Parse structured output using pattern file
PARSED_OUTPUT=$(./parse-structured-output.sh \
  --pattern-file "$PATTERN_FILE" \
  --output "$AGENT_OUTPUT")

# Validate parsed output
if ! ./validate-output.sh --pattern-file "$PATTERN_FILE" --data "$PARSED_OUTPUT"; then
  echo "ERROR: Output validation failed" >&2
  exit 1
fi

# Push to Redis if key provided
if [ -n "$REDIS_KEY" ]; then
  echo "$PARSED_OUTPUT" | redis-cli -x LPUSH "$REDIS_KEY" >/dev/null
  redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete" >/dev/null
fi

# Output structured result
echo "$PARSED_OUTPUT"
```

---

## Benefits Over Template-Based

| Aspect | Template-Based | Skill-Based (Universal) |
|--------|----------------|-------------------------|
| **Execution Guarantee** | ❌ Agent decides | ✅ Skill enforces |
| **Output Format** | ❌ Inconsistent | ✅ Guaranteed structure |
| **Parsing Robustness** | ❌ None | ✅ Multi-pattern fallbacks |
| **Validation** | ❌ Manual | ✅ Automated schema checks |
| **Redis Coordination** | ❌ Agent-dependent | ✅ Skill-controlled |
| **Reusability** | ❌ Per-agent templates | ✅ Universal pattern system |
| **Testability** | ❌ Hard to test | ✅ Unit tests per pattern |
| **Extensibility** | ❌ Template changes | ✅ Add pattern files |

---

## Agent-Specific Implementations

### Existing: Product Owner Decision
**Location:** `.claude/skills/product-owner-decision/`
**Pattern:** PROCEED/ITERATE/ABORT extraction
**Status:** ✅ Operational (BUG #11 fix)

### Future: Validator Agents
**Pattern:** Confidence + feedback extraction
**Use Case:** Loop 2 validators (reviewer, tester, security)
**Benefit:** Guaranteed confidence scoring

### Future: Analyzer Agents
**Pattern:** Metrics + recommendations extraction
**Use Case:** Code quality, performance, security analyzers
**Benefit:** Structured analysis output

---

## Migration Strategy

### Phase 1: Product Owner (✅ Complete)
- Created dedicated skill
- Integrated with orchestrator
- Solves BUG #11

### Phase 2: Validators (Planned)
- Extract confidence scores reliably
- Parse feedback into structured lists
- Prevent 0.0 confidence issues

### Phase 3: All Decision-Making Agents (Future)
- Standardize output processing
- Centralize pattern definitions
- Enable cross-agent consistency

---

## Testing

### Unit Tests
```bash
# Test pattern parsing
./test-parse-structured-output.sh --pattern-file patterns/product-owner.json

# Test validation logic
./test-validate-output.sh --pattern-file patterns/validator.json
```

### Integration Tests
```bash
# Test full agent execution with parsing
./test-execute-with-parsing.sh --agent-type product-owner
```

---

## Related Skills

- **Product Owner Decision** (`.claude/skills/cfn-loop-orchestration-v2/lib/decision/SKILL.md`) - Specific implementation
- **Redis Coordination** (`.claude/skills/cfn-memory-persistence/lib/redis/SKILL.md`) - State management
- **CFN Loop Validation** (`.claude/skills/cfn-loop-orchestration-v2/lib/validation/SKILL.md`) - Quality gates

---

## Lessons Learned

### ANTI-PATTERN: Template-Forced Tool Usage
**What Doesn't Work:** Telling agents "Use Bash tool to execute X"

**Why:** Agents interpret instructions autonomously, treating code blocks as documentation

**Better:** Capture agent output and parse it with robust patterns

### PATTERN: Orchestrator Control
**Principle:** Coordination belongs in orchestrators/skills, not agent templates

**Rationale:**
- Agents focus on analysis (what they do well)
- Skills handle structure (parsing, validation)
- Orchestrators manage coordination (Redis, timing)

### PATTERN: Multi-Fallback Parsing
**Principle:** Use multiple pattern matching strategies with increasing leniency

**Example:**
1. Strict: "Decision: PROCEED" (labeled, exact case)
2. Moderate: "PROCEED" (standalone keyword)
3. Lenient: "proceed" (case-insensitive)
4. Desperate: JSON extraction

---

## Version History

### 1.0.0 (2025-10-20)
- Initial skill creation
- Generalized from Product Owner fix
- Universal pattern-based output processing
- Validation framework
- Redis coordination integration

---

**Summary:** This skill provides universal output processing for any agent type, eliminating reliance on template-based tool usage compliance and guaranteeing structured, validated results.
