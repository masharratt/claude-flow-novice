import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  mockAgents,
  mockEvents,
  mockFleetMetrics,
  mockPerformanceMetrics,
  mockCFNLoopStatus,
  mockDashboardMetrics,
  mockUser,
} from '../fixtures/test-data';

export const handlers = [
  // Auth endpoints
  http.post('/api/auth/login', () => {
    return HttpResponse.json({
      success: true,
      data: {
        user: mockUser,
        token: mockUser.token,
      },
    });
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({ success: true });
  }),

  http.get('/api/auth/me', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new HttpResponse(null, { status: 401 });
    }
    return HttpResponse.json({
      success: true,
      data: mockUser,
    });
  }),

  // Agents endpoints
  http.get('/api/agents', () => {
    return HttpResponse.json({
      success: true,
      data: mockAgents,
      total: mockAgents.length,
    });
  }),

  http.get('/api/agents/:id', ({ params }) => {
    const agent = mockAgents.find((a) => a.id === params.id);
    if (!agent) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({
      success: true,
      data: agent,
    });
  }),

  http.post('/api/agents', async ({ request }) => {
    const body = await request.json();
    const newAgent = {
      id: `agent-${Date.now()}`,
      ...(body as any),
      status: 'active',
      spawned_at: new Date(),
      last_active: new Date(),
    };
    return HttpResponse.json({
      success: true,
      data: newAgent,
    }, { status: 201 });
  }),

  // Events endpoints
  http.get('/events', ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    return HttpResponse.json({
      success: true,
      data: {
        events: mockEvents,
      },
      meta: {
        page,
        limit,
        total: mockEvents.length,
        totalPages: Math.ceil(mockEvents.length / limit),
      },
    });
  }),

  // Fleet endpoints
  http.get('/api/fleet/:fleetId/metrics', () => {
    return HttpResponse.json({
      success: true,
      data: mockFleetMetrics,
    });
  }),

  // Performance endpoints
  http.get('/api/performance/metrics', () => {
    return HttpResponse.json({
      success: true,
      data: [mockPerformanceMetrics],
    });
  }),

  // CFN Loop endpoints
  http.get('/api/cfn-loop/status', () => {
    return HttpResponse.json({
      success: true,
      data: mockCFNLoopStatus,
    });
  }),

  // Dashboard endpoints
  http.get('/api/dashboard/metrics', () => {
    return HttpResponse.json({
      success: true,
      data: mockDashboardMetrics,
    });
  }),

  // Hierarchy endpoint
  http.get('/agents/hierarchy', ({ request }) => {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');
    const typeFilter = url.searchParams.get('type');

    // Filter agents based on query params
    let filteredAgents = mockAgents;
    if (statusFilter) {
      filteredAgents = filteredAgents.filter(a => a.status === statusFilter);
    }
    if (typeFilter) {
      filteredAgents = filteredAgents.filter(a => a.type === typeFilter);
    }

    // Build hierarchy from parent_id relationships
    const buildHierarchy = (agents: typeof mockAgents) => {
      const agentsMap = new Map(agents.map(a => [a.id, { ...a, children: [] as any[] }]));
      const roots: any[] = [];

      agents.forEach(agent => {
        const agentWithChildren = agentsMap.get(agent.id);
        if (!agentWithChildren) return;

        const parentId = (agent as any).parent_id;
        if (parentId && agentsMap.has(parentId)) {
          agentsMap.get(parentId)!.children.push(agentWithChildren);
        } else {
          roots.push(agentWithChildren);
        }
      });

      return roots;
    };

    const hierarchy = buildHierarchy(filteredAgents);

    return HttpResponse.json({
      success: true,
      data: {
        hierarchy,
        total_agents: filteredAgents.length,
        topology: filteredAgents.length > 7 ? 'hierarchical' : 'mesh',
      },
    });
  }),

  // Agent status endpoint
  http.get('/agents/:id/status', ({ params }) => {
    const agent = mockAgents.find(a => a.id === params.id);
    if (!agent) {
      return new HttpResponse(null, { status: 404 });
    }

    const response: any = {
      success: true,
      data: {
        agent: {
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
        },
        metrics: {
          tasks_completed: agent.metadata.tasks_completed || 0,
          confidence: agent.metadata.confidence || 0,
        },
      },
    };

    // Add current_task if agent is in_progress
    if (agent.status === 'active' || (agent as any).status === 'in_progress') {
      response.data.current_task = {
        id: 'task-001',
        description: 'Implementing authentication',
        progress: 65,
      };
    }

    return HttpResponse.json(response);
  }),

  // Metrics endpoint
  http.get('/metrics', () => {
    return HttpResponse.json({
      success: true,
      data: {
        metrics: {
          cpu: {
            usage_percent: 45.2,
            cores: 8,
          },
          memory: {
            used_mb: 4096,
            total_mb: 16384,
            usage_percent: 25,
          },
          agents: {
            total: mockAgents.length,
            active: mockAgents.filter(a => a.status === 'active').length,
            idle: mockAgents.filter(a => a.status === 'idle').length,
          },
          swarms: {
            active: 2,
            total: 5,
          },
          redis: {
            connected: true,
            latency_ms: 2,
          },
          sqlite: {
            connected: true,
            size_mb: 1024,
          },
        },
      },
    });
  }),

  // Intervention endpoint
  http.post('/agents/:id/intervene', async ({ params, request }) => {
    const agent = mockAgents.find(a => a.id === params.id);
    if (!agent) {
      return new HttpResponse(null, { status: 404 });
    }

    const body = await request.json() as any;
    const { action, reason, config } = body;

    return HttpResponse.json({
      success: true,
      data: {
        agent_id: params.id as string,
        action,
        status: 'success',
        ...(reason && { reason }),
        ...(config && { config }),
      },
    });
  }),

  // Health check endpoint
  http.get('/health', () => {
    return HttpResponse.json({
      success: true,
      data: {
        status: 'healthy',
        version: '1.0.0',
        services: {
          api: {
            status: 'healthy',
            uptime_seconds: 3600,
          },
          redis: {
            status: 'healthy',
            latency_ms: 2,
          },
          sqlite: {
            status: 'healthy',
            size_mb: 1024,
          },
          websocket: {
            status: 'healthy',
            connections: 5,
          },
        },
      },
    });
  }),

  // Resources endpoint
  http.get('/resources', () => {
    const resources = mockAgents.map((agent, index) => ({
      agent_id: agent.id,
      agent_name: agent.name,
      cpu_percent: 10 + (index * 5),
      memory_mb: 128 + (index * 64),
      uptime_seconds: 3600 + (index * 300),
    }));

    const totalCpu = resources.reduce((sum, r) => sum + r.cpu_percent, 0);
    const totalMemory = resources.reduce((sum, r) => sum + r.memory_mb, 0);

    return HttpResponse.json({
      success: true,
      data: {
        resources,
        summary: {
          total_cpu_percent: totalCpu,
          total_memory_mb: totalMemory,
          avg_cpu_percent: totalCpu / resources.length,
          avg_memory_mb: totalMemory / resources.length,
        },
      },
    });
  }),

  // Error scenarios
  http.get('/api/error/500', () => {
    return new HttpResponse(null, { status: 500 });
  }),

  http.get('/api/error/503', () => {
    return new HttpResponse(null, { status: 503 });
  }),
];

export const server = setupServer(...handlers);

// Reset handlers between tests
export const resetHandlers = () => {
  server.resetHandlers();
};

// Add custom handlers for specific tests
export const addHandler = (...newHandlers: any[]) => {
  server.use(...newHandlers);
};
