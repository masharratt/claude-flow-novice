---
description: "Coordinate agents to fix compilation errors with strategic Phase 0 and parallel Phase 1"
argument-hint: "<language> [--max-parallel=5] [--max-cycles=10]"
allowed-tools: ["Task", "TaskOutput", "TodoWrite", "Read", "Bash"]
---

# CFN Fix Errors - Agent Coordination Mode

**Version:** 2.0.0  |  **Date:** 2025-12-21  |  **Status:** Production Ready

## Quick Overview

Main chat coordinates error fixing in two phases:
- **Phase 0**: Fix strategic root-cause files first (prevents cascading errors)
- **Phase 1**: Parallel agents fix remaining files (up to 5 concurrent)
- **Phase 2**: Cleanup of cross-file errors

### Key Features
- **Phase 0 strategic fixes** - identify and fix root-cause files first
- **Max 5 parallel agents** with continuous spawning in Phase 1
- **Single-file focus** - each agent fixes one file only
- **Post-edit validation** confirms fixes are correct
- **Agents solve independently** - no external tools, just expertise
- **Automatic Phase 2** transition at <40 errors

### When to Use
- 20+ compilation errors
- Errors may have cascading dependencies
- Want visibility into agent progress
- Need systematic error reduction

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

### Step 2: Get Error Files and Analyze

**YOU SHOULD:** Run the appropriate type checker and get files with errors.

**For Rust:**
```bash
cd [PROJECT_ROOT]
# Cargo errors: file paths are on lines starting with "-->"
SQLX_OFFLINE=true cargo check 2>&1 | tee /tmp/cargo-errors.txt | grep "^\s*-->" | awk '{print $2}' | awk -F':' '{print $1}' | sort | uniq -c | sort -rn
```

**For TypeScript (tsc):**
```bash
cd [PROJECT_ROOT]
npm run typecheck 2>&1 | tee /tmp/tsc-errors.txt | grep "error TS" | awk -F'(' '{print $1}' | sort | uniq -c | sort -rn
```

**For TypeScript (ESLint):**
```bash
cd [PROJECT_ROOT]
npm run lint 2>&1 > /tmp/eslint-output.txt
grep -B1 "error" /tmp/eslint-output.txt | grep -v "error\|--" | grep "\.tsx\?$" | sort | uniq -c | sort -rn
```

**Alternative (Universal TypeScript/ESLint parser):**
```bash
npm run lint 2>&1 > /tmp/lint-output.txt || npm run typecheck 2>&1 > /tmp/lint-output.txt

python3 << 'PARSE_SCRIPT'
import re
from collections import defaultdict

error_counts = defaultdict(int)
current_file = None

with open('/tmp/lint-output.txt', 'r') as f:
    for line in f:
        if line.strip().endswith('.ts') or line.strip().endswith('.tsx'):
            current_file = line.strip()
        elif re.search(r'^\s+\d+:\d+\s+(error|warning)', line) and current_file:
            error_counts[current_file] += 1
        elif match := re.match(r'^(.+\.tsx?)\(\d+,\d+\):\s+error', line):
            error_counts[match.group(1)] += 1

for file, count in sorted(error_counts.items(), key=lambda x: -x[1])[:30]:
    print(f"{count:6d} {file}")
PARSE_SCRIPT
```

---

### Step 3: Phase 0 - Identify Strategic Root-Cause Files

**YOU SHOULD:** Analyze the error output to identify files that should be fixed FIRST because they cause cascading errors.

**Root-Cause File Indicators:**

1. **Type Definition Files** (highest priority):
   - `*.d.ts` files
   - `types.ts`, `types/*.ts`
   - `interfaces.ts`, `models.ts`
   - Files with "Cannot find type" errors pointing to them

2. **Core/Base Modules**:
   - `index.ts` files that re-export many modules
   - Files imported by 5+ other error files
   - Base classes/interfaces extended by other files

3. **Configuration Files**:
   - `config.ts`, `constants.ts`
   - Environment/settings files

4. **Dependency Analysis** (from error messages):
   - Look for patterns like "Cannot find module './X'" - fix X first
   - Look for "Type 'X' is not assignable" where X is defined elsewhere
   - Look for "Property 'X' does not exist on type 'Y'" - fix Y's definition first

