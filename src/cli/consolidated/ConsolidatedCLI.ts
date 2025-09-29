/**
 * ConsolidatedCLI - Main entry point for the consolidated command system
 * Orchestrates the 3-tier progressive CLI with intelligent agent selection
 */

import { TierManager, UserTier } from './core/TierManager.js';
import { IntelligenceEngine } from './intelligence/IntelligenceEngine.js';
import { CommandHandlers } from './core/CommandHandlers.js';
import { CommandRouter } from './routing/CommandRouter.js';
import { PerformanceOptimizer } from './utils/PerformanceOptimizer.js';

export interface CLIConfig {
  enablePerformanceOptimization: boolean;
  enableProgressiveDisclosure: boolean;
  enableNaturalLanguage: boolean;
  enableBackwardCompatibility: boolean;
  debugMode: boolean;
  maxResponseTime: number;
}

export interface CLIResult {
  success: boolean;
  message: string;
  data?: any;
  suggestions?: string[];
  nextSteps?: string[];
  metrics?: any;
}

export class ConsolidatedCLI {
  private tierManager: TierManager;
  private intelligenceEngine: IntelligenceEngine;
  private commandHandlers: CommandHandlers;
  private router: CommandRouter;
  private performanceOptimizer: PerformanceOptimizer;
  private config: CLIConfig;

  constructor(config: Partial<CLIConfig> = {}) {
    this.config = {
      enablePerformanceOptimization: true,
      enableProgressiveDisclosure: true,
      enableNaturalLanguage: true,
      enableBackwardCompatibility: true,
      debugMode: false,
      maxResponseTime: 2000, // 2 seconds
      ...config,
    };

    this.initialize();
  }

  /**
   * Initialize the consolidated CLI system
   */
  private initialize(): void {
    console.log('🚀 Initializing Claude Flow Consolidated CLI...');

    // Initialize core components
    this.tierManager = new TierManager();
    this.intelligenceEngine = new IntelligenceEngine(this.tierManager);
    this.commandHandlers = new CommandHandlers(this.tierManager, this.intelligenceEngine);

    // Initialize routing system
    this.router = new CommandRouter(
      this.tierManager,
      this.intelligenceEngine,
      this.commandHandlers,
      {
        enableBackwardCompatibility: this.config.enableBackwardCompatibility,
        showDeprecationWarnings: true,
        autoUpgradeCommands: true,
        legacyMode: false,
      },
    );

    // Initialize performance optimizer
    if (this.config.enablePerformanceOptimization) {
      this.performanceOptimizer = new PerformanceOptimizer();
      this.performanceOptimizer.startPerformanceMonitoring();
    }

    this.displayWelcomeMessage();
  }

  /**
   * Execute a command with full optimization and routing
   */
  async execute(command: string, args: string[] = [], options: any = {}): Promise<CLIResult> {
    const startTime = performance.now();

    try {
      // Optimize execution if enabled
      if (this.config.enablePerformanceOptimization) {
        return await this.performanceOptimizer.optimizeExecution(
          `${command}-${JSON.stringify({ args, options })}`,
          async () => await this.executeInternal(command, args, options),
          { cacheable: this.isCacheable(command) },
        );
      } else {
        return await this.executeInternal(command, args, options);
      }
    } catch (error) {
      return this.handleExecutionError(error, command, args);
    } finally {
      const executionTime = performance.now() - startTime;
      if (executionTime > this.config.maxResponseTime) {
        console.warn(
          `⚠️ Command took ${Math.round(executionTime)}ms (target: ${this.config.maxResponseTime}ms)`,
        );
      }
    }
  }

  /**
   * Internal command execution logic
   */
  private async executeInternal(command: string, args: string[], options: any): Promise<CLIResult> {
    // Handle special cases first
    if (this.isVersionCommand(command)) {
      return this.handleVersion();
    }

    if (this.isNaturalLanguageInput(command, args)) {
      return await this.handleNaturalLanguage(command, args, options);
    }

    // Route through the command router
    const result = await this.router.route(command, args, options);

    // Enhance result with additional context
    return this.enhanceResult(result, command, args);
  }

