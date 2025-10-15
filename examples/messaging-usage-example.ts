/**
 * Example Usage of Enhanced Redis Messaging Infrastructure
 * 
 * This example demonstrates how to use the enhanced messaging infrastructure
 * for agent coordination with granular progress tracking.
 */

import { 
  RedisMessagingInfrastructure,
  EnhancedProgressTracker,
  createRedisMessagingInfrastructure,
  createEnhancedProgressTracker
} from '../src/messaging/index.js';

async function demonstrateProgressTracking() {
  console.log('🚀 Demonstrating Enhanced Progress Tracking\n');

  // Initialize progress tracker
  const tracker = createEnhancedProgressTracker(
    'redis://localhost:6379',
    {
      level: 'info',
      format: 'json',
      destination: 'console'
    },
    'demo-secret-key'
  );

  await tracker.initialize();
  console.log('✅ Progress tracker initialized');

  // Create a comprehensive task with multiple steps
  const taskId = 'implement-user-auth';
  const steps = [
    {
      name: 'Project Setup',
      description: 'Initialize project structure and dependencies'
    },
    {
      name: 'Database Schema',
      description: 'Design and implement user database schema'
    },
    {
      name: 'JWT Configuration',
      description: 'Configure JWT token generation and validation'
    },
    {
      name: 'Authentication Middleware',
      description: 'Create Express middleware for authentication'
    },
    {
      name: 'API Routes',
      description: 'Implement login, register, and logout endpoints'
    },
    {
      name: 'Testing',
      description: 'Write comprehensive unit and integration tests'
    }
  ];

  await tracker.createTaskProgress(
    taskId,
    'coder-agent-1',
    'swarm-demo',
    'backend-development',
    'Implement complete user authentication system with JWT tokens',
    steps
  );

  console.log(`📋 Created task: ${taskId} with ${steps.length} steps`);

  // Simulate progress updates
  const simulateProgress = async () => {
    // Step 1: Project Setup
    console.log('\n🔧 Starting: Project Setup');
    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-1',
      status: 'in_progress',
      progressPercentage: 10,
      confidence: 0.95,
      reasoning: {
        currentThought: 'Setting up TypeScript project with Express',
        strategy: 'Using standard Node.js project structure',
        alternatives: ['NestJS framework', 'Fastify framework']
      }
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-1',
      status: 'completed',
      progressPercentage: 15,
      metadata: {
        filesProcessed: ['package.json', 'tsconfig.json', 'src/index.ts']
      }
    });

    console.log('✅ Completed: Project Setup');

    // Step 2: Database Schema
    console.log('\n🗄️  Starting: Database Schema');
    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-2',
      status: 'in_progress',
      progressPercentage: 25,
      confidence: 0.85,
      metadata: {
        dependencies: ['database-setup']
      }
    });

    // Add sub-steps for database schema
    await tracker.addSubSteps(taskId, 'step-2', [
      { name: 'User Model', description: 'Create User database model' },
      { name: 'Migrations', description: 'Write database migration files' },
      { name: 'Indexes', description: 'Add performance indexes' }
    ]);

    await new Promise(resolve => setTimeout(resolve, 1500));

    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-2-sub-1',
      status: 'completed',
      progressPercentage: 30
    });

    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-2-sub-2',
      status: 'completed',
      progressPercentage: 35
    });

    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-2-sub-3',
      status: 'completed',
      progressPercentage: 40,
      metadata: {
        filesProcessed: ['src/models/User.ts', 'migrations/001_create_users.sql']
      }
    });

    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-2',
      status: 'completed',
      progressPercentage: 45
    });

    console.log('✅ Completed: Database Schema');

    // Step 3: JWT Configuration
    console.log('\n🔐 Starting: JWT Configuration');
    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-3',
      status: 'in_progress',
      progressPercentage: 55,
      confidence: 0.90,
      reasoning: {
        currentThought: 'Implementing secure JWT token handling',
        strategy: 'Using RS256 for better security than HS256',
        risks: ['Key management complexity', 'Token expiration handling']
      }
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-3',
      status: 'completed',
      progressPercentage: 60,
      metadata: {
        filesProcessed: ['src/auth/jwt.ts', 'src/auth/tokenValidator.ts']
      }
    });

    console.log('✅ Completed: JWT Configuration');

    // Step 4: Authentication Middleware
    console.log('\n🛡️  Starting: Authentication Middleware');
    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-4',
      status: 'in_progress',
      progressPercentage: 70,
      confidence: 0.88
    });

    await new Promise(resolve => setTimeout(resolve, 1200));

    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-4',
      status: 'completed',
      progressPercentage: 75,
      metadata: {
        filesProcessed: ['src/middleware/auth.ts', 'src/middleware/validateToken.ts']
      }
    });

    console.log('✅ Completed: Authentication Middleware');

    // Step 5: API Routes
    console.log('\n🌐 Starting: API Routes');
    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-5',
      status: 'in_progress',
      progressPercentage: 85,
      confidence: 0.92
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-5',
      status: 'completed',
      progressPercentage: 90,
      metadata: {
        filesProcessed: ['src/routes/auth.ts', 'src/controllers/authController.ts']
      }
    });

    console.log('✅ Completed: API Routes');

    // Step 6: Testing
    console.log('\n🧪 Starting: Testing');
    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-6',
      status: 'in_progress',
      progressPercentage: 95,
      confidence: 0.85,
      reasoning: {
        currentThought: 'Writing comprehensive tests for all components',
        strategy: 'Unit tests for individual functions, integration tests for API endpoints',
        risks: ['Database setup for tests', 'Mock JWT tokens']
      }
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-6',
      status: 'completed',
      progressPercentage: 100,
      metadata: {
        filesProcessed: [
          'tests/auth.test.ts',
          'tests/middleware.test.ts',
          'tests/routes.test.ts'
        ]
      }
    });

    console.log('✅ Completed: Testing');

    // Complete the entire task
    await tracker.completeTask(taskId, [
      'src/auth/jwt.ts',
      'src/middleware/auth.ts',
      'src/routes/auth.ts',
      'tests/auth.test.ts'
    ]);

    console.log('\n🎉 Task completed successfully!');
  };

  // Subscribe to progress updates
  await tracker.subscribeToProgress(
    { agentIds: ['coder-agent-1'] },
    (update) => {
      console.log(`📊 Progress Update: ${update.data.progressPercentage || 0}% - ${update.type}`);
    }
  );

  await simulateProgress();

  // Get final task progress
  const finalProgress = await tracker.getTaskProgress(taskId);
  console.log('\n📈 Final Task Summary:');
  console.log(`   Status: ${finalProgress?.overallStatus}`);
  console.log(`   Progress: ${finalProgress?.progressPercentage}%`);
  console.log(`   Confidence: ${finalProgress?.confidence}`);
  console.log(`   Duration: ${finalProgress?.endTime && finalProgress.startTime ? 
    Math.round((finalProgress.endTime - finalProgress.startTime) / 1000) : 0}s`);
  console.log(`   Deliverables: ${finalProgress?.metadata.deliverables?.length || 0} files`);

  await tracker.cleanup();
}

