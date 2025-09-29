# Rust Development with Claude-Flow

Welcome to the comprehensive Rust development guide for claude-flow. This directory contains everything you need to build, test, and deploy Rust applications using the claude-flow-novice orchestration system with real Rust toolchain integration.

## 🦀 Rust Agent Capabilities

### Systems Programming Expertise
- **Modern Rust 2021 Edition** features and idioms
- **Memory safety** without garbage collection
- **Concurrency** with fearless parallelism
- **Web frameworks**: Actix-web, Warp, Rocket, Axum
- **Async runtime**: Tokio, async-std, futures
- **CLI development**: clap, structopt, console

### Performance-Critical Applications
```rust
// Domain-specific Rust agent spawning
Task("Systems Engineer", "Build high-performance TCP server with Tokio", "systems-dev")
Task("WebAssembly Developer", "Create Rust WASM module for browser", "wasm-dev")
Task("CLI Architect", "Design command-line tool with clap and async I/O", "cli-dev")
Task("Performance Engineer", "Optimize critical path with zero-cost abstractions", "performance-optimizer")
```

## 🎯 Quick Start: Rust Projects

### 1. Async Web Service
```bash
# Initialize Rust web service project
npx claude-flow@alpha init --template rust-web-service

# Spawn Rust systems expert
npx claude-flow@alpha agents spawn systems-dev \
  "create Actix-web service with async database operations and JWT authentication"

# Generated architecture:
# - Actix-web with async handlers
# - SQLx for async database operations
# - Serde for JSON serialization
# - JWT authentication middleware
# - Comprehensive error handling
# - Docker multi-stage build
```

### 2. High-Performance CLI Tool
```bash
# Initialize CLI project
npx claude-flow@alpha init --template rust-cli

# Spawn CLI specialist
npx claude-flow@alpha agents spawn cli-dev \
  "create command-line tool with parallel file processing and progress bars"

# Features included:
# - Structured CLI with clap
# - Parallel processing with rayon
# - Progress indicators with indicatif
# - Colored output with colored
# - Error handling with anyhow
# - Configuration with config crate
```

### 3. Systems Programming Project
```bash
# Complete SPARC workflow for systems tool
npx claude-flow@alpha sparc tdd \
  "network proxy server with load balancing and metrics"

# Multi-agent coordination:
# - Systems architect: Design async architecture
# - Performance engineer: Optimize hot paths
# - Security specialist: Implement secure protocols
# - Testing engineer: Benchmark and stress testing
```

## 🛠️ Rust Agent Coordination

### Performance-Focused Development
```rust
// Coordinated high-performance development
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  coordinator: "performance-architect",
  maxAgents: 4,
  strategy: "performance-first"
})

Task("Systems Architect", "Design zero-allocation async architecture", "systems-architect")
Task("Core Developer", "Implement with zero-cost abstractions", "systems-dev")
Task("Performance Engineer", "Profile and optimize critical paths", "performance-optimizer")
Task("Security Auditor", "Memory safety and security analysis", "security-manager")

// Performance constraints and targets
mcp__claude-flow__memory_store({
  key: "project/performance-targets",
  data: {
    latency: "< 1ms p99",
    throughput: "> 100k req/sec",
    memory: "Zero allocations in hot path",
    safety: "No unsafe code without justification"
  },
  scope: "shared"
})
```

### Concurrent System Design
```rust
// Multi-threaded system coordination
use tokio::sync::{mpsc, RwLock};
use std::sync::Arc;
use std::collections::HashMap;

// Agent-designed concurrent architecture
#[derive(Clone)]
pub struct ServiceCoordinator {
    workers: Arc<RwLock<HashMap<String, WorkerHandle>>>,
    command_tx: mpsc::UnboundedSender<Command>,
}

impl ServiceCoordinator {
    pub async fn new() -> Self {
        let (command_tx, mut command_rx) = mpsc::unbounded_channel();
        let workers = Arc::new(RwLock::new(HashMap::new()));

        // Spawn coordinator task
        let workers_clone = Arc::clone(&workers);
        tokio::spawn(async move {
            while let Some(command) = command_rx.recv().await {
                Self::handle_command(command, &workers_clone).await;
            }
        });

        Self { workers, command_tx }
    }

    async fn handle_command(
        command: Command,
        workers: &Arc<RwLock<HashMap<String, WorkerHandle>>>
    ) {
        match command {
            Command::SpawnWorker { id, config } => {
                let handle = WorkerHandle::spawn(config).await;
                workers.write().await.insert(id, handle);
            }
            Command::StopWorker { id } => {
                if let Some(handle) = workers.write().await.remove(&id) {
                    handle.shutdown().await;
                }
            }
        }
    }
}
```

