---
description: "Coordinate agents to fix compilation errors using post-edit validation and Cerebras gates"
argument-hint: "<language> [--max-parallel=5] [--max-cycles=10]"
allowed-tools: ["Task", "TaskOutput", "TodoWrite", "Read", "Bash"]
---

# CFN Fix Errors - Coordination Mode

**Version:** 1.0.0  |  **Date:** 2025-12-21  |  **Status:** Production Ready

## Quick Overview

Coordination mode for fixing compilation errors using agent-driven post-edit validation with Cerebras acceleration.

### Key Features
- **Agent Coordination:** Main chat spawns agents with `background=true`
- **Parallel Processing:** Max 5 agents working simultaneously
- **Single-File Focus:** Each agent fixes 1 file only
- **Post-Edit Validation:** Mandatory validation after each fix
- **Cerebras Gates:** 12 structural validations prevent semantic changes
- **Smart Retry:** 2 attempts per file before deferring to Phase 2
- **Continuous Spawning:** New agent launches immediately when slot opens

### When to Use
- 20+ compilation errors
- Need fast bulk reduction
- Errors are mostly mechanical (type mismatches, imports, syntax)
- Want visibility into agent progress

---

## Execution Instructions (AUTO-EXECUTE)

### Step 1: Parse Arguments

```bash
# Parse command
LANGUAGE="$ARGUMENTS"
LANGUAGE=$(echo "$LANGUAGE" | sed 's/--max-parallel[[:space:]]*[0-9]*//' | sed 's/--max-cycles[[:space:]]*[0-9]*//' | xargs)

MAX_PARALLEL=5
MAX_CYCLES=10

for arg in $ARGUMENTS; do
  case $arg in
    --max-parallel=*) MAX_PARALLEL="${arg#*=}" ;;
    --max-cycles=*) MAX_CYCLES="${arg#*=}" ;;
  esac
done

# Validate language
if [[ ! "$LANGUAGE" =~ ^(rust|typescript|ts)$ ]]; then
  echo "ERROR: Language must be: rust, typescript, ts"
  exit 1
fi

# Normalize typescript
if [[ "$LANGUAGE" == "ts" ]]; then
  LANGUAGE="typescript"
fi

SESSION_ID="cfn-fix-$(date +%s%N | tail -c 7)-${RANDOM}"
echo "Session ID: $SESSION_ID | Language: $LANGUAGE | Max Parallel: $MAX_PARALLEL"
```

### Step 2: Initialize State

```typescript
// State tracking
const fileState = new Map<string, {
  attempts: number;
  status: 'queued' | 'in_progress' | 'success' | 'defer_to_phase2';
  agentId: string | null;
  lastError: string | null;
}>();

const activeAgents = new Map<string, {
  file: string;
  agentId: string;
  taskId: string;
}>();

const phase2Queue: string[] = [];
let currentCycle = 0;
```

### Step 3: Get Error Files (Sorted by Error Count)

```bash
# Rust
if [[ "$LANGUAGE" == "rust" ]]; then
  ERROR_FILES=$(SQLX_OFFLINE=true cargo check 2>&1 | \
    grep "^error\[" | \
    awk -F':' '{print $1}' | \
    sort | uniq -c | sort -rn | \
    awk '{print $2}')

  TOTAL_ERRORS=$(SQLX_OFFLINE=true cargo check 2>&1 | grep -c "^error\[")
fi

# TypeScript
if [[ "$LANGUAGE" == "typescript" ]]; then
  ERROR_FILES=$(npm run type-check 2>&1 | \
    grep "error TS" | \
    awk -F'(' '{print $1}' | \
    sort | uniq -c | sort -rn | \
    awk '{print $2}')

  TOTAL_ERRORS=$(npm run type-check 2>&1 | grep -c "error TS")
fi

echo "Found $TOTAL_ERRORS errors across $(echo "$ERROR_FILES" | wc -l) files"

# Initialize file state
for file in $ERROR_FILES; do
  fileState.set(file, {
    attempts: 0,
    status: 'queued',
    agentId: null,
    lastError: null
  });
done
```

