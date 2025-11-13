# Phase 2: Playbook-Driven Ephemeral Agent Architecture

**Version:** 2.0.0
**Date:** 2025-11-12
**Dependency:** Phase 1 (Corporate Organization v1.0.0)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Ephemeral Agent Lifecycle](#2-ephemeral-agent-lifecycle)
3. [Hook System Architecture](#3-hook-system-architecture)
4. [Database Architecture](#4-database-architecture)
5. [Context Injection Pipeline](#5-context-injection-pipeline)
6. [Lesson Extraction Pipeline](#6-lesson-extraction-pipeline)
7. [Performance Optimization](#7-performance-optimization)
8. [Data Flow Diagrams](#8-data-flow-diagrams)

---

## 1. System Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Team Coordinator Container                  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Task Queue Processing Loop                                │ │
│  │                                                           │ │
│  │ WHILE tasks.available():                                 │ │
│  │   task = DequeueTask()                                   │ │
│  │   SpawnEphemeralAgent(task)  ────────────────────┐       │ │
│  │   // Non-blocking, continues to next task       │       │ │
│  └───────────────────────────────────────────────────┼───────┘ │
└─────────────────────────────────────────────────────┼─────────┘
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ Pre-Spawn Hook: Context Injection (Bash Script)                │
│ .claude/hooks/cfn-pre-spawn-context-inject.sh                  │
│                                                                 │
│ 1. Extract tags from task description                          │
│ 2. Query PostgreSQL for top 100 relevant lessons              │
│ 3. Generate /tmp/context-{task-id}.json                       │
│ 4. Return to coordinator (duration: <5s)                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Ephemeral Agent Container (Docker)                             │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ Lifecycle: Single Task Execution                           ││
│ │                                                            ││
│ │ 1. Load /context.json (100 playbook lessons)              ││
│ │ 2. Build enhanced task prompt with lesson context         ││
│ │ 3. Execute task (Claude Code CLI)                         ││
│ │ 4. Extract new learnings from output                      ││
│ │ 5. Store output to Redis                                  ││
│ │ 6. Exit (container auto-removed)                          ││
│ │                                                            ││
│ │ Duration: 1-10 minutes (typical: 2-5 minutes)             ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│ Mounts:                                                         │
│ - /context.json (read-only, playbook lessons)                  │
│ - /workspace/{team-path} (team workspace isolation)            │
│ - /home/claude/.config/... (MCP config)                        │
│                                                                 │
│ Config:                                                         │
│ - AutoRemove: true (ephemeral, cleanup on exit)                │
│ - Memory: 2-8GB (role-based)                                   │
│ - Network: team-{team} (network isolation)                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Post-Completion Hook: Lesson Extraction (Bash Script)          │
│ .claude/hooks/cfn-post-completion-extract.sh                   │
│                                                                 │
│ 1. Read agent output from Redis                                │
│ 2. Parse output for lesson patterns (regex)                    │
│ 3. Extract new lessons with metadata                           │
│ 4. Store lessons to PostgreSQL (context_reflections)           │
│ 5. Update confidence for used lessons                          │
│ 6. Return to coordinator (duration: <2s)                       │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PostgreSQL: Persistent Lesson Storage                          │
│                                                                 │
│ Tables:                                                         │
│ - context_reflections (lessons with confidence tracking)       │
│ - playbook_usage (lesson usage analytics)                      │
│ - task_reflections (task-to-lesson mapping)                    │
│                                                                 │
│ Retention: Permanent (7-year compliance for audit logs)        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Comparison: Phase 1 vs Phase 2

| Component | Phase 1 (Persistent) | Phase 2 (Ephemeral) |
|-----------|---------------------|---------------------|
| **Agent Container** | Long-lived (hours-days) | Short-lived (minutes) |
| **Container Config** | AutoRemove: false | AutoRemove: true |
| **Knowledge Loading** | Manual in agent code | Automatic via pre-spawn hook |
| **Lesson Extraction** | Manual in agent code | Automatic via post-completion hook |
| **Playbook Storage** | Monolithic JSONB blob | Granular lessons with confidence |
| **Cost Model** | Fixed ($480/month/team) | Variable ($0.50-2/task) |
| **Idle Overhead** | 95% | 0% |
| **Knowledge Persistence** | Crash-dependent | 100% guaranteed |

---

## 2. Ephemeral Agent Lifecycle

### 2.1 Detailed State Transitions

```
┌────────────────────────────────────────────────────────────────┐
│                    Ephemeral Agent Lifecycle                   │
│                    (Total Duration: 1-15 min)                  │
└────────────────────────────────────────────────────────────────┘

State 1: NOT_EXIST
├─ Task arrives at coordinator
├─ Coordinator extracts tags from task description
├─ Duration: 0s
└─ Event: SpawnEphemeralAgent() called

        ↓

State 2: PRE_SPAWN_HOOK
├─ Execute: cfn-pre-spawn-context-inject.sh
├─ Query PostgreSQL for top 100 relevant lessons
├─ Generate /tmp/context-{task-id}.json
├─ Duration: <5s (target), <10s (max)
└─ Event: Context file created

        ↓

State 3: SPAWNING
├─ Docker.createContainer()
├─ Mount context file at /context.json
├─ Mount team workspace (file system isolation)
├─ Mount MCP config
├─ Set AutoRemove=true
├─ Duration: 5-10s
└─ Event: Container created

        ↓

State 4: STARTING
├─ Docker.startContainer()
├─ Container process starts
├─ Duration: 2-5s
└─ Event: Container running

        ↓

State 5: LOADING
├─ Agent reads /context.json
├─ Parse 100 playbook lessons
├─ Organize by scope (agent/team/org)
├─ Duration: 3-5s
└─ Event: Context loaded

        ↓

State 6: EXECUTING
├─ Build enhanced task prompt with lessons
├─ Execute Claude Code CLI
├─ Apply relevant lessons during execution
├─ Discover new learnings
├─ Duration: Variable (1-10 minutes, typical: 2-5 min)
└─ Event: Task complete

        ↓

State 7: STORING_OUTPUT
├─ Store agent output to Redis
├─ Key: cfn_loop:task:{task-id}:agent:{agent-id}:output
├─ TTL: 1 hour
├─ Duration: <1s
└─ Event: Output stored

        ↓

State 8: EXITING
├─ Agent process exits
├─ Exit code: 0 (success) or 1 (failure)
├─ Container status: Exited
├─ Duration: <1s
└─ Event: Container exited

        ↓

State 9: POST_COMPLETION_HOOK
├─ Execute: cfn-post-completion-extract.sh
├─ Read agent output from Redis
├─ Parse output for lesson patterns
├─ Store lessons to PostgreSQL
├─ Update confidence for used lessons
├─ Duration: <2s
└─ Event: Lessons stored

        ↓

State 10: AUTO_REMOVED
├─ Docker auto-removes container (AutoRemove=true)
├─ Container deleted from Docker daemon
├─ Temporary files cleaned up
├─ Duration: <1s
└─ Event: Lifecycle complete

        ↓

State 11: KNOWLEDGE_PERSISTED
├─ Agent container no longer exists
├─ Knowledge persisted in PostgreSQL
├─ Next task will spawn fresh agent
├─ Next agent will load updated playbook (new lessons included)
└─ Duration: Eternal (knowledge survives forever)
```

### 2.2 Lifecycle Timing Breakdown

```
Component                     | Duration  | Percentage
------------------------------|-----------|------------
Pre-Spawn Hook (Context)      | 5s        | 2.5%
Container Spawn + Start        | 10s       | 5.0%
Context Loading                | 5s        | 2.5%
Task Execution                 | 150s      | 75.0%
Output Storage                 | 1s        | 0.5%
Container Exit                 | 1s        | 0.5%
Post-Completion Hook (Lessons) | 2s        | 1.0%
Auto-Remove                    | 1s        | 0.5%
------------------------------|-----------|------------
Total                         | 200s (3.3min) | 100%
```

**Note:** Task execution dominates (75%), hooks are fast (<10%).

---

## 3. Hook System Architecture

### 3.1 Hook Execution Environment

```
┌─────────────────────────────────────────────────────────────────┐
│ Team Coordinator Container                                      │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Hook Executor (Node.js child_process)                       │ │
│ │                                                             │ │
│ │ ExecuteHook(hookName, parameters):                          │ │
│ │   1. Build command: bash .claude/hooks/{hookName} {params} │ │
│ │   2. Spawn child process (stdio: 'pipe')                   │ │
│ │   3. Capture stdout/stderr                                 │ │
│ │   4. Wait for exit (timeout: 30s)                          │ │
│ │   5. Return {exitCode, stdout, stderr}                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Environment Variables:                                          │
│ - POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD              │
│ - REDIS_HOST, REDIS_PORT, REDIS_PASSWORD                       │
│ - TEAM_ID, TASK_ID, AGENT_ID                                   │
│                                                                 │
│ Mounted Volumes:                                                │
│ - .claude/hooks:/hooks:ro (hook scripts, read-only)            │
│ - /tmp:/tmp:rw (context files, read-write)                     │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Hook Script Structure

**Pre-Spawn Hook:**
```bash
#!/bin/bash
# File: .claude/hooks/cfn-pre-spawn-context-inject.sh
# Purpose: Load relevant playbook lessons before agent spawn

set -euo pipefail  # Strict mode

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id) TASK_ID="$2"; shift 2 ;;
    --agent-type) AGENT_TYPE="$2"; shift 2 ;;
    --tags) TAGS="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --output-file) OUTPUT_FILE="$2"; shift 2 ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
done

# Extract team_id from scope
TEAM_ID="${SCOPE##*:}"

# Convert comma-separated tags to PostgreSQL array
TAG_ARRAY="{${TAGS//,/,}}"

# Query PostgreSQL for relevant lessons
psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d cfn_corporate -t -A -F'|' <<EOF > /tmp/lessons.csv
SELECT json_agg(
  json_build_object(
    'id', id,
    'content', content,
    'scope', scope,
    'confidence', confidence,
    'success_count', success_count,
    'total_count', total_count,
    'tags', tags,
    'lesson_type', lesson_type,
    'created_at', created_at,
    'last_used_at', last_used_at
  ) ORDER BY
    CASE scope WHEN 'agent' THEN 1 WHEN 'team' THEN 2 WHEN 'org' THEN 3 END,
    confidence DESC,
    last_used_at DESC NULLS LAST
)
FROM context_reflections
WHERE (team_id = '$TEAM_ID' OR scope = 'org')
  AND tags && '$TAG_ARRAY'::TEXT[]
LIMIT 100;
EOF

# Build context JSON
LESSONS=$(cat /tmp/lessons.csv)
TAG_COUNT=$(echo "$TAGS" | tr ',' '\n' | wc -l)

cat > "$OUTPUT_FILE" <<EOF
{
  "task_id": "$TASK_ID",
  "agent_type": "$AGENT_TYPE",
  "tags": ["${TAGS//,/\",\"}"],
  "lessons": $LESSONS,
  "total_lessons": $(echo "$LESSONS" | jq 'length'),
  "load_time_ms": $((SECONDS * 1000)),
  "scope_breakdown": {
    "agent": $(echo "$LESSONS" | jq '[.[] | select(.scope == "agent")] | length'),
    "team": $(echo "$LESSONS" | jq '[.[] | select(.scope == "team")] | length'),
    "org": $(echo "$LESSONS" | jq '[.[] | select(.scope == "org")] | length')
  }
}
EOF

echo "Context injection complete: $OUTPUT_FILE"
exit 0
```

**Post-Completion Hook:**
```bash
#!/bin/bash
# File: .claude/hooks/cfn-post-completion-extract.sh
# Purpose: Extract and store lessons after agent completion

set -euo pipefail

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id) TASK_ID="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --agent-output) AGENT_OUTPUT="$2"; shift 2 ;;
    --auto-extract) AUTO_EXTRACT=true; shift ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
done

# Extract lessons using regex patterns
LESSONS_FILE="/tmp/lessons-${TASK_ID}.json"
echo "[]" > "$LESSONS_FILE"

# Pattern: "Learned: {content}"
grep -oP 'Learned: \K.+' <<< "$AGENT_OUTPUT" | while read -r lesson; do
  jq ". += [{\"content\": \"$lesson\", \"lesson_type\": \"learned\"}]" "$LESSONS_FILE" > /tmp/tmp.json
  mv /tmp/tmp.json "$LESSONS_FILE"
done

# Pattern: "Best practice: {content}"
grep -oP 'Best practice: \K.+' <<< "$AGENT_OUTPUT" | while read -r lesson; do
  jq ". += [{\"content\": \"$lesson\", \"lesson_type\": \"best_practice\"}]" "$LESSONS_FILE" > /tmp/tmp.json
  mv /tmp/tmp.json "$LESSONS_FILE"
done

# Similar for other patterns (anti_pattern, key_insight, etc.)

# Store lessons to PostgreSQL
LESSONS_STORED=0
LESSONS_UPDATED=0

while IFS= read -r lesson_json; do
  CONTENT=$(echo "$lesson_json" | jq -r '.content')
  LESSON_TYPE=$(echo "$lesson_json" | jq -r '.lesson_type')

  # Get team_id from agent
  TEAM_ID=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d cfn_corporate -t -A -c \
    "SELECT team_id FROM agents WHERE id = '$AGENT_ID'")

  # Extract tags from content
  TAGS=$(echo "$CONTENT" | grep -oP '\b(typescript|react|api|docker|email)\b' | sort -u | tr '\n' ',' | sed 's/,$//')
  TAG_ARRAY="{${TAGS//,/,}}"

  # Insert or update lesson
  RESULT=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d cfn_corporate -t -A -c \
    "INSERT INTO context_reflections (owner_id, team_id, scope, content, lesson_type, tags, confidence, success_count, total_count, created_by)
     VALUES ('$AGENT_ID', '$TEAM_ID', 'team', '$CONTENT', '$LESSON_TYPE', '$TAG_ARRAY', 0.80, 1, 1, '$AGENT_ID')
     ON CONFLICT (team_id, scope, content) DO UPDATE
     SET success_count = context_reflections.success_count + 1,
         total_count = context_reflections.total_count + 1,
         confidence = (context_reflections.success_count + 1.0) / (context_reflections.total_count + 1.0),
         updated_at = NOW()
     RETURNING CASE WHEN xmax = 0 THEN 'inserted' ELSE 'updated' END")

  if [[ "$RESULT" == "inserted" ]]; then
    ((LESSONS_STORED++))
  else
    ((LESSONS_UPDATED++))
  fi
done < <(jq -c '.[]' "$LESSONS_FILE")

# Output summary
cat <<EOF
{
  "task_id": "$TASK_ID",
  "agent_id": "$AGENT_ID",
  "extracted_lessons": $(jq 'length' "$LESSONS_FILE"),
  "lessons_stored": $LESSONS_STORED,
  "lessons_updated": $LESSONS_UPDATED,
  "extraction_time_ms": $((SECONDS * 1000))
}
EOF

exit 0
```

---

## 4. Database Architecture

### 4.1 PostgreSQL Schema Details

**Context Reflections Table:**
```sql
CREATE TABLE context_reflections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Ownership
    owner_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    team_id VARCHAR(50) NOT NULL,
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('agent', 'team', 'org')),

    -- Content
    content TEXT NOT NULL,
    lesson_type VARCHAR(50) CHECK (lesson_type IN (
        'learned', 'best_practice', 'anti_pattern',
        'key_insight', 'error_solution', 'optimization'
    )),
    tags TEXT[] NOT NULL,

    -- Confidence tracking
    confidence DECIMAL(3, 2) NOT NULL DEFAULT 0.80
        CHECK (confidence >= 0 AND confidence <= 1),
    success_count INTEGER NOT NULL DEFAULT 1 CHECK (success_count >= 0),
    total_count INTEGER NOT NULL DEFAULT 1 CHECK (total_count >= success_count),

    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP,
    created_by VARCHAR(100),

    -- Uniqueness constraint (deduplication)
    CONSTRAINT unique_lesson UNIQUE (team_id, scope, content)
);

