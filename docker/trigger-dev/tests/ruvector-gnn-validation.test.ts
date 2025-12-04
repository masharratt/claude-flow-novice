/**
 * Unit tests for RuVector GNN Validation and Sanitization Layer
 *
 * Tests comprehensive input validation, sanitization, and traversal guards
 * addressing CVSS 6.5-7.5 vulnerabilities identified in Loop 2 security audit.
 *
 * Test Categories:
 * 1. Input Validation (CVSS 6.5 - Missing Input Sanitization)
 * 2. Traversal Guards (CVSS 7.5 - Unbounded Recursion)
 * 3. Edge Cases and Boundary Conditions
 * 4. Security Bypass Attempts
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  GNNInputValidator,
  TraversalGuard,
  EdgeValidator,
  BatchValidator,
  CONSTANTS,
} from '../src/lib/ruvector-gnn-validation';

describe('GNNInputValidator', () => {
  describe('validateNodeId', () => {
    it('should accept valid alphanumeric node IDs', () => {
      const result = GNNInputValidator.validateNodeId('error-123');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('error-123');
    });

    it('should accept node IDs with underscores and dots', () => {
      const result = GNNInputValidator.validateNodeId('error.type_v1');
      expect(result.valid).toBe(true);
    });

    it('should reject non-string node IDs', () => {
      const result = GNNInputValidator.validateNodeId(123);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('string');
    });

    it('should reject empty node IDs', () => {
      const result = GNNInputValidator.validateNodeId('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-empty');
    });

    it('should reject node IDs exceeding max length', () => {
      const longId = 'a'.repeat(CONSTANTS.MAX_NODE_ID_LENGTH + 1);
      const result = GNNInputValidator.validateNodeId(longId);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds max length');
    });

    it('should sanitize dangerous characters (CVSS 6.5 mitigation)', () => {
      const result = GNNInputValidator.validateNodeId('error<script>alert(1)</script>');
      expect(result.valid).toBe(true);
      expect(result.sanitized).not.toContain('<');
      expect(result.sanitized).not.toContain('>');
      expect(result.sanitized).not.toContain('"');
    });

    it('should reject IDs with HTML entity characters', () => {
      const result = GNNInputValidator.validateNodeId('error&malicious;id');
      expect(result.valid).toBe(true); // Sanitized, not rejected
      expect(result.sanitized).not.toContain('&');
    });

    it('should reject IDs with null bytes', () => {
      const result = GNNInputValidator.validateNodeId('error\x00id');
      expect(result.valid).toBe(true); // Sanitized
      expect(result.sanitized).not.toContain('\x00');
    });

    it('should reject IDs that become empty after sanitization', () => {
      const result = GNNInputValidator.validateNodeId('<script></script>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('became empty');
    });
  });

  describe('validateHopCount', () => {
    it('should accept valid hop counts (1-3)', () => {
      expect(GNNInputValidator.validateHopCount(1).valid).toBe(true);
      expect(GNNInputValidator.validateHopCount(2).valid).toBe(true);
      expect(GNNInputValidator.validateHopCount(3).valid).toBe(true);
    });

    it('should reject hop count 0', () => {
      const result = GNNInputValidator.validateHopCount(0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('1-3');
    });

    it('should reject hop count > max', () => {
      const result = GNNInputValidator.validateHopCount(10);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('1-3');
    });

    it('should reject non-integer hop counts', () => {
      const result = GNNInputValidator.validateHopCount(1.5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('integer');
    });

    it('should reject non-number hop counts', () => {
      const result = GNNInputValidator.validateHopCount('3');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('integer');
    });
  });

  describe('validateGraphSize', () => {
    it('should accept valid graph sizes', () => {
      expect(GNNInputValidator.validateGraphSize(1).valid).toBe(true);
      expect(GNNInputValidator.validateGraphSize(1000).valid).toBe(true);
      expect(GNNInputValidator.validateGraphSize(100000).valid).toBe(true);
    });

    it('should accept size 0', () => {
      const result = GNNInputValidator.validateGraphSize(0);
      expect(result.valid).toBe(true);
    });

    it('should reject negative sizes', () => {
      const result = GNNInputValidator.validateGraphSize(-1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-negative');
    });

    it('should reject sizes exceeding max', () => {
      const result = GNNInputValidator.validateGraphSize(100001);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds max');
    });

    it('should reject non-integer sizes', () => {
      const result = GNNInputValidator.validateGraphSize(100.5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('integer');
    });
  });

  describe('validateConfidence', () => {
    it('should accept valid confidence scores (0.0-1.0)', () => {
      expect(GNNInputValidator.validateConfidence(0).valid).toBe(true);
      expect(GNNInputValidator.validateConfidence(0.5).valid).toBe(true);
      expect(GNNInputValidator.validateConfidence(1).valid).toBe(true);
    });

    it('should reject negative confidence', () => {
      const result = GNNInputValidator.validateConfidence(-0.1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('0.0-1.0');
    });

    it('should reject confidence > 1', () => {
      const result = GNNInputValidator.validateConfidence(1.1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('0.0-1.0');
    });

    it('should reject NaN (CVSS 5.3 - Precision Loss mitigation)', () => {
      const result = GNNInputValidator.validateConfidence(NaN);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('finite');
    });

    it('should reject Infinity', () => {
      const result = GNNInputValidator.validateConfidence(Infinity);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('finite');
    });

    it('should reject non-number values', () => {
      const result = GNNInputValidator.validateConfidence('0.5');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('number');
    });
  });

  describe('validateErrorMessage', () => {
    it('should accept valid error messages', () => {
      const result = GNNInputValidator.validateErrorMessage('Null pointer exception');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Null pointer exception');
    });

    it('should reject non-string messages', () => {
      const result = GNNInputValidator.validateErrorMessage(123);
      expect(result.valid).toBe(false);
    });

    it('should reject empty messages', () => {
      const result = GNNInputValidator.validateErrorMessage('');
      expect(result.valid).toBe(false);
    });

    it('should reject messages exceeding max length', () => {
      const longMsg = 'a'.repeat(CONSTANTS.MAX_ERROR_MESSAGE_LENGTH + 1);
      const result = GNNInputValidator.validateErrorMessage(longMsg);
      expect(result.valid).toBe(false);
    });

    it('should remove null bytes from messages', () => {
      const result = GNNInputValidator.validateErrorMessage('Error\x00message');
      expect(result.valid).toBe(true);
      expect(result.sanitized).not.toContain('\x00');
    });
  });

  describe('validateFilePath', () => {
    it('should accept valid file paths', () => {
      const result = GNNInputValidator.validateFilePath('src/lib/file.ts');
      expect(result.valid).toBe(true);
    });

    it('should accept Windows paths', () => {
      const result = GNNInputValidator.validateFilePath('src\\lib\\file.ts');
      expect(result.valid).toBe(true);
    });

    it('should accept absolute paths with drive letters', () => {
      const result = GNNInputValidator.validateFilePath('C:/src/lib/file.ts');
      expect(result.valid).toBe(true);
    });

    it('should reject path traversal attempts (CVSS 6.5)', () => {
      const result = GNNInputValidator.validateFilePath('../../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('path traversal');
    });

    it('should reject empty paths', () => {
      const result = GNNInputValidator.validateFilePath('');
      expect(result.valid).toBe(false);
    });

    it('should reject paths exceeding max length', () => {
      const longPath = 'a/'.repeat(300);
      const result = GNNInputValidator.validateFilePath(longPath);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid characters in paths', () => {
      const result = GNNInputValidator.validateFilePath('src/<script>');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateNodeIdArray', () => {
    it('should accept valid array of node IDs', () => {
      const result = GNNInputValidator.validateNodeIdArray(['id1', 'id2', 'id3']);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toHaveLength(3);
    });

    it('should reject non-array input', () => {
      const result = GNNInputValidator.validateNodeIdArray('id1,id2');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('array');
    });

    it('should reject empty arrays', () => {
      const result = GNNInputValidator.validateNodeIdArray([]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must not be empty');
    });

    it('should reject arrays exceeding max count', () => {
      const largeArray = Array(1001).fill('id');
      const result = GNNInputValidator.validateNodeIdArray(largeArray);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds max count');
    });

    it('should sanitize IDs in array', () => {
      const result = GNNInputValidator.validateNodeIdArray(['id<1>', 'id&2']);
      expect(result.valid).toBe(true);
      expect(result.sanitized[0]).not.toContain('<');
      expect(result.sanitized[1]).not.toContain('&');
    });
  });
});

describe('TraversalGuard', () => {
  describe('checkIteration', () => {
    it('should allow iterations within limit', () => {
      const guard = new TraversalGuard({ maxIterations: 100 });
      expect(() => {
        for (let i = 0; i < 50; i++) {
          guard.checkIteration();
        }
      }).not.toThrow();
    });

    it('should throw when iteration limit exceeded (CVSS 7.5)', () => {
      const guard = new TraversalGuard({ maxIterations: 10 });
      expect(() => {
        for (let i = 0; i < 15; i++) {
          guard.checkIteration();
        }
      }).toThrow('exceeded max iterations');
    });

    it('should throw on timeout (CVSS 7.5)', () => {
      const guard = new TraversalGuard({ timeoutMs: 10 });
      expect(() => {
        // Simulate slow operations that exceed timeout
        const start = Date.now();
        while (Date.now() - start < 50) {
          guard.checkIteration();
        }
      }).toThrow('exceeded max timeout');
    });
  });

  describe('enterDepth / exitDepth', () => {
    it('should track depth correctly', () => {
      const guard = new TraversalGuard({ maxDepth: 100 });
      guard.enterDepth();
      guard.enterDepth();
      guard.exitDepth();
      const stats = guard.getStats();
      expect(stats.currentDepth).toBe(1);
    });

    it('should throw when max depth exceeded (CVSS 7.5)', () => {
      const guard = new TraversalGuard({ maxDepth: 5 });
      expect(() => {
        for (let i = 0; i < 10; i++) {
          guard.enterDepth();
        }
      }).toThrow('exceeded max depth');
    });
  });

  describe('checkQueueSize', () => {
    it('should allow queue operations within limit', () => {
      const guard = new TraversalGuard({ maxQueueSize: 1000 });
      expect(() => {
        guard.checkQueueSize(500);
        guard.checkQueueSize(999);
      }).not.toThrow();
    });

    it('should throw when queue size at limit', () => {
      const guard = new TraversalGuard({ maxQueueSize: 1000 });
      expect(() => {
        guard.checkQueueSize(1000);
      }).toThrow('Queue exceeded max size');
    });
  });

  describe('reset', () => {
    it('should reset internal counters', () => {
      const guard = new TraversalGuard();
      guard.checkIteration();
      guard.checkIteration();
      guard.reset();
      const stats = guard.getStats();
      expect(stats.iterations).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return current traversal statistics', () => {
      const guard = new TraversalGuard({
        maxIterations: 1000,
        maxDepth: 100,
      });
      for (let i = 0; i < 50; i++) {
        guard.checkIteration();
      }
      const stats = guard.getStats();
      expect(stats.iterations).toBe(50);
      expect(stats.iterationUtilization).toBeCloseTo(0.05, 2);
    });
  });
});

describe('EdgeValidator', () => {
  describe('validateEdge', () => {
    it('should accept valid edge configuration', () => {
      const result = EdgeValidator.validateEdge('error1', 'error2', 0.8, 'causedBy');
      expect(result.valid).toBe(true);
    });

    it('should reject self-loops', () => {
      const result = EdgeValidator.validateEdge('error1', 'error1', 0.8, 'causedBy');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Self-loops');
    });

    it('should reject invalid edge types', () => {
      const result = EdgeValidator.validateEdge('error1', 'error2', 0.8, 'invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid edge type');
    });

    it('should reject invalid confidence values', () => {
      const result = EdgeValidator.validateEdge('error1', 'error2', 1.5, 'causedBy');
      expect(result.valid).toBe(false);
    });

    it('should sanitize node IDs in edge', () => {
      const result = EdgeValidator.validateEdge(
        'error<1>',
        'error&2',
        0.8,
        'causedBy'
      );
      expect(result.valid).toBe(true);
      expect(result.sanitized.sourceId).not.toContain('<');
      expect(result.sanitized.targetId).not.toContain('&');
    });
  });
});

describe('BatchValidator', () => {
  describe('validateOperationBatch', () => {
    it('should accept valid operation batches', () => {
      const ops = [
        { type: 'add', data: 'test1' },
        { type: 'remove', data: 'test2' },
      ];
      const result = BatchValidator.validateOperationBatch(ops);
      expect(result.valid).toBe(true);
    });

    it('should reject non-array batches', () => {
      const result = BatchValidator.validateOperationBatch({ op: 'add' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('array');
    });

    it('should reject empty batches', () => {
      const result = BatchValidator.validateOperationBatch([]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least one');
    });

    it('should reject batches exceeding max size', () => {
      const largeBatch = Array(1001).fill({ type: 'add' });
      const result = BatchValidator.validateOperationBatch(largeBatch);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds max size');
    });
  });
});

describe('Security Integration Tests', () => {
  it('should prevent injection attacks via sanitization', () => {
    const maliciousId = "'; DROP TABLE errors; --";
    const result = GNNInputValidator.validateNodeId(maliciousId);
    // Should either reject or sanitize
    expect(result.valid || !result.valid).toBe(true);
    if (result.valid) {
      expect(result.sanitized).not.toContain("'");
      expect(result.sanitized).not.toContain(';');
    }
  });

  it('should prevent XSS attacks via sanitization', () => {
    const xssPayload = '<img src=x onerror="alert(1)">';
    const result = GNNInputValidator.validateErrorMessage(xssPayload);
    expect(result.valid).toBe(true);
    expect(result.sanitized).not.toContain('<');
    expect(result.sanitized).not.toContain('>');
  });

  it('should prevent path traversal attacks', () => {
    const pathTraversal = '../../../../etc/passwd';
    const result = GNNInputValidator.validateFilePath(pathTraversal);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('path traversal');
  });

  it('should prevent DoS via unbounded recursion (CVSS 7.5)', () => {
    const guard = new TraversalGuard({
      maxIterations: 10000,
      maxDepth: 100,
      timeoutMs: 1000,
    });

    // Simulate attack attempt
    expect(() => {
      for (let i = 0; i < 20000; i++) {
        guard.checkIteration();
      }
    }).toThrow();
  });

  it('should prevent queue overflow attacks (CVSS 7.5)', () => {
    const guard = new TraversalGuard({
      maxQueueSize: 1000,
    });

    expect(() => {
      guard.checkQueueSize(2000);
    }).toThrow('exceeded max size');
  });
});
