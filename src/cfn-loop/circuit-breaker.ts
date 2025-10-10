/**
 * @file CFN Loop Circuit Breaker
 * @description Automatic circuit breaker with global timeout for CFN loop execution
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import { CircuitBreaker, CircuitState, CircuitBreakerConfig } from '../coordination/circuit-breaker.js';

export interface BreakerOptions {
  /** Maximum execution time in milliseconds */
  timeoutMs?: number;
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Cooldown period before attempting half-open state (ms) - DEPRECATED: use delays */
  cooldownMs?: number;
  /** Exponential backoff delays in milliseconds [1s, 2s, 4s, 8s] */
  delays?: number[];
  /** Maximum retry attempts (should match delays.length) */
  maxAttempts?: number;
  /** Number of successes required to close from half-open */
  successThreshold?: number;
  /** Maximum requests allowed in half-open state */
  halfOpenLimit?: number;
}

export interface BreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttemptTime?: Date;
  totalRequests: number;
  rejectedRequests: number;
  timeoutCount: number;
}

export interface TimeoutError extends Error {
  name: 'TimeoutError';
  timeoutMs: number;
  operation: string;
}

export interface CircuitOpenError extends Error {
  name: 'CircuitOpenError';
  circuitName: string;
  state: BreakerState;
}

/**
 * CFN Loop Circuit Breaker with timeout and failure tracking
 */
export class CFNCircuitBreaker extends EventEmitter {
  private failureCount = 0;
  private successCount = 0;
  private state: CircuitState = CircuitState.CLOSED;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttemptTime?: Date;
  private totalRequests = 0;
  private rejectedRequests = 0;
  private timeoutCount = 0;
  private halfOpenRequests = 0;

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly delays: number[];
  private readonly maxAttempts: number;
  private readonly halfOpenLimit: number;
  private readonly defaultTimeoutMs: number;
  private currentAttempt: number = 0;

  private logger: Logger;

