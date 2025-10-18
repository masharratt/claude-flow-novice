#!/usr/bin/env node

/**
 * Register All Slash Commands
 * 
 * Central registry for all claude-flow-novice slash commands
 */

import { ClaudeMdSlashCommand } from './claude-md.js';
import { SparcCommand } from './sparc.js';
import { SwarmCommand } from './swarm.js';
import { HooksCommand } from './hooks.js';
import { NeuralCommand } from './neural.js';
import { PerformanceCommand } from './performance.js';
import { GitHubCommand } from './github.js';
import { WorkflowCommand } from './workflow.js';
import { CfnLoopCommand } from './cfn-loop.js';
import { CfnLoopSingleCommand } from './cfn-loop-single.js';
import { CfnLoopSprintsCommand } from './cfn-loop-sprints.js';
import { CfnLoopEpicCommand } from './cfn-loop-epic.js';
import { CfnClaudeSyncCommand } from './cfn-claude-sync.js';
import { executeClaudeSoulCommand } from './claude-soul.js';
import { ParseEpicCommand } from './parse-epic.js';
import { CustomRoutingActivateCommand } from './custom-routing-activate-class.js';
import { CustomRoutingDeactivateCommand } from './custom-routing-deactivate-class.js';
import { MetricsSummaryCommand } from './metrics-summary-class.js';

// Context management commands
import { ContextQueryCommand } from './context-query.js';
import { ContextReflectCommand } from './context-reflect.js';
import { ContextCurateCommand } from './context-curate.js';
import { ContextInjectCommand } from './context-inject.js';
import { ContextStatsCommand } from './context-stats.js';

// Development commands
import { FullstackCommand } from './fullstack.js';
import { ListAgentsRebuildCommand } from './list-agents-rebuild.js';
import { LaunchWebDashboardCommand } from './launch-web-dashboard.js';
import { SwitchApiCommand } from './switch-api.js';

// Additional existing commands
import { SpawnAgentCommand } from './spawn-agent.js';
import { CliIntegrationCommand } from './cli-integration.js';
import { ValidateCommandsCommand } from './validate-commands.js';
import { BenchmarkPromptsCommand } from './benchmark-prompts.js';
import { McpSlashIntegrationCommand } from './mcp-slash-integration.js';
import { CfnOptimizeAgentsCommand } from './cfn-optimize-agents.js';

/**
 * Command Registry Class
 */
