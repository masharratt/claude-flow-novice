---
description: View adaptive context statistics, health metrics, and bullet analytics
tags: [context, ace, stats, analytics, health]
---

# Context Statistics Command

View statistics about adaptive context bullets in the database.

**Usage:**
```bash
/context-stats [--query=<type>] [--limit=<N>]
```

**What This Does:**
Queries the `adaptive_context` and related tables for statistics.

**Arguments:**
- `--query=<type>`: Query type (reflections|insights|summary) (default: summary)
- `--limit=<N>`: Maximum results (default: 100)
- `--category=<type>`: Filter by bullet category
- `--min-confidence=<0.0-1.0>`: Filter by minimum confidence

**Implementation:**
Execute the ACE stats script directly:

```bash
# Query summary
./.claude/skills/cfn-ace-system/invoke-context-stats.sh --query summary

# Query all bullets
sqlite3 ./.artifacts/database/swarm-memory.db "
SELECT
  category,
  COUNT(*) as count,
  AVG(confidence_score) as avg_confidence,
  SUM(helpful_count) as total_helpful,
  SUM(harmful_count) as total_harmful
FROM adaptive_context
WHERE is_active = 1
GROUP BY category
ORDER BY count DESC;
"

# Get top bullets
sqlite3 ./.artifacts/database/swarm-memory.db "
SELECT bullet_id, category, confidence_score, helpful_count, harmful_count, content
FROM adaptive_context
WHERE is_active = 1
ORDER BY helpful_count DESC, confidence_score DESC
LIMIT 10;
"
```

**Output Example:**

```
═══════════════════════════════════════════════════════════════
📊 ADAPTIVE CONTEXT HEALTH REPORT
═══════════════════════════════════════════════════════════════

Period: Last 30 days (2025-09-13 to 2025-10-13)
Project: claude-flow-novice | Swarm: swarm-phase-0

───────────────────────────────────────────────────────────────
📈 BULLET STATISTICS
───────────────────────────────────────────────────────────────

Total Bullets:           127
  └─ Active:             118 (92.9%)
  └─ Archived:            9 (7.1%)

By Category:
  • Strategy:             42 (35.6%)  ⭐ Most common
  • Pattern:              38 (32.2%)
  • Edge Case:            21 (17.8%)
  • Domain Insight:       12 (10.2%)
  • Optimization:          5 (4.2%)
  • Anti-Pattern:          0 (0.0%)   ✅ None identified

By Confidence:
  • High (≥0.8):          67 (56.8%)  ⭐ Strong validation
  • Medium (0.6-0.8):     43 (36.4%)
  • Low (<0.6):            8 (6.8%)   ⚠️  Needs validation

By Priority:
  • Critical (9-10):      15 (12.7%)
  • High (7-8):           48 (40.7%)
  • Medium (5-6):         42 (35.6%)
  • Low (1-4):            13 (11.0%)

───────────────────────────────────────────────────────────────
💡 USAGE PATTERNS
───────────────────────────────────────────────────────────────

Total Usage Events:      1,847 (past 30 days)
  └─ Helpful:           1,623 (87.9%)  ⭐ Excellent
  └─ Harmful:              42 (2.3%)
  └─ Neutral:             182 (9.8%)

Most Used Bullets:
  1. [STRAT-042] CFN Loop coordination      (89 uses, 0.92 confidence)
  2. [STRAT-001] Phone contacts identity    (67 uses, 0.95 confidence)
  3. [PATTERN-017] API pagination           (54 uses, 0.88 confidence)
  4. [EDGE-044] SQLite ACL boundaries       (48 uses, 0.75 confidence)
  5. [STRAT-033] Redis pub/sub patterns     (41 uses, 0.85 confidence)

Least Used Bullets (>90 days):
  ⚠️  [PATTERN-008] Legacy module pattern   (0 uses, 0.60 confidence)
  ⚠️  [EDGE-012] Edge case description      (1 use, 0.55 confidence)
  💡 Recommendation: Review for archival

Most Improved Bullets:
  1. [STRAT-042] +15 helpful, confidence 0.70→0.92  ⭐
  2. [PATTERN-017] +9 helpful, confidence 0.75→0.88
  3. [EDGE-044] +5 helpful, confidence 0.65→0.75

Declining Bullets:
  ⚠️  [PATTERN-012] +4 harmful, confidence 0.80→0.65
  💡 Recommendation: Investigate or archive

───────────────────────────────────────────────────────────────
🔄 CURATION ACTIVITY
───────────────────────────────────────────────────────────────

Total Reflections:       34 (past 30 days)
  └─ Processed:          31 (91.2%)
  └─ Pending:             3 (8.8%)

Total Merge Actions:     127
  • New bullets added:    18 (14.2%)
  • Helpful increments:   82 (64.6%)
  • Harmful increments:   12 (9.4%)
  • Merges/consolidations: 8 (6.3%)
  • Archives:              7 (5.5%)

Avg Time to Curation:    2.3 hours
Avg Bullets per Reflection: 3.7

Recent Curation Highlights:
  • 2025-10-13: Merged STRAT-001 + STRAT-042 (similarity 0.91)
  • 2025-10-12: Archived ANTI-013 (harmful_count >= 5)
  • 2025-10-11: Added 5 new security patterns from phase-2 reflection

───────────────────────────────────────────────────────────────
🎯 QUALITY METRICS
───────────────────────────────────────────────────────────────

Average Confidence:      0.78  ⭐ Good
  └─ Trend (30d):        ↗️  +0.05 (improving)

Helpful/Harmful Ratio:   38.6:1  ⭐ Excellent
  └─ Benchmark:          >20:1 recommended

Validation Coverage:     85.6%
  └─ Bullets validated:  101 / 118
  └─ Pending validation: 17   ⚠️  Review queue

Tag Coverage:            96.6%
  └─ Well-tagged (≥3):   114 / 118
  └─ Under-tagged (<3):   4    ⚠️  Needs tagging

───────────────────────────────────────────────────────────────
🔍 INSIGHTS & RECOMMENDATIONS
───────────────────────────────────────────────────────────────

✅ STRENGTHS:
  • High helpful/harmful ratio (38.6:1)
  • Strong confidence trend (+0.05 over 30d)
  • Good usage distribution across categories
  • Fast curation cycle (2.3h average)

⚠️  AREAS FOR IMPROVEMENT:
  • 8 bullets with low confidence (<0.6) need validation
  • 2 bullets unused for >90 days should be reviewed
  • 17 bullets pending validation (backlog building)
  • 4 bullets under-tagged (reduces discoverability)

💡 RECOMMENDATIONS:

1. **Immediate Actions:**
   - Run `/context-curate --maintenance` to deduplicate
   - Review low-confidence bullets: EDGE-012, PATTERN-008
   - Archive unused bullets: PATTERN-008 (90+ days, 0 uses)
   - Validate pending bullets: Run `/context-validate --pending`

2. **Phase-Specific Focus:**
   - Phase 2 (Security): Add more security patterns (only 5 currently)
   - Phase 3 (Deployment): Add deployment/monitoring bullets (0 currently)

3. **Optimization Opportunities:**
   - Enable semantic similarity (embeddings) for better deduplication
   - Set up auto-validation for bullets with helpful_count ≥ 10
   - Configure periodic maintenance curation (weekly)

4. **Top Bullets to Inject:**
   For current phase (phase-0-foundation):
   - [STRAT-042] CFN Loop coordination (0.92 confidence, 89 uses)
   - [STRAT-001] Phone contacts identity (0.95 confidence, 67 uses)
   - [PATTERN-017] API pagination (0.88 confidence, 54 uses)

───────────────────────────────────────────────────────────────
📌 QUICK ACTIONS
───────────────────────────────────────────────────────────────

# Run maintenance curation
/context-curate --maintenance --auto-merge

# Inject top bullets into CLAUDE.md
/context-inject --min-confidence=0.8 --min-helpful=10 --limit=15

# Query underused bullets
/context-query --max-usage=1 --min-confidence=0.5

# Validate pending bullets
/context-validate --pending --auto-approve-threshold=0.85

───────────────────────────────────────────────────────────────
```

