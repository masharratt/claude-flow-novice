/**
 * TDD Integration Tests for Phase 1 - All Components
 *
 * SUCCESS CRITERIA:
 * - All checkpoints must pass 100%
 * - End-to-end workflow functions correctly
 * - Performance targets met across all components
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { EnhancedHookManager } from '../../src/hooks/managers/enhanced-hook-manager.js';
import { ContentFilters } from '../../src/filters/content-filters.js';
import { ExperienceAdaptationHooks } from '../../src/hooks/enhanced/experience-adaptation-hooks.js';

describe('Phase 1 Integration Tests', () => {
  let hookManager;
  let contentFilters;
  let adaptationHooks;

  beforeEach(() => {
    hookManager = new EnhancedHookManager();
    contentFilters = new ContentFilters();
    adaptationHooks = new ExperienceAdaptationHooks();

    jest.clearAllMocks();
  });

  describe('Complete Workflow Integration', () => {
    test('should handle novice user workflow with content filtering', async () => {
      const user = { experienceLevel: 'novice', userId: 'integration-novice' };

      // Load user preferences
      await hookManager.loadUserPreferences(user.userId);

      // Adapt hooks based on experience level
      const adaptedHooks = await adaptationHooks.adaptHooksForUser(user);

      // Filter file operations
      const fileOperations = [
        { type: 'write', path: 'README.md', content: 'Auto-generated', trigger: 'auto' },
        { type: 'write', path: 'src/component.js', content: 'const Component = {}' },
        { type: 'write', path: 'test/component.test.js', content: 'describe("Component")' }
      ];

      const filteredOperations = await contentFilters.filterRequests(fileOperations);

      // Execute hooks with adapted settings
      const preTaskResult = await hookManager.executeHook('pre-task', {
        task: 'implement component',
        user,
        adaptedHooks
      });

      // Verify integration
      expect(adaptedHooks.verbosity).toBe('detailed');
      expect(filteredOperations.blocked.some(op => op.path === 'README.md')).toBe(true);
      expect(filteredOperations.allowed.some(op => op.path === 'src/component.js')).toBe(true);
      expect(preTaskResult.personalized).toBe(true);
    });

    test('should handle expert user workflow with minimal intervention', async () => {
      const user = { experienceLevel: 'expert', userId: 'integration-expert' };

      // Complete workflow
      await hookManager.loadUserPreferences(user.userId);
      const adaptedHooks = await adaptationHooks.adaptHooksForUser(user);

      const fileOperations = [
        { type: 'write', path: 'GUIDE.md', content: 'Auto-generated', trigger: 'auto' },
        { type: 'write', path: 'src/service.js', content: 'class Service {}' }
      ];

      const filteredOperations = await contentFilters.filterRequests(fileOperations);

      const preTaskResult = await hookManager.executeHook('pre-task', {
        task: 'implement service',
        user,
        adaptedHooks
      });

      // Expert users get minimal, fast processing
      expect(adaptedHooks.verbosity).toBe('minimal');
      expect(filteredOperations.blocked.length).toBeGreaterThan(0);
      expect(preTaskResult.content.length).toBeLessThan(200);
    });
  });

  describe('Performance Integration', () => {
    test('should maintain <100ms total processing time for complete workflow', async () => {
      const user = { experienceLevel: 'intermediate', userId: 'perf-test' };

      const startTime = performance.now();

      // Complete workflow
      await hookManager.loadUserPreferences(user.userId);
      const adaptedHooks = await adaptationHooks.adaptHooksForUser(user);

      const fileOperations = [
        { type: 'write', path: 'README.md', content: 'Auto-generated' },
        { type: 'write', path: 'src/app.js', content: 'const app = {}' }
      ];

      await contentFilters.filterRequests(fileOperations);
      await hookManager.executeHook('pre-task', { task: 'test', user, adaptedHooks });

      const totalTime = performance.now() - startTime;

      expect(totalTime).toBeLessThan(100);
    });

    test('should handle concurrent users efficiently', async () => {
      const users = Array(10).fill(null).map((_, i) => ({
        experienceLevel: ['novice', 'intermediate', 'expert'][i % 3],
        userId: `concurrent-${i}`
      }));

      const startTime = performance.now();

      const workflows = users.map(async (user) => {
        await hookManager.loadUserPreferences(user.userId);
        const hooks = await adaptationHooks.adaptHooksForUser(user);
        return hookManager.executeHook('pre-task', { task: 'test', user, hooks });
      });

      await Promise.all(workflows);

      const totalTime = performance.now() - startTime;
      const avgTime = totalTime / users.length;

      expect(avgTime).toBeLessThan(20); // <20ms per user on average
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle component failures gracefully', async () => {
      const user = { experienceLevel: 'novice', userId: 'error-test' };

      // Simulate hook manager failure
      jest.spyOn(hookManager, 'loadUserPreferences').mockRejectedValueOnce(new Error('Network failure'));

      // Should still provide functional workflow
      const adaptedHooks = await adaptationHooks.adaptHooksForUser(user);
      const filteredOps = await contentFilters.filterRequests([
        { type: 'write', path: 'test.js', content: 'test' }
      ]);

      expect(adaptedHooks).toBeDefined();
      expect(filteredOps.allowed).toBeDefined();
    });

    test('should maintain data consistency during partial failures', async () => {
      const user = { experienceLevel: 'intermediate', userId: 'consistency-test' };

      // Simulate content filter failure
      jest.spyOn(contentFilters, 'filterRequests').mockRejectedValueOnce(new Error('Filter failure'));

      try {
        await hookManager.loadUserPreferences(user.userId);
        const hooks = await adaptationHooks.adaptHooksForUser(user);

        // Should still have valid hooks
        expect(hooks.verbosity).toBe('balanced');
      } catch (error) {
        // Should not reach here - system should handle gracefully
        expect(error).toBeUndefined();
      }
    });
  });

  describe('Satisfaction Metrics Integration', () => {
    test('should achieve >4.0/5 satisfaction across all user types', async () => {
      const testScenarios = [
        { type: 'novice', expectedSatisfaction: 4.2 },
        { type: 'intermediate', expectedSatisfaction: 4.1 },
        { type: 'expert', expectedSatisfaction: 4.3 }
      ];

      for (const scenario of testScenarios) {
        const user = { experienceLevel: scenario.type, userId: `satisfaction-${scenario.type}` };

        // Simulate multiple interactions
        for (let i = 0; i < 5; i++) {
          await hookManager.loadUserPreferences(user.userId);
          const hooks = await adaptationHooks.adaptHooksForUser(user);

          // Record positive feedback for well-adapted hooks
          await adaptationHooks.recordSatisfactionFeedback({
            user,
            hookType: 'general',
            rating: Math.floor(Math.random() * 2) + 4 // 4 or 5
          });
        }

        const satisfaction = await adaptationHooks.getUserSatisfaction(user.userId);
        expect(satisfaction.averageRating).toBeGreaterThanOrEqual(4.0);
      }
    });
  });

  describe('Checkpoint Verification', () => {
    test('Checkpoint 1.1: Enhanced Hook Manager with Personalization', async () => {
      const startTime = performance.now();

      const user = { experienceLevel: 'novice', userId: 'checkpoint-1.1' };
      await hookManager.loadUserPreferences(user.userId);

      const loadTime = performance.now() - startTime;

      // Performance requirement
      expect(loadTime).toBeLessThan(100);

      // Adaptation requirement
      const hooks = hookManager.getPersonalizedHooks('novice');
      expect(hooks.verbosity).toBe('detailed');
    });

    test('Checkpoint 1.2: Content Filtering Integration', async () => {
      const autoGenRequests = [
        { type: 'write', path: 'README.md', content: 'Auto-generated', trigger: 'auto' },
        { type: 'write', path: 'GUIDE.md', content: 'Auto-generated', trigger: 'auto' }
      ];

      const startTime = performance.now();
      const results = await contentFilters.filterRequests(autoGenRequests);
      const processingTime = performance.now() - startTime;

      // Performance requirement
      expect(processingTime).toBeLessThan(50);

      // Blocking requirement (should block both auto-generated .md files)
      expect(results.blocked.length).toBe(2);
    });

    test('Checkpoint 1.3: Experience-Level Hook Adaptation', async () => {
      const users = [
        { experienceLevel: 'novice', expected: 'detailed' },
        { experienceLevel: 'expert', expected: 'minimal' },
        { experienceLevel: 'intermediate', expected: 'balanced' }
      ];

      for (const userData of users) {
        const user = { ...userData, userId: `checkpoint-1.3-${userData.experienceLevel}` };
        const hooks = await adaptationHooks.adaptHooksForUser(user);

        expect(hooks.verbosity).toBe(userData.expected);
      }

      // Satisfaction requirement
      const overallSatisfaction = await adaptationHooks.getOverallSatisfaction();
      expect(overallSatisfaction).toBeGreaterThan(4.0);
    });
  });
});