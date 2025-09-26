// personalization-integration.js - Integration layer for personalization system
import { PersonalizationHelp } from './help/personalization-help.js';
import { personalizationCommand } from './personalization-cli.js';

/**
 * Integration utilities for the personalization system
 */
export class PersonalizationIntegration {
  /**
   * Initialize personalization system integration
   */
  static async initialize() {
    try {
      // Ensure all personalization modules are available
      const modules = [
        () => import('../personalization/preference-manager.js'),
        () => import('../personalization/resource-delegation.js'),
        () => import('../personalization/content-filter.js'),
        () => import('../personalization/workflow-optimizer.js'),
        () => import('../personalization/analytics-engine.js'),
      ];

      // Load modules with graceful fallback
      const loadedModules = await Promise.allSettled(modules.map((loader) => loader()));

      const failedModules = loadedModules
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => result.status === 'rejected')
        .map(({ index }) => index);

      if (failedModules.length > 0) {
        console.warn('⚠️  Some personalization modules failed to load:', failedModules);
        console.warn('   Personalization features may be limited');
        return { success: false, failedModules };
      }

      return { success: true, failedModules: [] };
    } catch (error) {
      console.warn('⚠️  Personalization system initialization failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if personalization system is available
   */
  static async isAvailable() {
    try {
      await import('../personalization/preference-manager.js');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get personalization command handler with fallback
   */
  static async getCommandHandler() {
    const isAvailable = await this.isAvailable();

    if (!isAvailable) {
      return this.getFallbackHandler();
    }

    return personalizationCommand;
  }

  /**
   * Fallback handler when personalization modules are not available
   */
  static getFallbackHandler() {
    return async (args, flags) => {
      const subcommand = args[0] || 'help';

      console.log('⚠️  Personalization system is not fully available.');
      console.log('   Some modules may be missing or failed to load.\n');

      if (subcommand === 'help' || subcommand === '--help' || flags.help) {
        console.log('📚 Personalization System Overview:');
        console.log('   The personalization system provides AI-powered workflow optimization');
        console.log('   and intelligent agent coordination based on your usage patterns.\n');

        console.log('🛠️  To enable full personalization features:');
        console.log('   1. Ensure all dependencies are installed: npm install');
        console.log('   2. Check that personalization modules are present in src/personalization/');
        console.log('   3. Verify Node.js version compatibility (>=18.0.0)');
        console.log('   4. Try rebuilding: npm run build\n');

        console.log('📖 Available commands (limited mode):');
        console.log('   help     - Show this help message');
        console.log('   status   - Check system availability');
        return;
      }

      if (subcommand === 'status') {
        console.log('📊 Personalization System Status: ❌ Unavailable');
        console.log('   Core personalization modules are not loaded.');
        console.log('   Please check installation and dependencies.\n');

        // Try to provide some diagnostic information
        const moduleChecks = [
          'preference-manager.js',
          'resource-delegation.js',
          'content-filter.js',
          'workflow-optimizer.js',
          'analytics-engine.js',
        ];

        console.log('🔍 Module availability check:');
        for (const module of moduleChecks) {
          try {
            await import(`../personalization/${module}`);
            console.log(`   ✅ ${module}`);
          } catch {
            console.log(`   ❌ ${module} (missing or failed to load)`);
          }
        }
        return;
      }

      console.log(`❌ Command '${subcommand}' is not available in limited mode.`);
      console.log('   Please resolve personalization system issues and try again.');
      console.log('   Run "claude-flow-novice personalize help" for more information.');
    };
  }

  /**
   * Enhanced help integration for personalization commands
   */
  static showHelp(command = null) {
    if (command) {
      return PersonalizationHelp.showCommandSpecificHelp(command);
    } else {
      return PersonalizationHelp.showMainHelp();
    }
  }

  /**
   * Validate command and provide suggestions
   */
  static validateCommand(args, flags) {
    const validCommands = [
      'setup',
      'status',
      'optimize',
      'analytics',
      'resource',
      'preferences',
      'content',
      'workflow',
      'dashboard',
      'export',
      'import',
      'reset',
      'help',
    ];

    const subcommand = args[0];

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || flags.help) {
      return { valid: true, command: 'help' };
    }

    if (!validCommands.includes(subcommand)) {
      // Suggest similar commands
      const suggestions = this.findSimilarCommands(subcommand, validCommands);
      return {
        valid: false,
        command: subcommand,
        suggestions: suggestions.slice(0, 3),
      };
    }

    return { valid: true, command: subcommand };
  }

  /**
   * Find similar commands for typo correction
   */
  static findSimilarCommands(input, validCommands) {
    const calculateDistance = (a, b) => {
      const matrix = Array(a.length + 1)
        .fill(null)
        .map(() => Array(b.length + 1).fill(null));

      for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
      for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + cost,
          );
        }
      }

      return matrix[a.length][b.length];
    };

    return validCommands
      .map((cmd) => ({ cmd, distance: calculateDistance(input.toLowerCase(), cmd.toLowerCase()) }))
      .filter(({ distance }) => distance <= 3)
      .sort((a, b) => a.distance - b.distance)
      .map(({ cmd }) => cmd);
  }

