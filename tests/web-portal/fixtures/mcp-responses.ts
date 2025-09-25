/**
 * @file Mock MCP Response Fixtures
 * @description Mock responses for Claude Flow and ruv-swarm MCP commands
 */

export const mockMCPResponses = {
  // Claude Flow MCP Responses
  swarmInit: {
    success: {
      success: true,
      data: {
        swarmId: 'swarm-test-001',
        topology: 'hierarchical',
        maxAgents: 3,
        strategy: 'auto',
        timestamp: '2025-09-24T18:00:00.000Z',
        coordinationEndpoint: 'ws://localhost:8080/swarm-test-001',
        capabilities: ['task_orchestration', 'agent_coordination', 'memory_management']
      }
    },
    failure: {
      success: false,
      error: 'Invalid topology: invalid-topology',
      retryable: true,
      errorCode: 'INVALID_TOPOLOGY',
      timestamp: '2025-09-24T18:00:00.000Z'
    }
  },

  agentSpawn: {
    researcher: {
      success: true,
      data: {
        agentId: 'agent-researcher-001',
        type: 'researcher',
        name: 'Research Agent',
        status: 'active',
        capabilities: [
          'requirement_analysis',
          'technology_research',
          'security_assessment',
          'documentation_creation'
        ],
        performance: {
          tasksCompleted: 0,
          qualityScore: 0.85,
          averageTaskTime: 1800000 // 30 minutes
        },
        memoryAllocation: 256, // MB
        spawnTime: '2025-09-24T18:00:00.000Z'
      }
    },
    coder: {
      success: true,
      data: {
        agentId: 'agent-coder-001',
        type: 'coder',
        name: 'Code Agent',
        status: 'active',
        capabilities: [
          'code_generation',
          'api_development',
          'database_integration',
          'testing_implementation'
        ],
        performance: {
          tasksCompleted: 0,
          qualityScore: 0.88,
          averageTaskTime: 3600000 // 60 minutes
        },
        memoryAllocation: 512, // MB
        spawnTime: '2025-09-24T18:00:00.000Z'
      }
    },
    reviewer: {
      success: true,
      data: {
        agentId: 'agent-reviewer-001',
        type: 'reviewer',
        name: 'Review Agent',
        status: 'active',
        capabilities: [
          'code_review',
          'quality_assessment',
          'security_audit',
          'performance_analysis'
        ],
        performance: {
          tasksCompleted: 0,
          qualityScore: 0.92,
          averageTaskTime: 1200000 // 20 minutes
        },
        memoryAllocation: 256, // MB
        spawnTime: '2025-09-24T18:00:00.000Z'
      }
    }
  },

  taskOrchestrate: {
    success: {
      success: true,
      data: {
        taskId: 'task-orchestrate-001',
        title: 'Build authentication system',
        status: 'orchestrated',
        estimatedDuration: 7200000, // 2 hours
        assignedAgents: [
          {
            agentId: 'agent-researcher-001',
            phase: 'research',
            estimatedDuration: 1800000
          },
          {
            agentId: 'agent-coder-001',
            phase: 'implementation',
            estimatedDuration: 4200000
          },
          {
            agentId: 'agent-reviewer-001',
            phase: 'review',
            estimatedDuration: 1200000
          }
        ],
        dependencies: {
          'implementation': ['research'],
          'review': ['implementation']
        },
        orchestrationTime: '2025-09-24T18:00:00.000Z'
      }
    }
  },

  swarmStatus: {
    success: {
      success: true,
      data: {
        swarmId: 'swarm-test-001',
        status: 'active',
        totalAgents: 3,
        activeAgents: 3,
        currentTasks: 1,
        performance: {
          overallHealth: 0.9,
          coordinationEfficiency: 0.87,
          averageQuality: 0.88
        },
        agents: [
          {
            agentId: 'agent-researcher-001',
            status: 'active',
            currentTask: 'Authentication research',
            progress: 0.75
          },
          {
            agentId: 'agent-coder-001',
            status: 'active',
            currentTask: 'OAuth2 implementation',
            progress: 0.45
          },
          {
            agentId: 'agent-reviewer-001',
            status: 'idle',
            lastTask: 'Security review',
            progress: 1.0
          }
        ],
        timestamp: '2025-09-24T18:00:00.000Z'
      }
    }
  },

  // ruv-swarm MCP Responses
  ruvSwarm: {
    init: {
      success: {
        success: true,
        data: {
          swarmId: 'ruv-swarm-001',
          topology: 'mesh',
          maxAgents: 5,
          strategy: 'adaptive',
          capabilities: [
            'neural_patterns',
            'daa_agents',
            'cognitive_analysis',
            'meta_learning'
          ],
          neuralEngineStatus: 'initialized',
          timestamp: '2025-09-24T18:00:00.000Z'
        }
      }
    },

    neuralTrain: {
      success: {
        success: true,
        data: {
          trainingId: 'training-001',
          agentId: 'agent-researcher-001',
          pattern: 'convergent',
          iterations: 10,
          trainingMetrics: {
            accuracy: 0.94,
            convergenceRate: 0.87,
            learningRate: 0.15,
            finalLoss: 0.06
          },
          improvementAreas: [
            'Pattern recognition speed',
            'Decision confidence calibration'
          ],
          estimatedPerformanceGain: 0.12,
          trainingDuration: 45000 // 45 seconds
        }
      }
    },

    daaCreate: {
      success: {
        success: true,
        data: {
          agentId: 'daa-adaptive-001',
          type: 'daa_agent',
          cognitivePattern: 'adaptive',
          capabilities: ['code_analysis', 'pattern_recognition'],
          memoryEnabled: true,
          learningRate: 0.1,
          initialKnowledge: {
            domains: ['authentication', 'security'],
            confidenceLevels: { authentication: 0.7, security: 0.8 }
          },
          autonomyLevel: 0.6,
          creationTime: '2025-09-24T18:00:00.000Z'
        }
      }
    },

    daaAdapt: {
      success: {
        success: true,
        data: {
          agentId: 'daa-adaptive-001',
          adaptationId: 'adapt-001',
          feedback: 'Excellent pattern recognition in previous task',
          performanceScore: 0.92,
          adaptationMetrics: {
            learningRateAdjustment: 0.02,
            confidenceImprovement: 0.08,
            capabilityExpansion: ['advanced_pattern_matching'],
            autonomyIncrease: 0.05
          },
          newCapabilities: ['advanced_pattern_matching'],
          adaptationTime: '2025-09-24T18:00:00.000Z'
        }
      }
    },

    knowledgeShare: {
      success: {
        success: true,
        data: {
          transferId: 'transfer-001',
          sourceAgent: 'agent-researcher-001',
          targetAgents: ['agent-coder-001', 'agent-reviewer-001'],
          knowledgeDomain: 'authentication_patterns',
          transferredAgents: [
            {
              agentId: 'agent-coder-001',
              integrationSuccess: true,
              knowledgeCompatibility: 0.94,
              integrationTime: 2300
            },
            {
              agentId: 'agent-reviewer-001',
              integrationSuccess: true,
              knowledgeCompatibility: 0.91,
              integrationTime: 1800
            }
          ],
          knowledgeIntegration: {
            compatibility: 0.925,
            conflictResolution: 'automatic',
            newSynergies: ['cross_domain_validation', 'integrated_security_checks']
          },
          transferTime: '2025-09-24T18:00:00.000Z'
        }
      }
    }
  }
};

