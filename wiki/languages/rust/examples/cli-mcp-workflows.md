# CLI and MCP Workflow Examples with Claude-Flow

This guide demonstrates practical CLI commands and MCP (Model Context Protocol) tool usage for Rust development with claude-flow, showcasing real toolchain integration and agent coordination workflows.

## 🎯 Overview

This document provides hands-on examples of:
- CLI commands for Rust development with claude-flow
- MCP tool usage for swarm coordination
- Agent spawning and task orchestration
- Real-world development workflows
- Performance monitoring and validation

## 🚀 Basic CLI Workflows

### 1. Project Initialization and Setup

```bash
# Initialize a new Rust project with claude-flow
npx claude-flow-novice sparc run architect "Create a CLI tool for file processing with async I/O"

# This command spawns multiple agents:
# - API Architect: Designs the CLI interface and command structure
# - Systems Engineer: Implements file I/O and async processing
# - Performance Engineer: Optimizes for speed and memory usage
# - Testing Engineer: Creates comprehensive test suite
```

**Generated CLI Structure:**
```bash
# The agents create a complete CLI project structure
file-processor-cli/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── cli/
│   │   ├── mod.rs
│   │   ├── args.rs
│   │   └── commands.rs
│   ├── processor/
│   │   ├── mod.rs
│   │   ├── async_processor.rs
│   │   └── batch_processor.rs
│   ├── utils/
│   │   ├── mod.rs
│   │   ├── progress.rs
│   │   └── validation.rs
│   └── error.rs
├── tests/
│   ├── integration/
│   └── unit/
└── benches/
    └── processing_benchmarks.rs
```

### 2. Quality Validation Workflows

```bash
# Run comprehensive Rust quality validation
npx claude-flow-novice validate rust ./my-rust-project

# This executes real Cargo commands:
# cargo clippy --all-targets --all-features -- --deny warnings
# cargo fmt --check
# cargo audit
# cargo test --all
# cargo doc --no-deps

# Output shows detailed quality metrics:
# ✅ Clippy: 0 warnings, 0 errors
# ✅ Formatting: All files properly formatted
# ⚠️  Security: 1 advisory found (non-critical)
# ✅ Tests: 47 tests passed
# 📊 Overall Quality Score: 9.2/10
```

### 3. Advanced Quality Configuration

```bash
# Run validation with custom configuration
npx claude-flow-novice validate rust ./project --config rust-quality-config.json

# Custom quality configuration file:
cat > rust-quality-config.json << 'EOF'
{
  "minimumQuality": 8.5,
  "clippyConfig": {
    "maxWarnings": 0,
    "maxErrors": 0,
    "deniedLints": [
      "clippy::unwrap_used",
      "clippy::expect_used",
      "clippy::panic",
      "clippy::todo"
    ]
  },
  "securityConfig": {
    "allowVulnerabilities": false,
    "maxHighSeverity": 0,
    "maxMediumSeverity": 0
  },
  "complexityConfig": {
    "maxAverageComplexity": 10.0,
    "maxFunctionComplexity": 15.0
  },
  "documentationConfig": {
    "minimumCoverage": 0.9,
    "requirePublicDocs": true
  }
}
EOF

npx claude-flow-novice validate rust ./project --config rust-quality-config.json
```

### 4. Performance Optimization Workflows

```bash
# Run performance analysis and optimization
npx claude-flow-novice optimize rust ./project --target release

# This spawns performance-focused agents:
Task("Performance Analyzer", "Profile and identify bottlenecks", "performance-optimizer")
Task("Memory Optimizer", "Optimize memory allocation patterns", "memory-specialist")
Task("Compilation Optimizer", "Reduce build times and binary size", "build-engineer")

# Output includes:
# 🔍 Performance Analysis:
#   - Compilation time: 45.2s → 23.1s (-49%)
#   - Binary size: 8.2MB → 3.4MB (-58%)
#   - Hot path optimizations: 7 applied
#   - Memory allocations reduced: 23%
```

### 5. Testing and Benchmarking

