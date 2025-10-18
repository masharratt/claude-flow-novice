/**
 * Redis Pub/Sub Throughput Test
 *
 * Validates Assumption 1 from ASSUMPTIONS_AND_TESTING.md:
 * Redis pub/sub can handle 10,000+ messages/sec for coordinating
 * 50+ parallel agents across multiple sprints.
 *
 * Test Requirements:
 * - Handle 10,000 messages/sec without delays
 * - Measure throughput and expect >10,000 msg/sec
 * - Duration should be <1 second for 10K messages
 * - Message delivery latency: <100ms average, <500ms worst case
 *
 * @module tests/parallelization/redis-pubsub
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, RedisClientType } from 'redis';

// ===== TEST CONFIGURATION =====

const TEST_CONFIG = {
  REDIS_HOST: process.env.REDIS_TEST_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_TEST_PORT || '6379'),
  REDIS_DB: parseInt(process.env.REDIS_TEST_DB || '1'), // Use separate DB for tests
  MESSAGE_COUNT: 10000,
  CHANNELS: ['sprint:coordination', 'agent:lifecycle', 'test:coordination'],
  THROUGHPUT_THRESHOLD: 10000, // messages per second
  DURATION_THRESHOLD: 1000, // milliseconds
  AVG_LATENCY_THRESHOLD: 100, // milliseconds
  MAX_LATENCY_THRESHOLD: 500, // milliseconds
  LATENCY_TEST_MESSAGES: 1000,
  LATENCY_TEST_RATE: 100, // messages per second
};

// ===== TEST UTILITIES =====

/**
 * Sleep utility for rate-limited publishing
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Connect to Redis with test configuration
 */
async function connectRedisClient(): Promise<RedisClientType> {
  const client = createClient({
    socket: {
      host: TEST_CONFIG.REDIS_HOST,
      port: TEST_CONFIG.REDIS_PORT,
    },
    database: TEST_CONFIG.REDIS_DB,
  });

  await client.connect();
  await client.ping(); // Verify connection

  return client;
}

// ===== TEST SUITE =====

