# CLI Mode Architecture

**Simplified 2-Layer Coordination for Production Workflows**

## Executive Overview

CLI mode represents a fundamental redefinition of CFN Loop coordination, replacing the complex 3-layer architecture (Main Chat → Coordinator → Orchestrator → Workers) with a streamlined 2-layer approach (Main Chat → CLI agents). This reduction eliminates the orchestrator middleman, reducing costs by 67% while maintaining enhanced monitoring and protocol compliance.

**Key Benefits:**
- 67% cost reduction vs Task mode ($0.050/iteration vs $0.150/iteration)
- Direct Redis BLPOP signaling between Main Chat and CLI agents
- Simplified failure recovery and debugging
- Enhanced provider routing with automatic fallback to Z.ai glm-4.6
- Maintained quality gates and validation protocols

## Architecture Comparison

### Legacy Architecture (Deprecated)
```
Main Chat
    ↓
cfn-v3-coordinator
    ↓
orchestrator.sh
    ↓
CLI workers (background)
```

**Problems:**
- Complex coordination overhead
- Multiple failure points
- Higher operational costs
- Background process management complexity

### New CLI Mode Architecture
```
Main Chat
    ↓
CLI agents (direct Redis BLPOP coordination)
```

**Advantages:**
- Single coordination layer
- Direct signaling and debugging
- Lower operational costs
- Simplified recovery procedures

## Quick Start

### Basic CLI Mode Usage

```bash
# Production workflow with standard quality gates
/cfn-loop-cli "Implement JWT authentication" --mode=standard

 Cost-optimized execution with Z.ai provider
/cfn-loop-cli "Batch data processing" --provider=zai

 High-quality security audit
/cfn-loop-cli "Security audit" --provider=max --mode=enterprise
```

### Provider Selection Matrix

| Provider | Cost/1M Tokens | Quality | Use Case |
|----------|---------------|---------|----------|
| `zai` | $0.50 | Standard | Cost optimization, batch processing |
| `kimi` | $2.00 | Mid-range | Balanced development tasks |
| `anthropic` | $15.00 | Premium | Critical security/compliance |
| `openrouter` | Variable | Model-dependent | Access to 400+ models |
| `gemini` | ~$0.30-$1.20 | Google | Google-specific workloads |
| `max` | High | Anthropic | Highest quality requirements |

### Mode Configuration

- `--mode=mvp`: Fast prototyping (70% gates)
- `--mode=standard`: Production features (95% gates)
- `--mode=enterprise`: Security/compliance (98% gates)

## Provider Routing

### Custom Provider Configuration

Enable custom routing to override default Z.ai behavior:

```bash
# Enable custom routing
echo "CFN_CUSTOM_ROUTING=true" >> .env

# Set Main Chat provider (optional)
/switch-api kimi
```

### Agent-Specific Provider Configuration

Add provider parameters to agent profiles:

```xml
<!-- PROVIDER_PARAMETERS
provider: xai
model: grok-beta
-->
```

### Fallback Behavior

When `CFN_CUSTOM_ROUTING=true`:
- Agents without explicit provider parameters use **Z.ai + glm-4.6**
- Main Chat provider selection affects all agents by default
- Provider-specific configuration takes precedence

## Redis Coordination Patterns

### Core Signaling Protocol

CLI mode uses Redis BLPOP for agent coordination:

```bash
# Main Chat blocks on completion signal
redis-cli -h redis -p 6379 BLPOP "cfn-completion:${TASK_ID}" 300

# CLI agent sends completion signal
redis-cli LPUSH "cfn-completion:${TASK_ID}" "{\"status\":\"complete\",\"confidence\":0.95}"
```

### Key Format Patterns

| Pattern | Purpose | Example |
|---------|---------|---------|
| `cfn-completion:${TASK_ID}` | Agent completion signals | `cfn-completion:task-123` |
| `cfn-broadcast:${TASK_ID}` | Context injection | `cfn-broadcast:task-123` |
| `cfn-coordinator:${TASK_ID}` | Legacy coordinator keys | (deprecated) |

### Agent Protocol Requirements

```javascript
// CLI agents must:
// 1. Receive injected context via Redis BLPOP
// 2. Perform work with enhanced monitoring
// 3. Report confidence score and deliverables
// 4. Exit cleanly for process monitoring
```

