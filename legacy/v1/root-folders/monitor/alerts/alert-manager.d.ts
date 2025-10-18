export class AlertManager extends EventEmitter<[never]> {
    constructor();
    activeAlerts: Map<any, any>;
    alertHistory: any[];
    thresholds: {
        system: {
            memory: {
                warning: number;
                critical: number;
                warningBytes: number;
                criticalBytes: number;
            };
            cpu: {
                warning: number;
                critical: number;
                loadAverage: {
                    warning: number;
                    critical: number;
                };
            };
            disk: {
                warning: number;
                critical: number;
                iopsWarning: number;
                iopsCritical: number;
            };
        };
        process: {
            memory: {
                heapWarning: number;
                heapCritical: number;
                rssWarning: number;
                rssCritical: number;
            };
            handles: {
                warning: number;
                critical: number;
            };
        };
        network: {
            latency: {
                warning: number;
                critical: number;
            };
            bandwidth: {
                warning: number;
                critical: number;
            };
            connections: {
                warning: number;
                critical: number;
            };
        };
        database: {
            latency: {
                warning: number;
                critical: number;
            };
            connections: {
                warning: number;
                critical: number;
            };
            cacheHitRate: {
                warning: number;
                critical: number;
            };
        };
        swarm: {
            efficiency: {
                warning: number;
                critical: number;
            };
            successRate: {
                warning: number;
                critical: number;
            };
            agentFailures: {
                warning: number;
                critical: number;
            };
        };
    };
    alertRules: ({
        id: string;
        name: string;
        condition: (metrics: any) => boolean;
        severity: (metrics: any) => "critical" | "warning";
        message: (metrics: any) => string;
        cooldown: number;
        category: string;
    } | {
        id: string;
        name: string;
        condition: (metrics: any) => boolean;
        severity: () => string;
        message: () => string;
        cooldown: number;
        category: string;
    })[];
    suppressions: Map<any, any>;
    notificationChannels: any[];
    getDefaultThresholds(): {
        system: {
            memory: {
                warning: number;
                critical: number;
                warningBytes: number;
                criticalBytes: number;
            };
            cpu: {
                warning: number;
                critical: number;
                loadAverage: {
                    warning: number;
                    critical: number;
                };
            };
            disk: {
                warning: number;
                critical: number;
                iopsWarning: number;
                iopsCritical: number;
            };
        };
        process: {
            memory: {
                heapWarning: number;
                heapCritical: number;
                rssWarning: number;
                rssCritical: number;
            };
            handles: {
                warning: number;
                critical: number;
            };
        };
        network: {
            latency: {
                warning: number;
                critical: number;
            };
            bandwidth: {
                warning: number;
                critical: number;
            };
            connections: {
                warning: number;
                critical: number;
            };
        };
        database: {
            latency: {
                warning: number;
                critical: number;
            };
            connections: {
                warning: number;
                critical: number;
            };
            cacheHitRate: {
                warning: number;
                critical: number;
            };
        };
        swarm: {
            efficiency: {
                warning: number;
                critical: number;
            };
            successRate: {
                warning: number;
                critical: number;
            };
            agentFailures: {
                warning: number;
                critical: number;
            };
        };
    };
    getDefaultAlertRules(): ({
        id: string;
        name: string;
        condition: (metrics: any) => boolean;
        severity: (metrics: any) => "critical" | "warning";
        message: (metrics: any) => string;
        cooldown: number;
        category: string;
    } | {
        id: string;
        name: string;
        condition: (metrics: any) => boolean;
        severity: () => string;
        message: () => string;
        cooldown: number;
        category: string;
    })[];
    checkMetrics(metrics: any): {
        id: string;
        ruleId: any;
        name: any;
        severity: any;
        message: any;
        category: any;
        timestamp: string;
        metrics: any;
        resolved: boolean;
        acknowledged: boolean;
    }[];
    createAlert(rule: any, metrics: any, timestamp: any): {
        id: string;
        ruleId: any;
        name: any;
        severity: any;
        message: any;
        category: any;
        timestamp: string;
        metrics: any;
        resolved: boolean;
        acknowledged: boolean;
    };
    extractRelevantMetrics(metrics: any, category: any): any;
    isInCooldown(ruleId: any, currentTime: any): boolean;
    detectMemoryLeak(metrics: any): boolean;
    detectPerformanceDegradation(metrics: any): boolean;
    getAverageSwarmEfficiency(metrics: any): number;
    getMetricHistory(path: any, count?: number): any[];
    acknowledgeAlert(alertId: any): boolean;
    getActiveAlerts(): any[];
    getAlertHistory(limit?: number): any[];
    cleanupAlertHistory(): void;
    updateThresholds(category: any, thresholds: any): void;
    addCustomAlert(rule: any): void;
    removeAlert(ruleId: any): void;
    addNotificationChannel(channel: any): void;
    sendNotifications(alert: any): Promise<void>;
    getAlertStats(): {
        total: number;
        active: number;
        last24h: number;
        bySeverity: {
            critical: number;
            warning: number;
            info: number;
        };
        byCategory: {};
    };
    getHealthStatus(): {
        status: string;
        activeAlerts: number;
        alertRules: number;
        suppressions: number;
        notificationChannels: number;
        lastCheck: string;
    };
}
import { EventEmitter } from 'events';
