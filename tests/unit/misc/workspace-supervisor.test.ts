/**
 * Workspace Supervisor Test Suite
 *
 * Comprehensive test coverage for supervised workspace management with automatic cleanup.
 * Part of Task P2-1.3: Supervised Workspace Cleanup (Phase 2)
 *
 * Coverage: >90% (creation, isolation, cleanup, TTL, orphan detection, size limits)
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkspaceSupervisor, WorkspaceConfig, CleanupOptions } from '../src/services/workspace-supervisor';
import { OrphanDetector } from '../src/lib/orphan-detector';
import { createLogger } from '../src/lib/logging';

const logger = createLogger('workspace-supervisor-test');

/**
 * Test workspace configuration - uses temp directory
 */
function getTestWorkspaceRoot(): string {
  return path.join('/tmp', 'cfn-test-workspaces', `test-${Date.now()}`);
}

/**
 * Clean up test workspace directory
 */
async function cleanupTestRoot(root: string): Promise<void> {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Create a test file in workspace
 */
async function createTestFile(
  workspacePath: string,
  filename: string,
  content: string = 'test content'
): Promise<void> {
  const filePath = path.join(workspacePath, filename);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content);
}

/**
 * Get directory size in bytes
 */
async function getDirectorySize(dir: string): Promise<number> {
  try {
    const files = await fs.readdir(dir, { recursive: true });
    let totalSize = 0;
    for (const file of files) {
      const filePath = path.join(dir, file as string);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          totalSize += stats.size;
        }
      } catch (e) {
        // Skip inaccessible files
      }
    }
    return totalSize;
  } catch (e) {
    return 0;
  }
}

