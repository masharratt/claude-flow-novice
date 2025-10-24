/**
 * Security Test: Race Condition Fix (SEC-002)
 * Vulnerability: CWE-362 TOCTOU in agent completion
 *
 * Tests that concurrent completion attempts are handled atomically
 * and prevent data corruption.
 */

import { spawn } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const CLI_PATH = join(process.cwd(), '.claude-flow-novice/dist/src/cli/main.js');
const TEST_DB = './test-race-condition-sec002.db';

/**
 * Execute CLI command and return result
 */
function execCLI(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env, AGENT_LIFECYCLE_DB: TEST_DB }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', reject);
  });
}

describe('SEC-002: Race Condition Fix', () => {
  beforeEach(() => {
    // Clean up test database
    if (existsSync(TEST_DB)) {
      unlinkSync(TEST_DB);
    }
  });

  afterEach(() => {
    // Clean up test database
    if (existsSync(TEST_DB)) {
      unlinkSync(TEST_DB);
    }
  });

  jest.setTimeout(10000);
  test('concurrent completion attempts - only one succeeds', async () => { try {
    // Spawn agent first
    const spawnResult = await execCLI([
      'agent-lifecycle', 'spawn',
      '--id', 'race-test-agent',
      '--type', 'coder',
      '--acl-level', '1'
    ]);

    expect(spawnResult.code).toBe(0);
    expect(spawnResult.stdout).toContain('spawned successfully');

    // Attempt concurrent completions
    const complete1 = execCLI([
      'agent-lifecycle', 'complete',
      '--id', 'race-test-agent',
      '--confidence', '0.85',
      '--output', 'First completion attempt'
    ]);

    const complete2 = execCLI([
      'agent-lifecycle', 'complete',
      '--id', 'race-test-agent',
      '--confidence', '0.90',
      '--output', 'Second completion attempt'
    ]);

    // Wait for both to complete
    const [result1, result2] = await Promise.all([complete1, complete2]);

    // One should succeed, one should fail
    const successCount = [result1, result2].filter(r => r.code === 0).length;
    const failCount = [result1, result2].filter(r => r.code === 1).length;

    expect(successCount).toBe(1);
    expect(failCount).toBe(1);

    // Failed one should have "already completed" error
    const failedResult = result1.code === 1 ? result1 : result2;
    expect(failedResult.stderr).toContain('already completed');
  });

  jest.setTimeout(10000);
  test('sequential completion after spawn succeeds', async () => { try {
    // Spawn agent
    await execCLI([
      'agent-lifecycle', 'spawn',
      '--id', 'seq-test-agent',
      '--type', 'coder',
      '--acl-level', '1'
    ]);

    // Complete once
    const completeResult = await execCLI([
      'agent-lifecycle', 'complete',
      '--id', 'seq-test-agent',
      '--confidence', '0.80'
    ]);

    expect(completeResult.code).toBe(0);
    expect(completeResult.stdout).toContain('marked as completed');
  });

  jest.setTimeout(10000);
  test('duplicate completion fails gracefully', async () => { try {
    // Spawn and complete agent
    await execCLI([
      'agent-lifecycle', 'spawn',
      '--id', 'dup-test-agent',
      '--type', 'coder',
      '--acl-level', '1'
    ]);

    await execCLI([
      'agent-lifecycle', 'complete',
      '--id', 'dup-test-agent',
      '--confidence', '0.75'
    ]);

    // Try to complete again
    const duplicateResult = await execCLI([
      'agent-lifecycle', 'complete',
      '--id', 'dup-test-agent',
      '--confidence', '0.85'
    ]);

    expect(duplicateResult.code).toBe(1);
    expect(duplicateResult.stderr).toContain('already completed');
  });

  jest.setTimeout(10000);
  test('completion of non-existent agent fails', async () => { try {
    const result = await execCLI([
      'agent-lifecycle', 'complete',
      '--id', 'nonexistent-agent',
      '--confidence', '0.80'
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not found');
  });

  jest.setTimeout(10000);
  test('confidence score validation during atomic completion', async () => { try {
    // Spawn agent
    await execCLI([
      'agent-lifecycle', 'spawn',
      '--id', 'conf-test-agent',
      '--type', 'coder',
      '--acl-level', '1'
    ]);

    // Invalid confidence (out of range)
    const invalidResult = await execCLI([
      'agent-lifecycle', 'complete',
      '--id', 'conf-test-agent',
      '--confidence', '1.5'
    ]);

    expect(invalidResult.code).toBe(1);
    expect(invalidResult.stderr).toContain('Confidence must be between 0.0 and 1.0');

    // Valid confidence should work
    const validResult = await execCLI([
      'agent-lifecycle', 'complete',
      '--id', 'conf-test-agent',
      '--confidence', '0.85'
    ]);

    expect(validResult.code).toBe(0);
  });
});
