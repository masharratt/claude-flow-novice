/**
 * State Management for Rollback Operations
 * Handles state preservation and restoration during rollbacks
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class StateManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            stateStorePath: config.stateStorePath || './data/rollback-states',
            maxStateSnapshots: config.maxStateSnapshots || 10,
            validationTimeout: config.validationTimeout || 30000, // 30 seconds
            compressionEnabled: config.compressionEnabled !== false,
            encryptionEnabled: config.encryptionEnabled || false,
            ...config
        };

        this.currentState = {
            validationProcesses: new Map(),
            inFlightValidations: new Set(),
            completionState: null,
            systemMetrics: null,
            userSessions: new Map(),
            memoryState: null
        };

        this.stateHistory = [];
        this.isOperational = true;

        this.initializeStateManager();
    }

    /**
     * Initialize state management system
     */
    async initializeStateManager() {
        try {
            await fs.mkdir(this.config.stateStorePath, { recursive: true });
            await this.loadLatestState();
            console.log('[StateManager] State management system initialized');
        } catch (error) {
            console.error(`[StateManager] Initialization failed: ${error.message}`);
            this.isOperational = false;
        }
    }

    /**
     * Capture current system state for rollback
     */
    async captureCurrentState() {
        try {
            console.log('[StateManager] Capturing current system state');

            const stateSnapshot = {
                id: `state_${Date.now()}`,
                timestamp: new Date(),
                validationState: await this.captureValidationState(),
                completionState: await this.captureCompletionState(),
                systemState: await this.captureSystemState(),
                userState: await this.captureUserState(),
                memoryState: await this.captureMemoryState(),
                hookState: await this.captureHookState()
            };

            // Store state snapshot
            await this.storeStateSnapshot(stateSnapshot);

            // Update state history
            this.stateHistory.push({
                id: stateSnapshot.id,
                timestamp: stateSnapshot.timestamp,
                size: JSON.stringify(stateSnapshot).length
            });

            // Limit history size
            if (this.stateHistory.length > this.config.maxStateSnapshots) {
                const oldState = this.stateHistory.shift();
                await this.cleanupOldSnapshot(oldState.id);
            }

            console.log(`[StateManager] State snapshot captured: ${stateSnapshot.id}`);
            this.emit('state_captured', stateSnapshot);

            return stateSnapshot;

        } catch (error) {
            console.error(`[StateManager] Error capturing state: ${error.message}`);
            throw error;
        }
    }

    /**
     * Capture validation process state
     */
    async captureValidationState() {
        const validationState = {
            activeValidations: [],
            pendingValidations: [],
            completedValidations: [],
            validationQueue: [],
            validationMetrics: {}
        };

        // Capture in-flight validations
        for (const validationId of this.currentState.inFlightValidations) {
            const process = this.currentState.validationProcesses.get(validationId);
            if (process) {
                validationState.activeValidations.push({
                    id: validationId,
                    startTime: process.startTime,
                    type: process.type,
                    progress: process.progress || 0,
                    canBeCancelled: process.canBeCancelled !== false
                });
            }
        }

        return validationState;
    }

    /**
     * Capture completion system state
     */
    async captureCompletionState() {
        return {
            completionQueue: this.currentState.completionState?.queue || [],
            completionMetrics: this.currentState.completionState?.metrics || {},
            completionSettings: this.currentState.completionState?.settings || {},
            byzantineConsensusState: this.currentState.completionState?.consensus || null
        };
    }

    /**
     * Capture system-level state
     */
    async captureSystemState() {
        return {
            systemMetrics: this.currentState.systemMetrics || {},
            performanceBaseline: await this.getPerformanceBaseline(),
            featureFlags: await this.getCurrentFeatureFlags(),
            systemHealth: await this.getSystemHealth(),
            resourceUsage: await this.getResourceUsage()
        };
    }

    /**
     * Capture user session state
     */
    async captureUserState() {
        const userState = {
            activeSessions: [],
            userPreferences: {},
            userMetrics: {}
        };

        // Convert user sessions to serializable format
        for (const [sessionId, session] of this.currentState.userSessions) {
            userState.activeSessions.push({
                sessionId,
                userId: session.userId,
                startTime: session.startTime,
                lastActivity: session.lastActivity,
                preferences: session.preferences || {}
            });
        }

        return userState;
    }

    /**
     * Capture memory/cache state
     */
    async captureMemoryState() {
        return {
            cacheState: this.currentState.memoryState?.cache || {},
            sessionMemory: this.currentState.memoryState?.sessions || {},
            temporaryData: this.currentState.memoryState?.temporary || {}
        };
    }

    /**
     * Capture hook system state
     */
    async captureHookState() {
        return {
            activeHooks: [],
            hookMetrics: {},
            hookConfiguration: {}
        };
    }

    /**
     * Restore system to pre-rollout state
     */
    async restorePreRolloutState() {
        try {
            console.log('[StateManager] Restoring system to pre-rollout state');

            // Find the most recent pre-rollout state
            const preRolloutState = await this.findPreRolloutState();
            if (!preRolloutState) {
                throw new Error('No pre-rollout state found');
            }

            console.log(`[StateManager] Restoring state from: ${preRolloutState.id}`);

            // Restore each component
            await this.restoreValidationState(preRolloutState.validationState);
            await this.restoreCompletionState(preRolloutState.completionState);
            await this.restoreSystemState(preRolloutState.systemState);
            await this.restoreUserState(preRolloutState.userState);
            await this.restoreMemoryState(preRolloutState.memoryState);
            await this.restoreHookState(preRolloutState.hookState);

            console.log('[StateManager] Pre-rollout state restoration completed');
            this.emit('state_restored', preRolloutState);

            return preRolloutState;

        } catch (error) {
            console.error(`[StateManager] Error restoring pre-rollout state: ${error.message}`);
            throw error;
        }
    }

    /**
     * Wait for in-flight validations to complete
     */
    async waitForInFlightValidations(timeoutMs = 30000) {
        console.log(`[StateManager] Waiting for ${this.currentState.inFlightValidations.size} in-flight validations`);

        const startTime = Date.now();

        while (this.currentState.inFlightValidations.size > 0) {
            if (Date.now() - startTime > timeoutMs) {
                console.warn('[StateManager] Timeout waiting for validations, proceeding with cancellation');
                await this.cancelAllValidations();
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }

        console.log('[StateManager] All in-flight validations completed or cancelled');
    }

    /**
     * Cancel all validation processes immediately
     */
    async cancelAllValidations() {
        console.log(`[StateManager] Cancelling ${this.currentState.inFlightValidations.size} validation processes`);

        const cancellationPromises = [];

        for (const validationId of this.currentState.inFlightValidations) {
            const process = this.currentState.validationProcesses.get(validationId);
            if (process && process.canBeCancelled !== false) {
                cancellationPromises.push(this.cancelValidation(validationId));
            }
        }

        await Promise.all(cancellationPromises);

        // Force clear any remaining validations
        this.currentState.inFlightValidations.clear();

        console.log('[StateManager] All validations cancelled');
    }

    /**
     * Cancel a specific validation
     */
    async cancelValidation(validationId) {
        const process = this.currentState.validationProcesses.get(validationId);
        if (!process) {
            return;
        }

        try {
            if (process.controller && typeof process.controller.abort === 'function') {
                process.controller.abort();
            }

            this.currentState.inFlightValidations.delete(validationId);
            this.currentState.validationProcesses.delete(validationId);

            console.log(`[StateManager] Cancelled validation: ${validationId}`);

        } catch (error) {
            console.error(`[StateManager] Error cancelling validation ${validationId}: ${error.message}`);
        }
    }

    /**
     * Register a new validation process
     */
    registerValidation(validationId, validationData) {
        this.currentState.validationProcesses.set(validationId, {
            ...validationData,
            startTime: new Date(),
            status: 'active'
        });

        this.currentState.inFlightValidations.add(validationId);

        console.log(`[StateManager] Registered validation: ${validationId}`);
    }

    /**
     * Complete a validation process
     */
    completeValidation(validationId) {
        const process = this.currentState.validationProcesses.get(validationId);
        if (process) {
            process.status = 'completed';
            process.completedAt = new Date();
        }

        this.currentState.inFlightValidations.delete(validationId);

        console.log(`[StateManager] Completed validation: ${validationId}`);
    }

    /**
     * Store state snapshot to disk
     */
    async storeStateSnapshot(snapshot) {
        const filePath = path.join(this.config.stateStorePath, `${snapshot.id}.json`);

        let data = JSON.stringify(snapshot, null, 2);

        // Apply compression if enabled
        if (this.config.compressionEnabled) {
            data = await this.compressData(data);
        }

        // Apply encryption if enabled
        if (this.config.encryptionEnabled) {
            data = await this.encryptData(data);
        }

        await fs.writeFile(filePath, data, 'utf8');
    }

    /**
     * Load state snapshot from disk
     */
    async loadStateSnapshot(snapshotId) {
        const filePath = path.join(this.config.stateStorePath, `${snapshotId}.json`);

        let data = await fs.readFile(filePath, 'utf8');

        // Decrypt if needed
        if (this.config.encryptionEnabled) {
            data = await this.decryptData(data);
        }

        // Decompress if needed
        if (this.config.compressionEnabled) {
            data = await this.decompressData(data);
        }

        return JSON.parse(data);
    }

    /**
     * Find the most recent pre-rollout state
     */
    async findPreRolloutState() {
        // For now, return the most recent state
        // In production, this would identify states before rollout began
        if (this.stateHistory.length === 0) {
            return null;
        }

        const latestState = this.stateHistory[this.stateHistory.length - 1];
        return await this.loadStateSnapshot(latestState.id);
    }

    /**
     * Load latest available state
     */
    async loadLatestState() {
        try {
            const files = await fs.readdir(this.config.stateStorePath);
            const stateFiles = files.filter(f => f.endsWith('.json'));

            if (stateFiles.length === 0) {
                return;
            }

            // Sort by timestamp (embedded in filename)
            stateFiles.sort((a, b) => {
                const aTime = parseInt(a.replace('state_', '').replace('.json', ''));
                const bTime = parseInt(b.replace('state_', '').replace('.json', ''));
                return bTime - aTime;
            });

            // Load the most recent state
            const latestFile = stateFiles[0];
            const snapshotId = latestFile.replace('.json', '');

            console.log(`[StateManager] Loading latest state: ${snapshotId}`);

            // This would restore the system to the latest state
            // For rollback purposes, we keep it for reference only

        } catch (error) {
            console.error(`[StateManager] Error loading latest state: ${error.message}`);
        }
    }

    /**
     * Cleanup old state snapshots
     */
    async cleanupOldSnapshot(snapshotId) {
        try {
            const filePath = path.join(this.config.stateStorePath, `${snapshotId}.json`);
            await fs.unlink(filePath);
            console.log(`[StateManager] Cleaned up old snapshot: ${snapshotId}`);
        } catch (error) {
            console.error(`[StateManager] Error cleaning up snapshot ${snapshotId}: ${error.message}`);
        }
    }

    /**
     * Restore validation state
     */
    async restoreValidationState(validationState) {
        console.log('[StateManager] Restoring validation state');

        // Clear current validations
        await this.cancelAllValidations();

        // Note: In a real rollback, we might need to restore some validations
        // For safety, we start with a clean validation state
    }

    /**
     * Restore completion state
     */
    async restoreCompletionState(completionState) {
        console.log('[StateManager] Restoring completion state');
        this.currentState.completionState = completionState;
    }

    /**
     * Restore system state
     */
    async restoreSystemState(systemState) {
        console.log('[StateManager] Restoring system state');
        this.currentState.systemMetrics = systemState.systemMetrics;
    }

    /**
     * Restore user state
     */
    async restoreUserState(userState) {
        console.log('[StateManager] Restoring user state');

        this.currentState.userSessions.clear();

        userState.activeSessions.forEach(session => {
            this.currentState.userSessions.set(session.sessionId, session);
        });
    }

    /**
     * Restore memory state
     */
    async restoreMemoryState(memoryState) {
        console.log('[StateManager] Restoring memory state');
        this.currentState.memoryState = memoryState;
    }

    /**
     * Restore hook state
     */
    async restoreHookState(hookState) {
        console.log('[StateManager] Restoring hook state');
        // Hook system restoration would be handled here
    }

    /**
     * Utility methods for state capture
     */
    async getPerformanceBaseline() {
        return {}; // Would collect performance metrics
    }

    async getCurrentFeatureFlags() {
        return {}; // Would get current feature flag state
    }

    async getSystemHealth() {
        return {}; // Would collect system health metrics
    }

    async getResourceUsage() {
        return {}; // Would collect resource usage data
    }

    /**
     * Data compression (placeholder)
     */
    async compressData(data) {
        return data; // Would implement compression
    }

    async decompressData(data) {
        return data; // Would implement decompression
    }

    /**
     * Data encryption (placeholder)
     */
    async encryptData(data) {
        return data; // Would implement encryption
    }

    async decryptData(data) {
        return data; // Would implement decryption
    }

    /**
     * Check if system is operational
     */
    isOperational() {
        return this.isOperational;
    }

    /**
     * Get current state status
     */
    getStateStatus() {
        return {
            operational: this.isOperational,
            inFlightValidations: this.currentState.inFlightValidations.size,
            validationProcesses: this.currentState.validationProcesses.size,
            stateHistory: this.stateHistory.length,
            lastSnapshot: this.stateHistory.length > 0 ?
                this.stateHistory[this.stateHistory.length - 1] : null
        };
    }

    /**
     * Update system state
     */
    updateSystemState(updates) {
        Object.assign(this.currentState, updates);
        this.emit('state_updated', updates);
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.currentState.validationProcesses.clear();
        this.currentState.inFlightValidations.clear();
        this.currentState.userSessions.clear();
    }
}

module.exports = { StateManager };