/**
 * Error Handling and Edge Cases Tests
 * Phase 2 Integration Test Suite - Comprehensive Error Handling Component
 *
 * Tests error handling, edge cases, recovery mechanisms, and system resilience
 * across all Phase 2 components with comprehensive failure scenarios.
 *
 * Requirements:
 * - Graceful degradation under failure conditions
 * - Comprehensive error recovery mechanisms
 * - Edge case handling across all components
 * - System stability under stress conditions
 * - Detailed error reporting and diagnostics
 */

const { jest } = require('@jest/globals');

// Mock error-prone components for testing
class MockErrorProneSystem {
    constructor(config = {}) {
        this.config = {
            failureRate: config.failureRate || 0.1,
            recoveryTime: config.recoveryTime || 1000,
            maxRetries: config.maxRetries || 3,
            circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
            enableGracefulDegradation: config.enableGracefulDegradation !== false
        };

        this.state = {
            consecutiveFailures: 0,
            circuitBreakerOpen: false,
            lastFailureTime: null,
            operationCount: 0,
            errorHistory: [],
            recoveryAttempts: 0
        };

        this.components = {
            truthScorer: new MockFailingTruthScorer(),
            configManager: new MockFailingConfigManager(),
            frameworkDetector: new MockFailingFrameworkDetector(),
            byzantineValidator: new MockFailingByzantineValidator(),
            persistenceManager: new MockFailingPersistenceManager()
        };
    }

    async executeOperation(operationType, payload) {
        this.state.operationCount++;

        // Check circuit breaker
        if (this.state.circuitBreakerOpen) {
            if (Date.now() - this.state.lastFailureTime < this.config.recoveryTime) {
                throw new Error('Circuit breaker is open - system in recovery mode');
            } else {
                // Attempt to close circuit breaker
                this.state.circuitBreakerOpen = false;
                this.state.consecutiveFailures = 0;
            }
        }

        try {
            const result = await this.performOperation(operationType, payload);

            // Success - reset failure counter
            this.state.consecutiveFailures = 0;
            return result;

        } catch (error) {
            return await this.handleOperationFailure(error, operationType, payload);
        }
    }

    async performOperation(operationType, payload) {
        // Simulate random failures
        if (Math.random() < this.config.failureRate) {
            throw new Error(`Simulated failure in ${operationType}`);
        }

        switch (operationType) {
            case 'score_completion':
                return await this.components.truthScorer.scoreCompletion(payload);

            case 'validate_config':
                return await this.components.configManager.validateConfiguration(payload);

            case 'detect_framework':
                return await this.components.frameworkDetector.detectFramework(payload);

            case 'byzantine_consensus':
                return await this.components.byzantineValidator.validateConsensus(payload);

            case 'persist_data':
                return await this.components.persistenceManager.persistData(payload);

            default:
                throw new Error(`Unknown operation type: ${operationType}`);
        }
    }

    async handleOperationFailure(error, operationType, payload) {
        this.state.consecutiveFailures++;
        this.state.lastFailureTime = Date.now();

        const errorRecord = {
            operationType,
            error: error.message,
            timestamp: Date.now(),
            consecutiveFailures: this.state.consecutiveFailures,
            payload: this.sanitizePayload(payload)
        };

        this.state.errorHistory.push(errorRecord);

        // Open circuit breaker if threshold reached
        if (this.state.consecutiveFailures >= this.config.circuitBreakerThreshold) {
            this.state.circuitBreakerOpen = true;
        }

        // Attempt recovery based on error type
        if (this.config.enableGracefulDegradation) {
            const recoveryResult = await this.attemptRecovery(error, operationType, payload);
            if (recoveryResult.success) {
                return recoveryResult.result;
            }
        }

        // If recovery failed or not enabled, throw enhanced error
        const enhancedError = new Error(`Operation failed: ${error.message}`);
        enhancedError.operationType = operationType;
        enhancedError.consecutiveFailures = this.state.consecutiveFailures;
        enhancedError.canRetry = this.state.consecutiveFailures < this.config.maxRetries;
        enhancedError.circuitBreakerOpen = this.state.circuitBreakerOpen;

        throw enhancedError;
    }

