# ACE System Quick Reference

> **TL;DR:** SQLite-backed adaptive context that learns from execution without rewriting CLAUDE.md

---

## 🚀 Quick Start (5 Minutes)

```bash
# 1. Apply schema
sqlite3 ./swarm-memory.db < src/sqlite/adaptive-context-schema.sql

# 2. Enable hooks
chmod +x config/hooks/post-task-reflection.js
chmod +x config/hooks/pre-agent-spawn-context.js

# 3. Test reflection
/context-reflect --task-id=test-123

# 4. Query bullets
/context-query --category=strategy --min-confidence=0.8

# 5. View stats
/context-stats
```

---

## 📋 Slash Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `/context-reflect` | Extract lessons from execution | `/context-reflect --task-id=task-123 --auto-curate` |
| `/context-curate` | Merge reflections into context | `/context-curate --reflection-id=ref-123 --auto-merge` |
| `/context-query` | Search bullets | `/context-query --tags=cfn-loop,redis --min-confidence=0.8` |
| `/context-inject` | Add bullets to CLAUDE.md | `/context-inject --phase=phase-0 --limit=15` |
| `/context-stats` | View analytics | `/context-stats --period=30 --detail-level=summary` |

---

## 🗄️ SQLite Tables

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `adaptive_context` | Bullets with metadata | `bullet_id`, `content`, `helpful_count`, `harmful_count`, `confidence_score` |
| `context_reflections` | Raw reflections | `reflection_type`, `extracted_lessons`, `curator_status` |
| `context_usage_log` | Usage tracking | `bullet_id`, `task_id`, `usage_outcome` (helpful/harmful) |
| `context_merge_log` | Audit trail | `merge_type`, `bullet_id`, `similarity_score`, `curator_reasoning` |

---

## 🎯 Bullet Categories

| Category | When to Use | Example |
|----------|-------------|---------|
| `strategy` | High-level approach | "Use Redis pub/sub for ephemeral state" |
| `pattern` | Reusable code pattern | "API pagination with while-true loop" |
| `edge_case` | Corner case/unexpected condition | "Handle empty tokens gracefully" |
| `domain_insight` | Domain-specific knowledge | "JWT tokens: 15min access, 7d refresh" |
| `anti_pattern` | Approach to avoid | "Avoid file-based coordination without locks" |
| `optimization` | Performance improvement | "Enable WASM for 52x faster parsing" |

---

## 🔄 Workflow

```
Task Execution
    ↓
post-task-reflection.js (automatic hook)
    ↓
/context-reflect (spawns context-reflector agent)
    ↓
context_reflections table (stores raw reflection)
    ↓
/context-curate (spawns context-curator agent)
    ↓
adaptive_context table (updates bullets)
    ↓
/context-query (retrieves relevant bullets)
    ↓
pre-agent-spawn-context.js (automatic hook)
    ↓
Agent Instructions (injected bullets)
    ↓
context_usage_log (tracks helpful/harmful)
```

---

## 🎣 Hooks

### Enable Hooks
```yaml
# .claude/hooks.yml
post-task:
  - ./config/hooks/post-task-reflection.js

pre-agent-spawn:
  - ./config/hooks/pre-agent-spawn-context.js

post-cfn-loop:
  - ./config/hooks/post-cfn-loop-reflection.js
```

### Hook Behavior

| Hook | Trigger | Action |
|------|---------|--------|
| `post-task-reflection.js` | Task completion | Auto-reflect, extract lessons |
| `pre-agent-spawn-context.js` | Before agent spawn | Inject relevant bullets into agent instructions |
| `post-cfn-loop-reflection.js` | CFN Loop phase completion | Phase-level reflection |

---

## 🔍 Common Queries

### Find High-Quality Bullets
```bash
/context-query --min-confidence=0.8 --min-helpful=10 --limit=20
```

### Search by Tags
```bash
/context-query --tags=cfn-loop,coordination,redis
```

