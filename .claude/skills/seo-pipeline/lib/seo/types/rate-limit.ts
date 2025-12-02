/**
 * Rate limiting types for SEO Research Service
 *
 * @module planning/seo/types/rate-limit
 * @description Types for rate limiting, quota management, and request prioritization
 * @version 1.0.0
 *
 * Provides abstractions for token-bucket, sliding-window, and quota-based
 * rate limiting with support for priority queuing and adaptive throttling.
 */

import { RateLimitConfig } from './research';

// ============================================================================
// RATE LIMIT STRATEGY TYPES
// ============================================================================

/**
 * Rate limiting strategy type
 *
 * @enum RateLimitStrategy
 * @description Different algorithms for rate limiting
 */
export enum RateLimitStrategy {
  /**
   * Token bucket algorithm
   * Requests consume tokens; tokens regenerate at fixed rate
   * Good for bursty traffic
   */
  TOKEN_BUCKET = 'token-bucket',

  /**
   * Sliding window algorithm
   * Track requests in time window, limit total
   * More accurate but higher memory overhead
   */
  SLIDING_WINDOW = 'sliding-window',

  /**
   * Fixed window algorithm
   * Reset quota each minute/hour/etc
   * Simple but can have burst at boundaries
   */
  FIXED_WINDOW = 'fixed-window',

  /**
   * Leaky bucket algorithm
   * Requests queue and are processed at constant rate
   * Good for smoothing traffic
   */
  LEAKY_BUCKET = 'leaky-bucket',

  /**
   * Adaptive/Dynamic algorithm
   * Adjusts limits based on load and available resources
   */
  ADAPTIVE = 'adaptive',
}

/**
 * Quota unit for rate limiting
 *
 * @enum QuotaUnit
 * @description Units for measuring quota consumption
 */
export enum QuotaUnit {
  /** Per request (each query counts as 1) */
  PER_REQUEST = 'per_request',

  /** Per byte of data transferred */
  PER_BYTE = 'per_byte',

  /** Per result item (e.g., SERP result or page fetch) */
  PER_ITEM = 'per_item',

  /** Weighted based on query complexity */
  WEIGHTED = 'weighted',
}

/**
 * Rate limit quota definition
 *
 * @interface Quota
 * @description Defines quota consumption and limits
 */
export interface Quota {
  /**
   * Unit for measuring consumption
   */
  unit: QuotaUnit;

  /**
   * Amount allowed per period
   */
  amount: number;

  /**
   * Time period (seconds)
   */
  periodSeconds: number;

  /**
   * Current usage in this period
   */
  used: number;

  /**
   * When current period resets
   */
  resetAt: Date;

  /**
   * Whether quota is currently exceeded
   */
  isExceeded: boolean;

  /**
   * Percentage of quota used (0-1)
   * Useful for alerting before limit reached
   */
  utilization: number;
}

/**
 * Rate limiter configuration with strategy
 *
 * @interface RateLimiterConfig
 * @extends RateLimitConfig
 * @description Complete configuration for rate limiter
 *
 * @example
 * ```typescript
 * const config: RateLimiterConfig = {
 *   strategy: RateLimitStrategy.TOKEN_BUCKET,
 *   service: 'websearch',
 *   quota: {
 *     unit: QuotaUnit.PER_REQUEST,
 *     amount: 100,
 *     periodSeconds: 60
 *   },
 *   maxRequests: 100,
 *   windowMs: 60000,
 *   enableQueue: true,
 *   maxQueueSize: 500,
 *   priorityLevels: 3,
 *   allowBursting: true,
 *   burstCapacity: 150
 * };
 * ```
 */
export interface RateLimiterConfig extends RateLimitConfig {
  /**
   * Rate limiting strategy to use
   */
  strategy: RateLimitStrategy;

  /**
   * Quota definition (more flexible than simple maxRequests/windowMs)
   */
  quota?: Quota;

  /**
   * Number of priority levels (1-10)
   * Higher number = more granular priority control
   * Default: 3 (low, normal, high)
   */
  priorityLevels?: number;

  /**
   * Whether to allow burst requests above sustained rate
   * If true, can process up to burstCapacity requests
   */
  allowBursting?: boolean;

  /**
   * Burst capacity (requests)
   * Maximum requests allowed in burst before throttling
   */
  burstCapacity?: number;

  /**
   * Sustained rate after burst (requests per second)
   * Used with leaky bucket strategy
   */
  sustainedRatePerSecond?: number;

  /**
   * Enable adaptive throttling
   * Automatically reduces limits if service is struggling
   */
  adaptiveThrottling?: boolean;

