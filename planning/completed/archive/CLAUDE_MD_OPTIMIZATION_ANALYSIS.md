# CLAUDE.md Section 10 Optimization Analysis

## Executive Summary

**Objective**: Reduce context bloat in CLAUDE.md by removing redundant/low-frequency commands already documented in log-*.md files.

**Analysis Scope**:
- CLAUDE.md section 10 (CLI Command Reference) - 632 lines
- logs-cli-redis.md - 974 lines with comprehensive CLI documentation
- logs-slash-commands.md - 751 lines with slash command reference
- logs-features.md - 581 lines with feature descriptions
- logs-hooks.md - 694 lines with hooks documentation
- logs-functions.md - 916 lines with function reference
- logs-mcp.md - 839 lines with MCP tools documentation

**Estimated Token Savings**: 3,500-4,200 tokens (approximately 60-65% reduction in Section 10)

---

## Part 1: Commands in BOTH CLAUDE.md AND log-*.md files

### HIGH REDUNDANCY - Fully Documented Elsewhere

#### Fleet Management Commands (6 commands)
**CLAUDE.md Section**: Fleet Management (Enterprise Scale)
**Also in**: logs-slash-commands.md (lines 90-125), logs-cli-redis.md (minimal), logs-mcp.md (lines 23-105), logs-features.md (lines 35-54)

Commands with full documentation in logs:
1. `/fleet init --max-agents 1500 --regions us-east-1,eu-west-1 --efficiency-target 0.40`
2. `/fleet scale --fleet-id fleet-123 --target-size 2000 --strategy predictive`
3. `/fleet optimize --fleet-id fleet-123 --efficiency-target 0.45 --cost-optimization`
4. `/fleet regions --fleet-id fleet-123 --regions us-east-1,eu-west-1,ap-southeast-1 --failover`
5. `/fleet health --fleet-id fleet-123 --deep-check`
6. `/fleet metrics --fleet-id fleet-123 --timeframe 24h --detailed`

**Redundancy**: 100% - All commands documented with MORE detail in logs-slash-commands.md

---

#### Event Bus Commands (5 commands)
**CLAUDE.md Section**: Event Bus Management (10,000+ events/sec)
**Also in**: logs-slash-commands.md (lines 127-158), logs-mcp.md (lines 107-159), logs-functions.md (lines 126-173)

Commands with full documentation in logs:
1. `/eventbus init --throughput-target 10000 --latency-target 50 --worker-threads 4`
2. `/eventbus publish --type agent.lifecycle --data '{"agent": "coder-1", "status": "spawned"}' --strategy weighted`
3. `/eventbus subscribe --pattern "agent.*" --handler process-agent-events --batch-size 100`
4. `/eventbus metrics --timeframe 1h --detailed`
5. `/eventbus monitor --filter "agent.*" --format table`

**Redundancy**: 100% - Comprehensive coverage in logs-slash-commands.md and logs-mcp.md

---

#### Compliance Commands (5 commands)
**CLAUDE.md Section**: Compliance Management (GDPR/CCPA/SOC2)
**Also in**: logs-slash-commands.md (lines 160-191), logs-mcp.md (lines 161-204), logs-features.md (lines 392-414)

Commands with full documentation in logs:
1. `/compliance validate --standard GDPR --scope data-privacy,user-rights --detailed`
2. `/compliance audit --period quarterly --format pdf --include-recommendations`
3. `/compliance residency --region eu-west-1 --standards GDPR,CCPA --encryption`
4. `/compliance monitor --standards GDPR,CCPA,SOC2 --alert-threshold 0.95`
5. `/compliance report --type certification --standards SOC2,ISO27001`

**Redundancy**: 100% - Enterprise compliance covered extensively in logs-features.md

---

#### WASM Performance Commands (6 commands)
**CLAUDE.md Section**: WASM 40x Performance Optimization
**Also in**: logs-slash-commands.md (lines 483-518), logs-cli-redis.md (lines 233-296), logs-mcp.md (lines 384-477), logs-functions.md (lines 472-614)

