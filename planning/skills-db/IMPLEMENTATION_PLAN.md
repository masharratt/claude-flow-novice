# Dynamic Skills Database - Implementation Plan

## Document Metadata
- **Version:** 1.0.0
- **Status:** Draft
- **Date:** 2025-11-15
- **Branch:** `claude/dynamic-skills-database-01ADBVz5oNBvbWzphRW2PG3T`
- **Related:** SPECIFICATION.md, PSEUDOCODE.md, ARCHITECTURE.md

---

## Table of Contents
1. [Implementation Overview](#1-implementation-overview)
2. [Phase 1: Foundation](#2-phase-1-foundation)
3. [Phase 2: Database Infrastructure](#3-phase-2-database-infrastructure)
4. [Phase 3: Skill Loader](#4-phase-3-skill-loader)
5. [Phase 4: CLI Tooling](#5-phase-4-cli-tooling)
6. [Phase 5: Integration & Testing](#6-phase-5-integration--testing)
7. [Phase 6: Analytics & Optimization](#7-phase-6-analytics--optimization)
8. [Risk Management](#8-risk-management)
9. [Success Criteria](#9-success-criteria)

---

## 1. Implementation Overview

### 1.1 Timeline

**Total Duration:** 6 weeks (30 business days)

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1: Foundation | 3 days | Bootstrap skills, schema design, directory structure |
| Phase 2: Database Infrastructure | 5 days | SQLite database, migration script, YAML snapshot |
| Phase 3: Skill Loader | 5 days | SkillLoader class, caching, hash validation |
| Phase 4: CLI Tooling | 5 days | CLI commands, YAML import/export, validation |
| Phase 5: Integration & Testing | 7 days | Agent prompt builder integration, E2E tests |
| Phase 6: Analytics & Optimization | 5 days | Usage logging, analytics queries, performance tuning |

**Buffer:** 5 days for unexpected issues

---

### 1.2 Team Structure

**Roles:**
- **Architect (1):** System design, code review, technical decisions
- **Backend Developer (2):** Database, SkillLoader, CLI tools
- **Integration Engineer (1):** Agent prompt builder, orchestrator integration
- **QA Engineer (1):** Testing, validation, performance benchmarks
- **DevOps (0.5):** CI/CD pipeline, deployment automation

**Total:** 5.5 FTEs

---

### 1.3 Dependencies

**External:**
- `better-sqlite3` (SQLite Node.js driver)
- `js-yaml` (YAML parsing)
- `chalk` (CLI formatting)
- `commander` (CLI argument parsing)

**Internal:**
- `src/cli/agent-prompt-builder.ts` (modification required)
- `.claude/skills/` (existing skill files)
- `.claude/agents/` (existing agent definitions)

---

## 2. Phase 1: Foundation (Days 1-3)

### 2.1 Objectives
- Create bootstrap skills directory and files
- Design database schema
- Set up project structure
- Document conventions

---

### 2.2 Tasks

#### Task 1.1: Create Bootstrap Skills Directory
**Owner:** Backend Developer
**Duration:** 0.5 days
**Priority:** P0 (Critical)

**Steps:**
1. Create directory: `.claude/skills/bootstrap/`
2. Create 5 bootstrap skill files:
   - `database-connection.md`
   - `error-handling.md`
   - `bash-fundamentals.md`
   - `file-operations.md`
   - `skill-loader.md`

**Deliverable:** 5 markdown files with minimal skill content

**Acceptance Criteria:**
- [ ] All 5 files exist
- [ ] Each file has valid frontmatter
- [ ] Total size < 50KB
- [ ] No database dependency in content

---

#### Task 1.2: Design Database Schema
**Owner:** Architect
**Duration:** 1 day
**Priority:** P0 (Critical)

**Steps:**
1. Review SPECIFICATION.md data model
2. Create `.claude/skills-database/schema.sql`
3. Define indexes for performance
4. Document schema versioning strategy

**Deliverable:** `schema.sql` file

**SQL:**
```sql
-- Version: 1
-- Date: 2025-11-15

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  team TEXT,
  content_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  tags TEXT,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  deprecation_note TEXT,
  replacement_id INTEGER,
  owner TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (replacement_id) REFERENCES skills(id)
);

CREATE TABLE agent_skill_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_type TEXT NOT NULL,
  skill_id INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  required BOOLEAN NOT NULL DEFAULT 0,
  conditions TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  UNIQUE(agent_type, skill_id)
);

CREATE TABLE skill_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  skill_id INTEGER NOT NULL,
  task_id TEXT,
  phase TEXT,
  loaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  confidence_before REAL,
  confidence_after REAL,
  execution_time_ms INTEGER,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE bootstrap_skills (
  skill_name TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  load_order INTEGER NOT NULL,
  description TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_skills_name ON skills(name);
CREATE INDEX idx_skills_status ON skills(status);
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_team ON skills(team);
CREATE INDEX idx_agent_skills ON agent_skill_mappings(agent_type, priority);
CREATE INDEX idx_skill_agents ON agent_skill_mappings(skill_id);
CREATE INDEX idx_usage_agent_type ON skill_usage_log(agent_type);
CREATE INDEX idx_usage_skill ON skill_usage_log(skill_id);
CREATE INDEX idx_usage_task ON skill_usage_log(task_id);
CREATE INDEX idx_usage_timestamp ON skill_usage_log(loaded_at);

-- Bootstrap skills seed data
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

**Acceptance Criteria:**
- [ ] Schema supports all requirements from SPECIFICATION.md
- [ ] Foreign keys defined correctly
- [ ] Indexes on critical query paths
- [ ] Bootstrap skills seeded

---

#### Task 1.3: Create Directory Structure
**Owner:** Backend Developer
**Duration:** 0.5 days
**Priority:** P1 (High)

**Steps:**
1. Create `.claude/skills-database/` directory
2. Create `.claude/skills-database/migrations/` directory
3. Create `.gitignore` entry for `skills.db`
4. Create placeholder `snapshot.yaml`

**Structure:**
```
.claude/
├── skills/
│   ├── bootstrap/
│   │   ├── database-connection.md
│   │   ├── error-handling.md
│   │   ├── bash-fundamentals.md
│   │   ├── file-operations.md
│   │   └── skill-loader.md
│   └── (existing skills)
└── skills-database/
    ├── schema.sql
    ├── snapshot.yaml
    ├── migrations/
    │   └── 001_initial_schema.sql
    └── README.md
```

**Acceptance Criteria:**
- [ ] All directories exist
- [ ] `.gitignore` excludes `skills.db`
- [ ] README.md documents database structure

---

#### Task 1.4: Document Conventions
**Owner:** Architect
**Duration:** 1 day
**Priority:** P1 (High)

**Steps:**
1. Create `.claude/skills-database/README.md`
2. Document skill naming conventions
3. Document category taxonomy
4. Document team naming standards
5. Document YAML export format

**Deliverable:** Comprehensive README.md

**Acceptance Criteria:**
- [ ] Clear examples of skill metadata
- [ ] Category definitions documented
- [ ] Team conventions explained
- [ ] YAML format specification

---

### 2.3 Phase 1 Deliverables

**Files Created:**
- `.claude/skills/bootstrap/*.md` (5 files)
- `.claude/skills-database/schema.sql`
- `.claude/skills-database/README.md`
- `.claude/skills-database/snapshot.yaml` (placeholder)

**Documentation:**
- Database schema specification
- Skill naming conventions
- Directory structure guide

**Dependencies for Next Phase:**
- Schema approved by architect
- Bootstrap skills validated
- Directory structure in place

---

## 3. Phase 2: Database Infrastructure (Days 4-8)

### 3.1 Objectives
- Initialize SQLite database
- Create migration script from filesystem
- Implement YAML export/import
- Validate data integrity

---

### 3.2 Tasks

#### Task 2.1: Database Initialization Script
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P0 (Critical)

**Steps:**
1. Create `scripts/skills-db/init-database.sh`
2. Apply schema.sql
3. Validate database structure
4. Create health check query

**Script:**
```bash
#!/bin/bash
set -euo pipefail

DB_PATH=".claude/skills-database/skills.db"
SCHEMA_PATH=".claude/skills-database/schema.sql"

# Check if database exists
if [ -f "$DB_PATH" ]; then
  read -p "Database exists. Recreate? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm "$DB_PATH"
  else
    echo "Aborted."
    exit 1
  fi
fi

# Create database
sqlite3 "$DB_PATH" < "$SCHEMA_PATH"

# Validate
echo "Validating database..."
sqlite3 "$DB_PATH" <<SQL
SELECT 'Tables:' as check, COUNT(*) as count FROM sqlite_master WHERE type='table';
SELECT 'Indexes:' as check, COUNT(*) as count FROM sqlite_master WHERE type='index';
SELECT 'Bootstrap Skills:' as check, COUNT(*) as count FROM bootstrap_skills;
SQL

echo "Database initialized successfully: $DB_PATH"
```

**Acceptance Criteria:**
- [ ] Script creates database successfully
- [ ] All tables created
- [ ] All indexes created
- [ ] Bootstrap skills seeded

---

#### Task 2.2: Filesystem Migration Script
**Owner:** Backend Developer
**Duration:** 2 days
**Priority:** P0 (Critical)

**Steps:**
1. Create `scripts/skills-db/seed-from-filesystem.sh`
2. Discover all SKILL.md files
3. Infer metadata (category, team, tags)
4. Calculate content hashes
5. Insert into database

**Script:**
```bash
#!/bin/bash
set -euo pipefail

DB_PATH=".claude/skills-database/skills.db"
SKILLS_DIR=".claude/skills"

echo "Scanning skills directory: $SKILLS_DIR"

imported=0
errors=0

for skill_file in "$SKILLS_DIR"/*/SKILL.md; do
  # Skip bootstrap skills (already seeded)
  if [[ "$skill_file" == *"/bootstrap/"* ]]; then
    continue
  fi

  # Extract skill name from directory
  skill_dir=$(dirname "$skill_file")
  skill_name=$(basename "$skill_dir")

  # Calculate hash
  content_hash=$(sha256sum "$skill_file" | cut -d' ' -f1)

  # Infer category
  if [[ "$skill_name" == *"coordination"* ]] || [[ "$skill_name" == *"orchestration"* ]]; then
    category="coordination"
  elif [[ "$skill_name" == *"test"* ]]; then
    category="testing"
  elif [[ "$skill_name" == *"docker"* ]] || [[ "$skill_name" == *"redis"* ]]; then
    category="infrastructure"
  else
    category="domain"
  fi

  # Infer team
  if [[ "$skill_name" == cfn-* ]]; then
    team="cfn"
  elif [[ "$skill_name" == marketing-* ]]; then
    team="marketing"
  elif [[ "$skill_name" == data-* ]]; then
    team="data-eng"
  else
    team="foundation"
  fi

  # Insert into database
  sqlite3 "$DB_PATH" <<SQL
    INSERT OR IGNORE INTO skills (
      name, category, team, content_path, content_hash, version, status, owner
    ) VALUES (
      '$skill_name', '$category', '$team', '$skill_file', '$content_hash', '1.0.0', 'active', '$team'
    );
SQL

  if [ $? -eq 0 ]; then
    echo "Imported: $skill_name"
    ((imported++))
  else
    echo "Error importing: $skill_name"
    ((errors++))
  fi
done

echo ""
echo "Migration complete:"
echo "  Imported: $imported skills"
echo "  Errors: $errors"
```

**Acceptance Criteria:**
- [ ] All 62 existing skills imported
- [ ] Content hashes calculated correctly
- [ ] Categories inferred accurately (manual validation)
- [ ] No duplicate entries

---

#### Task 2.3: YAML Export Implementation
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**Steps:**
1. Create `src/cli/yaml-snapshot.ts`
2. Query all skills and mappings
3. Convert to YAML format
4. Write to file with metadata

**TypeScript:**
```typescript
import Database from 'better-sqlite3';
import yaml from 'js-yaml';
import fs from 'fs/promises';

interface SnapshotData {
  version: string;
  exported_at: string;
  schema_version: number;
  skills: any[];
  agent_skill_mappings: any[];
}

export async function exportToYAML(
  dbPath: string,
  outputPath: string
): Promise<void> {
  const db = new Database(dbPath, { readonly: true });

  // Query all skills
  const skills = db.prepare(`
    SELECT * FROM skills ORDER BY id
  `).all();

  // Query all mappings
  const mappings = db.prepare(`
    SELECT * FROM agent_skill_mappings ORDER BY agent_type, priority
  `).all();

  // Build snapshot object
  const snapshot: SnapshotData = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    schema_version: 1,
    skills: skills.map(s => ({
      id: s.id,
      name: s.name,
      category: s.category,
      team: s.team,
      content_path: s.content_path,
      content_hash: s.content_hash,
      tags: s.tags ? JSON.parse(s.tags) : [],
      version: s.version,
      status: s.status,
      owner: s.owner,
      deprecation_note: s.deprecation_note,
      replacement_id: s.replacement_id
    })),
    agent_skill_mappings: mappings.map(m => ({
      agent_type: m.agent_type,
      skill_id: m.skill_id,
      priority: m.priority,
      required: m.required === 1,
      conditions: m.conditions ? JSON.parse(m.conditions) : null,
      notes: m.notes
    }))
  };

  // Write YAML
  const yamlContent = yaml.dump(snapshot, {
    indent: 2,
    lineWidth: 120,
    noRefs: true
  });

  await fs.writeFile(outputPath, yamlContent, 'utf-8');

  console.log(`Exported ${skills.length} skills to ${outputPath}`);

  db.close();
}
```

**Acceptance Criteria:**
- [ ] YAML file is human-readable
- [ ] All skills exported
- [ ] All mappings exported
- [ ] File size < 500KB

---

#### Task 2.4: YAML Import Implementation
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**Steps:**
1. Add import function to `yaml-snapshot.ts`
2. Validate YAML schema
3. Validate file existence
4. Import with transaction

**TypeScript:**
```typescript
export async function importFromYAML(
  yamlPath: string,
  dbPath: string,
  validateOnly: boolean = false
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  // Read YAML
  const yamlContent = await fs.readFile(yamlPath, 'utf-8');
  const data = yaml.load(yamlContent) as SnapshotData;

  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate schema version
  if (data.schema_version !== 1) {
    errors.push(`Unsupported schema version: ${data.schema_version}`);
  }

  // Validate skills
  for (const skill of data.skills) {
    if (!skill.name || !skill.content_path) {
      errors.push(`Skill missing required fields: ${JSON.stringify(skill)}`);
      continue;
    }

    // Check file exists
    try {
      await fs.access(skill.content_path);
    } catch {
      errors.push(`Content file not found: ${skill.content_path}`);
    }

    // Validate hash
    try {
      const content = await fs.readFile(skill.content_path, 'utf-8');
      const hash = require('crypto')
        .createHash('sha256')
        .update(content)
        .digest('hex');

      if (hash !== skill.content_hash) {
        warnings.push(`Hash mismatch for ${skill.name}`);
      }
    } catch (err) {
      // Already caught by file existence check
    }
  }

  // Return early if validate-only
  if (validateOnly) {
    return { valid: errors.length === 0, errors, warnings };
  }

  // Abort if errors
  if (errors.length > 0) {
    throw new Error(`Validation failed:\n${errors.join('\n')}`);
  }

  // Import to database
  const db = new Database(dbPath);

  db.exec('BEGIN TRANSACTION');

  try {
    // Clear existing data
    db.exec('DELETE FROM agent_skill_mappings');
    db.exec('DELETE FROM skills WHERE id NOT IN (SELECT id FROM bootstrap_skills)');

    // Insert skills
    const insertSkill = db.prepare(`
      INSERT INTO skills (
        id, name, category, team, content_path, content_hash,
        tags, version, status, owner, deprecation_note, replacement_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const skill of data.skills) {
      insertSkill.run(
        skill.id, skill.name, skill.category, skill.team,
        skill.content_path, skill.content_hash,
        JSON.stringify(skill.tags), skill.version, skill.status,
        skill.owner, skill.deprecation_note, skill.replacement_id
      );
    }

    // Insert mappings
    const insertMapping = db.prepare(`
      INSERT INTO agent_skill_mappings (
        agent_type, skill_id, priority, required, conditions, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const mapping of data.agent_skill_mappings) {
      insertMapping.run(
        mapping.agent_type, mapping.skill_id, mapping.priority,
        mapping.required ? 1 : 0,
        mapping.conditions ? JSON.stringify(mapping.conditions) : null,
        mapping.notes
      );
    }

    db.exec('COMMIT');

    console.log(`Imported ${data.skills.length} skills successfully`);

    return { valid: true, errors, warnings };

  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.close();
  }
}
```

**Acceptance Criteria:**
- [ ] Import validates before applying
- [ ] Transaction ensures atomicity
- [ ] Errors rollback changes
- [ ] Warnings logged but non-blocking

---

### 3.3 Phase 2 Deliverables

**Scripts:**
- `scripts/skills-db/init-database.sh`
- `scripts/skills-db/seed-from-filesystem.sh`

**TypeScript Modules:**
- `src/cli/yaml-snapshot.ts`

**Database:**
- `.claude/skills-database/skills.db` (seeded with 62 skills)

**Snapshot:**
- `.claude/skills-database/snapshot.yaml` (initial export)

**Validation:**
- All existing skills imported successfully
- YAML export/import round-trip tested

---

## 4. Phase 3: Skill Loader (Days 9-13)

### 3.1 Objectives
- Implement SkillLoader class
- Implement skill caching
- Implement hash validation
- Write unit tests

---

### 3.2 Tasks

#### Task 3.1: SkillLoader Class Implementation
**Owner:** Backend Developer
**Duration:** 2 days
**Priority:** P0 (Critical)

**File:** `src/cli/skill-loader.ts`

**Implementation:** (See PSEUDOCODE.md Section 1.1)

**Key Methods:**
```typescript
class SkillLoader {
  async loadSkillsForAgent(
    agentType: string,
    context: TaskContext
  ): Promise<Skill[]>;

  async getSkill(idOrName: number | string): Promise<Skill>;

  async validateIntegrity(): Promise<ValidationResult>;

  async logSkillUsage(usage: SkillUsageLog): Promise<void>;

  async getSkillMetrics(skillId: number): Promise<SkillMetrics>;
}
```

**Acceptance Criteria:**
- [ ] Loads bootstrap skills without DB
- [ ] Queries database efficiently (≤3ms)
- [ ] Filters by conditions correctly
- [ ] Returns skills in priority order
- [ ] Unit tests pass (90% coverage)

---

#### Task 3.2: Skill Cache Implementation
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**File:** `src/cli/skill-cache.ts`

**Implementation:** (See PSEUDOCODE.md Section 3.2)

**Features:**
- LRU eviction
- TTL-based expiration
- Manual invalidation
- Memory-bounded (max 100 skills × 50KB = 5MB)

**Acceptance Criteria:**
- [ ] Cache hit reduces latency by 80%
- [ ] TTL expiration works correctly
- [ ] Memory usage stays under 5MB
- [ ] Invalidation clears specific skills

---

#### Task 3.3: Hash Validation Implementation
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**Integration:** Add to `SkillLoader.loadSkillContent()`

**Implementation:**
```typescript
private async loadSkillContent(skill: SkillMetadata): Promise<string> {
  // Try cache first
  const cached = this.cache.get(skill.name);
  if (cached) return cached;

  // Read file
  const content = await fs.readFile(skill.content_path, 'utf-8');

  // Validate hash
  const actualHash = crypto
    .createHash('sha256')
    .update(content)
    .digest('hex');

  if (actualHash !== skill.content_hash) {
    logger.warn(
      `Hash mismatch for skill ${skill.name}: expected ${skill.content_hash}, got ${actualHash}`
    );
    // Non-blocking: continue execution
  }

  // Cache and return
  this.cache.set(skill.name, content);
  return content;
}
```

**Acceptance Criteria:**
- [ ] Detects modified files
- [ ] Logs warning (non-blocking)
- [ ] Continues execution after warning
- [ ] Reports mismatches to analytics

---

#### Task 3.4: Unit Tests
**Owner:** QA Engineer
**Duration:** 1 day
**Priority:** P0 (Critical)

**Test Coverage:**
- Bootstrap skills loading
- Database query filtering
- Conditional skill selection
- Hash validation (valid + invalid)
- Cache hit/miss scenarios
- Error handling (DB unavailable, file not found)

**Framework:** Jest

**Test Files:**
- `tests/unit/skill-loader.test.ts`
- `tests/unit/skill-cache.test.ts`

**Acceptance Criteria:**
- [ ] 90% code coverage
- [ ] All edge cases tested
- [ ] Performance tests (latency < 15ms)

---

### 3.3 Phase 3 Deliverables

**TypeScript Modules:**
- `src/cli/skill-loader.ts` (400 lines)
- `src/cli/skill-cache.ts` (100 lines)

**Tests:**
- `tests/unit/skill-loader.test.ts` (300 lines)
- `tests/unit/skill-cache.test.ts` (100 lines)

**Documentation:**
- API documentation (JSDoc)
- Usage examples

---

## 5. Phase 4: CLI Tooling (Days 14-18)

### 3.1 Objectives
- Implement CLI command structure
- Implement core commands (list, assign, create, update)
- Implement analytics commands
- Write integration tests

---

### 3.2 Tasks

#### Task 4.1: CLI Framework Setup
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P0 (Critical)

**File:** `src/cli/skill-cli.ts`

**Dependencies:**
- `commander` (CLI argument parsing)
- `chalk` (colored output)
- `cli-table3` (table formatting)

**Structure:**
```typescript
import { Command } from 'commander';

const program = new Command();

program
  .name('cfn skill')
  .description('Skill database management tool')
  .version('1.0.0');

program
  .command('list')
  .description('List skills with filtering')
  .option('--agent <type>', 'Filter by agent type')
  .option('--category <cat>', 'Filter by category')
  .option('--team <team>', 'Filter by team')
  .option('--tags <tags>', 'Filter by tags (comma-separated)')
  .option('--format <fmt>', 'Output format (table, json, yaml)', 'table')
  .action(cmdList);

program
  .command('assign')
  .description('Assign skill to agent')
  .requiredOption('--agent <type>', 'Agent type')
  .requiredOption('--skill <name>', 'Skill name or ID')
  .option('--priority <num>', 'Priority (1-10)', '5')
  .option('--required', 'Required skill', false)
  .option('--condition <json>', 'Conditional loading (JSON)')
  .action(cmdAssign);

// ... more commands

program.parse();
```

**Acceptance Criteria:**
- [ ] CLI framework functional
- [ ] Help text displays correctly
- [ ] Version command works
- [ ] Error handling implemented

---

#### Task 4.2: Implement List Command
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**Implementation:** (See PSEUDOCODE.md Section 4.1)

**Features:**
- Filter by agent type
- Filter by category/team/tags
- Multiple output formats (table, JSON, YAML)
- Pagination for large result sets

**Example Output:**
```
$ npx cfn skill list --agent=backend-developer

id | name                | category      | version | status | agent_count
---+---------------------+---------------+---------+--------+------------
1  | cfn-coordination    | coordination  | 2.1.0   | active | 15
2  | jwt-authentication  | domain        | 1.0.0   | active | 3
5  | error-handling      | testing       | 1.2.0   | active | 8
```

**Acceptance Criteria:**
- [ ] All filters work correctly
- [ ] Output formats validated
- [ ] Performance < 100ms for 500 skills

---

#### Task 4.3: Implement Assign Command
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**Implementation:** (See PSEUDOCODE.md Section 2.2)

**Features:**
- Validate skill exists
- Validate priority range (1-10)
- Validate conditions JSON
- Upsert (INSERT or UPDATE)

**Example:**
```bash
$ npx cfn skill assign \
  --agent=backend-developer \
  --skill=jwt-authentication \
  --priority=3 \
  --condition='{"taskContext": ["auth", "jwt"]}'

✓ Assigned skill 'jwt-authentication' to agent 'backend-developer'
  Priority: 3
  Required: false
  Condition: taskContext includes auth, jwt
```

**Acceptance Criteria:**
- [ ] Validates all inputs
- [ ] Upsert works correctly
- [ ] Clear success/error messages

---

#### Task 4.4: Implement Create/Update/Deprecate Commands
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**Commands:**
```bash
# Create
npx cfn skill create \
  --name=graphql-federation \
  --category=domain \
  --team=backend \
  --content-path=.claude/skills/graphql-federation/SKILL.md \
  --tags=graphql,federation \
  --version=1.0.0

# Update
npx cfn skill update \
  --skill=cfn-coordination \
  --version=2.2.0 \
  --recalculate-hash

# Deprecate
npx cfn skill deprecate \
  --skill=old-coordination \
  --replacement=cfn-coordination \
  --note="Replaced by v3 orchestration"
```

**Acceptance Criteria:**
- [ ] Create validates content file exists
- [ ] Update recalculates hash correctly
- [ ] Deprecate updates mappings to replacement

---

#### Task 4.5: Implement Analytics Commands
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P2 (Medium)

**Commands:**
```bash
# Effectiveness report
npx cfn skill analytics effectiveness --skill=jwt-auth

# Usage statistics
npx cfn skill analytics usage --top=10

# Confidence impact
npx cfn skill analytics impact --agent=backend-developer

# Unused skills
npx cfn skill analytics unused --days=30
```

**Implementation:** (See PSEUDOCODE.md Section 5)

**Acceptance Criteria:**
- [ ] All analytics queries functional
- [ ] Reports formatted clearly
- [ ] Performance < 500ms for 10k usage logs

---

### 3.3 Phase 4 Deliverables

**CLI Tool:**
- `src/cli/skill-cli.ts` (600 lines)
- `package.json` script: `"cfn-skill": "node src/cli/skill-cli.js"`

**Commands Implemented:**
- `list`, `assign`, `create`, `update`, `deprecate`
- `export`, `import`, `validate`
- `analytics effectiveness`, `analytics usage`, `analytics impact`, `analytics unused`

**Documentation:**
- CLI usage guide: `docs/SKILLS_CLI_GUIDE.md`
- Command examples

---

## 6. Phase 5: Integration & Testing (Days 19-25)

### 3.1 Objectives
- Integrate SkillLoader into agent-prompt-builder
- Add feature flag
- Write E2E tests
- Validate backward compatibility

---

### 3.2 Tasks

#### Task 5.1: Agent Prompt Builder Integration
**Owner:** Integration Engineer
**Duration:** 2 days
**Priority:** P0 (Critical)

**File:** `src/cli/agent-prompt-builder.ts` (modify)

**Changes:**
```typescript
import { SkillLoader } from './skill-loader.js';

export async function buildAgentPrompt(
  definition: AgentDefinition,
  context: TaskContext
): Promise<string> {
  const sections: string[] = [];

  // ... existing code ...

  // NEW: Load skills from database (if enabled)
  if (process.env.CFN_SKILLS_DATABASE === 'true') {
    const skillLoader = new SkillLoader();
    const skills = await skillLoader.loadSkillsForAgent(
      definition.type,
      context
    );

    if (skills.length > 0) {
      sections.push('## Applicable Skills');
      sections.push('');

      for (const skill of skills) {
        sections.push(`### ${skill.name} (v${skill.version})`);
        sections.push(skill.content);
        sections.push('');
      }

      // Log usage for analytics
      await skillLoader.logSkillUsage({
        agentId: getAgentId(definition, context),
        agentType: definition.type,
        skillIds: skills.map(s => s.id),
        taskId: context.taskId,
        phase: extractPhase(context),
        loadedAt: new Date()
      });
    }
  } else {
    // Fallback: Static skills (backward compatibility)
    sections.push('## Static Skills');
    sections.push(buildStaticSkills());
  }

  // ... rest of prompt building ...

  return sections.join('\n');
}
```

**Acceptance Criteria:**
- [ ] Feature flag controls database usage
- [ ] Falls back to static skills if disabled
- [ ] Skills injected in correct order
- [ ] Usage logged asynchronously

---

#### Task 5.2: E2E Testing
**Owner:** QA Engineer
**Duration:** 2 days
**Priority:** P0 (Critical)

**Test Scenarios:**
1. **Agent spawn with database skills**
   - Enable feature flag
   - Spawn backend-developer with auth task
   - Verify JWT skill loaded
   - Verify bootstrap skills loaded

2. **Conditional skill loading**
   - Spawn backend-developer with testing task
   - Verify testing skills loaded, not auth skills

3. **Skill update propagation**
   - Update coordination skill to v2.2.0
   - Export YAML
   - Import YAML
   - Spawn agent
   - Verify new version loaded

4. **Hash validation**
   - Modify skill file
   - Spawn agent
   - Verify warning logged
   - Verify execution continues

5. **Backward compatibility**
   - Disable feature flag
   - Spawn agent
   - Verify static skills loaded
   - Verify no database queries

**Framework:** Playwright (for orchestrator integration)

**Test Files:**
- `tests/e2e/skill-loading.test.ts`
- `tests/e2e/skill-updates.test.ts`
- `tests/e2e/backward-compatibility.test.ts`

**Acceptance Criteria:**
- [ ] All scenarios pass
- [ ] No regression in agent confidence
- [ ] Latency overhead < 20ms

---

#### Task 5.3: Performance Benchmarking
**Owner:** QA Engineer
**Duration:** 1 day
**Priority:** P1 (High)

**Benchmarks:**
1. **Skill loading latency**
   - Baseline (static): 0ms
   - Database (cold cache): 20ms
   - Database (warm cache): 8ms
   - Target: ≤15ms average

2. **Database query latency**
   - Simple query (by agent type): ≤3ms
   - Complex query (with conditions): ≤5ms
   - Analytics query (30 days): ≤100ms

3. **Memory usage**
   - Skill cache: ≤5MB
   - Database connection: ≤2MB
   - Total overhead: ≤10MB

4. **Scalability**
   - 100 concurrent agent spawns: ≤1.5s total
   - 1000 skills in database: ≤15ms query latency
   - 100k usage log entries: ≤200ms analytics query

**Tools:**
- `hyperfine` (CLI benchmarking)
- `node --inspect` (memory profiling)
- Custom scripts for load testing

**Acceptance Criteria:**
- [ ] All targets met
- [ ] Benchmarks documented
- [ ] Performance regression tests added

---

#### Task 5.4: Integration with CFN Loop Orchestrator
**Owner:** Integration Engineer
**Duration:** 2 days
**Priority:** P1 (High)

**File:** `.claude/skills/cfn-loop-orchestration/orchestrate.sh` (modify)

**Changes:**
```bash
# Pass task context to agent spawn
npx claude-flow-novice agent-spawn \
  --agent="$AGENT_TYPE" \
  --context="{\"keywords\": $TASK_KEYWORDS, \"phase\": \"loop3\", \"mode\": \"$MODE\"}" \
  --task-id="$TASK_ID"
```

**Extract keywords from task description:**
```bash
TASK_KEYWORDS=$(echo "$TASK_DESCRIPTION" | jq -R 'split(" ") | map(select(length > 4))')
```

**Acceptance Criteria:**
- [ ] Task keywords extracted correctly
- [ ] Context passed to skill loader
- [ ] Relevant skills loaded per phase
- [ ] CFN Loop success rates unchanged

---

### 3.3 Phase 5 Deliverables

**Integrations:**
- `src/cli/agent-prompt-builder.ts` (modified)
- `.claude/skills/cfn-loop-orchestration/orchestrate.sh` (modified)

**Tests:**
- E2E tests (5 scenarios, 500 lines)
- Performance benchmarks (documented)
- Regression tests

**Documentation:**
- Integration guide: `docs/SKILLS_INTEGRATION_GUIDE.md`
- Performance report: `docs/SKILLS_PERFORMANCE_REPORT.md`

---

## 7. Phase 6: Analytics & Optimization (Days 26-30)

### 3.1 Objectives
- Implement usage logging
- Create analytics dashboards (CLI-based)
- Optimize skill assignments based on data
- Document best practices

---

### 3.2 Tasks

#### Task 6.1: Usage Logging Implementation
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**Integration:** Already added in Phase 5.1, enhance with confidence tracking

**Enhanced Logging:**
```typescript
await skillLoader.logSkillUsage({
  agentId: 'backend-developer-1',
  agentType: 'backend-developer',
  skillIds: [1, 2, 5],
  taskId: 'task-123',
  phase: 'loop3',
  loadedAt: new Date(),
  confidenceBefore: 0.75,  // NEW: From task context
  confidenceAfter: 0.88,   // NEW: From agent output
  executionTimeMs: 12      // NEW: Measured during loading
});
```

**Acceptance Criteria:**
- [ ] All agent spawns log usage
- [ ] Confidence scores captured
- [ ] Execution time measured
- [ ] Logs queryable for analytics

---

#### Task 6.2: Analytics Dashboard (CLI)
**Owner:** Backend Developer
**Duration:** 2 days
**Priority:** P2 (Medium)

**Commands:**
```bash
# Top 10 most effective skills
npx cfn skill analytics effectiveness --top=10

# Skills with negative confidence impact
npx cfn skill analytics effectiveness --filter=negative

# Unused skills (candidates for deprecation)
npx cfn skill analytics unused --days=30

# Cross-team skill usage
npx cfn skill analytics cross-team
```

**Output Example:**
```
Top 10 Most Effective Skills (30 days):

Rank | Skill                 | Usage | Avg Impact | Recommendation
-----+-----------------------+-------+------------+------------------
1    | jwt-authentication    | 127   | +0.13      | HIGHLY_EFFECTIVE
2    | error-handling        | 543   | +0.09      | HIGHLY_EFFECTIVE
3    | cfn-coordination      | 412   | +0.07      | EFFECTIVE
4    | redis-testing         | 89    | +0.05      | EFFECTIVE
5    | docker-orchestration  | 234   | +0.03      | NEUTRAL
...

Unused Skills (30 days):

Skill                  | Last Used   | Mapped Agents | Recommendation
-----------------------+-------------+---------------+------------------
old-coordination       | 2025-10-15  | 0             | DEPRECATE
legacy-auth-v1         | 2025-09-22  | 2             | REVIEW
experimental-graphql   | Never       | 3             | DEPRECATE
```

**Acceptance Criteria:**
- [ ] All analytics commands functional
- [ ] Reports formatted clearly
- [ ] Actionable recommendations provided

---

#### Task 6.3: Skill Assignment Optimization
**Owner:** Architect
**Duration:** 1 day
**Priority:** P2 (Medium)

**Process:**
1. Run effectiveness analysis
2. Identify skills with +0.10 impact
3. Assign to more agent types
4. Identify skills with negative impact
5. Deprecate or improve

**Example:**
```bash
# Find highly effective skills not widely used
npx cfn skill analytics effectiveness --filter="impact>0.10 AND usage<50"

# Output:
# jwt-authentication: +0.13 impact, only 3 agents

# Assign to more agents
npx cfn skill assign --agent=api-developer --skill=jwt-authentication --priority=2
npx cfn skill assign --agent=security-specialist --skill=jwt-authentication --priority=1
```

**Deliverable:** Optimization report documenting assignment changes

**Acceptance Criteria:**
- [ ] 5+ optimization opportunities identified
- [ ] Assignments updated in database
- [ ] Expected impact documented

---

#### Task 6.4: Documentation & Best Practices
**Owner:** Architect
**Duration:** 1 day
**Priority:** P1 (High)

**Documents:**
1. **Skill Creation Guide** (`docs/SKILL_CREATION_GUIDE.md`)
   - Naming conventions
   - Category selection
   - Writing effective skill content
   - Testing skills

2. **Skill Maintenance Guide** (`docs/SKILL_MAINTENANCE_GUIDE.md`)
   - Updating skills
   - Deprecating skills
   - Managing cross-team dependencies
   - Analytics-driven optimization

3. **Troubleshooting Guide** (`docs/SKILLS_TROUBLESHOOTING.md`)
   - Common issues
   - Hash validation failures
   - Database corruption recovery
   - Performance debugging

**Acceptance Criteria:**
- [ ] All guides comprehensive
- [ ] Examples included
- [ ] Clear troubleshooting steps

---

### 3.3 Phase 6 Deliverables

**Analytics:**
- Enhanced usage logging with confidence tracking
- CLI analytics dashboard (4 commands)
- Optimization report (actionable insights)

**Documentation:**
- Skill creation guide
- Skill maintenance guide
- Troubleshooting guide
- Best practices summary

---

## 8. Risk Management

### 8.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Database corruption | Low | High | YAML snapshot recovery, daily backups |
| Performance degradation | Medium | Medium | Caching, query optimization, benchmarks |
| Hash validation false positives | Medium | Low | Non-blocking warnings, manual resolution |
| Feature flag issues | Low | High | Comprehensive E2E tests, gradual rollout |
| SQLite write lock contention | Low | Medium | Async batch logging, read-only agent connections |

---

### 8.2 Process Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Scope creep | Medium | Medium | Strict phase boundaries, MVP mindset |
| Timeline slippage | Medium | Medium | Buffer days, early risk identification |
| Resource unavailability | Low | High | Cross-training, documentation |
| Integration complexity | Medium | High | Early integration testing, frequent demos |

---

### 8.3 Contingency Plans

**Plan A: Performance Issues**
- Increase cache size to 200 skills
- Preload common agent skills at startup
- Parallelize content loading

**Plan B: Database Corruption**
- Restore from daily YAML snapshot backup
- Re-seed from filesystem
- Validate with `npx cfn skill validate`

**Plan C: Timeline Slippage**
- Descope Phase 6 (analytics) to post-MVP
- Reduce E2E test coverage to critical paths
- Delay documentation to post-launch

---

## 9. Success Criteria

### 9.1 Functional Success

- [ ] All 62 existing skills imported successfully
- [ ] Bootstrap skills load without database dependency
- [ ] Contextual skill loading filters correctly
- [ ] YAML export/import round-trip successful
- [ ] All CLI commands functional
- [ ] Usage logging captures all agent spawns
- [ ] Analytics queries execute correctly

---

### 9.2 Performance Success

- [ ] Skill loading latency ≤15ms (average)
- [ ] Database query latency ≤3ms (P95)
- [ ] Cache hit rate ≥80%
- [ ] Memory overhead ≤10MB per agent
- [ ] No regression in CFN Loop success rates

---

### 9.3 Quality Success

- [ ] Unit test coverage ≥90%
- [ ] E2E tests cover critical paths
- [ ] All documentation complete
- [ ] Zero breaking changes to existing workflows
- [ ] Code review approval from architect

---

### 9.4 Business Success

- [ ] Prompt size reduced by ≥40% (contextual loading)
- [ ] Skill update time reduced by ≥80% (23 files → 1 UPDATE)
- [ ] Foundation skills shared across ≥3 teams
- [ ] Developer satisfaction with CLI tools (survey)
- [ ] ≥5 optimization opportunities identified from analytics

---

## 10. Post-Implementation

### 10.1 Monitoring Plan

**Metrics to Track:**
- Skill loading latency (daily)
- Database size growth (weekly)
- Cache hit rate (daily)
- Skill effectiveness (weekly)
- Usage log volume (daily)

**Alerts:**
- Latency >50ms (P95)
- Cache hit rate <70%
- Database size >500MB
- Hash validation failures >10/day

---

### 10.2 Optimization Opportunities

**Short-term (Weeks 1-4):**
- Increase cache hit rate to 95%
- Optimize common queries
- Archive old usage logs

**Medium-term (Months 2-3):**
- AI-driven skill recommendation
- Skill dependency graph
- Web UI for skill management

**Long-term (Months 4-6):**
- Remote skill repositories
- Skill marketplace
- Multi-database support (PostgreSQL)

---

### 10.3 Success Measurement

**Week 1:**
- Monitor skill loading latency
- Check for hash validation warnings
- Validate CFN Loop success rates

**Week 2:**
- Run analytics queries
- Identify optimization opportunities
- Gather developer feedback

**Week 4:**
- Generate first effectiveness report
- Optimize skill assignments based on data
- Document lessons learned

**Month 3:**
- Evaluate against success criteria
- Plan next phase (AI recommendation)
- Present results to stakeholders

---

This implementation plan provides a detailed, actionable roadmap for building the dynamic skills database system over 6 weeks with clear deliverables, acceptance criteria, and risk mitigation strategies.