### Step 4: Agent Spawn Loop (Continuous)

```typescript
// Main coordination loop
while (fileQueue.length > 0 || activeAgents.size > 0) {

  // Spawn agents up to max parallel
  while (activeAgents.size < MAX_PARALLEL && fileQueue.length > 0) {
    const file = fileQueue.shift();
    const state = fileState.get(file);

    // Skip if already succeeded or deferred
    if (state.status === 'success' || state.status === 'defer_to_phase2') {
      continue;
    }

    // Spawn agent for this file
    const agentId = `${LANGUAGE}-fixer-${SESSION_ID}-${file.replace(/\W/g, '_')}`;
    state.attempts++;
    state.status = 'in_progress';
    state.agentId = agentId;

    const agentType = LANGUAGE === 'rust' ? 'rust-developer' : 'typescript-specialist';

    const taskId = Task(agentType, `
AGENT_ID="${agentId}"
FILE_PATH="${file}"
SESSION_ID="${SESSION_ID}"
ATTEMPT=${state.attempts}/2

TASK: Fix compilation errors in a single file using Cerebras acceleration and post-edit validation.

WORKFLOW:
1. Read file: ${file}

2. Call single-file Cerebras fixer:
   ${LANGUAGE === 'rust'
     ? 'npx tsx ./.claude/skills/cfn-compilation-error-fixer/lib/fixer/cerebras-gated-fixer-v2.ts --file="${FILE_PATH}" --agent-id="${AGENT_ID}"'
     : 'npx tsx ./.claude/skills/cfn-compilation-error-fixer/lib/fixer/typescript-gated-fixer-v2.ts --file="${FILE_PATH}" --agent-id="${AGENT_ID}"'}

3. Validate with post-edit pipeline:
   ./.claude/hooks/cfn-invoke-post-edit.sh "${FILE_PATH}" --agent-id "${AGENT_ID}"

4. Return status:
   - If post-edit validation PASSES (exit 0): Return "SUCCESS"
   - If post-edit validation FAILS (exit 1): Return "RETRY" (if attempt 1) or "DEFER" (if attempt 2)

CEREBRAS GATES (12 Structural Validations):
- Phase 1a: Cerebras generates fix
- Phase 1b: Gates validate (LineCount, FnSignature, ImportDup, BraceBalance, SemanticDiff, OrphanedCode, ImportPath, PatternDup, ImplLocation, TypeCast, MatchArm, Regression)
- Up to 3 retries with feedback per gate rejection

CRITICAL RESTRICTIONS:
- DO NOT run eslint, cargo clippy, cargo fmt, rustfmt, or any linter on the ENTIRE codebase
- DO NOT run cargo check on the entire project
- DO NOT run npm run type-check on the entire project
- Work ONLY on file: ${file}
- Use Cerebras tool for speed, not manual fixes
- Post-edit validation runs on this file only

POST-EDIT VALIDATION (MANDATORY):
After Cerebras applies fixes, run:
./.claude/hooks/cfn-invoke-post-edit.sh "${FILE_PATH}" --agent-id "${AGENT_ID}"

SUCCESS CRITERIA:
Post-edit pipeline returns exit code 0

