/**
 * TDD Tests for Experience-Level Hook Adaptation - Checkpoint 1.3
 *
 * SUCCESS CRITERIA:
 * - Hook verbosity correctly adapts (novice: detailed, expert: minimal)
 * - User satisfaction >4.0/5
 * - Must pass 100% before implementation
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ExperienceAdaptationHooks } from '../../src/hooks/enhanced/experience-adaptation-hooks.js';

describe('Experience-Level Hook Adaptation - Checkpoint 1.3', () => {
  let adaptationHooks;
  let mockUserFeedback;

  beforeEach(() => {
    mockUserFeedback = {
      collectFeedback: jest.fn(),
      getAverageSatisfaction: jest.fn().mockReturnValue(4.2)
    };

    adaptationHooks = new ExperienceAdaptationHooks();
    jest.clearAllMocks();
  });

  describe('Novice User Adaptation', () => {
    test('should provide detailed hooks for novice users', async () => {
      const user = { experienceLevel: 'novice', userId: 'novice-123' };

      const hooks = await adaptationHooks.adaptHooksForUser(user);

      expect(hooks.verbosity).toBe('detailed');
      expect(hooks.showSteps).toBe(true);
      expect(hooks.provideTips).toBe(true);
      expect(hooks.explainCommands).toBe(true);
      expect(hooks.showExamples).toBe(true);
      expect(hooks.confirmActions).toBe(true);
    });

    test('should include educational content for novices', async () => {
      const user = { experienceLevel: 'novice' };

      const preTaskHook = await adaptationHooks.executePreTaskHook({
        task: 'implement authentication',
        user
      });

      expect(preTaskHook.content).toContain('explanation');
      expect(preTaskHook.content).toContain('steps');
      expect(preTaskHook.examples).toBeDefined();
      expect(preTaskHook.tips).toBeDefined();
      expect(preTaskHook.warnings).toBeDefined();
    });

    test('should provide step-by-step guidance for novices', async () => {
      const user = { experienceLevel: 'novice' };

      const guidance = await adaptationHooks.getTaskGuidance({
        task: 'write unit tests',
        user
      });

      expect(guidance.steps).toHaveLength(4);
      expect(guidance.steps.length).toBeGreaterThan(3);
      expect(guidance.steps[0]).toMatchObject({
        step: expect.any(Number),
        description: expect.any(String),
        example: expect.any(String),
        tips: expect.any(Array)
      });
    });

    test('should include safety confirmations for risky operations', async () => {
      const user = { experienceLevel: 'novice' };

      const confirmation = await adaptationHooks.shouldConfirmAction({
        action: 'delete file',
        user,
        context: { file: 'important-data.json' }
      });

      expect(confirmation.required).toBe(true);
      expect(confirmation.message).toContain('WARNING');
      expect(confirmation.severity).toBe('high');
    });
  });

  describe('Expert User Adaptation', () => {
    test('should provide minimal hooks for expert users', async () => {
      const user = { experienceLevel: 'expert', userId: 'expert-456' };

      const hooks = await adaptationHooks.adaptHooksForUser(user);

      expect(hooks.verbosity).toBe('minimal');
      expect(hooks.showSteps).toBe(false);
      expect(hooks.provideTips).toBe(false);
      expect(hooks.explainCommands).toBe(false);
      expect(hooks.showExamples).toBe(false);
      expect(hooks.confirmActions).toBe(false);
    });

    test('should provide concise output for experts', async () => {
      const user = { experienceLevel: 'expert' };

      const preTaskHook = await adaptationHooks.executePreTaskHook({
        task: 'implement authentication',
        user
      });

      expect(preTaskHook.content.length).toBeLessThan(200);
      expect(preTaskHook.examples).toBeUndefined();
      expect(preTaskHook.tips).toBeUndefined();
      expect(preTaskHook.format).toBe('summary');
    });

    test('should skip confirmations for routine operations', async () => {
      const user = { experienceLevel: 'expert' };

      const confirmation = await adaptationHooks.shouldConfirmAction({
        action: 'create file',
        user,
        context: { file: 'component.js' }
      });

      expect(confirmation.required).toBe(false);
    });

    test('should still confirm high-risk operations for experts', async () => {
      const user = { experienceLevel: 'expert' };

      const confirmation = await adaptationHooks.shouldConfirmAction({
        action: 'rm -rf',
        user,
        context: { path: '/' }
      });

      expect(confirmation.required).toBe(true);
      expect(confirmation.severity).toBe('critical');
    });
  });

  describe('Intermediate User Adaptation', () => {
    test('should provide balanced hooks for intermediate users', async () => {
      const user = { experienceLevel: 'intermediate', userId: 'inter-789' };

      const hooks = await adaptationHooks.adaptHooksForUser(user);

      expect(hooks.verbosity).toBe('balanced');
      expect(hooks.showSteps).toBe(false);
      expect(hooks.provideTips).toBe(true);
      expect(hooks.explainCommands).toBe(false);
      expect(hooks.showExamples).toBe(false);
      expect(hooks.confirmActions).toBe(true); // For safety
    });

    test('should provide contextual tips without full explanations', async () => {
      const user = { experienceLevel: 'intermediate' };

      const preTaskHook = await adaptationHooks.executePreTaskHook({
        task: 'optimize database queries',
        user
      });

      expect(preTaskHook.tips).toBeDefined();
      expect(preTaskHook.content.length).toBeLessThan(500);
      expect(preTaskHook.content.length).toBeGreaterThan(100);
      expect(preTaskHook.examples).toBeUndefined();
    });
  });

  describe('Dynamic Adaptation', () => {
    test('should adapt based on user performance over time', async () => {
      const user = {
        experienceLevel: 'novice',
        userId: 'evolving-user',
        performanceHistory: [
          { task: 'write test', success: true, timeToComplete: 300 },
          { task: 'implement feature', success: true, timeToComplete: 450 },
          { task: 'debug issue', success: true, timeToComplete: 200 }
        ]
      };

      const adaptedLevel = await adaptationHooks.calculateDynamicLevel(user);

      expect(adaptedLevel).toBe('intermediate');
    });

    test('should increase support level after repeated failures', async () => {
      const user = {
        experienceLevel: 'intermediate',
        userId: 'struggling-user',
        performanceHistory: [
          { task: 'write test', success: false, attempts: 3 },
          { task: 'implement feature', success: false, attempts: 2 },
          { task: 'debug issue', success: false, attempts: 4 }
        ]
      };

      const adaptedLevel = await adaptationHooks.calculateDynamicLevel(user);

      expect(adaptedLevel).toBe('novice');
    });
  });

  describe('User Satisfaction Tracking', () => {
    test('should track user satisfaction with hook adaptation', async () => {
      const user = { experienceLevel: 'novice', userId: 'satisfaction-test' };

      await adaptationHooks.recordSatisfactionFeedback({
        user,
        hookType: 'pre-task',
        rating: 5,
        feedback: 'Very helpful step-by-step guidance'
      });

      const satisfaction = await adaptationHooks.getUserSatisfaction(user.userId);

      expect(satisfaction.averageRating).toBeGreaterThanOrEqual(4.0);
      expect(satisfaction.totalFeedback).toBeGreaterThan(0);
    });

    test('should achieve >4.0/5 user satisfaction overall', async () => {
      // Simulate multiple user feedback scenarios
      const users = [
        { id: 'user1', level: 'novice', satisfaction: [4, 5, 4, 5] },
        { id: 'user2', level: 'intermediate', satisfaction: [4, 4, 5, 4] },
        { id: 'user3', level: 'expert', satisfaction: [5, 4, 5, 5] }
      ];

      for (const user of users) {
        for (const rating of user.satisfaction) {
          await adaptationHooks.recordSatisfactionFeedback({
            user: { userId: user.id, experienceLevel: user.level },
            hookType: 'general',
            rating
          });
        }
      }

      const overallSatisfaction = await adaptationHooks.getOverallSatisfaction();

      expect(overallSatisfaction).toBeGreaterThan(4.0);
    });

    test('should identify and improve low-satisfaction patterns', async () => {
      const lowSatisfactionFeedback = [
        { user: { userId: 'user1', experienceLevel: 'expert' }, hookType: 'pre-task', rating: 2, feedback: 'Too verbose' },
        { user: { userId: 'user2', experienceLevel: 'novice' }, hookType: 'post-edit', rating: 2, feedback: 'Not enough explanation' }
      ];

      for (const feedback of lowSatisfactionFeedback) {
        await adaptationHooks.recordSatisfactionFeedback(feedback);
      }

      const improvements = await adaptationHooks.identifyImprovementAreas();

      expect(improvements).toContainEqual(expect.objectContaining({
        area: 'verbosity-mismatch',
        priority: 'high'
      }));
    });
  });

  describe('Adaptive Learning', () => {
    test('should learn from user corrections and preferences', async () => {
      const user = { experienceLevel: 'intermediate', userId: 'learning-user' };

      // User corrects a hook suggestion
      await adaptationHooks.recordUserCorrection({
        user,
        originalSuggestion: { verbosity: 'balanced', showTips: true },
        userPreference: { verbosity: 'minimal', showTips: false }
      });

      // Next time, should adapt based on learned preference
      const adaptedHooks = await adaptationHooks.adaptHooksForUser(user);

      expect(adaptedHooks.verbosity).toBe('minimal');
      expect(adaptedHooks.showTips).toBe(false);
    });

    test('should adapt to user context and project type', async () => {
      const user = { experienceLevel: 'intermediate', userId: 'context-user' };
      const context = {
        projectType: 'machine-learning',
        complexity: 'high',
        teamSize: 'large'
      };

      const contextualHooks = await adaptationHooks.adaptHooksForContext(user, context);

      expect(contextualHooks.mlSpecific).toBe(true);
      expect(contextualHooks.collaborationTips).toBe(true);
      expect(contextualHooks.complexityWarnings).toBe(true);
    });
  });

  describe('Performance and Reliability', () => {
    test('should maintain adaptation performance under load', async () => {
      const users = Array(50).fill(null).map((_, i) => ({
        experienceLevel: ['novice', 'intermediate', 'expert'][i % 3],
        userId: `load-test-${i}`
      }));

      const startTime = performance.now();

      const adaptationPromises = users.map(user =>
        adaptationHooks.adaptHooksForUser(user)
      );

      await Promise.all(adaptationPromises);

      const totalTime = performance.now() - startTime;
      const avgTime = totalTime / users.length;

      expect(avgTime).toBeLessThan(10); // <10ms per adaptation
    });

    test('should handle invalid experience levels gracefully', async () => {
      const invalidUser = { experienceLevel: 'invalid', userId: 'invalid-user' };

      const hooks = await adaptationHooks.adaptHooksForUser(invalidUser);

      // Should default to intermediate
      expect(hooks.verbosity).toBe('balanced');
      expect(hooks.experienceLevel).toBe('intermediate');
    });
  });
});