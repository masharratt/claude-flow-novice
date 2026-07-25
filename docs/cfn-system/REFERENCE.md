# CFN System Quick Reference

## Command Reference

### Core Commands
```bash
# Execute CFN Loop (Production)
/cfn-loop-cli "Task description" --mode=standard --provider=kimi

# Execute CFN Loop (Debug)
/cfn-loop-task "Task description" --mode=standard --debug

# Docker variants
/cfn-docker:CFN_DOCKER_CLI "Task" --mode=standard
/cfn-docker:CFN_DOCKER_LOOP "Task" --mode=standard
/cfn-docker:CFN_DOCKER_TASK "Task" --mode=standard --debug
```

### Provider Management
```bash
/switch-api kimi      # Balanced cost/quality
/switch-api zai       # Lowest cost
/switch-api max       # Highest quality
/switch-api anthropic # Premium provider
/cost-savings-on      # Enable CLI cost mode
/cost-savings-off     # Disable CLI cost mode
```

### Development Commands
```bash
# Testing
npm test                    # Unit tests (1-5 min)
npm run test:integration    # Integration tests (2 min)
npm run test:e2e           # E2E tests (5 min)
./tests/cli-mode/run-all-tests.sh     # CLI mode tests (5-10 min)
./tests/docker-mode/run-all-implementations.sh  # Docker tests (3-5 min)

# Docker operations
./.claude/skills/docker-build/build.sh --dockerfile docker/Dockerfile.agent --tag cfn-agent:latest
./scripts/docker/run-in-worktree.sh up -d
```

## Mode Thresholds

| Mode | Gate Threshold | Consensus Threshold | Max Iterations | Validators |
|------|----------------|-------------------|----------------|------------|
| MVP | ≥0.70 | ≥0.80 | 5 | 2 |
| Standard | ≥0.95 | ≥0.90 | 10 | 3-5 |
| Enterprise | ≥0.98 | ≥0.95 | 15 | 5-7 |

## Provider Options

| Provider | Cost | Quality | Best For |
|----------|------|---------|----------|
| Z.ai | Low | Good | Cost-sensitive work |
| Kimi | Medium | High | Balanced projects |
| OpenRouter | Variable | Variable | Broad model access |
| Anthropic/Max | High | Excellent | Critical tasks |
| Gemini | Medium | High | Google ecosystem |
| XAI | Medium | High | Grok-style responses |

## File Locations

### Core System
```
.claude/agents/cfn-dev-team/          # Agent definitions
.claude/skills/cfn-*/                 # CFN skills
.claude/hooks/cfn-*                   # Edit safety hooks
src/cli/agent-executor.ts            # CLI entry point
docker/                               # Docker configurations
tests/                               # Test suites
```

### Artifacts
```
.artifacts/test-results/             # Test outputs
.artifacts/coverage/                  # Coverage reports
.artifacts/logs/                      # Execution logs
.artifacts/runtime/                   # Runtime data
.artifacts/analytics/                 # Analytics reports
```

## Key Scripts

### Orchestration
```bash
./.claude/skills/cfn-loop-orchestration/orchestrate.sh  # Main orchestration
./.claude/skills/cfn-agent-spawning/spawn-agent.sh      # Agent spawning
./.claude/skills/cfn-loop-validation/gate-check.sh      # Quality gates
```

### Utilities
```bash
./.claude/hooks/cfn-invoke-pre-edit.sh "$FILE"          # Pre-edit backup
./.claude/hooks/cfn-invoke-post-edit.sh "$FILE"         # Post-edit validation
./.claude/skills/pre-edit-backup/revert-file.sh "$FILE" # Revert changes
```

## Redis Key Patterns

### Coordination
```
task:{taskId}:total        # Expected agent count
task:{taskId}:completed    # Completion counter
swarm:{taskId}:{agentId}:done  # Agent completion signal
consensus:{taskId}         # Validator consensus
```

### Artifacts
```
artifact:{taskId}:{agentId}  # Agent output
metadata:{taskId}           # Task metadata
checkpoint:{taskId}:{iter}  # Iteration state
```

## Environment Variables

### Core Configuration
```bash
CFN_MODE=standard          # mvp|standard|enterprise
CFN_PROVIDER=kimi          # zai|kimi|anthropic|openrouter
CFN_CUSTOM_ROUTING=true    # Enable provider routing
DEBUG=true                 # Enable debug logging
CFN_LOG_LEVEL=debug        # debug|info|warn|error
```