```bash
# Run comprehensive testing workflow
npx claude-flow-novice test rust ./project --comprehensive

# This includes:
# - Unit tests with coverage analysis
# - Integration tests
# - Property-based testing
# - Performance benchmarks
# - Memory leak detection

# Example output:
# 🧪 Test Results:
#   Unit Tests: 156 passed, 0 failed
#   Integration Tests: 23 passed, 0 failed
#   Coverage: 94.2%
#   Benchmarks: All within performance targets
#   Memory: No leaks detected

# Run specific benchmark suites
npx claude-flow-novice bench rust ./project --suite api-performance
```

## 🤖 MCP Tool Integration

### 1. Swarm Initialization and Coordination

```javascript
// Initialize a Rust development swarm
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  maxAgents: 8,
  strategy: "performance-first"
})

// Response:
{
  "swarmId": "rust-dev-swarm-abc123",
  "topology": "hierarchical",
  "maxAgents": 8,
  "status": "initialized",
  "coordinator": "systems-architect",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 2. Specialized Agent Spawning

```javascript
// Spawn Rust-specific agents for different tasks
mcp__claude-flow__agent_spawn({
  type: "systems-dev",
  name: "rust-systems-engineer",
  capabilities: ["async-programming", "memory-safety", "performance-optimization"]
})

mcp__claude-flow__agent_spawn({
  type: "performance-optimizer",
  name: "rust-performance-engineer",
  capabilities: ["profiling", "benchmarking", "optimization"]
})

mcp__claude-flow__agent_spawn({
  type: "security-manager",
  name: "rust-security-auditor",
  capabilities: ["memory-safety", "crypto-validation", "audit-analysis"]
})

// Agents coordinate automatically through the swarm
```

### 3. Task Orchestration

```javascript
// Orchestrate complex Rust development tasks
mcp__claude-flow__task_orchestrate({
  task: "Build high-performance web service with Axum, PostgreSQL, and real-time features",
  strategy: "parallel",
  priority: "high",
  maxAgents: 6
})

// Response includes task breakdown:
{
  "taskId": "rust-web-service-task-def456",
  "strategy": "parallel",
  "assignedAgents": [
    "rust-web-architect",
    "rust-database-engineer",
    "rust-auth-specialist",
    "rust-websocket-engineer",
    "rust-performance-optimizer",
    "rust-test-engineer"
  ],
  "estimatedDuration": "2-3 hours",
  "milestones": [
    "Database schema design",
    "Authentication implementation",
    "Core API endpoints",
    "WebSocket integration",
    "Performance optimization",
    "Comprehensive testing"
  ]
}
```

### 4. Real-Time Monitoring

```javascript
// Monitor swarm activity and progress
mcp__claude-flow__swarm_monitor({
  swarmId: "rust-dev-swarm-abc123",
  interval: 30,
  duration: 300
})

// Live updates every 30 seconds:
{
  "timestamp": "2024-01-15T10:45:30Z",
  "activeAgents": 6,
  "tasksInProgress": 3,
  "tasksCompleted": 12,
  "performance": {
    "avgTaskCompletionTime": "18.5 minutes",
    "successRate": 0.96,
    "resourceUtilization": 0.78
  },
  "currentActivities": [
    {
      "agent": "rust-systems-engineer",
      "task": "Implementing async request handlers",
      "progress": 0.75,
      "eta": "8 minutes"
    },
    {
      "agent": "rust-test-engineer",
      "task": "Writing integration tests",
      "progress": 0.45,
      "eta": "15 minutes"
    }
  ]
}
```

### 5. Memory and Performance Tracking

```javascript
// Track memory usage and performance metrics
mcp__claude-flow__memory_usage({
  detail: "by-agent"
})

// Response:
{
  "totalMemoryUsage": "2.4 GB",
  "breakdown": {
    "rust-systems-engineer": {
      "memory": "512 MB",
      "tasks": 8,
      "avgMemoryPerTask": "64 MB"
    },
    "rust-performance-optimizer": {
      "memory": "384 MB",
      "tasks": 5,
      "avgMemoryPerTask": "76.8 MB"
    }
  },
  "efficiency": {
    "memoryEfficiency": 0.89,
    "taskThroughput": "2.3 tasks/minute",
    "resourceWaste": "< 5%"
  }
}

