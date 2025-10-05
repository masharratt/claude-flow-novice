/**
 * @file Dashboard Test Fixtures
 * @description Comprehensive test fixtures and mock data for dashboard system testing
 */

import { mockTransparencyData } from './transparency-data';

// Mock agent data for dashboard testing
export const mockAgentData = {
  agents: [
    {
      id: 'agent-researcher-001',
      agentType: 'researcher',
      name: 'Research Agent Alpha',
      avatar: '🔬',
      status: 'active',
      performance: 87,
      coordinationScore: 92,
      efficiency: 89,
      tasksCompleted: 23,
      currentTask: {
        id: 'task-oauth-research',
        title: 'OAuth Provider Security Analysis',
        startTime: '2025-09-24T17:45:00.000Z',
        estimatedEndTime: '2025-09-24T18:15:00.000Z',
        progress: 0.67,
        currentPhase: 'security_assessment'
      },
      capabilities: {
        active: ['requirement_analysis', 'security_assessment', 'technology_research'],
        learning: ['oauth2_deep_dive', 'security_best_practices'],
        mastery: {
          requirement_analysis: 0.92,
          security_assessment: 0.88,
          technology_research: 0.85
        }
      },
      resources: {
        memoryUsage: 0.45,
        cpuUsage: 0.23,
        networkActivity: 0.12,
        storageUsage: 0.34
      },
      healthMetrics: {
        overall: 0.91,
        taskExecution: 0.89,
        resourceEfficiency: 0.93,
        collaborationEffectiveness: 0.91,
        learningProgression: 0.87
      },
      recentActivity: [
        {
          timestamp: '2025-09-24T17:55:00.000Z',
          action: 'completed_task',
          details: 'OAuth provider comparison matrix'
        },
        {
          timestamp: '2025-09-24T17:50:00.000Z',
          action: 'started_task',
          details: 'Security vulnerability assessment'
        }
      ]
    },
    {
      id: 'agent-coder-001',
      agentType: 'coder',
      name: 'Coder Agent Beta',
      avatar: '💻',
      status: 'processing',
      performance: 94,
      coordinationScore: 88,
      efficiency: 96,
      tasksCompleted: 31,
      currentTask: {
        id: 'task-auth-middleware',
        title: 'Authentication Middleware Development',
        startTime: '2025-09-24T16:30:00.000Z',
        estimatedEndTime: '2025-09-24T18:00:00.000Z',
        actualProgress: 0.65,
        expectedProgress: 0.85,
        progressGap: -0.20,
        issues: [
          'Database connection intermittent failures',
          'OAuth callback URL configuration issues'
        ]
      },
      capabilities: {
        active: ['typescript', 'nodejs', 'express', 'security_implementation'],
        learning: ['performance_optimization', 'database_design'],
        mastery: {
          typescript: 0.95,
          nodejs: 0.92,
          express: 0.88,
          security_implementation: 0.85
        }
      },
      resources: {
        memoryUsage: 0.67,
        cpuUsage: 0.45,
        networkActivity: 0.08,
        storageUsage: 0.72
      },
      healthMetrics: {
        overall: 0.82,
        taskExecution: 0.79,
        resourceEfficiency: 0.68,
        collaborationEffectiveness: 0.89,
        learningProgression: 0.94
      },
      recentActivity: [
        {
          timestamp: '2025-09-24T17:52:00.000Z',
          action: 'error_occurred',
          details: 'Database connection timeout'
        },
        {
          timestamp: '2025-09-24T17:45:00.000Z',
          action: 'pushed_code',
          details: 'Authentication service v0.2'
        }
      ]
    },
    {
      id: 'agent-reviewer-001',
      agentType: 'reviewer',
      name: 'Reviewer Agent Gamma',
      avatar: '🔍',
      status: 'idle',
      performance: 91,
      coordinationScore: 95,
      efficiency: 85,
      tasksCompleted: 18,
      lastTask: {
        id: 'task-code-review-001',
        title: 'Authentication Service Code Review',
        completedAt: '2025-09-24T17:30:00.000Z',
        quality: 0.94,
        issues: [
          'Add input validation for OAuth callbacks',
          'Improve error handling in token refresh flow'
        ],
        approved: true
      },
      capabilities: {
        active: ['code_review', 'security_audit', 'quality_assurance'],
        learning: ['performance_analysis', 'architecture_review'],
        mastery: {
          code_review: 0.96,
          security_audit: 0.93,
          quality_assurance: 0.89
        }
      },
      resources: {
        memoryUsage: 0.23,
        cpuUsage: 0.12,
        networkActivity: 0.05,
        storageUsage: 0.18
      },
      healthMetrics: {
        overall: 0.93,
        taskExecution: 0.96,
        resourceEfficiency: 0.95,
        collaborationEffectiveness: 0.92,
        learningProgression: 0.88
      },
      recentActivity: [
        {
          timestamp: '2025-09-24T17:30:00.000Z',
          action: 'completed_review',
          details: 'Approved authentication service with minor suggestions'
        },
        {
          timestamp: '2025-09-24T17:15:00.000Z',
          action: 'started_review',
          details: 'Security-focused code review'
        }
      ]
    }
  ]
};

