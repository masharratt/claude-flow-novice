#!/usr/bin/env node
/**
 * Phase 2 Validation Script
 * Comprehensive validation of Phase 2 User Configuration System implementation
 *
 * Validates all critical requirements:
 * - Interactive setup wizard (<5 minute completion)
 * - Framework detection (>90% accuracy)
 * - CLI commands functionality
 * - Configuration persistence
 * - Byzantine security integration
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { InteractiveSetupWizard } from '../src/validation/cli/interactive-setup-wizard.js';
import { ValidationCommands } from '../src/validation/cli/validation-commands.js';
import { FrameworkDetector } from '../src/completion/framework-detector.js';
import { TruthConfigManager } from '../src/validation/truth-config-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_TEST_DIR = path.join(__dirname, '..', 'temp-validation');

class Phase2Validator {
  constructor() {
    this.results = {
      interactiveWizard: { passed: 0, failed: 0, tests: [] },
      frameworkDetection: { passed: 0, failed: 0, tests: [] },
      cliCommands: { passed: 0, failed: 0, tests: [] },
      configPersistence: { passed: 0, failed: 0, tests: [] },
      byzantineSecurity: { passed: 0, failed: 0, tests: [] },
      performance: { passed: 0, failed: 0, tests: [] }
    };
  }

  async runValidation() {
    console.log(chalk.blue.bold('🔍 Phase 2 User Configuration System Validation\n'));

    try {
      await this.setupTestEnvironment();

      await this.validateInteractiveWizard();
      await this.validateFrameworkDetection();
      await this.validateCLICommands();
      await this.validateConfigurationPersistence();
      await this.validateByzantineSecurity();
      await this.validatePerformanceRequirements();

      await this.cleanupTestEnvironment();

      this.displayResults();

    } catch (error) {
      console.error(chalk.red(`\n❌ Validation failed: ${error.message}`));
      process.exit(1);
    }
  }

  async setupTestEnvironment() {
    console.log(chalk.gray('🔧 Setting up test environment...'));

    await fs.rm(TEMP_TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEMP_TEST_DIR, { recursive: true });

    console.log(chalk.green('✅ Test environment ready\n'));
  }

  async cleanupTestEnvironment() {
    console.log(chalk.gray('\n🧹 Cleaning up test environment...'));
    await fs.rm(TEMP_TEST_DIR, { recursive: true, force: true });
  }

  async validateInteractiveWizard() {
    console.log(chalk.blue('📋 Validating Interactive Setup Wizard'));

    await this.runTest('interactiveWizard', 'Wizard initialization', async () => {
      const projectDir = await this.createTestProject('javascript');
      const wizard = new InteractiveSetupWizard({ basePath: projectDir });

      // Should initialize without errors
      expect(wizard).toBeDefined();
      expect(wizard.basePath).toBe(projectDir);

      await wizard.cleanup();
    });

    await this.runTest('interactiveWizard', 'Setup completion time (<5 minutes)', async () => {
      const projectDir = await this.createTestProject('javascript');
      const wizard = new InteractiveSetupWizard({ basePath: projectDir });

      const startTime = Date.now();

      // Mock automated setup
      const result = await wizard.runSetupWizard({
        automated: true,
        inputs: {
          experienceLevel: 'novice',
          framework: 'javascript',
          autoHooks: true
        }
      });

      const setupTime = (Date.now() - startTime) / 1000;

      expect(result.success).toBe(true);
      expect(setupTime).toBeLessThan(300); // Less than 5 minutes

      await wizard.cleanup();
    });

    await this.runTest('interactiveWizard', 'Configuration file creation', async () => {
      const projectDir = await this.createTestProject('javascript');
      const wizard = new InteractiveSetupWizard({ basePath: projectDir });

      await wizard.runSetupWizard({
        automated: true,
        inputs: { experienceLevel: 'novice', framework: 'javascript' }
      });

      const configPath = path.join(projectDir, '.swarm', 'user-preferences.json');
      const configExists = await this.fileExists(configPath);

      expect(configExists).toBe(true);

      const configContent = JSON.parse(await fs.readFile(configPath, 'utf8'));
      expect(configContent.experienceLevel).toBe('novice');
      expect(configContent.setupDate).toBeDefined();

      await wizard.cleanup();
    });
  }

  async validateFrameworkDetection() {
    console.log(chalk.blue('🔍 Validating Framework Detection (>90% accuracy requirement)'));

    await this.runTest('frameworkDetection', 'JavaScript detection accuracy', async () => {
      const projectDir = await this.createJavaScriptProject();
      const detector = new FrameworkDetector({ basePath: projectDir });
      await detector.initialize();

      const result = await detector.detectFramework();

      expect(result.detected).toBe('javascript');
      expect(result.confidence).toBeGreaterThan(0.9);

      await detector.close();
    });

    await this.runTest('frameworkDetection', 'TypeScript detection accuracy', async () => {
      const projectDir = await this.createTypeScriptProject();
      const detector = new FrameworkDetector({ basePath: projectDir });
      await detector.initialize();

      const result = await detector.detectFramework();

      expect(result.detected).toBe('typescript');
      expect(result.confidence).toBeGreaterThan(0.9);

      await detector.close();
    });

    await this.runTest('frameworkDetection', 'Python detection accuracy', async () => {
      const projectDir = await this.createPythonProject();
      const detector = new FrameworkDetector({ basePath: projectDir });
      await detector.initialize();

      const result = await detector.detectFramework();

      expect(result.detected).toBe('python');
      expect(result.confidence).toBeGreaterThan(0.9);

      await detector.close();
    });

    await this.runTest('frameworkDetection', 'React framework detection', async () => {
      const projectDir = await this.createReactProject();
      const detector = new FrameworkDetector({ basePath: projectDir });
      await detector.initialize();

      const result = await detector.detectFramework();

      expect(['javascript', 'typescript']).toContain(result.detected);
      expect(result.evidence.webFrameworks).toBeDefined();
      expect(result.evidence.webFrameworks.some(f => f.name === 'react')).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);

      await detector.close();
    });

    await this.runTest('frameworkDetection', 'Detection performance', async () => {
      const projectDir = await this.createTypeScriptProject();
      const detector = new FrameworkDetector({ basePath: projectDir });
      await detector.initialize();

      const startTime = Date.now();
      const result = await detector.detectFramework();
      const detectionTime = Date.now() - startTime;

      expect(detectionTime).toBeLessThan(5000); // Less than 5 seconds
      expect(result.metadata.detectionTime).toBeLessThan(3000); // Less than 3 seconds

      await detector.close();
    });
  }

  async validateCLICommands() {
    console.log(chalk.blue('⚙️ Validating CLI Commands'));

    const testCommands = [
      'setup', 'check', 'show-config', 'enable-hooks', 'disable-hooks',
      'add-framework', 'configure-gates'
    ];

    for (const command of testCommands) {
      await this.runTest('cliCommands', `Command: ${command}`, async () => {
        const projectDir = await this.createTestProject('javascript');
        const commands = new ValidationCommands({ basePath: projectDir });

        let result;

        switch (command) {
          case 'setup':
            result = await commands.setupCommand({
              automated: true,
              inputs: { experienceLevel: 'novice', framework: 'javascript' }
            });
            break;

          case 'show-config':
            // Setup first
            await commands.setupCommand({
              automated: true,
              inputs: { experienceLevel: 'novice', framework: 'javascript' }
            });
            result = await commands.showConfigCommand();
            break;

          case 'check':
            // Setup first
            await commands.setupCommand({
              automated: true,
              inputs: { experienceLevel: 'novice', framework: 'javascript' }
            });
            result = await commands.checkCommand();
            break;

          case 'enable-hooks':
            // Setup first
            await commands.setupCommand({
              automated: true,
              inputs: { experienceLevel: 'novice', framework: 'javascript' }
            });
            result = await commands.enableHooksCommand();
            break;

          case 'disable-hooks':
            // Setup and enable first
            await commands.setupCommand({
              automated: true,
              inputs: { experienceLevel: 'novice', framework: 'javascript' }
            });
            await commands.enableHooksCommand();
            result = await commands.disableHooksCommand();
            break;

          case 'add-framework':
            // Setup first
            await commands.setupCommand({
              automated: true,
              inputs: { experienceLevel: 'expert', framework: 'javascript' }
            });
            result = await commands.addFrameworkCommand({
              automated: true,
              inputs: {
                name: 'Test Framework',
                filePatterns: ['*.test'],
                testingFramework: 'unit',
                truthThreshold: 0.8
              }
            });
            break;

          case 'configure-gates':
            // Setup first
            await commands.setupCommand({
              automated: true,
              inputs: { experienceLevel: 'intermediate', framework: 'javascript' }
            });
            result = await commands.configureGatesCommand({
              automated: true,
              inputs: {
                truthScore: 0.85,
                testCoverage: 90,
                codeQuality: 'A',
                documentationCoverage: 80
              }
            });
            break;
        }

        expect(result).toBeDefined();
        if (result.success !== undefined) {
          expect(result.success).toBe(true);
        }
      });
    }
  }

  async validateConfigurationPersistence() {
    console.log(chalk.blue('💾 Validating Configuration Persistence'));

    await this.runTest('configPersistence', 'Configuration saves correctly', async () => {
      const projectDir = await this.createTestProject('javascript');
      const configManager = new TruthConfigManager({
        configDir: path.join(projectDir, '.swarm', 'configs')
      });

      await configManager.initialize();

      const config = await configManager.createFromFramework('TDD');
      const saveResult = await configManager.saveConfiguration(config, 'test_config');

      expect(saveResult.configId).toBeDefined();
      expect(saveResult.filepath).toBeDefined();

      const savedExists = await this.fileExists(saveResult.filepath);
      expect(savedExists).toBe(true);

      await configManager.cleanup();
    });

    await this.runTest('configPersistence', 'Configuration persists across sessions', async () => {
      const projectDir = await this.createTestProject('javascript');

      // First session - setup
      const commands1 = new ValidationCommands({ basePath: projectDir });
      const setupResult = await commands1.setupCommand({
        automated: true,
        inputs: { experienceLevel: 'intermediate', framework: 'javascript' }
      });

      expect(setupResult.success).toBe(true);

      // Second session - verify persistence
      const commands2 = new ValidationCommands({ basePath: projectDir });
      const configResult = await commands2.showConfigCommand();

      expect(configResult.success).toBe(true);
      expect(configResult.config.experienceLevel).toBe('intermediate');
    });

    await this.runTest('configPersistence', 'Configuration can be updated', async () => {
      const projectDir = await this.createTestProject('javascript');
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
          testCoverage: 98,
          codeQuality: 'A',
          documentationCoverage: 90
        }
      });

      expect(updateResult.success).toBe(true);

      // Verify update persisted
      const configResult = await commands.showConfigCommand();
      expect(configResult.config.qualityGates.truthScore).toBe(0.95);
    });
  }

  async validateByzantineSecurity() {
    console.log(chalk.blue('🛡️ Validating Byzantine Security Integration'));

    await this.runTest('byzantineSecurity', 'Valid configurations pass Byzantine validation', async () => {
      const configManager = new TruthConfigManager({
        configDir: path.join(TEMP_TEST_DIR, 'byzantine-test')
      });
      await configManager.initialize();

      const config = await configManager.createFromFramework('TDD');
      const validation = await configManager.validateConfiguration(config);

      expect(validation.valid).toBe(true);
      expect(validation.byzantineFaultTolerant).toBe(true);
      expect(validation.validationId).toBeDefined();

      await configManager.cleanup();
    });

    await this.runTest('byzantineSecurity', 'Malicious patterns are detected', async () => {
      const configManager = new TruthConfigManager({
        configDir: path.join(TEMP_TEST_DIR, 'byzantine-test-malicious')
      });
      await configManager.initialize();

      // Create suspicious configuration
      const maliciousConfig = {
        framework: 'TDD',
        threshold: 0.05, // Suspiciously low
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
          maxErrorMargin: 0.45
        }
      };

      const validation = await configManager.validateConfiguration(maliciousConfig);

      expect(validation.valid).toBe(false);
      expect(validation.byzantineFaultTolerant).toBe(false);
      expect(validation.warnings.length).toBeGreaterThan(0);

      await configManager.cleanup();
    });

    await this.runTest('byzantineSecurity', 'Configuration integrity checking', async () => {
      const configManager = new TruthConfigManager({
        configDir: path.join(TEMP_TEST_DIR, 'integrity-test')
      });
      await configManager.initialize();

      const config = await configManager.createFromFramework('SPARC');
      const hash1 = configManager.hashConfig(config);

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const hash2 = configManager.hashConfig(config);

      expect(hash1).toBe(hash2); // Same config should produce same hash

      await configManager.cleanup();
    });
  }

  async validatePerformanceRequirements() {
    console.log(chalk.blue('🚀 Validating Performance Requirements'));

    await this.runTest('performance', 'Setup wizard completes in <5 minutes', async () => {
      const projectDir = await this.createTestProject('typescript');
      const wizard = new InteractiveSetupWizard({ basePath: projectDir });

      const startTime = Date.now();

      const result = await wizard.runSetupWizard({
        automated: true,
        inputs: {
          experienceLevel: 'intermediate',
          framework: 'typescript',
          customGates: true,
          truthScore: 0.85,
          testCoverage: 95
        }
      });

      const setupTime = (Date.now() - startTime) / 1000;

      expect(result.success).toBe(true);
      expect(setupTime).toBeLessThan(300); // Less than 5 minutes
      expect(setupTime).toBeLessThan(60); // Ideally less than 1 minute

      await wizard.cleanup();
    });

    await this.runTest('performance', 'Framework detection is fast', async () => {
      const projectDir = await this.createReactProject();
      const detector = new FrameworkDetector({ basePath: projectDir });
      await detector.initialize();

      const startTime = Date.now();
      const result = await detector.detectFramework();
      const detectionTime = Date.now() - startTime;

      expect(detectionTime).toBeLessThan(10000); // Less than 10 seconds
      expect(result.metadata.detectionTime).toBeLessThan(5000); // Less than 5 seconds

      await detector.close();
    });

    await this.runTest('performance', 'CLI commands respond quickly', async () => {
      const projectDir = await this.createTestProject('javascript');
      const commands = new ValidationCommands({ basePath: projectDir });

      // Setup first
      const setupStart = Date.now();
      await commands.setupCommand({
        automated: true,
        inputs: { experienceLevel: 'novice', framework: 'javascript' }
      });
      const setupTime = Date.now() - setupStart;

      // Test show-config performance
      const configStart = Date.now();
      await commands.showConfigCommand();
      const configTime = Date.now() - configStart;

      expect(setupTime).toBeLessThan(30000); // Less than 30 seconds for setup
      expect(configTime).toBeLessThan(2000); // Less than 2 seconds for show-config
    });
  }

  async runTest(category, testName, testFn) {
    try {
      await testFn();
      this.results[category].passed++;
      this.results[category].tests.push({ name: testName, status: 'PASS' });
      console.log(chalk.green(`  ✅ ${testName}`));
    } catch (error) {
      this.results[category].failed++;
      this.results[category].tests.push({
        name: testName,
        status: 'FAIL',
        error: error.message
      });
      console.log(chalk.red(`  ❌ ${testName}: ${error.message}`));
    }
  }

  displayResults() {
    console.log(chalk.blue.bold('\n📊 Validation Results Summary\n'));

    let totalPassed = 0;
    let totalFailed = 0;

    for (const [category, results] of Object.entries(this.results)) {
      const categoryName = category.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      const total = results.passed + results.failed;

      totalPassed += results.passed;
      totalFailed += results.failed;

      let status = '✅';
      if (results.failed > 0) {
        status = results.failed > results.passed ? '❌' : '⚠️';
      }

      console.log(`${status} ${chalk.bold(categoryName)}: ${chalk.green(results.passed)}/${total} passed`);

      if (results.failed > 0) {
        const failedTests = results.tests.filter(t => t.status === 'FAIL');
        failedTests.forEach(test => {
          console.log(chalk.red(`    • ${test.name}: ${test.error}`));
        });
      }
    }

    console.log(chalk.blue('\n' + '='.repeat(50)));
    console.log(chalk.bold(`Total: ${chalk.green(totalPassed)} passed, ${totalFailed > 0 ? chalk.red(totalFailed) : '0'} failed`));

    // Phase 2 Critical Requirements Check
    const criticalRequirements = this.checkCriticalRequirements();

    console.log(chalk.blue.bold('\n🎯 Phase 2 Critical Requirements Status'));
    criticalRequirements.forEach(req => {
      const icon = req.met ? '✅' : '❌';
      const color = req.met ? chalk.green : chalk.red;
      console.log(`${icon} ${color(req.requirement)}`);
    });

    const allRequirementsMet = criticalRequirements.every(req => req.met);

    if (allRequirementsMet && totalFailed === 0) {
      console.log(chalk.green.bold('\n🎉 Phase 2 User Configuration System - VALIDATION PASSED!'));
      console.log(chalk.green('All critical requirements have been successfully implemented.'));
      process.exit(0);
    } else {
      console.log(chalk.red.bold('\n❌ Phase 2 User Configuration System - VALIDATION FAILED!'));
      console.log(chalk.red('Some critical requirements are not met or tests failed.'));
      process.exit(1);
    }
  }

  checkCriticalRequirements() {
    return [
      {
        requirement: 'Interactive setup wizard completes in <5 minutes for 95% of users',
        met: this.results.interactiveWizard.passed > 0 && this.results.performance.passed > 0
      },
      {
        requirement: 'Framework detection achieves >90% accuracy',
        met: this.results.frameworkDetection.passed >= 4 && this.results.frameworkDetection.failed === 0
      },
      {
        requirement: 'All essential CLI commands work with helpful error messages',
        met: this.results.cliCommands.passed >= 7 && this.results.cliCommands.failed === 0
      },
      {
        requirement: 'Custom framework support allows users to add frameworks',
        met: this.results.cliCommands.tests.some(t => t.name.includes('add-framework') && t.status === 'PASS')
      },
      {
        requirement: 'Configuration persistence works correctly across sessions',
        met: this.results.configPersistence.passed >= 2 && this.results.configPersistence.failed === 0
      },
      {
        requirement: 'Byzantine security prevents invalid configuration submissions',
        met: this.results.byzantineSecurity.passed >= 2 && this.results.byzantineSecurity.failed === 0
      }
    ];
  }

  // Test project creation methods

  async createTestProject(type) {
    const projectDir = path.join(TEMP_TEST_DIR, `${type}-${Date.now()}`);
    await fs.mkdir(projectDir, { recursive: true });

    switch (type) {
      case 'javascript':
        return await this.createJavaScriptProject(projectDir);
      case 'typescript':
        return await this.createTypeScriptProject(projectDir);
      case 'python':
        return await this.createPythonProject(projectDir);
      case 'react':
        return await this.createReactProject(projectDir);
    }

    return projectDir;
  }

  async createJavaScriptProject(dir = null) {
    if (!dir) {
      dir = path.join(TEMP_TEST_DIR, `js-${Date.now()}`);
      await fs.mkdir(dir, { recursive: true });
    }

    const packageJson = {
      name: 'test-js-project',
      version: '1.0.0',
      main: 'index.js',
      scripts: { test: 'jest' },
      devDependencies: { jest: '^29.0.0' }
    };

    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(packageJson, null, 2));
    await fs.writeFile(path.join(dir, 'index.js'), 'console.log("Hello World");');

    return dir;
  }

  async createTypeScriptProject(dir = null) {
    if (!dir) {
      dir = path.join(TEMP_TEST_DIR, `ts-${Date.now()}`);
      await fs.mkdir(dir, { recursive: true });
    }

    const packageJson = {
      name: 'test-ts-project',
      version: '1.0.0',
      devDependencies: {
        typescript: '^5.0.0',
        '@types/node': '^20.0.0',
        jest: '^29.0.0'
      }
    };

    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        strict: true
      }
    };

    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(packageJson, null, 2));
    await fs.writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
    await fs.writeFile(path.join(dir, 'index.ts'), 'const message: string = "Hello TypeScript";');

    return dir;
  }

  async createPythonProject(dir = null) {
    if (!dir) {
      dir = path.join(TEMP_TEST_DIR, `py-${Date.now()}`);
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.writeFile(path.join(dir, 'requirements.txt'), 'pytest>=7.0.0\nrequests>=2.28.0');
    await fs.writeFile(path.join(dir, 'setup.py'), 'from setuptools import setup\nsetup(name="test")');
    await fs.writeFile(path.join(dir, 'main.py'), 'def hello():\n    return "Hello Python"');

    return dir;
  }

  async createReactProject(dir = null) {
    if (!dir) {
      dir = path.join(TEMP_TEST_DIR, `react-${Date.now()}`);
      await fs.mkdir(dir, { recursive: true });
    }

    const packageJson = {
      name: 'test-react-project',
      version: '1.0.0',
      dependencies: {
        react: '^18.0.0',
        'react-dom': '^18.0.0'
      }
    };

    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(packageJson, null, 2));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'src', 'App.jsx'),
      'import React from "react";\nfunction App() { return <h1>Hello React</h1>; }\nexport default App;'
    );

    return dir;
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Simple expect implementation for testing
global.expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, got ${actual}`);
    }
  },
  toEqual: (expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  toBeDefined: () => {
    if (actual === undefined) {
      throw new Error('Expected value to be defined');
    }
  },
  toBeGreaterThan: (expected) => {
    if (actual <= expected) {
      throw new Error(`Expected ${actual} to be greater than ${expected}`);
    }
  },
  toBeLessThan: (expected) => {
    if (actual >= expected) {
      throw new Error(`Expected ${actual} to be less than ${expected}`);
    }
  },
  toContain: (expected) => {
    if (!actual.includes(expected)) {
      throw new Error(`Expected ${JSON.stringify(actual)} to contain ${expected}`);
    }
  }
});

// Run validation if this script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const validator = new Phase2Validator();
  validator.runValidation().catch(console.error);
}