/**
 * @file RetryTodoManager Usage Examples
 * @description Demonstrates how to use RetryTodoManager for self-executing continuation prompts
 */

import {
  RetryTodoManager,
  createRetryTodoManager,
  CFNLoopOrchestrator,
  createCFNLoopOrchestrator,
  ConsensusFeedback,
  ConsensusResult,
} from '../src/cfn-loop/index.js';

// ===== BASIC USAGE =====

async function basicRetryTodoExample() {
  console.log('=== Basic Retry Todo Manager Usage ===\n');

  // Create RetryTodoManager
  const todoManager = createRetryTodoManager({
    maxIterations: 10,
    enableAutoExecution: true,
    todoNamespace: 'example/retry-todos',
  });

  // Simulate consensus feedback
  const feedback: ConsensusFeedback = {
    phaseId: 'auth-implementation',
    iteration: 2,
    consensusFailed: true,
    consensusScore: 0.75,
    requiredScore: 0.90,
    validatorFeedback: [
      {
        validator: 'security-specialist',
        validatorType: 'security-specialist',
        issues: [
          {
            type: 'security',
            severity: 'critical',
            message: 'Missing rate limiting on authentication endpoints',
            location: {
              file: 'src/auth/routes.ts',
              line: 45,
            },
            suggestedFix: 'Implement express-rate-limit middleware with 5 requests per 15 minutes',
          },
        ],
        recommendations: ['Add comprehensive input validation', 'Implement JWT refresh tokens'],
        confidence: 0.85,
        timestamp: Date.now(),
      },
      {
        validator: 'reviewer',
        validatorType: 'reviewer',
        issues: [
          {
            type: 'quality',
            severity: 'high',
            message: 'Error handling is inconsistent across auth routes',
            suggestedFix: 'Create centralized error handling middleware',
          },
        ],
        recommendations: [],
        confidence: 0.80,
        timestamp: Date.now(),
      },
    ],
    failedCriteria: ['security', 'quality'],
    actionableSteps: [
      {
        priority: 'critical',
        category: 'security',
        action: 'Implement rate limiting for /auth/login and /auth/register',
        targetAgent: 'security-specialist',
        estimatedEffort: 'medium',
      },
      {
        priority: 'high',
        category: 'quality',
        action: 'Create centralized error handling middleware',
        targetAgent: 'coder',
        estimatedEffort: 'high',
      },
    ],
    previousIterations: [],
    timestamp: Date.now(),
  };

  // Create retry todo with self-executing prompt
  const retryTodo = todoManager.createLoop2RetryTodo(feedback, 2);

  console.log('✓ Retry todo created:', {
    id: retryTodo.id,
    type: retryTodo.type,
    urgency: retryTodo.continuationPrompt.urgency,
    selfLooping: retryTodo.continuationPrompt.selfLooping,
  });

  // Generate continuation prompt (this is what Claude reads)
  const continuationPrompt = todoManager.generateContinuationPrompt(retryTodo);

  console.log('\n=== CONTINUATION PROMPT (Claude executes this immediately) ===\n');
  console.log(continuationPrompt);
  console.log('\n=== END CONTINUATION PROMPT ===\n');

  // Extract feedback for specific agent
  const securityFeedback = todoManager.extractFeedbackForAgent(feedback, 'security-specialist');
  console.log('\n=== Feedback for security-specialist ===\n');
  console.log(securityFeedback);

  // Simulate success - cancel todo
  todoManager.cancelRetryTodo(retryTodo.id, 'consensus_passed');
  console.log('\n✓ Todo cancelled on consensus success\n');

  // Get statistics
  const stats = todoManager.getStatistics();
  console.log('Final statistics:', stats);

  todoManager.shutdown();
}

// ===== INTEGRATED WITH CFN LOOP ORCHESTRATOR =====

