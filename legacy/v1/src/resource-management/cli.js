/**
 * Resource Management CLI Commands
 *
 * Provides command-line interface for managing resource delegation preferences
 */

import ResourceCoordinator from './resource-coordinator.js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export class ResourceManagementCLI {
  constructor() {
    this.coordinator = new ResourceCoordinator();
  }

  async initialize() {
    await this.coordinator.initialize();
  }

  async handleCommand(command, args) {
    switch (command) {
      case 'status':
        return await this.showResourceStatus();

      case 'config':
        return await this.manageConfig(args);

      case 'mode':
        return await this.setDelegationMode(args[0]);

      case 'heavy-commands':
        return await this.manageHeavyCommands(args);

      case 'stats':
        return await this.showStats();

      case 'test-delegation':
        return await this.testDelegation(args);

      case 'reset':
        return await this.resetToDefaults();

      case 'optimize':
        return await this.suggestOptimizations();

      default:
        return this.showHelp();
    }
  }

  async showResourceStatus() {
    const stats = this.coordinator.getStats();
    const currentLoad = await this.coordinator.resourceMonitor.getCurrentLoad();

    console.log('🔧 Resource Management Status\n');
    console.log(`Current Mode: ${this.coordinator.preferences.resourceDelegation.mode}`);
    console.log(`Active Commands: ${stats.activeCommands}`);
    console.log(
      `Heavy Command Threshold: ${this.coordinator.preferences.resourceDelegation.heavyCommandThreshold}ms`,
    );
    console.log(
      `Max Concurrent Heavy: ${this.coordinator.preferences.resourceDelegation.maxConcurrentHeavyCommands}\n`,
    );

    console.log('📊 System Load:');
    console.log(`  CPU: ${currentLoad.cpu.toFixed(1)}%`);
    console.log(`  Memory: ${currentLoad.memory.toFixed(1)}%`);
    console.log(`  Network: ${currentLoad.network.toFixed(1)}%\n`);

    console.log('📈 Recent Statistics:');
    console.log(`  Total Commands: ${stats.totalCommands}`);
    console.log(`  Heavy Commands: ${stats.heavyCommands}`);
    console.log(`  Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
    console.log(`  Average Duration: ${stats.averageDuration?.toFixed(0)}ms\n`);

    if (Object.keys(stats.strategiesUsed).length > 0) {
      console.log('🎯 Strategy Usage:');
      Object.entries(stats.strategiesUsed).forEach(([strategy, count]) => {
        console.log(`  ${strategy}: ${count} times`);
      });
    }

    return { success: true, data: stats };
  }

  async manageConfig(args) {
    if (args.length === 0) {
      return await this.showCurrentConfig();
    }

    const [action, ...params] = args;

    switch (action) {
      case 'set':
        return await this.setConfigValue(params);
      case 'get':
        return await this.getConfigValue(params[0]);
      case 'show':
        return await this.showCurrentConfig();
      default:
        console.log('Usage: resource config [set|get|show] [key] [value]');
        return { success: false };
    }
  }

  async showCurrentConfig() {
    const prefs = this.coordinator.preferences;

    console.log('⚙️ Resource Delegation Configuration\n');
    console.log('📋 General Settings:');
    console.log(`  Mode: ${prefs.resourceDelegation.mode}`);
    console.log(`  Heavy Command Threshold: ${prefs.resourceDelegation.heavyCommandThreshold}ms`);
    console.log(`  Max Concurrent Heavy: ${prefs.resourceDelegation.maxConcurrentHeavyCommands}`);
    console.log(`  Preferred Delegate: ${prefs.resourceDelegation.preferredDelegate}\n`);

    console.log('🚦 Resource Limits:');
    Object.entries(prefs.resourceDelegation.resourceLimits).forEach(([resource, limit]) => {
      console.log(`  ${resource.toUpperCase()}: ${limit}%`);
    });

    console.log('\n🔨 Heavy Commands:');
    prefs.commands.heavyCommands.slice(0, 10).forEach((cmd) => {
      console.log(`  - ${cmd}`);
    });
    if (prefs.commands.heavyCommands.length > 10) {
      console.log(`  ... and ${prefs.commands.heavyCommands.length - 10} more`);
    }

    console.log('\n📏 Delegation Rules:');
    Object.entries(prefs.commands.delegationRules).forEach(([type, strategy]) => {
      console.log(`  ${type}: ${strategy}`);
    });

    return { success: true, data: prefs };
  }

  async setDelegationMode(mode) {
    const validModes = ['distributed', 'single-delegate', 'adaptive'];

    if (!mode || !validModes.includes(mode)) {
      console.log(`❌ Invalid mode. Valid options: ${validModes.join(', ')}`);
      return { success: false };
    }

    await this.coordinator.updatePreferences({
      resourceDelegation: {
        ...this.coordinator.preferences.resourceDelegation,
        mode,
      },
    });

    console.log(`✅ Delegation mode set to: ${mode}`);

    // Show mode description
    const descriptions = {
      distributed: 'All agents can execute heavy commands simultaneously',
      'single-delegate': 'One agent executes, results shared with others',
      adaptive: 'Automatically chooses best strategy based on conditions',
    };

    console.log(`📝 ${descriptions[mode]}`);

    return { success: true, mode };
  }

  async manageHeavyCommands(args) {
    if (args.length === 0) {
      return await this.listHeavyCommands();
    }

    const [action, ...params] = args;

    switch (action) {
      case 'add':
        return await this.addHeavyCommand(params.join(' '));
      case 'remove':
        return await this.removeHeavyCommand(params.join(' '));
      case 'list':
        return await this.listHeavyCommands();
      default:
        console.log('Usage: resource heavy-commands [add|remove|list] [command]');
        return { success: false };
    }
  }

  async addHeavyCommand(command) {
    if (!command) {
      console.log('❌ Please specify a command to add');
      return { success: false };
    }

    const heavyCommands = [...this.coordinator.preferences.commands.heavyCommands];

    if (heavyCommands.includes(command)) {
      console.log(`⚠️  Command already exists: ${command}`);
      return { success: false };
    }

    heavyCommands.push(command);

    await this.coordinator.updatePreferences({
      commands: {
        ...this.coordinator.preferences.commands,
        heavyCommands,
      },
    });

    console.log(`✅ Added heavy command: ${command}`);
    return { success: true };
  }

  async removeHeavyCommand(command) {
    if (!command) {
      console.log('❌ Please specify a command to remove');
      return { success: false };
    }

    const heavyCommands = this.coordinator.preferences.commands.heavyCommands.filter(
      (cmd) => cmd !== command,
    );

    if (heavyCommands.length === this.coordinator.preferences.commands.heavyCommands.length) {
      console.log(`⚠️  Command not found: ${command}`);
      return { success: false };
    }

    await this.coordinator.updatePreferences({
      commands: {
        ...this.coordinator.preferences.commands,
        heavyCommands,
      },
    });

    console.log(`✅ Removed heavy command: ${command}`);
    return { success: true };
  }

  async listHeavyCommands() {
    const commands = this.coordinator.preferences.commands.heavyCommands;

    console.log(`🔨 Heavy Commands (${commands.length} total):\n`);
    commands.forEach((cmd, index) => {
      console.log(`  ${index + 1}. ${cmd}`);
    });

    return { success: true, commands };
  }

  async showStats() {
    const stats = this.coordinator.getStats();

    console.log('📊 Resource Management Statistics\n');

    if (stats.totalCommands > 0) {
      console.log(`📈 Command Execution:`);
      console.log(`  Total Commands: ${stats.totalCommands}`);
      console.log(
        `  Heavy Commands: ${stats.heavyCommands} (${((stats.heavyCommands / stats.totalCommands) * 100).toFixed(1)}%)`,
      );
      console.log(`  Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
      console.log(`  Average Duration: ${stats.averageDuration?.toFixed(0)}ms\n`);

      if (Object.keys(stats.strategiesUsed).length > 0) {
        console.log('🎯 Strategy Distribution:');
        const total = Object.values(stats.strategiesUsed).reduce((sum, count) => sum + count, 0);
        Object.entries(stats.strategiesUsed).forEach(([strategy, count]) => {
          const percentage = ((count / total) * 100).toFixed(1);
          console.log(`  ${strategy}: ${count} (${percentage}%)`);
        });
        console.log('');
      }
    } else {
      console.log('📊 No command execution history available yet.\n');
    }

    console.log(`🔄 Current Status:`);
    console.log(`  Active Commands: ${stats.activeCommands}`);
    console.log(
      `  System Load: CPU ${stats.currentLoad?.cpu?.toFixed(1) || 'N/A'}%, Memory ${stats.currentLoad?.memory?.toFixed(1) || 'N/A'}%`,
    );

    return { success: true, data: stats };
  }

  async testDelegation(args) {
    const testCommand = args.join(' ') || 'npm test';

    console.log(`🧪 Testing delegation for command: ${testCommand}\n`);

    // Mock agents for testing
    const mockAgents = [
      { id: 'agent-1', capabilities: ['test', 'build'] },
      { id: 'agent-2', capabilities: ['code', 'review'] },
      { id: 'agent-3', capabilities: ['test', 'performance'] },
    ];

    try {
      console.log('🔄 Executing command with current delegation settings...');
      const result = await this.coordinator.executeCommand(testCommand, mockAgents);

      console.log('✅ Test completed successfully\n');
      console.log('📋 Results:');
      console.log(`  Strategy Used: ${result.strategy}`);

      if (result.delegate) {
        console.log(`  Delegate Agent: ${result.delegate}`);
      }

      if (result.results) {
        console.log(`  Participating Agents: ${result.results.length}`);
        result.results.forEach((r) => {
          const status = r.status === 'fulfilled' ? '✅' : '❌';
          console.log(`    ${status} ${r.agent}: ${r.status}`);
        });
      }

      return { success: true, result };
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async resetToDefaults() {
    console.log('🔄 Resetting resource management to default settings...');

    const defaults = this.coordinator.getDefaultPreferences();
    await this.coordinator.updatePreferences(defaults);

    console.log('✅ Resource management settings reset to defaults');
    return { success: true };
  }

  async suggestOptimizations() {
    const stats = this.coordinator.getStats();
    const suggestions = [];

    console.log('🔍 Analyzing current usage patterns...\n');

    // Analyze success rate
    if (stats.successRate < 0.9 && stats.totalCommands > 10) {
      suggestions.push({
        type: 'reliability',
        message: 'Consider using single-delegate mode to improve reliability',
        action: 'Set mode to single-delegate for better error handling',
      });
    }

    // Analyze average duration
    if (stats.averageDuration > 10000) {
      suggestions.push({
        type: 'performance',
        message: 'Long execution times detected',
        action: 'Consider adjusting heavy command threshold or using adaptive mode',
      });
    }

    // Analyze strategy distribution
    const strategies = stats.strategiesUsed;
    if (strategies['single-delegate'] > (strategies['distributed'] || 0) * 2) {
      suggestions.push({
        type: 'resource-usage',
        message: 'High single-delegate usage detected',
        action: 'System might be resource-constrained. Consider upgrading or optimizing workloads',
      });
    }

    if (suggestions.length === 0) {
      console.log('✅ No optimization suggestions at this time. Your settings look good!');
      return { success: true, suggestions: [] };
    }

    console.log('💡 Optimization Suggestions:\n');
    suggestions.forEach((suggestion, index) => {
      console.log(`${index + 1}. ${suggestion.type.toUpperCase()}: ${suggestion.message}`);
      console.log(`   💭 ${suggestion.action}\n`);
    });

    return { success: true, suggestions };
  }

  showHelp() {
    console.log(`
🔧 Resource Management Commands

Usage: claude-flow-novice resource <command> [options]

Commands:
  status              Show current resource management status
  config [action]     Manage configuration settings
    set <key> <value>   Set a configuration value
    get <key>           Get a configuration value
    show                Show full configuration

  mode <mode>         Set delegation mode
                      Modes: distributed, single-delegate, adaptive

  heavy-commands <action>  Manage heavy command list
    add <command>       Add command to heavy list
    remove <command>    Remove command from heavy list
    list                Show all heavy commands

  stats               Show execution statistics
  test-delegation [cmd] Test delegation with a command
  reset               Reset to default settings
  optimize            Get optimization suggestions
  help                Show this help message

Examples:
  claude-flow-novice resource status
  claude-flow-novice resource mode adaptive
  claude-flow-novice resource heavy-commands add "cargo build"
  claude-flow-novice resource test-delegation "npm test"
`);

    return { success: true };
  }
}

export default ResourceManagementCLI;
