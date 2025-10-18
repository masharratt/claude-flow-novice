# Command Implementation Plan

## Auto-Registration Strategy

### Phase 1: Register Existing Slash Commands (Immediate)

These commands are already implemented in `src/slash-commands/` and just need registration:

```javascript
// Add to src/cli/command-registry.js

// CFN Loop Commands
import { CfnLoopCommand } from '../slash-commands/cfn-loop.js';
import { CfnLoopSingleCommand } from '../slash-commands/cfn-loop-single.js';
import { CfnLoopEpicCommand } from '../slash-commands/cfn-loop-epic.js';
import { CfnLoopSprintsCommand } from '../slash-commands/cfn-loop-sprints.js';
import { CfnClaudeSyncCommand } from '../slash-commands/cfn-claude-sync.js';

// Routing Commands
import { CustomRoutingActivateCommand } from '../slash-commands/custom-routing-activate.js';
import { CustomRoutingDeactivateCommand } from '../slash-commands/custom-routing-deactivate.js';

// Optimization Commands
import { CfnOptimizeAgentsCommand } from '../slash-commands/cfn-optimize-agents.js';

// Metrics Commands
import { MetricsSummaryCommand } from '../slash-commands/metrics-summary-class.js';

// GitHub Commands
import { GitHubSlashCommand } from '../slash-commands/github.js';

// Register in registerCoreCommands():
commandRegistry.set('cfn-loop', {
  handler: async (args, flags) => {
    const command = new CfnLoopCommand();
    return await command.execute(args, { flags });
  },
  description: 'Execute autonomous 3-loop self-correcting CFN workflow',
  usage: 'cfn-loop <task description> [--phase=name] [--max-loop2=10] [--max-loop3=10]',
  examples: [
    'cfn-loop "Implement JWT authentication" --phase=implementation',
    'cfn-loop "Fix security vulnerabilities" --phase=security-audit',
  ],
});

// Repeat pattern for other commands...
```

### Phase 2: Implement Missing High-Value Commands

#### Context Management Commands (6 commands)
Create `src/cli/simple-commands/context-management.js`:

```javascript
export async function contextCurateCommand(args, flags) {
  // Leverage existing context-helper.js
  const { ContextHelper } = await import('../../guidance/context-helper.js');
  // Implementation using context helper
}

export async function contextInjectCommand(args, flags) {
  // Inject context into session
}

export async function contextQueryCommand(args, flags) {
  // Query context database
}

export async function contextReflectCommand(args, flags) {
  // Reflect on context usage
}

export async function contextStatsCommand(args, flags) {
  // Show context statistics
}

export async function autoCompactCommand(args, flags) {
  // Auto-compact context
}

// Register all context commands
commandRegistry.set('context-curate', { ... });
commandRegistry.set('context-inject', { ... });
// etc.
```

#### Fullstack Development Commands
Create `src/cli/simple-commands/fullstack.js`:

```javascript
export async function fullstackCommand(args, flags) {
  const subcommand = args[0];

  switch (subcommand) {
    case 'develop':
      return await fullstackDevelop(args.slice(1), flags);
    case 'spawn':
      return await fullstackSpawn(args.slice(1), flags);
    case 'status':
      return await fullstackStatus(args.slice(1), flags);
    case 'terminate':
      return await fullstackTerminate(args.slice(1), flags);
    default:
      return await fullstackDevelop(args, flags);
  }
}

commandRegistry.set('fullstack', {
  handler: fullstackCommand,
  description: 'Fullstack development workflow orchestration',
  usage: 'fullstack [develop|spawn|status|terminate] [options]',
  examples: [
    'fullstack develop "E-commerce API"',
    'fullstack spawn --stack mern --database postgres',
    'fullstack status',
  ],
});
```

#### Parse Epic Command
Create `src/cli/simple-commands/parse-epic.js`:

```javascript
export async function parseEpicCommand(args, flags) {
  const epicFile = args[0];
  const mode = flags.mode || flags['cfn-mode'] || 'auto';

  // Parse epic JSON file
  // Auto-detect mode from filename if --cfn-mode=auto
  // Return structured epic configuration
}

commandRegistry.set('parse-epic', {
  handler: parseEpicCommand,
  description: 'Parse epic configuration and auto-detect CFN mode',
  usage: 'parse-epic <epic-file> [--cfn-mode=auto|mvp|standard|enterprise]',
  examples: [
    'parse-epic ./auth-mvp.json --cfn-mode=auto',
    'parse-epic ./platform.json --cfn-mode=enterprise',
  ],
});
```

#### Suggestion Commands
Create `src/cli/simple-commands/suggestions.js`:

```javascript
export async function suggestImprovementsCommand(args, flags) {
  // Analyze codebase and suggest improvements
}

export async function suggestTemplatesCommand(args, flags) {
  // Suggest project templates based on context
}

commandRegistry.set('suggest-improvements', { ... });
commandRegistry.set('suggest-templates', { ... });
```

#### Dependency Recommendations
Create `src/cli/simple-commands/dependency-analysis.js`:

```javascript
export async function dependencyRecommendationsCommand(args, flags) {
  // Analyze dependencies and recommend improvements
}

commandRegistry.set('dependency-recommendations', { ... });
```

### Phase 3: Medium Priority Commands

#### Testing Commands
- `hello-world-tests` - Basic test generation
- `performance` - Performance analysis tools

#### Analysis Commands
- `neural` - Neural network operations
- `check:memory` - Memory checking utility

#### Integration Commands
- `eventbus` - Event bus operations
- `github-commit` - Enhanced git commit automation

## Implementation Details

### Registration Pattern
```javascript
// Standard registration pattern
commandRegistry.set('command-name', {
  handler: commandHandlerFunction,
  description: 'Brief description',
  usage: 'command-name <args> [options]',
  examples: ['example1', 'example2'],
  details: `Optional detailed information
    spanning multiple lines`,
});
```

### Import Strategy
- Group related commands in single files
- Use dynamic imports for optional dependencies
- Maintain backward compatibility
- Follow existing patterns in command-registry.js

### Testing Strategy
1. Register command with basic implementation
2. Test CLI recognition (`claude-flow-novice command --help`)
3. Test basic functionality
4. Add comprehensive error handling
5. Add integration tests

## Priority Order

### Week 1 (Immediate)
1. Register all existing slash commands (10 commands)
2. Test integration with existing CLI
3. Update documentation

### Week 2 (High Value)
1. Implement context management commands (6 commands)
2. Implement parse-epic command
3. Implement fullstack commands

### Week 3 (Enhancements)
1. Implement suggestion commands (3 commands)
2. Implement dependency-recommendations
3. Implement hello-world-tests

### Week 4 (Analysis Tools)
1. Implement performance command
2. Implement neural command
3. Implement remaining specialized commands

## Success Metrics
- All documented commands registered and functional
- CLI help shows complete command list
- All commands pass basic functionality tests
- Documentation matches implementation

## Confidence Score: 0.95

### High Confidence Because:
- Clear implementation path
- Most commands already exist as slash commands
- Established patterns in codebase
- Well-defined registration process