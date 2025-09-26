# Cargo Integration with Claude-Flow

This guide demonstrates how claude-flow integrates directly with Cargo, Rust's native build system and package manager, providing seamless development workflows without simulation.

## 🔧 Real Cargo Integration

Claude-flow provides native integration with the Rust toolchain through the existing validation system. All operations use real Cargo commands, ensuring authentic Rust development experiences.

### Supported Cargo Commands

```bash
# Direct Cargo integration through claude-flow
npx claude-flow cargo build --release
npx claude-flow cargo test --all
npx claude-flow cargo clippy --all-targets
npx claude-flow cargo fmt --check
npx claude-flow cargo audit
npx claude-flow cargo bench

# Quality validation with real toolchain
npx claude-flow validate rust ./my-project
```

## 📦 Project Initialization

### Basic Rust Project Setup

```bash
# Initialize new Rust project with claude-flow
npx claude-flow sparc run architect "Create a CLI tool with clap and async I/O"

# The agent creates optimal Cargo.toml configuration:
```

**Generated Cargo.toml Example:**
```toml
[package]
name = "my-cli-tool"
version = "0.1.0"
edition = "2021"
rust-version = "1.70"
authors = ["Your Name <your.email@example.com>"]
description = "A high-performance CLI tool built with claude-flow"
license = "MIT OR Apache-2.0"
repository = "https://github.com/username/my-cli-tool"
keywords = ["cli", "async", "performance"]
categories = ["command-line-utilities"]

[dependencies]
clap = { version = "4.0", features = ["derive", "env"] }
tokio = { version = "1.0", features = ["full"] }
anyhow = "1.0"
thiserror = "1.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

[dev-dependencies]
tokio-test = "0.4"
tempfile = "3.0"
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "cli_benchmark"
harness = false

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = "abort"
strip = true

[profile.dev]
opt-level = 0
debug = true
overflow-checks = true

[profile.test]
opt-level = 1
debug = true
```

### Web Service Project Setup

```bash
# Create web service with specific framework
npx claude-flow sparc run architect "Create REST API with Axum, PostgreSQL, and JWT auth"
```

**Generated Web Service Cargo.toml:**
```toml
[package]
name = "web-service"
version = "0.1.0"
edition = "2021"
rust-version = "1.70"

[dependencies]
# Web framework
axum = { version = "0.7", features = ["macros", "multipart"] }
tokio = { version = "1.0", features = ["full"] }
tower = { version = "0.4", features = ["util", "timeout", "load-shed", "limit"] }
tower-http = { version = "0.5", features = ["fs", "trace", "cors", "compression-gzip"] }

# Database
sqlx = { version = "0.7", features = ["runtime-tokio-rustls", "postgres", "chrono", "uuid", "migrate"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Authentication
jsonwebtoken = "9.0"
bcrypt = "0.15"

# Error handling
anyhow = "1.0"
thiserror = "1.0"

# Utilities
uuid = { version = "1.0", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }

# Configuration
config = "0.14"
dotenvy = "0.15"

[dev-dependencies]
axum-test = "14.0"
sqlx-test = "0.1"
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "api_benchmark"
harness = false

[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 1
panic = "abort"
```

## 🎯 Smart Dependency Management

### Framework-Specific Dependencies

Claude-flow agents automatically select optimal dependencies based on project requirements:

```bash
# Agents analyze requirements and add appropriate dependencies
Task("Rust Architect", "Set up high-performance web service with monitoring", "rust-architect")

# Automatically adds:
# - axum (for web framework)
# - sqlx (for async database)
# - tower (for middleware)
# - tracing (for observability)
# - serde (for serialization)
```

### Performance-Optimized Dependencies

```toml
# Agent-selected performance dependencies
[dependencies]
# High-performance JSON
simd-json = "0.13"  # SIMD-accelerated JSON parsing

# Memory-efficient collections
hashbrown = "0.14"  # Faster HashMap implementation
smallvec = "1.0"    # Stack-allocated vectors

# Async runtime optimization
tokio = { version = "1.0", features = ["rt-multi-thread", "macros"] }
futures = "0.3"

# Profiling and metrics
metrics = "0.22"
metrics-exporter-prometheus = "0.13"

[target.'cfg(not(target_env = "msvc"))'.dependencies]
# Use jemalloc on non-Windows platforms for better memory allocation
jemallocator = "0.5"
```

## 🔍 Quality Validation Integration

### Real Cargo Clippy Integration

The existing `RustQualityValidator` provides comprehensive linting:

```bash
# Run comprehensive quality validation
npx claude-flow validate rust ./my-project

# This executes real cargo commands:
# cargo clippy --all-targets --all-features -- --deny warnings
# cargo fmt --check
# cargo audit
# cargo test --all
```

