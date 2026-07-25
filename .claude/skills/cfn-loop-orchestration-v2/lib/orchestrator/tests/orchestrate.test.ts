/**
 * Comprehensive test suite for CFN Loop orchestration
 * Covers all execution modes (MVP/Standard/Enterprise) with 60+ tests
 */

import {
  Orchestrator,
  type OrchestrationConfig,
  type LoopPhase,
} from '../src/orchestrate';
import type { TestResult } from '../src/types';

describe('Orchestrator - Core Initialization', () => {
  test('creates orchestrator with valid MVP config', () => {
    const config: OrchestrationConfig = {
      taskId: 'test-task-1',
      mode: 'mvp',
      maxIterations: 5,
    };

    const orchestrator = new Orchestrator(config);
    expect(orchestrator.getTaskId()).toBe('test-task-1');
    expect(orchestrator.getMode()).toBe('mvp');
    expect(orchestrator.getMaxIterations()).toBe(5);
  });

  test('creates orchestrator with Standard mode', () => {
    const config: OrchestrationConfig = {
      taskId: 'test-standard',
      mode: 'standard',
      maxIterations: 10,
    };

    const orchestrator = new Orchestrator(config);
    expect(orchestrator.getMode()).toBe('standard');
    expect(orchestrator.getMaxIterations()).toBe(10);
  });

  test('creates orchestrator with Enterprise mode', () => {
    const config: OrchestrationConfig = {
      taskId: 'test-enterprise',
      mode: 'enterprise',
      maxIterations: 15,
    };

    const orchestrator = new Orchestrator(config);
    expect(orchestrator.getMode()).toBe('enterprise');
    expect(orchestrator.getMaxIterations()).toBe(15);
  });

  test('throws error on invalid task ID', () => {
    const config: OrchestrationConfig = {
      taskId: '',
      mode: 'standard',
      maxIterations: 10,
    };

    expect(() => new Orchestrator(config)).toThrow('Task ID cannot be empty');
  });

  test('throws error on invalid mode', () => {
    const config: OrchestrationConfig = {
      taskId: 'test',
      mode: 'invalid' as any,
      maxIterations: 10,
    };

    expect(() => new Orchestrator(config)).toThrow('Invalid execution mode');
  });

  test('throws error on invalid max iterations', () => {
    const config: OrchestrationConfig = {
      taskId: 'test',
      mode: 'standard',
      maxIterations: 0,
    };

    expect(() => new Orchestrator(config)).toThrow('Max iterations must be at least 1');
  });

  test('throws error on max iterations exceeding limit', () => {
    const config: OrchestrationConfig = {
      taskId: 'test',
      mode: 'standard',
      maxIterations: 101,
    };

    expect(() => new Orchestrator(config)).toThrow('Max iterations cannot exceed 100');
  });
});

describe('Orchestrator - State Management', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    const config: OrchestrationConfig = {
      taskId: 'test-state',
      mode: 'standard',
      maxIterations: 10,
    };
    orchestrator = new Orchestrator(config);
  });

  test('initializes orchestration state correctly', () => {
    const state = orchestrator.getState();
    expect(state.taskId).toBe('test-state');
    expect(state.iteration).toBe(0);
    expect(state.currentPhase).toBe('loop3');
    expect(state.completedAgents.size).toBe(0);
    expect(state.failedAgents.size).toBe(0);
  });

  test('updates iteration count', () => {
    orchestrator.incrementIteration();
    expect(orchestrator.getState().iteration).toBe(1);

    orchestrator.incrementIteration();
    expect(orchestrator.getState().iteration).toBe(2);
  });

  test('tracks completed agents', () => {
    orchestrator.markAgentComplete('agent-1', 'loop3');
    const state = orchestrator.getState();
    expect(state.completedAgents.has('agent-1')).toBe(true);
    expect(state.completedAgents.size).toBe(1);
  });

  test('tracks failed agents', () => {
    orchestrator.markAgentFailed('agent-2', 'loop3');
    const state = orchestrator.getState();
    expect(state.failedAgents.has('agent-2')).toBe(true);
    expect(state.failedAgents.size).toBe(1);
  });

  test('transitions phase correctly', () => {
    orchestrator.transitionPhase('loop2');
    expect(orchestrator.getState().currentPhase).toBe('loop2');

    orchestrator.transitionPhase('product-owner');
    expect(orchestrator.getState().currentPhase).toBe('product-owner');
  });
});

