---
description: "Coordinate agents to fix compilation errors using post-edit validation and Cerebras gates"
argument-hint: "<language> [--max-parallel=5] [--max-cycles=10]"
allowed-tools: ["Task", "TaskOutput", "TodoWrite", "Read", "Bash"]
---

# CFN Fix Errors - Agent Coordination Mode

**Version:** 1.2.0  |  **Date:** 2025-12-21  |  **Status:** Production Ready

## Quick Overview

Main chat coordinates up to 5 background agents to fix compilation errors in parallel. Each agent works on one file using Cerebras acceleration and post-edit validation.

### Key Features
- **Max 5 parallel agents** with continuous spawning
- **Single-file focus** - each agent fixes one file only
- **2-attempt retry** logic per file before deferring to Phase 2
- **Post-edit validation** confirms fixes are correct
- **Cerebras gates** prevent semantic changes (12 structural validations)
- **Automatic Phase 2** transition at <40 errors

### When to Use
- 20+ compilation errors
- Errors are mostly mechanical (imports, types, syntax)
- Want visibility into agent progress
- Need fast bulk error reduction

---

## Execution Instructions (Follow These Steps)

### Step 1: Parse Arguments and Initialize

**YOU SHOULD:** Parse the command arguments and set up session tracking.

```bash
# Extract language from arguments (first word before any flags)
LANGUAGE="typescript"  # or "rust" from user's command

# Parse optional flags (use defaults if not provided)
MAX_PARALLEL=5
MAX_CYCLES=10

# Generate unique session ID
SESSION_ID="cfn-fix-$(date +%s | tail -c 6)-${RANDOM}"
echo "Session ID: $SESSION_ID | Language: $LANGUAGE | Max Parallel: $MAX_PARALLEL"
```

**VALIDATE:** Language must be "rust", "typescript", or "ts"

---

### Step 2: Get Error Files

**YOU SHOULD:** Run the appropriate type checker and get files with errors.

**For Rust:**
```bash
cd [PROJECT_ROOT]
# Cargo errors: file paths are on lines starting with "-->"
SQLX_OFFLINE=true cargo check 2>&1 | grep "^\s*-->" | awk '{print $2}' | awk -F':' '{print $1}' | sort | uniq -c | sort -rn
```

**For TypeScript (tsc):**
```bash
cd [PROJECT_ROOT]
# TypeScript compiler errors: file paths before first parenthesis
npm run typecheck 2>&1 | grep "error TS" | awk -F'(' '{print $1}' | sort | uniq -c | sort -rn
```

**For TypeScript (ESLint):**
```bash
cd [PROJECT_ROOT]
# ESLint: file paths are on separate lines, extract .ts/.tsx files
npm run lint 2>&1 > /tmp/eslint-output.txt
grep -B1 "error" /tmp/eslint-output.txt | grep -v "error\|--" | grep "\.tsx\?$" | sort | uniq -c | sort -rn
```

**Alternative (Universal TypeScript/ESLint parser):**
```bash
# Save full output first
npm run lint 2>&1 > /tmp/lint-output.txt || npm run typecheck 2>&1 > /tmp/lint-output.txt

# Parse with Python for robust extraction
python3 << 'PARSE_SCRIPT'
import re
from collections import defaultdict

error_counts = defaultdict(int)
current_file = None

with open('/tmp/lint-output.txt', 'r') as f:
    for line in f:
        # ESLint format: file path on its own line
        if line.strip().endswith('.ts') or line.strip().endswith('.tsx'):
            current_file = line.strip()
        # ESLint error line
        elif re.search(r'^\s+\d+:\d+\s+(error|warning)', line) and current_file:
            error_counts[current_file] += 1
        # TSC format: file.ts(line,col): error TS
        elif match := re.match(r'^(.+\.tsx?)\(\d+,\d+\):\s+error', line):
            error_counts[match.group(1)] += 1

# Print sorted by error count
for file, count in sorted(error_counts.items(), key=lambda x: -x[1])[:30]:
    print(f"{count:6d} {file}")
PARSE_SCRIPT
```

