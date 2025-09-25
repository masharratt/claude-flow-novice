# Personalization CLI Integration Guide

This guide explains how the personalization system integrates with Claude Flow Novice's CLI architecture.

## Overview

The personalization system provides a unified CLI interface that seamlessly integrates with the existing Claude Flow Novice command structure. It offers AI-powered workflow optimization, intelligent resource allocation, and adaptive user experience customization.

## Architecture

### Core Components

```
src/cli/
├── personalization-cli.js          # Main CLI handler
├── personalization-integration.js  # Integration utilities
├── help/
│   └── personalization-help.js     # Comprehensive help system
└── __tests__/
    └── personalization-integration.test.js
```

### Integration Points

1. **Command Registry** (`command-registry.js`)
   - Registers the `personalize` command
   - Provides comprehensive help documentation
   - Maintains backward compatibility

2. **CLI Core** (`simple-cli.js`)
   - Executes personalization commands
   - Handles error scenarios gracefully
   - Provides fallback functionality

3. **Help System** (`help-formatter.js`)
   - Integrates personalization help
   - Maintains consistent help formatting
   - Provides contextual guidance

## Command Structure

### Main Command

```bash
claude-flow-novice personalize <subcommand> [options]
```

### Subcommands

| Command | Description | Example |
|---------|-------------|---------|
| `setup` | Interactive setup wizard | `personalize setup` |
| `status` | Show current settings | `personalize status --verbose` |
| `optimize` | Get optimization suggestions | `personalize optimize --auto-apply` |
| `analytics` | Usage insights and metrics | `personalize analytics --export report.json` |
| `resource` | Resource delegation management | `personalize resource assign coder --priority high` |
| `dashboard` | Interactive dashboard | `personalize dashboard --fullscreen` |
| `export` | Export settings | `personalize export settings.json` |
| `import` | Import settings | `personalize import settings.json --verify` |
| `reset` | Reset to defaults | `personalize reset --force` |

### Global Flags

- `--verbose` - Detailed output
- `--json` - JSON format output
- `--force` - Skip confirmations
- `--dry-run` - Preview changes only
- `--interactive` - Force interactive mode

## Integration Features

### 1. Graceful Degradation

The system provides fallback functionality when personalization modules are unavailable:

```javascript
// Automatic fallback detection
const isAvailable = await PersonalizationIntegration.isAvailable();
const handler = await PersonalizationIntegration.getCommandHandler();
```

### 2. Error Handling

Comprehensive error handling with user-friendly messages:

```javascript
// Enhanced error handling with recovery suggestions
await PersonalizationIntegration.executeWithErrorHandling(handler, args, flags);
```

### 3. Backward Compatibility

Maintains compatibility with existing CLI patterns:

```javascript
// Standard CLI conventions
const validation = PersonalizationIntegration.validateCommand(args, flags);
```

### 4. Help System Integration

Comprehensive help with contextual guidance:

```javascript
// Command-specific help
PersonalizationIntegration.showHelp('setup');

// Main help overview
PersonalizationIntegration.showHelp();
```

## Usage Examples

### First-Time Setup

```bash
# Complete setup wizard
claude-flow-novice personalize setup

# Check configuration
claude-flow-novice personalize status --verbose

# Get initial optimization suggestions
claude-flow-novice personalize optimize
```

### Daily Workflow

```bash
# Morning optimization check
claude-flow-novice personalize optimize --auto-apply

# Assign high-priority resources
claude-flow-novice personalize resource assign coder --priority high

# Evening analytics review
claude-flow-novice personalize analytics --export daily-report.json
```

### Advanced Usage

```bash
# Interactive dashboard
claude-flow-novice personalize dashboard --fullscreen

# Export configuration for backup
claude-flow-novice personalize export backup-$(date +%Y%m%d).json

# Import shared team settings
claude-flow-novice personalize import team-settings.json --verify
```

## Development Integration

### Adding New Subcommands

1. Add handler to `PersonalizationCLI` class:

```javascript
async handleNewCommand(args, flags) {
  // Implementation
}
```

2. Update command routing:

```javascript
case 'new-command':
  return this.handleNewCommand(args.slice(1), flags);
```

3. Add help documentation:

```javascript
static showNewCommandHelp() {
  // Help content
}
```

4. Update validation:

```javascript
const validCommands = [..., 'new-command'];
```

### Testing Integration

Run integration tests:

```bash
npm test src/cli/__tests__/personalization-integration.test.js
```

Key test areas:
- Command registration
- Help system integration
- Error handling
- Backward compatibility
- Module availability
- User workflow patterns

## Troubleshooting

### Common Issues

1. **Module Not Available**
   ```
   ⚠️ Personalization system is not fully available.
   ```
   - Check module installation: `npm install`
   - Verify file permissions
   - Run: `claude-flow-novice personalize status`

2. **Command Not Found**
   ```
   ❌ Unknown personalization command: 'comand'
   💡 Did you mean: command?
   ```
   - Use built-in typo correction
   - Run: `claude-flow-novice personalize help`

3. **Permission Errors**
   - Check file system permissions
   - Ensure write access to config directories
   - Run with appropriate user privileges

### Debug Mode

Enable verbose debugging:

```bash
claude-flow-novice personalize <command> --verbose --debug
```

## Best Practices

### For Users

1. **Start with Setup**: Always run `personalize setup` first
2. **Regular Optimization**: Check suggestions weekly with `personalize optimize`
3. **Monitor Analytics**: Review usage patterns with `personalize analytics`
4. **Backup Settings**: Export settings regularly with `personalize export`

### For Developers

1. **Graceful Handling**: Always provide fallback functionality
2. **Clear Error Messages**: Include actionable recovery suggestions
3. **Consistent Patterns**: Follow existing CLI conventions
4. **Comprehensive Testing**: Test integration scenarios thoroughly

## API Reference

### PersonalizationCLI

Main class handling personalization commands.

```javascript
class PersonalizationCLI {
  async handleCommand(args, flags)
  async runSetupWizard(flags)
  async showStatus(flags)
  async getOptimizationSuggestions(flags)
  async showAnalytics(flags)
  // ... other methods
}
```

### PersonalizationIntegration

Integration utilities and middleware.

```javascript
class PersonalizationIntegration {
  static async initialize()
  static async isAvailable()
  static async getCommandHandler()
  static validateCommand(args, flags)
  static async executeWithErrorHandling(handler, args, flags)
  // ... other methods
}
```

## Migration Guide

### From Basic Preferences

If migrating from basic preference management:

1. Export existing preferences:
   ```bash
   claude-flow-novice preferences export old-prefs.json
   ```

2. Run personalization setup:
   ```bash
   claude-flow-novice personalize setup
   ```

3. Import relevant settings if needed:
   ```bash
   claude-flow-novice personalize import old-prefs.json
   ```

### Version Compatibility

- **v1.0.0+**: Full personalization system
- **v0.x**: Basic preferences only (migration recommended)

## Support

### Documentation

- Main documentation: `docs/personalization/`
- API reference: `docs/api/personalization.md`
- Examples: `examples/personalization/`

### Help Commands

- `claude-flow-novice personalize help`
- `claude-flow-novice help personalize <command>`
- `claude-flow-novice personalize <command> --help`

### Community

- GitHub Issues: Report bugs and feature requests
- Discussions: Share usage patterns and tips
- Wiki: Community-maintained examples and guides

---

The personalization CLI integration provides a powerful, user-friendly interface for optimizing your Claude Flow Novice experience. Its design ensures compatibility, reliability, and ease of use while providing advanced AI-powered workflow optimization capabilities.