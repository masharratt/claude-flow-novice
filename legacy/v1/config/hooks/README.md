# Claude Code DevOps Hooks System

A comprehensive hook system for Claude Code that provides automated security, validation, testing, and documentation updates.

## 🎯 Overview

This hook system implements:

1. **Security Protection** - Prevents dangerous edits to .env files
2. **Auto-formatting** - Formats code after edits based on language
3. **Smart Validation** - Language-specific syntax, type, and dependency checks
4. **Fast Testing** - File-specific testing with <5 second feedback
5. **Progressive Validation** - Intelligent validation based on dependency completeness
6. **Agent Coordination** - Integration with SQLite-based agent communication
7. **Documentation Updates** - Automatic maintenance of docs/ directory
8. **Performance Monitoring** - Tracks hook performance and bottlenecks
9. **🆕 Agent Feedback System** - Returns dependency analysis to subagents for self-execution

## 📁 Hook Files

### Core Hooks
- `pre-edit-security.cjs` - Blocks edits to sensitive files (.env, secrets)
- `post-edit-pipeline.cjs` - Comprehensive validation pipeline with formatting
- `smart-dependency-analyzer.cjs` - Dependency analysis with progressive validation
- `fast-file-testing.cjs` - Rapid file-specific testing (optimized for Rust/TS/JS/Python)
- `documentation-auto-update.cjs` - Maintains COMPONENTS.md, ARCHITECTURE.md, etc.
- `agent-feedback-hook.cjs` - **🆕 NEW**: Returns structured dependency analysis to calling subagent

### Management
- `hook-manager.cjs` - Central configuration and execution coordinator
- `hook-test-framework.cjs` - Testing framework for validating hooks
- `pipeline-config.json` - Configuration for formatters, linters, test commands

## 🚀 Quick Setup

### 1. Install Dependencies

```bash
# For formatters and linters (choose what you use)
npm install -g prettier eslint
pip install black flake8 mypy
cargo install rustfmt clippy
```

### 2. Test the Hook System

```bash
# Run comprehensive hook tests
node config/hooks/hook-test-framework.js

# Check hook system status
node config/hooks/hook-manager.js status

# List all available hooks
node config/hooks/hook-manager.js list
```

### 3. Configure Claude Code Hooks

Add to your Claude Code settings:

```json
{
  "hooks": {
    "pre-edit": "node config/hooks/hook-manager.js execute pre-edit",
    "post-edit": "node config/hooks/hook-manager.js execute post-edit"
  }
}
```

## ⚡ Fast File Testing

The fast testing system provides feedback within seconds:

### Rust Files
- **Syntax check** (2s) - `rustc --emit=metadata`
- **Type check** (3s) - `cargo check` for specific file
- **Tests** (4s) - Only tests for the specific file/module
- **Clippy** (2s) - Rust linting

### TypeScript/JavaScript
- **Syntax** (1s) - `tsc --noEmit` for single file
- **Type check** (2s) - TypeScript compiler
- **Tests** (3s) - Jest with specific test file pattern
- **Lint** (1s) - ESLint for single file

### Python
- **Syntax** (1s) - `python -m py_compile`
- **Type check** (2s) - `mypy` for single file
- **Tests** (3s) - `pytest` for specific test file
- **Lint** (1s) - `flake8` for single file

## 🔧 Configuration

### Enable/Disable Hooks

```bash
# Disable a specific hook
node config/hooks/hook-manager.js disable fast-file-testing

# Enable a hook
node config/hooks/hook-manager.js enable fast-file-testing

# View current configuration
node config/hooks/hook-manager.js config
```

### Language-Specific Settings

Edit `config/hooks/hook-config.json`:

```json
{
  "languageSettings": {
    "rust": {
      "fast-file-testing": { "timeout": 5000 },
      "post-edit-pipeline": { "enabled": true }
    },
    "typescript": {
      "fast-file-testing": { "timeout": 4000 }
    }
  }
}
```

## 🛡️ Security Features

### Blocked Operations
- **`.env` file edits** - Prevents accidental exposure of secrets
- **Credential files** - Blocks `secrets.json`, `credentials.yaml`
- **Hardcoded secrets** - Detects API keys, passwords in code
- **Sensitive directories** - Warns about `.git/`, `.ssh/` edits

### Allowed Exceptions
- `.env.example` - Template files are allowed
- `.env.template` - Template files are allowed
- `.env.sample` - Sample files are allowed

## 📚 Documentation System

Automatically maintains:

- **`docs/COMPONENTS.md`** - Component catalog with usage examples
- **`docs/MILESTONES.md`** - Development history and lessons learned
- **`docs/ARCHITECTURE.md`** - How everything connects and why
- **`docs/DECISIONS.md`** - Technical choices and their rationale
- **`docs/PATTERNS.md`** - Reusable code patterns and conventions
- **`docs/TROUBLESHOOTING.md`** - Common issues and solutions

