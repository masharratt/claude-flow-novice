# Rust Coding Scenarios for Agent Prompt Format Benchmarking

## Purpose
These 5 progressively complex scenarios are designed to differentiate between minimal, metadata, and code-heavy agent prompt formats. Each scenario tests specific aspects where prompt format significantly impacts solution quality.

---

## Level 1: Medium Complexity - Result Type Error Handling Chain

### Challenge
Implement a configuration parser that reads from multiple sources (environment variables, config files, defaults) with proper error handling using Rust's `Result` type. Must handle type conversions, missing values, and invalid formats.

### Required Rust Concepts
- Result<T, E> and error propagation (`?` operator)
- Custom error types with `thiserror` or manual impl
- Pattern matching on Results
- Type conversions (FromStr, TryFrom)
- Option<T> to Result<T, E> conversion
- Error context and chaining

### Expected Solution Complexity
- **LOC Estimate**: 150-250 lines
- **Files**: 2-3 (main module, error types, tests)
- **Key Types**:
  - Config struct with 8-10 fields
  - Custom error enum with 5-7 variants
  - Parser struct with source prioritization

### Key Evaluation Points

#### What Differentiates Prompt Formats:

1. **Error Handling Patterns**
   - Minimal: May use `.unwrap()` or basic `match` statements
   - Metadata: Can specify error handling requirements structurally
   - Code-heavy: Shows `?` operator patterns, error conversion examples

2. **Error Type Design**
   - Minimal: Might use `Box<dyn Error>` or String errors
   - Metadata: Can specify error variant requirements
   - Code-heavy: Demonstrates proper error enum with context

3. **Type Conversion Handling**
   - Minimal: May miss edge cases in parsing
   - Metadata: Can enumerate all required conversions
   - Code-heavy: Shows TryFrom implementations with examples

### Why This Tests Prompt Format Effectiveness

**Code-Heavy Advantage**: Can show the full pattern of error propagation:
```rust
fn parse_config() -> Result<Config, ConfigError> {
    let port = env::var("PORT")?.parse()?;
    let host = read_config_file("host")
        .or_else(|_| env::var("HOST"))
        .map_err(ConfigError::MissingHost)?;
    Ok(Config { port, host })
}
```

**Metadata Advantage**: Can structure error handling requirements:
```yaml
error_types:
  - ConfigError::MissingValue { field: String }
  - ConfigError::ParseError { field: String, cause: String }
  - ConfigError::IoError(std::io::Error)
required_conversions:
  - String -> u16 (port)
  - String -> IpAddr (host)
```

**Minimal Struggle**: May produce working but non-idiomatic code, missing proper error context and using anti-patterns.

### Success Criteria
- [ ] Proper error propagation without `.unwrap()`
- [ ] Custom error type with meaningful variants
- [ ] Correct precedence: env vars > config file > defaults
- [ ] Type-safe parsing with helpful error messages
- [ ] Tests covering error cases

---

## Level 2: High Complexity - Lifetime-Annotated Cache with Borrowing

### Challenge
Build a generic in-memory cache that stores references to data with different lifetimes. Must support borrowed keys, avoid unnecessary cloning, handle lifetime conflicts, and provide safe concurrent access patterns.