-- Indexes for performance
CREATE INDEX idx_team_scope ON context_reflections (team_id, scope);
CREATE INDEX idx_tags ON context_reflections USING GIN (tags);
CREATE INDEX idx_confidence ON context_reflections (confidence DESC);
CREATE INDEX idx_last_used ON context_reflections (last_used_at DESC);
CREATE INDEX idx_created_at ON context_reflections (created_at DESC);

-- Composite index for common query pattern
CREATE INDEX idx_query_pattern ON context_reflections (
    team_id, scope, confidence DESC, last_used_at DESC
) WHERE tags IS NOT NULL;

-- Auto-update updated_at trigger
CREATE TRIGGER update_context_reflections_updated_at
    BEFORE UPDATE ON context_reflections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### 4.2 Query Performance Analysis

**Query Plan for Context Injection:**
```sql
EXPLAIN ANALYZE
SELECT id, content, scope, confidence, success_count, total_count, tags
FROM context_reflections
WHERE (team_id = 'frontend' OR scope = 'org')
  AND tags && ARRAY['typescript', 'react', 'errors']
ORDER BY
    CASE scope WHEN 'agent' THEN 1 WHEN 'team' THEN 2 WHEN 'org' THEN 3 END,
    confidence DESC,
    last_used_at DESC NULLS LAST
LIMIT 100;

-- Expected plan:
-- Bitmap Heap Scan on context_reflections (cost=10.5..150.2 rows=100)
--   Recheck Cond: (tags && '{typescript,react,errors}'::text[])
--   Filter: ((team_id = 'frontend') OR (scope = 'org'))
--   ->  Bitmap Index Scan on idx_tags (cost=0.0..10.5 rows=200)
--         Index Cond: (tags && '{typescript,react,errors}'::text[])

-- Execution time: 15-50ms (expected)
```

