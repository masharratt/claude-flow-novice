#!/usr/bin/env node

/**
 * Quick-Start Interactive Wizard
 *
 * Streamlined setup wizard with smart defaults and minimal prompts
 * Target: <5 minutes setup time including Redis installation
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import QuickInstaller from './quick-install.js';

class QuickStartWizard {
  constructor(options = {}) {
    this.skipIntro = options.skipIntro || false;
    this.autoAccept = options.autoAccept || false;
    this.verbose = options.verbose || false;
  }

  async run() {
    if (!this.skipIntro) {
      this.displayIntro();
    }

    try {
      // Step 1: Minimal configuration questions (auto-defaults)
      const config = await this.collectConfiguration();

      // Step 2: Confirmation (optional with auto-accept)
      if (!this.autoAccept) {
        const confirmed = await this.confirmInstallation(config);
        if (!confirmed) {
          console.log(chalk.yellow('\n👋 Installation cancelled. Run again when ready.\n'));
          return false;
        }
      }

      // Step 3: Execute quick installation
      const installer = new QuickInstaller({
        quickStart: true,
        skipRedis: config.skipRedis,
        verbose: this.verbose
      });

      console.log(chalk.cyan('\n⚡ Starting quick installation...\n'));
      const success = await installer.install();

      if (success) {
        this.displaySuccessMessage(config);
      } else {
        this.displayFailureMessage();
      }

      return success;
    } catch (error) {
      console.error(chalk.red(`\n❌ Wizard error: ${error.message}`));
      if (this.verbose) {
        console.error(chalk.gray(`\nStack trace:\n${error.stack}`));
      }
      return false;
    }
  }

  displayIntro() {
    console.clear();
    console.log(chalk.blue.bold('\n⚡ Claude Flow Novice - Quick Start Wizard\n'));
    console.log(chalk.gray('Setup your AI agent orchestration environment in under 5 minutes\n'));
    console.log(chalk.cyan('This wizard will:'));
    console.log(chalk.gray('  1. Check dependencies (Node.js, npm)'));
    console.log(chalk.gray('  2. Install Redis automatically (Docker or native)'));
    console.log(chalk.gray('  3. Configure your environment with smart defaults'));
    console.log(chalk.gray('  4. Deploy templates and validate installation\n'));
  }

  async collectConfiguration() {
    console.log(chalk.cyan('🔧 Configuration\n'));

    // Use smart defaults with minimal prompts
    const questions = [
      {
        type: 'confirm',
        name: 'autoInstallRedis',
        message: 'Automatically install Redis?',
        default: true,
        when: () => !this.autoAccept
      },
      {
        type: 'list',
        name: 'redisMethod',
        message: 'Preferred Redis installation method:',
        choices: [
          { name: 'Docker (fastest, recommended)', value: 'docker' },
          { name: 'Native (platform-specific)', value: 'native' },
          { name: 'Skip (I already have Redis)', value: 'skip' }
        ],
        default: 'docker',
        when: (answers) => answers.autoInstallRedis !== false && !this.autoAccept
      },
      {
        type: 'confirm',
        name: 'useDefaults',
        message: 'Use default configuration for all other settings?',
        default: true,
        when: () => !this.autoAccept
      }
    ];

    const answers = await inquirer.prompt(questions);

    // Apply smart defaults
    const config = {
      autoInstallRedis: this.autoAccept ? true : answers.autoInstallRedis !== false,
      redisMethod: this.autoAccept ? 'docker' : (answers.redisMethod || 'docker'),
      skipRedis: this.autoAccept ? false : (answers.redisMethod === 'skip'),
      useDefaults: this.autoAccept ? true : (answers.useDefaults !== false),
      features: {
        swarmOrchestration: true,
        memoryPersistence: true,
        autoSpawn: true
      },
      redis: {
        host: 'localhost',
        port: 6379
      }
    };

    // Advanced configuration (only if not using defaults)
    if (!config.useDefaults && !this.autoAccept) {
      const advanced = await this.collectAdvancedConfiguration();
      Object.assign(config, advanced);
    }

    return config;
  }

  async collectAdvancedConfiguration() {
    console.log(chalk.cyan('\n⚙️  Advanced Configuration\n'));

    const questions = [
      {
        type: 'number',
        name: 'maxAgents',
        message: 'Maximum agents per swarm:',
        default: 10,
        validate: (input) => (input > 0 && input <= 100) || 'Must be between 1 and 100'
      },
      {
        type: 'number',
        name: 'redisPort',
        message: 'Redis port:',
        default: 6379,
        validate: (input) => (input > 1024 && input < 65536) || 'Must be between 1024 and 65535'
      },
      {
        type: 'checkbox',
        name: 'features',
        message: 'Additional features:',
        choices: [
          { name: 'Performance monitoring', value: 'monitoring', checked: false },
          { name: 'Neural learning', value: 'neural', checked: false },
          { name: 'Git integration', value: 'git', checked: true }
        ]
      }
    ];

    const answers = await inquirer.prompt(questions);

    return {
      maxAgents: answers.maxAgents || 10,
      redis: {
        host: 'localhost',
        port: answers.redisPort || 6379
      },
      features: {
        swarmOrchestration: true,
        memoryPersistence: true,
        autoSpawn: true,
        monitoring: answers.features?.includes('monitoring') || false,
        neural: answers.features?.includes('neural') || false,
        git: answers.features?.includes('git') || true
      }
    };
  }

  async confirmInstallation(config) {
    console.log(chalk.cyan('\n📋 Installation Summary:\n'));

    console.log(chalk.gray('Configuration:'));
    console.log(`  Redis: ${config.skipRedis ? 'Skip (using existing)' : `Auto-install (${config.redisMethod})`}`);
    console.log(`  Max agents: ${config.maxAgents || 10}`);
    console.log(`  Features: Swarm orchestration, Memory persistence, Auto-spawn`);

    if (config.features?.monitoring) {
      console.log(`  Optional: Performance monitoring`);
    }
    if (config.features?.neural) {
      console.log(`  Optional: Neural learning`);
    }

    console.log(chalk.gray('\nEstimated time: 2-5 minutes'));
    console.log();

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Proceed with installation?',
        default: true
      }
    ]);

    return confirmed;
  }

  displaySuccessMessage(config) {
    console.log('\n' + chalk.green.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.green.bold('✅ Installation Complete!'));
    console.log(chalk.green.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    console.log(chalk.cyan('🚀 Quick Start Commands:\n'));
    console.log(chalk.white('  Check status:'));
    console.log(chalk.gray('    $ npx claude-flow-novice status\n'));
    console.log(chalk.white('  Start your first swarm:'));
    console.log(chalk.gray('    $ npx claude-flow-novice swarm "Create a REST API"\n'));
    console.log(chalk.white('  List available agents:'));
    console.log(chalk.gray('    $ npx claude-flow-novice agents list\n'));

    console.log(chalk.cyan('📚 Documentation:\n'));
    console.log(chalk.gray('  • CLAUDE.md - Main configuration file'));
    console.log(chalk.gray('  • .claude/settings.json - System settings'));
    console.log(chalk.gray('  • memory/ - Agent memory storage'));
    console.log(chalk.gray('  • coordination/ - Swarm coordination\n'));

    console.log(chalk.cyan('💡 Next Steps:\n'));
    console.log(chalk.gray('  1. Review CLAUDE.md for detailed instructions'));
    console.log(chalk.gray('  2. Test Redis connection: redis-cli ping'));
    console.log(chalk.gray('  3. Start your first swarm with a simple task\n'));

    if (!config.skipRedis && config.redisMethod === 'docker') {
      console.log(chalk.yellow('⚠️  Redis Running in Docker:\n'));
      console.log(chalk.gray('  • Container name: claude-flow-redis'));
      console.log(chalk.gray('  • Stop: docker stop claude-flow-redis'));
      console.log(chalk.gray('  • Start: docker start claude-flow-redis'));
      console.log(chalk.gray('  • Remove: docker rm claude-flow-redis\n'));
    }
  }

  displayFailureMessage() {
    console.log('\n' + chalk.red.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.red.bold('❌ Installation Failed'));
    console.log(chalk.red.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    console.log(chalk.cyan('🔧 Troubleshooting:\n'));

    console.log(chalk.yellow('Common Issues:\n'));
    console.log(chalk.gray('  1. Node.js version'));
    console.log(chalk.white('     Ensure Node.js v20+ is installed'));
    console.log(chalk.gray('     Check: node --version\n'));

    console.log(chalk.gray('  2. Redis installation'));
    console.log(chalk.white('     Try Docker method: docker run -d -p 6379:6379 redis:alpine'));
    console.log(chalk.gray('     Or install manually for your platform\n'));

    console.log(chalk.gray('  3. Permissions'));
    console.log(chalk.white('     Ensure write permissions in current directory'));
    console.log(chalk.gray('     Try: sudo chown -R $USER:$USER .\n'));

    console.log(chalk.cyan('📞 Get Help:\n'));
    console.log(chalk.gray('  • GitHub Issues: https://github.com/masharratt/claude-flow-novice/issues'));
    console.log(chalk.gray('  • Documentation: https://github.com/masharratt/claude-flow-novice#readme'));
    console.log(chalk.gray('  • Re-run wizard: npx claude-flow-novice init --quick-start\n'));
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    skipIntro: args.includes('--skip-intro'),
    autoAccept: args.includes('--auto-accept') || args.includes('-y'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };

  const wizard = new QuickStartWizard(options);
  wizard.run().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
    process.exit(1);
  });
}

export default QuickStartWizard;
