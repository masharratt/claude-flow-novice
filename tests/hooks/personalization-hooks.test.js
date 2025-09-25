/**
 * TDD Tests for Enhanced Hook Manager with Personalization - Checkpoint 1.1
 *
 * SUCCESS CRITERIA:
 * - Hook manager loads user preferences in <100ms
 * - Adapts verbosity based on experience level
 * - Must pass 100% before implementation
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { EnhancedHookManager } from '../../src/hooks/managers/enhanced-hook-manager.js';
import { PersonalizationHooks } from '../../src/hooks/enhanced/personalization-hooks.js';

describe('Enhanced Hook Manager with Personalization - Checkpoint 1.1', () => {
  let hookManager;
  let mockUserPreferences;

  beforeEach(() => {
    // Mock user preferences
    mockUserPreferences = {
      experienceLevel: 'novice',
      verbosity: 'detailed',
      preferredLanguages: ['javascript', 'typescript'],
      workflowPreferences: {
        autoFormat: true,
        showHints: true,
        detailedLogs: true
      }
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Performance Requirements', () => {
    test('should load user preferences in less than 100ms', async () => {
      const startTime = performance.now();

      hookManager = new EnhancedHookManager();
      await hookManager.loadUserPreferences('user123');

      const loadTime = performance.now() - startTime;
      expect(loadTime).toBeLessThan(100);
    });

    test('should cache preferences to avoid repeated loading', async () => {
      hookManager = new EnhancedHookManager();

      // First load
      const firstLoad = performance.now();
      await hookManager.loadUserPreferences('user123');
      const firstLoadTime = performance.now() - firstLoad;

      // Second load (should be cached)
      const secondLoad = performance.now();
      await hookManager.loadUserPreferences('user123');
      const secondLoadTime = performance.now() - secondLoad;

      expect(secondLoadTime).toBeLessThan(firstLoadTime / 2);
    });
  });

  describe('Experience Level Adaptation', () => {
    test('should adapt hook verbosity for novice users', async () => {
      hookManager = new EnhancedHookManager();
      await hookManager.loadUserPreferences('novice-user');

      const hooks = hookManager.getPersonalizedHooks('novice');

      expect(hooks.verbosity).toBe('detailed');
      expect(hooks.showHints).toBe(true);
      expect(hooks.explanations).toBe(true);
      expect(hooks.stepByStep).toBe(true);
    });

    test('should adapt hook verbosity for expert users', async () => {
      hookManager = new EnhancedHookManager();
      await hookManager.loadUserPreferences('expert-user');

      const hooks = hookManager.getPersonalizedHooks('expert');

      expect(hooks.verbosity).toBe('minimal');
      expect(hooks.showHints).toBe(false);
      expect(hooks.explanations).toBe(false);
      expect(hooks.stepByStep).toBe(false);
    });

    test('should provide intermediate settings for intermediate users', async () => {
      hookManager = new EnhancedHookManager();
      await hookManager.loadUserPreferences('intermediate-user');

      const hooks = hookManager.getPersonalizedHooks('intermediate');

      expect(hooks.verbosity).toBe('balanced');
      expect(hooks.showHints).toBe(true);
      expect(hooks.explanations).toBe(false);
      expect(hooks.stepByStep).toBe(false);
    });
  });

  describe('Personalization Features', () => {
    test('should customize hooks based on preferred languages', async () => {
      const preferences = {
        ...mockUserPreferences,
        preferredLanguages: ['python', 'go']
      };

      hookManager = new EnhancedHookManager();
      await hookManager.loadUserPreferences('user123', preferences);

      const hooks = hookManager.getLanguageSpecificHooks();

      expect(hooks.languages).toContain('python');
      expect(hooks.languages).toContain('go');
      expect(hooks.linting.python).toBeDefined();
      expect(hooks.testing.python).toBeDefined();
    });

    test('should respect workflow preferences', async () => {
      const preferences = {
        ...mockUserPreferences,
        workflowPreferences: {
          autoFormat: false,
          showHints: false,
          detailedLogs: false
        }
      };

      hookManager = new EnhancedHookManager();
      await hookManager.loadUserPreferences('user123', preferences);

      const workflowHooks = hookManager.getWorkflowHooks();

      expect(workflowHooks.autoFormat).toBe(false);
      expect(workflowHooks.showHints).toBe(false);
      expect(workflowHooks.detailedLogs).toBe(false);
    });

    test('should handle missing preferences gracefully', async () => {
      hookManager = new EnhancedHookManager();
      await hookManager.loadUserPreferences('new-user');

      const hooks = hookManager.getPersonalizedHooks();

      // Should use defaults
      expect(hooks.verbosity).toBe('balanced');
      expect(hooks.experienceLevel).toBe('intermediate');
      expect(hooks).toBeDefined();
    });
  });

  describe('Hook Manager Integration', () => {
    test('should integrate with PersonalizationHooks class', async () => {
      hookManager = new EnhancedHookManager();
      const personalizationHooks = new PersonalizationHooks(mockUserPreferences);

      await hookManager.registerHookProvider('personalization', personalizationHooks);

      const hooks = await hookManager.executeHook('pre-task', {
        task: 'implement feature',
        context: { language: 'javascript' }
      });

      expect(hooks.personalized).toBe(true);
      expect(hooks.adapted).toBe(true);
    });

    test('should maintain hook execution performance', async () => {
      hookManager = new EnhancedHookManager();
      await hookManager.loadUserPreferences('user123');

      const startTime = performance.now();

      await hookManager.executeHook('pre-task', { task: 'test task' });
      await hookManager.executeHook('post-edit', { file: 'test.js' });
      await hookManager.executeHook('post-task', { task: 'test task' });

      const totalTime = performance.now() - startTime;

      // All hook executions should complete in reasonable time
      expect(totalTime).toBeLessThan(50);
    });
  });

  describe('Error Handling', () => {
    test('should handle preference loading failures gracefully', async () => {
      hookManager = new EnhancedHookManager();

      // Simulate preference loading failure
      jest.spyOn(hookManager, 'loadUserPreferences').mockRejectedValueOnce(new Error('Preference loading failed'));

      await expect(hookManager.loadUserPreferences('invalid-user')).rejects.toThrow('Preference loading failed');

      // Should still provide default hooks
      const defaultHooks = hookManager.getPersonalizedHooks();
      expect(defaultHooks).toBeDefined();
    });

    test('should validate experience level values', async () => {
      hookManager = new EnhancedHookManager();

      expect(() => {
        hookManager.getPersonalizedHooks('invalid-level');
      }).toThrow('Invalid experience level: invalid-level');
    });
  });
});