#!/usr/bin/env node

/**
 * Production Monitoring Configuration
 *
 * Comprehensive monitoring and observability configuration for NPM package
 * deployment. Includes dashboard settings, metrics collection, alerting,
 * and user feedback integration.
 */

import { EventEmitter } from 'events';

export class ProductionMonitoringConfig extends EventEmitter {
    constructor(options = {}) {
        super();

        this.environment = options.environment || process.env.NODE_ENV || 'production';
        this.packageName = 'claude-flow-novice';
        this.version = process.env.npm_package_version || '1.6.6';

        // Dashboard configuration
        this.dashboard = {
            enabled: true,
            port: process.env.MONITOR_PORT || 3001,
            host: process.env.MONITOR_HOST || 'localhost',
            updateInterval: 1000, // 1 second real-time updates
            historyRetention: 3600, // 1 hour of history at 1s intervals
            authentication: {
                enabled: process.env.DASHBOARD_AUTH_ENABLED === 'true',
                sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours
                requireHttps: this.environment === 'production'
            },
            features: {
                realTimeMetrics: true,
                swarmVisualization: true,
                performanceTrends: true,
                alerting: true,
                userFeedback: true
            }
        };

        // Metrics collection configuration
        this.metrics = {
            collection: {
                enabled: true,
                interval: 1000, // Collect every 1 second
                batchSize: 100,
                retention: {
                    realtime: 3600, // 1 hour
                    hourly: 7 * 24, // 7 days
                    daily: 90 // 90 days
                }
            },

            // System metrics
            system: {
                cpu: {
                    enabled: true,
                    thresholds: {
                        warning: 80,
                        critical: 95
                    }
                },
                memory: {
                    enabled: true,
                    thresholds: {
                        warning: 80, // 80% of available memory
                        critical: 90
                    }
                },
                disk: {
                    enabled: true,
                    thresholds: {
                        warning: 85,
                        critical: 95
                    }
                },
                network: {
                    enabled: true,
                    latencyThresholds: {
                        warning: 100, // ms
                        critical: 500
                    }
                }
            },

            // NPM package metrics
            package: {
                downloads: {
                    enabled: true,
                    interval: 3600000, // Check hourly
                    api: 'https://api.npmjs.org/downloads/point/last-day/claude-flow-novice'
                },
                installations: {
                    enabled: true,
                    successTracking: true,
                    errorReporting: true
                },
                versions: {
                    enabled: true,
                    trackAdoption: true,
                    alertOnLowAdoption: true
                },
                usage: {
                    commandTracking: true,
                    featureAnalytics: true,
                    anonymized: true
                }
            },

            // Performance metrics
            performance: {
                fleetManager: {
                    enabled: true,
                    agentSpawnTime: true,
                    taskCompletionRate: true,
                    resourceUtilization: true
                },
                redis: {
                    enabled: true,
                    connectionLatency: true,
                    commandLatency: true,
                    memoryUsage: true
                },
                dashboard: {
                    enabled: true,
                    responseTime: true,
                    websocketLatency: true,
                    clientConnections: true
                },
                wasm: {
                    enabled: true,
                    performanceTarget: 40, // 40x performance improvement
                    benchmarkInterval: 86400000 // Daily benchmarks
                }
            },

            // Swarm metrics
            swarm: {
                enabled: true,
                activeSwarms: true,
                agentCount: true,
                taskProgress: true,
                confidence: true,
                efficiency: true
            }
        };

        // Alerting configuration
        this.alerting = {
            enabled: true,
            channels: {
                console: true,
                dashboard: true,
                webhook: process.env.ALERT_WEBHOOK_URL || null,
                email: process.env.ALERT_EMAIL || null
            },

            rules: {
                // System alerts
                highCPU: {
                    enabled: true,
                    threshold: 85,
                    duration: 300000, // 5 minutes
                    severity: 'warning',
                    cooldown: 600000 // 10 minutes
                },
                highMemory: {
                    enabled: true,
                    threshold: 85,
                    duration: 300000,
                    severity: 'warning',
                    cooldown: 600000
                },
                criticalCPU: {
                    enabled: true,
                    threshold: 95,
                    duration: 60000, // 1 minute
                    severity: 'critical',
                    cooldown: 300000
                },
                criticalMemory: {
                    enabled: true,
                    threshold: 95,
                    duration: 60000,
                    severity: 'critical',
                    cooldown: 300000
                },

                // Package alerts
                lowDownloads: {
                    enabled: false, // Disabled initially
                    threshold: 10, // downloads per day
                    severity: 'info',
                    cooldown: 86400000 // 24 hours
                },
                highErrorRate: {
                    enabled: true,
                    threshold: 5, // 5% installation errors
                    severity: 'warning',
                    cooldown: 3600000 // 1 hour
                },

                // Performance alerts
                slowFleetManager: {
                    enabled: true,
                    threshold: 5000, // 5s agent spawn time
                    severity: 'warning',
                    cooldown: 600000
                },
                redisLatency: {
                    enabled: true,
                    threshold: 100, // 100ms
                    severity: 'warning',
                    cooldown: 300000
                },
                wasmPerformance: {
                    enabled: true,
                    threshold: 30, // Below 30x target
                    severity: 'warning',
                    cooldown: 86400000
                }
            }
        };

        // Health check configuration
        this.healthChecks = {
            enabled: true,
            interval: 60000, // Check every minute
            timeout: 10000, // 10 second timeout per check

            checks: {
                redis: {
                    enabled: true,
                    critical: true,
                    timeout: 5000
                },
                dashboard: {
                    enabled: true,
                    critical: false,
                    timeout: 5000
                },
                buildArtifacts: {
                    enabled: true,
                    critical: true,
                    timeout: 5000
                },
                systemRequirements: {
                    enabled: true,
                    critical: false,
                    timeout: 5000
                }
            }
        };

        // User feedback configuration
        this.userFeedback = {
            enabled: true,

            github: {
                enabled: true,
                repository: 'masharratt/claude-flow-novice',
                issueLabels: {
                    bug: 'bug',
                    feature: 'enhancement',
                    installation: 'installation',
                    documentation: 'documentation'
                },
                autoLabel: true
            },

            analytics: {
                enabled: true,
                anonymized: true,
                optOut: process.env.ANALYTICS_OPT_OUT === 'true',
                events: {
                    install: true,
                    command: true,
                    error: true,
                    success: true
                }
            },

            errorReporting: {
                enabled: true,
                stackTraces: true,
                environment: true,
                anonymizeUserData: true,
                sampleRate: 1.0 // Report 100% of errors initially
            }
        };

        // Logging configuration
        this.logging = {
            level: this.environment === 'production' ? 'info' : 'debug',
            format: 'json',
            destination: {
                console: true,
                file: {
                    enabled: true,
                    path: './logs/monitoring.log',
                    maxSize: '10m',
                    maxFiles: 10
                }
            },

            categories: {
                metrics: true,
                alerts: true,
                health: true,
                performance: true,
                errors: true
            }
        };

        // Data retention and privacy
        this.dataRetention = {
            metrics: {
                realtime: 24 * 60 * 60 * 1000, // 24 hours
                aggregated: 90 * 24 * 60 * 60 * 1000 // 90 days
            },
            logs: {
                debug: 7 * 24 * 60 * 60 * 1000, // 7 days
                info: 30 * 24 * 60 * 60 * 1000, // 30 days
                warning: 90 * 24 * 60 * 60 * 1000, // 90 days
                error: 365 * 24 * 60 * 60 * 1000 // 1 year
            },
            privacy: {
                anonymizeIPs: true,
                anonymizeUsernames: true,
                encryptSensitiveData: true,
                gdprCompliant: true
            }
        };
    }

