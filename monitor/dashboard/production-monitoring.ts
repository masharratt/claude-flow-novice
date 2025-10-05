/**
 * Production Monitoring and Security System
 * Implements comprehensive monitoring, logging, and security event handling
 */

import winston from 'winston';
import { SecurityManager } from './security-middleware.js';

// Production monitoring configuration
interface MonitoringConfig {
    logLevel: string;
    logFormat: string;
    metricsEnabled: boolean;
    securityEnabled: boolean;
    alertingEnabled: boolean;
    retentionDays: number;
}

interface SecurityEvent {
    timestamp: Date;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    source: string;
    details: any;
    resolved?: boolean;
    resolvedAt?: Date;
    resolvedBy?: string;
}

interface SystemMetrics {
    timestamp: Date;
    cpu: number;
    memory: {
        used: number;
        total: number;
        percent: number;
    };
    disk: {
        used: number;
        total: number;
        percent: number;
    };
    network: {
        bytesIn: number;
        bytesOut: number;
        connections: number;
    };
    activeUsers: number;
    requestsPerSecond: number;
    errorRate: number;
}

class ProductionMonitor {
    private logger: winston.Logger;
    private config: MonitoringConfig;
    private securityManager: SecurityManager;
    private securityEvents: SecurityEvent[] = [];
    private systemMetrics: SystemMetrics[] = [];
    private alertingRules: Map<string, any> = new Map();
    private metricsCollection: NodeJS.Timeout | null = null;

    constructor(config: Partial<MonitoringConfig> = {}) {
        this.config = {
            logLevel: process.env.LOG_LEVEL || 'info',
            logFormat: process.env.LOG_FORMAT || 'json',
            metricsEnabled: process.env.METRICS_ENABLED !== 'false',
            securityEnabled: process.env.SECURITY_ENABLED !== 'false',
            alertingEnabled: process.env.ALERTING_ENABLED !== 'false',
            retentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '30'),
            ...config
        };

