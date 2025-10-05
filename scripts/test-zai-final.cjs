#!/usr/bin/env node

/**
 * Final Z.ai API Verification Test
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

const API_KEY = process.env.ZAI_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

function makeRequest(url, payload) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function test() {
  console.log('\n🎯 Z.ai API Final Verification\n');
  console.log('='.repeat(80) + '\n');

  const tests = [
    {
      name: 'Test 1: Simple greeting (10K tokens)',
      payload: {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10000,
        messages: [{ role: 'user', content: 'Reply with exactly: "Hello from Z.ai GLM-4.6!"' }]
      }
    },
    {
      name: 'Test 2: Code generation (10K tokens)',
      payload: {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10000,
        messages: [{ role: 'user', content: 'Write a complete JavaScript class for managing a todo list with add, remove, and list methods. Include comments.' }]
      }
    }
  ];

  for (const test of tests) {
    console.log(`📋 ${test.name}`);
    console.log('-'.repeat(80));

    try {
      const result = await makeRequest('https://api.z.ai/api/anthropic/v1/messages', test.payload);

      if (result.status === 200) {
        console.log('✅ Success!');
        console.log('Response:', result.body.content?.[0]?.text || result.body.content || 'Empty response');
        console.log('Model:', result.body.model);
        console.log('Tokens:', `${result.body.usage?.input_tokens || 0} in, ${result.body.usage?.output_tokens || 0} out`);
      } else {
        console.log('⚠️  Status:', result.status);
        console.log('Body:', JSON.stringify(result.body, null, 2).substring(0, 200));
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }

    console.log('');
  }

  console.log('='.repeat(80));
  console.log('\n✅ Z.ai API verification complete!\n');
}

test();
