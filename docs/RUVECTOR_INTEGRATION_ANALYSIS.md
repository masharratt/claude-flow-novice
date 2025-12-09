# RuVector Integration Analysis: Subagent Lifecycle Data

**Date:** 2025-12-09  
**Scope:** Integrating subagent lifecycle hooks with Local RuVector Accelerator  
**Current State:** Subagent hooks track agent spawns/completions; RuVector indexes code patterns

## Executive Summary

The subagent lifecycle hooks (renamed to `cfn-subagent-start.sh` and `cfn-subagent-stop.sh`) capture rich operational data during agent execution. The Local RuVector Accelerator currently indexes code patterns with semantic search. A natural integration opportunity exists to feed agent lifecycle data and transcripts into RuVector to enable:

1. **Agent pattern learning** – Learn which agent types/tool combinations succeed
2. **Transcript indexing** – Search historical agent decisions and solutions
3. **Failure pattern detection** – Identify recurring failure modes and recovery strategies
4. **Tool usage analytics** – Track which tools work best in context

---

## Current Architecture

### Subagent Lifecycle Hooks

**Location:** `.claude/hooks/cfn-subagent-*.sh`

**Data Captured:**
- Agent ID, type, spawn/completion timestamps
- SQLite lifecycle table: `agents(id, type, status, confidence, spawned_at, completed_at, metadata)`
- Transcript collection: `AGENT_TRANSCRIPT_PATH` copied to `.artifacts/transcripts/`
- Metrics: tool_calls count, JSON metadata from transcripts

**Example Metadata:**
```json
{
  "source": "subagent_start_hook",
  "task_id": "cfn-loop-2024-001",
  "type": "loop3-implementer",
  "status": "completed",
  "tool_calls": 15,
  "transcript_path": ".artifacts/transcripts/agent-12345.jsonl"
}
```

### Local RuVector Accelerator

**Location:** `.claude/skills/cfn-local-ruvector-accelerator/`

**Current Capabilities:**
- Embeds code files (Rust, Python, JavaScript, etc.)
- Stores patterns in SQLite with success metrics
- Semantic search via cosine similarity on embeddings
- Supports filtering by file_type and success_rate

**Storage Model:**
```
SQLiteStore:
├── patterns(id, file_path, file_type, content, metadata, success_rate, usage_count)
├── pattern_similarities(pattern1_id, pattern2_id, similarity)
└── Indexes on file_type, success_rate, usage_count, created_at

EmbeddingsManager:
└── embeddings.pkl (stores np.ndarray vectors for patterns)
```

---

## Integration Opportunities

### Opportunity 1: Agent Transcript Indexing

**Current State:** Transcripts stored as JSONL in `.artifacts/transcripts/` but not searchable.

**Proposed Integration:**

1. **Extract searchable content** from agent transcripts:
   ```
   - Agent decisions and reasoning
   - Tool selections and rationales
   - Error recovery strategies
   - Code snippets generated
   - Validation outcomes
   ```

2. **Store in RuVector as embeddings:**
   - Transcript snippet → TF-IDF/Ada embedding
   - Metadata: agent_type, task_id, tool_used, success, timestamp
   - Enable queries like: "How did agents handle Redis connection errors?"

3. **Integration Point:**
   - Modify `cfn-subagent-stop.sh` post-transcript-collection
   - Call new script: `.claude/skills/cfn-local-ruvector-accelerator/ingest-agent-transcript.sh`
   - Pass transcript_path, agent_id, task_id, success_flag
   - Ingest logic: parse JSONL → extract decision points → embed → store

**Implementation Flow:**
```bash
# In cfn-subagent-stop.sh (after copying transcript)
if [ -f "$TRANSCRIPT_ARCHIVE" ]; then
    ./.claude/skills/cfn-local-ruvector-accelerator/ingest-agent-transcript.sh \
      --transcript "$TRANSCRIPT_ARCHIVE" \
      --agent-id "$AGENT_ID" \
      --agent-type "$AGENT_TYPE" \
      --task-id "$TASK_ID" \
      --success true/false
fi
```

---

### Opportunity 2: Agent Failure Pattern Recognition

**Current State:** SQLite tracks agent status but no pattern analysis across failures.

**Proposed Integration:**

1. **Query patterns for failed agents:**
   ```sql
   SELECT * FROM agents 
   WHERE status='completed' AND metadata LIKE '%"success": false%'
   ORDER BY completed_at DESC
   LIMIT 20
   ```

2. **Extract failure context:**
   - Tool chains attempted (sequence of tool_calls from transcript)
   - Common preconditions (agent_type, task_type, context_size)
   - Recovery actions that worked

