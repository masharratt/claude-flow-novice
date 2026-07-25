/**
 * MSW (Mock Service Worker) Handlers
 *
 * Mock API handlers for testing ApiClient and React Query hooks
 */

import { http, HttpResponse } from 'msw';
import type {
  ApiResponse,
  PaginatedResponse,
  AgentHierarchyResponse,
  AgentStatusResponse,
  MetricsResponse,
  EventsResponse,
  ResourcesResponse,
  InterventionResponse,
  HealthCheckResponse,
} from '../../shared/types/api';

const API_BASE_URL = 'http://localhost:3000/api';

// ============================================================================
// Mock Data
// ============================================================================

const mockAgentHierarchy: ApiResponse<AgentHierarchyResponse> = {
  success: true,
  data: {
    hierarchy: [
      {
        id: 'agent-1',
        name: 'Coordinator Agent',
        type: 'coordinator',
        status: 'in_progress',
        capabilities: ['coordination', 'task-management'],
        spawned_at: '2025-10-11T12:00:00Z',
        last_active: '2025-10-11T12:30:00Z',
        confidence: 0.92,
        children: [
          {
            id: 'agent-2',
            name: 'Coder Agent 1',
            type: 'coder',
            status: 'completed',
            capabilities: ['coding', 'testing'],
            spawned_at: '2025-10-11T12:05:00Z',
            completed_at: '2025-10-11T12:25:00Z',
            parent_id: 'agent-1',
            confidence: 0.88,
          },
          {
            id: 'agent-3',
            name: 'Coder Agent 2',
            type: 'coder',
            status: 'in_progress',
            capabilities: ['coding', 'refactoring'],
            spawned_at: '2025-10-11T12:10:00Z',
            last_active: '2025-10-11T12:28:00Z',
            parent_id: 'agent-1',
            confidence: 0.85,
          },
        ],
      },
    ],
    total_agents: 3,
    active_agents: 2,
    topology: 'hierarchical',
  },
  timestamp: new Date().toISOString(),
};

const mockAgentStatus: ApiResponse<AgentStatusResponse> = {
  success: true,
  data: {
    agent: {
      id: 'agent-2',
      name: 'Coder Agent 1',
      type: 'coder',
      status: 'in_progress',
      capabilities: ['coding', 'testing'],
      spawned_at: '2025-10-11T12:05:00Z',
      last_active: '2025-10-11T12:30:00Z',
      confidence: 0.88,
      task: 'Implement API client',
    },
    metrics: {
      tasks_completed: 5,
      avg_confidence: 0.87,
      uptime_seconds: 1500,
      last_heartbeat: '2025-10-11T12:30:00Z',
    },
    current_task: {
      id: 'task-123',
      description: 'Implement unified API client with React Query',
      started_at: '2025-10-11T12:20:00Z',
      progress: 75,
    },
  },
  timestamp: new Date().toISOString(),
};

const mockMetrics: ApiResponse<MetricsResponse> = {
  success: true,
  data: {
    metrics: {
      cpu: {
        usage_percent: 45.2,
        cores: 8,
      },
      memory: {
        used_mb: 2048,
        total_mb: 8192,
        usage_percent: 25.0,
      },
      agents: {
        total: 15,
        active: 8,
        idle: 5,
        failed: 2,
      },
      swarms: {
        total: 3,
        active: 2,
        completed: 1,
      },
      tasks: {
        completed: 45,
        in_progress: 12,
        pending: 8,
        failed: 3,
      },
      redis: {
        connected: true,
        keys: 1234,
        memory_mb: 128,
      },
      sqlite: {
        size_mb: 256,
        total_records: 5678,
      },
      timestamp: new Date().toISOString(),
    },
  },
  timestamp: new Date().toISOString(),
};

