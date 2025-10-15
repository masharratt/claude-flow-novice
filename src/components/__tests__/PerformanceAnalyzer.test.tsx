import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PerformanceAnalyzer from '../PerformanceAnalyzer';

// Mock Recharts components
jest.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  RadarChart: ({ children }: any) => <div data-testid="radar-chart">{children}</div>,
  Radar: () => <div data-testid="radar" />,
  PolarGrid: () => <div data-testid="polar-grid" />,
  PolarAngleAxis: () => <div data-testid="polar-angle-axis" />,
  PolarRadiusAxis: () => <div data-testid="polar-radius-axis" />,
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
  TrendingUp: () => <div data-testid="trending-up" />,
  TrendingDown: () => <div data-testid="trending-down" />,
  Activity: () => <div data-testid="activity" />,
  Clock: () => <div data-testid="clock" />,
  Zap: () => <div data-testid="zap" />,
  Database: () => <div data-testid="database" />,
  Cpu: () => <div data-testid="cpu" />,
  MemoryStick: () => <div data-testid="memory-stick" />,
  HardDrive: () => <div data-testid="hard-drive" />,
  Network: () => <div data-testid="network" />,
  BarChart3: () => <div data-testid="bar-chart-3" />,
  Calendar: () => <div data-testid="calendar" />,
  Filter: () => <div data-testid="filter" />,
  Download: () => <div data-testid="download" />,
  RefreshCw: () => <div data-testid="refresh-cw" />,
  AlertTriangle: () => <div data-testid="alert-triangle" />,
  CheckCircle: () => <div data-testid="check-circle" />
}));

const mockProps = {
  metrics: [
    {
      timestamp: '2024-01-15T10:00:00Z',
      metric: 'latency',
      value: 45,
      unit: 'ms',
      threshold: 100,
      baseline: 50
    },
    {
      timestamp: '2024-01-15T10:05:00Z',
      metric: 'latency',
      value: 52,
      unit: 'ms',
      threshold: 100,
      baseline: 50
    },
    {
      timestamp: '2024-01-15T10:00:00Z',
      metric: 'throughput',
      value: 1200,
      unit: 'req/s',
      threshold: 1000,
      baseline: 1100
    },
    {
      timestamp: '2024-01-15T10:00:00Z',
      metric: 'error_rate',
      value: 0.8,
      unit: '%',
      threshold: 2.0,
      baseline: 1.0
    }
  ],
  trends: [
    {
      metric: 'latency',
      period: '24h',
      currentValue: 48.5,
      previousValue: 45.2,
      changePercent: 7.3,
      trend: 'degrading' as const,
      prediction: 52.1,
      confidence: 0.87
    },
    {
      metric: 'throughput',
      period: '24h',
      currentValue: 1250,
      previousValue: 1180,
      changePercent: 5.9,
      trend: 'improving' as const,
      prediction: 1300,
      confidence: 0.92
    },
    {
      metric: 'error_rate',
      period: '24h',
      currentValue: 0.9,
      previousValue: 1.2,
      changePercent: -25.0,
      trend: 'improving' as const,
      prediction: 0.8,
      confidence: 0.78
    }
  ],
  resourceUsage: [
    {
      timestamp: '2024-01-15T10:00:00Z',
      cpu: 65,
      memory: 72,
      disk: 45,
      network: 38,
      connections: 850
    },
    {
      timestamp: '2024-01-15T10:05:00Z',
      cpu: 70,
      memory: 75,
      disk: 46,
      network: 42,
      connections: 920
    }
  ],
  bottlenecks: [
    {
      id: 'bottleneck-1',
      type: 'cpu' as const,
      severity: 'high' as const,
      description: 'CPU usage consistently above 70%',
      impact: 'Increased response times and reduced throughput',
      recommendation: 'Consider scaling horizontally or optimizing CPU-intensive operations',
      timestamp: '2024-01-15T10:00:00Z',
      value: 75,
      threshold: 70
    },
    {
      id: 'bottleneck-2',
      type: 'memory' as const,
      severity: 'medium' as const,
      description: 'Memory usage approaching 80% threshold',
      impact: 'Potential for memory leaks and reduced performance',
      recommendation: 'Monitor for memory leaks and consider increasing memory allocation',
      timestamp: '2024-01-15T09:45:00Z',
      value: 78,
      threshold: 80
    }
  ],
  benchmarks: [
    {
      metric: 'latency',
      current: 48.5,
      baseline: 50,
      target: 30,
      best: 15,
      percentile: 75
    },
    {
      metric: 'throughput',
      current: 1250,
      baseline: 1100,
      target: 1500,
      best: 2000,
      percentile: 60
    },
    {
      metric: 'error_rate',
      current: 0.9,
      baseline: 1.0,
      target: 0.5,
      best: 0.1,
      percentile: 85
    }
  ],
  onExportData: jest.fn(),
  onRefreshData: jest.fn()
};

