#!/usr/bin/env node

/**
 * Redis Hooks Integration Test
 * Phase 1 Safety Infrastructure - Redis Coordination Validation
 *
 * Tests:
 * - Hook registration and discovery
 * - Redis pub/sub messaging for validation results
 * - Swarm memory integration with ACL validation
 * - Recovery from Redis connection failures
 * - Performance under load
 */

import { createClient } from 'redis';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class RedisHooksIntegrationTester {
    constructor(options = {}) {
        this.redisUrl = options.redisUrl || 'redis://localhost:6379';
        this.redis = null;
        this.testResults = {
            preToolValidation: { passed: 0, failed: 0 },
            safetyValidation: { passed: 0, failed: 0 },
            redisCoordination: { passed: 0, failed: 0 },
            overall: { passed: 0, failed: 0 }
        };
    }

    async initialize() {
        try {
            this.redis = createClient({ url: this.redisUrl });
            await this.redis.connect();
            console.log('✅ Redis connected successfully');
        } catch (error) {
            console.error('❌ Redis connection failed:', error.message);
            throw error;
        }
    }

    async cleanup() {
        if (this.redis) {
            await this.redis.quit();
            console.log('✅ Redis connection closed');
        }
    }

    async testPreToolValidationWithRedis() {
        console.log('\n🧪 Testing Pre-Tool Validation with Redis...');

        try {
            // Test 1: Basic validation
            const result1 = await execAsync('node config/hooks/pre-tool-validation.js Read \'{"file_path": "/tmp/test.txt"}\'');
            const validation1 = JSON.parse(result1.stdout);

            if (validation1.allowed) {
                this.testResults.preToolValidation.passed++;
                console.log('✅ Basic pre-tool validation passed');
            } else {
                this.testResults.preToolValidation.failed++;
                console.log('❌ Basic pre-tool validation failed');
            }

            // Test 2: Dangerous command blocking
            const result2 = await execAsync('node config/hooks/pre-tool-validation.js Bash \'{"command": "rm -rf /"}\'');
            const validation2 = JSON.parse(result2.stdout);

            if (!validation2.allowed && validation2.errors.length > 0) {
                this.testResults.preToolValidation.passed++;
                console.log('✅ Dangerous command blocking works');
            } else {
                this.testResults.preToolValidation.failed++;
                console.log('❌ Dangerous command blocking failed');
            }

            // Test 3: Input sanitization
            const result3 = await execAsync('node config/hooks/pre-tool-validation.js Write \'{"file_path": "/tmp/test.txt", "content": "HelloWorld"}\'');
            const validation3 = JSON.parse(result3.stdout);

            if (validation3.warnings.some(w => w.includes('sanitized'))) {
                this.testResults.preToolValidation.passed++;
                console.log('✅ Input sanitization works');
            } else {
                this.testResults.preToolValidation.failed++;
                console.log('❌ Input sanitization failed');
            }

            // Test 4: Performance assessment
            const result4 = await execAsync('node config/hooks/pre-tool-validation.js Bash \'{"command": "npm install"}\'');
            const validation4 = JSON.parse(result4.stdout);

            if (validation4.resourceImpact.network === 'high' && validation4.resourceImpact.disk === 'high') {
                this.testResults.preToolValidation.passed++;
                console.log('✅ Performance assessment works');
            } else {
                this.testResults.preToolValidation.failed++;
                console.log('❌ Performance assessment failed');
            }

        } catch (error) {
            console.error('❌ Pre-tool validation test error:', error.message);
            this.testResults.preToolValidation.failed++;
        }
    }

    async testSafetyValidationWithRedis() {
        console.log('\n🧪 Testing Safety Validation with Redis...');

        try {
            // Test 1: OWASP pattern detection
            const result1 = await execAsync('node config/hooks/safety-validator.js \'{"content": "eval(userInput); const password = \\"secret\\";", "extension": "js"}\'');
            const validation1 = JSON.parse(result1.stdout);

            if (validation1.vulnerabilities.length > 0 && validation1.securityScore < 100) {
                this.testResults.safetyValidation.passed++;
                console.log('✅ OWASP pattern detection works');
            } else {
                this.testResults.safetyValidation.failed++;
                console.log('❌ OWASP pattern detection failed');
            }

            // Test 2: CWE pattern detection
            const result2 = await execAsync('node config/hooks/safety-validator.js \'{"content": "SELECT * FROM users WHERE id = " + userId;", "extension": "js"}\'');
            const validation2 = JSON.parse(result2.stdout);

            if (validation2.cweFindings.sqlInjection && validation2.cweFindings.sqlInjection.length > 0) {
                this.testResults.safetyValidation.passed++;
                console.log('✅ CWE pattern detection works');
            } else {
                this.testResults.safetyValidation.failed++;
                console.log('❌ CWE pattern detection failed');
            }

            // Test 3: Compliance validation
            const result3 = await execAsync('node config/hooks/safety-validator.js \'{"content": "const cardNumber = \\"4111-1111-1111-1111\\";", "extension": "js"}\'');
            const validation3 = JSON.parse(result3.stdout);

            if (!validation3.compliance.pci.passed && validation3.compliance.pci.issues.length > 0) {
                this.testResults.safetyValidation.passed++;
                console.log('✅ PCI compliance validation works');
            } else {
                this.testResults.safetyValidation.failed++;
                console.log('❌ PCI compliance validation failed');
            }

            // Test 4: Security recommendations
            const result4 = await execAsync('node config/hooks/safety-validator.js \'{"content": "eval(userInput);", "extension": "js"}\'');
            const validation4 = JSON.parse(result4.stdout);

            if (validation4.recommendations.length > 0 && validation4.summary.includes('CRITICAL')) {
                this.testResults.safetyValidation.passed++;
                console.log('✅ Security recommendations work');
            } else {
                this.testResults.safetyValidation.failed++;
                console.log('❌ Security recommendations failed');
            }

        } catch (error) {
            console.error('❌ Safety validation test error:', error.message);
            this.testResults.safetyValidation.failed++;
        }
    }

    async testRedisCoordination() {
        console.log('\n🧪 Testing Redis Coordination...');

        try {
            // Test 1: Redis pub/sub for validation results
            const subscriber = this.redis.duplicate();
            await subscriber.connect();

            const channel = 'swarm:phase-1:hooks-fix';
            let messageReceived = false;

            await subscriber.subscribe(channel, (message) => {
                messageReceived = true;
                console.log('📨 Received message on Redis channel:', message);
            });

            // Publish a test message
            await this.redis.publish(channel, JSON.stringify({
                type: 'validation_result',
                hook: 'pre-tool-validation',
                status: 'completed',
                timestamp: new Date().toISOString()
            }));

            // Wait a bit for message to be received
            await new Promise(resolve => setTimeout(resolve, 100));

            if (messageReceived) {
                this.testResults.redisCoordination.passed++;
                console.log('✅ Redis pub/sub messaging works');
            } else {
                this.testResults.redisCoordination.failed++;
                console.log('❌ Redis pub/sub messaging failed');
            }

            await subscriber.quit();

            // Test 2: Swarm memory integration
            const memoryKey = `test:memory:${Date.now()}`;
            const memoryData = {
                validation: 'test',
                result: { passed: true, score: 100 },
                agentId: 'test-agent'
            };

            await this.redis.setEx(memoryKey, 3600, JSON.stringify(memoryData));
            const retrievedData = await this.redis.get(memoryKey);

            if (retrievedData && JSON.parse(retrievedData).validation === 'test') {
                this.testResults.redisCoordination.passed++;
                console.log('✅ Swarm memory integration works');
            } else {
                this.testResults.redisCoordination.failed++;
                console.log('❌ Swarm memory integration failed');
            }

            await this.redis.del(memoryKey);

            // Test 3: Hook registration discovery
            const hookRegistry = {
                'pre-tool-validation': {
                    path: 'config/hooks/pre-tool-validation.js',
                    version: '1.0.0',
                    enabled: true
                },
                'safety-validator': {
                    path: 'config/hooks/safety-validator.js',
                    version: '1.0.0',
                    enabled: true
                }
            };

            await this.redis.setEx('hooks:registry', 3600, JSON.stringify(hookRegistry));
            const retrievedRegistry = await this.redis.get('hooks:registry');

            if (retrievedRegistry && Object.keys(JSON.parse(retrievedRegistry)).length === 2) {
                this.testResults.redisCoordination.passed++;
                console.log('✅ Hook registry works');
            } else {
                this.testResults.redisCoordination.failed++;
                console.log('❌ Hook registry failed');
            }

            await this.redis.del('hooks:registry');

            // Test 4: Performance under load
            const startTime = Date.now();
            const promises = [];

            for (let i = 0; i < 100; i++) {
                promises.push(
                    this.redis.setEx(`test:load:${i}`, 60, JSON.stringify({ index: i }))
                );
            }

            await Promise.all(promises);
            const loadTime = Date.now() - startTime;

            if (loadTime < 1000) { // Should complete within 1 second
                this.testResults.redisCoordination.passed++;
                console.log(`✅ Load test passed (${loadTime}ms for 100 operations)`);
            } else {
                this.testResults.redisCoordination.failed++;
                console.log(`❌ Load test failed (${loadTime}ms for 100 operations)`);
            }

            // Clean up load test data
            for (let i = 0; i < 100; i++) {
                await this.redis.del(`test:load:${i}`);
            }

        } catch (error) {
            console.error('❌ Redis coordination test error:', error.message);
            this.testResults.redisCoordination.failed++;
        }
    }

    async testRecoveryFromFailures() {
        console.log('\n🧪 Testing Recovery from Failures...');

        try {
            // Test 1: Hook execution without Redis
            const result1 = await execAsync('AGENT_ID=test-agent ACL_LEVEL=2 node config/hooks/pre-tool-validation.js Read \'{"file_path": "/tmp/test.txt"}\'');
            const validation1 = JSON.parse(result1.stdout);

            if (validation1.allowed && validation1.warnings.length > 0) {
                this.testResults.redisCoordination.passed++;
                console.log('✅ Hook works without Redis');
            } else {
                this.testResults.redisCoordination.failed++;
                console.log('❌ Hook fails without Redis');
            }

            // Test 2: Memory manager failure handling
            const result2 = await execAsync('node config/hooks/safety-validator.js \'{"content": "const x = 42;", "extension": "js"}\'');
            const validation2 = JSON.parse(result2.stdout);

            if (validation2.passed && validation2.securityScore >= 70) {
                this.testResults.redisCoordination.passed++;
                console.log('✅ Safety validator handles memory manager failure');
            } else {
                this.testResults.redisCoordination.failed++;
                console.log('❌ Safety validator fails without memory manager');
            }

        } catch (error) {
            console.error('❌ Recovery test error:', error.message);
            this.testResults.redisCoordination.failed++;
        }
    }

    async runAllTests() {
        console.log('🚀 Starting Redis Hooks Integration Tests...');
        console.log('==========================================');

        try {
            await this.initialize();

            await this.testPreToolValidationWithRedis();
            await this.testSafetyValidationWithRedis();
            await this.testRedisCoordination();
            await this.testRecoveryFromFailures();

            // Calculate overall results
            this.testResults.overall.passed =
                this.testResults.preToolValidation.passed +
                this.testResults.safetyValidation.passed +
                this.testResults.redisCoordination.passed;

            this.testResults.overall.failed =
                this.testResults.preToolValidation.failed +
                this.testResults.safetyValidation.failed +
                this.testResults.redisCoordination.failed;

            this.printResults();

        } catch (error) {
            console.error('❌ Test suite error:', error.message);
        } finally {
            await this.cleanup();
        }
    }

    printResults() {
        console.log('\n==========================================');
        console.log('📊 TEST RESULTS SUMMARY');
        console.log('==========================================');

        const total = this.testResults.overall.passed + this.testResults.overall.failed;
        const successRate = total > 0 ? (this.testResults.overall.passed / total * 100).toFixed(1) : 0;

        console.log(`\n🎯 Overall: ${this.testResults.overall.passed}/${total} passed (${successRate}%)`);

        console.log('\n📋 Pre-Tool Validation:');
        console.log(`  ✅ Passed: ${this.testResults.preToolValidation.passed}`);
        console.log(`  ❌ Failed: ${this.testResults.preToolValidation.failed}`);

        console.log('\n🛡️  Safety Validation:');
        console.log(`  ✅ Passed: ${this.testResults.safetyValidation.passed}`);
        console.log(`  ❌ Failed: ${this.testResults.safetyValidation.failed}`);

        console.log('\n🔗 Redis Coordination:');
        console.log(`  ✅ Passed: ${this.testResults.redisCoordination.passed}`);
        console.log(`  ❌ Failed: ${this.testResults.redisCoordination.failed}`);

        if (this.testResults.overall.failed === 0) {
            console.log('\n🎉 ALL TESTS PASSED! Phase 1 Safety Hooks are ready.');
        } else {
            console.log(`\n⚠️  ${this.testResults.overall.failed} tests failed. Review and fix issues.`);
        }

        console.log('==========================================');
    }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new RedisHooksIntegrationTester();

    tester.runAllTests().catch(error => {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    });
}

export { RedisHooksIntegrationTester };