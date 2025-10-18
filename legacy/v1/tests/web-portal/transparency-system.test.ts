/**
 * @file Transparency System Tests
 * @description Tests for decision logging, reasoning chain capture, and transparency features
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { TransparencySystem } from '../../src/services/transparency-system';
import { DecisionLogger } from '../../src/services/decision-logger';
import { ReasoningChainCapture } from '../../src/services/reasoning-chain-capture';
import { HumanInterventionTracker } from '../../src/services/human-intervention-tracker';
import { AgentStatusMonitor } from '../../src/services/agent-status-monitor';
import { TransparencyDatabase } from '../../src/storage/transparency-database';
import { mockTransparencyData } from './fixtures/transparency-data';
import { createMockDatabase } from './mocks/database-mock';

describe('Transparency System Tests', () => {
  let transparencySystem: TransparencySystem;
  let decisionLogger: DecisionLogger;
  let reasoningCapture: ReasoningChainCapture;
  let interventionTracker: HumanInterventionTracker;
  let statusMonitor: AgentStatusMonitor;
  let mockDatabase: TransparencyDatabase;

  beforeEach(async () => {
    mockDatabase = createMockDatabase();

    // Initialize transparency components
    decisionLogger = new DecisionLogger({
      database: mockDatabase,
      logLevels: ['debug', 'info', 'warning', 'error', 'critical'],
      retention: {
        decisions: 30, // days
        reasoning: 14,
        interventions: 90
      }
    });

    reasoningCapture = new ReasoningChainCapture({
      database: mockDatabase,
      captureSettings: {
        includeIntermediateSteps: true,
        captureConfidenceScores: true,
        includeAlternatives: true,
        maxChainDepth: 10
      }
    });

    interventionTracker = new HumanInterventionTracker({
      database: mockDatabase,
      trackingSettings: {
        includeContext: true,
        trackDecisionTime: true,
        includeImpactAnalysis: true
      }
    });

    statusMonitor = new AgentStatusMonitor({
      database: mockDatabase,
      monitoringSettings: {
        updateInterval: 1000, // 1 second
        includePerformanceMetrics: true,
        trackResourceUsage: true
      }
    });

    transparencySystem = new TransparencySystem({
      decisionLogger,
      reasoningCapture,
      interventionTracker,
      statusMonitor,
      database: mockDatabase
    });

    await transparencySystem.initialize();
  });

  afterEach(async () => {
    await transparencySystem.shutdown();
    jest.clearAllMocks();
  });

  describe('Decision Logging and Display', () => {
    it('should log agent decisions with full context', async () => {
      const decision = {
        id: 'decision-001',
        agentId: 'agent-researcher-001',
        agentType: 'researcher',
        timestamp: new Date().toISOString(),
        decision: 'Use OAuth2 for authentication',
        context: {
          taskId: 'auth-research-task',
          alternatives: [
            'Session-based authentication',
            'JWT tokens',
            'OAuth2',
            'SAML'
          ],
          constraints: [
            'Must support third-party providers',
            'Scalable for microservices',
            'Industry standard'
          ],
          evaluationCriteria: [
            'Security',
            'Scalability',
            'Ease of implementation',
            'Community support'
          ]
        },
        reasoning: {
          primaryFactors: [
            'OAuth2 provides excellent third-party integration',
            'Well-established security protocols',
            'Supports token-based microservice communication'
          ],
          rejectedAlternatives: {
            'Session-based': 'Not suitable for distributed architecture',
            'JWT alone': 'Missing token refresh and revocation features',
            'SAML': 'Overly complex for current requirements'
          },
          confidenceScore: 0.92,
          riskAssessment: 'Low - well-established protocol'
        },
        impact: {
          affectedComponents: ['auth-service', 'user-service', 'api-gateway'],
          estimatedEffort: '3-5 days',
          dependencies: ['OAuth2 provider setup', 'Token management service']
        }
      };

      await decisionLogger.logDecision(decision);

      // Verify decision was stored
      const storedDecision = await mockDatabase.getDecision(decision.id);
      expect(storedDecision).toBeDefined();
      expect(storedDecision.decision).toBe('Use OAuth2 for authentication');
      expect(storedDecision.reasoning.confidenceScore).toBe(0.92);

      // Verify decision appears in transparency display
      const displayData = await transparencySystem.getDecisionDisplay({
        agentId: 'agent-researcher-001',
        timeRange: 'last_24h'
      });

      expect(displayData.decisions).toHaveLength(1);
      expect(displayData.decisions[0].id).toBe('decision-001');
    });

    it('should display decision timeline with filtering capabilities', async () => {
      // Log multiple decisions
      const decisions = [
        {
          id: 'decision-001',
          agentId: 'agent-researcher-001',
          decision: 'Use OAuth2',
          timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          category: 'architecture'
        },
        {
          id: 'decision-002',
          agentId: 'agent-coder-001',
          decision: 'Use Express.js framework',
          timestamp: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
          category: 'implementation'
        },
        {
          id: 'decision-003',
          agentId: 'agent-reviewer-001',
          decision: 'Approve code changes',
          timestamp: new Date().toISOString(),
          category: 'quality_assurance'
        }
      ];

      for (const decision of decisions) {
        await decisionLogger.logDecision(decision);
      }

      // Test timeline display
      const timeline = await transparencySystem.getDecisionTimeline({
        startTime: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        endTime: new Date().toISOString()
      });

      expect(timeline.decisions).toHaveLength(3);
      expect(timeline.decisions[0].timestamp).toBeLessThan(timeline.decisions[2].timestamp);

      // Test category filtering
      const archDecisions = await transparencySystem.getDecisionTimeline({
        category: 'architecture'
      });

      expect(archDecisions.decisions).toHaveLength(1);
      expect(archDecisions.decisions[0].decision).toBe('Use OAuth2');

      // Test agent filtering
      const coderDecisions = await transparencySystem.getDecisionTimeline({
        agentId: 'agent-coder-001'
      });

      expect(coderDecisions.decisions).toHaveLength(1);
      expect(coderDecisions.decisions[0].decision).toBe('Use Express.js framework');
    });

    it('should track decision impact and outcomes', async () => {
      const decision = {
        id: 'decision-impact-001',
        agentId: 'agent-architect-001',
        decision: 'Implement microservices architecture',
        expectedImpact: {
          components: ['auth-service', 'user-service', 'notification-service'],
          timeline: '2 weeks',
          complexity: 'high',
          benefits: ['Scalability', 'Maintainability', 'Team autonomy'],
          risks: ['Increased operational complexity', 'Service coordination overhead']
        }
      };

      await decisionLogger.logDecision(decision);

      // Simulate actual outcomes after implementation
      const actualOutcome = {
        decisionId: 'decision-impact-001',
        implementationTime: '2.5 weeks',
        actualComplexity: 'high',
        realizedBenefits: ['Improved scalability', 'Better team separation'],
        encounteredIssues: ['Service discovery challenges', 'Distributed debugging'],
        successMetrics: {
          performanceImprovement: 0.15,
          developmentVelocity: 0.08,
          systemReliability: 0.92
        }
      };

      await decisionLogger.logDecisionOutcome(actualOutcome);

      // Verify impact tracking
      const impactAnalysis = await transparencySystem.getDecisionImpact('decision-impact-001');
      expect(impactAnalysis.expectedVsActual).toBeDefined();
      expect(impactAnalysis.successRate).toBeGreaterThan(0.7);
      expect(impactAnalysis.learnings).toContain('Service discovery challenges');
    });

    it('should support decision revision and versioning', async () => {
      const originalDecision = {
        id: 'decision-revision-001',
        agentId: 'agent-researcher-001',
        decision: 'Use MySQL for primary database',
        version: 1,
        reasoning: { primary: 'Familiar technology, good performance' }
      };

      await decisionLogger.logDecision(originalDecision);

      // Revise decision based on new information
      const revisedDecision = {
        id: 'decision-revision-001',
        agentId: 'agent-researcher-001',
        decision: 'Use PostgreSQL for primary database',
        version: 2,
        reasoning: {
          primary: 'Better JSON support needed, superior indexing',
          revisionReason: 'Requirements changed to include complex JSON queries'
        },
        previousVersion: 1
      };

      await decisionLogger.reviseDecision(revisedDecision);

      // Verify revision tracking
      const decisionHistory = await transparencySystem.getDecisionHistory('decision-revision-001');
      expect(decisionHistory.versions).toHaveLength(2);
      expect(decisionHistory.current.decision).toBe('Use PostgreSQL for primary database');
      expect(decisionHistory.revisions[0].decision).toBe('Use MySQL for primary database');
    });
  });

  describe('Reasoning Chain Capture', () => {
    it('should capture complete reasoning chains with intermediate steps', async () => {
      const reasoningChain = {
        id: 'reasoning-chain-001',
        agentId: 'agent-researcher-001',
        taskId: 'database-selection-task',
        startTime: new Date().toISOString(),
        steps: [
          {
            stepId: 'step-001',
            type: 'information_gathering',
            content: 'Analyzing application requirements',
            inputs: ['user_stories', 'performance_requirements', 'scalability_needs'],
            outputs: ['requirement_analysis'],
            confidence: 0.95,
            duration: 120000 // 2 minutes
          },
          {
            stepId: 'step-002',
            type: 'option_evaluation',
            content: 'Comparing database options',
            inputs: ['requirement_analysis', 'database_options'],
            outputs: ['comparison_matrix'],
            confidence: 0.88,
            duration: 300000, // 5 minutes
            alternatives: [
              { option: 'MySQL', score: 0.75, pros: ['Familiar', 'Fast'], cons: ['Limited JSON'] },
              { option: 'PostgreSQL', score: 0.92, pros: ['JSON support', 'Advanced features'], cons: ['Learning curve'] },
              { option: 'MongoDB', score: 0.65, pros: ['Document model'], cons: ['Consistency concerns'] }
            ]
          },
          {
            stepId: 'step-003',
            type: 'decision_synthesis',
            content: 'Synthesizing final recommendation',
            inputs: ['comparison_matrix', 'team_capabilities', 'project_constraints'],
            outputs: ['final_decision'],
            confidence: 0.93,
            duration: 180000 // 3 minutes
          }
        ],
        endTime: new Date(Date.now() + 600000).toISOString(), // 10 minutes later
        finalDecision: 'PostgreSQL selected based on JSON requirements and feature richness'
      };

      await reasoningCapture.captureReasoningChain(reasoningChain);

      // Verify complete chain was captured
      const capturedChain = await mockDatabase.getReasoningChain('reasoning-chain-001');
      expect(capturedChain).toBeDefined();
      expect(capturedChain.steps).toHaveLength(3);
      expect(capturedChain.steps[1].alternatives).toHaveLength(3);

      // Verify reasoning display
      const chainDisplay = await transparencySystem.getReasoningChainDisplay('reasoning-chain-001');
      expect(chainDisplay.totalSteps).toBe(3);
      expect(chainDisplay.totalDuration).toBe(600000);
      expect(chainDisplay.averageConfidence).toBeCloseTo(0.92, 2);
    });

    it('should track reasoning patterns and learning', async () => {
      // Capture multiple reasoning chains to identify patterns
      const reasoningChains = [
        {
          id: 'pattern-chain-001',
          agentId: 'agent-coder-001',
          pattern: 'problem_decomposition',
          steps: [
            { type: 'problem_analysis', confidence: 0.9 },
            { type: 'solution_design', confidence: 0.85 },
            { type: 'implementation_planning', confidence: 0.88 }
          ],
          outcome: 'successful',
          taskType: 'feature_implementation'
        },
        {
          id: 'pattern-chain-002',
          agentId: 'agent-coder-001',
          pattern: 'problem_decomposition',
          steps: [
            { type: 'problem_analysis', confidence: 0.92 },
            { type: 'solution_design', confidence: 0.87 },
            { type: 'implementation_planning', confidence: 0.91 }
          ],
          outcome: 'successful',
          taskType: 'bug_fix'
        }
      ];

      for (const chain of reasoningChains) {
        await reasoningCapture.captureReasoningChain(chain);
      }

      // Analyze patterns
      const patternAnalysis = await reasoningCapture.analyzeReasoningPatterns({
        agentId: 'agent-coder-001',
        pattern: 'problem_decomposition'
      });

      expect(patternAnalysis.occurrences).toBe(2);
      expect(patternAnalysis.successRate).toBe(1.0);
      expect(patternAnalysis.averageConfidence.problem_analysis).toBeCloseTo(0.91, 2);
      expect(patternAnalysis.improvementTrend).toBe('positive');

      // Verify learning recommendations
      expect(patternAnalysis.recommendations).toContain('Continue using problem_decomposition pattern');
    });

    it('should identify reasoning bottlenecks and inefficiencies', async () => {
      const problematicChain = {
        id: 'bottleneck-chain-001',
        agentId: 'agent-analyst-001',
        steps: [
          { stepId: 'step-1', type: 'data_collection', duration: 60000, confidence: 0.95 },
          { stepId: 'step-2', type: 'analysis', duration: 600000, confidence: 0.65 }, // Bottleneck
          { stepId: 'step-3', type: 'reporting', duration: 120000, confidence: 0.90 }
        ],
        totalDuration: 780000,
        expectedDuration: 300000
      };

      await reasoningCapture.captureReasoningChain(problematicChain);

      // Analyze bottlenecks
      const bottleneckAnalysis = await reasoningCapture.identifyBottlenecks('bottleneck-chain-001');

      expect(bottleneckAnalysis.bottlenecks).toHaveLength(1);
      expect(bottleneckAnalysis.bottlenecks[0].stepId).toBe('step-2');
      expect(bottleneckAnalysis.bottlenecks[0].type).toBe('duration');
      expect(bottleneckAnalysis.bottlenecks[0].severity).toBe('high');

      // Verify improvement suggestions
      expect(bottleneckAnalysis.suggestions).toContain('Consider breaking down analysis step');
      expect(bottleneckAnalysis.suggestions).toContain('Low confidence indicates uncertainty');
    });

    it('should support reasoning chain visualization data', async () => {
      const visualChain = {
        id: 'visual-chain-001',
        agentId: 'agent-designer-001',
        steps: [
          {
            stepId: 'step-1',
            type: 'requirement_analysis',
            position: { x: 0, y: 0 },
            connections: ['step-2', 'step-3']
          },
          {
            stepId: 'step-2',
            type: 'design_exploration',
            position: { x: 1, y: 0 },
            connections: ['step-4']
          },
          {
            stepId: 'step-3',
            type: 'constraint_evaluation',
            position: { x: 1, y: 1 },
            connections: ['step-4']
          },
          {
            stepId: 'step-4',
            type: 'solution_synthesis',
            position: { x: 2, y: 0.5 },
            connections: []
          }
        ]
      };

      await reasoningCapture.captureReasoningChain(visualChain);

      // Get visualization data
      const vizData = await transparencySystem.getReasoningVisualization('visual-chain-001');

      expect(vizData.nodes).toHaveLength(4);
      expect(vizData.edges).toHaveLength(4); // Based on connections
      expect(vizData.layout).toBe('hierarchical');

      // Verify node properties
      const analysisNode = vizData.nodes.find(n => n.id === 'step-1');
      expect(analysisNode.type).toBe('requirement_analysis');
      expect(analysisNode.position).toEqual({ x: 0, y: 0 });
    });
  });

  describe('Human Intervention Tracking', () => {
    it('should track intervention requests and responses comprehensively', async () => {
      const intervention = {
        id: 'intervention-track-001',
        requestTime: new Date().toISOString(),
        agentId: 'agent-coder-001',
        context: {
          taskId: 'auth-implementation',
          decision: 'Choose password hashing algorithm',
          options: [
            { id: 'bcrypt', security: 'high', performance: 'medium' },
            { id: 'argon2', security: 'highest', performance: 'low' },
            { id: 'scrypt', security: 'high', performance: 'high' }
          ],
          urgency: 'medium',
          impact: 'high'
        },
        humanResponse: {
          responseTime: new Date(Date.now() + 120000).toISOString(), // 2 minutes later
          decision: 'argon2',
          reasoning: 'Security is priority for authentication, performance impact acceptable',
          confidence: 0.85,
          additionalNotes: 'Consider performance monitoring after implementation'
        },
        impact: {
          decisionTime: 120000, // 2 minutes
          taskDelay: 0, // No delay to overall task
          qualityImprovement: 0.2, // 20% improvement in security
          agentLearning: 'High - will improve future security decisions'
        }
      };

      await interventionTracker.trackIntervention(intervention);

      // Verify intervention was recorded
      const trackedIntervention = await mockDatabase.getIntervention('intervention-track-001');
      expect(trackedIntervention).toBeDefined();
      expect(trackedIntervention.humanResponse.decision).toBe('argon2');

      // Verify tracking metrics
      const trackingMetrics = await interventionTracker.getInterventionMetrics({
        agentId: 'agent-coder-001',
        timeRange: 'last_24h'
      });

      expect(trackingMetrics.totalInterventions).toBe(1);
      expect(trackingMetrics.averageResponseTime).toBe(120000);
      expect(trackingMetrics.qualityImpact).toBe(0.2);
    });

    it('should analyze intervention patterns and frequency', async () => {
      // Track multiple interventions over time
      const interventions = [
        {
          id: 'pattern-001',
          agentId: 'agent-coder-001',
          category: 'security_decision',
          responseTime: 180000,
          outcome: 'approved'
        },
        {
          id: 'pattern-002',
          agentId: 'agent-coder-001',
          category: 'security_decision',
          responseTime: 120000,
          outcome: 'modified'
        },
        {
          id: 'pattern-003',
          agentId: 'agent-reviewer-001',
          category: 'code_quality',
          responseTime: 300000,
          outcome: 'rejected'
        }
      ];

      for (const intervention of interventions) {
        await interventionTracker.trackIntervention(intervention);
      }

      // Analyze patterns
      const patternAnalysis = await interventionTracker.analyzeInterventionPatterns({
        agentId: 'agent-coder-001'
      });

      expect(patternAnalysis.mostCommonCategory).toBe('security_decision');
      expect(patternAnalysis.averageResponseTime).toBe(150000);
      expect(patternAnalysis.approvalRate).toBe(0.5); // 1 approved, 1 modified out of 2

      // Verify learning opportunities
      expect(patternAnalysis.learningOpportunities).toContain('security_decision');
      expect(patternAnalysis.recommendedTraining).toBeDefined();
    });

    it('should track intervention effectiveness and agent learning', async () => {
      const learningIntervention = {
        id: 'learning-001',
        agentId: 'agent-researcher-001',
        preInterventionState: {
          confidenceInDecision: 0.6,
          knowledgeGaps: ['OAuth2 implementation details', 'Security best practices'],
          decisionQuality: 0.7
        },
        intervention: {
          type: 'guidance',
          content: 'OAuth2 security considerations and implementation patterns',
          resources: ['OAuth2 RFC', 'Security checklist', 'Code examples']
        },
        postInterventionState: {
          confidenceInDecision: 0.9,
          knowledgeGaps: [], // Gaps filled
          decisionQuality: 0.95,
          newCapabilities: ['OAuth2 security assessment', 'Token validation patterns']
        },
        followupTasks: [
          {
            taskId: 'oauth-followup-001',
            outcome: 'successful',
            qualityScore: 0.92,
            independentCompletion: true
          }
        ]
      };

      await interventionTracker.trackLearningIntervention(learningIntervention);

      // Verify learning tracking
      const learningMetrics = await interventionTracker.getLearningMetrics('agent-researcher-001');

      expect(learningMetrics.knowledgeGrowth.oauth2).toBe(0.3); // From 0.6 to 0.9 confidence
      expect(learningMetrics.independenceImprovement).toBe(true);
      expect(learningMetrics.qualityImprovement).toBe(0.25); // From 0.7 to 0.95

      // Verify intervention effectiveness
      const effectiveness = await interventionTracker.calculateInterventionEffectiveness('learning-001');
      expect(effectiveness.score).toBeGreaterThan(0.8);
      expect(effectiveness.sustainedImprovement).toBe(true);
    });

    it('should support intervention audit trails for compliance', async () => {
      const auditableIntervention = {
        id: 'audit-001',
        timestamp: new Date().toISOString(),
        agentId: 'agent-financial-001',
        humanId: 'user-compliance-officer-001',
        context: {
          taskId: 'payment-processing-implementation',
          complianceRequirement: 'PCI-DSS',
          riskLevel: 'high',
          regulatoryContext: 'Financial services'
        },
        intervention: {
          type: 'compliance_review',
          decision: 'Additional security measures required',
          requirements: [
            'End-to-end encryption for card data',
            'Secure key management',
            'Audit logging for all transactions'
          ]
        },
        auditTrail: {
          reviewerId: 'user-compliance-officer-001',
          reviewerRole: 'Compliance Officer',
          approvalLevel: 'L2',
          digitalSignature: 'audit-signature-hash-001',
          regulatoryReference: 'PCI-DSS-3.2.1-req-3'
        }
      };

      await interventionTracker.createAuditableIntervention(auditableIntervention);

      // Verify audit trail
      const auditTrail = await interventionTracker.getAuditTrail('audit-001');

      expect(auditTrail.compliant).toBe(true);
      expect(auditTrail.regulatoryReference).toBe('PCI-DSS-3.2.1-req-3');
      expect(auditTrail.digitalSignature).toBe('audit-signature-hash-001');

      // Verify compliance reporting
      const complianceReport = await interventionTracker.generateComplianceReport({
        timeRange: 'last_30_days',
        regulatoryFramework: 'PCI-DSS'
      });

      expect(complianceReport.totalInterventions).toBe(1);
      expect(complianceReport.complianceRate).toBe(1.0);
      expect(complianceReport.riskMitigation).toBeDefined();
    });
  });

  describe('Agent Status Monitoring', () => {
    it('should monitor agent status with real-time updates', async () => {
      const agentStatuses = [
        {
          agentId: 'agent-researcher-001',
          status: 'active',
          currentTask: 'API research',
          progress: 0.65,
          performance: {
            tasksCompleted: 8,
            averageTaskTime: 1800000, // 30 minutes
            qualityScore: 0.88,
            errorRate: 0.05
          },
          resources: {
            memoryUsage: 0.45,
            cpuUsage: 0.23,
            networkActivity: 0.12
          }
        },
        {
          agentId: 'agent-coder-001',
          status: 'active',
          currentTask: 'Authentication middleware',
          progress: 0.3,
          performance: {
            tasksCompleted: 12,
            averageTaskTime: 3600000, // 60 minutes
            qualityScore: 0.92,
            errorRate: 0.02
          },
          resources: {
            memoryUsage: 0.67,
            cpuUsage: 0.45,
            networkActivity: 0.08
          }
        }
      ];

      for (const status of agentStatuses) {
        await statusMonitor.updateAgentStatus(status);
      }

      // Verify status monitoring
      const swarmStatus = await statusMonitor.getSwarmStatus();

      expect(swarmStatus.totalAgents).toBe(2);
      expect(swarmStatus.activeAgents).toBe(2);
      expect(swarmStatus.averageProgress).toBe(0.475);
      expect(swarmStatus.overallPerformance.qualityScore).toBeCloseTo(0.9, 1);

      // Verify individual agent status
      const researcherStatus = await statusMonitor.getAgentStatus('agent-researcher-001');
      expect(researcherStatus.currentTask).toBe('API research');
      expect(researcherStatus.performance.qualityScore).toBe(0.88);
    });

    it('should detect and alert on agent performance issues', async () => {
      const problematicStatus = {
        agentId: 'agent-problematic-001',
        status: 'degraded',
        currentTask: 'Database integration',
        progress: 0.15, // Low progress
        performance: {
          tasksCompleted: 3,
          averageTaskTime: 7200000, // 2 hours (high)
          qualityScore: 0.65, // Low quality
          errorRate: 0.25 // High error rate
        },
        resources: {
          memoryUsage: 0.95, // High memory usage
          cpuUsage: 0.85, // High CPU usage
          networkActivity: 0.02 // Low network activity
        },
        issues: [
          'High memory consumption detected',
          'Task completion time above threshold',
          'Quality score below acceptable range'
        ]
      };

      await statusMonitor.updateAgentStatus(problematicStatus);

      // Check for performance alerts
      const alerts = await statusMonitor.getPerformanceAlerts();

      expect(alerts.length).toBeGreaterThan(0);

      const memoryAlert = alerts.find(alert => alert.type === 'memory_usage');
      expect(memoryAlert).toBeDefined();
      expect(memoryAlert.severity).toBe('high');

      const qualityAlert = alerts.find(alert => alert.type === 'quality_degradation');
      expect(qualityAlert).toBeDefined();
      expect(qualityAlert.agentId).toBe('agent-problematic-001');

      // Verify alert recommendations
      expect(memoryAlert.recommendations).toContain('Consider restarting agent');
    });

    it('should track agent collaboration and coordination', async () => {
      const collaborationEvent = {
        id: 'collab-001',
        timestamp: new Date().toISOString(),
        type: 'task_handoff',
        fromAgent: {
          id: 'agent-researcher-001',
          type: 'researcher'
        },
        toAgent: {
          id: 'agent-coder-001',
          type: 'coder'
        },
        handoffData: {
          taskId: 'auth-system-implementation',
          deliverables: [
            'Authentication requirements document',
            'Security specification',
            'API endpoint definitions'
          ],
          qualityMetrics: {
            completeness: 0.95,
            clarity: 0.88,
            accuracy: 0.92
          }
        },
        coordinationMetrics: {
          handoffTime: 300000, // 5 minutes
          informationLoss: 0.05, // 5% information loss
          continuityScore: 0.9
        }
      };

      await statusMonitor.trackCollaboration(collaborationEvent);

      // Verify collaboration tracking
      const collabMetrics = await statusMonitor.getCollaborationMetrics({
        swarmId: 'swarm-web-portal-001',
        timeRange: 'last_24h'
      });

      expect(collabMetrics.handoffs).toBe(1);
      expect(collabMetrics.averageHandoffTime).toBe(300000);
      expect(collabMetrics.averageContinuity).toBe(0.9);

      // Check agent coordination effectiveness
      const coordEffectiveness = await statusMonitor.getCoordinationEffectiveness();
      expect(coordEffectiveness.researcherToCoder).toBeGreaterThan(0.8);
    });

    it('should provide comprehensive status dashboard data', async () => {
      // Set up various agent statuses
      await statusMonitor.updateAgentStatus({
        agentId: 'agent-001',
        status: 'active',
        performance: { qualityScore: 0.9 },
        currentTask: 'Task A'
      });

      await statusMonitor.updateAgentStatus({
        agentId: 'agent-002',
        status: 'idle',
        performance: { qualityScore: 0.85 },
        lastTask: 'Task B'
      });

      await statusMonitor.updateAgentStatus({
        agentId: 'agent-003',
        status: 'error',
        performance: { qualityScore: 0.7 },
        error: 'Network connection failed'
      });

      // Get dashboard data
      const dashboardData = await transparencySystem.getStatusDashboard();

      expect(dashboardData.agentCount.total).toBe(3);
      expect(dashboardData.agentCount.active).toBe(1);
      expect(dashboardData.agentCount.idle).toBe(1);
      expect(dashboardData.agentCount.error).toBe(1);

      expect(dashboardData.performance.averageQuality).toBeCloseTo(0.82, 2);
      expect(dashboardData.performance.healthScore).toBeDefined();

      // Verify status distribution
      expect(dashboardData.statusDistribution.active).toBe(0.333);
      expect(dashboardData.statusDistribution.error).toBe(0.333);

      // Check trending data
      expect(dashboardData.trends.qualityTrend).toBeDefined();
      expect(dashboardData.trends.activityTrend).toBeDefined();
    });

    it('should export transparency data for external analysis', async () => {
      // Add various data points
      await decisionLogger.logDecision({
        id: 'export-decision-001',
        decision: 'Test decision for export'
      });

      await interventionTracker.trackIntervention({
        id: 'export-intervention-001',
        context: { decision: 'Test intervention' }
      });

      await statusMonitor.updateAgentStatus({
        agentId: 'export-agent-001',
        status: 'active'
      });

      // Export data
      const exportData = await transparencySystem.exportTransparencyData({
        format: 'json',
        timeRange: 'last_24h',
        includePersonalData: false
      });

      expect(exportData.decisions).toBeDefined();
      expect(exportData.interventions).toBeDefined();
      expect(exportData.agentStatuses).toBeDefined();

      expect(exportData.metadata.exportTime).toBeDefined();
      expect(exportData.metadata.dataCompliance).toBe(true);

      // Verify CSV export option
      const csvExport = await transparencySystem.exportTransparencyData({
        format: 'csv',
        dataTypes: ['decisions', 'interventions']
      });

      expect(csvExport.files.decisions).toContain('id,decision,timestamp');
      expect(csvExport.files.interventions).toContain('id,context,responseTime');
    });
  });
});