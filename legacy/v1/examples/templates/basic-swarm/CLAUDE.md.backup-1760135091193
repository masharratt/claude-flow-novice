
# Claude Flow Novice — AI Agent Orchestration

---

## 1) Critical Rules (Single Source of Truth)

* **Use agents for all non-trivial work** (≥4 steps or any multi-file / research / testing / architecture / security / integration / refactor / feature).
* **Initialize swarm before any multi-agent work.**
* **Batch operations**: one message per related batch (spawn, file edits, bash, todos, memory ops).
* **Run post-edit hook after every file edit.**
* **Never work solo** on multi-step tasks. Spawn parallel specialists.
* **Never mix implementers and validators in the same message.**
* **Never run tests inside agents.** Execute once; agents read results.
* **Never save to project root.** Use proper subdirs.
* **No guides/summaries/reports** unless explicitly asked.
* **Use spartan language.**
* **Redis persistence enables swarm recovery** - swarm state survives interruptions.
* **ALL agent communication MUST use Redis pub/sub** - no direct file coordination.

**Consensus thresholds**

* Gate (agent self-confidence): **≥0.75 each**
* Validators consensus: **≥0.90**

---

## 2) When Agents Are Mandatory (Triggers)

If **any** apply, spawn agents:

* > 3 distinct steps • multiple files • research+implement+test • design decisions • code review/quality • security/performance/compliance • system integration • docs generation • refactor/optimize • any feature work

---

## 3) Execution Patterns

### 3.1 Swarm Init → Spawn (Single Message)

**Swarm Init Pattern: ONCE per phase, not per round**
```bash
# Phase-level initialization (persistent through all loops)
executeSwarm({
  swarmId: "phase-0-mcp-less-foundation",
  objective: "Phase 0: MCP-Less Foundation",
  strategy: "development",
  mode: "mesh",
  persistence: true
})
```

**Redis-backed Swarm Execution**:
```bash
node test-swarm-direct.js "Create REST API with authentication" --executor --max-agents 3
# Or: executeSwarm(objective, { strategy: 'development', mode: 'mesh' })
```

**Topology**: mesh (2–7), hierarchical (8+)

**When to Re-Init:**
- ✅ New phase starts (Phase 0 → Phase 1 → Phase 2...)
- ✅ Swarm corruption detected
- ✅ >24 hours since last activity (TTL expiration)
- ❌ Loop 3 retry iterations (use existing swarm)
- ❌ Loop 2 consensus validations (use existing swarm)
- ❌ Agent respawns within same phase

### 3.2 Post-Edit Hook (Mandatory)

```bash
node config/hooks/post-edit-pipeline.js "[FILE]" --memory-key "swarm/[agent]/[step]"
```

**Useful flags (optional)**: `--tdd-mode` • `--minimum-coverage 80..90` • `--rust-strict`

### 3.3 Safe Test Execution

```bash
# Run once, save results
npm test -- --run --reporter=json > test-results.json 2>&1
# Agents read results only
cat test-results.json
# Cleanup
pkill -f vitest; pkill -f "npm test"
```

**Forbidden**: tests executed inside agents; concurrent test runs; long-running tests without cleanup.

### 3.4 Batching (One message = all related ops)

* Spawn all agents with Task tool in one message.
* Batch file ops, bash, todos, memory ops.

---

## 4) CFN Loop (Single Section)
Loop 0: Epic/Sprint orchestration (multi-phase) → no iteration limit
Loop 1: Phase execution (sequential phases) → no limit
Loop 2: Consensus validation (team of 2-4 validators) → max 10/phase; exit at ≥0.90
Loop 3: Primary swarm implementation → max 10/subtask; exit when all ≥0.75
Loop 4: Product Owner decision gate (GOAP) → PROCEED / DEFER / ESCALATE

Flow

Loop 3 implementers produce output + self-confidence scores.
Can use up to 7 agents in mesh, if > 7 agents needed, use coordinators in mesh with teams under them in hierarchical. Can use up to 50 agents under a coordinator

Gate: if all ≥0.75, go to Loop 2; else retry Loop 3 with targeted/different agents.

Loop 2 validator team of 2-4 agents run; refer recommendations to product owner for decisions

**🎯 CRITICAL:** Loop 4 Product Owner runs autonomous GOAP decision:

After consensus validation, Product Owner agent makes autonomous PROCEED/DEFER/ESCALATE decision:

PROCEED: Relaunch Loop 3 with targeted fixes or move to next sprint

DEFER: Approve work, backlog out-of-scope issues. launch swarms for next steps

ESCALATE: Critical ambiguity → human review.

Auto-transition phases when complete by launching a swarm for next steps. No permission prompts.

Retry Templates

Loop 3 retry (low confidence): replace failing agents with specialists; add missing roles (security/perf).
Loop 2 retry (consensus <0.90): target validator issues (e.g., fix SQLi, raise coverage) and refer recommendations to product owner for improvements

Stop only if: dual iteration limits reached, critical security/compilation error, or explicit STOP/PAUSE.

---

## 5) Coordination Checklist (Before / During / After)

**Before**: assess complexity → set agent count/types → choose topology → prepare single spawn message → unique non-overlapping instructions.

