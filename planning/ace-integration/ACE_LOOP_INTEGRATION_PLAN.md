# ACE System Integration Plan - Self-Improving CFN Loops

**Version:** 1.0.0
**Date:** 2025-10-29
**Status:** PLANNING

## Executive Summary

Integrate ACE (Adaptive Context Extension) system into CFN Loop workflow to enable automatic learning from sprint execution, context reuse across sprints, and continuous system improvement.

**Key Goals:**
1. Automatic post-sprint reflection and lesson extraction
2. Context lookup when starting new sprints
3. Inject relevant historical context into agent execution
4. Build institutional knowledge over time

## Current State

### ACE System Components (Operational but Dormant)
- **Location:** `.claude/skills/cfn-ace-system/`
- **Status:** v1.0.0 OPERATIONAL, not integrated into CFN Loop
- **Commands:** `/cfn:context-reflect`, `/cfn:context-curate`, `/cfn:context-inject`, `/cfn:context-query`, `/cfn:context-stats`
- **Storage:** SQLite (`swarm-memory.db`)

### Current CFN Loop Flow
```
Loop 0: Planning (Task Classifier)
Loop 3: Implementation (Agents execute)
Loop 2: Validation (Reviewers validate)
Loop 4: Product Owner Decision (PROCEED/ITERATE/ABORT)
→ Git Commit + Push (if PROCEED)
```

**Missing:** Post-sprint reflection, context lookup, historical injection

## Proposed Architecture

### Enhanced CFN Loop Flow with ACE

```
Loop 0: Planning + Context Lookup (NEW)
  ├─ Task Classifier (existing)
  └─ Context Query: Find similar past sprints
      └─ Return top 5 relevant contexts with lessons

Loop 3: Implementation with Context Injection (ENHANCED)
  ├─ Spawn agents with injected historical context
  └─ Context includes: strategies, anti-patterns, edge cases

Loop 2: Validation (existing)
Loop 4: Product Owner Decision (existing)

Loop 5: Post-Sprint Reflection (NEW)
  ├─ Triggered ONLY on PROCEED decision
  ├─ Extract lessons from sprint execution
  ├─ Store in SQLite with metadata
  └─ Run in background (non-blocking)

→ Git Commit + Push
```

## Integration Points

### 1. Loop 5 - Post-Sprint Reflection

**Trigger:** Product Owner decision = PROCEED
**Location:** After consensus validation, before git commit
**Processing:** Background (non-blocking)

**Implementation:**
```bash
# In orchestrator after PROCEED decision
if [[ "$DECISION" == "PROCEED" ]]; then
  # Launch reflection in background (don't block commit)
  (
    ./.claude/skills/cfn-ace-system/invoke-context-reflect.sh \
      --task-id "$TASK_ID" \
      --swarm-id "$SWARM_ID" \
      --auto-curate \
      --reflection-type "success" \
      --output "/tmp/reflection-${TASK_ID}.json"
  ) &

  # Continue with git commit (don't wait)
  git add .
  git commit -m "..."
fi
```

**Extracted Data:**
- **Strategies:** What worked well (confidence ≥ 0.85)
- **Patterns:** Reusable approaches discovered
- **Anti-Patterns:** What failed (confidence < 0.50)
- **Edge Cases:** Unexpected scenarios encountered
- **Agent Performance:** Which agents were most effective
- **Iteration Count:** How many iterations needed
- **Deliverables:** What was built

**Metadata Tags (Auto-Generated):**
```json
{
  "task_id": "auth-implementation-001",
  "swarm_id": "swarm-20251029-001",
  "domain": ["backend", "security"],
  "agent_types": ["backend-dev", "security-specialist"],
  "complexity": "high",
  "iterations": 2,
  "final_confidence": 0.92,
  "deliverables": [".claude/skills/jwt-auth/", "tests/auth.test.js"],
  "timestamp": 1698624000,
  "keywords": ["authentication", "JWT", "OAuth", "security"]
}
```

### 2. Loop 0 Enhancement - Context Lookup

**Trigger:** New CFN Loop task received
**Location:** After task classification, before agent spawning
**Processing:** Synchronous (must complete before Loop 3)

**Implementation:**
```bash
# In orchestrator before spawning Loop 3 agents
SIMILAR_CONTEXTS=$(./.claude/skills/cfn-ace-system/invoke-context-query.sh \
  --keywords "${TASK_KEYWORDS}" \
  --domain "${TASK_DOMAIN}" \
  --agent-types "${LOOP3_AGENTS}" \
  --similarity-threshold 0.7 \
  --max-results 5 \
  --format json)

# Store in Redis for agent access
redis-cli set "cfn_loop:${TASK_ID}:historical_context" "$SIMILAR_CONTEXTS"
```

