/**
 * System Health Checker for Rollback Operations
 * Validates system health before, during, and after rollback procedures
 */

const EventEmitter = require('events');

class HealthChecker extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            // Health check timeouts
            criticalCheckTimeout: config.criticalCheckTimeout || 30000, // 30 seconds
            standardCheckTimeout: config.standardCheckTimeout || 60000, // 60 seconds

            // Health thresholds
            cpuThreshold: config.cpuThreshold || 80, // 80%
            memoryThreshold: config.memoryThreshold || 85, // 85%
            diskThreshold: config.diskThreshold || 90, // 90%
            responseTimeThreshold: config.responseTimeThreshold || 2000, // 2 seconds
            errorRateThreshold: config.errorRateThreshold || 0.01, // 1%

            // Database connection settings
            dbConnectionTimeout: config.dbConnectionTimeout || 10000, // 10 seconds
            dbQueryTimeout: config.dbQueryTimeout || 5000, // 5 seconds

            // External service timeouts
            externalServiceTimeout: config.externalServiceTimeout || 15000, // 15 seconds

            ...config
        };

        this.healthComponents = this.defineHealthComponents();
        this.healthHistory = [];
        this.isOperational = true;
        this.lastHealthCheck = null;
    }

    /**
     * Verify complete system health
     */
    async verifySystemHealth(options = {}) {
        const checkOptions = {
            timeout: options.timeout || this.config.standardCheckTimeout,
            criticalOnly: options.criticalOnly || false,
            includeDetails: options.includeDetails !== false,
            ...options
        };

        console.log(`[HealthChecker] Starting system health verification (critical only: ${checkOptions.criticalOnly})`);

        const healthReport = {
            healthy: true,
            timestamp: new Date(),
            checks: [],
            issues: [],
            warnings: [],
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                warnings: 0
            },
            duration: 0
        };

        const startTime = Date.now();

        try {
            // Determine which components to check
            const componentsToCheck = checkOptions.criticalOnly ?
                Object.entries(this.healthComponents).filter(([_, component]) => component.critical) :
                Object.entries(this.healthComponents);

            console.log(`[HealthChecker] Checking ${componentsToCheck.length} components`);

            // Run health checks with timeout
            const checkPromises = componentsToCheck.map(([name, component]) =>
                this.runComponentHealthCheck(name, component, checkOptions)
            );

            const results = await Promise.allSettled(
                checkPromises.map(promise =>
                    this.withTimeout(promise, checkOptions.timeout)
                )
            );

            // Process results
            results.forEach((result, index) => {
                const componentName = componentsToCheck[index][0];
                healthReport.summary.total++;

                if (result.status === 'fulfilled') {
                    const checkResult = result.value;
                    healthReport.checks.push(checkResult);

                    if (checkResult.healthy) {
                        healthReport.summary.passed++;
                    } else {
                        healthReport.summary.failed++;
                        healthReport.issues.push(`${componentName}: ${checkResult.message}`);

                        // Critical component failure means overall system is unhealthy
                        if (checkResult.critical) {
                            healthReport.healthy = false;
                        }
                    }

                    if (checkResult.warnings && checkResult.warnings.length > 0) {
                        healthReport.summary.warnings++;
                        healthReport.warnings.push(...checkResult.warnings.map(w => `${componentName}: ${w}`));
                    }
                } else {
                    // Health check failed or timed out
                    healthReport.summary.failed++;
                    healthReport.issues.push(`${componentName}: Health check failed - ${result.reason.message}`);

                    // If critical component check failed, system is unhealthy
                    if (componentsToCheck[index][1].critical) {
                        healthReport.healthy = false;
                    }
                }
            });

            healthReport.duration = Date.now() - startTime;
            this.lastHealthCheck = healthReport;

            // Store in history
            this.healthHistory.push(healthReport);
            if (this.healthHistory.length > 100) {
                this.healthHistory.shift(); // Keep last 100 checks
            }

            console.log(`[HealthChecker] Health check completed in ${healthReport.duration}ms - Healthy: ${healthReport.healthy}`);

            if (!healthReport.healthy) {
                console.warn(`[HealthChecker] System unhealthy - Issues: ${healthReport.issues.join(', ')}`);
            }

            // Emit health check event
            this.emit('health_check_completed', healthReport);

            return healthReport;

        } catch (error) {
            healthReport.duration = Date.now() - startTime;
            healthReport.healthy = false;
            healthReport.issues.push(`Health check system error: ${error.message}`);

            console.error(`[HealthChecker] Health verification failed: ${error.message}`);

            this.emit('health_check_failed', { error, duration: healthReport.duration });

            return healthReport;
        }
    }

    /**
     * Run health check for a specific component
     */
    async runComponentHealthCheck(componentName, component, options) {
        const startTime = Date.now();
        const checkResult = {
            component: componentName,
            healthy: false,
            critical: component.critical,
            message: '',
            details: {},
            warnings: [],
            duration: 0,
            timestamp: new Date()
        };

        try {
            console.log(`[HealthChecker] Checking ${componentName}...`);

            // Run the component-specific health check
            const result = await component.check();

            checkResult.healthy = result.healthy;
            checkResult.message = result.message || (result.healthy ? 'OK' : 'FAIL');
            checkResult.details = result.details || {};
            checkResult.warnings = result.warnings || [];
            checkResult.duration = Date.now() - startTime;

            console.log(`[HealthChecker] ${componentName}: ${checkResult.message} (${checkResult.duration}ms)`);

            return checkResult;

        } catch (error) {
            checkResult.duration = Date.now() - startTime;
            checkResult.message = `Check failed: ${error.message}`;

            console.error(`[HealthChecker] ${componentName} health check failed: ${error.message}`);

            return checkResult;
        }
    }

    /**
     * Define health check components
     */
    defineHealthComponents() {
        return {
            // Critical system components
            database: {
                critical: true,
                check: async () => await this.checkDatabase()
            },

            memory: {
                critical: true,
                check: async () => await this.checkMemoryUsage()
            },

            cpu: {
                critical: true,
                check: async () => await this.checkCpuUsage()
            },

            disk_space: {
                critical: true,
                check: async () => await this.checkDiskSpace()
            },

            // Application components
            feature_flags: {
                critical: true,
                check: async () => await this.checkFeatureFlags()
            },

            completion_system: {
                critical: true,
                check: async () => await this.checkCompletionSystem()
            },

            hook_system: {
                critical: false,
                check: async () => await this.checkHookSystem()
            },

            // Network and external dependencies
            network_connectivity: {
                critical: true,
                check: async () => await this.checkNetworkConnectivity()
            },

            external_apis: {
                critical: false,
                check: async () => await this.checkExternalAPIs()
            },

            // Security components
            authentication: {
                critical: true,
                check: async () => await this.checkAuthentication()
            },

            // Monitoring and logging
            logging_system: {
                critical: false,
                check: async () => await this.checkLoggingSystem()
            },

            metrics_collection: {
                critical: false,
                check: async () => await this.checkMetricsCollection()
            }
        };
    }

    /**
     * Database health check
     */
    async checkDatabase() {
        try {
            // Simulate database connection check
            await this.simulateAsync(100, 500);

            // Check connection pool
            const connectionPoolSize = Math.floor(Math.random() * 50) + 10;
            const activeConnections = Math.floor(Math.random() * connectionPoolSize);

            // Check query performance
            const queryStartTime = Date.now();
            await this.simulateAsync(50, 200);
            const queryDuration = Date.now() - queryStartTime;

            const warnings = [];
            if (activeConnections / connectionPoolSize > 0.8) {
                warnings.push('Connection pool usage is high (>80%)');
            }

            if (queryDuration > 1000) {
                warnings.push('Database query response time is slow (>1s)');
            }

            return {
                healthy: true,
                message: 'Database is responding normally',
                details: {
                    connectionPoolSize,
                    activeConnections,
                    poolUtilization: (activeConnections / connectionPoolSize * 100).toFixed(1) + '%',
                    queryResponseTime: queryDuration + 'ms'
                },
                warnings
            };

        } catch (error) {
            return {
                healthy: false,
                message: `Database check failed: ${error.message}`
            };
        }
    }

    /**
     * Memory usage health check
     */
    async checkMemoryUsage() {
        try {
            // Get memory usage (simulated)
            const memoryUsage = {
                used: Math.random() * 8 * 1024 * 1024 * 1024, // Random up to 8GB
                total: 8 * 1024 * 1024 * 1024 // 8GB total
            };

            const usagePercentage = (memoryUsage.used / memoryUsage.total) * 100;
            const warnings = [];

            if (usagePercentage > 70) {
                warnings.push('Memory usage is getting high (>70%)');
            }

            return {
                healthy: usagePercentage < this.config.memoryThreshold,
                message: usagePercentage < this.config.memoryThreshold ?
                    `Memory usage is normal (${usagePercentage.toFixed(1)}%)` :
                    `Memory usage is critical (${usagePercentage.toFixed(1)}%)`,
                details: {
                    usedGB: (memoryUsage.used / 1024 / 1024 / 1024).toFixed(2),
                    totalGB: (memoryUsage.total / 1024 / 1024 / 1024).toFixed(2),
                    usagePercentage: usagePercentage.toFixed(1) + '%'
                },
                warnings
            };

        } catch (error) {
            return {
                healthy: false,
                message: `Memory check failed: ${error.message}`
            };
        }
    }

    /**
     * CPU usage health check
     */
    async checkCpuUsage() {
        try {
            // Simulate CPU usage check
            const cpuUsage = Math.random() * 100; // 0-100%
            const warnings = [];

            if (cpuUsage > 60) {
                warnings.push('CPU usage is elevated (>60%)');
            }

            return {
                healthy: cpuUsage < this.config.cpuThreshold,
                message: cpuUsage < this.config.cpuThreshold ?
                    `CPU usage is normal (${cpuUsage.toFixed(1)}%)` :
                    `CPU usage is critical (${cpuUsage.toFixed(1)}%)`,
                details: {
                    currentUsage: cpuUsage.toFixed(1) + '%',
                    threshold: this.config.cpuThreshold + '%'
                },
                warnings
            };

        } catch (error) {
            return {
                healthy: false,
                message: `CPU check failed: ${error.message}`
            };
        }
    }

    /**
     * Disk space health check
     */
    async checkDiskSpace() {
        try {
            // Simulate disk usage check
            const diskUsage = Math.random() * 100; // 0-100%
            const warnings = [];

            if (diskUsage > 75) {
                warnings.push('Disk usage is getting high (>75%)');
            }

            return {
                healthy: diskUsage < this.config.diskThreshold,
                message: diskUsage < this.config.diskThreshold ?
                    `Disk usage is normal (${diskUsage.toFixed(1)}%)` :
                    `Disk usage is critical (${diskUsage.toFixed(1)}%)`,
                details: {
                    usagePercentage: diskUsage.toFixed(1) + '%',
                    threshold: this.config.diskThreshold + '%'
                },
                warnings
            };

        } catch (error) {
            return {
                healthy: false,
                message: `Disk space check failed: ${error.message}`
            };
        }
    }

    /**
     * Feature flags system health check
     */
    async checkFeatureFlags() {
        try {
            await this.simulateAsync(50, 150);

            // Simulate feature flag system check
            const flagSystemHealth = Math.random() > 0.1; // 90% chance of being healthy

            return {
                healthy: flagSystemHealth,
                message: flagSystemHealth ?
                    'Feature flag system is operational' :
                    'Feature flag system is experiencing issues',
                details: {
                    responseTime: Math.floor(Math.random() * 100) + 50 + 'ms',
                    cacheHitRate: (Math.random() * 20 + 80).toFixed(1) + '%'
                }
            };

        } catch (error) {
            return {
                healthy: false,
                message: `Feature flags check failed: ${error.message}`
            };
        }
    }

    /**
     * Completion system health check
     */
    async checkCompletionSystem() {
        try {
            await this.simulateAsync(100, 300);

            // Simulate completion system metrics
            const responseTime = Math.random() * 3000 + 200; // 200ms to 3.2s
            const errorRate = Math.random() * 0.02; // 0% to 2%
            const queueSize = Math.floor(Math.random() * 100);

            const warnings = [];
            if (responseTime > 2000) {
                warnings.push('Response time is elevated');
            }

            if (queueSize > 50) {
                warnings.push('Completion queue is getting large');
            }

            const healthy = responseTime < this.config.responseTimeThreshold &&
                           errorRate < this.config.errorRateThreshold;

            return {
                healthy,
                message: healthy ?
                    'Completion system is performing well' :
                    'Completion system is experiencing performance issues',
                details: {
                    responseTime: Math.floor(responseTime) + 'ms',
                    errorRate: (errorRate * 100).toFixed(2) + '%',
                    queueSize,
                    throughput: Math.floor(Math.random() * 100) + 50 + ' req/min'
                },
                warnings
            };

        } catch (error) {
            return {
                healthy: false,
                message: `Completion system check failed: ${error.message}`
            };
        }
    }

    /**
     * Hook system health check
     */
    async checkHookSystem() {
        try {
            await this.simulateAsync(75, 200);

            const hookSystemHealth = Math.random() > 0.05; // 95% chance of being healthy
            const hooksProcessed = Math.floor(Math.random() * 1000) + 100;
            const hookLatency = Math.random() * 500 + 50;

            return {
                healthy: hookSystemHealth && hookLatency < 1000,
                message: hookSystemHealth ?
                    'Hook system is functioning normally' :
                    'Hook system is experiencing issues',
                details: {
                    hooksProcessedLastHour: hooksProcessed,
                    averageLatency: Math.floor(hookLatency) + 'ms',
                    activeHooks: Math.floor(Math.random() * 20) + 5
                }
            };

        } catch (error) {
            return {
                healthy: false,
                message: `Hook system check failed: ${error.message}`
            };
        }
    }

    /**
     * Network connectivity health check
     */
    async checkNetworkConnectivity() {
        try {
            // Simulate network connectivity check
            await this.simulateAsync(200, 800);

            const networkHealth = Math.random() > 0.02; // 98% chance of being healthy
            const latency = Math.random() * 100 + 10; // 10-110ms

            return {
                healthy: networkHealth && latency < 200,
                message: networkHealth ?
                    'Network connectivity is good' :
                    'Network connectivity issues detected',
                details: {
                    latency: Math.floor(latency) + 'ms',
                    packetLoss: (Math.random() * 2).toFixed(2) + '%'
                }
            };

        } catch (error) {
            return {
                healthy: false,
                message: `Network connectivity check failed: ${error.message}`
            };
        }
    }

    /**
     * External APIs health check
     */
    async checkExternalAPIs() {
        try {
            await this.simulateAsync(300, 1000);

            const apiHealth = Math.random() > 0.1; // 90% chance of being healthy
            const responseTime = Math.random() * 2000 + 200;

            return {
                healthy: apiHealth && responseTime < 5000,
                message: apiHealth ?
                    'External APIs are responding' :
                    'Some external APIs are not responding',
                details: {
                    averageResponseTime: Math.floor(responseTime) + 'ms',
                    apisChecked: 3,
                    apisHealthy: apiHealth ? 3 : Math.floor(Math.random() * 3)
                }
            };

        } catch (error) {
            return {
                healthy: false,
                message: `External APIs check failed: ${error.message}`
            };
        }
    }

    /**
     * Authentication system health check
     */
    async checkAuthentication() {
        try {
            await this.simulateAsync(100, 400);

            const authHealth = Math.random() > 0.05; // 95% chance of being healthy
            const tokenValidationTime = Math.random() * 200 + 50;

            return {
                healthy: authHealth,
                message: authHealth ?
                    'Authentication system is operational' :
                    'Authentication system is experiencing issues',
                details: {
                    tokenValidationTime: Math.floor(tokenValidationTime) + 'ms',
                    activeTokens: Math.floor(Math.random() * 10000) + 1000
                }
            };

        } catch (error) {
            return {
                healthy: false,
                message: `Authentication check failed: ${error.message}`
            };
        }
    }

    /**
     * Logging system health check
     */
    async checkLoggingSystem() {
        try {
            await this.simulateAsync(50, 200);

            const loggingHealth = Math.random() > 0.05; // 95% chance of being healthy
            const logBuffer = Math.floor(Math.random() * 1000) + 100;

            const warnings = [];
            if (logBuffer > 800) {
                warnings.push('Log buffer is getting full');
            }

            return {
                healthy: loggingHealth,
                message: loggingHealth ?
                    'Logging system is functioning' :
                    'Logging system issues detected',
                details: {
                    bufferSize: logBuffer,
                    logsPerSecond: Math.floor(Math.random() * 50) + 10
                },
                warnings
            };

        } catch (error) {
            return {
                healthy: false,
                message: `Logging system check failed: ${error.message}`
            };
        }
    }

    /**
     * Metrics collection health check
     */
    async checkMetricsCollection() {
        try {
            await this.simulateAsync(75, 250);

            const metricsHealth = Math.random() > 0.1; // 90% chance of being healthy
            const collectionRate = Math.random() * 100 + 50;

            return {
                healthy: metricsHealth,
                message: metricsHealth ?
                    'Metrics collection is active' :
                    'Metrics collection issues detected',
                details: {
                    collectionRate: Math.floor(collectionRate) + ' metrics/min',
                    storageUsage: (Math.random() * 50 + 25).toFixed(1) + '%'
                }
            };

        } catch (error) {
            return {
                healthy: false,
                message: `Metrics collection check failed: ${error.message}`
            };
        }
    }

    /**
     * Quick health check for critical components only
     */
    async quickHealthCheck() {
        return await this.verifySystemHealth({
            criticalOnly: true,
            timeout: this.config.criticalCheckTimeout,
            includeDetails: false
        });
    }

    /**
     * Get health trend analysis
     */
    getHealthTrend(hoursBack = 1) {
        const cutoff = Date.now() - (hoursBack * 60 * 60 * 1000);
        const recentChecks = this.healthHistory.filter(
            check => check.timestamp.getTime() > cutoff
        );

        if (recentChecks.length === 0) {
            return { trend: 'unknown', checks: 0 };
        }

        const healthyCount = recentChecks.filter(check => check.healthy).length;
        const healthRatio = healthyCount / recentChecks.length;

        let trend;
        if (healthRatio >= 0.9) trend = 'excellent';
        else if (healthRatio >= 0.7) trend = 'good';
        else if (healthRatio >= 0.5) trend = 'concerning';
        else trend = 'poor';

        return {
            trend,
            checks: recentChecks.length,
            healthyRatio: healthRatio,
            commonIssues: this.getCommonIssues(recentChecks)
        };
    }

    /**
     * Get common issues from recent checks
     */
    getCommonIssues(checks) {
        const issueCount = {};

        checks.forEach(check => {
            check.issues.forEach(issue => {
                issueCount[issue] = (issueCount[issue] || 0) + 1;
            });
        });

        return Object.entries(issueCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([issue, count]) => ({ issue, count }));
    }

    /**
     * Add timeout to promise
     */
    withTimeout(promise, timeoutMs) {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Health check timeout')), timeoutMs)
            )
        ]);
    }

    /**
     * Simulate async operation
     */
    async simulateAsync(minMs, maxMs) {
        const delay = Math.random() * (maxMs - minMs) + minMs;
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Check if health checker is operational
     */
    isOperational() {
        return this.isOperational;
    }

    /**
     * Get health checker status
     */
    getStatus() {
        return {
            operational: this.isOperational,
            lastCheck: this.lastHealthCheck,
            totalChecks: this.healthHistory.length,
            trend: this.getHealthTrend(),
            components: Object.keys(this.healthComponents).length
        };
    }

    /**
     * Cleanup old health history
     */
    cleanupHistory(maxAge = 86400000) { // 24 hours
        const cutoff = Date.now() - maxAge;
        this.healthHistory = this.healthHistory.filter(
            check => check.timestamp.getTime() > cutoff
        );
    }
}

module.exports = { HealthChecker };