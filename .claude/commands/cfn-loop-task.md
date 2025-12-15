---
description: "Execute CFN Loop in Task Mode with direct agent spawning (visible in main chat)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--max-iterations=n] [--ace-reflect]"
allowed-tools: ["Task", "TodoWrite", "Read", "Bash", "SlashCommand"]
---

# CFN Loop Task Mode - Direct Agent Spawning

**Version:** 1.3.0  |  **Date:** 2025-12-14  |  **Status:** Production Ready

## Quick Overview

Task Mode spawns agents directly in main chat with full visibility. Uses test-driven gate validation (not confidence scores).

### When to Use Task Mode
- **Debugging** - Need to see agent thought process
- **Learning** - Understanding how agents work
- **Complex coordination** - Require custom agent interactions

---

## TDD Gate Enforcement (MANDATORY)

**Gate checks are based on TEST PASS RATES, not confidence scores.**

After Loop 3 agents complete, run gate validation:
```bash
# Get test results
TEST_OUTPUT=$(npm test 2>&1 || true)
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= passed)' | head -1 || echo "0")
TOTAL_COUNT=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= total)' | head -1 || echo "1")

# Calculate pass rate
if [ "$TOTAL_COUNT" -gt 0 ]; then
  PASS_RATE=$(echo "scale=4; $PASS_COUNT / $TOTAL_COUNT" | bc)
else
  PASS_RATE="0"
fi

# Validate gate
npx ts-node .claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/src/helpers/gate-check.ts \
  --pass-rate "$PASS_RATE" \
  --mode "$MODE"
```

### Gate Thresholds
| Mode | Pass Rate Threshold |
|------|-------------------|
| MVP | 70% |
| Standard | 95% |
| Enterprise | 98% |

**CRITICAL:** Validators MUST NOT start until gate check passes.

---

## Post-Edit Pipeline (MANDATORY)

After ANY file modification, run:
```bash
./.claude/hooks/cfn-invoke-post-edit.sh "$FILE_PATH" --agent-id "$AGENT_ID"
```

Or if using project-local pipeline:
```bash
node config/hooks/post-edit-pipeline.js "$FILE" --agent-id "${AGENT_ID:-hook}"
```

---

## Execution Instructions (AUTO-EXECUTE)

**Step 1: Parse Arguments**
```bash
TASK_DESCRIPTION="$ARGUMENTS"
TASK_DESCRIPTION=$(echo "$TASK_DESCRIPTION" | sed 's/--mode[[:space:]]*[a-zA-Z]*//' | sed 's/--max-iterations[[:space:]]*[0-9]*//' | xargs)

MODE="standard"
MAX_ITERATIONS=10

for arg in $ARGUMENTS; do
  case $arg in
    --mode=*) MODE="${arg#*=}" ;;
    --max-iterations=*) MAX_ITERATIONS="${arg#*=}" ;;
  esac
done

if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
  echo "ERROR: Invalid mode '$MODE'. Must be: mvp, standard, enterprise"
  exit 1
fi

TASK_ID="cfn-task-$(date +%s%N | tail -c 7)-${RANDOM}"
echo "Task ID: $TASK_ID | Mode: $MODE | Max Iterations: $MAX_ITERATIONS"
```

**Step 2: Spawn Loop 3 Agents (Implementation)**
```bash
case $MODE in
  "mvp")
    Task("backend-developer", `
      AGENT_ID="backend-dev-${TASK_ID}"

      TASK: Implement MVP for: ${TASK_DESCRIPTION}

      TDD REQUIREMENTS (MANDATORY):
      1. Write tests BEFORE implementation (Red phase)
      2. Implement to make tests pass (Green phase)
      3. Refactor while keeping tests green
      4. Run: npm test -- --reporter=json after implementation
      5. Report actual pass/fail counts, NOT confidence scores

      POST-EDIT (MANDATORY):
      After each file edit, run:
      ./.claude/hooks/cfn-invoke-post-edit.sh "$FILE_PATH" --agent-id "$AGENT_ID"

      RETURN FORMAT:
      {
        "tests_passed": <number>,
        "tests_total": <number>,
        "pass_rate": <0.0-1.0>,
        "files_created": [...],
        "files_modified": [...]
      }
    `)
    ;;

  "standard"|"enterprise")
    Task("backend-developer", `
      AGENT_ID="backend-dev-${TASK_ID}"

      TASK: Implement production solution for: ${TASK_DESCRIPTION}

      TDD REQUIREMENTS (MANDATORY - London School):
      1. Write unit tests with mocks FIRST
      2. Write integration tests for component interactions
      3. Implement to make all tests pass
      4. Achieve ${MODE === 'standard' ? '80' : '95'}% coverage minimum
      5. Run: npm test -- --reporter=json after implementation
      6. Report actual pass/fail counts, NOT confidence scores

      POST-EDIT (MANDATORY):
      After each file edit, run:
      ./.claude/hooks/cfn-invoke-post-edit.sh "$FILE_PATH" --agent-id "$AGENT_ID"

      RETURN FORMAT:
      {
        "tests_passed": <number>,
        "tests_total": <number>,
        "pass_rate": <0.0-1.0>,
        "coverage_percent": <number>,
        "files_created": [...],
        "files_modified": [...]
      }
    `)
    ;;
esac
```