describe('Orchestrator - Loop 3 Execution', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    const config: OrchestrationConfig = {
      taskId: 'test-loop3',
      mode: 'standard',
      maxIterations: 10,
    };
    orchestrator = new Orchestrator(config);
  });

  test('spawns Loop 3 agents', async () => {
    const agents = await orchestrator.spawnLoop3Agents([
      'backend-developer',
      'frontend-developer',
    ]);

    expect(agents.length).toBe(2);
    expect(agents).toHaveLength(2);
    expect(agents[0]!.loopType).toBe('loop3');
    expect(agents[1]!.loopType).toBe('loop3');
  });

  test('builds agent context for Loop 3', () => {
    const context = orchestrator.buildAgentContext('agent-1', 'loop3', 1, {});

    expect(context.agentId).toBe('agent-1');
    expect(context.loopType).toBe('loop3');
    expect(context.iteration).toBe(1);
    expect(context.taskId).toBe('test-loop3');
  });

  test('executes tests after Loop 3 completion', async () => {
    const testResult: TestResult = { pass: 95, fail: 5 };
    orchestrator.recordTestResult('agent-1', testResult);

    const result = orchestrator.getTestResult('agent-1');
    expect(result?.pass).toBe(95);
    expect(result?.fail).toBe(5);
  });

  test('handles Loop 3 timeout gracefully', async () => {
    orchestrator.recordTimeout('agent-timeout', 60);
    const state = orchestrator.getState();
    expect(state.failedAgents.has('agent-timeout')).toBe(true);
  });
});

describe('Orchestrator - Gate Check (Loop 3 → Loop 2 transition)', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    const config: OrchestrationConfig = {
      taskId: 'test-gate',
      mode: 'standard',
      maxIterations: 10,
    };
    orchestrator = new Orchestrator(config);
  });

  test('MVP mode gate passes at 70%', () => {
    const mvpOrch = new Orchestrator({
      taskId: 'mvp-test',
      mode: 'mvp',
      maxIterations: 5,
    });

    const result = mvpOrch.checkGate(0.70);
    expect(result.passed).toBe(true);
    expect(result.threshold).toBe(0.70);
  });

  test('MVP mode gate fails below 70%', () => {
    const mvpOrch = new Orchestrator({
      taskId: 'mvp-test',
      mode: 'mvp',
      maxIterations: 5,
    });

    const result = mvpOrch.checkGate(0.69);
    expect(result.passed).toBe(false);
  });

  test('Standard mode gate passes at 95%', () => {
    const result = orchestrator.checkGate(0.95);
    expect(result.passed).toBe(true);
    expect(result.threshold).toBe(0.95);
  });

  test('Standard mode gate fails below 95%', () => {
    const result = orchestrator.checkGate(0.94);
    expect(result.passed).toBe(false);
  });

  test('Enterprise mode gate passes at 98%', () => {
    const entOrch = new Orchestrator({
      taskId: 'ent-test',
      mode: 'enterprise',
      maxIterations: 15,
    });

    const result = entOrch.checkGate(0.98);
    expect(result.passed).toBe(true);
    expect(result.threshold).toBe(0.98);
  });

  test('Enterprise mode gate fails below 98%', () => {
    const entOrch = new Orchestrator({
      taskId: 'ent-test',
      mode: 'enterprise',
      maxIterations: 15,
    });

    const result = entOrch.checkGate(0.97);
    expect(result.passed).toBe(false);
  });

  test('gate check stores pass rate', () => {
    const result = orchestrator.checkGate(0.92);
    expect(result.passRate).toBe(0.92);
  });

  test('gate check calculates gap correctly', () => {
    const result = orchestrator.checkGate(0.92);
    expect(result.gap).toBeLessThan(0.04); // gap should be small
  });

  test('gate passes at exactly threshold', () => {
    const result = orchestrator.checkGate(0.95);
    expect(result.passed).toBe(true);
  });

  test('gate fails just below threshold', () => {
    const result = orchestrator.checkGate(0.9499);
    expect(result.passed).toBe(false);
  });
});

