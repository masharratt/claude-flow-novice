# Agent Profile Sync System

## Overview

The Agent Sync system ensures users always have the latest production-ready agent profiles from the package, while preserving their custom agents and providing safety through automatic backups.

## Key Features

### ✅ Automatic Sync on Install
- Runs during `npm install` via `postinstall` hook
- Syncs all 53 production-ready agents from package
- **Overwrites agents with same name** (package is source of truth)
- Creates timestamped backups before overwriting
- Preserves custom agents not in package

### ✅ Safe Overwrite Strategy
```
Package Agent (NEW VERSION)  →  User Agent (OLD VERSION)
         ↓                              ↓
         ├──────── Backup ──────────────┤
         │                              │
         └──────── Overwrite ───────────┘
                       ↓
            User gets latest version
            Old version saved to .backup/
```

### ✅ Backup System
- **Location**: `.claude/agents/.backup/`
- **Format**: `{agent-path}_{timestamp}.backup`
- **Example**: `core-agents_coder.md.2025-10-11T17-30-00-000Z.backup`
- **Retention**: Manual cleanup (users decide when to remove)

## Architecture

### Files Included in NPM Package

```
package/
├── .claude/
│   ├── agents/                    ← 53 production agents
│   │   ├── core-agents/
│   │   │   ├── coder.md
│   │   │   ├── tester.md
│   │   │   ├── reviewer.md
│   │   │   └── ...
│   │   ├── validate-agent.js      ← Agent validator
│   │   └── CLAUDE.md              ← Design principles
│   └── agents-ignore/             ← Additional templates
├── config/hooks/
│   ├── agent-feedback-hook.cjs
│   ├── post-edit-agent-template.js
│   ├── safety-validator.js
│   └── validators/                ← 4 production validators
└── scripts/
    ├── auto-setup.js              ← Automatic setup orchestrator
    └── sync-agents.js             ← Agent sync implementation
```

### Sync Process Flow

```
1. npm install claude-flow-novice
        ↓
2. postinstall hook runs
        ↓
3. auto-setup.js executes
        ↓
4. syncAgentProfiles() called
        ↓
5. Import sync-agents.js
        ↓
6. Compare package agents vs user agents
        ↓
7. For each agent:
   ├─ Same content? → Preserve (no action)
   ├─ Different content? → Backup + Overwrite
   └─ Not in user dir? → Create new
        ↓
8. Report summary
        ↓
9. Continue with other setup tasks
```

## Usage

### Automatic Sync (Default)

Runs automatically during installation:

```bash
npm install claude-flow-novice

# Output:
# 🚀 Claude Flow Novice - Automatic Setup
# ℹ️  Syncing agent profiles from package...
# ℹ️  Agent profiles synced: 15 new, 38 updated, 0 unchanged
# ✅ Automatic setup completed!
```

### Manual Sync

```bash
# Sync agents from package
npm run agents:sync

# Preview changes without syncing (dry run)
npm run agents:sync:dry-run

# Detailed output with file-by-file progress
npm run agents:sync:verbose
```

### Direct Script Execution

```bash
# Full sync with backups
node scripts/sync-agents.js

# Preview mode
node scripts/sync-agents.js --dry-run

# Verbose output
node scripts/sync-agents.js --verbose

# Skip backups (faster, less safe)
node scripts/sync-agents.js --no-backup

# Help
node scripts/sync-agents.js --help
```

## Sync Outcomes

### Case 1: New Agent in Package

```
Package: .claude/agents/new-agent.md
User:    (doesn't exist)
Action:  CREATE
Result:  New agent added to user's project
```

### Case 2: Agent Updated in Package

```
Package: .claude/agents/coder.md (v2.0)
User:    .claude/agents/coder.md (v1.5)
Action:  BACKUP + OVERWRITE
Result:  Old version → .backup/coder.md.{timestamp}.backup
         New version → .claude/agents/coder.md
```

### Case 3: Identical Agent

```
Package: .claude/agents/tester.md (content hash: abc123)
User:    .claude/agents/tester.md (content hash: abc123)
Action:  PRESERVE (no action)
Result:  No changes (identical content)
```

### Case 4: Custom Agent Not in Package

```
Package: (doesn't have custom-agent.md)
User:    .claude/agents/custom-agent.md
Action:  PRESERVE
Result:  User's custom agent remains untouched
```

## Sync Summary Report

```
📊 Sync Summary:

✅ Created: 15 agents
   - frontend/react-frontend-engineer.md
   - testing/playwright-tester.md
   - ...

🔄 Overwritten: 38 agents
   - core-agents/coder.md
   - core-agents/tester.md
   - ...

💾 Backed up: 38 agents
   Location: /home/user/project/.claude/agents/.backup

⚪ Preserved: 0 agents (no changes)

📦 Total agents: 53
```

## Backup Management

### Viewing Backups

```bash
ls -la .claude/agents/.backup/

# Output:
# core-agents_coder.md.2025-10-11T17-30-00-000Z.backup
# core-agents_tester.md.2025-10-11T17-30-00-000Z.backup
# ...
```

### Restoring from Backup

```bash
# Manual restore
cp .claude/agents/.backup/coder.md.2025-10-11T17-30-00-000Z.backup \
   .claude/agents/core-agents/coder.md
```

### Cleanup Old Backups

```bash
# Remove backups older than 30 days
find .claude/agents/.backup -name "*.backup" -mtime +30 -delete

# Remove all backups (use with caution!)
rm -rf .claude/agents/.backup/*
```