3. **Index failure patterns in RuVector:**
   - Document: "Loop 3 implementer with >5 file edits failing on pre-edit hook validation"
   - Embeddings capture semantic similarity to future failures
   - Metadata: failure_type, root_cause, resolution

4. **Enable querying:**
   ```bash
   ./query-local.sh "pre-edit hook validation failure" --file-type agent-failure
   ```

**Integration Point:**
- New script: `.claude/skills/cfn-local-ruvector-accelerator/analyze-agent-failures.sh`
- Runs post-loop-completion as cleanup/learning step
- Batches failures weekly and ingests patterns

---

### Opportunity 3: Tool Usage Patterns

**Current State:** Transcripts contain tool_use events but not aggregated for patterns.

**Proposed Integration:**

1. **Extract tool sequences from transcripts:**
   - Grep/parse each agent's JSONL for `"type":"tool_use"` events
   - Build call sequence: `[Bash → Glob → Grep → Write → Bash]`
   - Label with outcome: success/failure, confidence score

2. **Store as embeddings:**
   ```python
   # Tool sequence document
   {
     "agent_type": "coder",
     "tool_sequence": "bash -> glob -> grep -> write -> bash",
     "tool_details": {
       "bash": ["git_status", "mkdir"],
       "write": ["api.ts", "180_lines"],
       "glob": ["*.ts", "1000_matches"]
     },
     "outcome": "success",
     "confidence": 0.92,
     "context": {
       "task": "implement_auth_middleware",
       "duration_ms": 45000
     }
   }
   ```

3. **Query for tool patterns:**
   ```bash
   ./query-local.sh "when writing multiple files, what tools to use" --file-type tool-pattern
   ```

4. **Track effectiveness:**
   - Store success_rate in RuVector SQLiteStore
   - Learn which tool combos work best per agent_type
   - Recommend tool chains to future agents

---

### Opportunity 4: Agent Confidence Calibration

**Current State:** `confidence` stored in agents table but not analyzed for patterns.

**Proposed Integration:**

1. **Track confidence vs outcome correlation:**
   - Agents reporting high confidence but failing
   - Low-confidence agents that succeed
   - Pattern: "Coder agents overestimate write-file complexity by 15%"

2. **Index confidence patterns:**
   ```python
   {
     "agent_type": "coder",
     "confidence_reported": 0.85,
     "confidence_actual": 0.72,
     "gap": -0.13,
     "failure_type": "post-edit-hook-validation",
     "context_size": 8000,
     "file_count": 3
   }
   ```

3. **Enable calibration queries:**
   ```bash
   ./query-local.sh "coder confidence calibration low context" --file-type calibration
   ```

---

## Detailed Integration Points

### 1. Data Flow Architecture

```
┌────────────────────────────────────────┐
│   Agent Execution (Loop 3)             │
└────────┬─────────────────────────────┘
         │
         ├─→ cfn-subagent-start.sh
         │   (write agents table)
         │
         ├─→ [Agent work...]
         │   (generates transcript)
         │
         └─→ cfn-subagent-stop.sh
             ├─ update agents table (completed)
             ├─ copy transcript
             └─→ ingest-agent-transcript.sh (NEW)
                 └─→ RuVector SQLiteStore
                     (embeddings + metadata)

┌────────────────────────────────────────┐
│   Post-Loop Analysis (weekly)          │
└────────┬─────────────────────────────┘
         │
         └─→ analyze-agent-failures.sh (NEW)
             ├─ query agents table for failures
             ├─ extract patterns from transcripts
             └─→ RuVector SQLiteStore
                 (failure patterns + remediation)
```

### 2. SQLiteStore Schema Extensions

**New tables to support agent lifecycle indexing:**