**Quality Validation Results:**
```json
{
  "validationId": "rust-qual-abc123",
  "framework": "rust-quality-validation",
  "realExecution": true,
  "clippy": {
    "passed": true,
    "warnings": 0,
    "errors": 0,
    "categories": {
      "correctness": [],
      "performance": [],
      "style": []
    }
  },
  "formatting": {
    "passed": true,
    "filesChecked": 15,
    "unformattedFiles": []
  },
  "security": {
    "passed": true,
    "vulnerabilities": [],
    "advisories": []
  },
  "codeQuality": {
    "overallScore": 9.2,
    "breakdown": {
      "clippy": 10,
      "formatting": 10,
      "security": 10,
      "complexity": 8.5,
      "documentation": 8.8
    }
  }
}
```

### Custom Clippy Configuration

```bash
# Create project-specific clippy configuration
Task("Quality Engineer", "Set up strict clippy rules for production code", "quality-engineer")
```

**Generated clippy.toml:**
```toml
# Clippy configuration for high-quality Rust code
avoid-breaking-exported-api = false
cognitive-complexity-threshold = 15
doc-valid-idents = ["UUID", "API", "HTTP", "JSON", "SQL", "CLI"]
max-fn-params-bools = 2
max-include-file-size = 1000
max-struct-bools = 3
max-suggested-slice-pattern-length = 3
max-trait-bounds = 5
single-char-binding-names-threshold = 5
too-many-arguments-threshold = 7
too-many-lines-threshold = 100
type-complexity-threshold = 250
verbose-bit-mask-threshold = 1

# Allowed lints for performance-critical code
allow = [
    "clippy::missing_docs_in_private_items",
    "clippy::implicit_return",
    "clippy::shadow_reuse",
    "clippy::shadow_same",
    "clippy::shadow_unrelated"
]

# Denied lints for safety and correctness
deny = [
    "clippy::await_holding_lock",
    "clippy::branches_sharing_code",
    "clippy::cargo_common_metadata",
    "clippy::clone_on_ref_ptr",
    "clippy::create_dir",
    "clippy::dbg_macro",
    "clippy::debug_assert_with_mut_call",
    "clippy::empty_line_after_outer_attr",
    "clippy::fallible_impl_from",
    "clippy::filetype_is_file",
    "clippy::float_cmp_const",
    "clippy::get_unwrap",
    "clippy::implicit_clone",
    "clippy::imprecise_flops",
    "clippy::inefficient_to_string",
    "clippy::let_unit_value",
    "clippy::lossy_float_literal",
    "clippy::macro_use_imports",
    "clippy::manual_ok_or",
    "clippy::map_err_ignore",
    "clippy::map_flatten",
    "clippy::map_unwrap_or",
    "clippy::match_on_vec_items",
    "clippy::match_same_arms",
    "clippy::match_wild_err_arm",
    "clippy::mem_forget",
    "clippy::missing_enforced_import_renames",
    "clippy::mut_mut",
    "clippy::mutex_integer",
    "clippy::needless_continue",
    "clippy::option_option",
    "clippy::path_buf_push_overwrite",
    "clippy::ptr_as_ptr",
    "clippy::rc_mutex",
    "clippy::ref_option_ref",
    "clippy::rest_pat_in_fully_bound_structs",
    "clippy::same_functions_in_if_condition",
    "clippy::string_add_assign",
    "clippy::string_lit_as_bytes",
    "clippy::string_to_string",
    "clippy::todo",
    "clippy::trait_duplication_in_bounds",
    "clippy::unimplemented",
    "clippy::unnested_or_patterns",
    "clippy::unused_self",
    "clippy::useless_transmute",
    "clippy::verbose_file_reads",
    "clippy::zero_sized_map_values"
]
```

## 🏗️ Build Optimization

### Multi-Target Builds

```bash
# Agent-configured cross-compilation
Task("Build Engineer", "Set up cross-platform builds for Linux, Windows, and macOS", "build-engineer")
```

**Generated .cargo/config.toml:**
```toml
# Cross-compilation configuration
[build]
target-dir = "target"

[target.x86_64-unknown-linux-gnu]
linker = "x86_64-linux-gnu-gcc"

[target.x86_64-pc-windows-gnu]
linker = "x86_64-w64-mingw32-gcc"

[target.x86_64-apple-darwin]
linker = "x86_64-apple-darwin-clang"

# Optimization for different targets
[target.x86_64-unknown-linux-musl]
rustflags = ["-C", "target-feature=+crt-static"]

# Profile-specific settings
[profile.release]
opt-level = 3
debug = false
debug-assertions = false
overflow-checks = false
lto = true
panic = "abort"
incremental = false
codegen-units = 1
rpath = false

[profile.release-with-debug]
inherits = "release"
debug = true

[profile.bench]
opt-level = 3
debug = true
debug-assertions = false
overflow-checks = false
lto = true
incremental = false
codegen-units = 1
```

