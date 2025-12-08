---
name: cfn-mdap-error-fixer
description: Two-phase compilation error fixer for Rust and TypeScript using Cerebras LLM bulk processing + dedicated agent cleanup
version: 2.0.0
tags: [rust, typescript, compilation, cerebras, error-fixer, mdap]
status: production
---

# MDAP Compilation Error Fixer

Two-phase workflow for fixing large-scale compilation errors (Rust and TypeScript) using Cerebras LLM bulk processing + dedicated agent cleanup.

## Skill Structure

```
cfn-mdap-error-fixer/
├── skill.md                      # This file
├── HANDOFF.md                    # Detailed handoff documentation
└── lib/
    ├── fixer/
    │   ├── package.json                       # Dependencies (npm install)
    │   ├── cerebras-gated-fixer-v2.ts         # Rust fixer (self-contained)
    │   └── typescript-gated-fixer-v2.ts       # TypeScript fixer (self-contained)
    └── gates/
        └── typescript-gates.ts                # TypeScript-specific validation gates
```

## Overview

This skill orchestrates:
1. **Phase 1**: Cerebras LLM bulk fixer (fast, cheap, ~97% reduction)
2. **Phase 2**: Dedicated rust-developer agent (high quality cleanup)

## Phase 1: Cerebras Bulk Fixer

### When to Use
- 50+ compilation errors
- Need fast bulk reduction
- Errors are mostly mechanical (type mismatches, missing imports)

### How to Run

```bash
# From skill folder (for distribution)
cd .claude/skills/cfn-mdap-error-fixer/lib/fixer
npm install @cerebras/cerebras_cloud_sdk  # One-time setup
npx tsx cerebras-gated-fixer-v2.ts           # Production run
npx tsx cerebras-gated-fixer-v2.ts --dry-run # Preview patches
npx tsx cerebras-gated-fixer-v2.ts --verbose # Debug output
```

### Architecture

```
┌─────────────────┐
│  cargo check    │ → Parse errors
└────────┬────────┘
         ▼
┌─────────────────┐
│ Cerebras LLM    │ → Generate fix (zai-glm-4.6)
└────────┬────────┘
         ▼
┌─────────────────────────────────────────┐
│     LAYER 1: 12 Structural Gates        │
├─────────────────────────────────────────┤
│ A: LineCount    B: FnSignature          │
│ C: ImportDup    D: BraceBalance         │
│ E: SemanticDiff F: OrphanedCode         │
│ G: ImportPath   H: PatternDup           │
│ I: ImplLocation J: TypeCast             │
│ K: MatchArm     L: Regression           │
└────────┬────────────────────────────────┘
         ▼ (up to 3 retries with feedback)
┌─────────────────────────────────────────┐
│     LAYER 2: cargo check validation     │
└────────┬────────────────────────────────┘
         ▼
┌─────────────────────────────────────────┐
│     LAYER 3: LLM Review Gate            │
└────────┬────────────────────────────────┘
         ▼
┌─────────────────┐
│  Write to file  │
└─────────────────┘
```

### Expected Results
- **Input**: 500-600 errors
- **Output**: 10-20 errors (97%+ reduction)
- **Quality**: 4-5/10 (some semantic issues)

### Logs
- `/tmp/v2-retry-run.log` - Full run output
- `/tmp/gate-rejections.json` - Gate rejection details

---

## Phase 2: Dedicated Agent Cleanup

### When to Use
- After Phase 1 completes
- <50 errors remaining
- Need high-quality fixes (8-10/10)

### How to Invoke

Spawn a rust-developer agent with this prompt:

