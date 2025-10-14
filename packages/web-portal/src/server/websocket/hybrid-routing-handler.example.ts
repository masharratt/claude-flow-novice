/**
 * Hybrid Routing Handler Usage Examples
 * Demonstrates how to use the HybridRoutingHandler for CFN events
 */

import { createServer } from 'http';
import { WebSocketServer } from './SocketIOServer';
import { HybridRoutingHandler } from './hybrid-routing-handler';
import type { AgentSpawnedEvent, AgentCompletedEvent, CFNLoop3Event, CFNLoop4Decision } from './hybrid-routing-handler';

// Example 1: Basic Setup
function basicSetupExample() {
  console.log('=== Basic Setup Example ===');
  
  // Create HTTP server
  const httpServer = createServer();
  
  // Create WebSocket server
  const wsServer = new WebSocketServer(httpServer, {
    corsOrigin: '*',
    enableDebug: true,
    eventThrottle: {
      metrics_update: 5000,
      agent_update: 100
    }
  });
  
  // Create hybrid routing handler
  const handler = new HybridRoutingHandler(wsServer);
  
  // Start server
  httpServer.listen(3001, () => {
    console.log('WebSocket server running on port 3001');
  });
  
  return { httpServer, wsServer, handler };
}

// Example 2: Agent Lifecycle Management
function agentLifecycleExample(handler: HybridRoutingHandler) {
  console.log('=== Agent Lifecycle Example ===');
  
  // Spawn a new agent
  const agentSpawned: AgentSpawnedEvent = {
    agentId: 'backend-api-developer-001',
    agentType: 'backend-dev',
    parentId: 'swarm-coordinator-main',
    swarmId: 'api-development-swarm',
    task: 'Create RESTful API endpoints for user management',
    capabilities: [
      'node.js',
      'express',
      'typescript',
      'postgresql',
      'jwt-authentication',
      'api-testing'
    ],
    resources: {
      cpu: 2,
      memory: 4096,
      storage: 1024
    },
    metadata: {
      priority: 'high',
      deadline: '2024-01-15T23:59:59Z',
      requirements: [
        'RESTful design',
        'JWT authentication',
        'Input validation',
        'Error handling',
        'API documentation',
        'Unit tests'
      ]
    },
    timestamp: new Date()
  };
  
  handler.agentSpawned(agentSpawned);
  
  // Simulate agent progress with CFN Loop 3 iterations
  setTimeout(() => {
    const iteration1: CFNLoop3Event = {
      phaseId: 'api-design-phase',
      iteration: 1,
      agentId: 'backend-api-developer-001',
      agentType: 'backend-dev',
      task: 'Design API schema and endpoints',
      confidence: 0.65,
      duration: 8000,
      output: {
        endpoints: [
          'GET /api/users',
          'POST /api/users',
          'PUT /api/users/:id',
          'DELETE /api/users/:id'
        ],
        schema: 'user-schema.json',
        documentation: 'api-design.md'
      },
      timestamp: new Date()
    };
    
    handler.cfnLoop3Iteration(iteration1);
  }, 2000);
  
  setTimeout(() => {
    const iteration2: CFNLoop3Event = {
      phaseId: 'implementation-phase',
      iteration: 2,
      agentId: 'backend-api-developer-001',
      agentType: 'backend-dev',
      task: 'Implement API endpoints with authentication',
      confidence: 0.78,
      duration: 12000,
      output: {
        filesCreated: 15,
        testsWritten: 45,
        codeCoverage: 0.92,
        performance: {
          avgResponseTime: '120ms',
          throughput: '1000 req/s'
        }
      },
      timestamp: new Date()
    };
    
    handler.cfnLoop3Iteration(iteration2);
  }, 5000);
  
  // Complete the agent
  setTimeout(() => {
    const agentCompleted: AgentCompletedEvent = {
      agentId: 'backend-api-developer-001',
      status: 'completed',
      confidence: 0.94,
      cost: {
        compute: 0.045,
        storage: 0.008,
        network: 0.012,
        total: 0.065
      },
      duration: 28000,
      output: {
        endpoints: 8,
        tests: 67,
        documentation: 'complete',
        codeQuality: 'A+',
        security: 'validated'
      },
      metrics: {
        tasksCompleted: 5,
        quality: 0.96,
        efficiency: 0.89
      },
      timestamp: new Date()
    };
    
    handler.agentCompleted(agentCompleted);
  }, 8000);
}

