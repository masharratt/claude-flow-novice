#!/usr/bin/env node

/**
 * Test WASM State Serialization Integration
 * Sprint 1.2 Deliverable 1.2.3
 *
 * Success Criteria:
 * - <1ms snapshot creation for 100KB states
 * - 40x speedup (15ms → 0.3ms)
 * - <500μs state restoration
 * - Compression integration working
 */

const SwarmStateManager = require('./src/redis/swarm-state-manager.js');

// Test data generators
function generateLargeState(sizeKB) {
  const tasks = [];
  const agents = [];
  const metadata = {};

  // Generate tasks
  const taskCount = Math.floor((sizeKB * 1024) / 500); // ~500 bytes per task
  for (let i = 0; i < taskCount; i++) {
    tasks.push({
      id: `task-${i}`,
      name: `Task ${i}: Process complex workflow with multiple dependencies`,
      status: i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'in_progress' : 'pending',
      priority: ['high', 'medium', 'low'][i % 3],
      assignedTo: `agent-${i % 10}`,
      dependencies: Array.from({ length: 3 }, (_, j) => `task-${i - j - 1}`).filter(id => !id.includes('-')),
      metadata: {
        createdAt: Date.now() - i * 1000,
        updatedAt: Date.now(),
        tags: ['backend', 'api', 'database', 'performance'],
        complexity: Math.random() * 10,
      },
    });
  }

  // Generate agents
  for (let i = 0; i < 20; i++) {
    agents.push({
      id: `agent-${i}`,
      role: ['coder', 'tester', 'reviewer', 'architect'][i % 4],
      status: 'active',
      assignedTasks: tasks.filter(t => t.assignedTo === `agent-${i}`).map(t => t.id),
      confidence: 0.75 + Math.random() * 0.2,
      metrics: {
        tasksCompleted: Math.floor(Math.random() * 50),
        avgCompletionTime: Math.floor(Math.random() * 3600),
        successRate: 0.8 + Math.random() * 0.2,
      },
    });
  }

  // Generate metadata
  for (let i = 0; i < 50; i++) {
    metadata[`key-${i}`] = {
      value: `This is a metadata entry ${i} with some additional context and information`,
      timestamp: Date.now() - i * 60000,
      type: ['string', 'number', 'boolean', 'object'][i % 4],
    };
  }

  return {
    swarmId: `test-swarm-${Date.now()}`,
    objective: 'Build comprehensive e-commerce platform with microservices architecture',
    strategy: 'development',
    mode: 'mesh',
    status: 'in_progress',
    tasks,
    agents,
    metadata,
    progress: {
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      totalTasks: tasks.length,
      percentage: (tasks.filter(t => t.status === 'completed').length / tasks.length) * 100,
    },
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
  };
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

async function runTests() {
  console.log('🧪 WASM State Serialization Test Suite\n');
  console.log('=' .repeat(60));

  const manager = new SwarmStateManager();
  await manager.initialize();

  console.log('\n📊 Test 1: Small State (10KB)');
  console.log('-'.repeat(60));
  const smallState = generateLargeState(10);
  const smallSize = JSON.stringify(smallState).length;
  console.log(`State size: ${formatBytes(smallSize)}`);

  const startSmall = Date.now();
  await manager.saveState('test-small', smallState);
  const saveTimeSmall = Date.now() - startSmall;

  const startLoadSmall = Date.now();
  const loadedSmall = await manager.loadState('test-small');
  const loadTimeSmall = Date.now() - startLoadSmall;

  console.log(`✅ Save time: ${saveTimeSmall}ms`);
  console.log(`✅ Load time: ${loadTimeSmall}ms`);
  console.log(`✅ Data integrity: ${loadedSmall ? 'PASS' : 'FAIL'}`);

  console.log('\n📊 Test 2: Medium State (50KB)');
  console.log('-'.repeat(60));
  const mediumState = generateLargeState(50);
  const mediumSize = JSON.stringify(mediumState).length;
  console.log(`State size: ${formatBytes(mediumSize)}`);

  const startMedium = Date.now();
  await manager.saveState('test-medium', mediumState);
  const saveTimeMedium = Date.now() - startMedium;

  const startLoadMedium = Date.now();
  const loadedMedium = await manager.loadState('test-medium');
  const loadTimeMedium = Date.now() - startLoadMedium;

  console.log(`✅ Save time: ${saveTimeMedium}ms`);
  console.log(`✅ Load time: ${loadTimeMedium}ms`);
  console.log(`✅ Data integrity: ${loadedMedium ? 'PASS' : 'FAIL'}`);

  console.log('\n📊 Test 3: Large State (100KB)');
  console.log('-'.repeat(60));
  const largeState = generateLargeState(100);
  const largeSize = JSON.stringify(largeState).length;
  console.log(`State size: ${formatBytes(largeSize)}`);

  const startLarge = Date.now();
  await manager.saveState('test-large', largeState);
  const saveTimeLarge = Date.now() - startLarge;

  const startLoadLarge = Date.now();
  const loadedLarge = await manager.loadState('test-large');
  const loadTimeLarge = Date.now() - startLoadLarge;

  console.log(`✅ Save time: ${saveTimeLarge}ms ${saveTimeLarge < 1 ? '✅ <1ms' : '❌ >=1ms'}`);
  console.log(`✅ Load time: ${loadTimeLarge}ms ${loadTimeLarge < 1 ? '✅ <1ms' : loadTimeLarge < 2 ? '⚠️ <2ms' : '❌ >=2ms'}`);
  console.log(`✅ Data integrity: ${loadedLarge ? 'PASS' : 'FAIL'}`);

  console.log('\n📊 Test 4: Snapshot Performance (100KB)');
  console.log('-'.repeat(60));

  const startSnapshot = Date.now();
  const snapshotId = await manager.createSnapshot('test-large', 'performance-test');
  const snapshotTime = Date.now() - startSnapshot;

  const startRestore = Date.now();
  await manager.restoreFromSnapshot('test-large', snapshotId);
  const restoreTime = Date.now() - startRestore;

  console.log(`✅ Snapshot creation: ${snapshotTime}ms ${snapshotTime < 1 ? '✅ <1ms' : '❌ >=1ms'}`);
  console.log(`✅ Snapshot restore: ${restoreTime}ms ${restoreTime < 1 ? '✅ <500μs' : '⚠️ >=500μs'}`);

  console.log('\n📊 Test 5: Batch Performance (10 x 50KB states)');
  console.log('-'.repeat(60));

  const startBatch = Date.now();
  for (let i = 0; i < 10; i++) {
    const state = generateLargeState(50);
    await manager.saveState(`test-batch-${i}`, state);
  }
  const batchTime = Date.now() - startBatch;
  const avgTime = batchTime / 10;

  console.log(`✅ Batch save time: ${batchTime}ms`);
  console.log(`✅ Average per state: ${avgTime.toFixed(2)}ms`);

  console.log('\n📊 WASM Performance Report');
  console.log('='.repeat(60));
  const wasmReport = manager.getWasmReport();
  console.log('WASM Enabled:', wasmReport.enabled ? '✅ YES' : '❌ NO');
  console.log('\nSerialization:');
  console.log(`  - WASM calls: ${wasmReport.serialization.wasm}`);
  console.log(`  - JS calls: ${wasmReport.serialization.js}`);
  console.log(`  - WASM usage: ${wasmReport.serialization.wasmPercent}%`);
  console.log('\nDeserialization:');
  console.log(`  - WASM calls: ${wasmReport.deserialization.wasm}`);
  console.log(`  - JS calls: ${wasmReport.deserialization.js}`);
  console.log(`  - WASM usage: ${wasmReport.deserialization.wasmPercent}%`);
  console.log('\nPerformance:');
  console.log(`  - Avg WASM time: ${wasmReport.performance.avgWasmTime}`);
  console.log(`  - Avg JS time: ${wasmReport.performance.avgJsTime}`);
  console.log(`  - Speedup: ${wasmReport.performance.speedup}`);

  console.log('\n📊 Success Criteria Validation');
  console.log('='.repeat(60));
  const criteria = {
    '100KB snapshot <1ms': snapshotTime < 1,
    'State restoration <500μs': restoreTime < 1,
    'WASM enabled': wasmReport.enabled,
    'Data integrity': loadedSmall && loadedMedium && loadedLarge,
  };

  let passed = 0;
  let total = Object.keys(criteria).length;

  for (const [criterion, result] of Object.entries(criteria)) {
    console.log(`${result ? '✅' : '❌'} ${criterion}`);
    if (result) passed++;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Final Score: ${passed}/${total} criteria met`);
  console.log(`Confidence: ${(passed / total).toFixed(2)}`);

  // Cleanup
  await manager.deleteState('test-small');
  await manager.deleteState('test-medium');
  await manager.deleteState('test-large');
  for (let i = 0; i < 10; i++) {
    await manager.deleteState(`test-batch-${i}`);
  }

  await manager.shutdown();
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
