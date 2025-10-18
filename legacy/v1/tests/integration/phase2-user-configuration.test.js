import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/**
 * Phase 2 User Configuration System Integration Tests
 * Critical Implementation Validation Tests
 *
 * Tests all Phase 2 requirements:
 * - Interactive setup wizard (<5 minute completion)
 * - Framework detection (>90% accuracy)
 * - Essential CLI commands functionality
 * - Configuration persistence
 * - Byzantine security integration
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { InteractiveSetupWizard } from '../../src/validation/cli/interactive-setup-wizard.js';
import { ValidationCommands } from '../../src/validation/cli/validation-commands.js';
import { FrameworkDetector } from '../../src/completion/framework-detector.js';
import { TruthConfigManager } from '../../src/validation/truth-config-manager.js';

const TEST_PROJECT_DIR = path.join(__dirname, 'test-projects');
const TEMP_CONFIG_DIR = path.join(__dirname, 'temp-config');

describe('Phase 2 User Configuration System', () => {
  beforeEach(async () => {
    // Clean up test directories
    await fs.rm(TEST_PROJECT_DIR, { recursive: true, force: true });
    await fs.rm(TEMP_CONFIG_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_PROJECT_DIR, { recursive: true });
    await fs.mkdir(TEMP_CONFIG_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up after tests
    await fs.rm(TEST_PROJECT_DIR, { recursive: true, force: true });
    await fs.rm(TEMP_CONFIG_DIR, { recursive: true, force: true });
  });

  describe('Interactive Setup Wizard', () => {
    test('completes setup in less than 5 minutes', async () => {
      const projectDir = await createTestProject('javascript');
      const startTime = Date.now();

      const wizard = new InteractiveSetupWizard({ basePath: projectDir });

      // Mock user inputs for automated testing
      const mockInputs = {
        experienceLevel: 'novice',
        framework: 'javascript',
        autoHooks: true,
        verbose: true
      };

      const result = await wizard.runSetupWizard({
        automated: true,
        inputs: mockInputs
      });

      await wizard.cleanup();

      const setupTime = (Date.now() - startTime) / 1000;

      expect(result.success).toBe(true);
      expect(setupTime).toBeLessThan(300); // Less than 5 minutes
      expect(result.framework).toBeDefined();
      expect(result.configuration).toBeDefined();

      // Verify configuration files were created
      const configExists = await fileExists(path.join(projectDir, '.swarm', 'user-preferences.json'));
      expect(configExists).toBe(true);
    }, 310000); // 5 minute + 10 second timeout

    test('detects framework with >90% accuracy for JavaScript projects', async () => {
      const projectDir = await createTestProject('javascript');
      const detector = new FrameworkDetector({ basePath: projectDir });
      await detector.initialize();

      const result = await detector.detectFramework();
      await detector.close();

      expect(result.detected).toBe('javascript');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('detects framework with >90% accuracy for TypeScript projects', async () => {
      const projectDir = await createTestProject('typescript');
      const detector = new FrameworkDetector({ basePath: projectDir });
      await detector.initialize();

      const result = await detector.detectFramework();
      await detector.close();

      expect(result.detected).toBe('typescript');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('detects framework with >90% accuracy for Python projects', async () => {
      const projectDir = await createTestProject('python');
      const detector = new FrameworkDetector({ basePath: projectDir });
      await detector.initialize();

      const result = await detector.detectFramework();
      await detector.close();

      expect(result.detected).toBe('python');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('detects React projects correctly', async () => {
      const projectDir = await createTestProject('react');
      const detector = new FrameworkDetector({ basePath: projectDir });
      await detector.initialize();

      const result = await detector.detectFramework();
      await detector.close();

      expect(['javascript', 'typescript']).toContain(result.detected);
      expect(result.evidence.webFrameworks).toBeDefined();
      expect(result.evidence.webFrameworks.some(f => f.name === 'react')).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('detects Django projects correctly', async () => {
      const projectDir = await createTestProject('django');
      const detector = new FrameworkDetector({ basePath: projectDir });
      await detector.initialize();

      const result = await detector.detectFramework();
      await detector.close();

      expect(result.detected).toBe('python');
      expect(result.evidence.pythonFrameworks).toBeDefined();
      expect(result.evidence.pythonFrameworks.some(f => f.name === 'django')).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('CLI Commands', () => {
    test('validate setup command works', async () => {
      const projectDir = await createTestProject('javascript');
      const commands = new ValidationCommands({ basePath: projectDir });

      const result = await commands.setupCommand({
        automated: true,
        inputs: { experienceLevel: 'novice', framework: 'javascript' }
      });

      expect(result.success).toBe(true);
      expect(result.setupTime).toBeDefined();
    });

    test('validate check command works', async () => {
      const projectDir = await createTestProject('javascript');

      // First setup
      const commands = new ValidationCommands({ basePath: projectDir });
      await commands.setupCommand({
        automated: true,
        inputs: { experienceLevel: 'novice', framework: 'javascript' }
      });

      // Then check
      const result = await commands.checkCommand({ verbose: true });

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
    });

    test('validate show-config command works', async () => {
      const projectDir = await createTestProject('javascript');

      // First setup
      const commands = new ValidationCommands({ basePath: projectDir });
      await commands.setupCommand({
        automated: true,
        inputs: { experienceLevel: 'novice', framework: 'javascript' }
      });

      // Then show config
      const result = await commands.showConfigCommand();

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
    });

    test('validate enable-hooks command works', async () => {
      const projectDir = await createTestProject('javascript');

      // First setup
      const commands = new ValidationCommands({ basePath: projectDir });
      await commands.setupCommand({
        automated: true,
        inputs: { experienceLevel: 'novice', framework: 'javascript' }
      });

      // Then enable hooks
      const result = await commands.enableHooksCommand();

      expect(result.success).toBe(true);
    });

    test('validate disable-hooks command works', async () => {
      const projectDir = await createTestProject('javascript');

      // Setup and enable hooks first
      const commands = new ValidationCommands({ basePath: projectDir });
      await commands.setupCommand({
        automated: true,
        inputs: { experienceLevel: 'novice', framework: 'javascript' }
      });
      await commands.enableHooksCommand();

      // Then disable hooks
      const result = await commands.disableHooksCommand();

      expect(result.success).toBe(true);
    });

    test('validate add-framework command works', async () => {
      const projectDir = await createTestProject('javascript');

      const commands = new ValidationCommands({ basePath: projectDir });
      await commands.setupCommand({
        automated: true,
        inputs: { experienceLevel: 'expert', framework: 'javascript' }
      });

      // Add custom framework
      const result = await commands.addFrameworkCommand({
        automated: true,
        inputs: {
          name: 'Custom Test Framework',
          filePatterns: ['*.test', '*.spec'],
          testingFramework: 'unit',
          truthThreshold: 0.75
        }
      });

      expect(result.success).toBe(true);
      expect(result.framework).toBeDefined();
    });

    test('validate configure-gates command works', async () => {
      const projectDir = await createTestProject('javascript');

      const commands = new ValidationCommands({ basePath: projectDir });
      await commands.setupCommand({
        automated: true,
        inputs: { experienceLevel: 'intermediate', framework: 'javascript' }
      });

      // Configure quality gates
      const result = await commands.configureGatesCommand({
        automated: true,
        inputs: {
          truthScore: 0.85,
          testCoverage: 90,
          codeQuality: 'A',
          documentationCoverage: 80
        }
      });

      expect(result.success).toBe(true);
      expect(result.qualityGates).toBeDefined();
    });
  });

  describe('Configuration Persistence', () => {
    test('configuration persists across sessions', async () => {
      const projectDir = await createTestProject('javascript');

      // Setup initial configuration
      const commands1 = new ValidationCommands({ basePath: projectDir });
      const setupResult = await commands1.setupCommand({
        automated: true,
        inputs: { experienceLevel: 'novice', framework: 'javascript' }
      });

      expect(setupResult.success).toBe(true);

      // Create new instance and verify config persists
      const commands2 = new ValidationCommands({ basePath: projectDir });
      const showResult = await commands2.showConfigCommand();

      expect(showResult.success).toBe(true);
      expect(showResult.config.setupDate).toBeDefined();
      expect(showResult.config.experienceLevel).toBe('novice');
    });

    test('configuration can be migrated and updated', async () => {
      const projectDir = await createTestProject('javascript');

      const commands = new ValidationCommands({ basePath: projectDir });

      // Initial setup
      await commands.setupCommand({
        automated: true,
        inputs: { experienceLevel: 'novice', framework: 'javascript' }
      });

      // Update quality gates
      const updateResult = await commands.configureGatesCommand({
        automated: true,
        inputs: {
          truthScore: 0.95,
          testCoverage: 95,
          codeQuality: 'A',
          documentationCoverage: 90
        }
      });

      expect(updateResult.success).toBe(true);

      // Verify updates persisted
      const showResult = await commands.showConfigCommand();
      expect(showResult.config.qualityGates.truthScore).toBe(0.95);
      expect(showResult.config.qualityGates.testCoverage).toBe(95);
    });
  });

  describe('Byzantine Security Integration', () => {
    test('configuration validation includes Byzantine checks', async () => {
      const configManager = new TruthConfigManager({
        configDir: TEMP_CONFIG_DIR
      });
      await configManager.initialize();

      // Create a valid configuration
      const config = await configManager.createFromFramework('TDD');

      // Validate with Byzantine checks
      const validation = await configManager.validateConfiguration(config);

      expect(validation.valid).toBe(true);
      expect(validation.byzantineFaultTolerant).toBe(true);
      expect(validation.validationId).toBeDefined();

      await configManager.cleanup();
    });

    test('malicious configuration patterns are detected', async () => {
      const configManager = new TruthConfigManager({
        configDir: TEMP_CONFIG_DIR
      });
      await configManager.initialize();

      // Create malicious configuration
      const maliciousConfig = {
        framework: 'TDD',
        threshold: 0.01, // Suspiciously low
        weights: {
          agentReliability: 0.95, // Excessive concentration
          crossValidation: 0.01,
          externalVerification: 0.01,
          factualConsistency: 0.02,
          logicalCoherence: 0.01
        },
        checks: {
          historicalValidation: false,
          crossAgentValidation: false,
          externalValidation: false,
          logicalValidation: false,
          statisticalValidation: false
        },
        confidence: {
          level: 0.5,
          minSampleSize: 1,
          maxErrorMargin: 0.5
        }
      };

      const validation = await configManager.validateConfiguration(maliciousConfig);

      expect(validation.valid).toBe(false);
      expect(validation.byzantineFaultTolerant).toBe(false);
      expect(validation.warnings.length).toBeGreaterThan(0);

      await configManager.cleanup();
    });
  });

  describe('Performance Requirements', () => {
    test('framework detection completes within reasonable time', async () => {
      const projectDir = await createTestProject('typescript');
      const startTime = Date.now();

      const detector = new FrameworkDetector({ basePath: projectDir });
      await detector.initialize();
      const result = await detector.detectFramework();
      await detector.close();

      const detectionTime = Date.now() - startTime;

      expect(detectionTime).toBeLessThan(10000); // Less than 10 seconds
      expect(result.metadata.detectionTime).toBeLessThan(5000); // Less than 5 seconds
    });

    test('setup wizard components load efficiently', async () => {
      const startTime = Date.now();

      const wizard = new InteractiveSetupWizard({
        basePath: await createTestProject('javascript')
      });

      const initTime = Date.now() - startTime;

      await wizard.cleanup();

      expect(initTime).toBeLessThan(2000); // Less than 2 seconds to initialize
    });
  });
});

// Test utility functions

async function createTestProject(type) {
  const projectDir = path.join(TEST_PROJECT_DIR, `${type}-${Date.now()}`);
  await fs.mkdir(projectDir, { recursive: true });

  switch (type) {
    case 'javascript':
      await createJavaScriptProject(projectDir);
      break;
    case 'typescript':
      await createTypeScriptProject(projectDir);
      break;
    case 'python':
      await createPythonProject(projectDir);
      break;
    case 'react':
      await createReactProject(projectDir);
      break;
    case 'django':
      await createDjangoProject(projectDir);
      break;
  }

  return projectDir;
}

async function createJavaScriptProject(dir) {
  const packageJson = {
    name: 'test-js-project',
    version: '1.0.0',
    main: 'index.js',
    scripts: {
      test: 'jest',
      start: 'node index.js'
    },
    devDependencies: {
      jest: '^29.0.0'
    }
  };

  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  await fs.writeFile(
    path.join(dir, 'index.js'),
    `
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello World!');
});

module.exports = app;
    `
  );

  await fs.writeFile(
    path.join(dir, 'index.test.js'),
    `
describe('App', () => {
  test('should work', () => {
    expect(true).toBe(true);
  });
});
    `
  );
}

async function createTypeScriptProject(dir) {
  const packageJson = {
    name: 'test-ts-project',
    version: '1.0.0',
    main: 'dist/index.js',
    scripts: {
      build: 'tsc',
      test: 'jest'
    },
    devDependencies: {
      typescript: '^5.0.0',
      '@types/node': '^20.0.0',
      jest: '^29.0.0',
      'ts-jest': '^29.0.0'
    }
  };

  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  const tsConfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      outDir: './dist',
      rootDir: './src',
      strict: true
    }
  };

  await fs.writeFile(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(tsConfig, null, 2)
  );

  await fs.mkdir(path.join(dir, 'src'));

  await fs.writeFile(
    path.join(dir, 'src', 'index.ts'),
    `
interface User {
  id: number;
  name: string;
}

export class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  getUser(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }
}
    `
  );

  await fs.writeFile(
    path.join(dir, 'src', 'index.test.ts'),
    `
import { UserService } from './index.js';

describe('UserService', () => {
  test('should add and retrieve user', () => {
    const service = new UserService();
    const user = { id: 1, name: 'Test User' };

    service.addUser(user);
    const retrieved = service.getUser(1);

    expect(retrieved).toEqual(user);
  });
});
    `
  );
}

async function createPythonProject(dir) {
  await fs.writeFile(
    path.join(dir, 'requirements.txt'),
    `
pytest>=7.0.0
requests>=2.28.0
    `
  );

  await fs.writeFile(
    path.join(dir, 'setup.py'),
    `
from setuptools import setup, find_packages

setup(
    name="test-python-project",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "requests>=2.28.0",
    ],
)
    `
  );

  await fs.writeFile(
    path.join(dir, 'main.py'),
    `
import requests

def get_user(user_id):
    """Get user data from API."""
    response = requests.get(f"https://api.example.com/users/{user_id}")
    return response.json()

if __name__ == "__main__":
    user = get_user(1)
    print(f"User: {user}")
    `
  );

  await fs.writeFile(
    path.join(dir, 'test_main.py'),
    `
import pytest
from main import get_user

def test_get_user():
    """Test user retrieval function."""
    # This would normally mock the API call
    assert callable(get_user)
    `
  );
}

async function createReactProject(dir) {
  const packageJson = {
    name: 'test-react-project',
    version: '1.0.0',
    scripts: {
      start: 'react-scripts start',
      test: 'react-scripts test'
    },
    dependencies: {
      react: '^18.0.0',
      'react-dom': '^18.0.0'
    },
    devDependencies: {
      'react-scripts': '^5.0.0',
      '@types/react': '^18.0.0'
    }
  };

  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  await fs.mkdir(path.join(dir, 'src'));
  await fs.mkdir(path.join(dir, 'public'));

  await fs.writeFile(
    path.join(dir, 'src', 'App.jsx'),
    `
import React from 'react';

function App() {
  return (
    <div className="App">
      <h1>Hello React!</h1>
    </div>
  );
}

export default App;
    `
  );

  await fs.writeFile(
    path.join(dir, 'public', 'index.html'),
    `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
    `
  );
}

async function createDjangoProject(dir) {
  await fs.writeFile(
    path.join(dir, 'requirements.txt'),
    `
Django>=4.0.0
pytest-django>=4.5.0
    `
  );

  await fs.writeFile(
    path.join(dir, 'manage.py'),
    `
#!/usr/bin/env python
import os
import sys

if __name__ == '__main__':
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)
    `
  );

  await fs.mkdir(path.join(dir, 'myproject'));

  await fs.writeFile(
    path.join(dir, 'myproject', 'settings.py'),
    `
from django.conf import settings

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': 'db.sqlite3',
    }
}

SECRET_KEY = 'test-secret-key'
DEBUG = True
    `
  );

  await fs.writeFile(
    path.join(dir, 'myproject', 'models.py'),
    `
from django.db import models

class User(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField()

    def __str__(self):
        return self.name
    `
  );
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}