```sql
-- Agent transcript embeddings
CREATE TABLE agent_transcripts (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    task_id TEXT NOT NULL,
    snippet TEXT NOT NULL,                  -- code/decision snippet
    embedding BLOB NOT NULL,                -- vector embedding
    metadata TEXT,                          -- JSON: tool, outcome, timestamp
    success_rate REAL DEFAULT 0.0,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(agent_id) REFERENCES agents(id)
);

-- Agent failure patterns
CREATE TABLE agent_failure_patterns (
    id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    failure_mode TEXT NOT NULL,
    root_cause TEXT,
    recovery_strategy TEXT,
    embedding BLOB NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    last_seen TIMESTAMP,
    resolution_rate REAL DEFAULT 0.0,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tool usage patterns
CREATE TABLE tool_patterns (
    id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    tool_sequence TEXT NOT NULL,            -- comma-sep list
    embedding BLOB NOT NULL,
    success_rate REAL DEFAULT 0.0,
    usage_count INTEGER DEFAULT 0,
    avg_duration_ms REAL,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Confidence calibration
CREATE TABLE confidence_calibration (
    id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    confidence_reported REAL NOT NULL,
    confidence_actual REAL NOT NULL,
    context_size INTEGER,
    outcome TEXT,                          -- success/failure
    failure_type TEXT,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_agent_transcripts_agent_id ON agent_transcripts(agent_id);
CREATE INDEX idx_agent_transcripts_agent_type ON agent_transcripts(agent_type);
CREATE INDEX idx_agent_transcripts_task_id ON agent_transcripts(task_id);
CREATE INDEX idx_failure_patterns_agent_type ON agent_failure_patterns(agent_type);
CREATE INDEX idx_tool_patterns_agent_type ON tool_patterns(agent_type);
CREATE INDEX idx_confidence_agent_type ON confidence_calibration(agent_type);
```

### 3. Script: `ingest-agent-transcript.sh`

**Location:** `.claude/skills/cfn-local-ruvector-accelerator/ingest-agent-transcript.sh`

**Responsibility:**
- Parse JSONL transcript
- Extract decision points (tool selections, code snippets, reasoning)
- Generate embeddings using existing EmbeddingsManager
- Store in agent_transcripts table with metadata
- Update usage/success metrics

**Pseudocode:**
```bash
#!/bin/bash
# Input: --transcript FILE --agent-id ID --agent-type TYPE --task-id TASK --success true/false

# 1. Parse transcript JSONL for meaningful snippets
# 2. For each snippet:
#    a. Extract text content
#    b. Call Python to generate embedding
#    c. Store in SQLiteStore (agent_transcripts)
#    d. Tag with agent_type, task_id, outcome
# 3. Update agent record with transcript_processed=true
```

### 4. Script: `analyze-agent-failures.sh`

**Location:** `.claude/skills/cfn-local-ruvector-accelerator/analyze-agent-failures.sh`

**Responsibility:**
- Query SQLite agents table for failures in last N days
- Extract failure context from transcript metadata
- Group by failure_mode and root_cause
- Detect patterns (recurring failures in similar contexts)
- Generate embeddings for failure patterns
- Store in agent_failure_patterns table with recovery_strategy

**Pseudocode:**
```bash
#!/bin/bash
# Input: --days N (default 7)

# 1. Query failing agents
# 2. For each failure:
#    a. Read transcript and metadata
#    b. Extract: failure_type, tool_sequence, context
#    c. Cluster similar failures
# 3. For each failure cluster:
#    a. Generate embedding
#    b. Identify recovery_strategy (if found)
#    c. Store in agent_failure_patterns
#    d. Calculate resolution_rate
```

### 5. Integration with Query Interface

**New query types:**

```bash
# Query agent transcripts
./query-local.sh \
  --pattern "error handling in rust" \
  --file-type agent-transcript \
  --metadata-filter "agent_type:coder" \
  --limit 5

# Query failure patterns
./query-local.sh \
  --pattern "pre-edit hook validation failure" \
  --file-type agent-failure \
  --limit 10 \
  --show-recovery-strategies

# Query tool patterns
./query-local.sh \
  --pattern "when to use bash vs glob" \
  --file-type tool-pattern \
  --metadata-filter "agent_type:coder" \
  --limit 5

# Query confidence calibration
./query-local.sh \
  --pattern "coder overconfidence on multi-file writes" \
  --file-type confidence-calibration \
  --limit 10
```

---

## Implementation Phases

### Phase 1: Transcript Ingestion (2-3 days)
- [ ] Extend SQLiteStore with agent_transcripts table
- [ ] Create `ingest-agent-transcript.sh` script
- [ ] Modify `cfn-subagent-stop.sh` to call ingestion
- [ ] Test with sample transcripts

**Deliverable:** Agent transcripts searchable by content and agent metadata

### Phase 2: Failure Pattern Detection (2-3 days)
- [ ] Create `analyze-agent-failures.sh` script
- [ ] Implement failure clustering logic
- [ ] Add agent_failure_patterns table
- [ ] Setup weekly analysis job

**Deliverable:** Historical failure patterns indexed and queryable

### Phase 3: Tool Pattern Learning (2-3 days)
- [ ] Extract tool sequences from transcripts
- [ ] Build tool_patterns table
- [ ] Calculate success rates per tool combo
- [ ] Generate recommendations

**Deliverable:** Tool selection guidance based on historical success

