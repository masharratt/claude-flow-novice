/**
 * CLI Wizard Integration
 * Phase 2 Implementation - CLI Command Integration
 *
 * Provides integration between CLI commands and interactive setup wizard
 * Bridges the gap between command-line interface and interactive components
 */

import chalk from 'chalk';
import { InteractiveSetupWizard } from '../validation/cli/interactive-setup-wizard.js';
import { ValidationCommands } from '../validation/cli/validation-commands.js';
import { logger } from '../core/logger.js';

/**
 * Setup command - Interactive setup wizard entry point
 */
export async function setupCommand(options = {}) {
  const startTime = Date.now();

  try {
    if (options.verbose) {
      console.log(chalk.gray('🔧 Initializing interactive setup wizard...'));
    }

    const wizard = new InteractiveSetupWizard({
      basePath: process.cwd(),
      verbose: options.verbose
    });

    let result;

    if (options.reset) {
      console.log(chalk.yellow('🔄 Resetting to default configuration...'));
      // TODO: Implement reset functionality
      result = await wizard.runSetupWizard({ ...options, reset: true });
    } else {
      result = await wizard.runSetupWizard(options);
    }

    await wizard.cleanup();

    const setupTime = (Date.now() - startTime) / 1000;

    if (options.verbose) {
      console.log(chalk.gray(`⏱️  Total setup time: ${setupTime.toFixed(2)} seconds`));

      if (result.success) {
        console.log(chalk.green('✅ Setup wizard completed successfully'));
      } else {
        console.log(chalk.red('❌ Setup wizard encountered errors'));
      }
    }

    return {
      ...result,
      totalTime: setupTime
    };

  } catch (error) {
    logger.error('CLI setup command failed', error);

    console.log(chalk.red(`\n❌ Setup failed: ${error.message}`));

    if (options.verbose) {
      console.log(chalk.gray('\n📋 Troubleshooting:'));
      console.log(chalk.gray('  • Check file permissions in project directory'));
      console.log(chalk.gray('  • Ensure Node.js version is supported (>=14)'));
      console.log(chalk.gray('  • Try running with --reset flag'));
      console.log(chalk.gray('  • Check disk space for configuration files'));
    }

    return {
      success: false,
      error: error.message,
      totalTime: (Date.now() - startTime) / 1000
    };
  }
}

/**
 * Show configuration command
 */
export async function showConfigCommand(options = {}) {
  try {
    const commands = new ValidationCommands({ basePath: process.cwd() });
    return await commands.showConfigCommand(options);

  } catch (error) {
    logger.error('CLI show-config command failed', error);
    throw error;
  }
}

/**
 * Test configuration command
 */
export async function testConfigCommand(options = {}) {
  try {
    if (options.verbose) {
      console.log(chalk.gray('🧪 Starting configuration test...'));
    }

    const commands = new ValidationCommands({ basePath: process.cwd() });
    const result = await commands.checkCommand(options);

    if (options.verbose) {
      if (result.success) {
        console.log(chalk.green('✅ Configuration test passed'));
      } else {
        console.log(chalk.red('❌ Configuration test failed'));

        if (options.fix) {
          console.log(chalk.yellow('🔧 Attempting automatic fixes...'));
        }
      }
    }

    return result;

  } catch (error) {
    logger.error('CLI test command failed', error);
    throw error;
  }
}

/**
 * Enable hooks command
 */
export async function enableHooksCommand(options = {}) {
  try {
    const commands = new ValidationCommands({ basePath: process.cwd() });
    return await commands.enableHooksCommand(options);

  } catch (error) {
    logger.error('CLI enable-hooks command failed', error);
    throw error;
  }
}

/**
 * Disable hooks command
 */
export async function disableHooksCommand(options = {}) {
  try {
    const commands = new ValidationCommands({ basePath: process.cwd() });
    return await commands.disableHooksCommand(options);

  } catch (error) {
    logger.error('CLI disable-hooks command failed', error);
    throw error;
  }
}

/**
 * Add framework command
 */
export async function addFrameworkCommand(options = {}) {
  try {
    const commands = new ValidationCommands({ basePath: process.cwd() });
    return await commands.addFrameworkCommand(options);

  } catch (error) {
    logger.error('CLI add-framework command failed', error);
    throw error;
  }
}

/**
 * Configure gates command
 */
export async function configureGatesCommand(options = {}) {
  try {
    const commands = new ValidationCommands({ basePath: process.cwd() });
    return await commands.configureGatesCommand(options);

  } catch (error) {
    logger.error('CLI configure-gates command failed', error);
    throw error;
  }
}

/**
 * Check command (manual validation)
 */
export async function checkCommand(options = {}) {
  try {
    const commands = new ValidationCommands({ basePath: process.cwd() });
    return await commands.checkCommand(options);

  } catch (error) {
    logger.error('CLI check command failed', error);
    throw error;
  }
}

/**
 * Utility function to display helpful error messages
 */
export function displayErrorHelp(error, command) {
  console.log(chalk.red(`\n❌ Command failed: ${command}`));
  console.log(chalk.gray(`Error: ${error.message}`));

  console.log(chalk.yellow('\n💡 Possible solutions:'));

  switch (command) {
    case 'setup':
      console.log(chalk.gray('  • Run: claude-flow-novice validate setup --reset'));
      console.log(chalk.gray('  • Check file permissions in project directory'));
      console.log(chalk.gray('  • Ensure adequate disk space'));
      break;

    case 'check':
      console.log(chalk.gray('  • Run setup first: claude-flow-novice validate setup'));
      console.log(chalk.gray('  • Check configuration: claude-flow-novice validate show-config'));
      break;

    case 'enable-hooks':
    case 'disable-hooks':
      console.log(chalk.gray('  • Run setup first: claude-flow-novice validate setup'));
      console.log(chalk.gray('  • Check if hooks are already enabled/disabled'));
      break;

    default:
      console.log(chalk.gray('  • Run: claude-flow-novice validate help'));
      console.log(chalk.gray('  • Check the documentation for more details'));
  }

  console.log(chalk.gray('\n📚 For more help: claude-flow-novice validate help'));
}

export default {
  setupCommand,
  showConfigCommand,
  testConfigCommand,
  enableHooksCommand,
  disableHooksCommand,
  addFrameworkCommand,
  configureGatesCommand,
  checkCommand,
  displayErrorHelp
};