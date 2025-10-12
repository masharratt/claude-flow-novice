/**
 * Metrics Store Tests
 * Coverage: state mutations, persistence, computed trends, history management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useMetricsStore, metricsSelectors, SystemMetrics, AgentMetrics } from '../metricsStore';

describe('MetricsStore', () => {
  beforeEach(() => {
    useMetricsStore.getState().reset();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('System Metrics', () => {
    it('should set system metrics', () => {
      const metrics: SystemMetrics = {
        cpu: 45.5,
        memory: 60.2,
        disk: 70.1,
        network: { bytesIn: 1000, bytesOut: 500 },
        timestamp: Date.now()
      };

      useMetricsStore.getState().setSystemMetrics(metrics);
      const state = useMetricsStore.getState();

      expect(state.systemMetrics).toEqual(metrics);
    });

    it('should add system metrics to history', () => {
      const metrics: SystemMetrics = {
        cpu: 45.5,
        memory: 60.2,
        disk: 70.1,
        network: { bytesIn: 1000, bytesOut: 500 },
        timestamp: Date.now()
      };

      useMetricsStore.getState().setSystemMetrics(metrics);
      const state = useMetricsStore.getState();

      expect(state.history.system).toHaveLength(1);
      expect(state.history.system[0]).toEqual(metrics);
    });
  });

  describe('Agent Metrics', () => {
    it('should set agent metrics', () => {
      const metrics: AgentMetrics = {
        agentId: 'agent-1',
        cpu: 25.0,
        memory: 30.5,
        tasksInProgress: 2,
        tasksCompleted: 10,
        errorCount: 1,
        confidence: 0.85,
        timestamp: Date.now()
      };

      useMetricsStore.getState().setAgentMetrics('agent-1', metrics);
      const state = useMetricsStore.getState();

      expect(state.agentMetrics.get('agent-1')).toEqual(metrics);
    });

    it('should update agent metrics', () => {
      const metrics: AgentMetrics = {
        agentId: 'agent-2',
        cpu: 25.0,
        memory: 30.5,
        tasksInProgress: 2,
        tasksCompleted: 10,
        errorCount: 1,
        confidence: 0.85,
        timestamp: Date.now()
      };

      useMetricsStore.getState().setAgentMetrics('agent-2', metrics);
      useMetricsStore.getState().updateAgentMetrics('agent-2', { confidence: 0.90 });

      const state = useMetricsStore.getState();
      expect(state.agentMetrics.get('agent-2')?.confidence).toBe(0.90);
    });

    it('should add agent metrics to history', () => {
      const metrics: AgentMetrics = {
        agentId: 'agent-3',
        cpu: 25.0,
        memory: 30.5,
        tasksInProgress: 2,
        tasksCompleted: 10,
        errorCount: 1,
        confidence: 0.85,
        timestamp: Date.now()
      };

      useMetricsStore.getState().setAgentMetrics('agent-3', metrics);
      const state = useMetricsStore.getState();

      expect(state.history.agents.get('agent-3')).toHaveLength(1);
    });
  });

  describe('History Management', () => {
    it('should maintain max history limit', () => {
      for (let i = 0; i < 150; i++) {
        const metrics: SystemMetrics = {
          cpu: 45.5,
          memory: 60.2,
          disk: 70.1,
          network: { bytesIn: 1000, bytesOut: 500 },
          timestamp: Date.now() + i
        };
        useMetricsStore.getState().setSystemMetrics(metrics);
      }

      const state = useMetricsStore.getState();
      expect(state.history.system.length).toBeLessThanOrEqual(100);
    });

    it('should clear system history', () => {
      const metrics: SystemMetrics = {
        cpu: 45.5,
        memory: 60.2,
        disk: 70.1,
        network: { bytesIn: 1000, bytesOut: 500 },
        timestamp: Date.now()
      };

      useMetricsStore.getState().setSystemMetrics(metrics);
      useMetricsStore.getState().clearHistory('system');

      const state = useMetricsStore.getState();
      expect(state.history.system).toHaveLength(0);
    });

    it('should clear agent history', () => {
      const metrics: AgentMetrics = {
        agentId: 'agent-4',
        cpu: 25.0,
        memory: 30.5,
        tasksInProgress: 2,
        tasksCompleted: 10,
        errorCount: 1,
        confidence: 0.85,
        timestamp: Date.now()
      };

      useMetricsStore.getState().setAgentMetrics('agent-4', metrics);
      useMetricsStore.getState().clearHistory('agent', 'agent-4');

      const state = useMetricsStore.getState();
      expect(state.history.agents.has('agent-4')).toBe(false);
    });

    it('should clear all history', () => {
      const sysMetrics: SystemMetrics = {
        cpu: 45.5,
        memory: 60.2,
        disk: 70.1,
        network: { bytesIn: 1000, bytesOut: 500 },
        timestamp: Date.now()
      };

      const agentMetrics: AgentMetrics = {
        agentId: 'agent-5',
        cpu: 25.0,
        memory: 30.5,
        tasksInProgress: 2,
        tasksCompleted: 10,
        errorCount: 1,
        confidence: 0.85,
        timestamp: Date.now()
      };

      useMetricsStore.getState().setSystemMetrics(sysMetrics);
      useMetricsStore.getState().setAgentMetrics('agent-5', agentMetrics);
      useMetricsStore.getState().clearHistory();

      const state = useMetricsStore.getState();
      expect(state.history.system).toHaveLength(0);
      expect(state.history.agents.size).toBe(0);
    });
  });

  describe('Computed Selectors', () => {
    beforeEach(() => {
      // Add sample history data
      for (let i = 0; i < 10; i++) {
        const metrics: SystemMetrics = {
          cpu: 40 + i * 2,
          memory: 50 + i * 3,
          disk: 70.1,
          network: { bytesIn: 1000 + i * 100, bytesOut: 500 + i * 50 },
          timestamp: Date.now() + i * 1000
        };
        useMetricsStore.getState().setSystemMetrics(metrics);
      }
    });

    it('should calculate average CPU', () => {
      const state = useMetricsStore.getState();
      const avgCpu = metricsSelectors.getAverageCPU(state);

      expect(avgCpu).toBeGreaterThan(0);
      expect(avgCpu).toBeCloseTo(49, 0);
    });

    it('should calculate average memory', () => {
      const state = useMetricsStore.getState();
      const avgMemory = metricsSelectors.getAverageMemory(state);

      expect(avgMemory).toBeGreaterThan(0);
      expect(avgMemory).toBeCloseTo(63.5, 0);
    });

    it('should detect memory trend - increasing', () => {
      // Clear and add increasing trend
      useMetricsStore.getState().clearHistory('system');

      for (let i = 0; i < 10; i++) {
        const metrics: SystemMetrics = {
          cpu: 40,
          memory: 50 + i * 5, // Increasing
          disk: 70.1,
          network: { bytesIn: 1000, bytesOut: 500 },
          timestamp: Date.now() + i * 1000
        };
        useMetricsStore.getState().setSystemMetrics(metrics);
      }

      const state = useMetricsStore.getState();
      const trend = metricsSelectors.getMemoryTrend(state);

      expect(trend).toBe('increasing');
    });

    it('should detect CPU trend - stable', () => {
      // Clear and add stable trend
      useMetricsStore.getState().clearHistory('system');

      for (let i = 0; i < 10; i++) {
        const metrics: SystemMetrics = {
          cpu: 40 + (Math.random() - 0.5) * 2, // Small variations
          memory: 50,
          disk: 70.1,
          network: { bytesIn: 1000, bytesOut: 500 },
          timestamp: Date.now() + i * 1000
        };
        useMetricsStore.getState().setSystemMetrics(metrics);
      }

      const state = useMetricsStore.getState();
      const trend = metricsSelectors.getCPUTrend(state);

      expect(trend).toBe('stable');
    });

    it('should get agent performance', () => {
      const metrics: AgentMetrics = {
        agentId: 'perf-agent',
        cpu: 25.0,
        memory: 30.5,
        tasksInProgress: 2,
        tasksCompleted: 10,
        errorCount: 1,
        confidence: 0.85,
        timestamp: Date.now()
      };

      useMetricsStore.getState().setAgentMetrics('perf-agent', metrics);
      const state = useMetricsStore.getState();
      const perf = metricsSelectors.getAgentPerformance(state, 'perf-agent');

      expect(perf.avgCpu).toBe(25.0);
      expect(perf.totalTasks).toBe(10);
      expect(perf.errorRate).toBe(0.1);
    });

    it('should get top performers', () => {
      const agents = [
        { id: 'agent-1', confidence: 0.95 },
        { id: 'agent-2', confidence: 0.85 },
        { id: 'agent-3', confidence: 0.75 }
      ];

      agents.forEach(({ id, confidence }) => {
        const metrics: AgentMetrics = {
          agentId: id,
          cpu: 25.0,
          memory: 30.5,
          tasksInProgress: 2,
          tasksCompleted: 10,
          errorCount: 1,
          confidence,
          timestamp: Date.now()
        };
        useMetricsStore.getState().setAgentMetrics(id, metrics);
      });

      const state = useMetricsStore.getState();
      const topPerformers = metricsSelectors.getTopPerformers(state, 2);

      expect(topPerformers).toHaveLength(2);
      expect(topPerformers[0].agentId).toBe('agent-1');
      expect(topPerformers[0].confidence).toBe(0.95);
    });

    it('should calculate network throughput', () => {
      const state = useMetricsStore.getState();
      const throughput = metricsSelectors.getNetworkThroughput(state);

      expect(throughput.bytesInPerSec).toBeGreaterThan(0);
      expect(throughput.bytesOutPerSec).toBeGreaterThan(0);
    });
  });

  describe('Persistence', () => {
    it('should persist to sessionStorage', () => {
      const metrics: SystemMetrics = {
        cpu: 45.5,
        memory: 60.2,
        disk: 70.1,
        network: { bytesIn: 1000, bytesOut: 500 },
        timestamp: Date.now()
      };

      useMetricsStore.getState().setSystemMetrics(metrics);

      const stored = sessionStorage.getItem('metrics-store');
      expect(stored).not.toBeNull();
    });
  });

  describe('State Management', () => {
    it('should set loading state', () => {
      useMetricsStore.getState().setLoading(true);
      expect(useMetricsStore.getState().loading).toBe(true);
    });

    it('should set error state', () => {
      useMetricsStore.getState().setError('Test error');
      expect(useMetricsStore.getState().error).toBe('Test error');
    });

    it('should reset to initial state', () => {
      const metrics: SystemMetrics = {
        cpu: 45.5,
        memory: 60.2,
        disk: 70.1,
        network: { bytesIn: 1000, bytesOut: 500 },
        timestamp: Date.now()
      };

      useMetricsStore.getState().setSystemMetrics(metrics);
      useMetricsStore.getState().reset();

      const state = useMetricsStore.getState();
      expect(state.systemMetrics).toBeNull();
      expect(state.history.system).toHaveLength(0);
    });
  });
});
