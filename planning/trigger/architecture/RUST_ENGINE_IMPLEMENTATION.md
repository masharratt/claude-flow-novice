# CFN Engine - Rust Implementation Specification

**Version:** 1.0.0
**Status:** Planning
**Target:** Replace Node.js execution layer with Rust for 10x resource efficiency

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Crate Specifications](#3-crate-specifications)
4. [Data Models](#4-data-models)
5. [API Specification](#5-api-specification)
6. [Database Schema](#6-database-schema)
7. [Configuration System](#7-configuration-system)
8. [LLM Provider Integration](#8-llm-provider-integration)
9. [Observability](#9-observability)
10. [Deployment](#10-deployment)
11. [Testing Strategy](#11-testing-strategy)
12. [Migration Path](#12-migration-path)
13. [Implementation Schedule](#13-implementation-schedule)

---

## 1. Executive Summary

### Goals

1. **10x resource efficiency**: Reduce memory from 5-50GB to 500MB-1GB for 10k concurrent tasks
2. **Sub-millisecond dispatch**: Task dispatch latency <1ms (vs 5-20ms Node.js)
3. **Zero GC pauses**: Predictable latency for realtime profile
4. **Maintain flexibility**: YAML/JSON task definitions, hot-reloadable config

### Non-Goals

- Rewriting LLM API clients (use existing Rust crates)
- Building a UI dashboard (use Grafana + existing tools)
- Replacing Redis/Postgres (keep existing infrastructure)

### Success Metrics

| Metric | Current (Node.js) | Target (Rust) |
|--------|-------------------|---------------|
| Memory per 1k tasks | 500MB-5GB | 50-100MB |
| Task dispatch p99 | 20ms | 1ms |
| Tasks/sec/core | 1-5k | 50-100k |
| Cold start | 2-5s | <100ms |
| Binary size | N/A | <20MB |

---

## 2. Architecture Overview

### System Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CFN Loop (Existing)                         │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────┐    │
│  │  Loop 3   │  │  Loop 2   │  │  Loop 4   │  │   Playbook    │    │
│  │  Agents   │  │ Validators│  │    PO     │  │    System     │    │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └───────┬───────┘    │
└────────┼──────────────┼──────────────┼────────────────┼────────────┘
         │              │              │                │
         └──────────────┴──────────────┴────────────────┘
                                │
                         gRPC / HTTP
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CFN Rust Engine                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                        cfn-api                               │   │
│  │  • gRPC Server (tonic)    • REST API (axum)                 │   │
│  │  • WebSocket streaming    • Health checks                   │   │
│  └─────────────────────────────┬───────────────────────────────┘   │
│                                │                                    │
│  ┌─────────────────────────────┴───────────────────────────────┐   │
│  │                     cfn-scheduler                            │   │
│  │  • DAG resolution         • Priority queues (lock-free)     │   │
│  │  • Batch formation        • Dependency tracking             │   │
│  └─────────────────────────────┬───────────────────────────────┘   │
│                                │                                    │
│  ┌─────────────────────────────┴───────────────────────────────┐   │
│  │                     cfn-executor                             │   │
│  │  • Tokio worker pool      • Escalation FSM                  │   │
│  │  • Timeout management     • Circuit breakers                │   │
│  │  • Red-flag detection     • Retry logic                     │   │
│  └─────────────────────────────┬───────────────────────────────┘   │
│                                │                                    │
│  ┌──────────────┬──────────────┴──────────────┬────────────────┐   │
│  │ cfn-llm      │ cfn-state                   │ cfn-metrics    │   │
│  │ • Provider   │ • Redis coord               │ • Prometheus   │   │
│  │   clients    │ • Checkpointing             │ • Ring buffers │   │
│  │ • Retry      │ • Distributed locks         │ • DB export    │   │
│  └──────────────┴─────────────────────────────┴────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     cfn-config                               │   │
│  │  • YAML/JSON loader       • Hot reload (inotify)            │   │
│  │  • Validation             • Schema versioning               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      cfn-core                                │   │
│  │  • Shared types           • Error types                     │   │
│  │  • Traits                 • Constants                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
         ┌──────────┐    ┌──────────┐    ┌──────────┐
         │  Redis   │    │ Postgres │    │ LLM APIs │
         └──────────┘    └──────────┘    └──────────┘
```

### Crate Dependency Graph

```
cfn-core (no deps)
    ↑
    ├── cfn-config
    ├── cfn-metrics
    ├── cfn-state
    ├── cfn-llm
    │       ↑
    │       └── cfn-executor
    │               ↑
    │               └── cfn-scheduler
    │                       ↑
    │                       └── cfn-api
    │                               ↑
    │                               └── cfn-engine (binary)
```

---

## 3. Crate Specifications

### 3.1 cfn-core

**Purpose:** Shared types, traits, and error definitions.

**Files:**
```
cfn-core/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── task.rs          # MicroTask, TaskDefinition
    ├── tier.rs          # ModelTier enum
    ├── profile.rs       # TaskProfile struct
    ├── result.rs        # TaskResult, AttemptResult
    ├── error.rs         # CfnError, ErrorKind
    └── id.rs            # TaskId, MicroTaskId (typed wrappers)
```

**Key Types:**

```rust
// src/tier.rs
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelTier {
    #[serde(rename = "t1_haiku")]
    T1Haiku = 1,
    #[serde(rename = "t2_mini")]
    T2Mini = 2,
    #[serde(rename = "t3_gpt4")]
    T3Gpt4 = 3,
    #[serde(rename = "t4_sonnet")]
    T4Sonnet = 4,
    #[serde(rename = "t5_opus")]
    T5Opus = 5,
}

impl ModelTier {
    pub const ALL: [ModelTier; 5] = [
        Self::T1Haiku,
        Self::T2Mini,
        Self::T3Gpt4,
        Self::T4Sonnet,
        Self::T5Opus,
    ];

    pub fn cost_per_million_tokens(&self) -> f64 {
        match self {
            Self::T1Haiku => 0.25,
            Self::T2Mini => 0.40,
            Self::T3Gpt4 => 2.00,
            Self::T4Sonnet => 3.00,
            Self::T5Opus => 15.00,
        }
    }

    pub fn avg_latency_ms(&self) -> u64 {
        match self {
            Self::T1Haiku => 500,
            Self::T2Mini => 800,
            Self::T3Gpt4 => 1200,
            Self::T4Sonnet => 1500,
            Self::T5Opus => 3000,
        }
    }

    pub fn provider(&self) -> &'static str {
        match self {
            Self::T1Haiku => "anthropic",
            Self::T2Mini => "openai",
            Self::T3Gpt4 => "openai",
            Self::T4Sonnet => "anthropic",
            Self::T5Opus => "anthropic",
        }
    }

    pub fn model_id(&self) -> &'static str {
        match self {
            Self::T1Haiku => "claude-3-haiku-20240307",
            Self::T2Mini => "gpt-4.1-mini",
            Self::T3Gpt4 => "gpt-4.1",
            Self::T4Sonnet => "claude-sonnet-4-20250514",
            Self::T5Opus => "claude-3-opus-20240229",
        }
    }

    pub fn next(&self) -> Option<Self> {
        match self {
            Self::T1Haiku => Some(Self::T2Mini),
            Self::T2Mini => Some(Self::T3Gpt4),
            Self::T3Gpt4 => Some(Self::T4Sonnet),
            Self::T4Sonnet => Some(Self::T5Opus),
            Self::T5Opus => None,
        }
    }

    pub fn from_level(level: u8) -> Option<Self> {
        match level {
            1 => Some(Self::T1Haiku),
            2 => Some(Self::T2Mini),
            3 => Some(Self::T3Gpt4),
            4 => Some(Self::T4Sonnet),
            5 => Some(Self::T5Opus),
            _ => None,
        }
    }
}

impl fmt::Display for ModelTier {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::T1Haiku => write!(f, "T1:Haiku"),
            Self::T2Mini => write!(f, "T2:Mini"),
            Self::T3Gpt4 => write!(f, "T3:GPT4"),
            Self::T4Sonnet => write!(f, "T4:Sonnet"),
            Self::T5Opus => write!(f, "T5:Opus"),
        }
    }
}
```

```rust
// src/profile.rs
use crate::tier::ModelTier;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskProfile {
    pub name: String,
    pub speed_weight: f32,
    pub cost_weight: f32,
    pub accuracy_weight: f32,
    pub max_latency_ms: u64,
    pub max_cost_usd: f64,
    pub parallelism: usize,
    pub start_tier: ModelTier,
    pub max_tier: ModelTier,
}

impl TaskProfile {
    pub fn realtime() -> Self {
        Self {
            name: "realtime".into(),
            speed_weight: 0.9,
            cost_weight: 0.1,
            accuracy_weight: 0.0,
            max_latency_ms: 5_000,
            max_cost_usd: 1.00,
            parallelism: 10,
            start_tier: ModelTier::T3Gpt4,
            max_tier: ModelTier::T5Opus,
        }
    }

    pub fn balanced() -> Self {
        Self {
            name: "balanced".into(),
            speed_weight: 0.5,
            cost_weight: 0.5,
            accuracy_weight: 0.0,
            max_latency_ms: 30_000,
            max_cost_usd: 0.25,
            parallelism: 5,
            start_tier: ModelTier::T1Haiku,
            max_tier: ModelTier::T5Opus,
        }
    }

    pub fn budget() -> Self {
        Self {
            name: "budget".into(),
            speed_weight: 0.1,
            cost_weight: 0.9,
            accuracy_weight: 0.0,
            max_latency_ms: 120_000,
            max_cost_usd: 0.05,
            parallelism: 2,
            start_tier: ModelTier::T1Haiku,
            max_tier: ModelTier::T3Gpt4,
        }
    }

    pub fn critical() -> Self {
        Self {
            name: "critical".into(),
            speed_weight: 0.3,
            cost_weight: 0.2,
            accuracy_weight: 0.5,
            max_latency_ms: 60_000,
            max_cost_usd: 2.00,
            parallelism: 3,
            start_tier: ModelTier::T4Sonnet,
            max_tier: ModelTier::T5Opus,
        }
    }
}
```

```rust
// src/task.rs
use crate::{id::*, profile::TaskProfile, tier::ModelTier};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDefinition {
    pub id: String,
    pub task_type: TaskType,
    pub profile: String,
    pub validators: Vec<Validator>,
    pub red_flags: Vec<RedFlag>,
    pub escalation: EscalationConfig,
    pub context: ContextConfig,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskType {
    Coding,
    Content,
    Seo,
    Analysis,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Validator {
    pub name: String,
    pub command: String,
    pub timeout_ms: u64,
    #[serde(default)]
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedFlag {
    pub name: String,
    pub condition: String,
    #[serde(default)]
    pub severity: RedFlagSeverity,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RedFlagSeverity {
    #[default]
    Warning,
    Error,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EscalationConfig {
    #[serde(default = "default_max_attempts")]
    pub max_attempts_per_tier: u8,
    pub triggers: Vec<EscalationTrigger>,
    #[serde(default)]
    pub skip_tiers: Vec<ModelTier>,
}

fn default_max_attempts() -> u8 {
    2
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EscalationTrigger {
    TestFail,
    RedFlag,
    Timeout,
    SyntaxError,
    ValidatorFail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextConfig {
    pub max_tokens: usize,
    pub include_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct MicroTask {
    pub id: MicroTaskId,
    pub parent_task_id: TaskId,
    pub definition: TaskDefinition,
    pub profile: TaskProfile,
    pub subtask: Subtask,
    pub context: TaskContext,
    pub dependencies: Vec<MicroTaskId>,
    pub priority: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subtask {
    pub description: String,
    pub complexity: Complexity,
    pub file_path: Option<String>,
    pub function_name: Option<String>,
    pub prompt: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Complexity {
    Trivial,
    Simple,
    Medium,
    Complex,
    Critical,
}

impl Complexity {
    pub fn suggested_start_tier(&self) -> ModelTier {
        match self {
            Self::Trivial | Self::Simple => ModelTier::T1Haiku,
            Self::Medium => ModelTier::T2Mini,
            Self::Complex => ModelTier::T3Gpt4,
            Self::Critical => ModelTier::T4Sonnet,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct TaskContext {
    pub code_snippets: HashMap<String, String>,
    pub file_contents: HashMap<String, String>,
    pub metadata: HashMap<String, String>,
}
```

```rust
// src/result.rs
use crate::{id::*, tier::ModelTier};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: TaskId,
    pub success: bool,
    pub micro_task_results: Vec<MicroTaskResult>,
    pub total_cost_usd: f64,
    pub total_latency: Duration,
    pub final_output: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MicroTaskResult {
    pub micro_task_id: MicroTaskId,
    pub success: bool,
    pub attempts: Vec<AttemptResult>,
    pub final_tier: ModelTier,
    pub total_cost_usd: f64,
    pub total_latency: Duration,
    pub output: Option<String>,
    pub patch: Option<Patch>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttemptResult {
    pub tier: ModelTier,
    pub attempt_number: u8,
    pub outcome: AttemptOutcome,
    pub latency: Duration,
    pub cost_usd: f64,
    pub tokens_in: u32,
    pub tokens_out: u32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttemptOutcome {
    Success,
    TestFail,
    RedFlag,
    Timeout,
    ApiError,
    ParseError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Patch {
    pub file_path: String,
    pub diff: String,
    pub lines_added: u32,
    pub lines_removed: u32,
}
```

```rust
// src/error.rs
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CfnError {
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Task not found: {0}")]
    TaskNotFound(String),

    #[error("Budget exceeded: spent ${spent:.4}, limit ${limit:.4}")]
    BudgetExceeded { spent: f64, limit: f64 },

    #[error("Latency exceeded: {elapsed_ms}ms, limit {limit_ms}ms")]
    LatencyExceeded { elapsed_ms: u64, limit_ms: u64 },

    #[error("All tiers exhausted for task {task_id}")]
    AllTiersExhausted { task_id: String },

    #[error("LLM API error: {provider} - {message}")]
    LlmApi { provider: String, message: String },

    #[error("Validation failed: {validator} - {message}")]
    Validation { validator: String, message: String },

    #[error("Red flag triggered: {flag} - {details}")]
    RedFlag { flag: String, details: String },

    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Internal error: {0}")]
    Internal(String),
}

pub type CfnResult<T> = Result<T, CfnError>;
```

```rust
// src/id.rs
use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TaskId(String);

impl TaskId {
    pub fn new() -> Self {
        Self(format!("task_{}", Uuid::new_v4().simple()))
    }

    pub fn from_string(s: impl Into<String>) -> Self {
        Self(s.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Default for TaskId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for TaskId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct MicroTaskId(String);

impl MicroTaskId {
    pub fn new(parent: &TaskId, index: usize) -> Self {
        Self(format!("{}_{:04}", parent.as_str(), index))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for MicroTaskId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}
```

**Cargo.toml:**

```toml
[package]
name = "cfn-core"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "1.0"
uuid = { version = "1.6", features = ["v4", "serde"] }
redis = { version = "0.24", features = ["tokio-comp"], optional = true }
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio"], optional = true }

[features]
default = []
full = ["redis", "sqlx"]
```

---

### 3.2 cfn-config

**Purpose:** Load and validate YAML/JSON task definitions with hot-reload support.

**Files:**
```
cfn-config/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── loader.rs        # File loading, directory watching
    ├── validator.rs     # Schema validation
    ├── hot_reload.rs    # inotify-based reloading
    └── schema.rs        # Config schema definitions
```

**Key Implementation:**

```rust
// src/loader.rs
use cfn_core::{task::TaskDefinition, profile::TaskProfile, CfnResult, CfnError};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::fs;

pub struct ConfigLoader {
    task_dir: PathBuf,
    profile_dir: PathBuf,
    tasks: HashMap<String, TaskDefinition>,
    profiles: HashMap<String, TaskProfile>,
}

impl ConfigLoader {
    pub fn new(task_dir: impl AsRef<Path>, profile_dir: impl AsRef<Path>) -> Self {
        Self {
            task_dir: task_dir.as_ref().to_path_buf(),
            profile_dir: profile_dir.as_ref().to_path_buf(),
            tasks: HashMap::new(),
            profiles: HashMap::new(),
        }
    }

    pub async fn load_all(&mut self) -> CfnResult<()> {
        self.load_profiles().await?;
        self.load_tasks().await?;
        Ok(())
    }

    async fn load_tasks(&mut self) -> CfnResult<()> {
        let mut entries = fs::read_dir(&self.task_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "yaml" || e == "yml") {
                let content = fs::read_to_string(&path).await?;
                let task: TaskDefinition = serde_yaml::from_str(&content)
                    .map_err(|e| CfnError::Config(format!("Invalid task config {:?}: {}", path, e)))?;

                self.validate_task(&task)?;
                self.tasks.insert(task.id.clone(), task);
            }
        }

        tracing::info!("Loaded {} task definitions", self.tasks.len());
        Ok(())
    }

    async fn load_profiles(&mut self) -> CfnResult<()> {
        // Load built-in profiles
        self.profiles.insert("realtime".into(), TaskProfile::realtime());
        self.profiles.insert("balanced".into(), TaskProfile::balanced());
        self.profiles.insert("budget".into(), TaskProfile::budget());
        self.profiles.insert("critical".into(), TaskProfile::critical());

        // Load custom profiles from directory
        if self.profile_dir.exists() {
            let mut entries = fs::read_dir(&self.profile_dir).await?;

            while let Some(entry) = entries.next_entry().await? {
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "yaml" || e == "yml") {
                    let content = fs::read_to_string(&path).await?;
                    let profile: TaskProfile = serde_yaml::from_str(&content)
                        .map_err(|e| CfnError::Config(format!("Invalid profile {:?}: {}", path, e)))?;

                    self.profiles.insert(profile.name.clone(), profile);
                }
            }
        }

        tracing::info!("Loaded {} profiles", self.profiles.len());
        Ok(())
    }

    fn validate_task(&self, task: &TaskDefinition) -> CfnResult<()> {
        // Validate profile exists
        if !self.profiles.contains_key(&task.profile) {
            return Err(CfnError::Config(format!(
                "Task '{}' references unknown profile '{}'",
                task.id, task.profile
            )));
        }

        // Validate at least one validator
        if task.validators.is_empty() {
            return Err(CfnError::Config(format!(
                "Task '{}' must have at least one validator",
                task.id
            )));
        }

        Ok(())
    }

    pub fn get_task(&self, id: &str) -> Option<&TaskDefinition> {
        self.tasks.get(id)
    }

    pub fn get_profile(&self, name: &str) -> Option<&TaskProfile> {
        self.profiles.get(name)
    }

    pub fn task_ids(&self) -> impl Iterator<Item = &String> {
        self.tasks.keys()
    }
}
```

```rust
// src/hot_reload.rs
use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::mpsc;

pub struct HotReloader {
    watcher: RecommendedWatcher,
    rx: mpsc::Receiver<Event>,
}

impl HotReloader {
    pub fn new(paths: &[&Path]) -> notify::Result<Self> {
        let (tx, rx) = mpsc::channel(100);

        let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                let _ = tx.blocking_send(event);
            }
        })?;

        for path in paths {
            watcher.watch(path, RecursiveMode::Recursive)?;
        }

        Ok(Self { watcher, rx })
    }

    pub async fn next_change(&mut self) -> Option<Event> {
        self.rx.recv().await
    }
}

pub async fn watch_config<F>(
    loader: Arc<tokio::sync::RwLock<super::loader::ConfigLoader>>,
    paths: &[&Path],
    on_reload: F,
) -> notify::Result<()>
where
    F: Fn() + Send + Sync + 'static,
{
    let mut reloader = HotReloader::new(paths)?;

    loop {
        if let Some(event) = reloader.next_change().await {
            if event.kind.is_modify() || event.kind.is_create() {
                tracing::info!("Config change detected, reloading...");

                let mut loader = loader.write().await;
                if let Err(e) = loader.load_all().await {
                    tracing::error!("Failed to reload config: {}", e);
                } else {
                    tracing::info!("Config reloaded successfully");
                    on_reload();
                }
            }
        }
    }
}
```

---

### 3.3 cfn-scheduler

**Purpose:** DAG resolution, priority queues, and batch formation for parallel execution.

**Files:**
```
cfn-scheduler/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── dag.rs           # Dependency graph
    ├── queue.rs         # Lock-free priority queues
    ├── batch.rs         # Batch formation
    ├── scheduler.rs     # Main scheduler loop
    └── decomposer.rs    # Task decomposition (calls LLM)
```

**Key Implementation:**

```rust
// src/dag.rs
use cfn_core::{id::MicroTaskId, task::MicroTask};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Debug)]
pub struct TaskDag {
    tasks: HashMap<MicroTaskId, MicroTask>,
    dependencies: HashMap<MicroTaskId, HashSet<MicroTaskId>>,
    dependents: HashMap<MicroTaskId, HashSet<MicroTaskId>>,
    completed: HashSet<MicroTaskId>,
}

impl TaskDag {
    pub fn new() -> Self {
        Self {
            tasks: HashMap::new(),
            dependencies: HashMap::new(),
            dependents: HashMap::new(),
            completed: HashSet::new(),
        }
    }

    pub fn add_task(&mut self, task: MicroTask) {
        let id = task.id.clone();
        let deps = task.dependencies.clone();

        // Register dependencies
        self.dependencies.insert(id.clone(), deps.iter().cloned().collect());

        // Register as dependent of each dependency
        for dep in &deps {
            self.dependents
                .entry(dep.clone())
                .or_insert_with(HashSet::new)
                .insert(id.clone());
        }

        self.tasks.insert(id, task);
    }

    pub fn mark_completed(&mut self, id: &MicroTaskId) {
        self.completed.insert(id.clone());
    }

    pub fn get_ready_tasks(&self) -> Vec<&MicroTask> {
        self.tasks
            .values()
            .filter(|task| {
                !self.completed.contains(&task.id)
                    && self.dependencies
                        .get(&task.id)
                        .map_or(true, |deps| deps.iter().all(|d| self.completed.contains(d)))
            })
            .collect()
    }

    pub fn get_batches(&self) -> Vec<Vec<&MicroTask>> {
        let mut batches = Vec::new();
        let mut completed = self.completed.clone();
        let mut remaining: HashSet<_> = self.tasks.keys().cloned().collect();
        remaining.retain(|id| !completed.contains(id));

        while !remaining.is_empty() {
            let batch: Vec<_> = remaining
                .iter()
                .filter(|id| {
                    self.dependencies
                        .get(*id)
                        .map_or(true, |deps| deps.iter().all(|d| completed.contains(d)))
                })
                .cloned()
                .collect();

            if batch.is_empty() {
                // Cycle detected or error
                break;
            }

            batches.push(batch.iter().filter_map(|id| self.tasks.get(id)).collect());

            for id in &batch {
                completed.insert(id.clone());
                remaining.remove(id);
            }
        }

        batches
    }

    pub fn is_complete(&self) -> bool {
        self.completed.len() == self.tasks.len()
    }

    pub fn progress(&self) -> (usize, usize) {
        (self.completed.len(), self.tasks.len())
    }
}
```

```rust
// src/queue.rs
use cfn_core::task::MicroTask;
use crossbeam::queue::SegQueue;
use std::sync::atomic::{AtomicUsize, Ordering};

pub struct PriorityTaskQueue {
    high: SegQueue<MicroTask>,      // realtime, critical
    normal: SegQueue<MicroTask>,    // balanced
    low: SegQueue<MicroTask>,       // budget

    high_count: AtomicUsize,
    normal_count: AtomicUsize,
    low_count: AtomicUsize,
}

impl PriorityTaskQueue {
    pub fn new() -> Self {
        Self {
            high: SegQueue::new(),
            normal: SegQueue::new(),
            low: SegQueue::new(),
            high_count: AtomicUsize::new(0),
            normal_count: AtomicUsize::new(0),
            low_count: AtomicUsize::new(0),
        }
    }

    pub fn enqueue(&self, task: MicroTask) {
        match task.profile.name.as_str() {
            "realtime" | "critical" => {
                self.high.push(task);
                self.high_count.fetch_add(1, Ordering::Relaxed);
            }
            "budget" => {
                self.low.push(task);
                self.low_count.fetch_add(1, Ordering::Relaxed);
            }
            _ => {
                self.normal.push(task);
                self.normal_count.fetch_add(1, Ordering::Relaxed);
            }
        }
    }

    pub fn dequeue(&self) -> Option<MicroTask> {
        // Strict priority: high > normal > low
        if let Some(task) = self.high.pop() {
            self.high_count.fetch_sub(1, Ordering::Relaxed);
            return Some(task);
        }
        if let Some(task) = self.normal.pop() {
            self.normal_count.fetch_sub(1, Ordering::Relaxed);
            return Some(task);
        }
        if let Some(task) = self.low.pop() {
            self.low_count.fetch_sub(1, Ordering::Relaxed);
            return Some(task);
        }
        None
    }

    pub fn len(&self) -> usize {
        self.high_count.load(Ordering::Relaxed)
            + self.normal_count.load(Ordering::Relaxed)
            + self.low_count.load(Ordering::Relaxed)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn counts(&self) -> (usize, usize, usize) {
        (
            self.high_count.load(Ordering::Relaxed),
            self.normal_count.load(Ordering::Relaxed),
            self.low_count.load(Ordering::Relaxed),
        )
    }
}

impl Default for PriorityTaskQueue {
    fn default() -> Self {
        Self::new()
    }
}
```

```rust
// src/scheduler.rs
use crate::{dag::TaskDag, queue::PriorityTaskQueue};
use cfn_core::{id::*, task::*, CfnResult};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};

pub struct Scheduler {
    queue: Arc<PriorityTaskQueue>,
    dags: Arc<RwLock<HashMap<TaskId, TaskDag>>>,
    result_tx: mpsc::Sender<MicroTaskResult>,
}

impl Scheduler {
    pub fn new(result_tx: mpsc::Sender<MicroTaskResult>) -> Self {
        Self {
            queue: Arc::new(PriorityTaskQueue::new()),
            dags: Arc::new(RwLock::new(HashMap::new())),
            result_tx,
        }
    }

    pub async fn submit_task(
        &self,
        task_id: TaskId,
        micro_tasks: Vec<MicroTask>,
    ) -> CfnResult<()> {
        let mut dag = TaskDag::new();

        for task in micro_tasks {
            dag.add_task(task);
        }

        // Queue initial batch (no dependencies)
        for task in dag.get_ready_tasks() {
            self.queue.enqueue(task.clone());
        }

        self.dags.write().await.insert(task_id, dag);
        Ok(())
    }

    pub async fn on_task_complete(&self, result: MicroTaskResult) -> CfnResult<()> {
        let task_id = TaskId::from_string(
            result.micro_task_id.as_str().rsplit('_').nth(1).unwrap_or("")
        );

        let mut dags = self.dags.write().await;

        if let Some(dag) = dags.get_mut(&task_id) {
            dag.mark_completed(&result.micro_task_id);

            // Queue newly ready tasks
            for task in dag.get_ready_tasks() {
                self.queue.enqueue(task.clone());
            }

            // Check if complete
            if dag.is_complete() {
                dags.remove(&task_id);
            }
        }

        self.result_tx.send(result).await
            .map_err(|e| CfnError::Internal(format!("Failed to send result: {}", e)))?;

        Ok(())
    }

    pub fn get_next_task(&self) -> Option<MicroTask> {
        self.queue.dequeue()
    }

    pub fn queue_stats(&self) -> (usize, usize, usize) {
        self.queue.counts()
    }
}
```

---

### 3.4 cfn-executor

**Purpose:** Worker pool, escalation FSM, timeout handling, and task execution.

**Files:**
```
cfn-executor/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── pool.rs          # Tokio worker pool
    ├── runner.rs        # Single task execution
    ├── escalation.rs    # Tier escalation state machine
    ├── timeout.rs       # Timeout wrapper
    ├── circuit.rs       # Circuit breaker
    ├── red_flag.rs      # Red flag detection
    └── validator.rs     # Run validators (tests, linters)
```

**Key Implementation:**

```rust
// src/escalation.rs
use cfn_core::{
    profile::TaskProfile,
    result::AttemptOutcome,
    tier::ModelTier,
    CfnError,
};

#[derive(Debug, Clone)]
pub struct EscalationFsm {
    current_tier: ModelTier,
    attempts_at_tier: u8,
    max_attempts_per_tier: u8,
    total_cost_usd: f64,
    total_latency_ms: u64,
    profile: TaskProfile,
    history: Vec<EscalationEvent>,
}

#[derive(Debug, Clone)]
pub struct EscalationEvent {
    pub tier: ModelTier,
    pub attempt: u8,
    pub outcome: AttemptOutcome,
    pub cost_usd: f64,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EscalationAction {
    Execute(ModelTier),
    Escalate(ModelTier),
    Success,
    Abort(AbortReason),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AbortReason {
    BudgetExceeded,
    LatencyExceeded,
    AllTiersExhausted,
    MaxAttemptsReached,
}

impl EscalationFsm {
    pub fn new(profile: TaskProfile, start_tier: Option<ModelTier>) -> Self {
        let current_tier = start_tier.unwrap_or(profile.start_tier);

        Self {
            current_tier,
            attempts_at_tier: 0,
            max_attempts_per_tier: 2,
            total_cost_usd: 0.0,
            total_latency_ms: 0,
            profile,
            history: Vec::new(),
        }
    }

    pub fn current_tier(&self) -> ModelTier {
        self.current_tier
    }

    pub fn record_attempt(
        &mut self,
        outcome: AttemptOutcome,
        cost_usd: f64,
        latency_ms: u64,
    ) {
        self.total_cost_usd += cost_usd;
        self.total_latency_ms += latency_ms;
        self.attempts_at_tier += 1;

        self.history.push(EscalationEvent {
            tier: self.current_tier,
            attempt: self.attempts_at_tier,
            outcome,
            cost_usd,
            latency_ms,
        });
    }

    pub fn next_action(&mut self, last_outcome: AttemptOutcome) -> EscalationAction {
        // Success case
        if last_outcome == AttemptOutcome::Success {
            return EscalationAction::Success;
        }

        // Budget exceeded
        if self.total_cost_usd >= self.profile.max_cost_usd {
            return EscalationAction::Abort(AbortReason::BudgetExceeded);
        }

        // Latency exceeded
        if self.total_latency_ms >= self.profile.max_latency_ms {
            return EscalationAction::Abort(AbortReason::LatencyExceeded);
        }

        // Retry at current tier
        if self.attempts_at_tier < self.max_attempts_per_tier {
            return EscalationAction::Execute(self.current_tier);
        }

        // Escalate to next tier
        match self.current_tier.next() {
            Some(next_tier) if next_tier <= self.profile.max_tier => {
                self.current_tier = next_tier;
                self.attempts_at_tier = 0;
                EscalationAction::Escalate(next_tier)
            }
            _ => EscalationAction::Abort(AbortReason::AllTiersExhausted),
        }
    }

    pub fn total_cost(&self) -> f64 {
        self.total_cost_usd
    }

    pub fn total_latency_ms(&self) -> u64 {
        self.total_latency_ms
    }

    pub fn history(&self) -> &[EscalationEvent] {
        &self.history
    }

    pub fn total_attempts(&self) -> usize {
        self.history.len()
    }
}
```

```rust
// src/runner.rs
use crate::{
    circuit::CircuitBreaker,
    escalation::{AbortReason, EscalationAction, EscalationFsm},
    red_flag::RedFlagDetector,
    validator::ValidatorRunner,
};
use cfn_core::{
    result::{AttemptOutcome, AttemptResult, MicroTaskResult, Patch},
    task::MicroTask,
    CfnError, CfnResult,
};
use cfn_llm::LlmClient;
use std::sync::Arc;
use std::time::{Duration, Instant};

pub struct TaskRunner {
    llm: Arc<LlmClient>,
    validators: ValidatorRunner,
    red_flags: RedFlagDetector,
    circuit_breaker: CircuitBreaker,
}

impl TaskRunner {
    pub fn new(
        llm: Arc<LlmClient>,
        validators: ValidatorRunner,
        red_flags: RedFlagDetector,
    ) -> Self {
        Self {
            llm,
            validators,
            red_flags,
            circuit_breaker: CircuitBreaker::new(5, Duration::from_secs(30)),
        }
    }

    pub async fn execute(&self, task: MicroTask) -> CfnResult<MicroTaskResult> {
        let start_tier = task.subtask.complexity.suggested_start_tier()
            .max(task.profile.start_tier);

        let mut fsm = EscalationFsm::new(task.profile.clone(), Some(start_tier));
        let mut attempts = Vec::new();
        let mut final_patch = None;

        loop {
            let tier = fsm.current_tier();
            let attempt_start = Instant::now();

            // Check circuit breaker for this provider
            if !self.circuit_breaker.allow_request(tier.provider()) {
                fsm.record_attempt(AttemptOutcome::ApiError, 0.0, 0);
                let action = fsm.next_action(AttemptOutcome::ApiError);

                if let EscalationAction::Abort(reason) = action {
                    return self.build_abort_result(task, attempts, fsm, reason);
                }
                continue;
            }

            // Call LLM
            let llm_result = self.llm.generate(tier, &task.subtask.prompt, &task.context).await;
            let latency_ms = attempt_start.elapsed().as_millis() as u64;

            let (outcome, cost, tokens_in, tokens_out, output) = match llm_result {
                Ok(response) => {
                    self.circuit_breaker.record_success(tier.provider());

                    // Check red flags
                    if let Some(flag) = self.red_flags.check(&response.content) {
                        (
                            AttemptOutcome::RedFlag,
                            response.cost_usd,
                            response.tokens_in,
                            response.tokens_out,
                            Some(response.content),
                        )
                    } else {
                        // Parse patch and run validators
                        match self.parse_and_validate(&response.content, &task).await {
                            Ok(patch) => {
                                final_patch = Some(patch);
                                (
                                    AttemptOutcome::Success,
                                    response.cost_usd,
                                    response.tokens_in,
                                    response.tokens_out,
                                    Some(response.content),
                                )
                            }
                            Err(e) => {
                                let outcome = match e {
                                    CfnError::Validation { .. } => AttemptOutcome::TestFail,
                                    CfnError::RedFlag { .. } => AttemptOutcome::RedFlag,
                                    _ => AttemptOutcome::ParseError,
                                };
                                (
                                    outcome,
                                    response.cost_usd,
                                    response.tokens_in,
                                    response.tokens_out,
                                    Some(response.content),
                                )
                            }
                        }
                    }
                }
                Err(e) => {
                    self.circuit_breaker.record_failure(tier.provider());
                    tracing::warn!("LLM error at {}: {}", tier, e);
                    (AttemptOutcome::ApiError, 0.0, 0, 0, None)
                }
            };

            // Record attempt
            attempts.push(AttemptResult {
                tier,
                attempt_number: (fsm.total_attempts() + 1) as u8,
                outcome,
                latency: Duration::from_millis(latency_ms),
                cost_usd: cost,
                tokens_in,
                tokens_out,
                error: if outcome != AttemptOutcome::Success {
                    output.clone()
                } else {
                    None
                },
            });

            fsm.record_attempt(outcome, cost, latency_ms);

            // Determine next action
            match fsm.next_action(outcome) {
                EscalationAction::Success => {
                    return Ok(MicroTaskResult {
                        micro_task_id: task.id,
                        success: true,
                        attempts,
                        final_tier: tier,
                        total_cost_usd: fsm.total_cost(),
                        total_latency: Duration::from_millis(fsm.total_latency_ms()),
                        output,
                        patch: final_patch,
                    });
                }
                EscalationAction::Execute(_) | EscalationAction::Escalate(_) => {
                    // Continue loop
                }
                EscalationAction::Abort(reason) => {
                    return self.build_abort_result(task, attempts, fsm, reason);
                }
            }
        }
    }

    async fn parse_and_validate(&self, content: &str, task: &MicroTask) -> CfnResult<Patch> {
        // Parse patch from LLM output
        let patch = self.parse_patch(content)?;

        // Run validators
        for validator in &task.definition.validators {
            let result = self.validators.run(validator, &patch).await?;
            if !result.passed {
                return Err(CfnError::Validation {
                    validator: validator.name.clone(),
                    message: result.output,
                });
            }
        }

        Ok(patch)
    }

    fn parse_patch(&self, content: &str) -> CfnResult<Patch> {
        // Extract unified diff from response
        // Look for ```diff blocks or raw diff content
        let diff = if content.contains("```diff") {
            content
                .split("```diff")
                .nth(1)
                .and_then(|s| s.split("```").next())
                .unwrap_or("")
                .trim()
                .to_string()
        } else {
            content.trim().to_string()
        };

        if diff.is_empty() {
            return Err(CfnError::Internal("No patch found in response".into()));
        }

        // Count lines
        let lines_added = diff.lines().filter(|l| l.starts_with('+')).count() as u32;
        let lines_removed = diff.lines().filter(|l| l.starts_with('-')).count() as u32;

        // Extract file path
        let file_path = diff
            .lines()
            .find(|l| l.starts_with("+++") || l.starts_with("---"))
            .and_then(|l| l.split_whitespace().nth(1))
            .unwrap_or("unknown")
            .trim_start_matches("a/")
            .trim_start_matches("b/")
            .to_string();

        Ok(Patch {
            file_path,
            diff,
            lines_added,
            lines_removed,
        })
    }

    fn build_abort_result(
        &self,
        task: MicroTask,
        attempts: Vec<AttemptResult>,
        fsm: EscalationFsm,
        reason: AbortReason,
    ) -> CfnResult<MicroTaskResult> {
        Ok(MicroTaskResult {
            micro_task_id: task.id,
            success: false,
            attempts,
            final_tier: fsm.current_tier(),
            total_cost_usd: fsm.total_cost(),
            total_latency: Duration::from_millis(fsm.total_latency_ms()),
            output: Some(format!("Aborted: {:?}", reason)),
            patch: None,
        })
    }
}
```

```rust
// src/pool.rs
use crate::runner::TaskRunner;
use cfn_core::{result::MicroTaskResult, task::MicroTask, CfnResult};
use std::sync::Arc;
use tokio::sync::mpsc;

pub struct WorkerPool {
    workers: Vec<Worker>,
    task_tx: mpsc::Sender<MicroTask>,
    result_rx: mpsc::Receiver<MicroTaskResult>,
}

struct Worker {
    handle: tokio::task::JoinHandle<()>,
}

impl WorkerPool {
    pub fn new(size: usize, runner: Arc<TaskRunner>) -> Self {
        let (task_tx, task_rx) = mpsc::channel(size * 10);
        let (result_tx, result_rx) = mpsc::channel(size * 10);

        let task_rx = Arc::new(tokio::sync::Mutex::new(task_rx));

        let workers: Vec<_> = (0..size)
            .map(|id| {
                let runner = Arc::clone(&runner);
                let task_rx = Arc::clone(&task_rx);
                let result_tx = result_tx.clone();

                let handle = tokio::spawn(async move {
                    loop {
                        let task = {
                            let mut rx = task_rx.lock().await;
                            rx.recv().await
                        };

                        match task {
                            Some(task) => {
                                let micro_task_id = task.id.clone();
                                tracing::debug!("Worker {} executing {}", id, micro_task_id);

                                match runner.execute(task).await {
                                    Ok(result) => {
                                        let _ = result_tx.send(result).await;
                                    }
                                    Err(e) => {
                                        tracing::error!("Worker {} error: {}", id, e);
                                    }
                                }
                            }
                            None => break,
                        }
                    }
                });

                Worker { handle }
            })
            .collect();

        Self {
            workers,
            task_tx,
            result_rx,
        }
    }

    pub async fn submit(&self, task: MicroTask) -> CfnResult<()> {
        self.task_tx.send(task).await
            .map_err(|e| CfnError::Internal(format!("Failed to submit task: {}", e)))
    }

    pub async fn next_result(&mut self) -> Option<MicroTaskResult> {
        self.result_rx.recv().await
    }

    pub fn worker_count(&self) -> usize {
        self.workers.len()
    }
}
```

```rust
// src/circuit.rs
use dashmap::DashMap;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, Instant};

pub struct CircuitBreaker {
    states: DashMap<String, CircuitState>,
    failure_threshold: u32,
    recovery_timeout: Duration,
}

struct CircuitState {
    failures: AtomicU32,
    last_failure: AtomicU64,
    state: AtomicU32, // 0 = closed, 1 = open, 2 = half-open
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32, recovery_timeout: Duration) -> Self {
        Self {
            states: DashMap::new(),
            failure_threshold,
            recovery_timeout,
        }
    }

    pub fn allow_request(&self, provider: &str) -> bool {
        let state = self.states.entry(provider.to_string()).or_insert_with(|| CircuitState {
            failures: AtomicU32::new(0),
            last_failure: AtomicU64::new(0),
            state: AtomicU32::new(0),
        });

        let current_state = state.state.load(Ordering::Relaxed);

        match current_state {
            0 => true, // Closed - allow
            1 => {
                // Open - check if recovery timeout elapsed
                let last = state.last_failure.load(Ordering::Relaxed);
                let elapsed = Instant::now().elapsed().as_millis() as u64 - last;

                if elapsed >= self.recovery_timeout.as_millis() as u64 {
                    state.state.store(2, Ordering::Relaxed); // Half-open
                    true
                } else {
                    false
                }
            }
            2 => true, // Half-open - allow one request
            _ => false,
        }
    }

    pub fn record_success(&self, provider: &str) {
        if let Some(state) = self.states.get(provider) {
            state.failures.store(0, Ordering::Relaxed);
            state.state.store(0, Ordering::Relaxed); // Closed
        }
    }

    pub fn record_failure(&self, provider: &str) {
        let state = self.states.entry(provider.to_string()).or_insert_with(|| CircuitState {
            failures: AtomicU32::new(0),
            last_failure: AtomicU64::new(0),
            state: AtomicU32::new(0),
        });

        let failures = state.failures.fetch_add(1, Ordering::Relaxed) + 1;
        state.last_failure.store(
            Instant::now().elapsed().as_millis() as u64,
            Ordering::Relaxed,
        );

        if failures >= self.failure_threshold {
            state.state.store(1, Ordering::Relaxed); // Open
        }
    }
}
```

```rust
// src/red_flag.rs
use cfn_core::task::RedFlag;

pub struct RedFlagDetector {
    rules: Vec<RedFlagRule>,
}

struct RedFlagRule {
    name: String,
    check: Box<dyn Fn(&str) -> bool + Send + Sync>,
}

impl RedFlagDetector {
    pub fn new(flags: &[RedFlag]) -> Self {
        let rules = flags
            .iter()
            .filter_map(|f| Self::compile_rule(f))
            .collect();

        Self { rules }
    }

    fn compile_rule(flag: &RedFlag) -> Option<RedFlagRule> {
        let name = flag.name.clone();
        let condition = flag.condition.clone();

        // Simple condition parsing
        let check: Box<dyn Fn(&str) -> bool + Send + Sync> = if condition.contains("diff_lines >") {
            let threshold: usize = condition
                .split('>')
                .nth(1)?
                .trim()
                .parse()
                .ok()?;

            Box::new(move |content: &str| {
                let lines = content.lines().count();
                lines > threshold
            })
        } else if condition.contains("parse_error") {
            Box::new(|content: &str| {
                // Check for common syntax errors
                content.contains("SyntaxError") || content.contains("ParseError")
            })
        } else {
            return None;
        };

        Some(RedFlagRule { name, check })
    }

    pub fn check(&self, content: &str) -> Option<String> {
        for rule in &self.rules {
            if (rule.check)(content) {
                return Some(rule.name.clone());
            }
        }
        None
    }
}
```

---

### 3.5 cfn-llm

**Purpose:** LLM provider clients with retry logic and cost tracking.

**Files:**
```
cfn-llm/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── client.rs        # Unified client interface
    ├── anthropic.rs     # Anthropic API
    ├── openai.rs        # OpenAI API
    ├── response.rs      # Response types
    └── retry.rs         # Retry with backoff
```

**Key Implementation:**

```rust
// src/client.rs
use crate::{anthropic::AnthropicClient, openai::OpenAiClient, response::LlmResponse};
use cfn_core::{task::TaskContext, tier::ModelTier, CfnError, CfnResult};
use std::sync::Arc;

pub struct LlmClient {
    anthropic: Arc<AnthropicClient>,
    openai: Arc<OpenAiClient>,
}

impl LlmClient {
    pub fn new(anthropic_key: &str, openai_key: &str) -> Self {
        Self {
            anthropic: Arc::new(AnthropicClient::new(anthropic_key)),
            openai: Arc::new(OpenAiClient::new(openai_key)),
        }
    }

    pub async fn generate(
        &self,
        tier: ModelTier,
        prompt: &str,
        context: &TaskContext,
    ) -> CfnResult<LlmResponse> {
        let full_prompt = self.build_prompt(prompt, context);

        match tier.provider() {
            "anthropic" => {
                self.anthropic
                    .complete(tier.model_id(), &full_prompt)
                    .await
            }
            "openai" => {
                self.openai
                    .complete(tier.model_id(), &full_prompt)
                    .await
            }
            provider => Err(CfnError::LlmApi {
                provider: provider.into(),
                message: "Unknown provider".into(),
            }),
        }
    }

    fn build_prompt(&self, prompt: &str, context: &TaskContext) -> String {
        let mut full = String::new();

        // Add code context
        for (name, content) in &context.code_snippets {
            full.push_str(&format!("## {}\n```\n{}\n```\n\n", name, content));
        }

        // Add metadata
        for (key, value) in &context.metadata {
            full.push_str(&format!("{}: {}\n", key, value));
        }

        full.push_str("\n## Task\n");
        full.push_str(prompt);
        full.push_str("\n\n## Instructions\nRespond with ONLY a unified diff. No explanation.");

        full
    }
}
```

```rust
// src/anthropic.rs
use crate::response::LlmResponse;
use cfn_core::{CfnError, CfnResult};
use reqwest::Client;
use serde::{Deserialize, Serialize};

pub struct AnthropicClient {
    client: Client,
    api_key: String,
}

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<Message>,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
    usage: Usage,
}

#[derive(Deserialize)]
struct ContentBlock {
    text: String,
}

#[derive(Deserialize)]
struct Usage {
    input_tokens: u32,
    output_tokens: u32,
}

impl AnthropicClient {
    pub fn new(api_key: &str) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.to_string(),
        }
    }

    pub async fn complete(&self, model: &str, prompt: &str) -> CfnResult<LlmResponse> {
        let request = AnthropicRequest {
            model: model.to_string(),
            max_tokens: 4096,
            messages: vec![Message {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
        };

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| CfnError::LlmApi {
                provider: "anthropic".into(),
                message: e.to_string(),
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(CfnError::LlmApi {
                provider: "anthropic".into(),
                message: format!("{}: {}", status, text),
            });
        }

        let body: AnthropicResponse = response.json().await.map_err(|e| CfnError::LlmApi {
            provider: "anthropic".into(),
            message: e.to_string(),
        })?;

        let content = body
            .content
            .first()
            .map(|c| c.text.clone())
            .unwrap_or_default();

        // Calculate cost (Haiku: $0.25/M input, $1.25/M output)
        let cost_usd = (body.usage.input_tokens as f64 * 0.25
            + body.usage.output_tokens as f64 * 1.25)
            / 1_000_000.0;

        Ok(LlmResponse {
            content,
            tokens_in: body.usage.input_tokens,
            tokens_out: body.usage.output_tokens,
            cost_usd,
        })
    }
}
```

```rust
// src/response.rs
#[derive(Debug, Clone)]
pub struct LlmResponse {
    pub content: String,
    pub tokens_in: u32,
    pub tokens_out: u32,
    pub cost_usd: f64,
}
```

---

### 3.6 cfn-state

**Purpose:** Redis coordination, checkpointing, and distributed locks.

**Files:**
```
cfn-state/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── redis.rs         # Redis client wrapper
    ├── checkpoint.rs    # Task state checkpointing
    ├── lock.rs          # Distributed locks
    └── recovery.rs      # Crash recovery
```

**Key Implementation:**

```rust
// src/redis.rs
use cfn_core::{id::TaskId, CfnResult};
use redis::{aio::MultiplexedConnection, AsyncCommands, Client};
use std::time::Duration;

pub struct RedisState {
    conn: MultiplexedConnection,
}

impl RedisState {
    pub async fn new(url: &str) -> CfnResult<Self> {
        let client = Client::open(url)?;
        let conn = client.get_multiplexed_async_connection().await?;
        Ok(Self { conn })
    }

    pub async fn set_task_state(
        &mut self,
        task_id: &TaskId,
        state: &str,
        ttl: Duration,
    ) -> CfnResult<()> {
        let key = format!("cfn:task:{}:state", task_id);
        self.conn.set_ex(&key, state, ttl.as_secs() as u64).await?;
        Ok(())
    }

    pub async fn get_task_state(&mut self, task_id: &TaskId) -> CfnResult<Option<String>> {
        let key = format!("cfn:task:{}:state", task_id);
        let value: Option<String> = self.conn.get(&key).await?;
        Ok(value)
    }

    pub async fn publish_progress(
        &mut self,
        task_id: &TaskId,
        completed: usize,
        total: usize,
    ) -> CfnResult<()> {
        let channel = format!("cfn:task:{}:progress", task_id);
        let message = serde_json::json!({
            "completed": completed,
            "total": total,
            "timestamp": chrono::Utc::now().to_rfc3339()
        });
        self.conn.publish(&channel, message.to_string()).await?;
        Ok(())
    }

    pub async fn acquire_lock(
        &mut self,
        name: &str,
        ttl: Duration,
    ) -> CfnResult<bool> {
        let key = format!("cfn:lock:{}", name);
        let result: Option<bool> = redis::cmd("SET")
            .arg(&key)
            .arg("1")
            .arg("NX")
            .arg("EX")
            .arg(ttl.as_secs())
            .query_async(&mut self.conn)
            .await?;
        Ok(result.is_some())
    }

    pub async fn release_lock(&mut self, name: &str) -> CfnResult<()> {
        let key = format!("cfn:lock:{}", name);
        self.conn.del(&key).await?;
        Ok(())
    }
}
```

```rust
// src/checkpoint.rs
use cfn_core::{id::*, result::MicroTaskResult, task::MicroTask, CfnResult};
use crate::redis::RedisState;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCheckpoint {
    pub task_id: TaskId,
    pub completed_micro_tasks: Vec<MicroTaskId>,
    pub pending_micro_tasks: Vec<MicroTaskId>,
    pub results: Vec<MicroTaskResult>,
    pub total_cost_usd: f64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

pub struct Checkpointer {
    redis: RedisState,
    ttl: Duration,
}

impl Checkpointer {
    pub fn new(redis: RedisState, ttl: Duration) -> Self {
        Self { redis, ttl }
    }

    pub async fn save(&mut self, checkpoint: &TaskCheckpoint) -> CfnResult<()> {
        let json = serde_json::to_string(checkpoint)?;
        self.redis
            .set_task_state(&checkpoint.task_id, &json, self.ttl)
            .await
    }

    pub async fn load(&mut self, task_id: &TaskId) -> CfnResult<Option<TaskCheckpoint>> {
        let state = self.redis.get_task_state(task_id).await?;
        match state {
            Some(json) => Ok(Some(serde_json::from_str(&json)?)),
            None => Ok(None),
        }
    }

    pub async fn delete(&mut self, task_id: &TaskId) -> CfnResult<()> {
        self.redis.set_task_state(task_id, "", Duration::from_secs(1)).await
    }
}
```

---

### 3.7 cfn-metrics

**Purpose:** Metrics collection, Prometheus export, and eval scoring.

**Files:**
```
cfn-metrics/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── collector.rs     # Metrics aggregation
    ├── buffer.rs        # Ring buffer for recent metrics
    ├── export.rs        # Prometheus exporter
    ├── eval.rs          # Eval scoring
    └── db.rs            # Postgres persistence
```

**Key Implementation:**

```rust
// src/collector.rs
use cfn_core::{result::MicroTaskResult, tier::ModelTier};
use metrics::{counter, gauge, histogram};
use std::sync::Arc;
use tokio::sync::mpsc;

pub struct MetricsCollector {
    rx: mpsc::Receiver<MicroTaskResult>,
}

impl MetricsCollector {
    pub fn new(rx: mpsc::Receiver<MicroTaskResult>) -> Self {
        Self { rx }
    }

    pub async fn run(mut self) {
        while let Some(result) = self.rx.recv().await {
            self.record(&result);
        }
    }

    fn record(&self, result: &MicroTaskResult) {
        // Task outcome counter
        let outcome = if result.success { "success" } else { "failure" };
        counter!("cfn_tasks_total", "outcome" => outcome).increment(1);

        // Cost histogram
        histogram!("cfn_task_cost_usd").record(result.total_cost_usd);

        // Latency histogram
        histogram!("cfn_task_latency_ms").record(result.total_latency.as_millis() as f64);

        // Tier usage
        counter!(
            "cfn_tier_usage",
            "tier" => result.final_tier.to_string()
        ).increment(1);

        // Escalation count
        let escalations = result.attempts.len().saturating_sub(1);
        histogram!("cfn_escalations").record(escalations as f64);

        // Per-attempt metrics
        for attempt in &result.attempts {
            counter!(
                "cfn_attempts_total",
                "tier" => attempt.tier.to_string(),
                "outcome" => format!("{:?}", attempt.outcome)
            ).increment(1);

            histogram!(
                "cfn_attempt_latency_ms",
                "tier" => attempt.tier.to_string()
            ).record(attempt.latency.as_millis() as f64);

            histogram!(
                "cfn_attempt_cost_usd",
                "tier" => attempt.tier.to_string()
            ).record(attempt.cost_usd);
        }
    }
}
```

```rust
// src/eval.rs
use cfn_core::{profile::TaskProfile, result::MicroTaskResult};

#[derive(Debug, Clone)]
pub struct EvalConfig {
    pub speed_weight: f32,
    pub cost_weight: f32,
    pub accuracy_weight: f32,
    pub speed_target_ms: u64,
    pub cost_target_usd: f64,
}

impl From<&TaskProfile> for EvalConfig {
    fn from(profile: &TaskProfile) -> Self {
        Self {
            speed_weight: profile.speed_weight,
            cost_weight: profile.cost_weight,
            accuracy_weight: profile.accuracy_weight,
            speed_target_ms: profile.max_latency_ms,
            cost_target_usd: profile.max_cost_usd,
        }
    }
}

pub fn compute_eval_score(result: &MicroTaskResult, config: &EvalConfig) -> f64 {
    let mut score = 0.0;

    // Accuracy (binary: success = 1, failure = 0)
    let accuracy_score = if result.success { 1.0 } else { 0.0 };
    score += accuracy_score * config.accuracy_weight as f64;

    // Speed (0-1, lower latency = higher score)
    let latency_ms = result.total_latency.as_millis() as f64;
    let speed_score = (1.0 - (latency_ms / config.speed_target_ms as f64)).max(0.0).min(1.0);
    score += speed_score * config.speed_weight as f64;

    // Cost (0-1, lower cost = higher score)
    let cost_score = (1.0 - (result.total_cost_usd / config.cost_target_usd)).max(0.0).min(1.0);
    score += cost_score * config.cost_weight as f64;

    score
}

pub fn compute_batch_eval(results: &[MicroTaskResult], config: &EvalConfig) -> BatchEval {
    let scores: Vec<_> = results.iter().map(|r| compute_eval_score(r, config)).collect();

    let success_rate = results.iter().filter(|r| r.success).count() as f64 / results.len() as f64;
    let avg_score = scores.iter().sum::<f64>() / scores.len() as f64;
    let total_cost: f64 = results.iter().map(|r| r.total_cost_usd).sum();
    let avg_latency_ms = results.iter().map(|r| r.total_latency.as_millis()).sum::<u128>() / results.len() as u128;

    BatchEval {
        task_count: results.len(),
        success_rate,
        avg_eval_score: avg_score,
        total_cost_usd: total_cost,
        avg_latency_ms: avg_latency_ms as u64,
    }
}

#[derive(Debug, Clone)]
pub struct BatchEval {
    pub task_count: usize,
    pub success_rate: f64,
    pub avg_eval_score: f64,
    pub total_cost_usd: f64,
    pub avg_latency_ms: u64,
}
```

---

### 3.8 cfn-api

**Purpose:** gRPC and REST API for external access.

**Files:**
```
cfn-api/
├── Cargo.toml
├── proto/
│   └── cfn.proto
└── src/
    ├── lib.rs
    ├── grpc.rs          # gRPC server (tonic)
    ├── http.rs          # REST endpoints (axum)
    └── websocket.rs     # Real-time streaming
```

**Proto Definition:**

```protobuf
// proto/cfn.proto
syntax = "proto3";
package cfn.v1;

service CfnEngine {
  // Submit a new task for execution
  rpc SubmitTask(SubmitTaskRequest) returns (SubmitTaskResponse);

  // Get current task status
  rpc GetTaskStatus(GetTaskStatusRequest) returns (GetTaskStatusResponse);

  // Stream real-time progress updates
  rpc StreamProgress(StreamProgressRequest) returns (stream ProgressUpdate);

  // Cancel a running task
  rpc CancelTask(CancelTaskRequest) returns (CancelTaskResponse);

  // Get task result (after completion)
  rpc GetTaskResult(GetTaskResultRequest) returns (GetTaskResultResponse);

  // List all task definitions
  rpc ListTaskDefinitions(ListTaskDefinitionsRequest) returns (ListTaskDefinitionsResponse);
}

message SubmitTaskRequest {
  string task_type = 1;
  string description = 2;
  string profile = 3;
  map<string, string> context = 4;
  optional string callback_url = 5;
}

message SubmitTaskResponse {
  string task_id = 1;
  int32 estimated_micro_tasks = 2;
  string status = 3;
}

message GetTaskStatusRequest {
  string task_id = 1;
}

message GetTaskStatusResponse {
  string task_id = 1;
  string status = 2;  // pending, running, completed, failed, cancelled
  int32 completed_micro_tasks = 3;
  int32 total_micro_tasks = 4;
  int32 current_tier = 5;
  double cost_so_far_usd = 6;
  int64 elapsed_ms = 7;
}

message StreamProgressRequest {
  string task_id = 1;
}

message ProgressUpdate {
  string task_id = 1;
  string micro_task_id = 2;
  string status = 3;
  int32 completed = 4;
  int32 total = 5;
  int32 current_tier = 6;
  double cost_so_far_usd = 7;
  int64 elapsed_ms = 8;
  optional string message = 9;
}

message CancelTaskRequest {
  string task_id = 1;
}

message CancelTaskResponse {
  bool success = 1;
  string message = 2;
}

message GetTaskResultRequest {
  string task_id = 1;
}

message GetTaskResultResponse {
  string task_id = 1;
  bool success = 2;
  repeated MicroTaskResultProto micro_task_results = 3;
  double total_cost_usd = 4;
  int64 total_latency_ms = 5;
  optional string output = 6;
}

message MicroTaskResultProto {
  string micro_task_id = 1;
  bool success = 2;
  int32 final_tier = 3;
  double cost_usd = 4;
  int64 latency_ms = 5;
  optional string patch = 6;
}

message ListTaskDefinitionsRequest {}

message ListTaskDefinitionsResponse {
  repeated TaskDefinitionProto definitions = 1;
}

message TaskDefinitionProto {
  string id = 1;
  string task_type = 2;
  string profile = 3;
}
```

**REST API (axum):**

```rust
// src/http.rs
use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use cfn_core::id::TaskId;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub fn create_router(engine: Arc<Engine>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/api/v1/tasks", post(submit_task))
        .route("/api/v1/tasks/:task_id", get(get_task_status))
        .route("/api/v1/tasks/:task_id/result", get(get_task_result))
        .route("/api/v1/tasks/:task_id/cancel", post(cancel_task))
        .route("/api/v1/definitions", get(list_definitions))
        .route("/metrics", get(prometheus_metrics))
        .with_state(engine)
}

async fn health() -> &'static str {
    "OK"
}

async fn ready(State(engine): State<Arc<Engine>>) -> &'static str {
    if engine.is_ready() {
        "OK"
    } else {
        "NOT READY"
    }
}

#[derive(Deserialize)]
struct SubmitTaskRequest {
    task_type: String,
    description: String,
    profile: Option<String>,
    context: Option<HashMap<String, String>>,
}

#[derive(Serialize)]
struct SubmitTaskResponse {
    task_id: String,
    estimated_micro_tasks: usize,
    status: String,
}

async fn submit_task(
    State(engine): State<Arc<Engine>>,
    Json(req): Json<SubmitTaskRequest>,
) -> Json<SubmitTaskResponse> {
    let task_id = engine.submit(req).await;
    Json(SubmitTaskResponse {
        task_id: task_id.to_string(),
        estimated_micro_tasks: 0, // Filled after decomposition
        status: "pending".into(),
    })
}

// ... other handlers
```

---

## 4. Data Models

See Section 3 for complete type definitions in cfn-core.

---

## 5. API Specification

See Section 3.8 for gRPC proto and REST endpoints.

**Summary:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Liveness check |
| `/ready` | GET | Readiness check |
| `/api/v1/tasks` | POST | Submit new task |
| `/api/v1/tasks/:id` | GET | Get task status |
| `/api/v1/tasks/:id/result` | GET | Get task result |
| `/api/v1/tasks/:id/cancel` | POST | Cancel task |
| `/api/v1/definitions` | GET | List task definitions |
| `/metrics` | GET | Prometheus metrics |

**gRPC:** Same operations via `CfnEngine` service.

---

## 6. Database Schema

```sql
-- PostgreSQL schema for cfn-engine

-- Task execution history
CREATE TABLE task_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    profile TEXT NOT NULL,
    description TEXT,

    status TEXT NOT NULL,  -- pending, running, completed, failed, cancelled
    success BOOLEAN,

    micro_task_count INT NOT NULL DEFAULT 0,
    completed_micro_tasks INT NOT NULL DEFAULT 0,

    total_cost_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
    total_latency_ms BIGINT NOT NULL DEFAULT 0,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    metadata JSONB
);

CREATE INDEX idx_task_executions_task_id ON task_executions(task_id);
CREATE INDEX idx_task_executions_status ON task_executions(status);
CREATE INDEX idx_task_executions_created_at ON task_executions(created_at);

-- Micro-task execution records
CREATE TABLE micro_task_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_execution_id UUID NOT NULL REFERENCES task_executions(id),
    micro_task_id TEXT NOT NULL,

    success BOOLEAN NOT NULL,
    final_tier INT NOT NULL,

    total_cost_usd DECIMAL(10,6) NOT NULL,
    total_latency_ms BIGINT NOT NULL,

    attempts JSONB NOT NULL,  -- Array of attempt records

    output TEXT,
    patch TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_micro_task_executions_task ON micro_task_executions(task_execution_id);

-- Model tier performance stats
CREATE TABLE tier_stats (
    tier INT NOT NULL,
    task_type TEXT NOT NULL,
    profile TEXT NOT NULL,

    total_attempts BIGINT NOT NULL DEFAULT 0,
    success_count BIGINT NOT NULL DEFAULT 0,

    total_cost_usd DECIMAL(12,4) NOT NULL DEFAULT 0,
    total_latency_ms BIGINT NOT NULL DEFAULT 0,

    avg_tokens_in INT,
    avg_tokens_out INT,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (tier, task_type, profile)
);

-- Prompt variant tracking (for A/B testing)
CREATE TABLE prompt_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_hash TEXT UNIQUE NOT NULL,
    prompt_template TEXT NOT NULL,

    total_uses BIGINT NOT NULL DEFAULT 0,
    success_count BIGINT NOT NULL DEFAULT 0,

    avg_tier_used DECIMAL(3,2),
    avg_cost_usd DECIMAL(10,6),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retired_at TIMESTAMPTZ
);

CREATE INDEX idx_prompt_variants_active ON prompt_variants(is_active);

-- Goal pattern learning
CREATE TABLE goal_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern TEXT NOT NULL,
    keywords TEXT[],

    recommended_profile TEXT,
    recommended_start_tier INT,
    recommended_parallelism INT,

    sample_count INT NOT NULL DEFAULT 0,
    avg_success_rate DECIMAL(5,4),
    avg_latency_ms BIGINT,
    avg_cost_usd DECIMAL(10,6),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goal_patterns_keywords ON goal_patterns USING GIN(keywords);
```

---

## 7. Configuration System

### Environment Variables

```bash
# Required
CFN_ANTHROPIC_API_KEY=sk-ant-...
CFN_OPENAI_API_KEY=sk-...
CFN_REDIS_URL=redis://localhost:6379
CFN_DATABASE_URL=postgres://user:pass@localhost/cfn

# Optional
CFN_TASK_DIR=./tasks          # Task definition directory
CFN_PROFILE_DIR=./profiles    # Custom profile directory
CFN_WORKER_COUNT=10           # Worker pool size
CFN_GRPC_PORT=50051          # gRPC server port
CFN_HTTP_PORT=8080           # REST API port
CFN_LOG_LEVEL=info           # Logging level
CFN_METRICS_PORT=9090        # Prometheus metrics port
```

### Task Definition Example

```yaml
# tasks/coding.yaml
id: coding-task
task_type: coding
profile: balanced

validators:
  - name: lint
    command: "npm run lint -- {file}"
    timeout_ms: 10000
    required: true

  - name: typecheck
    command: "npm run typecheck"
    timeout_ms: 30000
    required: true

  - name: unit-tests
    command: "npm test -- --testPathPattern={file}"
    timeout_ms: 60000
    required: false

red_flags:
  - name: oversized-diff
    condition: "diff_lines > 100"
    severity: warning

  - name: syntax-error
    condition: "parse_error == true"
    severity: critical

  - name: unrelated-files
    condition: "touched_files - allowed_files > 0"
    severity: error

escalation:
  max_attempts_per_tier: 2
  triggers:
    - test_fail
    - red_flag
    - timeout
  skip_tiers: []

context:
  max_tokens: 8000
  include_patterns:
    - "*.ts"
    - "*.tsx"
  exclude_patterns:
    - "*.test.ts"
    - "node_modules/**"
```

---

## 8. LLM Provider Integration

### Supported Providers

| Provider | Models | Cost/1M tokens |
|----------|--------|----------------|
| Anthropic | claude-3-haiku, claude-sonnet-4, claude-3-opus | $0.25 - $15 |
| OpenAI | gpt-4.1-mini, gpt-4.1 | $0.40 - $2 |

### Rate Limiting

```rust
// Per-provider rate limits (requests/minute)
const ANTHROPIC_RPM: u32 = 1000;
const OPENAI_RPM: u32 = 500;

// Implemented via token bucket in cfn-llm
```

### Circuit Breaker Settings

```rust
// Default circuit breaker config
failure_threshold: 5,        // Open after 5 consecutive failures
recovery_timeout: 30s,       // Try again after 30 seconds
half_open_requests: 1,       // Allow 1 request in half-open state
```

---

## 9. Observability

### Prometheus Metrics

```
# Task metrics
cfn_tasks_total{outcome="success|failure"}
cfn_task_cost_usd (histogram)
cfn_task_latency_ms (histogram)
cfn_escalations (histogram)

# Tier metrics
cfn_tier_usage{tier="T1:Haiku|T2:Mini|..."}
cfn_attempts_total{tier, outcome}
cfn_attempt_latency_ms{tier} (histogram)
cfn_attempt_cost_usd{tier} (histogram)

# System metrics
cfn_queue_length{priority="high|normal|low"}
cfn_worker_active
cfn_circuit_breaker_state{provider}
```

### Logging

```rust
// Structured logging with tracing
tracing::info!(
    task_id = %task.id,
    tier = %tier,
    outcome = ?outcome,
    latency_ms = latency,
    cost_usd = cost,
    "Task attempt completed"
);
```

### Health Checks

- `/health` - Basic liveness (always returns 200 if process running)
- `/ready` - Readiness (returns 200 if Redis/Postgres connected, workers active)

---

## 10. Deployment

### Docker

```dockerfile
# Dockerfile
FROM rust:1.75-slim as builder

WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/cfn-engine /usr/local/bin/

EXPOSE 8080 50051 9090
CMD ["cfn-engine"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  cfn-engine:
    build: .
    ports:
      - "8080:8080"   # REST
      - "50051:50051" # gRPC
      - "9090:9090"   # Metrics
    environment:
      - CFN_REDIS_URL=redis://redis:6379
      - CFN_DATABASE_URL=postgres://cfn:cfn@postgres/cfn
      - CFN_ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - CFN_OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - redis
      - postgres
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '2'

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: cfn
      POSTGRES_PASSWORD: cfn
      POSTGRES_DB: cfn
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  redis-data:
  postgres-data:
```

### Kubernetes

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cfn-engine
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cfn-engine
  template:
    metadata:
      labels:
        app: cfn-engine
    spec:
      containers:
        - name: cfn-engine
          image: cfn-engine:latest
          ports:
            - containerPort: 8080
            - containerPort: 50051
            - containerPort: 9090
          resources:
            requests:
              memory: "256Mi"
              cpu: "500m"
            limits:
              memory: "512Mi"
              cpu: "2000m"
          env:
            - name: CFN_REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: cfn-secrets
                  key: redis-url
            - name: CFN_DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: cfn-secrets
                  key: database-url
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
```

---

## 11. Testing Strategy

### Unit Tests

```bash
# Run all unit tests
cargo test

# Run specific crate tests
cargo test -p cfn-core
cargo test -p cfn-executor
```

### Integration Tests

```bash
# Requires Redis and Postgres running
cargo test --test integration
```

### Load Tests

```bash
# Using k6
k6 run tests/load/submit_tasks.js

# Target: 1000 tasks/second sustained for 5 minutes
```

### Benchmark Suite

```rust
// benches/scheduler.rs
use criterion::{criterion_group, criterion_main, Criterion};

fn benchmark_queue(c: &mut Criterion) {
    c.bench_function("enqueue_dequeue_10k", |b| {
        b.iter(|| {
            let queue = PriorityTaskQueue::new();
            for i in 0..10_000 {
                queue.enqueue(create_test_task(i));
            }
            for _ in 0..10_000 {
                queue.dequeue();
            }
        })
    });
}

criterion_group!(benches, benchmark_queue);
criterion_main!(benches);
```

---

## 12. Migration Path

### Phase 1: Parallel Deployment

1. Deploy Rust engine alongside Node.js Trigger.dev
2. Route 5% of traffic to Rust engine
3. Compare metrics (latency, success rate, cost)

### Phase 2: Gradual Migration

1. Increase Rust traffic to 25%, 50%, 75%
2. Monitor for regressions
3. Keep Node.js as fallback

### Phase 3: Full Migration

1. Route 100% traffic to Rust
2. Deprecate Node.js deployment
3. Remove Trigger.dev dependency

### Rollback Plan

- Feature flag to route back to Node.js
- Maintain Node.js deployment for 30 days post-migration
- Database schema compatible with both systems

---

## 13. Implementation Schedule

### Week 1: Foundation
- [ ] Initialize workspace structure
- [ ] Implement cfn-core types
- [ ] Implement cfn-config loader
- [ ] Unit tests for core types

### Week 2: Scheduler
- [ ] Implement DAG
- [ ] Implement priority queue
- [ ] Implement scheduler loop
- [ ] Unit tests for scheduler

### Week 3-4: Executor
- [ ] Implement escalation FSM
- [ ] Implement worker pool
- [ ] Implement task runner
- [ ] Implement circuit breaker
- [ ] Implement red-flag detection
- [ ] Integration tests

### Week 5: LLM Integration
- [ ] Implement Anthropic client
- [ ] Implement OpenAI client
- [ ] Implement retry logic
- [ ] End-to-end tests with real APIs

### Week 6: State & Metrics
- [ ] Implement Redis state
- [ ] Implement checkpointing
- [ ] Implement metrics collector
- [ ] Implement Prometheus exporter
- [ ] Database schema migration

### Week 7: API Layer
- [ ] Implement gRPC server
- [ ] Implement REST API
- [ ] Implement WebSocket streaming
- [ ] API integration tests

### Week 8: Integration & Deployment
- [ ] CFN Loop integration
- [ ] Docker build
- [ ] Kubernetes manifests
- [ ] Load testing
- [ ] Documentation

---

## Appendix A: Cargo Workspace

```toml
# Cargo.toml (root)
[workspace]
resolver = "2"
members = [
    "crates/cfn-core",
    "crates/cfn-config",
    "crates/cfn-scheduler",
    "crates/cfn-executor",
    "crates/cfn-llm",
    "crates/cfn-state",
    "crates/cfn-metrics",
    "crates/cfn-api",
]

[workspace.package]
version = "0.1.0"
edition = "2021"
authors = ["CFN Team"]
license = "Apache-2.0"

[workspace.dependencies]
# Async runtime
tokio = { version = "1.35", features = ["full"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
serde_yaml = "0.9"

# Database
redis = { version = "0.24", features = ["tokio-comp"] }
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio", "uuid", "chrono"] }

# HTTP/gRPC
axum = "0.7"
tonic = "0.10"
prost = "0.12"
reqwest = { version = "0.11", features = ["json"] }

# Concurrency
crossbeam = "0.8"
dashmap = "5.5"

# Observability
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
metrics = "0.22"
metrics-exporter-prometheus = "0.13"

# Error handling
thiserror = "1.0"
anyhow = "1.0"

# Utilities
uuid = { version = "1.6", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
once_cell = "1.19"

# Testing
criterion = "0.5"

[profile.release]
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

---

## Appendix B: Example Client Usage

### Rust Client

```rust
use cfn_client::CfnClient;

#[tokio::main]
async fn main() {
    let client = CfnClient::connect("http://localhost:50051").await?;

    let task_id = client.submit_task(
        "coding-task",
        "Add null check to user validation",
        "balanced",
        HashMap::new(),
    ).await?;

    println!("Submitted task: {}", task_id);

    // Stream progress
    let mut stream = client.stream_progress(&task_id).await?;
    while let Some(update) = stream.next().await {
        println!("Progress: {}/{}", update.completed, update.total);
    }

    // Get result
    let result = client.get_result(&task_id).await?;
    println!("Success: {}, Cost: ${:.4}", result.success, result.total_cost_usd);
}
```

### Python Client

```python
import grpc
from cfn_pb2 import SubmitTaskRequest
from cfn_pb2_grpc import CfnEngineStub

channel = grpc.insecure_channel('localhost:50051')
client = CfnEngineStub(channel)

response = client.SubmitTask(SubmitTaskRequest(
    task_type="coding-task",
    description="Add null check to user validation",
    profile="balanced",
))

print(f"Task ID: {response.task_id}")
```

### cURL (REST)

```bash
# Submit task
curl -X POST http://localhost:8080/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "task_type": "coding-task",
    "description": "Add null check to user validation",
    "profile": "balanced"
  }'

# Get status
curl http://localhost:8080/api/v1/tasks/task_abc123

# Get result
curl http://localhost:8080/api/v1/tasks/task_abc123/result
```

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| MDAP | Massively Decomposed Agentic Processes |
| Micro-task | Single atomic unit of work (one LLM call) |
| Tier | Model capability level (T1-T5) |
| Profile | Execution strategy (realtime, balanced, budget, critical) |
| Escalation | Moving to higher tier after failure |
| Red-flag | Early detection of likely-bad output |
| Circuit breaker | Fail-fast mechanism for unhealthy providers |
| DAG | Directed Acyclic Graph (task dependencies) |
