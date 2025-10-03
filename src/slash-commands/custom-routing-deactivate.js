#!/usr/bin/env node

/**
 * /custom-routing-deactivate - Disable tiered provider routing
 *
 * Deactivates profile-based provider routing so all agents use
 * the default provider configuration (typically Anthropic with sonnet model).
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
  yellow: '\x1b[33m',
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
  log('   Deactivating Tiered Provider Routing', 'bright');
  log('═══════════════════════════════════════════════════════', 'cyan');

  const configPath = findConfigPath();
  const config = readConfig(configPath);

  // Check if already disabled
  if (config.tieredRouting?.enabled === false || !config.tieredRouting) {
    log('\n✅ Tiered routing is already DISABLED', 'green');
    log('\n📊 Current Routing:', 'blue');
    log('  • All agents use sonnet model (from agent profiles)');
    log('  • Single provider for all agents');
    log('  • No cost optimization');
    log('\n💡 To enable cost optimization, run: /custom-routing-activate\n', 'yellow');
    return;
  }

  // Disable routing
  config.tieredRouting = { enabled: false };

  if (writeConfig(configPath, config)) {
    log('\n✅ Tiered Provider Routing DEACTIVATED', 'green');
    log('\n📊 Current Routing:', 'blue');
    log('  • All agents use sonnet model (from agent profiles)');
    log('  • Single provider for all agents');
    log('  • No provider-based routing');

    log('\n⚠️  Cost Impact:', 'yellow');
    log('  • All agents use default provider (typically Anthropic)');
    log('  • No cost optimization active');
    log('  • Useful for testing or consistency requirements');

    log('\n💾 Configuration saved to:', 'cyan');
    log(`   ${configPath}`);

    log('\n📖 To enable routing:', 'cyan');
    log('   /custom-routing-activate');
    log('═══════════════════════════════════════════════════════\n', 'cyan');
  } else {
    log('\n❌ Failed to deactivate tiered routing', 'reset');
    log('Check file permissions and try again\n');
    process.exit(1);
  }
}

main().catch(error => {
  log(`\n❌ Error: ${error.message}`, 'reset');
  console.error(error.stack);
  process.exit(1);
});