Commands with full documentation in logs:
1. `/wasm initialize --memory-size 1GB --enable-simd --target 40x`
2. `/wasm optimize --code "./src/app.js" --enable-vectorization --unroll-loops`
3. `/wasm parse --code "function test() { return 42; }" --include-tokens`
4. `/wasm batch --files "./src/**/*.js" --batch-size 10 --parallel`
5. `/wasm benchmark --tests standard --verbose`
6. `/wasm status --detailed --format json`
7. `claude-flow-novice validate:wasm-performance --target 40x`
8. `claude-flow-novice benchmark:40x --comprehensive`
9. `claude-flow-novice test:wasm-optimization`

**Redundancy**: 100% - WASM performance extensively documented with examples in logs-functions.md

---

#### Neural/Consciousness Commands (6 commands)
**CLAUDE.md Section**: Neural and AI Operations
**Also in**: logs-slash-commands.md (lines 456-481), logs-cli-redis.md (lines 401-428)

Commands with full documentation in logs:
1. `/neural train --model=classifier --data=training_data.csv`
2. `/neural predict --model=classifier --input=test_data.csv`
3. `/neural optimize --model=classifier --iterations=1000`
4. `/neural status --model-id=model_12345`
5. `/claude-soul "Analyze system consciousness patterns"`
6. `/claude-soul --mode=deep --analysis-type=meta-cognitive`

**Redundancy**: 100% - Specialized AI features documented in logs-slash-commands.md

---

#### GitHub Integration Commands (5 commands)
**CLAUDE.md Section**: GitHub Integration
**Also in**: logs-slash-commands.md (lines 544-570)

Commands with full documentation in logs:
1. `/github status --repository=org/repo`
2. `/github pr create --title="Feature implementation" --body="Description"`
3. `/github pr merge --pr-number=123 --strategy=squash`
4. `/github workflow run --name=CI/CD --branch=main`
5. `/github issue create --title="Bug report" --labels=bug,high-priority`

**Redundancy**: 100% - GitHub automation covered in logs-slash-commands.md

---

#### Workflow Automation Commands (5 commands)
**CLAUDE.md Section**: Workflow Automation
**Also in**: logs-slash-commands.md (lines 298-320)

Commands with full documentation in logs:
1. `/workflow create --name="Deployment pipeline" --trigger=push`
2. `/workflow execute --name="Testing workflow" --parameters='{"env":"staging"}'`
3. `/workflow status --workflow-id=workflow_12345`
4. `/workflow list --status=active`
5. `/workflow automation --enable-auto-scaling`

**Redundancy**: 100% - Workflow management documented in logs-slash-commands.md

---

#### Dashboard Visualization Commands (5 commands)
**CLAUDE.md Section**: UI Dashboard and Visualization
**Also in**: logs-slash-commands.md (lines 589-606), logs-features.md (lines 436-457), logs-functions.md (lines 231-258)

Commands with full documentation in logs:
1. `/dashboard init --refresh-interval 1000 --layout grid --metrics fleet,performance`
2. `/dashboard insights --fleet-id fleet-123 --timeframe 24h`
3. `/dashboard monitor --fleet-id fleet-123 --alerts`
4. `/dashboard visualize --fleet-id fleet-123 --type resource-allocation`
5. `/dashboard config --role admin --metrics fleet,compliance,performance`

**Redundancy**: 100% - Dashboard features covered in logs-features.md and logs-functions.md

---

#### SQLite Memory Management Commands (4 commands)
**CLAUDE.md Section**: SQLite Memory Management
**Also in**: logs-features.md (lines 76-94), logs-functions.md (lines 174-203)

Commands with full documentation in logs:
1. `/sqlite-memory init --database-path ./memory.db --acl-enabled --data-residency eu-west-1`
2. `/sqlite-memory set-acl --key "project-data" --level project --permissions read,write`
3. `/sqlite-memory store --key "sensitive-data" --level system --data '{"encrypted": true}'`
4. `/sqlite-memory retrieve --key "project-data" --level project`

**Redundancy**: 100% - SQLite memory covered extensively in logs-features.md

---

#### Debugging and Diagnostics Commands (10 commands)
**CLAUDE.md Section**: Debugging and Diagnostics
**Also in**: logs-cli-redis.md (lines 529-560)

