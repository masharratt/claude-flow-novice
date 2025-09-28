# Claude Code Configuration - SPARC Development Environment (Rust)

## 🚨 CRITICAL: CONCURRENT EXECUTION & FILE MANAGEMENT

**ABSOLUTE RULES**:
1. ALL operations MUST be concurrent/parallel in a single message
2. **NEVER save working files, text/mds and tests to the root folder**
3. ALWAYS organize files in appropriate subdirectories
4. **USE CLAUDE CODE'S TASK TOOL** for spawning agents concurrently, not just MCP

### ⚡ GOLDEN RULE: "1 MESSAGE = ALL RELATED OPERATIONS"

**MANDATORY PATTERNS:**
- **TodoWrite**: ALWAYS batch ALL todos in ONE call (5-10+ todos minimum)
- **Task tool (Claude Code)**: ALWAYS spawn ALL agents in ONE message with full instructions
- **File operations**: ALWAYS batch ALL reads/writes/edits in ONE message
- **Bash commands**: ALWAYS batch ALL terminal operations in ONE message
- **Memory operations**: ALWAYS batch ALL memory store/retrieve in ONE message

### 🎯 CRITICAL: Claude Code Task Tool for Agent Execution

**Claude Code's Task tool is the PRIMARY way to spawn agents:**
```javascript
// ✅ CORRECT: Use Claude Code's Task tool for parallel agent execution
[Single Message]:
  Task("Rust researcher", "Analyze Rust patterns and crate ecosystem...", "researcher")
  Task("Rust coder", "Implement core Rust modules with ownership safety...", "coder")
  Task("Rust tester", "Create comprehensive tests with cargo test...", "tester")
  Task("Rust reviewer", "Review code for Rust best practices and clippy...", "reviewer")
  Task("Rust architect", "Design system architecture with Rust patterns...", "system-architect")
```

### 📁 Rust File Organization Rules

**NEVER save to root folder. Use Rust project structure:**
- `/src` - Source code files (lib.rs, main.rs, modules)
- `/tests` - Integration tests
- `/benches` - Benchmark tests
- `/examples` - Example code
- `/docs` - Documentation and markdown files
- `/target` - Build artifacts (auto-generated, add to .gitignore)
- `Cargo.toml` - Project manifest and dependencies
- `Cargo.lock` - Dependency lock file

## Project Overview

This Rust project uses SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) methodology with Claude-Flow orchestration for systematic Test-Driven Development in Rust.

## Rust-Specific SPARC Commands

### Core Commands
- `npx claude-flow sparc modes` - List available modes
- `npx claude-flow sparc run <mode> "<rust-task>"` - Execute Rust-specific mode
- `npx claude-flow sparc tdd "<rust-feature>"` - Run complete TDD workflow for Rust
- `npx claude-flow sparc info <mode>` - Get mode details

### Rust Build Commands
- `cargo build` - Build project
- `cargo build --release` - Build optimized release
- `cargo test` - Run all tests (unit + integration)
- `cargo test --doc` - Run documentation tests
- `cargo bench` - Run benchmarks
- `cargo clippy` - Rust linter
- `cargo fmt` - Format code
- `cargo check` - Fast compilation check
- `cargo doc --open` - Generate and open documentation
- `cargo audit` - Security audit
- `cargo outdated` - Check outdated dependencies

### Rust Quality Commands
- `cargo clippy -- -D warnings` - Strict linting
- `cargo fmt --check` - Check formatting
- `cargo test --all-features` - Test with all features
- `cargo miri test` - Run tests with Miri (unsafe code checker)

## Rust SPARC Workflow Phases

1. **Specification** - Requirements analysis with Rust constraints (`sparc run spec-pseudocode`)
2. **Pseudocode** - Algorithm design with ownership in mind (`sparc run spec-pseudocode`)
3. **Architecture** - System design with Rust patterns (`sparc run architect`)
4. **Refinement** - TDD implementation with cargo test (`sparc tdd`)
5. **Completion** - Integration with cargo integration tests (`sparc run integration`)

## Rust Code Style & Best Practices

- **Ownership Model**: Follow Rust's ownership, borrowing, and lifetimes
- **Error Handling**: Use Result<T, E> and Option<T> types
- **Memory Safety**: Leverage Rust's compile-time guarantees
- **Performance**: Zero-cost abstractions and efficient algorithms
- **Testing**: Unit tests in modules, integration tests in /tests
- **Documentation**: Comprehensive rustdoc comments
- **Clippy Compliance**: Address all clippy warnings
- **Formatting**: Use rustfmt consistently

