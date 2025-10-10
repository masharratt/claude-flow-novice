// Advanced Alert Manager for Premium Performance Monitoring
import { EventEmitter } from 'events';

export class AlertManager extends EventEmitter {
    constructor() {
        super();
        this.activeAlerts = new Map();
        this.alertHistory = [];
        this.thresholds = this.getDefaultThresholds();
        this.alertRules = this.getDefaultAlertRules();
        this.suppressions = new Map();
        this.notificationChannels = [];
    }

    getDefaultThresholds() {
        return {
            // System thresholds optimized for 62GB/24-core setup
            system: {
                memory: {
                    warning: 80,    // 80% of 62GB = ~50GB
                    critical: 90,   // 90% of 62GB = ~56GB
                    warningBytes: 50 * 1024 * 1024 * 1024,
                    criticalBytes: 56 * 1024 * 1024 * 1024
                },
                cpu: {
                    warning: 80,    // 80% across 24 cores
                    critical: 95,   // 95% across 24 cores
                    loadAverage: {
                        warning: 20,    // Load average warning for 24 cores
                        critical: 30    // Load average critical for 24 cores
                    }
                },
                disk: {
                    warning: 85,
                    critical: 95,
                    iopsWarning: 1000,
                    iopsCritical: 2000
                }
            },
            // Process-specific thresholds
            process: {
                memory: {
                    heapWarning: 16 * 1024 * 1024 * 1024,  // 16GB heap warning
                    heapCritical: 18 * 1024 * 1024 * 1024, // 18GB heap critical
                    rssWarning: 20 * 1024 * 1024 * 1024,   // 20GB RSS warning
                    rssCritical: 22 * 1024 * 1024 * 1024  // 22GB RSS critical
                },
                handles: {
                    warning: 1000,
                    critical: 2000
                }
            },
            // Network thresholds
            network: {
                latency: {
                    warning: 100,   // 100ms
                    critical: 500   // 500ms
                },
                bandwidth: {
                    warning: 800 * 1024 * 1024,    // 800 MB/s
                    critical: 900 * 1024 * 1024    // 900 MB/s
                },
                connections: {
                    warning: 500,
                    critical: 1000
                }
            },
            // Database thresholds
            database: {
                latency: {
                    warning: 100,   // 100ms query latency
                    critical: 500   // 500ms query latency
                },
                connections: {
                    warning: 80,    // 80% of max connections
                    critical: 95    // 95% of max connections
                },
                cacheHitRate: {
                    warning: 80,    // Below 80% cache hit rate
                    critical: 60    // Below 60% cache hit rate
                }
            },
            // Swarm-specific thresholds
            swarm: {
                efficiency: {
                    warning: 70,    // Below 70% efficiency
                    critical: 50    // Below 50% efficiency
                },
                successRate: {
                    warning: 90,    // Below 90% success rate
                    critical: 75    // Below 75% success rate
                },
                agentFailures: {
                    warning: 2,     // 2 agent failures
                    critical: 5     // 5 agent failures
                }
            }
        };
    }

