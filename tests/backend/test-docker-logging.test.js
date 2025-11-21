/**
 * Docker Mode CFN Loop Dashboard Tests
 * 
 * Comprehensive test suite for Docker-specific logging functionality
 * in the CFN Loop Dashboard backend.
 */

const request = require('supertest');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Import the application
const { app, io } = require('../server');

// Test database path
const TEST_DB_PATH = path.join(__dirname, '../test-data/test-docker-logs.db');

describe('Docker Mode CFN Loop Dashboard Tests', () => {
    let db;
    let server;

    beforeAll(async () => {
        // Setup test database
        await setupTestDatabase();
        
        // Start test server on different port
        server = app.listen(3003, () => {
            console.log('Test server running on port 3003');
        });
    });

    afterAll(async () => {
        // Clean up
        if (server) {
            server.close();
        }
        if (db) {
            db.close();
        }
        
        // Remove test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    });

    beforeEach(async () => {
        // Clean and reset database before each test
        await resetTestDatabase();
    });

    describe('Docker Container Logging Endpoints', () => {
        test('GET /api/docker/containers should return container list', async () => {
            // Insert test container data
            await insertTestContainerData();
            
            const response = await request(app)
                .get('/api/docker/containers')
                .expect(200);

            expect(response.body).toHaveProperty('containers');
            expect(Array.isArray(response.body.containers)).toBe(true);
            expect(response.body.containers.length).toBeGreaterThan(0);
            
            const container = response.body.containers[0];
            expect(container).toHaveProperty('id');
            expect(container).toHaveProperty('name');
            expect(container).toHaveProperty('status');
            expect(container).toHaveProperty('image');
            expect(container).toHaveProperty('created_at');
        });

        test('GET /api/docker/containers/:id/logs should return container logs', async () => {
            const containerId = 'test-container-1';
            await insertTestContainerLogs(containerId);

            const response = await request(app)
                .get(`/api/docker/containers/${containerId}/logs`)
                .expect(200);

            expect(response.body).toHaveProperty('logs');
            expect(Array.isArray(response.body.logs)).toBe(true);
            expect(response.body).toHaveProperty('container_id', containerId);
        });

        test('GET /api/docker/containers/:id/logs?lines=10 should limit log lines', async () => {
            const containerId = 'test-container-1';
            await insertTestContainerLogs(containerId, 20); // Insert 20 logs

            const response = await request(app)
                .get(`/api/docker/containers/${containerId}/logs?lines=10`)
                .expect(200);

            expect(response.body.logs).toHaveLength(10);
        });
    });

    describe('Docker Event Streaming', () => {
        test('GET /api/docker/events should return Docker events', async () => {
            await insertTestDockerEvents();

            const response = await request(app)
                .get('/api/docker/events')
                .expect(200);

            expect(response.body).toHaveProperty('events');
            expect(Array.isArray(response.body.events)).toBe(true);
            
            const event = response.body.events[0];
            expect(event).toHaveProperty('id');
            expect(event).toHaveProperty('action');
            expect(event).toHaveProperty('type');
            expect(event).toHaveProperty('timestamp');
        });

        test('GET /api/docker/events?since should filter by timestamp', async () => {
            const since = new Date(Date.now() - 60000).toISOString(); // Last minute
            await insertTestDockerEvents();

            const response = await request(app)
                .get(`/api/docker/events?since=${since}`)
                .expect(200);

            expect(response.body).toHaveProperty('events');
            // All events should be newer than 'since'
            response.body.events.forEach(event => {
                expect(new Date(event.timestamp)).toBeGreaterThanOrEqual(new Date(since));
            });
        });
    });

    describe('Docker Performance Metrics', () => {
        test('GET /api/docker/metrics should return performance data', async () => {
            await insertTestDockerMetrics();

            const response = await request(app)
                .get('/api/docker/metrics')
                .expect(200);

            expect(response.body).toHaveProperty('metrics');
            expect(response.body.metrics).toHaveProperty('container_count');
            expect(response.body.metrics).toHaveProperty('running_containers');
            expect(response.body.metrics).toHaveProperty('total_memory_usage');
            expect(response.body.metrics).toHaveProperty('total_cpu_usage');
            expect(response.body.metrics).toHaveProperty('network_io');
        });

        test('GET /api/docker/metrics/:containerId should return container-specific metrics', async () => {
            const containerId = 'test-container-1';
            await insertTestDockerMetrics(containerId);

            const response = await request(app)
                .get(`/api/docker/metrics/${containerId}`)
                .expect(200);

            expect(response.body).toHaveProperty('container_id', containerId);
            expect(response.body).toHaveProperty('metrics');
            expect(response.body.metrics).toHaveProperty('memory_usage');
            expect(response.body.metrics).toHaveProperty('cpu_usage');
            expect(response.body.metrics).toHaveProperty('network_io');
        });
    });

    describe('CFN Loop Docker Integration', () => {
        test('GET /api/docker/cfn-loop/tasks should return CFN Loop Docker tasks', async () => {
            await insertTestCFNLoopTask();

            const response = await request(app)
                .get('/api/docker/cfn-loop/tasks')
                .expect(200);

            expect(response.body).toHaveProperty('tasks');
            expect(Array.isArray(response.body.tasks)).toBe(true);
            
            const task = response.body.tasks[0];
            expect(task).toHaveProperty('id');
            expect(task).toHaveProperty('description');
            expect(task).toHaveProperty('mode');
            expect(task).toHaveProperty('docker_containers');
        });

        test('POST /api/docker/cfn-loop/tasks/:taskId/events should create CFN Loop Docker event', async () => {
            const taskId = 'cfn-test-1';
            const eventData = {
                container_id: 'test-container-1',
                event_type: 'container_spawned',
                level: 'INFO',
                message: 'Container spawned successfully',
                metadata: {
                    image: 'cfn-agent:latest',
                    ports: ['3000:3000']
                }
            };

            const response = await request(app)
                .post(`/api/docker/cfn-loop/tasks/${taskId}/events`)
                .send(eventData)
                .expect(201);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('event_id');
        });
    });

    describe('Real-time WebSocket Events', () => {
        test('WebSocket should emit Docker container events', (done) => {
            // Test WebSocket connection for real-time Docker events
            const client = require('socket.io-client')('http://localhost:3003');
            
            client.on('connect', () => {
                client.emit('subscribe-docker-events');
            });

            client.on('docker-event', (data) => {
                expect(data).toHaveProperty('type');
                expect(data).toHaveProperty('container_id');
                expect(data).toHaveProperty('timestamp');
                client.disconnect();
                done();
            });

            // Simulate Docker event after subscription
            setTimeout(() => {
                // This would normally be triggered by actual Docker events
                const testEvent = {
                    type: 'container_started',
                    container_id: 'test-container-1',
                    timestamp: new Date().toISOString()
                };
                
                // Emit test event (in real implementation this comes from Docker daemon)
                io.emit('docker-event', testEvent);
            }, 100);
        });
    });

    describe('Error Handling', () => {
        test('GET /api/docker/containers/nonexistent should return 404', async () => {
            const response = await request(app)
                .get('/api/docker/containers/nonexistent/logs')
                .expect(404);

            expect(response.body).toHaveProperty('error');
        });

        test('POST /api/docker/cfn-loop/tasks/invalid/events should return 400 for missing fields', async () => {
            const invalidEventData = {
                // Missing required fields
                message: 'test message'
            };

            const response = await request(app)
                .post('/api/docker/cfn-loop/tasks/invalid/events')
                .send(invalidEventData)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    // Helper functions
    async function setupTestDatabase() {
        return new Promise((resolve, reject) => {
            const dbDir = path.dirname(TEST_DB_PATH);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            db = new sqlite3.Database(TEST_DB_PATH, (err) => {
                if (err) {
                    reject(err);
                } else {
                    // Create Docker-specific tables
                    createDockerTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async function createDockerTables() {
        const tables = `
            -- Original CFN Loop tables
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                confidence REAL,
                spawned_at TEXT,
                completed_at TEXT,
                task_id TEXT,
                iteration INTEGER,
                metadata TEXT
            );
            
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                agent_id TEXT,
                loop TEXT,
                iteration INTEGER,
                event_type TEXT NOT NULL,
                level TEXT DEFAULT 'INFO',
                message TEXT,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                metadata TEXT
            );
            
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                description TEXT,
                mode TEXT,
                status TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT,
                current_iteration INTEGER DEFAULT 1,
                max_iterations INTEGER DEFAULT 10
            );

            -- Docker-specific tables
            CREATE TABLE IF NOT EXISTS docker_containers (
                id TEXT PRIMARY KEY,
                name TEXT,
                task_id TEXT,
                agent_id TEXT,
                image TEXT,
                status TEXT,
                created_at TEXT,
                started_at TEXT,
                exited_at TEXT,
                exit_code INTEGER,
                ports TEXT,
                volumes TEXT,
                network_id TEXT,
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS docker_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                container_id TEXT NOT NULL,
                task_id TEXT,
                timestamp TEXT,
                stream TEXT,
                message TEXT,
                level TEXT DEFAULT 'INFO',
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS docker_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT UNIQUE,
                action TEXT,
                type TEXT,
                actor_id TEXT,
                actor_attributes TEXT,
                timestamp TEXT,
                status TEXT,
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS docker_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                container_id TEXT NOT NULL,
                task_id TEXT,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                cpu_usage REAL,
                memory_usage INTEGER,
                memory_limit INTEGER,
                network_rx INTEGER,
                network_tx INTEGER,
                block_read INTEGER,
                block_write INTEGER,
                metadata TEXT
            );
        `;

        return new Promise((resolve, reject) => {
            db.exec(tables, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async function resetTestDatabase() {
        return new Promise((resolve, reject) => {
            db.exec('DELETE FROM docker_logs; DELETE FROM docker_events; DELETE FROM docker_metrics; DELETE FROM docker_containers; DELETE FROM agents; DELETE FROM events; DELETE FROM tasks;', (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async function insertTestContainerData() {
        const containerData = [
            ['test-container-1', 'cfn-agent-coordinator', 'cfn-task-1', null, 'cfn-agent:latest', 'running', new Date().toISOString(), new Date().toISOString(), null, null, '3001:3001', null, 'cfn-network', '{}'],
            ['test-container-2', 'cfn-agent-backend', 'cfn-task-1', 'agent-1', 'cfn-agent:latest', 'exited', new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), 0, '3002:3002', null, 'cfn-network', '{}']
        ];

        for (const container of containerData) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO docker_containers (id, name, task_id, agent_id, image, status, created_at, started_at, exited_at, exit_code, ports, volumes, network_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    container,
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }
    }

    async function insertTestContainerLogs(containerId, count = 10) {
        for (let i = 0; i < count; i++) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO docker_logs (container_id, task_id, timestamp, stream, message, level) VALUES (?, ?, ?, ?, ?, ?)',
                    [containerId, 'cfn-task-1', new Date(Date.now() - i * 1000).toISOString(), 'stdout', `Log message ${i}`, 'INFO'],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }
    }

    async function insertTestDockerEvents() {
        const events = [
            ['event-1', 'start', 'container', 'test-container-1', '{}', new Date().toISOString(), 'created', '{}'],
            ['event-2', 'start', 'container', 'test-container-2', '{}', new Date().toISOString(), 'created', '{}']
        ];

        for (const event of events) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO docker_events (event_id, action, type, actor_id, actor_attributes, timestamp, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    event,
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }
    }

    async function insertTestDockerMetrics(containerId = 'test-container-1') {
        const metrics = [
            [containerId, 'cfn-task-1', new Date().toISOString(), 15.5, 52428800, 268435456, 1024, 2048, 512, 256, '{}'],
            [containerId, 'cfn-task-1', new Date(Date.now() - 60000).toISOString(), 12.3, 49152000, 268435456, 800, 1600, 400, 200, '{}']
        ];

        for (const metric of metrics) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO docker_metrics (container_id, task_id, timestamp, cpu_usage, memory_usage, memory_limit, network_rx, network_tx, block_read, block_write, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    metric,
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }
    }

    async function insertTestCFNLoopTask() {
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO tasks (id, description, mode, status) VALUES (?, ?, ?, ?)',
                ['cfn-task-1', 'Test Docker CFN Loop task', 'standard', 'running'],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
});

module.exports = {
    TEST_DB_PATH
};