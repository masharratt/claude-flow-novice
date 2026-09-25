# Epic: ACE System Integration - Self-Improving CFN Loops

**Epic ID:** EPIC-ACE-001
**Version:** 1.0.0
**Status:** READY_FOR_PLANNING
**Priority:** P1 (High Impact)
**Estimated Duration:** 5 weeks
**Owner:** System Architecture Team

## Executive Summary

Integrate ACE (Adaptive Context Extension) system into CFN Loop workflow to enable automatic learning from sprint execution, context reuse across sprints, and continuous system improvement. This transforms CFN Loops from stateless execution into a self-improving system that learns from every sprint.

**Business Value:**
- **20% faster iterations** - Reuse proven patterns
- **Fewer repeated mistakes** - Anti-pattern warnings
- **Institutional knowledge** - System learns over time
- **Proactive improvements** - Pattern detection identifies systemic issues

**Technical Value:**
- Automatic reflection extraction (no manual CLAUDE.md updates)
- Context lookup with relevance scoring
- Historical context injection for agents
- Cross-sprint pattern detection

## Epic Scope

### In Scope
✅ Loop 5 post-sprint reflection (automatic)
✅ Loop 0 context lookup (similar past sprints)
✅ Loop 3 context injection (historical lessons)
✅ Anti-pattern extraction from failures
✅ Edge case detection and storage
✅ Pattern detection (recurring issues)
✅ SQLite storage with metadata
✅ Redis caching for hot contexts
✅ ACE dashboard command
✅ CLI and Task mode support

### Out of Scope
❌ Migration of existing CLAUDE.md lessons (future epic)
❌ Web portal UI for ACE system (future epic)
❌ Cross-project context sharing (future epic)
❌ Machine learning for pattern detection (current: rule-based)
❌ Real-time context injection during agent execution (current: spawn-time only)

## Success Criteria

### Quantitative
- [ ] Context reuse rate ≥ 70% (sprints using historical context)
- [ ] First-iteration success rate +20% improvement
- [ ] Query performance < 100ms (with 1000+ reflections)
- [ ] Reflection coverage ≥ 95% (sprints with post-reflection)
- [ ] Cache hit rate ≥ 60% (Redis caching effectiveness)
- [ ] Pattern detection finds ≥ 3 systemic issues in first month

### Qualitative
- [ ] Product Owner approves reflection quality
- [ ] Agents confirm context usefulness (survey)
- [ ] No context pollution (too much noise in injections)
- [ ] Anti-patterns prevent repeated mistakes
- [ ] Pattern reports lead to concrete improvements

## Architecture Overview

```
Current CFN Loop:
Loop 0 → Loop 3 → Loop 2 → Loop 4 → Git Commit

Enhanced CFN Loop with ACE:
Loop 0 (+ Context Lookup) → Loop 3 (+ Context Injection) → Loop 2 → Loop 4 → Loop 5 (Reflection) → Git Commit
                ↑_______________________________________________________________|
                                    (Learning Feedback Loop)
```

**Key Components:**
1. **Reflector** - Extracts lessons from completed sprints
2. **Curator** - Merges and deduplicates lessons
3. **Query Engine** - Finds similar past contexts
4. **Injector** - Enriches agent context with history
5. **Pattern Analyzer** - Detects recurring issues

## Dependencies

### Prerequisites
- ✅ ACE system skill (v1.0.0 operational)
- ✅ CFN Loop orchestrator modular architecture
- ✅ SQLite memory adapter
- ✅ Redis coordination

### External Dependencies
- None (all dependencies met)

## Phases

---

## Phase 1: Core Integration (Week 1)

**Goal:** Basic reflection, lookup, injection working in CFN Loop

**Story:** As a developer, I want CFN Loops to automatically learn from past sprints so I don't repeat mistakes.

### Phase 1 Deliverables

#### 1.1 Loop 5 Reflection Hook
**File:** `.claude/skills/cfn-loop-orchestration/orchestrate.sh`

**Task:** Add post-PROCEED reflection invocation
- Detect PROCEED decision from Product Owner
- Launch reflection in background (non-blocking)
- Pass task_id, swarm_id, agent list, confidence scores
- Log to `.artifacts/logs/ace-reflection-{TASK_ID}.log`
- Error handling: reflection failure doesn't block commit

