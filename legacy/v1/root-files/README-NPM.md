# Claude Flow Novice - NPM Package Documentation

## Overview
`claude-flow-novice` is an AI agent orchestration CLI providing cost-optimized multi-agent coordination, CFN Loop workflows, and distributed consensus mechanisms.

**Current Version**: 2.5.0
**Auto-sync**: Enabled on install
**Repository**: https://github.com/anthropic/claude-flow-novice

## Quick Start

```bash
# Install package
npm install claude-flow-novice

# Auto-syncs on install:
# ✅ .claude/agents/     → Your project
# ✅ .claude/commands/   → Your project
# ✅ config/hooks/       → Your project

# Verify installation
npx claude-flow-cost-savings status
npx claude-flow-sync --help
```

## Package Structure

```
node_modules/claude-flow-novice/
├── CLAUDE.md              # Template configuration
├── README.md              # Main documentation
├── SYNC_USAGE.md          # Sync guide
├── .claude/               # Agents & commands (auto-synced)
│   ├── agents/            # 96+ specialized agents
│   └── commands/          # 201+ slash commands
├── config/                # Hooks (auto-synced)
│   └── hooks/             # 39 validation hooks
├── scripts/               # Utility scripts
│   ├── postinstall.js     # Auto-sync on install
│   ├── sync-from-package.js
│   ├── toggle-cost-savings.cjs
│   └── validate-agent-hooks.js
├── src/                   # Source code
│   └── cli/hybrid-routing/
│       └── spawn-workers.js
└── readme/                # Documentation
    ├── additional-commands.md
    ├── CFN_LOOP_CHEATSHEET.md
    └── logs-*.md
```

## Available CLI Commands

### Core Commands
```bash
# Sync agents/commands/hooks (manual trigger)
npx claude-flow-sync --backup

# Agent spawning (cost-optimized)
npx claude-flow-spawn "Build auth" --agents=coder,tester --provider zai

# Cost-savings mode
npx claude-flow-cost-savings on      # Enable CLI spawning
npx claude-flow-cost-savings off     # Disable CLI spawning
npx claude-flow-cost-savings status  # Check mode

# Hook validation
npx claude-flow-validate-hooks --all
```

### Package.json Configuration

**Current v2.5.0**:
```json
{
  "name": "claude-flow-novice",
  "version": "2.5.0",
  "bin": {
    "claude-flow-novice": "./src/cli/index.ts",
    "claude-flow-sync": "./scripts/sync-from-package.js",
    "claude-flow-spawn": "./src/cli/hybrid-routing/spawn-workers.js",
    "claude-flow-cost-savings": "./scripts/toggle-cost-savings.cjs",
    "claude-flow-validate-hooks": "./scripts/validate-agent-hooks.js"
  },
  "files": [
    "src",
    "README.md",
    "CHANGELOG.md",
    "CLAUDE.md",
    "LICENSE",
    "SYNC_USAGE.md",
    "config",
    "scripts",
    ".claude",
    "readme"
  ],
  "scripts": {
    "postinstall": "node scripts/postinstall.js"
  },
  "dependencies": {
    "ioredis": "^5.8.1",
    "redis": "^4.7.0",
    "socket.io-client": "^4.8.1"
  },
  "peerDependencies": {
    "better-sqlite3": "^11.0.0"
  }
}
```

## Auto-Sync System

### How It Works

**On `npm install`**:
1. Detects if installed as dependency (skips in dev mode)
2. Creates timestamped backups of existing files
3. Syncs `.claude/agents/`, `.claude/commands/`, `config/hooks/`
4. Syncs `.claude/*.md` reference files (cfn-loop-rules, coordinator-patterns, ace-system-overview, etc.)
5. Logs sync activity

**Backup Format**: `<directory>.backup-YYYY-MM-DD`

Example:
```bash
npm install claude-flow-novice
# Output:
# [Claude Flow] Auto-syncing agents, commands, and hooks...
# [Claude Flow] Created backup: .claude/agents.backup-2025-10-18
# [Claude Flow] Synced agents/ to project
# [Claude Flow] Created backup: .claude/commands.backup-2025-10-18
# [Claude Flow] Synced commands/ to project
# [Claude Flow] Created backup: config/hooks.backup-2025-10-18
# [Claude Flow] Synced hooks/ to project
```

### Manual Sync

```bash
# Full sync with backup
npx claude-flow-sync --backup

# Selective sync
npx claude-flow-sync --agents --backup
npx claude-flow-sync --commands --force
npx claude-flow-sync --hooks

# Help
npx claude-flow-sync --help
```

## Dependencies

### Runtime Dependencies
- **ioredis** (^5.8.1): Redis client for coordination
- **redis** (^4.7.0): Redis client for spawn-workers
- **socket.io-client** (^4.8.1): WebSocket coordination

### Peer Dependencies (Optional)
- **better-sqlite3** (^11.0.0): SQLite memory system

### System Requirements
- **Node.js**: >=18.0.0
- **npm**: >=9.0.0
- **Redis**: Optional (for cost-optimized spawning)

## Cost-Optimized Spawning

### Overview
Use CLI-based agent spawning with z.ai provider for 97% cost reduction.

