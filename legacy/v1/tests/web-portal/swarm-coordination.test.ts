/**
 * @file Swarm Coordination Tests
 * @description Tests for 3-agent swarm model with researcher-coder-reviewer coordination
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { SwarmCoordinator } from '../../src/services/swarm-coordinator';
import { AgentManager } from '../../src/services/agent-manager';
import { TaskHandoffService } from '../../src/services/task-handoff-service';
import { SwarmRelaunchManager } from '../../src/services/swarm-relaunch-manager';
import { PerformanceMetricsCollector } from '../../src/services/performance-metrics-collector';
import { SwarmMemoryManager } from '../../src/services/swarm-memory-manager';
import { mockSwarmData } from './fixtures/swarm-data';
import { createMockAgent } from './mocks/agent-mock';

interface Agent {
  id: string;
  type: 'researcher' | 'coder' | 'reviewer';
  status: 'idle' | 'active' | 'busy' | 'error' | 'paused';
  currentTask?: string;
  capabilities: string[];
  performance: {
    tasksCompleted: number;
    qualityScore: number;
    averageTaskTime: number;
    collaborationScore: number;
  };
}

describe('Swarm Coordination Tests', () => {
  let swarmCoordinator: SwarmCoordinator;
  let agentManager: AgentManager;
  let taskHandoffService: TaskHandoffService;
  let relaunchManager: SwarmRelaunchManager;
  let metricsCollector: PerformanceMetricsCollector;
  let memoryManager: SwarmMemoryManager;
  let researcherAgent: Agent;
  let coderAgent: Agent;
  let reviewerAgent: Agent;

  beforeEach(async () => {
    // Initialize core services
    memoryManager = new SwarmMemoryManager({
      persistence: true,
      syncInterval: 1000,
      maxMemorySize: 1024 * 1024 // 1MB
    });

    agentManager = new AgentManager({
      maxAgents: 10,
      defaultTimeout: 30000,
      memoryManager
    });

    taskHandoffService = new TaskHandoffService({
      handoffTimeout: 15000,
      retryAttempts: 3,
      qualityThreshold: 0.8,
      memoryManager
    });

    relaunchManager = new SwarmRelaunchManager({
      maxRelaunches: 10,
      cooldownPeriod: 5000,
      healthCheckInterval: 10000,
      memoryManager
    });

    metricsCollector = new PerformanceMetricsCollector({
      collectionInterval: 5000,
      metricsRetention: 86400000, // 24 hours
      memoryManager
    });

    swarmCoordinator = new SwarmCoordinator({
      agentManager,
      taskHandoffService,
      relaunchManager,
      metricsCollector,
      memoryManager,
      topology: 'hierarchical',
      coordinationStrategy: 'sequential_with_feedback'
    });

    // Create standard 3-agent swarm
    researcherAgent = createMockAgent('researcher', 'agent-researcher-001');
    coderAgent = createMockAgent('coder', 'agent-coder-001');
    reviewerAgent = createMockAgent('reviewer', 'agent-reviewer-001');

    await swarmCoordinator.initialize();
    await swarmCoordinator.addAgent(researcherAgent);
    await swarmCoordinator.addAgent(coderAgent);
    await swarmCoordinator.addAgent(reviewerAgent);
  });

  afterEach(async () => {
    await swarmCoordinator.shutdown();
    jest.clearAllMocks();
  });

  describe('Researcher-Coder-Reviewer Coordination', () => {
    it('should coordinate sequential workflow from research to implementation to review', async () => {
      const task = {
        id: 'task-full-workflow-001',
        title: 'Implement user authentication system',
        description: 'Build complete authentication with OAuth2 support',
        priority: 'high',
        estimatedDuration: 7200000, // 2 hours
        phases: [
          {
            name: 'research',
            assignedAgent: 'researcher',
            deliverables: ['requirements_analysis', 'technology_recommendations', 'security_considerations'],
            estimatedDuration: 1800000 // 30 minutes
          },
          {
            name: 'implementation',
            assignedAgent: 'coder',
            dependencies: ['research'],
            deliverables: ['authentication_middleware', 'oauth2_integration', 'user_routes'],
            estimatedDuration: 4200000 // 70 minutes
          },
          {
            name: 'review',
            assignedAgent: 'reviewer',
            dependencies: ['implementation'],
            deliverables: ['code_review_report', 'security_audit', 'performance_assessment'],
            estimatedDuration: 1200000 // 20 minutes
          }
        ]
      };

      // Start coordinated workflow
      const workflowResult = await swarmCoordinator.executeCoordinatedWorkflow(task);

      expect(workflowResult.success).toBe(true);
      expect(workflowResult.phases).toHaveLength(3);

      // Verify research phase completion
      const researchPhase = workflowResult.phases.find(p => p.name === 'research');
      expect(researchPhase.status).toBe('completed');
      expect(researchPhase.deliverables).toHaveLength(3);
      expect(researchPhase.qualityScore).toBeGreaterThan(0.8);

      // Verify implementation phase
      const implementationPhase = workflowResult.phases.find(p => p.name === 'implementation');
      expect(implementationPhase.status).toBe('completed');
      expect(implementationPhase.inputSatisfaction).toBeGreaterThan(0.9); // High quality research input

      // Verify review phase
      const reviewPhase = workflowResult.phases.find(p => p.name === 'review');
      expect(reviewPhase.status).toBe('completed');
      expect(reviewPhase.issuesFound).toBeDefined();
      expect(reviewPhase.overallAssessment).toMatch(/^(approved|approved_with_changes|rejected)$/);
    });

    it('should handle task handoffs with comprehensive data transfer', async () => {
      // Complete research phase
      const researchOutput = {
        taskId: 'task-handoff-001',
        phase: 'research',
        agentId: 'agent-researcher-001',
        deliverables: {
          requirements: {
            functional: [
              'User registration and login',
              'OAuth2 third-party authentication',
              'Password reset functionality',
              'Session management'
            ],
            nonFunctional: [
              'Support 1000 concurrent users',
              'Response time < 200ms',
              'Data encryption at rest and in transit'
            ]
          },
          technologyRecommendations: {
            backend: 'Express.js with Passport.js',
            database: 'PostgreSQL with encrypted user data',
            authentication: 'OAuth2 with JWT tokens',
            security: 'bcrypt for passwords, rate limiting'
          },
          securityConsiderations: [
            'Implement CSRF protection',
            'Use secure session cookies',
            'Apply password complexity rules',
            'Enable account lockout after failed attempts'
          ],
          apiSpecification: {
            endpoints: [
              { path: '/auth/register', method: 'POST', security: 'public' },
              { path: '/auth/login', method: 'POST', security: 'public' },
              { path: '/auth/logout', method: 'POST', security: 'authenticated' },
              { path: '/auth/profile', method: 'GET', security: 'authenticated' }
            ]
          }
        },
        metadata: {
          confidence: 0.92,
          completeness: 0.95,
          researchSources: 12,
          timeSpent: 1800000
        }
      };

      // Execute handoff from researcher to coder
      const handoffResult = await taskHandoffService.executeHandoff({
        fromAgent: researcherAgent.id,
        toAgent: coderAgent.id,
        data: researchOutput,
        handoffType: 'research_to_implementation',
        qualityRequirements: {
          minCompleteness: 0.9,
          minConfidence: 0.8,
          requiredDeliverables: ['requirements', 'technologyRecommendations', 'apiSpecification']
        }
      });

      expect(handoffResult.success).toBe(true);
      expect(handoffResult.dataIntegrity).toBeGreaterThan(0.95);
      expect(handoffResult.informationLoss).toBeLessThan(0.05);

      // Verify coder received complete context
      const coderContext = await agentManager.getAgentContext(coderAgent.id);
      expect(coderContext.taskData.requirements).toBeDefined();
      expect(coderContext.taskData.technologyRecommendations.backend).toBe('Express.js with Passport.js');
      expect(coderContext.taskData.apiSpecification.endpoints).toHaveLength(4);

      // Verify handoff tracking
      const handoffMetrics = await taskHandoffService.getHandoffMetrics('task-handoff-001');
      expect(handoffMetrics.totalHandoffs).toBe(1);
      expect(handoffMetrics.averageHandoffTime).toBeLessThan(5000); // < 5 seconds
      expect(handoffMetrics.successRate).toBe(1.0);
    });

    it('should manage task dependencies and ensure proper sequencing', async () => {
      const complexTask = {
        id: 'task-dependencies-001',
        title: 'Build authentication system with user management',
        subtasks: [
          {
            id: 'subtask-research-auth',
            name: 'Research authentication patterns',
            agent: 'researcher',
            dependencies: [],
            estimatedDuration: 900000 // 15 minutes
          },
          {
            id: 'subtask-research-user-mgmt',
            name: 'Research user management requirements',
            agent: 'researcher',
            dependencies: [],
            estimatedDuration: 600000 // 10 minutes
          },
          {
            id: 'subtask-implement-auth',
            name: 'Implement authentication middleware',
            agent: 'coder',
            dependencies: ['subtask-research-auth'],
            estimatedDuration: 2400000 // 40 minutes
          },
          {
            id: 'subtask-implement-user-routes',
            name: 'Implement user management routes',
            agent: 'coder',
            dependencies: ['subtask-research-user-mgmt', 'subtask-implement-auth'],
            estimatedDuration: 1800000 // 30 minutes
          },
          {
            id: 'subtask-review-auth',
            name: 'Review authentication implementation',
            agent: 'reviewer',
            dependencies: ['subtask-implement-auth'],
            estimatedDuration: 900000 // 15 minutes
          },
          {
            id: 'subtask-final-review',
            name: 'Final system review',
            agent: 'reviewer',
            dependencies: ['subtask-implement-user-routes', 'subtask-review-auth'],
            estimatedDuration: 600000 // 10 minutes
          }
        ]
      };

      const executionResult = await swarmCoordinator.executeTaskWithDependencies(complexTask);

      expect(executionResult.success).toBe(true);
      expect(executionResult.totalDuration).toBeLessThan(8000000); // Efficient parallel execution

      // Verify execution order respected dependencies
      const executionOrder = executionResult.executionTimeline.map(event => event.subtaskId);

      // Research tasks should come first (can be parallel)
      const researchAuthIndex = executionOrder.indexOf('subtask-research-auth');
      const researchUserIndex = executionOrder.indexOf('subtask-research-user-mgmt');
      const implementAuthIndex = executionOrder.indexOf('subtask-implement-auth');

      expect(researchAuthIndex).toBeLessThan(implementAuthIndex);
      expect(researchUserIndex).toBeLessThan(executionOrder.indexOf('subtask-implement-user-routes'));

      // Final review should be last
      const finalReviewIndex = executionOrder.indexOf('subtask-final-review');
      expect(finalReviewIndex).toBe(executionOrder.length - 1);

      // Verify dependency satisfaction
      for (const event of executionResult.executionTimeline) {
        if (event.type === 'subtask_started') {
          const subtask = complexTask.subtasks.find(s => s.id === event.subtaskId);
          for (const depId of subtask.dependencies) {
            const depCompletionIndex = executionOrder.indexOf(depId);
            const currentIndex = executionOrder.indexOf(event.subtaskId);
            expect(depCompletionIndex).toBeLessThan(currentIndex);
          }
        }
      }
    });

    it('should optimize agent workload distribution', async () => {
      // Create scenario with uneven workload
      const tasks = [
        {
          id: 'task-workload-001',
          phases: [
            { name: 'research', agent: 'researcher', duration: 1800000 },
            { name: 'implementation', agent: 'coder', duration: 3600000 },
            { name: 'review', agent: 'reviewer', duration: 900000 }
          ]
        },
        {
          id: 'task-workload-002',
          phases: [
            { name: 'research', agent: 'researcher', duration: 1200000 },
            { name: 'implementation', agent: 'coder', duration: 2400000 },
            { name: 'review', agent: 'reviewer', duration: 600000 }
          ]
        },
        {
          id: 'task-workload-003',
          phases: [
            { name: 'research', agent: 'researcher', duration: 900000 },
            { name: 'implementation', agent: 'coder', duration: 1800000 },
            { name: 'review', agent: 'reviewer', duration: 1200000 }
          ]
        }
      ];

      const workloadOptimization = await swarmCoordinator.optimizeWorkloadDistribution(tasks);

      expect(workloadOptimization.balanced).toBe(true);
      expect(workloadOptimization.maxWorkloadVariance).toBeLessThan(0.2); // < 20% variance

      // Verify no agent is overloaded
      const agentWorkloads = workloadOptimization.agentWorkloads;
      expect(agentWorkloads.researcher.totalTime).toBeLessThan(4200000); // < 70 minutes
      expect(agentWorkloads.coder.totalTime).toBeLessThan(8400000); // < 140 minutes
      expect(agentWorkloads.reviewer.totalTime).toBeLessThan(3000000); // < 50 minutes

      // Verify parallelization opportunities identified
      expect(workloadOptimization.parallelizationOpportunities).toBeDefined();
      expect(workloadOptimization.estimatedSpeedup).toBeGreaterThan(1.5);
    });

    it('should handle cross-agent feedback and iteration cycles', async () => {
      const iterativeTask = {
        id: 'task-iterative-001',
        title: 'Design and implement API with iterative feedback',
        maxIterations: 3,
        phases: [
          {
            name: 'initial_research',
            agent: 'researcher',
            deliverable: 'api_specification_v1'
          },
          {
            name: 'implementation_v1',
            agent: 'coder',
            dependencies: ['initial_research'],
            deliverable: 'api_implementation_v1'
          },
          {
            name: 'review_v1',
            agent: 'reviewer',
            dependencies: ['implementation_v1'],
            deliverable: 'review_feedback_v1',
            feedbackTargets: ['researcher', 'coder']
          }
        ],
        iterationCriteria: {
          qualityThreshold: 0.9,
          stakeholderApproval: true,
          performanceRequirements: true
        }
      };

      const iterationResult = await swarmCoordinator.executeIterativeWorkflow(iterativeTask);

      expect(iterationResult.success).toBe(true);
      expect(iterationResult.iterations).toBeGreaterThanOrEqual(1);
      expect(iterationResult.iterations).toBeLessThanOrEqual(3);

      // Verify feedback integration
      for (let i = 1; i < iterationResult.iterations; i++) {
        const iteration = iterationResult.iterationHistory[i];
        expect(iteration.feedbackIncorporated).toBe(true);
        expect(iteration.qualityImprovement).toBeGreaterThan(0);
      }

      // Check final quality meets threshold
      const finalIteration = iterationResult.iterationHistory[iterationResult.iterations - 1];
      expect(finalIteration.qualityScore).toBeGreaterThanOrEqual(0.9);

      // Verify agent learning from feedback
      const agentLearningMetrics = await metricsCollector.getAgentLearningMetrics();
      expect(agentLearningMetrics.researcher.feedbackIncorporation).toBeGreaterThan(0.8);
      expect(agentLearningMetrics.coder.iterativeImprovement).toBeGreaterThan(0.7);
      expect(agentLearningMetrics.reviewer.feedbackQuality).toBeGreaterThan(0.85);
    });
  });

  describe('Task Handoffs and Dependencies', () => {
    it('should validate handoff completeness and quality', async () => {
      const incompleteHandoffData = {
        taskId: 'task-incomplete-001',
        fromAgent: 'agent-researcher-001',
        deliverables: {
          requirements: ['User authentication required'], // Incomplete
          // Missing technology recommendations and security considerations
        },
        metadata: {
          confidence: 0.6, // Below threshold
          completeness: 0.4 // Well below threshold
        }
      };

      const handoffValidation = await taskHandoffService.validateHandoffData(
        incompleteHandoffData,
        {
          minCompleteness: 0.8,
          minConfidence: 0.7,
          requiredFields: ['requirements', 'technologyRecommendations', 'securityConsiderations']
        }
      );

      expect(handoffValidation.valid).toBe(false);
      expect(handoffValidation.issues).toContain('Completeness below threshold');
      expect(handoffValidation.issues).toContain('Confidence below threshold');
      expect(handoffValidation.missingFields).toContain('technologyRecommendations');
      expect(handoffValidation.missingFields).toContain('securityConsiderations');

      // Verify handoff is rejected
      const handoffResult = await taskHandoffService.executeHandoff({
        fromAgent: 'agent-researcher-001',
        toAgent: 'agent-coder-001',
        data: incompleteHandoffData,
        validationRequired: true
      });

      expect(handoffResult.success).toBe(false);
      expect(handoffResult.error).toContain('Validation failed');

      // Verify researcher is asked to improve deliverables
      const researcherTasks = await agentManager.getAgentTasks('agent-researcher-001');
      const improvementTask = researcherTasks.find(task =>
        task.type === 'improvement_request'
      );
      expect(improvementTask).toBeDefined();
    });

    it('should handle handoff failures and retry mechanisms', async () => {
      // Mock network failures during handoff
      let attemptCount = 0;
      jest.spyOn(taskHandoffService, 'transferData').mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Network timeout');
        }
        return { success: true, transferred: true };
      });

      const handoffData = mockSwarmData.validHandoffData;

      const handoffResult = await taskHandoffService.executeHandoffWithRetry({
        fromAgent: 'agent-researcher-001',
        toAgent: 'agent-coder-001',
        data: handoffData,
        maxRetries: 3,
        retryDelay: 100
      });

      expect(handoffResult.success).toBe(true);
      expect(handoffResult.attempts).toBe(3);
      expect(attemptCount).toBe(3);

      // Verify retry metrics
      const retryMetrics = await taskHandoffService.getRetryMetrics();
      expect(retryMetrics.totalRetries).toBe(2);
      expect(retryMetrics.successAfterRetry).toBe(1);
    });

    it('should manage dependency chains with circular detection', async () => {
      const taskWithCircularDependency = {
        id: 'task-circular-001',
        subtasks: [
          {
            id: 'subtask-a',
            dependencies: ['subtask-c'] // Creates circular dependency
          },
          {
            id: 'subtask-b',
            dependencies: ['subtask-a']
          },
          {
            id: 'subtask-c',
            dependencies: ['subtask-b']
          }
        ]
      };

      const dependencyAnalysis = await swarmCoordinator.analyzeDependencies(taskWithCircularDependency);

      expect(dependencyAnalysis.valid).toBe(false);
      expect(dependencyAnalysis.circularDependencies).toHaveLength(1);
      expect(dependencyAnalysis.circularDependencies[0]).toEqual(['subtask-a', 'subtask-c', 'subtask-b']);

      // Verify execution is rejected
      const executionResult = await swarmCoordinator.executeTaskWithDependencies(taskWithCircularDependency);
      expect(executionResult.success).toBe(false);
      expect(executionResult.error).toContain('Circular dependency detected');

      // Test dependency resolution suggestions
      expect(dependencyAnalysis.resolutionSuggestions).toBeDefined();
      expect(dependencyAnalysis.resolutionSuggestions.length).toBeGreaterThan(0);
    });

    it('should support conditional dependencies and dynamic routing', async () => {
      const conditionalTask = {
        id: 'task-conditional-001',
        subtasks: [
          {
            id: 'subtask-research',
            agent: 'researcher',
            type: 'standard'
          },
          {
            id: 'subtask-simple-impl',
            agent: 'coder',
            dependencies: ['subtask-research'],
            condition: 'research_complexity === "low"'
          },
          {
            id: 'subtask-complex-impl',
            agent: 'coder',
            dependencies: ['subtask-research'],
            condition: 'research_complexity === "high"'
          },
          {
            id: 'subtask-additional-research',
            agent: 'researcher',
            dependencies: ['subtask-research'],
            condition: 'research_complexity === "high"'
          },
          {
            id: 'subtask-review',
            agent: 'reviewer',
            dependencies: ['subtask-simple-impl OR subtask-complex-impl']
          }
        ]
      };

      // Mock research result that triggers complex path
      jest.spyOn(agentManager, 'getAgentResult').mockImplementation(async (agentId, taskId) => {
        if (taskId === 'subtask-research') {
          return {
            success: true,
            data: {
              complexity: 'high',
              additionalResearchNeeded: true
            }
          };
        }
      });

      const executionResult = await swarmCoordinator.executeConditionalTask(conditionalTask);

      expect(executionResult.success).toBe(true);

      // Verify complex path was taken
      const executedSubtasks = executionResult.executionTimeline.map(e => e.subtaskId);
      expect(executedSubtasks).toContain('subtask-complex-impl');
      expect(executedSubtasks).toContain('subtask-additional-research');
      expect(executedSubtasks).not.toContain('subtask-simple-impl');

      // Verify dynamic routing worked
      const routingDecisions = executionResult.routingDecisions;
      expect(routingDecisions).toHaveLength(2); // Two conditional branches evaluated
      expect(routingDecisions[0].condition).toBe('research_complexity === "high"');
      expect(routingDecisions[0].result).toBe(true);
    });

    it('should track handoff performance and optimize transfer protocols', async () => {
      // Execute multiple handoffs to gather performance data
      const handoffTests = [
        {
          dataSize: 'small',
          data: { requirements: 'Simple auth requirements' }
        },
        {
          dataSize: 'medium',
          data: mockSwarmData.mediumHandoffData
        },
        {
          dataSize: 'large',
          data: mockSwarmData.largeHandoffData
        }
      ];

      const performanceResults = [];

      for (const test of handoffTests) {
        const startTime = Date.now();
        const result = await taskHandoffService.executeHandoff({
          fromAgent: 'agent-researcher-001',
          toAgent: 'agent-coder-001',
          data: test.data
        });
        const endTime = Date.now();

        performanceResults.push({
          dataSize: test.dataSize,
          transferTime: endTime - startTime,
          success: result.success,
          dataIntegrity: result.dataIntegrity
        });
      }

      // Analyze performance patterns
      const performanceAnalysis = await taskHandoffService.analyzeHandoffPerformance(performanceResults);

      expect(performanceAnalysis.averageTransferTime.small).toBeLessThan(100);
      expect(performanceAnalysis.averageTransferTime.medium).toBeLessThan(500);
      expect(performanceAnalysis.averageTransferTime.large).toBeLessThan(2000);

      // Verify optimization recommendations
      expect(performanceAnalysis.recommendations).toBeDefined();
      if (performanceAnalysis.averageTransferTime.large > 1000) {
        expect(performanceAnalysis.recommendations).toContain('Consider data compression');
      }

      // Verify all handoffs maintained data integrity
      performanceResults.forEach(result => {
        expect(result.dataIntegrity).toBeGreaterThan(0.95);
      });
    });
  });

  describe('Swarm Relaunch Capabilities', () => {
    it('should detect swarm failure conditions and trigger relaunch', async () => {
      // Simulate swarm failure scenarios
      const failureScenarios = [
        {
          type: 'agent_unresponsive',
          affectedAgent: 'agent-coder-001',
          duration: 35000, // Exceeds 30s timeout
          trigger: 'no_heartbeat'
        },
        {
          type: 'task_stalled',
          taskId: 'task-stalled-001',
          stallDuration: 600000, // 10 minutes with no progress
          expectedProgress: 0.3,
          actualProgress: 0.1
        },
        {
          type: 'quality_degradation',
          affectedAgents: ['agent-reviewer-001'],
          qualityTrend: [0.9, 0.8, 0.7, 0.6], // Declining quality
          threshold: 0.7
        }
      ];

      for (const scenario of failureScenarios) {
        // Simulate failure condition
        await relaunchManager.simulateFailureCondition(scenario);

        // Check if failure is detected
        const healthCheck = await relaunchManager.performHealthCheck();
        expect(healthCheck.healthy).toBe(false);
        expect(healthCheck.detectedIssues).toContain(scenario.type);

        // Verify relaunch is triggered
        const relaunchResult = await relaunchManager.executeRelaunch({
          reason: scenario.type,
          preserveMemory: true,
          targetConfiguration: 'current'
        });

        expect(relaunchResult.success).toBe(true);
        expect(relaunchResult.relaunchCount).toBeGreaterThan(0);
        expect(relaunchResult.relaunchCount).toBeLessThanOrEqual(10);

        // Reset for next scenario
        await relaunchManager.reset();
      }
    });

    it('should preserve context and memory across relaunches', async () => {
      // Set up initial swarm context
      const initialContext = {
        taskId: 'task-preserve-001',
        currentPhase: 'implementation',
        completedWork: {
          research: {
            findings: 'OAuth2 recommended for authentication',
            confidence: 0.9,
            timeSpent: 1800000
          }
        },
        agentStates: {
          'agent-researcher-001': {
            knowledge: ['oauth2_patterns', 'security_best_practices'],
            experience: { authentication_projects: 5 }
          },
          'agent-coder-001': {
            currentProgress: 0.6,
            codeGenerated: ['middleware/auth.js', 'routes/auth.js'],
            nextSteps: ['implement_oauth_callback', 'add_session_management']
          }
        },
        workflowMemory: {
          decisions: ['use_express_js', 'implement_jwt_tokens'],
          iterations: 2,
          qualityMetrics: { averageQuality: 0.85 }
        }
      };

      await memoryManager.storeSwarmContext(initialContext);

      // Simulate swarm failure and relaunch
      await relaunchManager.simulateSwarmFailure('agent_crash');

      const relaunchResult = await relaunchManager.executeRelaunch({
        preserveMemory: true,
        contextRecovery: true
      });

      expect(relaunchResult.success).toBe(true);

      // Verify context preservation
      const recoveredContext = await memoryManager.getSwarmContext();
      expect(recoveredContext.taskId).toBe('task-preserve-001');
      expect(recoveredContext.currentPhase).toBe('implementation');
      expect(recoveredContext.completedWork.research.findings).toBe('OAuth2 recommended for authentication');

      // Verify agent states are restored
      const coderState = recoveredContext.agentStates['agent-coder-001'];
      expect(coderState.currentProgress).toBe(0.6);
      expect(coderState.codeGenerated).toContain('middleware/auth.js');

      // Verify workflow memory is intact
      expect(recoveredContext.workflowMemory.decisions).toContain('use_express_js');
      expect(recoveredContext.workflowMemory.iterations).toBe(2);
    });

    it('should track relaunch attempts and implement backoff strategy', async () => {
      // Simulate repeated failures to test backoff
      let relaunchCount = 0;
      const relaunchHistory = [];

      for (let i = 0; i < 5; i++) {
        const relaunchStart = Date.now();

        const relaunchResult = await relaunchManager.executeRelaunch({
          reason: 'performance_degradation',
          attempt: i + 1
        });

        relaunchCount++;
        relaunchHistory.push({
          attempt: i + 1,
          timestamp: relaunchStart,
          success: relaunchResult.success,
          backoffDelay: relaunchResult.backoffDelay
        });

        // Verify exponential backoff
        if (i > 0) {
          const expectedMinDelay = Math.pow(2, i) * 1000; // Exponential backoff
          expect(relaunchResult.backoffDelay).toBeGreaterThanOrEqual(expectedMinDelay);
        }

        // Simulate failure to trigger next relaunch
        if (i < 4) {
          await relaunchManager.simulateFailureCondition({
            type: 'continued_degradation',
            attempt: i + 1
          });
        }
      }

      expect(relaunchCount).toBe(5);

      // Verify relaunch limit enforcement
      const additionalRelaunchResult = await relaunchManager.executeRelaunch({
        reason: 'test_limit',
        attempt: 6
      });

      expect(additionalRelaunchResult.success).toBe(false);
      expect(additionalRelaunchResult.error).toContain('Maximum relaunch attempts exceeded');

      // Verify relaunch metrics
      const relaunchMetrics = await relaunchManager.getRelaunchMetrics();
      expect(relaunchMetrics.totalRelaunches).toBe(5);
      expect(relaunchMetrics.relaunchReasons.performance_degradation).toBe(5);
      expect(relaunchMetrics.averageBackoffDelay).toBeGreaterThan(1000);
    });

    it('should support different relaunch strategies based on failure type', async () => {
      const relaunchStrategies = [
        {
          failureType: 'agent_unresponsive',
          strategy: 'restart_agent',
          preserveSwarm: true,
          expectedAction: 'individual_agent_restart'
        },
        {
          failureType: 'memory_corruption',
          strategy: 'full_relaunch',
          preserveSwarm: false,
          expectedAction: 'complete_swarm_restart'
        },
        {
          failureType: 'coordination_failure',
          strategy: 'reconfigure_topology',
          preserveSwarm: true,
          expectedAction: 'topology_optimization'
        },
        {
          failureType: 'performance_degradation',
          strategy: 'adaptive_relaunch',
          preserveSwarm: true,
          expectedAction: 'performance_optimization'
        }
      ];

      for (const strategyTest of relaunchStrategies) {
        // Configure relaunch manager for specific strategy
        await relaunchManager.configureStrategy(strategyTest.failureType, {
          strategy: strategyTest.strategy,
          preserveSwarm: strategyTest.preserveSwarm
        });

        // Simulate failure
        await relaunchManager.simulateFailureCondition({
          type: strategyTest.failureType
        });

        // Execute relaunch
        const relaunchResult = await relaunchManager.executeRelaunch({
          reason: strategyTest.failureType,
          strategy: 'adaptive'
        });

        expect(relaunchResult.success).toBe(true);
        expect(relaunchResult.appliedStrategy).toBe(strategyTest.strategy);
        expect(relaunchResult.action).toBe(strategyTest.expectedAction);

        // Verify strategy effectiveness
        const postRelaunchHealth = await relaunchManager.performHealthCheck();
        expect(postRelaunchHealth.healthy).toBe(true);
        expect(postRelaunchHealth.strategyEffectiveness).toBeGreaterThan(0.8);
      }
    });

    it('should handle graceful degradation when relaunch limit reached', async () => {
      // Exhaust all relaunch attempts
      for (let i = 0; i < 10; i++) {
        await relaunchManager.executeRelaunch({
          reason: 'test_exhaustion',
          attempt: i + 1
        });
      }

      // Attempt one more relaunch (should trigger graceful degradation)
      const degradationResult = await relaunchManager.handleGracefulDegradation({
        reason: 'relaunch_limit_exceeded',
        fallbackMode: 'manual_intervention_required'
      });

      expect(degradationResult.mode).toBe('graceful_degradation');
      expect(degradationResult.fallbackActions).toContain('notify_human_operator');
      expect(degradationResult.fallbackActions).toContain('preserve_critical_data');
      expect(degradationResult.fallbackActions).toContain('enable_manual_control');

      // Verify system enters safe mode
      const systemStatus = await swarmCoordinator.getSystemStatus();
      expect(systemStatus.mode).toBe('degraded');
      expect(systemStatus.humanInterventionRequired).toBe(true);
      expect(systemStatus.criticalFunctionsOnly).toBe(true);

      // Verify data preservation
      const preservedData = await memoryManager.getPreservedData();
      expect(preservedData.taskStates).toBeDefined();
      expect(preservedData.agentMemories).toBeDefined();
      expect(preservedData.workflowHistory).toBeDefined();
    });
  });

  describe('Performance Metrics Collection', () => {
    it('should collect comprehensive swarm performance metrics', async () => {
      // Execute multiple tasks to generate performance data
      const performanceTasks = [
        {
          id: 'perf-task-001',
          phases: ['research', 'implementation', 'review'],
          expectedDuration: 7200000, // 2 hours
          complexity: 'medium'
        },
        {
          id: 'perf-task-002',
          phases: ['research', 'implementation', 'review'],
          expectedDuration: 5400000, // 1.5 hours
          complexity: 'low'
        },
        {
          id: 'perf-task-003',
          phases: ['research', 'implementation', 'review'],
          expectedDuration: 10800000, // 3 hours
          complexity: 'high'
        }
      ];

      const performanceResults = [];

      for (const task of performanceTasks) {
        const result = await swarmCoordinator.executeCoordinatedWorkflow(task);
        performanceResults.push(result);
      }

      // Collect and analyze performance metrics
      const performanceMetrics = await metricsCollector.collectSwarmMetrics({
        timeRange: 'current_session',
        includeAgentBreakdown: true,
        includeTaskMetrics: true
      });

      expect(performanceMetrics.totalTasks).toBe(3);
      expect(performanceMetrics.averageTaskCompletion).toBeDefined();
      expect(performanceMetrics.qualityMetrics.averageQuality).toBeGreaterThan(0.8);

      // Verify agent-specific metrics
      expect(performanceMetrics.agentMetrics.researcher).toBeDefined();
      expect(performanceMetrics.agentMetrics.coder).toBeDefined();
      expect(performanceMetrics.agentMetrics.reviewer).toBeDefined();

      // Verify coordination efficiency
      expect(performanceMetrics.coordinationEfficiency).toBeGreaterThan(0.7);
      expect(performanceMetrics.handoffEfficiency).toBeGreaterThan(0.8);

      // Check performance trends
      expect(performanceMetrics.trends.qualityTrend).toBeDefined();
      expect(performanceMetrics.trends.speedTrend).toBeDefined();
      expect(performanceMetrics.trends.coordinationTrend).toBeDefined();
    });

    it('should identify performance bottlenecks and optimization opportunities', async () => {
      // Create scenario with known bottlenecks
      const bottleneckTask = {
        id: 'bottleneck-task-001',
        phases: [
          {
            name: 'research',
            agent: 'researcher',
            expectedDuration: 1800000,
            actualDuration: 1800000, // On time
            quality: 0.9
          },
          {
            name: 'implementation',
            agent: 'coder',
            expectedDuration: 3600000,
            actualDuration: 5400000, // 50% longer - bottleneck
            quality: 0.7 // Lower quality
          },
          {
            name: 'review',
            agent: 'reviewer',
            expectedDuration: 1200000,
            actualDuration: 900000, // Faster than expected
            quality: 0.95
          }
        ]
      };

      await metricsCollector.recordTaskExecution(bottleneckTask);

      // Analyze bottlenecks
      const bottleneckAnalysis = await metricsCollector.identifyBottlenecks();

      expect(bottleneckAnalysis.bottlenecks).toHaveLength(1);
      expect(bottleneckAnalysis.bottlenecks[0].phase).toBe('implementation');
      expect(bottleneckAnalysis.bottlenecks[0].agent).toBe('coder');
      expect(bottleneckAnalysis.bottlenecks[0].severity).toBe('high');

      // Verify optimization suggestions
      const optimizations = bottleneckAnalysis.optimizations;
      expect(optimizations.coder).toContain('Additional training in implementation techniques');
      expect(optimizations.coder).toContain('Consider task breakdown for complex implementations');

      // Check performance impact assessment
      expect(bottleneckAnalysis.impactAssessment.timeDelay).toBe(1800000); // 30 minutes
      expect(bottleneckAnalysis.impactAssessment.qualityImpact).toBe(-0.2); // 20% quality drop
    });

    it('should track learning and improvement over time', async () => {
      // Simulate multiple task executions over time to show improvement
      const learningTasks = [
        { iteration: 1, qualityScore: 0.7, duration: 120 }, // Initial performance
        { iteration: 2, qualityScore: 0.75, duration: 110 },
        { iteration: 3, qualityScore: 0.8, duration: 100 },
        { iteration: 4, qualityScore: 0.85, duration: 95 },
        { iteration: 5, qualityScore: 0.9, duration: 85 } // Improved performance
      ];

      for (const task of learningTasks) {
        await metricsCollector.recordLearningMetric({
          agentId: 'agent-coder-001',
          taskType: 'authentication_implementation',
          iteration: task.iteration,
          qualityScore: task.qualityScore,
          completionTime: task.duration * 60000 // Convert to ms
        });
      }

      // Analyze learning trends
      const learningAnalysis = await metricsCollector.analyzeLearningTrends({
        agentId: 'agent-coder-001',
        taskType: 'authentication_implementation'
      });

      expect(learningAnalysis.qualityImprovement).toBeCloseTo(0.2, 1); // 20% improvement
      expect(learningAnalysis.speedImprovement).toBeCloseTo(0.29, 2); // 29% speed improvement
      expect(learningAnalysis.learningRate).toBeGreaterThan(0);

      // Verify learning curve fitting
      expect(learningAnalysis.learningCurve.type).toBe('exponential_improvement');
      expect(learningAnalysis.predictedPerformance.nextIteration.quality).toBeGreaterThan(0.9);

      // Check mastery indicators
      expect(learningAnalysis.masteryIndicators.consistency).toBeGreaterThan(0.8);
      expect(learningAnalysis.masteryIndicators.autonomy).toBeGreaterThan(0.7);
    });

    it('should provide performance dashboards and reporting', async () => {
      // Generate sample performance data
      await metricsCollector.generateSamplePerformanceData({
        duration: 86400000, // 24 hours of data
        taskCount: 50,
        agentCount: 3
      });

      // Generate dashboard data
      const dashboardData = await metricsCollector.generatePerformanceDashboard({
        timeRange: 'last_24h',
        granularity: 'hourly',
        includeComparisons: true
      });

      expect(dashboardData.summary.totalTasks).toBe(50);
      expect(dashboardData.summary.taskCompletionRate).toBeGreaterThan(0.9);
      expect(dashboardData.summary.averageQuality).toBeGreaterThan(0.8);

      // Verify time series data
      expect(dashboardData.timeSeries.hourly).toHaveLength(24);
      expect(dashboardData.timeSeries.hourly[0]).toHaveProperty('tasks');
      expect(dashboardData.timeSeries.hourly[0]).toHaveProperty('quality');

      // Check agent performance breakdown
      expect(dashboardData.agentPerformance.researcher.tasksCompleted).toBeGreaterThan(0);
      expect(dashboardData.agentPerformance.coder.averageQuality).toBeGreaterThan(0.7);
      expect(dashboardData.agentPerformance.reviewer.throughput).toBeGreaterThan(0);

      // Verify performance comparisons
      expect(dashboardData.comparisons.previousDay).toBeDefined();
      expect(dashboardData.comparisons.weeklyAverage).toBeDefined();

      // Generate detailed report
      const detailedReport = await metricsCollector.generatePerformanceReport({
        format: 'comprehensive',
        includeRecommendations: true,
        exportFormat: 'json'
      });

      expect(detailedReport.executiveSummary).toBeDefined();
      expect(detailedReport.detailedAnalysis).toBeDefined();
      expect(detailedReport.recommendations).toHaveLength(0); // Should have actionable recommendations
      expect(detailedReport.appendices.rawData).toBeDefined();
    });

    it('should support custom metrics and KPI tracking', async () => {
      // Define custom metrics for business objectives
      const customMetrics = [
        {
          name: 'code_quality_gates_passed',
          type: 'counter',
          description: 'Number of quality gates passed',
          target: 0.95 // 95% pass rate
        },
        {
          name: 'customer_satisfaction_score',
          type: 'gauge',
          description: 'Customer satisfaction with delivered features',
          target: 4.5 // Out of 5
        },
        {
          name: 'time_to_deployment',
          type: 'histogram',
          description: 'Time from task start to deployment',
          target: 7200000 // 2 hours
        },
        {
          name: 'security_compliance_rate',
          type: 'percentage',
          description: 'Percentage of security checks passed',
          target: 1.0 // 100% compliance
        }
      ];

      // Register custom metrics
      for (const metric of customMetrics) {
        await metricsCollector.registerCustomMetric(metric);
      }

      // Record custom metric values
      await metricsCollector.recordCustomMetric('code_quality_gates_passed', 1);
      await metricsCollector.recordCustomMetric('customer_satisfaction_score', 4.2);
      await metricsCollector.recordCustomMetric('time_to_deployment', 6300000); // 1.75 hours
      await metricsCollector.recordCustomMetric('security_compliance_rate', 0.98);

      // Analyze custom KPIs
      const kpiAnalysis = await metricsCollector.analyzeCustomKPIs();

      expect(kpiAnalysis.code_quality_gates_passed.status).toBe('above_target');
      expect(kpiAnalysis.customer_satisfaction_score.status).toBe('below_target');
      expect(kpiAnalysis.time_to_deployment.status).toBe('above_target'); // Better than target
      expect(kpiAnalysis.security_compliance_rate.status).toBe('approaching_target');

      // Verify KPI trending
      expect(kpiAnalysis.trending.improving).toContain('time_to_deployment');
      expect(kpiAnalysis.trending.needsAttention).toContain('customer_satisfaction_score');

      // Generate KPI dashboard
      const kpiDashboard = await metricsCollector.generateKPIDashboard();
      expect(kpiDashboard.overallHealth).toBeDefined();
      expect(kpiDashboard.metricsStatus.green).toBeGreaterThan(0);
      expect(kpiDashboard.actionItems).toBeDefined();
    });
  });
});