## 🚀 Rust-Specific Agents (78+ Total)

### Core Rust Development
`rust-coder`, `rust-reviewer`, `rust-tester`, `rust-researcher`, `rust-architect`

### Rust Ecosystem Specialists
`cargo-expert`, `async-rust-dev`, `unsafe-rust-auditor`, `proc-macro-dev`, `wasm-rust-dev`

### Performance & Optimization
`rust-perf-analyzer`, `memory-safety-auditor`, `benchmark-engineer`, `optimization-specialist`

### Crate Development
`crate-publisher`, `api-designer`, `dependency-manager`, `feature-gate-specialist`

### Systems Programming
`systems-programmer`, `embedded-rust-dev`, `network-programmer`, `concurrency-expert`

### All Standard Agents Available
`coder`, `reviewer`, `tester`, `planner`, `researcher`, `system-architect`, `code-analyzer`, `performance-benchmarker`, `cicd-engineer`, `security-manager`

## 🎯 Rust Development Patterns

### ✅ CORRECT RUST WORKFLOW

```javascript
// Step 1: Set up Rust project coordination
[Single Message - Coordination Setup]:
  mcp__claude-flow__swarm_init { topology: "hierarchical", maxAgents: 6 }
  mcp__claude-flow__agent_spawn { type: "rust-architect" }
  mcp__claude-flow__agent_spawn { type: "rust-coder" }
  mcp__claude-flow__agent_spawn { type: "rust-tester" }

// Step 2: Parallel Rust development execution
[Single Message - Parallel Agent Execution]:
  Task("Rust architect", "Design module structure with proper ownership patterns. Store architecture in memory.", "rust-architect")
  Task("Rust coder", "Implement core modules with safe Rust patterns. Use Result<T,E> for error handling.", "rust-coder")
  Task("Rust tester", "Create comprehensive test suite with cargo test. Include property-based tests.", "rust-tester")
  Task("Cargo expert", "Optimize Cargo.toml with appropriate dependencies and features.", "cargo-expert")
  Task("Performance auditor", "Profile code with cargo bench and optimize hot paths.", "rust-perf-analyzer")

  // Batch ALL Rust todos
  TodoWrite { todos: [
    {content: "Set up Cargo.toml with dependencies", status: "in_progress", activeForm: "Setting up Cargo.toml"},
    {content: "Implement core module with ownership patterns", status: "pending", activeForm: "Implementing core module"},
    {content: "Add comprehensive unit tests", status: "pending", activeForm: "Adding comprehensive unit tests"},
    {content: "Create integration tests in /tests", status: "pending", activeForm: "Creating integration tests"},
    {content: "Add documentation with rustdoc", status: "pending", activeForm: "Adding documentation"},
    {content: "Run clippy and fix warnings", status: "pending", activeForm: "Running clippy and fixing warnings"},
    {content: "Add benchmarks in /benches", status: "pending", activeForm: "Adding benchmarks"},
    {content: "Configure CI/CD with cargo commands", status: "pending", activeForm: "Configuring CI/CD"}
  ]}

  // Parallel Rust file operations
  Write "Cargo.toml"
  Write "src/lib.rs"
  Write "src/main.rs"
  Write "tests/integration_test.rs"
  Write "benches/benchmark.rs"
```

## Rust Agent Coordination Protocol

### Every Rust Agent MUST:

**1️⃣ BEFORE Work:**
```bash
npx claude-flow@alpha hooks pre-task --description "[rust-task]"
cargo check  # Verify compilation
```

**2️⃣ DURING Work:**
```bash
cargo fmt  # Format code
cargo clippy  # Check for issues
npx claude-flow@alpha hooks post-edit --file "[file]" --memory-key "rust/[agent]/[step]"
```

**3️⃣ AFTER Work:**
```bash
cargo test  # Verify tests pass
cargo doc  # Update documentation
npx claude-flow@alpha hooks post-task --task-id "[task]"
```

## Rust-Specific Configurations

### Cargo.toml Template
```toml
[package]
name = "project-name"
version = "0.1.0"
edition = "2021"
authors = ["Your Name <email@example.com>"]
license = "MIT OR Apache-2.0"
description = "A brief description"
repository = "https://github.com/username/project"
readme = "README.md"
keywords = ["rust", "cli", "utility"]
categories = ["command-line-utilities"]

[dependencies]
# Add your dependencies here
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.0", features = ["full"] }
anyhow = "1.0"
clap = { version = "4.0", features = ["derive"] }

[dev-dependencies]
proptest = "1.0"
criterion = "0.4"

[[bench]]
name = "benchmarks"
harness = false

[features]
default = []
# Define feature flags here

[profile.release]
lto = true
codegen-units = 1
panic = "abort"
```

