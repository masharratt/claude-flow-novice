/**
 * @file Swarm Data Fixtures
 * @description Mock data for swarm coordination testing including task data, handoffs, and metrics
 */

export const mockSwarmData = {
  // Valid handoff data for testing successful transfers
  validHandoffData: {
    taskId: 'task-handoff-valid-001',
    fromAgent: 'agent-researcher-001',
    toAgent: 'agent-coder-001',
    timestamp: '2025-09-24T18:00:00.000Z',
    deliverables: {
      requirements: {
        functional: [
          'User must be able to register with email and password',
          'Users can log in using OAuth2 providers (Google, GitHub, Microsoft)',
          'Password reset functionality via email',
          'Session management with automatic timeout',
          'Multi-factor authentication for enhanced security'
        ],
        nonFunctional: [
          'System must support 1000 concurrent authenticated users',
          'Authentication response time must be under 200ms',
          'All user data must be encrypted at rest and in transit',
          'System must be available 99.9% of the time',
          'Compliance with GDPR and CCPA privacy regulations'
        ],
        constraints: [
          'Must integrate with existing PostgreSQL database',
          'OAuth2 implementation must follow RFC 6749 specification',
          'Password policies must meet organizational security standards',
          'System must be containerized for deployment flexibility'
        ]
      },
      technologyRecommendations: {
        backend: {
          framework: 'Express.js',
          authentication: 'Passport.js',
          reasoning: 'Mature ecosystem with extensive OAuth2 provider support',
          alternatives: ['Fastify', 'Koa.js'],
          rejectionReason: 'Express.js provides better middleware compatibility'
        },
        database: {
          primary: 'PostgreSQL',
          orm: 'Sequelize',
          reasoning: 'JSON support for OAuth provider data and strong ACID properties',
          migrationStrategy: 'Use existing PostgreSQL instance with new auth schema'
        },
        authentication: {
          strategy: 'JWT + OAuth2',
          tokenExpiry: '15 minutes access token, 7 days refresh token',
          providers: ['Google', 'GitHub', 'Microsoft'],
          reasoning: 'Balances security with user experience'
        },
        security: {
          passwordHashing: 'Argon2id',
          sessionManagement: 'Stateless JWT with refresh tokens',
          encryption: 'AES-256-GCM for sensitive data',
          rateLimiting: 'Redis-based with sliding window'
        }
      },
      securityConsiderations: [
        {
          category: 'Authentication',
          requirements: [
            'Implement proper OAuth2 state parameter validation',
            'Use PKCE for public clients (mobile apps)',
            'Implement account lockout after 5 failed attempts',
            'Require secure password complexity (12+ chars, mixed case, numbers, symbols)'
          ],
          threats: ['Credential stuffing', 'OAuth2 flow manipulation', 'Session hijacking'],
          mitigations: ['Rate limiting', 'CSRF tokens', 'Secure cookie settings']
        },
        {
          category: 'Data Protection',
          requirements: [
            'Encrypt all PII data at rest using AES-256',
            'Use TLS 1.3 for all data in transit',
            'Implement proper key management and rotation',
            'Ensure database connections use SSL'
          ],
          compliance: ['GDPR Article 32 - Security of processing', 'CCPA security requirements']
        },
        {
          category: 'Infrastructure',
          requirements: [
            'Deploy with principle of least privilege',
            'Implement network segmentation',
            'Use secrets management for sensitive configuration',
            'Enable comprehensive audit logging'
          ]
        }
      ],
      apiSpecification: {
        baseUrl: '/api/v1/auth',
        endpoints: [
          {
            path: '/register',
            method: 'POST',
            description: 'Register new user account',
            security: 'public',
            rateLimit: '10 requests per minute per IP',
            requestBody: {
              email: 'string (required, valid email)',
              password: 'string (required, min 12 chars)',
              firstName: 'string (required)',
              lastName: 'string (required)'
            },
            responses: {
              201: 'User created successfully',
              400: 'Invalid input data',
              409: 'Email already exists',
              429: 'Rate limit exceeded'
            }
          },
          {
            path: '/login',
            method: 'POST',
            description: 'Authenticate user credentials',
            security: 'public',
            rateLimit: '20 requests per minute per IP',
            requestBody: {
              email: 'string (required)',
              password: 'string (required)'
            },
            responses: {
              200: 'Authentication successful (returns JWT tokens)',
              401: 'Invalid credentials',
              423: 'Account locked due to failed attempts',
              429: 'Rate limit exceeded'
            }
          },
          {
            path: '/oauth/{provider}',
            method: 'GET',
            description: 'Initiate OAuth2 flow',
            security: 'public',
            parameters: {
              provider: 'string (google|github|microsoft)'
            },
            responses: {
              302: 'Redirect to OAuth2 provider',
              400: 'Invalid provider'
            }
          },
          {
            path: '/oauth/{provider}/callback',
            method: 'GET',
            description: 'Handle OAuth2 callback',
            security: 'public',
            parameters: {
              provider: 'string (google|github|microsoft)',
              code: 'string (authorization code)',
              state: 'string (CSRF protection)'
            },
            responses: {
              302: 'Redirect to application with tokens',
              400: 'Invalid callback parameters',
              401: 'OAuth2 authorization failed'
            }
          },
          {
            path: '/refresh',
            method: 'POST',
            description: 'Refresh access token',
            security: 'refresh_token',
            requestBody: {
              refreshToken: 'string (required)'
            },
            responses: {
              200: 'New access token issued',
              401: 'Invalid or expired refresh token'
            }
          },
          {
            path: '/logout',
            method: 'POST',
            description: 'Logout and invalidate tokens',
            security: 'authenticated',
            responses: {
              200: 'Successfully logged out',
              401: 'Not authenticated'
            }
          },
          {
            path: '/profile',
            method: 'GET',
            description: 'Get user profile information',
            security: 'authenticated',
            responses: {
              200: 'User profile data',
              401: 'Not authenticated'
            }
          }
        ],
        authentication: {
          bearer: 'JWT access token in Authorization header',
          refreshToken: 'Secure HTTP-only cookie or request body'
        },
        errorFormat: {
          error: 'string (error code)',
          message: 'string (human-readable message)',
          details: 'object (additional error context)',
          timestamp: 'ISO 8601 datetime string'
        }
      },
      databaseSchema: {
        tables: [
          {
            name: 'users',
            columns: [
              'id (UUID, primary key)',
              'email (varchar, unique, not null)',
              'password_hash (varchar, nullable for OAuth-only users)',
              'first_name (varchar, not null)',
              'last_name (varchar, not null)',
              'email_verified (boolean, default false)',
              'account_locked (boolean, default false)',
              'failed_login_attempts (integer, default 0)',
              'last_login_at (timestamp)',
              'created_at (timestamp)',
              'updated_at (timestamp)'
            ]
          },
          {
            name: 'oauth_providers',
            columns: [
              'id (UUID, primary key)',
              'user_id (UUID, foreign key to users.id)',
              'provider (varchar, not null)', // google, github, microsoft
              'provider_user_id (varchar, not null)',
              'provider_email (varchar)',
              'provider_data (jsonb)', // Store provider-specific data
              'created_at (timestamp)',
              'updated_at (timestamp)'
            ],
            indexes: [
              'unique index on (provider, provider_user_id)',
              'index on user_id'
            ]
          },
          {
            name: 'refresh_tokens',
            columns: [
              'id (UUID, primary key)',
              'user_id (UUID, foreign key to users.id)',
              'token_hash (varchar, unique)',
              'expires_at (timestamp)',
              'created_at (timestamp)',
              'revoked_at (timestamp, nullable)'
            ],
            indexes: [
              'index on user_id',
              'index on expires_at'
            ]
          }
        ]
      }
    },
    metadata: {
      confidence: 0.94,
      completeness: 0.96,
      researchSources: 15,
      timeSpent: 2100000, // 35 minutes
      reviewedBy: ['security team', 'senior developer'],
      validationChecks: [
        'OAuth2 RFC compliance verified',
        'Security requirements reviewed',
        'API design patterns validated',
        'Database normalization checked'
      ]
    }
  },

  // Medium complexity handoff data
  mediumHandoffData: {
    taskId: 'task-medium-001',
    deliverables: {
      requirements: ['User authentication', 'OAuth2 integration', 'Password reset'],
      architecture: {
        components: ['auth-service', 'user-service'],
        communication: 'REST API',
        dataStorage: 'PostgreSQL'
      },
      implementation: {
        framework: 'Express.js',
        libraries: ['passport', 'jsonwebtoken', 'bcrypt'],
        structure: {
          routes: ['/auth/login', '/auth/register', '/auth/oauth'],
          middleware: ['authentication', 'authorization', 'rate-limiting'],
          models: ['User', 'OAuthProvider', 'RefreshToken']
        }
      }
    },
    metadata: {
      confidence: 0.88,
      completeness: 0.91,
      timeSpent: 1800000 // 30 minutes
    }
  },

  // Large/complex handoff data
  largeHandoffData: {
    taskId: 'task-large-001',
    deliverables: {
      requirements: {
        functional: Array.from({ length: 25 }, (_, i) => `Functional requirement ${i + 1}`),
        nonFunctional: Array.from({ length: 15 }, (_, i) => `Non-functional requirement ${i + 1}`),
        constraints: Array.from({ length: 10 }, (_, i) => `Constraint ${i + 1}`)
      },
      architecture: {
        microservices: [
          'auth-service', 'user-service', 'notification-service',
          'audit-service', 'gateway-service'
        ],
        databases: ['PostgreSQL', 'Redis', 'Elasticsearch'],
        messaging: 'RabbitMQ',
        deployment: 'Kubernetes',
        monitoring: 'Prometheus + Grafana'
      },
      implementation: {
        codeStructure: {
          services: Array.from({ length: 5 }, (_, i) => ({
            name: `service-${i + 1}`,
            endpoints: Array.from({ length: 8 }, (_, j) => `/api/v1/endpoint-${j + 1}`),
            models: Array.from({ length: 6 }, (_, k) => `Model${k + 1}`)
          }))
        },
        dependencies: Array.from({ length: 20 }, (_, i) => `dependency-${i + 1}`),
        configurations: {
          environment: 'Multi-environment configuration',
          secrets: 'HashiCorp Vault integration',
          logging: 'Structured logging with correlation IDs'
        }
      },
      testing: {
        unitTests: Array.from({ length: 50 }, (_, i) => `unit-test-${i + 1}`),
        integrationTests: Array.from({ length: 25 }, (_, i) => `integration-test-${i + 1}`),
        e2eTests: Array.from({ length: 15 }, (_, i) => `e2e-test-${i + 1}`)
      },
      documentation: {
        apiDocs: 'OpenAPI 3.0 specification with examples',
        architectureDocs: 'C4 model diagrams and ADRs',
        deploymentDocs: 'Kubernetes manifests and Helm charts',
        operationalDocs: 'Runbooks and troubleshooting guides'
      }
    },
    metadata: {
      confidence: 0.91,
      completeness: 0.93,
      timeSpent: 4200000, // 70 minutes
      dataSize: '2.3 MB'
    }
  },

  // Task workflow examples
  taskWorkflows: {
    simple: {
      id: 'workflow-simple-001',
      title: 'Basic authentication endpoint',
      description: 'Create simple login/logout functionality',
      phases: [
        {
          name: 'research',
          agent: 'researcher',
          estimatedDuration: 900000, // 15 minutes
          deliverables: ['authentication_patterns', 'security_requirements'],
          dependencies: []
        },
        {
          name: 'implementation',
          agent: 'coder',
          estimatedDuration: 2400000, // 40 minutes
          deliverables: ['login_endpoint', 'logout_endpoint', 'middleware'],
          dependencies: ['research']
        },
        {
          name: 'review',
          agent: 'reviewer',
          estimatedDuration: 600000, // 10 minutes
          deliverables: ['code_review', 'security_assessment'],
          dependencies: ['implementation']
        }
      ]
    },

    complex: {
      id: 'workflow-complex-001',
      title: 'Complete authentication system with OAuth2',
      description: 'Full-featured authentication system supporting multiple providers',
      phases: [
        {
          name: 'requirements_analysis',
          agent: 'researcher',
          estimatedDuration: 1800000, // 30 minutes
          deliverables: ['requirements_document', 'user_stories', 'acceptance_criteria'],
          dependencies: []
        },
        {
          name: 'architecture_design',
          agent: 'researcher',
          estimatedDuration: 2400000, // 40 minutes
          deliverables: ['system_architecture', 'database_schema', 'api_specification'],
          dependencies: ['requirements_analysis']
        },
        {
          name: 'security_planning',
          agent: 'researcher',
          estimatedDuration: 1200000, // 20 minutes
          deliverables: ['security_analysis', 'threat_model', 'compliance_checklist'],
          dependencies: ['architecture_design']
        },
        {
          name: 'core_implementation',
          agent: 'coder',
          estimatedDuration: 4800000, // 80 minutes
          deliverables: ['auth_service', 'user_models', 'basic_endpoints'],
          dependencies: ['security_planning']
        },
        {
          name: 'oauth_implementation',
          agent: 'coder',
          estimatedDuration: 3600000, // 60 minutes
          deliverables: ['oauth_flows', 'provider_integration', 'callback_handlers'],
          dependencies: ['core_implementation']
        },
        {
          name: 'testing_implementation',
          agent: 'coder',
          estimatedDuration: 2400000, // 40 minutes
          deliverables: ['unit_tests', 'integration_tests', 'security_tests'],
          dependencies: ['oauth_implementation']
        },
        {
          name: 'security_review',
          agent: 'reviewer',
          estimatedDuration: 1800000, // 30 minutes
          deliverables: ['security_audit', 'vulnerability_assessment', 'compliance_check'],
          dependencies: ['testing_implementation']
        },
        {
          name: 'code_review',
          agent: 'reviewer',
          estimatedDuration: 1200000, // 20 minutes
          deliverables: ['code_quality_report', 'performance_assessment', 'maintainability_review'],
          dependencies: ['testing_implementation']
        },
        {
          name: 'integration_review',
          agent: 'reviewer',
          estimatedDuration: 900000, // 15 minutes
          deliverables: ['integration_test_review', 'deployment_readiness', 'final_approval'],
          dependencies: ['security_review', 'code_review']
        }
      ]
    }
  },

  // Performance metrics samples
  performanceMetrics: {
    swarmEfficiency: {
      coordinationTime: {
        average: 4200, // 4.2 seconds
        p50: 3800,
        p95: 8500,
        p99: 12000,
        trend: 'improving'
      },
      handoffSuccess: {
        rate: 0.956,
        totalHandoffs: 123,
        successfulHandoffs: 117,
        failedHandoffs: 6,
        commonFailures: ['timeout', 'validation_error', 'network_issue']
      },
      taskThroughput: {
        tasksPerHour: 4.2,
        tasksCompleted: 156,
        averageTaskTime: 2760000, // 46 minutes
        efficiency: 0.87
      }
    },

    agentMetrics: {
      researcher: {
        tasksCompleted: 52,
        averageQuality: 0.89,
        averageTime: 1920000, // 32 minutes
        specialization: {
          requirements_analysis: 0.94,
          security_assessment: 0.88,
          technology_research: 0.91
        },
        collaboration: {
          handoffQuality: 0.92,
          communicationClarity: 0.89,
          responsiveness: 0.87
        }
      },
      coder: {
        tasksCompleted: 78,
        averageQuality: 0.85,
        averageTime: 3840000, // 64 minutes
        specialization: {
          api_development: 0.91,
          database_integration: 0.87,
          testing: 0.82
        },
        collaboration: {
          handoffQuality: 0.88,
          communicationClarity: 0.85,
          responsiveness: 0.89
        },
        codeMetrics: {
          linesPerHour: 45,
          bugsPerKLOC: 0.8,
          testCoverage: 0.89
        }
      },
      reviewer: {
        tasksCompleted: 26,
        averageQuality: 0.93,
        averageTime: 1440000, // 24 minutes
        specialization: {
          security_audit: 0.95,
          code_quality: 0.92,
          performance_review: 0.89
        },
        collaboration: {
          handoffQuality: 0.94,
          communicationClarity: 0.91,
          responsiveness: 0.93
        },
        reviewMetrics: {
          issuesFound: 2.3, // per review
          criticalIssues: 0.4, // per review
          falsePositives: 0.05 // rate
        }
      }
    },

    trends: {
      qualityImprovement: {
        timeframe: 'last_30_days',
        startQuality: 0.82,
        endQuality: 0.89,
        improvement: 0.07,
        trend: 'steady_increase',
        factors: ['agent learning', 'process improvements', 'better coordination']
      },
      speedOptimization: {
        timeframe: 'last_30_days',
        startTime: 3200000, // 53.3 minutes
        endTime: 2760000,   // 46 minutes
        improvement: 0.14,   // 14% faster
        trend: 'consistent_improvement',
        factors: ['task automation', 'reduced handoff time', 'agent specialization']
      },
      coordinationEvolution: {
        handoffTime: {
          week1: 6800, // 6.8 seconds
          week2: 5400,
          week3: 4900,
          week4: 4200, // Current
          improvement: 0.38 // 38% improvement
        },
        communicationQuality: {
          week1: 0.81,
          week2: 0.84,
          week3: 0.87,
          week4: 0.89,
          improvement: 0.08
        }
      }
    }
  },

  // Error and failure scenarios
  errorScenarios: {
    agentFailure: {
      type: 'agent_unresponsive',
      agentId: 'agent-coder-001',
      startTime: '2025-09-24T17:30:00.000Z',
      duration: 45000, // 45 seconds
      symptoms: [
        'No heartbeat response for 30+ seconds',
        'Task progress stalled at 67%',
        'Memory usage at 96%',
        'High CPU utilization (>90%)'
      ],
      rootCause: 'Memory leak in OAuth token processing',
      impact: {
        tasksAffected: ['auth-implementation-001', 'user-service-integration'],
        estimatedDelay: 600000, // 10 minutes
        qualityImpact: 'none' // No quality degradation due to proper handoff
      },
      recovery: {
        strategy: 'agent_restart',
        recoveryTime: 120000, // 2 minutes
        dataLoss: false,
        contextPreserved: true
      }
    },

    coordinationFailure: {
      type: 'handoff_timeout',
      fromAgent: 'agent-researcher-001',
      toAgent: 'agent-coder-001',
      startTime: '2025-09-24T18:15:00.000Z',
      timeout: 30000, // 30 seconds
      cause: 'Network partition between agents',
      symptoms: [
        'Handoff initiation successful',
        'Data transfer stalled at 23%',
        'Connection timeout after 30s',
        'Retry attempts failed'
      ],
      recovery: {
        strategy: 'retry_with_fallback',
        attempts: 3,
        fallbackMethod: 'file_based_transfer',
        recoveryTime: 180000, // 3 minutes
        success: true
      }
    },

    qualityDegradation: {
      type: 'performance_degradation',
      affectedAgent: 'agent-reviewer-001',
      detectionTime: '2025-09-24T16:45:00.000Z',
      metrics: {
        qualityScore: [0.94, 0.92, 0.89, 0.85, 0.81], // Declining over 5 tasks
        reviewTime: [1200000, 1350000, 1500000, 1680000, 1890000], // Increasing
        issuesFound: [3.2, 2.8, 2.1, 1.6, 1.2], // Decreasing effectiveness
        falsePositives: [0.05, 0.08, 0.12, 0.18, 0.25] // Increasing
      },
      possibleCauses: [
        'External service degradation (code analysis API)',
        'Knowledge base staleness',
        'Resource constraints',
        'Task complexity increase'
      ],
      mitigationActions: [
        'Switch to fallback review methods',
        'Refresh knowledge base',
        'Increase resource allocation',
        'Implement adaptive complexity handling'
      ]
    }
  },

  // Relaunch scenarios
  relaunchScenarios: {
    successfulRelaunch: {
      id: 'relaunch-001',
      trigger: 'agent_performance_degradation',
      timestamp: '2025-09-24T18:30:00.000Z',
      affectedAgents: ['agent-coder-001'],
      relaunchCount: 1,
      preservedData: {
        taskStates: ['auth-implementation-001', 'oauth-integration-002'],
        agentMemory: {
          knowledgeBase: 'preserved',
          learningProgress: 'preserved',
          contextualMemory: 'preserved'
        },
        workflowState: 'maintained',
        metrics: 'continuous'
      },
      recoveryProcess: {
        steps: [
          'Detect performance degradation',
          'Preserve current state',
          'Initialize new agent instance',
          'Restore state and memory',
          'Resume task execution',
          'Validate recovery success'
        ],
        totalTime: 145000, // 2 minutes 25 seconds
        success: true,
        postRecoveryMetrics: {
          performanceImprovement: 0.34,
          qualityMaintained: true,
          contextLoss: 0.02 // 2% minimal loss
        }
      }
    },

    multipleRelaunches: {
      id: 'relaunch-series-001',
      timeline: [
        {
          relaunchNumber: 1,
          timestamp: '2025-09-24T15:30:00.000Z',
          trigger: 'memory_exhaustion',
          success: true,
          backoffDelay: 0
        },
        {
          relaunchNumber: 2,
          timestamp: '2025-09-24T16:15:00.000Z',
          trigger: 'external_service_failure',
          success: true,
          backoffDelay: 2000 // 2 seconds
        },
        {
          relaunchNumber: 3,
          timestamp: '2025-09-24T17:45:00.000Z',
          trigger: 'performance_degradation',
          success: true,
          backoffDelay: 4000 // 4 seconds
        }
      ],
      totalRelaunches: 3,
      maxAllowed: 10,
      remainingAttempts: 7,
      patternAnalysis: {
        commonTriggers: ['performance_degradation', 'external_service_failure'],
        averageRecoveryTime: 156000, // 2 minutes 36 seconds
        successRate: 1.0,
        degradationPattern: 'periodic_performance_issues'
      },
      recommendations: [
        'Investigate underlying performance issues',
        'Implement proactive monitoring',
        'Consider infrastructure scaling',
        'Add circuit breaker patterns'
      ]
    },

    gracefulDegradation: {
      id: 'degradation-001',
      timestamp: '2025-09-24T19:00:00.000Z',
      trigger: 'relaunch_limit_exceeded',
      relaunchCount: 10,
      maxRelaunches: 10,
      systemState: 'graceful_degradation',
      fallbackMode: {
        capabilities: [
          'manual_task_assignment',
          'basic_coordination',
          'status_reporting',
          'data_preservation'
        ],
        reducedFunctionality: [
          'automatic_task_orchestration',
          'intelligent_agent_spawning',
          'performance_optimization',
          'neural_learning'
        ],
        humanInterventionRequired: true,
        estimatedRestoreTime: 3600000 // 1 hour with manual intervention
      },
      preservedSystems: {
        criticalData: 'fully_preserved',
        taskHistory: 'maintained',
        agentMemories: 'backed_up',
        workflowTemplates: 'available',
        metrics: 'read_only_access'
      },
      notificationsSent: [
        'System administrator',
        'Development team lead',
        'On-call engineer',
        'Stakeholder management'
      ]
    }
  }
};