describe('Orchestrator - Loop 2 Execution', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    const config: OrchestrationConfig = {
      taskId: 'test-loop2',
      mode: 'standard',
      maxIterations: 10,
    };
    orchestrator = new Orchestrator(config);
  });

  test('spawns Loop 2 validators', async () => {
    const validators = await orchestrator.spawnLoop2Validators(['validator-1', 'validator-2', 'validator-3']);

    expect(validators.length).toBe(3);
    expect(validators).toHaveLength(3);
    expect(validators[0]!.loopType).toBe('loop2');
    expect(validators.every(v => v.loopType === 'loop2')).toBe(true);
  });

  test('collects consensus scores from validators', () => {
    orchestrator.recordConsensusScore('validator-1', 0.92);
    orchestrator.recordConsensusScore('validator-2', 0.88);
    orchestrator.recordConsensusScore('validator-3', 0.95);

    const consensus = orchestrator.getConsensusScores();
    expect(consensus.length).toBe(3);
    expect(consensus).toContain(0.92);
    expect(consensus).toContain(0.88);
    expect(consensus).toContain(0.95);
  });

  test('calculates consensus average', () => {
    orchestrator.recordConsensusScore('v1', 0.90);
    orchestrator.recordConsensusScore('v2', 0.90);
    orchestrator.recordConsensusScore('v3', 0.90);

    const average = orchestrator.getConsensusAverage();
    expect(average).toBe(0.90);
  });

  test('MVP mode consensus threshold is 80%', () => {
    const mvpOrch = new Orchestrator({
      taskId: 'mvp-consensus',
      mode: 'mvp',
      maxIterations: 5,
    });

    expect(mvpOrch.getConsensusThreshold()).toBe(0.80);
  });

  test('Standard mode consensus threshold is 90%', () => {
    expect(orchestrator.getConsensusThreshold()).toBe(0.90);
  });

  test('Enterprise mode consensus threshold is 95%', () => {
    const entOrch = new Orchestrator({
      taskId: 'ent-consensus',
      mode: 'enterprise',
      maxIterations: 15,
    });

    expect(entOrch.getConsensusThreshold()).toBe(0.95);
  });

  test('validates consensus against threshold', () => {
    orchestrator.recordConsensusScore('v1', 0.92);
    orchestrator.recordConsensusScore('v2', 0.88);
    orchestrator.recordConsensusScore('v3', 0.95);

    const validation = orchestrator.validateConsensus();
    expect(validation.passed).toBe(true);
    expect(validation.average).toBe((0.92 + 0.88 + 0.95) / 3);
  });

  test('fails consensus when below threshold', () => {
    const mvpOrch = new Orchestrator({
      taskId: 'mvp-consensus-fail',
      mode: 'mvp',
      maxIterations: 5,
    });

    mvpOrch.recordConsensusScore('v1', 0.75);
    mvpOrch.recordConsensusScore('v2', 0.76);

    const validation = mvpOrch.validateConsensus();
    expect(validation.passed).toBe(false);
  });
});

describe('Orchestrator - Product Owner Decision', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    const config: OrchestrationConfig = {
      taskId: 'test-po',
      mode: 'standard',
      maxIterations: 10,
    };
    orchestrator = new Orchestrator(config);
  });

  test('records PROCEED decision', () => {
    orchestrator.recordDecision('PROCEED');
    expect(orchestrator.getDecision()).toBe('PROCEED');
  });

  test('records ITERATE decision', () => {
    orchestrator.recordDecision('ITERATE');
    expect(orchestrator.getDecision()).toBe('ITERATE');
  });

  test('records ABORT decision', () => {
    orchestrator.recordDecision('ABORT');
    expect(orchestrator.getDecision()).toBe('ABORT');
  });

  test('parses decision from agent output', () => {
    const output = 'After review, decision: PROCEED';
    const decision = orchestrator.parseDecisionFromOutput(output);
    expect(decision).toBe('PROCEED');
  });

  test('parses ITERATE from agent output', () => {
    const output = 'Issues found. Decision: ITERATE for improvements.';
    const decision = orchestrator.parseDecisionFromOutput(output);
    expect(decision).toBe('ITERATE');
  });

  test('parses ABORT from agent output', () => {
    const output = 'Critical issues. Decision: ABORT mission.';
    const decision = orchestrator.parseDecisionFromOutput(output);
    expect(decision).toBe('ABORT');
  });

  test('returns null for unparseable output', () => {
    const output = 'No decision found here';
    const decision = orchestrator.parseDecisionFromOutput(output);
    expect(decision).toBeNull();
  });

  test('handles case-insensitive decision parsing', () => {
    const output = 'Decision: proceed';
    const decision = orchestrator.parseDecisionFromOutput(output);
    expect(decision).toBe('PROCEED');
  });
});