### Phase-Aware Injection
```bash
/context-inject --phase=phase-0-foundation --limit=15
```

### View Pending Reflections
```sql
sqlite3 ./swarm-memory.db "SELECT id, reflection_type, curator_status FROM context_reflections WHERE curator_status = 'pending';"
```

### Check Bullet Health
```sql
sqlite3 ./swarm-memory.db "SELECT bullet_id, helpful_count, harmful_count, confidence_score FROM adaptive_context WHERE is_active = 1 ORDER BY confidence_score DESC LIMIT 10;"
```

---

## 🎛️ Similarity Thresholds

| Range | Action | Example |
|-------|--------|---------|
| ≥0.95 | Exact duplicate → Merge | "Use Redis" vs "Use Redis pub/sub" |
| 0.85-0.95 | Near duplicate → Increment helpful_count | Same strategy, different wording |
| 0.6-0.85 | Partial overlap → Consider merging | Complementary insights |
| <0.6 | Different topics → Add as new bullet | Unrelated content |

---

## 📊 Confidence Scoring

| Range | Meaning | Action |
|-------|---------|--------|
| 0.8-1.0 | High - Strong evidence | Always inject, trust completely |
| 0.6-0.8 | Medium - Moderate evidence | Inject selectively, monitor usage |
| 0.3-0.6 | Low - Hypothesis/observation | Require validation, limit injection |

**Confidence Factors:**
- ✅ Tests pass → +0.3
- ✅ High coverage (>80%) → +0.2
- ✅ No security issues → +0.2
- ✅ Working implementation → +0.1
- ⚠️ Lint warnings → -0.05
- ❌ Tests fail → -0.3

---

## 🧹 Maintenance Commands

### Weekly Maintenance
```bash
/context-curate --maintenance --auto-merge
```

**Actions:**
- Deduplicate near-duplicates (similarity > 0.90)
- Archive unused bullets (>90 days, usage_count < 2)
- Archive harmful bullets (harmful_count ≥ 5)
- Rebalance priority scores
- Flag bullets for validation

### View Health Metrics
```bash
/context-stats --period=30 --detail-level=detailed
```

### Archive Harmful Bullet
```sql
sqlite3 ./swarm-memory.db "UPDATE adaptive_context SET is_active = 0, archived_at = CURRENT_TIMESTAMP WHERE bullet_id = 'ANTI-013';"
```

---

## 🚦 Quality Gates

### Healthy Context
✅ Helpful/harmful ratio > 20:1
✅ Avg confidence ≥ 0.75
✅ 50-150 active bullets
✅ <5% near-duplicates (similarity > 0.90)
✅ Validation coverage > 80%

### Warning Signs
⚠️ Helpful/harmful ratio 10-20:1
⚠️ Avg confidence 0.6-0.75
⚠️ >150 active bullets (bloat)
⚠️ 5-10% near-duplicates
⚠️ Validation coverage 60-80%

### Critical Issues
❌ Helpful/harmful ratio < 10:1
❌ Avg confidence < 0.6
❌ >200 active bullets (severe bloat)
❌ >10% near-duplicates
❌ Validation coverage < 60%

---

## 🔧 Troubleshooting

### Reflection Not Running
```bash
# Check hook configured
cat .claude/hooks.yml | grep post-task-reflection

# Test manually
node config/hooks/post-task-reflection.js test-task-123 agent-abc completed

# Check enabled task types
grep enabledForTaskTypes config/hooks/post-task-reflection.js
```

### Context Injection Failed
```bash
# Verify bullets exist
sqlite3 ./swarm-memory.db "SELECT COUNT(*) FROM adaptive_context WHERE is_active = 1;"

# Test query
/context-query --category=strategy --output=json

# Check ACL permissions
sqlite3 ./swarm-memory.db "SELECT bullet_id, acl_level FROM adaptive_context WHERE bullet_id = 'STRAT-001';"
```

