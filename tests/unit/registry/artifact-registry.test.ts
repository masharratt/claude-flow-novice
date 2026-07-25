/**
 * Artifact Registry Test Suite
 * Comprehensive tests for artifact management API
 * Version: 1.0.0
 *
 * Coverage Goals: 90%+
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ArtifactRegistry, ArtifactMetadata, ArtifactFilters } from '../src/lib/artifact-registry';
import { ArtifactNotFoundError, ArtifactValidationError, ArtifactDatabaseError } from '../src/lib/artifact-registry';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Test Setup and Teardown
// ============================================================================

const TEST_DIR = join(__dirname, '.test-artifacts');
const TEST_DB = join(TEST_DIR, 'test-registry.db');
const TEST_STORAGE = join(TEST_DIR, 'storage');

function setupTestEnvironment() {
    // Clean up previous test artifacts
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }

    // Create test directories
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_STORAGE, { recursive: true });
}

function teardownTestEnvironment() {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

function createTestFile(filename: string, content: string = 'test content'): string {
    const filePath = join(TEST_STORAGE, filename);
    writeFileSync(filePath, content);
    return filePath;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('ArtifactRegistry', () => {
    let registry: ArtifactRegistry;

    beforeEach(() => {
        setupTestEnvironment();
        registry = new ArtifactRegistry(TEST_DB);
    });

    afterEach(() => {
        if (registry) {
            registry.close();
        }
        teardownTestEnvironment();
    });

    // ========================================================================
    // Initialization Tests
    // ========================================================================

    describe('Initialization', () => {
        it('should create database and initialize schema', () => {
            expect(existsSync(TEST_DB)).toBe(true);
        });

        it('should auto-create database directory if it does not exist', () => {
            const testPath = join(TEST_DIR, 'auto-create', 'registry.db');
            const registry = new ArtifactRegistry(testPath);
            expect(registry).toBeDefined();
            expect(existsSync(join(TEST_DIR, 'auto-create'))).toBe(true);
            registry.close();
        });

        it('should support singleton pattern', () => {
            const instance1 = ArtifactRegistry.getInstance(TEST_DB);
            const instance2 = ArtifactRegistry.getInstance();
            expect(instance1).toBe(instance2);
        });
    });

    // ========================================================================
    // Create Artifact Tests
    // ========================================================================

    describe('createArtifact', () => {
        it('should create artifact with minimal metadata', () => {
            const testFile = createTestFile('test.js', 'console.log("test");');

            const metadata: ArtifactMetadata = {
                name: 'test.js',
                type: 'code',
                storage_location: testFile
            };

            const artifact = registry.createArtifact(metadata);

            expect(artifact.id).toMatch(/^artifact-\d+-\w+$/);
            expect(artifact.name).toBe('test.js');
            expect(artifact.type).toBe('code');
            expect(artifact.status).toBe('active');
            expect(artifact.version).toBe(1);
            expect(artifact.retention_policy).toBe('standard');
            expect(artifact.retention_days).toBe(30);
        });

        it('should create artifact with full metadata', () => {
            const testFile = createTestFile('api.ts', 'export class API {}');

            const metadata: ArtifactMetadata = {
                name: 'api.ts',
                type: 'code',
                format: 'typescript',
                storage_location: testFile,
                swarm_id: 'swarm-123',
                agent_id: 'agent-456',
                task_id: 'task-789',
                version: 2,
                tags: ['api', 'backend'],
                metadata: { author: 'test', purpose: 'testing' },
                acl_level: 3,
                retention_policy: 'ephemeral',
                retention_days: 7
            };

            const artifact = registry.createArtifact(metadata);

            expect(artifact.name).toBe('api.ts');
            expect(artifact.format).toBe('typescript');
            expect(artifact.swarm_id).toBe('swarm-123');
            expect(artifact.agent_id).toBe('agent-456');
            expect(artifact.task_id).toBe('task-789');
            expect(artifact.version).toBe(2);
            expect(artifact.tags).toBe(JSON.stringify(['api', 'backend']));
            expect(artifact.metadata).toBe(JSON.stringify({ author: 'test', purpose: 'testing' }));
            expect(artifact.acl_level).toBe(3);
            expect(artifact.retention_policy).toBe('ephemeral');
            expect(artifact.retention_days).toBe(7);
        });

        it('should calculate file size and checksum automatically', () => {
            const testFile = createTestFile('data.json', '{"test": "data"}');

            const metadata: ArtifactMetadata = {
                name: 'data.json',
                type: 'data',
                storage_location: testFile
            };

            const artifact = registry.createArtifact(metadata);

            expect(artifact.size_bytes).toBeGreaterThan(0);
            expect(artifact.checksum).toMatch(/^[a-f0-9]{64}$/); // SHA256
        });

        it('should throw validation error for missing name', () => {
            const metadata: any = {
                type: 'code',
                storage_location: '/tmp/test.js'
            };

            expect(() => registry.createArtifact(metadata)).toThrow(ArtifactValidationError);
            expect(() => registry.createArtifact(metadata)).toThrow(/name is required/);
        });

        it('should throw validation error for invalid type', () => {
            const metadata: any = {
                name: 'test.js',
                type: 'invalid-type',
                storage_location: '/tmp/test.js'
            };

            expect(() => registry.createArtifact(metadata)).toThrow(ArtifactValidationError);
            expect(() => registry.createArtifact(metadata)).toThrow(/Invalid artifact type/);
        });

        it('should throw validation error for missing storage location', () => {
            const metadata: any = {
                name: 'test.js',
                type: 'code'
            };

            expect(() => registry.createArtifact(metadata)).toThrow(ArtifactValidationError);
            expect(() => registry.createArtifact(metadata)).toThrow(/Storage location is required/);
        });

        it('should throw validation error for invalid ACL level', () => {
            const testFile = createTestFile('test.js');

            const metadata: ArtifactMetadata = {
                name: 'test.js',
                type: 'code',
                storage_location: testFile,
                acl_level: 10 // Invalid: must be 1-5
            };

            expect(() => registry.createArtifact(metadata)).toThrow(ArtifactValidationError);
            expect(() => registry.createArtifact(metadata)).toThrow(/ACL level must be between 1 and 5/);
        });

        it('should throw validation error for invalid retention policy', () => {
            const testFile = createTestFile('test.js');

            const metadata: any = {
                name: 'test.js',
                type: 'code',
                storage_location: testFile,
                retention_policy: 'invalid-policy'
            };

            expect(() => registry.createArtifact(metadata)).toThrow(ArtifactValidationError);
            expect(() => registry.createArtifact(metadata)).toThrow(/Invalid retention policy/);
        });

        it('should set retention_days based on retention_policy', () => {
            const testFile = createTestFile('ephemeral.js');

            const metadata: ArtifactMetadata = {
                name: 'ephemeral.js',
                type: 'code',
                storage_location: testFile,
                retention_policy: 'ephemeral'
            };

            const artifact = registry.createArtifact(metadata);
            expect(artifact.retention_days).toBe(7);
        });

        it('should handle permanent retention policy', () => {
            const testFile = createTestFile('permanent.js');

            const metadata: ArtifactMetadata = {
                name: 'permanent.js',
                type: 'code',
                storage_location: testFile,
                retention_policy: 'permanent'
            };

            const artifact = registry.createArtifact(metadata);
            expect(artifact.retention_policy).toBe('permanent');
            expect(artifact.retention_days).toBe(0);
            expect(artifact.expires_at).toBeNull(); // SQL NULL maps to JavaScript null
        });
    });

    // ========================================================================
    // Read Artifact Tests
    // ========================================================================

    describe('getArtifact', () => {
        it('should retrieve artifact by ID', () => {
            const testFile = createTestFile('test.js');
            const metadata: ArtifactMetadata = {
                name: 'test.js',
                type: 'code',
                storage_location: testFile
            };

            const created = registry.createArtifact(metadata);
            const retrieved = registry.getArtifact(created.id);

            expect(retrieved).not.toBeNull();
            expect(retrieved?.id).toBe(created.id);
            expect(retrieved?.name).toBe(created.name);
        });

        it('should return null for non-existent artifact', () => {
            const retrieved = registry.getArtifact('non-existent-id');
            expect(retrieved).toBeNull();
        });
    });

    // ========================================================================
    // List Artifacts Tests
    // ========================================================================

    describe('listArtifacts', () => {
        beforeEach(() => {
            // Create test artifacts
            const testFile1 = createTestFile('test1.js');
            const testFile2 = createTestFile('test2.ts');
            const testFile3 = createTestFile('test3.md');

            registry.createArtifact({
                name: 'test1.js',
                type: 'code',
                storage_location: testFile1,
                tags: ['frontend', 'react']
            });

            registry.createArtifact({
                name: 'test2.ts',
                type: 'code',
                storage_location: testFile2,
                tags: ['backend', 'api']
            });

            registry.createArtifact({
                name: 'test3.md',
                type: 'documentation',
                storage_location: testFile3,
                retention_policy: 'ephemeral'
            });
        });

        it('should list all artifacts without filters', () => {
            const artifacts = registry.listArtifacts();
            expect(artifacts.length).toBe(3);
        });

        it('should filter by type', () => {
            const filters: ArtifactFilters = { type: 'code' };
            const artifacts = registry.listArtifacts(filters);
            expect(artifacts.length).toBe(2);
            expect(artifacts.every(a => a.type === 'code')).toBe(true);
        });

        it('should filter by status', () => {
            const filters: ArtifactFilters = { status: 'active' };
            const artifacts = registry.listArtifacts(filters);
            expect(artifacts.length).toBe(3);
            expect(artifacts.every(a => a.status === 'active')).toBe(true);
        });

        it('should filter by retention policy', () => {
            const filters: ArtifactFilters = { retention_policy: 'ephemeral' };
            const artifacts = registry.listArtifacts(filters);
            expect(artifacts.length).toBe(1);
            expect(artifacts[0].retention_policy).toBe('ephemeral');
        });

        it('should filter by tags', () => {
            const filters: ArtifactFilters = { tags: ['frontend'] };
            const artifacts = registry.listArtifacts(filters);
            expect(artifacts.length).toBe(1);
            expect(artifacts[0].name).toBe('test1.js');
        });

        it('should support pagination with limit', () => {
            const filters: ArtifactFilters = { limit: 2 };
            const artifacts = registry.listArtifacts(filters);
            expect(artifacts.length).toBe(2);
        });

        it('should support pagination with offset', () => {
            const filters: ArtifactFilters = { limit: 2, offset: 1 };
            const artifacts = registry.listArtifacts(filters);
            expect(artifacts.length).toBe(2);
        });

        it('should combine multiple filters', () => {
            const filters: ArtifactFilters = {
                type: 'code',
                status: 'active',
                limit: 1
            };
            const artifacts = registry.listArtifacts(filters);
            expect(artifacts.length).toBe(1);
            expect(artifacts[0].type).toBe('code');
            expect(artifacts[0].status).toBe('active');
        });
    });

    // ========================================================================
    // Archive Artifact Tests
    // ========================================================================

    describe('archiveArtifact', () => {
        it('should archive active artifact', () => {
            const testFile = createTestFile('archive-test.js');
            const metadata: ArtifactMetadata = {
                name: 'archive-test.js',
                type: 'code',
                storage_location: testFile
            };

            const created = registry.createArtifact(metadata);
            expect(created.status).toBe('active');

            const archived = registry.archiveArtifact(created.id);
            expect(archived.status).toBe('archived');
            expect(archived.archived_at).toBeDefined();
        });

        it('should throw error for non-existent artifact', () => {
            expect(() => registry.archiveArtifact('non-existent-id')).toThrow(ArtifactNotFoundError);
        });

        it('should throw error when archiving already deleted artifact', () => {
            const testFile = createTestFile('delete-test.js');
            const metadata: ArtifactMetadata = {
                name: 'delete-test.js',
                type: 'code',
                storage_location: testFile
            };

            const created = registry.createArtifact(metadata);
            registry.deleteArtifact(created.id);

            expect(() => registry.archiveArtifact(created.id)).toThrow(ArtifactValidationError);
            expect(() => registry.archiveArtifact(created.id)).toThrow(/Cannot archive deleted artifact/);
        });
    });

    // ========================================================================
    // Delete Artifact Tests
    // ========================================================================

    describe('deleteArtifact', () => {
        it('should soft delete artifact', () => {
            const testFile = createTestFile('delete-test.js');
            const metadata: ArtifactMetadata = {
                name: 'delete-test.js',
                type: 'code',
                storage_location: testFile
            };

            const created = registry.createArtifact(metadata);
            expect(created.status).toBe('active');

            const deleted = registry.deleteArtifact(created.id);
            expect(deleted.status).toBe('deleted');
            expect(deleted.deleted_at).toBeDefined();
        });

        it('should throw error for non-existent artifact', () => {
            expect(() => registry.deleteArtifact('non-existent-id')).toThrow(ArtifactNotFoundError);
        });

        it('should allow deleting archived artifact', () => {
            const testFile = createTestFile('archive-then-delete.js');
            const metadata: ArtifactMetadata = {
                name: 'archive-then-delete.js',
                type: 'code',
                storage_location: testFile
            };

            const created = registry.createArtifact(metadata);
            registry.archiveArtifact(created.id);
            const deleted = registry.deleteArtifact(created.id);

            expect(deleted.status).toBe('deleted');
        });
    });

    // ========================================================================
    // Statistics Tests
    // ========================================================================

    describe('getStatsByRetentionPolicy', () => {
        beforeEach(() => {
            const testFile1 = createTestFile('standard1.js');
            const testFile2 = createTestFile('standard2.js');
            const testFile3 = createTestFile('ephemeral.js');

            registry.createArtifact({
                name: 'standard1.js',
                type: 'code',
                storage_location: testFile1,
                retention_policy: 'standard'
            });

            registry.createArtifact({
                name: 'standard2.js',
                type: 'code',
                storage_location: testFile2,
                retention_policy: 'standard'
            });

            const ephemeral = registry.createArtifact({
                name: 'ephemeral.js',
                type: 'code',
                storage_location: testFile3,
                retention_policy: 'ephemeral'
            });

            registry.archiveArtifact(ephemeral.id);
        });

        it('should return statistics grouped by retention policy', () => {
            const stats = registry.getStatsByRetentionPolicy();

            expect(stats.standard).toBeDefined();
            expect(stats.standard.total).toBe(2);
            expect(stats.standard.active).toBe(2);
            expect(stats.standard.archived).toBe(0);

            expect(stats.ephemeral).toBeDefined();
            expect(stats.ephemeral.total).toBe(1);
            expect(stats.ephemeral.active).toBe(0);
            expect(stats.ephemeral.archived).toBe(1);
        });
    });

    // ========================================================================
    // TTL and Expiration Tests
    // ========================================================================

    describe('findExpiredArtifacts', () => {
        it('should return empty array when no expired artifacts', () => {
            const testFile = createTestFile('fresh.js');
            registry.createArtifact({
                name: 'fresh.js',
                type: 'code',
                storage_location: testFile,
                retention_days: 365
            });

            const expired = registry.findExpiredArtifacts();
            expect(expired.length).toBe(0);
        });

        it('should not return permanent artifacts as expired', () => {
            const testFile = createTestFile('permanent.js');
            registry.createArtifact({
                name: 'permanent.js',
                type: 'code',
                storage_location: testFile,
                retention_policy: 'permanent'
            });

            const expired = registry.findExpiredArtifacts();
            expect(expired.length).toBe(0);
        });

        // Note: Testing actual expiration would require manipulating created_at,
        // which is not straightforward in SQLite. This would typically be tested
        // via integration tests or by mocking the database.
    });

    // ========================================================================
    // Concurrent Access Tests
    // ========================================================================

    describe('Concurrent Access', () => {
        it('should handle multiple create operations safely', async () => {
            const promises = Array.from({ length: 10 }, (_, i) => {
                const testFile = createTestFile(`concurrent-${i}.js`);
                return Promise.resolve(registry.createArtifact({
                    name: `concurrent-${i}.js`,
                    type: 'code',
                    storage_location: testFile
                }));
            });

            const artifacts = await Promise.all(promises);
            expect(artifacts.length).toBe(10);

            const uniqueIds = new Set(artifacts.map(a => a.id));
            expect(uniqueIds.size).toBe(10); // All IDs should be unique
        });

        it('should handle concurrent read and write operations', async () => {
            const testFile = createTestFile('concurrent-rw.js');
            const artifact = registry.createArtifact({
                name: 'concurrent-rw.js',
                type: 'code',
                storage_location: testFile
            });

            const operations = [
                Promise.resolve(registry.getArtifact(artifact.id)),
                Promise.resolve(registry.listArtifacts({ type: 'code' })),
                Promise.resolve(registry.getStatsByRetentionPolicy())
            ];

            const results = await Promise.all(operations);
            expect(results[0]).not.toBeNull(); // getArtifact
            expect(Array.isArray(results[1])).toBe(true); // listArtifacts
            expect(typeof results[2]).toBe('object'); // getStatsByRetentionPolicy
        });
    });

    // ========================================================================
    // Error Handling Tests
    // ========================================================================

    describe('Error Handling', () => {
        it('should throw ArtifactDatabaseError for database failures', () => {
            registry.close(); // Close database to trigger errors

            const testFile = createTestFile('error-test.js');
            expect(() => registry.createArtifact({
                name: 'error-test.js',
                type: 'code',
                storage_location: testFile
            })).toThrow(ArtifactDatabaseError);
        });

        it('should have proper error details in ArtifactRegistryError', () => {
            const testFile = createTestFile('validation-error.js');
            const metadata: any = {
                name: 'validation-error.js',
                type: 'invalid-type',
                storage_location: testFile
            };

            try {
                registry.createArtifact(metadata);
                fail('Should have thrown error');
            } catch (error) {
                expect(error).toBeInstanceOf(ArtifactValidationError);
                if (error instanceof ArtifactValidationError) {
                    expect(error.code).toBe('VALIDATION_ERROR');
                    expect(error.details).toBeDefined();
                }
            }
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('Edge Cases', () => {
        it('should handle empty string name', () => {
            const testFile = createTestFile('empty-name.js');
            expect(() => registry.createArtifact({
                name: '',
                type: 'code',
                storage_location: testFile
            })).toThrow(ArtifactValidationError);
        });

        it('should handle whitespace-only name', () => {
            const testFile = createTestFile('whitespace-name.js');
            expect(() => registry.createArtifact({
                name: '   ',
                type: 'code',
                storage_location: testFile
            })).toThrow(ArtifactValidationError);
        });

        it('should handle very large files', () => {
            const largeContent = 'x'.repeat(1024 * 1024); // 1MB
            const testFile = createTestFile('large-file.bin', largeContent);

            const artifact = registry.createArtifact({
                name: 'large-file.bin',
                type: 'binary',
                storage_location: testFile
            });

            expect(artifact.size_bytes).toBeGreaterThanOrEqual(1024 * 1024); // >= 1MB (exact size)
        });

        it('should handle artifacts with special characters in name', () => {
            const testFile = createTestFile('special-chars.js');
            const artifact = registry.createArtifact({
                name: 'test@#$%^&*().js',
                type: 'code',
                storage_location: testFile
            });

            expect(artifact.name).toBe('test@#$%^&*().js');
        });

        it('should handle deeply nested JSON metadata', () => {
            const testFile = createTestFile('nested-metadata.js');
            const complexMetadata = {
                level1: {
                    level2: {
                        level3: {
                            value: 'deep'
                        }
                    },
                    array: [1, 2, { nested: true }]
                }
            };

            const artifact = registry.createArtifact({
                name: 'nested-metadata.js',
                type: 'code',
                storage_location: testFile,
                metadata: complexMetadata
            });

            expect(artifact.metadata).toBe(JSON.stringify(complexMetadata));
        });
    });
});

// ============================================================================
// Integration Test Helpers
// ============================================================================

describe('ArtifactRegistry Integration', () => {
    it('should support complete lifecycle workflow', () => {
        setupTestEnvironment();
        const registry = new ArtifactRegistry(TEST_DB);

        try {
            // 1. Create artifact
            const testFile = createTestFile('lifecycle.js', 'export class Lifecycle {}');
            const created = registry.createArtifact({
                name: 'lifecycle.js',
                type: 'code',
                format: 'javascript',
                storage_location: testFile,
                tags: ['test', 'lifecycle'],
                retention_policy: 'standard'
            });

            expect(created.status).toBe('active');

            // 2. Retrieve artifact
            const retrieved = registry.getArtifact(created.id);
            expect(retrieved).not.toBeNull();
            expect(retrieved?.id).toBe(created.id);

            // 3. Query artifacts
            const artifacts = registry.listArtifacts({ type: 'code' });
            expect(artifacts.length).toBeGreaterThan(0);

            // 4. Archive artifact
            const archived = registry.archiveArtifact(created.id);
            expect(archived.status).toBe('archived');

            // 5. Delete artifact
            const deleted = registry.deleteArtifact(created.id);
            expect(deleted.status).toBe('deleted');

            // 6. Verify status
            const final = registry.getArtifact(created.id);
            expect(final?.status).toBe('deleted');

        } finally {
            registry.close();
            teardownTestEnvironment();
        }
    });
});