  constructor(
    private name: string,
    options: BreakerOptions = {}
  ) {
    super();

    this.failureThreshold = options.failureThreshold || 3;
    this.successThreshold = options.successThreshold || 2;
    // Support exponential backoff (new) or fallback to cooldownMs (legacy)
    this.delays = options.delays || [1000, 2000, 4000, 8000]; // Default: [1s, 2s, 4s, 8s]
    this.maxAttempts = options.maxAttempts || this.delays.length;
    this.halfOpenLimit = options.halfOpenLimit || 3;
    this.defaultTimeoutMs = options.timeoutMs || 30 * 60 * 1000; // 30 minutes

    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: `CFNCircuitBreaker:${name}` });
  }

  /**
   * Execute a function with circuit breaker protection and timeout
   */
  async execute<T>(fn: () => Promise<T>, options?: BreakerOptions): Promise<T> {
    this.totalRequests++;

    // Check if circuit allows execution
    if (!this.canExecute()) {
      this.rejectedRequests++;
      const error = this.createCircuitOpenError();
      this.logger.warn('Request rejected - circuit is OPEN', {
        name: this.name,
        state: this.state,
        nextAttempt: this.nextAttemptTime,
      });
      this.emit('request:rejected', { name: this.name, state: this.getState() });
      throw error;
    }

    const timeoutMs = options?.timeoutMs || this.defaultTimeoutMs;

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn, timeoutMs);

      // Record success
      this.recordSuccess();

      return result;
    } catch (error) {
      // Check if it's a timeout error
      if (error instanceof Error && error.name === 'TimeoutError') {
        this.timeoutCount++;
        this.logger.error('Operation timed out', {
          name: this.name,
          timeoutMs,
          timeoutCount: this.timeoutCount,
        });
      }

      // Record failure
      this.recordFailure();

      throw error;
    }
  }

  /**
   * Execute function with timeout wrapper
   */
  async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          const error: TimeoutError = new Error(
            `CFN loop operation timed out after ${timeoutMs}ms`
          ) as TimeoutError;
          error.name = 'TimeoutError';
          error.timeoutMs = timeoutMs;
          error.operation = this.name;
          reject(error);
        }, timeoutMs);

        // Ensure timer is cleared
        return () => clearTimeout(timer);
      }),
    ]);
  }

  /**
   * Record successful execution
   */
  recordSuccess(): void {
    this.lastSuccessTime = new Date();
    this.currentAttempt = 0; // Reset attempt counter on success

    switch (this.state) {
      case CircuitState.CLOSED:
        // Reset failure count on success
        this.failureCount = 0;
        break;

      case CircuitState.HALF_OPEN:
        this.successCount++;
        this.halfOpenRequests++;

        this.logger.info('Success in half-open state', {
          name: this.name,
          successCount: this.successCount,
          successThreshold: this.successThreshold,
        });

        // Close circuit if enough successes
        if (this.successCount >= this.successThreshold) {
          this.transitionTo(CircuitState.CLOSED);
        }
        break;

      case CircuitState.OPEN:
        // Unexpected, but transition to half-open
        this.logger.warn('Success recorded in OPEN state, transitioning to HALF_OPEN', {
          name: this.name,
        });
        this.transitionTo(CircuitState.HALF_OPEN);
        break;
    }

    this.emit('success', {
      name: this.name,
      state: this.state,
      successCount: this.successCount,
    });
  }

  /**
   * Record failed execution
   */
  recordFailure(): void {
    this.lastFailureTime = new Date();
    this.currentAttempt++;

    switch (this.state) {
      case CircuitState.CLOSED:
        this.failureCount++;

        this.logger.warn('Failure recorded', {
          name: this.name,
          failureCount: this.failureCount,
          failureThreshold: this.failureThreshold,
          currentAttempt: this.currentAttempt,
        });

        // Open circuit if threshold exceeded
        if (this.failureCount >= this.failureThreshold) {
          this.transitionTo(CircuitState.OPEN);
        }
        break;

      case CircuitState.HALF_OPEN:
        // Single failure in half-open reopens circuit
        this.logger.warn('Failure in half-open state, reopening circuit', {
          name: this.name,
        });
        this.transitionTo(CircuitState.OPEN);
        break;

      case CircuitState.OPEN:
        // Already open, use exponential backoff delay
        const delayIndex = Math.min(this.currentAttempt - 1, this.delays.length - 1);
        const delayMs = this.delays[delayIndex];
        this.nextAttemptTime = new Date(Date.now() + delayMs);
        this.logger.debug('Failure in OPEN state, exponential backoff', {
          name: this.name,
          attempt: this.currentAttempt,
          maxAttempts: this.maxAttempts,
          delayMs,
          nextAttempt: this.nextAttemptTime,
        });
        break;
    }

    this.emit('failure', {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      currentAttempt: this.currentAttempt,
      maxAttempts: this.maxAttempts,
    });
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.logger.info('Resetting circuit breaker', { name: this.name });

    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenRequests = 0;
    this.timeoutCount = 0;
    this.currentAttempt = 0; // Reset attempt counter
    delete this.lastFailureTime;
    delete this.lastSuccessTime;
    delete this.nextAttemptTime;

    this.emit('reset', { name: this.name });
  }

  /**
   * Get current circuit breaker state
   */
  getState(): BreakerState {
    const state: BreakerState = {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      rejectedRequests: this.rejectedRequests,
      timeoutCount: this.timeoutCount,
    };

    if (this.lastFailureTime !== undefined) {
      state.lastFailureTime = this.lastFailureTime;
    }

    if (this.lastSuccessTime !== undefined) {
      state.lastSuccessTime = this.lastSuccessTime;
    }

    if (this.nextAttemptTime !== undefined) {
      state.nextAttemptTime = this.nextAttemptTime;
    }

    return state;
  }

  /**
   * Check if execution is allowed
   */
  private canExecute(): boolean {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // Check if cooldown period has elapsed
        if (this.nextAttemptTime && new Date() >= this.nextAttemptTime) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
        // Allow limited requests in half-open state
        return this.halfOpenRequests < this.halfOpenLimit;

      default:
        return false;
    }
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;

    if (oldState === newState) {
      return;
    }

    this.state = newState;

    this.logger.info('Circuit state transition', {
      name: this.name,
      from: oldState,
      to: newState,
      failureCount: this.failureCount,
      successCount: this.successCount,
    });

    // Reset counters based on new state
    switch (newState) {
      case CircuitState.CLOSED:
        this.failureCount = 0;
        this.successCount = 0;
        this.halfOpenRequests = 0;
        this.currentAttempt = 0; // Reset attempt counter
        delete this.nextAttemptTime;
        break;

      case CircuitState.OPEN:
        this.successCount = 0;
        this.halfOpenRequests = 0;
        // Use exponential backoff delay based on current attempt
        const delayIndex = Math.min(this.currentAttempt - 1, this.delays.length - 1);
        const delayMs = this.delays[Math.max(0, delayIndex)];
        this.nextAttemptTime = new Date(Date.now() + delayMs);
        this.logger.warn('Circuit opened with exponential backoff', {
          name: this.name,
          attempt: this.currentAttempt,
          maxAttempts: this.maxAttempts,
          delayMs,
          nextAttempt: this.nextAttemptTime,
          failureCount: this.failureCount,
        });
        break;

      case CircuitState.HALF_OPEN:
        this.successCount = 0;
        this.failureCount = 0;
        this.halfOpenRequests = 0;
        this.logger.info('Circuit entering half-open state', { name: this.name });
        break;
    }

    this.emit('state:transition', {
      name: this.name,
      from: oldState,
      to: newState,
      state: this.getState(),
    });
  }

  /**
   * Create circuit open error
   */
  private createCircuitOpenError(): CircuitOpenError {
    const error: CircuitOpenError = new Error(
      `Circuit breaker '${this.name}' is OPEN. Next attempt at ${this.nextAttemptTime?.toISOString() || 'unknown'}`
    ) as CircuitOpenError;
    error.name = 'CircuitOpenError';
    error.circuitName = this.name;
    error.state = this.getState();
    return error;
  }

  /**
   * Force state transition (for testing/manual intervention)
   */
  forceState(state: CircuitState): void {
    this.logger.warn('Forcing circuit state', {
      name: this.name,
      from: this.state,
      to: state,
    });
    this.transitionTo(state);
  }
}