### 4.3 Storage Estimation

**Per-Team Playbook Storage:**
```
Assumptions:
- 200 lessons per team (after 6 months)
- Average lesson size: 200 bytes (content + metadata)
- Tags: 5 tags per lesson × 20 bytes = 100 bytes
- Total per lesson: ~300 bytes

Storage per team: 200 lessons × 300 bytes = 60KB
Storage for 10 teams: 600KB
Storage for 100 teams: 6MB

PostgreSQL overhead (indexes, TOAST): ~2x
Total storage: 12MB for 100 teams

Annual growth (assuming 50 new lessons/team/year):
  100 teams × 50 lessons × 300 bytes = 1.5MB/year

Conclusion: Storage is negligible, <100MB even for large orgs
```

---

## 5. Context Injection Pipeline

### 5.1 Pipeline Architecture

```
┌───────────────────────────────────────────────────────────────┐
│ Step 1: Tag Extraction (Coordinator)                         │
│                                                               │
│ Input: "Fix TypeScript errors in Header component"           │
│                                                               │
│ Process:                                                      │
│ 1. Tokenize: ["fix", "typescript", "errors", "header", ...]  │
│ 2. Filter stopwords: ["fix", "typescript", "errors", "header"]│
│ 3. Extract technical terms: ["typescript", "react", "errors"] │
│                                                               │
│ Output: ["typescript", "react", "errors"]                     │
│ Duration: <1s                                                 │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ Step 2: PostgreSQL Query (Pre-Spawn Hook)                    │
│                                                               │
│ Query:                                                        │
│ SELECT * FROM context_reflections                            │
│ WHERE (team_id = 'frontend' OR scope = 'org')                │
│   AND tags && ARRAY['typescript', 'react', 'errors']         │
│ ORDER BY scope, confidence DESC, last_used_at DESC           │
│ LIMIT 100                                                     │
│                                                               │
│ Results: 87 lessons                                           │
│ - Agent scope: 3 lessons                                      │
│ - Team scope: 52 lessons                                      │
│ - Org scope: 32 lessons                                       │
│                                                               │
│ Duration: 15-50ms (P95: 100ms)                                │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ Step 3: JSON Generation (Pre-Spawn Hook)                     │
│                                                               │
│ Generate: /tmp/context-task-123.json                         │
│                                                               │
│ Structure:                                                    │
│ {                                                             │
│   "task_id": "task-123",                                      │
│   "lessons": [ ... 87 lessons ... ],                          │
│   "total_lessons": 87,                                        │
│   "scope_breakdown": {"agent": 3, "team": 52, "org": 32}     │
│ }                                                             │
│                                                               │
│ File size: ~30KB (typical)                                    │
│ Duration: <1s                                                 │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ Step 4: Mount to Container (Coordinator)                     │
│                                                               │
│ Docker bind mount:                                            │
│ /tmp/context-task-123.json:/context.json:ro                  │
│                                                               │
│ Agent reads /context.json on startup                         │
│ Duration: <1s                                                 │
└───────────────────────────────────────────────────────────────┘
```

