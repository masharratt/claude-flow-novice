/**
 * Agent Store - Manages agent state, hierarchy, and lifecycle
 * Features: localStorage persistence (1h TTL), Immer middleware, DevTools
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export interface Agent {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'active' | 'paused' | 'completed' | 'failed';
  parentId?: string;
  createdAt: number;
  updatedAt: number;
  metrics?: {
    tasksCompleted: number;
    confidence: number;
    errorRate: number;
  };
}

export interface AgentHierarchy {
  root: Agent;
  children: Map<string, Agent[]>;
  depth: number;
}

interface AgentState {
  agents: Agent[];
  selectedAgentId: string | null;
  hierarchy: AgentHierarchy | null;
  loading: boolean;
  error: string | null;
}

interface AgentActions {
  // Agent management
  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  removeAgent: (id: string) => void;

  // Selection
  selectAgent: (id: string | null) => void;

  // Status updates
  updateAgentStatus: (id: string, status: Agent['status']) => void;

  // Hierarchy
  buildHierarchy: () => void;

  // State management
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type AgentStore = AgentState & AgentActions;

// Computed selectors
export const agentSelectors = {
  getSelectedAgent: (state: AgentStore): Agent | null => {
    if (!state.selectedAgentId) return null;
    return state.agents.find(a => a.id === state.selectedAgentId) || null;
  },

  getAgentsByStatus: (state: AgentStore, status: Agent['status']): Agent[] => {
    return state.agents.filter(a => a.status === status);
  },

  getActiveAgents: (state: AgentStore): Agent[] => {
    return state.agents.filter(a => a.status === 'active');
  },

  getAgentChildren: (state: AgentStore, parentId: string): Agent[] => {
    return state.agents.filter(a => a.parentId === parentId);
  },

  getAverageConfidence: (state: AgentStore): number => {
    const agentsWithMetrics = state.agents.filter(a => a.metrics?.confidence);
    if (agentsWithMetrics.length === 0) return 0;

    const sum = agentsWithMetrics.reduce((acc, a) => acc + (a.metrics?.confidence || 0), 0);
    return sum / agentsWithMetrics.length;
  },

  getTotalTasksCompleted: (state: AgentStore): number => {
    return state.agents.reduce((acc, a) => acc + (a.metrics?.tasksCompleted || 0), 0);
  }
};

const initialState: AgentState = {
  agents: [],
  selectedAgentId: null,
  hierarchy: null,
  loading: false,
  error: null
};

// Helper to build hierarchy
const buildHierarchyFromAgents = (agents: Agent[]): AgentHierarchy | null => {
  const roots = agents.filter(a => !a.parentId);
  if (roots.length === 0) return null;

  const childrenMap = new Map<string, Agent[]>();
  let maxDepth = 0;

  const calculateDepth = (agent: Agent, depth: number = 0): number => {
    maxDepth = Math.max(maxDepth, depth);
    const children = agents.filter(a => a.parentId === agent.id);
    childrenMap.set(agent.id, children);

    return children.reduce((max, child) => {
      return Math.max(max, calculateDepth(child, depth + 1));
    }, depth);
  };

  calculateDepth(roots[0]);

  return {
    root: roots[0],
    children: childrenMap,
    depth: maxDepth
  };
};

export const useAgentStore = create<AgentStore>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

        setAgents: (agents) => set((state) => {
          state.agents = agents.map(a => ({
            ...a,
            updatedAt: Date.now()
          }));
          // Auto-rebuild hierarchy when agents change
          state.hierarchy = buildHierarchyFromAgents(state.agents);
        }),

        addAgent: (agent) => set((state) => {
          state.agents.push({
            ...agent,
            createdAt: agent.createdAt || Date.now(),
            updatedAt: Date.now()
          });
          state.hierarchy = buildHierarchyFromAgents(state.agents);
        }),

        updateAgent: (id, updates) => set((state) => {
          const index = state.agents.findIndex(a => a.id === id);
          if (index !== -1) {
            state.agents[index] = {
              ...state.agents[index],
              ...updates,
              updatedAt: Date.now()
            };
            state.hierarchy = buildHierarchyFromAgents(state.agents);
          }
        }),

        removeAgent: (id) => set((state) => {
          state.agents = state.agents.filter(a => a.id !== id);
          if (state.selectedAgentId === id) {
            state.selectedAgentId = null;
          }
          state.hierarchy = buildHierarchyFromAgents(state.agents);
        }),

        selectAgent: (id) => set((state) => {
          state.selectedAgentId = id;
        }),

        updateAgentStatus: (id, status) => set((state) => {
          const index = state.agents.findIndex(a => a.id === id);
          if (index !== -1) {
            state.agents[index].status = status;
            state.agents[index].updatedAt = Date.now();
          }
        }),

        buildHierarchy: () => set((state) => {
          state.hierarchy = buildHierarchyFromAgents(state.agents);
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
        name: 'agent-store',
        version: 1,
        // 1 hour TTL
        partialize: (state) => ({
          agents: state.agents,
          selectedAgentId: state.selectedAgentId
        }),
        // Custom storage with TTL
        storage: {
          getItem: (name) => {
            const item = localStorage.getItem(name);
            if (!item) return null;

            try {
              const { state, timestamp } = JSON.parse(item);
              const now = Date.now();
              const TTL = 60 * 60 * 1000; // 1 hour

              if (now - timestamp > TTL) {
                localStorage.removeItem(name);
                return null;
              }

              return state;
            } catch {
              return null;
            }
          },
          setItem: (name, value) => {
            const item = JSON.stringify({
              state: value,
              timestamp: Date.now()
            });
            localStorage.setItem(name, item);
          },
          removeItem: (name) => localStorage.removeItem(name)
        }
      }
    ),
    { name: 'AgentStore', enabled: process.env.NODE_ENV === 'development' }
  )
);
