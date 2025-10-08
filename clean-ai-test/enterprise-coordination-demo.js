#!/usr/bin/env node

/**
 * Enterprise Coordination System Demo
 * Demonstrates the complete enterprise coordination system with multiple departments,
 * agents, resource allocation, and high-performance coordination
 */

import { EnterpriseCoordinator } from './enterprise-coordinator.js';
import { EnterpriseAgent } from './enterprise-agent.js';

class EnterpriseCoordinationDemo {
  constructor() {
    this.coordinator = null;
    this.agents = new Map();
    this.departments = ['engineering', 'marketing', 'sales', 'finance', 'hr', 'operations', 'research', 'legal', 'it', 'analytics'];
    this.demoTasks = [
      {
        title: 'Develop New API Endpoint',
        department: 'engineering',
        type: 'development',
        priority: 'high',
        requirements: {
          specialization: 'backend-development',
          language: 'JavaScript',
          framework: 'Express'
        },
        estimatedDuration: 1800000 // 30 minutes
      },
      {
        title: 'Create Marketing Campaign',
        department: 'marketing',
        type: 'creative',
        priority: 'medium',
        requirements: {
          specialization: 'content-creation',
          tools: ['design-software', 'analytics']
        },
        estimatedDuration: 2400000 // 40 minutes
      },
      {
        title: 'Customer Data Analysis',
        department: 'analytics',
        type: 'analysis',
        priority: 'high',
        requirements: {
          specialization: 'data-science',
          tools: ['python', 'analytics-platform']
        },
        estimatedDuration: 3600000 // 1 hour
      },
      {
        title: 'Financial Report Generation',
        department: 'finance',
        type: 'analysis',
        priority: 'high',
        requirements: {
          specialization: 'financial-analysis',
          compliance: 'strict'
        },
        estimatedDuration: 2700000 // 45 minutes
      },
      {
        title: 'System Security Audit',
        department: 'it',
        type: 'coordination',
        priority: 'critical',
        requirements: {
          specialization: 'security',
          tools: ['security-scanner', 'compliance-checker']
        },
        estimatedDuration: 5400000 // 1.5 hours
      }
    ];
  }

  async runDemo() {
    console.log('🏢 Starting Enterprise Coordination System Demo\n');

    try {
      // Initialize enterprise coordinator
      await this.initializeCoordinator();

      // Wait for coordinator to be ready
      await this.sleep(2000);

      // Register department coordinators
      await this.registerDepartmentCoordinators();

      // Wait for registration
      await this.sleep(1000);

      // Create and register agents
      await this.createAgents();

      // Wait for agents to be ready
      await this.sleep(2000);

      // Demonstrate task assignment and execution
      await this.demonstrateTaskExecution();

      // Wait for tasks to complete
      await this.sleep(10000);

      // Show system status
      await this.showSystemStatus();

      // Demonstrate scaling and load balancing
      await this.demonstrateScaling();

      // Wait for scaling demo
      await this.sleep(5000);

      // Final status report
      await this.showFinalReport();

      // Shutdown
      await this.shutdown();

    } catch (error) {
      console.error('❌ Demo failed:', error);
      await this.shutdown();
      process.exit(1);
    }
  }

  async initializeCoordinator() {
    console.log('🚀 Initializing Enterprise Coordinator...');

    this.coordinator = new EnterpriseCoordinator({
      maxDepartments: 10,
      maxAgentsPerDepartment: 50,
      maxConcurrentAgents: 500,
      heartbeatInterval: 3000,
      resourceCheckInterval: 5000
    });

    await this.coordinator.initialize();
    console.log('✅ Enterprise Coordinator initialized\n');
  }

  async registerDepartmentCoordinators() {
    console.log('👔 Registering Department Coordinators...');

    const coordinatorCredentials = {
      'engineering': 'EngCoord123!@#',
      'marketing': 'MktCoord123!@#',
      'sales': 'SalesCoord123!@#',
      'finance': 'FinanceCoord123!@#',
      'hr': 'HrCoord123!@#',
      'operations': 'OpsCoord123!@#',
      'research': 'ResearchCoord123!@#',
      'legal': 'LegalCoord123!@#',
      'it': 'ItCoord123!@#',
      'analytics': 'AnalyticsCoord123!@#'
    };

    for (const [departmentId, password] of Object.entries(coordinatorCredentials)) {
      const result = await this.coordinator.registerDepartmentCoordinator(
        departmentId,
        { password },
        {
          maxAgents: this.getDepartmentMaxAgents(departmentId),
          specializations: this.getDepartmentSpecializations(departmentId)
        }
      );

      if (result.success) {
        console.log(`✅ ${departmentId.toUpperCase()} Coordinator registered`);
      } else {
        console.log(`❌ Failed to register ${departmentId} coordinator: ${result.error}`);
      }
    }

    console.log('');
  }

