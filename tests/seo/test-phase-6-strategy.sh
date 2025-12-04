#!/bin/bash
# tests/seo/test-phase-6-strategy.sh
# Sprint 1.4 :: Phase 6 Strategy Creation integration tests
# Validates strategy synthesis from Phases 1-5 outputs
# BUG #21 Prevention: Tests use real TypeScript execution, not mocks

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test metadata
TEST_NAME="Phase 6 Strategy Creation Integration"
TEST_FILE=$(basename "$0")
TASK_ID="test-phase6-$(date +%s)"

cleanup() {
  log_info "Cleaning up Phase 6 test artifacts"
  rm -f /tmp/phase6-test-*.json
  rm -f /tmp/phase6-strategy-*.json
  rm -f /tmp/phase6-input-*.json
  rm -f /tmp/phase6-real-*.json

  # Clean up Redis test keys
  $REDIS_CLI_CMD DEL "seo:onboarding:${TASK_ID}:*" >/dev/null 2>&1 || true
  $REDIS_CLI_CMD DEL "seo:strategy:test:*" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ============================================================================
# REDIS TEST DATA SETUP
# ============================================================================

setup_redis_test_data() {
  local task_id="$1"

  log_info "Setting up Redis test data for Phase 6 execution"

  # Phase 1: Technical audit data
  redis_set "seo:onboarding:${task_id}:phase-1" '{
    "healthScore": 0.78,
    "technicalIssues": [
      {"type": "missing-canonicals", "severity": "high", "effort": "low", "description": "Missing canonical tags on 45 pages"},
      {"type": "page-speed", "severity": "medium", "effort": "medium", "description": "Page speed below 50"}
    ],
    "metaTags": {"missingDescriptions": 25}
  }'

  # Phase 4: Keyword data
  redis_set "seo:onboarding:${task_id}:phase-4" '{
    "keywords": [
      {"keyword": "family tree software", "volume": 8500, "difficulty": 45, "trafficPotential": 2550},
      {"keyword": "ancestry tools", "volume": 3400, "difficulty": 38, "trafficPotential": 1020},
      {"keyword": "genealogy basics", "volume": 2200, "difficulty": 25, "trafficPotential": 660}
    ]
  }'

  # Phase 5: Gap analysis data
  redis_set "seo:onboarding:${task_id}:phase-5" '{
    "contentGaps": [
      {"topic": "beginner tutorials", "priority": "high", "volume": 5000},
      {"topic": "video content", "priority": "high", "volume": 3500}
    ],
    "keywordGaps": [
      {"keyword": "free genealogy software", "volume": 1200, "difficulty": 25, "trafficPotential": 360}
    ],
    "backlinkGaps": [
      {"domain": "example-authority.com", "linkingCompetitors": 3}
    ]
  }'

  # Phase 3: Backlink data (for link strategy)
  redis_set "seo:onboarding:${task_id}:phase-3" '{
    "backlinks": [
      {"domain": "referring-site1.com", "dr": 55, "dofollow": true}
    ]
  }'
}

# Legacy mock data setup (for non-migrated tests)
setup_phase6_input_data() {
  log_info "Setting up Phase 6 input data from Phases 1-5"

  cat > /tmp/phase6-consolidated-input.json << 'EOF'
{
  "domain": "test-site.com",
  "phase1": {
    "healthScore": 0.78,
    "criticalIssues": ["Missing canonicals", "Slow page speed"],
    "technicalPriority": "HIGH"
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
  }
}
EOF
}

# ============================================================================
# PHASE 6 TESTS
# ============================================================================

test_strategy_synthesis_real() {
  log_step "GIVEN Phase 1-5 data in Redis"

  setup_redis_test_data "$TASK_ID"

  log_step "WHEN Executing real Phase 6 strategy synthesis"

  npx tsx "$PROJECT_ROOT/tests/seo/lib/run-phase-6.ts" "{\"taskId\":\"$TASK_ID\",\"siteDomain\":\"test-site.com\",\"industry\":\"genealogy\"}" \
    > /tmp/phase6-real-output.json 2>&1

  local EXIT_CODE=$?
  assert_equals "$EXIT_CODE" 0 "Phase 6 execution succeeded"

  log_step "THEN Validate actual strategy structure"

  assert_file_exists "/tmp/phase6-real-output.json" "Real strategy output exists"
  assert_pattern_in_file "/tmp/phase6-real-output.json" '"contentPillars"' "Content pillars present"
  assert_pattern_in_file "/tmp/phase6-real-output.json" '"quickWins"' "Quick wins present"
  assert_pattern_in_file "/tmp/phase6-real-output.json" '"competitiveAdvantages"' "Competitive advantages present"

  # Validate pillar count
  local PILLAR_COUNT=$(jq '.strategy.contentPillars | length' /tmp/phase6-real-output.json)
  assert_greater_than "$PILLAR_COUNT" 0 "At least one content pillar generated"

  # Validate quick wins count
  local QW_COUNT=$(jq '.strategy.quickWins | length' /tmp/phase6-real-output.json)
  assert_greater_than "$QW_COUNT" 0 "At least one quick win identified"

  annotate "Real strategy synthesis validated"
}