export const mockTaskData = {
  simpleTask: {
    id: 'task-simple-001',
    title: 'Create login endpoint',
    description: 'Build basic authentication endpoint',
    priority: 'medium',
    estimatedDuration: 3600000, // 1 hour
    requirements: [
      'Accept username and password',
      'Validate credentials',
      'Return JWT token on success',
      'Handle error cases'
    ]
  },

  complexTask: {
    id: 'task-complex-001',
    title: 'Implement OAuth2 authentication system',
    description: 'Complete OAuth2 integration with multiple providers',
    priority: 'high',
    estimatedDuration: 14400000, // 4 hours
    requirements: [
      'Support Google, GitHub, Microsoft providers',
      'Implement authorization code flow',
      'Handle token refresh',
      'Store user profile data',
      'Implement logout functionality'
    ],
    constraints: [
      'Must follow OAuth2 specification',
      'Secure token storage required',
      'Support mobile app integration'
    ]
  },

  iterativeTask: {
    id: 'task-iterative-001',
    title: 'Design and refine API architecture',
    description: 'Create API design with multiple review cycles',
    priority: 'high',
    maxIterations: 3,
    qualityThreshold: 0.9,
    phases: [
      'initial_design',
      'prototype_implementation',
      'stakeholder_review',
      'refinement',
      'final_implementation'
    ]
  }
};

