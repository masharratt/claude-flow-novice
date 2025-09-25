/**
 * Rollback Trigger Detection System
 * Monitors system health and automatically triggers rollbacks when needed
 */

const EventEmitter = require('events');
const { MetricsCollector } = require('../monitoring/MetricsCollector');
const { AlertManager } = require('../monitoring/AlertManager');

class TriggerDetector extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            // Critical error rate threshold
            criticalErrorThreshold: config.criticalErrorThreshold || 0.01, // 1%
            errorRateWindowMs: config.errorRateWindowMs || 300000, // 5 minutes

            // Performance degradation threshold
            performanceDegradationThreshold: config.performanceDegradationThreshold || 0.05, // 5%
            performanceWindowMs: config.performanceWindowMs || 300000, // 5 minutes

            // User satisfaction threshold
            userSatisfactionThreshold: config.userSatisfactionThreshold || 4.0, // 4.0/5.0
            satisfactionWindowMs: config.satisfactionWindowMs || 600000, // 10 minutes

            // Byzantine consensus failure threshold
            byzantineFailureThreshold: config.byzantineFailureThreshold || 0.1, // 10%
            consensusWindowMs: config.consensusWindowMs || 180000, // 3 minutes

            // Support ticket surge threshold
            supportTicketSurgeThreshold: config.supportTicketSurgeThreshold || 0.5, // 50%
            supportTicketWindowMs: config.supportTicketWindowMs || 900000, // 15 minutes

            // Check intervals
            monitoringIntervalMs: config.monitoringIntervalMs || 30000, // 30 seconds
            ...config
        };

        this.metricsCollector = new MetricsCollector();
        this.alertManager = new AlertManager();

        this.monitoringState = {
            isMonitoring: false,
            lastCheck: null,
            activeAlerts: new Map(),
            baselineMetrics: null,
            triggerHistory: []
        };

        this.setupTriggerDefinitions();
    }

    /**
     * Start monitoring for rollback triggers
     */
    async startMonitoring() {
        if (this.monitoringState.isMonitoring) {
            console.log('[TriggerDetector] Monitoring already active');
            return;
        }

        console.log('[TriggerDetector] Starting rollback trigger monitoring');

        // Establish baseline metrics
        await this.establishBaseline();

        this.monitoringState.isMonitoring = true;
        this.monitoringInterval = setInterval(
            () => this.checkAllTriggers(),
            this.config.monitoringIntervalMs
        );

        console.log(`[TriggerDetector] Monitoring started with ${this.config.monitoringIntervalMs}ms interval`);
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (!this.monitoringState.isMonitoring) {
            return;
        }

        console.log('[TriggerDetector] Stopping rollback trigger monitoring');

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.monitoringState.isMonitoring = false;
    }

    /**
     * Establish baseline metrics for comparison
     */
    async establishBaseline() {
        console.log('[TriggerDetector] Establishing baseline metrics');

        const baseline = await this.metricsCollector.collectBaselineMetrics();
        this.monitoringState.baselineMetrics = {
            ...baseline,
            establishedAt: new Date()
        };

        console.log('[TriggerDetector] Baseline established:', baseline);
    }

    /**
     * Check all trigger conditions
     */
    async checkAllTriggers() {
        this.monitoringState.lastCheck = new Date();

        try {
            const currentMetrics = await this.metricsCollector.collectCurrentMetrics();

            // Check each trigger condition
            await Promise.all([
                this.checkCriticalErrorRate(currentMetrics),
                this.checkPerformanceDegradation(currentMetrics),
                this.checkUserSatisfaction(currentMetrics),
                this.checkByzantineConsensus(currentMetrics),
                this.checkSupportTicketSurge(currentMetrics)
            ]);

        } catch (error) {
            console.error(`[TriggerDetector] Error during trigger check: ${error.message}`);
        }
    }

    /**
     * Check critical error rate trigger
     */
    async checkCriticalErrorRate(metrics) {
        const errorRate = await this.metricsCollector.getErrorRate(this.config.errorRateWindowMs);

        if (errorRate > this.config.criticalErrorThreshold) {
            await this.triggerRollback({
                type: 'critical_error_rate',
                severity: 'critical',
                reason: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(this.config.criticalErrorThreshold * 100).toFixed(2)}%`,
                metrics: {
                    currentRate: errorRate,
                    threshold: this.config.criticalErrorThreshold,
                    windowMs: this.config.errorRateWindowMs
                },
                affectedComponents: ['validation_system', 'completion_system']
            });
        }
    }

    /**
     * Check performance degradation trigger
     */
    async checkPerformanceDegradation(metrics) {
        if (!this.monitoringState.baselineMetrics) {
            return; // Need baseline for comparison
        }

        const performanceMetrics = await this.metricsCollector.getPerformanceMetrics(
            this.config.performanceWindowMs
        );

        const degradation = this.calculatePerformanceDegradation(
            performanceMetrics,
            this.monitoringState.baselineMetrics.performance
        );

        if (degradation > this.config.performanceDegradationThreshold) {
            await this.triggerRollback({
                type: 'performance_degradation',
                severity: 'high',
                reason: `Performance degraded by ${(degradation * 100).toFixed(2)}% from baseline`,
                metrics: {
                    degradation,
                    threshold: this.config.performanceDegradationThreshold,
                    current: performanceMetrics,
                    baseline: this.monitoringState.baselineMetrics.performance
                },
                affectedComponents: ['completion_validation', 'hook_system']
            });
        }
    }

    /**
     * Check user satisfaction trigger
     */
    async checkUserSatisfaction(metrics) {
        const satisfaction = await this.metricsCollector.getUserSatisfactionScore(
            this.config.satisfactionWindowMs
        );

        if (satisfaction && satisfaction < this.config.userSatisfactionThreshold) {
            await this.triggerRollback({
                type: 'user_satisfaction',
                severity: 'high',
                reason: `User satisfaction ${satisfaction.toFixed(1)} below threshold ${this.config.userSatisfactionThreshold}`,
                metrics: {
                    currentScore: satisfaction,
                    threshold: this.config.userSatisfactionThreshold,
                    windowMs: this.config.satisfactionWindowMs
                },
                affectedComponents: ['user_interface', 'completion_system']
            });
        }
    }

    /**
     * Check Byzantine consensus failure trigger
     */
    async checkByzantineConsensus(metrics) {
        const consensusFailureRate = await this.metricsCollector.getByzantineFailureRate(
            this.config.consensusWindowMs
        );

        if (consensusFailureRate > this.config.byzantineFailureThreshold) {
            await this.triggerRollback({
                type: 'byzantine_consensus_failure',
                severity: 'critical',
                reason: `Byzantine consensus failure rate ${(consensusFailureRate * 100).toFixed(2)}% exceeds threshold`,
                metrics: {
                    failureRate: consensusFailureRate,
                    threshold: this.config.byzantineFailureThreshold,
                    windowMs: this.config.consensusWindowMs
                },
                affectedComponents: ['consensus_system', 'validation_coordination']
            });
        }
    }

    /**
     * Check support ticket surge trigger
     */
    async checkSupportTicketSurge(metrics) {
        const ticketSurge = await this.metricsCollector.getSupportTicketSurge(
            this.config.supportTicketWindowMs
        );

        if (ticketSurge > this.config.supportTicketSurgeThreshold) {
            await this.triggerRollback({
                type: 'support_ticket_surge',
                severity: 'medium',
                reason: `Support tickets increased by ${(ticketSurge * 100).toFixed(2)}% above baseline`,
                metrics: {
                    surge: ticketSurge,
                    threshold: this.config.supportTicketSurgeThreshold,
                    windowMs: this.config.supportTicketWindowMs
                },
                affectedComponents: ['user_experience', 'system_stability']
            });
        }
    }

    /**
     * Calculate performance degradation percentage
     */
    calculatePerformanceDegradation(current, baseline) {
        const responseTimeDegradation = (current.responseTime - baseline.responseTime) / baseline.responseTime;
        const throughputDegradation = (baseline.throughput - current.throughput) / baseline.throughput;
        const memoryDegradation = (current.memoryUsage - baseline.memoryUsage) / baseline.memoryUsage;

        // Weighted average of degradation metrics
        return (responseTimeDegradation * 0.4 + throughputDegradation * 0.4 + memoryDegradation * 0.2);
    }

    /**
     * Trigger rollback based on detected condition
     */
    async triggerRollback(trigger) {
        const triggerKey = `${trigger.type}_${Date.now()}`;

        // Check if this trigger type is already active
        if (this.monitoringState.activeAlerts.has(trigger.type)) {
            console.log(`[TriggerDetector] Trigger ${trigger.type} already active, skipping duplicate`);
            return;
        }

        console.log(`[TriggerDetector] ROLLBACK TRIGGER DETECTED: ${trigger.type}`);
        console.log(`[TriggerDetector] Reason: ${trigger.reason}`);
        console.log(`[TriggerDetector] Severity: ${trigger.severity}`);

        // Add to active alerts
        this.monitoringState.activeAlerts.set(trigger.type, {
            ...trigger,
            triggeredAt: new Date(),
            key: triggerKey
        });

        // Add to trigger history
        this.monitoringState.triggerHistory.push({
            ...trigger,
            triggeredAt: new Date(),
            key: triggerKey
        });

        // Create alert
        await this.alertManager.createAlert({
            type: 'rollback_trigger',
            severity: trigger.severity,
            title: `Rollback Trigger: ${trigger.type}`,
            description: trigger.reason,
            metadata: trigger.metrics
        });

        // Emit rollback trigger event
        this.emit('rollback_trigger', trigger);

        // Auto-clear alert after some time if no rollback occurs
        setTimeout(() => {
            this.monitoringState.activeAlerts.delete(trigger.type);
        }, 600000); // 10 minutes
    }

    /**
     * Setup trigger definitions and thresholds
     */
    setupTriggerDefinitions() {
        this.triggerDefinitions = {
            critical_error_rate: {
                name: 'Critical Error Rate',
                description: 'System error rate exceeds acceptable threshold',
                severity: 'critical',
                autoRollback: true
            },
            performance_degradation: {
                name: 'Performance Degradation',
                description: 'System performance significantly degraded',
                severity: 'high',
                autoRollback: true
            },
            user_satisfaction: {
                name: 'User Satisfaction Drop',
                description: 'User satisfaction below acceptable level',
                severity: 'high',
                autoRollback: false // Requires manual confirmation
            },
            byzantine_consensus_failure: {
                name: 'Byzantine Consensus Failure',
                description: 'Consensus system experiencing high failure rate',
                severity: 'critical',
                autoRollback: true
            },
            support_ticket_surge: {
                name: 'Support Ticket Surge',
                description: 'Abnormal increase in support requests',
                severity: 'medium',
                autoRollback: false // Requires manual confirmation
            }
        };
    }

    /**
     * Get current monitoring status
     */
    getMonitoringStatus() {
        return {
            isMonitoring: this.monitoringState.isMonitoring,
            lastCheck: this.monitoringState.lastCheck,
            activeAlerts: Array.from(this.monitoringState.activeAlerts.values()),
            triggerHistory: this.monitoringState.triggerHistory.slice(-10), // Last 10 triggers
            baseline: this.monitoringState.baselineMetrics,
            thresholds: {
                criticalErrorThreshold: this.config.criticalErrorThreshold,
                performanceDegradationThreshold: this.config.performanceDegradationThreshold,
                userSatisfactionThreshold: this.config.userSatisfactionThreshold,
                byzantineFailureThreshold: this.config.byzantineFailureThreshold,
                supportTicketSurgeThreshold: this.config.supportTicketSurgeThreshold
            }
        };
    }

    /**
     * Update trigger thresholds dynamically
     */
    updateThresholds(newThresholds) {
        console.log('[TriggerDetector] Updating trigger thresholds:', newThresholds);

        Object.assign(this.config, newThresholds);

        this.emit('thresholds_updated', {
            oldThresholds: this.config,
            newThresholds,
            updatedAt: new Date()
        });
    }

    /**
     * Clear active alerts
     */
    clearActiveAlerts(triggerTypes = null) {
        if (triggerTypes) {
            triggerTypes.forEach(type => {
                this.monitoringState.activeAlerts.delete(type);
            });
        } else {
            this.monitoringState.activeAlerts.clear();
        }
    }

    /**
     * Test trigger for validation
     */
    async testTrigger(triggerType, testMetrics = {}) {
        console.log(`[TriggerDetector] Testing trigger: ${triggerType}`);

        await this.triggerRollback({
            type: `test_${triggerType}`,
            severity: 'test',
            reason: `Test trigger for ${triggerType}`,
            metrics: testMetrics,
            isTest: true
        });
    }
}

module.exports = { TriggerDetector };