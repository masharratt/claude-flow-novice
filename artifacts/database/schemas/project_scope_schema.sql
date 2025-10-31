-- PostgreSQL Schema for Project Scope Management
-- Version: 1.0.0
-- Created: 2025-06-17
-- Purpose: Define project scope, boundaries, and deliverables tracking

-- =============================================
-- PROJECT SCHEMA
-- =============================================

-- Enable UUID extension for unique identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable JSONB support for flexible metadata storage
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For GIN indexes on JSONB

-- =============================================
-- PROJECTS TABLE
-- Core project information and metadata
-- =============================================

CREATE TABLE IF NOT EXISTS projects (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Project Identification
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    
    -- Project Classification
    project_type TEXT NOT NULL CHECK (
        project_type IN ('epic', 'feature', 'bugfix', 'maintenance', 'research', 'infrastructure')
    ),
    priority_level INTEGER NOT NULL DEFAULT 3 CHECK (priority_level BETWEEN 1 AND 5),
    
    -- Project Status
    status TEXT NOT NULL DEFAULT 'planning' CHECK (
        status IN ('planning', 'in_progress', 'testing', 'review', 'completed', 'cancelled', 'on_hold')
    ),
    
    -- Timeline
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    deadline TIMESTAMP WITH TIME ZONE,
    
    -- Team and Ownership
    created_by TEXT NOT NULL,
    assigned_to TEXT,
    team_id UUID,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT valid_deadline CHECK (deadline IS NULL OR deadline > created_at),
    CONSTRAINT valid_completion CHECK (completed_at IS NULL OR completed_at >= started_at)
);

-- =============================================
-- SCOPE_DEFINITIONS TABLE
-- Defines what is in and out of scope for projects
-- =============================================

CREATE TABLE IF NOT EXISTS scope_definitions (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Project Reference
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Scope Classification
    scope_type TEXT NOT NULL CHECK (
        scope_type IN ('in_scope', 'out_of_scope', 'conditional', 'future_phase')
    ),
    
    -- Scope Item Details
    category TEXT NOT NULL, -- e.g., 'features', 'components', 'technologies', 'processes'
    item_name TEXT NOT NULL,
    description TEXT,
    
    -- Priority and Risk
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    risk_level INTEGER DEFAULT 2 CHECK (risk_level BETWEEN 1 AND 5),
    complexity_level INTEGER DEFAULT 2 CHECK (complexity_level BETWEEN 1 AND 5),
    
    -- Acceptance Criteria
    acceptance_criteria TEXT,
    success_metrics JSONB DEFAULT '[]',
    
    -- Dependencies
    depends_on UUID[] DEFAULT '{}', -- References other scope items
    blocks UUID[] DEFAULT '{}', -- References items that depend on this
    
    -- Status Tracking
    status TEXT DEFAULT 'defined' CHECK (
        status IN ('defined', 'in_progress', 'completed', 'blocked', 'deferred', 'cancelled')
    ),
    completion_percentage DECIMAL(5,2) DEFAULT 0.00 CHECK (completion_percentage BETWEEN 0 AND 100),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT unique_scope_item UNIQUE (project_id, scope_type, category, item_name)
);

-- =============================================
-- DELIVERABLES TABLE
-- Tracks specific deliverables and their status
-- =============================================

CREATE TABLE IF NOT EXISTS deliverables (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Project Reference
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scope_item_id UUID REFERENCES scope_definitions(id) ON DELETE SET NULL,
    
    -- Deliverable Details
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (
        type IN ('document', 'code', 'test', 'infrastructure', 'configuration', 'report', 'artifact')
    ),
    file_path TEXT,
    file_type TEXT,
    
    -- Quality and Validation
    acceptance_criteria TEXT NOT NULL,
    validation_method TEXT CHECK (
        validation_method IN ('manual_review', 'automated_test', 'peer_review', 'stakeholder_approval', 'measurable_metric')
    ),
    quality_standards JSONB DEFAULT '{}',
    
    -- Status Tracking
    status TEXT DEFAULT 'planned' CHECK (
        status IN ('planned', 'in_progress', 'review', 'approved', 'rejected', 'completed')
    ),
    completion_percentage DECIMAL(5,2) DEFAULT 0.00 CHECK (completion_percentage BETWEEN 0 AND 100),
    
    -- Review and Approval
    reviewer_id TEXT,
    review_date TIMESTAMP WITH TIME ZONE,
    approval_status TEXT CHECK (
        approval_status IN ('pending', 'approved', 'approved_with_changes', 'rejected')
    ),
    approval_comments TEXT,
    
    -- Metrics
    estimated_effort_hours DECIMAL(8,2),
    actual_effort_hours DECIMAL(8,2),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT unique_deliverable UNIQUE (project_id, name),
    CONSTRAINT valid_completion_date CHECK (completed_at IS NULL OR completed_at >= created_at)
);

-- =============================================
-- SCOPE_CHANGES TABLE
-- Tracks changes to project scope over time
-- =============================================

