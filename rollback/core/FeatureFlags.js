/**
 * Feature Flag System for Rollback Control
 * Provides immediate enable/disable capability for Phase 4 features
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class FeatureFlags extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            configPath: config.configPath || './config/feature-flags.json',
            backupPath: config.backupPath || './config/feature-flags-backup.json',
            cacheRefreshMs: config.cacheRefreshMs || 5000, // 5 seconds
            persistenceEnabled: config.persistenceEnabled !== false,
            ...config
        };

        this.flagCache = new Map();
        this.lastCacheUpdate = null;
        this.isOperational = true;

        // Phase 4 feature definitions
        this.phase4Features = {
            'completion_validation_system': {
                name: 'Completion Validation System',
                description: 'Core completion validation functionality',
                critical: true,
                dependencies: ['hook_system', 'memory_coordination']
            },
            'completion_validation_ui': {
                name: 'Completion Validation UI',
                description: 'User interface for completion validation',
                critical: false,
                dependencies: ['completion_validation_system']
            },
            'advanced_completion_metrics': {
                name: 'Advanced Completion Metrics',
                description: 'Enhanced metrics and analytics for completions',
                critical: false,
                dependencies: ['completion_validation_system']
            },
            'byzantine_consensus_validation': {
                name: 'Byzantine Consensus Validation',
                description: 'Consensus-based validation mechanism',
                critical: true,
                dependencies: ['completion_validation_system']
            },
            'intelligent_completion_suggestions': {
                name: 'Intelligent Completion Suggestions',
                description: 'AI-powered completion suggestions',
                critical: false,
                dependencies: ['completion_validation_system', 'neural_patterns']
            },
            'cross_session_completion_memory': {
                name: 'Cross-Session Completion Memory',
                description: 'Persistent completion context across sessions',
                critical: false,
                dependencies: ['memory_coordination']
            }
        };

        this.initializeFeatureFlags();
    }

    /**
     * Initialize feature flag system
     */
    async initializeFeatureFlags() {
        try {
            await this.loadFeatureFlags();
            await this.setupCacheRefresh();
            console.log('[FeatureFlags] Feature flag system initialized');
        } catch (error) {
            console.error(`[FeatureFlags] Initialization failed: ${error.message}`);
            this.isOperational = false;
        }
    }

    /**
     * Load feature flags from persistence
     */
    async loadFeatureFlags() {
        try {
            const configExists = await this.fileExists(this.config.configPath);

            if (configExists) {
                const configContent = await fs.readFile(this.config.configPath, 'utf8');
                const flags = JSON.parse(configContent);

                // Update cache with loaded flags
                Object.entries(flags).forEach(([key, value]) => {
                    this.flagCache.set(key, value);
                });

                console.log(`[FeatureFlags] Loaded ${Object.keys(flags).length} feature flags`);
            } else {
                // Create default configuration
                await this.createDefaultConfiguration();
            }

            this.lastCacheUpdate = new Date();

        } catch (error) {
            console.error(`[FeatureFlags] Error loading feature flags: ${error.message}`);
            await this.loadFromBackup();
        }
    }

    /**
     * Create default feature flag configuration
     */
    async createDefaultConfiguration() {
        const defaultFlags = {};

        // Set all Phase 4 features to disabled by default for safety
        Object.keys(this.phase4Features).forEach(featureKey => {
            defaultFlags[featureKey] = {
                enabled: false,
                rolloutPercentage: 0,
                enabledAt: null,
                disabledAt: new Date().toISOString(),
                reason: 'Default disabled for rollback safety'
            };
        });

        // Add system-level flags
        defaultFlags['rollback_system_enabled'] = {
            enabled: true,
            rolloutPercentage: 100,
            enabledAt: new Date().toISOString(),
            reason: 'Rollback system must always be enabled'
        };

        await this.persistFlags(defaultFlags);
        console.log('[FeatureFlags] Created default feature flag configuration');
    }

    /**
     * Check if feature is enabled
     */
    isFeatureEnabled(featureKey) {
        if (!this.isOperational) {
            // Fail-safe: disable all Phase 4 features if system is not operational
            return !this.isPhase4Feature(featureKey);
        }

        const flag = this.flagCache.get(featureKey);
        if (!flag) {
            // Default to disabled for unknown features
            return false;
        }

        return flag.enabled === true && (flag.rolloutPercentage || 0) > 0;
    }

    /**
     * Enable a feature flag
     */
    async enableFeature(featureKey, options = {}) {
        try {
            const currentFlag = this.flagCache.get(featureKey) || {};

            const updatedFlag = {
                ...currentFlag,
                enabled: true,
                rolloutPercentage: options.rolloutPercentage || 100,
                enabledAt: new Date().toISOString(),
                disabledAt: null,
                reason: options.reason || 'Manually enabled',
                enabledBy: options.enabledBy || 'system'
            };

            await this.updateFeatureFlag(featureKey, updatedFlag);

            console.log(`[FeatureFlags] Enabled feature: ${featureKey}`);
            this.emit('feature_enabled', { featureKey, flag: updatedFlag });

            return true;

        } catch (error) {
            console.error(`[FeatureFlags] Error enabling feature ${featureKey}: ${error.message}`);
            return false;
        }
    }

    /**
     * Disable a feature flag
     */
    async disableFeature(featureKey, options = {}) {
        try {
            const currentFlag = this.flagCache.get(featureKey) || {};

            const updatedFlag = {
                ...currentFlag,
                enabled: false,
                rolloutPercentage: 0,
                enabledAt: currentFlag.enabledAt,
                disabledAt: new Date().toISOString(),
                reason: options.reason || 'Manually disabled',
                disabledBy: options.disabledBy || 'system'
            };

            await this.updateFeatureFlag(featureKey, updatedFlag);

            console.log(`[FeatureFlags] Disabled feature: ${featureKey}`);
            this.emit('feature_disabled', { featureKey, flag: updatedFlag });

            return true;

        } catch (error) {
            console.error(`[FeatureFlags] Error disabling feature ${featureKey}: ${error.message}`);
            return false;
        }
    }

    /**
     * Disable all Phase 4 features (for rollback)
     */
    async disablePhase4Features(reason = 'Rollback initiated') {
        console.log('[FeatureFlags] Disabling all Phase 4 features for rollback');

        const results = [];

        for (const featureKey of Object.keys(this.phase4Features)) {
            try {
                const result = await this.disableFeature(featureKey, {
                    reason,
                    disabledBy: 'rollback_system'
                });
                results.push({ featureKey, success: result });
            } catch (error) {
                console.error(`[FeatureFlags] Failed to disable ${featureKey}: ${error.message}`);
                results.push({ featureKey, success: false, error: error.message });
            }
        }

        // Verify all features are disabled
        const stillEnabled = results.filter(r => !r.success || this.isFeatureEnabled(r.featureKey));

        if (stillEnabled.length > 0) {
            console.error('[FeatureFlags] Some features failed to disable:', stillEnabled);
            throw new Error(`Failed to disable features: ${stillEnabled.map(f => f.featureKey).join(', ')}`);
        }

        console.log('[FeatureFlags] All Phase 4 features successfully disabled');
        this.emit('phase4_features_disabled', { reason, timestamp: new Date() });

        return results;
    }

    /**
     * Force disable all features (emergency)
     */
    async forceDisableAll(reason = 'Emergency rollback') {
        console.log('[FeatureFlags] FORCE DISABLING ALL FEATURES - EMERGENCY MODE');

        try {
            // Clear cache and set all to disabled
            this.flagCache.clear();

            const emergencyFlags = {};
            Object.keys(this.phase4Features).forEach(featureKey => {
                emergencyFlags[featureKey] = {
                    enabled: false,
                    rolloutPercentage: 0,
                    disabledAt: new Date().toISOString(),
                    reason,
                    disabledBy: 'emergency_rollback',
                    emergencyDisable: true
                };
                this.flagCache.set(featureKey, emergencyFlags[featureKey]);
            });

            // Keep rollback system enabled
            emergencyFlags['rollback_system_enabled'] = {
                enabled: true,
                rolloutPercentage: 100,
                reason: 'Rollback system must remain operational'
            };
            this.flagCache.set('rollback_system_enabled', emergencyFlags['rollback_system_enabled']);

            await this.persistFlags(emergencyFlags);

            console.log('[FeatureFlags] Emergency disable completed');
            this.emit('emergency_disable_all', { reason, timestamp: new Date() });

        } catch (error) {
            console.error(`[FeatureFlags] Emergency disable failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update a single feature flag
     */
    async updateFeatureFlag(featureKey, flagData) {
        // Update cache
        this.flagCache.set(featureKey, flagData);
        this.lastCacheUpdate = new Date();

        // Persist to disk if enabled
        if (this.config.persistenceEnabled) {
            await this.persistCurrentFlags();
        }

        this.emit('feature_flag_updated', { featureKey, flag: flagData });
    }

    /**
     * Persist current flags to disk
     */
    async persistCurrentFlags() {
        const flags = {};
        this.flagCache.forEach((value, key) => {
            flags[key] = value;
        });
        await this.persistFlags(flags);
    }

    /**
     * Persist flags to disk with backup
     */
    async persistFlags(flags) {
        if (!this.config.persistenceEnabled) {
            return;
        }

        try {
            // Create backup of current configuration
            const configExists = await this.fileExists(this.config.configPath);
            if (configExists) {
                await fs.copyFile(this.config.configPath, this.config.backupPath);
            }

            // Write new configuration
            const configDir = path.dirname(this.config.configPath);
            await fs.mkdir(configDir, { recursive: true });

            await fs.writeFile(
                this.config.configPath,
                JSON.stringify(flags, null, 2),
                'utf8'
            );

        } catch (error) {
            console.error(`[FeatureFlags] Error persisting flags: ${error.message}`);
            throw error;
        }
    }

    /**
     * Load from backup configuration
     */
    async loadFromBackup() {
        try {
            const backupExists = await this.fileExists(this.config.backupPath);
            if (backupExists) {
                const backupContent = await fs.readFile(this.config.backupPath, 'utf8');
                const flags = JSON.parse(backupContent);

                Object.entries(flags).forEach(([key, value]) => {
                    this.flagCache.set(key, value);
                });

                console.log('[FeatureFlags] Loaded from backup configuration');
                this.emit('loaded_from_backup', { timestamp: new Date() });
            }
        } catch (error) {
            console.error(`[FeatureFlags] Error loading backup: ${error.message}`);
        }
    }

    /**
     * Setup periodic cache refresh
     */
    async setupCacheRefresh() {
        if (this.cacheRefreshInterval) {
            clearInterval(this.cacheRefreshInterval);
        }

        this.cacheRefreshInterval = setInterval(async () => {
            try {
                await this.refreshCache();
            } catch (error) {
                console.error(`[FeatureFlags] Cache refresh error: ${error.message}`);
            }
        }, this.config.cacheRefreshMs);
    }

    /**
     * Refresh flag cache from persistence
     */
    async refreshCache() {
        await this.loadFeatureFlags();
    }

    /**
     * Check if feature is a Phase 4 feature
     */
    isPhase4Feature(featureKey) {
        return featureKey in this.phase4Features;
    }

    /**
     * Get all Phase 4 features status
     */
    getPhase4Status() {
        const status = {};

        Object.keys(this.phase4Features).forEach(featureKey => {
            const flag = this.flagCache.get(featureKey);
            status[featureKey] = {
                enabled: this.isFeatureEnabled(featureKey),
                flag: flag || null,
                definition: this.phase4Features[featureKey]
            };
        });

        return status;
    }

    /**
     * Check if system is operational
     */
    isOperational() {
        return this.isOperational;
    }

    /**
     * Get system status
     */
    getSystemStatus() {
        return {
            operational: this.isOperational,
            cacheSize: this.flagCache.size,
            lastCacheUpdate: this.lastCacheUpdate,
            phase4FeaturesEnabled: Object.keys(this.phase4Features).filter(key =>
                this.isFeatureEnabled(key)
            ).length
        };
    }

    /**
     * Utility: Check if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.cacheRefreshInterval) {
            clearInterval(this.cacheRefreshInterval);
            this.cacheRefreshInterval = null;
        }
    }
}

module.exports = { FeatureFlags };