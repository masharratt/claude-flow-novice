/**
 * @file Example Usage of CFN Loop Feedback Injection System
 * @description Demonstrates how to integrate feedback injection into the CFN loop
 */

import { CFNLoopIntegrator, ConsensusValidationResult } from './cfn-loop-integrator.js';
import { FeedbackInjectionSystem } from './feedback-injection-system.js';
import { FeedbackMemoryManager } from './feedback-memory-manager.js';

/**
 * Example 1: Complete CFN Loop with Feedback Injection
 */
async function exampleCompleteCFNLoop() {
  console.log('=== Example: Complete CFN Loop with Feedback Injection ===\n');

  // Initialize the CFN loop integrator
  const cfnLoop = new CFNLoopIntegrator({
    maxIterations: 10,
    consensusThreshold: 0.9,
    enableFeedbackInjection: true,
    autoRelaunch: true,
  });

  const phaseId = 'feature-implementation-phase-1';

  // Step 1: Initialize the loop
  const loopState = await cfnLoop.initializeLoop(phaseId);
  console.log('Loop initialized:', loopState);

  // Step 2: Execute primary swarm (simulated)
  console.log('\n[Iteration 1] Executing primary swarm...');

  // Step 3: Process self-validation results
  const selfValidationScore = 0.85; // 85% confidence
  const selfValidationResult = await cfnLoop.processSelfValidation(phaseId, selfValidationScore);
  console.log('Self-validation result:', selfValidationResult);

  if (!selfValidationResult.proceed) {
    console.log('Self-validation failed, would relaunch here');
    return;
  }

  // Step 4: Execute consensus validation swarm (simulated)
  console.log('\n[Iteration 1] Executing consensus validation swarm...');

  const validationResult: ConsensusValidationResult = {
    consensusAchieved: false, // Failed first attempt
    consensusScore: 0.75, // 75% agreement
    requiredScore: 0.9, // 90% required
    validatorResults: [
      {
        agentId: 'validator-1',
        agentType: 'security-specialist',
        securityIssues: [
          {
            severity: 'high',
            message: 'XSS vulnerability in input handling',
            location: { file: 'auth.js', line: 42 },
            fix: 'Sanitize user input before rendering',
          },
        ],
        recommendations: ['Add CSP headers', 'Implement input validation library'],
        confidence: 0.8,
      },
      {
        agentId: 'validator-2',
        agentType: 'tester',
        testingIssues: [
          {
            severity: 'critical',
            message: 'No tests for authentication flow',
            fix: 'Add integration tests for auth',
          },
        ],
        recommendations: ['Achieve 80% coverage for auth module'],
        confidence: 0.9,
      },
    ],
    criticalIssues: 1,
    highIssues: 1,
  };

  // Step 5: Process consensus validation
  const consensusResult = await cfnLoop.processConsensusValidation(phaseId, validationResult);
  console.log('\nConsensus result:', consensusResult);

  if (consensusResult.action === 'relaunch' && consensusResult.feedback) {
    console.log('\n=== Consensus Failed - Preparing for Relaunch ===');
    console.log('Feedback captured:', {
      iteration: consensusResult.feedback.iteration,
      consensusScore: consensusResult.feedback.consensusScore,
      actionableSteps: consensusResult.feedback.actionableSteps.length,
    });

    // Step 6: Inject feedback into swarm context
    const swarmContext = {
      phaseId,
      iteration: 2,
      agents: [
        {
          agentId: 'coder-1',
          agentType: 'coder',
          role: 'primary' as const,
          instructions: 'Implement authentication system with JWT tokens',
        },
        {
          agentId: 'tester-1',
          agentType: 'tester',
          role: 'primary' as const,
          instructions: 'Write comprehensive tests for authentication',
        },
      ],
      topology: 'mesh' as const,
      maxAgents: 2,
    };

    const injectedContext = await cfnLoop.injectFeedbackIntoSwarm(phaseId, swarmContext);
    console.log('\nFeedback injected into agents. Sample:');
    console.log(injectedContext.agents[0].instructions.substring(0, 200) + '...');
  }

  // Step 7: Get next steps guidance
  const nextSteps = await cfnLoop.generateNextSteps(phaseId);
  console.log('\n=== Next Steps Guidance ===');
  console.log('Completed:', nextSteps.completed);
  console.log('Identified Issues:', nextSteps.identifiedIssues);
  console.log('Recommended Next Steps:', nextSteps.recommendedNextSteps);
}

/**
 * Example 2: Direct Feedback System Usage
 */