**Acceptance Criteria:**
- [ ] Reflection launches after PROCEED decision
- [ ] Background process doesn't block git commit
- [ ] Reflection completes within 30 seconds
- [ ] Errors logged but don't crash orchestrator

**Test:** `tests/ace-integration/01-loop5-reflection.test.sh`

#### 1.2 Context Lookup Helper
**File:** `.claude/skills/cfn-loop-orchestration/helpers/context-lookup.sh`

**Task:** Query similar past sprints before Loop 3
- Extract keywords from task description (regex)
- Classify domain (frontend, backend, security, devops)
- Call `invoke-context-query.sh` with metadata
- Store results in Redis: `cfn_loop:{TASK_ID}:historical_context`
- TTL: 1 hour

**Acceptance Criteria:**
- [ ] Extracts ≥3 keywords from task description
- [ ] Domain classifier 80% accuracy
- [ ] Query returns top 5 similar contexts
- [ ] Similarity threshold: 0.70
- [ ] Redis storage successful

**Test:** `tests/ace-integration/02-context-lookup.test.sh`

#### 1.3 Context Injection Helper
**File:** `.claude/skills/cfn-loop-orchestration/helpers/context-injection.sh`

**Task:** Inject historical context into agent spawns
- Retrieve historical context from Redis
- Filter lessons by agent type
- Format as markdown (strategies, anti-patterns, edge cases)
- Merge with original task context
- Limit: 3 lessons per category

**Acceptance Criteria:**
- [ ] Agent-specific filtering works (backend gets backend lessons)
- [ ] Markdown formatting clear and readable
- [ ] Max 3 strategies, 3 anti-patterns, 3 edge cases
- [ ] Total injected context < 2000 chars
- [ ] Enriched context JSON valid

**Test:** `tests/ace-integration/03-context-injection.test.sh`

#### 1.4 Update Agent Spawning
**File:** `.claude/skills/cfn-loop-orchestration/helpers/spawn-agents.sh`

**Task:** Call context-injection before each agent spawn
- Loop through Loop 3 agents
- Call context-injection.sh for each
- Pass enriched context to agent-spawn CLI
- Log injected context for debugging

**Acceptance Criteria:**
- [ ] All Loop 3 agents receive enriched context
- [ ] Agent spawning doesn't fail if injection fails (graceful fallback)
- [ ] Injection overhead < 200ms per agent
- [ ] Logs show injected context summary

**Test:** `tests/ace-integration/04-agent-spawning.test.sh`

#### 1.5 End-to-End Integration Test
**File:** `tests/ace-integration/05-e2e-basic-flow.test.sh`

**Test Scenario:**
1. **Sprint N (Manual):** Implement JWT authentication
   - No ACE context (first time)
   - Record: 3 iterations, confidence 0.85
   - Verify: Reflection stored in SQLite

2. **Sprint N+1 (ACE-enabled):** Implement OAuth integration
   - Context lookup finds JWT sprint (similar domain)
   - Agents receive historical context
   - Record: iterations, confidence
   - Assert: Sprint N+1 iterations ≤ Sprint N iterations

**Acceptance Criteria:**
- [ ] Sprint N reflection exists in `context_reflections` table
- [ ] Sprint N+1 query returns Sprint N with similarity > 0.70
- [ ] Sprint N+1 agents receive "Historical Context" section
- [ ] Sprint N+1 completes in ≤ Sprint N iterations (faster learning)

### Phase 1 Success Metrics
- [ ] All 5 tests passing
- [ ] Integration test shows learning (fewer iterations)
- [ ] No performance regression (orchestrator time +5% max)
- [ ] Reflection coverage: 100% of PROCEED decisions

### Phase 1 Duration: 5 days

---

## Phase 2: Metadata Enhancement (Week 2)

**Goal:** Automatic tagging, relevance scoring, fast queries

**Story:** As a system, I want to automatically extract metadata so context queries are accurate and fast.

### Phase 2 Deliverables

#### 2.1 Automatic Tag Extraction
**File:** `.claude/skills/cfn-ace-system/extract-tags.sh`

**Task:** Extract tags from sprint execution
- Parse task description for keywords (TF-IDF or simple regex)
- Extract file paths from git status
- Infer domain from file extensions (.tsx → frontend, .ts → backend)
- Include agent types used
- Generate comprehensive tag list