    /**
     * Get configuration for specific component
     */
    getConfig(component) {
        return this[component] || {};
    }

    /**
     * Update configuration dynamically
     */
    updateConfig(component, updates) {
        if (this[component]) {
            this[component] = { ...this[component], ...updates };
            this.emit('config:updated', { component, updates });
        }
    }

    /**
     * Validate configuration
     */
    validate() {
        const errors = [];

        // Validate dashboard port
        if (this.dashboard.port < 1024 || this.dashboard.port > 65535) {
            errors.push('Dashboard port must be between 1024 and 65535');
        }

        // Validate metrics intervals
        if (this.metrics.collection.interval < 100) {
            errors.push('Metrics collection interval must be at least 100ms');
        }

        // Validate health check interval
        if (this.healthChecks.interval < 10000) {
            errors.push('Health check interval must be at least 10 seconds');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Export configuration as JSON
     */
    toJSON() {
        return {
            environment: this.environment,
            packageName: this.packageName,
            version: this.version,
            dashboard: this.dashboard,
            metrics: this.metrics,
            alerting: this.alerting,
            healthChecks: this.healthChecks,
            userFeedback: this.userFeedback,
            logging: this.logging,
            dataRetention: this.dataRetention
        };
    }

    /**
     * Get production-ready configuration
     */
    static getProductionConfig() {
        return new ProductionMonitoringConfig({
            environment: 'production'
        });
    }

    /**
     * Get development configuration
     */
    static getDevelopmentConfig() {
        return new ProductionMonitoringConfig({
            environment: 'development'
        });
    }
}

// Export default instance
export default new ProductionMonitoringConfig();
