// Claude Flow Hooks Integration for Premium Performance Monitor
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export class ClaudeFlowIntegration {
    constructor() {
        this.sessionId = `premium-monitor-${Date.now()}`;
        this.monitoringStartTime = Date.now();
        this.metricsStorageKey = 'swarm/benchmarker/monitoring-setup';
        this.hooksEnabled = true;
        this.memoryStore = new Map();
    }

    async initializeHooks() {
        try {
            console.log('🔗 Initializing Claude Flow hooks integration...');

            // Execute pre-task hook
            await this.executePreTaskHook();

            // Set up session restore
            await this.setupSessionRestore();

            // Initialize memory storage
            await this.initializeMemoryStorage();

            console.log('✅ Claude Flow hooks initialized successfully');
            return true;

        } catch (error) {
            console.warn('⚠️ Claude Flow hooks initialization failed:', error.message);
            this.hooksEnabled = false;
            return false;
        }
    }

    async executePreTaskHook() {
        if (!this.hooksEnabled) return;

        try {
            const command = `npx claude-flow@alpha hooks pre-task --description "Premium performance monitoring setup for 96GB configuration"`;
            const { stdout, stderr } = await execAsync(command);

            if (stdout) {
                console.log('📋 Pre-task hook output:', stdout);
            }

            if (stderr && !stderr.includes('WARNING')) {
                console.warn('⚠️ Pre-task hook stderr:', stderr);
            }

        } catch (error) {
            console.warn('⚠️ Pre-task hook failed:', error.message);
        }
    }

    async setupSessionRestore() {
        if (!this.hooksEnabled) return;

        try {
            const command = `npx claude-flow@alpha hooks session-restore --session-id "${this.sessionId}"`;
            await execAsync(command);
            console.log(`📂 Session restore setup for: ${this.sessionId}`);

        } catch (error) {
            console.warn('⚠️ Session restore setup failed:', error.message);
        }
    }

    async initializeMemoryStorage() {
        if (!this.hooksEnabled) return;

        try {
            const initialData = {
                monitoringStartTime: this.monitoringStartTime,
                sessionId: this.sessionId,
                systemSpecs: {
                    totalRAM: 62,
                    cores: 24,
                    memoryType: 'DDR5-6400',
                    targetSetup: '96GB premium'
                },
                dashboardConfig: {
                    updateInterval: 1000,
                    realTimeEnabled: true,
                    multiSwarmTracking: true
                },
                components: {
                    dashboard: 'premium-dashboard.html',
                    server: 'server.js',
                    metricsCollector: 'metrics-collector.js',
                    benchmarkRunner: 'runner.js',
                    alertManager: 'alert-manager.js'
                }
            };

            await this.storeInMemory(this.metricsStorageKey, initialData);
            console.log('💾 Memory storage initialized');

        } catch (error) {
            console.warn('⚠️ Memory storage initialization failed:', error.message);
        }
    }

    async storeInMemory(key, data, ttl = 86400000) { // 24 hours default TTL
        if (!this.hooksEnabled) {
            // Fallback to local storage
            this.memoryStore.set(key, { data, timestamp: Date.now(), ttl });
            return;
        }

        try {
            const command = `npx claude-flow@alpha hooks post-edit --memory-key "${key}" --data '${JSON.stringify(data)}' --ttl ${ttl}`;
            await execAsync(command);
            console.log(`💾 Stored data in memory: ${key}`);

        } catch (error) {
            console.warn(`⚠️ Memory storage failed for ${key}:`, error.message);
            // Fallback to local storage
            this.memoryStore.set(key, { data, timestamp: Date.now(), ttl });
        }
    }

    async retrieveFromMemory(key) {
        if (!this.hooksEnabled) {
            // Fallback to local storage
            const stored = this.memoryStore.get(key);
            if (stored && Date.now() - stored.timestamp < stored.ttl) {
                return stored.data;
            }
            return null;
        }

        try {
            const command = `npx claude-flow@alpha hooks memory-get --key "${key}"`;
            const { stdout } = await execAsync(command);
            return JSON.parse(stdout.trim());

        } catch (error) {
            console.warn(`⚠️ Memory retrieval failed for ${key}:`, error.message);
            return null;
        }
    }

    async notifyMetricsUpdate(metrics) {
        if (!this.hooksEnabled) return;

        try {
            // Store latest metrics
            await this.storeInMemory(`${this.metricsStorageKey}/latest-metrics`, {
                timestamp: Date.now(),
                ...metrics
            }, 300000); // 5 minutes TTL for latest metrics

            // Notify about significant events
            if (this.isSignificantUpdate(metrics)) {
                const message = this.createNotificationMessage(metrics);
                const command = `npx claude-flow@alpha hooks notify --message "${message}"`;
                await execAsync(command);
            }

        } catch (error) {
            console.warn('⚠️ Metrics notification failed:', error.message);
        }
    }

    async notifyAlertTriggered(alert) {
        if (!this.hooksEnabled) return;

        try {
            const alertData = {
                id: alert.id,
                severity: alert.severity,
                message: alert.message,
                category: alert.category,
                timestamp: alert.timestamp,
                sessionId: this.sessionId
            };

            await this.storeInMemory(`${this.metricsStorageKey}/alerts/${alert.id}`, alertData);

            // Send notification for critical alerts
            if (alert.severity === 'critical') {
                const command = `npx claude-flow@alpha hooks notify --message "CRITICAL ALERT: ${alert.message}" --priority high`;
                await execAsync(command);
            }

        } catch (error) {
            console.warn('⚠️ Alert notification failed:', error.message);
        }
    }

    async notifyBenchmarkCompleted(benchmarkResult) {
        if (!this.hooksEnabled) return;

        try {
            await this.storeInMemory(`${this.metricsStorageKey}/benchmarks/${benchmarkResult.type}`, {
                ...benchmarkResult,
                sessionId: this.sessionId
            });

            const message = `Benchmark ${benchmarkResult.type} completed: Score ${benchmarkResult.score || benchmarkResult.compositeScore}`;
            const command = `npx claude-flow@alpha hooks notify --message "${message}"`;
            await execAsync(command);

        } catch (error) {
            console.warn('⚠️ Benchmark notification failed:', error.message);
        }
    }

    async logPerformanceEvent(eventType, details) {
        if (!this.hooksEnabled) return;

        try {
            const eventData = {
                type: eventType,
                details,
                timestamp: Date.now(),
                sessionId: this.sessionId
            };

            await this.storeInMemory(`${this.metricsStorageKey}/events/${eventType}_${Date.now()}`, eventData, 3600000); // 1 hour TTL

        } catch (error) {
            console.warn('⚠️ Performance event logging failed:', error.message);
        }
    }

    async exportSessionMetrics() {
        if (!this.hooksEnabled) return null;

        try {
            const command = `npx claude-flow@alpha hooks session-end --session-id "${this.sessionId}" --export-metrics true`;
            const { stdout } = await execAsync(command);

            // Also export our collected data
            const exportData = {
                sessionId: this.sessionId,
                monitoringDuration: Date.now() - this.monitoringStartTime,
                exportedAt: new Date().toISOString(),
                memoryData: Object.fromEntries(this.memoryStore)
            };

            await this.storeInMemory(`${this.metricsStorageKey}/session-export`, exportData);

            return exportData;

        } catch (error) {
            console.warn('⚠️ Session export failed:', error.message);
            return null;
        }
    }

    async updateSwarmCoordination(swarmMetrics) {
        if (!this.hooksEnabled) return;

        try {
            // Update swarm coordination memory
            for (const [swarmId, swarm] of swarmMetrics) {
                await this.storeInMemory(`${this.metricsStorageKey}/swarms/${swarmId}`, {
                    ...swarm,
                    lastUpdated: Date.now(),
                    sessionId: this.sessionId
                }, 600000); // 10 minutes TTL
            }

            // Notify if swarm efficiency is low
            const avgEfficiency = this.calculateAverageSwarmEfficiency(swarmMetrics);
            if (avgEfficiency < 60) {
                const command = `npx claude-flow@alpha hooks notify --message "Low swarm efficiency detected: ${avgEfficiency.toFixed(1)}%"`;
                await execAsync(command);
            }

        } catch (error) {
            console.warn('⚠️ Swarm coordination update failed:', error.message);
        }
    }

    async getMonitoringStatus() {
        try {
            const status = await this.retrieveFromMemory(`${this.metricsStorageKey}/status`);
            return status || {
                active: true,
                startTime: this.monitoringStartTime,
                sessionId: this.sessionId,
                hooksEnabled: this.hooksEnabled
            };

        } catch (error) {
            console.warn('⚠️ Status retrieval failed:', error.message);
            return null;
        }
    }

    async updateMonitoringConfiguration(config) {
        try {
            await this.storeInMemory(`${this.metricsStorageKey}/config`, {
                ...config,
                updatedAt: Date.now(),
                sessionId: this.sessionId
            });

            console.log('⚙️ Monitoring configuration updated');

        } catch (error) {
            console.warn('⚠️ Configuration update failed:', error.message);
        }
    }

    isSignificantUpdate(metrics) {
        // Determine if metrics update is significant enough to notify
        if (!metrics.system) return false;

        const memoryPercent = metrics.system.memory?.percent || 0;
        const cpuUsage = metrics.system.cpu?.usage || 0;

        return memoryPercent > 85 || cpuUsage > 90;
    }

    createNotificationMessage(metrics) {
        const parts = [];

        if (metrics.system?.memory?.percent > 85) {
            parts.push(`Memory: ${metrics.system.memory.percent.toFixed(1)}%`);
        }

        if (metrics.system?.cpu?.usage > 90) {
            parts.push(`CPU: ${metrics.system.cpu.usage.toFixed(1)}%`);
        }

        return `Performance Alert - ${parts.join(', ')}`;
    }

    calculateAverageSwarmEfficiency(swarmMetrics) {
        if (!swarmMetrics || swarmMetrics.size === 0) return 100;

        let totalEfficiency = 0;
        let count = 0;

        for (const [id, swarm] of swarmMetrics) {
            if (swarm.performance?.efficiency) {
                totalEfficiency += swarm.performance.efficiency;
                count++;
            }
        }

        return count > 0 ? totalEfficiency / count : 100;
    }

    async cleanup() {
        try {
            await this.exportSessionMetrics();
            console.log('🧹 Claude Flow integration cleanup completed');

        } catch (error) {
            console.warn('⚠️ Cleanup failed:', error.message);
        }
    }

    // Health check for the integration
    getHealthStatus() {
        return {
            status: this.hooksEnabled ? 'enabled' : 'disabled',
            sessionId: this.sessionId,
            uptime: Date.now() - this.monitoringStartTime,
            memoryStoreSize: this.memoryStore.size,
            lastActivity: Date.now()
        };
    }
}