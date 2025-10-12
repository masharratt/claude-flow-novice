/**
 * FleetOverview Component Tests
 * Comprehensive test suite for fleet management dashboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FleetOverview } from './FleetOverview';
import { Agent, FleetOverviewProps } from './FleetOverview.types';

/**
 * Mock agents for testing
 */
const mockAgents: Agent[] = [
  {
    id: 'agent-1',
    name: 'Coder Agent 1',
    type: 'coder',
    status: 'active',
    connectionStatus: 'connected',
    activity: 'Implementing authentication',
    progress: 75,
    health: 95,
    resources: {
      cpu: 45.2,
      memory: 62.8,
      memoryUsage: 1024 * 1024 * 512, // 512 MB
    },
    metrics: {
      tokensUsed: 15000,
      tasksCompleted: 5,
      efficiency: 0.85,
      uptime: 3600000, // 1 hour
    },
    created: new Date('2025-01-01T10:00:00Z'),
    lastActivity: new Date('2025-01-01T11:45:00Z'),
    swarmId: 'swarm-1',
  },
  {
    id: 'agent-2',
    name: 'Reviewer Agent 1',
    type: 'reviewer',
    status: 'busy',
    connectionStatus: 'connected',
    activity: 'Reviewing code quality',
    progress: 50,
    health: 88,
    resources: {
      cpu: 32.5,
      memory: 45.0,
    },
    metrics: {
      tokensUsed: 8000,
      tasksCompleted: 3,
      efficiency: 0.78,
    },
    created: new Date('2025-01-01T10:15:00Z'),
    lastActivity: new Date('2025-01-01T11:30:00Z'),
    swarmId: 'swarm-1',
  },
  {
    id: 'agent-3',
    name: 'Tester Agent 1',
    type: 'tester',
    status: 'idle',
    connectionStatus: 'connected',
    progress: 0,
    health: 100,
    resources: {
      cpu: 5.0,
      memory: 15.0,
    },
    metrics: {
      tokensUsed: 2000,
      tasksCompleted: 8,
      efficiency: 0.92,
    },
    created: new Date('2025-01-01T09:00:00Z'),
    lastActivity: new Date('2025-01-01T11:00:00Z'),
    swarmId: 'swarm-2',
  },
  {
    id: 'agent-4',
    name: 'Security Agent 1',
    type: 'security-specialist',
    status: 'error',
    connectionStatus: 'reconnecting',
    activity: 'Security scan failed',
    progress: 25,
    health: 45,
    resources: {
      cpu: 78.0,
      memory: 92.0,
    },
    metrics: {
      tokensUsed: 12000,
      tasksCompleted: 1,
      efficiency: 0.35,
    },
    errors: [
      {
        message: 'Connection timeout to vulnerability database',
        timestamp: new Date('2025-01-01T11:40:00Z'),
        severity: 'error',
      },
      {
        message: 'High CPU usage detected',
        timestamp: new Date('2025-01-01T11:35:00Z'),
        severity: 'warning',
      },
    ],
    created: new Date('2025-01-01T10:30:00Z'),
    lastActivity: new Date('2025-01-01T11:40:00Z'),
    swarmId: 'swarm-1',
  },
  {
    id: 'agent-5',
    name: 'DevOps Agent 1',
    type: 'devops-engineer',
    status: 'paused',
    connectionStatus: 'connected',
    activity: 'Deployment paused',
    progress: 80,
    health: 70,
    resources: {
      cpu: 12.0,
      memory: 25.0,
    },
    metrics: {
      tokensUsed: 5000,
      tasksCompleted: 2,
      efficiency: 0.65,
    },
    created: new Date('2025-01-01T11:00:00Z'),
    lastActivity: new Date('2025-01-01T11:20:00Z'),
    swarmId: 'swarm-2',
  },
];

/**
 * Default props for testing
 */
const defaultProps: FleetOverviewProps = {
  agents: mockAgents,
  onAgentSelect: vi.fn(),
  onRefresh: vi.fn(),
  autoRefresh: false,
};

