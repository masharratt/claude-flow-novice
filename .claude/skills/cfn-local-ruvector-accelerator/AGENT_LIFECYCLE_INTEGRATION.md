# RuVector Agent Lifecycle Integration

## Overview

The RuVector Agent Lifecycle Integration automatically captures and indexes agent execution data, enabling semantic search over historical agent decisions, tool usage patterns, and failure recovery strategies.

## Architecture

```
Agent Execution → cfn-subagent-stop.sh → ingest-agent-transcript.sh → SQLite Database
                                                                      ↓
                                                           agent_transcripts
                                                           agent_failure_patterns
                                                                      ↓
                                                          query-agent-patterns.sh
```

## Components

### 1. Transcript Ingestion (`ingest-agent-transcript.sh`)

Automatically called by `cfn-subagent-stop.sh` after each agent execution.

**Functionality:**
- Parses JSONL transcript files
- Extracts decision points and tool usage events
- Identifies error patterns in failed agents
- Stores searchable snippets in `agent_transcripts` table

**Schema:**
```sql
CREATE TABLE agent_transcripts (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    task_id TEXT,
    snippet TEXT NOT NULL,
    snippet_type TEXT,           -- decision, tool_use, error, recovery
    embedding BLOB,               -- placeholder for future vector embeddings
    metadata TEXT,                -- JSON: tool, outcome, timestamp, line_number
    success_rate REAL DEFAULT 0.0,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Failure Pattern Analysis (`analyze-agent-failures.sh`)

Periodic analysis of agent failures to identify common patterns and recovery strategies.

**Usage:**
```bash
# Analyze failures from last 7 days
./analyze-agent-failures.sh --days 7