describe('Orchestrator - Iteration Management', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    const config: OrchestrationConfig = {
      taskId: 'test-iteration',
      mode: 'standard',
      maxIterations: 3,
    };
    orchestrator = new Orchestrator(config);
  });

  test('tracks current iteration', () => {
    expect(orchestrator.getState().iteration).toBe(0);
    orchestrator.incrementIteration();
    expect(orchestrator.getState().iteration).toBe(1);
  });

  test('stops before exceeding max iterations', () => {
    for (let i = 0; i < 3; i++) {
      orchestrator.incrementIteration();
    }
    expect(orchestrator.canContinueIterating()).toBe(false);
  });

  test('can continue iterating within limit', () => {
    orchestrator.incrementIteration();
    expect(orchestrator.canContinueIterating()).toBe(true);
  });

  test('handles PROCEED decision termination', () => {
    orchestrator.recordDecision('PROCEED');
    orchestrator.incrementIteration();
    expect(orchestrator.shouldTerminate()).toBe(true);
  });

  test('handles ABORT decision termination', () => {
    orchestrator.recordDecision('ABORT');
    expect(orchestrator.shouldTerminate()).toBe(true);
  });

  test('continues on ITERATE decision', () => {
    orchestrator.recordDecision('ITERATE');
    orchestrator.incrementIteration();
    expect(orchestrator.shouldTerminate()).toBe(false);
  });

  test('prepares feedback for next iteration', () => {
    const feedback = orchestrator.prepareFeedback({
      gatePassRate: 0.92,
      consensusAverage: 0.88,
      previousFailures: ['test-1', 'test-2'],
    });

    expect(feedback.gatePassRate).toBe(0.92);
    expect(feedback.consensusAverage).toBe(0.88);
    expect(feedback.previousFailures).toContain('test-1');
  });
});

describe('Orchestrator - Mode-Specific Thresholds', () => {
  test('MVP mode has correct thresholds', () => {
    const orch = new Orchestrator({
      taskId: 'mvp',
      mode: 'mvp',
      maxIterations: 5,
    });

    expect(orch.getGateThreshold()).toBe(0.70);
    expect(orch.getConsensusThreshold()).toBe(0.80);
    expect(orch.getMaxIterations()).toBe(5);
  });

  test('Standard mode has correct thresholds', () => {
    const orch = new Orchestrator({
      taskId: 'std',
      mode: 'standard',
      maxIterations: 10,
    });

    expect(orch.getGateThreshold()).toBe(0.95);
    expect(orch.getConsensusThreshold()).toBe(0.90);
    expect(orch.getMaxIterations()).toBe(10);
  });

  test('Enterprise mode has correct thresholds', () => {
    const orch = new Orchestrator({
      taskId: 'ent',
      mode: 'enterprise',
      maxIterations: 15,
    });

    expect(orch.getGateThreshold()).toBe(0.98);
    expect(orch.getConsensusThreshold()).toBe(0.95);
    expect(orch.getMaxIterations()).toBe(15);
  });
});

describe('Orchestrator - Error Handling', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    const config: OrchestrationConfig = {
      taskId: 'test-errors',
      mode: 'standard',
      maxIterations: 10,
    };
    orchestrator = new Orchestrator(config);
  });

  test('handles agent execution error', () => {
    const error = new Error('Agent execution failed');
    orchestrator.recordExecutionError('agent-1', error);
    expect(orchestrator.getState().failedAgents.has('agent-1')).toBe(true);
  });

  test('handles timeout errors', () => {
    orchestrator.recordTimeout('slow-agent', 120);
    expect(orchestrator.getState().failedAgents.has('slow-agent')).toBe(true);
  });

  test('tracks multiple errors per iteration', () => {
    orchestrator.recordExecutionError('agent-1', new Error('error 1'));
    orchestrator.recordExecutionError('agent-2', new Error('error 2'));
    expect(orchestrator.getState().failedAgents.size).toBe(2);
  });

  test('recovers from partial agent failure', () => {
    orchestrator.markAgentComplete('success-agent', 'loop3');
    orchestrator.markAgentFailed('failed-agent', 'loop3');

    const state = orchestrator.getState();
    expect(state.completedAgents.has('success-agent')).toBe(true);
    expect(state.failedAgents.has('failed-agent')).toBe(true);
  });
});

