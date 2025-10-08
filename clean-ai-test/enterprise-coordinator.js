#!/usr/bin/env node

/**
 * Enterprise Coordinator - Department-Level Coordination System
 * Supports 10-20 departments with 50+ agents each
 * Enterprise-grade security, resource allocation, and high-performance coordination
 */

import EventEmitter from 'events';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import enterprise components
const { EnterpriseAuth } = await import('./auth-service.js');
const { ResourceManager } = await import('./resource-manager.js');
const { CoordinationBus } = await import('./coordination-bus.js');

class EnterpriseCoordinator extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      maxDepartments: config.maxDepartments || 20,
      maxAgentsPerDepartment: config.maxAgentsPerDepartment || 50,
      maxConcurrentAgents: config.maxConcurrentAgents || 1000,
      heartbeatInterval: config.heartbeatInterval || 5000,
      resourceCheckInterval: config.resourceCheckInterval || 10000,
      ...config
    };

    // Enterprise departments with specialized roles
    this.departments = {
      'engineering': {
        id: 'engineering',
        name: 'Engineering Department',
        maxAgents: 100,
        currentLoad: 0,
        priority: 1,
        specializations: ['software-development', 'architecture', 'testing', 'devops'],
        resources: ['compute-intensive', 'storage', 'network']
      },
      'marketing': {
        id: 'marketing',
        name: 'Marketing Department',
        maxAgents: 60,
        currentLoad: 0,
        priority: 2,
        specializations: ['content-creation', 'analytics', 'campaign-management', 'design'],
        resources: ['analytics', 'media-storage', 'network']
      },
      'sales': {
        id: 'sales',
        name: 'Sales Department',
        maxAgents: 80,
        currentLoad: 0,
        priority: 1,
        specializations: ['customer-relations', 'lead-generation', 'contract-negotiation', 'support'],
        resources: ['crm-access', 'communication', 'network']
      },
      'finance': {
        id: 'finance',
        name: 'Finance Department',
        maxAgents: 40,
        currentLoad: 0,
        priority: 3,
        specializations: ['accounting', 'financial-analysis', 'budgeting', 'compliance'],
        resources: ['secure-storage', 'database', 'compliance-tools']
      },
      'hr': {
        id: 'hr',
        name: 'Human Resources',
        maxAgents: 30,
        currentLoad: 0,
        priority: 3,
        specializations: ['recruitment', 'employee-relations', 'training', 'benefits'],
        resources: ['database', 'document-storage', 'communication']
      },
      'operations': {
        id: 'operations',
        name: 'Operations Department',
        maxAgents: 70,
        currentLoad: 0,
        priority: 1,
        specializations: ['logistics', 'supply-chain', 'quality-control', 'process-optimization'],
        resources: ['workflow-engines', 'analytics', 'network']
      },
      'research': {
        id: 'research',
        name: 'Research & Development',
        maxAgents: 50,
        currentLoad: 0,
        priority: 2,
        specializations: ['data-analysis', 'experimentation', 'innovation', 'prototyping'],
        resources: ['compute-intensive', 'large-storage', 'specialized-tools']
      },
      'legal': {
        id: 'legal',
        name: 'Legal Department',
        maxAgents: 25,
        currentLoad: 0,
        priority: 3,
        specializations: ['contract-review', 'compliance', 'ip-management', 'risk-assessment'],
        resources: ['secure-storage', 'document-management', 'compliance-tools']
      },
      'it': {
        id: 'it',
        name: 'IT Department',
        maxAgents: 60,
        currentLoad: 0,
        priority: 1,
        specializations: ['infrastructure', 'security', 'support', 'system-administration'],
        resources: ['infrastructure-access', 'monitoring', 'security-tools']
      },
      'analytics': {
        id: 'analytics',
        name: 'Analytics Department',
        maxAgents: 45,
        currentLoad: 0,
        priority: 2,
        specializations: ['data-science', 'business-intelligence', 'reporting', 'forecasting'],
        resources: ['compute-intensive', 'data-warehouse', 'analytics-tools']
      }
    };

    this.agents = new Map(); // agentId -> agent info
    this.tasks = new Map(); // taskId -> task info
    this.resources = new Map(); // resourceId -> resource allocation

    this.state = 'initializing';
    this.startTime = Date.now();
    this.metrics = {
      totalAgents: 0,
      activeTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      resourceUtilization: 0,
      averageResponseTime: 0
    };

    // Initialize enterprise components
    this.authService = new EnterpriseAuth();
    this.resourceManager = new ResourceManager(this.config);
    this.coordinationBus = new CoordinationBus(this.config);

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.coordinationBus.on('task_assigned', (data) => this.handleTaskAssignment(data));
    this.coordinationBus.on('task_completed', (data) => this.handleTaskCompletion(data));
    this.coordinationBus.on('resource_request', (data) => this.handleResourceRequest(data));
    this.coordinationBus.on('agent_heartbeat', (data) => this.handleAgentHeartbeat(data));
    this.coordinationBus.on('department_alert', (data) => this.handleDepartmentAlert(data));
  }

  async initialize() {
    console.log('🏢 Initializing Enterprise Coordinator...');

    try {
      // Initialize authentication service
      await this.authService.initialize();
      console.log('✅ Authentication service initialized');

      // Initialize resource manager
      await this.resourceManager.initialize();
      console.log('✅ Resource manager initialized');

      // Initialize coordination bus
      await this.coordinationBus.initialize();
      console.log('✅ Coordination bus initialized');

      // Setup department resource pools
      await this.setupDepartmentResources();
      console.log('✅ Department resources configured');

      // Start monitoring
      this.startMonitoring();
      console.log('✅ Monitoring systems started');

      this.state = 'active';
      console.log(`🚀 Enterprise Coordinator active - ${Object.keys(this.departments).length} departments ready`);

      this.emit('initialized', { timestamp: Date.now() });

    } catch (error) {
      console.error('❌ Failed to initialize Enterprise Coordinator:', error);
      this.state = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  async setupDepartmentResources() {
    for (const [deptId, dept] of Object.entries(this.departments)) {
      await this.resourceManager.createDepartmentPool(deptId, {
        maxAgents: dept.maxAgents,
        priority: dept.priority,
        resources: dept.resources,
        specializations: dept.specializations
      });
    }
  }

  async registerDepartmentCoordinator(departmentId, credentials, capabilities = {}) {
    try {
      // Authenticate department coordinator
      const authResult = await this.authService.authenticateDepartmentCoordinator(
        departmentId,
        credentials
      );

      if (!authResult.success) {
        throw new Error(`Authentication failed for department ${departmentId}: ${authResult.error}`);
      }

      const department = this.departments[departmentId];
      if (!department) {
        throw new Error(`Unknown department: ${departmentId}`);
      }

      const coordinator = {
        id: `${departmentId}-coordinator`,
        departmentId,
        authenticated: true,
        permissions: authResult.permissions,
        capabilities: {
          maxAgents: capabilities.maxAgents || department.maxAgents,
          specializations: capabilities.specializations || department.specializations,
          priorityLevel: capabilities.priorityLevel || department.priority,
          ...capabilities
        },
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
        status: 'active'
      };

      this.departments[departmentId].coordinator = coordinator;

      console.log(`👔 Department coordinator registered: ${departmentId}`);
      this.emit('department_coordinator_registered', { departmentId, coordinator });

      return {
        success: true,
        coordinatorId: coordinator.id,
        permissions: coordinator.permissions,
        resourcePool: await this.resourceManager.getDepartmentPool(departmentId)
      };

    } catch (error) {
      console.error(`❌ Failed to register department coordinator for ${departmentId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async allocateAgentToDepartment(departmentId, agentSpec) {
    try {
      const department = this.departments[departmentId];
      if (!department) {
        throw new Error(`Unknown department: ${departmentId}`);
      }

      // Check department capacity
      if (department.currentLoad >= department.maxAgents) {
        throw new Error(`Department ${departmentId} at capacity (${department.currentLoad}/${department.maxAgents})`);
      }

      // Check authentication if required
      if (department.coordinator) {
        const hasPermission = await this.authService.checkAgentAllocationPermission(
          department.coordinator.id,
          agentSpec
        );
        if (!hasPermission) {
          throw new Error(`Insufficient permissions to allocate agent to ${departmentId}`);
        }
      }

      // Generate agent ID
      const agentId = `agent-${departmentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Check resource availability
      const resourceCheck = await this.resourceManager.checkResourceAvailability(
        departmentId,
        agentSpec.resources || []
      );

      if (!resourceCheck.available) {
        throw new Error(`Insufficient resources: ${resourceCheck.missingResources.join(', ')}`);
      }

      // Allocate resources
      await this.resourceManager.allocateResources(agentId, departmentId, resourceCheck.required);

      // Create agent record
      const agent = {
        id: agentId,
        departmentId,
        type: agentSpec.type || 'general',
        specialization: agentSpec.specialization || 'general',
        status: 'initializing',
        capabilities: agentSpec.capabilities || {},
        resources: resourceCheck.allocated,
        createdAt: Date.now(),
        lastHeartbeat: Date.now(),
        tasksCompleted: 0,
        currentTask: null,
        performance: {
          averageTaskTime: 0,
          successRate: 1.0,
          resourceEfficiency: 1.0
        }
      };

      this.agents.set(agentId, agent);
      department.currentLoad++;

      // Notify coordination bus
      await this.coordinationBus.broadcast('agent_allocated', {
        agentId,
        departmentId,
        agent: agent
      });

      console.log(`🤖 Agent allocated: ${agentId} to ${departmentId}`);
      this.emit('agent_allocated', { agentId, departmentId, agent });

      return {
        success: true,
        agentId,
        agent,
        resources: resourceCheck.allocated
      };

    } catch (error) {
      console.error(`❌ Failed to allocate agent to ${departmentId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async assignTask(taskSpec) {
    try {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const task = {
        id: taskId,
        title: taskSpec.title,
        description: taskSpec.description,
        department: taskSpec.department,
        priority: taskSpec.priority || 'medium',
        type: taskSpec.type || 'general',
        requirements: taskSpec.requirements || {},
        estimatedDuration: taskSpec.estimatedDuration || 3600000, // 1 hour default
        maxRetries: taskSpec.maxRetries || 3,
        createdAt: Date.now(),
        status: 'pending',
        assignedAgent: null,
        progress: 0,
        resources: taskSpec.resources || [],
        dependencies: taskSpec.dependencies || []
      };

      this.tasks.set(taskId, task);
      this.metrics.activeTasks++;

      // Find suitable agent
      const suitableAgent = await this.findSuitableAgent(task);

      if (suitableAgent) {
        await this.assignTaskToAgent(taskId, suitableAgent.id);
      } else {
        // Queue task for later assignment
        await this.coordinationBus.broadcast('task_queued', {
          taskId,
          task,
          reason: 'No suitable agent available'
        });
      }

      console.log(`📋 Task created: ${taskId} - ${taskSpec.title}`);
      this.emit('task_created', { taskId, task });

      return {
        success: true,
        taskId,
        task,
        assignedAgent: suitableAgent?.id || null
      };

    } catch (error) {
      console.error('❌ Failed to create task:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async findSuitableAgent(task) {
    const availableAgents = Array.from(this.agents.values()).filter(agent =>
      agent.status === 'idle' &&
      agent.departmentId === task.department &&
      this.canAgentHandleTask(agent, task)
    );

    if (availableAgents.length === 0) {
      return null;
    }

    // Sort by performance metrics
    availableAgents.sort((a, b) => {
      const scoreA = a.performance.successRate * (1 / a.performance.averageTaskTime);
      const scoreB = b.performance.successRate * (1 / b.performance.averageTaskTime);
      return scoreB - scoreA;
    });

    return availableAgents[0];
  }

  canAgentHandleTask(agent, task) {
    // Check specialization match
    if (task.requirements.specialization &&
        agent.specialization !== task.requirements.specialization) {
      return false;
    }

    // Check capabilities
    if (task.requirements.capabilities) {
      for (const capability of task.requirements.capabilities) {
        if (!agent.capabilities[capability]) {
          return false;
        }
      }
    }

    // Check resource availability
    for (const resource of task.resources) {
      if (!agent.resources.includes(resource)) {
        return false;
      }
    }

    return true;
  }

  async assignTaskToAgent(taskId, agentId) {
    const task = this.tasks.get(taskId);
    const agent = this.agents.get(agentId);

    if (!task || !agent) {
      throw new Error('Task or agent not found');
    }

    task.assignedAgent = agentId;
    task.status = 'assigned';
    task.assignedAt = Date.now();

    agent.currentTask = taskId;
    agent.status = 'busy';

    await this.coordinationBus.sendToAgent(agentId, 'task_assigned', {
      taskId,
      task,
      deadline: Date.now() + task.estimatedDuration
    });

    console.log(`🎯 Task ${taskId} assigned to agent ${agentId}`);
    this.emit('task_assigned', { taskId, agentId });
  }

  handleTaskCompletion(data) {
    const { taskId, agentId, result, success, duration } = data;

    const task = this.tasks.get(taskId);
    const agent = this.agents.get(agentId);

    if (task && agent) {
      task.status = success ? 'completed' : 'failed';
      task.completedAt = Date.now();
      task.result = result;

      agent.currentTask = null;
      agent.status = 'idle';
      agent.tasksCompleted++;

      // Update performance metrics
      agent.performance.averageTaskTime =
        (agent.performance.averageTaskTime * (agent.tasksCompleted - 1) + duration) / agent.tasksCompleted;

      agent.performance.successRate =
        (agent.performance.successRate * (agent.tasksCompleted - 1) + (success ? 1 : 0)) / agent.tasksCompleted;

      this.metrics.activeTasks--;
      if (success) {
        this.metrics.completedTasks++;
      } else {
        this.metrics.failedTasks++;
      }

      console.log(`✅ Task ${taskId} ${success ? 'completed' : 'failed'} by agent ${agentId}`);
      this.emit('task_completed', { taskId, agentId, success, duration });
    }
  }

  handleAgentHeartbeat(data) {
    const { agentId, status, metrics } = data;
    const agent = this.agents.get(agentId);

    if (agent) {
      agent.lastHeartbeat = Date.now();
      agent.status = status || agent.status;

      if (metrics) {
        agent.performance = { ...agent.performance, ...metrics };
      }
    }
  }

  handleDepartmentAlert(data) {
    const { departmentId, alertType, message, severity } = data;

    console.log(`🚨 Department Alert [${severity.toUpperCase()}] ${departmentId}: ${message}`);

    // Handle different alert types
    switch (alertType) {
      case 'resource_shortage':
        this.handleResourceShortage(departmentId, data.details);
        break;
      case 'capacity_reached':
        this.handleCapacityReached(departmentId, data.details);
        break;
      case 'performance_degradation':
        this.handlePerformanceDegradation(departmentId, data.details);
        break;
    }

    this.emit('department_alert', data);
  }

  handleResourceShortage(departmentId, details) {
    console.log(`📊 Resource shortage in ${departmentId}: ${details.missingResources.join(', ')}`);
    // Trigger resource reallocation or scaling
  }

  handleCapacityReached(departmentId, details) {
    console.log(`📈 Capacity reached in ${departmentId}: ${details.currentLoad}/${details.maxCapacity}`);
    // Trigger load balancing or agent scaling
  }

  handlePerformanceDegradation(departmentId, details) {
    console.log(`⚡ Performance degradation in ${departmentId}: ${details.metrics}`);
    // Trigger performance optimization
  }

  startMonitoring() {
    // Heartbeat monitoring
    setInterval(() => {
      this.checkAgentHealth();
    }, this.config.heartbeatInterval);

    // Resource monitoring
    setInterval(() => {
      this.updateResourceMetrics();
    }, this.config.resourceCheckInterval);

    // Performance monitoring
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 30000);
  }

  checkAgentHealth() {
    const now = Date.now();
    const deadAgents = [];

    for (const [agentId, agent] of this.agents) {
      if (now - agent.lastHeartbeat > this.config.heartbeatInterval * 3) {
        deadAgents.push(agentId);
      }
    }

    for (const agentId of deadAgents) {
      this.handleDeadAgent(agentId);
    }
  }

  handleDeadAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      console.log(`💀 Dead agent detected: ${agentId}`);

      // Reassign current task if any
      if (agent.currentTask) {
        const task = this.tasks.get(agent.currentTask);
        if (task) {
          task.status = 'pending';
          task.assignedAgent = null;

          // Try to reassign to another agent
          const newAgent = this.findSuitableAgent(task);
          if (newAgent) {
            this.assignTaskToAgent(task.id, newAgent.id);
          }
        }
      }

      // Remove agent
      this.agents.delete(agentId);
      this.departments[agent.departmentId].currentLoad--;

      // Release resources
      this.resourceManager.releaseResources(agentId);

      this.emit('agent_died', { agentId });
    }
  }

  updateResourceMetrics() {
    const totalResources = this.resourceManager.getTotalCapacity();
    const usedResources = this.resourceManager.getUsedCapacity();

    this.metrics.resourceUtilization = usedResources / totalResources;
  }

  updatePerformanceMetrics() {
    const now = Date.now();
    const activeAgents = Array.from(this.agents.values()).filter(a => a.status !== 'dead');

    if (activeAgents.length > 0) {
      const avgResponseTime = activeAgents.reduce((sum, agent) =>
        sum + agent.performance.averageTaskTime, 0) / activeAgents.length;

      this.metrics.averageResponseTime = avgResponseTime;
    }
  }

  async getDepartmentStatus(departmentId) {
    const department = this.departments[departmentId];
    if (!department) {
      throw new Error(`Unknown department: ${departmentId}`);
    }

    const departmentAgents = Array.from(this.agents.values())
      .filter(agent => agent.departmentId === departmentId);

    const departmentTasks = Array.from(this.tasks.values())
      .filter(task => task.department === departmentId);

    return {
      department: departmentId,
      name: department.name,
      currentLoad: department.currentLoad,
      maxCapacity: department.maxAgents,
      utilization: department.currentLoad / department.maxAgents,
      agents: {
        total: departmentAgents.length,
        active: departmentAgents.filter(a => a.status === 'busy').length,
        idle: departmentAgents.filter(a => a.status === 'idle').length
      },
      tasks: {
        total: departmentTasks.length,
        pending: departmentTasks.filter(t => t.status === 'pending').length,
        active: departmentTasks.filter(t => t.status === 'assigned').length,
        completed: departmentTasks.filter(t => t.status === 'completed').length,
        failed: departmentTasks.filter(t => t.status === 'failed').length
      },
      resources: await this.resourceManager.getDepartmentResources(departmentId)
    };
  }

  async getSystemStatus() {
    const departmentStatuses = {};

    for (const deptId of Object.keys(this.departments)) {
      try {
        departmentStatuses[deptId] = await this.getDepartmentStatus(deptId);
      } catch (error) {
        departmentStatuses[deptId] = { error: error.message };
      }
    }

    return {
      state: this.state,
      uptime: Date.now() - this.startTime,
      metrics: this.metrics,
      departments: departmentStatuses,
      totalAgents: this.agents.size,
      activeTasks: this.metrics.activeTasks,
      coordinationBus: this.coordinationBus.getStatus(),
      resourceManager: this.resourceManager.getStatus()
    };
  }

  async shutdown() {
    console.log('🔄 Shutting down Enterprise Coordinator...');

    this.state = 'shutting_down';

    // Stop monitoring
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.resourceInterval) clearInterval(this.resourceInterval);
    if (this.performanceInterval) clearInterval(this.performanceInterval);

    // Shutdown components
    await this.coordinationBus.shutdown();
    await this.resourceManager.shutdown();
    await this.authService.shutdown();

    this.state = 'shutdown';
    console.log('✅ Enterprise Coordinator shutdown complete');

    this.emit('shutdown');
  }
}

export { EnterpriseCoordinator };

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const coordinator = new EnterpriseCoordinator();

  coordinator.initialize().then(() => {
    console.log('🏢 Enterprise Coordinator running...');
    console.log('Press Ctrl+C to shutdown');

    process.on('SIGINT', async () => {
      await coordinator.shutdown();
      process.exit(0);
    });
  }).catch(error => {
    console.error('Failed to start Enterprise Coordinator:', error);
    process.exit(1);
  });
}