/**
 * Manager for multiple CFN circuit breakers
 */
export class CFNCircuitBreakerManager extends EventEmitter {
  private breakers = new Map<string, CFNCircuitBreaker>();
  private logger: Logger;

  constructor() {
    super();

    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'CFNCircuitBreakerManager' });
  }

  /**
   * Get or create a circuit breaker
   */
  getBreaker(name: string, options?: BreakerOptions): CFNCircuitBreaker {
    let breaker = this.breakers.get(name);

    if (!breaker) {
      breaker = new CFNCircuitBreaker(name, options);

      // Forward all events with breaker name
      breaker.on('success', (data) => this.emit('breaker:success', data));
      breaker.on('failure', (data) => this.emit('breaker:failure', data));
      breaker.on('state:transition', (data) => this.emit('breaker:state-change', data));
      breaker.on('request:rejected', (data) => this.emit('breaker:rejected', data));
      breaker.on('reset', (data) => this.emit('breaker:reset', data));

      this.breakers.set(name, breaker);

      this.logger.info('Created circuit breaker', { name, options });
    }

    return breaker;
  }

  /**
   * Execute with circuit breaker
   */
  async execute<T>(
    name: string,
    fn: () => Promise<T>,
    options?: BreakerOptions
  ): Promise<T> {
    const breaker = this.getBreaker(name, options);
    return breaker.execute(fn, options);
  }

  /**
   * Reset specific breaker
   */
  resetBreaker(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Reset all breakers
   */
  resetAll(): void {
    this.logger.info('Resetting all circuit breakers', {
      count: this.breakers.size,
    });

    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get all breaker states
   */
  getAllStates(): Record<string, BreakerState> {
    const states: Record<string, BreakerState> = {};

    for (const [name, breaker] of this.breakers) {
      states[name] = breaker.getState();
    }

    return states;
  }

  /**
   * Get breaker state
   */
  getBreakerState(name: string): BreakerState | null {
    const breaker = this.breakers.get(name);
    return breaker ? breaker.getState() : null;
  }

  /**
   * Force breaker state (for testing/manual intervention)
   */
  forceState(name: string, state: CircuitState): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.forceState(state);
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalBreakers: number;
    openCircuits: number;
    halfOpenCircuits: number;
    closedCircuits: number;
    totalRequests: number;
    totalRejections: number;
    totalTimeouts: number;
  } {
    let openCircuits = 0;
    let halfOpenCircuits = 0;
    let closedCircuits = 0;
    let totalRequests = 0;
    let totalRejections = 0;
    let totalTimeouts = 0;

    for (const breaker of this.breakers.values()) {
      const state = breaker.getState();

      switch (state.state) {
        case CircuitState.OPEN:
          openCircuits++;
          break;
        case CircuitState.HALF_OPEN:
          halfOpenCircuits++;
          break;
        case CircuitState.CLOSED:
          closedCircuits++;
          break;
      }

      totalRequests += state.totalRequests;
      totalRejections += state.rejectedRequests;
      totalTimeouts += state.timeoutCount;
    }

    return {
      totalBreakers: this.breakers.size,
      openCircuits,
      halfOpenCircuits,
      closedCircuits,
      totalRequests,
      totalRejections,
      totalTimeouts,
    };
  }

  /**
   * Shutdown all breakers
   */
  shutdown(): void {
    this.logger.info('Shutting down circuit breaker manager');
    this.breakers.clear();
    this.removeAllListeners();
  }
}
