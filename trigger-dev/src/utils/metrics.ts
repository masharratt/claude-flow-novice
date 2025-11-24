import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create metrics registry
export const register = new Registry();

// Collect default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register });

// Agent spawn metrics
export const agentSpawnCounter = new Counter({
  name: 'cfn_agent_spawns_total',
  help: 'Total number of agent spawns',
  labelNames: ['team', 'agent_type', 'project', 'mode'],
  registers: [register],
});

export const agentSpawnFailureCounter = new Counter({
  name: 'cfn_agent_spawn_failures_total',
  help: 'Total number of failed agent spawns',
  labelNames: ['team', 'agent_type', 'project', 'error_type'],
  registers: [register],
});

// Agent execution metrics
export const agentExecutionDuration = new Histogram({
  name: 'cfn_agent_execution_duration_seconds',
  help: 'Agent execution duration in seconds',
  labelNames: ['team', 'agent_type', 'project', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800], // 1s to 30min
  registers: [register],
});

export const agentExecutionCounter = new Counter({
  name: 'cfn_agent_executions_total',
  help: 'Total number of agent executions',
  labelNames: ['team', 'agent_type', 'project', 'status'],
  registers: [register],
});

// Resource usage metrics
export const agentCpuUsage = new Gauge({
  name: 'cfn_agent_cpu_usage_percent',
  help: 'Agent CPU usage percentage',
  labelNames: ['agent_id', 'agent_type', 'team'],
  registers: [register],
});

export const agentMemoryUsage = new Gauge({
  name: 'cfn_agent_memory_usage_bytes',
  help: 'Agent memory usage in bytes',
  labelNames: ['agent_id', 'agent_type', 'team'],
  registers: [register],
});

export const agentDiskUsage = new Gauge({
  name: 'cfn_agent_disk_usage_bytes',
  help: 'Agent disk usage in bytes',
  labelNames: ['agent_id', 'agent_type', 'team'],
  registers: [register],
});

// Cost tracking metrics
export const agentCostTotal = new Counter({
  name: 'cfn_agent_cost_dollars_total',
  help: 'Total cost of agent executions in dollars',
  labelNames: ['team', 'project', 'agent_type', 'provider'],
  registers: [register],
});

export const agentTokenUsage = new Counter({
  name: 'cfn_agent_tokens_total',
  help: 'Total tokens consumed by agents',
  labelNames: ['team', 'project', 'agent_type', 'provider', 'token_type'],
  registers: [register],
});

// Health check metrics
export const healthCheckSuccess = new Counter({
  name: 'cfn_health_check_success_total',
  help: 'Total successful health checks',
  labelNames: ['check_type'],
  registers: [register],
});

export const healthCheckFailure = new Counter({
  name: 'cfn_health_check_failure_total',
  help: 'Total failed health checks',
  labelNames: ['check_type', 'error_type'],
  registers: [register],
});

export const healthCheckDuration = new Histogram({
  name: 'cfn_health_check_duration_seconds',
  help: 'Health check duration in seconds',
  labelNames: ['check_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Coordination metrics
export const coordinationWaitDuration = new Histogram({
  name: 'cfn_coordination_wait_duration_seconds',
  help: 'Time spent waiting for coordination signals',
  labelNames: ['task_id', 'signal_type'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

export const coordinationSignalCounter = new Counter({
  name: 'cfn_coordination_signals_total',
  help: 'Total coordination signals sent/received',
  labelNames: ['task_id', 'signal_type', 'direction'],
  registers: [register],
});

// Docker operations metrics
export const dockerOperationDuration = new Histogram({
  name: 'cfn_docker_operation_duration_seconds',
  help: 'Docker operation duration in seconds',
  labelNames: ['operation', 'status'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const dockerOperationCounter = new Counter({
  name: 'cfn_docker_operations_total',
  help: 'Total Docker operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

// CFN Loop metrics
export const cfnLoopIterationCounter = new Counter({
  name: 'cfn_loop_iterations_total',
  help: 'Total CFN Loop iterations',
  labelNames: ['task_id', 'loop_level', 'mode'],
  registers: [register],
});

export const cfnLoopConsensusScore = new Gauge({
  name: 'cfn_loop_consensus_score',
  help: 'CFN Loop consensus score',
  labelNames: ['task_id', 'iteration'],
  registers: [register],
});

export const cfnLoopTestPassRate = new Gauge({
  name: 'cfn_loop_test_pass_rate',
  help: 'CFN Loop test pass rate',
  labelNames: ['task_id', 'iteration'],
  registers: [register],
});

export const cfnLoopDecisionCounter = new Counter({
  name: 'cfn_loop_decisions_total',
  help: 'Total CFN Loop decisions',
  labelNames: ['task_id', 'decision', 'mode'],
  registers: [register],
});

// Utility functions
export interface MetricsLabels {
  team?: string;
  project?: string;
  agentType?: string;
  agentId?: string;
  taskId?: string;
  mode?: string;
  provider?: string;
  status?: string;
  [key: string]: string | undefined;
}

export function recordAgentSpawn(labels: MetricsLabels): void {
  agentSpawnCounter.inc({
    team: labels.team || 'unknown',
    agent_type: labels.agentType || 'unknown',
    project: labels.project || 'unknown',
    mode: labels.mode || 'standard',
  });
}

export function recordAgentExecution(
  labels: MetricsLabels,
  durationSeconds: number,
  status: 'success' | 'failure' | 'timeout'
): void {
  const metricLabels = {
    team: labels.team || 'unknown',
    agent_type: labels.agentType || 'unknown',
    project: labels.project || 'unknown',
    status,
  };

  agentExecutionDuration.observe(metricLabels, durationSeconds);
  agentExecutionCounter.inc(metricLabels);
}

export function recordAgentCost(
  labels: MetricsLabels,
  costDollars: number,
  inputTokens: number,
  outputTokens: number
): void {
  const costLabels = {
    team: labels.team || 'unknown',
    project: labels.project || 'unknown',
    agent_type: labels.agentType || 'unknown',
    provider: labels.provider || 'unknown',
  };

  agentCostTotal.inc(costLabels, costDollars);

  const tokenLabels = {
    ...costLabels,
    token_type: 'input',
  };
  agentTokenUsage.inc(tokenLabels, inputTokens);

  tokenLabels.token_type = 'output';
  agentTokenUsage.inc(tokenLabels, outputTokens);
}

export function updateResourceUsage(
  labels: MetricsLabels,
  cpu: number,
  memoryBytes: number,
  diskBytes: number
): void {
  const resourceLabels = {
    agent_id: labels.agentId || 'unknown',
    agent_type: labels.agentType || 'unknown',
    team: labels.team || 'unknown',
  };

  agentCpuUsage.set(resourceLabels, cpu);
  agentMemoryUsage.set(resourceLabels, memoryBytes);
  agentDiskUsage.set(resourceLabels, diskBytes);
}

export function recordHealthCheck(
  checkType: string,
  durationSeconds: number,
  success: boolean,
  errorType?: string
): void {
  healthCheckDuration.observe({ check_type: checkType }, durationSeconds);

  if (success) {
    healthCheckSuccess.inc({ check_type: checkType });
  } else {
    healthCheckFailure.inc({
      check_type: checkType,
      error_type: errorType || 'unknown',
    });
  }
}

// Metrics endpoint handler for HTTP server
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

// Reset all metrics (useful for testing)
export function resetMetrics(): void {
  register.resetMetrics();
}
