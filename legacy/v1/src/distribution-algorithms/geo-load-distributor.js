/**
 * Geographic Load Distributor
 *
 * This component handles intelligent geographic distribution of workload
 * across nodes, considering latency, data locality, and regional constraints.
 */

import { EventEmitter } from 'events';
import { connectRedis } from '../cli/utils/redis-client.js';
import crypto from 'crypto';

/**
 * Geographic Configuration
 */
const GEO_CONFIG = {
  redis: {
    host: 'localhost',
    port: 6379,
    database: 0
  },
  distribution: {
    strategy: 'latency_optimized',
    regionWeight: 0.3,
    latencyWeight: 0.4,
    loadWeight: 0.2,
    costWeight: 0.1,
    maxLatencyThreshold: 200, // ms
    dataLocalityBonus: 0.2,
    complianceWeight: 0.5
  },
  monitoring: {
    updateInterval: 30000, // 30 seconds
    latencyHistorySize: 100,
    loadHistorySize: 50,
    regionHealthThreshold: 0.9
  },
  regions: {
    default: {
      lat: 0,
      lon: 0,
      datacenters: ['global']
    },
    'us-east': {
      lat: 40.7128,
      lon: -74.0060,
      datacenters: ['aws-us-east-1', 'gcp-us-east1', 'azure-eastus']
    },
    'us-west': {
      lat: 37.7749,
      lon: -122.4194,
      datacenters: ['aws-us-west-1', 'gcp-us-west1', 'azure-westus']
    },
    'eu-west': {
      lat: 51.5074,
      lon: -0.1278,
      datacenters: ['aws-eu-west-1', 'gcp-europe-west1', 'azure-westeurope']
    },
    'asia-east': {
      lat: 35.6762,
      lon: 139.6503,
      datacenters: ['aws-ap-northeast-1', 'gcp-asia-northeast1', 'azure-japaneast']
    }
  }
};

/**
 * Geographic Region Manager
 */
class GeographicRegionManager {
  constructor(config = {}) {
    this.config = { ...GEO_CONFIG, ...config };
    this.regions = new Map();
    this.nodesByRegion = new Map();
    this.regionHealth = new Map();
    this.latencyMatrix = new Map();
    this.initializeRegions();
  }

  initializeRegions() {
    // Initialize default regions
    for (const [regionId, regionData] of Object.entries(this.config.regions)) {
      this.regions.set(regionId, {
        id: regionId,
        location: {
          lat: regionData.lat,
          lon: regionData.lon
        },
        datacenters: regionData.datacenters,
        nodes: [],
        metrics: {
          totalLoad: 0,
          avgLatency: 0,
          nodeCount: 0,
          healthScore: 1.0,
          lastUpdate: Date.now()
        }
      });

      this.nodesByRegion.set(regionId, new Set());
      this.regionHealth.set(regionId, 1.0);
    }
  }

  registerNode(node) {
    const regionId = this.determineNodeRegion(node);

    if (!this.regions.has(regionId)) {
      // Create new region if it doesn't exist
      this.regions.set(regionId, {
        id: regionId,
        location: node.location || { lat: 0, lon: 0 },
        datacenters: [],
        nodes: [],
        metrics: {
          totalLoad: 0,
          avgLatency: 0,
          nodeCount: 0,
          healthScore: 1.0,
          lastUpdate: Date.now()
        }
      });

      this.nodesByRegion.set(regionId, new Set());
      this.regionHealth.set(regionId, 1.0);
    }

    // Add node to region
    const region = this.regions.get(regionId);
    region.nodes.push(node);
    region.metrics.nodeCount++;
    this.nodesByRegion.get(regionId).add(node.id);

    console.log(`Node ${node.id} registered to region ${regionId}`);
    return regionId;
  }

  determineNodeRegion(node) {
    if (node.region) {
      return node.region;
    }

    if (node.location) {
      // Find closest region based on coordinates
      let closestRegion = 'default';
      let minDistance = Infinity;

      for (const [regionId, regionData] of Object.entries(this.config.regions)) {
        const distance = this.calculateDistance(
          node.location,
          { lat: regionData.lat, lon: regionData.lon }
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestRegion = regionId;
        }
      }

      return closestRegion;
    }

    return 'default';
  }

