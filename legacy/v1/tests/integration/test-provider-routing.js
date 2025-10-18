#!/usr/bin/env node

/**
 * Test provider routing to verify Z.ai is being used
 */

import { ProviderManager } from './.claude-flow-novice/dist/src/providers/provider-manager.js';

async function testProviderRouting() {
  console.log('🧪 Testing Provider Routing\n');
  
  try {
    // Initialize provider manager with Z.ai config
    const manager = new ProviderManager({
      zai: {
        apiKey: process.env.Z_AI_API_KEY || process.env.ZAI_API_KEY,
        model: 'glm-4.6',
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'haiku',
      },
      routing: {
        enabled: true,
        agentType: 'researcher', // Should route to Z.ai
      },
    });

    console.log('📋 Sending test message to researcher agent (should use Z.ai)...\n');

    const response = await manager.complete({
      messages: [
        { role: 'user', content: 'What model and provider are you? Reply with ONLY the model name and provider name.' }
      ],
      agentType: 'researcher',
      maxTokens: 50,
    });

    console.log('✅ Response received!\n');
    console.log('📊 Provider Used:', response.provider);
    console.log('📊 Model:', response.model);
    console.log('💬 Response:', response.content);
    console.log('💰 Cost:', `$${response.cost.totalCost.toFixed(6)}`);
    console.log('📈 Tokens:', response.usage.totalTokens);
    
    console.log('\n✅ Z.ai routing is working! Check billing at https://z.ai/manage-apikey/billing');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testProviderRouting();
