/**
 * Slash Command Registration for /claude-md
 *
 * Simple registration that integrates with existing slash command system
 */

import { executeClaudeMdCommand } from './claude-md.js';

/**
 * Register the /claude-md slash command
 */
export function registerClaudeMdCommand(slashCommandRegistry) {
  slashCommandRegistry.register('claude-md', {
    description: 'Generate or update CLAUDE.md file for current project',
    usage: '/claude-md [--preview] [--force] [--no-backup] [--detect]',
    options: [
      { name: '--preview', description: 'Show what would be generated without writing file' },
      { name: '--force', description: 'Overwrite existing CLAUDE.md without confirmation' },
      { name: '--no-backup', description: 'Skip creating backup of existing file' },
      { name: '--detect', description: 'Auto-detect project type and show recommendations' }
    ],
    examples: [
      '/claude-md',
      '/claude-md --preview',
      '/claude-md --force',
      '/claude-md --detect'
    ],
    async execute(args, context) {
      try {
        // Parse slash command arguments
        const options = {
          preview: args.includes('--preview'),
          force: args.includes('--force'),
          backup: !args.includes('--no-backup'),
          detect: args.includes('--detect'),
          isNpxInstall: false // Slash commands are manual, not NPX
        };

        console.log('🎯 Executing /claude-md slash command...');

        const result = await executeClaudeMdCommand(options);

        // Format response for slash command system
        if (result.success) {
          return {
            success: true,
            message: result.message || 'CLAUDE.md operation completed successfully',
            data: {
              action: result.action,
              file: result.file,
              length: result.length
            }
          };
        } else {
          return {
            success: false,
            error: result.error || 'CLAUDE.md operation failed',
            action: result.action
          };
        }

      } catch (error) {
        console.error('❌ Slash command execution failed:', error.message);
        return {
          success: false,
          error: `Slash command failed: ${error.message}`
        };
      }
    }
  });

  console.log('✅ /claude-md slash command registered');
}

/**
 * Auto-registration if this module is imported
 */
export default function autoRegister(registry) {
  if (registry) {
    registerClaudeMdCommand(registry);
  }
}