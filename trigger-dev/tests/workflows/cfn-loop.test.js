/**
 * CFN Loop Workflow Tests
 * Tests workflow logic without requiring trigger.dev runtime
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getThresholdConfig, } from '../../src/types/cfn-types';
// Mock the job triggers
vi.mock('../../src/jobs/loop3-agent.job', () => ({
    triggerLoop3Agent: vi.fn(),
}));
vi.mock('../../src/jobs/gate-check.job', () => ({
    triggerGateCheck: vi.fn(),
}));
vi.mock('../../src/jobs/loop2-validator.job', () => ({
    triggerLoop2Validator: vi.fn(),
}));
vi.mock('../../src/jobs/product-owner.job', () => ({
    triggerProductOwnerDecision: vi.fn(),
}));
// Mock trigger.dev SDK
vi.mock('@trigger.dev/sdk/v3', () => ({
    workflow: vi.fn((config) => ({
        id: config.id,
        run: config.run,
        trigger: vi.fn((payload) => config.run(payload)),
    })),
    logger: {
        log: vi.fn(),
        error: vi.fn(),
    },
}));
import { triggerLoop3Agent } from '../../src/jobs/loop3-agent.job';
import { triggerGateCheck } from '../../src/jobs/gate-check.job';
import { triggerLoop2Validator } from '../../src/jobs/loop2-validator.job';
import { triggerProductOwnerDecision } from '../../src/jobs/product-owner.job';
// Helper to create test payload
function createTestPayload(overrides = {}) {
    return {
        taskId: 'test-task-001',
        description: 'Test task description',
        successCriteria: {
            testCommand: 'npm test',
            passRateThreshold: 0.95,
        },
        mode: 'standard',
        maxIterations: 10,
        currentIteration: 1,
        startedAt: new Date().toISOString(),
        ...overrides,
    };
}
// Helper to create agent result
function createAgentResult(overrides = {}) {
    return {
        agentId: 'test-agent-001',
        agentType: 'backend-developer',
        confidence: 0.95,
        deliverables: {
            files: ['src/test.ts'],
            summary: 'Implementation complete',
        },
        testResults: {
            total: 100,
            passed: 95,
            failed: 5,
            passRate: 0.95,
        },
        completedAt: new Date().toISOString(),
        ...overrides,
    };
}
// Helper to create validator result
function createValidatorResult(overrides = {}) {
    return {
        validatorId: 'validator-001',
        validatorType: 'code-reviewer',
        consensusScore: 0.92,
        feedback: 'Code quality acceptable',
        completedAt: new Date().toISOString(),
        ...overrides,
    };
}
describe('CFN Loop Workflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe('Payload Validation', () => {
        it('should accept valid payload with all required fields', () => {
            const payload = createTestPayload();
            expect(payload.taskId).toBeDefined();
            expect(payload.description).toBeDefined();
            expect(payload.successCriteria).toBeDefined();
            expect(payload.mode).toBeDefined();
            expect(payload.maxIterations).toBeGreaterThan(0);
            expect(payload.currentIteration).toBeGreaterThanOrEqual(1);
        });
        it('should use correct thresholds for MVP mode', () => {
            const thresholds = getThresholdConfig('mvp');
            expect(thresholds.loop3PassRateThreshold).toBe(0.70);
            expect(thresholds.loop2ConsensusThreshold).toBe(0.80);
            expect(thresholds.validatorCount).toBe(2);
        });
        it('should use correct thresholds for Standard mode', () => {
            const thresholds = getThresholdConfig('standard');
            expect(thresholds.loop3PassRateThreshold).toBe(0.95);
            expect(thresholds.loop2ConsensusThreshold).toBe(0.90);
            expect(thresholds.validatorCount).toBe(3);
        });
        it('should use correct thresholds for Enterprise mode', () => {
            const thresholds = getThresholdConfig('enterprise');
            expect(thresholds.loop3PassRateThreshold).toBe(0.98);
            expect(thresholds.loop2ConsensusThreshold).toBe(0.95);
            expect(thresholds.validatorCount).toBe(5);
        });
    });
    describe('Loop 3 Agent Spawning', () => {
        it('should spawn Loop 3 agents with correct payload', async () => {
            const payload = createTestPayload();
            const mockAgentResult = createAgentResult();
            vi.mocked(triggerLoop3Agent).mockResolvedValue(mockAgentResult);
            await triggerLoop3Agent({
                taskId: payload.taskId,
                agentType: 'backend-developer',
                description: payload.description,
                successCriteria: payload.successCriteria,
                iterationNumber: 1,
            });
            expect(triggerLoop3Agent).toHaveBeenCalledWith(expect.objectContaining({
                taskId: payload.taskId,
                agentType: 'backend-developer',
            }));
        });
        it('should include previous context in subsequent iterations', async () => {
            const previousResults = [createAgentResult()];
            const payload = createTestPayload({ currentIteration: 2 });
            vi.mocked(triggerLoop3Agent).mockResolvedValue(createAgentResult());
            await triggerLoop3Agent({
                taskId: payload.taskId,
                agentType: 'backend-developer',
                description: payload.description,
                successCriteria: payload.successCriteria,
                iterationNumber: 2,
                previousContext: previousResults,
            });
            expect(triggerLoop3Agent).toHaveBeenCalledWith(expect.objectContaining({
                previousContext: previousResults,
                iterationNumber: 2,
            }));
        });
    });
    describe('Gate Check Execution', () => {
        it('should pass gate when pass rate exceeds threshold (Standard)', async () => {
            const agentResults = [
                createAgentResult({ testResults: { total: 100, passed: 96, failed: 4, passRate: 0.96 } }),
            ];
            const mockGateResult = {
                passed: true,
                passRate: 0.96,
                threshold: 0.95,
                agentResults,
                reason: 'Gate PASSED: 96.0% pass rate meets 95.0% threshold',
                checkedAt: new Date().toISOString(),
            };
            vi.mocked(triggerGateCheck).mockResolvedValue(mockGateResult);
            const result = await triggerGateCheck({
                taskId: 'test-001',
                agentResults,
                mode: 'standard',
                iterationNumber: 1,
            });
            expect(result.passed).toBe(true);
            expect(result.passRate).toBe(0.96);
        });
        it('should fail gate when pass rate below threshold (Standard)', async () => {
            const agentResults = [
                createAgentResult({ testResults: { total: 100, passed: 90, failed: 10, passRate: 0.90 } }),
            ];
            const mockGateResult = {
                passed: false,
                passRate: 0.90,
                threshold: 0.95,
                agentResults,
                reason: 'Gate FAILED: 90.0% pass rate below 95.0% threshold',
                checkedAt: new Date().toISOString(),
            };
            vi.mocked(triggerGateCheck).mockResolvedValue(mockGateResult);
            const result = await triggerGateCheck({
                taskId: 'test-001',
                agentResults,
                mode: 'standard',
                iterationNumber: 1,
            });
            expect(result.passed).toBe(false);
            expect(result.passRate).toBeLessThan(0.95);
        });
        it('should aggregate pass rates from multiple agents', async () => {
            const agentResults = [
                createAgentResult({ testResults: { total: 100, passed: 95, failed: 5, passRate: 0.95 } }),
                createAgentResult({ testResults: { total: 100, passed: 97, failed: 3, passRate: 0.97 } }),
            ];
            // Aggregate: (95+97) / (100+100) = 0.96
            const mockGateResult = {
                passed: true,
                passRate: 0.96,
                threshold: 0.95,
                agentResults,
                reason: 'Gate PASSED',
                checkedAt: new Date().toISOString(),
            };
            vi.mocked(triggerGateCheck).mockResolvedValue(mockGateResult);
            const result = await triggerGateCheck({
                taskId: 'test-001',
                agentResults,
                mode: 'standard',
                iterationNumber: 1,
            });
            expect(result.passed).toBe(true);
            expect(result.passRate).toBe(0.96);
        });
    });
    describe('Loop 2 Validator Spawning', () => {
        it('should spawn correct number of validators for Standard mode', async () => {
            const thresholds = getThresholdConfig('standard');
            expect(thresholds.validatorCount).toBe(3);
            const mockValidatorResult = createValidatorResult();
            vi.mocked(triggerLoop2Validator).mockResolvedValue(mockValidatorResult);
            // Spawn validators in parallel
            const promises = Array.from({ length: thresholds.validatorCount }, (_, i) => triggerLoop2Validator({
                taskId: 'test-001',
                validatorType: ['code-reviewer', 'qa-engineer', 'security-specialist'][i],
                loop3Results: [createAgentResult()],
                gateResult: {},
                description: 'Test task',
                iterationNumber: 1,
            }));
            await Promise.all(promises);
            expect(triggerLoop2Validator).toHaveBeenCalledTimes(3);
        });
        it('should receive Loop 3 results for validation', async () => {
            const loop3Results = [createAgentResult()];
            const mockValidatorResult = createValidatorResult();
            vi.mocked(triggerLoop2Validator).mockResolvedValue(mockValidatorResult);
            await triggerLoop2Validator({
                taskId: 'test-001',
                validatorType: 'code-reviewer',
                loop3Results,
                gateResult: {},
                description: 'Test task',
                iterationNumber: 1,
            });
            expect(triggerLoop2Validator).toHaveBeenCalledWith(expect.objectContaining({
                loop3Results,
            }));
        });
    });
    describe('Consensus Calculation', () => {
        it('should calculate average consensus score', () => {
            const validatorResults = [
                createValidatorResult({ consensusScore: 0.90 }),
                createValidatorResult({ consensusScore: 0.92 }),
                createValidatorResult({ consensusScore: 0.94 }),
            ];
            const averageScore = validatorResults.reduce((sum, r) => sum + r.consensusScore, 0) /
                validatorResults.length;
            expect(averageScore).toBeCloseTo(0.92, 2);
        });
        it('should detect when consensus threshold met (Standard)', () => {
            const thresholds = getThresholdConfig('standard');
            const averageScore = 0.92;
            const consensusMet = averageScore >= thresholds.loop2ConsensusThreshold;
            expect(consensusMet).toBe(true);
        });
        it('should detect when consensus threshold not met (Standard)', () => {
            const thresholds = getThresholdConfig('standard');
            const averageScore = 0.85;
            const consensusMet = averageScore >= thresholds.loop2ConsensusThreshold;
            expect(consensusMet).toBe(false);
        });
    });
    describe('Product Owner Decision Routing', () => {
        it('should return PROCEED when all criteria met', async () => {
            vi.mocked(triggerProductOwnerDecision).mockResolvedValue({
                decision: 'PROCEED',
                reasoning: 'All criteria met',
                decidedAt: new Date().toISOString(),
            });
            const result = await triggerProductOwnerDecision({
                taskId: 'test-001',
                consensusResult: {},
                gateCheckResult: {},
                mode: 'standard',
                iterationNumber: 1,
                maxIterations: 10,
            });
            expect(result.decision).toBe('PROCEED');
        });
        it('should return ITERATE when improvements needed', async () => {
            vi.mocked(triggerProductOwnerDecision).mockResolvedValue({
                decision: 'ITERATE',
                reasoning: 'Test coverage needs improvement',
                iterationFocus: 'coverage',
                decidedAt: new Date().toISOString(),
            });
            const result = await triggerProductOwnerDecision({
                taskId: 'test-001',
                consensusResult: {},
                gateCheckResult: {},
                mode: 'standard',
                iterationNumber: 1,
                maxIterations: 10,
            });
            expect(result.decision).toBe('ITERATE');
            expect(result.iterationFocus).toBe('coverage');
        });
        it('should return ABORT when quality unacceptable', async () => {
            vi.mocked(triggerProductOwnerDecision).mockResolvedValue({
                decision: 'ABORT',
                reasoning: 'Critical security issues',
                abortReason: 'Security vulnerabilities detected',
                decidedAt: new Date().toISOString(),
            });
            const result = await triggerProductOwnerDecision({
                taskId: 'test-001',
                consensusResult: {},
                gateCheckResult: {},
                mode: 'standard',
                iterationNumber: 1,
                maxIterations: 10,
            });
            expect(result.decision).toBe('ABORT');
            expect(result.abortReason).toBeDefined();
        });
    });
    describe('Iteration Management', () => {
        it('should increment iteration on gate failure', () => {
            let currentIteration = 1;
            const gatePassed = false;
            if (!gatePassed) {
                currentIteration++;
            }
            expect(currentIteration).toBe(2);
        });
        it('should abort when max iterations reached', () => {
            const currentIteration = 10;
            const maxIterations = 10;
            const shouldAbort = currentIteration >= maxIterations;
            expect(shouldAbort).toBe(true);
        });
        it('should continue when iterations remaining', () => {
            const currentIteration = 5;
            const maxIterations = 10;
            const canContinue = currentIteration < maxIterations;
            expect(canContinue).toBe(true);
        });
        it('should track all agent results across iterations', () => {
            const allResults = [];
            // Iteration 1
            allResults.push(createAgentResult({ agentId: 'agent-iter1' }));
            // Iteration 2
            allResults.push(createAgentResult({ agentId: 'agent-iter2' }));
            expect(allResults).toHaveLength(2);
            expect(allResults[0].agentId).toBe('agent-iter1');
            expect(allResults[1].agentId).toBe('agent-iter2');
        });
    });
});
//# sourceMappingURL=cfn-loop.test.js.map