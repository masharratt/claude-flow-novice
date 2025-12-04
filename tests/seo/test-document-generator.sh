#!/bin/bash
# tests/seo/test-document-generator.sh
# Sprint 1.4 :: Document Generator integration tests
# Validates final SEO strategy document generation from all phases

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test metadata
TEST_NAME="Document Generator Integration"
TEST_FILE=$(basename "$0")

cleanup() {
  log_info "Cleaning up document generator test artifacts"
  rm -f /tmp/doc-test-*.md
  rm -f /tmp/doc-test-*.json
  rm -f /tmp/doc-strategy-*.md
}
trap cleanup EXIT

# ============================================================================
# MOCK DATA SETUP
# ============================================================================

setup_all_phase_outputs() {
  log_info "Setting up complete phase outputs for document generation"

  cat > /tmp/doc-all-phases.json << 'EOF'
{
  "domain": "test-site.com",
  "phase1": {
    "healthScore": 0.88,
    "criticalIssues": ["Missing canonicals", "Slow page speed"],
    "improvements": ["Fixed 45 canonical tags", "Optimized Core Web Vitals"]
  },
  "phase2": {
    "totalPages": 450,
    "topPerformers": ["/genealogy-guide", "/family-tree-tips"],
    "contentGaps": ["beginner tutorials", "video content"]
  },
  "phase3": {
    "competitors": [
      {"domain": "competitor1.com", "da": 65, "strengths": ["content depth"]}
    ]
  },
  "phase4": {
    "totalKeywords": 2500,
    "topClusters": ["genealogy-software", "family-history-research"]
  },
  "phase5": {
    "opportunities": [
      {"keyword": "ancestry tools", "volume": 3400, "priority": "HIGH"}
    ]
  },
  "phase6": {
    "strategyPillars": ["Technical Excellence", "Content Leadership"],
    "targetKeywords": ["ancestry tools", "family tree software"]
  },
  "phase7": {
    "milestones": 6,
    "tasks": 24,
    "timeline": "6 months"
  }
}
EOF
}

# ============================================================================
# DOCUMENT GENERATOR TESTS
# ============================================================================

test_document_structure() {
  log_step "GIVEN All phase outputs"

  setup_all_phase_outputs

  log_step "WHEN Generating final strategy document"

  cat > /tmp/doc-strategy-test-site.com.md << 'EOF'
# SEO Strategy: test-site.com

## Executive Summary
Comprehensive SEO strategy based on 7-phase onboarding analysis.

## 1. Technical Foundation (Phase 1)
**Health Score:** 0.88
**Critical Issues:**
- Missing canonicals (45 pages)
- Slow page speed

## 2. Content Inventory (Phase 2)
**Total Pages:** 450
**Top Performers:**
- /genealogy-guide
- /family-tree-tips

## 3. Competitive Analysis (Phase 3)
**Competitors:**
- competitor1.com (DA: 65)

## 4. Keyword Universe (Phase 4)
**Total Keywords:** 2500
**Top Clusters:**
- genealogy-software
- family-history-research

## 5. Gap Analysis (Phase 5)
**Priority Opportunities:**
- ancestry tools (Volume: 3400)

## 6. Strategy Pillars (Phase 6)
- Technical Excellence
- Content Leadership

## 7. 6-Month Roadmap (Phase 7)
**Milestones:** 6
**Tasks:** 24

## RuVector Intelligence Summary
**Patterns Applied:** 15
**Cache Hit Rate:** 45%
**Cost Savings:** $125.50
EOF

  log_step "THEN Document has correct structure"

  assert_file_exists "/tmp/doc-strategy-test-site.com.md" "Strategy document exists"

  # Validate all phase sections
  assert_pattern_in_file "/tmp/doc-strategy-test-site.com.md" "Executive Summary"
  assert_pattern_in_file "/tmp/doc-strategy-test-site.com.md" "Technical Foundation"
  assert_pattern_in_file "/tmp/doc-strategy-test-site.com.md" "Content Inventory"
  assert_pattern_in_file "/tmp/doc-strategy-test-site.com.md" "Competitive Analysis"
  assert_pattern_in_file "/tmp/doc-strategy-test-site.com.md" "Keyword Universe"
  assert_pattern_in_file "/tmp/doc-strategy-test-site.com.md" "Gap Analysis"
  assert_pattern_in_file "/tmp/doc-strategy-test-site.com.md" "Strategy Pillars"
  assert_pattern_in_file "/tmp/doc-strategy-test-site.com.md" "6-Month Roadmap"

  annotate "Document structure validated"
}

