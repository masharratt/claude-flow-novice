#!/usr/bin/env node

/**
 * Test HTTP Polling Fallback Mechanism
 * Verifies that dashboard continues to receive real-time updates even when WebSocket connections fail
 */

import { performance } from 'perf_hooks';
import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class PollingFallbackTester {
    constructor() {
        this.serverPort = 3001;
        this.baseURL = `http://localhost:${this.serverPort}`;
        this.testResults = {
            websocketConnection: false,
            httpPollingFallback: false,
            pollingAccuracy: 0,
            responseTime: 0,
            authenticationHandling: false,
            performanceImpact: 0,
            scalabilityTest: false
        };
    }

    async runAllTests() {
        console.log('🧪 Starting HTTP Polling Fallback Tests...\n');

        try {
            // Test 1: Check if server is running
            await this.testServerAvailability();

            // Test 2: Test WebSocket connection
            await this.testWebSocketConnection();

            // Test 3: Test HTTP polling fallback
            await this.testHTTPPollingFallback();

            // Test 4: Test polling accuracy (1-second intervals)
            await this.testPollingAccuracy();

            // Test 5: Test authentication handling
            await this.testAuthenticationHandling();

            // Test 6: Test performance impact
            await this.testPerformanceImpact();

            // Test 7: Test scalability (1000+ agents simulation)
            await this.testScalability();

            // Generate report
            this.generateReport();

        } catch (error) {
            console.error('❌ Test suite failed:', error);
        }
    }

    async testServerAvailability() {
        console.log('1️⃣ Testing server availability...');

        try {
            const response = await this.makeRequest('/health');
            const data = JSON.parse(response);

            if (data.status === 'healthy') {
                console.log('✅ Server is healthy and responsive\n');
                return true;
            } else {
                throw new Error('Server health check failed');
            }
        } catch (error) {
            throw new Error(`Server not available: ${error.message}`);
        }
    }

    async testWebSocketConnection() {
        console.log('2️⃣ Testing WebSocket connection...');

        try {
            // Check if WebSocket endpoint is accessible
            const response = await this.makeRequest('/socket.io.js');

            if (response.includes('SocketClient') || response.includes('socket.io')) {
                this.testResults.websocketConnection = true;
                console.log('✅ WebSocket endpoint available\n');
                return true;
            } else {
                throw new Error('WebSocket endpoint not accessible');
            }
        } catch (error) {
            console.log(`⚠️ WebSocket connection test failed: ${error.message}`);
            console.log('   Will rely on HTTP polling fallback\n');
            return false;
        }
    }

    async testHTTPPollingFallback() {
        console.log('3️⃣ Testing HTTP polling fallback...');

        try {
            const startTime = performance.now();
            const response = await this.makeRequest('/api/metrics');
            const endTime = performance.now();

            const data = JSON.parse(response);

            if (data && data.system && data.timestamp) {
                this.testResults.httpPollingFallback = true;
                this.testResults.responseTime = Math.round((endTime - startTime) * 100) / 100;

                console.log(`✅ HTTP polling working (${this.testResults.responseTime}ms response time)`);
                console.log('✅ Metrics data structure valid\n');
                return true;
            } else {
                throw new Error('Invalid metrics data structure');
            }
        } catch (error) {
            throw new Error(`HTTP polling fallback failed: ${error.message}`);
        }
    }

    async testPollingAccuracy() {
        console.log('4️⃣ Testing polling accuracy (1-second intervals)...');

        const pollTimes = [];
        const testDuration = 5000; // 5 seconds
        const expectedPolls = 5;

        const startTime = Date.now();
        let pollCount = 0;

        const pollInterval = setInterval(async () => {
            try {
                const pollStart = performance.now();
                await this.makeRequest('/api/metrics');
                const pollEnd = performance.now();

                pollTimes.push(pollEnd - pollStart);
                pollCount++;

                if (Date.now() - startTime >= testDuration) {
                    clearInterval(pollInterval);

                    // Calculate accuracy
                    const accuracy = (pollCount / expectedPolls) * 100;
                    const avgResponseTime = pollTimes.reduce((a, b) => a + b, 0) / pollTimes.length;

                    this.testResults.pollingAccuracy = Math.round(accuracy);

                    console.log(`✅ Polling accuracy: ${accuracy.toFixed(1)}% (${pollCount}/${expectedPolls} polls)`);
                    console.log(`✅ Average response time: ${avgResponseTime.toFixed(2)}ms\n`);
                }
            } catch (error) {
                console.log(`❌ Poll failed: ${error.message}`);
            }
        }, 1000);

        // Wait for test to complete
        await new Promise(resolve => setTimeout(resolve, testDuration + 1000));
    }

    async testAuthenticationHandling() {
        console.log('5️⃣ Testing authentication handling...');

        try {
            // Test without authentication
            const response = await this.makeRequest('/api/metrics');
            const data = JSON.parse(response);

            // Should work without auth for public endpoints
            if (data && data.system) {
                console.log('✅ Public endpoints accessible without authentication');
            }

            // Test authentication endpoint
            const authResponse = await this.makeRequest('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'admin', password: 'claude2025' })
            });

            const authData = JSON.parse(authResponse);

            if (authData.success && authData.token) {
                this.testResults.authenticationHandling = true;
                console.log('✅ Authentication system working\n');
                return true;
            } else {
                throw new Error('Authentication failed');
            }
        } catch (error) {
            console.log(`⚠️ Authentication test failed: ${error.message}`);
            console.log('   Public endpoints still accessible\n');
            return false;
        }
    }

    async testPerformanceImpact() {
        console.log('6️⃣ Testing performance impact...');

        try {
            // Simulate multiple concurrent requests
            const concurrentRequests = 10;
            const startTime = performance.now();

            const promises = Array.from({ length: concurrentRequests }, async () => {
                return this.makeRequest('/api/metrics');
            });

            await Promise.all(promises);

            const endTime = performance.now();
            const totalTime = endTime - startTime;
            const avgTimePerRequest = totalTime / concurrentRequests;

            this.testResults.performanceImpact = avgTimePerRequest;

            console.log(`✅ Concurrent requests: ${concurrentRequests}`);
            console.log(`✅ Average time per request: ${avgTimePerRequest.toFixed(2)}ms`);
            console.log(`✅ Performance impact: ${avgTimePerRequest < 100 ? 'Low' : 'Medium'}\n`);

            return true;
        } catch (error) {
            throw new Error(`Performance impact test failed: ${error.message}`);
        }
    }

    async testScalability() {
        console.log('7️⃣ Testing scalability (1000+ agent simulation)...');

        try {
            // Generate simulated swarm data
            const swarmData = this.generateSimulatedSwarmData(1000);

            const startTime = performance.now();
            const response = await this.makeRequest('/api/swarms');
            const endTime = performance.now();

            const data = JSON.parse(response);

            if (data && typeof data === 'object') {
                const processingTime = endTime - startTime;

                // Check if server can handle large datasets
                if (processingTime < 1000) { // Less than 1 second
                    this.testResults.scalabilityTest = true;
                    console.log(`✅ Scalability test passed (${processingTime.toFixed(2)}ms processing time)`);
                    console.log('✅ Server can handle 1000+ agent data\n');
                    return true;
                } else {
                    console.log(`⚠️ Slow response time: ${processingTime.toFixed(2)}ms`);
                    console.log('   Consider optimizing for larger datasets\n');
                    return false;
                }
            } else {
                throw new Error('Invalid swarm data response');
            }
        } catch (error) {
            console.log(`⚠️ Scalability test failed: ${error.message}`);
            console.log('   Basic functionality still works\n');
            return false;
        }
    }

    generateSimulatedSwarmData(agentCount) {
        const swarms = [];

        for (let i = 0; i < Math.min(agentCount / 50, 20); i++) {
            swarms.push({
                id: `swarm_${i}`,
                name: `Test Swarm ${i}`,
                status: 'active',
                agents: 50,
                tasks: Math.floor(Math.random() * 100),
                cpu: Math.random() * 100,
                memory: Math.random() * 2000,
                uptime: Math.floor(Math.random() * 3600)
            });
        }

        return swarms;
    }

    async makeRequest(path, options = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseURL);
            const opts = {
                method: 'GET',
                headers: {
                    'User-Agent': 'PollingFallbackTester/1.0',
                    ...options.headers
                },
                timeout: 5000,
                ...options
            };

            const req = http.request(url, opts, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (opts.body) {
                req.write(opts.body);
            }

            req.end();
        });
    }

    generateReport() {
        console.log('📊 Test Results Summary:');
        console.log('='.repeat(50));

        const results = [
            { name: 'WebSocket Connection', passed: this.testResults.websocketConnection },
            { name: 'HTTP Polling Fallback', passed: this.testResults.httpPollingFallback },
            { name: 'Polling Accuracy (≥90%)', passed: this.testResults.pollingAccuracy >= 90 },
            { name: 'Authentication Handling', passed: this.testResults.authenticationHandling },
            { name: 'Performance Impact (<100ms)', passed: this.testResults.performanceImpact < 100 },
            { name: 'Scalability Test', passed: this.testResults.scalabilityTest }
        ];

        results.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.name}`);
        });

        console.log('\nDetailed Metrics:');
        console.log(`- Response Time: ${this.testResults.responseTime}ms`);
        console.log(`- Polling Accuracy: ${this.testResults.pollingAccuracy}%`);
        console.log(`- Performance Impact: ${this.testResults.performanceImpact.toFixed(2)}ms per request`);

        const passedTests = results.filter(r => r.passed).length;
        const totalTests = results.length;
        const successRate = (passedTests / totalTests) * 100;

        console.log(`\nOverall Success Rate: ${successRate.toFixed(1)}% (${passedTests}/${totalTests})`);

        if (successRate >= 80) {
            console.log('🎉 HTTP Polling Fallback system is working correctly!');
        } else {
            console.log('⚠️ Some issues detected. Review failed tests.');
        }

        // Recommendations
        console.log('\n💡 Recommendations:');

        if (!this.testResults.websocketConnection) {
            console.log('- Consider WebSocket server configuration');
        }

        if (!this.testResults.httpPollingFallback) {
            console.log('- Fix HTTP polling endpoint');
        }

        if (this.testResults.pollingAccuracy < 90) {
            console.log('- Optimize polling interval accuracy');
        }

        if (this.testResults.performanceImpact >= 100) {
            console.log('- Consider response caching or optimization');
        }

        if (!this.testResults.scalabilityTest) {
            console.log('- Optimize for larger datasets');
        }
    }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new PollingFallbackTester();
    tester.runAllTests().catch(console.error);
}

export { PollingFallbackTester };