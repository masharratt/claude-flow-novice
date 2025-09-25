/**
 * Validation CLI Commands
 * Phase 2 Implementation - CLI Wizard Integration
 *
 * Provides CLI commands for completion validation setup and testing
 */

import { setupCommand, showConfigCommand, testConfigCommand } from '../../completion/cli-wizard.js';
import chalk from 'chalk';

export function registerValidationCommands(program) {
  const validateCommand = program
    .command('validate')
    .description('Completion validation framework commands');

  // Setup command
  validateCommand
    .command('setup')
    .description('Interactive setup wizard for completion validation')
    .option('-v, --verbose', 'Enable verbose output')
    .option('--reset', 'Reset to default configuration')
    .action(async (options) => {
      try {
        console.log(chalk.blue('🔧 Starting Completion Validation Setup...\n'));

        const result = await setupCommand(options);

        if (result.success) {
          console.log(chalk.green('\n🎉 Setup completed successfully!'));
          console.log(chalk.gray('You can now use completion validation in your project.'));
          console.log(chalk.gray('\nNext steps:'));
          console.log(chalk.gray('  • claude-flow-novice validate test    # Test your configuration'));
          console.log(chalk.gray('  • claude-flow-novice validate show-config   # View current settings'));
        } else {
          console.error(chalk.red(`\n❌ Setup failed: ${result.error}`));
          process.exit(1);
        }

      } catch (error) {
        console.error(chalk.red(`\n❌ Setup error: ${error.message}`));
        if (options.verbose) {
          console.error(chalk.gray(error.stack));
        }
        process.exit(1);
      }
    });

  // Show configuration command
  validateCommand
    .command('show-config')
    .description('Display current validation configuration')
    .option('-v, --verbose', 'Enable verbose output')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        await showConfigCommand(options);
      } catch (error) {
        console.error(chalk.red(`\n❌ Configuration error: ${error.message}`));
        if (options.verbose) {
          console.error(chalk.gray(error.stack));
        }
        process.exit(1);
      }
    });

  // Test configuration command
  validateCommand
    .command('test')
    .description('Test validation configuration and framework detection')
    .option('-v, --verbose', 'Enable verbose output')
    .option('--fix', 'Attempt to fix detected issues')
    .action(async (options) => {
      try {
        await testConfigCommand(options);
      } catch (error) {
        console.error(chalk.red(`\n❌ Test error: ${error.message}`));
        if (options.verbose) {
          console.error(chalk.gray(error.stack));
        }
        process.exit(1);
      }
    });

  // Help for validate commands
  validateCommand
    .command('help')
    .description('Show validation commands help')
    .action(() => {
      console.log(chalk.blue.bold('📚 Completion Validation Framework Commands\n'));

      console.log(chalk.yellow('SETUP:'));
      console.log('  claude-flow-novice validate setup          Interactive configuration wizard');
      console.log('  claude-flow-novice validate setup --reset  Reset to default configuration');
      console.log('');

      console.log(chalk.yellow('CONFIGURATION:'));
      console.log('  claude-flow-novice validate show-config    Display current settings');
      console.log('  claude-flow-novice validate show-config --json  Output as JSON');
      console.log('');

      console.log(chalk.yellow('TESTING:'));
      console.log('  claude-flow-novice validate test           Test current configuration');
      console.log('  claude-flow-novice validate test --fix     Attempt to fix issues');
      console.log('');

      console.log(chalk.yellow('EXAMPLES:'));
      console.log(chalk.gray('  # First-time setup'));
      console.log(chalk.gray('  claude-flow-novice validate setup'));
      console.log('');
      console.log(chalk.gray('  # Check your configuration'));
      console.log(chalk.gray('  claude-flow-novice validate show-config'));
      console.log('');
      console.log(chalk.gray('  # Test framework detection'));
      console.log(chalk.gray('  claude-flow-novice validate test'));
      console.log('');

      console.log(chalk.yellow('FRAMEWORK SUPPORT:'));
      console.log('  • JavaScript/Node.js    (Jest, Mocha)');
      console.log('  • TypeScript           (Jest, with types)');
      console.log('  • Python               (pytest, unittest)');
      console.log('  • TDD Methodology      (95% truth score)');
      console.log('  • BDD Methodology      (Gherkin scenarios)');
      console.log('  • SPARC Methodology    (Phase completion)');
      console.log('');

      console.log(chalk.yellow('QUALITY GATES:'));
      console.log('  • Truth Score          Framework-specific thresholds');
      console.log('  • Test Coverage        90-98% depending on framework');
      console.log('  • Code Quality         Static analysis scores');
      console.log('  • Documentation        API documentation coverage');
      console.log('');

      console.log(chalk.green('💡 TIP: Run setup wizard first for guided configuration'));
    });

  return validateCommand;
}

// Export for programmatic use
export { setupCommand, showConfigCommand, testConfigCommand };