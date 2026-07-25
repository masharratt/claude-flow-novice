# CFN to Centralized RuVector Migration Plan

## Current State Analysis

Based on investigation, CFN currently uses multiple local SQLite databases:

### 1. **CFN Memory Persistence** (`cfn-memory-persistence`)
- Location: Various project-local `.db` files
- Schema: Complex ACL system with 5 access levels
- Tables: `memory_content`, `users`, `audit_logs`, `shared_access`, `collaboration_groups`
- Usage: Long-term memory storage across CFN agents

### 2. **Cerebras Coordinator** (`cfn-cerebras-coordinator`)
- Location: `generations.db` in skill directory
- Schema: Tracks code generations, success rates, patterns
- Tables: Implicit from scripts - appears to track generations, patterns, feedback
- Usage: Pattern learning for code generation

### 3. **Adaptive Context** (`cfn-test-framework/webapp`)
- Location: `~/.claude/memory/adaptive-context.db`
- Schema: Stores context bullets, reflections, learnings
- Usage: ACE (Adaptive Context Engine) for webapp testing

### 4. **Swarm Memory** (`cfn-transparency-middleware`)
- Location: `.claude/swarm-memory.db`
- Schema: Agent interaction tracking, memory sharing
- Usage: Multi-agent coordination and memory persistence

### 5. **Task Planning** (`cfn-task-planning`)
- Location: `audit.db` in lib/audit
- Schema: Task audit trails, planning history
- Usage: Task execution auditing and replay

## Migration Strategy: Unified Pattern Store

### Phase 0: Foundation (Already Done)
✅ PostgreSQL with pgvector support confirmed
✅ Centralized RuVector codebase-index with PostgreSQL backend
✅ Local accelerator prototype (Python - will rewrite in Rust)

### Phase 1: Create Centralized Pattern Store Schema (Week 1)

```sql
-- Unified pattern store for all CFN data
CREATE EXTENSION IF NOT EXISTS vector;

-- Core pattern storage
CREATE TABLE patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,  -- 'code', 'memory', 'context', 'task', 'interaction'
    source_system VARCHAR(50),  -- 'cerebras-coordinator', 'memory-persistence', etc.
    source_id VARCHAR(255),     -- Original ID from source system

    -- Pattern data
    content TEXT NOT NULL,
    summary TEXT,
    metadata JSONB,

    -- Vector embeddings
    embedding vector(1536),

    -- Ownership and ACL
    tenant_id VARCHAR(255) DEFAULT 'default',
    project_id VARCHAR(255),
    agent_id VARCHAR(100),
    user_id VARCHAR(100),
    access_level INTEGER DEFAULT 1,  -- 1-5 scale from memory-persistence

    -- Success metrics
    success_rate FLOAT DEFAULT 0.0,
    usage_count INTEGER DEFAULT 0,
    confidence_score FLOAT DEFAULT 0.0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_accessed TIMESTAMP DEFAULT NOW()
);

-- Pattern relationships (for context and dependencies)
CREATE TABLE pattern_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_pattern_id UUID REFERENCES patterns(id),
    target_pattern_id UUID REFERENCES patterns(id),
    relationship_type VARCHAR(50),  -- 'follows', 'improves', 'fixes', 'context'
    weight FLOAT DEFAULT 1.0,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Agent executions (replaces generations.db)
CREATE TABLE agent_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(100) NOT NULL,
    agent_type VARCHAR(50),
    task_type VARCHAR(50),

    -- Execution data
    input_prompt TEXT,
    output_content TEXT,
    context_files TEXT[],
    test_command TEXT,
    test_results JSONB,

    -- Pattern linking
    input_patterns UUID[],  -- Patterns used as input
    output_patterns UUID[],  -- Patterns created

    -- Results
    success BOOLEAN,
    error_message TEXT,
    execution_time_ms INTEGER,
    attempts INTEGER,

    -- Metadata
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Context and learnings (replaces adaptive-context.db)
CREATE TABLE context_bullets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    category VARCHAR(100),
    tags TEXT[],
    confidence FLOAT DEFAULT 0.5,
    source_type VARCHAR(50),  -- 'reflection', 'feedback', 'extraction'
    embedding vector(1536),

    -- Relationships
    related_patterns UUID[],
    related_executions UUID[],

    created_at TIMESTAMP DEFAULT NOW()
);

-- Multi-agent interactions (replaces swarm-memory.db)
CREATE TABLE agent_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(100),
    interaction_type VARCHAR(50),  -- 'handoff', 'coordination', 'conflict'

    -- Participants
    source_agent_id VARCHAR(100),
    target_agent_id VARCHAR(100),

    -- Data
    message_content TEXT,
    shared_context JSONB,
    outcome VARCHAR(50),

    -- Links to patterns/executions
    pattern_ids UUID[],

    created_at TIMESTAMP DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX patterns_embedding_idx ON patterns USING hnsw (embedding vector_cosine_ops);
CREATE INDEX patterns_type_idx ON patterns(type);
CREATE INDEX patterns_source_idx ON patterns(source_system, source_id);
CREATE INDEX patterns_project_idx ON patterns(project_id);
CREATE INDEX patterns_access_idx ON patterns(access_level);
CREATE INDEX patterns_success_idx ON patterns(success_rate DESC, usage_count DESC);

CREATE INDEX executions_agent_idx ON agent_executions(agent_id, created_at DESC);
CREATE INDEX executions_success_idx ON agent_executions(success, created_at DESC);

CREATE INDEX context_embedding_idx ON context_bullets USING hnsw (embedding vector_cosine_ops);
CREATE INDEX context_category_idx ON context_bullets(category, confidence DESC);
```

