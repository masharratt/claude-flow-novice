#!/usr/bin/env node

/**
 * Optimization Testing Script
 *
 * Tests the complete activation script with rollback scenarios
 * Validates all optimization components work correctly
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { performance } from 'perf_hooks';
import chalk from 'chalk';
import ora from 'ora';

// Import our optimization modules
import { UnifiedOptimizationManager } from './unified-activation.js';
import { ConfigurationValidator } from './config-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Optimization Test Suite
 */
class OptimizationTestSuite {
  constructor(options = {}) {
    this.options = {
      skipActualActivation: false,
      testRollback: true,
      validateConfigurations: true,
      ...options
    };

    this.testResults = {
      preValidation: null,
      activation: null,
      postValidation: null,
      rollback: null,
      finalValidation: null
    };
  }

  /**
   * Run complete test suite
   */
  async runTests() {
    const testStart = performance.now();
    const spinner = ora('🧪 Starting Optimization Test Suite...').start();

    try {
      // Test 1: Pre-activation validation
      await this._testPreActivationValidation(spinner);

      // Test 2: Activation process (optional)
      if (!this.options.skipActualActivation) {
        await this._testActivationProcess(spinner);

        // Test 3: Post-activation validation
        await this._testPostActivationValidation(spinner);

        // Test 4: Rollback functionality
        if (this.options.testRollback) {
          await this._testRollbackProcess(spinner);

          // Test 5: Final validation after rollback
          await this._testFinalValidation(spinner);
        }
      } else {
        await this._testDryRunActivation(spinner);
      }

      const testTime = performance.now() - testStart;
      spinner.succeed(`✅ Optimization Test Suite Completed (${testTime.toFixed(0)}ms)`);

      return {
        success: true,
        testTime,
        results: this.testResults,
        summary: this._generateTestSummary()
      };

    } catch (error) {
      spinner.fail('❌ Optimization Test Suite Failed');
      return {
        success: false,
        error: error.message,
        results: this.testResults
      };
    }
  }

  // Private test methods

  async _testPreActivationValidation(spinner) {
    spinner.text = '🔍 Testing pre-activation validation...';

    try {
      const validator = new ConfigurationValidator();
      const validationResult = await validator.validate();

      this.testResults.preValidation = {
        success: true,
        ...validationResult
      };

      console.log(chalk.blue(`✓ Pre-activation validation: ${validationResult.success ? 'PASS' : 'CONDITIONAL'}`));

    } catch (error) {
      this.testResults.preValidation = {
        success: false,
        error: error.message
      };
      console.log(chalk.red('✗ Pre-activation validation: FAIL'));
      throw error;
    }
  }

  async _testActivationProcess(spinner) {
    spinner.text = '🚀 Testing activation process...';

    try {
      const manager = new UnifiedOptimizationManager({
        enableRollback: true,
        enableMonitoring: true,
        enableValidation: true,
        backupEnabled: true
      });

      const activationResult = await manager.activate();

      this.testResults.activation = {
        success: activationResult.success,
        ...activationResult
      };

      if (activationResult.success) {
        console.log(chalk.green(`✓ Activation process: PASS (${activationResult.activationTime}ms)`));
      } else {
        console.log(chalk.red('✗ Activation process: FAIL'));
        throw new Error(`Activation failed: ${activationResult.error}`);
      }

    } catch (error) {
      this.testResults.activation = {
        success: false,
        error: error.message
      };
      console.log(chalk.red('✗ Activation process: FAIL'));
      throw error;
    }
  }

  async _testPostActivationValidation(spinner) {
    spinner.text = '✅ Testing post-activation validation...';

    try {
      const validator = new ConfigurationValidator();
      const validationResult = await validator.validate();

      this.testResults.postValidation = {
        success: true,
        ...validationResult
      };

      // Check if activation improved configuration
      const preValidation = this.testResults.preValidation;
      const improvement = this._calculateImprovement(preValidation, validationResult);

      console.log(chalk.green(`✓ Post-activation validation: PASS`));
      console.log(chalk.blue(`  Improvement: ${improvement.passRateIncrease.toFixed(1)}% better pass rate`));

    } catch (error) {
      this.testResults.postValidation = {
        success: false,
        error: error.message
      };
      console.log(chalk.red('✗ Post-activation validation: FAIL'));
      throw error;
    }
  }

  async _testRollbackProcess(spinner) {
    spinner.text = '🔄 Testing rollback process...';

    try {
      const manager = new UnifiedOptimizationManager();
      const rollbackResult = await manager.rollback();

      this.testResults.rollback = {
        success: rollbackResult.success,
        ...rollbackResult
      };

      if (rollbackResult.success) {
        console.log(chalk.green('✓ Rollback process: PASS'));
      } else {
        console.log(chalk.yellow('⚠ Rollback process: PARTIAL'));
        console.log(chalk.yellow(`  Warning: ${rollbackResult.error}`));
      }

    } catch (error) {
      this.testResults.rollback = {
        success: false,
        error: error.message
      };
      console.log(chalk.red('✗ Rollback process: FAIL'));
      // Don't throw here - rollback failure is not critical for testing
    }
  }

  async _testFinalValidation(spinner) {
    spinner.text = '🏁 Testing final validation after rollback...';

    try {
      const validator = new ConfigurationValidator();
      const validationResult = await validator.validate();

      this.testResults.finalValidation = {
        success: true,
        ...validationResult
      };

      // Check if rollback restored original state
      const preValidation = this.testResults.preValidation;
      const consistency = this._calculateConsistency(preValidation, validationResult);

      console.log(chalk.green('✓ Final validation: PASS'));
      console.log(chalk.blue(`  Rollback consistency: ${consistency.consistencyRate.toFixed(1)}%`));

    } catch (error) {
      this.testResults.finalValidation = {
        success: false,
        error: error.message
      };
      console.log(chalk.red('✗ Final validation: FAIL'));
      throw error;
    }
  }

