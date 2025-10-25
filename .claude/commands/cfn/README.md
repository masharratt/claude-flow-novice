# CLAUDE.md Slash Command System

## 🎯 Simple, Focused CLAUDE.md Generation

A lightweight slash command system for generating CLAUDE.md files with NPX protection.

## 📋 Features

### ✅ **Simple Slash Command**
```bash
/claude-md                    # Generate CLAUDE.md for current project
/claude-md --preview         # Show what would be generated
/claude-md --force           # Overwrite without confirmation
/claude-md --detect          # Auto-detect project and show recommendations
/claude-md --no-backup       # Skip backup creation
```

### 🛡️ **NPX Protection System**
- **Problem**: NPX installs overwrite customized CLAUDE.md files
- **Solution**: Generate `claude-copy-to-main.md` when existing CLAUDE.md detected
- **Benefit**: User customizations are never lost

### 🔄 **Integration Flow**

**Normal Usage (Slash Command):**
1. User runs `/claude-md`
2. System detects project type
3. Generates appropriate CLAUDE.md
4. Creates backup if file exists

**NPX Install Protection:**
1. NPX installs claude-flow-novice
2. `postinstall` script runs
3. Detects existing CLAUDE.md
4. Creates `claude-copy-to-main.md` instead
5. User manually merges desired changes

## 🏗️ Architecture

### **Files:**
- `claude-md.js` - Core slash command implementation
- `register-claude-md.js` - Slash command registration
- `../npx/claude-md-protection.js` - NPX protection logic
- `../../scripts/post-install-claude-md.js` - Post-install hook

### **Integration Points:**
- **Existing Generator**: Uses `../language/claude-md-generator.js`
- **Language Detection**: Uses `../language/language-detector.js`
- **Preferences**: Reads `.claude-flow-novice/preferences/generation.json`
- **Package.json**: `postinstall` script triggers protection

## 🎮 Usage Examples

### **Basic Generation:**
```bash
# Generate CLAUDE.md for current project
/claude-md

# Output:
# 🚀 Generating CLAUDE.md...
# ✅ CLAUDE.md generated successfully
```

### **Preview Mode:**
```bash
# See what would be generated
/claude-md --preview

# Output:
# 📄 CLAUDE.md Preview:
# ══════════════════════════════════════════════════
# # Claude Code Configuration - JavaScript Project
# ...
# ══════════════════════════════════════════════════
# 📊 Total length: 2,847 characters
```

### **NPX Protection:**
```bash
# When NPX detects existing CLAUDE.md
npm install claude-flow-novice

# Output:
# 🛡️ NPX Protection Activated
# 📄 Generated: claude-copy-to-main.md
# 💡 Your existing CLAUDE.md is protected from overwrite
# 🔄 Review and merge changes manually as needed
```

## 🧠 Smart Detection

### **Project Type Detection:**
- Analyzes `package.json`, file patterns, and directory structure
- Detects frameworks (React, Express, Django, etc.)
- Suggests appropriate CLAUDE.md configurations

### **Confidence Levels:**
- **High (>70%)**: Automatic generation recommended
- **Medium (30-70%)**: Generate with user confirmation
- **Low (<30%)**: Manual review suggested

## 🔧 Configuration

### **Generation Preferences:**
`.claude-flow-novice/preferences/generation.json`:
```json
{
  "autoGenerate": true,
  "includeFrameworkSpecific": true,
  "includeBestPractices": true,
  "backupExisting": true,
  "confidenceThreshold": 0.3
}
```

### **NPX Detection:**
- Environment variables (`NPX_INSTALL=true`)
- Temporary directory patterns (`/.npm/_npx/`)
- Package.json analysis (fresh installs)

## 🎯 Design Principles

### **Keep It Simple:**
- Single focused command
- Minimal configuration
- Clear user feedback
- No feature bloat

### **Protect User Work:**
- Never overwrite without permission
- Always offer backup options
- Provide clear merge instructions
- Preserve customizations

### **Smart Defaults:**
- Auto-detect project type
- Use appropriate templates
- Respect user preferences
- Fail safely

## 🚀 Future Enhancements

### **Potential Improvements (If Needed):**
- Interactive confirmation prompts
- Template customization options
- Multi-project detection
- Advanced merge assistance

### **Not Planned (Avoiding Bloat):**
- SQLite analysis integration
- Multi-file scaffolding
- Complex workflow automation
- Enterprise features

---

**Simple, focused, and protective - exactly what CLAUDE.md generation should be!** 🎯