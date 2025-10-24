/**
 * Pre-commit Database Secret Scanning Hook Tests
 *
 * Tests the git pre-commit hook that scans SQLite databases for secrets
 * before allowing commits.
 *
 * @module tests/hooks/pre-commit-db-scan.test
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

describe('Pre-commit Database Secret Scanning', () => {
  const TEST_DB = path.join(__dirname, '.test-db-scan.db');
  const HOOK_SCRIPT = path.join(__dirname, '../../config/hooks/pre-commit-db-scan');

  // Cleanup helper
  const cleanup = () => {
    try {
      if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
      execSync(`git reset HEAD ${TEST_DB} 2>/dev/null || true`, { stdio: 'ignore' });
      execSync(`git checkout HEAD ${TEST_DB} 2>/dev/null || true`, { stdio: 'ignore' });
    } catch (err) {
      // Ignore cleanup errors
    }
  };

  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Hook Validation', () => {
    jest.setTimeout(10000);
  test('hook script exists and is executable', () => {
      expect(fs.existsSync(HOOK_SCRIPT)).toBe(true);

      const stats = fs.statSync(HOOK_SCRIPT);
      const isExecutable = (stats.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });

    jest.setTimeout(10000);
  test('hook script has correct shebang', () => {
      const content = fs.readFileSync(HOOK_SCRIPT, 'utf8');
      expect(content.startsWith('#!/bin/bash')).toBe(true);
    });
  });

  describe('Clean Database Detection', () => {
    jest.setTimeout(10000);
  test('allows commit with clean database content', () => {
      // Create database with clean data
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE users (id INTEGER, name TEXT); INSERT INTO users VALUES (1, 'Alice');"`);

      // Stage the file
      execSync(`git add ${TEST_DB}`);

      // Run hook - should pass
      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('✅');
    });

    jest.setTimeout(10000);
  test('allows commit with no staged database files', () => {
      // Don't stage any database files
      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No database files to scan');
    });

    jest.setTimeout(10000);
  test('handles empty database gracefully', () => {
      // Create empty database
      execSync(`sqlite3 ${TEST_DB} "VACUUM;"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      // Should warn but not fail
      expect(result.status).toBe(0);
    });
  });

  describe('Secret Detection - API Keys', () => {
    jest.setTimeout(10000);
  test('blocks commit with api_key pattern', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE config (key TEXT, value TEXT); INSERT INTO config VALUES ('api_key', 'sk-1234567890');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
      expect(result.stdout).toContain('api');
    });

    jest.setTimeout(10000);
  test('blocks commit with ZAI_API_KEY', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE env (name TEXT, value TEXT); INSERT INTO env VALUES ('ZAI_API_KEY', 'zai-test-key-123');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
      expect(result.stdout).toContain('ZAI_API_KEY');
    });

    jest.setTimeout(10000);
  test('blocks commit with ANTHROPIC_API_KEY', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE env (name TEXT); INSERT INTO env VALUES ('ANTHROPIC_API_KEY');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
    });

    jest.setTimeout(10000);
  test('blocks commit with Anthropic API key format (sk-ant-*)', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE keys (value TEXT); INSERT INTO keys VALUES ('sk-ant-api03-1234567890abcdef');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
    });
  });

  describe('Secret Detection - Authentication', () => {
    jest.setTimeout(10000);
  test('blocks commit with password field', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE users (username TEXT, password TEXT); INSERT INTO users VALUES ('admin', 'hashed123');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
      expect(result.stdout).toContain('password');
    });

    jest.setTimeout(10000);
  test('blocks commit with Bearer token', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE auth (token TEXT); INSERT INTO auth VALUES ('Bearer abc123xyz');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
      expect(result.stdout).toContain('Bearer');
    });

    jest.setTimeout(10000);
  test('blocks commit with auth_key', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE config (key TEXT); INSERT INTO config VALUES ('auth_key');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
    });

    jest.setTimeout(10000);
  test('blocks commit with session token (sess-*)', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE sessions (id TEXT); INSERT INTO sessions VALUES ('sess-1234567890abcdef');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
    });
  });

  describe('Secret Detection - Credentials', () => {
    jest.setTimeout(10000);
  test('blocks commit with secret field', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE config (name TEXT, secret TEXT); INSERT INTO config VALUES ('app', 'my-secret-value');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
      expect(result.stdout).toContain('secret');
    });

    jest.setTimeout(10000);
  test('blocks commit with token field', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE access (token TEXT); INSERT INTO access VALUES ('access-token-123');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
      expect(result.stdout).toContain('token');
    });

    jest.setTimeout(10000);
  test('blocks commit with private_key', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE keys (private_key TEXT); INSERT INTO keys VALUES ('-----BEGIN PRIVATE KEY-----');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
      expect(result.stdout).toContain('private');
    });

    jest.setTimeout(10000);
  test('blocks commit with credential field', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE auth (credential TEXT); INSERT INTO auth VALUES ('user:pass');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
      expect(result.stdout).toContain('credential');
    });
  });

  describe('Multiple Secrets Detection', () => {
    jest.setTimeout(10000);
  test('reports all detected secrets in single database', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE config (key TEXT, value TEXT); INSERT INTO config VALUES ('api_key', 'sk-123'), ('password', 'pass123');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
      // Should mention both patterns
      expect(result.stdout.match(/potential secret/gi).length).toBeGreaterThan(1);
    });
  });

  describe('Error Handling', () => {
    jest.setTimeout(10000);
  test('handles non-existent staged file gracefully', () => {
      // Stage a file that doesn't exist (edge case)
      execSync(`git add non-existent.db 2>/dev/null || true`, { stdio: 'ignore' });

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      // Should not crash
      expect([0, 1]).toContain(result.status);
    });

    jest.setTimeout(10000);
  test('handles corrupted database gracefully', () => {
      // Create corrupted database
      fs.writeFileSync(TEST_DB, 'This is not a valid SQLite database file');
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      // Should warn but not crash
      expect([0, 1]).toContain(result.status);
      expect(result.stdout).toContain('⚠️');
    });

    jest.setTimeout(10000);
  test('handles locked database gracefully', () => {
      // Create database
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE test (id INTEGER);"`);

      // Lock it by opening a transaction (requires a separate process)
      const lockProcess = spawnSync('bash', [
        '-c',
        `sqlite3 ${TEST_DB} "BEGIN EXCLUSIVE TRANSACTION;" & sleep 2`
      ], { detached: true });

      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      // Should handle gracefully
      expect([0, 1]).toContain(result.status);
    });
  });

  describe('Case Sensitivity', () => {
    jest.setTimeout(10000);
  test('detects uppercase API_KEY', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE config (API_KEY TEXT); INSERT INTO config VALUES ('sk-123');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
    });

    jest.setTimeout(10000);
  test('detects mixed case Password', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE users (Password TEXT); INSERT INTO users VALUES ('pass123');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('COMMIT BLOCKED');
    });
  });

  describe('Output Formatting', () => {
    jest.setTimeout(10000);
  test('provides helpful error message on secret detection', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE config (key TEXT); INSERT INTO config VALUES ('api_key');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.stdout).toContain('COMMIT BLOCKED');
      expect(result.stdout).toContain('To fix:');
      expect(result.stdout).toContain('environment variables');
      expect(result.stdout).toContain('--no-verify');
    });

    jest.setTimeout(10000);
  test('shows detailed findings with file and pattern', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE config (key TEXT); INSERT INTO config VALUES ('api_key');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      expect(result.stdout).toContain('Detailed findings:');
      expect(result.stdout).toContain('Pattern:');
    });

    jest.setTimeout(10000);
  test('masks sensitive data in output', () => {
      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE config (key TEXT); INSERT INTO config VALUES ('sk-ant-api03-very-long-secret-key-1234567890abcdef');"`);
      execSync(`git add ${TEST_DB}`);

      const result = spawnSync('bash', [HOOK_SCRIPT], { encoding: 'utf8' });

      // Should contain masked version
      expect(result.stdout).toContain('sk-ant-');
      expect(result.stdout).toContain('***');
      // Should NOT contain full secret
      expect(result.stdout).not.toContain('very-long-secret-key-1234567890abcdef');
    });
  });

  describe('Integration with Git', () => {
    jest.setTimeout(10000);
  test('hook blocks actual git commit with secrets', () => {
      // This test requires the hook to be installed
      const hookTarget = path.join(__dirname, '../../.git/hooks/pre-commit');

      if (!fs.existsSync(hookTarget)) {
        console.warn('Skipping integration test - hook not installed');
        return;
      }

      execSync(`sqlite3 ${TEST_DB} "CREATE TABLE config (api_key TEXT); INSERT INTO config VALUES ('sk-123');"`);
      execSync(`git add ${TEST_DB}`);

      try {
        execSync('git commit -m "Test commit with secrets"', { stdio: 'pipe' });
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        // Commit should be blocked
        expect(err.status).toBe(1);
        expect(err.stdout.toString()).toContain('COMMIT BLOCKED');
      }
    });
  });
});

describe('Installation Script', () => {
  const INSTALL_SCRIPT = path.join(__dirname, '../../scripts/install-pre-commit-hook.sh');

  jest.setTimeout(10000);
  test('installation script exists and is executable', () => {
    expect(fs.existsSync(INSTALL_SCRIPT)).toBe(true);

    const stats = fs.statSync(INSTALL_SCRIPT);
    const isExecutable = (stats.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  jest.setTimeout(10000);
  test('installation script has correct shebang', () => {
    const content = fs.readFileSync(INSTALL_SCRIPT, 'utf8');
    expect(content.startsWith('#!/bin/bash')).toBe(true);
  });

  jest.setTimeout(10000);
  test('installation script checks for required dependencies', () => {
    const content = fs.readFileSync(INSTALL_SCRIPT, 'utf8');
    expect(content).toContain('sqlite3');
    expect(content).toContain('git');
  });

  jest.setTimeout(10000);
  test('installation script creates backup of existing hook', () => {
    const content = fs.readFileSync(INSTALL_SCRIPT, 'utf8');
    expect(content).toContain('backup');
    expect(content).toContain('BACKUP_FILE');
  });
});
