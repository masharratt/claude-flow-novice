import { planErrorRecovery, buildErrorRecoveryState, buildErrorRecoveryActions } from '../../../src/planning/error-recovery/index.js';
import { PROHIBITIVE_COST } from '../../../src/planning/goap/index.js';
import type { ErrorRecoveryContext } from '../../../src/planning/error-recovery/types.js';

describe('planErrorRecovery', () => {
  it('returns retry_with_backoff for TIMEOUT error, attempt 0, circuit closed, budget available', () => {
    const ctx: ErrorRecoveryContext = {
      errorType: 'timeout',
      attemptCount: 0,
      budgetExhausted: false,
      circuitOpen: false,
      resourceAvailable: true,
      fallbackAvailable: true,
    };
    const result = planErrorRecovery(ctx);
    expect(result.reachable).toBe(true);
    expect(result.action).toBe('retry_with_backoff');
  });

  it('returns retry_with_backoff for CRASH (agent-spawn) error, attempt 1, circuit closed', () => {
    const ctx: ErrorRecoveryContext = {
      errorType: 'CRASH',
      attemptCount: 1,
      budgetExhausted: false,
      circuitOpen: false,
      resourceAvailable: true,
      fallbackAvailable: false,
    };
    const result = planErrorRecovery(ctx);
    expect(result.reachable).toBe(true);
    expect(result.action).toBe('retry_with_backoff');
  });

  it('returns escalate_to_operator when budget exhausted (attempt_count >= maxAttempts)', () => {
    const ctx: ErrorRecoveryContext = {
      errorType: 'timeout',
      attemptCount: 3,
      budgetExhausted: true,
      circuitOpen: false,
      resourceAvailable: true,
      fallbackAvailable: true,
    };
    const result = planErrorRecovery(ctx);
    expect(result.reachable).toBe(true);
    expect(result.action).toBe('escalate_to_operator');
  });

  it('returns escalate_to_operator when circuit is open (no retry possible)', () => {
    const ctx: ErrorRecoveryContext = {
      errorType: 'timeout',
      attemptCount: 0,
      budgetExhausted: false,
      circuitOpen: true,
      resourceAvailable: true,
      fallbackAvailable: false,
    };
    const result = planErrorRecovery(ctx);
    expect(result.reachable).toBe(true);
    expect(result.action).toBe('escalate_to_operator');
  });

  it('returns repair_docker_env for DOCKER error, circuit closed, attempt 0', () => {
    const ctx: ErrorRecoveryContext = {
      errorType: 'docker',
      attemptCount: 0,
      budgetExhausted: false,
      circuitOpen: false,
      resourceAvailable: true,
      fallbackAvailable: false,
    };
    const result = planErrorRecovery(ctx);
    expect(result.reachable).toBe(true);
    expect(result.action).toBe('repair_docker_env');
  });

  it('returns allocate_resources for RESOURCE error when resources available and retry already attempted (attemptCount > 0)', () => {
    const ctx: ErrorRecoveryContext = {
      errorType: 'resource',
      attemptCount: 1,
      budgetExhausted: false,
      circuitOpen: false,
      resourceAvailable: true,
      fallbackAvailable: false,
    };
    const result = planErrorRecovery(ctx);
    expect(result.reachable).toBe(true);
    expect(result.action).toBe('allocate_resources');
  });

  it('returns switch_to_fallback_agent when fallback available and VALIDATION error persists (attemptCount >= 2)', () => {
    const ctx: ErrorRecoveryContext = {
      errorType: 'validation',
      attemptCount: 2,
      budgetExhausted: false,
      circuitOpen: false,
      resourceAvailable: true,
      fallbackAvailable: true,
    };
    const result = planErrorRecovery(ctx);
    expect(result.reachable).toBe(true);
    expect(result.action).toBe('switch_to_fallback_agent');
  });

  it('returns skip_task when budget exhausted and escalation undesired (escalation cost very high)', () => {
    const ctx: ErrorRecoveryContext = {
      errorType: 'timeout',
      attemptCount: 3,
      budgetExhausted: true,
      circuitOpen: false,
      resourceAvailable: false,
      fallbackAvailable: false,
      escalateToOperatorCost: 999,
    };
    const result = planErrorRecovery(ctx);
    expect(result.reachable).toBe(true);
    expect(result.action).toBe('skip_task');
  });
});

describe('buildErrorRecoveryState', () => {
  it('maps bash categories to ErrorType correctly', () => {
    const mappings: Array<[string, string]> = [
      ['TIMEOUT', 'timeout'],
      ['CRASH', 'agent-spawn'],
      ['DEPENDENCY_FAILURE', 'dependency'],
      ['INVALID_OUTPUT', 'validation'],
      ['NO_DELIVERABLES', 'validation'],
    ];

    for (const [bashCat, expectedType] of mappings) {
      const ctx: ErrorRecoveryContext = {
        errorType: bashCat,
        attemptCount: 0,
        budgetExhausted: false,
        circuitOpen: false,
        resourceAvailable: true,
        fallbackAvailable: true,
      };
      const state = buildErrorRecoveryState(ctx);
      expect(state['error_type']).toBe(expectedType);
    }
  });
});

describe('buildErrorRecoveryActions', () => {
  it('includes all 6 recovery actions', () => {
    const ctx: ErrorRecoveryContext = {
      errorType: 'timeout',
      attemptCount: 0,
      budgetExhausted: false,
      circuitOpen: false,
      resourceAvailable: true,
      fallbackAvailable: true,
    };
    const actions = buildErrorRecoveryActions(ctx);
    const names = actions.map((a) => a.name).sort();
    expect(names).toEqual([
      'allocate_resources',
      'escalate_to_operator',
      'repair_docker_env',
      'retry_with_backoff',
      'skip_task',
      'switch_to_fallback_agent',
    ]);
  });

  it('repair_docker_env has PROHIBITIVE_COST precondition when circuit open', () => {
    const ctx: ErrorRecoveryContext = {
      errorType: 'docker',
      attemptCount: 0,
      budgetExhausted: false,
      circuitOpen: true,
      resourceAvailable: true,
      fallbackAvailable: true,
    };
    const actions = buildErrorRecoveryActions(ctx);
    const repairAction = actions.find((a) => a.name === 'repair_docker_env');
    expect(repairAction).toBeDefined();
    expect(repairAction!.cost).toBe(PROHIBITIVE_COST);
  });
});