**YOU SHOULD:** Create a Phase 0 queue of 3-8 strategic files to fix first.

**Example Analysis:**
```
ERROR ANALYSIS:
- 15 files have "Cannot find module './types/api'"
  → Fix: src/types/api.ts FIRST (root cause)

- 8 files have "Type 'UserData' is not assignable"
  → Fix: src/models/user.ts FIRST (type definition issue)

- 12 files import from src/utils/index.ts which has errors
  → Fix: src/utils/index.ts FIRST (cascading imports)

PHASE 0 QUEUE (fix in order):
1. src/types/api.ts (15 dependents)
2. src/models/user.ts (8 dependents)
3. src/utils/index.ts (12 dependents)
```

---

### Step 4: Execute Phase 0 - Strategic Fixes (Sequential)

**YOU SHOULD:** Fix Phase 0 files ONE AT A TIME with full cross-file context.

**For EACH file in Phase 0 queue:**

1. **Spawn a dedicated agent** (NOT in background):
```typescript
Task("rust-developer" OR "typescript-specialist",
  `Fix errors in: [FILE_PATH]

PROJECT: [PROJECT_ROOT]
CONTEXT: This is a Phase 0 strategic file that other files depend on.

YOUR TASK:
1. Read the file and understand its purpose
2. Check the error output in /tmp/[cargo-errors|tsc-errors|eslint-output].txt
3. Fix ALL errors in this file
4. Consider how your fixes affect files that import/use this file
5. Run post-edit validation: .claude/hooks/cfn-invoke-post-edit.sh [FILE_PATH]
6. If validation fails, adjust your fix

IMPORTANT:
- This file is a root cause - other files depend on it
- Ensure exports/types remain compatible
- Do NOT change the public API unless necessary to fix errors
- Focus on type correctness and import resolution

Report: List of fixes made and any breaking changes.`,
  {run_in_background: false}  // BLOCKING - wait for completion
);
```

2. **After each Phase 0 fix, recheck errors:**
```bash
# Rerun type checker to see cascading improvements
npm run typecheck 2>&1 | grep "error" | wc -l
# or for Rust:
SQLX_OFFLINE=true cargo check 2>&1 | grep "^error" | wc -l
```

3. **Update file queue** - remove files that no longer have errors

**PHASE 0 COMPLETE when:** All strategic files are fixed.

---

### Step 5: Execute Phase 1 - Parallel Agent Spawning

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
  for (const agent of activeAgents) {
    const result = TaskOutput(agent.taskId, {block: false, timeout: 0});

    if (result.status === "completed") {
      if (result.success) {
        markFileComplete(agent.file);
      } else if (agent.attempts < 2) {
        // Retry once
        agent.attempts++;
        requeue(agent.file);
      } else {
        // Defer to Phase 2
        markFileDeferred(agent.file);
      }
      removeFromActive(agent);
    }
  }

  // Brief pause before next check
  sleep(2000);
}
```

---

### Step 6: Phase 1 Agent Prompt

**USE THIS PROMPT for each Phase 1 agent:**

```
Fix compilation errors in: [FILE_PATH]

PROJECT: [PROJECT_ROOT]
LANGUAGE: [typescript|rust]
AGENT_ID: [GENERATED_AGENT_ID]

YOUR TASK:
1. Read the file to understand context
2. Identify all errors in this file from the type checker output
3. Fix each error using your expertise
4. Run post-edit validation after fixes

WORKFLOW:
1. Read the file: cat [FILE_PATH]
2. Get specific errors for this file from /tmp/[tsc-errors|cargo-errors|eslint-output].txt
3. Make targeted fixes - edit only what's needed
4. Validate: .claude/hooks/cfn-invoke-post-edit.sh [FILE_PATH] --agent-id [AGENT_ID]
5. If validation shows new errors, adjust

CONSTRAINTS:
- Fix ONLY errors in [FILE_PATH] - do not modify other files
- Do NOT run linters/checkers on the entire codebase:
  - `eslint .` is FORBIDDEN
  - `cargo check` (full project) is FORBIDDEN
  - `npm run lint` (full project) is FORBIDDEN
  - `npm run typecheck` (full project) is FORBIDDEN
- Use errors from /tmp/ output files - do NOT regenerate them
- Do NOT add unnecessary dependencies
- Preserve existing functionality
- Keep fixes minimal and targeted

