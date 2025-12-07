# MDAP Parallel Fixer: Lessons Learned

## Executive Summary

Production issues revealed that parallel error fixing with limited context leads to LLM hallucinations and invalid fixes. This document captures root causes and recommended mitigations.

## Root Causes

### Problem 1: Insufficient Context (Primary Cause)

**Impact: HIGH**

The fixer provides only ~10 lines around each error, but Rust/TypeScript errors often require:

| Error Type | Context Needed | Current Gap |
|------------|---------------|-------------|
| Type errors (E0308) | Function signature being called | Often in different file |
| Import errors (E0432) | mod.rs and lib.rs exports | Never included |
| Borrow checker (E0382) | Entire async block/closure | May span 50+ lines |
| Trait bounds | Trait definition + impl blocks | Usually separate files |

**Example:**
```
error[E0308]: expected Pool<Postgres>, found Config
  --> api-gateway/src/routes.rs:76
```

LLM sees 10 lines around line 76, but doesn't see:
- What `config` actually contains (defined elsewhere)
- `StoriesRepository::new()` signature (different file)
- Available variables that ARE `Pool<Postgres>`

### Problem 2: Line-Based Diff is Too Coarse

**Impact: MEDIUM**

Current approach: `{"line": N, "action": "replace", "content": "..."}`

But fixing errors often requires:
- Adding import at line 1 to fix error at line 200
- Adding `.clone()` mid-expression (character-level, not line-level)
- Changing multi-line type annotations
- Modifying closure signatures that span multiple lines

### Problem 3: No Semantic Validation

**Impact: HIGH**

Only validates brace balance, not:
- Whether referenced modules/types exist
- Whether types are correct
- Whether fix introduces NEW errors
- Whether imports resolve

### Problem 4: Batch Conflicts

**Impact: MEDIUM**

Fixing 3 errors per file at once:
- Fixes can conflict when modifying overlapping regions
- Line numbers shift after first fix, invalidating subsequent fixes
- Cascading errors may disappear after fixing root cause

### Problem 5: LLM Hallucinations

**Impact: HIGH**