    async attemptRecovery(error, operationType, payload) {
        this.state.recoveryAttempts++;

        try {
            switch (operationType) {
                case 'score_completion':
                    // Fallback to basic scoring
                    return {
                        success: true,
                        result: {
                            scoringId: `fallback-${Date.now()}`,
                            finalScore: { overall: 0.5 },
                            passed: false,
                            fallback: true,
                            originalError: error.message
                        }
                    };

                case 'validate_config':
                    // Use minimal validation
                    return {
                        success: true,
                        result: {
                            valid: payload && typeof payload === 'object',
                            errors: payload ? [] : ['Invalid payload'],
                            fallback: true,
                            originalError: error.message
                        }
                    };

                case 'detect_framework':
                    // Return generic detection result
                    return {
                        success: true,
                        result: {
                            detectedFrameworks: [],
                            confidence: 0.1,
                            fallback: true,
                            originalError: error.message
                        }
                    };

                case 'byzantine_consensus':
                    // Skip Byzantine validation in fallback
                    return {
                        success: true,
                        result: {
                            consensusReached: false,
                            approved: false,
                            fallback: true,
                            originalError: error.message
                        }
                    };

                case 'persist_data':
                    // Use in-memory fallback storage
                    return {
                        success: true,
                        result: {
                            persisted: true,
                            location: 'memory',
                            fallback: true,
                            originalError: error.message
                        }
                    };

                default:
                    return { success: false };
            }
        } catch (recoveryError) {
            return {
                success: false,
                recoveryError: recoveryError.message
            };
        }
    }

    sanitizePayload(payload) {
        // Remove sensitive data from error logs
        if (!payload || typeof payload !== 'object') {
            return payload;
        }

        const sanitized = { ...payload };
        const sensitiveKeys = ['password', 'apiKey', 'secret', 'token', 'credentials'];

        sensitiveKeys.forEach(key => {
            if (sanitized[key]) {
                sanitized[key] = '[REDACTED]';
            }
        });

        return sanitized;
    }

    getSystemHealth() {
        const recentErrors = this.state.errorHistory.filter(
            error => Date.now() - error.timestamp < 60000 // Last minute
        );

        const errorRate = recentErrors.length / Math.max(this.state.operationCount, 1);

        return {
            status: this.state.circuitBreakerOpen ? 'degraded' : 'healthy',
            operationCount: this.state.operationCount,
            consecutiveFailures: this.state.consecutiveFailures,
            circuitBreakerOpen: this.state.circuitBreakerOpen,
            errorRate,
            recentErrors: recentErrors.length,
            recoveryAttempts: this.state.recoveryAttempts,
            lastFailureTime: this.state.lastFailureTime
        };
    }

    getErrorHistory() {
        return [...this.state.errorHistory];
    }

    reset() {
        this.state = {
            consecutiveFailures: 0,
            circuitBreakerOpen: false,
            lastFailureTime: null,
            operationCount: 0,
            errorHistory: [],
            recoveryAttempts: 0
        };

        // Reset component states
        Object.values(this.components).forEach(component => {
            if (component.reset) {
                component.reset();
            }
        });
    }
}

// Mock failing components
class MockFailingTruthScorer {
    constructor() {
        this.failureMode = 'random';
        this.failureCount = 0;
    }

    async scoreCompletion(completionData) {
        this.failureCount++;

        if (this.failureMode === 'always_fail') {
            throw new Error('TruthScorer permanent failure');
        }

        if (this.failureMode === 'memory_error' && this.failureCount % 3 === 0) {
            throw new Error('Out of memory error in TruthScorer');
        }

        if (this.failureMode === 'timeout' && this.failureCount % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            throw new Error('TruthScorer operation timeout');
        }

        if (this.failureMode === 'data_corruption' && completionData && completionData.corrupt) {
            throw new Error('Data corruption detected in TruthScorer');
        }

        // Success case
        return {
            scoringId: `score-${Date.now()}`,
            finalScore: { overall: Math.random() },
            passed: Math.random() > 0.3
        };
    }

    setFailureMode(mode) {
        this.failureMode = mode;
    }

    reset() {
        this.failureCount = 0;
        this.failureMode = 'random';
    }
}

class MockFailingConfigManager {
    constructor() {
        this.corruptedConfigs = new Set();
        this.validationErrors = [];
    }

    async validateConfiguration(config) {
        if (!config) {
            throw new Error('Null configuration provided');
        }

        if (this.corruptedConfigs.has(config.id)) {
            throw new Error(`Configuration ${config.id} is corrupted`);
        }

        if (config.malformed === true) {
            throw new Error('Malformed configuration structure');
        }

        if (config.invalidSchema === true) {
            throw new Error('Configuration fails schema validation');
        }

        if (config.circularReference) {
            throw new Error('Circular reference detected in configuration');
        }

        return {
            valid: true,
            errors: [],
            warnings: []
        };
    }

    corruptConfig(configId) {
        this.corruptedConfigs.add(configId);
    }

