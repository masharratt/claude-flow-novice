#!/usr/bin/env node

// Simplified Performance Monitor Server for Swarm Metrics
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { MetricsCollector } from '../collectors/metrics-collector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SimpleMonitorServer {
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

        // CORS headers
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            next();
        });
    }

    setupRoutes() {
        // Serve dashboard
        this.app.get('/', (req, res) => {
            res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Swarm Dashboard</title>
    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .swarm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .swarm-item { background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #007bff; }
        .status-active { border-left-color: #28a745; }
        .status-completed { border-left-color: #17a2b8; }
        .status-failed { border-left-color: #dc3545; }
        .metrics { display: flex; gap: 20px; margin-top: 10px; }
        .metric { text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
        .metric-label { font-size: 12px; color: #666; }
        .progress-bar { width: 100%; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden; margin-top: 10px; }
        .progress-fill { height: 100%; background: #28a745; transition: width 0.3s ease; }
        h1 { color: #333; }
        h2 { color: #555; }
        .timestamp { color: #999; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Swarm Activity Dashboard</h1>
        <div id="timestamp" class="timestamp"></div>

        <div class="card">
            <h2>System Overview</h2>
            <div class="metrics">
                <div class="metric">
                    <div id="active-swarms" class="metric-value">-</div>
                    <div class="metric-label">Active Swarms</div>
                </div>
                <div class="metric">
                    <div id="total-agents" class="metric-value">-</div>
                    <div class="metric-label">Total Agents</div>
                </div>
                <div class="metric">
                    <div id="completed-tasks" class="metric-value">-</div>
                    <div class="metric-label">Completed Tasks</div>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>🐝 Active Swarm Instances</h2>
            <div id="swarms-container" class="swarm-grid">
                <div class="swarm-item">Loading swarm data...</div>
            </div>
        </div>
    </div>

    <script>
        const socket = io();

        socket.on('connect', () => {
            console.log('Connected to dashboard server');
        });

        socket.on('metrics', (data) => {
            updateDashboard(data);
        });

        function updateDashboard(metrics) {
            // Update timestamp
            document.getElementById('timestamp').textContent = 'Last updated: ' + new Date(metrics.timestamp).toLocaleString();

            // Update overview metrics
            const swarms = metrics.swarms || {};
            const activeCount = Object.values(swarms).filter(s => s.status === 'active' || s.status === 'running').length;
            const totalAgents = Object.values(swarms).reduce((sum, s) => sum + (s.agents || 0), 0);
            const completedTasks = Object.values(swarms).filter(s => s.status === 'completed').length;

            document.getElementById('active-swarms').textContent = activeCount;
            document.getElementById('total-agents').textContent = totalAgents;
            document.getElementById('completed-tasks').textContent = completedTasks;

            // Update swarm list
            const container = document.getElementById('swarms-container');
            container.innerHTML = '';

            if (Object.keys(swarms).length === 0) {
                container.innerHTML = '<div class="swarm-item">No active swarms found</div>';
                return;
            }

            Object.entries(swarms).forEach(([id, swarm]) => {
                const swarmDiv = document.createElement('div');
                swarmDiv.className = 'swarm-item status-' + (swarm.status || 'unknown');

                const statusIcon = {
                    'active': '🟢',
                    'running': '🟡',
                    'completed': '✅',
                    'failed': '❌',
                    'unknown': '⚪'
                }[swarm.status] || '⚪';

                swarmDiv.innerHTML = \`
                    <h3>\${statusIcon} \${swarm.name}</h3>
                    <div><strong>Status:</strong> \${swarm.status}</div>
                    <div><strong>Agents:</strong> \${swarm.agents || 0}</div>
                    <div><strong>Tasks:</strong> \${swarm.tasks || 0}</div>
                    <div><strong>Uptime:</strong> \${Math.floor((swarm.uptime || 0) / 60)}m</div>
                    <div><strong>Objective:</strong> \${swarm.objective || 'N/A'}</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: \${(swarm.progress || 0) * 100}%"></div>
                    </div>
                \`;
                container.appendChild(swarmDiv);
            });
        }

        // Request initial metrics
        fetch('/api/metrics')
            .then(res => res.json())
            .then(data => updateDashboard(data))
            .catch(err => console.error('Error fetching initial metrics:', err));
    </script>
</body>
</html>
            `);
        });

        // API endpoints
        this.app.get('/api/metrics', async (req, res) => {
            try {
                const metrics = await this.metricsCollector.collectMetrics();
                res.json(metrics);
            } catch (error) {
                console.error('Error collecting metrics:', error);
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

        // Health check
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
        });
    }

    async sendMetricsToClient(socket) {
        try {
            const metrics = await this.metricsCollector.collectMetrics();
            socket.emit('metrics', metrics);
        } catch (error) {
            console.error('Failed to send metrics to client:', error);
        }
    }

    async startMetricsCollection() {
        console.log('Starting real-time metrics collection...');

        // Collect metrics every second
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
                console.error('Error collecting metrics:', error);
            }
        }, this.updateInterval);
    }

    start(port = 3003) {
        this.server.listen(port, () => {
            console.log(`\n🚀 Swarm Dashboard Server running on port ${port}`);
            console.log(`📊 Dashboard: http://localhost:${port}`);
            console.log(`⚡ Real-time updates: 1-second intervals`);
            console.log(`\n✅ Dashboard is ready to display swarm activity!\n`);
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
    const server = new SimpleMonitorServer();
    server.start();
}

export { SimpleMonitorServer };