**JSON Output:**
```json
{
  "period": {
    "start": "2025-09-13",
    "end": "2025-10-13",
    "days": 30
  },
  "bullets": {
    "total": 127,
    "active": 118,
    "archived": 9,
    "by_category": {
      "strategy": 42,
      "pattern": 38,
      "edge_case": 21,
      "domain_insight": 12,
      "optimization": 5,
      "anti_pattern": 0
    },
    "by_confidence": {
      "high": 67,
      "medium": 43,
      "low": 8
    }
  },
  "usage": {
    "total_events": 1847,
    "helpful": 1623,
    "harmful": 42,
    "neutral": 182,
    "helpful_harmful_ratio": 38.6
  },
  "quality_metrics": {
    "avg_confidence": 0.78,
    "confidence_trend": 0.05,
    "validation_coverage": 0.856,
    "tag_coverage": 0.966
  },
  "recommendations": [
    {
      "priority": "high",
      "action": "Run maintenance curation",
      "command": "/context-curate --maintenance"
    }
  ]
}
```

**Trend Analysis:**
Track confidence evolution over time:
```sql
SELECT
    DATE(updated_at) as date,
    AVG(confidence_score) as avg_confidence,
    COUNT(*) as bullet_count
FROM adaptive_context
WHERE is_active = 1
GROUP BY DATE(updated_at)
ORDER BY date DESC
LIMIT 30;
```

**Health Checks:**
Automated health validation:
- ✅ **Healthy**: helpful/harmful ratio > 20:1, avg confidence > 0.75
- ⚠️  **Warning**: ratio 10-20:1, avg confidence 0.6-0.75
- ❌ **Critical**: ratio < 10:1, avg confidence < 0.6

**See Also:**
- `/context-query` - Search bullets
- `/context-curate` - Run maintenance curation
- `/context-inject` - Inject top bullets into CLAUDE.md
- `/context-validate` - Validate pending bullets