// Get neural performance patterns
mcp__claude-flow__neural_patterns({
  pattern: "performance",
  action: "analyze"
})
```

## 🔧 Practical Development Workflows

### 1. Full-Stack Rust Web Service

```bash
# Complete workflow for building a web service
echo "🚀 Building Rust Web Service with Claude-Flow"

# Step 1: Initialize project with MCP coordination
npx claude-flow-novice mcp init-swarm --topology mesh --agents 8

# Step 2: Orchestrate the build process
npx claude-flow-novice mcp orchestrate "Build REST API with Axum, JWT auth, PostgreSQL, Redis caching, and WebSocket support"

# Step 3: Monitor progress
npx claude-flow-novice mcp monitor --real-time

# Step 4: Validate quality throughout development
npx claude-flow-novice validate rust . --continuous

# Step 5: Run performance benchmarks
npx claude-flow-novice bench rust . --load-test --concurrent-users 1000

# Step 6: Generate deployment configuration
npx claude-flow-novice deploy rust . --target kubernetes --with-monitoring
```

### 2. CLI Tool Development Workflow

```bash
# Specialized workflow for CLI tool development
echo "🛠️ Building High-Performance CLI Tool"

# Initialize with CLI-focused agents
npx claude-flow-novice sparc run cli-architect "Create a parallel file processing CLI with progress bars and async I/O"

# This automatically:
# ✅ Sets up clap for argument parsing
# ✅ Implements async file processing with tokio
# ✅ Adds progress bars with indicatif
# ✅ Creates comprehensive error handling
# ✅ Includes shell completion generation
# ✅ Adds man page generation
# ✅ Sets up cross-platform builds

# Validate CLI-specific quality metrics
npx claude-flow-novice validate rust . --cli-mode

# Test CLI functionality
npx claude-flow-novice test rust . --cli-integration

# Performance test with large datasets
npx claude-flow-novice bench rust . --cli-performance --dataset-size 1GB
```

### 3. WebAssembly Development Workflow

```bash
# WASM-focused development workflow
echo "🌐 Building WebAssembly Module with Rust"

# Initialize WASM project
npx claude-flow-novice sparc run wasm-architect "Create WebAssembly module for image processing with JS bindings"

# Agents automatically configure:
# ✅ wasm-pack integration
# ✅ web-sys and js-sys bindings
# ✅ Optimized build profiles
# ✅ JavaScript type definitions
# ✅ Browser compatibility testing

# Build and optimize WASM module
npx claude-flow-novice build rust . --target wasm32-unknown-unknown --optimize-size

# Validate WASM-specific metrics
npx claude-flow-novice validate rust . --wasm-mode

# Test in browser environment
npx claude-flow-novice test rust . --wasm-browser --headless
```

### 4. Systems Programming Workflow

```bash
# Low-level systems programming workflow
echo "⚡ Building High-Performance Systems Component"

# Initialize with systems-focused agents
npx claude-flow-novice sparc run systems-architect "Create async TCP proxy with load balancing and zero-copy networking"

# This creates:
# ✅ Lock-free data structures
# ✅ Memory pool allocators
# ✅ Zero-copy network operations
# ✅ SIMD optimizations where applicable
# ✅ Comprehensive performance monitoring
# ✅ Real-time metrics collection

# Validate systems programming best practices
npx claude-flow-novice validate rust . --systems-mode --unsafe-audit

# Performance profiling with perf integration
npx claude-flow-novice profile rust . --perf-integration --flame-graph

# Stress testing under load
npx claude-flow-novice test rust . --stress-test --duration 300s
```

## 📊 Advanced MCP Workflows

### 1. Neural Pattern Training

```javascript
// Train neural patterns for Rust development optimization
mcp__claude-flow__neural_train({
  pattern_type: "optimization",
  training_data: "rust-performance-patterns",
  epochs: 50
})

// Monitor training progress
mcp__claude-flow__neural_status({})

