/**
 * Multi-Swarm Coordination Integration Test
 * Phase 2: Fleet Manager Features & Advanced Capabilities
 *
 * Tests concurrent swarm coordination, messaging, and recovery
 */

const SwarmRegistry = require('./swarm-registry');
const SwarmMessenger = require('./swarm-messenger');
const SwarmCoordinator = require('./swarm-coordinator');
const SwarmStateManager = require('./swarm-state-manager');

class MultiSwarmIntegrationTest {
  constructor(redisConfig = {}) {
    this.redisConfig = redisConfig;
    this.registry = null;
    this.coordinators = [];
    this.messengers = [];
    this.stateManager = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0,
      tests: [],
    };
  }

  /**
   * Run all integration tests
   */
  async runTests() {
    console.log('🧪 Starting Multi-Swarm Coordination Integration Tests\n');
    console.log('=' .repeat(70));

    try {
      // Setup
      await this.setup();

      // Test 1: Concurrent Swarm Registration
      await this.testConcurrentSwarmRegistration();

      // Test 2: Inter-Swarm Messaging
      await this.testInterSwarmMessaging();

      // Test 3: Leader Election
      await this.testLeaderElection();

      // Test 4: Task Distribution
      await this.testTaskDistribution();

      // Test 5: Resource Allocation
      await this.testResourceAllocation();

      // Test 6: Swarm Recovery
      await this.testSwarmRecovery();

      // Test 7: State Persistence
      await this.testStatePersistence();

      // Test 8: Conflict Resolution
      await this.testConflictResolution();

      // Test 9: Message History
      await this.testMessageHistory();

      // Test 10: Snapshot and Restore
      await this.testSnapshotAndRestore();

      // Teardown
      await this.teardown();

      // Print results
      this.printResults();

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      throw error;
    }
  }

  /**
   * Setup test environment
   */
  async setup() {
    console.log('\n📋 Setting up test environment...');

    // Initialize registry
    this.registry = new SwarmRegistry(this.redisConfig);
    await this.registry.initialize();

    // Initialize state manager
    this.stateManager = new SwarmStateManager(this.redisConfig);
    await this.stateManager.initialize();

    console.log('✅ Test environment ready\n');
  }

  /**
   * Teardown test environment
   */
  async teardown() {
    console.log('\n🧹 Cleaning up test environment...');

    // Shutdown coordinators
    for (const coordinator of this.coordinators) {
      await coordinator.shutdown();
    }

    // Shutdown messengers
    for (const messenger of this.messengers) {
      await messenger.shutdown();
    }

    // Shutdown registry and state manager
    if (this.registry) {
      await this.registry.shutdown();
    }

    if (this.stateManager) {
      await this.stateManager.shutdown();
    }

    console.log('✅ Cleanup complete\n');
  }

  /**
   * Test 1: Concurrent Swarm Registration
   */
  async testConcurrentSwarmRegistration() {
    const testName = 'Concurrent Swarm Registration';
    this.testResults.total++;

    try {
      console.log(`\n🧪 Test ${this.testResults.total}: ${testName}`);

      // Register multiple swarms concurrently
      const swarmPromises = [];
      for (let i = 1; i <= 5; i++) {
        swarmPromises.push(
          this.registry.registerSwarm({
            objective: `Test swarm ${i} objective`,
            strategy: 'development',
            mode: 'mesh',
            maxAgents: 5,
            metadata: {
              testId: i,
              phase: 'test',
            },
          })
        );
      }

      const swarms = await Promise.all(swarmPromises);

      // Verify all registered
      if (swarms.length === 5) {
        console.log(`✅ Successfully registered ${swarms.length} concurrent swarms`);
        this.testResults.passed++;
        this.testResults.tests.push({ name: testName, status: 'PASS' });
      } else {
        throw new Error(`Expected 5 swarms, got ${swarms.length}`);
      }

      // Get active count
      const activeCount = await this.registry.getActiveSwarmCount();
      console.log(`   Active swarms: ${activeCount}`);

    } catch (error) {
      console.error(`❌ ${testName} failed:`, error.message);
      this.testResults.failed++;
      this.testResults.tests.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  /**
   * Test 2: Inter-Swarm Messaging
   */
  async testInterSwarmMessaging() {
    const testName = 'Inter-Swarm Messaging';
    this.testResults.total++;

    try {
      console.log(`\n🧪 Test ${this.testResults.total}: ${testName}`);

      // Create two swarms
      const swarm1 = await this.registry.registerSwarm({
        objective: 'Messaging test swarm 1',
        strategy: 'development',
      });

      const swarm2 = await this.registry.registerSwarm({
        objective: 'Messaging test swarm 2',
        strategy: 'development',
      });

      // Initialize messengers
      const messenger1 = new SwarmMessenger(this.redisConfig);
      const messenger2 = new SwarmMessenger(this.redisConfig);

      await messenger1.initialize(swarm1.id);
      await messenger2.initialize(swarm2.id);

      this.messengers.push(messenger1, messenger2);

      // Setup message handler on swarm2
      let messageReceived = false;
      messenger2.onMessage('test_message', (payload) => {
        messageReceived = true;
        console.log(`   📬 Swarm 2 received: ${payload.content}`);
      });

      // Send message from swarm1 to swarm2
      await messenger1.sendToSwarm(swarm2.id, {
        type: 'test_message',
        content: 'Hello from swarm 1!',
      });

      // Wait for message delivery
      await this.sleep(1000);

      if (messageReceived) {
        console.log('✅ Inter-swarm messaging successful');
        this.testResults.passed++;
        this.testResults.tests.push({ name: testName, status: 'PASS' });
      } else {
        throw new Error('Message not received');
      }

    } catch (error) {
      console.error(`❌ ${testName} failed:`, error.message);
      this.testResults.failed++;
      this.testResults.tests.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  /**
   * Test 3: Leader Election
   */
  async testLeaderElection() {
    const testName = 'Leader Election';
    this.testResults.total++;

    try {
      console.log(`\n🧪 Test ${this.testResults.total}: ${testName}`);

      // Create swarm
      const swarm = await this.registry.registerSwarm({
        objective: 'Leader election test',
        strategy: 'development',
      });

      // Initialize coordinator
      const coordinator = new SwarmCoordinator(this.redisConfig);
      await coordinator.initialize(swarm.id);
      this.coordinators.push(coordinator);

      // Wait for election
      await this.sleep(2000);

      if (coordinator.isLeader || coordinator.currentLeader) {
        console.log(`✅ Leader election completed`);
        console.log(`   Is leader: ${coordinator.isLeader}`);
        console.log(`   Current leader: ${coordinator.currentLeader || 'None'}`);
        this.testResults.passed++;
        this.testResults.tests.push({ name: testName, status: 'PASS' });
      } else {
        throw new Error('No leader elected');
      }

    } catch (error) {
      console.error(`❌ ${testName} failed:`, error.message);
      this.testResults.failed++;
      this.testResults.tests.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  /**
   * Test 4: Task Distribution
   */
  async testTaskDistribution() {
    const testName = 'Task Distribution';
    this.testResults.total++;

    try {
      console.log(`\n🧪 Test ${this.testResults.total}: ${testName}`);

      // Get or create leader coordinator
      let leaderCoordinator = this.coordinators.find(c => c.isLeader);

      if (!leaderCoordinator) {
        const swarm = await this.registry.registerSwarm({
          objective: 'Task distribution test',
          strategy: 'development',
        });

        leaderCoordinator = new SwarmCoordinator(this.redisConfig);
        await leaderCoordinator.initialize(swarm.id);
        this.coordinators.push(leaderCoordinator);
        await this.sleep(2000);
      }

      // Create additional worker swarms
      for (let i = 0; i < 2; i++) {
        const workerSwarm = await this.registry.registerSwarm({
          objective: `Worker swarm ${i + 1}`,
          strategy: 'development',
        });

        await this.registry.updateSwarm(workerSwarm.id, { status: 'active' });
      }

      // Distribute task
      const task = {
        description: 'Test task',
        type: 'implementation',
        priority: 'normal',
      };

      const result = await leaderCoordinator.distributeTask(task);

      if (result.distributed || result.queued) {
        console.log(`✅ Task distribution successful`);
        console.log(`   Result:`, JSON.stringify(result, null, 2));
        this.testResults.passed++;
        this.testResults.tests.push({ name: testName, status: 'PASS' });
      } else {
        throw new Error('Task distribution failed');
      }

    } catch (error) {
      console.error(`❌ ${testName} failed:`, error.message);
      this.testResults.failed++;
      this.testResults.tests.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  /**
   * Test 5: Resource Allocation
   */
  async testResourceAllocation() {
    const testName = 'Resource Allocation';
    this.testResults.total++;

    try {
      console.log(`\n🧪 Test ${this.testResults.total}: ${testName}`);

      const leaderCoordinator = this.coordinators.find(c => c.isLeader);

      if (!leaderCoordinator) {
        console.log('⚠️ Skipping test (no leader)');
        return;
      }

      // Initialize resource pool
      await leaderCoordinator.redis.set(
        'swarm:resources:cpu:available',
        '1000'
      );

      // Allocate resource
      const swarm = await this.registry.registerSwarm({
        objective: 'Resource test',
      });

      const result = await leaderCoordinator.allocateResource('cpu', swarm.id, 100);

      if (result.allocated) {
        console.log(`✅ Resource allocation successful`);
        console.log(`   Allocated: 100 CPU to ${swarm.id}`);
        this.testResults.passed++;
        this.testResults.tests.push({ name: testName, status: 'PASS' });

        // Release resource
        await leaderCoordinator.releaseResource('cpu', swarm.id, 100);
        console.log(`   Released: 100 CPU from ${swarm.id}`);
      } else {
        throw new Error('Resource allocation failed');
      }

    } catch (error) {
      console.error(`❌ ${testName} failed:`, error.message);
      this.testResults.failed++;
      this.testResults.tests.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  /**
   * Test 6: Swarm Recovery
   */
  async testSwarmRecovery() {
    const testName = 'Swarm Recovery';
    this.testResults.total++;

    try {
      console.log(`\n🧪 Test ${this.testResults.total}: ${testName}`);

      // Create swarm and save state
      const swarm = await this.registry.registerSwarm({
        objective: 'Recovery test',
        strategy: 'development',
      });

      await this.stateManager.saveState(swarm.id, {
        status: 'active',
        tasks: [
          { id: 'task1', status: 'completed' },
          { id: 'task2', status: 'in_progress' },
          { id: 'task3', status: 'pending' },
        ],
        agents: [
          { id: 'agent1', status: 'active' },
        ],
      });

      // Simulate interruption
      await this.registry.updateSwarm(swarm.id, { status: 'interrupted' });

      // Recover
      const recovery = await this.stateManager.recoverSwarm(swarm.id);

      if (recovery.success) {
        console.log(`✅ Swarm recovery successful`);
        console.log(`   Recovery plan:`, JSON.stringify(recovery.recoveryPlan, null, 2));
        this.testResults.passed++;
        this.testResults.tests.push({ name: testName, status: 'PASS' });
      } else {
        throw new Error('Swarm recovery failed');
      }

    } catch (error) {
      console.error(`❌ ${testName} failed:`, error.message);
      this.testResults.failed++;
      this.testResults.tests.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  /**
   * Test 7: State Persistence
   */
  async testStatePersistence() {
    const testName = 'State Persistence';
    this.testResults.total++;

    try {
      console.log(`\n🧪 Test ${this.testResults.total}: ${testName}`);

      const swarmId = 'test_swarm_persistence';

      // Save state
      await this.stateManager.saveState(swarmId, {
        status: 'active',
        data: 'test data',
        timestamp: Date.now(),
      });

      // Load state
      const loadedState = await this.stateManager.loadState(swarmId);

      if (loadedState && loadedState.data === 'test data') {
        console.log(`✅ State persistence successful`);
        console.log(`   Loaded state version: ${loadedState.version}`);
        this.testResults.passed++;
        this.testResults.tests.push({ name: testName, status: 'PASS' });
      } else {
        throw new Error('State persistence failed');
      }

      // Cleanup
      await this.stateManager.deleteState(swarmId);

    } catch (error) {
      console.error(`❌ ${testName} failed:`, error.message);
      this.testResults.failed++;
      this.testResults.tests.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  /**
   * Test 8: Conflict Resolution
   */
  async testConflictResolution() {
    const testName = 'Conflict Resolution';
    this.testResults.total++;

    try {
      console.log(`\n🧪 Test ${this.testResults.total}: ${testName}`);

      const coordinator = this.coordinators.find(c => c.isLeader);

      if (!coordinator) {
        console.log('⚠️ Skipping test (no leader)');
        return;
      }

      // Create conflict scenario
      const swarmA = await this.registry.registerSwarm({
        objective: 'Swarm A',
        metadata: { priority: 'high' },
      });

      const swarmB = await this.registry.registerSwarm({
        objective: 'Swarm B',
        metadata: { priority: 'normal' },
      });

      const conflict = {
        type: 'resource_conflict',
        swarmA,
        swarmB,
      };

      const resolution = await coordinator.resolveConflict(conflict);

      if (resolution.winner) {
        console.log(`✅ Conflict resolution successful`);
        console.log(`   Winner: ${resolution.winner}`);
        console.log(`   Strategy: ${resolution.strategy}`);
        console.log(`   Reason: ${resolution.reason}`);
        this.testResults.passed++;
        this.testResults.tests.push({ name: testName, status: 'PASS' });
      } else {
        throw new Error('Conflict resolution failed');
      }

    } catch (error) {
      console.error(`❌ ${testName} failed:`, error.message);
      this.testResults.failed++;
      this.testResults.tests.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  /**
   * Test 9: Message History
   */
  async testMessageHistory() {
    const testName = 'Message History';
    this.testResults.total++;

    try {
      console.log(`\n🧪 Test ${this.testResults.total}: ${testName}`);

      const messenger = this.messengers[0];

      if (!messenger) {
        console.log('⚠️ Skipping test (no messenger)');
        return;
      }

      // Send several messages
      for (let i = 1; i <= 3; i++) {
        await messenger.broadcast({
          type: 'history_test',
          message: `Test message ${i}`,
        });
      }

      // Wait for messages to be stored
      await this.sleep(500);

      // Get message history
      const history = await messenger.getMessageHistory('swarm:global', 10);

      if (history.length >= 3) {
        console.log(`✅ Message history successful`);
        console.log(`   Messages in history: ${history.length}`);
        this.testResults.passed++;
        this.testResults.tests.push({ name: testName, status: 'PASS' });
      } else {
        throw new Error(`Expected at least 3 messages, got ${history.length}`);
      }

    } catch (error) {
      console.error(`❌ ${testName} failed:`, error.message);
      this.testResults.failed++;
      this.testResults.tests.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  /**
   * Test 10: Snapshot and Restore
   */
  async testSnapshotAndRestore() {
    const testName = 'Snapshot and Restore';
    this.testResults.total++;

    try {
      console.log(`\n🧪 Test ${this.testResults.total}: ${testName}`);

      const swarmId = 'test_swarm_snapshot';

      // Save initial state
      await this.stateManager.saveState(swarmId, {
        status: 'active',
        counter: 1,
      });

      // Create snapshot
      const snapshotId = await this.stateManager.createSnapshot(swarmId, 'before_update');

      // Update state
      await this.stateManager.updateState(swarmId, {
        counter: 2,
      });

      // Restore from snapshot
      const restoredState = await this.stateManager.restoreFromSnapshot(swarmId, snapshotId);

      if (restoredState && restoredState.counter === 1) {
        console.log(`✅ Snapshot and restore successful`);
        console.log(`   Restored counter value: ${restoredState.counter}`);
        this.testResults.passed++;
        this.testResults.tests.push({ name: testName, status: 'PASS' });
      } else {
        throw new Error(`Expected counter=1, got ${restoredState?.counter}`);
      }

      // Cleanup
      await this.stateManager.deleteState(swarmId);

    } catch (error) {
      console.error(`❌ ${testName} failed:`, error.message);
      this.testResults.failed++;
      this.testResults.tests.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  /**
   * Print test results
   */
  printResults() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 Test Results Summary');
    console.log('='.repeat(70));

    console.log(`\nTotal Tests: ${this.testResults.total}`);
    console.log(`Passed: ${this.testResults.passed} ✅`);
    console.log(`Failed: ${this.testResults.failed} ❌`);
    console.log(`Success Rate: ${Math.round((this.testResults.passed / this.testResults.total) * 100)}%`);

    console.log('\nDetailed Results:');
    this.testResults.tests.forEach((test, index) => {
      const icon = test.status === 'PASS' ? '✅' : '❌';
      console.log(`  ${index + 1}. ${icon} ${test.name}`);
      if (test.error) {
        console.log(`     Error: ${test.error}`);
      }
    });

    console.log('\n' + '='.repeat(70));

    if (this.testResults.failed === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log(`⚠️ ${this.testResults.failed} test(s) failed`);
    }
  }

  /**
   * Utility: Sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run tests if executed directly
if (require.main === module) {
  const test = new MultiSwarmIntegrationTest({
    host: 'localhost',
    port: 6379,
    db: 0,
  });

  test.runTests()
    .then(() => {
      console.log('\n✅ Test suite completed');
      process.exit(test.testResults.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('\n❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = MultiSwarmIntegrationTest;