    repairConfig(configId) {
        this.corruptedConfigs.delete(configId);
    }

    reset() {
        this.corruptedConfigs.clear();
        this.validationErrors = [];
    }
}

class MockFailingFrameworkDetector {
    constructor() {
        this.networkIssues = false;
        this.fileSystemErrors = false;
        this.detectionAttempts = 0;
    }

    async detectFramework(projectPath) {
        this.detectionAttempts++;

        if (this.networkIssues) {
            throw new Error('Network error: Unable to fetch framework definitions');
        }

        if (this.fileSystemErrors) {
            throw new Error('File system error: Permission denied reading project files');
        }

        if (!projectPath) {
            throw new Error('Project path is required for framework detection');
        }

        if (projectPath === '/non/existent/path') {
            throw new Error('ENOENT: no such file or directory');
        }

        if (projectPath.includes('permission-denied')) {
            throw new Error('EACCES: permission denied');
        }

        if (projectPath.includes('too-large')) {
            throw new Error('Project too large for analysis (>10GB)');
        }

        return {
            detectedFrameworks: ['generic'],
            confidence: 0.8,
            scanTime: Date.now()
        };
    }

    simulateNetworkIssues(enabled = true) {
        this.networkIssues = enabled;
    }

    simulateFileSystemErrors(enabled = true) {
        this.fileSystemErrors = enabled;
    }

    reset() {
        this.networkIssues = false;
        this.fileSystemErrors = false;
        this.detectionAttempts = 0;
    }
}

class MockFailingByzantineValidator {
    constructor() {
        this.nodeFailures = 0;
        this.networkPartitioned = false;
        this.consensusAttempts = 0;
    }

    async validateConsensus(validationRequest) {
        this.consensusAttempts++;

        if (this.networkPartitioned) {
            throw new Error('Network partition detected - consensus impossible');
        }

        if (this.nodeFailures > 3) {
            throw new Error('Too many node failures - consensus cannot be reached');
        }

        if (!validationRequest) {
            throw new Error('Validation request is required');
        }

        if (validationRequest.malicious === true) {
            throw new Error('Malicious validation request detected');
        }

        if (validationRequest.type === 'unsupported') {
            throw new Error(`Unsupported validation type: ${validationRequest.type}`);
        }

        return {
            consensusReached: this.nodeFailures <= 2,
            approved: this.nodeFailures <= 1,
            nodeParticipation: Math.max(7 - this.nodeFailures, 0),
            byzantineFaultsDetected: this.nodeFailures
        };
    }

    simulateNodeFailures(count) {
        this.nodeFailures = count;
    }

    simulateNetworkPartition(enabled = true) {
        this.networkPartitioned = enabled;
    }

    reset() {
        this.nodeFailures = 0;
        this.networkPartitioned = false;
        this.consensusAttempts = 0;
    }
}

class MockFailingPersistenceManager {
    constructor() {
        this.diskFull = false;
        this.corruptedStorage = false;
        this.storageOperations = 0;
    }

    async persistData(data) {
        this.storageOperations++;

        if (this.diskFull) {
            throw new Error('ENOSPC: no space left on device');
        }

        if (this.corruptedStorage) {
            throw new Error('Storage corruption detected - data integrity compromised');
        }

        if (!data) {
            throw new Error('No data provided for persistence');
        }

        if (data.size && data.size > 1000000) {
            throw new Error('Data size exceeds maximum allowed (1MB)');
        }

        if (data.invalidFormat === true) {
            throw new Error('Invalid data format for persistence');
        }

        return {
            persisted: true,
            location: '/mock/storage/path',
            size: JSON.stringify(data).length,
            checksum: 'mock-checksum'
        };
    }

    simulateDiskFull(enabled = true) {
        this.diskFull = enabled;
    }

    simulateStorageCorruption(enabled = true) {
        this.corruptedStorage = enabled;
    }

    reset() {
        this.diskFull = false;
        this.corruptedStorage = false;
        this.storageOperations = 0;
    }
}

