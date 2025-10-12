/**
 * Error Injector
 * Simulates random errors for testing retry coordination
 */

import { RedisKeys } from './message-protocol.js';

export const ERROR_TYPES = {
  SYNTAX: {
    name: 'SyntaxError',
    probability: 0.35,
    simulate: () => ({
      error: 'SyntaxError',
      message: 'Missing semicolon at line 42',
      line: 42,
      column: 15
    })
  },
  LOGIC: {
    name: 'LogicError',
    probability: 0.35,
    simulate: () => ({
      error: 'LogicError',
      message: 'Incorrect translation logic: expected greeting format',
      expected: 'Hello, World!',
      actual: 'World, Hello!'
    })
  },
  TRANSLATION: {
    name: 'TranslationError',
    probability: 0.20,
    simulate: () => ({
      error: 'TranslationError',
      message: 'Invalid Unicode character in translation',
      character: '\\uFFFD',
      position: 7
    })
  },
  MIXED: {
    name: 'MixedError',
    probability: 0.10,
    simulate: () => ({
      error: 'MixedError',
      message: 'Multiple issues detected',
      issues: [
        'Syntax error on line 10',
        'Logic error: incorrect output format',
        'Translation error: missing diacritical mark'
      ]
    })
  }
};

export class ErrorInjector {
  constructor(redis, failureRate = 0.5) {
    this.redis = redis;
    this.failureRate = failureRate;
    this.injectedErrors = new Map();
  }

  shouldInjectError() {
    return Math.random() < this.failureRate;
  }

  selectErrorType() {
    const rand = Math.random();
    let cumulative = 0;

    for (const [typeName, config] of Object.entries(ERROR_TYPES)) {
      cumulative += config.probability;
      if (rand < cumulative) {
        return config;
      }
    }

    return ERROR_TYPES.SYNTAX;
  }

  async injectError(combo, agentId) {
    if (!this.shouldInjectError()) {
      return null;
    }

    const errorType = this.selectErrorType();
    const error = {
      combo,
      agentId,
      errorType: errorType.name,
      errorDetails: errorType.simulate(),
      injectedAt: Date.now()
    };

    this.injectedErrors.set(combo, error);

    // Store in Redis
    await this.redis.hset(RedisKeys.errorsInjected, combo, JSON.stringify(error));

    console.log(`[ErrorInjector] Injected ${error.errorType} for ${combo}`);

    return error;
  }

  async getInjectedError(combo) {
    const errorStr = await this.redis.hget(RedisKeys.errorsInjected, combo);
    if (!errorStr) {
      return null;
    }
    return JSON.parse(errorStr);
  }

  async getAllInjectedErrors() {
    const errors = await this.redis.hgetall(RedisKeys.errorsInjected);
    return Object.entries(errors).map(([combo, errorStr]) => ({
      combo,
      ...JSON.parse(errorStr)
    }));
  }

  async getErrorStats() {
    const errors = await this.getAllInjectedErrors();

    const stats = {
      total: errors.length,
      byType: {},
      rate: errors.length / 70 // Assuming 70 total combos
    };

    for (const error of errors) {
      stats.byType[error.errorType] = (stats.byType[error.errorType] || 0) + 1;
    }

    return stats;
  }

  async clearErrors() {
    await this.redis.del(RedisKeys.errorsInjected);
    this.injectedErrors.clear();
  }
}

export class RetryCoordinator {
  constructor(redis, options = {}) {
    this.redis = redis;
    this.maxRetries = options.maxRetries || 10;
    this.errorInjector = options.errorInjector || null;
    this.retryAttempts = new Map();
  }

  async handleError(combo, agentId, error) {
    const attempts = await this.getRetryCount(combo);

    if (attempts >= this.maxRetries) {
      console.error(`[RetryCoordinator] Max retries (${this.maxRetries}) exceeded for ${combo}`);
      return false;
    }

    const newAttempt = attempts + 1;

    // Increment retry count
    await this.redis.hincrby(RedisKeys.retriesCount, combo, 1);

    // Log retry
    await this.redis.rpush(RedisKeys.retriesLog, JSON.stringify({
      combo,
      originalAgent: agentId,
      attempt: newAttempt,
      errorType: error?.errorType || 'unknown',
      timestamp: Date.now()
    }));

    console.log(`[RetryCoordinator] Handling error for ${combo} (attempt ${newAttempt}/${this.maxRetries})`);

    // Wait before retry (exponential backoff)
    const backoff = Math.min(100 * Math.pow(2, attempts), 2000);
    await this.sleep(backoff);

    return newAttempt;
  }

  async getRetryCount(combo) {
    const count = await this.redis.hget(RedisKeys.retriesCount, combo);
    return parseInt(count || '0', 10);
  }

  async getAllRetryCounts() {
    const counts = await this.redis.hgetall(RedisKeys.retriesCount);
    return Object.entries(counts).map(([combo, count]) => ({
      combo,
      attempts: parseInt(count, 10)
    }));
  }

  async getRetryLog() {
    const log = await this.redis.lrange(RedisKeys.retriesLog, 0, -1);
    return log.map(entry => JSON.parse(entry));
  }

  async getRetryStats() {
    const counts = await this.getAllRetryCounts();
    const log = await this.getRetryLog();

    const stats = {
      totalRetries: log.length,
      filesWithRetries: counts.length,
      avgRetriesPerFile: counts.length > 0 ? log.length / counts.length : 0,
      maxRetriesForFile: Math.max(...counts.map(c => c.attempts), 0),
      byAttempt: {}
    };

    for (const entry of log) {
      stats.byAttempt[entry.attempt] = (stats.byAttempt[entry.attempt] || 0) + 1;
    }

    return stats;
  }

  async clearRetries() {
    await this.redis.del(RedisKeys.retriesCount);
    await this.redis.del(RedisKeys.retriesLog);
    this.retryAttempts.clear();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
