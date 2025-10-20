# Installation Process - claude-flow-novice

This document explains what happens when users install `claude-flow-novice` via npm or npx.

---

## 📦 Installation Methods

### Method 1: Global Installation (Recommended)

```bash
npm install -g claude-flow-novice
```

**What happens:**
1. **Package Download** - npm downloads `claude-flow-novice-2.0.0.tgz` from npm registry (~3-4 MB compressed)
2. **Extraction** - Extracts 1,401 files to global node_modules (~15.3 MB unpacked)
3. **Dependency Installation** - Installs 8 production dependencies:
   - `ajv` - JSON schema validation
   - `better-sqlite3` - SQLite database (may require compilation)
   - `chalk` - Terminal colors
   - `commander` - CLI framework
   - `dotenv` - Environment variables
   - `lodash` - Utility functions
   - `redis` - Redis client
   - `sqlite3` - SQLite bindings
4. **Binary Linking** - Creates symlinks in global bin directory:
   - `claude-flow-novice` → `node_modules/claude-flow-novice/dist/cli/index.js` (main CLI)
   - `cfn-spawn` → `node_modules/claude-flow-novice/dist/cli/spawn.js` (agent spawning)
5. **Postinstall Hook** - Displays welcome message:
   ```
   ✅ claude-flow-novice installed successfully!
   📚 Get started: npx claude-flow-novice --help
   🔧 Initialize: npx claude-flow-novice status
   ```

**Installation time:** ~6-10 seconds (depending on network and system)

**Location:**
- Linux/Mac: `~/.nvm/versions/node/vX.X.X/lib/node_modules/claude-flow-novice/`
- Windows: `%APPDATA%\npm\node_modules\claude-flow-novice\`

**Usage after install:**
```bash
# Global command available
claude-flow-novice --help
claude-flow-novice status

# Or with npx (same result)
npx claude-flow-novice --help
```

---

### Method 2: Local Project Installation

```bash
cd my-project
npm install claude-flow-novice
```

**What happens:**
1. **Same download and extraction** as global install
2. **Installed to local node_modules** - `./node_modules/claude-flow-novice/`
3. **Binary in local .bin** - `./node_modules/.bin/claude-flow-novice`
4. **Postinstall hook runs** - Same welcome message

**Usage after install:**
```bash
# Via npx (searches local first)
npx claude-flow-novice --help

# Via npm scripts in package.json
{
  "scripts": {
    "orchestrate": "claude-flow-novice status"
  }
}