async function integratedCFNLoopExample() {
  console.log('\n=== Integrated CFN Loop + RetryTodoManager ===\n');

  // Create CFN Loop Orchestrator
  const orchestrator = createCFNLoopOrchestrator({
    phaseId: 'api-implementation',
    maxLoop2Iterations: 5,
    maxLoop3Iterations: 10,
    confidenceThreshold: 0.75,
    consensusThreshold: 0.90,
  });

  // Create RetryTodoManager
  const todoManager = createRetryTodoManager({
    maxIterations: 5,
    enableAutoExecution: true,
  });

  // Listen for orchestrator events
  orchestrator.on('continuation:required', (data) => {
    console.log('\n🔄 Continuation required - creating retry todo...');
    console.log('Iteration:', data.iteration, '/', data.maxIterations);
    console.log('Auto-retry:', data.autoRetry);

    // Extract consensus result from event
    // In real usage, this would come from orchestrator state
    const mockConsensusResult: ConsensusResult = {
      consensusScore: 0.85,
      consensusThreshold: 0.90,
      consensusPassed: false,
      validatorResults: [],
      votingBreakdown: { approve: 3, reject: 1 },
      iteration: data.iteration,
      timestamp: Date.now(),
    };

    // Create retry todo
    const retryTodo = todoManager.createLoop3RetryTodo(mockConsensusResult, data.iteration);

    console.log('\n✓ Retry todo created with self-executing prompt');
    console.log('Todo ID:', retryTodo.id);

    // Display continuation prompt
    const prompt = todoManager.generateContinuationPrompt(retryTodo);
    console.log('\n=== CLAUDE WILL EXECUTE THIS IMMEDIATELY ===\n');
    console.log(prompt.substring(0, 500) + '...\n');
  });

  orchestrator.on('escalation:with-retry-option', (data) => {
    console.log('\n⚠️ Max iterations reached - but retry still possible');
    console.log('Suggestion: Extend max iterations and continue');
    console.log(data.prompt.substring(0, 300) + '...\n');
  });

  // Execute phase (this would trigger retry todos on failure)
  console.log('Executing CFN loop phase...\n');

  try {
    const result = await orchestrator.executePhase('Implement REST API endpoints with authentication');

    console.log('\nPhase execution result:', {
      success: result.success,
      loop2Iterations: result.totalLoop2Iterations,
      loop3Iterations: result.totalLoop3Iterations,
      escalated: result.escalated,
    });
  } catch (error) {
    console.error('Phase execution failed:', error);
  }

  // Cleanup
  await orchestrator.shutdown();
  todoManager.shutdown();
}

// ===== ADVANCED: MULTIPLE TODOS WITH PRIORITY =====

async function multipleTodosExample() {
  console.log('\n=== Multiple Retry Todos with Priority ===\n');

  const todoManager = createRetryTodoManager({
    maxIterations: 10,
  });

  // Create multiple todos for different failures
  const criticalFeedback: ConsensusFeedback = {
    phaseId: 'payment-service',
    iteration: 1,
    consensusFailed: true,
    consensusScore: 0.60,
    requiredScore: 0.90,
    validatorFeedback: [
      {
        validator: 'security-specialist',
        validatorType: 'security-specialist',
        issues: [
          {
            type: 'security',
            severity: 'critical',
            message: 'Payment data not encrypted in transit',
          },
        ],
        recommendations: [],
        confidence: 0.90,
        timestamp: Date.now(),
      },
    ],
    failedCriteria: ['security'],
    actionableSteps: [
      {
        priority: 'critical',
        category: 'security',
        action: 'Implement TLS 1.3 for payment endpoints',
        targetAgent: 'security-specialist',
        estimatedEffort: 'high',
      },
    ],
    previousIterations: [],
    timestamp: Date.now(),
  };

  const qualityFeedback: ConsensusFeedback = {
    ...criticalFeedback,
    phaseId: 'user-service',
    iteration: 2,
    consensusScore: 0.82,
    validatorFeedback: [
      {
        validator: 'reviewer',
        validatorType: 'reviewer',
        issues: [
          {
            type: 'quality',
            severity: 'medium',
            message: 'Code duplication in user validation',
          },
        ],
        recommendations: ['Extract validation logic to shared module'],
        confidence: 0.75,
        timestamp: Date.now(),
      },
    ],
    actionableSteps: [
      {
        priority: 'medium',
        category: 'quality',
        action: 'Refactor duplicate validation code',
        targetAgent: 'coder',
        estimatedEffort: 'medium',
      },
    ],
  };

  // Create todos
  const todo1 = todoManager.createLoop2RetryTodo(criticalFeedback, 1);
  const todo2 = todoManager.createLoop2RetryTodo(qualityFeedback, 2);

  console.log('✓ Created 2 retry todos:');
  console.log('  - Critical security issue (payment-service)');
  console.log('  - Quality issue (user-service)\n');

  // Get active todos
  const activeTodos = todoManager.getActiveTodos();
  console.log('Active todos:', activeTodos.length);

  // Process critical todo first
  console.log('\nProcessing critical todo first...');
  const criticalPrompt = todoManager.generateContinuationPrompt(todo1);
  console.log('Critical prompt includes:', criticalPrompt.includes('CRITICAL') ? '✓ CRITICAL flag' : '✗ Missing flag');

  // Cancel on success
  todoManager.cancelRetryTodo(todo1.id, 'security_issues_fixed');
  console.log('✓ Critical todo cancelled after fix\n');

  // Process quality todo
  console.log('Processing quality todo...');
  const qualityPrompt = todoManager.generateContinuationPrompt(todo2);
  console.log('Quality prompt length:', qualityPrompt.length, 'characters');

  // Get final statistics
  const stats = todoManager.getStatistics();
  console.log('\nFinal statistics:', {
    active: stats.activeTodos,
    cancelled: stats.cancelledTodos,
    total: stats.totalCreated,
  });

  todoManager.shutdown();
}

