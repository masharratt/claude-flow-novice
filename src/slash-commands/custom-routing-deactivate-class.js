#!/usr/bin/env node

/**
 * Custom Routing Deactivate Command Class
 * Implements SlashCommand interface for registry integration
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export class CustomRoutingDeactivateCommand {
  constructor() {
    this.name = 'custom-routing-deactivate';
    this.description = 'Disable tiered provider routing';
    this.usage = '/custom-routing-deactivate';
  }

  findConfigPath() {
    const possiblePaths = [
      join(process.cwd(), '.claude', 'settings.json'),
      join(process.cwd(), '.claude/settings.json'),
      join(process.cwd(), 'settings.json'),
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return join(process.cwd(), '.claude', 'settings.json');
  }

  readConfig(configPath) {
    try {
      if (!existsSync(configPath)) {
        return {
          providers: {},
          tieredRouting: { enabled: false }
        };
      }

      const content = readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return {
        providers: {},
        tieredRouting: { enabled: false }
      };
    }
  }

  writeConfig(configPath, config) {
    try {
      const dir = dirname(configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const content = JSON.stringify(config, null, 2);
      writeFileSync(configPath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error(`❌ Error writing config: ${error.message}`);
      return false;
    }
  }

  async execute(args = [], context = {}) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   Deactivating Tiered Provider Routing');
    console.log('═══════════════════════════════════════════════════════');

    const configPath = this.findConfigPath();
    const config = this.readConfig(configPath);

    if (config.tieredRouting?.enabled === false || !config.tieredRouting) {
      console.log('\n✅ Tiered routing is already DISABLED');
      console.log('\n📊 Current Routing:');
      console.log('  • All agents use sonnet model (from agent profiles)');
      console.log('  • Single provider for all agents');
      console.log('  • No cost optimization');
      console.log('\n💡 To enable cost optimization, run: /custom-routing-activate\n');
      return true;
    }

    config.tieredRouting = { enabled: false };

    if (this.writeConfig(configPath, config)) {
      console.log('\n✅ Tiered Provider Routing DEACTIVATED');
      console.log('\n📊 Current Routing:');
      console.log('  • All agents use sonnet model (from agent profiles)');
      console.log('  • Single provider for all agents');
      console.log('  • No provider-based routing');

      console.log('\n⚠️  Cost Impact:');
      console.log('  • All agents use default provider (typically Anthropic)');
      console.log('  • No cost optimization active');
      console.log('  • Useful for testing or consistency requirements');

      console.log('\n💾 Configuration saved to:');
      console.log(`   ${configPath}`);

      console.log('\n📖 To enable routing:');
      console.log('   /custom-routing-activate');
      console.log('═══════════════════════════════════════════════════════\n');
      return true;
    }

    console.log('\n❌ Failed to deactivate tiered routing');
    console.log('Check file permissions and try again\n');
    return false;
  }
}
