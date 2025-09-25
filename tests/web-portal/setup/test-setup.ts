/**
 * @file Test Setup and Error Scenario Configuration
 * @description Global test setup with comprehensive error scenario validation
 */

import { jest } from '@jest/globals';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to suppress logs during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Global error tracking for error scenario validation
interface ErrorScenarioTracker {
  errors: Array<{
    type: string;
    message: string;
    timestamp: string;
    context?: any;
  }>;
  expectedErrors: Set<string>;
  validationResults: Map<string, boolean>;
}

declare global {
  var errorScenarioTracker: ErrorScenarioTracker;
}

// Initialize error scenario tracker
global.errorScenarioTracker = {
  errors: [],
  expectedErrors: new Set(),
  validationResults: new Map()
};

/**
 * Global error handler for tracking test errors
 */
process.on('uncaughtException', (error) => {
  global.errorScenarioTracker.errors.push({
    type: 'uncaughtException',
    message: error.message,
    timestamp: new Date().toISOString(),
    context: { stack: error.stack }
  });
});

process.on('unhandledRejection', (reason, promise) => {
  global.errorScenarioTracker.errors.push({
    type: 'unhandledRejection',
    message: reason instanceof Error ? reason.message : String(reason),
    timestamp: new Date().toISOString(),
    context: { promise }
  });
});

// Test utilities for error scenarios
global.testUtils = {
  /**
   * Register an expected error for validation
   */
  expectError: (errorType: string, errorMessage?: string) => {
    const errorKey = errorMessage ? `${errorType}:${errorMessage}` : errorType;
    global.errorScenarioTracker.expectedErrors.add(errorKey);
  },

  /**
   * Validate that expected errors occurred
   */
  validateExpectedErrors: () => {
    const results = new Map<string, boolean>();

    global.errorScenarioTracker.expectedErrors.forEach(expectedError => {
      const [type, message] = expectedError.split(':');
      const errorOccurred = global.errorScenarioTracker.errors.some(error => {
        if (message) {
          return error.type === type && error.message.includes(message);
        }
        return error.type === type;
      });

      results.set(expectedError, errorOccurred);
    });

    global.errorScenarioTracker.validationResults = results;
    return results;
  },

  /**
   * Clear error tracking state
   */
  clearErrorTracking: () => {
    global.errorScenarioTracker = {
      errors: [],
      expectedErrors: new Set(),
      validationResults: new Map()
    };
  },

  /**
   * Get error summary for test reporting
   */
  getErrorSummary: () => {
    return {
      totalErrors: global.errorScenarioTracker.errors.length,
      expectedErrors: Array.from(global.errorScenarioTracker.expectedErrors),
      validationResults: Object.fromEntries(global.errorScenarioTracker.validationResults),
      errors: global.errorScenarioTracker.errors
    };
  },

  /**
   * Simulate network errors for testing
   */
  simulateNetworkError: (type: 'timeout' | 'disconnect' | 'slow' | 'intermittent') => {
    return new Promise((resolve, reject) => {
      switch (type) {
        case 'timeout':
          setTimeout(() => reject(new Error('Network timeout')), 5000);
          break;
        case 'disconnect':
          reject(new Error('Network disconnected'));
          break;
        case 'slow':
          setTimeout(() => resolve('Slow response'), 3000);
          break;
        case 'intermittent':
          if (Math.random() > 0.5) {
            reject(new Error('Intermittent network failure'));
          } else {
            resolve('Success after retry');
          }
          break;
      }
    });
  },

  /**
   * Simulate service degradation
   */
  simulateServiceDegradation: (degradationType: 'high_latency' | 'partial_failure' | 'resource_exhaustion') => {
    const baseLatency = 100;
    let latency = baseLatency;
    let failureRate = 0.02;

    switch (degradationType) {
      case 'high_latency':
        latency = baseLatency * 10; // 10x slower
        break;
      case 'partial_failure':
        failureRate = 0.3; // 30% failure rate
        break;
      case 'resource_exhaustion':
        latency = baseLatency * 5;
        failureRate = 0.5;
        break;
    }

    return {
      latency,
      failureRate,
      simulate: () => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            if (Math.random() < failureRate) {
              reject(new Error(`Service degradation: ${degradationType}`));
            } else {
              resolve(`Success with ${degradationType} conditions`);
            }
          }, latency);
        });
      }
    };
  },

  /**
   * Create controlled error scenarios for testing
   */
  createErrorScenario: (scenario: {
    name: string;
    errorType: string;
    triggerCondition: () => boolean;
    errorMessage?: string;
    recoveryAction?: () => void;
  }) => {
    return {
      ...scenario,
      execute: () => {
        if (scenario.triggerCondition()) {
          const error = new Error(scenario.errorMessage || `${scenario.name} error`);
          error.name = scenario.errorType;

          global.errorScenarioTracker.errors.push({
            type: scenario.errorType,
            message: error.message,
            timestamp: new Date().toISOString(),
            context: { scenario: scenario.name }
          });

          if (scenario.recoveryAction) {
            setTimeout(scenario.recoveryAction, 100);
          }

          throw error;
        }
      }
    };
  }
};