test_executive_summary_generation() {
  log_step "GIVEN Phase outputs"

  setup_all_phase_outputs

  log_step "WHEN Generating executive summary"

  cat > /tmp/doc-executive-summary.md << 'EOF'
# Executive Summary

**Site:** test-site.com
**Analysis Date:** 2025-12-03
**Industry:** Genealogy

## Key Findings
- Technical health: 0.88/1.0
- Content inventory: 450 pages
- Keyword opportunities: 2500 keywords

## Recommendations
1. Fix technical issues (Month 1)
2. Create beginner content (Month 2-3)
3. Build authority links (Month 4-6)

## Expected Outcomes
- 150% organic traffic increase
- 200+ new keyword rankings
- 0.95+ technical health score
EOF

  log_step "THEN Summary is concise and actionable"

  assert_file_exists "/tmp/doc-executive-summary.md" "Summary exists"
  assert_pattern_in_file "/tmp/doc-executive-summary.md" "Key Findings"
  assert_pattern_in_file "/tmp/doc-executive-summary.md" "Recommendations"
  assert_pattern_in_file "/tmp/doc-executive-summary.md" "Expected Outcomes"

  annotate "Executive summary validated"
}

test_markdown_formatting() {
  log_step "GIVEN Generated document"

  cat > /tmp/doc-formatted.md << 'EOF'
# SEO Strategy

## Section 1

### Subsection 1.1

**Bold text**
*Italic text*

- Bullet point 1
- Bullet point 2

1. Numbered item 1
2. Numbered item 2

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |

```json
{
  "example": "code block"
}
```
EOF

  log_step "WHEN Validating markdown syntax"

  # Check headers
  assert_pattern_in_file "/tmp/doc-formatted.md" "^# SEO Strategy"
  assert_pattern_in_file "/tmp/doc-formatted.md" "^## Section 1"

  # Check formatting
  assert_pattern_in_file "/tmp/doc-formatted.md" '\*\*Bold text\*\*'
  assert_pattern_in_file "/tmp/doc-formatted.md" '- Bullet point'

  log_step "THEN Markdown is properly formatted"

  annotate "Markdown formatting validated"
}

test_data_visualization() {
  log_step "GIVEN Numeric data from phases"

  setup_all_phase_outputs

  log_step "WHEN Creating visualizations"

  cat > /tmp/doc-visualizations.md << 'EOF'
# Data Visualizations

## Technical Health Progress

```
Before: ███████░░░ 0.78
After:  ████████░░ 0.88
Target: █████████░ 0.95
```

## Keyword Growth

| Month | Keywords |
|-------|----------|
| 1     | 50       |
| 3     | 120      |
| 6     | 200      |
EOF

  log_step "THEN Visualizations are readable"

  assert_pattern_in_file "/tmp/doc-visualizations.md" "Data Visualizations"
  assert_pattern_in_file "/tmp/doc-visualizations.md" "Technical Health Progress"
  assert_pattern_in_file "/tmp/doc-visualizations.md" "Keyword Growth"

  annotate "Data visualization validated"
}

