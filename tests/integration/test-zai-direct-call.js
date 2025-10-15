#!/usr/bin/env node

/**
 * Direct Z.ai API Test Call
 * Makes a real API call to Z.ai to verify billing tracking
 */

// Try to load .env if available
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load .env manually
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  });
}

const Z_AI_API_KEY = process.env.Z_AI_API_KEY;

if (!Z_AI_API_KEY) {
  console.error('❌ Z_AI_API_KEY not found in environment');
  console.error('Set it in .env file or export Z_AI_API_KEY=your_key');
  process.exit(1);
}

async function testZaiDirectCall() {
  console.log('🚀 Making direct call to Z.ai API...\n');
  console.log(`⏰ Timestamp: ${new Date().toISOString()}\n`);

  const payload = {
    model: 'haiku',
    messages: [
      {
        role: 'user',
        content: 'Say "Hello from direct API test" and nothing else.'
      }
    ],
    max_tokens: 50
  };

  console.log('📤 Request payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log();

  try {
    const startTime = Date.now();

    const response = await fetch('https://api.z.ai/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Z_AI_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      console.error(errorText);
      process.exit(1);
    }

    const data = await response.json();

    console.log('✅ API call successful!\n');
    console.log('📊 Response details:');
    console.log(`   ID: ${data.id}`);
    console.log(`   Model: ${data.model}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Stop reason: ${data.stop_reason}`);
    console.log();

    console.log('💬 Assistant response:');
    console.log(`   "${data.content[0].text}"`);
    console.log();

    console.log('📈 Token usage:');
    console.log(`   Input tokens: ${data.usage.input_tokens}`);
    console.log(`   Output tokens: ${data.usage.output_tokens}`);
    console.log(`   Total tokens: ${data.usage.input_tokens + data.usage.output_tokens}`);
    console.log();

    // Calculate cost (Z.ai pricing: $0.003 per 1K input, $0.015 per 1K output)
    const inputCost = (data.usage.input_tokens / 1000) * 0.003;
    const outputCost = (data.usage.output_tokens / 1000) * 0.015;
    const totalCost = inputCost + outputCost;
    console.log('💰 Estimated cost:');
    console.log(`   $${totalCost.toFixed(6)}`);
    console.log();

    console.log('⏰ Check Z.ai billing dashboard NOW:');
    console.log('   https://z.ai/manage-apikey/billing');
    console.log();
    console.log('🔍 Look for transaction with:');
    console.log(`   - Timestamp: ${new Date().toISOString()}`);
    console.log(`   - Cost: ~$${totalCost.toFixed(6)}`);
    console.log(`   - Input tokens: ${data.usage.input_tokens}`);
    console.log(`   - Output tokens: ${data.usage.output_tokens}`);
    console.log();

  } catch (error) {
    console.error('❌ Error making API call:', error.message);
    process.exit(1);
  }
}

testZaiDirectCall();
