---
name: cfn-cerebras-error-fixer
description: Parallel compilation error fixing using Cerebras LLM with JSON diff mode
version: 1.1.0
tags: [cerebras, error-fixing, rust, typescript, parallel, diff-mode]
status: production
author: OurStories Team + CFN
---

# Cerebras Error Fixer Skill

Fix Rust and TypeScript compilation errors in parallel using Cerebras's fast inference API with JSON diff mode.

## Quick Start

```bash
cd .claude/skills/cfn-cerebras-error-fixer

# Install dependencies
npm install

# Set API key
export CEREBRAS_API_KEY="your-key"

# Fix TypeScript errors
npm run fix:ts -- /path/to/project

# Fix Rust errors
npm run fix:rust -- /path/to/project
```

## Performance

| Language | Success Rate | Speed | Token Efficiency |
|----------|--------------|-------|------------------|
| TypeScript | 95% | ~30 files/min | 75-90% savings |
| Rust | 16-40%* | ~30 files/min | 75-90% savings |

*Rust success varies by error complexity. Domain model errors (E0599, E0560) are harder than simple type errors.

## How It Works

### 1. Error Detection
```bash
# TypeScript
npx tsc --noEmit 2>&1

# Rust
SQLX_OFFLINE=true cargo check 2>&1
```

### 2. Context Extraction (Token Efficient)
Only sends ~20 lines around each error, not full files:
```
// Lines 35-55 (errors: L45:TS2322)
    35: function calculate(value: number) {
    ...
>>> 45:     const result: number = getValue();
    ...
    55: }
```

### 3. JSON Diff Generation
LLM returns structured fix instructions:
```json
{
  "fixes": [
    {"line": 45, "action": "replace", "content": "const result = getValue() as number;"},
    {"line": 12, "action": "insert_before", "content": "import { Type } from './types';"},
    {"line": 100, "action": "delete"}
  ]
}
```

### 4. Deterministic Apply
Fixes applied by pure code function (no LLM):
- Sorts fixes reverse by line number
- Validates bracket/brace balance
- Auto-rollback on syntax corruption

## Usage

### Fix All TypeScript Errors
```bash
npm run fix:ts -- /path/to/frontend

# Limit to first N files
npm run fix:ts -- /path/to/frontend 20
```

### Fix All Rust Errors
```bash
npm run fix:rust -- /path/to/rust-project

# Limit to first N files
npm run fix:rust -- /path/to/rust-project 50
```

### Fix Single File (for MCP integration)
```bash
npm run fix:file -- /path/to/file.ts '[{"code":"TS2304","line":10,"message":"Cannot find name"}]'
```

## Supported Error Types

### TypeScript
| Code | Description | Fix Strategy |
|------|-------------|--------------|
| TS2304 | Cannot find name | Add import |
| TS2307 | Module not found | Add import path |
| TS2339 | Property doesn't exist | Add to interface or `as Type` |
| TS2345 | Argument type wrong | Type assertion |
| TS2322 | Type not assignable | Fix type or assertion |
| TS18046 | Unknown type | `as Type` cast |
| TS18048 | Possibly undefined | `?.` or `!` or guard |
| TS7006 | Implicit any | Add type annotation |

### Rust
| Code | Description | Fix Strategy |
|------|-------------|--------------|
| E0308 | Type mismatch | Fix type or `.into()` |
| E0277 | Trait not implemented | Add impl or derive |
| E0599 | Method not found | Add impl block |
| E0560 | Struct field missing | Add field |
| E0382 | Moved value | `.clone()` or &reference |
| E0425 | Not found in scope | Add `use` statement |

## Configuration

Edit constants in source files:

```typescript
const CONFIG = {
  maxErrorsPerFile: 5,    // TS: 5, Rust: 3 (Rust errors more complex)
  contextLines: 10,       // Lines around each error
  maxTokens: 4000,        // Cerebras response limit
};
```

## API Keys

Required environment variable:
```bash
export CEREBRAS_API_KEY="your-cerebras-api-key"
```

Get key from: https://cerebras.ai

**Model Used:** `zai-glm-4.6` (Z.ai subscription on Cerebras)

## Iteration Strategy

MDAP rarely fixes everything in one pass:

```bash
# Iteration 1: Fix bulk errors (60-95%)
npm run fix:ts -- ./src
npx tsc --noEmit 2>&1 | grep "error" | wc -l

# Iteration 2: Fix cascading errors (80-95% of remaining)
npm run fix:ts -- ./src

# Iteration 3: Manual review (<10 usually remain)
```

## Troubleshooting

### "No valid fixes in response"
LLM returned invalid JSON. Error may be too complex for line-based fixes.

### "Syntax error, skipped"
Fix would corrupt file. Auto-rolled back. Needs manual intervention.

### "Rate limited"
Cerebras has generous limits. If hit:
- Reduce file count: `npm run fix:ts -- ./src 10`
- Wait 30 seconds between runs

### Model Not Found (404)
Use `zai-glm-4.6` (with `zai-` prefix), not `glm-4.6`.

## File Structure

```
cfn-cerebras-error-fixer/
├── skill.md              # This file
├── package.json          # Dependencies
├── src/
│   ├── cerebras-client.ts      # Cerebras API with retry
│   ├── diff-applier.ts         # Deterministic fix application
│   ├── typescript-fixer.ts     # TS parallel fixer
│   ├── rust-fixer.ts           # Rust parallel fixer
│   └── single-file-fixer.ts    # Single file (MCP integration)
```

## Integration with MDAP (Trigger.dev)

For distributed execution across many files, use the MDAP implementer:

```typescript
import { tasks } from "@trigger.dev/sdk/v3";

await tasks.trigger("cfn-mdap-implementer", {
  taskId: "fix-001",
  microTaskId: "file-1",
  targetFile: "src/foo.ts",
  taskDescription: "Fix TypeScript errors",
  language: "TypeScript",
  diffMode: true,
  errors: [{ code: "TS2304", line: 10, message: "..." }],
  fullFileContent: "...",
  workDir: "/workspace",
});
```

See: `docker/trigger-dev/src/trigger/cfn-mdap-implementer.ts`

## Comparison: Local vs Trigger.dev

| Aspect | This Skill (Local) | MDAP (Trigger.dev) |
|--------|-------------------|-------------------|
| Setup | Just CEREBRAS_API_KEY | Full Trigger.dev infra |
| Speed | ~30 files/min | ~60 files/min (distributed) |
| Cost | Direct Cerebras | Same |
| Use When | Quick fixes, <100 files | Large codebases, CI/CD |

## Version History

### 1.1.0 (2025-12-07)
- CFN distribution with standalone implementation
- Removed broken symlink to tools/
- Added src/ with all scripts
- Aligned with MDAP diff mode protocol
- Added zai-glm-4.6 model configuration

### 1.0.0 (2025-12-07)
- Initial skill from OurStories team
- TypeScript parallel fixer (95% success)
- Rust parallel fixer (16% success)
- JSON diff mode with context windows
