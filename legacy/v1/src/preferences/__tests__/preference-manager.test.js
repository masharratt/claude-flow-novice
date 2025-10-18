// preference-manager.test.js - Test preference manager functionality
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import PreferenceManager from '../preference-manager.js';

// Mock fs-extra
jest.mock('fs-extra');

describe('PreferenceManager', () => {
  let manager;
  const mockProjectPath = '/mock/project/.claude-flow-novice/preferences/user-global.json';
  const mockGlobalPath = path.join(
    os.homedir(),
    '.claude-flow-novice',
    'preferences',
    'global.json',
  );

  beforeEach(() => {
    manager = new PreferenceManager();
    manager.cachedPreferences = null;
    jest.clearAllMocks();
  });

  describe('loadPreferences', () => {
    test('loads and merges preferences correctly', async () => {
      const globalPrefs = {
        experience: { level: 'intermediate' },
        documentation: { verbosity: 'standard' },
      };

      const projectPrefs = {
        experience: { level: 'advanced' },
        workflow: { concurrency: 4 },
      };

      fs.pathExists.mockImplementation((path) => {
        if (path.includes('global.json')) return Promise.resolve(true);
        if (path.includes('user-global.json')) return Promise.resolve(true);
        return Promise.resolve(false);
      });

      fs.readJson.mockImplementation((path) => {
        if (path.includes('global.json')) return Promise.resolve(globalPrefs);
        if (path.includes('user-global.json')) return Promise.resolve(projectPrefs);
        return Promise.resolve({});
      });

      const result = await manager.loadPreferences();

      expect(result.experience.level).toBe('advanced'); // Project overrides global
      expect(result.documentation.verbosity).toBe('standard'); // From global
      expect(result.workflow.concurrency).toBe(4); // From project
    });

    test('uses defaults when no preference files exist', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await manager.loadPreferences();

      expect(result.experience.level).toBe('beginner');
      expect(result.documentation.verbosity).toBe('standard');
      expect(result.workflow.concurrency).toBe(2);
    });

    test('handles invalid preference files gracefully', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockRejectedValue(new Error('Invalid JSON'));

      const result = await manager.loadPreferences();

      // Should fall back to defaults
      expect(result.experience.level).toBe('beginner');
    });
  });

  describe('set and get', () => {
    test('sets and gets preference values with dot notation', async () => {
      fs.pathExists.mockResolvedValue(false);
      fs.ensureDir.mockResolvedValue();
      fs.writeJson.mockResolvedValue();

      await manager.set('documentation.verbosity', 'detailed');

      expect(fs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('user-global.json'),
        expect.objectContaining({
          documentation: { verbosity: 'detailed' },
        }),
        { spaces: 2 },
      );
    });

    test('validates preference values before setting', async () => {
      await expect(manager.set('experience.level', 'invalid_level')).rejects.toThrow(
        'Invalid preference value',
      );
    });

    test('gets nested preference values', async () => {
      manager.cachedPreferences = {
        documentation: { verbosity: 'detailed' },
        workflow: { concurrency: 3 },
      };

      const verbosity = await manager.get('documentation.verbosity');
      const concurrency = await manager.get('workflow.concurrency');
      const missing = await manager.get('missing.key', 'default');

      expect(verbosity).toBe('detailed');
      expect(concurrency).toBe(3);
      expect(missing).toBe('default');
    });
  });

  describe('validation', () => {
    test('validates preferences and returns errors', async () => {
      manager.cachedPreferences = {
        experience: { level: 'invalid' },
        workflow: { concurrency: 10 },
      };

      const result = await manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid experience level');
    });

    test('validates correct preferences successfully', async () => {
      manager.cachedPreferences = {
        experience: { level: 'intermediate' },
        documentation: { verbosity: 'standard' },
        workflow: { concurrency: 3 },
      };

      const result = await manager.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('generateSuggestions', () => {
    test('suggests neural learning for advanced users', async () => {
      manager.cachedPreferences = {
        experience: { level: 'advanced' },
        advanced: { neuralLearning: false },
      };

      const suggestions = await manager.generateSuggestions();

      expect(suggestions.some((s) => s.key === 'advanced.neuralLearning')).toBe(true);
    });

    test('suggests verbosity reduction for advanced users', async () => {
      manager.cachedPreferences = {
        experience: { level: 'advanced' },
        documentation: { verbosity: 'detailed' },
      };

      const suggestions = await manager.generateSuggestions();

      expect(suggestions.some((s) => s.key === 'documentation.verbosity')).toBe(true);
    });
  });

  describe('contextual preferences', () => {
    test('adjusts preferences based on context', async () => {
      manager.cachedPreferences = {
        experience: { level: 'advanced' },
        documentation: { verbosity: 'detailed' },
        workflow: { concurrency: 4 },
      };

      const contextualPrefs = await manager.getContextualPreferences({
        taskComplexity: 'simple',
      });

      expect(contextualPrefs.documentation.verbosity).toBe('minimal');
    });

    test('limits concurrency for limited resources', async () => {
      manager.cachedPreferences = {
        workflow: { concurrency: 6 },
      };

      const contextualPrefs = await manager.getContextualPreferences({
        systemResources: 'limited',
      });

      expect(contextualPrefs.workflow.concurrency).toBe(2);
    });
  });

  describe('import and export', () => {
    test('exports preferences to file', async () => {
      manager.cachedPreferences = {
        experience: { level: 'intermediate' },
      };

      fs.ensureDir.mockResolvedValue();
      fs.writeJson.mockResolvedValue();

      const result = await manager.export('/test/path.json');

      expect(fs.writeJson).toHaveBeenCalledWith(
        '/test/path.json',
        expect.objectContaining({
          experience: { level: 'intermediate' },
        }),
        { spaces: 2 },
      );
      expect(result).toBe('/test/path.json');
    });

    test('imports preferences from file', async () => {
      const importData = {
        experience: { level: 'advanced' },
        workflow: { concurrency: 4 },
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(importData);
      fs.ensureDir.mockResolvedValue();
      fs.writeJson.mockResolvedValue();

      await manager.import('/test/import.json');

      expect(fs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('user-global.json'),
        expect.objectContaining({
          experience: { level: 'advanced' },
          workflow: { concurrency: 4 },
          meta: expect.objectContaining({
            importedFrom: '/test/import.json',
          }),
        }),
        { spaces: 2 },
      );
    });
  });
});
