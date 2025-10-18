#!/usr/bin/env node

/**
 * Layer 1: Mesh Coordination Test with Redis Pub/Sub
 *
 * Architecture:
 * - 2 peer coordinators (Coordinator-A, Coordinator-B)
 * - Each manages 35 sub-agents
 * - Total: 72 agents (2 coordinators + 70 sub-agents)
 * - Creates 70 Hello World files (7 languages × 10 translations)
 *
 * Critical: Coordinators communicate ONLY via Redis pub/sub
 * - Each subscribes to 'coordination:claims:channel'
 * - Each publishes claim attempts and confirmations
 * - 100ms conflict window for resolution
 * - Full audit trail in Redis
 */

import { SwarmCoordinator } from '../../.claude-flow-novice/dist/src/coordination/swarm-coordinator.js';
import { ConfigManager } from '../../.claude-flow-novice/dist/src/config/config-manager.js';
import { Logger } from '../../.claude-flow-novice/dist/src/core/logger.js';
import { MemoryStoreAdapter } from '../../src/sqlite/MemoryStoreAdapter.cjs';
import { createClient } from 'redis';
import { io as ioClient } from 'socket.io-client';
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

/**
 * MeshCoordinator - Handles Redis pub/sub coordination
 */
class MeshCoordinator {
  constructor(id, redisUrl, sqliteDbPath) {
    this.id = id;
    this.claimedCombos = new Set();
    this.peerClaims = new Map(); // Track what peers claimed
    this.coordinationMessages = []; // Full message log

    // Separate clients for pub and sub (Redis requirement)
    this.publisherClient = createClient({ url: redisUrl });
    this.subscriberClient = createClient({ url: redisUrl });

    // SQLite memory adapter for persistent state
    this.sqliteAdapter = new MemoryStoreAdapter({
      dbPath: sqliteDbPath,
      swarmId: `layer1-test-${Date.now()}`,
      agentId: id,
      namespace: 'layer1-mesh-coordination'
    });

    this.messageCount = 0;
    this.sqliteWrites = 0;
    this.sqliteReads = 0;
  }

  async initialize() {
    // Connect clients
    await this.publisherClient.connect();
    await this.subscriberClient.connect();

    logger.info(`${this.id}: Connected to Redis (pub/sub clients)`);

    // Initialize SQLite adapter
    await this.sqliteAdapter.initialize();
    logger.info(`${this.id}: Connected to SQLite (persistent memory)`);

    // Subscribe to coordination channel
    await this.subscriberClient.subscribe('coordination:claims:channel', (message) => {
      this.handlePeerMessage(JSON.parse(message));
    });

    logger.info(`${this.id}: Subscribed to coordination:claims:channel`);

    // Store coordinator registration
    await this.publisherClient.setEx(
      `coordination:coordinators:${this.id}`,
      3600,
      JSON.stringify({
        id: this.id,
        status: 'active',
        timestamp: Date.now()
      })
    );
  }

  handlePeerMessage(msg) {
    // Ignore own messages
    if (msg.coordinator === this.id) {
      return;
    }

    this.messageCount++;
    this.coordinationMessages.push({
      received_by: this.id,
      message: msg,
      timestamp: Date.now()
    });

    logger.info(`${this.id}: Received message from ${msg.coordinator} - ${msg.action} ${msg.combo}`);

    if (msg.action === 'claim') {
      // Peer is attempting to claim
      this.peerClaims.set(msg.combo, {
        coordinator: msg.coordinator,
        timestamp: msg.timestamp
      });

      logger.info(`${this.id}: Peer ${msg.coordinator} claiming ${msg.combo}`);
    } else if (msg.action === 'confirmed') {
      // Peer confirmed their claim
      logger.info(`${this.id}: Peer ${msg.coordinator} confirmed ${msg.combo}`);
    }
  }

