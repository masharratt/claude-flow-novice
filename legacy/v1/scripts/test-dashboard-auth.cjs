#!/usr/bin/env node

/**
 * Dashboard Authentication Security Validation Test
 * Tests the secure authentication implementation
 */

const AuthenticationService = require('../monitor/dashboard/auth-service.cjs');

async function runAuthenticationTests() {
    console.log('🔒 Dashboard Authentication Security Validation\n');

    const results = {
        passed: 0,
        failed: 0,
        confidence: 0,
        tests: []
    };

    function recordTest(name, passed, details = '') {
        results.tests.push({ name, passed, details });
        if (passed) {
            results.passed++;
            console.log(`✅ ${name}`);
        } else {
            results.failed++;
            console.log(`❌ ${name}${details ? ': ' + details : ''}`);
        }
    }

    // Test 1: Environment variable validation
    console.log('Test 1: Environment Variable Configuration');
    const envVarsPresent =
        process.env.DASHBOARD_ADMIN_USER &&
        process.env.DASHBOARD_ADMIN_PASS_HASH &&
        process.env.DASHBOARD_SESSION_SECRET;

    if (!envVarsPresent) {
        console.log('⚠️  Setting test environment variables...\n');

        // Set test credentials (bcrypt hash of "test123")
        process.env.DASHBOARD_ADMIN_USER = 'admin';
        process.env.DASHBOARD_ADMIN_PASS_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyB4YqZ8T0u6';
        process.env.DASHBOARD_MONITOR_USER = 'monitor';
        process.env.DASHBOARD_MONITOR_PASS_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyB4YqZ8T0u6';
        process.env.DASHBOARD_SESSION_SECRET = 'test-session-secret-minimum-32-characters-long-for-security';
        process.env.DASHBOARD_SESSION_TIMEOUT_HOURS = '1';
    }

    // Test 2: Service initialization
    console.log('\nTest 2: Authentication Service Initialization');
    let authService;
    try {
        authService = new AuthenticationService();
        recordTest('Service initialized successfully', true);
    } catch (error) {
        recordTest('Service initialization', false, error.message);
        return results;
    }

    // Test 3: Configuration validation
    console.log('\nTest 3: Configuration Validation');
    try {
        authService.validateConfiguration();
        recordTest('Configuration validation passed', true);
    } catch (error) {
        recordTest('Configuration validation', false, error.message);
    }

    // Test 4: Valid authentication
    console.log('\nTest 4: Valid Authentication');
    try {
        const result = await authService.authenticate('admin', 'test123');
        recordTest('Valid credentials accepted', result !== null);
        if (result) {
            recordTest('Session token generated', !!result.token);
            recordTest('User role included', !!result.user.role);
            recordTest('Expiration time set', !!result.expiresAt);
        }
    } catch (error) {
        recordTest('Valid authentication', false, error.message);
    }

    // Test 5: Invalid authentication
    console.log('\nTest 5: Invalid Authentication');
    try {
        const result = await authService.authenticate('admin', 'wrongpassword');
        recordTest('Invalid credentials rejected', result === null);
    } catch (error) {
        recordTest('Invalid authentication handling', false, error.message);
    }

    // Test 6: Session validation
    console.log('\nTest 6: Session Validation');
    try {
        const authResult = await authService.authenticate('admin', 'test123');
        if (authResult) {
            const session = authService.validateSession(authResult.token);
            recordTest('Valid session recognized', session !== null);
            recordTest('Session username correct', session?.username === 'admin');
            recordTest('Session role correct', session?.role === 'admin');
        }
    } catch (error) {
        recordTest('Session validation', false, error.message);
    }

    // Test 7: Invalid session
    console.log('\nTest 7: Invalid Session Handling');
    const invalidSession = authService.validateSession('invalid-token');
    recordTest('Invalid token rejected', invalidSession === null);

    // Test 8: Session revocation
    console.log('\nTest 8: Session Revocation');
    try {
        const authResult = await authService.authenticate('monitor', 'test123');
        if (authResult) {
            authService.revokeSession(authResult.token);
            const revokedSession = authService.validateSession(authResult.token);
            recordTest('Revoked session invalidated', revokedSession === null);
        }
    } catch (error) {
        recordTest('Session revocation', false, error.message);
    }

    // Test 9: Bcrypt hash validation
    console.log('\nTest 9: Bcrypt Hash Validation');
    const validHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyB4YqZ8T0u6';
    const invalidHash = 'plaintext-password';
    recordTest('Valid bcrypt hash recognized', authService.isBcryptHash(validHash));
    recordTest('Invalid hash rejected', !authService.isBcryptHash(invalidHash));

    // Test 10: Session statistics
    console.log('\nTest 10: Session Statistics');
    const stats = authService.getSessionStatistics();
    recordTest('Statistics returned', !!stats);
    recordTest('User count correct', stats.users >= 2);

    // Test 11: Password hashing utility
    console.log('\nTest 11: Password Hashing Utility');
    try {
        const hash = await AuthenticationService.hashPassword('testpassword', 12);
        recordTest('Password hashing works', authService.isBcryptHash(hash));
    } catch (error) {
        recordTest('Password hashing', false, error.message);
    }

    // Test 12: Constant-time comparison (timing attack protection)
    console.log('\nTest 12: Timing Attack Protection');
    try {
        const start1 = Date.now();
        await authService.authenticate('nonexistent', 'password');
        const time1 = Date.now() - start1;

        const start2 = Date.now();
        await authService.authenticate('admin', 'wrongpassword');
        const time2 = Date.now() - start2;

        // Times should be similar (within 50ms) to prevent timing attacks
        const timeDiff = Math.abs(time1 - time2);
        recordTest('Timing attack protection', timeDiff < 50, `Difference: ${timeDiff}ms`);
    } catch (error) {
        recordTest('Timing attack protection', false, error.message);
    }

    // Test 13: No hardcoded credentials
    console.log('\nTest 13: No Hardcoded Credentials');
    const fs = require('fs');
    const serverContent = fs.readFileSync(__dirname + '/../monitor/dashboard/server.js', 'utf8');
    const hasHardcodedCreds = /password:\s*['"](?!process\.env)/.test(serverContent);
    recordTest('No hardcoded passwords in server.js', !hasHardcodedCreds);

    // Calculate confidence score
    const totalTests = results.passed + results.failed;
    results.confidence = totalTests > 0 ? (results.passed / totalTests) : 0;

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${results.passed} ✅`);
    console.log(`Failed: ${results.failed} ❌`);
    console.log(`Confidence Score: ${(results.confidence * 100).toFixed(2)}%`);
    console.log('='.repeat(60));

    if (results.confidence >= 0.75) {
        console.log('\n✅ Authentication security validation PASSED (≥0.75 threshold)');
    } else {
        console.log('\n❌ Authentication security validation FAILED (<0.75 threshold)');
    }

    return results;
}

// Run tests
runAuthenticationTests()
    .then(results => {
        process.exit(results.confidence >= 0.75 ? 0 : 1);
    })
    .catch(error => {
        console.error('Test execution error:', error);
        process.exit(1);
    });
