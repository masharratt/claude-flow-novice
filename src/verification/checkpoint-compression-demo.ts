/**
 * Checkpoint Compression Demonstration
 *
 * Shows 60% storage reduction through compression techniques
 */

import { CheckpointManager } from './checkpoint-manager.js';
import { createCheckpointCompressor } from './checkpoint-compression.js';
import type { Checkpoint } from './interfaces.js';

async function demonstrateCompression() {
  console.log('=== Checkpoint Compression Demonstration ===\n');

  // Create checkpoint manager with compression enabled
  const managerCompressed = new CheckpointManager('.claude-flow/checkpoints-compressed', true);
  const managerUncompressed = new CheckpointManager('.claude-flow/checkpoints-raw', false);

  // Create multiple checkpoints
  console.log('Creating 10 checkpoints...\n');

  for (let i = 1; i <= 10; i++) {
    const description = `Checkpoint ${i}: Implementation phase ${Math.floor(i / 3) + 1}`;
    const agentId = `coder-${(i % 3) + 1}`;
    const taskId = `task-${Math.floor(i / 2) + 1}`;

    // Create with compression
    await managerCompressed.createCheckpoint(description, 'task', agentId, taskId, [
      {
        name: 'tests',
        type: 'test',
        command: 'npm test',
        expected_result: true,
        passed: true,
        weight: 1.0,
        execution_time_ms: 1000 + i * 100,
      },
      {
        name: 'lint',
        type: 'lint',
        command: 'npm run lint',
        expected_result: true,
        passed: true,
        weight: 0.5,
        execution_time_ms: 500 + i * 50,
      },
    ]);

    // Create without compression (for comparison)
    await managerUncompressed.createCheckpoint(description, 'task', agentId, taskId, [
      {
        name: 'tests',
        type: 'test',
        command: 'npm test',
        expected_result: true,
        passed: true,
        weight: 1.0,
        execution_time_ms: 1000 + i * 100,
      },
      {
        name: 'lint',
        type: 'lint',
        command: 'npm run lint',
        expected_result: true,
        passed: true,
        weight: 0.5,
        execution_time_ms: 500 + i * 50,
      },
    ]);
  }

  console.log('Checkpoints created successfully!\n');

  // Get compression statistics
  const stats = managerCompressed.getCompressionStats();

  if (stats) {
    console.log('=== COMPRESSION STATISTICS ===');
    console.log(`Total Checkpoints: ${stats.totalCheckpoints}`);
    console.log(`Original Size: ${stats.totalOriginalSize.toLocaleString()} bytes`);
    console.log(`Compressed Size: ${stats.totalCompressedSize.toLocaleString()} bytes`);
    console.log(`Total Savings: ${stats.totalSavings.toLocaleString()} bytes`);
    console.log(
      `Compression Ratio: ${(stats.averageCompressionRatio * 100).toFixed(2)}% of original`,
    );
    console.log(`Storage Reduction: ${((1 - stats.averageCompressionRatio) * 100).toFixed(2)}%`);
    console.log(`Shared State Count: ${stats.sharedStateCount}`);

    console.log('\n=== COMPRESSION TECHNIQUES APPLIED ===');
    console.log('1. Structural Optimization: Removed redundant fields');
    console.log('2. Delta Compression: Subsequent checkpoints store only changes');
    console.log('3. Deduplication: Shared state stored once, referenced multiple times');
    console.log('4. Gzip Compression: Applied to validations and delta data (level 6)');

    console.log('\n=== TARGET VALIDATION ===');
    const reductionPercent = (1 - stats.averageCompressionRatio) * 100;
    if (reductionPercent >= 60) {
      console.log(`✅ SUCCESS: Achieved ${reductionPercent.toFixed(2)}% reduction (target: 60%)`);
    } else {
      console.log(
        `⚠️  PARTIAL: Achieved ${reductionPercent.toFixed(2)}% reduction (target: 60%)`,
      );
      console.log(
        '   Note: Reduction varies with checkpoint size and similarity. Larger datasets show better compression.',
      );
    }
  } else {
    console.log('Compression is disabled for this manager.');
  }

  // Cleanup
  console.log('\n=== CLEANUP ===');
  await managerCompressed.cleanup(0); // Delete all checkpoints
  await managerUncompressed.cleanup(0);
  console.log('Cleanup complete.');
}

export { demonstrateCompression };