// Mock swarm metrics for dashboard testing
export const mockSwarmMetrics = {
  current: {
    timestamp: '2025-09-24T18:00:00.000Z',
    totalTasks: 72,
    completedTasks: 68,
    failedTasks: 2,
    activeTasks: 2,
    efficiency: 89.4,
    coordinationScore: 91.7,
    uptime: 98.2,
    throughput: 2.3,
    errorRate: 1.2,
    responseTime: 245,
    swarmId: 'swarm-web-portal-001',
    agentsByStatus: {
      active: 1,
      idle: 1,
      processing: 1,
      error: 0
    },
    agentsByType: {
      researcher: 1,
      coder: 1,
      reviewer: 1
    }
  },
  trends: {
    efficiency: [
      { timestamp: '2025-09-24T17:00:00.000Z', value: 85.2 },
      { timestamp: '2025-09-24T17:30:00.000Z', value: 87.8 },
      { timestamp: '2025-09-24T18:00:00.000Z', value: 89.4 }
    ],
    coordinationScore: [
      { timestamp: '2025-09-24T17:00:00.000Z', value: 89.1 },
      { timestamp: '2025-09-24T17:30:00.000Z', value: 90.4 },
      { timestamp: '2025-09-24T18:00:00.000Z', value: 91.7 }
    ],
    throughput: [
      { timestamp: '2025-09-24T17:00:00.000Z', value: 2.1 },
      { timestamp: '2025-09-24T17:30:00.000Z', value: 2.2 },
      { timestamp: '2025-09-24T18:00:00.000Z', value: 2.3 }
    ],
    errorRate: [
      { timestamp: '2025-09-24T17:00:00.000Z', value: 1.8 },
      { timestamp: '2025-09-24T17:30:00.000Z', value: 1.5 },
      { timestamp: '2025-09-24T18:00:00.000Z', value: 1.2 }
    ],
    responseTime: [
      { timestamp: '2025-09-24T17:00:00.000Z', value: 280 },
      { timestamp: '2025-09-24T17:30:00.000Z', value: 265 },
      { timestamp: '2025-09-24T18:00:00.000Z', value: 245 }
    ]
  },
  historical: {
    daily: [
      {
        date: '2025-09-24',
        efficiency: 89.4,
        coordinationScore: 91.7,
        throughput: 2.3,
        tasksCompleted: 68,
        errorRate: 1.2
      },
      {
        date: '2025-09-23',
        efficiency: 87.2,
        coordinationScore: 89.8,
        throughput: 2.1,
        tasksCompleted: 62,
        errorRate: 1.8
      },
      {
        date: '2025-09-22',
        efficiency: 85.6,
        coordinationScore: 88.3,
        throughput: 1.9,
        tasksCompleted: 58,
        errorRate: 2.1
      }
    ]
  }
};