**Algorithm:**
```javascript
keywords = extract_keywords(taskDescription)  // TF-IDF top 10
domains = infer_domains(files, keywords)      // frontend, backend, security, devops
agentTags = agentTypes.map(t => t.toLowerCase())
tags = [...keywords, ...domains, ...agentTags].unique()
```

**Acceptance Criteria:**
- [ ] Extracts 5-15 tags per sprint
- [ ] Domain classification 90% accuracy
- [ ] Tags include: keywords, domain, agents, file paths
- [ ] Deduplication works correctly

**Test:** `tests/ace-integration/06-tag-extraction.test.sh`

#### 2.2 Relevance Scoring Algorithm
**File:** `.claude/skills/cfn-ace-system/score-relevance.sh`

**Task:** Multi-factor similarity scoring
- 30% keyword similarity (Jaccard index)
- 25% agent type overlap (% same agents)
- 20% domain match (exact match or overlap)
- 15% recency score (time decay)
- 10% success rate (historical effectiveness)

**Formula:**
```javascript
relevance_score =
  0.30 * jaccard(query_keywords, context_keywords) +
  0.25 * (matching_agents / total_agents) +
  0.20 * domain_match_score +
  0.15 * recency_factor +
  0.10 * (success_count / total_count)
```

**Acceptance Criteria:**
- [ ] Score range: 0.0 - 1.0
- [ ] Recent contexts score higher than old (same keywords)
- [ ] High success rate boosts score
- [ ] Domain mismatch reduces score significantly

**Test:** `tests/ace-integration/07-relevance-scoring.test.sh`

#### 2.3 SQLite Indexes
**File:** `.claude/skills/cfn-ace-system/init-indexes.sql`

**Task:** Optimize query performance
- Index on `json_extract(metadata, '$.tags')`
- Index on `json_extract(metadata, '$.domain')`
- Index on `confidence`
- Index on `created_at`

**Acceptance Criteria:**
- [ ] Query time < 100ms with 1000+ reflections
- [ ] EXPLAIN QUERY PLAN shows index usage
- [ ] No full table scans for common queries

**Test:** `tests/ace-integration/08-query-performance.test.sh`

#### 2.4 Domain Classifier Integration
**File:** `.claude/skills/cfn-task-classifier/classify-task.sh` (update)

**Task:** Add domain output to task classifier
- Use existing logic to classify domain
- Output in JSON: `{"domain": ["backend", "security"], "complexity": "high"}`
- Pass domain to context query

**Acceptance Criteria:**
- [ ] Task classifier outputs domain field
- [ ] Domain used in context lookup
- [ ] Frontend tasks get frontend contexts
- [ ] Cross-domain tasks get blended results

**Test:** `tests/ace-integration/09-domain-classifier.test.sh`

