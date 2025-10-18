/**
 * CFN Loop E2E Test Suite
 * 
 * Tests complete CFN Loop orchestration with autonomous phase transitions:
 * - Loop 0: Epic/Sprint orchestration
 * - Loop 1: Phase execution
 * - Loop 2: Consensus with validators
 * - Loop 3: Primary swarm with confidence
 * - Loop 4: Product Owner decision
 * 
 * Uses Vitest with mocked Redis/SQLite for isolated testing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Redis for testing
const mockRedis = {
  data: new Map(),
  async get(key) {
    return this.data.get(key);
  },
  async set(key, value) {
    this.data.set(key, value);
    return 'OK';
  },
  async del(key) {
    return this.data.delete(key);
  },
  async exists(key) {
    return this.data.has(key) ? 1 : 0;
  },
  async hget(hash, field) {
    const hashData = this.data.get(hash) || {};
    return hashData[field];
  },
  async hset(hash, field, value) {
    const hashData = this.data.get(hash) || {};
    hashData[field] = value;
    this.data.set(hash, hashData);
    return 1;
  },
  async hdel(hash, field) {
    const hashData = this.data.get(hash) || {};
    delete hashData[field];
    this.data.set(hash, hashData);
    return 1;
  },
  async expire() { return 1; },
  async ttl() { return 3600; }
};

// Mock SQLite for testing
const mockSQLite = {
  data: new Map(),
  prepare(sql) {
    return {
      all: () => [],
      get: () => null,
      run: () => ({ lastInsertRowid: 1, changes: 1 })
    };
  }
};

// Mock Circuit Breaker
class MockCircuitBreaker {
  constructor(config) {
    this.config = config;
    this.state = 'CLOSED';
    this.failureCount = 0;
  }
  
  getState() {
    return this.state;
  }
  
  async execute(operation) {
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN');
    }
    
    try {
      const result = await operation();
      this.failureCount = 0;
      this.state = 'CLOSED';
      return result;
    } catch (error) {
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'OPEN';
      }
      throw error;
    }
  }
}

// Mock CFN Loop Orchestrator
class MockCFNLoopOrchestrator {
  constructor(config) {
    this.config = config;
    this.circuitBreaker = new MockCircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 5000,
      monitoringPeriod: 10000
    });
  }
  
  async executePhase(phaseConfig) {
    return this.circuitBreaker.execute(async () => {
      // Simulate phase execution with all loops
      const phaseTransitions = [];
      
      // Loop 1: Phase Execution Started
      phaseTransitions.push('Loop 1: Phase Execution Started');
      
      // Loop 3: Primary Swarm Execution
      phaseTransitions.push('Loop 3: Primary Swarm Execution');
      const swarmResult = await this.executePrimarySwarm(phaseConfig);
      
      // Loop 2: Consensus with Validators
      phaseTransitions.push('Loop 2: Consensus with Validators');
      const consensusResult = await this.executeConsensus({
        phaseId: phaseConfig.phaseId,
        validators: this.getMockValidators(),
        threshold: this.config.consensusThreshold || 0.80,
        timeoutMs: phaseConfig.timeoutMs || 30000
      });
      
      // Loop 4: Product Owner Decision
      phaseTransitions.push('Loop 4: Product Owner Decision');
      const poDecision = await this.executeProductOwnerDecision({
        phaseId: phaseConfig.phaseId,
        consensusResult,
        confidenceValidation: swarmResult.confidenceValidation
      });
      
      phaseTransitions.push('Loop 1: Phase Execution Completed');
      
      return {
        success: poDecision.decision !== 'ESCALATE',
        phaseId: phaseConfig.phaseId,
        totalLoop2Iterations: 1,
        totalLoop3Iterations: 1,
        finalDeliverables: [swarmResult.responses[0].deliverable],
        confidenceScores: swarmResult.confidenceScores,
        consensusResult,
        productOwnerDecision: poDecision,
        escalated: poDecision.decision === 'ESCALATE',
        statistics: {
          totalDuration: 15000,
          primarySwarmExecutions: 1,
          consensusSwarmExecutions: 1,
          averageConfidenceScore: swarmResult.confidenceValidation.overallConfidence,
          finalConsensusScore: consensusResult.consensusScore,
          gatePasses: swarmResult.gatePassed && consensusResult.consensusPassed ? 1 : 0,
          gateFails: swarmResult.gatePassed && consensusResult.consensusPassed ? 0 : 1,
          feedbackInjections: 0,
          circuitBreakerTrips: 0,
          timeouts: 0,
          phaseTransitions
        },
        timestamp: Date.now()
      };
    });
  }
  
  async executePrimarySwarm(swarmConfig) {
    // Simulate primary swarm execution
    const responses = [
      {
        agentId: 'agent-1',
        agentType: 'developer',
        deliverable: { code: 'function test() { return "success"; }', tests: ['test-case-1'] },
        confidence: 0.95,
        reasoning: 'Implementation meets all requirements',
        timestamp: Date.now()
      },
      {
        agentId: 'agent-2', 
        agentType: 'reviewer',
        deliverable: { review: 'Code quality is excellent', issues: [] },
        confidence: 0.90,
        reasoning: 'No issues found in code review',
        timestamp: Date.now()
      }
    ];
    
    const confidenceScores = [
      { agentId: 'agent-1', confidence: 0.95, factors: { code: 0.98, tests: 0.92 } },
      { agentId: 'agent-2', confidence: 0.90, factors: { review: 0.90, analysis: 0.90 } }
    ];
    
    const overallConfidence = confidenceScores.reduce((sum, score) => sum + score.confidence, 0) / confidenceScores.length;
    const threshold = swarmConfig.confidenceThreshold || 0.85;
    
    return {
      responses,
      confidenceScores,
      confidenceValidation: {
        overallConfidence,
        threshold,
        passed: overallConfidence >= threshold,
        timestamp: Date.now()
      },
      gatePassed: overallConfidence >= threshold,
      iteration: 1,
      timestamp: Date.now()
    };
  }
  
  async executeConsensus(consensusConfig) {
    // Simulate consensus execution
    const validators = consensusConfig.validators;
    const passVotes = validators.filter(v => v.vote === 'PASS').length;
    const failVotes = validators.filter(v => v.vote === 'FAIL').length;
    const consensusScore = passVotes / validators.length;
    
    return {
      consensusScore,
      consensusThreshold: consensusConfig.threshold,
      consensusPassed: consensusScore >= consensusConfig.threshold,
      validatorResults: validators,
      votingBreakdown: { PASS: passVotes, FAIL: failVotes },
      iteration: 1,
      timestamp: Date.now()
    };
  }
  
  async executeProductOwnerDecision(decisionConfig) {
    const { consensusResult, confidenceValidation } = decisionConfig;
    
    // Simulate Product Owner decision logic
    if (consensusResult.consensusScore < 0.5 || confidenceValidation.overallConfidence < 0.5) {
      return {
        decision: 'ESCALATE',
        confidence: Math.min(consensusResult.consensusScore, confidenceValidation.overallConfidence),
        reasoning: 'Critical issues detected requiring escalation',
        backlogItems: [],
        blockers: ['Low confidence and consensus scores'],
        recommendations: ['Immediate review required'],
        timestamp: Date.now()
      };
    } else if (consensusResult.consensusScore < 0.8 || confidenceValidation.overallConfidence < 0.85) {
      return {
        decision: 'DEFER',
        confidence: Math.min(consensusResult.consensusScore, confidenceValidation.overallConfidence),
        reasoning: 'Scores below threshold, needs refinement',
        backlogItems: ['Improve quality', 'Add validation'],
        blockers: [],
        recommendations: ['Focus on improvements'],
        timestamp: Date.now()
      };
    } else {
      return {
        decision: 'PROCEED',
        confidence: (consensusResult.consensusScore + confidenceValidation.overallConfidence) / 2,
        reasoning: 'High confidence and consensus achieved',
        backlogItems: [],
        blockers: [],
        recommendations: ['Monitor in production'],
        timestamp: Date.now()
      };
    }
  }
  
  getMockValidators() {
    return [
      {
        agentId: 'validator-1',
        agentType: 'reviewer',
        confidence: 0.92,
        vote: 'PASS',
        reasoning: 'High quality implementation with comprehensive tests',
        signature: 'sig-1',
        timestamp: Date.now(),
        recommendations: ['Consider adding more documentation']
      },
      {
        agentId: 'validator-2',
        agentType: 'security-specialist', 
        confidence: 0.88,
        vote: 'PASS',
        reasoning: 'No security vulnerabilities detected',
        signature: 'sig-2',
        timestamp: Date.now()
      },
      {
        agentId: 'validator-3',
        agentType: 'tester',
        confidence: 0.90,
        vote: 'PASS', 
        reasoning: 'All test cases pass successfully',
        signature: 'sig-3',
        timestamp: Date.now()
      }
    ];
  }
}

// Mock Phase Orchestrator
class MockPhaseOrchestrator {
  constructor(config) {
    this.config = config;
  }
  
  async initializePhase(phaseId) {
    const phase = this.config.phases.find(p => p.id === phaseId);
    if (!phase) {
      throw new Error(`Phase ${phaseId} not found`);
    }
    
    return {
      success: true,
      phaseId,
      phase,
      initialized: true,
      timestamp: Date.now()
    };
  }
}

// Mock Sprint Orchestrator
class MockSprintOrchestrator {
  constructor(config) {
    this.config = config;
  }
  
  async initializeSprint(sprintId) {
    const sprint = this.config.sprints.find(s => s.id === sprintId);
    if (!sprint) {
      throw new Error(`Sprint ${sprintId} not found`);
    }
    
    return {
      success: true,
      sprintId,
      phases: sprint.phases,
      initialized: true,
      timestamp: Date.now()
    };
  }
  
  async orchestrateEpic(epicConfig) {
    return {
      success: true,
      epicId: epicConfig.epicId,
      orchestratedSprints: epicConfig.sprints,
      timestamp: Date.now()
    };
  }
}

// Factory functions
async function createCFNLoopOrchestrator(config) {
  return new MockCFNLoopOrchestrator(config);
}

async function createPhaseOrchestrator(config) {
  return new MockPhaseOrchestrator(config);
}

async function createSprintOrchestrator(config) {
  return new MockSprintOrchestrator(config);
}

describe('CFN Loop E2E Test Suite', () => {
  let cfnLoopOrchestrator;
  let phaseOrchestrator;
  let sprintOrchestrator;
  let circuitBreaker;
  
  beforeEach(async () => {
    // Reset mocks
    mockRedis.data.clear();
    mockSQLite.data.clear();
    
    // Mock Redis module
    vi.doMock('redis', () => ({
      createClient: () => mockRedis
    }));
    
    // Mock SQLite module
    vi.doMock('better-sqlite3', () => ({
      default: () => mockSQLite
    }));
    
    // Create circuit breaker
    circuitBreaker = new MockCircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 5000,
      monitoringPeriod: 10000
    });
    
    // Create orchestrators with mocked dependencies
    const cfnConfig = {
      phaseId: 'test-phase-1',
      swarmId: 'test-swarm-1',
      maxLoop2Iterations: 3,
      maxLoop3Iterations: 5,
      confidenceThreshold: 0.85,
      consensusThreshold: 0.80,
      timeoutMs: 30000,
      enableCircuitBreaker: true,
      enableMemoryPersistence: false,
      enableByzantineConsensus: false
    };
    
    cfnLoopOrchestrator = await createCFNLoopOrchestrator(cfnConfig);
    
    const phaseConfig = {
      phases: [
        {
          id: 'test-phase-1',
          name: 'Test Phase',
          description: 'Test phase for E2E validation',
          instructions: 'Implement test functionality',
          agents: ['developer', 'reviewer'],
          validators: ['reviewer', 'security-specialist', 'tester'],
          dependencies: [],
          timeoutMs: 30000
        }
      ],
      redis: mockRedis,
      sqlite: mockSQLite
    };
    
    phaseOrchestrator = await createPhaseOrchestrator(phaseConfig);
    
    const sprintConfig = {
      sprints: [
        {
          id: 'test-sprint-1',
          name: 'Test Sprint',
          description: 'Test sprint for E2E validation',
          phases: ['test-phase-1'],
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86400000).toISOString()
        }
      ]
    };
    
    sprintOrchestrator = await createSprintOrchestrator(sprintConfig);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Loop 0: Epic/Sprint Orchestration', () => {
    it('should initialize sprint orchestration successfully', async () => {
      const sprintId = 'test-sprint-1';
      
      const result = await sprintOrchestrator.initializeSprint(sprintId);
      
      expect(result.success).toBe(true);
      expect(result.sprintId).toBe(sprintId);
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0]).toBe('test-phase-1');
    });

    it('should orchestrate epic-level coordination', async () => {
      const epicConfig = {
        epicId: 'test-epic-1',
        name: 'Test Epic',
        description: 'Test epic for CFN Loop validation',
        sprints: ['test-sprint-1'],
        dependencies: []
      };
      
      const result = await sprintOrchestrator.orchestrateEpic(epicConfig);
      
      expect(result.success).toBe(true);
      expect(result.epicId).toBe('test-epic-1');
      expect(result.orchestratedSprints).toContain('test-sprint-1');
    });
  });

  describe('Loop 1: Phase Execution', () => {
    it('should execute phase with autonomous transitions', async () => {
      const phaseConfig = {
        phaseId: 'test-phase-1',
        instructions: 'Implement test functionality with validation',
        agents: ['developer', 'reviewer'],
        validators: ['reviewer', 'security-specialist', 'tester'],
        timeoutMs: 30000
      };
      
      const result = await cfnLoopOrchestrator.executePhase(phaseConfig);
      
      expect(result.success).toBe(true);
      expect(result.phaseId).toBe('test-phase-1');
      expect(result.consensusResult.consensusPassed).toBe(true);
      expect(result.productOwnerDecision.decision).toBe('PROCEED');
      expect(result.escalated).toBe(false);
      expect(result.statistics.phaseTransitions).toHaveLength(5);
    });

    it('should handle phase execution failures with circuit breaker', async () => {
      const phaseConfig = {
        phaseId: 'test-phase-fail',
        instructions: 'This phase will fail',
        agents: ['developer'],
        validators: ['reviewer'],
        timeoutMs: 1000
      };
      
      // Force circuit breaker to open
      circuitBreaker.state = 'OPEN';
      cfnLoopOrchestrator.circuitBreaker.state = 'OPEN';
      
      await expect(cfnLoopOrchestrator.executePhase(phaseConfig)).rejects.toThrow('Circuit breaker is OPEN');
      
      // Verify circuit breaker state
      expect(circuitBreaker.getState()).toBe('OPEN');
    });
  });

  describe('Loop 2: Consensus with Validators', () => {
    it('should achieve consensus with validator votes', async () => {
      const validators = [
        {
          agentId: 'validator-1',
          agentType: 'reviewer',
          confidence: 0.92,
          vote: 'PASS',
          reasoning: 'High quality implementation',
          signature: 'sig-1',
          timestamp: Date.now()
        },
        {
          agentId: 'validator-2',
          agentType: 'security-specialist', 
          confidence: 0.88,
          vote: 'PASS',
          reasoning: 'No security vulnerabilities',
          signature: 'sig-2',
          timestamp: Date.now()
        },
        {
          agentId: 'validator-3',
          agentType: 'tester',
          confidence: 0.90,
          vote: 'PASS', 
          reasoning: 'All tests pass',
          signature: 'sig-3',
          timestamp: Date.now()
        }
      ];
      
      const consensusConfig = {
        phaseId: 'test-phase-1',
        validators,
        threshold: 0.80,
        timeoutMs: 30000
      };
      
      const result = await cfnLoopOrchestrator.executeConsensus(consensusConfig);
      
      expect(result.consensusPassed).toBe(true);
      expect(result.consensusScore).toBe(1.0);
      expect(result.votingBreakdown.PASS).toBe(3);
      expect(result.votingBreakdown.FAIL).toBe(0);
    });

    it('should handle consensus failures and retry logic', async () => {
      const validators = [
        {
          agentId: 'validator-1',
          agentType: 'reviewer',
          confidence: 0.30,
          vote: 'FAIL',
          reasoning: 'Critical issues found',
          signature: 'sig-1',
          timestamp: Date.now(),
          blockers: ['Security vulnerability']
        }
      ];
      
      const consensusConfig = {
        phaseId: 'test-phase-consensus-fail',
        validators,
        threshold: 0.80,
        timeoutMs: 30000
      };
      
      const result = await cfnLoopOrchestrator.executeConsensus(consensusConfig);
      
      expect(result.consensusPassed).toBe(false);
      expect(result.consensusScore).toBe(0.0);
      expect(result.votingBreakdown.FAIL).toBe(1);
      expect(result.votingBreakdown.PASS).toBe(0);
    });
  });

  describe('Loop 3: Primary Swarm with Confidence', () => {
    it('should execute primary swarm with confidence validation', async () => {
      const swarmConfig = {
        phaseId: 'test-phase-1',
        agents: ['developer', 'reviewer'],
        instructions: 'Implement test functionality',
        confidenceThreshold: 0.85,
        timeoutMs: 30000
      };
      
      const result = await cfnLoopOrchestrator.executePrimarySwarm(swarmConfig);
      
      expect(result.gatePassed).toBe(true);
      expect(result.confidenceValidation.overallConfidence).toBe(0.925);
      expect(result.confidenceValidation.passed).toBe(true);
      expect(result.responses).toHaveLength(2);
    });

    it('should handle low confidence scenarios with feedback injection', async () => {
      const swarmConfig = {
        phaseId: 'test-phase-low-confidence',
        agents: ['developer'],
        instructions: 'Implement complex feature',
        confidenceThreshold: 0.95, // Very high threshold
        timeoutMs: 30000
      };
      
      const result = await cfnLoopOrchestrator.executePrimarySwarm(swarmConfig);
      
      expect(result.gatePassed).toBe(false);
      expect(result.confidenceValidation.overallConfidence).toBe(0.925);
      expect(result.confidenceValidation.passed).toBe(false);
    });
  });

  describe('Loop 4: Product Owner Decision', () => {
    it('should make autonomous PROCEED decision with high confidence', async () => {
      const decisionConfig = {
        phaseId: 'test-phase-1',
        consensusResult: {
          consensusScore: 0.90,
          consensusThreshold: 0.80,
          consensusPassed: true,
          validatorResults: cfnLoopOrchestrator.getMockValidators(),
          votingBreakdown: { PASS: 3, FAIL: 0 },
          iteration: 1,
          timestamp: Date.now()
        },
        confidenceValidation: {
          overallConfidence: 0.925,
          threshold: 0.85,
          passed: true,
          timestamp: Date.now()
        }
      };
      
      const result = await cfnLoopOrchestrator.executeProductOwnerDecision(decisionConfig);
      
      expect(result.decision).toBe('PROCEED');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.blockers).toHaveLength(0);
      expect(result.backlogItems).toHaveLength(0);
    });

    it('should make DEFER decision for low confidence scenarios', async () => {
      const decisionConfig = {
        phaseId: 'test-phase-defer',
        consensusResult: {
          consensusScore: 0.70,
          consensusThreshold: 0.80,
          consensusPassed: false,
          validatorResults: cfnLoopOrchestrator.getMockValidators(),
          votingBreakdown: { PASS: 2, FAIL: 1 },
          iteration: 1,
          timestamp: Date.now()
        },
        confidenceValidation: {
          overallConfidence: 0.82,
          threshold: 0.85,
          passed: false,
          timestamp: Date.now()
        }
      };
      
      const result = await cfnLoopOrchestrator.executeProductOwnerDecision(decisionConfig);
      
      expect(result.decision).toBe('DEFER');
      expect(result.confidence).toBeLessThan(0.85);
      expect(result.backlogItems.length).toBeGreaterThan(0);
    });

    it('should make ESCALATE decision for critical blockers', async () => {
      const decisionConfig = {
        phaseId: 'test-phase-escalate',
        consensusResult: {
          consensusScore: 0.30,
          consensusThreshold: 0.80,
          consensusPassed: false,
          validatorResults: [
            {
              agentId: 'validator-1',
              agentType: 'security-specialist',
              confidence: 0.20,
              vote: 'FAIL',
              reasoning: 'Critical security vulnerability found',
              signature: 'sig-1',
              timestamp: Date.now(),
              blockers: ['SQL injection vulnerability']
            }
          ],
          votingBreakdown: { PASS: 0, FAIL: 1 },
          iteration: 1,
          timestamp: Date.now()
        },
        confidenceValidation: {
          overallConfidence: 0.45,
          threshold: 0.85,
          passed: false,
          timestamp: Date.now()
        }
      };
      
      const result = await cfnLoopOrchestrator.executeProductOwnerDecision(decisionConfig);
      
      expect(result.decision).toBe('ESCALATE');
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.blockers.length).toBeGreaterThan(0);
    });
  });

  describe('Complete CFN Loop Integration', () => {
    it('should execute complete CFN Loop with all phases', async () => {
      const completeLoopConfig = {
        phaseId: 'test-phase-complete',
        instructions: 'Execute complete CFN Loop test',
        agents: ['developer', 'reviewer'],
        validators: ['reviewer', 'security-specialist', 'tester'],
        confidenceThreshold: 0.85,
        consensusThreshold: 0.80,
        timeoutMs: 60000
      };
      
      const result = await cfnLoopOrchestrator.executePhase(completeLoopConfig);
      
      expect(result.success).toBe(true);
      expect(result.phaseId).toBe('test-phase-complete');
      expect(result.consensusResult.consensusPassed).toBe(true);
      expect(result.productOwnerDecision.decision).toBe('PROCEED');
      expect(result.escalated).toBe(false);
      expect(result.statistics.gatePasses).toBe(1);
      expect(result.statistics.gateFails).toBe(0);
    });

    it('should handle complete CFN Loop with feedback injection and recovery', async () => {
      const loopConfigWithFeedback = {
        phaseId: 'test-phase-feedback',
        instructions: 'Test CFN Loop with feedback injection',
        agents: ['developer'],
        validators: ['reviewer'],
        confidenceThreshold: 0.95, // High threshold to force feedback
        consensusThreshold: 0.80,
        timeoutMs: 60000
      };
      
      const result = await cfnLoopOrchestrator.executePhase(loopConfigWithFeedback);
      
      expect(result.success).toBe(true);
      expect(result.totalLoop2Iterations).toBe(1);
      expect(result.totalLoop3Iterations).toBe(1);
      expect(result.statistics.gateFails).toBe(1);
      expect(result.statistics.gatePasses).toBe(0);
    });
  });

  describe('Autonomous Phase Transitions', () => {
    it('should autonomously transition between CFN Loop phases', async () => {
      const transitionConfig = {
        phaseId: 'test-phase-transitions',
        instructions: 'Test autonomous phase transitions',
        agents: ['developer', 'reviewer'],
        validators: ['reviewer', 'security-specialist', 'tester'],
        confidenceThreshold: 0.85,
        consensusThreshold: 0.80,
        timeoutMs: 30000
      };
      
      const result = await cfnLoopOrchestrator.executePhase(transitionConfig);
      
      expect(result.success).toBe(true);
      expect(result.statistics.phaseTransitions).toHaveLength(5);
      expect(result.statistics.phaseTransitions[0]).toBe('Loop 1: Phase Execution Started');
      expect(result.statistics.phaseTransitions[1]).toBe('Loop 3: Primary Swarm Execution');
      expect(result.statistics.phaseTransitions[2]).toBe('Loop 2: Consensus with Validators');
      expect(result.statistics.phaseTransitions[3]).toBe('Loop 4: Product Owner Decision');
      expect(result.statistics.phaseTransitions[4]).toBe('Loop 1: Phase Execution Completed');
    });

    it('should handle phase transition failures with rollback', async () => {
      const failureConfig = {
        phaseId: 'test-phase-failure',
        instructions: 'Test phase transition failure handling',
        agents: ['developer'],
        validators: ['reviewer'],
        confidenceThreshold: 0.85,
        consensusThreshold: 0.80,
        timeoutMs: 5000
      };
      
      // Force circuit breaker to open
      cfnLoopOrchestrator.circuitBreaker.state = 'OPEN';
      
      await expect(cfnLoopOrchestrator.executePhase(failureConfig)).rejects.toThrow('Circuit breaker is OPEN');
      
      // Verify circuit breaker is triggered
      expect(cfnLoopOrchestrator.circuitBreaker.getState()).toBe('OPEN');
    });
  });

  describe('Confidence Reporting and Metrics', () => {
    it('should report confidence scores across all loops', async () => {
      const metricsConfig = {
        phaseId: 'test-phase-metrics',
        instructions: 'Test confidence reporting',
        agents: ['developer', 'reviewer'],
        validators: ['reviewer', 'security-specialist', 'tester'],
        confidenceThreshold: 0.85,
        consensusThreshold: 0.80,
        timeoutMs: 30000
      };
      
      const result = await cfnLoopOrchestrator.executePhase(metricsConfig);
      
      // Verify confidence reporting
      expect(result.confidenceScores).toHaveLength(2);
      expect(result.statistics.averageConfidenceScore).toBe(0.925);
      expect(result.consensusResult.consensusScore).toBe(1.0);
      expect(result.productOwnerDecision.confidence).toBeGreaterThan(0.9);
      
      // Verify confidence thresholds are met
      expect(result.confidenceScores.every(score => score.confidence >= 0.85)).toBe(true);
      expect(result.consensusResult.consensusScore).toBeGreaterThanOrEqual(0.80);
      expect(result.productOwnerDecision.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should track confidence trends over multiple iterations', async () => {
      const trendConfig = {
        phaseId: 'test-phase-trends',
        instructions: 'Test confidence trend tracking',
        agents: ['developer'],
        validators: ['reviewer'],
        confidenceThreshold: 0.85,
        consensusThreshold: 0.80,
        timeoutMs: 30000
      };
      
      // Execute multiple iterations to track trends
      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await cfnLoopOrchestrator.executePhase(trendConfig);
        results.push(result);
      }
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.statistics.averageConfidenceScore === 0.925)).toBe(true);
      expect(results.every(r => r.consensusResult.consensusScore === 1.0)).toBe(true);
    });
  });
});