/**
 * Edge Case Analyzer Tests
 * Part of Task 5.1: Edge Case Analyzer & Skill Patcher
 *
 * Test Coverage:
 * - Failure categorization (syntax, logic, timeout, validation, unknown)
 * - Pattern matching for similar failures
 * - Confidence scoring for pattern detection
 * - Integration with DatabaseService
 * - Error handling and edge cases
 *
 * Target: 85%+ code coverage
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import {
  EdgeCaseAnalyzer,
  FailureCategory,
  Failure,
  FailurePattern,
} from '../src/services/edge-case-analyzer';
import { StandardError, ErrorCode } from '../src/lib/errors';

// Test configuration
const TEST_DIR = path.join(__dirname, '.test-edge-case-analyzer');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-edge-cases.db');

describe('EdgeCaseAnalyzer', () => {
  let analyzer: EdgeCaseAnalyzer;
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

    // Create database with edge_cases table
    db = new Database(TEST_DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS edge_cases (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        category TEXT NOT NULL,
        error_message TEXT,
        stack_trace TEXT,
        context TEXT,
        detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
        pattern_hash TEXT,
        confidence REAL
      );

      CREATE INDEX IF NOT EXISTS idx_edge_cases_skill ON edge_cases(skill_id);
      CREATE INDEX IF NOT EXISTS idx_edge_cases_category ON edge_cases(category);
      CREATE INDEX IF NOT EXISTS idx_edge_cases_pattern ON edge_cases(pattern_hash);
    `);

    analyzer = new EdgeCaseAnalyzer({ dbPath: TEST_DB_PATH });
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

  describe('categorizeFailure', () => {
    it('should categorize syntax errors', () => {
      const error = new SyntaxError('Unexpected token');
      const context = {
        skillId: 'test-skill',
        operation: 'execute',
      };

      const category = analyzer.categorizeFailure(error, context);
      expect(category).toBe(FailureCategory.SYNTAX_ERROR);
    });

    it('should categorize timeout errors', () => {
      const error = new StandardError(
        ErrorCode.OPERATION_TIMEOUT,
        'Operation timed out after 5000ms'
      );
      const context = {
        skillId: 'test-skill',
        operation: 'longRunning',
      };

      const category = analyzer.categorizeFailure(error, context);
      expect(category).toBe(FailureCategory.TIMEOUT);
    });

    it('should categorize validation errors', () => {
      const error = new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Invalid input parameters'
      );
      const context = {
        skillId: 'test-skill',
        operation: 'validate',
      };

      const category = analyzer.categorizeFailure(error, context);
      expect(category).toBe(FailureCategory.VALIDATION_ERROR);
    });

    it('should categorize null/undefined errors as validation errors', () => {
      const error = new TypeError('Cannot read property of null');
      const context = {
        skillId: 'test-skill',
        operation: 'process',
      };

      const category = analyzer.categorizeFailure(error, context);
      expect(category).toBe(FailureCategory.VALIDATION_ERROR);
    });

    it('should categorize file not found errors as logic errors', () => {
      const error = new StandardError(
        ErrorCode.FILE_NOT_FOUND,
        'File does not exist: /path/to/file'
      );
      const context = {
        skillId: 'test-skill',
        operation: 'readFile',
      };

      const category = analyzer.categorizeFailure(error, context);
      expect(category).toBe(FailureCategory.LOGIC_ERROR);
    });

    it('should categorize unknown errors', () => {
      const error = new Error('Some random error');
      const context = {
        skillId: 'test-skill',
        operation: 'unknown',
      };

      const category = analyzer.categorizeFailure(error, context);
      expect(category).toBe(FailureCategory.UNKNOWN);
    });

    it('should handle ReferenceError as logic error', () => {
      const error = new ReferenceError('variable is not defined');
      const context = {
        skillId: 'test-skill',
        operation: 'execute',
      };

      const category = analyzer.categorizeFailure(error, context);
      expect(category).toBe(FailureCategory.LOGIC_ERROR);
    });
  });

  describe('findSimilarFailures', () => {
    beforeEach(() => {
      // Insert test failures
      db.prepare(`
        INSERT INTO edge_cases (id, skill_id, category, error_message, pattern_hash, confidence)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('fail1', 'skill-a', 'TIMEOUT', 'Operation timed out', 'hash1', 0.9);

      db.prepare(`
        INSERT INTO edge_cases (id, skill_id, category, error_message, pattern_hash, confidence)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('fail2', 'skill-a', 'TIMEOUT', 'Operation timed out', 'hash1', 0.85);

      db.prepare(`
        INSERT INTO edge_cases (id, skill_id, category, error_message, pattern_hash, confidence)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('fail3', 'skill-b', 'SYNTAX_ERROR', 'Unexpected token', 'hash2', 0.8);
    });

    it('should find similar failures by skill and category', () => {
      const failure: Failure = {
        id: 'new-fail',
        skillId: 'skill-a',
        category: FailureCategory.TIMEOUT,
        errorMessage: 'Operation timed out after 10s',
        stackTrace: '',
        context: {},
        detectedAt: new Date(),
        patternHash: 'hash1',
      };

      const similar = analyzer.findSimilarFailures(failure);

      expect(similar.length).toBe(2);
      expect(similar[0].skillId).toBe('skill-a');
      expect(similar[0].category).toBe('TIMEOUT');
    });

    it('should return empty array when no similar failures exist', () => {
      const failure: Failure = {
        id: 'new-fail',
        skillId: 'skill-c',
        category: FailureCategory.LOGIC_ERROR,
        errorMessage: 'Some logic error',
        stackTrace: '',
        context: {},
        detectedAt: new Date(),
        patternHash: 'hash3',
      };

      const similar = analyzer.findSimilarFailures(failure);
      expect(similar.length).toBe(0);
    });

    it('should limit results to maximum of 10 similar failures', () => {
      // Insert 15 similar failures
      for (let i = 0; i < 15; i++) {
        db.prepare(`
          INSERT INTO edge_cases (id, skill_id, category, error_message, pattern_hash, confidence)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(`fail-${i}`, 'skill-x', 'VALIDATION_ERROR', 'Invalid input', 'hash-x', 0.8);
      }

      const failure: Failure = {
        id: 'new-fail',
        skillId: 'skill-x',
        category: FailureCategory.VALIDATION_ERROR,
        errorMessage: 'Invalid input',
        stackTrace: '',
        context: {},
        detectedAt: new Date(),
        patternHash: 'hash-x',
      };

      const similar = analyzer.findSimilarFailures(failure);
      expect(similar.length).toBeLessThanOrEqual(10);
    });
  });

  describe('calculatePatternConfidence', () => {
    it('should return high confidence for many similar failures', () => {
      const failures: Failure[] = Array.from({ length: 10 }, (_, i) => ({
        id: `fail-${i}`,
        skillId: 'skill-a',
        category: FailureCategory.TIMEOUT,
        errorMessage: 'Operation timed out',
        stackTrace: '',
        context: {},
        detectedAt: new Date(),
        patternHash: 'hash1',
      }));

      const confidence = analyzer.calculatePatternConfidence(failures);
      expect(confidence).toBeGreaterThan(0.9);
    });

    it('should return medium confidence for few similar failures', () => {
      const failures: Failure[] = Array.from({ length: 3 }, (_, i) => ({
        id: `fail-${i}`,
        skillId: 'skill-a',
        category: FailureCategory.VALIDATION_ERROR,
        errorMessage: 'Invalid input',
        stackTrace: '',
        context: {},
        detectedAt: new Date(),
        patternHash: 'hash2',
      }));

      const confidence = analyzer.calculatePatternConfidence(failures);
      expect(confidence).toBeGreaterThan(0.6);
      expect(confidence).toBeLessThan(0.9);
    });

    it('should return low confidence for single failure', () => {
      const failures: Failure[] = [{
        id: 'fail-1',
        skillId: 'skill-a',
        category: FailureCategory.LOGIC_ERROR,
        errorMessage: 'Some error',
        stackTrace: '',
        context: {},
        detectedAt: new Date(),
        patternHash: 'hash3',
      }];

      const confidence = analyzer.calculatePatternConfidence(failures);
      expect(confidence).toBeLessThan(0.6);
    });

    it('should return 0 confidence for empty array', () => {
      const confidence = analyzer.calculatePatternConfidence([]);
      expect(confidence).toBe(0);
    });
  });

  describe('analyzeFailure', () => {
    it('should analyze and store failure with pattern detection', async () => {
      const error = new StandardError(
        ErrorCode.OPERATION_TIMEOUT,
        'Operation timed out'
      );
      const context = {
        skillId: 'test-skill',
        operation: 'longTask',
      };

      const pattern = await analyzer.analyzeFailure(error, context);

      expect(pattern.category).toBe(FailureCategory.TIMEOUT);
      expect(pattern.confidence).toBeGreaterThan(0);
      expect(pattern.failureCount).toBe(1);
      expect(pattern.patternHash).toBeDefined();

      // Verify stored in database
      const stored = db.prepare('SELECT * FROM edge_cases WHERE skill_id = ?').get('test-skill');
      expect(stored).toBeDefined();
    });

    it('should increase confidence for repeated failures', async () => {
      const error = new StandardError(ErrorCode.VALIDATION_FAILED, 'Invalid input');
      const context = { skillId: 'test-skill', operation: 'validate' };

      // First failure
      const pattern1 = await analyzer.analyzeFailure(error, context);
      expect(pattern1.failureCount).toBe(1);

      // Second similar failure
      const pattern2 = await analyzer.analyzeFailure(error, context);
      expect(pattern2.failureCount).toBe(2);
      expect(pattern2.confidence).toBeGreaterThan(pattern1.confidence);
    });
  });

  describe('getFailureStats', () => {
    beforeEach(() => {
      // Insert test data
      db.prepare(`
        INSERT INTO edge_cases (id, skill_id, category, error_message, pattern_hash, confidence)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('f1', 'skill-a', 'TIMEOUT', 'Error 1', 'hash1', 0.9);

      db.prepare(`
        INSERT INTO edge_cases (id, skill_id, category, error_message, pattern_hash, confidence)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('f2', 'skill-a', 'TIMEOUT', 'Error 2', 'hash1', 0.85);

      db.prepare(`
        INSERT INTO edge_cases (id, skill_id, category, error_message, pattern_hash, confidence)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('f3', 'skill-b', 'VALIDATION_ERROR', 'Error 3', 'hash2', 0.8);
    });

    it('should return stats for specific skill', () => {
      const stats = analyzer.getFailureStats('skill-a');

      expect(stats.totalFailures).toBe(2);
      expect(stats.byCategory.TIMEOUT).toBe(2);
      expect(stats.uniquePatterns).toBe(1);
    });

    it('should return stats for all skills when skillId is undefined', () => {
      const stats = analyzer.getFailureStats();

      expect(stats.totalFailures).toBe(3);
      expect(stats.byCategory.TIMEOUT).toBe(2);
      expect(stats.byCategory.VALIDATION_ERROR).toBe(1);
      expect(stats.uniquePatterns).toBe(2);
    });
  });
});