### Workspace Configuration

For multi-crate projects, agents create optimized workspace setups:

```toml
# Generated workspace Cargo.toml
[workspace]
members = [
    "core",
    "api",
    "cli",
    "models",
    "migrations"
]
default-members = ["api", "cli"]
resolver = "2"

[workspace.dependencies]
# Shared dependencies across all crates
tokio = { version = "1.0", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
anyhow = "1.0"
thiserror = "1.0"
tracing = "0.1"

# Internal crate dependencies
core = { path = "core" }
models = { path = "models" }

[workspace.metadata.release]
pre-release-replacements = [
    { file = "CHANGELOG.md", search = "## \\[Unreleased\\]", replace = "## [Unreleased]\n\n## [{{version}}] - {{date}}" },
]
```

## 🚀 Performance Monitoring

### Build Performance Tracking

```bash
# Monitor build performance with claude-flow
npx claude-flow cargo build --release --timings

# Generates detailed timing analysis:
# - Dependency compilation time
# - Crate compilation order
# - Parallel compilation utilization
# - Link time optimization impact
```

### Binary Size Analysis

```bash
# Analyze binary size and optimize
Task("Performance Engineer", "Optimize binary size and startup time", "performance-optimizer")

# Generates size analysis tools:
```

**Generated build analysis script:**
```bash
#!/bin/bash
# build-analysis.sh - Generated by claude-flow

echo "🔍 Analyzing Rust build performance..."

# Clean build with timing
cargo clean
cargo build --release --timings

# Binary size analysis
echo "📦 Binary size analysis:"
if command -v cargo-bloat &> /dev/null; then
    cargo bloat --release --crates
    cargo bloat --release --filter-regex '^std::'
else
    echo "Installing cargo-bloat for size analysis..."
    cargo install cargo-bloat
    cargo bloat --release --crates
fi

# Dependencies analysis
if command -v cargo-tree &> /dev/null; then
    echo "🌳 Dependency tree analysis:"
    cargo tree --duplicate
    cargo tree --format "{p} {f}"
fi

# Unused dependencies
if command -v cargo-udeps &> /dev/null; then
    echo "🧹 Unused dependencies check:"
    cargo +nightly udeps
else
    echo "Installing cargo-udeps..."
    cargo install cargo-udeps --locked
    cargo +nightly udeps
fi

echo "✅ Build analysis complete!"
```

## 🧪 Testing Integration

### Comprehensive Test Configuration

```toml
# Agent-generated test configuration
[package]
name = "my-rust-project"

# Test-specific features
[features]
default = []
integration-tests = ["tokio-test", "tempfile"]
benchmark-tests = ["criterion"]

[dev-dependencies]
# Unit testing
tokio-test = { version = "0.4", optional = true }
tempfile = { version = "3.0", optional = true }

# Property-based testing
proptest = "1.0"
quickcheck = "1.0"

# Benchmarking
criterion = { version = "0.5", features = ["html_reports"], optional = true }

# Mock testing
mockall = "0.12"
wiremock = "0.5"

[[test]]
name = "integration"
path = "tests/integration/mod.rs"
required-features = ["integration-tests"]

[[bench]]
name = "performance"
harness = false
required-features = ["benchmark-tests"]
```

### Test Execution with Quality Gates

```bash
# Comprehensive testing with claude-flow
npx claude-flow test rust --comprehensive

# Executes:
# 1. cargo test --all-features
# 2. cargo test --doc
# 3. cargo bench (if benchmarks exist)
# 4. Integration tests with coverage
# 5. Property-based test runs

# Quality gates ensure:
# - 90%+ test coverage
# - All tests pass
# - No performance regressions
# - Documentation tests pass
```

## 📊 Metrics and Monitoring

### Build Metrics Collection

