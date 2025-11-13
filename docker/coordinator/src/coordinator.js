#!/usr/bin/env node

/**
 * Intelligent TypeScript Error Coordinator
 * CFN Loop Pattern: Loop 3 (Implement) → Loop 2 (Validate) → Iterate
 *
 * Workflow:
 * 1. Analyze ALL frontend TypeScript errors
 * 2. Build dependency graph
 * 3. Cluster files strategically
 * 4. Create batches with memory tiers
 * 5. Spawn agents in waves (40GB budget)
 * 6. Wait for completion (passive Redis polling)
 * 7. Validate remaining errors
 * 8. If errors > 0: ITERATE, else: PROCEED
 */

const { execSync } = require('child_process');
const Docker = require('dockerode');
const redis = require('redis');

// Configuration from environment
const CONFIG = {
  workspace: '/workspace',
  memoryBudget: process.env.MEMORY_BUDGET || '40g',
  maxIterations: parseInt(process.env.MAX_ITERATIONS) || 10,
  redisHost: process.env.REDIS_HOST || 'cfn-redis',
  redisPort: parseInt(process.env.REDIS_PORT) || 6379,
  networkName: process.env.NETWORK_NAME || 'cfn-network',
  agentImage: process.env.AGENT_IMAGE || 'claude-flow-novice-agent:frontend',
  tierMemory: {
    1: '512m',  // Independent files
    2: '600m',  // Small clusters (2-3 files)
    3: '800m',  // Medium clusters (4-8 files)
    4: '1g'     // Large clusters (9+ files)
  }
};

// Initialize clients
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
let redisClient;

// Utility: Parse memory string to bytes
function parseMemory(memStr) {
  const units = { 'm': 1024 * 1024, 'g': 1024 * 1024 * 1024 };
  const match = memStr.toLowerCase().match(/^(\d+)([mg])$/);
  if (!match) throw new Error(`Invalid memory format: ${memStr}`);
  return parseInt(match[1]) * units[match[2]];
}

// Utility: Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Phase 1: Analyze ALL TypeScript errors in frontend
 * Returns: Map<file, errorCount>
 */
async function analyzeAllErrors() {
  console.log('\n📊 Phase 1: Analyzing TypeScript errors...');

  try {
    const output = execSync(
      'npx tsc --noEmit --project /workspace/tsconfig.json 2>&1',
      { encoding: 'utf8', cwd: '/workspace' }
    );

    // Parse errors: "src/file.tsx(10,5): error TS2345: ..."
    const errorPattern = /(.+?)\(\d+,\d+\): error (TS\d+):/g;
    const errorsByFile = new Map();

    let match;
    while ((match = errorPattern.exec(output)) !== null) {
      const file = match[1];
      errorsByFile.set(file, (errorsByFile.get(file) || 0) + 1);
    }

    const totalErrors = Array.from(errorsByFile.values()).reduce((sum, count) => sum + count, 0);
    console.log(`   Found ${totalErrors} errors across ${errorsByFile.size} files`);

    return errorsByFile;

  } catch (error) {
    // tsc returns non-zero if errors found, parse stdout anyway
    const output = error.stdout || '';
    const errorPattern = /(.+?)\(\d+,\d+\): error (TS\d+):/g;
    const errorsByFile = new Map();

    let match;
    while ((match = errorPattern.exec(output)) !== null) {
      const file = match[1];
      errorsByFile.set(file, (errorsByFile.get(file) || 0) + 1);
    }

    const totalErrors = Array.from(errorsByFile.values()).reduce((sum, count) => sum + count, 0);

    if (totalErrors > 0) {
      console.log(`   Found ${totalErrors} errors across ${errorsByFile.size} files`);
      return errorsByFile;
    }

    // No errors found
    console.log('   ✅ No TypeScript errors found!');
    return new Map();
  }
}

/**
 * Phase 2-3: Build dependency graph and cluster files
 * Simplified version: Cluster by directory proximity
 * (Full implementation would use TypeScript AST parser)
 */
