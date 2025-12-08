# TypeScript Error Fixer - Quick Start

## Overview

The TypeScript Error Fixer is a two-phase system for automatically fixing TypeScript compilation errors:
1. **Phase 1**: Cerebras LLM bulk fixer (95%+ error reduction)
2. **Phase 2**: Dedicated agent cleanup (remaining errors)

## Prerequisites

```bash
# Install dependencies
cd .claude/skills/cfn-mdap-error-fixer/lib/fixer
npm install

# Set environment variables
export CEREBRAS_API_KEY="your-api-key"
export TS_PROJECT_PATH="/path/to/your/typescript/project"
```

## Phase 1: Bulk Fixing

### Quick Start

```bash
# Run the fixer
npx tsx typescript-gated-fixer-v2.ts

# Check results
cd $TS_PROJECT_PATH
npx tsc --noEmit
```

### Options

```bash
# Preview changes without applying
npx tsx typescript-gated-fixer-v2.ts --dry-run

# Verbose output with gate details
npx tsx typescript-gated-fixer-v2.ts --verbose

# Skip Layer 3 LLM review (faster)
npx tsx typescript-gated-fixer-v2.ts --no-layer3
```

### What It Fixes

The bulk fixer handles common TypeScript errors:
- **TS2307**: Module not found - fixes import paths
- **TS2322/TS7005**: Type mismatch - adds type annotations
- **TS2339/TS2551**: Property not found - fixes type definitions
- **TS2304**: Cannot find name - adds missing imports
- **TS1192**: Module exports - fixes import/export syntax
- **JSX errors**: Component structure and props

### Example Output

```
🔧 TypeScript Gated Error Fixer V2
   Project: /path/to/project
   Model: zai-glm-4.6
   Dry run: false

📊 Analyzing TypeScript errors...
   Found 542 errors
   Across 23 files

📁 Processing src/components/Button.tsx (12 errors)
   ✅ Fixed src/components/Button.tsx:15 (TS2322)
   ✅ Fixed src/components/Button.tsx:23 (TS2339)
   ...

📈 Results:
   Initial errors: 542
   Final errors: 18
   Fixed: 524
   Reduction: 97%

🚀 Phase 1 Complete
   Phase 2: Run dedicated agent for cleanup
```

## Phase 2: Agent Cleanup

When Phase 1 completes with remaining errors, spawn a TypeScript developer agent:

```
You are a TypeScript compilation error fixer. Fix the remaining errors.

CONTEXT:
- Cerebras LLM already fixed ~95% of errors
- 18 errors remain across 5 files
- Need high-quality fixes

WORKING DIRECTORY:
cd /path/to/typescript/project

STEP 1: Check remaining errors
npx tsc --noEmit 2>&1 | grep "error TS"

STEP 2: Fix each file
1. Read the full file
2. Identify root cause
3. Apply minimal fix
4. Verify with tsc
5. Fix cascading errors

Report final error count.
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CEREBRAS_API_KEY` | Cerebras API key | Required |
| `TS_PROJECT_PATH` | Path to TypeScript project | Current directory |
| `TS_EXCLUDE_PATTERN` | Files to exclude (regex) | `node_modules|dist|build|\.git` |

### File Processing

- **Includes**: `.ts`, `.tsx` files
- **Excludes**: `node_modules`, `dist`, `build`, `.git` directories
- **Parallel processing**: Up to 10 errors simultaneously

## Gate System

The fixer uses 13 validation gates:

### Core Gates (A-F)
- **A**: Line Count Delta - prevents excessive changes
- **B**: Method Signature - preserves function signatures
- **C**: Import Duplicate - prevents duplicate imports
- **D**: Brace Balance - ensures syntactic validity
- **E**: Semantic Diff - preserves variable names/logic
- **F**: Orphaned Code - detects dangling statements

### TypeScript-Specific Gates (G-M)
- **G**: Import Path Validator - validates import paths
- **H**: Type Annotation Validator - checks type syntax
- **I**: JSX Integrity - validates JSX structure
- **J**: Pattern Duplicate - prevents duplicate types/interfaces
- **K**: Import Location - ensures imports at top
- **L**: Type Cast - validates type assertions
- **M**: Regression Seeds - prevents known anti-patterns

## Troubleshooting

### Common Issues

1. **"File not found" errors**
   - Check `TS_PROJECT_PATH` is correct
   - Ensure paths in error messages match actual file structure

2. **High rejection rate**
   - Run with `--verbose` to see gate rejections
   - Check `/tmp/ts-gate-rejections.json` for details

3. **No API key error**
   - Set `CEREBRAS_API_KEY` environment variable
   - Add to `.env` file in project root

### Debug Mode

```bash
# Run with maximum output
DEBUG=true npx tsx typescript-gated-fixer-v2.ts --verbose 2>&1 | tee /tmp/ts-debug.log

# Check rejection reasons
cat /tmp/ts-gate-rejections.json | jq '.'
```

## Best Practices

1. **Before Running**
   - Commit your code or create a branch
   - Run `npx tsc --noEmit` to see initial error count

2. **After Phase 1**
   - Review the reduction percentage
   - If >5% errors remain, run Phase 2

3. **Final Verification**
   - Run `npx tsc --noEmit` to confirm all errors fixed
   - Run tests to ensure functionality preserved

## Performance

- **Speed**: ~50 errors/minute (depends on API limits)
- **Memory**: ~100MB for 500 errors
- **Success Rate**: 95%+ error reduction typical

## Integration with CI/CD

```yaml
# .github/workflows/typescript-fix.yml
name: TypeScript Auto-Fix
on:
  push:
    paths: ['**/*.ts', '**/*.tsx']

jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - name: Run TypeScript fixer
        env:
          CEREBRAS_API_KEY: ${{ secrets.CEREBRAS_API_KEY }}
          TS_PROJECT_PATH: ${{ github.workspace }}
        run: |
          cd .claude/skills/cfn-mdap-error-fixer/lib/fixer
          npx tsx typescript-gated-fixer-v2.ts
      - name: Commit fixes
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add -A
          git diff --staged --quiet || git commit -m "Auto-fix TypeScript errors"
```