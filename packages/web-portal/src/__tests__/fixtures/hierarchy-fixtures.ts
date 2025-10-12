/**
 * Test fixtures for Hierarchy view tests
 */

export const mockHierarchyTree = [
  {
    id: 'coordinator-001',
    name: 'Main Coordinator',
    type: 'coordinator',
    status: 'active' as const,
    capabilities: ['coordination', 'planning'],
    spawned_at: new Date('2025-10-12T08:00:00Z'),
    last_active: new Date('2025-10-12T10:30:00Z'),
    parent_id: undefined,
    metadata: {
      tasks_completed: 25,
      confidence: 0.94,
    },
    children: [
      {
        id: 'agent-001',
        name: 'Primary Coder',
        type: 'coder',
        status: 'active' as const,
        capabilities: ['coding', 'testing'],
        spawned_at: new Date('2025-10-12T08:15:00Z'),
        last_active: new Date('2025-10-12T10:25:00Z'),
        parent_id: 'coordinator-001',
        metadata: {
          tasks_completed: 12,
          confidence: 0.92,
        },
        children: [
          {
            id: 'agent-002',
            name: 'Security Specialist',
            type: 'security-specialist',
            status: 'active' as const,
            capabilities: ['security', 'audit'],
            spawned_at: new Date('2025-10-12T08:30:00Z'),
            last_active: new Date('2025-10-12T10:20:00Z'),
            parent_id: 'agent-001',
            metadata: {
              tasks_completed: 8,
              confidence: 0.88,
            },
            children: [],
          },
          {
            id: 'agent-003',
            name: 'Test Engineer',
            type: 'tester',
            status: 'in_progress' as const,
            capabilities: ['testing', 'e2e-testing'],
            spawned_at: new Date('2025-10-12T08:45:00Z'),
            last_active: new Date('2025-10-12T10:15:00Z'),
            parent_id: 'agent-001',
            metadata: {
              tasks_completed: 5,
              confidence: 0.78,
            },
            children: [],
          },
        ],
      },
      {
        id: 'agent-004',
        name: 'Code Reviewer',
        type: 'reviewer',
        status: 'idle' as const,
        capabilities: ['review', 'validation'],
        spawned_at: new Date('2025-10-12T08:20:00Z'),
        last_active: new Date('2025-10-12T09:30:00Z'),
        parent_id: 'coordinator-001',
        metadata: {
          tasks_completed: 15,
          confidence: 0.95,
        },
        children: [],
      },
    ],
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
    children: [],
  },
];

export const mockHierarchyResponse = {
  hierarchy: mockHierarchyTree,
  total_agents: 6,
  topology: 'hierarchical' as const,
  max_depth: 3,
  root_agents: 2,
};

export const mockFlatHierarchy = [
  {
    id: 'agent-001',
    name: 'Agent 1',
    type: 'coder',
    status: 'active' as const,
    depth: 0,
    parent_id: undefined,
    capabilities: ['coding'],
    spawned_at: new Date('2025-10-12T08:00:00Z'),
    last_active: new Date('2025-10-12T10:30:00Z'),
    metadata: { tasks_completed: 5, confidence: 0.85 },
  },
  {
    id: 'agent-002',
    name: 'Agent 2',
    type: 'tester',
    status: 'active' as const,
    depth: 1,
    parent_id: 'agent-001',
    capabilities: ['testing'],
    spawned_at: new Date('2025-10-12T08:15:00Z'),
    last_active: new Date('2025-10-12T10:25:00Z'),
    metadata: { tasks_completed: 3, confidence: 0.80 },
  },
  {
    id: 'agent-003',
    name: 'Agent 3',
    type: 'reviewer',
    status: 'idle' as const,
    depth: 2,
    parent_id: 'agent-002',
    capabilities: ['review'],
    spawned_at: new Date('2025-10-12T08:30:00Z'),
    last_active: new Date('2025-10-12T10:20:00Z'),
    metadata: { tasks_completed: 7, confidence: 0.90 },
  },
];

export const mockHierarchyCSV = `ID,Name,Type,Status,Depth,Parent ID,Tasks Completed,Confidence,Spawned At
coordinator-001,Main Coordinator,coordinator,active,0,,25,0.94,2025-10-12T08:00:00Z
agent-001,Primary Coder,coder,active,1,coordinator-001,12,0.92,2025-10-12T08:15:00Z
agent-002,Security Specialist,security-specialist,active,2,agent-001,8,0.88,2025-10-12T08:30:00Z
agent-003,Test Engineer,tester,in_progress,2,agent-001,5,0.78,2025-10-12T08:45:00Z
agent-004,Code Reviewer,reviewer,idle,1,coordinator-001,15,0.95,2025-10-12T08:20:00Z
agent-005,Backend Developer,coder,completed,0,,20,0.91,2025-10-12T07:00:00Z`;

export const mockWebSocketHierarchyUpdate = {
  type: 'hierarchy:change',
  data: {
    action: 'agent_spawned',
    agent: {
      id: 'agent-007',
      name: 'New Agent',
      type: 'coder',
      status: 'active',
      parent_id: 'agent-001',
      capabilities: ['coding'],
      spawned_at: new Date('2025-10-12T10:35:00Z'),
      last_active: new Date('2025-10-12T10:35:00Z'),
      metadata: {
        tasks_completed: 0,
        confidence: 0.0,
      },
    },
  },
};