  /**
   * Middleware for command execution with error handling
   */
  static async executeWithErrorHandling(handler, args, flags) {
    try {
      const validation = this.validateCommand(args, flags);

      if (!validation.valid) {
        console.log(`❌ Unknown personalization command: '${validation.command}'`);
        if (validation.suggestions.length > 0) {
          console.log(`💡 Did you mean: ${validation.suggestions.join(', ')}?`);
        }
        console.log('Run "claude-flow-novice personalize help" for available commands.');
        return;
      }

      await handler(args, flags);
    } catch (error) {
      console.error('❌ Personalization command failed:', error.message);

      if (flags.verbose || flags.debug) {
        console.error('\n🔍 Debug information:');
        console.error(error.stack);
      } else {
        console.log('💡 Run with --verbose flag for detailed error information');
      }

      // Provide recovery suggestions
      console.log('\n🛠️  Troubleshooting suggestions:');
      console.log('   • Check that all dependencies are installed: npm install');
      console.log('   • Verify personalization modules are present and accessible');
      console.log('   • Try running: claude-flow-novice personalize status');
      console.log(
        '   • Reset personalization settings: claude-flow-novice personalize reset --force',
      );

      throw error;
    }
  }

  /**
   * Register personalization command with enhanced integration
   */
  static registerCommand(registry) {
    const enhancedHandler = async (args, flags) => {
      const handler = await this.getCommandHandler();
      return this.executeWithErrorHandling(handler, args, flags);
    };

    registry.set('personalize', {
      handler: enhancedHandler,
      description: '🎯 Unified personalization system with AI-powered workflow optimization',
      usage: 'personalize <subcommand> [options]',
      examples: [
        'personalize setup                             # Run comprehensive setup wizard',
        'personalize status                            # Show personalization status',
        'personalize optimize                          # Get optimization suggestions',
        'personalize analytics                         # Show usage analytics and insights',
        'personalize resource assign coder             # Resource delegation commands',
        'personalize dashboard                         # Open interactive dashboard',
        'personalize export settings.json              # Export personalization data',
      ],
      customHelp: true,
      integration: {
        fallbackAvailable: true,
        requiresModules: [
          'preference-manager',
          'resource-delegation',
          'content-filter',
          'workflow-optimizer',
          'analytics-engine',
        ],
      },
    });

    return enhancedHandler;
  }

  /**
   * Provide contextual tips based on system state
   */
  static async provideContextualTips() {
    try {
      const isAvailable = await this.isAvailable();

      if (!isAvailable) {
        console.log('\n💡 Personalization Tips:');
        console.log(
          '   • Install personalization modules to unlock AI-powered workflow optimization',
        );
        console.log('   • Run "npm install" to ensure all dependencies are available');
        console.log('   • Check the documentation for setup instructions');
        return;
      }

      // If available, check for setup status
      try {
        const { PreferenceManager } = await import('../personalization/preference-manager.js');
        const pm = new PreferenceManager();
        await pm.initialize();

        const prefs = await pm.getPreferences();

        if (!prefs.personalization?.setupCompleted) {
          console.log('\n💡 Get Started:');
          console.log(
            '   • Run "claude-flow-novice personalize setup" to configure your personalized workflow',
          );
          console.log('   • Enable AI-powered optimization and intelligent agent coordination');
        }
      } catch {
        // Ignore errors when trying to provide tips
      }
    } catch {
      // Ignore errors in tip provision
    }
  }
}

/**
 * Main integration function for command registry
 */
export function integratePersonalizationSystem(registry) {
  return PersonalizationIntegration.registerCommand(registry);
}

/**
 * Helper function for backward compatibility
 */
export async function handlePersonalizationCommand(args, flags) {
  const integration = new PersonalizationIntegration();
  const handler = await integration.getCommandHandler();
  return integration.executeWithErrorHandling(handler, args, flags);
}

export default PersonalizationIntegration;
