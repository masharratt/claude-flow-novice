# Rust Error Fixer Testing Guide

## Overview

This guide covers testing for the Rust compilation error fixer located at `lib/fixer/cerebras-gated-fixer-v2.ts`.

## Test Suite Components

### 1. Main Test Suite (`test-rust-fixer.sh`)

Comprehensive test suite that validates:
- ✅ File structure and configuration
- ✅ Rust-specific settings (project paths, patch directories)
- ✅ RustError interface and fields
- ✅ All 12 structural gates (A-L)
- ✅ Error code classification for 10 major Rust error types
- ✅ Two-phase workflow implementation
- ✅ Security protections
- ✅ File operations and rollback mechanisms
- ✅ Atomic operations
- ✅ Retry mechanisms with feedback
- ✅ Gate statistics tracking
- ✅ Dry-run mode
- ✅ Parallel processing
- ✅ Clippy integration
- ✅ SQLX offline mode
- ✅ Sample Rust project generation
- ✅ Environment requirements

### 2. Validation Tests (`test-rust-fixer-validation.sh`)

Lightweight validation that checks:
- TypeScript syntax validation
- Dependency verification
- Gate implementation confirmation
- Error classification coverage

### 3. Integration Tests (`test-rust-fixer-integration.sh`)

End-to-end testing with:
- Multi-file Rust project creation
- Real compilation error injection
- Fixer execution (when API key available)
- Before/after error comparison

## Running Tests

### Prerequisites

1. Install required tools:
   ```bash
   # Rust toolchain
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   
   # Node.js
   # Install from https://nodejs.org/
   ```

2. Set up environment:
   ```bash
   export CEREBRAS_API_KEY="your-api-key"  # Optional for dry-run tests
   ```

### Test Execution

```bash
# Run main test suite
./test-rust-fixer.sh

# Run validation tests
./test-rust-fixer-validation.sh

# Run integration tests (requires API key for full execution)
./test-rust-fixer-integration.sh
```

## Test Coverage Details

### Structural Gates (A-L)

| Gate | Name | Validation |
|------|------|------------|
| A | LineCount | ±30 lines change limit |
| B | FnSignature | Function signature preservation |
| C | ImportDup | Duplicate import detection |
| D | BraceBalance | Matching braces/brackets |
| E | SemanticDiff | Semantic similarity check |
| F | OrphanedCode | Orphaned code detection |
| G | ImportPath | Import path validation |
| H | PatternDup | Duplicate pattern bindings |
| I | ImplLocation | impl block placement |
| J | TypeCast | Type cast validation |
| K | MatchArm | Match structure integrity |
| L | Regression | Known-bad pattern detection |

### Error Code Coverage

The fixer classifies and handles these Rust error codes:
- E0308: Type mismatch
- E0412: Cannot find type
- E0433: Failed to resolve
- E0425: Cannot find value
- E0599: No method found
- E0277: Trait not implemented
- E0382: Use of moved value
- E0063: Missing struct field
- E0061: Wrong number of arguments
- E0282: Type annotation needed

### Security Testing

The test suite validates:
- Command injection protection
- Path traversal validation
- File size limits
- Atomic file operations
- Input sanitization

## Test Results Interpretation

### Successful Test Run

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

### Common Issues

1. **TypeScript Syntax Errors**
   - Update tsconfig.json target to es2015 or higher
   - Install missing dependencies

2. **Missing CEREBRAS_API_KEY**
   - Tests will still run in validation mode
   - Set API key for full integration testing

3. **Rust/Cargo Not Found**
   - Install Rust from https://rustup.rs/

4. **Node.js Not Found**
   - Install Node.js from https://nodejs.org/

## Contributing Tests

To add new test cases:

1. For new error codes:
   - Add to `test-rust-fixer.sh` in error_codes array
   - Update documentation

2. For new gates:
   - Add to gates array in test scripts
   - Create specific test cases

3. For integration scenarios:
   - Add to `test-rust-fixer-integration.sh`
   - Include before/after validation

## Test Environment

The test suite creates temporary test projects at:
- `/tmp/rust-test-project` - Basic test cases
- `/tmp/rust-fixer-integration-test` - Integration tests

These are automatically cleaned up after test completion.