# Direct path
./node_modules/.bin/claude-flow-novice --help
```

---

### Method 3: npx Without Installation (One-Time Use)

```bash
npx claude-flow-novice@latest --help
```

**What happens:**
1. **Temporary Download** - npx downloads package to npm cache
2. **Temporary Extraction** - Extracts to temporary directory
3. **Runs Command** - Executes the CLI command
4. **Keeps in Cache** - Package remains in npm cache for future use
5. **No Postinstall Hook** - Skipped for npx one-time use

**Cache location:**
- Linux/Mac: `~/.npm/_npx/`
- Windows: `%LOCALAPPDATA%\npm-cache\_npx\`

**When to use:**
- Testing the CLI before installing
- One-off commands
- CI/CD pipelines (no persistent install needed)

---

## 🔧 What Gets Installed

### File Structure After Installation

```
node_modules/claude-flow-novice/
├── dist/                           # 83 compiled JS files
│   ├── cli/
│   │   ├── index.js               # Main CLI entry point
│   │   └── spawn.js               # Agent spawning utility
│   ├── core/                       # Core orchestration logic
│   ├── swarm/                      # Swarm management
│   └── ... (other modules)
│
├── .claude/                        # 1,200+ configuration files
│   ├── agents/                     # 60+ agent definitions
│   │   ├── core-agents/
│   │   │   ├── coder.md
│   │   │   ├── tester.md
│   │   │   ├── reviewer.md
│   │   │   └── ... (57 more)
│   │   ├── specialized/
│   │   ├── security/
│   │   └── ...
│   │
│   ├── skills/                     # 12 skill modules
│   │   ├── redis-coordination/
│   │   │   ├── SKILL.md
│   │   │   ├── invoke-waiting-mode.sh
│   │   │   ├── orchestrate-cfn-loop.sh
│   │   │   └── ... (40+ files)
│   │   ├── agent-spawning/
│   │   ├── cfn-loop-validation/
│   │   ├── hook-pipeline/
│   │   ├── ace-system/
│   │   └── ... (8 more)
│   │
│   ├── commands/                   # Slash commands
│   │   ├── cfn-loop.md
│   │   ├── github.md
│   │   ├── swarm.md
│   │   └── ... (100+ commands)
│   │
│   └── hooks/                      # Hook configurations
│       ├── invoke-post-edit.sh
│       └── post-edit.config.json
│
├── agents/                         # Agent runtime config
├── config/                         # System configuration
├── scripts/                        # Essential orchestration scripts
├── package.json                    # Package metadata
├── README.md                       # User documentation
├── CLAUDE.md                       # Project instructions
└── LICENSE                         # MIT License
```

---

## ⚙️ Installation Hooks & Lifecycle

### NPM Lifecycle Scripts

Our package uses these lifecycle hooks:

#### 1. `prepack` (Before Creating Tarball)
```json
"prepack": "npm run build"
```
- **Runs:** When npm creates the package tarball (`npm pack`, `npm publish`)
- **Purpose:** Ensures `dist/` directory is built before packaging
- **Users don't see this** - Only runs during publishing

#### 2. `postinstall` (After Installation)
```json
"postinstall": "node -e \"console.log('...')\"
```
- **Runs:** After package is installed to node_modules
- **Purpose:** Welcome message with quick start instructions
- **Output:**
  ```
  ✅ claude-flow-novice installed successfully!
  📚 Get started: npx claude-flow-novice --help
  🔧 Initialize: npx claude-flow-novice status
  ```

---

## 🔍 What Users See

### Typical Installation Output

```bash
$ npm install -g claude-flow-novice

added 145 packages, and audited 146 packages in 8s

17 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

✅ claude-flow-novice installed successfully!
📚 Get started: npx claude-flow-novice --help
🔧 Initialize: npx claude-flow-novice status
```

### First Run

```bash
$ claude-flow-novice --help

Claude Flow Novice v2.0 - Clean Architecture
Claude Flow Novice CLI v2.0.0

Usage: claude-flow-novice [options] [command]

AI agent orchestration framework with skills-based coordination

Options:
  -V, --version          output the version number
  -h, --help             display help for command

Commands:
  status                 Check system status
  agent <type>           Spawn an agent
  swarm <objective>      Execute swarm coordination
  help [command]         display help for command
```

---

## 🧪 Dependency Compilation

### better-sqlite3 (Native Module)

**May require compilation** on some systems:

```bash
# During install, users may see:
> better-sqlite3@12.4.1 install
> node-gyp rebuild

# This is normal - compiling native SQLite bindings
```

**Requirements:**
- **Linux:** `python3`, `make`, `g++`
- **Mac:** Xcode Command Line Tools
- **Windows:** `windows-build-tools` or Visual Studio

**If compilation fails:**
```bash
# Linux/Mac
sudo apt-get install python3 make g++
npm install -g claude-flow-novice

# Windows
npm install --global windows-build-tools
npm install -g claude-flow-novice
```

**Alternative:** Pre-built binaries are usually available for common platforms

---

## 🚀 Post-Installation Setup

### Required: Redis Server

Users must have Redis running for coordination features:

```bash
# Check Redis status
redis-cli ping
# Expected: PONG

# If not installed:
# Mac
brew install redis
brew services start redis

# Linux
sudo apt-get install redis-server
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:latest
```

### Verify Installation

```bash
# Check CLI is accessible
claude-flow-novice status

