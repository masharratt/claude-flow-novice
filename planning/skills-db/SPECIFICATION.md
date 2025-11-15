# Dynamic Skills Database - System Specification

## Document Metadata
- **Version:** 1.0.0
- **Status:** Draft
- **Author:** CTO Agent
- **Date:** 2025-11-15
- **Branch:** `claude/dynamic-skills-database-01ADBVz5oNBvbWzphRW2PG3T`

---

## 1. Executive Summary

### Problem Statement
The Claude Flow Novice system currently manages 62 skills and 67 agents through static file-based configuration. This approach creates:
- **Maintenance burden:** Updating 23 agents when a coordination protocol changes
- **Prompt bloat:** Each agent potentially loads all skills regardless of relevance
- **Discovery complexity:** No contextual skill selection based on task requirements
- **Cross-team friction:** Difficult to share foundation skills across teams (CFN, marketing, data-eng)
- **Analytics gap:** No visibility into which skills improve agent confidence

### Proposed Solution
Implement a **hybrid database-driven skill management system** that:
- Stores skill metadata and agent mappings in SQLite
- Maintains skill content in git-versioned markdown files
- Provides query-based contextual skill selection
- Enables human visibility through CLI tools and YAML exports
- Tracks skill usage and effectiveness metrics

### Success Criteria
1. **Performance:** Agent prompt size reduced by 40% through contextual loading
2. **Maintainability:** Skill updates propagate to all agents with single database UPDATE
3. **Reusability:** Foundation skills shared across teams with single SQL INSERT
4. **Observability:** Skill effectiveness tracked via confidence correlation analytics
5. **Backward compatibility:** Zero breaking changes to existing agent workflows

---

## 2. System Requirements

### 2.1 Functional Requirements

#### FR-1: Skill Storage & Retrieval
- **FR-1.1:** System SHALL store skill metadata in SQLite database
- **FR-1.2:** System SHALL maintain skill content in git-versioned markdown files
- **FR-1.3:** System SHALL validate content integrity using SHA256 hashes
- **FR-1.4:** System SHALL support skill versioning using semantic versioning (semver)
- **FR-1.5:** System SHALL retrieve skills based on agent type, task context, and phase

#### FR-2: Agent-Skill Mapping
- **FR-2.1:** System SHALL map skills to agent types with priority ordering
- **FR-2.2:** System SHALL support conditional skill loading based on task context
- **FR-2.3:** System SHALL distinguish required vs optional skills
- **FR-2.4:** System SHALL allow multiple agents to share same skill
- **FR-2.5:** System SHALL support team-specific skill overrides

#### FR-3: Contextual Skill Selection
- **FR-3.1:** System SHALL select skills based on task keywords (authentication, testing, etc.)
- **FR-3.2:** System SHALL filter skills by CFN Loop phase (loop1, loop2, loop3)
- **FR-3.3:** System SHALL prioritize skills by configured priority value (1-10)
- **FR-3.4:** System SHALL support tag-based skill discovery
- **FR-3.5:** System SHALL exclude deprecated skills unless explicitly requested

#### FR-4: Bootstrap Skills
- **FR-4.1:** System SHALL maintain 5 core bootstrap skills as static files:
  - `database-connection`
  - `error-handling`
  - `bash-fundamentals`
  - `file-operations`
  - `skill-loader`
- **FR-4.2:** Bootstrap skills SHALL NOT require database access to load
- **FR-4.3:** System SHALL load bootstrap skills before database-driven skills

#### FR-5: Human Management Interface
- **FR-5.1:** System SHALL provide CLI tools for skill management
- **FR-5.2:** System SHALL export database to YAML for code review
- **FR-5.3:** System SHALL import database from YAML for deployment
- **FR-5.4:** System SHALL validate skill assignments before database commit
- **FR-5.5:** System SHALL provide skill usage analytics queries