  async createAgents() {
    console.log('🤖 Creating and Registering Agents...');

    const agentConfigs = [
      // Engineering agents
      { department: 'engineering', type: 'development', specialization: 'full-stack', count: 8 },
      { department: 'engineering', type: 'development', specialization: 'backend', count: 6 },
      { department: 'engineering', type: 'development', specialization: 'frontend', count: 4 },
      { department: 'engineering', type: 'testing', specialization: 'qa', count: 5 },
      { department: 'engineering', type: 'devops', specialization: 'infrastructure', count: 3 },

      // Marketing agents
      { department: 'marketing', type: 'creative', specialization: 'content-creation', count: 6 },
      { department: 'marketing', type: 'analytical', specialization: 'campaign-analysis', count: 4 },
      { department: 'marketing', type: 'strategic', specialization: 'brand-management', count: 3 },

      // Sales agents
      { department: 'sales', type: 'customer-relations', specialization: 'client-management', count: 8 },
      { department: 'sales', type: 'lead-generation', specialization: 'prospecting', count: 5 },
      { department: 'sales', type: 'support', specialization: 'customer-service', count: 4 },

      // Finance agents
      { department: 'finance', type: 'analytical', specialization: 'financial-analysis', count: 4 },
      { department: 'finance', type: 'compliance', specialization: 'regulatory', count: 3 },

      // HR agents
      { department: 'hr', type: 'administrative', specialization: 'employee-relations', count: 3 },
      { department: 'hr', type: 'recruitment', specialization: 'talent-acquisition', count: 2 },

      // Operations agents
      { department: 'operations', type: 'logistics', specialization: 'supply-chain', count: 5 },
      { department: 'operations', type: 'process', specialization: 'optimization', count: 4 },

      // Research agents
      { department: 'research', type: 'experimental', specialization: 'data-science', count: 4 },
      { department: 'research', type: 'analytical', specialization: 'research-analysis', count: 3 },

      // Legal agents
      { department: 'legal', type: 'compliance', specialization: 'contract-review', count: 2 },
      { department: 'legal', type: 'advisory', specialization: 'legal-consulting', count: 2 },

      // IT agents
      { department: 'it', type: 'infrastructure', specialization: 'system-administration', count: 4 },
      { department: 'it', type: 'security', specialization: 'cybersecurity', count: 3 },
      { department: 'it', type: 'support', specialization: 'technical-support', count: 4 },

      // Analytics agents
      { department: 'analytics', type: 'data-science', specialization: 'machine-learning', count: 4 },
      { department: 'analytics', type: 'business-intelligence', specialization: 'reporting', count: 3 }
    ];

    let totalAgents = 0;
    for (const config of agentConfigs) {
      for (let i = 0; i < config.count; i++) {
        await this.createAgent(config.department, config.type, config.specialization);
        totalAgents++;
      }
    }

    console.log(`✅ Created ${totalAgents} agents across ${this.departments.length} departments\n`);
  }

  async createAgent(departmentId, type, specialization) {
    const agent = new EnterpriseAgent({
      departmentId,
      type,
      specialization,
      credentials: {
        departmentId,
        type,
        token: `agent-token-${departmentId}-${type}-${Date.now()}`
      }
    });

    // Register agent with coordinator
    const allocationResult = await this.coordinator.allocateAgentToDepartment(departmentId, {
      type,
      specialization,
      capabilities: this.getAgentCapabilities(type, specialization),
      resources: this.getAgentResources(departmentId, type)
    });

    if (allocationResult.success) {
      // Initialize agent with coordination bus
      await agent.initialize(this.coordinator.coordinationBus);
      this.agents.set(allocationResult.agentId, agent);
    }
  }

