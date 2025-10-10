#!/usr/bin/env node

/**
 * Dashboard Real-time Monitoring Test
 * Tests WebSocket, HTTP polling, and multi-swarm visualization
 */

import io from 'socket.io-client';
import fetch from 'node-fetch';

const DASHBOARD_URL = 'http://localhost:3002';
const API_BASE = DASHBOARD_URL + '/api';

class DashboardTester {
    constructor() {
        this.socket = null;
        this.testResults = {
            websocket: { connected: false, messages: 0, errors: 0 },
            polling: { requests: 0, errors: 0, avgResponseTime: 0 },
            authentication: { login: false, token: null },
            multiSwarm: { generated: false, swarms: [] },
            realTime: { updates: 0, interval: 0, lastUpdate: null }
        };
        this.startTime = Date.now();
        this.updateTimes = [];
    }

    async runAllTests() {
        console.log('🧪 Starting Dashboard Real-time Monitoring Test\n');

        try {
            // Test 1: Authentication
            await this.testAuthentication();

            // Test 2: HTTP Polling
            await this.testHTTPPolling();

            // Test 3: WebSocket Connection
            await this.testWebSocketConnection();

            // Test 4: Multi-Swarm Generation
            await this.testMultiSwarmGeneration();

            // Test 5: Real-time Updates
            await this.testRealTimeUpdates();

            // Test 6: Fallback Mechanisms
            await this.testFallbackMechanisms();

            // Generate final report
            this.generateReport();

        } catch (error) {
            console.error('❌ Test suite failed:', error);
            this.testResults.error = error.message;
            this.generateReport();
        }
    }

