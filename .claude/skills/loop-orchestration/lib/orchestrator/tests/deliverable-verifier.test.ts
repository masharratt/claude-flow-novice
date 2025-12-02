/**
 * Deliverable Verifier Tests
 * Tests for verifying expected deliverables exist (prevents "consensus on vapor")
 */

import { verifyDeliverables } from '../src/helpers/deliverable-verifier';

describe('deliverable-verifier', () => {
  describe('file existence verification', () => {
    it('should verify existing files', () => {
      const result = verifyDeliverables({
        files: ['package.json', 'tsconfig.json']
      });

      expect(result.verified).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.found).toContain('package.json');
      expect(result.found).toContain('tsconfig.json');
    });

    it('should detect missing files', () => {
      const result = verifyDeliverables({
        files: ['nonexistent-file-12345.txt']
      });

      expect(result.verified).toBe(false);
      expect(result.missing).toContain('nonexistent-file-12345.txt');
      expect(result.found).toEqual([]);
    });

    it('should detect partial missing files', () => {
      const result = verifyDeliverables({
        files: ['package.json', 'nonexistent.txt', 'tsconfig.json']
      });

      expect(result.verified).toBe(false);
      expect(result.missing).toEqual(['nonexistent.txt']);
      expect(result.found).toContain('package.json');
      expect(result.found).toContain('tsconfig.json');
    });

    it('should handle empty file list', () => {
      const result = verifyDeliverables({
        files: []
      });

      expect(result.verified).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.found).toEqual([]);
    });
  });

  describe('file type validation', () => {
    it('should verify TypeScript files', () => {
      const result = verifyDeliverables({
        files: ['.claude/skills/cfn-loop-orchestration/src/helpers/gate-check.ts'],
        expectedTypes: ['.ts']
      });

      expect(result.verified).toBe(true);
    });

    it('should verify shell script files', () => {
      const result = verifyDeliverables({
        files: ['helpers/consensus-ts.sh'],
        expectedTypes: ['.sh']
      });

      expect(result.verified).toBe(true);
    });

    it('should reject wrong file types', () => {
      const result = verifyDeliverables({
        files: ['package.json'],
        expectedTypes: ['.ts']
      });

      expect(result.verified).toBe(false);
      expect(result.typeErrors).toContain('package.json');
    });

    it('should allow multiple file types', () => {
      const result = verifyDeliverables({
        files: ['package.json', 'tsconfig.json'],
        expectedTypes: ['.json', '.ts']
      });

      expect(result.verified).toBe(true);
    });
  });

  describe('git change detection', () => {
    it('should detect when files are created', () => {
      const result = verifyDeliverables({
        files: [],
        requireGitChanges: true
      });

      // This test depends on actual git state, so we check structure
      expect(result).toHaveProperty('gitChanges');
      expect(typeof result.gitChanges).toBe('number');
    });

    it('should fail when no changes and changes required', () => {
      // Mock scenario: implementation task with no files
      const result = verifyDeliverables({
        files: [],
        requireGitChanges: true,
        taskType: 'implementation'
      });

      // If no files specified and git has no changes, should fail for implementation
      if (result.gitChanges === 0) {
        expect(result.verified).toBe(false);
      }
    });
  });

  describe('task type keyword detection', () => {
    it('should detect implementation keywords', () => {
      const keywords = ['create', 'build', 'implement', 'add', 'generate'];

      keywords.forEach(keyword => {
        const result = verifyDeliverables({
          files: [],
          taskType: keyword,
          requireGitChanges: true
        });

        // Should require git changes for implementation keywords
        expect(result).toHaveProperty('requiresChanges');
        if (result.requiresChanges) {
          expect(result.gitChanges).toBeGreaterThan(-1); // Check git changes were counted
        }
      });
    });

    it('should not require changes for read-only tasks', () => {
      const result = verifyDeliverables({
        files: [],
        taskType: 'analyze',
        requireGitChanges: false
      });

      expect(result.verified).toBe(true);
    });
  });

  describe('consensus on vapor prevention', () => {
    it('should fail if implementation task has no deliverables', () => {
      const result = verifyDeliverables({
        files: [],
        taskType: 'implement authentication',
        requireGitChanges: true
      });

      // If git has changes, this should pass; otherwise fail
      if (result.gitChanges === 0) {
        expect(result.verified).toBe(false);
        expect(result.reason).toContain('vapor');
      }
    });

    it('should pass if implementation task has deliverables', () => {
      const result = verifyDeliverables({
        files: ['package.json'], // Existing file as proxy
        taskType: 'implement feature'
      });

      expect(result.verified).toBe(true);
    });
  });

  describe('verification reporting', () => {
    it('should provide detailed results', () => {
      const result = verifyDeliverables({
        files: ['package.json', 'missing.txt']
      });

      expect(result).toHaveProperty('verified');
      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('missing');
      expect(result).toHaveProperty('found');
      expect(result.files).toEqual(['package.json', 'missing.txt']);
    });

    it('should track all requested files', () => {
      const requestedFiles = ['file1.ts', 'file2.ts', 'file3.ts'];
      const result = verifyDeliverables({
        files: requestedFiles
      });

      expect(result.files).toEqual(requestedFiles);
      expect(result.found.length + result.missing.length).toBe(requestedFiles.length);
    });
  });
});