    getDefaultAlertRules() {
        return [
            // Memory alerts
            {
                id: 'memory_usage_high',
                name: 'High Memory Usage',
                condition: (metrics) => metrics.system?.memory?.percent > this.thresholds.system.memory.warning,
                severity: (metrics) => metrics.system?.memory?.percent > this.thresholds.system.memory.critical ? 'critical' : 'warning',
                message: (metrics) => `Memory usage at ${metrics.system?.memory?.percent?.toFixed(1)}% (${metrics.system?.memory?.used?.toFixed(1)}GB of 62GB)`,
                cooldown: 300000, // 5 minutes
                category: 'system'
            },
            {
                id: 'memory_leak_detection',
                name: 'Memory Leak Detected',
                condition: (metrics) => this.detectMemoryLeak(metrics),
                severity: () => 'warning',
                message: () => 'Potential memory leak detected - memory usage increasing consistently',
                cooldown: 900000, // 15 minutes
                category: 'system'
            },

            // CPU alerts
            {
                id: 'cpu_usage_high',
                name: 'High CPU Usage',
                condition: (metrics) => metrics.system?.cpu?.usage > this.thresholds.system.cpu.warning,
                severity: (metrics) => metrics.system?.cpu?.usage > this.thresholds.system.cpu.critical ? 'critical' : 'warning',
                message: (metrics) => `CPU usage at ${metrics.system?.cpu?.usage?.toFixed(1)}% across ${metrics.system?.cpu?.cores} cores`,
                cooldown: 180000, // 3 minutes
                category: 'system'
            },
            {
                id: 'load_average_high',
                name: 'High Load Average',
                condition: (metrics) => metrics.system?.cpu?.loadAverage?.['1m'] > this.thresholds.system.cpu.loadAverage.warning,
                severity: (metrics) => metrics.system?.cpu?.loadAverage?.['1m'] > this.thresholds.system.cpu.loadAverage.critical ? 'critical' : 'warning',
                message: (metrics) => `Load average: ${metrics.system?.cpu?.loadAverage?.['1m']?.toFixed(2)} (24-core system)`,
                cooldown: 300000, // 5 minutes
                category: 'system'
            },

            // Process alerts
            {
                id: 'heap_usage_high',
                name: 'High Heap Memory Usage',
                condition: (metrics) => metrics.process?.memory?.heapUsed > this.thresholds.process.memory.heapWarning,
                severity: (metrics) => metrics.process?.memory?.heapUsed > this.thresholds.process.memory.heapCritical ? 'critical' : 'warning',
                message: (metrics) => `Heap usage: ${(metrics.process?.memory?.heapUsed / 1024 / 1024).toFixed(0)}MB`,
                cooldown: 300000, // 5 minutes
                category: 'process'
            },

            // Network alerts
            {
                id: 'network_latency_high',
                name: 'High Network Latency',
                condition: (metrics) => metrics.network?.latency > this.thresholds.network.latency.warning,
                severity: (metrics) => metrics.network?.latency > this.thresholds.network.latency.critical ? 'critical' : 'warning',
                message: (metrics) => `Network latency: ${metrics.network?.latency}ms`,
                cooldown: 120000, // 2 minutes
                category: 'network'
            },

            // Database alerts
            {
                id: 'database_latency_high',
                name: 'High Database Latency',
                condition: (metrics) => metrics.database?.latency > this.thresholds.database.latency.warning,
                severity: (metrics) => metrics.database?.latency > this.thresholds.database.latency.critical ? 'critical' : 'warning',
                message: (metrics) => `Database query latency: ${metrics.database?.latency}ms`,
                cooldown: 180000, // 3 minutes
                category: 'database'
            },
            {
                id: 'database_cache_hit_low',
                name: 'Low Database Cache Hit Rate',
                condition: (metrics) => metrics.database?.cacheHitRate < this.thresholds.database.cacheHitRate.warning,
                severity: (metrics) => metrics.database?.cacheHitRate < this.thresholds.database.cacheHitRate.critical ? 'critical' : 'warning',
                message: (metrics) => `Database cache hit rate: ${metrics.database?.cacheHitRate}%`,
                cooldown: 600000, // 10 minutes
                category: 'database'
            },

            // Swarm alerts
            {
                id: 'swarm_efficiency_low',
                name: 'Low Swarm Efficiency',
                condition: (metrics) => this.getAverageSwarmEfficiency(metrics) < this.thresholds.swarm.efficiency.warning,
                severity: (metrics) => this.getAverageSwarmEfficiency(metrics) < this.thresholds.swarm.efficiency.critical ? 'critical' : 'warning',
                message: (metrics) => `Average swarm efficiency: ${this.getAverageSwarmEfficiency(metrics).toFixed(1)}%`,
                cooldown: 300000, // 5 minutes
                category: 'swarm'
            },

            // Performance degradation alerts
            {
                id: 'performance_degradation',
                name: 'Performance Degradation Detected',
                condition: (metrics) => this.detectPerformanceDegradation(metrics),
                severity: () => 'warning',
                message: () => 'System performance has degraded compared to baseline',
                cooldown: 600000, // 10 minutes
                category: 'performance'
            }
        ];
    }

