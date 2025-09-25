# Claude Flow Novice - User Preference System Guide

## Overview

The Claude Flow Novice preference system provides a comprehensive, user-friendly way to configure and manage user preferences throughout the application. It features an interactive setup wizard, intelligent defaults, project detection, and contextual adaptation.

## Architecture

### Core Components

1. **PreferenceWizard** (`/src/preferences/preference-wizard.js`) - 473 lines
   - Interactive setup wizard with inquirer-based prompts
   - Project language and framework detection
   - Experience-level guided configuration
   - Smart defaults based on user background

2. **PreferenceManager** (`/src/preferences/preference-manager.js`) - 490 lines
   - Preference loading, validation, and management
   - Global and project-specific scopes with inheritance
   - Dot-notation key access (e.g., `documentation.verbosity`)
   - Contextual adaptation and suggestions

3. **CLI Integration** (`/src/cli/preferences.js`) - 495 lines
   - Complete CLI command suite
   - Interactive and non-interactive modes
   - Import/export functionality
   - Real-time validation and suggestions

## Features

### 🧙‍♂️ Interactive Setup Wizard

The wizard guides users through preference configuration:

```bash
claude-flow-novice preferences setup
```

**Wizard Steps:**
1. **Project Detection** - Automatically detects languages, frameworks, build tools
2. **Experience Level** - Tailors interface based on user expertise
3. **Documentation Preferences** - Verbosity, explanations, code comments
4. **Feedback Style** - Communication tone, error handling, notifications
5. **Workflow Configuration** - Default agents, concurrency, automation
6. **Advanced Features** - Neural learning, hooks, memory persistence

### 📋 Preference Categories

#### Experience (`experience.*`)
- `level`: beginner | intermediate | advanced
- `background`: Array of development areas
- `goals`: User objectives with the tool

#### Documentation (`documentation.*`)
- `verbosity`: minimal | standard | detailed | verbose
- `explanations`: Include AI reasoning explanations
- `codeComments`: Code commenting level
- `stepByStep`: Show progress for complex operations

#### Feedback (`feedback.*`)
- `tone`: professional | friendly | direct | educational
- `errorHandling`: immediate | summary | guided
- `notifications`: Enable progress notifications
- `confirmations`: never | destructive | important | always

#### Workflow (`workflow.*`)
- `defaultAgents`: Array of default agent types
- `concurrency`: Number of simultaneous agents (1-8)
- `autoSave`: Automatic progress saving
- `testRunning`: never | completion | continuous

#### Advanced (`advanced.*`)
- `memoryPersistence`: Cross-session memory
- `neuralLearning`: Pattern learning optimization
- `hookIntegration`: Advanced automation hooks
- `customAgents`: Custom agent configurations

### 🎯 Smart Defaults & Context Adaptation

**Experience-Based Defaults:**
- **Beginners**: Detailed explanations, guided errors, 2 agents
- **Intermediate**: Standard verbosity, balanced settings, 3 agents
- **Advanced**: Minimal verbosity, direct tone, 4+ agents

**Contextual Adaptation:**
- Simple tasks → Reduced verbosity for advanced users
- Complex tasks → Increased guidance for beginners
- Limited resources → Reduced agent concurrency
- Project type → Framework-specific optimizations

### 🔧 CLI Commands

```bash
# Interactive setup
claude-flow-novice preferences setup

# View current settings
claude-flow-novice preferences show
claude-flow-novice preferences show global
claude-flow-novice preferences show project

# Manage individual preferences
claude-flow-novice preferences set documentation.verbosity detailed
claude-flow-novice preferences set workflow.concurrency 4
claude-flow-novice preferences get feedback.tone

# Validation and suggestions
claude-flow-novice preferences validate
claude-flow-novice preferences suggest

# Import/Export
claude-flow-novice preferences export my-settings.json
claude-flow-novice preferences import team-settings.json

# Reset to defaults
claude-flow-novice preferences reset
claude-flow-novice preferences reset --global --force

# List all available keys
claude-flow-novice preferences list
```

