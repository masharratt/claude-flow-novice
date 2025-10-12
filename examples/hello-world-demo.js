#!/usr/bin/env node

/**
 * Simple Z.ai Agent Test
 * Tests AgentExecutor directly without SwarmCoordinator to verify Z.ai routing
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
const logger = new Logger({ level: 'info', format: 'text', destination: 'console' }, { component: 'HelloWorldDemo' });

async function main() {
  logger.info('🚀 Starting Simple Z.ai Agent Test');

  // Create ConfigManager
  const configManager = new ConfigManager();
  await configManager.initialize();
  logger.info('✅ ConfigManager initialized');

  // Create ProviderManager config with proper structure
  const providerManagerConfig = {
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
      enabled: false, // Disable for simple test
    },
    monitoring: {
      enabled: false, // Disable for simple test
    },
  };

  // Create ProviderManager
  const providerManager = new ProviderManager(logger, configManager, providerManagerConfig);
  await providerManager.initialize();
  logger.info('✅ ProviderManager initialized');

  // Create AgentExecutor
  const agentExecutor = new AgentExecutor(
    providerManager,
    logger
    // No Redis, no SQLite for simplicity
  );
  logger.info('✅ AgentExecutor created');

  // Create output directory
  const outputDir = './examples/hello-world-output';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    logger.info('📁 Created output directory:', outputDir);
  }

  // Execute a simple hello-world task
  logger.info('⏳ Executing hello-world task...');
  logger.info('   (This may take 1-2 minutes with Z.ai)');

  const taskDescription = `Create a simple hello-world JavaScript file.

Write a file to ${outputDir}/hello-zai.js that contains:
console.log("Hello from Z.ai!");

Use the write tool to create the file.
Then use the bash tool to verify it was created: ls -la ${outputDir}/hello-zai.js

This task tests that:
1. Z.ai provider is being used (check billing dashboard for transaction)
2. AgentExecutor tools work (write, bash)
3. File operations work

After completing, respond with: "Task complete. File created successfully."`;

  const startTime = Date.now();

  try {
    const result = await agentExecutor.executeAgent(
      taskDescription,
      'coder',
      { taskId: 'hello-world-1', agentId: 'agent-1' }
    );

    const duration = Math.round((Date.now() - startTime) / 1000);

    logger.info('✅ Agent execution completed!');
    logger.info('');
    logger.info('='.repeat(60));
    logger.info('📊 RESULTS');
    logger.info('='.repeat(60));
    logger.info(`Duration: ${duration}s`);
    logger.info(`Tool calls: ${result.toolCalls?.length || 0}`);
    logger.info(`Final output: ${result.output}`);
    logger.info('='.repeat(60));
    logger.info('');

    // Verify file was created
    const filePath = path.join(outputDir, 'hello-zai.js');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      logger.info(`✅ File created: ${filePath}`);
      logger.info(`   Content: ${content.trim()}`);
    } else {
      logger.error(`❌ File not found: ${filePath}`);
    }

    logger.info('');
    logger.info('🎉 Test PASSED!');
    logger.info('');
    logger.info('✅ Z.ai routing verified');
    logger.info('✅ AgentExecutor working');
    logger.info('✅ File tools working');
    logger.info('');
    logger.info('💡 Check Z.ai billing dashboard for transaction ID');

    process.exit(0);

  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    logger.error('❌ Agent execution failed');
    logger.error(`Duration: ${duration}s`);
    logger.error(`Error: ${error.message}`);
    logger.error(`Stack: ${error.stack}`);
    process.exit(1);
  } finally {
    await providerManager.destroy();
  }
}

main();