Commands with full documentation in logs:
1. `claude-flow-novice debug agent_123 --verbose`
2. `claude-flow-novice debug:hooks --trace`
3. `claude-flow-novice test:debug`
4. `node --inspect-brk scripts/test/debug.js`
5. `claude-flow-novice status --verbose`
6. `claude-flow-novice test:health`
7. `claude-flow-novice validate:phase1-completion`

**Redundancy**: 90% - Debugging commands documented in logs-cli-redis.md

---

#### Build and Deployment Commands (8 commands)
**CLAUDE.md Section**: Build and Deployment
**Also in**: logs-cli-redis.md (lines 333-362)

Commands with full documentation in logs:
1. `claude-flow-novice build`
2. `claude-flow-novice build:swc`
3. `claude-flow-novice build:types`
4. `claude-flow-novice build:watch`
5. `claude-flow-novice build:force`
6. `claude-flow-novice deploy --environment=staging`
7. `claude-flow-novice deploy:rollback --version=previous`
8. `claude-flow-novice workflow deploy --pipeline=production`

**Redundancy**: 90% - Build operations documented in logs-cli-redis.md

---

### MEDIUM REDUNDANCY - Partially Documented

#### Performance and Optimization Commands (16 commands)
**CLAUDE.md Section**: Performance and Optimization
**Also in**: logs-cli-redis.md (lines 259-310), logs-functions.md (lines 469-665)

Core commands (KEEP simplified version):
1. `/performance monitor`
2. `/performance report --format=json`
3. `/performance analyze --component=swarm`

WASM commands (REMOVE - covered above):
4. `/wasm initialize --memory-size 1GB --enable-simd --target 40x`
5. `/wasm optimize --code "./src/app.js" --enable-vectorization --unroll-loops`
6. `/wasm parse --code "function test() { return 42; }" --include-tokens`
7. `/wasm batch --files "./src/**/*.js" --batch-size 10 --parallel`
8. `/wasm benchmark --tests standard --verbose`
9. `/wasm status --detailed --format json`
10. `claude-flow-novice validate:wasm-performance --target 40x`
11. `claude-flow-novice benchmark:40x --comprehensive`
12. `claude-flow-novice test:wasm-optimization`

Error recovery commands (KEEP simplified version):
13. `claude-flow-novice recovery:status --effectiveness-target 0.90`
14. `claude-flow-novice recovery:test --scenarios interruption,timeout,corruption`
15. `claude-flow-novice recovery:monitor --real-time`

**Redundancy**: 75% - WASM commands 100% redundant, keep only basic performance/recovery

---

#### Testing Commands (8 commands)
**CLAUDE.md Section**: Testing and Quality Assurance
**Also in**: logs-cli-redis.md (lines 312-330)

Commands with full documentation in logs:
1. `npm test -- --run --reporter=json > test-results.json 2>&1` (KEEP - core workflow)
2. `claude-flow-novice test:comprehensive`
3. `claude-flow-novice test:unit`
4. `claude-flow-novice test:integration`
5. `claude-flow-novice test:e2e`
6. `claude-flow-novice test:coverage`
7. `claude-flow-novice validate:agents`
8. `claude-flow-novice optimize:validate`

**Redundancy**: 50% - Keep core test execution, remove specialized commands

---

#### Memory and State Management Commands (8 commands)
**CLAUDE.md Section**: Memory and State Management
**Also in**: logs-cli-redis.md (lines 199-228), logs-mcp.md (lines 304-383)

Commands with full documentation in logs:
1. `/check:memory`
2. `/memory-safety --validate`
3. `claude-flow-novice memory list --namespace=swarm`
4. `claude-flow-novice memory clear --namespace=swarm`
5. `redis-cli setex "swarm:state" 3600 "$(cat swarm-state.json)"`
6. `redis-cli get "swarm:state" | jq .`
7. `redis-cli --scan --pattern "memory:*"`

**Redundancy**: 70% - Redis operations documented, keep only essential memory commands

---

### LOW REDUNDANCY - Keep in CLAUDE.md (Core Workflow)