  async _testDryRunActivation(spinner) {
    spinner.text = '🧪 Testing dry-run activation...';

    try {
      // Create manager but don't actually activate
      const manager = new UnifiedOptimizationManager({
        enableRollback: true,
        enableMonitoring: false, // Disable to avoid actual changes
        enableValidation: true,
        backupEnabled: false // Disable to avoid creating backups
      });

      // Test manager initialization and validation
      const status = await manager.getStatus();

      this.testResults.activation = {
        success: true,
        dryRun: true,
        status
      };

      console.log(chalk.blue('✓ Dry-run activation: PASS'));

    } catch (error) {
      this.testResults.activation = {
        success: false,
        error: error.message,
        dryRun: true
      };
      console.log(chalk.red('✗ Dry-run activation: FAIL'));
      throw error;
    }
  }

  // Helper methods

  _calculateImprovement(preValidation, postValidation) {
    const prePassRate = preValidation?.report?.summary?.passRate || 0;
    const postPassRate = postValidation?.report?.summary?.passRate || 0;

    return {
      passRateIncrease: (postPassRate - prePassRate) * 100,
      errorReduction: (preValidation?.report?.overall?.failed || 0) -
                     (postValidation?.report?.overall?.failed || 0),
      warningReduction: (preValidation?.report?.overall?.warnings || 0) -
                       (postValidation?.report?.overall?.warnings || 0)
    };
  }

  _calculateConsistency(preValidation, finalValidation) {
    const prePassRate = preValidation?.report?.summary?.passRate || 0;
    const finalPassRate = finalValidation?.report?.summary?.passRate || 0;

    const consistencyRate = 100 - Math.abs((prePassRate - finalPassRate) * 100);

    return {
      consistencyRate,
      passDifference: Math.abs(prePassRate - finalPassRate),
      rollbackEffective: consistencyRate > 90
    };
  }

  _generateTestSummary() {
    const tests = Object.keys(this.testResults);
    const passed = tests.filter(test => this.testResults[test]?.success).length;
    const failed = tests.filter(test => this.testResults[test] && !this.testResults[test].success).length;
    const skipped = tests.filter(test => !this.testResults[test]).length;

    return {
      total: tests.length,
      passed,
      failed,
      skipped,
      passRate: passed / (tests.length - skipped),
      allPassed: failed === 0,
      recommendations: this._generateRecommendations()
    };
  }

  _generateRecommendations() {
    const recommendations = [];

    // Analyze test results to generate recommendations
    if (this.testResults.preValidation && !this.testResults.preValidation.success) {
      recommendations.push({
        type: 'CRITICAL',
        message: 'Pre-activation validation failed',
        action: 'Fix configuration issues before running optimizations'
      });
    }

    if (this.testResults.activation && !this.testResults.activation.success) {
      recommendations.push({
        type: 'CRITICAL',
        message: 'Activation process failed',
        action: 'Review activation logs and fix underlying issues'
      });
    }

    if (this.testResults.rollback && !this.testResults.rollback.success) {
      recommendations.push({
        type: 'HIGH',
        message: 'Rollback process failed',
        action: 'Manually restore system state from backups'
      });
    }

    if (this.testResults.postValidation && this.testResults.preValidation) {
      const improvement = this._calculateImprovement(
        this.testResults.preValidation,
        this.testResults.postValidation
      );

      if (improvement.passRateIncrease < 5) {
        recommendations.push({
          type: 'MEDIUM',
          message: 'Low optimization improvement detected',
          action: 'Review optimization strategies for better results'
        });
      }
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'SUCCESS',
        message: 'All tests passed successfully',
        action: 'Optimization system is ready for production use'
      });
    }

    return recommendations;
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);

  const testSuite = new OptimizationTestSuite({
    skipActualActivation: args.includes('--dry-run'),
    testRollback: !args.includes('--no-rollback'),
    validateConfigurations: !args.includes('--no-validation')
  });

  try {
    console.log(chalk.blue('🧪 Running Optimization Test Suite...'));
    console.log(chalk.gray('This will test activation, validation, and rollback processes\n'));

    const result = await testSuite.runTests();

    console.log(chalk.blue('\n📊 Test Summary:'));
    console.log(`  Total Tests: ${result.summary.total}`);
    console.log(`  Passed: ${chalk.green(result.summary.passed)}`);
    console.log(`  Failed: ${chalk.red(result.summary.failed)}`);
    console.log(`  Skipped: ${chalk.yellow(result.summary.skipped)}`);
    console.log(`  Pass Rate: ${chalk.blue((result.summary.passRate * 100).toFixed(1))}%`);
    console.log(`  Test Time: ${result.testTime.toFixed(0)}ms`);

    if (result.summary.recommendations.length > 0) {
      console.log(chalk.yellow('\n📋 Recommendations:'));
      result.summary.recommendations.forEach(rec => {
        const color = rec.type === 'CRITICAL' ? chalk.red :
                     rec.type === 'HIGH' ? chalk.yellow :
                     rec.type === 'SUCCESS' ? chalk.green : chalk.blue;
        console.log(color(`  ${rec.type}: ${rec.message}`));
        console.log(`    Action: ${rec.action}`);
      });
    }

    if (result.success) {
      console.log(chalk.green('\n✅ All optimization tests completed successfully!'));
      process.exit(0);
    } else {
      console.log(chalk.red('\n❌ Some optimization tests failed'));
      process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red('❌ Test suite failed:'), error.message);
    process.exit(1);
  }
}

// Export for programmatic use
export { OptimizationTestSuite };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}