**OUTPUT FORMAT:**
```
  45 src/api/handler.ts
  32 src/db/models.ts
  18 src/utils/helpers.ts
```

**YOU SHOULD:** Store this list and track state for each file:
- `attempts`: 0-2 (retry counter)
- `status`: "queued" | "in_progress" | "success" | "defer"
- `agentId`: null | "agent-session-file"

---

### Step 3: Spawn Agents (Continuous Loop)

**YOU SHOULD:** Spawn agents continuously, maintaining exactly 5 active agents at any time.

**Agent Spawn Pattern:**

```typescript
// While there are files to process OR active agents running:
while (fileQueue.length > 0 || activeAgents.length > 0) {

  // Spawn up to 5 agents
  while (activeAgents.length < MAX_PARALLEL && fileQueue.length > 0) {
    const file = fileQueue.shift();
    const agentId = `${LANGUAGE}-fixer-${SESSION_ID}-${sanitize(file)}`;

    // Use Task tool with background=true
    const taskId = Task("rust-developer" OR "typescript-specialist",
      `[SEE AGENT PROMPT BELOW]`,
      {run_in_background: true}
    );

    // Track this agent
    activeAgents.push({file, agentId, taskId, attempts: 1});
  }

  // Monitor agents (non-blocking check)
  for each activeAgent {
    const result = TaskOutput(agent.taskId, {block: false, timeout: 0});

    if (result.status === 'completed') {
      // Parse result: SUCCESS | RETRY | DEFER
      if (result.output.includes('SUCCESS')) {
        // File fixed! Remove from queue
      } else if (agent.attempts < 2) {
        // Retry: add back to queue, increment attempts
        fileQueue.push(file);
        fileState[file].attempts++;
      } else {
        // 2 attempts failed: defer to Phase 2
        phase2Queue.push(file);
      }

      // Remove from active agents (frees slot for next file)
      activeAgents.remove(agent);
    }
  }

  // Small delay to prevent tight loop
  sleep(1 second);
}
```

**AGENT PROMPT TEMPLATE:**

Use this exact prompt structure for spawned agents:

```
AGENT_ID="${agentId}"
FILE_PATH="${file}"
SESSION_ID="${SESSION_ID}"
ATTEMPT=${attempts}/2

TASK: Fix compilation errors in a single file using Cerebras acceleration.

WORKFLOW:
1. Read file: ${file}

2. Call Cerebras single-file fixer:
   [FOR RUST]
   npx tsx /path/to/cerebras-gated-fixer-v2.ts --file="${file}" --agent-id="${agentId}"

   [FOR TYPESCRIPT]
   npx tsx /path/to/typescript-gated-fixer-v2.ts --file="${file}" --agent-id="${agentId}"

3. Validate with post-edit pipeline:
   ./.claude/hooks/cfn-invoke-post-edit.sh "${file}" --agent-id "${agentId}"

4. Return status:
   - If post-edit validation PASSES (exit 0): Return "SUCCESS"
   - If post-edit validation FAILS (exit 1): Return "RETRY" (attempt 1) or "DEFER" (attempt 2)

CEREBRAS GATES:
- Phase 1a: Cerebras generates fix
- Phase 1b: 12 gates validate (LineCount, FnSignature, ImportDup, BraceBalance, SemanticDiff, OrphanedCode, ImportPath, PatternDup, ImplLocation, TypeCast, MatchArm, Regression)
- Up to 3 retries per gate rejection

CRITICAL RESTRICTIONS:
- DO NOT run eslint, cargo clippy, cargo check, or npm run typecheck on ENTIRE codebase
- Work ONLY on file: ${file}
- Use Cerebras for speed
- Post-edit validation runs on this file only

SUCCESS CRITERIA:
Post-edit pipeline returns exit code 0

RETURN: Print "SUCCESS" or "DEFER" clearly in your final output.
```