describe('PerformanceAnalyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders component header correctly', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('Historical Performance Analysis')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart-3')).toBeInTheDocument();
  });

  it('displays performance score card', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('Performance Score')).toBeInTheDocument();
    expect(screen.getByText('Grade')).toBeInTheDocument();
  });

  it('displays metric summary cards', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('Avg Latency')).toBeInTheDocument();
    expect(screen.getByText('Throughput')).toBeInTheDocument();
    expect(screen.getByText('Error Rate')).toBeInTheDocument();
  });

  it('toggles auto-refresh', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    const autoRefreshButton = screen.getByText('Auto-refresh');
    fireEvent.click(autoRefreshButton);
    
    expect(screen.getByText('Resume')).toBeInTheDocument();
  });

  it('toggles comparison mode', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    const compareButton = screen.getByText('Compare');
    fireEvent.click(compareButton);
    
    expect(screen.getByText('Historical Comparison')).toBeInTheDocument();
  });

  it('handles export functionality', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    const exportButton = screen.getByText('Export');
    fireEvent.click(exportButton);
    
    expect(mockProps.onExportData).toHaveBeenCalled();
  });

  it('handles refresh functionality', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    const refreshButton = screen.getByText('Refresh Data');
    fireEvent.click(refreshButton);
    
    expect(mockProps.onRefreshData).toHaveBeenCalled();
  });

  it('handles time range selection', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    const timeRangeSelect = screen.getByDisplayValue('Last 24 Hours');
    fireEvent.change(timeRangeSelect, { target: { value: '7d' } });
    
    expect(timeRangeSelect).toHaveValue('7d');
  });

  it('handles metric selection', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    const metricSelect = screen.getByDisplayValue('LATENCY');
    fireEvent.change(metricSelect, { target: { value: 'throughput' } });
    
    expect(metricSelect).toHaveValue('throughput');
  });

  it('displays metric trend chart', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('LATENCY Trend')).toBeInTheDocument();
    expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
  });

  it('displays resource usage chart', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('Resource Usage')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('displays resource overview radar chart', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('Resource Overview')).toBeInTheDocument();
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
  });

  it('displays trend analysis', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('Trend Analysis')).toBeInTheDocument();
    expect(screen.getByText('LATENCY')).toBeInTheDocument();
    expect(screen.getByText('THROUGHPUT')).toBeInTheDocument();
    expect(screen.getByText('ERROR RATE')).toBeInTheDocument();
  });

  it('shows trend indicators correctly', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    // Should show trend icons for each metric
    expect(screen.getByTestId('trending-down')).toBeInTheDocument(); // latency degrading
    expect(screen.getByTestId('trending-up')).toBeInTheDocument(); // throughput improving
  });

  it('displays performance benchmarks', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('Performance Benchmarks')).toBeInTheDocument();
    expect(screen.getByText('LATENCY')).toBeInTheDocument();
    expect(screen.getByText('THROUGHPUT')).toBeInTheDocument();
    expect(screen.getByText('ERROR RATE')).toBeInTheDocument();
  });

  it('shows benchmark progress bars', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    // Progress bars should be rendered for each benchmark
    const progressBars = document.querySelectorAll('.bg-gray-200');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('displays identified bottlenecks', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('Identified Bottlenecks')).toBeInTheDocument();
    expect(screen.getByText('CPU usage consistently above 70%')).toBeInTheDocument();
    expect(screen.getByText('Memory usage approaching 80% threshold')).toBeInTheDocument();
  });

  it('shows bottleneck severity badges', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
  });

  it('displays bottleneck recommendations', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('Recommendation:')).toBeInTheDocument();
    expect(screen.getByText(/Consider scaling horizontally/)).toBeInTheDocument();
  });

  it('shows historical comparison when enabled', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    const compareButton = screen.getByText('Compare');
    fireEvent.click(compareButton);
    
    expect(screen.getByText('Current Period')).toBeInTheDocument();
    expect(screen.getByText('Previous Period')).toBeInTheDocument();
    expect(screen.getByText('Change')).toBeInTheDocument();
  });

  it('calculates performance score correctly', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    // Score should be a number between 0-100
    const scoreElement = screen.getByText(/^\d+$/); // Score digits only
    expect(scoreElement).toBeInTheDocument();
    const score = parseInt(scoreElement.textContent!);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('displays trend change percentages', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('+7.3%')).toBeInTheDocument(); // latency change
    expect(screen.getByText('+5.9%')).toBeInTheDocument(); // throughput change
    expect(screen.getByText('-25.0%')).toBeInTheDocument(); // error rate change
  });

  it('shows prediction values', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('Pred: 52.1')).toBeInTheDocument(); // latency prediction
    expect(screen.getByText('Pred: 1300')).toBeInTheDocument(); // throughput prediction
    expect(screen.getByText('Pred: 0.8')).toBeInTheDocument(); // error rate prediction
  });

  it('handles metric filtering', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    const metricSelect = screen.getByDisplayValue('LATENCY');
    fireEvent.change(metricSelect, { target: { value: 'error_rate' } });
    
    expect(screen.getByText('ERROR_RATE Trend')).toBeInTheDocument();
  });

  it('displays resource usage values', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    // Should show current resource usage values
    expect(screen.getByText('65')).toBeInTheDocument(); // CPU
    expect(screen.getByText('72')).toBeInTheDocument(); // Memory
    expect(screen.getByText('45')).toBeInTheDocument(); // Disk
    expect(screen.getByText('38')).toBeInTheDocument(); // Network
  });

  it('shows benchmark percentiles', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('75th percentile')).toBeInTheDocument();
    expect(screen.getByText('60th percentile')).toBeInTheDocument();
    expect(screen.getByText('85th percentile')).toBeInTheDocument();
  });

  it('displays target values', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('Target: <50ms')).toBeInTheDocument();
    expect(screen.getByText('Target: <1%')).toBeInTheDocument();
  });

  it('handles empty data gracefully', () => {
    const emptyProps = {
      ...mockProps,
      metrics: [],
      trends: [],
      resourceUsage: [],
      bottlenecks: [],
      benchmarks: []
    };
    
    render(<PerformanceAnalyzer {...emptyProps} />);
    
    expect(screen.getByText('Historical Performance Analysis')).toBeInTheDocument();
  });

  it('formats metric names correctly', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('LATENCY')).toBeInTheDocument();
    expect(screen.getByText('THROUGHPUT')).toBeInTheDocument();
    expect(screen.getByText('ERROR RATE')).toBeInTheDocument();
  });

  it('displays metric units', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByText('ms')).toBeInTheDocument();
    expect(screen.getByText('req/s')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('is accessible with proper ARIA labels', () => {
    render(<PerformanceAnalyzer {...mockProps} />);
    
    expect(screen.getByRole('heading', { name: 'Historical Performance Analysis' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Auto-refresh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument(); // Select inputs
  });
});