## 📦 Rust Project Templates

### Available Templates
```bash
# List Rust-specific templates
npx claude-flow@alpha templates list --language rust

# Performance templates:
# - rust-web-service: Actix-web async service
# - rust-cli: Command-line application
# - rust-systems: Low-level systems programming
# - rust-wasm: WebAssembly module
# - rust-embedded: Embedded systems development
# - rust-game-engine: Game development with Bevy
```

### Template Customization
```bash
# High-performance web service template
npx claude-flow@alpha init --template rust-web-service \
  --features "tokio,actix-web,sqlx,serde,jwt" \
  --performance-profile "high-throughput" \
  --agent-preferences "zero-cost-abstractions,memory-safety"
```

## 🎭 Rust-Specific Agents

### Systems Programming Agents
- **systems-dev**: Low-level systems, async programming
- **performance-engineer**: Zero-cost abstractions, optimization
- **memory-safety-expert**: Ownership, lifetimes, borrowing
- **concurrency-specialist**: Fearless parallelism, async/await

### Application Development Agents
- **web-dev**: Actix-web, Warp, Rocket expertise
- **cli-dev**: Command-line tools, argument parsing
- **wasm-dev**: WebAssembly, browser integration
- **embedded-dev**: No-std, embedded systems

### Specialized Agents
- **unsafe-code-auditor**: Unsafe code review and validation
- **cargo-expert**: Build optimization, dependency management
- **benchmark-engineer**: Performance testing, profiling

## 🔧 Rust Development Workflow

### Performance-First Development
```bash
# 1. High-performance project initialization
npx claude-flow@alpha init --template rust-systems --edition 2021

# 2. SPARC with performance focus
npx claude-flow@alpha sparc tdd "high-throughput message queue"

# 3. Rust quality automation
npx claude-flow@alpha hooks enable --language rust
# Enables: rustfmt, clippy, cargo test, cargo bench

# 4. Performance quality gates
npx claude-flow@alpha hooks quality-gate \
  --requirements "clippy-clean,tests-pass,benchmarks-stable,no-unsafe-without-docs"
```

### Cargo Configuration
```toml
# Cargo.toml optimized by agents
[package]
name = "high-performance-service"
version = "0.1.0"
edition = "2021"
rust-version = "1.70"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
actix-web = "4.0"
serde = { version = "1.0", features = ["derive"] }
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio-rustls"] }
anyhow = "1.0"
thiserror = "1.0"

[dev-dependencies]
criterion = { version = "0.5", features = ["html_reports"] }
tokio-test = "0.4"

[[bench]]
name = "performance_bench"
harness = false

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = "abort"

[profile.bench]
opt-level = 3
debug = true
```

## 🚀 Advanced Rust Patterns

### Zero-Cost Abstractions
```rust
// High-performance abstractions without runtime cost
use std::marker::PhantomData;

// Type-state pattern for compile-time guarantees
pub struct Connection<State> {
    socket: TcpStream,
    _state: PhantomData<State>,
}

pub struct Disconnected;
pub struct Connected;
pub struct Authenticated;

impl Connection<Disconnected> {
    pub fn new(socket: TcpStream) -> Self {
        Self {
            socket,
            _state: PhantomData,
        }
    }

    pub async fn connect(self) -> Result<Connection<Connected>, Error> {
        // Connection logic
        Ok(Connection {
            socket: self.socket,
            _state: PhantomData,
        })
    }
}

impl Connection<Connected> {
    pub async fn authenticate(
        self,
        credentials: &Credentials
    ) -> Result<Connection<Authenticated>, Error> {
        // Authentication logic
        Ok(Connection {
            socket: self.socket,
            _state: PhantomData,
        })
    }
}

impl Connection<Authenticated> {
    pub async fn send_data(&mut self, data: &[u8]) -> Result<(), Error> {
        // Only authenticated connections can send data
        self.socket.write_all(data).await?;
        Ok(())
    }
}

// Generic programming with trait bounds
trait DataProcessor {
    type Input;
    type Output;
    type Error;

    async fn process(&self, input: Self::Input) -> Result<Self::Output, Self::Error>;
}

// Zero-cost async processing pipeline
async fn process_pipeline<P1, P2>(
    data: P1::Input,
    processor1: &P1,
    processor2: &P2,
) -> Result<P2::Output, Box<dyn std::error::Error>>
where
    P1: DataProcessor,
    P2: DataProcessor<Input = P1::Output>,
    P1::Error: std::error::Error + 'static,
    P2::Error: std::error::Error + 'static,
{
    let intermediate = processor1.process(data).await?;
    let result = processor2.process(intermediate).await?;
    Ok(result)
}
```