// Mock message flow data for dashboard testing
export const mockMessageFlow = {
  recent: [
    {
      id: 'msg-001',
      from: 'agent-researcher-001',
      to: 'agent-coder-001',
      type: 'coordination',
      content: 'OAuth provider security requirements finalized',
      timestamp: '2025-09-24T17:58:00.000Z',
      priority: 'high',
      metadata: {
        relatedTask: 'task-oauth-research',
        context: 'security_requirements'
      }
    },
    {
      id: 'msg-002',
      from: 'agent-coder-001',
      to: 'agent-reviewer-001',
      type: 'status',
      content: 'Authentication middleware ready for review',
      timestamp: '2025-09-24T17:55:00.000Z',
      priority: 'medium',
      metadata: {
        relatedTask: 'task-auth-middleware',
        artifacts: ['auth-service-v0.2', 'test-results']
      }
    },
    {
      id: 'msg-003',
      from: 'agent-reviewer-001',
      to: 'agent-coder-001',
      type: 'feedback',
      content: 'Review complete: 2 minor issues found',
      timestamp: '2025-09-24T17:45:00.000Z',
      priority: 'medium',
      metadata: {
        reviewId: 'review-001',
        issuesCount: 2,
        approved: true
      }
    },
    {
      id: 'msg-004',
      from: 'agent-coder-001',
      to: 'system',
      type: 'error',
      content: 'Database connection failed during OAuth implementation',
      timestamp: '2025-09-24T17:42:00.000Z',
      priority: 'high',
      metadata: {
        errorType: 'database_connection',
        retryCount: 3,
        resolved: false
      }
    },
    {
      id: 'msg-005',
      from: 'agent-researcher-001',
      to: 'agent-coder-001',
      type: 'data',
      content: 'OAuth provider configuration matrix attached',
      timestamp: '2025-09-24T17:40:00.000Z',
      priority: 'medium',
      metadata: {
        attachment: 'oauth-config-matrix.json',
        size: '2.3KB'
      }
    }
  ],
  statistics: {
    totalMessages: 156,
    messagesByType: {
      coordination: 45,
      status: 38,
      feedback: 32,
      data: 25,
      error: 16
    },
    messagesByPriority: {
      high: 42,
      medium: 78,
      low: 36
    },
    averageResponseTime: 32000, // 32 seconds
    mostActivePair: {
      from: 'agent-researcher-001',
      to: 'agent-coder-001',
      messageCount: 28
    }
  }
};

// Mock test status data for dashboard testing
export const mockTestStatus = {
  current: {
    timestamp: '2025-09-24T18:00:00.000Z',
    suites: {
      unit: {
        total: 145,
        passed: 142,
        failed: 2,
        skipped: 1,
        coverage: 87.5,
        averageDuration: 2.3,
        lastRun: '2025-09-24T17:55:00.000Z',
        status: 'passed'
      },
      integration: {
        total: 68,
        passed: 65,
        failed: 3,
        skipped: 0,
        coverage: 82.1,
        averageDuration: 5.8,
        lastRun: '2025-09-24T17:45:00.000Z',
        status: 'failed'
      },
      e2e: {
        total: 24,
        passed: 22,
        failed: 2,
        skipped: 0,
        coverage: 71.3,
        averageDuration: 45.2,
        lastRun: '2025-09-24T17:30:00.000Z',
        status: 'failed'
      }
    },
    overall: {
      total: 237,
      passed: 229,
      failed: 7,
      skipped: 1,
      overallCoverage: 83.6,
      successRate: 96.6,
      lastRun: '2025-09-24T17:55:00.000Z'
    }
  },
  recentRuns: [
    {
      timestamp: '2025-09-24T17:55:00.000Z',
      suite: 'unit',
      status: 'passed',
      duration: 320,
      coverage: 87.5,
      passed: 142,
      failed: 2,
      buildId: 'build-abc123'
    },
    {
      timestamp: '2025-09-24T17:45:00.000Z',
      suite: 'integration',
      status: 'failed',
      duration: 850,
      coverage: 82.1,
      passed: 65,
      failed: 3,
      buildId: 'build-def456'
    },
    {
      timestamp: '2025-09-24T17:30:00.000Z',
      suite: 'e2e',
      status: 'failed',
      duration: 2450,
      coverage: 71.3,
      passed: 22,
      failed: 2,
      buildId: 'build-ghi789'
    }
  ],
  failingTests: [
    {
      suite: 'integration',
      testName: 'OAuth provider integration',
      error: 'Connection timeout during provider authentication',
      flaky: true,
      lastFailure: '2025-09-24T17:45:00.000Z'
    },
    {
      suite: 'e2e',
      testName: 'User registration flow',
      error: 'Element not found: #registration-form',
      flaky: false,
      lastFailure: '2025-09-24T17:30:00.000Z'
    }
  ],
  coverage: {
    byFile: {
      'src/auth/oauth.service.ts': 94.2,
      'src/auth/middleware.ts': 87.1,
      'src/user/user.service.ts': 91.5,
      'src/utils/encryption.ts': 78.3
    },
    trends: [
      { date: '2025-09-22', coverage: 81.2 },
      { date: '2025-09-23', coverage: 82.8 },
      { date: '2025-09-24', coverage: 83.6 }
    ]
  }
};

