# Claude Flow Novice - Sync Guide

## Installation & Setup

### 1. Install Package

```bash
npm install claude-flow-novice
```

### 2. Sync Agents, Commands, and Hooks

After installation, sync the latest agents, slash commands, and validation hooks to your project:

```bash
# Sync everything with backup
npx claude-flow-sync --backup

# Or use the longer form
node node_modules/claude-flow-novice/scripts/sync-from-package.js --backup
```

### 3. Available CLI Commands

The package provides additional commands for agent coordination:

```bash
# Spawn agents via CLI (cost-optimized coordination)
npx claude-flow-spawn "Build auth system" --agents=coder,tester --provider zai

# Toggle cost-savings mode
npx claude-flow-cost-savings on      # Enable CLI spawning
npx claude-flow-cost-savings off     # Disable CLI spawning
npx claude-flow-cost-savings status  # Check current mode
```

## Sync Options

### Sync Everything (Recommended for first time)

```bash
npx claude-flow-sync --backup
```

This syncs:
- `.claude/agents/` - All agent definitions (94 files)
- `.claude/commands/` - Slash commands
- `config/hooks/` - Validation hooks

### Selective Sync

```bash
# Sync only agents
npx claude-flow-sync --agents --backup

# Sync only commands
npx claude-flow-sync --commands --backup

# Sync only hooks
npx claude-flow-sync --hooks --backup

# Combine multiple
npx claude-flow-sync --agents --hooks --backup
```

### Force Overwrite

Use `--force` to overwrite existing files without prompting:

```bash
npx claude-flow-sync --force --backup
```

**⚠️ Warning**: `--force` will overwrite your customizations. Always use `--backup` with `--force`.

## Update Workflow

### When Package Updates

```bash
# 1. Update package
npm update claude-flow-novice

# 2. Sync new changes (creates backup automatically)
npx claude-flow-sync --backup

# 3. Review changes
git diff .claude/ config/

# 4. Merge customizations if needed
# Restore from .backup-YYYY-MM-DD if you need your custom changes
```

### Customizing Agents/Commands

1. **Initial sync**:
   ```bash
   npx claude-flow-sync --backup
   ```

2. **Customize** your local copies in:
   - `.claude/agents/`
   - `.claude/commands/`
   - `config/hooks/`

3. **Update from package** (preserves your changes):
   ```bash
   # WITHOUT --force, you'll be warned about existing files
   npx claude-flow-sync --backup
   
   # Review what changed in the package
   diff -r .claude/agents/ .claude/agents.backup-YYYY-MM-DD/
   
   # Manually merge changes you want
   ```

## File Locations After Sync

```
your-project/
├── .claude/
│   ├── agents/           # ✅ Synced from package (94 files)
│   └── commands/         # ✅ Synced from package
├── config/
│   └── hooks/            # ✅ Synced from package (13+ files)
└── node_modules/
    └── claude-flow-novice/
        ├── .claude/      # Source (in npm package)
        ├── config/       # Source (in npm package)
        └── scripts/      # Source (in npm package)
```

## Backup Management

Backups are created as:
- `.claude/agents.backup-2025-10-17/`
- `.claude/commands.backup-2025-10-17/`
- `config/hooks.backup-2025-10-17/`

### Restore from Backup

```bash
# If you need to restore
rm -rf .claude/agents/
mv .claude/agents.backup-2025-10-17/ .claude/agents/
```

## Examples

### First-Time Setup
```bash
npm install claude-flow-novice
npx claude-flow-sync --backup
```

### Regular Updates
```bash
npm update claude-flow-novice
npx claude-flow-sync --backup
# Review changes with: git diff
```

### Force Update Everything
```bash
npx claude-flow-sync --force --backup
```

### Update Only Hooks (Get Latest Validators)
```bash
npx claude-flow-sync --hooks --force --backup
```

## What Gets Synced

| Directory | Files | Description |
|-----------|-------|-------------|
| `.claude/agents/` | 94 | Agent definitions (optimized, Phase 4) |
| `.claude/commands/` | 50+ | Slash commands |
| `config/hooks/` | 13+ | Validation hooks (post-edit, etc.) |

## What Doesn't Get Synced

- `scripts/` - Only package utilities, not project-specific scripts
- `readme/` - Package documentation (not project-specific)
- `src/` - Package source code (not for project use)

## Troubleshooting

### "Source directory not found"
Your package might be outdated. Update it:
```bash
npm update claude-flow-novice
```

### "Destination exists" Warning
Without `--force`, sync won't overwrite. Use:
```bash
npx claude-flow-sync --force --backup
```

### Lost Customizations
Restore from backup:
```bash
mv .claude/agents.backup-YYYY-MM-DD/ .claude/agents/
```
