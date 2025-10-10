/**
 * Performance Chart Component
 * Real-time performance visualization using Chart.js
 */

import React, { useEffect, useRef, useState } from 'react';
import { FleetDashboardClient, FleetMetrics } from '../FleetDashboardClient';

export interface PerformanceChartProps {
  /** Dashboard client instance */
  client: FleetDashboardClient;
  /** Custom CSS class */
  className?: string;
  /** Chart height in pixels (default: 300) */
  height?: number;
  /** Time window in seconds (default: 60) */
  timeWindow?: number;
  /** Metrics to display */
  metrics?: Array<'cpu' | 'memory' | 'network'>;
}

/**
 * Performance Chart Widget
 * Displays real-time system metrics in a line chart
 */
export const PerformanceChart: React.FC<PerformanceChartProps> = ({
  client,
  className = '',
  height = 300,
  timeWindow = 60,
  metrics: selectedMetrics = ['cpu', 'memory']
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Lazy load Chart.js
    const loadChart = async () => {
      try {
        const Chart = (await import('chart.js/auto')).default;

        if (!canvasRef.current) return;

        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        // Initialize chart
        chartRef.current = new Chart(ctx, {
          type: 'line',
          data: {
            labels: [],
            datasets: createDatasets(selectedMetrics)
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 750
            },
            interaction: {
              intersect: false,
              mode: 'index'
            },
            scales: {
              x: {
                type: 'time',
                time: {
                  unit: 'second',
                  displayFormats: {
                    second: 'HH:mm:ss'
                  }
                },
                grid: {
                  color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                  color: '#aaa'
                }
              },
              y: {
                beginAtZero: true,
                max: 100,
                grid: {
                  color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                  color: '#aaa',
                  callback: (value: any) => `${value}%`
                }
              }
            },
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  color: '#fff',
                  usePointStyle: true
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleColor: '#fff',
                bodyColor: '#fff'
              }
            }
          }
        });

        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load Chart.js:', error);
      }
    };

    loadChart();

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [selectedMetrics]);

  useEffect(() => {
    const handleMetrics = (data: FleetMetrics) => {
      if (!chartRef.current) return;

      const chart = chartRef.current;
      const now = new Date();

      // Add new data point
      chart.data.labels.push(now);

      // Update datasets
      const datasets = chart.data.datasets;
      if (selectedMetrics.includes('cpu')) {
        const cpuDataset = datasets.find((d: any) => d.label.includes('CPU'));
        if (cpuDataset) {
          cpuDataset.data.push(data.system.cpu.usage);
        }
      }

      if (selectedMetrics.includes('memory')) {
        const memoryDataset = datasets.find((d: any) => d.label.includes('Memory'));
        if (memoryDataset) {
          memoryDataset.data.push(data.system.memory.percent);
        }
      }

      if (selectedMetrics.includes('network') && data.network) {
        const networkDataset = datasets.find((d: any) => d.label.includes('Network'));
        if (networkDataset) {
          const networkIO = ((data.network.bytesIn + data.network.bytesOut) / 1024 / 1024); // MB/s
          networkDataset.data.push(Math.min(networkIO, 100));
        }
      }

      // Keep only data points within time window
      const maxPoints = timeWindow;
      if (chart.data.labels.length > maxPoints) {
        chart.data.labels.shift();
        datasets.forEach((dataset: any) => {
          dataset.data.shift();
        });
      }

      // Update chart without animation for smooth real-time updates
      chart.update('none');
    };

    client.on('metrics', handleMetrics);

    return () => {
      client.off('metrics', handleMetrics);
    };
  }, [client, timeWindow, selectedMetrics]);

  if (isLoading) {
    return (
      <div className={`performance-chart ${className}`}>
        <div className="loading">Loading chart...</div>
      </div>
    );
  }

  return (
    <div className={`performance-chart ${className}`} style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
};

/**
 * Create chart datasets based on selected metrics
 */
function createDatasets(metrics: Array<'cpu' | 'memory' | 'network'>) {
  const datasets = [];

  if (metrics.includes('cpu')) {
    datasets.push({
      label: 'CPU Usage (%)',
      data: [],
      borderColor: '#00ff88',
      backgroundColor: 'rgba(0, 255, 136, 0.1)',
      tension: 0.4,
      fill: false
    });
  }

  if (metrics.includes('memory')) {
    datasets.push({
      label: 'Memory Usage (%)',
      data: [],
      borderColor: '#00d4ff',
      backgroundColor: 'rgba(0, 212, 255, 0.1)',
      tension: 0.4,
      fill: true
    });
  }

  if (metrics.includes('network')) {
    datasets.push({
      label: 'Network I/O (MB/s)',
      data: [],
      borderColor: '#ffaa00',
      backgroundColor: 'rgba(255, 170, 0, 0.1)',
      tension: 0.4,
      fill: false
    });
  }

  return datasets;
}