#### FR-6: Usage Analytics
- **FR-6.1:** System SHALL log skill usage per agent execution
- **FR-6.2:** System SHALL track confidence impact of each skill
- **FR-6.3:** System SHALL measure skill execution time overhead
- **FR-6.4:** System SHALL identify unused skills for deprecation
- **FR-6.5:** System SHALL generate skill effectiveness reports

### 2.2 Non-Functional Requirements

#### NFR-1: Performance
- **NFR-1.1:** Skill database query latency SHALL NOT exceed 15ms per agent spawn
- **NFR-1.2:** Total agent prompt build time SHALL NOT increase by more than 10%
- **NFR-1.3:** Database SHALL support 100 concurrent agent spawns
- **NFR-1.4:** Skill content cache invalidation SHALL occur within 1 second

#### NFR-2: Scalability
- **NFR-2.1:** System SHALL support 500+ skills without degradation
- **NFR-2.2:** System SHALL support 200+ agent types
- **NFR-2.3:** System SHALL support 10,000+ skill usage log entries per day
- **NFR-2.4:** Database size SHALL NOT exceed 100MB for 500 skills

#### NFR-3: Reliability
- **NFR-3.1:** Database corruption SHALL trigger automatic recovery from YAML snapshot
- **NFR-3.2:** Missing skill content files SHALL fail gracefully with warning
- **NFR-3.3:** Invalid skill mappings SHALL be detected during validation
- **NFR-3.4:** System SHALL maintain 99.9% availability for skill loading

#### NFR-4: Security
- **NFR-4.1:** Skill content SHALL be read-only for agents
- **NFR-4.2:** Database writes SHALL be restricted to CLI tools
- **NFR-4.3:** Skill content hashes SHALL prevent tampering
- **NFR-4.4:** Sensitive skill content SHALL support encryption at rest

#### NFR-5: Maintainability
- **NFR-5.1:** Database schema migrations SHALL be versioned
- **NFR-5.2:** Skill content SHALL remain git-diffable
- **NFR-5.3:** YAML exports SHALL be human-readable
- **NFR-5.4:** CLI tools SHALL provide clear error messages

---

## 3. Data Model

### 3.1 Database Schema

#### Table: `skills`
```sql
CREATE TABLE skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,        -- coordination, testing, infrastructure, domain
  team TEXT,                      -- cfn, marketing, data-eng, foundation
  content_path TEXT NOT NULL,     -- '.claude/skills/coordination/SKILL.md'
  content_hash TEXT NOT NULL,     -- SHA256 hash for integrity
  tags TEXT,                      -- JSON array: ["redis", "async", "coordination"]
  version TEXT NOT NULL,          -- Semver: "2.1.0"
  status TEXT NOT NULL DEFAULT 'active',  -- active, deprecated, experimental
  deprecation_note TEXT,          -- Reason for deprecation
  replacement_id INTEGER,         -- FOREIGN KEY to skills(id)
  owner TEXT,                     -- Maintainer team/person
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (replacement_id) REFERENCES skills(id)
);

CREATE INDEX idx_skills_status ON skills(status);
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_team ON skills(team);
CREATE INDEX idx_skills_name ON skills(name);
```

#### Table: `agent_skill_mappings`
```sql
CREATE TABLE agent_skill_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_type TEXT NOT NULL,       -- 'backend-developer', 'tester', etc.
  skill_id INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,  -- 1-10 (1=highest, load first)
  required BOOLEAN NOT NULL DEFAULT 0,  -- 1=required, 0=optional
  conditions TEXT,                -- JSON: {"taskContext": ["auth"], "phase": ["loop3"]}
  notes TEXT,                     -- Human-readable explanation
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  UNIQUE(agent_type, skill_id)
);

CREATE INDEX idx_agent_skills ON agent_skill_mappings(agent_type, priority);
CREATE INDEX idx_skill_agents ON agent_skill_mappings(skill_id);
```

