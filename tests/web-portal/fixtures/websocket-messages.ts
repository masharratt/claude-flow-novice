/**
 * @file WebSocket Message Fixtures
 * @description Mock WebSocket messages for real-time communication testing
 */

export const mockWebSocketMessages = {
  // Agent Progress Messages
  agentProgress: {
    research: {
      type: 'agent_message',
      messageType: 'progress',
      agentId: 'agent-researcher-001',
      agentType: 'researcher',
      timestamp: '2025-09-24T18:00:00.000Z',
      content: 'Completed OAuth2 security analysis',
      data: {
        taskId: 'auth-research-001',
        phase: 'security_analysis',
        progress: 0.75,
        nextPhase: 'documentation',
        estimatedTimeRemaining: 900000, // 15 minutes
        deliverables: [
          'Security requirements document',
          'OAuth2 flow diagrams',
          'Risk assessment report'
        ]
      }
    },

    implementation: {
      type: 'agent_message',
      messageType: 'progress',
      agentId: 'agent-coder-001',
      agentType: 'coder',
      timestamp: '2025-09-24T18:00:00.000Z',
      content: 'Authentication middleware 60% complete',
      data: {
        taskId: 'auth-implementation-001',
        phase: 'middleware_development',
        progress: 0.6,
        completedFeatures: [
          'JWT token validation',
          'User session management',
          'OAuth2 callback handling'
        ],
        inProgress: [
          'Token refresh mechanism',
          'User profile integration'
        ],
        nextSteps: [
          'Error handling implementation',
          'Unit test creation'
        ],
        codeMetrics: {
          linesWritten: 420,
          functionsCreated: 15,
          testsWritten: 8
        }
      }
    },

    review: {
      type: 'agent_message',
      messageType: 'progress',
      agentId: 'agent-reviewer-001',
      agentType: 'reviewer',
      timestamp: '2025-09-24T18:00:00.000Z',
      content: 'Code review completed - 3 issues found',
      data: {
        taskId: 'auth-review-001',
        phase: 'code_review',
        progress: 1.0,
        reviewResults: {
          overallScore: 0.87,
          issues: [
            {
              type: 'security',
              severity: 'medium',
              description: 'Token expiration validation needed',
              file: 'middleware/auth.js',
              line: 45
            },
            {
              type: 'performance',
              severity: 'low',
              description: 'Database query optimization opportunity',
              file: 'services/user.js',
              line: 78
            },
            {
              type: 'testing',
              severity: 'medium',
              description: 'Missing edge case tests for token refresh',
              file: 'tests/auth.test.js',
              line: 120
            }
          ],
          recommendations: [
            'Add comprehensive token validation',
            'Implement database query caching',
            'Increase test coverage to >90%'
          ]
        }
      }
    }
  },

  // Agent Status Updates
  agentStatus: {
    active: {
      type: 'agent_status',
      agentId: 'agent-researcher-001',
      status: 'active',
      currentTask: 'OAuth2 provider research',
      progress: 0.4,
      timestamp: '2025-09-24T18:00:00.000Z',
      performance: {
        tasksCompleted: 12,
        averageQuality: 0.89,
        currentTaskStartTime: '2025-09-24T17:45:00.000Z'
      }
    },

    idle: {
      type: 'agent_status',
      agentId: 'agent-reviewer-001',
      status: 'idle',
      lastTask: 'Security audit completed',
      timestamp: '2025-09-24T18:00:00.000Z',
      availableForAssignment: true,
      capabilities: [
        'code_review',
        'security_audit',
        'performance_analysis'
      ]
    },

    error: {
      type: 'agent_status',
      agentId: 'agent-coder-001',
      status: 'error',
      currentTask: 'Database integration',
      error: {
        message: 'Database connection failed',
        code: 'DB_CONNECTION_ERROR',
        recoverable: true,
        retryAttempt: 2,
        maxRetries: 3
      },
      timestamp: '2025-09-24T18:00:00.000Z',
      recoveryAction: 'restart_database_connection'
    }
  },

  // Human Intervention Requests
  interventionRequests: {
    decision: {
      type: 'intervention_request',
      id: 'intervention-decision-001',
      priority: 'high',
      timeout: 300000, // 5 minutes
      agentId: 'agent-coder-001',
      context: {
        taskId: 'auth-implementation-001',
        decision: 'Choose database schema approach',
        description: 'Need to decide on user table structure for OAuth2 integration'
      },
      options: [
        {
          id: 'normalized',
          title: 'Normalized schema',
          description: 'Separate tables for users, OAuth providers, and tokens',
          pros: ['Better data integrity', 'Easier to maintain'],
          cons: ['More complex queries', 'Potential performance impact']
        },
        {
          id: 'denormalized',
          title: 'Denormalized schema',
          description: 'Single user table with JSON fields for OAuth data',
          pros: ['Simpler queries', 'Better performance'],
          cons: ['Less data integrity', 'Harder to query OAuth data']
        }
      ],
      defaultChoice: 'normalized',
      timestamp: '2025-09-24T18:00:00.000Z'
    },

    approval: {
      type: 'intervention_request',
      id: 'intervention-approval-001',
      priority: 'medium',
      timeout: 600000, // 10 minutes
      agentId: 'agent-reviewer-001',
      context: {
        taskId: 'auth-review-001',
        decision: 'Approve deployment to staging',
        description: 'Authentication system ready for staging deployment'
      },
      data: {
        testResults: {
          unitTests: { passed: 28, failed: 0, coverage: 0.92 },
          integrationTests: { passed: 12, failed: 1, coverage: 0.85 },
          securityTests: { passed: 15, failed: 0, coverage: 0.88 }
        },
        codeQuality: {
          overallScore: 0.89,
          maintainability: 0.91,
          reliability: 0.87,
          security: 0.93
        },
        performanceMetrics: {
          responseTime: 145, // ms
          throughput: 1200, // requests/min
          memoryUsage: 0.65 // 65% of allocated
        }
      },
      recommendedAction: 'approve',
      timestamp: '2025-09-24T18:00:00.000Z'
    },

    input: {
      type: 'intervention_request',
      id: 'intervention-input-001',
      priority: 'low',
      timeout: 900000, // 15 minutes
      agentId: 'agent-researcher-001',
      context: {
        taskId: 'oauth-config-001',
        decision: 'Provide OAuth2 client credentials',
        description: 'Need OAuth2 client ID and secret for Google integration'
      },
      inputFields: [
        {
          name: 'googleClientId',
          type: 'text',
          required: true,
          placeholder: 'Google OAuth2 Client ID',
          validation: {
            pattern: '^[0-9]+-[a-zA-Z0-9_]+\\.apps\\.googleusercontent\\.com$',
            message: 'Must be a valid Google Client ID format'
          }
        },
        {
          name: 'googleClientSecret',
          type: 'password',
          required: true,
          placeholder: 'Google OAuth2 Client Secret',
          validation: {
            minLength: 20,
            message: 'Client secret must be at least 20 characters'
          }
        },
        {
          name: 'environment',
          type: 'select',
          required: true,
          options: ['development', 'staging', 'production'],
          default: 'development'
        }
      ],
      timestamp: '2025-09-24T18:00:00.000Z'
    }
  },

  // Swarm Coordination Messages
  swarmCoordination: {
    taskHandoff: {
      type: 'swarm_coordination',
      messageType: 'task_handoff',
      swarmId: 'swarm-web-portal-001',
      timestamp: '2025-09-24T18:00:00.000Z',
      from: {
        agentId: 'agent-researcher-001',
        agentType: 'researcher',
        phase: 'research_complete'
      },
      to: {
        agentId: 'agent-coder-001',
        agentType: 'coder',
        phase: 'implementation_start'
      },
      handoffData: {
        taskId: 'auth-system-001',
        deliverables: [
          'OAuth2 requirements specification',
          'Security considerations document',
          'API endpoint definitions',
          'Database schema recommendations'
        ],
        qualityMetrics: {
          completeness: 0.95,
          clarity: 0.88,
          accuracy: 0.92,
          usefulness: 0.89
        },
        nextSteps: [
          'Implement OAuth2 middleware',
          'Create authentication routes',
          'Set up database models',
          'Write integration tests'
        ]
      }
    },

    swarmStatus: {
      type: 'swarm_coordination',
      messageType: 'swarm_status',
      swarmId: 'swarm-web-portal-001',
      timestamp: '2025-09-24T18:00:00.000Z',
      status: 'active',
      agents: {
        total: 3,
        active: 2,
        idle: 1,
        error: 0
      },
      currentTasks: [
        {
          taskId: 'auth-implementation-001',
          assignedAgent: 'agent-coder-001',
          phase: 'implementation',
          progress: 0.6,
          estimatedCompletion: '2025-09-24T19:30:00.000Z'
        }
      ],
      performance: {
        overallHealth: 0.91,
        coordinationEfficiency: 0.87,
        taskThroughput: 1.2 // tasks per hour
      }
    },

    relaunch: {
      type: 'swarm_coordination',
      messageType: 'swarm_relaunch',
      swarmId: 'swarm-web-portal-001',
      timestamp: '2025-09-24T18:00:00.000Z',
      reason: 'agent_performance_degradation',
      relaunchCount: 2,
      maxRelaunches: 10,
      affectedAgents: ['agent-coder-001'],
      preservedContext: {
        taskStates: true,
        agentMemories: true,
        workflowHistory: true
      },
      estimatedRecoveryTime: 120000, // 2 minutes
      status: 'in_progress'
    }
  },

  // System Events
  systemEvents: {
    error: {
      type: 'system_event',
      messageType: 'error',
      severity: 'high',
      timestamp: '2025-09-24T18:00:00.000Z',
      error: {
        code: 'MCP_CONNECTION_LOST',
        message: 'Lost connection to Claude Flow MCP service',
        component: 'mcp-integration',
        recoverable: true,
        retryAttempts: 3,
        fallbackAvailable: true
      },
      affectedSystems: ['swarm_coordination', 'task_orchestration'],
      recoveryActions: [
        'Attempting to reconnect to MCP service',
        'Switching to fallback coordination mode',
        'Preserving current task states'
      ]
    },

    warning: {
      type: 'system_event',
      messageType: 'warning',
      severity: 'medium',
      timestamp: '2025-09-24T18:00:00.000Z',
      warning: {
        code: 'HIGH_MEMORY_USAGE',
        message: 'Agent memory usage approaching 80% of allocated capacity',
        component: 'agent-coder-001',
        threshold: 0.8,
        current: 0.78,
        trend: 'increasing'
      },
      recommendedActions: [
        'Consider garbage collection',
        'Review memory allocation',
        'Monitor for memory leaks'
      ]
    },

    info: {
      type: 'system_event',
      messageType: 'info',
      severity: 'low',
      timestamp: '2025-09-24T18:00:00.000Z',
      info: {
        code: 'TASK_COMPLETED',
        message: 'Authentication system implementation completed successfully',
        component: 'swarm-web-portal-001',
        details: {
          taskId: 'auth-system-001',
          duration: 7320000, // 2 hours 2 minutes
          quality: 0.91,
          agentsInvolved: 3
        }
      }
    }
  },

  // Performance Metrics Updates
  performanceUpdates: {
    realTime: {
      type: 'performance_metrics',
      messageType: 'real_time_update',
      timestamp: '2025-09-24T18:00:00.000Z',
      swarmId: 'swarm-web-portal-001',
      metrics: {
        cpu: {
          'agent-researcher-001': 0.23,
          'agent-coder-001': 0.67,
          'agent-reviewer-001': 0.15
        },
        memory: {
          'agent-researcher-001': 0.45,
          'agent-coder-001': 0.78,
          'agent-reviewer-001': 0.32
        },
        throughput: {
          tasksCompleted: 15,
          averageTaskTime: 2760000, // 46 minutes
          quality: 0.88
        },
        coordination: {
          handoffTime: 4.2, // seconds
          successRate: 0.96,
          informationLoss: 0.03
        }
      }
    },

    summary: {
      type: 'performance_metrics',
      messageType: 'summary',
      timestamp: '2025-09-24T18:00:00.000Z',
      swarmId: 'swarm-web-portal-001',
      timeRange: 'last_24h',
      summary: {
        tasksCompleted: 45,
        successRate: 0.956,
        averageQuality: 0.887,
        totalWorkTime: 118800000, // 33 hours total work
        efficiency: 0.91,
        improvements: [
          'Quality increased by 5% compared to previous period',
          'Task completion time reduced by 8%',
          'Coordination efficiency up 3%'
        ]
      }
    }
  },

  // Filter Test Messages
  filterTests: {
    highPriority: {
      type: 'agent_message',
      messageType: 'error',
      priority: 'critical',
      agentId: 'agent-coder-001',
      content: 'Critical error in authentication system',
      timestamp: '2025-09-24T18:00:00.000Z'
    },

    lowPriority: {
      type: 'agent_message',
      messageType: 'debug',
      priority: 'low',
      agentId: 'agent-researcher-001',
      content: 'Debug: OAuth2 flow validation step completed',
      timestamp: '2025-09-24T18:00:00.000Z'
    },

    contentFiltered: {
      type: 'agent_message',
      messageType: 'info',
      agentId: 'agent-coder-001',
      content: 'Implementing security middleware with authentication features',
      tags: ['security', 'authentication', 'middleware'],
      timestamp: '2025-09-24T18:00:00.000Z'
    },

    contentExcluded: {
      type: 'agent_message',
      messageType: 'debug',
      agentId: 'agent-reviewer-001',
      content: 'Verbose debugging information about internal state',
      tags: ['debug', 'verbose', 'internal'],
      timestamp: '2025-09-24T18:00:00.000Z'
    }
  }
};