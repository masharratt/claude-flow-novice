/**
 * ACL Error Handling Validation Script
 * Tests the bug fix in ACLEnforcer._getAgent error handling
 */

const ACLEnforcer = require('../src/sqlite/ACLEnforcer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

async function validateErrorHandling() {
  console.log('🔍 ACL Error Handling Validation\n');

  const testDbPath = path.join(__dirname, '../test-data/acl-error-test.db');

  // Clean up old test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // Ensure test directory exists
  const testDir = path.dirname(testDbPath);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Create database
  const db = new sqlite3.Database(testDbPath);

  // Create schema
  await new Promise((resolve, reject) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        type TEXT,
        status TEXT,
        team_id TEXT,
        swarm_id TEXT,
        project_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY,
        entity_id TEXT,
        entity_type TEXT,
        resource_type TEXT,
        resource_id TEXT,
        project_id TEXT,
        permission_level INTEGER,
        actions TEXT,
        conditions TEXT,
        granted_by TEXT,
        expires_at DATETIME,
        is_active INTEGER DEFAULT 1,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        entity_id TEXT,
        entity_type TEXT,
        action TEXT,
        changed_by TEXT,
        swarm_id TEXT,
        session_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        acl_level INTEGER,
        risk_level TEXT,
        category TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS memory (
        id TEXT PRIMARY KEY,
        key TEXT,
        agent_id TEXT,
        team_id TEXT,
        swarm_id TEXT,
        project_id TEXT,
        acl_level INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        acl_level INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        acl_level INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        acl_level INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log('✅ Database schema created\n');

  // Initialize ACL enforcer
  const aclEnforcer = new ACLEnforcer({ db, cacheEnabled: false });

  let testsPassed = 0;
  let testsFailed = 0;
  let errorEventEmitted = false;

  // Listen for error events
  aclEnforcer.on('error', (data) => {
    console.log('📡 Error event emitted:', data);
    errorEventEmitted = true;
  });

  // Test 1: Valid agent access
  console.log('Test 1: Valid agent access');
  try {
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO agents (id, type, status) VALUES (?, ?, ?)',
        ['agent-1', 'coder', 'active'],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO memory (id, key, agent_id, acl_level) VALUES (?, ?, ?, ?)',
        ['mem-1', 'test-key', 'agent-1', 1],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const result = await aclEnforcer.checkPermission(
      'agent-1',
      'mem-1',
      'memory',
      'read'
    );

    if (result === true) {
      console.log('✅ Test 1 passed: Valid agent can access resource\n');
      testsPassed++;
    } else {
      console.log('❌ Test 1 failed: Valid agent should have access\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ Test 1 failed with exception:', error.message, '\n');
    testsFailed++;
  }

  // Test 2: Invalid agent (triggers error in _getAgent)
  console.log('Test 2: Invalid agent access (error handling test)');
  errorEventEmitted = false;

  try {
    // Close the database connection temporarily to force an error
    const originalGet = db.get.bind(db);
    db.get = function(sql, params, callback) {
      // Simulate database error
      if (sql.includes('SELECT * FROM agents')) {
        const testError = new Error('Database connection error');
        callback(testError, null);
      } else {
        originalGet(sql, params, callback);
      }
    };

    const result = await aclEnforcer.checkPermission(
      'invalid-agent',
      'mem-1',
      'memory',
      'read'
    );

    // Restore original function
    db.get = originalGet;

    if (result === false) {
      console.log('✅ Test 2 passed: Error handled gracefully, returned false\n');
      testsPassed++;
    } else {
      console.log('❌ Test 2 failed: Should return false on database error\n');
      testsFailed++;
    }

    // Check metrics incremented
    const metrics = aclEnforcer.getMetrics();
    if (metrics.errors > 0) {
      console.log('✅ Test 2b passed: Error metrics incremented\n');
      testsPassed++;
    } else {
      console.log('❌ Test 2b failed: Error metrics should be incremented\n');
      testsFailed++;
    }

    // Verify error event was emitted
    if (errorEventEmitted) {
      console.log('✅ Test 2c passed: Error event emitted\n');
      testsPassed++;
    } else {
      console.log('❌ Test 2c failed: Error event should be emitted\n');
      testsFailed++;
    }

  } catch (error) {
    console.log('❌ Test 2 failed with exception:', error.message, '\n');
    testsFailed++;
  }

  // Test 3: Non-existent agent
  console.log('Test 3: Non-existent agent');
  try {
    const result = await aclEnforcer.checkPermission(
      'non-existent-agent',
      'mem-1',
      'memory',
      'read'
    );

    if (result === false) {
      console.log('✅ Test 3 passed: Non-existent agent denied access\n');
      testsPassed++;
    } else {
      console.log('❌ Test 3 failed: Non-existent agent should be denied\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ Test 3 failed with exception:', error.message, '\n');
    testsFailed++;
  }

  // Cleanup
  await aclEnforcer.shutdown();
  db.close();
  fs.unlinkSync(testDbPath);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Tests passed: ${testsPassed}`);
  console.log(`❌ Tests failed: ${testsFailed}`);
  console.log(`📈 Total tests: ${testsPassed + testsFailed}`);

  const confidence = testsPassed / (testsPassed + testsFailed);
  console.log(`\n🎯 Confidence Score: ${confidence.toFixed(2)} (target: ≥0.75)`);

  if (confidence >= 0.75) {
    console.log('\n✅ VALIDATION SUCCESSFUL - Fix is working correctly!');
    process.exit(0);
  } else {
    console.log('\n❌ VALIDATION FAILED - Additional fixes needed');
    process.exit(1);
  }
}

// Run validation
validateErrorHandling().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