#### Table: `skill_usage_log`
```sql
CREATE TABLE skill_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,         -- 'backend-developer-1'
  agent_type TEXT NOT NULL,       -- 'backend-developer'
  skill_id INTEGER NOT NULL,
  task_id TEXT,                   -- CFN Loop task ID
  phase TEXT,                     -- loop1, loop2, loop3
  loaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  confidence_before REAL,         -- Agent confidence before skill loaded
  confidence_after REAL,          -- Agent confidence after execution
  execution_time_ms INTEGER,      -- Skill loading overhead
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX idx_usage_agent_type ON skill_usage_log(agent_type);
CREATE INDEX idx_usage_skill ON skill_usage_log(skill_id);
CREATE INDEX idx_usage_task ON skill_usage_log(task_id);
CREATE INDEX idx_usage_timestamp ON skill_usage_log(loaded_at);
```

#### Table: `bootstrap_skills`
```sql
CREATE TABLE bootstrap_skills (
  skill_name TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,        -- '.claude/skills/bootstrap/database-connection.md'
  load_order INTEGER NOT NULL,    -- 1, 2, 3, 4, 5
  description TEXT NOT NULL
);

-- Seed data
INSERT INTO bootstrap_skills VALUES
  ('database-connection', '.claude/skills/bootstrap/database-connection.md', 1,
   'SQLite database connection and query primitives'),
  ('error-handling', '.claude/skills/bootstrap/error-handling.md', 2,
   'Bash error handling and exit code management'),
  ('bash-fundamentals', '.claude/skills/bootstrap/bash-fundamentals.md', 3,
   'Core bash scripting patterns and utilities'),
  ('file-operations', '.claude/skills/bootstrap/file-operations.md', 4,
   'File I/O, path resolution, and validation'),
  ('skill-loader', '.claude/skills/bootstrap/skill-loader.md', 5,
   'Dynamic skill loading from database');
```

### 3.2 YAML Export Format
```yaml
# .claude/skills-database/snapshot.yaml
version: "1.0"
exported_at: "2025-11-15T10:30:00Z"
schema_version: 1

skills:
  - id: 1
    name: cfn-coordination
    category: coordination
    team: foundation
    content_path: .claude/skills/cfn-coordination/SKILL.md
    content_hash: a3f5b1c2d4e...
    tags: [redis, async, orchestration]
    version: "2.1.0"
    status: active
    owner: cfn-core

  - id: 2
    name: jwt-authentication
    category: domain
    team: cfn
    content_path: .claude/skills/jwt-authentication/SKILL.md
    content_hash: b7e2c9a1f3d...
    tags: [security, auth, jwt]
    version: "1.0.0"
    status: active
    owner: backend-team

agent_skill_mappings:
  - agent_type: backend-developer
    skill_id: 1
    priority: 1
    required: true
    conditions:
      phase: [loop3]

  - agent_type: backend-developer
    skill_id: 2
    priority: 3
    required: false
    conditions:
      taskContext: [auth, authentication, jwt]
    notes: "Only load for auth-related tasks"
```

---

## 4. API Specification

### 4.1 TypeScript API

#### Interface: `Skill`
```typescript
interface Skill {
  id: number;
  name: string;
  category: 'coordination' | 'testing' | 'infrastructure' | 'domain';
  team: string;
  contentPath: string;
  contentHash: string;
  tags: string[];
  version: string;
  status: 'active' | 'deprecated' | 'experimental';
  owner: string;
  content?: string;  // Loaded on-demand
}
```

#### Interface: `AgentSkillMapping`
```typescript
interface AgentSkillMapping {
  agentType: string;
  skillId: number;
  priority: number;
  required: boolean;
  conditions?: {
    taskContext?: string[];
    phase?: string[];
    mode?: string[];
  };
  notes?: string;
}
```

