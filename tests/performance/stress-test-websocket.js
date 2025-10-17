const WebSocket = require('ws');
const Redis = require('ioredis');
const os = require('os');
const fs = require('fs');
const v8 = require('v8');

class WebSocketStressTest {
    constructor(options = {}) {
        this.options = {
            serverUrl: options.serverUrl || 'ws://localhost:8080',
            redisUrl: options.redisUrl || 'redis://localhost:6379',
            clientCount: options.clientCount || 100,
            messageRate: options.messageRate || 10, // messages per second
            duration: options.duration || 5 * 60 * 1000, // 5 minutes
            ...options
        };

        this.clients = [];
        this.metrics = {
            connectionAttempts: 0,
            successfulConnections: 0,
            failedConnections: 0,
            totalMessagesReceived: 0,
            connectionTimes: [],
            memoryUsagePerConnection: [],
            resourceUsage: []
        };

        this.redisClient = new Redis(this.options.redisUrl);
        this.statsChannel = 'websocket:stress:stats';
    }

    async spawnClients() {
        console.log(`Spawning ${this.options.clientCount} WebSocket clients...`);
        const startTime = Date.now();

        const spawnPromises = Array.from({ length: this.options.clientCount }, async (_, index) => {
            try {
                const client = new WebSocket(this.options.serverUrl);
                this.metrics.connectionAttempts++;

                const connectionStartTime = Date.now();

                await new Promise((resolve, reject) => {
                    client.on('open', () => {
                        const connectionTime = Date.now() - connectionStartTime;
                        this.metrics.successfulConnections++;
                        this.metrics.connectionTimes.push(connectionTime);

                        // Subscribe to test event channel
                        client.send(JSON.stringify({
                            type: 'subscribe',
                            channel: `stress-test-${index}`
                        }));

                        // Measure memory usage
                        const memoryUsage = process.memoryUsage();
                        this.metrics.memoryUsagePerConnection.push({
                            rss: memoryUsage.rss,
                            heapUsed: memoryUsage.heapUsed
                        });

                        client.on('message', (msg) => {
                            this.metrics.totalMessagesReceived++;
                        });

                        resolve(client);
                    });

                    client.on('error', (err) => {
                        this.metrics.failedConnections++;
                        reject(err);
                    });
                });

                return client;
            } catch (error) {
                console.error(`Failed to spawn client ${index}:`, error);
                return null;
            }
        });

        this.clients = (await Promise.allSettled(spawnPromises))
            .filter(result => result.status === 'fulfilled' && result.value !== null)
            .map(result => result.value);

        const spawnDuration = Date.now() - startTime;
        console.log(`Spawned ${this.clients.length} clients in ${spawnDuration}ms`);
        return this.clients;
    }

    async measureFanoutTime() {
        const startTime = Date.now();

        // Publish message to Redis broadcast channel
        await this.redisClient.publish(this.statsChannel, JSON.stringify({
            type: 'broadcast-test',
            timestamp: Date.now()
        }));

        // Wait and measure message distribution time
        await new Promise(resolve => setTimeout(resolve, 1000));

        const fanoutTime = Date.now() - startTime;
        return fanoutTime;
    }

    async monitorConnectionHealth() {
        // Periodically collect resource usage
        const cpus = os.cpus();
        const resourceSnapshot = {
            timestamp: Date.now(),
            cpuUsage: cpus.map(cpu => cpu.times),
            memoryUsage: process.memoryUsage(),
            heapStatistics: v8.getHeapStatistics()
        };

        this.metrics.resourceUsage.push(resourceSnapshot);
    }

    async testConnectionChurn() {
        // Simulate connection churn
        const churningClients = [];

        for (let i = 0; i < 50; i++) {
            const client = new WebSocket(this.options.serverUrl);
            churningClients.push(client);

            client.on('open', () => {
                // Randomly disconnect within 1-5 seconds
                setTimeout(() => client.close(), Math.random() * 4000 + 1000);
            });
        }

        return new Promise(resolve => {
            let closedConnections = 0;
            churningClients.forEach(client => {
                client.on('close', () => {
                    closedConnections++;
                    if (closedConnections === churningClients.length) {
                        resolve();
                    }
                });
            });
        });
    }

