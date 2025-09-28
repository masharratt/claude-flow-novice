-- Multi-Swarm Database Architecture for 96GB DDR5-6400 Setup
-- Optimized for 5 concurrent swarms with namespace isolation

-- =============================================
-- SWARM NAMESPACE MANAGEMENT
-- =============================================

-- Master swarm registry
CREATE TABLE IF NOT EXISTS swarm_registry (
    swarm_id TEXT PRIMARY KEY,
    swarm_name TEXT NOT NULL UNIQUE,
    environment TEXT NOT NULL CHECK (environment IN ('dev', 'test', 'prod', 'research', 'staging')),
    memory_allocation_mb INTEGER NOT NULL,
    max_agents INTEGER DEFAULT 16,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'terminated')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    namespace_prefix TEXT NOT NULL UNIQUE,
    isolation_level TEXT DEFAULT 'strict' CHECK (isolation_level IN ('strict', 'moderate', 'loose'))
);

-- Cross-swarm coordination tracking
CREATE TABLE IF NOT EXISTS cross_swarm_coordination (
    coordination_id TEXT PRIMARY KEY,
    source_swarm_id TEXT NOT NULL,
    target_swarm_id TEXT NOT NULL,
    coordination_type TEXT NOT NULL CHECK (coordination_type IN ('data_sync', 'workflow_handoff', 'resource_share', 'notification')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    payload TEXT, -- JSON data
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (source_swarm_id) REFERENCES swarm_registry(swarm_id),
    FOREIGN KEY (target_swarm_id) REFERENCES swarm_registry(swarm_id)
);

-- =============================================
-- SWARM-SPECIFIC SCHEMAS (Template)
-- =============================================

-- Each swarm gets its own isolated namespace with these tables:
-- Pattern: {namespace_prefix}_{table_name}

-- Agent management per swarm
CREATE TABLE IF NOT EXISTS template_agents (
    agent_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    capabilities TEXT, -- JSON array
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'busy', 'idle', 'suspended', 'terminated')),
    memory_usage_mb INTEGER DEFAULT 0,
    cpu_usage_percent REAL DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    performance_metrics TEXT -- JSON object
);

-- Task orchestration per swarm
CREATE TABLE IF NOT EXISTS template_tasks (
    task_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL,
    assigned_agent_id TEXT,
    task_type TEXT NOT NULL,
    task_description TEXT NOT NULL,
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled')),
    dependencies TEXT, -- JSON array of task_ids
    estimated_duration_minutes INTEGER,
    actual_duration_minutes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    result_data TEXT, -- JSON object
    error_message TEXT,
    FOREIGN KEY (assigned_agent_id) REFERENCES template_agents(agent_id)
);

-- Memory store per swarm (enhanced SQLite backend)
CREATE TABLE IF NOT EXISTS template_memory_store (
    memory_key TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL,
    namespace TEXT NOT NULL,
    value_data TEXT NOT NULL, -- JSON or serialized data
    value_type TEXT DEFAULT 'json' CHECK (value_type IN ('json', 'binary', 'text')),
    ttl_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP,
    size_bytes INTEGER,
    compression_enabled BOOLEAN DEFAULT FALSE
);

-- Performance metrics per swarm
CREATE TABLE IF NOT EXISTS template_performance_metrics (
    metric_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metric_unit TEXT,
    tags TEXT, -- JSON object for flexible tagging
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    retention_days INTEGER DEFAULT 30
);

-- Cross-swarm communication logs
CREATE TABLE IF NOT EXISTS template_communication_logs (
    log_id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL,
    communication_type TEXT NOT NULL CHECK (communication_type IN ('sent', 'received', 'broadcast')),
    peer_swarm_id TEXT,
    message_type TEXT NOT NULL,
    message_content TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_details TEXT
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Swarm registry indexes
CREATE INDEX IF NOT EXISTS idx_swarm_registry_environment ON swarm_registry(environment);
CREATE INDEX IF NOT EXISTS idx_swarm_registry_status ON swarm_registry(status);
CREATE INDEX IF NOT EXISTS idx_swarm_registry_last_activity ON swarm_registry(last_activity);

-- Cross-swarm coordination indexes
CREATE INDEX IF NOT EXISTS idx_coordination_source_swarm ON cross_swarm_coordination(source_swarm_id);
CREATE INDEX IF NOT EXISTS idx_coordination_target_swarm ON cross_swarm_coordination(target_swarm_id);
CREATE INDEX IF NOT EXISTS idx_coordination_status ON cross_swarm_coordination(status);
CREATE INDEX IF NOT EXISTS idx_coordination_priority ON cross_swarm_coordination(priority);
CREATE INDEX IF NOT EXISTS idx_coordination_created_at ON cross_swarm_coordination(created_at);

-- Template indexes (to be created for each swarm namespace)
-- Agents
CREATE INDEX IF NOT EXISTS idx_template_agents_swarm_id ON template_agents(swarm_id);
CREATE INDEX IF NOT EXISTS idx_template_agents_status ON template_agents(status);
CREATE INDEX IF NOT EXISTS idx_template_agents_agent_type ON template_agents(agent_type);
CREATE INDEX IF NOT EXISTS idx_template_agents_last_activity ON template_agents(last_activity);

-- Tasks
CREATE INDEX IF NOT EXISTS idx_template_tasks_swarm_id ON template_tasks(swarm_id);
CREATE INDEX IF NOT EXISTS idx_template_tasks_status ON template_tasks(status);
CREATE INDEX IF NOT EXISTS idx_template_tasks_priority ON template_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_template_tasks_assigned_agent ON template_tasks(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_template_tasks_created_at ON template_tasks(created_at);

-- Memory store
CREATE INDEX IF NOT EXISTS idx_template_memory_swarm_id ON template_memory_store(swarm_id);
CREATE INDEX IF NOT EXISTS idx_template_memory_namespace ON template_memory_store(namespace);
CREATE INDEX IF NOT EXISTS idx_template_memory_expires_at ON template_memory_store(expires_at);
CREATE INDEX IF NOT EXISTS idx_template_memory_last_accessed ON template_memory_store(last_accessed);

-- Performance metrics
CREATE INDEX IF NOT EXISTS idx_template_metrics_swarm_id ON template_performance_metrics(swarm_id);
CREATE INDEX IF NOT EXISTS idx_template_metrics_name ON template_performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_template_metrics_timestamp ON template_performance_metrics(timestamp);

-- Communication logs
CREATE INDEX IF NOT EXISTS idx_template_comm_swarm_id ON template_communication_logs(swarm_id);
CREATE INDEX IF NOT EXISTS idx_template_comm_type ON template_communication_logs(communication_type);
CREATE INDEX IF NOT EXISTS idx_template_comm_timestamp ON template_communication_logs(timestamp);

-- =============================================
-- MEMORY OPTIMIZATION SETTINGS
-- =============================================

-- SQLite settings for high-performance operation with 96GB RAM
PRAGMA cache_size = -2097152; -- 2GB cache per database
PRAGMA temp_store = MEMORY;
PRAGMA journal_mode = WAL; -- Write-Ahead Logging for better concurrency
PRAGMA synchronous = NORMAL; -- Balance between performance and safety
PRAGMA page_size = 65536; -- Optimize for DDR5-6400 bandwidth
PRAGMA mmap_size = 2147483648; -- 2GB memory mapping per DB
PRAGMA optimize;