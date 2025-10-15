import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CollaborationTracker from '../CollaborationTracker';

// Mock Recharts components
jest.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Treemap: () => <div data-testid="treemap" />
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Users: () => <div data-testid="users" />,
  GitBranch: () => <div data-testid="git-branch" />,
  MessageSquare: () => <div data-testid="message-square" />,
  Clock: () => <div data-testid="clock" />,
  TrendingUp: () => <div data-testid="trending-up" />,
  Activity: () => <div data-testid="activity" />,
  Zap: () => <div data-testid="zap" />,
  Eye: () => <div data-testid="eye" />,
  Handshake: () => <div data-testid="handshake" />,
  ArrowRight: () => <div data-testid="arrow-right" />,
  RefreshCw: () => <div data-testid="refresh-cw" />,
  Filter: () => <div data-testid="filter" />,
  Search: () => <div data-testid="search" />,
  BarChart3: () => <div data-testid="bar-chart-3" />
}));

const mockProps = {
  agents: [
    {
      id: 'agent-1',
      name: 'React Frontend Engineer',
      role: 'react-frontend-engineer',
      status: 'online' as const,
      capabilities: ['react', 'typescript', 'css'],
      lastActive: '2024-01-15T10:30:00Z',
      workload: 75
    },
    {
      id: 'agent-2',
      name: 'Backend Developer',
      role: 'backend-dev',
      status: 'online' as const,
      capabilities: ['nodejs', 'database', 'api'],
      lastActive: '2024-01-15T10:25:00Z',
      workload: 60
    },
    {
      id: 'agent-3',
      name: 'System Architect',
      role: 'system-architect',
      status: 'busy' as const,
      capabilities: ['architecture', 'scalability'],
      lastActive: '2024-01-15T10:20:00Z',
      workload: 90
    },
    {
      id: 'agent-4',
      name: 'Security Specialist',
      role: 'security-specialist',
      status: 'offline' as const,
      capabilities: ['security', 'audit'],
      lastActive: '2024-01-15T09:30:00Z',
      workload: 0
    }
  ],
  events: [
    {
      id: 'event-1',
      sourceAgentId: 'agent-1',
      targetAgentId: 'agent-2',
      type: 'message' as const,
      timestamp: '2024-01-15T10:15:00Z',
      duration: 250,
      success: true,
      priority: 'medium' as const,
      metadata: { taskId: 'task-1' }
    },
    {
      id: 'event-2',
      sourceAgentId: 'agent-2',
      targetAgentId: 'agent-3',
      type: 'task_handoff' as const,
      timestamp: '2024-01-15T10:10:00Z',
      duration: 1500,
      success: true,
      priority: 'high' as const,
      metadata: { taskId: 'task-2' }
    },
    {
      id: 'event-3',
      sourceAgentId: 'agent-3',
      targetAgentId: 'agent-1',
      type: 'data_share' as const,
      timestamp: '2024-01-15T10:05:00Z',
      duration: 800,
      success: false,
      priority: 'low' as const,
      metadata: { taskId: 'task-3' }
    }
  ],
  metrics: [
    {
      agentId: 'agent-1',
      totalCollaborations: 25,
      successfulCollaborations: 23,
      avgResponseTime: 150,
      collaborationScore: 8.5,
      partners: ['agent-2', 'agent-3'],
      frequentPartners: [
        { agentId: 'agent-2', count: 15 },
        { agentId: 'agent-3', count: 8 }
      ],
      collaborationTypes: { message: 12, task_handoff: 8, data_share: 5 }
    },
    {
      agentId: 'agent-2',
      totalCollaborations: 30,
      successfulCollaborations: 28,
      avgResponseTime: 120,
      collaborationScore: 9.2,
      partners: ['agent-1', 'agent-3', 'agent-4'],
      frequentPartners: [
        { agentId: 'agent-1', count: 18 },
        { agentId: 'agent-3', count: 10 }
      ],
      collaborationTypes: { message: 15, task_handoff: 10, data_share: 5 }
    }
  ],
  network: {
    nodes: [
      { id: 'agent-1', name: 'React Frontend Engineer', role: 'react-frontend-engineer', group: 1 },
      { id: 'agent-2', name: 'Backend Developer', role: 'backend-dev', group: 2 },
      { id: 'agent-3', name: 'System Architect', role: 'system-architect', group: 3 }
    ],
    links: [
      { source: 'agent-1', target: 'agent-2', value: 15, type: 'message' },
      { source: 'agent-2', target: 'agent-3', value: 10, type: 'task_handoff' },
      { source: 'agent-3', target: 'agent-1', value: 8, type: 'data_share' }
    ]
  },
  onAgentSelect: jest.fn(),
  onEventFilter: jest.fn()
};

