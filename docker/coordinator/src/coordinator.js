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
const fs = require('fs');
const path = require('path');

// SECURITY: Secret filtering utility for logs
// Prevents accidental exposure of API keys, passwords, and tokens
function filterSecrets(text) {
  if (!text || typeof text !== 'string') return text;

  const secretPatterns = [
    { name: 'ANTHROPIC_API_KEY', pattern: /(ANTHROPIC_API_KEY)[\s:=]+([^\s\n"']+)/gi },
    { name: 'CFN_API_KEY', pattern: /(CFN_API_KEY)[\s:=]+([^\s\n"']+)/gi },
    { name: 'REDIS_PASSWORD', pattern: /(CFN_REDIS_PASSWORD|REDIS_PASSWORD)[\s:=]+([^\s\n"']+)/gi },
    { name: 'GITHUB_TOKEN', pattern: /(GITHUB_TOKEN|github_token)[\s:=]+([^\s\n"']+)/gi },
    { name: 'BEARER_TOKEN', pattern: /(Bearer|bearer)\s+([A-Za-z0-9._\-]+)/g }
  ];

  let filtered = text;
  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(filtered)) {
      filtered = filtered.replace(pattern, (match) => {
        const parts = match.split(/[\s:=]+/);
        return parts.length >= 2 ? `${parts[0]}=***${name}_REDACTED***` : `***${name}_REDACTED***`;
      });
    }
  }
  return filtered;
}

// Safe logging wrapper
function safeLog(...args) {
  const filtered = args.map(arg =>
    typeof arg === 'string' ? filterSecrets(arg) : arg
  );
  console.log(...filtered);
}

function safeError(...args) {
  const filtered = args.map(arg =>
    typeof arg === 'string' ? filterSecrets(arg) : arg
  );
  console.error(...filtered);
}

// Import runtime config (gracefully handle missing file)
let runtimeConfig = { canonicalKeys: [] };
try {
  const configPath = path.join('/opt/cfn/runtime-env.json');
  if (fs.existsSync(configPath)) {
    runtimeConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (error) {
  console.warn('⚠️  Runtime config not found, using default canonical keys');
  // Default canonical keys for filtering
  runtimeConfig.canonicalKeys = [
    'CFN_REDIS_HOST', 'CFN_REDIS_PORT', 'CFN_MEMORY_BUDGET', 'CFN_MAX_ITERATIONS',
    'CFN_AGENT_IMAGE', 'ANTHROPIC_API_KEY', 'CLAUDE_API_PROVIDER',
    'ZAI_API_KEY', 'Z_AI_API_KEY', 'KIMI_API_KEY'
  ];
}

// Configuration from environment (CFN_* canonical names with legacy fallback)
const CONFIG = {
  workspace: '/workspace',
  memoryBudget: process.env.CFN_MEMORY_BUDGET || process.env.MEMORY_BUDGET || '40g',
  maxIterations: parseInt(process.env.CFN_MAX_ITERATIONS || process.env.MAX_ITERATIONS || '10'),
  redisHost: process.env.CFN_REDIS_HOST || process.env.REDIS_HOST || 'cfn-redis',
  redisPort: parseInt(process.env.CFN_REDIS_PORT || process.env.REDIS_PORT || '6379'),
  networkName: process.env.NETWORK_NAME || 'cfn-network',
  agentImage: process.env.CFN_AGENT_IMAGE || process.env.AGENT_IMAGE || 'claude-flow-novice-agent:frontend',
  taskId: process.env.TASK_ID || 'unknown',
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

    // Count all lines containing "error TS" (same method as test script)
    const errorLines = output.split('\n').filter(line => /error TS\d+:/.test(line));
    const totalErrors = errorLines.length;

    console.log(`   Debug: Total error lines found: ${totalErrors}`);

    // Parse file paths from matched lines for batching
    const errorsByFile = new Map();
    errorLines.forEach(line => {
      const match = line.match(/(.+?)\(\d+,\d+\):/);
      if (match) {
        const file = match[1];
        errorsByFile.set(file, (errorsByFile.get(file) || 0) + 1);
      }
    });

    console.log(`   Found ${totalErrors} errors across ${errorsByFile.size} files`);

    return errorsByFile;

  } catch (error) {
    // TSC returns non-zero when errors exist - this is expected
    // With encoding:'utf8' and 2>&1 redirect, output is in error.stdout + error.stderr
    const output = (error.stdout || '') + (error.stderr || '');
    console.log(`   Debug: Captured ${output.length} chars of TSC output`);

    // Count all lines containing "error TS" (same method as test script)
    const errorLines = output.split('\n').filter(line => /error TS\d+:/.test(line));
    const totalErrors = errorLines.length;

    console.log(`   Debug: Total error lines found: ${totalErrors}`);

    // Parse file paths from matched lines for batching
    const errorsByFile = new Map();
    errorLines.forEach(line => {
      const match = line.match(/(.+?)\(\d+,\d+\):/);
      if (match) {
        const file = match[1];
        errorsByFile.set(file, (errorsByFile.get(file) || 0) + 1);
      }
    });

    console.log(`   Found ${totalErrors} errors across ${errorsByFile.size} files`);

    // Validate parsed count matches expected
    if (totalErrors > 0 && process.env.DEBUG) {
      console.log(`   First 500 chars of TSC output: ${output.substring(0, 500)}`);
    }

    if (totalErrors > 0) {
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
 * Phase 4-5: Prepare task batches (metadata storage only - no queue)
 */
async function prepareTaskBatches(clusters, iteration) {
  console.log('\n📋 Phase 4-5: Preparing task batches...');

  let taskNum = 0;

  for (const cluster of clusters) {
    taskNum++;

    // Store metadata for monitoring/debugging only (not used for task distribution)
    const batch = {
      batch_id: `iter${iteration}-cluster${taskNum}`,
      tier: cluster.tier,
      memory: CONFIG.tierMemory[cluster.tier],
      files: cluster.files,
      total_errors: cluster.errors,
      iteration
    };

    await redisClient.hSet(`task:iter${iteration}:${taskNum}`, {
      batch_id: batch.batch_id,
      tier: batch.tier.toString(),
      memory: batch.memory,
      files: JSON.stringify(batch.files),
      total_errors: batch.total_errors.toString(),
      iteration: iteration.toString(),
      created_at: new Date().toISOString()
    });
  }

  console.log(`   ✅ Prepared ${taskNum} batches for iteration ${iteration}`);

  return clusters;
}

/**
 * Phase 6: Spawn agents in waves (respecting memory budget)
 * Returns: Array of container names for tracking
 */
async function spawnAgents(clusters) {
  console.log('\n🚀 Phase 6: Spawning agent waves...');

  const budgetBytes = parseMemory(CONFIG.memoryBudget);
  let currentWave = 1;
  const batchQueue = [...clusters];
  const allContainerNames = [];

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

    // Spawn all agents in wave and collect container names
    const containerNames = [];
    for (let i = 0; i < wave.length; i++) {
      const containerName = `wave${currentWave}-agent${i + 1}`;
      await spawnAgent(wave[i], containerName);
      containerNames.push(containerName);
      allContainerNames.push(containerName);
    }

    console.log(`   ✅ Wave ${currentWave} spawned successfully: ${containerNames.join(', ')}`);

    currentWave++;
  }

  console.log(`   ✅ All ${clusters.length} agents spawned across ${currentWave - 1} waves`);
  return allContainerNames;
}

/**
 * Spawn single agent container
 */
async function spawnAgent(batch, agentId) {
  const agentType = batch.tier === 1 ? 'typescript-specialist' : 'typescript-specialist';
  const promptText = batch.tier === 1
    ? `Fix TypeScript errors in /workspace/${batch.files[0]}\n\nExpected errors: ${batch.errors}`
    : `Fix TypeScript errors in coordinated cluster:\n${
        batch.files.map(f => `- /workspace/${f}`).join('\n')
      }\n\nTotal errors: ${batch.errors}\nThese files may share dependencies. Ensure type changes are consistent.`;

  try {
    // Build environment variables with canonical names and runtime config filtering
    const envVars = [
      `TASK_PROMPT=${promptText}`,
      `AGENT_ID=${agentId}`,
      `TASK_ID=${CONFIG.taskId}`,
      `AGENT_TYPE=${agentType}`,
      `BATCH_TIER=${batch.tier}`,
      `CFN_REDIS_HOST=${CONFIG.redisHost}`,
      `CFN_REDIS_PORT=${CONFIG.redisPort}`,
      // Filter environment using runtime config canonical keys
      ...Object.entries(process.env)
        .filter(([k]) => {
          // If runtime config has canonical keys, use them; otherwise use legacy pattern
          if (runtimeConfig.canonicalKeys.length > 0) {
            return runtimeConfig.canonicalKeys.includes(k);
          }
          // Fallback to legacy pattern matching
          return k.startsWith('ANTHROPIC_') ||
                 k.startsWith('CFN_') ||
                 k.startsWith('ZAI_') ||
                 k.startsWith('Z_AI_') ||
                 k.startsWith('KIMI_') ||
                 k === 'CLAUDE_API_PROVIDER';
        })
        .map(([k, v]) => `${k}=${v}`)
    ];

    const container = await docker.createContainer({
      Image: CONFIG.agentImage,
      name: agentId,
      HostConfig: {
        Memory: parseMemory(CONFIG.tierMemory[batch.tier]),
        NetworkMode: CONFIG.networkName,
        Binds: ['/workspace:/workspace:rw']
      },
      Env: envVars,
      Cmd: ['node', '/app/dist/cli/index.js', 'agent', agentType, promptText]
    });

    await container.start();

  } catch (error) {
    console.error(`   ❌ Failed to spawn ${agentId}:`, error.message);
    throw error;
  }
}

/**
 * Phase 7: Wait for all agents to complete (Docker container status tracking)
 * Monitors container exit status instead of Redis queue
 */
async function waitForCompletion(containerNames, timeout = 1800000) {
  const startTime = Date.now();
  const completedAgents = [];
  const failedAgents = [];
  let lastCheck = new Set();

  console.log(`\n⏳ Phase 7: Waiting for agent completion...`);

  if (!containerNames || containerNames.length === 0) {
    console.log('   ⚠️  No agents spawned (no tasks to complete)');
    return { completed: 0, failed: 0, total: 0 };
  }

  while (true) {
    // List all containers matching our agent names
    const containers = await docker.listContainers({
      all: true,
      filters: { name: containerNames }
    });

    // Categorize by status
    const running = containers.filter(c => c.State === 'running');
    const exited = containers.filter(c => c.State === 'exited');

    // Check for newly completed agents
    for (const container of exited) {
      const name = container.Names[0].replace('/', '');
      if (!lastCheck.has(name)) {
        const inspect = await docker.getContainer(container.Id).inspect();

        if (inspect.State.ExitCode === 0) {
          completedAgents.push(name);
          console.log(`   ✅ ${name} completed successfully`);
        } else {
          failedAgents.push(name);
          console.warn(`   ❌ ${name} failed (exit code ${inspect.State.ExitCode})`);
        }

        lastCheck.add(name);
      }
    }

    // Progress update
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`   Progress: ${completedAgents.length} completed, ${failedAgents.length} failed, ${running.length} running (${elapsed}s elapsed)`);

    // Check completion
    if (running.length === 0) {
      console.log(`\n   ✅ All agents finished: ${completedAgents.length} completed, ${failedAgents.length} failed`);
      break;
    }

    // Check timeout
    if (Date.now() - startTime > timeout) {
      console.error(`\n   ⏱️  Timeout after ${timeout/1000}s - killing remaining agents`);

      // Kill remaining running containers
      for (const container of running) {
        try {
          await docker.getContainer(container.Id).kill();
          console.warn(`   Killed ${container.Names[0]}`);
        } catch (err) {
          console.warn(`   Failed to kill ${container.Names[0]}: ${err.message}`);
        }
      }

      throw new Error(`Timeout: ${running.length} agents still running after ${timeout/1000}s`);
    }

    // Poll every 2 seconds
    await sleep(2000);
  }

  return {
    completed: completedAgents.length,
    failed: failedAgents.length,
    total: containerNames.length
  };
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
  safeLog(`Memory budget: ${CONFIG.memoryBudget}`);
  safeLog(`Max iterations: ${CONFIG.maxIterations}`);
  safeLog(`Workspace: ${CONFIG.workspace}`);
  console.log('');

  // Connect to Redis
  redisClient = redis.createClient({
    url: `redis://${CONFIG.redisHost}:${CONFIG.redisPort}`
  });

  await redisClient.connect();
  safeLog(`✅ Connected to Redis at ${CONFIG.redisHost}:${CONFIG.redisPort}\n`);

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

    await prepareTaskBatches(clusters, iteration);
    const containerNames = await spawnAgents(clusters);
    const results = await waitForCompletion(containerNames);

    // Log results
    console.log(`\n📊 Iteration ${iteration} results: ${results.completed}/${results.total} succeeded, ${results.failed} failed`);

    // Fail fast if too many agents failed
    if (results.failed > results.total * 0.5) {
      console.error(`\n❌ Aborting: ${results.failed}/${results.total} agents failed (>50% failure rate)`);
      await cleanupAgents();
      process.exit(1);
    }

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
