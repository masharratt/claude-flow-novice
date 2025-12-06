# Claude Flow Novice

AI agent orchestration with namespace-isolated skills, multi-agent coordination, and semantic codebase search.

## Install

```bash
npm install claude-flow-novice
```

## Core Features

- **CFN Loop**: 3-loop self-correcting workflow (implement → validate → decide)
- **RuVector**: Semantic codebase search via embeddings
- **Skills**: Modular capabilities in `.claude/skills/`
- **Agents**: Specialist agents in `.claude/agents/`
- **Provider Routing**: Z.ai, Kimi, OpenRouter, Anthropic

## Quick Start

```bash
# Initialize project
npx cfn-init

# Index codebase for semantic search
./.claude/skills/cfn-ruvector-codebase-index/index.sh --full

# Search codebase
./.claude/skills/cfn-ruvector-codebase-index/search.sh "authentication logic" --top 5

# Run CFN Loop (CLI mode - cost optimized)
/cfn-loop-cli "Implement feature X" --mode=standard

# Run CFN Loop (Task mode - full visibility)
/cfn-loop-task "Debug issue Y" --mode=standard
```

## Architecture

```
claude-flow-novice/
├── src/                    # TypeScript source
│   ├── ruvector/          # Semantic search module
│   ├── agents/            # Agent spawning
│   ├── coordination/      # Redis coordination
│   └── cfn-loop/          # Loop orchestration
├── .claude/
│   ├── agents/            # Agent definitions
│   ├── skills/            # Skill modules
│   ├── commands/          # Slash commands
│   └── hooks/             # Edit hooks
└── dist/                  # Compiled output
```

## RuVector Codebase Search

Semantic search using OpenAI embeddings (text-embedding-3-small).

```bash
# Full reindex
./.claude/skills/cfn-ruvector-codebase-index/index.sh --full

# Incremental (git changes only)
/cfn-ruvector:codebase-reindex

# Search
./.claude/skills/cfn-ruvector-codebase-index/search.sh "React components" --top 10
```

**Manifest System**: `.cfn-manifest.json` tracks CFN vs custom files. Custom files preserved during updates.

## CFN Loop Modes

| Mode | Command | Use Case |
|------|---------|----------|
| CLI | `/cfn-loop-cli` | Production, cost-optimized |
| Task | `/cfn-loop-task` | Debugging, full visibility |

## Provider Routing

Set `CFN_CUSTOM_ROUTING=true` in `.env`, then:

```bash
/switch-api kimi    # Switch provider
/cfn-loop-cli "Task" --provider kimi
```

Options: `zai`, `kimi`, `openrouter`, `anthropic`, `gemini`, `xai`

## Key Paths

- Config: `CLAUDE.md`
- Agents: `.claude/agents/cfn-dev-team/`
- Skills: `.claude/skills/cfn-*/`
- Hooks: `.claude/hooks/cfn-*`
- RuVector data: `.claude/skills/cfn-ruvector-codebase-index/data/`

## Requirements

- Node.js >= 18
- Redis (for CLI mode coordination)
- `OPENAI_API_KEY` or `ZAI_API_KEY` (for embeddings)

## License

MIT
