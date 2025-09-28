#!/usr/bin/env node

/**
 * Multi-Swarm Performance Dashboard
 * Real-time monitoring and visualization for 96GB DDR5-6400 setup
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

class PerformanceDashboard {
    constructor() {
        this.configPath = './database/configs/swarm-memory-allocation.json';
        this.coordDbPath = './database/instances/coordination/cross_swarm_coordination.db';
        this.config = null;
        this.metrics = new Map();
        this.clients = new Set();
        this.isRunning = false;
        this.port = 8080;
        this.wsPort = 8081;
    }

    async initialize() {
        console.log('📊 Initializing Performance Dashboard...');

        try {
            this.config = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
            await this.startWebServer();
            await this.startWebSocketServer();
            await this.startMetricsCollection();
            console.log(`✅ Dashboard running at http://localhost:${this.port}`);
        } catch (error) {
            throw new Error(`Failed to initialize dashboard: ${error.message}`);
        }
    }

    async startWebServer() {
        const server = http.createServer(async (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/json');

            const url = new URL(req.url, `http://localhost:${this.port}`);

            try {
                switch (url.pathname) {
                    case '/':
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(await this.generateDashboardHTML());
                        break;

                    case '/api/metrics':
                        res.writeHead(200);
                        res.end(JSON.stringify(await this.getCurrentMetrics()));
                        break;

                    case '/api/swarms':
                        res.writeHead(200);
                        res.end(JSON.stringify(await this.getSwarmList()));
                        break;

                    case '/api/health':
                        res.writeHead(200);
                        res.end(JSON.stringify(await this.getSystemHealth()));
                        break;

                    case '/api/performance':
                        const timeframe = url.searchParams.get('timeframe') || '1h';
                        res.writeHead(200);
                        res.end(JSON.stringify(await this.getPerformanceHistory(timeframe)));
                        break;

                    default:
                        res.writeHead(404);
                        res.end(JSON.stringify({ error: 'Not found' }));
                }
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: error.message }));
            }
        });

        server.listen(this.port);
        console.log(`🌐 Web server started on port ${this.port}`);
    }

    async startWebSocketServer() {
        const wss = new WebSocket.Server({ port: this.wsPort });

        wss.on('connection', (ws) => {
            this.clients.add(ws);
            console.log(`📡 Client connected. Total clients: ${this.clients.size}`);

            // Send initial data
            ws.send(JSON.stringify({
                type: 'initial',
                data: this.metrics.get('current') || {}
            }));

            ws.on('close', () => {
                this.clients.delete(ws);
                console.log(`📡 Client disconnected. Total clients: ${this.clients.size}`);
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error.message);
                this.clients.delete(ws);
            });
        });

        console.log(`🔌 WebSocket server started on port ${this.wsPort}`);
    }

    async startMetricsCollection() {
        this.isRunning = true;

        const collectInterval = this.config.monitoring_metrics.collection_interval_seconds * 1000;

        const collect = async () => {
            if (!this.isRunning) return;

            try {
                const metrics = await this.collectAllMetrics();
                this.metrics.set('current', metrics);
                this.metrics.set(`history_${Date.now()}`, metrics);

                // Broadcast to WebSocket clients
                this.broadcast({
                    type: 'metrics_update',
                    timestamp: Date.now(),
                    data: metrics
                });

                // Clean up old metrics (keep last 1000 entries)
                const historyKeys = Array.from(this.metrics.keys())
                    .filter(key => key.startsWith('history_'))
                    .sort()
                    .reverse();

                if (historyKeys.length > 1000) {
                    historyKeys.slice(1000).forEach(key => this.metrics.delete(key));
                }

            } catch (error) {
                console.error('Metrics collection error:', error.message);
            }

            setTimeout(collect, collectInterval);
        };

        collect();
        console.log(`📈 Metrics collection started (${collectInterval}ms interval)`);
    }

    async collectAllMetrics() {
        const systemMetrics = await this.collectSystemMetrics();
        const swarmMetrics = await this.collectSwarmMetrics();
        const performanceMetrics = await this.collectPerformanceMetrics();
        const coordinationMetrics = await this.collectCoordinationMetrics();

        return {
            timestamp: Date.now(),
            system: systemMetrics,
            swarms: swarmMetrics,
            performance: performanceMetrics,
            coordination: coordinationMetrics
        };
    }

    async collectSystemMetrics() {
        try {
            // Get system memory info
            const memInfo = execSync('cat /proc/meminfo', { encoding: 'utf8' });
            const memLines = memInfo.split('\n');

            const getMemValue = (key) => {
                const line = memLines.find(l => l.startsWith(key));
                return line ? parseInt(line.split(/\s+/)[1]) : 0;
            };

            const totalMem = getMemValue('MemTotal');
            const availableMem = getMemValue('MemAvailable');
            const usedMem = totalMem - availableMem;

            // Get CPU usage
            const cpuInfo = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1", { encoding: 'utf8' });
            const cpuUsage = parseFloat(cpuInfo.trim()) || 0;

            return {
                memory: {
                    total_gb: Math.round(totalMem / 1024 / 1024 * 100) / 100,
                    used_gb: Math.round(usedMem / 1024 / 1024 * 100) / 100,
                    available_gb: Math.round(availableMem / 1024 / 1024 * 100) / 100,
                    usage_percent: Math.round(usedMem / totalMem * 100 * 100) / 100
                },
                cpu: {
                    usage_percent: cpuUsage
                },
                configured: {
                    total_system_gb: this.config.system_specs.total_ram_gb,
                    available_for_swarms_gb: this.config.system_specs.available_for_swarms_gb,
                    ram_type: this.config.system_specs.ram_type
                }
            };
        } catch (error) {
            console.error('Failed to collect system metrics:', error.message);
            return {
                memory: { total_gb: 96, used_gb: 0, available_gb: 96, usage_percent: 0 },
                cpu: { usage_percent: 0 },
                configured: this.config.system_specs
            };
        }
    }

    async collectSwarmMetrics() {
        const swarms = {};

        try {
            const swarmQuery = `
                SELECT swarm_id, swarm_name, environment, status,
                       memory_allocation_mb, max_agents, last_activity
                FROM swarm_registry
                WHERE status = 'active'
            `;

            const result = execSync(`sqlite3 "${this.coordDbPath}" "${swarmQuery}"`, { encoding: 'utf8' });

            for (const line of result.trim().split('\n').filter(l => l.length > 0)) {
                const [swarmId, name, env, status, memoryMB, maxAgents, lastActivity] = line.split('|');

                const swarmMetrics = await this.collectSwarmSpecificMetrics(swarmId, env);

                swarms[swarmId] = {
                    name,
                    environment: env,
                    status,
                    memory_allocation_mb: parseInt(memoryMB),
                    max_agents: parseInt(maxAgents),
                    last_activity: lastActivity,
                    ...swarmMetrics
                };
            }
        } catch (error) {
            console.error('Failed to collect swarm metrics:', error.message);
        }

        return swarms;
    }

    async collectSwarmSpecificMetrics(swarmId, environment) {
        try {
            const dbPath = `./database/instances/${environment}`;
            const swarmDbFiles = await fs.readdir(dbPath);
            const swarmDbFile = swarmDbFiles.find(file => file.includes(swarmId));

            if (!swarmDbFile) {
                return { active_agents: 0, running_tasks: 0, pending_tasks: 0 };
            }

            const fullDbPath = path.join(dbPath, swarmDbFile);
            const prefix = environment === 'production' ? 'prod_' :
                          environment === 'development' ? 'dev_' :
                          environment === 'testing' ? 'test_' :
                          environment === 'research' ? 'research_' : 'staging_';

            const metricsQuery = `
                SELECT
                    (SELECT COUNT(*) FROM ${prefix}agents WHERE status = 'active') as active_agents,
                    (SELECT COUNT(*) FROM ${prefix}tasks WHERE status = 'in_progress') as running_tasks,
                    (SELECT COUNT(*) FROM ${prefix}tasks WHERE status = 'pending') as pending_tasks,
                    (SELECT AVG(memory_usage_mb) FROM ${prefix}agents WHERE status = 'active') as avg_memory_per_agent,
                    (SELECT AVG(cpu_usage_percent) FROM ${prefix}agents WHERE status = 'active') as avg_cpu_per_agent,
                    (SELECT COUNT(*) FROM ${prefix}memory_store) as memory_entries,
                    (SELECT SUM(size_bytes) FROM ${prefix}memory_store) as total_memory_store_bytes
            `;

            const result = execSync(`sqlite3 "${fullDbPath}" "${metricsQuery}"`, { encoding: 'utf8' });
            const [activeAgents, runningTasks, pendingTasks, avgMemory, avgCpu, memoryEntries, totalMemBytes] =
                result.trim().split('|');

            return {
                active_agents: parseInt(activeAgents) || 0,
                running_tasks: parseInt(runningTasks) || 0,
                pending_tasks: parseInt(pendingTasks) || 0,
                avg_memory_per_agent_mb: parseFloat(avgMemory) || 0,
                avg_cpu_per_agent_percent: parseFloat(avgCpu) || 0,
                memory_store_entries: parseInt(memoryEntries) || 0,
                memory_store_size_mb: Math.round((parseInt(totalMemBytes) || 0) / 1024 / 1024 * 100) / 100
            };
        } catch (error) {
            console.error(`Failed to collect metrics for swarm ${swarmId}:`, error.message);
            return { active_agents: 0, running_tasks: 0, pending_tasks: 0 };
        }
    }

    async collectPerformanceMetrics() {
        const performance = {
            database_performance: {},
            memory_efficiency: {},
            task_throughput: {}
        };

        try {
            // Get database performance metrics
            const coordDbSize = await this.getDbFileSize(this.coordDbPath);
            performance.database_performance.coordination_db_size_mb = coordDbSize;

            // Calculate total memory efficiency
            const totalAllocated = await this.getTotalAllocatedMemory();
            const systemMemory = this.config.system_specs.total_ram_gb * 1024;

            performance.memory_efficiency = {
                total_allocated_mb: totalAllocated,
                system_total_mb: systemMemory,
                allocation_efficiency_percent: Math.round(totalAllocated / systemMemory * 100 * 100) / 100,
                available_for_expansion_mb: this.config.system_specs.available_for_swarms_gb * 1024 - totalAllocated
            };

        } catch (error) {
            console.error('Failed to collect performance metrics:', error.message);
        }

        return performance;
    }

    async collectCoordinationMetrics() {
        try {
            const coordQuery = `
                SELECT
                    (SELECT COUNT(*) FROM cross_swarm_coordination WHERE status = 'pending') as pending_coordinations,
                    (SELECT COUNT(*) FROM cross_swarm_coordination WHERE status = 'in_progress') as active_coordinations,
                    (SELECT COUNT(*) FROM cross_swarm_coordination WHERE status = 'completed' AND created_at > datetime('now', '-1 hour')) as completed_last_hour,
                    (SELECT COUNT(*) FROM coordination_message_queue WHERE status = 'queued') as queued_messages,
                    (SELECT COUNT(*) FROM resource_sharing WHERE status = 'active') as active_resource_shares
            `;

            const result = execSync(`sqlite3 "${this.coordDbPath}" "${coordQuery}"`, { encoding: 'utf8' });
            const [pendingCoord, activeCoord, completedHour, queuedMsgs, activeShares] = result.trim().split('|');

            return {
                pending_coordinations: parseInt(pendingCoord) || 0,
                active_coordinations: parseInt(activeCoord) || 0,
                completed_last_hour: parseInt(completedHour) || 0,
                queued_messages: parseInt(queuedMsgs) || 0,
                active_resource_shares: parseInt(activeShares) || 0
            };
        } catch (error) {
            console.error('Failed to collect coordination metrics:', error.message);
            return {};
        }
    }

    async getDbFileSize(dbPath) {
        try {
            const stats = await fs.stat(dbPath);
            return Math.round(stats.size / 1024 / 1024 * 100) / 100; // MB
        } catch (error) {
            return 0;
        }
    }

    async getTotalAllocatedMemory() {
        try {
            const query = `SELECT SUM(memory_allocation_mb) as total FROM swarm_registry WHERE status = 'active'`;
            const result = execSync(`sqlite3 "${this.coordDbPath}" "${query}"`, { encoding: 'utf8' });
            return parseInt(result.trim()) || 0;
        } catch (error) {
            return 0;
        }
    }

    broadcast(message) {
        const messageStr = JSON.stringify(message);
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(messageStr);
                } catch (error) {
                    console.error('Failed to send message to client:', error.message);
                    this.clients.delete(client);
                }
            }
        });
    }

    async getCurrentMetrics() {
        return this.metrics.get('current') || {};
    }

    async getSwarmList() {
        const current = this.metrics.get('current');
        return current?.swarms || {};
    }

    async getSystemHealth() {
        const current = this.metrics.get('current');
        if (!current) return { status: 'unknown' };

        const system = current.system;
        const memoryUsage = system?.memory?.usage_percent || 0;
        const cpuUsage = system?.cpu?.usage_percent || 0;

        let status = 'healthy';
        const issues = [];

        if (memoryUsage > 90) {
            status = 'critical';
            issues.push('High memory usage');
        } else if (memoryUsage > 80) {
            status = 'warning';
            issues.push('Elevated memory usage');
        }

        if (cpuUsage > 90) {
            status = 'critical';
            issues.push('High CPU usage');
        } else if (cpuUsage > 80) {
            status = 'warning';
            issues.push('Elevated CPU usage');
        }

        return {
            status,
            issues,
            memory_usage_percent: memoryUsage,
            cpu_usage_percent: cpuUsage,
            timestamp: current.timestamp
        };
    }

    async getPerformanceHistory(timeframe) {
        const now = Date.now();
        const timeframes = {
            '1h': 60 * 60 * 1000,
            '6h': 6 * 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000
        };

        const duration = timeframes[timeframe] || timeframes['1h'];
        const cutoff = now - duration;

        const historyEntries = Array.from(this.metrics.entries())
            .filter(([key, value]) => {
                return key.startsWith('history_') && value.timestamp >= cutoff;
            })
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => value);

        return {
            timeframe,
            entries: historyEntries.length,
            data: historyEntries
        };
    }

    async generateDashboardHTML() {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Multi-Swarm Performance Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .header h1 { margin: 0; }
        .header .subtitle { opacity: 0.8; margin-top: 5px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card h3 { margin-top: 0; color: #2c3e50; }
        .metric { display: flex; justify-content: space-between; margin: 10px 0; }
        .metric-label { font-weight: bold; }
        .metric-value { color: #27ae60; }
        .status-healthy { color: #27ae60; }
        .status-warning { color: #f39c12; }
        .status-critical { color: #e74c3c; }
        .progress-bar { width: 100%; height: 20px; background: #ecf0f1; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background: #3498db; transition: width 0.3s; }
        .swarm-list { list-style: none; padding: 0; }
        .swarm-item { padding: 10px; border-left: 4px solid #3498db; margin: 10px 0; background: #f8f9fa; }
        .real-time { font-size: 12px; color: #7f8c8d; }
        #connectionStatus {
            position: fixed; top: 10px; right: 10px; padding: 5px 10px;
            border-radius: 4px; font-size: 12px;
        }
        .connected { background: #2ecc71; color: white; }
        .disconnected { background: #e74c3c; color: white; }
    </style>
</head>
<body>
    <div id="connectionStatus" class="disconnected">Connecting...</div>

    <div class="header">
        <h1>Multi-Swarm Performance Dashboard</h1>
        <div class="subtitle">96GB DDR5-6400 | Real-time Monitoring</div>
    </div>

    <div class="grid">
        <div class="card">
            <h3>System Overview</h3>
            <div id="systemMetrics">
                <div class="metric">
                    <span class="metric-label">Memory Usage:</span>
                    <span class="metric-value" id="memoryUsage">Loading...</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" id="memoryProgress" style="width: 0%;"></div>
                </div>
                <div class="metric">
                    <span class="metric-label">CPU Usage:</span>
                    <span class="metric-value" id="cpuUsage">Loading...</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" id="cpuProgress" style="width: 0%;"></div>
                </div>
                <div class="metric">
                    <span class="metric-label">Available for Swarms:</span>
                    <span class="metric-value" id="availableMemory">Loading...</span>
                </div>
            </div>
        </div>

        <div class="card">
            <h3>System Health</h3>
            <div id="healthStatus">
                <div class="metric">
                    <span class="metric-label">Status:</span>
                    <span class="metric-value" id="healthStatusValue">Loading...</span>
                </div>
                <div id="healthIssues"></div>
            </div>
        </div>

        <div class="card">
            <h3>Active Swarms</h3>
            <ul class="swarm-list" id="swarmList">
                <li>Loading...</li>
            </ul>
        </div>

        <div class="card">
            <h3>Cross-Swarm Coordination</h3>
            <div id="coordinationMetrics">
                <div class="metric">
                    <span class="metric-label">Active Coordinations:</span>
                    <span class="metric-value" id="activeCoordinations">0</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Pending:</span>
                    <span class="metric-value" id="pendingCoordinations">0</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Queued Messages:</span>
                    <span class="metric-value" id="queuedMessages">0</span>
                </div>
            </div>
        </div>

        <div class="card">
            <h3>Memory Allocation</h3>
            <div id="memoryAllocation">
                <div class="metric">
                    <span class="metric-label">Total Allocated:</span>
                    <span class="metric-value" id="totalAllocated">Loading...</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Allocation Efficiency:</span>
                    <span class="metric-value" id="allocationEfficiency">Loading...</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Available for Expansion:</span>
                    <span class="metric-value" id="expansionCapacity">Loading...</span>
                </div>
            </div>
        </div>

        <div class="card">
            <h3>Performance Summary</h3>
            <div id="performanceSummary">
                <div class="metric">
                    <span class="metric-label">Total Active Agents:</span>
                    <span class="metric-value" id="totalAgents">0</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Running Tasks:</span>
                    <span class="metric-value" id="totalRunningTasks">0</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Pending Tasks:</span>
                    <span class="metric-value" id="totalPendingTasks">0</span>
                </div>
            </div>
        </div>
    </div>

    <div class="real-time" id="lastUpdate">Last update: Never</div>

    <script>
        let ws;
        const connectionStatus = document.getElementById('connectionStatus');

        function connect() {
            ws = new WebSocket('ws://localhost:${this.wsPort}');

            ws.onopen = function() {
                connectionStatus.textContent = 'Connected';
                connectionStatus.className = 'connected';
            };

            ws.onmessage = function(event) {
                const message = JSON.parse(event.data);
                if (message.type === 'metrics_update' || message.type === 'initial') {
                    updateDashboard(message.data);
                }
            };

            ws.onclose = function() {
                connectionStatus.textContent = 'Disconnected';
                connectionStatus.className = 'disconnected';
                // Reconnect after 5 seconds
                setTimeout(connect, 5000);
            };

            ws.onerror = function(error) {
                console.error('WebSocket error:', error);
            };
        }

        function updateDashboard(data) {
            if (!data) return;

            // Update system metrics
            if (data.system) {
                const sys = data.system;
                if (sys.memory) {
                    document.getElementById('memoryUsage').textContent =
                        sys.memory.used_gb.toFixed(1) + 'GB / ' + sys.memory.total_gb.toFixed(1) + 'GB (' + sys.memory.usage_percent.toFixed(1) + '%)';
                    document.getElementById('memoryProgress').style.width = sys.memory.usage_percent + '%';
                    document.getElementById('availableMemory').textContent = sys.memory.available_gb.toFixed(1) + 'GB';
                }
                if (sys.cpu) {
                    document.getElementById('cpuUsage').textContent = sys.cpu.usage_percent.toFixed(1) + '%';
                    document.getElementById('cpuProgress').style.width = sys.cpu.usage_percent + '%';
                }
            }

            // Update swarm list
            if (data.swarms) {
                const swarmList = document.getElementById('swarmList');
                swarmList.innerHTML = '';

                let totalAgents = 0, totalRunning = 0, totalPending = 0;

                for (const [swarmId, swarm] of Object.entries(data.swarms)) {
                    const li = document.createElement('li');
                    li.className = 'swarm-item';
                    li.innerHTML =
                        '<strong>' + swarm.name + '</strong> (' + swarm.environment + ')<br>' +
                        'Agents: ' + swarm.active_agents + '/' + swarm.max_agents + ' | ' +
                        'Tasks: ' + swarm.running_tasks + ' running, ' + swarm.pending_tasks + ' pending<br>' +
                        'Memory: ' + (swarm.memory_allocation_mb / 1024).toFixed(1) + 'GB';
                    swarmList.appendChild(li);

                    totalAgents += swarm.active_agents || 0;
                    totalRunning += swarm.running_tasks || 0;
                    totalPending += swarm.pending_tasks || 0;
                }

                document.getElementById('totalAgents').textContent = totalAgents;
                document.getElementById('totalRunningTasks').textContent = totalRunning;
                document.getElementById('totalPendingTasks').textContent = totalPending;
            }

            // Update coordination metrics
            if (data.coordination) {
                document.getElementById('activeCoordinations').textContent = data.coordination.active_coordinations || 0;
                document.getElementById('pendingCoordinations').textContent = data.coordination.pending_coordinations || 0;
                document.getElementById('queuedMessages').textContent = data.coordination.queued_messages || 0;
            }

            // Update performance metrics
            if (data.performance && data.performance.memory_efficiency) {
                const mem = data.performance.memory_efficiency;
                document.getElementById('totalAllocated').textContent = (mem.total_allocated_mb / 1024).toFixed(1) + 'GB';
                document.getElementById('allocationEfficiency').textContent = mem.allocation_efficiency_percent.toFixed(1) + '%';
                document.getElementById('expansionCapacity').textContent = (mem.available_for_expansion_mb / 1024).toFixed(1) + 'GB';
            }

            document.getElementById('lastUpdate').textContent = 'Last update: ' + new Date().toLocaleTimeString();
        }

        // Start connection
        connect();

        // Fallback: Poll API if WebSocket fails
        setInterval(async () => {
            if (ws.readyState !== WebSocket.OPEN) {
                try {
                    const response = await fetch('/api/metrics');
                    const data = await response.json();
                    updateDashboard(data);
                } catch (error) {
                    console.error('Failed to fetch metrics:', error);
                }
            }
        }, 10000);
    </script>
</body>
</html>
        `;
    }

    stop() {
        console.log('🛑 Stopping Performance Dashboard...');
        this.isRunning = false;
        this.clients.forEach(client => client.close());
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'start';

    const dashboard = new PerformanceDashboard();

    try {
        switch (command) {
            case 'start':
                await dashboard.initialize();

                // Handle graceful shutdown
                process.on('SIGINT', () => {
                    dashboard.stop();
                    process.exit(0);
                });
                process.on('SIGTERM', () => {
                    dashboard.stop();
                    process.exit(0);
                });

                // Keep process alive
                process.stdin.resume();
                break;

            default:
                console.log(`
Multi-Swarm Performance Dashboard

Usage:
  node performance-dashboard.js [command]

Commands:
  start     Start the dashboard server (default)

The dashboard will be available at:
  Web UI: http://localhost:8080
  WebSocket: ws://localhost:8081
                `);
        }
    } catch (error) {
        console.error('❌ Dashboard failed:', error.message);
        process.exit(1);
    }
}

// Add WebSocket dependency check
try {
    require.resolve('ws');
} catch (error) {
    console.warn('⚠️  WebSocket module not found. Install with: npm install ws');
    console.log('Dashboard will run in HTTP-only mode.');
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = PerformanceDashboard;