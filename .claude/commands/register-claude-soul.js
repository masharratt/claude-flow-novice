/**
 * Slash Command Registration for /claude-soul
 *
 * Register the claude-soul.md generation command
 */

import { executeClaudeSoulCommand } from './claude-soul.js';

/**
 * Register the /claude-soul slash command
 */
export function registerClaudeSoulCommand(slashCommandRegistry) {
  slashCommandRegistry.register('claude-soul', {
    description: 'Generate claude-soul.md - project essence and philosophy document',
    usage: '/claude-soul [--preview] [--force] [--no-backup]',
    options: [
      { name: '--preview', description: 'Show what would be generated without writing file' },
      { name: '--force', description: 'Overwrite existing claude-soul.md without confirmation' },
      { name: '--no-backup', description: 'Skip creating backup of existing file' }
    ],
    examples: [
      '/claude-soul',
      '/claude-soul --preview',
      '/claude-soul --force',
      '/claude-soul --no-backup'
    ],
    async execute(args, context) {
      try {
        // Parse slash command arguments
        const options = {
          preview: args.includes('--preview'),
          force: args.includes('--force'),
          backup: !args.includes('--no-backup')
        };

        console.log('🎯 Executing /claude-soul slash command...');

        const result = await executeClaudeSoulCommand(options);

        // Format response for slash command system
        if (result.success) {
          return {
            success: true,
            message: result.message || 'claude-soul.md operation completed successfully',
            data: {
              action: result.action,
              file: result.file,
              length: result.length,
              lineCount: result.lineCount
            }
          };
        } else {
          return {
            success: false,
            error: result.error || 'claude-soul.md operation failed',
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

  console.log('✅ /claude-soul slash command registered');
}

/**
 * Auto-registration if this module is imported
 */
export default function autoRegister(registry) {
  if (registry) {
    registerClaudeSoulCommand(registry);
  }
}