export const mockAgentStates = {
  researcher: {
    id: 'agent-researcher-001',
    type: 'researcher',
    status: 'active',
    currentTask: 'OAuth2 research',
    progress: 0.65,
    capabilities: [
      'requirement_analysis',
      'technology_research',
      'security_assessment'
    ],
    knowledge: {
      domains: ['authentication', 'oauth2', 'security'],
      experience: {
        authentication_projects: 12,
        oauth2_implementations: 4,
        security_audits: 8
      }
    },
    performance: {
      tasksCompleted: 15,
      qualityScore: 0.89,
      averageTaskTime: 1920000, // 32 minutes
      collaborationScore: 0.91
    }
  },

  coder: {
    id: 'agent-coder-001',
    type: 'coder',
    status: 'active',
    currentTask: 'Authentication middleware',
    progress: 0.3,
    capabilities: [
      'code_generation',
      'api_development',
      'database_integration'
    ],
    knowledge: {
      domains: ['javascript', 'nodejs', 'express', 'passport'],
      experience: {
        api_projects: 25,
        authentication_systems: 8,
        middleware_development: 15
      }
    },
    performance: {
      tasksCompleted: 23,
      qualityScore: 0.87,
      averageTaskTime: 3840000, // 64 minutes
      collaborationScore: 0.85
    }
  },

  reviewer: {
    id: 'agent-reviewer-001',
    type: 'reviewer',
    status: 'idle',
    lastTask: 'Code security review',
    capabilities: [
      'code_review',
      'security_audit',
      'performance_analysis'
    ],
    knowledge: {
      domains: ['code_quality', 'security', 'performance', 'best_practices'],
      experience: {
        code_reviews: 89,
        security_audits: 23,
        performance_optimizations: 34
      }
    },
    performance: {
      tasksCompleted: 67,
      qualityScore: 0.94,
      averageTaskTime: 1440000, // 24 minutes
      collaborationScore: 0.88
    }
  }
};