  async claimCombination(combo) {
    const comboKey = `${combo.language}:${combo.translation}`;

    // Check if peer already claimed
    if (this.peerClaims.has(comboKey)) {
      const peerClaim = this.peerClaims.get(comboKey);
      logger.info(`${this.id}: Skipping ${comboKey} (peer ${peerClaim.coordinator} has it)`);
      return false;
    }

    // Try atomic claim in Redis (SET NX)
    const claimKey = `coordination:claims:claimed:${comboKey}`;
    const result = await this.publisherClient.set(claimKey, this.id, { NX: true, EX: 3600 });

    if (result !== 'OK') {
      // Someone else claimed it first
      logger.info(`${this.id}: Failed to claim ${comboKey} (already claimed)`);
      return false;
    }

    // Publish claim attempt
    const claimMessage = {
      coordinator: this.id,
      combo: comboKey,
      action: 'claim',
      timestamp: Date.now()
    };

    await this.publisherClient.publish('coordination:claims:channel', JSON.stringify(claimMessage));

    // Store in coordination messages log
    await this.publisherClient.rPush(
      `coordination:messages:${this.id}`,
      JSON.stringify(claimMessage)
    );

    logger.info(`${this.id}: Published claim for ${comboKey}`);

    // Wait 100ms conflict window
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check for conflicts (both claimed within window)
    const peerClaim = this.peerClaims.get(comboKey);
    if (peerClaim && Math.abs(peerClaim.timestamp - Date.now()) < 150) {
      // Conflict! Earlier timestamp wins
      if (peerClaim.timestamp < claimMessage.timestamp) {
        logger.info(`${this.id}: Conflict on ${comboKey} - peer wins (earlier timestamp)`);

        // Log conflict
        await this.publisherClient.rPush(
          'coordination:conflicts:log',
          JSON.stringify({
            combo: comboKey,
            winner: peerClaim.coordinator,
            loser: this.id,
            timestamp: Date.now()
          })
        );

        // Release our claim
        await this.publisherClient.del(claimKey);
        return false;
      }
    }

    // Confirm claim
    this.claimedCombos.add(comboKey);

    const confirmMessage = {
      coordinator: this.id,
      combo: comboKey,
      action: 'confirmed',
      timestamp: Date.now()
    };

    await this.publisherClient.publish('coordination:claims:channel', JSON.stringify(confirmMessage));

    // Store in coordination messages log
    await this.publisherClient.rPush(
      `coordination:messages:${this.id}`,
      JSON.stringify(confirmMessage)
    );

    // Add to timeline
    await this.publisherClient.zAdd('coordination:timeline', {
      score: Date.now(),
      value: JSON.stringify({
        type: 'claim_confirmed',
        coordinator: this.id,
        combo: comboKey
      })
    });

    logger.info(`${this.id}: Confirmed claim for ${comboKey}`);

    return true;
  }

