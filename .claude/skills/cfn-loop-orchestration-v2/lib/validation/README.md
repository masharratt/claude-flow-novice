# CFN Loop Validation Skill

## Overview
Advanced validation framework for iterative development workflows with dynamic consensus calculation, multi-mode validation, and adaptive quality assurance.

## Status
**OPERATIONAL** - Agent-accessible via CLI wrapper

## Dependencies

### Required
- **Node.js** >= 18.0.0 (Runtime for consensus calculator)
- **Bash** >= 4.0 (Shell wrapper scripts)
- **jq** (JSON parsing and processing)
- **SQLite3** (Evidence chain persistence)
- **bc** (Basic calculator for threshold comparisons)

### Optional (for enhanced features)
- **Redis** (For distributed validation coordination)
  - Package: `redis-server` and `redis-cli`
  - Purpose: Publishing validation events to swarm

## Installation

### Install Required Dependencies

```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Install jq (JSON processor)
# Ubuntu/Debian
sudo apt-get install jq bc sqlite3

# macOS
brew install jq bc sqlite3

# Windows (WSL)
sudo apt-get install jq bc sqlite3
```

### Install Optional Dependencies

```bash
# Install Redis for distributed coordination
# Ubuntu/Debian
sudo apt-get install redis-server redis-tools

# macOS
brew install redis

# Start Redis
redis-server &
```

### Verify Installation

```bash
# Check Node.js
node --version  # Should be >= 18.0.0

# Check jq
jq --version  # Should show version info

# Check bc
bc --version  # Should show version info

# Check SQLite
sqlite3 --version  # Should show version info

# Check Redis (optional)
redis-cli ping  # Should return "PONG"

# Test CFN validation CLI
$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation/validate-iteration.sh --help
```

## Quick Start

### Validate Loop 3 Confidence Gate

```bash
# MVP mode (low threshold, fast iteration)
$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation/validate-iteration.sh \
  --mode mvp \
  --iteration 1 \
  --confidence 0.75 \
  --task-id feature-auth

# Standard mode (balanced quality)
$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation/validate-iteration.sh \
  --mode standard \
  --iteration 2 \
  --confidence 0.85 \
  --task-id feature-auth

# Enterprise mode (high quality, strict validation)
$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation/validate-iteration.sh \
  --mode enterprise \
  --iteration 1 \
  --confidence 0.92 \
  --task-id compliance-system
```

### Validate Loop 2 Consensus

```bash
# Validate consensus from validator swarm
$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation/validate-iteration.sh \
  --mode standard \
  --iteration 2 \
  --confidence 0.85 \
  --consensus 0.92 \
  --task-id feature-auth \
  --json
```

### JSON Output for Agent Parsing

```bash
# Get JSON output for programmatic use
RESULT=$($HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation/validate-iteration.sh \
  --mode standard \
  --iteration 1 \
  --confidence 0.85 \
  --json)

# Parse result
echo "$RESULT" | jq -r '.passed'  # true/false
echo "$RESULT" | jq -r '.status'  # PASS/FAIL/MAX_ITERATIONS_EXCEEDED
```

## Validation Modes

| Mode | Gate Threshold | Consensus | Max Iterations | Validators |
|------|----------------|-----------|----------------|------------|
| **MVP** | ≥0.70 | ≥0.85 | 5 | 2 |
| **Standard** | ≥0.80 | ≥0.90 | 10 | 4 |
| **Enterprise** | ≥0.90 | ≥0.95 | 15 | 5-8 |

### Mode Selection Guide

**MVP Mode:**
- Proof of concepts
- Rapid prototyping
- Learning and experimentation

**Standard Mode:**
- Production applications
- Team collaboration
- Quality-focused development

**Enterprise Mode:**
- Financial systems
- Healthcare applications
- Compliance-critical systems

## Exit Codes

| Code | Status | Meaning | Action |
|------|--------|---------|--------|
| 0 | PASS | Validation passed | Continue workflow |
| 1 | FAIL | Score below threshold | Inject feedback, retry |
| 2 | MAX_ITERATIONS_EXCEEDED | Too many attempts | Escalate to human |
| 3 | Invalid arguments | Bad CLI input | Fix arguments |
| 4 | Configuration error | Config file issue | Check config.json |

## Common Issues

### Issue: "jq: command not found"
**Solution:** Install jq

```bash
# Ubuntu/Debian
sudo apt-get install jq

# macOS
brew install jq
```

### Issue: "bc: command not found"
**Solution:** Install bc (basic calculator)

```bash
# Ubuntu/Debian
sudo apt-get install bc

# macOS
brew install bc
```

### Issue: "Config file not found"
**Solution:** Verify config.json exists

```bash
ls -la $HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation/config.json
```

### Issue: "Permission denied"
**Solution:** Make script executable

```bash
chmod +x $HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation/validate-iteration.sh
```

### Issue: SQLite database errors
**Solution:** Ensure SQLite3 is installed and database directory exists

```bash
# Install SQLite3
sudo apt-get install sqlite3  # Ubuntu/Debian
brew install sqlite3          # macOS

# Create database directory
mkdir -p $HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation/

# Verify database can be accessed
sqlite3 $HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation/evidence-chain.db "SELECT 1;"
```

## Evidence Chain Persistence

Validation results are automatically stored in SQLite for audit trails:

```bash
# Query validation history
sqlite3 $HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation/evidence-chain.db \
  "SELECT task_id, iteration, confidence, status, timestamp
   FROM validation_evidence
   WHERE task_id = 'feature-auth'
   ORDER BY timestamp DESC;"
```

## Documentation
See `SKILL.md` for comprehensive documentation including:
- Validation workflow patterns
- Integration with coordinator agents
- Evidence chain schema
- Redis integration for async validation
- Performance targets and telemetry

## Performance Targets
- Average execution time: <500ms
- Memory footprint: <50MB
- Consensus accuracy: >90%
- SQLite write latency: <20ms

## Related Skills
- **Agent Spawning** - `.claude/skills/agent-spawning/SKILL.md`
- **Redis Coordination** - `.claude/skills/redis-coordination/SKILL.md`
- **Hook Pipeline** - `.claude/skills/hook-pipeline/SKILL.md`

---
**Version:** 2.0.0
**Last Updated:** 2025-10-18
**Maintainer:** Claude Flow Novice Team
