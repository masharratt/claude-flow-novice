/**
 * Test fixtures for Performance view tests
 */

export const mockPerformanceData = {
  timestamp: new Date('2025-10-12T10:00:00Z'),
  metrics: {
    cpu: {
      usage_percent: 45.2,
      cores: 8,
      user_percent: 32.1,
      system_percent: 13.1,
      idle_percent: 54.8,
    },
    memory: {
      used_mb: 4096,
      total_mb: 16384,
      usage_percent: 25.0,
      available_mb: 12288,
      cached_mb: 2048,
    },
    agents: {
      total: 150,
      active: 120,
      idle: 25,
      in_progress: 80,
      completed: 40,
      failed: 5,
    },
    events: {
      total_per_sec: 1250,
      lifecycle_per_sec: 450,
      cfn_loop_per_sec: 200,
      agent_complete_per_sec: 350,
      error_per_sec: 250,
    },
    swarms: {
      active: 3,
      total: 5,
      avg_confidence: 0.86,
    },
    redis: {
      connected: true,
      latency_ms: 2,
      memory_mb: 128,
      connections: 45,
    },
    sqlite: {
      connected: true,
      size_mb: 1024,
      queries_per_sec: 850,
    },
  },
};

export const mockHistoricalData1h = Array.from({ length: 60 }, (_, i) => ({
  timestamp: new Date(Date.now() - (60 - i) * 60 * 1000),
  cpu_percent: 40 + Math.sin(i / 10) * 10 + Math.random() * 5,
  memory_mb: 3800 + Math.sin(i / 15) * 400 + Math.random() * 100,
  agents_active: 100 + Math.floor(Math.sin(i / 8) * 20 + Math.random() * 10),
  events_per_sec: 1000 + Math.floor(Math.sin(i / 12) * 300 + Math.random() * 100),
}));

export const mockHistoricalData6h = Array.from({ length: 72 }, (_, i) => ({
  timestamp: new Date(Date.now() - (72 - i) * 5 * 60 * 1000),
  cpu_percent: 42 + Math.sin(i / 12) * 12 + Math.random() * 6,
  memory_mb: 3900 + Math.sin(i / 18) * 500 + Math.random() * 150,
  agents_active: 105 + Math.floor(Math.sin(i / 10) * 25 + Math.random() * 12),
  events_per_sec: 1100 + Math.floor(Math.sin(i / 15) * 400 + Math.random() * 120),
}));

export const mockHistoricalData24h = Array.from({ length: 96 }, (_, i) => ({
  timestamp: new Date(Date.now() - (96 - i) * 15 * 60 * 1000),
  cpu_percent: 43 + Math.sin(i / 15) * 15 + Math.random() * 8,
  memory_mb: 4000 + Math.sin(i / 20) * 600 + Math.random() * 200,
  agents_active: 110 + Math.floor(Math.sin(i / 12) * 30 + Math.random() * 15),
  events_per_sec: 1150 + Math.floor(Math.sin(i / 18) * 450 + Math.random() * 150),
}));

export const mockHistoricalData7d = Array.from({ length: 168 }, (_, i) => ({
  timestamp: new Date(Date.now() - (168 - i) * 60 * 60 * 1000),
  cpu_percent: 44 + Math.sin(i / 24) * 18 + Math.random() * 10,
  memory_mb: 4100 + Math.sin(i / 30) * 700 + Math.random() * 250,
  agents_active: 115 + Math.floor(Math.sin(i / 20) * 35 + Math.random() * 18),
  events_per_sec: 1200 + Math.floor(Math.sin(i / 25) * 500 + Math.random() * 180),
}));

export const mockHistoricalData30d = Array.from({ length: 180 }, (_, i) => ({
  timestamp: new Date(Date.now() - (180 - i) * 4 * 60 * 60 * 1000),
  cpu_percent: 45 + Math.sin(i / 30) * 20 + Math.random() * 12,
  memory_mb: 4200 + Math.sin(i / 40) * 800 + Math.random() * 300,
  agents_active: 120 + Math.floor(Math.sin(i / 25) * 40 + Math.random() * 20),
  events_per_sec: 1250 + Math.floor(Math.sin(i / 35) * 550 + Math.random() * 200),
}));

export const mockPerformanceHistory = {
  '1h': mockHistoricalData1h,
  '6h': mockHistoricalData6h,
  '24h': mockHistoricalData24h,
  '7d': mockHistoricalData7d,
  '30d': mockHistoricalData30d,
};

export const mockPerformanceCSV = `Timestamp,CPU (%),Memory (MB),Active Agents,Events/sec
${mockHistoricalData1h
  .map(
    (d) =>
      `${d.timestamp.toISOString()},${d.cpu_percent.toFixed(1)},${d.memory_mb.toFixed(0)},${d.agents_active},${d.events_per_sec.toFixed(0)}`
  )
  .join('\n')}`;

export const mockMetricCards = [
  {
    title: 'System CPU',
    value: '45.2%',
    trend: -2.3,
    trendLabel: 'vs last hour',
  },
  {
    title: 'Memory Usage',
    value: '4.0 GB',
    trend: 5.8,
    trendLabel: 'vs last hour',
  },
  {
    title: 'Active Agents',
    value: 120,
    trend: 8.2,
    trendLabel: 'vs last 24h',
  },
  {
    title: 'Events/sec',
    value: 1250,
    trend: 0.5,
    trendLabel: 'vs last hour',
  },
];

export const mockWebSocketMetricsUpdate = {
  type: 'metrics:update',
  data: {
    timestamp: new Date('2025-10-12T10:05:00Z'),
    cpu_percent: 46.8,
    memory_mb: 4150,
    agents_active: 122,
    events_per_sec: 1275,
  },
};

export const mockChartData = {
  cpu: {
    labels: mockHistoricalData1h.map((d) => d.timestamp.toLocaleTimeString()),
    datasets: [
      {
        label: 'CPU Usage (%)',
        data: mockHistoricalData1h.map((d) => d.cpu_percent),
        borderColor: '#1976d2',
        backgroundColor: 'rgba(25, 118, 210, 0.1)',
      },
    ],
  },
  memory: {
    labels: mockHistoricalData1h.map((d) => d.timestamp.toLocaleTimeString()),
    datasets: [
      {
        label: 'Memory Usage (MB)',
        data: mockHistoricalData1h.map((d) => d.memory_mb),
        borderColor: '#ff9800',
        backgroundColor: 'rgba(255, 152, 0, 0.1)',
      },
    ],
  },
  agents: {
    labels: ['Active', 'Idle', 'In Progress', 'Completed', 'Failed'],
    datasets: [
      {
        label: 'Agent Status',
        data: [120, 25, 80, 40, 5],
        backgroundColor: [
          '#4caf50',
          '#9e9e9e',
          '#2196f3',
          '#8bc34a',
          '#f44336',
        ],
      },
    ],
  },
  events: {
    labels: mockHistoricalData1h.map((d) => d.timestamp.toLocaleTimeString()),
    datasets: [
      {
        label: 'Events/sec',
        data: mockHistoricalData1h.map((d) => d.events_per_sec),
        borderColor: '#4caf50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
      },
    ],
  },
};