### 5.2 Caching Strategy

**Redis Cache Layer:**
```
┌───────────────────────────────────────────────────────────────┐
│ Context Injection with Redis Cache                           │
│                                                               │
│ Cache Key: playbook:{team}:{tags_sorted}:100                 │
│ Example: playbook:frontend:errors,react,typescript:100       │
│                                                               │
│ Flow:                                                         │
│ 1. Check Redis cache (GET playbook:frontend:...)             │
│    ├─ Hit: Return cached lessons (duration: <10ms)           │
│    └─ Miss: Query PostgreSQL → Cache result → Return         │
│                                                               │
│ TTL: 5 minutes (playbook changes infrequently)               │
│                                                               │
│ Cache hit rate: ~80% (same tags reused frequently)           │
│ Performance gain: 5-10x faster (10ms vs 50ms)                │
└───────────────────────────────────────────────────────────────┘
```

---

## 6. Lesson Extraction Pipeline

### 6.1 Extraction Patterns

**Regex Patterns:**
```javascript
const LESSON_PATTERNS = [
  {
    type: 'learned',
    regex: /Learned: (.+)$/gm,
    confidence: 0.80
  },
  {
    type: 'best_practice',
    regex: /Best practice: (.+)$/gm,
    confidence: 0.85
  },
  {
    type: 'anti_pattern',
    regex: /Anti-pattern: (.+)$/gm,
    confidence: 0.90  // Higher confidence for anti-patterns
  },
  {
    type: 'key_insight',
    regex: /Key insight: (.+)$/gm,
    confidence: 0.80
  },
  {
    type: 'error_solution',
    regex: /Error solution: (.+)$/gm,
    confidence: 0.85
  },
  {
    type: 'optimization',
    regex: /Optimization: (.+)$/gm,
    confidence: 0.80
  }
];
```