### Phase 2 Success Metrics
- [ ] Tag extraction accuracy ≥ 90% (manual review of 20 sprints)
- [ ] Relevance scoring correlates with manual ranking (Spearman's ρ > 0.8)
- [ ] Query performance < 100ms at scale (1000 reflections)
- [ ] Cache miss queries still fast (< 150ms)

### Phase 2 Duration: 5 days

---

## Phase 3: Anti-Patterns & Edge Cases (Week 3)

**Goal:** Learn from failures, capture edge cases

**Story:** As an agent, I want to know what NOT to do so I avoid past mistakes.

### Phase 3 Deliverables

#### 3.1 Anti-Pattern Detection
**File:** `.claude/skills/cfn-ace-system/invoke-context-reflect.sh` (update)

**Task:** Extract anti-patterns from low-confidence outcomes
- Detect confidence < 0.50 (critical anti-pattern)
- Detect confidence < 0.70 (warning)
- Parse ITERATE feedback for failure reasons
- Tag with severity: critical, warning, suggestion

**Detection Logic:**
```bash
if (( $(echo "$CONFIDENCE < 0.50" | bc -l) )); then
  LESSON_TYPE="anti-pattern"
  SEVERITY="critical"
  CONTENT="Avoid: $FAILURE_REASON (caused $ITERATIONS iterations)"
elif (( $(echo "$CONFIDENCE < 0.70" | bc -l) )); then
  LESSON_TYPE="warning"
  SEVERITY="medium"
fi
```

**Acceptance Criteria:**
- [ ] Low-confidence sprints generate anti-patterns
- [ ] ITERATE feedback parsed correctly
- [ ] Severity assigned based on confidence
- [ ] Anti-patterns include sprint reference

**Test:** `tests/ace-integration/10-anti-pattern-extraction.test.sh`

#### 3.2 Negative Context Formatter
**File:** `.claude/skills/cfn-loop-orchestration/helpers/context-injection.sh` (update)

**Task:** Format anti-patterns for agent context
- Use warning symbols (⚠️, 🚫)
- Include failure severity
- Reference failed sprint ID
- Provide solution if available

**Format:**
```markdown
### ⚠️ Anti-Patterns to Avoid

1. **Long-lived access tokens** (CRITICAL, failed in 3 sprints)
   - Issue: Security risk, tokens cannot be revoked
   - Sprint: session-management-001 (ITERATE x2, final confidence: 0.45)
   - Solution: Use 15-min access tokens + refresh token rotation
   - Tags: security, JWT, session

2. **Missing error boundaries** (WARNING, failed in 2 sprints)
   - Issue: Unhandled errors crash entire app
   - Sprint: dashboard-ui-002 (ITERATE x1, final confidence: 0.65)
   - Solution: Wrap components in React ErrorBoundary
   - Tags: frontend, React, error-handling
```

**Acceptance Criteria:**
- [ ] Anti-patterns visually distinct from strategies
- [ ] Severity clearly indicated
- [ ] Sprint references linkable
- [ ] Solutions included when available

**Test:** `tests/ace-integration/11-negative-context-format.test.sh`

#### 3.3 Edge Case Extraction
**File:** `.claude/skills/cfn-ace-system/invoke-context-reflect.sh` (update)

**Task:** Detect edge cases from iteration feedback
- Look for keywords: "race condition", "edge case", "unexpected", "corner case"
- Extract from Loop 2 validator feedback
- Store with solution (if iteration succeeded)
- Tag with discovered_in_sprint

**Extraction Pattern:**
```javascript
edgeCasePatterns = [
  /race condition/i,
  /edge case/i,
  /corner case/i,
  /unexpected behavior/i,
  /concurrency issue/i
]

feedback.split('\n').forEach(line => {
  if (edgeCasePatterns.some(p => p.test(line))) {
    extractEdgeCase(line, iteration)
  }
})
```

**Acceptance Criteria:**
- [ ] Edge cases detected from feedback
- [ ] Solutions captured if iteration succeeded
- [ ] Edge cases appear in context injection
- [ ] Deduplication prevents repeated edge cases

**Test:** `tests/ace-integration/12-edge-case-extraction.test.sh`

### Phase 3 Success Metrics
- [ ] Anti-pattern extraction rate: 80% of failed sprints
- [ ] Edge case detection: ≥1 per 5 sprints
- [ ] Agents report anti-pattern warnings prevented mistakes (survey)
- [ ] Repeated failures decrease by 30% month-over-month

### Phase 3 Duration: 5 days

---

## Phase 4: Pattern Detection (Week 4)

**Goal:** Cross-sprint analysis, systemic improvements

**Story:** As a Product Owner, I want to identify recurring issues so we can fix root causes.

### Phase 4 Deliverables

#### 4.1 Pattern Analyzer Script
**File:** `.claude/skills/cfn-ace-system/analyze-patterns.sh`

**Task:** Weekly analysis of recurring issues
- Query: Last 30 days of reflections
- Group by: failure_reason, tags, domain
- Detect: ≥3 occurrences of same issue
- Generate: Improvement recommendations

**Query:**
```sql
SELECT
  json_extract(metadata, '$.failure_reason') as reason,
  json_extract(metadata, '$.domain') as domain,
  COUNT(*) as occurrences,
  json_group_array(task_id) as affected_sprints,
  AVG(iterations) as avg_iterations
FROM context_reflections
WHERE
  reflection_type IN ('failure', 'warning') AND
  created_at > strftime('%s', 'now', '-30 days')
GROUP BY reason, domain
HAVING occurrences >= 3
ORDER BY occurrences DESC, avg_iterations DESC
```

**Acceptance Criteria:**
- [ ] Detects recurring issues (≥3 occurrences)
- [ ] Groups by domain (frontend issues separate from backend)
- [ ] Calculates impact (iterations caused, sprints affected)
- [ ] Generates concrete recommendations

**Test:** `tests/ace-integration/13-pattern-detection.test.sh`

#### 4.2 Systemic Improvements Report
**File:** `docs/SYSTEMIC_IMPROVEMENTS.md` (generated)

**Task:** Generate actionable report
- List recurring issues with occurrences
- Calculate impact (total iterations wasted)
- Provide recommendations:
  - Create new skill
  - Update agent default context
  - Add to reviewer checklist
  - Architectural change needed

**Report Format:**
```markdown
# Systemic Improvements Report
Generated: 2025-10-29

## 🚨 Critical Recurring Issues

### 1. Missing Security Headers (5 occurrences, 12 wasted iterations)
**Domain:** Frontend
**Affected Sprints:** auth-ui-001, dashboard-002, profile-page-003, admin-panel-004, checkout-ui-005

**Impact:**
- Forced ITERATE in 4/5 sprints
- Average 2.4 iterations per sprint
- Security risk flagged by validators

**Recommendation:**
1. Create `security-headers` skill with defaults
2. Add to `react-frontend-engineer` agent default context
3. Update `reviewer` checklist with security headers check
4. Consider pre-commit hook for header validation

**Estimated ROI:** Prevent 10+ iterations per month (20% faster frontend sprints)

---

### 2. No Error Boundaries (4 occurrences, 8 wasted iterations)
...
```

**Acceptance Criteria:**
- [ ] Report generated weekly
- [ ] Issues prioritized by impact
- [ ] Recommendations specific and actionable
- [ ] ROI estimates included

**Test:** `tests/ace-integration/14-improvement-report.test.sh`

#### 4.3 Weekly Cron Job
**File:** System crontab

**Task:** Automate pattern analysis
- Run every Monday at 9 AM
- Generate report in `docs/SYSTEMIC_IMPROVEMENTS.md`
- Email Product Owner with summary
- Store report history in `docs/archive/`

**Cron Entry:**
```cron
# ACE Pattern Detection (Weekly)
0 9 * * 1 cd /project && ./.claude/skills/cfn-ace-system/analyze-patterns.sh --window 30days --output docs/SYSTEMIC_IMPROVEMENTS.md --email product-owner@company.com
```

**Acceptance Criteria:**
- [ ] Cron job executes successfully
- [ ] Report generated in correct location
- [ ] Email sent with summary
- [ ] Old reports archived

**Test:** `tests/ace-integration/15-cron-job.test.sh`

#### 4.4 Recommendation Tracker
**File:** `docs/SYSTEMIC_IMPROVEMENTS_TRACKER.md`

**Task:** Track implementation of recommendations
- List all recommendations from reports
- Track status: pending, in_progress, completed, wont_fix
- Measure impact after implementation
- Calculate ROI (actual vs estimated)

**Acceptance Criteria:**
- [ ] Tracker updated with each report
- [ ] Status trackable over time
- [ ] ROI measured post-implementation
- [ ] Product Owner reviews monthly

**Test:** Manual review

### Phase 4 Success Metrics
- [ ] Pattern detection finds ≥3 systemic issues in first month
- [ ] 50% of recommendations implemented within 60 days
- [ ] Implemented recommendations show 15%+ improvement
- [ ] Product Owner satisfaction: 4/5+ (survey)

### Phase 4 Duration: 5 days

---

## Phase 5: Optimization & Monitoring (Week 5)

**Goal:** Performance tuning, observability, production readiness

**Story:** As a system administrator, I want ACE system to be fast, reliable, and observable.

### Phase 5 Deliverables

#### 5.1 Redis Caching Layer
**File:** `.claude/skills/cfn-ace-system/invoke-context-query.sh` (update)

**Task:** Cache hot contexts for fast retrieval
- Cache key: MD5 hash of query (keywords + domain + agents)
- TTL: 1 hour
- Invalidate on new reflection curated
- Measure cache hit rate

**Implementation:**
```bash
QUERY_HASH=$(echo "$KEYWORDS:$DOMAIN:$AGENTS" | md5sum | cut -d' ' -f1)
CACHE_KEY="ace:context:${QUERY_HASH}"

# Check cache
CACHED=$(redis-cli get "$CACHE_KEY")
if [[ -n "$CACHED" ]]; then
  echo "$CACHED"
  redis-cli incr "ace:metrics:cache_hits"
  exit 0
fi

# Cache miss - query SQLite
redis-cli incr "ace:metrics:cache_misses"
RESULTS=$(query-sqlite...)
redis-cli setex "$CACHE_KEY" 3600 "$RESULTS"
echo "$RESULTS"
```

**Acceptance Criteria:**
- [ ] Cache hit rate ≥ 60% after 1 week
- [ ] Cache invalidation works correctly
- [ ] Cached queries < 10ms
- [ ] Cache miss queries < 100ms

**Test:** `tests/ace-integration/16-redis-caching.test.sh`

#### 5.2 Telemetry Hooks
**File:** Multiple ACE skill files

**Task:** Add timing metrics to all operations
- Reflection time (Loop 5)
- Query time (Loop 0)
- Injection time (Loop 3)
- Curation time (background)
- Store in SQLite: `ace_telemetry` table

**Schema:**
```sql
CREATE TABLE ace_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL,       -- reflect, query, inject, curate
  duration_ms INTEGER NOT NULL,
  task_id TEXT,
  success BOOLEAN DEFAULT 1,
  error_message TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_operation ON ace_telemetry(operation);
CREATE INDEX idx_timestamp ON ace_telemetry(timestamp);
```

**Acceptance Criteria:**
- [ ] All ACE operations instrumented
- [ ] Telemetry doesn't add >5ms overhead
- [ ] Success/failure tracked
- [ ] Errors logged with stack trace

**Test:** `tests/ace-integration/17-telemetry.test.sh`

#### 5.3 ACE Dashboard Command
**File:** `.claude/commands/cfn/ace-dashboard.md`

**Task:** Create dashboard for ACE system
- Total reflections stored
- Active curated lessons
- Cache hit rate
- Average operation times
- Top 10 most reused lessons
- Pattern detection summary

**Output:**
```
╔═══════════════════════════════════════════════════════════════════╗
║                    ACE SYSTEM DASHBOARD                          ║
╚═══════════════════════════════════════════════════════════════════╝

📊 STATISTICS (Last 30 Days)
─────────────────────────────────────────────────────────────────────
Total Reflections:        47
Active Curated Lessons:   23
Archived Lessons:         12
Storage Used:             2.3 MB

⚡ PERFORMANCE METRICS
─────────────────────────────────────────────────────────────────────
Cache Hit Rate:           68% (↑ 5% from last week)
Avg Query Time:           82ms (target: <100ms) ✅
Avg Reflection Time:      18.5s (background)
Avg Injection Time:       145ms (target: <200ms) ✅

🔥 MOST REUSED LESSONS (Success Rate)
─────────────────────────────────────────────────────────────────────
1. JWT + Redis Pattern            12 uses (92% success)
2. Security Headers Setup          10 uses (90% success)
3. Error Boundary Pattern           8 uses (88% success)
4. React Query for Data Fetching    7 uses (86% success)
5. Redis Locking for Concurrency    6 uses (100% success)

⚠️  RECURRING ISSUES (Pattern Detection)
─────────────────────────────────────────────────────────────────────
1. Missing security headers         5 occurrences (Frontend)
2. No error boundaries              4 occurrences (Frontend)
3. Long API timeouts                3 occurrences (Backend)

💡 RECOMMENDATIONS
─────────────────────────────────────────────────────────────────────
- Create security-headers skill (high impact)
- Update react-frontend-engineer default context
- See: docs/SYSTEMIC_IMPROVEMENTS.md for details

📈 LEARNING TRENDS
─────────────────────────────────────────────────────────────────────
Context Reuse Rate:       72% (target: 70%) ✅
First-Iteration Success:  +23% improvement ✅
Anti-Pattern Prevented:   8 cases this month
Avg Iterations:           1.8 (down from 2.4) ↓

Last Updated: 2025-10-29 09:00:00
Next Pattern Analysis: Monday, 2025-11-04 09:00
```

**Acceptance Criteria:**
- [ ] Dashboard renders in terminal (ASCII art)
- [ ] All metrics accurate
- [ ] Performance against targets shown
- [ ] Trends calculated correctly

**Test:** `tests/ace-integration/18-dashboard.test.sh`

#### 5.4 Performance Tuning
**Task:** Optimize for production scale

**SQLite Optimization:**
- [ ] Analyze query plans: `EXPLAIN QUERY PLAN`
- [ ] Optimize indexes (covering indexes for common queries)
- [ ] Vacuum database weekly
- [ ] Enable WAL mode for concurrency

**Query Optimization:**
- [ ] Batch reflection storage (reduce writes)
- [ ] Limit query result sets (max 100 contexts scanned)
- [ ] Use prepared statements
- [ ] Connection pooling for SQLite

**Acceptance Criteria:**
- [ ] Query time < 100ms at 10,000 reflections
- [ ] No performance regression under load
- [ ] Memory usage < 50MB for ACE operations
- [ ] Storage growth < 10MB/month

**Test:** `tests/ace-integration/19-performance-scale.test.sh`

#### 5.5 Production Deployment Checklist
**File:** `docs/ACE_DEPLOYMENT.md`

**Task:** Production readiness checklist
- [ ] All Phase 1-5 tests passing
- [ ] Performance benchmarks met
- [ ] Configuration validated
- [ ] Backup strategy for SQLite database
- [ ] Rollback procedure tested
- [ ] Documentation complete
- [ ] Product Owner approval
- [ ] Stakeholder training completed

**Acceptance Criteria:**
- [ ] Checklist 100% complete
- [ ] Deployment runbook created
- [ ] Monitoring dashboards configured
- [ ] Alerts set up for failures

**Test:** Manual review

### Phase 5 Success Metrics
- [ ] Cache hit rate ≥ 60%
- [ ] All operation times within targets
- [ ] Dashboard accurate and useful
- [ ] No production incidents in first week
- [ ] Product Owner approves for general availability

### Phase 5 Duration: 5 days

---

## Testing Strategy

### Unit Tests (per phase)
- Tag extraction accuracy
- Relevance scoring calculation
- Confidence decay formula
- Query performance benchmarks
- Anti-pattern detection logic

### Integration Tests (cumulative)
- End-to-end Loop 0 → Loop 5 flow
- Context lookup returns relevant results
- Agents receive injected context
- Reflection stored in SQLite
- Background processing doesn't block

### Performance Tests (Phase 5)
- Query speed at scale (1000, 10000 reflections)
- Cache hit rate measurement
- Injection overhead (< 200ms)
- Pattern detection on large dataset
- Concurrent query handling

### User Acceptance Tests (Phase 5)
- Product Owner reviews reflection quality
- Agents survey: context usefulness (4/5+)
- No context pollution reported
- Anti-patterns prevented mistakes (3+ cases)
- Pattern detection led to improvements (2+ items)

## Configuration

### ace-integration.json
**Location:** `.claude/config/ace-integration.json`

```json
{
  "ace_integration": {
    "enabled": true,
    "reflection": {
      "trigger": "proceed_decision",
      "mode": "background",
      "auto_curate": true,
      "min_confidence": 0.70,
      "scrub_secrets": true,
      "timeout_seconds": 60
    },
    "context_lookup": {
      "enabled": true,
      "similarity_threshold": 0.70,
      "max_results": 5,
      "recency_weight": 0.15,
      "cache_ttl": 3600,
      "query_timeout_ms": 200
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
    },
    "telemetry": {
      "enabled": true,
      "retention_days": 30
    }
  }
}
```

## Risk Mitigation

### Risk 1: Context Pollution
**Impact:** High | **Probability:** Medium
**Mitigation:**
- Limit top 5 contexts per query
- Cap 3 lessons per category
- Relevance threshold: 0.70
- User feedback mechanism

### Risk 2: Outdated Lessons
**Impact:** Medium | **Probability:** High
**Mitigation:**
- Confidence decay (30%/year)
- Manual review for high-confidence
- Archive lessons >2 years

### Risk 3: Storage Growth
**Impact:** Medium | **Probability:** Medium
**Mitigation:**
- 90-day TTL for low-confidence
- Max 1000 reflections
- Compression enabled
- Weekly cleanup cron

### Risk 4: Performance Impact
**Impact:** High | **Probability:** Low
**Mitigation:**
- SQLite indexes optimized
- Redis caching (60%+ hit rate)
- Async reflection (background)
- Query timeout: 200ms

### Risk 5: Incorrect Patterns
**Impact:** High | **Probability:** Low
**Mitigation:**
- Manual review of patterns
- Confidence thresholds
- Product Owner approval required
- Rollback capability

## Rollout Strategy

### Week 1: Internal Testing
- Deploy to development environment
- Run Phase 1-3 tests
- Manual testing with sample tasks
- Gather initial feedback

### Week 2-3: Staging Validation
- Deploy to staging environment
- Run all 19 automated tests
- Performance benchmarking
- User acceptance testing (Product Owner)

### Week 4: Canary Deployment
- Enable for 10% of CFN Loops
- Monitor metrics daily
- Collect user feedback
- Iterate on issues

### Week 5: Full Deployment
- Enable for 100% of CFN Loops
- Monitor dashboard daily
- First pattern analysis report
- Celebrate launch 🎉

## Monitoring & Alerting

### Key Metrics to Monitor
1. **Context Reuse Rate** (target: 70%)
2. **Query Performance** (target: <100ms)
3. **Cache Hit Rate** (target: 60%)
4. **Reflection Coverage** (target: 95%)
5. **First-Iteration Success** (target: +20%)

### Alerts
- Query time > 200ms (3 consecutive)
- Reflection failure rate > 5%
- Cache hit rate < 50% (sustained 1 hour)
- Storage > 90% of max_reflections
- Pattern detection cron fails

### Dashboard URLs
- ACE Dashboard: `/cfn:ace-dashboard`
- Pattern Report: `docs/SYSTEMIC_IMPROVEMENTS.md`
- Telemetry: SQLite query or future web portal

## Documentation Updates

### Required Documentation
- [x] `planning/ace-integration/ACE_LOOP_INTEGRATION_PLAN.md`
- [x] `planning/ace-integration/ACE_FLOW_DIAGRAM.md`
- [x] `planning/ace-integration/IMPLEMENTATION_CHECKLIST.md`
- [ ] `readme/logs-features.md` - Add ACE System section
- [ ] `readme/logs-slash-commands.md` - Document `/cfn:context-*`
- [ ] `CLAUDE.md` - Add Loop 5 to workflow
- [ ] `.claude/skills/cfn-loop-orchestration/SKILL.md` - Loop 5 hook
- [ ] `docs/ACE_SYSTEM_GUIDE.md` - User guide
- [ ] `docs/ACE_DEPLOYMENT.md` - Deployment runbook

## Team & Resources

### Required Skills
- Bash scripting (orchestrator modifications)
- SQLite (schema design, query optimization)
- Redis (caching, key design)
- System architecture (integration design)
- Testing (unit, integration, performance)

### Estimated Effort
- **Development:** 20 days (1 engineer, 5 weeks)
- **Testing:** 5 days (QA engineer)
- **Documentation:** 3 days (tech writer)
- **Total:** 28 engineer-days

### Dependencies
- System Architecture Team (owner)
- Product Owner (requirements, approval)
- QA Team (testing)
- DevOps (deployment, monitoring)

## Success Celebration

**When Epic Complete:**
- [ ] Demo to stakeholders
- [ ] Blog post: "CFN Loops That Learn"
- [ ] Internal presentation: Lessons learned
- [ ] Update roadmap with future enhancements
- [ ] Team retrospective
- [ ] 🎉 Team lunch/happy hour

## Future Enhancements (Out of Scope)

### Next Epic Ideas
1. **Web Portal for ACE** - Visual interface for managing contexts
2. **Cross-Project Context Sharing** - Learn from other projects
3. **ML-Based Pattern Detection** - Replace rule-based with ML
4. **Real-Time Context Injection** - Update agent context mid-execution
5. **Context Marketplace** - Share lessons across teams/companies

---

## Approval

**Status:** AWAITING_APPROVAL

**Product Owner:** __________________ Date: __________

**Tech Lead:** __________________ Date: __________

**DevOps Lead:** __________________ Date: __________

---

**Epic ID:** EPIC-ACE-001
**Version:** 1.0.0
**Last Updated:** 2025-10-29
**Next Review:** After Phase 1 completion