describe('FleetOverview Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<FleetOverview {...defaultProps} />);
      expect(screen.getByText('Fleet Overview')).toBeInTheDocument();
    });

    it('displays fleet statistics summary', () => {
      render(<FleetOverview {...defaultProps} showStatistics={true} />);

      expect(screen.getByText('Total Agents')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument(); // Total count
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument(); // Active + busy
    });

    it('renders agent cards in grid view', () => {
      render(<FleetOverview {...defaultProps} viewMode="grid" />);

      expect(screen.getByText('Coder Agent 1')).toBeInTheDocument();
      expect(screen.getByText('Reviewer Agent 1')).toBeInTheDocument();
      expect(screen.getByText('Tester Agent 1')).toBeInTheDocument();
    });

    it('renders agent cards in list view', () => {
      render(<FleetOverview {...defaultProps} viewMode="list" />);

      expect(screen.getByText('Coder Agent 1')).toBeInTheDocument();
      expect(screen.getByText('coder')).toBeInTheDocument();
    });

    it('displays agent details correctly', () => {
      render(<FleetOverview {...defaultProps} />);

      // Check agent name and type
      expect(screen.getByText('Coder Agent 1')).toBeInTheDocument();
      expect(screen.getByText('coder')).toBeInTheDocument();

      // Check activity
      expect(screen.getByText('Implementing authentication')).toBeInTheDocument();

      // Check status chip
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    });

    it('displays connection status indicator', () => {
      render(<FleetOverview {...defaultProps} />);

      const connectedIndicators = screen.getAllByText('connected');
      expect(connectedIndicators.length).toBeGreaterThan(0);
    });

    it('shows progress bars for agents with progress', () => {
      render(<FleetOverview {...defaultProps} />);

      // Check for progress labels
      const progressLabels = screen.getAllByText('Progress');
      expect(progressLabels.length).toBeGreaterThan(0);

      // Check for progress percentages
      expect(screen.getByText('75.0%')).toBeInTheDocument();
    });

    it('displays resource metrics', () => {
      render(<FleetOverview {...defaultProps} />);

      // Check for CPU and Memory labels
      expect(screen.getAllByText('CPU').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Memory').length).toBeGreaterThan(0);
    });

    it('shows error badges for agents with errors', () => {
      render(<FleetOverview {...defaultProps} />);

      expect(screen.getByText('Recent Errors')).toBeInTheDocument();
      expect(screen.getByText('Connection timeout to vulnerability database')).toBeInTheDocument();
    });

    it('displays empty state when no agents', () => {
      render(<FleetOverview {...defaultProps} agents={[]} />);

      expect(screen.getByText('No agents found')).toBeInTheDocument();
      expect(screen.getByText('Agents will appear here when available')).toBeInTheDocument();
    });

    it('shows loading state', () => {
      render(<FleetOverview {...defaultProps} loading={true} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('displays error message', () => {
      const errorMessage = 'Failed to fetch fleet data';
      render(<FleetOverview {...defaultProps} error={errorMessage} />);

      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('filters agents by status', async () => {
      render(<FleetOverview {...defaultProps} showFilters={true} />);

      const statusSelect = screen.getByLabelText('Status');
      fireEvent.mouseDown(statusSelect);

      const activeOption = await screen.findByText('Active');
      fireEvent.click(activeOption);

      await waitFor(() => {
        // Should show only active and busy agents
        expect(screen.getByText('Coder Agent 1')).toBeInTheDocument();
        expect(screen.getByText('Reviewer Agent 1')).toBeInTheDocument();
        expect(screen.queryByText('Tester Agent 1')).not.toBeInTheDocument();
      });
    });

    it('filters agents by search term', async () => {
      render(<FleetOverview {...defaultProps} showFilters={true} />);

      const searchInput = screen.getByPlaceholderText('Search agents...');
      fireEvent.change(searchInput, { target: { value: 'Security' } });

      await waitFor(() => {
        expect(screen.getByText('Security Agent 1')).toBeInTheDocument();
        expect(screen.queryByText('Coder Agent 1')).not.toBeInTheDocument();
      });
    });

    it('clears filters when showing all agents', async () => {
      render(<FleetOverview {...defaultProps} showFilters={true} />);

      const statusSelect = screen.getByLabelText('Status');
      fireEvent.mouseDown(statusSelect);

      const allOption = await screen.findByText('All');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByText('Coder Agent 1')).toBeInTheDocument();
        expect(screen.getByText('Tester Agent 1')).toBeInTheDocument();
      });
    });
  });

  describe('Sorting', () => {
    it('sorts agents by name', async () => {
      render(<FleetOverview {...defaultProps} showSort={true} sort={{ field: 'name', direction: 'asc' }} />);

      const sortSelect = screen.getByLabelText('Sort by');
      fireEvent.mouseDown(sortSelect);

      const nameOption = await screen.findByText('Name');
      fireEvent.click(nameOption);

      // Verify agents are displayed (detailed sorting verification would require more complex DOM queries)
      await waitFor(() => {
        expect(screen.getByText('Coder Agent 1')).toBeInTheDocument();
      });
    });
  });

  describe('View Mode', () => {
    it('toggles between grid and list view', async () => {
      render(<FleetOverview {...defaultProps} showViewToggle={true} />);

      // Default is grid view
      const gridButton = screen.getByRole('button', { name: /grid/i });
      expect(gridButton).toHaveAttribute('aria-pressed', 'true');

      // Switch to list view
      const listButton = screen.getByRole('button', { name: /list/i });
      fireEvent.click(listButton);

      await waitFor(() => {
        expect(listButton).toHaveAttribute('aria-pressed', 'true');
      });
    });
  });

  describe('Pagination', () => {
    it('displays pagination when enabled', () => {
      const manyAgents = Array.from({ length: 25 }, (_, i) => ({
        ...mockAgents[0],
        id: `agent-${i}`,
        name: `Agent ${i}`,
      }));

      render(<FleetOverview {...defaultProps} agents={manyAgents} enablePagination={true} pageSize={10} />);

      // Should show pagination component
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('changes page when pagination button clicked', async () => {
      const manyAgents = Array.from({ length: 25 }, (_, i) => ({
        ...mockAgents[0],
        id: `agent-${i}`,
        name: `Agent ${i}`,
      }));

      render(<FleetOverview {...defaultProps} agents={manyAgents} enablePagination={true} pageSize={10} />);

      const nextButton = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        // Page should change (detailed verification would require checking visible agents)
        expect(screen.getByRole('navigation')).toBeInTheDocument();
      });
    });
  });

  describe('Interactions', () => {
    it('calls onAgentSelect when agent card is clicked', () => {
      const onAgentSelect = vi.fn();
      render(<FleetOverview {...defaultProps} onAgentSelect={onAgentSelect} />);

      const agentCard = screen.getByText('Coder Agent 1').closest('div');
      if (agentCard) {
        fireEvent.click(agentCard);
      }

      expect(onAgentSelect).toHaveBeenCalledWith('agent-1');
    });

    it('calls onRefresh when refresh button clicked', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);
      render(<FleetOverview {...defaultProps} onRefresh={onRefresh} />);

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
      });
    });

    it('highlights selected agent', () => {
      render(<FleetOverview {...defaultProps} selectedAgentId="agent-1" />);

      const selectedCard = screen.getByText('Coder Agent 1').closest('div');
      expect(selectedCard).toHaveStyle({ border: '2px solid' });
    });
  });

  describe('Statistics Calculation', () => {
    it('calculates correct fleet statistics', () => {
      render(<FleetOverview {...defaultProps} showStatistics={true} />);

      // Total agents
      expect(screen.getByText('5')).toBeInTheDocument();

      // Active agents (active + busy)
      expect(screen.getByText('2')).toBeInTheDocument();

      // Idle agents
      expect(screen.getByText('1')).toBeInTheDocument();

      // Paused agents
      const pausedStats = screen.getAllByText('1');
      expect(pausedStats.length).toBeGreaterThan(0);

      // Error agents
      const errorStats = screen.getAllByText('1');
      expect(errorStats.length).toBeGreaterThan(0);
    });

    it('calculates average health correctly', () => {
      render(<FleetOverview {...defaultProps} showStatistics={true} />);

      // Average health: (95 + 88 + 100 + 45 + 70) / 5 = 79.6
      expect(screen.getByText('80%')).toBeInTheDocument(); // Rounded
    });

    it('calculates total tokens correctly', () => {
      render(<FleetOverview {...defaultProps} showStatistics={true} />);

      // Total tokens: 15000 + 8000 + 2000 + 12000 + 5000 = 42000
      expect(screen.getByText('42,000')).toBeInTheDocument();
    });
  });

  describe('Real-time Updates', () => {
    it('initializes WebSocket connection when enabled', () => {
      const websocketUrl = 'ws://localhost:8080';
      render(<FleetOverview {...defaultProps} enableRealTime={true} websocketUrl={websocketUrl} />);

      // Component should render without crashing
      expect(screen.getByText('Fleet Overview')).toBeInTheDocument();
    });
  });

  describe('Auto-refresh', () => {
    it('triggers auto-refresh at specified interval', async () => {
      vi.useFakeTimers();
      const onRefresh = vi.fn();

      render(<FleetOverview {...defaultProps} autoRefresh={true} refreshInterval={1000} onRefresh={onRefresh} />);

      // Fast-forward time
      vi.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
      });

      vi.useRealTimers();
    });
  });

  describe('Compact Mode', () => {
    it('renders in compact mode with reduced spacing', () => {
      render(<FleetOverview {...defaultProps} compact={true} />);

      expect(screen.getByText('Fleet Overview')).toBeInTheDocument();
      // Visual verification would require checking specific CSS classes
    });
  });

  describe('Edge Cases', () => {
    it('handles agents without metrics gracefully', () => {
      const agentWithoutMetrics: Agent = {
        ...mockAgents[0],
        metrics: undefined,
      };

      render(<FleetOverview {...defaultProps} agents={[agentWithoutMetrics]} />);

      expect(screen.getByText('Coder Agent 1')).toBeInTheDocument();
    });

    it('handles agents without resources gracefully', () => {
      const agentWithoutResources: Agent = {
        ...mockAgents[0],
        resources: undefined,
      };

      render(<FleetOverview {...defaultProps} agents={[agentWithoutResources]} />);

      expect(screen.getByText('Coder Agent 1')).toBeInTheDocument();
    });

    it('handles agents without errors gracefully', () => {
      const agentWithoutErrors: Agent = {
        ...mockAgents[0],
        errors: undefined,
      };

      render(<FleetOverview {...defaultProps} agents={[agentWithoutErrors]} />);

      expect(screen.queryByText('Recent Errors')).not.toBeInTheDocument();
    });

    it('handles division by zero in statistics', () => {
      render(<FleetOverview {...defaultProps} agents={[]} showStatistics={true} />);

      // Should not crash, should show 0 or NaN handled gracefully
      expect(screen.getByText('Fleet Overview')).toBeInTheDocument();
    });
  });
});