  /**
   * Error rate threshold for adaptive throttling (0-1)
   * If error rate exceeds this, reduce limits
   */
  errorRateThreshold?: number;

  /**
   * Response time threshold for adaptive throttling (milliseconds)
   * If p95 response time exceeds this, reduce limits
   */
  responseTimeThresholdMs?: number;

  /**
   * Minimum rate to maintain (requests per second)
   * Never throttle below this level
   */
  minimumRate?: number;

  /**
   * Maximum rate to allow (requests per second)
   * Never exceed this level (safety valve)
   */
  maximumRate?: number;

  /**
   * Whether to use fair queuing
   * Prevents single user from starving others
   */
  fairQueuing?: boolean;

  /**
   * Per-client rate limit (if applicable)
   * Prevent one client from using all quota
   */
  perClientLimit?: {
    requests: number;
    periodSeconds: number;
  };
}

// ============================================================================
// REQUEST WEIGHT & PRIORITY
// ============================================================================

/**
 * Request weight calculation
 *
 * @interface RequestWeight
 * @description How much quota a request consumes
 */
export interface RequestWeight {
  /**
   * Base weight (always at least 1)
   */
  base: number;

  /**
   * Multiplier for query complexity
   * 1.0 = normal query, 2.0 = twice as heavy
   */
  complexityMultiplier: number;

  /**
   * Size-based weight (bytes/1000)
   * For per-byte quota unit
   */
  sizeWeight?: number;

  /**
   * Total calculated weight
   */
  total: number;

  /**
   * Reason for this weight
   */
  reason?: string;
}

/**
 * Priority level configuration
 *
 * @interface PriorityLevel
 * @description Configuration for queue priority level
 */
export interface PriorityLevel {
  /**
   * Priority level (1-10, higher = more important)
   */
  level: number;

  /**
   * Name of priority level
   * e.g., 'critical', 'high', 'normal', 'low'
   */
  name: string;

  /**
   * Weight multiplier for queue ordering
   * Higher multiplier = processes more requests per cycle
   */
  weight: number;

  /**
   * Maximum percentage of quota this level can use
   */
  maxQuotaPercent?: number;

  /**
   * Timeout for requests at this level (milliseconds)
   */
  timeoutMs?: number;

  /**
   * Whether to allow bursting for this level
   */
  allowBurst?: boolean;

  /**
   * Description
   */
  description?: string;
}

/**
 * Request priority assignment
 *
 * @interface PriorityAssignment
 * @description Determines priority for a request
 */
export interface PriorityAssignment {
  /**
   * Assigned priority level (1-10)
   */
  level: number;

  /**
   * Weight given to this request in queue
   */
  weight: number;

  /**
   * Factors that determined this priority
   */
  factors: Array<{
    name: string;
    contribution: number; // -2 to +2
  }>;

  /**
   * Reason for assignment
   */
  reason: string;
}

// ============================================================================
// THROTTLING & BACKOFF
// ============================================================================

/**
 * Throttling configuration
 *
 * @interface ThrottleConfig
 * @description Controls how requests are throttled when limit reached
 */
export interface ThrottleConfig {
  /**
   * Throttle mode when limit reached
   */
  mode: 'queue' | 'fail_fast' | 'degrade' | 'adaptive';

  /**
   * For 'queue' mode: maximum queue size
   */
  maxQueueSize?: number;

  /**
   * For 'fail_fast' mode: error to return
   */
  failureError?: Error;

  /**
   * For 'degrade' mode: fallback service to use
   */
  fallbackService?: string;

  /**
   * For 'adaptive' mode: reduce limits if this threshold exceeded
   */
  reductionFactor?: number; // 0-1, how much to reduce limit by

  /**
   * Whether to emit events when throttling occurs
   */
  emitEvents?: boolean;

  /**
   * Logging level for throttle events
   */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Backoff strategy configuration
 *
 * @interface BackoffConfig
 * @description Defines backoff behavior for retries
 */
export interface BackoffConfig {
  /**
   * Backoff strategy type
   */
  type: 'exponential' | 'linear' | 'fibonacci' | 'polynomial' | 'custom';

  /**
   * Initial delay (milliseconds)
   */
  initialDelayMs: number;

  /**
   * Maximum delay (milliseconds)
   */
  maxDelayMs: number;

  /**
   * For exponential: multiplier
   * For linear: increment amount
   * For polynomial: exponent
   */
  factor: number;

  /**
   * Add random jitter to delays
   */
  useJitter: boolean;

  /**
   * Jitter range as percentage of delay
   */
  jitterPercent?: number;

  /**
   * Maximum number of retries
   */
  maxRetries: number;

  /**
   * Custom delay function
   */
  customDelayFn?: (attempt: number, error?: Error) => number;

