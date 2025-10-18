/**
 * Phase 4 Rollback Contingency System - Main Integration Module
 * Orchestrates all rollback components for rapid, safe rollout reversion
 */

const { RollbackCoordinator } = require('./core/RollbackCoordinator');
const { TriggerDetector } = require('./triggers/TriggerDetector');
const { FeatureFlags } = require('./core/FeatureFlags');
const { StateManager } = require('./core/StateManager');
const { HealthChecker } = require('./core/HealthChecker');
const { NotificationService } = require('./communication/NotificationService');
const { IncidentTracker } = require('./monitoring/IncidentTracker');
const { MetricsCollector } = require('./monitoring/MetricsCollector');
const { runRollbackTests } = require('./tests/RollbackSystemTests');

class RollbackSystem {
    constructor(config = {}) {
        this.config = {
            // System-level settings
            environment: config.environment || 'production',
            enabledComponents: config.enabledComponents || 'all',

            // Monitoring settings
            enableContinuousMonitoring: config.enableContinuousMonitoring !== false,
            enableAutomatedRollbacks: config.enableAutomatedRollbacks !== false,

            // Performance settings
            rollbackTimeoutMs: config.rollbackTimeoutMs || 300000, // 5 minutes
            healthCheckIntervalMs: config.healthCheckIntervalMs || 60000, // 1 minute

            // Notification settings
            enableUserNotifications: config.enableUserNotifications !== false,
            enableOperationsAlerts: config.enableOperationsAlerts !== false,

            ...config
        };

        this.components = {};
        this.systemStatus = {
            initialized: false,
            operational: false,
            lastHealthCheck: null,
            activeRollbacks: 0,
            systemUptime: null
        };

        this.eventListeners = new Map();
        this.healthCheckInterval = null;
        this.startTime = Date.now();
    }

    /**
     * Initialize the complete rollback system
     */
    async initialize() {
        try {
            console.log('[RollbackSystem] Initializing Phase 4 Rollback Contingency System');
            console.log(`[RollbackSystem] Environment: ${this.config.environment}`);

            // Initialize core components
            await this.initializeComponents();

            // Setup component interactions
            await this.setupComponentIntegration();

            // Start monitoring systems
            await this.startMonitoringSystems();

            // Setup event handling
            this.setupEventHandling();

            // Run system validation
            await this.validateSystemReadiness();

            this.systemStatus.initialized = true;
            this.systemStatus.operational = true;
            this.systemStatus.systemUptime = new Date();

            console.log('[RollbackSystem] Rollback system initialization completed successfully');
            console.log('[RollbackSystem] System is ready for Phase 4 controlled rollout');

            return {
                success: true,
                components: Object.keys(this.components),
                status: this.systemStatus
            };

        } catch (error) {
            console.error(`[RollbackSystem] Initialization failed: ${error.message}`);
            this.systemStatus.operational = false;
            throw error;
        }
    }

    /**
     * Initialize all system components
     */
    async initializeComponents() {
        console.log('[RollbackSystem] Initializing system components');

        // Initialize components in dependency order
        const initOrder = [
            'featureFlags',
            'stateManager',
            'healthChecker',
            'notificationService',
            'incidentTracker',
            'metricsCollector',
            'triggerDetector',
            'rollbackCoordinator'
        ];

        for (const componentName of initOrder) {
            try {
                console.log(`[RollbackSystem] Initializing ${componentName}...`);
                await this.initializeComponent(componentName);
                console.log(`[RollbackSystem] ✓ ${componentName} initialized`);
            } catch (error) {
                console.error(`[RollbackSystem] ✗ Failed to initialize ${componentName}: ${error.message}`);
                throw new Error(`Component initialization failed: ${componentName}`);
            }
        }
    }

