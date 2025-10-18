import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AnomalyDetector from '../AnomalyDetector';

// Mock Recharts components
jest.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ReferenceLine: () => <div data-testid="reference-line" />,
  ComposedChart: ({ children }: any) => <div data-testid="composed-chart">{children}</div>,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  AlertTriangle: () => <div data-testid="alert-triangle" />,
  Shield: () => <div data-testid="shield" />,
  Activity: () => <div data-testid="activity" />,
  TrendingUp: () => <div data-testid="trending-up" />,
  TrendingDown: () => <div data-testid="trending-down" />,
  Clock: () => <div data-testid="clock" />,
  CheckCircle: () => <div data-testid="check-circle" />,
  XCircle: () => <div data-testid="x-circle" />,
  Zap: () => <div data-testid="zap" />,
  Bell: () => <div data-testid="bell" />,
  Filter: () => <div data-testid="filter" />,
  Search: () => <div data-testid="search" />,
  Eye: () => <div data-testid="eye" />,
  Settings: () => <div data-testid="settings" />,
  Play: () => <div data-testid="play" />,
  Pause: () => <div data-testid="pause" />
}));

const mockProps = {
  anomalies: [
    {
      id: 'anomaly-1',
      type: 'latency' as const,
      severity: 'critical' as const,
      title: 'High Latency Detected',
      description: 'API latency exceeded 200ms threshold for 5 consecutive minutes',
      timestamp: '2024-01-15T10:15:00Z',
      value: 245,
      threshold: 200,
      expectedValue: 85,
      confidence: 0.92,
      status: 'active' as const,
      source: 'api-gateway',
      affectedComponents: ['user-service', 'database'],
      metadata: { endpoint: '/api/users', method: 'GET' }
    },
    {
      id: 'anomaly-2',
      type: 'memory_usage' as const,
      severity: 'medium' as const,
      title: 'Memory Usage Spike',
      description: 'Memory usage increased by 40% in the last hour',
      timestamp: '2024-01-15T09:45:00Z',
      value: 85,
      threshold: 80,
      expectedValue: 60,
      confidence: 0.87,
      status: 'investigating' as const,
      source: 'worker-service',
      affectedComponents: ['worker-service'],
      metadata: { process_id: '1234' }
    },
    {
      id: 'anomaly-3',
      type: 'error_rate' as const,
      severity: 'low' as const,
      title: 'Slightly Elevated Error Rate',
      description: 'Error rate slightly above normal baseline',
      timestamp: '2024-01-15T09:30:00Z',
      value: 2.5,
      threshold: 2.0,
      expectedValue: 1.0,
      confidence: 0.75,
      status: 'resolved' as const,
      source: 'auth-service',
      affectedComponents: ['auth-service'],
      metadata: { error_type: 'timeout' }
    }
  ],
  patterns: [
    {
      id: 'pattern-1',
      type: 'latency_spike',
      frequency: 0.15,
      confidence: 0.89,
      description: 'Recurring latency spikes during peak hours',
      lastDetected: '2024-01-15T10:00:00Z',
      occurrences: 12
    },
    {
      id: 'pattern-2',
      type: 'memory_leak',
      frequency: 0.08,
      confidence: 0.76,
      description: 'Gradual memory increase over time',
      lastDetected: '2024-01-15T09:00:00Z',
      occurrences: 5
    }
  ],
  metrics: {
    latency: [
      {
        timestamp: '2024-01-15T10:00:00Z',
        value: 45,
        threshold: 100,
        anomaly: false
      },
      {
        timestamp: '2024-01-15T10:15:00Z',
        value: 245,
        threshold: 100,
        anomaly: true,
        anomalyId: 'anomaly-1'
      }
    ],
    error_rate: [
      {
        timestamp: '2024-01-15T10:00:00Z',
        value: 1.2,
        threshold: 5.0,
        anomaly: false
      }
    ],
    memory_usage: [
      {
        timestamp: '2024-01-15T10:00:00Z',
        value: 75,
        threshold: 85,
        anomaly: false
      }
    ]
  },
  rules: [
    {
      id: 'rule-1',
      name: 'High Latency Detection',
      type: 'threshold',
      metric: 'latency',
      condition: 'greater_than' as const,
      threshold: 200,
      sensitivity: 0.8,
      enabled: true,
      lastTriggered: '2024-01-15T10:15:00Z'
    },
    {
      id: 'rule-2',
      name: 'Memory Usage Alert',
      type: 'threshold',
      metric: 'memory_usage',
      condition: 'greater_than' as const,
      threshold: 80,
      sensitivity: 0.7,
      enabled: true
    }
  ],
  onAnomalyAcknowledge: jest.fn(),
  onRuleToggle: jest.fn(),
  onThresholdAdjust: jest.fn()
};