async function clusterFiles(errorsByFile) {
  console.log('\n🔗 Phase 2-3: Clustering files by dependencies...');

  const files = Array.from(errorsByFile.keys());
  const clusters = new Map(); // directory -> files[]

  // Simple clustering: group by directory
  for (const file of files) {
    const dir = file.substring(0, file.lastIndexOf('/')) || 'root';
    if (!clusters.has(dir)) {
      clusters.set(dir, []);
    }
    clusters.get(dir).push(file);
  }

  // Convert to tier-based structure
  const tieredClusters = [];

  for (const [dir, clusterFiles] of clusters.entries()) {
    const size = clusterFiles.length;
    const tier = size === 1 ? 1 : size <= 3 ? 2 : size <= 8 ? 3 : 4;

    tieredClusters.push({
      tier,
      files: clusterFiles,
      errors: clusterFiles.reduce((sum, f) => sum + (errorsByFile.get(f) || 0), 0)
    });
  }

  // Sort by tier (process tier 1 first for max parallelism)
  tieredClusters.sort((a, b) => a.tier - b.tier);

  const tierCounts = tieredClusters.reduce((acc, c) => {
    acc[c.tier] = (acc[c.tier] || 0) + 1;
    return acc;
  }, {});

  console.log(`   Created ${tieredClusters.length} batches:`);
  console.log(`      Tier 1: ${tierCounts[1] || 0} (independent files)`);
  console.log(`      Tier 2: ${tierCounts[2] || 0} (small clusters)`);
  console.log(`      Tier 3: ${tierCounts[3] || 0} (medium clusters)`);
  console.log(`      Tier 4: ${tierCounts[4] || 0} (large clusters)`);

  return tieredClusters;
}

/**
 * Phase 4-5: Create batches and push to Redis
 */
async function pushTasksToRedis(clusters, iteration) {
  console.log('\n📋 Phase 4-5: Pushing tasks to Redis...');

  // Clear previous iteration
  await redisClient.del('task:queue');
  await redisClient.del('task:completed');

  let taskNum = 0;

  for (const cluster of clusters) {
    taskNum++;

    // Create batch metadata
    const batch = {
      batch_id: `iter${iteration}-cluster${taskNum}`,
      tier: cluster.tier,
      memory: CONFIG.tierMemory[cluster.tier],
      files: cluster.files,
      total_errors: cluster.errors,
      iteration
    };

    // Push to queue
    await redisClient.rPush('task:queue', taskNum.toString());

    // Store metadata
    await redisClient.hSet(`task:${taskNum}`, {
      batch_id: batch.batch_id,
      tier: batch.tier.toString(),
      memory: batch.memory,
      files: JSON.stringify(batch.files),
      total_errors: batch.total_errors.toString(),
      iteration: iteration.toString()
    });
  }

  await redisClient.set('task:total', taskNum.toString());
  await redisClient.set('task:completed', '0');

  console.log(`   ✅ Created ${taskNum} tasks for iteration ${iteration}`);

  return taskNum;
}

/**
 * Phase 6: Spawn agents in waves (respecting memory budget)
 */
async function spawnAgents(clusters) {
  console.log('\n🚀 Phase 6: Spawning agent waves...');

  const budgetBytes = parseMemory(CONFIG.memoryBudget);
  let currentWave = 1;
  const batchQueue = [...clusters];

  while (batchQueue.length > 0) {
    const wave = [];
    let waveMemory = 0;

    // Fill wave up to budget
    while (batchQueue.length > 0) {
      const batch = batchQueue[0];
      const batchMemory = parseMemory(CONFIG.tierMemory[batch.tier]);

      if (waveMemory + batchMemory <= budgetBytes) {
        wave.push(batchQueue.shift());
        waveMemory += batchMemory;
      } else {
        break; // Budget full
      }
    }

    const waveMemoryMB = Math.round(waveMemory / (1024 * 1024));
    const budgetMB = Math.round(budgetBytes / (1024 * 1024));
    console.log(`   Wave ${currentWave}: Spawning ${wave.length} agents (${waveMemoryMB}MB / ${budgetMB}MB budget)`);

    // Spawn all agents in wave
    const spawnPromises = wave.map((batch, i) =>
      spawnAgent(batch, `wave${currentWave}-agent${i + 1}`)
    );

    await Promise.all(spawnPromises);
    console.log(`   ✅ Wave ${currentWave} spawned successfully`);

    currentWave++;
  }

  console.log(`   ✅ All ${clusters.length} agents spawned across ${currentWave - 1} waves`);
}

