# CFN Architecture Overview

Core patterns for agent orchestration, semantic search, and skill distribution.

## System Layers

```
┌─────────────────────────────────────────┐
│           Slash Commands                │  /cfn-loop-cli, /cfn-loop-task
├─────────────────────────────────────────┤
│           CFN Loop                      │  3-loop: implement → validate → decide
├─────────────────────────────────────────┤
│    Agents          │    Skills          │  Specialists + modular capabilities
├─────────────────────────────────────────┤
│         Coordination Layer              │  Redis (CLI) or Task (direct)
├─────────────────────────────────────────┤
│    RuVector        │    Memory          │  Semantic search + SQLite state
└─────────────────────────────────────────┘
```

## CFN Loop Modes

### CLI Mode (Production)
- Main chat spawns agents via `spawn-agent.sh`
- Redis BLPOP coordination
- Lower cost, async execution

### Task Mode (Debug)
- Direct agent spawning via Task tool
- No Redis, synchronous
- Full visibility, higher cost

## Agent Categories

```
.claude/agents/cfn-dev-team/
├── architecture/     # system-architect, planner
├── developers/       # backend, frontend, database
├── testers/          # playwright, integration, tdd
├── reviewers/        # code-reviewer, security-specialist
├── coordinators/     # consensus-builder, multi-sprint
└── product-owners/   # product-owner, cto-agent
```

## Skill Structure

```
.claude/skills/cfn-*/
├── SKILL.md            # Skill definition (required)
├── *.sh                # Shell entry points
├── *.js/*.ts           # Implementation
├── .cfn-manifest.json  # CFN vs custom file tracking
└── data/               # Runtime data (protected)
```

## RuVector Integration

Semantic codebase search:

```bash
# Index
./.claude/skills/cfn-ruvector-codebase-index/index.sh --full

# Search
./.claude/skills/cfn-ruvector-codebase-index/search.sh "query" --top 5
```

See: `docs/RUVECTOR_ARCHITECTURE.md`

## Provider Routing

Multi-provider support via `CFN_CUSTOM_ROUTING=true`:

| Provider | Use Case |
|----------|----------|
| zai | Cost-optimized default |
| kimi | Balanced quality/cost |
| anthropic | Premium quality |
| openrouter | Broad model access |

## Distribution Pattern

For distributing to other projects:

1. **Skills**: Copy via manifest system
   - `cfn_files` overwritten
   - `protected_files` preserved
   - Custom files untouched

2. **Agents**: Standard CFN agents inherit from CLAUDE.md
   - Project-specific agents can reference RuVector

3. **Documentation**: Update target CLAUDE.md with RuVector section

## Key Interfaces

### Spawning
```bash
./scripts/spawn-agent.sh --agent-type backend-developer --task "..."
```

### Coordination
```bash
# CLI mode signals
redis-cli LPUSH cfn:results:<task-id> '{"status":"completed"}'
```

### Search
```bash
./.claude/skills/cfn-ruvector-codebase-index/search.sh "pattern" --top 10
```

## File Paths

| Purpose | Path |
|---------|------|
| Config | `CLAUDE.md` |
| Agents | `.claude/agents/cfn-dev-team/` |
| Skills | `.claude/skills/cfn-*/` |
| Hooks | `.claude/hooks/cfn-*` |
| Commands | `.claude/commands/` |
| RuVector DB | `.claude/skills/cfn-ruvector-codebase-index/data/` |

## Edit Workflow

Required for all file modifications:

```bash
# Pre-edit backup
BACKUP=$(./.claude/hooks/cfn-invoke-pre-edit.sh "$FILE" --agent-id "$ID")

# Post-edit validation
./.claude/hooks/cfn-invoke-post-edit.sh "$FILE" --agent-id "$ID"
```
