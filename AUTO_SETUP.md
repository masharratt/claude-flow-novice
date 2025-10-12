# Automatic Setup Documentation

## Overview

Claude Flow Novice now includes **automatic setup** for Redis and SQLite that runs during `npm install` or `npx claude-flow-novice`.

## What Gets Set Up Automatically

### ✅ SQLite (Always Automatic)
- **Package**: `better-sqlite3` installed via npm dependencies
- **Database Directory**: Created at `~/.claude-flow-novice/data/`
- **No user action required**: Works out of the box

### ✅ Agent Profiles (Automatic Sync)
- **53 Production-Ready Agents**: All agent profiles from package
- **Auto-Overwrite**: Package version is source of truth
- **Backup Created**: Old versions saved to `.claude/agents/.backup/`
- **Custom Agents Preserved**: User's custom agents not in package are kept
- **Validation Hooks Included**: All 4 production validators

### 🔄 Redis (Intelligent Detection)

The auto-setup script performs the following checks:

1. **Already Running**: Detects if Redis is running → No action needed
2. **Installed but Stopped**: Attempts to start Redis automatically
3. **Not Installed**: Provides platform-specific installation instructions

## How It Works

### During npm install:
```bash
npm install claude-flow-novice
# Automatically runs:
# 1. node scripts/auto-setup.js          ← New automatic setup
#    - SQLite database directory creation
#    - Redis detection and auto-start
#    - Agent profile sync (overwrites same-name agents)
# 2. node scripts/post-install-claude-md.js
# 3. node scripts/verify-installation.js
```

### During npx usage:
```bash
npx claude-flow-novice init
# Auto-setup runs first time
```

## Opt-Out Options

### Disable Auto-Setup Entirely
```bash
# Before install:
export CLAUDE_FLOW_NO_AUTO_SETUP=true
npm install claude-flow-novice
```

### Skip in CI/CD
Auto-setup automatically skips when:
- `CI=true` environment variable is set
- Running during `npm publish` or `prepublishOnly`

## Platform-Specific Behavior

### macOS
- **Detection**: Checks for Homebrew Redis installation
- **Auto-start**: Runs `brew services start redis` if installed
- **Instructions**: Provides Homebrew install commands if missing

### Linux
- **Detection**: Checks systemd/init.d for Redis service
- **Auto-start**: Runs `sudo systemctl start redis` if installed
- **Instructions**: Provides apt/yum commands based on distribution

### Windows
- **Detection**: Checks for Redis Windows service
- **Auto-start**: Runs `net start Redis` if installed
- **Instructions**: Provides WSL2/Docker alternatives

## Setup Status Tracking

### Status File
Location: `~/.claude-flow-novice/config/setup-status.json`

```json
{
  "timestamp": "2025-10-11T17:30:00.000Z",
  "platform": "linux",
  "autoSetup": true,
  "sqlite": {
    "success": true,
    "version": "^12.4.1",
    "message": "SQLite ready (better-sqlite3 installed)"
  },
  "redis": {
    "success": true,
    "version": "Redis server v=7.0.15",
    "status": "already-installed",
    "message": "Redis detected and running"
  },
  "agents": {
    "success": true,
    "created": 15,
    "overwritten": 38,
    "preserved": 0,
    "backupDir": "/home/user/project/.claude/agents/.backup"
  },
  "version": "2.0.0"
}
```

### Log File
Location: `~/.claude-flow-novice/setup.log`

Contains timestamped setup events:
```
[2025-10-11T17:30:00.000Z] [INFO] Setting up SQLite...
[2025-10-11T17:30:00.100Z] [INFO] SQLite (better-sqlite3) is installed
[2025-10-11T17:30:00.200Z] [INFO] Checking Redis installation...
[2025-10-11T17:30:00.500Z] [INFO] Redis is already installed and running!
```

## Manual Setup (Fallback)

If auto-setup fails or is disabled, users can run:

