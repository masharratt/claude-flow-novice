# CFN Learnings System

**Purpose:** Lightweight per-project discovery logging. Skills and agents auto-log patterns, pitfalls, and preferences discovered during work. Enables cross-session knowledge transfer.

## Storage

Per-project JSONL file: `~/.claude/cfn-data/learnings/<project-slug>.jsonl`

Each line is a JSON object:
```json
{"type":"pitfall","key":"supabase-rls-missing","insight":"New tables without RLS policies cause silent data exposure in multi-tenant queries","confidence":9,"source":"debugging-session","files":["supabase/migrations/001.sql"],"timestamp":"2026-04-03T10:00:00Z"}
```

## Fields

| Field | Required | Description |
|-------|----------|-------------|
| type | Yes | pattern, pitfall, preference, architecture, tool |
| key | Yes | kebab-case identifier. Same key = update (latest timestamp wins) |
| insight | Yes | One sentence. Specific and actionable. |
| confidence | Yes | 1-10. 8+ = reliable. <5 = speculative, verify before acting. |
| source | Yes | user-stated, debugging-session, code-review, agent-discovery, cfn-loop |
| files | No | Affected file paths. Used for staleness detection. |
| timestamp | Yes | ISO 8601 |

## Subcommands

- `/learn` : Show 20 most recent learnings for current project
- `/learn search <query>` : Search learnings by keyword
- `/learn add` : Manually add a learning
- `/learn prune` : Remove stale entries (referenced files deleted, contradictions)
- `/learn stats` : Summary by type and source

## Auto-logging

Skills should append learnings when they discover something notable:
- cfn-investigate: logs root cause patterns after debugging
- Code review agents: log pitfalls found during review
- CFN Loop coordinators: log architecture decisions

## Pruning Rules

During `/learn prune`:
1. Check if files in `files` array still exist. If all deleted, mark as stale candidate.
2. Find same-key entries with contradicting insights. Surface for user decision.
3. Entries with confidence <3 and age >30 days are auto-removal candidates.
4. Always ask before removing. Never auto-delete.

## Integration with Memory System

Learnings complement the auto-memory system:
- **Memory:** User preferences, project context, references (cross-session, human-oriented)
- **Learnings:** Technical discoveries from automated work (cross-session, machine-oriented)

Learnings can be promoted to memory via `/learn export` when they prove consistently useful.
