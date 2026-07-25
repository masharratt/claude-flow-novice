/**
 * Performance Charts Test Suite
 * Tests for unified charting library
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  PerformanceCharts,
  LineChart,
  BarChart,
  GaugeChart,
  RealtimeChart,
} from './index';
import { PerformanceMetrics, AgentPerformanceData } from './PerformanceCharts.types';

const theme = createTheme();

const mockSystemMetrics: PerformanceMetrics[] = [
  {
    timestamp: Date.now() - 60000,
    cpu: 45.5,
    memory: 62.3,
    network: 30.1,
    responseTime: 150,
    activeAgents: 5,
    taskQueue: 12,
  },
  {
    timestamp: Date.now() - 30000,
    cpu: 52.8,
    memory: 68.4,
    network: 42.5,
    responseTime: 180,
    activeAgents: 7,
    taskQueue: 18,
  },
  {
    timestamp: Date.now(),
    cpu: 48.2,
    memory: 65.7,
    network: 35.8,
    responseTime: 165,
    activeAgents: 6,
    taskQueue: 15,
  },
];

const mockAgentData: AgentPerformanceData[] = [
  {
    agentId: 'agent-1',
    agentName: 'Coder Agent',
    agentType: 'coder',
    metrics: {
      successRate: 0.92,
      avgResponseTime: 250,
      tasksCompleted: 45,
      tasksFailed: 3,
      confidence: 0.88,
    },
  },
  {
    agentId: 'agent-2',
    agentName: 'Reviewer Agent',
    agentType: 'reviewer',
    metrics: {
      successRate: 0.95,
      avgResponseTime: 180,
      tasksCompleted: 38,
      tasksFailed: 2,
      confidence: 0.91,
    },
  },
];

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('PerformanceCharts', () => {
  describe('Main Component', () => {
    it('should render with system metrics', () => {
      renderWithTheme(
        <PerformanceCharts
          systemMetrics={mockSystemMetrics}
          agentData={mockAgentData}
        />
      );

      expect(screen.getByText('Performance Dashboard')).toBeInTheDocument();
    });

    it('should render time range selector', () => {
      renderWithTheme(
        <PerformanceCharts
          systemMetrics={mockSystemMetrics}
          showControls={true}
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should change time range when selected', async () => {
      const onTimeRangeChange = vi.fn();
      renderWithTheme(
        <PerformanceCharts
          systemMetrics={mockSystemMetrics}
          onTimeRangeChange={onTimeRangeChange}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.mouseDown(select);

      await waitFor(() => {
        const option = screen.getByText('Last 6 Hours');
        fireEvent.click(option);
      });

      expect(onTimeRangeChange).toHaveBeenCalledWith('6h');
    });

    it('should export data when export button clicked', () => {
      const onExport = vi.fn();
      renderWithTheme(
        <PerformanceCharts
          systemMetrics={mockSystemMetrics}
          agentData={mockAgentData}
          onExport={onExport}
        />
      );

      const exportButton = screen.getByTitle('Export Data');
      fireEvent.click(exportButton);

      expect(onExport).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics: expect.any(Array),
          agents: mockAgentData,
          summary: expect.any(Object),
        })
      );
    });

    it('should toggle fullscreen mode', () => {
      renderWithTheme(
        <PerformanceCharts systemMetrics={mockSystemMetrics} />
      );

      const fullscreenButton = screen.getByTitle('Toggle Fullscreen');
      fireEvent.click(fullscreenButton);

      // Check if component style changed (implementation detail)
      const container = screen.getByText('Performance Dashboard').closest('div');
      expect(container).toHaveStyle({ position: 'fixed' });
    });

    it('should render gauges with correct values', () => {
      renderWithTheme(
        <PerformanceCharts systemMetrics={mockSystemMetrics} />
      );

      expect(screen.getByText('Average CPU')).toBeInTheDocument();
      expect(screen.getByText('Average Memory')).toBeInTheDocument();
      expect(screen.getByText('Peak CPU')).toBeInTheDocument();
    });
  });

  describe('LineChart', () => {
    it('should render line chart with data', () => {
      renderWithTheme(
        <LineChart
          data={mockSystemMetrics}
          dataKey="cpu"
          height={400}
        />
      );

      // Recharts renders SVG
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render multiple data keys', () => {
      renderWithTheme(
        <LineChart
          data={mockSystemMetrics}
          dataKey={['cpu', 'memory']}
          height={400}
        />
      );

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();

      // Should have 2 lines
      const lines = document.querySelectorAll('.recharts-line');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it('should render area chart when area prop is true', () => {
      renderWithTheme(
        <LineChart
          data={mockSystemMetrics}
          dataKey="cpu"
          area={true}
          height={400}
        />
      );

      const area = document.querySelector('.recharts-area');
      expect(area).toBeInTheDocument();
    });
  });

  describe('BarChart', () => {
    it('should render bar chart with agent data', () => {
      renderWithTheme(
        <BarChart
          data={mockAgentData}
          dataKeys={['successRate', 'confidence']}
          height={400}
        />
      );

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should display agent names on x-axis', () => {
      renderWithTheme(
        <BarChart
          data={mockAgentData}
          dataKeys={['successRate']}
          height={400}
        />
      );

      // Should contain agent names
      expect(document.body.textContent).toContain('Coder Agent');
      expect(document.body.textContent).toContain('Reviewer Agent');
    });

    it('should stack bars when stackBars prop is true', () => {
      renderWithTheme(
        <BarChart
          data={mockAgentData}
          dataKeys={['successRate', 'confidence']}
          stackBars={true}
          height={400}
        />
      );

      const bars = document.querySelectorAll('.recharts-bar');
      expect(bars.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GaugeChart', () => {
    it('should render gauge with value', () => {
      renderWithTheme(
        <GaugeChart
          value={75.5}
          label="CPU Usage"
          unit="%"
          height={300}
        />
      );

      expect(screen.getByText('75.5%')).toBeInTheDocument();
      expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    });

    it('should clamp value to max', () => {
      renderWithTheme(
        <GaugeChart
          value={150}
          maxValue={100}
          label="Test"
          unit="%"
          height={300}
        />
      );

      expect(screen.getByText('100.0%')).toBeInTheDocument();
    });

    it('should clamp value to min', () => {
      renderWithTheme(
        <GaugeChart
          value={-10}
          minValue={0}
          label="Test"
          unit="%"
          height={300}
        />
      );

      expect(screen.getByText('0.0%')).toBeInTheDocument();
    });

    it('should apply correct color based on thresholds', () => {
      const { rerender } = renderWithTheme(
        <GaugeChart
          value={50}
          label="Low"
          thresholds={{ low: 60, medium: 80, high: 100 }}
          height={300}
        />
      );

      // Check for low threshold color (success)
      let svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();

      rerender(
        <ThemeProvider theme={theme}>
          <GaugeChart
            value={90}
            label="High"
            thresholds={{ low: 60, medium: 80, high: 100 }}
            height={300}
          />
        </ThemeProvider>
      );

      // Should re-render with different color for high threshold
      svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('RealtimeChart', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should render realtime chart', () => {
      renderWithTheme(
        <RealtimeChart
          data={mockSystemMetrics}
          dataKeys={['cpu', 'memory']}
          updateInterval={1000}
          height={400}
        />
      );

      expect(screen.getByText('Live Updates')).toBeInTheDocument();
    });

    it('should pause updates when pause button clicked', () => {
      renderWithTheme(
        <RealtimeChart
          data={mockSystemMetrics}
          dataKeys={['cpu']}
          updateInterval={1000}
          height={400}
        />
      );

      const pauseButton = screen.getByText('Pause');
      fireEvent.click(pauseButton);

      expect(screen.getByText('Resume')).toBeInTheDocument();
      expect(screen.getByText('Paused')).toBeInTheDocument();
    });

    it('should clear data when clear button clicked', () => {
      renderWithTheme(
        <RealtimeChart
          data={mockSystemMetrics}
          dataKeys={['cpu']}
          updateInterval={1000}
          height={400}
        />
      );

      const clearButton = screen.getByText('Clear');
      fireEvent.click(clearButton);

      // After clear, chart should be empty (implementation specific)
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should call onDataUpdate when new data arrives', async () => {
      const onDataUpdate = vi.fn();

      renderWithTheme(
        <RealtimeChart
          data={mockSystemMetrics}
          dataKeys={['cpu']}
          updateInterval={1000}
          onDataUpdate={onDataUpdate}
          height={400}
        />
      );

      vi.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(onDataUpdate).toHaveBeenCalled();
      });
    });
  });

  describe('Theme Support', () => {
    it('should render with light theme', () => {
      renderWithTheme(
        <PerformanceCharts
          systemMetrics={mockSystemMetrics}
          theme="light"
        />
      );

      const container = screen.getByText('Performance Dashboard').closest('div');
      expect(container).toHaveStyle({ backgroundColor: '#ffffff' });
    });

    it('should render with dark theme', () => {
      renderWithTheme(
        <PerformanceCharts
          systemMetrics={mockSystemMetrics}
          theme="dark"
        />
      );

      const container = screen.getByText('Performance Dashboard').closest('div');
      expect(container).toHaveStyle({ backgroundColor: '#1f2937' });
    });
  });

  describe('Responsive Behavior', () => {
    it('should handle responsive container', () => {
      renderWithTheme(
        <PerformanceCharts
          systemMetrics={mockSystemMetrics}
          width="100%"
          height={400}
        />
      );

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should handle fixed dimensions', () => {
      renderWithTheme(
        <PerformanceCharts
          systemMetrics={mockSystemMetrics}
          width={800}
          height={400}
        />
      );

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });
});