**Example Agent Output:**
```
Task: Fix TypeScript errors in Header.tsx

Analysis:
The Header component has 3 type errors:
1. Missing return type on functional component
2. Incorrect prop types
3. Missing interface definition

Fixes applied:
- Added explicit return type: React.ReactElement
- Created HeaderProps interface
- Updated component signature

Learned: React components should use explicit return types for better type inference
Best practice: Define interfaces for component props before implementation
Anti-pattern: Don't use 'any' type for props, it defeats TypeScript's purpose

Task completed successfully.
Confidence: 0.95
```

**Extracted Lessons (3):**
```json
[
  {
    "content": "React components should use explicit return types for better type inference",
    "lesson_type": "learned",
    "confidence": 0.80,
    "tags": ["react", "typescript", "types"]
  },
  {
    "content": "Define interfaces for component props before implementation",
    "lesson_type": "best_practice",
    "confidence": 0.85,
    "tags": ["react", "typescript", "interfaces", "props"]
  },
  {
    "content": "Don't use 'any' type for props, it defeats TypeScript's purpose",
    "lesson_type": "anti_pattern",
    "confidence": 0.90,
    "tags": ["typescript", "types", "anti-pattern"]
  }
]
```

### 6.2 Deduplication Logic

**PostgreSQL UPSERT:**
```sql
INSERT INTO context_reflections (
    owner_id, team_id, scope, content, lesson_type,
    tags, confidence, success_count, total_count, created_by
) VALUES (
    'agent-123', 'frontend', 'team',
    'React components should use explicit return types for better type inference',
    'learned',
    ARRAY['react', 'typescript', 'types'],
    0.80, 1, 1, 'agent-123'
)
ON CONFLICT (team_id, scope, content)
DO UPDATE SET
    -- Increment counters (lesson used again successfully)
    success_count = context_reflections.success_count + 1,
    total_count = context_reflections.total_count + 1,
    -- Recalculate confidence
    confidence = (context_reflections.success_count + 1.0) /
                 (context_reflections.total_count + 1.0),
    -- Update timestamp
    updated_at = NOW();

-- Result: If lesson exists, confidence increases
-- Before: 0.80 (1/1 success)
-- After:  0.85 (2/2 success) assuming both uses were successful
```