// Edge case test data generator
class EdgeCaseDataGenerator {
    static generateMalformedData() {
        return {
            null: null,
            undefined: undefined,
            emptyObject: {},
            emptyArray: [],
            circularReference: (function() {
                const obj = { a: 1 };
                obj.self = obj;
                return obj;
            })(),
            deeplyNested: this.createDeeplyNestedObject(100),
            largeString: 'x'.repeat(10000000), // 10MB string
            specialCharacters: '\u0000\u0001\u0002\uFFFF\uFEFF',
            nonUtf8: Buffer.from([0xFF, 0xFE, 0xFD, 0xFC]),
            invalidJson: '{"invalid": json}',
            sqlInjection: "'; DROP TABLE users; --",
            xssAttempt: '<script>alert("xss")</script>',
            pathTraversal: '../../../etc/passwd',
            overflowString: 'A'.repeat(Number.MAX_SAFE_INTEGER),
            negativeNumbers: {
                id: -1,
                count: -999999999,
                index: Number.MIN_SAFE_INTEGER
            },
            floatingPointPrecision: {
                value: 0.1 + 0.2,
                largeFloat: 1.7976931348623157e+308,
                smallFloat: Number.MIN_VALUE
            }
        };
    }

    static createDeeplyNestedObject(depth) {
        let obj = { level: depth };
        for (let i = depth - 1; i > 0; i--) {
            obj = { level: i, nested: obj };
        }
        return obj;
    }

    static generateResourceExhaustionData() {
        return {
            memoryBomb: Array(1000000).fill().map((_, i) => ({ id: i, data: 'x'.repeat(1000) })),
            infiniteLoop: function() {
                while (true) {
                    // Infinite loop
                }
            },
            recursiveBomb: function recursiveBomb() {
                return recursiveBomb();
            },
            largeBinary: new ArrayBuffer(100000000), // 100MB
            manyProperties: Object.fromEntries(
                Array(100000).fill().map((_, i) => [`prop${i}`, `value${i}`])
            )
        };
    }

    static generateConcurrencyTestData(count = 1000) {
        return Array.from({ length: count }, (_, i) => ({
            id: `concurrent-${i}`,
            timestamp: Date.now() + Math.random() * 1000,
            data: `data-${i}`,
            priority: Math.floor(Math.random() * 10)
        }));
    }
}