  calculateDistance(loc1, loc2) {
    // Haversine distance formula
    const R = 6371; // Earth radius in km
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
    const dLon = (loc2.lon - loc1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  updateRegionMetrics(regionId, metrics) {
    const region = this.regions.get(regionId);
    if (!region) return;

    region.metrics = {
      ...region.metrics,
      ...metrics,
      lastUpdate: Date.now()
    };

    // Update region health
    const healthScore = this.calculateRegionHealth(regionId);
    this.regionHealth.set(regionId, healthScore);
  }

  calculateRegionHealth(regionId) {
    const region = this.regions.get(regionId);
    if (!region) return 0;

    const { metrics } = region;

    // Health based on load, latency, and node availability
    const loadScore = Math.max(0, 1 - (metrics.totalLoad / (metrics.nodeCount * 100)));
    const latencyScore = Math.max(0, 1 - (metrics.avgLatency / this.config.distribution.maxLatencyThreshold));
    const availabilityScore = region.nodes.filter(n => n.status === 'healthy').length / region.nodes.length;

    return (loadScore * 0.4 + latencyScore * 0.3 + availabilityScore * 0.3);
  }

  updateLatencyMatrix(fromRegion, toRegion, latency) {
    const key = `${fromRegion}-${toRegion}`;
    if (!this.latencyMatrix.has(key)) {
      this.latencyMatrix.set(key, []);
    }

    const history = this.latencyMatrix.get(key);
    history.push({
      latency,
      timestamp: Date.now()
    });

    // Keep only recent measurements
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    while (history.length > 0 && history[0].timestamp < cutoffTime) {
      history.shift();
    }
  }

  getInterRegionLatency(fromRegion, toRegion) {
    const key = `${fromRegion}-${toRegion}`;
    const history = this.latencyMatrix.get(key);

    if (!history || history.length === 0) {
      // Estimate based on geographic distance
      const fromLoc = this.regions.get(fromRegion)?.location;
      const toLoc = this.regions.get(toRegion)?.location;

      if (fromLoc && toLoc) {
        const distance = this.calculateDistance(fromLoc, toLoc);
        return Math.max(10, distance * 2); // Rough estimate: 2ms per 1000km
      }

      return 100; // Default latency
    }

    // Return average of recent measurements
    const recent = history.slice(-10);
    return recent.reduce((sum, h) => sum + h.latency, 0) / recent.length;
  }

  getRegionalDistribution() {
    const distribution = {};

    for (const [regionId, region] of this.regions) {
      distribution[regionId] = {
        nodeCount: region.nodes.length,
        totalLoad: region.metrics.totalLoad,
        avgLatency: region.metrics.avgLatency,
        healthScore: region.metrics.healthScore,
        capacity: this.calculateRegionCapacity(regionId)
      };
    }

    return distribution;
  }

  calculateRegionCapacity(regionId) {
    const region = this.regions.get(regionId);
    if (!region) return 0;

    return region.nodes.reduce((total, node) => {
      return total + (node.capacity?.compute || 100);
    }, 0);
  }

  getNodesByRegion(regionId) {
    const nodeIds = this.nodesByRegion.get(regionId);
    if (!nodeIds) return [];

    return Array.from(nodeIds);
  }

  getRegionForLocation(location) {
    let closestRegion = 'default';
    let minDistance = Infinity;

    for (const [regionId, region] of this.regions) {
      const distance = this.calculateDistance(location, region.location);
      if (distance < minDistance) {
        minDistance = distance;
        closestRegion = regionId;
      }
    }

    return closestRegion;
  }
}

/**
 * Geographic Load Balancer
 */
class GeographicLoadBalancer {
  constructor(regionManager, config = {}) {
    this.regionManager = regionManager;
    this.config = config;
    this.loadDistributionHistory = new Map();
    this.distributionStrategies = {
      'latency_optimized': this.latencyOptimizedDistribution.bind(this),
      'cost_optimized': this.costOptimizedDistribution.bind(this),
      'balanced': this.balancedDistribution.bind(this),
      'compliance_aware': this.complianceAwareDistribution.bind(this)
    };
  }

  async distributeLoad(tasks, constraints = {}) {
    const strategy = constraints.strategy || this.config.distribution.strategy;
    const distributionFn = this.distributionStrategies[strategy];

    if (!distributionFn) {
      throw new Error(`Unknown distribution strategy: ${strategy}`);
    }

    const distribution = await distributionFn(tasks, constraints);

    // Record distribution for learning
    this.recordDistribution(tasks, distribution, strategy);

    return distribution;
  }

  async latencyOptimizedDistribution(tasks, constraints) {
    const distribution = new Map();
    const taskRegions = new Map();

    // Group tasks by preferred region
    for (const task of tasks) {
      const preferredRegion = this.determineTaskRegion(task, constraints);
      taskRegions.set(task.id, preferredRegion);
    }

    // Distribute tasks based on latency optimization
    for (const task of tasks) {
      const preferredRegion = taskRegions.get(task.id);
      const targetNodes = this.findOptimalNodesForTask(task, preferredRegion, 'latency');

      if (targetNodes.length > 0) {
        const selectedNode = this.selectBestNode(targetNodes, task, 'latency');
        distribution.set(task.id, {
          taskId: task.id,
          nodeId: selectedNode.id,
          region: preferredRegion,
          strategy: 'latency_optimized',
          score: this.calculateNodeScore(selectedNode, task, 'latency')
        });
      } else {
        // Fallback to any available node
        const fallbackNode = this.findFallbackNode(task);
        if (fallbackNode) {
          distribution.set(task.id, {
            taskId: task.id,
            nodeId: fallbackNode.id,
            region: this.regionManager.determineNodeRegion(fallbackNode),
            strategy: 'latency_optimized_fallback',
            score: this.calculateNodeScore(fallbackNode, task, 'latency')
          });
        }
      }
    }

    return distribution;
  }

  async costOptimizedDistribution(tasks, constraints) {
    const distribution = new Map();

    for (const task of tasks) {
      const targetNodes = this.findOptimalNodesForTask(task, null, 'cost');

      if (targetNodes.length > 0) {
        const selectedNode = this.selectBestNode(targetNodes, task, 'cost');
        const regionId = this.regionManager.determineNodeRegion(selectedNode);

        distribution.set(task.id, {
          taskId: task.id,
          nodeId: selectedNode.id,
          region: regionId,
          strategy: 'cost_optimized',
          score: this.calculateNodeScore(selectedNode, task, 'cost')
        });
      }
    }

    return distribution;
  }

  async balancedDistribution(tasks, constraints) {
    const distribution = new Map();
    const regionLoads = new Map();

    // Initialize current loads
    for (const [regionId, region] of this.regionManager.regions) {
      regionLoads.set(regionId, region.metrics.totalLoad);
    }

    for (const task of tasks) {
      const preferredRegion = this.determineTaskRegion(task, constraints);
      const candidates = [];

      // Find candidates across regions
      for (const [regionId, region] of this.regionManager.regions) {
        const regionNodes = region.nodes.filter(n => n.status === 'healthy');

        for (const node of regionNodes) {
          const score = this.calculateBalancedScore(node, task, regionId, regionLoads);
          candidates.push({ node, regionId, score });
        }
      }

      // Sort by score and select best
      candidates.sort((a, b) => b.score - a.score);

      if (candidates.length > 0) {
        const selected = candidates[0];
        const loadIncrease = task.computeUnits || 1;

        // Update region load
        regionLoads.set(selected.regionId, regionLoads.get(selected.regionId) + loadIncrease);

        distribution.set(task.id, {
          taskId: task.id,
          nodeId: selected.node.id,
          region: selected.regionId,
          strategy: 'balanced',
          score: selected.score
        });
      }
    }

    return distribution;
  }

  async complianceAwareDistribution(tasks, constraints) {
    const distribution = new Map();

    for (const task of tasks) {
      // Check compliance requirements
      const compliantRegions = this.getCompliantRegions(task, constraints);

      if (compliantRegions.length === 0) {
        throw new Error(`No compliant regions found for task ${task.id}`);
      }

      // Find optimal nodes in compliant regions
      const candidates = [];

      for (const regionId of compliantRegions) {
        const region = this.regionManager.regions.get(regionId);
        const regionNodes = region.nodes.filter(n => n.status === 'healthy');

        for (const node of regionNodes) {
          const score = this.calculateComplianceScore(node, task, regionId);
          candidates.push({ node, regionId, score });
        }
      }

      // Select best candidate
      candidates.sort((a, b) => b.score - a.score);

      if (candidates.length > 0) {
        const selected = candidates[0];

        distribution.set(task.id, {
          taskId: task.id,
          nodeId: selected.node.id,
          region: selected.regionId,
          strategy: 'compliance_aware',
          score: selected.score,
          compliant: true
        });
      }
    }

    return distribution;
  }

  determineTaskRegion(task, constraints) {
    // Check for explicit region preference
    if (task.region) {
      return task.region;
    }

    // Check for data locality requirements
    if (task.dataLocation) {
      return this.regionManager.getRegionForLocation(task.dataLocation);
    }

    // Check for user location preference
    if (task.userLocation) {
      return this.regionManager.getRegionForLocation(task.userLocation);
    }

    // Check constraints
    if (constraints.preferredRegion) {
      return constraints.preferredRegion;
    }

    // Default to best performing region
    return this.getBestRegionForTask(task);
  }

  getBestRegionForTask(task) {
    let bestRegion = 'default';
    let bestScore = -Infinity;

    for (const [regionId, region] of this.regionManager.regions) {
      const score = this.calculateRegionScore(region, task);
      if (score > bestScore) {
        bestScore = score;
        bestRegion = regionId;
      }
    }

    return bestRegion;
  }

  calculateRegionScore(region, task) {
    const health = region.metrics.healthScore;
    const loadFactor = Math.max(0, 1 - (region.metrics.totalLoad / this.calculateRegionCapacity(region.id)));
    const latencyFactor = Math.max(0, 1 - (region.metrics.avgLatency / this.config.distribution.maxLatencyThreshold));

    return health * 0.4 + loadFactor * 0.3 + latencyFactor * 0.3;
  }

  calculateRegionCapacity(regionId) {
    return this.regionManager.calculateRegionCapacity(regionId);
  }

  findOptimalNodesForTask(task, preferredRegion = null, optimizationGoal = 'latency') {
    const candidates = [];

    const regionsToCheck = preferredRegion ? [preferredRegion] : Array.from(this.regionManager.regions.keys());

    for (const regionId of regionsToCheck) {
      const region = this.regionManager.regions.get(regionId);
      const regionNodes = region.nodes.filter(n => n.status === 'healthy');

      for (const node of regionNodes) {
        if (this.isNodeSuitableForTask(node, task)) {
          const score = this.calculateNodeScore(node, task, optimizationGoal);
          candidates.push({ node, regionId, score });
        }
      }
    }

    // Sort by score (descending)
    candidates.sort((a, b) => b.score - a.score);

    return candidates.map(c => c.node);
  }

  isNodeSuitableForTask(node, task) {
    // Check capacity constraints
    if (node.utilization) {
      const availableCompute = (node.capacity?.compute || 100) - node.utilization.compute;
      const availableMemory = (node.capacity?.memory || 8192) - node.utilization.memory;

      if (availableCompute < (task.computeUnits || 1) ||
          availableMemory < (task.memory || 1024)) {
        return false;
      }
    }

    // Check task-specific requirements
    if (task.requirements) {
      if (task.requirements.gpu && !node.capabilities?.includes('gpu')) {
        return false;
      }
      if (task.requirements.ssd && !node.storage?.type === 'ssd') {
        return false;
      }
    }

    return true;
  }

  selectBestNode(nodes, task, optimizationGoal) {
    if (nodes.length === 0) return null;

    const scored = nodes.map(node => ({
      node,
      score: this.calculateNodeScore(node, task, optimizationGoal)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].node;
  }

  calculateNodeScore(node, task, optimizationGoal) {
    const regionId = this.regionManager.determineNodeRegion(node);
    const region = this.regionManager.regions.get(regionId);

    switch (optimizationGoal) {
      case 'latency':
        return this.calculateLatencyScore(node, task, region);
      case 'cost':
        return this.calculateCostScore(node, task, region);
      default:
        return this.calculateBalancedScore(node, task, regionId, new Map());
    }
  }

  calculateLatencyScore(node, task, region) {
    const nodeLatency = node.latency || 10;
    const regionLatency = region?.metrics.avgLatency || 50;
    const totalLatency = nodeLatency + regionLatency;

    // Lower latency = higher score
    return Math.max(0, 1 - (totalLatency / this.config.distribution.maxLatencyThreshold));
  }

  calculateCostScore(node, task, region) {
    const computeCost = (task.computeUnits || 1) * (node.cost?.compute || 0.01);
    const memoryCost = (task.memory || 1024) * (node.cost?.memory || 0.001) / 1024;
    const totalCost = computeCost + memoryCost;

    // Lower cost = higher score
    return Math.max(0, 1 - (totalCost / 10)); // Normalize to reasonable range
  }

  calculateBalancedScore(node, task, regionId, regionLoads) {
    const latencyScore = this.calculateLatencyScore(node, task, this.regionManager.regions.get(regionId));
    const costScore = this.calculateCostScore(node, task, this.regionManager.regions.get(regionId));
    const loadScore = Math.max(0, 1 - (regionLoads.get(regionId) / this.calculateRegionCapacity(regionId)));

    return (
      latencyScore * this.config.distribution.latencyWeight +
      costScore * this.config.distribution.costWeight +
      loadScore * this.config.distribution.loadWeight
    );
  }

  calculateComplianceScore(node, task, regionId) {
    const baseScore = this.calculateBalancedScore(node, task, regionId, new Map());

    // Add compliance bonus
    let complianceBonus = 0;

    // Data sovereignty compliance
    if (task.dataSovereignty && task.dataSovereignty === regionId) {
      complianceBonus += this.config.distribution.complianceWeight;
    }

    // Regional compliance
    if (task.complianceRegions && task.complianceRegions.includes(regionId)) {
      complianceBonus += this.config.distribution.complianceWeight * 0.5;
    }

    return baseScore + complianceBonus;
  }

  getCompliantRegions(task, constraints) {
    const compliantRegions = [];

    for (const [regionId, region] of this.regionManager.regions) {
      let isCompliant = true;

      // Check data sovereignty
      if (task.dataSovereignty && task.dataSovereignty !== regionId) {
        isCompliant = false;
      }

      // Check compliance regions
      if (task.complianceRegions && !task.complianceRegions.includes(regionId)) {
        isCompliant = false;
      }

      // Check constraints
      if (constraints.allowedRegions && !constraints.allowedRegions.includes(regionId)) {
        isCompliant = false;
      }

      if (constraints.forbiddenRegions && constraints.forbiddenRegions.includes(regionId)) {
        isCompliant = false;
      }

      if (isCompliant) {
        compliantRegions.push(regionId);
      }
    }

    return compliantRegions;
  }

  findFallbackNode(task) {
    // Find any available node as fallback
    for (const region of this.regionManager.regions.values()) {
      const availableNode = region.nodes.find(n => n.status === 'healthy');
      if (availableNode && this.isNodeSuitableForTask(availableNode, task)) {
        return availableNode;
      }
    }

    return null;
  }

  recordDistribution(tasks, distribution, strategy) {
    const timestamp = Date.now();
    const record = {
      timestamp,
      strategy,
      taskCount: tasks.length,
      regionDistribution: this.calculateRegionDistribution(distribution)
    };

    this.loadDistributionHistory.set(timestamp, record);

    // Keep only recent history
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    for (const [key] of this.loadDistributionHistory) {
      if (key < cutoffTime) {
        this.loadDistributionHistory.delete(key);
      }
    }
  }

  calculateRegionDistribution(distribution) {
    const regionCounts = new Map();

    for (const [, allocation] of distribution) {
      const count = regionCounts.get(allocation.region) || 0;
      regionCounts.set(allocation.region, count + 1);
    }

    return Object.fromEntries(regionCounts);
  }

  getDistributionMetrics() {
    const recentDistributions = Array.from(this.loadDistributionHistory.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);

    const strategyUsage = new Map();
    const regionUsage = new Map();

    for (const dist of recentDistributions) {
      const strategyCount = strategyUsage.get(dist.strategy) || 0;
      strategyUsage.set(dist.strategy, strategyCount + 1);

      for (const [region, count] of Object.entries(dist.regionDistribution)) {
        const regionCount = regionUsage.get(region) || 0;
        regionUsage.set(region, regionCount + count);
      }
    }

    return {
      totalDistributions: recentDistributions.length,
      strategyUsage: Object.fromEntries(strategyUsage),
      regionUsage: Object.fromEntries(regionUsage),
      averageTasksPerDistribution: recentDistributions.length > 0 ?
        recentDistributions.reduce((sum, d) => sum + d.taskCount, 0) / recentDistributions.length : 0
    };
  }
}

/**
 * Main Geo Load Distributor Class
 */
export class GeoLoadDistributor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = { ...GEO_CONFIG, ...options };
    this.redisClient = null;
    this.isInitialized = false;

    // Initialize components
    this.regionManager = new GeographicRegionManager(this.config);
    this.loadBalancer = new GeographicLoadBalancer(this.regionManager, this.config);

    // State tracking
    this.activeDistributions = new Map();
    this.monitoringInterval = null;
  }

  async initialize() {
    try {
      // Connect to Redis
      this.redisClient = await connectRedis(this.config.redis);

      // Load existing node data
      await this.loadNodeData();

      // Start monitoring
      this.startMonitoring();

      this.isInitialized = true;
      console.log('GeoLoadDistributor initialized successfully');

      this.emit('initialized', {
        regionsCount: this.regionManager.regions.size,
        nodesCount: this.getTotalNodeCount()
      });

    } catch (error) {
      console.error('Failed to initialize GeoLoadDistributor:', error);
      this.emit('initializationError', { error: error.message });
      throw error;
    }
  }

  async loadNodeData() {
    try {
      // Load nodes from Redis
      const nodeKeys = await this.redisClient.keys('nodes:*');

      for (const key of nodeKeys) {
        const nodeData = await this.redisClient.get(key);
        if (nodeData) {
          const node = JSON.parse(nodeData);
          this.regionManager.registerNode(node);
        }
      }

      console.log(`Loaded ${nodeKeys.length} nodes into regional distribution`);
    } catch (error) {
      console.warn('Failed to load node data:', error.message);
    }
  }

  async distributeTasksGeographically(tasks, constraints = {}) {
    if (!this.isInitialized) {
      throw new Error('GeoLoadDistributor must be initialized before distribution');
    }

    const distributionId = crypto.randomBytes(8).toString('hex');
    const startTime = Date.now();

    try {
      console.log(`Starting geographic distribution ${distributionId} for ${tasks.length} tasks`);

      // Validate tasks
      this.validateTasks(tasks);

      // Perform geographic distribution
      const distribution = await this.loadBalancer.distributeLoad(tasks, constraints);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Track distribution
      this.activeDistributions.set(distributionId, {
        tasks: tasks.length,
        distribution,
        constraints,
        startTime,
        endTime,
        duration,
        status: 'completed'
      });

      // Publish results
      await this.publishDistributionEvent({
        type: 'distribution_completed',
        distributionId,
        taskCount: tasks.length,
        distribution: Object.fromEntries(distribution),
        duration,
        metrics: this.calculateDistributionMetrics(distribution),
        timestamp: endTime
      });

      console.log(`Geographic distribution ${distributionId} completed in ${duration}ms`);

      this.emit('distributionCompleted', {
        distributionId,
        distribution: Object.fromEntries(distribution),
        metrics: this.calculateDistributionMetrics(distribution),
        duration
      });

      return {
        distributionId,
        distribution: Object.fromEntries(distribution),
        metrics: this.calculateDistributionMetrics(distribution),
        duration
      };

    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      this.activeDistributions.set(distributionId, {
        tasks: tasks.length,
        error: error.message,
        startTime,
        endTime,
        duration,
        status: 'failed'
      });

      console.error(`Geographic distribution ${distributionId} failed:`, error);

      await this.publishDistributionEvent({
        type: 'distribution_failed',
        distributionId,
        error: error.message,
        duration,
        timestamp: endTime
      });

      this.emit('distributionError', {
        distributionId,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  validateTasks(tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('Tasks must be a non-empty array');
    }

    for (const task of tasks) {
      if (!task.id) {
        throw new Error('Each task must have an id');
      }
    }
  }

  calculateDistributionMetrics(distribution) {
    const regionCounts = new Map();
    let totalScore = 0;
    let scoreCount = 0;

    for (const [, allocation] of distribution) {
      const count = regionCounts.get(allocation.region) || 0;
      regionCounts.set(allocation.region, count + 1);

      if (allocation.score) {
        totalScore += allocation.score;
        scoreCount++;
      }
    }

    return {
      regionDistribution: Object.fromEntries(regionCounts),
      averageScore: scoreCount > 0 ? totalScore / scoreCount : 0,
      regionsUsed: regionCounts.size,
      distributionEfficiency: this.calculateDistributionEfficiency(distribution)
    };
  }

  calculateDistributionEfficiency(distribution) {
    // Calculate how well the distribution aligns with geographic optimization goals
    let totalLatencyScore = 0;
    let totalLoadBalance = 0;
    const regionLoads = new Map();

    for (const [, allocation] of distribution) {
      // Latency score
      totalLatencyScore += allocation.score || 0;

      // Load balance calculation
      const load = regionLoads.get(allocation.region) || 0;
      regionLoads.set(allocation.region, load + 1);
    }

    // Calculate load balance score
    const loads = Array.from(regionLoads.values());
    const avgLoad = loads.reduce((sum, load) => sum + load, 0) / loads.length;
    const maxLoad = Math.max(...loads);
    const loadBalanceScore = avgLoad > 0 ? 1 - (maxLoad - avgLoad) / avgLoad : 1;

    // Combine scores
    const avgLatencyScore = totalLatencyScore / distribution.size;

    return (avgLatencyScore * 0.7 + loadBalanceScore * 0.3);
  }

  async registerNode(node) {
    const regionId = this.regionManager.registerNode(node);

    // Store in Redis
    await this.redisClient.setEx(
      `nodes:${node.id}`,
      86400, // 24 hours TTL
      JSON.stringify(node)
    );

    // Publish node registration
    await this.publishDistributionEvent({
      type: 'node_registered',
      nodeId: node.id,
      regionId,
      timestamp: Date.now()
    });

    this.emit('nodeRegistered', { nodeId: node.id, regionId });

    return regionId;
  }

  async updateNodeMetrics(nodeId, metrics) {
    try {
      const nodeData = await this.redisClient.get(`nodes:${nodeId}`);
      if (nodeData) {
        const node = JSON.parse(nodeData);
        node.metrics = { ...node.metrics, ...metrics };

        await this.redisClient.setEx(
          `nodes:${nodeId}`,
          86400,
          JSON.stringify(node)
        );

        // Update region metrics
        const regionId = this.regionManager.determineNodeRegion(node);
        this.regionManager.updateRegionMetrics(regionId, {
          totalLoad: metrics.load || 0,
          avgLatency: metrics.latency || 0
        });

        this.emit('nodeMetricsUpdated', { nodeId, metrics });
      }
    } catch (error) {
      console.error(`Failed to update metrics for node ${nodeId}:`, error);
    }
  }

  startMonitoring() {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectAndPublishMetrics();
      } catch (error) {
        console.error('Error during monitoring:', error);
      }
    }, this.config.monitoring.updateInterval);

    console.log('Geographic monitoring started');
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('Geographic monitoring stopped');
  }

  async collectAndPublishMetrics() {
    const metrics = {
      timestamp: Date.now(),
      regionalDistribution: this.regionManager.getRegionalDistribution(),
      distributionMetrics: this.loadBalancer.getDistributionMetrics(),
      activeDistributions: this.activeDistributions.size,
      healthyRegions: Array.from(this.regionManager.regions.entries())
        .filter(([, region]) => region.metrics.healthScore > this.config.monitoring.regionHealthThreshold)
        .map(([id]) => id)
    };

    // Store metrics in Redis
    await this.redisClient.setEx(
      `metrics:geo:${Date.now()}`,
      3600, // 1 hour TTL
      JSON.stringify(metrics)
    );

    this.emit('metricsCollected', metrics);
  }

  async publishDistributionEvent(event) {
    try {
      await this.redisClient.publish(
        'swarm:phase-4:geo-distribution',
        JSON.stringify(event)
      );
    } catch (error) {
      console.error('Failed to publish distribution event:', error);
    }
  }

  // Public API methods
  getRegionalStatus() {
    const status = {};

    for (const [regionId, region] of this.regionManager.regions) {
      status[regionId] = {
        nodeCount: region.nodes.length,
        healthScore: region.metrics.healthScore,
        totalLoad: region.metrics.totalLoad,
        avgLatency: region.metrics.avgLatency,
        capacity: this.regionManager.calculateRegionCapacity(regionId),
        location: region.location
      };
    }

    return status;
  }

  getActiveDistributions() {
    return Array.from(this.activeDistributions.entries()).map(([id, dist]) => ({
      id,
      ...dist
    }));
  }

  getTotalNodeCount() {
    return Array.from(this.regionManager.regions.values())
      .reduce((total, region) => total + region.nodes.length, 0);
  }

  async shutdown() {
    try {
      this.stopMonitoring();

      if (this.redisClient) {
        await this.redisClient.quit();
      }

      console.log('GeoLoadDistributor shutdown completed');
      this.emit('shutdown');

    } catch (error) {
      console.error('Error during shutdown:', error);
      this.emit('shutdownError', { error: error.message });
    }
  }
}

/**
 * Utility functions
 */
export function createGeoLoadDistributor(options = {}) {
  return new GeoLoadDistributor(options);
}

export default GeoLoadDistributor;