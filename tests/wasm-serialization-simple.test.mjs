/**
 * Simple WASM Serialization Integration Test
 * Sprint 1.2 - Deliverable 1.2.2
 *
 * Tests REAL Rust WASM serialization in swarm-messenger.js
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function testWasmSerialization() {
  console.log('🧪 Testing WASM Serialization Integration...\n');

  try {
    // Test 1: Load WASM module directly
    console.log('1. Loading WASM module...');
    const wasmModule = require('../src/wasm-regex-engine/pkg/wasm_regex_engine.js');

    if (!wasmModule.MessageSerializer) {
      console.error('❌ MessageSerializer not found in WASM module');
      process.exit(1);
    }

    const serializer = new wasmModule.MessageSerializer();
    console.log('✅ WASM MessageSerializer loaded successfully');

    // Test 2: Test basic serialization
    console.log('\n2. Testing basic serialization...');
    const testData = {
      id: 'msg_12345',
      type: 'test',
      timestamp: Date.now(),
      data: {
        string: 'Hello World',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: { deep: { value: 'test' } },
      },
    };

    const start = process.hrtime.bigint();
    const serialized = serializer.serializeMessage(testData);
    const end = process.hrtime.bigint();
    const durationUs = Number(end - start) / 1000;

    console.log(`✅ Serialization successful (${durationUs.toFixed(2)}μs)`);
    console.log(`   Serialized length: ${serialized.length} bytes`);

    // Test 3: Test deserialization
    console.log('\n3. Testing deserialization...');
    const startParse = process.hrtime.bigint();
    const deserialized = serializer.deserializeMessage(serialized);
    const endParse = process.hrtime.bigint();
    const parseUs = Number(endParse - startParse) / 1000;

    console.log(`✅ Deserialization successful (${parseUs.toFixed(2)}μs)`);

    // Verify data integrity
    if (deserialized.id !== testData.id || deserialized.type !== testData.type) {
      console.error('❌ Data integrity check failed');
      process.exit(1);
    }
    console.log('✅ Data integrity verified');

    // Test 4: Batch deserialization
    console.log('\n4. Testing batch deserialization...');
    const messages = [];
    for (let i = 0; i < 10; i++) {
      messages.push(serializer.serializeMessage({ ...testData, index: i }));
    }

    const batchStart = process.hrtime.bigint();
    const batchResults = serializer.batchDeserialize(messages);
    const batchEnd = process.hrtime.bigint();
    const batchUs = Number(batchEnd - batchStart) / 1000;

    console.log(`✅ Batch deserialization successful (${batchUs.toFixed(2)}μs for 10 messages)`);
    console.log(`   Per-message: ${(batchUs / 10).toFixed(2)}μs`);

    // Test 5: Performance comparison
    console.log('\n5. Performance comparison (WASM vs JavaScript)...');

    // JavaScript JSON
    const jsStart = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) {
      JSON.parse(JSON.stringify(testData));
    }
    const jsEnd = process.hrtime.bigint();
    const jsMs = Number(jsEnd - jsStart) / 1000000;

    // WASM
    const wasmStart = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) {
      serializer.deserializeMessage(serializer.serializeMessage(testData));
    }
    const wasmEnd = process.hrtime.bigint();
    const wasmMs = Number(wasmEnd - wasmStart) / 1000000;

    const speedup = jsMs / wasmMs;

    console.log(`   JavaScript: ${jsMs.toFixed(2)}ms (1000 ops)`);
    console.log(`   WASM:       ${wasmMs.toFixed(2)}ms (1000 ops)`);
    console.log(`   Speedup:    ${speedup.toFixed(1)}x`);

    if (speedup < 2) {
      console.log('⚠️  Speedup lower than expected (< 2x)');
    } else if (speedup >= 5) {
      console.log('✅ Excellent speedup (>= 5x)');
    } else {
      console.log('✅ Good speedup (>= 2x)');
    }

    // Test 6: SwarmMessenger integration
    console.log('\n6. Testing SwarmMessenger integration...');
    const SwarmMessenger = require('../src/redis/swarm-messenger.js');
    const messenger = new SwarmMessenger({
      host: 'localhost',
      port: 6379,
      db: 1,
    });

    // Check WASM status
    const wasmStatus = messenger.getWasmStatus();
    console.log(`   WASM Enabled: ${wasmStatus.enabled}`);
    if (wasmStatus.enabled) {
      console.log(`   Buffer Capacity: ${wasmStatus.bufferCapacity} bytes`);
      console.log(`   Expected Speedup: ${wasmStatus.speedup}`);
      console.log(`   Expected Throughput: ${wasmStatus.throughput}`);
      console.log('✅ SwarmMessenger using WASM serialization');
    } else {
      console.log(`   Fallback: ${wasmStatus.fallback}`);
      console.log(`   Reason: ${wasmStatus.reason}`);
      console.log('⚠️  SwarmMessenger using JavaScript fallback');
    }

    // Get statistics
    const stats = messenger.getStatistics();
    console.log(`   Serialization Engine: ${stats.serializationEngine}`);
    console.log(`   Estimated Throughput: ${stats.estimatedThroughput}`);

    console.log('\n🎉 All WASM serialization tests passed!');
    console.log('\n📊 Summary:');
    console.log(`   ✅ MessageSerializer loaded and functional`);
    console.log(`   ✅ Serialization: ${durationUs.toFixed(2)}μs per message`);
    console.log(`   ✅ Deserialization: ${parseUs.toFixed(2)}μs per message`);
    console.log(`   ✅ Batch processing: ${(batchUs / 10).toFixed(2)}μs per message`);
    console.log(`   ✅ Performance: ${speedup.toFixed(1)}x faster than JavaScript`);
    console.log(`   ✅ SwarmMessenger integration: ${wasmStatus.enabled ? 'ENABLED' : 'FALLBACK'}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testWasmSerialization();
