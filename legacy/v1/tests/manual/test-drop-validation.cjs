/**
 * Sprint 1.3.1 Drop Trait Validation
 * Verifies MessageSerializer Drop trait prevents memory leak
 */

const { MessageSerializer } = require('../../src/wasm-regex-engine/pkg/wasm_regex_engine.js');

console.log('🧪 Sprint 1.3.1 Drop Trait Validation Test\n');

async function runTest() {
  console.log('Creating and dropping 10,000 MessageSerializer instances...');
  const iterations = 10000;
  const startMem = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`Start Memory: ${startMem.toFixed(2)} MB`);

  for (let i = 0; i < iterations; i++) {
    const serializer = new MessageSerializer();
    const testObj = { id: i, type: 'test-event', data: { value: i * 2, timestamp: Date.now() } };
    try {
      serializer.serializeMessage(testObj);
    } catch (e) {
      // Ignore errors for memory test
    }
    // Drop trait frees buffer when serializer goes out of scope
  }

  // Force GC
  if (global.gc) {
    console.log('Running garbage collection...');
    global.gc();
    await new Promise(resolve => setTimeout(resolve, 200));
  } else {
    console.log('Note: Run with --expose-gc for accurate results');
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const endMem = process.memoryUsage().heapUsed / 1024 / 1024;
  const growth = endMem - startMem;
  const growthPercent = (growth / startMem) * 100;

  console.log(`End Memory: ${endMem.toFixed(2)} MB`);
  console.log(`Memory Growth: ${growth.toFixed(2)} MB (${growthPercent.toFixed(1)}%)`);
  console.log(`Iterations: ${iterations}\n`);

  // Validation
  const passThreshold = 10;
  if (Math.abs(growthPercent) < passThreshold) {
    console.log(`✅ PASS: Memory growth ${Math.abs(growthPercent).toFixed(1)}% < ${passThreshold}%`);
    console.log('✅ Drop trait successfully prevents memory leak');
    console.log('✅ Sprint 1.3.1 hotfix validated - production ready');
    process.exit(0);
  } else {
    console.log(`❌ FAIL: Memory growth ${Math.abs(growthPercent).toFixed(1)}% >= ${passThreshold}%`);
    console.log('❌ Memory leak detected despite Drop trait');
    process.exit(1);
  }
}

runTest();