// Example 3: CFN Loop 4 PO Decisions
function poDecisionExample(handler: HybridRoutingHandler) {
  console.log('=== PO Decision Example ===');
  
  // PO approves the implementation
  setTimeout(() => {
    const approvalDecision: CFNLoop4Decision = {
      phaseId: 'implementation-phase',
      decisionId: 'po-decision-001',
      agentId: 'backend-api-developer-001',
      decisionType: 'approve',
      rationale: 'Excellent implementation that exceeds requirements. The API follows RESTful best practices, includes comprehensive authentication, proper error handling, and extensive test coverage. Performance benchmarks exceed targets.',
      criteria: {
        quality: 0.96,
        completeness: 0.94,
        compliance: 0.98,
        performance: 0.92
      },
      metadata: {
        reviewer: 'product-owner-jane',
        reviewTime: '25 minutes',
        feedback: 'Consider using this implementation as a template for future APIs',
        approvedFor: 'production'
      },
      timestamp: new Date()
    };
    
    handler.cfnLoop4Decision(approvalDecision);
  }, 10000);
}

// Example 4: Error Handling and Escalation
function errorHandlingExample(handler: HybridRoutingHandler) {
  console.log('=== Error Handling Example ===');
  
  // Spawn an agent that will encounter issues
  const problematicAgent: AgentSpawnedEvent = {
    agentId: 'database-migrator-002',
    agentType: 'database-specialist',
    task: 'Migrate database schema to new version',
    capabilities: ['sql', 'postgresql', 'migration'],
    resources: { cpu: 1, memory: 2048, storage: 512 },
    timestamp: new Date()
  };
  
  handler.agentSpawned(problematicAgent);
  
  // Simulate CFN Loop 3 errors
  setTimeout(() => {
    handler.cfnLoop3Error({
      phaseId: 'migration-phase',
      agentId: 'database-migrator-002',
      error: 'Foreign key constraint violation during migration',
      iteration: 3
    });
  }, 3000);
  
  // Agent fails
  setTimeout(() => {
    handler.agentCompleted({
      agentId: 'database-migrator-002',
      status: 'failed',
      confidence: 0.25,
      cost: {
        compute: 0.015,
        storage: 0.002,
        network: 0.001,
        total: 0.018
      },
      duration: 12000,
      errors: [
        'Foreign key constraint violation',
        'Data integrity check failed',
        'Rollback incomplete'
      ],
      timestamp: new Date()
    });
  }, 6000);
  
  // PO escalates the issue
  setTimeout(() => {
    handler.cfnLoop4Escalation({
      phaseId: 'migration-phase',
      agentId: 'database-migrator-002',
      reason: 'Critical database migration failure requiring senior DBA intervention',
      escalatedTo: 'senior-database-administrator'
    });
  }, 8000);
}