  /**
   * Whether to include full jitter (recommended)
   * If true, delay is random(0, calculatedDelay)
   */
  useFullJitter?: boolean;
}

// ============================================================================
// RATE LIMIT MONITORING & HEALTH
// ============================================================================

/**
 * Rate limiter health status
 *
 * @interface HealthStatus
 * @description Health metrics for rate limiter
 */
export interface HealthStatus {
  /**
   * Is rate limiter healthy?
   */
  healthy: boolean;

  /**
   * Current status
   */
  status: 'healthy' | 'degraded' | 'critical';

  /**
   * Status message
   */
  message: string;

  /**
   * Timestamp of status check
   */
  checkedAt: Date;

  /**
   * Queue length (0 = good, increasing = problem)
   */
  queueLength: number;

  /**
   * Average queue wait time
   */
  avgWaitTimeMs: number;

  /**
   * Current error rate (0-1)
   */
  errorRate: number;

  /**
   * Current success rate (0-1)
   */
  successRate: number;

  /**
   * Quota utilization (0-1)
   */
  quotaUtilization: number;

  /**
   * Throttle rate (requests being throttled)
   */
  throttleRate: number;

  /**
   * Recommendations for improvement
   */
  recommendations?: string[];
}

/**
 * Rate limiter metrics
 *
 * @interface RateLimitMetrics
 * @description Performance metrics for rate limiter
 */
export interface RateLimitMetrics {
  /**
   * Timestamp
   */
  timestamp: Date;

  /**
   * Total requests processed
   */
  totalRequests: number;

  /**
   * Requests successfully executed
   */
  successfulRequests: number;

  /**
   * Requests throttled/queued
   */
  throttledRequests: number;

  /**
   * Requests that failed due to rate limit
   */
  rateLimitedRequests: number;

  /**
   * Success rate (0-1)
   */
  successRate: number;

  /**
   * Throttle rate (0-1)
   */
  throttleRate: number;

  /**
   * Average request latency (ms)
   */
  avgLatencyMs: number;

  /**
   * Median request latency (ms)
   */
  medianLatencyMs: number;

  /**
   * P95 request latency (ms)
   */
  p95LatencyMs: number;

  /**
   * P99 request latency (ms)
   */
  p99LatencyMs: number;

  /**
   * Current queue size
   */
  queueSize: number;

  /**
   * Queue wait times
   */
  queueWaitStats: {
    average: number;
    min: number;
    max: number;
    p95: number;
  };

  /**
   * Quota consumption
   */
  quota: {
    used: number;
    limit: number;
    remaining: number;
    percentUsed: number;
    resetAt: Date;
  };

  /**
   * Health status
   */
  health: HealthStatus;
}

// ============================================================================
// ADAPTIVE RATE LIMITING
// ============================================================================

/**
 * Adaptive rate limiter state
 *
 * @interface AdaptiveState
 * @description State for adaptive/dynamic rate limiting
 */
export interface AdaptiveState {
  /**
   * Current allowed rate (requests per second)
   */
  currentRate: number;

  /**
   * Minimum allowed rate (safety floor)
   */
  minimumRate: number;

  /**
   * Maximum allowed rate (safety ceiling)
   */
  maximumRate: number;

  /**
   * How much to adjust rate up per improvement cycle
   */
  increaseStep: number;

  /**
   * How much to adjust rate down per degradation
   */
  decreaseStep: number;

  /**
   * Current error rate (0-1)
   */
  errorRate: number;

  /**
   * Current response time (milliseconds)
   */
  responseTimeMs: number;

  /**
   * Last time rate was adjusted
   */
  lastAdjustedAt: Date;

  /**
   * Reason for last adjustment
   */
  lastAdjustmentReason?: string;

  /**
   * Number of adjustments made
   */
  totalAdjustments: number;
}

/**
 * Service capacity indicators
 *
 * @interface ServiceCapacity
 * @description Signals about upstream service health
 */
export interface ServiceCapacity {
  /**
   * Is service responding to requests?
   */
  isResponding: boolean;

  /**
   * Current response time (milliseconds)
   */
  responseTimeMs: number;

  /**
   * Error rate at service (0-1)
   */
  errorRate: number;

  /**
   * Service reports remaining quota?
   */
  quotaRemaining?: number;

  /**
   * Service reports when quota resets?
   */
  quotaResetAt?: Date;

  /**
   * Estimated service load (0-1, where 1 = fully loaded)
   */
  estimatedLoad?: number;

  /**
   * Last check timestamp
   */
  checkedAt: Date;

  /**
   * Recommended rate adjustment
   */
  recommendedAdjustment?: number;
}
