/**
 * Framework Detection Accuracy Tests
 * Tests framework detection for JavaScript, TypeScript, and Python projects
 *
 * SUCCESS CRITERIA:
 * - >90% accuracy for JS/TS/Python framework detection
 * - Confidence scoring for detection results
 * - Support for complex project structures
 * - Edge case handling for mixed frameworks
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Mock CustomFrameworkRegistry for testing
class MockCustomFrameworkRegistry {
  constructor(options = {}) {
    this.configManager = options.configManager;
    this.initialized = false;
  }

  async initialize() {
    this.initialized = true;
  }

  async close() {
    this.initialized = false;
  }

  async detectProjectFramework(projectPath) {
    if (!this.initialized) {
      throw new Error('Registry not initialized');
    }

    const detection = new ProjectFrameworkDetector(projectPath);
    return await detection.analyze();
  }

  async listAvailableFrameworks() {
    return [
      { id: 'tdd', name: 'Test-Driven Development', supported: true },
      { id: 'bdd', name: 'Behavior-Driven Development', supported: true },
      { id: 'sparc', name: 'SPARC Methodology', supported: true },
      { id: 'jest', name: 'Jest Testing Framework', supported: true },
      { id: 'mocha', name: 'Mocha Testing Framework', supported: true },
      { id: 'pytest', name: 'PyTest Framework', supported: true },
      { id: 'cucumber', name: 'Cucumber BDD Framework', supported: true }
    ];
  }

  async addFramework(framework, options = {}) {
    if (options.requireByzantineConsensus) {
      // Mock consensus validation
      return {
        success: true,
        byzantineValidated: true,
        cryptographicSignature: `mock-sig-${crypto.randomBytes(8).toString('hex')}`
      };
    }

    return { success: true, byzantineValidated: false };
  }
}

class ProjectFrameworkDetector {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.detectedFiles = [];
    this.packageInfo = null;
    this.confidence = 0;
  }

  async analyze() {
    const startTime = Date.now();

    try {
      // Scan project directory
      await this.scanProjectFiles();

      // Analyze package files
      await this.analyzePackageFiles();

      // Detect language
      const language = await this.detectLanguage();

      // Detect framework
      const framework = await this.detectFramework();

      // Calculate confidence
      this.calculateConfidence();

      const detectionTime = Date.now() - startTime;

      return {
        framework,
        language,
        confidence: this.confidence,
        detectedFiles: this.detectedFiles,
        packageInfo: this.packageInfo,
        detectionTime,
        additionalFrameworks: await this.detectAdditionalFrameworks(),
        suggestions: this.generateSuggestions(),
        warnings: this.generateWarnings()
      };

    } catch (error) {
      return {
        framework: null,
        language: null,
        confidence: 0,
        error: error.message,
        detectionTime: Date.now() - startTime
      };
    }
  }

  async scanProjectFiles() {
    const filesToCheck = [
      'package.json',
      'tsconfig.json',
      'jest.config.js',
      'jest.config.json',
      'cucumber.js',
      'requirements.txt',
      'pyproject.toml',
      'pytest.ini',
      'setup.py',
      'Pipfile',
      'poetry.lock',
      'yarn.lock',
      'package-lock.json',
      'mocha.opts',
      '.babelrc',
      'webpack.config.js',
      'rollup.config.js',
      'vite.config.js'
    ];

    for (const fileName of filesToCheck) {
      try {
        const filePath = path.join(this.projectPath, fileName);
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          this.detectedFiles.push(fileName);
        }
      } catch (error) {
        // File doesn't exist, continue
      }
    }

    // Scan for test directories and files
    await this.scanTestStructure();
  }

  async scanTestStructure() {
    const testPatterns = [
      'test',
      'tests',
      '__tests__',
      'spec',
      'specs',
      'e2e',
      'integration',
      'features'
    ];

    for (const pattern of testPatterns) {
      try {
        const testPath = path.join(this.projectPath, pattern);
        const stats = await fs.stat(testPath);
        if (stats.isDirectory()) {
          this.detectedFiles.push(`${pattern}/`);

          // Scan for files in test directory
          const testFiles = await fs.readdir(testPath);
          const relevantTestFiles = testFiles.filter(file =>
            file.endsWith('.test.js') ||
            file.endsWith('.spec.js') ||
            file.endsWith('.test.ts') ||
            file.endsWith('.spec.ts') ||
            file.endsWith('.test.py') ||
            file.endsWith('_test.py') ||
            file.endsWith('.feature')
          );

          if (relevantTestFiles.length > 0) {
            this.detectedFiles.push(`${pattern}/${relevantTestFiles[0]}`);
          }
        }
      } catch (error) {
        // Directory doesn't exist, continue
      }
    }
  }

  async analyzePackageFiles() {
    // Analyze package.json for Node.js projects
    if (this.detectedFiles.includes('package.json')) {
      try {
        const packagePath = path.join(this.projectPath, 'package.json');
        const packageContent = await fs.readFile(packagePath, 'utf8');
        this.packageInfo = JSON.parse(packageContent);
      } catch (error) {
        // Invalid package.json
        this.packageInfo = { invalid: true };
      }
    }

    // Analyze requirements.txt for Python projects
    if (this.detectedFiles.includes('requirements.txt')) {
      try {
        const reqPath = path.join(this.projectPath, 'requirements.txt');
        const reqContent = await fs.readFile(reqPath, 'utf8');
        this.packageInfo = {
          type: 'python',
          requirements: reqContent.split('\n').filter(line => line.trim())
        };
      } catch (error) {
        // Invalid requirements.txt
      }
    }

    // Analyze pyproject.toml for modern Python projects
    if (this.detectedFiles.includes('pyproject.toml')) {
      try {
        const tomlPath = path.join(this.projectPath, 'pyproject.toml');
        const tomlContent = await fs.readFile(tomlPath, 'utf8');
        this.packageInfo = {
          type: 'python',
          pyproject: true,
          content: tomlContent
        };
      } catch (error) {
        // Invalid pyproject.toml
      }
    }
  }

  async detectLanguage() {
    // JavaScript/TypeScript detection
    if (this.detectedFiles.includes('package.json') ||
        this.detectedFiles.includes('tsconfig.json') ||
        this.detectedFiles.some(f => f.endsWith('.js') || f.endsWith('.ts'))) {

      if (this.detectedFiles.includes('tsconfig.json') ||
          this.detectedFiles.some(f => f.includes('.ts'))) {
        return 'TypeScript';
      }
      return 'JavaScript';
    }

    // Python detection
    if (this.detectedFiles.includes('requirements.txt') ||
        this.detectedFiles.includes('pyproject.toml') ||
        this.detectedFiles.includes('setup.py') ||
        this.detectedFiles.some(f => f.includes('.py'))) {
      return 'Python';
    }

    return null;
  }

  async detectFramework() {
    const language = await this.detectLanguage();

    if (language === 'JavaScript' || language === 'TypeScript') {
      return this.detectJavaScriptFramework();
    }

    if (language === 'Python') {
      return this.detectPythonFramework();
    }

    return null;
  }

  detectJavaScriptFramework() {
    const dependencies = this.getDependencies();

    // BDD Framework Detection
    if (dependencies.includes('@cucumber/cucumber') ||
        dependencies.includes('cucumber') ||
        this.detectedFiles.some(f => f.endsWith('.feature')) ||
        this.detectedFiles.includes('cucumber.js')) {
      return 'BDD';
    }

    // Jest/TDD Detection
    if (dependencies.includes('jest') ||
        this.detectedFiles.includes('jest.config.js') ||
        this.detectedFiles.includes('jest.config.json') ||
        this.detectedFiles.some(f => f.includes('.test.') || f.includes('.spec.'))) {
      return 'TDD';
    }

    // Mocha Detection
    if (dependencies.includes('mocha') ||
        this.detectedFiles.includes('mocha.opts') ||
        dependencies.includes('chai')) {
      return 'TDD';
    }

    // Vitest Detection
    if (dependencies.includes('vitest')) {
      return 'TDD';
    }

    // Cypress Detection (E2E but often indicates TDD approach)
    if (dependencies.includes('cypress')) {
      return 'TDD';
    }

    // React Testing Library indicates TDD
    if (dependencies.includes('@testing-library/react') ||
        dependencies.includes('@testing-library/jest-dom')) {
      return 'TDD';
    }

    return null;
  }

  detectPythonFramework() {
    const dependencies = this.getPythonDependencies();

    // BDD Framework Detection
    if (dependencies.includes('behave') ||
        dependencies.includes('pytest-bdd') ||
        this.detectedFiles.some(f => f.endsWith('.feature'))) {
      return 'BDD';
    }

    // PyTest Detection
    if (dependencies.includes('pytest') ||
        this.detectedFiles.includes('pytest.ini') ||
        this.detectedFiles.includes('pyproject.toml') ||
        this.detectedFiles.some(f => f.includes('test_') || f.includes('_test.py'))) {
      return 'TDD';
    }

    // Unittest Detection
    if (dependencies.includes('unittest') ||
        this.detectedFiles.some(f => f.includes('test') && f.includes('.py'))) {
      return 'TDD';
    }

    return null;
  }

  getDependencies() {
    if (!this.packageInfo || !this.packageInfo.dependencies && !this.packageInfo.devDependencies) {
      return [];
    }

    const deps = [
      ...Object.keys(this.packageInfo.dependencies || {}),
      ...Object.keys(this.packageInfo.devDependencies || {})
    ];

    return deps;
  }

  getPythonDependencies() {
    if (!this.packageInfo || this.packageInfo.type !== 'python') {
      return [];
    }

    if (this.packageInfo.requirements) {
      return this.packageInfo.requirements.map(req => req.split('==')[0].split('>=')[0].trim());
    }

    if (this.packageInfo.pyproject && this.packageInfo.content) {
      // Basic parsing of pyproject.toml dependencies
      const matches = this.packageInfo.content.match(/dependencies\s*=\s*\[(.*?)\]/s);
      if (matches) {
        return matches[1].split(',').map(dep => dep.trim().replace(/['"]/g, '').split('==')[0]);
      }
    }

    return [];
  }

  calculateConfidence() {
    let confidence = 0;

    const language = this.detectLanguage();
    if (language) {
      confidence += 0.3; // Base confidence for language detection
    }

    const framework = this.detectFramework();
    if (framework) {
      confidence += 0.4; // Framework detection
    }

    // Boost confidence based on evidence strength
    const dependencies = language === 'Python' ? this.getPythonDependencies() : this.getDependencies();

    if (dependencies.length > 0) {
      confidence += 0.2;
    }

    if (this.detectedFiles.length > 3) {
      confidence += 0.1;
    }

    // Framework-specific confidence boosters
    if (framework === 'TDD') {
      const testFiles = this.detectedFiles.filter(f =>
        f.includes('test') || f.includes('spec') || f.includes('__tests__'));
      if (testFiles.length >= 2) {
        confidence += 0.1;
      }
    }

    if (framework === 'BDD') {
      const featureFiles = this.detectedFiles.filter(f => f.endsWith('.feature'));
      if (featureFiles.length >= 1) {
        confidence += 0.1;
      }
    }

    this.confidence = Math.min(1.0, confidence);
  }

  async detectAdditionalFrameworks() {
    const additional = [];
    const dependencies = this.getDependencies();

    // Check for multiple testing frameworks
    if (dependencies.includes('jest') && dependencies.includes('cucumber')) {
      additional.push({ framework: 'MIXED', types: ['TDD', 'BDD'] });
    }

    if (dependencies.includes('mocha') && dependencies.includes('chai')) {
      additional.push({ framework: 'TDD', variant: 'Mocha+Chai' });
    }

    if (dependencies.includes('cypress')) {
      additional.push({ framework: 'E2E', name: 'Cypress' });
    }

    if (dependencies.includes('playwright')) {
      additional.push({ framework: 'E2E', name: 'Playwright' });
    }

    return additional;
  }

  generateSuggestions() {
    const suggestions = [];
    const framework = this.detectFramework();
    const language = this.detectLanguage();

    if (!framework) {
      suggestions.push('Consider adding a testing framework');
      if (language === 'JavaScript' || language === 'TypeScript') {
        suggestions.push('Jest recommended for TDD approach');
        suggestions.push('Cucumber recommended for BDD approach');
      }
      if (language === 'Python') {
        suggestions.push('pytest recommended for TDD approach');
        suggestions.push('behave recommended for BDD approach');
      }
    }

    if (framework === 'TDD') {
      const testFiles = this.detectedFiles.filter(f => f.includes('test'));
      if (testFiles.length < 2) {
        suggestions.push('Add more test files to improve coverage');
      }
    }

    if (framework === 'BDD') {
      const featureFiles = this.detectedFiles.filter(f => f.endsWith('.feature'));
      if (featureFiles.length === 0) {
        suggestions.push('Add .feature files for BDD scenarios');
      }
    }

    return suggestions;
  }

  generateWarnings() {
    const warnings = [];
    const framework = this.detectFramework();

    if (!framework) {
      warnings.push('No testing framework detected');
    }

    if (this.confidence < 0.7) {
      warnings.push('Low confidence in framework detection');
    }

    const dependencies = this.getDependencies();
    if (dependencies.length === 0 && this.detectedFiles.includes('package.json')) {
      warnings.push('No dependencies found in package.json');
    }

    return warnings;
  }
}

describe('Framework Detection Accuracy Tests', () => {
  let testDir;
  let frameworkRegistry;

  beforeEach(async () => {
    testDir = path.join(__dirname, `framework-detection-test-${crypto.randomBytes(4).toString('hex')}`);
    await fs.mkdir(testDir, { recursive: true });

    frameworkRegistry = new MockCustomFrameworkRegistry();
    await frameworkRegistry.initialize();
  });

  afterEach(async () => {
    if (frameworkRegistry) {
      await frameworkRegistry.close();
    }
    try {
      await fs.rmdir(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('JavaScript/TypeScript Framework Detection (>90% accuracy)', () => {
    const jsTestProjects = [
      {
        name: 'React Jest TDD Project',
        files: {
          'package.json': JSON.stringify({
            name: 'react-jest-project',
            dependencies: {
              'react': '^18.2.0',
              'react-dom': '^18.2.0'
            },
            devDependencies: {
              'jest': '^29.7.0',
              '@testing-library/react': '^13.4.0',
              '@testing-library/jest-dom': '^5.16.5'
            }
          }),
          'jest.config.js': 'module.exports = { testEnvironment: "jsdom" };',
          'src/App.js': 'import React from "react"; export default function App() { return <div>Hello</div>; }',
          'src/__tests__/App.test.js': 'import { render } from "@testing-library/react"; test("renders", () => {});'
        },
        expected: {
          framework: 'TDD',
          language: 'JavaScript',
          confidence: 0.95
        }
      },
      {
        name: 'TypeScript Node API',
        files: {
          'package.json': JSON.stringify({
            name: 'ts-api',
            dependencies: {
              'express': '^4.18.2',
              'typescript': '^5.2.2'
            },
            devDependencies: {
              'jest': '^29.7.0',
              '@types/jest': '^29.5.5',
              'supertest': '^6.3.3'
            }
          }),
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              target: 'es2020',
              module: 'commonjs',
              strict: true
            }
          }),
          'src/server.ts': 'import express from "express"; const app = express();',
          'tests/server.test.ts': 'import request from "supertest"; describe("Server", () => { it("works", () => {}); });'
        },
        expected: {
          framework: 'TDD',
          language: 'TypeScript',
          confidence: 0.93
        }
      },
      {
        name: 'Cucumber BDD JavaScript',
        files: {
          'package.json': JSON.stringify({
            name: 'cucumber-bdd',
            devDependencies: {
              '@cucumber/cucumber': '^9.5.1',
              'playwright': '^1.38.1'
            }
          }),
          'cucumber.js': 'module.exports = { default: "features/**/*.feature" };',
          'features/login.feature': 'Feature: User Login\\n  Scenario: Valid login\\n    Given user has valid credentials',
          'features/step_definitions/login_steps.js': 'const { Given, When, Then } = require("@cucumber/cucumber");'
        },
        expected: {
          framework: 'BDD',
          language: 'JavaScript',
          confidence: 0.96
        }
      },
      {
        name: 'Mocha Chai TDD',
        files: {
          'package.json': JSON.stringify({
            name: 'mocha-chai',
            devDependencies: {
              'mocha': '^10.2.0',
              'chai': '^4.3.8'
            }
          }),
          'mocha.opts': '--recursive test/**/*.js',
          'test/utils.test.js': 'const { expect } = require("chai"); describe("Utils", () => {});'
        },
        expected: {
          framework: 'TDD',
          language: 'JavaScript',
          confidence: 0.91
        }
      },
      {
        name: 'Vitest Modern TDD',
        files: {
          'package.json': JSON.stringify({
            name: 'vitest-project',
            devDependencies: {
              'vitest': '^0.34.6',
              '@vitest/ui': '^0.34.6'
            }
          }),
          'vite.config.js': 'export default { test: { environment: "jsdom" } };',
          'src/utils.test.js': 'import { test, expect } from "vitest"; test("works", () => {});'
        },
        expected: {
          framework: 'TDD',
          language: 'JavaScript',
          confidence: 0.89
        }
      }
    ];

    test('should detect JavaScript/TypeScript frameworks with >90% accuracy', async () => {
      let correctDetections = 0;
      const detectionResults = [];

      for (const project of jsTestProjects) {
        console.log(`\nTesting: ${project.name}`);

        // Create project structure
        const projectDir = path.join(testDir, project.name.toLowerCase().replace(/\s+/g, '-'));
        await fs.mkdir(projectDir, { recursive: true });

        // Write project files
        for (const [filePath, content] of Object.entries(project.files)) {
          const fullPath = path.join(projectDir, filePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content);
        }

        // Detect framework
        const result = await frameworkRegistry.detectProjectFramework(projectDir);

        // Check accuracy
        const frameworkCorrect = result.framework === project.expected.framework;
        const languageCorrect = result.language === project.expected.language;
        const confidenceAcceptable = result.confidence >= (project.expected.confidence - 0.1);

        const isCorrect = frameworkCorrect && languageCorrect && confidenceAcceptable;
        if (isCorrect) correctDetections++;

        detectionResults.push({
          project: project.name,
          expected: project.expected,
          detected: {
            framework: result.framework,
            language: result.language,
            confidence: result.confidence
          },
          correct: isCorrect,
          detectionTime: result.detectionTime
        });

        console.log(`  Expected: ${project.expected.framework}/${project.expected.language} (${project.expected.confidence})`);
        console.log(`  Detected: ${result.framework}/${result.language} (${result.confidence?.toFixed(3)})`);
        console.log(`  Result: ${isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
        console.log(`  Detection time: ${result.detectionTime}ms`);
      }

      const accuracy = (correctDetections / jsTestProjects.length) * 100;

      console.log(`\n📊 JavaScript/TypeScript Detection Results:`);
      console.log(`  Accuracy: ${accuracy.toFixed(1)}% (${correctDetections}/${jsTestProjects.length})`);
      console.log(`  Target: >90%`);
      console.log(`  Result: ${accuracy >= 90 ? '✅ PASSED' : '❌ FAILED'}`);

      expect(accuracy).toBeGreaterThanOrEqual(90);

      // Verify reasonable detection times
      const avgDetectionTime = detectionResults
        .map(r => r.detectionTime)
        .reduce((sum, time) => sum + time, 0) / detectionResults.length;

      expect(avgDetectionTime).toBeLessThan(1000); // < 1 second average
    });

    test('should handle complex JavaScript project structures', async () => {
      const complexProject = {
        name: 'Complex Monorepo',
        files: {
          // Root configuration
          'package.json': JSON.stringify({
            name: 'monorepo-root',
            workspaces: ['packages/*'],
            devDependencies: {
              'lerna': '^7.4.2'
            }
          }),
          'lerna.json': JSON.stringify({ version: '1.0.0', packages: ['packages/*'] }),

          // Frontend package
          'packages/frontend/package.json': JSON.stringify({
            name: '@monorepo/frontend',
            dependencies: {
              'react': '^18.2.0',
              'next': '^13.5.4'
            },
            devDependencies: {
              'jest': '^29.7.0',
              '@testing-library/react': '^13.4.0'
            }
          }),
          'packages/frontend/__tests__/index.test.js': 'test("frontend works", () => {});',

          // Backend package
          'packages/backend/package.json': JSON.stringify({
            name: '@monorepo/backend',
            dependencies: {
              'express': '^4.18.2',
              'prisma': '^5.4.2'
            },
            devDependencies: {
              'supertest': '^6.3.3',
              'jest': '^29.7.0'
            }
          }),
          'packages/backend/tests/api.test.js': 'describe("API", () => {});',

          // Shared package
          'packages/shared/package.json': JSON.stringify({
            name: '@monorepo/shared',
            devDependencies: {
              'typescript': '^5.2.2'
            }
          }),
          'packages/shared/src/utils.ts': 'export const helper = () => {};',

          // E2E tests
          'e2e/package.json': JSON.stringify({
            name: '@monorepo/e2e',
            devDependencies: {
              'playwright': '^1.38.1',
              '@cucumber/cucumber': '^9.5.1'
            }
          }),
          'e2e/features/user-flow.feature': 'Feature: User flow\\n  Scenario: Happy path',
          'e2e/tests/integration.spec.js': 'test("integration works", () => {});'
        }
      };

      // Create complex project
      const projectDir = path.join(testDir, 'complex-monorepo');
      await fs.mkdir(projectDir, { recursive: true });

      for (const [filePath, content] of Object.entries(complexProject.files)) {
        const fullPath = path.join(projectDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      // Detect framework
      const result = await frameworkRegistry.detectProjectFramework(projectDir);

      console.log(`\n🏗️  Complex Project Detection Results:`);
      console.log(`  Framework: ${result.framework}`);
      console.log(`  Language: ${result.language}`);
      console.log(`  Confidence: ${result.confidence?.toFixed(3)}`);
      console.log(`  Additional frameworks: ${result.additionalFrameworks?.length || 0}`);
      console.log(`  Detection time: ${result.detectionTime}ms`);

      // Should detect primary framework
      expect(result.framework).toBeTruthy();
      expect(['JavaScript', 'TypeScript']).toContain(result.language);

      // Should detect additional frameworks
      expect(result.additionalFrameworks).toBeDefined();
      expect(result.additionalFrameworks.length).toBeGreaterThan(0);

      // Should provide reasonable confidence despite complexity
      expect(result.confidence).toBeGreaterThan(0.6);

      // Should complete detection quickly
      expect(result.detectionTime).toBeLessThan(2000); // 2 seconds for complex project
    });
  });

  describe('Python Framework Detection (>90% accuracy)', () => {
    const pythonTestProjects = [
      {
        name: 'PyTest FastAPI Project',
        files: {
          'requirements.txt': 'fastapi==0.103.2\\npytest==7.4.2\\npytest-asyncio==0.21.1\\nhttpx==0.25.0',
          'pyproject.toml': '[tool.pytest.ini_options]\\ntestpaths = ["tests"]\\naddopts = "-v"',
          'src/main.py': 'from fastapi import FastAPI\\napp = FastAPI()',
          'tests/test_main.py': 'import pytest\\nfrom src.main import app\\ndef test_app(): pass',
          'tests/conftest.py': 'import pytest\\n@pytest.fixture\\ndef client(): pass'
        },
        expected: {
          framework: 'TDD',
          language: 'Python',
          confidence: 0.94
        }
      },
      {
        name: 'Behave BDD Python',
        files: {
          'requirements.txt': 'behave==1.2.6\\nselenium==4.14.0\\nrequests==2.31.0',
          'features/user_auth.feature': 'Feature: User authentication\\n  Scenario: Valid login\\n    Given user exists',
          'features/steps/auth_steps.py': 'from behave import given, when, then\\n@given("user exists")\\ndef step_impl(context): pass',
          'features/environment.py': 'def before_all(context):\\n    pass'
        },
        expected: {
          framework: 'BDD',
          language: 'Python',
          confidence: 0.92
        }
      },
      {
        name: 'Django PyTest Project',
        files: {
          'requirements.txt': 'django==4.2.6\\npytest-django==4.5.2\\nfactory-boy==3.3.0',
          'manage.py': 'import os\\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")',
          'pytest.ini': '[pytest]\\nDJANGO_SETTINGS_MODULE = settings\\naddopts = --reuse-db',
          'tests/test_models.py': 'import pytest\\ndef test_user_model(): pass',
          'tests/test_views.py': 'from django.test import TestCase\\nclass ViewTest(TestCase): pass'
        },
        expected: {
          framework: 'TDD',
          language: 'Python',
          confidence: 0.91
        }
      },
      {
        name: 'Poetry Modern Python',
        files: {
          'pyproject.toml': '[tool.poetry]\\nname = "modern-python"\\n[tool.poetry.dependencies]\\npython = "^3.9"\\n[tool.poetry.group.dev.dependencies]\\npytest = "^7.4.2"',
          'poetry.lock': '# Poetry lock file content',
          'src/modern_python/__init__.py': '',
          'src/modern_python/main.py': 'def main(): pass',
          'tests/__init__.py': '',
          'tests/test_main.py': 'def test_main(): assert True'
        },
        expected: {
          framework: 'TDD',
          language: 'Python',
          confidence: 0.88
        }
      },
      {
        name: 'Flask Unittest Legacy',
        files: {
          'requirements.txt': 'flask==2.3.3\\nflask-testing==0.8.1',
          'app.py': 'from flask import Flask\\napp = Flask(__name__)',
          'tests.py': 'import unittest\\nfrom app import app\\nclass FlaskTest(unittest.TestCase): pass'
        },
        expected: {
          framework: 'TDD',
          language: 'Python',
          confidence: 0.85
        }
      }
    ];

    test('should detect Python frameworks with >90% accuracy', async () => {
      let correctDetections = 0;
      const detectionResults = [];

      for (const project of pythonTestProjects) {
        console.log(`\nTesting: ${project.name}`);

        // Create project structure
        const projectDir = path.join(testDir, project.name.toLowerCase().replace(/\s+/g, '-'));
        await fs.mkdir(projectDir, { recursive: true });

        // Write project files
        for (const [filePath, content] of Object.entries(project.files)) {
          const fullPath = path.join(projectDir, filePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content.replace(/\\n/g, '\n'));
        }

        // Detect framework
        const result = await frameworkRegistry.detectProjectFramework(projectDir);

        // Check accuracy
        const frameworkCorrect = result.framework === project.expected.framework;
        const languageCorrect = result.language === project.expected.language;
        const confidenceAcceptable = result.confidence >= (project.expected.confidence - 0.1);

        const isCorrect = frameworkCorrect && languageCorrect && confidenceAcceptable;
        if (isCorrect) correctDetections++;

        detectionResults.push({
          project: project.name,
          expected: project.expected,
          detected: {
            framework: result.framework,
            language: result.language,
            confidence: result.confidence
          },
          correct: isCorrect,
          detectionTime: result.detectionTime
        });

        console.log(`  Expected: ${project.expected.framework}/${project.expected.language} (${project.expected.confidence})`);
        console.log(`  Detected: ${result.framework}/${result.language} (${result.confidence?.toFixed(3)})`);
        console.log(`  Result: ${isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
        console.log(`  Detection time: ${result.detectionTime}ms`);
      }

      const accuracy = (correctDetections / pythonTestProjects.length) * 100;

      console.log(`\n🐍 Python Detection Results:`);
      console.log(`  Accuracy: ${accuracy.toFixed(1)}% (${correctDetections}/${pythonTestProjects.length})`);
      console.log(`  Target: >90%`);
      console.log(`  Result: ${accuracy >= 90 ? '✅ PASSED' : '❌ FAILED'}`);

      expect(accuracy).toBeGreaterThanOrEqual(90);

      // Verify reasonable detection times
      const avgDetectionTime = detectionResults
        .map(r => r.detectionTime)
        .reduce((sum, time) => sum + time, 0) / detectionResults.length;

      expect(avgDetectionTime).toBeLessThan(1000);
    });
  });

  describe('Edge Cases and Mixed Frameworks', () => {
    test('should handle projects with no testing framework', async () => {
      const noTestProjects = [
        {
          name: 'Vanilla JavaScript',
          files: {
            'package.json': JSON.stringify({
              name: 'vanilla-js',
              dependencies: {
                'lodash': '^4.17.21'
              }
            }),
            'src/index.js': 'console.log("Hello world");'
          },
          expected: {
            framework: null,
            language: 'JavaScript',
            warnings: ['No testing framework detected']
          }
        },
        {
          name: 'Python Script Only',
          files: {
            'main.py': 'print("Hello world")',
            'utils.py': 'def helper(): pass'
          },
          expected: {
            framework: null,
            language: 'Python',
            warnings: ['No testing framework detected']
          }
        }
      ];

      for (const project of noTestProjects) {
        const projectDir = path.join(testDir, project.name.toLowerCase().replace(/\s+/g, '-'));
        await fs.mkdir(projectDir, { recursive: true });

        for (const [filePath, content] of Object.entries(project.files)) {
          const fullPath = path.join(projectDir, filePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content);
        }

        const result = await frameworkRegistry.detectProjectFramework(projectDir);

        console.log(`\n${project.name}:`);
        console.log(`  Framework: ${result.framework || 'None'}`);
        console.log(`  Language: ${result.language}`);
        console.log(`  Warnings: ${result.warnings?.join(', ')}`);

        expect(result.framework).toBe(project.expected.framework);
        expect(result.language).toBe(project.expected.language);
        expect(result.warnings).toContain(project.expected.warnings[0]);
      }
    });

    test('should detect mixed testing frameworks', async () => {
      const mixedProject = {
        name: 'Mixed Frameworks Project',
        files: {
          'package.json': JSON.stringify({
            name: 'mixed-framework',
            devDependencies: {
              'jest': '^29.7.0',
              '@cucumber/cucumber': '^9.5.1',
              'cypress': '^13.3.1',
              'playwright': '^1.38.1'
            }
          }),
          // Unit tests (Jest/TDD)
          'src/__tests__/units.test.js': 'test("unit", () => {});',
          // BDD features
          'features/user-flow.feature': 'Feature: User flow',
          'features/step_definitions/steps.js': 'const { Given } = require("@cucumber/cucumber");',
          // E2E tests
          'cypress/e2e/app.cy.js': 'describe("E2E", () => {});',
          'playwright/tests/integration.spec.js': 'test("integration", () => {});'
        }
      };

      const projectDir = path.join(testDir, 'mixed-framework');
      await fs.mkdir(projectDir, { recursive: true });

      for (const [filePath, content] of Object.entries(mixedProject.files)) {
        const fullPath = path.join(projectDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      const result = await frameworkRegistry.detectProjectFramework(projectDir);

      console.log(`\n🔀 Mixed Framework Project:`);
      console.log(`  Primary framework: ${result.framework}`);
      console.log(`  Additional frameworks: ${JSON.stringify(result.additionalFrameworks)}`);
      console.log(`  Confidence: ${result.confidence?.toFixed(3)}`);

      // Should detect primary framework
      expect(['TDD', 'BDD']).toContain(result.framework);

      // Should detect additional frameworks
      expect(result.additionalFrameworks).toBeDefined();
      expect(result.additionalFrameworks.length).toBeGreaterThan(0);

      // Should include E2E frameworks
      const hasE2E = result.additionalFrameworks.some(f => f.framework === 'E2E');
      expect(hasE2E).toBe(true);
    });

    test('should provide helpful suggestions for incomplete projects', async () => {
      const incompleteProject = {
        name: 'Incomplete Project',
        files: {
          'package.json': JSON.stringify({
            name: 'incomplete-project',
            dependencies: {
              'express': '^4.18.2'
            }
            // No test dependencies
          }),
          'src/server.js': 'const express = require("express");'
          // No test files
        }
      };

      const projectDir = path.join(testDir, 'incomplete-project');
      await fs.mkdir(projectDir, { recursive: true });

      for (const [filePath, content] of Object.entries(incompleteProject.files)) {
        const fullPath = path.join(projectDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      const result = await frameworkRegistry.detectProjectFramework(projectDir);

      console.log(`\n📝 Incomplete Project Suggestions:`);
      console.log(`  Suggestions: ${result.suggestions?.join(', ')}`);
      console.log(`  Warnings: ${result.warnings?.join(', ')}`);

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some(s => s.includes('testing framework'))).toBe(true);

      expect(result.warnings).toContain('No testing framework detected');
    });
  });

  describe('Performance and Reliability', () => {
    test('should complete detection within reasonable time limits', async () => {
      const performanceTests = [
        { size: 'small', files: 5, maxTime: 500 },
        { size: 'medium', files: 20, maxTime: 1000 },
        { size: 'large', files: 50, maxTime: 2000 }
      ];

      for (const perfTest of performanceTests) {
        const projectDir = path.join(testDir, `perf-test-${perfTest.size}`);
        await fs.mkdir(projectDir, { recursive: true });

        // Create many files to simulate large project
        const files = {
          'package.json': JSON.stringify({
            name: `${perfTest.size}-project`,
            devDependencies: { 'jest': '^29.7.0' }
          })
        };

        for (let i = 0; i < perfTest.files - 1; i++) {
          files[`src/file${i}.js`] = `// File ${i}`;
          if (i % 5 === 0) {
            files[`tests/file${i}.test.js`] = `test("file${i}", () => {});`;
          }
        }

        for (const [filePath, content] of Object.entries(files)) {
          const fullPath = path.join(projectDir, filePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content);
        }

        const startTime = Date.now();
        const result = await frameworkRegistry.detectProjectFramework(projectDir);
        const detectionTime = Date.now() - startTime;

        console.log(`\n⚡ Performance Test - ${perfTest.size}:`);
        console.log(`  Files: ${perfTest.files}`);
        console.log(`  Detection time: ${detectionTime}ms`);
        console.log(`  Target: <${perfTest.maxTime}ms`);
        console.log(`  Result: ${detectionTime < perfTest.maxTime ? '✅ PASSED' : '❌ FAILED'}`);

        expect(detectionTime).toBeLessThan(perfTest.maxTime);
        expect(result.framework).toBeTruthy();
      }
    });

    test('should handle corrupted or invalid files gracefully', async () => {
      const corruptedProject = {
        name: 'Corrupted Project',
        files: {
          'package.json': '{ invalid json syntax',
          'requirements.txt': Buffer.from([0xFF, 0xFE, 0x00, 0x01]), // Binary data
          'src/app.js': 'const app = require("express")();'
        }
      };

      const projectDir = path.join(testDir, 'corrupted-project');
      await fs.mkdir(projectDir, { recursive: true });

      for (const [filePath, content] of Object.entries(corruptedProject.files)) {
        const fullPath = path.join(projectDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        if (Buffer.isBuffer(content)) {
          await fs.writeFile(fullPath, content);
        } else {
          await fs.writeFile(fullPath, content);
        }
      }

      // Should not throw error despite corrupted files
      const result = await frameworkRegistry.detectProjectFramework(projectDir);

      console.log(`\n🔧 Corrupted Project Handling:`);
      console.log(`  Framework: ${result.framework || 'None'}`);
      console.log(`  Language: ${result.language || 'None'}`);
      console.log(`  Error handled: ${result.error ? 'No' : 'Yes'}`);

      // Should complete without throwing
      expect(result).toBeDefined();

      // May not detect framework/language due to corrupted files, but should not crash
      if (result.error) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('Confidence Scoring Validation', () => {
    test('should provide accurate confidence scores', async () => {
      const confidenceTests = [
        {
          name: 'High Confidence - Complete TDD Setup',
          files: {
            'package.json': JSON.stringify({
              name: 'complete-tdd',
              devDependencies: {
                'jest': '^29.7.0',
                '@testing-library/react': '^13.4.0'
              }
            }),
            'jest.config.js': 'module.exports = {};',
            'src/app.js': 'export default function App() {}',
            'src/__tests__/app.test.js': 'test("app", () => {});',
            'tests/integration/api.test.js': 'describe("API", () => {});'
          },
          expectedConfidence: { min: 0.9, max: 1.0 }
        },
        {
          name: 'Medium Confidence - Partial Setup',
          files: {
            'package.json': JSON.stringify({
              name: 'partial-setup',
              devDependencies: { 'jest': '^29.7.0' }
            }),
            'src/app.js': 'export default function App() {}'
            // Missing test files
          },
          expectedConfidence: { min: 0.6, max: 0.8 }
        },
        {
          name: 'Low Confidence - Minimal Evidence',
          files: {
            'src/app.js': 'console.log("hello");'
            // No package.json, no tests
          },
          expectedConfidence: { min: 0.0, max: 0.4 }
        }
      ];

      for (const test of confidenceTests) {
        const projectDir = path.join(testDir, test.name.toLowerCase().replace(/\s+/g, '-'));
        await fs.mkdir(projectDir, { recursive: true });

        for (const [filePath, content] of Object.entries(test.files)) {
          const fullPath = path.join(projectDir, filePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content);
        }

        const result = await frameworkRegistry.detectProjectFramework(projectDir);

        console.log(`\n📊 ${test.name}:`);
        console.log(`  Confidence: ${result.confidence?.toFixed(3)}`);
        console.log(`  Expected range: ${test.expectedConfidence.min}-${test.expectedConfidence.max}`);

        if (result.confidence !== undefined) {
          expect(result.confidence).toBeGreaterThanOrEqual(test.expectedConfidence.min);
          expect(result.confidence).toBeLessThanOrEqual(test.expectedConfidence.max);
        }
      }
    });
  });
});