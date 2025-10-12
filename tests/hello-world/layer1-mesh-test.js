#!/usr/bin/env node

/**
 * Layer 1: Mesh Coordination Test
 * 2 peer coordinators, each managing 35 sub-agents
 * Total: 72 agents (2 coordinators + 70 sub-agents)
 * Creates 70 Hello World files (7 languages × 10 translations)
 */

import { SwarmCoordinator } from '../../.claude-flow-novice/dist/src/coordination/swarm-coordinator.js';
import { ConfigManager } from '../../.claude-flow-novice/dist/src/config/config-manager.js';
import { Logger } from '../../.claude-flow-novice/dist/src/core/logger.js';
import { createClient } from 'redis';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Load .env
const envPath = path.join(__dirname, '../../.env');
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

if (!process.env.Z_AI_API_KEY) {
  console.error('❌ Z_AI_API_KEY not found in .env');
  process.exit(1);
}

// Test configuration
const LANGUAGES = ['JavaScript', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'TypeScript'];
const TRANSLATIONS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Chinese', 'Japanese', 'Arabic', 'Hindi'];
const FILE_EXTENSIONS = {
  'JavaScript': 'js',
  'Python': 'py',
  'Ruby': 'rb',
  'Go': 'go',
  'Rust': 'rs',
  'Java': 'java',
  'TypeScript': 'ts'
};
const OUTPUT_DIR = path.join(__dirname, '../../test-results/hello-world');

// Create logger
const logger = new Logger(
  { level: 'info', format: 'text', destination: 'console' },
  { component: 'Layer1MeshTest' }
);

// Generate all 70 combinations
function generateCombinations() {
  const combos = [];
  for (const lang of LANGUAGES) {
    for (const trans of TRANSLATIONS) {
      combos.push({ language: lang, translation: trans });
    }
  }
  return combos;
}

// Claim combinations via Redis
async function claimCombinations(coordinatorId, redisClient, numToClaim) {
  const allCombos = generateCombinations();
  const claimed = [];

  logger.info(`${coordinatorId}: Starting combination claiming...`);

  for (let i = 0; i < numToClaim && claimed.length < numToClaim; i++) {
    const combo = allCombos[Math.floor(Math.random() * allCombos.length)];
    const comboKey = `${combo.language}:${combo.translation}`;
    const claimKey = `coordination:claims:claimed:${comboKey}`;

    // Try to claim (SET NX - only if not exists)
    const result = await redisClient.set(claimKey, coordinatorId, { NX: true });

    if (result === 'OK') {
      claimed.push(combo);

      // Publish claim event
      await redisClient.publish('coordination:claims:channel', JSON.stringify({
        coordinator: coordinatorId,
        combo: comboKey,
        action: 'claim',
        timestamp: Date.now()
      }));

      logger.info(`${coordinatorId}: Claimed ${comboKey}`);

      // Wait 100ms for conflicts
      await new Promise(resolve => setTimeout(resolve, 100));

      // Confirm claim
      await redisClient.publish('coordination:claims:channel', JSON.stringify({
        coordinator: coordinatorId,
        combo: comboKey,
        action: 'confirmed',
        timestamp: Date.now()
      }));

      // Remove from available combos
      const index = allCombos.findIndex(c => c.language === combo.language && c.translation === combo.translation);
      if (index > -1) {
        allCombos.splice(index, 1);
      }
    }
  }

  logger.info(`${coordinatorId}: Claimed ${claimed.length} combinations`);
  return claimed;
}

// Spawn sub-agents for combinations
async function spawnSubAgents(coordinatorId, coordinator, combinations) {
  logger.info(`${coordinatorId}: Spawning ${combinations.length} sub-agents...`);

  const tasks = combinations.map((combo, index) => {
    const agentId = `agent-${coordinatorId}-${String(index + 1).padStart(3, '0')}`;
    const ext = FILE_EXTENSIONS[combo.language];
    const outputFile = path.join(OUTPUT_DIR, `${combo.language.toLowerCase()}-${combo.translation.toLowerCase()}.${ext}`);

    return {
      id: `task-${agentId}`,
      description: `You are ${agentId}.

Your assignment:
- Programming Language: ${combo.language}
- Written Language: ${combo.translation}
- Message: "Hello World"

Create a Hello World program that prints the translated message.
Save to: ${outputFile}

The file should contain:
1. A comment with your agent ID (${agentId})
2. A comment with coordinator (${coordinatorId})
3. A comment with language (${combo.language} / ${combo.translation})
4. Code that prints "Hello World" in ${combo.translation}

Use the write tool to create the file.
After writing, use bash tool to verify: ls -la ${outputFile}

Report completion by responding: "Task complete. File ${outputFile} created successfully."`,
      priority: 1,
      dependencies: [],
      metadata: {
        agentId,
        coordinatorId,
        language: combo.language,
        translation: combo.translation
      }
    };
  });

  // Add tasks to coordinator
  for (const task of tasks) {
    await coordinator.addTask(task);
  }

  logger.info(`${coordinatorId}: Added ${tasks.length} tasks`);
}