// Mock WebSocket events for dashboard testing
export const mockWebSocketEvents = {
  agentUpdates: [
    {
      type: 'agent_update',
      agentId: 'agent-coder-001',
      updates: {
        performance: 96,
        status: 'active',
        currentTask: 'OAuth implementation complete',
        progress: 1.0
      },
      timestamp: '2025-09-24T18:05:00.000Z'
    },
    {
      type: 'agent_update',
      agentId: 'agent-researcher-001',
      updates: {
        performance: 89,
        currentTask: 'Security documentation generation',
        progress: 0.3
      },
      timestamp: '2025-09-24T18:03:00.000Z'
    }
  ],
  metricsUpdates: [
    {
      type: 'metrics_update',
      metrics: {
        efficiency: 90.2,
        coordinationScore: 92.1,
        throughput: 2.5,
        errorRate: 0.8
      },
      timestamp: '2025-09-24T18:02:00.000Z'
    }
  ],
  newMessages: [
    {
      type: 'new_message',
      message: {
        id: 'msg-006',
        from: 'agent-coder-001',
        to: 'agent-reviewer-001',
        type: 'coordination',
        content: 'OAuth implementation ready for final review',
        timestamp: '2025-09-24T18:01:00.000Z',
        priority: 'high'
      }
    }
  ],
  decisionInsights: [
    {
      type: 'decision_insight',
      insight: {
        id: 'insight-002',
        agentId: 'agent-coder-001',
        decision: 'Use bcrypt with cost factor 12 for password hashing',
        reasoning: 'Optimal balance between security and performance',
        confidence: 0.89,
        impact: 'medium',
        timestamp: '2025-09-24T18:00:00.000Z'
      }
    }
  ],
  swarmRelaunches: [
    {
      type: 'swarm_relaunch',
      relaunch: {
        id: 'relaunch-002',
        timestamp: '2025-09-24T17:50:00.000Z',
        reason: 'Performance optimization',
        duration: 1800,
        success: true,
        previousMetrics: {
          efficiency: 85.2,
          coordinationScore: 87.8
        },
        newMetrics: {
          efficiency: 89.4,
          coordinationScore: 91.7
        }
      }
    }
  ]
};

// Mock performance metrics for dashboard testing
export const mockPerformanceMetrics = {
  current: {
    timestamp: '2025-09-24T18:00:00.000Z',
    system: {
      cpuUsage: 45.2,
      memoryUsage: 68.7,
      diskUsage: 32.1,
      networkIO: {
        inbound: 1.2,
        outbound: 3.8
      }
    },
    application: {
      responseTime: {
        p50: 145,
        p95: 280,
        p99: 420
      },
      throughput: 1200,
      errorRate: 0.001,
      activeConnections: 15,
      queuedRequests: 3
    },
    database: {
      connectionPool: {
        active: 8,
        idle: 12,
        total: 20
      },
      queryTime: {
        average: 45,
        p95: 120
      },
      operations: {
        reads: 2450,
        writes: 890,
        errors: 2
      }
    }
  },
  alerts: [
    {
      type: 'warning',
      metric: 'memoryUsage',
      value: 68.7,
      threshold: 70,
      message: 'Memory usage approaching threshold',
      timestamp: '2025-09-24T17:55:00.000Z'
    },
    {
      type: 'info',
      metric: 'throughput',
      value: 1200,
      threshold: 1000,
      message: 'Throughput exceeded expected baseline',
      timestamp: '2025-09-24T17:50:00.000Z'
    }
  ]
};

// Mock UI state for dashboard testing
export const mockUIState = {
  filters: {
    agentTypes: ['researcher', 'coder', 'reviewer'],
    statuses: ['active', 'idle', 'processing'],
    priorities: ['high', 'medium', 'low'],
    timeRange: '1h'
  },
  preferences: {
    refreshInterval: 5000,
    autoRefresh: true,
    theme: 'light',
    compactView: false,
    showNotifications: true
  },
  layout: {
    panels: {
      agentStatus: { visible: true, order: 1 },
      swarmMetrics: { visible: true, order: 2 },
      messageFlow: { visible: true, order: 3 },
      decisionInsights: { visible: true, order: 4 },
      swarmControls: { visible: true, order: 5 },
      testStatus: { visible: true, order: 6 }
    },
    gridColumns: 3,
    sidebarCollapsed: false
  }
};

