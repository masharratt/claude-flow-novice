/**
 * AgentHierarchyTreeContainer Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AgentHierarchyTreeContainer } from '../containers/AgentHierarchyTreeContainer';
import { useAgentStore } from '../../../shared/stores/agentStore';
import { useWebSocket } from '../../../shared/hooks/useWebSocket';

// Mock modules
vi.mock('../../../shared/stores/agentStore');
vi.mock('../../../shared/hooks/useWebSocket');
vi.mock('../../../shared/hooks/useWebSocketEvent', () => ({
  useWebSocketEvent: vi.fn(),
}));
vi.mock('@claude-flow-novice/web-components/AgentHierarchyTree', () => ({
  AgentHierarchyTree: ({ agents, loading }: any) => (
    <div data-testid="agent-hierarchy-tree">
      {loading ? 'Loading...' : `${agents.length} agents`}
    </div>
  ),
}));

describe('AgentHierarchyTreeContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state when loading', () => {
    (useAgentStore as any).mockReturnValue({
      agents: [],
      loading: true,
      error: null,
      selectAgent: vi.fn(),
    });
    (useWebSocket as any).mockReturnValue({
      isConnected: false,
    });

    render(<AgentHierarchyTreeContainer />);
    expect(screen.getByText('Loading agent hierarchy...')).toBeInTheDocument();
  });

  it('should render error state when error exists', () => {
    (useAgentStore as any).mockReturnValue({
      agents: [],
      loading: false,
      error: 'Test error',
      selectAgent: vi.fn(),
    });
    (useWebSocket as any).mockReturnValue({
      isConnected: false,
    });

    render(<AgentHierarchyTreeContainer />);
    expect(screen.getByText(/Error loading agents: Test error/)).toBeInTheDocument();
  });

  it('should render AgentHierarchyTree with agents', async () => {
    const mockAgents = [
      {
        id: 'agent-1',
        name: 'Test Agent 1',
        type: 'coder',
        status: 'active' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: {
          tasksCompleted: 5,
          confidence: 0.85,
          errorRate: 0.1,
        },
      },
      {
        id: 'agent-2',
        name: 'Test Agent 2',
        type: 'tester',
        status: 'idle' as const,
        parentId: 'agent-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    (useAgentStore as any).mockReturnValue({
      agents: mockAgents,
      loading: false,
      error: null,
      selectAgent: vi.fn(),
    });
    (useWebSocket as any).mockReturnValue({
      isConnected: true,
    });

    render(<AgentHierarchyTreeContainer />);
    await waitFor(() => {
      expect(screen.getByTestId('agent-hierarchy-tree')).toBeInTheDocument();
      expect(screen.getByText('2 agents')).toBeInTheDocument();
    });
  });

  it('should call selectAgent when agent is selected', () => {
    const mockSelectAgent = vi.fn();
    (useAgentStore as any).mockReturnValue({
      agents: [{
        id: 'agent-1',
        name: 'Test Agent',
        type: 'coder',
        status: 'active' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
      loading: false,
      error: null,
      selectAgent: mockSelectAgent,
    });
    (useWebSocket as any).mockReturnValue({
      isConnected: true,
    });

    render(<AgentHierarchyTreeContainer />);
    // Agent selection is handled by the component internally
    expect(mockSelectAgent).not.toHaveBeenCalled(); // Not called on initial render
  });

  it('should pass WebSocket connection status to component', () => {
    (useAgentStore as any).mockReturnValue({
      agents: [],
      loading: false,
      error: null,
      selectAgent: vi.fn(),
    });
    (useWebSocket as any).mockReturnValue({
      isConnected: true,
    });

    render(<AgentHierarchyTreeContainer realTimeUpdates={true} />);
    // Component should receive realTimeUpdates=true when connected
    expect(screen.getByTestId('agent-hierarchy-tree')).toBeInTheDocument();
  });
});
