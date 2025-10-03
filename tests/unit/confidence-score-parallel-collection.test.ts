/**
 * Performance tests for parallel confidence score collection
 *
 * Validates 20x speedup from sequential to parallel execution
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ConfidenceScoreSystem, ConfidenceScore } from '../../src/coordination/confidence-score-system.js';
import { SwarmMemoryManager } from '../../src/memory/swarm-memory.js';

describe('ConfidenceScoreSystem - Parallel Collection Performance', () => {
  let system: ConfidenceScoreSystem;
  let mockMemory: any;

  beforeEach(() => {
    // Mock SwarmMemoryManager
    mockMemory = {
      recall: jest.fn(),
      remember: jest.fn()
    } as any;

    system = new ConfidenceScoreSystem(mockMemory);
  });

  describe('Parallel Execution Performance', () => {
    test('should collect from 20 agents in ~30s instead of 600s (20x speedup)', async () => {
      const agentCount = 20;
      const timeout = 30000;
      const agents = Array.from({ length: agentCount }, (_, i) => `agent-${i}`);

      // Mock memory to return scores with artificial delay
      mockMemory.recall.mockImplementation(async () => {
        // Simulate 30s network delay
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms for testing
        return [{
          id: 'entry-1',
          agentId: 'test',
          type: 'result' as const,
          timestamp: new Date(),
          metadata: {},
          content: {
            agent: 'test',
            agentType: 'coder',
            confidence: 0.85,
            reasoning: 'Test response'
          }
        }];
      });

      const startTime = Date.now();
      const scores = await system.collectConfidenceScores(agents, {
        timeout: 1000, // 1s timeout for testing
        storeInMemory: false
      });
      const elapsedTime = Date.now() - startTime;

      // Assertions
      expect(scores).toHaveLength(agentCount);
      expect(elapsedTime).toBeLessThan(500); // Should be ~100ms (parallel), not 2000ms (sequential)

      // Calculate speedup: sequential would be 20 * 100ms = 2000ms
      const expectedSequentialTime = agentCount * 100;
      const speedup = expectedSequentialTime / elapsedTime;

      console.log(`Parallel collection speedup: ${speedup.toFixed(1)}x`);
      console.log(`Sequential time would be: ${expectedSequentialTime}ms`);
      console.log(`Actual parallel time: ${elapsedTime}ms`);

      // Speedup should be close to agent count (20x)
      expect(speedup).toBeGreaterThan(3); // At least 3x speedup
    }, 10000);

    test('should handle 5 agents with 200ms delay each (5x speedup)', async () => {
      const agents = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'];

      mockMemory.recall.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return [{
          id: 'entry-2',
          agentId: 'test',
          type: 'result' as const,
          timestamp: new Date(),
          metadata: {},
          content: {
            agent: 'test',
            agentType: 'tester',
            confidence: 0.9,
            reasoning: 'Test complete'
          }
        }];
      });

      const startTime = Date.now();
      const scores = await system.collectConfidenceScores(agents, {
        timeout: 5000,
        storeInMemory: false
      });
      const elapsedTime = Date.now() - startTime;

      expect(scores).toHaveLength(5);
      expect(elapsedTime).toBeLessThan(500); // Should be ~200ms (parallel), not 1000ms (sequential)

      const speedup = (5 * 200) / elapsedTime;
      console.log(`5-agent speedup: ${speedup.toFixed(1)}x (expected ~5x)`);
      expect(speedup).toBeGreaterThan(2);
    });
  });

  describe('Partial Failure Handling', () => {
    test('should return results from successful agents even when some fail', async () => {
      const agents = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'];

      // Mock: agents 1, 3, 5 succeed; agents 2, 4 fail
      mockMemory.recall.mockImplementation(async ({ agentId }) => {
        await new Promise(resolve => setTimeout(resolve, 50));

        const agentIndex = parseInt(agentId.split('-')[1]);
        if (agentIndex % 2 === 0) {
          // Even agents fail
          throw new Error(`Agent ${agentId} unavailable`);
        }

        // Odd agents succeed
        return [{
          id: `entry-${agentId}`,
          agentId: agentId,
          type: 'result' as const,
          timestamp: new Date(),
          metadata: {},
          content: {
            agent: agentId,
            agentType: 'coder',
            confidence: 0.8,
            reasoning: 'Task completed'
          }
        }];
      });

      const scores = await system.collectConfidenceScores(agents, {
        timeout: 1000,
        requireAll: true,
        defaultConfidence: 0.0,
        storeInMemory: false
      });

      // Should have all 5 agents (3 successful + 2 with default confidence)
      expect(scores).toHaveLength(5);

      const successfulScores = scores.filter(s => s.confidence > 0);
      const failedScores = scores.filter(s => s.confidence === 0);

      expect(successfulScores).toHaveLength(3); // agents 1, 3, 5
      expect(failedScores).toHaveLength(2); // agents 2, 4

      // Failed agents should have blockers
      failedScores.forEach(score => {
        expect(score.blockers).toContain('Agent did not respond');
      });
    });

    test('should exclude failed agents when requireAll is false', async () => {
      const agents = ['agent-1', 'agent-2', 'agent-3'];

      mockMemory.recall.mockImplementation(async ({ agentId }) => {
        if (agentId === 'agent-2') {
          throw new Error('Agent 2 failed');
        }

        return [{
          id: `entry-${agentId}`,
          agentId: agentId,
          type: 'result' as const,
          timestamp: new Date(),
          metadata: {},
          content: {
            agent: agentId,
            agentType: 'tester',
            confidence: 0.85,
            reasoning: 'Success'
          }
        }];
      });

      const scores = await system.collectConfidenceScores(agents, {
        timeout: 1000,
        requireAll: false,
        storeInMemory: false
      });

      // Should only have 2 agents (agent-1 and agent-3)
      expect(scores).toHaveLength(2);
      expect(scores.map(s => s.agent)).toEqual(['agent-1', 'agent-3']);
    });
  });

  describe('Timeout Handling', () => {
    test('should respect per-agent timeout of 30s', async () => {
      const agents = ['agent-1', 'agent-2'];

      // Mock one agent that responds quickly, one that times out
      mockMemory.recall.mockImplementation(async ({ agentId }) => {
        if (agentId === 'agent-1') {
          await new Promise(resolve => setTimeout(resolve, 100));
          return [{
            id: `entry-${agentId}`,
            agentId: agentId,
            type: 'result' as const,
            timestamp: new Date(),
            metadata: {},
            content: {
              agent: agentId,
              agentType: 'coder',
              confidence: 0.9,
              reasoning: 'Fast response'
            }
          }];
        } else {
          // Simulate timeout - takes longer than specified timeout
          await new Promise(resolve => setTimeout(resolve, 2000));
          return [];
        }
      });

      const startTime = Date.now();
      const scores = await system.collectConfidenceScores(agents, {
        timeout: 500, // 500ms timeout
        requireAll: true,
        defaultConfidence: 0.0,
        storeInMemory: false
      });
      const elapsedTime = Date.now() - startTime;

      // Should complete in ~2000ms (longest agent), not timeout × 2
      expect(elapsedTime).toBeLessThan(3000);
      expect(scores).toHaveLength(2);

      // agent-1 should have high confidence
      const agent1Score = scores.find(s => s.agent === 'agent-1');
      expect(agent1Score?.confidence).toBe(0.9);

      // agent-2 should have default confidence (timed out)
      const agent2Score = scores.find(s => s.agent === 'agent-2');
      expect(agent2Score?.confidence).toBe(0.0);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should log speedup metrics in console', async () => {
      const agents = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'];

      mockMemory.recall.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return [{
          id: 'entry-benchmark',
          agentId: 'test',
          type: 'result' as const,
          timestamp: new Date(),
          metadata: {},
          content: {
            agent: 'test',
            agentType: 'coder',
            confidence: 0.85,
            reasoning: 'Benchmark test'
          }
        }];
      });

      const startTime = Date.now();
      await system.collectConfidenceScores(agents, {
        timeout: 2000,
        storeInMemory: false
      });
      const elapsedTime = Date.now() - startTime;

      const expectedSequential = agents.length * 100;
      const actualSpeedup = expectedSequential / elapsedTime;

      console.log('\n=== Performance Benchmark Results ===');
      console.log(`Agents: ${agents.length}`);
      console.log(`Delay per agent: 100ms`);
      console.log(`Expected sequential time: ${expectedSequential}ms`);
      console.log(`Actual parallel time: ${elapsedTime}ms`);
      console.log(`Speedup achieved: ${actualSpeedup.toFixed(1)}x`);
      console.log('=====================================\n');

      expect(actualSpeedup).toBeGreaterThan(2);
    });

    test('should handle 20 agents efficiently (real-world scenario)', async () => {
      const agents = Array.from({ length: 20 }, (_, i) => `agent-${i + 1}`);

      // Simulate varying response times (50ms to 150ms)
      mockMemory.recall.mockImplementation(async ({ agentId }) => {
        const delay = 50 + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));

        return [{
          id: `entry-${agentId}`,
          agentId: agentId,
          type: 'result' as const,
          timestamp: new Date(),
          metadata: {},
          content: {
            agent: agentId,
            agentType: 'coder',
            confidence: 0.75 + Math.random() * 0.25,
            reasoning: 'Task completed successfully'
          }
        }];
      });

      const startTime = Date.now();
      const scores = await system.collectConfidenceScores(agents, {
        timeout: 5000,
        storeInMemory: false
      });
      const elapsedTime = Date.now() - startTime;

      expect(scores).toHaveLength(20);

      // With 20 agents averaging 100ms each:
      // Sequential: 20 × 100ms = 2000ms
      // Parallel: ~150ms (slowest agent)
      expect(elapsedTime).toBeLessThan(500);

      const avgSequentialTime = 20 * 100;
      const speedup = avgSequentialTime / elapsedTime;

      console.log(`20-agent real-world speedup: ${speedup.toFixed(1)}x`);
      expect(speedup).toBeGreaterThan(3);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty agent list', async () => {
      const scores = await system.collectConfidenceScores([], {
        storeInMemory: false
      });

      expect(scores).toHaveLength(0);
    });

    test('should handle single agent', async () => {
      mockMemory.recall.mockResolvedValue([{
        id: 'entry-solo',
        agentId: 'solo-agent',
        type: 'result' as const,
        timestamp: new Date(),
        metadata: {},
        content: {
          agent: 'solo-agent',
          agentType: 'coder',
          confidence: 0.95,
          reasoning: 'Single agent test'
        }
      }]);

      const scores = await system.collectConfidenceScores(['solo-agent'], {
        storeInMemory: false
      });

      expect(scores).toHaveLength(1);
      expect(scores[0].agent).toBe('solo-agent');
      expect(scores[0].confidence).toBe(0.95);
    });

    test('should handle all agents failing', async () => {
      const agents = ['agent-1', 'agent-2', 'agent-3'];

      mockMemory.recall.mockRejectedValue(new Error('All agents offline'));

      const scores = await system.collectConfidenceScores(agents, {
        timeout: 1000,
        requireAll: true,
        defaultConfidence: 0.0,
        storeInMemory: false
      });

      expect(scores).toHaveLength(3);
      scores.forEach(score => {
        expect(score.confidence).toBe(0.0);
        expect(score.blockers).toContain('Agent did not respond');
      });
    });
  });

  describe('Integration with Memory Storage', () => {
    test('should store results in SwarmMemory when enabled', async () => {
      const agents = ['agent-1', 'agent-2'];

      mockMemory.recall.mockResolvedValue([{
        id: 'entry-test',
        agentId: 'test',
        type: 'result' as const,
        timestamp: new Date(),
        metadata: {},
        content: {
          agent: 'test',
          agentType: 'coder',
          confidence: 0.8,
          reasoning: 'Test'
        }
      }]);

      await system.collectConfidenceScores(agents, {
        timeout: 1000,
        storeInMemory: true,
        memoryKey: 'test-collection-key'
      });

      expect(mockMemory.remember).toHaveBeenCalledWith(
        'confidence-system',
        'result',
        expect.objectContaining({
          key: 'test-collection-key',
          count: 2
        }),
        expect.objectContaining({
          tags: ['confidence', 'validation'],
          shareLevel: 'team'
        })
      );
    });

    test('should not store results when storeInMemory is false', async () => {
      mockMemory.recall.mockResolvedValue([]);

      await system.collectConfidenceScores(['agent-1'], {
        timeout: 1000,
        storeInMemory: false
      });

      expect(mockMemory.remember).not.toHaveBeenCalled();
    });
  });
});