// Apply learned patterns
mcp__claude-flow__neural_patterns({
  action: "predict",
  operation: "code-optimization",
  metadata: {
    "language": "rust",
    "domain": "web-services",
    "performance_target": "high-throughput"
  }
})
```

### 2. Autonomous Agent Coordination

```javascript
// Create autonomous agents with learning capabilities
mcp__claude-flow__daa_agent_create({
  id: "rust-expert-agent",
  cognitivePattern: "systems",
  enableMemory: true,
  learningRate: 0.1,
  capabilities: [
    "rust-development",
    "performance-optimization",
    "memory-safety-analysis",
    "async-programming"
  ]
})

// Enable agent adaptation based on performance
mcp__claude-flow__daa_agent_adapt({
  agentId: "rust-expert-agent",
  feedback: "Excellent performance optimization results",
  performanceScore: 0.95,
  suggestions: [
    "Continue focus on memory optimization",
    "Expand SIMD optimization knowledge",
    "Develop more async patterns"
  ]
})
```

### 3. Knowledge Sharing Between Agents

```javascript
// Share Rust expertise between agents
mcp__claude-flow__daa_knowledge_share({
  sourceAgentId: "rust-performance-expert",
  targetAgentIds: ["rust-web-developer", "rust-cli-developer"],
  knowledgeDomain: "performance-optimization",
  knowledgeContent: {
    "techniques": [
      "Zero-allocation string processing",
      "Efficient async stream processing",
      "Memory pool usage patterns",
      "SIMD vectorization strategies"
    ],
    "patterns": [
      "Type-state machines for compile-time safety",
      "Generic programming with trait bounds",
      "Fearless concurrency patterns"
    ],
    "tools": [
      "perf profiling integration",
      "Criterion benchmarking",
      "Memory sanitizer usage"
    ]
  }
})
```

### 4. Workflow Automation

```javascript
// Create automated Rust development workflow
mcp__claude-flow__workflow_create({
  name: "rust-production-deployment",
  steps: [
    {
      "name": "quality-validation",
      "agent": "rust-quality-engineer",
      "action": "validate-comprehensive",
      "requirements": ["clippy-clean", "formatted", "tested", "documented"]
    },
    {
      "name": "security-audit",
      "agent": "rust-security-auditor",
      "action": "audit-dependencies",
      "requirements": ["no-high-vulnerabilities", "licenses-compatible"]
    },
    {
      "name": "performance-testing",
      "agent": "rust-performance-engineer",
      "action": "benchmark-regression",
      "requirements": ["no-performance-regression", "memory-efficient"]
    },
    {
      "name": "container-build",
      "agent": "rust-devops-engineer",
      "action": "build-optimized-container",
      "requirements": ["minimal-size", "security-hardened"]
    },
    {
      "name": "deployment",
      "agent": "rust-deployment-manager",
      "action": "deploy-with-monitoring",
      "requirements": ["health-checks", "metrics-enabled", "logging-configured"]
    }
  ],
  triggers: ["git-push-main", "scheduled-daily"]
})

// Execute the workflow
mcp__claude-flow__workflow_execute({
  workflowId: "rust-production-deployment",
  params: {
    "target_environment": "production",
    "enable_canary": true,
    "rollback_threshold": 0.05
  }
})
```

## 🚀 Complete Example: E-Commerce Microservice

### CLI Commands Sequence

```bash
#!/bin/bash
echo "🛍️ Building E-Commerce Microservice with Claude-Flow"

# Initialize swarm for complex project
npx claude-flow-novice mcp init --topology hierarchical --max-agents 12

# Orchestrate microservice development
npx claude-flow-novice mcp orchestrate \
  "Build e-commerce microservice with product catalog, inventory management, order processing, payment integration, and real-time analytics" \
  --strategy adaptive \
  --priority critical

# Monitor development progress
npx claude-flow-novice mcp monitor --dashboard --port 3001 &

# Continuous quality validation
npx claude-flow-novice validate rust . --watch --quality-gate 9.0 &

# Performance monitoring
npx claude-flow-novice perf rust . --continuous --alerts &