    /**
     * Initialize individual component
     */
    async initializeComponent(componentName) {
        const componentConfig = this.config[componentName] || {};

        switch (componentName) {
            case 'featureFlags':
                this.components.featureFlags = new FeatureFlags(componentConfig);
                break;

            case 'stateManager':
                this.components.stateManager = new StateManager(componentConfig);
                break;

            case 'healthChecker':
                this.components.healthChecker = new HealthChecker(componentConfig);
                break;

            case 'notificationService':
                this.components.notificationService = new NotificationService(componentConfig);
                break;

            case 'incidentTracker':
                this.components.incidentTracker = new IncidentTracker(componentConfig);
                break;

            case 'metricsCollector':
                this.components.metricsCollector = new MetricsCollector(componentConfig);
                break;

            case 'triggerDetector':
                this.components.triggerDetector = new TriggerDetector(componentConfig);
                break;

            case 'rollbackCoordinator':
                this.components.rollbackCoordinator = new RollbackCoordinator({
                    ...componentConfig,
                    // Inject dependencies
                    featureFlags: this.components.featureFlags,
                    stateManager: this.components.stateManager,
                    healthChecker: this.components.healthChecker,
                    notificationService: this.components.notificationService,
                    incidentTracker: this.components.incidentTracker
                });
                break;

            default:
                throw new Error(`Unknown component: ${componentName}`);
        }
    }

    /**
     * Setup integration between components
     */
    async setupComponentIntegration() {
        console.log('[RollbackSystem] Setting up component integration');

        // Connect trigger detector to rollback coordinator
        this.components.triggerDetector.on('rollback_trigger', async (trigger) => {
            try {
                console.log(`[RollbackSystem] Processing rollback trigger: ${trigger.type}`);

                if (this.config.enableAutomatedRollbacks) {
                    await this.components.rollbackCoordinator.initiateAutomatedRollback(trigger);
                } else {
                    console.log('[RollbackSystem] Automated rollbacks disabled - trigger logged only');
                    await this.components.incidentTracker.createIncident({
                        type: 'trigger_detection',
                        severity: trigger.severity,
                        description: `Rollback trigger detected: ${trigger.reason}`,
                        context: trigger
                    });
                }
            } catch (error) {
                console.error(`[RollbackSystem] Error processing rollback trigger: ${error.message}`);
            }
        });

        // Connect rollback coordinator events to notifications
        this.components.rollbackCoordinator.on('rollback_initiated', async (data) => {
            this.systemStatus.activeRollbacks++;
        });

        this.components.rollbackCoordinator.on('rollback_completed', async (data) => {
            this.systemStatus.activeRollbacks = Math.max(0, this.systemStatus.activeRollbacks - 1);
        });

        this.components.rollbackCoordinator.on('rollback_failed', async (data) => {
            this.systemStatus.activeRollbacks = Math.max(0, this.systemStatus.activeRollbacks - 1);

            // Create critical incident for rollback failures
            await this.components.incidentTracker.createIncident({
                type: 'rollback_failure',
                severity: 'critical',
                description: `Rollback ${data.rollbackId} failed`,
                rollbackId: data.rollbackId,
                context: { error: data.error.message }
            });
        });

        // Connect metrics collector to trigger detector
        this.components.metricsCollector.on('baseline_updated', (baseline) => {
            // Trigger detector can use updated baseline for comparisons
            console.log('[RollbackSystem] Metrics baseline updated');
        });

        console.log('[RollbackSystem] Component integration completed');
    }

    /**
     * Start monitoring systems
     */
    async startMonitoringSystems() {
        console.log('[RollbackSystem] Starting monitoring systems');

        if (this.config.enableContinuousMonitoring) {
            // Start trigger monitoring
            await this.components.triggerDetector.startMonitoring();
            console.log('[RollbackSystem] ✓ Trigger monitoring started');

            // Start metrics collection
            this.components.metricsCollector.startCollection();
            console.log('[RollbackSystem] ✓ Metrics collection started');

            // Start health checking
            this.startHealthChecking();
            console.log('[RollbackSystem] ✓ Health checking started');
        } else {
            console.log('[RollbackSystem] Continuous monitoring disabled');
        }
    }

    /**
     * Start periodic health checking
     */
    startHealthChecking() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                const healthReport = await this.components.healthChecker.quickHealthCheck();
                this.systemStatus.lastHealthCheck = healthReport;

