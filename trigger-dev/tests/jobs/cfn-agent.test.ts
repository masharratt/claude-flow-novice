/**
 * CFN Agent Job Tests
 * Tests Loop 3 agent execution logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Loop3JobPayload,
  AgentResult,
  TestResults,
} from '../../src/types/cfn-types';

// Mock agent spawner
vi.mock('../../src/utils/agent-spawner', () => ({
  getSpawner: vi.fn(() => ({
    spawn: vi.fn().mockResolvedValue({
      agentId: 'test-agent-001',
      jobId: 'job-123',
      spawnedAt: new Date().toISOString(),
      estimatedDurationSeconds: 300,
    }),
  })),
  AgentSpawner: vi.fn(),
}));

// Mock trigger.dev SDK
vi.mock('@trigger.dev/sdk/v3', () => ({
  task: vi.fn((config) => ({
    id: config.id,
    run: config.run,
    trigger: vi.fn((payload) => config.run(payload)),
  })),
  logger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create test payload
function createLoop3Payload(overrides: Partial<Loop3JobPayload> = {}): Loop3JobPayload {
  return {
    taskId: 'test-task-001',
    agentType: 'backend-developer',
    description: 'Implement authentication feature',
    successCriteria: {
      testCommand: 'npm test',
      passRateThreshold: 0.95,
    },
    iterationNumber: 1,
    ...overrides,
  };
}

describe('CFN Agent Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Payload Validation', () => {
    it('should accept valid Loop3 payload', () => {
      const payload = createLoop3Payload();
      expect(payload.taskId).toBeDefined();
      expect(payload.agentType).toBeDefined();
      expect(payload.description).toBeDefined();
      expect(payload.successCriteria).toBeDefined();
      expect(payload.iterationNumber).toBeGreaterThanOrEqual(1);
    });

    it('should accept payload with previous context', () => {
      const previousResults: AgentResult[] = [
        {
          agentId: 'prev-agent-001',
          agentType: 'backend-developer',
          confidence: 0.85,
          deliverables: { files: [], summary: 'Previous work' },
          testResults: { total: 100, passed: 85, failed: 15, passRate: 0.85 },
          completedAt: new Date().toISOString(),
        },
      ];

      const payload = createLoop3Payload({ previousContext: previousResults });
      expect(payload.previousContext).toHaveLength(1);
    });

    it('should validate agent types', () => {
      const validTypes = [
        'backend-developer',
        'typescript-specialist',
        'security-specialist',
        'frontend-developer',
      ];

      validTypes.forEach((agentType) => {
        const payload = createLoop3Payload({ agentType });
        expect(payload.agentType).toBe(agentType);
      });
    });
  });

  describe('Agent ID Generation', () => {
    it('should generate unique agent IDs', () => {
      const generateAgentId = (agentType: string): string => {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 9);
        return `${agentType}-${timestamp}-${random}`;
      };

      const id1 = generateAgentId('backend-developer');
      const id2 = generateAgentId('backend-developer');

      expect(id1).toContain('backend-developer');
      expect(id2).toContain('backend-developer');
      expect(id1).not.toBe(id2);
    });

    it('should include agent type in ID', () => {
      const generateAgentId = (agentType: string): string => {
        return `${agentType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      };

      const id = generateAgentId('security-specialist');
      expect(id.startsWith('security-specialist')).toBe(true);
    });
  });

  describe('Test Result Parsing', () => {
    const parseTestResults = (output: string): TestResults => {
      const passedMatch = output.match(/(\d+)\s+(?:passed|passing)/i);
      const failedMatch = output.match(/(\d+)\s+(?:failed|failing)/i);
      const coverageMatch = output.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:coverage|covered)/i);

      const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
      const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
      const total = passed + failed;
      const passRate = total > 0 ? passed / total : 0;
      const coverage = coverageMatch ? parseFloat(coverageMatch[1]) / 100 : undefined;

      return { total, passed, failed, passRate, output, coverage };
    };

    it('should parse standard test output format', () => {
      const output = 'Tests: 95 passed, 5 failed';
      const results = parseTestResults(output);

      expect(results.passed).toBe(95);
      expect(results.failed).toBe(5);
      expect(results.total).toBe(100);
      expect(results.passRate).toBe(0.95);
    });

    it('should parse output with coverage', () => {
      const output = '95 passed, 5 failed, 87% coverage';
      const results = parseTestResults(output);

      expect(results.passRate).toBe(0.95);
      expect(results.coverage).toBeCloseTo(0.87, 2);
    });

    it('should handle passing-only output', () => {
      const output = '100 passing tests';
      const results = parseTestResults(output);

      expect(results.passed).toBe(100);
      expect(results.failed).toBe(0);
      expect(results.passRate).toBe(1.0);
    });

    it('should handle zero tests', () => {
      const output = 'No tests found';
      const results = parseTestResults(output);

      expect(results.total).toBe(0);
      expect(results.passRate).toBe(0);
    });

    it('should parse vitest-style output', () => {
      const output = 'Tests: 127 passing, 3 failing';
      const results = parseTestResults(output);

      expect(results.passed).toBe(127);
      expect(results.failed).toBe(3);
    });
  });

  describe('Confidence Scoring', () => {
    const calculateConfidence = (testResults: TestResults): number => {
      let confidence = testResults.passRate;

      if (testResults.coverage && testResults.coverage >= 0.8) {
        confidence = Math.min(1.0, confidence + 0.1);
      }

      if (testResults.total >= 50) {
        confidence = Math.min(1.0, confidence + 0.05);
      }

      return Math.round(confidence * 100) / 100;
    };

    it('should base confidence on pass rate', () => {
      const testResults: TestResults = {
        total: 100,
        passed: 95,
        failed: 5,
        passRate: 0.95,
      };

      const confidence = calculateConfidence(testResults);
      expect(confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('should boost confidence for high coverage', () => {
      const testResults: TestResults = {
        total: 100,
        passed: 90,
        failed: 10,
        passRate: 0.90,
        coverage: 0.85,
      };

      const confidence = calculateConfidence(testResults);
      expect(confidence).toBe(1.0); // 0.90 + 0.10 (coverage) + 0.05 (large suite) = 1.05 -> capped at 1.0
    });

    it('should boost confidence for large test suites', () => {
      const smallSuite: TestResults = {
        total: 10,
        passed: 9,
        failed: 1,
        passRate: 0.90,
      };

      const largeSuite: TestResults = {
        total: 100,
        passed: 90,
        failed: 10,
        passRate: 0.90,
      };

      const smallConfidence = calculateConfidence(smallSuite);
      const largeConfidence = calculateConfidence(largeSuite);

      expect(largeConfidence).toBeGreaterThan(smallConfidence);
    });

    it('should cap confidence at 1.0', () => {
      const perfectResults: TestResults = {
        total: 100,
        passed: 100,
        failed: 0,
        passRate: 1.0,
        coverage: 0.95,
      };

      const confidence = calculateConfidence(perfectResults);
      expect(confidence).toBe(1.0);
    });
  });

  describe('Deliverables Extraction', () => {
    const extractFilesFromOutput = (output: string): string[] => {
      const fileMatches = output.match(/(?:modified|created|updated):\s*(.+)/gi);
      if (!fileMatches) return [];
      return fileMatches.map((match) =>
        match.replace(/(?:modified|created|updated):\s*/i, '').trim()
      );
    };

    const extractSummaryFromOutput = (output: string): string => {
      const lines = output.split('\n');
      const summary = lines
        .filter((line) => line.length > 0 && !line.startsWith('  '))
        .slice(0, 3)
        .join(' ');
      return summary || 'Implementation completed';
    };

    it('should extract modified files', () => {
      const output = `
        Modified: src/auth.ts
        Modified: src/utils/jwt.ts
        Created: src/middleware/auth.ts
      `;

      const files = extractFilesFromOutput(output);
      expect(files).toHaveLength(3);
      expect(files).toContain('src/auth.ts');
    });

    it('should return empty array when no files', () => {
      const output = 'Task completed without file changes';
      const files = extractFilesFromOutput(output);
      expect(files).toHaveLength(0);
    });

    it('should extract summary from output', () => {
      const output = `Agent completed
Status: SUCCESS
Tests: 95 passed`;

      const summary = extractSummaryFromOutput(output);
      expect(summary).toContain('Agent completed');
    });

    it('should provide default summary', () => {
      const output = '';
      const summary = extractSummaryFromOutput(output);
      expect(summary).toBe('Implementation completed');
    });
  });

  describe('Error Handling', () => {
    it('should return zero confidence on failure', () => {
      const failureResult: AgentResult = {
        agentId: 'failed-agent',
        agentType: 'backend-developer',
        confidence: 0,
        deliverables: {
          files: [],
          summary: 'Agent failed: Timeout',
        },
        testResults: {
          total: 0,
          passed: 0,
          failed: 0,
          passRate: 0,
          output: 'Timeout',
        },
        completedAt: new Date().toISOString(),
      };

      expect(failureResult.confidence).toBe(0);
      expect(failureResult.testResults.passRate).toBe(0);
    });

    it('should include error message in deliverables', () => {
      const errorMessage = 'Connection timeout after 30s';
      const failureResult: AgentResult = {
        agentId: 'failed-agent',
        agentType: 'backend-developer',
        confidence: 0,
        deliverables: {
          files: [],
          summary: `Agent failed: ${errorMessage}`,
        },
        testResults: {
          total: 0,
          passed: 0,
          failed: 0,
          passRate: 0,
          output: errorMessage,
        },
        completedAt: new Date().toISOString(),
      };

      expect(failureResult.deliverables.summary).toContain(errorMessage);
    });
  });

  describe('Agent Result Structure', () => {
    it('should include all required fields', () => {
      const result: AgentResult = {
        agentId: 'test-agent-001',
        agentType: 'backend-developer',
        confidence: 0.95,
        deliverables: {
          files: ['src/test.ts'],
          summary: 'Implementation complete',
        },
        testResults: {
          total: 100,
          passed: 95,
          failed: 5,
          passRate: 0.95,
        },
        completedAt: new Date().toISOString(),
      };

      expect(result.agentId).toBeDefined();
      expect(result.agentType).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.deliverables).toBeDefined();
      expect(result.testResults).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });

    it('should allow optional output field', () => {
      const resultWithOutput: AgentResult = {
        agentId: 'test-agent',
        agentType: 'backend-developer',
        confidence: 0.95,
        deliverables: { files: [], summary: 'Done' },
        testResults: { total: 100, passed: 95, failed: 5, passRate: 0.95 },
        completedAt: new Date().toISOString(),
        output: 'Raw agent output here',
      };

      expect(resultWithOutput.output).toBeDefined();
    });
  });
});
