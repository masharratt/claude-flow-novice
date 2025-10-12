#!/usr/bin/env node

/**
 * Test spawning an agent that uses Z.ai provider directly
 */

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
  process.exit(1);
}

console.log('🧪 Testing Agent Spawn with Z.ai Provider\n');

async function spawnAgentWithZai() {
  const startTime = Date.now();
  
  console.log('📋 Task: Ask the agent what model and provider it is using');
  console.log('🔗 Endpoint: https://api.z.ai/api/anthropic/v1/messages');
  console.log('🔑 Auth: x-api-key (Anthropic-compatible)\n');

  try {
    const response = await fetch('https://api.z.ai/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Z_AI_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'glm-4.6',
        messages: [
          {
            role: 'user',
            content: 'You are a researcher agent. Please tell me: What model are you using right now and who is your provider? Answer in ONE short sentence.'
          }
        ],
        max_tokens: 100
      })
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      console.error(errorText);
      process.exit(1);
    }

    const data = await response.json();

    console.log('✅ Agent spawned and responded!\n');
    console.log('📊 Details:');
    console.log(`   Transaction ID: ${data.id}`);
    console.log(`   Model: ${data.model}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Stop reason: ${data.stop_reason}`);
    console.log();

    console.log('🤖 Agent Response:');
    console.log(`   "${data.content[0].text}"`);
    console.log();

    console.log('📈 Token Usage:');
    console.log(`   Input: ${data.usage.input_tokens}`);
    console.log(`   Output: ${data.usage.output_tokens}`);
    console.log(`   Total: ${data.usage.input_tokens + data.usage.output_tokens}`);
    console.log();

    // Calculate cost
    const inputCost = (data.usage.input_tokens / 1000) * 0.003;
    const outputCost = (data.usage.output_tokens / 1000) * 0.015;
    const totalCost = inputCost + outputCost;
    
    console.log('💰 Cost:');
    console.log(`   $${totalCost.toFixed(6)}`);
    console.log();

    console.log('⏰ Check Z.ai billing dashboard NOW:');
    console.log('   https://z.ai/manage-apikey/billing');
    console.log();
    console.log('🔍 Look for transaction:');
    console.log(`   - ID: ${data.id}`);
    console.log(`   - Timestamp: ${new Date().toISOString()}`);
    console.log(`   - Cost: ~$${totalCost.toFixed(6)}`);
    console.log();
    
    console.log('✅ SUCCESS: Agent used Z.ai provider (glm-4.6 model)!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

spawnAgentWithZai();
