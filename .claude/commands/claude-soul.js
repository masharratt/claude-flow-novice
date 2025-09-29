#!/usr/bin/env node

/**
 * CLAUDE-SOUL.md Slash Command
 *
 * Interactive questionnaire to create a project soul document.
 * Guides users through defining their project's who, what, when, where, why
 * to provide context for AI agents when they hit roadblocks.
 * Document size: 250-500 words focusing on project essence and decision context.
 */

// Import from the main implementation
import { executeClaudeSoulCommand } from '../../src/slash-commands/claude-soul.js';

// Parse arguments
const args = {
  preview: process.argv.includes('--preview'),
  force: process.argv.includes('--force'),
  backup: !process.argv.includes('--no-backup'),
  interactive: !process.argv.includes('--no-interactive'),
  help: process.argv.includes('--help') || process.argv.includes('-h')
};

// Execute the command
executeClaudeSoulCommand(args).catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});