### Fearless Concurrency
```rust
// Agent-designed concurrent patterns
use tokio::sync::{mpsc, oneshot, Semaphore};
use std::sync::Arc;
use futures::stream::{self, StreamExt};

// Work-stealing task scheduler
pub struct TaskScheduler {
    workers: Vec<WorkerHandle>,
    task_queue: mpsc::UnboundedSender<Task>,
    semaphore: Arc<Semaphore>,
}

impl TaskScheduler {
    pub fn new(num_workers: usize, max_concurrent: usize) -> Self {
        let (task_tx, task_rx) = mpsc::unbounded_channel();
        let task_rx = Arc::new(tokio::sync::Mutex::new(task_rx));
        let semaphore = Arc::new(Semaphore::new(max_concurrent));

        let workers = (0..num_workers)
            .map(|id| {
                let task_rx = Arc::clone(&task_rx);
                let semaphore = Arc::clone(&semaphore);
                WorkerHandle::spawn(id, task_rx, semaphore)
            })
            .collect();

        Self {
            workers,
            task_queue: task_tx,
            semaphore,
        }
    }

    pub async fn submit_task(&self, task: Task) -> Result<(), TaskError> {
        self.task_queue.send(task).map_err(|_| TaskError::QueueFull)
    }

    pub async fn shutdown(self) {
        drop(self.task_queue); // Close the queue

        // Wait for all workers to finish
        let handles: Vec<_> = self.workers.into_iter().map(|w| w.handle).collect();
        futures::future::join_all(handles).await;
    }
}

// High-performance async stream processing
pub async fn process_stream<T, F, Fut>(
    stream: impl futures::Stream<Item = T>,
    processor: F,
    concurrency: usize,
) -> Vec<F::Output>
where
    F: Fn(T) -> Fut + Clone + Send + 'static,
    Fut: futures::Future + Send,
    F::Output: Send,
    T: Send,
{
    stream
        .map(move |item| {
            let processor = processor.clone();
            tokio::spawn(async move { processor(item).await })
        })
        .buffer_unordered(concurrency)
        .map(|result| result.unwrap()) // Handle join errors appropriately
        .collect()
        .await
}
```

### Memory-Safe Systems Programming
```rust
// Safe systems programming patterns
use std::ptr::NonNull;
use std::marker::PhantomData;

// Safe wrapper for raw pointers
pub struct SafePtr<T> {
    ptr: NonNull<T>,
    _marker: PhantomData<T>,
}

impl<T> SafePtr<T> {
    pub fn new(value: T) -> Self {
        let boxed = Box::new(value);
        let ptr = NonNull::new(Box::into_raw(boxed)).unwrap();

        Self {
            ptr,
            _marker: PhantomData,
        }
    }

    pub fn as_ref(&self) -> &T {
        // Safe because we maintain ownership invariants
        unsafe { self.ptr.as_ref() }
    }

    pub fn as_mut(&mut self) -> &mut T {
        // Safe because we have mutable access
        unsafe { self.ptr.as_mut() }
    }
}

impl<T> Drop for SafePtr<T> {
    fn drop(&mut self) {
        // Properly deallocate memory
        unsafe {
            let _ = Box::from_raw(self.ptr.as_ptr());
        }
    }
}

// Memory pool for zero-allocation performance
pub struct MemoryPool<T> {
    pool: Vec<T>,
    available: Vec<usize>,
}

impl<T: Default> MemoryPool<T> {
    pub fn new(capacity: usize) -> Self {
        let pool = (0..capacity).map(|_| T::default()).collect();
        let available = (0..capacity).collect();

        Self { pool, available }
    }

    pub fn acquire(&mut self) -> Option<PooledItem<T>> {
        self.available.pop().map(|index| PooledItem {
            item: &mut self.pool[index],
            index,
            pool: self as *mut Self,
        })
    }
}

pub struct PooledItem<'a, T> {
    item: &'a mut T,
    index: usize,
    pool: *mut MemoryPool<T>,
}

impl<T> Drop for PooledItem<'_, T> {
    fn drop(&mut self) {
        // Return item to pool
        unsafe {
            (*self.pool).available.push(self.index);
        }
    }
}
```

