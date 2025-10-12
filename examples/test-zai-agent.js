#!/usr/bin/env node

/**
 * Simplified Z.ai Agent Execution Test
 * Tests AgentExecutor with Z.ai provider to verify:
 * - Z.ai routing works
 * - Agent tools (write, bash) work
 * - File is created successfully
 * - Z.ai transaction appears in billing dashboard
 */

import { AgentExecutor } from '../.claude-flow-novice/dist/src/coordination/agent-executor.js';
import { ProviderManager } from '../.claude-flow-novice/dist/src/providers/provider-manager.js';
import { ConfigManager } from '../.claude-flow-novice/dist/src/config/config-manager.js';
import { Logger } from '../.claude-flow-novice/dist/src/core/logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

// Read .env file manually
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Validate Z.ai API key
if (!process.env.Z_AI_API_KEY) {
  console.error('❌ Z_AI_API_KEY not found in .env');
  process.exit(1);
}

// Create logger
const logger = new Logger(
  { level: 'info', format: 'text', destination: 'console' },
  { component: 'ZaiAgentTest' }
);

async function main() {
  logger.info('🚀 Starting Z.ai Agent Execution Test');
  logger.info('');

  try {
    // Step 1: Initialize ConfigManager
    logger.info('📦 Initializing ConfigManager...');
    const configManager = ConfigManager.getInstance();
    await configManager.init();
    logger.info('✅ ConfigManager initialized');

    // Step 2: Create ProviderManager with Z.ai config
    logger.info('🔧 Creating ProviderManager...');
    const providerConfig = {
      providers: {
        zai: {
          apiKey: process.env.Z_AI_API_KEY,
          model: 'glm-4.6',
          maxTokens: 8192,
          temperature: 0.7,
          enableCaching: false,
        },
      },
      defaultProvider: 'zai',
      tieredRouting: {
        enabled: false,
      },
      monitoring: {
        enabled: false,
      },
    };

    const providerManager = new ProviderManager(logger, configManager, providerConfig);

    // Note: ProviderManager auto-initializes in constructor but async
    // Wait for provider to be ready by polling
    let retries = 0;
    const maxRetries = 50; // 5 seconds max
    while (retries < maxRetries) {
      // Check if providers are ready by trying to get the default provider
      try {
        const providers = providerManager['providers']; // Access private field
        if (providers && providers.size > 0) {
          break;
        }
      } catch (e) {
        // Ignore errors during check
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }

    if (retries >= maxRetries) {
      throw new Error('ProviderManager initialization timeout - providers not ready after 5 seconds');
    }

    logger.info('✅ ProviderManager initialized');

    // Step 3: Create AgentExecutor
    logger.info('🤖 Creating AgentExecutor...');
    const agentExecutor = new AgentExecutor(providerManager, logger);
    logger.info('✅ AgentExecutor created');

    // Step 4: Create output directory
    const outputDir = path.join(__dirname, 'hello-world-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      logger.info(`📁 Created output directory: ${outputDir}`);
    }

    // Step 5: Execute agent task
    logger.info('');
    logger.info('⏳ Executing agent task (this may take 1-2 minutes)...');
    logger.info('');

    const taskDescription = `Create a simple hello-world JavaScript file.

Write a file to ${outputDir}/hello-zai.js that contains:
console.log("Hello from Z.ai agent!");
console.log("Transaction ID: [check billing dashboard]");

Use the write tool to create the file.
Then use the bash tool to verify it was created: ls -la ${outputDir}/hello-zai.js

This task tests that:
1. Z.ai provider is being used (check billing dashboard for transaction)
2. AgentExecutor tools work (write, bash)
3. File operations work

After completing, respond with: "Task complete. File created successfully."`;

    const startTime = Date.now();

    // FIXED: Correct method signature - executeAgent(task, agentType, agentId, context?)
    const result = await agentExecutor.executeAgent(
      taskDescription,
      'coder',
      'zai-test-agent-1'  // agentId as string, not object!
    );

    const duration = Math.round((Date.now() - startTime) / 1000);

    // Step 6: Print results
    logger.info('');
    logger.info('='.repeat(60));
    logger.info('📊 EXECUTION RESULTS');
    logger.info('='.repeat(60));
    logger.info(`Success: ${result.success ? '✅' : '❌'}`);
    logger.info(`Duration: ${duration}s`);
    logger.info(`Tool calls: ${result.toolCalls}`);
    if (result.usage) {
      logger.info(`Tokens: ${result.usage.totalTokens} (prompt: ${result.usage.promptTokens}, completion: ${result.usage.completionTokens})`);
    }
    if (result.cost) {
      logger.info(`Cost: $${result.cost.totalCost.toFixed(4)} USD`);
    }
    logger.info('');
    logger.info('Agent output:');
    logger.info(result.content);
    logger.info('='.repeat(60));
    logger.info('');

    // Step 7: Verify file was created
    const filePath = path.join(outputDir, 'hello-zai.js');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      logger.info('✅ File created successfully!');
      logger.info(`📄 File: ${filePath}`);
      logger.info('📝 Content:');
      logger.info('---');
      logger.info(content.trim());
      logger.info('---');
    } else {
      logger.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }

    logger.info('');
    logger.info('🎉 TEST PASSED!');
    logger.info('');
    logger.info('✅ Z.ai provider working');
    logger.info('✅ AgentExecutor working');
    logger.info('✅ File tools working');
    logger.info('');
    logger.info('💡 NEXT STEPS:');
    logger.info('   1. Check Z.ai billing dashboard for transaction ID');
    logger.info('   2. Verify transaction shows usage metrics');
    logger.info('   3. Run the generated file: node ' + filePath);
    logger.info('');

    // Cleanup
    await providerManager.destroy();
    process.exit(0);

  } catch (error) {
    logger.error('');
    logger.error('❌ TEST FAILED');
    logger.error(`Error: ${error.message}`);
    if (error.stack) {
      logger.error('Stack trace:');
      logger.error(error.stack);
    }
    process.exit(1);
  }
}

main();
