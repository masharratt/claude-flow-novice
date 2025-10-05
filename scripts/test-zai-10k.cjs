#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.trim().match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
}

const API_KEY = process.env.ZAI_API_KEY;

console.log('\n🚀 Z.ai API Test - 10K Max Tokens\n');
console.log('='.repeat(80) + '\n');

const payload = {
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 10000,
  messages: [
    { role: 'user', content: 'Write a haiku about AI and coding. Then explain why you chose those words.' }
  ]
};

const url = new URL('https://api.z.ai/api/anthropic/v1/messages');

const options = {
  hostname: url.hostname,
  port: 443,
  path: url.pathname,
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
    const result = JSON.parse(body);

    console.log('✅ Response received!\n');
    console.log('Status:', res.statusCode);
    console.log('Model:', result.model);
    console.log('\nContent:');
    console.log(result.content[0].text);
    console.log('\nToken usage:');
    console.log('  Input:', result.usage.input_tokens);
    console.log('  Output:', result.usage.output_tokens);
    console.log('  Total:', result.usage.input_tokens + result.usage.output_tokens);

    const cost = (result.usage.input_tokens / 1000 * 0.003) +
                 (result.usage.output_tokens / 1000 * 0.015);
    console.log('\nEstimated cost: $' + cost.toFixed(6));
    console.log('\n' + '='.repeat(80) + '\n');
    console.log('✅ Z.ai with 10K max_tokens working correctly!\n');
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error.message);
});

req.setTimeout(45000, () => {
  req.destroy();
  console.error('❌ Request timeout');
});

req.write(JSON.stringify(payload));
req.end();