  /**
   * Handle natural language input
   */
  private async handleNaturalLanguage(
    command: string,
    args: string[],
    options: any,
  ): Promise<CLIResult> {
    if (!this.config.enableNaturalLanguage) {
      return {
        success: false,
        message: '❌ Natural language processing is disabled',
        suggestions: ['Use specific commands like: claude-flow-novice help'],
      };
    }

    const fullInput = [command, ...args].join(' ');
    console.log('🧠 Processing natural language input...');

    try {
      const interpretation = await this.router.interpretNaturalLanguage(fullInput);

      if (interpretation.confidence < 0.4) {
        return {
          success: false,
          message: `❌ Could not understand: "${fullInput}"`,
          suggestions: [
            'Try using specific commands: init, build, status, help, learn',
            'Example: claude-flow-novice build "add user authentication"',
            'Use: claude-flow-novice help for available commands',
          ],
        };
      }

      console.log(
        `🎯 Interpreted as: ${interpretation.command} (confidence: ${Math.round(interpretation.confidence * 100)}%)`,
      );

      // Execute the interpreted command
      return await this.router.route(interpretation.command, interpretation.args, options);
    } catch (error) {
      return {
        success: false,
        message: `❌ Natural language processing failed: ${error instanceof Error ? error.message : String(error)}`,
        suggestions: ['Try using specific commands instead'],
      };
    }
  }

  /**
   * Get CLI status and metrics
   */
  getStatus(): {
    tier: UserTier;
    availableCommands: number;
    performance: any;
    system: any;
  } {
    const progress = this.tierManager.getProgressSummary();

    return {
      tier: progress.currentTier,
      availableCommands: progress.availableCommands,
      performance: this.config.enablePerformanceOptimization
        ? this.performanceOptimizer.getMetrics()
        : null,
      system: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
      },
    };
  }

  /**
   * Warm up the system for optimal performance
   */
  async warmUp(): Promise<void> {
    if (this.config.enablePerformanceOptimization) {
      await this.performanceOptimizer.warmUp();
    }

    // Preload intelligence engine context
    await this.intelligenceEngine.detectProjectContext();

    console.log('✅ Claude Flow is ready for optimal performance');
  }

  /**
   * Handle interactive mode
   */
  async startInteractiveMode(): Promise<void> {
    console.log('🎯 Entering Interactive Mode');
    console.log('Type your commands or describe what you want to build in natural language.');
    console.log('Type "exit" to quit.\n');

    // This would integrate with readline for actual interactive input
    // For now, just show the interface
    console.log('claude-flow> ');
  }

  /**
   * Display help information
   */
  displayHelp(): void {
    const currentTier = this.tierManager.getCurrentTier();
    const availableCommands = this.router.getAvailableCommands();

    console.log('🎯 Claude Flow - AI-Powered Development CLI\n');
    console.log(
      `Current Tier: ${currentTier.toUpperCase()} (${availableCommands.length} commands available)\n`,
    );

    console.log('🔥 Core Commands (Always Available):');
    console.log('  init     Initialize new project with AI guidance');
    console.log('  build    Build features using natural language');
    console.log('  status   Check project and system status');
    console.log('  help     Get help and learn new commands');
    console.log('  learn    Unlock advanced features and commands');

    if (currentTier !== UserTier.NOVICE) {
      console.log('\n⚡ Advanced Commands (Your Tier):');
      const advancedCommands = availableCommands.filter(
        (cmd) => !['init', 'build', 'status', 'help', 'learn'].includes(cmd.command),
      );

      advancedCommands.forEach((cmd) => {
        console.log(`  ${cmd.command.padEnd(8)} ${cmd.description || 'Advanced command'}`);
      });
    }

    console.log('\n✨ Natural Language Examples:');
    console.log('  claude-flow-novice build "add user authentication"');
    console.log('  claude-flow-novice "create a REST API with JWT"');
    console.log('  claude-flow-novice "setup testing for my React app"');

    console.log('\n🎓 Pro Tips:');
    console.log('  • Use natural language to describe what you want to build');
    console.log('  • The system learns and improves from your usage');
    console.log('  • Unlock new commands by using the system regularly');

    if (currentTier === UserTier.NOVICE) {
      const progress = this.tierManager.getProgressSummary();
      if (progress.nextTierRequirements) {
        console.log(`\n🎯 Next Tier: ${progress.nextTierRequirements}`);
      }
    }
  }

  // Private helper methods

  private displayWelcomeMessage(): void {
    const currentTier = this.tierManager.getCurrentTier();
    const isFirstTime = currentTier === UserTier.NOVICE;

    if (isFirstTime) {
      console.log('\n🎉 Welcome to Claude Flow!');
      console.log('Your AI-powered development companion is ready.');
      console.log('\n🎯 Start with these simple commands:');
      console.log('  • claude-flow-novice init - Create a new project');
      console.log('  • claude-flow-novice build "your idea" - Build anything');
      console.log('  • claude-flow-novice help - Get detailed help');
    } else {
      console.log(`\n👋 Welcome back! You're ${currentTier.toUpperCase()} tier.`);
    }

    if (this.config.debugMode) {
      console.log('\n🐛 Debug mode enabled');
    }
  }

  private isVersionCommand(command: string): boolean {
    return ['version', '--version', '-v'].includes(command.toLowerCase());
  }

  private handleVersion(): CLIResult {
    return {
      success: true,
      message:
        'Claude Flow Consolidated CLI v2.0.0\n' +
        'Progressive 3-tier command system with AI intelligence\n' +
        'Built for novice to expert developers',
      data: {
        version: '2.0.0',
        tier: this.tierManager.getCurrentTier(),
        features: {
          progressiveDisclosure: this.config.enableProgressiveDisclosure,
          naturalLanguage: this.config.enableNaturalLanguage,
          performanceOptimization: this.config.enablePerformanceOptimization,
        },
      },
    };
  }

  private isNaturalLanguageInput(command: string, args: string[]): boolean {
    if (!this.config.enableNaturalLanguage) return false;

    // Check if it's not a known command
    const isKnownCommand = this.router.isCommandAvailable(command);
    if (isKnownCommand) return false;

    // Check for natural language indicators
    const fullInput = [command, ...args].join(' ');
    const naturalLanguageIndicators = [
      'create',
      'build',
      'make',
      'add',
      'implement',
      'setup',
      'configure',
      'with',
      'using',
      'for',
      'that',
      'which',
      'should',
      'would',
      'can',
    ];

    return (
      naturalLanguageIndicators.some((indicator) => fullInput.toLowerCase().includes(indicator)) ||
      fullInput.length > 10
    );
  }

  private enhanceResult(result: CLIResult, command: string, args: string[]): CLIResult {
    const enhanced = { ...result };

    // Add performance metrics if available
    if (this.config.enablePerformanceOptimization) {
      enhanced.metrics = this.performanceOptimizer.getMetrics();
    }

    // Add progressive disclosure hints
    if (this.config.enableProgressiveDisclosure) {
      const progress = this.tierManager.getProgressSummary();
      if (progress.nextTierRequirements && !enhanced.nextSteps) {
        enhanced.nextSteps = enhanced.nextSteps || [];
        enhanced.nextSteps.push(`💡 ${progress.nextTierRequirements}`);
      }
    }

    // Add debugging information
    if (this.config.debugMode) {
      enhanced.data = enhanced.data || {};
      enhanced.data.debug = {
        command,
        args,
        tier: this.tierManager.getCurrentTier(),
        executionTime: enhanced.metrics?.totalResponseTime,
      };
    }

    return enhanced;
  }

  private isCacheable(command: string): boolean {
    // Commands that can be cached for better performance
    const cacheableCommands = ['status', 'help', 'learn'];
    return cacheableCommands.includes(command);
  }

  private handleExecutionError(error: any, command: string, args: string[]): CLIResult {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (this.config.debugMode) {
      console.error('Execution Error:', error);
    }

    return {
      success: false,
      message: `❌ Command execution failed: ${errorMessage}`,
      suggestions: [
        'Check your command syntax',
        'Use `claude-flow-novice help` for available commands',
        'Try `claude-flow-novice status` to check system health',
        'Report persistent issues to the development team',
      ],
    };
  }
}