## 🧪 Rust Testing and Benchmarking

### Comprehensive Testing Strategy
```rust
// Unit testing with property-based testing
use proptest::prelude::*;

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_test;

    #[test]
    fn test_memory_safety() {
        let mut pool = MemoryPool::<String>::new(10);

        let item1 = pool.acquire().unwrap();
        let item2 = pool.acquire().unwrap();

        // Items should be different
        assert_ne!(item1.item.as_ptr(), item2.item.as_ptr());

        drop(item1);
        drop(item2);

        // Should be able to acquire again
        let item3 = pool.acquire().unwrap();
        assert!(item3.item.is_empty());
    }

    #[tokio::test]
    async fn test_concurrent_processing() {
        let scheduler = TaskScheduler::new(4, 100);

        let tasks: Vec<_> = (0..1000)
            .map(|i| Task::new(format!("task-{}", i)))
            .collect();

        for task in tasks {
            scheduler.submit_task(task).await.unwrap();
        }

        scheduler.shutdown().await;
    }

    // Property-based testing
    proptest! {
        #[test]
        fn test_safe_ptr_invariants(value: i32) {
            let safe_ptr = SafePtr::new(value);
            prop_assert_eq!(*safe_ptr.as_ref(), value);
        }

        #[test]
        fn test_connection_state_machine(
            data in prop::collection::vec(any::<u8>(), 0..1024)
        ) {
            tokio_test::block_on(async {
                let socket = TcpStream::connect("localhost:8080").await?;
                let conn = Connection::new(socket)
                    .connect().await?
                    .authenticate(&credentials).await?;

                // Should be able to send any data
                conn.send_data(&data).await?;
                Ok::<(), Box<dyn std::error::Error>>(())
            })?;
        }
    }
}

// Benchmark testing with criterion
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark_processing(c: &mut Criterion) {
    c.bench_function("parallel_processing", |b| {
        b.iter(|| {
            let data: Vec<i32> = (0..1000).collect();
            let result: Vec<i32> = data
                .par_iter()
                .map(|&x| black_box(x * x))
                .collect();
            black_box(result)
        })
    });

    c.bench_function("async_processing", |b| {
        let rt = tokio::runtime::Runtime::new().unwrap();
        b.to_async(&rt).iter(|| async {
            let data: Vec<i32> = (0..1000).collect();
            let futures = data.into_iter().map(|x| async move {
                tokio::task::yield_now().await;
                black_box(x * x)
            });
            let result: Vec<i32> = futures::future::join_all(futures).await;
            black_box(result)
        })
    });
}

criterion_group!(benches, benchmark_processing);
criterion_main!(benches);
```

## 📊 Rust Performance Optimization

