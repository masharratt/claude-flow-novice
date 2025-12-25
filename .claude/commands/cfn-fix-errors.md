---
description: "Coordinate agents to fix compilation errors with strategic Phase 0 and parallel Phase 1"
argument-hint: "<language> [--max-parallel=5] [--max-cycles=10]"
allowed-tools: ["Task", "TaskOutput", "TodoWrite", "Read", "Bash"]
---

# CFN Fix Errors - Agent Coordination Mode

**Version:** 3.1.0  |  **Date:** 2025-12-21  |  **Status:** Production Ready

---

## QUICK REFERENCE

### Get Errors (with caching for speed)

**TypeScript (tsc) - use incremental:**
```bash
npm run typecheck 2>&1 | tee /tmp/tsc-errors.txt
# Ensure tsconfig.json has: "incremental": true, "tsBuildInfoFile": ".tsbuildinfo"
```

**TypeScript (ESLint) - use cache:**
```bash
npx eslint . --ext .ts,.tsx --cache --cache-location /tmp/.eslintcache 2>&1 | tee /tmp/eslint-errors.txt
```

**Rust (incremental by default):**
```bash
SQLX_OFFLINE=true cargo check 2>&1 | tee /tmp/cargo-errors.txt
```

### Find Files with Most Errors

**TypeScript (tsc) - Direct pipeline:**
```bash
npm run typecheck 2>&1 | grep "error TS" | awk -F'(' '{print $1}' | sort | uniq -c | sort -rn | head -20
```

**TypeScript (tsc) - From saved file:**
```bash
grep "error TS" /tmp/tsc-errors.txt | awk -F'(' '{print $1}' | sort | uniq -c | sort -rn | head -20
```

**TypeScript (ESLint) - From saved file:**
```bash
grep -B1 "error" /tmp/eslint-errors.txt | grep "\.tsx\?$" | sort | uniq -c | sort -rn | head -20
```

