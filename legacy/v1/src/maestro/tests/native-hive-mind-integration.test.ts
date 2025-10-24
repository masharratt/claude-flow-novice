/**
 * Native Hive Mind Integration Tests
 *
 * Comprehensive testing of the MaestroSwarmCoordinator and specs-driven
 * swarm topology to ensure proper integration with native hive mind.
 */

import {
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  it,
  expect,
  jest,
} from '@jest/globals';
import { EventBus } from '../../core/event-bus.js';
import { Logger } from '../../core/logger.js';
import { MaestroSwarmCoordinator, MaestroSwarmConfig } from '../maestro-swarm-coordinator.js';
import { HiveMindConfig } from '../../hive-mind/types.js';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, rm, access } from 'fs/promises';

describe('Native Hive Mind Integration Tests', () => {
  let swarmCoordinator: MaestroSwarmCoordinator;
  let eventBus: EventBus;
  let logger: Logger;
  let tempDir: string;
  let config: MaestroSwarmConfig;

  beforeAll(async () => { try {
    // Setup test environment
    tempDir = await mkdtemp(join(tmpdir(), 'maestro-test-'));

    // Initialize core components
    eventBus = new EventBus();
    logger = new Logger({ level: 'debug' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    // Configure test swarm
    config = {
      hiveMindConfig: {
        name: 'test-maestro-specs-swarm',
        topology: 'specs-driven',
        queenMode: 'strategic',
        maxAgents: 8,
        consensusThreshold: 0.66,
        memoryTTL: 60000, // 1 minute for testing
        autoSpawn: true,
        enableConsensus: true,
        enableMemory: true,
        enableCommunication: true,
      },
      enableConsensusValidation: true,
      enableLivingDocumentation: true,
      enableSteeringIntegration: true,
      specsDirectory: join(tempDir, 'specs'),
      steeringDirectory: join(tempDir, 'steering'),
    };
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterAll(async () => { try {
    // Cleanup
    if (swarmCoordinator) {
      await swarmCoordinator.shutdown();
    }
    await rm(tempDir, { recursive: true, force: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  beforeEach(async () => { try {
    // Create fresh coordinator for each test
    swarmCoordinator = new MaestroSwarmCoordinator(config, eventBus, logger);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(async () => { try {
    if (swarmCoordinator) {
      await swarmCoordinator.shutdown();
    }
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Swarm Initialization', () => {
    it('should initialize native hive mind with specs-driven topology', async () => { try {
      const swarmId = await swarmCoordinator.initialize();

      expect(swarmId).toBeDefined();
      expect(typeof swarmId).toBe('string');
      expect(swarmId).toMatch(/^swarm_/);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should spawn 8 specialized agents with correct types', async () => { try {
      await swarmCoordinator.initialize();

      // Verify swarm status contains all expected agent types
      const hiveMind = (swarmCoordinator as any).hiveMind;
      const agents = hiveMind.agents;

      expect(agents.size).toBe(8);

      // Check for specs-driven agent types
      const agentTypes = Array.from(agents.values()).map((agent: any) => agent.type);
      expect(agentTypes).toContain('requirements_analyst');
      expect(agentTypes).toContain('design_architect');
      expect(agentTypes).toContain('task_planner');
      expect(agentTypes).toContain('implementation_coder');
      expect(agentTypes).toContain('quality_reviewer');
      expect(agentTypes).toContain('steering_documenter');

      // Check agent counts
      expect(agentTypes.filter((t) => t === 'requirements_analyst')).toHaveLength(1);
      expect(agentTypes.filter((t) => t === 'design_architect')).toHaveLength(2);
      expect(agentTypes.filter((t) => t === 'task_planner')).toHaveLength(1);
      expect(agentTypes.filter((t) => t === 'implementation_coder')).toHaveLength(2);
      expect(agentTypes.filter((t) => t === 'quality_reviewer')).toHaveLength(1);
      expect(agentTypes.filter((t) => t === 'steering_documenter')).toHaveLength(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should initialize steering documents in swarm memory', async () => { try {
      await swarmCoordinator.initialize();

      const hiveMind = (swarmCoordinator as any).hiveMind;

      // Check that default steering documents are initialized
      const productSteering = await hiveMind.memory.retrieve('steering/product');
      const techSteering = await hiveMind.memory.retrieve('steering/tech');
      const workflowSteering = await hiveMind.memory.retrieve('steering/workflow');

      expect(productSteering).toBeDefined();
      expect(productSteering.domain).toBe('product');
      expect(techSteering).toBeDefined();
      expect(techSteering.domain).toBe('tech');
      expect(workflowSteering).toBeDefined();
      expect(workflowSteering.domain).toBe('workflow');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Specs-Driven Workflow', () => {
    beforeEach(async () => { try {
      await swarmCoordinator.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should create specification using requirements_analyst agent', async () => { try {
      const featureName = 'test-auth-feature';
      const initialRequest = 'Create user authentication system with JWT tokens';

      await swarmCoordinator.createSpec(featureName, initialRequest);

      // Verify workflow state
      const workflowState = swarmCoordinator.getWorkflowState(featureName);
      expect(workflowState).toBeDefined();
      expect(workflowState!.featureName).toBe(featureName);
      expect(workflowState!.currentPhase).toBe('Requirements Clarification');
      expect(workflowState!.status).toBe('running');

      // Verify requirements file was created
      const requirementsPath = join(config.specsDirectory, featureName, 'requirements.md');
      await expect(access(requirementsPath)).resolves.not.toThrow();
    }, 30000);

    it('should generate design using parallel design_architect agents with consensus', async () => { try {
      const featureName = 'test-design-feature';

      // First create spec
      await swarmCoordinator.createSpec(featureName, 'Test feature for design generation');

      // Then generate design
      await swarmCoordinator.generateDesign(featureName);

      // Verify workflow progression
      const workflowState = swarmCoordinator.getWorkflowState(featureName);
      expect(workflowState!.currentPhase).toBe('Research & Design');
      expect(workflowState!.history).toHaveLength(2);
      expect(workflowState!.history[1].phase).toBe('Research & Design');
      expect(workflowState!.history[1].status).toBe('completed');

      // Verify design file was created
      const designPath = join(config.specsDirectory, featureName, 'design.md');
      await expect(access(designPath)).resolves.not.toThrow();
    }, 60000);

    it('should generate tasks using task_planner agent', async () => { try {
      const featureName = 'test-tasks-feature';

      // Setup: create spec and design
      await swarmCoordinator.createSpec(featureName, 'Test feature for task generation');
      await swarmCoordinator.generateDesign(featureName);

      // Generate tasks
      await swarmCoordinator.generateTasks(featureName);

      // Verify workflow progression
      const workflowState = swarmCoordinator.getWorkflowState(featureName);
      expect(workflowState!.currentPhase).toBe('Implementation Planning');

      // Verify tasks file was created
      const tasksPath = join(config.specsDirectory, featureName, 'tasks.md');
      await expect(access(tasksPath)).resolves.not.toThrow();
    }, 90000);

    it('should implement tasks using implementation_coder agents', async () => { try {
      const featureName = 'test-implementation-feature';

      // Setup complete workflow
      await swarmCoordinator.createSpec(featureName, 'Test feature for implementation');
      await swarmCoordinator.generateDesign(featureName);
      await swarmCoordinator.generateTasks(featureName);

      // Implement first task
      await swarmCoordinator.implementTask(featureName, 1);

      // Verify workflow state
      const workflowState = swarmCoordinator.getWorkflowState(featureName);
      expect(workflowState!.currentPhase).toBe('Task Execution');
      expect(workflowState!.currentTaskIndex).toBe(1);
    }, 120000);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Consensus Validation', () => {
    beforeEach(async () => { try {
      await swarmCoordinator.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should use consensus for phase approval when enabled', async () => { try {
      const featureName = 'test-consensus-feature';

      await swarmCoordinator.createSpec(featureName, 'Test consensus validation');

      // Mock consensus engine for testing
      const hiveMind = (swarmCoordinator as any).hiveMind;
      const consensusEngine = hiveMind.consensus;

      jest.spyOn(consensusEngine, 'createProposal').mockResolvedValue('test-proposal-id');
      jest.spyOn(consensusEngine, 'getProposalStatus').mockResolvedValue({
        status: 'achieved',
        currentRatio: 0.75,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await swarmCoordinator.approvePhase(featureName);

      expect(consensusEngine.createProposal).toHaveBeenCalled();
      expect(consensusEngine.getProposalStatus).toHaveBeenCalled();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle consensus failure gracefully', async () => { try {
      const featureName = 'test-consensus-failure';

      await swarmCoordinator.createSpec(featureName, 'Test consensus failure handling');

      // Mock consensus failure
      const hiveMind = (swarmCoordinator as any).hiveMind;
      const consensusEngine = hiveMind.consensus;

      jest.spyOn(consensusEngine, 'createProposal').mockResolvedValue('test-proposal-id');
      jest.spyOn(consensusEngine, 'getProposalStatus').mockResolvedValue({
        status: 'failed',
        currentRatio: 0.4,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await expect(swarmCoordinator.approvePhase(featureName)).rejects.toThrow(
        'Phase approval consensus failed',
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Steering Integration', () => {
    beforeEach(async () => { try {
      await swarmCoordinator.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should create steering documents in swarm memory', async () => { try {
      const domain = 'custom-steering';
      const content = 'Custom steering guidelines for testing';

      await swarmCoordinator.createSteeringDocument(domain, content);

      const hiveMind = (swarmCoordinator as any).hiveMind;
      const storedDoc = await hiveMind.memory.retrieve(`steering/${domain}`);

      expect(storedDoc).toBeDefined();
      expect(storedDoc.content).toBe(content);
      expect(storedDoc.domain).toBe(domain);
      expect(storedDoc.maintainer).toBe('steering_documenter');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should broadcast steering updates to all agents', async () => { try {
      const domain = 'broadcast-test';
      const content = 'Test broadcast content';

      const hiveMind = (swarmCoordinator as any).hiveMind;
      const broadcastSpy = jest.spyOn(hiveMind.communication, 'broadcast');

      await swarmCoordinator.createSteeringDocument(domain, content);

      expect(broadcastSpy).toHaveBeenCalledWith({
        type: 'steering_update',
        domain,
        content: expect.stringContaining('Test broadcast content'),
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should retrieve steering context for agents', async () => { try {
      await swarmCoordinator.createSteeringDocument('test-context', 'Context for testing');

      const steeringContext = await (swarmCoordinator as any).getSteeringContext();

      expect(steeringContext).toContain('test-context');
      expect(steeringContext).toContain('Context for testing');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Performance and Error Handling', () => {
    beforeEach(async () => { try {
      await swarmCoordinator.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle agent spawning limits gracefully', async () => { try {
      // Test with reduced agent limit
      const limitedConfig = {
        ...config,
        hiveMindConfig: {
          ...config.hiveMindConfig,
          maxAgents: 4,
        },
      };

      const limitedCoordinator = new MaestroSwarmCoordinator(limitedConfig, eventBus, logger);
      await limitedCoordinator.initialize();

      const hiveMind = (limitedCoordinator as any).hiveMind;
      expect(hiveMind.agents.size).toBeLessThanOrEqual(4);

      await limitedCoordinator.shutdown();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should timeout on task completion properly', async () => { try {
      const featureName = 'timeout-test';

      // Mock task that never completes
      const hiveMind = (swarmCoordinator as any).hiveMind;
      jest.spyOn(hiveMind, 'getTask').mockResolvedValue({
        id: 'test-task',
        status: 'in_progress',
        result: null,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await expect(
        (swarmCoordinator as any).waitForTaskCompletion('test-task', 1000),
      ).rejects.toThrow('Task timeout');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle swarm shutdown gracefully', async () => { try {
      const hiveMind = (swarmCoordinator as any).hiveMind;
      const shutdownSpy = jest.spyOn(hiveMind, 'shutdown');

      await swarmCoordinator.shutdown();

      expect(shutdownSpy).toHaveBeenCalled();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Event Integration', () => {
    beforeEach(async () => { try {
      await swarmCoordinator.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should emit maestro events through event bus', async () => { try {
      const specCreatedSpy = jest.fn();
      eventBus.on('maestro:spec_created', specCreatedSpy);

      await swarmCoordinator.createSpec('event-test', 'Test event emission');

      expect(specCreatedSpy).toHaveBeenCalledWith({
        featureName: 'event-test',
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle event-driven workflow progression', async () => { try {
      const phaseApprovedSpy = jest.fn();
      eventBus.on('maestro:phase_approved', phaseApprovedSpy);

      const featureName = 'workflow-events';
      await swarmCoordinator.createSpec(featureName, 'Test workflow events');

      // Mock consensus for approval
      const hiveMind = (swarmCoordinator as any).hiveMind;
      const consensusEngine = hiveMind.consensus;
      jest.spyOn(consensusEngine, 'createProposal').mockResolvedValue('test-proposal');
      jest.spyOn(consensusEngine, 'getProposalStatus').mockResolvedValue({
        status: 'achieved',
        currentRatio: 0.8,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await swarmCoordinator.approvePhase(featureName);

      expect(phaseApprovedSpy).toHaveBeenCalledWith({
        featureName,
        nextPhase: 'Research & Design',
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

/**
 * Performance Benchmarks
 *
 * These tests measure performance improvements from native hive mind integration
 */
describe('Performance Benchmarks', () => {
  let coordinator: MaestroSwarmCoordinator;
  let eventBus: EventBus;
  let logger: Logger;
  let tempDir: string;

  beforeAll(async () => { try {
    tempDir = await mkdtemp(join(tmpdir(), 'maestro-perf-'));
    eventBus = new EventBus();
    logger = new Logger({ level: 'warn' }); // Reduce logging for performance tests

    const config: MaestroSwarmConfig = {
      hiveMindConfig: {
        name: 'perf-test-swarm',
        topology: 'specs-driven',
        queenMode: 'strategic',
        maxAgents: 8,
        consensusThreshold: 0.66,
        memoryTTL: 300000,
        autoSpawn: true,
        enableConsensus: false, // Disable for pure performance testing
        enableMemory: true,
        enableCommunication: true,
      },
      enableConsensusValidation: false,
      enableLivingDocumentation: true,
      enableSteeringIntegration: true,
      specsDirectory: join(tempDir, 'specs'),
      steeringDirectory: join(tempDir, 'steering'),
    };

    coordinator = new MaestroSwarmCoordinator(config, eventBus, logger);
    await coordinator.initialize();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterAll(async () => { try {
    await coordinator.shutdown();
    await rm(tempDir, { recursive: true, force: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  it('should initialize swarm within performance target (< 5 seconds)', async () => { try {
    const startTime = Date.now();

    const testCoordinator = new MaestroSwarmCoordinator(
      (coordinator as any).config,
      eventBus,
      logger,
    );

    await testCoordinator.initialize();
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(5000);

    await testCoordinator.shutdown();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  it('should create specs within performance target (< 2 minutes)', async () => { try {
    const startTime = Date.now();

    await coordinator.createSpec('perf-test-spec', 'Performance test specification');

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(120000); // 2 minutes
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  it('should handle multiple concurrent spec creations efficiently', async () => { try {
    const startTime = Date.now();
    const concurrentSpecs = 3;

    const promises = Array.from({ length: concurrentSpecs }, (_, i) =>
      coordinator.createSpec(`concurrent-spec-${i}`, `Concurrent test spec ${i}`),
    );

    await Promise.all(promises);

    const duration = Date.now() - startTime;
    const avgTimePerSpec = duration / concurrentSpecs;

    // Should be more efficient than sequential execution
    expect(avgTimePerSpec).toBeLessThan(90000); // < 1.5 minutes per spec on average
  }, 300000);
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