**During**: coordinate via SwarmMemory → post-edit hook after every edit → self-validate and report confidence.

**After**: achieve ≥0.90 validator consensus → store results → auto next steps.

---

## 6) Prohibited Patterns

* Implementers + validators in same message.
* Tests inside agents; multiple concurrent test runs.
* Solo work on multi-step tasks.
* Asking permission to retry/advance when criteria/iterations allow.
* Saving to root.
* Creating guides/summaries/reports unless asked.
* Agent coordination without Redis pub/sub messaging.

---

## 7) Agent Selection Cheatsheet

* **Core**: coder • tester • reviewer
* **Backend**: backend-dev • api-docs • system-architect
* **Frontend/Mobile**: coder (specialized) • mobile-dev
* **Quality**: tester • reviewer • security-specialist • perf-analyzer
* **Planning/Ops**: researcher • planner • architect • devops-engineer • cicd-engineer
* **Docs**: api-docs • researcher

Pick roles for actual needs (no generic redundancy).

---

## 8) Commands & Setup

**Swarm Execution**

```bash
# Direct swarm execution (Redis-backed)
node test-swarm-direct.js "Create REST API" --executor --max-agents 3

# Swarm recovery after interruption
redis-cli keys "swarm:*"  # Find interrupted swarms
node test-swarm-recovery.js  # Execute recovery

# CRITICAL: All agents MUST use Redis pub/sub for coordination
redis-cli publish "swarm:coordination" '{"agent":"id","status":"message"}'
```

**Essentials**

* `npx claude-flow-novice status` — health
* `npx claude-flow-novice --help` — commands
* `/fullstack "goal"` — full-stack team + consensus
* `/swarm`, `/sparc`, `/hooks` — autodiscovered
* Redis persistence provides automatic recovery

**File organization**: never save working files to root.

---

## 9) Output & Telemetry (Concise)

**Agent confidence JSON (per agent)**

```json
{ "agent": "coder-1", "confidence": 0.85, "reasoning": "tests pass; security clean", "blockers": [] }
```

**Phase/Loop status (sample)**

```
Loop 3: avg 0.82 (target 0.75) ✅ → Proceed to Loop 2
Loop 2: 0.87 (target 0.90) ❌ → Relaunch Loop 3 (security + coverage)
```

**Next steps block**

* ✅ Completed: brief list
* 📊 Validation: confidence, coverage, consensus
* 🔍 Issues: debt/warnings
* 💡 Recommendations: prioritized

---

## 10) CLI Command Reference (Agent Commands)

### Swarm Management

```bash
# Initialize and execute swarms
node test-swarm-direct.js "Objective description" --executor --max-agents 5
node src/cli/simple-commands/swarm.js "Build REST API" --strategy development --mode mesh
claude-flow-novice swarm "Research cloud patterns" --strategy research --output-format json

# Swarm status and monitoring
claude-flow-novice swarm status
claude-flow-novice monitor
claude-flow-novice metrics --format=json
redis-cli keys "swarm:*"  # Find all swarms
redis-cli get "swarm:swarm_id"  # Check specific swarm
```

### Recovery Operations

```bash
# Recovery after interruption (uses existing swarm - NO reinit needed)
node test-swarm-recovery.js  # Execute recovery
redis-cli --scan --pattern "swarm:*" | xargs -I {} redis-cli get {}  # List swarm states
./recover-swarm.sh swarm_id  # Manual recovery script

# Monitor recovery progress
monitor-recovery swarm_id  # Custom recovery monitoring function
redis-cli monitor | grep "swarm:"  # Real-time swarm activity

# CRITICAL: Recovery preserves swarm state - only reinit for new phases
redis-cli get "swarm:{swarmId}"  # Check existing swarm state
```

### Development Workflows

```bash
# CFN Loop execution
/cfn-loop "Implement authentication system" --phase=auth --max-loop2=10
/cfn-loop-sprints "E-commerce platform" --sprints=3 --max-loop2=5
/cfn-loop-epic "User management system" --phases=4

# SPARC methodology
/sparc analysis "Database performance issues"
/sparc design "Microservices architecture"
/sparc refine "API optimization"
```

### Fullstack Development

```bash
# Fullstack team coordination
/fullstack "Build e-commerce platform"
/fullstack:develop "Add user authentication"
/fullstack:status  # Check fullstack swarm status
/fullstack:terminate  # Clean shutdown
/fullstack:spawn "backend developer"  # Add specific agent
```

### Hooks and Automation

```bash
# Hook management
/hooks status
/hooks install --team=backend
/hooks uninstall hook_name
/hooks test post-edit-pipeline

# Enhanced hooks (production)
/enhanced-hooks install --production
/enhanced-hooks validate --strict
/enhanced-hooks monitor --real-time
```

### Memory and State Management

```bash
# Memory operations
/check:memory  # Check memory safety
/memory-safety --validate  # Validate memory operations
claude-flow-novice memory list  # List memory entries
claude-flow-novice memory clear --namespace=swarm

# State persistence
redis-cli setex "swarm:state" 3600 "$(cat swarm-state.json)"
redis-cli get "swarm:state" | jq .  # Retrieve and parse state
redis-cli --scan --pattern "memory:*"  # Find memory entries
```