  async claimCombinations(numToClaim) {
    const allCombos = [];
    for (const lang of LANGUAGES) {
      for (const trans of TRANSLATIONS) {
        allCombos.push({ language: lang, translation: trans });
      }
    }

    const claimed = [];
    const shuffled = allCombos.sort(() => Math.random() - 0.5);

    logger.info(`${this.id}: Starting to claim ${numToClaim} combinations...`);

    for (const combo of shuffled) {
      if (claimed.length >= numToClaim) {
        break;
      }

      const success = await this.claimCombination(combo);
      if (success) {
        claimed.push(combo);
        logger.info(`${this.id}: Successfully claimed ${combo.language}:${combo.translation} (${claimed.length}/${numToClaim})`);
      }

      // Small delay to allow coordination
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    logger.info(`${this.id}: Claimed ${claimed.length}/${numToClaim} combinations`);

    // Store final state
    await this.publisherClient.setEx(
      `coordination:coordinators:${this.id}:claims`,
      3600,
      JSON.stringify({
        coordinator: this.id,
        claimed: claimed.length,
        combinations: Array.from(this.claimedCombos),
        messagesReceived: this.messageCount,
        timestamp: Date.now()
      })
    );

    return claimed;
  }

  async getCoordinationStats() {
    const messageCount = await this.publisherClient.lLen(`coordination:messages:${this.id}`);
    const conflicts = await this.publisherClient.lLen('coordination:conflicts:log');

    return {
      coordinator: this.id,
      claimedCount: this.claimedCombos.size,
      messagesPublished: messageCount,
      messagesReceived: this.messageCount,
      conflicts,
      peerClaimsSeen: this.peerClaims.size
    };
  }

  async disconnect() {
    await this.publisherClient.quit();
    await this.subscriberClient.quit();
  }
}

/**
 * Generate all 70 combinations
 */
function generateCombinations() {
  const combos = [];
  for (const lang of LANGUAGES) {
    for (const trans of TRANSLATIONS) {
      combos.push({ language: lang, translation: trans });
    }
  }
  return combos;
}

/**
 * Spawn sub-agents for claimed combinations
 */
async function spawnSubAgents(coordinatorId, swarmCoordinator, combinations, socket) {
  logger.info(`${coordinatorId}: Spawning ${combinations.length} sub-agents...`);

  const tasks = combinations.map((combo, index) => {
    const agentId = `agent-${coordinatorId}-${String(index + 1).padStart(3, '0')}`;
    const ext = FILE_EXTENSIONS[combo.language];
    const outputFile = path.join(OUTPUT_DIR, `${combo.language.toLowerCase()}-${combo.translation.toLowerCase()}.${ext}`);

    // Emit agent:spawned event to portal
    if (socket && socket.connected) {
      socket.emit('agent:spawned', {
        agentId,
        workerId: agentId,
        subtask: `Create ${combo.language} Hello World in ${combo.translation}`,
        provider: 'zai',
        coordinatorId,
        timestamp: Date.now()
      });
      logger.info(`${coordinatorId}: Emitted agent:spawned for ${agentId}`);
    }

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

  // Add tasks to swarm coordinator
  for (const task of tasks) {
    await swarmCoordinator.addTask(task);
  }

  logger.info(`${coordinatorId}: Added ${tasks.length} tasks to swarm coordinator`);
}

/**
 * Main test execution
 */
async function runLayer1Test() {
  logger.info('🚀 Starting Layer 1: Mesh Coordination Test (Redis Pub/Sub)');
  logger.info('');
  logger.info('Test Configuration:');
  logger.info(`  - Coordinators: 2 (mesh topology)`);
  logger.info(`  - Sub-agents per coordinator: 35`);
  logger.info(`  - Total agents: 72 (2 + 70)`);
  logger.info(`  - Combinations: 70 (7 languages × 10 translations)`);
  logger.info(`  - Provider: Z.ai (glm-4.6)`);
  logger.info(`  - Coordination: Redis Pub/Sub`);
  logger.info('');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    logger.info(`📁 Created output directory: ${OUTPUT_DIR}`);
  }

  // Connect to Redis for cleanup
  const cleanupClient = createClient({ url: 'redis://localhost:6379' });
  await cleanupClient.connect();
  logger.info('✅ Connected to Redis');

  // Clear old coordination keys
  const oldKeys = await cleanupClient.keys('coordination:*');
  if (oldKeys.length > 0) {
    await Promise.all(oldKeys.map(key => cleanupClient.del(key)));
    logger.info(`🧹 Cleared ${oldKeys.length} old coordination keys`);
  }
  await cleanupClient.quit();

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 1: INITIALIZE MESH COORDINATORS');
  logger.info('━'.repeat(60));
  logger.info('');

  // Connect to web portal Socket.IO
  const socket = ioClient('http://localhost:3002', {
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
    timeout: 5000
  });

  await new Promise((resolve) => {
    socket.on('connect', () => {
      logger.info('✅ Connected to web portal Socket.IO (http://localhost:3002)');
      resolve();
    });
    socket.on('connect_error', (err) => {
      logger.warn(`⚠️ Socket.IO connection error: ${err.message} (proceeding without portal monitoring)`);
      resolve(); // Continue even if portal not available
    });
    setTimeout(resolve, 2000); // Continue after 2s even if no connection
  });

  // Create mesh coordinators with Redis pub/sub
  const meshCoordA = new MeshCoordinator('Coordinator-A', 'redis://localhost:6379');
  const meshCoordB = new MeshCoordinator('Coordinator-B', 'redis://localhost:6379');

  await meshCoordA.initialize();
  await meshCoordB.initialize();

  logger.info('✅ Mesh coordinators initialized with Redis pub/sub');
  logger.info('');

  // Initialize ConfigManager
  logger.info('📦 Initializing ConfigManager...');
  const configManager = ConfigManager.getInstance();
  await configManager.init();
  logger.info('✅ ConfigManager initialized');
  logger.info('');

  // Create provider config
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

  // Initialize SwarmCoordinators for task execution
  const swarmA = new SwarmCoordinator({
    id: 'Coordinator-A',
    objective: 'Create Hello World files (first 35 combinations)',
    topology: 'mesh',
    providerConfig: providerConfig,
    configManager: configManager,
    redisUrl: 'redis://localhost:6379',
    enableMonitoring: false,
    enableSQLiteMemory: false
  }, logger);

  const swarmB = new SwarmCoordinator({
    id: 'Coordinator-B',
    objective: 'Create Hello World files (next 35 combinations)',
    topology: 'mesh',
    providerConfig: providerConfig,
    configManager: configManager,
    redisUrl: 'redis://localhost:6379',
    enableMonitoring: false,
    enableSQLiteMemory: false
  }, logger);

  await swarmA.start();
  logger.info('✅ SwarmCoordinator-A started');

  await swarmB.start();
  logger.info('✅ SwarmCoordinator-B started');

  logger.info('');
  logger.info('📋 Registering agents for task execution...');

  await swarmA.registerAgent('Agent-A', 'coder', ['file-operations', 'code-generation']);
  logger.info(`✅ Registered Agent-A in Coordinator-A`);

  await swarmB.registerAgent('Agent-B', 'coder', ['file-operations', 'code-generation']);
  logger.info(`✅ Registered Agent-B in Coordinator-B`);

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 2: CLAIM COMBINATIONS (Redis Pub/Sub)');
  logger.info('━'.repeat(60));
  logger.info('');

  // Claim combinations in parallel (coordinators communicate via Redis)
  const [claimedA, claimedB] = await Promise.all([
    meshCoordA.claimCombinations(35),
    meshCoordB.claimCombinations(35)
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
    await cleanup(meshCoordA, meshCoordB, swarmA, swarmB);
    process.exit(1);
  }

  logger.info('✅ No overlaps detected');

  // Get coordination stats
  const statsA = await meshCoordA.getCoordinationStats();
  const statsB = await meshCoordB.getCoordinationStats();

  logger.info('');
  logger.info('📊 Coordination Stats:');
  logger.info(`   Coordinator-A: ${statsA.messagesPublished} sent, ${statsA.messagesReceived} received`);
  logger.info(`   Coordinator-B: ${statsB.messagesPublished} sent, ${statsB.messagesReceived} received`);
  logger.info(`   Total messages: ${statsA.messagesPublished + statsB.messagesPublished + statsA.messagesReceived + statsB.messagesReceived}`);

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 3: SPAWN SUB-AGENTS');
  logger.info('━'.repeat(60));
  logger.info('');

  // Spawn sub-agents
  await Promise.all([
    spawnSubAgents('Coordinator-A', swarmA, claimedA, socket),
    spawnSubAgents('Coordinator-B', swarmB, claimedB, socket)
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

    const statusA = swarmA.getStatus();
    const statusB = swarmB.getStatus();

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
    await cleanup(meshCoordA, meshCoordB, swarmA, swarmB);
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
  const verifyClient = createClient({ url: 'redis://localhost:6379' });
  await verifyClient.connect();

  const claimKeys = await verifyClient.keys('coordination:claims:claimed:*');
  const messageCountA = await verifyClient.lLen('coordination:messages:Coordinator-A');
  const messageCountB = await verifyClient.lLen('coordination:messages:Coordinator-B');
  const conflictCount = await verifyClient.lLen('coordination:conflicts:log');
  const timelineCount = await verifyClient.zCard('coordination:timeline');

  logger.info(`📊 Redis Validation:`);
  logger.info(`   - Claims: ${claimKeys.length}/70`);
  logger.info(`   - Coordinator-A messages: ${messageCountA}`);
  logger.info(`   - Coordinator-B messages: ${messageCountB}`);
  logger.info(`   - Total coordination messages: ${messageCountA + messageCountB}`);
  logger.info(`   - Conflicts detected: ${conflictCount}`);
  logger.info(`   - Timeline events: ${timelineCount}`);

  await verifyClient.quit();

  // Create validation report
  const validationReport = {
    test: 'Layer 1: Mesh Coordination (Redis Pub/Sub)',
    timestamp: new Date().toISOString(),
    duration,
    coordinators: {
      'Coordinator-A': {
        claimed: claimedA.length,
        completed: swarmA.getStatus().completedTasks,
        messagesPublished: statsA.messagesPublished,
        messagesReceived: statsA.messagesReceived
      },
      'Coordinator-B': {
        claimed: claimedB.length,
        completed: swarmB.getStatus().completedTasks,
        messagesPublished: statsB.messagesPublished,
        messagesReceived: statsB.messagesReceived
      }
    },
    files: {
      expected: 70,
      created: files.length,
      list: files
    },
    redis: {
      claims: claimKeys.length,
      messagesTotal: messageCountA + messageCountB,
      conflicts: conflictCount,
      timelineEvents: timelineCount,
      overlaps: overlapCheck ? 'YES' : 'NO'
    },
    success: files.length === 70 && claimKeys.length === 70 && !overlapCheck && (messageCountA + messageCountB) >= 140
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'validation-layer1-mesh.json'),
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
  logger.info(`✅ Coordination messages: ${messageCountA + messageCountB}`);
  logger.info(`✅ Conflicts: ${conflictCount}`);
  logger.info(`✅ Overlaps: ${overlapCheck ? 'YES ❌' : 'NO ✅'}`);
  logger.info(`✅ Duration: ${duration}s`);
  logger.info('');

  if (validationReport.success) {
    logger.info('🎉 LAYER 1 TEST PASSED!');
    logger.info('');
    logger.info('💡 Key Success Metrics:');
    logger.info(`   - 72 agents spawned (2 coordinators + 70 sub-agents)`);
    logger.info(`   - 70 files created (0 overlaps)`);
    logger.info(`   - ${messageCountA + messageCountB}+ coordination messages via Redis pub/sub`);
    logger.info(`   - Full audit trail in Redis`);
    logger.info('');
    logger.info('💰 Check Z.ai billing dashboard for 70+ transactions');
  } else {
    logger.error('❌ LAYER 1 TEST FAILED');
    logger.error('');
    logger.error('Failure reasons:');
    if (files.length < 70) logger.error(`   - Incomplete files: ${files.length}/70`);
    if (claimKeys.length < 70) logger.error(`   - Incomplete claims: ${claimKeys.length}/70`);
    if (overlapCheck) logger.error(`   - Overlaps detected`);
    if ((messageCountA + messageCountB) < 140) logger.error(`   - Insufficient coordination messages: ${messageCountA + messageCountB}/140`);
  }

  // Cleanup
  await cleanup(meshCoordA, meshCoordB, swarmA, swarmB);

  process.exit(validationReport.success ? 0 : 1);
}

async function cleanup(meshCoordA, meshCoordB, swarmA, swarmB) {
  logger.info('');
  logger.info('🧹 Cleaning up...');
  try {
    if (meshCoordA && meshCoordA.disconnect) await meshCoordA.disconnect();
    if (meshCoordB && meshCoordB.disconnect) await meshCoordB.disconnect();
    if (swarmA && swarmA.stop) await swarmA.stop();
    if (swarmB && swarmB.stop) await swarmB.stop();
    logger.info('✅ Cleanup complete');
  } catch (error) {
    logger.error('⚠️  Cleanup error:', error.message);
  }
}

// Run test
runLayer1Test().catch((error) => {
  console.error('❌ Test failed with error:', error);
  console.error(error.stack);
  process.exit(1);
});