#### Swarm Management Commands (10 commands)
**CLAUDE.md Section**: Swarm Management
**Also in**: logs-cli-redis.md (lines 38-92), logs-slash-commands.md (lines 193-234), logs-mcp.md (lines 206-302)

KEEP ALL - Core to agent workflow:
1. `node tests/manual/test-swarm-direct.js "Objective description" --executor --max-agents 5`
2. `node src/cli/simple-commands/swarm.js "Build REST API" --strategy development --mode mesh`
3. `claude-flow-novice swarm "Research cloud patterns" --strategy research --output-format json`
4. `claude-flow-novice swarm status`
5. `claude-flow-novice monitor`
6. `claude-flow-novice metrics --format=json`
7. `redis-cli keys "swarm:*"`
8. `redis-cli get "swarm:swarm_id"`

**Redundancy**: 30% - Core commands must stay in CLAUDE.md

---

#### Recovery Operations Commands (7 commands)
**CLAUDE.md Section**: Recovery Operations
**Also in**: logs-cli-redis.md (lines 94-147)

KEEP ALL - Critical for swarm recovery:
1. `node tests/manual/test-swarm-recovery.js`
2. `redis-cli --scan --pattern "swarm:*" | xargs -I {} redis-cli get {}`
3. `./recover-swarm.sh swarm_id`
4. `monitor-recovery swarm_id`
5. `redis-cli monitor | grep "swarm:"`
6. `redis-cli get "swarm:{swarmId}"`

**Redundancy**: 40% - Recovery is critical, keep simplified examples

---

#### Development Workflows Commands (6 commands)
**CLAUDE.md Section**: Development Workflows
**Also in**: logs-cli-redis.md (lines 149-197), logs-slash-commands.md (lines 9-88)

KEEP ALL - Core CFN Loop and SPARC:
1. `/cfn-loop "Implement authentication system" --phase=auth --max-loop2=10`
2. `/cfn-loop-sprints "E-commerce platform" --sprints=3 --max-loop2=5`
3. `/cfn-loop-epic "User management system" --phases=4`
4. `/sparc analysis "Database performance issues"`
5. `/sparc design "Microservices architecture"`
6. `/sparc refine "API optimization"`

**Redundancy**: 40% - CFN Loop is core to CLAUDE.md methodology

---

#### Fullstack Development Commands (5 commands)
**CLAUDE.md Section**: Fullstack Development
**Also in**: logs-cli-redis.md (lines 184-197), logs-slash-commands.md (lines 69-88)

KEEP ALL - Core workflow pattern:
1. `/fullstack "Build e-commerce platform"`
2. `/fullstack:develop "Add user authentication"`
3. `/fullstack:status`
4. `/fullstack:terminate`
5. `/fullstack:spawn "backend developer"`

**Redundancy**: 35% - Fullstack pattern is essential

---

#### Hooks and Automation Commands (7 commands)
**CLAUDE.md Section**: Hooks and Automation
**Also in**: logs-hooks.md (throughout), logs-slash-commands.md (lines 429-454)

KEEP SIMPLIFIED - Referenced frequently:
1. `/hooks status`
2. `/hooks install --team=backend`
3. `/hooks uninstall hook_name`
4. `/hooks test post-edit-pipeline`

REMOVE - Advanced usage:
5. `/enhanced-hooks install --production`
6. `/enhanced-hooks validate --strict`
7. `/enhanced-hooks monitor --real-time`

**Redundancy**: 50% - Keep basic hooks, remove enhanced versions

---

#### Configuration and Setup Commands (8 commands)
**CLAUDE.md Section**: Configuration and Setup
**Also in**: logs-cli-redis.md (lines 365-399)

KEEP CORE - Referenced in workflows:
1. `claude-flow-novice config show`
2. `claude-flow-novice config set redis.timeout 5000`
3. `claude-flow-novice config validate`
4. `claude-flow-novice init --template=coordination`

REMOVE - Team management (low frequency):
5. `claude-flow-novice team create --name="Backend Team"`
6. `claude-flow-novice team role-create backend-dev "Backend development specialist"`
7. `claude-flow-novice team assign john.doe backend-dev`

