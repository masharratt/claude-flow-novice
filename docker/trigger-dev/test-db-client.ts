#!/usr/bin/env tsx

import * as db from './src/lib/cfn-db';

async function main() {
  console.log('=== CFN Database Client Test ===\n');

  const testTaskId = `test-task-${Date.now()}`;
  const testAgentId = `test-agent-${Date.now()}`;

  try {
    // 1. Test connection and create task
    console.log('1. Creating test task...');
    const task = await db.createTask({
      id: testTaskId,
      description: 'Test task for database client validation',
      mode: 'standard',
      maxIterations: 5,
      provider: 'zai',
      workDir: '/tmp/test',
      triggerRunId: 'trigger-test-123',
    });
    console.log('   Task created:', {
      id: task.id,
      status: task.status,
      mode: task.mode,
    });

    // 2. Create an iteration
    console.log('\n2. Creating iteration...');
    const iteration = await db.createIteration({
      taskId: testTaskId,
      iterationNumber: 1,
      coordinatorManifest: {
        phases: ['implementation', 'testing'],
        totalAgents: 3,
      },
    });
    console.log('   Iteration created:', {
      id: iteration.id,
      iterationNumber: iteration.iteration_number,
      status: iteration.status,
    });

    // 3. Create an agent
    console.log('\n3. Creating agent...');
    const agent = await db.createAgent({
      id: testAgentId,
      taskId: testTaskId,
      iterationId: iteration.id,
      agentType: 'typescript-specialist',
      role: 'implementer',
      assignedFiles: ['test.ts', 'utils.ts'],
      assignedTests: ['test.spec.ts'],
      taskDescription: 'Implement TypeScript utility functions',
      triggerRunId: 'trigger-agent-456',
    });
    console.log('   Agent created:', {
      id: agent.id,
      agentType: agent.agent_type,
      role: agent.role,
      status: agent.status,
    });

    // 4. Update agent status
    console.log('\n4. Updating agent status to running...');
    await db.updateAgentStatus(testAgentId, 'running');
    console.log('   Agent status updated to running');

    // 5. Log a message
    console.log('\n5. Creating log entry...');
    await db.logger.info('test-client', 'Test log message', {
      taskId: testTaskId,
      agentId: testAgentId,
      data: { testField: 'testValue', timestamp: Date.now() },
    });
    console.log('   Log entry created');

    // 6. Record a test run
    console.log('\n6. Recording test run...');
    await db.recordTestRun({
      taskId: testTaskId,
      iterationId: iteration.id,
      agentId: testAgentId,
      testCommand: 'npm test',
      workDir: '/tmp/test',
      exitCode: 0,
      durationMs: 2500,
      totalTests: 10,
      passedTests: 9,
      failedTests: 1,
      skippedTests: 0,
      failedTestNames: ['should handle edge case'],
    });
    console.log('   Test run recorded (9/10 passed)');

    // 7. Complete agent
    console.log('\n7. Completing agent...');
    await db.updateAgentStatus(testAgentId, 'completed', {
      success: true,
      testsPassed: false,
      confidence: 0.85,
      filesModified: ['test.ts', 'utils.ts'],
      durationMs: 5000,
    });
    console.log('   Agent completed');

    // 8. Update iteration
    console.log('\n8. Updating iteration...');
    await db.updateIteration(iteration.id, {
      status: 'completed',
      gatePassRate: 0.90,
      gatePassed: true,
      consensusScore: 0.88,
      consensusPassed: true,
      decision: 'PROCEED',
    });
    console.log('   Iteration updated');

    // 9. Update task
    console.log('\n9. Updating task status...');
    await db.updateTaskStatus(testTaskId, 'completed', {
      currentIteration: 1,
      finalDecision: 'PROCEED',
      finalPassRate: 0.90,
      finalConsensus: 0.88,
    });
    console.log('   Task status updated to completed');

    // 10. Query task details
    console.log('\n10. Querying task details...');
    const details = await db.getTaskWithDetails(testTaskId);
    console.log('    Task summary:', {
      id: details.task?.id,
      status: details.task?.status,
      finalDecision: details.task?.final_decision,
      totalIterations: details.iterations.length,
      totalAgents: details.agents.length,
      recentLogCount: details.recentLogs.length,
    });

    // 11. Cleanup - delete test data
    console.log('\n11. Cleaning up test data...');
    await db.pool.query('DELETE FROM cfn_agents WHERE id = $1', [testAgentId]);
    await db.pool.query('DELETE FROM cfn_iterations WHERE id = $1', [iteration.id]);
    await db.pool.query('DELETE FROM cfn_tasks WHERE id = $1', [testTaskId]);
    console.log('    Test data cleaned up');

    console.log('\n=== All Tests Passed! ===\n');

    console.log('Summary:');
    console.log('- Connection: PASSED');
    console.log('- Task CRUD: PASSED');
    console.log('- Iteration CRUD: PASSED');
    console.log('- Agent CRUD: PASSED');
    console.log('- Logging: PASSED');
    console.log('- Test Recording: PASSED');
    console.log('- Query Operations: PASSED');
    console.log('- Cleanup: PASSED');

  } catch (error) {
    console.error('\n=== Test Failed ===');
    console.error(error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();