**Query Strategy:**
1. **Keyword Matching:** Extract from task description
2. **Domain Overlap:** Frontend, backend, security, etc.
3. **Agent Type Similarity:** Same specialist types needed
4. **Recency Weight:** Recent contexts scored higher
5. **Success Filter:** Only include confidence ≥ 0.80

**Output Format:**
```json
{
  "similar_contexts": [
    {
      "task_id": "auth-oauth-integration-002",
      "similarity_score": 0.89,
      "lessons": [
        {
          "type": "STRATEGY",
          "content": "Use JWT for stateless auth, Redis for session invalidation",
          "confidence": 0.92,
          "tags": ["authentication", "JWT", "Redis"]
        },
        {
          "type": "ANTI_PATTERN",
          "content": "Avoid storing passwords in JWT payload (security risk)",
          "confidence": 0.95,
          "tags": ["security", "JWT", "authentication"]
        }
      ],
      "agents_used": ["backend-dev", "security-specialist"],
      "iterations": 1,
      "timestamp": 1698500000
    }
  ]
}
```

### 3. Loop 3 Enhancement - Context Injection

**Trigger:** Agent spawning
**Location:** When spawning each Loop 3 agent
**Processing:** Synchronous (inject before spawn)

**Implementation:**
```bash
# Retrieve historical context
HISTORICAL_CONTEXT=$(redis-cli get "cfn_loop:${TASK_ID}:historical_context")

# Inject into agent context
./.claude/skills/cfn-ace-system/invoke-context-inject.sh \
  --agent-id "$AGENT_ID" \
  --agent-type "$AGENT_TYPE" \
  --task-context "$TASK_CONTEXT" \
  --historical-context "$HISTORICAL_CONTEXT" \
  --output "/tmp/injected-context-${AGENT_ID}.json"

# Spawn agent with enriched context
ENRICHED_CONTEXT=$(cat "/tmp/injected-context-${AGENT_ID}.json")
npx claude-flow-novice agent-spawn "$AGENT_TYPE" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$ENRICHED_CONTEXT"
```

**Injected Context Format:**
```markdown
## Task Description
Implement JWT authentication for API endpoints

## Historical Context (5 similar tasks found)

### ✅ Effective Strategies (from past sprints)
1. **JWT + Redis Pattern** (confidence: 0.92)
   - Use JWT for stateless auth tokens
   - Use Redis for token invalidation (logout, revoke)
   - Store minimal claims in JWT (user_id, role)
   - Tags: authentication, JWT, Redis

2. **Security Headers Pattern** (confidence: 0.88)
   - Always set httpOnly, secure, sameSite cookies
   - Implement CSRF protection for cookie-based auth
   - Tags: security, cookies, CSRF

### ⚠️ Anti-Patterns to Avoid (from past failures)
1. **JWT Payload Security** (confidence: 0.95)
   - NEVER store passwords or sensitive data in JWT
   - Issue found in: auth-oauth-integration-002 (iteration 3)
   - Tags: security, JWT

2. **Token Expiration** (confidence: 0.87)
   - Don't use long-lived tokens (>1 hour access tokens)
   - Always implement refresh token rotation
   - Issue found in: session-management-001 (iteration 2)
   - Tags: security, JWT, session

### 📋 Edge Cases Discovered
1. **Concurrent Token Refresh** (confidence: 0.83)
   - Race condition when multiple tabs refresh simultaneously
   - Solution: Use Redis lock during refresh operation
   - Tags: concurrency, refresh-token

## Your Task
[Original task description continues...]
```

## Improvements Over Manual CLAUDE.md Lessons

### 1. Automatic Tagging
- **Problem:** Manual tags in CLAUDE.md are inconsistent
- **Solution:** Extract tags automatically from:
  - Task description keywords
  - Agent types used
  - File paths created
  - Domain classification

### 2. Confidence Decay Over Time
- **Problem:** Old lessons may be outdated
- **Solution:** Apply time-based decay function
  ```javascript
  confidence_adjusted = confidence_original * decay_factor
  decay_factor = 1.0 - (age_in_days / 365) * 0.3  // 30% decay per year
  ```

### 3. Negative Context (Anti-Patterns)
- **Problem:** We learn more from failures than successes
- **Solution:** Explicitly track failed approaches
  - Store low-confidence outcomes (< 0.50)
  - Extract from ITERATE decisions with feedback
  - Format: "Avoid X, caused Y, found in sprint Z"

### 4. Cross-Sprint Pattern Detection
- **Problem:** Recurring issues indicate systemic problems
- **Solution:** Pattern analyzer runs weekly
  ```bash
  ./.claude/skills/cfn-ace-system/analyze-patterns.sh \
    --window 30days \
    --min-occurrences 3 \
    --output systemic-issues.json
  ```
  - Detects: Repeated failures in same domain
  - Suggests: Architecture improvements, new skills needed

