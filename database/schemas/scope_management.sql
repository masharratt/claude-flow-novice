-- Scope Management System PostgreSQL Schema
-- Created for sprint-1-1-1761878936
-- Supports hierarchical scope definitions with inheritance and constraints

-- Enable UUID extension for unique identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- SCOPE DEFINITIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS scopes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    parent_scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('system', 'project', 'feature', 'task', 'subtask')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT unique_scope_name_per_parent UNIQUE(name, parent_scope_id)
);

-- =============================================
-- SCOPE BOUNDARIES TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS scope_boundaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scope_id UUID NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
    boundary_type TEXT NOT NULL CHECK (boundary_type IN ('inclusion', 'exclusion', 'dependency')),
    boundary_name TEXT NOT NULL,
    boundary_value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_scope_boundary UNIQUE(scope_id, boundary_type, boundary_name)
);

-- =============================================
-- SCOPE RELATIONSHIPS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS scope_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_scope_id UUID NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
    target_scope_id UUID NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN ('contains', 'depends_on', 'conflicts_with', 'extends')),
    strength REAL DEFAULT 1.0 CHECK (strength BETWEEN 0.0 AND 1.0),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_scope_relationship UNIQUE(source_scope_id, target_scope_id, relationship_type)
);

-- =============================================
-- SCOPE VALIDATIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS scope_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scope_id UUID NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
    validation_rule TEXT NOT NULL,
    validation_type TEXT NOT NULL CHECK (validation_type IN ('mandatory', 'optional', 'forbidden')),
    validation_value TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- SCOPE AUDIT LOG TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS scope_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scope_id UUID NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'activated', 'deactivated')),
    old_values JSONB,
    new_values JSONB,
    changed_by TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Scopes table indexes
CREATE INDEX IF NOT EXISTS idx_scopes_parent_scope_id ON scopes(parent_scope_id);
CREATE INDEX IF NOT EXISTS idx_scopes_scope_type ON scopes(scope_type);
CREATE INDEX IF NOT EXISTS idx_scopes_status ON scopes(status);
CREATE INDEX IF NOT EXISTS idx_scopes_priority ON scopes(priority);
CREATE INDEX IF NOT EXISTS idx_scopes_created_at ON scopes(created_at);
CREATE INDEX IF NOT EXISTS idx_scopes_name_gin ON scopes USING gin(name gin_trgm_ops);

-- Scope boundaries indexes
CREATE INDEX IF NOT EXISTS idx_scope_boundaries_scope_id ON scope_boundaries(scope_id);
CREATE INDEX IF NOT EXISTS idx_scope_boundaries_type ON scope_boundaries(boundary_type);
CREATE INDEX IF NOT EXISTS idx_scope_boundaries_value_gin ON scope_boundaries USING gin(boundary_value gin_trgm_ops);

-- Scope relationships indexes
CREATE INDEX IF NOT EXISTS idx_scope_relationships_source ON scope_relationships(source_scope_id);
CREATE INDEX IF NOT EXISTS idx_scope_relationships_target ON scope_relationships(target_scope_id);
CREATE INDEX IF NOT EXISTS idx_scope_relationships_type ON scope_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_scope_relationships_strength ON scope_relationships(strength);

-- Scope validations indexes
CREATE INDEX IF NOT EXISTS idx_scope_validations_scope_id ON scope_validations(scope_id);
CREATE INDEX IF NOT EXISTS idx_scope_validations_type ON scope_validations(validation_type);
CREATE INDEX IF NOT EXISTS idx_scope_validations_active ON scope_validations(is_active);

-- Scope audit log indexes
CREATE INDEX IF NOT EXISTS idx_scope_audit_scope_id ON scope_audit_log(scope_id);
CREATE INDEX IF NOT EXISTS idx_scope_audit_action ON scope_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_scope_audit_timestamp ON scope_audit_log(timestamp);

-- =============================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =============================================

-- Update updated_at timestamp for scopes
CREATE OR REPLACE FUNCTION update_scopes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_scopes_updated_at
    BEFORE UPDATE ON scopes
    FOR EACH ROW
    EXECUTE FUNCTION update_scopes_updated_at();

-- Update updated_at timestamp for scope boundaries
CREATE OR REPLACE FUNCTION update_scope_boundaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_scope_boundaries_updated_at
    BEFORE UPDATE ON scope_boundaries
    FOR EACH ROW
    EXECUTE FUNCTION update_scope_boundaries_updated_at();

