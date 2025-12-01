#!/usr/bin/env ts-node

import * as cfnRedis from './src/lib/cfn-redis.js';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSimpleTest() {
  console.log('=== Simple BLPOP Test ===\n');

  const taskId = `test-${Date.now()}`;

  try {
    // Test 1: Send signals FIRST, then wait
    console.log('[Test 1] Send signals first, then wait...');

    await cfnRedis.signalCompletion(taskId + '-1', {
      agentId: 'agent1',
      status: 'completed',
      success: true,
      durationMs: 1000,
      completedAt: Date.now()
    });

    await cfnRedis.signalCompletion(taskId + '-1', {
      agentId: 'agent2',
      status: 'completed',
      success: true,
      durationMs: 1000,
      completedAt: Date.now()
    });

    console.log('Signals sent, now waiting...');
    const results = await cfnRedis.waitForCompletions(taskId + '-1', 2, 5);
    console.log(`✓ Received ${results.length} completions\n`);

    // Test 2: Wait in background, send signals after
    console.log('[Test 2] Start wait, send signals during...');

    const taskId2 = taskId + '-2';

    // Start wait in background (don't await yet)
    const waitPromise = cfnRedis.waitForCompletions(taskId2, 2, 10);

    // Give BRPOP time to start blocking
    await sleep(100);

    // Now send signals
    console.log('Sending signal 1...');
    await cfnRedis.signalCompletion(taskId2, {
      agentId: 'agent1',
      status: 'completed',
      success: true,
      durationMs: 1000,
      completedAt: Date.now()
    });

    await sleep(100);

    console.log('Sending signal 2...');
    await cfnRedis.signalCompletion(taskId2, {
      agentId: 'agent2',
      status: 'completed',
      success: true,
      durationMs: 1000,
      completedAt: Date.now()
    });

    // Now wait for completion
    const results2 = await waitPromise;
    console.log(`✓ Received ${results2.length} completions\n`);

    console.log('=== All Tests Passed ===');

    await cfnRedis.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test Failed:', error);
    await cfnRedis.close();
    process.exit(1);
  }
}

runSimpleTest();
