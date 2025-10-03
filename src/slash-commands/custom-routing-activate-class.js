#!/usr/bin/env node

/**
 * Custom Routing Activate Command Class
 * Implements SlashCommand interface for registry integration
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export class CustomRoutingActivateCommand {
  constructor() {
    this.name = 'custom-routing-activate';
    this.description = 'Enable tiered provider routing for cost optimization';
    this.usage = '/custom-routing-activate';
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
    console.log('   Activating Tiered Provider Routing');
    console.log('═══════════════════════════════════════════════════════');

    const configPath = this.findConfigPath();
    const config = this.readConfig(configPath);

    if (config.tieredRouting?.enabled === true) {
      console.log('\n✅ Tiered routing is already ENABLED');
      console.log('\n📊 Current Routing:');
      console.log('  • coder, tester, reviewer → Z.ai (cost-optimized)');
      console.log('  • architect, coordinator → Anthropic (high-value)');
      console.log('  • Unknown agents → Z.ai (default)');
      console.log('\n💡 To disable, run: /custom-routing-deactivate\n');
      return true;
    }

    config.tieredRouting = { enabled: true };

    if (this.writeConfig(configPath, config)) {
      console.log('\n✅ Tiered Provider Routing ACTIVATED');
      console.log('\n📊 Active Routing:');
      console.log('  • coder, tester, reviewer → Z.ai');
      console.log('  • architect, coordinator, system-architect → Anthropic');
      console.log('  • Unknown agents → Z.ai (default)');

      console.log('\n💰 Cost Optimization:');
      console.log('  • ~64% cost reduction on agent usage');
      console.log('  • Most agents use affordable Z.ai provider');
      console.log('  • High-value work stays on Anthropic');

      console.log('\n🎯 Agent Profile Overrides:');
      console.log('  • Add provider: zai to agent profile → force Z.ai');
      console.log('  • Add provider: anthropic to agent profile → force Anthropic');

      console.log('\n💾 Configuration saved to:');
      console.log(`   ${configPath}`);

      console.log('\n📖 To disable routing:');
      console.log('   /custom-routing-deactivate');
      console.log('═══════════════════════════════════════════════════════\n');
      return true;
    }

    console.log('\n❌ Failed to activate tiered routing');
    console.log('Check file permissions and try again\n');
    return false;
  }
}