#### Class: `SkillLoader`
```typescript
class SkillLoader {
  constructor(dbPath: string);

  // Load skills for agent with context filtering
  async loadSkillsForAgent(
    agentType: string,
    context: TaskContext
  ): Promise<Skill[]>;

  // Get single skill by ID or name
  async getSkill(idOrName: number | string): Promise<Skill>;

  // Validate all skill content hashes
  async validateIntegrity(): Promise<ValidationResult>;

  // Log skill usage for analytics
  async logSkillUsage(usage: SkillUsageLog): Promise<void>;

  // Get skill effectiveness metrics
  async getSkillMetrics(skillId: number): Promise<SkillMetrics>;
}
```

### 4.2 CLI Commands

#### `cfn skill list`
```bash
# List all skills
npx cfn skill list

# List skills for specific agent
npx cfn skill list --agent=backend-developer

# List skills by category
npx cfn skill list --category=coordination

# List skills by team
npx cfn skill list --team=foundation

# Search by tags
npx cfn skill list --tags=redis,async
```

#### `cfn skill assign`
```bash
# Assign skill to agent
npx cfn skill assign \
  --agent=backend-developer \
  --skill=jwt-authentication \
  --priority=3 \
  --required=false \
  --condition="taskContext.includes('auth')"

# Bulk assign from YAML
npx cfn skill assign --from-file=mappings.yaml
```

#### `cfn skill create`
```bash
# Create new skill
npx cfn skill create \
  --name=graphql-federation \
  --category=domain \
  --team=backend-team \
  --content-path=.claude/skills/graphql-federation/SKILL.md \
  --tags=graphql,federation,api \
  --version=1.0.0
```

#### `cfn skill update`
```bash
# Update skill metadata
npx cfn skill update \
  --skill=cfn-coordination \
  --version=2.2.0 \
  --tags=redis,async,orchestration,v3

# Deprecate skill
npx cfn skill deprecate \
  --skill=old-coordination \
  --replacement=cfn-coordination \
  --note="Replaced by v3 orchestration pattern"
```

#### `cfn skill export/import`
```bash
# Export to YAML
npx cfn skill export --output=snapshot.yaml

# Import from YAML
npx cfn skill import snapshot.yaml

# Validate before import
npx cfn skill import snapshot.yaml --validate-only
```

#### `cfn skill analytics`
```bash
# Skill effectiveness report
npx cfn skill analytics effectiveness --skill=jwt-authentication

# Most used skills
npx cfn skill analytics usage --top=10

# Confidence impact analysis
npx cfn skill analytics impact --agent=backend-developer

# Unused skills (candidates for deprecation)
npx cfn skill analytics unused --days=30
```

---

## 5. Behavior Specification

### 5.1 Skill Loading Algorithm

**Input:**
- Agent type (e.g., `backend-developer`)
- Task context (e.g., `{ taskContext: "authentication", phase: "loop3", mode: "standard" }`)

**Output:**
- Ordered list of applicable skills with content loaded

**Algorithm:**
1. **Load Bootstrap Skills** (always first, no DB required)
2. **Query Agent Skill Mappings:**
   ```sql
   SELECT s.*, m.priority
   FROM skills s
   JOIN agent_skill_mappings m ON s.id = m.skill_id
   WHERE m.agent_type = ?
     AND s.status = 'active'
   ORDER BY m.priority ASC
   ```
3. **Apply Conditional Filtering:**
   - Parse `m.conditions` JSON
   - Filter by `taskContext` if present in conditions
   - Filter by `phase` if present in conditions
   - Filter by `mode` if present in conditions
4. **Load Skill Content:**
   - Read markdown file from `content_path`
   - Validate SHA256 hash against `content_hash`
   - If mismatch, log warning and use content (non-blocking)
5. **Return Ordered Skills:**
   - Bootstrap skills first (load_order 1-5)
   - Database skills next (priority 1-10)

### 5.2 Skill Update Workflow

**Scenario:** Update coordination skill to version 2.2.0

1. **Developer edits content:**
   ```bash
   vim .claude/skills/cfn-coordination/SKILL.md
   ```

2. **Update database metadata:**
   ```bash
   npx cfn skill update \
     --skill=cfn-coordination \
     --version=2.2.0 \
     --recalculate-hash
   ```

