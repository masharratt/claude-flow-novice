-- Adaptive Context Schema (ACE-inspired)
-- Incremental bullet-based context with metadata tracking
-- Integrates with existing 12-table schema

-- ADAPTIVE_CONTEXT table - Structured bullets with helpful/harmful counters
CREATE TABLE IF NOT EXISTS adaptive_context (
    id TEXT PRIMARY KEY,
    bullet_id TEXT NOT NULL UNIQUE, -- e.g., STRAT-001, PATTERN-017, EDGE-042
    category TEXT NOT NULL CHECK (category IN ('strategy', 'pattern', 'edge_case', 'domain_insight', 'anti_pattern', 'optimization')),
    content TEXT NOT NULL, -- The actual rule/insight/lesson
    helpful_count INTEGER DEFAULT 0,
    harmful_count INTEGER DEFAULT 0,
    confidence_score REAL DEFAULT 0.5 CHECK (confidence_score BETWEEN 0.0 AND 1.0),
    source_context TEXT NOT NULL, -- Task/phase/sprint that generated this
    source_task_id TEXT, -- FK to tasks table
    source_agent_id TEXT, -- FK to agents table
    tags TEXT, -- JSON array of tags
    embedding_vector TEXT, -- JSON array for semantic similarity (optional)
    parent_bullet_id TEXT, -- For bullet refinement/versioning
    version INTEGER DEFAULT 1,
    acl_level INTEGER NOT NULL DEFAULT 4 CHECK (acl_level BETWEEN 1 AND 6), -- Project-level by default
    swarm_id TEXT,
    project_id TEXT,
    is_active BOOLEAN DEFAULT 1,
    is_validated BOOLEAN DEFAULT 0, -- Requires human/PO validation
    validation_metadata TEXT, -- JSON validation details
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10), -- For context injection
    last_used_at DATETIME,
    usage_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archived_at DATETIME,
    FOREIGN KEY (source_task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (source_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_bullet_id) REFERENCES adaptive_context(id) ON DELETE SET NULL
);

