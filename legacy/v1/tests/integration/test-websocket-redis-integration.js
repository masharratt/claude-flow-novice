#!/usr/bin/env node

/**
 * WebSocket Redis Integration Test
 *
 * Tests real-time event flow from Redis to Dashboard via WebSocket
 * Phase 5: Validation & Monitoring + Dashboard Integration
 */

import { RealtimeServer } from '../../src/web/dashboard/realtime/RealtimeServer.js';
import WebSocket from 'ws';
import Redis from 'ioredis';

const TEST_PORT = 3002;
const REDIS_HOST = 'localhost';
const REDIS_PORT = 6379;

class WebSocketIntegrationTest {
    constructor() {
        this.server = null;
        this.ws = null;
        this.redis = null;
        this.receivedEvents = [];
        this.testsPassed = 0;
        this.testsFailed = 0;
    }

    async setup() {
        console.log('🔧 Setting up test environment...\n');

        // Initialize Redis client
        this.redis = new Redis({
            host: REDIS_HOST,
            port: REDIS_PORT
        });

        // Test Redis connection
        try {
            await this.redis.ping();
            console.log('✅ Redis connection established');
        } catch (error) {
            console.error('❌ Redis connection failed:', error.message);
            throw error;
        }

        // Clear test data
        await this.redis.flushdb();
        console.log('✅ Redis test database cleared');

        // Start RealtimeServer with Redis monitoring
        this.server = new RealtimeServer({
            port: TEST_PORT,
            enableWebSocket: true,
            enableRedisMonitoring: true,
            redisMonitoringConfig: {
                redisHost: REDIS_HOST,
                redisPort: REDIS_PORT,
                monitoringInterval: 1000 // 1 second for faster testing
            }
        });

        await this.server.start();
        console.log(`✅ RealtimeServer started on port ${TEST_PORT}`);

        // Wait for Redis monitoring to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('✅ Redis monitoring initialized\n');
    }

    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

            this.ws.on('open', () => {
                console.log('✅ WebSocket connection established\n');
                resolve();
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.receivedEvents.push(message);
                    console.log(`📨 Received event: ${message.type}`);
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            });