3. **CLI recalculates hash:**
   ```bash
   sha256sum .claude/skills/cfn-coordination/SKILL.md
   ```

4. **Update database:**
   ```sql
   UPDATE skills
   SET version = '2.2.0',
       content_hash = '<new_hash>',
       updated_at = datetime('now')
   WHERE name = 'cfn-coordination';
   ```

5. **Export snapshot for code review:**
   ```bash
   npx cfn skill export --output=.claude/skills-database/snapshot.yaml
   git add .claude/skills-database/snapshot.yaml
   git add .claude/skills/cfn-coordination/SKILL.md
   git commit -m "feat(skills): Update coordination skill to v2.2.0"
   ```

### 5.3 Cross-Team Skill Sharing

**Scenario:** Marketing team wants to use foundation Redis coordination skill

1. **Query foundation skills:**
   ```bash
   npx cfn skill list --team=foundation --tags=redis
   # Returns: cfn-coordination (id=1)
   ```

2. **Assign to marketing agent:**
   ```bash
   npx cfn skill assign \
     --agent=marketing-coordinator \
     --skill=cfn-coordination \
     --priority=2 \
     --required=true
   ```

3. **Database creates mapping:**
   ```sql
   INSERT INTO agent_skill_mappings (agent_type, skill_id, priority, required)
   VALUES ('marketing-coordinator', 1, 2, 1);
   ```

4. **No content duplication** - both teams reference same file

### 5.4 Skill Deprecation Workflow

**Scenario:** Deprecate old coordination skill in favor of new version

1. **Mark as deprecated:**
   ```bash
   npx cfn skill deprecate \
     --skill=old-coordination \
     --replacement=cfn-coordination \
     --note="Replaced by v3 orchestration with enhanced monitoring"
   ```

2. **Database update:**
   ```sql
   UPDATE skills
   SET status = 'deprecated',
       deprecation_note = 'Replaced by v3 orchestration with enhanced monitoring',
       replacement_id = 1,  -- ID of cfn-coordination
       updated_at = datetime('now')
   WHERE name = 'old-coordination';
   ```

3. **Agents stop loading deprecated skill** (unless explicitly requested)

4. **Cleanup after 90 days:**
   ```bash
   npx cfn skill prune --deprecated-before=90d
   ```

---

## 6. Migration Specification

### 6.1 Phase 1: Database Setup (No Breaking Changes)

**Goal:** Create database infrastructure without affecting existing workflows

**Tasks:**
1. Create schema: `.claude/skills-database/schema.sql`
2. Seed bootstrap skills table
3. Write migration script: `seed-from-filesystem.sh`
4. Populate database from existing `.claude/skills/*` directories
5. Validate: All 62 skills imported correctly

**Success Criteria:**
- Database file exists: `.claude/skills-database/skills.db`
- All 62 skills imported with correct metadata
- Content hashes validated
- No changes to agent spawning behavior

### 6.2 Phase 2: Read-Only Database Queries (Parallel Testing)

**Goal:** Test database queries in parallel with existing file-based loading

**Tasks:**
1. Implement `SkillLoader` class
2. Add database query to `buildAgentPrompt()`
3. Compare database results vs file-based results
4. Log discrepancies
5. Fix inconsistencies

**Success Criteria:**
- 100% parity between database and file-based skill loading
- No performance degradation (≤10ms overhead)
- Zero agent spawn failures

### 6.3 Phase 3: Database-First Loading (Feature Flag)

**Goal:** Switch to database-driven loading behind feature flag

**Tasks:**
1. Add environment variable: `CFN_SKILLS_DATABASE=true`
2. Modify `buildAgentPrompt()` to use database when flag enabled
3. Run CFN Loop with database loading
4. Monitor confidence scores and success rates
5. A/B test: 50% database, 50% file-based

**Success Criteria:**
- No difference in CFN Loop success rates
- Agent confidence scores within ±5%
- Skill loading latency ≤15ms

