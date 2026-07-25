/**
 * Patch Generator Tests
 * Part of Task 5.1: Edge Case Analyzer & Skill Patcher
 *
 * Test Coverage:
 * - Simple patch template generation
 * - Patch types (error handling, null checks, type validation, timeout, file checks)
 * - Confidence calculation (≥0.85 threshold)
 * - Patch preview generation
 * - Integration with edge case patterns
 * - Error handling and validation
 *
 * Target: 85%+ code coverage
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import {
  PatchGenerator,
  PatchType,
  Patch,
  PatchProposal,
  PatchStatus,
} from '../src/services/patch-generator';
import { FailureCategory, Failure } from '../src/services/edge-case-analyzer';
import { StandardError, ErrorCode } from '../src/lib/errors';

// Test configuration
const TEST_DIR = path.join(__dirname, '.test-patch-generator');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-patches.db');

describe('PatchGenerator', () => {
  let generator: PatchGenerator;
  let db: Database.Database;

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    // Remove old database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Create database with skill_patches table
    db = new Database(TEST_DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS skill_patches (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        failure_id TEXT NOT NULL,
        category TEXT NOT NULL,
        patch_content TEXT NOT NULL,
        confidence REAL NOT NULL,
        status TEXT DEFAULT 'PENDING_UPDATE',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        approved_by TEXT,
        deployed_at TEXT,
        success INTEGER,
        rollback_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_skill_patches_skill ON skill_patches(skill_id);
      CREATE INDEX IF NOT EXISTS idx_skill_patches_status ON skill_patches(status);
      CREATE INDEX IF NOT EXISTS idx_skill_patches_confidence ON skill_patches(confidence);
    `);

    generator = new PatchGenerator({ dbPath: TEST_DB_PATH });
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    // Clean up test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('generatePatch', () => {
    it('should generate error handling patch for uncaught errors', () => {
      const failure: Failure = {
        id: 'fail-1',
        skillId: 'test-skill',
        category: FailureCategory.LOGIC_ERROR,
        errorMessage: 'Uncaught error in operation',
        stackTrace: 'at executeOperation (/path/to/skill.ts:42:7)',
        context: { operation: 'execute' },
        detectedAt: new Date(),
        patternHash: 'hash1',
      };

      const patch = generator.generatePatch(failure, FailureCategory.LOGIC_ERROR);

      expect(patch.type).toBe(PatchType.ADD_ERROR_HANDLING);
      expect(patch.content).toContain('try');
      expect(patch.content).toContain('catch');
      expect(patch.content).toContain('StandardError');
      expect(patch.targetFile).toContain('skill.ts');
      expect(patch.targetLine).toBe(42);
    });

    it('should generate null check patch for null/undefined errors', () => {
      const failure: Failure = {
        id: 'fail-2',
        skillId: 'test-skill',
        category: FailureCategory.VALIDATION_ERROR,
        errorMessage: 'Cannot read property of null',
        stackTrace: 'at processData (/path/to/handler.ts:15:10)',
        context: { variable: 'userData' },
        detectedAt: new Date(),
        patternHash: 'hash2',
      };

      const patch = generator.generatePatch(failure, FailureCategory.VALIDATION_ERROR);

      expect(patch.type).toBe(PatchType.ADD_NULL_CHECK);
      expect(patch.content).toContain('null');
      expect(patch.content).toContain('undefined');
      expect(patch.content).toContain('StandardError');
      expect(patch.targetFile).toContain('handler.ts');
      expect(patch.targetLine).toBe(15);
    });

    it('should generate type validation patch for type errors', () => {
      const failure: Failure = {
        id: 'fail-3',
        skillId: 'test-skill',
        category: FailureCategory.VALIDATION_ERROR,
        errorMessage: 'Expected string but got number',
        stackTrace: 'at validateInput (/path/to/validator.ts:20:5)',
        context: { expectedType: 'string', actualType: 'number' },
        detectedAt: new Date(),
        patternHash: 'hash3',
      };

      const patch = generator.generatePatch(failure, FailureCategory.VALIDATION_ERROR);

      expect(patch.type).toBe(PatchType.ADD_TYPE_VALIDATION);
      expect(patch.content).toContain('typeof');
      expect(patch.content).toContain('string');
      expect(patch.targetFile).toContain('validator.ts');
      expect(patch.targetLine).toBe(20);
    });

    it('should generate timeout patch for timeout errors', () => {
      const failure: Failure = {
        id: 'fail-4',
        skillId: 'test-skill',
        category: FailureCategory.TIMEOUT,
        errorMessage: 'Operation timed out after 5000ms',
        stackTrace: 'at longRunningTask (/path/to/task.ts:30:12)',
        context: { timeout: 5000 },
        detectedAt: new Date(),
        patternHash: 'hash4',
      };

      const patch = generator.generatePatch(failure, FailureCategory.TIMEOUT);

      expect(patch.type).toBe(PatchType.ADD_TIMEOUT);
      expect(patch.content).toContain('withTimeout');
      expect(patch.content).toContain('5000');
      expect(patch.targetFile).toContain('task.ts');
      expect(patch.targetLine).toBe(30);
    });

    it('should generate file check patch for file not found errors', () => {
      const failure: Failure = {
        id: 'fail-5',
        skillId: 'test-skill',
        category: FailureCategory.LOGIC_ERROR,
        errorMessage: 'File not found: /path/to/file.txt',
        stackTrace: 'at readFile (/path/to/fileHandler.ts:10:8)',
        context: { filePath: '/path/to/file.txt' },
        detectedAt: new Date(),
        patternHash: 'hash5',
      };

      const patch = generator.generatePatch(failure, FailureCategory.LOGIC_ERROR);

      expect(patch.type).toBe(PatchType.ADD_FILE_CHECK);
      expect(patch.content).toContain('fs.existsSync');
      expect(patch.content).toContain('FILE_NOT_FOUND');
      expect(patch.targetFile).toContain('fileHandler.ts');
      expect(patch.targetLine).toBe(10);
    });

    it('should parse target file and line from stack trace', () => {
      const failure: Failure = {
        id: 'fail-6',
        skillId: 'test-skill',
        category: FailureCategory.SYNTAX_ERROR,
        errorMessage: 'Syntax error',
        stackTrace: 'SyntaxError: Unexpected token\n    at parseJson (/home/user/project/parser.ts:55:10)',
        context: {},
        detectedAt: new Date(),
        patternHash: 'hash6',
      };

      const patch = generator.generatePatch(failure, FailureCategory.SYNTAX_ERROR);

      expect(patch.targetFile).toContain('parser.ts');
      expect(patch.targetLine).toBe(55);
    });

    it('should handle missing stack trace gracefully', () => {
      const failure: Failure = {
        id: 'fail-7',
        skillId: 'test-skill',
        category: FailureCategory.UNKNOWN,
        errorMessage: 'Unknown error',
        stackTrace: '',
        context: {},
        detectedAt: new Date(),
        patternHash: 'hash7',
      };

      const patch = generator.generatePatch(failure, FailureCategory.UNKNOWN);

      expect(patch.targetFile).toBe('unknown');
      expect(patch.targetLine).toBe(0);
    });
  });

  describe('calculatePatchConfidence', () => {
    it('should return high confidence for well-supported patches', () => {
      const patch: Patch = {
        id: 'patch-1',
        failureId: 'fail-1',
        skillId: 'test-skill',
        type: PatchType.ADD_ERROR_HANDLING,
        category: FailureCategory.LOGIC_ERROR,
        content: 'try { ... } catch { ... }',
        targetFile: 'skill.ts',
        targetLine: 42,
        confidence: 0,
        similarFailureCount: 10,
      };

      const confidence = generator.calculatePatchConfidence(patch);
      expect(confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should return medium confidence for moderately supported patches', () => {
      const patch: Patch = {
        id: 'patch-2',
        failureId: 'fail-2',
        skillId: 'test-skill',
        type: PatchType.ADD_NULL_CHECK,
        category: FailureCategory.VALIDATION_ERROR,
        content: 'if (x === null) { ... }',
        targetFile: 'handler.ts',
        targetLine: 15,
        confidence: 0,
        similarFailureCount: 3,
      };

      const confidence = generator.calculatePatchConfidence(patch);
      expect(confidence).toBeGreaterThan(0.6);
      expect(confidence).toBeLessThan(0.85);
    });

    it('should return low confidence for single-occurrence patches', () => {
      const patch: Patch = {
        id: 'patch-3',
        failureId: 'fail-3',
        skillId: 'test-skill',
        type: PatchType.ADD_TYPE_VALIDATION,
        category: FailureCategory.VALIDATION_ERROR,
        content: 'typeof x === "string"',
        targetFile: 'validator.ts',
        targetLine: 20,
        confidence: 0,
        similarFailureCount: 1,
      };

      const confidence = generator.calculatePatchConfidence(patch);
      expect(confidence).toBeLessThan(0.6);
    });

    it('should boost confidence for specific patch types', () => {
      // Error handling and null checks should get confidence boost
      const errorHandlingPatch: Patch = {
        id: 'patch-4',
        failureId: 'fail-4',
        skillId: 'test-skill',
        type: PatchType.ADD_ERROR_HANDLING,
        category: FailureCategory.LOGIC_ERROR,
        content: 'try { ... } catch { ... }',
        targetFile: 'skill.ts',
        targetLine: 42,
        confidence: 0,
        similarFailureCount: 5,
      };

      const nullCheckPatch: Patch = {
        id: 'patch-5',
        failureId: 'fail-5',
        skillId: 'test-skill',
        type: PatchType.ADD_NULL_CHECK,
        category: FailureCategory.VALIDATION_ERROR,
        content: 'if (x === null) { ... }',
        targetFile: 'handler.ts',
        targetLine: 15,
        confidence: 0,
        similarFailureCount: 5,
      };

      const errorConfidence = generator.calculatePatchConfidence(errorHandlingPatch);
      const nullConfidence = generator.calculatePatchConfidence(nullCheckPatch);

      expect(errorConfidence).toBeGreaterThan(0.7);
      expect(nullConfidence).toBeGreaterThan(0.7);
    });
  });

  describe('createPatchProposal', () => {
    it('should create patch proposal with PENDING_UPDATE status', async () => {
      const patch: Patch = {
        id: 'patch-1',
        failureId: 'fail-1',
        skillId: 'test-skill',
        type: PatchType.ADD_ERROR_HANDLING,
        category: FailureCategory.LOGIC_ERROR,
        content: 'try { ... } catch { ... }',
        targetFile: 'skill.ts',
        targetLine: 42,
        confidence: 0.92,
        similarFailureCount: 10,
      };

      const proposal = await generator.createPatchProposal(patch);

      expect(proposal.patch).toEqual(patch);
      expect(proposal.status).toBe(PatchStatus.PENDING_UPDATE);
      expect(proposal.createdAt).toBeInstanceOf(Date);
      expect(proposal.preview).toBeDefined();
      expect(proposal.preview).toContain('try');

      // Verify stored in database
      const stored = db.prepare('SELECT * FROM skill_patches WHERE id = ?').get('patch-1');
      expect(stored).toBeDefined();
      expect(stored.status).toBe('PENDING_UPDATE');
      expect(stored.confidence).toBe(0.92);
    });

    it('should reject patches below confidence threshold', async () => {
      const patch: Patch = {
        id: 'patch-2',
        failureId: 'fail-2',
        skillId: 'test-skill',
        type: PatchType.ADD_NULL_CHECK,
        category: FailureCategory.VALIDATION_ERROR,
        content: 'if (x === null) { ... }',
        targetFile: 'handler.ts',
        targetLine: 15,
        confidence: 0.75, // Below 0.85 threshold
        similarFailureCount: 2,
      };

      await expect(generator.createPatchProposal(patch)).rejects.toThrow();
    });

    it('should generate preview for patch proposal', async () => {
      const patch: Patch = {
        id: 'patch-3',
        failureId: 'fail-3',
        skillId: 'test-skill',
        type: PatchType.ADD_TIMEOUT,
        category: FailureCategory.TIMEOUT,
        content: 'const result = await withTimeout(operation(), 5000);',
        targetFile: 'task.ts',
        targetLine: 30,
        confidence: 0.88,
        similarFailureCount: 6,
      };

      const proposal = await generator.createPatchProposal(patch);

      expect(proposal.preview).toContain('File: task.ts');
      expect(proposal.preview).toContain('Line: 30');
      expect(proposal.preview).toContain('withTimeout');
      expect(proposal.preview).toContain('Confidence: 0.88');
    });
  });

  describe('getPatchProposal', () => {
    beforeEach(async () => {
      // Insert test patch
      const patch: Patch = {
        id: 'patch-1',
        failureId: 'fail-1',
        skillId: 'test-skill',
        type: PatchType.ADD_ERROR_HANDLING,
        category: FailureCategory.LOGIC_ERROR,
        content: 'try { ... } catch { ... }',
        targetFile: 'skill.ts',
        targetLine: 42,
        confidence: 0.92,
        similarFailureCount: 10,
      };

      await generator.createPatchProposal(patch);
    });

    it('should retrieve existing patch proposal', () => {
      const proposal = generator.getPatchProposal('patch-1');

      expect(proposal).toBeDefined();
      expect(proposal?.patch.id).toBe('patch-1');
      expect(proposal?.status).toBe(PatchStatus.PENDING_UPDATE);
    });

    it('should return undefined for non-existent patch', () => {
      const proposal = generator.getPatchProposal('non-existent');
      expect(proposal).toBeUndefined();
    });
  });

  describe('getPendingPatches', () => {
    beforeEach(async () => {
      // Create multiple patches
      const patches: Patch[] = [
        {
          id: 'patch-1',
          failureId: 'fail-1',
          skillId: 'skill-a',
          type: PatchType.ADD_ERROR_HANDLING,
          category: FailureCategory.LOGIC_ERROR,
          content: 'patch 1',
          targetFile: 'a.ts',
          targetLine: 1,
          confidence: 0.9,
          similarFailureCount: 10,
        },
        {
          id: 'patch-2',
          failureId: 'fail-2',
          skillId: 'skill-a',
          type: PatchType.ADD_NULL_CHECK,
          category: FailureCategory.VALIDATION_ERROR,
          content: 'patch 2',
          targetFile: 'b.ts',
          targetLine: 2,
          confidence: 0.87,
          similarFailureCount: 7,
        },
        {
          id: 'patch-3',
          failureId: 'fail-3',
          skillId: 'skill-b',
          type: PatchType.ADD_TIMEOUT,
          category: FailureCategory.TIMEOUT,
          content: 'patch 3',
          targetFile: 'c.ts',
          targetLine: 3,
          confidence: 0.95,
          similarFailureCount: 15,
        },
      ];

      for (const patch of patches) {
        await generator.createPatchProposal(patch);
      }
    });

    it('should return all pending patches', () => {
      const pending = generator.getPendingPatches();
      expect(pending.length).toBe(3);
      expect(pending.every(p => p.status === PatchStatus.PENDING_UPDATE)).toBe(true);
    });

    it('should filter pending patches by skill', () => {
      const pending = generator.getPendingPatches('skill-a');
      expect(pending.length).toBe(2);
      expect(pending.every(p => p.patch.skillId === 'skill-a')).toBe(true);
    });

    it('should sort by confidence (highest first)', () => {
      const pending = generator.getPendingPatches();
      expect(pending[0].patch.confidence).toBeGreaterThanOrEqual(pending[1].patch.confidence);
      expect(pending[1].patch.confidence).toBeGreaterThanOrEqual(pending[2].patch.confidence);
    });
  });
});
