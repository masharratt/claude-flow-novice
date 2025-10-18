#!/usr/bin/env node

// Premium Performance Monitor Server
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createRequire } from 'module';
import { MetricsCollector } from '../collectors/metrics-collector.js';
import { BenchmarkRunner } from '../benchmarks/runner.js';
import { AlertManager } from '../alerts/alert-manager.js';

// Import CommonJS module for authentication
const require = createRequire(import.meta.url);
const AuthenticationService = require('./auth-service.cjs');

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

        // Initialize authentication service
        try {
            this.authService = new AuthenticationService();
        } catch (error) {
            console.error('❌ Failed to initialize authentication service:', error.message);
            console.error('Please configure dashboard credentials in .env file');
            process.exit(1);
        }

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

        // Enhanced security middleware with CSP
        this.app.use((req, res, next) => {
            // CORS headers
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

            // Content Security Policy - Allow Socket.io CDN and local resources
            const csp = [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.socket.io",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com",
                "img-src 'self' data: https:",
                "connect-src 'self' ws: wss: https://cdn.socket.io",
                "frame-src 'none'",
                "object-src 'none'",
                "base-uri 'self'",
                "form-action 'self'",
                "manifest-src 'self'",
                "worker-src 'self' blob:",
                "child-src 'self' blob:"
            ].join('; ');

            res.header('Content-Security-Policy', csp);
            res.header('X-Content-Type-Options', 'nosniff');
            res.header('X-Frame-Options', 'DENY');
            res.header('X-XSS-Protection', '1; mode=block');
            res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
            res.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

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

        // Authentication endpoint - secure implementation
        this.app.post('/api/auth/login', async (req, res) => {
            try {
                const { username, password } = req.body;

                if (!username || !password) {
                    return res.status(400).json({
                        success: false,
                        message: 'Username and password are required'
                    });
                }

                const result = await this.authService.authenticate(username, password);

                if (result) {
                    res.json(result);
                } else {
                    res.status(401).json({
                        success: false,
                        message: 'Invalid credentials'
                    });
                }
            } catch (error) {
                console.error('Login error:', error);
                res.status(500).json({
                    success: false,
                    message: 'Authentication service error'
                });
            }
        });

        // Session validation endpoint
        this.app.post('/api/auth/validate', (req, res) => {
            const { token } = req.body;
            const session = this.authService.validateSession(token);

            if (session) {
                res.json({
                    success: true,
                    user: { username: session.username, role: session.role }
                });
            } else {
                res.status(401).json({
                    success: false,
                    message: 'Invalid or expired session'
                });
            }
        });

        // SECURITY FIX: Token refresh endpoint
        this.app.post('/api/auth/refresh', async (req, res) => {
            try {
                const { refreshToken } = req.body;

                if (!refreshToken) {
                    return res.status(400).json({
                        success: false,
                        error: 'Refresh token is required'
                    });
                }

                const result = await this.authService.refreshAccessToken(refreshToken);

                if (result.success) {
                    res.json(result);
                } else {
                    res.status(401).json(result);
                }
            } catch (error) {
                console.error('Token refresh error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Token refresh failed'
                });
            }
        });

        // Logout endpoint
        this.app.post('/api/auth/logout', (req, res) => {
            const { token } = req.body;
            if (token) {
                this.authService.revokeSession(token);
                this.authService.revokeJWTToken(token); // Also revoke JWT token
            }
            res.json({
                success: true,
                message: 'Logout successful'
            });
        });

        // Session statistics endpoint (admin only)
        this.app.get('/api/auth/stats', (req, res) => {
            const authHeader = req.headers.authorization;
            const token = authHeader?.split(' ')[1];
            const session = this.authService.validateSession(token);

            if (!session || session.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Admin access required'
                });
            }

            res.json(this.authService.getSessionStatistics());
        });

        // Authentication verification endpoint
        this.app.post('/api/auth/verify', (req, res) => {
            const { token } = req.body;

            try {
                const decoded = Buffer.from(token, 'base64').toString();
                const [username, timestamp] = decoded.split(':');
                const now = Date.now();
                const tokenTime = parseInt(timestamp);

                // Check if token is valid and not expired (24 hours)
                if (now - tokenTime < 24 * 60 * 60 * 1000 && username) {
                    res.json({
                        success: true,
                        user: { username },
                        valid: true
                    });
                } else {
                    res.json({
                        success: false,
                        valid: false,
                        message: 'Token expired'
                    });
                }
            } catch (error) {
                res.json({
                    success: false,
                    valid: false,
                    message: 'Invalid token'
                });
            }
        });

        // Socket.io will be served from CDN
        this.app.get("/socket.io.js", (req, res) => {
            res.redirect("https://cdn.socket.io/4.7.5/socket.io.min.js");
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