/**
 * Spawn single agent container
 */
async function spawnAgent(batch, agentId) {
  const promptText = batch.tier === 1
    ? `Fix TypeScript errors in /workspace/${batch.files[0]}\n\nExpected errors: ${batch.errors}`
    : `Fix TypeScript errors in coordinated cluster:\n${
        batch.files.map(f => `- /workspace/${f}`).join('\n')
      }\n\nTotal errors: ${batch.errors}\nThese files may share dependencies. Ensure type changes are consistent.`;

  try {
    const container = await docker.createContainer({
      Image: CONFIG.agentImage,
      name: agentId,
      HostConfig: {
        Memory: parseMemory(CONFIG.tierMemory[batch.tier]),
        NetworkMode: CONFIG.networkName,
        Binds: ['/workspace:/workspace:rw']
      },
      Env: [
        `TASK_PROMPT=${promptText}`,
        `AGENT_ID=${agentId}`,
        `BATCH_TIER=${batch.tier}`,
        `REDIS_HOST=${CONFIG.redisHost}`,
        ...Object.entries(process.env)
          .filter(([k]) =>
            k.startsWith('ANTHROPIC_') ||
            k.startsWith('CFN_') ||
            k.startsWith('ZAI_') ||
            k.startsWith('Z_AI_') ||
            k.startsWith('KIMI_') ||
            k === 'CLAUDE_API_PROVIDER'
          )
          .map(([k, v]) => `${k}=${v}`)
      ],
      Cmd: ['node', '/app/dist/cli/index.js', 'agent', 'typescript-specialist', promptText]
    });

    await container.start();

  } catch (error) {
    console.error(`   ❌ Failed to spawn ${agentId}:`, error.message);
    throw error;
  }
}

/**
 * Phase 7: Wait for all agents to complete (passive Redis polling)
 * Includes agent health monitoring and stuck agent detection
 */
async function waitForCompletion() {
  console.log('\n⏳ Phase 7: Waiting for agent completion...');

  const totalTasks = parseInt(await redisClient.get('task:total') || '0');

  // Priority 3 Fix: Handle empty task list
  if (totalTasks === 0) {
    console.log('   ⚠️  No tasks created (no errors to fix)');
    return;
  }

  const startTime = Date.now();
  const agentTimeout = 180; // 3 minutes per agent (Priority 2 Fix)
  const coordinatorTimeout = 1800; // 30 minutes total

  while (true) {
    const completed = parseInt(await redisClient.get('task:completed') || '0');
    const queueLength = await redisClient.lLen('task:queue');
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Priority 3 Fix: Safe progress display
    if (totalTasks > 0) {
      process.stdout.write(`   Progress: ${completed}/${totalTasks} tasks, ${queueLength} queued (${elapsed}s elapsed)\r`);
    }

    // Priority 2 Fix: Agent health monitoring
    await monitorAgentHealth(agentTimeout);

    if (completed >= totalTasks && queueLength === 0) {
      console.log('\n   ✅ All tasks completed');
      break;
    }

    // Safety timeout (30 minutes)
    if (elapsed > coordinatorTimeout) {
      console.log('\n   ⚠️  Coordinator timeout reached (30 minutes)');
      console.log('   Killing all agents and exiting...');
      await cleanupAgents();
      throw new Error('Coordinator timeout');
    }

    await sleep(5000); // Poll every 5s
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`   Total time: ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`);
}

/**
 * Monitor agent health and kill stuck agents
 * Priority 2 Fix: Prevent agents from hanging indefinitely
 */
