/**
 * MemoryChart Component
 * Line chart with area fill showing memory usage (used vs total)
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
  Filler,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { SystemMetrics } from '../../../../shared/stores/metricsStore';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Title, Tooltip, Legend);

interface MemoryChartProps {
  data: SystemMetrics[];
}

/**
 * MemoryChart Component
 * Displays memory usage trends with area fill for visual comparison
 */
export const MemoryChart: React.FC<MemoryChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    // Estimate total memory as 1.5x max used memory (simplified)
    const maxUsed = data.length > 0 ? Math.max(...data.map((d) => d.memory)) : 0;
    const estimatedTotal = Math.max(maxUsed * 1.5, 16384); // At least 16GB

    return {
      labels: data.map((d) => new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      datasets: [
        {
          label: 'Used MB',
          data: data.map((d) => d.memory),
          borderColor: 'rgb(53, 162, 235)',
          backgroundColor: 'rgba(53, 162, 235, 0.5)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: 'Total MB',
          data: data.map(() => estimatedTotal),
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          fill: false,
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
            if (value >= 1024) {
              return `${label}: ${(value / 1024).toFixed(2)} GB`;
            }
            return `${label}: ${value.toFixed(0)} MB`;
          },
        },
      },
    },
    scales: {
      y: {
        type: 'linear',
        display: true,
        title: {
          display: true,
          text: 'Memory (MB)',
        },
        min: 0,
        ticks: {
          callback: (value) => {
            const numValue = typeof value === 'number' ? value : 0;
            if (numValue >= 1024) {
              return `${(numValue / 1024).toFixed(1)} GB`;
            }
            return `${numValue} MB`;
          },
        },
      },
    },
  };

  return (
    <Box height={240} data-testid="memory-chart">
      <Line data={chartData} options={options} />
    </Box>
  );
};

export default MemoryChart;
