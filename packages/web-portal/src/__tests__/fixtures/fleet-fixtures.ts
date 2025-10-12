/**
 * Test Fixtures for Fleet View
 * Provides mock swarm and fleet metrics data for testing aggregation, list/grid views, and charts
 */

export interface Swarm {
  id: string;
  name: string;
  agentCount: number;
  status: { active: number; idle: number; completed: number; failed: number };
  createdAt: number;
}

export interface FleetMetrics {
  totalAgents: number;
  activeSwarms: number;
  avgConfidence: number;
  tasksCompleted: number;
}

export interface AgentDistribution {
  type: string;
  count: number;
}

/**
 * Mock swarms for testing
 */
export const mockSwarms: Swarm[] = [
  {
    id: 'swarm-001',
    name: 'Sprint 3.3 Implementation',
    agentCount: 5,
    status: { active: 3, idle: 1, completed: 1, failed: 0 },
    createdAt: Date.now() - 3600000, // 1 hour ago
  },
  {
    id: 'swarm-002',
    name: 'Backend Services',
    agentCount: 8,
    status: { active: 5, idle: 2, completed: 1, failed: 0 },
    createdAt: Date.now() - 7200000, // 2 hours ago
  },
  {
    id: 'swarm-003',
    name: 'Database Migration',
    agentCount: 3,
    status: { active: 2, idle: 0, completed: 1, failed: 0 },
    createdAt: Date.now() - 10800000, // 3 hours ago
  },
  {
    id: 'swarm-004',
    name: 'Security Audit',
    agentCount: 4,
    status: { active: 1, idle: 1, completed: 2, failed: 0 },
    createdAt: Date.now() - 14400000, // 4 hours ago
  },
  {
    id: 'swarm-005',
    name: 'Performance Testing',
    agentCount: 6,
    status: { active: 4, idle: 1, completed: 1, failed: 0 },
    createdAt: Date.now() - 18000000, // 5 hours ago
  },
];

/**
 * Extended mock swarms for virtual scrolling tests
 */
export const mockSwarmsLarge: Swarm[] = [
  ...mockSwarms,
  ...Array.from({ length: 45 }, (_, i) => ({
    id: `swarm-${String(i + 6).padStart(3, '0')}`,
    name: `Swarm ${i + 6}: ${['Development', 'Testing', 'Security', 'Performance', 'Documentation'][i % 5]}`,
    agentCount: 3 + (i % 8),
    status: {
      active: 1 + (i % 4),
      idle: i % 3,
      completed: i % 5,
      failed: i % 10 === 0 ? 1 : 0,
    },
    createdAt: Date.now() - (i + 6) * 3600000,
  })),
];

/**
 * Mock fleet metrics
 */
export const mockFleetMetricsBasic: FleetMetrics = {
  totalAgents: 1247,
  activeSwarms: 42,
  avgConfidence: 0.87,
  tasksCompleted: 389,
};

export const mockFleetMetricsLarge: FleetMetrics = {
  totalAgents: 5000,
  activeSwarms: 150,
  avgConfidence: 0.92,
  tasksCompleted: 2500,
};

export const mockFleetMetricsLowConfidence: FleetMetrics = {
  totalAgents: 850,
  activeSwarms: 28,
  avgConfidence: 0.68,
  tasksCompleted: 150,
};

/**
 * Mock agent distribution data for pie chart
 */
export const mockAgentDistribution: AgentDistribution[] = [
  { type: 'coder', count: 450 },
  { type: 'tester', count: 320 },
  { type: 'reviewer', count: 215 },
  { type: 'security', count: 142 },
  { type: 'architect', count: 80 },
  { type: 'devops', count: 40 },
];

export const mockAgentDistributionEmpty: AgentDistribution[] = [];

export const mockAgentDistributionSingle: AgentDistribution[] = [{ type: 'coder', count: 100 }];

/**
 * Mock swarm status breakdown
 */
export const mockSwarmStatusBreakdown = {
  active: 28,
  idle: 8,
  completed: 6,
  failed: 0,
};

export const mockSwarmStatusWithFailures = {
  active: 22,
  idle: 10,
  completed: 8,
  failed: 2,
};

/**
 * WebSocket update payloads for real-time tests
 */
export const mockWebSocketAgentUpdate = {
  agentId: 'agent-websocket-001',
  type: 'coder',
  status: 'active',
  swarmId: 'swarm-001',
  confidence: 0.91,
};

export const mockWebSocketSwarmUpdate = {
  swarmId: 'swarm-001',
  agentCount: 6, // Updated from 5
  status: { active: 4, idle: 1, completed: 1, failed: 0 }, // Updated
};

export const mockWebSocketNewSwarm = {
  id: 'swarm-new-001',
  name: 'New Swarm via WebSocket',
  agentCount: 3,
  status: { active: 2, idle: 1, completed: 0, failed: 0 },
  createdAt: Date.now(),
};

/**
 * Helper to create custom swarm
 */
export const createMockSwarm = (overrides: Partial<Swarm> = {}): Swarm => ({
  id: `swarm-${Date.now()}`,
  name: 'Mock Swarm',
  agentCount: 5,
  status: { active: 3, idle: 1, completed: 1, failed: 0 },
  createdAt: Date.now(),
  ...overrides,
});

/**
 * Helper to create custom fleet metrics
 */
export const createMockFleetMetrics = (overrides: Partial<FleetMetrics> = {}): FleetMetrics => ({
  totalAgents: 1000,
  activeSwarms: 50,
  avgConfidence: 0.85,
  tasksCompleted: 300,
  ...overrides,
});

/**
 * Mock chart.js chart data
 */
export const mockPieChartData = {
  labels: mockAgentDistribution.map((d) => d.type),
  datasets: [
    {
      label: 'Agent Distribution',
      data: mockAgentDistribution.map((d) => d.count),
      backgroundColor: [
        'rgba(75, 192, 192, 0.6)',
        'rgba(255, 99, 132, 0.6)',
        'rgba(255, 206, 86, 0.6)',
        'rgba(54, 162, 235, 0.6)',
        'rgba(153, 102, 255, 0.6)',
        'rgba(255, 159, 64, 0.6)',
      ],
      borderColor: [
        'rgba(75, 192, 192, 1)',
        'rgba(255, 99, 132, 1)',
        'rgba(255, 206, 86, 1)',
        'rgba(54, 162, 235, 1)',
        'rgba(153, 102, 255, 1)',
        'rgba(255, 159, 64, 1)',
      ],
      borderWidth: 1,
    },
  ],
};
