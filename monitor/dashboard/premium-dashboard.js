// Premium Performance Monitor Dashboard
class PremiumDashboard {
    constructor() {
        this.socket = null;
        this.charts = {};
        this.updateInterval = 1000; // 1 second updates
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
        this.setupWebSocket();
        this.setupEventListeners();
        this.initializeCharts();
        this.startMetricsCollection();
        this.setupBenchmarkControls();
    }

    setupWebSocket() {
        // Connect to real-time metrics server
        this.socket = io('ws://localhost:3001', {
            transports: ['websocket'],
            upgrade: false
        });

        this.socket.on('connect', () => {
            this.updateConnectionStatus('connected');
            console.log('Connected to metrics server');
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus('disconnected');
            console.log('Disconnected from metrics server');
        });

        this.socket.on('metrics', (data) => {
            this.updateMetrics(data);
        });

        this.socket.on('alert', (alert) => {
            this.addAlert(alert);
        });

        this.socket.on('recommendation', (recommendation) => {
            this.addRecommendation(recommendation);
        });

        // Fallback to polling if WebSocket fails
        this.socket.on('connect_error', () => {
            this.updateConnectionStatus('disconnected');
            this.startPolling();
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

        const swarms = this.metrics.swarms || new Map();
        swarmGrid.innerHTML = '';

        swarms.forEach((swarm, id) => {
            const swarmElement = document.createElement('div');
            swarmElement.className = 'swarm-instance';
            swarmElement.innerHTML = `
                <div class="swarm-name">${swarm.name || `Swarm ${id}`}</div>
                <div class="swarm-status ${swarm.status}">${swarm.status}</div>
                <div class="swarm-metrics">
                    <div>Agents: ${swarm.agents || 0}</div>
                    <div>Tasks: ${swarm.tasks || 0}</div>
                    <div>CPU: ${swarm.cpu?.toFixed(1) || 0}%</div>
                    <div>Memory: ${swarm.memory?.toFixed(1) || 0}MB</div>
                </div>
            `;
            swarmGrid.appendChild(swarmElement);
        });
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

    updateConnectionStatus(status) {
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('connection-text');

        statusDot.className = `status-dot ${status}`;

        switch (status) {
            case 'connected':
                statusText.textContent = 'Connected';
                break;
            case 'disconnected':
                statusText.textContent = 'Disconnected';
                break;
            case 'connecting':
                statusText.textContent = 'Connecting...';
                break;
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
        // If WebSocket is not available, start polling
        if (!this.socket || !this.socket.connected) {
            this.startPolling();
        }
    }

    startPolling() {
        setInterval(async () => {
            try {
                const response = await fetch('/api/metrics');
                const data = await response.json();
                this.updateMetrics(data);
            } catch (error) {
                console.error('Failed to fetch metrics:', error);
            }
        }, this.updateInterval);
    }

    refreshMetrics() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('refresh');
        } else {
            this.startPolling();
        }
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.premiumDashboard = new PremiumDashboard();
});