### Performance and Optimization

```bash
# Performance monitoring
/performance monitor  # Start performance monitoring
/performance report --format=json  # Generate performance report
/performance analyze --component=swarm  # Analyze swarm performance
claude-flow-novice optimize:activate  # Enable optimization
claude-flow-novice optimize:status  # Check optimization status

# Benchmarking
claude-flow-novice test:performance:basic  # Basic performance tests
claude-flow-novice test:performance:load  # Load testing
claude-flow-novice performance:baseline:create  # Create performance baseline
```

### Testing and Quality Assurance

```bash
# Test execution
npm test -- --run --reporter=json > test-results.json 2>&1
claude-flow-novice test:comprehensive  # Comprehensive testing
claude-flow-novice test:unit  # Unit tests only
claude-flow-novice test:integration  # Integration tests
claude-flow-novice test:e2e  # End-to-end tests

# Coverage and validation
claude-flow-novice test:coverage  # Generate coverage report
claude-flow-novice validate:agents  # Validate agent configurations
claude-flow-novice optimize:validate  # Validate optimization settings
```

### Build and Deployment

```bash
# Build operations
claude-flow-novice build  # Standard build
claude-flow-novice build:swc  # SWC compilation
claude-flow-novice build:types  # TypeScript types
claude-flow-novice build:watch  # Watch mode
claude-flow-novice build:force  # Force rebuild

# Deployment workflows
claude-flow-novice deploy --environment=staging
claude-flow-novice deploy:rollback --version=previous
claude-flow-novice workflow deploy --pipeline=production
```

### Neural and AI Operations

```bash
# Neural network operations
/neural train --model=classifier --data=training_data.csv
/neural predict --model=classifier --input=test_data.csv
/neural optimize --model=classifier --iterations=1000
/neural status --model-id=model_12345

# Consciousness and advanced AI
/claude-soul "Analyze system consciousness patterns"
/claude-soul --mode=deep --analysis-type=meta-cognitive
```

### GitHub Integration

```bash
# GitHub operations
/github status --repository=org/repo
/github pr create --title="Feature implementation" --body="Description"
/github pr merge --pr-number=123 --strategy=squash
/github workflow run --name=CI/CD --branch=main
/github issue create --title="Bug report" --labels=bug,high-priority
```

### Workflow Automation

```bash
# Workflow management
/workflow create --name="Deployment pipeline" --trigger=push
/workflow execute --name="Testing workflow" --parameters='{"env":"staging"}'
/workflow status --workflow-id=workflow_12345
/workflow list --status=active
/workflow automation --enable-auto-scaling
```

### Configuration and Setup

```bash
# Project configuration
claude-flow-novice config show  # Show current config
claude-flow-novice config set redis.timeout 5000  # Set config value
claude-flow-novice config validate  # Validate configuration
claude-flow-novice init --template=coordination  # Initialize project

# Team and role management
claude-flow-novice team create --name="Backend Team"
claude-flow-novice team role-create backend-dev "Backend development specialist"
claude-flow-novice team assign john.doe backend-dev
```

### Security and Monitoring

```bash
# Security operations
claude-flow-novice security:audit  # Security audit
claude-flow-novice security:validate  # Validate security settings
claude-flow-novice logs export --format=csv --output=security_logs.csv

# Monitoring and observability
claude-flow-novice logs tail --component=swarm  # Tail logs
claude-flow-novice health-check  # System health check
claude-flow-novice metrics export --prometheus  # Export metrics
redis-cli info server  # Redis server info
redis-cli info memory  # Redis memory usage
```

### Utilities and Maintenance

```bash
# Cleanup operations
claude-flow-novice utils:cleanup  # Clean build artifacts
claude-flow-novice clean:test  # Clean test artifacts
redis-cli flushall  # Clear all Redis data (development only)
pkill -f vitest; pkill -f "npm test"  # Clean up test processes

# File and project utilities
claude-flow-novice utils:fix-imports  # Fix import paths
claude-flow-novice typecheck  # TypeScript type checking
claude-flow-novice lint  # Code linting
claude-flow-novice format  # Code formatting
```

### Debugging and Diagnostics

```bash
# Debug operations
claude-flow-novice debug agent_123 --verbose  # Debug specific agent
claude-flow-novice debug:hooks --trace  # Debug hook execution
claude-flow-novice test:debug  # Debug test execution
node --inspect-brk scripts/test/debug.js  # Node.js debugging

# Diagnostic commands
claude-flow-novice status --verbose  # Detailed status
claude-flow-novice test:health  # Health check tests
claude-flow-novice validate:phase1-completion  # Validate phase completion
```

### SDK and Integration

```bash
# SDK operations
claude-flow-novice sdk:enable  # Enable SDK integration
claude-flow-novice sdk:monitor  # Monitor SDK activity
claude-flow-novice sdk:validate  # Validate SDK setup
claude-flow-novice sdk:test  # Test SDK integration
claude-flow-novice sdk:rollback  # Rollback SDK changes
```
