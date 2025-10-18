/**
 * Phase 4 Rollback Contingency Coordinator
 * Ensures rapid rollback capability for controlled rollout
 */

const EventEmitter = require('events');
const { FeatureFlags } = require('./FeatureFlags');
const { StateManager } = require('./StateManager');
const { HealthChecker } = require('./HealthChecker');
const { NotificationService } = require('../communication/NotificationService');
const { IncidentTracker } = require('../monitoring/IncidentTracker');

class RollbackCoordinator extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            rollbackTimeoutMs: config.rollbackTimeoutMs || 300000, // 5 minutes
            healthCheckTimeoutMs: config.healthCheckTimeoutMs || 120000, // 2 minutes
            maxRollbackRetries: config.maxRollbackRetries || 3,
            ...config
        };

        this.featureFlags = new FeatureFlags();
        this.stateManager = new StateManager();
        this.healthChecker = new HealthChecker();
        this.notificationService = new NotificationService();
        this.incidentTracker = new IncidentTracker();

        this.rollbackState = {
            isRollbackInProgress: false,
            currentRollbackId: null,
            rollbackStartTime: null,
            rollbackReason: null,
            affectedComponents: [],
            preservedState: null
        };

        this.setupEventHandlers();
    }

    /**
     * Initiate automated rollback based on trigger conditions
     */
    async initiateAutomatedRollback(trigger, context = {}) {
        const rollbackId = `auto-${Date.now()}`;

        try {
            console.log(`[RollbackCoordinator] Initiating automated rollback: ${rollbackId}`);
            console.log(`[RollbackCoordinator] Trigger: ${trigger.type}, Severity: ${trigger.severity}`);

            // Validate rollback conditions
            if (this.rollbackState.isRollbackInProgress) {
                throw new Error('Rollback already in progress');
            }

            // Start incident tracking
            const incident = await this.incidentTracker.createIncident({
                type: 'automated_rollback',
                trigger: trigger.type,
                severity: trigger.severity,
                context,
                rollbackId
            });

            // Set rollback state
            this.rollbackState = {
                isRollbackInProgress: true,
                currentRollbackId: rollbackId,
                rollbackStartTime: new Date(),
                rollbackReason: trigger.reason,
                affectedComponents: trigger.affectedComponents || [],
                preservedState: null
            };

            // Execute rollback procedure
            const result = await this.executeRollbackProcedure(rollbackId, trigger);

            // Update incident with result
            await this.incidentTracker.updateIncident(incident.id, {
                status: result.success ? 'resolved' : 'failed',
                resolution: result,
                completedAt: new Date()
            });

            return result;

        } catch (error) {
            console.error(`[RollbackCoordinator] Automated rollback failed: ${error.message}`);
            await this.handleRollbackFailure(rollbackId, error);
            throw error;
        }
    }

    /**
     * Initiate manual rollback for emergency situations
     */
    async initiateManualRollback(operator, reason, options = {}) {
        const rollbackId = `manual-${Date.now()}`;

        try {
            console.log(`[RollbackCoordinator] Initiating manual rollback: ${rollbackId}`);
            console.log(`[RollbackCoordinator] Operator: ${operator}, Reason: ${reason}`);

            // Validate operator permissions
            if (!await this.validateOperatorPermissions(operator)) {
                throw new Error('Insufficient permissions for manual rollback');
            }

            // Create manual incident
            const incident = await this.incidentTracker.createIncident({
                type: 'manual_rollback',
                operator,
                reason,
                options,
                rollbackId
            });

            // Set rollback state
            this.rollbackState = {
                isRollbackInProgress: true,
                currentRollbackId: rollbackId,
                rollbackStartTime: new Date(),
                rollbackReason: reason,
                affectedComponents: options.components || [],
                preservedState: null
            };

            // Execute rollback procedure
            const result = await this.executeRollbackProcedure(rollbackId, {
                type: 'manual',
                reason,
                operator,
                ...options
            });

            // Update incident
            await this.incidentTracker.updateIncident(incident.id, {
                status: result.success ? 'resolved' : 'failed',
                resolution: result,
                completedAt: new Date()
            });

            return result;

        } catch (error) {
            console.error(`[RollbackCoordinator] Manual rollback failed: ${error.message}`);
            await this.handleRollbackFailure(rollbackId, error);
            throw error;
        }
    }

    /**
     * Execute the complete rollback procedure
     */
    async executeRollbackProcedure(rollbackId, trigger) {
        const procedure = {
            id: rollbackId,
            steps: [],
            startTime: new Date(),
            success: false,
            error: null
        };

        try {
            // Step 1: Preserve current state
            await this.executeRollbackStep(procedure, 'preserve_state', async () => {
                this.rollbackState.preservedState = await this.stateManager.captureCurrentState();
                console.log(`[RollbackCoordinator] State preserved for rollback ${rollbackId}`);
            });

            // Step 2: Immediate notification
            await this.executeRollbackStep(procedure, 'initial_notification', async () => {
                await this.notificationService.broadcastRollbackStart({
                    rollbackId,
                    reason: trigger.reason || trigger.type,
                    expectedDuration: '5-15 minutes'
                });
            });

            // Step 3: Disable feature flags
            await this.executeRollbackStep(procedure, 'disable_features', async () => {
                await this.featureFlags.disablePhase4Features();
                console.log(`[RollbackCoordinator] Phase 4 features disabled`);
            });

            // Step 4: Handle in-flight validations
            await this.executeRollbackStep(procedure, 'handle_validations', async () => {
                await this.handleInFlightValidations(trigger.graceful !== false);
            });

            // Step 5: Restore pre-rollout state
            await this.executeRollbackStep(procedure, 'restore_state', async () => {
                await this.stateManager.restorePreRolloutState();
                console.log(`[RollbackCoordinator] Pre-rollout state restored`);
            });

            // Step 6: System health verification
            await this.executeRollbackStep(procedure, 'health_verification', async () => {
                const healthResult = await this.healthChecker.verifySystemHealth({
                    timeout: this.config.healthCheckTimeoutMs,
                    criticalOnly: true
                });

                if (!healthResult.healthy) {
                    throw new Error(`Health check failed: ${healthResult.issues.join(', ')}`);
                }
            });

            // Step 7: Final notification
            await this.executeRollbackStep(procedure, 'completion_notification', async () => {
                await this.notificationService.broadcastRollbackComplete({
                    rollbackId,
                    duration: Date.now() - procedure.startTime,
                    success: true
                });
            });

            procedure.success = true;
            procedure.completedAt = new Date();

            console.log(`[RollbackCoordinator] Rollback ${rollbackId} completed successfully in ${procedure.completedAt - procedure.startTime}ms`);

            return procedure;

        } catch (error) {
            procedure.error = error;
            procedure.completedAt = new Date();

            console.error(`[RollbackCoordinator] Rollback procedure failed: ${error.message}`);

            // Attempt emergency recovery
            await this.attemptEmergencyRecovery(rollbackId, error);

            throw error;
        } finally {
            // Reset rollback state
            this.rollbackState.isRollbackInProgress = false;
            this.rollbackState.currentRollbackId = null;
        }
    }

    /**
     * Execute individual rollback step with error handling
     */
    async executeRollbackStep(procedure, stepName, stepFunction) {
        const step = {
            name: stepName,
            startTime: new Date(),
            success: false,
            error: null
        };

        try {
            await stepFunction();
            step.success = true;
            step.completedAt = new Date();

            console.log(`[RollbackCoordinator] Step '${stepName}' completed in ${step.completedAt - step.startTime}ms`);

        } catch (error) {
            step.error = error;
            step.completedAt = new Date();

            console.error(`[RollbackCoordinator] Step '${stepName}' failed: ${error.message}`);
            throw error;
        } finally {
            procedure.steps.push(step);
        }
    }

    /**
     * Handle in-flight validation processes during rollback
     */
    async handleInFlightValidations(graceful = true) {
        if (graceful) {
            // Allow current validations to complete (with timeout)
            console.log('[RollbackCoordinator] Allowing in-flight validations to complete gracefully');
            await this.stateManager.waitForInFlightValidations(30000); // 30 second timeout
        } else {
            // Immediately cancel all validations
            console.log('[RollbackCoordinator] Canceling all in-flight validations immediately');
            await this.stateManager.cancelAllValidations();
        }
    }

    /**
     * Attempt emergency recovery if rollback fails
     */
    async attemptEmergencyRecovery(rollbackId, error) {
        console.log(`[RollbackCoordinator] Attempting emergency recovery for failed rollback ${rollbackId}`);

        try {
            // Force disable all Phase 4 features
            await this.featureFlags.forceDisableAll();

            // Emergency notification
            await this.notificationService.broadcastEmergency({
                rollbackId,
                error: error.message,
                action: 'All Phase 4 features disabled, manual intervention required'
            });

            console.log('[RollbackCoordinator] Emergency recovery completed');

        } catch (recoveryError) {
            console.error(`[RollbackCoordinator] Emergency recovery failed: ${recoveryError.message}`);

            // Ultimate fallback - system alert
            await this.notificationService.triggerSystemAlert({
                severity: 'critical',
                message: 'Rollback and emergency recovery failed - immediate manual intervention required',
                rollbackId,
                originalError: error.message,
                recoveryError: recoveryError.message
            });
        }
    }

    /**
     * Validate operator permissions for manual rollback
     */
    async validateOperatorPermissions(operator) {
        // In production, this would check against proper authorization system
        const authorizedOperators = process.env.ROLLBACK_AUTHORIZED_OPERATORS?.split(',') || ['admin', 'ops-lead'];
        return authorizedOperators.includes(operator);
    }

    /**
     * Handle rollback failures and escalation
     */
    async handleRollbackFailure(rollbackId, error) {
        console.error(`[RollbackCoordinator] Rollback ${rollbackId} failed: ${error.message}`);

        // Create critical incident
        await this.incidentTracker.createIncident({
            type: 'rollback_failure',
            severity: 'critical',
            rollbackId,
            error: error.message,
            requiresImmediateAttention: true
        });

        // Trigger system alerts
        await this.notificationService.triggerSystemAlert({
            severity: 'critical',
            message: `Rollback ${rollbackId} failed - manual intervention required`,
            error: error.message
        });

        // Emit failure event
        this.emit('rollback_failed', {
            rollbackId,
            error,
            timestamp: new Date()
        });
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        this.on('rollback_initiated', (data) => {
            console.log(`[RollbackCoordinator] Rollback initiated: ${data.rollbackId}`);
        });

        this.on('rollback_completed', (data) => {
            console.log(`[RollbackCoordinator] Rollback completed: ${data.rollbackId} in ${data.duration}ms`);
        });

        this.on('rollback_failed', (data) => {
            console.error(`[RollbackCoordinator] Rollback failed: ${data.rollbackId} - ${data.error.message}`);
        });
    }

    /**
     * Get current rollback status
     */
    getRollbackStatus() {
        return {
            ...this.rollbackState,
            uptime: this.rollbackState.rollbackStartTime ?
                Date.now() - this.rollbackState.rollbackStartTime : null
        };
    }

    /**
     * Check if system is ready for rollback
     */
    async isRollbackReady() {
        try {
            const checks = await Promise.all([
                this.featureFlags.isOperational(),
                this.stateManager.isOperational(),
                this.healthChecker.isOperational(),
                this.notificationService.isOperational()
            ]);

            return checks.every(check => check);
        } catch (error) {
            console.error(`[RollbackCoordinator] Rollback readiness check failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = { RollbackCoordinator };