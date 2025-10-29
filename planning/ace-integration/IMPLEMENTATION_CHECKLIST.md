# ACE Integration - Implementation Checklist

## Phase 1: Core Integration (Week 1)

### 1.1 Loop 5 - Post-Sprint Reflection Hook
- [ ] Update `orchestrate.sh` to detect PROCEED decision
- [ ] Add background reflection invocation after PROCEED
- [ ] Pass task_id, swarm_id, agent list to reflection skill
- [ ] Ensure non-blocking (use `&` for background)
- [ ] Add error handling (reflection failure doesn't block commit)
- [ ] Test: Verify reflection runs after successful sprint

**File:** `.claude/skills/cfn-loop-orchestration/orchestrate.sh`

**Code Change:**
```bash
if [[ "$DECISION" == "PROCEED" ]]; then
  # Launch reflection in background
  (
    ./.claude/skills/cfn-ace-system/invoke-context-reflect.sh \
      --task-id "$TASK_ID" \
      --swarm-id "$SWARM_ID" \
      --agents "$LOOP3_AGENTS,$LOOP2_AGENTS" \
      --iterations "$ITERATION" \
      --final-confidence "$CONSENSUS" \
      --auto-curate \
      --output "/tmp/reflection-${TASK_ID}.json" 2>&1 | \
      tee -a ".artifacts/logs/ace-reflection-${TASK_ID}.log"
  ) &

  echo "✅ Reflection launched in background (PID: $!)"

  # Continue with git commit (don't wait)
  git add .
  git commit -m "..."
fi
```

### 1.2 Loop 0 - Context Lookup Helper
- [ ] Create `helpers/context-lookup.sh` script
- [ ] Extract keywords from task description (simple regex)
- [ ] Call `invoke-context-query.sh` with extracted metadata
- [ ] Format results as JSON
- [ ] Store in Redis with key: `cfn_loop:{TASK_ID}:historical_context`
- [ ] Add TTL: 1 hour
- [ ] Test: Query returns relevant past contexts

**File:** `.claude/skills/cfn-loop-orchestration/helpers/context-lookup.sh`

**Signature:**
```bash
context-lookup.sh \
  --task-id "$TASK_ID" \
  --task-description "$TASK_DESC" \
  --domain "$DOMAIN" \
  --agent-types "$LOOP3_AGENTS" \
  --similarity-threshold 0.70 \
  --max-results 5 \
  --output-key "cfn_loop:${TASK_ID}:historical_context"
```

### 1.3 Loop 3 - Context Injection Helper
- [ ] Create `helpers/context-injection.sh` script
- [ ] Retrieve historical context from Redis
- [ ] Filter lessons by agent type (backend gets backend lessons)
- [ ] Format as markdown (strategies, anti-patterns, edge cases)
- [ ] Merge with original task context
- [ ] Return enriched context JSON
- [ ] Test: Agent receives historical context in spawn

**File:** `.claude/skills/cfn-loop-orchestration/helpers/context-injection.sh`

**Signature:**
```bash
context-injection.sh \
  --task-id "$TASK_ID" \
  --agent-type "$AGENT_TYPE" \
  --task-context "$ORIGINAL_CONTEXT" \
  --max-lessons 3 \
  --output "/tmp/injected-context-${AGENT_ID}.json"
```

### 1.4 Update Agent Spawning
- [ ] Update `helpers/spawn-agents.sh` (Loop 3)
- [ ] Call context-injection.sh before each spawn
- [ ] Pass enriched context to `npx claude-flow-novice agent-spawn`
- [ ] Log injected context for debugging
- [ ] Test: Agents spawned with historical context

**File:** `.claude/skills/cfn-loop-orchestration/helpers/spawn-agents.sh`

**Code Change:**
```bash
for AGENT_TYPE in $LOOP3_AGENTS; do
  AGENT_ID="${AGENT_TYPE}-$(uuidgen)"

  # Inject historical context
  ENRICHED_CONTEXT=$(./.claude/skills/cfn-loop-orchestration/helpers/context-injection.sh \
    --task-id "$TASK_ID" \
    --agent-type "$AGENT_TYPE" \
    --task-context "$TASK_CONTEXT" \
    --max-lessons 3)

  # Spawn with enriched context
  npx claude-flow-novice agent-spawn "$AGENT_TYPE" \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --context "$ENRICHED_CONTEXT" &

  PIDS+=($!)
done
```

### 1.5 Integration Test
- [ ] Create test: `tests/ace-integration/01-basic-flow.test.sh`
- [ ] Test scenario: Simple auth implementation task
- [ ] Steps:
  1. Run Sprint N: Auth implementation (manual, no ACE)
  2. Verify reflection stored in SQLite
  3. Run Sprint N+1: Similar auth task
  4. Verify context lookup returns Sprint N lessons
  5. Verify agents receive historical context
  6. Verify Sprint N+1 completes faster (fewer iterations)
- [ ] Assertions:
  - Reflection exists in `context_reflections` table
  - Query returns similarity score > 0.70
  - Agent context includes "Historical Context" section
  - Sprint N+1 iterations ≤ Sprint N iterations

**File:** `tests/ace-integration/01-basic-flow.test.sh`

---

## Phase 2: Metadata Enhancement (Week 2)

### 2.1 Automatic Tag Extraction
- [ ] Create `extract-tags.sh` in cfn-ace-system skill
- [ ] Parse task description for keywords
- [ ] Extract file paths created (git status)
- [ ] Infer domain from file extensions (.ts → backend, .tsx → frontend)
- [ ] Generate tag list
- [ ] Test: Tags match expected domain/keywords

**Algorithm:**
```javascript
// Keyword extraction
const keywords = taskDescription.match(/\b(authentication|JWT|OAuth|API|database|frontend|backend|security|performance)\b/gi)

// Domain inference
const domains = []
if (files.includes('.tsx') || files.includes('.jsx')) domains.push('frontend')
if (files.includes('.ts') && !files.includes('.tsx')) domains.push('backend')
if (files.includes('test')) domains.push('testing')
if (keywords.includes('security')) domains.push('security')

return { keywords, domains, files, agentTypes }
```

### 2.2 Relevance Scoring Algorithm
- [ ] Create `score-relevance.sh` in cfn-ace-system skill
- [ ] Implement multi-factor scoring:
  - 30% keyword similarity (TF-IDF or Jaccard)
  - 25% agent type overlap
  - 20% domain match
  - 15% recency score (time decay)
  - 10% success rate (success_count / total_count)
- [ ] Test: Score calculation matches expected values

**File:** `.claude/skills/cfn-ace-system/score-relevance.sh`

### 2.3 SQLite Indexes
- [ ] Add indexes to `context_reflections` table
- [ ] Indexes on: tags, domain, confidence, created_at
- [ ] Test: Query performance < 100ms for 1000 reflections

**SQL:**
```sql
CREATE INDEX IF NOT EXISTS idx_tags ON context_reflections((json_extract(metadata, '$.tags')));
CREATE INDEX IF NOT EXISTS idx_domain ON context_reflections((json_extract(metadata, '$.domain')));
CREATE INDEX IF NOT EXISTS idx_confidence ON context_reflections(confidence);
CREATE INDEX IF NOT EXISTS idx_created_at ON context_reflections(created_at);
```

### 2.4 Domain Classifier Integration
- [ ] Update task-classifier skill to output domain
- [ ] Use domain in context queries
- [ ] Test: Frontend tasks don't get backend lessons

---

## Phase 3: Anti-Patterns & Edge Cases (Week 3)

### 3.1 Anti-Pattern Extraction
- [ ] Update reflection skill to detect low-confidence outcomes
- [ ] Extract from ITERATE feedback (parse structured JSON)
- [ ] Format as anti-pattern lessons
- [ ] Tag with severity (critical, warning, suggestion)
- [ ] Test: Failed sprints generate anti-pattern lessons

**Detection Logic:**
```bash
if (( $(echo "$CONFIDENCE < 0.50" | bc -l) )); then
  LESSON_TYPE="anti-pattern"
  SEVERITY="critical"
elif (( $(echo "$CONFIDENCE < 0.70" | bc -l) )); then
  LESSON_TYPE="warning"
  SEVERITY="medium"
fi
```

### 3.2 Negative Context Formatter
- [ ] Create formatter for anti-patterns in injection
- [ ] Use warning symbols (⚠️, 🚫)
- [ ] Include sprint reference ("Failed in: sprint-X")
- [ ] Test: Anti-patterns appear in injected context

**Format:**
```markdown
### ⚠️ Anti-Patterns to Avoid

1. **Long-lived access tokens** (confidence: 0.87, failed in 3 sprints)
   - Issue: Security risk, no way to revoke
   - Sprint: session-management-001 (ITERATE x2)
   - Solution: Use 15-min access tokens + refresh token rotation
   - Tags: security, JWT, session
```

### 3.3 Edge Case Extraction
- [ ] Detect edge cases from iteration feedback
- [ ] Look for keywords: "race condition", "edge case", "unexpected", "corner case"
- [ ] Store with solution (if found)
- [ ] Test: Edge cases appear in context injection

---

## Phase 4: Pattern Detection (Week 4)

### 4.1 Pattern Analyzer Script
- [ ] Create `analyze-patterns.sh` in cfn-ace-system skill
- [ ] Query: Last 30 days of reflections
- [ ] Group by: tags, failure reasons, domain
- [ ] Detect recurring issues (≥3 occurrences)
- [ ] Generate report: `docs/SYSTEMIC_IMPROVEMENTS.md`
- [ ] Test: Detects recurring security headers issue

**File:** `.claude/skills/cfn-ace-system/analyze-patterns.sh`

**Detection:**
```bash
# Find failures with same root cause
sqlite3 swarm-memory.db "
  SELECT
    json_extract(metadata, '$.failure_reason') as reason,
    COUNT(*) as occurrences,
    json_group_array(task_id) as affected_sprints
  FROM context_reflections
  WHERE
    reflection_type = 'failure' AND
    created_at > strftime('%s', 'now', '-30 days')
  GROUP BY reason
  HAVING occurrences >= 3
  ORDER BY occurrences DESC
"
```

### 4.2 Weekly Cron Job
- [ ] Add to system crontab
- [ ] Run every Monday at 9 AM
- [ ] Email report to product owner
- [ ] Test: Cron job executes successfully

**Cron:**
```cron
0 9 * * 1 cd /project && ./.claude/skills/cfn-ace-system/analyze-patterns.sh --window 30days --email product-owner@company.com
```

### 4.3 Improvement Recommendations
- [ ] Parse pattern analysis results
- [ ] Generate specific recommendations:
  - Create new skill
  - Update agent default context
  - Add to reviewer checklist
  - Architectural change needed
- [ ] Test: Recommendations are actionable

---

## Phase 5: Optimization & Monitoring (Week 5)

### 5.1 Redis Caching
- [ ] Cache hot contexts in Redis (1 hour TTL)
- [ ] Key: `ace:context:{query_hash}`
- [ ] Invalidate on new reflection curated
- [ ] Test: Cache hit rate > 60%

**Implementation:**
```bash
QUERY_HASH=$(echo "$KEYWORDS:$DOMAIN" | md5sum | cut -d' ' -f1)
CACHED=$(redis-cli get "ace:context:${QUERY_HASH}")

if [[ -n "$CACHED" ]]; then
  echo "$CACHED"
  exit 0
fi

# Query SQLite if cache miss
RESULTS=$(query-sqlite...)
redis-cli setex "ace:context:${QUERY_HASH}" 3600 "$RESULTS"
echo "$RESULTS"
```

### 5.2 Telemetry Hooks
- [ ] Add timing metrics to all ACE operations
- [ ] Log: query time, reflection time, injection time
- [ ] Store in SQLite: `ace_telemetry` table
- [ ] Test: Telemetry captured correctly

**Schema:**
```sql
CREATE TABLE ace_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT,  -- reflect, query, inject, curate
  duration_ms INTEGER,
  task_id TEXT,
  timestamp INTEGER
);
```

### 5.3 ACE Dashboard Command
- [ ] Create `/cfn:ace-dashboard` command
- [ ] Display:
  - Total reflections stored
  - Cache hit rate
  - Average query time
  - Top 10 most reused lessons
  - Pattern analysis summary
- [ ] Test: Dashboard renders correctly

**Output:**
```
ACE System Dashboard
═══════════════════════════════════════════════

📊 Statistics (Last 30 Days)
─────────────────────────────────────────────
Total Reflections:        47
Active Curated Lessons:   23
Cache Hit Rate:           68%
Average Query Time:       82ms

🔥 Most Reused Lessons
─────────────────────────────────────────────
1. JWT + Redis Pattern        (used 12 times)
2. Security Headers Setup     (used 10 times)
3. Error Boundary Pattern     (used 8 times)

⚠️  Recurring Issues (Pattern Detection)
─────────────────────────────────────────────
1. Missing security headers   (5 occurrences)
2. No error boundaries        (4 occurrences)
3. Long API timeouts          (3 occurrences)

💡 Recommendations: See docs/SYSTEMIC_IMPROVEMENTS.md
```

### 5.4 Performance Tuning
- [ ] Optimize SQLite queries (EXPLAIN QUERY PLAN)
- [ ] Benchmark with 1000+ reflections
- [ ] Tune relevance scoring weights
- [ ] Test: Query performance < 100ms at scale

---

## Configuration Files

### ace-integration.json
```json
{
  "ace_integration": {
    "enabled": true,
    "reflection": {
      "trigger": "proceed_decision",
      "mode": "background",
      "auto_curate": true,
      "min_confidence": 0.70,
      "scrub_secrets": true
    },
    "context_lookup": {
      "enabled": true,
      "similarity_threshold": 0.70,
      "max_results": 5,
      "recency_weight": 0.15,
      "cache_ttl": 3600
    },
    "context_injection": {
      "enabled": true,
      "max_lessons_per_category": 3,
      "include_anti_patterns": true,
      "include_edge_cases": true,
      "max_context_size": 2000
    },
    "storage": {
      "ttl_days": 90,
      "max_reflections": 1000,
      "compression": true,
      "cleanup_cron": "0 2 * * 0"
    },
    "pattern_detection": {
      "enabled": true,
      "window_days": 30,
      "min_occurrences": 3,
      "cron": "0 9 * * 1",
      "notify_email": "product-owner@company.com"
    }
  }
}
```

**Location:** `.claude/config/ace-integration.json`

---

## Testing Checklist

### Unit Tests
- [ ] Tag extraction accuracy (≥90%)
- [ ] Relevance scoring calculation
- [ ] Confidence decay formula
- [ ] Query performance (< 100ms)
- [ ] Context injection formatting

### Integration Tests
- [ ] End-to-end Loop 0 → Loop 5 with ACE
- [ ] Context lookup returns relevant results
- [ ] Agents receive injected context
- [ ] Reflection stored correctly in SQLite
- [ ] Background processing doesn't block commit

### Performance Tests
- [ ] Query speed with 1000+ reflections
- [ ] Cache hit rate measurement
- [ ] Injection overhead (< 200ms)
- [ ] Pattern detection on large dataset

### User Acceptance Tests
- [ ] Product Owner reviews reflection quality
- [ ] Agents confirm context usefulness
- [ ] No context pollution (too much noise)
- [ ] Anti-patterns prevent repeated mistakes
- [ ] Pattern detection identifies real issues

---

## Documentation Updates

### Files to Update
- [ ] `readme/logs-features.md` - Add ACE System Integration section
- [ ] `readme/logs-slash-commands.md` - Document `/cfn:context-*` commands
- [ ] `CLAUDE.md` - Add Loop 5 to CFN Loop workflow
- [ ] `.claude/skills/cfn-loop-orchestration/SKILL.md` - Document Loop 5 hook
- [ ] `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md` - ACE usage
- [ ] `README.md` - Add ACE system to feature list

### New Documentation
- [ ] `docs/ACE_SYSTEM_GUIDE.md` - User guide for ACE commands
- [ ] `docs/ACE_PERFORMANCE.md` - Performance metrics and tuning
- [ ] `docs/SYSTEMIC_IMPROVEMENTS.md` - Pattern analysis report (generated)

---

## Rollout Plan

### Week 1: Phase 1 (Core Integration)
- [ ] Implement Loop 5 reflection hook
- [ ] Implement Loop 0 context lookup
- [ ] Implement Loop 3 context injection
- [ ] Integration test passing
- [ ] Deploy to staging environment

### Week 2: Phase 2 (Metadata)
- [ ] Tag extraction working
- [ ] Relevance scoring implemented
- [ ] SQLite indexes created
- [ ] Domain classifier integrated
- [ ] Test with 50+ reflections

### Week 3: Phase 3 (Anti-Patterns)
- [ ] Anti-pattern extraction working
- [ ] Negative context formatting done
- [ ] Edge case detection implemented
- [ ] Test with failed sprints

### Week 4: Phase 4 (Pattern Detection)
- [ ] Pattern analyzer script complete
- [ ] Weekly cron job configured
- [ ] Systemic improvements report generated
- [ ] Product Owner reviews first report

### Week 5: Phase 5 (Optimization)
- [ ] Redis caching enabled
- [ ] Telemetry hooks added
- [ ] ACE dashboard command working
- [ ] Performance tuning complete
- [ ] Deploy to production

---

## Success Criteria

**Phase 1 Complete:**
- [ ] Post-sprint reflection runs automatically
- [ ] Context lookup finds similar sprints
- [ ] Agents receive historical context in spawns
- [ ] Integration test passes

**Phase 5 Complete:**
- [ ] Context reuse rate ≥ 70%
- [ ] First-iteration success rate +20%
- [ ] Query performance < 100ms
- [ ] Pattern detection identifies 3+ systemic issues
- [ ] Product Owner approves for production

---

## Rollback Plan

**If ACE integration causes issues:**
1. Set `ace_integration.enabled: false` in config
2. System falls back to current workflow (no ACE)
3. Debug issues in staging environment
4. Re-enable after fixes validated

**Rollback Steps:**
```bash
# Disable ACE
jq '.ace_integration.enabled = false' .claude/config/ace-integration.json > tmp && mv tmp .claude/config/ace-integration.json

# Verify fallback works
./tests/cfn-v3-orchestration/run-full-suite.sh

# Re-enable after fix
jq '.ace_integration.enabled = true' .claude/config/ace-integration.json > tmp && mv tmp .claude/config/ace-integration.json
```

---

**Status:** READY FOR IMPLEMENTATION
**Next Action:** Begin Phase 1 implementation
**Owner:** System Architecture Team