// Example 5: Multi-Agent Collaboration
function multiAgentExample(handler: HybridRoutingHandler) {
  console.log('=== Multi-Agent Collaboration Example ===');
  
  // Spawn multiple agents for a complex project
  const agents = [
    {
      agentId: 'frontend-developer-001',
      agentType: 'frontend-dev',
      task: 'Create React dashboard',
      capabilities: ['react', 'typescript', 'redux'],
      resources: { cpu: 2, memory: 3072, storage: 768 }
    },
    {
      agentId: 'backend-developer-001',
      agentType: 'backend-dev',
      task: 'Implement API services',
      capabilities: ['node.js', 'express', 'mongodb'],
      resources: { cpu: 2, memory: 4096, storage: 1024 }
    },
    {
      agentId: 'testing-specialist-001',
      agentType: 'qa-engineer',
      task: 'Create comprehensive test suite',
      capabilities: ['jest', 'cypress', 'testing'],
      resources: { cpu: 1, memory: 2048, storage: 512 }
    }
  ];
  
  // Spawn all agents
  agents.forEach((agent, index) => {
    setTimeout(() => {
      handler.agentSpawned({
        ...agent,
        parentId: 'project-coordinator-main',
        swarmId: 'web-app-development',
        timestamp: new Date()
      });
    }, index * 1000);
  });
  
  // Simulate parallel work with CFN Loop 3
  agents.forEach((agent, index) => {
    setTimeout(() => {
      handler.cfnLoop3Iteration({
        phaseId: 'development-phase',
        iteration: 1,
        agentId: agent.agentId,
        agentType: agent.agentType,
        task: agent.task,
        confidence: 0.7 + Math.random() * 0.2,
        duration: 5000 + Math.random() * 10000,
        output: {
          progress: Math.floor(25 + Math.random() * 50),
          quality: Math.random() > 0.3 ? 'good' : 'needs-improvement'
        },
        timestamp: new Date()
      });
    }, 5000 + index * 2000);
  });
  
  // Complete agents and make PO decisions
  agents.forEach((agent, index) => {
    setTimeout(() => {
      handler.agentCompleted({
        agentId: agent.agentId,
        status: Math.random() > 0.2 ? 'completed' : 'failed',
        confidence: 0.75 + Math.random() * 0.2,
        cost: {
          compute: 0.02 + Math.random() * 0.03,
          storage: 0.001 + Math.random() * 0.004,
          network: 0.001 + Math.random() * 0.002,
          total: 0
        },
        duration: 8000 + Math.random() * 12000,
        timestamp: new Date()
      });
      
      // Calculate total cost
      const cost = 0.02 + Math.random() * 0.03 + 0.001 + Math.random() * 0.004 + 0.001 + Math.random() * 0.002;
      
      handler.cfnLoop4Decision({
        phaseId: 'development-phase',
        decisionId: `decision-${agent.agentId}`,
        agentId: agent.agentId,
        decisionType: Math.random() > 0.3 ? 'approve' : 'request_changes',
        rationale: `Review of ${agent.task} completed`,
        criteria: {
          quality: 0.8 + Math.random() * 0.15,
          completeness: 0.75 + Math.random() * 0.2,
          compliance: 0.85 + Math.random() * 0.1,
          performance: 0.8 + Math.random() * 0.15
        },
        timestamp: new Date()
      });
    }, 15000 + index * 3000);
  });
}

// Example 6: Monitoring and Statistics
function monitoringExample(handler: HybridRoutingHandler) {
  console.log('=== Monitoring Example ===');
  
  // Periodically report statistics
  setInterval(() => {
    const stats = handler.getEventStats();
    const storageStats = handler.getStorageStats();
    
    console.log('=== Event Statistics ===');
    console.log('Event Counts:', stats);
    console.log('Storage Stats:', storageStats);
    
    // Get specific data
    const agents = Array.from(storageStats.agents ? [] : []);
    console.log('Active Agents:', storageStats.agents);
    console.log('Total Events Processed:', storageStats.totalEvents);
  }, 10000);
}

// Example 7: Complete Workflow
function completeWorkflowExample() {
  console.log('=== Complete Workflow Example ===');
  
  const { httpServer, wsServer, handler } = basicSetupExample();
  
  // Set up monitoring
  monitoringExample(handler);
  
  // Run different scenarios
  setTimeout(() => agentLifecycleExample(handler), 2000);
  setTimeout(() => poDecisionExample(handler), 2000);
  setTimeout(() => errorHandlingExample(handler), 15000);
  setTimeout(() => multiAgentExample(handler), 25000);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await wsServer.shutdown();
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  
  return { httpServer, wsServer, handler };
}

// Export examples for use in other modules
export {
  basicSetupExample,
  agentLifecycleExample,
  poDecisionExample,
  errorHandlingExample,
  multiAgentExample,
  monitoringExample,
  completeWorkflowExample
};

// Run complete workflow if this file is executed directly
if (require.main === module) {
  completeWorkflowExample();
}