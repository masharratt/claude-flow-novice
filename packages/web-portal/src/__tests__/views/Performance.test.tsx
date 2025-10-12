/**
 * Performance View Unit Tests
 *
 * Tests metric cards, charts rendering, time range selector, CSV export,
 * and real-time metric updates
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../utils/test-utils';
import { server, addHandler } from '../mocks/api';
import { App } from '../../client/App';
import {
  mockPerformanceData,
  mockPerformanceHistory,
  mockHistoricalData1h,
  mockMetricCards,
  mockWebSocketMetricsUpdate,
  mockChartData,
} from '../fixtures/performance-fixtures';

describe('Performance View', () => {
  beforeEach(() => {
    localStorage.clear();
    addHandler(
      http.get('/api/performance/metrics', () => {
        return HttpResponse.json({
          success: true,
          data: mockPerformanceData,
        });
      }),
      http.get('/api/metrics/history', ({ request }) => {
        const url = new URL(request.url);
        const range = url.searchParams.get('range') || '1h';
        return HttpResponse.json({
          success: true,
          data: mockPerformanceHistory[range as keyof typeof mockPerformanceHistory] || mockHistoricalData1h,
        });
      })
    );
  });

  describe('Metric Cards Rendering', () => {
    it('should render all 4 metric cards', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/System CPU/i)).toBeInTheDocument();
      expect(screen.getByText(/Memory Usage/i)).toBeInTheDocument();
      expect(screen.getByText(/Active Agents/i)).toBeInTheDocument();
      expect(screen.getByText(/Events\/sec/i)).toBeInTheDocument();
    });

    it('should display CPU metric with percentage', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/45\.2%/)).toBeInTheDocument();
      });
    });

    it('should display memory metric with GB conversion', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/4\.0 GB|4\.0GB/)).toBeInTheDocument();
      });
    });

    it('should display active agents count', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/120/)).toBeInTheDocument();
      });
    });

    it('should display events per second', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/1250|1,250/)).toBeInTheDocument();
      });
    });

    it('should show trend indicators (arrows)', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const trendArrows = screen.getAllByTestId(/trend-arrow|trend-icon/i);
      expect(trendArrows.length).toBeGreaterThanOrEqual(4);
    });

    it('should color-code trends (positive/negative)', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const upTrend = screen.getByTestId('metric-card-memory');
      expect(upTrend).toHaveClass(/warning|up/);

      const downTrend = screen.getByTestId('metric-card-cpu');
      expect(downTrend).toHaveClass(/success|down/);
    });

    it('should show trend labels (vs last period)', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/vs last.*hour|period/i)).toBeInTheDocument();
      });
    });
  });

  describe('Charts Rendering', () => {
    it('should render CPU usage chart', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/CPU Usage/i)).toBeInTheDocument();
      });

      const cpuChart = screen.getByTestId('cpu-chart');
      expect(cpuChart).toBeInTheDocument();
    });

    it('should render memory usage chart', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/Memory Usage/i)).toBeInTheDocument();
      });

      const memoryChart = screen.getByTestId('memory-chart');
      expect(memoryChart).toBeInTheDocument();
    });

    it('should render agents status chart (bar/pie)', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/Agent Status|Agents by Status/i)).toBeInTheDocument();
      });

      const agentsChart = screen.getByTestId('agents-chart');
      expect(agentsChart).toBeInTheDocument();
    });

    it('should render events per second chart', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/Events.*Second|Events\/sec/i)).toBeInTheDocument();
      });

      const eventsChart = screen.getByTestId('events-chart');
      expect(eventsChart).toBeInTheDocument();
    });

    it('should display chart legends', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const legends = screen.getAllByTestId(/chart-legend/i);
      expect(legends.length).toBeGreaterThan(0);
    });

    it('should render charts with proper axes labels', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/Time/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Percentage|%/)).toBeInTheDocument();
      expect(screen.getByText(/MB|Memory/)).toBeInTheDocument();
    });

    it('should show tooltips on chart hover', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const cpuChart = screen.getByTestId('cpu-chart');
      const dataPoint = within(cpuChart).getAllByRole('img')[0]; // Chart.js canvas

      await user.hover(dataPoint);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });
  });

  describe('Time Range Selector', () => {
    it('should default to 1 hour time range', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        const timeRangeSelect = screen.getByLabelText(/time range/i);
        expect(timeRangeSelect).toHaveValue('1h');
      });
    });

    it('should change to 6 hours time range', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const timeRangeSelect = screen.getByLabelText(/time range/i);
      await user.click(timeRangeSelect);

      const sixHoursOption = screen.getByRole('option', { name: /6.*hour/i });
      await user.click(sixHoursOption);

      await waitFor(() => {
        expect(timeRangeSelect).toHaveValue('6h');
      });
    });

    it('should change to 24 hours time range', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const timeRangeSelect = screen.getByLabelText(/time range/i);
      await user.click(timeRangeSelect);

      const twentyFourHoursOption = screen.getByRole('option', { name: /24.*hour/i });
      await user.click(twentyFourHoursOption);

      await waitFor(() => {
        expect(timeRangeSelect).toHaveValue('24h');
      });
    });

    it('should change to 7 days time range', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const timeRangeSelect = screen.getByLabelText(/time range/i);
      await user.click(timeRangeSelect);

      const sevenDaysOption = screen.getByRole('option', { name: /7.*day/i });
      await user.click(sevenDaysOption);

      await waitFor(() => {
        expect(timeRangeSelect).toHaveValue('7d');
      });
    });

    it('should change to 30 days time range', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const timeRangeSelect = screen.getByLabelText(/time range/i);
      await user.click(timeRangeSelect);

      const thirtyDaysOption = screen.getByRole('option', { name: /30.*day/i });
      await user.click(thirtyDaysOption);

      await waitFor(() => {
        expect(timeRangeSelect).toHaveValue('30d');
      });
    });

    it('should reload chart data when time range changes', async () => {
      const user = userEvent.setup();
      let requestCount = 0;

      addHandler(
        http.get('/api/metrics/history', () => {
          requestCount++;
          return HttpResponse.json({
            success: true,
            data: mockHistoricalData1h,
          });
        })
      );

      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(requestCount).toBe(1);
      });

      const timeRangeSelect = screen.getByLabelText(/time range/i);
      await user.click(timeRangeSelect);

      const sixHoursOption = screen.getByRole('option', { name: /6.*hour/i });
      await user.click(sixHoursOption);

      await waitFor(() => {
        expect(requestCount).toBe(2);
      });
    });

    it('should persist selected time range', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const timeRangeSelect = screen.getByLabelText(/time range/i);
      await user.click(timeRangeSelect);

      const twentyFourHoursOption = screen.getByRole('option', { name: /24.*hour/i });
      await user.click(twentyFourHoursOption);

      expect(localStorage.getItem('performance-time-range')).toBe('24h');
    });
  });

  describe('CSV Export', () => {
    it('should export metrics as CSV', async () => {
      const user = userEvent.setup();
      const downloadSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export|download/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(downloadSpy).toHaveBeenCalled();
      });

      downloadSpy.mockRestore();
    });

    it('should include all metrics in CSV export', async () => {
      const user = userEvent.setup();
      let csvContent = '';

      const createObjectURL = vi.fn((blob: Blob) => {
        blob.text().then((text) => {
          csvContent = text;
        });
        return 'blob:mock';
      });
      global.URL.createObjectURL = createObjectURL;

      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(csvContent).toContain('Timestamp,CPU (%),Memory (MB),Active Agents,Events/sec');
      });
    });

    it('should include timestamp in CSV filename', async () => {
      const user = userEvent.setup();
      let filename = '';

      const downloadSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        filename = this.download;
      });

      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(filename).toMatch(/performance-metrics-.*\.csv/);
      });

      downloadSpy.mockRestore();
    });

    it('should show export success notification', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText(/exported successfully/i)).toBeInTheDocument();
      });
    });
  });

  describe('Real-Time Metric Updates', () => {
    it('should update CPU metric via WebSocket', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/45\.2%/)).toBeInTheDocument();
      });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify(mockWebSocketMetricsUpdate),
        })
      );

      await waitFor(() => {
        expect(screen.getByText(/46\.8%/)).toBeInTheDocument();
      });
    });

    it('should update memory metric via WebSocket', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/4\.0 GB/)).toBeInTheDocument();
      });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify(mockWebSocketMetricsUpdate),
        })
      );

      await waitFor(() => {
        expect(screen.getByText(/4\.1 GB|4\.15 GB/)).toBeInTheDocument();
      });
    });

    it('should update agents count via WebSocket', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/120/)).toBeInTheDocument();
      });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify(mockWebSocketMetricsUpdate),
        })
      );

      await waitFor(() => {
        expect(screen.getByText(/122/)).toBeInTheDocument();
      });
    });

    it('should update events/sec via WebSocket', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/1250|1,250/)).toBeInTheDocument();
      });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify(mockWebSocketMetricsUpdate),
        })
      );

      await waitFor(() => {
        expect(screen.getByText(/1275|1,275/)).toBeInTheDocument();
      });
    });

    it('should update charts with new data points', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByTestId('cpu-chart')).toBeInTheDocument();
      });

      const initialDataPoints = screen.getByTestId('cpu-chart').querySelectorAll('.chart-point').length;

      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify(mockWebSocketMetricsUpdate),
        })
      );

      await waitFor(() => {
        const updatedDataPoints = screen.getByTestId('cpu-chart').querySelectorAll('.chart-point').length;
        expect(updatedDataPoints).toBeGreaterThan(initialDataPoints);
      });
    });

    it('should limit chart data points (sliding window)', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByTestId('cpu-chart')).toBeInTheDocument();
      });

      // Send 100 updates
      for (let i = 0; i < 100; i++) {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: JSON.stringify(mockWebSocketMetricsUpdate),
          })
        );
      }

      await waitFor(() => {
        const dataPoints = screen.getByTestId('cpu-chart').querySelectorAll('.chart-point').length;
        expect(dataPoints).toBeLessThanOrEqual(200); // Max 200 points
      });
    });

    it('should handle WebSocket connection errors', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });

      window.dispatchEvent(new Event('close'));

      await waitFor(() => {
        expect(screen.getByText(/disconnected|connection lost/i)).toBeInTheDocument();
      });
    });
  });

  describe('Auto-Refresh', () => {
    it('should auto-refresh metrics every 5 seconds', async () => {
      vi.useFakeTimers();
      let requestCount = 0;

      addHandler(
        http.get('/api/performance/metrics', () => {
          requestCount++;
          return HttpResponse.json({
            success: true,
            data: mockPerformanceData,
          });
        })
      );

      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(requestCount).toBe(1);
      });

      vi.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(requestCount).toBe(2);
      });

      vi.useRealTimers();
    });

    it('should pause auto-refresh', async () => {
      vi.useFakeTimers();
      const user = userEvent.setup();
      let requestCount = 0;

      addHandler(
        http.get('/api/performance/metrics', () => {
          requestCount++;
          return HttpResponse.json({
            success: true,
            data: mockPerformanceData,
          });
        })
      );

      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(requestCount).toBe(1);
      });

      const pauseButton = screen.getByLabelText(/pause|stop auto-refresh/i);
      await user.click(pauseButton);

      vi.advanceTimersByTime(10000);

      expect(requestCount).toBe(1); // Should not increase

      vi.useRealTimers();
    });

    it('should resume auto-refresh', async () => {
      vi.useFakeTimers();
      const user = userEvent.setup();
      let requestCount = 0;

      addHandler(
        http.get('/api/performance/metrics', () => {
          requestCount++;
          return HttpResponse.json({
            success: true,
            data: mockPerformanceData,
          });
        })
      );

      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(requestCount).toBe(1);
      });

      const pauseButton = screen.getByLabelText(/pause/i);
      await user.click(pauseButton);

      const resumeButton = screen.getByLabelText(/resume|play/i);
      await user.click(resumeButton);

      vi.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(requestCount).toBe(2);
      });

      vi.useRealTimers();
    });
  });
});