**Architecture**:
- Coordinator: Runs in main chat (Claude Max, $0)
- Workers: Spawned via CLI (z.ai, $0.50/1M tokens)
- Coordination: Redis pub/sub messaging

### Usage

```bash
# Enable cost-savings mode
npx claude-flow-cost-savings on

# Check status
npx claude-flow-cost-savings status

# Spawn agents
npx claude-flow-spawn "Build auth system" \
  --agents=coder,tester,reviewer \
  --provider zai \
  --max-agents 3
```

### Mode Toggle

**Affects**:
- CLAUDE.md sections (injects CLI patterns)
- Spawning pattern (Task tool vs CLI)
- Provider selection (main vs zai)

## File Distribution

### What Gets Synced to Project

**Automatically on install**:
```
your-project/
├── .claude/
│   ├── agents/                        # 96+ agent definitions
│   ├── commands/                      # 201+ slash commands
│   ├── cfn-loop-rules.md              # CFN Loop reference
│   ├── cfn-mode-patterns.md           # Mode patterns
│   ├── coordinator-feedback-pattern.md # Feedback patterns
│   ├── coordinator-patterns.md        # Coordinator patterns
│   ├── redis-agent-dependencies.md    # Redis dependencies
│   ├── spawn-pattern-examples.md      # Spawn examples
│   └── ace-system-overview.md         # ACE learning system
└── config/
    └── hooks/                         # 39 validation hooks
```

**Stays in node_modules**:
```
node_modules/claude-flow-novice/
├── src/                 # Source code (for CLI)
├── scripts/             # Utility scripts (via npx)
├── readme/              # Documentation
└── CLAUDE.md            # Template (copy manually if needed)
```

### Customization Workflow

1. **Install package**: `npm install claude-flow-novice`
2. **Auto-sync runs**: Creates `.claude/` and `config/` in your project
3. **Customize files**: Edit agents, commands, hooks as needed
4. **Update package**: `npm update claude-flow-novice`
5. **Re-sync**: `npx claude-flow-sync --backup` (creates backup first)

## Slash Commands

**201+ commands available** after sync to `.claude/commands/`

Categories:
- CFN Loop (7 commands)
- Swarm Management (15 commands)
- GitHub Integration (20 commands)
- Memory Management (8 commands)
- Performance Optimization (12 commands)
- Testing & Validation (18 commands)

Full list: `readme/logs-slash-commands.md`

## Validation Hooks

**39 hooks** in `config/hooks/` (auto-synced)

Key hooks:
- `post-edit-pipeline.js` - TDD validation, security, formatting
- `post-spawn-validation.js` - Agent registration validation
- `pre-tool-validation.js` - Tool call safety checks
- `safety-validator.js` - OWASP/CWE security scanning

## Agents

**96+ specialized agents** in `.claude/agents/` (auto-synced)

Categories:
- Core (12 agents): analyst, architect, coder, tester, reviewer
- CFN Loop (5 agents): coordinators (MVP/Standard/Enterprise)
- Testing (8 agents): TDD, playwright, production validation
- Security (3 agents): security specialist, compliance
- Consensus (7 agents): Byzantine, Raft, CRDT, Gossip
- Specialized (20+ agents): mobile, rust, devops, npm

## Distribution Checklist

### Pre-Publication
- [x] Version bumped
- [x] CHANGELOG.md updated
- [x] Dependencies verified
- [x] Auto-sync tested
- [x] CLI commands work via npx
- [x] All files in package.json "files" array
- [x] No hardcoded paths
- [x] .npmignore excludes dev files

### Post-Publication
- [x] Install test: `npm install claude-flow-novice@latest`
- [x] Auto-sync verification
- [x] CLI commands: `npx claude-flow-*`
- [x] File structure in destination

## Troubleshooting

### Auto-sync didn't run
```bash
# Check if dev mode (syncs only as dependency)
cat package.json | grep '"name"'  # If "claude-flow-novice", skips

# Manual sync
npx claude-flow-sync --backup
```

### Commands not found
```bash
# Verify installation
npm list claude-flow-novice

# Check bin links
ls -la node_modules/.bin/claude-flow-*
```

### Missing dependencies
```bash
# Redis not found
npm install redis ioredis

# SQLite not found (optional)
npm install better-sqlite3
```

### Files not syncing
```bash
# Check source exists
ls node_modules/claude-flow-novice/.claude/agents

# Run sync with verbose
npx claude-flow-sync --backup
```

## Version History

### v2.5.0 (Current)
- ✅ Auto-sync on install via postinstall script
- ✅ All CLI commands via npx
- ✅ CLAUDE.md in package root
- ✅ Complete dependency declarations
- ✅ Timestamped backups

### v2.4.3
- Added CLAUDE.md distribution
- Redis/socket.io-client dependencies
- Improved .npmignore

### v2.4.2
- Added npx bin commands
- Updated slash command paths

### v2.4.1
- Excluded project-specific reports
- Clean package structure

### v2.4.0
- Added SYNC_USAGE.md
- Initial sync script

## Security

- All scripts validate input before execution
- No credentials in distributed files
- Hook system includes OWASP/CWE scanning
- Dependency security audits via Snyk

## Support

- **Issues**: https://github.com/anthropic/claude-flow-novice/issues
- **Documentation**: `readme/` folder in package
- **Examples**: `SYNC_USAGE.md`
