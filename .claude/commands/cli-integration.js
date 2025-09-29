#!/usr/bin/env node

/**
 * CLI Integration for Slash Commands
 * 
 * Integrates slash commands with the main CLI system
 */

import { globalRegistry, executeSlashCommand } from './register-all-commands.js';
import { SlashCommand } from '../core/slash-command.js';

/**
 * CLI Slash Command Handler
 */
export class CliSlashHandler {
  constructor() {
    this.registry = globalRegistry;
  }

  /**
   * Handle CLI input and execute slash commands
   * @param {string[]} args - CLI arguments
   */
  async handleCliInput(args) {
    if (args.length === 0) {
      this.showHelp();
      return;
    }

    const command = args[0];
    
    // Handle help commands
    if (command === 'help' || command === '--help' || command === '-h') {
      if (args.length > 1) {
        this.showCommandHelp(args[1]);
      } else {
        this.showHelp();
      }
      return;
    }

    // Handle list commands
    if (command === 'list' || command === 'ls') {
      this.listCommands();
      return;
    }

    // Execute slash command
    const slashCommand = `/${command}`;
    const slashArgs = args.slice(1);
    const input = `${slashCommand} ${slashArgs.join(' ')}`.trim();

    try {
      const result = await executeSlashCommand(input);
      
      if (result.success) {
        if (result.result && result.result.prompt) {
          console.log(result.result.prompt);
        } else {
          console.log('✅ Command executed successfully');
          if (result.result) {
            console.log(JSON.stringify(result.result, null, 2));
          }
        }
      } else {
        console.error(`❌ ${result.error}`);
        if (result.suggestions && result.suggestions.length > 0) {
          console.log(`Did you mean: ${result.suggestions.join(', ')}?`);
        }
      }
    } catch (error) {
      console.error(`❌ CLI Error: ${error.message}`);
    }
  }

  /**
   * Show general help
   */
  showHelp() {
    console.log(this.registry.generateHelpText());
  }

  /**
   * Show help for specific command
   * @param {string} commandName - Command name
   */
  showCommandHelp(commandName) {
    const helpResult = this.registry.getHelp(commandName);
    
    if (helpResult.success) {
      const help = helpResult.help;
      console.log(`
🚀 **${help.name.toUpperCase()} COMMAND**
`);
      console.log(`**Description:** ${help.description}`);
      console.log(`**Usage:** ${help.usage}`);
      
      if (help.examples && help.examples.length > 0) {
        console.log(`
**Examples:**`);
        help.examples.forEach(example => {
          console.log(`  ${example}`);
        });
      }
    } else {
      console.error(`❌ ${helpResult.error}`);
    }
  }

  /**
   * List all available commands
   */
  listCommands() {
    const commands = this.registry.listCommands();
    
    console.log('
🚀 **AVAILABLE SLASH COMMANDS**
');
    
    commands.forEach(cmd => {
      console.log(`/${cmd.name} - ${cmd.description}`);
      if (cmd.aliases.length > 0) {
        console.log(`  Aliases: ${cmd.aliases.map(a => `/${a}`).join(', ')}`);
      }
    });
    
    console.log(`
Total: ${commands.length} commands available`);
  }
}

/**
 * Interactive CLI mode
 */
export class InteractiveCliMode {
  constructor() {
    this.handler = new CliSlashHandler();
    this.running = false;
  }

  /**
   * Start interactive mode
   */
  async start() {
    this.running = true;
    
    console.log('🚀 Claude-Flow Interactive Slash Command Mode');
    console.log('Type commands without the leading "/" or "help" for assistance');
    console.log('Type "exit" to quit\n');

    // Note: In a real implementation, you would use readline or similar
    // This is a simplified version for demonstration
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('readable', async () => {
      const chunk = process.stdin.read();
      if (chunk !== null) {
        const input = chunk.trim();
        
        if (input === 'exit' || input === 'quit') {
          this.stop();
          return;
        }
        
        if (input) {
          const args = input.split(' ');
          await this.handler.handleCliInput(args);
        }
        
        if (this.running) {
          process.stdout.write('claude-flow> ');
        }
      }
    });

    process.stdout.write('claude-flow> ');
  }

  /**
   * Stop interactive mode
   */
  stop() {
    this.running = false;
    console.log('\n👋 Goodbye!');
    process.exit(0);
  }
}

/**
 * Main CLI entry point
 * @param {string[]} args - Command line arguments
 */
export async function runCliSlashCommands(args = process.argv.slice(2)) {
  const handler = new CliSlashHandler();
  
  // Check for interactive mode
  if (args.includes('--interactive') || args.includes('-i')) {
    const interactive = new InteractiveCliMode();
    await interactive.start();
    return;
  }
  
  // Handle standard CLI input
  await handler.handleCliInput(args);
}

// Auto-run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCliSlashCommands();
}

export default {
  CliSlashHandler,
  InteractiveCliMode,
  runCliSlashCommands
};