RETURN FORMAT:
{
  "status": "SUCCESS" | "RETRY" | "DEFER",
  "file": "${file}",
  "attempts": ${state.attempts},
  "errors_fixed": <number>,
  "validation_passed": <boolean>
}
`, {run_in_background: true});

    // Track active agent
    activeAgents.set(taskId, {
      file,
      agentId,
      taskId
    });

    echo(`Spawned agent ${agentId} for ${file} (attempt ${state.attempts}/2)`);
  }

  // Monitor active agents (continuous)
  if (activeAgents.size > 0) {
    // Check for completed agents (non-blocking)
    for (const [taskId, agent] of activeAgents.entries()) {
      const result = TaskOutput(taskId, {block: false, timeout: 0});

      if (result.status === 'completed') {
        const state = fileState.get(agent.file);

        // Parse result
        if (result.output.includes('SUCCESS')) {
          state.status = 'success';
          echo(`✓ ${agent.file} - Fixed successfully`);
        } else if (result.output.includes('DEFER') || state.attempts >= 2) {
          state.status = 'defer_to_phase2';
          phase2Queue.push(agent.file);
          echo(`→ ${agent.file} - Deferred to Phase 2 (${state.attempts} attempts)`);
        } else {
          // Retry
          state.status = 'queued';
          fileQueue.push(agent.file);
          echo(`↻ ${agent.file} - Retrying (attempt ${state.attempts + 1}/2)`);
        }

        // Remove from active agents
        activeAgents.delete(taskId);
      }
    }

    // Small delay to prevent tight loop
    await sleep(1000);
  }
}
```

### Step 5: Cycle Check (After All Agents Complete)

```bash
# Wait for all agents to complete
echo "Waiting for all agents to complete cycle $currentCycle..."

while activeAgents.size > 0; do
  # Block until any agent completes
  for (const [taskId, agent] of activeAgents.entries()) {
    const result = TaskOutput(taskId, {block: true, timeout: 30000});

    if (result.status === 'completed') {
      // Process result (same as Step 4)
      activeAgents.delete(taskId);
      break;
    }
  }
done

# Rerun error check
echo "Cycle $currentCycle complete. Rechecking errors..."

if [[ "$LANGUAGE" == "rust" ]]; then
  NEW_ERROR_COUNT=$(SQLX_OFFLINE=true cargo check 2>&1 | grep -c "^error\[")
else
  NEW_ERROR_COUNT=$(npm run type-check 2>&1 | grep -c "error TS")
fi

echo "Errors: $TOTAL_ERRORS → $NEW_ERROR_COUNT"

# Update total for next cycle
PREV_ERROR_COUNT=$TOTAL_ERRORS
TOTAL_ERRORS=$NEW_ERROR_COUNT
currentCycle=$((currentCycle + 1))
```

### Step 6: Phase Transition Logic

```bash
# Check if should proceed to Phase 2
PROCEED_TO_PHASE2=false

# Condition 1: Error count below threshold
if [ $TOTAL_ERRORS -lt 40 ]; then
  echo "Error count below 40 - proceeding to Phase 2"
  PROCEED_TO_PHASE2=true
fi

# Condition 2: No progress made
if [ $TOTAL_ERRORS -eq $PREV_ERROR_COUNT ] && [ $currentCycle -gt 1 ]; then
  echo "No progress made - proceeding to Phase 2"
  PROCEED_TO_PHASE2=true
fi

# Condition 3: Max cycles reached
if [ $currentCycle -ge $MAX_CYCLES ]; then
  echo "Max cycles reached - proceeding to Phase 2"
  PROCEED_TO_PHASE2=true
fi

# Condition 4: All files processed
if [ ${#fileQueue[@]} -eq 0 ] && [ ${#phase2Queue[@]} -eq 0 ]; then
  echo "All files processed successfully!"
  PROCEED_TO_PHASE2=false
fi

if [ "$PROCEED_TO_PHASE2" = true ]; then
  # Proceed to Phase 2
  echo "=== PHASE 2: Dedicated Agent Cleanup ==="
else
  # Continue next cycle
  echo "=== Continuing Phase 1: Cycle $currentCycle ==="
  # Go back to Step 3 (get new error files)
fi
```

### Step 7: Phase 2 (Dedicated Agent Cleanup)

