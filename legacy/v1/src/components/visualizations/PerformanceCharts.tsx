import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
  RadialLinearScale,
  TimeScale,
} from 'chart.js';
import { Line, Bar, Doughnut, Radar, Scatter } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
  RadialLinearScale,
  TimeScale,
);

export interface PerformanceMetrics {
  timestamp: number;
  cpu: number;
  memory: number;
  network: number;
  disk: number;
  responseTime: number;
  throughput: number;
  errorRate: number;
  activeAgents: number;
  taskQueue: number;
}

export interface AgentPerformanceData {
  agentId: string;
  agentName: string;
  agentType: string;
  metrics: {
    successRate: number;
    avgResponseTime: number;
    tasksCompleted: number;
    tasksFailed: number;
    confidence: number;
  };
  timeline: Array<{
    timestamp: number;
    status: 'active' | 'idle' | 'busy' | 'error';
    confidence: number;
  }>;
}

export interface PerformanceChartsProps {
  systemMetrics: PerformanceMetrics[];
  agentData: AgentPerformanceData[];
  width?: number;
  height?: number;
  realTimeUpdates?: boolean;
  updateInterval?: number;
  theme?: 'light' | 'dark';
  chartType?: 'line' | 'bar' | 'mixed';
  timeRange?: '1h' | '6h' | '24h' | '7d';
  showGrid?: boolean;
  animationsEnabled?: boolean;
}