-- Update updated_at timestamp for scope relationships
CREATE OR REPLACE FUNCTION update_scope_relationships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_scope_relationships_updated_at
    BEFORE UPDATE ON scope_relationships
    FOR EACH ROW
    EXECUTE FUNCTION update_scope_relationships_updated_at();

-- Update updated_at timestamp for scope validations
CREATE OR REPLACE FUNCTION update_scope_validations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_scope_validations_updated_at
    BEFORE UPDATE ON scope_validations
    FOR EACH ROW
    EXECUTE FUNCTION update_scope_validations_updated_at();

-- Audit log trigger for scopes
CREATE OR REPLACE FUNCTION scope_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO scope_audit_log (scope_id, action, new_values, changed_by)
        VALUES (NEW.id, 'created', row_to_json(NEW), NEW.created_by);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO scope_audit_log (scope_id, action, old_values, new_values, changed_by)
        VALUES (NEW.id, 'updated', row_to_json(OLD), row_to_json(NEW), NEW.created_by);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO scope_audit_log (scope_id, action, old_values, changed_by)
        VALUES (OLD.id, 'deleted', row_to_json(OLD), NULL);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_scope_audit
    AFTER INSERT OR UPDATE OR DELETE ON scopes
    FOR EACH ROW
    EXECUTE FUNCTION scope_audit_trigger();

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

-- Hierarchical scope view with parent information
CREATE OR REPLACE VIEW scope_hierarchy AS
SELECT 
    s.id,
    s.name,
    s.description,
    s.parent_scope_id,
    parent.name as parent_name,
    s.scope_type,
    s.status,
    s.priority,
    s.created_at,
    s.updated_at,
    s.created_by,
    s.metadata,
    -- Calculate depth level
    (WITH RECURSIVE scope_tree AS (
        SELECT id, parent_scope_id, 0 as level
        FROM scopes WHERE id = s.id
        UNION ALL
        SELECT sc.id, sc.parent_scope_id, st.level + 1
        FROM scopes sc
        JOIN scope_tree st ON sc.id = st.parent_scope_id
    )
    SELECT MAX(level) FROM scope_tree) as depth_level
FROM scopes s
LEFT JOIN scopes parent ON s.parent_scope_id = parent.id;

-- Scope boundaries with scope information
CREATE OR REPLACE VIEW scope_boundaries_detail AS
SELECT 
    sb.id,
    sb.scope_id,
    s.name as scope_name,
    s.scope_type as scope_type,
    sb.boundary_type,
    sb.boundary_name,
    sb.boundary_value,
    sb.description,
    sb.created_at,
    sb.updated_at
FROM scope_boundaries sb
JOIN scopes s ON sb.scope_id = s.id;

-- Scope relationships with source and target information
CREATE OR REPLACE VIEW scope_relationships_detail AS
SELECT 
    sr.id,
    sr.source_scope_id,
    source.name as source_scope_name,
    sr.target_scope_id,
    target.name as target_scope_name,
    sr.relationship_type,
    sr.strength,
    sr.description,
    sr.created_at,
    sr.updated_at
FROM scope_relationships sr
JOIN scopes source ON sr.source_scope_id = source.id
JOIN scopes target ON sr.target_scope_id = target.id;

-- =============================================
-- SAMPLE DATA FOR TESTING
-- =============================================

-- Insert sample root scope
INSERT INTO scopes (name, description, scope_type, priority, created_by) VALUES
('Claude Flow Novice', 'Main project scope for Claude Flow Novice system', 'system', 1, 'system');

-- Insert sample project scopes
INSERT INTO scopes (name, description, parent_scope_id, scope_type, priority, created_by) VALUES
('Backend Services', 'Backend service development and maintenance', (SELECT id FROM scopes WHERE name = 'Claude Flow Novice'), 'project', 2, 'system'),
('Frontend Portal', 'Web frontend development', (SELECT id FROM scopes WHERE name = 'Claude Flow Novice'), 'project', 3, 'system'),
('Agent System', 'Agent coordination and orchestration', (SELECT id FROM scopes WHERE name = 'Claude Flow Novice'), 'project', 1, 'system');

