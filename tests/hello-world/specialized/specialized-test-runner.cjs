#!/usr/bin/env node

/**
 * Specialized CFN Docker Test Runner
 * Runs context injection, Redis key validation, and Product Owner decision flow tests
 */

const ContextInjectionTest = require('./context-injection-between-loops.cjs');
const RedisKeyValidationTest = require('./redis-key-structure-validation.cjs');
const ProductOwnerDecisionTest = require('./product-owner-decision-flow.cjs');

class SpecializedTestRunner {
    constructor() {
        this.testResults = {
            suite: 'CFN Docker Specialized Tests',
            startTime: new Date().toISOString(),
            endTime: null,
            status: 'RUNNING',
            tests: [],
            summary: {
                totalTests: 0,
                passedTests: 0,
                failedTests: 0,
                overallStatus: 'PENDING'
            },
            errors: []
        };
    }

    async run(testFilter = null) {
        try {
            console.log('🧪 Starting CFN Docker Specialized Test Suite');
            console.log('='.repeat(60));

            const tests = this.getAvailableTests(testFilter);
            this.testResults.summary.totalTests = tests.length;

            // Run each test
            for (const testConfig of tests) {
                console.log(`\n🔍 Running: ${testConfig.name}`);
                console.log('-'.repeat(40));

                const startTime = Date.now();
                let result = null;

                try {
                    result = await testConfig.instance.run();
                    const duration = Date.now() - startTime;

                    const testResult = {
                        name: testConfig.name,
                        description: testConfig.description,
                        status: result.status,
                        duration: duration,
                        startTime: result.startTime,
                        endTime: result.endTime,
                        passed: result.status === 'COMPLETED',
                        result: result
                    };

                    this.testResults.tests.push(testResult);

                    if (testResult.passed) {
                        this.testResults.summary.passedTests++;
                        console.log(`✅ ${testConfig.name} PASSED (${Math.round(duration / 1000)}s)`);
                    } else {
                        this.testResults.summary.failedTests++;
                        console.log(`❌ ${testConfig.name} FAILED`);
                    }

                } catch (error) {
                    const duration = Date.now() - startTime;
                    this.testResults.summary.failedTests++;

                    const testResult = {
                        name: testConfig.name,
                        description: testConfig.description,
                        status: 'FAILED',
                        duration: duration,
                        startTime: new Date(startTime).toISOString(),
                        endTime: new Date().toISOString(),
                        passed: false,
                        error: error.message,
                        result: null
                    };

                    this.testResults.tests.push(testResult);
                    this.testResults.errors.push(`${testConfig.name}: ${error.message}`);

                    console.log(`❌ ${testConfig.name} FAILED: ${error.message}`);
                }
            }

            // Finalize results
            this.testResults.endTime = new Date().toISOString();
            this.testResults.summary.overallStatus =
                this.testResults.summary.failedTests === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED';

            // Print final summary
            this.printSummary();

            // Save results
            await this.saveResults();

            return this.testResults;

        } catch (error) {
            this.testResults.status = 'FAILED';
            this.testResults.endTime = new Date().toISOString();
            this.testResults.errors.push(error.message);
            throw error;
        }
    }

