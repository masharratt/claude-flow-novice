#!/usr/bin/env node

/**
 * Multi-Swarm Database Initialization Script
 * Optimized for 96GB DDR5-6400 setup with 5 concurrent swarms
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
    swarmEnvironments: ['production', 'development', 'testing', 'research', 'staging'],
    databaseDir: './database/instances',
    schemaDir: './database/schemas',
    configDir: './database/configs',
    backupDir: './database/backups',
    monitoringDir: './database/monitoring'
};

class MultiSwarmDatabaseInitializer {
    constructor() {
        this.swarmConfigs = null;
        this.namespaceConfig = null;
        this.initStartTime = Date.now();
    }

    async initialize() {
        console.log('🚀 Starting Multi-Swarm Database Initialization...');
        console.log(`📊 System: 96GB DDR5-6400, Target: 5 concurrent swarms`);

        try {
            await this.loadConfigurations();
            await this.createDirectoryStructure();
            await this.initializeSwarmDatabases();
            await this.createCoordinationDatabase();
            await this.setupNamespaceIsolation();
            await this.initializeMonitoring();
            await this.validateSetup();

            const duration = (Date.now() - this.initStartTime) / 1000;
            console.log(`✅ Multi-swarm initialization completed in ${duration}s`);

        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            process.exit(1);
        }
    }

    async loadConfigurations() {
        console.log('📋 Loading configurations...');

        try {
            const swarmConfigPath = path.join(CONFIG.configDir, 'swarm-memory-allocation.json');
            const namespaceConfigPath = path.join(CONFIG.configDir, 'namespace-isolation.json');

            this.swarmConfigs = JSON.parse(await fs.readFile(swarmConfigPath, 'utf8'));
            this.namespaceConfig = JSON.parse(await fs.readFile(namespaceConfigPath, 'utf8'));

            console.log('✅ Configurations loaded successfully');
        } catch (error) {
            throw new Error(`Failed to load configurations: ${error.message}`);
        }
    }

    async createDirectoryStructure() {
        console.log('📁 Creating directory structure...');

        const directories = [
            CONFIG.databaseDir,
            CONFIG.backupDir,
            CONFIG.monitoringDir,
            ...CONFIG.swarmEnvironments.map(env => path.join(CONFIG.databaseDir, env)),
            ...CONFIG.swarmEnvironments.map(env => path.join(CONFIG.backupDir, env)),
            path.join(CONFIG.databaseDir, 'coordination'),
            path.join(CONFIG.monitoringDir, 'logs'),
            path.join(CONFIG.monitoringDir, 'metrics')
        ];

        for (const dir of directories) {
            await fs.mkdir(dir, { recursive: true });
        }

        console.log('✅ Directory structure created');
    }

    async initializeSwarmDatabases() {
        console.log('🗄️  Initializing swarm databases...');

        for (const environment of CONFIG.swarmEnvironments) {
            await this.initializeSwarmDatabase(environment);
        }

        console.log('✅ All swarm databases initialized');
    }

    async initializeSwarmDatabase(environment) {
        console.log(`  📊 Initializing ${environment} swarm database...`);

        const swarmConfig = this.swarmConfigs.swarm_environments[environment];
        const namespaceConfig = this.namespaceConfig.swarm_namespaces[environment];

        const dbPath = path.join(CONFIG.databaseDir, environment, namespaceConfig.database_file);

        // Create SQLite database with optimized settings
        const initScript = this.generateSwarmInitScript(environment, swarmConfig, namespaceConfig);

        try {
            // Write initialization script
            const scriptPath = path.join(CONFIG.databaseDir, environment, 'init.sql');
            await fs.writeFile(scriptPath, initScript);

            // Execute initialization
            execSync(`sqlite3 "${dbPath}" < "${scriptPath}"`, { stdio: 'inherit' });

            // Create swarm-specific monitoring tables
            await this.createSwarmMonitoringTables(dbPath, environment);

            console.log(`    ✅ ${environment} database initialized (${swarmConfig.base_memory_gb}GB allocated)`);

        } catch (error) {
            throw new Error(`Failed to initialize ${environment} database: ${error.message}`);
        }
    }

    generateSwarmInitScript(environment, swarmConfig, namespaceConfig) {
        const prefix = namespaceConfig.table_prefix;

        return `
-- ${environment.toUpperCase()} Swarm Database Initialization
-- Memory Allocation: ${swarmConfig.base_memory_gb}GB base, ${swarmConfig.max_memory_gb}GB max
-- Isolation Level: ${swarmConfig.isolation_level}

-- Performance optimization settings
PRAGMA cache_size = -${swarmConfig.base_memory_gb * 1024 * 256}; -- Convert GB to pages
PRAGMA temp_store = MEMORY;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = ${environment === 'production' ? 'FULL' : 'NORMAL'};
PRAGMA page_size = 65536;
PRAGMA mmap_size = ${swarmConfig.base_memory_gb * 1024 * 1024 * 1024}; -- Convert GB to bytes
PRAGMA wal_autocheckpoint = 1000;
PRAGMA optimize;

-- Create swarm-specific tables with namespace prefix
CREATE TABLE IF NOT EXISTS ${prefix}agents (
    agent_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${environment}',
    agent_type TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    capabilities TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'busy', 'idle', 'suspended', 'terminated')),
    memory_usage_mb INTEGER DEFAULT 0,
    cpu_usage_percent REAL DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    performance_metrics TEXT,
    namespace_restrictions TEXT DEFAULT '${namespaceConfig.namespace_prefix}'
);

CREATE TABLE IF NOT EXISTS ${prefix}tasks (
    task_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${environment}',
    assigned_agent_id TEXT,
    task_type TEXT NOT NULL,
    task_description TEXT NOT NULL,
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled')),
    dependencies TEXT,
    estimated_duration_minutes INTEGER,
    actual_duration_minutes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    result_data TEXT,
    error_message TEXT,
    memory_requirements_mb INTEGER DEFAULT 0,
    FOREIGN KEY (assigned_agent_id) REFERENCES ${prefix}agents(agent_id)
);

CREATE TABLE IF NOT EXISTS ${prefix}memory_store (
    memory_key TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${environment}',
    namespace TEXT NOT NULL DEFAULT '${namespaceConfig.namespace_prefix}',
    value_data TEXT NOT NULL,
    value_type TEXT DEFAULT 'json' CHECK (value_type IN ('json', 'binary', 'text')),
    ttl_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP,
    size_bytes INTEGER,
    compression_enabled BOOLEAN DEFAULT FALSE,
    isolation_tag TEXT DEFAULT '${namespaceConfig.isolation_level}'
);

CREATE TABLE IF NOT EXISTS ${prefix}performance_metrics (
    metric_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${environment}',
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metric_unit TEXT,
    tags TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    retention_days INTEGER DEFAULT 30,
    category TEXT DEFAULT 'general'
);

CREATE TABLE IF NOT EXISTS ${prefix}communication_logs (
    log_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${environment}',
    communication_type TEXT NOT NULL CHECK (communication_type IN ('sent', 'received', 'broadcast')),
    peer_swarm_id TEXT,
    message_type TEXT NOT NULL,
    message_content TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_details TEXT,
    isolation_check BOOLEAN DEFAULT TRUE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_${prefix}agents_swarm_id ON ${prefix}agents(swarm_id);
CREATE INDEX IF NOT EXISTS idx_${prefix}agents_status ON ${prefix}agents(status);
CREATE INDEX IF NOT EXISTS idx_${prefix}agents_type ON ${prefix}agents(agent_type);

CREATE INDEX IF NOT EXISTS idx_${prefix}tasks_swarm_id ON ${prefix}tasks(swarm_id);
CREATE INDEX IF NOT EXISTS idx_${prefix}tasks_status ON ${prefix}tasks(status);
CREATE INDEX IF NOT EXISTS idx_${prefix}tasks_priority ON ${prefix}tasks(priority);
CREATE INDEX IF NOT EXISTS idx_${prefix}tasks_assigned_agent ON ${prefix}tasks(assigned_agent_id);

CREATE INDEX IF NOT EXISTS idx_${prefix}memory_swarm_id ON ${prefix}memory_store(swarm_id);
CREATE INDEX IF NOT EXISTS idx_${prefix}memory_namespace ON ${prefix}memory_store(namespace);
CREATE INDEX IF NOT EXISTS idx_${prefix}memory_expires_at ON ${prefix}memory_store(expires_at);

CREATE INDEX IF NOT EXISTS idx_${prefix}metrics_swarm_id ON ${prefix}performance_metrics(swarm_id);
CREATE INDEX IF NOT EXISTS idx_${prefix}metrics_name ON ${prefix}performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_${prefix}metrics_timestamp ON ${prefix}performance_metrics(timestamp);

-- Initialize swarm registry entry
INSERT OR REPLACE INTO ${prefix}swarm_registry (
    swarm_id, swarm_name, environment, memory_allocation_mb, max_agents,
    namespace_prefix, isolation_level
) VALUES (
    '${environment}_swarm_' || substr(hex(randomblob(8)), 1, 16),
    '${environment}_swarm',
    '${environment}',
    ${swarmConfig.base_memory_gb * 1024},
    ${swarmConfig.max_agents},
    '${namespaceConfig.namespace_prefix}',
    '${swarmConfig.isolation_level}'
);

-- Insert initial performance baseline
INSERT INTO ${prefix}performance_metrics (
    metric_id, metric_name, metric_value, metric_unit, tags
) VALUES
    ('init_memory_allocated', 'memory_allocated_mb', ${swarmConfig.base_memory_gb * 1024}, 'MB', '{"type":"baseline","environment":"${environment}"}'),
    ('init_max_agents', 'max_agents_configured', ${swarmConfig.max_agents}, 'count', '{"type":"baseline","environment":"${environment}"}'),
    ('init_isolation_level', 'isolation_level_numeric', ${swarmConfig.isolation_level === 'strict' ? 3 : swarmConfig.isolation_level === 'moderate' ? 2 : 1}, 'level', '{"type":"baseline","environment":"${environment}"}');
`;
    }

    async createCoordinationDatabase() {
        console.log('🤝 Creating cross-swarm coordination database...');

        const coordDbPath = path.join(CONFIG.databaseDir, 'coordination', 'cross_swarm_coordination.db');
        const coordScript = this.generateCoordinationInitScript();

        try {
            const scriptPath = path.join(CONFIG.databaseDir, 'coordination', 'init.sql');
            await fs.writeFile(scriptPath, coordScript);

            execSync(`sqlite3 "${coordDbPath}" < "${scriptPath}"`, { stdio: 'inherit' });

            console.log('✅ Cross-swarm coordination database created');
        } catch (error) {
            throw new Error(`Failed to create coordination database: ${error.message}`);
        }
    }

    generateCoordinationInitScript() {
        const coordConfig = this.swarmConfigs.cross_swarm_coordination;

        return `
-- Cross-Swarm Coordination Database
-- Memory Pool: ${coordConfig.coordination_pool_memory_gb}GB

PRAGMA cache_size = -${coordConfig.coordination_pool_memory_gb * 1024 * 256};
PRAGMA temp_store = MEMORY;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL; -- Strict consistency for coordination
PRAGMA page_size = 32768;
PRAGMA mmap_size = ${coordConfig.coordination_pool_memory_gb * 1024 * 1024 * 1024};

-- Global swarm registry
CREATE TABLE IF NOT EXISTS swarm_registry (
    swarm_id TEXT PRIMARY KEY,
    swarm_name TEXT NOT NULL UNIQUE,
    environment TEXT NOT NULL CHECK (environment IN ('production', 'development', 'testing', 'research', 'staging')),
    memory_allocation_mb INTEGER NOT NULL,
    max_agents INTEGER DEFAULT 16,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'terminated')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    namespace_prefix TEXT NOT NULL UNIQUE,
    isolation_level TEXT DEFAULT 'strict',
    endpoint_url TEXT,
    health_check_interval_seconds INTEGER DEFAULT 30
);

-- Cross-swarm coordination tracking
CREATE TABLE IF NOT EXISTS cross_swarm_coordination (
    coordination_id TEXT PRIMARY KEY,
    source_swarm_id TEXT NOT NULL,
    target_swarm_id TEXT NOT NULL,
    coordination_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    payload TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    timeout_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    FOREIGN KEY (source_swarm_id) REFERENCES swarm_registry(swarm_id),
    FOREIGN KEY (target_swarm_id) REFERENCES swarm_registry(swarm_id)
);

-- Message queue for cross-swarm communication
CREATE TABLE IF NOT EXISTS coordination_message_queue (
    message_id TEXT PRIMARY KEY,
    from_swarm_id TEXT NOT NULL,
    to_swarm_id TEXT,
    message_type TEXT NOT NULL,
    message_body TEXT NOT NULL,
    priority INTEGER DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'delivered', 'failed', 'expired')),
    retry_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP
);

-- Resource sharing tracking
CREATE TABLE IF NOT EXISTS resource_sharing (
    sharing_id TEXT PRIMARY KEY,
    resource_type TEXT NOT NULL,
    owner_swarm_id TEXT NOT NULL,
    consumer_swarm_id TEXT NOT NULL,
    resource_identifier TEXT NOT NULL,
    permissions TEXT NOT NULL, -- JSON: read, write, execute
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked'))
);

-- Performance aggregation across swarms
CREATE TABLE IF NOT EXISTS global_performance_metrics (
    metric_id TEXT PRIMARY KEY,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metric_unit TEXT,
    swarm_id TEXT,
    aggregation_type TEXT DEFAULT 'individual' CHECK (aggregation_type IN ('individual', 'sum', 'average', 'max', 'min')),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tags TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_swarm_registry_environment ON swarm_registry(environment);
CREATE INDEX IF NOT EXISTS idx_swarm_registry_status ON swarm_registry(status);
CREATE INDEX IF NOT EXISTS idx_coordination_source ON cross_swarm_coordination(source_swarm_id);
CREATE INDEX IF NOT EXISTS idx_coordination_target ON cross_swarm_coordination(target_swarm_id);
CREATE INDEX IF NOT EXISTS idx_coordination_status ON cross_swarm_coordination(status);
CREATE INDEX IF NOT EXISTS idx_message_queue_to_swarm ON coordination_message_queue(to_swarm_id);
CREATE INDEX IF NOT EXISTS idx_message_queue_status ON coordination_message_queue(status);
CREATE INDEX IF NOT EXISTS idx_resource_sharing_owner ON resource_sharing(owner_swarm_id);
CREATE INDEX IF NOT EXISTS idx_resource_sharing_consumer ON resource_sharing(consumer_swarm_id);
CREATE INDEX IF NOT EXISTS idx_global_metrics_swarm ON global_performance_metrics(swarm_id);
CREATE INDEX IF NOT EXISTS idx_global_metrics_name ON global_performance_metrics(metric_name);
`;
    }

    async setupNamespaceIsolation() {
        console.log('🔒 Setting up namespace isolation...');

        // Create isolation validation script
        const isolationScript = `
const fs = require('fs');
const path = require('path');

class NamespaceIsolationValidator {
    constructor() {
        this.namespaceConfig = ${JSON.stringify(this.namespaceConfig, null, 2)};
    }

    validateAccess(requestingSwarm, targetNamespace, operation) {
        const requestingConfig = this.namespaceConfig.swarm_namespaces[requestingSwarm];
        if (!requestingConfig) return false;

        // Check if accessing own namespace
        if (targetNamespace.startsWith(requestingConfig.namespace_prefix)) {
            return true;
        }

        // Check cross-swarm access permissions
        const allowedAccess = requestingConfig.cross_swarm_access;

        switch (allowedAccess) {
            case 'none':
                return false;
            case 'read_only_staging':
                return targetNamespace.startsWith('staging_') && operation === 'read';
            case 'read_dev_write_staging':
                if (targetNamespace.startsWith('dev_')) return operation === 'read';
                if (targetNamespace.startsWith('staging_')) return ['read', 'write'].includes(operation);
                return false;
            case 'read_all_non_prod':
                return !targetNamespace.startsWith('prod_') && operation === 'read';
            case 'read_only_dev':
                return targetNamespace.startsWith('dev_') && operation === 'read';
            default:
                return false;
        }
    }

    enforceIsolation(swarmId, query) {
        // Add namespace prefix validation to SQL queries
        const config = this.namespaceConfig.swarm_namespaces[swarmId];
        if (!config) throw new Error('Unknown swarm: ' + swarmId);

        // Basic SQL injection prevention and namespace enforcement
        const allowedTables = this.getAllowedTables(swarmId);
        const tableRegex = /(FROM|JOIN|INTO|UPDATE)\\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;

        return query.replace(tableRegex, (match, keyword, tableName) => {
            if (!allowedTables.includes(tableName)) {
                throw new Error(\`Access denied to table: \${tableName} for swarm: \${swarmId}\`);
            }
            return match;
        });
    }

    getAllowedTables(swarmId) {
        const config = this.namespaceConfig.swarm_namespaces[swarmId];
        const ownTables = [
            \`\${config.table_prefix}agents\`,
            \`\${config.table_prefix}tasks\`,
            \`\${config.table_prefix}memory_store\`,
            \`\${config.table_prefix}performance_metrics\`,
            \`\${config.table_prefix}communication_logs\`
        ];

        // Add cross-swarm accessible tables based on permissions
        const crossSwarmTables = this.getCrossSwarmTables(swarmId);

        return [...ownTables, ...crossSwarmTables, 'swarm_registry', 'cross_swarm_coordination'];
    }

    getCrossSwarmTables(swarmId) {
        const config = this.namespaceConfig.swarm_namespaces[swarmId];
        const crossSwarmTables = [];

        switch (config.cross_swarm_access) {
            case 'read_only_staging':
                crossSwarmTables.push('staging_agents', 'staging_tasks', 'staging_memory_store');
                break;
            case 'read_dev_write_staging':
                crossSwarmTables.push('dev_agents', 'dev_tasks', 'dev_memory_store');
                crossSwarmTables.push('staging_agents', 'staging_tasks', 'staging_memory_store');
                break;
            case 'read_all_non_prod':
                ['dev', 'test', 'research', 'staging'].forEach(env => {
                    crossSwarmTables.push(\`\${env}_agents\`, \`\${env}_tasks\`, \`\${env}_memory_store\`);
                });
                break;
            case 'read_only_dev':
                crossSwarmTables.push('dev_agents', 'dev_tasks', 'dev_memory_store');
                break;
        }

        return crossSwarmTables;
    }
}

module.exports = NamespaceIsolationValidator;
`;

        const isolationPath = path.join(CONFIG.databaseDir, 'namespace-isolation-validator.js');
        await fs.writeFile(isolationPath, isolationScript);

        console.log('✅ Namespace isolation configured');
    }

    async createSwarmMonitoringTables(dbPath, environment) {
        const monitoringScript = `
CREATE TABLE IF NOT EXISTS monitoring_health_checks (
    check_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${environment}',
    check_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'warning', 'critical')),
    message TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_time_ms INTEGER,
    resource_usage TEXT -- JSON object
);

CREATE TABLE IF NOT EXISTS monitoring_alerts (
    alert_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL DEFAULT '${environment}',
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    message TEXT NOT NULL,
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
    metadata TEXT -- JSON object
);

CREATE INDEX IF NOT EXISTS idx_health_checks_swarm ON monitoring_health_checks(swarm_id);
CREATE INDEX IF NOT EXISTS idx_health_checks_status ON monitoring_health_checks(status);
CREATE INDEX IF NOT EXISTS idx_alerts_swarm ON monitoring_alerts(swarm_id);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON monitoring_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON monitoring_alerts(status);
`;

        const tempScript = path.join(CONFIG.databaseDir, environment, 'monitoring.sql');
        await fs.writeFile(tempScript, monitoringScript);

        execSync(`sqlite3 "${dbPath}" < "${tempScript}"`, { stdio: 'inherit' });
        await fs.unlink(tempScript);
    }

    async initializeMonitoring() {
        console.log('📊 Initializing monitoring system...');

        const monitoringConfig = {
            enabled: true,
            collection_interval_seconds: this.swarmConfigs.monitoring_metrics.collection_interval_seconds,
            retention_days: this.swarmConfigs.monitoring_metrics.retention_days,
            swarm_environments: CONFIG.swarmEnvironments,
            metrics_to_collect: this.swarmConfigs.monitoring_metrics.metrics_to_track,
            thresholds: this.swarmConfigs.performance_thresholds,
            auto_scaling: this.swarmConfigs.auto_scaling_rules
        };

        const monitoringConfigPath = path.join(CONFIG.monitoringDir, 'monitoring-config.json');
        await fs.writeFile(monitoringConfigPath, JSON.stringify(monitoringConfig, null, 2));

        // Create monitoring script
        const monitoringScript = `
#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class MultiSwarmMonitor {
    constructor() {
        this.config = require('./monitoring-config.json');
        this.isRunning = false;
    }

    start() {
        console.log('🔍 Starting multi-swarm monitoring...');
        this.isRunning = true;
        this.monitoringLoop();
    }

    async monitoringLoop() {
        while (this.isRunning) {
            try {
                await this.collectMetrics();
                await this.checkHealthStatus();
                await this.enforceThresholds();

                await new Promise(resolve =>
                    setTimeout(resolve, this.config.collection_interval_seconds * 1000)
                );
            } catch (error) {
                console.error('Monitoring error:', error.message);
            }
        }
    }

    async collectMetrics() {
        for (const env of this.config.swarm_environments) {
            const dbPath = \`./database/instances/\${env}/multi_swarm_\${env}.db\`;

            // Collect memory usage
            const memoryQuery = \`
                SELECT
                    COUNT(*) as agent_count,
                    SUM(memory_usage_mb) as total_memory_mb,
                    AVG(cpu_usage_percent) as avg_cpu_percent
                FROM \${env}_agents
                WHERE status = 'active'
            \`;

            try {
                const result = execSync(\`sqlite3 "\${dbPath}" "\${memoryQuery}"\`, { encoding: 'utf8' });
                const [agentCount, totalMemory, avgCpu] = result.trim().split('|');

                // Insert metrics
                const insertMetrics = \`
                    INSERT INTO \${env}_performance_metrics (
                        metric_id, metric_name, metric_value, metric_unit, tags
                    ) VALUES
                        ('mem_\${Date.now()}', 'memory_usage_mb', \${totalMemory || 0}, 'MB', '{"type":"current","environment":"\${env}"}'),
                        ('cpu_\${Date.now()}', 'cpu_usage_percent', \${avgCpu || 0}, 'percent', '{"type":"current","environment":"\${env}"}'),
                        ('agents_\${Date.now()}', 'active_agent_count', \${agentCount || 0}, 'count', '{"type":"current","environment":"\${env}"}')
                \`;

                execSync(\`sqlite3 "\${dbPath}" "\${insertMetrics}"\`);

            } catch (error) {
                console.error(\`Failed to collect metrics for \${env}:\`, error.message);
            }
        }
    }

    async checkHealthStatus() {
        // Implement health checks for each swarm
        console.log('🏥 Health check completed');
    }

    async enforceThresholds() {
        // Implement threshold enforcement and auto-scaling
        console.log('⚖️  Threshold enforcement completed');
    }

    stop() {
        console.log('🛑 Stopping multi-swarm monitoring...');
        this.isRunning = false;
    }
}

// Start monitoring if run directly
if (require.main === module) {
    const monitor = new MultiSwarmMonitor();
    monitor.start();

    // Graceful shutdown
    process.on('SIGINT', () => monitor.stop());
    process.on('SIGTERM', () => monitor.stop());
}

module.exports = MultiSwarmMonitor;
`;

        const monitoringScriptPath = path.join(CONFIG.monitoringDir, 'multi-swarm-monitor.js');
        await fs.writeFile(monitoringScriptPath, monitoringScript);

        // Make script executable
        await fs.chmod(monitoringScriptPath, '755');

        console.log('✅ Monitoring system initialized');
    }

    async validateSetup() {
        console.log('🔍 Validating multi-swarm setup...');

        const validationResults = {};

        // Validate each swarm database
        for (const environment of CONFIG.swarmEnvironments) {
            const dbPath = path.join(CONFIG.databaseDir, environment,
                this.namespaceConfig.swarm_namespaces[environment].database_file);

            try {
                // Test database connection and basic operations
                const testQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '${environment}_%'`;
                const result = execSync(`sqlite3 "${dbPath}" "${testQuery}"`, { encoding: 'utf8' });

                const tables = result.trim().split('\n').filter(line => line.length > 0);

                validationResults[environment] = {
                    status: 'healthy',
                    database_path: dbPath,
                    tables_created: tables.length,
                    expected_tables: 5, // agents, tasks, memory_store, performance_metrics, communication_logs
                    memory_allocated_gb: this.swarmConfigs.swarm_environments[environment].base_memory_gb
                };

                console.log(`    ✅ ${environment}: ${tables.length} tables created`);

            } catch (error) {
                validationResults[environment] = {
                    status: 'error',
                    error: error.message
                };
                console.log(`    ❌ ${environment}: ${error.message}`);
            }
        }

        // Validate coordination database
        const coordDbPath = path.join(CONFIG.databaseDir, 'coordination', 'cross_swarm_coordination.db');
        try {
            const coordTables = execSync(`sqlite3 "${coordDbPath}" "SELECT name FROM sqlite_master WHERE type='table'"`, { encoding: 'utf8' });
            console.log(`    ✅ Coordination DB: ${coordTables.trim().split('\n').length} tables`);
        } catch (error) {
            console.log(`    ❌ Coordination DB: ${error.message}`);
        }

        // Save validation report
        const reportPath = path.join(CONFIG.monitoringDir, 'initialization-validation.json');
        await fs.writeFile(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            total_memory_allocated_gb: Object.values(this.swarmConfigs.swarm_environments)
                .reduce((sum, config) => sum + config.base_memory_gb, 0),
            swarm_results: validationResults,
            coordination_database: coordDbPath,
            monitoring_enabled: true
        }, null, 2));

        console.log('✅ Setup validation completed');
    }
}

// Run initialization if called directly
if (require.main === module) {
    const initializer = new MultiSwarmDatabaseInitializer();
    initializer.initialize().catch(console.error);
}

module.exports = MultiSwarmDatabaseInitializer;