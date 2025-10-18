/**
 * Simple Metrics Counter API
 *
 * Provides easy-to-use functions to increment metrics counters
 * with optional tags for dimensional analysis.
 */

import { getGlobalTelemetry } from './telemetry.js';

// ============================================================================
// Public API - Simple Counter Functions
// ============================================================================

/**
 * Increment a metric counter by 1 (or custom value)
 *
 * @example
 * ```typescript
 * // Simple counter
 * incrementMetric('api.requests');
 *
 * // Counter with tags
 * incrementMetric('api.requests', 1, {
 *   endpoint: '/users',
 *   method: 'GET',
 *   status: '200'
 * });
 *
 * // Custom increment value
 * incrementMetric('bytes.uploaded', 1024, { fileType: 'image' });
 * ```
 */
export function incrementMetric(
  metricName: string,
  value: number = 1,
  tags: Record<string, string> = {}
): void {
  const telemetry = getGlobalTelemetry();
  telemetry.recordCounter(metricName, value, tags);
}

/**
 * Record a gauge value (point-in-time measurement)
 *
 * @example
 * ```typescript
 * // Record current queue size
 * recordGauge('queue.size', 42);
 *
 * // Record with context
 * recordGauge('memory.usage', process.memoryUsage().heapUsed, {
 *   unit: 'bytes',
 *   process: 'worker-1'
 * });
 * ```
 */
export function recordGauge(
  metricName: string,
  value: number,
  tags: Record<string, string> = {}
): void {
  const telemetry = getGlobalTelemetry();
  telemetry.recordGauge(metricName, value, tags);
}

/**
 * Record a timing/duration metric
 *
 * @example
 * ```typescript
 * const start = Date.now();
 * await doWork();
 * recordTiming('task.duration', Date.now() - start, { taskType: 'export' });
 * ```
 */
export function recordTiming(
  metricName: string,
  durationMs: number,
  tags: Record<string, string> = {}
): void {
  const telemetry = getGlobalTelemetry();
  telemetry.recordTimer(metricName, durationMs, tags);
}

/**
 * Wrapper to measure function execution time
 *
 * @example
 * ```typescript
 * const result = await measureExecution('api.fetch', async () => {
 *   return await fetch('https://api.example.com/data');
 * }, { endpoint: '/data' });
 * ```
 */
export async function measureExecution<T>(
  metricName: string,
  fn: () => Promise<T>,
  tags: Record<string, string> = {}
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    recordTiming(metricName, Date.now() - start, { ...tags, status: 'success' });
    return result;
  } catch (error) {
    recordTiming(metricName, Date.now() - start, { ...tags, status: 'error' });
    throw error;
  }
}

/**
 * Synchronous execution measurement
 */
export function measureExecutionSync<T>(
  metricName: string,
  fn: () => T,
  tags: Record<string, string> = {}
): T {
  const start = Date.now();
  try {
    const result = fn();
    recordTiming(metricName, Date.now() - start, { ...tags, status: 'success' });
    return result;
  } catch (error) {
    recordTiming(metricName, Date.now() - start, { ...tags, status: 'error' });
    throw error;
  }
}

// ============================================================================
// Pre-defined Domain Metrics (Convenience Functions)
// ============================================================================

/**
 * Track provider routing decisions
 */
export function trackProviderRouting(
  provider: string,
  tier: string,
  agentType: string,
  source: string
): void {
  incrementMetric('provider.request', 1, {
    provider,
    tier,
    agentType,
    source,
  });
}

/**
 * Track agent spawns
 */
export function trackAgentSpawn(
  agentType: string,
  swarmId: string,
  topology: string
): void {
  incrementMetric('agent.spawned', 1, {
    agentType,
    swarmId,
    topology,
  });
}

/**
 * Track agent completion
 */
export function trackAgentCompletion(
  agentType: string,
  success: boolean,
  durationMs: number
): void {
  incrementMetric('agent.completed', 1, {
    agentType,
    status: success ? 'success' : 'failure',
  });
  recordTiming('agent.duration', durationMs, {
    agentType,
    status: success ? 'success' : 'failure',
  });
}

/**
 * Track task orchestration
 */
export function trackTaskOrchestration(
  taskType: string,
  strategy: string,
  agentCount: number
): void {
  incrementMetric('task.orchestrated', 1, {
    taskType,
    strategy,
  });
  recordGauge('task.agents', agentCount, {
    taskType,
    strategy,
  });
}

/**
 * Track swarm operations
 */
export function trackSwarmOperation(
  operation: 'init' | 'spawn' | 'destroy',
  topology: string,
  agentCount?: number
): void {
  incrementMetric('swarm.operation', 1, {
    operation,
    topology,
  });
  if (agentCount !== undefined) {
    recordGauge('swarm.size', agentCount, { topology });
  }
}

/**
 * Track API calls (generic)
 */
export function trackAPICall(
  endpoint: string,
  method: string,
  statusCode: number,
  durationMs: number
): void {
  incrementMetric('api.requests', 1, {
    endpoint,
    method,
    status: statusCode.toString(),
  });
  recordTiming('api.duration', durationMs, {
    endpoint,
    method,
  });
}

/**
 * Track errors
 */
export function trackError(
  errorType: string,
  component: string,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): void {
  incrementMetric('errors.count', 1, {
    errorType,
    component,
    severity,
  });
}

/**
 * Track memory usage
 */
export function trackMemoryUsage(component: string): void {
  const usage = process.memoryUsage();
  recordGauge('memory.heap.used', usage.heapUsed, { component, unit: 'bytes' });
  recordGauge('memory.heap.total', usage.heapTotal, { component, unit: 'bytes' });
  recordGauge('memory.rss', usage.rss, { component, unit: 'bytes' });
}

/**
 * Track subscription usage
 */
export function trackSubscriptionUsage(
  used: number,
  limit: number,
  remaining: number
): void {
  recordGauge('subscription.usage', used, {
    limit: limit.toString(),
    remaining: remaining.toString(),
    utilizationPct: ((used / limit) * 100).toFixed(1),
  });
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Get current metric value (latest gauge or counter sum)
 */
export function getMetricValue(metricName: string): number {
  const telemetry = getGlobalTelemetry();
  const metrics = telemetry.getMetrics(metricName);

  if (metrics.length === 0) return 0;

  // For counters, sum all values
  if (metrics[0].type === 'counter') {
    return metrics.reduce((sum, m) => sum + m.value, 0);
  }

  // For gauges, return latest value
  return metrics[metrics.length - 1].value;
}

/**
 * Get metric breakdown by tag
 */
export function getMetricBreakdown(
  metricName: string,
  tagKey: string
): Record<string, number> {
  const telemetry = getGlobalTelemetry();
  const metrics = telemetry.getMetrics(metricName);

  const breakdown: Record<string, number> = {};

  metrics.forEach(metric => {
    const tagValue = metric.tags[tagKey] || 'unknown';
    breakdown[tagValue] = (breakdown[tagValue] || 0) + metric.value;
  });

  return breakdown;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  // Core functions
  incrementMetric,
  recordGauge,
  recordTiming,
  measureExecution,
  measureExecutionSync,

  // Domain-specific trackers
  trackProviderRouting,
  trackAgentSpawn,
  trackAgentCompletion,
  trackTaskOrchestration,
  trackSwarmOperation,
  trackAPICall,
  trackError,
  trackMemoryUsage,
  trackSubscriptionUsage,

  // Query helpers
  getMetricValue,
  getMetricBreakdown,
};
