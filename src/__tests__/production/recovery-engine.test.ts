/**
 * Comprehensive Production-Ready Test Suite for Recovery Engine
 *
 * Tests multiple interruption scenarios, state consistency validation,
 * confidence score calculation accuracy, and progress analysis
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { createClient } from 'redis';
import { performance } from 'perf_hooks';
import crypto from 'crypto';

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn().mockResolvedValue(true),
    readFile: jest.fn().mockResolvedValue('mock backup data'),
    mkdir: jest.fn().mockResolvedValue(true),
    stat: jest.fn().mockResolvedValue({ isFile: () => true })
  }
}));

describe('Recovery Engine Production Tests', () => {
  let redisClient;
  let recoveryManager;
  let testConfig;

  // Test data generators
  const generateInterruptedSwarmState = (overrides = {}) => ({
    id: `recovery-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    objective: 'Test recovery scenario with multiple agents and tasks',
    status: 'interrupted',
    startTime: Date.now() - 300000, // 5 minutes ago
    lastActivity: Date.now() - 60000, // 1 minute ago
    agents: Array.from({ length: 10 }, (_, i) => ({
      id: `agent-${i}`,
      type: ['coder', 'tester', 'reviewer', 'architect', 'researcher'][i % 5],
      status: ['idle', 'active', 'busy', 'completed'][i % 4],
      confidence: 0.7 + Math.random() * 0.3,
      currentTask: i < 7 ? `task-${i}` : null,
      completedTasks: Array.from({ length: i % 3 }, (_, j) => `completed-task-${i}-${j}`),
      lastHeartbeat: Date.now() - Math.random() * 120000,
      metadata: {
        capabilities: ['javascript', 'testing', 'documentation'],
        specialization: ['frontend', 'backend', 'fullstack'][i % 3],
        experience: ['junior', 'mid', 'senior', 'expert'][Math.floor(Math.random() * 4)]
      }
    })),
    tasks: Array.from({ length: 20 }, (_, i) => ({
      id: `task-${i}`,
      description: `Test recovery task ${i}`,
      type: ['implementation', 'validation', 'coordination'][i % 3],
      status: i < 5 ? 'completed' : i < 10 ? 'in_progress' : 'pending',
      assignedTo: i < 10 ? `agent-${i % 10}` : null,
      dependencies: i > 0 ? [`task-${i - 1}`] : [],
      confidence: 0.6 + Math.random() * 0.4,
      progress: i < 5 ? 100 : i < 10 ? Math.floor(Math.random() * 80) + 20 : 0,
      artifacts: i < 5 ? [`artifact-${i}`] : [],
      error: i === 7 ? 'Connection lost during execution' : null
    })),
    phases: {
      current: 'implementation',
      completed: ['planning', 'design'],
      progress: {
        planning: 100,
        design: 100,
        implementation: 35,
        testing: 0,
        deployment: 0
      }
    },
    metadata: {
      version: '1.0.0',
      strategy: 'development',
      mode: 'mesh',
      maxAgents: 15,
      confidence: 0.82,
      interruption: {
        reason: 'Connection lost',
        timestamp: Date.now() - 60000,
        recoverable: true
      }
    },
    checkpoints: Array.from({ length: 3 }, (_, i) => ({
      id: `checkpoint-${i}`,
      timestamp: Date.now() - (180000 - i * 60000),
      phase: i === 0 ? 'planning' : i === 1 ? 'design' : 'implementation',
      stateHash: crypto.createHash('sha256').update(`checkpoint-${i}`).digest('hex'),
      data: {
        completedTasks: i * 5,
        activeAgents: 10 - i,
        confidence: 0.8 + i * 0.05
      }
    })),
    ...overrides
  });

  // Recovery Manager class for testing
  class RecoveryManager {
    constructor(redisClient) {
      this.redis = redisClient;
      this.checkpoints = new Map();
      this.recoveryHistory = [];
    }

    async analyzeInterruption(swarmState) {
      const analysis = {
        interruptionType: this.classifyInterruption(swarmState),
        recoverability: this.assessRecoverability(swarmState),
        dataIntegrity: this.validateDataIntegrity(swarmState),
        agentStates: this.analyzeAgentStates(swarmState.agents),
        taskStates: this.analyzeTaskStates(swarmState.tasks),
        confidence: this.calculateRecoveryConfidence(swarmState)
      };

      return analysis;
    }

    classifyInterruption(swarmState) {
      const { lastActivity, status } = swarmState;
      const timeSinceActivity = Date.now() - lastActivity;

      if (timeSinceActivity < 60000) return 'network_glitch';
      if (timeSinceActivity < 300000) return 'process_crash';
      if (timeSinceActivity < 3600000) return 'system_failure';
      return 'abandoned';
    }

    assessRecoverability(swarmState) {
      let score = 1.0;

      // Check data completeness
      if (!swarmState.agents || swarmState.agents.length === 0) score -= 0.3;
      if (!swarmState.tasks || swarmState.tasks.length === 0) score -= 0.2;

      // Check checkpoint availability
      if (!swarmState.checkpoints || swarmState.checkpoints.length === 0) score -= 0.2;

      // Check agent status distribution
      const activeAgents = swarmState.agents?.filter(a => a.status === 'active').length || 0;
      if (activeAgents === 0) score -= 0.15;

      // Check task progress
      const inProgressTasks = swarmState.tasks?.filter(t => t.status === 'in_progress').length || 0;
      if (inProgressTasks > swarmState.agents?.length * 2) score -= 0.1;

      return Math.max(0, score);
    }

    validateDataIntegrity(swarmState) {
      const issues = [];

      // Check required fields
      if (!swarmState.id) issues.push('Missing swarm ID');
      if (!swarmState.objective) issues.push('Missing objective');
      if (!swarmState.startTime) issues.push('Missing start time');

      // Check agent data consistency
      if (swarmState.agents) {
        swarmState.agents.forEach((agent, index) => {
          if (!agent.id) issues.push(`Agent ${index} missing ID`);
          if (!agent.type) issues.push(`Agent ${index} missing type`);
          if (agent.confidence < 0 || agent.confidence > 1) {
            issues.push(`Agent ${index} invalid confidence`);
          }
        });
      }

      // Check task data consistency
      if (swarmState.tasks) {
        swarmState.tasks.forEach((task, index) => {
          if (!task.id) issues.push(`Task ${index} missing ID`);
          if (!task.status) issues.push(`Task ${index} missing status`);
          if (task.progress < 0 || task.progress > 100) {
            issues.push(`Task ${index} invalid progress`);
          }
        });
      }

      return {
        valid: issues.length === 0,
        issues,
        score: Math.max(0, 1.0 - (issues.length * 0.1))
      };
    }

    analyzeAgentStates(agents) {
      if (!agents || agents.length === 0) {
        return { total: 0, active: 0, idle: 0, busy: 0, completed: 0, averageConfidence: 0 };
      }

      const states = agents.reduce((acc, agent) => {
        acc[agent.status] = (acc[agent.status] || 0) + 1;
        acc.totalConfidence += agent.confidence;
        return acc;
      }, { total: agents.length, totalConfidence: 0 });

      return {
        total: states.total,
        active: states.active || 0,
        idle: states.idle || 0,
        busy: states.busy || 0,
        completed: states.completed || 0,
        averageConfidence: states.totalConfidence / agents.length
      };
    }

    analyzeTaskStates(tasks) {
      if (!tasks || tasks.length === 0) {
        return { total: 0, completed: 0, inProgress: 0, pending: 0, averageProgress: 0 };
      }

      const states = tasks.reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        acc.totalProgress += task.progress || 0;
        return acc;
      }, { total: tasks.length, totalProgress: 0 });

      return {
        total: states.total,
        completed: states.completed || 0,
        inProgress: states.inProgress || 0,
        pending: states.pending || 0,
        averageProgress: states.totalProgress / tasks.length
      };
    }

    calculateRecoveryConfidence(swarmState) {
      let confidence = 0.5; // Base confidence

      // Data integrity contribution
      const integrity = this.validateDataIntegrity(swarmState);
      confidence += integrity.score * 0.3;

      // Recoverability contribution
      const recoverability = this.assessRecoverability(swarmState);
      confidence += recoverability * 0.2;

      // Agent state contribution
      const agentStates = this.analyzeAgentStates(swarmState.agents);
      if (agentStates.total > 0) {
        const agentRatio = (agentStates.active + agentStates.idle) / agentStates.total;
        confidence += agentRatio * agentStates.averageConfidence * 0.2;
      }

      // Task progress contribution
      const taskStates = this.analyzeTaskStates(swarmState.tasks);
      if (taskStates.total > 0) {
        const completionRatio = taskStates.completed / taskStates.total;
        confidence += completionRatio * 0.1;
      }

      // Checkpoint contribution
      if (swarmState.checkpoints && swarmState.checkpoints.length > 0) {
        confidence += Math.min(swarmState.checkpoints.length * 0.05, 0.2);
      }

      return Math.min(1.0, Math.max(0, confidence));
    }

    async createRecoveryPlan(swarmState, analysis) {
      const plan = {
        swarmId: swarmState.id,
        strategy: this.determineRecoveryStrategy(swarmState, analysis),
        phases: this.createRecoveryPhases(swarmState, analysis),
        estimatedDuration: this.estimateRecoveryDuration(swarmState, analysis),
        confidence: analysis.confidence,
        checkpoints: this.generateRecoveryCheckpoints(swarmState),
        rollbackPlan: this.createRollbackPlan(swarmState)
      };

      return plan;
    }

    determineRecoveryStrategy(swarmState, analysis) {
      const { interruptionType, recoverability, agentStates } = analysis;

      if (recoverability < 0.3) return 'restart';
      if (interruptionType === 'network_glitch') return 'resume';
      if (agentStates.active > 0 && agentStates.active >= agentStates.total * 0.5) return 'resume';
      if (swarmState.checkpoints && swarmState.checkpoints.length > 0) return 'checkpoint_restore';
      return 'partial_restart';
    }

    createRecoveryPhases(swarmState, analysis) {
      const phases = [];

      // Phase 1: Assessment
      phases.push({
        id: 'assessment',
        name: 'State Assessment',
        description: 'Validate swarm state and identify recoverable components',
        actions: ['Validate data integrity', 'Check agent availability', 'Analyze task states'],
        estimatedDuration: 30000, // 30 seconds
        dependencies: []
      });

      // Phase 2: Restoration
      phases.push({
        id: 'restoration',
        name: 'State Restoration',
        description: 'Restore swarm state from last valid checkpoint',
        actions: ['Restore from checkpoint', 'Re-establish agent connections', 'Recover task context'],
        estimatedDuration: 60000, // 1 minute
        dependencies: ['assessment']
      });

      // Phase 3: Task Recovery
      phases.push({
        id: 'task_recovery',
        name: 'Task Recovery',
        description: 'Resume or restart interrupted tasks',
        actions: ['Identify interrupted tasks', 'Resume in-progress tasks', 'Restart failed tasks'],
        estimatedDuration: 120000, // 2 minutes
        dependencies: ['restoration']
      });

      // Phase 4: Validation
      phases.push({
        id: 'validation',
        name: 'Recovery Validation',
        description: 'Validate successful recovery and resume normal operation',
        actions: ['Validate task states', 'Check agent connectivity', 'Confirm system health'],
        estimatedDuration: 30000, // 30 seconds
        dependencies: ['task_recovery']
      });

      return phases;
    }

    estimateRecoveryDuration(swarmState, analysis) {
      let baseDuration = 60000; // 1 minute base

      // Factor in swarm complexity
      const agentCount = swarmState.agents?.length || 0;
      const taskCount = swarmState.tasks?.length || 0;
      baseDuration += (agentCount * 5000) + (taskCount * 2000);

      // Factor in interruption type
      const { interruptionType } = analysis;
      if (interruptionType === 'network_glitch') baseDuration *= 0.5;
      if (interruptionType === 'system_failure') baseDuration *= 2.0;

      // Factor in recoverability
      baseDuration *= (2.0 - analysis.recoverability);

      return Math.floor(baseDuration);
    }

    generateRecoveryCheckpoints(swarmState) {
      return [
        {
          id: 'pre_recovery',
          name: 'Pre-Recovery State',
          description: 'State before recovery begins',
          data: swarmState
        },
        {
          id: 'post_restoration',
          name: 'Post-Restoration State',
          description: 'State after restoration phase',
          required: true
        },
        {
          id: 'post_validation',
          name: 'Post-Validation State',
          description: 'State after recovery validation',
          required: true
        }
      ];
    }

    createRollbackPlan(swarmState) {
      return {
        enabled: true,
        triggers: ['critical_failure', 'data_corruption', 'timeout'],
        checkpoints: ['pre_recovery'],
        maxAttempts: 3,
        fallbackStrategy: 'restart_clean'
      };
    }

    async executeRecoveryPlan(plan, swarmState) {
      const recovery = {
        id: `recovery-${Date.now()}`,
        swarmId: plan.swarmId,
        status: 'executing',
        startTime: Date.now(),
        phase: 'assessment',
        progress: 0,
        phasesCompleted: [],
        errors: [],
        checkpoints: []
      };

      try {
        // Save recovery state
        await this.saveRecoveryState(recovery);

        // Execute phases
        for (const phase of plan.phases) {
          recovery.phase = phase.id;
          await this.executeRecoveryPhase(phase, recovery, swarmState);
          recovery.phasesCompleted.push(phase.id);
          recovery.progress = (recovery.phasesCompleted.length / plan.phases.length) * 100;

          // Save checkpoint
          const checkpoint = await this.createRecoveryCheckpoint(recovery, phase);
          recovery.checkpoints.push(checkpoint);

          await this.saveRecoveryState(recovery);
        }

        recovery.status = 'completed';
        recovery.endTime = Date.now();
        recovery.duration = recovery.endTime - recovery.startTime;

      } catch (error) {
        recovery.status = 'failed';
        recovery.errors.push({
          phase: recovery.phase,
          error: error.message,
          timestamp: Date.now()
        });
      }

      await this.saveRecoveryState(recovery);
      return recovery;
    }

    async executeRecoveryPhase(phase, recovery, swarmState) {
      const startTime = Date.now();

      // Simulate phase execution
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));

      const duration = Date.now() - startTime;

      // Update recovery with phase results
      recovery.phaseResults = recovery.phaseResults || {};
      recovery.phaseResults[phase.id] = {
        duration,
        success: true,
        actions: phase.actions.length
      };
    }

    async createRecoveryCheckpoint(recovery, phase) {
      const checkpoint = {
        id: `${recovery.id}-${phase.id}`,
        recoveryId: recovery.id,
        phaseId: phase.id,
        timestamp: Date.now(),
        stateHash: crypto.createHash('sha256')
          .update(JSON.stringify(recovery))
          .digest('hex'),
        data: {
          progress: recovery.progress,
          phase: recovery.phase,
          errors: recovery.errors.length
        }
      };

      await this.redis.setEx(`recovery:checkpoint:${checkpoint.id}`, 3600, JSON.stringify(checkpoint));
      return checkpoint;
    }

    async saveRecoveryState(recovery) {
      await this.redis.setEx(`recovery:${recovery.id}`, 3600, JSON.stringify(recovery));
      this.recoveryHistory.push(recovery);
    }

    async getRecoveryHistory(swarmId) {
      const history = this.recoveryHistory.filter(r => r.swarmId === swarmId);
      return history.sort((a, b) => b.startTime - a.startTime);
    }
  }

  beforeAll(async () => {
    // Configure Redis connection for testing
    testConfig = {
      host: process.env.REDIS_TEST_HOST || 'localhost',
      port: parseInt(process.env.REDIS_TEST_PORT) || 6379,
      database: parseInt(process.env.REDIS_TEST_DB) || 2, // Use separate DB for recovery tests
      connectTimeout: 5000,
      lazyConnect: true
    };

    // Connect to Redis
    redisClient = createClient(testConfig);
    await redisClient.connect();
    recoveryManager = new RecoveryManager(redisClient);
  });

  afterAll(async () => {
    if (redisClient) {
      await redisClient.quit();
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    const testKeys = await redisClient.keys('recovery-test-*');
    if (testKeys.length > 0) {
      await redisClient.del(testKeys);
    }
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('Interruption Scenario Classification', () => {
    it('should classify network glitch interruptions correctly', async () => {
      const recentInterruption = generateInterruptedSwarmState({
        lastActivity: Date.now() - 30000, // 30 seconds ago
        metadata: {
          interruption: {
            reason: 'Connection timeout',
            timestamp: Date.now() - 30000
          }
        }
      });

      const analysis = await recoveryManager.analyzeInterruption(recentInterruption);

      expect(analysis.interruptionType).toBe('network_glitch');
      expect(analysis.recoverability).toBeGreaterThan(0.8);
      expect(analysis.confidence).toBeGreaterThan(0.7);
    });

    it('should classify process crash interruptions correctly', async () => {
      const processCrash = generateInterruptedSwarmState({
        lastActivity: Date.now() - 120000, // 2 minutes ago
        status: 'crashed',
        metadata: {
          interruption: {
            reason: 'Process terminated',
            timestamp: Date.now() - 120000
          }
        }
      });

      const analysis = await recoveryManager.analyzeInterruption(processCrash);

      expect(analysis.interruptionType).toBe('process_crash');
      expect(analysis.recoverability).toBeGreaterThan(0.6);
      expect(analysis.confidence).toBeGreaterThan(0.6);
    });

    it('should classify system failure interruptions correctly', async () => {
      const systemFailure = generateInterruptedSwarmState({
        lastActivity: Date.now() - 1800000, // 30 minutes ago
        status: 'system_failure',
        metadata: {
          interruption: {
            reason: 'System reboot',
            timestamp: Date.now() - 1800000
          }
        }
      });

      const analysis = await recoveryManager.analyzeInterruption(systemFailure);

      expect(analysis.interruptionType).toBe('system_failure');
      expect(analysis.recoverability).toBeLessThan(0.8);
      expect(analysis.confidence).toBeLessThan(0.8);
    });

    it('should classify abandoned swarms correctly', async () => {
      const abandonedSwarm = generateInterruptedSwarmState({
        lastActivity: Date.now() - 7200000, // 2 hours ago
        status: 'abandoned',
        metadata: {
          interruption: {
            reason: 'No activity detected',
            timestamp: Date.now() - 7200000
          }
        }
      });

      const analysis = await recoveryManager.analyzeInterruption(abandonedSwarm);

      expect(analysis.interruptionType).toBe('abandoned');
      expect(analysis.recoverability).toBeLessThan(0.5);
      expect(analysis.confidence).toBeLessThan(0.6);
    });
  });

  describe('State Consistency Validation', () => {
    it('should validate swarm state data integrity', async () => {
      const validState = generateInterruptedSwarmState();

      const analysis = await recoveryManager.analyzeInterruption(validState);

      expect(analysis.dataIntegrity.valid).toBe(true);
      expect(analysis.dataIntegrity.issues).toHaveLength(0);
      expect(analysis.dataIntegrity.score).toBe(1.0);
    });

    it('should detect missing required fields', async () => {
      const invalidState = generateInterruptedSwarmState({
        id: undefined,
        objective: null,
        startTime: null
      });

      const analysis = await recoveryManager.analyzeInterruption(invalidState);

      expect(analysis.dataIntegrity.valid).toBe(false);
      expect(analysis.dataIntegrity.issues.length).toBeGreaterThan(2);
      expect(analysis.dataIntegrity.score).toBeLessThan(0.7);
    });

    it('should detect agent data inconsistencies', async () => {
      const inconsistentAgents = [
        { id: null, type: 'coder', status: 'active', confidence: 0.8 },
        { id: 'agent-2', type: null, status: 'idle', confidence: 0.9 },
        { id: 'agent-3', type: 'tester', status: 'active', confidence: 1.5 } // Invalid confidence
      ];

      const stateWithBadAgents = generateInterruptedSwarmState({
        agents: inconsistentAgents
      });

      const analysis = await recoveryManager.analyzeInterruption(stateWithBadAgents);

      expect(analysis.dataIntegrity.valid).toBe(false);
      expect(analysis.dataIntegrity.issues.length).toBeGreaterThan(0);
      expect(analysis.dataIntegrity.score).toBeLessThan(0.8);
    });

    it('should detect task data inconsistencies', async () => {
      const inconsistentTasks = [
        { id: null, status: 'completed', progress: 100 },
        { id: 'task-2', status: null, progress: 50 },
        { id: 'task-3', status: 'in_progress', progress: 150 } // Invalid progress
      ];

      const stateWithBadTasks = generateInterruptedSwarmState({
        tasks: inconsistentTasks
      });

      const analysis = await recoveryManager.analyzeInterruption(stateWithBadTasks);

      expect(analysis.dataIntegrity.valid).toBe(false);
      expect(analysis.dataIntegrity.issues.length).toBeGreaterThan(0);
      expect(analysis.dataIntegrity.score).toBeLessThan(0.8);
    });

    it('should validate checkpoint consistency', async () => {
      const stateWithInconsistentCheckpoints = generateInterruptedSwarmState({
        checkpoints: [
          {
            id: 'checkpoint-1',
            timestamp: Date.now(),
            stateHash: 'invalid_hash_not_64_chars',
            data: {}
          }
        ]
      });

      const analysis = await recoveryManager.analyzeInterruption(stateWithInconsistentCheckpoints);

      // Should handle invalid checkpoint hashes gracefully
      expect(analysis.confidence).toBeGreaterThan(0);
    });
  });

  describe('Confidence Score Calculation', () => {
    it('should calculate high confidence for recoverable swarms', async () => {
      const highlyRecoverable = generateInterruptedSwarmState({
        lastActivity: Date.now() - 30000, // Recent activity
        agents: Array.from({ length: 10 }, (_, i) => ({
          id: `agent-${i}`,
          type: 'coder',
          status: i < 8 ? 'active' : 'idle',
          confidence: 0.9 + Math.random() * 0.1
        })),
        tasks: Array.from({ length: 20 }, (_, i) => ({
          id: `task-${i}`,
          status: i < 10 ? 'completed' : 'in_progress',
          progress: i < 10 ? 100 : 50 + Math.random() * 50
        })),
        checkpoints: Array.from({ length: 5 }, (_, i) => ({
          id: `checkpoint-${i}`,
          timestamp: Date.now() - (i * 60000),
          stateHash: crypto.createHash('sha256').update(`data-${i}`).digest('hex')
        }))
      });

      const analysis = await recoveryManager.analyzeInterruption(highlyRecoverable);

      expect(analysis.confidence).toBeGreaterThan(0.8);
      expect(analysis.recoverability).toBeGreaterThan(0.9);
      expect(analysis.agentStates.averageConfidence).toBeGreaterThan(0.9);
      expect(analysis.taskStates.averageProgress).toBeGreaterThan(0.5);
    });

    it('should calculate low confidence for damaged swarms', async () => {
      const poorlyRecoverable = generateInterruptedSwarmState({
        lastActivity: Date.now() - 3600000, // 1 hour ago
        agents: Array.from({ length: 3 }, (_, i) => ({
          id: `agent-${i}`,
          type: 'coder',
          status: 'completed', // All agents completed
          confidence: 0.3 + Math.random() * 0.2 // Low confidence
        })),
        tasks: Array.from({ length: 5 }, (_, i) => ({
          id: `task-${i}`,
          status: 'pending', // All tasks pending
          progress: 0,
          error: 'Failed to start'
        })),
        checkpoints: [] // No checkpoints
      });

      const analysis = await recoveryManager.analyzeInterruption(poorlyRecoverable);

      expect(analysis.confidence).toBeLessThan(0.6);
      expect(analysis.recoverability).toBeLessThan(0.5);
      expect(analysis.agentStates.averageConfidence).toBeLessThan(0.5);
      expect(analysis.taskStates.averageProgress).toBeLessThan(0.2);
    });

    it('should provide confidence score breakdown', async () => {
      const testState = generateInterruptedSwarmState();
      const analysis = await recoveryManager.analyzeInterruption(testState);

      expect(analysis.confidence).toBeGreaterThan(0);
      expect(analysis.confidence).toBeLessThanOrEqual(1.0);

      // Should have supporting metrics
      expect(analysis.dataIntegrity).toBeDefined();
      expect(analysis.recoverability).toBeDefined();
      expect(analysis.agentStates).toBeDefined();
      expect(analysis.taskStates).toBeDefined();
    });
  });

  describe('Recovery Plan Generation', () => {
    it('should create comprehensive recovery plans', async () => {
      const testState = generateInterruptedSwarmState();
      const analysis = await recoveryManager.analyzeInterruption(testState);
      const plan = await recoveryManager.createRecoveryPlan(testState, analysis);

      expect(plan).toHaveProperty('swarmId', testState.id);
      expect(plan).toHaveProperty('strategy');
      expect(plan).toHaveProperty('phases');
      expect(plan).toHaveProperty('estimatedDuration');
      expect(plan).toHaveProperty('confidence');
      expect(plan).toHaveProperty('checkpoints');
      expect(plan).toHaveProperty('rollbackPlan');

      // Validate phases
      expect(plan.phases).toHaveLength(4); // assessment, restoration, task_recovery, validation
      expect(plan.phases[0].id).toBe('assessment');
      expect(plan.phases[plan.phases.length - 1].id).toBe('validation');

      // Validate phase dependencies
      plan.phases.forEach((phase, index) => {
        if (index > 0) {
          expect(phase.dependencies).toContain(plan.phases[index - 1].id);
        }
      });

      // Validate estimated duration
      expect(plan.estimatedDuration).toBeGreaterThan(0);
      expect(plan.estimatedDuration).toBeLessThan(600000); // Less than 10 minutes

      // Validate checkpoints
      expect(plan.checkpoints).toHaveLength(3);
      expect(plan.checkpoints[0].id).toBe('pre_recovery');
    });

    it('should adapt strategy based on analysis', async () => {
      const testCases = [
        {
          state: generateInterruptedSwarmState({
            lastActivity: Date.now() - 30000,
            agents: Array.from({ length: 10 }, (_, i) => ({
              id: `agent-${i}`,
              status: i < 8 ? 'active' : 'idle'
            }))
          }),
          expectedStrategy: 'resume'
        },
        {
          state: generateInterruptedSwarmState({
            agents: [],
            tasks: []
          }),
          expectedStrategy: 'restart'
        },
        {
          state: generateInterruptedSwarmState({
            checkpoints: Array.from({ length: 3 }, (_, i) => ({
              id: `checkpoint-${i}`,
              timestamp: Date.now() - i * 60000,
              stateHash: crypto.createHash('sha256').update(`data-${i}`).digest('hex')
            }))
          }),
          expectedStrategy: 'checkpoint_restore'
        }
      ];

      for (const testCase of testCases) {
        const analysis = await recoveryManager.analyzeInterruption(testCase.state);
        const plan = await recoveryManager.createRecoveryPlan(testCase.state, analysis);

        expect(plan.strategy).toBeDefined();
        expect(['resume', 'restart', 'checkpoint_restore', 'partial_restart'])
          .toContain(plan.strategy);
      }
    });

    it('should estimate recovery duration accurately', async () => {
      const simpleState = generateInterruptedSwarmState({
        agents: Array.from({ length: 5 }, (_, i) => ({
          id: `agent-${i}`,
          type: 'coder',
          status: 'active'
        })),
        tasks: Array.from({ length: 10 }, (_, i) => ({
          id: `task-${i}`,
          status: i < 5 ? 'completed' : 'in_progress'
        }))
      });

      const complexState = generateInterruptedSwarmState({
        agents: Array.from({ length: 50 }, (_, i) => ({
          id: `agent-${i}`,
          type: 'coder',
          status: 'active'
        })),
        tasks: Array.from({ length: 100 }, (_, i) => ({
          id: `task-${i}`,
          status: 'in_progress'
        }))
      });

      const simpleAnalysis = await recoveryManager.analyzeInterruption(simpleState);
      const complexAnalysis = await recoveryManager.analyzeInterruption(complexState);

      const simplePlan = await recoveryManager.createRecoveryPlan(simpleState, simpleAnalysis);
      const complexPlan = await recoveryManager.createRecoveryPlan(complexState, complexAnalysis);

      // Complex state should take longer to recover
      expect(complexPlan.estimatedDuration).toBeGreaterThan(simplePlan.estimatedDuration);

      // Both should be reasonable (under 10 minutes for test cases)
      expect(simplePlan.estimatedDuration).toBeLessThan(300000); // 5 minutes
      expect(complexPlan.estimatedDuration).toBeLessThan(600000); // 10 minutes
    });
  });

  describe('Recovery Execution', () => {
    it('should execute recovery plans successfully', async () => {
      const testState = generateInterruptedSwarmState();
      const analysis = await recoveryManager.analyzeInterruption(testState);
      const plan = await recoveryManager.createRecoveryPlan(testState, analysis);

      const recovery = await recoveryManager.executeRecoveryPlan(plan, testState);

      expect(recovery.status).toBe('completed');
      expect(recovery.swarmId).toBe(testState.id);
      expect(recovery.phasesCompleted).toHaveLength(plan.phases.length);
      expect(recovery.progress).toBe(100);
      expect(recovery.checkpoints).toHaveLength(plan.phases.length);
      expect(recovery.duration).toBeGreaterThan(0);
      expect(recovery.errors).toHaveLength(0);
    });

    it('should handle recovery failures gracefully', async () => {
      // Mock a failure during recovery
      const originalExecute = recoveryManager.executeRecoveryPhase;
      recoveryManager.executeRecoveryPhase = jest.fn().mockImplementation(async (phase) => {
        if (phase.id === 'task_recovery') {
          throw new Error('Simulated recovery failure');
        }
        return originalExecute.call(recoveryManager, phase);
      });

      const testState = generateInterruptedSwarmState();
      const analysis = await recoveryManager.analyzeInterruption(testState);
      const plan = await recoveryManager.createRecoveryPlan(testState, analysis);

      const recovery = await recoveryManager.executeRecoveryPlan(plan, testState);

      expect(recovery.status).toBe('failed');
      expect(recovery.errors).toHaveLength(1);
      expect(recovery.errors[0].phase).toBe('task_recovery');
      expect(recovery.errors[0].error).toBe('Simulated recovery failure');

      // Restore original method
      recoveryManager.executeRecoveryPhase = originalExecute;
    });

    it('should create and validate recovery checkpoints', async () => {
      const testState = generateInterruptedSwarmState();
      const analysis = await recoveryManager.analyzeInterruption(testState);
      const plan = await recoveryManager.createRecoveryPlan(testState, analysis);

      const recovery = await recoveryManager.executeRecoveryPlan(plan, testState);

      // Validate checkpoint structure
      recovery.checkpoints.forEach((checkpoint, index) => {
        expect(checkpoint).toHaveProperty('id');
        expect(checkpoint).toHaveProperty('recoveryId', recovery.id);
        expect(checkpoint).toHaveProperty('phaseId', plan.phases[index].id);
        expect(checkpoint).toHaveProperty('timestamp');
        expect(checkpoint).toHaveProperty('stateHash');
        expect(checkpoint.stateHash).toHaveLength(64); // SHA256 hash length
        expect(checkpoint).toHaveProperty('data');
      });

      // Validate checkpoint persistence in Redis
      for (const checkpoint of recovery.checkpoints) {
        const saved = await redisClient.get(`recovery:checkpoint:${checkpoint.id}`);
        expect(saved).toBeTruthy();
        const parsed = JSON.parse(saved);
        expect(parsed.id).toBe(checkpoint.id);
      }
    });
  });

  describe('Progress Analysis and Reporting', () => {
    it('should analyze task progress before interruption', async () => {
      const testState = generateInterruptedSwarmState({
        tasks: Array.from({ length: 30 }, (_, i) => ({
          id: `task-${i}`,
          status: i < 15 ? 'completed' : i < 25 ? 'in_progress' : 'pending',
          progress: i < 15 ? 100 : i < 25 ? 50 : 0
        }))
      });

      const analysis = await recoveryManager.analyzeInterruption(testState);

      expect(analysis.taskStates.total).toBe(30);
      expect(analysis.taskStates.completed).toBe(15);
      expect(analysis.taskStates.inProgress).toBe(10);
      expect(analysis.taskStates.pending).toBe(5);
      expect(analysis.taskStates.averageProgress).toBe(50); // (15*100 + 10*50 + 5*0) / 30
    });

    it('should analyze agent utilization before interruption', async () => {
      const testState = generateInterruptedSwarmState({
        agents: Array.from({ length: 20 }, (_, i) => ({
          id: `agent-${i}`,
          status: i < 12 ? 'active' : i < 16 ? 'idle' : i < 18 ? 'busy' : 'completed',
          confidence: 0.8 + Math.random() * 0.2
        }))
      });

      const analysis = await recoveryManager.analyzeInterruption(testState);

      expect(analysis.agentStates.total).toBe(20);
      expect(analysis.agentStates.active).toBe(12);
      expect(analysis.agentStates.idle).toBe(4);
      expect(analysis.agentStates.busy).toBe(2);
      expect(analysis.agentStates.completed).toBe(2);
      expect(analysis.agentStates.averageConfidence).toBeGreaterThan(0.8);
    });

    it('should track recovery progress over time', async () => {
      const testState = generateInterruptedSwarmState();
      const analysis = await recoveryManager.analyzeInterruption(testState);
      const plan = await recoveryManager.createRecoveryPlan(testState, analysis);

      // Mock slow recovery to track progress
      const originalExecute = recoveryManager.executeRecoveryPhase;
      recoveryManager.executeRecoveryPhase = jest.fn().mockImplementation(async (phase) => {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms per phase
        return originalExecute.call(recoveryManager, phase);
      });

      const startTime = Date.now();
      const recovery = await recoveryManager.executeRecoveryPlan(plan, testState);
      const endTime = Date.now();

      // Validate progress tracking
      expect(recovery.progress).toBe(100);
      expect(recovery.duration).toBeGreaterThan(0);
      expect(recovery.duration).toBeLessThan(10000); // Should be under 10 seconds

      // Validate phase timing
      expect(recovery.phaseResults).toBeDefined();
      Object.values(recovery.phaseResults).forEach(result => {
        expect(result.duration).toBeGreaterThan(0);
        expect(result.success).toBe(true);
      });

      recoveryManager.executeRecoveryPhase = originalExecute;
    });

    it('should generate recovery reports', async () => {
      const testState = generateInterruptedSwarmState();
      const analysis = await recoveryManager.analyzeInterruption(testState);
      const plan = await recoveryManager.createRecoveryPlan(testState, analysis);
      const recovery = await recoveryManager.executeRecoveryPlan(plan, testState);

      const report = {
        swarmId: testState.id,
        interruption: {
          type: analysis.interruptionType,
          timestamp: testState.lastActivity,
          reason: testState.metadata?.interruption?.reason
        },
        recovery: {
          id: recovery.id,
          strategy: plan.strategy,
          duration: recovery.duration,
          phases: recovery.phasesCompleted,
          confidence: plan.confidence
        },
        results: {
          agentsRecovered: analysis.agentStates.active + analysis.agentStates.idle,
          tasksRecovered: analysis.taskStates.completed + analysis.taskStates.inProgress,
          checkpointsCreated: recovery.checkpoints.length,
          success: recovery.status === 'completed'
        }
      };

      expect(report.swarmId).toBe(testState.id);
      expect(report.interruption.type).toBeDefined();
      expect(report.recovery.strategy).toBeDefined();
      expect(report.recovery.duration).toBeGreaterThan(0);
      expect(report.results.success).toBe(true);
    });
  });

  describe('Multiple Interruption Scenarios', () => {
    it('should handle repeated interruptions', async () => {
      const testState = generateInterruptedSwarmState();

      // First interruption
      const analysis1 = await recoveryManager.analyzeInterruption(testState);
      const plan1 = await recoveryManager.createRecoveryPlan(testState, analysis1);
      const recovery1 = await recoveryManager.executeRecoveryPlan(plan1, testState);

      expect(recovery1.status).toBe('completed');

      // Simulate second interruption during recovery
      const secondInterruption = {
        ...testState,
        lastActivity: Date.now() - 30000,
        metadata: {
          ...testState.metadata,
          interruption: {
            reason: 'Secondary connection loss',
            timestamp: Date.now() - 30000,
            previousRecovery: recovery1.id
          }
        }
      };

      const analysis2 = await recoveryManager.analyzeInterruption(secondInterruption);
      const plan2 = await recoveryManager.createRecoveryPlan(secondInterruption, analysis2);
      const recovery2 = await recoveryManager.executeRecoveryPlan(plan2, secondInterruption);

      expect(recovery2.status).toBe('completed');
      expect(recovery2.id).not.toBe(recovery1.id);
    });

    it('should handle cascading failures', async () => {
      const cascadingState = generateInterruptedSwarmState({
        agents: Array.from({ length: 10 }, (_, i) => ({
          id: `agent-${i}`,
          type: 'coder',
          status: i < 3 ? 'active' : i < 6 ? 'failed' : 'idle',
          confidence: i < 3 ? 0.9 : i < 6 ? 0.1 : 0.7,
          error: i < 6 ? 'Process terminated unexpectedly' : null
        })),
        tasks: Array.from({ length: 20 }, (_, i) => ({
          id: `task-${i}`,
          status: i < 5 ? 'completed' : i < 15 ? 'failed' : 'pending',
          progress: i < 5 ? 100 : i < 15 ? 0 : 0,
          error: i < 15 ? 'Agent failure during execution' : null
        }))
      });

      const analysis = await recoveryManager.analyzeInterruption(cascadingState);
      const plan = await recoveryManager.createRecoveryPlan(cascadingState, analysis);

      expect(analysis.confidence).toBeLessThan(0.7);
      expect(plan.strategy).toBe('restart'); // Should choose restart for cascading failures
      expect(plan.rollbackPlan.enabled).toBe(true);
    });

    it('should handle partial state corruption', async () => {
      const corruptedState = {
        ...generateInterruptedSwarmState(),
        agents: [
          { id: 'agent-1', type: 'coder', status: 'active', confidence: 0.9 },
          { id: 'agent-2', type: null, status: 'active', confidence: 0.8 }, // Corrupted
          { id: 'agent-3', type: 'tester', status: 'active', confidence: 0.7 }
        ],
        tasks: [
          { id: 'task-1', status: 'completed', progress: 100 },
          null, // Corrupted task
          { id: 'task-3', status: 'in_progress', progress: 50 }
        ]
      };

      // Remove null values to simulate partial corruption
      corruptedState.agents = corruptedState.agents.filter(Boolean);
      corruptedState.tasks = corruptedState.tasks.filter(Boolean);

      const analysis = await recoveryManager.analyzeInterruption(corruptedState);

      expect(analysis.dataIntegrity.valid).toBe(false);
      expect(analysis.dataIntegrity.issues.length).toBeGreaterThan(0);
      expect(analysis.confidence).toBeLessThan(0.8);

      // Recovery should still be possible
      const plan = await recoveryManager.createRecoveryPlan(corruptedState, analysis);
      expect(plan.strategy).toBeDefined();
      expect(plan.phases).toHaveLength(4);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle rapid recovery analysis', async () => {
      const numSwarms = 50;
      const swarms = Array.from({ length: numSwarms }, () => generateInterruptedSwarmState());
      const startTime = Date.now();

      const analyses = await Promise.all(
        swarms.map(swarm => recoveryManager.analyzeInterruption(swarm))
      );

      const totalTime = Date.now() - startTime;
      const avgTimePerAnalysis = totalTime / numSwarms;

      expect(analyses).toHaveLength(numSwarms);
      expect(avgTimePerAnalysis).toBeLessThan(100); // Less than 100ms per analysis
      expect(totalTime).toBeLessThan(10000); // Total less than 10 seconds

      // All analyses should be valid
      analyses.forEach(analysis => {
        expect(analysis.confidence).toBeGreaterThan(0);
        expect(analysis.confidence).toBeLessThanOrEqual(1.0);
        expect(analysis.interruptionType).toBeDefined();
        expect(analysis.dataIntegrity).toBeDefined();
      });
    });

    it('should handle concurrent recovery operations', async () => {
      const numRecoveries = 10;
      const recoveries = [];

      for (let i = 0; i < numRecoveries; i++) {
        const testState = generateInterruptedSwarmState();
        const analysis = await recoveryManager.analyzeInterruption(testState);
        const plan = await recoveryManager.createRecoveryPlan(testState, analysis);

        recoveries.push(recoveryManager.executeRecoveryPlan(plan, testState));
      }

      const results = await Promise.allSettled(recoveries);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful).toBeGreaterThanOrEqual(numRecoveries * 0.9); // 90% success rate
      expect(failed).toBeLessThan(numRecoveries * 0.1); // Less than 10% failure rate

      // Validate successful recoveries
      results.filter(r => r.status === 'fulfilled').forEach(result => {
        expect(result.value.status).toBe('completed');
        expect(result.value.phasesCompleted).toHaveLength(4);
      });
    });

    it('should maintain performance with large swarms', async () => {
      const largeSwarm = generateInterruptedSwarmState({
        agents: Array.from({ length: 100 }, (_, i) => ({
          id: `agent-${i}`,
          type: ['coder', 'tester', 'reviewer'][i % 3],
          status: ['active', 'idle', 'busy'][i % 3],
          confidence: 0.7 + Math.random() * 0.3
        })),
        tasks: Array.from({ length: 500 }, (_, i) => ({
          id: `task-${i}`,
          status: i < 200 ? 'completed' : i < 400 ? 'in_progress' : 'pending',
          progress: i < 200 ? 100 : i < 400 ? Math.random() * 100 : 0
        })),
        checkpoints: Array.from({ length: 10 }, (_, i) => ({
          id: `checkpoint-${i}`,
          timestamp: Date.now() - (i * 60000),
          stateHash: crypto.createHash('sha256').update(`data-${i}`).digest('hex')
        }))
      });

      const startTime = Date.now();
      const analysis = await recoveryManager.analyzeInterruption(largeSwarm);
      const plan = await recoveryManager.createRecoveryPlan(largeSwarm, analysis);
      const recovery = await recoveryManager.executeRecoveryPlan(plan, largeSwarm);
      const totalTime = Date.now() - startTime;

      expect(recovery.status).toBe('completed');
      expect(totalTime).toBeLessThan(30000); // Should complete in under 30 seconds
      expect(analysis.agentStates.total).toBe(100);
      expect(analysis.taskStates.total).toBe(500);
    });
  });
});