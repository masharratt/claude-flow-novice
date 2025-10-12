/**
 * CPUChart Component
 * Line chart with dual Y-axis showing CPU usage percentage and core count
 */

import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { SystemMetrics } from '../../../../shared/stores/metricsStore';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface CPUChartProps {
  data: SystemMetrics[];
}

/**
 * CPUChart Component
 * Displays CPU usage trends with dual Y-axis for usage percentage and core count
 */
export const CPUChart: React.FC<CPUChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    // Determine CPU core count (simplified - would normally come from system info)
    const estimatedCores = 8;

    return {
      labels: data.map((d) => new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      datasets: [
        {
          label: 'CPU Usage %',
          data: data.map((d) => d.cpu),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          yAxisID: 'y',
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: 'Cores',
          data: data.map(() => estimatedCores),
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          yAxisID: 'y1',
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderDash: [5, 5],
        },
      ],
    };
  }, [data]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (label === 'CPU Usage %') {
              return `${label}: ${value.toFixed(1)}%`;
            }
            return `${label}: ${value.toFixed(0)}`;
          },
        },
      },
    },
    scales: {
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'CPU Usage (%)',
        },
        min: 0,
        max: 100,
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: 'Cores',
        },
        grid: {
          drawOnChartArea: false,
        },
        min: 0,
      },
    },
  };

  return (
    <Box height={240} data-testid="cpu-chart">
      <Line data={chartData} options={options} />
    </Box>
  );
};

export default CPUChart;