## Project Detection

The system automatically detects:

**Languages:**
- JavaScript/TypeScript (package.json)
- Python (requirements.txt, pyproject.toml)
- Rust (Cargo.toml)
- Go (go.mod)
- Java (pom.xml, build.gradle)

**Frameworks:**
- React, Vue, Angular, Svelte
- Next.js, Nuxt.js
- Express, Fastify, NestJS

**Build Tools:**
- npm, yarn, pnpm
- webpack, vite, rollup
- maven, gradle, cargo

## File Structure

```
.claude-flow-novice/preferences/
├── user-global.json        # Project-specific preferences
└── global.json            # Global preferences (optional)

~/.claude-flow-novice/preferences/
└── global.json            # User global preferences
```

### Preference Inheritance

1. **Defaults** (built-in schema defaults)
2. **Global User** (~/.claude-flow-novice/preferences/global.json)
3. **Project Local** (.claude-flow-novice/preferences/user-global.json)

Project preferences override global, which override defaults.

## Integration with Existing Systems

### Command Registry Integration

Added to `/src/cli/command-registry.js`:
- Full command registration with help, examples, and details
- Integration with existing help system
- Performance tracking compatibility

### Settings.json Integration

Preferences work alongside existing `.claude/settings.json`:
- Preferences focus on user experience
- Settings.json handles system configuration
- No conflicts or overlapping concerns

## Advanced Features

### 💡 Preference Suggestions

The system analyzes current preferences and suggests optimizations:

```bash
claude-flow-novice preferences suggest
```

**Example Suggestions:**
- Enable neural learning for advanced users
- Reduce verbosity for experienced developers
- Enable memory persistence for better context
- Adjust concurrency based on usage patterns

### 🔄 Contextual Adaptation

Preferences automatically adapt based on context:

```javascript
const contextualPrefs = await manager.getContextualPreferences({
  taskComplexity: 'simple',
  systemResources: 'limited',
  userExperience: 'advanced'
});
```

### 📊 Validation & Error Handling

Comprehensive validation with helpful error messages:
- Type validation
- Range checking (e.g., concurrency 1-8)
- Enum validation (e.g., valid experience levels)
- Dependency checking

## Testing

Created comprehensive test suite:
- Unit tests for PreferenceManager
- Validation testing
- Context adaptation testing
- Import/export functionality
- CLI integration tests

## Usage Examples

### First-Time Setup

```bash
# Run interactive wizard
claude-flow-novice preferences setup

# Quick non-interactive setup
claude-flow-novice preferences set experience.level intermediate
claude-flow-novice preferences set documentation.verbosity standard
claude-flow-novice preferences set workflow.concurrency 3
```

### Team Configuration

```bash
# Export team settings
claude-flow-novice preferences export team-defaults.json

# Team members import
claude-flow-novice preferences import team-defaults.json

# Customize individual preferences
claude-flow-novice preferences set feedback.tone friendly
```

### Advanced Users

```bash
# Enable advanced features
claude-flow-novice preferences set advanced.neuralLearning true
claude-flow-novice preferences set advanced.memoryPersistence true
claude-flow-novice preferences set workflow.concurrency 6

# Get optimization suggestions
claude-flow-novice preferences suggest
```

## Benefits

1. **User-Friendly**: Interactive wizard makes setup accessible to beginners
2. **Intelligent**: Smart defaults and contextual adaptation
3. **Flexible**: Global and project-specific scopes
4. **Extensible**: Easy to add new preference categories
5. **Integrated**: Seamlessly works with existing systems
6. **Validated**: Comprehensive error checking and suggestions

## Future Enhancements

- Machine learning-based preference optimization
- Usage pattern analysis for better suggestions
- Integration with external configuration systems
- Visual preference editor
- Preference presets for common workflows
- Team collaboration features

---

The preference system provides a solid foundation for user customization while maintaining the simplicity that makes Claude Flow Novice accessible to beginners and powerful for advanced users.