async function exampleDirectFeedbackUsage() {
  console.log('\n\n=== Example: Direct Feedback System Usage ===\n');

  const feedbackSystem = new FeedbackInjectionSystem({
    maxIterations: 10,
    deduplicationEnabled: true,
  });

  // Capture feedback
  const feedback = await feedbackSystem.captureFeedback({
    phaseId: 'test-phase',
    iteration: 1,
    consensusScore: 0.7,
    requiredScore: 0.9,
    validatorResults: [
      {
        agentId: 'reviewer-1',
        agentType: 'reviewer',
        qualityIssues: [
          {
            severity: 'medium',
            message: 'Code complexity too high in processData function',
            location: { file: 'data-processor.ts', line: 125, function: 'processData' },
            fix: 'Refactor into smaller functions',
          },
        ],
        recommendations: ['Add code documentation', 'Reduce cyclomatic complexity'],
        confidence: 0.75,
      },
    ],
  });

  console.log('Captured feedback:', {
    phaseId: feedback.phaseId,
    consensusFailed: feedback.consensusFailed,
    actionableSteps: feedback.actionableSteps.length,
  });

  // Format for injection
  const formattedFeedback = feedbackSystem.formatForInjection(feedback);
  console.log('\nFormatted feedback preview:');
  console.log(formattedFeedback.substring(0, 300) + '...');

  // Get statistics
  const stats = feedbackSystem.getStatistics('test-phase');
  console.log('\nFeedback statistics:', stats);
}

/**
 * Example 3: Memory Manager Usage
 */
async function exampleMemoryManagerUsage() {
  console.log('\n\n=== Example: Memory Manager Usage ===\n');

  const memoryManager = new FeedbackMemoryManager({
    namespace: 'cfn-loop/feedback',
    defaultTTL: 86400 * 7, // 7 days
    maxEntries: 1000,
  });

  const feedbackSystem = new FeedbackInjectionSystem();

  // Create multiple feedback iterations
  for (let i = 1; i <= 3; i++) {
    const feedback = await feedbackSystem.captureFeedback({
      phaseId: 'memory-test-phase',
      iteration: i,
      consensusScore: 0.6 + i * 0.1, // Improving scores
      requiredScore: 0.9,
      validatorResults: [
        {
          agentId: `validator-${i}`,
          qualityIssues: [
            {
              severity: 'high',
              message: `Issue ${i}: Code quality concern`,
              fix: `Fix ${i}: Apply best practices`,
            },
          ],
        },
      ],
    });

    await memoryManager.storeFeedback(feedback);
    console.log(`Stored feedback for iteration ${i}`);
  }

  // Query feedback
  const allFeedback = await memoryManager.getPhaseFeedback('memory-test-phase');
  console.log(`\nRetrieved ${allFeedback.length} feedback entries`);

  // Get trends
  const trends = await memoryManager.getFeedbackTrends('memory-test-phase');
  console.log('\nTrends:', {
    consensusScores: trends.consensusScoretrend,
    improving: trends.improving,
  });

  // Get accumulated issues
  const accumulated = await memoryManager.getAccumulatedIssues('memory-test-phase');
  console.log('\nAccumulated issues:', {
    recurring: accumulated.recurring.length,
    resolved: accumulated.resolved.length,
    new: accumulated.new.length,
  });

  // Get statistics
  const stats = memoryManager.getStatistics();
  console.log('\nMemory statistics:', stats);
}

/**
 * Example 4: Escalation Scenario
 */
async function exampleEscalationScenario() {
  console.log('\n\n=== Example: Escalation Scenario ===\n');

  const cfnLoop = new CFNLoopIntegrator({
    maxIterations: 3, // Low limit for demo
    consensusThreshold: 0.9,
    escalationThreshold: 0.6,
  });

  const phaseId = 'escalation-test';
  await cfnLoop.initializeLoop(phaseId);

  // Simulate 3 failed iterations
  for (let iteration = 1; iteration <= 3; iteration++) {
    console.log(`\n[Iteration ${iteration}]`);

    const validationResult: ConsensusValidationResult = {
      consensusAchieved: false,
      consensusScore: 0.5, // Low score, not improving
      requiredScore: 0.9,
      validatorResults: [
        {
          agentId: 'validator-1',
          qualityIssues: [
            { severity: 'critical', message: 'Fundamental architecture flaw' },
          ],
        },
      ],
      criticalIssues: 1,
      highIssues: 0,
    };

    const result = await cfnLoop.processConsensusValidation(phaseId, validationResult);
    console.log(`Result: ${result.action}`);

    if (result.action === 'escalate') {
      console.log('\n=== ESCALATION TRIGGERED ===');
      const nextSteps = await cfnLoop.generateNextSteps(phaseId);
      console.log('Escalation guidance:');
      nextSteps.recommendedNextSteps.forEach((step) => console.log(`  - ${step}`));
      break;
    }
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    await exampleCompleteCFNLoop();
    await exampleDirectFeedbackUsage();
    await exampleMemoryManagerUsage();
    await exampleEscalationScenario();

    console.log('\n\n=== All Examples Completed Successfully ===');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  exampleCompleteCFNLoop,
  exampleDirectFeedbackUsage,
  exampleMemoryManagerUsage,
  exampleEscalationScenario,
};