CREATE TABLE IF NOT EXISTS scope_changes (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Project Reference
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Change Details
    change_type TEXT NOT NULL CHECK (
        change_type IN ('added', 'removed', 'modified', 'deferred', 'escalated')
    ),
    change_category TEXT NOT NULL, -- e.g., 'scope_item', 'deliverable', 'acceptance_criteria'
    
    -- Change Description
    item_id UUID, -- References the item being changed
    item_type TEXT, -- scope_definition or deliverable
    item_description TEXT NOT NULL,
    
    -- Change Details
    previous_value JSONB,
    new_value JSONB,
    change_reason TEXT NOT NULL,
    justification TEXT,
    
    -- Impact Assessment
    impact_level TEXT CHECK (
        impact_level IN ('low', 'medium', 'high', 'critical')
    ),
    schedule_impact_days INTEGER DEFAULT 0,
    cost_impact_estimate DECIMAL(12,2),
    risk_impact TEXT CHECK (
        risk_impact IN ('none', 'low', 'medium', 'high', 'critical')
    ),
    
    -- Approval
    requested_by TEXT NOT NULL,
    approved_by TEXT,
    approval_status TEXT DEFAULT 'pending' CHECK (
        approval_status IN ('pending', 'approved', 'rejected', 'deferred')
    ),
    approval_date TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    implemented_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_implementation CHECK (implemented_at IS NULL OR implemented_at >= created_at)
);

-- =============================================
-- MILESTONES TABLE
-- Tracks major project milestones
-- =============================================

CREATE TABLE IF NOT EXISTS milestones (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Project Reference
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Milestone Details
    name TEXT NOT NULL,
    description TEXT,
    milestone_type TEXT CHECK (
        milestone_type IN ('phase_completion', 'deliverable_delivery', 'review_gate', 'go_no_go', 'testing_complete')
    ),
    
    -- Deliverables Required
    required_deliverables UUID[] DEFAULT '{}', -- References deliverables
    
    -- Success Criteria
    success_criteria TEXT NOT NULL,
    exit_criteria JSONB DEFAULT '{}',
    
    -- Status
    status TEXT DEFAULT 'planned' CHECK (
        status IN ('planned', 'in_progress', 'completed', 'missed', 'cancelled')
    ),
    
    -- Dates
    planned_date DATE NOT NULL,
    actual_date DATE,
    
    -- Dependencies
    depends_on_milestones UUID[] DEFAULT '{}',
    
    -- Review
    review_comments TEXT,
    reviewer_id TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Projects table indexes
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_priority ON projects(priority_level DESC);
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(project_type);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_team ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);

-- Scope definitions indexes
CREATE INDEX IF NOT EXISTS idx_scope_project ON scope_definitions(project_id);
CREATE INDEX IF NOT EXISTS idx_scope_type ON scope_definitions(scope_type);
CREATE INDEX IF NOT EXISTS idx_scope_category ON scope_definitions(category);
CREATE INDEX IF NOT EXISTS idx_scope_status ON scope_definitions(status);
CREATE INDEX IF NOT EXISTS idx_scope_priority ON scope_definitions(priority_level DESC);
CREATE INDEX IF NOT EXISTS idx_scope_completion ON scope_definitions(completion_percentage DESC);

