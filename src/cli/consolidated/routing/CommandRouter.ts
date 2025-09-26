/**
 * CommandRouter - Routes commands with backward compatibility
 * Handles command routing, aliasing, and legacy command mapping
 */

import { TierManager, UserTier } from '../core/TierManager.js';
import { IntelligenceEngine } from '../intelligence/IntelligenceEngine.js';
import { CommandHandlers } from '../core/CommandHandlers.js';

export interface CommandRoute {
  command: string;
  handler: string;
  tier: UserTier;
  aliases: string[];
  deprecated?: boolean;
  replacedBy?: string;
  mcpTool?: string;
}

export interface RouterConfig {
  enableBackwardCompatibility: boolean;
  showDeprecationWarnings: boolean;
  autoUpgradeCommands: boolean;
  legacyMode: boolean;
}

export class CommandRouter {
  private tierManager: TierManager;
  private intelligenceEngine: IntelligenceEngine;
  private commandHandlers: CommandHandlers;
  private config: RouterConfig;

  // Core 5 commands that are always available
  private readonly coreRoutes: CommandRoute[] = [
    {
      command: 'init',
      handler: 'handleInit',
      tier: UserTier.NOVICE,
      aliases: ['initialize', 'create', 'new', 'start'],
      mcpTool: 'swarm_init'
    },
    {
      command: 'build',
      handler: 'handleBuild',
      tier: UserTier.NOVICE,
      aliases: ['develop', 'make', 'create-feature', 'implement'],
      mcpTool: 'task_orchestrate'
    },
    {
      command: 'status',
      handler: 'handleStatus',
      tier: UserTier.NOVICE,
      aliases: ['info', 'show', 'dashboard', 'overview'],
      mcpTool: 'swarm_status'
    },
    {
      command: 'help',
      handler: 'handleHelp',
      tier: UserTier.NOVICE,
      aliases: ['h', '--help', '-h', 'docs', 'guide']
    },
    {
      command: 'learn',
      handler: 'handleLearn',
      tier: UserTier.NOVICE,
      aliases: ['tutorial', 'training', 'discover', 'unlock']
    }
  ];

  // Intermediate tier commands (unlocked with experience)
  private readonly intermediateRoutes: CommandRoute[] = [
    {
      command: 'agents',
      handler: 'handleAgents',
      tier: UserTier.INTERMEDIATE,
      aliases: ['agent', 'spawn', 'workers'],
      mcpTool: 'agent_spawn'
    },
    {
      command: 'test',
      handler: 'handleTest',
      tier: UserTier.INTERMEDIATE,
      aliases: ['testing', 'verify', 'validate'],
      mcpTool: 'task_orchestrate'
    },
    {
      command: 'deploy',
      handler: 'handleDeploy',
      tier: UserTier.INTERMEDIATE,
      aliases: ['deployment', 'publish', 'release'],
      mcpTool: 'workflow_execute'
    },
    {
      command: 'optimize',
      handler: 'handleOptimize',
      tier: UserTier.INTERMEDIATE,
      aliases: ['performance', 'perf', 'speed'],
      mcpTool: 'bottleneck_analyze'
    },
    {
      command: 'review',
      handler: 'handleReview',
      tier: UserTier.INTERMEDIATE,
      aliases: ['audit', 'check', 'quality'],
      mcpTool: 'quality_assess'
    }
  ];

