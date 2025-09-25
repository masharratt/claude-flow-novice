/**
 * Real-time Performance Monitor for Byzantine Consensus System
 * Provides comprehensive system metrics collection and analysis
 */

import { EventEmitter } from 'events';
import os from 'os';

export class PerformanceMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            samplingInterval: options.samplingInterval || 1000, // 1 second
            metricsRetention: options.metricsRetention || 300, // 5 minutes
            alertThresholds: {
                cpu: options.cpuThreshold || 80,
                memory: options.memoryThreshold || 500 * 1024 * 1024, // 500MB
                responseTime: options.responseTimeThreshold || 5000, // 5 seconds
                consensusTime: options.consensusTimeThreshold || 10000, // 10 seconds
                ...options.alertThresholds
            }
        };

        this.metrics = {
            cpu: [],
            memory: [],
            network: [],
            consensus: [],
            responseTime: [],
            throughput: [],
            errors: []
        };

        this.alerts = [];
        this.isMonitoring = false;
        this.startTime = null;
        this.intervalId = null;

        // Performance counters
        this.counters = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            consensusOperations: 0,
            byzantineFaults: 0
        };

        this.initializeMonitoring();
    }

    initializeMonitoring() {
        this.on('metric', this.handleMetric.bind(this));
        this.on('alert', this.handleAlert.bind(this));
    }

    start() {
        if (this.isMonitoring) {
            return;
        }

        console.log('🔍 Performance Monitor: Starting system monitoring...');
        this.isMonitoring = true;
        this.startTime = Date.now();

        this.intervalId = setInterval(() => {
            this.collectMetrics();
        }, this.options.samplingInterval);

        this.emit('monitoring-started');
    }

    stop() {
        if (!this.isMonitoring) {
            return;
        }

        console.log('⏹️ Performance Monitor: Stopping system monitoring...');
        this.isMonitoring = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.emit('monitoring-stopped');
    }

    collectMetrics() {
        const timestamp = Date.now();

        // Collect system metrics
        const cpuUsage = this.getCPUUsage();
        const memoryUsage = this.getMemoryUsage();
        const networkStats = this.getNetworkStats();

        // Store metrics with timestamp
        this.addMetric('cpu', { timestamp, value: cpuUsage });
        this.addMetric('memory', { timestamp, value: memoryUsage });
        this.addMetric('network', { timestamp, value: networkStats });

        // Check for alerts
        this.checkAlerts(timestamp, {
            cpu: cpuUsage,
            memory: memoryUsage,
            network: networkStats
        });

        // Clean old metrics
        this.cleanOldMetrics(timestamp);
    }

    getCPUUsage() {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach(cpu => {
            for (let type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });

        const idle = totalIdle / cpus.length;
        const total = totalTick / cpus.length;
        const usage = 100 - ~~(100 * idle / total);

        return {
            usage: usage,
            cores: cpus.length,
            loadAverage: os.loadavg()
        };
    }

    getMemoryUsage() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const processMemory = process.memoryUsage();

        return {
            total: totalMemory,
            free: freeMemory,
            used: usedMemory,
            usagePercent: (usedMemory / totalMemory) * 100,
            process: {
                heapUsed: processMemory.heapUsed,
                heapTotal: processMemory.heapTotal,
                external: processMemory.external,
                rss: processMemory.rss
            }
        };
    }

    getNetworkStats() {
        const interfaces = os.networkInterfaces();
        const stats = {
            interfaces: Object.keys(interfaces).length,
            active: 0
        };

        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (!iface.internal && iface.family === 'IPv4') {
                    stats.active++;
                }
            }
        }

        return stats;
    }

    // Record consensus-specific metrics
    recordConsensusMetric(metric) {
        const timestamp = Date.now();
        this.addMetric('consensus', { timestamp, ...metric });

        if (metric.duration) {
            this.checkConsensusPerformance(metric.duration);
        }

        this.counters.consensusOperations++;
        if (metric.byzantine) {
            this.counters.byzantineFaults++;
        }
    }

    recordResponseTime(duration, success = true) {
        const timestamp = Date.now();
        this.addMetric('responseTime', { timestamp, duration, success });

        this.counters.totalRequests++;
        if (success) {
            this.counters.successfulRequests++;
        } else {
            this.counters.failedRequests++;
        }

        if (duration > this.options.alertThresholds.responseTime) {
            this.triggerAlert('response-time', {
                duration,
                threshold: this.options.alertThresholds.responseTime,
                timestamp
            });
        }
    }

    recordThroughput(operations, duration) {
        const timestamp = Date.now();
        const throughput = operations / (duration / 1000); // ops per second

        this.addMetric('throughput', { timestamp, throughput, operations, duration });
    }

    recordError(error, category = 'general') {
        const timestamp = Date.now();
        this.addMetric('errors', { timestamp, error: error.message, category, stack: error.stack });
    }

    addMetric(type, data) {
        if (!this.metrics[type]) {
            this.metrics[type] = [];
        }

        this.metrics[type].push(data);
        this.emit('metric', { type, data });
    }

    checkAlerts(timestamp, currentMetrics) {
        // CPU alert
        if (currentMetrics.cpu.usage > this.options.alertThresholds.cpu) {
            this.triggerAlert('high-cpu', {
                usage: currentMetrics.cpu.usage,
                threshold: this.options.alertThresholds.cpu,
                timestamp
            });
        }

        // Memory alert
        if (currentMetrics.memory.used > this.options.alertThresholds.memory) {
            this.triggerAlert('high-memory', {
                used: currentMetrics.memory.used,
                threshold: this.options.alertThresholds.memory,
                timestamp
            });
        }
    }

    checkConsensusPerformance(duration) {
        if (duration > this.options.alertThresholds.consensusTime) {
            this.triggerAlert('slow-consensus', {
                duration,
                threshold: this.options.alertThresholds.consensusTime,
                timestamp: Date.now()
            });
        }
    }

    triggerAlert(type, data) {
        const alert = {
            id: `${type}-${Date.now()}`,
            type,
            timestamp: data.timestamp,
            data,
            severity: this.getAlertSeverity(type, data)
        };

        this.alerts.push(alert);
        this.emit('alert', alert);

        console.warn(`🚨 Performance Alert [${alert.severity}]: ${type}`, data);
    }

    getAlertSeverity(type, data) {
        const severityMap = {
            'high-cpu': data.usage > 90 ? 'critical' : 'warning',
            'high-memory': data.used > (this.options.alertThresholds.memory * 1.2) ? 'critical' : 'warning',
            'response-time': data.duration > (this.options.alertThresholds.responseTime * 2) ? 'critical' : 'warning',
            'slow-consensus': data.duration > (this.options.alertThresholds.consensusTime * 1.5) ? 'critical' : 'warning'
        };

        return severityMap[type] || 'info';
    }

    cleanOldMetrics(currentTimestamp) {
        const retentionTime = this.options.metricsRetention * 1000;
        const cutoffTime = currentTimestamp - retentionTime;

        for (const type in this.metrics) {
            this.metrics[type] = this.metrics[type].filter(
                metric => metric.timestamp > cutoffTime
            );
        }
    }

    getMetrics(type, timeRange = 60000) { // Default: last 1 minute
        const now = Date.now();
        const startTime = now - timeRange;

        if (type) {
            return this.metrics[type].filter(m => m.timestamp >= startTime);
        }

        const filteredMetrics = {};
        for (const metricType in this.metrics) {
            filteredMetrics[metricType] = this.metrics[metricType].filter(
                m => m.timestamp >= startTime
            );
        }

        return filteredMetrics;
    }

    getAverageMetric(type, timeRange = 60000) {
        const metrics = this.getMetrics(type, timeRange);
        if (metrics.length === 0) return null;

        const sum = metrics.reduce((acc, metric) => {
            if (typeof metric.value === 'number') {
                return acc + metric.value;
            } else if (metric.value && typeof metric.value.usage === 'number') {
                return acc + metric.value.usage;
            } else if (typeof metric.duration === 'number') {
                return acc + metric.duration;
            }
            return acc;
        }, 0);

        return sum / metrics.length;
    }

    getCurrentStatus() {
        const uptime = this.startTime ? Date.now() - this.startTime : 0;
        const currentMetrics = this.getMetrics(null, 5000); // Last 5 seconds

        return {
            uptime,
            isMonitoring: this.isMonitoring,
            counters: { ...this.counters },
            alerts: this.alerts.length,
            recentMetrics: {
                cpu: this.getAverageMetric('cpu', 5000),
                memory: this.getAverageMetric('memory', 5000),
                responseTime: this.getAverageMetric('responseTime', 5000),
                consensus: this.getAverageMetric('consensus', 5000)
            },
            activeAlerts: this.alerts.filter(a =>
                Date.now() - a.timestamp < 300000 // Last 5 minutes
            ).length
        };
    }

    generateReport(timeRange = 300000) { // Default: last 5 minutes
        const metrics = this.getMetrics(null, timeRange);
        const status = this.getCurrentStatus();

        const report = {
            timestamp: new Date().toISOString(),
            timeRange: timeRange / 1000, // seconds
            status,
            performance: {
                cpu: this.analyzeMetrics('cpu', metrics.cpu),
                memory: this.analyzeMetrics('memory', metrics.memory),
                responseTime: this.analyzeMetrics('responseTime', metrics.responseTime),
                consensus: this.analyzeMetrics('consensus', metrics.consensus),
                throughput: this.analyzeMetrics('throughput', metrics.throughput)
            },
            alerts: {
                total: this.alerts.length,
                recent: this.alerts.filter(a => Date.now() - a.timestamp < timeRange),
                byType: this.groupAlertsByType(),
                bySeverity: this.groupAlertsBySeverity()
            },
            recommendations: this.generateRecommendations(metrics, status)
        };

        return report;
    }

    analyzeMetrics(type, metrics) {
        if (!metrics || metrics.length === 0) {
            return { available: false };
        }

        const values = metrics.map(m => {
            if (typeof m.value === 'number') return m.value;
            if (m.value && typeof m.value.usage === 'number') return m.value.usage;
            if (typeof m.duration === 'number') return m.duration;
            if (typeof m.throughput === 'number') return m.throughput;
            return 0;
        });

        const sorted = values.sort((a, b) => a - b);
        const sum = values.reduce((a, b) => a + b, 0);

        return {
            available: true,
            count: values.length,
            average: sum / values.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            median: sorted[Math.floor(sorted.length / 2)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)]
        };
    }

    groupAlertsByType() {
        const groups = {};
        this.alerts.forEach(alert => {
            groups[alert.type] = (groups[alert.type] || 0) + 1;
        });
        return groups;
    }

    groupAlertsBySeverity() {
        const groups = {};
        this.alerts.forEach(alert => {
            groups[alert.severity] = (groups[alert.severity] || 0) + 1;
        });
        return groups;
    }

    generateRecommendations(metrics, status) {
        const recommendations = [];

        // CPU recommendations
        if (status.recentMetrics.cpu > 80) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                message: 'High CPU usage detected. Consider scaling horizontally or optimizing algorithms.',
                metrics: { cpu: status.recentMetrics.cpu }
            });
        }

        // Memory recommendations
        if (status.recentMetrics.memory > 400 * 1024 * 1024) { // 400MB
            recommendations.push({
                type: 'memory',
                priority: 'high',
                message: 'High memory usage detected. Check for memory leaks and consider garbage collection tuning.',
                metrics: { memory: status.recentMetrics.memory }
            });
        }

        // Response time recommendations
        if (status.recentMetrics.responseTime > 3000) {
            recommendations.push({
                type: 'latency',
                priority: 'medium',
                message: 'High response times detected. Consider caching, database optimization, or async processing.',
                metrics: { responseTime: status.recentMetrics.responseTime }
            });
        }

        // Byzantine consensus recommendations
        if (status.counters.byzantineFaults > status.counters.consensusOperations * 0.1) {
            recommendations.push({
                type: 'security',
                priority: 'critical',
                message: 'High Byzantine fault rate detected. Investigate potential security threats.',
                metrics: {
                    byzantineFaults: status.counters.byzantineFaults,
                    faultRate: (status.counters.byzantineFaults / status.counters.consensusOperations) * 100
                }
            });
        }

        return recommendations;
    }

    handleMetric(event) {
        // Override in subclass for custom metric handling
    }

    handleAlert(alert) {
        // Override in subclass for custom alert handling
    }

    // Utility methods for testing
    simulateLoad(options = {}) {
        const {
            duration = 10000,
            cpuLoad = 50,
            memoryMB = 100,
            requestsPerSecond = 10
        } = options;

        console.log(`🎯 Simulating load for ${duration}ms...`);

        const startTime = Date.now();
        const interval = setInterval(() => {
            // Simulate CPU load
            const start = Date.now();
            while (Date.now() - start < cpuLoad) {
                Math.random();
            }

            // Simulate memory allocation
            const memoryChunk = new Array(memoryMB * 1024).fill('test');

            // Simulate requests
            for (let i = 0; i < requestsPerSecond; i++) {
                const responseTime = 100 + Math.random() * 400;
                this.recordResponseTime(responseTime, Math.random() > 0.05);
            }

            if (Date.now() - startTime >= duration) {
                clearInterval(interval);
                console.log('✅ Load simulation completed');
            }
        }, 1000);

        return new Promise(resolve => {
            setTimeout(resolve, duration + 1000);
        });
    }

    reset() {
        this.metrics = {
            cpu: [],
            memory: [],
            network: [],
            consensus: [],
            responseTime: [],
            throughput: [],
            errors: []
        };

        this.alerts = [];
        this.counters = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            consensusOperations: 0,
            byzantineFaults: 0
        };

        console.log('🔄 Performance Monitor reset completed');
    }
}