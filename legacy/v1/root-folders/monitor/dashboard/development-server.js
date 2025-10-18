#!/usr/bin/env node

/**
 * Development Dashboard Server
 * Relaxed CSP for local development
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { MetricsCollector } from '../collectors/metrics-collector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DevelopmentDashboardServer {
    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.io = new SocketIOServer(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        this.metricsCollector = new MetricsCollector();
        this.connectedClients = new Set();
        this.updateInterval = 1000; // 1 second
        this.metricsHistory = [];

        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketIO();
        this.startMetricsCollection();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.static(__dirname));

        // Development CSP - more relaxed for local development
        this.app.use((req, res, next) => {
            // CORS headers
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

            // Relaxed CSP for development
            const csp = [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
                "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
                "img-src 'self' data: https: blob:",
                "connect-src 'self' ws: wss: http: https:",
                "frame-src 'self'",
                "object-src 'self'",
                "base-uri 'self'",
                "form-action 'self'",
                "manifest-src 'self'",
                "worker-src 'self' blob:",
                "child-src 'self' blob:"
            ].join('; ');

            res.header('Content-Security-Policy', csp);
            res.header('X-Content-Type-Options', 'nosniff');
            res.header('X-Frame-Options', 'SAMEORIGIN'); // More relaxed for development
            res.header('X-XSS-Protection', '1; mode=block');
            res.header('Referrer-Policy', 'strict-origin-when-cross-origin');

            next();
        });
    }

    setupRoutes() {
        // Serve premium dashboard
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'premium-dashboard.html'));
        });

        // API endpoints
        this.app.get('/api/metrics', async (req, res) => {
            try {
                const metrics = await this.metricsCollector.getLatestMetrics();
                res.json(metrics);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/metrics/history', (req, res) => {
            const timeframe = req.query.timeframe || '1h';
            const filteredHistory = this.filterMetricsByTimeframe(timeframe);
            res.json(filteredHistory);
        });

        this.app.get('/api/swarms', async (req, res) => {
            try {
                const swarms = await this.metricsCollector.getSwarmMetrics();
                res.json(swarms);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Authentication endpoint (development - relaxed)
        this.app.post('/api/auth/login', (req, res) => {
            const { username, password } = req.body;

            // Accept any credentials in development
            res.json({
                success: true,
                message: 'Authentication successful (development mode)',
                user: {
                    username: username || 'dev_user',
                    role: 'developer',
                    permissions: ['read', 'write', 'benchmark', 'admin']
                },
                token: Buffer.from(`${username}:${Date.now()}`).toString('base64'),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });
        });

        this.app.post('/api/auth/verify', (req, res) => {
            const { token } = req.body;

            // Always verify in development
            try {
                const decoded = Buffer.from(token, 'base64').toString();
                const [username] = decoded.split(':');

                res.json({
                    success: true,
                    user: {
                        username: username || 'dev_user',
                        role: 'developer',
                        permissions: ['read', 'write', 'benchmark', 'admin']
                    },
                    valid: true
                });
            } catch (error) {
                // Even invalid tokens are valid in development
                res.json({
                    success: true,
                    user: {
                        username: 'dev_user',
                        role: 'developer',
                        permissions: ['read', 'write', 'benchmark', 'admin']
                    },
                    valid: true
                });
            }
        });

        // Development-only endpoints
        this.app.get('/api/dev/status', (req, res) => {
            res.json({
                mode: 'development',
                csp: 'relaxed',
                authentication: 'bypassed',
                features: {
                    websocket: true,
                    polling: true,
                    realtime: true,
                    multiSwarm: true
                },
                serverInfo: {
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString(),
                    version: '1.0.0-dev'
                }
            });
        });

        // Mock swarm generator for testing
        this.app.post('/api/dev/generate-swarms', (req, res) => {
            const { count = 5, agentsPerSwarm = 5 } = req.body;

            const mockSwarms = [];
            for (let i = 0; i < count; i++) {
                mockSwarms.push({
                    id: `dev-swarm-${i}`,
                    name: `Development Swarm ${i + 1}`,
                    status: 'running',
                    agents: agentsPerSwarm + Math.floor(Math.random() * 3),
                    tasks: Math.floor(Math.random() * 20),
                    cpu: Math.random() * 100,
                    memory: Math.random() * 1024,
                    created: new Date(Date.now() - Math.random() * 3600000).toISOString(),
                    efficiency: 80 + Math.random() * 20
                });
            }

            res.json({
                success: true,
                swarms: mockSwarms,
                message: `Generated ${count} mock swarms for testing`
            });
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                mode: 'development',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                version: '1.0.0-dev',
                features: ['realtime', 'websocket', 'polling', 'multi-swarm']
            });
        });
    }

    setupSocketIO() {
        this.io.on('connection', (socket) => {
            console.log(`🔗 Development client connected: ${socket.id}`);
            this.connectedClients.add(socket);

            // Send initial metrics
            this.sendMetricsToClient(socket);

            socket.on('disconnect', () => {
                console.log(`❌ Development client disconnected: ${socket.id}`);
                this.connectedClients.delete(socket);
            });

            socket.on('refresh', async () => {
                this.sendMetricsToClient(socket);
            });

            socket.on('subscribe', (channels) => {
                channels.forEach(channel => {
                    socket.join(channel);
                });
            });

            // Development-specific events
            socket.on('dev:generate-load', async (data) => {
                const { intensity = 'medium' } = data;
                console.log(`🚀 Generating ${intensity} load for testing`);

                // Generate mock metrics
                const mockMetrics = this.generateMockMetrics(intensity);
                this.io.emit('metrics', mockMetrics);
            });
        });
    }

    async sendMetricsToClient(socket) {
        try {
            const metrics = await this.metricsCollector.getLatestMetrics();
            socket.emit('metrics', metrics);
        } catch (error) {
            console.error('Failed to send metrics to client:', error);
            // Send mock metrics in development
            socket.emit('metrics', this.generateMockMetrics('low'));
        }
    }

    generateMockMetrics(intensity = 'medium') {
        const multiplier = { low: 0.3, medium: 0.6, high: 0.9 }[intensity];

        return {
            system: {
                memory: {
                    used: 31.2 * multiplier,
                    total: 62,
                    percent: 50 * multiplier,
                    bandwidth: 51.2 * multiplier
                },
                cpu: {
                    usage: 45 * multiplier,
                    cores: 24,
                    loadAverage: [2.1, 2.3, 2.0]
                },
                heap: {
                    used: 256 * multiplier,
                    total: 512,
                    limit: 4096
                },
                gc: {
                    lastDuration: Math.floor(5 * multiplier),
                    frequency: Math.floor(10 * multiplier)
                }
            },
            swarms: new Map([
                ['dev-swarm-1', {
                    name: 'Development Swarm 1',
                    status: 'running',
                    agents: 5,
                    tasks: 12,
                    cpu: 30 * multiplier,
                    memory: 256 * multiplier,
                    efficiency: 85 + Math.random() * 10
                }]
            ]),
            database: {
                latency: 15 * multiplier,
                connections: 5,
                cacheHitRate: 95,
                ioRate: 2.5 * multiplier
            },
            network: {
                bytesIn: 1024 * 1024 * multiplier,
                bytesOut: 512 * 1024 * multiplier,
                latency: 5,
                connections: this.connectedClients.size
            },
            timestamp: new Date().toISOString(),
            development: true
        };
    }

    async startMetricsCollection() {
        console.log('🔄 Starting development metrics collection...');

        // Start collecting metrics every second
        setInterval(async () => {
            try {
                const metrics = await this.metricsCollector.collectMetrics();

                // Store in history
                this.metricsHistory.push({
                    timestamp: new Date(),
                    ...metrics
                });

                // Keep only last hour of data
                const maxHistorySize = 3600;
                if (this.metricsHistory.length > maxHistorySize) {
                    this.metricsHistory = this.metricsHistory.slice(-maxHistorySize);
                }

                // Broadcast to all connected clients
                this.io.emit('metrics', metrics);

            } catch (error) {
                console.error('📊 Error collecting metrics:', error);
                // Send mock metrics in development
                const mockMetrics = this.generateMockMetrics('medium');
                this.io.emit('metrics', mockMetrics);
            }
        }, this.updateInterval);

        // Start swarm monitoring
        setInterval(async () => {
            try {
                const swarmMetrics = await this.metricsCollector.getSwarmMetrics();
                this.io.emit('swarm_metrics', swarmMetrics);
            } catch (error) {
                console.error('🐝 Error collecting swarm metrics:', error);
                // Send mock swarm metrics
                const mockSwarms = {
                    'dev-swarm-1': {
                        name: 'Development Swarm 1',
                        status: 'running',
                        agents: 5,
                        tasks: 12,
                        cpu: 30,
                        memory: 256,
                        efficiency: 90
                    }
                };
                this.io.emit('swarm_metrics', mockSwarms);
            }
        }, 2000);
    }

    filterMetricsByTimeframe(timeframe) {
        const now = new Date();
        let cutoffTime;

        switch (timeframe) {
            case '1m':
                cutoffTime = new Date(now - 60 * 1000);
                break;
            case '5m':
                cutoffTime = new Date(now - 5 * 60 * 1000);
                break;
            case '15m':
                cutoffTime = new Date(now - 15 * 60 * 1000);
                break;
            case '1h':
                cutoffTime = new Date(now - 60 * 60 * 1000);
                break;
            default:
                cutoffTime = new Date(now - 60 * 60 * 1000);
        }

        return this.metricsHistory.filter(entry => entry.timestamp >= cutoffTime);
    }

    start(port = 3002) {
        this.server.listen(port, () => {
            console.log(`🚀 Development Dashboard Server running on port ${port}`);
            console.log(`📊 Dashboard: http://localhost:${port}`);
            console.log(`⚡ Real-time updates: 1-second intervals`);
            console.log(`🔧 Development mode: Relaxed CSP, bypassed authentication`);
            console.log(`🧪 Test endpoints: /api/dev/status, /api/dev/generate-swarms`);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 Shutting down gracefully...');
            this.server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        });
    }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const server = new DevelopmentDashboardServer();
    server.start();
}

export { DevelopmentDashboardServer };