describe('AnomalyDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders component header correctly', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    expect(screen.getByText('Anomaly Detection & Alerting')).toBeInTheDocument();
    expect(screen.getByTestId('shield')).toBeInTheDocument();
  });

  it('displays auto-detect status', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    expect(screen.getByText('Auto-detect Active')).toBeInTheDocument();
    expect(screen.getByText('Pause Detection')).toBeInTheDocument();
  });

  it('displays anomaly statistics correctly', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    expect(screen.getByText('Total Anomalies')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Investigating')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('toggles auto-detection', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    const pauseButton = screen.getByText('Pause Detection');
    fireEvent.click(pauseButton);
    
    expect(screen.getByText('Resume Detection')).toBeInTheDocument();
  });

  it('opens detection rules modal', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    const rulesButton = screen.getByText('Detection Rules');
    fireEvent.click(rulesButton);
    
    expect(screen.getByText('Detection Rules')).toBeInTheDocument();
    expect(screen.getByText('High Latency Detection')).toBeInTheDocument();
    expect(screen.getByText('Memory Usage Alert')).toBeInTheDocument();
  });

  it('closes detection rules modal', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    const rulesButton = screen.getByText('Detection Rules');
    fireEvent.click(rulesButton);
    
    const closeButton = screen.getByTestId('x-circle');
    fireEvent.click(closeButton);
    
    // Modal should be closed (header should be visible again)
    expect(screen.getByText('Anomaly Detection & Alerting')).toBeInTheDocument();
  });

  it('handles anomaly filtering by severity', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    const severityFilter = screen.getByDisplayValue('All Severities');
    fireEvent.change(severityFilter, { target: { value: 'critical' } });
    
    expect(severityFilter).toHaveValue('critical');
  });

  it('handles anomaly filtering by status', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    const statusFilter = screen.getByDisplayValue('All Statuses');
    fireEvent.change(statusFilter, { target: { value: 'active' } });
    
    expect(statusFilter).toHaveValue('active');
  });

  it('handles metric selection', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    const metricSelect = screen.getByDisplayValue('Latency');
    fireEvent.change(metricSelect, { target: { value: 'memory_usage' } });
    
    expect(metricSelect).toHaveValue('memory_usage');
  });

  it('handles search functionality', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    const searchInput = screen.getByPlaceholderText('Search anomalies...');
    fireEvent.change(searchInput, { target: { value: 'latency' } });
    
    expect(searchInput).toHaveValue('latency');
  });

  it('displays metric chart with data', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    expect(screen.getByText('LATENCY Trends')).toBeInTheDocument();
    expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
  });

  it('displays anomaly timeline chart', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    expect(screen.getByText('Anomaly Timeline')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('displays anomaly list correctly', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    expect(screen.getByText('High Latency Detected')).toBeInTheDocument();
    expect(screen.getByText('Memory Usage Spike')).toBeInTheDocument();
    expect(screen.getByText('Slightly Elevated Error Rate')).toBeInTheDocument();
  });

  it('handles anomaly selection', async () => {
    render(<AnomalyDetector {...mockProps} />);
    
    const anomalyCard = screen.getByText('High Latency Detected');
    fireEvent.click(anomalyCard);
    
    await waitFor(() => {
      expect(screen.getByText('Anomaly Details')).toBeInTheDocument();
      expect(screen.getByText('LATENCY')).toBeInTheDocument();
      expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    });
  });

  it('handles anomaly acknowledgment', async () => {
    render(<AnomalyDetector {...mockProps} />);
    
    const acknowledgeButton = screen.getByText('Acknowledge');
    fireEvent.click(acknowledgeButton);
    
    await waitFor(() => {
      expect(mockProps.onAnomalyAcknowledge).toHaveBeenCalledWith('anomaly-1');
    });
  });

  it('displays detection patterns', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    expect(screen.getByText('Detection Patterns')).toBeInTheDocument();
    expect(screen.getByText('Recurring latency spikes during peak hours')).toBeInTheDocument();
    expect(screen.getByText('89.0% confidence')).toBeInTheDocument();
    expect(screen.getByText('12 occurrences')).toBeInTheDocument();
  });

  it('displays system health metrics', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    expect(screen.getByText('System Health')).toBeInTheDocument();
    expect(screen.getByText('LATENCY')).toBeInTheDocument();
    expect(screen.getByText('ERROR RATE')).toBeInTheDocument();
    expect(screen.getByText('MEMORY USAGE')).toBeInTheDocument();
  });

  it('handles rule toggle in modal', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    // Open modal
    const rulesButton = screen.getByText('Detection Rules');
    fireEvent.click(rulesButton);
    
    // Toggle rule
    const toggleButton = screen.getByText('Enabled');
    fireEvent.click(toggleButton);
    
    expect(mockProps.onRuleToggle).toHaveBeenCalledWith('rule-1', false);
  });

  it('displays anomaly scores correctly', async () => {
    render(<AnomalyDetector {...mockProps} />);
    
    // Select an anomaly
    const anomalyCard = screen.getByText('High Latency Detected');
    fireEvent.click(anomalyCard);
    
    await waitFor(() => {
      expect(screen.getByText('Score')).toBeInTheDocument();
      // Critical (4) * confidence (0.92) = 3.68
      expect(screen.getByText('3.68')).toBeInTheDocument();
    });
  });

  it('formats timestamps correctly', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    expect(screen.getByText(/10:15/)).toBeInTheDocument();
    expect(screen.getByText(/09:45/)).toBeInTheDocument();
    expect(screen.getByText(/09:30/)).toBeInTheDocument();
  });

  it('displays affected components correctly', async () => {
    render(<AnomalyDetector {...mockProps} />);
    
    // Select anomaly with affected components
    const anomalyCard = screen.getByText('High Latency Detected');
    fireEvent.click(anomalyCard);
    
    await waitFor(() => {
      expect(screen.getByText('Affected Components')).toBeInTheDocument();
      expect(screen.getByText('user-service')).toBeInTheDocument();
      expect(screen.getByText('database')).toBeInTheDocument();
    });
  });

  it('calculates deviation percentage correctly', async () => {
    render(<AnomalyDetector {...mockProps} />);
    
    // Select anomaly
    const anomalyCard = screen.getByText('High Latency Detected');
    fireEvent.click(anomalyCard);
    
    await waitFor(() => {
      // Deviation = |(245 - 85) / 85| * 100 = 188.2%
      expect(screen.getByText('188.2%')).toBeInTheDocument();
    });
  });

  it('handles time range selection', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    const timeRangeSelect = screen.getByDisplayValue('Last Hour');
    fireEvent.change(timeRangeSelect, { target: { value: '24h' } });
    
    expect(timeRangeSelect).toHaveValue('24h');
  });

  it('displays no anomalies message when list is empty', () => {
    const propsWithoutAnomalies = {
      ...mockProps,
      anomalies: []
    };
    
    render(<AnomalyDetector {...propsWithoutAnomalies} />);
    
    expect(screen.getByText('Total Anomalies')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('is accessible with proper ARIA labels', () => {
    render(<AnomalyDetector {...mockProps} />);
    
    expect(screen.getByRole('heading', { name: 'Anomaly Detection & Alerting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause Detection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detection Rules' })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument(); // Search input
  });
});