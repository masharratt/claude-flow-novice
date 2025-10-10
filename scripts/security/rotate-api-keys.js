#!/usr/bin/env node

/**
 * API Key Rotation Script
 * Automates the process of rotating API keys and updating configuration
 *
 * Usage:
 *   node scripts/security/rotate-api-keys.js [--key=KEY_NAME] [--new-value=VALUE] [--auto]
 *
 * @security Phase 0 Debt Resolution
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

// Load SecretsManager
const { getSecretsManager } = require('../../src/security/SecretsManager.cjs');

/**
 * CLI Arguments Parser
 */
function parseArgs() {
  const args = {
    key: null,
    newValue: null,
    auto: false,
    interactive: true,
    dryRun: false,
    force: false
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg.startsWith('--key=')) {
      args.key = arg.split('=')[1];
    } else if (arg.startsWith('--new-value=')) {
      args.newValue = arg.split('=')[1];
    } else if (arg === '--auto') {
      args.auto = true;
      args.interactive = false;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
API Key Rotation Script
========================

Usage:
  node scripts/security/rotate-api-keys.js [OPTIONS]

Options:
  --key=KEY_NAME          Specific key to rotate (e.g., ANTHROPIC_API_KEY)
  --new-value=VALUE       New value for the key
  --auto                  Auto-generate values for supported keys
  --dry-run              Show what would be done without making changes
  --force                Force rotation even if key was recently rotated
  --help, -h             Show this help message

Examples:
  # Interactive rotation (prompts for all inputs)
  node scripts/security/rotate-api-keys.js

  # Rotate specific key
  node scripts/security/rotate-api-keys.js --key=REDIS_PASSWORD --auto

  # Rotate with new value
  node scripts/security/rotate-api-keys.js --key=REDIS_PASSWORD --new-value=new-secure-password

  # Dry run to see what would happen
  node scripts/security/rotate-api-keys.js --key=REDIS_PASSWORD --dry-run

Security Notes:
  - API keys should be rotated every 90 days
  - Always test the new key before fully committing
  - Keep a backup of old keys for rollback
  - Update all services using the rotated key
`);
}

/**
 * Prompt user for input
 */
async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Validate key format
 */
function validateKeyFormat(key, value) {
  const patterns = {
    ANTHROPIC_API_KEY: /^sk-ant-api03-[a-zA-Z0-9\-_]{95}$/,
    Z_AI_API_KEY: /^[a-f0-9]{32}\.[a-zA-Z0-9]{16}$/,
    ZAI_API_KEY: /^[a-f0-9]{32}\.[a-zA-Z0-9]{16}$/,
    NPM_API_KEY: /^npm_[a-zA-Z0-9]{36}$/,
    REDIS_PASSWORD: /^.{32,}$/
  };

  if (patterns[key]) {
    return patterns[key].test(value);
  }

  // Generic validation for other keys
  return value && value.length >= 20;
}

/**
 * Auto-generate secure value for supported keys
 */
function autoGenerateValue(key) {
  switch (key) {
    case 'REDIS_PASSWORD': {
      const length = 64;
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
      let password = '';
      const randomBytes = crypto.randomBytes(length);
      for (let i = 0; i < length; i++) {
        password += chars[randomBytes[i] % chars.length];
      }
      return password;
    }

    case 'JWT_SECRET':
    case 'SESSION_SECRET': {
      return crypto.randomBytes(64).toString('hex');
    }

    default:
      return null;
  }
}

/**
 * Check if key was recently rotated
 */
async function checkRecentRotation(key, secretsManager) {
  const rotationLogPath = path.join(process.cwd(), 'memory', 'security', 'key-rotations.json');

  if (!fs.existsSync(rotationLogPath)) {
    return false;
  }

  const rotations = JSON.parse(fs.readFileSync(rotationLogPath, 'utf8'));
  const recentRotation = rotations
    .filter(r => r.key === key)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

  if (!recentRotation) {
    return false;
  }

  const rotationDate = new Date(recentRotation.timestamp);
  const daysSinceRotation = Math.floor((Date.now() - rotationDate) / (1000 * 60 * 60 * 24));

  return daysSinceRotation < 7; // Recently rotated if within 7 days
}

/**
 * Backup current .env file
 */
function backupEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(process.cwd(), 'memory', 'security', `env-backup-${timestamp}.txt`);
  const backupDir = path.dirname(backupPath);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  }

  fs.copyFileSync(envPath, backupPath);
  fs.chmodSync(backupPath, 0o600);

  return backupPath;
}

/**
 * Rotate a single API key
 */
async function rotateKey(key, newValue, args) {
  const secretsManager = getSecretsManager();
  await secretsManager.initialize();

  console.log(`\n🔄 Rotating: ${key}`);

  // Check if recently rotated
  if (!args.force && await checkRecentRotation(key, secretsManager)) {
    console.log(`⚠️  ${key} was recently rotated (within 7 days)`);
    if (args.interactive) {
      const proceed = await prompt('Continue anyway? (yes/no): ');
      if (proceed.toLowerCase() !== 'yes') {
        console.log('❌ Rotation cancelled');
        return false;
      }
    } else {
      console.log('❌ Use --force to override');
      return false;
    }
  }

  // Get current value
  const currentValue = secretsManager.getSecret(key);
  if (!currentValue) {
    console.log(`⚠️  ${key} is not currently set`);
  } else {
    console.log(`✅ Current value found (will be backed up)`);
  }

  // Validate new value
  if (!validateKeyFormat(key, newValue)) {
    console.log(`❌ Invalid format for ${key}`);
    console.log(`   Value: ${newValue.substring(0, 20)}...`);
    return false;
  }

  console.log(`✅ New value validated`);

  // Dry run check
  if (args.dryRun) {
    console.log(`\n🔍 DRY RUN - Would rotate ${key}`);
    console.log(`   Old value: ${currentValue ? currentValue.substring(0, 10) + '...' : 'not set'}`);
    console.log(`   New value: ${newValue.substring(0, 10)}...`);
    return true;
  }

  // Backup .env file
  const backupPath = backupEnvFile();
  if (backupPath) {
    console.log(`💾 Backed up .env to: ${backupPath}`);
  }

  try {
    // Perform rotation
    await secretsManager.rotateApiKey(key, newValue);
    console.log(`✅ Successfully rotated ${key}`);

    // Additional actions based on key type
    switch (key) {
      case 'REDIS_PASSWORD':
        console.log(`\n⚠️  IMPORTANT: Update Redis configuration:`);
        console.log(`   1. Update redis.conf: requirepass ${newValue}`);
        console.log(`   2. Restart Redis server`);
        console.log(`   3. Test connection with new password`);
        break;

      case 'ANTHROPIC_API_KEY':
        console.log(`\n⚠️  IMPORTANT: Update Anthropic dashboard:`);
        console.log(`   1. Revoke old API key in Anthropic console`);
        console.log(`   2. Test new key with a simple request`);
        break;

      case 'NPM_API_KEY':
        console.log(`\n⚠️  IMPORTANT: Update npm configuration:`);
        console.log(`   1. Verify token in npm: npm whoami`);
        console.log(`   2. Revoke old token in npm website`);
        break;
    }

    return true;
  } catch (error) {
    console.error(`❌ Rotation failed: ${error.message}`);

    // Rollback from backup if available
    if (backupPath && fs.existsSync(backupPath)) {
      console.log(`🔄 Rolling back from backup...`);
      fs.copyFileSync(backupPath, path.join(process.cwd(), '.env'));
      console.log(`✅ Rolled back to previous state`);
    }

    return false;
  }
}

/**
 * Interactive rotation workflow
 */
async function interactiveRotation() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║          API Key Rotation - Interactive Mode                ║
╚══════════════════════════════════════════════════════════════╝
`);

  const secretsManager = getSecretsManager();
  await secretsManager.initialize();

  // Check which keys need rotation
  const needRotation = await secretsManager.checkRotationRequired();

  if (needRotation.length > 0) {
    console.log(`\n⚠️  The following keys need rotation (90+ days):`);
    needRotation.forEach((key, i) => {
      console.log(`   ${i + 1}. ${key}`);
    });
  } else {
    console.log(`\n✅ All keys are up to date (rotated within 90 days)`);
  }

  // Ask which key to rotate
  console.log(`\nAvailable keys to rotate:`);
  const allKeys = ['ANTHROPIC_API_KEY', 'Z_AI_API_KEY', 'NPM_API_KEY', 'REDIS_PASSWORD'];
  allKeys.forEach((key, i) => {
    const current = secretsManager.getSecret(key);
    const status = current ? '✅ set' : '❌ not set';
    const needsRotation = needRotation.includes(key) ? '⚠️  rotation needed' : '';
    console.log(`   ${i + 1}. ${key} (${status}) ${needsRotation}`);
  });

  const keyChoice = await prompt('\nEnter key number to rotate (or "q" to quit): ');
  if (keyChoice.toLowerCase() === 'q') {
    console.log('👋 Goodbye!');
    process.exit(0);
  }

  const keyIndex = parseInt(keyChoice) - 1;
  if (keyIndex < 0 || keyIndex >= allKeys.length) {
    console.log('❌ Invalid selection');
    process.exit(1);
  }

  const selectedKey = allKeys[keyIndex];

  // Check if auto-generate is available
  const canAutoGenerate = autoGenerateValue(selectedKey) !== null;
  let newValue;

  if (canAutoGenerate) {
    const autoGen = await prompt(`Auto-generate secure value? (yes/no): `);
    if (autoGen.toLowerCase() === 'yes') {
      newValue = autoGenerateValue(selectedKey);
      console.log(`✅ Generated secure value`);
    } else {
      newValue = await prompt(`Enter new value for ${selectedKey}: `);
    }
  } else {
    newValue = await prompt(`Enter new value for ${selectedKey}: `);
  }

  // Confirm rotation
  console.log(`\n📋 Rotation Summary:`);
  console.log(`   Key: ${selectedKey}`);
  console.log(`   New value: ${newValue.substring(0, 20)}...`);

  const confirm = await prompt('\nProceed with rotation? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes') {
    console.log('❌ Rotation cancelled');
    process.exit(0);
  }

  // Perform rotation
  const args = { interactive: true, dryRun: false, force: false };
  const success = await rotateKey(selectedKey, newValue, args);

  if (success) {
    console.log(`\n✅ Rotation complete!`);

    // Generate security audit
    console.log(`\n📊 Generating security audit...`);
    const audit = await secretsManager.generateSecurityAudit();
    console.log(`\nSecurity Status:`);
    console.log(`   Total secrets: ${audit.secrets.total}`);
    console.log(`   Missing required: ${audit.secrets.missing.length}`);
    console.log(`   Keys needing rotation: ${audit.rotation.needRotation.length}`);

    if (audit.recommendations.length > 0) {
      console.log(`\n⚠️  Recommendations:`);
      audit.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. [${rec.severity}] ${rec.message}`);
      });
    }
  } else {
    console.log(`\n❌ Rotation failed`);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs();

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║          Claude Flow Novice - API Key Rotation              ║
║                   Phase 0 Security Debt                     ║
╚══════════════════════════════════════════════════════════════╝
`);

  // Interactive mode
  if (args.interactive && !args.key) {
    await interactiveRotation();
    return;
  }

  // Command-line mode
  if (!args.key) {
    console.log('❌ --key parameter required in non-interactive mode');
    console.log('   Use --help for usage information');
    process.exit(1);
  }

  let newValue = args.newValue;

  // Auto-generate if requested
  if (args.auto) {
    newValue = autoGenerateValue(args.key);
    if (!newValue) {
      console.log(`❌ Auto-generation not supported for ${args.key}`);
      console.log('   Provide --new-value instead');
      process.exit(1);
    }
    console.log(`✅ Auto-generated secure value for ${args.key}`);
  }

  if (!newValue) {
    console.log('❌ --new-value or --auto required');
    process.exit(1);
  }

  // Perform rotation
  const success = await rotateKey(args.key, newValue, args);

  if (success) {
    console.log(`\n✅ Rotation complete!`);
    process.exit(0);
  } else {
    console.log(`\n❌ Rotation failed`);
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
