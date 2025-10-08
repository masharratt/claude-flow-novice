#!/usr/bin/env node

/**
 * Enterprise Agent - Specialized Department Agent
 * Works under departments with specialized capabilities and enterprise-grade features
 */

import EventEmitter from 'events';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnterpriseAgent extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      heartbeatInterval: config.heartbeatInterval || 5000,
      taskTimeout: config.taskTimeout || 3600000, // 1 hour
      maxRetries: config.maxRetries || 3,
      performanceMetricsInterval: config.performanceMetricsInterval || 30000,
      ...config
    };

    // Agent identity and classification
    this.id = config.id || `enterprise-agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.departmentId = config.departmentId || 'engineering';
    this.type = config.type || 'general';
    this.specialization = config.specialization || 'general';
    this.role = config.role || 'agent';

    // Enterprise authentication
    this.credentials = config.credentials || {};
    this.token = null;
    this.authenticated = false;

    // Agent capabilities and resources
    this.capabilities = {
      // Core capabilities
      taskProcessing: true,
      communication: true,
      collaboration: true,
      learning: true,

      // Specialized capabilities based on type
      ...this.getSpecializedCapabilities(),

      // Custom capabilities
      ...config.capabilities
    };

    this.resources = config.resources || [];
    this.performanceMetrics = {
      tasksCompleted: 0,
      averageTaskTime: 0,
      successRate: 1.0,
      resourceEfficiency: 1.0,
      collaborationScore: 1.0,
      innovationScore: 0,
      qualityScore: 1.0
    };

    // Agent state
    this.status = 'initializing';
    this.currentTask = null;
    this.taskHistory = [];
    this.collaborationNetwork = new Set();
    this.learnedSkills = new Set();

    // Communication and coordination
    this.coordinationBus = null;
    this.messageQueue = [];
    this.collaborationRequests = new Map();

    // Performance tracking
    this.startTime = Date.now();
    this.lastHeartbeat = Date.now();
    this.performanceHistory = [];

    // Department-specific configurations
    this.departmentConfig = this.getDepartmentConfiguration();

    this.setupEventHandlers();
  }

  getSpecializedCapabilities() {
    const capabilityMap = {
      'engineering': {
        codeAnalysis: true,
        systemDesign: true,
        debugging: true,
        testing: true,
        deployment: true,
        architecture: true
      },
      'marketing': {
        contentCreation: true,
        campaignManagement: true,
        analytics: true,
        customerSegmentation: true,
        brandManagement: true,
        socialMedia: true
      },
      'sales': {
        customerRelationships: true,
        leadGeneration: true,
        negotiation: true,
        productKnowledge: true,
        communication: true,
        closing: true
      },
      'finance': {
        financialAnalysis: true,
        budgeting: true,
        forecasting: true,
        compliance: true,
        riskAssessment: true,
        reporting: true
      },
      'hr': {
        recruitment: true,
        employeeRelations: true,
        training: true,
        performanceManagement: true,
        benefits: true,
        compliance: true
      },
      'operations': {
        processOptimization: true,
        logistics: true,
        qualityControl: true,
        supplyChain: true,
        workflowManagement: true,
        efficiency: true
      },
      'research': {
        dataAnalysis: true,
        experimentation: true,
        innovation: true,
        prototyping: true,
        research: true,
        discovery: true
      },
      'legal': {
        contractReview: true,
        compliance: true,
        riskManagement: true,
        legalResearch: true,
        documentation: true,
        advising: true
      },
      'it': {
        systemAdministration: true,
        security: true,
        infrastructure: true,
        troubleshooting: true,
        networking: true,
        monitoring: true
      },
      'analytics': {
        dataScience: true,
        businessIntelligence: true,
        reporting: true,
        forecasting: true,
        visualization: true,
        statistics: true
      }
    };

    return capabilityMap[this.departmentId] || {};
  }

  getDepartmentConfiguration() {
    const configs = {
      'engineering': {
        workingHours: 'flexible',
        collaborationStyle: 'technical',
        communicationProtocol: 'structured',
        qualityStandards: 'high',
        innovationRequirement: 'high'
      },
      'marketing': {
        workingHours: 'business',
        collaborationStyle: 'creative',
        communicationProtocol: 'visual',
        qualityStandards: 'medium',
        innovationRequirement: 'high'
      },
      'sales': {
        workingHours: 'business',
        collaborationStyle: 'competitive',
        communicationProtocol: 'persuasive',
        qualityStandards: 'medium',
        innovationRequirement: 'medium'
      },
      'finance': {
        workingHours: 'business',
        collaborationStyle: 'analytical',
        communicationProtocol: 'formal',
        qualityStandards: 'very-high',
        innovationRequirement: 'low'
      },
      'hr': {
        workingHours: 'business',
        collaborationStyle: 'empathetic',
        communicationProtocol: 'supportive',
        qualityStandards: 'high',
        innovationRequirement: 'medium'
      },
      'operations': {
        workingHours: 'continuous',
        collaborationStyle: 'process-oriented',
        communicationProtocol: 'efficient',
        qualityStandards: 'high',
        innovationRequirement: 'medium'
      },
      'research': {
        workingHours: 'flexible',
        collaborationStyle: 'academic',
        communicationProtocol: 'detailed',
        qualityStandards: 'very-high',
        innovationRequirement: 'very-high'
      },
      'legal': {
        workingHours: 'business',
        collaborationStyle: 'cautious',
        communicationProtocol: 'precise',
        qualityStandards: 'very-high',
        innovationRequirement: 'low'
      },
      'it': {
        workingHours: 'on-call',
        collaborationStyle: 'technical',
        communicationProtocol: 'efficient',
        qualityStandards: 'high',
        innovationRequirement: 'medium'
      },
      'analytics': {
        workingHours: 'flexible',
        collaborationStyle: 'data-driven',
        communicationProtocol: 'visual',
        qualityStandards: 'high',
        innovationRequirement: 'medium'
      }
    };

    return configs[this.departmentId] || configs['engineering'];
  }

  setupEventHandlers() {
    this.on('task_assigned', this.handleTaskAssignment.bind(this));
    this.on('collaboration_request', this.handleCollaborationRequest.bind(this));
    this.on('resource_update', this.handleResourceUpdate.bind(this));
    this.on('skill_update', this.handleSkillUpdate.bind(this));
  }

  async initialize(coordinationBus) {
    console.log(`🤖 Initializing Enterprise Agent ${this.id} (${this.departmentId})...`);

    try {
      this.coordinationBus = coordinationBus;

      // Authenticate with enterprise system
      await this.authenticate();

      // Register with coordination bus
      await this.registerWithCoordinationBus();

      // Start periodic tasks
      this.startPeriodicTasks();

      this.status = 'idle';
      console.log(`✅ Enterprise Agent ${this.id} initialized and ready`);

      this.emit('initialized', {
        agentId: this.id,
        departmentId: this.departmentId,
        specialization: this.specialization,
        capabilities: this.capabilities
      });

      return true;

    } catch (error) {
      console.error(`❌ Failed to initialize Enterprise Agent ${this.id}:`, error);
      this.status = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  async authenticate() {
    try {
      const authData = {
        agentId: this.id,
        departmentId: this.departmentId,
        credentials: this.credentials,
        timestamp: Date.now(),
        capabilities: this.capabilities
      };

      // In a real implementation, this would connect to auth-service
      // For now, simulate successful authentication
      this.token = this.generateToken(authData);
      this.authenticated = true;

      console.log(`🔐 Agent ${this.id} authenticated successfully`);
      return true;

    } catch (error) {
      console.error(`❌ Authentication failed for agent ${this.id}:`, error);
      throw error;
    }
  }

  generateToken(data) {
    const payload = {
      ...data,
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  async registerWithCoordinationBus() {
    await this.coordinationBus.registerAgent(this.id, {
      departmentId: this.departmentId,
      type: this.type,
      specialization: this.specialization,
      capabilities: this.capabilities,
      resources: this.resources,
      status: this.status,
      token: this.token
    });

    console.log(`📡 Agent ${this.id} registered with coordination bus`);
  }

  startPeriodicTasks() {
    // Heartbeat
    setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);

    // Performance metrics
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, this.config.performanceMetricsInterval);

    // Task timeout check
    setInterval(() => {
      this.checkTaskTimeout();
    }, 60000);
  }

  sendHeartbeat() {
    const heartbeatData = {
      agentId: this.id,
      departmentId: this.departmentId,
      status: this.status,
      currentTask: this.currentTask?.id,
      timestamp: Date.now(),
      metrics: {
        cpuUsage: Math.random() * 100,
        memoryUsage: Math.random() * 100,
        taskQueue: this.messageQueue.length,
        performance: this.performanceMetrics
      }
    };

    this.coordinationBus.sendHeartbeat(heartbeatData);
    this.lastHeartbeat = Date.now();
  }

  async handleTaskAssignment(taskData) {
    const { taskId, task, deadline } = taskData;

    console.log(`📋 Agent ${this.id} assigned task: ${taskId} - ${task.title}`);

    try {
      this.currentTask = {
        id: taskId,
        ...task,
        startedAt: Date.now(),
        deadline: deadline,
        status: 'in_progress'
      };

      this.status = 'busy';

      // Process the task based on its type and requirements
      const result = await this.processTask(task);

      // Update task completion
      this.currentTask.status = 'completed';
      this.currentTask.completedAt = Date.now();
      this.currentTask.result = result;

      // Update performance metrics
      this.updateTaskMetrics(true, Date.now() - this.currentTask.startedAt);

      // Notify completion
      await this.coordinationBus.sendTaskCompletion({
        taskId,
        agentId: this.id,
        result,
        success: true,
        duration: Date.now() - this.currentTask.startedAt
      });

      this.taskHistory.push(this.currentTask);
      this.currentTask = null;
      this.status = 'idle';

      console.log(`✅ Task ${taskId} completed successfully by agent ${this.id}`);

    } catch (error) {
      console.error(`❌ Task ${taskId} failed for agent ${this.id}:`, error);

      this.currentTask.status = 'failed';
      this.currentTask.error = error.message;
      this.currentTask.failedAt = Date.now();

      // Update performance metrics
      this.updateTaskMetrics(false, Date.now() - this.currentTask.startedAt);

      // Notify failure
      await this.coordinationBus.sendTaskCompletion({
        taskId,
        agentId: this.id,
        result: null,
        success: false,
        error: error.message,
        duration: Date.now() - this.currentTask.startedAt
      });

      this.taskHistory.push(this.currentTask);
      this.currentTask = null;
      this.status = 'idle';
    }
  }

  async processTask(task) {
    // Route task processing based on type and specialization
    switch (task.type) {
      case 'development':
        return await this.processDevelopmentTask(task);
      case 'analysis':
        return await this.processAnalysisTask(task);
      case 'collaboration':
        return await this.processCollaborationTask(task);
      case 'creative':
        return await this.processCreativeTask(task);
      case 'research':
        return await this.processResearchTask(task);
      case 'coordination':
        return await this.processCoordinationTask(task);
      default:
        return await this.processGeneralTask(task);
    }
  }

  async processDevelopmentTask(task) {
    // Simulate development task processing
    const steps = [
      'analyzing requirements',
      'designing solution',
      'implementing code',
      'testing functionality',
      'documenting results'
    ];

    const result = {
      type: 'development',
      outputs: [],
      artifacts: [],
      codeQuality: Math.random() * 0.3 + 0.7, // 0.7-1.0
      testsPassed: Math.floor(Math.random() * 20) + 80, // 80-100%
      documentation: Math.random() * 0.3 + 0.7 // 0.7-1.0
    };

    for (const step of steps) {
      await this.simulateWork(500, 2000); // 0.5-2 seconds per step
      console.log(`  🔧 ${step}...`);

      result.outputs.push({
        step,
        timestamp: Date.now(),
        quality: Math.random() * 0.3 + 0.7
      });
    }

    // Generate code artifact
    if (task.requirements?.language) {
      result.artifacts.push({
        type: 'code',
        language: task.requirements.language,
        size: Math.floor(Math.random() * 5000) + 1000, // 1-6KB
        quality: result.codeQuality
      });
    }

    return result;
  }

  async processAnalysisTask(task) {
    // Simulate analysis task processing
    const analysisTypes = ['data', 'system', 'market', 'financial', 'performance'];
    const analysisType = task.requirements?.analysisType || analysisTypes[Math.floor(Math.random() * analysisTypes.length)];

    const result = {
      type: 'analysis',
      analysisType,
      insights: [],
      recommendations: [],
      confidence: Math.random() * 0.3 + 0.7, // 0.7-1.0
      dataPoints: Math.floor(Math.random() * 1000) + 100
    };

    await this.simulateWork(2000, 5000); // 2-5 seconds

    // Generate insights
    const insightCount = Math.floor(Math.random() * 5) + 3;
    for (let i = 0; i < insightCount; i++) {
      result.insights.push({
        id: `insight-${i + 1}`,
        title: `Key Finding ${i + 1}`,
        description: `Analysis revealed important patterns in ${analysisType} data`,
        impact: Math.random() * 0.5 + 0.5, // 0.5-1.0
        confidence: Math.random() * 0.3 + 0.7
      });
    }

    // Generate recommendations
    const recommendationCount = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < recommendationCount; i++) {
      result.recommendations.push({
        id: `rec-${i + 1}`,
        title: `Recommendation ${i + 1}`,
        description: `Based on analysis, consider taking this action`,
        priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        estimatedImpact: Math.random() * 0.4 + 0.6 // 0.6-1.0
      });
    }

    return result;
  }

  async processCollaborationTask(task) {
    // Simulate collaboration task processing
    const collaborationPartners = task.requirements?.collaborators || [];

    const result = {
      type: 'collaboration',
      collaborators: collaborationPartners,
      outcomes: [],
      consensus: Math.random() * 0.3 + 0.7, // 0.7-1.0
      efficiency: Math.random() * 0.3 + 0.7
    };

    // Simulate collaboration steps
    await this.simulateWork(1000, 3000);

    for (const partner of collaborationPartners) {
      result.outcomes.push({
        partner,
        interaction: 'successful',
        contribution: Math.random() * 0.5 + 0.5,
        timestamp: Date.now()
      });
    }

    return result;
  }

  async processCreativeTask(task) {
    // Simulate creative task processing
    const creativeTypes = ['content', 'design', 'strategy', 'innovation'];
    const creativeType = task.requirements?.creativeType || creativeTypes[Math.floor(Math.random() * creativeTypes.length)];

    const result = {
      type: 'creative',
      creativeType,
      concepts: [],
      innovations: [],
      originality: Math.random() * 0.4 + 0.6, // 0.6-1.0
      feasibility: Math.random() * 0.3 + 0.7
    };

    await this.simulateWork(3000, 6000); // Creative tasks take longer

    // Generate creative concepts
    const conceptCount = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < conceptCount; i++) {
      result.concepts.push({
        id: `concept-${i + 1}`,
        title: `Creative Concept ${i + 1}`,
        description: `Innovative approach to ${creativeType} challenge`,
        originality: Math.random() * 0.4 + 0.6,
        impact: Math.random() * 0.5 + 0.5
      });
    }

    // Generate innovations
    if (Math.random() > 0.5) {
      result.innovations.push({
        id: 'innovation-1',
        title: 'Breakthrough Idea',
        description: 'Novel solution that could transform the approach',
        potential: Math.random() * 0.3 + 0.7
      });
    }

    return result;
  }

  async processResearchTask(task) {
    // Simulate research task processing
    const researchAreas = ['technical', 'market', 'academic', 'experimental'];
    const researchArea = task.requirements?.researchArea || researchAreas[Math.floor(Math.random() * researchAreas.length)];

    const result = {
      type: 'research',
      researchArea,
      findings: [],
      methodology: 'empirical',
      reliability: Math.random() * 0.3 + 0.7, // 0.7-1.0
      significance: Math.random() * 0.4 + 0.6
    };

    await this.simulateWork(4000, 8000); // Research tasks take significant time

    // Generate research findings
    const findingCount = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < findingCount; i++) {
      result.findings.push({
        id: `finding-${i + 1}`,
        title: `Research Finding ${i + 1}`,
        description: `Important discovery in ${researchArea} domain`,
        evidence: Math.random() * 0.4 + 0.6,
        novelty: Math.random() * 0.5 + 0.5
      });
    }

    return result;
  }

  async processCoordinationTask(task) {
    // Simulate coordination task processing
    const coordinationTypes = ['team', 'project', 'resource', 'schedule'];
    const coordinationType = task.requirements?.coordinationType || coordinationTypes[Math.floor(Math.random() * coordinationTypes.length)];

    const result = {
      type: 'coordination',
      coordinationType,
      activities: [],
      resources: [],
      efficiency: Math.random() * 0.3 + 0.7,
      coverage: Math.random() * 0.2 + 0.8
    };

    await this.simulateWork(2000, 4000);

    // Generate coordination activities
    result.activities.push({
      type: 'planning',
      duration: Math.floor(Math.random() * 3600) + 1800, // 30-90 minutes
      participants: Math.floor(Math.random() * 10) + 5,
      outcome: 'successful'
    });

    result.activities.push({
      type: 'communication',
      duration: Math.floor(Math.random() * 1800) + 900, // 15-45 minutes
      channels: ['email', 'chat', 'video'],
      clarity: Math.random() * 0.3 + 0.7
    });

    return result;
  }

  async processGeneralTask(task) {
    // Default task processing
    await this.simulateWork(1000, 3000);

    return {
      type: 'general',
      title: task.title,
      description: task.description,
      completedAt: Date.now(),
      quality: Math.random() * 0.3 + 0.7,
      efficiency: Math.random() * 0.3 + 0.7
    };
  }

  async simulateWork(minMs, maxMs) {
    const duration = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  updateTaskMetrics(success, duration) {
    this.performanceMetrics.tasksCompleted++;

    // Update average task time
    const totalTasks = this.performanceMetrics.tasksCompleted;
    this.performanceMetrics.averageTaskTime =
      (this.performanceMetrics.averageTaskTime * (totalTasks - 1) + duration) / totalTasks;

    // Update success rate
    this.performanceMetrics.successRate =
      (this.performanceMetrics.successRate * (totalTasks - 1) + (success ? 1 : 0)) / totalTasks;

    // Update resource efficiency (simulate based on duration vs expected)
    const expectedDuration = this.currentTask?.estimatedDuration || 3600000; // 1 hour default
    const efficiency = Math.min(expectedDuration / duration, 2.0); // Cap at 2.0
    this.performanceMetrics.resourceEfficiency =
      (this.performanceMetrics.resourceEfficiency * (totalTasks - 1) + efficiency) / totalTasks;

    // Store performance history
    this.performanceHistory.push({
      timestamp: Date.now(),
      success,
      duration,
      efficiency,
      taskType: this.currentTask?.type || 'general'
    });

    // Keep only last 100 entries
    if (this.performanceHistory.length > 100) {
      this.performanceHistory = this.performanceHistory.slice(-100);
    }
  }

  updatePerformanceMetrics() {
    // Calculate recent performance trends
    const recentHistory = this.performanceHistory.slice(-10); // Last 10 tasks

    if (recentHistory.length > 0) {
      const recentSuccessRate = recentHistory.filter(h => h.success).length / recentHistory.length;
      const recentEfficiency = recentHistory.reduce((sum, h) => sum + h.efficiency, 0) / recentHistory.length;

      // Update innovation score based on task variety
      const taskTypes = new Set(recentHistory.map(h => h.taskType));
      this.performanceMetrics.innovationScore = Math.min(taskTypes.size / 10, 1.0);

      // Update quality score
      this.performanceMetrics.qualityScore = (recentSuccessRate + recentEfficiency) / 2;
    }

    // Emit performance update
    this.emit('performance_update', {
      agentId: this.id,
      metrics: this.performanceMetrics,
      timestamp: Date.now()
    });
  }

  checkTaskTimeout() {
    if (this.currentTask && this.currentTask.deadline) {
      if (Date.now() > this.currentTask.deadline) {
        console.log(`⏰ Task ${this.currentTask.id} timed out for agent ${this.id}`);

        // Handle timeout
        this.handleTaskTimeout(this.currentTask);
      }
    }
  }

  async handleTaskTimeout(task) {
    // Mark task as failed due to timeout
    task.status = 'timeout';
    task.timeoutAt = Date.now();

    // Update performance metrics
    this.updateTaskMetrics(false, Date.now() - task.startedAt);

    // Notify timeout
    await this.coordinationBus.sendTaskCompletion({
      taskId: task.id,
      agentId: this.id,
      result: null,
      success: false,
      error: 'Task timed out',
      duration: Date.now() - task.startedAt
    });

    this.taskHistory.push(task);
    this.currentTask = null;
    this.status = 'idle';
  }

  async handleCollaborationRequest(request) {
    const { requestId, fromAgent, task, collaborationType } = request;

    console.log(`🤝 Agent ${this.id} received collaboration request from ${fromAgent}`);

    // Evaluate if collaboration is beneficial
    const shouldCollaborate = await this.evaluateCollaboration(request);

    if (shouldCollaborate) {
      // Add to collaboration network
      this.collaborationNetwork.add(fromAgent);

      // Accept collaboration
      await this.coordinationBus.sendCollaborationResponse({
        requestId,
        fromAgent: this.id,
        toAgent: fromAgent,
        response: 'accept',
        collaborationType
      });

      console.log(`✅ Agent ${this.id} accepted collaboration with ${fromAgent}`);
    } else {
      // Decline collaboration
      await this.coordinationBus.sendCollaborationResponse({
        requestId,
        fromAgent: this.id,
        toAgent: fromAgent,
        response: 'decline',
        reason: 'Resource constraints or priority conflict'
      });

      console.log(`❌ Agent ${this.id} declined collaboration with ${fromAgent}`);
    }
  }

  async evaluateCollaboration(request) {
    // Simple evaluation based on current load and capabilities
    if (this.status === 'busy') {
      return false;
    }

    const { task, collaborationType } = request;

    // Check if collaboration aligns with capabilities
    if (collaborationType === 'development' && !this.capabilities.codeAnalysis) {
      return false;
    }

    if (collaborationType === 'creative' && !this.capabilities.contentCreation) {
      return false;
    }

    // Accept with high probability if idle and capable
    return Math.random() > 0.2; // 80% acceptance rate
  }

  handleResourceUpdate(resourceUpdate) {
    const { resourceId, type, amount, operation } = resourceUpdate;

    console.log(`📊 Agent ${this.id} received resource update: ${operation} ${amount} of ${type}`);

    if (operation === 'allocate') {
      if (!this.resources.includes(resourceId)) {
        this.resources.push(resourceId);
      }
    } else if (operation === 'deallocate') {
      const index = this.resources.indexOf(resourceId);
      if (index > -1) {
        this.resources.splice(index, 1);
      }
    }

    this.emit('resources_updated', {
      agentId: this.id,
      resources: this.resources,
      update: resourceUpdate
    });
  }

  handleSkillUpdate(skillUpdate) {
    const { skill, level, operation } = skillUpdate;

    if (operation === 'add') {
      this.learnedSkills.add(skill);
      this.capabilities[skill] = level || true;
    } else if (operation === 'remove') {
      this.learnedSkills.delete(skill);
      delete this.capabilities[skill];
    }

    console.log(`🎯 Agent ${this.id} ${operation} skill: ${skill}`);

    this.emit('skills_updated', {
      agentId: this.id,
      skills: Array.from(this.learnedSkills),
      capabilities: this.capabilities
    });
  }

  async requestCollaboration(targetAgent, task, collaborationType) {
    const requestId = `collab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const request = {
      requestId,
      fromAgent: this.id,
      toAgent: targetAgent,
      task,
      collaborationType,
      timestamp: Date.now()
    };

    await this.coordinationBus.sendCollaborationRequest(request);

    // Store request for response handling
    this.collaborationRequests.set(requestId, {
      ...request,
      status: 'pending'
    });

    return requestId;
  }

  getAgentStatus() {
    return {
      id: this.id,
      departmentId: this.departmentId,
      type: this.type,
      specialization: this.specialization,
      status: this.status,
      currentTask: this.currentTask,
      performance: this.performanceMetrics,
      capabilities: this.capabilities,
      resources: this.resources,
      collaborationNetwork: Array.from(this.collaborationNetwork),
      learnedSkills: Array.from(this.learnedSkills),
      uptime: Date.now() - this.startTime,
      lastHeartbeat: this.lastHeartbeat
    };
  }

  async shutdown() {
    console.log(`🔄 Shutting down Enterprise Agent ${this.id}...`);

    this.status = 'shutting_down';

    // Unregister from coordination bus
    if (this.coordinationBus) {
      await this.coordinationBus.unregisterAgent(this.id);
    }

    // Clear intervals
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.performanceInterval) clearInterval(this.performanceInterval);
    if (this.timeoutInterval) clearInterval(this.timeoutInterval);

    this.status = 'shutdown';
    console.log(`✅ Enterprise Agent ${this.id} shutdown complete`);

    this.emit('shutdown');
  }
}

