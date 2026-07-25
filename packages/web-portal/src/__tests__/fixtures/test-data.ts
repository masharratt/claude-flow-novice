/**
 * Test data fixtures for integration tests
 */

export const mockAgent = {
  id: 'agent-test-001',
  name: 'Test Agent',
  type: 'coder',
  status: 'active' as const,
  capabilities: ['coding', 'testing'],
  spawned_at: new Date('2025-10-12T10:00:00Z'),
  last_active: new Date('2025-10-12T10:30:00Z'),
  metadata: {
    tasks_completed: 5,
    confidence: 0.85,
  },
};

export const mockAgents = [
  {
    ...mockAgent,
    parent_id: undefined, // Root agent
  },
  {
    id: 'agent-2', // Used by ApiClient.test.ts
    name: 'Test Agent 2',
    type: 'coder',
    status: 'in_progress' as const,
    capabilities: ['coding'],
    spawned_at: new Date('2025-10-12T10:02:00Z'),
    last_active: new Date('2025-10-12T10:35:00Z'),
    parent_id: 'agent-test-001',
    metadata: {
      tasks_completed: 2,
      confidence: 0.75,
    },
  },
  {
    id: 'agent-test-002',
    name: 'Security Agent',
    type: 'security-specialist',
    status: 'active' as const,
    capabilities: ['security', 'validation'],
    spawned_at: new Date('2025-10-12T10:05:00Z'),
    last_active: new Date('2025-10-12T10:25:00Z'),
    parent_id: 'agent-test-001', // Child of mockAgent
    metadata: {
      tasks_completed: 3,
      confidence: 0.92,
    },
  },
  {
    id: 'agent-test-003',
    name: 'Reviewer Agent',
    type: 'reviewer',
    status: 'idle' as const,
    capabilities: ['review', 'validation'],
    spawned_at: new Date('2025-10-12T09:00:00Z'),
    last_active: new Date('2025-10-12T09:30:00Z'),
    parent_id: undefined, // Root agent
    metadata: {
      tasks_completed: 8,
      confidence: 0.88,
    },
  },
];

export const mockEvent = {
  id: 'event-001',
  type: 'agent.lifecycle',
  timestamp: new Date('2025-10-12T10:00:00Z'),
  agent_id: 'agent-test-001',
  data: {
    status: 'spawned',
    message: 'Agent spawned successfully',
  },
  priority: 8,
};

export const mockEvents = [
  mockEvent,
  {
    id: 'event-002',
    type: 'agent.complete',
    timestamp: new Date('2025-10-12T10:15:00Z'),
    agent_id: 'agent-test-001',
    data: {
      confidence: 0.85,
      task: 'Implementation complete',
    },
    priority: 7,
  },
  {
    id: 'event-003',
    type: 'cfn.loop.phase.start',
    timestamp: new Date('2025-10-12T10:30:00Z'),
    agent_id: null,
    data: {
      loop: 3,
      phase: 'auth',
      swarmId: 'cfn-phase-auth',
    },
    priority: 9,
  },
];

export const mockFleetMetrics = {
  fleet_id: 'fleet-test-001',
  total_agents: 150,
  active_agents: 120,
  idle_agents: 25,
  failed_agents: 5,
  efficiency: 0.42,
  throughput: 8500,
  latency_p50: 45,
  latency_p95: 120,
  latency_p99: 250,
  cpu_usage: 65,
  memory_usage: 72,
  regions: ['us-east-1', 'eu-west-1'],
};

export const mockPerformanceMetrics = {
  timestamp: new Date('2025-10-12T10:00:00Z'),
  component: 'cfn-loop',
  metrics: {
    response_time_ms: 150,
    throughput: 1000,
    error_rate: 0.02,
    cpu_usage: 45,
    memory_mb: 512,
  },
};

export const mockCFNLoopStatus = {
  loop: 3,
  phase: 'auth',
  swarm_id: 'cfn-phase-auth',
  status: 'in_progress' as const,
  confidence: 0.82,
  agents: [
    { id: 'coder-1', confidence: 0.85, status: 'complete' },
    { id: 'coder-2', confidence: 0.78, status: 'complete' },
    { id: 'security-1', confidence: 0.88, status: 'in_progress' },
  ],
  started_at: new Date('2025-10-12T10:00:00Z'),
  updated_at: new Date('2025-10-12T10:30:00Z'),
};

export const mockDashboardMetrics = {
  activeAgents: 120,
  totalAgents: 150,
  systemHealth: 0.95,
  throughput: 8500,
  avgConfidence: 0.86,
  activeSwarms: 3,
  recentEvents: mockEvents.slice(0, 5),
};

export const mockUser = {
  id: 'user-001',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin' as const,
  token: 'mock-jwt-token-12345',
};