-- CONTEXT_REFLECTIONS table - Raw reflection outputs before curation
CREATE TABLE IF NOT EXISTS context_reflections (
    id TEXT PRIMARY KEY,
    reflection_type TEXT NOT NULL CHECK (reflection_type IN ('success', 'failure', 'optimization', 'edge_case', 'pattern')),
    task_id TEXT NOT NULL,
    agent_id TEXT,
    execution_trace TEXT NOT NULL, -- JSON execution trace
    feedback_signals TEXT NOT NULL, -- JSON feedback (errors, metrics, test results)
    extracted_lessons TEXT NOT NULL, -- JSON array of proposed bullets
    curator_status TEXT DEFAULT 'pending' CHECK (curator_status IN ('pending', 'processing', 'merged', 'rejected', 'human_review')),
    merged_bullet_ids TEXT, -- JSON array of bullet IDs created from this reflection
    rejection_reason TEXT,
    acl_level INTEGER NOT NULL DEFAULT 3 CHECK (acl_level BETWEEN 1 AND 6),
    swarm_id TEXT NOT NULL,
    project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- CONTEXT_USAGE_LOG table - Track bullet usage for reinforcement
CREATE TABLE IF NOT EXISTS context_usage_log (
    id TEXT PRIMARY KEY,
    bullet_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    agent_id TEXT,
    usage_outcome TEXT NOT NULL CHECK (usage_outcome IN ('helpful', 'harmful', 'neutral', 'not_applicable')),
    outcome_reason TEXT,
    execution_metrics TEXT, -- JSON metrics (latency, correctness, etc.)
    acl_level INTEGER NOT NULL DEFAULT 3 CHECK (acl_level BETWEEN 1 AND 6),
    swarm_id TEXT NOT NULL,
    project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bullet_id) REFERENCES adaptive_context(bullet_id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- CONTEXT_MERGE_LOG table - Audit trail for curation decisions
CREATE TABLE IF NOT EXISTS context_merge_log (
    id TEXT PRIMARY KEY,
    merge_type TEXT NOT NULL CHECK (merge_type IN ('new_bullet', 'increment_helpful', 'increment_harmful', 'merge_similar', 'archive', 'edit', 'version_bump')),
    bullet_id TEXT NOT NULL,
    reflection_id TEXT,
    old_content TEXT,
    new_content TEXT,
    similarity_score REAL, -- For semantic merging
    merged_from_bullet_ids TEXT, -- JSON array for merge operations
    curator_agent_id TEXT,
    curator_reasoning TEXT,
    acl_level INTEGER NOT NULL DEFAULT 5 CHECK (acl_level BETWEEN 1 AND 6), -- System-level audit
    swarm_id TEXT,
    project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bullet_id) REFERENCES adaptive_context(bullet_id) ON DELETE CASCADE,
    FOREIGN KEY (reflection_id) REFERENCES context_reflections(id) ON DELETE SET NULL,
    FOREIGN KEY (curator_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_adaptive_context_bullet_id ON adaptive_context(bullet_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_context_category ON adaptive_context(category);
CREATE INDEX IF NOT EXISTS idx_adaptive_context_source_task ON adaptive_context(source_task_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_context_helpful ON adaptive_context(helpful_count);
CREATE INDEX IF NOT EXISTS idx_adaptive_context_harmful ON adaptive_context(harmful_count);
CREATE INDEX IF NOT EXISTS idx_adaptive_context_confidence ON adaptive_context(confidence_score);
CREATE INDEX IF NOT EXISTS idx_adaptive_context_priority ON adaptive_context(priority);
CREATE INDEX IF NOT EXISTS idx_adaptive_context_active ON adaptive_context(is_active);
CREATE INDEX IF NOT EXISTS idx_adaptive_context_last_used ON adaptive_context(last_used_at);
CREATE INDEX IF NOT EXISTS idx_adaptive_context_swarm ON adaptive_context(swarm_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_context_project ON adaptive_context(project_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_context_acl ON adaptive_context(acl_level);

CREATE INDEX IF NOT EXISTS idx_context_reflections_task ON context_reflections(task_id);
CREATE INDEX IF NOT EXISTS idx_context_reflections_status ON context_reflections(curator_status);
CREATE INDEX IF NOT EXISTS idx_context_reflections_swarm ON context_reflections(swarm_id);
CREATE INDEX IF NOT EXISTS idx_context_reflections_project ON context_reflections(project_id);

CREATE INDEX IF NOT EXISTS idx_context_usage_bullet ON context_usage_log(bullet_id);
CREATE INDEX IF NOT EXISTS idx_context_usage_task ON context_usage_log(task_id);
CREATE INDEX IF NOT EXISTS idx_context_usage_outcome ON context_usage_log(usage_outcome);
CREATE INDEX IF NOT EXISTS idx_context_usage_swarm ON context_usage_log(swarm_id);

CREATE INDEX IF NOT EXISTS idx_context_merge_bullet ON context_merge_log(bullet_id);
CREATE INDEX IF NOT EXISTS idx_context_merge_type ON context_merge_log(merge_type);
CREATE INDEX IF NOT EXISTS idx_context_merge_reflection ON context_merge_log(reflection_id);

-- Triggers for automatic updates
CREATE TRIGGER IF NOT EXISTS update_adaptive_context_timestamp
    AFTER UPDATE ON adaptive_context
BEGIN
    UPDATE adaptive_context SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS increment_adaptive_context_usage
    AFTER INSERT ON context_usage_log
BEGIN
    UPDATE adaptive_context
    SET
        usage_count = usage_count + 1,
        last_used_at = CURRENT_TIMESTAMP,
        helpful_count = helpful_count + CASE WHEN NEW.usage_outcome = 'helpful' THEN 1 ELSE 0 END,
        harmful_count = harmful_count + CASE WHEN NEW.usage_outcome = 'harmful' THEN 1 ELSE 0 END,
        confidence_score = CASE
            WHEN NEW.usage_outcome = 'helpful' THEN MIN(1.0, confidence_score + 0.05)
            WHEN NEW.usage_outcome = 'harmful' THEN MAX(0.0, confidence_score - 0.10)
            ELSE confidence_score
        END
    WHERE bullet_id = NEW.bullet_id;
END;

CREATE TRIGGER IF NOT EXISTS auto_archive_harmful_bullets
    AFTER UPDATE OF harmful_count ON adaptive_context
BEGIN
    UPDATE adaptive_context
    SET is_active = 0, archived_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id AND harmful_count >= 5 AND helpful_count < 2;
END;