# Wait for core development completion
npx claude-flow-novice mcp wait-for-completion --timeout 7200 # 2 hours

echo "✅ Core development completed"

# Run comprehensive testing
npx claude-flow-novice test rust . \
  --unit \
  --integration \
  --load-test \
  --security-scan \
  --performance-regression

# Generate deployment artifacts
npx claude-flow-novice deploy rust . \
  --target kubernetes \
  --with-monitoring \
  --with-tracing \
  --with-metrics \
  --security-hardened

echo "🚀 E-commerce microservice ready for deployment!"
```

### MCP Coordination Script

```javascript
// complex-microservice-coordination.js
const coordination = {
  // Initialize specialized swarm
  async initializeSwarm() {
    const swarm = await mcp__claude-flow__swarm_init({
      topology: "hierarchical",
      maxAgents: 12,
      strategy: "domain-specialized"
    });

    // Spawn domain-specific agents
    const agents = await Promise.all([
      mcp__claude-flow__agent_spawn({
        type: "systems-architect",
        name: "microservice-architect",
        capabilities: ["microservice-design", "api-gateway", "service-mesh"]
      }),
      mcp__claude-flow__agent_spawn({
        type: "database-engineer",
        name: "data-architect",
        capabilities: ["postgresql", "redis", "event-sourcing"]
      }),
      mcp__claude-flow__agent_spawn({
        type: "api-developer",
        name: "catalog-service-dev",
        capabilities: ["rest-api", "graphql", "search-optimization"]
      }),
      mcp__claude-flow__agent_spawn({
        type: "api-developer",
        name: "inventory-service-dev",
        capabilities: ["real-time-updates", "stock-management", "webhooks"]
      }),
      mcp__claude-flow__agent_spawn({
        type: "api-developer",
        name: "order-service-dev",
        capabilities: ["order-processing", "state-machines", "saga-pattern"]
      }),
      mcp__claude-flow__agent_spawn({
        type: "integration-engineer",
        name: "payment-integration-dev",
        capabilities: ["payment-processing", "pci-compliance", "fraud-detection"]
      }),
      mcp__claude-flow__agent_spawn({
        type: "data-engineer",
        name: "analytics-dev",
        capabilities: ["real-time-analytics", "time-series", "reporting"]
      }),
      mcp__claude-flow__agent_spawn({
        type: "performance-optimizer",
        name: "performance-engineer",
        capabilities: ["load-balancing", "caching", "optimization"]
      }),
      mcp__claude-flow__agent_spawn({
        type: "security-manager",
        name: "security-engineer",
        capabilities: ["oauth2", "jwt", "rate-limiting", "audit-logging"]
      }),
      mcp__claude-flow__agent_spawn({
        type: "test-engineer",
        name: "qa-engineer",
        capabilities: ["microservice-testing", "contract-testing", "chaos-engineering"]
      }),
      mcp__claude-flow__agent_spawn({
        type: "devops-engineer",
        name: "deployment-engineer",
        capabilities: ["kubernetes", "helm", "monitoring", "observability"]
      }),
      mcp__claude-flow__agent_spawn({
        type: "documentation-engineer",
        name: "docs-engineer",
        capabilities: ["api-documentation", "openapi", "user-guides"]
      })
    ]);

    return { swarm, agents };
  },

  // Orchestrate complex task workflow
  async orchestrateWorkflow() {
    const tasks = [
      {
        name: "architecture-design",
        description: "Design microservice architecture with proper boundaries",
        assignedAgent: "microservice-architect",
        dependencies: [],
        estimatedDuration: "2 hours"
      },
      {
        name: "database-design",
        description: "Design database schemas and data flow",
        assignedAgent: "data-architect",
        dependencies: ["architecture-design"],
        estimatedDuration: "1.5 hours"
      },
      {
        name: "product-catalog-service",
        description: "Implement product catalog with search capabilities",
        assignedAgent: "catalog-service-dev",
        dependencies: ["database-design"],
        estimatedDuration: "4 hours"
      },
      {
        name: "inventory-management-service",
        description: "Build inventory tracking with real-time updates",
        assignedAgent: "inventory-service-dev",
        dependencies: ["database-design"],
        estimatedDuration: "3.5 hours"
      },
      {
        name: "order-processing-service",
        description: "Implement order workflow with state management",
        assignedAgent: "order-service-dev",
        dependencies: ["product-catalog-service", "inventory-management-service"],
        estimatedDuration: "5 hours"
      },
      {
        name: "payment-integration",
        description: "Integrate payment processing with security compliance",
        assignedAgent: "payment-integration-dev",
        dependencies: ["order-processing-service"],
        estimatedDuration: "3 hours"
      },
      {
        name: "analytics-service",
        description: "Build real-time analytics and reporting",
        assignedAgent: "analytics-dev",
        dependencies: ["order-processing-service"],
        estimatedDuration: "4 hours"
      },
      {
        name: "performance-optimization",
        description: "Optimize performance and implement caching",
        assignedAgent: "performance-engineer",
        dependencies: ["payment-integration", "analytics-service"],
        estimatedDuration: "2 hours"
      },
      {
        name: "security-implementation",
        description: "Implement authentication, authorization, and security",
        assignedAgent: "security-engineer",
        dependencies: ["architecture-design"],
        estimatedDuration: "3 hours"
      },
      {
        name: "comprehensive-testing",
        description: "Create test suites and chaos engineering",
        assignedAgent: "qa-engineer",
        dependencies: ["performance-optimization", "security-implementation"],
        estimatedDuration: "4 hours"
      },
      {
        name: "deployment-configuration",
        description: "Configure Kubernetes deployment with monitoring",
        assignedAgent: "deployment-engineer",
        dependencies: ["comprehensive-testing"],
        estimatedDuration: "2.5 hours"
      },
      {
        name: "documentation",
        description: "Generate API docs and deployment guides",
        assignedAgent: "docs-engineer",
        dependencies: ["deployment-configuration"],
        estimatedDuration: "2 hours"
      }
    ];

    const orchestration = await mcp__claude-flow__task_orchestrate({
      task: "E-commerce microservice development",
      strategy: "adaptive",
      priority: "critical",
      maxAgents: 12,
      workflow: tasks
    });

    return orchestration;
  },

  // Monitor and report progress
  async monitorProgress(orchestrationId) {
    const monitoring = setInterval(async () => {
      const status = await mcp__claude-flow__task_status({
        taskId: orchestrationId,
        detailed: true
      });

      console.log(`📊 Progress Update: ${status.completionPercentage}%`);
      console.log(`⏱️  Estimated remaining: ${status.estimatedTimeRemaining}`);
      console.log(`🔧 Active tasks: ${status.activeTasks.length}`);

      if (status.completionPercentage >= 100) {
        clearInterval(monitoring);
        console.log("🎉 Microservice development completed!");

        const results = await mcp__claude-flow__task_results({
          taskId: orchestrationId,
          format: "detailed"
        });

        console.log("📋 Final Results:", results);
      }
    }, 30000); // Update every 30 seconds

    return monitoring;
  }
};

// Execute the coordination
(async () => {
  try {
    console.log("🚀 Starting e-commerce microservice development...");

    const { swarm, agents } = await coordination.initializeSwarm();
    console.log(`✅ Swarm initialized with ${agents.length} agents`);

    const orchestration = await coordination.orchestrateWorkflow();
    console.log(`✅ Workflow orchestrated: ${orchestration.taskId}`);

    const monitoring = await coordination.monitorProgress(orchestration.taskId);
    console.log("✅ Monitoring started");

  } catch (error) {
    console.error("❌ Error in coordination:", error);
  }
})();
```

This comprehensive guide demonstrates how claude-flow's CLI commands and MCP tools work together to provide powerful Rust development workflows with real toolchain integration and intelligent agent coordination.

## 🔗 Related Resources

- [Cargo Integration](../setup/cargo-integration.md) - Deep Cargo workflow integration
- [Quality Validation](../testing/quality-validation.md) - Comprehensive quality assurance
- [REST API Example](./rest-api.md) - Complete web service implementation
- [Systems Programming](../workflows/systems-programming.md) - Advanced systems development