export class SlashCommandRegistry {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
    this.initializeCommands();
  }

  /**
   * Initialize all available commands
   */
  initializeCommands() {
    // === CFN LOOP COMMANDS ===

    // CFN Loop - 3-loop self-correcting workflow
    this.register(new CfnLoopCommand());
    this.addAlias('cfn-loop', 'cfn');
    this.addAlias('cfn-loop', 'loop');

    // CFN Loop Single - Single task execution
    this.register(new CfnLoopSingleCommand());
    this.addAlias('cfn-loop-single', 'cfn-single');

    // CFN Loop Sprints - Sprint-based phase execution
    this.register(new CfnLoopSprintsCommand());
    this.addAlias('cfn-loop-sprints', 'cfn-sprints');

    // CFN Loop Epic - Multi-phase epic execution
    this.register(new CfnLoopEpicCommand());
    this.addAlias('cfn-loop-epic', 'cfn-epic');

    // CFN Claude Sync - Sync CFN Loop rules from CLAUDE.md
    this.register(new CfnClaudeSyncCommand());
    this.addAlias('cfn-claude-sync', 'cfn-sync');
    this.addAlias('cfn-claude-sync', 'sync');

    // CFN Optimize Agents - Optimize agent performance
    this.register(new CfnOptimizeAgentsCommand());
    this.addAlias('cfn-optimize-agents', 'optimize-agents');

    // === CONTEXT MANAGEMENT COMMANDS ===

    // Context Query - Query context information
    this.register(new ContextQueryCommand());
    this.addAlias('context-query', 'ctx-query');
    this.addAlias('context-query', 'ctx-q');

    // Context Reflect - Reflect on context patterns
    this.register(new ContextReflectCommand());
    this.addAlias('context-reflect', 'ctx-reflect');
    this.addAlias('context-reflect', 'ctx-r');

    // Context Curate - Curate and manage context
    this.register(new ContextCurateCommand());
    this.addAlias('context-curate', 'ctx-curate');
    this.addAlias('context-curate', 'ctx-c');

    // Context Inject - Inject context data
    this.register(new ContextInjectCommand());
    this.addAlias('context-inject', 'ctx-inject');
    this.addAlias('context-inject', 'ctx-i');

    // Context Stats - Display context statistics
    this.register(new ContextStatsCommand());
    this.addAlias('context-stats', 'ctx-stats');
    this.addAlias('context-stats', 'ctx-s');

    // === DEVELOPMENT COMMANDS ===

    // Fullstack - Full-stack development workflow
    this.register(new FullstackCommand());
    this.addAlias('fullstack', 'fs');

    // List Agents Rebuild - Rebuild agents list
    this.register(new ListAgentsRebuildCommand());
    this.addAlias('list-agents-rebuild', 'agents-rebuild');
    this.addAlias('list-agents-rebuild', 'rebuild-agents');

    // Launch Web Dashboard - Launch monitoring dashboard
    this.register(new LaunchWebDashboardCommand());
    this.addAlias('launch-web-dashboard', 'dashboard');
    this.addAlias('launch-web-dashboard', 'web-dashboard');

    // Switch API - Switch API providers
    this.register(new SwitchApiCommand());
    this.addAlias('switch-api', 'api-switch');
    this.addAlias('switch-api', 'provider');

    // Spawn Agent - Spawn individual agent
    this.register(new SpawnAgentCommand());
    this.addAlias('spawn-agent', 'spawn');
    this.addAlias('spawn-agent', 'agent');

    // === CORE SYSTEM COMMANDS ===

    // Core SPARC methodology command
    this.register(new SparcCommand());
    this.addAlias('sparc', 'sp');

    // Swarm management commands
    this.register(new SwarmCommand());
    this.addAlias('swarm', 's');

    // Hooks automation commands
    this.register(new HooksCommand());
    this.addAlias('hooks', 'h');

    // Neural network commands
    this.register(new NeuralCommand());
    this.addAlias('neural', 'n');

    // Performance monitoring commands
    this.register(new PerformanceCommand());
    this.addAlias('performance', 'perf');
    this.addAlias('performance', 'p');

    // GitHub integration commands
    this.register(new GitHubCommand());
    this.addAlias('github', 'gh');
    this.addAlias('github', 'git');

    // Workflow automation commands
    this.register(new WorkflowCommand());
    this.addAlias('workflow', 'wf');
    this.addAlias('workflow', 'w');

    // Epic parser command
    this.register(new ParseEpicCommand());
    this.addAlias('parse-epic', 'parse');
    this.addAlias('parse-epic', 'epic');

    // Metrics summary command
    this.register(new MetricsSummaryCommand());
    this.addAlias('metrics-summary', 'metrics');
    this.addAlias('metrics-summary', 'stats');

    // Custom routing commands
    this.register(new CustomRoutingActivateCommand());
    this.addAlias('custom-routing-activate', 'routing-activate');
    this.addAlias('custom-routing-activate', 'activate-routing');

    this.register(new CustomRoutingDeactivateCommand());
    this.addAlias('custom-routing-deactivate', 'routing-deactivate');
    this.addAlias('custom-routing-deactivate', 'deactivate-routing');

    // === UTILITY COMMANDS ===

    // CLI Integration
    this.register(new CliIntegrationCommand());
    this.addAlias('cli-integration', 'cli');

    // Validate Commands
    this.register(new ValidateCommandsCommand());
    this.addAlias('validate-commands', 'validate');

    // Benchmark Prompts
    this.register(new BenchmarkPromptsCommand());
    this.addAlias('benchmark-prompts', 'benchmark');
    this.addAlias('benchmark-prompts', 'bench');

    // MCP Slash Integration
    this.register(new McpSlashIntegrationCommand());
    this.addAlias('mcp-slash-integration', 'mcp');
    this.addAlias('mcp-slash-integration', 'mcp-integration');

    // Legacy function-based commands
    this.registerLegacyCommand('claude-md', {
      description: 'Generate CLAUDE.md configuration file',
      usage: '/claude-md [--preview] [--force] [--no-backup]',
      execute: async (args, context) => {
        const command = new ClaudeMdSlashCommand();
        const options = {
          preview: args.includes('--preview'),
          force: args.includes('--force'),
          backup: !args.includes('--no-backup')
        };
        return await command.execute(options);
      }
    });

    this.registerLegacyCommand('claude-soul', {
      description: 'Generate claude-soul.md project essence document',
      usage: '/claude-soul [--preview] [--force] [--no-backup]',
      execute: async (args, context) => {
        const options = {
          preview: args.includes('--preview'),
          force: args.includes('--force'),
          backup: !args.includes('--no-backup')
        };
        return await executeClaudeSoulCommand(options);
      }
    });
  }

  /**
   * Register a command
   * @param {SlashCommand} command - Command instance
   */
  register(command) {
    this.commands.set(command.name, command);
    console.log(`✅ Registered /${command.name} command`);
  }

  /**
   * Register legacy function-based command
   * @param {string} name - Command name
   * @param {Object} config - Command configuration
   */
  registerLegacyCommand(name, config) {
    this.commands.set(name, {
      name: name,
      description: config.description,
      usage: config.usage,
      execute: config.execute,
      getHelp: () => ({
        name: name,
        description: config.description,
        usage: config.usage,
        examples: config.examples || []
      })
    });
    console.log(`✅ Registered /${name} legacy command`);
  }

  /**
   * Add alias for a command
   * @param {string} commandName - Original command name
   * @param {string} alias - Alias name
   */
  addAlias(commandName, alias) {
    this.aliases.set(alias, commandName);
  }

  /**
   * Execute a slash command
   * @param {string} input - Full command input (e.g., "/swarm init mesh")
   * @param {Object} context - Execution context
   */
  async execute(input, context = {}) {
    if (!input.startsWith('/')) {
      return {
        success: false,
        error: 'Commands must start with /'
      };
    }

    const parts = input.slice(1).split(' ');
    const commandName = parts[0];
    const args = parts.slice(1);

    // Resolve aliases
    const resolvedName = this.aliases.get(commandName) || commandName;
    const command = this.commands.get(resolvedName);

    if (!command) {
      return {
        success: false,
        error: `Unknown command: ${commandName}`,
        suggestions: this.getSuggestions(commandName)
      };
    }

    try {
      const result = await command.execute(args, context);
      return {
        success: true,
        command: resolvedName,
        result: result
      };
    } catch (error) {
      return {
        success: false,
        error: `Command execution failed: ${error.message}`,
        command: resolvedName
      };
    }
  }

  /**
   * Get command suggestions for unknown commands
   * @param {string} input - Input command
   */
  getSuggestions(input) {
    const commands = Array.from(this.commands.keys());
    const aliases = Array.from(this.aliases.keys());
    const allCommands = [...commands, ...aliases];

    return allCommands
      .filter(cmd => cmd.includes(input) || input.includes(cmd))
      .slice(0, 5);
  }

  /**
   * List all available commands
   */
  listCommands() {
    const commands = [];
    
    for (const [name, command] of this.commands) {
      commands.push({
        name: name,
        description: command.description,
        usage: command.usage || command.getUsage?.() || `/${name} [options]`,
        aliases: Array.from(this.aliases.entries())
          .filter(([alias, target]) => target === name)
          .map(([alias]) => alias)
      });
    }

    return commands.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get help for a specific command
   * @param {string} commandName - Command name
   */
  getHelp(commandName) {
    const resolvedName = this.aliases.get(commandName) || commandName;
    const command = this.commands.get(resolvedName);

    if (!command) {
      return {
        success: false,
        error: `Unknown command: ${commandName}`
      };
    }

    return {
      success: true,
      help: command.getHelp ? command.getHelp() : {
        name: command.name,
        description: command.description,
        usage: command.usage
      }
    };
  }

  /**
   * Generate help text for all commands
   */
  generateHelpText() {
    const commands = this.listCommands();
    
    let helpText = `
🚀 **CLAUDE-FLOW SLASH COMMANDS**

`;
    
    helpText += `**Available Commands:**

`;
    
    for (const cmd of commands) {
      helpText += `**/${cmd.name}** - ${cmd.description}\n`;
      helpText += `  Usage: ${cmd.usage}\n`;
      if (cmd.aliases.length > 0) {
        helpText += `  Aliases: ${cmd.aliases.map(a => `/${a}`).join(', ')}\n`;
      }
      helpText += `\n`;
    }

    helpText += `
**Examples:**
`;
    helpText += `**CFN Loop & Workflow:**\n`;
    helpText += `- \`/cfn-loop "Implement JWT auth"\` - Execute 3-loop self-correcting workflow\n`;
    helpText += `- \`/cfn-sprints "E-commerce platform" --mode=standard\` - Run sprint-based development\n`;
    helpText += `- \`/cfn-epic "User Management System"\` - Execute multi-phase epic\n`;
    helpText += `- \`/cfn-claude-sync\` - Sync rules from CLAUDE.md\n\n`;

    helpText += `**Context Management:**\n`;
    helpText += `- \`/context-query --pattern "cfn/phase-auth/*"\` - Query authentication context\n`;
    helpText += `- \`/context-reflect --summary\` - Reflect on project patterns\n`;
    helpText += `- \`/context-curate clean --older-than=7d\` - Clean old context data\n`;
    helpText += `- \`/context-inject "user-preferences" '{"theme":"dark"}'\` - Inject context data\n`;
    helpText += `- \`/context-stats --format json\` - Get context statistics\n\n`;

    helpText += `**Development Tools:**\n`;
    helpText += `- \`/fullstack init my-blog --framework react --backend express\` - Create fullstack project\n`;
    helpText += `- \`/list-agents-rebuild\` - Rebuild available agents list\n`;
    helpText += `- \`/launch-web-dashboard --port 8080\` - Launch monitoring dashboard\n`;
    helpText += `- \`/switch-api zai --global\` - Switch to Z.ai provider\n\n`;

    helpText += `**Core System:**\n`;
    helpText += `- \`/swarm init mesh 8\` - Initialize mesh swarm with 8 agents\n`;
    helpText += `- \`/hooks enable\` - Enable automation hooks\n`;
    helpText += `- \`/neural train coordination 50\` - Train neural coordination patterns\n`;
    helpText += `- \`/performance report\` - Generate performance report\n`;
    helpText += `- \`/github analyze owner/repo\` - Analyze GitHub repository\n`;
    helpText += `- \`/workflow create "Build Pipeline"\` - Create automated workflow\n`;
    helpText += `- \`/sparc spec "Build API"\` - Run SPARC specification phase\n`;

    helpText += `
**For detailed help on any command:** \`/help <command>\`\n`;
    
    return helpText;
  }
}

/**
 * Global registry instance
 */
export const globalRegistry = new SlashCommandRegistry();

/**
 * Execute slash command with global registry
 * @param {string} input - Command input
 * @param {Object} context - Execution context
 */
export async function executeSlashCommand(input, context = {}) {
  return await globalRegistry.execute(input, context);
}

/**
 * Get all available commands
 */
export function getAllCommands() {
  return globalRegistry.listCommands();
}

/**
 * Get help for specific command
 * @param {string} commandName - Command name
 */
export function getCommandHelp(commandName) {
  return globalRegistry.getHelp(commandName);
}

/**
 * Register additional command
 * @param {SlashCommand} command - Command to register
 */
export function registerCommand(command) {
  return globalRegistry.register(command);
}

export default SlashCommandRegistry;