### .gitignore for Rust
```
/target/
**/*.rs.bk
Cargo.lock  # Remove this line if building a binary
.DS_Store
*.swp
*.swo
*~
```

### rustfmt.toml
```toml
max_width = 100
hard_tabs = false
tab_spaces = 4
newline_style = "Unix"
use_small_heuristics = "Default"
reorder_imports = true
reorder_modules = true
```

### clippy.toml
```toml
cognitive-complexity-threshold = 30
too-many-arguments-threshold = 7
type-complexity-threshold = 250
single-char-lifetime-names = true
```

## Testing Strategies

### Unit Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_function() {
        assert_eq!(function_to_test(), expected_result);
    }

    #[test]
    #[should_panic]
    fn test_panic_condition() {
        panic_function();
    }
}
```

### Integration Tests
```rust
// tests/integration_test.rs
use project_name;

#[test]
fn integration_test() {
    // Test the public API
}
```

### Property-Based Tests
```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn property_test(input in any::<i32>()) {
        // Property that should hold for any input
    }
}
```

### Benchmark Tests
```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark_function(c: &mut Criterion) {
    c.bench_function("function_name", |b| {
        b.iter(|| function_to_benchmark(black_box(input)))
    });
}

criterion_group!(benches, benchmark_function);
criterion_main!(benches);
```

## Error Handling Patterns

### Result Type Usage
```rust
use anyhow::{Result, Context};

fn fallible_function() -> Result<String> {
    let data = read_file("config.toml")
        .context("Failed to read configuration file")?;

    Ok(process_data(data))
}
```

### Custom Error Types
```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MyError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Parse error: {message}")]
    Parse { message: String },

    #[error("Validation failed")]
    Validation,
}
```

## Performance Optimization

### Profiling Commands
```bash
# CPU profiling
cargo build --release
perf record --call-graph=dwarf ./target/release/binary
perf report

# Memory profiling with valgrind
cargo build
valgrind --tool=memcheck ./target/debug/binary

# Heap profiling
cargo build --release
heaptrack ./target/release/binary
```

### Optimization Techniques
- Use `Vec::with_capacity()` when size is known
- Prefer `&str` over `String` for function parameters
- Use `Cow<str>` for clone-on-write scenarios
- Consider `Box<[T]>` instead of `Vec<T>` for immutable data
- Use `#[inline]` for small, frequently called functions

## Documentation Standards

### Module Documentation
```rust
//! This module provides functionality for X.
//!
//! # Examples
//!
//! ```
//! use crate::module::function;
//! let result = function();
//! ```

/// Performs operation X on the given input.
///
/// # Arguments
///
/// * `input` - The input to process
///
/// # Returns
///
/// Returns a Result containing the processed data or an error.
///
/// # Examples
///
/// ```
/// let result = process_input("data").unwrap();
/// assert_eq!(result, "processed_data");
/// ```
pub fn process_input(input: &str) -> Result<String> {
    // Implementation
}
```

## CI/CD Configuration

### GitHub Actions (.github/workflows/rust.yml)
```yaml
name: Rust CI

on: [push, pull_request]

env:
  CARGO_TERM_COLOR: always

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Build
      run: cargo build --verbose
    - name: Run tests
      run: cargo test --verbose
    - name: Run clippy
      run: cargo clippy -- -D warnings
    - name: Check formatting
      run: cargo fmt --check
    - name: Security audit
      run: cargo audit
```

## Advanced Rust Features

### Async Programming
```rust
use tokio;

#[tokio::main]
async fn main() -> Result<()> {
    let result = async_function().await?;
    Ok(())
}

async fn async_function() -> Result<String> {
    // Async implementation
}
```

### Procedural Macros
```rust
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput};

#[proc_macro_derive(MyDerive)]
pub fn my_derive(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let name = input.ident;

    let expanded = quote! {
        impl MyTrait for #name {
            // Implementation
        }
    };

    TokenStream::from(expanded)
}
```

## Support Resources

- **Rust Documentation**: https://doc.rust-lang.org/
- **Cargo Guide**: https://doc.rust-lang.org/cargo/
- **Rust by Example**: https://doc.rust-lang.org/rust-by-example/
- **The Rust Programming Language**: https://doc.rust-lang.org/book/
- **Rust Reference**: https://doc.rust-lang.org/reference/
- **Clippy Documentation**: https://rust-lang.github.io/rust-clippy/

---

Remember: **Claude Flow coordinates, Claude Code creates Rust!**