### Phase 2: Migration Scripts (Week 2)

#### 2.1 Create Migration Framework
```rust
// src/migration/mod.rs
pub struct Migrator {
    source_db: PathBuf,
    target_db: PgPool,
    source_type: SourceSystem,
}

#[derive(Debug)]
pub enum SourceSystem {
    MemoryPersistence,
    CerebrasCoordinator,
    AdaptiveContext,
    SwarmMemory,
    TaskPlanning,
}

impl Migrator {
    pub async fn migrate_all(&self) -> Result<MigrationStats> {
        match self.source_type {
            SourceSystem::MemoryPersistence => self.migrate_memory_persistence().await,
            SourceSystem::CerebrasCoordinator => self.migrate_cerebras_coordinator().await,
            // ... other migrations
        }
    }
}
```

#### 2.2 Memory Persistence Migration
```rust
// Migrate from cfn-memory-persistence ACL system
pub async fn migrate_memory_persistence(&self) -> Result<()> {
    // 1. Migrate users to tenant_id
    // 2. Convert memory_content to patterns
    // 3. Migrate shared_access to pattern relationships
    // 4. Preserve ACL levels
}
```

#### 2.3 Cerebras Coordinator Migration
```rust
// Migrate from generations.db
pub async fn migrate_cerebras_coordinator(&self) -> Result<()> {
    // 1. Extract generation records
    // 2. Create agent_executions entries
    // 3. Link success patterns
    // 4. Calculate success rates
}
```

### Phase 3: Update CFN Skills (Week 3)

#### 3.1 Create Shared Client Library
```rust
// src/cfn_client.rs
pub struct CFNPatternClient {
    pool: PgPool,
    embeddings: EmbeddingService,
}

impl CFNPatternClient {
    // Unified pattern storage
    pub async fn store_pattern(&self, pattern: CreatePatternRequest) -> Result<UUID>;
    pub async fn query_patterns(&self, query: PatternQuery) -> Result<Vec<Pattern>>;

    // Agent execution tracking
    pub async fn start_execution(&self, req: StartExecutionRequest) -> Result<ExecutionId>;
    pub async fn complete_execution(&self, id: ExecutionId, result: ExecutionResult) -> Result<()>;

    // Context management
    pub async fn store_context(&self, context: ContextBullet) -> Result<()>;
    pub async fn query_context(&self, query: ContextQuery) -> Result<Vec<ContextBullet>>;
}
```

#### 3.2 Update Individual Skills

**cfn-cerebras-coordinator changes:**
```bash
# Old: DB_PATH="${COORDINATION_DB_PATH:-$SCRIPT_DIR/generations.db}"
# New: Use centralized client
export CENTRAL_RUVECTOR_URL="${CENTRAL_RUVECTOR_URL:-postgresql://localhost:5432/ruvector}"
```