Without enough context, the LLM invents plausible-sounding but wrong solutions:
- `example_integration::BatchProcessorTrait` (doesn't exist)
- Adding random imports that don't resolve
- Changing types to things that don't match
- Creating circular dependencies

## Recommended Solutions

### Tier 1: Quick Wins (Low Effort, High Impact)

#### 1.1 Single Error Per Call

```typescript
// BEFORE: 3 errors per batch
maxErrorsPerBatch: 3

// AFTER: 1 error per batch for reliability
maxErrorsPerBatch: 1
```

**Tradeoff:** Slower but more reliable. Can parallelize across files instead of within files.

#### 1.2 Error Categorization

Skip or flag complex errors for human review:

```typescript
const HARD_ERRORS = [
  'E0382', // borrow checker - use of moved value
  'E0499', // cannot borrow as mutable more than once
  'E0515', // cannot return value referencing local variable
  'E0597', // borrowed value does not live long enough
];

const EASY_ERRORS = [
  'E0425', // cannot find value (missing import)
  'E0412', // cannot find type (missing import)
  'E0433', // failed to resolve (missing import)
];

function shouldAutoFix(errorCode: string): boolean {
  if (HARD_ERRORS.includes(errorCode)) {
    console.log(`[SKIP] ${errorCode} requires human review`);
    return false;
  }
  return true;
}
```

#### 1.3 Full File for Complex Errors

```typescript
function getContextSize(error: RustError): number {
  // Borrow checker errors need full function context
  if (['E0382', 'E0499', 'E0597'].includes(error.code)) {
    return Infinity; // Full file
  }
  // Type mismatches need more context
  if (error.code === 'E0308') {
    return 50; // 50 lines
  }
  // Simple errors need less
  return 15;
}
```

### Tier 2: Medium Effort, High Impact

#### 2.1 Parse Cargo Notes for Cross-File Context

Cargo often tells you where things are defined:

```
error[E0308]: mismatched types
 --> src/routes.rs:76:23
  |
76 |     StoriesRepository::new(config)
  |                            ^^^^^^ expected `Pool<Postgres>`, found `Config`
  |
note: function defined here
 --> src/repository.rs:15:5
  |
15 |     pub fn new(pool: Pool<Postgres>) -> Self {
```

**Implementation:**

```typescript
interface CargoNote {
  file: string;
  line: number;
  description: string;
}

function parseCargoNotes(output: string): CargoNote[] {
  const notes: CargoNote[] = [];
  const noteRegex = /note:\s+(.+)\n\s*-->\s+(.+):(\d+)/g;
  let match;
  while ((match = noteRegex.exec(output)) !== null) {
    notes.push({
      description: match[1],
      file: match[2],
      line: parseInt(match[3], 10),
    });
  }
  return notes;
}

// Include referenced file snippets in context
function buildEnhancedContext(error: RustError, notes: CargoNote[]): string {
  let context = extractContextWindows(mainFile, [error]);

  for (const note of notes) {
    if (note.file !== error.file) {
      const refContent = fs.readFileSync(note.file, 'utf-8');
      const refSnippet = extractLines(refContent, note.line - 5, note.line + 10);
      context += `\n\n--- Referenced in ${note.file}:${note.line} ---\n${refSnippet}`;
    }
  }

  return context;
}
```

#### 2.2 Post-Fix Validation with Cargo Check

```typescript
async function validateFix(filePath: string, newContent: string): Promise<{
  valid: boolean;
  newErrors: number;
  previousErrors: number;
}> {
  // Backup original
  const original = fs.readFileSync(filePath, 'utf-8');
  const previousErrors = countErrors(filePath);

  // Apply fix
  fs.writeFileSync(filePath, newContent);

  // Check
  const newErrors = countErrors(filePath);

  // Rollback if worse
  if (newErrors > previousErrors) {
    fs.writeFileSync(filePath, original);
    return { valid: false, newErrors, previousErrors };
  }

  return { valid: true, newErrors, previousErrors };
}

function countErrors(filePath: string): number {
  try {
    execSync(`cargo check --message-format=short 2>&1 | grep -c "error\\[E"`, {
      cwd: CONFIG.projectPath,
    });
    return 0;
  } catch (e: any) {
    const output = e.stdout?.toString() || '';
    return parseInt(output.trim(), 10) || 0;
  }
}
```

### Tier 3: High Effort, High Impact

#### 3.1 rust-analyzer Integration

Use rust-analyzer's code actions instead of raw LLM:

```typescript
async function getRustAnalyzerFixes(filePath: string, line: number): Promise<CodeAction[]> {
  // rust-analyzer provides semantic fixes that actually work
  const result = await lspRequest('textDocument/codeAction', {
    textDocument: { uri: `file://${filePath}` },
    range: { start: { line, character: 0 }, end: { line, character: 999 } },
    context: { diagnostics: [] },
  });
  return result;
}
```

#### 3.2 Incremental Fixing with Feedback Loop

```typescript
async function incrementalFix(filePath: string, errors: RustError[]): Promise<void> {
  for (const error of errors) {
    // Fix one error
    const fix = await generateFix(filePath, error);

    // Validate
    const result = await validateFix(filePath, fix);

    if (!result.valid) {
      console.log(`Fix for ${error.code} made things worse, rolling back`);
      continue;
    }

    // Re-check for cascading fixes
    const remainingErrors = await getErrors(filePath);
    if (remainingErrors.length < errors.length) {
      console.log(`Fixed ${errors.length - remainingErrors.length} errors with one change!`);
    }

    // Continue with remaining errors (they may have changed)
    errors = remainingErrors;
  }
}
```

## Implementation Priority

| Solution | Impact | Effort | Priority |
|----------|--------|--------|----------|
| Single error per call | Medium | Low | P0 |
| Error categorization (skip hard errors) | Medium | Low | P0 |
| Full file for complex errors | High | Low | P0 |
| Parse cargo notes for cross-file context | High | Medium | P1 |
| Post-fix validation (cargo check) | High | Medium | P1 |
| rust-analyzer integration | High | High | P2 |
| Incremental fixing with feedback | High | High | P2 |

## Metrics to Track

1. **Fix Success Rate**: % of fixes that reduce error count
2. **Hallucination Rate**: % of fixes introducing non-existent imports/types
3. **Regression Rate**: % of fixes that increase error count
4. **Human Intervention Rate**: % of errors requiring human review
5. **Time per Fix**: Average time including validation

## Applying to TypeScript/Other Languages

The same principles apply:

| Rust Error | TypeScript Equivalent | Solution |
|------------|----------------------|----------|
| E0308 (type mismatch) | TS2322 (type not assignable) | Include type definitions |
| E0432 (unresolved import) | TS2307 (cannot find module) | Check tsconfig paths |
| E0382 (moved value) | N/A (GC language) | N/A |

For TypeScript specifically:
- Parse `tsc` output for "defined in" notes
- Include imported module type signatures
- Run `tsc --noEmit` after each fix for validation

## Conclusion

The core issue is **context poverty** - the LLM doesn't have enough information to make correct decisions. Quick wins focus on:

1. Reducing batch size to 1 error at a time
2. Skipping known-hard errors for human review
3. Providing more context for complex error types

Medium-term improvements add semantic validation through cargo check / tsc after each fix.

Long-term, consider rust-analyzer / TypeScript language server integration for errors where the compiler already knows the fix.

---

*Document created: 2025-12-07*
*Based on OurStories production feedback*
