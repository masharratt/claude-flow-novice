/**
 * StatusMonitorContainer Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StatusMonitorContainer } from '../containers/StatusMonitorContainer';
import { useAgentStore } from '../../../shared/stores/agentStore';

// Mock modules
vi.mock('../../../shared/stores/agentStore');
vi.mock('../../../shared/hooks/useWebSocketEvent', () => ({
  useWebSocketEvent: vi.fn(),
}));
vi.mock('@claude-flow-novice/web-components/StatusMonitor', () => ({
  StatusMonitor: ({ statuses, loading }: any) => (
    <div data-testid="status-monitor">
      {loading ? 'Loading...' : `${Object.keys(statuses).length} statuses`}
    </div>
  ),
}));

describe('StatusMonitorContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state when loading', () => {
    (useAgentStore as any).mockReturnValue({
      agents: [],
      loading: true,
      updateAgentStatus: vi.fn(),
    });

    render(<StatusMonitorContainer />);
    expect(screen.getByText('Loading agent statuses...')).toBeInTheDocument();
  });

  it('should render StatusMonitor with agent statuses', async () => {
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    (useAgentStore as any).mockReturnValue({
      agents: mockAgents,
      loading: false,
      updateAgentStatus: vi.fn(),
    });

    render(<StatusMonitorContainer />);
    await waitFor(() => {
      expect(screen.getByTestId('status-monitor')).toBeInTheDocument();
      expect(screen.getByText('2 statuses')).toBeInTheDocument();
    });
  });

  it('should transform agent data to status format', () => {
    const mockAgents = [
      {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'coder',
        status: 'active' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: {
          tasksCompleted: 10,
          confidence: 0.9,
          errorRate: 0.05,
        },
      },
    ];

    (useAgentStore as any).mockReturnValue({
      agents: mockAgents,
      loading: false,
      updateAgentStatus: vi.fn(),
    });

    render(<StatusMonitorContainer />);
    expect(screen.getByTestId('status-monitor')).toBeInTheDocument();
  });

  it('should handle empty agent list', () => {
    (useAgentStore as any).mockReturnValue({
      agents: [],
      loading: false,
      updateAgentStatus: vi.fn(),
    });

    render(<StatusMonitorContainer />);
    expect(screen.getByTestId('status-monitor')).toBeInTheDocument();
    expect(screen.getByText('0 statuses')).toBeInTheDocument();
  });
});
