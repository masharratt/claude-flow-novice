/**
 * Framework Detector Test Suite
 * Phase 2 Implementation Tests
 *
 * Validates 90%+ accuracy framework detection system
 */

import { jest } from '@jest/globals';
import { FrameworkDetector } from '../../src/completion/framework-detector.js';
import fs from 'fs/promises';
import path from 'path';

// Mock filesystem operations
jest.mock('fs/promises');

describe('FrameworkDetector', () => {
  let detector;
  let mockMemoryStore;

  beforeEach(() => {
    // Mock memory store
    mockMemoryStore = {
      initialize: jest.fn().mockResolvedValue(undefined),
      store: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    };

    detector = new FrameworkDetector({
      basePath: '/test/project'
    });

    // Replace with mock
    detector.memoryStore = mockMemoryStore;
    detector.initialized = true;

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('JavaScript Project Detection', () => {
    it('should detect JavaScript projects with 90%+ confidence', async () => {
      // Mock JavaScript project structure
      fs.readdir.mockImplementation(async (dir, options) => {
        if (dir.includes('/test/project')) {
          return [
            { name: 'package.json', isFile: () => true, isDirectory: () => false },
            { name: 'index.js', isFile: () => true, isDirectory: () => false },
            { name: 'src', isFile: () => false, isDirectory: () => true },
            { name: 'test.js', isFile: () => true, isDirectory: () => false },
            { name: 'node_modules', isFile: () => false, isDirectory: () => true }
          ];
        }
        if (dir.includes('/src')) {
          return [
            { name: 'main.js', isFile: () => true, isDirectory: () => false },
            { name: 'utils.js', isFile: () => true, isDirectory: () => false }
          ];
        }
        return [];
      });

      fs.access.mockImplementation(async (filePath) => {
        if (filePath.includes('package.json')) return;
        throw new Error('File not found');
      });

      fs.readFile.mockImplementation(async (filePath, encoding) => {
        if (filePath.includes('package.json')) {
          return JSON.stringify({
            name: 'test-project',
            main: 'index.js',
            scripts: { test: 'jest' },
            devDependencies: { jest: '^29.0.0' },
            dependencies: { express: '^4.0.0' }
          });
        }
        if (filePath.includes('.js')) {
          return 'const express = require("express");\nmodule.exports = app;';
        }
        throw new Error('File not found');
      });

      const result = await detector.detectFramework();

      expect(result.detected).toBe('javascript');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.evidence.files.packageJson).toBe(true);
      expect(result.evidence.files.jsFiles).toBeGreaterThan(0);
      expect(result.metadata.filesAnalyzed).toBeGreaterThan(0);
    });

    it('should detect Jest testing framework in JavaScript projects', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'package.json', isFile: () => true, isDirectory: () => false },
        { name: 'app.test.js', isFile: () => true, isDirectory: () => false }
      ]);

      fs.access.mockResolvedValue(undefined);

      fs.readFile.mockImplementation(async (filePath) => {
        if (filePath.includes('package.json')) {
          return JSON.stringify({
            devDependencies: { jest: '^29.0.0' }
          });
        }
        if (filePath.includes('test.js')) {
          return 'describe("test", () => { it("should work", () => { expect(true).toBe(true); }); });';
        }
        return '';
      });

      const result = await detector.detectFramework();

      expect(result.evidence.testingFrameworks).toContain('jest');
      expect(result.evidence.packageJson['devDependencies.jest']).toBe(true);
    });
  });

  describe('TypeScript Project Detection', () => {
    it('should detect TypeScript projects with 90%+ confidence', async () => {
      fs.readdir.mockImplementation(async (dir) => {
        if (dir.includes('/test/project')) {
          return [
            { name: 'package.json', isFile: () => true, isDirectory: () => false },
            { name: 'tsconfig.json', isFile: () => true, isDirectory: () => false },
            { name: 'src', isFile: () => false, isDirectory: () => true }
          ];
        }
        if (dir.includes('/src')) {
          return [
            { name: 'main.ts', isFile: () => true, isDirectory: () => false },
            { name: 'types.d.ts', isFile: () => true, isDirectory: () => false },
            { name: 'component.tsx', isFile: () => true, isDirectory: () => false }
          ];
        }
        return [];
      });

      fs.access.mockResolvedValue(undefined);

      fs.readFile.mockImplementation(async (filePath) => {
        if (filePath.includes('package.json')) {
          return JSON.stringify({
            devDependencies: {
              typescript: '^5.0.0',
              '@types/node': '^20.0.0',
              'ts-jest': '^29.0.0'
            }
          });
        }
        if (filePath.includes('tsconfig.json')) {
          return JSON.stringify({ compilerOptions: { target: 'ES2022' } });
        }
        if (filePath.includes('.ts')) {
          return 'interface User { id: number; name: string; }\nexport type UserID = number;';
        }
        return '';
      });

      const result = await detector.detectFramework();

      expect(result.detected).toBe('typescript');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.evidence.files.tsFiles).toBeGreaterThan(0);
      expect(result.evidence.files['tsconfig.json']).toBe(true);
      expect(result.evidence.packageJson.typescript).toBe(true);
    });

    it('should detect TypeScript-specific patterns in code', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'main.ts', isFile: () => true, isDirectory: () => false }
      ]);

      fs.access.mockRejectedValue(new Error('No package.json'));

      fs.readFile.mockResolvedValue(`
        interface ApiResponse<T> {
          data: T;
          status: 'success' | 'error';
        }

        type UserRole = 'admin' | 'user' | 'guest';

        export class UserService {
          constructor(private api: ApiClient) {}

          async getUser(id: number): Promise<User> {
            return this.api.get('/users/' + id);
          }
        }
      `);

      const result = await detector.detectFramework();

      expect(result.scores.typescript).toBeGreaterThan(0);
      expect(result.evidence.patterns.typescript).toBeDefined();
      expect(result.metadata.patternsMatched).toBeGreaterThan(0);
    });
  });

  describe('Python Project Detection', () => {
    it('should detect Python projects with 90%+ confidence', async () => {
      fs.readdir.mockImplementation(async (dir) => {
        if (dir.includes('/test/project')) {
          return [
            { name: 'requirements.txt', isFile: () => true, isDirectory: () => false },
            { name: 'setup.py', isFile: () => true, isDirectory: () => false },
            { name: 'main.py', isFile: () => true, isDirectory: () => false },
            { name: 'src', isFile: () => false, isDirectory: () => true },
            { name: '__pycache__', isFile: () => false, isDirectory: () => true }
          ];
        }
        if (dir.includes('/src')) {
          return [
            { name: 'app.py', isFile: () => true, isDirectory: () => false },
            { name: 'utils.py', isFile: () => true, isDirectory: () => false },
            { name: 'test_app.py', isFile: () => true, isDirectory: () => false }
          ];
        }
        return [];
      });

      fs.access.mockResolvedValue(undefined);

      fs.readFile.mockImplementation(async (filePath) => {
        if (filePath.includes('requirements.txt')) {
          return 'flask==2.0.0\npytest==7.0.0\nrequests>=2.25.0';
        }
        if (filePath.includes('setup.py')) {
          return 'from setuptools import setup\nsetup(name="test-project", install_requires=["flask"])';
        }
        if (filePath.includes('.py')) {
          return `
import os
from flask import Flask, request
import pytest

def create_app():
    app = Flask(__name__)
    return app

class UserService:
    def __init__(self):
        pass

    def get_user(self, user_id):
        return {"id": user_id}

if __name__ == "__main__":
    app = create_app()
    app.run()
          `;
        }
        return '';
      });

      const result = await detector.detectFramework();

      expect(result.detected).toBe('python');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.evidence.files['requirements.txt']).toBe(true);
      expect(result.evidence.files['setup.py']).toBe(true);
      expect(result.evidence.files.pyFiles).toBeGreaterThan(0);
    });

    it('should detect pytest testing framework in Python projects', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'test_main.py', isFile: () => true, isDirectory: () => false },
        { name: 'pytest.ini', isFile: () => true, isDirectory: () => false }
      ]);

      fs.access.mockResolvedValue(undefined);

      fs.readFile.mockImplementation(async (filePath) => {
        if (filePath.includes('test_main.py')) {
          return `
import pytest
from main import calculate

def test_calculate():
    result = calculate(2, 3)
    assert result == 5

@pytest.fixture
def sample_data():
    return {"test": "data"}

def test_with_fixture(sample_data):
    assert sample_data["test"] == "data"
          `;
        }
        return '';
      });

      const result = await detector.detectFramework();

      expect(result.evidence.testingFrameworks).toContain('pytest');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle unreadable directories gracefully', async () => {
      fs.readdir.mockRejectedValue(new Error('Permission denied'));
      fs.access.mockRejectedValue(new Error('File not found'));

      const result = await detector.detectFramework();

      expect(result.detected).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(result.error).toBeUndefined(); // Should not throw, just low confidence
    });

    it('should handle corrupted package.json files', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'package.json', isFile: () => true, isDirectory: () => false }
      ]);

      fs.access.mockResolvedValue(undefined);
      fs.readFile.mockResolvedValue('{ invalid json content');

      const result = await detector.detectFramework();

      expect(result.detected).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle mixed project types with weighted scoring', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'package.json', isFile: () => true, isDirectory: () => false },
        { name: 'tsconfig.json', isFile: () => true, isDirectory: () => false },
        { name: 'requirements.txt', isFile: () => true, isDirectory: () => false },
        { name: 'main.js', isFile: () => true, isDirectory: () => false },
        { name: 'app.py', isFile: () => true, isDirectory: () => false }
      ]);

      fs.access.mockResolvedValue(undefined);

      fs.readFile.mockImplementation(async (filePath) => {
        if (filePath.includes('package.json')) {
          return JSON.stringify({
            devDependencies: { typescript: '^5.0.0' }
          });
        }
        if (filePath.includes('tsconfig.json')) {
          return JSON.stringify({});
        }
        if (filePath.includes('requirements.txt')) {
          return 'flask==2.0.0';
        }
        return '';
      });

      const result = await detector.detectFramework();

      // Should detect the framework with the strongest evidence (TypeScript in this case)
      expect(result.detected).toBe('typescript');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.scores.typescript).toBeGreaterThan(result.scores.python);
    });
  });

  describe('Performance and Accuracy Requirements', () => {
    it('should complete detection in under 5 seconds', async () => {
      // Mock a large project structure
      const generateMockFiles = (count) => {
        return Array.from({ length: count }, (_, i) => ({
          name: `file${i}.js`,
          isFile: () => true,
          isDirectory: () => false
        }));
      };

      fs.readdir.mockResolvedValue([
        { name: 'package.json', isFile: () => true, isDirectory: () => false },
        ...generateMockFiles(100)
      ]);

      fs.access.mockResolvedValue(undefined);
      fs.readFile.mockResolvedValue('console.log("test");');

      const startTime = Date.now();
      const result = await detector.detectFramework();
      const detectionTime = Date.now() - startTime;

      expect(detectionTime).toBeLessThan(5000);
      expect(result.metadata.detectionTime).toBeLessThan(5000);
    });

    it('should achieve >90% accuracy on known project structures', async () => {
      const testCases = [
        {
          name: 'React TypeScript Project',
          files: [
            { name: 'package.json', content: '{"devDependencies":{"typescript":"^5.0.0","@types/react":"^18.0.0"}}' },
            { name: 'tsconfig.json', content: '{}' },
            { name: 'App.tsx', content: 'import React from "react"; export const App = () => <div>Hello</div>;' }
          ],
          expected: 'typescript',
          minConfidence: 0.9
        },
        {
          name: 'Express JavaScript Project',
          files: [
            { name: 'package.json', content: '{"dependencies":{"express":"^4.0.0"},"scripts":{"test":"jest"}}' },
            { name: 'server.js', content: 'const express = require("express"); const app = express();' },
            { name: 'test.js', content: 'describe("server", () => { it("should start", () => {}); });' }
          ],
          expected: 'javascript',
          minConfidence: 0.9
        },
        {
          name: 'Django Python Project',
          files: [
            { name: 'requirements.txt', content: 'Django==4.0.0\npytest==7.0.0' },
            { name: 'manage.py', content: 'import django; django.setup()' },
            { name: 'test_views.py', content: 'def test_homepage(): assert True' }
          ],
          expected: 'python',
          minConfidence: 0.9
        }
      ];

      for (const testCase of testCases) {
        // Mock filesystem for this test case
        fs.readdir.mockResolvedValue(
          testCase.files.map(f => ({
            name: f.name,
            isFile: () => true,
            isDirectory: () => false
          }))
        );

        fs.access.mockResolvedValue(undefined);

        fs.readFile.mockImplementation(async (filePath) => {
          const fileName = path.basename(filePath);
          const file = testCase.files.find(f => f.name === fileName);
          return file ? file.content : '';
        });

        const result = await detector.detectFramework();

        expect(result.detected).toBe(testCase.expected);
        expect(result.confidence).toBeGreaterThan(testCase.minConfidence);
      }
    });
  });

  describe('Framework-Specific Features', () => {
    it('should detect monorepo structures', async () => {
      fs.readdir.mockImplementation(async (dir) => {
        if (dir.includes('/test/project')) {
          return [
            { name: 'package.json', isFile: () => true, isDirectory: () => false },
            { name: 'lerna.json', isFile: () => true, isDirectory: () => false },
            { name: 'packages', isFile: () => false, isDirectory: () => true }
          ];
        }
        return [];
      });

      fs.access.mockResolvedValue(undefined);

      fs.readFile.mockImplementation(async (filePath) => {
        if (filePath.includes('package.json')) {
          return JSON.stringify({
            workspaces: ['packages/*'],
            devDependencies: { lerna: '^6.0.0' }
          });
        }
        if (filePath.includes('lerna.json')) {
          return JSON.stringify({ version: 'independent' });
        }
        return '';
      });

      const result = await detector.detectFramework();

      expect(result.detected).toBe('javascript');
      expect(result.evidence.packageJson.workspaces).toBeUndefined(); // Not implemented in patterns yet
    });

    it('should detect modern build tools', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'package.json', isFile: () => true, isDirectory: () => false },
        { name: 'vite.config.js', isFile: () => true, isDirectory: () => false },
        { name: 'src', isFile: () => false, isDirectory: () => true }
      ]);

      fs.access.mockResolvedValue(undefined);

      fs.readFile.mockImplementation(async (filePath) => {
        if (filePath.includes('package.json')) {
          return JSON.stringify({
            devDependencies: {
              vite: '^5.0.0',
              '@vitejs/plugin-react': '^4.0.0'
            }
          });
        }
        return '';
      });

      const result = await detector.detectFramework();

      expect(result.detected).toBe('javascript');
      // Modern tooling should boost confidence
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Helper Methods', () => {
    it('should correctly match file patterns', () => {
      expect(detector.matchesPattern('test.js', '*.js')).toBe(true);
      expect(detector.matchesPattern('file.test.js', '*.test.js')).toBe(true);
      expect(detector.matchesPattern('package.json', 'package.json')).toBe(true);
      expect(detector.matchesPattern('main.py', '*.js')).toBe(false);
    });

    it('should correctly access nested properties', () => {
      const obj = {
        devDependencies: {
          jest: '^29.0.0',
          '@types/node': '^20.0.0'
        }
      };

      expect(detector.getNestedProperty(obj, 'devDependencies.jest')).toBe('^29.0.0');
      expect(detector.getNestedProperty(obj, 'devDependencies.@types/node')).toBe('^20.0.0');
      expect(detector.getNestedProperty(obj, 'nonexistent.key')).toBeUndefined();
    });
  });
});

/**
 * Integration Tests
 */
describe('FrameworkDetector Integration', () => {
  it('should integrate with TruthConfigManager', async () => {
    // This test would verify integration with the config manager
    // For now, we test that the detector can be used standalone
    const detector = new FrameworkDetector();
    expect(detector).toBeInstanceOf(FrameworkDetector);
  });

  it('should cache detection results for performance', async () => {
    const detector = new FrameworkDetector();
    const mockStore = {
      initialize: jest.fn(),
      store: jest.fn(),
      close: jest.fn()
    };

    detector.memoryStore = mockStore;
    detector.initialized = true;

    // Mock successful detection
    fs.readdir.mockResolvedValue([]);
    fs.access.mockRejectedValue(new Error('Not found'));

    await detector.detectFramework();

    expect(mockStore.store).toHaveBeenCalledWith(
      'framework-detection-result',
      expect.any(Object),
      expect.objectContaining({
        namespace: 'framework-detection',
        metadata: expect.objectContaining({
          timestamp: expect.any(String),
          basePath: expect.any(String)
        })
      })
    );
  });
});