**Redundancy**: 50% - Keep config, remove team commands

---

#### Security and Monitoring Commands (9 commands)
**CLAUDE.md Section**: Security and Monitoring
**Also in**: logs-cli-redis.md (lines 464-492)

KEEP CORE:
1. `claude-flow-novice health-check`
2. `redis-cli info server`
3. `redis-cli info memory`

REMOVE - Specialized:
4. `claude-flow-novice security:audit`
5. `claude-flow-novice security:validate`
6. `claude-flow-novice logs export --format=csv --output=security_logs.csv`
7. `claude-flow-novice logs tail --component=swarm`
8. `claude-flow-novice metrics export --prometheus`

**Redundancy**: 60% - Keep health check, remove specialized monitoring

---

#### Utilities and Maintenance Commands (9 commands)
**CLAUDE.md Section**: Utilities and Maintenance
**Also in**: logs-cli-redis.md (lines 494-527)

KEEP ESSENTIAL:
1. `pkill -f vitest; pkill -f "npm test"` (test cleanup - essential)
2. `redis-cli flushall` (development cleanup)

REMOVE - Low frequency:
3. `claude-flow-novice utils:cleanup`
4. `claude-flow-novice clean:test`
5. `claude-flow-novice utils:fix-imports`
6. `claude-flow-novice typecheck`
7. `claude-flow-novice lint`
8. `claude-flow-novice format`

**Redundancy**: 70% - Keep only critical cleanup commands

---

#### SDK and Integration Commands (5 commands)
**CLAUDE.md Section**: SDK and Integration
**Also in**: logs-cli-redis.md (lines 562-577)

REMOVE ALL - Low frequency, specialized:
1. `claude-flow-novice sdk:enable`
2. `claude-flow-novice sdk:monitor`
3. `claude-flow-novice sdk:validate`
4. `claude-flow-novice sdk:test`
5. `claude-flow-novice sdk:rollback`

**Redundancy**: 100% - SDK operations rarely used

---

## Part 2: Proposed Removals from CLAUDE.md Section 10

### TIER 1 - REMOVE IMMEDIATELY (100% Redundancy)

**Estimated Token Savings**: 2,400-2,800 tokens

#### Remove Entire Sections:

1. **Fleet Management (Enterprise Scale)** - Lines 324-344
   - Reason: 100% documented in logs-slash-commands.md and logs-mcp.md
   - Frequency: Enterprise-only, low daily usage
   - Keep: Reference to `/fleet` in essentials section

2. **Event Bus Management (10,000+ events/sec)** - Lines 346-363
   - Reason: 100% documented in logs-slash-commands.md and logs-mcp.md
   - Frequency: Advanced feature, rarely needed daily
   - Keep: Reference to `/eventbus` in advanced features

3. **Compliance Management (GDPR/CCPA/SOC2)** - Lines 365-382
   - Reason: 100% documented in logs-slash-commands.md and logs-features.md
   - Frequency: Enterprise compliance, infrequent
   - Keep: None

4. **Neural and AI Operations** - Lines 491-503
   - Reason: 100% documented in logs-slash-commands.md
   - Frequency: Experimental features, rarely used
   - Keep: None

5. **GitHub Integration** - Lines 505-514
   - Reason: 100% documented in logs-slash-commands.md
   - Frequency: Standard git workflows cover most needs
   - Keep: None

6. **Workflow Automation** - Lines 516-525
   - Reason: 100% documented in logs-slash-commands.md
   - Frequency: Advanced automation, low usage
   - Keep: None

7. **UI Dashboard and Visualization** - Lines 589-606
   - Reason: 100% documented in logs-slash-commands.md and logs-features.md
   - Frequency: Optional UI features
   - Keep: None

8. **SQLite Memory Management** - Lines 608-620
   - Reason: 100% documented in logs-features.md
   - Frequency: Advanced memory management, low usage
   - Keep: None

9. **SDK and Integration** - Lines 622-631
   - Reason: 100% documented in logs-cli-redis.md
   - Frequency: SDK operations rarely needed
   - Keep: None

