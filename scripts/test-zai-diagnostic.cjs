#!/usr/bin/env node

/**
 * Z.ai API Diagnostic Test
 * Tests multiple endpoint variations
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return false;

  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
  return true;
}

loadEnv();

const API_KEY = process.env.ZAI_API_KEY || process.env.Z_AI_API_KEY;

if (!API_KEY) {
  console.error('❌ No API key found');
  process.exit(1);
}

console.log('\n🔍 Z.ai API Diagnostic Test\n');
console.log('='.repeat(80));
console.log('\n✓ API Key:', API_KEY.substring(0, 15) + '...' + API_KEY.substring(API_KEY.length - 4));

// Test different endpoints and models
const tests = [
  {
    name: 'GLM-4.6 via /v1/chat/completions',
    url: 'https://api.z.ai/v1/chat/completions',
    model: 'glm-4.6'
  },
  {
    name: 'GLM-4-Flash via /v1/chat/completions',
    url: 'https://api.z.ai/v1/chat/completions',
    model: 'glm-4-flash'
  },
  {
    name: 'Claude via /v1/chat/completions',
    url: 'https://api.z.ai/v1/chat/completions',
    model: 'claude-3-5-sonnet-20241022'
  },
  {
    name: 'Check /v1/models endpoint',
    url: 'https://api.z.ai/v1/models',
    method: 'GET'
  }
];

function testEndpoint(test) {
  return new Promise((resolve) => {
    const url = new URL(test.url);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: test.method || 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    let data = null;
    if (test.method !== 'GET') {
      data = JSON.stringify({
        model: test.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10
      });
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: body.substring(0, 500)
        });
      });
    });

    req.on('error', (error) => {
      resolve({ status: 'ERROR', error: error.message });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ status: 'TIMEOUT' });
    });

    if (data) req.write(data);
    req.end();
  });
}

async function runDiagnostics() {
  for (const test of tests) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`\n📍 ${test.name}`);
    console.log(`   URL: ${test.url}`);
    if (test.model) console.log(`   Model: ${test.model}`);

    const result = await testEndpoint(test);

    if (result.status === 'ERROR') {
      console.log(`   ❌ Error: ${result.error}`);
    } else if (result.status === 'TIMEOUT') {
      console.log(`   ⏱️  Timeout`);
    } else if (result.status === 200 || result.status === 201) {
      console.log(`   ✅ Success (${result.status})`);
      console.log(`   Response: ${result.body.substring(0, 200)}...`);
    } else {
      console.log(`   ⚠️  Status: ${result.status}`);
      console.log(`   Response: ${result.body.substring(0, 200)}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n💡 Recommendations:');
  console.log('   - Check Z.ai documentation for correct endpoint structure');
  console.log('   - Verify API key permissions');
  console.log('   - Confirm supported models list\n');
}

runDiagnostics().catch(console.error);
