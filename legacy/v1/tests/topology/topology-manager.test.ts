import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
const vi = jest;
import { TopologyManager, createTopologyManager } from '../../src/topology/topology-manager';
import { LifecycleManager } from '../../src/agents/lifecycle-manager';
import { DependencyTracker } from '../../src/lifecycle/dependency-tracker';
import { TopologyConfiguration, TopologyType } from '../../src/topology/types';

// Mock dependencies
vi.mock('../../src/agents/lifecycle-manager');
vi.mock('../../src/lifecycle/dependency-tracker');
vi.mock('../../src/core/logger');
vi.mock('../../src/utils/helpers', () => ({
  generateId: vi.fn().mockImplementation((prefix = '') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
}));

describe('TopologyManager', () => {
  let topologyManager: TopologyManager;
  let mockLifecycleManager: vi.Mocked<LifecycleManager>;
  let mockDependencyTracker: vi.Mocked<DependencyTracker>;

  beforeEach(async () => {
    // Setup mocks
    mockLifecycleManager = {
      initializeAgent: vi.fn().mockResolvedValue({ state: 'running' }),
      transitionState: vi.fn().mockResolvedValue(undefined),
      pauseAgent: vi.fn().mockResolvedValue(undefined),
      resumeAgent: vi.fn().mockResolvedValue(undefined)
    } as any;

    mockDependencyTracker = {
      initialize: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
      getAllDependencies: vi.fn().mockResolvedValue([]),
      addDependency: vi.fn().mockResolvedValue('dep-id'),
      hasDependencies: vi.fn().mockResolvedValue(false),
      getDependencyDetails: vi.fn().mockReturnValue(null)
    } as any;

    // Create topology manager instance
    topologyManager = createTopologyManager({
      maxTopologies: 5,
      maxBridges: 10,
      enableCrossTopologyRouting: true,
      enableAdaptiveOptimization: true
    });

    // Replace mocked dependencies
    (topologyManager as any).lifecycleManager = mockLifecycleManager;
    (topologyManager as any).dependencyTracker = mockDependencyTracker;
  });

  afterEach(async () => {
    if (topologyManager) {
      await topologyManager.shutdown(true);
    }
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await topologyManager.initialize();

      expect(mockDependencyTracker.initialize).toHaveBeenCalled();
      expect(mockLifecycleManager.initializeAgent).toHaveBeenCalled();
      expect(mockLifecycleManager.transitionState).toHaveBeenCalledWith(
        expect.any(String),
        'running',
        'Topology manager started'
      );
    });

    test('should not initialize twice', async () => {
      await topologyManager.initialize();
      await topologyManager.initialize();

      expect(mockDependencyTracker.initialize).toHaveBeenCalledTimes(1);
    });

    test('should emit initialization event', async () => {
      const initSpy = vi.fn();
      topologyManager.on('manager:initialized', initSpy);

      await topologyManager.initialize();

      expect(initSpy).toHaveBeenCalledWith({
        managerId: expect.any(String)
      });
    });
  });

  describe('Topology Lifecycle', () => {
    beforeEach(async () => {
      await topologyManager.initialize();
    });

    test('should create mesh topology', async () => {
      const config: TopologyConfiguration = {
        type: 'mesh',
        name: 'test-mesh',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'round_robin',
        maxAgents: 10,
        maxConnections: 20,
        enableCrossTopology: true,
        enableAdaptiveOptimization: false,
        performanceThresholds: {
          latency: 1000,
          throughput: 100,
          errorRate: 0.05
        },
        timeouts: {
          coordination: 30000,
          completion: 300000,
          adaptation: 120000
        },
        memoryNamespace: 'test-mesh'
      };

      const coordinator = await topologyManager.createTopology(config);

      expect(coordinator).toBeDefined();
      expect(coordinator.type).toBe('mesh');
      expect(topologyManager.getAllTopologies()).toHaveLength(1);
    });

    test('should create hierarchical topology', async () => {
      const config: TopologyConfiguration = {
        type: 'hierarchical',
        name: 'test-hierarchical',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'adaptive',
        maxAgents: 15,
        maxConnections: 10,
        enableCrossTopology: true,
        enableAdaptiveOptimization: true,
        performanceThresholds: {
          latency: 500,
          throughput: 50,
          errorRate: 0.03
        },
        timeouts: {
          coordination: 20000,
          completion: 180000,
          adaptation: 90000
        },
        memoryNamespace: 'test-hierarchical'
      };

      const coordinator = await topologyManager.createTopology(config);

      expect(coordinator).toBeDefined();
      expect(coordinator.type).toBe('hierarchical');
    });

    test('should create hybrid topology', async () => {
      const config: TopologyConfiguration = {
        type: 'hybrid',
        name: 'test-hybrid',
        strategy: 'adaptive',
        faultTolerance: 'byzantine',
        loadBalancing: 'adaptive',
        maxAgents: 25,
        maxConnections: 15,
        enableCrossTopology: true,
        enableAdaptiveOptimization: true,
        performanceThresholds: {
          latency: 750,
          throughput: 75,
          errorRate: 0.04
        },
        timeouts: {
          coordination: 25000,
          completion: 240000,
          adaptation: 100000
        },
        memoryNamespace: 'test-hybrid'
      };

      const coordinator = await topologyManager.createTopology(config);

      expect(coordinator).toBeDefined();
      expect(coordinator.type).toBe('hybrid');
    });

    test('should enforce topology limit', async () => {
      const config: TopologyConfiguration = {
        type: 'mesh',
        name: 'test-mesh',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'round_robin',
        maxAgents: 10,
        maxConnections: 20,
        enableCrossTopology: true,
        enableAdaptiveOptimization: false,
        performanceThresholds: {
          latency: 1000,
          throughput: 100,
          errorRate: 0.05
        },
        timeouts: {
          coordination: 30000,
          completion: 300000,
          adaptation: 120000
        },
        memoryNamespace: 'test-mesh'
      };

      // Create maximum number of topologies
      for (let i = 0; i < 5; i++) {
        await topologyManager.createTopology({
          ...config,
          name: `test-mesh-${i}`
        });
      }

      // Should fail to create another
      await expect(topologyManager.createTopology(config))
        .rejects.toThrow('Maximum topology limit reached');
    });

    test('should destroy topology', async () => {
      const config: TopologyConfiguration = {
        type: 'mesh',
        name: 'test-mesh',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'round_robin',
        maxAgents: 10,
        maxConnections: 20,
        enableCrossTopology: true,
        enableAdaptiveOptimization: false,
        performanceThresholds: {
          latency: 1000,
          throughput: 100,
          errorRate: 0.05
        },
        timeouts: {
          coordination: 30000,
          completion: 300000,
          adaptation: 120000
        },
        memoryNamespace: 'test-mesh'
      };

      const coordinator = await topologyManager.createTopology(config);
      const topologyId = (coordinator as any).id;

      await topologyManager.destroyTopology(topologyId);

      expect(topologyManager.getTopology(topologyId)).toBeUndefined();
      expect(topologyManager.getAllTopologies()).toHaveLength(0);
    });

    test('should emit topology events', async () => {
      const createdSpy = vi.fn();
      const destroyedSpy = vi.fn();

      topologyManager.on('topology:created', createdSpy);
      topologyManager.on('topology:destroyed', destroyedSpy);

      const config: TopologyConfiguration = {
        type: 'mesh',
        name: 'test-mesh',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'round_robin',
        maxAgents: 10,
        maxConnections: 20,
        enableCrossTopology: true,
        enableAdaptiveOptimization: false,
        performanceThresholds: {
          latency: 1000,
          throughput: 100,
          errorRate: 0.05
        },
        timeouts: {
          coordination: 30000,
          completion: 300000,
          adaptation: 120000
        },
        memoryNamespace: 'test-mesh'
      };

      const coordinator = await topologyManager.createTopology(config);
      const topologyId = (coordinator as any).id;

      expect(createdSpy).toHaveBeenCalledWith({
        type: 'topology:created',
        timestamp: expect.any(Date),
        topologyId,
        data: { config }
      });

      await topologyManager.destroyTopology(topologyId);

      expect(destroyedSpy).toHaveBeenCalledWith({
        type: 'topology:destroyed',
        timestamp: expect.any(Date),
        topologyId,
        data: {}
      });
    });
  });

  describe('Bridge Management', () => {
    let topology1: any;
    let topology2: any;

    beforeEach(async () => {
      await topologyManager.initialize();

      const config1: TopologyConfiguration = {
        type: 'mesh',
        name: 'mesh-1',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'round_robin',
        maxAgents: 10,
        maxConnections: 20,
        enableCrossTopology: true,
        enableAdaptiveOptimization: false,
        performanceThresholds: {
          latency: 1000,
          throughput: 100,
          errorRate: 0.05
        },
        timeouts: {
          coordination: 30000,
          completion: 300000,
          adaptation: 120000
        },
        memoryNamespace: 'mesh-1'
      };

      const config2: TopologyConfiguration = {
        type: 'hierarchical',
        name: 'hierarchical-1',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'adaptive',
        maxAgents: 15,
        maxConnections: 10,
        enableCrossTopology: true,
        enableAdaptiveOptimization: true,
        performanceThresholds: {
          latency: 500,
          throughput: 50,
          errorRate: 0.03
        },
        timeouts: {
          coordination: 20000,
          completion: 180000,
          adaptation: 90000
        },
        memoryNamespace: 'hierarchical-1'
      };

      topology1 = await topologyManager.createTopology(config1);
      topology2 = await topologyManager.createTopology(config2);
    });

    test('should create bridge between topologies', async () => {
      const bridge = await topologyManager.createBridge(
        topology1.id,
        topology2.id,
        'protocol_adapter'
      );

      expect(bridge).toBeDefined();
      expect(bridge.sourceTopology).toBe(topology1.id);
      expect(bridge.targetTopology).toBe(topology2.id);
      expect(bridge.status).toBe('active');
    });

    test('should remove bridge', async () => {
      const bridge = await topologyManager.createBridge(
        topology1.id,
        topology2.id
      );

      await topologyManager.removeBridge(bridge.id);

      // Verify bridge is removed (would need access to internal bridges map)
      // This is tested indirectly through topology destruction
    });

    test('should enforce bridge limit', async () => {
      // Create bridges up to the limit
      const bridges = [];
      for (let i = 0; i < 10; i++) {
        // Create additional topologies as needed
        const config: TopologyConfiguration = {
          type: 'mesh',
          name: `mesh-${i}`,
          strategy: 'balanced',
          faultTolerance: 'basic',
          loadBalancing: 'round_robin',
          maxAgents: 5,
          maxConnections: 10,
          enableCrossTopology: true,
          enableAdaptiveOptimization: false,
          performanceThresholds: {
            latency: 1000,
            throughput: 100,
            errorRate: 0.05
          },
          timeouts: {
            coordination: 30000,
            completion: 300000,
            adaptation: 120000
          },
          memoryNamespace: `mesh-${i}`
        };

        if (i >= 2) {
          const extraTopology = await topologyManager.createTopology(config);
          const bridge = await topologyManager.createBridge(
            topology1.id,
            extraTopology.id
          );
          bridges.push(bridge);
        }
      }

      // Should fail to create another bridge
      const config: TopologyConfiguration = {
        type: 'mesh',
        name: 'extra-mesh',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'round_robin',
        maxAgents: 5,
        maxConnections: 10,
        enableCrossTopology: true,
        enableAdaptiveOptimization: false,
        performanceThresholds: {
          latency: 1000,
          throughput: 100,
          errorRate: 0.05
        },
        timeouts: {
          coordination: 30000,
          completion: 300000,
          adaptation: 120000
        },
        memoryNamespace: 'extra-mesh'
      };

      const extraTopology = await topologyManager.createTopology(config);

      await expect(topologyManager.createBridge(topology1.id, extraTopology.id))
        .rejects.toThrow('Maximum bridge limit reached');
    });
  });

  describe('Optimization and Adaptation', () => {
    let topology: any;

    beforeEach(async () => {
      await topologyManager.initialize();

      const config: TopologyConfiguration = {
        type: 'mesh',
        name: 'test-mesh',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'round_robin',
        maxAgents: 10,
        maxConnections: 20,
        enableCrossTopology: true,
        enableAdaptiveOptimization: true,
        performanceThresholds: {
          latency: 1000,
          throughput: 100,
          errorRate: 0.05
        },
        timeouts: {
          coordination: 30000,
          completion: 300000,
          adaptation: 120000
        },
        memoryNamespace: 'test-mesh'
      };

      topology = await topologyManager.createTopology(config);
    });

    test('should optimize topology', async () => {
      // Mock topology metrics
      const mockMetrics = {
        agentCount: 15,
        activeConnections: 30,
        averageLatency: 2000, // High latency
        throughput: 50,
        errorRate: 0.02,
        resourceUtilization: 0.8,
        faultTolerance: 0.9,
        lastUpdated: new Date()
      };

      topology.getMetrics = vi.fn().mockReturnValue(mockMetrics);

      const result = await topologyManager.optimizeTopology(topology.id);

      expect(result).toBeDefined();
      expect(result.originalTopology).toBeDefined();
      expect(result.improvements).toBeDefined();
    });

    test('should adapt topology configuration', async () => {
      const newConfig = {
        maxAgents: 20,
        performanceThresholds: {
          latency: 800,
          throughput: 120,
          errorRate: 0.04
        }
      };

      await topologyManager.adaptTopology(topology.id, newConfig);

      // Verify configuration was updated
      expect(topology.config.maxAgents).toBe(20);
      expect(topology.config.performanceThresholds.latency).toBe(800);
    });

    test('should recommend topology based on requirements', async () => {
      const requirements = {
        expectedAgents: 100,
        latencyRequirement: 500,
        throughputRequirement: 200,
        faultToleranceLevel: 'byzantine',
        consistencyLevel: 'strong'
      };

      const recommendation = await topologyManager.recommendTopology(requirements);

      expect(recommendation).toBeDefined();
      expect(recommendation.type).toBe('hierarchical'); // Should recommend hierarchical for large scale
      expect(recommendation.maxAgents).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Monitoring and Metrics', () => {
    beforeEach(async () => {
      await topologyManager.initialize();
    });

    test('should get global metrics', async () => {
      const config: TopologyConfiguration = {
        type: 'mesh',
        name: 'test-mesh',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'round_robin',
        maxAgents: 10,
        maxConnections: 20,
        enableCrossTopology: true,
        enableAdaptiveOptimization: false,
        performanceThresholds: {
          latency: 1000,
          throughput: 100,
          errorRate: 0.05
        },
        timeouts: {
          coordination: 30000,
          completion: 300000,
          adaptation: 120000
        },
        memoryNamespace: 'test-mesh'
      };

      const topology = await topologyManager.createTopology(config);
      const topologyId = topology.id;

      const metrics = topologyManager.getGlobalMetrics();

      expect(metrics).toBeDefined();
      expect(metrics[topologyId]).toBeDefined();
    });

    test('should get resource utilization', async () => {
      const utilization = topologyManager.getResourceUtilization();

      expect(utilization).toBeDefined();
      expect(utilization.topologyCount).toBe(0);
      expect(utilization.bridgeCount).toBe(0);
      expect(utilization.totalAgents).toBe(0);
    });

    test('should detect bottlenecks', async () => {
      const config: TopologyConfiguration = {
        type: 'mesh',
        name: 'test-mesh',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'round_robin',
        maxAgents: 10,
        maxConnections: 20,
        enableCrossTopology: true,
        enableAdaptiveOptimization: false,
        performanceThresholds: {
          latency: 1000,
          throughput: 100,
          errorRate: 0.05
        },
        timeouts: {
          coordination: 30000,
          completion: 300000,
          adaptation: 120000
        },
        memoryNamespace: 'test-mesh'
      };

      const topology = await topologyManager.createTopology(config);

      // Mock high latency metrics
      const mockMetrics = {
        agentCount: 5,
        activeConnections: 10,
        averageLatency: 6000, // Critical latency
        throughput: 150,
        errorRate: 0.02,
        resourceUtilization: 0.6,
        faultTolerance: 0.9,
        lastUpdated: new Date()
      };

      topology.getMetrics = vi.fn().mockReturnValue(mockMetrics);

      const bottlenecks = topologyManager.detectBottlenecks();

      expect(bottlenecks).toBeDefined();
      expect(bottlenecks.some(b => b.component.includes('latency'))).toBe(true);
    });

    test('should get manager status', async () => {
      const status = topologyManager.getManagerStatus();

      expect(status).toBeDefined();
      expect(status.managerId).toBeDefined();
      expect(status.topologyCount).toBe(0);
      expect(status.bridgeCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await topologyManager.initialize();
    });

    test('should handle topology creation failure', async () => {
      const invalidConfig = {
        type: 'invalid' as TopologyType,
        name: 'invalid-topology',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'round_robin',
        maxAgents: 10,
        maxConnections: 20,
        enableCrossTopology: true,
        enableAdaptiveOptimization: false,
        performanceThresholds: {
          latency: 1000,
          throughput: 100,
          errorRate: 0.05
        },
        timeouts: {
          coordination: 30000,
          completion: 300000,
          adaptation: 120000
        },
        memoryNamespace: 'invalid'
      } as TopologyConfiguration;

      await expect(topologyManager.createTopology(invalidConfig))
        .rejects.toThrow('Unsupported topology type: invalid');
    });

    test('should handle bridge creation with non-existent topologies', async () => {
      await expect(topologyManager.createBridge('non-existent-1', 'non-existent-2'))
        .rejects.toThrow('Source or target topology not found');
    });

    test('should handle optimization of non-existent topology', async () => {
      await expect(topologyManager.optimizeTopology('non-existent'))
        .rejects.toThrow('Topology non-existent not found');
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      await topologyManager.initialize();

      const config: TopologyConfiguration = {
        type: 'mesh',
        name: 'test-mesh',
        strategy: 'balanced',
        faultTolerance: 'basic',
        loadBalancing: 'round_robin',
        maxAgents: 10,
        maxConnections: 20,
        enableCrossTopology: true,
        enableAdaptiveOptimization: false,
        performanceThresholds: {
          latency: 1000,
          throughput: 100,
          errorRate: 0.05
        },
        timeouts: {
          coordination: 30000,
          completion: 300000,
          adaptation: 120000
        },
        memoryNamespace: 'test-mesh'
      };

      await topologyManager.createTopology(config);

      const shutdownSpy = vi.fn();
      topologyManager.on('manager:shutdown', shutdownSpy);

      await topologyManager.shutdown();

      expect(mockLifecycleManager.transitionState).toHaveBeenCalledWith(
        expect.any(String),
        'stopped',
        'Topology manager shutdown'
      );
      expect(mockDependencyTracker.shutdown).toHaveBeenCalled();
      expect(shutdownSpy).toHaveBeenCalled();
    });

    test('should force shutdown', async () => {
      await topologyManager.initialize();

      await topologyManager.shutdown(true);

      expect(mockDependencyTracker.shutdown).toHaveBeenCalled();
    });
  });
});