// Setup and teardown hooks
beforeEach(() => {
  // Clear error tracking before each test
  global.testUtils.clearErrorTracking();
});

afterEach(() => {
  // Validate expected errors after each test
  const validationResults = global.testUtils.validateExpectedErrors();
  const summary = global.testUtils.getErrorSummary();

  // Log error summary if there are validation failures
  if (Array.from(validationResults.values()).some(result => !result)) {
    console.log('Error Scenario Validation Results:', summary);
  }
});

// Custom Jest matchers for error scenario validation
expect.extend({
  toHaveExpectedErrors(received: any, expected: string[]) {
    const validationResults = global.testUtils.validateExpectedErrors();
    const allExpectedErrorsOccurred = expected.every(error =>
      validationResults.get(error) === true
    );

    return {
      message: () => `Expected errors to occur: ${expected.join(', ')}. Validation results: ${JSON.stringify(Object.fromEntries(validationResults), null, 2)}`,
      pass: allExpectedErrorsOccurred
    };
  },

  toHandleErrorGracefully(received: Promise<any> | (() => Promise<any>), errorType?: string) {
    const promise = typeof received === 'function' ? received() : received;

    return promise.then(
      () => ({
        message: () => 'Expected operation to handle error gracefully, but it succeeded',
        pass: false
      }),
      (error) => {
        const handledGracefully = error.message.includes('gracefully handled') ||
          error.name === 'GracefulError' ||
          (errorType && error.name === errorType);

        return {
          message: () => `Expected error to be handled gracefully${errorType ? ` with type ${errorType}` : ''}, but got: ${error.message}`,
          pass: handledGracefully
        };
      }
    );
  },

  toRecoverFromError(received: any, maxRecoveryTime: number = 5000) {
    return new Promise((resolve) => {
      let recovered = false;
      const startTime = Date.now();

      const checkRecovery = () => {
        if (received.status === 'active' || received.status === 'idle') {
          recovered = true;
          resolve({
            message: () => `Expected system to recover from error within ${maxRecoveryTime}ms`,
            pass: true
          });
        } else if (Date.now() - startTime > maxRecoveryTime) {
          resolve({
            message: () => `System did not recover within ${maxRecoveryTime}ms`,
            pass: false
          });
        } else {
          setTimeout(checkRecovery, 100);
        }
      };

      checkRecovery();
    });
  }
});

// Error scenario test configurations
export const ErrorScenarios = {
  // Network-related errors
  NETWORK_TIMEOUT: {
    type: 'NetworkError',
    message: 'Connection timeout',
    recoverable: true,
    retryStrategy: 'exponential_backoff'
  },

  NETWORK_DISCONNECT: {
    type: 'NetworkError',
    message: 'Network disconnected',
    recoverable: true,
    retryStrategy: 'immediate_retry'
  },

  // Service errors
  SERVICE_UNAVAILABLE: {
    type: 'ServiceError',
    message: 'Service unavailable',
    recoverable: true,
    retryStrategy: 'circuit_breaker'
  },

  RATE_LIMIT_EXCEEDED: {
    type: 'RateLimitError',
    message: 'Rate limit exceeded',
    recoverable: true,
    retryStrategy: 'backoff_retry'
  },

  // Authentication errors
  AUTH_TOKEN_EXPIRED: {
    type: 'AuthenticationError',
    message: 'Token expired',
    recoverable: true,
    retryStrategy: 'token_refresh'
  },

  AUTH_INVALID_CREDENTIALS: {
    type: 'AuthenticationError',
    message: 'Invalid credentials',
    recoverable: false,
    retryStrategy: 'none'
  },

  // Validation errors
  INVALID_INPUT_DATA: {
    type: 'ValidationError',
    message: 'Invalid input data',
    recoverable: false,
    retryStrategy: 'none'
  },

  MALFORMED_REQUEST: {
    type: 'ValidationError',
    message: 'Malformed request',
    recoverable: false,
    retryStrategy: 'none'
  },

  // System errors
  MEMORY_EXHAUSTION: {
    type: 'SystemError',
    message: 'Out of memory',
    recoverable: true,
    retryStrategy: 'resource_cleanup'
  },

  RESOURCE_LIMIT_EXCEEDED: {
    type: 'SystemError',
    message: 'Resource limit exceeded',
    recoverable: true,
    retryStrategy: 'load_balancing'
  },

  // Agent-specific errors
  AGENT_UNRESPONSIVE: {
    type: 'AgentError',
    message: 'Agent not responding',
    recoverable: true,
    retryStrategy: 'agent_restart'
  },

  AGENT_TASK_TIMEOUT: {
    type: 'AgentError',
    message: 'Task execution timeout',
    recoverable: true,
    retryStrategy: 'task_reassignment'
  },

  // Coordination errors
  HANDOFF_FAILURE: {
    type: 'CoordinationError',
    message: 'Task handoff failed',
    recoverable: true,
    retryStrategy: 'handoff_retry'
  },

  COORDINATION_DEADLOCK: {
    type: 'CoordinationError',
    message: 'Coordination deadlock detected',
    recoverable: true,
    retryStrategy: 'deadlock_resolution'
  }
};

// Export for use in tests
export default global.testUtils;