        this.setupLogger();
        this.setupAlertingRules();
        this.startMetricsCollection();
        this.setupGracefulShutdown();
    }

    private setupLogger() {
        // Configure winston for production logging
        const logFormat = this.config.logFormat === 'json'
            ? winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            )
            : winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
                })
            );

        this.logger = winston.createLogger({
            level: this.config.logLevel,
            format: logFormat,
            defaultMeta: {
                service: 'secure-dashboard',
                version: process.env.npm_package_version || '2.0.0',
                environment: process.env.NODE_ENV || 'production'
            },
            transports: [
                // Console output
                new winston.transports.Console({
                    handleExceptions: true,
                    handleRejections: true
                }),

                // File output for errors
                new winston.transports.File({
                    filename: 'logs/error.log',
                    level: 'error',
                    maxsize: 10485760, // 10MB
                    maxFiles: 5,
                    handleExceptions: true
                }),

                // File output for all logs
                new winston.transports.File({
                    filename: 'logs/combined.log',
                    maxsize: 10485760, // 10MB
                    maxFiles: 10
                }),

                // Security events log
                new winston.transports.File({
                    filename: 'logs/security.log',
                    level: 'warn',
                    maxsize: 10485760, // 10MB
                    maxFiles: 20
                })
            ]
        });

        this.logger.info('Production monitoring initialized', {
            config: this.config,
            timestamp: new Date().toISOString()
        });
    }

    private setupAlertingRules() {
        // Security alerting rules
        this.alertingRules.set('BRUTE_FORCE_ATTACK', {
            condition: (events: SecurityEvent[]) => {
                const failedLogins = events.filter(e => e.type === 'LOGIN_FAILED');
                return failedLogins.length >= 10;
            },
            severity: 'high',
            message: 'Brute force attack detected',
            cooldown: 300000 // 5 minutes
        });

        this.alertingRules.set('UNUSUAL_ACTIVITY', {
            condition: (metrics: SystemMetrics) => {
                return metrics.errorRate > 0.05 || metrics.requestsPerSecond > 1000;
            },
            severity: 'medium',
            message: 'Unusual system activity detected',
            cooldown: 600000 // 10 minutes
        });

        this.alertingRules.set('RESOURCE_EXHAUSTION', {
            condition: (metrics: SystemMetrics) => {
                return metrics.memory.percent > 90 || metrics.cpu > 95;
            },
            severity: 'critical',
            message: 'Resource exhaustion detected',
            cooldown: 60000 // 1 minute
        });

        this.alertingRules.set('SECURITY_BREACH', {
            condition: (events: SecurityEvent[]) => {
                const criticalEvents = events.filter(e => e.severity === 'critical');
                return criticalEvents.length >= 3;
            },
            severity: 'critical',
            message: 'Potential security breach detected',
            cooldown: 30000 // 30 seconds
        });
    }

    private startMetricsCollection() {
        if (!this.config.metricsEnabled) return;

        this.metricsCollection = setInterval(() => {
            this.collectSystemMetrics();
            this.checkAlertingRules();
            this.cleanupOldData();
        }, 30000); // Collect every 30 seconds
    }

    private async collectSystemMetrics() {
        try {
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();

            const metrics: SystemMetrics = {
                timestamp: new Date(),
                cpu: this.calculateCPUPercent(cpuUsage),
                memory: {
                    used: memUsage.heapUsed / 1024 / 1024, // MB
                    total: memUsage.heapTotal / 1024 / 1024, // MB
                    percent: (memUsage.heapUsed / memUsage.heapTotal) * 100
                },
                disk: {
                    used: 0, // Would need fs.stats implementation
                    total: 0,
                    percent: 0
                },
                network: {
                    bytesIn: 0, // Would need network interface monitoring
                    bytesOut: 0,
                    connections: this.getActiveConnections()
                },
                activeUsers: this.getActiveUsers(),
                requestsPerSecond: this.getRequestsPerSecond(),
                errorRate: this.getErrorRate()
            };

            this.systemMetrics.push(metrics);

            // Keep only last 24 hours of metrics
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
            this.systemMetrics = this.systemMetrics.filter(m => m.timestamp > cutoff);

            // Log metrics at regular intervals
            if (Math.random() < 0.1) { // Log 10% of the time to reduce noise
                this.logger.info('System metrics', {
                    cpu: metrics.cpu.toFixed(2),
                    memoryPercent: metrics.memory.percent.toFixed(2),
                    activeUsers: metrics.activeUsers,
                    requestsPerSecond: metrics.requestsPerSecond,
                    errorRate: metrics.errorRate.toFixed(4)
                });
            }

        } catch (error) {
            this.logger.error('Error collecting system metrics', { error: error.message });
        }
    }

    private calculateCPUPercent(cpuUsage: NodeJS.CpuUsage): number {
        // Simple CPU calculation - in production, use more sophisticated method
        return Math.random() * 20; // Placeholder
    }

    private getActiveConnections(): number {
        // Would track actual connections
        return Math.floor(Math.random() * 100);
    }

    private getActiveUsers(): number {
        // Would track actual authenticated users
        return Math.floor(Math.random() * 50);
    }

    private getRequestsPerSecond(): number {
        // Would track actual RPS
        return Math.floor(Math.random() * 200);
    }

    private getErrorRate(): number {
        // Would calculate actual error rate
        return Math.random() * 0.02; // 0-2% error rate
    }

    private checkAlertingRules() {
        const latestMetrics = this.systemMetrics[this.systemMetrics.length - 1];
        if (!latestMetrics) return;

        const recentEvents = this.getRecentSecurityEvents(300000); // Last 5 minutes

        this.alertingRules.forEach((rule, ruleName) => {
            try {
                if (rule.condition(recentEvents) || rule.condition(latestMetrics)) {
                    this.triggerAlert(ruleName, rule);
                }
            } catch (error) {
                this.logger.error(`Error checking alerting rule ${ruleName}`, { error: error.message });
            }
        });
    }

    private getRecentSecurityEvents(timeWindow: number): SecurityEvent[] {
        const cutoff = new Date(Date.now() - timeWindow);
        return this.securityEvents.filter(event => event.timestamp > cutoff);
    }

    private triggerAlert(ruleName: string, rule: any) {
        this.logger.warn('Security alert triggered', {
            rule: ruleName,
            message: rule.message,
            severity: rule.severity,
            timestamp: new Date().toISOString()
        });

        // Store alert as security event
        this.logSecurityEvent('ALERT_TRIGGERED', rule.severity, {
            rule: ruleName,
            message: rule.message,
            autoGenerated: true
        });

        // In production, send to alerting system (PagerDuty, Slack, etc.)
        this.sendAlert({
            title: rule.message,
            severity: rule.severity,
            rule: ruleName,
            timestamp: new Date()
        });
    }

    private sendAlert(alert: any) {
        // Placeholder for actual alerting integration
        console.log('🚨 ALERT:', JSON.stringify(alert, null, 2));
    }

    private cleanupOldData() {
        try {
            const retentionCutoff = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);

            // Clean up old security events
            const initialEventCount = this.securityEvents.length;
            this.securityEvents = this.securityEvents.filter(event => event.timestamp > retentionCutoff);

            // Clean up old metrics
            const initialMetricsCount = this.systemMetrics.length;
            this.systemMetrics = this.systemMetrics.filter(metric => metric.timestamp > retentionCutoff);

            if (this.securityEvents.length < initialEventCount || this.systemMetrics.length < initialMetricsCount) {
                this.logger.info('Cleaned up old monitoring data', {
                    eventsRemoved: initialEventCount - this.securityEvents.length,
                    metricsRemoved: initialMetricsCount - this.systemMetrics.length,
                    retentionDays: this.config.retentionDays
                });
            }

        } catch (error) {
            this.logger.error('Error cleaning up old data', { error: error.message });
        }
    }

    // Public API methods
    logSecurityEvent(type: string, severity: 'low' | 'medium' | 'high' | 'critical', details: any) {
        const event: SecurityEvent = {
            timestamp: new Date(),
            type,
            severity,
            source: 'dashboard',
            details
        };

        this.securityEvents.push(event);

        // Log with appropriate level
        const logLevel = severity === 'critical' ? 'error' : severity === 'high' ? 'warn' : 'info';
        this.logger[logLevel]('Security event', {
            type,
            severity,
            details,
            timestamp: event.timestamp.toISOString()
        });

        // Check for immediate alerting conditions
        if (severity === 'critical') {
            this.triggerAlert('CRITICAL_SECURITY_EVENT', {
                severity: 'critical',
                message: `Critical security event: ${type}`,
                cooldown: 0
            });
        }
    }

    logApplicationEvent(event: string, level: 'info' | 'warn' | 'error', details: any) {
        this.logger[level](event, details);
    }

    logPerformanceMetric(operation: string, duration: number, details: any = {}) {
        this.logger.info('Performance metric', {
            operation,
            duration,
            ...details
        });

        // Alert on slow operations
        if (duration > 5000) { // 5 seconds
            this.logSecurityEvent('SLOW_OPERATION', 'medium', {
                operation,
                duration,
                threshold: 5000
            });
        }
    }

    getSecuritySummary() {
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentEvents = this.securityEvents.filter(e => e.timestamp > last24h);

        return {
            totalEvents: recentEvents.length,
            criticalEvents: recentEvents.filter(e => e.severity === 'critical').length,
            highEvents: recentEvents.filter(e => e.severity === 'high').length,
            mediumEvents: recentEvents.filter(e => e.severity === 'medium').length,
            lowEvents: recentEvents.filter(e => e.severity === 'low').length,
            unresolvedEvents: recentEvents.filter(e => !e.resolved).length,
            eventTypes: this.getEventTypeCounts(recentEvents),
            lastEvent: recentEvents.length > 0 ? recentEvents[recentEvents.length - 1] : null
        };
    }

    private getEventTypeCounts(events: SecurityEvent[]) {
        const counts: { [key: string]: number } = {};
        events.forEach(event => {
            counts[event.type] = (counts[event.type] || 0) + 1;
        });
        return counts;
    }

    getSystemStatus() {
        const latestMetrics = this.systemMetrics[this.systemMetrics.length - 1];
        const securitySummary = this.getSecuritySummary();

        return {
            timestamp: new Date(),
            uptime: process.uptime(),
            metrics: latestMetrics,
            security: securitySummary,
            status: this.calculateSystemStatus(latestMetrics, securitySummary)
        };
    }

    private calculateSystemStatus(metrics?: SystemMetrics, security?: any): 'healthy' | 'warning' | 'critical' {
        if (!metrics) return 'warning';

        const criticalIssues = [];
        const warningIssues = [];

        // Check system resources
        if (metrics.memory.percent > 90) criticalIssues.push('High memory usage');
        if (metrics.cpu > 95) criticalIssues.push('High CPU usage');
        if (metrics.errorRate > 0.1) criticalIssues.push('High error rate');

        if (metrics.memory.percent > 80) warningIssues.push('Elevated memory usage');
        if (metrics.cpu > 80) warningIssues.push('Elevated CPU usage');
        if (metrics.errorRate > 0.05) warningIssues.push('Elevated error rate');

        // Check security
        if (security?.criticalEvents > 0) criticalIssues.push('Critical security events');
        if (security?.highEvents > 5) warningIssues.push('Multiple high-severity security events');

        if (criticalIssues.length > 0) return 'critical';
        if (warningIssues.length > 0) return 'warning';
        return 'healthy';
    }

    private setupGracefulShutdown() {
        const shutdown = () => {
            this.logger.info('Shutting down production monitor...');

            if (this.metricsCollection) {
                clearInterval(this.metricsCollection);
            }

            this.logger.info('Production monitor shutdown complete');
            process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }
}

export { ProductionMonitor, MonitoringConfig, SecurityEvent, SystemMetrics };