    checkMetrics(metrics) {
        const triggeredAlerts = [];
        const currentTime = Date.now();

        for (const rule of this.alertRules) {
            try {
                // Check if alert is in cooldown
                if (this.isInCooldown(rule.id, currentTime)) {
                    continue;
                }

                // Check if alert condition is met
                if (rule.condition(metrics)) {
                    const alert = this.createAlert(rule, metrics, currentTime);

                    // Check if this is a new alert or escalation
                    const existingAlert = this.activeAlerts.get(rule.id);
                    if (!existingAlert || existingAlert.severity !== alert.severity) {
                        this.activeAlerts.set(rule.id, alert);
                        triggeredAlerts.push(alert);
                        this.alertHistory.push(alert);

                        // Emit alert event
                        this.emit('alert', alert);

                        // Update cooldown
                        this.suppressions.set(rule.id, currentTime + rule.cooldown);
                    }
                } else {
                    // Clear resolved alerts
                    if (this.activeAlerts.has(rule.id)) {
                        const resolvedAlert = this.activeAlerts.get(rule.id);
                        resolvedAlert.resolved = true;
                        resolvedAlert.resolvedAt = new Date().toISOString();
                        this.activeAlerts.delete(rule.id);
                        this.emit('alert_resolved', resolvedAlert);
                    }
                }
            } catch (error) {
                console.error(`Error checking alert rule ${rule.id}:`, error);
            }
        }

        // Cleanup old alerts from history
        this.cleanupAlertHistory();

        return triggeredAlerts;
    }

    createAlert(rule, metrics, timestamp) {
        return {
            id: `${rule.id}_${timestamp}`,
            ruleId: rule.id,
            name: rule.name,
            severity: rule.severity(metrics),
            message: rule.message(metrics),
            category: rule.category,
            timestamp: new Date(timestamp).toISOString(),
            metrics: this.extractRelevantMetrics(metrics, rule.category),
            resolved: false,
            acknowledged: false
        };
    }

    extractRelevantMetrics(metrics, category) {
        switch (category) {
            case 'system':
                return {
                    memory: metrics.system?.memory,
                    cpu: metrics.system?.cpu
                };
            case 'process':
                return metrics.process;
            case 'network':
                return metrics.network;
            case 'database':
                return metrics.database;
            case 'swarm':
                return metrics.swarms;
            default:
                return {};
        }
    }

    isInCooldown(ruleId, currentTime) {
        const suppressionTime = this.suppressions.get(ruleId);
        return suppressionTime && currentTime < suppressionTime;
    }

    detectMemoryLeak(metrics) {
        // Simple memory leak detection based on trend
        const memoryHistory = this.getMetricHistory('system.memory.percent', 10);
        if (memoryHistory.length < 5) return false;

        // Check if memory usage is consistently increasing
        let increasingCount = 0;
        for (let i = 1; i < memoryHistory.length; i++) {
            if (memoryHistory[i] > memoryHistory[i - 1]) {
                increasingCount++;
            }
        }

        return increasingCount >= 4; // 4 out of 5 consecutive increases
    }

    detectPerformanceDegradation(metrics) {
        // Performance degradation detection logic
        const cpuHistory = this.getMetricHistory('system.cpu.usage', 10);
        const memoryHistory = this.getMetricHistory('system.memory.percent', 10);

        if (cpuHistory.length < 5 || memoryHistory.length < 5) return false;

        const avgCpu = cpuHistory.reduce((sum, val) => sum + val, 0) / cpuHistory.length;
        const avgMemory = memoryHistory.reduce((sum, val) => sum + val, 0) / memoryHistory.length;

        // Check if both CPU and memory are above baseline thresholds
        return avgCpu > 70 && avgMemory > 70;
    }