### Trigger Conditions
- **Component changes** → Updates COMPONENTS.md
- **Architecture changes** → Updates ARCHITECTURE.md
- **Config changes** → Updates DECISIONS.md
- **Error handling** → Updates TROUBLESHOOTING.md

## 🔍 Smart Dependency Analysis

### Progressive Validation Tiers

1. **Syntax** (0% dependencies) - Basic syntax checking
2. **Interface** (30% dependencies) - Type and interface validation
3. **Integration** (70% dependencies) - Dependency and integration tests
4. **Full** (90% dependencies) - Complete test suite and security scans

### Agent Coordination

When dependencies are missing:
- **Analysis** - Identifies missing files/packages
- **Agent spawning** - Creates tasks for implementing missing pieces
- **Queue management** - Tracks what needs to be implemented
- **Re-validation** - Re-runs validation as dependencies are created

Example output:
```
🔍 DEPENDENCY ANALYSIS:
✅ 3/5 dependencies exist
⏳ Missing: DatabaseConnection, ConfigService
📊 CURRENT VALIDATION: Syntax + Interface checking only
🎯 TODO: Implement 2 missing dependencies for full validation
🤖 SPAWNING: Agent to create DatabaseConnection stub
```

## 🚄 Performance Optimization

### Caching
- **File hash caching** - Avoids re-testing unchanged files
- **Result caching** - 10-minute cache for test results
- **Dependency caching** - Remembers resolved dependencies

### Parallel Execution
- **Concurrent hooks** - All applicable hooks run simultaneously
- **Language detection** - Optimized per-language execution
- **Timeout management** - Fast failure for hanging processes

### Monitoring
- **Execution time tracking** - Identifies slow hooks
- **Bottleneck analysis** - Reports performance issues
- **Memory usage** - Tracks resource consumption

## 🤖 Agent Communication

### SQLite Integration
- **Cross-swarm communication** - Hooks coordinate via SQLite
- **Message integrity** - Hash verification for agent messages
- **Memory persistence** - Shared memory across sessions
- **Performance metrics** - Tracks hook execution for agents

### Communication Hooks
```javascript
// Before hook execution
npx claude-flow@alpha hooks pre-task --description "validating file.rs"

// During execution
npx claude-flow@alpha hooks post-edit --file "file.rs" --memory-key "validation/result"

// After completion
npx claude-flow@alpha hooks post-task --task-id "validation-123"
```

## 🧪 Testing

### Run Hook Tests
```bash
# Test all hooks
node config/hooks/hook-test-framework.js

# Test individual hook
node config/hooks/pre-edit-security.js test.env

# Test manager functionality
node config/hooks/hook-manager.js execute post-edit test.rs
```

### Test Coverage
- ✅ Hook execution with all file types
- ✅ Error handling and edge cases
- ✅ Security policy enforcement
- ✅ Manager integration
- ✅ Communication system
- ✅ Performance benchmarks

## 🔧 Troubleshooting

### Common Issues

**Hook not executing:**
```bash
# Check if hook is enabled
node config/hooks/hook-manager.js status

# Test hook directly
node config/hooks/fast-file-testing.js test.rs
```

**Slow performance:**
```bash
# Check for bottlenecks
node config/hooks/hook-manager.js execute post-edit test.js

# Disable slow hooks temporarily
node config/hooks/hook-manager.js disable post-edit-pipeline
```

**Tool not found errors:**
```bash
# Install missing tools
npm install -g prettier eslint
pip install black mypy
cargo install rustfmt clippy
```

### Debug Mode
Set environment variable for verbose output:
```bash
export HOOK_DEBUG=1
node config/hooks/hook-manager.js execute post-edit test.rs
```

## 📈 Performance Metrics

Expected performance targets:
- **Security check**: <1 second
- **Syntax validation**: <2 seconds
- **File-specific tests**: <5 seconds
- **Full validation**: <30 seconds
- **Documentation update**: <10 seconds

## 🎯 Integration with Claude Code

### Recommended Settings
```json
{
  "hooks": {
    "pre-edit": "node config/hooks/hook-manager.js execute pre-edit",
    "post-edit": "node config/hooks/hook-manager.js execute post-edit",
    "user-prompt-submit": "npx claude-flow@alpha hooks session-restore",
    "tool-result": "npx claude-flow@alpha hooks post-edit"
  }
}
```

### Agent Workflow
1. **Pre-edit** - Security validation
2. **Code generation** - Agent writes code
3. **Post-edit** - Full validation pipeline
4. **Agent feedback** - Results stored in memory
5. **Documentation** - Auto-update docs
6. **Communication** - Share results with other agents

This system provides comprehensive DevOps automation while maintaining rapid feedback cycles essential for agent-assisted development.