/**
 * @file Transparency Data Fixtures
 * @description Mock data for transparency system testing including decisions, reasoning chains, and interventions
 */

export const mockTransparencyData = {
  decisions: {
    simple: {
      id: 'decision-simple-001',
      agentId: 'agent-researcher-001',
      agentType: 'researcher',
      timestamp: '2025-09-24T17:30:00.000Z',
      decision: 'Use OAuth2 for authentication',
      category: 'architecture',
      context: {
        taskId: 'auth-research-task',
        alternatives: ['Session-based authentication', 'JWT tokens', 'OAuth2', 'SAML'],
        constraints: [
          'Must support third-party providers',
          'Scalable for microservices',
          'Industry standard compliance'
        ],
        evaluationCriteria: [
          'Security robustness',
          'Scalability potential',
          'Implementation complexity',
          'Community support'
        ]
      },
      reasoning: {
        primaryFactors: [
          'OAuth2 provides excellent third-party integration capabilities',
          'Well-established security protocols with proven track record',
          'Native support for token-based microservice communication',
          'Extensive ecosystem and library support'
        ],
        rejectedAlternatives: {
          'Session-based': 'Not suitable for distributed architecture due to session storage complexity',
          'JWT alone': 'Missing critical features like token refresh and revocation',
          'SAML': 'Overly complex for current requirements and mobile integration needs'
        },
        confidenceScore: 0.92,
        riskAssessment: 'Low risk - well-established protocol with mature implementations',
        impactAnalysis: {
          positiveImpacts: ['Enhanced security', 'Better user experience', 'Future scalability'],
          negativeImpacts: ['Initial implementation complexity', 'Third-party dependency']
        }
      },
      impact: {
        affectedComponents: ['auth-service', 'user-service', 'api-gateway', 'mobile-app'],
        estimatedEffort: '3-5 days implementation time',
        dependencies: ['OAuth2 provider setup', 'Token management service', 'User consent flow'],
        stakeholders: ['development team', 'security team', 'product team']
      },
      metadata: {
        decisionMaker: 'agent-researcher-001',
        reviewers: ['agent-reviewer-001'],
        approvalRequired: false,
        reversible: true,
        implementationDeadline: '2025-09-30T00:00:00.000Z'
      }
    },

    complex: {
      id: 'decision-complex-001',
      agentId: 'agent-architect-001',
      agentType: 'architect',
      timestamp: '2025-09-24T16:45:00.000Z',
      decision: 'Implement microservices architecture with API Gateway pattern',
      category: 'architecture',
      version: 1,
      context: {
        taskId: 'system-architecture-design',
        problemStatement: 'Scale authentication system to handle 10k+ concurrent users',
        currentState: 'Monolithic application with authentication tightly coupled',
        desiredState: 'Scalable, maintainable system supporting multiple client types',
        businessDrivers: ['Performance requirements', 'Team scalability', 'Technology diversity']
      },
      reasoning: {
        architecturalPrinciples: [
          'Single responsibility per service',
          'Independent deployability',
          'Technology diversity support',
          'Fault isolation'
        ],
        tradeoffAnalysis: {
          benefits: [
            'Independent scaling of authentication vs other services',
            'Technology flexibility for different service components',
            'Team autonomy and parallel development',
            'Better fault isolation and system resilience'
          ],
          costs: [
            'Increased operational complexity',
            'Network latency between services',
            'Distributed system challenges (eventual consistency, debugging)',
            'Initial development overhead'
          ],
          mitigations: [
            'Service mesh for traffic management',
            'Comprehensive monitoring and observability',
            'Circuit breaker patterns for resilience',
            'Standardized logging and tracing'
          ]
        },
        confidenceScore: 0.78,
        riskLevel: 'medium-high',
        assumptions: [
          'Team has sufficient distributed systems experience',
          'Infrastructure team can support container orchestration',
          'Performance requirements justify complexity'
        ]
      },
      alternativesConsidered: [
        {
          option: 'Modular monolith',
          score: 0.65,
          pros: ['Simpler deployment', 'Easier debugging', 'Lower operational overhead'],
          cons: ['Limited scalability', 'Technology coupling', 'Team coordination bottlenecks'],
          rejectionReason: 'Does not meet long-term scalability requirements'
        },
        {
          option: 'Serverless functions',
          score: 0.45,
          pros: ['Auto-scaling', 'Pay-per-use', 'No infrastructure management'],
          cons: ['Cold start latency', 'Vendor lock-in', 'Limited execution time'],
          rejectionReason: 'Authentication flows require stateful operations'
        }
      ],
      implementationPlan: {
        phase1: 'Extract authentication service',
        phase2: 'Implement API Gateway',
        phase3: 'Add user management service',
        phase4: 'Notification service extraction',
        estimatedTimeline: '12-16 weeks'
      }
    },

    revised: {
      id: 'decision-revised-001',
      agentId: 'agent-researcher-001',
      agentType: 'researcher',
      timestamp: '2025-09-24T18:15:00.000Z',
      decision: 'Use PostgreSQL with JSONB for user data storage',
      category: 'data_architecture',
      version: 2,
      previousVersion: {
        version: 1,
        decision: 'Use MySQL for primary database',
        timestamp: '2025-09-24T17:00:00.000Z',
        reason: 'Familiar technology with good performance characteristics'
      },
      revisionReason: 'Requirements changed to include complex JSON queries for user preferences and OAuth provider data',
      context: {
        taskId: 'database-selection',
        newRequirements: [
          'Complex JSON document queries for user preferences',
          'OAuth provider metadata storage',
          'Analytics on user behavior patterns',
          'Full-text search on user profiles'
        ]
      },
      reasoning: {
        primaryFactors: [
          'JSONB support for efficient JSON queries and indexing',
          'Advanced indexing capabilities (GIN, GiST) for complex data types',
          'Full-text search capabilities built-in',
          'Better concurrency control than MySQL for write-heavy workloads'
        ],
        migrationConsiderations: [
          'Team needs PostgreSQL training',
          'Existing MySQL queries need conversion',
          'Performance testing required for new query patterns'
        ],
        confidenceScore: 0.85,
        impactOfChange: {
          development: 'Medium - requires query refactoring',
          operations: 'Low - similar operational characteristics',
          performance: 'Positive - better support for complex queries'
        }
      }
    }
  },

  reasoningChains: {
    simple: {
      id: 'reasoning-chain-simple-001',
      agentId: 'agent-researcher-001',
      taskId: 'oauth-provider-selection',
      startTime: '2025-09-24T17:00:00.000Z',
      endTime: '2025-09-24T17:15:00.000Z',
      totalDuration: 900000, // 15 minutes
      finalDecision: 'Implement Google, GitHub, and Microsoft OAuth providers',
      steps: [
        {
          stepId: 'step-001',
          type: 'requirement_analysis',
          content: 'Analyze user authentication requirements and preferences',
          startTime: '2025-09-24T17:00:00.000Z',
          endTime: '2025-09-24T17:03:00.000Z',
          duration: 180000, // 3 minutes
          inputs: ['user_survey_data', 'market_research', 'competitor_analysis'],
          outputs: ['user_preference_report', 'provider_usage_statistics'],
          confidence: 0.92,
          insights: [
            'Google auth preferred by 68% of surveyed users',
            'GitHub auth essential for developer audience',
            'Microsoft auth needed for enterprise customers'
          ]
        },
        {
          stepId: 'step-002',
          type: 'technical_evaluation',
          content: 'Evaluate OAuth provider technical capabilities and integration complexity',
          startTime: '2025-09-24T17:03:00.000Z',
          endTime: '2025-09-24T17:08:00.000Z',
          duration: 300000, // 5 minutes
          inputs: ['provider_documentation', 'integration_guides', 'community_feedback'],
          outputs: ['technical_comparison_matrix', 'integration_complexity_scores'],
          confidence: 0.88,
          alternatives: [
            {
              provider: 'Google',
              integrationComplexity: 'Low',
              features: ['OpenID Connect', 'User profile', 'Scopes'],
              reliability: 0.99,
              documentation: 'Excellent'
            },
            {
              provider: 'GitHub',
              integrationComplexity: 'Low',
              features: ['OAuth2', 'User profile', 'Organization access'],
              reliability: 0.98,
              documentation: 'Good'
            },
            {
              provider: 'Microsoft',
              integrationComplexity: 'Medium',
              features: ['OpenID Connect', 'Azure AD', 'Enterprise features'],
              reliability: 0.99,
              documentation: 'Comprehensive'
            },
            {
              provider: 'Facebook',
              integrationComplexity: 'Medium',
              features: ['OAuth2', 'User profile', 'Social features'],
              reliability: 0.95,
              documentation: 'Good',
              rejectionReason: 'Privacy concerns and declining user preference'
            }
          ]
        },
        {
          stepId: 'step-003',
          type: 'cost_benefit_analysis',
          content: 'Analyze implementation costs vs user coverage benefits',
          startTime: '2025-09-24T17:08:00.000Z',
          endTime: '2025-09-24T17:12:00.000Z',
          duration: 240000, // 4 minutes
          inputs: ['technical_comparison_matrix', 'user_preference_report', 'development_time_estimates'],
          outputs: ['cost_benefit_matrix', 'roi_projections'],
          confidence: 0.85,
          analysis: {
            implementationCost: '2-3 developer days per provider',
            userCoverage: {
              google: 0.68,
              github: 0.45, // Developer segment
              microsoft: 0.23, // Enterprise segment
              combined: 0.89 // With overlap consideration
            },
            maintenanceCost: 'Low - standardized OAuth2/OpenID patterns'
          }
        },
        {
          stepId: 'step-004',
          type: 'risk_assessment',
          content: 'Evaluate security and operational risks',
          startTime: '2025-09-24T17:12:00.000Z',
          endTime: '2025-09-24T17:14:00.000Z',
          duration: 120000, // 2 minutes
          inputs: ['security_requirements', 'compliance_standards', 'provider_security_profiles'],
          outputs: ['risk_matrix', 'mitigation_strategies'],
          confidence: 0.90,
          risks: [
            {
              type: 'Provider outage',
              probability: 'Low',
              impact: 'High',
              mitigation: 'Multiple provider support and graceful degradation'
            },
            {
              type: 'OAuth flow vulnerabilities',
              probability: 'Medium',
              impact: 'High',
              mitigation: 'Security audit and penetration testing'
            },
            {
              type: 'User data privacy',
              probability: 'Low',
              impact: 'Medium',
              mitigation: 'Minimal scope requests and clear privacy policy'
            }
          ]
        },
        {
          stepId: 'step-005',
          type: 'decision_synthesis',
          content: 'Synthesize analysis into final provider selection',
          startTime: '2025-09-24T17:14:00.000Z',
          endTime: '2025-09-24T17:15:00.000Z',
          duration: 60000, // 1 minute
          inputs: ['cost_benefit_matrix', 'risk_matrix', 'user_preference_report'],
          outputs: ['final_recommendation', 'implementation_roadmap'],
          confidence: 0.93,
          decisionFactors: [
            'Combined user coverage of 89% justifies multi-provider approach',
            'Technical implementation complexity is manageable',
            'Risk mitigation strategies are well-defined',
            'Enterprise segment requires Microsoft for B2B growth'
          ]
        }
      ],
      patterns: ['systematic_evaluation', 'multi_criteria_analysis'],
      quality: {
        completeness: 0.94,
        logical_consistency: 0.91,
        evidence_support: 0.89,
        bias_mitigation: 0.87
      }
    },

    complex: {
      id: 'reasoning-chain-complex-001',
      agentId: 'agent-architect-001',
      taskId: 'microservices-decomposition',
      startTime: '2025-09-24T15:30:00.000Z',
      endTime: '2025-09-24T17:45:00.000Z',
      totalDuration: 8100000, // 2 hours 15 minutes
      finalDecision: 'Decompose monolith into 4 core services with event-driven communication',
      steps: [
        // Domain analysis (30 minutes)
        {
          stepId: 'domain-analysis',
          type: 'domain_modeling',
          content: 'Analyze current system domains and bounded contexts',
          duration: 1800000, // 30 minutes
          confidence: 0.88,
          outputs: ['domain_model', 'bounded_context_map'],
          identifiedDomains: [
            'Authentication & Authorization',
            'User Management',
            'Content Management',
            'Notification & Communication',
            'Analytics & Reporting'
          ]
        },
        // Service identification (45 minutes)
        {
          stepId: 'service-identification',
          type: 'service_decomposition',
          content: 'Identify candidate services based on domain boundaries',
          duration: 2700000, // 45 minutes
          confidence: 0.85,
          candidateServices: [
            {
              name: 'auth-service',
              responsibilities: ['OAuth flow', 'JWT management', 'Session handling'],
              dataOwnership: ['users', 'auth_tokens', 'oauth_providers'],
              estimatedComplexity: 'Medium'
            },
            {
              name: 'user-service',
              responsibilities: ['Profile management', 'Preferences', 'Account settings'],
              dataOwnership: ['user_profiles', 'preferences', 'settings'],
              estimatedComplexity: 'Low'
            },
            {
              name: 'content-service',
              responsibilities: ['Content CRUD', 'Content metadata', 'Search indexing'],
              dataOwnership: ['content', 'metadata', 'tags'],
              estimatedComplexity: 'High'
            },
            {
              name: 'notification-service',
              responsibilities: ['Email notifications', 'Push notifications', 'Event routing'],
              dataOwnership: ['notification_templates', 'delivery_logs'],
              estimatedComplexity: 'Medium'
            }
          ]
        },
        // Dependency analysis (30 minutes)
        {
          stepId: 'dependency-analysis',
          type: 'dependency_mapping',
          content: 'Analyze service dependencies and communication patterns',
          duration: 1800000, // 30 minutes
          confidence: 0.82,
          dependencyGraph: {
            'auth-service': { dependsOn: [], consumers: ['user-service', 'content-service'] },
            'user-service': { dependsOn: ['auth-service'], consumers: ['content-service', 'notification-service'] },
            'content-service': { dependsOn: ['auth-service', 'user-service'], consumers: ['notification-service'] },
            'notification-service': { dependsOn: ['user-service'], consumers: [] }
          }
        },
        // Communication pattern design (30 minutes)
        {
          stepId: 'communication-design',
          type: 'integration_pattern_selection',
          content: 'Design inter-service communication patterns',
          duration: 1800000, // 30 minutes
          confidence: 0.89,
          patterns: {
            synchronous: ['User authentication', 'Profile retrieval'],
            asynchronous: ['User registration', 'Content publication', 'Notifications'],
            events: ['user.created', 'content.published', 'auth.failed']
          }
        }
      ],
      bottlenecks: [
        {
          stepId: 'service-identification',
          type: 'complexity',
          description: 'High complexity in determining content service boundaries',
          impact: 'Extended analysis time by 15 minutes',
          resolution: 'Applied domain-driven design principles more rigorously'
        }
      ],
      iterations: 2,
      qualityGates: [
        { gate: 'Domain consistency', passed: true, score: 0.91 },
        { gate: 'Service autonomy', passed: true, score: 0.87 },
        { gate: 'Communication efficiency', passed: false, score: 0.76, improvement: 'Reduced sync calls by 30%' }
      ]
    }
  },

  humanInterventions: {
    decision: {
      id: 'intervention-decision-001',
      type: 'decision_required',
      requestTime: '2025-09-24T17:45:00.000Z',
      responseTime: '2025-09-24T17:47:30.000Z',
      agentId: 'agent-coder-001',
      priority: 'high',
      timeout: 300000, // 5 minutes
      context: {
        taskId: 'password-security-implementation',
        currentPhase: 'security_configuration',
        decision: 'Choose password hashing algorithm for production system',
        urgency: 'Security implementation blocking deployment',
        stakeholders: ['security team', 'development team']
      },
      options: [
        {
          id: 'bcrypt',
          name: 'bcrypt',
          description: 'Industry standard, widely adopted',
          technicalDetails: {
            rounds: 12,
            performance: '~250ms per hash',
            memoryUsage: 'Low',
            resistance: 'GPU attacks: Good, ASIC attacks: Good'
          },
          pros: ['Mature and battle-tested', 'Excellent ecosystem support', 'Configurable work factor'],
          cons: ['Limited memory hardness', 'Vulnerable to specialized hardware'],
          securityRating: 8.5,
          performanceRating: 7.5
        },
        {
          id: 'argon2',
          name: 'Argon2id',
          description: 'Winner of Password Hashing Competition, latest standard',
          technicalDetails: {
            memoryMB: 64,
            iterations: 3,
            parallelism: 4,
            performance: '~300ms per hash',
            resistance: 'GPU attacks: Excellent, ASIC attacks: Excellent'
          },
          pros: ['State-of-the-art security', 'Memory-hard function', 'Configurable memory usage'],
          cons: ['Newer technology with smaller ecosystem', 'Higher memory requirements'],
          securityRating: 9.5,
          performanceRating: 7.0
        },
        {
          id: 'scrypt',
          name: 'scrypt',
          description: 'Memory-hard function, good balance of security and performance',
          technicalDetails: {
            memoryMB: 32,
            iterations: 32768,
            parallelism: 1,
            performance: '~200ms per hash',
            resistance: 'GPU attacks: Very Good, ASIC attacks: Good'
          },
          pros: ['Good security properties', 'Better performance than Argon2', 'Established track record'],
          cons: ['Less resistant than Argon2', 'Complex parameter tuning'],
          securityRating: 8.8,
          performanceRating: 8.0
        }
      ],
      agentRecommendation: {
        choice: 'bcrypt',
        reasoning: 'Most familiar option with extensive documentation and team experience',
        confidence: 0.6,
        concerns: 'May not provide best long-term security'
      },
      humanResponse: {
        decision: 'argon2',
        reasoning: 'Security is the primary concern for authentication system. Argon2 provides the best protection against current and future attack vectors. The performance impact is acceptable for our expected user load.',
        confidence: 0.92,
        additionalRequirements: [
          'Implement performance monitoring for hash operations',
          'Plan for gradual migration from any existing passwords',
          'Document parameter choices for future reference'
        ],
        securityJustification: 'Given the sensitive nature of authentication data and increasing sophistication of attacks, we should implement the most secure option available.',
        followupActions: [
          'Performance testing with Argon2 in staging environment',
          'Security team review of implementation',
          'Documentation of security decision rationale'
        ]
      },
      impact: {
        taskDelay: 150000, // 2.5 minutes
        qualityImprovement: 0.25, // 25% better security posture
        learningValue: 'High - establishes security-first decision making pattern',
        riskReduction: 0.4, // Significant reduction in password compromise risk
        implementationChanges: [
          'Switch from bcrypt library to argon2 library',
          'Adjust hash parameters for optimal security/performance balance',
          'Update password migration logic'
        ]
      },
      agentLearning: {
        keyInsights: [
          'Security requirements often override performance considerations',
          'Latest standards may be preferred even with learning curve',
          'Human expertise valuable for risk assessment'
        ],
        patternRecognition: 'Security-critical decisions require human oversight',
        futureApplication: 'Prioritize security in similar cryptographic choices'
      }
    },

    approval: {
      id: 'intervention-approval-001',
      type: 'approval_required',
      requestTime: '2025-09-24T18:30:00.000Z',
      responseTime: '2025-09-24T18:32:15.000Z',
      agentId: 'agent-reviewer-001',
      priority: 'medium',
      timeout: 600000, // 10 minutes
      context: {
        taskId: 'auth-system-deployment-approval',
        currentPhase: 'pre_production_review',
        decision: 'Approve deployment of authentication system to staging environment',
        deploymentScope: 'Authentication service and user management API',
        riskLevel: 'medium'
      },
      reviewData: {
        codeQuality: {
          overallScore: 0.89,
          maintainability: 0.91,
          reliability: 0.87,
          security: 0.93,
          testCoverage: 0.92,
          technicalDebt: 'Low',
          codeReviewStatus: 'Approved with minor suggestions'
        },
        testing: {
          unitTests: { total: 45, passed: 45, failed: 0, coverage: 0.92 },
          integrationTests: { total: 18, passed: 17, failed: 1, coverage: 0.85 },
          e2eTests: { total: 12, passed: 12, failed: 0, coverage: 0.78 },
          securityTests: { total: 15, passed: 15, failed: 0, coverage: 0.88 },
          performanceTests: { responseTimes: 'Within SLA', throughput: 'Meets requirements' }
        },
        security: {
          vulnerabilityScore: 0.05, // Very low
          penetrationTestStatus: 'Passed',
          dependencyAudit: 'No high-risk vulnerabilities',
          complianceChecks: ['OWASP Top 10', 'OAuth2 Security BCP'],
          dataProtection: 'GDPR compliant'
        },
        performance: {
          responseTime: { p50: 145, p95: 280, p99: 420 }, // milliseconds
          throughput: 1200, // requests per minute
          memoryUsage: 0.65, // 65% of allocated
          cpuUsage: 0.42, // 42% under load
          errorRate: 0.001 // 0.1%
        },
        deployment: {
          environmentParity: 'High - staging closely matches production',
          rollbackPlan: 'Prepared and tested',
          monitoringSetup: 'Comprehensive dashboards and alerts configured',
          backupStrategy: 'Database backups automated'
        }
      },
      concerns: [
        'One integration test failure needs investigation',
        'E2E test coverage could be higher',
        'Performance testing was limited to expected load'
      ],
      mitigations: [
        'Failed integration test is non-critical path (password strength validation edge case)',
        'Additional E2E tests scheduled for next sprint',
        'Load testing planned for production deployment'
      ],
      humanResponse: {
        decision: 'approved_with_conditions',
        conditions: [
          'Fix the failing integration test before deployment',
          'Add monitoring alerts for authentication failure rates',
          'Prepare detailed rollback procedure document'
        ],
        reasoning: 'System meets quality and security standards. The failing test is minor but should be addressed. Overall risk is acceptable for staging deployment.',
        confidence: 0.87,
        additionalRecommendations: [
          'Schedule production load testing within 48 hours of staging deployment',
          'Plan incremental rollout strategy for production',
          'Establish clear success criteria for production deployment'
        ],
        approvalScope: 'Staging environment deployment only',
        reviewDate: '2025-09-24T18:32:15.000Z',
        reviewerId: 'senior-dev-001',
        signoff: 'Digital signature hash: sha256:a1b2c3d4e5f6...'
      },
      followupActions: [
        {
          action: 'fix_integration_test',
          assignee: 'agent-coder-001',
          deadline: '2025-09-24T20:00:00.000Z',
          priority: 'high'
        },
        {
          action: 'setup_monitoring_alerts',
          assignee: 'devops-team',
          deadline: '2025-09-25T09:00:00.000Z',
          priority: 'medium'
        },
        {
          action: 'document_rollback_procedure',
          assignee: 'agent-reviewer-001',
          deadline: '2025-09-25T12:00:00.000Z',
          priority: 'medium'
        }
      ],
      complianceAuditTrail: {
        reviewerQualification: 'Senior Developer with Security Clearance',
        reviewStandards: ['Internal Code Review Guidelines', 'Security Review Checklist'],
        documentationComplete: true,
        approvalAuthority: 'Development Team Lead',
        regulatoryCompliance: 'Internal policies only'
      }
    }
  },

  agentStatuses: {
    active: {
      agentId: 'agent-researcher-001',
      agentType: 'researcher',
      status: 'active',
      timestamp: '2025-09-24T18:00:00.000Z',
      currentTask: {
        taskId: 'oauth-provider-analysis',
        title: 'OAuth Provider Security Analysis',
        startTime: '2025-09-24T17:45:00.000Z',
        estimatedEndTime: '2025-09-24T18:15:00.000Z',
        progress: 0.67,
        currentPhase: 'security_assessment'
      },
      performance: {
        tasksCompleted: 15,
        averageTaskTime: 1920000, // 32 minutes
        qualityScore: 0.89,
        collaborationScore: 0.91,
        recentTasks: [
          { taskId: 'auth-requirements', quality: 0.92, duration: 1800000 },
          { taskId: 'security-analysis', quality: 0.87, duration: 2100000 },
          { taskId: 'provider-comparison', quality: 0.91, duration: 1680000 }
        ]
      },
      resources: {
        memoryUsage: 0.45, // 45% of allocated
        cpuUsage: 0.23,    // 23% current utilization
        networkActivity: 0.12, // 12% of bandwidth
        storageUsage: 0.34  // 34% of allocated disk
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
      healthMetrics: {
        overall: 0.91,
        taskExecution: 0.89,
        resourceEfficiency: 0.93,
        collaborationEffectiveness: 0.91,
        learningProgression: 0.87
      }
    },

    degraded: {
      agentId: 'agent-coder-001',
      agentType: 'coder',
      status: 'degraded',
      timestamp: '2025-09-24T18:00:00.000Z',
      currentTask: {
        taskId: 'auth-middleware-implementation',
        title: 'Authentication Middleware Development',
        startTime: '2025-09-24T16:30:00.000Z',
        estimatedEndTime: '2025-09-24T18:00:00.000Z',
        actualProgress: 0.65,
        expectedProgress: 0.85,
        progressGap: -0.20,
        issues: [
          'Database connection intermittent failures',
          'OAuth callback URL configuration issues',
          'Test environment instability'
        ]
      },
      performance: {
        tasksCompleted: 23,
        averageTaskTime: 4200000, // 70 minutes (20% above normal)
        qualityScore: 0.79, // Below normal 0.87
        collaborationScore: 0.82, // Reduced due to delays
        recentPerformanceTrend: 'declining',
        issues: [
          {
            type: 'quality_degradation',
            severity: 'medium',
            description: 'Code quality scores trending downward',
            firstObserved: '2025-09-24T16:00:00.000Z',
            possibleCauses: ['Complex task requirements', 'Technical debt accumulation', 'Insufficient break time']
          },
          {
            type: 'task_overrun',
            severity: 'medium',
            description: 'Tasks consistently taking longer than estimated',
            averageOverrun: 0.35, // 35% longer than estimated
            impact: 'Blocking downstream tasks'
          }
        ]
      },
      resources: {
        memoryUsage: 0.87, // High memory usage
        cpuUsage: 0.76,    // High CPU utilization
        networkActivity: 0.45, // High network activity (possibly due to retries)
        storageUsage: 0.72,
        alerts: [
          'Memory usage above 85% threshold',
          'High CPU utilization for extended period',
          'Excessive network retry attempts detected'
        ]
      },
      diagnostics: {
        lastHealthCheck: '2025-09-24T17:55:00.000Z',
        healthScore: 0.68, // Below healthy threshold of 0.8
        systemLoad: 'high',
        responseLatency: 2300, // ms, above normal 800ms
        errorRate: 0.12, // 12%, above normal 2%
        rootCauseAnalysis: [
          'Database connection pool exhaustion',
          'Memory leak in OAuth token handling',
          'Insufficient error handling in retry logic'
        ],
        recommendedActions: [
          'Restart agent to clear memory leaks',
          'Review database connection configuration',
          'Implement circuit breaker pattern for external API calls'
        ]
      },
      recoveryPlan: {
        immediate: [
          'Reduce concurrent task load',
          'Clear memory cache',
          'Reset database connections'
        ],
        shortTerm: [
          'Performance profiling and optimization',
          'Code review for memory leaks',
          'Infrastructure scaling if needed'
        ],
        preventive: [
          'Implement resource monitoring alerts',
          'Add graceful degradation mechanisms',
          'Regular performance regression testing'
        ]
      }
    },

    error: {
      agentId: 'agent-reviewer-001',
      agentType: 'reviewer',
      status: 'error',
      timestamp: '2025-09-24T18:00:00.000Z',
      error: {
        code: 'EXTERNAL_SERVICE_FAILURE',
        message: 'Unable to connect to code analysis service',
        severity: 'high',
        recoverable: true,
        firstOccurrence: '2025-09-24T17:58:30.000Z',
        recurrenceCount: 3,
        stackTrace: 'SecurityAnalysisService.connect() failed: Connection timeout after 30s',
        affectedCapabilities: ['security_audit', 'code_quality_analysis'],
        workingCapabilities: ['manual_review', 'documentation_review']
      },
      lastSuccessfulTask: {
        taskId: 'user-service-review',
        completedAt: '2025-09-24T17:45:00.000Z',
        quality: 0.94
      },
      failedAttempts: [
        {
          attemptTime: '2025-09-24T17:58:30.000Z',
          taskId: 'security-audit-001',
          errorType: 'service_connection',
          retryScheduled: true
        },
        {
          attemptTime: '2025-09-24T17:59:00.000Z',
          taskId: 'security-audit-001',
          errorType: 'service_timeout',
          retryScheduled: true
        },
        {
          attemptTime: '2025-09-24T17:59:30.000Z',
          taskId: 'security-audit-001',
          errorType: 'service_unavailable',
          retryScheduled: false
        }
      ],
      recoveryStatus: {
        strategy: 'fallback_to_manual_review',
        estimatedRecoveryTime: 600000, // 10 minutes
        alternativeCapabilities: ['manual_security_review', 'documentation_based_analysis'],
        serviceHealthCheck: 'scheduled_every_60s',
        autoRetryEnabled: true,
        maxRetries: 5,
        currentRetryCount: 3
      },
      impact: {
        affectedTasks: ['security-audit-001', 'code-quality-check-002'],
        taskDelay: 900000, // 15 minutes estimated
        qualityImpact: 'Medium - manual review available but slower',
        downstreamEffects: ['Delayed deployment approval', 'Extended review cycle']
      },
      notifications: {
        humanOperator: 'notified',
        teamLead: 'notified',
        dependentAgents: ['agent-coder-001'],
        escalationLevel: 'L2 - Service Degradation'
      }
    }
  },

  performanceReports: {
    daily: {
      reportId: 'perf-daily-20250924',
      dateRange: {
        start: '2025-09-24T00:00:00.000Z',
        end: '2025-09-24T23:59:59.000Z'
      },
      summary: {
        totalTasks: 45,
        completedTasks: 43,
        failedTasks: 1,
        inProgressTasks: 1,
        successRate: 0.956,
        averageQuality: 0.887,
        averageCompletionTime: 2760000, // 46 minutes
        totalWorkTime: 118800000 // 33 hours total work across all agents
      },
      agentPerformance: {
        'agent-researcher-001': {
          tasksCompleted: 15,
          averageQuality: 0.89,
          averageTime: 1920000, // 32 minutes
          efficiency: 0.91,
          strengths: ['thorough_analysis', 'security_focus'],
          improvementAreas: ['documentation_speed']
        },
        'agent-coder-001': {
          tasksCompleted: 23,
          averageQuality: 0.87,
          averageTime: 3840000, // 64 minutes
          efficiency: 0.78,
          strengths: ['clean_code', 'api_design'],
          improvementAreas: ['error_handling', 'testing_practices']
        },
        'agent-reviewer-001': {
          tasksCompleted: 5, // Reduced due to error state
          averageQuality: 0.94,
          averageTime: 1440000, // 24 minutes
          efficiency: 0.92,
          strengths: ['security_audit', 'comprehensive_feedback'],
          improvementAreas: ['service_dependency_resilience']
        }
      },
      trends: {
        qualityTrend: {
          direction: 'improving',
          changeRate: 0.02, // 2% improvement over previous period
          data: [0.82, 0.84, 0.86, 0.88, 0.89]
        },
        speedTrend: {
          direction: 'improving',
          changeRate: -0.08, // 8% faster (negative means improvement)
          data: [3200000, 3100000, 2900000, 2800000, 2760000]
        },
        coordinationEfficiency: {
          direction: 'stable',
          changeRate: 0.01,
          current: 0.89,
          handoffTime: 4200 // 4.2 seconds average
        }
      },
      bottlenecks: [
        {
          type: 'agent_overload',
          agent: 'agent-coder-001',
          severity: 'medium',
          impact: 'Tasks taking 35% longer than estimated',
          recommendation: 'Consider workload redistribution or performance optimization'
        },
        {
          type: 'external_dependency',
          service: 'code_analysis_service',
          severity: 'high',
          impact: 'Agent-reviewer-001 operating at reduced capacity',
          recommendation: 'Implement fallback mechanisms and service redundancy'
        }
      ],
      recommendations: [
        'Investigate performance degradation in agent-coder-001',
        'Implement resilience patterns for external service dependencies',
        'Consider adding specialized testing agent to improve coverage',
        'Schedule performance optimization sprint'
      ]
    }
  }
};