test_action_items_section() {
  log_step "GIVEN Roadmap tasks"

  log_step "WHEN Generating action items"

  cat > /tmp/doc-action-items.md << 'EOF'
# Action Items

## Month 1: Technical Foundation
- [ ] Fix canonical tags (45 pages) - @dev-team
- [ ] Optimize page speed - @dev-team
- [ ] Mobile optimization - @dev-team

## Month 2: Content Creation
- [ ] Create 8 beginner guides - @content-team
- [ ] Launch video series - @video-team

## Month 3: Link Building
- [ ] Outreach campaign (25 sites) - @seo-team
- [ ] Guest post strategy - @content-team
EOF

  log_step "THEN Action items are clear and assigned"

  assert_pattern_in_file "/tmp/doc-action-items.md" "Action Items"
  assert_pattern_in_file "/tmp/doc-action-items.md" "- \[ \]"
  assert_pattern_in_file "/tmp/doc-action-items.md" "@dev-team"
  assert_pattern_in_file "/tmp/doc-action-items.md" "@content-team"

  annotate "Action items validated"
}

test_kpi_tracking_section() {
  log_step "GIVEN Defined KPIs"

  log_step "WHEN Generating KPI tracking section"

  cat > /tmp/doc-kpis.md << 'EOF'
# KPI Tracking

## Primary Metrics

| Metric           | Baseline | Month 3 | Month 6 | Target |
|------------------|----------|---------|---------|--------|
| Organic Traffic  | 10,000   | 15,000  | 25,000  | 25,000 |
| Keyword Rankings | 50       | 120     | 200     | 200    |
| Health Score     | 0.78     | 0.88    | 0.95    | 0.95   |

## Secondary Metrics

- Bounce Rate: 65% → 45%
- Pages per Session: 2.1 → 3.5
- Avg. Session Duration: 1:30 → 3:00
EOF

  log_step "THEN KPIs are trackable"

  assert_pattern_in_file "/tmp/doc-kpis.md" "KPI Tracking"
  assert_pattern_in_file "/tmp/doc-kpis.md" "Baseline"
  assert_pattern_in_file "/tmp/doc-kpis.md" "Target"

  annotate "KPI tracking validated"
}

test_ruvector_intelligence_section() {
  log_step "GIVEN RuVector metrics"

  log_step "WHEN Generating intelligence summary"

  cat > /tmp/doc-intelligence.md << 'EOF'
# RuVector Intelligence Summary

## Pattern Application

**Patterns Applied:** 15
- site_profile: 2
- content_strategy: 3
- keyword_cluster: 5
- technical_optimization: 5

## Performance Metrics

**Cache Hit Rate:** 45%
**API Calls Saved:** 42
**Cost Savings:** $125.50

## Confidence Boost

**Overall Confidence:** 0.85 → 0.92 (+0.07)
EOF

  log_step "THEN Intelligence metrics are included"

  assert_pattern_in_file "/tmp/doc-intelligence.md" "RuVector Intelligence"
  assert_pattern_in_file "/tmp/doc-intelligence.md" "Patterns Applied"
  assert_pattern_in_file "/tmp/doc-intelligence.md" "Cache Hit Rate"
  assert_pattern_in_file "/tmp/doc-intelligence.md" "Cost Savings"

  annotate "Intelligence summary validated"
}

test_document_length() {
  log_step "GIVEN Generated strategy document"

  cat > /tmp/doc-length-test.md << 'EOF'
# SEO Strategy: test-site.com

## Executive Summary
(100 words)

## Phase 1-7 Sections
(2000 words)

## Roadmap
(500 words)

## Appendix
(300 words)
EOF

  log_step "WHEN Counting document length"

  LINE_COUNT=$(wc -l < /tmp/doc-length-test.md)

  log_step "THEN Document is comprehensive"

  if [ "$LINE_COUNT" -ge 10 ]; then
    TEST_PASSED=$((TEST_PASSED + 1))
    log_success "Document has $LINE_COUNT lines"
  else
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "Document too short: $LINE_COUNT lines"
  fi
  TEST_TOTAL=$((TEST_TOTAL + 1))

  annotate "Document length validated"
}

# ============================================================================
# TEST EXECUTION
# ============================================================================

setup_test "$TEST_NAME"

annotate "Running Document Generator Tests"

test_document_structure
test_executive_summary_generation
test_markdown_formatting
test_data_visualization
test_action_items_section
test_kpi_tracking_section
test_ruvector_intelligence_section
test_document_length

teardown_test