  async demonstrateTaskExecution() {
    console.log('📋 Demonstrating Task Assignment and Execution...');

    // Assign tasks to different departments
    for (let i = 0; i < this.demoTasks.length; i++) {
      const task = this.demoTasks[i];
      console.log(`\n🎯 Assigning task: ${task.title}`);

      const result = await this.coordinator.assignTask({
        title: task.title,
        description: `Demonstration task for ${task.department} department`,
        department: task.department,
        type: task.type,
        priority: task.priority,
        requirements: task.requirements,
        estimatedDuration: task.estimatedDuration,
        resources: this.getTaskResources(task)
      });

      if (result.success) {
        console.log(`✅ Task assigned to agent: ${result.assignedAgent || 'queued'}`);
      } else {
        console.log(`❌ Task assignment failed: ${result.error}`);
      }

      // Small delay between assignments
      await this.sleep(1000);
    }

    console.log('\n⏳ Waiting for task execution...');
  }

  async demonstrateScaling() {
    console.log('\n📈 Demonstrating System Scaling...');

    // Add more agents to simulate scaling
    const scalingAgents = [
      { department: 'engineering', type: 'development', specialization: 'full-stack', count: 10 },
      { department: 'marketing', type: 'creative', specialization: 'content-creation', count: 8 },
      { department: 'analytics', type: 'data-science', specialization: 'machine-learning', count: 6 }
    ];

    let scalingCount = 0;
    for (const config of scalingAgents) {
      for (let i = 0; i < config.count; i++) {
        await this.createAgent(config.department, config.type, config.specialization);
        scalingCount++;
      }
    }

    console.log(`✅ Added ${scalingCount} additional agents for scaling test`);

    // Assign more tasks to test load balancing
    for (let i = 0; i < 5; i++) {
      const task = {
        title: `Scaling Test Task ${i + 1}`,
        description: `Load balancing test task ${i + 1}`,
        department: this.departments[i % this.departments.length],
        type: 'development',
        priority: 'medium',
        requirements: {
          specialization: 'general'
        },
        estimatedDuration: 600000 // 10 minutes
      };

      const result = await this.coordinator.assignTask(task);
      if (result.success) {
        console.log(`✅ Scaling task ${i + 1} assigned`);
      }
    }
  }

  async showSystemStatus() {
    console.log('\n📊 System Status Report:');

    const status = await this.coordinator.getSystemStatus();

    console.log(`📈 Total Agents: ${status.totalAgents}`);
    console.log(`🏢 Active Departments: ${Object.keys(status.departments).length}`);
    console.log(`📋 Active Tasks: ${status.activeTasks}`);
    console.log(`✅ Completed Tasks: ${status.metrics.completedTasks}`);
    console.log(`❌ Failed Tasks: ${status.metrics.failedTasks}`);
    console.log(`📊 Resource Utilization: ${(status.metrics.resourceUtilization * 100).toFixed(1)}%`);
    console.log(`⚡ Average Response Time: ${status.metrics.averageResponseTime.toFixed(0)}ms`);
    console.log(`🕐 Uptime: ${(status.uptime / 1000).toFixed(1)}s`);

    // Department-wise status
    console.log('\n🏢 Department Status:');
    for (const [deptId, deptStatus] of Object.entries(status.departments)) {
      if (!deptStatus.error) {
        console.log(`  ${deptId.toUpperCase()}: ${deptStatus.agents.total} agents, ${deptStatus.tasks.active} active tasks, ${(deptStatus.utilization * 100).toFixed(1)}% utilization`);
      }
    }

    // Coordination bus status
    console.log('\n🚀 Coordination Bus Status:');
    console.log(`  Connections: ${status.coordinationBus.metrics.activeConnections}`);
    console.log(`  Messages/sec: ${status.coordinationBus.metrics.messagesPerSecond.toFixed(1)}`);
    console.log(`  Average latency: ${status.coordinationBus.metrics.averageLatency.toFixed(1)}ms`);

    // Resource manager status
    console.log('\n📊 Resource Manager Status:');
    console.log(`  Total allocations: ${status.resourceManager.metrics.totalAllocations}`);
    console.log(`  Active allocations: ${status.resourceManager.metrics.activeAllocations}`);
    console.log(`  Utilization rate: ${(status.resourceManager.metrics.utilizationRate * 100).toFixed(1)}%`);
  }

