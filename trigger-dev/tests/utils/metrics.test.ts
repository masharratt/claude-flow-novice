import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  register,
  agentSpawnCounter,
  agentExecutionDuration,
  agentCostTotal,
  healthCheckSuccess,
  healthCheckFailure,
  recordAgentSpawn,
  recordAgentExecution,
  recordAgentCost,
  recordHealthCheck,
  resetMetrics,
  getMetrics,
} from '../../src/utils/metrics';

describe('Prometheus Metrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  afterEach(() => {
    resetMetrics();
  });

  describe('Agent Spawn Metrics', () => {
    test('should record agent spawn', async () => {
      recordAgentSpawn({
        team: 'platform',
        agentType: 'backend-developer',
        project: 'auth-service',
        mode: 'standard',
      });

      const metrics = await getMetrics();

      expect(metrics).toContain('cfn_agent_spawns_total');
      expect(metrics).toContain('agent_type="backend-developer"');
      expect(metrics).toContain('team="platform"');
      expect(metrics).toContain('project="auth-service"');
      expect(metrics).toContain('mode="standard"');
    });

    test('should increment spawn counter multiple times', async () => {
      recordAgentSpawn({
        team: 'platform',
        agentType: 'backend-developer',
        project: 'auth-service',
        mode: 'standard',
      });

      recordAgentSpawn({
        team: 'platform',
        agentType: 'backend-developer',
        project: 'auth-service',
        mode: 'standard',
      });

      const metrics = await getMetrics();
      const spawnMetric = metrics
        .split('\n')
        .find((line) =>
          line.includes('cfn_agent_spawns_total') &&
          line.includes('agent_type="backend-developer"') &&
          !line.startsWith('#')
        );

      expect(spawnMetric).toContain(' 2');
    });

    test('should handle unknown values with defaults', async () => {
      recordAgentSpawn({});

      const metrics = await getMetrics();

      expect(metrics).toContain('team="unknown"');
      expect(metrics).toContain('agent_type="unknown"');
      expect(metrics).toContain('project="unknown"');
      expect(metrics).toContain('mode="standard"');
    });
  });

  describe('Agent Execution Metrics', () => {
    test('should record successful agent execution', async () => {
      recordAgentExecution(
        {
          team: 'platform',
          agentType: 'backend-developer',
          project: 'auth-service',
        },
        45.5,
        'success'
      );

      const metrics = await getMetrics();

      expect(metrics).toContain('cfn_agent_execution_duration_seconds');
      expect(metrics).toContain('cfn_agent_executions_total');
      expect(metrics).toContain('status="success"');
    });

    test('should record failed agent execution', async () => {
      recordAgentExecution(
        {
          team: 'platform',
          agentType: 'backend-developer',
          project: 'auth-service',
        },
        12.3,
        'failure'
      );

      const metrics = await getMetrics();

      expect(metrics).toContain('status="failure"');
    });

    test('should record timeout status', async () => {
      recordAgentExecution(
        {
          team: 'platform',
          agentType: 'backend-developer',
          project: 'auth-service',
        },
        300,
        'timeout'
      );

      const metrics = await getMetrics();

      expect(metrics).toContain('status="timeout"');
    });

    test('should track execution count and duration separately', async () => {
      recordAgentExecution(
        {
          team: 'platform',
          agentType: 'backend-developer',
          project: 'auth-service',
        },
        10,
        'success'
      );

      recordAgentExecution(
        {
          team: 'platform',
          agentType: 'backend-developer',
          project: 'auth-service',
        },
        20,
        'success'
      );

      const metrics = await getMetrics();

      // Check execution counter
      const executionCounter = metrics
        .split('\n')
        .find((line) =>
          line.includes('cfn_agent_executions_total') &&
          line.includes('status="success"') &&
          !line.startsWith('#')
        );

      expect(executionCounter).toContain(' 2');

      // Check duration histogram
      expect(metrics).toContain('cfn_agent_execution_duration_seconds_count');
      expect(metrics).toContain('cfn_agent_execution_duration_seconds_sum');
    });
  });

  describe('Cost Tracking Metrics', () => {
    test('should record agent cost', async () => {
      recordAgentCost(
        {
          team: 'platform',
          project: 'auth-service',
          agentType: 'backend-developer',
          provider: 'kimi',
        },
        0.05,
        1500,
        500
      );

      const metrics = await getMetrics();

      expect(metrics).toContain('cfn_agent_cost_dollars_total');
      expect(metrics).toContain('cfn_agent_tokens_total');
      expect(metrics).toContain('provider="kimi"');
      expect(metrics).toContain('token_type="input"');
      expect(metrics).toContain('token_type="output"');
    });

    test('should accumulate costs correctly', async () => {
      recordAgentCost(
        {
          team: 'platform',
          project: 'auth-service',
          agentType: 'backend-developer',
          provider: 'kimi',
        },
        0.05,
        1500,
        500
      );

      recordAgentCost(
        {
          team: 'platform',
          project: 'auth-service',
          agentType: 'backend-developer',
          provider: 'kimi',
        },
        0.03,
        1000,
        300
      );

      const metrics = await getMetrics();

      const costMetric = metrics
        .split('\n')
        .find((line) =>
          line.includes('cfn_agent_cost_dollars_total') &&
          line.includes('provider="kimi"') &&
          !line.startsWith('#')
        );

      expect(costMetric).toContain(' 0.08');
    });

    test('should track input and output tokens separately', async () => {
      recordAgentCost(
        {
          team: 'platform',
          project: 'auth-service',
          agentType: 'backend-developer',
          provider: 'kimi',
        },
        0.05,
        2000,
        800
      );

      const metrics = await getMetrics();

      const inputTokens = metrics
        .split('\n')
        .find((line) =>
          line.includes('cfn_agent_tokens_total') &&
          line.includes('token_type="input"') &&
          line.includes('provider="kimi"') &&
          !line.startsWith('#')
        );

      const outputTokens = metrics
        .split('\n')
        .find((line) =>
          line.includes('cfn_agent_tokens_total') &&
          line.includes('token_type="output"') &&
          line.includes('provider="kimi"') &&
          !line.startsWith('#')
        );

      expect(inputTokens).toContain(' 2000');
      expect(outputTokens).toContain(' 800');
    });
  });

  describe('Health Check Metrics', () => {
    test('should record successful health check', async () => {
      recordHealthCheck('docker', 1.5, true);

      const metrics = await getMetrics();

      expect(metrics).toContain('cfn_health_check_success_total');
      expect(metrics).toContain('check_type="docker"');
      expect(metrics).toContain('cfn_health_check_duration_seconds');
    });

    test('should record failed health check', async () => {
      recordHealthCheck('redis', 2.5, false, 'connection_error');

      const metrics = await getMetrics();

      expect(metrics).toContain('cfn_health_check_failure_total');
      expect(metrics).toContain('check_type="redis"');
      expect(metrics).toContain('error_type="connection_error"');
    });

    test('should track success and failure counts separately', async () => {
      recordHealthCheck('docker', 1.0, true);
      recordHealthCheck('docker', 1.2, true);
      recordHealthCheck('docker', 3.0, false, 'timeout');

      const metrics = await getMetrics();

      const successMetric = metrics
        .split('\n')
        .find((line) =>
          line.includes('cfn_health_check_success_total') &&
          line.includes('check_type="docker"') &&
          !line.startsWith('#')
        );

      const failureMetric = metrics
        .split('\n')
        .find((line) =>
          line.includes('cfn_health_check_failure_total') &&
          line.includes('check_type="docker"') &&
          !line.startsWith('#')
        );

      expect(successMetric).toContain(' 2');
      expect(failureMetric).toContain(' 1');
    });

    test('should record health check durations', async () => {
      recordHealthCheck('workspace_volume', 0.5, true);
      recordHealthCheck('workspace_volume', 0.8, true);

      const metrics = await getMetrics();

      expect(metrics).toContain('cfn_health_check_duration_seconds_count');
      expect(metrics).toContain('cfn_health_check_duration_seconds_sum');

      const durationCount = metrics
        .split('\n')
        .find((line) =>
          line.includes('cfn_health_check_duration_seconds_count') &&
          line.includes('check_type="workspace_volume"') &&
          !line.startsWith('#')
        );

      expect(durationCount).toContain(' 2');
    });
  });

  describe('Metrics Registry', () => {
    test('should include default metrics', async () => {
      const metrics = await getMetrics();

      // Default Node.js metrics
      expect(metrics).toContain('process_cpu_user_seconds_total');
      expect(metrics).toContain('process_resident_memory_bytes');
      expect(metrics).toContain('nodejs_eventloop_lag_seconds');
    });

    test('should reset all metrics', async () => {
      recordAgentSpawn({
        team: 'platform',
        agentType: 'backend-developer',
        project: 'auth-service',
        mode: 'standard',
      });

      let metrics = await getMetrics();
      expect(metrics).toContain('cfn_agent_spawns_total');

      resetMetrics();

      metrics = await getMetrics();
      const spawnMetric = metrics
        .split('\n')
        .find((line) =>
          line.includes('cfn_agent_spawns_total') &&
          !line.startsWith('#')
        );

      expect(spawnMetric).toBeUndefined();
    });

    test('should export metrics in Prometheus format', async () => {
      recordAgentSpawn({
        team: 'platform',
        agentType: 'backend-developer',
        project: 'auth-service',
        mode: 'standard',
      });

      const metrics = await getMetrics();

      // Check Prometheus format
      expect(metrics).toContain('# HELP cfn_agent_spawns_total');
      expect(metrics).toContain('# TYPE cfn_agent_spawns_total counter');
      expect(metrics).toMatch(/cfn_agent_spawns_total\{.*\} \d+/);
    });
  });

  describe('Label Handling', () => {
    test('should handle missing labels with defaults', async () => {
      recordAgentSpawn({
        team: 'platform',
        // Missing agentType, project, mode
      });

      const metrics = await getMetrics();

      expect(metrics).toContain('agent_type="unknown"');
      expect(metrics).toContain('project="unknown"');
      expect(metrics).toContain('mode="standard"');
    });

    test('should distinguish metrics by labels', async () => {
      recordAgentSpawn({
        team: 'platform',
        agentType: 'backend-developer',
        project: 'auth-service',
        mode: 'standard',
      });

      recordAgentSpawn({
        team: 'data',
        agentType: 'data-engineer',
        project: 'analytics',
        mode: 'mvp',
      });

      const metrics = await getMetrics();

      const backendMetric = metrics
        .split('\n')
        .find((line) =>
          line.includes('cfn_agent_spawns_total') &&
          line.includes('agent_type="backend-developer"') &&
          !line.startsWith('#')
        );

      const dataMetric = metrics
        .split('\n')
        .find((line) =>
          line.includes('cfn_agent_spawns_total') &&
          line.includes('agent_type="data-engineer"') &&
          !line.startsWith('#')
        );

      expect(backendMetric).toBeDefined();
      expect(dataMetric).toBeDefined();
      expect(backendMetric).not.toBe(dataMetric);
    });
  });
});
