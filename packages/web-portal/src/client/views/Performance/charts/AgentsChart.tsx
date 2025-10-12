/**
 * AgentsChart Component
 * Stacked bar chart showing agent status distribution over time
 */

import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Agent } from '../../../../shared/stores/agentStore';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface AgentsChartProps {
  agents: Agent[];
}

/**
 * AgentsChart Component
 * Displays agent status distribution as a stacked bar chart for trend analysis
 */
export const AgentsChart: React.FC<AgentsChartProps> = ({ agents }) => {
  const chartData = useMemo(() => {
    // Group agents by status
    const statusCounts = agents.reduce(
      (acc, agent) => {
        const status = agent.status;
        if (status === 'active') acc.active++;
        else if (status === 'idle') acc.idle++;
        else if (status === 'paused') acc.paused++;
        else if (status === 'failed') acc.failed++;
        else if (status === 'completed') acc.completed++;
        return acc;
      },
      { active: 0, idle: 0, paused: 0, completed: 0, failed: 0 }
    );

    return {
      labels: ['Current'],
      datasets: [
        {
          label: 'Active',
          data: [statusCounts.active],
          backgroundColor: 'rgba(75, 192, 192, 0.8)',
          borderColor: 'rgb(75, 192, 192)',
          borderWidth: 1,
        },
        {
          label: 'Idle',
          data: [statusCounts.idle],
          backgroundColor: 'rgba(201, 203, 207, 0.8)',
          borderColor: 'rgb(201, 203, 207)',
          borderWidth: 1,
        },
        {
          label: 'Paused',
          data: [statusCounts.paused],
          backgroundColor: 'rgba(255, 205, 86, 0.8)',
          borderColor: 'rgb(255, 205, 86)',
          borderWidth: 1,
        },
        {
          label: 'Completed',
          data: [statusCounts.completed],
          backgroundColor: 'rgba(54, 162, 235, 0.8)',
          borderColor: 'rgb(54, 162, 235)',
          borderWidth: 1,
        },
        {
          label: 'Failed',
          data: [statusCounts.failed],
          backgroundColor: 'rgba(255, 99, 132, 0.8)',
          borderColor: 'rgb(255, 99, 132)',
          borderWidth: 1,
        },
      ],
    };
  }, [agents]);

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
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
            return `${label}: ${value}`;
          },
          footer: (tooltipItems) => {
            const total = tooltipItems.reduce((sum, item) => sum + item.parsed.y, 0);
            return `Total: ${total}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        title: {
          display: true,
          text: 'Status Distribution',
        },
      },
      y: {
        stacked: true,
        title: {
          display: true,
          text: 'Agent Count',
        },
        min: 0,
        ticks: {
          stepSize: 1,
          callback: (value) => Math.floor(Number(value)).toString(),
        },
      },
    },
  };

  return (
    <Box height={240} data-testid="agents-chart">
      <Bar data={chartData} options={options} />
    </Box>
  );
};

export default AgentsChart;