## Environment Variable Injection

### Required Variables for Multi-Worktree Support

```bash
export COMPOSE_PROJECT_NAME="cfn-${BRANCH}"      # e.g., cfn-feature-auth
export CFN_REDIS_PORT="${CFN_REDIS_PORT}"        # Base port + offset
export CFN_POSTGRES_PORT="${CFN_POSTGRES_PORT}"  # Base port + offset
export WORKTREE_BRANCH="${BRANCH}"               # Git branch name
```

### Automatic Injection Pattern

When spawning CLI agents:

```bash
npx claude-flow-novice agent-spawn backend-dev \
  --task-id "$TASK_ID" \
  --env COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  --env CFN_REDIS_PORT="$CFN_REDIS_PORT" \
  --env CFN_POSTGRES_PORT="$CFN_POSTGRES_PORT"
```

## Protocol Reference

### CLI Mode Redis Completion Protocol

**Message Format:**
```json
{
  "status": "complete|error|failed",
  "confidence": 0.95,
  "deliverables": ["file1.ts", "file2.ts"],
  "metadata": {
    "agent_type": "backend-developer",
    "execution_time": 45.2,
    "memory_usage": "128MB"
  }
}
```

**Completion States:**
- `complete`: Task finished successfully
- `error`: Task completed with errors
- `failed`: Task failed to complete

### Agent Lifecycle Management

```bash
# Agent spawn command (automatically executed)
/cfn-loop-cli "Task description" --provider=kimi --mode=standard

# Enhanced monitoring includes:
# - Process health checking
# - Memory usage tracking
# - Execution time monitoring
# - Automatic recovery on hang
```

## Common Use Cases

### 1. Feature Development

```bash
/cfn-loop-cli "Implement user authentication system" \
  --provider=kimi \
  --mode=standard
```

**Pattern:** Standard quality gates with balanced cost/quality

### 2. Cost-Optimized Batch Processing

```bash
/cfn-loop-cli "Process 10,000 user records for analytics" \
  --provider=zai \
  --mode=mvp
```

**Pattern:** Maximum throughput with minimal cost

### 3. Security Compliance

```bash
/cfn-loop-cli "SOC 2 compliance audit" \
  --provider=max \
  --mode=enterprise
```

**Pattern:** Highest quality gates for critical work

### 4. Multi-Agent Coordination

```bash
/cfn-loop-cli "Implement full CI/CD pipeline" \
  --provider=kimi \
  --mode=standard

# Automatic orchestration:
# 1. Backend developer (API implementation)
# 2. Frontend developer (UI components)
# 3. Tester (integration validation)
# 4. DevOps engineer (deployment pipeline)
```

## Performance Characteristics

### Cost Comparison

| Mode | Cost/Iteration | Gate Threshold | Use Case |
|------|---------------|----------------|----------|
| Task Mode | $0.150 | 95% | Debugging, full visibility |
| CLI Mode | $0.050 | 95% | Production, cost-sensitive |
| CLI + Z.ai | $0.050 | 70-98% | Variable based on mode |

### Execution Speed

- **CLI Mode**: Direct spawning eliminates orchestrator overhead
- **Agent Response**: Typically 30-60% faster than Task mode
- **Recovery**: Automatic restart on hang (configurable timeout)

### Resource Utilization

- **Memory**: Reduced by ~40% (no orchestrator process)
- **Network**: Simplified Redis communication pattern
- **Storage**: Minimal coordination state in Redis

## Security Considerations

### Environment Isolation

- Multi-worktree Docker isolation via `COMPOSE_PROJECT_NAME`
- Redis key scoping by `TASK_ID`
- Database connection isolation

### Provider Security

- **Z.ai**: Enterprise-grade security, cost-optimized
- **Kimi**: Balanced security profile
- **Anthropic/Max**: Highest security standards
- **OpenRouter**: Model-dependent security

### Protocol Security

- Redis communication over internal Docker network
- Task ID sanitization and validation
- Process isolation and resource limits

## Migration Guide

### From Task Mode to CLI Mode

**Simple Migration Pattern:**

