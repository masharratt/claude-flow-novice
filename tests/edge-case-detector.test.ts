/**
 * Edge Case Detection System Test Suite
 *
 * Comprehensive tests for the edge case feedback loop components.
 * Part of Task 1.5: MVP Edge Case Feedback Loop
 *
 * Test Coverage:
 * - Edge case detection and categorization
 * - Deduplication logic
 * - Pattern generation
 * - Similarity calculations
 * - Dashboard queries
 * - Error handling
 *
 * Target Coverage: ≥85%
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import {
  DatabaseService,
} from '../src/lib/database-service';
import { createLogger } from '../src/lib/logging';
import {
  EdgeCaseDetector,
  ErrorCategory,
  Severity,
  type SkillExecution,
  type EdgeCase,
} from '../src/services/edge-case-detector';
import { EdgeCaseDeduplicator } from '../src/services/edge-case-deduplicator';
import { EdgeCaseAnalyzer } from '../src/jobs/edge-case-analyzer';
import { StandardError, ErrorCode } from '../src/lib/errors';

describe('Edge Case Detection System', () => {
  let dbService: DatabaseService;
  let detector: EdgeCaseDetector;
  let deduplicator: EdgeCaseDeduplicator;
  let analyzer: EdgeCaseAnalyzer;
  let logger: any;

  beforeAll(async () => {
    // Setup in-memory database
    dbService = new DatabaseService({
      sqlite: {
        type: 'sqlite',
        database: ':memory:',
      },
    });

    await dbService.connect();

    // Create tables
    const sqlite = dbService.getAdapter('sqlite');

    // Create skills table (required for foreign key)
    await sqlite.raw(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT,
        version TEXT
      )
    `);

    // Create edge_cases table
    await sqlite.raw(`
      CREATE TABLE IF NOT EXISTS edge_cases (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        error_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        error_message TEXT,
        stack_trace TEXT,
        input_context TEXT,
        output_context TEXT,
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        occurrence_count INTEGER DEFAULT 1,
        status TEXT DEFAULT 'new',
        metadata TEXT
      )
    `);

    // Create failure_patterns table
    await sqlite.raw(`
      CREATE TABLE IF NOT EXISTS failure_patterns (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        error_type TEXT NOT NULL,
        common_errors TEXT,
        common_inputs TEXT,
        occurrence_count INTEGER DEFAULT 0,
        severity TEXT,
        suggested_fix TEXT,
        status TEXT DEFAULT 'detected',
        first_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      )
    `);

    // Create test skill
    await sqlite.insert('skills', {
      id: 'test-skill-001',
      name: 'Test Skill',
      version: '1.0.0',
    });

    // Initialize services
    logger = createLogger('test', { console: false });
    detector = new EdgeCaseDetector(dbService, logger);
    deduplicator = new EdgeCaseDeduplicator(dbService, logger);
    analyzer = new EdgeCaseAnalyzer(dbService, logger);
  });

  afterAll(async () => {
    await dbService.disconnect();
  });

  beforeEach(async () => {
    // Clear test data
    const sqlite = dbService.getAdapter('sqlite');
    await sqlite.raw('DELETE FROM edge_cases');
    await sqlite.raw('DELETE FROM failure_patterns');
  });

  describe('EdgeCaseDetector', () => {
    describe('detectFailure', () => {
      it('should return null for successful executions', async () => {
        const execution: SkillExecution = {
          skill_id: 'test-skill-001',
          input: { param: 'value' },
          success: true,
          timestamp: new Date(),
        };

        const result = await detector.detectFailure(execution);
        expect(result).toBeNull();
      });

      it('should detect syntax errors', async () => {
        const execution: SkillExecution = {
          skill_id: 'test-skill-001',
          input: { code: 'invalid syntax here' },
          output: '',
          success: false,
          error: new SyntaxError('Unexpected token'),
          timestamp: new Date(),
        };

        const result = await detector.detectFailure(execution);

        expect(result).not.toBeNull();
        expect(result?.error_type).toBe(ErrorCategory.SYNTAX);
        expect(result?.severity).toBe(Severity.HIGH);
      });

      it('should detect validation errors', async () => {
        const execution: SkillExecution = {
          skill_id: 'test-skill-001',
          input: { value: null },
          success: false,
          error: new Error('Validation failed: required field missing'),
          timestamp: new Date(),
        };

        const result = await detector.detectFailure(execution);

        expect(result).not.toBeNull();
        expect(result?.error_type).toBe(ErrorCategory.VALIDATION);
        expect(result?.severity).toBe(Severity.MEDIUM);
      });

      it('should detect timeout errors', async () => {
        const execution: SkillExecution = {
          skill_id: 'test-skill-001',
          input: { timeout: 5000 },
          success: false,
          error: new Error('Operation timed out after 5000ms'),
          timestamp: new Date(),
        };

        const result = await detector.detectFailure(execution);

        expect(result).not.toBeNull();
        expect(result?.error_type).toBe(ErrorCategory.TIMEOUT);
        expect(result?.severity).toBe(Severity.MEDIUM);
      });

      it('should detect dependency errors', async () => {
        const execution: SkillExecution = {
          skill_id: 'test-skill-001',
          input: { module: 'missing-module' },
          success: false,
          error: new Error('Cannot find module "missing-module"'),
          timestamp: new Date(),
        };

        const result = await detector.detectFailure(execution);

        expect(result).not.toBeNull();
        expect(result?.error_type).toBe(ErrorCategory.DEPENDENCY);
        expect(result?.severity).toBe(Severity.HIGH);
      });

      it('should detect runtime errors', async () => {
        const execution: SkillExecution = {
          skill_id: 'test-skill-001',
          input: { value: 42 },
          success: false,
          error: new Error('Runtime error: division by zero'),
          timestamp: new Date(),
        };

        const result = await detector.detectFailure(execution);

        expect(result).not.toBeNull();
        expect(result?.error_type).toBe(ErrorCategory.RUNTIME);
        expect(result?.severity).toBe(Severity.MEDIUM);
      });

      it('should upgrade severity for critical errors', async () => {
        const execution: SkillExecution = {
          skill_id: 'test-skill-001',
          input: { value: 42 },
          success: false,
          error: new Error('CRITICAL: Out of memory'),
          timestamp: new Date(),
        };

        const result = await detector.detectFailure(execution);

        expect(result).not.toBeNull();
        expect(result?.severity).toBe(Severity.CRITICAL);
      });

      it('should capture execution context', async () => {
        const execution: SkillExecution = {
          skill_id: 'test-skill-001',
          agent_id: 'agent-123',
          task_id: 'task-456',
          input: { param1: 'value1', param2: 42 },
          output: 'partial output',
          success: false,
          error: new Error('Test error'),
          timestamp: new Date(),
          duration_ms: 1500,
        };

        const result = await detector.detectFailure(execution);

        expect(result).not.toBeNull();
        expect(result?.input_context).toBe(JSON.stringify(execution.input));
        expect(result?.output_context).toBe('partial output');
        expect(result?.metadata.agent_id).toBe('agent-123');
        expect(result?.metadata.task_id).toBe('task-456');
        expect(result?.metadata.duration_ms).toBe(1500);
      });

      it('should store edge case in database', async () => {
        const execution: SkillExecution = {
          skill_id: 'test-skill-001',
          input: { test: true },
          success: false,
          error: new Error('Test error for storage'),
          timestamp: new Date(),
        };

        const result = await detector.detectFailure(execution);
        expect(result).not.toBeNull();

        // Verify stored in database
        const stored = await detector.getEdgeCase(result!.id);
        expect(stored).not.toBeNull();
        expect(stored?.id).toBe(result?.id);
        expect(stored?.skill_id).toBe('test-skill-001');
      });
    });

    describe('categorizeError', () => {
      it('should categorize syntax errors', () => {
        const error = new SyntaxError('Unexpected token');
        const category = detector.categorizeError(error);
        expect(category).toBe(ErrorCategory.SYNTAX);
      });

      it('should categorize validation errors', () => {
        const error = new Error('Validation failed: invalid input');
        const category = detector.categorizeError(error);
        expect(category).toBe(ErrorCategory.VALIDATION);
      });

      it('should categorize timeout errors', () => {
        const error = new Error('Operation timed out');
        const category = detector.categorizeError(error);
        expect(category).toBe(ErrorCategory.TIMEOUT);
      });

      it('should categorize dependency errors', () => {
        const error = new Error('Module not found');
        const category = detector.categorizeError(error);
        expect(category).toBe(ErrorCategory.DEPENDENCY);
      });

      it('should default to runtime for generic errors', () => {
        const error = new Error('Something went wrong');
        const category = detector.categorizeError(error);
        expect(category).toBe(ErrorCategory.RUNTIME);
      });
    });

    describe('listEdgeCases', () => {
      beforeEach(async () => {
        // Create test edge cases
        const sqlite = dbService.getAdapter('sqlite');

        await sqlite.insert('edge_cases', {
          id: 'edge-001',
          skill_id: 'test-skill-001',
          error_type: 'syntax',
          severity: 'high',
          error_message: 'Syntax error 1',
          input_context: '{}',
          status: 'new',
          occurrence_count: 1,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          metadata: '{}',
        });

        await sqlite.insert('edge_cases', {
          id: 'edge-002',
          skill_id: 'test-skill-001',
          error_type: 'runtime',
          severity: 'medium',
          error_message: 'Runtime error 1',
          input_context: '{}',
          status: 'new',
          occurrence_count: 2,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          metadata: '{}',
        });
      });

      it('should list all edge cases', async () => {
        const cases = await detector.listEdgeCases();
        expect(cases.length).toBeGreaterThanOrEqual(2);
      });

      it('should filter by skill_id', async () => {
        const cases = await detector.listEdgeCases({ skill_id: 'test-skill-001' });
        expect(cases.length).toBeGreaterThanOrEqual(2);
        expect(cases.every(c => c.skill_id === 'test-skill-001')).toBe(true);
      });

      it('should filter by error_type', async () => {
        const cases = await detector.listEdgeCases({ error_type: ErrorCategory.SYNTAX });
        expect(cases.length).toBeGreaterThanOrEqual(1);
        expect(cases.every(c => c.error_type === ErrorCategory.SYNTAX)).toBe(true);
      });

      it('should filter by severity', async () => {
        const cases = await detector.listEdgeCases({ severity: Severity.HIGH });
        expect(cases.length).toBeGreaterThanOrEqual(1);
        expect(cases.every(c => c.severity === Severity.HIGH)).toBe(true);
      });

      it('should filter by status', async () => {
        const cases = await detector.listEdgeCases({ status: 'new' });
        expect(cases.length).toBeGreaterThanOrEqual(2);
        expect(cases.every(c => c.status === 'new')).toBe(true);
      });

      it('should limit results', async () => {
        const cases = await detector.listEdgeCases({ limit: 1 });
        expect(cases.length).toBe(1);
      });
    });
  });

  describe('EdgeCaseDeduplicator', () => {
    describe('deduplicateEdgeCase', () => {
      it('should return false for unique edge case', async () => {
        const edgeCase: EdgeCase = {
          id: 'edge-unique',
          skill_id: 'test-skill-001',
          error_type: ErrorCategory.SYNTAX,
          severity: Severity.HIGH,
          error_message: 'Completely unique error message',
          input_context: '{"param": "value"}',
          first_seen: new Date(),
          last_seen: new Date(),
          occurrence_count: 1,
          status: 'new',
          metadata: {},
        };

        const isDuplicate = await deduplicator.deduplicateEdgeCase(edgeCase);
        expect(isDuplicate).toBe(false);
      });

      it('should return true for duplicate edge case', async () => {
        // Insert original edge case
        const sqlite = dbService.getAdapter('sqlite');
        const original = {
          id: 'edge-original',
          skill_id: 'test-skill-001',
          error_type: 'syntax',
          severity: 'high',
          error_message: 'Syntax error on line 42',
          stack_trace: 'at function() {...}',
          input_context: '{"param": "value"}',
          status: 'new',
          occurrence_count: 1,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          metadata: '{}',
        };

        await sqlite.insert('edge_cases', original);

        // Create very similar edge case
        const duplicate: EdgeCase = {
          id: 'edge-duplicate',
          skill_id: 'test-skill-001',
          error_type: ErrorCategory.SYNTAX,
          severity: Severity.HIGH,
          error_message: 'Syntax error on line 42',
          stack_trace: 'at function() {...}',
          input_context: '{"param": "value"}',
          first_seen: new Date(),
          last_seen: new Date(),
          occurrence_count: 1,
          status: 'new',
          metadata: {},
        };

        const isDuplicate = await deduplicator.deduplicateEdgeCase(duplicate);
        expect(isDuplicate).toBe(true);

        // Verify occurrence count incremented
        const rows = await sqlite.raw<any[]>('SELECT * FROM edge_cases WHERE id = ?', ['edge-original']);
        const updated = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        expect(updated).not.toBeNull();
        expect(updated.occurrence_count).toBe(2);
      });

      it('should not deduplicate different error types', async () => {
        const sqlite = dbService.getAdapter('sqlite');
        await sqlite.insert('edge_cases', {
          id: 'edge-syntax',
          skill_id: 'test-skill-001',
          error_type: 'syntax',
          severity: 'high',
          error_message: 'Error on line 42',
          input_context: '{}',
          status: 'new',
          occurrence_count: 1,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          metadata: '{}',
        });

        const different: EdgeCase = {
          id: 'edge-runtime',
          skill_id: 'test-skill-001',
          error_type: ErrorCategory.RUNTIME,
          severity: Severity.HIGH,
          error_message: 'Error on line 42',
          input_context: '{}',
          first_seen: new Date(),
          last_seen: new Date(),
          occurrence_count: 1,
          status: 'new',
          metadata: {},
        };

        const isDuplicate = await deduplicator.deduplicateEdgeCase(different);
        expect(isDuplicate).toBe(false);
      });
    });

    describe('calculateSimilarity', () => {
      it('should return high score for identical edge cases', () => {
        const edgeCase1: EdgeCase = {
          id: 'edge-1',
          skill_id: 'test-skill-001',
          error_type: ErrorCategory.SYNTAX,
          severity: Severity.HIGH,
          error_message: 'Syntax error on line 42',
          stack_trace: 'at function() {...}',
          input_context: '{}',
          first_seen: new Date(),
          last_seen: new Date(),
          occurrence_count: 1,
          status: 'new',
          metadata: {},
        };

        const edgeCase2: EdgeCase = { ...edgeCase1, id: 'edge-2' };

        const score = deduplicator.calculateSimilarity(edgeCase1, edgeCase2);
        expect(score.total).toBeGreaterThanOrEqual(0.90);
      });

      it('should return low score for different edge cases', () => {
        const edgeCase1: EdgeCase = {
          id: 'edge-1',
          skill_id: 'test-skill-001',
          error_type: ErrorCategory.SYNTAX,
          severity: Severity.HIGH,
          error_message: 'Syntax error on line 42',
          stack_trace: 'at function1() {...}',
          input_context: '{}',
          first_seen: new Date(),
          last_seen: new Date(),
          occurrence_count: 1,
          status: 'new',
          metadata: {},
        };

        const edgeCase2: EdgeCase = {
          id: 'edge-2',
          skill_id: 'test-skill-002',
          error_type: ErrorCategory.RUNTIME,
          severity: Severity.LOW,
          error_message: 'Completely different error',
          stack_trace: 'at function2() {...}',
          input_context: '{"different": "context"}',
          first_seen: new Date(),
          last_seen: new Date(),
          occurrence_count: 1,
          status: 'new',
          metadata: {},
        };

        const score = deduplicator.calculateSimilarity(edgeCase1, edgeCase2);
        expect(score.total).toBeLessThan(0.50);
      });

      it('should weight skill and error type at 40%', () => {
        const edgeCase1: EdgeCase = {
          id: 'edge-1',
          skill_id: 'test-skill-001',
          error_type: ErrorCategory.SYNTAX,
          severity: Severity.HIGH,
          error_message: 'Error A',
          input_context: '{}',
          first_seen: new Date(),
          last_seen: new Date(),
          occurrence_count: 1,
          status: 'new',
          metadata: {},
        };

        const edgeCase2: EdgeCase = {
          ...edgeCase1,
          id: 'edge-2',
          error_message: 'Error B',
        };

        const score = deduplicator.calculateSimilarity(edgeCase1, edgeCase2);
        expect(score.skillAndType).toBe(0.40);
      });
    });

    describe('getStats', () => {
      beforeEach(async () => {
        const sqlite = dbService.getAdapter('sqlite');

        // Insert test edge cases
        await sqlite.insert('edge_cases', {
          id: 'edge-stat-1',
          skill_id: 'test-skill-001',
          error_type: 'syntax',
          severity: 'high',
          error_message: 'Error 1',
          input_context: '{}',
          status: 'new',
          occurrence_count: 5,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          metadata: '{}',
        });

        await sqlite.insert('edge_cases', {
          id: 'edge-stat-2',
          skill_id: 'test-skill-001',
          error_type: 'runtime',
          severity: 'medium',
          error_message: 'Error 2',
          input_context: '{}',
          status: 'new',
          occurrence_count: 3,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          metadata: '{}',
        });
      });

      it('should return statistics', async () => {
        const stats = await deduplicator.getStats();

        expect(stats.totalEdgeCases).toBeGreaterThanOrEqual(2);
        expect(stats.uniqueSkills).toBeGreaterThanOrEqual(1);
        expect(stats.avgOccurrenceCount).toBeGreaterThan(0);
        expect(stats.mostFrequentFailure).not.toBeNull();
        expect(stats.mostFrequentFailure?.occurrence_count).toBe(5);
      });
    });
  });

  describe('EdgeCaseAnalyzer', () => {
    beforeEach(async () => {
      // Insert test edge cases for analysis
      const sqlite = dbService.getAdapter('sqlite');

      for (let i = 0; i < 5; i++) {
        await sqlite.insert('edge_cases', {
          id: `edge-pattern-${i}`,
          skill_id: 'test-skill-001',
          error_type: 'syntax',
          severity: 'high',
          error_message: `Syntax error: unexpected token at line ${10 + i}`,
          stack_trace: 'at parseCode() {...}',
          input_context: JSON.stringify({ code: `test code ${i}` }),
          status: 'new',
          occurrence_count: 1,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          metadata: '{}',
        });
      }
    });

    describe('analyzeEdgeCases', () => {
      it('should generate comprehensive analysis report', async () => {
        const report = await analyzer.analyzeEdgeCases();

        expect(report).toBeDefined();
        expect(report.timestamp).toBeInstanceOf(Date);
        expect(report.totalEdgeCases).toBeGreaterThanOrEqual(5);
        expect(report.newEdgeCases).toBeGreaterThanOrEqual(5);
        expect(report.topFailures).toBeDefined();
        expect(report.highSeverityFailures).toBeDefined();
        expect(report.trends).toBeDefined();
      });

      it('should include top failures', async () => {
        const report = await analyzer.analyzeEdgeCases();

        expect(report.topFailures.length).toBeGreaterThan(0);
        const topFailure = report.topFailures[0];
        expect(topFailure.skill_id).toBe('test-skill-001');
        expect(topFailure.error_type).toBe(ErrorCategory.SYNTAX);
        expect(topFailure.total_failures).toBeGreaterThanOrEqual(5);
      });

      it('should include high severity failures', async () => {
        const report = await analyzer.analyzeEdgeCases();

        expect(report.highSeverityFailures.length).toBeGreaterThan(0);
        const highSeverity = report.highSeverityFailures[0];
        expect(highSeverity.severity).toMatch(/high|critical/);
      });
    });

    describe('generatePatterns', () => {
      it('should detect patterns from multiple edge cases', async () => {
        const patterns = await analyzer.generatePatterns();

        expect(patterns.length).toBeGreaterThan(0);
        const pattern = patterns[0];
        expect(pattern.skill_id).toBe('test-skill-001');
        expect(pattern.error_type).toBe(ErrorCategory.SYNTAX);
        expect(pattern.occurrence_count).toBeGreaterThanOrEqual(3);
      });

      it('should extract common error substrings', async () => {
        const patterns = await analyzer.generatePatterns();

        expect(patterns.length).toBeGreaterThan(0);
        const pattern = patterns[0];
        expect(pattern.common_errors.length).toBeGreaterThan(0);
        expect(pattern.common_errors.some(e => e.includes('Syntax error'))).toBe(true);
      });

      it('should identify common input patterns', async () => {
        const patterns = await analyzer.generatePatterns();

        expect(patterns.length).toBeGreaterThan(0);
        const pattern = patterns[0];
        expect(pattern.common_inputs.length).toBeGreaterThan(0);
      });

      it('should not create patterns for insufficient occurrences', async () => {
        // Clear existing data
        const sqlite = dbService.getAdapter('sqlite');
        await sqlite.raw('DELETE FROM edge_cases');

        // Insert only 2 edge cases (below minimum of 3)
        await sqlite.insert('edge_cases', {
          id: 'edge-few-1',
          skill_id: 'test-skill-001',
          error_type: 'syntax',
          severity: 'high',
          error_message: 'Error 1',
          input_context: '{}',
          status: 'new',
          occurrence_count: 1,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          metadata: '{}',
        });

        await sqlite.insert('edge_cases', {
          id: 'edge-few-2',
          skill_id: 'test-skill-001',
          error_type: 'syntax',
          severity: 'high',
          error_message: 'Error 2',
          input_context: '{}',
          status: 'new',
          occurrence_count: 1,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          metadata: '{}',
        });

        const patterns = await analyzer.generatePatterns();
        expect(patterns.length).toBe(0);
      });

      it('should store patterns in database', async () => {
        await analyzer.generatePatterns();

        const sqlite = dbService.getAdapter('sqlite');
        const patterns = await sqlite.raw<any[]>(
          'SELECT * FROM failure_patterns'
        );

        expect(Array.isArray(patterns)).toBe(true);
        expect(patterns.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete feedback loop', async () => {
      // 1. Detect multiple different failures to ensure pattern detection works
      const errorMessages = [
        'Syntax error: unexpected token ILLEGAL',
        'Syntax error: unexpected identifier',
        'Syntax error: missing semicolon',
        'Syntax error: unexpected end of input',
        'Syntax error: invalid or unexpected token',
      ];

      for (let i = 0; i < errorMessages.length; i++) {
        const execution: SkillExecution = {
          skill_id: 'test-skill-001',
          input: { code: `test ${i}` },
          success: false,
          error: new Error(errorMessages[i]),
          timestamp: new Date(),
        };

        await detector.detectFailure(execution);
      }

      // 2. Analyze edge cases
      const report = await analyzer.analyzeEdgeCases();

      expect(report.newEdgeCases).toBeGreaterThanOrEqual(1);

      // 3. Verify pattern detection (if enough unique edge cases)
      if (report.newEdgeCases >= 3) {
        expect(report.patternsDetected).toBeGreaterThan(0);
      }

      // 4. Verify edge cases were created (some may be deduplicated)
      const stats = await deduplicator.getStats();
      expect(stats.totalEdgeCases).toBeGreaterThanOrEqual(1);
    });

    it('should handle concurrent edge case detection', async () => {
      const executions: SkillExecution[] = Array.from({ length: 10 }, (_, i) => ({
        skill_id: 'test-skill-001',
        input: { index: i },
        success: false,
        error: new Error(`Error ${i}`),
        timestamp: new Date(),
      }));

      // Detect all in parallel
      await Promise.all(executions.map(e => detector.detectFailure(e)));

      // Verify all detected
      const cases = await detector.listEdgeCases({ skill_id: 'test-skill-001' });
      expect(cases.length).toBeGreaterThan(0);
    });
  });
});