// ===== AGENT-SPECIFIC FEEDBACK EXTRACTION =====

async function agentFeedbackExample() {
  console.log('\n=== Agent-Specific Feedback Extraction ===\n');

  const todoManager = createRetryTodoManager();

  const multiFeedback: ConsensusFeedback = {
    phaseId: 'full-stack-app',
    iteration: 3,
    consensusFailed: true,
    consensusScore: 0.78,
    requiredScore: 0.90,
    validatorFeedback: [
      {
        validator: 'security-specialist',
        validatorType: 'security-specialist',
        issues: [
          {
            type: 'security',
            severity: 'critical',
            message: 'CSRF protection missing on state-changing endpoints',
          },
        ],
        recommendations: ['Implement csurf middleware'],
        confidence: 0.90,
        timestamp: Date.now(),
      },
      {
        validator: 'perf-analyzer',
        validatorType: 'perf-analyzer',
        issues: [
          {
            type: 'performance',
            severity: 'high',
            message: 'N+1 query problem in user listing endpoint',
          },
        ],
        recommendations: ['Use join queries or data loader'],
        confidence: 0.85,
        timestamp: Date.now(),
      },
      {
        validator: 'tester',
        validatorType: 'tester',
        issues: [
          {
            type: 'testing',
            severity: 'medium',
            message: 'Missing integration tests for auth flow',
          },
        ],
        recommendations: [],
        confidence: 0.80,
        timestamp: Date.now(),
      },
    ],
    failedCriteria: ['security', 'performance', 'testing'],
    actionableSteps: [
      {
        priority: 'critical',
        category: 'security',
        action: 'Add CSRF protection',
        targetAgent: 'security-specialist',
        estimatedEffort: 'medium',
      },
      {
        priority: 'high',
        category: 'performance',
        action: 'Fix N+1 query',
        targetAgent: 'perf-analyzer',
        estimatedEffort: 'medium',
      },
      {
        priority: 'medium',
        category: 'testing',
        action: 'Write integration tests',
        targetAgent: 'tester',
        estimatedEffort: 'high',
      },
    ],
    previousIterations: [],
    timestamp: Date.now(),
  };

  // Extract feedback for each agent type
  const agentTypes = ['security-specialist', 'perf-analyzer', 'tester', 'coder'];

  for (const agentType of agentTypes) {
    console.log(`\n=== Feedback for ${agentType} ===\n`);
    const agentFeedback = todoManager.extractFeedbackForAgent(multiFeedback, agentType);
    console.log(agentFeedback);
    console.log('\n' + '='.repeat(60));
  }

  todoManager.shutdown();
}

// ===== RUN EXAMPLES =====

async function runAllExamples() {
  try {
    await basicRetryTodoExample();
    await integratedCFNLoopExample();
    await multipleTodosExample();
    await agentFeedbackExample();

    console.log('\n✅ All examples completed successfully\n');
  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  basicRetryTodoExample,
  integratedCFNLoopExample,
  multipleTodosExample,
  agentFeedbackExample,
};
