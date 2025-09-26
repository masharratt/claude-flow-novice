/**
 * CLI Commands Index with Validation Integration
 * Phase 2 Implementation - CLI Wizard Integration
 *
 * Integrates validation commands with main CLI system
 */

import { registerValidationCommands } from './validate.js';

export function setupValidationCommands(program) {
  // Register all validation commands
  registerValidationCommands(program);

  // Add validation examples to main help
  const originalHelp = program.help;
  program.help = function (options) {
    console.log('\n🔧 VALIDATION COMMANDS:');
    console.log(
      '  claude-flow-novice validate setup          Interactive completion validation setup',
    );
    console.log('  claude-flow-novice validate show-config    Display current validation settings');
    console.log(
      '  claude-flow-novice validate test           Test framework detection and configuration',
    );
    console.log('');

    if (originalHelp) {
      originalHelp.call(this, options);
    }
  };

  return program;
}

// Export individual command functions for testing
export { registerValidationCommands } from './validate.js';
export { setupCommand, showConfigCommand, testConfigCommand } from '../completion/cli-wizard.js';
