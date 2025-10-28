# NPM Distribution Guide - Claude Flow Novice

## 📦 Package Contents

The `claude-flow-novice` npm package includes:

### Core Components
- ✅ **CLI Tools** (`dist/cli/`)
  - `claude-flow-novice` - Main CLI
  - `cfn-spawn` - Agent spawning utility

### Skills & Configuration
- ✅ **Skills** (`.claude/skills/`)
  - Redis Coordination
  - Agent Spawning
  - CFN Loop Validation
  - Hook Pipeline
  - ACE System
  - Event Bus
  - Fleet Manager
  - SQLite Memory
  - And more...

### Agent Definitions
- ✅ **Agents** (`.claude/agents/`)
  - Core agents (coder, tester, reviewer, etc.)
  - Specialized agents (backend-dev, mobile-dev, etc.)
  - Coordinators (cost-savings, CFN Loop, etc.)
  - 60+ agent types included

### Essential Scripts
- ✅ **Scripts** (`scripts/`)
  - Core orchestration scripts
  - Utility scripts
  - Hook implementations
  - ⛔ Excludes test and validation scripts

### Documentation
- ✅ `README.md` - Quick start guide
- ✅ `CLAUDE.md` - Project instructions
- ✅ `LICENSE` - MIT License
- ✅ Agent documentation in `.claude/agents/`

### What's NOT Included
- ⛔ Source TypeScript files (`src/`)
- ⛔ Tests (`tests/`)
- ⛔ Legacy code (`legacy/`)
- ⛔ Development scripts (`scripts/test-*`, etc.)
- ⛔ Web portal (separate package)
- ⛔ Examples and docs
- ⛔ Build configurations

---

## 🚀 Publishing Checklist

### Pre-Publish Validation

```bash
# 1. Build the package
npm run build

# 2. Type check
npm run typecheck

# 3. Verify package contents (dry run)
npm run verify-package

# 4. Test package creation
npm pack

# 5. Verify tarball contents
tar -tzf claude-flow-novice-2.0.0.tgz | less

# 6. Check package size (should be ~15MB unpacked)
npm pack --dry-run 2>&1 | grep "unpacked size"
```

### Update Version

```bash
# Patch version (2.0.0 -> 2.0.1)
npm version patch

# Minor version (2.0.0 -> 2.1.0)
npm version minor

# Major version (2.0.0 -> 3.0.0)
npm version major
```

### Publish to NPM

```bash
# Test installation locally first
npm pack
npm install -g ./claude-flow-novice-2.0.0.tgz
claude-flow-novice --help
npm uninstall -g claude-flow-novice

# Login to NPM
npm login

# Publish (dry run)
npm publish --dry-run

# Publish to NPM
npm publish

# Publish with tag (beta, alpha, next)
npm publish --tag beta
```

---

## 🧪 Local Testing

### Test Installation

```bash
# Create test directory
mkdir /tmp/test-cfn-install
cd /tmp/test-cfn-install

# Install from local tarball
npm install /path/to/claude-flow-novice-2.0.0.tgz

# Verify CLI works
npx claude-flow-novice --help
npx claude-flow-novice status

# Test agent spawning
npx claude-flow-novice agent coder --help

# Verify skills are accessible
ls node_modules/claude-flow-novice/.claude/skills/

# Cleanup
cd ..
rm -rf /tmp/test-cfn-install
```

### Test Global Installation

```bash
# Install globally from tarball
npm install -g ./claude-flow-novice-2.0.0.tgz

# Test global command
claude-flow-novice --help
claude-flow-novice status

# Uninstall
npm uninstall -g claude-flow-novice
```

---

## 📊 Package Metrics

**Current Package Size:**
- **Unpacked:** ~15.3 MB
- **Total Files:** 1,401
- **Key Directories:**
  - `.claude/` - 1,200+ files (agents, skills, config)
  - `dist/` - 83 compiled JS files
  - `scripts/` - 50+ essential scripts

---

## 🔧 Configuration After Installation

Users who install the package should:

### 1. Initialize Configuration

```bash
# Check system status
npx claude-flow-novice status

# Set up Redis (required for coordination)
# See README.md for Redis setup instructions
```

### 2. Configure API Provider (Optional)

```bash
# Enable Z.ai custom routing for cost savings
npx claude-flow-novice config set-provider zai

# Or use Anthropic
npx claude-flow-novice config set-provider anthropic
```

### 3. Verify Skills

```bash
# List available skills
ls node_modules/claude-flow-novice/.claude/skills/

# Skills are automatically accessible to agents
```

---

## 🌐 Web Portal (Separate Package)

The web portal is distributed as a **separate package**:

```bash
# Install web portal separately
npm install @claude-flow-novice/web-portal

# Or use from monorepo
cd packages/web-portal
npm install
npm run dev
```

**Why separate?**
- Different dependencies (React, Express, MUI, etc.)
- Optional component (core CLI works without it)
- Larger size (~50MB with dependencies)
- Different release cycle

---

## 📝 NPM Registry Metadata

**Package Name:** `claude-flow-novice`
**Current Version:** `2.0.0`
**License:** MIT
**Repository:** GitHub (update URL before publishing)
**Keywords:** ai, agent, orchestration, multi-agent, coordination, redis, cfn-loop, skills

**Engines:**
- Node.js: >=18.0.0
- NPM: >=9.0.0

---

## 🐛 Troubleshooting

### Package Too Large

If package exceeds 20MB:
```bash
# Check what's taking space
npm pack --dry-run 2>&1 | grep -E "MB|KB"

# Update .npmignore to exclude large files
```

### Missing Files in Package

```bash
# Verify files field in package.json
cat package.json | jq .files

# Check .npmignore patterns
cat .npmignore
```

### Build Failures on Install

```bash
# Users may need to install build tools
# Document in README.md for platforms requiring compilation
# (e.g., better-sqlite3 on some systems)
```

---

## 🔄 Update Process

1. Make changes to source code
2. Update version in package.json
3. Run `npm run build`
4. Run `npm run typecheck`
5. Test locally with `npm pack`
6. Update CHANGELOG.md
7. Commit changes
8. Create git tag: `git tag v2.0.1`
9. Push with tags: `git push --tags`
10. Publish: `npm publish`

---

## 📚 Additional Resources

- [NPM Publishing Guide](https://docs.npmjs.com/cli/v8/commands/npm-publish)
- [Semantic Versioning](https://semver.org/)
- [Package.json Reference](https://docs.npmjs.com/cli/v8/configuring-npm/package-json)
