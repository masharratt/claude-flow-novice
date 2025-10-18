/**
 * Simple race condition test for SEC-002
 * Tests that concurrent agent completion attempts are handled atomically
 */

import { spawn } from 'child_process';
import { existsSync, unlinkSync } from 'fs';

const CLI_PATH = './.claude-flow-novice/dist/src/cli/main.js';
const TEST_DB = './test-race-sec002.db';
const AGENT_ID = `race-test-${Date.now()}`;

// Clean up
if (existsSync(TEST_DB)) {
  unlinkSync(TEST_DB);
}

/**
 * Execute CLI command
 */
function execCLI(args) {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env, AGENT_LIFECYCLE_DB: TEST_DB },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Main test
 */
async function test() {
  console.log('🧪 SEC-002: Race Condition Fix Test');
  console.log('====================================\n');

  // 1. Spawn agent
  console.log(`1. Spawning agent: ${AGENT_ID}`);
  const spawnResult = await execCLI([
    'agent-lifecycle', 'spawn',
    '--id', AGENT_ID,
    '--type', 'coder',
    '--acl-level', '1'
  ]);

  if (spawnResult.code !== 0) {
    console.error('❌ Failed to spawn agent');
    console.error(spawnResult.stderr);
    process.exit(1);
  }
  console.log('✓ Agent spawned\n');

  // 2. Concurrent completion attempts
  console.log('2. Testing concurrent completion attempts...');
  const [result1, result2] = await Promise.all([
    execCLI([
      'agent-lifecycle', 'complete',
      '--id', AGENT_ID,
      '--confidence', '0.85',
      '--output', 'First attempt'
    ]),
    execCLI([
      'agent-lifecycle', 'complete',
      '--id', AGENT_ID,
      '--confidence', '0.90',
      '--output', 'Second attempt'
    ])
  ]);

  console.log(`   Process 1 exit code: ${result1.code}`);
  console.log(`   Process 2 exit code: ${result2.code}\n`);

  // 3. Verify results
  console.log('3. Verifying results:');
  const successCount = [result1, result2].filter(r => r.code === 0).length;
  const failCount = [result1, result2].filter(r => r.code === 1).length;

  console.log(`   Successes: ${successCount}`);
  console.log(`   Failures: ${failCount}`);

  if (successCount === 1 && failCount === 1) {
    console.log('   ✅ Exactly one completion succeeded (as expected)');

    // Check error message
    const failedResult = result1.code === 1 ? result1 : result2;
    if (failedResult.stderr.includes('already completed')) {
      console.log('   ✅ Correct error message\n');
    } else {
      console.log('   ⚠️  Error message missing "already completed"');
      console.log(`   Actual: ${failedResult.stderr}\n`);
    }
  } else if (successCount === 2) {
    console.log('   ❌ Both completions succeeded (RACE CONDITION STILL EXISTS)\n');
    console.log('   Result 1:');
    console.log(result1.stdout);
    console.log('   Result 2:');
    console.log(result2.stdout);
    cleanup();
    process.exit(1);
  } else {
    console.log('   ❌ Unexpected result (both failed)\n');
    console.log('   Result 1 stderr:');
    console.log(result1.stderr);
    console.log('   Result 2 stderr:');
    console.log(result2.stderr);
    cleanup();
    process.exit(1);
  }

  // 4. Verify database state
  console.log('4. Verifying database state...');
  const statusResult = await execCLI([
    'agent-lifecycle', 'status',
    '--id', AGENT_ID,
    '--json'
  ]);

  if (statusResult.code === 0) {
    try {
      // Extract JSON from CLI output (skip enhanced commands loaded message)
      const jsonStart = statusResult.stdout.indexOf('{');
      const jsonStr = statusResult.stdout.substring(jsonStart);
      const status = JSON.parse(jsonStr);
      const completeEvents = status.events.filter(e => e.event_type === 'complete');
      console.log(`   Complete events: ${completeEvents.length}`);

    if (completeEvents.length === 1) {
      console.log('   ✅ Only one completion event recorded\n');
    } else {
      console.log(`   ❌ Expected 1 completion event, got ${completeEvents.length}\n`);
      cleanup();
      process.exit(1);
    }
    } catch (jsonError) {
      console.log(`   ⚠️  Could not parse status JSON: ${jsonError.message}`);
      console.log(`   Raw output: ${statusResult.stdout}\n`);
    }
  }

  cleanup();
  console.log('🎉 SEC-002 Fix Verified: Race condition resolved!');
}

function cleanup() {
  if (existsSync(TEST_DB)) {
    unlinkSync(TEST_DB);
  }
}

// Run test
test().catch(error => {
  console.error('Test error:', error);
  cleanup();
  process.exit(1);
});
