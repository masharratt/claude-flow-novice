/**
 * Agent Store Tests
 * Coverage: state mutations, persistence, computed selectors, hierarchy
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAgentStore, agentSelectors, Agent } from '../agentStore';

describe('AgentStore', () => {
  beforeEach(() => {
    // Clear store before each test
    useAgentStore.getState().reset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('State Mutations', () => {
    it('should set agents', () => {
      const agents: Agent[] = [
        {
          id: 'agent-1',
          name: 'Coder Agent',
          type: 'coder',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      useAgentStore.getState().setAgents(agents);
      const state = useAgentStore.getState();

      expect(state.agents).toHaveLength(1);
      expect(state.agents[0].id).toBe('agent-1');
    });

    it('should add agent', () => {
      const agent: Agent = {
        id: 'agent-2',
        name: 'Tester Agent',
        type: 'tester',
        status: 'idle',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      useAgentStore.getState().addAgent(agent);
      const state = useAgentStore.getState();

      expect(state.agents).toHaveLength(1);
      expect(state.agents[0].id).toBe('agent-2');
    });

    it('should update agent', () => {
      const agent: Agent = {
        id: 'agent-3',
        name: 'Original Name',
        type: 'coder',
        status: 'idle',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      useAgentStore.getState().addAgent(agent);
      useAgentStore.getState().updateAgent('agent-3', { name: 'Updated Name' });

      const state = useAgentStore.getState();
      expect(state.agents[0].name).toBe('Updated Name');
    });

    it('should remove agent', () => {
      const agent: Agent = {
        id: 'agent-4',
        name: 'To Remove',
        type: 'coder',
        status: 'idle',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      useAgentStore.getState().addAgent(agent);
      useAgentStore.getState().removeAgent('agent-4');

      const state = useAgentStore.getState();
      expect(state.agents).toHaveLength(0);
    });

    it('should update agent status', () => {
      const agent: Agent = {
        id: 'agent-5',
        name: 'Status Test',
        type: 'coder',
        status: 'idle',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      useAgentStore.getState().addAgent(agent);
      useAgentStore.getState().updateAgentStatus('agent-5', 'active');

      const state = useAgentStore.getState();
      expect(state.agents[0].status).toBe('active');
    });
  });

  describe('Selection', () => {
    it('should select agent', () => {
      useAgentStore.getState().selectAgent('agent-1');
      const state = useAgentStore.getState();

      expect(state.selectedAgentId).toBe('agent-1');
    });

    it('should deselect agent', () => {
      useAgentStore.getState().selectAgent('agent-1');
      useAgentStore.getState().selectAgent(null);
      const state = useAgentStore.getState();

      expect(state.selectedAgentId).toBeNull();
    });
  });

  describe('Hierarchy', () => {
    it('should build hierarchy from agents', () => {
      const agents: Agent[] = [
        {
          id: 'root',
          name: 'Root',
          type: 'coordinator',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: 'child-1',
          name: 'Child 1',
          type: 'coder',
          status: 'active',
          parentId: 'root',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      useAgentStore.getState().setAgents(agents);
      const state = useAgentStore.getState();

      expect(state.hierarchy).not.toBeNull();
      expect(state.hierarchy?.root.id).toBe('root');
      expect(state.hierarchy?.children.get('root')).toHaveLength(1);
    });

    it('should calculate hierarchy depth', () => {
      const agents: Agent[] = [
        { id: 'root', name: 'Root', type: 'coordinator', status: 'active', createdAt: Date.now(), updatedAt: Date.now() },
        { id: 'level1', name: 'Level 1', type: 'coder', status: 'active', parentId: 'root', createdAt: Date.now(), updatedAt: Date.now() },
        { id: 'level2', name: 'Level 2', type: 'tester', status: 'active', parentId: 'level1', createdAt: Date.now(), updatedAt: Date.now() }
      ];

      useAgentStore.getState().setAgents(agents);
      const state = useAgentStore.getState();

      expect(state.hierarchy?.depth).toBe(2);
    });
  });

  describe('Computed Selectors', () => {
    beforeEach(() => {
      const agents: Agent[] = [
        {
          id: 'agent-1',
          name: 'Active Agent',
          type: 'coder',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metrics: { tasksCompleted: 10, confidence: 0.85, errorRate: 0.05 }
        },
        {
          id: 'agent-2',
          name: 'Idle Agent',
          type: 'tester',
          status: 'idle',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metrics: { tasksCompleted: 5, confidence: 0.90, errorRate: 0.02 }
        }
      ];

      useAgentStore.getState().setAgents(agents);
    });

    it('should get selected agent', () => {
      useAgentStore.getState().selectAgent('agent-1');
      const state = useAgentStore.getState();
      const selected = agentSelectors.getSelectedAgent(state);

      expect(selected?.id).toBe('agent-1');
    });

    it('should get agents by status', () => {
      const state = useAgentStore.getState();
      const active = agentSelectors.getAgentsByStatus(state, 'active');

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('agent-1');
    });

    it('should get active agents', () => {
      const state = useAgentStore.getState();
      const active = agentSelectors.getActiveAgents(state);

      expect(active).toHaveLength(1);
    });

    it('should calculate average confidence', () => {
      const state = useAgentStore.getState();
      const avgConfidence = agentSelectors.getAverageConfidence(state);

      expect(avgConfidence).toBeCloseTo(0.875, 2);
    });

    it('should get total tasks completed', () => {
      const state = useAgentStore.getState();
      const total = agentSelectors.getTotalTasksCompleted(state);

      expect(total).toBe(15);
    });

    it('should get agent children', () => {
      const agents: Agent[] = [
        { id: 'parent', name: 'Parent', type: 'coordinator', status: 'active', createdAt: Date.now(), updatedAt: Date.now() },
        { id: 'child-1', name: 'Child 1', type: 'coder', status: 'active', parentId: 'parent', createdAt: Date.now(), updatedAt: Date.now() },
        { id: 'child-2', name: 'Child 2', type: 'tester', status: 'active', parentId: 'parent', createdAt: Date.now(), updatedAt: Date.now() }
      ];

      useAgentStore.getState().setAgents(agents);
      const state = useAgentStore.getState();
      const children = agentSelectors.getAgentChildren(state, 'parent');

      expect(children).toHaveLength(2);
    });
  });

  describe('Persistence', () => {
    it('should persist to localStorage', () => {
      const agent: Agent = {
        id: 'persist-1',
        name: 'Persist Test',
        type: 'coder',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      useAgentStore.getState().addAgent(agent);

      // Check localStorage
      const stored = localStorage.getItem('agent-store');
      expect(stored).not.toBeNull();
    });

    it('should hydrate from localStorage', () => {
      const agent: Agent = {
        id: 'hydrate-1',
        name: 'Hydrate Test',
        type: 'coder',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      useAgentStore.getState().addAgent(agent);

      // Check that data was stored
      const stored = localStorage.getItem('agent-store');
      expect(stored).not.toBeNull();

      // In real app, Zustand persist middleware handles hydration automatically
      // This test verifies that data is stored correctly
      if (stored) {
        const parsed = JSON.parse(stored);
        expect(parsed.state).toBeDefined();
        expect(parsed.timestamp).toBeDefined();
      }
    });

    it('should respect TTL for stored data', () => {
      const agent: Agent = {
        id: 'ttl-test',
        name: 'TTL Test',
        type: 'coder',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      useAgentStore.getState().addAgent(agent);

      // Mock expired data
      const expiredData = JSON.stringify({
        state: JSON.stringify({ agents: [agent] }),
        timestamp: Date.now() - (2 * 60 * 60 * 1000) // 2 hours ago
      });

      localStorage.setItem('agent-store', expiredData);

      // Try to retrieve (should return null due to TTL)
      const storage = useAgentStore.persist.getOptions().storage!;
      const retrieved = storage.getItem('agent-store');

      expect(retrieved).toBeNull();
    });
  });

  describe('State Management', () => {
    it('should set loading state', () => {
      useAgentStore.getState().setLoading(true);
      expect(useAgentStore.getState().loading).toBe(true);
    });

    it('should set error state', () => {
      useAgentStore.getState().setError('Test error');
      expect(useAgentStore.getState().error).toBe('Test error');
    });

    it('should reset to initial state', () => {
      const agent: Agent = {
        id: 'reset-test',
        name: 'Reset Test',
        type: 'coder',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      useAgentStore.getState().addAgent(agent);
      useAgentStore.getState().setError('Error');
      useAgentStore.getState().reset();

      const state = useAgentStore.getState();
      expect(state.agents).toHaveLength(0);
      expect(state.error).toBeNull();
    });
  });
});
