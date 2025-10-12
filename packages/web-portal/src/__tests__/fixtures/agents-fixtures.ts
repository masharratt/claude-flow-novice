/**
 * Test fixtures for Agents view tests
 */

export const mockAgentsList = [
  {
    id: 'agent-001',
    name: 'Primary Coder',
    type: 'coder',
    status: 'active' as const,
    capabilities: ['coding', 'testing', 'debugging'],
    spawned_at: new Date('2025-10-12T09:00:00Z'),
    last_active: new Date('2025-10-12T10:30:00Z'),
    parent_id: undefined,
    metadata: {
      tasks_completed: 12,
      confidence: 0.92,
      current_task: 'Implementing authentication module',
    },
  },
  {
    id: 'agent-002',
    name: 'Security Specialist',
    type: 'security-specialist',
    status: 'active' as const,
    capabilities: ['security', 'audit', 'compliance'],
    spawned_at: new Date('2025-10-12T09:15:00Z'),
    last_active: new Date('2025-10-12T10:25:00Z'),
    parent_id: 'agent-001',
    metadata: {
      tasks_completed: 8,
      confidence: 0.88,
      current_task: 'Security audit of auth flow',
    },
  },
  {
    id: 'agent-003',
    name: 'Test Engineer',
    type: 'tester',
    status: 'in_progress' as const,
    capabilities: ['testing', 'e2e-testing', 'integration-testing'],
    spawned_at: new Date('2025-10-12T09:30:00Z'),
    last_active: new Date('2025-10-12T10:20:00Z'),
    parent_id: 'agent-001',
    metadata: {
      tasks_completed: 5,
      confidence: 0.78,
      current_task: 'Writing unit tests',
    },
  },
  {
    id: 'agent-004',
    name: 'Code Reviewer',
    type: 'reviewer',
    status: 'idle' as const,
    capabilities: ['review', 'validation', 'quality-check'],
    spawned_at: new Date('2025-10-12T08:00:00Z'),
    last_active: new Date('2025-10-12T09:00:00Z'),
    parent_id: undefined,
    metadata: {
      tasks_completed: 15,
      confidence: 0.95,
    },
  },
  {
    id: 'agent-005',
    name: 'Backend Developer',
    type: 'coder',
    status: 'completed' as const,
    capabilities: ['backend', 'api', 'database'],
    spawned_at: new Date('2025-10-12T07:00:00Z'),
    last_active: new Date('2025-10-12T08:30:00Z'),
    parent_id: undefined,
    metadata: {
      tasks_completed: 20,
      confidence: 0.91,
    },
  },
  {
    id: 'agent-006',
    name: 'Performance Analyzer',
    type: 'architect',
    status: 'failed' as const,
    capabilities: ['performance', 'optimization', 'profiling'],
    spawned_at: new Date('2025-10-12T08:30:00Z'),
    last_active: new Date('2025-10-12T09:15:00Z'),
    parent_id: undefined,
    metadata: {
      tasks_completed: 3,
      confidence: 0.42,
      error: 'Performance benchmark timeout',
    },
  },
];

export const mockAgentTypes = [
  'coder',
  'reviewer',
  'tester',
  'security-specialist',
  'architect',
  'coordinator',
];

export const mockAgentStatuses = [
  'active',
  'idle',
  'in_progress',
  'completed',
  'failed',
];

export const mockCapabilities = [
  'coding',
  'testing',
  'debugging',
  'security',
  'audit',
  'compliance',
  'review',
  'validation',
  'quality-check',
  'backend',
  'frontend',
  'api',
  'database',
  'performance',
  'optimization',
];

export const mockNewAgent = {
  type: 'coder',
  name: 'New Test Agent',
  capabilities: ['coding', 'testing'],
};

export const mockAgentSpawnResponse = {
  id: 'agent-007',
  ...mockNewAgent,
  status: 'active' as const,
  spawned_at: new Date('2025-10-12T10:35:00Z'),
  last_active: new Date('2025-10-12T10:35:00Z'),
  parent_id: undefined,
  metadata: {
    tasks_completed: 0,
    confidence: 0.0,
  },
};

export const mockWebSocketAgentUpdate = {
  type: 'agent:update',
  data: {
    agent_id: 'agent-003',
    status: 'active',
    metadata: {
      tasks_completed: 6,
      confidence: 0.82,
      current_task: 'Running integration tests',
    },
  },
};