### Profiling and Optimization
```rust
// Performance monitoring and optimization
use std::time::{Duration, Instant};
use std::collections::HashMap;

pub struct PerformanceProfiler {
    measurements: HashMap<String, Vec<Duration>>,
}

impl PerformanceProfiler {
    pub fn new() -> Self {
        Self {
            measurements: HashMap::new(),
        }
    }

    pub fn measure<F, R>(&mut self, name: &str, f: F) -> R
    where
        F: FnOnce() -> R,
    {
        let start = Instant::now();
        let result = f();
        let duration = start.elapsed();

        self.measurements
            .entry(name.to_string())
            .or_insert_with(Vec::new)
            .push(duration);

        result
    }

    pub fn report(&self) {
        for (name, durations) in &self.measurements {
            let avg = durations.iter().sum::<Duration>() / durations.len() as u32;
            let min = durations.iter().min().unwrap();
            let max = durations.iter().max().unwrap();

            println!(
                "{}: avg={:?}, min={:?}, max={:?}, samples={}",
                name, avg, min, max, durations.len()
            );
        }
    }
}

// Memory usage tracking
#[cfg(feature = "profiling")]
pub fn track_memory_usage<F, R>(name: &str, f: F) -> R
where
    F: FnOnce() -> R,
{
    use jemalloc_ctl::{epoch, stats};

    epoch::advance().unwrap();
    let allocated_before = stats::allocated::read().unwrap();

    let result = f();

    epoch::advance().unwrap();
    let allocated_after = stats::allocated::read().unwrap();

    println!(
        "{}: memory delta = {} bytes",
        name,
        allocated_after as i64 - allocated_before as i64
    );

    result
}

// CPU-intensive optimization with SIMD
use std::arch::x86_64::*;

#[target_feature(enable = "avx2")]
unsafe fn vectorized_sum(data: &[f32]) -> f32 {
    let mut sum = _mm256_setzero_ps();
    let chunks = data.chunks_exact(8);
    let remainder = chunks.remainder();

    for chunk in chunks {
        let values = _mm256_loadu_ps(chunk.as_ptr());
        sum = _mm256_add_ps(sum, values);
    }

    // Extract and sum the 8 values
    let mut result = [0.0f32; 8];
    _mm256_storeu_ps(result.as_mut_ptr(), sum);
    let vector_sum: f32 = result.iter().sum();

    // Add remainder
    vector_sum + remainder.iter().sum::<f32>()
}
```

## 🔒 Rust Security and Safety

### Memory Safety Patterns
```rust
// Compile-time memory safety guarantees
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

// Reference counting for shared ownership
pub struct SharedResource {
    data: Vec<u8>,
    ref_count: AtomicUsize,
}

impl SharedResource {
    pub fn new(data: Vec<u8>) -> Arc<Self> {
        Arc::new(Self {
            data,
            ref_count: AtomicUsize::new(1),
        })
    }

    pub fn clone_ref(self: &Arc<Self>) -> Arc<Self> {
        self.ref_count.fetch_add(1, Ordering::Relaxed);
        Arc::clone(self)
    }
}

impl Drop for SharedResource {
    fn drop(&mut self) {
        let prev_count = self.ref_count.fetch_sub(1, Ordering::Relaxed);
        if prev_count == 1 {
            println!("Last reference dropped, cleaning up resource");
            // Cleanup logic here
        }
    }
}

// Secure input validation
use serde::{Deserialize, Serialize};
use validator::{Validate, ValidationError};

#[derive(Debug, Deserialize, Validate)]
pub struct UserInput {
    #[validate(length(min = 1, max = 255))]
    #[validate(regex = "^[a-zA-Z0-9_-]+$")]
    username: String,

    #[validate(email)]
    email: String,

    #[validate(range(min = 18, max = 120))]
    age: u8,

    #[validate(custom = "validate_password")]
    password: String,
}

fn validate_password(password: &str) -> Result<(), ValidationError> {
    if password.len() < 8 {
        return Err(ValidationError::new("password_too_short"));
    }

    if !password.chars().any(|c| c.is_uppercase()) {
        return Err(ValidationError::new("password_no_uppercase"));
    }

    if !password.chars().any(|c| c.is_lowercase()) {
        return Err(ValidationError::new("password_no_lowercase"));
    }

    if !password.chars().any(|c| c.is_numeric()) {
        return Err(ValidationError::new("password_no_digit"));
    }

    Ok(())
}

// Crypto-secure patterns
use ring::{digest, hmac, rand};
use ring::rand::SecureRandom;

pub struct SecureToken {
    token: Vec<u8>,
    signature: Vec<u8>,
}

impl SecureToken {
    pub fn generate(secret_key: &[u8]) -> Result<Self, Box<dyn std::error::Error>> {
        let rng = rand::SystemRandom::new();
        let mut token = vec![0u8; 32];
        rng.fill(&mut token)?;

        let key = hmac::Key::new(hmac::HMAC_SHA256, secret_key);
        let signature = hmac::sign(&key, &token);

        Ok(Self {
            token,
            signature: signature.as_ref().to_vec(),
        })
    }

    pub fn verify(&self, secret_key: &[u8]) -> bool {
        let key = hmac::Key::new(hmac::HMAC_SHA256, secret_key);
        hmac::verify(&key, &self.token, &self.signature).is_ok()
    }
}
```

