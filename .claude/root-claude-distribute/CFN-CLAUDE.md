# Claude Flow Novice — CFN Operating Guide

**Version:** 2.21.0 | **Last Updated:** 2026-03-11

---

## Documentation Organization

| File | Purpose |
|------|---------|
| `~/.claude/CLAUDE.md` (this file) | Global CFN standards, processes, common patterns |
| `cfn-system-expert.md` | CFN Loop methodology, coordination protocols, troubleshooting |
| Project `CLAUDE.md` | Project-specific configuration, ports, credentials |

---

## 1. Critical Rules

### Agent Usage Triggers
Use agents/CFN Loops for ANY task that is:
- ≥4 steps OR multi-file OR research+implement+test
- Design decisions, code review, security, performance
- System integration, refactoring, feature work

### Core Operational Rules
- **Batch operations**: one message per related batch (spawns, edits, bash, todos)
- **Never work solo** on multi-step tasks
- **Never mix implementers and validators** in same message
- **Never run tests inside agents** — coordinator executes, agents read results
- **Never save to project root** — use proper subdirs
- **No guides/summaries/reports** unless explicitly asked
- **Use CodeSearch FIRST** (400x faster than grep) — query `~/.local/share/codesearch/index_v2.db`
- **Redact secrets** as `[REDACTED]`
- **USE GREP INSTEAD OF FIND** — less resource intensive in WSL2

### Pre-Edit Backup (REQUIRED)
```bash
BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "$FILE" --agent-id "$AGENT_ID")
```

### Post-Edit Validation (REQUIRED)
```bash
./.claude/hooks/cfn-invoke-post-edit.sh "$FILE" --agent-id "$AGENT_ID"
```

### Consensus Thresholds
- Gate (agent self-confidence): **≥0.75**
- Validators consensus: **≥0.90**

### SQLite Lifecycle (Task Mode)
Database: `~/.claude/cfn-data/cfn-loop.db`

```sql
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence REAL,
    spawned_at TEXT,
    completed_at TEXT,
    metadata TEXT
);
```

---

## 2. CFN Loop Execution Modes

### Task Mode (Debugging)
```bash
/cfn-loop-task "description" --mode=standard
```
- Main Chat spawns ALL agents via Task()
- No coordinator agent
- Full visibility in Main Chat
- Use: Debugging, learning, short tasks

### CLI Mode (Production)
```bash
/cfn-loop-cli "description" --mode=standard
```
- Main Chat spawns ONLY cfn-v3-coordinator
- Coordinator spawns workers via CLI
- Background execution with persistence
- Use: Production, long tasks, cost-sensitive

### Mode Selection
| Need | Mode |
|------|------|
| Debugging/learning | Task |
| Production/cost-sensitive | CLI |
| Custom routing (95-98% savings) | CLI with `CFN_CUSTOM_ROUTING=true` |

### Mode Comparison
| Mode | Gate | Consensus | Iterations | Validators |
|------|------|-----------|------------|------------|
| MVP | ≥0.70 | ≥0.80 | 5 | 2 |
| Standard | ≥0.75 | ≥0.90 | 10 | 3-4 |
| Enterprise | ≥0.85 | ≥0.95 | 15 | 5 |

---

## 3. Namespace Isolation (v2.21.0)

| Type | Location | Count |
|------|----------|-------|
| Agents | `~/.claude/agents/cfn-dev-team/` | 67 |
| Skills | `~/.claude/skills/cfn-*/` | 85+ |
| Hooks | `~/.claude/hooks/cfn-*` | 23 |
| Commands | `~/.claude/commands/` | 22+ |

---

## 4. Skills-Based Coordination

**Core Skills:**
- `cfn-coordination` — Redis coordination patterns
- `cfn-agent-spawning` — Agent lifecycle management
- `cfn-loop-validation` — Consensus collection
- `cfn-codesearch` — Semantic codebase search (MANDATORY first)
- `cfn-error-management` — 13 error type categories
- `cfn-loop-orchestration-v2` — Current orchestrator

**Orchestration:**
- Local MDAP (no external dependencies)
- SQLite for persistence: `~/.claude/cfn-data/cfn-loop.db`

---

## 5. Agent Output Standards

| Type | Path |
|------|------|
| Bugs | `docs/BUG_#_*.md` |
| Tests | `tests/test-*.sh` |
| Features | `docs/FEATURE_*.md` |
| Temp | `/tmp/` ONLY |

---

## 6. Custom Provider Routing

```bash
# Enable custom routing
echo "CFN_CUSTOM_ROUTING=true" >> .env

# Switch Main Chat provider
/switch-api kimi  # or zai, openrouter, max
```

