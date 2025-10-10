-- Phase 1 SQLite Schema for Swarm Memory Management
-- 12-Table Schema with 6-level ACL System
-- ACL Levels: private (1), team (2), swarm (3), project (4), public (5), system (6)

-- Enable foreign keys and WAL mode for performance
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000; -- 64MB cache
PRAGMA temp_store = memory;
PRAGMA mmap_size = 268435456; -- 256GB memory-mapped I/O

-- 1. AGENTS table - Agent registry with ACL and project support
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('architect', 'coder', 'tester', 'reviewer', 'backend-dev', 'frontend-dev', 'security-specialist', 'perf-analyzer', 'api-docs', 'researcher', 'planner', 'devops-engineer', 'cicd-engineer', 'system')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'terminated')),
    swarm_id TEXT NOT NULL,
    team_id TEXT,
    project_id TEXT,
    capabilities TEXT, -- JSON array of capabilities
    metadata TEXT, -- JSON metadata
    acl_level INTEGER NOT NULL DEFAULT 2 CHECK (acl_level BETWEEN 1 AND 6),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME,
    performance_metrics TEXT, -- JSON performance data
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- PROJECTS table - Project management and isolation
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived', 'suspended')),
    owner_id TEXT NOT NULL,
    acl_level INTEGER NOT NULL DEFAULT 4 CHECK (acl_level BETWEEN 1 AND 6),
    configuration TEXT, -- JSON project configuration
    metadata TEXT, -- JSON metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    FOREIGN KEY (owner_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- 2. EVENTS table - Event bus with TTL and ACL
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    target TEXT,
    payload TEXT, -- JSON payload
    priority INTEGER DEFAULT 0 CHECK (priority BETWEEN 0 AND 10),
    acl_level INTEGER NOT NULL DEFAULT 3 CHECK (acl_level BETWEEN 1 AND 6),
    swarm_id TEXT NOT NULL,
    agent_id TEXT,
    project_id TEXT,
    parent_event_id TEXT,
    event_chain TEXT, -- JSON array of event chain
    tags TEXT, -- JSON array of tags
    ttl_seconds INTEGER DEFAULT 86400, -- 24 hours default TTL
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    processing_duration_ms INTEGER,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_event_id) REFERENCES events(id) ON DELETE SET NULL
);

-- 3. TASKS table - Task management with dependencies
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled', 'blocked')),
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    swarm_id TEXT NOT NULL,
    agent_id TEXT,
    assigned_team_id TEXT,
    project_id TEXT,
    parent_task_id TEXT,
    requirements TEXT, -- JSON requirements
    deliverables TEXT, -- JSON deliverables
    progress INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    estimated_hours INTEGER,
    actual_hours INTEGER,
    start_time DATETIME,
    end_time DATETIME,
    deadline DATETIME,
    acl_level INTEGER NOT NULL DEFAULT 2 CHECK (acl_level BETWEEN 1 AND 6),
    confidence_score REAL CHECK (confidence_score BETWEEN 0.0 AND 1.0),
    blockers TEXT, -- JSON array of blockers
    metadata TEXT, -- JSON metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- 4. MEMORY table - Swarm memory with encryption and compression
CREATE TABLE IF NOT EXISTS memory (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    value TEXT NOT NULL, -- Encrypted value
    namespace TEXT NOT NULL DEFAULT 'default',
    type TEXT NOT NULL CHECK (type IN ('state', 'data', 'cache', 'session', 'artifact')),
    swarm_id TEXT NOT NULL,
    agent_id TEXT,
    team_id TEXT,
    project_id TEXT,
    acl_level INTEGER NOT NULL DEFAULT 2 CHECK (acl_level BETWEEN 1 AND 6),
    compression_type TEXT DEFAULT 'lz4' CHECK (compression_type IN ('none', 'lz4', 'gzip')),
    encryption_type TEXT DEFAULT 'aes-256-gcm' CHECK (encryption_type IN ('none', 'aes-256-gcm')),
    iv TEXT, -- Initialization vector for encryption
    version INTEGER DEFAULT 1,
    parent_memory_id TEXT,
    memory_path TEXT, -- JSON array representing memory hierarchy
    tags TEXT, -- JSON array of tags
    ttl_seconds INTEGER,
    expires_at DATETIME,
    access_count INTEGER DEFAULT 0,
    last_accessed_at DATETIME,
    size_bytes INTEGER,
    checksum TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_memory_id) REFERENCES memory(id) ON DELETE SET NULL,
    UNIQUE(key, namespace, swarm_id, project_id)
);