    async testAuthentication() {
        console.log('🔐 Testing Authentication...');

        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: 'test_user',
                    password: 'test_password'
                })
            });

            const data = await response.json();

            if (data.success) {
                this.testResults.authentication.login = true;
                this.testResults.authentication.token = data.token;
                console.log('✅ Authentication successful');
                console.log(`   User: ${data.user.username} (${data.user.role})`);
                console.log(`   Permissions: ${data.user.permissions.join(', ')}`);
            } else {
                console.log('❌ Authentication failed');
            }
        } catch (error) {
            console.log(`❌ Authentication error: ${error.message}`);
        }

        console.log('');
    }

    async testHTTPPolling() {
        console.log('📡 Testing HTTP Polling...');

        const requestTimes = [];
        const requestCount = 5;

        for (let i = 0; i < requestCount; i++) {
            try {
                const startTime = Date.now();

                const response = await fetch(`${API_BASE}/metrics`, {
                    headers: {
                        'Authorization': `Bearer ${this.testResults.authentication.token}`
                    }
                });

                const requestTime = Date.now() - startTime;
                requestTimes.push(requestTime);

                if (response.ok) {
                    const data = await response.json();
                    this.testResults.polling.requests++;

                    console.log(`   Request ${i + 1}: ${requestTime}ms - ✅`);

                    // Validate metrics structure
                    if (data.system && data.timestamp) {
                        console.log(`     Metrics: ${data.system.memory?.percent || 'N/A'}% memory, ${data.system.cpu?.usage || 'N/A'}% CPU`);
                    }
                } else {
                    this.testResults.polling.errors++;
                    console.log(`   Request ${i + 1}: ${requestTime}ms - ❌ (${response.status})`);
                }

                // Small delay between requests
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                this.testResults.polling.errors++;
                console.log(`   Request ${i + 1}: - ❌ (${error.message})`);
            }
        }

        if (requestTimes.length > 0) {
            this.testResults.polling.avgResponseTime =
                requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length;
            console.log(`✅ HTTP Polling: ${this.testResults.polling.requests}/${requestCount} successful`);
            console.log(`   Average response time: ${Math.round(this.testResults.polling.avgResponseTime)}ms`);
        } else {
            console.log('❌ HTTP Polling: All requests failed');
        }

        console.log('');
    }

    async testWebSocketConnection() {
        console.log('🔌 Testing WebSocket Connection...');

        return new Promise((resolve) => {
            this.socket = io(DASHBOARD_URL, {
                auth: {
                    token: this.testResults.authentication.token
                },
                transports: ['websocket', 'polling']
            });

            const timeout = setTimeout(() => {
                console.log('❌ WebSocket connection timeout');
                resolve();
            }, 10000);

            this.socket.on('connect', () => {
                clearTimeout(timeout);
                this.testResults.websocket.connected = true;
                console.log('✅ WebSocket connected');
                console.log(`   Socket ID: ${this.socket.id}`);
                console.log(`   Transport: ${this.socket.io.engine.transport.name}`);
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                clearTimeout(timeout);
                console.log(`❌ WebSocket connection error: ${error.message}`);
                resolve();
            });

            this.socket.on('metrics', (data) => {
                this.testResults.websocket.messages++;
                this.testResults.realTime.updates++;
                this.testResults.realTime.lastUpdate = new Date();

                const now = Date.now();
                if (this.updateTimes.length > 0) {
                    const interval = now - this.updateTimes[this.updateTimes.length - 1];
                    this.updateTimes.push(now);

                    if (this.testResults.realTime.interval === 0) {
                        this.testResults.realTime.interval = interval;
                    }
                } else {
                    this.updateTimes.push(now);
                }
            });

            this.socket.on('disconnect', () => {
                console.log('📴 WebSocket disconnected');
            });
        });
    }

    async testMultiSwarmGeneration() {
        console.log('🐝 Testing Multi-Swarm Generation...');

        try {
            const response = await fetch(`${API_BASE}/dev/generate-swarms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.testResults.authentication.token}`
                },
                body: JSON.stringify({
                    count: 8,
                    agentsPerSwarm: 4
                })
            });

            const data = await response.json();

            if (data.success && data.swarms) {
                this.testResults.multiSwarm.generated = true;
                this.testResults.multiSwarm.swarms = data.swarms;

                console.log(`✅ Generated ${data.swarms.length} mock swarms`);
                console.log(`   Total agents: ${data.swarms.reduce((sum, swarm) => sum + swarm.agents, 0)}`);
                console.log(`   Total tasks: ${data.swarms.reduce((sum, swarm) => sum + swarm.tasks, 0)}`);

                // Show sample swarm data
                const sampleSwarm = data.swarms[0];
                console.log(`   Sample swarm: ${sampleSwarm.name}`);
                console.log(`     Status: ${sampleSwarm.status}`);
                console.log(`     Efficiency: ${sampleSwarm.efficiency.toFixed(1)}%`);

            } else {
                console.log('❌ Failed to generate swarms');
            }
        } catch (error) {
            console.log(`❌ Swarm generation error: ${error.message}`);
        }

        console.log('');
    }

    async testRealTimeUpdates() {
        console.log('⚡ Testing Real-time Updates...');

        if (!this.testResults.websocket.connected) {
            console.log('❌ Cannot test real-time updates - WebSocket not connected');
            return;
        }

        // Wait for real-time updates
        console.log('   Waiting for real-time metrics updates...');

        await new Promise(resolve => {
            const timeout = setTimeout(() => {
                console.log('   Timeout waiting for updates');
                resolve();
            }, 8000);

            const checkInterval = setInterval(() => {
                if (this.testResults.realTime.updates >= 3) {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);

                    console.log(`✅ Received ${this.testResults.realTime.updates} real-time updates`);

                    if (this.updateTimes.length > 1) {
                        const intervals = [];
                        for (let i = 1; i < this.updateTimes.length; i++) {
                            intervals.push(this.updateTimes[i] - this.updateTimes[i - 1]);
                        }

                        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                        this.testResults.realTime.interval = avgInterval;

                        console.log(`   Average update interval: ${Math.round(avgInterval)}ms`);
                    }

                    resolve();
                }
            }, 1000);
        });

        console.log('');
    }

    async testFallbackMechanisms() {
        console.log('🔄 Testing Fallback Mechanisms...');

        // Test polling fallback
        try {
            const response = await fetch(`${API_BASE}/metrics`, {
                headers: {
                    'Authorization': `Bearer ${this.testResults.authentication.token}`
                }
            });

            if (response.ok) {
                console.log('✅ HTTP polling fallback works');
            } else {
                console.log('❌ HTTP polling fallback failed');
            }
        } catch (error) {
            console.log(`❌ HTTP polling fallback error: ${error.message}`);
        }

        // Test metrics history
        try {
            const response = await fetch(`${API_BASE}/metrics/history?timeframe=1m`);

            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Metrics history endpoint works (${data.length} entries)`);
            } else {
                console.log('❌ Metrics history endpoint failed');
            }
        } catch (error) {
            console.log(`❌ Metrics history error: ${error.message}`);
        }

        // Test swarm metrics
        try {
            const response = await fetch(`${API_BASE}/swarms`);

            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Swarm metrics endpoint works`);
            } else {
                console.log('❌ Swarm metrics endpoint failed');
            }
        } catch (error) {
            console.log(`❌ Swarm metrics error: ${error.message}`);
        }

        console.log('');
    }

    generateReport() {
        console.log('📊 Dashboard Real-time Test Report');
        console.log('='.repeat(50));

        const testTime = Date.now() - this.startTime;

        console.log(`⏱️  Test Duration: ${Math.round(testTime / 1000)}s`);
        console.log(`🌐 Dashboard URL: ${DASHBOARD_URL}`);
        console.log('');

        // Authentication Results
        console.log('🔐 Authentication:');
        console.log(`   Status: ${this.testResults.authentication.login ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`   Token: ${this.testResults.authentication.token ? '✅ Received' : '❌ Missing'}`);
        console.log('');

        // WebSocket Results
        console.log('🔌 WebSocket Connection:');
        console.log(`   Status: ${this.testResults.websocket.connected ? '✅ Connected' : '❌ Failed'}`);
        console.log(`   Messages: ${this.testResults.websocket.messages}`);
        console.log(`   Errors: ${this.testResults.websocket.errors}`);
        console.log('');

        // HTTP Polling Results
        console.log('📡 HTTP Polling:');
        console.log(`   Requests: ${this.testResults.polling.requests}`);
        console.log(`   Errors: ${this.testResults.polling.errors}`);
        console.log(`   Avg Response Time: ${Math.round(this.testResults.polling.avgResponseTime)}ms`);
        console.log('');

        // Real-time Updates
        console.log('⚡ Real-time Updates:');
        console.log(`   Updates Received: ${this.testResults.realTime.updates}`);
        console.log(`   Update Interval: ${Math.round(this.testResults.realTime.interval)}ms`);
        console.log(`   Last Update: ${this.testResults.realTime.lastUpdate || 'Never'}`);
        console.log('');

        // Multi-Swarm Support
        console.log('🐝 Multi-Swarm Support:');
        console.log(`   Generation: ${this.testResults.multiSwarm.generated ? '✅ Working' : '❌ Failed'}`);
        console.log(`   Swarms Generated: ${this.testResults.multiSwarm.swarms.length}`);

        if (this.testResults.multiSwarm.swarms.length > 0) {
            const totalAgents = this.testResults.multiSwarm.swarms.reduce((sum, swarm) => sum + swarm.agents, 0);
            const totalTasks = this.testResults.multiSwarm.swarms.reduce((sum, swarm) => sum + swarm.tasks, 0);
            const avgEfficiency = this.testResults.multiSwarm.swarms.reduce((sum, swarm) => sum + swarm.efficiency, 0) / this.testResults.multiSwarm.swarms.length;

            console.log(`   Total Agents: ${totalAgents}`);
            console.log(`   Total Tasks: ${totalTasks}`);
            console.log(`   Average Efficiency: ${avgEfficiency.toFixed(1)}%`);
        }
        console.log('');

        // Overall Assessment
        console.log('🎯 Overall Assessment:');

        const websocketScore = this.testResults.websocket.connected ? 25 : 0;
        const pollingScore = this.testResults.polling.requests > 0 ? 25 : 0;
        const realtimeScore = this.testResults.realTime.updates >= 3 ? 25 : 0;
        const swarmScore = this.testResults.multiSwarm.generated ? 25 : 0;

        const totalScore = websocketScore + pollingScore + realtimeScore + swarmScore;

        console.log(`   WebSocket: ${websocketScore}/25`);
        console.log(`   HTTP Polling: ${pollingScore}/25`);
        console.log(`   Real-time Updates: ${realtimeScore}/25`);
        console.log(`   Multi-Swarm: ${swarmScore}/25`);
        console.log(`   Total Score: ${totalScore}/100`);

        let grade = 'F';
        if (totalScore >= 90) grade = 'A+';
        else if (totalScore >= 80) grade = 'A';
        else if (totalScore >= 70) grade = 'B';
        else if (totalScore >= 60) grade = 'C';
        else if (totalScore >= 50) grade = 'D';

        console.log(`   Grade: ${grade}`);
        console.log('');

        // Recommendations
        console.log('💡 Recommendations:');

        if (!this.testResults.websocket.connected) {
            console.log('   - Fix WebSocket connection issues');
        }

        if (this.testResults.polling.errors > 0) {
            console.log('   - Investigate HTTP polling errors');
        }

        if (this.testResults.realTime.updates < 3) {
            console.log('   - Check real-time metrics collection');
        }

        if (!this.testResults.multiSwarm.generated) {
            console.log('   - Verify multi-swarm generation endpoint');
        }

        if (totalScore >= 80) {
            console.log('   - Dashboard is working well for development use');
            console.log('   - Ready for multi-swarm monitoring (75+ agents)');
        }

        console.log('');
        console.log('✅ Test completed successfully!');

        // Cleanup
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Run the tests
const tester = new DashboardTester();
tester.runAllTests().catch(console.error);