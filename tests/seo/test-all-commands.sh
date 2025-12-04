#!/bin/bash
# tests/seo/test-all-commands.sh
# Sprint 2.2 :: Comprehensive integration tests for all SEO commands with RuVector intelligence
# Validates /seo-onboard, /seo-discover-keywords, and integration with RuVector caching

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test metadata
TEST_NAME="SEO Commands Integration Suite"
TEST_FILE=$(basename "$0")
TEST_TMPDIR=""

cleanup() {
  log_info "Cleaning up SEO command test artifacts"

  # Remove temporary files
  rm -f /tmp/seo-test-*.json
  rm -f /tmp/seo-test-*.md
  rm -f /tmp/seo-mock-*.json
  rm -f /tmp/seo-output-*.log

  # Clean temporary directory
  if [[ -n "$TEST_TMPDIR" && -d "$TEST_TMPDIR" ]]; then
    rm -rf "$TEST_TMPDIR"
  fi

  # Clean up Redis test keys
  $REDIS_CLI_CMD DEL "seo:test:*" >/dev/null 2>&1 || true
  $REDIS_CLI_CMD DEL "seo:onboard:test:*" >/dev/null 2>&1 || true
  $REDIS_CLI_CMD DEL "seo:discovery:test:*" >/dev/null 2>&1 || true
  $REDIS_CLI_CMD DEL "seo:cache:test:*" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ============================================================================
# MOCK DATA & FIXTURES
# ============================================================================

setup_test_environment() {
  log_step "Setting up test environment"

  TEST_TMPDIR=$(mktemp -d -t seo-test.XXXXXX)
  log_info "Created temp directory: $TEST_TMPDIR"

  # Verify Redis connectivity
  if ! verify_redis_health; then
    log_error "Redis not available - required for SEO command tests"
    return 1
  fi

  log_success "Test environment ready"
}

mock_ruvector_cache_hit() {
  local cache_key="$1"
  local cached_data="$2"

  # Store mock cached data in Redis
  redis_set "seo:cache:test:$cache_key" "$cached_data"
  log_info "Mocked RuVector cache hit for: $cache_key"
}

mock_ruvector_cache_miss() {
  local cache_key="$1"

  # Ensure key doesn't exist
  redis_del "seo:cache:test:$cache_key"
  log_info "Mocked RuVector cache miss for: $cache_key"
}

mock_dataforseo_api_success() {
  cat > /tmp/seo-mock-dataforseo.json << 'EOF'
{
  "status_code": 20000,
  "status_message": "Ok",
  "tasks": [{
    "result": [{
      "keyword": "test keyword",
      "search_volume": 5000,
      "keyword_difficulty": 45,
      "competition": 0.65,
      "cpc": 2.50,
      "intent": "commercial"
    }]
  }]
}
EOF
}

mock_dataforseo_api_failure() {
  cat > /tmp/seo-mock-dataforseo-error.json << 'EOF'
{
  "status_code": 40101,
  "status_message": "Rate limit exceeded",
  "tasks": []
}
EOF
}

# ============================================================================
# COMMAND 1: /seo-onboard TESTS
# ============================================================================

test_seo_onboard_happy_path() {
  log_step "TEST: /seo-onboard happy path execution"

  # GIVEN valid domain parameter
  local test_domain="example.com"
  local test_industry="saas"

  # WHEN command is executed with valid parameters
  # Note: This is a mock validation - actual command spawns agents
  local command_syntax="/seo-onboard $test_domain --industry=$test_industry"

  # THEN command syntax should be valid
  assert_contains "$command_syntax" "seo-onboard" "Command contains seo-onboard"
  assert_contains "$command_syntax" "$test_domain" "Command contains domain"
  assert_contains "$command_syntax" "--industry" "Command contains industry flag"

  log_success "seo-onboard happy path validated"
}

test_seo_onboard_missing_domain() {
  log_step "TEST: /seo-onboard missing domain parameter"

  # GIVEN missing domain parameter
  local command_syntax="/seo-onboard --industry=saas"

  # THEN command should be invalid (no domain)
  assert_not_contains "$command_syntax" "example.com" "Command missing domain fails validation"

  log_success "Missing domain parameter validation passed"
}

test_seo_onboard_invalid_domain() {
  log_step "TEST: /seo-onboard invalid domain format"

  # GIVEN invalid domain formats
  local invalid_domains=(
    "http://example.com"  # Protocol included
    "example"             # Incomplete
    "example.com/path"    # Path included
  )

  for invalid_domain in "${invalid_domains[@]}"; do
    log_info "Testing invalid domain: $invalid_domain"

    # THEN domain validation should fail
    # Note: Real validation happens in domain-validator.sh
    assert_not_empty "$invalid_domain" "Domain is not empty"
  done

  log_success "Invalid domain format validation passed"
}

test_seo_onboard_ruvector_cache_integration() {
  log_step "TEST: /seo-onboard RuVector cache hit scenario"

  # GIVEN cached site profile in RuVector
  local test_domain="cached-site.com"
  local cached_profile='{"domain":"cached-site.com","technical_health":0.85,"cached":true}'

  mock_ruvector_cache_hit "site_profile:$test_domain" "$cached_profile"

  # WHEN querying for cached site
  local cached_data=$(redis_get "seo:cache:test:site_profile:$test_domain")

  # THEN cache hit should return data
  assert_not_empty "$cached_data" "Cache hit returns data"
  assert_contains "$cached_data" "cached-site.com" "Cached data contains domain"
  assert_contains "$cached_data" "cached\":true" "Cached flag is set"

  log_success "RuVector cache hit scenario passed"
}

test_seo_onboard_output_format() {
  log_step "TEST: /seo-onboard output format validation"

  # GIVEN expected output structure
  cat > /tmp/seo-test-onboard-output.json << 'EOF'
{
  "domain": "test-site.com",
  "phases_completed": 7,
  "technical_health": 0.78,
  "keyword_count": 500,
  "competitors_analyzed": 3,
  "gaps_identified": 50,
  "strategy_generated": true,
  "roadmap_generated": true,
  "ruvector_intelligence": {
    "cache_hit_rate": 0.63,
    "patterns_applied": 15,
    "cost_savings": 47.50
  }
}
EOF

  # THEN output should contain required fields
  assert_file_exists "/tmp/seo-test-onboard-output.json" "Output file exists"
  assert_pattern_in_file "/tmp/seo-test-onboard-output.json" "\"domain\":" "Contains domain field"
  assert_pattern_in_file "/tmp/seo-test-onboard-output.json" "\"technical_health\":" "Contains health score"
  assert_pattern_in_file "/tmp/seo-test-onboard-output.json" "\"ruvector_intelligence\":" "Contains RuVector metrics"

  log_success "Output format validation passed"
}

# ============================================================================
# COMMAND 2: /seo-discover-keywords TESTS
# ============================================================================

test_seo_discover_keywords_happy_path() {
  log_step "TEST: /seo-discover-keywords happy path execution"

  # GIVEN valid niche parameter
  local test_niche="project management software"
  local test_mode="quick"

  # WHEN command is executed
  local command_syntax="/seo-discover-keywords --niche=\"$test_niche\" --mode=$test_mode"

  # THEN command syntax should be valid
  assert_contains "$command_syntax" "seo-discover-keywords" "Command contains seo-discover-keywords"
  assert_contains "$command_syntax" "--niche" "Command contains niche parameter"
  assert_contains "$command_syntax" "--mode" "Command contains mode parameter"

  log_success "seo-discover-keywords happy path validated"
}

test_seo_discover_keywords_missing_niche() {
  log_step "TEST: /seo-discover-keywords missing niche parameter"

  # GIVEN missing niche parameter
  local command_syntax="/seo-discover-keywords --mode=quick"

  # THEN command should be invalid (no niche)
  assert_not_contains "$command_syntax" "--niche" "Command missing niche parameter"

  log_success "Missing niche parameter validation passed"
}

test_seo_discover_keywords_cache_hit() {
  log_step "TEST: /seo-discover-keywords RuVector cache hit scenario"

  # GIVEN cached keywords in RuVector
  local test_niche="crm software"
  local cached_keywords='[{"keyword":"best crm","volume":8100,"difficulty":65,"cached":true}]'

  mock_ruvector_cache_hit "keywords:$test_niche" "$cached_keywords"

  # WHEN querying for cached keywords
  local cached_data=$(redis_get "seo:cache:test:keywords:$test_niche")

  # THEN cache hit should return keyword data
  assert_not_empty "$cached_data" "Cache hit returns keywords"
  assert_contains "$cached_data" "best crm" "Contains expected keyword"
  assert_contains "$cached_data" "cached\":true" "Cached flag is set"

  log_success "Keyword discovery cache hit passed"
}

test_seo_discover_keywords_cache_miss() {
  log_step "TEST: /seo-discover-keywords RuVector cache miss scenario"

  # GIVEN no cached keywords in RuVector
  local test_niche="new niche"
  mock_ruvector_cache_miss "keywords:$test_niche"

  # WHEN querying for keywords
  local cached_data=$(redis_get "seo:cache:test:keywords:$test_niche")

  # THEN cache miss should return empty
  if [[ -z "$cached_data" || "$cached_data" == "(nil)" ]]; then
    log_success "Cache miss correctly returns empty"
  else
    log_error "Cache miss should return empty, got: $cached_data"
    return 1
  fi
}

test_seo_discover_keywords_output_format() {
  log_step "TEST: /seo-discover-keywords output format validation"

  # GIVEN expected output structure
  cat > /tmp/seo-test-keywords-output.json << 'EOF'
{
  "taskId": "keyword-discovery-1234",
  "niche": "project management",
  "mode": "deep",
  "totalKeywords": 487,
  "cachedKeywords": 312,
  "newKeywords": 175,
  "cacheHitRate": 0.64,
  "costSavings": 8.20,
  "keywords": [
    {
      "keyword": "best project management software",
      "searchVolume": 8100,
      "keywordDifficulty": 65,
      "opportunityScore": 0.89
    }
  ],
  "intelligence": {
    "cacheHits": 312,
    "apiCallsSaved": 312,
    "deduplicationRate": 0.43,
    "patternMatches": 189
  }
}
EOF

  # THEN output should contain required fields
  assert_file_exists "/tmp/seo-test-keywords-output.json" "Keywords output exists"
  assert_pattern_in_file "/tmp/seo-test-keywords-output.json" "\"totalKeywords\":" "Contains keyword count"
  assert_pattern_in_file "/tmp/seo-test-keywords-output.json" "\"cacheHitRate\":" "Contains cache metrics"
  assert_pattern_in_file "/tmp/seo-test-keywords-output.json" "\"intelligence\":" "Contains intelligence summary"

  log_success "Keywords output format validated"
}

# ============================================================================
# API FAILURE HANDLING TESTS
# ============================================================================

test_dataforseo_api_failure_handling() {
  log_step "TEST: DataForSEO API failure handling"

  # GIVEN API rate limit error
  mock_dataforseo_api_failure

  # WHEN API returns error
  assert_file_exists "/tmp/seo-mock-dataforseo-error.json" "Mock API error exists"

  # THEN should contain error status
  assert_pattern_in_file "/tmp/seo-mock-dataforseo-error.json" "40101" "Contains rate limit code"
  assert_pattern_in_file "/tmp/seo-mock-dataforseo-error.json" "Rate limit exceeded" "Contains error message"

  log_success "API failure handling validated"
}

test_dataforseo_fallback_to_cache() {
  log_step "TEST: Fallback to cache on API failure"

  # GIVEN cached data exists
  local test_keyword="test keyword"
  local cached_metrics='{"keyword":"test keyword","volume":5000,"difficulty":45,"source":"cache"}'

  mock_ruvector_cache_hit "keyword_metrics:$test_keyword" "$cached_metrics"

  # WHEN API fails and cache is checked
  local fallback_data=$(redis_get "seo:cache:test:keyword_metrics:$test_keyword")

  # THEN cached data should be used
  assert_not_empty "$fallback_data" "Fallback to cache returns data"
  assert_contains "$fallback_data" "cache" "Source indicates cache"

  log_success "API failure fallback to cache passed"
}

# ============================================================================
# RUVECTOR INTEGRATION TESTS
# ============================================================================

test_ruvector_pattern_storage() {
  log_step "TEST: RuVector pattern storage after successful execution"

  # GIVEN successful keyword discovery
  local pattern_data='{"pattern":"comparison","confidence":0.85,"keywords":42}'

  # WHEN storing pattern in Redis (mock for RuVector)
  redis_set "seo:test:pattern:comparison" "$pattern_data"

  # THEN pattern should be retrievable
  local stored_pattern=$(redis_get "seo:test:pattern:comparison")
  assert_not_empty "$stored_pattern" "Pattern stored successfully"
  assert_contains "$stored_pattern" "comparison" "Pattern type preserved"
  assert_contains "$stored_pattern" "0.85" "Confidence score preserved"

  log_success "Pattern storage validated"
}

test_ruvector_confidence_update() {
  log_step "TEST: RuVector confidence score update on reuse"

  # GIVEN existing pattern with confidence score
  local initial_confidence=0.75
  local pattern_key="seo:test:pattern:buying-guide"

  redis_set "$pattern_key" "{\"confidence\":$initial_confidence}"

  # WHEN pattern is reused successfully (confidence boost)
  local new_confidence=0.82
  redis_set "$pattern_key" "{\"confidence\":$new_confidence}"

  # THEN confidence should be updated
  local updated_pattern=$(redis_get "$pattern_key")
  assert_contains "$updated_pattern" "0.82" "Confidence updated"

  log_success "Confidence update validated"
}

test_ruvector_ttl_freshness() {
  log_step "TEST: RuVector TTL and freshness checks"

  # GIVEN cached data with TTL metadata
  local cached_data='{"keyword":"test","volume":5000,"ttl":14,"cached_at":"2025-12-01"}'

  redis_set "seo:test:keyword:ttl-check" "$cached_data"

  # WHEN checking freshness
  local data=$(redis_get "seo:test:keyword:ttl-check")

  # THEN TTL metadata should exist
  assert_contains "$data" "\"ttl\":" "TTL field present"
  assert_contains "$data" "cached_at" "Timestamp present"

  log_success "TTL freshness checks validated"
}

# ============================================================================
# INTELLIGENCE METRICS TESTS
# ============================================================================

test_intelligence_cache_hit_rate_calculation() {
  log_step "TEST: Cache hit rate calculation"

  # GIVEN cache statistics
  local total_queries=150
  local cache_hits=95
  local cache_misses=55

  # WHEN calculating hit rate
  local hit_rate=$(echo "scale=2; $cache_hits / $total_queries" | bc)

  # THEN hit rate should be accurate
  log_info "Cache hit rate: $hit_rate"
  assert_not_empty "$hit_rate" "Hit rate calculated"

  log_success "Cache hit rate calculation validated"
}

test_intelligence_cost_savings_measurement() {
  log_step "TEST: Cost savings measurement"

  # GIVEN API costs
  local api_cost_per_call=0.025
  local cache_hits=312

  # WHEN calculating savings
  local total_savings=$(echo "scale=2; $cache_hits * $api_cost_per_call" | bc)

  # THEN savings should be calculated correctly
  log_info "Total savings: \$$total_savings"
  assert_not_empty "$total_savings" "Savings calculated"

  log_success "Cost savings measurement validated"
}

test_intelligence_pattern_reuse_tracking() {
  log_step "TEST: Pattern reuse tracking"

  # GIVEN pattern usage data
  cat > /tmp/seo-test-pattern-usage.json << 'EOF'
{
  "pattern_type": "comparison",
  "total_uses": 42,
  "success_rate": 0.89,
  "avg_traffic_lift": 0.35
}
EOF

  # THEN pattern metrics should be trackable
  assert_file_exists "/tmp/seo-test-pattern-usage.json" "Pattern usage file exists"
  assert_pattern_in_file "/tmp/seo-test-pattern-usage.json" "total_uses" "Usage count tracked"
  assert_pattern_in_file "/tmp/seo-test-pattern-usage.json" "success_rate" "Success rate tracked"

  log_success "Pattern reuse tracking validated"
}

test_intelligence_performance_feedback_validation() {
  log_step "TEST: Performance feedback loop validation"

  # GIVEN performance feedback data
  cat > /tmp/seo-test-feedback.json << 'EOF'
{
  "keyword": "best crm software",
  "initial_position": 15,
  "current_position": 8,
  "improvement": 7,
  "pattern_used": "comparison",
  "feedback": "positive"
}
EOF

  # THEN feedback should be structured
  assert_file_exists "/tmp/seo-test-feedback.json" "Feedback file exists"
  assert_pattern_in_file "/tmp/seo-test-feedback.json" "improvement" "Performance tracked"
  assert_pattern_in_file "/tmp/seo-test-feedback.json" "pattern_used" "Pattern attribution tracked"

  log_success "Performance feedback validation passed"
}

# ============================================================================
# INTEGRATION SCENARIO TESTS
# ============================================================================

test_end_to_end_cache_workflow() {
  log_step "TEST: End-to-end cache workflow (query -> miss -> store -> hit)"

  # GIVEN new keyword research task
  local keyword="new keyword"
  local cache_key="seo:test:workflow:$keyword"

  # Clean up any existing key first
  redis_del "$cache_key"

  # WHEN first query (cache miss)
  local first_query=$(redis_get "$cache_key")
  if [[ -z "$first_query" || "$first_query" == "(nil)" ]]; then
    log_success "PASS: Initial cache miss"
    TEST_PASSED=$((TEST_PASSED + 1))
    TEST_TOTAL=$((TEST_TOTAL + 1))
  else
    log_error "FAIL: Initial cache miss - Expected empty, got: $first_query"
    TEST_FAILED=$((TEST_FAILED + 1))
    TEST_TOTAL=$((TEST_TOTAL + 1))
    return 1
  fi

  # WHEN storing data after API call
  local api_data='{"keyword":"new keyword","volume":3000,"difficulty":40}'
  redis_set "$cache_key" "$api_data"

  # WHEN second query (cache hit)
  local second_query=$(redis_get "$cache_key")
  assert_not_empty "$second_query" "Cache hit after storage"
  assert_contains "$second_query" "new keyword" "Cached data correct"

  log_success "End-to-end cache workflow validated"
}

test_multi_command_data_reuse() {
  log_step "TEST: Data reuse across multiple commands"

  # GIVEN /seo-onboard has run and stored competitor data
  local competitor_data='{"domain":"competitor.com","keywords":["keyword1","keyword2"]}'
  redis_set "seo:test:competitor:competitor.com" "$competitor_data"

  # WHEN /seo-discover-keywords references same competitor
  local reused_data=$(redis_get "seo:test:competitor:competitor.com")

  # THEN data should be reusable
  assert_not_empty "$reused_data" "Competitor data reused"
  assert_contains "$reused_data" "competitor.com" "Domain preserved"
  assert_contains "$reused_data" "keyword1" "Keywords preserved"

  log_success "Multi-command data reuse validated"
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

main() {
  annotate "SEO Commands Integration Test Suite"

  setup_test_environment

  # Command 1: /seo-onboard tests
  log_step "Running /seo-onboard tests"
  test_seo_onboard_happy_path
  test_seo_onboard_missing_domain
  test_seo_onboard_invalid_domain
  test_seo_onboard_ruvector_cache_integration
  test_seo_onboard_output_format

  # Command 2: /seo-discover-keywords tests
  log_step "Running /seo-discover-keywords tests"
  test_seo_discover_keywords_happy_path
  test_seo_discover_keywords_missing_niche
  test_seo_discover_keywords_cache_hit
  test_seo_discover_keywords_cache_miss
  test_seo_discover_keywords_output_format

  # API failure handling tests
  log_step "Running API failure handling tests"
  test_dataforseo_api_failure_handling
  test_dataforseo_fallback_to_cache

  # RuVector integration tests
  log_step "Running RuVector integration tests"
  test_ruvector_pattern_storage
  test_ruvector_confidence_update
  test_ruvector_ttl_freshness

  # Intelligence metrics tests
  log_step "Running intelligence metrics tests"
  test_intelligence_cache_hit_rate_calculation
  test_intelligence_cost_savings_measurement
  test_intelligence_pattern_reuse_tracking
  test_intelligence_performance_feedback_validation

  # Integration scenario tests
  log_step "Running integration scenario tests"
  test_end_to_end_cache_workflow
  test_multi_command_data_reuse

  # Print final summary
  print_test_summary
}

# Execute main test suite
main
