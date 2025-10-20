/**
 * Web Portal Cross-Repo Filtering Tests
 * Phase 3: Repository detection and grouping validation
 */

const http = require('http');
const redis = require('redis');

const PORTAL_URL = 'http://localhost:3456';
const REDIS_URL = 'redis://localhost:6379';

// Helper function to make HTTP GET requests
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

// Test suite
async function runTests() {
  const results = [];
  let passed = 0;
  let failed = 0;

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('WEB PORTAL CROSS-REPO FILTERING TESTS - PHASE 3');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  let redisClient = null;
  let testTaskIds = [];

  try {
    // Setup: Create test tasks in Redis
    console.log('Setup: Creating test tasks in multiple repositories...');
    redisClient = redis.createClient({ url: REDIS_URL });
    await redisClient.connect();

    const testTasks = [
      {
        taskId: 'test-repo-alpha-task-001',
        metadata: {
          task_id: 'test-repo-alpha-task-001',
          repository: 'claude-flow-alpha',
          status: 'in_progress',
          created_at: '2025-10-19T20:00:00Z'
        }
      },
      {
        taskId: 'test-repo-alpha-task-002',
        metadata: {
          task_id: 'test-repo-alpha-task-002',
          repository: 'claude-flow-alpha',
          status: 'completed',
          created_at: '2025-10-19T20:05:00Z'
        }
      },
      {
        taskId: 'test-repo-beta-task-001',
        metadata: {
          task_id: 'test-repo-beta-task-001',
          cwd: '/home/user/projects/claude-flow-beta',
          status: 'in_progress',
          created_at: '2025-10-19T20:10:00Z'
        }
      },
      {
        taskId: 'test-repo-gamma-task-001',
        metadata: {
          task_id: 'gamma-feature-implementation',
          project_root: '/workspace/my-awesome-gamma-project',
          status: 'in_progress',
          created_at: '2025-10-19T20:15:00Z'
        }
      },
      {
        taskId: 'test-unknown-repo-task-001',
        metadata: {
          task_id: 'some-random-uuid-12345',
          status: 'pending',
          created_at: '2025-10-19T20:20:00Z'
        }
      }
    ];

    for (const task of testTasks) {
      const key = `swarm:${task.taskId}:metadata`;
      await redisClient.hSet(key, task.metadata);
      testTaskIds.push(task.taskId);
    }

    console.log(`✅ Created ${testTasks.length} test tasks`);
    console.log('');

  } catch (err) {
    console.error('❌ Setup failed:', err.message);
    if (redisClient) await redisClient.quit();
    process.exit(1);
  }

  // Test 1: Repository grouping correctness
  try {
    console.log('Test 1: Repository grouping correctness...');

    const { statusCode, data } = await httpGet(`${PORTAL_URL}/api/swarms/by-repo`);

    if (statusCode !== 200) {
      throw new Error(`Expected status 200, got ${statusCode}`);
    }

    if (!data.repositories || !Array.isArray(data.repositories)) {
      throw new Error('Invalid response format');
    }

    // Check that we have at least the test repositories
    const repoNames = data.repositories.map(r => r.repository);
    const expectedRepos = ['claude-flow-alpha', 'claude-flow-beta', 'my-awesome-gamma-project', 'some'];

    let foundCount = 0;
    for (const expected of expectedRepos) {
      if (repoNames.includes(expected)) {
        foundCount++;
      }
    }

    if (foundCount < 3) {
      throw new Error(`Expected at least 3 test repos, found ${foundCount}`);
    }

    console.log('  ✅ PASS: Repository grouping correct');
    console.log(`     Found ${data.repositoryCount} repositories`);
    console.log(`     Test repos identified: ${foundCount}/${expectedRepos.length}`);
    results.push({ test: 'Repository grouping', status: 'PASS' });
    passed++;

  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    results.push({ test: 'Repository grouping', status: 'FAIL', error: err.message });
    failed++;
  }

  console.log('');

  // Test 2: Task count accuracy per repository
  try {
    console.log('Test 2: Task count accuracy per repository...');

    const { data } = await httpGet(`${PORTAL_URL}/api/swarms/by-repo`);

    // Find claude-flow-alpha repo (should have 2 tasks)
    const alphaRepo = data.repositories.find(r => r.repository === 'claude-flow-alpha');

    if (!alphaRepo) {
      throw new Error('claude-flow-alpha repository not found');
    }

    if (alphaRepo.taskCount !== 2) {
      throw new Error(`Expected 2 tasks for claude-flow-alpha, got ${alphaRepo.taskCount}`);
    }

    if (alphaRepo.tasks.length !== 2) {
      throw new Error(`Expected 2 tasks in array, got ${alphaRepo.tasks.length}`);
    }

    console.log('  ✅ PASS: Task count accurate');
    console.log(`     claude-flow-alpha: ${alphaRepo.taskCount} tasks`);
    console.log(`     Tasks: ${alphaRepo.tasks.map(t => t.taskId).join(', ')}`);
    results.push({ test: 'Task count accuracy', status: 'PASS' });
    passed++;

  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    results.push({ test: 'Task count accuracy', status: 'FAIL', error: err.message });
    failed++;
  }

  console.log('');

  // Test 3: Sorting by activity (most active repos first)
  try {
    console.log('Test 3: Sorting by activity (most active repos first)...');

    const { data } = await httpGet(`${PORTAL_URL}/api/swarms/by-repo`);

    if (data.repositories.length < 2) {
      throw new Error('Need at least 2 repositories to test sorting');
    }

    // Verify repositories are sorted by task count (descending)
    let isSorted = true;
    for (let i = 0; i < data.repositories.length - 1; i++) {
      if (data.repositories[i].taskCount < data.repositories[i + 1].taskCount) {
        isSorted = false;
        break;
      }
    }

    if (!isSorted) {
      throw new Error('Repositories not sorted by task count');
    }

    console.log('  ✅ PASS: Repositories sorted by activity');
    console.log(`     Top 3 repos:`);
    for (let i = 0; i < Math.min(3, data.repositories.length); i++) {
      console.log(`       ${i + 1}. ${data.repositories[i].repository}: ${data.repositories[i].taskCount} tasks`);
    }
    results.push({ test: 'Activity-based sorting', status: 'PASS' });
    passed++;

  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    results.push({ test: 'Activity-based sorting', status: 'FAIL', error: err.message });
    failed++;
  }

  console.log('');

  // Test 4: Repository name extraction from various metadata fields
  try {
    console.log('Test 4: Repository name extraction from various metadata fields...');

    const { data } = await httpGet(`${PORTAL_URL}/api/swarms/by-repo`);
    const repoNames = data.repositories.map(r => r.repository);

    // Verify extraction from 'repository' field
    if (!repoNames.includes('claude-flow-alpha')) {
      throw new Error('Failed to extract from "repository" field');
    }

    // Verify extraction from 'cwd' field
    if (!repoNames.includes('claude-flow-beta')) {
      throw new Error('Failed to extract from "cwd" field');
    }

    // Verify extraction from 'project_root' field
    if (!repoNames.includes('my-awesome-gamma-project')) {
      throw new Error('Failed to extract from "project_root" field');
    }

    // Verify fallback to task_id parsing
    if (!repoNames.includes('some')) {
      throw new Error('Failed to extract from "task_id" field');
    }

    console.log('  ✅ PASS: Repository name extraction from all metadata sources');
    console.log('     ✓ Extracted from "repository" field');
    console.log('     ✓ Extracted from "cwd" field');
    console.log('     ✓ Extracted from "project_root" field');
    console.log('     ✓ Extracted from "task_id" field');
    results.push({ test: 'Metadata field extraction', status: 'PASS' });
    passed++;

  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    results.push({ test: 'Metadata field extraction', status: 'FAIL', error: err.message });
    failed++;
  }

  console.log('');

  // Test 5: Tasks within repository sorted by creation time
  try {
    console.log('Test 5: Tasks within repository sorted by creation time...');

    const { data } = await httpGet(`${PORTAL_URL}/api/swarms/by-repo`);

    const alphaRepo = data.repositories.find(r => r.repository === 'claude-flow-alpha');

    if (!alphaRepo || alphaRepo.tasks.length < 2) {
      throw new Error('Need at least 2 tasks in claude-flow-alpha to test sorting');
    }

    // Verify tasks are sorted by creation time (most recent first)
    const firstTaskTime = alphaRepo.tasks[0].metadata.created_at;
    const secondTaskTime = alphaRepo.tasks[1].metadata.created_at;

    if (firstTaskTime < secondTaskTime) {
      throw new Error('Tasks not sorted by creation time (most recent first)');
    }

    console.log('  ✅ PASS: Tasks sorted by creation time within repository');
    console.log(`     First task: ${alphaRepo.tasks[0].taskId} (${firstTaskTime})`);
    console.log(`     Second task: ${alphaRepo.tasks[1].taskId} (${secondTaskTime})`);
    results.push({ test: 'Task sorting within repo', status: 'PASS' });
    passed++;

  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    results.push({ test: 'Task sorting within repo', status: 'FAIL', error: err.message });
    failed++;
  }

  console.log('');

  // Cleanup
  try {
    console.log('Cleanup: Removing test tasks...');
    for (const taskId of testTaskIds) {
      await redisClient.del(`swarm:${taskId}:metadata`);
    }
    console.log(`✅ Removed ${testTaskIds.length} test tasks`);
    await redisClient.quit();
  } catch (err) {
    console.error('⚠️  Cleanup warning:', err.message);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Return exit code
  return failed === 0 ? 0 : 1;
}

// Run tests
runTests()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