### Resource Limits
```bash
CFN_MEMORY_LIMIT=1073741824   # 1GB in bytes
CFN_TIMEOUT=300               # 5 minutes
CFN_MAX_AGENTS=10            # Max concurrent agents
CFN_REDIS_PORT=6379          # Redis port
CFN_POSTGRES_PORT=5432       # PostgreSQL port
```

### Docker Configuration
```bash
COMPOSE_PROJECT_NAME=cfn-{branch}  # Project namespace
WORKTREE_BRANCH={branch}           # Git worktree
CFN_REDIS_PORT=6421               # Offset Redis port
CFN_POSTGRES_PORT=5474            # Offset Postgres port
```

## Agent Types

### Coordinators
- `cfn-v3-coordinator` - Main workflow orchestrator
- `product-owner` - Requirements and decisions

### Implementers
- `backend-developer` - Server-side development
- `frontend-developer` - Client-side development
- `testing-specialist` - Test creation and execution
- `docker-specialist` - Container operations
- `security-reviewer` - Security assessment

### Validators
- `code-reviewer` - Code quality review
- `architecture-reviewer` - Design validation
- `performance-reviewer` - Performance analysis

## Common Workflows

### Feature Implementation
```bash
# 1. Start CFN Loop
/cfn-loop-cli "Implement user authentication" \
  --mode=standard \
  --provider=kimi

# 2. Monitor progress
redis-cli monitor | grep "cfn:"

# 3. Check results
ls -la .artifacts/test-results/
cat .artifacts/logs/cfn-loop.log
```

### Bug Investigation
```bash
# 1. Run Task mode for full visibility
/cfn-loop-task "Investigate login failure" \
  --mode=standard \
  --debug

# 2. Analyze results
find .artifacts -name "*.json" -exec cat {} \;

# 3. Create bug report
# File: docs/BUG_123_LOGIN_FAILURE.md
```

### Docker Development
```bash
# 1. Create worktree
git worktree add ../feature-auth feature-auth
cd ../feature-auth

# 2. Start stack
./scripts/docker/run-in-worktree.sh up -d

# 3. Execute task
export COMPOSE_PROJECT_NAME="cfn-feature-auth"
/cfn-docker:CFN_DOCKER_TASK "Build auth service" --mode=standard
```

## Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| E001 | Redis connection failed | Check Redis service |
| E002 | Agent spawn timeout | Increase timeout or check resources |
| E003 | Gate check failed | Review test failures |
| E004 | Consensus not reached | Check validator feedback |
| E005 | Resource limit exceeded | Increase memory/disk |
| E006 | Permission denied | Check file permissions |
| E007 | Docker build failed | Use Linux storage |

## Performance Optimization

### Agent Counting
- Loop 3: 3-5 implementers
- Loop 2: 2-7 validators (mode-dependent)
- Parallel execution when possible

### Timeout Tuning
- Base: Loop 1 (300s), Loop 2 (600s), Loop 3 (900s)
- Memory pressure: +50% timeout
- Concurrency: Alert when >10 processes

### Memory Management
- CLI mode: 1GB per agent
- Task mode: 2GB per agent
- Container mode: Docker limits

## Troubleshooting Checklist

### Before Execution
- [ ] Redis server running
- [ ] Docker daemon active (if using containers)
- [ ] Sufficient disk space (>100MB)
- [ ] Sufficient memory (>1GB)
- [ ] Correct branch/worktree

### During Execution
- [ ] Monitor Redis keys
- [ ] Check agent processes
- [ ] Watch log files
- [ ] Validate resource usage

### After Execution
- [ ] Review test results
- [ ] Check confidence scores
- [ ] Validate artifacts
- [ ] Clean up resources

## Quick Fixes

### Reset Environment
```bash
# Clear Redis
redis-cli flushall

# Clean Docker
docker stop $(docker ps -aq) && docker rm $(docker ps -aq)
docker network prune -f

# Clean artifacts
rm -rf .artifacts/*
```

### Recovery from Failure
```bash
# Find stuck processes
ps aux | grep claude-flow-novice

# Kill safely
pkill -f "claude-flow-novice"

# Restart Redis
systemctl restart redis  # or docker restart redis-container
```