| Provider | Cost | Use Case |
|----------|------|----------|
| zai | $0.50/1M tokens | Default, cost-optimized |
| kimi | $2/1M tokens | Mid-range |
| openrouter | Varies | Access 400+ models |
| anthropic | $15/1M tokens | Premium |

---

## 7. CodeSearch (MANDATORY)

**Query BEFORE grep/glob/find:**
```bash
/codebase-search "query" --top 5
```

- Location: `~/.local/share/codesearch/index_v2.db`
- Speed: 400x faster than grep
- Update index: `/codebase-reindex`

---

## 8. WSL Memory Monitor

Background process kills test runner memory leaks on session start.

| Command | Purpose |
|---------|---------|
| `~/.local/bin/wsl-memory-monitor.sh --status` | Check status |
| `/tmp/wsl-memory-monitor.log` | Log file |

Thresholds:
- `>10%` memory (node test processes) → killed
- Parent with test children `>15%` combined → children killed

---

## 9. Security

- Validate inputs: type, size, permissions
- Redact: credentials, tokens, PII → `[REDACTED]`
- Rollback: use backup scripts, NOT `git checkout`
- NEVER hardcode API keys

---

## 10. Project Port Assignments

To prevent conflicts when running multiple frontends concurrently, each project has dedicated port ranges.

### Port Ranges

| Project | Frontend Ports | Services | Notes |
|---------|---------------|----------|-------|
| **fireside-family** | 3100-3109 | 8080-8090, 9093 | 10 frontends allocated |
| **daily-platform** | 3200-3209 | 8002, 5432, 6379 | 10 frontends allocated |
| daily-automations | — | 8080 | API only |
| daily-coverage | 3000 | — | Single frontend |
| daily-dashboards | 3000-3001 | 6379 | Existing assignment |
| daily-seo | 4000, 3090 | 6333 | Existing assignment |

### fireside-family Ports (3100-3109)
| Port | Service | Purpose |
|------|---------|---------|
| 3100 | Main Web | Primary React frontend |
| 3101 | Admin | Admin dashboard |
| 3102 | Mobile Dev | Expo dev server |
| 3103 | Storybook | Component library |
| 3104 | Docs | Documentation site |
| 3105 | Preview | PR previews |
| 3106 | E2E Tests | Playwright tests |
| 3107 | Staging | Staging frontend |
| 3108 | Analytics Dashboard | Internal analytics |
| 3109 | Reserved | Future use |

### daily-platform Ports (3200-3209)
| Port | Service | Purpose |
|------|---------|---------|
| 3200 | Main Web | Primary frontend |
| 3201 | Admin | Admin dashboard |
| 3202 | API Docs | OpenAPI/Swagger |
| 3203 | Storybook | Component library |
| 3204 | Docs | Documentation site |
| 3205 | Preview | PR previews |
| 3206 | E2E Tests | Playwright tests |
| 3207 | Staging | Staging frontend |
| 3208 | Dashboard | Internal dashboard |
| 3209 | Reserved | Future use |

### Existing Service Ports (Do Not Reassign)
| Project | Port | Service |
|---------|------|---------|
| fireside-family | 8080-8090 | Rust microservices |
| fireside-family | 9093 | Prometheus |
| fireside-family | 3000 | Backend API (legacy) |
| daily-automations | 8080 | API |
| daily-platform | 8002 | API |
| daily-platform | 5432 | PostgreSQL |
| daily-platform | 6379 | Redis |

---

## 11. General Programming Best Practices

### Shell Scripting
- **Strict Mode**: `set -euo pipefail`
- **Benefits**: Exit on errors, catch unset vars, capture pipeline failures

### Regex Validation
- **Anti-Pattern**: `[[ $VAR =~ $VAR ]]` (always true)
- **Solution**: Use specific, non-self-referencing patterns

### Process Management
- Use `trap` for signal handling
- Implement process group management for clean termination
- Prevent zombie processes and resource leaks

### File Validation
- Multi-stage: type, permissions, size, content integrity
- Prevents security vulnerabilities and unexpected behavior

---

## 12. Additional Resources

**Skill References:**
- Coordination Protocols: `~/.claude/skills/cfn-coordination/SKILL.md`
- Agent Spawning: `~/.claude/skills/cfn-agent-spawning/SKILL.md`
- CFN Loop Validation: `~/.claude/skills/cfn-loop-validation/SKILL.md`

**CFN Loop Documentation:**
- Task Mode Guide: `~/.claude/commands/CFN_LOOP_TASK_MODE.md`
- Coordinator Parameters: `~/.claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md`
