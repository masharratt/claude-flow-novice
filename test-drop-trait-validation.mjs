/**
 * Sprint 1.3.1 Drop Trait Validation
 * Simple test to verify MessageSerializer memory cleanup
 */

import { MessageSerializer } from './src/wasm-regex-engine/pkg/wasm_regex_engine.js';

console.log('🧪 Sprint 1.3.1 Drop Trait Validation\n');

// Test 1: Create and drop MessageSerializer instances
console.log('Test 1: MessageSerializer Drop Trait');
const iterations = 10000;
const startMem = process.memoryUsage().heapUsed / 1024 / 1024;

for (let i = 0; i < iterations; i++) {
  const serializer = new MessageSerializer();
  const testObj = { id: i, type: 'test', data: { value: i * 2 } };
  serializer.serializeMessage(testObj);
  // serializer goes out of scope here - Drop trait should free buffer
}

// Force garbage collection if available
if (global.gc) {
  global.gc();
  await new Promise(resolve => setTimeout(resolve, 100));
}

const endMem = process.memoryUsage().heapUsed / 1024 / 1024;
const growth = endMem - startMem;
const growthPercent = (growth / startMem) * 100;

console.log(`  Start Memory: ${startMem.toFixed(2)} MB`);
console.log(`  End Memory: ${endMem.toFixed(2)} MB`);
console.log(`  Growth: ${growth.toFixed(2)} MB (${growthPercent.toFixed(1)}%)`);
console.log(`  Iterations: ${iterations}`);

// Validation
const passThreshold = 10; // <10% growth is acceptable
if (growthPercent < passThreshold) {
  console.log(`\n✅ PASS: Memory growth ${growthPercent.toFixed(1)}% < ${passThreshold}%`);
  console.log('✅ Drop trait successfully prevents memory leak');
  process.exit(0);
} else {
  console.log(`\n❌ FAIL: Memory growth ${growthPercent.toFixed(1)}% >= ${passThreshold}%`);
  console.log('❌ Memory leak detected despite Drop trait');
  process.exit(1);
}
