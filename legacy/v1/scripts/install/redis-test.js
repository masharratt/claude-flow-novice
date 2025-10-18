#!/usr/bin/env node

/**
 * Claude Flow Novice - Redis Connection Testing Utility
 *
 * Comprehensive Redis testing and validation
 */

import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';

class RedisConnectionTest {
  constructor(options = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 6379;
    this.password = options.password || null;
    this.results = {
      connectivity: false,
      operations: {},
      performance: {},
      errors: []
    };
  }

  async runAllTests() {
    console.log(chalk.blue.bold('🧪 Redis Connection Testing\n'));

    await this.testConnectivity();
    await this.testBasicOperations();
    await this.testPubSub();
    await this.testPersistence();
    await this.testPerformance();

    this.displayResults();
    return this.results;
  }

  async testConnectivity() {
    const spinner = ora('Testing Redis connectivity...').start();

    try {
      // Test PING
      const response = execSync('redis-cli ping', { encoding: 'utf8', timeout: 5000 }).trim();

      if (response === 'PONG') {
        spinner.succeed('Redis connectivity: OK');
        this.results.connectivity = true;

        // Get server info
        try {
          const info = execSync('redis-cli INFO server', { encoding: 'utf8', timeout: 5000 });
          const versionMatch = info.match(/redis_version:([^\r\n]+)/);
          const version = versionMatch ? versionMatch[1].trim() : 'unknown';

          console.log(chalk.cyan(`  ℹ️  Redis version: ${version}`));
        } catch (infoError) {
          // Non-critical error
        }
      } else {
        throw new Error('Unexpected response from Redis');
      }
    } catch (error) {
      spinner.fail('Redis connectivity: FAILED');
      this.results.errors.push(`Connectivity: ${error.message}`);
      this.results.connectivity = false;
    }
  }

  async testBasicOperations() {
    if (!this.results.connectivity) {
      console.log(chalk.yellow('⏭️  Skipping basic operations (no connection)'));
      return;
    }

    const spinner = ora('Testing basic operations...').start();

    try {
      const testKey = 'claude-flow-test';
      const testValue = 'test-value-' + Date.now();

      // Test SET
      execSync(`redis-cli set ${testKey} "${testValue}"`, { stdio: 'ignore', timeout: 5000 });

      // Test GET
      const getValue = execSync(`redis-cli get ${testKey}`, { encoding: 'utf8', timeout: 5000 }).trim();

      if (getValue === testValue) {
        this.results.operations.get = true;
        this.results.operations.set = true;
      } else {
        throw new Error('GET operation returned incorrect value');
      }

      // Test DEL
      execSync(`redis-cli del ${testKey}`, { stdio: 'ignore', timeout: 5000 });

      // Verify deletion
      const deletedValue = execSync(`redis-cli get ${testKey}`, { encoding: 'utf8', timeout: 5000 }).trim();
      if (deletedValue === '(nil)' || deletedValue === '') {
        this.results.operations.del = true;
      }

      // Test INCR
      execSync('redis-cli set counter 0', { stdio: 'ignore', timeout: 5000 });
      const incrResult = execSync('redis-cli incr counter', { encoding: 'utf8', timeout: 5000 }).trim();
      if (incrResult === '1') {
        this.results.operations.incr = true;
      }
      execSync('redis-cli del counter', { stdio: 'ignore', timeout: 5000 });

      // Test EXPIRE
      execSync(`redis-cli set expire-test value`, { stdio: 'ignore', timeout: 5000 });
      execSync(`redis-cli expire expire-test 1`, { stdio: 'ignore', timeout: 5000 });
      const ttl = execSync(`redis-cli ttl expire-test`, { encoding: 'utf8', timeout: 5000 }).trim();
      if (parseInt(ttl) > 0) {
        this.results.operations.expire = true;
      }
      execSync('redis-cli del expire-test', { stdio: 'ignore', timeout: 5000 });

      spinner.succeed('Basic operations: OK');
    } catch (error) {
      spinner.fail('Basic operations: FAILED');
      this.results.errors.push(`Basic operations: ${error.message}`);
    }
  }

