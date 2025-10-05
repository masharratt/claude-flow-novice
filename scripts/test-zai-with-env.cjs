#!/usr/bin/env node

/**
 * Z.ai API Test with .env loading
 */

const fs = require('fs');
const path = require('path');

// Load .env file
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found in:', process.cwd());
    return false;
  }

  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Parse KEY=VALUE
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        process.env[key] = value;
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Error loading .env:', error.message);
    return false;
  }
}

// Load environment
console.log('📁 Loading .env file...');
if (!loadEnv()) {
  process.exit(1);
}

// Check for Z_AI_API_KEY or ZAI_API_KEY
if (process.env.Z_AI_API_KEY || process.env.ZAI_API_KEY) {
  const key = process.env.Z_AI_API_KEY || process.env.ZAI_API_KEY;
  const keyName = process.env.Z_AI_API_KEY ? 'Z_AI_API_KEY' : 'ZAI_API_KEY';
  console.log(`✓ ${keyName} loaded from .env`);
  console.log('  Key preview:', key.substring(0, 10) + '...\n');
} else {
  console.error('❌ Z_AI_API_KEY or ZAI_API_KEY not found in .env file');
  console.log('\nSearching for Z.ai related keys in .env...');

  const envPath = path.join(process.cwd(), '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const zaiKeys = envContent.split('\n').filter(line =>
    line.toLowerCase().includes('z_ai') || line.toLowerCase().includes('zai')
  );

  if (zaiKeys.length > 0) {
    console.log('Found:', zaiKeys.join('\n'));
  } else {
    console.log('No Z.ai related keys found');
  }

  process.exit(1);
}

// Now run the actual test
console.log('🚀 Starting Z.ai API test...\n');
require('./test-zai-api.cjs');