-- 5. CONSENSUS table - Consensus tracking and validation
CREATE TABLE IF NOT EXISTS consensus (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('gate', 'validation', 'approval', 'decision')),
    target_id TEXT NOT NULL, -- ID of the target (task, event, etc.)
    target_type TEXT NOT NULL CHECK (target_type IN ('task', 'event', 'phase', 'sprint', 'epic')),
    swarm_id TEXT NOT NULL,
    phase TEXT,
    loop_number INTEGER,
    threshold REAL NOT NULL DEFAULT 0.90 CHECK (threshold BETWEEN 0.0 AND 1.0),
    current_score REAL DEFAULT 0.0 CHECK (current_score BETWEEN 0.0 AND 1.0),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'achieved', 'failed', 'expired')),
    total_participants INTEGER DEFAULT 0,
    required_participants INTEGER,
    acl_level INTEGER NOT NULL DEFAULT 3 CHECK (acl_level BETWEEN 1 AND 5),
    voting_strategy TEXT DEFAULT 'weighted' CHECK (voting_strategy IN ('simple', 'weighted', 'unanimous', 'majority')),
    deadline DATETIME,
    metadata TEXT, -- JSON metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE
);

-- 6. PERMISSIONS table - ACL permission management
CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL, -- Agent or team ID
    entity_type TEXT NOT NULL CHECK (entity_type IN ('agent', 'team', 'swarm', 'project')),
    resource_type TEXT NOT NULL CHECK (resource_type IN ('memory', 'task', 'event', 'consensus', 'metrics', 'audit', 'system', 'project')),
    resource_id TEXT, -- Specific resource ID or NULL for type-wide
    project_id TEXT, -- Project context for permission
    permission_level INTEGER NOT NULL CHECK (permission_level BETWEEN 1 AND 6),
    actions TEXT NOT NULL, -- JSON array of allowed actions
    conditions TEXT, -- JSON conditions for access
    granted_by TEXT, -- Who granted this permission
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT 1,
    metadata TEXT, -- JSON metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (granted_by) REFERENCES agents(id) ON DELETE SET NULL,
    UNIQUE(entity_id, entity_type, resource_type, resource_id, project_id, permission_level)
);

-- 7. AUDIT_LOG table - Comprehensive audit trail
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('agent', 'task', 'event', 'memory', 'consensus', 'permission', 'system')),
    action TEXT NOT NULL,
    old_values TEXT, -- JSON of previous state
    new_values TEXT, -- JSON of new state
    changed_by TEXT,
    swarm_id TEXT,
    session_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    acl_level INTEGER NOT NULL DEFAULT 4 CHECK (acl_level BETWEEN 1 AND 5),
    risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    category TEXT,
    tags TEXT, -- JSON array of tags
    metadata TEXT, -- JSON metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (changed_by) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE SET NULL
);

-- 8. METRICS table - Performance and operational metrics
CREATE TABLE IF NOT EXISTS metrics (
    id TEXT PRIMARY KEY,
    metric_name TEXT NOT NULL,
    metric_type TEXT NOT NULL CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'timer', 'text')),
    value REAL NOT NULL,
    unit TEXT,
    labels TEXT, -- JSON labels
    dimensions TEXT, -- JSON dimensions for multi-dimensional analysis
    swarm_id TEXT,
    agent_id TEXT,
    task_id TEXT,
    acl_level INTEGER NOT NULL DEFAULT 4 CHECK (acl_level BETWEEN 1 AND 5),
    aggregation_type TEXT DEFAULT 'sum' CHECK (aggregation_type IN ('sum', 'avg', 'min', 'max', 'count')),
    retention_days INTEGER DEFAULT 30,
    time_bucket TEXT, -- For time-series aggregation (hourly, daily, etc.)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    INDEX idx_metrics_time_bucket (time_bucket),
    INDEX idx_metrics_name_type (metric_name, metric_type)
);

-- 9. DEPENDENCIES table - Task and resource dependencies
CREATE TABLE IF NOT EXISTS dependencies (
    id TEXT PRIMARY KEY,
    dependent_id TEXT NOT NULL, -- The entity that depends
    dependent_type TEXT NOT NULL CHECK (dependent_type IN ('task', 'memory', 'event', 'agent')),
    dependency_id TEXT NOT NULL, -- The entity being depended on
    dependency_type TEXT NOT NULL CHECK (dependency_type IN ('task', 'memory', 'event', 'agent', 'resource')),
    dependency_type_name TEXT NOT NULL CHECK (dependency_type_name IN ('hard', 'soft', 'optional', 'circular', 'conditional')),
    swarm_id TEXT NOT NULL,
    acl_level INTEGER NOT NULL DEFAULT 3 CHECK (acl_level BETWEEN 1 AND 5),
    conditions TEXT, -- JSON conditions for dependency
    metadata TEXT, -- JSON metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    is_resolved BOOLEAN DEFAULT 0,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE,
    UNIQUE(dependent_id, dependency_id, dependency_type_name)
);