export { EnterpriseAgent };

// CLI interface for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new EnterpriseAgent({
    departmentId: process.argv[2] || 'engineering',
    type: process.argv[3] || 'development',
    specialization: process.argv[4] || 'full-stack'
  });

  // Mock coordination bus for testing
  const mockCoordinationBus = {
    registerAgent: async (agentId, data) => {
      console.log(`📡 Mock: Agent ${agentId} registered`);
    },
    sendHeartbeat: async (data) => {
      console.log(`💓 Mock: Heartbeat sent from ${data.agentId}`);
    },
    sendTaskCompletion: async (data) => {
      console.log(`✅ Mock: Task completion sent for ${data.taskId}`);
    },
    sendCollaborationRequest: async (data) => {
      console.log(`🤝 Mock: Collaboration request sent to ${data.toAgent}`);
    },
    sendCollaborationResponse: async (data) => {
      console.log(`🤝 Mock: Collaboration response sent to ${data.toAgent}`);
    },
    unregisterAgent: async (agentId) => {
      console.log(`📡 Mock: Agent ${agentId} unregistered`);
    }
  };

  agent.initialize(mockCoordinationBus).then(() => {
    console.log('🤖 Enterprise Agent running in test mode...');

    // Simulate receiving a task after 5 seconds
    setTimeout(() => {
      agent.emit('task_assigned', {
        taskId: 'test-task-1',
        task: {
          title: 'Test Development Task',
          description: 'Build a simple API endpoint',
          type: 'development',
          requirements: {
            language: 'JavaScript',
            framework: 'Express'
          }
        },
        deadline: Date.now() + 300000 // 5 minutes
      });
    }, 5000);

    // Shutdown after 30 seconds
    setTimeout(() => {
      agent.shutdown();
      process.exit(0);
    }, 30000);

  }).catch(error => {
    console.error('Failed to start Enterprise Agent:', error);
    process.exit(1);
  });
}