```bash
# OLD Task mode (deprecated)
Task("cfn-v3-coordinator", "Execute CFN Loop...")
Task("backend-developer", "Implement feature...")
Task("tester", "Test feature...")

# NEW CLI mode (production)
/cfn-loop-cli "Implement feature" --mode=standard --provider=kimi
```

**Migration Checklist:**

- [ ] Replace all Task() spawning with `/cfn-loop-cli` commands
- [ ] Update team documentation to reflect simplified architecture
- [ ] Configure provider routing for cost optimization
- [ ] Implement Redis coordination monitoring
- [ ] Update CI/CD pipelines to use CLI mode

### Provider Routing Migration

```bash
# Enable custom routing
echo "CFN_CUSTOM_ROUTING=true" >> .env

# Configure default provider (optional)
/switch-api zai

# Migrate specific workflows
/cfn-loop-cli "Legacy task" --provider=kimi --mode=standard
```

## Troubleshooting

### Common Issues

#### 1. Redis Connection Errors

```bash
# Check Redis connectivity
redis-cli -h redis -p 6379 ping

# Restart Redis if needed
docker-compose restart redis
```

#### 2. Agent Hang Detection

```bash
# Monitor agent completion
redis-cli -h redis -p 6379 BLPOP "cfn-completion:${TASK_ID}" 30

# Check stuck processes
docker ps --filter "name=cfn-agent"
```

#### 3. Provider Configuration Issues

```bash
# Verify custom routing
echo $CFN_CUSTOM_ROUTING

# Check provider settings
grep PROVIDER ~/.env

# Test fallback behavior
/cfn-loop-cli "Test provider" --provider=invalid
```

### Debug Mode

```bash
# Enable detailed logging
DEBUG=true ./tests/cli-mode/run-all-tests.sh

# Check coordination logs
tail -100 .artifacts/logs/coordination.log

# Monitor Redis keys
redis-cli --scan --pattern "cfn:*"
```

### Recovery Procedures

#### Stuck Agent Recovery

```bash
# Identify stuck agent
docker logs cfn-agent-$(date +%s)-$$

# Force restart
docker restart cfn-agent-$(date +%s)-$$

# Clear Redis coordination
redis-cli DEL "cfn-completion:${TASK_ID}"
```

#### Provider Fallback

```bash
# Reset to Z.ai fallback
unset CFN_CUSTOM_ROUTING

# Verify fallback behavior
/cfn-loop-cli "Test fallback" --mode=mvp
```

## API Reference

### Slash Command Interface

```bash
/cfn-loop-cli "Task description" [options]

Options:
  --provider {zai|kimi|anthropic|openrouter|max}    AI provider
  --mode {mvp|standard|enterprise}                 Quality gate mode
  --env KEY=VALUE                                  Environment variables
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CFN_CUSTOM_ROUTING` | Enable custom provider routing | `false` |
| `COMPOSE_PROJECT_NAME` | Docker project isolation | `cfn-main` |
| `CFN_REDIS_PORT` | Redis service port | `6379` |
| `CFN_POSTGRES_PORT` | Postgres service port | `5432` |
| `WORKTREE_BRANCH` | Current git branch | `main` |

### Redis Protocol Methods

#### Completion Signal
```bash
# Send completion
redis-cli LPUSH "cfn-completion:${TASK_ID}" '{"status":"complete","confidence":0.95}'

# Wait for completion
redis-cli BLPOP "cfn-completion:${TASK_ID}" 300
```

#### Broadcast Context
```bash
# Send context injection
redis-cli LPUSH "cfn-broadcast:${TASK_ID}" '{"context":"enhanced monitoring"}'

# Receive context
redis-cli BLPOP "cfn-broadcast:${TASK_ID}" 60
```

## Related Documentation

- **CFN Loop Architecture**: `docs/CFN_LOOP_ARCHITECTURE.md`
- **Task Mode Guide**: `.claude/commands/cfn/CFN_LOOP_TASK_MODE.md`
- **Coordinator Parameters**: `.claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md`
- **Custom Provider Routing**: `docs/CUSTOM_PROVIDER_ROUTING.md`
- **Test Suite Overview**: `tests/README.md`

---

*This documentation reflects the CLI mode redefined architecture with 2-layer coordination. For deprecated Task mode coordination, see the CFN Loop Task Mode guide.*