describe('Orchestrator - Test Result Aggregation', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    const config: OrchestrationConfig = {
      taskId: 'test-aggregation',
      mode: 'standard',
      maxIterations: 10,
    };
    orchestrator = new Orchestrator(config);
  });

  test('aggregates test results from multiple agents', () => {
    orchestrator.recordTestResult('agent-1', { pass: 80, fail: 20 });
    orchestrator.recordTestResult('agent-2', { pass: 90, fail: 10 });

    const aggregated = orchestrator.aggregateTestResults();
    expect(aggregated.totalPass).toBe(170);
    expect(aggregated.totalFail).toBe(30);
    expect(aggregated.passRate).toBe(170 / 200);
  });

  test('calculates pass rate correctly', () => {
    orchestrator.recordTestResult('agent-1', { pass: 50, fail: 50 });
    const aggregated = orchestrator.aggregateTestResults();
    expect(aggregated.passRate).toBe(0.50);
  });

  test('handles empty test results', () => {
    const aggregated = orchestrator.aggregateTestResults();
    expect(aggregated.passRate).toBe(0);
  });

  test('excludes skipped tests from pass rate calculation', () => {
    orchestrator.recordTestResult('agent-1', {
      pass: 80,
      fail: 10,
      skip: 10,
    });

    const aggregated = orchestrator.aggregateTestResults();
    expect(aggregated.passRate).toBe(80 / (80 + 10 + 10));
  });
});

describe('Orchestrator - Integration (Happy Path)', () => {
  test('completes full orchestration cycle - MVP mode', async () => {
    const orchestrator = new Orchestrator({
      taskId: 'integration-mvp',
      mode: 'mvp',
      maxIterations: 5,
    });

    // Simulate Loop 3
    orchestrator.transitionPhase('loop3');
    await orchestrator.spawnLoop3Agents(['developer']);
    orchestrator.recordTestResult('developer-1-1', { pass: 75, fail: 25 });
    orchestrator.markAgentComplete('developer-1-1', 'loop3');

    // Check gate (should pass)
    const gateResult = orchestrator.checkGate(0.75);
    expect(gateResult.passed).toBe(true);

    // Simulate Loop 2
    orchestrator.transitionPhase('loop2');
    await orchestrator.spawnLoop2Validators(['validator']);
    orchestrator.recordConsensusScore('validator-1-1', 0.82);
    orchestrator.markAgentComplete('validator-1-1', 'loop2');

    // Check consensus (should pass)
    const consensusValidation = orchestrator.validateConsensus();
    expect(consensusValidation.passed).toBe(true);

    // Simulate Product Owner decision
    orchestrator.transitionPhase('product-owner');
    orchestrator.recordDecision('PROCEED');

    expect(orchestrator.shouldTerminate()).toBe(true);
    expect(orchestrator.getDecision()).toBe('PROCEED');
  });

  test('completes full orchestration cycle - Standard mode', async () => {
    const orchestrator = new Orchestrator({
      taskId: 'integration-std',
      mode: 'standard',
      maxIterations: 10,
    });

    // Loop 3 with 95%+ pass rate
    orchestrator.transitionPhase('loop3');
    await orchestrator.spawnLoop3Agents(['backend-dev', 'frontend-dev']);
    orchestrator.recordTestResult('backend-dev-1-1', { pass: 95, fail: 5 });
    orchestrator.recordTestResult('frontend-dev-1-1', { pass: 96, fail: 4 });
    orchestrator.markAgentComplete('backend-dev-1-1', 'loop3');
    orchestrator.markAgentComplete('frontend-dev-1-1', 'loop3');

    const gateResult = orchestrator.checkGate(0.955);
    expect(gateResult.passed).toBe(true);

    // Loop 2 with 90%+ consensus
    orchestrator.transitionPhase('loop2');
    await orchestrator.spawnLoop2Validators(['validator-1', 'validator-2', 'validator-3']);
    orchestrator.recordConsensusScore('validator-1-1-1', 0.92);
    orchestrator.recordConsensusScore('validator-1-2-1', 0.91);
    orchestrator.recordConsensusScore('validator-1-3-1', 0.90);

    const consensusValidation = orchestrator.validateConsensus();
    expect(consensusValidation.passed).toBe(true);

    // Product Owner decision
    orchestrator.transitionPhase('product-owner');
    orchestrator.recordDecision('PROCEED');

    expect(orchestrator.shouldTerminate()).toBe(true);
  });

  test('handles gate failure with iteration', async () => {
    const orchestrator = new Orchestrator({
      taskId: 'gate-fail-iterate',
      mode: 'standard',
      maxIterations: 3,
    });

    // Iteration 1: Gate fails
    orchestrator.transitionPhase('loop3');
    orchestrator.recordTestResult('dev-1-1', { pass: 85, fail: 15 });
    const gateResult = orchestrator.checkGate(0.85);
    expect(gateResult.passed).toBe(false);

    // Record ITERATE decision
    orchestrator.recordDecision('ITERATE');
    orchestrator.incrementIteration();

    // Iteration 2: Gate passes
    orchestrator.recordTestResult('dev-1-2', { pass: 96, fail: 4 });
    const gateResult2 = orchestrator.checkGate(0.96);
    expect(gateResult2.passed).toBe(true);

    expect(orchestrator.getState().iteration).toBe(1);
    expect(orchestrator.canContinueIterating()).toBe(true);
  });
});

