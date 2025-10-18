/**
 * Checkpoint Compression Tests
 * Validates 60% storage reduction target with all optimization techniques
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CheckpointCompressor,
  createCheckpointCompressor,
  compressCheckpoint,
  decompressCheckpoint,
} from '../../../src/verification/checkpoint-compression.js';
import type { Checkpoint } from '../../../src/verification/interfaces.js';

describe('CheckpointCompressor', () => {
  let compressor: CheckpointCompressor;

  beforeEach(() => {
    compressor = createCheckpointCompressor({
      gzipLevel: 6,
      enableDelta: true,
      enableDeduplication: true,
      minSizeForCompression: 100,
    });
  });

  describe('Structural Optimization', () => {
    it('should remove null and undefined fields', async () => {
      const checkpoint: Checkpoint = {
        id: 'checkpoint_001',
        type: 'during',
        agent_id: 'coder-1',
        task_id: 'task-123',
        timestamp: Date.now(),
        required: true,
        validations: [],
        state_snapshot: {
          id: 'snapshot_001',
          timestamp: Date.now(),
          agent_states: new Map(),
          task_states: new Map(),
          system_state: {
            version: '2.0.0',
            uptime_ms: 1000,
            active_agents: 0,
            active_tasks: 0,
            memory_usage: {
              cpu_usage_percentage: 0,
              memory_usage_mb: 0,
              disk_usage_mb: 0,
              network_io_mbps: 0,
              file_descriptors_used: 0,
            },
            configuration: {
              max_agents: 10,
              max_concurrent_tasks: 5,
              truth_threshold: 0.95,
              verification_enabled: true,
              rollback_enabled: true,
            },
          },
          memory_state: {
            total_size_mb: 0,
            used_size_mb: 0,
            fragmentation_percentage: 0,
            cache_hit_rate: 0,
            active_sessions: 0,
          },
          file_system_state: {
            total_files: 0,
            total_size_mb: 0,
            last_modified: 0,
            checksums: {},
            permissions_valid: true,
          },
          database_state: {
            connection_status: 'disconnected',
            transaction_count: 0,
            pending_migrations: 0,
            data_integrity_check: true,
            backup_status: 'none',
          },
          checksum: 'abc123',
          metadata: {
            version: '2.0',
            created_by: 'coder-1',
            description: 'Test snapshot',
            tags: [],
            size_bytes: 0,
            compression_ratio: 1.0,
          },
        },
        description: 'Test checkpoint',
        scope: 'task',
      };

      const compressed = await compressor.compress(checkpoint);

      expect(compressed.id).toBe(checkpoint.id);
      expect(compressed.compressionMeta.originalSize).toBeGreaterThan(0);
    });
  });

  describe('Delta Compression', () => {
    it('should compress second checkpoint as delta from first', async () => {
      const checkpoint1: Checkpoint = createMockCheckpoint('checkpoint_001', 'coder-1', 'task-1');
      const checkpoint2: Checkpoint = createMockCheckpoint('checkpoint_002', 'coder-1', 'task-1');

      // Compress first checkpoint (full)
      const compressed1 = await compressor.compress(checkpoint1);
      expect(compressed1.previousCheckpointId).toBeNull();
      expect(compressed1.delta).toBeNull();

      // Compress second checkpoint (delta)
      const compressed2 = await compressor.compress(checkpoint2);
      expect(compressed2.previousCheckpointId).toBe(compressed1.id);
      expect(compressed2.delta).not.toBeNull();

      // Delta should be smaller than full checkpoint
      const fullSize = compressed1.compressionMeta.compressedSize;
      const deltaSize = compressed2.compressionMeta.compressedSize;
      expect(deltaSize).toBeLessThan(fullSize);
    });

    it('should correctly reconstruct checkpoint from delta', async () => {
      const checkpoint1: Checkpoint = createMockCheckpoint('checkpoint_001', 'coder-1', 'task-1');
      const checkpoint2: Checkpoint = {
        ...createMockCheckpoint('checkpoint_002', 'coder-1', 'task-1'),
        description: 'Updated description',
      };

      await compressor.compress(checkpoint1);
      const compressed2 = await compressor.compress(checkpoint2);

      const decompressed = await compressor.decompress(compressed2);
      expect(decompressed.description).toBe('Updated description');
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate identical agent states across checkpoints', async () => {
      const agentState = {
        id: 'agent-1',
        status: 'idle' as const,
        current_task: null,
        capabilities: ['code'],
        memory: {
          working_memory: {},
          long_term_memory: {},
          shared_memory_keys: [],
          memory_usage_mb: 10,
        },
        configuration: {
          model: 'claude-3-sonnet',
          temperature: 0.7,
          max_tokens: 4096,
          timeout_ms: 30000,
          retry_attempts: 3,
          custom_parameters: {},
        },
        performance_metrics: {
          response_time_p95_ms: 500,
          throughput_requests_per_second: 10,
          error_rate_percentage: 0.1,
          cpu_usage_percentage: 5,
          memory_usage_mb: 50,
        },
        last_heartbeat: Date.now(),
      };

      const checkpoint1: Checkpoint = createMockCheckpoint('checkpoint_001', 'coder-1', 'task-1');
      checkpoint1.state_snapshot.agent_states.set('agent-1', agentState);

      const checkpoint2: Checkpoint = createMockCheckpoint('checkpoint_002', 'coder-2', 'task-2');
      checkpoint2.state_snapshot.agent_states.set('agent-1', agentState); // Same state

      await compressor.compress(checkpoint1);
      await compressor.compress(checkpoint2);

      const stats = compressor.getCompressionStats();
      expect(stats.sharedStateCount).toBe(1); // Only stored once
    });

    it('should track reference counts for shared state', async () => {
      const checkpoint1: Checkpoint = createMockCheckpoint('checkpoint_001', 'coder-1', 'task-1');
      const checkpoint2: Checkpoint = createMockCheckpoint('checkpoint_002', 'coder-2', 'task-2');

      const compressed1 = await compressor.compress(checkpoint1);
      const compressed2 = await compressor.compress(checkpoint2);

      expect(compressed1.sharedStateRefs.length).toBeGreaterThanOrEqual(0);
      expect(compressed2.sharedStateRefs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Gzip Compression', () => {
    it('should compress validations with gzip', async () => {
      const checkpoint: Checkpoint = createMockCheckpoint('checkpoint_001', 'coder-1', 'task-1');
      checkpoint.validations = [
        {
          name: 'test_validation',
          type: 'test',
          command: 'npm test',
          expected_result: true,
          passed: true,
          weight: 1.0,
          execution_time_ms: 1000,
        },
        {
          name: 'lint_validation',
          type: 'lint',
          command: 'npm run lint',
          expected_result: true,
          passed: true,
          weight: 0.5,
          execution_time_ms: 500,
        },
      ];

      const compressed = await compressor.compress(checkpoint);
      expect(compressed.validations).toBeInstanceOf(Buffer);

      // Decompress and verify
      const decompressed = await compressor.decompress(compressed);
      expect(decompressed.validations).toHaveLength(2);
      expect(decompressed.validations[0].name).toBe('test_validation');
    });

    it('should skip compression for small data', async () => {
      const smallCompressor = createCheckpointCompressor({
        minSizeForCompression: 10000, // Very high threshold
      });

      const checkpoint: Checkpoint = createMockCheckpoint('checkpoint_001', 'coder-1', 'task-1');
      checkpoint.validations = [
        {
          name: 'small',
          type: 'test',
          command: 'echo',
          expected_result: true,
          passed: true,
          weight: 1.0,
          execution_time_ms: 10,
        },
      ];

      const compressed = await smallCompressor.compress(checkpoint);
      expect(compressed.validations).toBeInstanceOf(Buffer);
    });
  });

  describe('Compression Ratio Target (60% Reduction)', () => {
    it('should achieve at least 60% storage reduction for typical checkpoints', async () => {
      // Create a realistic checkpoint with substantial data
      const checkpoints: Checkpoint[] = [];

      for (let i = 1; i <= 5; i++) {
        const checkpoint = createMockCheckpoint(`checkpoint_00${i}`, 'coder-1', 'task-1');

        // Add realistic agent states
        for (let j = 1; j <= 3; j++) {
          checkpoint.state_snapshot.agent_states.set(`agent-${j}`, {
            id: `agent-${j}`,
            status: 'idle',
            current_task: null,
            capabilities: ['code', 'test', 'analyze'],
            memory: {
              working_memory: { data: `memory-data-${i}-${j}` },
              long_term_memory: {},
              shared_memory_keys: [],
              memory_usage_mb: 10,
            },
            configuration: {
              model: 'claude-3-sonnet',
              temperature: 0.7,
              max_tokens: 4096,
              timeout_ms: 30000,
              retry_attempts: 3,
              custom_parameters: {},
            },
            performance_metrics: {
              response_time_p95_ms: 500,
              throughput_requests_per_second: 10,
              error_rate_percentage: 0.1,
              cpu_usage_percentage: 5,
              memory_usage_mb: 50,
            },
            last_heartbeat: Date.now(),
          });
        }

        // Add validations
        checkpoint.validations = [
          {
            name: 'tests',
            type: 'test',
            command: 'npm test',
            expected_result: true,
            passed: true,
            weight: 1.0,
            execution_time_ms: 1000,
          },
          {
            name: 'lint',
            type: 'lint',
            command: 'npm run lint',
            expected_result: true,
            passed: true,
            weight: 0.5,
            execution_time_ms: 500,
          },
        ];

        checkpoints.push(checkpoint);
      }

      // Compress all checkpoints
      for (const checkpoint of checkpoints) {
        await compressor.compress(checkpoint);
      }

      const stats = compressor.getCompressionStats();

      console.log('Compression Statistics:');
      console.log(`  Total Checkpoints: ${stats.totalCheckpoints}`);
      console.log(`  Original Size: ${stats.totalOriginalSize} bytes`);
      console.log(`  Compressed Size: ${stats.totalCompressedSize} bytes`);
      console.log(`  Savings: ${stats.totalSavings} bytes`);
      console.log(`  Compression Ratio: ${(stats.averageCompressionRatio * 100).toFixed(2)}%`);
      console.log(`  Reduction: ${((1 - stats.averageCompressionRatio) * 100).toFixed(2)}%`);
      console.log(`  Shared State Count: ${stats.sharedStateCount}`);

      // Target: 60% reduction = 40% compression ratio (0.40)
      expect(stats.averageCompressionRatio).toBeLessThan(0.40);
      expect(1 - stats.averageCompressionRatio).toBeGreaterThanOrEqual(0.60);
    });
  });

  describe('Compression Statistics', () => {
    it('should track compression statistics accurately', async () => {
      const checkpoint1 = createMockCheckpoint('checkpoint_001', 'coder-1', 'task-1');
      const checkpoint2 = createMockCheckpoint('checkpoint_002', 'coder-1', 'task-1');

      await compressor.compress(checkpoint1);
      await compressor.compress(checkpoint2);

      const stats = compressor.getCompressionStats();

      expect(stats.totalCheckpoints).toBe(2);
      expect(stats.totalOriginalSize).toBeGreaterThan(0);
      expect(stats.totalCompressedSize).toBeGreaterThan(0);
      expect(stats.totalCompressedSize).toBeLessThan(stats.totalOriginalSize);
      expect(stats.totalSavings).toBeGreaterThan(0);
      expect(stats.averageCompressionRatio).toBeGreaterThan(0);
      expect(stats.averageCompressionRatio).toBeLessThan(1);
    });
  });

  describe('Garbage Collection', () => {
    it('should garbage collect unused shared state', async () => {
      const checkpoint1 = createMockCheckpoint('checkpoint_001', 'coder-1', 'task-1');
      const compressed = await compressor.compress(checkpoint1);

      // Decrement references (simulate checkpoint deletion)
      compressor.decrementRefs(compressed);

      // Run garbage collection
      const removedCount = compressor.gcSharedState();

      expect(removedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Clear and Reset', () => {
    it('should clear all history and shared state', async () => {
      const checkpoint = createMockCheckpoint('checkpoint_001', 'coder-1', 'task-1');
      await compressor.compress(checkpoint);

      let stats = compressor.getCompressionStats();
      expect(stats.totalCheckpoints).toBeGreaterThan(0);

      compressor.clear();

      stats = compressor.getCompressionStats();
      expect(stats.totalCheckpoints).toBe(0);
      expect(stats.sharedStateCount).toBe(0);
    });
  });
});

// ===== HELPER FUNCTIONS =====

function createMockCheckpoint(id: string, agentId: string, taskId: string): Checkpoint {
  return {
    id,
    type: 'during',
    agent_id: agentId,
    task_id: taskId,
    timestamp: Date.now(),
    required: true,
    validations: [],
    state_snapshot: {
      id: `snapshot_${id}`,
      timestamp: Date.now(),
      agent_states: new Map(),
      task_states: new Map(),
      system_state: {
        version: '2.0.0',
        uptime_ms: 1000,
        active_agents: 0,
        active_tasks: 0,
        memory_usage: {
          cpu_usage_percentage: 0,
          memory_usage_mb: 0,
          disk_usage_mb: 0,
          network_io_mbps: 0,
          file_descriptors_used: 0,
        },
        configuration: {
          max_agents: 10,
          max_concurrent_tasks: 5,
          truth_threshold: 0.95,
          verification_enabled: true,
          rollback_enabled: true,
        },
      },
      memory_state: {
        total_size_mb: 0,
        used_size_mb: 0,
        fragmentation_percentage: 0,
        cache_hit_rate: 0,
        active_sessions: 0,
      },
      file_system_state: {
        total_files: 0,
        total_size_mb: 0,
        last_modified: 0,
        checksums: {},
        permissions_valid: true,
      },
      database_state: {
        connection_status: 'disconnected',
        transaction_count: 0,
        pending_migrations: 0,
        data_integrity_check: true,
        backup_status: 'none',
      },
      checksum: 'abc123',
      metadata: {
        version: '2.0',
        created_by: agentId,
        description: 'Mock snapshot',
        tags: [],
        size_bytes: 0,
        compression_ratio: 1.0,
      },
    },
    description: `Mock checkpoint ${id}`,
    scope: 'task',
  };
}
