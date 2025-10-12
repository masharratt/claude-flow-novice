/**
 * OpenAPI/Swagger Documentation Configuration
 *
 * Complete API documentation for all 7 endpoints
 */

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Claude Flow Novice Web Portal API',
    version: '3.0.0',
    description: 'REST API for unified web portal with agent transparency system integration',
    contact: {
      name: 'Claude Flow Novice Team',
      email: 'support@claude-flow-novice.dev',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development server',
    },
    {
      url: 'https://portal.claude-flow-novice.dev',
      description: 'Production server',
    },
  ],
  tags: [
    {
      name: 'Agents',
      description: 'Agent hierarchy and status operations',
    },
    {
      name: 'Metrics',
      description: 'System-wide metrics and analytics',
    },
    {
      name: 'Events',
      description: 'Agent lifecycle event history',
    },
    {
      name: 'Resources',
      description: 'Resource utilization monitoring',
    },
    {
      name: 'Health',
      description: 'System health checks',
    },
  ],
  paths: {
    '/api/agents/hierarchy': {
      get: {
        tags: ['Agents'],
        summary: 'Get agent hierarchy',
        description: 'Returns complete agent hierarchy tree with optional filters. Cached for 30 seconds.',
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['active', 'paused', 'terminated', 'idle', 'error'],
            },
            description: 'Filter agents by status',
          },
          {
            name: 'type',
            in: 'query',
            schema: {
              type: 'string',
            },
            description: 'Filter agents by type',
          },
        ],
        responses: {
          '200': {
            description: 'Agent hierarchy retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/AgentHierarchyNode',
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '429': {
            $ref: '#/components/responses/RateLimitError',
          },
          '500': {
            $ref: '#/components/responses/InternalError',
          },
        },
      },
    },
    '/api/agents/{id}/status': {
      get: {
        tags: ['Agents'],
        summary: 'Get agent status',
        description: 'Returns individual agent status with real-time metrics. Updated every 5 seconds.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
            description: 'Agent ID',
          },
        ],
        responses: {
          '200': {
            description: 'Agent status retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      $ref: '#/components/schemas/AgentStatus',
                    },
                  },
                },
              },
            },
          },
          '404': {
            $ref: '#/components/responses/NotFoundError',
          },
          '429': {
            $ref: '#/components/responses/RateLimitError',
          },
          '500': {
            $ref: '#/components/responses/InternalError',
          },
        },
      },
    },
    '/api/agents/{id}/intervene': {
      post: {
        tags: ['Agents'],
        summary: 'Trigger agent intervention',
        description: 'Triggers agent intervention (pause, resume, terminate, restart). Rate limited to 10 req/min.',
        security: [
          {
            BearerAuth: [],
          },
        ],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
            description: 'Agent ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/InterventionRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Intervention triggered successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: {
                      type: 'boolean',
                    },
                    message: {
                      type: 'string',
                    },
                    agentId: {
                      type: 'string',
                    },
                    action: {
                      type: 'string',
                      enum: ['pause', 'resume', 'terminate', 'restart'],
                    },
                  },
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/UnauthorizedError',
          },
          '404': {
            $ref: '#/components/responses/NotFoundError',
          },
          '429': {
            $ref: '#/components/responses/RateLimitError',
          },
          '500': {
            $ref: '#/components/responses/InternalError',
          },
        },
      },
    },
    '/api/metrics': {
      get: {
        tags: ['Metrics'],
        summary: 'Get system metrics',
        description: 'Returns system-wide metrics aggregated over last 5 minutes. Cached for 10 seconds.',
        responses: {
          '200': {
            description: 'Metrics retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      $ref: '#/components/schemas/TransparencyMetrics',
                    },
                  },
                },
              },
            },
          },
          '429': {
            $ref: '#/components/responses/RateLimitError',
          },
          '500': {
            $ref: '#/components/responses/InternalError',
          },
        },
      },
    },
    '/api/events': {
      get: {
        tags: ['Events'],
        summary: 'Get paginated events',
        description: 'Returns paginated agent lifecycle event history, sorted newest first.',
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: {
              type: 'integer',
              minimum: 1,
              default: 1,
            },
            description: 'Page number',
          },
          {
            name: 'limit',
            in: 'query',
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 1000,
              default: 50,
            },
            description: 'Events per page (max 1000)',
          },
          {
            name: 'type',
            in: 'query',
            schema: {
              type: 'string',
            },
            description: 'Filter by event type',
          },
          {
            name: 'severity',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['warning', 'error', 'critical'],
            },
            description: 'Filter by severity',
          },
          {
            name: 'agentId',
            in: 'query',
            schema: {
              type: 'string',
            },
            description: 'Filter by agent ID',
          },
          {
            name: 'startTime',
            in: 'query',
            schema: {
              type: 'string',
              format: 'date-time',
            },
            description: 'Start of time range',
          },
          {
            name: 'endTime',
            in: 'query',
            schema: {
              type: 'string',
              format: 'date-time',
            },
            description: 'End of time range',
          },
        ],
        responses: {
          '200': {
            description: 'Events retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/AgentLifecycleEvent',
                      },
                    },
                    pagination: {
                      $ref: '#/components/schemas/Pagination',
                    },
                  },
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '429': {
            $ref: '#/components/responses/RateLimitError',
          },
          '500': {
            $ref: '#/components/responses/InternalError',
          },
        },
      },
    },
    '/api/resources': {
      get: {
        tags: ['Resources'],
        summary: 'Get resource utilization',
        description: 'Returns current resource utilization snapshot per agent.',
        parameters: [
          {
            name: 'threshold',
            in: 'query',
            schema: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
            },
            description: 'Only show agents above threshold percentage',
          },
        ],
        responses: {
          '200': {
            description: 'Resource utilization retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/ResourceUtilization',
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '429': {
            $ref: '#/components/responses/RateLimitError',
          },
          '500': {
            $ref: '#/components/responses/InternalError',
          },
        },
      },
    },
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'System health check endpoint. No authentication required.',
        responses: {
          '200': {
            description: 'System is healthy or degraded',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HealthStatus',
                },
              },
            },
          },
          '503': {
            description: 'System is unhealthy',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HealthStatus',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      AgentHierarchyNode: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          type: { type: 'string' },
          level: { type: 'integer' },
          parentAgentId: { type: 'string', nullable: true },
          childAgentIds: { type: 'array', items: { type: 'string' } },
          priority: { type: 'integer' },
          state: { type: 'string' },
          sessionId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          lastStateChange: { type: 'string', format: 'date-time' },
          tokensUsed: { type: 'integer' },
          tokenBudget: { type: 'integer' },
          isPaused: { type: 'boolean' },
          metadata: { type: 'object' },
          metrics: {
            type: 'object',
            properties: {
              spawnTimeMs: { type: 'number' },
              totalExecutionTimeMs: { type: 'number' },
              pauseCount: { type: 'integer' },
              resumeCount: { type: 'integer' },
              checkpointCount: { type: 'integer' },
            },
          },
        },
      },
      AgentStatus: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          state: { type: 'string' },
          isPaused: { type: 'boolean' },
          activity: { type: 'string' },
          progress: { type: 'number', minimum: 0, maximum: 100 },
          tokensUsed: { type: 'integer' },
          tokenUsageRate: { type: 'number' },
          memoryUsage: { type: 'number' },
          cpuUsage: { type: 'number' },
          lastHeartbeat: { type: 'string', format: 'date-time' },
          recentErrors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
                error: { type: 'string' },
                severity: { type: 'string', enum: ['warning', 'error', 'critical'] },
              },
            },
          },
        },
      },
      InterventionRequest: {
        type: 'object',
        required: ['action', 'reason'],
        properties: {
          action: {
            type: 'string',
            enum: ['pause', 'resume', 'terminate', 'restart'],
          },
          reason: {
            type: 'string',
            minLength: 1,
            maxLength: 500,
          },
        },
      },
      TransparencyMetrics: {
        type: 'object',
        properties: {
          totalAgents: { type: 'integer' },
          agentsByLevel: { type: 'object' },
          agentsByState: { type: 'object' },
          agentsByType: { type: 'object' },
          totalTokensConsumed: { type: 'integer' },
          totalTokensSaved: { type: 'integer' },
          averageExecutionTimeMs: { type: 'number' },
          failureRate: { type: 'number' },
          averagePauseResumeLatencyMs: { type: 'number' },
          hierarchyDepth: { type: 'integer' },
          dependencyResolutionRate: { type: 'number' },
          eventStreamStats: {
            type: 'object',
            properties: {
              totalEvents: { type: 'integer' },
              eventsPerSecond: { type: 'number' },
              eventTypes: { type: 'object' },
            },
          },
        },
      },
      AgentLifecycleEvent: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          agentId: { type: 'string' },
          eventType: { type: 'string' },
          eventData: { type: 'object' },
          level: { type: 'integer' },
          parentAgentId: { type: 'string', nullable: true },
          sessionId: { type: 'string' },
          tokensUsed: { type: 'integer' },
          performanceImpact: { type: 'object' },
        },
      },
      ResourceUtilization: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          cpu: { type: 'number' },
          memory: { type: 'number' },
          disk: { type: 'number' },
          tokensUsed: { type: 'integer' },
        },
      },
      HealthStatus: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'degraded', 'unhealthy'],
          },
          uptime: { type: 'number' },
          version: { type: 'string' },
          services: {
            type: 'object',
            properties: {
              transparencySystem: { type: 'string', enum: ['up', 'down'] },
              database: { type: 'string', enum: ['up', 'down'] },
              redis: { type: 'string', enum: ['up', 'down'] },
            },
          },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object' },
            },
          },
        },
      },
    },
    responses: {
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse',
            },
          },
        },
      },
      UnauthorizedError: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse',
            },
          },
        },
      },
      NotFoundError: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse',
            },
          },
        },
      },
      RateLimitError: {
        description: 'Rate limit exceeded',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse',
            },
          },
        },
      },
      InternalError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse',
            },
          },
        },
      },
    },
  },
};
