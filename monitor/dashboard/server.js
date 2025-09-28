#!/usr/bin/env node

// Premium Performance Monitor Server
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { MetricsCollector } from '../collectors/metrics-collector.js';
import { BenchmarkRunner } from '../benchmarks/runner.js';
import { AlertManager } from '../alerts/alert-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PremiumMonitorServer {
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
        this.benchmarkRunner = new BenchmarkRunner();
        this.alertManager = new AlertManager();

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

        // CORS middleware
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
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

        this.app.post('/api/benchmark/:type', async (req, res) => {
            try {
                const { type } = req.params;
                const result = await this.benchmarkRunner.runBenchmark(type);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/swarms', async (req, res) => {
            try {
                const swarms = await this.metricsCollector.getSwarmMetrics();
                res.json(swarms);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/alerts', (req, res) => {
            const alerts = this.alertManager.getActiveAlerts();
            res.json(alerts);
        });

        this.app.post('/api/alerts/acknowledge/:id', (req, res) => {
            const { id } = req.params;
            this.alertManager.acknowledgeAlert(id);
            res.json({ success: true });
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            });
        });
    }

    setupSocketIO() {
        this.io.on('connection', (socket) => {
            console.log(`Client connected: ${socket.id}`);
            this.connectedClients.add(socket);

            // Send initial metrics
            this.sendMetricsToClient(socket);

            socket.on('disconnect', () => {
                console.log(`Client disconnected: ${socket.id}`);
                this.connectedClients.delete(socket);
            });

            socket.on('refresh', async () => {
                this.sendMetricsToClient(socket);
            });

            socket.on('subscribe', (channels) => {
                // Subscribe to specific metric channels
                channels.forEach(channel => {
                    socket.join(channel);
                });
            });
        });
    }

    async sendMetricsToClient(socket) {
        try {
            const metrics = await this.metricsCollector.getLatestMetrics();
            socket.emit('metrics', metrics);
        } catch (error) {
            console.error('Failed to send metrics to client:', error);
        }
    }

    async startMetricsCollection() {
        console.log('Starting real-time metrics collection...');

        // Start collecting metrics every second
        setInterval(async () => {
            try {
                const metrics = await this.metricsCollector.collectMetrics();

                // Store in history
                this.metricsHistory.push({
                    timestamp: new Date(),
                    ...metrics
                });

                // Keep only last hour of data at 1-second intervals
                const maxHistorySize = 3600; // 1 hour
                if (this.metricsHistory.length > maxHistorySize) {
                    this.metricsHistory = this.metricsHistory.slice(-maxHistorySize);
                }

                // Broadcast to all connected clients
                this.io.emit('metrics', metrics);

                // Check for alerts
                const alerts = this.alertManager.checkMetrics(metrics);
                alerts.forEach(alert => {
                    this.io.emit('alert', alert);
                });

                // Generate recommendations
                const recommendations = this.generateRecommendations(metrics);
                if (recommendations.length > 0) {
                    recommendations.forEach(rec => {
                        this.io.emit('recommendation', rec);
                    });
                }

            } catch (error) {
                console.error('Error collecting metrics:', error);
            }
        }, this.updateInterval);

        // Start swarm monitoring
        this.startSwarmMonitoring();
    }

    async startSwarmMonitoring() {
        setInterval(async () => {
            try {
                const swarmMetrics = await this.metricsCollector.getSwarmMetrics();
                this.io.emit('swarm_metrics', swarmMetrics);
            } catch (error) {
                console.error('Error collecting swarm metrics:', error);
            }
        }, 2000); // Every 2 seconds for swarm metrics
    }

    generateRecommendations(metrics) {
        const recommendations = [];

        // Memory optimization recommendations
        if (metrics.system?.memory?.percent > 80) {
            recommendations.push({
                title: 'High Memory Usage Detected',
                description: 'Memory usage is above 80%. Consider optimizing memory allocation.',
                impact: 'High',
                actions: [
                    'Reduce concurrent swarm instances',
                    'Implement memory pooling',
                    'Enable garbage collection optimization'
                ]
            });
        }

        // CPU optimization recommendations
        if (metrics.system?.cpu?.usage > 85) {
            recommendations.push({
                title: 'High CPU Usage',
                description: 'CPU usage is above 85%. Performance may be affected.',
                impact: 'Medium',
                actions: [
                    'Scale down non-critical processes',
                    'Optimize task scheduling',
                    'Enable CPU throttling for low-priority tasks'
                ]
            });
        }

        // Database performance recommendations
        if (metrics.database?.latency > 100) {
            recommendations.push({
                title: 'Database Latency Warning',
                description: 'Database queries are taking longer than expected.',
                impact: 'Medium',
                actions: [
                    'Review slow queries',
                    'Optimize database indices',
                    'Consider connection pooling'
                ]
            });
        }

        return recommendations;
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

    start(port = 3001) {
        this.server.listen(port, () => {
            console.log(`🚀 Premium Performance Monitor Server running on port ${port}`);
            console.log(`📊 Dashboard: http://localhost:${port}`);
            console.log(`⚡ Real-time updates: 1-second intervals`);
            console.log(`💾 Optimized for: 62GB RAM, 24 cores, DDR5-6400`);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('Shutting down gracefully...');
            this.server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        });
    }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const server = new PremiumMonitorServer();
    server.start();
}

export { PremiumMonitorServer };