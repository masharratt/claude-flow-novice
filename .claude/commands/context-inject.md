---
description: Inject adaptive context bullets into CLAUDE.md dynamically based on task/phase/tags
tags: [context, ace, injection, claude-md, dynamic]
---

# Context Injection Command

Dynamically inject relevant adaptive context bullets into CLAUDE.md (or agent-specific instructions) based on task context, phase, or tags.

**Usage:**
```bash
/context-inject [--target=<path>] [--category=<type>] [--tags=<tag1,tag2>] [--mode=<mode>]
```

**What This Does:**
1. Queries `adaptive_context` table with relevance filters
2. Formats bullets for CLAUDE.md injection
3. Inserts into CLAUDE.md under `## 📘 Adaptive Context` section
4. Optionally injects into agent-specific instruction files
5. Records injection in usage log for tracking

**Arguments:**
- `--target=<path>`: Target file (default: ./CLAUDE.md)
- `--category=<type>`: Filter by category (strategy/pattern/edge_case/...)
- `--tags=<tag1,tag2>`: Filter by tags (comma-separated)
- `--phase=<name>`: Auto-select bullets relevant to CFN Loop phase
- `--min-confidence=<0.0-1.0>`: Minimum confidence (default: 0.7)
- `--min-helpful=<count>`: Minimum helpful count (default: 3)
- `--priority-min=<1-10>`: Minimum priority (default: 6)
- `--limit=<N>`: Max bullets to inject (default: 15)
- `--mode=<mode>`: Injection mode (append|replace|merge) (default: merge)
- `--section=<name>`: Section name in CLAUDE.md (default: "Adaptive Context")
- `--agent-type=<type>`: Inject bullets for specific agent type
- `--swarm-id=<id>`: Use swarm-specific context
- `--dry-run`: Preview injection without writing

**Injection Modes:**

**1. Merge (Default):**
- Preserves existing CLAUDE.md content
- Adds/updates `## 📘 Adaptive Context` section
- Updates bullets if already present (based on bullet_id)
- Preserves custom user edits in other sections

**2. Append:**
- Adds bullets to end of CLAUDE.md
- Never modifies existing content
- Useful for temporary context injection

**3. Replace:**
- Replaces entire `## 📘 Adaptive Context` section
- WARNING: Removes user edits in that section
- Use with caution

**CLAUDE.md Section Format:**
```markdown
## 📘 Adaptive Context (Auto-Managed by /context-inject)

**Last Updated:** 2025-10-13 12:30:00 UTC
**Bullets Injected:** 12
**Avg Confidence:** 0.84
**Context:** phase=phase-0-foundation, tags=cfn-loop,coordination,sqlite

---

### Strategies (High Priority)

**[STRAT-001]** Use phone contacts as identity key when identifying relationships
*Confidence: 0.92 | Helpful: 12 | Priority: 9*
When implementing user identity matching, prefer phone contact data over description parsing for higher accuracy.
**Tags:** identity, matching, contacts

**[STRAT-042]** CFN Loop coordination: Redis pub/sub + SQLite persistence
*Confidence: 0.85 | Helpful: 8 | Priority: 8*
Use Redis pub/sub for ephemeral coordination state (heartbeats, agent signals) and SQLite for persistent audit trails and cross-loop data storage.
**Tags:** cfn-loop, coordination, redis, sqlite, persistence

---

### Patterns (Proven)

**[PATTERN-017]** API pagination with `while true` until empty page
*Confidence: 0.88 | Helpful: 9 | Priority: 7*
Implement paginated API fetching using infinite loop with break condition on empty response.
**Tags:** api, pagination, rest

---

### Edge Cases (Caution)

**[EDGE-044]** SQLite ACL permission boundary with nested swarms
*Confidence: 0.75 | Helpful: 5 | Priority: 6*
When nesting swarms, ensure ACL inheritance is explicitly set to avoid permission leakage across swarm boundaries.
**Tags:** sqlite, acl, security, swarms

---

### Anti-Patterns (Avoid)

**[ANTI-013]** Using file-based coordination without locks
*Confidence: 0.70 | Helpful: 2 | Harmful: 4 | Priority: 8*
Avoid coordinating agents via direct file writes without proper locking mechanisms. Use Redis pub/sub or SQLite transactions instead.
**Tags:** coordination, anti-pattern, race-condition

---

*📊 Context Health:*
- Total active bullets: 127
- Avg confidence: 0.78
- Bullets updated this session: 5
- Next curation: 2025-10-14 00:00 UTC

*💡 Tip:* Run `/context-query --tags=<your-task-tags>` to explore more relevant bullets.
```