### Phase 4: Confidence Calibration (1-2 days)
- [ ] Create confidence_calibration table
- [ ] Calculate reported vs actual confidence
- [ ] Identify systematic biases per agent_type
- [ ] Generate calibration reports

**Deliverable:** Agent confidence accuracy metrics and improvement suggestions

---

## Data Flow Example: Coder Agent Failure Recovery

```
Coder Agent Execution:
├─ Task: Implement authentication middleware
├─ Tool sequence: [Bash → Glob → Grep → Write → Bash]
├─ Write 3 files: auth.ts, types.ts, middleware.ts
├─ Reported confidence: 0.88
└─ Outcome: FAILED (post-edit hook validation)

cfn-subagent-stop.sh:
├─ Status: completed
├─ Metadata: {"tool_calls": 12, "files_written": 3}
├─ Transcript: .artifacts/transcripts/agent-12345.jsonl
└─ Call: ingest-agent-transcript.sh

ingest-agent-transcript.sh:
├─ Parse transcript JSONL
├─ Extract: "Why did validation fail?" reasoning
├─ Extract: "What was attempted as recovery?" decision points
├─ Generate embeddings for each snippet
├─ Store in agent_transcripts:
│  ├─ id: agent-12345-snippet-1
│  ├─ content: "Validation failed on missing exports in middleware.ts"
│  ├─ tool_used: "Write"
│  ├─ outcome: failed
│  └─ metadata: {"recovery": "added export list to types.ts"}
└─ Update agents table with transcript_processed=true

Confidence Calibration:
├─ Recorded: 0.88
├─ Actual: 0.00 (failed)
├─ Gap: -0.88
├─ Context: 3 files, 180 lines, complex TypeScript types
└─ Store in confidence_calibration table

Future Query:
User: "How do coder agents handle validation failures on TypeScript exports?"
↓
RuVector Search:
├─ Query embedding: "validation failure exports typescript"
├─ Candidates: agent-transcripts + agent_failure_patterns
├─ Results:
│  ├─ "Agent 12345 failed; recovery: export all types explicitly"
│  ├─ "Agent 8901 succeeded by testing exports with barrel files"
│  └─ "Confidence calibration: coders underestimate TS export complexity by 0.15"
└─ Return ranked by similarity and success_rate
```

---

## Benefits and ROI

### Short-term Benefits
1. **Faster incident recovery** – Search historical agent failures for solutions
2. **Tool recommendations** – Suggest optimal tool combinations per task
3. **Confidence calibration** – Improve agent self-assessment accuracy

### Medium-term Benefits
1. **Pattern learning** – Agents can query RuVector for similar past solutions
2. **Failure prevention** – Detect risky contexts before they fail
3. **Skill development** – Track which agents improve over time

### Long-term Benefits
1. **System optimization** – Data-driven tuning of agent selection and tool chains
2. **Predictive reliability** – Estimate success probability before execution
3. **Knowledge preservation** – Capture institutional knowledge from agent runs

---

## Risks and Mitigation

| Risk | Mitigation |
|------|-----------|
| Transcript data bloat | Archive transcripts older than 90 days; only index meaningful snippets |
| Embedding computation overhead | Batch embeddings weekly; cache results |
| False pattern detection | Cluster failures by root_cause; require min 3 occurrences for pattern |
| Privacy/sensitivity in transcripts | Sanitize transcripts before ingestion; mask user data, API keys |
| Index drift over time | Periodic reindexing; invalidate patterns with low usage |

---

## Recommended Integration Approach

**Prefer incremental integration over big-bang:**

1. **Start with Phase 1 (Transcript Ingestion):**
   - Low risk, high immediate value
   - Establishes data ingestion pattern
   - Unblocks later phases

2. **Add Phase 2 (Failure Patterns) next:**
   - Builds on Phase 1 data
   - Addresses most common pain point (debugging failures)

3. **Phases 3 & 4 can run in parallel:**
   - Tool patterns support agent self-guidance
   - Confidence calibration improves reliability

4. **Monitor and iterate:**
   - Track RuVector query usage and relevance
   - Adjust schema/ingestion based on queries
   - Solicit feedback from agents using RuVector insights

---

## Questions for Implementation Team

1. **Embedding model:** Should we use existing TF-IDF or integrate with Ada/external embeddings?
2. **Transcript privacy:** Are there sensitive fields that should be excluded from indexing?
3. **Query frequency:** How often will agents/humans query RuVector? Affects caching strategy.
4. **Retention policy:** How long to keep transcripts and embeddings? (Recommend: 90 days online, 1 year archive)
5. **Failure thresholds:** What constitutes "failure" for pattern learning? (Recommend: any non-zero exit code or confidence drop)

