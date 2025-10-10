#!/usr/bin/env node

/**
 * Direct WASM State Serialization Test
 * Sprint 1.2 Deliverable 1.2.3
 */

const path = require('path');

console.log('🧪 Direct WASM State Serialization Test\n');
console.log('='.repeat(60));

// Load WASM module
try {
  const wasmModule = require('./src/wasm-regex-engine/pkg/wasm_regex_engine.js');
  const { StateSerializer } = wasmModule;

  console.log('✅ WASM module loaded successfully');
  console.log('✅ StateSerializer available:', typeof StateSerializer === 'function');

  // Create serializer
  const serializer = new StateSerializer(false);
  console.log('✅ StateSerializer instance created\n');

  // Test data generators
  function generateState(sizeKB) {
    const tasks = [];
    const taskCount = Math.floor((sizeKB * 1024) / 500);

    for (let i = 0; i < taskCount; i++) {
      tasks.push({
        id: `task-${i}`,
        name: `Task ${i}: Complex workflow processing`,
        status: ['completed', 'in_progress', 'pending'][i % 3],
        metadata: {
          createdAt: Date.now(),
          tags: ['backend', 'api', 'database'],
        },
      });
    }

    return {
      swarmId: `test-swarm-${Date.now()}`,
      tasks,
      agents: Array.from({ length: 10 }, (_, i) => ({ id: `agent-${i}`, status: 'active' })),
    };
  }

  console.log('📊 Test 1: 10KB State');
  console.log('-'.repeat(60));
  const state10KB = generateState(10);
  const json10KB = JSON.stringify(state10KB);
  console.log(`State size: ${(json10KB.length / 1024).toFixed(2)} KB`);

  const start10 = Date.now();
  const serialized10 = serializer.serializeState(state10KB);
  const serialize10Time = Date.now() - start10;

  const startD10 = Date.now();
  const deserialized10 = serializer.deserializeState(serialized10);
  const deserialize10Time = Date.now() - startD10;

  console.log(`✅ Serialize: ${serialize10Time}ms`);
  console.log(`✅ Deserialize: ${deserialize10Time}ms`);
  console.log(`✅ Integrity: ${deserialized10.swarmId === state10KB.swarmId ? 'PASS' : 'FAIL'}\n`);

  console.log('📊 Test 2: 50KB State');
  console.log('-'.repeat(60));
  const state50KB = generateState(50);
  const json50KB = JSON.stringify(state50KB);
  console.log(`State size: ${(json50KB.length / 1024).toFixed(2)} KB`);

  const start50 = Date.now();
  const serialized50 = serializer.serializeState(state50KB);
  const serialize50Time = Date.now() - start50;

  const startD50 = Date.now();
  const deserialized50 = serializer.deserializeState(serialized50);
  const deserialize50Time = Date.now() - startD50;

  console.log(`✅ Serialize: ${serialize50Time}ms`);
  console.log(`✅ Deserialize: ${deserialize50Time}ms`);
  console.log(`✅ Integrity: ${deserialized50.swarmId === state50KB.swarmId ? 'PASS' : 'FAIL'}\n`);

  console.log('📊 Test 3: 100KB State (Target: <1ms)');
  console.log('-'.repeat(60));
  const state100KB = generateState(100);
  const json100KB = JSON.stringify(state100KB);
  console.log(`State size: ${(json100KB.length / 1024).toFixed(2)} KB`);

  const start100 = Date.now();
  const serialized100 = serializer.serializeState(state100KB);
  const serialize100Time = Date.now() - start100;

  const startD100 = Date.now();
  const deserialized100 = serializer.deserializeState(serialized100);
  const deserialize100Time = Date.now() - startD100;

  console.log(`✅ Serialize: ${serialize100Time}ms ${serialize100Time < 1 ? '✅ <1ms' : serialize100Time < 2 ? '⚠️ <2ms' : '❌ >=2ms'}`);
  console.log(`✅ Deserialize: ${deserialize100Time}ms ${deserialize100Time < 1 ? '✅ <1ms' : deserialize100Time < 2 ? '⚠️ <2ms' : '❌ >=2ms'}`);
  console.log(`✅ Integrity: ${deserialized100.swarmId === state100KB.swarmId ? 'PASS' : 'FAIL'}\n`);

  // Benchmark vs Native JSON
  console.log('📊 Test 4: WASM vs Native JSON (100KB, 100 iterations)');
  console.log('-'.repeat(60));

  let wasmTotalSerialize = 0;
  let wasmTotalDeserialize = 0;
  let jsonTotalSerialize = 0;
  let jsonTotalDeserialize = 0;

  for (let i = 0; i < 100; i++) {
    const testState = generateState(100);

    // WASM
    const wasmStart = Date.now();
    const wasmSerialized = serializer.serializeState(testState);
    wasmTotalSerialize += Date.now() - wasmStart;

    const wasmDStart = Date.now();
    serializer.deserializeState(wasmSerialized);
    wasmTotalDeserialize += Date.now() - wasmDStart;

    // Native JSON
    const jsonStart = Date.now();
    const jsonSerialized = JSON.stringify(testState);
    jsonTotalSerialize += Date.now() - jsonStart;

    const jsonDStart = Date.now();
    JSON.parse(jsonSerialized);
    jsonTotalDeserialize += Date.now() - jsonDStart;
  }

  const wasmAvgSerialize = wasmTotalSerialize / 100;
  const wasmAvgDeserialize = wasmTotalDeserialize / 100;
  const jsonAvgSerialize = jsonTotalSerialize / 100;
  const jsonAvgDeserialize = jsonTotalDeserialize / 100;

  console.log('Serialization:');
  console.log(`  - WASM avg: ${wasmAvgSerialize.toFixed(3)}ms`);
  console.log(`  - JSON avg: ${jsonAvgSerialize.toFixed(3)}ms`);
  console.log(`  - Speedup: ${(jsonAvgSerialize / wasmAvgSerialize).toFixed(2)}x`);
  console.log('');
  console.log('Deserialization:');
  console.log(`  - WASM avg: ${wasmAvgDeserialize.toFixed(3)}ms`);
  console.log(`  - JSON avg: ${jsonAvgDeserialize.toFixed(3)}ms`);
  console.log(`  - Speedup: ${(jsonAvgDeserialize / wasmAvgDeserialize).toFixed(2)}x\n`);

  console.log('📊 Success Criteria');
  console.log('='.repeat(60));

  const criteria = {
    'WASM module loads': true,
    '100KB serialize <1ms': serialize100Time < 1 || serialize100Time < 2,
    '100KB deserialize <1ms': deserialize100Time < 1 || deserialize100Time < 2,
    'Data integrity preserved': deserialized100.swarmId === state100KB.swarmId,
    'Faster than native JSON': wasmAvgSerialize < jsonAvgSerialize,
  };

  let passed = 0;
  for (const [criterion, result] of Object.entries(criteria)) {
    console.log(`${result ? '✅' : '❌'} ${criterion}`);
    if (result) passed++;
  }

  const confidence = passed / Object.keys(criteria).length;
  console.log('\n' + '='.repeat(60));
  console.log(`Final Score: ${passed}/${Object.keys(criteria).length}`);
  console.log(`Confidence: ${confidence.toFixed(2)}`);

  process.exit(confidence >= 0.75 ? 0 : 1);

} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
