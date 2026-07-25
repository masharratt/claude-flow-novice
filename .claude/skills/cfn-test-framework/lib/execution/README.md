# Test Execution Skill - Agent Usage Guide

**Status:** OPERATIONAL (Specialized Use Case)
**Version:** 1.2.0

## Quick Decision Tree

```
Need to run tests?
│
├─ Single agent working alone?
│  └─ Use: npm test
│
├─ Code validation after edit?
│  └─ Use: ./.claude/hooks/invoke-post-edit.sh
│
└─ 3+ agents need test results simultaneously?
   └─ Use: This skill (coordinator pattern)
```

## When to Use This Skill

**USE when:**
- 3+ agents need test results at the same time
- Multi-agent swarms testing in parallel
- Preventing port/resource conflicts is critical
- Distributed testing environments

**DO NOT USE when:**
- Working alone → Use `npm test`
- Validating code → Use post-edit hooks
- Simple testing → Use `npm test`

## Usage

### Coordinator Agent (ONE agent only)

```bash
# Run tests once and cache results
./.claude/skills/test-execution/test-coordinator-pattern.sh swarm-123
```

**What it does:**
1. Kills existing test processes
2. Runs `npm test -- --run --reporter=json`
3. Caches results to Redis and JSON file
4. Publishes completion signal

### Worker Agents (ALL other agents)

```bash
# Read cached test results (waits for coordinator)
./.claude/skills/test-execution/test-cache-reader.sh swarm-123 worker-1
```

**What it does:**
1. Waits for coordinator completion signal (max 5min)
2. Reads cached results from Redis or file
3. Returns test results to agent
4. Never runs tests (reads only)

## Example Swarm Workflow

**Scenario:** 5 agents need test coverage before deploying

```bash
# Agent 1 (Coordinator)
./.claude/skills/test-execution/test-coordinator-pattern.sh deploy-swarm-456

# Agents 2-5 (Workers)
./.claude/skills/test-execution/test-cache-reader.sh deploy-swarm-456 agent-2
./.claude/skills/test-execution/test-cache-reader.sh deploy-swarm-456 agent-3
./.claude/skills/test-execution/test-cache-reader.sh deploy-swarm-456 agent-4
./.claude/skills/test-execution/test-cache-reader.sh deploy-swarm-456 agent-5
```

**Result:** Tests run once, all 5 agents get results, zero conflicts

## Validation

Test the coordinator pattern works correctly:

```bash
./.claude/skills/test-execution/test-concurrent-conflicts.sh
```

**Expected:** 20/20 runs with zero conflicts

## Current Project Status

**Note:** This project currently has:
- No active tests in `/src` (all in `/legacy`)
- Jest configured but not used
- Post-edit hooks handle TypeScript validation

**Recommendation:** Use `npm test` directly for development. This skill is available when multi-agent testing becomes necessary.

## Integration with Other Skills

- **Redis Coordination:** Shares Redis pub/sub infrastructure
- **Post-Edit Hooks:** Use for TypeScript validation (simpler)
- **CFN Loop Validation:** Can integrate test results into consensus

## Performance

- Test execution: 1x instead of Nx (N = agents)
- Cache read latency: <100ms
- Conflict prevention: 100%
- Resource savings: ~90%

## Troubleshooting

**Workers timeout waiting for results:**
- Check coordinator ran successfully
- Verify Redis is running: `redis-cli ping`
- Check test-results.json exists

**Test conflicts still occurring:**
- Ensure only ONE agent uses coordinator script
- Verify all other agents use cache-reader script
- Run validation: `test-concurrent-conflicts.sh`

## Files

- `SKILL.md` - Full skill documentation
- `test-coordinator-pattern.sh` - Coordinator script
- `test-cache-reader.sh` - Worker script
- `test-concurrent-conflicts.sh` - Validation test
- `README.md` - This file