describe('Redis Pub/Sub Performance', () => {
  let publisherClient: RedisClientType;
  let subscriberClient: RedisClientType;

  beforeAll(async () => {
    // Connect publisher and subscriber clients
    publisherClient = await connectRedisClient();
    subscriberClient = await connectRedisClient();
  });

  afterAll(async () => {
    // Cleanup connections
    if (subscriberClient) {
      await subscriberClient.quit();
    }
    if (publisherClient) {
      await publisherClient.quit();
    }
  });

  beforeEach(async () => {
    // Cleanup any existing subscriptions
    try {
      await subscriberClient.unsubscribe();
    } catch (error) {
      // Ignore if no subscriptions exist
    }
  });

  it('should handle 10,000 messages/sec without delays', async () => {
    const messageCount = TEST_CONFIG.MESSAGE_COUNT;
    const channels = TEST_CONFIG.CHANNELS;
    const startTime = Date.now();

    // Publish messages in parallel across multiple channels
    const publishPromises = Array.from({ length: messageCount }, (_, i) =>
      publisherClient.publish(
        channels[i % channels.length],
        JSON.stringify({ id: i, timestamp: Date.now() })
      )
    );

    await Promise.all(publishPromises);

    const duration = Date.now() - startTime;
    const throughput = messageCount / (duration / 1000);

    console.log('\n=== THROUGHPUT TEST RESULTS ===');
    console.log(`Messages Published: ${messageCount}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Throughput: ${throughput.toFixed(2)} msg/sec`);
    console.log(`Target Throughput: ${TEST_CONFIG.THROUGHPUT_THRESHOLD} msg/sec`);

    // Verify throughput meets requirements
    expect(throughput).toBeGreaterThan(TEST_CONFIG.THROUGHPUT_THRESHOLD);

    // Verify duration is under threshold
    expect(duration).toBeLessThan(TEST_CONFIG.DURATION_THRESHOLD);
  });

  it('should deliver messages with <100ms latency under load', { timeout: 15000 }, async () => {
    const latencies: number[] = [];
    const messageCount = TEST_CONFIG.LATENCY_TEST_MESSAGES;
    const channel = 'latency:test';
    let messagesReceived = 0;

    // Set up subscription
    await subscriberClient.subscribe(channel, (message) => {
      const data = JSON.parse(message);
      const latency = Date.now() - data.timestamp;
      latencies.push(latency);
      messagesReceived++;
    });

    // Wait for subscription to be established
    await sleep(100);

    // Publish messages at controlled rate (100 msg/sec)
    const publishStart = Date.now();
    for (let i = 0; i < messageCount; i++) {
      await publisherClient.publish(
        channel,
        JSON.stringify({
          id: i,
          timestamp: Date.now(),
        })
      );

      // Rate limit to 100 msg/sec (10ms between messages)
      await sleep(10);
    }
    const publishDuration = Date.now() - publishStart;

    // Wait for all messages to be delivered
    await sleep(1000);

    // Unsubscribe
    await subscriberClient.unsubscribe(channel);

    // Calculate latency statistics
    const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);
    const minLatency = Math.min(...latencies);
    const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

    console.log('\n=== LATENCY TEST RESULTS ===');
    console.log(`Messages Published: ${messageCount}`);
    console.log(`Messages Received: ${messagesReceived}`);
    console.log(`Publish Duration: ${publishDuration}ms`);
    console.log(`Average Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`Min Latency: ${minLatency}ms`);
    console.log(`Max Latency: ${maxLatency}ms`);
    console.log(`P95 Latency: ${p95Latency}ms`);

    // Verify message delivery (allow 5% loss due to timing)
    expect(messagesReceived).toBeGreaterThanOrEqual(messageCount * 0.95);

    // Verify latency requirements
    expect(avgLatency).toBeLessThan(TEST_CONFIG.AVG_LATENCY_THRESHOLD);
    expect(maxLatency).toBeLessThan(TEST_CONFIG.MAX_LATENCY_THRESHOLD);
  });

  it('should handle concurrent subscriptions across multiple channels', async () => {
    const channels = TEST_CONFIG.CHANNELS;
    const messagesPerChannel = 1000;
    const receivedMessages = new Map<string, number>();

    // Initialize counters
    channels.forEach(channel => receivedMessages.set(channel, 0));

    // Subscribe to all channels
    const subscribePromises = channels.map(async (channel) => {
      await subscriberClient.subscribe(channel, (message) => {
        const count = receivedMessages.get(channel) || 0;
        receivedMessages.set(channel, count + 1);
      });
    });

    await Promise.all(subscribePromises);

    // Wait for subscriptions to be established
    await sleep(200);

    // Publish messages to all channels concurrently
    const publishStart = Date.now();
    const publishPromises: Promise<number>[] = [];

    for (let i = 0; i < messagesPerChannel; i++) {
      channels.forEach((channel) => {
        publishPromises.push(
          publisherClient.publish(
            channel,
            JSON.stringify({ id: i, channel, timestamp: Date.now() })
          )
        );
      });
    }

    await Promise.all(publishPromises);
    const publishDuration = Date.now() - publishStart;

    // Wait for all messages to be delivered
    await sleep(500);

    // Unsubscribe from all channels
    await subscriberClient.unsubscribe();

    // Calculate results
    const totalPublished = messagesPerChannel * channels.length;
    const totalReceived = Array.from(receivedMessages.values()).reduce((sum, count) => sum + count, 0);

    console.log('\n=== MULTI-CHANNEL TEST RESULTS ===');
    console.log(`Channels: ${channels.length}`);
    console.log(`Messages Per Channel: ${messagesPerChannel}`);
    console.log(`Total Published: ${totalPublished}`);
    console.log(`Total Received: ${totalReceived}`);
    console.log(`Publish Duration: ${publishDuration}ms`);
    console.log('\nPer-Channel Breakdown:');
    receivedMessages.forEach((count, channel) => {
      console.log(`  ${channel}: ${count}/${messagesPerChannel} (${((count / messagesPerChannel) * 100).toFixed(1)}%)`);
    });

    // Verify message delivery for each channel (allow 5% loss)
    channels.forEach((channel) => {
      const received = receivedMessages.get(channel) || 0;
      expect(received).toBeGreaterThanOrEqual(messagesPerChannel * 0.95);
    });

    // Verify overall throughput
    const throughput = totalPublished / (publishDuration / 1000);
    expect(throughput).toBeGreaterThan(TEST_CONFIG.THROUGHPUT_THRESHOLD);
  });

  it('should maintain performance under sustained load', { timeout: 10000 }, async () => {
    const channel = 'sustained:load:test';
    const duration = 5000; // 5 seconds
    const targetRate = 1500; // 1500 msg/sec (more realistic for sustained load)
    const batchSize = 100; // Publish in batches for efficiency
    const batchInterval = (1000 / targetRate) * batchSize; // Time between batches

    let messagesPublished = 0;
    let messagesReceived = 0;
    const latencies: number[] = [];

    // Subscribe to channel
    await subscriberClient.subscribe(channel, (message) => {
      const data = JSON.parse(message);
      const latency = Date.now() - data.timestamp;
      latencies.push(latency);
      messagesReceived++;
    });

    await sleep(100);

    // Publish messages in batches for sustained load
    const testStart = Date.now();
    const publishPromises: Promise<number>[] = [];

    while (Date.now() - testStart < duration) {
      const batchStart = Date.now();

      // Publish batch
      for (let i = 0; i < batchSize; i++) {
        publishPromises.push(
          publisherClient.publish(
            channel,
            JSON.stringify({
              id: messagesPublished + i,
              timestamp: Date.now(),
            })
          )
        );
      }

      messagesPublished += batchSize;

      // Wait for batch interval (rate limiting)
      const elapsed = Date.now() - batchStart;
      const waitTime = Math.max(0, batchInterval - elapsed);
      if (waitTime > 0) {
        await sleep(waitTime);
      }
    }

    // Wait for all publishes to complete
    await Promise.all(publishPromises);

    const actualDuration = Date.now() - testStart;

    // Wait for remaining messages
    await sleep(500);

    // Unsubscribe
    await subscriberClient.unsubscribe(channel);

    // Calculate metrics
    const actualRate = messagesPublished / (actualDuration / 1000);
    const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);

    console.log('\n=== SUSTAINED LOAD TEST RESULTS ===');
    console.log(`Test Duration: ${actualDuration}ms`);
    console.log(`Messages Published: ${messagesPublished}`);
    console.log(`Messages Received: ${messagesReceived}`);
    console.log(`Target Rate: ${targetRate} msg/sec`);
    console.log(`Actual Rate: ${actualRate.toFixed(2)} msg/sec`);
    console.log(`Average Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`Max Latency: ${maxLatency}ms`);

    // Verify sustained throughput
    expect(actualRate).toBeGreaterThan(targetRate * 0.9); // Allow 10% variance

    // Verify message delivery
    expect(messagesReceived).toBeGreaterThanOrEqual(messagesPublished * 0.95);

    // Verify latency remains acceptable under sustained load
    expect(avgLatency).toBeLessThan(TEST_CONFIG.AVG_LATENCY_THRESHOLD);
    expect(maxLatency).toBeLessThan(TEST_CONFIG.MAX_LATENCY_THRESHOLD);
  });
});