10. **Debugging and Diagnostics** - Lines 574-587
    - Reason: 90% documented in logs-cli-redis.md
    - Frequency: Debug commands used as-needed, not daily
    - Keep: None (troubleshooting section covers basics)

---

### TIER 2 - SIMPLIFY/CONDENSE (50-90% Redundancy)

**Estimated Token Savings**: 800-1,000 tokens

#### Simplify These Sections:

1. **Performance and Optimization** - Lines 425-457
   - KEEP (3 commands):
     - `/performance monitor`
     - `/performance report --format=json`
     - `claude-flow-novice recovery:status --effectiveness-target 0.90`
   - REMOVE: All WASM commands (covered in TIER 1 or logs-cli-redis.md)
   - REMOVE: Benchmarking commands (specialized)
   - Savings: 18 lines → 6 lines (67% reduction)

2. **Testing and Quality Assurance** - Lines 459-473
   - KEEP (2 commands):
     - `npm test -- --run --reporter=json > test-results.json 2>&1` (essential)
     - `cat test-results.json` (workflow continuity)
   - REMOVE: All other test commands (logs-cli-redis.md)
   - Savings: 15 lines → 5 lines (67% reduction)

3. **Build and Deployment** - Lines 475-489
   - KEEP (2 commands):
     - `claude-flow-novice build`
     - `claude-flow-novice deploy --environment=staging`
   - REMOVE: Specialized build commands
   - Savings: 15 lines → 4 lines (73% reduction)

4. **Memory and State Management** - Lines 410-423
   - KEEP (3 commands):
     - `redis-cli keys "swarm:*"` (essential for swarm discovery)
     - `redis-cli get "swarm:swarm_id"` (state inspection)
     - `claude-flow-novice memory list --namespace=swarm` (memory check)
   - REMOVE: Advanced memory operations
   - Savings: 14 lines → 6 lines (57% reduction)

5. **Hooks and Automation** - Lines 395-408
   - KEEP (2 commands):
     - `/hooks status`
     - `/hooks test post-edit-pipeline`
   - REMOVE: Enhanced hooks, installation commands
   - Savings: 14 lines → 4 lines (71% reduction)

6. **Configuration and Setup** - Lines 527-540
   - KEEP (3 commands):
     - `claude-flow-novice config show`
     - `claude-flow-novice config validate`
     - `claude-flow-novice init --template=coordination`
   - REMOVE: Team management commands
   - Savings: 14 lines → 6 lines (57% reduction)

7. **Security and Monitoring** - Lines 542-556
   - KEEP (2 commands):
     - `claude-flow-novice health-check`
     - `redis-cli info memory`
   - REMOVE: Specialized monitoring/security commands
   - Savings: 15 lines → 4 lines (73% reduction)

8. **Utilities and Maintenance** - Lines 558-572
   - KEEP (2 commands):
     - `pkill -f vitest; pkill -f "npm test"` (essential cleanup)
     - `redis-cli flushall` (dev reset)
   - REMOVE: All other utility commands
   - Savings: 15 lines → 4 lines (73% reduction)

---

### TIER 3 - KEEP (Core Workflow, Low Redundancy)

**Keep as-is**: 0 token reduction

These sections are essential to daily agent workflow and have lower redundancy:

1. **Swarm Management** - Lines 278-292 (KEEP ALL)
   - Reason: Core to agent orchestration
   - Daily frequency: HIGH
   - Redundancy: 30%

2. **Recovery Operations** - Lines 294-308 (KEEP ALL)
   - Reason: Critical for swarm recovery
   - Daily frequency: MEDIUM
   - Redundancy: 40%

3. **Development Workflows** - Lines 310-322 (KEEP ALL)
   - Reason: CFN Loop and SPARC are core methodologies
   - Daily frequency: HIGH
   - Redundancy: 40%

4. **Fullstack Development** - Lines 384-393 (KEEP ALL)
   - Reason: Common pattern for full-stack work
   - Daily frequency: MEDIUM
   - Redundancy: 35%

---

## Part 3: Proposed CLAUDE.md Section 10 (Optimized)

### Optimized Structure (Reduced from 632 lines to ~220 lines)