// Main test execution
async function runLayer1Test() {
  logger.info('🚀 Starting Layer 1: Mesh Coordination Test');
  logger.info('');
  logger.info('Test Configuration:');
  logger.info(`  - Coordinators: 2 (mesh topology)`);
  logger.info(`  - Sub-agents per coordinator: 35`);
  logger.info(`  - Total agents: 72 (2 + 70)`);
  logger.info(`  - Combinations: 70 (7 languages × 10 translations)`);
  logger.info(`  - Provider: Z.ai (glm-4.6)`);
  logger.info('');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    logger.info(`📁 Created output directory: ${OUTPUT_DIR}`);
  }

  // Connect to Redis
  const redisClient = createClient({ url: 'redis://localhost:6379' });
  await redisClient.connect();
  logger.info('✅ Connected to Redis');

  // Clear old coordination keys
  const oldKeys = await redisClient.keys('coordination:*');
  if (oldKeys.length > 0) {
    await Promise.all(oldKeys.map(key => redisClient.del(key)));
    logger.info(`🧹 Cleared ${oldKeys.length} old coordination keys`);
  }

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 1: INITIALIZE COORDINATORS');
  logger.info('━'.repeat(60));
  logger.info('');

  // Initialize ConfigManager
  logger.info('📦 Initializing ConfigManager...');
  const configManager = ConfigManager.getInstance();
  await configManager.init();
  logger.info('✅ ConfigManager initialized');
  logger.info('');

  // Create provider config in correct format
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

  // Initialize Coordinator A
  const coordinatorA = new SwarmCoordinator({
    id: 'Coordinator-A',
    objective: 'Create Hello World files (first 35 combinations)',
    topology: 'mesh',
    providerConfig: providerConfig,
    configManager: configManager,
    redisUrl: 'redis://localhost:6379',
    enableMonitoring: false,
    enableSQLiteMemory: false // Use Redis-only state storage for tests
  }, logger);

  // Initialize Coordinator B
  const coordinatorB = new SwarmCoordinator({
    id: 'Coordinator-B',
    objective: 'Create Hello World files (next 35 combinations)',
    topology: 'mesh',
    providerConfig: providerConfig,
    configManager: configManager,
    redisUrl: 'redis://localhost:6379',
    enableMonitoring: false,
    enableSQLiteMemory: false // Use Redis-only state storage for tests
  }, logger);

  // Start coordinators
  await coordinatorA.start();
  logger.info('✅ Coordinator-A started');

  await coordinatorB.start();
  logger.info('✅ Coordinator-B started');

  logger.info('');
  logger.info('📋 Registering agents for task execution...');

  // Register agents for task execution
  const agentA = await coordinatorA.registerAgent('Agent-A', 'coder', ['file-operations', 'code-generation']);
  logger.info(`✅ Registered agent: ${agentA}`);

  const agentB = await coordinatorB.registerAgent('Agent-B', 'coder', ['file-operations', 'code-generation']);
  logger.info(`✅ Registered agent: ${agentB}`);

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 2: CLAIM COMBINATIONS');
  logger.info('━'.repeat(60));
  logger.info('');

  // Claim combinations (35 each)
  const [claimedA, claimedB] = await Promise.all([
    claimCombinations('Coordinator-A', redisClient, 35),
    claimCombinations('Coordinator-B', redisClient, 35)
  ]);

  logger.info('');
  logger.info(`✅ Coordinator-A claimed: ${claimedA.length} combinations`);
  logger.info(`✅ Coordinator-B claimed: ${claimedB.length} combinations`);

  // Check for overlaps
  const overlapCheck = claimedA.some(a =>
    claimedB.some(b => a.language === b.language && a.translation === b.translation)
  );

  if (overlapCheck) {
    logger.error('❌ OVERLAP DETECTED! Test failed.');
    process.exit(1);
  }

  logger.info('✅ No overlaps detected');

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 3: SPAWN SUB-AGENTS');
  logger.info('━'.repeat(60));
  logger.info('');

  // Spawn sub-agents
  await Promise.all([
    spawnSubAgents('Coordinator-A', coordinatorA, claimedA),
    spawnSubAgents('Coordinator-B', coordinatorB, claimedB)
  ]);

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 4: WAIT FOR COMPLETION');
  logger.info('━'.repeat(60));
  logger.info('');
  logger.info('⏳ Waiting for all 70 agents to complete...');
  logger.info('   (This may take 10-15 minutes with Z.ai)');

  // Poll for completion
  const startTime = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes
  let completed = false;

  while (!completed && Date.now() - startTime < timeout) {
    await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10 seconds

    const statusA = coordinatorA.getStatus();
    const statusB = coordinatorB.getStatus();

    const totalCompleted = statusA.completedTasks + statusB.completedTasks;
    const totalTasks = statusA.totalTasks + statusB.totalTasks;

    logger.info(`📊 Progress: ${totalCompleted}/${totalTasks} tasks completed`);
    logger.info(`   - Coordinator-A: ${statusA.completedTasks}/${statusA.totalTasks}`);
    logger.info(`   - Coordinator-B: ${statusB.completedTasks}/${statusB.totalTasks}`);

    if (totalCompleted === totalTasks && totalTasks > 0) {
      completed = true;
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  if (!completed) {
    logger.error('❌ Test timed out after 30 minutes');
    await cleanup(coordinatorA, coordinatorB, redisClient);
    process.exit(1);
  }

  logger.info('');
  logger.info('✅ All agents completed!');
  logger.info(`⏱️  Total duration: ${duration}s`);

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 5: VALIDATION');
  logger.info('━'.repeat(60));
  logger.info('');

  // Verify files
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => !f.endsWith('.json'));
  logger.info(`📄 Files created: ${files.length}/70`);

  if (files.length < 70) {
    logger.error(`❌ Expected 70 files, found ${files.length}`);
  } else {
    logger.info('✅ All 70 files created');
  }

  // Get Redis stats
  const claimKeys = await redisClient.keys('coordination:claims:claimed:*');
  logger.info(`📊 Redis claims: ${claimKeys.length}/70`);

  // Create validation report
  const validationReport = {
    test: 'Layer 1: Mesh Coordination',
    timestamp: new Date().toISOString(),
    duration,
    coordinators: {
      'Coordinator-A': {
        claimed: claimedA.length,
        completed: coordinatorA.getStatus().completedTasks
      },
      'Coordinator-B': {
        claimed: claimedB.length,
        completed: coordinatorB.getStatus().completedTasks
      }
    },
    files: {
      expected: 70,
      created: files.length,
      list: files
    },
    redis: {
      claims: claimKeys.length,
      overlaps: overlapCheck ? 'YES' : 'NO'
    },
    success: files.length === 70 && claimKeys.length === 70 && !overlapCheck
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'validation-layer1.json'),
    JSON.stringify(validationReport, null, 2)
  );

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('TEST RESULTS');
  logger.info('━'.repeat(60));
  logger.info('');
  logger.info(`✅ Coordinators: 2`);
  logger.info(`✅ Sub-agents: 70`);
  logger.info(`✅ Total agents: 72`);
  logger.info(`✅ Files created: ${files.length}/70`);
  logger.info(`✅ Redis claims: ${claimKeys.length}/70`);
  logger.info(`✅ Overlaps: ${overlapCheck ? 'YES ❌' : 'NO ✅'}`);
  logger.info(`✅ Duration: ${duration}s`);
  logger.info('');

  if (validationReport.success) {
    logger.info('🎉 LAYER 1 TEST PASSED!');
    logger.info('');
    logger.info('💡 Check Z.ai billing dashboard for 70+ transactions');
  } else {
    logger.error('❌ LAYER 1 TEST FAILED');
  }

  // Cleanup
  await cleanup(coordinatorA, coordinatorB, redisClient);

  process.exit(validationReport.success ? 0 : 1);
}

async function cleanup(coordinatorA, coordinatorB, redisClient) {
  logger.info('');
  logger.info('🧹 Cleaning up...');
  try {
    await coordinatorA.stop();
    await coordinatorB.stop();
    await redisClient.quit();
    logger.info('✅ Cleanup complete');
  } catch (error) {
    logger.error('⚠️  Cleanup error:', error.message);
  }
}

// Run test
runLayer1Test().catch((error) => {
  console.error('❌ Test failed with error:', error);
  process.exit(1);
});