## Integration with Auto-Setup

The agent sync is integrated into the automatic setup flow:

```javascript
// In auto-setup.js
async run() {
  // 1. Setup SQLite
  const sqliteResult = await this.setupSQLite();

  // 2. Setup Redis
  const redisResult = await this.setupRedis();

  // 3. Sync Agent Profiles (NEW)
  const agentSyncResult = await this.syncAgentProfiles();

  // 4. Write status
  await this.writeSetupStatus({
    sqlite: sqliteResult,
    redis: redisResult,
    agents: agentSyncResult  // ← Included in status
  });
}
```

## Setup Status Tracking

The sync results are tracked in `~/.claude-flow-novice/config/setup-status.json`:

```json
{
  "timestamp": "2025-10-11T17:30:00.000Z",
  "platform": "linux",
  "autoSetup": true,
  "agents": {
    "success": true,
    "created": 15,
    "overwritten": 38,
    "preserved": 0,
    "backupDir": "/home/user/project/.claude/agents/.backup"
  },
  "sqlite": { ... },
  "redis": { ... },
  "version": "2.0.0"
}
```

## Error Handling

### Graceful Degradation

If agent sync fails, auto-setup continues:

```javascript
try {
  await this.syncAgentProfiles();
} catch (error) {
  this.log(`Agent sync error: ${error.message}`, 'error');
  // Continue with other setup tasks
  // Don't fail entire npm install
}
```

### Common Errors

#### Permission Denied
```
❌ Error syncing core-agents/coder.md: EACCES: permission denied

Solution: Check file permissions in .claude/agents/
```

#### Directory Not Found
```
❌ Could not read directory: ENOENT: no such file or directory

Solution: Creates directory automatically (should not occur)
```

#### Disk Full
```
❌ Agent sync error: ENOSPC: no space left on device

Solution: Free up disk space, re-run sync
```

## Opt-Out Options

### Skip Agent Sync

```bash
# Set environment variable before install
export CLAUDE_FLOW_NO_AUTO_SETUP=true
npm install claude-flow-novice
```

### Manual Sync Later

```bash
# Install without auto-setup
export CLAUDE_FLOW_NO_AUTO_SETUP=true
npm install claude-flow-novice

# Manually sync when ready
npm run agents:sync
```

## Performance

### Sync Speed

- **Initial sync (53 agents)**: ~2-3 seconds
- **Incremental sync (no changes)**: ~200-500ms (hash comparison)
- **With backups**: ~3-4 seconds (includes file copies)
- **Without backups** (`--no-backup`): ~1-2 seconds

### Optimization Strategies

1. **Content Hashing**: Identical content detected instantly
2. **Skip Backups**: Use `--no-backup` flag for faster sync
3. **Dry Run First**: Preview changes before syncing

## Security Considerations

### Package as Source of Truth

- ✅ Package agents are maintained by core team
- ✅ All agents include 4 production validators
- ✅ Security updates distributed automatically
- ✅ Users get latest best practices

### User Custom Agents

- ✅ Custom agents are preserved (never deleted)
- ✅ Backups protect against accidental overwrites
- ✅ Users maintain full control over `.claude/agents/`

### Backup Safety

- ✅ Timestamped backups prevent conflicts
- ✅ Backups stored in `.backup/` subdirectory
- ✅ Users choose when to remove old backups

## Testing

### Test Scenarios

```bash
# Test 1: Fresh install (no existing agents)
rm -rf .claude/agents
npm run agents:sync
# Expect: All 53 agents created

# Test 2: Update existing agents
npm run agents:sync
# Expect: Agents overwritten, backups created

# Test 3: Dry run
npm run agents:sync:dry-run
# Expect: Preview only, no changes

# Test 4: Custom agent preservation
echo "# Custom Agent" > .claude/agents/my-custom-agent.md
npm run agents:sync
# Expect: Custom agent preserved, package agents updated
```

### Validation

After sync, validate agents:

```bash
# Validate all agents
node .claude/agents/validate-agent.js --all

# Validate specific agent
node .claude/agents/validate-agent.js .claude/agents/core-agents/coder.md
```

## Troubleshooting

### Sync Failed

```bash
# Check logs
cat ~/.claude-flow-novice/setup.log

# Check status
cat ~/.claude-flow-novice/config/setup-status.json

# Retry manually
npm run agents:sync:verbose
```

### Restore Old Version

```bash
# List backups
ls -la .claude/agents/.backup/

# Restore specific backup
cp .claude/agents/.backup/{file}.backup .claude/agents/{file}
```

### Reset All Agents

```bash
# Remove user agents
rm -rf .claude/agents

# Re-sync from package
npm run agents:sync

# Or full reinstall
npm install claude-flow-novice --force
```

## Future Enhancements

Potential improvements for future versions:

1. **Selective Sync**: Sync only specific agent categories
2. **Version Comparison**: Show agent version diffs
3. **Merge Tool**: Interactive merge for conflicting changes
4. **Rollback**: Easy rollback to previous agent versions
5. **Update Notifications**: Notify when new agents available

---

## Summary

✅ **Automatic**: Runs on install, no user action required
✅ **Safe**: Creates backups before overwriting
✅ **Smart**: Preserves identical content and custom agents
✅ **Fast**: 2-3 seconds for full sync
✅ **Flexible**: Manual sync available anytime
✅ **Transparent**: Detailed logging and status tracking

Users get the latest production-ready agents automatically while maintaining full control over customizations!