export const mockPerformanceMetrics = {
  swarmOverall: {
    totalTasks: 45,
    completedTasks: 43,
    successRate: 0.956,
    averageQuality: 0.887,
    averageTaskTime: 2760000, // 46 minutes
    coordinationEfficiency: 0.89,
    handoffEfficiency: 0.92
  },

  agentSpecific: {
    'agent-researcher-001': {
      tasksCompleted: 15,
      averageQuality: 0.89,
      averageTime: 1920000,
      strengths: ['thorough_analysis', 'security_awareness'],
      improvementAreas: ['documentation_speed']
    },
    'agent-coder-001': {
      tasksCompleted: 23,
      averageQuality: 0.87,
      averageTime: 3840000,
      strengths: ['clean_code', 'api_design'],
      improvementAreas: ['error_handling', 'testing']
    },
    'agent-reviewer-001': {
      tasksCompleted: 67,
      averageQuality: 0.94,
      averageTime: 1440000,
      strengths: ['security_focus', 'performance_optimization'],
      improvementAreas: ['constructive_feedback']
    }
  },

  trends: {
    qualityTrend: [0.82, 0.84, 0.86, 0.88, 0.89], // Improving
    speedTrend: [3200000, 3100000, 2900000, 2800000, 2760000], // Getting faster
    coordinationTrend: [0.81, 0.84, 0.87, 0.88, 0.89] // Improving coordination
  },

  bottlenecks: [
    {
      type: 'agent_overload',
      agent: 'agent-coder-001',
      severity: 'medium',
      description: 'Implementation tasks taking 50% longer than expected',
      recommendation: 'Consider task breakdown or additional training'
    },
    {
      type: 'handoff_delay',
      from: 'researcher',
      to: 'coder',
      severity: 'low',
      description: 'Average handoff time of 8 minutes',
      recommendation: 'Standardize handoff format'
    }
  ]
};

export const mockTransparencyData = {
  decisions: [
    {
      id: 'decision-001',
      agentId: 'agent-researcher-001',
      timestamp: '2025-09-24T17:30:00.000Z',
      decision: 'Use OAuth2 for authentication',
      context: {
        taskId: 'auth-research-task',
        alternatives: ['Session-based', 'JWT', 'OAuth2', 'SAML'],
        constraints: ['Third-party integration', 'Scalability', 'Security']
      },
      reasoning: {
        factors: ['Industry standard', 'Flexible integration', 'Security proven'],
        confidence: 0.92,
        riskLevel: 'low'
      }
    }
  ],

  interventions: [
    {
      id: 'intervention-001',
      requestTime: '2025-09-24T17:45:00.000Z',
      responseTime: '2025-09-24T17:47:00.000Z',
      agentId: 'agent-coder-001',
      context: {
        decision: 'Choose password hashing algorithm',
        options: ['bcrypt', 'argon2', 'scrypt']
      },
      humanResponse: {
        decision: 'argon2',
        reasoning: 'Latest security recommendations favor Argon2',
        confidence: 0.85
      },
      impact: {
        taskDelay: 120000, // 2 minutes
        qualityImprovement: 0.15
      }
    }
  ],

  reasoningChains: [
    {
      id: 'chain-001',
      agentId: 'agent-researcher-001',
      taskId: 'oauth-research',
      steps: [
        {
          stepId: 'gather-requirements',
          type: 'information_gathering',
          duration: 300000, // 5 minutes
          confidence: 0.9
        },
        {
          stepId: 'analyze-options',
          type: 'option_evaluation',
          duration: 600000, // 10 minutes
          confidence: 0.85
        },
        {
          stepId: 'make-recommendation',
          type: 'decision_synthesis',
          duration: 180000, // 3 minutes
          confidence: 0.92
        }
      ]
    }
  ]
};

export const mockErrorScenarios = {
  networkTimeout: {
    type: 'network_error',
    message: 'Connection timeout',
    retryable: true,
    retryAfter: 5000
  },

  serviceUnavailable: {
    type: 'service_error',
    message: 'MCP service unavailable',
    retryable: false,
    fallbackRequired: true
  },

  authenticationFailure: {
    type: 'auth_error',
    message: 'Invalid authentication credentials',
    retryable: false,
    actionRequired: 'reauthenticate'
  },

  rateLimitExceeded: {
    type: 'rate_limit',
    message: 'Rate limit exceeded',
    retryable: true,
    retryAfter: 60000 // 1 minute
  },

  validationError: {
    type: 'validation_error',
    message: 'Invalid request parameters',
    retryable: false,
    details: {
      invalidFields: ['topology', 'maxAgents'],
      expectedValues: {
        topology: ['mesh', 'hierarchical', 'ring', 'star'],
        maxAgents: 'number between 1 and 100'
      }
    }
  }
};