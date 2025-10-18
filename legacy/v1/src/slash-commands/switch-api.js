#!/usr/bin/env node

/**
 * Switch API Slash Command
 *
 * Switch between different API providers for agents
 */

export class SwitchApiCommand {
  constructor() {
    this.name = 'switch-api';
    this.description = 'Switch between different API providers for agents';
    this.usage = '/switch-api <provider> [--global] [--confirm]';
  }

  /**
   * Execute the switch API command
   * @param {Array<string>} args - Command arguments
   * @param {Object} context - Execution context
   */
  async execute(args, context = {}) {
    if (args.length === 0) {
      return {
        success: false,
        error: 'Provider required. Available: claude, zai, openai, local',
        availableProviders: ['claude', 'zai', 'openai', 'local']
      };
    }

    const provider = args[0];
    const options = this.parseArgs(args.slice(1));

    try {
      // Validate provider
      const validProviders = ['claude', 'zai', 'openai', 'local'];
      if (!validProviders.includes(provider.toLowerCase())) {
        return {
          success: false,
          error: `Invalid provider: ${provider}. Available: ${validProviders.join(', ')}`,
          availableProviders: validProviders
        };
      }

      // Check provider availability
      const availability = await this.checkProviderAvailability(provider);
      if (!availability.available) {
        return {
          success: false,
          error: `Provider ${provider} is not available: ${availability.reason}`,
          suggestion: availability.suggestion
        };
      }

      // Get current configuration
      const currentConfig = await this.getCurrentConfig();

      // Confirm switch if not forced
      if (!options.confirm && !options.global) {
        return {
          success: false,
          error: 'Confirmation required. Use --confirm to switch or --global for system-wide change.',
          currentProvider: currentConfig.provider,
          requestedProvider: provider,
          confirmationRequired: true
        };
      }

      // Switch the API provider
      const result = await this.switchProvider(provider, options, currentConfig);

      return {
        success: true,
        previousProvider: currentConfig.provider,
        newProvider: provider,
        scope: options.global ? 'global' : 'session',
        config: result.config,
        message: `Switched to ${provider} API provider (${options.global ? 'globally' : 'for current session'})`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to switch API provider: ${error.message}`,
        provider: provider
      };
    }
  }

  /**
   * Parse command arguments
   * @param {Array<string>} args - Command arguments
   */
  parseArgs(args) {
    const options = {
      global: false,
      confirm: false
    };

    for (const arg of args) {
      if (arg === '--global') {
        options.global = true;
      } else if (arg === '--confirm') {
        options.confirm = true;
      }
    }

    return options;
  }

  /**
   * Check if a provider is available
   * @param {string} provider - Provider name
   */
  async checkProviderAvailability(provider) {
    const availability = { available: false, reason: '', suggestion: '' };

    switch (provider.toLowerCase()) {
      case 'claude':
        // Check Claude API availability
        if (process.env.ANTHROPIC_API_KEY) {
          availability.available = true;
        } else {
          availability.reason = 'ANTHROPIC_API_KEY not found';
          availability.suggestion = 'Set ANTHROPIC_API_KEY environment variable';
        }
        break;

      case 'zai':
        // Check Z.ai API availability
        if (process.env.ZAI_API_KEY) {
          availability.available = true;
        } else {
          availability.reason = 'ZAI_API_KEY not found';
          availability.suggestion = 'Set ZAI_API_KEY environment variable';
        }
        break;

      case 'openai':
        // Check OpenAI API availability
        if (process.env.OPENAI_API_KEY) {
          availability.available = true;
        } else {
          availability.reason = 'OPENAI_API_KEY not found';
          availability.suggestion = 'Set OPENAI_API_KEY environment variable';
        }
        break;

      case 'local':
        // Check local model availability
        try {
          const { spawn } = await import('child_process');
          const result = await new Promise((resolve) => {
            const child = spawn('python3', ['--version'], { stdio: 'pipe' });
            child.on('close', (code) => resolve(code === 0));
            child.on('error', () => resolve(false));
          });

          if (result) {
            availability.available = true;
          } else {
            availability.reason = 'Python3 not found';
            availability.suggestion = 'Install Python3 for local model support';
          }
        } catch {
          availability.reason = 'Cannot check Python availability';
          availability.suggestion = 'Ensure Python3 is installed and accessible';
        }
        break;

      default:
        availability.reason = `Unknown provider: ${provider}`;
        availability.suggestion = 'Use one of: claude, zai, openai, local';
    }

    return availability;
  }

  /**
   * Get current API configuration
   */
  async getCurrentConfig() {
    const fs = await import('fs/promises');
    const path = await import('path');

    const configPaths = [
      './config/api-config.json',
      './.claude-flow/api-config.json',
      process.env.HOME + '/.claude-flow/api-config.json'
    ];

    let config = {
      provider: 'claude',
      global: false,
      session: Date.now()
    };

    for (const configPath of configPaths) {
      try {
        const configContent = await fs.readFile(path.resolve(configPath), 'utf8');
        config = { ...config, ...JSON.parse(configContent) };
        break;
      } catch {
        // Config file doesn't exist, use defaults
      }
    }

    return config;
  }

  /**
   * Switch API provider
   * @param {string} provider - New provider
   * @param {Object} options - Switch options
   * @param {Object} currentConfig - Current configuration
   */
  async switchProvider(provider, options, currentConfig) {
    const fs = await import('fs/promises');
    const path = await import('path');

    const newConfig = {
      ...currentConfig,
      provider: provider.toLowerCase(),
      switchedAt: Date.now(),
      switchedBy: process.env.USER || 'unknown'
    };

    if (options.global) {
      // Write to global config
      const configDir = path.resolve('./config');
      const configPath = path.join(configDir, 'api-config.json');

      try {
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
      } catch (error) {
        throw new Error(`Failed to write global config: ${error.message}`);
      }
    } else {
      // Write to session config
      const sessionConfigPath = path.resolve('./.claude-flow-session.json');

      try {
        await fs.writeFile(sessionConfigPath, JSON.stringify(newConfig, null, 2));
      } catch (error) {
        throw new Error(`Failed to write session config: ${error.message}`);
      }
    }

    // Update environment variables if needed
    await this.updateEnvironmentVariables(provider, newConfig);

    return { config: newConfig };
  }

  /**
   * Update environment variables for the provider
   * @param {string} provider - Provider name
   * @param {Object} config - Configuration object
   */
  async updateEnvironmentVariables(provider, config) {
    // Set session-specific environment variable
    process.env.CLAUDE_FLOW_API_PROVIDER = provider;

    // Provider-specific setup
    switch (provider) {
      case 'claude':
        process.env.CLAUDE_FLOW_API_BASE = 'https://api.anthropic.com';
        break;
      case 'zai':
        process.env.CLAUDE_FLOW_API_BASE = 'https://api.z.ai';
        break;
      case 'openai':
        process.env.CLAUDE_FLOW_API_BASE = 'https://api.openai.com';
        break;
      case 'local':
        process.env.CLAUDE_FLOW_API_BASE = 'http://localhost:8000';
        break;
    }

    // Store config path for other processes
    process.env.CLAUDE_FLOW_CONFIG_PATH = options.global ?
      './config/api-config.json' : './.claude-flow-session.json';
  }

  /**
   * Get provider information
   * @param {string} provider - Provider name
   */
  getProviderInfo(provider) {
    const providers = {
      claude: {
        name: 'Claude (Anthropic)',
        description: 'Official Claude API with high-quality responses',
        cost: '~$3-15 per 1M tokens',
        features: ['High quality', 'Fast response', 'Reliable'],
        limits: 'Rate limited, requires API key'
      },
      zai: {
        name: 'Z.ai',
        description: 'Cost-effective alternative API provider',
        cost: '~$0.50-2 per 1M tokens',
        features: ['Cost effective', 'Good quality', 'Reliable'],
        limits: 'Some advanced features may be limited'
      },
      openai: {
        name: 'OpenAI',
        description: 'GPT models from OpenAI',
        cost: '~$2-10 per 1M tokens',
        features: ['GPT-4 support', 'Wide adoption', 'Good tools'],
        limits: 'Rate limited, requires API key'
      },
      local: {
        name: 'Local Models',
        description: 'Run models locally on your machine',
        cost: 'Free (hardware cost only)',
        features: ['No API limits', 'Privacy', 'Custom models'],
        limits: 'Requires powerful hardware, slower response'
      }
    };

    return providers[provider] || {
      name: provider,
      description: 'Unknown provider',
      cost: 'Unknown',
      features: [],
      limits: 'Unknown'
    };
  }

  /**
   * Get help information
   */
  getHelp() {
    return {
      name: this.name,
      description: this.description,
      usage: this.usage,
      examples: [
        '/switch-api claude --confirm',
        '/switch-api zai --global',
        '/switch-api local --confirm',
        '/switch-api openai --global --confirm'
      ],
      providers: [
        {
          name: 'claude',
          description: 'Official Claude API (Anthropic)',
          cost: '~$3-15 per 1M tokens',
          env: 'ANTHROPIC_API_KEY'
        },
        {
          name: 'zai',
          description: 'Cost-effective alternative provider',
          cost: '~$0.50-2 per 1M tokens',
          env: 'ZAI_API_KEY'
        },
        {
          name: 'openai',
          description: 'OpenAI GPT models',
          cost: '~$2-10 per 1M tokens',
          env: 'OPENAI_API_KEY'
        },
        {
          name: 'local',
          description: 'Run models locally',
          cost: 'Free (hardware cost only)',
          env: 'None (requires Python3)'
        }
      ],
      options: [
        {
          name: 'provider',
          description: 'API provider to switch to (claude, zai, openai, local)'
        },
        {
          name: '--global',
          description: 'Make the change system-wide (persistent)'
        },
        {
          name: '--confirm',
          description: 'Confirm the switch without additional prompts'
        }
      ],
      notes: [
        'Use --global for persistent changes across sessions',
        'Session changes only affect current command session',
        'Provider availability depends on installed dependencies and API keys',
        'Local models require Python3 and sufficient hardware resources'
      ]
    };
  }
}

export default SwitchApiCommand;