---

## 7. Performance Optimization

### 7.1 Database Indexing

**Index Strategy:**
```sql
-- Query 1: Context injection (team + tags)
CREATE INDEX idx_query_pattern ON context_reflections (
    team_id, scope, confidence DESC, last_used_at DESC
) WHERE tags IS NOT NULL;

-- Query 2: Tag overlap (GIN index)
CREATE INDEX idx_tags ON context_reflections USING GIN (tags);

-- Query 3: Time-based queries (recent lessons)
CREATE INDEX idx_created_at ON context_reflections (created_at DESC);

-- Query 4: Confidence filtering (high-confidence lessons)
CREATE INDEX idx_confidence ON context_reflections (confidence DESC)
WHERE confidence > 0.90;
```

**Index Size Estimation:**
```
Per-team playbook: 200 lessons
Index overhead: ~50% of table size

Table size: 60KB
Index size: 30KB
Total: 90KB per team

For 100 teams: 9MB total
Conclusion: Indexes are negligible
```

### 7.2 Connection Pooling

**PostgreSQL Connection Pool:**
```javascript
// File: docker/coordinator/src/db-pool.ts

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: 5432,
  database: 'cfn_corporate',
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,

  // Connection pool settings
  min: 2,           // Minimum connections
  max: 10,          // Maximum connections per coordinator
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await pool.end();
});

export default pool;
```