-- 10. CONFLICTS table - Conflict detection and resolution
CREATE TABLE IF NOT EXISTS conflicts (
    id TEXT PRIMARY KEY,
    conflict_type TEXT NOT NULL CHECK (conflict_type IN ('resource', 'data', 'access', 'priority', 'dependency', 'version', 'consensus')),
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    entity1_id TEXT NOT NULL,
    entity1_type TEXT NOT NULL CHECK (entity1_type IN ('task', 'memory', 'event', 'agent', 'consensus')),
    entity2_id TEXT NOT NULL,
    entity2_type TEXT NOT NULL CHECK (entity2_type IN ('task', 'memory', 'event', 'agent', 'consensus')),
    description TEXT,
    conflict_details TEXT, -- JSON conflict details
    resolution_strategy TEXT,
    resolution_status TEXT DEFAULT 'unresolved' CHECK (resolution_status IN ('unresolved', 'in_progress', 'resolved', 'escalated')),
    resolved_by TEXT,
    swarm_id TEXT NOT NULL,
    acl_level INTEGER NOT NULL DEFAULT 3 CHECK (acl_level BETWEEN 1 AND 5),
    auto_resolution BOOLEAN DEFAULT 0,
    escalation_threshold INTEGER DEFAULT 3,
    metadata TEXT, -- JSON metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_by) REFERENCES agents(id) ON DELETE SET NULL
);

-- 11. ARTIFACTS table - Generated artifacts and outputs
CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('code', 'documentation', 'test', 'config', 'binary', 'data', 'model', 'report', 'other')),
    format TEXT, -- File format (json, yaml, js, sql, etc.)
    content TEXT, -- Encrypted content or reference to storage
    content_hash TEXT,
    size_bytes INTEGER,
    swarm_id TEXT NOT NULL,
    agent_id TEXT,
    task_id TEXT,
    version INTEGER DEFAULT 1,
    parent_artifact_id TEXT,
    artifact_chain TEXT, -- JSON array of artifact lineage
    tags TEXT, -- JSON array of tags
    metadata TEXT, -- JSON metadata including build info, dependencies
    acl_level INTEGER NOT NULL DEFAULT 2 CHECK (acl_level BETWEEN 1 AND 5),
    storage_location TEXT, -- Path or reference to external storage
    checksum TEXT,
    is_compressed BOOLEAN DEFAULT 0,
    compression_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL
);

-- 12. SWARMS table - Swarm metadata and configuration
CREATE TABLE IF NOT EXISTS swarms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    strategy TEXT NOT NULL DEFAULT 'development' CHECK (strategy IN ('development', 'research', 'testing', 'deployment', 'optimization')),
    mode TEXT NOT NULL DEFAULT 'mesh' CHECK (mode IN ('mesh', 'hierarchical', 'centralized', 'decentralized')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'completed', 'failed')),
    max_agents INTEGER DEFAULT 10,
    current_agents INTEGER DEFAULT 0,
    objective TEXT,
    epic TEXT,
    phase TEXT,
    sprint TEXT,
    configuration TEXT, -- JSON configuration
    performance_metrics TEXT, -- JSON metrics
    acl_level INTEGER NOT NULL DEFAULT 3 CHECK (acl_level BETWEEN 1 AND 5),
    consensus_threshold REAL DEFAULT 0.90 CHECK (consensus_threshold BETWEEN 0.0 AND 1.0),
    retry_policy TEXT, -- JSON retry policy
    timeout_policy TEXT, -- JSON timeout settings
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    metadata TEXT -- JSON metadata
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_agents_swarm_id ON agents(swarm_id);
CREATE INDEX IF NOT EXISTS idx_agents_team_id ON agents(team_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);