---

### Step 4: Cycle Completion and Phase Transition

**YOU SHOULD:** After all agents complete (activeAgents.length === 0), check if Phase 2 is needed.

**Recheck Error Count:**

```bash
# Rust
SQLX_OFFLINE=true cargo check 2>&1 | grep -c "^error\["

# TypeScript
npm run typecheck 2>&1 | grep -c "error TS"
```

**Phase 2 Triggers:**
- Error count < 40
- No progress made (same error count as before)
- Max cycles reached
- All files processed (queue empty, no deferrals)

**IF Phase 2 needed:**

```typescript
// Spawn dedicated cleanup agent (NOT background - visible)
Task("rust-developer" OR "typescript-specialist", `
AGENT_ID="${LANGUAGE}-phase2-${SESSION_ID}"

TASK: Fix remaining compilation errors after Phase 1 bulk processing.

CONTEXT:
- Phase 1 processed files with Cerebras acceleration
- ${ERROR_COUNT} errors remaining
- Errors require context-aware fixes

WORKING DIRECTORY: [PROJECT_ROOT]

STEP 1: Get error locations
[RUST] SQLX_OFFLINE=true cargo check 2>&1 | grep -E "^error\\[E" | sort | uniq -c
[TYPESCRIPT] npm run typecheck 2>&1 | grep -E "error TS" | sort | uniq -c

STEP 2: Fix each file
1. Read FULL file for context
2. Identify root cause (not symptom)
3. Apply minimal fix
4. Run post-edit validation:
   ./.claude/hooks/cfn-invoke-post-edit.sh "$FILE" --agent-id "${AGENT_ID}"
5. Verify with compiler after EACH file

RULES:
- Read FULL file before editing
- Preserve ALL existing imports
- Fix root causes first
- Verify after EACH file
- Run post-edit pipeline after EACH edit

RESTRICTIONS:
- DO NOT run linters on entire codebase
- Work on one file at a time

Report final error count when done.
`)
```

---

## Important Notes

### State Tracking

**YOU SHOULD** maintain these data structures in memory:

```typescript
// File state
fileState = {
  "src/api.ts": {attempts: 1, status: "in_progress", agentId: "ts-fixer-123-api"},
  "src/db.ts": {attempts: 2, status: "defer", agentId: null}
}

// Active agents
activeAgents = [
  {file: "src/api.ts", agentId: "ts-fixer-123-api", taskId: "abc123", attempts: 1}
]

// Phase 2 queue
phase2Queue = ["src/db.ts", "src/models.ts"]
```

### Error Handling

- If agent fails to spawn: Log error, skip file, continue
- If TaskOutput times out: Treat as DEFER, add to Phase 2
- If post-edit hook missing: Warn user, continue without validation

### Progress Reporting

**YOU SHOULD** periodically report progress to user:
- "Spawned agent 3/5 for src/api.ts (attempt 1/2)"
- "Agent completed: src/utils.ts - SUCCESS"
- "Agent completed: src/db.ts - DEFER (2 attempts failed)"
- "Cycle 1 complete: 45 → 23 errors (-22)"

---

## Related Documentation

- **Cerebras Rust Fixer**: `.claude/skills/cfn-compilation-error-fixer/lib/fixer/cerebras-gated-fixer-v2.ts`
- **Cerebras TypeScript Fixer**: `.claude/skills/cfn-compilation-error-fixer/lib/fixer/typescript-gated-fixer-v2.ts`
- **Post-Edit Pipeline**: `.claude/hooks/cfn-invoke-post-edit.sh`
- **Task Mode Reference**: `.claude/commands/cfn-loop-task.md`

---

## Version History

- v1.2.0 (2025-12-21) - Fixed error file extraction patterns for Rust and TypeScript/ESLint
- v1.1.0 (2025-12-21) - Clarified instructions, removed pseudocode confusion
- v1.0.0 (2025-12-21) - Initial coordination mode implementation