export const PerformanceCharts: React.FC<PerformanceChartsProps> = ({
  systemMetrics,
  agentData,
  width = 1200,
  height = 800,
  realTimeUpdates = true,
  updateInterval = 5000,
  theme = 'light',
  chartType = 'mixed',
  timeRange = '1h',
  showGrid = true,
  animationsEnabled = true,
}) => {
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [selectedChart, setSelectedChart] = useState<'system' | 'agents' | 'comparison'>('system');
  const [filteredMetrics, setFilteredMetrics] = useState(systemMetrics);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const chartRef = useRef<any>(null);

  const themeColors = {
    light: {
      background: '#ffffff',
      text: '#1f2937',
      grid: '#e5e7eb',
      border: '#d1d5db',
      primary: '#3b82f6',
      secondary: '#10b981',
      tertiary: '#f59e0b',
      quaternary: '#ef4444',
      quinary: '#8b5cf6',
    },
    dark: {
      background: '#1f2937',
      text: '#f9fafb',
      grid: '#374151',
      border: '#4b5563',
      primary: '#60a5fa',
      secondary: '#34d399',
      tertiary: '#fbbf24',
      quaternary: '#f87171',
      quinary: '#a78bfa',
    },
  };

  const colors = themeColors[theme];

  // Filter data based on time range
  useEffect(() => {
    const now = Date.now();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };

    const cutoff = now - ranges[selectedTimeRange];
    setFilteredMetrics(systemMetrics.filter(m => m.timestamp >= cutoff));
  }, [systemMetrics, selectedTimeRange]);

  // System performance chart configuration
  const systemChartData = {
    labels: filteredMetrics.map(m => new Date(m.timestamp)),
    datasets: [
      {
        label: 'CPU Usage (%)',
        data: filteredMetrics.map(m => m.cpu),
        borderColor: colors.primary,
        backgroundColor: `${colors.primary}20`,
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
      {
        label: 'Memory Usage (%)',
        data: filteredMetrics.map(m => m.memory),
        borderColor: colors.secondary,
        backgroundColor: `${colors.secondary}20`,
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
      {
        label: 'Response Time (ms)',
        data: filteredMetrics.map(m => m.responseTime / 10), // Scale down for visibility
        borderColor: colors.tertiary,
        backgroundColor: `${colors.tertiary}20`,
        fill: false,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 4,
        yAxisID: 'y1',
      },
    ],
  };

  const systemChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: colors.text,
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            const unit = label.includes('%') ? '%' : label.includes('ms') ? 'ms' : '';
            return `${label}: ${value}${unit}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          displayFormats: {
            minute: 'HH:mm',
            hour: 'HH:mm',
            day: 'MMM dd',
          },
        },
        grid: {
          display: showGrid,
          color: colors.grid,
        },
        ticks: {
          color: colors.text,
        },
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        min: 0,
        max: 100,
        grid: {
          display: showGrid,
          color: colors.grid,
        },
        ticks: {
          color: colors.text,
          callback: (value: number) => `${value}%`,
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        min: 0,
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: colors.text,
          callback: (value: number) => `${value * 10}ms`,
        },
      },
    },
    animation: {
      duration: animationsEnabled ? 750 : 0,
    },
  };

  // Agent performance comparison chart
  const agentChartData = {
    labels: agentData.map(a => a.agentName),
    datasets: [
      {
        label: 'Success Rate (%)',
        data: agentData.map(a => a.metrics.successRate * 100),
        backgroundColor: colors.primary,
        borderColor: colors.primary,
        borderWidth: 1,
      },
      {
        label: 'Confidence (%)',
        data: agentData.map(a => a.metrics.confidence * 100),
        backgroundColor: colors.secondary,
        borderColor: colors.secondary,
        borderWidth: 1,
      },
      {
        label: 'Avg Response Time (ms)',
        data: agentData.map(a => a.metrics.avgResponseTime / 10), // Scale for visibility
        backgroundColor: colors.tertiary,
        borderColor: colors.tertiary,
        borderWidth: 1,
      },
    ],
  };

  const agentChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: colors.text,
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 12,
      },
    },
    scales: {
      x: {
        grid: {
          display: showGrid,
          color: colors.grid,
        },
        ticks: {
          color: colors.text,
        },
      },
      y: {
        min: 0,
        max: 100,
        grid: {
          display: showGrid,
          color: colors.grid,
        },
        ticks: {
          color: colors.text,
          callback: (value: number) => `${value}%`,
        },
      },
    },
    animation: {
      duration: animationsEnabled ? 750 : 0,
    },
  };

  // Task completion doughnut chart
  const taskCompletionData = {
    labels: ['Completed', 'Failed', 'In Progress'],
    datasets: [
      {
        data: [
          agentData.reduce((sum, a) => sum + a.metrics.tasksCompleted, 0),
          agentData.reduce((sum, a) => sum + a.metrics.tasksFailed, 0),
          agentData.reduce((sum, a) => sum + a.metrics.tasksCompleted + a.metrics.tasksFailed, 0) * 0.3, // Estimate in progress
        ],
        backgroundColor: [colors.secondary, colors.quaternary, colors.tertiary],
        borderColor: theme === 'dark' ? '#1f2937' : '#ffffff',
        borderWidth: 2,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: colors.text,
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percentage = ((context.parsed as number) / total * 100).toFixed(1);
            return `${context.label}: ${context.parsed} (${percentage}%)`;
          },
        },
      },
    },
    animation: {
      animateRotate: animationsEnabled,
      animateScale: animationsEnabled,
      duration: animationsEnabled ? 750 : 0,
    },
  };

  // Network scatter plot for agent relationships
  const networkData = {
    datasets: agentData.map((agent, index) => ({
      label: agent.agentName,
      data: [{
        x: agent.metrics.successRate * 100,
        y: agent.metrics.avgResponseTime,
      }],
      backgroundColor: Object.values(colors)[index % Object.values(colors).length],
      borderColor: Object.values(colors)[index % Object.values(colors).length],
      pointRadius: 8,
      pointHoverRadius: 10,
    })),
  };

  const scatterOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: colors.text,
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            return [
              `Success Rate: ${context.parsed.x}%`,
              `Response Time: ${context.parsed.y}ms`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear' as const,
        position: 'bottom' as const,
        min: 0,
        max: 100,
        title: {
          display: true,
          text: 'Success Rate (%)',
          color: colors.text,
        },
        grid: {
          display: showGrid,
          color: colors.grid,
        },
        ticks: {
          color: colors.text,
        },
      },
      y: {
        min: 0,
        title: {
          display: true,
          text: 'Response Time (ms)',
          color: colors.text,
        },
        grid: {
          display: showGrid,
          color: colors.grid,
        },
        ticks: {
          color: colors.text,
        },
      },
    },
    animation: {
      duration: animationsEnabled ? 750 : 0,
    },
  };

  // Handle real-time updates
  useEffect(() => {
    if (!realTimeUpdates) return;

    const interval = setInterval(() => {
      // Simulate real-time data updates
      const newMetric: PerformanceMetrics = {
        timestamp: Date.now(),
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
        network: Math.random() * 100,
        disk: Math.random() * 100,
        responseTime: Math.random() * 1000,
        throughput: Math.random() * 1000,
        errorRate: Math.random() * 5,
        activeAgents: Math.floor(Math.random() * 10) + 1,
        taskQueue: Math.floor(Math.random() * 50),
      };

      // This would normally be handled by props
      // systemMetrics.push(newMetric);
    }, updateInterval);

    return () => clearInterval(interval);
  }, [realTimeUpdates, updateInterval]);

  const handleExportChart = useCallback(() => {
    if (chartRef.current) {
      const link = document.createElement('a');
      link.download = `performance-chart-${Date.now()}.png`;
      link.href = chartRef.current.toBase64Image();
      link.click();
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  return (
    <div
      className={`performance-charts ${isFullscreen ? 'fullscreen' : ''}`}
      style={{
        width: isFullscreen ? '100vw' : width,
        height: isFullscreen ? '100vh' : height,
        background: colors.background,
        color: colors.text,
        padding: '20px',
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 9999 : 1,
      }}
    >
      {/* Header with controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: colors.text }}>Performance Dashboard</h2>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Time range selector */}
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value as any)}
            style={{
              padding: '8px 12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              background: colors.background,
              color: colors.text,
            }}
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>

          {/* Chart type selector */}
          <select
            value={selectedChart}
            onChange={(e) => setSelectedChart(e.target.value as any)}
            style={{
              padding: '8px 12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              background: colors.background,
              color: colors.text,
            }}
          >
            <option value="system">System Performance</option>
            <option value="agents">Agent Comparison</option>
            <option value="comparison">Task Overview</option>
          </select>

          {/* Action buttons */}
          <button
            onClick={handleExportChart}
            style={{
              padding: '8px 16px',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              background: colors.primary,
              color: '#ffffff',
              cursor: 'pointer',
            }}
          >
            Export
          </button>

          <button
            onClick={toggleFullscreen}
            style={{
              padding: '8px 16px',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              background: colors.secondary,
              color: '#ffffff',
              cursor: 'pointer',
            }}
          >
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>

      {/* Main chart area */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedChart === 'comparison' ? '1fr 1fr' : '1fr', gap: '20px', height: 'calc(100% - 80px)' }}>
        {selectedChart === 'system' && (
          <div style={{ background: theme === 'dark' ? '#374151' : '#f9fafb', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 20px 0', color: colors.text }}>System Performance Over Time</h3>
            <div style={{ height: 'calc(100% - 40px)' }}>
              <Line ref={chartRef} data={systemChartData} options={systemChartOptions} />
            </div>
          </div>
        )}

        {selectedChart === 'agents' && (
          <div style={{ background: theme === 'dark' ? '#374151' : '#f9fafb', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 20px 0', color: colors.text }}>Agent Performance Comparison</h3>
            <div style={{ height: 'calc(100% - 40px)' }}>
              <Bar ref={chartRef} data={agentChartData} options={agentChartOptions} />
            </div>
          </div>
        )}

        {selectedChart === 'comparison' && (
          <>
            <div style={{ background: theme === 'dark' ? '#374151' : '#f9fafb', borderRadius: '8px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 20px 0', color: colors.text }}>Task Completion Overview</h3>
              <div style={{ height: 'calc(100% - 40px)' }}>
                <Doughnut data={taskCompletionData} options={doughnutOptions} />
              </div>
            </div>

            <div style={{ background: theme === 'dark' ? '#374151' : '#f9fafb', borderRadius: '8px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 20px 0', color: colors.text }}>Agent Performance Network</h3>
              <div style={{ height: 'calc(100% - 40px)' }}>
                <Scatter data={networkData} options={scatterOptions} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Real-time status indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: theme === 'dark' ? '#374151' : '#f9fafb',
          borderRadius: '4px',
          border: `1px solid ${colors.border}`,
        }}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: realTimeUpdates ? colors.secondary : colors.tertiary,
            animation: realTimeUpdates ? 'pulse 2s infinite' : 'none',
          }}
        />
        <span style={{ fontSize: '12px', color: colors.text }}>
          {realTimeUpdates ? 'Live Updates' : 'Static Data'}
        </span>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};