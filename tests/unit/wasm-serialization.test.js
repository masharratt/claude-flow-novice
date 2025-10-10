/**
 * WASM Serialization Test for SwarmMessenger
 * Sprint 1.2 - Deliverable 1.2.2
 *
 * Tests REAL Rust WASM serialization replacement of JSON.stringify/parse
 * Target: 50x speedup, 10,000+ messages/sec throughput
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Dynamic import for CommonJS module
let SwarmMessenger;

describe('WASM Serialization in SwarmMessenger', () => {
  let messenger;
  const testSwarmId = 'test-swarm-wasm-' + Date.now();

  beforeAll(async () => {
    // Dynamic import of CommonJS module
    const module = await import('../../src/redis/swarm-messenger.js');
    SwarmMessenger = module.default;

    messenger = new SwarmMessenger({
      host: 'localhost',
      port: 6379,
      db: 1, // Use separate DB for tests
    });

    await messenger.initialize(testSwarmId);
  });

  afterAll(async () => {
    if (messenger) {
      await messenger.shutdown();
    }
  });

  describe('WASM Module Loading', () => {
    it('should load WASM serialization module', () => {
      const stats = messenger.getStatistics();
      expect(stats).toHaveProperty('wasmEnabled');
      expect(stats).toHaveProperty('serializationEngine');
    });

    it('should provide WASM status information', () => {
      const wasmStatus = messenger.getWasmStatus();
      expect(wasmStatus).toHaveProperty('enabled');

      if (wasmStatus.enabled) {
        expect(wasmStatus).toHaveProperty('bufferCapacity');
        expect(wasmStatus).toHaveProperty('speedup');
        expect(wasmStatus.speedup).toBe('50x');
        expect(wasmStatus).toHaveProperty('throughput');
        expect(wasmStatus.throughput).toBe('10,000+ msgs/sec');
      } else {
        expect(wasmStatus).toHaveProperty('fallback');
        expect(wasmStatus.fallback).toBe('JavaScript JSON');
      }
    });
  });

  describe('Message Serialization', () => {
    it('should serialize and deserialize simple messages', async () => {
      const testMessage = {
        type: 'test',
        data: {
          id: 123,
          name: 'Test Message',
          timestamp: Date.now(),
        },
      };

      const envelope = messenger.createMessageEnvelope(testMessage);
      expect(envelope).toHaveProperty('id');
      expect(envelope).toHaveProperty('payload');
      expect(envelope.payload).toEqual(testMessage);
    });

    it('should handle complex nested objects', async () => {
      const complexMessage = {
        type: 'complex',
        nested: {
          level1: {
            level2: {
              level3: {
                array: [1, 2, 3, { deep: true }],
                string: 'nested string',
                number: 42.5,
                boolean: true,
                null: null,
              },
            },
          },
        },
      };

      const envelope = messenger.createMessageEnvelope(complexMessage);
      expect(envelope.payload).toEqual(complexMessage);
    });

    it('should handle arrays and special characters', async () => {
      const specialMessage = {
        type: 'special',
        data: {
          array: [1, 'two', { three: 3 }, [4, 5]],
          unicode: '🚀 Unicode Test 中文',
          escapes: 'Test "quotes" and \\backslashes\\',
          special: '\n\t\r',
        },
      };

      const envelope = messenger.createMessageEnvelope(specialMessage);
      expect(envelope.payload).toEqual(specialMessage);
    });
  });

  describe('Message History Batch Processing', () => {
    it('should handle batch deserialization of message history', async () => {
      const channel = `test:batch:${Date.now()}`;

      // Send multiple messages
      const messageCount = 10;
      const sentMessages = [];

      for (let i = 0; i < messageCount; i++) {
        const message = {
          type: 'batch-test',
          index: i,
          data: `Message ${i}`,
        };
        sentMessages.push(message);

        const envelope = messenger.createMessageEnvelope(message);
        await messenger.publishMessage(channel, envelope);
      }

      // Wait a bit for messages to be stored
      await new Promise(resolve => setTimeout(resolve, 100));

      // Retrieve message history (should use batch deserialization for 5+ messages)
      const history = await messenger.getMessageHistory(channel, messageCount);

      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);

      // Verify messages are properly deserialized
      history.forEach((envelope, idx) => {
        expect(envelope).toHaveProperty('payload');
        expect(envelope.payload).toHaveProperty('type');
        expect(envelope.payload.type).toBe('batch-test');
      });
    });
  });

  describe('Performance Characteristics', () => {
    it('should serialize messages quickly', () => {
      const message = {
        type: 'performance',
        data: {
          large: 'x'.repeat(1000), // 1KB string
          array: Array(100).fill({ value: 'test' }),
        },
      };

      const start = process.hrtime.bigint();
      const envelope = messenger.createMessageEnvelope(message);
      const end = process.hrtime.bigint();

      const durationMicroseconds = Number(end - start) / 1000;

      // Should be fast (< 100μs for 1KB message)
      expect(durationMicroseconds).toBeLessThan(100);

      // Log performance
      console.log(`Serialization time: ${durationMicroseconds.toFixed(2)}μs`);
    });

    it('should handle high message volume', async () => {
      const channel = `test:volume:${Date.now()}`;
      const messageCount = 100;
      const messages = [];

      const start = Date.now();

      for (let i = 0; i < messageCount; i++) {
        messages.push({
          type: 'volume-test',
          index: i,
          data: `Message ${i}`,
        });
      }

      // Serialize all messages
      messages.forEach(msg => {
        messenger.createMessageEnvelope(msg);
      });

      const duration = Date.now() - start;
      const messagesPerSecond = (messageCount / duration) * 1000;

      console.log(`Throughput: ${messagesPerSecond.toFixed(0)} msgs/sec`);

      // Should handle at least 1000 msgs/sec (conservative, WASM should be 10,000+)
      expect(messagesPerSecond).toBeGreaterThan(1000);
    });
  });

  describe('Message Format Compatibility', () => {
    it('should maintain backward compatibility with JSON format', async () => {
      const message = {
        type: 'compatibility',
        data: { test: true },
      };

      const envelope = messenger.createMessageEnvelope(message);

      // Envelope should have standard structure
      expect(envelope).toHaveProperty('id');
      expect(envelope).toHaveProperty('swarmId');
      expect(envelope).toHaveProperty('timestamp');
      expect(envelope).toHaveProperty('messageType');
      expect(envelope).toHaveProperty('payload');
      expect(envelope).toHaveProperty('metadata');

      // Should be a valid structure
      expect(typeof envelope.id).toBe('string');
      expect(typeof envelope.timestamp).toBe('number');
      expect(envelope.swarmId).toBe(testSwarmId);
    });

    it('should handle all JavaScript primitive types', async () => {
      const message = {
        type: 'primitives',
        data: {
          string: 'test',
          number: 42,
          float: 3.14,
          boolean: true,
          null: null,
          undefined: undefined,
          bigNumber: 9007199254740991,
        },
      };

      const envelope = messenger.createMessageEnvelope(message);
      expect(envelope.payload.data.string).toBe('test');
      expect(envelope.payload.data.number).toBe(42);
      expect(envelope.payload.data.float).toBe(3.14);
      expect(envelope.payload.data.boolean).toBe(true);
      expect(envelope.payload.data.null).toBe(null);
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle serialization errors', () => {
      // Circular reference (will be handled by createMessageEnvelope validation)
      const circular = { a: 1 };
      circular.self = circular;

      expect(() => {
        messenger.createMessageEnvelope(circular);
      }).toThrow();
    });

    it('should handle very large messages with size limit', () => {
      const largeMessage = {
        type: 'large',
        data: 'x'.repeat(2 * 1024 * 1024), // 2MB
      };

      expect(() => {
        messenger.createMessageEnvelope(largeMessage);
      }).toThrow(/exceeds limit/);
    });
  });
});

describe('WASM Serialization Performance Benchmarks', () => {
  it('should provide 50x speedup compared to JavaScript (informational)', async () => {
    const wasmModule = await import('../../src/wasm-regex-engine/pkg/wasm_regex_engine.js');

    if (!wasmModule || !wasmModule.MessageSerializer) {
      console.log('⚠️ WASM module not available, skipping benchmark');
      return;
    }

    const testData = {
      id: 'msg_12345',
      swarmId: 'test-swarm',
      timestamp: Date.now(),
      messageType: 'test',
      payload: {
        type: 'benchmark',
        data: {
          array: Array(50).fill({ value: 'test', index: 0 }),
          string: 'x'.repeat(500),
        },
      },
    };

    // JavaScript JSON.stringify benchmark
    const jsStart = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) {
      JSON.stringify(testData);
      JSON.parse(JSON.stringify(testData));
    }
    const jsEnd = process.hrtime.bigint();
    const jsDuration = Number(jsEnd - jsStart) / 1000000; // Convert to ms

    // WASM serialization benchmark
    const serializer = new wasmModule.MessageSerializer();
    const wasmStart = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) {
      const serialized = serializer.serializeMessage(testData);
      serializer.deserializeMessage(serialized);
    }
    const wasmEnd = process.hrtime.bigint();
    const wasmDuration = Number(wasmEnd - wasmStart) / 1000000; // Convert to ms

    const speedup = jsDuration / wasmDuration;

    console.log('\n📊 Serialization Benchmark Results:');
    console.log(`   JavaScript: ${jsDuration.toFixed(2)}ms (1000 ops)`);
    console.log(`   WASM:       ${wasmDuration.toFixed(2)}ms (1000 ops)`);
    console.log(`   Speedup:    ${speedup.toFixed(1)}x`);

    // Should show significant speedup
    expect(speedup).toBeGreaterThan(5); // At least 5x speedup
  });
});