**Step 3: Run Gate Check (BEFORE validators)**
```bash
echo "Running gate check..."

# Parse agent output for test results
TESTS_PASSED=${LOOP3_RESULT.tests_passed:-0}
TESTS_TOTAL=${LOOP3_RESULT.tests_total:-1}
PASS_RATE=$(echo "scale=4; $TESTS_PASSED / $TESTS_TOTAL" | bc)

# Run gate validation
GATE_RESULT=$(npx ts-node .claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/src/helpers/gate-check.ts \
  --pass-rate "$PASS_RATE" \
  --mode "$MODE" 2>&1)

if echo "$GATE_RESULT" | grep -q '"passed": false'; then
  echo "GATE FAILED - Iterating Loop 3"
  # Re-run Loop 3 with feedback
  ITERATION=$((ITERATION + 1))
  if [ $ITERATION -lt $MAX_ITERATIONS ]; then
    # Spawn Loop 3 again with failure context
    continue
  else
    echo "Max iterations reached. Gate still failing."
    exit 1
  fi
fi

echo "GATE PASSED - Proceeding to validators"
```

**Step 4: Spawn Loop 2 Validators (ONLY after gate passes)**
```bash
Task("code-reviewer", `
  AGENT_ID="reviewer-${TASK_ID}"

  TASK: Validate implementation for: ${TASK_DESCRIPTION}

  VALIDATION CHECKLIST:
  - [ ] Tests exist for all new code
  - [ ] Tests follow TDD pattern (written before implementation)
  - [ ] Coverage meets threshold for ${MODE} mode
  - [ ] No hardcoded secrets or credentials
  - [ ] Post-edit hooks were invoked

  Return: PASS or FAIL with specific findings
`)

Task("tester", `
  AGENT_ID="tester-${TASK_ID}"

  TASK: Run comprehensive tests for: ${TASK_DESCRIPTION}

  Execute:
  1. npm test -- --coverage
  2. Report pass/fail counts
  3. Report coverage percentages

  Return: Test report with actual metrics, not estimates
`)
```

**Step 5: Product Owner Decision**
```bash
# Collect validator results
VALIDATOR_PASS_COUNT=0
VALIDATOR_TOTAL=2

for result in "${VALIDATOR_RESULTS[@]}"; do
  if echo "$result" | grep -qi "PASS"; then
    VALIDATOR_PASS_COUNT=$((VALIDATOR_PASS_COUNT + 1))
  fi
done

CONSENSUS_RATE=$(echo "scale=2; $VALIDATOR_PASS_COUNT / $VALIDATOR_TOTAL" | bc)

# Mode-specific consensus thresholds
case $MODE in
  "mvp") CONSENSUS_THRESHOLD="0.80" ;;
  "standard") CONSENSUS_THRESHOLD="0.90" ;;
  "enterprise") CONSENSUS_THRESHOLD="0.95" ;;
esac

if (( $(echo "$CONSENSUS_RATE >= $CONSENSUS_THRESHOLD" | bc -l) )); then
  echo "PROCEED - Consensus reached ($CONSENSUS_RATE >= $CONSENSUS_THRESHOLD)"
else
  echo "ITERATE - Consensus not met ($CONSENSUS_RATE < $CONSENSUS_THRESHOLD)"
  # Loop back to Step 2
fi
```

---

## Related Documentation

- **Full Task Mode Guide**: `.claude/commands/cfn-loop/cfn-loop-task.md`
- **CLI Mode Guide**: `.claude/commands/cfn-loop/cfn-loop-cli.md`
- **Gate Check Implementation**: `.claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/src/helpers/gate-check.ts`

---

**Version History:**
- v1.3.0 (2025-12-14) - Fixed to use test-based gate checks, not confidence scores
- v1.2.0 (2025-12-08) - Added TDD enforcement
- v1.1.0 (2025-12-01) - Added RuVector integration
