#!/usr/bin/env node
/**
 * Cleanup Orphans CLI Command
 * Sprint 3.1: Memory Leak Prevention - Enhanced Lifecycle Cleanup
 *
 * Command-line interface for detecting and cleaning orphaned agents.
 *
 * Features:
 * - Detect orphaned agents across all swarms
 * - Force cleanup with distributed locking
 * - Dry-run mode for safety
 * - Interactive confirmation
 * - Detailed reporting
 *
 * Usage:
 *   node src/cli/cleanup-orphans.js [options]
 *
 * Options:
 *   --dry-run          Show orphans without cleaning them
 *   --force            Skip confirmation prompts
 *   --idle-threshold   Idle threshold in minutes (default: 2)
 *   --auto-cleanup     Enable automatic cleanup
 *   --redis-host       Redis host (default: localhost)
 *   --redis-port       Redis port (default: 6379)
 *   --debug            Enable debug logging
 *
 * Examples:
 *   # Dry run - detect orphans without cleanup
 *   node src/cli/cleanup-orphans.js --dry-run
 *
 *   # Force cleanup all orphans (no confirmation)
 *   node src/cli/cleanup-orphans.js --force
 *
 *   # Custom idle threshold (5 minutes)
 *   node src/cli/cleanup-orphans.js --idle-threshold 5
 *
 * Epic: memory-leak-prevention
 * Sprint: 3.1 - Enhanced Lifecycle Cleanup
 *
 * @module cli/cleanup-orphans
 */

import { Command } from 'commander';
import Redis from 'ioredis';
import readline from 'readline';
import {
  EnhancedLifecycleCleanupManager,
  createEnhancedLifecycleCleanupManager,
  type OrphanAgent,
  type CleanupResult,
} from '../agents/lifecycle-cleanup-enhanced.js';
import type { AgentLifecycleContext } from '../agents/lifecycle-manager.js';

// ===== CLI CONFIGURATION =====

interface CleanupOrphansOptions {
  dryRun?: boolean;
  force?: boolean;
  idleThreshold?: number;
  autoCleanup?: boolean;
  redisHost?: string;
  redisPort?: number;
  debug?: boolean;
}

// ===== CLI COMMAND =====

const program = new Command();

program
  .name('cleanup-orphans')
  .description('Detect and cleanup orphaned agents')
  .version('1.0.0')
  .option('--dry-run', 'Show orphans without cleaning them', false)
  .option('--force', 'Skip confirmation prompts', false)
  .option('--idle-threshold <minutes>', 'Idle threshold in minutes', '2')
  .option('--auto-cleanup', 'Enable automatic cleanup', false)
  .option('--redis-host <host>', 'Redis host', 'localhost')
  .option('--redis-port <port>', 'Redis port', '6379')
  .option('--debug', 'Enable debug logging', false)
  .action(async (options: CleanupOrphansOptions) => {
    await cleanupOrphans(options);
  });

// ===== MAIN LOGIC =====