```bash
if [ "$PROCEED_TO_PHASE2" = true ]; then

  echo "Spawning dedicated ${LANGUAGE}-developer agent for remaining errors..."

  # Get files with remaining errors
  PHASE2_FILES=$(echo "$ERROR_FILES" | head -20)

  # Spawn dedicated agent (NOT background - visible progress)
  Task(${agentType}, `
AGENT_ID="${LANGUAGE}-phase2-${SESSION_ID}"

TASK: Fix remaining compilation errors after Phase 1 bulk processing.

CONTEXT:
- Phase 1 (agent coordination) processed files with Cerebras acceleration
- Remaining errors require high-quality, context-aware fixes
- ${TOTAL_ERRORS} errors remaining

WORKING DIRECTORY:
${LANGUAGE === 'rust' ? 'RUST_PROJECT_PATH' : 'TYPESCRIPT_PROJECT_PATH'}

STEP 1: Get current error locations
${LANGUAGE === 'rust'
  ? 'SQLX_OFFLINE=true cargo check 2>&1 | grep -E "^error\\[E" | sort | uniq -c | sort -rn'
  : 'npm run type-check 2>&1 | grep -E "error TS" | sort | uniq -c | sort -rn'}

STEP 2: Fix each error file in dependency order
1. Read FULL file for context
2. Identify root cause (not just symptom)
3. Apply minimal fix preserving semantics
4. Run post-edit validation:
   ./.claude/hooks/cfn-invoke-post-edit.sh "\$FILE" --agent-id "${AGENT_ID}"
5. Verify with compiler after EACH file

RULES:
- Read FULL file before editing
- Preserve ALL existing imports, don't duplicate
- Use proper ${LANGUAGE} idioms
- Fix root causes first (cascading errors will resolve)
- Verify after EACH file
- Run post-edit pipeline after EACH edit

RESTRICTIONS:
- DO NOT run eslint/cargo clippy on entire codebase
- Work on one file at a time
- Validate each fix before moving to next

COMMON ERROR TYPES:
${LANGUAGE === 'rust'
  ? '- E0308 (type mismatch): Add explicit casts or fix generics\n- E0412/E0433/E0425 (missing type/import): Add use statements\n- E0599 (wrong method): Fix method chain\n- E0277 (trait not implemented): Add trait implementations\n- E0382 (borrow checker): Fix ownership issues'
  : '- TS2307 (module not found): Fix import paths\n- TS2322 (type mismatch): Add type annotations\n- TS2339 (property not exists): Add interface definitions\n- TS7006 (implicit any): Add explicit types\n- TS2688 (cannot find type): Install @types packages'}

Report final error count when done.
`)

fi
```

---

## State Management

### File State Structure

```typescript
interface FileState {
  attempts: number;           // 0-2
  status: 'queued' | 'in_progress' | 'success' | 'defer_to_phase2';
  agentId: string | null;     // Current/last agent ID
  lastError: string | null;   // Last error message
}

const fileState = new Map<string, FileState>();
```

### Active Agent Tracking

```typescript
interface ActiveAgent {
  file: string;          // File being processed
  agentId: string;       // Agent identifier
  taskId: string;        // TaskOutput ID for monitoring
}

const activeAgents = new Map<string, ActiveAgent>();
```

---

## Related Documentation

- **Compilation Error Fixer Skill**: `.claude/skills/cfn-compilation-error-fixer/SKILL.md`
- **Post-Edit Pipeline**: `.claude/hooks/cfn-invoke-post-edit.sh`
- **Cerebras Gated Fixer (Rust)**: `.claude/skills/cfn-compilation-error-fixer/lib/fixer/cerebras-gated-fixer-v2.ts`
- **Cerebras Gated Fixer (TypeScript)**: `.claude/skills/cfn-compilation-error-fixer/lib/fixer/typescript-gated-fixer-v2.ts`
- **Task Mode Reference**: `.claude/commands/cfn-loop-task.md`

---

**Version History:**
- v1.0.0 (2025-12-21) - Initial coordination mode implementation