# Analyze failures from last 30 days, minimum 3 occurrences
./analyze-agent-failures.sh --days 30 --min-occurrences 3
```

**Functionality:**
- Queries failed agents (confidence < 0.70 or explicit failure)
- Classifies failure modes: edit_hook_validation, timeout, permission_error, syntax_error, test_failure
- Clusters similar failures
- Identifies recovery strategies from subsequent successful executions
- Updates `agent_failure_patterns` table

**Schema:**
```sql
CREATE TABLE agent_failure_patterns (
    id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    failure_mode TEXT NOT NULL,
    root_cause TEXT,
    recovery_strategy TEXT,
    embedding BLOB,
    occurrence_count INTEGER DEFAULT 1,
    last_seen TIMESTAMP,
    resolution_rate REAL DEFAULT 0.0,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Pattern Query Interface (`query-agent-patterns.sh`)

Search historical agent data for guidance on current tasks.

**Usage:**
```bash
# Search all patterns
./query-agent-patterns.sh --query "pre-edit hook validation failure"

# Search only failure patterns
./query-agent-patterns.sh --query "validation" --search-type failures

# Filter by agent type
./query-agent-patterns.sh --query "file write" --type coder --limit 5

# Get statistics
./query-agent-patterns.sh --search-type stats
```

**Search Types:**
- `all` - Search both transcripts and failure patterns (default)
- `transcripts` - Search only agent transcript snippets
- `failures` - Search only failure patterns
- `stats` - Display agent lifecycle statistics

## Integration with cfn-subagent-stop.sh

The subagent stop hook automatically triggers RuVector ingestion:

```bash
# cfn-subagent-stop.sh (excerpt)

# Determine agent success/failure
AGENT_SUCCESS="true"
AGENT_CONFIDENCE=$(sqlite3 "$DB_PATH" "SELECT confidence FROM agents WHERE id = '$AGENT_ID';")

if awk "BEGIN {exit !($AGENT_CONFIDENCE < 0.70)}"; then
    AGENT_SUCCESS="false"
fi

# Call RuVector ingestion
./.claude/skills/cfn-local-ruvector-accelerator/ingest-agent-transcript.sh \
    --transcript "$TRANSCRIPT_ARCHIVE" \
    --agent-id "$AGENT_ID" \
    --agent-type "$AGENT_TYPE" \
    --task-id "$TASK_ID" \
    --success "$AGENT_SUCCESS"
```

## Data Flow

### Phase 1: Transcript Ingestion (Automatic)

1. Agent completes execution
2. `cfn-subagent-stop.sh` hook fires
3. Transcript copied to `.artifacts/transcripts/`
4. `ingest-agent-transcript.sh` called automatically
5. JSONL parsed for tool_use and error events
6. Snippets stored in `agent_transcripts` table
7. Agent metadata updated with processing status

### Phase 2: Failure Pattern Analysis (Periodic)

1. Run `analyze-agent-failures.sh` weekly/monthly
2. Query failed agents from lifecycle database
3. Extract failure contexts from transcripts
4. Classify and cluster failure modes
5. Identify recovery strategies from successful agents
6. Store patterns in `agent_failure_patterns` table

### Phase 3: Pattern Query (On-Demand)

1. Developer/agent encounters issue
2. Query historical patterns: `./query-agent-patterns.sh --query "similar issue"`
3. Review matched transcripts and failure patterns
4. Apply recovery strategies from historical successes

## Example Queries

### Find validation failure solutions
```bash
./query-agent-patterns.sh --query "validation failed" --search-type failures
```

Output:
```
=== Failure Pattern Matches ===

Agent Type: loop3-implementer
Failure Mode: edit_hook_validation
Occurrences: 12
Root Cause: pre-edit backup hook failed: file permissions on /tmp/...
Recovery Strategy: Successful loop3-implementer agents: used similar tool chains with validation steps
```

### Find tool usage patterns for file operations
```bash
./query-agent-patterns.sh --query "write file" --type coder --limit 5
```

Output:
```
=== Agent Transcript Matches ===

Agent: agent-20241209-001 (coder)
Type: tool_use
Snippet: {"type":"tool_use","name":"Write","input":{"file_path":"/path/to/file.ts","content":"..."},...
Metadata: {"tool":"Write","outcome":"true","line_number":42,"timestamp":"2024-12-09T10:30:00Z"}
```

### Get agent statistics
```bash
./query-agent-patterns.sh --search-type stats
```

Output:
```
=== Agent Lifecycle Statistics ===

Agent executions by type:
loop3-implementer|145
loop2-validator|98
coder|67
...

Recent failures (last 7 days):
8

Most common failure modes:
edit_hook_validation|15
timeout|7
test_failure|5
```

## Future Enhancements

### Vector Embeddings (Phase 4)

Currently, the `embedding BLOB` field is a placeholder. Future integration with actual vector embeddings:

1. **Use sentence-transformers** for semantic search:
   ```python
   from sentence_transformers import SentenceTransformer
   model = SentenceTransformer('all-MiniLM-L6-v2')
   embedding = model.encode(snippet_text)
   ```

2. **Store embeddings** in the BLOB field
3. **Query by similarity** using cosine distance
4. **Enable questions like**: "What did agents do when encountering TypeScript type errors?"

### Tool Pattern Learning (Phase 5)

Track successful tool combinations:

```sql
CREATE TABLE tool_patterns (
    id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    tool_sequence TEXT NOT NULL,  -- "Bash,Glob,Grep,Write,Bash"
    success_rate REAL DEFAULT 0.0,
    usage_count INTEGER DEFAULT 0,
    avg_duration_ms REAL,
    metadata TEXT
);
```

### Confidence Calibration (Phase 6)

Track reported vs. actual confidence:

```sql
CREATE TABLE confidence_calibration (
    id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    confidence_reported REAL NOT NULL,
    confidence_actual REAL NOT NULL,
    context_size INTEGER,
    outcome TEXT
);
```

## Maintenance

### Database Size Management

Monitor database growth:
```bash
du -h .claude/skills/cfn-redis-coordination/data/cfn-loop.db
```

Archive old transcripts:
```bash
# Archive transcripts older than 90 days
sqlite3 "$DB_PATH" "DELETE FROM agent_transcripts WHERE created_at < datetime('now', '-90 days');"

# Archive old failure patterns with low occurrence
sqlite3 "$DB_PATH" "DELETE FROM agent_failure_patterns WHERE occurrence_count < 2 AND created_at < datetime('now', '-30 days');"
```

### Log Management

RuVector ingestion logs are written to:
- `.artifacts/logs/ruvector-ingestion.log` - Transcript ingestion events
- `.artifacts/logs/ruvector-failure-analysis.log` - Failure pattern analysis
- `.artifacts/logs/subagent-lifecycle.log` - Hook execution logs

Rotate logs periodically:
```bash
# Rotate logs older than 30 days
find .artifacts/logs -name "*.log" -mtime +30 -delete
```

## Troubleshooting

### Ingestion not running

Check if hook is being called:
```bash
tail -f .artifacts/logs/subagent-lifecycle.log
```

Verify script exists and is executable:
```bash
ls -l .claude/skills/cfn-local-ruvector-accelerator/ingest-agent-transcript.sh
```

### No patterns found

Run failure analysis manually:
```bash
./.claude/skills/cfn-local-ruvector-accelerator/analyze-agent-failures.sh --days 30
```

Check database tables exist:
```bash
sqlite3 .claude/skills/cfn-redis-coordination/data/cfn-loop.db ".tables"
```

### Query returns no results

Check if data exists:
```bash
sqlite3 .claude/skills/cfn-redis-coordination/data/cfn-loop.db "SELECT COUNT(*) FROM agent_transcripts;"
sqlite3 .claude/skills/cfn-redis-coordination/data/cfn-loop.db "SELECT COUNT(*) FROM agent_failure_patterns;"
```

Run with broader query:
```bash
./query-agent-patterns.sh --query "error" --limit 20
```

## References

- Analysis document: `docs/RUVECTOR_INTEGRATION_ANALYSIS.md`
- Subagent hooks: `.claude/hooks/cfn-subagent-*.sh`
- RuVector accelerator: `.claude/skills/cfn-local-ruvector-accelerator/`
- Lifecycle database: `.claude/skills/cfn-redis-coordination/data/cfn-loop.db`
