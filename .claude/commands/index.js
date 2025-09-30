#!/usr/bin/env node

/**
 * Slash Commands Index
 * 
 * Exports all slash commands and utilities
 */

// Base command class
export { SlashCommand } from '../core/slash-command.js';

// Individual command classes
export { SparcCommand } from './sparc.js';
export { SwarmCommand } from './swarm.js';
export { HooksCommand } from './hooks.js';
export { NeuralCommand } from './neural.js';
export { PerformanceCommand } from './performance.js';
export { GitHubCommand } from './github.js';
export { WorkflowCommand } from './workflow.js';
export { ClaudeMdSlashCommand } from './claude-md.js';

// Command executors
export { executeClaudeSoulCommand } from './claude-soul.js';
export { executeClaudeMdCommand } from './claude-md.js';

// Registry and utilities
export {
  SlashCommandRegistry,
  globalRegistry,
  executeSlashCommand,
  getAllCommands,
  getCommandHelp,
  registerCommand
} from './register-all-commands.js';

// Registration functions
export { registerClaudeSoulCommand } from './register-claude-soul.js';
export { default as registerClaudeMd } from './register-claude-md.js';

/**
 * Quick access to commonly used commands
 */
export const Commands = {
  SPARC: 'sparc',
  SWARM: 'swarm',
  FULLSTACK: 'fullstack',
  HOOKS: 'hooks',
  NEURAL: 'neural',
  PERFORMANCE: 'performance',
  GITHUB: 'github',
  WORKFLOW: 'workflow',
  CLAUDE_MD: 'claude-md',
  CLAUDE_SOUL: 'claude-soul'
};

/**
 * Command aliases for quick access
 */
export const Aliases = {
  s: 'swarm',
  fs: 'fullstack',
  full: 'fullstack',
  h: 'hooks',
  n: 'neural',
  p: 'performance',
  perf: 'performance',
  gh: 'github',
  git: 'github',
  w: 'workflow',
  wf: 'workflow'
};

/**
 * Initialize all slash commands
 * @returns {SlashCommandRegistry} - Initialized registry
 */
export function initializeSlashCommands() {
  console.log('🚀 Initializing Claude-Flow slash commands...');
  
  // Registry is automatically initialized when imported
  const commandCount = globalRegistry.listCommands().length;
  
  console.log(`✅ Initialized ${commandCount} slash commands`);
  console.log('Available commands:', Object.values(Commands).join(', '));
  
  return globalRegistry;
}

/**
 * Get quick help text
 */
export function getQuickHelp() {
  return `
🚀 **CLAUDE-FLOW SLASH COMMANDS**

**Essential Commands:**
- \`/fullstack "goal"\` - Launch full-stack development team with consensus validation
- \`/swarm init mesh 8\` - Initialize agent swarm
- \`/hooks enable\` - Enable automation hooks
- \`/sparc spec "task"\` - Run SPARC methodology
- \`/neural train coordination\` - Train neural patterns
- \`/performance report\` - Generate performance report
- \`/github analyze repo\` - Analyze GitHub repository
- \`/workflow create "name"\` - Create automated workflow

**For full help:** Use \`/help\` or see individual command documentation
`;
}

export default {
  Commands,
  Aliases,
  globalRegistry,
  executeSlashCommand,
  getAllCommands,
  getCommandHelp,
  initializeSlashCommands,
  getQuickHelp
};
