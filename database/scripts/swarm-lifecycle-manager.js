#!/usr/bin/env node

/**
 * Multi-Swarm Lifecycle Management System
 * Handles creation, scaling, monitoring, and termination of swarms
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class SwarmLifecycleManager {
    constructor() {
        this.configPath = './database/configs/swarm-memory-allocation.json';
        this.namespaceConfigPath = './database/configs/namespace-isolation.json';
        this.coordDbPath = './database/instances/coordination/cross_swarm_coordination.db';
        this.config = null;
        this.namespaceConfig = null;
    }

    async initialize() {
        console.log('🚀 Initializing Swarm Lifecycle Manager...');

        try {
            this.config = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
            this.namespaceConfig = JSON.parse(await fs.readFile(this.namespaceConfigPath, 'utf8'));
            console.log('✅ Configuration loaded');
        } catch (error) {
            throw new Error(`Failed to load configuration: ${error.message}`);
        }
    }

    async createSwarm(environment, options = {}) {
        console.log(`🆕 Creating new swarm: ${environment}`);

        const swarmConfig = this.config.swarm_environments[environment];
        if (!swarmConfig) {
            throw new Error(`Unknown environment: ${environment}`);
        }

        const swarmId = `${environment}_swarm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            // Register swarm in coordination database
            await this.registerSwarm(swarmId, environment, swarmConfig);

            // Create swarm-specific database
            await this.createSwarmDatabase(swarmId, environment, swarmConfig);

            // Initialize monitoring
            await this.initializeSwarmMonitoring(swarmId, environment);

            // Apply security and isolation settings
            await this.applySecuritySettings(swarmId, environment);

            console.log(`✅ Swarm created: ${swarmId}`);
            return { swarmId, environment, status: 'active' };

        } catch (error) {
            console.error(`❌ Failed to create swarm ${swarmId}:`, error.message);
            await this.cleanupFailedSwarm(swarmId);
            throw error;
        }
    }

    async registerSwarm(swarmId, environment, swarmConfig) {
        const namespaceConfig = this.namespaceConfig.swarm_namespaces[environment];

        const registerQuery = `
            INSERT INTO swarm_registry (
                swarm_id, swarm_name, environment, memory_allocation_mb,
                max_agents, namespace_prefix, isolation_level, created_at,
                endpoint_url, health_check_interval_seconds
            ) VALUES (
                '${swarmId}',
                '${environment}_swarm',
                '${environment}',
                ${swarmConfig.base_memory_gb * 1024},
                ${swarmConfig.max_agents},
                '${namespaceConfig.namespace_prefix}',
                '${swarmConfig.isolation_level}',
                CURRENT_TIMESTAMP,
                'local://${environment}',
                30
            )
        `;

        execSync(`sqlite3 "${this.coordDbPath}" "${registerQuery}"`);
        console.log(`  📝 Swarm registered in coordination database`);
    }

    async createSwarmDatabase(swarmId, environment, swarmConfig) {
        const namespaceConfig = this.namespaceConfig.swarm_namespaces[environment];
        const dbPath = `./database/instances/${environment}/${swarmId}.db`;

        // Ensure directory exists
        await fs.mkdir(path.dirname(dbPath), { recursive: true });

        // Create database with optimized settings
        const initScript = this.generateSwarmSchema(swarmId, environment, swarmConfig, namespaceConfig);
        const scriptPath = `./database/instances/${environment}/${swarmId}_init.sql`;

        await fs.writeFile(scriptPath, initScript);
        execSync(`sqlite3 "${dbPath}" < "${scriptPath}"`);
        await fs.unlink(scriptPath);

        console.log(`  🗄️  Database created: ${dbPath}`);
    }

    generateSwarmSchema(swarmId, environment, swarmConfig, namespaceConfig) {
        const prefix = namespaceConfig.table_prefix;

        return `
-- Swarm Database Schema for ${swarmId}
-- Environment: ${environment}
-- Memory: ${swarmConfig.base_memory_gb}GB base, ${swarmConfig.max_memory_gb}GB max

-- Performance optimization
PRAGMA cache_size = -${swarmConfig.base_memory_gb * 1024 * 256};
PRAGMA temp_store = MEMORY;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = ${environment === 'production' ? 'FULL' : 'NORMAL'};
PRAGMA page_size = 65536;
PRAGMA mmap_size = ${swarmConfig.base_memory_gb * 1024 * 1024 * 1024};
PRAGMA wal_autocheckpoint = 1000;

-- Core swarm tables
CREATE TABLE swarm_metadata (
    swarm_id TEXT PRIMARY KEY DEFAULT '${swarmId}',
    environment TEXT NOT NULL DEFAULT '${environment}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    memory_allocation_mb INTEGER DEFAULT ${swarmConfig.base_memory_gb * 1024},
    max_agents INTEGER DEFAULT ${swarmConfig.max_agents},
    current_agent_count INTEGER DEFAULT 0,
    last_health_check TIMESTAMP,
    performance_score REAL DEFAULT 1.0
);

CREATE TABLE ${prefix}agents (
    agent_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${swarmId}',
    agent_type TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    capabilities TEXT, -- JSON array
    status TEXT DEFAULT 'active',
    memory_usage_mb INTEGER DEFAULT 0,
    cpu_usage_percent REAL DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    performance_metrics TEXT, -- JSON
    task_queue_size INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 1.0
);

CREATE TABLE ${prefix}tasks (
    task_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${swarmId}',
    assigned_agent_id TEXT,
    task_type TEXT NOT NULL,
    task_description TEXT NOT NULL,
    priority INTEGER DEFAULT 5,
    status TEXT DEFAULT 'pending',
    dependencies TEXT, -- JSON array
    estimated_duration_minutes INTEGER,
    actual_duration_minutes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    result_data TEXT, -- JSON
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    FOREIGN KEY (assigned_agent_id) REFERENCES ${prefix}agents(agent_id)
);

CREATE TABLE ${prefix}memory_store (
    memory_key TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${swarmId}',
    namespace TEXT NOT NULL DEFAULT '${namespaceConfig.namespace_prefix}',
    value_data TEXT NOT NULL,
    value_type TEXT DEFAULT 'json',
    ttl_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP,
    size_bytes INTEGER,
    compression_enabled BOOLEAN DEFAULT FALSE
);

CREATE TABLE ${prefix}performance_metrics (
    metric_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${swarmId}',
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metric_unit TEXT,
    tags TEXT, -- JSON
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    retention_days INTEGER DEFAULT 30
);

CREATE TABLE ${prefix}communication_logs (
    log_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${swarmId}',
    communication_type TEXT NOT NULL,
    peer_swarm_id TEXT,
    message_type TEXT NOT NULL,
    message_content TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_details TEXT
);

-- Lifecycle management tables
CREATE TABLE ${prefix}scaling_history (
    scaling_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${swarmId}',
    scaling_action TEXT NOT NULL, -- scale_up, scale_down, auto_scale
    trigger_reason TEXT NOT NULL,
    agents_before INTEGER,
    agents_after INTEGER,
    memory_before_mb INTEGER,
    memory_after_mb INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INTEGER,
    success BOOLEAN DEFAULT TRUE
);

CREATE TABLE ${prefix}health_checks (
    check_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${swarmId}',
    check_type TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_time_ms INTEGER,
    resource_usage TEXT -- JSON
);

-- Indexes for performance
CREATE INDEX idx_${prefix}agents_status ON ${prefix}agents(status);
CREATE INDEX idx_${prefix}agents_type ON ${prefix}agents(agent_type);
CREATE INDEX idx_${prefix}tasks_status ON ${prefix}tasks(status);
CREATE INDEX idx_${prefix}tasks_priority ON ${prefix}tasks(priority);
CREATE INDEX idx_${prefix}memory_namespace ON ${prefix}memory_store(namespace);
CREATE INDEX idx_${prefix}memory_expires ON ${prefix}memory_store(expires_at);
CREATE INDEX idx_${prefix}metrics_name ON ${prefix}performance_metrics(metric_name);
CREATE INDEX idx_${prefix}metrics_timestamp ON ${prefix}performance_metrics(timestamp);
CREATE INDEX idx_${prefix}scaling_timestamp ON ${prefix}scaling_history(timestamp);
CREATE INDEX idx_${prefix}health_timestamp ON ${prefix}health_checks(timestamp);

-- Insert initial metadata
INSERT INTO swarm_metadata (swarm_id, environment, status, memory_allocation_mb, max_agents)
VALUES ('${swarmId}', '${environment}', 'active', ${swarmConfig.base_memory_gb * 1024}, ${swarmConfig.max_agents});

-- Insert initial performance baseline
INSERT INTO ${prefix}performance_metrics (
    metric_id, metric_name, metric_value, metric_unit, tags
) VALUES
    ('init_${Date.now()}_1', 'memory_allocated_mb', ${swarmConfig.base_memory_gb * 1024}, 'MB', '{"type":"baseline"}'),
    ('init_${Date.now()}_2', 'max_agents_configured', ${swarmConfig.max_agents}, 'count', '{"type":"baseline"}'),
    ('init_${Date.now()}_3', 'isolation_level_numeric', ${swarmConfig.isolation_level === 'strict' ? 3 : swarmConfig.isolation_level === 'moderate' ? 2 : 1}, 'level', '{"type":"baseline"}');
`;
    }

    async scaleSwarm(swarmId, targetAgentCount, targetMemoryGB) {
        console.log(`📈 Scaling swarm ${swarmId} to ${targetAgentCount} agents, ${targetMemoryGB}GB`);

        try {
            // Get current swarm state
            const currentState = await this.getSwarmState(swarmId);

            // Validate scaling parameters
            await this.validateScalingParameters(swarmId, targetAgentCount, targetMemoryGB);

            // Record scaling event
            await this.recordScalingEvent(swarmId, 'manual_scale', currentState, {
                agents: targetAgentCount,
                memory_gb: targetMemoryGB
            });

            // Update swarm configuration
            await this.updateSwarmConfiguration(swarmId, targetAgentCount, targetMemoryGB);

            // Update coordination database
            await this.updateCoordinationRegistry(swarmId, targetAgentCount, targetMemoryGB);

            console.log(`✅ Swarm ${swarmId} scaled successfully`);
            return { swarmId, newAgentCount: targetAgentCount, newMemoryGB: targetMemoryGB };

        } catch (error) {
            console.error(`❌ Failed to scale swarm ${swarmId}:`, error.message);
            throw error;
        }
    }

    async getSwarmState(swarmId) {
        const environment = swarmId.split('_')[0];
        const dbPath = `./database/instances/${environment}/${swarmId}.db`;

        try {
            const query = `
                SELECT
                    current_agent_count,
                    memory_allocation_mb,
                    status,
                    performance_score
                FROM swarm_metadata
                WHERE swarm_id = '${swarmId}'
            `;

            const result = execSync(`sqlite3 "${dbPath}" "${query}"`, { encoding: 'utf8' });
            const [agentCount, memoryMB, status, performanceScore] = result.trim().split('|');

            return {
                agentCount: parseInt(agentCount) || 0,
                memoryMB: parseInt(memoryMB) || 0,
                status: status || 'unknown',
                performanceScore: parseFloat(performanceScore) || 0.0
            };
        } catch (error) {
            throw new Error(`Failed to get swarm state: ${error.message}`);
        }
    }

    async validateScalingParameters(swarmId, targetAgentCount, targetMemoryGB) {
        const environment = swarmId.split('_')[0];
        const swarmConfig = this.config.swarm_environments[environment];

        if (targetAgentCount > swarmConfig.max_agents) {
            throw new Error(`Target agent count ${targetAgentCount} exceeds maximum ${swarmConfig.max_agents}`);
        }

        if (targetMemoryGB > swarmConfig.max_memory_gb) {
            throw new Error(`Target memory ${targetMemoryGB}GB exceeds maximum ${swarmConfig.max_memory_gb}GB`);
        }

        // Check system-wide memory constraints
        const totalAllocated = await this.getTotalMemoryAllocated();
        const availableMemory = this.config.system_specs.available_for_swarms_gb;

        if (totalAllocated + targetMemoryGB > availableMemory) {
            throw new Error(`Insufficient system memory. Available: ${availableMemory}GB, Required: ${totalAllocated + targetMemoryGB}GB`);
        }
    }

    async getTotalMemoryAllocated() {
        try {
            const query = `SELECT SUM(memory_allocation_mb) / 1024.0 as total_gb FROM swarm_registry WHERE status = 'active'`;
            const result = execSync(`sqlite3 "${this.coordDbPath}" "${query}"`, { encoding: 'utf8' });
            return parseFloat(result.trim()) || 0;
        } catch (error) {
            console.warn('Failed to get total memory allocation:', error.message);
            return 0;
        }
    }

    async recordScalingEvent(swarmId, reason, currentState, targetState) {
        const environment = swarmId.split('_')[0];
        const dbPath = `./database/instances/${environment}/${swarmId}.db`;
        const prefix = this.namespaceConfig.swarm_namespaces[environment].table_prefix;

        const scalingId = `scaling_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const insertQuery = `
            INSERT INTO ${prefix}scaling_history (
                scaling_id, swarm_id, scaling_action, trigger_reason,
                agents_before, agents_after, memory_before_mb, memory_after_mb,
                timestamp
            ) VALUES (
                '${scalingId}',
                '${swarmId}',
                'scale_operation',
                '${reason}',
                ${currentState.agentCount},
                ${targetState.agents},
                ${currentState.memoryMB},
                ${targetState.memory_gb * 1024},
                CURRENT_TIMESTAMP
            )
        `;

        execSync(`sqlite3 "${dbPath}" "${insertQuery}"`);
    }

    async updateSwarmConfiguration(swarmId, targetAgentCount, targetMemoryGB) {
        const environment = swarmId.split('_')[0];
        const dbPath = `./database/instances/${environment}/${swarmId}.db`;

        const updateQuery = `
            UPDATE swarm_metadata
            SET
                current_agent_count = ${targetAgentCount},
                memory_allocation_mb = ${targetMemoryGB * 1024},
                last_health_check = CURRENT_TIMESTAMP
            WHERE swarm_id = '${swarmId}'
        `;

        execSync(`sqlite3 "${dbPath}" "${updateQuery}"`);

        // Update SQLite cache size based on new memory allocation
        const newCacheSize = targetMemoryGB * 1024 * 256; // Convert GB to pages
        const pragmaQuery = `PRAGMA cache_size = -${newCacheSize}`;
        execSync(`sqlite3 "${dbPath}" "${pragmaQuery}"`);
    }

    async updateCoordinationRegistry(swarmId, targetAgentCount, targetMemoryGB) {
        const updateQuery = `
            UPDATE swarm_registry
            SET
                memory_allocation_mb = ${targetMemoryGB * 1024},
                max_agents = ${targetAgentCount},
                last_activity = CURRENT_TIMESTAMP
            WHERE swarm_id = '${swarmId}'
        `;

        execSync(`sqlite3 "${this.coordDbPath}" "${updateQuery}"`);
    }

    async terminateSwarm(swarmId, graceful = true) {
        console.log(`🛑 Terminating swarm ${swarmId} (graceful: ${graceful})`);

        try {
            if (graceful) {
                // Graceful shutdown: complete running tasks
                await this.gracefulShutdown(swarmId);
            }

            // Update swarm status
            await this.updateSwarmStatus(swarmId, 'terminated');

            // Archive swarm data
            await this.archiveSwarmData(swarmId);

            // Clean up resources
            await this.cleanupSwarmResources(swarmId);

            console.log(`✅ Swarm ${swarmId} terminated successfully`);
            return { swarmId, status: 'terminated', timestamp: new Date().toISOString() };

        } catch (error) {
            console.error(`❌ Failed to terminate swarm ${swarmId}:`, error.message);
            throw error;
        }
    }

    async gracefulShutdown(swarmId) {
        console.log(`  ⏳ Performing graceful shutdown for ${swarmId}...`);

        const environment = swarmId.split('_')[0];
        const dbPath = `./database/instances/${environment}/${swarmId}.db`;
        const prefix = this.namespaceConfig.swarm_namespaces[environment].table_prefix;

        // Wait for running tasks to complete (with timeout)
        const timeout = 300; // 5 minutes
        const startTime = Date.now();

        while (Date.now() - startTime < timeout * 1000) {
            const runningTasksQuery = `SELECT COUNT(*) FROM ${prefix}tasks WHERE status IN ('assigned', 'in_progress')`;
            const result = execSync(`sqlite3 "${dbPath}" "${runningTasksQuery}"`, { encoding: 'utf8' });
            const runningTasks = parseInt(result.trim());

            if (runningTasks === 0) {
                console.log(`    ✅ All tasks completed`);
                break;
            }

            console.log(`    ⏳ Waiting for ${runningTasks} tasks to complete...`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        }

        // Cancel any remaining pending tasks
        const cancelQuery = `UPDATE ${prefix}tasks SET status = 'cancelled' WHERE status = 'pending'`;
        execSync(`sqlite3 "${dbPath}" "${cancelQuery}"`);
    }

    async updateSwarmStatus(swarmId, status) {
        const environment = swarmId.split('_')[0];
        const dbPath = `./database/instances/${environment}/${swarmId}.db`;

        // Update local swarm metadata
        const localUpdate = `UPDATE swarm_metadata SET status = '${status}' WHERE swarm_id = '${swarmId}'`;
        execSync(`sqlite3 "${dbPath}" "${localUpdate}"`);

        // Update coordination registry
        const coordUpdate = `UPDATE swarm_registry SET status = '${status}' WHERE swarm_id = '${swarmId}'`;
        execSync(`sqlite3 "${this.coordDbPath}" "${coordUpdate}"`);
    }

    async archiveSwarmData(swarmId) {
        const environment = swarmId.split('_')[0];
        const sourcePath = `./database/instances/${environment}/${swarmId}.db`;
        const archivePath = `./database/backups/${environment}/${swarmId}_archived_${Date.now()}.db`;

        await fs.mkdir(path.dirname(archivePath), { recursive: true });
        await fs.copyFile(sourcePath, archivePath);

        console.log(`  📦 Data archived to ${archivePath}`);
    }

    async cleanupSwarmResources(swarmId) {
        const environment = swarmId.split('_')[0];
        const dbPath = `./database/instances/${environment}/${swarmId}.db`;

        // Remove database file
        try {
            await fs.unlink(dbPath);
            console.log(`  🗑️  Database file removed`);
        } catch (error) {
            console.warn(`    ⚠️  Could not remove database file: ${error.message}`);
        }

        // Clean up any WAL and SHM files
        try {
            await fs.unlink(`${dbPath}-wal`);
            await fs.unlink(`${dbPath}-shm`);
        } catch (error) {
            // These files may not exist, which is fine
        }
    }

    async cleanupFailedSwarm(swarmId) {
        console.log(`🧹 Cleaning up failed swarm ${swarmId}...`);

        try {
            // Remove from coordination registry
            const removeQuery = `DELETE FROM swarm_registry WHERE swarm_id = '${swarmId}'`;
            execSync(`sqlite3 "${this.coordDbPath}" "${removeQuery}"`);

            // Remove database files if they exist
            const environment = swarmId.split('_')[0];
            const dbPath = `./database/instances/${environment}/${swarmId}.db`;

            try {
                await fs.unlink(dbPath);
            } catch (error) {
                // File may not exist yet
            }

            console.log(`✅ Failed swarm cleanup completed`);
        } catch (error) {
            console.error(`❌ Cleanup failed:`, error.message);
        }
    }

    async listSwarms() {
        try {
            const query = `
                SELECT
                    swarm_id, swarm_name, environment, status,
                    memory_allocation_mb, max_agents, created_at,
                    last_activity
                FROM swarm_registry
                ORDER BY created_at DESC
            `;

            const result = execSync(`sqlite3 "${this.coordDbPath}" "${query}"`, { encoding: 'utf8' });

            const swarms = result.trim().split('\n')
                .filter(line => line.length > 0)
                .map(line => {
                    const [swarmId, name, env, status, memoryMB, maxAgents, created, lastActivity] = line.split('|');
                    return {
                        swarmId,
                        name,
                        environment: env,
                        status,
                        memoryMB: parseInt(memoryMB),
                        maxAgents: parseInt(maxAgents),
                        created,
                        lastActivity
                    };
                });

            return swarms;
        } catch (error) {
            throw new Error(`Failed to list swarms: ${error.message}`);
        }
    }

    async getSwarmHealth(swarmId) {
        const environment = swarmId.split('_')[0];
        const dbPath = `./database/instances/${environment}/${swarmId}.db`;
        const prefix = this.namespaceConfig.swarm_namespaces[environment].table_prefix;

        try {
            const healthQuery = `
                SELECT
                    (SELECT COUNT(*) FROM ${prefix}agents WHERE status = 'active') as active_agents,
                    (SELECT COUNT(*) FROM ${prefix}tasks WHERE status = 'in_progress') as running_tasks,
                    (SELECT COUNT(*) FROM ${prefix}tasks WHERE status = 'pending') as pending_tasks,
                    (SELECT AVG(metric_value) FROM ${prefix}performance_metrics WHERE metric_name = 'memory_usage_mb' AND timestamp > datetime('now', '-5 minutes')) as avg_memory_usage,
                    (SELECT AVG(metric_value) FROM ${prefix}performance_metrics WHERE metric_name = 'cpu_usage_percent' AND timestamp > datetime('now', '-5 minutes')) as avg_cpu_usage
            `;

            const result = execSync(`sqlite3 "${dbPath}" "${healthQuery}"`, { encoding: 'utf8' });
            const [activeAgents, runningTasks, pendingTasks, avgMemory, avgCpu] = result.trim().split('|');

            return {
                swarmId,
                activeAgents: parseInt(activeAgents) || 0,
                runningTasks: parseInt(runningTasks) || 0,
                pendingTasks: parseInt(pendingTasks) || 0,
                avgMemoryUsage: parseFloat(avgMemory) || 0,
                avgCpuUsage: parseFloat(avgCpu) || 0,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to get swarm health: ${error.message}`);
        }
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const manager = new SwarmLifecycleManager();
    await manager.initialize();

    try {
        switch (command) {
            case 'create':
                const environment = args[1];
                if (!environment) throw new Error('Environment required');
                const result = await manager.createSwarm(environment);
                console.log(JSON.stringify(result, null, 2));
                break;

            case 'scale':
                const swarmId = args[1];
                const agentCount = parseInt(args[2]);
                const memoryGB = parseInt(args[3]);
                if (!swarmId || !agentCount || !memoryGB) {
                    throw new Error('Usage: scale <swarmId> <agentCount> <memoryGB>');
                }
                const scaleResult = await manager.scaleSwarm(swarmId, agentCount, memoryGB);
                console.log(JSON.stringify(scaleResult, null, 2));
                break;

            case 'terminate':
                const terminateSwarmId = args[1];
                const graceful = args[2] !== 'force';
                if (!terminateSwarmId) throw new Error('SwarmId required');
                const terminateResult = await manager.terminateSwarm(terminateSwarmId, graceful);
                console.log(JSON.stringify(terminateResult, null, 2));
                break;

            case 'list':
                const swarms = await manager.listSwarms();
                console.table(swarms);
                break;

            case 'health':
                const healthSwarmId = args[1];
                if (!healthSwarmId) throw new Error('SwarmId required');
                const health = await manager.getSwarmHealth(healthSwarmId);
                console.log(JSON.stringify(health, null, 2));
                break;

            default:
                console.log(`
Multi-Swarm Lifecycle Manager

Usage:
  node swarm-lifecycle-manager.js <command> [args...]

Commands:
  create <environment>                     Create new swarm
  scale <swarmId> <agentCount> <memoryGB>  Scale existing swarm
  terminate <swarmId> [force]              Terminate swarm (graceful by default)
  list                                     List all swarms
  health <swarmId>                         Get swarm health status

Examples:
  node swarm-lifecycle-manager.js create development
  node swarm-lifecycle-manager.js scale dev_swarm_123 20 16
  node swarm-lifecycle-manager.js health dev_swarm_123
  node swarm-lifecycle-manager.js terminate dev_swarm_123
                `);
        }
    } catch (error) {
        console.error('❌ Command failed:', error.message);
        process.exit(1);
    }
}

// Run CLI if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = SwarmLifecycleManager;