-- Deliverables indexes
CREATE INDEX IF NOT EXISTS idx_deliverables_project ON deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_status ON deliverables(status);
CREATE INDEX IF NOT EXISTS idx_deliverables_type ON deliverables(type);
CREATE INDEX IF NOT EXISTS idx_deliverables_scope_item ON deliverables(scope_item_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_due_date ON deliverables(due_date);
CREATE INDEX IF NOT EXISTS idx_deliverables_completion ON deliverables(completion_percentage DESC);

-- Scope changes indexes
CREATE INDEX IF NOT EXISTS idx_scope_changes_project ON scope_changes(project_id);
CREATE INDEX IF NOT EXISTS idx_scope_changes_type ON scope_changes(change_type);
CREATE INDEX IF NOT EXISTS idx_scope_changes_date ON scope_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scope_changes_status ON scope_changes(approval_status);

-- Milestones indexes
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_planned ON milestones(planned_date);
CREATE INDEX IF NOT EXISTS idx_milestones_actual ON milestones(actual_date);

-- JSONB indexes for metadata queries
CREATE INDEX IF NOT EXISTS idx_projects_metadata_gin ON projects USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_scope_metadata_gin ON scope_definitions USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_deliverables_metadata_gin ON deliverables USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_scope_changes_metadata_gin ON scope_changes USING GIN (metadata);

-- =============================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =============================================

-- Update updated_at timestamp for projects
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at 
    BEFORE UPDATE ON projects 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scope_definitions_updated_at 
    BEFORE UPDATE ON scope_definitions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deliverables_updated_at 
    BEFORE UPDATE ON deliverables 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_milestones_updated_at 
    BEFORE UPDATE ON milestones 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

-- Project Summary View
CREATE OR REPLACE VIEW v_project_summary AS
SELECT 
    p.id,
    p.name,
    p.slug,
    p.project_type,
    p.priority_level,
    p.status,
    p.created_at,
    p.updated_at,
    p.deadline,
    COUNT(DISTINCT sd.id) as total_scope_items,
    COUNT(DISTINCT CASE WHEN sd.scope_type = 'in_scope' THEN sd.id END) as in_scope_items,
    COUNT(DISTINCT CASE WHEN sd.scope_type = 'out_of_scope' THEN sd.id END) as out_of_scope_items,
    COUNT(DISTINCT d.id) as total_deliverables,
    COUNT(DISTINCT CASE WHEN d.status = 'completed' THEN d.id END) as completed_deliverables,
    ROUND(
        COUNT(DISTINCT CASE WHEN d.status = 'completed' THEN d.id END) * 100.0 / 
        NULLIF(COUNT(DISTINCT d.id), 0), 2
    ) as completion_percentage,
    COUNT(DISTINCT CASE WHEN m.status = 'completed' THEN m.id END) as completed_milestones,
    COUNT(DISTINCT m.id) as total_milestones
FROM projects p
LEFT JOIN scope_definitions sd ON p.id = sd.project_id
LEFT JOIN deliverables d ON p.id = d.project_id
LEFT JOIN milestones m ON p.id = m.project_id
GROUP BY p.id, p.name, p.slug, p.project_type, p.priority_level, p.status, p.created_at, p.updated_at, p.deadline;

-- Active Scope Items View
CREATE OR REPLACE VIEW v_active_scope_items AS
SELECT 
    sd.*,
    p.name as project_name,
    p.status as project_status
FROM scope_definitions sd
JOIN projects p ON sd.project_id = p.id
WHERE sd.status NOT IN ('completed', 'cancelled')
  AND p.status NOT IN ('completed', 'cancelled')
ORDER BY sd.priority_level DESC, sd.created_at;

-- Overdue Deliverables View
CREATE OR REPLACE VIEW v_overdue_deliverables AS
SELECT 
    d.*,
    p.name as project_name,
    p.status as project_status,
    (CURRENT_DATE - d.due_date::date) as days_overdue
FROM deliverables d
JOIN projects p ON d.project_id = p.id
WHERE d.due_date < CURRENT_DATE
  AND d.status NOT IN ('completed', 'cancelled')
  AND p.status NOT IN ('completed', 'cancelled')
ORDER BY days_overdue DESC;

-- =============================================
-- SCHEMA VERSION
-- =============================================

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

INSERT INTO schema_version (version, description)
VALUES (1, 'Initial PostgreSQL schema for project scope management')
ON CONFLICT (version) DO NOTHING;

-- =============================================
-- SAMPLE DATA (Optional - for testing)
-- =============================================

-- Comment out or remove for production
/*
-- Sample Project
INSERT INTO projects (name, slug, description, project_type, priority_level, created_by)
VALUES (
    'Authentication System Implementation',
    'auth-system-impl',
    'Implement comprehensive JWT-based authentication system with role-based access control',
    'feature',
    1,
    'system-architect'
) ON CONFLICT (slug) DO NOTHING;

-- Sample Scope Items
INSERT INTO scope_definitions (project_id, scope_type, category, item_name, description, acceptance_criteria)
SELECT 
    p.id,
    'in_scope',
    'features',
    'JWT Token Generation',
    'Generate secure JWT tokens for user authentication',
    'Tokens include user ID, roles, and expiration; tokens are cryptographically signed'
FROM projects p WHERE p.slug = 'auth-system-impl' ON CONFLICT (project_id, scope_type, category, item_name) DO NOTHING;

INSERT INTO scope_definitions (project_id, scope_type, category, item_name, description, acceptance_criteria)
SELECT 
    p.id,
    'out_of_scope',
    'features',
    'OAuth Integration',
    'Integration with third-party OAuth providers',
    'Not included in current phase'
FROM projects p WHERE p.slug = 'auth-system-impl' ON CONFLICT (project_id, scope_type, category, item_name) DO NOTHING;
*/

-- =============================================
-- PERFORMANCE TUNING
-- =============================================

-- PostgreSQL-specific optimizations
-- Adjust these based on your PostgreSQL version and workload

-- Enable parallel query processing (PostgreSQL 9.6+)
SET max_parallel_workers_per_gather = 2;

-- Increase work_mem for complex queries (adjust based on available RAM)
-- SET work_mem = '256MB';

-- Enable statement timeout for long-running queries
-- SET statement_timeout = '5min';

-- Statistics target for better query planning
ALTER TABLE projects ALTER COLUMN id SET STATISTICS 100;
ALTER TABLE scope_definitions ALTER COLUMN id SET STATISTICS 100;
ALTER TABLE deliverables ALTER COLUMN id SET STATISTICS 100;