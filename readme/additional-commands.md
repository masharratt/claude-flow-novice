# Additional Commands Reference

This document contains specialized and infrequently-used commands that are available in claude-flow-novice but not needed for daily workflows.

For core commands used in typical development workflows, see `CLAUDE.md` Section 8.

---

## Development Utilities

### Component Template Generator

**Purpose**: Generate TypeScript components with proper types and tests

**Usage**:
```bash
npm run create:component <ComponentName> <directory>
```

**Generated Files**:
- `<directory>/<ComponentName>.ts` - Implementation with TypeScript interfaces
- `<directory>/<ComponentName>.test.ts` - Jest test template
- `<directory>/types.ts` - Type definitions (if doesn't exist)
- `<directory>/index.ts` - Barrel export

**Examples**:
```bash
# Create SwarmCoordinator in src/coordination
npm run create:component SwarmCoordinator src/coordination

# Create TaskValidator in src/validation
npm run create:component TaskValidator src/validation

# Create RedisClient in src/services
npm run create:component RedisClient src/services
```

**Template Features**:
- PascalCase validation
- TypeScript interfaces exported
- Lifecycle methods (initialize, execute, cleanup)
- Basic test structure with beforeEach/afterEach
- Automatic barrel export updates

---

## Testing & Validation

### /hello-world-tests [--layer=0|1|2|3|all] [--skip-validation]

**Purpose**: Run comprehensive CFN coordination validation suite

**Validates**:
- Layer 0: Agent tooling (15 agents × 7 tools)
- Layer 1: Mesh coordination + SQLite persistence
- Layer 2: Review handoff + dynamic scaling
- Layer 3: Error handling + retry logic

**Usage**:
```bash
# Run all layers
/hello-world-tests

# Run specific layer
/hello-world-tests --layer=0

# Run multiple layers
/hello-world-tests --layer=0,1
```

**Output**: Combined JSON report with SQLite metrics, agent counts, success rates

---

## Memory Management & System Monitoring

### Memory Monitoring System

**Intelligent memory monitoring with leak detection and process-specific thresholds:**

```bash
# Start unified memory monitoring
/node scripts/unified-memory-monitor.js

# Monitor specific process
/node scripts/unified-memory-monitor.js --pid 12345

# Enhanced process management with leak detection
/./scripts/enhanced-memory-spiral-killer.sh

# Validate cross-project synchronization
/./scripts/validate-memory-monitoring.sh
```

**Features**:
- Process-specific thresholds (CFN coordinators: 2-3GB, Rust: 2GB, cargo: 3GB)
- Intelligent leak detection vs temporary spikes
- 30-sample rolling window growth analysis
- Graceful shutdown (30s SIGTERM → SIGKILL)
- Cross-project configuration synchronization

### System Resource Management

```bash
# Monitor system resources
/memory-monitor --interval 5000 --duration 300000

# Validate memory configuration
/memory-validate

# Check memory leak detection status
/memory-monitor --log-file ./memory-debug.log --disable-leak-detection
```

---

## Fullstack Development

**Launch coordinated fullstack teams with frontend, backend, and database specialists:**

```bash
# Launch fullstack team
/fullstack "Build e-commerce platform"

# Add specific functionality
/fullstack:develop "Add user authentication"

# Check swarm status
/fullstack:status

# Clean shutdown with state preservation
/fullstack:terminate

# Dynamically add specialist
/fullstack:spawn "backend developer"
```

---

## SPARC Methodology

**Systematic specification, architecture, refinement, and completion workflows:**

```bash
# Analysis phase
/sparc analysis "Database performance issues"

# Design phase
/sparc design "Microservices architecture"

# Refinement phase
/sparc refine "API optimization"
```

---

## Hybrid Routing (Cost-Optimized Worker Spawning)

**Spawn specialized Claude agents with 97% cost savings via z.ai provider:**

### Three Agent Selection Modes

**1. Automatic Selection (keyword-based matching)**
```bash
# System selects best agents based on task keywords
node src/cli/hybrid-routing/spawn-workers.js "Build auth system" --max-agents=3
# → Automatically assigns: coder, security-specialist, tester
```

**2. Coordinator Override (manual agent types)**
```bash
# Coordinator specifies exact agent types
node src/cli/hybrid-routing/spawn-workers.js "Refactor API" \
  --max-agents=3 \
  --agents=architect,coder,reviewer
# → Forces workflow: design → implement → review
```

**3. Full Override (custom agents + subtasks)**
```bash
# Complete control over agents and instructions
node src/cli/hybrid-routing/spawn-workers.js "OAuth2 security" \
  --max-agents=2 \
  --agents=coder,security-specialist \
  --subtasks="Implement OAuth2 with PKCE|Audit token security"
# → Custom specialized instructions per agent
```

### Dynamic Agent Discovery

**50+ specialized agents** dynamically discovered from `.claude/agents/` folder across **16 categories**:

- analysis, architecture, cfn-loop, consensus, core-agents, development, devops, documentation, goal, planning-team, security, sparc, specialized, swarm, testing, and more

**Agent discovery capabilities:**
```bash
# Regenerate agent documentation (slash command)
/list-agents-rebuild

# List all available agents
node src/cli/hybrid-routing/spawn-workers.js --list-agents

# List agents by category
node src/cli/hybrid-routing/spawn-workers.js --agents-by-category
```

**Agent selection:**
- Recursive scanning with category preservation
- In-memory caching for performance
- Whitelist/blacklist support
- Lazy loading of agent definitions

### Cost Comparison

```
z.ai provider:    $0.50/1M tokens (input + output)
Claude direct:    $3.00/1M input, $15.00/1M output
Savings:          97% on typical workloads
```

### Features

- Real Claude API calls (Anthropic/z.ai providers)
- Bash execution capability (npm, git, file operations)
- Redis pub/sub coordination
- SQLite memory storage
- Token tracking and cost reporting
- Web portal integration (Socket.IO events)
- Automatic retry on 502 errors (3 attempts)
- 30-minute timeout for complex tasks

### Programmatic Usage

```javascript
import { HybridWorkerSpawner } from './src/cli/hybrid-routing/spawn-workers.js';

const spawner = new HybridWorkerSpawner({
  task: "Build feature",
  maxAgents: 3,
  provider: 'zai',
  agentOverride: ['architect', 'coder', 'tester'],
  subtaskOverride: ['Design X', 'Implement X', 'Test X']
});

await spawner.initialize();
await spawner.spawnAll();
spawner.printSummary();
await spawner.cleanup();
```

**Documentation:** `src/cli/hybrid-routing/COORDINATOR-OVERRIDE.md`, `SPECIALIZED-AGENTS.md`

---

## Web Portal Monitoring

**Optional real-time monitoring interface with 7 consolidated views:**

```bash
# Install web portal (one-time setup)
npm run portal:install

# Start development server (http://localhost:3002)
npm run portal:dev

# Build production bundle
npm run portal:build

# Run unit tests (121 tests, 100% pass)
npm run portal:test

# Run E2E tests (32 tests, 65.6% pass)
npm run portal:test:e2e
```

**Features:**
- 7 consolidated monitoring views (Dashboard, Agents, Hierarchy, Performance, Events, Fleet, CFN Loop)
- Real-time WebSocket updates
- Virtual scrolling for 10K+ events
- Chart.js visualizations (CPU, memory, agent distribution)
- Complete test coverage (121 unit + 32 E2E tests)

**Documentation:** WEB_PORTAL_INSTALL.md, packages/web-portal/docs/

---

## Essentials

**Quick reference for common commands:**

```bash
# Health check
npx claude-flow-novice status

# Help and documentation
npx claude-flow-novice --help

# Fullstack team with consensus
/fullstack "goal"

# Autodiscovered commands
/swarm
/sparc
/hooks
```

**Note**: Redis persistence provides automatic recovery for swarm state across interruptions.

---

## Fleet Management (Enterprise Scale)

**For coordinating 1000+ agents with predictive scaling:**

```bash
# Initialize enterprise fleet manager
/fleet init --max-agents 1500 --regions us-east-1,eu-west-1 --efficiency-target 0.40

# Auto-scale fleet dynamically
/fleet scale --fleet-id fleet-123 --target-size 2000 --strategy predictive

# Optimize resource allocation
/fleet optimize --fleet-id fleet-123 --efficiency-target 0.45 --cost-optimization

# Multi-region deployment with failover
/fleet regions --fleet-id fleet-123 --regions us-east-1,eu-west-1,ap-southeast-1 --failover

# Monitor fleet health
/fleet health --fleet-id fleet-123 --deep-check

# Retrieve performance metrics
/fleet metrics --fleet-id fleet-123 --timeframe 24h --detailed
```

---

## Event Bus Management (10,000+ events/sec)

**High-throughput event bus implementing Critical Rule #19 (mandatory Redis pub/sub):**

```bash
# Initialize event bus
/eventbus init --throughput-target 10000 --latency-target 50 --worker-threads 4

# Publish agent lifecycle events
/eventbus publish --type agent.lifecycle --data '{"agent": "coder-1", "status": "spawned"}' --strategy weighted

# Subscribe to event patterns with batch processing
/eventbus subscribe --pattern "agent.*" --handler process-agent-events --batch-size 100

# Retrieve throughput metrics
/eventbus metrics --timeframe 1h --detailed

# Monitor real-time event flow
/eventbus monitor --filter "agent.*" --format table
```

---

## Compliance Management (GDPR/CCPA/SOC2)

```bash
# Validate system compliance against regulatory standards with detailed scope analysis and recommendations
/compliance validate --standard GDPR --scope data-privacy,user-rights --detailed

# Generate comprehensive compliance audit reports with evidence collection for regulatory submissions
/compliance audit --period quarterly --format pdf --include-recommendations

# Configure data residency requirements with encryption for multi-region compliance enforcement
/compliance residency --region eu-west-1 --standards GDPR,CCPA --encryption

# Monitor ongoing compliance status with real-time alerts when thresholds are breached
/compliance monitor --standards GDPR,CCPA,SOC2 --alert-threshold 0.95

# Generate certification-ready compliance documentation with evidence trails for auditors and regulators
/compliance report --type certification --standards SOC2,ISO27001
```

**CFN Loop Integration:**
```bash
# Validate compliance for CFN Loop deliverables
/compliance validate --standard GDPR --scope data-privacy,audit-trail --detailed

# Generate compliance reports for CFN Loop phases
/compliance audit --period phase --format pdf --include-recommendations
```

---

## Performance and Optimization

```bash
# Monitor system performance with real-time metrics collection for bottleneck identification and tuning
/performance monitor  # Start continuous performance monitoring with metric aggregation
/performance report --format=json  # Generate comprehensive performance report with actionable insights
/performance analyze --component=swarm  # Deep analysis of swarm performance with optimization recommendations
claude-flow-novice optimize:activate  # Enable automatic performance optimization with adaptive tuning
claude-flow-novice optimize:status  # Check current optimization status and applied tuning parameters

# Benchmark performance across different workloads and establish baseline metrics for optimization tracking
claude-flow-novice test:performance:basic  # Run basic performance test suite
claude-flow-novice test:performance:load  # Execute load testing with graduated stress levels
claude-flow-novice performance:baseline:create  # Establish performance baseline for future comparisons
```

**CFN Loop Integration:**
```bash
# Monitor CFN Loop performance metrics
/performance analyze --component cfn-loop --timeframe phase

# Error recovery for CFN Loop failures
claude-flow-novice recovery:status --effectiveness-target 0.90
```

---

## CFN Loop Enterprise Commands

**Enterprise Fleet Management:**
```bash
# Initialize fleet for CFN Loop phase (1000+ agents)
/fleet init --max-agents 1500 --efficiency-target 0.40 --regions us-east-1,eu-west-1

# Scale fleet during complex CFN phases
/fleet scale --fleet-id cfn-fleet-phase3 --target-size 2000 --strategy predictive

# Optimize resources for CFN Loop efficiency
/fleet optimize --fleet-id cfn-fleet-phase3 --efficiency-target 0.45
```

**Event Bus Coordination:**
```bash
# Initialize event bus for CFN Loop messaging (10,000+ events/sec)
/eventbus init --throughput-target 10000 --worker-threads 4

# CFN Loop event publishing
/eventbus publish --type cfn.loop.phase --data '{"phase":3,"status":"in-progress"}' --priority 8

# CFN Loop event subscriptions
/eventbus subscribe --pattern "cfn.loop.*" --handler cfn-loop-coordinator
```

**Dashboard Visualization:**
```bash
# CFN Loop progress dashboard
/dashboard insights --fleet-id cfn-fleet-phase3 --timeframe phase

# Real-time CFN Loop monitoring
/dashboard monitor --fleet-id cfn-fleet-phase3 --alerts cfn-loop
```

---

## Dashboard Visualization (General)

```bash
# Real-time swarm visualization with health metrics
/dashboard monitor --fleet-id fleet-123 --format table

# Performance insights and analytics
/dashboard insights --fleet-id fleet-123 --timeframe 24h
```

---

## Markdown Validation

**Standalone tool for CI/pre-commit:**

```bash
# Validate all markdown files (WASM 52x accelerated)
node config/hooks/markdown-validator.js --all

# CI mode (exit 1 on errors)
node config/hooks/markdown-validator.js --all --ci

# Single file or pattern
node config/hooks/markdown-validator.js README.md
node config/hooks/markdown-validator.js docs/**/*.md

# Pre-commit hook: Add to .git/hooks/pre-commit
node config/hooks/markdown-validator.js --all --ci
```

**Use cases:**
- ✅ Pre-commit hooks: Catch broken links before committing
- ✅ CI/CD: PR validation (100+ files in <1s)
- ✅ Documentation builds: Pre-process before publishing
- ✅ CFN Loop agents: Quality check generated docs
- ❌ Post-edit: Too noisy during active editing (use --validate-markdown flag)

---

## Utilities and Maintenance

```bash
# Clean up build artifacts, test processes, and development data for fresh environment resets
claude-flow-novice utils:cleanup  # Remove all build artifacts and temporary files
claude-flow-novice clean:test  # Clean test artifacts and cached test results
redis-cli flushall  # Clear all Redis data (development only - destroys all state)
pkill -f vitest; pkill -f "npm test"  # Force terminate hanging test processes
```

---

## Metrics Reporting Standards

When reporting file counts and build metrics in completion reports, use these standardized commands:

### TypeScript Source Files
```bash
# Count all TypeScript source files
find src -name "*.ts" -o -name "*.tsx" | wc -l
# Report as: "X TypeScript source files"
```

### JavaScript Output Files
```bash
# Count compiled JavaScript files (after build)
find .claude-flow-novice/dist -name "*.js" 2>/dev/null | wc -l
# OR: find dist -name "*.js" 2>/dev/null | wc -l
# Report as: "X JavaScript output files" or "X files compiled to dist/"
```

### Build Compilation Ratio
```bash
# Calculate tree-shaking effectiveness
echo "scale=1; ($(find dist -name "*.js" | wc -l) * 100) / $(find src -name "*.ts" -o -name "*.tsx" | wc -l)" | bc
# Report as: "X% compilation ratio (indicates tree-shaking effectiveness)"
```

### Lines of Code
```bash
# Count total lines (excluding node_modules, dist, .git)
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | grep -v node_modules | grep -v dist | grep -v .git | xargs wc -l | tail -1
```

### Reporting Format

When writing completion reports, ALWAYS clarify context:
- ❌ "691 TypeScript files compiled" (ambiguous - source or output?)
- ✅ "10,047 TypeScript source files compiled to 812 JavaScript output files (8% ratio)"
- ✅ "Build compiled 691 TypeScript files from src/ to dist/"

### Recommended Report Structure

```json
{
  "build_metrics": {
    "source_files": {
      "typescript": 10047,
      "javascript": 150
    },
    "output_files": {
      "javascript": 812,
      "sourcemaps": 812
    },
    "compilation_ratio": "8%",
    "build_time_ms": 938
  }
}
```

### Helper Script

Use the standardized metrics collection script:
```bash
# Human-readable output
node scripts/collect-build-metrics.js

# JSON output for reports
node scripts/collect-build-metrics.js --json
```

---

## WASM 40x Performance Optimization

```bash
# WASM 40x Performance Optimization - accelerate compute-intensive operations with WebAssembly compilation
/wasm initialize --memory-size 1GB --enable-simd --target 40x
/wasm optimize --code "./src/app.js" --enable-vectorization --unroll-loops
/wasm parse --code "function test() { return 42; }" --include-tokens
/wasm batch --files "./src/**/*.js" --batch-size 10 --parallel
/wasm benchmark --tests standard --verbose
/wasm status --detailed --format json

# Validate 40x performance improvements with comprehensive benchmarking against baseline metrics
claude-flow-novice validate:wasm-performance --target 40x
claude-flow-novice benchmark:40x --comprehensive
claude-flow-novice test:wasm-optimization

# Error Recovery System - automatic detection and recovery from swarm failures and interruptions
claude-flow-novice recovery:status --effectiveness-target 0.90
claude-flow-novice recovery:test --scenarios interruption,timeout,corruption
claude-flow-novice recovery:monitor --real-time
```

**CFN Loop Integration:**
```bash
# WASM optimization for CFN Loop tasks
/wasm optimize --code "./cfn-loop-implementation.js" --target 40x
```

---

## Build and Deployment

```bash
# Build operations with various compilation strategies for development and production environments
claude-flow-novice build  # Standard build with default optimization settings
claude-flow-novice build:swc  # Fast SWC-based compilation for rapid development iteration
claude-flow-novice build:types  # Generate TypeScript declaration files for type safety
claude-flow-novice build:watch  # Continuous build with automatic recompilation on file changes
claude-flow-novice build:force  # Force complete rebuild bypassing incremental compilation cache

# Deploy to environments with rollback capabilities and pipeline orchestration for production safety
claude-flow-novice deploy --environment=staging
claude-flow-novice deploy:rollback --version=previous
claude-flow-novice workflow deploy --pipeline=production
```

---

## Neural and AI Operations

```bash
# Train and manage neural network models with automated optimization and prediction workflows
/neural train --model=classifier --data=training_data.csv
/neural predict --model=classifier --input=test_data.csv
/neural optimize --model=classifier --iterations=1000
/neural status --model-id=model_12345

# Advanced consciousness analysis for meta-cognitive patterns and self-awareness evaluation in agent systems
/claude-soul "Analyze system consciousness patterns"
/claude-soul --mode=deep --analysis-type=meta-cognitive
```

---

## GitHub Integration

```bash
# Automate GitHub workflows including PR management, CI/CD triggers, and issue tracking coordination
/github status --repository=org/repo
/github pr create --title="Feature implementation" --body="Description"
/github pr merge --pr-number=123 --strategy=squash
/github workflow run --name=CI/CD --branch=main
/github issue create --title="Bug report" --labels=bug,high-priority
```

---

## Workflow Automation

```bash
# Create and execute automated workflows with event-driven triggers and parameter-based execution
/workflow create --name="Deployment pipeline" --trigger=push
/workflow execute --name="Testing workflow" --parameters='{"env":"staging"}'
/workflow status --workflow-id=workflow_12345
/workflow list --status=active
/workflow automation --enable-auto-scaling
```

---

## Context Management

### ACE System

```bash
# Reflect on execution
/context-reflect --task-id=task-xyz --auto-curate

# Curate reflections
/context-curate --maintenance --auto-merge

# Query bullets
/context-query --category=pattern --tags=redis,coordination

# Inject context
/context-inject --agent-type=coder --phase=phase-0

# View statistics
/context-stats --period=30 --format=json
```

### Direct SQLite Queries

```bash
# Query strategy bullets
sqlite3 ./.artifacts/database/swarm-memory.db \
  "SELECT bullet_id, content, confidence_score
   FROM adaptive_context
   WHERE category='strategy' AND is_active=1
   ORDER BY priority DESC;"

# Mark bullet helpful
sqlite3 ./.artifacts/database/swarm-memory.db \
  "INSERT INTO context_usage_log (id, bullet_id, usage_outcome, created_at)
   VALUES ('usage-$(date +%s)', 'STRAT-001', 'helpful', datetime('now'));"
```

## SQLite Memory & ACL Commands

### Initialization

```bash
# Initialize SQLite-backed memory with 5-level ACL and encryption
/sqlite-memory init --database-path ./memory.db --acl-enabled --encryption AES-256-GCM
```

### 5-Level ACL System

| Level | Scope      | Encryption | Use Case              |
|-------|------------|------------|-----------------------|
| 1     | Agent      | AES-256    | Agent confidence      |
| 2     | Team       | AES-256    | Team coordination     |
| 3     | Swarm      | None       | Consensus, validators |
| 4     | Project    | None       | PO decisions          |
| 5     | System     | Master key | Audit logs            |

### Permission Management

```bash
# Grant swarm-level permissions
/sqlite-memory set-acl --key "project-data" --level project --permissions read,write

# Grant private agent permissions
/sqlite-memory set-acl --key "agent-private" --level private --permissions read,write --agent-id coder-1

# Check permission (cached <1ms)
/sqlite-memory check-permission --agent-id coder-1 --resource-id resource-123 --action read
```

### Storage Operations

```bash
# Store with ACL enforcement (automatic encryption for L1/L2/L5)
/sqlite-memory store --key "sensitive-data" --level system --data '{"encrypted": true}' --ttl 3600
/sqlite-memory store --key "cfn/phase-auth/loop3/agent-1" --level private --data '{"confidence":0.85}'

# Retrieve with ACL enforcement
/sqlite-memory retrieve --key "project-data" --level project
/sqlite-memory query --acl-level swarm --swarm-id swarm-1 --limit 100
```

### CFN Loop Integration

```bash
# Loop 3 confidence storage (ACL 1: Private, 30-day TTL)
/sqlite-memory store \
  --key "cfn/phase-auth/loop3/agent-coder-1" \
  --level private \
  --data '{"confidence":0.85,"files":["src/auth/core.ts"],"reasoning":"Tests pass"}' \
  --ttl 2592000

# Loop 2 consensus storage (ACL 3: Swarm, 30-day TTL)
/sqlite-memory store \
  --key "cfn/phase-auth/loop2/consensus" \
  --level swarm \
  --data '{"avgConsensus":0.92,"validators":[...]}' \
  --ttl 2592000

# Loop 4 decision storage (ACL 4: Project, 365-day TTL)
/sqlite-memory store \
  --key "cfn/phase-auth/loop4/decision" \
  --level project \
  --data '{"decision":"DEFER","reasoning":"..."}' \
  --ttl 31536000
```

### Cross-Session Recovery

```bash
# Recover after crash (Redis failure, VS Code crash)
/sqlite-memory recover --from-sqlite --verify-integrity

# Query recovery state
sqlite3 ./swarm-memory.db "SELECT * FROM consensus WHERE status IN ('pending','in_progress')"

# Backup and restore
/sqlite-memory backup --destination ./backups/memory-$(date +%Y%m%d).db
/sqlite-memory restore --source ./backups/memory-20251010.db --dry-run
```

### Audit Trails

```bash
# Agent lifecycle tracking
/sqlite-memory audit --event-type agent.lifecycle --since 24h --format json

# Coordination events
/sqlite-memory audit --event-type blocking.coordination --coordinator-id coord-1

# Query audit log
sqlite3 ./swarm-memory.db "SELECT * FROM audit_log WHERE agent_id = 'coder-1' ORDER BY timestamp DESC LIMIT 50"
```

### Performance Metrics

```bash
# Detailed metrics (p95 latency, throughput, dual-write success rate)
/sqlite-memory metrics --detailed

# Optimize database
/sqlite-memory vacuum --analyze

# Monitor dual-write pattern
redis-cli monitor | grep "swarm:memory:"
```

**Performance Targets**:
- Dual-write: p95 <60ms ✅
- SQLite-only: p95 <50ms ✅
- Throughput: 10K+ writes/sec
- Recovery: <10s after crash
- Preservation: 100% during Redis failure

### Advanced Queries

```bash
# Retrieve all Loop 3 results for a phase
/sqlite-memory retrieve --key "cfn/phase-auth/loop3/*" --level swarm

# Count agents in a phase
sqlite3 ./swarm-memory.db "SELECT COUNT(*) FROM agents WHERE status = 'completed'"

# List consensus decisions
sqlite3 ./swarm-memory.db "SELECT id, target_id, current_score, threshold, status FROM consensus WHERE status = 'achieved'"

# View encryption status
sqlite3 ./swarm-memory.db "SELECT key, acl_level, encrypted FROM memory WHERE acl_level IN (1,2,5)"
```

---

## Blocking Coordination Cleanup (Sprint 1.7)

```bash
# Execute atomic cleanup of stale blocking coordinators with production-safe Lua script (50-60x faster)
scripts/cleanup-blocking-coordination.sh  # Production cleanup via systemd timer

# Dry-run mode for validation before executing production cleanup with detailed reporting
scripts/cleanup-blocking-coordination.sh --dry-run  # Validate without deletion

# Test performance with 10K coordinators to verify 50-60x speedup over sequential bash
scripts/test-cleanup-performance.sh  # Populate 10K coordinators and benchmark

# Manual Redis Lua script execution for debugging and validation during development
redis-cli --eval scripts/redis-lua/cleanup-blocking-coordination.lua , 600 0

# Monitor cleanup metrics and schedule via systemd for automated production maintenance
systemctl status blocking-coordination-cleanup.timer  # Check timer status
journalctl -u blocking-coordination-cleanup.service  # View cleanup logs
```

**Performance Metrics** (Sprint 1.7):
- **Speedup**: 50-60x faster (300s → 2.5s for 10K coordinators)
- **Throughput**: 4,000-8,000 coordinators/sec cleaned
- **Architecture**: Single SCAN → batch MGET → batched DEL (atomic)
- **Safety**: Non-blocking, production-ready, automatic fallback

---

## Security and Monitoring

```bash
# Perform security audits and validate security configurations against best practices and vulnerabilities
claude-flow-novice security:audit  # Comprehensive security audit with vulnerability scanning
claude-flow-novice security:validate  # Validate security settings and configurations
claude-flow-novice logs export --format=csv --output=security_logs.csv

# Monitor system health and export observability metrics for external analysis and alerting platforms
claude-flow-novice logs tail --component=swarm  # Stream real-time logs for specific component
claude-flow-novice health-check  # Execute complete system health validation
claude-flow-novice metrics export --prometheus  # Export metrics in Prometheus format for monitoring
redis-cli info server  # Display Redis server information and runtime statistics
redis-cli info memory  # Show detailed Redis memory usage and allocation patterns
```

---

## Debugging and Diagnostics

```bash
# Debug agent operations and hook execution with detailed tracing and inspection capabilities
claude-flow-novice debug agent_123 --verbose  # Debug specific agent with detailed state inspection
claude-flow-novice debug:hooks --trace  # Trace hook execution flow with detailed logging
claude-flow-novice test:debug  # Debug test execution with breakpoints and inspection
node --inspect-brk scripts/test/debug.js  # Launch Node.js debugger for script inspection

# Run diagnostic commands to validate system health and phase completion status
claude-flow-novice status --verbose  # Show detailed system status with all components
claude-flow-novice test:health  # Execute health check test suite
claude-flow-novice validate:phase1-completion  # Validate specific phase completion criteria
```

---

## SDK and Integration

```bash
# Manage SDK integration lifecycle for connecting external tools and services to agent coordination
claude-flow-novice sdk:enable  # Enable SDK integration with validation and initialization
claude-flow-novice sdk:monitor  # Monitor SDK activity and track integration health
claude-flow-novice sdk:validate  # Validate SDK setup and configuration correctness
claude-flow-novice sdk:test  # Test SDK integration with sample operations
claude-flow-novice sdk:rollback  # Rollback SDK changes to previous working version
```

### Testing and Quality Assurance

```bash
# Execute tests once and save results for agents to read (CRITICAL: prevents concurrent test conflicts)
npm test -- --run --reporter=json > test-results.json 2>&1
claude-flow-novice test:comprehensive  # Run full test suite with unit, integration, and e2e coverage
claude-flow-novice test:unit  # Execute isolated unit tests only for rapid feedback
claude-flow-novice test:integration  # Run integration tests validating component interactions
claude-flow-novice test:e2e  # Execute end-to-end tests simulating real user workflows

# Generate coverage reports and validate agent configurations against quality standards
claude-flow-novice test:coverage  # Generate detailed code coverage report with branch analysis
claude-flow-novice validate:agents  # Validate all agent configurations for correctness and compatibility
claude-flow-novice optimize:validate  # Validate optimization settings don't break functionality
```

### Configuration and Setup

```bash
# Manage project configuration with validation and initialization for coordinated multi-agent development
claude-flow-novice config show  # Display complete current configuration with all settings
claude-flow-novice config set redis.timeout 5000  # Update specific config value with validation
claude-flow-novice config validate  # Validate entire configuration for correctness and conflicts
claude-flow-novice init --template=coordination  # Initialize new project with coordination template

# Create and manage development teams with role-based access and agent specialization assignments
claude-flow-novice team create --name="Backend Team"
claude-flow-novice team role-create backend-dev "Backend development specialist"
claude-flow-novice team assign john.doe backend-dev
```

# Maintain code quality with automated fixing, type checking, linting, and formatting operations
```
claude-flow-novice utils:fix-imports  # Automatically fix import paths and resolve conflicts
claude-flow-novice typecheck  # Run TypeScript type checking across entire codebase
claude-flow-novice lint  # Execute code linting with auto-fix for style violations
claude-flow-novice format  # Format all code files according to project style guide
```

### UI Dashboard and Visualization

```bash
# Initialize real-time web dashboard for visual monitoring of fleet performance and agent coordination
/dashboard init --refresh-interval 1000 --layout grid --metrics fleet,performance

# Retrieve AI-powered insights and optimization recommendations based on fleet performance patterns
/dashboard insights --fleet-id fleet-123 --timeframe 24h

# Monitor fleet in real-time with alerts for anomalies, bottlenecks, and threshold breaches
/dashboard monitor --fleet-id fleet-123 --alerts

# Visualize fleet resource allocation, agent topology, and coordination patterns interactively
/dashboard visualize --fleet-id fleet-123 --type resource-allocation

# Configure custom dashboard views with role-based access and metric selection for different users
/dashboard config --role admin --metrics fleet,compliance,performance
```

### Recovery Operations

```bash
# Recover interrupted swarms using existing Redis state without reinitializing agent coordination
node tests/manual/test-swarm-recovery.js  # Execute automatic recovery from persisted swarm state
redis-cli --scan --pattern "swarm:*" | xargs -I {} redis-cli get {}  # List all swarm states with metadata
./recover-swarm.sh swarm_id  # Manual recovery script for corrupted or stale swarm instances

# Monitor recovery progress and validate swarm state restoration across all agent nodes
monitor-recovery swarm_id  # Custom recovery monitoring function with real-time progress tracking
redis-cli monitor | grep "swarm:"  # Stream real-time swarm coordination activity and state changes

# CRITICAL: Recovery preserves complete swarm state - only reinit for new phases or major topology changes
redis-cli get "swarm:{swarmId}"  # Check existing swarm state before attempting recovery operations
```

### Hooks and Automation

```bash
# Display status of all registered hooks including execution counts and recent failures
/hooks status
/hooks install --team=backend
/hooks uninstall hook_name
/hooks test post-edit-pipeline  # Test post-edit hook execution (Critical Rule #4 - mandatory after edits)

# Install production-grade hooks with enhanced validation, logging, and error recovery mechanisms
/enhanced-hooks install --production
/enhanced-hooks validate --strict
/enhanced-hooks monitor --real-time
```
---

## Usage Notes

- These commands are specialized and typically used in specific scenarios
- For daily development workflows, refer to the core commands in `CLAUDE.md` Section 10
- Most of these commands are also documented in detail in the `readme/logs-*.md` files