    getAvailableTests(filter) {
        const allTests = [
            {
                name: 'Context Injection Between CFN Loops',
                description: 'Validates context flow between Loop 3, Loop 2, and Product Owner iterations',
                key: 'context',
                instance: new ContextInjectionTest()
            },
            {
                name: 'Redis Key Structure Validation',
                description: 'Validates correct Redis key patterns and namespace usage in CFN Docker',
                key: 'redis',
                instance: new RedisKeyValidationTest()
            },
            {
                name: 'Product Owner Decision Flow',
                description: 'Tests Product Owner decision making with proper context integration',
                key: 'product-owner',
                instance: new ProductOwnerDecisionTest()
            }
        ];

        // Apply filter if specified
        if (filter) {
            const filterLower = filter.toLowerCase();
            return allTests.filter(test =>
                test.key.toLowerCase().includes(filterLower) ||
                test.name.toLowerCase().includes(filterLower)
            );
        }

        return allTests;
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 CFN DOCKER SPECIALIZED TEST SUITE RESULTS');
        console.log('='.repeat(60));

        const { summary, tests } = this.testResults;

        console.log(`📈 Overall Status: ${summary.overallStatus}`);
        console.log(`📊 Total Tests: ${summary.totalTests}`);
        console.log(`✅ Passed: ${summary.passedTests}`);
        console.log(`❌ Failed: ${summary.failedTests}`);
        console.log(`📈 Success Rate: ${summary.totalTests > 0 ? ((summary.passedTests / summary.totalTests) * 100).toFixed(1) : 0}%`);

        // Print individual test summaries
        console.log('\n📋 Test Results:');
        tests.forEach((test, index) => {
            const status = test.passed ? '✅' : '❌';
            const duration = Math.round(test.duration / 1000);
            console.log(`   ${index + 1}. ${status} ${test.name} (${duration}s)`);

            if (!test.passed && test.error) {
                console.log(`      Error: ${test.error}`);
            }
        });

        // Print detailed results for context injection test
        const contextTest = tests.find(t => t.name.includes('Context Injection'));
        if (contextTest && contextTest.result) {
            console.log('\n🔄 Context Injection Test Details:');
            const loops = contextTest.result.loops || {};
            console.log(`   Loop 3 Context Injection: ${loops.loop3?.contextInjected ? '✅' : '❌'}`);
            console.log(`   Loop 2 Context Enhancement: ${loops.loop2?.contextEnhanced ? '✅' : '❌'}`);
            console.log(`   Product Owner Context: ${loops.productOwner?.decisionContext ? '✅' : '❌'}`);
        }

        // Print detailed results for Redis key validation test
        const redisTest = tests.find(t => t.name.includes('Redis Key'));
        if (redisTest && redisTest.result) {
            console.log('\n🔑 Redis Key Structure Details:');
            const patterns = redisTest.result.keyPatterns || {};
            const validPatterns = Object.values(patterns).filter(p => p.valid).length;
            const totalPatterns = Object.keys(patterns).length;
            console.log(`   Key Pattern Validation: ${validPatterns}/${totalPatterns} valid`);
            console.log(`   Keys Analyzed: ${redisTest.result.keysAnalyzed || 0}`);
            console.log(`   Pattern Consistency: ${redisTest.result.keyAnalysis?.patternConsistency || 0}%`);
        }

        // Print detailed results for Product Owner decision test
        const poTest = tests.find(t => t.name.includes('Product Owner'));
        if (poTest && poTest.result) {
            console.log('\n👑 Product Owner Decision Flow Details:');
            const decisions = poTest.result.decisions || {};
            console.log(`   PROCEED Decisions: ${decisions.proceed?.count || 0}`);
            console.log(`   ITERATE Decisions: ${decisions.iterate?.count || 0}`);
            console.log(`   ABORT Decisions: ${decisions.abort?.count || 0}`);

            const context = poTest.result.contextValidation || {};
            const validContext = Object.values(context).filter(v => v === true).length;
            console.log(`   Context Validation: ${validContext}/4 components valid`);
        }

        console.log('\n' + '='.repeat(60));
    }

    async saveResults() {
        // Save combined results
        const fs = require('fs').promises;
        const path = require('path');

        const projectRoot = path.resolve(__dirname, '../../..');
        const testResultsDir = path.join(projectRoot, 'test-results', 'hello-world-docker', 'specialized');

        // Ensure directory exists
        await fs.mkdir(testResultsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultsFile = path.join(testResultsDir, `specialized-test-results-${timestamp}.json`);

        const resultsData = {
            ...this.testResults,
            projectRoot,
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            },
            testConfiguration: {
                runner: 'Specialized CFN Docker Test Runner',
                version: '1.0.0',
                testSuite: 'Context Injection, Redis Validation, Product Owner Decision Flow'
            }
        };

        await fs.writeFile(resultsFile, JSON.stringify(resultsData, null, 2));
        console.log(`💾 Combined test results saved to: ${resultsFile}`);

        // Also save a latest copy
        const latestFile = path.join(testResultsDir, 'latest-specialized-results.json');
        await fs.writeFile(latestFile, JSON.stringify(resultsData, null, 2));

        return resultsFile;
    }

    async runContextInjectionOnly() {
        return await this.run('context');
    }

    async runRedisKeyValidationOnly() {
        return await this.run('redis');
    }

    async runProductOwnerDecisionOnly() {
        return await this.run('product-owner');
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    let filter = null;

    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--test' || arg === '-t') {
            filter = args[i + 1];
            i++; // Skip next argument
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
CFN Docker Specialized Test Runner

Usage: node specialized-test-runner.cjs [options]

Options:
  --test, -t <filter>    Run specific test(s)
                          Filters: 'context', 'redis', 'product-owner'
  --help, -h            Show this help message

Examples:
  node specialized-test-runner.cjs                 # Run all tests
  node specialized-test-runner.cjs --test context  # Run context injection only
  node specialized-test-runner.cjs -t redis        # Run Redis validation only

Available Tests:
  1. Context Injection Between CFN Loops
  2. Redis Key Structure Validation
  3. Product Owner Decision Flow
            `);
            process.exit(0);
        }
    }

    const runner = new SpecializedTestRunner();

    try {
        const results = await runner.run(filter);

        // Exit with appropriate code
        process.exit(results.summary.failedTests === 0 ? 0 : 1);

    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
        process.exit(1);
    }
}

// Export for programmatic use
module.exports = SpecializedTestRunner;

// Run if called directly
if (require.main === module) {
    main();
}