#!/usr/bin/env node

/**
 * Backend API Test Suite
 * 
 * Tests the CFN Loop Dashboard backend API endpoints
 * to ensure they work correctly and handle various scenarios.
 */

const http = require('http');
const path = require('path');

// Test configuration
const BASE_URL = 'http://localhost:3002';
const TEST_TASK_ID = 'test-task-' + Date.now();

// Utility function to make HTTP requests
function makeRequest(endpoint, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, BASE_URL);
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

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

// Test cases
const tests = [
    {
        name: 'Health Check',
        endpoint: '/health',
        method: 'GET',
        expectedStatus: 200
    },
    {
        name: 'Dashboard Metrics',
        endpoint: '/api/metrics',
        method: 'GET',
        expectedStatus: 200
    },
    {
        name: 'Tasks List',
        endpoint: '/api/tasks',
        method: 'GET',
        expectedStatus: 200
    },
    {
        name: 'Agents List',
        endpoint: '/api/agents',
        method: 'GET',
        expectedStatus: 200
    },
    {
        name: 'Events List',
        endpoint: '/api/events',
        method: 'GET',
        expectedStatus: 200
    },
    {
        name: 'Performance Analytics',
        endpoint: '/api/analytics/performance',
        method: 'GET',
        expectedStatus: 200
    },
    {
        name: 'Create Test Event',
        endpoint: '/api/events',
        method: 'POST',
        expectedStatus: 200,
        data: {
            task_id: TEST_TASK_ID,
            agent_id: 'test-agent',
            loop: 'loop3',
            iteration: 1,
            event_type: 'test_event',
            level: 'INFO',
            message: 'Test event from backend validation',
            metadata: { test: true }
        }
    },
    {
        name: 'Event Subscription Info',
        endpoint: '/api/events/subscribe',
        method: 'POST',
        expectedStatus: 200,
        data: {
            task_id: TEST_TASK_ID,
            event_types: ['test_event']
        }
    },
    {
        name: 'Task Details (Non-existent)',
        endpoint: `/api/tasks/${TEST_TASK_ID}`,
        method: 'GET',
        expectedStatus: 404
    }
];

// Run tests
async function runTests() {
    console.log('🧪 Starting CFN Loop Dashboard Backend API Tests...\n');
    
    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            console.log(`📋 Testing: ${test.name}`);
            
            const endpoint = test.endpoint;
            const response = await makeRequest(endpoint, test.method, test.data);
            
            if (response.statusCode === test.expectedStatus) {
                console.log(`✅ ${test.name} - PASSED (${response.statusCode})`);
                
                // Validate response structure
                if (test.expectedStatus === 200 && response.data && typeof response.data === 'object') {
                    console.log(`   📊 Response structure: Valid`);
                }
                
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
    console.log('📈 Test Results Summary:');
    console.log(`   Total tests: ${tests.length}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📊 Pass rate: ${Math.round((passed / tests.length) * 100)}%`);

    if (failed === 0) {
        console.log('\n🎉 All tests passed! Backend API is functioning correctly.');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some tests failed. Please check the backend implementation.');
        process.exit(1);
    }
}

// Check if server is running
async function checkServer() {
    try {
        console.log('🔍 Checking if dashboard server is running...');
        const response = await makeRequest('/health');
        if (response.statusCode === 200) {
            console.log('✅ Dashboard server is running');
            await runTests();
        } else {
            console.log('❌ Dashboard server responded with unexpected status');
            process.exit(1);
        }
    } catch (error) {
        console.log('❌ Dashboard server is not running or not accessible');
        console.log('   Please start the server first: node dashboard/server.js');
        console.log(`   Expected URL: ${BASE_URL}`);
        process.exit(1);
    }
}

// Run the test suite
if (require.main === module) {
    checkServer();
}

module.exports = { makeRequest, runTests, checkServer };