```
You are a Rust compilation error fixer. Fix the remaining errors in the Rust services codebase.

CONTEXT:
- Cerebras LLM already fixed ~97% of errors
- Quality validation found some semantic issues in applied fixes
- Remaining errors are mechanical: type mismatches, missing imports

WORKING DIRECTORY:
cd <YOUR_RUST_PROJECT_PATH>  # e.g., services/rust-services

STEP 1: Get current error count and locations
SQLX_OFFLINE=true cargo check 2>&1 | grep -E "^error\[E" | sort | uniq -c | sort -rn

STEP 2: For each error file, fix in order of dependency:
1. Read the FULL file to understand context
2. Identify the root cause (not just the symptom)
3. Apply minimal fix that preserves semantics
4. Run `SQLX_OFFLINE=true cargo check` to verify
5. If new errors appear, fix those too

RULES:
- Read FULL file before editing (not just error snippets)
- Preserve ALL existing imports, don't duplicate
- Use proper Rust idioms (? operator, as casts, trait bounds)
- Fix root causes first (cascading errors will resolve)
- Verify with cargo check after EACH file

COMMON ERROR TYPES:
- E0308 (type mismatch): Add explicit casts or fix generics
- E0412/E0433/E0425 (missing type/import): Add `use` statements
- E0599 (wrong method): Fix method chain (e.g., .ok_or_else() on Result)

Report final error count when done.
```

### Expected Results
- **Input**: 10-20 errors
- **Output**: 0 errors
- **Quality**: 9-10/10

---

## Full Workflow Example

```bash
# 1. Check initial error count
cd <YOUR_RUST_PROJECT_PATH>
SQLX_OFFLINE=true cargo check 2>&1 | grep -c "^error\["
# Output: 581

# 2. Run Phase 1 (Cerebras bulk fixer)
cd .claude/skills/cfn-mdap-error-fixer/lib/fixer
export CEREBRAS_API_KEY="your-key"
npx tsx cerebras-gated-fixer-v2.ts 2>&1 | tee /tmp/run.log
# Output: 581 → 16 (97.2% reduction)

# 3. Validate quality (optional)
# Spawn 4 parallel code-reviewer agents to assess fix quality

# 4. Run Phase 2 (dedicated agent cleanup)
# Spawn rust-developer agent with prompt above
# Output: 16 → 0

# 5. Final verification
SQLX_OFFLINE=true cargo check
# Output: Finished dev profile
```

---

---

# TypeScript Error Fixer

Two-phase workflow for fixing large-scale TypeScript compilation errors using Cerebras LLM bulk processing + dedicated agent cleanup.

## Phase 1: Cerebras Bulk Fixer (TypeScript)

### When to Use
- 50+ compilation errors
- Need fast bulk reduction
- Errors are mostly mechanical (type mismatches, missing imports, JSX issues)

### How to Run

```bash
# From skill folder (for distribution)
cd .claude/skills/cfn-mdap-error-fixer/lib/fixer
npm install @cerebras/cerebras_cloud_sdk  # One-time setup

# Set your project path
export TS_PROJECT_PATH="/path/to/your/typescript/project"

# Production run
npx tsx typescript-gated-fixer-v2.ts

# Preview patches
npx tsx typescript-gated-fixer-v2.ts --dry-run

# Debug output
npx tsx typescript-gated-fixer-v2.ts --verbose
```

### Architecture (TypeScript)

```
┌─────────────────┐
│     tsc         │ → Parse errors
└────────┬────────┘
         ▼
┌─────────────────┐
│ Cerebras LLM    │ → Generate fix (zai-glm-4.6)
└────────┬────────┘
         ▼
┌─────────────────────────────────────────┐
│     LAYER 1: 13 Structural Gates        │
├─────────────────────────────────────────┤
│ A: LineCount    B: MethodSignature      │
│ C: ImportDup    D: BraceBalance         │
│ E: SemanticDiff F: OrphanedCode         │
│ G: ImportPath   H: TypeAnnotation       │
│ I: JSXIntegrity J: PatternDup           │
│ K: ImportLoc    L: TypeCast            │
│ M: Regression   │                       │
└────────┬────────────────────────────────┘
         ▼ (up to 3 retries with feedback)
┌─────────────────────────────────────────┐
│     LAYER 2: tsc validation            │
└────────┬────────────────────────────────┘
         ▼
┌─────────────────────────────────────────┐
│     LAYER 3: LLM Review Gate            │
└────────┬────────────────────────────────┘
         ▼
┌─────────────────┐
│  Write to file  │
└─────────────────┘
```

### TypeScript-Specific Gates

