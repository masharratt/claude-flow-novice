/**
 * FleetManager Unit Tests
 *
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { FleetManager, FLEET_PRESETS } from '../index.js';

describe('FleetManager', () => {
  let fleet;

  beforeEach(() => {
    fleet = new FleetManager({
      ...FLEET_PRESETS.development,
      redis: {
        host: 'localhost',
        port: 6379
      }
    });
  });

  afterEach(async () => { try {
    if (fleet && fleet.isInitialized) {
      await fleet.shutdown();
    }
  });

  describe('Initialization', () => {
    jest.setTimeout(10000);
  test('should create fleet manager instance', () => {
      expect(fleet).toBeInstanceOf(FleetManager);
      expect(fleet.fleetId).toBeDefined();
      expect(fleet.swarmId).toBeDefined();
    });

    jest.setTimeout(10000);
  test('should initialize successfully', async () => { try {
      await fleet.initialize();

      expect(fleet.isInitialized).toBe(true);
      expect(fleet.isRunning).toBe(true);
      expect(fleet.registry).toBeDefined();
      expect(fleet.allocator).toBeDefined();
      expect(fleet.coordinator).toBeDefined();
    });

    jest.setTimeout(10000);
  test('should initialize with custom configuration', () => {
      const customFleet = new FleetManager({
        maxAgents: 500,
        fleetId: 'custom-fleet',
        swarmId: 'custom-swarm'
      });

      expect(customFleet.config.maxAgents).toBe(500);
      expect(customFleet.fleetId).toBe('custom-fleet');
      expect(customFleet.swarmId).toBe('custom-swarm');
    });
  });

  describe('Agent Registration', () => {
    beforeEach(async () => { try {
      await fleet.initialize();
    });

    jest.setTimeout(10000);
  test('should register agent successfully', async () => { try {
      const agentId = await fleet.registerAgent({
        type: 'coder',
        priority: 8,
        capabilities: ['javascript', 'typescript']
      });

      expect(agentId).toBeDefined();
      expect(typeof agentId).toBe('string');
      expect(agentId).toMatch(/^agent-/);
    });

    jest.setTimeout(10000);
  test('should emit agent_registered event', async () => { try {
      const handler = jest.fn();
      fleet.on('agent_registered', handler);

      await fleet.registerAgent({
        type: 'tester',
        capabilities: ['unit-testing']
      });

      expect(handler).toHaveBeenCalled();
    });

    jest.setTimeout(10000);
  test('should increment total agents metric', async () => { try {
      const before = fleet.metrics.totalAgents;

      await fleet.registerAgent({
        type: 'reviewer',
        capabilities: ['code-review']
      });

      expect(fleet.metrics.totalAgents).toBe(before + 1);
    });
  });

  describe('Agent Allocation', () => {
    beforeEach(async () => { try {
      await fleet.initialize();
    });

    jest.setTimeout(10000);
  test('should allocate agent successfully', async () => { try {
      const allocation = await fleet.allocateAgent({
        type: 'coder',
        taskId: 'test-task-001',
        capabilities: ['javascript']
      });

      expect(allocation).toBeDefined();
      expect(allocation.agentId).toBeDefined();
      expect(allocation.poolType).toBe('coder');
      expect(allocation.allocationId).toBeDefined();
    });

    jest.setTimeout(10000);
  test('should update agent status to busy', async () => { try {
      const allocation = await fleet.allocateAgent({
        type: 'tester',
        taskId: 'test-task-002'
      });

      const agent = await fleet.registry.get(allocation.agentId);
      expect(agent.status).toBe('busy');
    });

    jest.setTimeout(10000);
  test('should increment active agents metric', async () => { try {
      const before = fleet.metrics.activeAgents;

      await fleet.allocateAgent({
        type: 'reviewer',
        taskId: 'test-task-003'
      });

      expect(fleet.metrics.activeAgents).toBe(before + 1);
    });

    jest.setTimeout(10000);
  test('should emit agent_allocated event', async () => { try {
      const handler = jest.fn();
      fleet.on('agent_allocated', handler);

      await fleet.allocateAgent({
        type: 'coder',
        taskId: 'test-task-004'
      });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Agent Release', () => {
    let agentId;

    beforeEach(async () => { try {
      await fleet.initialize();

      const allocation = await fleet.allocateAgent({
        type: 'coder',
        taskId: 'test-task-release'
      });

      agentId = allocation.agentId;
    });

    jest.setTimeout(10000);
  test('should release agent successfully', async () => { try {
      await expect(
        fleet.releaseAgent(agentId, {
          success: true,
          duration: 1000
        })
      ).resolves.not.toThrow();
    });

    jest.setTimeout(10000);
  test('should update agent status to idle', async () => { try {
      await fleet.releaseAgent(agentId, { success: true });

      const agent = await fleet.registry.get(agentId);
      expect(agent.status).toBe('idle');
    });

    jest.setTimeout(10000);
  test('should update task metrics on success', async () => { try {
      const before = fleet.metrics.tasksCompleted;

      await fleet.releaseAgent(agentId, { success: true });

      expect(fleet.metrics.tasksCompleted).toBe(before + 1);
    });

    jest.setTimeout(10000);
  test('should update task metrics on failure', async () => { try {
      const before = fleet.metrics.tasksFailed;

      await fleet.releaseAgent(agentId, {
        success: false,
        error: 'Task failed'
      });

      expect(fleet.metrics.tasksFailed).toBe(before + 1);
    });

    jest.setTimeout(10000);
  test('should update agent performance metrics', async () => { try {
      await fleet.releaseAgent(agentId, {
        success: true,
        duration: 1234
      });

      const agent = await fleet.registry.get(agentId);
      expect(agent.performance.tasksCompleted).toBeGreaterThan(0);
      expect(agent.performance.averageTaskTime).toBeGreaterThan(0);
    });
  });

  describe('Fleet Status', () => {
    beforeEach(async () => { try {
      await fleet.initialize();
    });

    jest.setTimeout(10000);
  test('should get fleet status', async () => { try {
      const status = await fleet.getStatus();

      expect(status).toBeDefined();
      expect(status.fleetId).toBe(fleet.fleetId);
      expect(status.swarmId).toBe(fleet.swarmId);
      expect(status.isRunning).toBe(true);
      expect(status.agents).toBeDefined();
      expect(status.pools).toBeDefined();
      expect(status.metrics).toBeDefined();
      expect(status.coordination).toBeDefined();
    });

    jest.setTimeout(10000);
  test('should include agent statistics', async () => { try {
      const status = await fleet.getStatus();

      expect(status.agents.total).toBeGreaterThanOrEqual(0);
      expect(status.agents.active).toBeGreaterThanOrEqual(0);
      expect(status.agents.idle).toBeGreaterThanOrEqual(0);
      expect(status.agents.failed).toBeGreaterThanOrEqual(0);
    });

    jest.setTimeout(10000);
  test('should include pool status', async () => { try {
      const status = await fleet.getStatus();

      expect(Object.keys(status.pools).length).toBeGreaterThan(0);

      const coderPool = status.pools.coder;
      expect(coderPool).toBeDefined();
      expect(coderPool.type).toBe('coder');
      expect(coderPool.currentAgents).toBeGreaterThanOrEqual(0);
      expect(coderPool.minAgents).toBeDefined();
      expect(coderPool.maxAgents).toBeDefined();
    });
  });

  describe('Fleet Health', () => {
    beforeEach(async () => { try {
      await fleet.initialize();
    });

    jest.setTimeout(10000);
  test('should get fleet health status', async () => { try {
      const health = await fleet.getHealth();

      expect(health).toBeDefined();
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.components).toBeDefined();
      expect(health.timestamp).toBeGreaterThan(0);
    });

    jest.setTimeout(10000);
  test('should include component health', async () => { try {
      const health = await fleet.getHealth();

      expect(health.components.coordinator).toBeDefined();
      expect(health.components.registry).toBeDefined();
      expect(health.components.allocator).toBeDefined();
      expect(health.components.autoScaler).toBeDefined();
      expect(health.components.monitor).toBeDefined();
    });

    jest.setTimeout(10000);
  test('should report healthy status when all components healthy', async () => { try {
      const health = await fleet.getHealth();

      expect(health.status).toBe('healthy');
    });
  });

  describe('Pool Scaling', () => {
    beforeEach(async () => { try {
      await fleet.initialize();
    });

    jest.setTimeout(10000);
  test('should scale pool up', async () => { try {
      const poolType = 'coder';
      const targetSize = 10;

      await fleet.scalePool(poolType, targetSize);

      const status = await fleet.getStatus();
      expect(status.pools[poolType].currentAgents).toBe(targetSize);
    });

    jest.setTimeout(10000);
  test('should scale pool down', async () => { try {
      const poolType = 'coder';

      // Scale up first
      await fleet.scalePool(poolType, 20);

      // Then scale down
      await fleet.scalePool(poolType, 10);

      const status = await fleet.getStatus();
      expect(status.pools[poolType].currentAgents).toBe(10);
    });

    jest.setTimeout(10000);
  test('should respect minimum pool size', async () => { try {
      const poolType = 'coder';
      const pool = await fleet.allocator.getPool(poolType);
      const minSize = pool.minAgents;

      // Try to scale below minimum
      await fleet.scalePool(poolType, 1);

      const status = await fleet.getStatus();
      expect(status.pools[poolType].currentAgents).toBeGreaterThanOrEqual(minSize);
    });

    jest.setTimeout(10000);
  test('should respect maximum pool size', async () => { try {
      const poolType = 'coder';
      const pool = await fleet.allocator.getPool(poolType);
      const maxSize = pool.maxAgents;

      // Try to scale above maximum
      await fleet.scalePool(poolType, maxSize + 100);

      const status = await fleet.getStatus();
      expect(status.pools[poolType].currentAgents).toBeLessThanOrEqual(maxSize);
    });
  });

  describe('Shutdown', () => {
    beforeEach(async () => { try {
      await fleet.initialize();
    });

    jest.setTimeout(10000);
  test('should shutdown gracefully', async () => { try {
      await fleet.shutdown();

      expect(fleet.isRunning).toBe(false);
    });

    jest.setTimeout(10000);
  test('should close all components', async () => { try {
      await fleet.shutdown();

      // Components should be cleaned up
      // Note: This is implementation-specific and may need adjustment
      expect(fleet.coordinator.isConnected()).toBe(false);
    });
  });

  describe('Event Handling', () => {
    beforeEach(async () => { try {
      await fleet.initialize();
    });

    jest.setTimeout(10000);
  test('should emit status events', (done) => {
      fleet.on('status', (status) => {
        expect(status).toBeDefined();
        expect(status.status).toBeDefined();
        expect(status.message).toBeDefined();
        return;
      });

      fleet.emit('status', { status: 'test', message: 'Test message' });
    });

    jest.setTimeout(10000);
  test('should emit error events', (done) => {
      fleet.on('error', (error) => {
        expect(error).toBeDefined();
        expect(error.type).toBe('test_error');
        return;
      });

      fleet.emit('error', { type: 'test_error', error: 'Test error' });
    });
  });
});

describe('Fleet Presets', () => {
  jest.setTimeout(10000);
  test('should provide development preset', () => {
    const preset = FLEET_PRESETS.development;

    expect(preset).toBeDefined();
    expect(preset.maxAgents).toBe(50);
    expect(preset.autoScaling.enabled).toBe(false);
  });

  jest.setTimeout(10000);
  test('should provide production preset', () => {
    const preset = FLEET_PRESETS.production;

    expect(preset).toBeDefined();
    expect(preset.maxAgents).toBe(1000);
    expect(preset.autoScaling.enabled).toBe(true);
    expect(preset.autoScaling.efficiencyTarget).toBe(0.45);
  });

  jest.setTimeout(10000);
  test('should provide enterprise preset', () => {
    const preset = FLEET_PRESETS.enterprise;

    expect(preset).toBeDefined();
    expect(preset.maxAgents).toBe(2000);
    expect(preset.autoScaling.enabled).toBe(true);
    expect(preset.autoScaling.efficiencyTarget).toBe(0.5);
  });
});