COMMON FIX PATTERNS:
- Missing imports: Add the import statement
- Type errors: Add proper type annotations
- Unused variables: Prefix with _ or remove if truly unused
- Missing exports: Add export keyword
- Null checks: Add optional chaining or null guards

REPORT FORMAT:
```
SUMMARY: [2 sentence summary of what was fixed and outcome]

FIXES APPLIED: [count]
- Line X: [description of fix]
- Line Y: [description of fix]

ROUNDS: [number of fix iterations attempted]
ERRORS FIXED: [count of errors resolved in this file]
VALIDATION: [PASS/FAIL]
POST-EDIT RESPONSE: [final output from post-edit pipeline]
REMAINING ERRORS: [count or "none"]
```
```

---

### Step 7: Monitor Progress and Transition

**YOU SHOULD:** Track progress and decide when to transition to Phase 2.

**Progress Tracking:**
```bash
# Check current error count
npm run typecheck 2>&1 | grep "error" | wc -l
# or
SQLX_OFFLINE=true cargo check 2>&1 | grep "^error" | wc -l
```

**Transition to Phase 2 when ANY of these conditions are met:**
- Error count < 40
- 3 consecutive cycles with no improvement
- All files have been attempted twice
- Remaining errors require cross-file coordination

---

### Step 8: Phase 2 - Cross-File Cleanup

**YOU SHOULD:** Spawn a dedicated cleanup agent for remaining errors.

```typescript
Task("rust-developer" OR "typescript-specialist",
  `Phase 2 Cleanup: Fix remaining cross-file errors

PROJECT: [PROJECT_ROOT]
REMAINING_ERRORS: [error count]
DEFERRED_FILES: [list of files that couldn't be fixed in Phase 1]

CONTEXT:
Phase 0 fixed strategic root-cause files.
Phase 1 fixed [X] files with single-file errors.
Now fix remaining errors that require cross-file understanding.

YOUR TASK:
1. Run full type check to get current errors
2. Analyze error patterns across files
3. Fix errors that span multiple files
4. Ensure type consistency across modules

APPROACH:
- Group related errors by type/module
- Fix shared types/interfaces first
- Then fix usage sites
- Run validation after each group of fixes

REPORT: Summary of remaining errors and fixes applied.`,
  {run_in_background: false}
);
```

---

## State Management

**YOU SHOULD:** Maintain state in /tmp/phase-state.json:

```json
{
  "sessionId": "cfn-fix-123456-7890",
  "language": "typescript",
  "startTime": "2025-12-21T10:00:00Z",
  "initialErrors": 150,
  "currentErrors": 45,
  "phase": "1",
  "phase0Files": [
    {"file": "src/types/api.ts", "status": "completed", "dependents": 15}
  ],
  "phase1Files": [
    {"file": "src/api/handler.ts", "attempts": 1, "status": "in_progress", "agentId": "abc123"}
  ],
  "deferredFiles": [],
  "activeAgents": ["abc123", "def456"]
}
```

---

## Quick Reference

| Phase | Purpose | Execution | Agent Count |
|-------|---------|-----------|-------------|
| 0 | Root-cause files | Sequential | 1 at a time |
| 1 | Parallel fixes | Continuous spawn | Up to 5 |
| 2 | Cross-file cleanup | Sequential | 1 dedicated |

**Agent Types:**
- Rust: `rust-developer`
- TypeScript: `typescript-specialist`

**Validation Hook:**
```bash
.claude/hooks/cfn-invoke-post-edit.sh [FILE] --agent-id [ID]
```

---

## Related Documentation

- **Post-Edit Hooks**: `.claude/hooks/cfn-invoke-post-edit.sh`
- **Agent Templates**: `.claude/agents/cfn-dev-team/developers/`
- **Task Mode Reference**: `.claude/commands/cfn-loop-task.md`

---

## Version History

- v2.0.0 (2025-12-21) - Removed Cerebras, added Phase 0 for strategic root-cause files
- v1.2.0 (2025-12-21) - Fixed error file extraction patterns for Rust and TypeScript/ESLint
- v1.1.0 (2025-12-21) - Clarified instructions, removed pseudocode confusion
- v1.0.0 (2025-12-21) - Initial coordination mode implementation
