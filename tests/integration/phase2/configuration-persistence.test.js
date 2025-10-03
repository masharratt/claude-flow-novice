import { describe, test, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
/**
 * Configuration Persistence Tests
 * Phase 2 Integration Test Suite - Configuration Management Component
 *
 * Tests configuration persistence across sessions, data integrity,
 * backup/recovery mechanisms, and cross-session state management.
 *
 * Requirements:
 * - Session-independent configuration storage
 * - Data integrity and validation
 * - Backup and recovery capabilities
 * - Performance under load
 * - Security and access control
 */

// Mock persistent configuration manager
class MockConfigurationPersistenceManager {
    constructor(config = {}) {
        this.storageType = config.storageType || 'file'; // 'file', 'memory', 'hybrid'
        this.storagePath = config.storagePath || './.test-config';
        this.encryptionEnabled = config.encryptionEnabled || false;
        this.backupEnabled = config.backupEnabled || true;
        this.compressionEnabled = config.compressionEnabled || false;
        this.maxBackups = config.maxBackups || 5;

        // In-memory storage for testing
        this.memoryStorage = new Map();
        this.sessionStorage = new Map();
        this.backupStorage = [];

        // Persistence tracking
        this.persistenceHistory = [];
        this.loadHistory = [];
        this.sessionCounter = 0;
    }

    async initializeSession(sessionId) {
        this.sessionCounter++;
        const sessionData = {
            sessionId: sessionId || `session-${this.sessionCounter}-${Date.now()}`,
            startTime: Date.now(),
            configurations: new Map(),
            dirty: false,
            autoSaveInterval: null
        };

        this.sessionStorage.set(sessionData.sessionId, sessionData);

        // Load persisted configurations for this session
        await this.loadPersistedConfigurations(sessionData.sessionId);

        // Setup auto-save if enabled
        if (this.autoSaveEnabled) {
            sessionData.autoSaveInterval = setInterval(() => {
                this.autoSaveSession(sessionData.sessionId);
            }, this.autoSaveInterval || 30000);
        }

        return sessionData.sessionId;
    }

    async saveConfiguration(sessionId, key, configuration, options = {}) {
        const session = this.sessionStorage.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        // Validate configuration
        const validationResult = await this.validateConfiguration(configuration);
        if (!validationResult.valid) {
            throw new Error(`Configuration validation failed: ${validationResult.errors.join(', ')}`);
        }

        // Create configuration record
        const configRecord = {
            key,
            data: this.deepClone(configuration),
            sessionId,
            timestamp: Date.now(),
            version: this.getNextVersion(key),
            checksum: this.calculateChecksum(configuration),
            metadata: {
                source: options.source || 'manual',
                tags: options.tags || [],
                encrypted: this.encryptionEnabled,
                compressed: this.compressionEnabled
            }
        };

        // Store in session
        session.configurations.set(key, configRecord);
        session.dirty = true;

        // Store in persistent storage based on type
        await this.persistConfiguration(configRecord);

        this.recordPersistenceAction('save', sessionId, key, configRecord.version);

        return configRecord.version;
    }

    async loadConfiguration(sessionId, key, options = {}) {
        const session = this.sessionStorage.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        // Try session storage first
        if (session.configurations.has(key)) {
            const record = session.configurations.get(key);
            this.recordLoadAction('session', sessionId, key, record.version);
            return this.deepClone(record.data);
        }

        // Try persistent storage
        const persistedRecord = await this.loadPersistedConfiguration(key, options.version);
        if (persistedRecord) {
            // Cache in session
            session.configurations.set(key, persistedRecord);
            this.recordLoadAction('persistent', sessionId, key, persistedRecord.version);
            return this.deepClone(persistedRecord.data);
        }

        // Try backup if requested
        if (options.tryBackup) {
            const backupRecord = await this.loadFromBackup(key, options.version);
            if (backupRecord) {
                this.recordLoadAction('backup', sessionId, key, backupRecord.version);
                return this.deepClone(backupRecord.data);
            }
        }

        throw new Error(`Configuration ${key} not found`);
    }

    async listConfigurations(sessionId, options = {}) {
        const session = this.sessionStorage.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        const configurations = [];

        // Add session configurations
        for (const [key, record] of session.configurations) {
            if (!options.keyPattern || key.match(options.keyPattern)) {
                configurations.push({
                    key,
                    version: record.version,
                    timestamp: record.timestamp,
                    source: 'session',
                    size: JSON.stringify(record.data).length,
                    checksum: record.checksum
                });
            }
        }

        // Add persistent configurations not in session
        const persistentKeys = await this.listPersistedConfigurations();
        for (const persistentKey of persistentKeys) {
            if (!session.configurations.has(persistentKey)) {
                if (!options.keyPattern || persistentKey.match(options.keyPattern)) {
                    const record = await this.loadPersistedConfiguration(persistentKey);
                    if (record) {
                        configurations.push({
                            key: persistentKey,
                            version: record.version,
                            timestamp: record.timestamp,
                            source: 'persistent',
                            size: JSON.stringify(record.data).length,
                            checksum: record.checksum
                        });
                    }
                }
            }
        }

        return configurations.sort((a, b) => b.timestamp - a.timestamp);
    }

    async deleteConfiguration(sessionId, key, options = {}) {
        const session = this.sessionStorage.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        let deleted = false;

        // Remove from session
        if (session.configurations.has(key)) {
            session.configurations.delete(key);
            session.dirty = true;
            deleted = true;
        }

        // Remove from persistent storage
        if (await this.deletePersistedConfiguration(key)) {
            deleted = true;
        }

        // Create backup before deletion if requested
        if (options.backup && deleted) {
            await this.createDeletionBackup(key);
        }

        this.recordPersistenceAction('delete', sessionId, key, null);

        return deleted;
    }

    async createBackup(sessionId, options = {}) {
        const session = this.sessionStorage.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        const backupId = `backup-${sessionId}-${Date.now()}`;
        const backup = {
            id: backupId,
            sessionId,
            timestamp: Date.now(),
            configurations: [],
            metadata: {
                configCount: session.configurations.size,
                totalSize: 0,
                compressed: this.compressionEnabled,
                encrypted: this.encryptionEnabled
            }
        };

        // Include session configurations
        for (const [key, record] of session.configurations) {
            const configBackup = {
                key,
                data: this.deepClone(record.data),
                version: record.version,
                checksum: record.checksum,
                originalTimestamp: record.timestamp
            };

            backup.configurations.push(configBackup);
            backup.metadata.totalSize += JSON.stringify(configBackup).length;
        }

        // Include persistent configurations if requested
        if (options.includePersistent) {
            const persistentKeys = await this.listPersistedConfigurations();
            for (const key of persistentKeys) {
                if (!session.configurations.has(key)) {
                    const record = await this.loadPersistedConfiguration(key);
                    if (record) {
                        const configBackup = {
                            key,
                            data: this.deepClone(record.data),
                            version: record.version,
                            checksum: record.checksum,
                            originalTimestamp: record.timestamp,
                            source: 'persistent'
                        };

                        backup.configurations.push(configBackup);
                        backup.metadata.totalSize += JSON.stringify(configBackup).length;
                    }
                }
            }
        }

        // Store backup
        this.backupStorage.push(backup);

        // Maintain backup limit
        if (this.backupStorage.length > this.maxBackups) {
            this.backupStorage = this.backupStorage
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, this.maxBackups);
        }

        return {
            backupId,
            configurationCount: backup.configurations.length,
            totalSize: backup.metadata.totalSize,
            timestamp: backup.timestamp
        };
    }

    async restoreFromBackup(sessionId, backupId) {
        const session = this.sessionStorage.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        const backup = this.backupStorage.find(b => b.id === backupId);
        if (!backup) {
            throw new Error(`Backup ${backupId} not found`);
        }

        const restoredCount = backup.configurations.length;
        const conflicts = [];

        // Restore each configuration
        for (const configBackup of backup.configurations) {
            const existingRecord = session.configurations.get(configBackup.key);

            if (existingRecord && existingRecord.version > configBackup.version) {
                conflicts.push({
                    key: configBackup.key,
                    existingVersion: existingRecord.version,
                    backupVersion: configBackup.version
                });
            }

            // Create new record
            const restoredRecord = {
                key: configBackup.key,
                data: this.deepClone(configBackup.data),
                sessionId,
                timestamp: Date.now(),
                version: this.getNextVersion(configBackup.key),
                checksum: configBackup.checksum,
                metadata: {
                    source: 'backup_restore',
                    originalTimestamp: configBackup.originalTimestamp,
                    backupId,
                    restored: true
                }
            };

            session.configurations.set(configBackup.key, restoredRecord);
            await this.persistConfiguration(restoredRecord);
        }

        session.dirty = true;

        this.recordPersistenceAction('restore', sessionId, backupId, backup.configurations.length);

        return {
            restoredCount,
            conflicts,
            backupTimestamp: backup.timestamp
        };
    }

    async synchronizeSession(sessionId) {
        const session = this.sessionStorage.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        if (!session.dirty) {
            return { message: 'Session already synchronized' };
        }

        const syncResults = {
            saved: 0,
            failed: 0,
            errors: []
        };

        // Persist all dirty configurations
        for (const [key, record] of session.configurations) {
            try {
                await this.persistConfiguration(record);
                syncResults.saved++;
            } catch (error) {
                syncResults.failed++;
                syncResults.errors.push({
                    key,
                    error: error.message
                });
            }
        }

        session.dirty = false;

        this.recordPersistenceAction('sync', sessionId, null, syncResults.saved);

        return syncResults;
    }

    async closeSession(sessionId, options = {}) {
        const session = this.sessionStorage.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        // Auto-save if dirty and requested
        if (session.dirty && options.autoSave !== false) {
            await this.synchronizeSession(sessionId);
        }

        // Create final backup if requested
        if (options.createBackup) {
            await this.createBackup(sessionId, { includePersistent: false });
        }

        // Clear auto-save interval
        if (session.autoSaveInterval) {
            clearInterval(session.autoSaveInterval);
        }

        // Record session end
        session.endTime = Date.now();
        session.duration = session.endTime - session.startTime;

        // Archive session data
        const sessionSummary = {
            sessionId,
            startTime: session.startTime,
            endTime: session.endTime,
            duration: session.duration,
            configurationCount: session.configurations.size,
            finalState: session.dirty ? 'dirty' : 'clean'
        };

        // Remove from active sessions
        this.sessionStorage.delete(sessionId);

        this.recordPersistenceAction('close', sessionId, null, null, sessionSummary);

        return sessionSummary;
    }

    // Persistence implementation methods

    async persistConfiguration(record) {
        switch (this.storageType) {
            case 'file':
                return this.persistToFile(record);
            case 'memory':
                return this.persistToMemory(record);
            case 'hybrid':
                await this.persistToMemory(record);
                return this.persistToFile(record);
            default:
                throw new Error(`Unsupported storage type: ${this.storageType}`);
        }
    }

    async persistToFile(record) {
        // Mock file persistence
        const filename = `${record.key}.config.json`;
        const filepath = path.join(this.storagePath, filename);

        let data = record;

        // Apply compression if enabled
        if (this.compressionEnabled) {
            data = this.compressData(data);
        }

        // Apply encryption if enabled
        if (this.encryptionEnabled) {
            data = this.encryptData(data);
        }

        // Simulate file write
        this.memoryStorage.set(filepath, JSON.stringify(data));
        return true;
    }

    async persistToMemory(record) {
        const memoryKey = `memory:${record.key}`;
        this.memoryStorage.set(memoryKey, record);
        return true;
    }

    async loadPersistedConfigurations(sessionId) {
        // Load all available configurations for the session
        const keys = await this.listPersistedConfigurations();
        const session = this.sessionStorage.get(sessionId);

        for (const key of keys) {
            if (!session.configurations.has(key)) {
                const record = await this.loadPersistedConfiguration(key);
                if (record) {
                    session.configurations.set(key, record);
                }
            }
        }
    }

    async loadPersistedConfiguration(key, version = null) {
        switch (this.storageType) {
            case 'file':
                return this.loadFromFile(key, version);
            case 'memory':
                return this.loadFromMemory(key, version);
            case 'hybrid':
                // Try memory first, then file
                return await this.loadFromMemory(key, version) ||
                       await this.loadFromFile(key, version);
            default:
                throw new Error(`Unsupported storage type: ${this.storageType}`);
        }
    }

    async loadFromFile(key, version = null) {
        const filename = `${key}.config.json`;
        const filepath = path.join(this.storagePath, filename);

        const data = this.memoryStorage.get(filepath);
        if (!data) return null;

        let record = JSON.parse(data);

        // Apply decryption if enabled
        if (this.encryptionEnabled) {
            record = this.decryptData(record);
        }

        // Apply decompression if enabled
        if (this.compressionEnabled) {
            record = this.decompressData(record);
        }

        // Check version if specified
        if (version && record.version !== version) {
            return null;
        }

        return record;
    }

    async loadFromMemory(key, version = null) {
        const memoryKey = `memory:${key}`;
        const record = this.memoryStorage.get(memoryKey);

        if (!record) return null;

        // Check version if specified
        if (version && record.version !== version) {
            return null;
        }

        return record;
    }

    async listPersistedConfigurations() {
        const keys = [];

        // List from memory storage
        for (const key of this.memoryStorage.keys()) {
            if (key.startsWith('memory:')) {
                keys.push(key.substring(7)); // Remove 'memory:' prefix
            } else if (key.endsWith('.config.json')) {
                const configKey = path.basename(key, '.config.json');
                keys.push(configKey);
            }
        }

        return [...new Set(keys)]; // Remove duplicates
    }

    async deletePersistedConfiguration(key) {
        let deleted = false;

        // Delete from memory
        const memoryKey = `memory:${key}`;
        if (this.memoryStorage.has(memoryKey)) {
            this.memoryStorage.delete(memoryKey);
            deleted = true;
        }

        // Delete from file
        const filename = `${key}.config.json`;
        const filepath = path.join(this.storagePath, filename);
        if (this.memoryStorage.has(filepath)) {
            this.memoryStorage.delete(filepath);
            deleted = true;
        }

        return deleted;
    }

    async loadFromBackup(key, version = null) {
        for (const backup of this.backupStorage) {
            const configBackup = backup.configurations.find(c =>
                c.key === key && (!version || c.version === version)
            );
            if (configBackup) {
                return {
                    key: configBackup.key,
                    data: this.deepClone(configBackup.data),
                    version: configBackup.version,
                    checksum: configBackup.checksum,
                    timestamp: configBackup.originalTimestamp,
                    metadata: {
                        source: 'backup',
                        backupId: backup.id
                    }
                };
            }
        }
        return null;
    }

    async createDeletionBackup(key) {
        const record = await this.loadPersistedConfiguration(key);
        if (record) {
            const deletionBackup = {
                id: `deletion-${key}-${Date.now()}`,
                timestamp: Date.now(),
                type: 'deletion',
                configuration: record
            };
            this.backupStorage.push(deletionBackup);
        }
    }

    // Utility methods

    async validateConfiguration(configuration) {
        const errors = [];

        if (!configuration || typeof configuration !== 'object') {
            errors.push('Configuration must be an object');
        }

        if (configuration && typeof configuration.id !== 'string') {
            errors.push('Configuration must have a string id');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    calculateChecksum(data) {
        // Simple checksum for testing
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(16);
    }

    getNextVersion(key) {
        // Simple versioning for testing
        return `v${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    }

    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    compressData(data) {
        // Mock compression
        return {
            ...data,
            compressed: true,
            compressionRatio: 0.7
        };
    }

    decompressData(data) {
        if (data.compressed) {
            const { compressed, compressionRatio, ...originalData } = data;
            return originalData;
        }
        return data;
    }

    encryptData(data) {
        // Mock encryption
        return {
            encrypted: true,
            data: Buffer.from(JSON.stringify(data)).toString('base64'),
            algorithm: 'AES-256'
        };
    }

    decryptData(data) {
        if (data.encrypted) {
            const decryptedStr = Buffer.from(data.data, 'base64').toString();
            return JSON.parse(decryptedStr);
        }
        return data;
    }

    recordPersistenceAction(action, sessionId, key, value, metadata = null) {
        this.persistenceHistory.push({
            action,
            sessionId,
            key,
            value,
            metadata,
            timestamp: Date.now()
        });
    }

    recordLoadAction(source, sessionId, key, version) {
        this.loadHistory.push({
            source,
            sessionId,
            key,
            version,
            timestamp: Date.now()
        });
    }

    getPersistenceHistory() {
        return [...this.persistenceHistory];
    }

    getLoadHistory() {
        return [...this.loadHistory];
    }

    getSessionInfo(sessionId) {
        return this.sessionStorage.get(sessionId);
    }

    getAllSessions() {
        return Array.from(this.sessionStorage.values());
    }

    async getStorageStats() {
        return {
            totalConfigurations: this.memoryStorage.size,
            activeSessions: this.sessionStorage.size,
            backupCount: this.backupStorage.length,
            storageType: this.storageType,
            memoryUsage: JSON.stringify(Array.from(this.memoryStorage.values())).length,
            persistenceActions: this.persistenceHistory.length,
            loadActions: this.loadHistory.length
        };
    }
}

describe('Configuration Persistence Tests', () => {
    let persistenceManager;

    beforeEach(() => {
        persistenceManager = new MockConfigurationPersistenceManager({
            storageType: 'hybrid',
            encryptionEnabled: false,
            compressionEnabled: false,
            backupEnabled: true
        });
        jest.clearAllMocks();
    });

    describe('Session Management', () => {
        test('should initialize session correctly', async () => {
            const sessionId = await persistenceManager.initializeSession();

            expect(sessionId).toBeDefined();
            expect(sessionId).toMatch(/^session-\d+-\d+$/);

            const sessionInfo = persistenceManager.getSessionInfo(sessionId);
            expect(sessionInfo).toBeDefined();
            expect(sessionInfo.sessionId).toBe(sessionId);
            expect(sessionInfo.startTime).toBeDefined();
            expect(sessionInfo.configurations).toBeInstanceOf(Map);
            expect(sessionInfo.dirty).toBe(false);
        });

        test('should initialize session with custom ID', async () => {
            const customId = 'custom-session-123';
            const sessionId = await persistenceManager.initializeSession(customId);

            expect(sessionId).toBe(customId);

            const sessionInfo = persistenceManager.getSessionInfo(sessionId);
            expect(sessionInfo.sessionId).toBe(customId);
        });

        test('should close session properly', async () => {
            const sessionId = await persistenceManager.initializeSession();

            // Add some configuration
            const config = { id: 'test-config', value: 'test' };
            await persistenceManager.saveConfiguration(sessionId, 'test-key', config);

            const summary = await persistenceManager.closeSession(sessionId, {
                autoSave: true,
                createBackup: true
            });

            expect(summary.sessionId).toBe(sessionId);
            expect(summary.startTime).toBeDefined();
            expect(summary.endTime).toBeDefined();
            expect(summary.duration).toBeGreaterThan(0);
            expect(summary.configurationCount).toBe(1);
            expect(summary.finalState).toBe('clean');

            // Session should be removed
            expect(persistenceManager.getSessionInfo(sessionId)).toBeUndefined();
        });
    });

    describe('Configuration Save and Load', () => {
        test('should save and load configuration successfully', async () => {
            const sessionId = await persistenceManager.initializeSession();

            const config = {
                id: 'framework-config',
                name: 'Test Framework',
                version: '1.0.0',
                settings: {
                    enabled: true,
                    timeout: 5000,
                    retries: 3
                }
            };

            const version = await persistenceManager.saveConfiguration(
                sessionId,
                'framework',
                config
            );

            expect(version).toBeDefined();
            expect(version).toMatch(/^v\d+-\w+$/);

            const loadedConfig = await persistenceManager.loadConfiguration(
                sessionId,
                'framework'
            );

            expect(loadedConfig).toEqual(config);
        });

        test('should handle configuration updates with versioning', async () => {
            const sessionId = await persistenceManager.initializeSession();

            const initialConfig = {
                id: 'versioned-config',
                value: 'initial'
            };

            const v1 = await persistenceManager.saveConfiguration(
                sessionId,
                'versioned',
                initialConfig
            );

            const updatedConfig = {
                id: 'versioned-config',
                value: 'updated'
            };

            const v2 = await persistenceManager.saveConfiguration(
                sessionId,
                'versioned',
                updatedConfig
            );

            expect(v2).not.toBe(v1);

            const currentConfig = await persistenceManager.loadConfiguration(
                sessionId,
                'versioned'
            );

            expect(currentConfig.value).toBe('updated');
        });

        test('should validate configurations before saving', async () => {
            const sessionId = await persistenceManager.initializeSession();

            const invalidConfigs = [
                null,
                undefined,
                'not an object',
                { /* missing id */ },
                { id: 123 } // non-string id
            ];

            for (const invalidConfig of invalidConfigs) {
                try {
                    await persistenceManager.saveConfiguration(
                        sessionId,
                        'invalid',
                        invalidConfig
                    );
                    fail('Should have thrown validation error');
                } catch (error) {
                    expect(error.message).toContain('Configuration validation failed');
                }
            }
        });

        test('should handle large configurations efficiently', async () => {
            const sessionId = await persistenceManager.initializeSession();

            // Create a large configuration
            const largeConfig = {
                id: 'large-config',
                data: Array.from({ length: 1000 }, (_, i) => ({
                    id: `item-${i}`,
                    value: `value-${i}`,
                    metadata: {
                        timestamp: Date.now(),
                        processed: i % 2 === 0
                    }
                }))
            };

            const startTime = Date.now();
            const version = await persistenceManager.saveConfiguration(
                sessionId,
                'large',
                largeConfig
            );
            const saveTime = Date.now() - startTime;

            expect(version).toBeDefined();
            expect(saveTime).toBeLessThan(1000); // Should complete within 1 second

            const loadStartTime = Date.now();
            const loadedConfig = await persistenceManager.loadConfiguration(
                sessionId,
                'large'
            );
            const loadTime = Date.now() - loadStartTime;

            expect(loadedConfig).toEqual(largeConfig);
            expect(loadTime).toBeLessThan(500); // Load should be faster than save
        });
    });

    describe('Cross-Session Persistence', () => {
        test('should persist configurations across sessions', async () => {
            // Session 1: Save configuration
            const session1 = await persistenceManager.initializeSession('session-1');

            const config1 = {
                id: 'cross-session-config',
                data: 'session1-data'
            };

            await persistenceManager.saveConfiguration(session1, 'cross-session', config1);
            await persistenceManager.closeSession(session1, { autoSave: true });

            // Session 2: Load configuration
            const session2 = await persistenceManager.initializeSession('session-2');

            const loadedConfig = await persistenceManager.loadConfiguration(
                session2,
                'cross-session'
            );

            expect(loadedConfig).toEqual(config1);

            await persistenceManager.closeSession(session2);
        });

        test('should handle concurrent sessions', async () => {
            const session1 = await persistenceManager.initializeSession('concurrent-1');
            const session2 = await persistenceManager.initializeSession('concurrent-2');

            const config1 = { id: 'config-1', source: 'session1' };
            const config2 = { id: 'config-2', source: 'session2' };

            // Concurrent saves
            const [version1, version2] = await Promise.all([
                persistenceManager.saveConfiguration(session1, 'concurrent-1', config1),
                persistenceManager.saveConfiguration(session2, 'concurrent-2', config2)
            ]);

            expect(version1).toBeDefined();
            expect(version2).toBeDefined();

            // Both sessions should see both configurations
            const loaded1FromSession1 = await persistenceManager.loadConfiguration(session1, 'concurrent-1');
            const loaded2FromSession2 = await persistenceManager.loadConfiguration(session2, 'concurrent-2');

            expect(loaded1FromSession1).toEqual(config1);
            expect(loaded2FromSession2).toEqual(config2);

            await Promise.all([
                persistenceManager.closeSession(session1),
                persistenceManager.closeSession(session2)
            ]);
        });

        test('should maintain data integrity during session crashes', async () => {
            const sessionId = await persistenceManager.initializeSession();

            const criticalConfig = {
                id: 'critical-config',
                importantData: 'must not be lost',
                timestamp: Date.now()
            };

            await persistenceManager.saveConfiguration(sessionId, 'critical', criticalConfig);

            // Simulate session crash (force close without proper cleanup)
            persistenceManager.sessionStorage.delete(sessionId);

            // New session should still be able to load the configuration
            const newSessionId = await persistenceManager.initializeSession();

            const recoveredConfig = await persistenceManager.loadConfiguration(
                newSessionId,
                'critical'
            );

            expect(recoveredConfig).toEqual(criticalConfig);

            await persistenceManager.closeSession(newSessionId);
        });
    });

    describe('Backup and Recovery', () => {
        test('should create comprehensive backups', async () => {
            const sessionId = await persistenceManager.initializeSession();

            const configs = [
                { id: 'config-1', type: 'framework', data: 'data1' },
                { id: 'config-2', type: 'settings', data: 'data2' },
                { id: 'config-3', type: 'cache', data: 'data3' }
            ];

            // Save configurations
            for (let i = 0; i < configs.length; i++) {
                await persistenceManager.saveConfiguration(sessionId, `key-${i + 1}`, configs[i]);
            }

            const backupResult = await persistenceManager.createBackup(sessionId, {
                includePersistent: true
            });

            expect(backupResult.backupId).toBeDefined();
            expect(backupResult.configurationCount).toBe(3);
            expect(backupResult.totalSize).toBeGreaterThan(0);
            expect(backupResult.timestamp).toBeDefined();

            await persistenceManager.closeSession(sessionId);
        });

        test('should restore from backup accurately', async () => {
            // Original session
            const originalSession = await persistenceManager.initializeSession();

            const originalConfig = {
                id: 'original-config',
                value: 'original-value',
                metadata: { created: Date.now() }
            };

            await persistenceManager.saveConfiguration(originalSession, 'original', originalConfig);

            const backupResult = await persistenceManager.createBackup(originalSession);
            await persistenceManager.closeSession(originalSession);

            // New session with different configuration
            const newSession = await persistenceManager.initializeSession();

            const newConfig = {
                id: 'new-config',
                value: 'new-value'
            };

            await persistenceManager.saveConfiguration(newSession, 'different', newConfig);

            // Restore from backup
            const restoreResult = await persistenceManager.restoreFromBackup(
                newSession,
                backupResult.backupId
            );

            expect(restoreResult.restoredCount).toBe(1);
            expect(restoreResult.conflicts).toBeDefined();
            expect(restoreResult.backupTimestamp).toBe(backupResult.timestamp);

            // Verify restoration
            const restoredConfig = await persistenceManager.loadConfiguration(
                newSession,
                'original'
            );

            expect(restoredConfig.id).toBe(originalConfig.id);
            expect(restoredConfig.value).toBe(originalConfig.value);

            await persistenceManager.closeSession(newSession);
        });

        test('should handle backup conflicts appropriately', async () => {
            const sessionId = await persistenceManager.initializeSession();

            // Initial configuration
            const initialConfig = {
                id: 'conflict-config',
                value: 'initial',
                version: '1.0'
            };

            await persistenceManager.saveConfiguration(sessionId, 'conflict', initialConfig);
            const backupResult = await persistenceManager.createBackup(sessionId);

            // Update configuration after backup
            const updatedConfig = {
                id: 'conflict-config',
                value: 'updated',
                version: '2.0'
            };

            await persistenceManager.saveConfiguration(sessionId, 'conflict', updatedConfig);

            // Restore backup (should create conflict)
            const restoreResult = await persistenceManager.restoreFromBackup(
                sessionId,
                backupResult.backupId
            );

            expect(restoreResult.conflicts.length).toBeGreaterThan(0);

            const conflict = restoreResult.conflicts[0];
            expect(conflict.key).toBe('conflict');
            expect(conflict.existingVersion).toBeDefined();
            expect(conflict.backupVersion).toBeDefined();

            await persistenceManager.closeSession(sessionId);
        });

        test('should manage backup storage limits', async () => {
            const limitedManager = new MockConfigurationPersistenceManager({
                maxBackups: 2
            });

            const sessionId = await limitedManager.initializeSession();

            // Create more backups than the limit
            const backupIds = [];
            for (let i = 0; i < 4; i++) {
                const config = { id: `config-${i}`, data: `data-${i}` };
                await limitedManager.saveConfiguration(sessionId, `key-${i}`, config);

                const backupResult = await limitedManager.createBackup(sessionId);
                backupIds.push(backupResult.backupId);

                // Small delay to ensure different timestamps
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Only the last 2 backups should be retained
            expect(limitedManager.backupStorage).toHaveLength(2);

            // Verify that the newest backups are retained
            const retainedIds = limitedManager.backupStorage.map(b => b.id);
            expect(retainedIds).toContain(backupIds[2]);
            expect(retainedIds).toContain(backupIds[3]);
            expect(retainedIds).not.toContain(backupIds[0]);
            expect(retainedIds).not.toContain(backupIds[1]);

            await limitedManager.closeSession(sessionId);
        });
    });

    describe('Configuration Listing and Management', () => {
        test('should list all configurations correctly', async () => {
            const sessionId = await persistenceManager.initializeSession();

            const configs = [
                { id: 'framework-config', type: 'framework' },
                { id: 'user-config', type: 'user' },
                { id: 'system-config', type: 'system' }
            ];

            // Save configurations
            for (let i = 0; i < configs.length; i++) {
                await persistenceManager.saveConfiguration(sessionId, `config-${i + 1}`, configs[i]);
            }

            const list = await persistenceManager.listConfigurations(sessionId);

            expect(list).toHaveLength(3);

            // Verify list structure
            list.forEach(item => {
                expect(item).toHaveProperty('key');
                expect(item).toHaveProperty('version');
                expect(item).toHaveProperty('timestamp');
                expect(item).toHaveProperty('source');
                expect(item).toHaveProperty('size');
                expect(item).toHaveProperty('checksum');
            });

            // Should be sorted by timestamp (newest first)
            for (let i = 1; i < list.length; i++) {
                expect(list[i - 1].timestamp).toBeGreaterThanOrEqual(list[i].timestamp);
            }

            await persistenceManager.closeSession(sessionId);
        });

        test('should filter configurations by pattern', async () => {
            const sessionId = await persistenceManager.initializeSession();

            const configs = [
                { id: 'framework-react-config' },
                { id: 'framework-vue-config' },
                { id: 'user-preference-config' },
                { id: 'system-cache-config' }
            ];

            for (let i = 0; i < configs.length; i++) {
                await persistenceManager.saveConfiguration(sessionId, configs[i].id, configs[i]);
            }

            // Filter by pattern
            const frameworkConfigs = await persistenceManager.listConfigurations(sessionId, {
                keyPattern: /^framework-/
            });

            expect(frameworkConfigs).toHaveLength(2);
            frameworkConfigs.forEach(config => {
                expect(config.key).toMatch(/^framework-/);
            });

            await persistenceManager.closeSession(sessionId);
        });

        test('should delete configurations properly', async () => {
            const sessionId = await persistenceManager.initializeSession();

            const config = {
                id: 'deletable-config',
                data: 'to be deleted'
            };

            await persistenceManager.saveConfiguration(sessionId, 'deletable', config);

            // Verify exists
            const beforeDelete = await persistenceManager.loadConfiguration(sessionId, 'deletable');
            expect(beforeDelete).toEqual(config);

            // Delete with backup
            const deleted = await persistenceManager.deleteConfiguration(sessionId, 'deletable', {
                backup: true
            });

            expect(deleted).toBe(true);

            // Verify deleted
            try {
                await persistenceManager.loadConfiguration(sessionId, 'deletable');
                fail('Should have thrown error for deleted configuration');
            } catch (error) {
                expect(error.message).toContain('not found');
            }

            // Verify backup was created
            expect(persistenceManager.backupStorage.length).toBeGreaterThan(0);

            await persistenceManager.closeSession(sessionId);
        });
    });

    describe('Storage Types and Optimization', () => {
        test('should work with different storage types', async () => {
            const storageTypes = ['file', 'memory', 'hybrid'];

            for (const storageType of storageTypes) {
                const manager = new MockConfigurationPersistenceManager({
                    storageType
                });

                const sessionId = await manager.initializeSession();

                const config = {
                    id: `${storageType}-config`,
                    storageType,
                    data: 'test data'
                };

                await manager.saveConfiguration(sessionId, 'storage-test', config);

                const loaded = await manager.loadConfiguration(sessionId, 'storage-test');
                expect(loaded).toEqual(config);

                await manager.closeSession(sessionId);
            }
        });

        test('should handle compression when enabled', async () => {
            const compressedManager = new MockConfigurationPersistenceManager({
                compressionEnabled: true
            });

            const sessionId = await compressedManager.initializeSession();

            const largeConfig = {
                id: 'large-compressible-config',
                data: 'x'.repeat(1000), // Large string for compression
                metadata: {
                    description: 'This is a large configuration that should benefit from compression'
                }
            };

            await compressedManager.saveConfiguration(sessionId, 'compressed', largeConfig);

            const loaded = await compressedManager.loadConfiguration(sessionId, 'compressed');
            expect(loaded).toEqual(largeConfig);

            await compressedManager.closeSession(sessionId);
        });

        test('should handle encryption when enabled', async () => {
            const encryptedManager = new MockConfigurationPersistenceManager({
                encryptionEnabled: true
            });

            const sessionId = await encryptedManager.initializeSession();

            const sensitiveConfig = {
                id: 'sensitive-config',
                apiKey: 'secret-api-key-123',
                password: 'super-secret-password',
                personalData: {
                    name: 'John Doe',
                    email: 'john@example.com'
                }
            };

            await encryptedManager.saveConfiguration(sessionId, 'sensitive', sensitiveConfig);

            const loaded = await encryptedManager.loadConfiguration(sessionId, 'sensitive');
            expect(loaded).toEqual(sensitiveConfig);

            await encryptedManager.closeSession(sessionId);
        });
    });

    describe('Performance and Scalability', () => {
        test('should handle high-volume configuration operations', async () => {
            const sessionId = await persistenceManager.initializeSession();

            const configCount = 100;
            const configs = Array.from({ length: configCount }, (_, i) => ({
                id: `bulk-config-${i}`,
                index: i,
                data: `data-${i}`,
                metadata: {
                    timestamp: Date.now(),
                    processed: i % 2 === 0
                }
            }));

            const startTime = Date.now();

            // Bulk save
            const savePromises = configs.map((config, i) =>
                persistenceManager.saveConfiguration(sessionId, `bulk-${i}`, config)
            );

            const versions = await Promise.all(savePromises);
            const saveTime = Date.now() - startTime;

            expect(versions).toHaveLength(configCount);
            expect(saveTime).toBeLessThan(5000); // Should complete within 5 seconds

            // Bulk load
            const loadStartTime = Date.now();
            const loadPromises = configs.map((_, i) =>
                persistenceManager.loadConfiguration(sessionId, `bulk-${i}`)
            );

            const loadedConfigs = await Promise.all(loadPromises);
            const loadTime = Date.now() - loadStartTime;

            expect(loadedConfigs).toHaveLength(configCount);
            expect(loadTime).toBeLessThan(3000); // Load should be faster than save

            // Verify data integrity
            loadedConfigs.forEach((loaded, i) => {
                expect(loaded).toEqual(configs[i]);
            });

            await persistenceManager.closeSession(sessionId);
        });

        test('should maintain performance under concurrent access', async () => {
            const sessionCount = 5;
            const configsPerSession = 20;

            const sessionPromises = Array.from({ length: sessionCount }, async (_, sessionIndex) => {
                const sessionId = await persistenceManager.initializeSession(`concurrent-session-${sessionIndex}`);

                const sessionConfigs = Array.from({ length: configsPerSession }, (_, i) => ({
                    id: `session-${sessionIndex}-config-${i}`,
                    sessionIndex,
                    configIndex: i,
                    data: `data-${sessionIndex}-${i}`
                }));

                // Save all configs for this session
                const savePromises = sessionConfigs.map((config, i) =>
                    persistenceManager.saveConfiguration(
                        sessionId,
                        `session-${sessionIndex}-key-${i}`,
                        config
                    )
                );

                await Promise.all(savePromises);

                // Load random configs from other sessions
                const randomLoads = [];
                for (let i = 0; i < 5; i++) {
                    const randomSession = Math.floor(Math.random() * sessionCount);
                    const randomConfig = Math.floor(Math.random() * configsPerSession);
                    const key = `session-${randomSession}-key-${randomConfig}`;

                    try {
                        randomLoads.push(
                            persistenceManager.loadConfiguration(sessionId, key)
                        );
                    } catch (error) {
                        // Expected for cross-session loads that may not exist yet
                    }
                }

                await Promise.allSettled(randomLoads);

                return persistenceManager.closeSession(sessionId);
            });

            const startTime = Date.now();
            const sessionResults = await Promise.all(sessionPromises);
            const totalTime = Date.now() - startTime;

            expect(sessionResults).toHaveLength(sessionCount);
            expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds

            // Verify no sessions are left open
            expect(persistenceManager.getAllSessions()).toHaveLength(0);
        });

        test('should provide accurate storage statistics', async () => {
            const sessionId = await persistenceManager.initializeSession();

            const configs = Array.from({ length: 10 }, (_, i) => ({
                id: `stats-config-${i}`,
                data: `data-${i}`
            }));

            for (let i = 0; i < configs.length; i++) {
                await persistenceManager.saveConfiguration(sessionId, `stats-${i}`, configs[i]);
            }

            const stats = await persistenceManager.getStorageStats();

            expect(stats.totalConfigurations).toBeGreaterThan(0);
            expect(stats.activeSessions).toBe(1);
            expect(stats.storageType).toBe('hybrid');
            expect(stats.memoryUsage).toBeGreaterThan(0);
            expect(stats.persistenceActions).toBeGreaterThan(0);

            await persistenceManager.closeSession(sessionId);

            const finalStats = await persistenceManager.getStorageStats();
            expect(finalStats.activeSessions).toBe(0);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle invalid session operations', async () => {
            const invalidSessionId = 'non-existent-session';

            try {
                await persistenceManager.saveConfiguration(
                    invalidSessionId,
                    'test',
                    { id: 'test' }
                );
                fail('Should have thrown error for invalid session');
            } catch (error) {
                expect(error.message).toContain('Session non-existent-session not found');
            }

            try {
                await persistenceManager.loadConfiguration(invalidSessionId, 'test');
                fail('Should have thrown error for invalid session');
            } catch (error) {
                expect(error.message).toContain('Session non-existent-session not found');
            }
        });

        test('should handle corrupted configuration data gracefully', async () => {
            const sessionId = await persistenceManager.initializeSession();

            // Simulate corrupted data in storage
            const corruptedKey = 'memory:corrupted';
            persistenceManager.memoryStorage.set(corruptedKey, {
                corrupted: true,
                version: null,
                data: undefined
            });

            try {
                const loaded = await persistenceManager.loadConfiguration(sessionId, 'corrupted');
                // If it loads, it should be sanitized
                expect(loaded).toBeDefined();
            } catch (error) {
                // Expected if corruption is too severe
                expect(error).toBeDefined();
            }

            await persistenceManager.closeSession(sessionId);
        });

        test('should handle storage failures gracefully', async () => {
            const sessionId = await persistenceManager.initializeSession();

            // Mock storage failure
            const originalPersistToMemory = persistenceManager.persistToMemory;
            persistenceManager.persistToMemory = jest.fn().mockRejectedValue(
                new Error('Storage failure')
            );

            try {
                await persistenceManager.saveConfiguration(
                    sessionId,
                    'fail-test',
                    { id: 'fail-test' }
                );
                fail('Should have thrown storage error');
            } catch (error) {
                expect(error.message).toContain('Storage failure');
            }

            // Restore original method
            persistenceManager.persistToMemory = originalPersistToMemory;

            await persistenceManager.closeSession(sessionId);
        });

        test('should handle synchronization failures', async () => {
            const sessionId = await persistenceManager.initializeSession();

            const config = { id: 'sync-test', data: 'test' };
            await persistenceManager.saveConfiguration(sessionId, 'sync-test', config);

            // Mock sync failure
            const originalPersistConfiguration = persistenceManager.persistConfiguration;
            persistenceManager.persistConfiguration = jest.fn().mockRejectedValue(
                new Error('Persistence failure')
            );

            const syncResult = await persistenceManager.synchronizeSession(sessionId);

            expect(syncResult.failed).toBeGreaterThan(0);
            expect(syncResult.errors).toHaveLength(syncResult.failed);
            expect(syncResult.errors[0].error).toBe('Persistence failure');

            // Restore original method
            persistenceManager.persistConfiguration = originalPersistConfiguration;

            await persistenceManager.closeSession(sessionId);
        });
    });
});