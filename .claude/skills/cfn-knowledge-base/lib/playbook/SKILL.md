# Playbook Learning System

**Version:** 1.0.0
**Purpose:** Store and query successful CFN Loop patterns for continuous improvement

## Overview

The playbook system stores execution patterns from successful CFN Loops:
- Task patterns (type, description, keywords)
- Optimal agent configurations
- Iteration counts and convergence patterns
- Common feedback themes
- Success strategies

## Database Schema

**File:** `.claude/skills/playbook/playbook.db` (SQLite)

**Tables:**

### playbook_entries
```sql
CREATE TABLE playbook_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_pattern TEXT NOT NULL,        -- Task description or embedding
  task_type TEXT NOT NULL,            -- software-development, content-creation, etc.
  task_keywords TEXT,                 -- Comma-separated keywords
  loop3_agents TEXT NOT NULL,         -- JSON array
  loop2_agents TEXT NOT NULL,         -- JSON array
  loop4_agent TEXT DEFAULT 'product-owner',
  iterations_required INTEGER,
  final_confidence REAL,
  final_consensus REAL,
  gate_threshold REAL DEFAULT 0.75,
  consensus_threshold REAL DEFAULT 0.90,
  complexity TEXT,                    -- low, medium, high
  estimated_iterations INTEGER,
  actual_iterations INTEGER,
  common_feedback TEXT,               -- JSON array of recurring themes
  success_strategy TEXT,              -- JSON object
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  use_count INTEGER DEFAULT 1         -- How many times this pattern was reused
);

CREATE INDEX idx_task_type ON playbook_entries(task_type);
CREATE INDEX idx_task_pattern ON playbook_entries(task_pattern);
CREATE INDEX idx_final_confidence ON playbook_entries(final_confidence DESC);
CREATE INDEX idx_use_count ON playbook_entries(use_count DESC);
```

### agent_performance
```sql
CREATE TABLE agent_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_type TEXT NOT NULL,
  task_type TEXT NOT NULL,
  avg_confidence REAL,
  execution_count INTEGER DEFAULT 1,
  success_rate REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_type, task_type)
);

CREATE INDEX idx_agent_performance ON agent_performance(agent_type, task_type);
```

## Usage

### Query Playbook
```bash
SIMILAR_PATTERN=$(./.claude/skills/playbook/query-playbook.sh \
  --task-type "software-development" \
  --description "Implement OAuth2 authentication")

echo "$SIMILAR_PATTERN" | jq '.loop3_agents'
# ["backend-dev", "security-specialist"]
```

### Update Playbook
```bash
./.claude/skills/playbook/update-playbook.sh \
  --task-id "$TASK_ID" \
  --task-type "software-development" \
  --description "Implement JWT authentication" \
  --loop3-agents "backend-dev,security-specialist" \
  --loop2-agents "reviewer,tester,security-auditor" \
  --iterations 3 \
  --final-confidence 0.92 \
  --final-consensus 0.93
```

## Similarity Matching

**Algorithm:** Keyword overlap (Jaccard similarity)

```
Similarity = Intersection(keywords1, keywords2) / Union(keywords1, keywords2)
```

**Thresholds:**
- ≥ 0.6: Potentially similar
- ≥ 0.75: Similar (use this pattern)
- ≥ 0.90: Very similar (high confidence match)

## Auto-Update from Retrospectives

**Location:** `lib/auto-update/auto-update-playbook.sh`

Automatically update playbook with insights from sprint retrospectives.

### Auto-Update Features
- Parse retrospective JSON
- Update agent performance metrics
- Store successful strategies
- Increment pattern counters
- Maintain historical performance data

### Auto-Update Usage
```bash
./.claude/skills/cfn-playbook/lib/auto-update/auto-update-playbook.sh \
  --retrospective-json "$RETROSPECTIVE_JSON" \
  --task-id "$TASK_ID"
```

### Safety Mechanisms
- Validation of input data
- Backup of previous playbook version
- Logging of all modifications
- Ability to revert changes

## Integration

Used by:
- `.claude/agents/cfn-v3-coordinator.md` - Query for similar tasks
- Main Chat post-execution - Update playbook after PROCEED
- Loop 5 retrospective - Extract patterns and update playbook
- CodeSearch integration - Auto-update via semantic analysis

## Directory Structure

```
cfn-playbook/
├── SKILL.md              # This file
├── playbook.db           # SQLite database
├── init-playbook.sh      # Initialize database
├── query-playbook.sh     # Query patterns
├── update-playbook.sh    # Manual updates
└── lib/
    └── auto-update/
        └── auto-update-playbook.sh  # Retrospective auto-updates
```