### 5. Context Relevance Scoring

**Multi-Factor Similarity:**
```javascript
relevance_score =
  0.30 * keyword_similarity +      // TF-IDF matching
  0.25 * agent_overlap +           // % same agent types
  0.20 * domain_match +            // Same technical domain
  0.15 * recency_score +           // Time decay
  0.10 * success_rate              // Historical effectiveness
```

### 6. Minimal Overhead
- **Reflection:** Background process, doesn't block commit
- **Query:** Fast SQLite index on keywords/tags (< 100ms)
- **Injection:** Cached lookups, Redis for hot contexts
- **Storage:** Compressed JSON, 90-day TTL for low-confidence

## Data Schema

### context_reflections Table
```sql
CREATE TABLE context_reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  swarm_id TEXT,
  reflection_type TEXT,  -- success, failure, optimization, edge_case, pattern
  extracted_lessons JSON,
  metadata JSON,  -- tags, domain, agent_types, complexity
  confidence REAL,
  created_at INTEGER,
  acl_level INTEGER DEFAULT 3
);

CREATE INDEX idx_tags ON context_reflections((json_extract(metadata, '$.tags')));
CREATE INDEX idx_domain ON context_reflections((json_extract(metadata, '$.domain')));
CREATE INDEX idx_confidence ON context_reflections(confidence);
CREATE INDEX idx_created_at ON context_reflections(created_at);
```

### adaptive_context Table (Curated)
```sql
CREATE TABLE adaptive_context (
  bullet_id TEXT PRIMARY KEY,  -- STRAT-042, PATTERN-011, ANTI-005
  category TEXT,  -- strategy, pattern, anti-pattern, edge-case
  content TEXT,
  confidence REAL,
  tags JSON,
  sources JSON,  -- Array of task_ids this lesson came from
  success_count INTEGER DEFAULT 0,  -- Times this lesson was applied successfully
  failure_count INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER,
  acl_level INTEGER DEFAULT 4
);
```

## Configuration

### ACE Integration Config
```json
{
  "ace_integration": {
    "enabled": true,
    "reflection": {
      "trigger": "proceed_decision",
      "mode": "background",
      "auto_curate": true,
      "min_confidence": 0.70
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
      "include_edge_cases": true
    },
    "storage": {
      "ttl_days": 90,
      "max_reflections": 1000,
      "compression": true
    }
  }
}
```

**Location:** `.claude/config/ace-integration.json`

## Implementation Phases

### Phase 1: Core Integration (Week 1)
**Goal:** Basic reflection, lookup, injection working

**Tasks:**
1. Update `orchestrate.sh` to include Loop 5 reflection hook
2. Implement background reflection invocation
3. Update agent spawning to inject historical context
4. Create context lookup helper for Loop 0
5. Test with simple task (single agent, 1 iteration)

**Deliverables:**
- Modified orchestrate.sh with Loop 5 hook
- Helper script: `helpers/context-lookup.sh`
- Helper script: `helpers/context-injection.sh`
- Test: `tests/ace-integration/01-basic-flow.test.sh`

### Phase 2: Metadata Enhancement (Week 2)
**Goal:** Automatic tagging, relevance scoring

**Tasks:**
1. Implement automatic tag extraction from task description
2. Add domain classifier (frontend, backend, security, devops)
3. Build relevance scoring algorithm
4. Create SQLite indexes for fast lookup

**Deliverables:**
- Tag extractor: `.claude/skills/cfn-ace-system/extract-tags.sh`
- Domain classifier integration with task-classifier skill
- Relevance scorer: `.claude/skills/cfn-ace-system/score-relevance.sh`
- Test: `tests/ace-integration/02-metadata.test.sh`

### Phase 3: Anti-Patterns & Edge Cases (Week 3)
**Goal:** Capture and inject failure lessons

**Tasks:**
1. Extract anti-patterns from low-confidence outcomes
2. Parse ITERATE feedback for failure reasons
3. Format negative context for injection
4. Implement warning system in injected context

**Deliverables:**
- Anti-pattern extractor in reflection skill
- Negative context formatter
- Test: `tests/ace-integration/03-anti-patterns.test.sh`

### Phase 4: Pattern Detection (Week 4)
**Goal:** Cross-sprint analysis and systemic improvements

**Tasks:**
1. Build pattern analyzer (weekly cron job)
2. Detect recurring issues across sprints
3. Generate improvement suggestions
4. Report to product owner

**Deliverables:**
- Pattern analyzer: `.claude/skills/cfn-ace-system/analyze-patterns.sh`
- Cron job configuration
- Report template: `docs/SYSTEMIC_IMPROVEMENTS.md`
- Test: `tests/ace-integration/04-pattern-detection.test.sh`

