/**
 * @file RetryTodoManager Unit Tests
 * @description Tests for self-executing continuation prompts and retry todo management
 */

import { RetryTodoManager, ContinuationPrompt, RetryTodo } from '../../../src/cfn-loop/retry-todo-manager.js';
import type { ConsensusFeedback } from '../../../src/cfn-loop/feedback-injection-system.js';
import type { ConsensusResult } from '../../../src/cfn-loop/cfn-loop-orchestrator.js';

describe('RetryTodoManager', () => {
  let manager: RetryTodoManager;

  beforeEach(() => {
    manager = new RetryTodoManager({
      maxIterations: 10,
      enableAutoExecution: true,
      todoNamespace: 'test/retry-todos',
    });
  });

  afterEach(() => {
    manager.shutdown();
  });

  describe('Loop 2 Retry Todo Creation', () => {
    it('should create retry todo with self-executing prompt', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test-phase',
        iteration: 3,
        consensusFailed: true,
        consensusScore: 0.75,
        requiredScore: 0.90,
        validatorFeedback: [
          {
            validator: 'security-specialist',
            validatorType: 'security-specialist',
            issues: [
              {
                type: 'security',
                severity: 'critical',
                message: 'Missing rate limiting on auth endpoints',
                suggestedFix: 'Implement express-rate-limit middleware',
              },
            ],
            recommendations: ['Add input validation'],
            confidence: 0.8,
            timestamp: Date.now(),
          },
        ],
        failedCriteria: ['security', 'quality'],
        actionableSteps: [
          {
            priority: 'critical',
            category: 'security',
            action: 'Implement rate limiting for /auth/login',
            targetAgent: 'security-specialist',
            estimatedEffort: 'medium',
          },
        ],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const todo = manager.createLoop2RetryTodo(feedback, 3);

      expect(todo).toBeDefined();
      expect(todo.type).toBe('loop2_retry');
      expect(todo.status).toBe('pending');
      expect(todo.continuationPrompt.urgency).toBe('IMMEDIATE');
      expect(todo.continuationPrompt.action).toBe('RELAUNCH_LOOP_2');
      expect(todo.continuationPrompt.selfLooping).toBe(true);
      expect(todo.continuationPrompt.context.iteration).toBe(3);
      expect(todo.continuationPrompt.context.targetAgents).toContain('security-specialist');
    });

    it('should generate comprehensive continuation prompt', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test-phase',
        iteration: 2,
        consensusFailed: true,
        consensusScore: 0.70,
        requiredScore: 0.90,
        validatorFeedback: [
          {
            validator: 'reviewer',
            validatorType: 'reviewer',
            issues: [
              {
                type: 'quality',
                severity: 'high',
                message: 'Poor error handling in API routes',
              },
            ],
            recommendations: [],
            confidence: 0.75,
            timestamp: Date.now(),
          },
        ],
        failedCriteria: ['quality'],
        actionableSteps: [
          {
            priority: 'high',
            category: 'quality',
            action: 'Add comprehensive error handling',
            targetAgent: 'coder',
            estimatedEffort: 'high',
          },
        ],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const todo = manager.createLoop2RetryTodo(feedback, 2);
      const prompt = manager.generateContinuationPrompt(todo);

      expect(prompt).toContain('SELF-CORRECTING LOOP');
      expect(prompt).toContain('IMMEDIATE ACTION REQUIRED');
      expect(prompt).toContain('DO NOT WAIT FOR APPROVAL');
      expect(prompt).toContain('Round 2/10');
      expect(prompt).toContain('Add comprehensive error handling');
      expect(prompt).toContain('swarm_init');
    });

    it('should include executable swarm initialization instructions', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'auth-implementation',
        iteration: 1,
        consensusFailed: true,
        consensusScore: 0.65,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: [],
        actionableSteps: [
          {
            priority: 'critical',
            category: 'security',
            action: 'Fix JWT secret storage',
            targetAgent: 'security-specialist',
            estimatedEffort: 'low',
          },
        ],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const todo = manager.createLoop2RetryTodo(feedback, 1);
      const prompt = todo.continuationPrompt.instruction;

      expect(prompt).toContain('mcp__claude-flow-novice__swarm_init');
      expect(prompt).toContain('topology: "mesh"');
      expect(prompt).toContain('Task tool');
      expect(prompt).toContain('Execute the following steps NOW');
    });
  });

  describe('Loop 3 Retry Todo Creation', () => {
    it('should create consensus retry todo', () => {
      const consensusResult: ConsensusResult = {
        consensusScore: 0.85,
        consensusThreshold: 0.90,
        consensusPassed: false,
        validatorResults: [
          {
            validator: 'security-specialist',
            passed: false,
            issues: [{ message: 'Security concern found' }],
          },
        ],
        votingBreakdown: {
          approve: 3,
          reject: 1,
        },
        iteration: 2,
        timestamp: Date.now(),
      };

      const todo = manager.createLoop3RetryTodo(consensusResult, 2);

      expect(todo).toBeDefined();
      expect(todo.type).toBe('consensus_retry');
      expect(todo.status).toBe('pending');
      expect(todo.continuationPrompt.action).toBe('RETRY_CONSENSUS');
      expect(todo.continuationPrompt.context.targetAgents).toEqual(
        expect.arrayContaining(['reviewer', 'security-specialist', 'system-architect', 'tester'])
      );
    });

    it('should generate consensus retry prompt with voting breakdown', () => {
      const consensusResult: ConsensusResult = {
        consensusScore: 0.88,
        consensusThreshold: 0.90,
        consensusPassed: false,
        validatorResults: [],
        votingBreakdown: {
          approve: 7,
          reject: 1,
        },
        iteration: 3,
        timestamp: Date.now(),
      };

      const todo = manager.createLoop3RetryTodo(consensusResult, 3);
      const prompt = todo.continuationPrompt.instruction;

      expect(prompt).toContain('CONSENSUS VALIDATION RETRY');
      expect(prompt).toContain('approve: 7');
      expect(prompt).toContain('reject: 1');
      expect(prompt).toContain('Byzantine consensus voting');
      expect(prompt).toContain('≥90% agreement required');
    });
  });

  describe('Target Agent Extraction', () => {
    it('should extract target agents from actionable steps', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test',
        iteration: 1,
        consensusFailed: true,
        consensusScore: 0.75,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: [],
        actionableSteps: [
          {
            priority: 'critical',
            category: 'security',
            action: 'Fix',
            targetAgent: 'security-specialist',
            estimatedEffort: 'low',
          },
          {
            priority: 'high',
            category: 'performance',
            action: 'Optimize',
            targetAgent: 'perf-analyzer',
            estimatedEffort: 'medium',
          },
        ],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const todo = manager.createLoop2RetryTodo(feedback, 1);
      const targetAgents = todo.continuationPrompt.context.targetAgents;

      expect(targetAgents).toContain('security-specialist');
      expect(targetAgents).toContain('perf-analyzer');
      expect(targetAgents).toContain('tester'); // Always added
      expect(targetAgents).toContain('reviewer'); // Always added
    });

    it('should infer agents from issue types when not specified', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test',
        iteration: 1,
        consensusFailed: true,
        consensusScore: 0.70,
        requiredScore: 0.90,
        validatorFeedback: [
          {
            validator: 'test-validator',
            validatorType: 'reviewer',
            issues: [
              { type: 'security', severity: 'critical', message: 'Security issue' },
              { type: 'performance', severity: 'high', message: 'Performance issue' },
            ],
            recommendations: [],
            confidence: 0.8,
            timestamp: Date.now(),
          },
        ],
        failedCriteria: [],
        actionableSteps: [],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const todo = manager.createLoop2RetryTodo(feedback, 1);
      const targetAgents = todo.continuationPrompt.context.targetAgents;

      expect(targetAgents).toContain('security-specialist');
      expect(targetAgents).toContain('perf-analyzer');
    });
  });

  describe('Feedback Extraction for Specific Agents', () => {
    it('should extract security-specialist feedback', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test',
        iteration: 1,
        consensusFailed: true,
        consensusScore: 0.75,
        requiredScore: 0.90,
        validatorFeedback: [
          {
            validator: 'sec-validator',
            validatorType: 'security-specialist',
            issues: [
              {
                type: 'security',
                severity: 'critical',
                message: 'SQL injection vulnerability',
                suggestedFix: 'Use parameterized queries',
              },
            ],
            recommendations: ['Implement input validation'],
            confidence: 0.9,
            timestamp: Date.now(),
          },
        ],
        failedCriteria: [],
        actionableSteps: [
          {
            priority: 'critical',
            category: 'security',
            action: 'Fix SQL injection',
            targetAgent: 'security-specialist',
            estimatedEffort: 'high',
          },
        ],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const agentFeedback = manager.extractFeedbackForAgent(feedback, 'security-specialist');

      expect(agentFeedback).toContain('Feedback for security-specialist');
      expect(agentFeedback).toContain('SQL injection vulnerability');
      expect(agentFeedback).toContain('Fix SQL injection');
      expect(agentFeedback).toContain('Use parameterized queries');
    });

    it('should return generic message when no specific feedback', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test',
        iteration: 1,
        consensusFailed: true,
        consensusScore: 0.80,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: [],
        actionableSteps: [],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const agentFeedback = manager.extractFeedbackForAgent(feedback, 'coder');

      expect(agentFeedback).toContain('No specific feedback');
      expect(agentFeedback).toContain('general quality improvements');
    });
  });

  describe('Todo Cancellation', () => {
    it('should cancel todo on success', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test',
        iteration: 1,
        consensusFailed: true,
        consensusScore: 0.70,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: [],
        actionableSteps: [],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const todo = manager.createLoop2RetryTodo(feedback, 1);
      const todoId = todo.id;

      expect(manager.getActiveTodos()).toHaveLength(1);

      manager.cancelRetryTodo(todoId, 'consensus_passed');

      expect(manager.getActiveTodos()).toHaveLength(0);
      expect(manager.getTodoHistory()).toHaveLength(1);
      expect(manager.getTodoHistory()[0].status).toBe('cancelled');
      expect(manager.getTodoHistory()[0].cancelledReason).toBe('consensus_passed');
    });

    it('should cancel all todos on phase completion', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test',
        iteration: 1,
        consensusFailed: true,
        consensusScore: 0.70,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: [],
        actionableSteps: [],
        previousIterations: [],
        timestamp: Date.now(),
      };

      manager.createLoop2RetryTodo(feedback, 1);
      manager.createLoop2RetryTodo(feedback, 2);
      manager.createLoop2RetryTodo(feedback, 3);

      expect(manager.getActiveTodos()).toHaveLength(3);

      manager.cancelAllTodos('phase_completed');

      expect(manager.getActiveTodos()).toHaveLength(0);
      expect(manager.getTodoHistory()).toHaveLength(3);
    });
  });

  describe('Statistics', () => {
    it('should track todo statistics', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test',
        iteration: 1,
        consensusFailed: true,
        consensusScore: 0.70,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: [],
        actionableSteps: [],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const consensusResult: ConsensusResult = {
        consensusScore: 0.85,
        consensusThreshold: 0.90,
        consensusPassed: false,
        validatorResults: [],
        votingBreakdown: {},
        iteration: 1,
        timestamp: Date.now(),
      };

      manager.createLoop2RetryTodo(feedback, 1);
      manager.createLoop2RetryTodo(feedback, 2);
      manager.createLoop3RetryTodo(consensusResult, 1);

      const stats = manager.getStatistics();

      expect(stats.activeTodos).toBe(3);
      expect(stats.totalCreated).toBe(3);
      expect(stats.byType.loop2_retry).toBe(2);
      expect(stats.byType.consensus_retry).toBe(1);
    });
  });

  describe('Self-Looping Prompt Properties', () => {
    it('should always set urgency to IMMEDIATE', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test',
        iteration: 5,
        consensusFailed: true,
        consensusScore: 0.60,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: [],
        actionableSteps: [],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const todo = manager.createLoop2RetryTodo(feedback, 5);

      expect(todo.continuationPrompt.urgency).toBe('IMMEDIATE');
    });

    it('should always set selfLooping to true', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test',
        iteration: 1,
        consensusFailed: true,
        consensusScore: 0.75,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: [],
        actionableSteps: [],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const todo = manager.createLoop2RetryTodo(feedback, 1);

      expect(todo.continuationPrompt.selfLooping).toBe(true);
    });

    it('should include iteration context', () => {
      const feedback: ConsensusFeedback = {
        phaseId: 'auth-phase',
        iteration: 7,
        consensusFailed: true,
        consensusScore: 0.82,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: [],
        actionableSteps: [],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const todo = manager.createLoop2RetryTodo(feedback, 7);
      const prompt = todo.continuationPrompt.instruction;

      expect(prompt).toContain('Round 7/10');
      expect(prompt).toContain('iteration 7');
    });
  });

  describe('Event Emission', () => {
    it('should emit todo:created event', (done) => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test',
        iteration: 1,
        consensusFailed: true,
        consensusScore: 0.70,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: [],
        actionableSteps: [],
        previousIterations: [],
        timestamp: Date.now(),
      };

      manager.on('todo:created', (todo: RetryTodo) => {
        expect(todo.type).toBe('loop2_retry');
        done();
      });

      manager.createLoop2RetryTodo(feedback, 1);
    });

    it('should emit todo:cancelled event', (done) => {
      const feedback: ConsensusFeedback = {
        phaseId: 'test',
        iteration: 1,
        consensusFailed: true,
        consensusScore: 0.70,
        requiredScore: 0.90,
        validatorFeedback: [],
        failedCriteria: [],
        actionableSteps: [],
        previousIterations: [],
        timestamp: Date.now(),
      };

      const todo = manager.createLoop2RetryTodo(feedback, 1);

      manager.on('todo:cancelled', (data: { todoId: string; reason: string }) => {
        expect(data.todoId).toBe(todo.id);
        expect(data.reason).toBe('test_cancel');
        done();
      });

      manager.cancelRetryTodo(todo.id, 'test_cancel');
    });
  });
});
