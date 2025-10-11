/**
 * cleanup-performance-validation.test.ts
 *
 * Sprint 1.4: Empirical validation of cleanup script performance
 * Target: <5s for 10,000 stale coordinator keys
 *
 * Test Scenario:
 * 1. Populate Redis with 10,000 stale coordinator keys (>10 min old)
 * 2. Add 10 active coordinator keys (should be preserved)
 * 3. Execute cleanup script and measure time
 * 4. Verify all stale keys removed and active keys preserved
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// ESM __dirname polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestResults {
  agent: string;
  confidence: number;
  test_results: {
    execution_time_seconds: number;
    stale_keys_created: number;
    stale_keys_removed: number;
    active_keys_preserved: number;
    performance_target_met: boolean;
    accuracy_target_met: boolean;
    safety_target_met: boolean;
  };
  blockers: string[];
}

describe('Cleanup Script Performance Validation', () => {
  const STALE_COORDINATOR_COUNT = 10000;
  const ACTIVE_COORDINATOR_COUNT = 10;
  const PERFORMANCE_TARGET_SECONDS = 5;
  const STALE_AGE_SECONDS = 700; // >10 minutes ago
  const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/cleanup-blocking-coordination.sh');

  let testResults: TestResults;

  // Helper: Execute Redis command
  const redisCmd = (command: string): string => {
    try {
      return execSync(`redis-cli ${command}`, { encoding: 'utf-8' }).trim();
    } catch (error) {
      throw new Error(`Redis command failed: ${command} - ${error}`);
    }
  };

  // Helper: Count keys matching pattern
  const countKeys = (pattern: string): number => {
    try {
      const result = execSync(`redis-cli --scan --pattern "${pattern}" | wc -l`, {
        encoding: 'utf-8'
      }).trim();
      return parseInt(result, 10);
    } catch (error) {
      console.error(`Failed to count keys for pattern: ${pattern}`, error);
      return 0;
    }
  };

  // Helper: Create coordinator heartbeat key
  const createHeartbeat = (
    coordinatorId: string,
    ageSeconds: number,
    ttlSeconds: number = 86400
  ): void => {
    const timestamp = Date.now() - (ageSeconds * 1000);
    const heartbeatData = JSON.stringify({
      coordinatorId,
      timestamp,
      status: 'waiting'
    });

    const key = `blocking:heartbeat:${coordinatorId}`;
    redisCmd(`SETEX "${key}" ${ttlSeconds} '${heartbeatData}'`);

    // Also create associated keys for realistic test
    redisCmd(`SETEX "blocking:signal:${coordinatorId}" ${ttlSeconds} '{"signal":"test"}'`);
    redisCmd(`SETEX "blocking:ack:${coordinatorId}:agent-1" ${ttlSeconds} '{"ack":true}'`);
    redisCmd(`SETEX "coordinator:activity:${coordinatorId}" ${ttlSeconds} '{"active":true}'`);
  };

  beforeAll(async () => {
    console.log('\n========================================');
    console.log('Cleanup Performance Validation Setup');
    console.log('========================================\n');

    // Check Redis connection
    try {
      const ping = redisCmd('PING');
      expect(ping).toBe('PONG');
      console.log('✓ Redis connection established');
    } catch (error) {
      throw new Error(`Redis connection failed: ${error}`);
    }

    // Clean any existing test keys
    console.log('Cleaning existing test keys...');
    try {
      execSync('redis-cli --scan --pattern "blocking:heartbeat:test-*" | xargs -r redis-cli DEL', {
        encoding: 'utf-8'
      });
      execSync('redis-cli --scan --pattern "blocking:heartbeat:active-*" | xargs -r redis-cli DEL', {
        encoding: 'utf-8'
      });
      console.log('✓ Existing test keys cleaned');
    } catch (error) {
      console.warn('Warning: Failed to clean existing keys (may not exist)');
    }

    // Create 10,000 stale coordinator keys
    console.log(`\nCreating ${STALE_COORDINATOR_COUNT} stale coordinator keys...`);
    const startSetup = Date.now();

    // Use bash loop for faster creation
    const createStaleScript = `
      for i in {1..${STALE_COORDINATOR_COUNT}}; do
        timestamp=$(($(date +%s000) - ${STALE_AGE_SECONDS * 1000}))
        redis-cli SETEX "blocking:heartbeat:test-swarm-$i:coordinator-$i" 86400 "{\\"coordinatorId\\":\\"test-swarm-$i:coordinator-$i\\",\\"timestamp\\":$timestamp,\\"status\\":\\"waiting\\"}" >/dev/null
        redis-cli SETEX "blocking:signal:test-swarm-$i:coordinator-$i" 86400 "{\\"signal\\":\\"test\\"}" >/dev/null
        redis-cli SETEX "blocking:ack:test-swarm-$i:coordinator-$i:agent-1" 86400 "{\\"ack\\":true}" >/dev/null
        redis-cli SETEX "coordinator:activity:test-swarm-$i:coordinator-$i" 86400 "{\\"active\\":true}" >/dev/null
      done
    `;

    try {
      execSync(createStaleScript, { shell: '/bin/bash', encoding: 'utf-8' });
      const setupTime = ((Date.now() - startSetup) / 1000).toFixed(2);
      console.log(`✓ Created ${STALE_COORDINATOR_COUNT} stale coordinators in ${setupTime}s`);
    } catch (error) {
      throw new Error(`Failed to create stale coordinators: ${error}`);
    }

    // Create 10 active coordinator keys (recent timestamps)
    console.log(`\nCreating ${ACTIVE_COORDINATOR_COUNT} active coordinator keys...`);
    for (let i = 1; i <= ACTIVE_COORDINATOR_COUNT; i++) {
      createHeartbeat(`active-swarm-${i}:coordinator-${i}`, 0); // Current timestamp
    }
    console.log(`✓ Created ${ACTIVE_COORDINATOR_COUNT} active coordinators`);

    // Verify setup
    const staleCount = countKeys('blocking:heartbeat:test-*');
    const activeCount = countKeys('blocking:heartbeat:active-*');
    console.log(`\n✓ Setup verified: ${staleCount} stale, ${activeCount} active`);
    console.log('========================================\n');
  });

  afterAll(async () => {
    console.log('\n========================================');
    console.log('Cleanup Performance Validation Teardown');
    console.log('========================================\n');

    // Clean up test keys
    try {
      execSync('redis-cli --scan --pattern "blocking:heartbeat:test-*" | xargs -r redis-cli DEL', {
        encoding: 'utf-8'
      });
      execSync('redis-cli --scan --pattern "blocking:heartbeat:active-*" | xargs -r redis-cli DEL', {
        encoding: 'utf-8'
      });
      execSync('redis-cli --scan --pattern "blocking:signal:test-*" | xargs -r redis-cli DEL', {
        encoding: 'utf-8'
      });
      execSync('redis-cli --scan --pattern "blocking:signal:active-*" | xargs -r redis-cli DEL', {
        encoding: 'utf-8'
      });
      execSync('redis-cli --scan --pattern "blocking:ack:test-*" | xargs -r redis-cli DEL', {
        encoding: 'utf-8'
      });
      execSync('redis-cli --scan --pattern "blocking:ack:active-*" | xargs -r redis-cli DEL', {
        encoding: 'utf-8'
      });
      execSync('redis-cli --scan --pattern "coordinator:activity:test-*" | xargs -r redis-cli DEL', {
        encoding: 'utf-8'
      });
      execSync('redis-cli --scan --pattern "coordinator:activity:active-*" | xargs -r redis-cli DEL', {
        encoding: 'utf-8'
      });
      console.log('✓ Test keys cleaned up');
    } catch (error) {
      console.warn('Warning: Cleanup failed (may not be critical)');
    }

    console.log('========================================\n');

    // Output test results as JSON
    if (testResults) {
      console.log('\n========================================');
      console.log('TEST RESULTS JSON:');
      console.log('========================================');
      console.log(JSON.stringify(testResults, null, 2));
      console.log('========================================\n');
    }
  });

  it('should clean up 10,000 stale coordinators in <5 seconds', async () => {
    console.log('\n========================================');
    console.log('Executing Cleanup Script');
    console.log('========================================\n');

    // Count keys before cleanup
    const staleBeforeHeartbeat = countKeys('blocking:heartbeat:test-*');
    const staleBeforeSignal = countKeys('blocking:signal:test-*');
    const staleBeforeAck = countKeys('blocking:ack:test-*');
    const staleBeforeActivity = countKeys('coordinator:activity:test-*');
    const activeBeforeHeartbeat = countKeys('blocking:heartbeat:active-*');
    const activeBeforeSignal = countKeys('blocking:signal:active-*');
    const activeBeforeAck = countKeys('blocking:ack:active-*');
    const activeBeforeActivity = countKeys('coordinator:activity:active-*');

    console.log('Keys before cleanup:');
    console.log(`  Stale heartbeats: ${staleBeforeHeartbeat}`);
    console.log(`  Stale signals: ${staleBeforeSignal}`);
    console.log(`  Stale ACKs: ${staleBeforeAck}`);
    console.log(`  Stale activity: ${staleBeforeActivity}`);
    console.log(`  Active heartbeats: ${activeBeforeHeartbeat}`);
    console.log(`  Active signals: ${activeBeforeSignal}`);
    console.log(`  Active ACKs: ${activeBeforeAck}`);
    console.log(`  Active activity: ${activeBeforeActivity}`);
    console.log();

    // Execute cleanup script and measure time
    const startTime = Date.now();
    let executionError: Error | null = null;

    try {
      // Run cleanup script (not dry-run)
      const result = execSync(`bash ${SCRIPT_PATH}`, {
        encoding: 'utf-8',
        timeout: 30000, // 30s timeout for safety
      });
      console.log('Cleanup script output:');
      console.log(result);
    } catch (error: any) {
      executionError = error;
      console.error('Cleanup script failed:');
      console.error(error.message);
      if (error.stdout) console.log('STDOUT:', error.stdout);
      if (error.stderr) console.error('STDERR:', error.stderr);
    }

    const endTime = Date.now();
    const executionTimeSeconds = (endTime - startTime) / 1000;

    console.log(`\nExecution time: ${executionTimeSeconds.toFixed(2)}s`);
    console.log('========================================\n');

    // Count keys after cleanup
    const staleAfterHeartbeat = countKeys('blocking:heartbeat:test-*');
    const staleAfterSignal = countKeys('blocking:signal:test-*');
    const staleAfterAck = countKeys('blocking:ack:test-*');
    const staleAfterActivity = countKeys('coordinator:activity:test-*');
    const activeAfterHeartbeat = countKeys('blocking:heartbeat:active-*');
    const activeAfterSignal = countKeys('blocking:signal:active-*');
    const activeAfterAck = countKeys('blocking:ack:active-*');
    const activeAfterActivity = countKeys('coordinator:activity:active-*');

    console.log('Keys after cleanup:');
    console.log(`  Stale heartbeats: ${staleAfterHeartbeat}`);
    console.log(`  Stale signals: ${staleAfterSignal}`);
    console.log(`  Stale ACKs: ${staleAfterAck}`);
    console.log(`  Stale activity: ${staleAfterActivity}`);
    console.log(`  Active heartbeats: ${activeAfterHeartbeat}`);
    console.log(`  Active signals: ${activeAfterSignal}`);
    console.log(`  Active ACKs: ${activeAfterAck}`);
    console.log(`  Active activity: ${activeAfterActivity}`);
    console.log();

    // Calculate metrics
    const totalStaleKeysBefore = staleBeforeHeartbeat + staleBeforeSignal + staleBeforeAck + staleBeforeActivity;
    const totalStaleKeysAfter = staleAfterHeartbeat + staleAfterSignal + staleAfterAck + staleAfterActivity;
    const totalActiveKeysBefore = activeBeforeHeartbeat + activeBeforeSignal + activeBeforeAck + activeBeforeActivity;
    const totalActiveKeysAfter = activeAfterHeartbeat + activeAfterSignal + activeAfterAck + activeAfterActivity;

    const staleKeysRemoved = totalStaleKeysBefore - totalStaleKeysAfter;
    const activeKeysPreserved = totalActiveKeysAfter;

    // Validation flags
    const performanceTargetMet = executionTimeSeconds < PERFORMANCE_TARGET_SECONDS;
    const accuracyTargetMet = staleAfterHeartbeat === 0; // All stale heartbeats removed
    const safetyTargetMet = activeAfterHeartbeat === ACTIVE_COORDINATOR_COUNT; // Active preserved

    // Build test results
    testResults = {
      agent: 'tester',
      confidence: 0.0, // Will calculate based on results
      test_results: {
        execution_time_seconds: parseFloat(executionTimeSeconds.toFixed(2)),
        stale_keys_created: STALE_COORDINATOR_COUNT,
        stale_keys_removed: staleBeforeHeartbeat - staleAfterHeartbeat,
        active_keys_preserved: activeAfterHeartbeat,
        performance_target_met: performanceTargetMet,
        accuracy_target_met: accuracyTargetMet,
        safety_target_met: safetyTargetMet,
      },
      blockers: [],
    };

    // Calculate confidence
    let confidence = 0.0;
    if (performanceTargetMet) confidence += 0.33;
    if (accuracyTargetMet) confidence += 0.33;
    if (safetyTargetMet) confidence += 0.34;
    testResults.confidence = parseFloat(confidence.toFixed(2));

    // Add blockers if targets not met
    if (!performanceTargetMet) {
      testResults.blockers.push(
        `Performance target not met: ${executionTimeSeconds.toFixed(2)}s > ${PERFORMANCE_TARGET_SECONDS}s`
      );
    }
    if (!accuracyTargetMet) {
      testResults.blockers.push(
        `Accuracy target not met: ${staleAfterHeartbeat} stale heartbeats remaining (expected 0)`
      );
    }
    if (!safetyTargetMet) {
      testResults.blockers.push(
        `Safety target not met: ${activeAfterHeartbeat} active coordinators (expected ${ACTIVE_COORDINATOR_COUNT})`
      );
    }
    if (executionError) {
      testResults.blockers.push(`Cleanup script execution error: ${executionError.message}`);
    }

    console.log('========================================');
    console.log('Validation Results:');
    console.log('========================================');
    console.log(`✓ Execution time: ${executionTimeSeconds.toFixed(2)}s ${performanceTargetMet ? '✓' : '✗'} (<${PERFORMANCE_TARGET_SECONDS}s)`);
    console.log(`✓ Stale keys removed: ${staleKeysRemoved}/${totalStaleKeysBefore} ${accuracyTargetMet ? '✓' : '✗'}`);
    console.log(`✓ Active keys preserved: ${activeKeysPreserved}/${totalActiveKeysBefore} ${safetyTargetMet ? '✓' : '✗'}`);
    console.log(`✓ Confidence: ${testResults.confidence} ${testResults.confidence >= 0.75 ? '✓' : '✗'} (≥0.75)`);
    console.log('========================================\n');

    // Assertions
    expect(executionError).toBeNull();
    expect(executionTimeSeconds).toBeLessThan(PERFORMANCE_TARGET_SECONDS);
    expect(staleAfterHeartbeat).toBe(0);
    expect(activeAfterHeartbeat).toBe(ACTIVE_COORDINATOR_COUNT);
    expect(testResults.confidence).toBeGreaterThanOrEqual(0.75);
  }, 60000); // 60s timeout for test
});
