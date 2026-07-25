/**
 * Metrics Store - System and agent performance metrics with trend analysis
 * Features: sessionStorage persistence, Immer middleware, DevTools, computed trends
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';

// Enable Map/Set support in Immer
enableMapSet();

export interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  network: {
    bytesIn: number;
    bytesOut: number;
  };
  timestamp: number;
}

export interface AgentMetrics {
  agentId: string;
  cpu: number;
  memory: number;
  tasksInProgress: number;
  tasksCompleted: number;
  errorCount: number;
  confidence: number;
  timestamp: number;
}

export interface MetricsHistory {
  system: SystemMetrics[];
  agents: Map<string, AgentMetrics[]>;
  maxHistory: number;
}

interface MetricsState {
  systemMetrics: SystemMetrics | null;
  agentMetrics: Map<string, AgentMetrics>;
  history: MetricsHistory;
  loading: boolean;
  error: string | null;
}

interface MetricsActions {
  // System metrics
  setSystemMetrics: (metrics: SystemMetrics) => void;

  // Agent metrics
  setAgentMetrics: (agentId: string, metrics: AgentMetrics) => void;
  updateAgentMetrics: (agentId: string, updates: Partial<AgentMetrics>) => void;

  // History management
  addToHistory: (type: 'system' | 'agent', data: SystemMetrics | AgentMetrics) => void;
  clearHistory: (type?: 'system' | 'agent', agentId?: string) => void;

  // State management
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type MetricsStore = MetricsState & MetricsActions;

// Computed selectors with trend analysis
export const metricsSelectors = {
  getAverageCPU: (state: MetricsStore): number => {
    if (state.history.system.length === 0) return 0;
    const sum = state.history.system.reduce((acc, m) => acc + m.cpu, 0);
    return sum / state.history.system.length;
  },

  getAverageMemory: (state: MetricsStore): number => {
    if (state.history.system.length === 0) return 0;
    const sum = state.history.system.reduce((acc, m) => acc + m.memory, 0);
    return sum / state.history.system.length;
  },

  getMemoryTrend: (state: MetricsStore): 'increasing' | 'decreasing' | 'stable' => {
    const history = state.history.system;
    if (history.length < 2) return 'stable';

    const recent = history.slice(-5);
    const avgRecent = recent.reduce((acc, m) => acc + m.memory, 0) / recent.length;
    const older = history.slice(-10, -5);
    if (older.length === 0) return 'stable';

    const avgOlder = older.reduce((acc, m) => acc + m.memory, 0) / older.length;
    const threshold = 5; // 5% threshold

    if (avgRecent > avgOlder * (1 + threshold / 100)) return 'increasing';
    if (avgRecent < avgOlder * (1 - threshold / 100)) return 'decreasing';
    return 'stable';
  },

  getCPUTrend: (state: MetricsStore): 'increasing' | 'decreasing' | 'stable' => {
    const history = state.history.system;
    if (history.length < 2) return 'stable';

    const recent = history.slice(-5);
    const avgRecent = recent.reduce((acc, m) => acc + m.cpu, 0) / recent.length;
    const older = history.slice(-10, -5);
    if (older.length === 0) return 'stable';

    const avgOlder = older.reduce((acc, m) => acc + m.cpu, 0) / older.length;
    const threshold = 10; // 10% threshold

    if (avgRecent > avgOlder * (1 + threshold / 100)) return 'increasing';
    if (avgRecent < avgOlder * (1 - threshold / 100)) return 'decreasing';
    return 'stable';
  },

  getAgentPerformance: (state: MetricsStore, agentId: string): {
    avgCpu: number;
    avgMemory: number;
    totalTasks: number;
    errorRate: number;
  } => {
    const agentHistory = state.history.agents.get(agentId) || [];
    if (agentHistory.length === 0) {
      return { avgCpu: 0, avgMemory: 0, totalTasks: 0, errorRate: 0 };
    }

    const avgCpu = agentHistory.reduce((acc, m) => acc + m.cpu, 0) / agentHistory.length;
    const avgMemory = agentHistory.reduce((acc, m) => acc + m.memory, 0) / agentHistory.length;
    const latest = agentHistory[agentHistory.length - 1];
    const totalTasks = latest.tasksCompleted;
    const errorRate = totalTasks > 0 ? latest.errorCount / totalTasks : 0;

    return { avgCpu, avgMemory, totalTasks, errorRate };
  },

  getTopPerformers: (state: MetricsStore, limit: number = 5): Array<{ agentId: string; confidence: number }> => {
    const metrics = Array.from(state.agentMetrics.values())
      .map(m => ({ agentId: m.agentId, confidence: m.confidence }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    return metrics;
  },

  getNetworkThroughput: (state: MetricsStore): { bytesInPerSec: number; bytesOutPerSec: number } => {
    const history = state.history.system;
    if (history.length < 2) return { bytesInPerSec: 0, bytesOutPerSec: 0 };

    const recent = history.slice(-2);
    const timeDiff = (recent[1].timestamp - recent[0].timestamp) / 1000; // seconds

    const bytesInPerSec = (recent[1].network.bytesIn - recent[0].network.bytesIn) / timeDiff;
    const bytesOutPerSec = (recent[1].network.bytesOut - recent[0].network.bytesOut) / timeDiff;

    return { bytesInPerSec, bytesOutPerSec };
  }
};

const MAX_HISTORY = 100;

const initialState: MetricsState = {
  systemMetrics: null,
  agentMetrics: new Map(),
  history: {
    system: [],
    agents: new Map(),
    maxHistory: MAX_HISTORY
  },
  loading: false,
  error: null
};

export const useMetricsStore = create<MetricsStore>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

        setSystemMetrics: (metrics) => set((state) => {
          state.systemMetrics = metrics;
          // Auto-add to history
          if (state.history.system.length >= MAX_HISTORY) {
            state.history.system.shift();
          }
          state.history.system.push(metrics);
        }),

        setAgentMetrics: (agentId, metrics) => set((state) => {
          state.agentMetrics.set(agentId, metrics);

          // Add to history
          if (!state.history.agents.has(agentId)) {
            state.history.agents.set(agentId, []);
          }
          const agentHistory = state.history.agents.get(agentId)!;
          if (agentHistory.length >= MAX_HISTORY) {
            agentHistory.shift();
          }
          agentHistory.push(metrics);
        }),

        updateAgentMetrics: (agentId, updates) => set((state) => {
          const current = state.agentMetrics.get(agentId);
          if (current) {
            const updated = { ...current, ...updates, timestamp: Date.now() };
            state.agentMetrics.set(agentId, updated);

            // Add to history
            const agentHistory = state.history.agents.get(agentId)!;
            if (agentHistory.length >= MAX_HISTORY) {
              agentHistory.shift();
            }
            agentHistory.push(updated);
          }
        }),

        addToHistory: (type, data) => set((state) => {
          if (type === 'system') {
            if (state.history.system.length >= MAX_HISTORY) {
              state.history.system.shift();
            }
            state.history.system.push(data as SystemMetrics);
          } else {
            const agentData = data as AgentMetrics;
            if (!state.history.agents.has(agentData.agentId)) {
              state.history.agents.set(agentData.agentId, []);
            }
            const agentHistory = state.history.agents.get(agentData.agentId)!;
            if (agentHistory.length >= MAX_HISTORY) {
              agentHistory.shift();
            }
            agentHistory.push(agentData);
          }
        }),

        clearHistory: (type, agentId) => set((state) => {
          if (!type) {
            state.history.system = [];
            state.history.agents.clear();
          } else if (type === 'system') {
            state.history.system = [];
          } else if (agentId) {
            state.history.agents.delete(agentId);
          } else {
            state.history.agents.clear();
          }
        }),

        setLoading: (loading) => set((state) => {
          state.loading = loading;
        }),

        setError: (error) => set((state) => {
          state.error = error;
        }),

        reset: () => set(() => initialState)
      })),
      {
        name: 'metrics-store',
        version: 1,
        // Store in sessionStorage (volatile)
        storage: {
          getItem: (name) => sessionStorage.getItem(name),
          setItem: (name, value) => sessionStorage.setItem(name, value),
          removeItem: (name) => sessionStorage.removeItem(name)
        },
        // Serialize Map objects
        partialize: (state) => ({
          systemMetrics: state.systemMetrics,
          agentMetrics: Array.from(state.agentMetrics.entries()),
          history: {
            system: state.history.system,
            agents: Array.from(state.history.agents.entries()),
            maxHistory: state.history.maxHistory
          }
        }),
        // Deserialize Map objects
        merge: (persistedState: any, currentState) => ({
          ...currentState,
          ...persistedState,
          agentMetrics: new Map(persistedState.agentMetrics || []),
          history: {
            ...persistedState.history,
            agents: new Map(persistedState.history?.agents || [])
          }
        })
      }
    ),
    { name: 'MetricsStore', enabled: process.env.NODE_ENV === 'development' }
  )
);