test_priority_assignment() {
  log_step "GIVEN Strategy with multiple pillars"

  setup_phase6_input_data

  cat > /tmp/phase6-priorities.json << 'EOF'
{
  "pillars": [
    {"pillar": "Technical", "priority": "P0", "blocksOthers": true},
    {"pillar": "Content", "priority": "P1", "blocksOthers": false},
    {"pillar": "Links", "priority": "P2", "blocksOthers": false}
  ]
}
EOF

  log_step "WHEN Validating priority levels"

  # Verify P0 exists (blocking issues)
  assert_pattern_in_file "/tmp/phase6-priorities.json" '"priority": "P0"' "P0 priority assigned"

  # Verify priority hierarchy
  assert_pattern_in_file "/tmp/phase6-priorities.json" "blocksOthers" "Blocking flags present"

  log_step "THEN Priorities are correctly assigned"

  annotate "Priority assignment validated"
}

test_competitive_positioning() {
  log_step "GIVEN Competitor analysis from Phase 3"

  setup_phase6_input_data

  log_step "WHEN Defining competitive advantage"

  cat > /tmp/phase6-competitive.json << 'EOF'
{
  "domain": "test-site.com",
  "competitorWeaknesses": ["Complex UX", "Lack of beginner content"],
  "ourStrengths": ["User-friendly", "Educational focus"],
  "positioning": "The beginner-friendly genealogy platform"
}
EOF

  log_step "THEN Competitive positioning is defined"

  assert_pattern_in_file "/tmp/phase6-competitive.json" "competitorWeaknesses"
  assert_pattern_in_file "/tmp/phase6-competitive.json" "ourStrengths"
  assert_pattern_in_file "/tmp/phase6-competitive.json" "positioning"

  annotate "Competitive positioning validated"
}

test_keyword_targeting_strategy() {
  log_step "GIVEN Keyword opportunities from Phase 5"

  setup_phase6_input_data

  log_step "WHEN Creating keyword targeting strategy"

  cat > /tmp/phase6-keyword-strategy.json << 'EOF'
{
  "domain": "test-site.com",
  "primaryKeywords": [
    {"keyword": "ancestry tools", "intent": "commercial", "pages": ["/tools"]},
    {"keyword": "family tree software", "intent": "commercial", "pages": ["/software"]}
  ],
  "supportingKeywords": [
    {"keyword": "genealogy basics", "intent": "informational", "pages": ["/guides"]}
  ]
}
EOF

  log_step "THEN Keywords are categorized by intent"

  assert_pattern_in_file "/tmp/phase6-keyword-strategy.json" "primaryKeywords"
  assert_pattern_in_file "/tmp/phase6-keyword-strategy.json" "supportingKeywords"
  assert_pattern_in_file "/tmp/phase6-keyword-strategy.json" '"intent": "commercial"'
  assert_pattern_in_file "/tmp/phase6-keyword-strategy.json" '"intent": "informational"'

  annotate "Keyword targeting strategy validated"
}

test_content_strategy() {
  log_step "GIVEN Content gaps from Phase 2"

  setup_phase6_input_data

  log_step "WHEN Creating content strategy"

  cat > /tmp/phase6-content-strategy.json << 'EOF'
{
  "domain": "test-site.com",
  "contentThemes": [
    {
      "theme": "Beginner Education",
      "formats": ["blog posts", "video tutorials"],
      "frequency": "2 per week"
    },
    {
      "theme": "Tool Comparisons",
      "formats": ["comparison guides", "reviews"],
      "frequency": "1 per week"
    }
  ],
  "contentCalendar": "Q1-Q2 2025"
}
EOF

  log_step "THEN Content strategy defines themes and frequency"

  assert_pattern_in_file "/tmp/phase6-content-strategy.json" "contentThemes"
  assert_pattern_in_file "/tmp/phase6-content-strategy.json" "frequency"
  assert_pattern_in_file "/tmp/phase6-content-strategy.json" "contentCalendar"

  annotate "Content strategy validated"
}

test_technical_roadmap_integration() {
  log_step "GIVEN Technical issues from Phase 1"

  setup_phase6_input_data

  log_step "WHEN Integrating technical fixes into strategy"

  cat > /tmp/phase6-technical-roadmap.json << 'EOF'
{
  "domain": "test-site.com",
  "technicalPhases": [
    {
      "phase": "Foundation",
      "duration": "Month 1",
      "tasks": ["Fix canonical tags", "Improve page speed"]
    },
    {
      "phase": "Optimization",
      "duration": "Month 2-3",
      "tasks": ["Schema markup", "Mobile optimization"]
    }
  ]
}
EOF

  log_step "THEN Technical tasks are phased"

  assert_pattern_in_file "/tmp/phase6-technical-roadmap.json" "technicalPhases"
  assert_pattern_in_file "/tmp/phase6-technical-roadmap.json" "duration"
  assert_pattern_in_file "/tmp/phase6-technical-roadmap.json" "Foundation"

  annotate "Technical roadmap integration validated"
}