**cfn-memory-persistence changes:**
```bash
# Replace SQLite queries with centralized API
# Old: sqlite3 memory.db "SELECT * FROM memory_content"
# New: curl -X POST "$CENTRAL_RUVECTOR_URL/api/patterns" -d '{"type":"memory", ...}'
```

**cfn-transparency-middleware changes:**
```bash
# Update swarm memory to use centralized store
# Store interactions as pattern relationships
```

### Phase 4: Integration Benefits (Week 4)

#### 4.1 Cross-System Pattern Discovery
- Code patterns can inform memory persistence
- Successful executions can improve context bullets
- Agent interactions can suggest code improvements

#### 4.2 Unified Analytics
```sql
-- Cross-system success rates
SELECT
    source_system,
    type,
    AVG(success_rate) as avg_success,
    COUNT(*) as pattern_count
FROM patterns
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY source_system, type
ORDER BY avg_success DESC;
```

#### 4.3 Intelligent Recommendations
```rust
// Suggest patterns across systems
pub async fn get_recommendations(
    &self,
    context: AgentContext
) -> Result<Vec<CrossSystemRecommendation>> {
    // 1. Get recent successful patterns from similar agents
    // 2. Find relevant context bullets
    // 3. Suggest based on past agent interactions
}
```

### Phase 5: Cleanup and Optimization (Week 5)

#### 5.1 Remove Old Databases
```bash
# Cleanup script
find . -name "*.db" -type f -delete
find . -name "generations.db" -type f -delete
```

#### 5.2 Performance Optimization
- Create materialized views for common queries
- Implement caching layer
- Optimize vector indexes

## Implementation Priority

### 1. High Priority (Do First)
- **cfn-cerebras-coordinator**: Core pattern learning system
- **cfn-memory-persistence**: Foundation for agent memory
- **Central schema**: Must support both systems' needs

### 2. Medium Priority
- **cfn-transparency-middleware**: Agent coordination
- **cfn-task-planning**: Audit trails
- **cfn-test-framework**: Context bullets

### 3. Low Priority
- Archive old local databases
- Performance tuning
- Advanced analytics

## Migration Commands

```bash
# 1. Setup centralized RuVector with PostgreSQL
cd .claude/skills/cfn-ruvector-codebase-index
docker-compose -f docker-compose.postgres.yml up -d

# 2. Run migration
./migrate-to-centralized.sh --all

# 3. Update environment variables
export CENTRAL_RUVECTOR_URL="postgresql://localhost:5432/ruvector"
export CENTRAL_RUVECTOR_ENABLED=true

# 4. Test migration
./validate-migration.sh --compare-old-vs-new

# 5. Switch to centralized mode
./enable-centralized-mode.sh
```

## Benefits of Migration

1. **Unified Pattern Store**: All CFN patterns in one place
2. **Cross-System Learning**: Code patterns inform memory, context informs code
3. **Better Analytics**: Single source of truth for all metrics
4. **Simplified Architecture**: One database instead of many
5. **Advanced Search**: Vector similarity across all CFN data
6. **Scalability**: PostgreSQL scales better than SQLite files
7. **Backup/Recovery**: Single database to manage
8. **Team Sharing**: Patterns can be shared across projects

## Risks and Mitigations

### Risk 1: Migration Complexity
- **Mitigation**: Incremental migration, run both systems in parallel
- **Rollback**: Keep SQLite files until migration validated

### Risk 2: Performance Impact
- **Mitigation**: Use pgvector for efficient vector operations
- **Testing**: Load test with existing data volumes

### Risk 3: Data Loss
- **Mitigation**: Full backup before migration
- **Validation**: Compare row counts and key metrics

### Risk 4: Downtime
- **Mitigation**: Migrate during off-hours
- **Strategy**: Read-only mode during switch

## Success Metrics

- [ ] All SQLite databases migrated
- [ ] No data loss (validate counts)
- [ ] Query performance <100ms
- [ ] All CFN skills using centralized store
- [ ] Cross-system pattern recommendations working
- [ ] Backup/restore procedures tested
- [ ] Documentation updated

This migration will consolidate all CFN local databases into a single, powerful centralized RuVector system that enables cross-system learning and advanced pattern discovery.