### Required Rust Concepts
- Lifetime annotations ('a, 'b, 'static)
- Lifetime bounds on generic types
- Trait bounds with lifetimes (T: 'a)
- Borrowing vs. ownership trade-offs
- Cow<'a, T> for copy-on-write
- PhantomData for variance
- Interior mutability (RefCell/Mutex)

### Expected Solution Complexity
- **LOC Estimate**: 300-450 lines
- **Files**: 3-4 (cache implementation, eviction policy, tests, benchmarks)
- **Key Types**:
  - Cache<'a, K, V> with lifetime parameters
  - Entry<'a, V> wrapper type
  - EvictionPolicy trait

### Key Evaluation Points

#### What Differentiates Prompt Formats:

1. **Lifetime Annotation Correctness**
   - Minimal: Will likely over-constrain with 'static or produce compile errors
   - Metadata: Can specify lifetime relationships but may not show correct syntax
   - Code-heavy: Demonstrates correct lifetime elision and annotation patterns

2. **Borrow Checker Satisfaction**
   - Minimal: May fight the borrow checker, leading to clones or RefCell overuse
   - Metadata: Can describe borrowing rules but not show implementation
   - Code-heavy: Shows patterns that satisfy borrow checker elegantly

3. **Zero-Copy Optimization**
   - Minimal: May clone unnecessarily to avoid lifetime complexity
   - Metadata: Can specify zero-copy requirements
   - Code-heavy: Shows Cow<'a, T> patterns and when to use them

### Why This Tests Prompt Format Effectiveness

**Code-Heavy Advantage**: Can demonstrate complex lifetime patterns:
```rust
pub struct Cache<'cache, K, V>
where
    K: Hash + Eq + ToOwned + ?Sized,
    K::Owned: Borrow<K>,
    V: 'cache,
{
    store: HashMap<K::Owned, Entry<'cache, V>>,
    _phantom: PhantomData<&'cache ()>,
}

impl<'cache, K, V> Cache<'cache, K, V>
where
    K: Hash + Eq + ToOwned + ?Sized,
    K::Owned: Borrow<K>,
{
    pub fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        self.store.get(key).map(|entry| &entry.value)
    }
}
```

**Metadata Advantage**: Can specify lifetime constraints systematically:
```yaml
cache_requirements:
  lifetime_parameters:
    - 'cache: "Lifetime of cached data"
  trait_bounds:
    - "K: Hash + Eq + ToOwned + ?Sized"
    - "K::Owned: Borrow<K>"
    - "V: 'cache"
  zero_copy_requirement: "Use Cow for keys when possible"
```

**Minimal Struggle**: Will likely produce code that either:
- Over-uses `'static` constraints (too restrictive)
- Clones excessively to avoid lifetime issues
- Has lifetime annotation errors requiring multiple iterations

### Success Criteria
- [ ] Generic over key and value types with proper bounds
- [ ] Correct lifetime annotations allowing non-'static data
- [ ] Borrowed key lookups without cloning
- [ ] No unnecessary RefCell/Mutex (unless justified)
- [ ] Compiles without lifetime errors on first try

---

## Level 3: Very High Complexity - Concurrent Job Queue with Message Passing

### Challenge
Implement a work-stealing job queue using Rust's async runtime (tokio) with mpsc channels, graceful shutdown, backpressure handling, and deadlock-free cancellation. Must support job priorities, retries with exponential backoff, and metrics collection.

### Required Rust Concepts
- Async/await and Future trait
- tokio runtime and task spawning
- mpsc (multi-producer, single-consumer) channels
- Arc<T> and Mutex<T> for shared state
- select! macro for concurrent operations
- Cancellation tokens and graceful shutdown
- Pin and Unpin for self-referential types
- Stream trait for async iteration

### Expected Solution Complexity
- **LOC Estimate**: 500-700 lines
- **Files**: 5-6 (queue, worker, scheduler, metrics, integration tests, examples)
- **Key Types**:
  - JobQueue with worker pool
  - Job<T> with priority and retry logic
  - Worker with state machine
  - Metrics collector with atomic counters

### Key Evaluation Points

#### What Differentiates Prompt Formats:

1. **Async Pattern Correctness**
   - Minimal: May mix blocking and async code incorrectly
   - Metadata: Can specify async requirements but may miss tokio specifics
   - Code-heavy: Shows correct spawn, select!, and channel patterns

2. **Deadlock Prevention**
   - Minimal: May create circular dependencies or lock ordering issues
   - Metadata: Can specify synchronization requirements
   - Code-heavy: Demonstrates lock-free patterns and proper channel usage

3. **Graceful Shutdown**
   - Minimal: May use crude shutdown (abort/panic)
   - Metadata: Can enumerate shutdown sequence steps
   - Code-heavy: Shows CancellationToken patterns and coordinated shutdown

4. **Backpressure Handling**
   - Minimal: May allow unbounded queues or blocking sends
   - Metadata: Can specify bounded queue requirements
   - Code-heavy: Shows bounded channel patterns and async backpressure

### Why This Tests Prompt Format Effectiveness

**Code-Heavy Advantage**: Can show complete async patterns:
```rust
async fn worker_loop(
    mut rx: mpsc::Receiver<Job>,
    cancellation: CancellationToken,
    metrics: Arc<Metrics>,
) -> Result<(), WorkerError> {
    loop {
        tokio::select! {
            Some(job) = rx.recv() => {
                metrics.jobs_processed.fetch_add(1, Ordering::Relaxed);

                let result = tokio::time::timeout(
                    job.timeout,
                    process_job(job)
                ).await;

                match result {
                    Ok(Ok(_)) => metrics.success_count.fetch_add(1, Ordering::Relaxed),
                    Ok(Err(e)) => handle_retry(job, e).await?,
                    Err(_) => metrics.timeout_count.fetch_add(1, Ordering::Relaxed),
                }
            }
            _ = cancellation.cancelled() => {
                info!("Worker shutting down gracefully");
                break;
            }
        }
    }
    Ok(())
}
```

**Metadata Advantage**: Can structure complex requirements:
```yaml
concurrency_requirements:
  runtime: "tokio with multi-threaded scheduler"
  worker_pool:
    size: "configurable, default 4"
    scaling: "dynamic based on queue depth"
  channels:
    - type: "mpsc::channel with bounded capacity"
      capacity: 1000
      backpressure: "async wait on send"
  shutdown:
    strategy: "graceful with timeout"
    timeout: "30 seconds"
    sequence:
      1. "Stop accepting new jobs"
      2. "Wait for in-flight jobs to complete"
      3. "Cancel remaining jobs after timeout"
  retry_policy:
    max_attempts: 3
    backoff: "exponential with jitter"
    initial_delay: "100ms"
```

**Minimal Struggle**: Will likely produce code with:
- Race conditions in shutdown logic
- Potential deadlocks from incorrect lock/channel ordering
- Missing backpressure handling
- Inadequate error handling in async contexts
- No clear cancellation strategy

### Success Criteria
- [ ] Deadlock-free operation under load
- [ ] Graceful shutdown without job loss
- [ ] Backpressure prevents memory exhaustion
- [ ] Retry logic with exponential backoff
- [ ] Metrics collection without performance degradation
- [ ] Integration tests demonstrating concurrent correctness

---

## Level 4: Expert Complexity - Lock-Free Concurrent Data Structure (Treiber Stack)

### Challenge
Implement a lock-free stack (Treiber stack) using atomic operations and compare-and-swap (CAS) loops. Must handle ABA problem, provide memory ordering guarantees, implement safe memory reclamation (epoch-based or hazard pointers), and demonstrate linearizability.

### Required Rust Concepts
- Atomic types (AtomicPtr, AtomicUsize) and memory ordering
- compare_exchange and compare_exchange_weak
- Memory ordering (Relaxed, Acquire, Release, SeqCst)
- Unsafe Rust and raw pointer manipulation
- Memory reclamation strategies (crossbeam-epoch)
- Fences and synchronization primitives
- NonNull<T> for non-null pointer guarantees
- Phantom types for lifetime management

### Expected Solution Complexity
- **LOC Estimate**: 600-900 lines
- **Files**: 6-8 (stack implementation, node allocation, epoch management, tests, benchmarks, linearizability tests, unsafe documentation)
- **Key Types**:
  - Stack<T> with AtomicPtr<Node<T>>
  - Node<T> with next pointer
  - Epoch-based reclamation system
  - Guard types for memory safety

### Key Evaluation Points

#### What Differentiates Prompt Formats:

1. **Memory Ordering Correctness**
   - Minimal: Will use SeqCst everywhere (correct but slow) or wrong orderings
   - Metadata: Can specify ordering requirements but may not show implementation
   - Code-heavy: Demonstrates precise ordering with explanatory comments

2. **ABA Problem Handling**
   - Minimal: May not address ABA problem at all
   - Metadata: Can describe ABA problem and solution approach
   - Code-heavy: Shows tagged pointer or epoch-based solution

3. **Unsafe Code Justification**
   - Minimal: May have unnecessary unsafe blocks or missing safety comments
   - Metadata: Can enumerate safety requirements
   - Code-heavy: Shows proper unsafe patterns with safety documentation

4. **Memory Reclamation**
   - Minimal: May leak memory or use unsafe deallocation
   - Metadata: Can specify reclamation strategy
   - Code-heavy: Demonstrates crossbeam-epoch integration or custom solution

### Why This Tests Prompt Format Effectiveness

**Code-Heavy Advantage**: Can show critical atomic patterns:
```rust
pub struct Stack<T> {
    head: AtomicPtr<Node<T>>,
}

struct Node<T> {
    data: T,
    next: *mut Node<T>,
}

impl<T> Stack<T> {
    pub fn push(&self, data: T) {
        let new_node = Box::into_raw(Box::new(Node {
            data,
            next: ptr::null_mut(),
        }));

        let mut head = self.head.load(Ordering::Relaxed);
        loop {
            unsafe {
                (*new_node).next = head;
            }

            // Use Acquire ordering to synchronize with other threads' Release stores
            match self.head.compare_exchange_weak(
                head,
                new_node,
                Ordering::Release,  // Success: synchronize our writes
                Ordering::Relaxed,  // Failure: retry doesn't need synchronization
            ) {
                Ok(_) => return,
                Err(actual) => head = actual,  // CAS failed, retry with new head
            }
        }
    }

    pub fn pop(&self) -> Option<T> {
        let mut head = self.head.load(Ordering::Acquire);
        loop {
            if head.is_null() {
                return None;
            }

            let next = unsafe { (*head).next };

            // Use Release ordering to ensure our reads are visible to other threads
            match self.head.compare_exchange_weak(
                head,
                next,
                Ordering::Release,
                Ordering::Acquire,
            ) {
                Ok(_) => {
                    // SAFETY: We own this node exclusively now
                    // Must defer deallocation due to ABA problem
                    unsafe {
                        let boxed = Box::from_raw(head);
                        return Some(boxed.data);
                    }
                }
                Err(actual) => head = actual,
            }
        }
    }
}
```

**Metadata Advantage**: Can specify atomic requirements systematically:
```yaml
lock_free_requirements:
  algorithm: "Treiber stack"
  atomic_operations:
    - operation: "push"
      memory_ordering:
        success: "Release"
        failure: "Relaxed"
      rationale: "Release ensures our writes visible before CAS succeeds"
    - operation: "pop"
      memory_ordering:
        success: "Release"
        failure: "Acquire"
      rationale: "Acquire ensures we see previous thread's writes"
  aba_prevention:
    strategy: "Epoch-based reclamation (crossbeam-epoch)"
    reason: "Prevents use-after-free when pointers are reused"
  memory_reclamation:
    strategy: "Deferred using epoch-based collection"
    library: "crossbeam-epoch"
  unsafe_blocks:
    required_safety_invariants:
      - "Node pointer must be valid until epoch reclamation"
      - "No shared mutable access to node data"
      - "CAS winner has exclusive ownership"
```

**Minimal Struggle**: Will produce code with:
- Incorrect memory orderings leading to data races
- Memory leaks or use-after-free bugs
- No ABA problem handling
- Excessive unsafe code without justification
- Missing linearizability guarantees
- Poor documentation of safety invariants

### Success Criteria
- [ ] Correct memory ordering for all atomic operations
- [ ] ABA problem handled (epoch-based or tagged pointers)
- [ ] Safe memory reclamation without leaks
- [ ] All unsafe code documented with safety invariants
- [ ] Linearizability tests pass (using loom or shuttle)
- [ ] Performance competitive with Mutex-based stack
- [ ] Miri passes with no undefined behavior

---

## Level 5: Master Complexity - Embedded HAL with Zero-Cost Abstractions

### Challenge
Build a Hardware Abstraction Layer (HAL) for an embedded microcontroller (STM32 or similar) that uses type-state pattern for compile-time state checking, zero-cost abstractions for peripheral access, DMA transfers with ownership transfer, interrupt-safe shared state, and #![no_std] compatibility.

### Required Rust Concepts
- Type-state pattern with phantom types
- Const generics for pin configurations
- Trait-based abstractions (embedded-hal traits)
- volatile_register and memory-mapped I/O
- #![no_std] and core library usage
- Critical sections and interrupt safety
- DMA with ownership transfer semantics
- Zero-sized types (ZST) for compile-time checks
- Associated types and GATs (Generic Associated Types)
- Panic handlers and link sections

### Expected Solution Complexity
- **LOC Estimate**: 800-1200 lines
- **Files**: 10-12 (peripheral modules: GPIO, UART, SPI, DMA, interrupt handling, memory map, build script, linker script, examples, tests with qemu)
- **Key Types**:
  - Pin<MODE, const PIN: u8> with type-state pattern
  - Peripheral handles with ownership semantics
  - DMA transfer types with compile-time channel checking
  - Interrupt-safe shared state types

### Key Evaluation Points

#### What Differentiates Prompt Formats:

1. **Type-State Pattern Correctness**
   - Minimal: Will use runtime checks or enums (not zero-cost)
   - Metadata: Can specify state transitions but may not show implementation
   - Code-heavy: Demonstrates phantom types and state transitions

2. **Zero-Cost Abstraction Verification**
   - Minimal: May introduce runtime overhead
   - Metadata: Can specify zero-cost requirement
   - Code-heavy: Shows inline(always) and assembly inspection comments

3. **Memory Safety in Embedded Context**
   - Minimal: May have data races in interrupt handlers
   - Metadata: Can enumerate safety requirements
   - Code-heavy: Shows critical-section patterns and singleton guarantees

4. **DMA Ownership Transfer**
   - Minimal: May use unsafe without proper ownership transfer
   - Metadata: Can specify ownership semantics
   - Code-heavy: Demonstrates move semantics for buffer ownership

### Why This Tests Prompt Format Effectiveness

**Code-Heavy Advantage**: Can show complete type-state pattern:
```rust
use core::marker::PhantomData;

// Type-state markers
pub struct Input;
pub struct Output;
pub struct Alternate<const AF: u8>;

// Pin with compile-time state
pub struct Pin<MODE, const PIN: u8> {
    _mode: PhantomData<MODE>,
}

impl<const PIN: u8> Pin<Input, PIN> {
    /// Convert input pin to output pin (consumes self)
    pub fn into_output(self) -> Pin<Output, PIN> {
        unsafe {
            // SAFETY: We have exclusive ownership of this pin
            let gpio = &(*GPIOA::ptr());
            gpio.moder.modify(|r, w| {
                let mode = r.bits();
                w.bits((mode & !(0b11 << (PIN * 2))) | (0b01 << (PIN * 2)))
            });
        }
        Pin { _mode: PhantomData }
    }
}

impl<const PIN: u8> Pin<Output, PIN> {
    #[inline(always)]
    pub fn set_high(&mut self) {
        unsafe {
            // SAFETY: Atomic write to set register
            let gpio = &(*GPIOA::ptr());
            gpio.bsrr.write(|w| w.bits(1 << PIN));
        }
    }
}

// DMA transfer with ownership
pub struct Transfer<BUF, CHANNEL> {
    buffer: BUF,
    _channel: PhantomData<CHANNEL>,
}

impl<BUF, CHANNEL> Transfer<BUF, CHANNEL>
where
    BUF: AsSlice<Element = u8>,
{
    pub fn start(buffer: BUF, channel: CHANNEL) -> Self {
        // Transfer ownership of buffer to DMA
        unsafe {
            let slice = buffer.as_slice();
            let dma = &(*DMA::ptr());
            dma.ch[CHANNEL::ID].mar.write(|w| {
                w.bits(slice.as_ptr() as u32)
            });
            dma.ch[CHANNEL::ID].ndtr.write(|w| {
                w.bits(slice.len() as u32)
            });
            // Enable DMA
            dma.ch[CHANNEL::ID].cr.modify(|_, w| w.en().set_bit());
        }

        Transfer {
            buffer,
            _channel: PhantomData,
        }
    }

    pub fn wait(self) -> (BUF, CHANNEL) {
        // Wait for transfer complete
        while unsafe { (*DMA::ptr()).isr.read().tcif1().bit_is_clear() } {}

        // Clear flag
        unsafe {
            (*DMA::ptr()).ifcr.write(|w| w.ctcif1().set_bit());
        }

        // Return buffer and channel ownership
        (self.buffer, CHANNEL::new())
    }
}

// Interrupt-safe shared state
use core::cell::UnsafeCell;
use cortex_m::interrupt;

pub struct Mutex<T> {
    data: UnsafeCell<T>,
}

unsafe impl<T> Sync for Mutex<T> {}

impl<T> Mutex<T> {
    pub const fn new(data: T) -> Self {
        Mutex {
            data: UnsafeCell::new(data),
        }
    }

    pub fn lock<R>(&self, f: impl FnOnce(&mut T) -> R) -> R {
        interrupt::free(|_cs| {
            // SAFETY: Interrupts disabled, exclusive access guaranteed
            let data = unsafe { &mut *self.data.get() };
            f(data)
        })
    }
}
```

**Metadata Advantage**: Can specify embedded requirements systematically:
```yaml
embedded_hal_requirements:
  target: "thumbv7em-none-eabihf (STM32F4)"
  no_std: true
  peripherals:
    - GPIO:
        type_state_pattern:
          states: ["Input", "Output", "Alternate<AF>"]
          compile_time_checking: true
        pins: "PA0-PA15 using const generics"
    - UART:
        baud_rates: [9600, 115200]
        dma_support: true
    - SPI:
        modes: ["Mode0", "Mode1", "Mode2", "Mode3"]
        dma_support: true
  dma:
    ownership_transfer: "Buffer ownership moves to DMA during transfer"
    return_ownership: "Buffer returned on transfer completion"
    channels: "Compile-time channel checking"
  interrupt_safety:
    strategy: "cortex-m critical sections"
    shared_state: "Mutex with interrupt::free"
  zero_cost_requirements:
    - "All abstractions inline to single register access"
    - "No heap allocation"
    - "No dynamic dispatch"
  memory_safety:
    - "Singleton pattern for peripheral access"
    - "Type-state prevents invalid operations"
    - "DMA ownership prevents data races"
```

**Minimal Struggle**: Will produce code with:
- Runtime state checks instead of compile-time (not zero-cost)
- Potential data races in interrupt handlers
- Missing critical sections for shared state
- Incorrect memory-mapped I/O access patterns
- No DMA ownership transfer (unsafe concurrent access)
- Missing embedded-hal trait implementations
- Panic in #![no_std] context without handler

### Success Criteria
- [ ] Type-state pattern prevents invalid operations at compile time
- [ ] Zero assembly overhead verified (inline to single instruction)
- [ ] No data races in interrupt handlers (proven with static analysis)
- [ ] DMA transfers use ownership to prevent concurrent access
- [ ] #![no_std] compatible with no heap allocation
- [ ] Implements embedded-hal traits correctly
- [ ] Works on actual hardware (or QEMU) with example code
- [ ] Miri/KANI formal verification passes

---

## Cross-Scenario Comparison Matrix

| Scenario | Minimal Format Risk | Metadata Format Strength | Code-Heavy Format Strength | Complexity Differentiator |
|----------|---------------------|--------------------------|----------------------------|---------------------------|
| Level 1: Error Handling | May use anti-patterns like .unwrap() | Can enumerate error types systematically | Shows idiomatic ? operator patterns | Error ergonomics and type design |
| Level 2: Lifetimes | Over-constrains with 'static | Can specify lifetime relationships | Demonstrates elision and correct annotations | Borrow checker satisfaction |
| Level 3: Async Concurrency | May have deadlocks/races | Can structure shutdown sequence | Shows complete tokio patterns | Concurrent correctness |
| Level 4: Lock-Free | Incorrect memory orderings | Can specify atomic requirements | Demonstrates precise ordering with rationale | Memory model understanding |
| Level 5: Embedded HAL | Runtime checks (not zero-cost) | Can enumerate safety requirements | Shows type-state with ZST patterns | Compile-time guarantees |

## Evaluation Metrics for Each Scenario

### Correctness Metrics
- **Compiles without errors**: Binary (yes/no)
- **Passes test suite**: Percentage of tests passed
- **No unsafe code violations**: Verified by Miri/KANI
- **No data races**: Verified by loom/shuttle (async scenarios)

### Idiomatic Rust Metrics
- **Uses proper error handling**: ? operator vs match vs unwrap
- **Appropriate lifetime annotations**: Not over-constrained with 'static
- **Zero-cost abstractions**: Verified by assembly inspection
- **Follows Rust API guidelines**: Checked against rust-api-guidelines

### Performance Metrics
- **Runtime overhead**: Compared to unsafe baseline
- **Memory usage**: Heap allocations in scenarios where forbidden
- **Compile time**: Indicator of type system complexity

### Prompt Format Effectiveness Scoring

For each scenario, score (1-10) each format on:

1. **First Attempt Success Rate**: Does it compile and pass tests?
2. **Idiomatic Code Quality**: How Rust-like is the solution?
3. **Performance**: Does it meet zero-cost/efficiency requirements?
4. **Safety**: Are all unsafe blocks justified and correct?
5. **Maintainability**: Is the code understandable and well-documented?

## Expected Format Performance Profiles

### Minimal Format
- **Strengths**: Fast iteration, good for simple scenarios
- **Weaknesses**:
  - Level 1-2: May work but not idiomatic
  - Level 3-5: High failure rate, safety issues
- **Best for**: Prototyping, exploratory coding

### Metadata Format
- **Strengths**: Clear requirements, systematic coverage
- **Weaknesses**:
  - May specify what but not show how
  - Agent must translate requirements to code
- **Best for**: Complex requirements with clear specifications

### Code-Heavy Format
- **Strengths**: Shows patterns directly, demonstrates idioms
- **Weaknesses**:
  - May be verbose for simple cases
  - Risk of copy-paste without understanding
- **Best for**: Complex patterns where examples clarify expectations

## Recommended Testing Approach

1. **Run all 5 scenarios with each prompt format**
2. **Measure**:
   - Time to first compiling solution
   - Number of iterations needed
   - Final code quality score
   - Test pass rate
   - Performance benchmark results

3. **Analyze**:
   - At what complexity level does each format break down?
   - Which format produces most idiomatic code?
   - Which format best handles safety-critical code?

4. **Document**:
   - Specific examples where format made the difference
   - Failure modes for each format
   - Recommendations for when to use each format