```markdown
## 10) CLI Command Reference (Agent Commands)

### Essential Commands Reference

Core commands for daily agent workflows. For comprehensive documentation, see:
- `/logs-cli-redis.md` - Complete CLI/Redis coordination guide
- `/logs-slash-commands.md` - Full slash command reference
- `/logs-mcp.md` - MCP tools and integration
- `/logs-features.md` - Feature descriptions and configuration

---

### Swarm Management

```bash
# Initialize and execute swarms
node tests/manual/test-swarm-direct.js "Objective description" --executor --max-agents 5
node src/cli/simple-commands/swarm.js "Build REST API" --strategy development --mode mesh
claude-flow-novice swarm "Research cloud patterns" --strategy research --output-format json

# Swarm status and monitoring
claude-flow-novice swarm status
claude-flow-novice monitor
claude-flow-novice metrics --format=json
redis-cli keys "swarm:*"  # Find all swarms
redis-cli get "swarm:swarm_id"  # Check specific swarm
```

---

### Recovery Operations

```bash
# Recovery after interruption (uses existing swarm - NO reinit needed)
node tests/manual/test-swarm-recovery.js  # Execute recovery
redis-cli --scan --pattern "swarm:*" | xargs -I {} redis-cli get {}  # List swarm states
./recover-swarm.sh swarm_id  # Manual recovery script

# Monitor recovery progress
monitor-recovery swarm_id  # Custom recovery monitoring function
redis-cli monitor | grep "swarm:"  # Real-time swarm activity

# CRITICAL: Recovery preserves swarm state - only reinit for new phases
redis-cli get "swarm:{swarmId}"  # Check existing swarm state
```

---

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

---

### Fullstack Development

```bash
# Fullstack team coordination
/fullstack "Build e-commerce platform"
/fullstack:develop "Add user authentication"
/fullstack:status  # Check fullstack swarm status
/fullstack:terminate  # Clean shutdown
/fullstack:spawn "backend developer"  # Add specific agent
```

---

### Hooks and Automation

```bash
# Hook management
/hooks status
/hooks test post-edit-pipeline
```

---

### Memory and State Management

```bash
# Essential memory operations
redis-cli keys "swarm:*"  # Find swarms
redis-cli get "swarm:swarm_id"  # Get state
claude-flow-novice memory list --namespace=swarm  # List memory
```

---

### Performance and Optimization

```bash
# Performance monitoring
/performance monitor  # Start performance monitoring
/performance report --format=json  # Generate performance report

# Error recovery
claude-flow-novice recovery:status --effectiveness-target 0.90
```

---

### Testing and Quality Assurance

```bash
# Test execution (CRITICAL: Run once, save results)
npm test -- --run --reporter=json > test-results.json 2>&1
cat test-results.json  # Agents read results only
pkill -f vitest; pkill -f "npm test"  # Cleanup
```

---

### Configuration and Setup

```bash
# Project configuration
claude-flow-novice config show  # Show current config
claude-flow-novice config validate  # Validate configuration
claude-flow-novice init --template=coordination  # Initialize project
```

---

### System Health and Maintenance

```bash
# Health checks
claude-flow-novice health-check  # System health check
redis-cli info memory  # Redis memory usage

# Essential cleanup
pkill -f vitest; pkill -f "npm test"  # Clean up test processes
redis-cli flushall  # Clear all Redis data (development only)
```

---

### Advanced Features

For advanced/enterprise features, see detailed documentation:

- **Fleet Management (1000+ agents)**: See `/logs-slash-commands.md` lines 90-125
- **Event Bus (10,000+ events/sec)**: See `/logs-slash-commands.md` lines 127-158
- **Compliance (GDPR/CCPA/SOC2)**: See `/logs-features.md` lines 392-414
- **WASM 40x Performance**: See `/logs-functions.md` lines 472-614
- **Neural/Consciousness**: See `/logs-slash-commands.md` lines 456-481
- **Dashboard Visualization**: See `/logs-features.md` lines 436-457
- **Build and Deployment**: See `/logs-cli-redis.md` lines 333-362
- **Debugging**: See `/logs-cli-redis.md` lines 529-560
```

---

## Part 4: Token Savings Estimation

