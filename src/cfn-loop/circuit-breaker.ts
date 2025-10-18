/**
 * CFN Loop Circuit Breaker
 * Migrated from legacy/v1/src/cfn-loop/circuit-breaker.ts
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface BreakerOptions {
  timeoutMs?: number;
  failureThreshold?: number;
  delays?: number[];
  maxAttempts?: number;
  successThreshold?: number;
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
 * Circuit Breaker with timeout and failure tracking
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
  private currentAttempt = 0;

  private logger: Logger;

  constructor(private name: string, options: BreakerOptions = {}) {
    super();

    this.failureThreshold = options.failureThreshold || 3;
    this.successThreshold = options.successThreshold || 2;
    this.delays = options.delays || [1000, 2000, 4000, 8000];
    this.maxAttempts = options.maxAttempts || this.delays.length;
    this.halfOpenLimit = options.halfOpenLimit || 3;
    this.defaultTimeoutMs = options.timeoutMs || 30 * 60 * 1000;

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
      const result = await this.executeWithTimeout(fn, timeoutMs);
      this.recordSuccess();
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        this.timeoutCount++;
        this.logger.error('Operation timed out', {
          name: this.name,
          timeoutMs,
          timeoutCount: this.timeoutCount,
        });
      }

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
        setTimeout(() => {
          const error: TimeoutError = new Error(
            `CFN loop operation timed out after ${timeoutMs}ms`
          ) as TimeoutError;
          error.name = 'TimeoutError';
          error.timeoutMs = timeoutMs;
          error.operation = this.name;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Record successful execution
   */
  recordSuccess(): void {
    this.lastSuccessTime = new Date();
    this.currentAttempt = 0;

    switch (this.state) {
      case CircuitState.CLOSED:
        this.failureCount = 0;
        break;

      case CircuitState.HALF_OPEN:
        this.successCount++;
        this.halfOpenRequests++;

        if (this.successCount >= this.successThreshold) {
          this.transitionTo(CircuitState.CLOSED);
        }
        break;

      case CircuitState.OPEN:
        this.transitionTo(CircuitState.HALF_OPEN);
        break;
    }

    this.emit('success', { name: this.name, state: this.state, successCount: this.successCount });
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

        if (this.failureCount >= this.failureThreshold) {
          this.transitionTo(CircuitState.OPEN);
        }
        break;

      case CircuitState.HALF_OPEN:
        this.transitionTo(CircuitState.OPEN);
        break;

      case CircuitState.OPEN:
        const delayIndex = Math.min(this.currentAttempt - 1, this.delays.length - 1);
        const delayMs = this.delays[delayIndex];
        this.nextAttemptTime = new Date(Date.now() + delayMs);
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
    this.currentAttempt = 0;
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
        if (this.nextAttemptTime && new Date() >= this.nextAttemptTime) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
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

    switch (newState) {
      case CircuitState.CLOSED:
        this.failureCount = 0;
        this.successCount = 0;
        this.halfOpenRequests = 0;
        this.currentAttempt = 0;
        delete this.nextAttemptTime;
        break;

      case CircuitState.OPEN:
        this.successCount = 0;
        this.halfOpenRequests = 0;
        const delayIndex = Math.min(this.currentAttempt - 1, this.delays.length - 1);
        const delayMs = this.delays[Math.max(0, delayIndex)];
        this.nextAttemptTime = new Date(Date.now() + delayMs);
        break;

      case CircuitState.HALF_OPEN:
        this.successCount = 0;
        this.failureCount = 0;
        this.halfOpenRequests = 0;
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
   * Force state transition (for testing)
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
