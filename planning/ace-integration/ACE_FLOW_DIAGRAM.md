# ACE System Integration - Visual Flow Diagram

## Enhanced CFN Loop with ACE Learning System

```
┌─────────────────────────────────────────────────────────────────────┐
│                       NEW CFN LOOP WITH ACE                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Loop 0: Planning + Context Lookup (ENHANCED)                       │
├─────────────────────────────────────────────────────────────────────┤
│  1. Receive Task Description                                        │
│  2. Task Classifier: Extract keywords, domain, complexity           │
│  3. ► ACE Context Query ◄                                          │
│     └─ Query: Similar past sprints                                  │
│     └─ Match: Keywords, domain, agent types                         │
│     └─ Filter: confidence ≥ 0.70, recency weighted                 │
│     └─ Return: Top 5 relevant contexts with lessons                │
│  4. Store in Redis: cfn_loop:{TASK_ID}:historical_context          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Loop 3: Implementation with Context Injection (ENHANCED)            │
├─────────────────────────────────────────────────────────────────────┤
│  For each agent (backend-dev, frontend-dev, security, etc.):       │
│                                                                     │
│  1. Retrieve historical context from Redis                          │
│  2. ► ACE Context Injection ◄                                      │
│     └─ Merge: Task description + historical lessons                │
│     └─ Format: Strategies, anti-patterns, edge cases               │
│     └─ Filter: Relevant to agent type                              │
│  3. Spawn agent with enriched context                               │
│     ```                                                              │
│     Context includes:                                                │
│     - What worked: JWT + Redis pattern (0.92 confidence)            │
│     - What failed: Long-lived tokens (0.87 anti-pattern)           │
│     - Edge cases: Concurrent refresh race condition                 │
│     ```                                                              │
│  4. Agent implements with historical guidance                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Loop 2: Validation (UNCHANGED)                                      │
├─────────────────────────────────────────────────────────────────────┤
│  1. Validators review implementation                                │
│  2. Generate structured feedback                                    │
│  3. Report consensus score                                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Loop 4: Product Owner Decision (UNCHANGED)                          │
├─────────────────────────────────────────────────────────────────────┤
│  Decision: PROCEED / ITERATE / ABORT                                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                PROCEED             ITERATE
                    │                   │
                    ▼                   └─> Loop 3 again with feedback
┌─────────────────────────────────────────────────────────────────────┐
│ Loop 5: Post-Sprint Reflection (NEW)                                │
├─────────────────────────────────────────────────────────────────────┤
│  Triggered: ONLY on PROCEED decision                                │
│  Processing: Background (non-blocking)                              │
│                                                                     │
│  1. ► ACE Context Reflect ◄                                        │
│     └─ Analyze: Sprint execution traces                            │
│     └─ Extract: Strategies, patterns, anti-patterns                │
│     └─ Generate: Structured lessons with confidence                │
│                                                                     │
│  2. Extracted Lessons:                                              │
│     ┌──────────────────────────────────────────────────┐           │
│     │ ✅ Strategies (confidence ≥ 0.85)                 │           │
│     │ - JWT + Redis for stateless auth (0.92)          │           │
│     │ - Security headers pattern (0.88)                │           │
│     │                                                   │           │
│     │ ⚠️  Anti-Patterns (confidence < 0.50)             │           │
│     │ - Long-lived access tokens (security risk)       │           │
│     │ - Passwords in JWT payload (critical issue)      │           │
│     │                                                   │           │
│     │ 📋 Edge Cases Discovered                          │           │
│     │ - Concurrent token refresh race condition        │           │
│     │ - Session cleanup on browser close               │           │
│     └──────────────────────────────────────────────────┘           │
│                                                                     │
│  3. Store in SQLite: context_reflections table                      │
│     └─ Metadata: tags, domain, agents, complexity, timestamp       │
│                                                                     │
│  4. ► ACE Context Curate ◄ (if --auto-curate enabled)              │
│     └─ Merge: New lessons into adaptive_context table              │
│     └─ Deduplicate: Similar lessons                                │
│     └─ Assign: Bullet ID (STRAT-042, PATTERN-011, ANTI-005)       │
│                                                                     │
│  5. Continue in background (don't block commit)                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Git Commit + Push                                                   │
└─────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                    ACE DATA FLOW & STORAGE                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│  Sprint N       │  PROCEED → Reflection
│  Completes      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SQLite: context_reflections                                         │
├─────────────────────────────────────────────────────────────────────┤
│ task_id: auth-jwt-001                                               │
│ lessons: [                                                          │
│   {type: "strategy", content: "JWT + Redis", confidence: 0.92},    │
│   {type: "anti-pattern", content: "Long tokens", confidence: 0.87} │
│ ]                                                                   │
│ metadata: {                                                         │
│   tags: ["authentication", "JWT", "security"],                     │
│   domain: ["backend", "security"],                                 │
│   agents: ["backend-dev", "security-specialist"],                  │
│   complexity: "high",                                               │
│   iterations: 2                                                     │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ Auto-Curate (if enabled)
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SQLite: adaptive_context (Curated Lessons)                          │
├─────────────────────────────────────────────────────────────────────┤
│ bullet_id: STRAT-042                                                │
│ category: strategy                                                  │
│ content: "JWT + Redis for stateless auth with invalidation"        │
│ confidence: 0.92                                                    │
│ tags: ["authentication", "JWT", "Redis", "security"]               │
│ sources: ["auth-jwt-001", "session-mgmt-005"]                      │
│ success_count: 12  ← Incremented when pattern reused successfully │
│ failure_count: 1                                                    │
│ acl_level: 4 (project-scoped)                                      │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ Indexed for fast lookup
         │
         ▼
┌─────────────────┐
│  Sprint N+1     │  New task arrives
│  Starts         │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Context Query (Loop 0)                                              │
├─────────────────────────────────────────────────────────────────────┤
│ Query:                                                              │
│   keywords: ["OAuth", "authentication", "API"]                     │
│   domain: ["backend", "security"]                                  │
│   agent_types: ["backend-dev", "security-specialist"]              │
│   similarity_threshold: 0.70                                        │
│                                                                     │
│ Relevance Scoring:                                                  │
│   0.30 * keyword_similarity   (0.85 → OAuth matches auth)          │
│   0.25 * agent_overlap        (1.00 → exact agent match)           │
│   0.20 * domain_match         (1.00 → backend+security)            │
│   0.15 * recency_score        (0.90 → recent sprint)               │
│   0.10 * success_rate         (0.92 → 12/13 success)               │
│   ─────────────────────────────────────────────────────────         │
│   = 0.89 (HIGH RELEVANCE)                                           │
│                                                                     │
│ Returns: Top 5 similar contexts                                     │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Redis: Temporary Storage (Hot Contexts)                             │
├─────────────────────────────────────────────────────────────────────┤
│ Key: cfn_loop:{TASK_ID}:historical_context                          │
│ TTL: 1 hour                                                         │
│ Value: {top 5 similar contexts with lessons}                        │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Context Injection (Loop 3)                                          │
├─────────────────────────────────────────────────────────────────────┤
│ Agent Context Includes:                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ## Historical Context (5 similar tasks found)                   │ │
│ │                                                                  │ │
│ │ ### ✅ Effective Strategies                                      │ │
│ │ 1. JWT + Redis Pattern (confidence: 0.92, used in 12 sprints)  │ │
│ │    - Use JWT for stateless auth                                 │ │
│ │    - Use Redis for token invalidation                           │ │
│ │                                                                  │ │
│ │ ### ⚠️  Anti-Patterns to Avoid                                   │ │
│ │ 1. Long-lived tokens (confidence: 0.87, failed in 3 sprints)   │ │
│ │    - Don't use access tokens > 1 hour                           │ │
│ │    - Issue found in: session-mgmt-001                           │ │
│ │                                                                  │ │
│ │ ### 📋 Edge Cases                                                │ │
│ │ 1. Concurrent refresh race condition                            │ │
│ │    - Solution: Redis lock during refresh                        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                    CONFIDENCE DECAY OVER TIME                       │
└─────────────────────────────────────────────────────────────────────┘

Confidence = Original * Decay Factor
Decay Factor = 1.0 - (age_in_days / 365) * 0.3

│ 1.0 ┤ ●─────────────────────────
│     │  \                         New lesson: 0.92 confidence
│     │   \
│ 0.9 ┤    \                       30 days: 0.89 (97% of original)
│     │     \
│     │      \
│ 0.8 ┤       ●─────────            90 days: 0.85 (92% of original)
│     │         \
│     │          \
│ 0.7 ┤           \                 180 days: 0.78 (85% of original)
│     │            \
│     │             \
│ 0.6 ┤              ●──────        365 days: 0.64 (70% of original)
│     │                \
│     │                 \
│ 0.5 ┤                  \          450 days: 0.57 (below threshold)
│     │                   \
│     │                    ●────────  600 days: 0.46 (archived)
│     └────┬─────┬─────┬─────┬─────┬─────┬──────> Days
│          0    90   180   270   365   450   600

Cleanup Rules:
- confidence < 0.50: Archive immediately
- confidence < 0.70 & age > 90 days: Remove from active contexts
- confidence ≥ 0.80 & success_count ≥ 10: Manual review (may be timeless)

═══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                 PATTERN DETECTION (WEEKLY)                          │
└─────────────────────────────────────────────────────────────────────┘

Weekly Cron Job: Analyze last 30 days of reflections

┌─────────────────────────────────────────────────────────────────────┐
│ Pattern Analyzer                                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. Query: context_reflections (last 30 days)                       │
│  2. Group by: tags, domain, failure reasons                         │
│  3. Detect:                                                         │
│     - Recurring failures (≥3 occurrences)                           │
│     - Common anti-patterns                                          │
│     - Systemic issues                                               │
│                                                                     │
│  Example Output:                                                    │
│  ┌────────────────────────────────────────────────────────┐         │
│  │ 🚨 Recurring Issue Detected                             │         │
│  │                                                         │         │
│  │ Issue: "Security headers missing"                      │         │
│  │ Occurrences: 5 sprints (frontend domain)               │         │
│  │ Impact: Forced ITERATE in 4/5 cases                    │         │
│  │                                                         │         │
│  │ Recommendation:                                         │         │
│  │ - Create security-headers skill                        │         │
│  │ - Add to frontend-engineer default context             │         │
│  │ - Update reviewer checklist                            │         │
│  │                                                         │         │
│  │ Affected Sprints:                                       │         │
│  │ - auth-ui-001, dashboard-002, profile-page-003...      │         │
│  └────────────────────────────────────────────────────────┘         │
│                                                                     │
│  4. Generate: docs/SYSTEMIC_IMPROVEMENTS.md                         │
│  5. Notify: Product Owner for review                                │
└─────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                    QUICK REFERENCE: ACE COMMANDS                    │
└─────────────────────────────────────────────────────────────────────┘

/cfn:context-reflect
  └─ Extract lessons from recent sprint
  └─ Usage: /cfn:context-reflect --task-id auth-001 --auto-curate

/cfn:context-query
  └─ Find similar past contexts
  └─ Usage: /cfn:context-query --keywords "auth,JWT" --max-results 5

/cfn:context-inject
  └─ Inject historical context into task
  └─ Usage: /cfn:context-inject --task-id new-task --historical-context {...}

/cfn:context-curate
  └─ Merge reflections into adaptive context
  └─ Usage: /cfn:context-curate --reflections file1.json,file2.json

/cfn:context-stats
  └─ Query reflection statistics
  └─ Usage: /cfn:context-stats --domain backend --since 30days

═══════════════════════════════════════════════════════════════════════