CREATE INDEX IF NOT EXISTS idx_events_swarm_id ON events(swarm_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_expires_at ON events(expires_at);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_target ON events(target);
CREATE INDEX IF NOT EXISTS idx_events_acl_level ON events(acl_level);

CREATE INDEX IF NOT EXISTS idx_tasks_swarm_id ON tasks(swarm_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_acl_level ON tasks(acl_level);

CREATE INDEX IF NOT EXISTS idx_memory_swarm_id ON memory(swarm_id);
CREATE INDEX IF NOT EXISTS idx_memory_agent_id ON memory(agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_namespace ON memory(namespace);
CREATE INDEX IF NOT EXISTS idx_memory_type ON memory(type);
CREATE INDEX IF NOT EXISTS idx_memory_key ON memory(key);
CREATE INDEX IF NOT EXISTS idx_memory_expires_at ON memory(expires_at);
CREATE INDEX IF NOT EXISTS idx_memory_acl_level ON memory(acl_level);
CREATE INDEX IF NOT EXISTS idx_memory_last_accessed ON memory(last_accessed_at);

CREATE INDEX IF NOT EXISTS idx_consensus_swarm_id ON consensus(swarm_id);
CREATE INDEX IF NOT EXISTS idx_consensus_target_id ON consensus(target_id);
CREATE INDEX IF NOT EXISTS idx_consensus_type ON consensus(type);
CREATE INDEX IF NOT EXISTS idx_consensus_status ON consensus(status);
CREATE INDEX IF NOT EXISTS idx_consensus_phase ON consensus(phase);
CREATE INDEX IF NOT EXISTS idx_consensus_loop_number ON consensus(loop_number);
CREATE INDEX IF NOT EXISTS idx_consensus_acl_level ON consensus(acl_level);

CREATE INDEX IF NOT EXISTS idx_permissions_entity_id ON permissions(entity_id);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_id ON permissions(resource_id);
CREATE INDEX IF NOT EXISTS idx_permissions_entity_type ON permissions(entity_type);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_type ON permissions(resource_type);
CREATE INDEX IF NOT EXISTS idx_permissions_permission_level ON permissions(permission_level);
CREATE INDEX IF NOT EXISTS idx_permissions_is_active ON permissions(is_active);

CREATE INDEX IF NOT EXISTS idx_audit_entity_id ON audit_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON audit_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_changed_by ON audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_swarm_id ON audit_log(swarm_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_risk_level ON audit_log(risk_level);
CREATE INDEX IF NOT EXISTS idx_audit_acl_level ON audit_log(acl_level);

CREATE INDEX IF NOT EXISTS idx_dependencies_dependent_id ON dependencies(dependent_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_dependency_id ON dependencies(dependency_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_swarm_id ON dependencies(swarm_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_is_resolved ON dependencies(is_resolved);
CREATE INDEX IF NOT EXISTS idx_dependencies_acl_level ON dependencies(acl_level);

CREATE INDEX IF NOT EXISTS idx_conflicts_entity1_id ON conflicts(entity1_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_entity2_id ON conflicts(entity2_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_swarm_id ON conflicts(swarm_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_severity ON conflicts(severity);
CREATE INDEX IF NOT EXISTS idx_conflicts_resolution_status ON conflicts(resolution_status);
CREATE INDEX IF NOT EXISTS idx_conflicts_acl_level ON conflicts(acl_level);

CREATE INDEX IF NOT EXISTS idx_artifacts_swarm_id ON artifacts(swarm_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_agent_id ON artifacts(agent_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_content_hash ON artifacts(content_hash);
CREATE INDEX IF NOT EXISTS idx_artifacts_parent_artifact_id ON artifacts(parent_artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_acl_level ON artifacts(acl_level);

CREATE INDEX IF NOT EXISTS idx_swarms_status ON swarms(status);
CREATE INDEX IF NOT EXISTS idx_swarms_strategy ON swarms(strategy);
CREATE INDEX IF NOT EXISTS idx_swarms_mode ON swarms(mode);
CREATE INDEX IF NOT EXISTS idx_swarms_phase ON swarms(phase);
CREATE INDEX IF NOT EXISTS idx_swarms_acl_level ON swarms(acl_level);

-- Triggers for automatic timestamp updates and TTL management
CREATE TRIGGER IF NOT EXISTS update_agents_timestamp
    AFTER UPDATE ON agents
BEGIN
    UPDATE agents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_tasks_timestamp
    AFTER UPDATE ON tasks
BEGIN
    UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_memory_timestamp_and_access
    AFTER UPDATE ON memory
BEGIN
    UPDATE memory SET updated_at = CURRENT_TIMESTAMP, access_count = access_count + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_consensus_timestamp
    AFTER UPDATE ON consensus
BEGIN
    UPDATE consensus SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_permissions_timestamp
    AFTER UPDATE ON permissions
BEGIN
    UPDATE permissions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_conflicts_timestamp
    AFTER UPDATE ON conflicts
BEGIN
    UPDATE conflicts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_artifacts_timestamp
    AFTER UPDATE ON artifacts
BEGIN
    UPDATE artifacts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_swarms_timestamp
    AFTER UPDATE ON swarms
BEGIN
    UPDATE swarms SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- TTL cleanup triggers (run via scheduled jobs)
CREATE TRIGGER IF NOT EXISTS cleanup_expired_events
    AFTER INSERT ON events
BEGIN
    DELETE FROM events WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS cleanup_expired_memory
    AFTER INSERT ON memory
BEGIN
    DELETE FROM memory WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;
END;