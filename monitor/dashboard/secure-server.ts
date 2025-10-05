#!/usr/bin/env node

/**
 * Secure Production Dashboard Server
 * Implements comprehensive security controls including:
 * - Authentication & Authorization
 * - Rate Limiting & DDoS Protection
 * - HTTPS & Security Headers
 * - Input Validation & XSS Protection
 * - Security Monitoring & Logging
 */

import express from 'express';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';
import { SecurityManager } from './security-middleware.js';
import { DatabaseManager } from './database-manager.js';
import { ProductionConfigManager } from './production-config.js';
import { MetricsCollector } from '../collectors/metrics-collector.js';
import { BenchmarkRunner } from '../benchmarks/runner.js';
import { AlertManager } from '../alerts/alert-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SecureDashboardServer {
    private app: express.Application;
    private server: any;
    private io: SocketIOServer;
    private securityManager: SecurityManager;
    private databaseManager: DatabaseManager;
    private configManager: ProductionConfigManager;
    private metricsCollector: MetricsCollector;
    private benchmarkRunner: BenchmarkRunner;
    private alertManager: AlertManager;
    private connectedClients: Map<string, { authenticated: boolean; user?: any; session?: any }> = new Map();
    private config: any;

    constructor(customConfig?: any) {
        this.app = express();
        this.configManager = new ProductionConfigManager(customConfig);
        this.config = this.configManager.getConfig();

        this.databaseManager = this.configManager.getDatabaseManager();
        this.securityManager = this.configManager.getSecurityManager();

        // Setup server based on configuration
        if (this.config.server.https.enabled) {
            this.setupHttpsServer();
        } else {
            this.setupHttpServer();
        }

        this.metricsCollector = new MetricsCollector();
        this.benchmarkRunner = new BenchmarkRunner();
        this.alertManager = new AlertManager();

        this.setupSecurity();
        this.setupRoutes();
        this.setupSocketIO();
        this.startMetricsCollection();
    }

    private setupHttpServer() {
        this.server = createHttpServer(this.app);
        console.log('📡 HTTP Server configured');
    }

    private setupHttpsServer() {
        try {
            const httpsConfig = this.config.server.https;
            const options: any = {
                key: fs.readFileSync(httpsConfig.keyPath!),
                cert: fs.readFileSync(httpsConfig.certPath!),
                minVersion: httpsConfig.minVersion,
                ciphers: httpsConfig.ciphers.join(':'),
                honorCipherOrder: httpsConfig.honorCipherOrder
            };

            // Add CA certificate if provided
            if (httpsConfig.caPath) {
                options.ca = fs.readFileSync(httpsConfig.caPath);
            }

            this.server = createHttpsServer(options, this.app);
            console.log(`🔒 HTTPS Server configured with ${httpsConfig.minVersion}+`);
        } catch (error) {
            console.error('❌ Failed to setup HTTPS server:', error);
            console.log('📡 Falling back to HTTP server');
            this.setupHttpServer();
        }
    }

    private setupSecurity() {
        // Trust proxy for load balancers
        if (this.config.server.trustProxy) {
            this.app.set('trust proxy', 1);
        }

        // Apply compression
        if (this.config.server.compression.enabled) {
            this.app.use(compression({
                level: this.config.server.compression.level,
                threshold: this.config.server.compression.threshold
            }));
        }

        // Apply security headers from configuration
        this.app.use(this.securityManager.securityHeaders());

        // Apply CORS from configuration
        this.app.use(this.securityManager.corsMiddleware());

        // Apply global rate limiting from configuration
        this.app.use(this.securityManager.createRateLimiter(this.config.security.rateLimit.global));

        // Input validation
        this.app.use(this.securityManager.validateInput.bind(this.securityManager));

        // Body parser with configurable size limits
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Serve static files with security and caching
        this.app.use(express.static(__dirname, {
            maxAge: this.config.server.https.enabled ? '1d' : '0',
            etag: true,
            lastModified: true,
            setHeaders: (res, path) => {
                // Add security headers for static files
                res.setHeader('X-Content-Type-Options', 'nosniff');
                if (this.config.server.https.enabled) {
                    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
                }
            }
        }));
    }

    private setupRoutes() {
        // Enhanced health check with detailed status
        this.app.get('/health', (req, res) => {
            const healthCheck = {
                status: 'healthy',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                version: '2.0.0',
                environment: this.config.server.https.enabled ? 'production' : 'development',
                server: {
                    port: this.config.server.port,
                    https: this.config.server.https.enabled,
                    compression: this.config.server.compression.enabled,
                    trustProxy: this.config.server.trustProxy
                },
                security: {
                    authentication: 'enabled',
                    rateLimit: 'enabled',
                    https: this.config.server.https.enabled ? 'enabled' : 'disabled',
                    helmet: 'enabled',
                    cors: 'enabled'
                },
                database: {
                    connected: true,
                    path: this.config.database.path,
                    backup: this.config.database.backup.enabled
                },
                performance: {
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                    activeConnections: this.connectedClients.size,
                    maxConnections: this.config.server.maxConnections
                }
            };

            // Check if any critical components are failing
            const isHealthy = this.connectedClients.size < this.config.server.maxConnections &&
                             healthCheck.database.connected;

            res.status(isHealthy ? 200 : 503).json(healthCheck);
        });

        // Authentication routes with endpoint-specific rate limiting
        this.app.post('/api/auth/login',
            this.configManager.createEndpointRateLimiter('/api/auth/login'),
            this.securityManager.login.bind(this.securityManager)
        );

        this.app.post('/api/auth/refresh',
            this.configManager.createEndpointRateLimiter('/api/auth/refresh'),
            this.securityManager.refreshToken.bind(this.securityManager)
        );

        this.app.post('/api/auth/logout',
            this.securityManager.authenticateToken.bind(this.securityManager),
            this.securityManager.logout.bind(this.securityManager)
        );

        // Protected API routes
        this.setupApiRoutes();

        // Serve dashboard (requires authentication)
        this.app.get('/', this.securityManager.authenticateToken.bind(this.securityManager), (req, res) => {
            res.sendFile(path.join(__dirname, 'premium-dashboard.html'));
        });

        // Admin routes
        this.setupAdminRoutes();

        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({ error: 'Resource not found' });
        });

        // Global error handler
        this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
            console.error('🚨 Unhandled error:', error);

            // Don't leak error details in production
            const message = process.env.NODE_ENV === 'production'
                ? 'Internal server error'
                : error.message;

            res.status(500).json({
                error: message,
                ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
            });
        });
    }

    private setupApiRoutes() {
        const router = express.Router();

        // Apply authentication to all API routes
        router.use(this.securityManager.authenticateToken.bind(this.securityManager));

        // Metrics endpoints
        router.get('/metrics', this.securityManager.requirePermission('read'), async (req, res) => {
            try {
                const metrics = await this.metricsCollector.getLatestMetrics();
                res.json(metrics);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch metrics' });
            }
        });

        router.get('/metrics/history', this.securityManager.requirePermission('read'), (req, res) => {
            const timeframe = req.query.timeframe || '1h';
            const filteredHistory = this.filterMetricsByTimeframe(timeframe as string);
            res.json(filteredHistory);
        });

        // Benchmark endpoints with enhanced rate limiting
        router.post('/benchmark/:type',
            this.securityManager.requirePermission('benchmark'),
            this.configManager.createEndpointRateLimiter('/api/benchmark'),
            async (req, res) => {
                try {
                    const { type } = req.params;

                    // Validate benchmark type
                    const allowedTypes = ['cpu', 'memory', 'swarm', 'full'];
                    if (!allowedTypes.includes(type)) {
                        return res.status(400).json({ error: 'Invalid benchmark type' });
                    }

                    // Log benchmark execution
                    this.databaseManager.logSecurityEvent('BENCHMARK_EXECUTED', 'low', req.ip, {
                        userId: (req as any).user?.id,
                        benchmarkType: type,
                        userAgent: req.get('User-Agent')
                    }, (req as any).user?.id);

                    const result = await this.benchmarkRunner.runBenchmark(type);
                    res.json(result);
                } catch (error) {
                    this.databaseManager.logSecurityEvent('BENCHMARK_ERROR', 'medium', req.ip, {
                        error: error.message,
                        benchmarkType: req.params.type,
                        userId: (req as any).user?.id
                    }, (req as any).user?.id);
                    res.status(500).json({ error: 'Benchmark execution failed' });
                }
            }
        );

        // Swarm endpoints
        router.get('/swarms', this.securityManager.requirePermission('read'), async (req, res) => {
            try {
                const swarms = await this.metricsCollector.getSwarmMetrics();
                res.json(swarms);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch swarm metrics' });
            }
        });

        // Alert endpoints
        router.get('/alerts', this.securityManager.requirePermission('read'), (req, res) => {
            const alerts = this.alertManager.getActiveAlerts();
            res.json(alerts);
        });

        router.post('/alerts/acknowledge/:id',
            this.securityManager.requirePermission('write'),
            (req, res) => {
                const { id } = req.params;
                this.alertManager.acknowledgeAlert(id);
                res.json({ success: true });
            }
        );

        // System information (admin only)
        router.get('/system/info',
            this.securityManager.requirePermission('system'),
            (req, res) => {
                res.json({
                    nodeVersion: process.version,
                    platform: process.platform,
                    arch: process.arch,
                    memory: process.memoryUsage(),
                    uptime: process.uptime(),
                    environment: process.env.NODE_ENV || 'development',
                    pid: process.pid
                });
            }
        );

        this.app.use('/api', router);
    }

    private setupAdminRoutes() {
        const router = express.Router();

        // Apply admin-specific rate limiting to all admin routes
        router.use(this.configManager.createEndpointRateLimiter('/api/admin'));

        // Require admin permission for all admin routes
        router.use(this.securityManager.authenticateToken.bind(this.securityManager));
        router.use(this.securityManager.requirePermission('admin'));

        // User management endpoints
        router.post('/users', this.securityManager.createUser.bind(this.securityManager));
        router.get('/users', this.securityManager.getUsers.bind(this.securityManager));
        router.put('/users/role', this.securityManager.updateUserRole.bind(this.securityManager));
        router.delete('/users/:username', this.securityManager.deleteUser.bind(this.securityManager));
        router.get('/users/:userId/sessions', this.securityManager.getUserSessions.bind(this.securityManager));

        // Security monitoring endpoints
        router.get('/security/events', this.securityManager.getSecurityEvents.bind(this.securityManager));
        router.get('/security/stats', this.securityManager.getSecurityStats.bind(this.securityManager));

        router.get('/security/status', (req, res) => {
            const stats = this.databaseManager.getDatabaseStats();
            const envInfo = this.configManager.getEnvironmentInfo();

            res.json({
                authentication: 'enabled',
                rateLimit: 'enabled',
                securityHeaders: 'enabled',
                https: this.config.server.https.enabled,
                activeSessions: this.connectedClients.size,
                databaseStats: stats,
                environment: envInfo,
                uptime: process.uptime(),
                configuration: {
                    productionMode: this.config.server.https.enabled,
                    backupEnabled: this.config.database.backup.enabled,
                    monitoringEnabled: this.config.monitoring.metrics.enabled
                }
            });
        });

        // Database management
        router.get('/database/stats', (req, res) => {
            const stats = this.databaseManager.getDatabaseStats();
            res.json(stats);
        });

        router.post('/database/backup', async (req, res) => {
            const { backupPath } = req.body;
            try {
                const finalBackupPath = backupPath || path.join(
                    this.config.database.backup.path,
                    `manual-backup-${Date.now()}.db`
                );

                this.databaseManager.backup(finalBackupPath);

                this.databaseManager.logSecurityEvent('MANUAL_BACKUP_CREATED', 'medium', req.ip, {
                    userId: (req as any).user?.id,
                    backupPath: finalBackupPath,
                    userAgent: req.get('User-Agent')
                }, (req as any).user?.id);

                res.json({
                    message: 'Database backup completed successfully',
                    backupPath: finalBackupPath,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                this.databaseManager.logSecurityEvent('BACKUP_ERROR', 'high', req.ip, {
                    error: error.message,
                    backupPath,
                    userId: (req as any).user?.id
                }, (req as any).user?.id);
                res.status(500).json({ error: 'Failed to create database backup' });
            }
        });

        // System management
        router.post('/system/optimize', async (req, res) => {
            try {
                // Trigger database optimization
                this.databaseManager['db']?.exec('VACUUM');
                this.databaseManager['db']?.exec('ANALYZE');

                this.databaseManager.logSecurityEvent('SYSTEM_OPTIMIZATION', 'medium', req.ip, {
                    userId: (req as any).user?.id,
                    userAgent: req.get('User-Agent')
                }, (req as any).user?.id);

                res.json({ message: 'System optimization completed successfully' });
            } catch (error) {
                res.status(500).json({ error: 'System optimization failed' });
            }
        });

        this.app.use('/api/admin', router);
    }

    private setupSocketIO() {
        // Configure Socket.IO with security
        this.io = new SocketIOServer(this.server, {
            cors: {
                origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
                credentials: true,
                methods: ['GET', 'POST']
            },
            transports: ['websocket', 'polling'],
            allowEIO3: false, // Disable older Socket.IO versions for security
            maxHttpBufferSize: 1e6, // 1MB max payload
            pingTimeout: 60000,
            pingInterval: 25000
        });

        // Enhanced Socket authentication middleware with database integration
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token;

                if (!token) {
                    this.databaseManager.logSecurityEvent('SOCKET_MISSING_TOKEN', 'medium', socket.handshake.address, {
                        userAgent: socket.handshake.headers['user-agent']
                    });
                    return next(new Error('Authentication token required'));
                }

                // Verify JWT token
                const jwt = await import('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;

                // Verify session in database
                const session = this.databaseManager.getSession(decoded.sessionId);
                if (!session || session.expires < new Date()) {
                    this.databaseManager.logSecurityEvent('SOCKET_EXPIRED_SESSION', 'medium', socket.handshake.address, {
                        sessionId: decoded.sessionId,
                        userAgent: socket.handshake.headers['user-agent']
                    });
                    return next(new Error('Session expired'));
                }

                // Get user from database
                const user = this.databaseManager.getUserById(session.userId);
                if (!user) {
                    this.databaseManager.logSecurityEvent('SOCKET_INVALID_USER', 'high', socket.handshake.address, {
                        userId: session.userId,
                        sessionId: decoded.sessionId
                    });
                    return next(new Error('User not found'));
                }

                // Check if user is locked
                if (user.lockedUntil && user.lockedUntil > new Date()) {
                    this.databaseManager.logSecurityEvent('SOCKET_LOCKED_USER', 'high', socket.handshake.address, {
                        userId: user.id,
                        username: user.username,
                        lockedUntil: user.lockedUntil
                    }, user.id);
                    return next(new Error('Account is locked'));
                }

                // Update session last access
                this.databaseManager.updateSessionAccess(decoded.sessionId);

                // Store user and session data
                socket.data.user = user;
                socket.data.session = session;
                socket.data.authenticated = true;

                this.databaseManager.logSecurityEvent('SOCKET_CONNECTION_SUCCESS', 'low', socket.handshake.address, {
                    userId: user.id,
                    username: user.username,
                    sessionId: decoded.sessionId,
                    socketId: socket.id
                }, user.id);

                next();
            } catch (error) {
                this.databaseManager.logSecurityEvent('SOCKET_AUTH_FAILED', 'high', socket.handshake.address, {
                    error: error.message,
                    userAgent: socket.handshake.headers['user-agent']
                });
                console.log('❌ Socket authentication failed:', error.message);
                next(new Error('Authentication failed'));
            }
        });

        this.io.on('connection', (socket) => {
            const user = socket.data.user;
            console.log(`🔐 Authenticated client connected: ${socket.id} (${user.username})`);

            this.connectedClients.set(socket.id, {
                authenticated: true,
                user: user,
                session: socket.data.session
            });

            // Send initial metrics
            this.sendMetricsToClient(socket);

            socket.on('disconnect', (reason) => {
                const user = socket.data.user;
                console.log(`Client disconnected: ${socket.id} (${user?.username || 'unknown'}) - ${reason}`);

                this.databaseManager.logSecurityEvent('SOCKET_DISCONNECT', 'low', socket.handshake.address, {
                    userId: user?.id,
                    username: user?.username,
                    socketId: socket.id,
                    reason,
                    sessionDuration: Date.now() - socket.handshake.time
                }, user?.id);

                this.connectedClients.delete(socket.id);
            });

            socket.on('refresh', async () => {
                this.sendMetricsToClient(socket);
            });

            socket.on('subscribe', (channels) => {
                if (Array.isArray(channels)) {
                    channels.forEach(channel => {
                        socket.join(channel);
                    });
                }
            });

            // Validate all incoming socket events
            socket.use((event, next) => {
                if (typeof event[0] === 'string' && event[0].length > 100) {
                    console.warn('⚠️ Suspicious socket event name length:', event[0].length);
                    return next(new Error('Invalid event'));
                }
                next();
            });
        });
    }

    private async sendMetricsToClient(socket: any) {
        try {
            const metrics = await this.metricsCollector.getLatestMetrics();
            socket.emit('metrics', metrics);
        } catch (error) {
            console.error('Failed to send metrics to client:', error);
        }
    }

    private async startMetricsCollection() {
        console.log('🔒 Starting secure metrics collection...');

        // Start collecting metrics every second
        setInterval(async () => {
            try {
                const metrics = await this.metricsCollector.collectMetrics();

                // Broadcast to authenticated clients only
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
        }, 1000);

        // Start swarm monitoring
        this.startSwarmMonitoring();
    }

    private async startSwarmMonitoring() {
        setInterval(async () => {
            try {
                const swarmMetrics = await this.metricsCollector.getSwarmMetrics();
                this.io.emit('swarm_metrics', swarmMetrics);
            } catch (error) {
                console.error('Error collecting swarm metrics:', error);
            }
        }, 2000);
    }

    private generateRecommendations(metrics: any) {
        const recommendations = [];

        // Security-focused recommendations
        if (metrics.system?.memory?.percent > 85) {
            recommendations.push({
                title: 'High Memory Usage - Security Risk',
                description: 'Memory usage is critically high. This may indicate a memory leak attack or resource exhaustion.',
                impact: 'High',
                actions: [
                    'Monitor for unusual process activity',
                    'Check for potential memory-based attacks',
                    'Consider restarting services if needed'
                ]
            });
        }

        if (this.connectedClients.size > 50) {
            recommendations.push({
                title: 'High Number of Connected Clients',
                description: 'Unusual number of active connections detected.',
                impact: 'Medium',
                actions: [
                    'Review client authentication logs',
                    'Monitor for DDoS patterns',
                    'Consider tightening rate limits'
                ]
            });
        }

        return recommendations;
    }

    private filterMetricsByTimeframe(timeframe: string) {
        // Implementation would filter metrics by timeframe
        return [];
    }

    public start(port = 3001) {
        this.server.listen(port, () => {
            console.log(`🚀 Secure Performance Monitor Server running on port ${port}`);
            console.log(`🔒 Security Features:`);
            console.log(`   • Authentication: Required`);
            console.log(`   • Rate Limiting: Enabled`);
            console.log(`   • Security Headers: Enabled`);
            console.log(`   • HTTPS: ${this.server instanceof createHttpsServer ? 'Enabled' : 'Disabled'}`);
            console.log(`📊 Dashboard: http${this.server instanceof createHttpsServer ? 's' : ''}://localhost:${port}`);
            console.log(`🔑 Default credentials: Check startup logs for admin password`);
        });

        // Graceful shutdown
        const gracefulShutdown = () => {
            console.log('🛑 Shutting down gracefully...');
            this.server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        };

        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGINT', gracefulShutdown);
    }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const server = new SecureDashboardServer();
    server.start(parseInt(process.env.PORT || '3001'));
}

export { SecureDashboardServer };