```bash
# Quick interactive setup
npm run quick-install

# Redis management:
npm run redis:setup      # Full Redis setup wizard
npm run redis:start      # Start Redis
npm run redis:status     # Check Redis status

# Agent profile management:
npm run agents:sync              # Sync agents from package
npm run agents:sync:dry-run      # Preview changes without syncing
npm run agents:sync:verbose      # Detailed sync output
```

## Error Handling

### Graceful Degradation
- Auto-setup **never fails the npm install**
- All errors are logged to `~/.claude-flow-novice/setup.log`
- Users receive clear instructions for manual setup

### Redis Not Installed Example
```
⚠️ Redis not found - installation required

💡 To manually setup Redis later, run:
   npm run redis:setup

📝 Setup log: /home/user/.claude-flow-novice/setup.log
```

## Testing Auto-Setup

### Test in Clean Environment
```bash
# Remove existing setup
rm -rf ~/.claude-flow-novice

# Test auto-setup
npm install claude-flow-novice

# Verify status
cat ~/.claude-flow-novice/config/setup-status.json
cat ~/.claude-flow-novice/setup.log
```

### Test Opt-Out
```bash
export CLAUDE_FLOW_NO_AUTO_SETUP=true
npm install claude-flow-novice
# Should skip auto-setup
```

### Test CI Environment
```bash
export CI=true
npm install claude-flow-novice
# Should skip auto-setup
```

## Benefits

### For End Users
- ✅ **Zero configuration**: Works immediately after `npm install`
- ✅ **Smart detection**: Doesn't reinstall or reconfigure
- ✅ **Clear feedback**: Shows what was set up and what needs manual action
- ✅ **Non-blocking**: Never breaks npm install

### For CI/CD
- ✅ **Auto-skip**: Detects CI environment and skips
- ✅ **No side effects**: Doesn't modify system during publish
- ✅ **Exit code 0**: Always succeeds to allow builds to continue

### For Developers
- ✅ **Transparent logs**: Everything logged to file
- ✅ **Status tracking**: JSON file shows setup state
- ✅ **Easy debugging**: Clear error messages and instructions

## Configuration Files Created

```
~/.claude-flow-novice/
├── config/
│   └── setup-status.json      # Setup state tracking
├── data/                       # SQLite database directory
│   └── (created automatically)
└── setup.log                   # Installation logs

project/.claude/
├── agents/
│   ├── .backup/               # Backup of overwritten agents
│   │   └── coder.md.2025-10-11T17-30-00-000Z.backup
│   ├── core-agents/           # 53 production-ready agents
│   │   ├── coder.md
│   │   ├── tester.md
│   │   ├── reviewer.md
│   │   └── ...
│   ├── validate-agent.js      # Agent validation script
│   └── CLAUDE.md              # Agent design principles
└── agents-ignore/             # Additional agent templates
```

## NPM Package Integration

The auto-setup script is **included in the npm package**:

```json
{
  "files": [
    "scripts/",              // ← Includes scripts/auto-setup.js
    ...
  ],
  "scripts": {
    "postinstall": "node scripts/auto-setup.js && ..."
  }
}
```

## Security Considerations

- **No sudo required**: Auto-setup never uses elevated privileges
- **User opt-out**: Respects `CLAUDE_FLOW_NO_AUTO_SETUP` environment variable
- **Safe defaults**: Only performs read operations and directory creation
- **No network calls**: Doesn't download or install packages automatically
- **Transparent logging**: All actions logged to user directory

## Future Enhancements

Potential improvements for future versions:

1. **Docker Auto-Setup**: Detect and use Docker for Redis if available
2. **Portable Redis**: Bundle Redis binary for Windows users
3. **Health Monitoring**: Periodic setup validation
4. **Auto-Repair**: Detect and fix common configuration issues
5. **Setup Wizard**: Interactive terminal UI for advanced configuration

---

**Questions or Issues?**

- View logs: `cat ~/.claude-flow-novice/setup.log`
- Check status: `cat ~/.claude-flow-novice/config/setup-status.json`
- Manual setup: `npm run quick-install`
- Report issues: [GitHub Issues](https://github.com/masharratt/claude-flow-novice/issues)
