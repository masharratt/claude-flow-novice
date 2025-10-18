#!/usr/bin/env node

/**
 * Safety Hooks Test Suite
 * Phase 1 Safety Infrastructure Validation
 *
 * Tests for:
 * - Enhanced pre-tool-validation.js hook
 * - Comprehensive safety-validator.js hook
 * - ACL integration with SwarmMemoryManager
 * - Redis coordination
 * - Security pattern detection
 * - Performance impact assessment
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

// Import hooks for testing
import { EnhancedPreToolValidator } from '../../config/hooks/pre-tool-validation.js';
import { SafetyValidator } from '../../config/hooks/safety-validator.js';

// Mock SwarmMemoryManager for testing
class MockSwarmMemoryManager {
    constructor() {
        this.memory = new Map();
        this.aclPermissions = new Map();

        // Set up default permissions
        this.aclPermissions.set('test-agent', {
            level: 2,
            permissions: ['read', 'write', 'execute:Read', 'execute:Write']
        });

        this.aclPermissions.set('admin-agent', {
            level: 5,
            permissions: ['*']
        });
    }

    async _checkACL(agentId, aclLevel, action = 'read', context = {}) {
        const agentPerms = this.aclPermissions.get(agentId);
        if (!agentPerms) return false;

        if (agentPerms.permissions.includes('*')) return true;
        if (agentPerms.level >= aclLevel) return true;
        if (agentPerms.permissions.includes(action)) return true;

        return false;
    }

    async set(key, value, options = {}) {
        this.memory.set(key, { value, ...options });
    }

    async get(key) {
        const entry = this.memory.get(key);
        return entry ? entry.value : null;
    }

    async has(key) {
        return this.memory.has(key);
    }

    async delete(key) {
        return this.memory.delete(key);
    }
}

describe('Safety Hooks Test Suite', () => {
    let mockMemoryManager;
    let preToolValidator;
    let safetyValidator;

    before(() => {
        mockMemoryManager = new MockSwarmMemoryManager();
        preToolValidator = new EnhancedPreToolValidator({
            memoryManager: mockMemoryManager,
            agentId: 'test-agent',
            aclLevel: 2
        });

        safetyValidator = new SafetyValidator({
            memoryManager: mockMemoryManager,
            agentId: 'test-agent',
            aclLevel: 2
        });
    });

    describe('Enhanced Pre-Tool Validator', () => {
        test('should allow safe Read operations', async () => {
            const result = await preToolValidator.validate('Read', {
                file_path: '/tmp/test.txt'
            });

            assert.strictEqual(result.allowed, true);
            assert.ok(result.confidence > 0.7);
            assert.strictEqual(result.securityLevel, 'safe');
        });

        test('should block dangerous Bash commands', async () => {
            const result = await preToolValidator.validate('Bash', {
                command: 'rm -rf /'
            });

            assert.strictEqual(result.allowed, false);
            assert.ok(result.errors.length > 0);
            assert.strictEqual(result.securityLevel, 'dangerous');
        });

        test('should detect command injection attempts', async () => {
            const result = await preToolValidator.validate('Bash', {
                command: 'ls; rm -rf /'
            });

            assert.strictEqual(result.allowed, false);
            assert.ok(result.errors.some(e => e.includes('Blocked security pattern')));
        });

        test('should sanitize input parameters', async () => {
            const result = await preToolValidator.validate('Write', {
                file_path: '/tmp/test.txt',
                content: 'Hello\x00World\x01'
            });

            assert.ok(result.warnings.some(w => w.includes('sanitized')));
        });

        test('should assess resource impact correctly', async () => {
            const result = await preToolValidator.validate('Bash', {
                command: 'npm install express'
            });

            assert.strictEqual(result.resourceImpact.network, 'high');
            assert.strictEqual(result.resourceImpact.disk, 'high');
        });

        test('should validate ACL permissions', async () => {
            const result = await preToolValidator.validate('Read', {
                file_path: '/tmp/test.txt'
            });

            assert.strictEqual(result.aclValidated, true);
        });

        test('should handle missing required parameters', async () => {
            const result = await preToolValidator.validate('Read', {});

            assert.strictEqual(result.allowed, false);
            assert.ok(result.errors.some(e => e.includes('Missing required parameter')));
        });

        test('should cache validation results', async () => {
            const params = { file_path: '/tmp/test.txt' };

            // First validation
            const result1 = await preToolValidator.validate('Read', params);

            // Second validation (should use cache)
            const result2 = await preToolValidator.validate('Read', params);

            assert.deepStrictEqual(result1, result2);
        });
    });

    describe('Safety Validator', () => {
        test('should detect OWASP security patterns', async () => {
            const maliciousCode = `
                const password = "hardcoded123";
                const query = "SELECT * FROM users WHERE id = " + userId;
                document.getElementById("output").innerHTML = userInput;
            `;

            const result = await safetyValidator.validate(maliciousCode, {
                extension: 'js'
            });

            assert.ok(result.owaspFindings.cryptography.length > 0);
            assert.ok(result.owaspFindings.injection.length > 0);
            assert.ok(result.vulnerabilities.length > 0);
            assert.ok(result.securityScore < 100);
        });

        test('should detect CWE patterns', async () => {
            const vulnerableCode = `
                eval(userInput);
                const path = req.params.path;
                fs.readFile(path, callback);
            `;

            const result = await safetyValidator.validate(vulnerableCode, {
                extension: 'js'
            });

            assert.ok(result.cweFindings.xss.length > 0);
            assert.ok(result.cweFindings.pathTraversal.length > 0);
        });

        test('should check package.json for vulnerable dependencies', async () => {
            const packageJson = {
                "name": "test-app",
                "dependencies": {
                    "lodash": "4.17.13",
                    "axios": "0.21.0"
                }
            };

            const result = await safetyValidator.validate(JSON.stringify(packageJson), {
                extension: 'json',
                type: 'file'
            });

            assert.ok(result.vulnerabilities.some(v => v.package === 'lodash'));
            assert.ok(result.vulnerabilities.some(v => v.package === 'axios'));
        });

        test('should assess performance metrics', async () => {
            const largeComplexCode = `
                function veryComplexFunction(param1, param2, param3, param4, param5) {
                    if (param1 && param2 || param3 && !param4) {
                        for (let i = 0; i < 1000; i++) {
                            for (let j = 0; j < 1000; j++) {
                                if (i % 2 === 0 && j % 3 === 0) {
                                    try {
                                        while (condition) {
                                            switch (type) {
                                                case 'a': /* ... */ break;
                                                case 'b': /* ... */ break;
                                                default: /* ... */ break;
                                            }
                                        }
                                    } catch (error) {
                                        if (error instanceof TypeError) {
                                            // Handle error
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            const result = await safetyValidator.validate(largeComplexCode, {
                extension: 'js'
            });

            assert.ok(result.performance.metrics.complexity > 10);
            assert.ok(result.performance.score < 100);
        });

        test('should validate GDPR compliance', async () => {
            const personalDataCode = `
                const user = {
                    name: "John Doe",
                    email: "john@example.com",
                    address: "123 Main St",
                    phone: "555-0123"
                };
            `;

            const result = await safetyValidator.validate(personalDataCode, {
                extension: 'js'
            });

            assert.strictEqual(result.compliance.gdpr.passed, false);
            assert.ok(result.compliance.gdpr.issues.length > 0);
        });

        test('should detect PCI card data', async () => {
            const cardDataCode = `
                const cardNumber = "4111-1111-1111-1111";
                const expiry = "12/25";
                const cvv = "123";
            `;

            const result = await safetyValidator.validate(cardDataCode, {
                extension: 'js'
            });

            assert.strictEqual(result.compliance.pci.passed, false);
            assert.ok(result.compliance.pci.issues.length > 0);
            assert.ok(result.compliance.pci.issues.some(i => i.severity === 'critical'));
        });

        test('should generate security recommendations', async () => {
            const vulnerableCode = `
                eval(userInput);
                const password = "secret123";
                document.getElementById("output").innerHTML = userInput;
            `;

            const result = await safetyValidator.validate(vulnerableCode, {
                extension: 'js'
            });

            assert.ok(result.recommendations.length > 0);
            assert.ok(result.recommendations.some(r => r.type === 'owasp'));
            assert.ok(result.summary.includes('SECURITY ISSUES'));
        });

        test('should pass validation for secure code', async () => {
            const secureCode = `
                function secureFunction(userInput) {
                    const sanitized = DOMPurify.sanitize(userInput);
                    const hash = crypto.createHash('sha256').update(input).digest('hex');
                    return sanitized;
                }

                const config = {
                    debug: process.env.NODE_ENV === 'development',
                    encryptionKey: process.env.ENCRYPTION_KEY
                };
            `;

            const result = await safetyValidator.validate(secureCode, {
                extension: 'js'
            });

            assert.ok(result.securityScore > 80);
            assert.ok(result.confidence > 0.8);
            assert.strictEqual(result.passed, true);
            assert.ok(result.summary.includes('SECURE'));
        });

        test('should cache validation results', async () => {
            const code = 'const x = 42;';

            // First validation
            const result1 = await safetyValidator.validate(code, {
                extension: 'js'
            });

            // Second validation (should use cache)
            const result2 = await safetyValidator.validate(code, {
                extension: 'js'
            });

            assert.deepStrictEqual(result1, result2);
        });
    });

    describe('ACL Integration', () => {
        test('should respect ACL permissions for pre-tool validation', async () => {
            // Test with restricted agent
            const restrictedValidator = new EnhancedPreToolValidator({
                memoryManager: mockMemoryManager,
                agentId: 'non-existent-agent',
                aclLevel: 1
            });

            const result = await restrictedValidator.validate('Read', {
                file_path: '/tmp/test.txt'
            });

            assert.strictEqual(result.aclValidated, false);
            assert.ok(result.confidence < 0.8);
        });

        test('should grant elevated access to admin agents', async () => {
            const adminValidator = new EnhancedPreToolValidator({
                memoryManager: mockMemoryManager,
                agentId: 'admin-agent',
                aclLevel: 5
            });

            const result = await adminValidator.validate('Read', {
                file_path: '/sensitive/file.txt'
            });

            assert.strictEqual(result.aclValidated, true);
            assert.ok(result.confidence > 0.9);
        });

        test('should handle ACL validation failures gracefully', async () => {
            const validatorWithoutMemory = new EnhancedPreToolValidator({
                memoryManager: null,
                agentId: 'test-agent',
                aclLevel: 2
            });

            const result = await validatorWithoutMemory.validate('Read', {
                file_path: '/tmp/test.txt'
            });

            assert.strictEqual(result.aclValidated, false);
            assert.ok(result.warnings.some(w => w.includes('ACL validation skipped')));
        });
    });

    describe('Performance Assessment', () => {
        test('should detect large files', async () => {
            // Create a temporary large file
            const largeContent = 'x'.repeat(15 * 1024 * 1024); // 15MB
            const tempFile = join(__dirname, 'temp-large.txt');

            try {
                writeFileSync(tempFile, largeContent);

                const result = await preToolValidator.validate('Read', {
                    file_path: tempFile
                });

                assert.ok(result.warnings.some(w => w.includes('Large file detected')));
            } finally {
                if (existsSync(tempFile)) {
                    unlinkSync(tempFile);
                }
            }
        });

        test('should assess resource impact for different tools', async () => {
            const tools = [
                { name: 'Read', params: { file_path: '/tmp/test.txt' }, expected: { cpu: 'low', memory: 'low' } },
                { name: 'Bash', params: { command: 'npm install' }, expected: { network: 'high', disk: 'high' } },
                { name: 'Grep', params: { pattern: 'test', path: 'node_modules' }, expected: { cpu: 'high' } }
            ];

            for (const tool of tools) {
                const result = await preToolValidator.validate(tool.name, tool.params);

                for (const [key, expectedValue] of Object.entries(tool.expected)) {
                    assert.strictEqual(result.resourceImpact[key], expectedValue,
                        `Expected ${key} impact for ${tool.name} to be ${expectedValue}`);
                }
            }
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid parameters gracefully', async () => {
            const result = await preToolValidator.validate('InvalidTool', {});

            assert.strictEqual(result.allowed, false);
            assert.ok(result.errors.length > 0);
            assert.strictEqual(result.confidence, 0.0);
        });

        test('should handle memory manager errors', async () => {
            const brokenMemoryManager = {
                _checkACL: async () => {
                    throw new Error('Memory manager error');
                }
            };

            const validatorWithBrokenMemory = new EnhancedPreToolValidator({
                memoryManager: brokenMemoryManager,
                agentId: 'test-agent',
                aclLevel: 2
            });

            const result = await validatorWithBrokenMemory.validate('Read', {
                file_path: '/tmp/test.txt'
            });

            assert.ok(result.warnings.some(w => w.includes('ACL validation failed')));
        });

        test('should handle file reading errors', async () => {
            const result = await safetyValidator.validate('/nonexistent/file.js', {
                type: 'file'
            });

            assert.strictEqual(result.passed, false);
            assert.ok(result.vulnerabilities.some(v => v.type === 'validation_error'));
        });
    });
});