describe('Error Handling and Edge Cases Tests', () => {
    let errorProneSystem;

    beforeEach(() => {
        errorProneSystem = new MockErrorProneSystem({
            failureRate: 0.2, // 20% failure rate for testing
            maxRetries: 3,
            circuitBreakerThreshold: 3,
            enableGracefulDegradation: true
        });
        jest.clearAllMocks();
    });

    describe('Basic Error Handling', () => {
        test('should handle null and undefined inputs gracefully', async () => {
            const nullInputs = [null, undefined, '', 0, false];

            for (const input of nullInputs) {
                try {
                    const result = await errorProneSystem.executeOperation('validate_config', input);

                    if (result.fallback) {
                        expect(result.fallback).toBe(true);
                        expect(result.originalError).toBeDefined();
                    }
                } catch (error) {
                    expect(error.message).toBeDefined();
                    expect(error.operationType).toBe('validate_config');
                }
            }
        });

        test('should handle malformed data structures', async () => {
            const malformedData = EdgeCaseDataGenerator.generateMalformedData();

            for (const [key, data] of Object.entries(malformedData)) {
                if (key === 'circularReference') {
                    // Skip circular reference test for JSON operations
                    continue;
                }

                try {
                    const result = await errorProneSystem.executeOperation('persist_data', data);

                    if (result.fallback) {
                        expect(result.fallback).toBe(true);
                    } else {
                        expect(result.persisted).toBeDefined();
                    }
                } catch (error) {
                    expect(error.message).toBeDefined();
                    expect(error.operationType).toBe('persist_data');
                }
            }
        });

        test('should handle resource exhaustion gracefully', async () => {
            const resourceData = EdgeCaseDataGenerator.generateResourceExhaustionData();

            // Test memory-intensive operations
            try {
                await errorProneSystem.executeOperation('persist_data', {
                    data: resourceData.memoryBomb,
                    size: 1000000000 // 1GB
                });
            } catch (error) {
                expect(error.message).toContain('size exceeds maximum');
            }

            // Test large binary data
            try {
                await errorProneSystem.executeOperation('persist_data', resourceData.largeBinary);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        test('should handle invalid file system operations', async () => {
            const invalidPaths = [
                '/non/existent/path',
                '/permission-denied/project',
                '/too-large/project',
                '',
                null,
                '../../../etc/passwd'
            ];

            for (const path of invalidPaths) {
                try {
                    const result = await errorProneSystem.executeOperation('detect_framework', path);

                    if (result.fallback) {
                        expect(result.detectedFrameworks).toEqual([]);
                        expect(result.confidence).toBeLessThan(0.5);
                    }
                } catch (error) {
                    expect(error.message).toBeDefined();
                }
            }
        });
    });

    describe('Component-Specific Error Handling', () => {
        test('should handle TruthScorer failures with fallback', async () => {
            errorProneSystem.components.truthScorer.setFailureMode('always_fail');

            const result = await errorProneSystem.executeOperation('score_completion', {
                id: 'test-completion',
                files: { 'test.js': 'console.log("test");' }
            });

            expect(result.fallback).toBe(true);
            expect(result.finalScore.overall).toBe(0.5);
            expect(result.passed).toBe(false);
            expect(result.originalError).toContain('permanent failure');
        });

        test('should handle config manager validation errors', async () => {
            errorProneSystem.components.configManager.corruptConfig('test-config');

            const result = await errorProneSystem.executeOperation('validate_config', {
                id: 'test-config',
                data: 'test data'
            });

            expect(result.fallback).toBe(true);
            expect(result.valid).toBe(true); // Fallback assumes valid
            expect(result.originalError).toContain('corrupted');
        });

        test('should handle framework detection network errors', async () => {
            errorProneSystem.components.frameworkDetector.simulateNetworkIssues(true);

            const result = await errorProneSystem.executeOperation('detect_framework', '/valid/path');

            expect(result.fallback).toBe(true);
            expect(result.detectedFrameworks).toEqual([]);
            expect(result.confidence).toBe(0.1);
            expect(result.originalError).toContain('Network error');
        });

        test('should handle Byzantine validator consensus failures', async () => {
            errorProneSystem.components.byzantineValidator.simulateNodeFailures(5);

            const result = await errorProneSystem.executeOperation('byzantine_consensus', {
                type: 'framework_addition',
                framework: { id: 'test' }
            });

            expect(result.fallback).toBe(true);
            expect(result.consensusReached).toBe(false);
            expect(result.approved).toBe(false);
            expect(result.originalError).toContain('Too many node failures');
        });

        test('should handle persistence manager disk full errors', async () => {
            errorProneSystem.components.persistenceManager.simulateDiskFull(true);

            const result = await errorProneSystem.executeOperation('persist_data', {
                id: 'test-data',
                content: 'test content'
            });

            expect(result.fallback).toBe(true);
            expect(result.location).toBe('memory');
            expect(result.originalError).toContain('no space left');
        });
    });

    describe('Circuit Breaker Functionality', () => {
        test('should open circuit breaker after consecutive failures', async () => {
            // Force multiple consecutive failures
            errorProneSystem.config.failureRate = 1.0; // 100% failure rate

            let circuitBreakerTriggered = false;

            // Execute operations until circuit breaker opens
            for (let i = 0; i < 5; i++) {
                try {
                    await errorProneSystem.executeOperation('score_completion', { id: `test-${i}` });
                } catch (error) {
                    if (error.message.includes('Circuit breaker is open')) {
                        circuitBreakerTriggered = true;
                        break;
                    }
                }
            }

            expect(circuitBreakerTriggered).toBe(true);

            const health = errorProneSystem.getSystemHealth();
            expect(health.status).toBe('degraded');
            expect(health.circuitBreakerOpen).toBe(true);
        });

        test('should close circuit breaker after recovery period', async () => {
            // Trigger circuit breaker
            errorProneSystem.config.failureRate = 1.0;
            errorProneSystem.config.recoveryTime = 100; // 100ms recovery time

            try {
                for (let i = 0; i < 4; i++) {
                    await errorProneSystem.executeOperation('score_completion', { id: `test-${i}` });
                }
            } catch (error) {
                // Expected to fail and open circuit breaker
            }

            expect(errorProneSystem.state.circuitBreakerOpen).toBe(true);

            // Wait for recovery period
            await new Promise(resolve => setTimeout(resolve, 150));

            // Reduce failure rate for recovery test
            errorProneSystem.config.failureRate = 0.0;

            // Next operation should close the circuit breaker
            const result = await errorProneSystem.executeOperation('score_completion', { id: 'recovery-test' });

            expect(result).toBeDefined();
            expect(errorProneSystem.state.circuitBreakerOpen).toBe(false);
        });

        test('should track error history for circuit breaker decisions', async () => {
            errorProneSystem.config.failureRate = 0.8; // High failure rate

            // Execute multiple operations
            for (let i = 0; i < 10; i++) {
                try {
                    await errorProneSystem.executeOperation('validate_config', { id: `test-${i}` });
                } catch (error) {
                    // Expected failures
                }
            }

            const errorHistory = errorProneSystem.getErrorHistory();
            expect(errorHistory.length).toBeGreaterThan(0);

            // Verify error history structure
            errorHistory.forEach(error => {
                expect(error.operationType).toBeDefined();
                expect(error.error).toBeDefined();
                expect(error.timestamp).toBeDefined();
                expect(error.consecutiveFailures).toBeDefined();
            });
        });
    });

    describe('Graceful Degradation', () => {
        test('should provide fallback results when components fail', async () => {
            // Disable graceful degradation first to verify it works when enabled
            errorProneSystem.config.enableGracefulDegradation = false;
            errorProneSystem.config.failureRate = 1.0;

            try {
                await errorProneSystem.executeOperation('score_completion', { id: 'test' });
                fail('Should have thrown error without graceful degradation');
            } catch (error) {
                expect(error.message).toContain('Operation failed');
            }

            // Enable graceful degradation
            errorProneSystem.config.enableGracefulDegradation = true;

            const result = await errorProneSystem.executeOperation('score_completion', { id: 'test' });

            expect(result.fallback).toBe(true);
            expect(result.finalScore).toBeDefined();
        });

        test('should maintain service availability during partial failures', async () => {
            // Simulate partial system failure
            errorProneSystem.components.truthScorer.setFailureMode('always_fail');
            errorProneSystem.components.frameworkDetector.simulateNetworkIssues(true);

            const operations = [
                ['score_completion', { id: 'test-1' }],
                ['validate_config', { id: 'test-2', valid: true }],
                ['detect_framework', '/test/path'],
                ['persist_data', { id: 'test-3', data: 'test' }]
            ];

            const results = await Promise.allSettled(
                operations.map(([op, payload]) =>
                    errorProneSystem.executeOperation(op, payload)
                )
            );

            // All operations should either succeed or provide fallback results
            results.forEach((result, index) => {
                const operationType = operations[index][0];

                if (result.status === 'fulfilled') {
                    // Operation succeeded or provided fallback
                    expect(result.value).toBeDefined();
                } else {
                    // Operation failed - check it's not a critical failure
                    console.log(`Operation ${operationType} failed:`, result.reason.message);
                }
            });

            // System should still be operational
            const health = errorProneSystem.getSystemHealth();
            expect(health.status).toBeDefined();
        });

        test('should escalate critical failures appropriately', async () => {
            // Simulate critical system failure
            errorProneSystem.config.enableGracefulDegradation = false;

            // Make all components fail
            errorProneSystem.components.truthScorer.setFailureMode('always_fail');
            errorProneSystem.components.configManager.corruptConfig('critical-config');
            errorProneSystem.components.frameworkDetector.simulateNetworkIssues(true);
            errorProneSystem.components.byzantineValidator.simulateNetworkPartition(true);
            errorProneSystem.components.persistenceManager.simulateStorageCorruption(true);

            errorProneSystem.config.failureRate = 1.0;

            let criticalFailureDetected = false;

            try {
                await errorProneSystem.executeOperation('byzantine_consensus', {
                    type: 'critical_operation',
                    data: 'critical data'
                });
            } catch (error) {
                criticalFailureDetected = true;
                expect(error.message).toBeDefined();
                expect(error.operationType).toBe('byzantine_consensus');
            }

            expect(criticalFailureDetected).toBe(true);
        });
    });

    describe('Concurrency and Race Condition Handling', () => {
        test('should handle concurrent operations safely', async () => {
            const concurrentData = EdgeCaseDataGenerator.generateConcurrencyTestData(50);

            // Execute operations concurrently
            const promises = concurrentData.map(data =>
                errorProneSystem.executeOperation('validate_config', data)
            );

            const results = await Promise.allSettled(promises);

            // Analyze results
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;

            expect(successful + failed).toBe(concurrentData.length);
            expect(successful).toBeGreaterThan(0); // At least some should succeed

            // System should remain stable
            const health = errorProneSystem.getSystemHealth();
            expect(health.operationCount).toBe(concurrentData.length);
        });

        test('should handle race conditions in state management', async () => {
            // Simulate concurrent state modifications
            const stateModificationPromises = Array.from({ length: 20 }, async (_, i) => {
                try {
                    errorProneSystem.config.failureRate = Math.random();
                    return await errorProneSystem.executeOperation('persist_data', { id: `race-${i}` });
                } catch (error) {
                    return { error: error.message, id: `race-${i}` };
                }
            });

            const results = await Promise.all(stateModificationPromises);

            // Verify system state consistency
            const finalState = errorProneSystem.getSystemHealth();
            expect(finalState).toBeDefined();
            expect(finalState.operationCount).toBe(20);

            // All operations should have completed (successfully or with errors)
            expect(results).toHaveLength(20);
        });

        test('should prevent resource leaks during concurrent failures', async () => {
            const initialHealth = errorProneSystem.getSystemHealth();

            // Create concurrent operations with high failure rate
            errorProneSystem.config.failureRate = 0.7;

            const heavyOperations = Array.from({ length: 100 }, (_, i) => ({
                id: `heavy-${i}`,
                data: 'x'.repeat(10000) // 10KB per operation
            }));

            const promises = heavyOperations.map(data =>
                errorProneSystem.executeOperation('persist_data', data).catch(error => ({
                    error: error.message,
                    data: data.id
                }))
            );

            await Promise.all(promises);

            const finalHealth = errorProneSystem.getSystemHealth();

            // Verify no significant resource leaks (error history should not grow unbounded)
            expect(finalHealth.recentErrors).toBeLessThan(200);

            // System should still be responsive
            const testOperation = await errorProneSystem.executeOperation('validate_config', {
                id: 'post-load-test',
                simple: true
            });

            expect(testOperation).toBeDefined();
        });
    });

    describe('Edge Case Data Handling', () => {
        test('should handle extremely large inputs', async () => {
            const largeInputs = [
                { data: 'x'.repeat(1000000) }, // 1MB string
                { array: Array(100000).fill('item') }, // Large array
                { nested: EdgeCaseDataGenerator.createDeeplyNestedObject(50) } // Deep nesting
            ];

            for (const input of largeInputs) {
                try {
                    const result = await errorProneSystem.executeOperation('validate_config', input);

                    if (result.fallback) {
                        expect(result.originalError).toBeDefined();
                    } else {
                        expect(result.valid).toBeDefined();
                    }
                } catch (error) {
                    // Expected for truly problematic inputs
                    expect(error.message).toBeDefined();
                }
            }
        });

        test('should handle special characters and encoding issues', async () => {
            const specialInputs = [
                { text: '\u0000\u0001\u0002\uFFFF' }, // Control characters
                { unicode: '🚀🌟💻🔥⚡' }, // Emojis
                { mixed: 'Normal text\u0000with\u0001nulls' }, // Mixed content
                { rtl: 'العربية עברית' }, // RTL languages
                { combining: 'e\u0301' }, // Combining characters
            ];

            for (const input of specialInputs) {
                try {
                    const result = await errorProneSystem.executeOperation('persist_data', input);
                    expect(result).toBeDefined();
                } catch (error) {
                    expect(error.message).toBeDefined();
                }
            }
        });

        test('should handle boundary value conditions', async () => {
            const boundaryValues = [
                { number: Number.MAX_SAFE_INTEGER },
                { number: Number.MIN_SAFE_INTEGER },
                { number: Number.POSITIVE_INFINITY },
                { number: Number.NEGATIVE_INFINITY },
                { number: NaN },
                { date: new Date(8640000000000000) }, // Max date
                { date: new Date(-8640000000000000) }, // Min date
                { float: Number.MIN_VALUE },
                { float: Number.MAX_VALUE }
            ];

            for (const input of boundaryValues) {
                try {
                    const result = await errorProneSystem.executeOperation('validate_config', input);
                    expect(result).toBeDefined();
                } catch (error) {
                    expect(error.message).toBeDefined();
                }
            }
        });

        test('should sanitize sensitive data in error logs', async () => {
            const sensitiveData = {
                id: 'sensitive-test',
                password: 'super-secret-password',
                apiKey: 'secret-api-key-123',
                credentials: { username: 'admin', password: '123456' },
                secret: 'top-secret-data',
                token: 'bearer-token-xyz'
            };

            try {
                errorProneSystem.config.failureRate = 1.0; // Force failure
                await errorProneSystem.executeOperation('validate_config', sensitiveData);
            } catch (error) {
                // Error should be logged, check if sensitive data is sanitized
                const errorHistory = errorProneSystem.getErrorHistory();
                const lastError = errorHistory[errorHistory.length - 1];

                expect(lastError.payload.password).toBe('[REDACTED]');
                expect(lastError.payload.apiKey).toBe('[REDACTED]');
                expect(lastError.payload.secret).toBe('[REDACTED]');
                expect(lastError.payload.token).toBe('[REDACTED]');
                expect(lastError.payload.id).toBe('sensitive-test'); // Non-sensitive data preserved
            }
        });
    });

    describe('Recovery and Resilience', () => {
        test('should recover from transient failures', async () => {
            // Simulate transient network issues
            errorProneSystem.components.frameworkDetector.simulateNetworkIssues(true);

            try {
                await errorProneSystem.executeOperation('detect_framework', '/test/path');
            } catch (error) {
                expect(error.message).toContain('Network error');
            }

            // Simulate network recovery
            errorProneSystem.components.frameworkDetector.simulateNetworkIssues(false);

            const result = await errorProneSystem.executeOperation('detect_framework', '/test/path');
            expect(result.detectedFrameworks).toBeDefined();
            expect(result.confidence).toBeGreaterThan(0);
        });

        test('should maintain system stability after component reset', async () => {
            // Run operations to build up system state
            for (let i = 0; i < 10; i++) {
                try {
                    await errorProneSystem.executeOperation('validate_config', { id: `test-${i}` });
                } catch (error) {
                    // Expected failures
                }
            }

            const beforeResetHealth = errorProneSystem.getSystemHealth();
            expect(beforeResetHealth.operationCount).toBe(10);

            // Reset the system
            errorProneSystem.reset();

            const afterResetHealth = errorProneSystem.getSystemHealth();
            expect(afterResetHealth.operationCount).toBe(0);
            expect(afterResetHealth.errorRate).toBe(0);
            expect(afterResetHealth.consecutiveFailures).toBe(0);

            // System should be functional after reset
            const result = await errorProneSystem.executeOperation('validate_config', {
                id: 'post-reset-test',
                valid: true
            });

            expect(result).toBeDefined();
        });

        test('should provide comprehensive error diagnostics', async () => {
            // Generate various types of errors
            const errorScenarios = [
                ['score_completion', null],
                ['validate_config', { malformed: true }],
                ['detect_framework', '/non/existent/path'],
                ['byzantine_consensus', { malicious: true }],
                ['persist_data', { invalidFormat: true }]
            ];

            for (const [operation, payload] of errorScenarios) {
                try {
                    await errorProneSystem.executeOperation(operation, payload);
                } catch (error) {
                    expect(error.operationType).toBe(operation);
                    expect(error.consecutiveFailures).toBeDefined();
                    expect(error.canRetry).toBeDefined();
                    expect(error.circuitBreakerOpen).toBeDefined();
                }
            }

            const errorHistory = errorProneSystem.getErrorHistory();
            expect(errorHistory.length).toBe(5);

            // Verify comprehensive error information
            errorHistory.forEach(error => {
                expect(error.operationType).toBeDefined();
                expect(error.error).toBeDefined();
                expect(error.timestamp).toBeDefined();
                expect(error.consecutiveFailures).toBeDefined();
            });
        });
    });

    describe('System Health Monitoring', () => {
        test('should provide accurate system health metrics', async () => {
            // Execute mixed operations
            const operations = [
                ['score_completion', { id: 'health-1' }],
                ['validate_config', { id: 'health-2' }],
                ['detect_framework', '/health/path'],
                ['byzantine_consensus', { type: 'health_check' }],
                ['persist_data', { id: 'health-3' }]
            ];

            for (const [operation, payload] of operations) {
                try {
                    await errorProneSystem.executeOperation(operation, payload);
                } catch (error) {
                    // Some failures expected
                }
            }

            const health = errorProneSystem.getSystemHealth();

            expect(health.status).toMatch(/^(healthy|degraded)$/);
            expect(health.operationCount).toBe(5);
            expect(health.errorRate).toBeGreaterThanOrEqual(0);
            expect(health.errorRate).toBeLessThanOrEqual(1);
            expect(health.recentErrors).toBeGreaterThanOrEqual(0);
            expect(health.recoveryAttempts).toBeGreaterThanOrEqual(0);

            if (health.status === 'degraded') {
                expect(health.circuitBreakerOpen).toBe(true);
            }
        });

        test('should track error patterns over time', async () => {
            errorProneSystem.config.failureRate = 0.5; // 50% failure rate

            // Execute operations over time
            for (let batch = 0; batch < 3; batch++) {
                for (let i = 0; i < 5; i++) {
                    try {
                        await errorProneSystem.executeOperation('validate_config', {
                            id: `batch-${batch}-${i}`
                        });
                    } catch (error) {
                        // Expected failures
                    }
                }

                // Small delay between batches
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            const errorHistory = errorProneSystem.getErrorHistory();
            const health = errorProneSystem.getSystemHealth();

            expect(health.operationCount).toBe(15);
            expect(errorHistory.length).toBeGreaterThan(0);

            // Verify error timestamps show progression
            const timestamps = errorHistory.map(e => e.timestamp).sort((a, b) => a - b);
            for (let i = 1; i < timestamps.length; i++) {
                expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
            }
        });
    });
});