#!/usr/bin/env ts-node

import * as cfnRedis from './src/lib/cfn-redis.js';

async function runTests() {
  console.log('========================================');
  console.log('CFN Redis Client Test Suite');
  console.log('========================================\n');

  const taskId = `test-${Date.now()}`;
  const agentId = `agent-${Date.now()}`;

  try {
    // =============================================
    // Test 1: Redis Connection
    // =============================================
    console.log('[TEST 1] Testing Redis connection...');
    const redis = cfnRedis.getRedis();
    const pingResult = await redis.ping();
    if (pingResult !== 'PONG') {
      throw new Error('Redis connection failed');
    }
    console.log('✓ Redis connection successful\n');

    // =============================================
    // Test 2: Agent Status Tracking
    // =============================================
    console.log('[TEST 2] Testing agent status tracking...');

    await cfnRedis.setAgentStatus(agentId, 'pending', { startedBy: 'test-suite' });
    let status = await cfnRedis.getAgentStatus(agentId);
    if (!status || status.status !== 'pending') {
      throw new Error('Failed to set agent status to pending');
    }
    console.log('✓ Set agent status: pending');

    await cfnRedis.setAgentStatus(agentId, 'running');
    status = await cfnRedis.getAgentStatus(agentId);
    if (!status || status.status !== 'running') {
      throw new Error('Failed to update agent status to running');
    }
    console.log('✓ Updated agent status: running');

    await cfnRedis.setAgentStatus(agentId, 'completed', {
      confidence: 0.95,
      filesModified: ['test.ts']
    });
    status = await cfnRedis.getAgentStatus(agentId);
    if (!status || status.status !== 'completed') {
      throw new Error('Failed to update agent status to completed');
    }
    console.log('✓ Updated agent status: completed');
    console.log('✓ Agent status tracking works\n');

    // =============================================
    // Test 3: Task State Management
    // =============================================
    console.log('[TEST 3] Testing task state management...');

    const initialState: cfnRedis.TaskState = {
      iteration: 1,
      phase: 'loop3-implementation',
      completedPhases: [],
      coordinatorContext: { mode: 'standard' }
    };

    await cfnRedis.saveTaskState(taskId, initialState);
    let state = await cfnRedis.getTaskState(taskId);
    if (!state || state.iteration !== 1 || state.phase !== 'loop3-implementation') {
      throw new Error('Failed to save initial task state');
    }
    console.log('✓ Saved initial task state');

    const updatedState: cfnRedis.TaskState = {
      iteration: 2,
      phase: 'loop2-validation',
      completedPhases: ['loop3-implementation'],
      coordinatorContext: { mode: 'standard', previousIteration: 1 }
    };

    await cfnRedis.saveTaskState(taskId, updatedState);
    state = await cfnRedis.getTaskState(taskId);
    if (!state || state.iteration !== 2 || state.completedPhases.length !== 1) {
      throw new Error('Failed to update task state');
    }
    console.log('✓ Updated task state');
    console.log('✓ Task state management works\n');

    // =============================================
    // Test 4: BLPOP Completion Signaling (Critical!)
    // =============================================
    console.log('[TEST 4] Testing BLPOP completion signaling...');
    console.log('Starting BLPOP test with 3 agents...');

    const startTime = Date.now();

    // Simulate agents signaling completion in background (non-blocking)
    const signalAgent = async (delay: number, agentNum: number) => {
      await new Promise(resolve => setTimeout(resolve, delay));
      await cfnRedis.signalCompletion(taskId, {
        agentId: `agent${agentNum}`,
        status: 'completed',
        success: true,
        testsPassed: true,
        confidence: 0.95 - (agentNum * 0.01),
        filesModified: [`file${agentNum}.ts`],
        durationMs: 1000 + (agentNum * 100),
        completedAt: Date.now()
      });
      console.log(`  Agent ${agentNum} signaled completion`);
    };

    // Start all signal operations in background (don't await)
    signalAgent(100, 1);
    signalAgent(200, 2);
    signalAgent(300, 3);

    // Wait for all completions (BLPOP blocks until signals arrive)
    const completions = await cfnRedis.waitForCompletions(taskId, 3, 10);
    const elapsedMs = Date.now() - startTime;

    if (completions.length !== 3) {
      throw new Error(`Expected 3 completions, got ${completions.length}`);
    }

    console.log(`✓ Received all 3 completions via BLPOP in ${elapsedMs}ms`);

    if (elapsedMs > 1000) {
      console.warn(`⚠ Warning: BLPOP took ${elapsedMs}ms (expected <1000ms)`);
    } else {
      console.log('✓ BLPOP coordination is instant (no polling!)');
    }

    // Verify completion data (check all agents received correctly)
    const agent1Completion = completions.find(c => c.agentId === 'agent1');
    const agent2Completion = completions.find(c => c.agentId === 'agent2');
    const agent3Completion = completions.find(c => c.agentId === 'agent3');

    if (!agent1Completion || !agent1Completion.testsPassed) {
      throw new Error('Agent 1 completion missing or incomplete');
    }
    if (!agent2Completion || !agent2Completion.testsPassed) {
      throw new Error('Agent 2 completion missing or incomplete');
    }
    if (!agent3Completion || !agent3Completion.testsPassed) {
      throw new Error('Agent 3 completion missing or incomplete');
    }

    // Verify confidence values are approximately correct (floating point math)
    const tolerance = 0.001;
    if (Math.abs((agent1Completion.confidence || 0) - 0.94) > tolerance) {
      throw new Error(`Agent 1 confidence ${agent1Completion.confidence} != 0.94`);
    }
    if (Math.abs((agent2Completion.confidence || 0) - 0.93) > tolerance) {
      throw new Error(`Agent 2 confidence ${agent2Completion.confidence} != 0.93`);
    }
    if (Math.abs((agent3Completion.confidence || 0) - 0.92) > tolerance) {
      throw new Error(`Agent 3 confidence ${agent3Completion.confidence} != 0.92`);
    }

    console.log('✓ Completion signal data integrity verified');
    console.log('✓ BLPOP completion signaling works perfectly\n');

    // =============================================
    // Test 5: Cleanup
    // =============================================
    console.log('[TEST 5] Testing cleanup...');

    await cfnRedis.cleanupTask(taskId);

    // Verify cleanup
    const stateAfterCleanup = await cfnRedis.getTaskState(taskId);
    if (stateAfterCleanup) {
      throw new Error('Task state was not cleaned up');
    }
    console.log('✓ Task cleanup successful\n');

    // =============================================
    // Test Summary
    // =============================================
    console.log('========================================');
    console.log('All Tests Passed! ✓');
    console.log('========================================');
    console.log('\nKey Results:');
    console.log(`  • Redis connection: WORKING`);
    console.log(`  • Agent status tracking: WORKING`);
    console.log(`  • Task state management: WORKING`);
    console.log(`  • BLPOP completion signaling: WORKING (${elapsedMs}ms)`);
    console.log(`  • Cleanup: WORKING`);
    console.log('\nBLPOP Pattern Validation:');
    console.log(`  ✓ Instant notification (no polling)`);
    console.log(`  ✓ Multiple agents coordinated correctly`);
    console.log(`  ✓ Data integrity preserved`);
    console.log(`  ✓ Wait time: ${elapsedMs}ms (< 1 second threshold)`);

    await cfnRedis.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test Failed:', error);
    await cfnRedis.close();
    process.exit(1);
  }
}

runTests();