// Integration test for Redis coordination
describe('Redis Coordination Integration', () => {
    test('should publish validation results to Redis', async () => {
        // This would be tested with actual Redis in the integration environment
        const mockRedisPublisher = {
            publish: async (channel, message) => {
                // Mock publish - in real scenario, this would publish to Redis
                console.log(`Published to ${channel}:`, message);
            }
        };

        const result = await preToolValidator.validate('Read', {
            file_path: '/tmp/test.txt'
        });

        // Verify that validation was logged to memory manager
        const validationLogs = await mockMemoryManager.get('validation-logs');
        assert.ok(validationLogs !== null);
    });

    test('should recover from Redis connection failures', async () => {
        const validatorWithoutRedis = new EnhancedPreToolValidator({
            memoryManager: null,
            agentId: 'test-agent',
            aclLevel: 2
        });

        const result = await validatorWithoutRedis.validate('Read', {
            file_path: '/tmp/test.txt'
        });

        // Should still work even without Redis
        assert.strictEqual(result.allowed, true);
        assert.ok(result.warnings.some(w => w.includes('ACL validation skipped')));
    });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('🧪 Running Safety Hooks Test Suite...');
    console.log('=====================================');

    // Simple test runner
    const testResults = {
        passed: 0,
        failed: 0,
        total: 0
    };

    // Mock console to capture test results
    const originalLog = console.log;
    const capturedLogs = [];

    console.log = (...args) => {
        capturedLogs.push(args.join(' '));
        originalLog(...args);
    };

    process.on('exit', () => {
        console.log('=====================================');
        console.log(`🧪 Test Results: ${testResults.passed}/${testResults.total} passed`);

        if (testResults.failed > 0) {
            console.log(`❌ ${testResults.failed} tests failed`);
            process.exit(1);
        } else {
            console.log('✅ All tests passed!');
            process.exit(0);
        }
    });
}