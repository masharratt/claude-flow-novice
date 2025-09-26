/**
 * Test Suite for Agent Validation System
 * Validates that invalid agent types are properly handled and fallbacks work
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { agentValidator, validateAgentType } from '../../src/agents/agent-validator.js';
import { taskAgentIntegration, prepareAgentSpawn } from '../../src/agents/task-agent-integration.js';
import type { TaskAgentSpawnRequest } from '../../src/agents/task-agent-integration.js';

describe('Agent Validation System', () => {
  beforeEach(() => {
    // Clear cache before each test
    agentValidator.clearCache();
  });

  describe('AgentValidator', () => {
    it('should validate known agent types', async () => {
      const result = await validateAgentType('researcher');

      expect(result.isValid).toBe(true);
      expect(result.resolvedType).toBe('researcher');
      expect(result.fallbackUsed).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle analyst -> code-analyzer mapping', async () => {
      const result = await validateAgentType('analyst');

      expect(result.isValid).toBe(true);
      expect(result.resolvedType).toBe('code-analyzer');
      expect(result.fallbackUsed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('analyst');
    });

    it('should handle consensus-builder correctly', async () => {
      const result = await validateAgentType('consensus-builder');

      expect(result.isValid).toBe(true);
      expect(result.resolvedType).toBe('consensus-builder');
      expect(result.fallbackUsed).toBe(false);
    });

    it('should provide fallback for unknown agent types', async () => {
      const result = await validateAgentType('nonexistent-agent');

      expect(result.isValid).toBe(true);
      expect(result.resolvedType).toBe('researcher'); // default fallback
      expect(result.fallbackUsed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle legacy mappings correctly', async () => {
      const testCases = [
        { input: 'coordinator', expected: 'task-orchestrator' },
        { input: 'optimizer', expected: 'perf-analyzer' },
        { input: 'monitor', expected: 'performance-benchmarker' },
        { input: 'documenter', expected: 'api-docs' },
        { input: 'specialist', expected: 'system-architect' },
        { input: 'architect', expected: 'system-architect' }
      ];

      for (const testCase of testCases) {
        const result = await validateAgentType(testCase.input);

        expect(result.isValid).toBe(true);
        expect(result.resolvedType).toBe(testCase.expected);
        expect(result.fallbackUsed).toBe(true);
      }
    });

    it('should handle capability-based matching', async () => {
      // This assumes the agent loader can find agents with matching capabilities
      const result = await validateAgentType('unknown-analysis-agent');

      expect(result.isValid).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      // Should find code-analyzer or similar based on 'analysis' keyword
    });

    it('should cache validation results', async () => {
      const start = Date.now();
      await validateAgentType('analyst');
      const firstCallTime = Date.now() - start;

      const start2 = Date.now();
      await validateAgentType('analyst');
      const secondCallTime = Date.now() - start2;

      // Second call should be significantly faster due to caching
      expect(secondCallTime).toBeLessThan(firstCallTime);
    });
  });

  describe('TaskAgentIntegration', () => {
    it('should prepare valid agent spawn requests', async () => {
      const request: TaskAgentSpawnRequest = {
        type: 'researcher',
        description: 'Research task',
        prompt: 'Research the codebase and provide analysis'
      };

      const result = await prepareAgentSpawn(request);

      expect(result.success).toBe(true);
      expect(result.finalType).toBe('researcher');
      expect(result.spawnCommand).toContain('researcher');
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle invalid agent types with fallbacks', async () => {
      const request: TaskAgentSpawnRequest = {
        type: 'analyst',
        description: 'Code analysis task',
        prompt: 'Analyze the code quality'
      };

      const result = await prepareAgentSpawn(request);

      expect(result.success).toBe(true);
      expect(result.finalType).toBe('code-analyzer');
      expect(result.spawnCommand).toContain('code-analyzer');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should enhance prompts with validation context', async () => {
      const request: TaskAgentSpawnRequest = {
        type: 'consensus-builder',
        description: 'Build consensus',
        prompt: 'Create consensus mechanisms'
      };

      const result = await prepareAgentSpawn(request);

      expect(result.spawnCommand).toContain('consensus-builder');
      expect(result.spawnCommand).toContain('coordination');
    });

    it('should handle batch agent spawn requests', async () => {
      const requests: TaskAgentSpawnRequest[] = [
        {
          type: 'researcher',
          description: 'Research task',
          prompt: 'Research the codebase'
        },
        {
          type: 'analyst',
          description: 'Analysis task',
          prompt: 'Analyze the code'
        },
        {
          type: 'nonexistent',
          description: 'Unknown task',
          prompt: 'Do something unknown'
        }
      ];

      const results = await taskAgentIntegration.prepareBatchAgentSpawn(requests);

      expect(results).toHaveLength(3);
      expect(results[0].finalType).toBe('researcher');
      expect(results[1].finalType).toBe('code-analyzer');
      expect(results[2].finalType).toBe('researcher'); // fallback
    });

    it('should suggest appropriate agent types', async () => {
      const suggestions = await taskAgentIntegration.suggestAgentTypes('code analysis and review');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('code-analyzer');
    });

    it('should provide comprehensive agent information', async () => {
      const info = await taskAgentIntegration.getAgentInfo();

      expect(info.available.length).toBeGreaterThan(0);
      expect(info.categories).toBeDefined();
      expect(info.legacy).toBeDefined();
      expect(info.suggestions).toBeDefined();

      // Check that legacy mappings are included
      expect(info.legacy['analyst']).toBe('code-analyzer');
      expect(info.legacy['consensus-builder']).toBe('consensus-builder');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty agent type', async () => {
      const result = await validateAgentType('');

      expect(result.isValid).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.resolvedType).toBe('researcher');
    });

    it('should handle null/undefined agent types gracefully', async () => {
      const result1 = await validateAgentType(null as any);
      const result2 = await validateAgentType(undefined as any);

      expect(result1.isValid).toBe(true);
      expect(result2.isValid).toBe(true);
      expect(result1.resolvedType).toBe('researcher');
      expect(result2.resolvedType).toBe('researcher');
    });

    it('should handle case-insensitive agent types', async () => {
      const result1 = await validateAgentType('RESEARCHER');
      const result2 = await validateAgentType('Analyst');
      const result3 = await validateAgentType('consensus-BUILDER');

      expect(result1.isValid).toBe(true);
      expect(result2.isValid).toBe(true);
      expect(result3.isValid).toBe(true);
    });

    it('should handle agent types with special characters', async () => {
      const result = await validateAgentType('code-analyzer-v2.0');

      expect(result.isValid).toBe(true);
      expect(result.fallbackUsed).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    it('should validate multiple agent types efficiently', async () => {
      const agentTypes = [
        'researcher', 'coder', 'reviewer', 'tester', 'analyst',
        'consensus-builder', 'coordinator', 'optimizer', 'monitor',
        'nonexistent1', 'nonexistent2', 'nonexistent3'
      ];

      const start = Date.now();
      const results = await agentValidator.validateAgentTypes(agentTypes);
      const duration = Date.now() - start;

      expect(results.size).toBe(agentTypes.length);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all results are valid
      for (const [type, result] of results) {
        expect(result.isValid).toBe(true);
      }
    });

    it('should not degrade with repeated validations', async () => {
      const iterations = 100;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await validateAgentType('analyst');
        durations.push(Date.now() - start);
      }

      // Performance should not degrade significantly
      const firstHalf = durations.slice(0, 50);
      const secondHalf = durations.slice(50);

      const avgFirst = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b) / secondHalf.length;

      // Second half should be faster or comparable due to caching
      expect(avgSecond).toBeLessThanOrEqual(avgFirst * 2);
    });
  });
});

describe('Integration with Claude Code Task Tool', () => {
  it('should provide hook function for Claude Code', async () => {
    const { claudeCodeTaskHook } = await import('../../src/agents/task-agent-integration.js');

    const result = await claudeCodeTaskHook(
      'analyst',
      'Code analysis task',
      'Analyze the codebase for issues'
    );

    expect(result.validatedType).toBe('code-analyzer');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.enhancedPrompt).toContain('Analyze the codebase');
  });

  it('should work with consensus-builder agent', async () => {
    const { claudeCodeTaskHook } = await import('../../src/agents/task-agent-integration.js');

    const result = await claudeCodeTaskHook(
      'consensus-builder',
      'Build consensus mechanisms',
      'Create distributed consensus protocols'
    );

    expect(result.validatedType).toBe('consensus-builder');
    expect(result.warnings).toHaveLength(0);
  });

  it('should provide appropriate fallbacks for unknown agents', async () => {
    const { claudeCodeTaskHook } = await import('../../src/agents/task-agent-integration.js');

    const result = await claudeCodeTaskHook(
      'mystery-agent',
      'Unknown task',
      'Do something mysterious'
    );

    expect(result.validatedType).toBe('researcher');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('mystery-agent');
  });
});