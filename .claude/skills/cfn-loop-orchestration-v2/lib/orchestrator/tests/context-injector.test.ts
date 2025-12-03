/**
 * Context Injector Tests
 * Validates broadcast message construction, JSON formatting, and error handling
 *
 * Test Coverage:
 * - JSON formatting and structure validation
 * - Context completeness with required/optional fields
 * - Error handling for missing or invalid fields
 * - Message serialization and deserialization
 * - Multi-agent context building
 * - Iteration context construction
 */

import {
  buildBroadcastContext,
  buildBroadcastMessages,
  buildIterationContext,
  formatContextJson,
  parseBroadcastContext,
  mergeBroadcastContexts,
  BroadcastContext,
  SuccessCriteria,
  LoopPhase,
} from '../src/helpers/context-injector';

describe('Context Injector', () => {
  describe('buildBroadcastContext - Basic Functionality', () => {
    it('should build valid broadcast context with required fields only', () => {
      const result = buildBroadcastContext({
        taskId: 'task-12345',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
      });

      expect(result.context.taskId).toBe('task-12345');
      expect(result.context.iteration).toBe(1);
      expect(result.context.phase).toBe('loop3');
      expect(result.context.mode).toBe('standard');
      expect(result.context.contextVersion).toBe('3.0');
      expect(result.messageCount).toBe(1);
    });

    it('should include timestamp in ISO format', () => {
      const result = buildBroadcastContext({
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop2',
        mode: 'mvp',
      });

      const timestamp = new Date(result.context.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });

    it('should include all optional fields when provided', () => {
      const successCriteria: SuccessCriteria = {
        criteria: ['Feature implemented', 'Tests passing'],
        testPassRate: 0.95,
        consensusThreshold: 0.9,
      };

      const result = buildBroadcastContext({
        taskId: 'task-1',
        iteration: 2,
        phase: 'loop3',
        mode: 'enterprise',
        agentIds: ['agent-1', 'agent-2', 'agent-3'],
        successCriteria,
        taskDescription: 'Implement JWT authentication',
      });

      expect(result.context.agentIds).toEqual(['agent-1', 'agent-2', 'agent-3']);
      expect(result.context.successCriteria).toEqual(successCriteria);
      expect(result.context.taskDescription).toBe('Implement JWT authentication');
      expect(result.messageCount).toBe(3);
    });

    it('should support all valid loop phases', () => {
      const phases: LoopPhase[] = ['loop3', 'loop2', 'product-owner', 'iteration-prep'];

      for (const phase of phases) {
        const result = buildBroadcastContext({
          taskId: 'task-1',
          iteration: 1,
          phase,
          mode: 'standard',
        });

        expect(result.context.phase).toBe(phase);
      }
    });

    it('should support all execution modes', () => {
      const modes = ['mvp', 'standard', 'enterprise'] as const;

      for (const mode of modes) {
        const result = buildBroadcastContext({
          taskId: 'task-1',
          iteration: 1,
          phase: 'loop3',
          mode,
        });

        expect(result.context.mode).toBe(mode);
      }
    });
  });

  describe('JSON Formatting and Serialization', () => {
    it('should produce valid JSON output', () => {
      const result = buildBroadcastContext({
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
      });

      expect(() => JSON.parse(result.json)).not.toThrow();
      const parsed = JSON.parse(result.json);
      expect(parsed.taskId).toBe('task-1');
    });

    it('should format JSON with proper indentation', () => {
      const result = buildBroadcastContext({
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
      });

      const lines = result.json.split('\n');
      expect(lines.length).toBeGreaterThan(1);
      expect(result.json).toContain('  ');
    });

    it('should format compact JSON when requested', () => {
      const result = buildBroadcastContext({
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
      });

      const compact = formatContextJson(result.context, true);
      const formatted = formatContextJson(result.context, false);

      expect(compact.length).toBeLessThan(formatted.length);
      expect(compact).not.toContain('\n');
      expect(formatted).toContain('\n');
    });
  });

  describe('Error Handling - Missing Fields', () => {
    it('should throw error when taskId is missing', () => {
      expect(() =>
        buildBroadcastContext({
          taskId: '',
          iteration: 1,
          phase: 'loop3',
          mode: 'standard',
        })
      ).toThrow('taskId is required');
    });

    it('should throw error when iteration is not a positive number', () => {
      expect(() =>
        buildBroadcastContext({
          taskId: 'task-1',
          iteration: 0,
          phase: 'loop3',
          mode: 'standard',
        })
      ).toThrow('iteration must be a positive number');
    });

    it('should throw error when iteration is negative', () => {
      expect(() =>
        buildBroadcastContext({
          taskId: 'task-1',
          iteration: -1,
          phase: 'loop3',
          mode: 'standard',
        })
      ).toThrow('iteration must be a positive number');
    });

    it('should throw error when phase is missing', () => {
      expect(() =>
        buildBroadcastContext({
          taskId: 'task-1',
          iteration: 1,
          phase: '' as LoopPhase,
          mode: 'standard',
        })
      ).toThrow('phase is required');
    });

    it('should throw error for invalid phase value', () => {
      expect(() =>
        buildBroadcastContext({
          taskId: 'task-1',
          iteration: 1,
          phase: 'invalid-phase' as LoopPhase,
          mode: 'standard',
        })
      ).toThrow('Invalid phase');
    });

    it('should throw error when mode is missing', () => {
      expect(() =>
        buildBroadcastContext({
          taskId: 'task-1',
          iteration: 1,
          phase: 'loop3',
          mode: '' as any,
        })
      ).toThrow('mode is required');
    });
  });

  describe('Error Handling - Invalid Success Criteria', () => {
    it('should throw error for empty criteria array', () => {
      expect(() =>
        buildBroadcastContext({
          taskId: 'task-1',
          iteration: 1,
          phase: 'loop3',
          mode: 'standard',
          successCriteria: {
            criteria: [],
            testPassRate: 0.95,
            consensusThreshold: 0.9,
          },
        })
      ).toThrow('successCriteria.criteria must be a non-empty array');
    });

    it('should throw error for invalid testPassRate', () => {
      expect(() =>
        buildBroadcastContext({
          taskId: 'task-1',
          iteration: 1,
          phase: 'loop3',
          mode: 'standard',
          successCriteria: {
            criteria: ['Test'],
            testPassRate: 1.5,
            consensusThreshold: 0.9,
          },
        })
      ).toThrow('testPassRate must be a number between 0 and 1');
    });

    it('should throw error for invalid consensusThreshold', () => {
      expect(() =>
        buildBroadcastContext({
          taskId: 'task-1',
          iteration: 1,
          phase: 'loop3',
          mode: 'standard',
          successCriteria: {
            criteria: ['Test'],
            testPassRate: 0.95,
            consensusThreshold: -0.1,
          },
        })
      ).toThrow('consensusThreshold must be a number between 0 and 1');
    });
  });

  describe('parseBroadcastContext', () => {
    it('should parse valid broadcast context from JSON', () => {
      const original = buildBroadcastContext({
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
      });

      const parsed = parseBroadcastContext(original.json);

      expect(parsed.taskId).toBe('task-1');
      expect(parsed.iteration).toBe(1);
      expect(parsed.phase).toBe('loop3');
      expect(parsed.mode).toBe('standard');
    });

    it('should throw error for invalid JSON', () => {
      expect(() => parseBroadcastContext('not valid json')).toThrow('Invalid JSON');
    });

    it('should throw error when context is not an object', () => {
      expect(() => parseBroadcastContext('"string value"')).toThrow('must be a JSON object');
    });

    it('should throw error for missing required fields', () => {
      expect(() => parseBroadcastContext('{}')).toThrow('taskId must be');
    });

    it('should preserve optional fields during parsing', () => {
      const successCriteria: SuccessCriteria = {
        criteria: ['Test'],
        testPassRate: 0.95,
        consensusThreshold: 0.9,
      };

      const original = buildBroadcastContext({
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
        successCriteria,
        taskDescription: 'Test description',
      });

      const parsed = parseBroadcastContext(original.json);

      expect(parsed.successCriteria).toEqual(successCriteria);
      expect(parsed.taskDescription).toBe('Test description');
    });
  });

  describe('buildBroadcastMessages - Multi-Agent Context', () => {
    it('should build separate contexts for each agent', () => {
      const messages = buildBroadcastMessages(
        {
          taskId: 'task-1',
          iteration: 1,
          phase: 'loop3',
          mode: 'standard',
        },
        [
          { agentId: 'agent-1', agentType: 'backend-engineer' },
          { agentId: 'agent-2', agentType: 'frontend-engineer' },
          { agentId: 'agent-3', agentType: 'tester' },
        ]
      );

      expect(messages).toHaveLength(3);
      expect(messages[0].agentIds).toEqual(['agent-1']);
      expect(messages[1].agentIds).toEqual(['agent-2']);
      expect(messages[2].agentIds).toEqual(['agent-3']);
    });

    it('should throw error for empty agent contexts', () => {
      expect(() =>
        buildBroadcastMessages(
          {
            taskId: 'task-1',
            iteration: 1,
            phase: 'loop3',
            mode: 'standard',
          },
          []
        )
      ).toThrow('agentContexts must be a non-empty array');
    });

    it('should preserve success criteria in all messages', () => {
      const successCriteria: SuccessCriteria = {
        criteria: ['Test 1', 'Test 2'],
        testPassRate: 0.95,
        consensusThreshold: 0.9,
      };

      const messages = buildBroadcastMessages(
        {
          taskId: 'task-1',
          iteration: 1,
          phase: 'loop3',
          mode: 'standard',
          successCriteria,
        },
        [
          { agentId: 'agent-1', agentType: 'backend-engineer' },
          { agentId: 'agent-2', agentType: 'frontend-engineer' },
        ]
      );

      messages.forEach(msg => {
        expect(msg.successCriteria).toEqual(successCriteria);
      });
    });
  });

  describe('buildIterationContext', () => {
    it('should build iteration-prep context with feedback', () => {
      const feedback = { issues: 'Need more tests', priority: 'high' };

      const context = buildIterationContext('task-1', 2, 'standard', feedback);

      expect(context.taskId).toBe('task-1');
      expect(context.iteration).toBe(2);
      expect(context.phase).toBe('iteration-prep');
      expect(context.mode).toBe('standard');
      expect(context.taskDescription).toBeTruthy();
    });

    it('should build iteration context without feedback', () => {
      const context = buildIterationContext('task-1', 3, 'enterprise');

      expect(context.taskId).toBe('task-1');
      expect(context.iteration).toBe(3);
      expect(context.phase).toBe('iteration-prep');
    });
  });

  describe('mergeBroadcastContexts', () => {
    it('should merge multiple contexts and combine agent IDs', () => {
      const ctx1: BroadcastContext = {
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
        agentIds: ['agent-1', 'agent-2'],
        timestamp: new Date().toISOString(),
        contextVersion: '3.0',
      };

      const ctx2: BroadcastContext = {
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
        agentIds: ['agent-3'],
        timestamp: new Date().toISOString(),
        contextVersion: '3.0',
      };

      const merged = mergeBroadcastContexts([ctx1, ctx2]);

      expect(merged.agentIds).toEqual(['agent-1', 'agent-2', 'agent-3']);
      expect(merged.taskId).toBe('task-1');
      expect(merged.iteration).toBe(1);
    });

    it('should remove duplicate agent IDs during merge', () => {
      const ctx1: BroadcastContext = {
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
        agentIds: ['agent-1', 'agent-2'],
        timestamp: new Date().toISOString(),
        contextVersion: '3.0',
      };

      const ctx2: BroadcastContext = {
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
        agentIds: ['agent-2', 'agent-3'],
        timestamp: new Date().toISOString(),
        contextVersion: '3.0',
      };

      const merged = mergeBroadcastContexts([ctx1, ctx2]);

      expect(new Set(merged.agentIds).size).toBe(3);
      expect(merged.agentIds).toContain('agent-1');
      expect(merged.agentIds).toContain('agent-2');
      expect(merged.agentIds).toContain('agent-3');
    });

    it('should throw error if taskIds do not match during merge', () => {
      const ctx1: BroadcastContext = {
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
        timestamp: new Date().toISOString(),
        contextVersion: '3.0',
      };

      const ctx2: BroadcastContext = {
        taskId: 'task-2',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
        timestamp: new Date().toISOString(),
        contextVersion: '3.0',
      };

      expect(() => mergeBroadcastContexts([ctx1, ctx2])).toThrow('same taskId');
    });

    it('should throw error if iterations do not match during merge', () => {
      const ctx1: BroadcastContext = {
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
        timestamp: new Date().toISOString(),
        contextVersion: '3.0',
      };

      const ctx2: BroadcastContext = {
        taskId: 'task-1',
        iteration: 2,
        phase: 'loop3',
        mode: 'standard',
        timestamp: new Date().toISOString(),
        contextVersion: '3.0',
      };

      expect(() => mergeBroadcastContexts([ctx1, ctx2])).toThrow('same iteration');
    });

    it('should throw error for empty contexts array', () => {
      expect(() => mergeBroadcastContexts([])).toThrow('non-empty array');
    });
  });

  describe('Context Completeness - Integration', () => {
    it('should maintain context integrity through build-format-parse cycle', () => {
      const successCriteria: SuccessCriteria = {
        criteria: ['Feature implemented', 'Tests passing', 'Documentation complete'],
        testPassRate: 0.95,
        consensusThreshold: 0.9,
      };

      const original = buildBroadcastContext({
        taskId: 'task-abc-123',
        iteration: 2,
        phase: 'loop2',
        mode: 'enterprise',
        agentIds: ['validator-1', 'validator-2', 'validator-3'],
        successCriteria,
        taskDescription: 'Implement advanced security features',
      });

      const formatted = formatContextJson(original.context);
      const parsed = parseBroadcastContext(formatted);

      expect(parsed.taskId).toBe('task-abc-123');
      expect(parsed.iteration).toBe(2);
      expect(parsed.phase).toBe('loop2');
      expect(parsed.mode).toBe('enterprise');
      expect(parsed.agentIds).toHaveLength(3);
      expect(parsed.successCriteria).toEqual(successCriteria);
      expect(parsed.taskDescription).toBe('Implement advanced security features');
    });

    it('should include contextVersion in all output', () => {
      const result = buildBroadcastContext({
        taskId: 'task-1',
        iteration: 1,
        phase: 'loop3',
        mode: 'standard',
      });

      expect(result.context.contextVersion).toBe('3.0');

      const parsed = parseBroadcastContext(result.json);
      expect(parsed.contextVersion).toBe('3.0');
    });
  });
});
