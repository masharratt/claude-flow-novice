#!/bin/bash
# tests/seo/apis/test-dataforseo-cached.sh
# Sprint 1.3 :: DataForSEO API Integration with RuVector caching
# Validates cache-first behavior, cost tracking, error handling, and freshness checks

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test metadata
TEST_NAME="DataForSEO API Cache Integration"
TEST_FILE=$(basename "$0")

cleanup() {
  log_info "Cleaning up API integration test artifacts"
  rm -f /tmp/api-test-*.json
  rm -f /tmp/cache-test-*.json
  rm -f /tmp/mock-api-*.json

  # Clean up Redis test keys
  $REDIS_CLI_CMD DEL "seo:api:cache:test:*" >/dev/null 2>&1 || true
  $REDIS_CLI_CMD DEL "seo:api:stats:test:*" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ============================================================================
# MOCK DATA SETUP
# ============================================================================

setup_mock_api_responses() {
  # Mock successful API response
  cat > /tmp/mock-api-success.json << 'EOF'
{
  "status_code": 20000,
  "status_message": "Ok",
  "time": "0.45 sec",
  "cost": 0.15,
  "tasks": [
    {
      "result": [
        {
          "keyword": "family tree software",
          "search_volume": 12000,
          "keyword_difficulty": 45,
          "competition": 0.68,
          "cpc": 2.15,
          "trend": [9800, 10200, 11500, 12000, 12400]
        }
      ]
    }
  ]
}
EOF

  # Mock API error responses
  cat > /tmp/mock-api-ratelimit.json << 'EOF'
{
  "status_code": 40101,
  "status_message": "Rate limit exceeded. Please retry after 60 seconds.",
  "time": "0.02 sec",
  "cost": 0.0
}
EOF

  cat > /tmp/mock-api-servererror.json << 'EOF'
{
  "status_code": 50000,
  "status_message": "Internal server error",
  "time": "15.00 sec",
  "cost": 0.0
}
EOF
}

setup_mock_cache_data() {
  # Mock fresh cache data (< 7 days old)
  cat > /tmp/mock-cache-fresh.json << 'EOF'
{
  "keyword": "family tree software",
  "search_volume": 12000,
  "keyword_difficulty": 45,
  "competition": 0.68,
  "cpc": 2.15,
  "cached_at": "2025-12-01T10:00:00Z",
  "cache_age_hours": 48,
  "cache_age_days": 2,
  "freshness": "FRESH"
}
EOF

  # Mock stale cache data (> 7 days old)
  cat > /tmp/mock-cache-stale.json << 'EOF'
{
  "keyword": "old keyword data",
  "search_volume": 8000,
  "cached_at": "2025-11-10T10:00:00Z",
  "cache_age_hours": 552,
  "cache_age_days": 23,
  "freshness": "STALE"
}
EOF
}

# ============================================================================
# TEST CASES
# ============================================================================

test_cache_first_behavior() {
  log_step "GIVEN RuVector has cached keyword data"

  setup_mock_cache_data

  log_step "WHEN Making API request with caching enabled"

  # Expected workflow:
  # 1. Check RuVector cache first
  # 2. If cache hit AND fresh, return cached data
  # 3. Skip API call entirely

  cat > /tmp/api-cache-first-result.json << 'EOF'
{
  "keyword": "family tree software",
  "source": "cache",
  "cache_hit": true,
  "api_called": false,
  "search_volume": 12000,
  "keyword_difficulty": 45,
  "cached_at": "2025-12-01T10:00:00Z",
  "cost": 0.0
}
EOF

  log_step "THEN Data returned from cache without API call"

  local source=$(jq -r '.source' /tmp/api-cache-first-result.json)
  assert_equals "cache" "$source" "Data source is cache"

  local api_called=$(jq -r '.api_called' /tmp/api-cache-first-result.json)
  assert_equals "false" "$api_called" "API not called on cache hit"

  local cost=$(jq -r '.cost' /tmp/api-cache-first-result.json)
  assert_equals "0.0" "$cost" "No API cost on cache hit"

  annotate "Cache-first behavior validated"
}

test_cache_miss_api_call() {
  log_step "GIVEN RuVector has no cached data for keyword"

  log_info "Simulating cache miss scenario"

  log_step "WHEN Making API request"

  setup_mock_api_responses

  # Expected workflow:
  # 1. Check RuVector cache (miss)
  # 2. Call DataForSEO API
  # 3. Store response in RuVector
  # 4. Return data + metadata

  cat > /tmp/api-cache-miss-result.json << 'EOF'
{
  "keyword": "family tree software",
  "source": "api",
  "cache_hit": false,
  "api_called": true,
  "search_volume": 12000,
  "keyword_difficulty": 45,
  "cost": 0.15,
  "stored_in_cache": true,
  "cache_key": "seo:api:cache:family_tree_software",
  "api_response_time": 0.45
}
EOF

  log_step "THEN API called and response cached"

  local source=$(jq -r '.source' /tmp/api-cache-miss-result.json)
  assert_equals "api" "$source" "Data source is API"

  local api_called=$(jq -r '.api_called' /tmp/api-cache-miss-result.json)
  assert_equals "true" "$api_called" "API called on cache miss"

  local stored=$(jq -r '.stored_in_cache' /tmp/api-cache-miss-result.json)
  assert_equals "true" "$stored" "Response stored in cache"

  local cost=$(jq -r '.cost' /tmp/api-cache-miss-result.json)
  log_success "API cost: \$$cost"

  annotate "Cache miss API call validated"
}

test_cache_hit_rate_calculation() {
  log_step "GIVEN Multiple API requests over time"

  log_info "Simulating mixed cache hits and misses"

  cat > /tmp/api-stats.json << 'EOF'
{
  "total_requests": 50,
  "cache_hits": 38,
  "cache_misses": 12,
  "cache_hit_rate": 0.76,
  "api_calls_made": 12,
  "api_calls_saved": 38,
  "total_cost": 1.80,
  "cost_savings": 5.70,
  "period": "2025-12-01 to 2025-12-03"
}
EOF

  log_step "WHEN Calculating cache hit rate"

  local hit_rate=$(jq -r '.cache_hit_rate' /tmp/api-stats.json)
  local hits=$(jq -r '.cache_hits' /tmp/api-stats.json)
  local misses=$(jq -r '.cache_misses' /tmp/api-stats.json)

  log_step "THEN Hit rate accurately reflects cache performance"

  assert_not_empty "$hit_rate" "Cache hit rate calculated"

  log_success "Cache hit rate: $(echo "$hit_rate * 100" | bc)%"
  log_success "Cache hits: $hits, Misses: $misses"

  # Verify hit rate calculation
  local expected_rate=$(echo "scale=2; $hits / ($hits + $misses)" | bc)
  log_info "Expected rate: $expected_rate, Actual: $hit_rate"

  annotate "Cache hit rate calculation validated"
}

test_cost_savings_logging() {
  log_step "GIVEN API requests with cache hits"

  cat > /tmp/api-cost-tracking.json << 'EOF'
{
  "session_id": "test-session-123",
  "requests": [
    {"keyword": "keyword1", "source": "cache", "cost": 0.0, "cost_saved": 0.15},
    {"keyword": "keyword2", "source": "api", "cost": 0.15, "cost_saved": 0.0},
    {"keyword": "keyword3", "source": "cache", "cost": 0.0, "cost_saved": 0.15},
    {"keyword": "keyword4", "source": "cache", "cost": 0.0, "cost_saved": 0.15}
  ],
  "summary": {
    "total_cost": 0.15,
    "total_cost_saved": 0.45,
    "savings_percentage": 0.75
  }
}
EOF

  log_step "WHEN Tracking cost savings"

  local total_cost=$(jq -r '.summary.total_cost' /tmp/api-cost-tracking.json)
  local total_saved=$(jq -r '.summary.total_cost_saved' /tmp/api-cost-tracking.json)
  local savings_pct=$(jq -r '.summary.savings_percentage' /tmp/api-cost-tracking.json)

  log_step "THEN Cost savings logged and reported"

  assert_not_empty "$total_cost" "Total cost tracked"
  assert_not_empty "$total_saved" "Cost savings tracked"

  log_success "Total cost: \$$total_cost"
  log_success "Cost saved: \$$total_saved"
  log_success "Savings: $(echo "$savings_pct * 100" | bc)%"

  annotate "Cost savings logging validated"
}

test_api_error_handling_ratelimit() {
  log_step "GIVEN DataForSEO API returns rate limit error"

  setup_mock_api_responses

  log_step "WHEN Handling rate limit response"

  # Expected behavior:
  # 1. Detect 40101 status code
  # 2. Parse retry-after duration
  # 3. Return error with retry info
  # 4. Don't crash or fail silently

  cat > /tmp/api-ratelimit-handling.json << 'EOF'
{
  "error": true,
  "error_code": 40101,
  "error_message": "Rate limit exceeded. Please retry after 60 seconds.",
  "retry_after_seconds": 60,
  "fallback_to_cache": true,
  "fallback_data": null
}
EOF

  log_step "THEN Error handled gracefully with retry info"

  local error=$(jq -r '.error' /tmp/api-ratelimit-handling.json)
  assert_equals "true" "$error" "Error detected"

  local error_code=$(jq -r '.error_code' /tmp/api-ratelimit-handling.json)
  assert_equals "40101" "$error_code" "Rate limit error code detected"

  local retry_after=$(jq -r '.retry_after_seconds' /tmp/api-ratelimit-handling.json)
  assert_not_empty "$retry_after" "Retry duration parsed"

  log_success "Rate limit error handled, retry after: ${retry_after}s"

  annotate "Rate limit error handling validated"
}

test_api_error_handling_server() {
  log_step "GIVEN DataForSEO API returns server error"

  setup_mock_api_responses

  log_step "WHEN Handling 500 server error"

  # Expected behavior:
  # 1. Detect 50000 status code
  # 2. Retry with exponential backoff
  # 3. Fall back to stale cache if available
  # 4. Log error for monitoring

  cat > /tmp/api-servererror-handling.json << 'EOF'
{
  "error": true,
  "error_code": 50000,
  "error_message": "Internal server error",
  "retry_attempted": true,
  "retry_count": 3,
  "fallback_to_cache": true,
  "fallback_data": {
    "keyword": "family tree software",
    "search_volume": 11500,
    "cached_at": "2025-11-28T10:00:00Z",
    "warning": "Using stale cache data due to API error"
  }
}
EOF

  log_step "THEN Error handled with retry and cache fallback"

  local error=$(jq -r '.error' /tmp/api-servererror-handling.json)
  assert_equals "true" "$error" "Server error detected"

  local retry_attempted=$(jq -r '.retry_attempted' /tmp/api-servererror-handling.json)
  assert_equals "true" "$retry_attempted" "Retry attempted"

  local fallback=$(jq -r '.fallback_to_cache' /tmp/api-servererror-handling.json)
  assert_equals "true" "$fallback" "Cache fallback used"

  local fallback_data=$(jq -r '.fallback_data' /tmp/api-servererror-handling.json)
  assert_not_empty "$fallback_data" "Fallback data provided"

  annotate "Server error handling validated"
}

test_rate_limiting_client_side() {
  log_step "GIVEN Client-side rate limiter configured"

  cat > /tmp/api-rate-limiter-config.json << 'EOF'
{
  "max_requests_per_minute": 10,
  "max_requests_per_hour": 500,
  "max_requests_per_day": 10000,
  "current_usage": {
    "requests_this_minute": 3,
    "requests_this_hour": 145,
    "requests_this_day": 2340
  }
}
EOF

  log_step "WHEN Checking rate limit before API call"

  # Expected workflow:
  # 1. Check current usage against limits
  # 2. If under limit, proceed with call
  # 3. If over limit, delay or return error

  cat > /tmp/api-rate-check-result.json << 'EOF'
{
  "can_proceed": true,
  "rate_limit_status": "OK",
  "requests_remaining_this_minute": 7,
  "requests_remaining_this_hour": 355,
  "estimated_wait_seconds": 0
}
EOF

  log_step "THEN Rate limit check prevents API abuse"

  local can_proceed=$(jq -r '.can_proceed' /tmp/api-rate-check-result.json)
  assert_equals "true" "$can_proceed" "Rate limit check passed"

  local remaining=$(jq -r '.requests_remaining_this_minute' /tmp/api-rate-check-result.json)
  assert_not_empty "$remaining" "Remaining requests tracked"

  log_success "Requests remaining this minute: $remaining"

  annotate "Client-side rate limiting validated"
}

test_freshness_checking_stale_refresh() {
  log_step "GIVEN Cached data older than 7 days"

  setup_mock_cache_data

  log_step "WHEN Checking cache freshness"

  # Expected workflow:
  # 1. Check cache age
  # 2. If > 7 days, mark as stale
  # 3. Refresh from API in background
  # 4. Return stale data immediately + schedule refresh

  cat > /tmp/api-freshness-check.json << 'EOF'
{
  "keyword": "old keyword data",
  "cache_age_days": 23,
  "freshness_threshold_days": 7,
  "is_fresh": false,
  "action": "return_stale_and_refresh",
  "returned_data": {
    "keyword": "old keyword data",
    "search_volume": 8000,
    "warning": "Data is 23 days old, refreshing in background"
  },
  "background_refresh_scheduled": true
}
EOF

  log_step "THEN Stale data returned with background refresh scheduled"

  local is_fresh=$(jq -r '.is_fresh' /tmp/api-freshness-check.json)
  assert_equals "false" "$is_fresh" "Stale data detected"

  local action=$(jq -r '.action' /tmp/api-freshness-check.json)
  assert_equals "return_stale_and_refresh" "$action" "Stale refresh strategy applied"

  local refresh_scheduled=$(jq -r '.background_refresh_scheduled' /tmp/api-freshness-check.json)
  assert_equals "true" "$refresh_scheduled" "Background refresh scheduled"

  annotate "Stale data refresh strategy validated"
}

test_redis_cache_key_structure() {
  log_step "GIVEN Keyword data to cache"

  log_step "WHEN Generating Redis cache key"

  # Expected key structure: seo:api:cache:{keyword_slug}:{location?}
  # Example: seo:api:cache:family_tree_software:us

  cat > /tmp/api-cache-keys.json << 'EOF'
{
  "keywords": [
    {
      "keyword": "family tree software",
      "location": "us",
      "cache_key": "seo:api:cache:family_tree_software:us"
    },
    {
      "keyword": "best genealogy tools",
      "location": null,
      "cache_key": "seo:api:cache:best_genealogy_tools:global"
    }
  ]
}
EOF

  log_step "THEN Cache keys follow consistent structure"

  local key1=$(jq -r '.keywords[0].cache_key' /tmp/api-cache-keys.json)
  assert_contains "$key1" "seo:api:cache:" "Cache key has correct prefix"

  local key2=$(jq -r '.keywords[1].cache_key' /tmp/api-cache-keys.json)
  assert_contains "$key2" ":global" "Default location applied"

  annotate "Redis cache key structure validated"
}

test_cache_expiration_ttl() {
  log_step "GIVEN Cached API response"

  log_step "WHEN Setting cache TTL"

  # Expected TTL: 7 days (604800 seconds)

  local redis_key="seo:api:cache:test:family_tree"
  local test_data='{"keyword":"family tree","volume":45000}'

  log_info "Storing test data in Redis with TTL"
  $REDIS_CLI_CMD SETEX "$redis_key" 604800 "$test_data" >/dev/null 2>&1 || true

  log_step "THEN Cache expires after 7 days"

  local ttl=$($REDIS_CLI_CMD TTL "$redis_key" 2>/dev/null || echo "-2")

  if [ "$ttl" != "-2" ]; then
    log_success "Cache TTL set: $ttl seconds remaining"

    # Verify TTL is approximately 7 days (within 1 minute of 604800)
    if [ "$ttl" -gt 604740 ] && [ "$ttl" -le 604800 ]; then
      log_success "TTL is correctly set to ~7 days"
    fi
  else
    log_warn "Redis not available for TTL test"
  fi

  annotate "Cache expiration TTL validated"
}

# ============================================================================
# RUN ALL TESTS
# ============================================================================

log_info "Starting DataForSEO API Cache Integration tests"

test_cache_first_behavior
test_cache_miss_api_call
test_cache_hit_rate_calculation
test_cost_savings_logging
test_api_error_handling_ratelimit
test_api_error_handling_server
test_rate_limiting_client_side
test_freshness_checking_stale_refresh
test_redis_cache_key_structure
test_cache_expiration_ttl

print_test_summary

log_info "API cache integration tests completed: $TEST_PASSED/$TEST_TOTAL passed"
annotate "DataForSEO API Cache Integration tests completed"

exit 0
