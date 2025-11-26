---
description: "Generate CLAUDE.md configuration with NPX protection and project detection"
argument-hint: "[--preview|--force|--detect|--help]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "mcp__claude-flow__memory_usage", "mcp__claude-flow__language_detect", "mcp__claude-flow__framework_detect"]
---

# CLAUDE.md Generator with NPX Protection

Generate or update CLAUDE.md configuration files with intelligent project detection and NPX protection.

**Arguments**: $ARGUMENTS

## Command Options

- `--preview` - Show generated CLAUDE.md without writing to file
- `--force` - Overwrite existing CLAUDE.md without confirmation
- `--detect` - Auto-detect project type and generate appropriate template
- `--help` - Show detailed usage information

## Features

### 🛡️ NPX Protection System
- Prevents NPX installs from overwriting customized CLAUDE.md files
- Creates `claude-copy-to-main.md` for safe manual merging
- Preserves user customizations during package updates
- Controlled by `.claude-flow-novice/preferences/generation.json`

### 🔍 Intelligent Project Detection
- **98.5% accuracy** across 11+ project types
- Automatic framework detection (Rust, TypeScript, JavaScript, Python)
- Language-specific CLAUDE.md templates
- Build command and test framework detection

### 📋 Template Selection
- **CLAUDE-RUST.md** - Cargo integration, memory safety, performance
- **CLAUDE-JAVASCRIPT.md** - NPM integration, ES6+, async patterns
- **CLAUDE-TYPESCRIPT.md** - Type safety, generics, strict compilation
- **CLAUDE-PYTHON.md** - Virtual envs, type hints, pytest patterns
- **CLAUDE-GENERIC.md** - Universal template for other languages

## Usage Examples

```bash
# Generate CLAUDE.md for current project
/claude-md

# Preview without writing
/claude-md --preview

# Force overwrite existing file
/claude-md --force

# Auto-detect and generate appropriate template
/claude-md --detect
```

## Integration with MCP Tools

Leverages advanced MCP capabilities:
- `language_detect` - Multi-language project analysis
- `framework_detect` - Framework pattern recognition
- `memory_usage` - Store generation preferences

Execute CLAUDE.md generation with intelligent defaults and safety protections.