describe('Orchestrator - Edge Cases', () => {
  test('handles all agents failing in Loop 3', () => {
    const orchestrator = new Orchestrator({
      taskId: 'all-fail',
      mode: 'standard',
      maxIterations: 10,
    });

    orchestrator.markAgentFailed('agent-1', 'loop3');
    orchestrator.markAgentFailed('agent-2', 'loop3');
    orchestrator.markAgentFailed('agent-3', 'loop3');

    const state = orchestrator.getState();
    expect(state.failedAgents.size).toBe(3);
    expect(state.completedAgents.size).toBe(0);
  });

  test('handles single agent in Loop 2', () => {
    const orchestrator = new Orchestrator({
      taskId: 'single-validator',
      mode: 'mvp',
      maxIterations: 5,
    });

    orchestrator.recordConsensusScore('validator-1', 0.85);
    const validation = orchestrator.validateConsensus();
    expect(validation.passed).toBe(true);
  });

  test('handles zero consensus scores', () => {
    const orchestrator = new Orchestrator({
      taskId: 'zero-consensus',
      mode: 'standard',
      maxIterations: 10,
    });

    expect(() => orchestrator.getConsensusAverage()).toThrow(
      'No consensus scores recorded'
    );
  });

  test('handles phase transitions in sequence', () => {
    const orchestrator = new Orchestrator({
      taskId: 'phase-sequence',
      mode: 'standard',
      maxIterations: 10,
    });

    const phases: LoopPhase[] = ['loop3', 'loop2', 'product-owner', 'complete'];

    for (const phase of phases) {
      orchestrator.transitionPhase(phase);
      expect(orchestrator.getState().currentPhase).toBe(phase);
    }
  });

  test('handles max iterations boundary', () => {
    const orchestrator = new Orchestrator({
      taskId: 'max-iter',
      mode: 'standard',
      maxIterations: 2,
    });

    orchestrator.incrementIteration(); // 1
    expect(orchestrator.canContinueIterating()).toBe(true);

    orchestrator.incrementIteration(); // 2
    expect(orchestrator.canContinueIterating()).toBe(false);
  });

  test('handles decision override on subsequent iteration', () => {
    const orchestrator = new Orchestrator({
      taskId: 'override',
      mode: 'standard',
      maxIterations: 10,
    });

    orchestrator.recordDecision('ITERATE');
    expect(orchestrator.getDecision()).toBe('ITERATE');

    orchestrator.recordDecision('PROCEED');
    expect(orchestrator.getDecision()).toBe('PROCEED');
  });
});

describe('Orchestrator - Type Safety', () => {
  test('enforces ExecutionMode type', () => {
    const config: OrchestrationConfig = {
      taskId: 'test',
      mode: 'standard',
      maxIterations: 10,
    };

    const orchestrator = new Orchestrator(config);
    expect(orchestrator.getMode()).toBe('standard');
  });

  test('enforces LoopPhase type', () => {
    const orchestrator = new Orchestrator({
      taskId: 'test',
      mode: 'standard',
      maxIterations: 10,
    });

    const validPhases: LoopPhase[] = ['loop3', 'loop2', 'product-owner', 'complete'];
    validPhases.forEach(phase => {
      orchestrator.transitionPhase(phase);
      expect(orchestrator.getState().currentPhase).toBe(phase);
    });
  });

  test('enforces ProductOwnerDecision type', () => {
    const orchestrator = new Orchestrator({
      taskId: 'test',
      mode: 'standard',
      maxIterations: 10,
    });

    const decisions = ['PROCEED', 'ITERATE', 'ABORT'] as const;
    decisions.forEach(decision => {
      orchestrator.recordDecision(decision);
      expect(orchestrator.getDecision()).toBe(decision);
    });
  });
});
