/**
 * Git Checkpoint Manager - Integration Example
 *
 * Demonstrates how to integrate Git auto-checkpoint with CFN Loop execution:
 * - Create WIP branches per sprint
 * - Auto-commit progress every 5 minutes
 * - Tag commits with confidence scores
 * - Compare checkpoints for recovery
 * - Cleanup branches after completion
 *
 * @module cfn-loop/git-checkpoint-integration-example
 */

import { GitCheckpointManager } from './git-checkpoint-manager.js';
import { StateCheckpointManager } from './state-checkpoint-manager.js';

/**
 * Example: Integrate Git Auto-Checkpoint with CFN Loop
 */
async function integrateGitCheckpoint() {
  // Initialize Git checkpoint manager
  const gitCheckpoint = new GitCheckpointManager({
    autoCommitIntervalMs: 300000, // 5 minutes
    enableAutoCleanup: true,
    redisUrl: 'redis://localhost:6379',
  });

  await gitCheckpoint.initialize();

  // Create WIP branch for sprint
  const epicId = 'epic-123';
  const sprintId = 'sprint-1';
  const branch = await gitCheckpoint.createWIPBranch(epicId, sprintId);
  console.log(`Created WIP branch: ${branch}`);

  // Start auto-checkpoint timer (commits every 5 minutes)
  gitCheckpoint.startAutoCheckpoint();

  // Simulate CFN Loop execution with progress updates
  let confidence = 0.5;

  // Update metadata for auto-commits
  gitCheckpoint.updateMetadata({
    sprintId,
    confidence,
    timestamp: Date.now(),
    phase: 'authentication',
    agents: ['coder-1', 'security-1'],
    files: ['auth.ts', 'auth.test.ts'],
  });

  // Simulate work progress
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Manual commit for important milestone
  confidence = 0.75;
  const commitHash = await gitCheckpoint.autoCommitProgress(sprintId, confidence, {
    phase: 'authentication',
    agents: ['coder-1', 'security-1'],
    files: ['auth.ts', 'auth.test.ts', 'auth-middleware.ts'],
  });
  console.log(`Committed progress: ${commitHash} (confidence: ${confidence})`);

  // Update metadata for next auto-commit
  gitCheckpoint.updateMetadata({
    sprintId,
    confidence,
    timestamp: Date.now(),
    phase: 'authentication',
    agents: ['coder-1', 'security-1', 'reviewer-1'],
  });

  // Stop auto-checkpoint
  gitCheckpoint.stopAutoCheckpoint();

  // Compare checkpoints (Git vs Redis)
  const comparison = await gitCheckpoint.compareCheckpoints(epicId);
  console.log(`Checkpoint comparison: ${comparison.recommendation} (${comparison.reason})`);

  // Cleanup WIP branches after successful completion
  await gitCheckpoint.cleanupWIPBranches(epicId);
  console.log('WIP branches cleaned up');

  // Shutdown
  await gitCheckpoint.shutdown();
}

/**
 * Example: Recovery using Git Checkpoint
 */
async function recoverFromGitCheckpoint() {
  const gitCheckpoint = new GitCheckpointManager();
  const stateCheckpoint = new StateCheckpointManager();

  await gitCheckpoint.initialize();
  await stateCheckpoint.initialize();

  const epicId = 'epic-123';

  // Compare checkpoints to find newest
  const comparison = await gitCheckpoint.compareCheckpoints(epicId);

  if (comparison.recommendation === 'use-git') {
    console.log('Using Git checkpoint for recovery (newer than Redis)');
    console.log(`Git timestamp: ${new Date(comparison.gitTimestamp!).toISOString()}`);
    console.log(`Redis timestamp: ${new Date(comparison.redisTimestamp!).toISOString()}`);
    console.log(`Difference: ${Math.round(comparison.timeDiffMs / 1000)}s`);
  } else if (comparison.recommendation === 'use-redis') {
    console.log('Using Redis checkpoint for recovery (newer than Git)');
    const state = await stateCheckpoint.restoreLatestCheckpoint();
    console.log(`Restored epic: ${state?.epicId}`);
  } else {
    console.log('No checkpoints found - starting fresh');
  }

  await gitCheckpoint.shutdown();
  await stateCheckpoint.shutdown();
}

/**
 * Example: Monitor Git Checkpoint Statistics
 */
async function monitorGitCheckpointStats() {
  const gitCheckpoint = new GitCheckpointManager({
    autoCommitIntervalMs: 1000, // 1 second for testing
  });

  await gitCheckpoint.initialize();

  // Listen to checkpoint events
  gitCheckpoint.on('branch-created', (data) => {
    console.log('Branch created:', data);
  });

  gitCheckpoint.on('commit-created', (data) => {
    console.log('Commit created:', data);
  });

  gitCheckpoint.on('checkpoints-compared', (data) => {
    console.log('Checkpoints compared:', data);
  });

  gitCheckpoint.on('branches-cleaned', (data) => {
    console.log('Branches cleaned:', data);
  });

  // Create branch and commit
  await gitCheckpoint.createWIPBranch('epic-test', 'sprint-test');
  await gitCheckpoint.autoCommitProgress('sprint-test', 0.85, {
    phase: 'test',
    agents: ['test-agent'],
  });

  // Get statistics
  const stats = gitCheckpoint.getStats();
  console.log('Git Checkpoint Statistics:', {
    totalCommits: stats.totalCommits,
    totalBranches: stats.totalBranches,
    averageCommitLatencyMs: stats.averageCommitLatencyMs,
    commitFailures: stats.commitFailures,
  });

  await gitCheckpoint.shutdown();
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    console.log('=== Git Checkpoint Integration Example ===\n');
    await integrateGitCheckpoint();

    console.log('\n=== Recovery Example ===\n');
    await recoverFromGitCheckpoint();

    console.log('\n=== Monitoring Example ===\n');
    await monitorGitCheckpointStats();
  })();
}
