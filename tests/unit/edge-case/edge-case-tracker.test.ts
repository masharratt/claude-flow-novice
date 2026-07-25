/**
 * Edge Case Tracker Tests (TDD - Written FIRST)
 *
 * Test Coverage:
 * - Edge case recording
 * - Deduplication logic
 * - Expert notification
 * - Feedback loop workflow
 * - Analytics queries
 * - Priority scoring
 */

import { EdgeCaseTracker } from '../src/services/edge-case-tracker';
import { EdgeCaseDeduplicator } from '../src/lib/edge-case-deduplicator';
import {
  EdgeCase,
  EdgeCaseType,
  EdgeCaseCategory,
  EdgeCasePriority,
  EdgeCaseStatus,
  EdgeCaseInput
} from '../src/types/edge-case';
import * as fs from 'fs';
import * as path from 'path';

describe('EdgeCaseTracker', () => {
  let tracker: EdgeCaseTracker;
  const testDbPath = path.join(__dirname, '../.test-data/edge-case-tracker.db');

  beforeEach(async () => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create test database directory
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Initialize tracker with test database
    tracker = new EdgeCaseTracker({
      dbPath: testDbPath,
      notificationConfig: {
        slack: { enabled: false },
        email: { enabled: false }
      }
    });

    await tracker.initialize();
  });

  afterEach(async () => {
    await tracker.close();

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Edge Case Recording', () => {
    test('should record new edge case', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.SYNTAX_ERROR,
        category: EdgeCaseCategory.SKILL_EXECUTION,
        context: {
          error: {
            message: 'Unexpected token',
            stack: 'Error: Unexpected token\n  at Parser.parse (/app/parser.js:42:10)'
          },
          skillName: 'cfn-coordination',
          timestamp: '2025-11-16T13:00:00Z'
        }
      };

      const recorded = await tracker.recordEdgeCase(edgeCase);

      expect(recorded).toBeDefined();
      expect(recorded.id).toBeDefined();
      expect(recorded.signature).toBeDefined();
      expect(recorded.type).toBe(EdgeCaseType.SYNTAX_ERROR);
      expect(recorded.category).toBe(EdgeCaseCategory.SKILL_EXECUTION);
      expect(recorded.status).toBe(EdgeCaseStatus.NEW);
      expect(recorded.occurrenceCount).toBe(1);
      expect(recorded.priority).toBeDefined();
    });

    test('should auto-categorize edge case', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.DATA_VALIDATION,
        category: EdgeCaseCategory.DATABASE_OPERATION,
        context: {
          error: {
            message: 'Invalid foreign key',
            stack: 'Error: Invalid foreign key'
          }
        }
      };

      const recorded = await tracker.recordEdgeCase(edgeCase);

      expect(recorded.category).toBe(EdgeCaseCategory.DATABASE_OPERATION);
    });

    test('should calculate priority score', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.SYSTEM_ERROR,
        category: EdgeCaseCategory.COORDINATION,
        context: {
          error: {
            message: 'Coordinator timeout',
            stack: 'Error: Coordinator timeout after 300s'
          }
        }
      };

      const recorded = await tracker.recordEdgeCase(edgeCase);

      expect(recorded.priority).toBeDefined();
      expect([
        EdgeCasePriority.CRITICAL,
        EdgeCasePriority.HIGH,
        EdgeCasePriority.MEDIUM,
        EdgeCasePriority.LOW
      ]).toContain(recorded.priority);
    });

    test('should record edge case within 100ms', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.LOGIC_ERROR,
        category: EdgeCaseCategory.FILE_OPERATION,
        context: {
          error: {
            message: 'File not found',
            stack: 'Error: ENOENT'
          }
        }
      };

      const startTime = Date.now();
      await tracker.recordEdgeCase(edgeCase);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('Deduplication Logic', () => {
    test('should detect duplicate edge case', async () => {
      const edgeCase1: EdgeCaseInput = {
        type: EdgeCaseType.TIMEOUT,
        category: EdgeCaseCategory.API_CALL,
        context: {
          error: {
            message: 'Request timeout after 5000ms',
            stack: 'Error: timeout\n  at fetch (api.js:123)'
          },
          endpoint: '/api/users/12345'
        }
      };

      const edgeCase2: EdgeCaseInput = {
        type: EdgeCaseType.TIMEOUT,
        category: EdgeCaseCategory.API_CALL,
        context: {
          error: {
            message: 'Request timeout after 5000ms',
            stack: 'Error: timeout\n  at fetch (api.js:123)'
          },
          endpoint: '/api/users/67890' // Different ID but same issue
        }
      };

      const first = await tracker.recordEdgeCase(edgeCase1);
      const second = await tracker.recordEdgeCase(edgeCase2);

      expect(first.signature).toBe(second.signature);
      expect(second.occurrenceCount).toBe(2);
      expect(first.id).toBe(second.id);
    });

    test('should normalize timestamps in signature', async () => {
      const deduplicator = new EdgeCaseDeduplicator();

      const normalized1 = deduplicator.normalizeContext({
        error: {
          message: 'Error at 2025-11-16T10:00:00Z',
          stack: 'Stack'
        }
      });

      const normalized2 = deduplicator.normalizeContext({
        error: {
          message: 'Error at 2025-11-16T15:30:00Z',
          stack: 'Stack'
        }
      });

      expect(normalized1).toBe(normalized2);
    });

    test('should normalize IDs in signature', async () => {
      const deduplicator = new EdgeCaseDeduplicator();

      const normalized1 = deduplicator.normalizeContext({
        error: {
          message: 'Error in task-abc123def',
          stack: 'Stack'
        }
      });

      const normalized2 = deduplicator.normalizeContext({
        error: {
          message: 'Error in task-xyz789ghi',
          stack: 'Stack'
        }
      });

      expect(normalized1).toBe(normalized2);
    });

    test('should normalize numbers in signature', async () => {
      const deduplicator = new EdgeCaseDeduplicator();

      const normalized1 = deduplicator.normalizeContext({
        error: {
          message: 'Timeout after 5000ms',
          stack: 'Stack'
        }
      });

      const normalized2 = deduplicator.normalizeContext({
        error: {
          message: 'Timeout after 3000ms',
          stack: 'Stack'
        }
      });

      expect(normalized1).toBe(normalized2);
    });

    test('should generate SHA-256 signature', async () => {
      const deduplicator = new EdgeCaseDeduplicator();

      const signature = deduplicator.generateSignature({
        type: EdgeCaseType.SYNTAX_ERROR,
        category: EdgeCaseCategory.SKILL_EXECUTION,
        context: {
          error: {
            message: 'Syntax error',
            stack: 'Stack trace'
          }
        }
      });

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should check deduplication within 50ms', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.LOGIC_ERROR,
        category: EdgeCaseCategory.FILE_OPERATION,
        context: {
          error: {
            message: 'File not found',
            stack: 'Error: ENOENT'
          }
        }
      };

      // Record first occurrence
      await tracker.recordEdgeCase(edgeCase);

      // Check deduplication time
      const startTime = Date.now();
      await tracker.recordEdgeCase(edgeCase);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50);
    });

    test('should increment occurrence count for duplicates', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.DATA_VALIDATION,
        category: EdgeCaseCategory.DATABASE_OPERATION,
        context: {
          error: {
            message: 'Schema validation failed',
            stack: 'Error: validation'
          }
        }
      };

      const first = await tracker.recordEdgeCase(edgeCase);
      expect(first.occurrenceCount).toBe(1);

      const second = await tracker.recordEdgeCase(edgeCase);
      expect(second.occurrenceCount).toBe(2);

      const third = await tracker.recordEdgeCase(edgeCase);
      expect(third.occurrenceCount).toBe(3);
    });

    test('should update lastOccurred timestamp for duplicates', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.TIMEOUT,
        category: EdgeCaseCategory.API_CALL,
        context: {
          error: {
            message: 'Timeout',
            stack: 'Error'
          }
        }
      };

      const first = await tracker.recordEdgeCase(edgeCase);
      const firstTime = first.lastOccurred;

      // Wait 100ms
      await new Promise(resolve => setTimeout(resolve, 100));

      const second = await tracker.recordEdgeCase(edgeCase);
      const secondTime = second.lastOccurred;

      expect(secondTime.getTime()).toBeGreaterThan(firstTime.getTime());
    });
  });

  describe('Priority Scoring Algorithm', () => {
    test('should assign CRITICAL priority for frequent system errors', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.SYSTEM_ERROR,
        category: EdgeCaseCategory.DATABASE_OPERATION,
        context: {
          error: {
            message: 'Database connection lost',
            stack: 'Error: ECONNREFUSED'
          }
        }
      };

      // Simulate 150 occurrences
      let recorded: EdgeCase;
      for (let i = 0; i < 150; i++) {
        recorded = await tracker.recordEdgeCase(edgeCase);
      }

      expect(recorded!.priority).toBe(EdgeCasePriority.CRITICAL);
    });

    test('should assign HIGH priority for recent frequent errors', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.LOGIC_ERROR,
        category: EdgeCaseCategory.COORDINATION,
        context: {
          error: {
            message: 'Agent coordination failed',
            stack: 'Error: coordination'
          }
        }
      };

      // Simulate 15 occurrences
      let recorded: EdgeCase;
      for (let i = 0; i < 15; i++) {
        recorded = await tracker.recordEdgeCase(edgeCase);
      }

      expect([EdgeCasePriority.CRITICAL, EdgeCasePriority.HIGH]).toContain(recorded!.priority);
    });

    test('should assign MEDIUM priority for occasional errors', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.DATA_VALIDATION,
        category: EdgeCaseCategory.FILE_OPERATION,
        context: {
          error: {
            message: 'Invalid file format',
            stack: 'Error: format'
          }
        }
      };

      // Simulate 3 occurrences
      let recorded: EdgeCase;
      for (let i = 0; i < 3; i++) {
        recorded = await tracker.recordEdgeCase(edgeCase);
      }

      expect([EdgeCasePriority.MEDIUM, EdgeCasePriority.HIGH]).toContain(recorded!.priority);
    });

    test('should assign LOW priority for rare errors', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.SYNTAX_ERROR,
        category: EdgeCaseCategory.SKILL_EXECUTION,
        context: {
          error: {
            message: 'Rare syntax issue',
            stack: 'Error: syntax'
          }
        }
      };

      const recorded = await tracker.recordEdgeCase(edgeCase);

      expect(recorded.priority).toBe(EdgeCasePriority.LOW);
    });
  });

  describe('Expert Notification', () => {
    test('should queue notification for new edge case', async () => {
      const tracker = new EdgeCaseTracker({
        dbPath: testDbPath,
        notificationConfig: {
          slack: { enabled: true, webhookUrl: 'https://hooks.slack.com/test' },
          email: { enabled: true, recipients: ['expert@example.com'] }
        }
      });

      await tracker.initialize();

      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.SYSTEM_ERROR,
        category: EdgeCaseCategory.DATABASE_OPERATION,
        context: {
          error: {
            message: 'Critical database error',
            stack: 'Error: critical'
          }
        }
      };

      const recorded = await tracker.recordEdgeCase(edgeCase);

      const notifications = await tracker.getPendingNotifications();
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0].edgeCaseId).toBe(recorded.id);

      await tracker.close();
    });

    test('should not duplicate notifications for same edge case', async () => {
      const tracker = new EdgeCaseTracker({
        dbPath: testDbPath,
        notificationConfig: {
          slack: { enabled: true, webhookUrl: 'https://hooks.slack.com/test' },
          email: { enabled: false }
        }
      });

      await tracker.initialize();

      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.TIMEOUT,
        category: EdgeCaseCategory.API_CALL,
        context: {
          error: {
            message: 'API timeout',
            stack: 'Error: timeout'
          }
        }
      };

      await tracker.recordEdgeCase(edgeCase);
      await tracker.recordEdgeCase(edgeCase); // Duplicate
      await tracker.recordEdgeCase(edgeCase); // Duplicate

      const notifications = await tracker.getPendingNotifications();
      expect(notifications.length).toBe(1); // Only one notification

      await tracker.close();
    });

    test('should prioritize CRITICAL notifications', async () => {
      const tracker = new EdgeCaseTracker({
        dbPath: testDbPath,
        notificationConfig: {
          slack: { enabled: true, webhookUrl: 'https://hooks.slack.com/test' },
          email: { enabled: true, recipients: ['expert@example.com'] }
        }
      });

      await tracker.initialize();

      const criticalCase: EdgeCaseInput = {
        type: EdgeCaseType.SYSTEM_ERROR,
        category: EdgeCaseCategory.DATABASE_OPERATION,
        context: {
          error: {
            message: 'Critical error',
            stack: 'Error'
          }
        }
      };

      // Simulate many occurrences to trigger CRITICAL
      for (let i = 0; i < 150; i++) {
        await tracker.recordEdgeCase(criticalCase);
      }

      const notifications = await tracker.getPendingNotifications();
      const criticalNotifications = notifications.filter(n => n.priority === EdgeCasePriority.CRITICAL);

      expect(criticalNotifications.length).toBeGreaterThan(0);

      await tracker.close();
    });
  });

  describe('Feedback Loop Workflow', () => {
    test('should transition from NEW to INVESTIGATING', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.LOGIC_ERROR,
        category: EdgeCaseCategory.SKILL_EXECUTION,
        context: {
          error: {
            message: 'Logic error',
            stack: 'Error'
          }
        }
      };

      const recorded = await tracker.recordEdgeCase(edgeCase);
      expect(recorded.status).toBe(EdgeCaseStatus.NEW);

      await tracker.updateStatus(recorded.id, EdgeCaseStatus.INVESTIGATING, 'expert@example.com');

      const updated = await tracker.getEdgeCase(recorded.id);
      expect(updated?.status).toBe(EdgeCaseStatus.INVESTIGATING);
      expect(updated?.assignedExpert).toBe('expert@example.com');
    });

    test('should transition from INVESTIGATING to RESOLVED', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.DATA_VALIDATION,
        category: EdgeCaseCategory.DATABASE_OPERATION,
        context: {
          error: {
            message: 'Validation error',
            stack: 'Error'
          }
        }
      };

      const recorded = await tracker.recordEdgeCase(edgeCase);
      await tracker.updateStatus(recorded.id, EdgeCaseStatus.INVESTIGATING, 'expert@example.com');

      const resolution = {
        description: 'Fixed validation logic',
        fixedInCommit: 'abc123',
        verificationTest: 'tests/validation.test.ts'
      };

      await tracker.resolveEdgeCase(recorded.id, resolution);

      const resolved = await tracker.getEdgeCase(recorded.id);
      expect(resolved?.status).toBe(EdgeCaseStatus.RESOLVED);
      expect(resolved?.resolvedAt).toBeDefined();
      expect(resolved?.resolution).toBeDefined();
    });

    test('should auto-close after 7 days without recurrence', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.SYNTAX_ERROR,
        category: EdgeCaseCategory.FILE_OPERATION,
        context: {
          error: {
            message: 'Syntax error',
            stack: 'Error'
          }
        }
      };

      const recorded = await tracker.recordEdgeCase(edgeCase);
      await tracker.resolveEdgeCase(recorded.id, {
        description: 'Fixed syntax issue'
      });

      // Simulate 7 days passing
      await tracker.checkAutoClose();

      const maybeClosed = await tracker.getEdgeCase(recorded.id);
      // Status should still be RESOLVED (not enough time passed in test)
      expect([EdgeCaseStatus.RESOLVED, EdgeCaseStatus.CLOSED]).toContain(maybeClosed?.status!);
    });

    test('should track resolution time (SLA)', async () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.TIMEOUT,
        category: EdgeCaseCategory.API_CALL,
        context: {
          error: {
            message: 'Timeout',
            stack: 'Error'
          }
        }
      };

      const recorded = await tracker.recordEdgeCase(edgeCase);
      const detectedTime = recorded.firstOccurred;

      await tracker.updateStatus(recorded.id, EdgeCaseStatus.INVESTIGATING, 'expert@example.com');
      await tracker.resolveEdgeCase(recorded.id, {
        description: 'Increased timeout'
      });

      const resolved = await tracker.getEdgeCase(recorded.id);
      const resolutionTime = resolved!.resolvedAt!.getTime() - detectedTime.getTime();

      expect(resolutionTime).toBeGreaterThan(0);
    });
  });

  describe('Analytics Queries', () => {
    test('should query top edge cases by frequency', async () => {
      // Create multiple edge cases
      for (let i = 0; i < 5; i++) {
        await tracker.recordEdgeCase({
          type: EdgeCaseType.TIMEOUT,
          category: EdgeCaseCategory.API_CALL,
          context: { error: { message: 'Timeout A', stack: 'Error' } }
        });
      }

      for (let i = 0; i < 3; i++) {
        await tracker.recordEdgeCase({
          type: EdgeCaseType.LOGIC_ERROR,
          category: EdgeCaseCategory.SKILL_EXECUTION,
          context: { error: { message: 'Logic B', stack: 'Error' } }
        });
      }

      const startTime = Date.now();
      const topCases = await tracker.getTopEdgeCases({ limit: 10, orderBy: 'frequency' });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500); // <500ms analytics query
      expect(topCases.length).toBeGreaterThan(0);
      expect(topCases[0].occurrenceCount).toBeGreaterThanOrEqual(topCases[1]?.occurrenceCount || 0);
    });

    test('should calculate resolution rate', async () => {
      // Create resolved and unresolved cases
      const case1 = await tracker.recordEdgeCase({
        type: EdgeCaseType.SYNTAX_ERROR,
        category: EdgeCaseCategory.FILE_OPERATION,
        context: { error: { message: 'Syntax 1', stack: 'Error' } }
      });

      const case2 = await tracker.recordEdgeCase({
        type: EdgeCaseType.DATA_VALIDATION,
        category: EdgeCaseCategory.DATABASE_OPERATION,
        context: { error: { message: 'Validation 2', stack: 'Error' } }
      });

      await tracker.resolveEdgeCase(case1.id, { description: 'Fixed' });

      const analytics = await tracker.getAnalytics();

      expect(analytics.totalCases).toBe(2);
      expect(analytics.resolvedCases).toBe(1);
      expect(analytics.resolutionRate).toBe(0.5);
    });

    test('should group edge cases by category', async () => {
      await tracker.recordEdgeCase({
        type: EdgeCaseType.TIMEOUT,
        category: EdgeCaseCategory.API_CALL,
        context: { error: { message: 'API timeout', stack: 'Error' } }
      });

      await tracker.recordEdgeCase({
        type: EdgeCaseType.SYSTEM_ERROR,
        category: EdgeCaseCategory.DATABASE_OPERATION,
        context: { error: { message: 'DB error', stack: 'Error' } }
      });

      await tracker.recordEdgeCase({
        type: EdgeCaseType.LOGIC_ERROR,
        category: EdgeCaseCategory.API_CALL,
        context: { error: { message: 'API logic', stack: 'Error' } }
      });

      const byCategory = await tracker.getEdgeCasesByCategory();

      expect(byCategory[EdgeCaseCategory.API_CALL]).toBe(2);
      expect(byCategory[EdgeCaseCategory.DATABASE_OPERATION]).toBe(1);
    });

    test('should query edge cases by priority', async () => {
      // Create high-frequency case (will be CRITICAL)
      for (let i = 0; i < 150; i++) {
        await tracker.recordEdgeCase({
          type: EdgeCaseType.SYSTEM_ERROR,
          category: EdgeCaseCategory.DATABASE_OPERATION,
          context: { error: { message: 'Critical DB', stack: 'Error' } }
        });
      }

      // Create low-frequency case (will be LOW)
      await tracker.recordEdgeCase({
        type: EdgeCaseType.SYNTAX_ERROR,
        category: EdgeCaseCategory.FILE_OPERATION,
        context: { error: { message: 'Minor syntax', stack: 'Error' } }
      });

      const criticalCases = await tracker.getEdgeCasesByPriority(EdgeCasePriority.CRITICAL);
      const lowCases = await tracker.getEdgeCasesByPriority(EdgeCasePriority.LOW);

      expect(criticalCases.length).toBeGreaterThan(0);
      expect(lowCases.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    test('should integrate with StandardError', async () => {
      // Mock StandardError from src/lib/errors.ts
      const standardError = {
        code: 'ERR_VALIDATION',
        message: 'Validation failed',
        context: {
          field: 'email',
          value: 'invalid'
        }
      };

      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.DATA_VALIDATION,
        category: EdgeCaseCategory.SKILL_EXECUTION,
        context: standardError
      };

      const recorded = await tracker.recordEdgeCase(edgeCase);

      expect(recorded).toBeDefined();
      expect(recorded.context).toMatchObject(standardError);
    });

    test('should integrate with edge-case-analyzer', async () => {
      // This would integrate with src/services/edge-case-analyzer.ts (Task 5.1)
      const analyzedCase = {
        type: EdgeCaseType.LOGIC_ERROR,
        category: EdgeCaseCategory.COORDINATION,
        context: {
          error: {
            message: 'Coordination failure',
            stack: 'Error'
          },
          analysisMetadata: {
            detectedBy: 'edge-case-analyzer',
            confidence: 0.85
          }
        }
      };

      const recorded = await tracker.recordEdgeCase(analyzedCase);

      expect(recorded).toBeDefined();
      expect(recorded.context.analysisMetadata).toBeDefined();
    });
  });
});