async function monitorAgentHealth(timeoutSeconds) {
  try {
    const containers = await docker.listContainers({
      filters: {
        name: ['wave']
      }
    });

    for (const containerInfo of containers) {
      const startedAt = new Date(containerInfo.State === 'running' ? containerInfo.Created * 1000 : 0);
      const elapsed = (Date.now() - startedAt.getTime()) / 1000;

      if (elapsed > timeoutSeconds) {
        const containerName = containerInfo.Names[0].replace('/', '');
        console.log(`\n   ⚠️  Agent ${containerName} stuck for ${Math.round(elapsed)}s (timeout: ${timeoutSeconds}s)`);
        console.log(`   Killing stuck agent...`);

        try {
          const container = docker.getContainer(containerInfo.Id);
          await container.kill();
          await container.remove({ force: true });
          console.log(`   ✅ Stuck agent ${containerName} killed`);
        } catch (killError) {
          console.log(`   ⚠️  Failed to kill ${containerName}: ${killError.message}`);
        }
      }
    }
  } catch (error) {
    // Ignore monitoring errors (don't block main workflow)
  }
}

/**
 * Phase 8: Cleanup agent containers
 */
async function cleanupAgents() {
  console.log('\n🧹 Cleaning up agents...');

  const containers = await docker.listContainers({ all: true });
  const agentContainers = containers.filter(c =>
    c.Names.some(n => n.includes('wave') || n.includes('agent'))
  );

  for (const containerInfo of agentContainers) {
    try {
      const container = docker.getContainer(containerInfo.Id);
      await container.remove({ force: true });
    } catch (error) {
      // Ignore errors (container might already be removed)
    }
  }

  console.log(`   ✅ Cleaned up ${agentContainers.length} containers`);
}

/**
 * Main CFN Loop
 */
async function main() {
  console.log('🎯 INTELLIGENT TYPESCRIPT ERROR COORDINATOR');
  console.log('===========================================');
  console.log(`Memory budget: ${CONFIG.memoryBudget}`);
  console.log(`Max iterations: ${CONFIG.maxIterations}`);
  console.log(`Workspace: ${CONFIG.workspace}`);
  console.log('');

  // Connect to Redis
  redisClient = redis.createClient({
    url: `redis://${CONFIG.redisHost}:${CONFIG.redisPort}`
  });

  await redisClient.connect();
  console.log(`✅ Connected to Redis at ${CONFIG.redisHost}:${CONFIG.redisPort}\n`);

  // CFN Loop: Iterate until errors = 0
  for (let iteration = 1; iteration <= CONFIG.maxIterations; iteration++) {
    console.log(`${'='.repeat(50)}`);
    console.log(`ITERATION ${iteration} of ${CONFIG.maxIterations}`);
    console.log('='.repeat(50));

    // Loop 2: Validate (count errors)
    const errorsByFile = await analyzeAllErrors();
    const totalErrors = Array.from(errorsByFile.values()).reduce((sum, count) => sum + count, 0);

    // Product Owner Decision
    if (totalErrors === 0) {
      console.log('\n✅ PROCEED: All TypeScript errors resolved!');
      break;
    }

    // Additional validation: Check minimum error threshold
    if (totalErrors < 5 && iteration === 1) {
      console.log(`\n⚠️  Only ${totalErrors} errors found (below batch processing threshold)`);
      console.log('   Recommendation: Fix manually with Claude Code or adjust TypeScript strictness');
      console.log('   Exiting coordinator (use FORCE_RUN=true to override)');
      break;
    }

    console.log(`\n📊 Decision: ITERATE (${totalErrors} errors remaining)`);

    // Loop 3: Implement
    const clusters = await clusterFiles(errorsByFile);

    // Additional validation: Check for empty clusters
    if (clusters.length === 0) {
      console.log('\n⚠️  No clusters created (insufficient files to batch)');
      break;
    }

    await pushTasksToRedis(clusters, iteration);
    await spawnAgents(clusters);
    await waitForCompletion();
    await cleanupAgents();

    console.log(`\n✅ Iteration ${iteration} complete`);
  }

  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log('COORDINATOR COMPLETE');
  console.log('='.repeat(50));

  await redisClient.quit();
  process.exit(0);
}

// Error handling
process.on('unhandledRejection', async (error) => {
  console.error('\n❌ Unhandled error:', error);
  if (redisClient) await redisClient.quit();
  process.exit(1);
});

// Start coordinator
main().catch(async (error) => {
  console.error('\n❌ Fatal error:', error);
  if (redisClient) await redisClient.quit();
  process.exit(1);
});