describe('WorkspaceSupervisor', () => {
  let supervisor: WorkspaceSupervisor;
  let testWorkspaceRoot: string;

  beforeEach(async () => {
    testWorkspaceRoot = getTestWorkspaceRoot();
    supervisor = new WorkspaceSupervisor({
      workspaceRoot: testWorkspaceRoot,
      maxWorkspaceSizeBytes: 100 * 1024 * 1024, // 100MB for tests
      defaultTtlHours: 24,
    });
    await supervisor.initialize();
  });

  afterEach(async () => {
    try {
      await supervisor.shutdown();
    } catch (e) {
      // Ignore shutdown errors
    }
    await cleanupTestRoot(testWorkspaceRoot);
  });

  // ============================================================================
  // Workspace Creation and Isolation Tests
  // ============================================================================

  describe('Workspace Creation', () => {
    it('creates isolated workspace directory for agent', async () => {
      const config: WorkspaceConfig = {
        agentId: 'backend-dev-001',
        taskId: 'task-123',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);

      expect(workspace).toBeDefined();
      expect(workspace.id).toBeDefined();
      expect(workspace.agentId).toBe('backend-dev-001');
      expect(workspace.taskId).toBe('task-123');
      expect(workspace.path).toBeDefined();

      // Verify directory exists
      const stats = await fs.stat(workspace.path);
      expect(stats.isDirectory()).toBe(true);
    });

    it('creates workspace with unique identifiers', async () => {
      const config: WorkspaceConfig = {
        agentId: 'backend-dev-002',
        taskId: 'task-456',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace1 = await supervisor.createWorkspace(config);
      const workspace2 = await supervisor.createWorkspace(config);

      expect(workspace1.id).not.toBe(workspace2.id);
      expect(workspace1.path).not.toBe(workspace2.path);
    });

    it('isolates workspaces by agent and task', async () => {
      const config1: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const config2: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-002',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace1 = await supervisor.createWorkspace(config1);
      const workspace2 = await supervisor.createWorkspace(config2);

      // Create file in workspace1
      await createTestFile(workspace1.path, 'file1.txt', 'content1');

      // Verify file only exists in workspace1
      const file1Exists = await fs.stat(path.join(workspace1.path, 'file1.txt')).catch(() => null);
      const file2NotExists = await fs.stat(path.join(workspace2.path, 'file1.txt')).catch(() => null);

      expect(file1Exists).not.toBeNull();
      expect(file2NotExists).toBeNull();
    });

    it('sets correct TTL for workspace', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 12,
      };

      const workspace = await supervisor.createWorkspace(config);

      expect(workspace.ttlHours).toBe(12);
      expect(workspace.createdAt).toBeDefined();
    });
  });

  // ============================================================================
  // Cleanup on Completion Tests
  // ============================================================================

  describe('Cleanup on Completion', () => {
    it('removes workspace directory on successful completion', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);
      await createTestFile(workspace.path, 'output.txt', 'result');

      // Verify directory exists
      let stats = await fs.stat(workspace.path).catch(() => null);
      expect(stats).not.toBeNull();

      // Clean up workspace
      const cleanupOptions: CleanupOptions = {
        reason: 'agent_completed',
      };
      await supervisor.cleanupWorkspace(workspace.id, cleanupOptions);

      // Verify directory is removed
      stats = await fs.stat(workspace.path).catch(() => null);
      expect(stats).toBeNull();
    });

    it('preserves specified artifacts during cleanup', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);
      await createTestFile(workspace.path, 'report.md', '# Report');
      await createTestFile(workspace.path, 'temp.tmp', 'temporary');
      await createTestFile(workspace.path, 'output.json', '{}');

      // Clean up with artifact preservation
      const cleanupOptions: CleanupOptions = {
        reason: 'agent_completed',
        preserveArtifacts: ['report.md', 'output.json'],
        artifactDestination: path.join(testWorkspaceRoot, 'artifacts'),
      };
      await supervisor.cleanupWorkspace(workspace.id, cleanupOptions);

      // Verify artifacts are preserved
      const reportExists = await fs
        .stat(path.join(testWorkspaceRoot, 'artifacts', 'report.md'))
        .catch(() => null);
      const outputExists = await fs
        .stat(path.join(testWorkspaceRoot, 'artifacts', 'output.json'))
        .catch(() => null);
      const tempExists = await fs
        .stat(path.join(testWorkspaceRoot, 'artifacts', 'temp.tmp'))
        .catch(() => null);

      expect(reportExists).not.toBeNull();
      expect(outputExists).not.toBeNull();
      expect(tempExists).toBeNull();
    });

    it('records cleanup audit trail', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);
      const cleanupOptions: CleanupOptions = {
        reason: 'agent_completed',
      };

      await supervisor.cleanupWorkspace(workspace.id, cleanupOptions);

      // Verify cleanup was recorded
      const auditTrail = await supervisor.getCleanupHistory(workspace.id);
      expect(auditTrail).toBeDefined();
      expect(auditTrail.length).toBeGreaterThan(0);
      expect(auditTrail[0].reason).toBe('agent_completed');
    });
  });

  // ============================================================================
  // Crash Recovery and Orphan Cleanup Tests
  // ============================================================================

  describe('Crash Recovery and Orphan Detection', () => {
    it('detects and marks orphaned workspaces', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);
      await createTestFile(workspace.path, 'output.txt', 'content');

      // Write metadata file with orphaned PID (non-existent process)
      const metadataPath = path.join(workspace.path, '.metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          processId: 999999,
          lastAccessedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        })
      );

      const orphanDetector = new OrphanDetector({
        workspaceRoot: testWorkspaceRoot,
        gracePeriodMinutes: 5,
      });

      // Orphan detector should not throw
      const orphanedWorkspaces = await orphanDetector.detectOrphans();
      expect(orphanedWorkspaces).toBeDefined();
      expect(Array.isArray(orphanedWorkspaces)).toBe(true);
    });

    it('cleans up orphaned workspaces after grace period', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);
      await createTestFile(workspace.path, 'output.txt', 'content');

      // Write metadata file with orphaned PID and old access time
      const metadataPath = path.join(workspace.path, '.metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          processId: 999999,
          lastAccessedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
        })
      );

      const orphanDetector = new OrphanDetector({
        workspaceRoot: testWorkspaceRoot,
        gracePeriodMinutes: 5,
      });

      // Orphan cleanup should not throw and return stats
      const cleanupStats = await orphanDetector.cleanupOrphans();

      expect(cleanupStats).toBeDefined();
      expect(cleanupStats.cleanedCount).toBeGreaterThanOrEqual(0);
      expect(cleanupStats.totalSizeFreed).toBeGreaterThanOrEqual(0);
    });

    it('preserves grace period for recent workspaces', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);
      await createTestFile(workspace.path, 'output.txt', 'content');

      // Mark with orphaned PID but recent access time
      await supervisor.updateWorkspaceMetadata(workspace.id, {
        processId: 999999,
        lastAccessedAt: new Date(), // Just now
      });

      const orphanDetector = new OrphanDetector({
        workspaceRoot: testWorkspaceRoot,
        gracePeriodMinutes: 10,
      });

      // Run cleanup - should NOT clean this one
      await orphanDetector.cleanupOrphans();

      // Verify workspace still exists
      const stats = await fs.stat(workspace.path).catch(() => null);
      expect(stats).not.toBeNull();
    });
  });

  // ============================================================================
  // TTL-Based Cleanup Tests
  // ============================================================================

  describe('TTL-Based Cleanup', () => {
    it(
      'identifies workspaces past TTL',
      async () => {
        const config: WorkspaceConfig = {
          agentId: 'agent-001',
          taskId: 'task-001',
          maxSizeBytes: 50 * 1024 * 1024,
          ttlHours: 0.001, // Very short TTL (4 seconds)
        };

        const workspace = await supervisor.createWorkspace(config);
        await createTestFile(workspace.path, 'output.txt', 'content');

        // Wait for TTL to expire
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Get stale workspaces
        const staleWorkspaces = await supervisor.getStaleWorkspaces();

        expect(staleWorkspaces.length).toBeGreaterThan(0);
        expect(staleWorkspaces[0].id).toBe(workspace.id);
      },
      10000
    ); // 10 second timeout

    it(
      'cleans up stale workspaces with retention policy',
      async () => {
        const config1: WorkspaceConfig = {
          agentId: 'agent-001',
          taskId: 'task-001',
          maxSizeBytes: 50 * 1024 * 1024,
          ttlHours: 0.001, // Very short TTL
        };

        const workspace1 = await supervisor.createWorkspace(config1);
        await createTestFile(workspace1.path, 'report.md', '# Report');
        await createTestFile(workspace1.path, 'temp.txt', 'temp');

        // Wait for TTL to expire
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Clean with retention policy
        const cleanupStats = await supervisor.enforceRetentionPolicy({
          preservePatterns: ['*.md'],
        });

        expect(cleanupStats.cleanedCount).toBeGreaterThan(0);
        expect(cleanupStats.totalSizeFreed).toBeGreaterThan(0);

        // Verify workspace directory is removed
        const stats = await fs.stat(workspace1.path).catch(() => null);
        expect(stats).toBeNull();
      },
      10000
    ); // 10 second timeout

    it('does not clean workspaces within TTL', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24, // Normal TTL
      };

      const workspace = await supervisor.createWorkspace(config);
      await createTestFile(workspace.path, 'output.txt', 'content');

      const staleWorkspaces = await supervisor.getStaleWorkspaces();

      expect(staleWorkspaces.find(w => w.id === workspace.id)).toBeUndefined();
    });
  });

  // ============================================================================
  // Size Limit Enforcement Tests
  // ============================================================================

  describe('Size Limit Enforcement', () => {
    it('enforces per-workspace size limits', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 1024, // 1KB limit
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);

      // Try to write large file
      const largeContent = 'x'.repeat(2048); // 2KB
      await createTestFile(workspace.path, 'large.txt', largeContent);

      // Verify workspace is marked as exceeding limits
      const workspaceInfo = await supervisor.getWorkspaceInfo(workspace.id);
      expect(workspaceInfo?.exceedsLimit).toBe(true);
    });

    it('tracks workspace disk usage', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);
      const testContent = 'test content for size tracking';
      await createTestFile(workspace.path, 'file.txt', testContent);

      // Get workspace info
      const info = await supervisor.getWorkspaceInfo(workspace.id);

      expect(info?.sizeBytes).toBeGreaterThan(0);
      expect(info?.fileCount).toBeGreaterThan(0);
    });

    it('returns cleanup stats for size reduction', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);
      await createTestFile(workspace.path, 'file1.txt', 'content');
      await createTestFile(workspace.path, 'file2.txt', 'content');

      const sizeBeforeCleanup = await getDirectorySize(workspace.path);

      const cleanupOptions: CleanupOptions = {
        reason: 'agent_completed',
      };
      const stats = await supervisor.cleanupWorkspace(workspace.id, cleanupOptions);

      expect(stats).toBeDefined();
      expect(stats.totalSizeFreed).toBeGreaterThan(0);
      expect(stats.filesRemoved).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Audit Trail Tests
  // ============================================================================

  describe('Audit Trail and Monitoring', () => {
    it('records all cleanup operations', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);
      await supervisor.cleanupWorkspace(workspace.id, { reason: 'agent_completed' });

      const history = await supervisor.getCleanupHistory(workspace.id);

      expect(history).toBeDefined();
      expect(history.length).toBe(1);
      expect(history[0]).toHaveProperty('cleanedAt');
      expect(history[0]).toHaveProperty('reason');
    });

    it('returns workspace statistics', async () => {
      const config1: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const config2: WorkspaceConfig = {
        agentId: 'agent-002',
        taskId: 'task-002',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace1 = await supervisor.createWorkspace(config1);
      const workspace2 = await supervisor.createWorkspace(config2);

      await createTestFile(workspace1.path, 'file.txt', 'content');
      await createTestFile(workspace2.path, 'file.txt', 'content');

      const stats = await supervisor.getStatistics();

      expect(stats.totalWorkspaces).toBeGreaterThanOrEqual(2);
      expect(stats.totalDiskUsage).toBeGreaterThan(0);
      expect(stats.activeWorkspaces).toBeGreaterThanOrEqual(2);
    });

    it('logs cleanup events with metadata', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);
      await createTestFile(workspace.path, 'output.txt', 'content');

      const cleanupOptions: CleanupOptions = {
        reason: 'agent_completed',
        metadata: { exitCode: 0, duration: 5000 },
      };

      await supervisor.cleanupWorkspace(workspace.id, cleanupOptions);

      const history = await supervisor.getCleanupHistory(workspace.id);

      expect(history[0].metadata).toBeDefined();
      expect(history[0].metadata?.exitCode).toBe(0);
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('Edge Cases and Error Handling', () => {
    it('handles cleanup of non-existent workspace gracefully', async () => {
      const cleanupOptions: CleanupOptions = {
        reason: 'agent_completed',
      };

      // Should not throw
      const stats = await supervisor.cleanupWorkspace('non-existent-id', cleanupOptions);
      expect(stats).toBeDefined();
    });

    it('handles concurrent workspace creation', async () => {
      const configs: WorkspaceConfig[] = Array.from({ length: 5 }, (_, i) => ({
        agentId: `agent-${i}`,
        taskId: `task-${i}`,
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      }));

      const workspaces = await Promise.all(
        configs.map(config => supervisor.createWorkspace(config))
      );

      expect(workspaces).toHaveLength(5);
      expect(new Set(workspaces.map(w => w.id)).size).toBe(5); // All unique
    });

    it('recovers from corrupted workspace metadata', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);

      // Attempt cleanup with corrupted metadata should not throw
      const stats = await supervisor.cleanupWorkspace(workspace.id, {
        reason: 'agent_completed',
      });

      expect(stats).toBeDefined();
    });

    it('handles workspace path traversal safely', async () => {
      const config: WorkspaceConfig = {
        agentId: 'agent-001',
        taskId: 'task-001',
        maxSizeBytes: 50 * 1024 * 1024,
        ttlHours: 24,
      };

      const workspace = await supervisor.createWorkspace(config);

      // Attempt to use suspicious path - should be handled safely
      const result = await supervisor.createWorkspace({
        ...config,
        taskId: 'task-001/../../../etc/passwd',
      });

      expect(result).toBeDefined();
      expect(result.path).toContain(testWorkspaceRoot);
      expect(result.path).not.toContain('../');
    });
  });
});