### Phase 5: Optimization & Monitoring (Week 5)
**Goal:** Performance tuning, observability

**Tasks:**
1. Implement caching for hot contexts (Redis)
2. Add telemetry for ACE system usage
3. Build dashboard for reflection statistics
4. Tune relevance scoring based on feedback

**Deliverables:**
- Redis caching layer
- Telemetry hooks in ACE skills
- Dashboard: `/cfn:ace-dashboard` command
- Performance report: `docs/ACE_PERFORMANCE.md`

## Success Metrics

### Quantitative
1. **Context Reuse Rate:** % of sprints using historical context (target: 70%)
2. **First-Iteration Success:** % sprints completing in 1 iteration (target: +20%)
3. **Reflection Coverage:** % sprints with post-reflection (target: 95%)
4. **Query Speed:** Context lookup time (target: < 100ms)
5. **Storage Growth:** Reflections per month (monitor for cleanup)

### Qualitative
1. **Lesson Quality:** Agents find historical context useful
2. **Anti-Pattern Prevention:** Fewer repeated mistakes
3. **Systemic Improvements:** Patterns lead to architecture changes
4. **Institutional Knowledge:** New team members benefit from context

## Risk Mitigation

### Risk 1: Context Pollution
**Problem:** Too much injected context overwhelms agents
**Mitigation:**
- Limit to top 5 similar contexts
- Cap lessons per category (3 strategies, 3 anti-patterns)
- Filter by relevance score ≥ 0.70

### Risk 2: Outdated Lessons
**Problem:** Old lessons may be obsolete
**Mitigation:**
- Confidence decay over time (30% per year)
- Manual review process for high-confidence lessons
- Archive lessons older than 2 years

### Risk 3: Storage Growth
**Problem:** Unlimited reflections fill database
**Mitigation:**
- 90-day TTL for low-confidence reflections (< 0.75)
- Keep only curated lessons long-term
- Compression for JSON payloads
- Max 1000 reflections, prune oldest low-confidence

### Risk 4: Performance Impact
**Problem:** Context lookup slows down Loop 0
**Mitigation:**
- SQLite indexes on tags, domain, confidence, timestamp
- Redis caching for hot contexts (1 hour TTL)
- Async reflection (background processing)
- Query timeout: 200ms max

### Risk 5: Context Security
**Problem:** Sensitive data in reflections
**Mitigation:**
- Scrub credentials, API keys, secrets from reflections
- ACL Level 3 for reflections (swarm-scoped)
- ACL Level 4 for curated context (project-scoped)
- Never store passwords, tokens, PII

## Backward Compatibility

**Existing CLAUDE.md Lessons:**
- Keep Sprint 7-9 lessons in CLAUDE.md
- ACE system supplements, doesn't replace
- Manual lessons have priority (higher confidence)
- Migration script: `scripts/migrate-claude-lessons-to-ace.sh`

**Opt-Out:**
- ACE integration can be disabled via config
- Fallback to current workflow (no context lookup/injection)
- Individual features can be toggled independently

## Testing Strategy

### Unit Tests
- Tag extraction accuracy
- Relevance scoring algorithm
- Confidence decay calculation
- Query performance (< 100ms)

### Integration Tests
- End-to-end Loop 0 → Loop 5 flow
- Context injection into agent spawning
- Background reflection processing
- SQLite storage and retrieval

### User Acceptance Tests
- Product Owner reviews reflection quality
- Agents confirm context usefulness (survey)
- Check for context pollution (too much noise)
- Validate anti-pattern prevention

## Documentation Updates

**Files to Update:**
1. `readme/logs-features.md` - Add "ACE System Integration" section
2. `readme/logs-slash-commands.md` - Document `/cfn:context-*` commands
3. `CLAUDE.md` - Add ACE integration to CFN Loop workflow
4. `.claude/skills/cfn-loop-orchestration/SKILL.md` - Document Loop 5 hook
5. `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md` - Update with ACE usage

## Next Steps

1. **Review & Approval:** Product Owner reviews this plan
2. **Spike Task:** Build prototype for Phase 1 (2-3 hours)
3. **Sprint Planning:** Break Phase 1 into tasks for Sprint 10
4. **Implementation:** Start with basic integration
5. **Iterate:** Gather feedback, refine approach

## Questions for Product Owner

1. Should ACE integration be opt-in or opt-out for CFN Loops?
2. What confidence threshold for including lessons (0.70, 0.75, 0.80)?
3. Should we migrate existing CLAUDE.md lessons to ACE system?
4. Weekly pattern analysis report - who reviews it?
5. How long should we keep reflections (90 days, 6 months, 1 year)?

---

**Status:** AWAITING APPROVAL
**Next Review:** 2025-11-05
**Owner:** System Architecture Team
