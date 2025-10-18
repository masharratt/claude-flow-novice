#!/usr/bin/env node

/**
 * Test Coordinator Override Functionality
 *
 * This test validates that coordinators can override automatic agent selection
 * by specifying agent types and custom subtasks.
 */

import { HybridWorkerSpawner } from '../../src/cli/hybrid-routing/spawn-workers.js';

async function testCoordinatorOverride() {
  console.log('🧪 Testing Coordinator Override Functionality\n');

  // Test 1: Automatic selection (no override)
  console.log('📋 Test 1: Automatic Selection (Baseline)');
  console.log('═'.repeat(60));
  const spawner1 = new HybridWorkerSpawner({
    task: "Build authentication system with security audit",
    maxAgents: 3,
    provider: 'zai'
  });

  const agents1 = await spawner1.loadAgentDefinitions();
  const subtasks1 = await spawner1.decomposeTaskWithSpecialization(
    spawner1.taskDescription,
    spawner1.maxAgents
  );

  console.log(`✅ Loaded ${Object.keys(agents1).length} agent definitions`);
  console.log('🎯 Agent Assignment (Automatic):');
  subtasks1.forEach((st, i) => {
    console.log(`   Worker ${i + 1}: ${st.agentType} - ${st.task.substring(0, 60)}...`);
  });
  console.log('');

  // Test 2: Coordinator override (agent types only)
  console.log('📋 Test 2: Coordinator Override (Agent Types)');
  console.log('═'.repeat(60));
  const spawner2 = new HybridWorkerSpawner({
    task: "Refactor API with performance optimization",
    maxAgents: 3,
    provider: 'zai',
    agentOverride: ['architect', 'coder', 'reviewer']
  });

  const subtasks2 = await spawner2.decomposeTaskWithSpecialization(
    spawner2.taskDescription,
    spawner2.maxAgents
  );

  console.log('🎯 Agent Assignment (Coordinator Override):');
  subtasks2.forEach((st, i) => {
    const expected = ['architect', 'coder', 'reviewer'][i];
    const match = st.agentType === expected ? '✅' : '❌';
    console.log(`   ${match} Worker ${i + 1}: ${st.agentType} (expected: ${expected})`);
    console.log(`      Task: ${st.task.substring(0, 60)}...`);
  });
  console.log('');

  // Test 3: Full override (agents + custom subtasks)
  console.log('📋 Test 3: Full Override (Agents + Custom Subtasks)');
  console.log('═'.repeat(60));
  const customSubtasks = [
    'Implement OAuth2 authorization code flow with PKCE extension',
    'Perform comprehensive security audit focusing on token handling',
    'Review code for OWASP Top 10 vulnerabilities'
  ];

  const spawner3 = new HybridWorkerSpawner({
    task: "OAuth2 security implementation",
    maxAgents: 3,
    provider: 'zai',
    agentOverride: ['coder', 'security-specialist', 'reviewer'],
    subtaskOverride: customSubtasks
  });

  const subtasks3 = await spawner3.decomposeTaskWithSpecialization(
    spawner3.taskDescription,
    spawner3.maxAgents
  );

  console.log('🎯 Agent Assignment (Full Override):');
  subtasks3.forEach((st, i) => {
    const expectedAgent = ['coder', 'security-specialist', 'reviewer'][i];
    const expectedTask = customSubtasks[i];
    const agentMatch = st.agentType === expectedAgent ? '✅' : '❌';
    const taskMatch = st.task === expectedTask ? '✅' : '❌';
    console.log(`   ${agentMatch} Worker ${i + 1}: ${st.agentType} (expected: ${expectedAgent})`);
    console.log(`   ${taskMatch} Task: ${st.task.substring(0, 60)}...`);
    console.log(`      Expected: ${expectedTask.substring(0, 60)}...`);
  });
  console.log('');

  // Test 4: Fallback on invalid agent type
  console.log('📋 Test 4: Fallback on Invalid Agent Type');
  console.log('═'.repeat(60));
  const spawner4 = new HybridWorkerSpawner({
    task: "Build feature",
    maxAgents: 2,
    provider: 'zai',
    agentOverride: ['invalid-agent-type', 'coder']
  });

  const subtasks4 = await spawner4.decomposeTaskWithSpecialization(
    spawner4.taskDescription,
    spawner4.maxAgents
  );

  console.log('🎯 Agent Assignment (Fallback Test):');
  console.log(`   Expected: Fallback to automatic selection due to invalid agent type`);
  subtasks4.forEach((st, i) => {
    console.log(`   Worker ${i + 1}: ${st.agentType} - ${st.task.substring(0, 60)}...`);
  });
  console.log('');

  // Summary
  console.log('═'.repeat(60));
  console.log('📊 Test Summary');
  console.log('═'.repeat(60));

  const test1Pass = subtasks1.length === 3 && subtasks1.every(st => st.agentType);
  const test2Pass = subtasks2.length === 3 &&
    subtasks2[0].agentType === 'architect' &&
    subtasks2[1].agentType === 'coder' &&
    subtasks2[2].agentType === 'reviewer';
  const test3Pass = subtasks3.length === 3 &&
    subtasks3[0].agentType === 'coder' &&
    subtasks3[1].agentType === 'security-specialist' &&
    subtasks3[2].agentType === 'reviewer' &&
    subtasks3[0].task === customSubtasks[0] &&
    subtasks3[1].task === customSubtasks[1] &&
    subtasks3[2].task === customSubtasks[2];
  const test4Pass = subtasks4.length === 2; // Fallback should still work

  console.log(`Test 1 (Automatic): ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 2 (Override):  ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 3 (Full):      ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 4 (Fallback):  ${test4Pass ? '✅ PASS' : '❌ FAIL'}`);

  const allPass = test1Pass && test2Pass && test3Pass && test4Pass;
  console.log(`\n${allPass ? '✅ All tests passed!' : '❌ Some tests failed'}`);

  process.exit(allPass ? 0 : 1);
}

// Run tests
testCoordinatorOverride().catch(error => {
  console.error('❌ Test failed with error:', error);
  process.exit(1);
});