-- Insert sample feature scopes
INSERT INTO scopes (name, description, parent_scope_id, scope_type, priority, created_by) VALUES
('API Development', 'REST API endpoints and services', (SELECT id FROM scopes WHERE name = 'Backend Services'), 'feature', 2, 'backend-team'),
('Database Schema', 'Database structure and migrations', (SELECT id FROM scopes WHERE name = 'Backend Services'), 'feature', 1, 'backend-team'),
('Dashboard UI', 'Main dashboard interface', (SELECT id FROM scopes WHERE name = 'Frontend Portal'), 'feature', 3, 'frontend-team'),
('CFN Loop', 'Consensus-First Novice Loop system', (SELECT id FROM scopes WHERE name = 'Agent System'), 'feature', 1, 'agent-team');

-- Insert sample boundaries
INSERT INTO scope_boundaries (scope_id, boundary_type, boundary_name, boundary_value, description) VALUES
((SELECT id FROM scopes WHERE name = 'API Development'), 'inclusion', 'technologies', 'Node.js, Express, PostgreSQL', 'Allowed technologies for API development'),
((SELECT id FROM scopes WHERE name = 'API Development'), 'exclusion', 'technologies', 'Ruby on Rails, Django', 'Excluded frameworks'),
((SELECT id FROM scopes WHERE name = 'CFN Loop'), 'inclusion', 'components', 'Redis coordination, Agent spawning, Validation', 'Core CFN Loop components'),
((SELECT id FROM scopes WHERE name = 'CFN Loop'), 'exclusion', 'dependencies', 'External API calls', 'No external dependencies in CFN Loop');

-- Insert sample relationships
INSERT INTO scope_relationships (source_scope_id, target_scope_id, relationship_type, strength, description) VALUES
((SELECT id FROM scopes WHERE name = 'Dashboard UI'), (SELECT id FROM scopes WHERE name = 'API Development'), 'depends_on', 0.8, 'Dashboard depends on API endpoints'),
((SELECT id FROM scopes WHERE name = 'CFN Loop'), (SELECT id FROM scopes WHERE name = 'Database Schema'), 'depends_on', 0.6, 'CFN Loop may need database for persistence'),
((SELECT id FROM scopes WHERE name = 'API Development'), (SELECT id FROM scopes WHERE name = 'Database Schema'), 'depends_on', 0.9, 'API services require database');

-- =============================================
-- POSTGRESQL PERFORMANCE SETTINGS
-- =============================================

-- Recommended PostgreSQL configuration parameters for this schema
-- These should be set in postgresql.conf:

-- Memory settings (adjust based on available RAM)
-- shared_buffers = 256MB
-- effective_cache_size = 1GB
-- work_mem = 4MB
-- maintenance_work_mem = 64MB

-- Connection settings
-- max_connections = 100
-- shared_preload_libraries = 'pg_stat_statements'

-- Logging
-- log_statement = 'all'
-- log_min_duration_statement = 1000

-- Performance monitoring
-- track_activities = on
-- track_counts = on
-- track_io_timing = on
-- track_functions = all

-- =============================================
-- SAMPLE QUERIES FOR COMMON OPERATIONS
-- =============================================

-- Query: Get all active scopes with their hierarchy level
/*
SELECT 
    id, 
    name, 
    scope_type, 
    status, 
    priority,
    depth_level
FROM scope_hierarchy 
WHERE status = 'active'
ORDER BY depth_level, priority;
*/

-- Query: Get scope boundaries for a specific scope
/*
SELECT 
    boundary_type,
    boundary_name,
    boundary_value,
    description
FROM scope_boundaries_detail 
WHERE scope_name = 'API Development';
*/

-- Query: Get all dependencies for a scope
/*
SELECT 
    target_scope_name,
    strength,
    description
FROM scope_relationships_detail 
WHERE source_scope_name = 'Dashboard UI' 
AND relationship_type = 'depends_on'
ORDER BY strength DESC;
*/

-- Query: Get complete scope audit trail
/*
SELECT 
    action,
    timestamp,
    changed_by,
    description,
    CASE 
        WHEN action = 'updated' THEN 
            jsonb_pretty(old_values) || ' -> ' || jsonb_pretty(new_values)
        ELSE jsonb_pretty(COALESCE(old_values, new_values))
    END as changes
FROM scope_audit_log 
WHERE scope_id = (SELECT id FROM scopes WHERE name = 'CFN Loop')
ORDER BY timestamp DESC;
*/