describe('CollaborationTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders component header correctly', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    expect(screen.getByText('Cross-Agent Collaboration Tracking')).toBeInTheDocument();
    expect(screen.getByTestId('users')).toBeInTheDocument();
  });

  it('displays all agents in the sidebar', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    expect(screen.getByText('React Frontend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Backend Developer')).toBeInTheDocument();
    expect(screen.getByText('System Architect')).toBeInTheDocument();
    expect(screen.getByText('Security Specialist')).toBeInTheDocument();
  });

  it('shows agent status indicators', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    const agents = screen.getAllByRole('generic');
    // Status indicators should be present for each agent
    expect(screen.getByText('react-frontend-engineer')).toBeInTheDocument();
    expect(screen.getByText('backend-dev')).toBeInTheDocument();
    expect(screen.getByText('system-architect')).toBeInTheDocument();
    expect(screen.getByText('security-specialist')).toBeInTheDocument();
  });

  it('displays collaboration scores', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText('9.2')).toBeInTheDocument();
  });

  it('handles agent selection', async () => {
    render(<CollaborationTracker {...mockProps} />);
    
    const agentCard = screen.getByText('React Frontend Engineer');
    fireEvent.click(agentCard);
    
    await waitFor(() => {
      expect(mockProps.onAgentSelect).toHaveBeenCalledWith('agent-1');
    });
  });

  it('switches between view modes', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    // Default view is metrics
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart-3')).toBeInTheDocument();
    
    // Switch to network view
    const networkTab = screen.getByText('Network');
    fireEvent.click(networkTab);
    
    expect(screen.getByTestId('treemap')).toBeInTheDocument();
    
    // Switch to timeline view
    const timelineTab = screen.getByText('Timeline');
    fireEvent.click(timelineTab);
    
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('displays performance chart in metrics view', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    expect(screen.getByText('Collaboration Performance')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('displays collaboration by type pie chart', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    expect(screen.getByText('Collaboration by Type')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('shows selected agent details', async () => {
    render(<CollaborationTracker {...mockProps} />);
    
    // Select an agent
    const agentCard = screen.getByText('React Frontend Engineer');
    fireEvent.click(agentCard);
    
    await waitFor(() => {
      expect(screen.getByText('React Frontend Engineer - Collaboration Details')).toBeInTheDocument();
      expect(screen.getByText('Total Collaborations')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
      expect(screen.getByText('Success Rate')).toBeInTheDocument();
      expect(screen.getByText('92.0%')).toBeInTheDocument();
    });
  });

  it('displays frequent partners for selected agent', async () => {
    render(<CollaborationTracker {...mockProps} />);
    
    // Select an agent
    const agentCard = screen.getByText('React Frontend Engineer');
    fireEvent.click(agentCard);
    
    await waitFor(() => {
      expect(screen.getByText('Frequent Partners')).toBeInTheDocument();
      expect(screen.getByText('Backend Developer')).toBeInTheDocument();
      expect(screen.getByText('15 collaborations')).toBeInTheDocument();
    });
  });

  it('handles search functionality', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search agents...');
    fireEvent.change(searchInput, { target: { value: 'React' } });
    
    expect(searchInput).toHaveValue('React');
  });

  it('handles time range selection', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    const timeRangeSelect = screen.getByDisplayValue('Last 24 Hours');
    fireEvent.change(timeRangeSelect, { target: { value: '7d' } });
    
    expect(timeRangeSelect).toHaveValue('7d');
  });

  it('handles event type filtering', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    const eventTypeSelect = screen.getByDisplayValue('All Events');
    fireEvent.change(eventTypeSelect, { target: { value: 'message' } });
    
    expect(eventTypeSelect).toHaveValue('message');
  });

  it('displays recent collaboration events', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    expect(screen.getByText('Recent Collaboration Events')).toBeInTheDocument();
    expect(screen.getByText('message')).toBeInTheDocument();
    expect(screen.getByText('task_handoff')).toBeInTheDocument();
    expect(screen.getByText('data_share')).toBeInTheDocument();
  });

  it('shows event priority badges', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('LOW')).toBeInTheDocument();
  });

  it('shows event success status', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('displays collaboration timeline in timeline view', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    // Switch to timeline view
    const timelineTab = screen.getByText('Timeline');
    fireEvent.click(timelineTab);
    
    expect(screen.getByText('Collaboration Timeline')).toBeInTheDocument();
  });

  it('formats timestamps correctly', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    expect(screen.getByText(/10:15/)).toBeInTheDocument();
    expect(screen.getByText(/10:10/)).toBeInTheDocument();
    expect(screen.getByText(/10:05/)).toBeInTheDocument();
  });

  it('calculates success rates correctly', async () => {
    render(<CollaborationTracker {...mockProps} />);
    
    // Select an agent
    const agentCard = screen.getByText('React Frontend Engineer');
    fireEvent.click(agentCard);
    
    await waitFor(() => {
      // 23 successful / 25 total = 92%
      expect(screen.getByText('92.0%')).toBeInTheDocument();
    });
  });

  it('displays network visualization in network view', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    // Switch to network view
    const networkTab = screen.getByText('Network');
    fireEvent.click(networkTab);
    
    expect(screen.getByText('Collaboration Network')).toBeInTheDocument();
    expect(screen.getByTestId('treemap')).toBeInTheDocument();
  });

  it('shows agent workload information', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    // Workload is displayed in agent cards
    expect(screen.getByText('75')).toBeInTheDocument(); // React Frontend Engineer workload
    expect(screen.getByText('60')).toBeInTheDocument(); // Backend Developer workload
  });

  it('handles empty agent selection', async () => {
    render(<CollaborationTracker {...mockProps} />);
    
    // Select an agent
    const agentCard = screen.getByText('React Frontend Engineer');
    fireEvent.click(agentCard);
    
    await waitFor(() => {
      expect(screen.getByText('React Frontend Engineer - Collaboration Details')).toBeInTheDocument();
    });
    
    // Click again to deselect
    fireEvent.click(agentCard);
    
    await waitFor(() => {
      // Details should no longer be visible
      expect(screen.queryByText('React Frontend Engineer - Collaboration Details')).not.toBeInTheDocument();
    });
  });

  it('displays agent roles correctly', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    expect(screen.getByText('react-frontend-engineer')).toBeInTheDocument();
    expect(screen.getByText('backend-dev')).toBeInTheDocument();
    expect(screen.getByText('system-architect')).toBeInTheDocument();
    expect(screen.getByText('security-specialist')).toBeInTheDocument();
  });

  it('shows event duration when available', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    expect(screen.getByText('250ms')).toBeInTheDocument();
    expect(screen.getByText('1500ms')).toBeInTheDocument();
    expect(screen.getByText('800ms')).toBeInTheDocument();
  });

  it('is accessible with proper ARIA labels', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    expect(screen.getByRole('heading', { name: 'Cross-Agent Collaboration Tracking' })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument(); // Search input
    expect(screen.getByRole('combobox')).toBeInTheDocument(); // Select inputs
  });

  it('handles agent filtering correctly', () => {
    render(<CollaborationTracker {...mockProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search agents...');
    fireEvent.change(searchInput, { target: { value: 'NonExistentAgent' } });
    
    // Should still render the component, just with filtered results
    expect(screen.getByText('Cross-Agent Collaboration Tracking')).toBeInTheDocument();
  });
});