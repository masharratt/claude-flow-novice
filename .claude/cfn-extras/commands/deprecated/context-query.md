---
description: Query adaptive context bullets by category, tags, confidence, or semantic similarity
tags: [context, ace, query, search, retrieval]
---

# Context Query Command

Search the `adaptive_context` table to retrieve relevant bullets for task execution, agent spawning, or CLAUDE.md injection.

**Usage:**
```bash
/context-query [--category=<type>] [--tags=<tag1,tag2>] [--min-confidence=<0.0-1.0>]
```

**What This Does:**
1. Queries `adaptive_context` table with filters
2. Ranks bullets by relevance (priority, confidence, usage_count)
3. Optionally uses semantic similarity if embeddings available
4. Returns formatted bullets ready for injection

**Arguments:**
- `--category=<type>`: Filter by category (strategy/pattern/edge_case/domain_insight/anti_pattern/optimization)
- `--tags=<tag1,tag2>`: Filter by tags (comma-separated)
- `--min-confidence=<0.0-1.0>`: Minimum confidence score (default: 0.6)
- `--min-helpful=<count>`: Minimum helpful_count (default: 0)
- `--max-harmful=<count>`: Maximum harmful_count (default: 2)
- `--priority-min=<1-10>`: Minimum priority (default: 5)
- `--limit=<N>`: Max results to return (default: 20)
- `--sort-by=<field>`: Sort by confidence|helpful_count|priority|last_used_at (default: priority)
- `--semantic-query=<text>`: Find bullets semantically similar to query text (requires embeddings)
- `--related-to=<bullet-id>`: Find bullets related to specific bullet
- `--swarm-id=<id>`: Filter by swarm context
- `--project-id=<id>`: Filter by project context
- `--output=<format>`: Output format (json|markdown|claude-md) (default: markdown)
- `--inject`: Automatically inject results into CLAUDE.md

**Query Examples:**

```bash
# Get top strategy bullets
/context-query --category=strategy --min-confidence=0.8 --limit=10

# Find CFN Loop coordination patterns
/context-query --tags=cfn-loop,coordination --min-helpful=3

# Get all high-priority optimization tips
/context-query --category=optimization --priority-min=7 --sort-by=confidence

# Semantic search for Redis patterns
/context-query --semantic-query="Redis pub/sub coordination patterns"

# Get bullets related to specific bullet
/context-query --related-to=STRAT-001 --limit=5

# Get project-specific domain insights
/context-query --category=domain_insight --project-id=proj-auth --min-helpful=5
```

**Output Formats:**

**1. Markdown (Default):**
```markdown
## Query Results: 10 bullets (category=strategy, min-confidence=0.8)

### [STRAT-001] Use Phone Contacts as Identity Key ⭐
When identifying relationships (roommates, contacts), prefer phone contact matching instead of description parsing.

**Metadata:**
- Confidence: 0.92 | Helpful: 12 | Harmful: 0 | Priority: 9
- Tags: identity, matching, contacts
- Last used: 2025-10-12 | Source: task-roomsync-v2
- Category: strategy

---

### [STRAT-042] CFN Loop Coordination Strategy ⭐
Use Redis pub/sub for ephemeral coordination state (heartbeats, signals) and SQLite for persistent audit trails and cross-loop data.

**Metadata:**
- Confidence: 0.85 | Helpful: 8 | Harmful: 0 | Priority: 8
- Tags: cfn-loop, coordination, redis, sqlite, persistence
- Last used: 2025-10-13 | Source: phase-0-foundation
- Category: strategy

...
```

**2. CLAUDE.md Format:**
```markdown
## 📘 Adaptive Context Bullets (Auto-Injected)

### Strategies

**[STRAT-001]** Use phone contacts as identity key when identifying relationships
(Confidence: 0.92 | Helpful: 12 | Source: task-roomsync-v2)

**[STRAT-042]** Use Redis pub/sub for ephemeral state + SQLite for persistent audit trails in CFN Loop
(Confidence: 0.85 | Helpful: 8 | Source: phase-0-foundation)

### Patterns

**[PATTERN-017]** API pagination via `while true` until empty page
(Confidence: 0.88 | Helpful: 9 | Source: task-api-pagination)

...
```

**3. JSON:**
```json
{
  "query": {
    "category": "strategy",
    "min_confidence": 0.8,
    "limit": 10
  },
  "results": [
    {
      "bullet_id": "STRAT-001",
      "category": "strategy",
      "content": "Use phone contacts as identity key when identifying relationships",
      "confidence_score": 0.92,
      "helpful_count": 12,
      "harmful_count": 0,
      "priority": 9,
      "tags": ["identity", "matching", "contacts"],
      "source_context": "task-roomsync-v2",
      "last_used_at": "2025-10-12T10:30:00Z",
      "usage_count": 15
    }
  ],
  "total_results": 10,
  "avg_confidence": 0.86
}
```

**Semantic Search (Optional):**
If embeddings available:
```sql
SELECT
    bullet_id,
    content,
    confidence_score,
    helpful_count,
    COSINE_SIMILARITY(embedding_vector, query_embedding) AS similarity
FROM adaptive_context
WHERE is_active = 1
    AND similarity > 0.75
ORDER BY similarity DESC, confidence_score DESC
LIMIT 10;
```

**Usage Patterns:**

**1. Pre-Agent Spawn Context Injection:**
```bash
# Get relevant bullets for agent spawn
/context-query --tags=cfn-loop,coordination --min-confidence=0.7 --output=claude-md --inject

# This injects bullets into agent's CLAUDE.md context:
Task("coder", "Implement CFN Loop coordinator with context: [STRAT-042, PATTERN-017, ...]")
```

**2. Task-Specific Context:**
```bash
# Get security patterns before security audit
/context-query --category=pattern --tags=security,acl --min-helpful=5

# Get optimization tips before performance work
/context-query --category=optimization --priority-min=7 --sort-by=helpful_count
```

**3. Debugging & Investigation:**
```bash
# Find related edge cases
/context-query --category=edge_case --tags=sqlite,acl

# Check anti-patterns to avoid
/context-query --category=anti_pattern --min-harmful=3
```

**4. Learning & Documentation:**
```bash
# Get domain insights for documentation
/context-query --category=domain_insight --project-id=proj-auth --output=markdown
```

**Usage Tracking:**
When bullets are retrieved and used in task execution:
```sql
INSERT INTO context_usage_log (bullet_id, task_id, agent_id, usage_outcome, outcome_reason)
VALUES ('STRAT-001', 'task-xyz', 'agent-abc', 'helpful', 'Identity matching strategy worked perfectly');
```
This automatically increments `helpful_count` via trigger.

**Performance:**
- Indexed queries: <5ms for tag/category filters
- Semantic search: <50ms with embeddings (SQLite-vec extension)
- Results cached in Redis for 5 minutes

**ACL Enforcement:**
- Respects bullet ACL levels
- Filters results based on agent/swarm/project permissions
- Private bullets (ACL 1) only visible to owning agent
- Project bullets (ACL 4) visible to all project agents

**See Also:**
- `/context-reflect` - Extract lessons from execution
- `/context-curate` - Merge reflections into context
- `/context-inject` - Add bullets to CLAUDE.md
- `/context-stats` - View bullet statistics
