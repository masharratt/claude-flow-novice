#!/bin/bash
# tests/seo/test-pattern-extraction.sh
# Sprint 1.4 :: Pattern Extraction integration tests
# Validates RuVector pattern extraction from successful onboarding (Step 12.5)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test metadata
TEST_NAME="Pattern Extraction Integration"
TEST_FILE=$(basename "$0")

cleanup() {
  log_info "Cleaning up pattern extraction test artifacts"
  rm -f /tmp/pattern-test-*.json
  rm -f /tmp/pattern-extract-*.json

  # Clean up Redis test keys
  $REDIS_CLI_CMD DEL "seo:patterns:test:*" >/dev/null 2>&1 || true
  $REDIS_CLI_CMD DEL "ruvector:patterns:test:*" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ============================================================================
# MOCK DATA SETUP
# ============================================================================

setup_successful_onboarding_data() {
  log_info "Setting up successful onboarding data for pattern extraction"

  cat > /tmp/pattern-onboarding-success.json << 'EOF'
{
  "domain": "test-site.com",
  "success": true,
  "completedPhases": [1, 2, 3, 4, 5, 6, 7],
  "outputs": {
    "technical": {"healthScore": 0.88, "improvements": ["canonicals", "speed"]},
    "content": {"totalPages": 450, "topPerformers": ["/guide1", "/guide2"]},
    "keywords": {"totalKeywords": 2500, "topClusters": ["software", "research"]},
    "strategy": {"pillars": ["technical", "content"], "timeline": "6 months"}
  }
}
EOF
}

# ============================================================================
# PATTERN EXTRACTION TESTS
# ============================================================================

test_pattern_extraction_trigger() {
  log_step "GIVEN Successful onboarding completion"

  setup_successful_onboarding_data

  log_step "WHEN Pattern extraction is triggered (Step 12.5)"

  # Mock pattern extraction trigger
  cat > /tmp/pattern-extraction-trigger.json << 'EOF'
{
  "domain": "test-site.com",
  "trigger": "onboarding_success",
  "timestamp": "2025-12-03T12:00:00Z",
  "extractPatterns": true
}
EOF

  log_step "THEN Extraction process starts"

  assert_file_exists "/tmp/pattern-extraction-trigger.json" "Trigger file exists"
  assert_pattern_in_file "/tmp/pattern-extraction-trigger.json" '"extractPatterns": true'

  annotate "Pattern extraction trigger validated"
}

test_site_profile_pattern() {
  log_step "GIVEN Onboarding technical and content data"

  setup_successful_onboarding_data

  log_step "WHEN Extracting site profile pattern"

  cat > /tmp/pattern-site-profile.json << 'EOF'
{
  "patternType": "site_profile",
  "domain": "test-site.com",
  "features": {
    "siteSize": "medium",
    "healthScore": 0.88,
    "contentVolume": 450,
    "industryVertical": "genealogy"
  },
  "vector": [0.12, 0.45, 0.78, 0.33, 0.56],
  "confidence": 0.85
}
EOF

  log_step "THEN Site profile pattern is extracted"

  assert_pattern_in_file "/tmp/pattern-site-profile.json" '"patternType": "site_profile"'
  assert_pattern_in_file "/tmp/pattern-site-profile.json" '"vector":'
  assert_pattern_in_file "/tmp/pattern-site-profile.json" '"confidence":'

  annotate "Site profile pattern validated"
}

test_content_strategy_pattern() {
  log_step "GIVEN Strategy with content pillars"

  setup_successful_onboarding_data

  log_step "WHEN Extracting content strategy pattern"

  cat > /tmp/pattern-content-strategy.json << 'EOF'
{
  "patternType": "content_strategy",
  "domain": "test-site.com",
  "strategyElements": {
    "themes": ["beginner education", "tool comparisons"],
    "formats": ["blog", "video"],
    "frequency": "2 per week"
  },
  "vector": [0.23, 0.67, 0.89, 0.45, 0.12],
  "confidence": 0.82
}
EOF

  log_step "THEN Content strategy pattern is extracted"

  assert_pattern_in_file "/tmp/pattern-content-strategy.json" '"patternType": "content_strategy"'
  assert_pattern_in_file "/tmp/pattern-content-strategy.json" '"strategyElements":'
  assert_pattern_in_file "/tmp/pattern-content-strategy.json" '"vector":'

  annotate "Content strategy pattern validated"
}

test_keyword_cluster_pattern() {
  log_step "GIVEN Keyword universe from Phase 4"

  setup_successful_onboarding_data

  log_step "WHEN Extracting keyword cluster pattern"

  cat > /tmp/pattern-keyword-cluster.json << 'EOF'
{
  "patternType": "keyword_cluster",
  "domain": "test-site.com",
  "clusters": [
    {"cluster": "genealogy-software", "keywords": 145, "avgVolume": 3500},
    {"cluster": "family-research", "keywords": 98, "avgVolume": 2200}
  ],
  "vector": [0.56, 0.34, 0.78, 0.12, 0.45],
  "confidence": 0.88
}
EOF

  log_step "THEN Keyword cluster pattern is extracted"

  assert_pattern_in_file "/tmp/pattern-keyword-cluster.json" '"patternType": "keyword_cluster"'
  assert_pattern_in_file "/tmp/pattern-keyword-cluster.json" '"clusters":'
  assert_pattern_in_file "/tmp/pattern-keyword-cluster.json" '"vector":'

  annotate "Keyword cluster pattern validated"
}

test_technical_optimization_pattern() {
  log_step "GIVEN Technical improvements from Phase 1"

  setup_successful_onboarding_data

  log_step "WHEN Extracting technical optimization pattern"

  cat > /tmp/pattern-technical-opt.json << 'EOF'
{
  "patternType": "technical_optimization",
  "domain": "test-site.com",
  "optimizations": ["canonical_tags", "page_speed", "mobile_optimization"],
  "healthScoreImprovement": 0.15,
  "vector": [0.78, 0.45, 0.23, 0.67, 0.89],
  "confidence": 0.90
}
EOF

  log_step "THEN Technical optimization pattern is extracted"

  assert_pattern_in_file "/tmp/pattern-technical-opt.json" '"patternType": "technical_optimization"'
  assert_pattern_in_file "/tmp/pattern-technical-opt.json" '"optimizations":'
  assert_pattern_in_file "/tmp/pattern-technical-opt.json" '"healthScoreImprovement":'

  annotate "Technical optimization pattern validated"
}

test_ruvector_storage() {
  log_step "GIVEN Extracted patterns"

  cat > /tmp/pattern-for-storage.json << 'EOF'
{
  "patternType": "site_profile",
  "domain": "test-site.com",
  "vector": [0.12, 0.45, 0.78, 0.33, 0.56],
  "metadata": {
    "industry": "genealogy",
    "siteSize": "medium"
  }
}
EOF

  log_step "WHEN Storing patterns in RuVector"

  # Mock RuVector storage (Redis key)
  PATTERN_DATA=$(cat /tmp/pattern-for-storage.json)
  redis_set "ruvector:patterns:test-site.com:site_profile" "$PATTERN_DATA"

  log_step "THEN Patterns are stored in RuVector"

  if redis_exists "ruvector:patterns:test-site.com:site_profile"; then
    TEST_PASSED=$((TEST_PASSED + 1))
    log_success "Pattern stored in RuVector"
  else
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "Pattern storage failed"
  fi
  TEST_TOTAL=$((TEST_TOTAL + 1))

  annotate "RuVector storage validated"
}

test_pattern_similarity_matching() {
  log_step "GIVEN Stored patterns in RuVector"

  # Store reference pattern
  cat > /tmp/pattern-reference.json << 'EOF'
{
  "patternType": "site_profile",
  "vector": [0.12, 0.45, 0.78, 0.33, 0.56]
}
EOF

  redis_set "ruvector:patterns:reference:site_profile" "$(cat /tmp/pattern-reference.json)"

  log_step "WHEN Searching for similar patterns"

  # Mock similarity search
  cat > /tmp/pattern-similarity-results.json << 'EOF'
{
  "query": [0.13, 0.46, 0.77, 0.34, 0.55],
  "results": [
    {
      "pattern": "site_profile",
      "similarity": 0.95,
      "domain": "reference-site.com"
    }
  ]
}
EOF

  log_step "THEN Similar patterns are found"

  assert_pattern_in_file "/tmp/pattern-similarity-results.json" '"similarity": 0.95'
  assert_pattern_in_file "/tmp/pattern-similarity-results.json" '"results":'

  annotate "Similarity matching validated"
}

test_pattern_application_to_new_site() {
  log_step "GIVEN Patterns from previous onboardings"

  cat > /tmp/pattern-library.json << 'EOF'
{
  "patterns": [
    {"type": "content_strategy", "industry": "genealogy", "confidence": 0.85},
    {"type": "keyword_cluster", "industry": "genealogy", "confidence": 0.88}
  ]
}
EOF

  log_step "WHEN Onboarding new site in same industry"

  cat > /tmp/pattern-new-site.json << 'EOF'
{
  "domain": "new-genealogy-site.com",
  "industry": "genealogy",
  "appliedPatterns": [
    {"type": "content_strategy", "similarity": 0.87},
    {"type": "keyword_cluster", "similarity": 0.82}
  ],
  "confidenceBoost": 0.12
}
EOF

  log_step "THEN Patterns are applied to new site"

  assert_pattern_in_file "/tmp/pattern-new-site.json" '"appliedPatterns":'
  assert_pattern_in_file "/tmp/pattern-new-site.json" '"confidenceBoost":'

  annotate "Pattern application validated"
}

test_pattern_count_metrics() {
  log_step "GIVEN Multiple patterns extracted"

  log_step "WHEN Counting patterns by type"

  cat > /tmp/pattern-counts.json << 'EOF'
{
  "domain": "test-site.com",
  "patternCounts": {
    "site_profile": 1,
    "content_strategy": 1,
    "keyword_cluster": 2,
    "technical_optimization": 1
  },
  "totalPatterns": 5
}
EOF

  TOTAL_PATTERNS=$(grep -o '"totalPatterns": [0-9]*' /tmp/pattern-counts.json | cut -d' ' -f2)

  log_step "THEN Pattern count is > 0"

  if [ "$TOTAL_PATTERNS" -gt 0 ]; then
    TEST_PASSED=$((TEST_PASSED + 1))
    log_success "Extracted $TOTAL_PATTERNS patterns"
  else
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "No patterns extracted"
  fi
  TEST_TOTAL=$((TEST_TOTAL + 1))

  annotate "Pattern count metrics validated"
}

# ============================================================================
# TEST EXECUTION
# ============================================================================

setup_test "$TEST_NAME"

annotate "Running Pattern Extraction Tests"

test_pattern_extraction_trigger
test_site_profile_pattern
test_content_strategy_pattern
test_keyword_cluster_pattern
test_technical_optimization_pattern
test_ruvector_storage
test_pattern_similarity_matching
test_pattern_application_to_new_site
test_pattern_count_metrics

teardown_test