## 🎯 Rust Best Practices

### Error Handling Patterns
```rust
// Comprehensive error handling with thiserror
use thiserror::Error;
use serde::{Deserialize, Serialize};

#[derive(Error, Debug, Serialize, Deserialize)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Validation error: {field} - {message}")]
    Validation { field: String, message: String },

    #[error("Authentication failed")]
    Authentication,

    #[error("Resource not found: {resource_type} with id {id}")]
    NotFound { resource_type: String, id: String },

    #[error("Rate limit exceeded: {requests} requests in {window} seconds")]
    RateLimit { requests: u32, window: u32 },

    #[error("Internal server error")]
    Internal(#[from] anyhow::Error),
}

// Result type alias for convenience
pub type AppResult<T> = Result<T, AppError>;

// Error handling in async contexts
pub async fn handle_request(
    request: UserRequest
) -> AppResult<UserResponse> {
    let user = validate_user(request)
        .map_err(|e| AppError::Validation {
            field: "user".to_string(),
            message: e.to_string(),
        })?;

    let result = database_operation(&user).await?;

    Ok(UserResponse::from(result))
}
```

### Project Structure
```
rust-project/
├── Cargo.toml
├── Cargo.lock
├── src/
│   ├── main.rs
│   ├── lib.rs
│   ├── config/
│   │   ├── mod.rs
│   │   └── settings.rs
│   ├── handlers/
│   │   ├── mod.rs
│   │   ├── users.rs
│   │   └── auth.rs
│   ├── models/
│   │   ├── mod.rs
│   │   ├── user.rs
│   │   └── auth.rs
│   ├── services/
│   │   ├── mod.rs
│   │   ├── user_service.rs
│   │   └── auth_service.rs
│   ├── utils/
│   │   ├── mod.rs
│   │   ├── crypto.rs
│   │   └── validation.rs
│   └── error.rs
├── tests/
│   ├── integration/
│   │   ├── mod.rs
│   │   └── api_tests.rs
│   └── common/
│       └── mod.rs
├── benches/
│   └── performance.rs
├── examples/
│   └── basic_usage.rs
├── docs/
├── scripts/
├── Dockerfile
└── README.md
```

## 🚨 Rust Troubleshooting

### Common Rust Issues
```bash
# Debug Rust-specific problems
npx claude-flow@alpha debug --language rust --issue "borrow-checker"

# Common solutions:
# - Lifetime and borrowing issues
# - Async trait object problems
# - Performance bottlenecks
# - Unsafe code validation
```

### Compilation Optimization
```rust
// Rust compilation performance tips
Task("Build Optimizer", "Optimize Rust compilation speed and output", "performance-optimizer")

// Common optimizations:
// - Incremental compilation setup
// - Feature flag optimization
// - Link-time optimization (LTO)
// - Parallel compilation tuning
```

## 📚 Rust Learning Resources

### Rust-Specific Tutorials
- **[Beginner: CLI Tool Basics](../../tutorials/beginner/README.md)** - Learn Rust fundamentals
- **[Intermediate: Web Service](../../tutorials/intermediate/README.md)** - Async web development
- **[Advanced: Systems Programming](../../tutorials/advanced/README.md)** - High-performance systems

### Community Examples
- **[Rust Examples](../../examples/basic-projects/README.md)** - Ready-to-run Rust projects
- **[Performance Patterns](../../examples/integration-patterns/README.md)** - Optimization examples
- **[Systems Applications](../../examples/use-cases/README.md)** - Real-world systems code

---

**Ready for systems programming?**
- **Web development**: Start with [async web service](#1-async-web-service)
- **CLI tools**: Try [command-line application](#2-high-performance-cli-tool)
- **Systems programming**: Build [network proxy](#3-systems-programming-project)
- **New to Rust**: Review fundamentals and memory safety concepts