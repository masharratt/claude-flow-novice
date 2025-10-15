import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RedisTransparencyDashboard from '../RedisTransparencyDashboard';

// Mock Recharts components
jest.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  ScatterChart: ({ children }: any) => <div data-testid="scatter-chart">{children}</div>,
  Scatter: () => <div data-testid="scatter" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>
}));

// Mock fetch
global.fetch = jest.fn();

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  AlertTriangle: () => <div data-testid="alert-triangle" />,
  TrendingUp: () => <div data-testid="trending-up" />,
  TrendingDown: () => <div data-testid="trending-down" />,
  Users: () => <div data-testid="users" />,
  Activity: () => <div data-testid="activity" />,
  Clock: () => <div data-testid="clock" />,
  CheckCircle: () => <div data-testid="check-circle" />,
  XCircle: () => <div data-testid="x-circle" />,
  RefreshCw: () => <div data-testid="refresh-cw" />,
  Filter: () => <div data-testid="filter" />,
  Download: () => <div data-testid="download" />,
  Settings: () => <div data-testid="settings" />,
  Zap: () => <div data-testid="zap" />,
  Database: () => <div data-testid="database" />,
  Shield: () => <div data-testid="shield" />,
  Eye: () => <div data-testid="eye" />,
  BarChart3: () => <div data-testid="bar-chart-3" />,
  PieChartIcon: () => <div data-testid="pie-chart-icon" />,
  LineChartIcon: () => <div data-testid="line-chart-icon" />
}));

const mockDashboardData = {
  predictiveModels: [
    {
      id: 'model-1',
      name: 'Latency Prediction Model',
      accuracy: 0.94,
      confidence: 0.87,
      lastTrained: '2024-01-15T10:00:00Z',
      status: 'active' as const,
      predictions: []
    }
  ],
  agentCollaborations: [
    {
      agentId: 'agent-1',
      agentName: 'React Frontend Engineer',
      role: 'react-frontend-engineer',
      collaborations: 25,
      successRate: 0.92,
      avgResponseTime: 150,
      lastActive: '2024-01-15T10:30:00Z',
      status: 'online' as const
    }
  ],
  performanceMetrics: [
    {
      timestamp: '2024-01-15T10:00:00Z',
      latency: 45,
      throughput: 1000,
      errorRate: 0.5,
      memoryUsage: 65,
      cpuUsage: 40
    }
  ],
  anomalies: [
    {
      id: 'anomaly-1',
      type: 'latency' as const,
      severity: 'high' as const,
      message: 'High latency detected',
      timestamp: '2024-01-15T10:15:00Z',
      value: 250,
      threshold: 200,
      status: 'active' as const
    }
  ],
  summary: {
    totalAgents: 5,
    activeModels: 3,
    anomalyCount: 2,
    avgLatency: 45,
    systemHealth: 85
  }
};

describe('RedisTransparencyDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDashboardData)
    });
  });

  it('renders dashboard header correctly', async () => {
    render(<RedisTransparencyDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Redis Transparency Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Real-time monitoring and analytics')).toBeInTheDocument();
    });
  });

  it('displays summary cards with correct data', async () => {
    render(<RedisTransparencyDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('System Health')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText('Active Agents')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Active Models')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Anomalies')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('renders navigation tabs', async () => {
    render(<RedisTransparencyDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Predictive Models')).toBeInTheDocument();
      expect(screen.getByText('Collaboration')).toBeInTheDocument();
      expect(screen.getByText('Performance')).toBeInTheDocument();
      expect(screen.getByText('Anomalies')).toBeInTheDocument();
    });
  });

  it('switches between tabs correctly', async () => {
    render(<RedisTransparencyDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });

    // Click on Predictive Models tab
    fireEvent.click(screen.getByText('Predictive Models'));
    
    await waitFor(() => {
      expect(screen.getByText('Predictive Models')).toBeInTheDocument();
    });
  });

  it('displays charts in overview tab', async () => {
    render(<RedisTransparencyDashboard />);
    
    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });
  });

  it('shows anomaly table in anomalies tab', async () => {
    render(<RedisTransparencyDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });

    // Click on Anomalies tab
    fireEvent.click(screen.getByText('Anomalies'));
    
    await waitFor(() => {
      expect(screen.getByText('Anomaly Detection')).toBeInTheDocument();
      expect(screen.getByText('latency')).toBeInTheDocument();
      expect(screen.getByText('high')).toBeInTheDocument();
      expect(screen.getByText('High latency detected')).toBeInTheDocument();
    });
  });

  it('handles time range selection', async () => {
    render(<RedisTransparencyDashboard />);
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('Last Hour')).toBeInTheDocument();
    });

    const timeRangeSelect = screen.getByDisplayValue('Last Hour');
    fireEvent.change(timeRangeSelect, { target: { value: '24h' } });
    
    expect(timeRangeSelect).toHaveValue('24h');
  });

  it('toggles auto-refresh', async () => {
    render(<RedisTransparencyDashboard />);
    
    await waitFor(() => {
      expect(screen.getByTestId('refresh-cw')).toBeInTheDocument();
    });

    const autoRefreshButton = screen.getByTestId('refresh-cw').closest('button');
    fireEvent.click(autoRefreshButton!);
    
    // Button should still be there (toggle functionality)
    expect(screen.getByTestId('refresh-cw')).toBeInTheDocument();
  });

  it('displays loading state initially', () => {
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<RedisTransparencyDashboard />);
    
    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
    expect(screen.getByTestId('refresh-cw')).toBeInTheDocument();
  });

  it('displays error state when fetch fails', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    
    render(<RedisTransparencyDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText(/Error loading dashboard/)).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('is accessible with proper ARIA labels', async () => {
    render(<RedisTransparencyDashboard />);
    
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Redis Transparency Dashboard' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument(); // Time range select
    });
  });
});