```rust
// Generated metrics collection code
use std::time::Instant;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct BuildMetrics {
    pub compilation_time: f64,
    pub binary_size: u64,
    pub dependencies_count: usize,
    pub test_count: usize,
    pub benchmark_results: Vec<BenchmarkResult>,
}

impl BuildMetrics {
    pub fn collect() -> Self {
        let start = Instant::now();

        // Collect compilation metrics
        let compilation_time = start.elapsed().as_secs_f64();

        // Analyze binary
        let binary_size = std::fs::metadata("target/release/my-project")
            .map(|m| m.len())
            .unwrap_or(0);

        // Count dependencies
        let dependencies_count = Self::count_dependencies();

        Self {
            compilation_time,
            binary_size,
            dependencies_count,
            test_count: 0,
            benchmark_results: vec![],
        }
    }

    fn count_dependencies() -> usize {
        // Parse Cargo.lock to count dependencies
        std::fs::read_to_string("Cargo.lock")
            .map(|content| content.lines().filter(|line| line.starts_with("name = ")).count())
            .unwrap_or(0)
    }
}
```

## 🔧 Development Tools Integration

### IDE Configuration

Agents generate optimal development environment configuration:

**Generated .vscode/settings.json:**
```json
{
    "rust-analyzer.check.command": "clippy",
    "rust-analyzer.check.allTargets": true,
    "rust-analyzer.check.features": "all",
    "rust-analyzer.cargo.features": "all",
    "rust-analyzer.completion.autoimport.enable": true,
    "rust-analyzer.imports.granularity.group": "module",
    "rust-analyzer.imports.prefix": "crate",
    "rust-analyzer.procMacro.enable": true,
    "rust-analyzer.diagnostics.enable": true,
    "rust-analyzer.diagnostics.experimental.enable": true,
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "rust-lang.rust-analyzer",
    "[rust]": {
        "editor.tabSize": 4,
        "editor.insertSpaces": true,
        "editor.formatOnSave": true
    }
}
```

**Generated .vscode/tasks.json:**
```json
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "cargo build",
            "type": "cargo",
            "command": "build",
            "group": "build",
            "presentation": {
                "reveal": "always",
                "panel": "new"
            },
            "problemMatcher": "$rustc"
        },
        {
            "label": "cargo test",
            "type": "cargo",
            "command": "test",
            "group": "test",
            "presentation": {
                "reveal": "always",
                "panel": "new"
            },
            "problemMatcher": "$rustc"
        },
        {
            "label": "cargo clippy",
            "type": "shell",
            "command": "cargo clippy --all-targets --all-features",
            "group": "test",
            "presentation": {
                "reveal": "always",
                "panel": "new"
            },
            "problemMatcher": "$rustc"
        }
    ]
}
```

## 🚀 CI/CD Integration

### GitHub Actions Configuration

```yaml
# Generated .github/workflows/rust.yml
name: Rust CI/CD

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  test:
    name: Test Suite
    runs-on: ubuntu-latest
    strategy:
      matrix:
        rust: [stable, beta, nightly]

    steps:
    - uses: actions/checkout@v4

    - name: Install Rust
      uses: dtolnay/rust-toolchain@master
      with:
        toolchain: ${{ matrix.rust }}
        components: rustfmt, clippy

    - name: Cache cargo registry
      uses: actions/cache@v3
      with:
        path: ~/.cargo/registry
        key: ${{ runner.os }}-cargo-registry-${{ hashFiles('**/Cargo.lock') }}

    - name: Cache cargo index
      uses: actions/cache@v3
      with:
        path: ~/.cargo/git
        key: ${{ runner.os }}-cargo-index-${{ hashFiles('**/Cargo.lock') }}

    - name: Cache cargo build
      uses: actions/cache@v3
      with:
        path: target
        key: ${{ runner.os }}-cargo-build-target-${{ hashFiles('**/Cargo.lock') }}

    - name: Run cargo fmt
      run: cargo fmt --all -- --check

    - name: Run cargo clippy
      run: cargo clippy --all-targets --all-features -- -D warnings

    - name: Run tests
      run: cargo test --all-features --verbose

    - name: Run cargo audit
      run: |
        cargo install cargo-audit
        cargo audit

    - name: Generate coverage report
      run: |
        cargo install cargo-tarpaulin
        cargo tarpaulin --verbose --all-features --workspace --timeout 120 --out Xml

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./cobertura.xml
        fail_ci_if_error: true

  build:
    name: Build Release
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]

    steps:
    - uses: actions/checkout@v4

    - name: Install Rust
      uses: dtolnay/rust-toolchain@stable

    - name: Build release
      run: cargo build --release --all-features

    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: binary-${{ matrix.os }}
        path: target/release/
```

This comprehensive Cargo integration demonstrates how claude-flow leverages the existing Rust validation system to provide authentic, production-ready Rust development workflows without any simulation or mocking.

## 🔗 Next Steps

- [Environment Configuration](./environment.md) - Set up Rust toolchain
- [Project Templates](./templates.md) - Pre-configured project structures
- [Web Development Guide](../web-development/README.md) - Framework-specific guides
- [Testing Documentation](../testing/README.md) - Comprehensive testing strategies