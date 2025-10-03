#!/usr/bin/env node

/**
 * /custom-routing-activate - Enable tiered provider routing
 *
 * Activates profile-based provider routing to route most agents to Z.ai
 * for cost optimization while keeping high-value agents on Anthropic.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function findConfigPath() {
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

function readConfig(configPath) {
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

function writeConfig(configPath, config) {
  try {
    // Ensure directory exists
    const dir = dirname(configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const content = JSON.stringify(config, null, 2);
    writeFileSync(configPath, content, 'utf-8');
    return true;
  } catch (error) {
    log(`❌ Error writing config: ${error.message}`, 'reset');
    return false;
  }
}

async function main() {
  log('\n═══════════════════════════════════════════════════════', 'cyan');
  log('   Activating Tiered Provider Routing', 'bright');
  log('═══════════════════════════════════════════════════════', 'cyan');

  const configPath = findConfigPath();
  const config = readConfig(configPath);

  // Check if already enabled
  if (config.tieredRouting?.enabled === true) {
    log('\n✅ Tiered routing is already ENABLED', 'green');
    log('\n📊 Current Routing:', 'blue');
    log('  • coder, tester, reviewer → Z.ai (cost-optimized)');
    log('  • architect, coordinator → Anthropic (high-value)');
    log('  • Unknown agents → Z.ai (default)');
    log('\n💡 To disable, run: /custom-routing-deactivate\n', 'cyan');
    return;
  }

  // Enable routing
  config.tieredRouting = { enabled: true };

  if (writeConfig(configPath, config)) {
    log('\n✅ Tiered Provider Routing ACTIVATED', 'green');
    log('\n📊 Active Routing:', 'blue');
    log('  • coder, tester, reviewer → Z.ai');
    log('  • architect, coordinator, system-architect → Anthropic');
    log('  • Unknown agents → Z.ai (default)');

    log('\n💰 Cost Optimization:', 'green');
    log('  • ~64% cost reduction on agent usage');
    log('  • Most agents use affordable Z.ai provider');
    log('  • High-value work stays on Anthropic');

    log('\n🎯 Agent Profile Overrides:', 'cyan');
    log('  • Add provider: zai to agent profile → force Z.ai');
    log('  • Add provider: anthropic to agent profile → force Anthropic');

    log('\n💾 Configuration saved to:', 'cyan');
    log(`   ${configPath}`);

    log('\n📖 To disable routing:', 'cyan');
    log('   /custom-routing-deactivate');
    log('═══════════════════════════════════════════════════════\n', 'cyan');
  } else {
    log('\n❌ Failed to activate tiered routing', 'reset');
    log('Check file permissions and try again\n');
    process.exit(1);
  }
}

main().catch(error => {
  log(`\n❌ Error: ${error.message}`, 'reset');
  console.error(error.stack);
  process.exit(1);
});