// Mock error scenarios for dashboard testing
export const mockErrorScenarios = {
  websocket: {
    disconnection: {
      type: 'websocket_disconnected',
      message: 'WebSocket connection lost',
      timestamp: '2025-09-24T18:00:00.000Z',
      canReconnect: true,
      reconnectAttempts: 0
    },
    connectionFailure: {
      type: 'websocket_connection_failed',
      message: 'Failed to establish WebSocket connection',
      timestamp: '2025-09-24T18:00:00.000Z',
      error: 'ECONNREFUSED',
      canReconnect: true
    }
  },
  api: {
    rateLimit: {
      type: 'api_rate_limit',
      message: 'API rate limit exceeded',
      timestamp: '2025-09-24T18:00:00.000Z',
      retryAfter: 60,
      endpoint: '/api/agents'
    },
    serverError: {
      type: 'api_server_error',
      message: 'Internal server error',
      timestamp: '2025-09-24T18:00:00.000Z',
      statusCode: 500,
      endpoint: '/api/swarm/metrics'
    }
  },
  agent: {
    failure: {
      type: 'agent_failure',
      agentId: 'agent-coder-001',
      message: 'Agent process terminated unexpectedly',
      timestamp: '2025-09-24T18:00:00.000Z',
      canRestart: true,
      lastKnownState: 'processing'
    },
    timeout: {
      type: 'agent_timeout',
      agentId: 'agent-researcher-001',
      message: 'Agent task execution timeout',
      timestamp: '2025-09-24T18:00:00.000Z',
      task: 'OAuth provider analysis',
      timeoutDuration: 300000
    }
  }
};

// Helper functions for generating dynamic test data
export class DashboardTestDataGenerator {
  static generateAgentUpdates(count: number = 5) {
    return Array.from({ length: count }, (_, index) => ({
      type: 'agent_update',
      agentId: `agent-${index + 1}`,
      updates: {
        performance: 80 + Math.random() * 20,
        status: ['active', 'idle', 'processing'][Math.floor(Math.random() * 3)],
        currentTask: `Task ${index + 1}`,
        progress: Math.random()
      },
      timestamp: new Date(Date.now() - Math.random() * 60000).toISOString()
    }));
  }

  static generateMessages(count: number = 10) {
    return Array.from({ length: count }, (_, index) => ({
      type: 'new_message',
      message: {
        id: `msg-${index + 1}`,
        from: `agent-${Math.floor(Math.random() * 3) + 1}`,
        to: `agent-${Math.floor(Math.random() * 3) + 1}`,
        type: ['coordination', 'status', 'feedback', 'data'][Math.floor(Math.random() * 4)],
        content: `Test message ${index + 1}`,
        timestamp: new Date(Date.now() - Math.random() * 300000).toISOString(),
        priority: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)]
      }
    }));
  }

  static generateMetricsHistory(hours: number = 24) {
    return Array.from({ length: hours }, (_, index) => {
      const timestamp = new Date(Date.now() - (hours - index) * 3600000);
      return {
        timestamp: timestamp.toISOString(),
        efficiency: 85 + Math.random() * 10,
        coordinationScore: 88 + Math.random() * 8,
        throughput: 2.0 + Math.random() * 1.0,
        errorRate: Math.random() * 2.0,
        responseTime: 200 + Math.random() * 100
      };
    });
  }

  static generateDecisionInsights(count: number = 3) {
    return Array.from({ length: count }, (_, index) => ({
      type: 'decision_insight',
      insight: {
        id: `insight-${index + 1}`,
        agentId: `agent-${Math.floor(Math.random() * 3) + 1}`,
        decision: `Decision ${index + 1}`,
        reasoning: `Reasoning for decision ${index + 1}`,
        confidence: 0.7 + Math.random() * 0.3,
        impact: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString()
      }
    }));
  }

  static generateRelaunchHistory(count: number = 5) {
    return Array.from({ length: count }, (_, index) => ({
      type: 'swarm_relaunch',
      relaunch: {
        id: `relaunch-${index + 1}`,
        timestamp: new Date(Date.now() - index * 3600000).toISOString(),
        reason: ['Performance optimization', 'Error recovery', 'Manual restart', 'Configuration update'][Math.floor(Math.random() * 4)],
        duration: 1000 + Math.random() * 2000,
        success: Math.random() > 0.2
      }
    }));
  }
}

// Export all fixtures as a single object for easy importing
export const dashboardFixtures = {
  agentData: mockAgentData,
  swarmMetrics: mockSwarmMetrics,
  messageFlow: mockMessageFlow,
  testStatus: mockTestStatus,
  webSocketEvents: mockWebSocketEvents,
  performanceMetrics: mockPerformanceMetrics,
  uiState: mockUIState,
  errorScenarios: mockErrorScenarios,
  transparencyData: mockTransparencyData,
  generator: DashboardTestDataGenerator
};