  async showFinalReport() {
    console.log('\n🎯 Final Demo Report:');

    const status = await this.coordinator.getSystemStatus();
    const totalTasks = status.metrics.completedTasks + status.metrics.failedTasks + status.activeTasks;
    const successRate = totalTasks > 0 ? (status.metrics.completedTasks / totalTasks * 100) : 0;

    console.log(`✅ Total Tasks Processed: ${totalTasks}`);
    console.log(`🎯 Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`📊 Peak Resource Utilization: ${(status.metrics.resourceUtilization * 100).toFixed(1)}%`);
    console.log(`🤖 Agents Coordinated: ${status.totalAgents}`);
    console.log(`🏢 Departments Managed: ${Object.keys(status.departments).length}`);
    console.log(`📨 Messages Processed: ${status.coordinationBus.metrics.totalMessages}`);
    console.log(`⚡ Average Performance: ${status.metrics.averageResponseTime.toFixed(0)}ms response time`);

    console.log('\n🏆 Enterprise Coordination System Demo Completed Successfully!');
    console.log('🎯 Demonstrated:');
    console.log('  ✓ Department-level coordination');
    console.log('  ✓ Multi-agent task execution');
    console.log('  ✓ Resource allocation and management');
    console.log('  ✓ Authentication and authorization');
    console.log('  ✓ High-performance message routing');
    console.log('  ✓ Load balancing and scaling');
    console.log('  ✓ Real-time monitoring and metrics');
  }

  // Helper methods
  getDepartmentMaxAgents(departmentId) {
    const maxAgents = {
      'engineering': 50,
      'marketing': 30,
      'sales': 40,
      'finance': 20,
      'hr': 15,
      'operations': 35,
      'research': 25,
      'legal': 12,
      'it': 30,
      'analytics': 22
    };
    return maxAgents[departmentId] || 20;
  }

  getDepartmentSpecializations(departmentId) {
    const specializations = {
      'engineering': ['full-stack', 'backend', 'frontend', 'devops', 'testing'],
      'marketing': ['content-creation', 'campaign-management', 'analytics', 'brand-management'],
      'sales': ['customer-relations', 'lead-generation', 'negotiation', 'support'],
      'finance': ['financial-analysis', 'budgeting', 'compliance', 'reporting'],
      'hr': ['recruitment', 'employee-relations', 'training', 'benefits'],
      'operations': ['logistics', 'process-optimization', 'quality-control', 'supply-chain'],
      'research': ['data-science', 'experimental', 'innovation', 'prototyping'],
      'legal': ['contract-review', 'compliance', 'risk-management', 'legal-research'],
      'it': ['system-administration', 'security', 'infrastructure', 'support'],
      'analytics': ['data-science', 'business-intelligence', 'machine-learning', 'reporting']
    };
    return specializations[departmentId] || ['general'];
  }

  getAgentCapabilities(type, specialization) {
    const capabilities = {
      'development': {
        'code-analysis': true,
        'system-design': true,
        'testing': true,
        'deployment': true
      },
      'creative': {
        'content-creation': true,
        'design': true,
        'brand-management': true
      },
      'analytical': {
        'data-analysis': true,
        'reporting': true,
        'forecasting': true
      },
      'administrative': {
        'coordination': true,
        'communication': true,
        'documentation': true
      }
    };

    return capabilities[type] || {};
  }

  getAgentResources(departmentId, type) {
    const resources = {
      'engineering': ['compute', 'memory', 'storage', 'network'],
      'marketing': ['compute', 'storage', 'analytics', 'communication'],
      'sales': ['network', 'crm-access', 'communication'],
      'finance': ['database', 'secure-storage', 'compliance-tools'],
      'hr': ['database', 'document-storage', 'communication'],
      'operations': ['compute', 'network', 'workflow-engines'],
      'research': ['compute', 'storage', 'analytics-tools'],
      'legal': ['secure-storage', 'document-management'],
      'it': ['infrastructure-access', 'monitoring', 'security-tools'],
      'analytics': ['compute', 'data-warehouse', 'analytics-tools']
    };

    return resources[departmentId] || ['compute', 'memory'];
  }

  getTaskResources(task) {
    const resourceMap = {
      'development': ['compute', 'memory', 'storage'],
      'creative': ['compute', 'storage', 'communication'],
      'analysis': ['compute', 'database', 'analytics'],
      'coordination': ['network', 'communication'],
      'compliance': ['secure-storage', 'compliance-tools']
    };

    return resourceMap[task.type] || ['compute'];
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async shutdown() {
    console.log('\n🔄 Shutting down Enterprise Coordination System...');

    // Shutdown all agents
    for (const [agentId, agent] of this.agents) {
      await agent.shutdown();
    }

    // Shutdown coordinator
    if (this.coordinator) {
      await this.coordinator.shutdown();
    }

    console.log('✅ Enterprise Coordination System shutdown complete');
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = new EnterpriseCoordinationDemo();

  demo.runDemo().catch(error => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
}