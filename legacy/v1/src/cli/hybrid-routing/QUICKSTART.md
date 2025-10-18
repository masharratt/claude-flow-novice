# Hybrid Routing CLI - Quick Start Guide

Get started with real Claude agent spawning in 5 minutes.

## Prerequisites

```bash
# 1. Install dependencies (already done if you have the project)
npm install redis

# 2. Set API key (choose provider)
export Z_AI_API_KEY=your-zai-api-key        # Recommended ($0.50/1M tokens)
# OR
export ANTHROPIC_API_KEY=your-anthropic-key  # ($15/1M tokens)

# 3. Optional: Start Redis for coordination
redis-server --daemonize yes
```

## Basic Usage

### 1. Test Help

```bash
node src/cli/hybrid-routing/spawn-workers.js --help
```

### 2. Spawn Single Worker (Test)

```bash
node src/cli/hybrid-routing/spawn-workers.js "Simple test task" --max-agents=1
```

### 3. Authentication System (5 Workers)

```bash
node src/cli/hybrid-routing/spawn-workers.js "Build authentication system" --max-agents=5
```

**Output Example:**
```
🚀 Spawning 5 workers for task: "Build authentication system"
📡 Provider: zai

📥 Worker 1 completed: confidence 0.85 (1200 tokens, $0.000600)
📥 Worker 2 completed: confidence 0.82 (1100 tokens, $0.000550)
📥 Worker 3 completed: confidence 0.88 (1300 tokens, $0.000650)
📥 Worker 4 completed: confidence 0.80 (1150 tokens, $0.000575)
📥 Worker 5 completed: confidence 0.86 (1250 tokens, $0.000625)

✅ SUCCESS - 100% workers completed
🎯 Final Confidence: 0.84
💰 Total Cost: $0.0030
```

## Common Tasks

### Authentication Systems

```bash
node src/cli/hybrid-routing/spawn-workers.js "Build auth with JWT and sessions" --max-agents=5
```

Spawns workers for:
- JWT token generation/validation
- Session management
- Rate limiting
- Password hashing
- Authentication tests

### REST API Development

```bash
node src/cli/hybrid-routing/spawn-workers.js "Create REST API for e-commerce" --max-agents=5
```

Spawns workers for:
- API endpoint design
- CRUD operations
- Input validation
- API documentation
- Integration tests

### Code Analysis

```bash
node src/cli/hybrid-routing/spawn-workers.js "Analyze codebase for issues" --max-agents=4
```

Spawns workers for:
- Architecture analysis
- Security vulnerability scan
- Code quality check
- Performance analysis

## Advanced Usage

### Custom Provider

```bash
# Use Anthropic instead of z.ai
node src/cli/hybrid-routing/spawn-workers.js "Task" --max-agents=3 --provider=anthropic
```

### Custom Redis Channel

```bash
# Coordinate on specific channel
node src/cli/hybrid-routing/spawn-workers.js "Task" --redis-channel=swarm:custom:workers
```

### Custom Model

```bash
# Use specific Claude model
node src/cli/hybrid-routing/spawn-workers.js "Task" --model=haiku
```

## Integration with CFN Loop

### Loop 3 Coordinator Pattern

```javascript
// Spawn coordinator via Task tool
Task("CFN-Loop3-Coordinator",
  `Lead authentication implementation.

   Execute: node src/cli/hybrid-routing/spawn-workers.js \\
     "Implement auth: JWT, sessions, rate-limiting" \\
     --max-agents=5 --provider=zai --redis-channel=swarm:auth

   Monitor Redis for completion events.
   Report final confidence when all workers ≥0.75.`,
  "coordinator"
)
```

## Troubleshooting

### Problem: API Key Not Found

```
Error: API key not found for provider: zai. Set Z_AI_API_KEY in .env
```

**Solution:**
```bash
export Z_AI_API_KEY=your-key-here
```

### Problem: Redis Connection Failed

```
⚠️ Redis unavailable, continuing without coordination
```

**Solution:** This is just a warning. Script continues without Redis.

To fix:
```bash
redis-server --daemonize yes
```

### Problem: SQLite Error

```
⚠️ SQLite unavailable, continuing without memory storage
```

**Solution:** This is just a warning. Script continues without SQLite.

## Cost Calculator

### Z.ai Provider (Default)

| Workers | Tokens/Worker | Total Tokens | Cost |
|---------|---------------|--------------|------|
| 1 | 1,200 | 1,200 | $0.0006 |
| 3 | 1,200 | 3,600 | $0.0018 |
| 5 | 1,200 | 6,000 | $0.0030 |
| 10 | 1,200 | 12,000 | $0.0060 |

### Anthropic Provider

| Workers | Tokens/Worker | Total Tokens | Cost |
|---------|---------------|--------------|------|
| 1 | 1,200 | 1,200 | $0.0108 |
| 3 | 1,200 | 3,600 | $0.0324 |
| 5 | 1,200 | 6,000 | $0.0540 |
| 10 | 1,200 | 12,000 | $0.1080 |

**Savings: 94% with z.ai**

## Confidence Thresholds

| Confidence | Meaning | Action |
|------------|---------|--------|
| ≥ 0.85 | Excellent | Proceed to Loop 2 |
| 0.75-0.84 | Good | Proceed with minor fixes |
| 0.65-0.74 | Fair | Review and retry |
| < 0.65 | Poor | Relaunch with different approach |

## Exit Codes

- **0:** Average confidence ≥ 0.75 (success)
- **1:** Average confidence < 0.75 or fatal error

## Next Steps

1. ✅ Test with simple task
2. ✅ Verify API key works
3. ✅ Monitor token usage
4. ✅ Check confidence scores
5. ✅ Integrate with CFN Loop

## Support

- **Documentation:** `src/cli/hybrid-routing/README.md`
- **Implementation Report:** `src/cli/hybrid-routing/IMPLEMENTATION_REPORT.md`
- **Help:** `node src/cli/hybrid-routing/spawn-workers.js --help`

---

**Quick Reference:**

```bash
# Basic
node src/cli/hybrid-routing/spawn-workers.js "Task" --max-agents=N

# With provider
--provider=zai|anthropic

# With Redis channel
--redis-channel=swarm:custom

# With model
--model=haiku
```