            this.ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            });

            setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
        });
    }

    async test1_FeedbackMessage() {
        console.log('\n📋 Test 1: Hook Feedback Message');
        console.log('─'.repeat(50));

        const feedbackMessage = {
            timestamp: new Date().toISOString(),
            source: 'test-suite',
            agentId: 'test-agent-1',
            spawnMode: 'cli',
            type: 'ROOT_WARNING',
            file: 'test.txt',
            severity: 'error',
            delivered: false
        };

        // Clear previous events
        this.receivedEvents = [];

        // Publish feedback to Redis
        await this.redis.publish(
            'agent:test-agent-1:feedback',
            JSON.stringify(feedbackMessage)
        );

        console.log('✅ Published feedback to Redis');

        // Wait for WebSocket event
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if event was received
        const feedbackEvent = this.receivedEvents.find(
            e => e.type === 'redis_feedback'
        );

        if (feedbackEvent) {
            console.log('✅ Feedback event received via WebSocket');
            console.log('   Agent ID:', feedbackEvent.payload.agentId);
            console.log('   Type:', feedbackEvent.payload.type);
            console.log('   Severity:', feedbackEvent.payload.severity);
            this.testsPassed++;
            return true;
        } else {
            console.error('❌ Feedback event not received');
            this.testsFailed++;
            return false;
        }
    }

    async test2_CoordinationEvent() {
        console.log('\n📋 Test 2: CFN Loop Coordination Event');
        console.log('─'.repeat(50));

        const coordMessage = {
            timestamp: new Date().toISOString(),
            phase: 'test-phase',
            loop: 3,
            status: 'complete',
            agentId: 'coder-1'
        };

        // Clear previous events
        this.receivedEvents = [];

        // Push to CFN Loop coordination channel
        await this.redis.lpush(
            'swarm:cfn:mvp:test-phase:loop3:complete',
            JSON.stringify(coordMessage)
        );

        console.log('✅ Published coordination event to Redis');

        // Wait for monitoring service to poll (1 second interval + processing)
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if queue status was updated
        const queueEvent = this.receivedEvents.find(
            e => e.type === 'redis_queue_status'
        );

        if (queueEvent) {
            console.log('✅ Queue status event received via WebSocket');
            console.log('   Channel:', queueEvent.payload.channel);
            console.log('   Length:', queueEvent.payload.length);
            this.testsPassed++;
            return true;
        } else {
            console.error('❌ Queue status event not received');
            this.testsFailed++;
            return false;
        }
    }

    async test3_RestApiEndpoints() {
        console.log('\n📋 Test 3: REST API Endpoints');
        console.log('─'.repeat(50));

        const endpoints = [
            '/api/redis/feedback',
            '/api/redis/metrics',
            '/api/redis/queues',
            '/api/redis/violations',
            '/api/redis/coordination'
        ];

        let allPassed = true;

        for (const endpoint of endpoints) {
            try {
                const response = await fetch(`http://localhost:${TEST_PORT}${endpoint}`);

                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ ${endpoint} - Status: ${response.status}`);
                } else {
                    console.error(`❌ ${endpoint} - Status: ${response.status}`);
                    allPassed = false;
                }
            } catch (error) {
                console.error(`❌ ${endpoint} - Error: ${error.message}`);
                allPassed = false;
            }
        }

        if (allPassed) {
            this.testsPassed++;
            return true;
        } else {
            this.testsFailed++;
            return false;
        }
    }

    async test4_MetricsUpdate() {
        console.log('\n📋 Test 4: Metrics Update Event');
        console.log('─'.repeat(50));

        // Clear previous events
        this.receivedEvents = [];

        // Wait for metrics polling cycle (happens every 1 second)
        console.log('⏳ Waiting for metrics update...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if metrics event was received
        const metricsEvent = this.receivedEvents.find(
            e => e.type === 'redis_metrics'
        );

        if (metricsEvent) {
            console.log('✅ Metrics event received via WebSocket');
            console.log('   Active Channels:', metricsEvent.payload.activeChannels);
            console.log('   Total Messages:', metricsEvent.payload.totalMessages);
            this.testsPassed++;
            return true;
        } else {
            console.error('❌ Metrics event not received');
            this.testsFailed++;
            return false;
        }
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up...\n');

        if (this.ws) {
            this.ws.close();
            console.log('✅ WebSocket connection closed');
        }

        if (this.redis) {
            await this.redis.quit();
            console.log('✅ Redis connection closed');
        }

        if (this.server) {
            // Note: RealtimeServer doesn't expose shutdown method publicly
            // In production, use proper lifecycle management
            console.log('✅ Server cleanup initiated');
        }
    }

    async run() {
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║   WebSocket Redis Integration Test Suite                 ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');

        try {
            // Setup
            await this.setup();

            // Connect WebSocket
            await this.connectWebSocket();

            // Run tests
            await this.test1_FeedbackMessage();
            await this.test2_CoordinationEvent();
            await this.test3_RestApiEndpoints();
            await this.test4_MetricsUpdate();

            // Summary
            console.log('\n╔═══════════════════════════════════════════════════════════╗');
            console.log('║   Test Summary                                            ║');
            console.log('╚═══════════════════════════════════════════════════════════╝\n');
            console.log(`✅ Passed: ${this.testsPassed}`);
            console.log(`❌ Failed: ${this.testsFailed}`);
            console.log(`📊 Total: ${this.testsPassed + this.testsFailed}`);
            console.log('');

            if (this.testsFailed === 0) {
                console.log('🎉 All tests passed!\n');
                process.exit(0);
            } else {
                console.log('⚠️  Some tests failed\n');
                process.exit(1);
            }

        } catch (error) {
            console.error('\n❌ Test suite failed:', error.message);
            console.error(error.stack);
            process.exit(1);

        } finally {
            await this.cleanup();
        }
    }
}

// Run tests
const test = new WebSocketIntegrationTest();
test.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
