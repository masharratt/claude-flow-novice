/**
 * Validation Commands TypeScript Integration
 * Phase 2 Implementation - TypeScript CLI Integration
 *
 * Integrates JavaScript validation commands with TypeScript CLI system
 */

import type { CLI, CommandContext } from '../cli-core.js';

export function setupValidationCommands(cli: CLI): void {
  cli.command({
    name: 'validate',
    description: 'Completion validation framework commands',
    subcommands: [
      {
        name: 'setup',
        description: 'Interactive setup wizard for completion validation',
        options: [
          {
            name: 'verbose',
            short: 'v',
            description: 'Enable verbose output',
            type: 'boolean',
          },
          {
            name: 'reset',
            description: 'Reset to default configuration',
            type: 'boolean',
          },
        ],
        action: async (ctx: CommandContext) => {
          try {
            const { setupCommand } = await import('../../completion/cli-wizard.js');

            console.log('🔧 Starting Completion Validation Setup...\n');

            const result = await setupCommand({
              verbose: ctx.flags.verbose as boolean,
              reset: ctx.flags.reset as boolean,
            });

            if (result.success) {
              console.log('🎉 Setup completed successfully!');
              console.log('You can now use completion validation in your project.');
              console.log('\nNext steps:');
              console.log('  • claude-flow-novice validate test    # Test your configuration');
              console.log('  • claude-flow-novice validate show-config   # View current settings');
            } else {
              console.error(`❌ Setup failed: ${result.error}`);
              process.exit(1);
            }
          } catch (error) {
            console.error(
              `❌ Setup error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            if (ctx.flags.verbose) {
              console.error(error);
            }
            process.exit(1);
          }
        },
      },
      {
        name: 'show-config',
        description: 'Display current validation configuration',
        options: [
          {
            name: 'verbose',
            short: 'v',
            description: 'Enable verbose output',
            type: 'boolean',
          },
          {
            name: 'json',
            description: 'Output as JSON',
            type: 'boolean',
          },
        ],
        action: async (ctx: CommandContext) => {
          try {
            const { showConfigCommand } = await import('../../completion/cli-wizard.js');

            await showConfigCommand({
              verbose: ctx.flags.verbose as boolean,
              json: ctx.flags.json as boolean,
            });
          } catch (error) {
            console.error(
              `❌ Configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            if (ctx.flags.verbose) {
              console.error(error);
            }
            process.exit(1);
          }
        },
      },
      {
        name: 'test',
        description: 'Test validation configuration and framework detection',
        options: [
          {
            name: 'verbose',
            short: 'v',
            description: 'Enable verbose output',
            type: 'boolean',
          },
          {
            name: 'fix',
            description: 'Attempt to fix detected issues',
            type: 'boolean',
          },
        ],
        action: async (ctx: CommandContext) => {
          try {
            const { testConfigCommand } = await import('../../completion/cli-wizard.js');

            await testConfigCommand({
              verbose: ctx.flags.verbose as boolean,
              fix: ctx.flags.fix as boolean,
            });
          } catch (error) {
            console.error(
              `❌ Test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            if (ctx.flags.verbose) {
              console.error(error);
            }
            process.exit(1);
          }
        },
      },
    ],
  });
}
