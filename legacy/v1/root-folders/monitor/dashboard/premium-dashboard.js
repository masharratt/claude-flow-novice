// Premium Performance Monitor Dashboard
class PremiumDashboard {
    constructor() {
        this.socket = null;
        this.pollingService = null;
        this.charts = {};
        this.updateInterval = 1000; // 1 second updates
        this.connectionMode = 'websocket'; // 'websocket' or 'polling'
        this.metrics = {
            system: {},
            swarms: new Map(),
            database: {},
            network: {},
            alerts: [],
            recommendations: []
        };
        this.init();
    }

    async init() {
        this.initializePollingService();
        this.setupWebSocket();
        this.setupEventListeners();
        this.initializeCharts();
        this.startMetricsCollection();
        this.setupBenchmarkControls();
    }

    setupWebSocket() {
        // Wait for authentication before connecting
        if (!window.authClient || !window.authClient.isAuthenticated()) {
            // Retry after delay
            setTimeout(() => this.setupWebSocket(), 1000);
            return;
        }

        // Connect to real-time metrics server with authentication
        this.socket = io(window.location.origin, {
            auth: {
                token: window.authClient.getCurrentToken()
            },
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true,
            timeout: 5000,
            forceNew: false
        });

        this.socket.on('connect', () => {
            this.connectionMode = 'websocket';
            this.updateConnectionStatus('connected');
            console.log('🔐 Securely connected to metrics server via WebSocket');

            // Stop polling if it was active
            if (this.pollingService) {
                this.pollingService.setWebSocketStatus(true);
            }

            // Add notification about connection mode
            this.addAlert({
                title: 'WebSocket Connected',
                message: 'Real-time updates enabled via WebSocket',
                severity: 'info'
            });
        });

        this.socket.on('disconnect', (reason) => {
            this.updateConnectionStatus('disconnected');
            console.log('📴 Disconnected from metrics server:', reason);

            // If authentication failed, show login
            if (reason === 'authentication error') {
                window.authClient.showLoginModal();
            } else {
                // Start polling fallback for other disconnection reasons
                this.activatePollingFallback();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('🔴 WebSocket connection error:', error);
            this.updateConnectionStatus('disconnected');

            // Handle authentication errors
            if (error.message.includes('Authentication') || error.message.includes('401')) {
                window.authClient.showLoginModal();
            } else {
                // Fallback to polling for non-auth errors
                this.activatePollingFallback();
            }
        });

        this.socket.on('metrics', (data) => {
            if (this.connectionMode === 'websocket') {
                this.updateMetrics(data);
            }
        });

        this.socket.on('alert', (alert) => {
            this.addAlert(alert);
        });

        this.socket.on('recommendation', (recommendation) => {
            this.addRecommendation(recommendation);
        });

        this.socket.on('security_alert', (alert) => {
            this.addSecurityAlert(alert);
        });
    }

    initializePollingService() {
        // Import HttpPollingService
        import('./http-polling-service.js').then(module => {
            this.pollingService = new module.HttpPollingService({
                pollingInterval: this.updateInterval,
                timeout: 5000,
                maxRetries: 3,
                retryDelay: 2000
            });

            // Subscribe to polling events
            this.pollingService.subscribe('metrics', (data) => {
                if (this.connectionMode === 'polling') {
                    this.updateMetrics(data);
                }
            });

            this.pollingService.subscribe('pollingStarted', () => {
                console.log('📡 HTTP polling fallback activated');
                this.updateConnectionStatus('polling');
            });

            this.pollingService.subscribe('pollingStopped', () => {
                console.log('📡 HTTP polling stopped');
            });

            this.pollingService.subscribe('pollingRetry', (data) => {
                console.log(`🔄 Polling retry ${data.attempt}/${data.maxRetries}`);
            });

            this.pollingService.subscribe('pollingFailed', (data) => {
                console.error('💥 Polling failed:', data.error);
                this.addAlert({
                    title: 'Connection Failed',
                    message: 'Unable to fetch metrics. Please check your connection.',
                    severity: 'critical'
                });
            });

        }).catch(error => {
            console.error('Failed to load polling service:', error);
        });
    }

    setupEventListeners() {
        // Chart timeframe controls
        document.querySelectorAll('.chart-control').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chart-control').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateChartTimeframe(e.target.dataset.timeframe);
            });
        });

        // Alert filters
        document.querySelectorAll('.alert-filter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.alert-filter').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filterAlerts(e.target.dataset.severity);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                this.refreshMetrics();
            }
        });

        // Connection mode indicator click to force switch
        document.getElementById('connection-text')?.addEventListener('click', () => {
            this.toggleConnectionMode();
        });
    }

    initializeCharts() {
        this.initPerformanceChart();
    }

    initPerformanceChart() {
        const ctx = document.getElementById('realtime-performance-chart');
        if (!ctx) return;

        this.charts.performance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Memory Usage (%)',
                        data: [],
                        borderColor: '#00d4ff',
                        backgroundColor: 'rgba(0, 212, 255, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'CPU Usage (%)',
                        data: [],
                        borderColor: '#00ff88',
                        backgroundColor: 'rgba(0, 255, 136, 0.1)',
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Network I/O (MB/s)',
                        data: [],
                        borderColor: '#ffaa00',
                        backgroundColor: 'rgba(255, 170, 0, 0.1)',
                        tension: 0.4,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 750,
                    easing: 'easeInOutQuart'
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'second',
                            displayFormats: {
                                second: 'HH:mm:ss'
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#aaaaaa'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#aaaaaa',
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#ffffff',
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1
                    }
                }
            }
        });
    }

    updateMetrics(data) {
        this.metrics = { ...this.metrics, ...data };
        this.updateSystemMetrics();
        this.updateSwarmMetrics();
        this.updateDatabaseMetrics();
        this.updateNetworkMetrics();
        this.updateCharts();
        this.updateTimestamp();
    }

    updateSystemMetrics() {
        const { system } = this.metrics;
        if (!system) return;

        // Memory usage
        const memoryUsed = system.memory?.used || 0;
        const memoryTotal = 62; // 62GB RAM
        const memoryPercent = (memoryUsed / memoryTotal) * 100;

        document.getElementById('memory-usage').textContent = `${memoryUsed.toFixed(1)}`;
        document.getElementById('memory-bar').style.width = `${memoryPercent}%`;

        // CPU usage
        const cpuUsage = system.cpu?.usage || 0;
        document.getElementById('cpu-usage').textContent = `${cpuUsage.toFixed(1)}`;
        document.getElementById('cpu-bar').style.width = `${cpuUsage}%`;

        // Memory bandwidth
        const bandwidth = system.memory?.bandwidth || 0;
        document.getElementById('memory-bandwidth').textContent = `${bandwidth.toFixed(1)}`;

        // Heap metrics
        if (system.heap) {
            document.getElementById('heap-used').textContent = `${(system.heap.used / 1024 / 1024).toFixed(1)} MB`;
            document.getElementById('heap-total').textContent = `${(system.heap.total / 1024 / 1024).toFixed(1)} MB`;
            document.getElementById('heap-limit').textContent = `${(system.heap.limit / 1024 / 1024).toFixed(1)} MB`;
        }

        // GC stats
        if (system.gc) {
            document.getElementById('last-gc').textContent = `${system.gc.lastDuration}ms`;
            document.getElementById('gc-frequency').textContent = `${system.gc.frequency}/min`;
        }
    }

    updateSwarmMetrics() {
        const swarmGrid = document.getElementById('swarm-grid');
        if (!swarmGrid) return;

        const swarms = this.metrics.swarms || {};
        swarmGrid.innerHTML = '';

        // Add swarm summary header if multiple swarms
        const swarmCount = Object.keys(swarms).length;
        if (swarmCount > 1) {
            const summaryElement = document.createElement('div');
            summaryElement.className = 'swarm-summary';

            // Calculate totals
            let totalAgents = 0;
            let totalTasks = 0;
            let activeSwarms = 0;

            Object.values(swarms).forEach(swarm => {
                totalAgents += swarm.agents || 0;
                totalTasks += swarm.tasks || 0;
                if (swarm.status === 'active' || swarm.status === 'running') {
                    activeSwarms++;
                }
            });

            summaryElement.innerHTML = `
                <div class="summary-header">
                    <h3>Multi-Swarm Activity</h3>
                    <div class="summary-stats">
                        <span class="summary-stat">
                            <span class="stat-value">${swarmCount}</span>
                            <span class="stat-label">Total Swarms</span>
                        </span>
                        <span class="summary-stat">
                            <span class="stat-value">${totalAgents}</span>
                            <span class="stat-label">Total Agents</span>
                        </span>
                        <span class="summary-stat">
                            <span class="stat-value">${activeSwarms}</span>
                            <span class="stat-label">Active</span>
                        </span>
                    </div>
                </div>
            `;
            swarmGrid.appendChild(summaryElement);
        }

        // Display individual swarms
        Object.entries(swarms).forEach(([id, swarm]) => {
            const swarmElement = document.createElement('div');
            swarmElement.className = `swarm-instance ${swarm.status} ${swarm.isSummary ? 'summary-swarm' : ''}`;

            // Calculate progress percentage
            const progressPercent = Math.round((swarm.progress || 0) * 100);
            const confidencePercent = Math.round((swarm.confidence || 0) * 100);

            swarmElement.innerHTML = `
                <div class="swarm-header">
                    <div class="swarm-name" title="${swarm.objective || 'No objective'}">${swarm.name || `Swarm ${id}`}</div>
                    <div class="swarm-status ${swarm.status}">
                        <span class="status-indicator"></span>
                        ${swarm.status}
                    </div>
                </div>
                <div class="swarm-details">
                    <div class="swarm-metrics">
                        <div class="metric-row">
                            <span class="metric-label">Agents:</span>
                            <span class="metric-value">${swarm.agents || 0}</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-label">Tasks:</span>
                            <span class="metric-value">${swarm.tasks || 0}</span>
                        </div>
                        ${swarm.isSummary ? `
                        <div class="metric-row">
                            <span class="metric-label">Swarms:</span>
                            <span class="metric-value">${swarm.swarmCount || 1}</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="swarm-performance">
                        <div class="performance-metric">
                            <span class="perf-label">Progress</span>
                            <div class="progress-bar-container">
                                <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
                                <span class="progress-text">${progressPercent}%</span>
                            </div>
                        </div>
                        ${swarm.confidence !== undefined ? `
                        <div class="performance-metric">
                            <span class="perf-label">Confidence</span>
                            <div class="confidence-bar">
                                <div class="confidence-fill ${confidencePercent >= 90 ? 'high' : confidencePercent >= 75 ? 'medium' : 'low'}"
                                     style="width: ${confidencePercent}%"></div>
                                <span class="confidence-text">${confidencePercent}%</span>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ${swarm.uptime ? `
                <div class="swarm-footer">
                    <span class="uptime">Uptime: ${this.formatUptime(swarm.uptime)}</span>
                </div>
                ` : ''}
            `;
            swarmGrid.appendChild(swarmElement);
        });

        // If no swarms, show empty state
        if (swarmCount === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'swarm-empty-state';
            emptyState.innerHTML = `
                <div class="empty-icon">🐝</div>
                <div class="empty-title">No Active Swarms</div>
                <div class="empty-description">Start a swarm to see real-time activity here</div>
            `;
            swarmGrid.appendChild(emptyState);
        }
    }

    updateDatabaseMetrics() {
        const { database } = this.metrics;
        if (!database) return;

        document.getElementById('db-latency').textContent = `${database.latency || 0}ms`;
        document.getElementById('db-connections').textContent = database.connections || 0;
        document.getElementById('db-cache-rate').textContent = `${database.cacheHitRate || 0}%`;
        document.getElementById('db-io').textContent = `${database.ioRate || 0} MB/s`;
    }

    updateNetworkMetrics() {
        const { network } = this.metrics;
        if (!network) return;

        document.getElementById('network-in').textContent = `${(network.bytesIn / 1024 / 1024).toFixed(2)} MB/s`;
        document.getElementById('network-out').textContent = `${(network.bytesOut / 1024 / 1024).toFixed(2)} MB/s`;
        document.getElementById('network-latency').textContent = `${network.latency || 0}ms`;
        document.getElementById('active-connections').textContent = network.connections || 0;
    }

    updateCharts() {
        this.updatePerformanceChart();
    }

    updatePerformanceChart() {
        const chart = this.charts.performance;
        if (!chart) return;

        const now = new Date();
        const { system } = this.metrics;

        // Add new data point
        chart.data.labels.push(now);
        chart.data.datasets[0].data.push(system.memory?.percent || 0);
        chart.data.datasets[1].data.push(system.cpu?.usage || 0);
        chart.data.datasets[2].data.push(system.network?.ioRate || 0);

        // Keep only last 60 data points (1 minute at 1-second intervals)
        const maxPoints = 60;
        if (chart.data.labels.length > maxPoints) {
            chart.data.labels.shift();
            chart.data.datasets.forEach(dataset => dataset.data.shift());
        }

        chart.update('none'); // Update without animation for real-time feel
    }

    addAlert(alert) {
        this.metrics.alerts.unshift({
            ...alert,
            timestamp: new Date(),
            id: Date.now()
        });

        // Keep only last 50 alerts
        if (this.metrics.alerts.length > 50) {
            this.metrics.alerts = this.metrics.alerts.slice(0, 50);
        }

        this.updateAlertsDisplay();
    }

    updateAlertsDisplay() {
        const alertsList = document.getElementById('alerts-list');
        if (!alertsList) return;

        const activeFilter = document.querySelector('.alert-filter.active')?.dataset.severity || 'all';
        const filteredAlerts = activeFilter === 'all'
            ? this.metrics.alerts
            : this.metrics.alerts.filter(alert => alert.severity === activeFilter);

        alertsList.innerHTML = filteredAlerts.slice(0, 10).map(alert => `
            <div class="alert-item ${alert.severity}">
                <div class="alert-title">${alert.title}</div>
                <div class="alert-message">${alert.message}</div>
                <div class="alert-time">${alert.timestamp.toLocaleTimeString()}</div>
            </div>
        `).join('');
    }

    addRecommendation(recommendation) {
        this.metrics.recommendations.unshift({
            ...recommendation,
            timestamp: new Date(),
            id: Date.now()
        });

        // Keep only last 20 recommendations
        if (this.metrics.recommendations.length > 20) {
            this.metrics.recommendations = this.metrics.recommendations.slice(0, 20);
        }

        this.updateRecommendationsDisplay();
    }

    updateRecommendationsDisplay() {
        const recommendationsList = document.getElementById('recommendations-list');
        if (!recommendationsList) return;

        recommendationsList.innerHTML = this.metrics.recommendations.slice(0, 5).map(rec => `
            <div class="recommendation-item">
                <div class="recommendation-title">${rec.title}</div>
                <div class="recommendation-description">${rec.description}</div>
                <div class="recommendation-impact">${rec.impact} Impact</div>
            </div>
        `).join('');
    }

    setupBenchmarkControls() {
        document.getElementById('cpu-benchmark')?.addEventListener('click', () => {
            this.runBenchmark('cpu');
        });

        document.getElementById('memory-benchmark')?.addEventListener('click', () => {
            this.runBenchmark('memory');
        });

        document.getElementById('swarm-benchmark')?.addEventListener('click', () => {
            this.runBenchmark('swarm');
        });

        document.getElementById('full-benchmark')?.addEventListener('click', () => {
            this.runBenchmark('full');
        });
    }

    async runBenchmark(type) {
        // Check authentication first
        if (!window.authClient || !window.authClient.isAuthenticated()) {
            window.authClient.showLoginModal();
            return;
        }

        // Check permissions
        if (!window.authClient.hasPermission('benchmark')) {
            this.addAlert({
                title: 'Permission Denied',
                message: 'You do not have benchmark permissions',
                severity: 'warning'
            });
            return;
        }

        try {
            const response = await fetch(`/api/benchmark/${type}`, {
                method: 'POST'
            });
            const result = await response.json();
            this.updateBenchmarkResults(type, result);
        } catch (error) {
            console.error(`Benchmark ${type} failed:`, error);
            this.addAlert({
                title: 'Benchmark Failed',
                message: `${type} benchmark failed to execute`,
                severity: 'warning'
            });
        }
    }

    updateBenchmarkResults(type, result) {
        switch (type) {
            case 'cpu':
                document.getElementById('last-cpu-score').textContent = result.score || '--';
                break;
            case 'memory':
                document.getElementById('memory-throughput').textContent = `${result.throughput || '--'} GB/s`;
                break;
            case 'swarm':
                document.getElementById('swarm-efficiency').textContent = `${result.efficiency || '--'}%`;
                break;
        }
    }

    activatePollingFallback() {
        console.log('🔄 Activating HTTP polling fallback...');
        this.connectionMode = 'polling';

        if (this.pollingService) {
            this.pollingService.start();
        } else {
            // Fallback to basic polling if service not available
            this.startBasicPolling();
        }

        // Add notification about fallback activation
        this.addAlert({
            title: 'Fallback Activated',
            message: 'Switched to HTTP polling for real-time updates',
            severity: 'warning'
        });
    }

  toggleConnectionMode() {
        if (this.connectionMode === 'websocket') {
            // Manually switch to polling
            this.activatePollingFallback();
        } else {
            // Try to reconnect WebSocket
            if (this.socket) {
                this.socket.connect();
            }
        }
    }

  startBasicPolling() {
        // Basic polling fallback if HttpPollingService not available
        setInterval(async () => {
            if (this.connectionMode === 'polling') {
                try {
                    const response = await fetch('/api/metrics');
                    const data = await response.json();
                    this.updateMetrics(data);
                } catch (error) {
                    console.error('Basic polling failed:', error);
                }
            }
        }, this.updateInterval);
    }

  updateConnectionStatus(status) {
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('connection-text');

        statusDot.className = `status-dot ${status}`;

        switch (status) {
            case 'connected':
                statusText.textContent = 'WebSocket';
                statusText.title = 'Connected via WebSocket - Real-time';
                break;
            case 'polling':
                statusText.textContent = 'HTTP Polling';
                statusText.title = 'Connected via HTTP Polling - 1s updates';
                statusDot.className = 'status-dot polling';
                break;
            case 'disconnected':
                statusText.textContent = 'Disconnected';
                statusText.title = 'Connection lost - Click to retry';
                break;
            case 'connecting':
                statusText.textContent = 'Connecting...';
                statusText.title = 'Establishing connection...';
                break;
        }

        // Add visual indicator for polling mode
        if (status === 'polling') {
            statusDot.style.backgroundColor = '#ffaa00'; // Orange for polling
        } else if (status === 'connected') {
            statusDot.style.backgroundColor = '#00ff88'; // Green for WebSocket
        } else {
            statusDot.style.backgroundColor = '#ff3b30'; // Red for disconnected
        }
    }

    updateTimestamp() {
        document.getElementById('last-update-time').textContent = new Date().toLocaleTimeString();
    }

    filterAlerts(severity) {
        this.updateAlertsDisplay();
    }

    updateChartTimeframe(timeframe) {
        // Adjust chart time range based on selected timeframe
        const chart = this.charts.performance;
        if (!chart) return;

        const maxPoints = {
            '1m': 60,
            '5m': 300,
            '15m': 900,
            '1h': 3600
        };

        chart.data.labels = chart.data.labels.slice(-maxPoints[timeframe]);
        chart.data.datasets.forEach(dataset => {
            dataset.data = dataset.data.slice(-maxPoints[timeframe]);
        });

        chart.update();
    }

    startMetricsCollection() {
        // Set a timeout to check WebSocket connection after 5 seconds
        setTimeout(() => {
            if (!this.socket || !this.socket.connected) {
                console.log('WebSocket not connected after timeout, activating polling fallback');
                this.activatePollingFallback();
            }
        }, 5000);
    }

    refreshMetrics() {
        if (this.connectionMode === 'websocket' && this.socket && this.socket.connected) {
            this.socket.emit('refresh');
        } else if (this.connectionMode === 'polling' && this.pollingService) {
            this.pollingService.forcePoll();
        } else {
            // Force immediate data fetch
            this.fetchMetricsOnce();
        }
    }

    async fetchMetricsOnce() {
        try {
            const response = await fetch('/api/metrics');
            const data = await response.json();
            this.updateMetrics(data);
        } catch (error) {
            console.error('Failed to fetch metrics:', error);
        }
    }

    addSecurityAlert(alert) {
        this.addAlert({
            ...alert,
            title: `🔒 Security: ${alert.title}`,
            severity: 'critical',
            category: 'security'
        });
    }

    showSecurityStatus() {
        const user = window.authClient?.getUser();
        if (user) {
            this.addAlert({
                title: 'Security Status',
                message: `Logged in as ${user.username} (${user.role})`,
                severity: 'info',
                category: 'security'
            });
        }
    }

    formatUptime(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.premiumDashboard = new PremiumDashboard();
});