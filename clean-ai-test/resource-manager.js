#!/usr/bin/env node

/**
 * Enterprise Resource Manager
 * Handles resource allocation, monitoring, and optimization across departments
 * Supports 250-1000 concurrent agents with dynamic resource scaling
 */

import EventEmitter from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ResourceManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      maxConcurrentAgents: config.maxConcurrentAgents || 1000,
      resourceCheckInterval: config.resourceCheckInterval || 10000,
      rebalanceInterval: config.rebalanceInterval || 60000,
      allocationStrategy: config.allocationStrategy || 'priority-based', // 'priority-based', 'round-robin', 'load-balanced'
      autoScaling: config.autoScaling !== false,
      resourcePools: config.resourcePools || {},
      ...config
    };

    // Resource definitions
    this.resourceTypes = {
      'compute': {
        name: 'Compute Resources',
        unit: 'vCPU',
        totalCapacity: 2000, // 2000 vCPUs total
        costPerUnit: 0.05, // $0.05 per vCPU-hour
        scalable: true,
        priority: 1
      },
      'memory': {
        name: 'Memory Resources',
        unit: 'GB',
        totalCapacity: 8000, // 8TB total
        costPerUnit: 0.01, // $0.01 per GB-hour
        scalable: true,
        priority: 1
      },
      'storage': {
        name: 'Storage Resources',
        unit: 'GB',
        totalCapacity: 50000, // 50TB total
        costPerUnit: 0.001, // $0.001 per GB-hour
        scalable: true,
        priority: 2
      },
      'network': {
        name: 'Network Bandwidth',
        unit: 'Mbps',
        totalCapacity: 10000, // 10Gbps total
        costPerUnit: 0.001, // $0.001 per Mbps-hour
        scalable: false,
        priority: 1
      },
      'database': {
        name: 'Database Connections',
        unit: 'connections',
        totalCapacity: 500, // 500 concurrent connections
        costPerUnit: 0.1, // $0.1 per connection-hour
        scalable: true,
        priority: 2
      },
      'analytics': {
        name: 'Analytics Compute',
        unit: 'units',
        totalCapacity: 100, // 100 analytics units
        costPerUnit: 0.5, // $0.5 per unit-hour
        scalable: true,
        priority: 3
      },
      'secure-storage': {
        name: 'Secure Storage',
        unit: 'GB',
        totalCapacity: 5000, // 5TB encrypted storage
        costPerUnit: 0.005, // $0.005 per GB-hour
        scalable: true,
        priority: 3
      },
      'compliance-tools': {
        name: 'Compliance Tools',
        unit: 'licenses',
        totalCapacity: 50, // 50 compliance tool licenses
        costPerUnit: 1.0, // $1.0 per license-hour
        scalable: false,
        priority: 4
      },
      'crm-access': {
        name: 'CRM System Access',
        unit: 'licenses',
        totalCapacity: 200, // 200 CRM licenses
        costPerUnit: 0.8, // $0.8 per license-hour
        scalable: false,
        priority: 2
      },
      'communication': {
        name: 'Communication Tools',
        unit: 'licenses',
        totalCapacity: 1000, // 1000 communication tool licenses
        costPerUnit: 0.2, // $0.2 per license-hour
        scalable: true,
        priority: 2
      }
    };

    // Department resource pools
    this.departmentPools = new Map(); // departmentId -> pool config
    this.agentAllocations = new Map(); // agentId -> allocation details
    this.resourceUsage = new Map(); // resourceType -> usage tracking

    // Initialize resource usage tracking
    this.initializeResourceTracking();

    // Resource allocation strategies
    this.allocationStrategies = {
      'priority-based': this.priorityBasedAllocation.bind(this),
      'round-robin': this.roundRobinAllocation.bind(this),
      'load-balanced': this.loadBalancedAllocation.bind(this)
    };

    this.state = 'initializing';
    this.startTime = Date.now();
    this.metrics = {
      totalAllocations: 0,
      activeAllocations: 0,
      utilizationRate: 0,
      resourceConflicts: 0,
      autoScalingEvents: 0,
      rebalancingEvents: 0,
      totalCost: 0
    };
  }

  initializeResourceTracking() {
    for (const [resourceType, config] of Object.entries(this.resourceTypes)) {
      this.resourceUsage.set(resourceType, {
        allocated: 0,
        available: config.totalCapacity,
        utilization: 0,
        allocations: new Map(), // allocationId -> details
        history: [],
        alerts: []
      });
    }
  }

  async initialize() {
    console.log('📊 Initializing Enterprise Resource Manager...');

    try {
      // Setup default resource pools for common enterprise departments
      await this.setupDefaultResourcePools();

      // Start resource monitoring
      this.startResourceMonitoring();

      // Start auto-rebalancing if enabled
      if (this.config.autoScaling) {
        this.startAutoRebalancing();
      }

      this.state = 'active';
      console.log('✅ Enterprise Resource Manager initialized and active');

      this.emit('initialized', {
        timestamp: Date.now(),
        totalResources: Object.keys(this.resourceTypes).length,
        totalCapacity: this.getTotalCapacity()
      });

    } catch (error) {
      console.error('❌ Failed to initialize Resource Manager:', error);
      this.state = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  async setupDefaultResourcePools() {
    const defaultPools = {
      'engineering': {
        priority: 1,
        guaranteedResources: {
          'compute': 400,
          'memory': 1600,
          'storage': 5000,
          'network': 2000
        },
        maxResources: {
          'compute': 800,
          'memory': 3200,
          'storage': 15000,
          'network': 3000,
          'database': 100
        },
        scalingEnabled: true
      },
      'marketing': {
        priority: 2,
        guaranteedResources: {
          'compute': 200,
          'memory': 800,
          'storage': 3000,
          'network': 1000,
          'analytics': 30
        },
        maxResources: {
          'compute': 400,
          'memory': 1600,
          'storage': 8000,
          'network': 2000,
          'analytics': 50,
          'communication': 200
        },
        scalingEnabled: true
      },
      'sales': {
        priority: 1,
        guaranteedResources: {
          'compute': 150,
          'memory': 600,
          'storage': 2000,
          'network': 1500,
          'crm-access': 50,
          'communication': 150
        },
        maxResources: {
          'compute': 300,
          'memory': 1200,
          'storage': 5000,
          'network': 2500,
          'crm-access': 100,
          'communication': 300
        },
        scalingEnabled: false
      },
      'finance': {
        priority: 3,
        guaranteedResources: {
          'compute': 100,
          'memory': 400,
          'storage': 2000,
          'database': 50,
          'secure-storage': 1000,
          'compliance-tools': 10
        },
        maxResources: {
          'compute': 200,
          'memory': 800,
          'storage': 4000,
          'database': 100,
          'secure-storage': 2000,
          'compliance-tools': 20
        },
        scalingEnabled: false
      },
      'hr': {
        priority: 3,
        guaranteedResources: {
          'compute': 50,
          'memory': 200,
          'storage': 1000,
          'database': 20,
          'communication': 50
        },
        maxResources: {
          'compute': 100,
          'memory': 400,
          'storage': 2000,
          'database': 40,
          'communication': 100
        },
        scalingEnabled: false
      },
      'operations': {
        priority: 1,
        guaranteedResources: {
          'compute': 250,
          'memory': 1000,
          'storage': 4000,
          'network': 1500
        },
        maxResources: {
          'compute': 500,
          'memory': 2000,
          'storage': 10000,
          'network': 2500,
          'database': 50
        },
        scalingEnabled: true
      },
      'research': {
        priority: 2,
        guaranteedResources: {
          'compute': 300,
          'memory': 1200,
          'storage': 3000,
          'analytics': 20
        },
        maxResources: {
          'compute': 600,
          'memory': 2400,
          'storage': 8000,
          'analytics': 40,
          'database': 30
        },
        scalingEnabled: true
      },
      'legal': {
        priority: 3,
        guaranteedResources: {
          'compute': 50,
          'memory': 200,
          'storage': 1000,
          'secure-storage': 1000,
          'compliance-tools': 15
        },
        maxResources: {
          'compute': 100,
          'memory': 400,
          'storage': 2000,
          'secure-storage': 2000,
          'compliance-tools': 25
        },
        scalingEnabled: false
      },
      'it': {
        priority: 1,
        guaranteedResources: {
          'compute': 200,
          'memory': 800,
          'storage': 3000,
          'network': 1000,
          'database': 50
        },
        maxResources: {
          'compute': 400,
          'memory': 1600,
          'storage': 6000,
          'network': 2000,
          'database': 100
        },
        scalingEnabled: true
      },
      'analytics': {
        priority: 2,
        guaranteedResources: {
          'compute': 200,
          'memory': 800,
          'storage': 2000,
          'analytics': 25,
          'database': 30
        },
        maxResources: {
          'compute': 400,
          'memory': 1600,
          'storage': 5000,
          'analytics': 50,
          'database': 60
        },
        scalingEnabled: true
      }
    };

    // Merge with custom pools from config
    const pools = { ...defaultPools, ...this.config.resourcePools };

    for (const [departmentId, poolConfig] of Object.entries(pools)) {
      await this.createDepartmentPool(departmentId, poolConfig);
    }

    console.log(`✅ Created ${Object.keys(pools).length} department resource pools`);
  }

  async createDepartmentPool(departmentId, config) {
    const pool = {
      id: departmentId,
      priority: config.priority || 2,
      guaranteedResources: config.guaranteedResources || {},
      maxResources: config.maxResources || {},
      currentAllocations: new Map(), // agentId -> allocation
      scalingEnabled: config.scalingEnabled !== false,
      createdAt: Date.now(),
      lastRebalance: Date.now(),
      metrics: {
        totalAllocations: 0,
        activeAllocations: 0,
        utilizationRate: 0,
        conflicts: 0,
        scalingEvents: 0
      }
    };

    this.departmentPools.set(departmentId, pool);
    console.log(`🏊 Created resource pool for department: ${departmentId}`);
  }

  async checkResourceAvailability(departmentId, requiredResources) {
    const pool = this.departmentPools.get(departmentId);
    if (!pool) {
      throw new Error(`Department pool not found: ${departmentId}`);
    }

    const availability = {
      available: true,
      missingResources: [],
      required: {},
      allocated: {},
      poolUtilization: {}
    };

    // Check each required resource
    for (const [resourceType, amount] of Object.entries(requiredResources)) {
      const resourceConfig = this.resourceTypes[resourceType];
      if (!resourceConfig) {
        availability.missingResources.push(`Unknown resource type: ${resourceType}`);
        availability.available = false;
        continue;
      }

      const usage = this.resourceUsage.get(resourceType);
      const poolMax = pool.maxResources[resourceType] || 0;
      const currentPoolUsage = this.getCurrentPoolUsage(departmentId, resourceType);
      const availableInPool = Math.max(0, poolMax - currentPoolUsage);
      const globallyAvailable = usage.available;

      const canAllocate = Math.min(availableInPool, globallyAvailable, amount);

      availability.required[resourceType] = amount;
      availability.allocated[resourceType] = canAllocate;
      availability.poolUtilization[resourceType] = currentPoolUsage / poolMax;

      if (canAllocate < amount) {
        availability.missingResources.push(`${resourceType}: need ${amount}, available ${canAllocate}`);
        availability.available = false;
      }
    }

    return availability;
  }

  getCurrentPoolUsage(departmentId, resourceType) {
    const pool = this.departmentPools.get(departmentId);
    if (!pool) return 0;

    let totalUsage = 0;
    for (const allocation of pool.currentAllocations.values()) {
      totalUsage += allocation.resources[resourceType] || 0;
    }

    return totalUsage;
  }

  async allocateResources(agentId, departmentId, resources) {
    const pool = this.departmentPools.get(departmentId);
    if (!pool) {
      throw new Error(`Department pool not found: ${departmentId}`);
    }

    const allocationId = `alloc-${agentId}-${Date.now()}`;
    const allocation = {
      id: allocationId,
      agentId,
      departmentId,
      resources: {},
      allocatedAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours default
      status: 'active',
      cost: 0
    };

    // Allocate each resource
    for (const [resourceType, amount] of Object.entries(resources)) {
      const usage = this.resourceUsage.get(resourceType);
      const resourceConfig = this.resourceTypes[resourceType];

      if (!usage || !resourceConfig) {
        throw new Error(`Invalid resource type: ${resourceType}`);
      }

      if (usage.available < amount) {
        throw new Error(`Insufficient ${resourceType}: need ${amount}, available ${usage.available}`);
      }

      // Update usage tracking
      usage.allocated += amount;
      usage.available -= amount;
      usage.utilization = usage.allocated / resourceConfig.totalCapacity;

      // Track allocation details
      usage.allocations.set(allocationId, {
        agentId,
        departmentId,
        amount,
        allocatedAt: Date.now()
      });

      // Add to allocation
      allocation.resources[resourceType] = amount;

      // Calculate cost
      allocation.cost += amount * resourceConfig.costPerUnit;
    }

    // Add allocation to pool
    pool.currentAllocations.set(allocationId, allocation);
    pool.metrics.totalAllocations++;
    pool.metrics.activeAllocations++;

    // Add to agent allocations
    this.agentAllocations.set(agentId, allocation);

    // Update metrics
    this.metrics.totalAllocations++;
    this.metrics.activeAllocations++;
    this.metrics.totalCost += allocation.cost;

    console.log(`📋 Allocated resources to agent ${agentId}:`, allocation.resources);
    this.emit('resources_allocated', { allocationId, agentId, departmentId, allocation });

    return {
      allocationId,
      allocated: allocation.resources,
      cost: allocation.cost,
      expiresAt: allocation.expiresAt
    };
  }

  async releaseResources(agentId) {
    const allocation = this.agentAllocations.get(agentId);
    if (!allocation) {
      console.log(`⚠️ No allocation found for agent ${agentId}`);
      return null;
    }

    const pool = this.departmentPools.get(allocation.departmentId);
    if (!pool) {
      console.log(`⚠️ Department pool not found: ${allocation.departmentId}`);
      return null;
    }

    // Release each resource
    for (const [resourceType, amount] of Object.entries(allocation.resources)) {
      const usage = this.resourceUsage.get(resourceType);
      if (usage) {
        usage.allocated -= amount;
        usage.available += amount;
        usage.utilization = usage.allocated / this.resourceTypes[resourceType].totalCapacity;

        // Remove allocation tracking
        usage.allocations.delete(allocation.id);
      }
    }

    // Remove from pool
    pool.currentAllocations.delete(allocation.id);
    pool.metrics.activeAllocations--;

    // Remove from agent allocations
    this.agentAllocations.delete(agentId);

    // Update metrics
    this.metrics.activeAllocations--;

    console.log(`🔓 Released resources from agent ${agentId}:`, allocation.resources);
    this.emit('resources_released', { allocationId: allocation.id, agentId, resources: allocation.resources });

    return allocation;
  }

  async reallocateResources(agentId, newResources) {
    // Release current allocation
    const oldAllocation = await this.releaseResources(agentId);
    if (!oldAllocation) {
      throw new Error(`No existing allocation found for agent ${agentId}`);
    }

    // Allocate new resources
    const newAllocation = await this.allocateResources(
      agentId,
      oldAllocation.departmentId,
      newResources
    );

    console.log(`🔄 Reallocated resources for agent ${agentId}`);
    this.emit('resources_reallocated', {
      agentId,
      oldAllocation: oldAllocation.resources,
      newAllocation: newAllocation.allocated
    });

    return newAllocation;
  }

  getTotalCapacity() {
    let totalCapacity = 0;
    for (const resourceType of Object.keys(this.resourceTypes)) {
      const config = this.resourceTypes[resourceType];
      totalCapacity += config.totalCapacity;
    }
    return totalCapacity;
  }

  getUsedCapacity() {
    let usedCapacity = 0;
    for (const resourceType of Object.keys(this.resourceTypes)) {
      const usage = this.resourceUsage.get(resourceType);
      usedCapacity += usage.allocated;
    }
    return usedCapacity;
  }

  getDepartmentResources(departmentId) {
    const pool = this.departmentPools.get(departmentId);
    if (!pool) {
      throw new Error(`Department pool not found: ${departmentId}`);
    }

    const resources = {};
    for (const resourceType of Object.keys(this.resourceTypes)) {
      const currentUsage = this.getCurrentPoolUsage(departmentId, resourceType);
      const maxResource = pool.maxResources[resourceType] || 0;
      const guaranteed = pool.guaranteedResources[resourceType] || 0;

      resources[resourceType] = {
        allocated: currentUsage,
        maxCapacity: maxResource,
        guaranteed,
        available: Math.max(0, maxResource - currentUsage),
        utilization: maxResource > 0 ? currentUsage / maxResource : 0
      };
    }

    return {
      departmentId,
      priority: pool.priority,
      resources,
      metrics: pool.metrics,
      scalingEnabled: pool.scalingEnabled
    };
  }

  getDepartmentPool(departmentId) {
    return this.getDepartmentResources(departmentId);
  }

  startResourceMonitoring() {
    setInterval(() => {
      this.updateResourceMetrics();
      this.checkResourceAlerts();
    }, this.config.resourceCheckInterval);
  }

  startAutoRebalancing() {
    setInterval(() => {
      this.performResourceRebalancing();
    }, this.config.rebalanceInterval);
  }

  updateResourceMetrics() {
    // Update overall utilization
    const totalCapacity = this.getTotalCapacity();
    const usedCapacity = this.getUsedCapacity();
    this.metrics.utilizationRate = usedCapacity / totalCapacity;

    // Update department pool metrics
    for (const [departmentId, pool] of this.departmentPools) {
      let totalAllocated = 0;
      let totalCapacity = 0;

      for (const [resourceType, amount] of Object.entries(pool.maxResources)) {
        const currentUsage = this.getCurrentPoolUsage(departmentId, resourceType);
        totalAllocated += currentUsage;
        totalCapacity += amount;
      }

      pool.metrics.utilizationRate = totalCapacity > 0 ? totalAllocated / totalCapacity : 0;
    }

    // Update individual resource utilization
    for (const [resourceType, usage] of this.resourceUsage) {
      const config = this.resourceTypes[resourceType];
      usage.utilization = usage.allocated / config.totalCapacity;

      // Store utilization history
      usage.history.push({
        timestamp: Date.now(),
        allocated: usage.allocated,
        utilization: usage.utilization
      });

      // Keep only last 100 entries
      if (usage.history.length > 100) {
        usage.history = usage.history.slice(-100);
      }
    }

    this.emit('metrics_updated', {
      timestamp: Date.now(),
      utilizationRate: this.metrics.utilizationRate,
      totalAllocations: this.metrics.activeAllocations
    });
  }

  checkResourceAlerts() {
    for (const [resourceType, usage] of this.resourceUsage) {
      const config = this.resourceTypes[resourceType];
      const utilization = usage.utilization;

      // High utilization alert (>90%)
      if (utilization > 0.9) {
        const alert = {
          type: 'high_utilization',
          resourceType,
          utilization,
          message: `High utilization for ${config.name}: ${(utilization * 100).toFixed(1)}%`,
          timestamp: Date.now()
        };

        usage.alerts.push(alert);
        this.emit('resource_alert', alert);
      }

      // Resource exhaustion alert (>95%)
      if (utilization > 0.95) {
        const alert = {
          type: 'resource_exhaustion',
          resourceType,
          utilization,
          message: `Resource exhaustion imminent for ${config.name}: ${(utilization * 100).toFixed(1)}%`,
          timestamp: Date.now()
        };

        usage.alerts.push(alert);
        this.emit('resource_alert', alert);
      }
    }

    // Clean up old alerts (keep only last 50)
    for (const usage of this.resourceUsage.values()) {
      if (usage.alerts.length > 50) {
        usage.alerts = usage.alerts.slice(-50);
      }
    }
  }

  performResourceRebalancing() {
    console.log('⚖️ Performing resource rebalancing...');

    let rebalancingActions = 0;

    // Find departments with high utilization
    const highUtilizationDepts = [];
    const lowUtilizationDepts = [];

    for (const [departmentId, pool] of this.departmentPools) {
      if (pool.metrics.utilizationRate > 0.8) {
        highUtilizationDepts.push({ departmentId, pool, utilization: pool.metrics.utilizationRate });
      } else if (pool.metrics.utilizationRate < 0.3) {
        lowUtilizationDepts.push({ departmentId, pool, utilization: pool.metrics.utilizationRate });
      }
    }

    // Try to balance resources
    for (const highDept of highUtilizationDepts) {
      for (const lowDept of lowUtilizationDepts) {
        if (highDept.pool.priority <= lowDept.pool.priority) {
          // Try to move resources from low to high priority department
          const moved = this.attemptResourceMove(highDept.departmentId, lowDept.departmentId);
          if (moved > 0) {
            rebalancingActions++;
          }
        }
      }
    }

    this.metrics.rebalancingEvents++;

    console.log(`✅ Resource rebalancing completed: ${rebalancingActions} actions taken`);
    this.emit('rebalancing_completed', {
      timestamp: Date.now(),
      actions: rebalancingActions,
      highUtilizationDepts: highUtilizationDepts.length,
      lowUtilizationDepts: lowUtilizationDepts.length
    });
  }

  attemptResourceMove(fromDeptId, toDeptId) {
    const fromPool = this.departmentPools.get(fromDeptId);
    const toPool = this.departmentPools.get(toDeptId);

    if (!fromPool || !toPool) return 0;

    let movedResources = 0;

    // Try to move different resource types
    for (const resourceType of Object.keys(this.resourceTypes)) {
      const fromMax = fromPool.maxResources[resourceType] || 0;
      const toMax = toPool.maxResources[resourceType] || 0;

      if (fromMax > 0 && toMax > 0) {
        const fromUsage = this.getCurrentPoolUsage(fromDeptId, resourceType);
        const toUsage = this.getCurrentPoolUsage(toDeptId, resourceType);

        const fromUtilization = fromUsage / fromMax;
        const toUtilization = toUsage / toMax;

        // Move if from dept has high utilization and to dept has low utilization
        if (fromUtilization > 0.8 && toUtilization < 0.3) {
          const transferAmount = Math.min(
            Math.floor(fromMax * 0.1), // Transfer up to 10% of from's max
            Math.floor(toMax * 0.2),   // Or 20% of to's max
            fromUsage - Math.floor(fromMax * 0.7) // What from can spare
          );

          if (transferAmount > 0) {
            // Update pool allocations
            fromPool.maxResources[resourceType] -= transferAmount;
            toPool.maxResources[resourceType] += transferAmount;

            movedResources += transferAmount;
            console.log(`🔄 Moved ${transferAmount} ${resourceType} from ${fromDeptId} to ${toDeptId}`);
          }
        }
      }
    }

    return movedResources;
  }

  // Resource allocation strategies
  async priorityBasedAllocation(departmentId, requiredResources) {
    const pool = this.departmentPools.get(departmentId);
    if (!pool) return null;

    // Priority-based: higher priority departments get resources first
    const competingDepts = Array.from(this.departmentPools.values())
      .filter(p => p.priority <= pool.priority)
      .sort((a, b) => a.priority - b.priority);

    for (const dept of competingDepts) {
      if (dept.id === departmentId) {
        return this.checkResourceAvailability(departmentId, requiredResources);
      }
    }

    return null;
  }

  async roundRobinAllocation(departmentId, requiredResources) {
    // Simple round-robin based on last allocation time
    const sortedDepts = Array.from(this.departmentPools.values())
      .sort((a, b) => (a.lastRebalance || 0) - (b.lastRebalance || 0));

    for (const dept of sortedDepts) {
      if (dept.id === departmentId) {
        dept.lastRebalance = Date.now();
        return this.checkResourceAvailability(departmentId, requiredResources);
      }
    }

    return null;
  }

  async loadBalancedAllocation(departmentId, requiredResources) {
    // Load-balanced: allocate to department with lowest utilization
    const sortedDepts = Array.from(this.departmentPools.values())
      .sort((a, b) => a.metrics.utilizationRate - b.metrics.utilizationRate);

    for (const dept of sortedDepts) {
      if (dept.id === departmentId) {
        return this.checkResourceAvailability(departmentId, requiredResources);
      }
    }

    return null;
  }

  getStatus() {
    return {
      state: this.state,
      uptime: Date.now() - this.startTime,
      metrics: this.metrics,
      resourceTypes: Object.keys(this.resourceTypes).length,
      departmentPools: this.departmentPools.size,
      agentAllocations: this.agentAllocations.size,
      utilizationRate: this.metrics.utilizationRate,
      totalCapacity: this.getTotalCapacity(),
      usedCapacity: this.getUsedCapacity()
    };
  }

  async shutdown() {
    console.log('🔄 Shutting down Resource Manager...');

    this.state = 'shutting_down';

    // Release all allocations
    const agentIds = Array.from(this.agentAllocations.keys());
    for (const agentId of agentIds) {
      await this.releaseResources(agentId);
    }

    // Clear intervals
    if (this.monitoringInterval) clearInterval(this.monitoringInterval);
    if (this.rebalancingInterval) clearInterval(this.rebalancingInterval);

    this.state = 'shutdown';
    console.log('✅ Resource Manager shutdown complete');

    this.emit('shutdown');
  }
}

export { ResourceManager };

// CLI interface for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const resourceManager = new ResourceManager({
    maxConcurrentAgents: 500,
    resourceCheckInterval: 5000,
    autoScaling: true
  });

  resourceManager.initialize().then(() => {
    console.log('📊 Resource Manager running in test mode...');

    // Simulate resource allocation
    setTimeout(async () => {
      const availability = await resourceManager.checkResourceAvailability('engineering', {
        'compute': 4,
        'memory': 16,
        'storage': 100
      });

      console.log('🔍 Resource availability check:', availability);

      if (availability.available) {
        const allocation = await resourceManager.allocateResources(
          'test-agent-1',
          'engineering',
          availability.allocated
        );
        console.log('✅ Test allocation completed:', allocation);

        // Release after 10 seconds
        setTimeout(() => {
          resourceManager.releaseResources('test-agent-1');
          console.log('🔓 Test resources released');
        }, 10000);
      }
    }, 2000);

    // Shutdown after 30 seconds
    setTimeout(() => {
      resourceManager.shutdown();
      process.exit(0);
    }, 30000);

  }).catch(error => {
    console.error('Failed to start Resource Manager:', error);
    process.exit(1);
  });
}