**Redis Connection Pool:**
```javascript
// File: docker/coordinator/src/redis-pool.ts

import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  password: process.env.REDIS_PASSWORD,

  // Connection pool settings
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },

  // Enable connection pooling
  lazyConnect: true,
  enableReadyCheck: true
});

export default redis;
```

---

## 8. Data Flow Diagrams

### 8.1 Complete Task Execution Flow

```
Task Arrives
    │
    ▼
┌─────────────────────────────────────────┐
│ Coordinator: Extract Tags               │
│ Input: Task description                 │
│ Output: ["typescript", "react", "errors"]│
│ Duration: <1s                           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Pre-Spawn Hook: Context Injection       │
│ 1. Query PostgreSQL (top 100 lessons)  │
│ 2. Generate /tmp/context-{id}.json     │
│ Duration: <5s                           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Coordinator: Spawn Ephemeral Container  │
│ 1. Create container (AutoRemove=true)  │
│ 2. Mount context file                  │
│ 3. Start container                     │
│ Duration: 10-15s                        │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Agent: Load Context                     │
│ 1. Read /context.json                  │
│ 2. Parse 100 lessons                   │
│ Duration: 3-5s                          │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Agent: Execute Task                     │
│ 1. Build enhanced prompt with lessons  │
│ 2. Run Claude Code CLI                 │
│ 3. Apply relevant lessons              │
│ 4. Discover new learnings              │
│ Duration: 1-10 minutes                  │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Agent: Store Output                     │
│ 1. Store to Redis (TTL: 1 hour)        │
│ Key: cfn_loop:task:{id}:agent:{id}:output│
│ Duration: <1s                           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Agent: Exit                             │
│ Container auto-removed (AutoRemove=true)│
│ Duration: <1s                           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Post-Completion Hook: Lesson Extraction │
│ 1. Read agent output from Redis        │
│ 2. Parse output for lesson patterns    │
│ 3. Store lessons to PostgreSQL         │
│ 4. Update confidence for used lessons  │
│ Duration: <2s                           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Knowledge Persisted                     │
│ - Agent container removed               │
│ - Lessons stored in PostgreSQL          │
│ - Next task will load updated playbook │
└─────────────────────────────────────────┘
```

### 8.2 Confidence Tracking Flow

```
Lesson Discovery (First Time)
    │
    ▼
┌─────────────────────────────────────────┐
│ Store to PostgreSQL                     │
│ confidence: 0.80 (default)              │
│ success_count: 1                        │
│ total_count: 1                          │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Lesson Loaded by Next Agent             │
│ Lesson applied in task execution        │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Task Succeeds                           │
│ Update confidence:                      │
│ success_count: 2 (+1)                   │
│ total_count: 2 (+1)                     │
│ confidence: 2/2 = 1.00                  │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Lesson Prioritized in Future Queries    │
│ ORDER BY confidence DESC                │
│ (1.00 confidence appears first)         │
└─────────────────────────────────────────┘

Alternative Path: Task Fails
    │
    ▼
┌─────────────────────────────────────────┐
│ Update confidence:                      │
│ success_count: 1 (no change)            │
│ total_count: 2 (+1)                     │
│ confidence: 1/2 = 0.50                  │
│ (Lesson deprioritized due to failure)   │
└─────────────────────────────────────────┘
```

---

**End of Phase 2 Architecture v2.0.0**
