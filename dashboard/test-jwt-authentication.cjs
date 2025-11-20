#!/usr/bin/env node

/**
 * JWT Authentication Test Suite
 * 
 * Tests JWT authentication requirements for CFN Loop Dashboard endpoints
 * to ensure proper security controls are in place.
 */

const http = require('http');
const jwt = require('jsonwebtoken');

// Test configuration
const BASE_URL = 'http://localhost:3002';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';

// Generate test JWT tokens
function generateValidToken() {
    return jwt.sign(
        { 
            agentId: 'test-agent-1',
            agentType: 'backend-developer',
            permissions: ['read', 'write']
        },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

function generateExpiredToken() {
    return jwt.sign(
        { 
            agentId: 'test-agent-1',
            agentType: 'backend-developer',
            permissions: ['read', 'write']
        },
        JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
    );
}

function generateInvalidToken() {
    return 'invalid.jwt.token';
}

// Utility function to make HTTP requests with authentication
function makeAuthenticatedRequest(endpoint, method = 'GET', data = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, BASE_URL);
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // Add Authorization header if token is provided
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        if (data && method !== 'GET') {
            options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
        }

        const req = http.request(url, options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const response = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: JSON.parse(body)
                    };
                    resolve(response);
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: body
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data && method !== 'GET') {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

// Test cases for JWT authentication
const authenticationTests = [
    {
        name: 'Health Check - No JWT Token (Should Fail)',
        endpoint: '/health',
        method: 'GET',
        token: null,
        expectedStatus: 401,
        description: 'Health endpoint should require JWT authentication'
    },
    {
        name: 'Health Check - Invalid JWT Token (Should Fail)',
        endpoint: '/health',
        method: 'GET',
        token: generateInvalidToken(),
        expectedStatus: 401,
        description: 'Health endpoint should reject invalid JWT tokens'
    },
    {
        name: 'Health Check - Expired JWT Token (Should Fail)',
        endpoint: '/health',
        method: 'GET',
        token: generateExpiredToken(),
        expectedStatus: 401,
        description: 'Health endpoint should reject expired JWT tokens'
    },
    {
        name: 'Health Check - Valid JWT Token (Should Pass)',
        endpoint: '/health',
        method: 'GET',
        token: generateValidToken(),
        expectedStatus: 200,
        description: 'Health endpoint should accept valid JWT tokens'
    },
    {
        name: 'API Metrics - No JWT Token (Should Fail)',
        endpoint: '/api/metrics',
        method: 'GET',
        token: null,
        expectedStatus: 401,
        description: 'API endpoints should require JWT authentication'
    },
    {
        name: 'API Metrics - Valid JWT Token (Should Pass)',
        endpoint: '/api/metrics',
        method: 'GET',
        token: generateValidToken(),
        expectedStatus: 200,
        description: 'API endpoints should accept valid JWT tokens'
    }
];

// Run authentication tests
async function runAuthenticationTests() {
    console.log('🔐 Starting JWT Authentication Tests...\n');
    
    let passed = 0;
    let failed = 0;

    for (const test of authenticationTests) {
        try {
            console.log(`📋 Testing: ${test.name}`);
            console.log(`   Description: ${test.description}`);
            
            const response = await makeAuthenticatedRequest(
                test.endpoint, 
                test.method, 
                test.data, 
                test.token
            );
            
            if (response.statusCode === test.expectedStatus) {
                console.log(`✅ ${test.name} - PASSED (${response.statusCode})`);
                passed++;
            } else {
                console.log(`❌ ${test.name} - FAILED`);
                console.log(`   Expected status: ${test.expectedStatus}, Got: ${response.statusCode}`);
                console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
                failed++;
            }
            
        } catch (error) {
            console.log(`❌ ${test.name} - ERROR`);
            console.log(`   Error: ${error.message}`);
            failed++;
        }
        
        console.log('');
    }

    // Summary
    console.log('📈 Authentication Test Results Summary:');
    console.log(`   Total tests: ${authenticationTests.length}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📊 Pass rate: ${Math.round((passed / authenticationTests.length) * 100)}%`);

    return { passed, failed, total: authenticationTests.length };
}

// Check if server is running
async function checkServer() {
    try {
        console.log('🔍 Checking if dashboard server is running...');
        const response = await makeAuthenticatedRequest('/health');
        
        if (response.statusCode === 200) {
            console.log('✅ Dashboard server is running (currently accepts unauthenticated requests)');
            return true;
        } else if (response.statusCode === 401) {
            console.log('✅ Dashboard server is running (authentication is enabled)');
            return true;
        } else {
            console.log('❌ Dashboard server responded with unexpected status');
            return false;
        }
    } catch (error) {
        console.log('❌ Dashboard server is not running or not accessible');
        console.log('   Please start the server first: node dashboard/server.js');
        console.log(`   Expected URL: ${BASE_URL}`);
        return false;
    }
}

// Run the test suite
async function runTests() {
    const serverRunning = await checkServer();
    if (!serverRunning) {
        process.exit(1);
    }

    const results = await runAuthenticationTests();

    if (results.failed === 0) {
        console.log('\n🎉 All JWT authentication tests passed!');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some authentication tests failed. This is expected before implementing JWT authentication.');
        console.log('   Please implement JWT authentication to secure the endpoints.');
        process.exit(1);
    }
}

// Run the test suite if this file is run directly
if (require.main === module) {
    runTests();
}

module.exports = { 
    makeAuthenticatedRequest, 
    runAuthenticationTests, 
    checkServer,
    generateValidToken,
    generateExpiredToken,
    generateInvalidToken
};