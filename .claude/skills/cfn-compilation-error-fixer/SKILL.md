# CFN Compilation Error Fixer

A CloudFormation (CFN) skill that automatically fixes compilation errors in infrastructure code through a two-phase architecture.

## Architecture

### Phase 1: Cerebras LLM Bulk Error Fixing
- Leverages Cerebras LLM for rapid, bulk error identification and initial fixes
- Processes multiple compilation errors simultaneously
- Generates preliminary fixes for both Rust and TypeScript codebases

### Phase 2: Dedicated CFN Agent Cleanup
- Specialized CFN agent validates and refines Phase 1 fixes
- Ensures compliance with CFN best practices and syntax
- Performs final validation and optimization

## Language Support

### Rust Implementation
- Self-contained fixer in `cerebras-gated-fixer-v2.ts`
- Rust-specific validation gates
- Handles Cargo.toml, Rust compilation errors, and dependency issues

### TypeScript Implementation
- Self-contained fixer in `typescript-gated-fixer-v2.ts`
- TypeScript-specific validation gates in `typescript-gates.ts`
- Resolves module resolution, type errors, and dependency conflicts

## Execution Model

- **Local/Standalone**: Runs entirely on local machine without distributed processing
- **Self-contained**: All logic encapsulated in individual fixer modules
- **No external dependencies**: Requires only npm install for package dependencies

## Key Features

- **Two-phase processing**: Combines LLM speed with agent precision
- **Language-specific gates**: Tailored validation for Rust and TypeScript
- **Bulk error handling**: Processes multiple errors in single execution
- **CFN compliance**: Ensures all fixes meet CloudFormation standards
- **Minimal setup**: Simple npm install and run configuration

## Benefits

- Rapid error resolution through parallel processing
- High fix success rate with dual-phase validation
- Reduced manual debugging time
- Consistent application of CFN best practices
- Support for modern infrastructure as code patterns