### 6.4 Phase 4: CLI Tooling & Human Visibility

**Goal:** Enable human management of skills database

**Tasks:**
1. Implement CLI commands: `list`, `assign`, `create`, `update`, `export`, `import`
2. Add YAML export/import for code review
3. Create git pre-commit hook for validation
4. Document CLI usage in `docs/SKILLS_DATABASE_GUIDE.md`

**Success Criteria:**
- All CLI commands functional
- YAML exports human-readable and git-diffable
- Pre-commit hook prevents invalid skill assignments

### 6.5 Phase 5: Analytics & Optimization

**Goal:** Track skill effectiveness and optimize assignments

**Tasks:**
1. Implement skill usage logging
2. Create analytics queries (effectiveness, impact, usage)
3. Generate skill effectiveness report
4. Identify unused skills for deprecation
5. Optimize agent-skill mappings based on data

**Success Criteria:**
- Skill usage logged for 100% of agent spawns
- Analytics queries execute in <100ms
- Identify 10+ skills for deprecation/optimization
- Improve average agent confidence by 5% through optimized skill assignments

---

## 7. Quality Attributes

### 7.1 Testability
- Unit tests for `SkillLoader` class
- Integration tests for database queries
- End-to-end tests for agent spawning with database
- Schema migration tests
- YAML export/import round-trip tests

### 7.2 Observability
- Skill loading latency metrics
- Database query performance tracking
- Skill usage heat maps
- Confidence impact correlation
- Deprecation candidate identification

### 7.3 Backward Compatibility
- Existing agents work without database (bootstrap skills only)
- File-based skill loading remains functional
- No changes to agent frontmatter format
- Opt-in migration (feature flag)

### 7.4 Extensibility
- Support for remote skill repositories (future)
- Skill marketplace integration (future)
- AI-driven skill recommendation (future)
- Multi-database support (PostgreSQL for enterprise)

---

## 8. Constraints & Assumptions

### 8.1 Constraints
- **Database:** SQLite only (no PostgreSQL for v1)
- **Content format:** Markdown only (no binary skills)
- **Git workflow:** YAML exports must be diffable
- **Performance:** ≤15ms query latency per agent spawn
- **Bootstrap skills:** Must remain file-based (no circular dependency)

### 8.2 Assumptions
- Skill content fits in memory (≤100MB total)
- Skill updates are infrequent (≤10/day)
- Most agents load 5-10 skills (not all 62)
- Humans prefer CLI over web UI (v1)
- Git remains source of truth for content

---

## 9. Success Metrics

### 9.1 Quantitative Metrics
- **Prompt size reduction:** ≥40% (from loading all skills to contextual loading)
- **Maintenance time:** 80% reduction (23 file updates → 1 database UPDATE)
- **Query latency:** ≤15ms per agent spawn
- **Skill reuse:** Foundation skills used by ≥3 teams
- **Confidence improvement:** ≥5% from optimized skill assignments

### 9.2 Qualitative Metrics
- Developer satisfaction with CLI tools
- Ease of cross-team skill sharing
- Clarity of YAML exports for code review
- Usefulness of analytics reports
- Reduction in skill-related bugs

---

## 10. Open Questions

1. **Skill versioning strategy:** Allow multiple versions loaded simultaneously?
2. **Conflict resolution:** What if two skills provide conflicting instructions?
3. **Skill dependencies:** Should skills declare dependencies on other skills?
4. **Dynamic skill generation:** Should AI generate skills based on task patterns?
5. **Skill marketplace:** Future integration with shared skill repositories?

---

## 11. References

- **CLAUDE.md:** Current skill management patterns
- **src/cli/agent-prompt-builder.ts:** Agent prompt construction
- **docs/AGENT_OUTPUT_STANDARDS.md:** Agent output conventions
- **planning/skills-db/ARCHITECTURE.md:** System architecture (see companion doc)
- **planning/skills-db/PSEUDOCODE.md:** Implementation algorithms (see companion doc)