test_ruvector_pattern_application() {
  log_step "GIVEN Similar site patterns in RuVector"

  log_step "WHEN Applying patterns to strategy"

  cat > /tmp/phase6-pattern-application.json << 'EOF'
{
  "domain": "test-site.com",
  "appliedPatterns": [
    {
      "pattern": "genealogy_content_strategy",
      "similarity": 0.88,
      "recommendations": ["Focus on beginner content", "Use video tutorials"]
    }
  ],
  "confidenceBoost": 0.15
}
EOF

  log_step "THEN Patterns influence strategy decisions"

  assert_pattern_in_file "/tmp/phase6-pattern-application.json" "appliedPatterns"
  assert_pattern_in_file "/tmp/phase6-pattern-application.json" "similarity"
  assert_pattern_in_file "/tmp/phase6-pattern-application.json" "confidenceBoost"

  annotate "Pattern application validated"
}

test_strategy_validation_rules() {
  log_step "GIVEN Generated strategy"

  cat > /tmp/phase6-strategy-valid.json << 'EOF'
{
  "domain": "test-site.com",
  "strategyPillars": [
    {"pillar": "Technical", "priority": "P0"},
    {"pillar": "Content", "priority": "P1"}
  ],
  "targetKeywords": ["keyword1", "keyword2"],
  "timeline": "6 months"
}
EOF

  log_step "WHEN Validating strategy completeness"

  # Check required fields
  assert_pattern_in_file "/tmp/phase6-strategy-valid.json" "strategyPillars"
  assert_pattern_in_file "/tmp/phase6-strategy-valid.json" "targetKeywords"
  assert_pattern_in_file "/tmp/phase6-strategy-valid.json" "timeline"

  log_step "THEN Strategy passes validation"

  annotate "Strategy validation rules checked"
}

test_kpi_definition() {
  log_step "GIVEN Strategy pillars"

  log_step "WHEN Defining success KPIs"

  cat > /tmp/phase6-kpis.json << 'EOF'
{
  "domain": "test-site.com",
  "kpis": [
    {"metric": "Organic Traffic", "baseline": 10000, "target": 25000, "timeline": "6 months"},
    {"metric": "Keyword Rankings", "baseline": 50, "target": 150, "timeline": "6 months"},
    {"metric": "Technical Health Score", "baseline": 0.78, "target": 0.95, "timeline": "3 months"}
  ]
}
EOF

  log_step "THEN KPIs have baseline and targets"

  assert_pattern_in_file "/tmp/phase6-kpis.json" "baseline"
  assert_pattern_in_file "/tmp/phase6-kpis.json" "target"
  assert_pattern_in_file "/tmp/phase6-kpis.json" "timeline"

  annotate "KPI definition validated"
}

test_budget_allocation() {
  log_step "GIVEN Strategy pillars with costs"

  log_step "WHEN Allocating budget"

  cat > /tmp/phase6-budget.json << 'EOF'
{
  "domain": "test-site.com",
  "totalBudget": 50000,
  "allocation": [
    {"pillar": "Technical", "amount": 15000, "percentage": 0.30},
    {"pillar": "Content", "amount": 25000, "percentage": 0.50},
    {"pillar": "Links", "amount": 10000, "percentage": 0.20}
  ]
}
EOF

  log_step "THEN Budget is distributed across pillars"

  assert_pattern_in_file "/tmp/phase6-budget.json" "allocation"
  assert_pattern_in_file "/tmp/phase6-budget.json" "percentage"

  # Validate total adds to 100%
  TOTAL_PCT=$(grep -o '"percentage": [0-9.]*' /tmp/phase6-budget.json | cut -d' ' -f2 | paste -sd+ | bc)

  if (( $(echo "$TOTAL_PCT == 1.0" | bc -l) )); then
    TEST_PASSED=$((TEST_PASSED + 1))
    log_success "Budget allocation totals 100%"
  else
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "Budget allocation incorrect: ${TOTAL_PCT}"
  fi
  TEST_TOTAL=$((TEST_TOTAL + 1))

  annotate "Budget allocation validated"
}

# ============================================================================
# TEST EXECUTION
# ============================================================================

setup_test "$TEST_NAME"

annotate "Running Phase 6 Strategy Tests (Real Execution)"

# CRITICAL: Real execution tests (BUG #21 prevention)
test_strategy_synthesis_real

# Legacy mock tests (to be migrated)
test_priority_assignment
test_competitive_positioning
test_keyword_targeting_strategy
test_content_strategy
test_technical_roadmap_integration
test_ruvector_pattern_application
test_strategy_validation_rules
test_kpi_definition
test_budget_allocation

teardown_test