  // Legacy command mappings for backward compatibility
  private readonly legacyRoutes: CommandRoute[] = [
    {
      command: 'sparc',
      handler: 'handleLegacySparc',
      tier: UserTier.EXPERT,
      aliases: ['sparc-run', 'sparc-tdd'],
      deprecated: true,
      replacedBy: 'build'
    },
    {
      command: 'swarm-init',
      handler: 'handleLegacySwarmInit',
      tier: UserTier.EXPERT,
      aliases: ['swarm', 'topology'],
      deprecated: true,
      replacedBy: 'init'
    },
    {
      command: 'agent-spawn',
      handler: 'handleLegacyAgentSpawn',
      tier: UserTier.EXPERT,
      aliases: ['spawn-agent'],
      deprecated: true,
      replacedBy: 'agents'
    },
    {
      command: 'task-orchestrate',
      handler: 'handleLegacyTaskOrchestrate',
      tier: UserTier.EXPERT,
      aliases: ['orchestrate', 'workflow'],
      deprecated: true,
      replacedBy: 'build'
    }
  ];

  constructor(
    tierManager: TierManager,
    intelligenceEngine: IntelligenceEngine,
    commandHandlers: CommandHandlers,
    config: RouterConfig = {
      enableBackwardCompatibility: true,
      showDeprecationWarnings: true,
      autoUpgradeCommands: true,
      legacyMode: false
    }
  ) {
    this.tierManager = tierManager;
    this.intelligenceEngine = intelligenceEngine;
    this.commandHandlers = commandHandlers;
    this.config = config;
  }

  /**
   * Route a command to its appropriate handler
   */
  async route(command: string, args: string[] = [], options: any = {}): Promise<any> {
    try {
      // Normalize command (handle aliases and case sensitivity)
      const normalizedCommand = this.normalizeCommand(command);

      // Find the route
      const route = this.findRoute(normalizedCommand);

      if (!route) {
        return this.handleUnknownCommand(command, args, options);
      }

      // Check tier access
      if (!this.hasAccess(route)) {
        return this.handleInsufficientAccess(route);
      }

      // Handle deprecated commands
      if (route.deprecated && this.config.showDeprecationWarnings) {
        this.showDeprecationWarning(route);

        if (this.config.autoUpgradeCommands && route.replacedBy) {
          console.log(`🔄 Auto-upgrading to: ${route.replacedBy}`);
          return this.route(route.replacedBy, args, options);
        }
      }

      // Execute the command
      return await this.executeCommand(route, args, options);
    } catch (error) {
      return this.handleRouterError(error, command, args);
    }
  }

  /**
   * Get all available commands for the current tier
   */
  getAvailableCommands(): CommandRoute[] {
    const currentTier = this.tierManager.getCurrentTier();
    const allRoutes = [...this.coreRoutes, ...this.intermediateRoutes];

    if (this.config.enableBackwardCompatibility) {
      allRoutes.push(...this.legacyRoutes);
    }

    return allRoutes.filter(route => this.canAccessRoute(route, currentTier));
  }

  /**
   * Check if a command exists and is accessible
   */
  isCommandAvailable(command: string): boolean {
    const route = this.findRoute(this.normalizeCommand(command));
    return route !== null && this.hasAccess(route);
  }