**Universal TypeScript/ESLint Parser (most robust):**
```bash
# Run either linter or typecheck to output file
npm run lint 2>&1 > /tmp/lint-output.txt || npm run typecheck 2>&1 > /tmp/lint-output.txt

# Python parser for comprehensive error extraction
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

**Rust:**
```bash
grep "^\s*-->" /tmp/cargo-errors.txt | awk '{print $2}' | awk -F':' '{print $1}' | sort | uniq -c | sort -rn | head -20
```

**Quick Error Count Check:**
```bash
npm run typecheck 2>&1 | grep "error" | wc -l
```

Output: files sorted by error count (fix highest counts first)

### Three-Phase Execution

| Phase | Files | Mode | Rule |
|-------|-------|------|------|
| 0 | Strategic root-causes | Sequential | `run_in_background: false` |
| 1 | Remaining files | Up to 5 parallel | `run_in_background: true` |
| 2 | Cross-file errors | Sequential | `run_in_background: false` |

**Triggers:** Phase 0 completes → Phase 1 spawns → <40 errors remain → Phase 2 spawns

### Critical Rules

- **Background ONLY for Phase 1:** Agents restart chat when done. Spawn next immediately.
- **Single file per agent:** Each agent fixes one file, validates, then exits.
- **Exit nofifications:** from background agents will signal main chat to spawn new agents in phase 1
- **Commits via background agent:** Spawn commit agent every 20 files / after each phase.
- **Refresh errors at 15 files:** After 15 fixes, spawn background agent to re-run error gathering.
- **No full checks:** Agents forbidden: `eslint .` `cargo check` `npm run lint` `npm run typecheck` `npx tsc` or any other full projects commands
- **Report facts only:** Files fixed, errors remaining. No CFN effectiveness commentary.

### Spawn Templates

**Phase 0 & 2 (blocking):**
```typescript
Task("typescript-specialist" /* or "rust-developer" */,
  `Fix errors in: [FILE_PATH]
   PROJECT: [ROOT]
   Read errors from /tmp/[errors].txt
   Context: Phase [0|2] strategic work.
   Report: fixes made, remaining errors.`,
  {run_in_background: false}
);
```

**Phase 1 (background) - CRITICAL: NO-TSC ENFORCEMENT:**
```typescript
Task("typescript-specialist" /* or "rust-developer" */,
  `# FORBIDDEN: Do NOT run npx tsc, npm run typecheck, or cargo check
  # Use ruvector skills in place of 'search' or 'find' 
  # REQUIRED: Use CFN hooks for validation

  ## MANDATORY WORKFLOW:
  1. Before edit: ./.claude/hooks/cfn-invoke-pre-edit.sh [FILE_PATH] --agent-id $ID
  2. Make edits with Edit tool
  3. After edit: ./.claude/hooks/cfn-invoke-post-edit.sh [FILE_PATH] --agent-id $ID
  4. The post-edit hook handles verification - DO NOT RUN TSC YOURSELF

  Fix errors in: [FILE_PATH]
  Read errors from /tmp/[errors].txt
  Report: SUMMARY, FIXES APPLIED, ERRORS FIXED, VALIDATION.`,
  {run_in_background: true}
);
```

---

## Setup

### Parse Arguments

```bash
LANGUAGE="${1:-typescript}"  # typescript|rust
MAX_PARALLEL="${2:-5}"
MAX_CYCLES="${3:-10}"
SESSION_ID="cfn-fix-$(date +%s | tail -c 6)-${RANDOM}"
```

Validate: language ∈ {rust, typescript, ts}

---

## Phase 0: Identify Root-Cause Files

Analyze errors to find files that block others:

**Priority indicators:**
1. **Type definitions:** `*.d.ts`, `types.ts`, `types/*.ts`, `interfaces.ts`, `models.ts`
2. **Core modules:** `index.ts` with re-exports, imported by 5+ error files
3. **Config files:** `config.ts`, `constants.ts`
4. **Error patterns:** "Cannot find module './X'" (fix X first) / "Type 'X' not assignable" (fix definition) / "Property missing on type 'Y'" (fix Y)

**Build Phase 0 queue** (3-8 files, in dependency order):

```
- src/types/api.ts (15 files blocked by this)
- src/models/user.ts (8 files blocked)
- src/utils/index.ts (12 files blocked)
```

### Execute Phase 0

For each file:
1. Spawn agent (blocking mode)
2. Agent reads file, checks `/tmp/[errors].txt`, fixes ALL errors in file
3. Agent runs: `.claude/hooks/cfn-invoke-post-edit.sh [FILE_PATH]`
4. Recheck total error count to see cascading improvements
5. Remove from queue if no more errors

**Commit after Phase 0 completes.**

---

## Phase 1: Parallel Fixes

Spawn continuous waves (max 5 concurrent):
1. Spawn agent with background mode
2. Agent fixes [FILE_PATH], validates, exits → chat restarts
3. Do not check outputs, instead wait for background agent exit notification, spawn next file immediately
4. Check agent counts to ensure max amount of agents are running
5. Continue until file queue empty

**Continuous Error Tracking (no full recheck needed):**

Each agent's post-edit hook updates `/tmp/error-tracker.json`:
```bash
# Post-edit hook appends per-file error count
# Query anytime: jq '.totalErrors' /tmp/error-tracker.json
```

**Background tasks during Phase 1:**
```
Every 5 files → Query error tracker (instant, no recheck):
  ERRORS=$(jq '.totalErrors' /tmp/error-tracker.json)

At 15 files → Spawn background agent for incremental recheck (uses cache, ~5-10s):
  Task("general-purpose",
    `Run incremental typecheck (cached): npm run typecheck 2>&1 > /tmp/tsc-errors-refresh.txt
     Update /tmp/error-tracker.json with actual count
     Report: synced error count`,
    {run_in_background: true});

At 20 files → Spawn background commit agent:
  Task("general-purpose",
    `Run: git add -A && git commit -m "fix: batch of 20 error fixes"
     Report: commit hash`,
    {run_in_background: true});
```

**Benefits of incremental + cache:**
- First full check: 30-60s
- Cached incremental check (15 files changed): 5-10s (80%+ faster)
- Error tracker query: <0.1s (instant)

---

## Phase 2: Cross-File Cleanup

Trigger when: error count <40 OR 3 cycles no improvement OR all files attempted twice

1. Spawn single cleanup agent (blocking mode)
2. Agent analyzes remaining errors across files
3. Groups errors by type/module, fixes shared types first, then usage sites
4. Commit after completion

---

## State Tracking (Optional)

Maintain `/tmp/phase-state.json`:

```json
{
  "sessionId": "cfn-fix-123456",
  "language": "typescript",
  "phase": "1",
  "initialErrors": 150,
  "currentErrors": 45,
  "phase0Files": [{"file": "src/types/api.ts", "status": "completed"}],
  "activeAgents": ["abc123"]
}
```

---

## Reference

**Post-edit validation:**
```bash
.claude/hooks/cfn-invoke-post-edit.sh [FILE] --agent-id [ID]
```

**Agent report format:**
```
SUMMARY: [2 sentences: what was fixed, outcome]
FIXES APPLIED: [count]
- Line X: [fix description]
ERRORS FIXED: [count]
VALIDATION: [PASS/FAIL]
REMAINING ERRORS: [count or "none"]
```

---

## Version History
- v3.1.0 (2025-12-21) - Continuous error tracking, incremental/cached builds, background commits
- v3.0.0 (2025-12-21) - Sparse rewrite: removed 200 lines, consolidated duplicates, moved quick reference to top
- v2.2.0 (2025-12-21) - Clarified background mode (Phase 1 only), no manual monitoring
- v2.1.0 (2025-12-21) - Added quick reference, commit every 20 files
- v2.0.0 (2025-12-21) - Added Phase 0 strategic root-cause files
- v1.0.0 (2025-12-21) - Initial implementation
