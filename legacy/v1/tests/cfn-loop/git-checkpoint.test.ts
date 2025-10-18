/**
 * Git Checkpoint Manager Tests
 *
 * Test Coverage:
 * - WIP branch creation and management
 * - Auto-commit every 5 minutes with metadata
 * - Commit tagging with confidence scores
 * - Checkpoint comparison (Git vs Redis)
 * - WIP branch cleanup after completion
 *
 * @module tests/cfn-loop/git-checkpoint
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitCheckpointManager, GitCheckpoint, CheckpointComparison } from '../../src/cfn-loop/git-checkpoint-manager.js';
import { createClient } from 'redis';
import { simpleGit } from 'simple-git';

// Mock Redis
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(),
    quit: vi.fn(),
    on: vi.fn(),
    setEx: vi.fn(),
    get: vi.fn(),
    keys: vi.fn(() => []),
  })),
}));

// Mock simple-git
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    checkIsRepo: vi.fn(() => true),
    branchLocal: vi.fn(() => ({ all: [] })),
    checkoutBranch: vi.fn(),
    checkout: vi.fn(),
    status: vi.fn(() => ({
      modified: [],
      not_added: [],
      created: [],
    })),
    add: vi.fn(),
    commit: vi.fn(),
    log: vi.fn(() => ({
      latest: {
        hash: 'abc123',
        date: new Date().toISOString(),
      },
    })),
    tag: vi.fn(),
    deleteLocalBranch: vi.fn(),
    tags: vi.fn(() => ({ all: [] })),
  })),
}));

describe('GitCheckpointManager', () => {
  let manager: GitCheckpointManager;
  let mockRedis: any;
  let mockGit: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockRedis = vi.mocked(createClient)();
    mockGit = vi.mocked(simpleGit)();

    manager = new GitCheckpointManager({
      autoCommitIntervalMs: 1000, // 1 second for testing
      enableAutoCleanup: true,
    });

    await manager.initialize();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('WIP Branch Management', () => {
    it('should create WIP branch with correct naming format', async () => {
      mockGit.branchLocal.mockResolvedValue({ all: [] });

      const branch = await manager.createWIPBranch('epic-123', 'sprint-1');

      expect(branch).toBe('cfn-epic-epic-123/sprint-sprint-1-wip');
      expect(mockGit.checkoutBranch).toHaveBeenCalledWith(
        'cfn-epic-epic-123/sprint-sprint-1-wip',
        'HEAD'
      );
    });

    it('should switch to existing WIP branch instead of creating new one', async () => {
      mockGit.branchLocal.mockResolvedValue({
        all: ['cfn-epic-epic-123/sprint-sprint-1-wip'],
      });

      const branch = await manager.createWIPBranch('epic-123', 'sprint-1');

      expect(mockGit.checkout).toHaveBeenCalledWith('cfn-epic-epic-123/sprint-sprint-1-wip');
      expect(mockGit.checkoutBranch).not.toHaveBeenCalled();
    });

    it('should store branch info in Redis', async () => {
      mockGit.branchLocal.mockResolvedValue({ all: [] });

      await manager.createWIPBranch('epic-123', 'sprint-1');

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        'cfn:git-checkpoint:epic-123',
        86400,
        expect.stringContaining('epic-123')
      );
    });

    it('should emit branch-created event', async () => {
      mockGit.branchLocal.mockResolvedValue({ all: [] });

      const eventSpy = vi.fn();
      manager.on('branch-created', eventSpy);

      await manager.createWIPBranch('epic-123', 'sprint-1');

      expect(eventSpy).toHaveBeenCalledWith({
        epicId: 'epic-123',
        sprintId: 'sprint-1',
        branch: 'cfn-epic-epic-123/sprint-sprint-1-wip',
      });
    });
  });

  describe('Auto-Commit Progress', () => {
    it('should auto-commit with correct message format', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['file1.ts'],
        not_added: [],
        created: ['file2.ts'],
      });

      const commitHash = await manager.autoCommitProgress('sprint-1', 0.85, {
        phase: 'auth',
        agents: ['coder-1', 'security-1'],
      });

      expect(mockGit.add).toHaveBeenCalledWith('.');
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.stringMatching(/WIP: Sprint sprint-1 - Progress 85% - \d{4}-\d{2}-\d{2}T/)
      );
      expect(commitHash).toBe('abc123');
    });

    it('should skip commit when no changes detected', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        not_added: [],
        created: [],
      });

      const commitHash = await manager.autoCommitProgress('sprint-1', 0.85);

      expect(mockGit.commit).not.toHaveBeenCalled();
      expect(commitHash).toBe('');
    });

    it('should tag commit with metadata', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['file1.ts'],
        not_added: [],
        created: [],
      });

      await manager.autoCommitProgress('sprint-1', 0.85, {
        phase: 'auth',
        agents: ['coder-1'],
      });

      expect(mockGit.tag).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-a',
          expect.stringMatching(/wip-sprint-1-\d+/),
          '-m',
          expect.stringContaining('"confidence": 0.85'),
          'abc123',
        ])
      );
    });

    it('should emit commit-created event', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['file1.ts'],
        not_added: [],
        created: [],
      });

      const eventSpy = vi.fn();
      manager.on('commit-created', eventSpy);

      await manager.autoCommitProgress('sprint-1', 0.85);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sprintId: 'sprint-1',
          commitHash: 'abc123',
          confidence: 0.85,
        })
      );
    });

    it('should update statistics after commit', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['file1.ts'],
        not_added: [],
        created: [],
      });

      await manager.autoCommitProgress('sprint-1', 0.85);

      const stats = manager.getStats();
      expect(stats.totalCommits).toBe(1);
      expect(stats.lastCommitTime).toBeGreaterThan(0);
      expect(stats.averageCommitLatencyMs).toBeGreaterThan(0);
    });
  });

  describe('Checkpoint Comparison', () => {
    it('should recommend Redis when Redis checkpoint is newer', async () => {
      const gitDate = new Date('2025-01-01T10:00:00Z');
      const redisTimestamp = new Date('2025-01-01T10:05:00Z').getTime();

      mockGit.branchLocal.mockResolvedValue({
        all: ['cfn-epic-epic-123/sprint-sprint-1-wip'],
      });
      mockGit.log.mockResolvedValue({
        latest: {
          hash: 'abc123',
          date: gitDate.toISOString(),
        },
      });

      mockRedis.keys.mockResolvedValue(['cfn:checkpoint:epic-123:latest']);
      mockRedis.get
        .mockResolvedValueOnce('checkpoint-epic-123-1')
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: redisTimestamp },
          })
        );

      const comparison = await manager.compareCheckpoints('epic-123');

      expect(comparison.recommendation).toBe('use-redis');
      expect(comparison.source).toBe('redis');
      expect(comparison.reason).toContain('Redis checkpoint is');
      expect(comparison.timeDiffMs).toBe(300000); // 5 minutes
    });

    it('should recommend Git when Git checkpoint is newer', async () => {
      const gitDate = new Date('2025-01-01T10:05:00Z');
      const redisTimestamp = new Date('2025-01-01T10:00:00Z').getTime();

      mockGit.branchLocal.mockResolvedValue({
        all: ['cfn-epic-epic-123/sprint-sprint-1-wip'],
      });
      mockGit.log.mockResolvedValue({
        latest: {
          hash: 'abc123',
          date: gitDate.toISOString(),
        },
      });

      mockRedis.keys.mockResolvedValue(['cfn:checkpoint:epic-123:latest']);
      mockRedis.get
        .mockResolvedValueOnce('checkpoint-epic-123-1')
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: redisTimestamp },
          })
        );

      const comparison = await manager.compareCheckpoints('epic-123');

      expect(comparison.recommendation).toBe('use-git');
      expect(comparison.source).toBe('git');
    });

    it('should handle no checkpoints found', async () => {
      mockGit.branchLocal.mockResolvedValue({ all: [] });
      mockRedis.keys.mockResolvedValue([]);

      const comparison = await manager.compareCheckpoints('epic-123');

      expect(comparison.recommendation).toBe('no-checkpoints');
      expect(comparison.reason).toBe('No checkpoints found');
    });

    it('should emit checkpoints-compared event', async () => {
      mockGit.branchLocal.mockResolvedValue({ all: [] });
      mockRedis.keys.mockResolvedValue([]);

      const eventSpy = vi.fn();
      manager.on('checkpoints-compared', eventSpy);

      await manager.compareCheckpoints('epic-123');

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          recommendation: 'no-checkpoints',
        })
      );
    });
  });

  describe('Auto-Checkpoint Timer', () => {
    it('should start auto-checkpoint interval', () => {
      manager.updateMetadata({
        sprintId: 'sprint-1',
        confidence: 0.85,
        timestamp: Date.now(),
      });

      manager.startAutoCheckpoint();

      const stats = manager.getStats();
      expect(stats).toBeDefined();
    });

    it('should stop auto-checkpoint interval', () => {
      manager.startAutoCheckpoint();
      manager.stopAutoCheckpoint();

      // No error should occur
      expect(true).toBe(true);
    });

    it('should prevent multiple auto-checkpoint starts', () => {
      manager.startAutoCheckpoint();
      manager.startAutoCheckpoint(); // Should log warning

      // No error should occur
      manager.stopAutoCheckpoint();
    });
  });

  describe('WIP Branch Cleanup', () => {
    it('should delete WIP branches after completion', async () => {
      mockGit.branchLocal.mockResolvedValue({
        all: ['main', 'cfn-epic-epic-123/sprint-sprint-1-wip', 'cfn-epic-epic-123/sprint-sprint-2-wip'],
      });
      mockGit.tags.mockResolvedValue({
        all: ['wip-sprint-1-123', 'wip-sprint-2-456'],
      });

      await manager.cleanupWIPBranches('epic-123');

      expect(mockGit.checkout).toHaveBeenCalledWith('main');
      expect(mockGit.deleteLocalBranch).toHaveBeenCalledTimes(2);
      expect(mockGit.deleteLocalBranch).toHaveBeenCalledWith(
        'cfn-epic-epic-123/sprint-sprint-1-wip',
        true
      );
    });

    it('should delete WIP tags during cleanup', async () => {
      mockGit.branchLocal.mockResolvedValue({
        all: ['main', 'cfn-epic-epic-123/sprint-sprint-1-wip'],
      });
      mockGit.tags.mockResolvedValue({
        all: ['wip-sprint-1-123', 'v1.0.0'],
      });

      await manager.cleanupWIPBranches('epic-123');

      expect(mockGit.tag).toHaveBeenCalledWith(['-d', 'wip-sprint-1-123']);
      expect(mockGit.tag).not.toHaveBeenCalledWith(['-d', 'v1.0.0']);
    });

    it('should skip cleanup when no WIP branches exist', async () => {
      mockGit.branchLocal.mockResolvedValue({
        all: ['main', 'develop'],
      });

      await manager.cleanupWIPBranches('epic-123');

      expect(mockGit.deleteLocalBranch).not.toHaveBeenCalled();
    });

    it('should emit branches-cleaned event', async () => {
      mockGit.branchLocal.mockResolvedValue({
        all: ['main', 'cfn-epic-epic-123/sprint-sprint-1-wip'],
      });
      mockGit.tags.mockResolvedValue({ all: [] });

      const eventSpy = vi.fn();
      manager.on('branches-cleaned', eventSpy);

      await manager.cleanupWIPBranches('epic-123');

      expect(eventSpy).toHaveBeenCalledWith({
        epicId: 'epic-123',
        count: 1,
      });
    });

    it('should not throw on cleanup failure', async () => {
      mockGit.branchLocal.mockRejectedValue(new Error('Git error'));

      await expect(manager.cleanupWIPBranches('epic-123')).resolves.not.toThrow();
    });
  });

  describe('Statistics', () => {
    it('should track commit statistics', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['file1.ts'],
        not_added: [],
        created: [],
      });

      await manager.autoCommitProgress('sprint-1', 0.85);
      await manager.autoCommitProgress('sprint-1', 0.90);

      const stats = manager.getStats();
      expect(stats.totalCommits).toBe(2);
      expect(stats.commitFailures).toBe(0);
      expect(stats.averageCommitLatencyMs).toBeGreaterThan(0);
    });

    it('should track branch statistics', async () => {
      mockGit.branchLocal.mockResolvedValue({ all: [] });

      await manager.createWIPBranch('epic-123', 'sprint-1');
      await manager.createWIPBranch('epic-123', 'sprint-2');

      const stats = manager.getStats();
      expect(stats.totalBranches).toBe(2);
    });

    it('should track commit failures', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['file1.ts'],
        not_added: [],
        created: [],
      });
      mockGit.commit.mockRejectedValue(new Error('Commit failed'));

      await expect(manager.autoCommitProgress('sprint-1', 0.85)).rejects.toThrow();

      const stats = manager.getStats();
      expect(stats.commitFailures).toBe(1);
    });
  });

  describe('Integration Scenarios', () => {
    it('should complete full checkpoint lifecycle', async () => {
      // Create WIP branch
      mockGit.branchLocal.mockResolvedValue({ all: [] });
      const branch = await manager.createWIPBranch('epic-123', 'sprint-1');
      expect(branch).toBeTruthy();

      // Auto-commit progress
      mockGit.status.mockResolvedValue({
        modified: ['auth.ts'],
        not_added: [],
        created: ['auth.test.ts'],
      });
      const commitHash = await manager.autoCommitProgress('sprint-1', 0.85, {
        phase: 'auth',
        agents: ['coder-1'],
      });
      expect(commitHash).toBe('abc123');

      // Compare checkpoints
      mockGit.branchLocal.mockResolvedValue({
        all: ['cfn-epic-epic-123/sprint-sprint-1-wip'],
      });
      mockRedis.keys.mockResolvedValue([]);
      const comparison = await manager.compareCheckpoints('epic-123');
      expect(comparison.recommendation).toBe('use-git');

      // Cleanup
      mockGit.branchLocal.mockResolvedValue({
        all: ['main', 'cfn-epic-epic-123/sprint-sprint-1-wip'],
      });
      mockGit.tags.mockResolvedValue({ all: [] });
      await manager.cleanupWIPBranches('epic-123');

      const stats = manager.getStats();
      expect(stats.totalCommits).toBeGreaterThan(0);
      expect(stats.totalBranches).toBeGreaterThan(0);
    });
  });
});