const mockEvents: PaginatedResponse<EventsResponse> = {
  success: true,
  data: {
    events: [
      {
        id: 'event-1',
        type: 'agent.spawned',
        agent_id: 'agent-1',
        swarm_id: 'swarm-123',
        data: { name: 'Coordinator Agent', type: 'coordinator' },
        priority: 8,
        timestamp: '2025-10-11T12:00:00Z',
        created_at: '2025-10-11T12:00:00Z',
      },
      {
        id: 'event-2',
        type: 'task.completed',
        agent_id: 'agent-2',
        swarm_id: 'swarm-123',
        data: { task_id: 'task-456', confidence: 0.88 },
        priority: 7,
        timestamp: '2025-10-11T12:25:00Z',
        created_at: '2025-10-11T12:25:00Z',
      },
    ],
  },
  meta: {
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  timestamp: new Date().toISOString(),
};

const mockResources: ApiResponse<ResourcesResponse> = {
  success: true,
  data: {
    resources: [
      {
        agent_id: 'agent-1',
        agent_name: 'Coordinator Agent',
        agent_type: 'coordinator',
        cpu_percent: 12.5,
        memory_mb: 256,
        uptime_seconds: 1800,
        task_count: 3,
        status: 'in_progress',
        last_updated: '2025-10-11T12:30:00Z',
      },
      {
        agent_id: 'agent-2',
        agent_name: 'Coder Agent 1',
        agent_type: 'coder',
        cpu_percent: 8.3,
        memory_mb: 192,
        uptime_seconds: 1500,
        task_count: 5,
        status: 'in_progress',
        last_updated: '2025-10-11T12:30:00Z',
      },
    ],
    summary: {
      total_cpu_percent: 20.8,
      total_memory_mb: 448,
      avg_cpu_percent: 10.4,
      avg_memory_mb: 224,
    },
  },
  timestamp: new Date().toISOString(),
};

const mockHealthCheck: ApiResponse<HealthCheckResponse> = {
  success: true,
  data: {
    status: 'healthy',
    version: '3.0.0',
    uptime_seconds: 86400,
    services: {
      api: true,
      redis: true,
      sqlite: true,
      websocket: true,
    },
    timestamp: new Date().toISOString(),
  },
  timestamp: new Date().toISOString(),
};

// ============================================================================
// MSW Handlers
// ============================================================================

export const handlers = [
  // GET /api/agents/hierarchy
  http.get(`${API_BASE_URL}/agents/hierarchy`, () => {
    return HttpResponse.json(mockAgentHierarchy);
  }),

  // GET /api/agents/:id/status
  http.get(`${API_BASE_URL}/agents/:id/status`, ({ params }) => {
    const { id } = params;
    return HttpResponse.json({
      ...mockAgentStatus,
      data: {
        ...mockAgentStatus.data,
        agent: {
          ...mockAgentStatus.data.agent,
          id: id as string,
        },
      },
    });
  }),

  // GET /api/metrics
  http.get(`${API_BASE_URL}/metrics`, () => {
    return HttpResponse.json(mockMetrics);
  }),

  // GET /api/events
  http.get(`${API_BASE_URL}/events`, () => {
    return HttpResponse.json(mockEvents);
  }),

  // GET /api/resources
  http.get(`${API_BASE_URL}/resources`, () => {
    return HttpResponse.json(mockResources);
  }),

  // POST /api/agents/:id/intervene
  http.post(`${API_BASE_URL}/agents/:id/intervene`, async ({ params, request }) => {
    const { id } = params;
    const body = (await request.json()) as any;

    const mockIntervention: ApiResponse<InterventionResponse> = {
      success: true,
      data: {
        agent_id: id as string,
        action: body.action,
        status: 'success',
        message: `Agent ${id} intervention successful: ${body.action}`,
        applied_at: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    return HttpResponse.json(mockIntervention);
  }),

  // GET /api/health
  http.get(`${API_BASE_URL}/health`, () => {
    return HttpResponse.json(mockHealthCheck);
  }),

  // Error handler for testing error scenarios
  http.get(`${API_BASE_URL}/error/500`, () => {
    return HttpResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }),

  http.get(`${API_BASE_URL}/error/404`, () => {
    return HttpResponse.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 404 }
    );
  }),
];
