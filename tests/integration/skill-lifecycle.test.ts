/**
 * Integration Test Suite: Skill Lifecycle Management
 *
 * Tests integration points from:
 * - Task 1.1: Skill Registry Foundation
 * - Task 1.2: Skill Dependency Resolution
 * - Task 1.3: Artifact Storage & Retrieval
 * - Task 1.4: Skill Versioning
 * - Task 1.5: Edge Case Detection
 * - Task 4.1: Skill Content Storage
 * - Task 4.2: File Locking Mechanisms
 *
 * Coverage: 9 integration points
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { SkillContentManager } from '../../src/lib/skill-content-manager';
import { FileLockManager } from '../../src/lib/file-lock-manager';
import { EdgeCaseDetector } from '../../src/lib/edge-case-detector';
import { EdgeCaseAnalyzer } from '../../src/lib/edge-case-analyzer';
import { SkillLoader } from '../../src/cli/skill-loader';

describe('Skill Lifecycle Integration', () => {
  let contentManager: SkillContentManager;
  let lockManager: FileLockManager;
  let edgeDetector: EdgeCaseDetector;
  let edgeAnalyzer: EdgeCaseAnalyzer;
  let skillLoader: SkillLoader;
  let testDir: string;

  beforeAll(async () => {
    testDir = path.join(process.cwd(), '.test-skills');
    await fs.mkdir(testDir, { recursive: true });

    contentManager = new SkillContentManager({
      baseDir: testDir,
      enableVersioning: true,
      enableLocking: true,
    });

    lockManager = new FileLockManager({
      lockDir: path.join(testDir, '.locks'),
      timeout: 5000,
    });

    edgeDetector = new EdgeCaseDetector();
    edgeAnalyzer = new EdgeCaseAnalyzer();
    skillLoader = new SkillLoader({ baseDir: testDir });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clean test directory
    const files = await fs.readdir(testDir);
    for (const file of files) {
      if (file !== '.locks') {
        await fs.rm(path.join(testDir, file), { recursive: true, force: true });
      }
    }
  });

  describe('Task 1.1: Skill Registry Foundation', () => {
    it('should register and retrieve skills', async () => {
      const skill = {
        id: 'test-skill-001',
        name: 'Test Skill',
        version: '1.0.0',
        content: '# Test Skill\n\nThis is a test skill.',
        metadata: {
          author: 'test',
          category: 'testing',
        },
      };

      await contentManager.saveSkill(skill);
      const retrieved = await contentManager.loadSkill(skill.id);

      expect(retrieved).toMatchObject(skill);
    });

    it('should list all registered skills', async () => {
      const skills = [
        { id: 'skill-001', name: 'Skill 1', version: '1.0.0', content: 'content1' },
        { id: 'skill-002', name: 'Skill 2', version: '1.0.0', content: 'content2' },
        { id: 'skill-003', name: 'Skill 3', version: '1.0.0', content: 'content3' },
      ];

      for (const skill of skills) {
        await contentManager.saveSkill(skill);
      }

      const allSkills = await contentManager.listSkills();
      expect(allSkills.length).toBeGreaterThanOrEqual(3);

      const skillIds = allSkills.map(s => s.id);
      expect(skillIds).toContain('skill-001');
      expect(skillIds).toContain('skill-002');
      expect(skillIds).toContain('skill-003');
    });

    it('should handle skill updates', async () => {
      const skillId = 'update-test-001';

      await contentManager.saveSkill({
        id: skillId,
        name: 'Original Name',
        version: '1.0.0',
        content: 'original content',
      });

      await contentManager.saveSkill({
        id: skillId,
        name: 'Updated Name',
        version: '1.1.0',
        content: 'updated content',
      });

      const updated = await contentManager.loadSkill(skillId);
      expect(updated.name).toBe('Updated Name');
      expect(updated.version).toBe('1.1.0');
    });
  });

  describe('Task 1.2: Skill Dependency Resolution', () => {
    it('should resolve skill dependencies correctly', async () => {
      const baseSkill = {
        id: 'base-skill',
        name: 'Base Skill',
        version: '1.0.0',
        content: '# Base Skill',
      };

      const dependentSkill = {
        id: 'dependent-skill',
        name: 'Dependent Skill',
        version: '1.0.0',
        content: '# Dependent Skill',
        dependencies: ['base-skill'],
      };

      await contentManager.saveSkill(baseSkill);
      await contentManager.saveSkill(dependentSkill);

      const resolved = await skillLoader.resolveSkillDependencies('dependent-skill');
      expect(resolved).toHaveLength(2);
      expect(resolved[0].id).toBe('base-skill');
      expect(resolved[1].id).toBe('dependent-skill');
    });

    it('should detect circular dependencies', async () => {
      const skillA = {
        id: 'skill-a',
        name: 'Skill A',
        version: '1.0.0',
        content: '# Skill A',
        dependencies: ['skill-b'],
      };

      const skillB = {
        id: 'skill-b',
        name: 'Skill B',
        version: '1.0.0',
        content: '# Skill B',
        dependencies: ['skill-a'],
      };

      await contentManager.saveSkill(skillA);
      await contentManager.saveSkill(skillB);

      await expect(
        skillLoader.resolveSkillDependencies('skill-a')
      ).rejects.toThrow(/circular dependency/i);
    });

    it('should handle deep dependency chains', async () => {
      // Create chain: skill-d -> skill-c -> skill-b -> skill-a
      await contentManager.saveSkill({ id: 'skill-a', name: 'A', version: '1.0.0', content: 'a' });
      await contentManager.saveSkill({ id: 'skill-b', name: 'B', version: '1.0.0', content: 'b', dependencies: ['skill-a'] });
      await contentManager.saveSkill({ id: 'skill-c', name: 'C', version: '1.0.0', content: 'c', dependencies: ['skill-b'] });
      await contentManager.saveSkill({ id: 'skill-d', name: 'D', version: '1.0.0', content: 'd', dependencies: ['skill-c'] });

      const resolved = await skillLoader.resolveSkillDependencies('skill-d');
      expect(resolved).toHaveLength(4);
      expect(resolved.map(s => s.id)).toEqual(['skill-a', 'skill-b', 'skill-c', 'skill-d']);
    });
  });

  describe('Task 1.3: Artifact Storage & Retrieval', () => {
    it('should store and retrieve skill artifacts', async () => {
      const skillId = 'artifact-skill-001';
      const artifact = {
        type: 'output',
        data: { result: 'test result', confidence: 0.85 },
        timestamp: new Date().toISOString(),
      };

      await contentManager.saveArtifact(skillId, 'execution-001', artifact);
      const retrieved = await contentManager.loadArtifact(skillId, 'execution-001');

      expect(retrieved).toMatchObject(artifact);
    });

    it('should list artifacts for a skill', async () => {
      const skillId = 'multi-artifact-skill';

      for (let i = 1; i <= 5; i++) {
        await contentManager.saveArtifact(skillId, `exec-${i}`, {
          type: 'output',
          data: { iteration: i },
        });
      }

      const artifacts = await contentManager.listArtifacts(skillId);
      expect(artifacts).toHaveLength(5);
    });

    it('should support artifact metadata and querying', async () => {
      const skillId = 'metadata-skill';

      await contentManager.saveArtifact(skillId, 'exec-1', {
        type: 'output',
        data: { status: 'success' },
        metadata: { confidence: 0.9, duration: 1000 },
      });

      await contentManager.saveArtifact(skillId, 'exec-2', {
        type: 'output',
        data: { status: 'failure' },
        metadata: { confidence: 0.3, duration: 500 },
      });

      const successArtifacts = await contentManager.queryArtifacts(skillId, {
        'metadata.confidence': { $gte: 0.75 },
      });

      expect(successArtifacts).toHaveLength(1);
      expect(successArtifacts[0].data.status).toBe('success');
    });
  });

  describe('Task 1.4: Skill Versioning', () => {
    it('should maintain skill version history', async () => {
      const skillId = 'versioned-skill';

      await contentManager.saveSkill({ id: skillId, version: '1.0.0', content: 'v1.0.0' });
      await contentManager.saveSkill({ id: skillId, version: '1.1.0', content: 'v1.1.0' });
      await contentManager.saveSkill({ id: skillId, version: '2.0.0', content: 'v2.0.0' });

      const versions = await contentManager.getSkillVersions(skillId);
      expect(versions).toHaveLength(3);
      expect(versions).toContain('1.0.0');
      expect(versions).toContain('1.1.0');
      expect(versions).toContain('2.0.0');
    });

    it('should retrieve specific skill versions', async () => {
      const skillId = 'version-retrieval';

      await contentManager.saveSkill({ id: skillId, version: '1.0.0', content: 'original' });
      await contentManager.saveSkill({ id: skillId, version: '2.0.0', content: 'updated' });

      const v1 = await contentManager.loadSkill(skillId, '1.0.0');
      const v2 = await contentManager.loadSkill(skillId, '2.0.0');

      expect(v1.content).toBe('original');
      expect(v2.content).toBe('updated');
    });

    it('should support semantic version comparison', async () => {
      const skillId = 'semver-skill';

      await contentManager.saveSkill({ id: skillId, version: '1.0.0', content: 'v1' });
      await contentManager.saveSkill({ id: skillId, version: '1.0.1', content: 'v1.0.1' });
      await contentManager.saveSkill({ id: skillId, version: '1.1.0', content: 'v1.1' });
      await contentManager.saveSkill({ id: skillId, version: '2.0.0', content: 'v2' });

      const latest = await contentManager.getLatestVersion(skillId);
      expect(latest).toBe('2.0.0');

      const latestMinor = await contentManager.getLatestVersion(skillId, '1.x');
      expect(latestMinor).toBe('1.1.0');
    });
  });

  describe('Task 1.5: Edge Case Detection', () => {
    it('should detect edge cases in skill inputs', async () => {
      const testCases = [
        { input: '', expected: 'empty_string' },
        { input: null, expected: 'null_value' },
        { input: undefined, expected: 'undefined_value' },
        { input: [], expected: 'empty_array' },
        { input: {}, expected: 'empty_object' },
        { input: ' ', expected: 'whitespace_only' },
        { input: Number.MAX_VALUE, expected: 'max_number' },
        { input: Number.MIN_VALUE, expected: 'min_number' },
      ];

      for (const testCase of testCases) {
        const detected = edgeDetector.detect(testCase.input);
        expect(detected.type).toBe(testCase.expected);
      }
    });

    it('should analyze skill execution for edge cases', async () => {
      const executionResult = {
        status: 'completed',
        output: null,
        errors: [],
        warnings: ['unusual pattern detected'],
      };

      const analysis = await edgeAnalyzer.analyze(executionResult);

      expect(analysis.edgeCasesDetected).toBeGreaterThan(0);
      expect(analysis.details).toContainEqual(
        expect.objectContaining({ type: 'null_output' })
      );
    });

    it('should provide recommendations for edge case handling', async () => {
      const edgeCase = {
        type: 'timeout',
        context: { duration: 30000, expected: 5000 },
      };

      const recommendations = edgeAnalyzer.getRecommendations(edgeCase);

      expect(recommendations).toContain('increase_timeout');
      expect(recommendations).toContain('add_retry_logic');
    });
  });

  describe('Task 4.1: Skill Content Storage', () => {
    it('should store skill content with proper file structure', async () => {
      const skillId = 'content-storage-test';
      const content = `# Test Skill

## Description
This is a comprehensive test skill.

## Usage
\`\`\`bash
./test-skill.sh
\`\`\`
`;

      await contentManager.saveSkill({ id: skillId, version: '1.0.0', content });

      const filePath = path.join(testDir, skillId, '1.0.0', 'SKILL.md');
      const fileContent = await fs.readFile(filePath, 'utf-8');

      expect(fileContent).toBe(content);
    });

    it('should handle large skill content efficiently', async () => {
      const skillId = 'large-skill';
      const largeContent = '#'.repeat(1024 * 1024); // 1MB content

      const start = Date.now();
      await contentManager.saveSkill({ id: skillId, version: '1.0.0', content: largeContent });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete within 1s

      const retrieved = await contentManager.loadSkill(skillId);
      expect(retrieved.content.length).toBe(largeContent.length);
    });

    it('should support binary artifact storage', async () => {
      const skillId = 'binary-artifact-skill';
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);

      await contentManager.saveArtifact(skillId, 'binary-exec', {
        type: 'binary',
        data: binaryData.toString('base64'),
      });

      const retrieved = await contentManager.loadArtifact(skillId, 'binary-exec');
      const decodedData = Buffer.from(retrieved.data, 'base64');

      expect(decodedData).toEqual(binaryData);
    });
  });

  describe('Task 4.2: File Locking Mechanisms', () => {
    it('should acquire and release file locks', async () => {
      const fileId = 'test-file-001';

      const lock = await lockManager.acquire(fileId);
      expect(lock).toBeTruthy();
      expect(lock.fileId).toBe(fileId);

      await lockManager.release(lock.lockId);

      // Should be able to acquire again after release
      const lock2 = await lockManager.acquire(fileId);
      expect(lock2).toBeTruthy();

      await lockManager.release(lock2.lockId);
    });

    it('should prevent concurrent access to locked files', async () => {
      const fileId = 'concurrent-test';

      const lock1 = await lockManager.acquire(fileId);

      // Second acquire should timeout
      await expect(
        lockManager.acquire(fileId, { timeout: 1000 })
      ).rejects.toThrow(/timeout/i);

      await lockManager.release(lock1.lockId);
    });

    it('should handle lock timeout and auto-release', async () => {
      const fileId = 'timeout-test';

      const lock = await lockManager.acquire(fileId, { ttl: 2000 });

      // Wait for lock to expire
      await new Promise(resolve => setTimeout(resolve, 2100));

      // Should be able to acquire new lock after expiration
      const lock2 = await lockManager.acquire(fileId);
      expect(lock2).toBeTruthy();

      await lockManager.release(lock2.lockId);
    });

    it('should support read/write lock modes', async () => {
      const fileId = 'rw-lock-test';

      // Multiple readers should be allowed
      const readLock1 = await lockManager.acquire(fileId, { mode: 'read' });
      const readLock2 = await lockManager.acquire(fileId, { mode: 'read' });

      expect(readLock1).toBeTruthy();
      expect(readLock2).toBeTruthy();

      // Write lock should wait
      const writeLockPromise = lockManager.acquire(fileId, { mode: 'write', timeout: 1000 });
      await expect(writeLockPromise).rejects.toThrow(/timeout/i);

      await lockManager.release(readLock1.lockId);
      await lockManager.release(readLock2.lockId);

      // Now write lock should succeed
      const writeLock = await lockManager.acquire(fileId, { mode: 'write' });
      expect(writeLock).toBeTruthy();

      await lockManager.release(writeLock.lockId);
    });
  });

  describe('End-to-End Skill Lifecycle', () => {
    it('should handle complete skill creation, deployment, and execution workflow', async () => {
      const skillId = 'e2e-lifecycle-skill';

      // 1. Create skill with dependencies
      await contentManager.saveSkill({
        id: 'base-utility',
        version: '1.0.0',
        content: '# Base Utility',
      });

      await contentManager.saveSkill({
        id: skillId,
        version: '1.0.0',
        content: '# E2E Test Skill',
        dependencies: ['base-utility'],
      });

      // 2. Resolve dependencies
      const resolved = await skillLoader.resolveSkillDependencies(skillId);
      expect(resolved).toHaveLength(2);

      // 3. Lock for execution
      const lock = await lockManager.acquire(skillId);

      try {
        // 4. Execute skill (simulated)
        const executionResult = {
          status: 'success',
          output: { result: 'execution complete' },
          confidence: 0.92,
        };

        // 5. Detect edge cases
        const edgeAnalysis = await edgeAnalyzer.analyze(executionResult);

        // 6. Store execution artifact
        await contentManager.saveArtifact(skillId, 'e2e-exec-001', {
          type: 'execution',
          data: executionResult,
          metadata: {
            edgeCases: edgeAnalysis.edgeCasesDetected,
            timestamp: new Date().toISOString(),
          },
        });

        // 7. Verify artifact storage
        const artifact = await contentManager.loadArtifact(skillId, 'e2e-exec-001');
        expect(artifact.data.confidence).toBe(0.92);

      } finally {
        // 8. Release lock
        await lockManager.release(lock.lockId);
      }

      // 9. Update skill version
      await contentManager.saveSkill({
        id: skillId,
        version: '1.1.0',
        content: '# E2E Test Skill - Updated',
      });

      // 10. Verify version history
      const versions = await contentManager.getSkillVersions(skillId);
      expect(versions).toContain('1.0.0');
      expect(versions).toContain('1.1.0');
    });
  });

  describe('Performance & Reliability', () => {
    it('should handle concurrent skill operations efficiently', async () => {
      const promises = [];

      for (let i = 0; i < 20; i++) {
        promises.push(
          contentManager.saveSkill({
            id: `concurrent-skill-${i}`,
            version: '1.0.0',
            content: `Skill ${i}`,
          })
        );
      }

      const start = Date.now();
      await Promise.all(promises);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(3000); // Should complete within 3s

      const skills = await contentManager.listSkills();
      expect(skills.length).toBeGreaterThanOrEqual(20);
    });

    it('should recover from file system errors gracefully', async () => {
      const skillId = 'recovery-test';

      // Simulate disk full by creating invalid path
      await expect(
        contentManager.saveSkill({
          id: skillId + '\0',
          version: '1.0.0',
          content: 'test',
        })
      ).rejects.toThrow();

      // Normal operation should still work
      await contentManager.saveSkill({
        id: skillId,
        version: '1.0.0',
        content: 'test',
      });

      const retrieved = await contentManager.loadSkill(skillId);
      expect(retrieved).toBeTruthy();
    });
  });
});
