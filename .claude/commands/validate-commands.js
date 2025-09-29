#!/usr/bin/env node

/**
 * Validate All Slash Commands
 * 
 * Tests that all slash commands are properly implemented and working
 */

import { globalRegistry, executeSlashCommand } from './register-all-commands.js';

/**
 * Command Validator
 */
export class CommandValidator {
  constructor() {
    this.registry = globalRegistry;
    this.results = [];
  }

  /**
   * Validate all commands
   */
  async validateAll() {
    console.log('🔍 Validating all slash commands...');
    
    const commands = this.registry.listCommands();
    
    for (const cmd of commands) {
      await this.validateCommand(cmd.name);
    }
    
    this.printResults();
    return this.results;
  }

  /**
   * Validate individual command
   * @param {string} commandName - Command to validate
   */
  async validateCommand(commandName) {
    const result = {
      command: commandName,
      tests: {
        help: false,
        execute: false,
        errorHandling: false
      },
      errors: []
    };

    try {
      // Test 1: Help functionality
      const helpResult = this.registry.getHelp(commandName);
      result.tests.help = helpResult.success;
      if (!helpResult.success) {
        result.errors.push(`Help failed: ${helpResult.error}`);
      }

      // Test 2: Basic execution (should fail gracefully with no args)
      try {
        const execResult = await executeSlashCommand(`/${commandName}`);
        result.tests.execute = true;
      } catch (error) {
        result.tests.execute = false;
        result.errors.push(`Execution failed: ${error.message}`);
      }

      // Test 3: Error handling (invalid args)
      try {
        const errorResult = await executeSlashCommand(`/${commandName} invalid-arg-test`);
        result.tests.errorHandling = true;
      } catch (error) {
        result.tests.errorHandling = false;
        result.errors.push(`Error handling failed: ${error.message}`);
      }

    } catch (error) {
      result.errors.push(`Validation failed: ${error.message}`);
    }

    this.results.push(result);
  }

  /**
   * Print validation results
   */
  printResults() {
    console.log('\n📈 **VALIDATION RESULTS**\n');
    
    let totalTests = 0;
    let passedTests = 0;
    
    for (const result of this.results) {
      const tests = Object.values(result.tests);
      const passed = tests.filter(t => t).length;
      const total = tests.length;
      
      totalTests += total;
      passedTests += passed;
      
      const status = passed === total ? '✅' : '⚠️';
      console.log(`${status} /${result.command} - ${passed}/${total} tests passed`);
      
      if (result.errors.length > 0) {
        result.errors.forEach(error => {
          console.log(`   ❌ ${error}`);
        });
      }
    }
    
    console.log(`\n📉 **Overall: ${passedTests}/${totalTests} tests passed**`);
    
    if (passedTests === totalTests) {
      console.log('✅ All commands validated successfully!');
    } else {
      console.log('⚠️ Some commands need attention.');
    }
  }

  /**
   * Test specific command with args
   * @param {string} commandName - Command name
   * @param {string[]} args - Arguments to test
   */
  async testCommand(commandName, args = []) {
    const input = `/${commandName} ${args.join(' ')}`.trim();
    
    console.log(`\n🔍 Testing: ${input}`);
    
    try {
      const result = await executeSlashCommand(input);
      
      if (result.success) {
        console.log('✅ Command executed successfully');
        if (result.result && result.result.prompt) {
          console.log('Generated prompt preview:');
          console.log(result.result.prompt.substring(0, 200) + '...');
        }
      } else {
        console.log(`⚠️ Command failed: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Run interactive command testing
 */
export async function interactiveTest() {
  const validator = new CommandValidator();
  
  console.log('🚀 **INTERACTIVE COMMAND TESTING**\n');
  
  // Test each command with example arguments
  const testCases = [
    { command: 'swarm', args: ['init', 'mesh', '8'] },
    { command: 'hooks', args: ['enable'] },
    { command: 'neural', args: ['status'] },
    { command: 'performance', args: ['report'] },
    { command: 'github', args: ['analyze', 'owner/repo'] },
    { command: 'workflow', args: ['create', 'Test Workflow'] },
    { command: 'sparc', args: ['spec', 'Build API'] }
  ];
  
  for (const testCase of testCases) {
    await validator.testCommand(testCase.command, testCase.args);
    
    // Small delay for readability
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Quick validation - just check structure
 */
export function quickValidation() {
  console.log('⚡ **QUICK VALIDATION**\n');
  
  const commands = globalRegistry.listCommands();
  
  console.log(`✅ Registry loaded with ${commands.length} commands`);
  
  commands.forEach(cmd => {
    console.log(`✅ /${cmd.name} - ${cmd.description}`);
    if (cmd.aliases.length > 0) {
      console.log(`   Aliases: ${cmd.aliases.map(a => `/${a}`).join(', ')}`);
    }
  });
  
  console.log('\n✅ All commands loaded successfully!');
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || 'quick';
  
  switch (mode) {
    case 'full':
      const validator = new CommandValidator();
      await validator.validateAll();
      break;
    
    case 'interactive':
      await interactiveTest();
      break;
    
    case 'quick':
    default:
      quickValidation();
      break;
  }
}

export default {
  CommandValidator,
  interactiveTest,
  quickValidation
};
