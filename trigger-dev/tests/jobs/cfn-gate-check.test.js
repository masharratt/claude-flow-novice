/**
 * CFN Gate Check Job Tests
 * Tests gate check logic for Loop 3 validation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getThresholdConfig, } from '../../src/types/cfn-types';
// Mock trigger.dev SDK
vi.mock('@trigger.dev/sdk/v3', () => ({
    task: vi.fn((config) => ({
        id: config.id,
        run: config.run,
        trigger: vi.fn((payload) => config.run(payload)),
    })),
    logger: {
        log: vi.fn(),
        error: vi.fn(),
    },
}));
// Helper to create agent result
function createAgentResult(passed, failed, agentId = 'agent-001') {
    const total = passed + failed;
    return {
        agentId,
        agentType: 'backend-developer',
        confidence: total > 0 ? passed / total : 0,
        deliverables: { files: [], summary: 'Test' },
        testResults: {
            total,
            passed,
            failed,
            passRate: total > 0 ? passed / total : 0,
        },
        completedAt: new Date().toISOString(),
    };
}
// Gate check calculation functions (extracted from job)
function calculateAggregatePassRate(agentResults) {
    const totalPassed = agentResults.reduce((sum, result) => sum + result.testResults.passed, 0);
    const totalTests = agentResults.reduce((sum, result) => sum + result.testResults.total, 0);
    if (totalTests === 0)
        return 0;
    return totalPassed / totalTests;
}
function buildGateReason(passRate, threshold, agentResults) {
    const passPercentage = (passRate * 100).toFixed(1);
    const thresholdPercentage = (threshold * 100).toFixed(1);
    if (passRate >= threshold) {
        return `Gate PASSED: ${passPercentage}% pass rate meets ${thresholdPercentage}% threshold`;
    }
    const lowestPerformer = agentResults.reduce((prev, current) => current.testResults.passRate < prev.testResults.passRate ? current : prev);
    return `Gate FAILED: ${passPercentage}% pass rate below ${thresholdPercentage}% threshold. Lowest: ${lowestPerformer.agentId}`;
}
describe('CFN Gate Check Job', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe('Pass Rate Aggregation', () => {
        it('should calculate pass rate from single agent', () => {
            const agentResults = [createAgentResult(95, 5)];
            const passRate = calculateAggregatePassRate(agentResults);
            expect(passRate).toBe(0.95);
        });
        it('should aggregate pass rates from multiple agents', () => {
            const agentResults = [
                createAgentResult(90, 10, 'agent-1'),
                createAgentResult(100, 0, 'agent-2'),
            ];
            // Total: 190 passed, 200 tests = 0.95
            const passRate = calculateAggregatePassRate(agentResults);
            expect(passRate).toBe(0.95);
        });
        it('should weight by test count not average', () => {
            const agentResults = [
                createAgentResult(80, 20, 'agent-1'), // 80% of 100 tests
                createAgentResult(10, 0, 'agent-2'), // 100% of 10 tests
            ];
            // Total: 90 passed, 110 tests = 0.818...
            const passRate = calculateAggregatePassRate(agentResults);
            expect(passRate).toBeCloseTo(0.818, 2);
        });
        it('should handle zero total tests', () => {
            const agentResults = [createAgentResult(0, 0)];
            const passRate = calculateAggregatePassRate(agentResults);
            expect(passRate).toBe(0);
        });
        it('should handle many agents', () => {
            const agentResults = [
                createAgentResult(95, 5, 'agent-1'),
                createAgentResult(96, 4, 'agent-2'),
                createAgentResult(94, 6, 'agent-3'),
                createAgentResult(97, 3, 'agent-4'),
                createAgentResult(93, 7, 'agent-5'),
            ];
            // Total: 475 passed, 500 tests = 0.95
            const passRate = calculateAggregatePassRate(agentResults);
            expect(passRate).toBe(0.95);
        });
    });
    describe('Threshold Comparison by Mode', () => {
        describe('MVP Mode (threshold: 0.70)', () => {
            const threshold = getThresholdConfig('mvp').loop3PassRateThreshold;
            it('should pass gate at exactly 70%', () => {
                const agentResults = [createAgentResult(70, 30)];
                const passRate = calculateAggregatePassRate(agentResults);
                const passed = passRate >= threshold;
                expect(passed).toBe(true);
            });
            it('should pass gate above 70%', () => {
                const agentResults = [createAgentResult(75, 25)];
                const passRate = calculateAggregatePassRate(agentResults);
                const passed = passRate >= threshold;
                expect(passed).toBe(true);
            });
            it('should fail gate below 70%', () => {
                const agentResults = [createAgentResult(69, 31)];
                const passRate = calculateAggregatePassRate(agentResults);
                const passed = passRate >= threshold;
                expect(passed).toBe(false);
            });
        });
        describe('Standard Mode (threshold: 0.95)', () => {
            const threshold = getThresholdConfig('standard').loop3PassRateThreshold;
            it('should pass gate at exactly 95%', () => {
                const agentResults = [createAgentResult(95, 5)];
                const passRate = calculateAggregatePassRate(agentResults);
                const passed = passRate >= threshold;
                expect(passed).toBe(true);
            });
            it('should pass gate above 95%', () => {
                const agentResults = [createAgentResult(98, 2)];
                const passRate = calculateAggregatePassRate(agentResults);
                const passed = passRate >= threshold;
                expect(passed).toBe(true);
            });
            it('should fail gate at 94%', () => {
                const agentResults = [createAgentResult(94, 6)];
                const passRate = calculateAggregatePassRate(agentResults);
                const passed = passRate >= threshold;
                expect(passed).toBe(false);
            });
            it('should fail gate significantly below threshold', () => {
                const agentResults = [createAgentResult(80, 20)];
                const passRate = calculateAggregatePassRate(agentResults);
                const passed = passRate >= threshold;
                expect(passed).toBe(false);
            });
        });
        describe('Enterprise Mode (threshold: 0.98)', () => {
            const threshold = getThresholdConfig('enterprise').loop3PassRateThreshold;
            it('should pass gate at exactly 98%', () => {
                const agentResults = [createAgentResult(98, 2)];
                const passRate = calculateAggregatePassRate(agentResults);
                const passed = passRate >= threshold;
                expect(passed).toBe(true);
            });
            it('should pass gate above 98%', () => {
                const agentResults = [createAgentResult(100, 0)];
                const passRate = calculateAggregatePassRate(agentResults);
                const passed = passRate >= threshold;
                expect(passed).toBe(true);
            });
            it('should fail gate at 97%', () => {
                const agentResults = [createAgentResult(97, 3)];
                const passRate = calculateAggregatePassRate(agentResults);
                const passed = passRate >= threshold;
                expect(passed).toBe(false);
            });
            it('should fail gate at 95% (Standard threshold)', () => {
                const agentResults = [createAgentResult(95, 5)];
                const passRate = calculateAggregatePassRate(agentResults);
                const passed = passRate >= threshold;
                expect(passed).toBe(false);
            });
        });
    });
    describe('Gate Decision Result', () => {
        it('should build passing gate result', () => {
            const agentResults = [createAgentResult(96, 4)];
            const passRate = calculateAggregatePassRate(agentResults);
            const threshold = 0.95;
            const result = {
                passed: passRate >= threshold,
                passRate,
                threshold,
                agentResults,
                reason: buildGateReason(passRate, threshold, agentResults),
                checkedAt: new Date().toISOString(),
            };
            expect(result.passed).toBe(true);
            expect(result.passRate).toBe(0.96);
            expect(result.reason).toContain('PASSED');
        });
        it('should build failing gate result', () => {
            const agentResults = [createAgentResult(90, 10)];
            const passRate = calculateAggregatePassRate(agentResults);
            const threshold = 0.95;
            const result = {
                passed: passRate >= threshold,
                passRate,
                threshold,
                agentResults,
                reason: buildGateReason(passRate, threshold, agentResults),
                checkedAt: new Date().toISOString(),
            };
            expect(result.passed).toBe(false);
            expect(result.passRate).toBe(0.90);
            expect(result.reason).toContain('FAILED');
        });
        it('should identify lowest performer in failure reason', () => {
            const agentResults = [
                createAgentResult(95, 5, 'good-agent'),
                createAgentResult(80, 20, 'bad-agent'),
            ];
            const passRate = calculateAggregatePassRate(agentResults);
            const threshold = 0.95;
            const reason = buildGateReason(passRate, threshold, agentResults);
            expect(reason).toContain('bad-agent');
        });
        it('should include all agent results in gate result', () => {
            const agentResults = [
                createAgentResult(95, 5, 'agent-1'),
                createAgentResult(96, 4, 'agent-2'),
                createAgentResult(97, 3, 'agent-3'),
            ];
            const result = {
                passed: true,
                passRate: calculateAggregatePassRate(agentResults),
                threshold: 0.95,
                agentResults,
                reason: 'Gate PASSED',
                checkedAt: new Date().toISOString(),
            };
            expect(result.agentResults).toHaveLength(3);
        });
    });
    describe('Edge Cases', () => {
        it('should handle perfect pass rate (100%)', () => {
            const agentResults = [createAgentResult(100, 0)];
            const passRate = calculateAggregatePassRate(agentResults);
            expect(passRate).toBe(1.0);
        });
        it('should handle zero pass rate (0%)', () => {
            const agentResults = [createAgentResult(0, 100)];
            const passRate = calculateAggregatePassRate(agentResults);
            expect(passRate).toBe(0);
        });
        it('should handle single test', () => {
            const agentResults = [createAgentResult(1, 0)];
            const passRate = calculateAggregatePassRate(agentResults);
            expect(passRate).toBe(1.0);
        });
        it('should handle very large test count', () => {
            const agentResults = [createAgentResult(9500, 500)];
            const passRate = calculateAggregatePassRate(agentResults);
            expect(passRate).toBe(0.95);
        });
        it('should handle mixed success agents', () => {
            const agentResults = [
                createAgentResult(100, 0, 'perfect'), // 100%
                createAgentResult(0, 100, 'failing'), // 0%
            ];
            // Total: 100 passed, 200 tests = 0.50
            const passRate = calculateAggregatePassRate(agentResults);
            expect(passRate).toBe(0.5);
        });
    });
    describe('Threshold Configuration', () => {
        it('should return correct MVP thresholds', () => {
            const config = getThresholdConfig('mvp');
            expect(config.loop3PassRateThreshold).toBe(0.70);
            expect(config.loop2ConsensusThreshold).toBe(0.80);
            expect(config.validatorCount).toBe(2);
            expect(config.maxIterations).toBe(5);
        });
        it('should return correct Standard thresholds', () => {
            const config = getThresholdConfig('standard');
            expect(config.loop3PassRateThreshold).toBe(0.95);
            expect(config.loop2ConsensusThreshold).toBe(0.90);
            expect(config.validatorCount).toBe(3);
            expect(config.maxIterations).toBe(10);
        });
        it('should return correct Enterprise thresholds', () => {
            const config = getThresholdConfig('enterprise');
            expect(config.loop3PassRateThreshold).toBe(0.98);
            expect(config.loop2ConsensusThreshold).toBe(0.95);
            expect(config.validatorCount).toBe(5);
            expect(config.maxIterations).toBe(15);
        });
    });
});
//# sourceMappingURL=cfn-gate-check.test.js.map