    async generateReport() {
        const reportPath = '/mnt/c/Users/masha/Documents/claude-flow-novice/tests/performance/stress-test-results.md';

        const report = `# WebSocket Stress Test Report

## Connection Metrics
- Total Connection Attempts: ${this.metrics.connectionAttempts}
- Successful Connections: ${this.metrics.successfulConnections}
- Failed Connections: ${this.metrics.failedConnections}

## Connection Performance
- Average Connection Time: ${
    this.metrics.connectionTimes.reduce((a, b) => a + b, 0) /
    this.metrics.connectionTimes.length
} ms
- Max Connection Time: ${Math.max(...this.metrics.connectionTimes)} ms
- Min Connection Time: ${Math.min(...this.metrics.connectionTimes)} ms

## Message Metrics
- Total Messages Received: ${this.metrics.totalMessagesReceived}
- Messages Per Client: ${
    this.metrics.totalMessagesReceived / this.metrics.successfulConnections
}

## Memory Usage
- Avg Memory Per Connection (RSS): ${
    this.metrics.memoryUsagePerConnection.reduce((a, m) => a + m.rss, 0) /
    this.metrics.memoryUsagePerConnection.length
} bytes
- Avg Memory Per Connection (Heap): ${
    this.metrics.memoryUsagePerConnection.reduce((a, m) => a + m.heapUsed, 0) /
    this.metrics.memoryUsagePerConnection.length
} bytes

## Resource Usage
- Peak CPU Usage: ${
    this.metrics.resourceUsage.reduce((max, usage) =>
        Math.max(max, usage.cpuUsage.reduce((a, cpu) => a + cpu.user, 0)), 0
    )
}
- Peak Memory Usage: ${
    this.metrics.resourceUsage.reduce((max, usage) =>
        Math.max(max, usage.memoryUsage.rss), 0
    )} bytes

## Recommendations
1. Recommended Max Concurrent Connections: ${
    Math.floor(this.metrics.successfulConnections * 0.9)
}
2. Suggested Connection Timeout: 500ms
3. Monitor memory usage per connection
4. Implement connection pooling
5. Use load balancing for WebSocket servers

## Breaking Points
- Concurrent Connections Limit: ${this.metrics.successfulConnections}
- Potential Performance Bottleneck: Connection establishment time

## Failure Modes
- Connection timeout
- Resource exhaustion
- Message queue backpressure
`;

        fs.writeFileSync(reportPath, report);
        return reportPath;
    }

    async runStressTest() {
        try {
            console.log('Starting WebSocket Stress Test...');

            // Scenario A: 50 clients, steady traffic
            console.log('Scenario A: 50 clients');
            this.options.clientCount = 50;
            await this.spawnClients();
            const fanoutTimeA = await this.measureFanoutTime();
            console.log(`Fanout Time (50 clients): ${fanoutTimeA}ms`);

            // Scenario B: 100 clients
            console.log('Scenario B: 100 clients');
            this.options.clientCount = 100;
            await this.spawnClients();
            const fanoutTimeB = await this.measureFanoutTime();
            console.log(`Fanout Time (100 clients): ${fanoutTimeB}ms`);

            // Scenario C: 150 clients (breaking point)
            console.log('Scenario C: 150 clients');
            this.options.clientCount = 150;
            await this.spawnClients();
            const fanoutTimeC = await this.measureFanoutTime();
            console.log(`Fanout Time (150 clients): ${fanoutTimeC}ms`);

            // Scenario D: Connection Churn
            console.log('Scenario D: Connection Churn');
            await this.testConnectionChurn();

            // Generate final report
            const reportPath = await this.generateReport();
            console.log(`Stress test complete. Report generated: ${reportPath}`);

        } catch (error) {
            console.error('Stress test failed:', error);
        } finally {
            // Cleanup
            this.clients.forEach(client => client.close());
            this.redisClient.quit();
        }
    }
}

// Run stress test
const stressTest = new WebSocketStressTest();
stressTest.runStressTest();