# Expected output:
# Claude Flow Novice v2.0 - Clean Architecture
# Claude Flow Novice CLI v2.0.0
# Redis: Connected ✅ / Not Connected ❌
# SQLite: Available ✅
# Skills: 12 loaded
# Agents: 60 available
```

### Optional: Configuration

```bash
# Create .env file (optional)
cat > .env <<EOF
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=your_key_here
ZAI_API_KEY=your_key_here
EOF

# Initialize project configuration
claude-flow-novice init
```

---

## 📊 Installation Metrics

### Package Size
- **Compressed (download):** ~3-4 MB
- **Unpacked (disk):** ~15.3 MB
- **With dependencies:** ~25-30 MB

### Installation Time
- **Fast network:** 6-8 seconds
- **Average network:** 10-15 seconds
- **Slow network:** 20-30 seconds
- **With native compilation:** +10-20 seconds

### Dependency Count
- **Production deps:** 8
- **Total packages (with transitive):** ~145

---

## 🔄 Update Process

### Updating the Package

```bash
# Check current version
claude-flow-novice --version
# Output: 2.0.0

# Update to latest
npm update -g claude-flow-novice

# Or reinstall
npm uninstall -g claude-flow-novice
npm install -g claude-flow-novice@latest

# Check new version
claude-flow-novice --version
# Output: 2.1.0 (or latest)
```

**What happens during update:**
1. npm downloads new version
2. Replaces old files in node_modules
3. Re-runs `postinstall` hook (welcome message)
4. Updates binary symlinks

---

## ❌ Uninstallation

### Remove Package

```bash
# Global uninstall
npm uninstall -g claude-flow-novice

# Local uninstall
npm uninstall claude-flow-novice
```

**What gets removed:**
- All package files from node_modules
- Binary symlinks from bin directory
- NPM cache entry (if using `--cache`)

**What persists:**
- User-created configuration files (`.env`, etc.)
- Redis data (swarm state, metrics)
- SQLite databases (if created)
- Generated files in user's projects

---

## 🐛 Common Installation Issues

### Issue 1: Permission Denied (Global Install)

```bash
# Error: EACCES: permission denied
# Solution: Use npx or fix npm permissions

# Option 1: Use npx (no global install needed)
npx claude-flow-novice --help

# Option 2: Fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g claude-flow-novice

# Option 3: Use sudo (not recommended)
sudo npm install -g claude-flow-novice
```

### Issue 2: better-sqlite3 Compilation Failure

```bash
# Error: node-gyp rebuild failed
# Solution: Install build tools

# Ubuntu/Debian
sudo apt-get install python3 make g++

# Mac
xcode-select --install

# Windows
npm install --global windows-build-tools
```

### Issue 3: Redis Not Found

```bash
# After install, running commands fails
# Error: Redis connection refused

# Solution: Install and start Redis
brew install redis         # Mac
sudo apt install redis     # Linux
brew services start redis  # Mac
sudo systemctl start redis # Linux
```

---

## 🎯 Best Practices for Users

### Recommended Installation Flow

```bash
# 1. Install Redis first
brew install redis && brew services start redis

# 2. Install claude-flow-novice
npm install -g claude-flow-novice

# 3. Verify installation
claude-flow-novice status

# 4. Create project configuration (optional)
cd my-project
claude-flow-novice init

# 5. Start using
claude-flow-novice swarm "Build REST API"
```

### For CI/CD Pipelines

```bash
# Use npx for one-time execution (no install)
npx claude-flow-novice@latest agent coder

# Or cache installation in pipeline
npm ci
npx claude-flow-novice status
```

---

## 📝 Summary

**Installation is straightforward:**
1. **Download** - npm fetches package (~3-4 MB)
2. **Extract** - 1,401 files to node_modules (~15 MB)
3. **Dependencies** - 145 packages installed
4. **Binaries** - 2 CLI commands linked
5. **Welcome** - Postinstall message guides next steps

**Users can then:**
- Run `claude-flow-novice` commands globally
- Access all 60+ agents
- Use 12 skill modules
- Execute CFN Loop workflows
- Coordinate swarms via Redis

**All skills and supporting files are included and ready to use!**