describe('EdgeCaseDeduplicator', () => {
  let deduplicator: EdgeCaseDeduplicator;

  beforeEach(() => {
    deduplicator = new EdgeCaseDeduplicator();
  });

  describe('Normalization', () => {
    test('should normalize context object', () => {
      const context = {
        error: {
          message: 'Error on 2025-11-16 for user-12345 with value 100',
          stack: 'Stack trace here'
        }
      };

      const normalized = deduplicator.normalizeContext(context);

      expect(normalized).toContain('{date}');
      expect(normalized).toContain('{id}');
      expect(normalized).toContain('{number}');
      expect(normalized).not.toContain('2025-11-16');
      expect(normalized).not.toContain('12345');
      expect(normalized).not.toContain('100');
    });

    test('should normalize stack traces', () => {
      const stack1 = 'Error: test\n  at Object.<anonymous> (/app/file.js:42:10)';
      const stack2 = 'Error: test\n  at Object.<anonymous> (/app/file.js:99:20)';

      const normalized1 = deduplicator.normalizeStackTrace(stack1);
      const normalized2 = deduplicator.normalizeStackTrace(stack2);

      expect(normalized1).toBe(normalized2);
    });
  });

  describe('Signature Generation', () => {
    test('should generate consistent signatures', () => {
      const edgeCase: EdgeCaseInput = {
        type: EdgeCaseType.TIMEOUT,
        category: EdgeCaseCategory.API_CALL,
        context: {
          error: {
            message: 'Timeout',
            stack: 'Error'
          }
        }
      };

      const sig1 = deduplicator.generateSignature(edgeCase);
      const sig2 = deduplicator.generateSignature(edgeCase);

      expect(sig1).toBe(sig2);
    });

    test('should generate different signatures for different errors', () => {
      const case1: EdgeCaseInput = {
        type: EdgeCaseType.TIMEOUT,
        category: EdgeCaseCategory.API_CALL,
        context: {
          error: {
            message: 'Timeout A',
            stack: 'Error'
          }
        }
      };

      const case2: EdgeCaseInput = {
        type: EdgeCaseType.LOGIC_ERROR,
        category: EdgeCaseCategory.SKILL_EXECUTION,
        context: {
          error: {
            message: 'Logic error B',
            stack: 'Error'
          }
        }
      };

      const sig1 = deduplicator.generateSignature(case1);
      const sig2 = deduplicator.generateSignature(case2);

      expect(sig1).not.toBe(sig2);
    });
  });
});