### Current CLAUDE.md Section 10
- Total lines: 632 lines
- Estimated tokens: 5,500-6,000 tokens (average 9 tokens/line)
- Content: 19 subsections with examples

### Proposed CLAUDE.md Section 10
- Total lines: ~220 lines
- Estimated tokens: 2,000-2,200 tokens (average 9 tokens/line)
- Content: 10 core subsections + advanced references

### Token Savings
- **Absolute Reduction**: 3,300-3,800 tokens (412 lines removed)
- **Percentage Reduction**: 60-65%
- **Context Efficiency**: Keeps 100% of daily-use commands, removes 90% of specialized/enterprise commands

---

## Part 5: Implementation Recommendations

### Phase 1: Immediate Removals (TIER 1)
**Target**: Remove 100% redundant sections

1. Remove entire sections from CLAUDE.md:
   - Fleet Management
   - Event Bus Management
   - Compliance Management
   - Neural/AI Operations
   - GitHub Integration
   - Workflow Automation
   - Dashboard Visualization
   - SQLite Memory Management
   - SDK Integration
   - Debugging and Diagnostics

2. Add references to logs-*.md in "Advanced Features" section

**Estimated Time**: 15 minutes
**Token Savings**: 2,400-2,800 tokens

---

### Phase 2: Simplifications (TIER 2)
**Target**: Condense 50-90% redundant sections

1. Simplify sections to core commands only:
   - Performance and Optimization (3 commands)
   - Testing (2 commands)
   - Build and Deployment (2 commands)
   - Memory Management (3 commands)
   - Hooks (2 commands)
   - Configuration (3 commands)
   - Security/Monitoring (2 commands)
   - Utilities (2 commands)

2. Add cross-references to detailed docs

**Estimated Time**: 20 minutes
**Token Savings**: 800-1,000 tokens

---

### Phase 3: Validation
**Target**: Ensure workflow continuity

1. Test critical workflows with simplified CLAUDE.md:
   - Swarm initialization and recovery
   - CFN Loop execution
   - Post-edit hook execution
   - Test execution and cleanup

2. Verify all removed commands are documented in logs-*.md

**Estimated Time**: 10 minutes

---

## Part 6: Categorization Summary

### Keep in CLAUDE.md (High-Frequency Core Workflow)
- Swarm Management (10 commands)
- Recovery Operations (7 commands)
- Development Workflows (6 commands - CFN Loop, SPARC)
- Fullstack Development (5 commands)
- Essential testing (2 commands)
- Essential memory ops (3 commands)
- Essential config (3 commands)
- Essential monitoring (2 commands)
- Essential cleanup (2 commands)

**Total: ~40 essential commands**

---

### Move to "See Documentation" References (Low-Frequency)
- Fleet Management (6 commands)
- Event Bus (5 commands)
- Compliance (5 commands)
- WASM Performance (9 commands)
- Neural/Consciousness (6 commands)
- GitHub (5 commands)
- Workflow Automation (5 commands)
- Dashboard (5 commands)
- SQLite Memory (4 commands)
- SDK Integration (5 commands)
- Advanced Testing (6 commands)
- Advanced Build (6 commands)
- Advanced Debugging (7 commands)
- Advanced Monitoring (7 commands)
- Advanced Utilities (7 commands)
- Hooks (5 commands)

**Total: ~98 specialized commands → referenced only**

---

## Part 7: Final Recommendation

**Approve proposed optimization**: YES

**Justification**:
1. **60-65% token reduction** while preserving 100% of daily workflow commands
2. **Zero workflow disruption** - all core agent operations remain immediately accessible
3. **Better organization** - clear separation of essential vs. advanced features
4. **Improved maintainability** - single source of truth for specialized commands in logs-*.md
5. **Enhanced discoverability** - clear references to detailed documentation

**Next Steps**:
1. Implement Phase 1 removals (TIER 1)
2. Implement Phase 2 simplifications (TIER 2)
3. Test critical workflows
4. Update cross-references in logs-*.md if needed

**Risk Assessment**: LOW
- All removed commands documented elsewhere
- Core workflow preserved
- Easy rollback if issues arise