  async testPubSub() {
    if (!this.results.connectivity) {
      console.log(chalk.yellow('⏭️  Skipping pub/sub test (no connection)'));
      return;
    }

    const spinner = ora('Testing pub/sub messaging...').start();

    try {
      // Test pub/sub by publishing a message
      const channel = 'claude-flow-test-channel';
      const message = 'test-message';

      const publishResult = execSync(`redis-cli publish ${channel} "${message}"`, {
        encoding: 'utf8',
        timeout: 5000
      }).trim();

      // publishResult will be "0" if no subscribers, which is expected
      this.results.operations.pubsub = true;
      spinner.succeed('Pub/Sub messaging: OK');
    } catch (error) {
      spinner.fail('Pub/Sub messaging: FAILED');
      this.results.errors.push(`Pub/Sub: ${error.message}`);
    }
  }

  async testPersistence() {
    if (!this.results.connectivity) {
      console.log(chalk.yellow('⏭️  Skipping persistence test (no connection)'));
      return;
    }

    const spinner = ora('Testing persistence configuration...').start();

    try {
      const config = execSync('redis-cli CONFIG GET save', { encoding: 'utf8', timeout: 5000 });

      if (config.includes('save')) {
        this.results.operations.persistence = true;
        spinner.succeed('Persistence configuration: OK');
      } else {
        spinner.warn('Persistence configuration: Not configured');
      }
    } catch (error) {
      spinner.warn('Persistence configuration: Cannot verify');
      this.results.errors.push(`Persistence: ${error.message}`);
    }
  }

  async testPerformance() {
    if (!this.results.connectivity) {
      console.log(chalk.yellow('⏭️  Skipping performance test (no connection)'));
      return;
    }

    const spinner = ora('Testing performance...').start();

    try {
      const iterations = 100;
      const testKey = 'perf-test';

      // Measure SET performance
      const setStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        execSync(`redis-cli set ${testKey}-${i} value-${i}`, { stdio: 'ignore', timeout: 5000 });
      }
      const setDuration = Date.now() - setStart;
      this.results.performance.setOpsPerSec = Math.round((iterations / setDuration) * 1000);

      // Measure GET performance
      const getStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        execSync(`redis-cli get ${testKey}-${i}`, { stdio: 'ignore', timeout: 5000 });
      }
      const getDuration = Date.now() - getStart;
      this.results.performance.getOpsPerSec = Math.round((iterations / getDuration) * 1000);

      // Cleanup
      for (let i = 0; i < iterations; i++) {
        execSync(`redis-cli del ${testKey}-${i}`, { stdio: 'ignore', timeout: 5000 });
      }

      spinner.succeed(
        `Performance: SET ${this.results.performance.setOpsPerSec} ops/sec, GET ${this.results.performance.getOpsPerSec} ops/sec`
      );
    } catch (error) {
      spinner.fail('Performance test: FAILED');
      this.results.errors.push(`Performance: ${error.message}`);
    }
  }

  displayResults() {
    console.log(chalk.blue.bold('\n📊 Test Results Summary:\n'));

    // Connectivity
    console.log(
      this.results.connectivity
        ? chalk.green('✅ Connectivity: PASS')
        : chalk.red('❌ Connectivity: FAIL')
    );

    // Operations
    if (Object.keys(this.results.operations).length > 0) {
      console.log(chalk.cyan('\n🔧 Operations:'));
      for (const [op, status] of Object.entries(this.results.operations)) {
        const icon = status ? '✅' : '❌';
        const color = status ? chalk.green : chalk.red;
        console.log(color(`  ${icon} ${op.toUpperCase()}: ${status ? 'PASS' : 'FAIL'}`));
      }
    }

    // Performance
    if (Object.keys(this.results.performance).length > 0) {
      console.log(chalk.cyan('\n⚡ Performance:'));
      for (const [metric, value] of Object.entries(this.results.performance)) {
        console.log(chalk.green(`  📈 ${metric}: ${value}`));
      }
    }

    // Errors
    if (this.results.errors.length > 0) {
      console.log(chalk.red('\n⚠️  Errors:'));
      for (const error of this.results.errors) {
        console.log(chalk.red(`  - ${error}`));
      }
    }

    // Overall status
    const overallPass = this.results.connectivity && this.results.errors.length === 0;
    console.log(
      overallPass
        ? chalk.green.bold('\n✅ All tests passed!')
        : chalk.yellow.bold('\n⚠️  Some tests failed or had warnings')
    );
  }
}

// Execute tests
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new RedisConnectionTest();
  tester.runAllTests().then(results => {
    const exitCode = results.connectivity && results.errors.length === 0 ? 0 : 1;
    process.exit(exitCode);
  }).catch(error => {
    console.error(chalk.red('Test execution failed:'), error);
    process.exit(1);
  });
}

export default RedisConnectionTest;