- **Gate G**: Import Path Validator - Prevents invalid import paths
- **Gate H**: Type Annotation Validator - Ensures syntactically valid types
- **Gate I**: JSX Integrity - Validates JSX structure and syntax
- **Gate M**: Regression Seeds - Catches known TypeScript anti-patterns

### Expected Results
- **Input**: 500+ errors
- **Output**: 10-20 errors (95%+ reduction)
- **Quality**: 4-5/10 (some semantic issues)

### Logs
- `/tmp/ts-gate-rejections.json` - Gate rejection details

## Phase 2: Dedicated Agent Cleanup (TypeScript)

### When to Use
- After Phase 1 completes
- <50 errors remaining
- Need high-quality fixes (8-10/10)

### How to Invoke

Spawn a typescript-developer agent with this prompt:

```
You are a TypeScript compilation error fixer. Fix the remaining errors in the TypeScript codebase.

CONTEXT:
- Cerebras LLM already fixed ~95% of errors
- Quality validation found some semantic issues in applied fixes
- Remaining errors are mechanical: type mismatches, missing imports, JSX issues

WORKING DIRECTORY:
cd <YOUR_TYPESCRIPT_PROJECT_PATH>

STEP 1: Get current error count and locations
npx tsc --noEmit 2>&1 | grep -E "error TS" | sort | uniq -c | sort -rn

STEP 2: For each error file, fix in order of dependency:
1. Read the FULL file to understand context
2. Identify the root cause (not just the symptom)
3. Apply minimal fix that preserves semantics
4. Run `npx tsc --noEmit` to verify
5. If new errors appear, fix those too

RULES:
- Read FULL file before editing (not just error snippets)
- Preserve ALL existing imports, don't duplicate
- Use proper TypeScript idioms (generics, utility types, type guards)
- Fix root causes first (cascading errors will resolve)
- Verify with tsc after EACH file
- For JSX errors, ensure component props and structure

COMMON ERROR TYPES:
- TS2307 (module not found): Fix import paths, check package.json
- TS2322/TS7005 (type mismatch): Add proper type annotations or assertions
- TS2339/TS2551 (property not found): Fix type definitions or use optional chaining
- TS2769 (no overload): Fix function call signatures
- JSX errors: Check component props, imports, and syntax

Report final error count when done.
```

### Expected Results
- **Input**: 10-20 errors
- **Output**: 0 errors
- **Quality**: 9-10/10

## Full Workflow Example (TypeScript)

```bash
# 1. Check initial error count
cd <YOUR_TYPESCRIPT_PROJECT_PATH>
npx tsc --noEmit 2>&1 | grep -c "error TS"
# Output: 542

# 2. Run Phase 1 (Cerebras bulk fixer)
cd .claude/skills/cfn-mdap-error-fixer/lib/fixer
export CEREBRAS_API_KEY="your-key"
export TS_PROJECT_PATH="/path/to/project"
npx tsx typescript-gated-fixer-v2.ts 2>&1 | tee /tmp/ts-run.log
# Output: 542 → 18 (96.7% reduction)

# 3. Run Phase 2 (dedicated agent cleanup)
# Spawn typescript-developer agent with prompt above
# Output: 18 → 0

# 4. Final verification
npx tsc --noEmit
# Output: (no output = success)
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `./HANDOFF.md` | Detailed handoff documentation |
| `./lib/fixer/cerebras-gated-fixer-v2.ts` | Rust fixer (self-contained) |
| `./lib/fixer/typescript-gated-fixer-v2.ts` | TypeScript fixer (self-contained) |
| `./lib/gates/typescript-gates.ts` | TypeScript validation gates |
| `/tmp/gate-rejections.json` | Rust gate rejection log (runtime) |
| `/tmp/ts-gate-rejections.json` | TypeScript gate rejection log (runtime) |

## Environment Requirements

- Node.js 18+
- TypeScript 5.0+
- Rust 1.86.0 (for Rust fixer)
- `CEREBRAS_API_KEY` in `.env`
- `SQLX_OFFLINE=true` for cargo check without DB (Rust only)
- `TS_PROJECT_PATH` environment variable for TypeScript fixer