async function cleanupOrphans(options: CleanupOrphansOptions): Promise<void> {
  console.log('\n🧹 Orphan Cleanup Utility\n');

  const idleThresholdMs = (options.idleThreshold || 2) * 60 * 1000;
  const redisHost = options.redisHost || 'localhost';
  const redisPort = options.redisPort || 6379;

  console.log('Configuration:');
  console.log(`  • Idle threshold: ${options.idleThreshold || 2} minutes`);
  console.log(`  • Redis: ${redisHost}:${redisPort}`);
  console.log(`  • Mode: ${options.dryRun ? 'DRY RUN' : 'CLEANUP'}`);
  console.log(`  • Auto-cleanup: ${options.autoCleanup ? 'ENABLED' : 'DISABLED'}`);
  console.log('');

  let redis: Redis | undefined;
  let cleanupManager: EnhancedLifecycleCleanupManager | undefined;

  try {
    // Initialize Redis
    console.log('🔌 Connecting to Redis...');
    redis = new Redis({
      host: redisHost,
      port: redisPort,
    });

    await new Promise<void>((resolve, reject) => {
      redis!.once('ready', resolve);
      redis!.once('error', reject);
      setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
    });

    console.log('✅ Redis connected\n');

    // Initialize cleanup manager
    cleanupManager = createEnhancedLifecycleCleanupManager({
      redisClient: redis,
      redisKeyPrefix: 'lifecycle:cleanup',
      orphanDetection: {
        idleThreshold: idleThresholdMs,
        checkInterval: 30000,
        autoCleanup: options.autoCleanup || false,
      },
      cleanupLock: {
        lockTimeout: 30,
        retryAttempts: 3,
        retryDelay: 1000,
      },
      debug: options.debug || false,
    });

    // Get all agents from Redis
    console.log('🔍 Scanning for agents...');
    const agentKeys = await redis.keys('lifecycle:cleanup:agent:*');
    console.log(`Found ${agentKeys.length} registered agents\n`);

    if (agentKeys.length === 0) {
      console.log('✅ No agents found. System is clean.\n');
      return;
    }

    const agents: AgentLifecycleContext[] = [];
    for (const key of agentKeys) {
      const agentDataStr = await redis.get(key);
      if (agentDataStr) {
        try {
          agents.push(JSON.parse(agentDataStr));
        } catch {
          console.log(`⚠️  Skipping malformed agent data: ${key}`);
        }
      }
    }

    // Detect orphans
    console.log('🔎 Detecting orphaned agents...');
    const orphans = await cleanupManager.detectOrphans(agents);

    if (orphans.length === 0) {
      console.log('✅ No orphaned agents detected\n');
      await printAgentSummary(agents);
      return;
    }

    // Print orphan details
    console.log(`\n⚠️  Detected ${orphans.length} orphaned agent(s):\n`);
    printOrphanDetails(orphans);

    // Dry run mode - exit here
    if (options.dryRun) {
      console.log('\n💡 Dry run mode - no cleanup performed');
      console.log('   Run without --dry-run to cleanup orphans\n');
      return;
    }

    // Confirmation prompt (unless --force)
    if (!options.force) {
      const confirmed = await confirmCleanup(orphans.length);
      if (!confirmed) {
        console.log('\n❌ Cleanup cancelled by user\n');
        return;
      }
    }

    // Execute cleanup
    console.log('\n🧹 Cleaning up orphaned agents...\n');
    const results: CleanupResult[] = [];

    for (const orphan of orphans) {
      console.log(`  Cleaning ${orphan.agentId} (${orphan.agentName})...`);

      const result = await cleanupManager.forceCleanupAgent(
        orphan.agentId,
        `CLI cleanup: ${orphan.reason}`
      );

      results.push(result);

      if (result.success) {
        console.log(`    ✅ Cleaned (${result.redisKeysRemoved} Redis keys removed)`);
      } else {
        console.log(`    ❌ Failed: ${result.error?.message}`);
      }
    }

    // Print summary
    console.log('\n📊 Cleanup Summary:');
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalKeys = results.reduce((sum, r) => sum + r.redisKeysRemoved, 0);
    const totalMemory = results.reduce((sum, r) => sum + r.memoryFreed, 0);

    console.log(`  ✅ Successful: ${successful}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  🗑️  Redis keys removed: ${totalKeys}`);
    console.log(`  💾 Memory freed: ${formatBytes(totalMemory)}`);

    // Get final metrics
    const metrics = cleanupManager.getMetrics();
    console.log('\n📈 Cleanup Metrics:');
    console.log(`  • Total orphans detected: ${metrics.orphansDetected}`);
    console.log(`  • Total orphans cleaned: ${metrics.orphansCleaned}`);
    console.log(`  • Force cleanups executed: ${metrics.forceCleanupsExecuted}`);
    console.log(`  • Cleanup failures: ${metrics.cleanupFailures}`);
    console.log(`  • Total Redis keys removed: ${metrics.redisKeysRemoved}`);
    console.log(`  • Total memory freed: ${formatBytes(metrics.memoryFreed)}`);

    console.log('\n✅ Cleanup complete\n');
  } catch (error) {
    console.error('\n❌ Error during cleanup:');
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup
    if (cleanupManager) {
      await cleanupManager.shutdown();
    }
    if (redis) {
      await redis.quit();
    }
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Print orphan details in a formatted table
 */
function printOrphanDetails(orphans: OrphanAgent[]): void {
  for (const orphan of orphans) {
    const idleMinutes = Math.round(orphan.idleDuration / 60000);

    console.log(`┌─ ${orphan.agentId}`);
    console.log(`├─ Name: ${orphan.agentName}`);
    console.log(`├─ Type: ${orphan.agentType}`);
    console.log(`├─ State: ${orphan.state}`);
    console.log(`├─ Idle: ${idleMinutes} minutes`);
    console.log(`├─ Last Activity: ${orphan.lastActivity.toISOString()}`);
    console.log(`└─ Reason: ${orphan.reason}`);
    console.log('');
  }
}

/**
 * Print agent summary
 */
async function printAgentSummary(agents: AgentLifecycleContext[]): Promise<void> {
  console.log('📊 Agent Summary:');

  const byState = agents.reduce((acc, agent) => {
    acc[agent.state] = (acc[agent.state] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`  • Total agents: ${agents.length}`);
  for (const [state, count] of Object.entries(byState)) {
    console.log(`  • ${state}: ${count}`);
  }
  console.log('');
}

/**
 * Prompt user for cleanup confirmation
 */
async function confirmCleanup(orphanCount: number): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `\n⚠️  Cleanup ${orphanCount} orphaned agent(s)? (y/N): `,
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      }
    );
  });
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

// ===== EXECUTION =====

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse(process.argv);
}

export { cleanupOrphans, program };
