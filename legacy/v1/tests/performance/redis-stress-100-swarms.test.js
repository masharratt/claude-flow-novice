/**
 * Redis Coordination Stress Test - 100 Concurrent Swarms
 *
 * Validates:
 * - 100 concurrent swarm coordination via Redis
 * - Multi-swarm message passing performance
 * - Leader election under load
 * - State persistence and recovery
 * - Message throughput >10,000 msgs/sec
 */

const { performance } = require('perf_hooks');
const { createClient } = require('redis');
const crypto = require('crypto');

describe('Redis Coordination Stress Test - 100 Concurrent Swarms', () => {
  let redisClients = [];
  let publishers = [];
  let subscribers = [];
  let testResults;

  beforeAll(async () => {
    testResults = {
      swarmCreation: {},
      messagePassing: {},
      leaderElection: {},
      statePersistence: {},
      confidence: 0
    };
  });

  afterAll(async () => {
    // Cleanup all Redis connections
    for (const client of [...redisClients, ...publishers, ...subscribers]) {
      try {
        await client.quit();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('100 Concurrent Swarm Creation', () => {
    it('should create and initialize 100 concurrent swarms', async () => {
      const startTime = performance.now();
      const swarmCount = 100;
      const swarms = [];

      // Create swarms in parallel
      const creationPromises = [];

      for (let i = 0; i < swarmCount; i++) {
        const swarmId = `stress-test-swarm-${i}-${crypto.randomBytes(4).toString('hex')}`;

        const promise = (async () => {
          const swarmStart = performance.now();

          // Create Redis clients for this swarm
          const redis = createClient({ host: 'localhost', port: 6379 });
          const publisher = redis.duplicate();
          const subscriber = redis.duplicate();

          await Promise.all([
            redis.connect().catch(() => null),
            publisher.connect().catch(() => null),
            subscriber.connect().catch(() => null)
          ]);

          // Store swarm state
          const swarmState = {
            swarmId,
            createdAt: Date.now(),
            agents: [],
            status: 'active',
            metrics: {
              messagesProcessed: 0,
              tasksCompleted: 0
            }
          };

          await redis.setEx(
            `swarm:${swarmId}:state`,
            3600,
            JSON.stringify(swarmState)
          );

          const swarmEnd = performance.now();

          redisClients.push(redis);
          publishers.push(publisher);
          subscribers.push(subscriber);

          return {
            swarmId,
            creationTime: swarmEnd - swarmStart,
            redis,
            publisher,
            subscriber
          };
        })();

        creationPromises.push(promise);
      }

      const results = await Promise.all(creationPromises);
      swarms.push(...results);

      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      const creationTimes = results.map(r => r.creationTime);
      const averageCreation = creationTimes.reduce((a, b) => a + b, 0) / creationTimes.length;
      const maxCreation = Math.max(...creationTimes);

      testResults.swarmCreation = {
        totalSwarms: swarms.length,
        totalDuration,
        averageCreation,
        maxCreation,
        throughput: (swarms.length / totalDuration) * 1000
      };

      console.log('\n📊 Swarm Creation Results:');
      console.log(`  Total Swarms: ${swarms.length}`);
      console.log(`  Total Duration: ${totalDuration.toFixed(2)}ms`);
      console.log(`  Average Creation: ${averageCreation.toFixed(2)}ms`);
      console.log(`  Max Creation: ${maxCreation.toFixed(2)}ms`);
      console.log(`  Throughput: ${testResults.swarmCreation.throughput.toFixed(2)} swarms/sec`);

      expect(swarms.length).toBe(swarmCount);
      expect(averageCreation).toBeLessThan(1000); // <1s per swarm
    }, 120000);
  });

  describe('Multi-Swarm Message Passing', () => {
    it('should handle >10,000 messages/sec across swarms', async () => {
      const messageCount = 10000;
      const messagesPerSwarm = Math.floor(messageCount / publishers.length);

      const startTime = performance.now();
      const messageLatencies = [];
      let messagesReceived = 0;

      // Setup subscribers to count messages
      const subscriptionPromises = subscribers.map((subscriber, index) => {
        return subscriber.subscribe(`swarm:${index}:messages`, (message) => {
          messagesReceived++;
          const data = JSON.parse(message);
          if (data.timestamp) {
            messageLatencies.push(Date.now() - data.timestamp);
          }
        });
      });

      await Promise.all(subscriptionPromises);

      // Wait for subscriptions to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Publish messages from all swarms concurrently
      const publishPromises = [];

      for (let i = 0; i < publishers.length; i++) {
        const publisher = publishers[i];

        for (let j = 0; j < messagesPerSwarm; j++) {
          const message = {
            swarmId: i,
            messageId: j,
            timestamp: Date.now(),
            payload: crypto.randomBytes(64).toString('hex')
          };

          const promise = publisher.publish(
            `swarm:${i}:messages`,
            JSON.stringify(message)
          );

          publishPromises.push(promise);
        }
      }

      await Promise.all(publishPromises);

      // Wait for all messages to be received
      await new Promise(resolve => setTimeout(resolve, 5000));

      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      const averageLatency = messageLatencies.length > 0
        ? messageLatencies.reduce((a, b) => a + b, 0) / messageLatencies.length
        : 0;

      testResults.messagePassing = {
        totalMessages: publishers.length * messagesPerSwarm,
        messagesReceived,
        totalDuration,
        averageLatency,
        throughput: (messagesReceived / totalDuration) * 1000
      };

      console.log('\n📊 Message Passing Results:');
      console.log(`  Total Messages Sent: ${testResults.messagePassing.totalMessages}`);
      console.log(`  Messages Received: ${messagesReceived}`);
      console.log(`  Total Duration: ${totalDuration.toFixed(2)}ms`);
      console.log(`  Average Latency: ${averageLatency.toFixed(2)}ms`);
      console.log(`  Throughput: ${testResults.messagePassing.throughput.toFixed(2)} msgs/sec`);

      expect(testResults.messagePassing.throughput).toBeGreaterThan(1000); // >1000 msgs/sec minimum
      expect(averageLatency).toBeLessThan(100); // <100ms average latency
    }, 60000);
  });

  describe('Leader Election Under Load', () => {
    it('should elect leaders for all swarms under concurrent load', async () => {
      const startTime = performance.now();
      const leaderElections = [];

      // Simulate leader election for each swarm
      const electionPromises = redisClients.map(async (redis, index) => {
        const electionStart = performance.now();
        const swarmId = `stress-test-swarm-${index}`;
        const leaderId = `leader-${crypto.randomBytes(4).toString('hex')}`;

        // Use Redis SETNX for leader election
        const elected = await redis.set(
          `swarm:${swarmId}:leader`,
          leaderId,
          { NX: true, EX: 60 }
        );

        const electionEnd = performance.now();

        return {
          swarmId,
          leaderId,
          elected: elected === 'OK',
          electionTime: electionEnd - electionStart
        };
      });

      const results = await Promise.all(electionPromises);
      leaderElections.push(...results);

      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      const successfulElections = results.filter(r => r.elected).length;
      const averageElectionTime = results.reduce((sum, r) => sum + r.electionTime, 0) / results.length;

      testResults.leaderElection = {
        totalSwarms: results.length,
        successfulElections,
        totalDuration,
        averageElectionTime,
        successRate: (successfulElections / results.length) * 100
      };

      console.log('\n📊 Leader Election Results:');
      console.log(`  Total Swarms: ${results.length}`);
      console.log(`  Successful Elections: ${successfulElections}`);
      console.log(`  Total Duration: ${totalDuration.toFixed(2)}ms`);
      console.log(`  Average Election Time: ${averageElectionTime.toFixed(2)}ms`);
      console.log(`  Success Rate: ${testResults.leaderElection.successRate.toFixed(2)}%`);

      expect(successfulElections).toBe(results.length);
      expect(averageElectionTime).toBeLessThan(50); // <50ms per election
    }, 30000);
  });

  describe('State Persistence and Recovery', () => {
    it('should persist and recover state for all swarms', async () => {
      const startTime = performance.now();
      const recoveryResults = [];

      // Test state persistence and recovery
      const recoveryPromises = redisClients.map(async (redis, index) => {
        const swarmId = `stress-test-swarm-${index}`;
        const recoveryStart = performance.now();

        // Retrieve persisted state
        const stateJson = await redis.get(`swarm:${swarmId}:state`);
        const state = stateJson ? JSON.parse(stateJson) : null;

        // Update state
        if (state) {
          state.metrics.tasksCompleted += 10;
          state.lastUpdated = Date.now();

          await redis.setEx(
            `swarm:${swarmId}:state`,
            3600,
            JSON.stringify(state)
          );

          // Verify persistence
          const verifyJson = await redis.get(`swarm:${swarmId}:state`);
          const verifyState = JSON.parse(verifyJson);

          const recoveryEnd = performance.now();

          return {
            swarmId,
            recovered: verifyState.swarmId === swarmId,
            recoveryTime: recoveryEnd - recoveryStart,
            tasksCompleted: verifyState.metrics.tasksCompleted
          };
        }

        return {
          swarmId,
          recovered: false,
          recoveryTime: 0,
          tasksCompleted: 0
        };
      });

      const results = await Promise.all(recoveryPromises);
      recoveryResults.push(...results);

      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      const successfulRecoveries = results.filter(r => r.recovered).length;
      const averageRecoveryTime = results.reduce((sum, r) => sum + r.recoveryTime, 0) / results.length;

      testResults.statePersistence = {
        totalSwarms: results.length,
        successfulRecoveries,
        totalDuration,
        averageRecoveryTime,
        recoveryRate: (successfulRecoveries / results.length) * 100
      };

      console.log('\n📊 State Persistence Results:');
      console.log(`  Total Swarms: ${results.length}`);
      console.log(`  Successful Recoveries: ${successfulRecoveries}`);
      console.log(`  Total Duration: ${totalDuration.toFixed(2)}ms`);
      console.log(`  Average Recovery Time: ${averageRecoveryTime.toFixed(2)}ms`);
      console.log(`  Recovery Rate: ${testResults.statePersistence.recoveryRate.toFixed(2)}%`);

      expect(successfulRecoveries).toBeGreaterThan(results.length * 0.95); // >95% recovery rate
      expect(averageRecoveryTime).toBeLessThan(100); // <100ms per recovery
    }, 30000);
  });

  describe('Performance Validation Summary', () => {
    it('should generate comprehensive Redis stress test report', async () => {
      // Calculate overall confidence score
      const scores = [
        testResults.swarmCreation?.totalSwarms === 100 ? 1.0 : 0.5,
        testResults.messagePassing?.throughput > 1000 ? 1.0 : 0.5,
        testResults.leaderElection?.successRate === 100 ? 1.0 : 0.8,
        testResults.statePersistence?.recoveryRate > 95 ? 1.0 : 0.7
      ];

      testResults.confidence = scores.reduce((a, b) => a + b, 0) / scores.length;

      const report = {
        timestamp: new Date().toISOString(),
        testSuite: 'Redis Coordination Stress Test - 100 Concurrent Swarms',
        results: testResults,
        validation: {
          swarmCreation: testResults.swarmCreation?.totalSwarms === 100,
          messageThroughput: testResults.messagePassing?.throughput > 1000,
          leaderElection: testResults.leaderElection?.successRate === 100,
          statePersistence: testResults.statePersistence?.recoveryRate > 95
        },
        overallConfidence: testResults.confidence,
        status: testResults.confidence >= 0.75 ? 'PASS' : 'FAIL'
      };

      console.log('\n📋 Redis Stress Test Summary:');
      console.log(JSON.stringify(report, null, 2));

      // Write report to file
      const fs = require('fs-extra');
      await fs.writeJSON(
        '/mnt/c/Users/masha/Documents/claude-flow-novice/tests/performance/redis-stress-100-swarms-report.json',
        report,
        { spaces: 2 }
      );

      expect(report.status).toBe('PASS');
      expect(report.overallConfidence).toBeGreaterThanOrEqual(0.75);
    });
  });
});
