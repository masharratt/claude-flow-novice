# Rust Error Fixer Testing Guide

This document provides comprehensive testing instructions for the Rust compilation error fixer (`cerebras-gated-fixer-v2.ts`).

## Overview

The Rust error fixer uses a 3-layer gated architecture with 12 structural validation gates to safely fix Rust compilation errors using Cerebras LLM.

## Test Suite

### 1. Basic Implementation Tests

Run the main test suite:
```bash
./test-rust-fixer.sh
```

This validates:
- ✅ All 12 structural gates (A-L)
- ✅ Rust error code classification
- ✅ Security protections
- ✅ File operations
- ✅ Configuration settings

### 2. Integration Tests

Run integration tests with a realistic Rust project:
```bash
./test-rust-fixer-integration.sh
```

This creates a multi-file Rust project with various error types and tests the fixer end-to-end.

## Supported Error Codes

| Code | Description | Example Fix |
|------|-------------|-------------|
| E0308 | Type mismatch | Add type conversion or fix annotation |
| E0412 | Cannot find type | Add `use` statement or fix typo |
| E0433 | Failed to resolve | Fix import path or add module |
| E0425 | Cannot find value | Add variable or fix scope |
| E0599 | No method found | Fix method name or implement trait |
| E0277 | Trait not implemented | Add `impl` block or derive macro |
| E0382 | Use of moved value | Add `.clone()` or use reference |
| E0063 | Missing struct field | Add missing field |
| E0061 | Wrong number of arguments | Fix function call |
| E0282 | Type annotations needed | Add explicit type |

## Testing Scenarios

### Scenario 1: Type Mismatches
```rust
// Before (E0308)
let x: i32 = "hello";

// After
let x: i32 = 42;
// or
let x: &str = "hello";
```

### Scenario 2: Missing Imports
```rust
// Before (E0433)
use HashMap<String, String>;

// After
use std::collections::HashMap;
```

### Scenario 3: Method Not Found
```rust
// Before (E0599)
let v = vec![1, 2, 3];
v.get_first();

// After
let v = vec![1, 2, 3];
v.first();
```

## Running the Fixer

### Prerequisites
1. Set up Cerebras API key:
   ```bash
   export CEREBRAS_API_KEY="your-api-key"
   ```

2. Install dependencies:
   ```bash
   cd lib/fixer
   npm install
   ```

### Basic Usage
```bash
# Preview fixes (dry-run)
npx tsx cerebras-gated-fixer-v2.ts --dry-run

# Apply fixes
npx tsx cerebras-gated-fixer-v2.ts

# Verbose output
npx tsx cerebras-gated-fixer-v2.ts --verbose
```

### Configuration

Edit `cerebras-gated-fixer-v2.ts` to configure:
- `projectPath`: Path to your Rust project
- `maxGlobalIterations`: Maximum fix iterations (default: 5)
- `maxLayer1Retries`: Maximum Layer 1 retries (default: 3)
- `parallelLLMCalls`: Files to process in parallel (default: 10)

## Validation Gates

The fixer uses 12 gates to validate fixes:

| Gate | Name | What It Checks |
|------|------|----------------|
| A | LineCount | File size change (±30 lines) |
| B | FnSignature | Function signature preservation |
| C | ImportDup | Duplicate import detection |
| D | BraceBalance | Matching braces/brackets |
| E | SemanticDiff | Semantic similarity check |
| F | OrphanedCode | Detects orphaned code blocks |
| G | ImportPath | Valid import paths |
| H | PatternDup | Duplicate pattern bindings |
| I | ImplLocation | impl block placement |
| J | TypeCast | Type cast validation |
| K | MatchArm | Match structure integrity |
| L | Regression | Known-bad pattern detection |

## Test Results

When tests pass, you should see:
```
🎉 Rust Fixer Test Summary
==========================
✅ All 12 structural gates implemented (A-L)
✅ Rust error code classification
✅ 3-layer validation system
✅ Two-phase workflow support
✅ Retry mechanisms with feedback
✅ Gate statistics and dry-run mode
```

## Troubleshooting

### Test Fails: "CEREBRAS_API_KEY not set"
```bash
export CEREBRAS_API_KEY="your-key"
```

### Test Fails: "Rust/Cargo not installed"
Install Rust from https://rustup.rs/

### Test Fails: "Node.js not installed"
Install Node.js from https://nodejs.org/

### Fixer Doesn't Start
1. Check project path configuration
2. Verify Rust project has `Cargo.toml`
3. Ensure project compiles (has errors to fix)

## Contributing

To add tests for new error types:
1. Update `test-rust-fixer.sh` with new error code
2. Add test case to `test-rust-fixer-integration.sh`
3. Update this README with the new error type

## Security

The fixer includes:
- Command injection protection
- Path traversal validation
- File size limits
- Atomic file operations
- Input validation for all parameters

Always review fixes before applying to production code.