  /**
   * Get command suggestions for unknown commands
   */
  getCommandSuggestions(command: string): string[] {
    const availableCommands = this.getAvailableCommands();
    const suggestions: Array<{command: string, score: number}> = [];

    for (const route of availableCommands) {
      const allNames = [route.command, ...route.aliases];

      for (const name of allNames) {
        const score = this.calculateSimilarity(command, name);
        if (score > 0.3) {
          suggestions.push({ command: route.command, score });
        }
      }
    }

    // Sort by similarity and return top 3
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.command);
  }

  /**
   * Handle natural language command interpretation
   */
  async interpretNaturalLanguage(input: string): Promise<{command: string, args: string[], confidence: number}> {
    // Use intelligence engine to interpret natural language
    const analysis = await this.intelligenceEngine.analyzeTask(input);

    // Map intent to command
    const commandMap: Record<string, string> = {
      'create': 'init',
      'build': 'build',
      'implement': 'build',
      'test': 'test',
      'deploy': 'deploy',
      'optimize': 'optimize',
      'review': 'review',
      'analyze': 'status',
      'help': 'help'
    };

    const command = commandMap[analysis.intent] || 'build';

    return {
      command,
      args: [input],
      confidence: analysis.confidence
    };
  }

  // Private methods

  private normalizeCommand(command: string): string {
    return command.toLowerCase().trim();
  }

  private findRoute(command: string): CommandRoute | null {
    const allRoutes = [...this.coreRoutes, ...this.intermediateRoutes, ...this.legacyRoutes];

    for (const route of allRoutes) {
      if (route.command === command || route.aliases.includes(command)) {
        return route;
      }
    }

    return null;
  }

  private hasAccess(route: CommandRoute): boolean {
    const currentTier = this.tierManager.getCurrentTier();
    return this.canAccessRoute(route, currentTier);
  }

  private canAccessRoute(route: CommandRoute, tier: UserTier): boolean {
    // Core commands are always accessible
    if (this.coreRoutes.includes(route)) {
      return true;
    }

    // Check tier hierarchy
    switch (tier) {
      case UserTier.NOVICE:
        return route.tier === UserTier.NOVICE;
      case UserTier.INTERMEDIATE:
        return route.tier === UserTier.NOVICE || route.tier === UserTier.INTERMEDIATE;
      case UserTier.EXPERT:
        return true; // Expert has access to everything
      default:
        return false;
    }
  }

  private async executeCommand(route: CommandRoute, args: string[], options: any): Promise<any> {
    const handler = this.commandHandlers[route.handler as keyof CommandHandlers];

    if (typeof handler !== 'function') {
      throw new Error(`Handler ${route.handler} not found`);
    }

    // Parse arguments based on command type
    const parsedOptions = this.parseCommandOptions(route.command, args, options);

    // Execute the handler
    return await (handler as Function).call(this.commandHandlers, parsedOptions);
  }

  private parseCommandOptions(command: string, args: string[], options: any): any {
    // Command-specific option parsing
    switch (command) {
      case 'init':
        return {
          projectType: args[0],
          template: options.template,
          interactive: options.interactive || options.i,
          skipGit: options['skip-git']
        };

      case 'build':
        return {
          feature: args.join(' ') || options.feature,
          agent: options.agent,
          parallel: options.parallel,
          dryRun: options['dry-run']
        };

      case 'status':
        return {
          detailed: options.detailed || options.d,
          watch: options.watch || options.w,
          format: options.format
        };

      case 'help':
        return {
          command: args[0],
          interactive: options.interactive || options.i,
          examples: options.examples,
          newFeatures: options['new-features']
        };

      case 'learn':
        return {
          topic: args[0],
          level: options.level,
          interactive: options.interactive || options.i
        };

      default:
        return { args, ...options };
    }
  }

  private async handleUnknownCommand(command: string, args: string[], options: any): Promise<any> {
    const suggestions = this.getCommandSuggestions(command);

    // Try natural language interpretation
    if (args.length > 0 || command.length > 3) {
      const fullInput = [command, ...args].join(' ');
      const interpretation = await this.interpretNaturalLanguage(fullInput);

      if (interpretation.confidence > 0.6) {
        console.log(`🤖 Interpreted "${fullInput}" as: ${interpretation.command}`);
        return this.route(interpretation.command, interpretation.args, options);
      }
    }

    let message = `❌ Unknown command: ${command}`;

    if (suggestions.length > 0) {
      message += `\n\n💡 Did you mean one of these?`;
      suggestions.forEach(suggestion => {
        message += `\n   claude-flow ${suggestion}`;
      });
    }

    message += `\n\n✨ Tip: Try natural language!`;
    message += `\n   Example: claude-flow build "add user authentication"`;
    message += `\n   Use: claude-flow help to see all commands`;

    return {
      success: false,
      message,
      suggestions: suggestions.length > 0 ? suggestions : ['help', 'learn', 'status']
    };
  }

  private handleInsufficientAccess(route: CommandRoute): any {
    const currentTier = this.tierManager.getCurrentTier();
    const progress = this.tierManager.getProgressSummary();

    return {
      success: false,
      message: `🔒 Command "${route.command}" requires ${route.tier.toUpperCase()} tier`,
      data: {
        currentTier,
        requiredTier: route.tier,
        progress
      },
      suggestions: [
        `You're currently ${currentTier.toUpperCase()} tier`,
        progress.nextTierRequirements || 'Keep using commands to unlock new features',
        'Use `claude-flow learn` to discover how to unlock more commands'
      ]
    };
  }

  private showDeprecationWarning(route: CommandRoute): void {
    console.log(`⚠️  DEPRECATED: Command "${route.command}" is deprecated`);
    if (route.replacedBy) {
      console.log(`   Use "${route.replacedBy}" instead`);
    }
    console.log('   This command will be removed in a future version\n');
  }

  private handleRouterError(error: any, command: string, args: string[]): any {
    console.error(`🚨 Router error for command "${command}":`, error);

    return {
      success: false,
      message: `❌ Internal router error: ${error instanceof Error ? error.message : String(error)}`,
      suggestions: [
        'Try the command again',
        'Check `claude-flow status` for system issues',
        'Use `claude-flow help` for command guidance'
      ]
    };
  }

  private calculateSimilarity(a: string, b: string): number {
    // Simple Levenshtein distance-based similarity
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i += 1) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= b.length; j += 1) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= b.length; j += 1) {
      for (let i = 1; i <= a.length; i += 1) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator  // substitution
        );
      }
    }

    const distance = matrix[b.length][a.length];
    const maxLength = Math.max(a.length, b.length);
    return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
  }

  /**
   * Legacy command handlers for backward compatibility
   */
  private async handleLegacySparc(options: any): Promise<any> {
    console.log('🔄 Converting SPARC command to modern build workflow...');

    const sparcToBuildMap: Record<string, string> = {
      'spec-pseudocode': 'analyze and plan implementation',
      'architect': 'design system architecture',
      'tdd': 'implement with test-driven development',
      'integration': 'integrate and test components'
    };

    const mode = options.args?.[0];
    const task = options.args?.[1] || 'implement feature';

    let buildCommand = task;
    if (mode && sparcToBuildMap[mode]) {
      buildCommand = `${sparcToBuildMap[mode]}: ${task}`;
    }

    return this.commandHandlers.handleBuild({ feature: buildCommand });
  }

  private async handleLegacySwarmInit(options: any): Promise<any> {
    console.log('🔄 Converting swarm-init to modern project initialization...');

    const topology = options.topology || 'balanced team';
    const projectType = this.mapTopologyToProjectType(topology);

    return this.commandHandlers.handleInit({ projectType, interactive: false });
  }

  private async handleLegacyAgentSpawn(options: any): Promise<any> {
    console.log('🔄 Converting agent-spawn to modern agent management...');

    // This would map to the intermediate tier agents command
    // For now, suggest using the build command which automatically selects agents
    return {
      success: true,
      message: '✨ Agent spawning is now automatic!',
      suggestions: [
        'Use `claude-flow build "your feature"` - agents are selected automatically',
        'Upgrade to Intermediate tier to access direct agent management',
        'Use `claude-flow learn agents` to understand the new system'
      ]
    };
  }

  private async handleLegacyTaskOrchestrate(options: any): Promise<any> {
    console.log('🔄 Converting task-orchestrate to modern build command...');

    const task = options.task || options.args?.join(' ') || 'implement feature';
    return this.commandHandlers.handleBuild({ feature: task });
  }

  private mapTopologyToProjectType(topology: string): string {
    const topologyMap: Record<string, string> = {
      'hierarchical': 'enterprise',
      'mesh': 'microservices',
      'ring': 'web',
      'star': 'api'
    };

    return topologyMap[topology] || 'web';
  }
}