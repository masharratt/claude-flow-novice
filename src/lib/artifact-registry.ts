/**
 * Artifact Registry TypeScript API
 * Provides centralized artifact management with TTL-based cleanup
 * Version: 1.0.0
 */

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { readFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// Types and Interfaces
// ============================================================================

export type ArtifactType = 'code' | 'documentation' | 'test' | 'config' | 'binary' | 'data' | 'model' | 'report' | 'other';
export type ArtifactStatus = 'active' | 'archived' | 'deleted';
export type RetentionPolicy = 'ephemeral' | 'standard' | 'permanent' | 'custom';

export interface ArtifactMetadata {
    name: string;
    type: ArtifactType;
    format?: string;
    content?: string;
    storage_location: string;
    swarm_id?: string;
    agent_id?: string;
    task_id?: string;
    version?: number;
    parent_artifact_id?: string;
    artifact_chain?: string[];
    tags?: string[];
    metadata?: Record<string, any>;
    acl_level?: number;
    is_compressed?: boolean;
    compression_type?: string;
    retention_days?: number;
    retention_policy?: RetentionPolicy;
}

export interface Artifact {
    id: string;
    name: string;
    type: ArtifactType;
    format?: string;
    content?: string;
    content_hash?: string;
    size_bytes?: number;
    storage_location: string;
    checksum?: string;
    is_compressed: boolean;
    compression_type?: string;
    swarm_id?: string;
    agent_id?: string;
    task_id?: string;
    version: number;
    parent_artifact_id?: string;
    artifact_chain?: string;
    tags?: string;
    metadata?: string;
    acl_level: number;
    retention_days: number;
    retention_policy: RetentionPolicy;
    expires_at?: string;
    status: ArtifactStatus;
    cleanup_eligible: boolean;
    created_at: string;
    updated_at: string;
    archived_at?: string;
    deleted_at?: string;
}

export interface ArtifactFilters {
    type?: ArtifactType;
    status?: ArtifactStatus;
    retention_policy?: RetentionPolicy;
    swarm_id?: string;
    agent_id?: string;
    task_id?: string;
    tags?: string[];
    cleanup_eligible?: boolean;
    created_after?: Date;
    created_before?: Date;
    expires_before?: Date;
    limit?: number;
    offset?: number;
}

export interface ArtifactStats {
    total: number;
    active: number;
    archived: number;
    deleted: number;
    cleanup_eligible: number;
    total_size_bytes: number;
}

// ============================================================================
// Error Classes
// ============================================================================

export class ArtifactRegistryError extends Error {
    constructor(message: string, public code: string, public details?: any) {
        super(message);
        this.name = 'ArtifactRegistryError';
    }
}

export class ArtifactNotFoundError extends ArtifactRegistryError {
    constructor(id: string) {
        super(`Artifact not found: ${id}`, 'ARTIFACT_NOT_FOUND', { id });
        this.name = 'ArtifactNotFoundError';
    }
}

export class ArtifactValidationError extends ArtifactRegistryError {
    constructor(message: string, details?: any) {
        super(message, 'VALIDATION_ERROR', details);
        this.name = 'ArtifactValidationError';
    }
}

export class ArtifactDatabaseError extends ArtifactRegistryError {
    constructor(message: string, details?: any) {
        super(message, 'DATABASE_ERROR', details);
        this.name = 'ArtifactDatabaseError';
    }
}

// ============================================================================
// Artifact Registry Class
// ============================================================================

export class ArtifactRegistry {
    private db: Database.Database;
    private static instance: ArtifactRegistry | null = null;

    constructor(dbPath: string) {
        try {
            // Ensure database directory exists
            const dbDir = dirname(dbPath);
            if (!existsSync(dbDir)) {
                mkdirSync(dbDir, { recursive: true });
            }

            this.db = new Database(dbPath);
            this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for concurrency
            this.db.pragma('foreign_keys = ON');
            this.db.pragma('synchronous = NORMAL');

            this.initializeSchema();
        } catch (error) {
            throw new ArtifactDatabaseError(
                `Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`,
                { dbPath, error }
            );
        }
    }

    /**
     * Get singleton instance (optional pattern)
     */
    static getInstance(dbPath?: string): ArtifactRegistry {
        if (!ArtifactRegistry.instance) {
            if (!dbPath) {
                throw new ArtifactDatabaseError('Database path required for first initialization', {});
            }
            ArtifactRegistry.instance = new ArtifactRegistry(dbPath);
        }
        return ArtifactRegistry.instance;
    }

    /**
     * Initialize database schema
     */
    private initializeSchema(): void {
        try {
            const schemaPath = join(__dirname, '../database/artifact-registry-schema.sql');
            if (!existsSync(schemaPath)) {
                throw new Error(`Schema file not found: ${schemaPath}`);
            }

            const schema = readFileSync(schemaPath, 'utf-8');

            // Step 1: Remove multi-line comments FIRST (they can contain semicolons)
            const withoutMultiLineComments = schema.replace(/\/\*[\s\S]*?\*\//g, '');

            // Step 2: Remove single-line comments
            const cleanedSchema = withoutMultiLineComments
                .split('\n')
                .filter(line => {
                    const trimmed = line.trim();
                    return trimmed.length > 0 && !trimmed.startsWith('--');
                })
                .join('\n');

            // Step 3: Execute entire schema as one block
            // SQLite's exec() can handle multiple statements including triggers with internal semicolons
            this.db.exec(cleanedSchema);
        } catch (error) {
            throw new ArtifactDatabaseError(
                `Failed to initialize schema: ${error instanceof Error ? error.message : String(error)}`,
                { error }
            );
        }
    }

    /**
     * Generate unique artifact ID
     */
    private generateId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `artifact-${timestamp}-${random}`;
    }

    /**
     * Calculate checksum for file
     */
    private calculateChecksum(filePath: string): string {
        try {
            const content = readFileSync(filePath);
            return createHash('sha256').update(content).digest('hex');
        } catch (error) {
            throw new ArtifactValidationError(
                `Failed to calculate checksum: ${error instanceof Error ? error.message : String(error)}`,
                { filePath, error }
            );
        }
    }

    /**
     * Validate artifact metadata
     */
    private validateMetadata(metadata: ArtifactMetadata): void {
        if (!metadata.name || metadata.name.trim().length === 0) {
            throw new ArtifactValidationError('Artifact name is required');
        }

        if (!metadata.type) {
            throw new ArtifactValidationError('Artifact type is required');
        }

        const validTypes: ArtifactType[] = ['code', 'documentation', 'test', 'config', 'binary', 'data', 'model', 'report', 'other'];
        if (!validTypes.includes(metadata.type)) {
            throw new ArtifactValidationError(`Invalid artifact type: ${metadata.type}`, { validTypes });
        }

        if (!metadata.storage_location || metadata.storage_location.trim().length === 0) {
            throw new ArtifactValidationError('Storage location is required');
        }

        if (metadata.acl_level !== undefined && (metadata.acl_level < 1 || metadata.acl_level > 5)) {
            throw new ArtifactValidationError('ACL level must be between 1 and 5', { acl_level: metadata.acl_level });
        }

        if (metadata.retention_policy) {
            const validPolicies: RetentionPolicy[] = ['ephemeral', 'standard', 'permanent', 'custom'];
            if (!validPolicies.includes(metadata.retention_policy)) {
                throw new ArtifactValidationError(`Invalid retention policy: ${metadata.retention_policy}`, { validPolicies });
            }
        }
    }

    /**
     * Create new artifact
     */
    createArtifact(metadata: ArtifactMetadata): Artifact {
        try {
            // Validate metadata
            this.validateMetadata(metadata);

            // Generate ID
            const id = this.generateId();

            // Calculate file-based metadata if storage location exists
            let size_bytes: number | undefined;
            let checksum: string | undefined;
            let content_hash: string | undefined;

            if (existsSync(metadata.storage_location)) {
                const stats = statSync(metadata.storage_location);
                size_bytes = stats.size;
                checksum = this.calculateChecksum(metadata.storage_location);

                if (metadata.content) {
                    content_hash = createHash('sha256').update(metadata.content).digest('hex');
                }
            }

            // Set defaults
            const retention_days = metadata.retention_days ?? (
                metadata.retention_policy === 'ephemeral' ? 7 :
                metadata.retention_policy === 'permanent' ? 0 :
                30 // standard
            );

            const retention_policy = metadata.retention_policy ?? 'standard';

            // Prepare insert statement
            const stmt = this.db.prepare(`
                INSERT INTO artifacts (
                    id, name, type, format, content, content_hash, size_bytes,
                    storage_location, checksum, is_compressed, compression_type,
                    swarm_id, agent_id, task_id, version, parent_artifact_id,
                    artifact_chain, tags, metadata, acl_level,
                    retention_days, retention_policy, status
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?
                )
            `);

            // Execute insert
            stmt.run(
                id,
                metadata.name,
                metadata.type,
                metadata.format ?? null,
                metadata.content ?? null,
                content_hash ?? null,
                size_bytes ?? null,
                metadata.storage_location,
                checksum ?? null,
                metadata.is_compressed ? 1 : 0,
                metadata.compression_type ?? null,
                metadata.swarm_id ?? null,
                metadata.agent_id ?? null,
                metadata.task_id ?? null,
                metadata.version ?? 1,
                metadata.parent_artifact_id ?? null,
                metadata.artifact_chain ? JSON.stringify(metadata.artifact_chain) : null,
                metadata.tags ? JSON.stringify(metadata.tags) : null,
                metadata.metadata ? JSON.stringify(metadata.metadata) : null,
                metadata.acl_level ?? 2,
                retention_days,
                retention_policy,
                'active'
            );

            // Retrieve and return created artifact
            const artifact = this.getArtifact(id);
            if (!artifact) {
                throw new ArtifactDatabaseError('Failed to retrieve created artifact', { id });
            }

            return artifact;
        } catch (error) {
            if (error instanceof ArtifactRegistryError) {
                throw error;
            }
            throw new ArtifactDatabaseError(
                `Failed to create artifact: ${error instanceof Error ? error.message : String(error)}`,
                { metadata, error }
            );
        }
    }

    /**
     * Get artifact by ID
     */
    getArtifact(id: string): Artifact | null {
        try {
            const stmt = this.db.prepare('SELECT * FROM artifacts WHERE id = ?');
            const row = stmt.get(id) as Artifact | undefined;
            return row ?? null;
        } catch (error) {
            throw new ArtifactDatabaseError(
                `Failed to get artifact: ${error instanceof Error ? error.message : String(error)}`,
                { id, error }
            );
        }
    }

    /**
     * List artifacts with optional filters
     */
    listArtifacts(filters?: ArtifactFilters): Artifact[] {
        try {
            let query = 'SELECT * FROM artifacts WHERE 1=1';
            const params: any[] = [];

            if (filters) {
                if (filters.type) {
                    query += ' AND type = ?';
                    params.push(filters.type);
                }

                if (filters.status) {
                    query += ' AND status = ?';
                    params.push(filters.status);
                }

                if (filters.retention_policy) {
                    query += ' AND retention_policy = ?';
                    params.push(filters.retention_policy);
                }

                if (filters.swarm_id) {
                    query += ' AND swarm_id = ?';
                    params.push(filters.swarm_id);
                }

                if (filters.agent_id) {
                    query += ' AND agent_id = ?';
                    params.push(filters.agent_id);
                }

                if (filters.task_id) {
                    query += ' AND task_id = ?';
                    params.push(filters.task_id);
                }

                if (filters.cleanup_eligible !== undefined) {
                    query += ' AND cleanup_eligible = ?';
                    params.push(filters.cleanup_eligible ? 1 : 0);
                }

                if (filters.created_after) {
                    query += ' AND created_at >= ?';
                    params.push(filters.created_after.toISOString());
                }

                if (filters.created_before) {
                    query += ' AND created_at <= ?';
                    params.push(filters.created_before.toISOString());
                }

                if (filters.expires_before) {
                    query += ' AND expires_at IS NOT NULL AND expires_at <= ?';
                    params.push(filters.expires_before.toISOString());
                }

                if (filters.tags && filters.tags.length > 0) {
                    // JSON search for tags (SQLite JSON support)
                    for (const tag of filters.tags) {
                        query += ` AND tags LIKE ?`;
                        params.push(`%"${tag}"%`);
                    }
                }
            }

            query += ' ORDER BY created_at DESC';

            if (filters?.limit) {
                query += ' LIMIT ?';
                params.push(filters.limit);
            }

            if (filters?.offset) {
                query += ' OFFSET ?';
                params.push(filters.offset);
            }

            const stmt = this.db.prepare(query);
            return stmt.all(...params) as Artifact[];
        } catch (error) {
            throw new ArtifactDatabaseError(
                `Failed to list artifacts: ${error instanceof Error ? error.message : String(error)}`,
                { filters, error }
            );
        }
    }

    /**
     * Archive artifact (mark as archived)
     */
    archiveArtifact(id: string): Artifact {
        try {
            const artifact = this.getArtifact(id);
            if (!artifact) {
                throw new ArtifactNotFoundError(id);
            }

            if (artifact.status === 'deleted') {
                throw new ArtifactValidationError('Cannot archive deleted artifact', { id, status: artifact.status });
            }

            const stmt = this.db.prepare(`
                UPDATE artifacts
                SET status = 'archived',
                    archived_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            stmt.run(id);

            const updated = this.getArtifact(id);
            if (!updated) {
                throw new ArtifactDatabaseError('Failed to retrieve archived artifact', { id });
            }

            return updated;
        } catch (error) {
            if (error instanceof ArtifactRegistryError) {
                throw error;
            }
            throw new ArtifactDatabaseError(
                `Failed to archive artifact: ${error instanceof Error ? error.message : String(error)}`,
                { id, error }
            );
        }
    }

    /**
     * Delete artifact (soft delete - mark as deleted)
     */
    deleteArtifact(id: string): Artifact {
        try {
            const artifact = this.getArtifact(id);
            if (!artifact) {
                throw new ArtifactNotFoundError(id);
            }

            const stmt = this.db.prepare(`
                UPDATE artifacts
                SET status = 'deleted',
                    deleted_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            stmt.run(id);

            const updated = this.getArtifact(id);
            if (!updated) {
                throw new ArtifactDatabaseError('Failed to retrieve deleted artifact', { id });
            }

            return updated;
        } catch (error) {
            if (error instanceof ArtifactRegistryError) {
                throw error;
            }
            throw new ArtifactDatabaseError(
                `Failed to delete artifact: ${error instanceof Error ? error.message : String(error)}`,
                { id, error }
            );
        }
    }

    /**
     * Get artifact statistics by retention policy
     */
    getStatsByRetentionPolicy(): Record<RetentionPolicy, ArtifactStats> {
        try {
            const stmt = this.db.prepare(`
                SELECT
                    retention_policy,
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived,
                    SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) as deleted,
                    SUM(CASE WHEN cleanup_eligible = 1 THEN 1 ELSE 0 END) as cleanup_eligible,
                    COALESCE(SUM(size_bytes), 0) as total_size_bytes
                FROM artifacts
                GROUP BY retention_policy
            `);

            const rows = stmt.all() as Array<{ retention_policy: RetentionPolicy } & ArtifactStats>;
            const stats: Record<string, ArtifactStats> = {};

            for (const row of rows) {
                const { retention_policy, ...statsData } = row;
                stats[retention_policy] = statsData;
            }

            return stats as Record<RetentionPolicy, ArtifactStats>;
        } catch (error) {
            throw new ArtifactDatabaseError(
                `Failed to get statistics: ${error instanceof Error ? error.message : String(error)}`,
                { error }
            );
        }
    }

    /**
     * Find expired artifacts eligible for cleanup
     */
    findExpiredArtifacts(): Artifact[] {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM artifacts
                WHERE status = 'active'
                  AND expires_at IS NOT NULL
                  AND datetime('now') >= expires_at
                ORDER BY created_at ASC
            `);

            return stmt.all() as Artifact[];
        } catch (error) {
            throw new ArtifactDatabaseError(
                `Failed to find expired artifacts: ${error instanceof Error ? error.message : String(error)}`,
                { error }
            );
        }
    }

    /**
     * Close database connection
     */
    close(): void {
        this.db.close();
    }
}