/**
 * Factory function to create and initialize the CLI
 */
export async function createConsolidatedCLI(config?: Partial<CLIConfig>): Promise<ConsolidatedCLI> {
  const cli = new ConsolidatedCLI(config);
  await cli.warmUp();
  return cli;
}

/**
 * Main CLI entry point for command line usage
 */
export async function main(argv: string[]): Promise<void> {
  const [, , command, ...args] = argv;

  if (!command) {
    const cli = await createConsolidatedCLI();
    cli.displayHelp();
    return;
  }

  try {
    const cli = await createConsolidatedCLI({
      debugMode: args.includes('--debug'),
      enableNaturalLanguage: !args.includes('--no-nl'),
    });

    // Filter out CLI-specific flags
    const cleanArgs = args.filter((arg) => !arg.startsWith('--debug') && !arg.startsWith('--no-'));

    const result = await cli.execute(command, cleanArgs);

    if (result.success) {
      console.log(result.message);

      if (result.nextSteps && result.nextSteps.length > 0) {
        console.log('\n📋 Next Steps:');
        result.nextSteps.forEach((step) => console.log(`   ${step}`));
      }

      if (result.suggestions && result.suggestions.length > 0) {
        console.log('\n💡 Suggestions:');
        result.suggestions.forEach((suggestion) => console.log(`   ${suggestion}`));
      }
    } else {
      console.error(result.message);

      if (result.suggestions && result.suggestions.length > 0) {
        console.log('\n💡 Try these instead:');
        result.suggestions.forEach((suggestion) => console.log(`   ${suggestion}`));
      }

      process.exit(1);
    }
  } catch (error) {
    console.error('❌ CLI initialization failed:', error);
    process.exit(1);
  }
}