async function demonstrateAgentCoordination() {
  console.log('\n\n🤝 Demonstrating Agent Coordination\n');

  // Initialize messaging for multiple agents
  const agent1 = createRedisMessagingInfrastructure(
    'researcher-agent-1',
    'swarm-demo',
    {
      hmacSecret: 'demo-secret-key',
      heartbeatInterval: 5000
    }
  );

  const agent2 = createRedisMessagingInfrastructure(
    'coder-agent-1',
    'swarm-demo',
    {
      hmacSecret: 'demo-secret-key',
      heartbeatInterval: 5000
    }
  );

  const agent3 = createRedisMessagingInfrastructure(
    'reviewer-agent-1',
    'swarm-demo',
    {
      hmacSecret: 'demo-secret-key',
      heartbeatInterval: 5000
    }
  );

  await Promise.all([agent1.initialize(), agent2.initialize(), agent3.initialize()]);
  console.log('✅ All agents initialized');

  // Set up message subscriptions
  agent2.on('task-assigned', async (message) => {
    console.log(`📬 Agent 2 received task assignment: ${message.payload.taskDescription}`);
    
    // Update agent visibility
    await agent2.updateAgentVisibility({
      status: 'working',
      currentTask: await agent2.getProgressTracker().getTaskProgress(message.payload.taskId),
      availability: {
        currentLoad: 1,
        maxConcurrentTasks: 3
      }
    });
  });

  agent3.on('coordination-request', async (message) => {
    const { action, targetTask, reason } = message.payload;
    
    if (action === 'handoff') {
      console.log(`🤝 Agent 3 received handoff request for task: ${targetTask}`);
      console.log(`   Reason: ${reason}`);
      
      // Accept the handoff
      await agent3.sendCoordinationResponse(
        message.from,
        'approve',
        message.id,
        'Ready to review the implementation'
      );
      
      await agent3.updateAgentVisibility({
        status: 'working',
        availability: {
          currentLoad: 1,
          maxConcurrentTasks: 2
        }
      });
    }
  });

  // Simulate workflow
  console.log('\n🔄 Starting coordinated workflow...');

  // Step 1: Researcher assigns task to coder
  const taskId = 'implement-user-profile';
  await agent1.sendTaskAssignment(
    'coder-agent-1',
    taskId,
    'feature-development',
    'Implement user profile management system',
    ['typescript', 'express', 'mongodb'],
    ['user-auth'],
    Date.now() + 7200000 // 2 hours
  );

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 2: Coder works on task and updates progress
  const progressTracker = agent2.getProgressTracker();
  await progressTracker.createTaskProgress(
    taskId,
    'coder-agent-1',
    'swarm-demo',
    'feature-development',
    'Implement user profile management system',
    [
      { name: 'API Design', description: 'Design profile API endpoints' },
      { name: 'Implementation', description: 'Implement profile CRUD operations' },
      { name: 'Validation', description: 'Add input validation and error handling' },
      { name: 'Testing', description: 'Write comprehensive tests' }
    ]
  );

  // Simulate some progress
  await progressTracker.updateTaskProgress(taskId, {
    stepId: 'step-1',
    status: 'completed',
    progressPercentage: 25
  });

  await progressTracker.updateTaskProgress(taskId, {
    stepId: 'step-2',
    status: 'in_progress',
    progressPercentage: 50,
    confidence: 0.85
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 3: Coder requests code review
  await agent2.sendCoordinationRequest(
    'reviewer-agent-1',
    'handoff',
    taskId,
    'Implementation complete, ready for code review'
  );

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 4: Get swarm overview
  const swarmOverview = await agent1.getSwarmOverview();
  console.log('\n📊 Swarm Overview:');
  console.log(`   Total Agents: ${swarmOverview?.totalAgents}`);
  console.log(`   Active Agents: ${swarmOverview?.activeAgents}`);
  console.log(`   Health Score: ${swarmOverview?.healthScore}%`);
  console.log(`   Overall Progress: ${swarmOverview?.overallProgress}%`);
  console.log(`   Bottlenecks: ${swarmOverview?.bottlenecks.join(', ') || 'None'}`);

  // Step 5: Get agent visibility
  for (const agentId of ['researcher-agent-1', 'coder-agent-1', 'reviewer-agent-1']) {
    const visibility = await agent1.getProgressTracker().getAgentVisibility(agentId);
    if (visibility) {
      console.log(`\n👤 Agent ${agentId}:`);
      console.log(`   Status: ${visibility.status}`);
      console.log(`   Performance: ${visibility.performance.tasksCompleted} tasks completed`);
      console.log(`   Success Rate: ${(visibility.performance.successRate * 100).toFixed(1)}%`);
      console.log(`   Current Load: ${visibility.availability.currentLoad}/${visibility.availability.maxConcurrentTasks}`);
    }
  }

  // Cleanup
  await Promise.all([agent1.cleanup(), agent2.cleanup(), agent3.cleanup()]);
  console.log('\n✅ Agent coordination demo completed');
}

async function demonstrateAdvancedFeatures() {
  console.log('\n\n🚀 Demonstrating Advanced Features\n');

  const tracker = createEnhancedProgressTracker(
    'redis://localhost:6379',
    {
      level: 'debug',
      format: 'json',
      destination: 'console'
    }
  );

  await tracker.initialize();

  // Demonstrate error handling and recovery
  console.log('🔧 Demonstrating error handling...');

  const errorTaskId = 'error-prone-task';
  await tracker.createTaskProgress(
    errorTaskId,
    'coder-agent-1',
    'swarm-demo',
    'bug-fixing',
    'Fix critical authentication bug',
    [
      { name: 'Bug Analysis', description: 'Analyze the authentication issue' },
      { name: 'Root Cause', description: 'Identify root cause' },
      { name: 'Fix Implementation', description: 'Implement the fix' },
      { name: 'Testing', description: 'Test the fix thoroughly' }
    ]
  );

  // Simulate an error during step 2
  await tracker.updateTaskProgress(errorTaskId, {
    stepId: 'step-1',
    status: 'completed',
    progressPercentage: 25
  });

  await tracker.updateTaskProgress(errorTaskId, {
    stepId: 'step-2',
    status: 'in_progress',
    progressPercentage: 40,
    confidence: 0.6,
    reasoning: {
      currentThought: 'Investigating JWT token validation issue',
      risks: ['Bug might be in third-party library']
    }
  });

  // Simulate failure
  await tracker.failTask(errorTaskId, 'Unable to reproduce the issue in development environment', {
    environment: 'development',
    reproductionSteps: ['Clear steps documented'],
    suspectedCause: 'Environment configuration difference'
  });

  const failedTask = await tracker.getTaskProgress(errorTaskId);
  console.log(`❌ Task failed: ${failedTask?.metadata.blockers?.[0]}`);

  // Demonstrate performance analytics
  console.log('\n📈 Demonstrating performance analytics...');

  // Create multiple completed tasks for analytics
  const completedTasks = [];
  for (let i = 1; i <= 5; i++) {
    const taskId = `completed-task-${i}`;
    await tracker.createTaskProgress(
      taskId,
      `agent-${i % 3 + 1}`,
      'swarm-demo',
      'feature-development',
      `Completed feature ${i}`,
      [
        { name: 'Planning', description: 'Plan the feature' },
        { name: 'Implementation', description: 'Implement the feature' },
        { name: 'Testing', description: 'Test the feature' }
      ]
    );

    // Simulate completion
    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-1',
      status: 'completed'
    });

    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-2',
      status: 'completed'
    });

    await tracker.updateTaskProgress(taskId, {
      stepId: 'step-3',
      status: 'completed'
    });

    await tracker.completeTask(taskId, [`feature-${i}.js`, `feature-${i}.test.js`]);
    completedTasks.push(taskId);
  }

  // Get swarm overview with analytics
  const overview = await tracker.getSwarmOverview('swarm-demo');
  console.log('\n📊 Swarm Performance Analytics:');
  console.log(`   Total Tasks: ${overview?.totalTasks}`);
  console.log(`   Completed Tasks: ${overview?.completedTasks}`);
  console.log(`   Failed Tasks: ${overview?.failedTasks}`);
  console.log(`   Health Score: ${overview?.healthScore}%`);
  console.log(`   Estimated Completion: ${overview?.estimatedCompletion ? 
    new Date(overview.estimatedCompletion).toLocaleTimeString() : 'N/A'}`);

  // Demonstrate message history
  console.log('\n📜 Demonstrating message history...');

  const messaging = createRedisMessagingInfrastructure(
    'analytics-agent',
    'swarm-demo'
  );

  await messaging.initialize();

  // Send some test messages
  await messaging.sendMessage('test', { data: 'test message 1' });
  await messaging.sendMessage('test', { data: 'test message 2' });
  await messaging.sendMessage('coordination_request', { action: 'test' });

  // Get message history
  const history = await messaging.getMessageHistory({
    messageTypes: ['test', 'coordination_request'],
    limit: 10
  });

  console.log(`📨 Recent messages: ${history.length}`);

  await messaging.cleanup();
  await tracker.cleanup();

  console.log('\n✅ Advanced features demo completed');
}

// Main execution
async function main() {
  console.log('🎯 Enhanced Redis Messaging Infrastructure Demo\n');
  console.log('This demo showcases the key features of the enhanced messaging infrastructure:');
  console.log('1. Granular progress tracking with confidence scoring');
  console.log('2. Agent coordination and messaging');
  console.log('3. Error handling and recovery');
  console.log('4. Performance analytics and swarm monitoring\n');

  try {
    await demonstrateProgressTracking();
    await demonstrateAgentCoordination();
    await demonstrateAdvancedFeatures();

    console.log('\n🎉 All demos completed successfully!');
    console.log('\nKey takeaways:');
    console.log('• Granular progress tracking provides detailed visibility into task execution');
    console.log('• Agent coordination enables seamless handoffs and collaboration');
    console.log('• Real-time messaging keeps all agents synchronized');
    console.log('• Performance analytics help identify bottlenecks and optimize workflows');
    console.log('• Error handling ensures robust operation in distributed environments');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { 
  demonstrateProgressTracking, 
  demonstrateAgentCoordination, 
  demonstrateAdvancedFeatures 
};