**Phase-Aware Injection:**
Auto-select bullets based on CFN Loop phase:

```bash
# Phase 0: Foundation
/context-inject --phase=phase-0-foundation
# Tags: architecture, foundation, setup, infrastructure

# Phase 1: Core Implementation
/context-inject --phase=phase-1-implementation
# Tags: coding, patterns, testing, best-practices

# Phase 2: Security & Optimization
/context-inject --phase=phase-2-security
# Tags: security, acl, validation, performance

# Phase 3: Integration & Deployment
/context-inject --phase=phase-3-deployment
# Tags: deployment, integration, monitoring, ci-cd
```

**Agent-Specific Injection:**
Inject bullets relevant to specific agent types:

```bash
# For security specialist agents
/context-inject --agent-type=security-specialist --target=./.claude/agents/security-specialist.md

# For coder agents
/context-inject --agent-type=coder --category=pattern --min-helpful=5

# For architect agents
/context-inject --agent-type=architect --category=strategy --priority-min=8
```

**Pre-Spawn Context Injection:**
Use with pre-agent-spawn hook:

```bash
# config/hooks/pre-agent-spawn-context.js
async function preAgentSpawnContext(agentType, taskContext) {
  // Query relevant bullets
  const bullets = await queryContext({
    agentType,
    tags: taskContext.tags,
    minConfidence: 0.7
  });

  // Inject into agent's instruction file
  const agentFile = `./.claude/agents/${agentType}.md`;
  await injectBullets(agentFile, bullets, { mode: 'merge' });

  // Log usage
  bullets.forEach(bullet => {
    logContextUsage(bullet.bullet_id, taskContext.task_id, agentType);
  });
}
```

**Dynamic Injection:**

```bash
# Query top bullets for current task
BULLETS=$(sqlite3 ./.artifacts/database/swarm-memory.db "
SELECT '**[' || bullet_id || ']** ' || content || ' (confidence: ' || confidence_score || ')'
FROM adaptive_context
WHERE is_active = 1
  AND (tags LIKE '%auth%' OR tags LIKE '%security%')
  AND confidence_score >= 0.7
ORDER BY helpful_count DESC, confidence_score DESC
LIMIT 5;
")

# Inject into agent prompt
Task("coder-1", "
Implement authentication system.

Before you start, review these proven patterns:
$BULLETS

Follow these patterns to avoid common pitfalls.
", "coder");
```

**Validation & Safety:**
- Validates bullet confidence before injection (default min: 0.7)
- Checks helpful/harmful ratio (default: harmful_count < 3)
- Respects ACL permissions (only injects bullets agent can access)
- Sanitizes content (removes sensitive data)
- Preserves user edits outside managed section

**Automatic Injection Triggers:**
Configure automatic injection via hooks:

```yaml
# config/hooks/auto-inject-rules.yaml
rules:
  - trigger: cfn-loop-phase-start
    action: context-inject
    params:
      phase: ${phase_name}
      target: ./CLAUDE.md
      min-confidence: 0.75

  - trigger: agent-spawn
    action: context-inject
    params:
      agent-type: ${agent_type}
      target: ./.claude/agents/${agent_type}.md
      limit: 10

  - trigger: task-start
    action: context-inject
    params:
      tags: ${task_tags}
      mode: append
      limit: 5
```

**Rollback & Cleanup:**
```bash
# Remove injected section
/context-inject --mode=remove --section="Adaptive Context"

# Restore from backup
/context-inject --restore-backup=./CLAUDE.md.backup-20251013
```

**Metrics & Monitoring:**
Track injection effectiveness:
```sql
SELECT
    bullet_id,
    content,
    COUNT(*) as injection_count,
    AVG(CASE WHEN usage_outcome = 'helpful' THEN 1.0 ELSE 0.0 END) as helpfulness_rate
FROM context_usage_log
WHERE created_at > datetime('now', '-7 days')
GROUP BY bullet_id
ORDER BY helpfulness_rate DESC;
```

**See Also:**
- `/context-query` - Search bullets before injection
- `/context-reflect` - Extract lessons from execution
- `/context-curate` - Merge reflections into context
- `/context-stats` - View bullet statistics and health
