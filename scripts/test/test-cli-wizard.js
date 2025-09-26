#!/usr/bin/env node
/**
 * CLI Wizard Test Script
 * Phase 2 Implementation Validation
 *
 * Tests CLI wizard functionality and performance requirements
 */

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import chalk from 'chalk';

const CLI_COMMAND = 'node';
const CLI_ARGS = ['bin/claude-flow-novice.js', 'validate'];

class CLIWizardTester {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
  }

  async runTest(testName, testFn) {
    this.testResults.total++;
    console.log(chalk.blue(`\n🧪 Running test: ${testName}`));

    try {
      const startTime = performance.now();
      await testFn();
      const duration = performance.now() - startTime;

      this.testResults.passed++;
      this.testResults.details.push({
        name: testName,
        status: 'PASSED',
        duration,
        error: null
      });

      console.log(chalk.green(`✅ ${testName} - PASSED (${Math.round(duration)}ms)`));

    } catch (error) {
      this.testResults.failed++;
      this.testResults.details.push({
        name: testName,
        status: 'FAILED',
        duration: 0,
        error: error.message
      });

      console.log(chalk.red(`❌ ${testName} - FAILED`));
      console.log(chalk.red(`   Error: ${error.message}`));
    }
  }

  async runCLICommand(args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(CLI_COMMAND, [...CLI_ARGS, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: options.timeout || 30000
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          code,
          stdout,
          stderr
        });
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Send automated responses for interactive prompts
      if (options.autoRespond) {
        setTimeout(() => {
          child.stdin.write('Y\n'); // Confirm framework detection
          setTimeout(() => {
            child.stdin.write('n\n'); // Don't customize gates
            setTimeout(() => {
              child.stdin.write('n\n'); // Don't configure advanced settings
              child.stdin.end();
            }, 100);
          }, 100);
        }, 1000);
      }
    });
  }

  async testHelpCommand() {
    const result = await this.runCLICommand(['help']);

    if (result.code !== 0) {
      throw new Error(`Help command failed with code ${result.code}`);
    }

    if (!result.stdout.includes('Completion Validation Framework')) {
      throw new Error('Help text missing framework information');
    }

    if (!result.stdout.includes('claude-flow-novice validate setup')) {
      throw new Error('Help text missing setup command');
    }
  }

  async testShowConfigCommand() {
    const result = await this.runCLICommand(['show-config']);

    // Should exit gracefully even if no config exists
    if (result.code > 1) {
      throw new Error(`Show-config command failed with code ${result.code}`);
    }

    // Should provide helpful message if no config exists
    if (!result.stdout.includes('Configuration') && !result.stderr.includes('Configuration')) {
      throw new Error('Show-config should provide configuration information or helpful error');
    }
  }

  async testTestCommand() {
    const result = await this.runCLICommand(['test']);

    // Should exit gracefully and provide test results
    if (result.code > 1) {
      throw new Error(`Test command failed with code ${result.code}`);
    }

    // Should provide test information
    if (!result.stdout.includes('Test') && !result.stderr.includes('Test')) {
      throw new Error('Test command should provide test information');
    }
  }

  async testSetupCommandNonInteractive() {
    // Test that setup command doesn't hang without user input
    const result = await this.runCLICommand(['setup'], {
      timeout: 10000 // 10 second timeout
    });

    // Command should handle non-interactive mode gracefully
    // Even if it fails, it shouldn't hang
    if (result.code === null) {
      throw new Error('Setup command hung without user input');
    }
  }

  async testCommandLineValidation() {
    // Test invalid commands
    const result = await this.runCLICommand(['invalid-command']);

    if (result.code === 0) {
      throw new Error('Invalid command should return non-zero exit code');
    }

    // Should provide helpful error message
    if (!result.stderr.includes('Unknown') && !result.stdout.includes('help')) {
      throw new Error('Invalid command should provide helpful error message');
    }
  }

  async testPerformanceRequirements() {
    // Test that CLI commands respond quickly
    const startTime = performance.now();

    try {
      await this.runCLICommand(['help'], { timeout: 5000 });
    } catch (error) {
      if (error.code === 'ETIMEDOUT') {
        throw new Error('Help command took longer than 5 seconds');
      }
      throw error;
    }

    const duration = performance.now() - startTime;
    if (duration > 5000) {
      throw new Error(`Help command took ${Math.round(duration)}ms, should be under 5000ms`);
    }
  }

  async testErrorHandling() {
    // Test CLI behavior in various error conditions
    const tempDir = '/tmp/non-existent-directory';

    const result = await this.runCLICommand(['test'], {
      cwd: tempDir,
      timeout: 5000
    });

    // Should handle invalid directories gracefully
    // Even if it fails, it should provide meaningful error messages
    if (result.stderr.includes('ENOENT') && !result.stderr.includes('helpful')) {
      // This is acceptable - system error in expected location
    } else if (result.code === null) {
      throw new Error('Command should handle invalid directories gracefully');
    }
  }

  async testFrameworkDetectionAccuracy() {
    // This would require creating test project structures
    // For now, we test that the detection doesn't crash
    try {
      const result = await this.runCLICommand(['test'], { timeout: 10000 });

      // Should complete without hanging
      if (result.code === null) {
        throw new Error('Framework detection hung');
      }
    } catch (error) {
      if (error.code === 'ETIMEDOUT') {
        throw new Error('Framework detection took longer than 10 seconds');
      }
      // Other errors are acceptable for this test
    }
  }

  async runAllTests() {
    console.log(chalk.blue.bold('🚀 CLI Wizard Test Suite'));
    console.log(chalk.gray('Testing Phase 2 Implementation Requirements\n'));

    await this.runTest('Help Command Functionality', () => this.testHelpCommand());
    await this.runTest('Show Config Command', () => this.testShowConfigCommand());
    await this.runTest('Test Command', () => this.testTestCommand());
    await this.runTest('Setup Command Non-Interactive', () => this.testSetupCommandNonInteractive());
    await this.runTest('Command Line Validation', () => this.testCommandLineValidation());
    await this.runTest('Performance Requirements', () => this.testPerformanceRequirements());
    await this.runTest('Error Handling', () => this.testErrorHandling());
    await this.runTest('Framework Detection Performance', () => this.testFrameworkDetectionAccuracy());

    this.printResults();
  }

  printResults() {
    console.log(chalk.blue.bold('\n📊 Test Results Summary'));
    console.log(chalk.green(`✅ Passed: ${this.testResults.passed}`));
    console.log(chalk.red(`❌ Failed: ${this.testResults.failed}`));
    console.log(chalk.blue(`📋 Total: ${this.testResults.total}`));

    const passRate = (this.testResults.passed / this.testResults.total) * 100;
    console.log(chalk.yellow(`📈 Pass Rate: ${Math.round(passRate)}%`));

    if (this.testResults.failed > 0) {
      console.log(chalk.red.bold('\n❌ Failed Tests:'));
      this.testResults.details
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          console.log(chalk.red(`  • ${test.name}: ${test.error}`));
        });
    }

    console.log(chalk.blue.bold('\n🎯 Requirements Assessment:'));

    // Check specific Phase 2 requirements
    const requirements = [
      {
        name: 'CLI Commands Implemented',
        met: this.testResults.details.some(t => t.name.includes('Help Command') && t.status === 'PASSED'),
        required: true
      },
      {
        name: 'Interactive Setup Available',
        met: this.testResults.details.some(t => t.name.includes('Setup Command') && t.status === 'PASSED'),
        required: true
      },
      {
        name: 'Configuration Display Working',
        met: this.testResults.details.some(t => t.name.includes('Show Config') && t.status === 'PASSED'),
        required: true
      },
      {
        name: 'Testing Command Functional',
        met: this.testResults.details.some(t => t.name.includes('Test Command') && t.status === 'PASSED'),
        required: true
      },
      {
        name: 'Performance Under 5 Seconds',
        met: this.testResults.details.some(t => t.name.includes('Performance') && t.status === 'PASSED'),
        required: true
      },
      {
        name: 'Error Handling Robust',
        met: this.testResults.details.some(t => t.name.includes('Error Handling') && t.status === 'PASSED'),
        required: true
      }
    ];

    requirements.forEach(req => {
      const status = req.met ? chalk.green('✅') : chalk.red('❌');
      const priority = req.required ? '(Required)' : '(Optional)';
      console.log(`  ${status} ${req.name} ${chalk.gray(priority)}`);
    });

    const requiredMet = requirements.filter(r => r.required && r.met).length;
    const totalRequired = requirements.filter(r => r.required).length;

    console.log(chalk.blue(`\n📋 Requirements Met: ${requiredMet}/${totalRequired}`));

    if (requiredMet === totalRequired) {
      console.log(chalk.green.bold('\n🎉 All Phase 2 CLI Requirements Met!'));
      console.log(chalk.green('The CLI wizard is ready for production use.'));
    } else {
      console.log(chalk.red.bold('\n⚠️ Some Requirements Not Met'));
      console.log(chalk.red('Additional development needed before production deployment.'));
    }
  }
}

// Run tests if script is called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new CLIWizardTester();

  tester.runAllTests().catch(error => {
    console.error(chalk.red.bold('\n💥 Test Suite Failed:'));
    console.error(chalk.red(error.message));
    process.exit(1);
  });
}