                if (!healthReport.healthy) {
                    console.warn('[RollbackSystem] System health check failed');

                    // Could trigger alerts or automated responses here
                    await this.components.notificationService.triggerSystemAlert({
                        severity: 'high',
                        message: `System health check failed: ${healthReport.issues.join(', ')}`
                    });
                }
            } catch (error) {
                console.error(`[RollbackSystem] Health check error: ${error.message}`);
            }
        }, this.config.healthCheckIntervalMs);
    }

    /**
     * Setup system event handling
     */
    setupEventHandling() {
        // Handle process signals for graceful shutdown
        process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));

        // Handle uncaught errors
        process.on('uncaughtException', (error) => {
            console.error('[RollbackSystem] Uncaught exception:', error);
            this.handleCriticalError(error);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('[RollbackSystem] Unhandled rejection:', reason);
            this.handleCriticalError(reason);
        });
    }

    /**
     * Validate system readiness
     */
    async validateSystemReadiness() {
        console.log('[RollbackSystem] Validating system readiness');

        const validationChecks = [
            () => this.validateComponentHealth(),
            () => this.validateComponentIntegration(),
            () => this.validateRollbackCapability()
        ];

        for (let i = 0; i < validationChecks.length; i++) {
            try {
                await validationChecks[i]();
                console.log(`[RollbackSystem] ✓ Validation check ${i + 1} passed`);
            } catch (error) {
                console.error(`[RollbackSystem] ✗ Validation check ${i + 1} failed: ${error.message}`);
                throw error;
            }
        }

        console.log('[RollbackSystem] System validation completed successfully');
    }

    /**
     * Validate component health
     */
    async validateComponentHealth() {
        const componentNames = Object.keys(this.components);

        for (const name of componentNames) {
            const component = this.components[name];

            if (component.isOperational && !component.isOperational()) {
                throw new Error(`Component ${name} is not operational`);
            }
        }
    }

    /**
     * Validate component integration
     */
    async validateComponentIntegration() {
        // Test basic rollback coordinator readiness
        const isReady = await this.components.rollbackCoordinator.isRollbackReady();
        if (!isReady) {
            throw new Error('Rollback coordinator is not ready');
        }

        // Test feature flags functionality
        const flagStatus = this.components.featureFlags.getSystemStatus();
        if (!flagStatus.operational) {
            throw new Error('Feature flags system is not operational');
        }
    }

    /**
     * Validate rollback capability
     */
    async validateRollbackCapability() {
        // Test state capture capability
        try {
            const testState = await this.components.stateManager.captureCurrentState();
            if (!testState || !testState.id) {
                throw new Error('State capture validation failed');
            }
        } catch (error) {
            throw new Error(`State management validation failed: ${error.message}`);
        }

        // Test health checking
        try {
            const healthReport = await this.components.healthChecker.quickHealthCheck();
            if (!healthReport) {
                throw new Error('Health checking validation failed');
            }
        } catch (error) {
            throw new Error(`Health checking validation failed: ${error.message}`);
        }
    }

    /**
     * Execute manual rollback
     */
    async executeManualRollback(operator, reason, options = {}) {
        try {
            console.log(`[RollbackSystem] Manual rollback requested by ${operator}`);
            console.log(`[RollbackSystem] Reason: ${reason}`);

            const result = await this.components.rollbackCoordinator.initiateManualRollback(
                operator,
                reason,
                options
            );

            console.log(`[RollbackSystem] Manual rollback ${result.success ? 'completed successfully' : 'failed'}`);

            return result;

        } catch (error) {
            console.error(`[RollbackSystem] Manual rollback failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get comprehensive system status
     */
    getSystemStatus() {
        const uptime = Date.now() - this.startTime;

        const status = {
            ...this.systemStatus,
            uptime,
            components: {},
            monitoring: {
                triggerDetection: this.components.triggerDetector?.getMonitoringStatus(),
                metricsCollection: this.components.metricsCollector?.getStatus(),
                healthChecking: {
                    enabled: this.healthCheckInterval !== null,
                    lastCheck: this.systemStatus.lastHealthCheck
                }
            }
        };

        // Get individual component status
        Object.keys(this.components).forEach(name => {
            const component = this.components[name];

            if (component.getStatus) {
                status.components[name] = component.getStatus();
            } else if (component.isOperational) {
                status.components[name] = { operational: component.isOperational() };
            } else {
                status.components[name] = { operational: true }; // Assume operational if no status method
            }
        });

        return status;
    }

    /**
     * Run system diagnostics
     */
    async runDiagnostics() {
        console.log('[RollbackSystem] Running system diagnostics');

        const diagnostics = {
            timestamp: new Date(),
            systemStatus: this.getSystemStatus(),
            componentDiagnostics: {},
            recommendations: []
        };

        // Run component-specific diagnostics
        for (const [name, component] of Object.entries(this.components)) {
            try {
                diagnostics.componentDiagnostics[name] = {
                    operational: component.isOperational ? component.isOperational() : true,
                    status: component.getStatus ? component.getStatus() : 'No status method'
                };
            } catch (error) {
                diagnostics.componentDiagnostics[name] = {
                    error: error.message
                };
            }
        }

        // Generate recommendations
        if (!this.systemStatus.operational) {
            diagnostics.recommendations.push('System is not operational - check component status');
        }

        if (this.systemStatus.activeRollbacks > 0) {
            diagnostics.recommendations.push('Active rollbacks detected - monitor progress');
        }

        if (!this.systemStatus.lastHealthCheck || !this.systemStatus.lastHealthCheck.healthy) {
            diagnostics.recommendations.push('System health issues detected - investigate immediately');
        }

        console.log('[RollbackSystem] Diagnostics completed');

        return diagnostics;
    }

    /**
     * Test rollback system
     */
    async testRollbackSystem() {
        console.log('[RollbackSystem] Running rollback system tests');

        try {
            const testResults = await runRollbackTests();

            console.log('[RollbackSystem] Test results:');
            console.log(`  Total: ${testResults.total}`);
            console.log(`  Passed: ${testResults.passed}`);
            console.log(`  Failed: ${testResults.failed}`);
            console.log(`  Success Rate: ${(testResults.successRate * 100).toFixed(1)}%`);

            return testResults;

        } catch (error) {
            console.error(`[RollbackSystem] Test execution failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle critical system errors
     */
    async handleCriticalError(error) {
        console.error('[RollbackSystem] Critical system error detected');

        try {
            // Create critical incident
            await this.components.incidentTracker?.createIncident({
                type: 'system_critical_error',
                severity: 'critical',
                description: `Critical system error: ${error.message}`,
                context: {
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date()
                }
            });

            // Send emergency notifications
            await this.components.notificationService?.broadcastEmergency({
                error: error.message,
                action: 'System entering safe mode'
            });

            // Consider automatic rollback of all features
            if (this.config.enableAutomatedRollbacks) {
                console.log('[RollbackSystem] Initiating emergency rollback due to critical error');
                await this.components.rollbackCoordinator?.initiateAutomatedRollback({
                    type: 'system_critical_error',
                    severity: 'critical',
                    reason: `Critical system error: ${error.message}`,
                    emergency: true
                });
            }

        } catch (handlingError) {
            console.error('[RollbackSystem] Error handling critical error:', handlingError);
        }
    }

    /**
     * Graceful system shutdown
     */
    async gracefulShutdown(signal) {
        console.log(`[RollbackSystem] Received ${signal} - initiating graceful shutdown`);

        this.systemStatus.operational = false;

        try {
            // Stop monitoring systems
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }

            if (this.components.triggerDetector) {
                this.components.triggerDetector.stopMonitoring();
            }

            if (this.components.metricsCollector) {
                this.components.metricsCollector.stopCollection();
            }

            // Wait for active rollbacks to complete (with timeout)
            if (this.systemStatus.activeRollbacks > 0) {
                console.log(`[RollbackSystem] Waiting for ${this.systemStatus.activeRollbacks} active rollbacks to complete`);

                let waitTime = 0;
                const maxWaitTime = 30000; // 30 seconds

                while (this.systemStatus.activeRollbacks > 0 && waitTime < maxWaitTime) {
                    await this.delay(1000);
                    waitTime += 1000;
                }

                if (this.systemStatus.activeRollbacks > 0) {
                    console.warn('[RollbackSystem] Shutdown timeout - some rollbacks may still be active');
                }
            }

            // Cleanup components
            for (const [name, component] of Object.entries(this.components)) {
                if (component.cleanup) {
                    try {
                        await component.cleanup();
                        console.log(`[RollbackSystem] ✓ ${name} cleaned up`);
                    } catch (error) {
                        console.error(`[RollbackSystem] ✗ ${name} cleanup failed: ${error.message}`);
                    }
                }
            }

            console.log('[RollbackSystem] Graceful shutdown completed');
            process.exit(0);

        } catch (error) {
            console.error(`[RollbackSystem] Shutdown error: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * Utility delay function
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export the main system class and factory function
module.exports = {
    RollbackSystem,
    createRollbackSystem: (config) => new RollbackSystem(config)
};