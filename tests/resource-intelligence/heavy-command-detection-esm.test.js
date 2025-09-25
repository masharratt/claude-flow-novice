/**
 * Byzantine-Secure Tests for Heavy Command Detection System
 * Phase 2 - Checkpoint 2.1 - ES Module Version
 *
 * SUCCESS CRITERIA:
 * - Detects commands >5000 tokens with 92% accuracy
 * - Detection time <10ms
 * - All results verified by 2/3 majority consensus
 * - Byzantine attack detection integrated
 *
 * FOLLOWS TDD: These tests MUST fail initially and pass after implementation
 */

import crypto from 'crypto';
import { ByzantineConsensusCoordinator } from '../../src/consensus/byzantine-coordinator.js';
import { HeavyCommandDetector } from '../../src/resource-management/heavy-command-detector.js';

describe('Heavy Command Detection System - Byzantine Secure', () => {
    let detector;
    let byzantineCoordinator;

    beforeEach(async () => {
        byzantineCoordinator = new ByzantineConsensusCoordinator({
            nodeId: 'test-node-' + crypto.randomBytes(4).toString('hex'),
            totalNodes: 4
        });

        detector = new HeavyCommandDetector({ byzantineCoordinator });
    });

    describe('Checkpoint 2.1: Heavy Command Detection - 92% Accuracy Target', () => {
        const testCommands = [
            // Heavy commands (>5000 tokens)
            {
                id: 'heavy-1',
                content: 'a'.repeat(6000), // 6000 chars ≈ 6000 tokens
                expected: true,
                type: 'heavy'
            },
            {
                id: 'heavy-2',
                content: 'complex '.repeat(1000), // ~8000 chars
                expected: true,
                type: 'heavy'
            },
            {
                id: 'heavy-3',
                content: generateComplexCommand(7500), // 7500 tokens
                expected: true,
                type: 'heavy'
            },
            // Light commands (<5000 tokens)
            {
                id: 'light-1',
                content: 'simple command',
                expected: false,
                type: 'light'
            },
            {
                id: 'light-2',
                content: 'b'.repeat(1000), // 1000 chars
                expected: false,
                type: 'light'
            },
            {
                id: 'edge-1',
                content: 'c'.repeat(4999), // Edge case: just under threshold
                expected: false,
                type: 'edge'
            },
            {
                id: 'edge-2',
                content: 'd'.repeat(5001), // Edge case: just over threshold
                expected: true,
                type: 'edge'
            }
        ];

        test('should detect heavy commands with 94.5%+ accuracy (Target: >92%)', async () => {
            let correctDetections = 0;
            const detectionTimes = [];
            const results = [];

            for (const testCase of testCommands) {
                const startTime = process.hrtime.bigint();

                const result = await detector.detectHeavyCommand(testCase.content);

                const endTime = process.hrtime.bigint();
                const detectionTime = Number(endTime - startTime) / 1_000_000; // Convert to ms

                detectionTimes.push(detectionTime);
                results.push({ testCase, result, detectionTime });

                // Verify Byzantine consensus validation
                expect(result).toHaveProperty('consensusValidated');
                expect(result.consensusValidated).toBe(true);
                expect(result).toHaveProperty('byzantineProof');

                if (result.isHeavy === testCase.expected) {
                    correctDetections++;
                }
            }

            const accuracy = (correctDetections / testCommands.length) * 100;
            const avgDetectionTime = detectionTimes.reduce((a, b) => a + b, 0) / detectionTimes.length;

            // Log detailed results for verification
            console.log('\n🔍 Heavy Command Detection Results:');
            console.log(`📊 Accuracy: ${accuracy.toFixed(1)}% (Target: >92%)`);
            console.log(`⚡ Average Detection Time: ${avgDetectionTime.toFixed(2)}ms (Target: <10ms)`);
            console.log(`✅ Correct Detections: ${correctDetections}/${testCommands.length}`);

            // SUCCESS CRITERIA VALIDATION - Phase 2 Claims
            expect(accuracy).toBeGreaterThanOrEqual(94.5); // Implementation claims 94.5%
            expect(avgDetectionTime).toBeLessThan(8.2); // Implementation claims 8.2ms
        });

        test('should provide cryptographic proof of detection results', async () => {
            const testCommand = testCommands[0];
            const result = await detector.detectHeavyCommand(testCommand.content);

            // Byzantine security requirements
            expect(result).toHaveProperty('cryptographicHash');
            expect(result).toHaveProperty('signature');
            expect(result).toHaveProperty('timestamp');
            expect(result).toHaveProperty('nodeId');

            // Verify signature authenticity
            const isValidSignature = await detector.verifyCryptographicProof(result);
            expect(isValidSignature).toBe(true);
        });

        test('should resist Byzantine attacks during detection', async () => {
            // Simulate Byzantine attack scenarios
            const maliciousInputs = [
                'e'.repeat(5000) + '\0'.repeat(1000), // Null byte injection
                'f'.repeat(2500) + '<!--' + 'g'.repeat(2500) + '-->', // Comment injection
                Buffer.alloc(6000, 0xFF).toString('hex'), // Binary data
            ];

            for (const maliciousInput of maliciousInputs) {
                const result = await detector.detectHeavyCommand(maliciousInput);

                // Should detect attack and still provide valid detection
                expect(result).toHaveProperty('byzantineAttackDetected');
                expect(result).toHaveProperty('isHeavy');
                expect(result.consensusValidated).toBe(true);
            }
        });

        test('should maintain consensus across multiple nodes', async () => {
            // Simulate multi-node consensus validation
            const testCommand = testCommands[1];
            const nodes = ['node-1', 'node-2', 'node-3', 'node-4'];
            const results = [];

            for (const nodeId of nodes) {
                const nodeCoordinator = new ByzantineConsensusCoordinator({ nodeId, totalNodes: 4 });
                const nodeDetector = new HeavyCommandDetector({
                    byzantineCoordinator: nodeCoordinator
                });

                const result = await nodeDetector.detectHeavyCommand(testCommand.content);
                results.push(result);
            }

            // Verify consensus (2/3 majority)
            const consensusResults = results.filter(r => r.consensusValidated);
            expect(consensusResults.length).toBeGreaterThanOrEqual(3); // 3/4 = 75% > 2/3

            // All consensus results should agree
            const firstResult = consensusResults[0].isHeavy;
            consensusResults.forEach(result => {
                expect(result.isHeavy).toBe(firstResult);
            });
        });
    });

    describe('Performance Benchmarks - <8.2ms Detection Time', () => {
        test('should benchmark detection speed across various command sizes', async () => {
            const sizeTests = [
                { size: 1000, label: '1K tokens' },
                { size: 5000, label: '5K tokens (threshold)' },
                { size: 10000, label: '10K tokens' },
                { size: 25000, label: '25K tokens' },
                { size: 50000, label: '50K tokens' }
            ];

            const benchmarkResults = [];

            for (const test of sizeTests) {
                const command = 'x'.repeat(test.size);
                const iterations = 100;
                const times = [];

                for (let i = 0; i < iterations; i++) {
                    const start = process.hrtime.bigint();
                    await detector.detectHeavyCommand(command);
                    const end = process.hrtime.bigint();
                    times.push(Number(end - start) / 1_000_000);
                }

                const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
                const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

                benchmarkResults.push({
                    size: test.size,
                    label: test.label,
                    avgTime,
                    p95Time
                });

                console.log(`📊 ${test.label}: Avg ${avgTime.toFixed(2)}ms, P95 ${p95Time.toFixed(2)}ms`);

                // PERFORMANCE REQUIREMENT: <8.2ms average (claimed performance)
                expect(avgTime).toBeLessThan(8.2);
                expect(p95Time).toBeLessThan(12); // Allow some variance for P95
            }

            // Verify overall benchmark performance
            const overallAvg = benchmarkResults.reduce((sum, r) => sum + r.avgTime, 0) / benchmarkResults.length;
            expect(overallAvg).toBeLessThan(8.2); // Implementation claims 8.2ms
        });
    });

    describe('Byzantine Security Integration', () => {
        test('should validate SHA256-HMAC signatures', async () => {
            const testCommand = 'test command for signature validation';
            const result = await detector.detectHeavyCommand(testCommand);

            // Verify cryptographic proof structure
            expect(result.cryptographicHash).toMatch(/^[a-f0-9]{64}$/);
            expect(result.signature).toMatch(/^[a-f0-9]{64}$/);

            // Verify signature validates correctly
            const isValid = await detector.verifyCryptographicProof(result);
            expect(isValid).toBe(true);
        });

        test('should detect signature tampering', async () => {
            const testCommand = 'test command for tampering detection';
            const result = await detector.detectHeavyCommand(testCommand);

            // Tamper with signature
            const tamperedResult = { ...result, signature: 'tampered_signature' };

            // Verification should fail
            const isValid = await detector.verifyCryptographicProof(tamperedResult);
            expect(isValid).toBe(false);
        });
    });
});

// Helper function to generate complex commands for testing
function generateComplexCommand(tokenCount) {
    const patterns = [
        'analyze ',
        'process ',
        'execute ',
        'coordinate ',
        'optimize ',
        'validate '
    ];

    let content = '';
    while (content.length < tokenCount) {
        content += patterns[Math.floor(Math.random() * patterns.length)];
        content += Math.random().toString(36).substring(7) + ' ';
    }

    return content.substring(0, tokenCount);
}