    getAverageSwarmEfficiency(metrics) {
        if (!metrics.swarms || metrics.swarms.size === 0) return 100;

        let totalEfficiency = 0;
        let count = 0;

        for (const [id, swarm] of Object.entries(metrics.swarms || {})) {
            if (swarm.performance && typeof swarm.performance.efficiency === 'number') {
                totalEfficiency += swarm.performance.efficiency;
                count++;
            }
        }

        return count > 0 ? totalEfficiency / count : 100;
    }

    getMetricHistory(path, count = 10) {
        // This would be implemented to return historical metric values
        // For now, returning empty array as placeholder
        return [];
    }

    acknowledgeAlert(alertId) {
        for (const [ruleId, alert] of this.activeAlerts) {
            if (alert.id === alertId) {
                alert.acknowledged = true;
                alert.acknowledgedAt = new Date().toISOString();
                this.emit('alert_acknowledged', alert);
                return true;
            }
        }
        return false;
    }

    getActiveAlerts() {
        return Array.from(this.activeAlerts.values()).sort((a, b) => {
            const severityOrder = { critical: 3, warning: 2, info: 1 };
            return severityOrder[b.severity] - severityOrder[a.severity];
        });
    }

    getAlertHistory(limit = 100) {
        return this.alertHistory
            .slice(-limit)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    cleanupAlertHistory() {
        // Keep only last 1000 alerts in history
        if (this.alertHistory.length > 1000) {
            this.alertHistory = this.alertHistory.slice(-1000);
        }
    }

    updateThresholds(category, thresholds) {
        if (this.thresholds[category]) {
            this.thresholds[category] = { ...this.thresholds[category], ...thresholds };
        } else {
            this.thresholds[category] = thresholds;
        }
    }

    addCustomAlert(rule) {
        // Validate rule
        if (!rule.id || !rule.name || !rule.condition || !rule.severity || !rule.message) {
            throw new Error('Invalid alert rule - missing required fields');
        }

        // Set defaults
        rule.cooldown = rule.cooldown || 300000; // 5 minutes default
        rule.category = rule.category || 'custom';

        this.alertRules.push(rule);
    }

    removeAlert(ruleId) {
        this.alertRules = this.alertRules.filter(rule => rule.id !== ruleId);
        this.activeAlerts.delete(ruleId);
        this.suppressions.delete(ruleId);
    }

    addNotificationChannel(channel) {
        this.notificationChannels.push(channel);
    }

    async sendNotifications(alert) {
        const promises = this.notificationChannels.map(async (channel) => {
            try {
                await channel.send(alert);
            } catch (error) {
                console.error(`Failed to send notification via ${channel.name}:`, error);
            }
        });

        await Promise.allSettled(promises);
    }

    getAlertStats() {
        const now = Date.now();
        const last24h = now - (24 * 60 * 60 * 1000);

        const recent = this.alertHistory.filter(alert =>
            new Date(alert.timestamp).getTime() > last24h
        );

        const stats = {
            total: this.alertHistory.length,
            active: this.activeAlerts.size,
            last24h: recent.length,
            bySeverity: {
                critical: recent.filter(a => a.severity === 'critical').length,
                warning: recent.filter(a => a.severity === 'warning').length,
                info: recent.filter(a => a.severity === 'info').length
            },
            byCategory: {}
        };

        // Count by category
        for (const alert of recent) {
            stats.byCategory[alert.category] = (stats.byCategory[alert.category] || 0) + 1;
        }

        return stats;
    }

    // Health check for alert manager
    getHealthStatus() {
        return {
            status: 'healthy',
            activeAlerts: this.activeAlerts.size,
            alertRules: this.alertRules.length,
            suppressions: this.suppressions.size,
            notificationChannels: this.notificationChannels.length,
            lastCheck: new Date().toISOString()
        };
    }
}