### Low Confidence Trend
```bash
# Identify low-confidence bullets
/context-query --max-confidence=0.6

# Review recent harmful increments
sqlite3 ./swarm-memory.db "SELECT bullet_id, harmful_count, confidence_score FROM adaptive_context WHERE harmful_count >= 2 ORDER BY harmful_count DESC;"

# Archive if needed
/context-curate --maintenance
```

---

## 📚 File Locations

| File | Purpose |
|------|---------|
| `src/sqlite/adaptive-context-schema.sql` | SQLite schema definition |
| `.claude/commands/context-*.md` | Slash command documentation |
| `config/hooks/post-task-reflection.js` | Auto-reflection hook |
| `config/hooks/pre-agent-spawn-context.js` | Auto-injection hook |
| `config/hooks/post-cfn-loop-reflection.js` | CFN Loop reflection hook |
| `.claude/agents/context-reflector.md` | Reflector agent definition |
| `.claude/agents/context-curator.md` | Curator agent definition |
| `planning/context-management/ACE-IMPLEMENTATION-GUIDE.md` | Full implementation guide |

---

## 🎯 CFN Loop Integration

### Loop 3: Implementation
**Before agents spawn:**
- `pre-agent-spawn-context.js` injects relevant bullets

**After agents complete:**
- `post-task-reflection.js` extracts lessons from each agent

**Telemetry:**
```
## Loop 3 Complete - Phase 0 (Standard)

**Adaptive Context:**
- 🔍 Reflected: 12 lessons extracted
- 📚 Curated: 5 new bullets, 7 reinforced
- 💡 Top bullets: STRAT-042, PATTERN-017, EDGE-044
```

### Loop 2: Validation
**Validators use injected bullets:**
- Edge cases and patterns help identify issues

**After validation:**
- `post-cfn-loop-reflection.js` reflects on validation insights

### Loop 4: Product Owner
**PO reviews bullet recommendations:**
```bash
/context-stats --period=7
/context-query --pending --min-helpful=5
```

**After PO decision:**
- Reflection on decision reasoning

---

## 💡 Pro Tips

1. **Start Small:** Seed 5-10 high-priority bullets manually
2. **Weekly Curation:** Run `/context-curate --maintenance` to prevent bloat
3. **Monitor Metrics:** Track helpful/harmful ratio, confidence trends
4. **Validate High-Usage:** Review bullets with usage_count ≥ 10
5. **Phase-Aware:** Use `--phase` flag for context-specific injection
6. **Confidence Thresholds:** Trust ≥0.8, validate <0.6
7. **ACL Strategy:** Project-level (4) for most bullets, System-level (5) for universal patterns

---

## 📞 Quick Help

```bash
# Show command help
/context-reflect --help
/context-curate --help
/context-query --help
/context-inject --help
/context-stats --help

# View agent definitions
cat .claude/agents/context-reflector.md
cat .claude/agents/context-curator.md

# Check SQLite schema
sqlite3 ./swarm-memory.db ".schema adaptive_context"

# Full implementation guide
cat planning/context-management/ACE-IMPLEMENTATION-GUIDE.md
```

---

## 🎉 Expected Benefits

Based on Stanford ACE paper:
- ✅ **+10.6%** average performance improvement
- ✅ **+8.6%** domain-specific task accuracy
- ✅ **-86.9%** adaptation latency (vs. full rewrites)
- ✅ **50-150** manageable active bullets
- ✅ **No context collapse** (incremental updates)
- ✅ **Preserved knowledge** across iterations

---

## 📖 Further Reading

- **Full Guide:** `planning/context-management/ACE-IMPLEMENTATION-GUIDE.md`
- **Research Summary:** `planning/context-management/stanford-research-summary.md`
- **Schema:** `src/sqlite/adaptive-context-schema.sql`
- **Reflector Agent:** `.claude/agents/context-reflector.md`
- **Curator Agent:** `.claude/agents/context-curator.md`

---

*Last Updated: 2025-10-13*
*Version: 1.0*
