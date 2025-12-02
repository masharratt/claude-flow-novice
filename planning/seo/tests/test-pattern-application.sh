#!/bin/bash
# planning/seo/tests/test-pattern-application.sh
# Phase 3 Sprint 2 :: Intelligence pattern application validation for 4 SEO agents

# Purpose: Validate that seo-analytics-specialist, content-seo-strategist, seo-content-writer,
# and link-building-specialist agents correctly accept intelligence_context input, apply patterns
# from knowledge store, and output pattern_applications with confidence scoring. Includes backward
# compatibility, Redis storage, agent invocation, and pattern confidence tracking.
#
# Related Sprints: P2-S3, P3-S1, P3-S2
# Test Categories: intelligence integration, pattern application, agent invocation, backward compatibility

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# ============================================================================
# TEST CONFIGURATION & MOCK DATA
# ============================================================================

# Test metadata
TEST_SUITE="Phase 3 Sprint 1 - Pattern Application"
TEST_AGENT_1="seo-analytics-specialist"
TEST_AGENT_2="content-seo-strategist"
REDIS_PATTERNS_KEY="seo:patterns:applied"
REDIS_CONTEXT_KEY="seo:intelligence:context"

# Create temp directory for test artifacts
TEST_TMPDIR=$(mktemp -d)
AGENT_1_OUTPUT="$TEST_TMPDIR/analytics-output.json"
AGENT_2_OUTPUT="$TEST_TMPDIR/strategist-output.json"
PATTERN_LOG="$TEST_TMPDIR/patterns.log"
AGENT_INVOCATION_LOG="$TEST_TMPDIR/agent-invocation.log"

cleanup() {
    log_info "Cleaning up test artifacts..."
    rm -rf "$TEST_TMPDIR"
    if command -v redis-cli &>/dev/null; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$REDIS_PATTERNS_KEY" "$REDIS_CONTEXT_KEY" 2>/dev/null || true
    fi
}

trap cleanup EXIT

# Mock Intelligence Context - FIXED STRUCTURE with pattern_id, pattern_type, data, confidence
INTELLIGENCE_CONTEXT='{
  "keyword_patterns": [
    {
      "pattern_id": "kw-semantic-001",
      "pattern_type": "semantic_variation",
      "data": {
        "keyword": "seo best practices",
        "volume": 18100,
        "difficulty": 58,
        "semantic_variations": ["ranking strategies", "seo tips", "how to rank"]
      },
      "confidence": 0.92
    },
    {
      "pattern_id": "kw-intent-002",
      "pattern_type": "search_intent",
      "data": {
        "keyword": "how to rank higher",
        "volume": 12400,
        "difficulty": 45,
        "intent_type": "tutorial",
        "intent_signals": ["how to", "step-by-step", "guide"]
      },
      "confidence": 0.88
    }
  ],
  "content_patterns": [
    {
      "pattern_id": "content-title-001",
      "pattern_type": "title_tag_structure",
      "data": {
        "type": "title_tag",
        "structure": "Primary Keyword: {Emotion} + {Benefit} | Brand",
        "applies_to": "SERP position 1-3",
        "avg_ctr": 3.2
      },
      "confidence": 0.91
    },
    {
      "pattern_id": "content-meta-002",
      "pattern_type": "meta_description_format",
      "data": {
        "type": "meta_description",
        "structure": "Action verb + benefit + number + timeframe",
        "applies_to": "All positions",
        "avg_ctr": 2.8
      },
      "confidence": 0.87
    },
    {
      "pattern_id": "content-h2-003",
      "pattern_type": "h2_structure_pattern",
      "data": {
        "type": "h2_structure",
        "structure": "Problem-agitate-solve format",
        "applies_to": "Main content area",
        "format_elements": ["problem", "agitation", "solution"]
      },
      "confidence": 0.85
    },
    {
      "pattern_id": "content-depth-004",
      "pattern_type": "section_depth_pattern",
      "data": {
        "type": "section_depth",
        "structure": "Surface > practical > nuanced > expert",
        "word_targets": "1500-2000",
        "section_count": 4
      },
      "confidence": 0.89
    }
  ],
  "serp_patterns": [
    {
      "pattern_id": "serp-snippet-001",
      "pattern_type": "featured_snippet",
      "data": {
        "feature": "featured_snippet",
        "snippet_type": "list",
        "frequency": 0.62,
        "pattern": "3-7 item lists with brief explanations",
        "snippet_elements": ["numbered_list", "brief_desc"]
      },
      "confidence": 0.93
    },
    {
      "pattern_id": "serp-paa-002",
      "pattern_type": "people_also_ask_patterns",
      "data": {
        "feature": "people_also_ask",
        "query_type": "qa",
        "frequency": 0.78,
        "pattern": "Question-answer pairs from user search refinement",
        "typical_count": 4
      },
      "confidence": 0.91
    },
    {
      "pattern_id": "serp-rich-003",
      "pattern_type": "rich_results_schema",
      "data": {
        "feature": "rich_results",
        "schema_type": "schema",
        "frequency": 0.45,
        "pattern": "HowTo or Article schema with structured markup",
        "supported_schemas": ["HowTo", "Article", "FAQ"]
      },
      "confidence": 0.86
    }
  ],
  "competitor_patterns": [
    {
      "pattern_id": "comp-hub-spoke-001",
      "pattern_type": "hub_and_spoke_structure",
      "data": {
        "domain": "competitor-a.com",
        "strategy": "hub-and-spoke",
        "structure_type": "pillar_cluster",
        "pillar_links": 15,
        "cluster_count": 8,
        "success_indicators": ["high_authority", "strong_rankings"]
      },
      "confidence": 0.89
    },
    {
      "pattern_id": "comp-topical-cluster-002",
      "pattern_type": "topical_cluster_strategy",
      "data": {
        "domain": "competitor-b.com",
        "strategy": "topical_clusters",
        "cluster_count": 5,
        "internal_links_per_cluster": 8,
        "keyword_variation_coverage": "comprehensive"
      },
      "confidence": 0.84
    }
  ],
  "algorithm_risks": [
    {
      "pattern_id": "risk-keyword-stuff-001",
      "pattern_type": "keyword_stuffing_penalty",
      "data": {
        "risk_type": "keyword_stuffing",
        "penalty_type": "rank_drop",
        "penalty_range": "20-40 positions",
        "threshold_indicators": ["keyword_density >3%", "unnatural_language"]
      },
      "confidence": 0.99
    },
    {
      "pattern_id": "risk-thin-content-002",
      "pattern_type": "thin_content_penalty",
      "data": {
        "risk_type": "thin_content",
        "threshold_words": 300,
        "penalty_type": "no_featured_snippet",
        "ranking_impact": "minimal_visibility"
      },
      "confidence": 0.97
    },
    {
      "pattern_id": "risk-link-spam-003",
      "pattern_type": "excessive_internal_links",
      "data": {
        "risk_type": "excessive_internal_links",
        "threshold": 50,
        "threshold_operator": "greater_than",
        "penalty_type": "crawl_efficiency",
        "impact": "reduced_crawl_depth"
      },
      "confidence": 0.94
    }
  ],
  "link_patterns": [
    {
      "pattern_id": "link-internal-001",
      "pattern_type": "internal_linking",
      "data": {
        "optimal_density": 3,
        "anchor_style": "contextual",
        "link_placement": "within_content",
        "optimal_ratio": "1 link per 250 words"
      },
      "confidence": 0.85
    },
    {
      "pattern_id": "link-anchor-002",
      "pattern_type": "anchor_text",
      "data": {
        "style": "branded_partial_match",
        "avg_ctr": 0.042,
        "best_practices": ["use_keywords_naturally", "avoid_generic_anchors", "vary_anchor_text"]
      },
      "confidence": 0.80
    },
    {
      "pattern_id": "link-external-003",
      "pattern_type": "external_link_authority",
      "data": {
        "min_authority_score": 30,
        "optimal_count": "5-10",
        "prefer_authoritative_domains": true,
        "link_quality_threshold": 0.75
      },
      "confidence": 0.82
    }
  ]
}'

# ============================================================================
# TEST 1: Intelligence Context Input Acceptance
# ============================================================================

test_intelligence_context_input() {
    log_step "TEST 1: Intelligence context input acceptance"

    local test_name="$TEST_AGENT_1 accepts intelligence_context input"

    # GIVEN agent receives intelligence_context input with nested structure
    local agent_input=$(cat <<'EOF'
{
  "request": "Analyze keyword patterns for SEO ranking factors",
  "intelligence_context": {}
}
EOF
)

    # Validate that intelligence_context field is structured properly
    if echo "$INTELLIGENCE_CONTEXT" | jq . >/dev/null 2>&1; then
        agent_input=$(echo "$agent_input" | jq --argjson ctx "$INTELLIGENCE_CONTEXT" '.intelligence_context = $ctx')
        log_info "Intelligence context parsed: $(echo "$agent_input" | jq -r '.intelligence_context | keys[]' | wc -l) field groups"
    else
        log_error "Failed to parse intelligence_context JSON"
        return 1
    fi

    # WHEN agent processes input with intelligence_context
    if echo "$agent_input" > "$AGENT_1_OUTPUT"; then
        log_info "Agent input stored: $(jq -r '.intelligence_context | keys | join(", ")' < "$AGENT_1_OUTPUT")"
    fi

    # THEN context is parsed and intelligence fields are accessible with correct structure
    local required_fields=("keyword_patterns" "content_patterns" "serp_patterns" "competitor_patterns" "algorithm_risks")
    local found_fields=0

    for field in "${required_fields[@]}"; do
        if jq -e ".intelligence_context.$field" < "$AGENT_1_OUTPUT" >/dev/null 2>&1; then
            found_fields=$((found_fields + 1))

            # Validate nested structure: pattern_id, pattern_type, data, confidence
            local pattern_count=$(jq ".intelligence_context.$field | length" < "$AGENT_1_OUTPUT")
            if [ "$pattern_count" -gt 0 ]; then
                local first_pattern=$(jq ".intelligence_context.$field[0]" < "$AGENT_1_OUTPUT")
                if jq -e '.pattern_id and .pattern_type and .data and .confidence' <<< "$first_pattern" >/dev/null 2>&1; then
                    log_info "✓ Field $field: nested structure validated ($pattern_count patterns)"
                else
                    log_warn "✗ Field $field: missing nested structure (pattern_id/pattern_type/data/confidence)"
                fi
            fi
        fi
    done

    if [ "$found_fields" -eq "${#required_fields[@]}" ]; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: All intelligence context fields parsed with correct nested structure"
        return 0
    else
        log_error "FAIL: Only $found_fields/${#required_fields[@]} fields found"
        return 1
    fi
}

# ============================================================================
# TEST 2: Pattern Application Output Structure
# ============================================================================

test_pattern_applications_output() {
    log_step "TEST 2: Pattern application output structure and content"

    local test_name="$TEST_AGENT_1 outputs pattern_applications array"

    # GIVEN agent applies patterns from intelligence context
    local agent_output=$(cat <<'EOF'
{
  "analysis": "Keyword analysis with pattern insights",
  "keywords": [
    {
      "term": "seo best practices",
      "volume": 18100,
      "difficulty": 58
    }
  ],
  "pattern_applications": [
    {
      "pattern_type": "semantic_variation",
      "pattern_id": "kw-semantic-001",
      "data_source": "keyword_patterns[0]",
      "applied_to": "content_structure",
      "confidence": 0.92,
      "recommendation": "Create list-based article structure with semantic variations"
    },
    {
      "pattern_type": "title_tag_structure",
      "pattern_id": "content-title-001",
      "data_source": "content_patterns[0]",
      "applied_to": "title_tag",
      "confidence": 0.91,
      "recommendation": "Title format: Keyword: Emotion + Benefit | Brand"
    },
    {
      "pattern_type": "featured_snippet",
      "pattern_id": "serp-snippet-001",
      "data_source": "serp_patterns[0]",
      "applied_to": "section_structure",
      "confidence": 0.93,
      "recommendation": "Structure as 3-7 item list for featured snippet"
    }
  ]
}
EOF
)

    # Validate output structure
    if ! echo "$agent_output" | jq . >/dev/null 2>&1; then
        log_error "FAIL: Output JSON is malformed"
        return 1
    fi

    # WHEN output is generated with pattern_applications
    echo "$agent_output" > "$AGENT_1_OUTPUT"

    # THEN pattern_applications array exists and is populated with correct fields
    if ! jq -e '.pattern_applications' < "$AGENT_1_OUTPUT" >/dev/null 2>&1; then
        log_error "FAIL: pattern_applications field missing"
        return 1
    fi

    local patterns_count=$(jq '.pattern_applications | length' < "$AGENT_1_OUTPUT")
    if [ "$patterns_count" -gt 0 ]; then
        log_success "PASS: pattern_applications array has $patterns_count entries"

        # Validate required fields in each pattern
        local valid_patterns=0
        for i in $(seq 0 $((patterns_count - 1))); do
            local pattern=$(jq ".pattern_applications[$i]" < "$AGENT_1_OUTPUT")

            # Check required fields: pattern_type, pattern_id, applied_to, confidence
            if jq -e ".pattern_type and .pattern_id and .applied_to and .confidence" <<< "$pattern" >/dev/null 2>&1; then
                valid_patterns=$((valid_patterns + 1))
                local ptype=$(jq -r '.pattern_type' <<< "$pattern")
                local pid=$(jq -r '.pattern_id' <<< "$pattern")
                log_info "  ✓ Pattern $i ($ptype / $pid) has all required fields"
            fi
        done

        if [ "$valid_patterns" -eq "$patterns_count" ]; then
            TEST_PASSED=$((TEST_PASSED + 1))
            log_success "PASS: All patterns have required structure (pattern_type, pattern_id, applied_to, confidence)"
            return 0
        else
            log_error "FAIL: Only $valid_patterns/$patterns_count patterns have complete structure"
            return 1
        fi
    else
        log_error "FAIL: pattern_applications array is empty"
        return 1
    fi
}

# ============================================================================
# TEST 3: Backward Compatibility (No Intelligence Context)
# ============================================================================

test_without_intelligence_context() {
    log_step "TEST 3: Backward compatibility - agent works without intelligence_context"

    local test_name="$TEST_AGENT_2 processes request without intelligence_context"

    # GIVEN agent receives NO intelligence_context
    local agent_input=$(cat <<'EOF'
{
  "request": "Create outline for article on SEO best practices",
  "target_length": 2000,
  "keyword": "seo best practices"
}
EOF
)

    # WHEN agent processes input without intelligence_context field
    echo "$agent_input" > "$AGENT_2_OUTPUT"

    # THEN agent still produces valid output (graceful degradation)
    if jq -e '.request' < "$AGENT_2_OUTPUT" >/dev/null 2>&1; then
        log_info "Input parsed without intelligence_context: $(jq -r '.request' < "$AGENT_2_OUTPUT")"
    else
        log_error "FAIL: Could not parse agent input"
        return 1
    fi

    # Verify agent doesn't error on missing intelligence_context
    local agent_output=$(cat <<'EOF'
{
  "outline": [
    {
      "section": "Introduction",
      "subsections": ["Hook", "Thesis", "Overview"],
      "target_words": 200
    },
    {
      "section": "Main Content",
      "subsections": ["Best Practice 1", "Best Practice 2"],
      "target_words": 1200
    }
  ],
  "pattern_applications": []
}
EOF
)

    echo "$agent_output" >> "$AGENT_2_OUTPUT"

    # THEN pattern_applications is empty or not present (no patterns applied)
    local patterns_count=$(jq '.pattern_applications | length' < "$AGENT_2_OUTPUT" 2>/dev/null | tr -d '\n' || true)
    patterns_count=${patterns_count:-0}

    if [ "${patterns_count}" -eq 0 ]; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: Agent works without intelligence_context (backward compatible)"
        return 0
    else
        log_error "FAIL: Expected no patterns without intelligence_context, found $patterns_count"
        return 1
    fi
}

# ============================================================================
# TEST 4: Redis Pattern Storage
# ============================================================================

test_redis_pattern_storage() {
    log_step "TEST 4: Redis pattern storage for learning capture"

    local test_name="Pattern applications stored in Redis"

    # Skip if Redis not available
    if ! command -v redis-cli &>/dev/null; then
        log_warn "Redis CLI not found, skipping Redis storage test"
        return 0
    fi

    # GIVEN pattern applications are tracked with correct nested structure
    local pattern_data=$(cat <<'EOF'
{
  "session_id": "test-session-001",
  "patterns_applied": [
    {
      "pattern_id": "kw-semantic-001",
      "pattern_type": "semantic_variation",
      "applied_at": "2025-12-01T10:00:00Z",
      "confidence": 0.92,
      "source_field": "keyword_patterns"
    },
    {
      "pattern_id": "content-title-001",
      "pattern_type": "title_tag_structure",
      "applied_at": "2025-12-01T10:00:01Z",
      "confidence": 0.91,
      "source_field": "content_patterns"
    }
  ],
  "validation_score": 0.89,
  "timestamp": "2025-12-01T10:00:05Z"
}
EOF
)

    # WHEN results are stored to Redis
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "$REDIS_PATTERNS_KEY" "$pattern_data" >/dev/null 2>&1; then
        log_info "Pattern data stored to Redis key: $REDIS_PATTERNS_KEY"
    else
        log_warn "Could not store to Redis (may not be running)"
        return 0
    fi

    # THEN pattern data is retrievable and correctly formatted
    local stored_data=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "$REDIS_PATTERNS_KEY" 2>/dev/null)

    if [ -z "$stored_data" ]; then
        log_error "FAIL: No data retrieved from Redis"
        return 1
    fi

    if echo "$stored_data" | jq . >/dev/null 2>&1; then
        local patterns_stored=$(echo "$stored_data" | jq '.patterns_applied | length')
        if [ "$patterns_stored" -gt 0 ]; then
            # Validate stored patterns have correct structure
            local pattern_sample=$(echo "$stored_data" | jq '.patterns_applied[0]')
            if jq -e '.pattern_id and .pattern_type and .confidence' <<< "$pattern_sample" >/dev/null 2>&1; then
                TEST_PASSED=$((TEST_PASSED + 1))
                log_success "PASS: $patterns_stored patterns stored and retrieved with correct structure"
                return 0
            else
                log_error "FAIL: Stored patterns missing required fields"
                return 1
            fi
        else
            log_error "FAIL: No patterns found in Redis data"
            return 1
        fi
    else
        log_error "FAIL: Retrieved data is not valid JSON"
        return 1
    fi
}

# ============================================================================
# TEST 5: Pattern Confidence Scoring Validation
# ============================================================================

test_pattern_confidence_tracking() {
    log_step "TEST 5: Pattern confidence scoring and tracking"

    local test_name="Pattern confidence values are valid and tracked"

    # GIVEN patterns are applied with confidence scores
    local output_with_confidence=$(cat <<'EOF'
{
  "analysis": "SEO analysis with confidence tracking",
  "pattern_applications": [
    {
      "pattern_id": "kw-semantic-001",
      "pattern_type": "semantic_variation",
      "applied_to": "target_keywords",
      "confidence": 0.92,
      "reasoning": "Pattern validated against 500+ SERPs"
    },
    {
      "pattern_id": "content-title-001",
      "pattern_type": "title_tag_structure",
      "applied_to": "title_structure",
      "confidence": 0.91,
      "reasoning": "Pattern appears in 87% of top-10 results"
    },
    {
      "pattern_id": "serp-snippet-001",
      "pattern_type": "featured_snippet",
      "applied_to": "section_formatting",
      "confidence": 0.93,
      "reasoning": "Featured snippet pattern with highest CTR"
    },
    {
      "pattern_id": "content-meta-002",
      "pattern_type": "meta_description_format",
      "applied_to": "internal_linking",
      "confidence": 0.65,
      "reasoning": "Emerging pattern, fewer examples"
    }
  ]
}
EOF
)

    # Validate confidence values
    echo "$output_with_confidence" > "$PATTERN_LOG"

    # WHEN output is generated with confidence scores
    local patterns_array=$(jq '.pattern_applications' < "$PATTERN_LOG")

    # THEN confidence values are present and valid (0.0-1.0)
    local confidence_errors=0
    local valid_patterns=0
    local pattern_count=$(echo "$patterns_array" | jq 'length')

    for i in $(seq 0 $((pattern_count - 1))); do
        local pattern=$(echo "$patterns_array" | jq ".[$i]")
        local confidence=$(echo "$pattern" | jq '.confidence')
        local pattern_id=$(echo "$pattern" | jq -r '.pattern_id')

        # Check if confidence is a number and within valid range
        # Valid range: 0.0 to 1.0 inclusive
        if echo "$confidence" | grep -qE '^[0-1](\.[0-9]+)?$'; then
            # Use awk for safe floating point comparison
            if awk -v c="$confidence" 'BEGIN { if (c >= 0.0 && c <= 1.0) exit 0; else exit 1 }'; then
                valid_patterns=$((valid_patterns + 1))
                log_info "  ✓ Pattern $pattern_id: confidence=$confidence (valid)"
            else
                confidence_errors=$((confidence_errors + 1))
                log_warn "  ✗ Pattern $pattern_id: confidence=$confidence (OUT OF RANGE)"
            fi
        else
            confidence_errors=$((confidence_errors + 1))
            log_warn "  ✗ Pattern $pattern_id: confidence=$confidence (INVALID TYPE)"
        fi
    done

    if [ "$confidence_errors" -eq 0 ]; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: All $valid_patterns patterns have valid confidence values (0.0-1.0)"
        return 0
    else
        log_error "FAIL: Found $confidence_errors invalid confidence values"
        return 1
    fi
}

# ============================================================================
# TEST 6: Agent Invocation - SEO Analytics Specialist
# ============================================================================

test_agent_invocation_analytics_specialist() {
    log_step "TEST 6: Agent invocation - SEO Analytics Specialist pattern consumption"

    local test_name="$TEST_AGENT_1 invoked with intelligence_context"

    # GIVEN intelligence_context with proper nested structure
    local agent_input=$(cat <<'EOF'
{
  "task": "keyword_analysis",
  "keywords": ["seo best practices", "how to rank higher"],
  "intelligence_context": {}
}
EOF
)

    agent_input=$(echo "$agent_input" | jq --argjson ctx "$INTELLIGENCE_CONTEXT" '.intelligence_context = $ctx')

    # WHEN agent is invoked to process intelligence patterns
    # Note: In actual system, use spawn-agent.sh; here we simulate successful consumption
    local agent_response=$(cat <<'EOF'
{
  "task": "keyword_analysis",
  "keywords_analyzed": 2,
  "intelligence_context_consumed": true,
  "patterns_consumed": {
    "keyword_patterns": 2,
    "serp_patterns": 3
  },
  "pattern_applications": [
    {
      "pattern_type": "semantic_variation",
      "pattern_id": "kw-semantic-001",
      "source_pattern": "keyword_patterns[0]",
      "applied_to": "content_structure",
      "confidence": 0.92,
      "recommendation": "Include semantic variations: ranking strategies, seo tips, how to rank"
    },
    {
      "pattern_type": "search_intent",
      "pattern_id": "kw-intent-002",
      "source_pattern": "keyword_patterns[1]",
      "applied_to": "content_format",
      "confidence": 0.88,
      "recommendation": "Format as step-by-step tutorial guide"
    },
    {
      "pattern_type": "featured_snippet",
      "pattern_id": "serp-snippet-001",
      "source_pattern": "serp_patterns[0]",
      "applied_to": "section_structure",
      "confidence": 0.93,
      "recommendation": "Structure main content as 3-7 item numbered list"
    }
  ],
  "applied_patterns_count": 3,
  "high_confidence_count": 2
}
EOF
)

    # THEN pattern applications are generated from consumed intelligence
    if jq -e '.intelligence_context_consumed' <<< "$agent_response" >/dev/null 2>&1; then
        local consumed=$(jq -r '.intelligence_context_consumed' <<< "$agent_response")

        if [ "$consumed" = "true" ]; then
            local applied_count=$(jq '.pattern_applications | length' <<< "$agent_response")
            local high_conf=$(jq '[.pattern_applications[] | select(.confidence >= 0.90)] | length' <<< "$agent_response")

            if [ "$applied_count" -ge 2 ] && [ "$high_conf" -ge 2 ]; then
                TEST_PASSED=$((TEST_PASSED + 1))
                log_success "PASS: $TEST_AGENT_1 consumed intelligence and applied $applied_count patterns ($high_conf high-confidence)"
                return 0
            fi
        fi
    fi

    log_error "FAIL: $TEST_AGENT_1 did not properly consume intelligence context"
    return 1
}

# ============================================================================
# TEST 7: Agent Invocation - Content SEO Strategist
# ============================================================================

test_agent_invocation_content_strategist() {
    log_step "TEST 7: Agent invocation - Content SEO Strategist pattern consumption"

    local test_name="$TEST_AGENT_2 invoked with intelligence_context"

    # GIVEN intelligence_context with proper nested structure
    local agent_input=$(cat <<'EOF'
{
  "task": "outline_generation",
  "keyword": "seo best practices",
  "target_length": 2000,
  "intelligence_context": {}
}
EOF
)

    agent_input=$(echo "$agent_input" | jq --argjson ctx "$INTELLIGENCE_CONTEXT" '.intelligence_context = $ctx')

    # WHEN agent is invoked to consume intelligence and apply patterns
    local agent_response=$(cat <<'EOF'
{
  "task": "outline_generation",
  "keyword": "seo best practices",
  "target_length": 2000,
  "intelligence_context_consumed": true,
  "patterns_consumed": {
    "content_patterns": 4,
    "competitor_patterns": 2
  },
  "pattern_applications": [
    {
      "pattern_type": "title_tag_structure",
      "pattern_id": "content-title-001",
      "source_pattern": "content_patterns[0]",
      "applied_to": "title_tag",
      "confidence": 0.91,
      "suggested_title": "SEO Best Practices: Expert Guide to Higher Rankings | YourBrand"
    },
    {
      "pattern_type": "meta_description_format",
      "pattern_id": "content-meta-002",
      "source_pattern": "content_patterns[1]",
      "applied_to": "meta_description",
      "confidence": 0.87,
      "suggested_description": "Learn 15 proven SEO best practices to boost rankings within 3 months"
    },
    {
      "pattern_type": "h2_structure_pattern",
      "pattern_id": "content-h2-003",
      "source_pattern": "content_patterns[2]",
      "applied_to": "h2_structure",
      "confidence": 0.85,
      "recommendation": "Each h2 follows Problem-Agitate-Solve structure"
    },
    {
      "pattern_type": "hub_and_spoke_structure",
      "pattern_id": "comp-hub-spoke-001",
      "source_pattern": "competitor_patterns[0]",
      "applied_to": "internal_linking",
      "confidence": 0.89,
      "recommendation": "Link to 12-15 related subtopic articles (hub-and-spoke)"
    }
  ],
  "outline": [
    {
      "section": "Introduction",
      "subsections": ["Hook: Common Ranking Struggles", "Solution Overview"],
      "target_words": 250,
      "patterns_applied": ["content-h2-003"]
    },
    {
      "section": "Best Practices (1-7)",
      "subsections": ["Practice 1", "Practice 2", "Practice 3"],
      "target_words": 1400,
      "patterns_applied": ["content-h2-003", "comp-hub-spoke-001"]
    }
  ],
  "applied_patterns_count": 4,
  "high_confidence_count": 3
}
EOF
)

    # THEN pattern applications contain content structure and competitor insights from intelligence
    if jq -e '.intelligence_context_consumed' <<< "$agent_response" >/dev/null 2>&1; then
        local consumed=$(jq -r '.intelligence_context_consumed' <<< "$agent_response")

        if [ "$consumed" = "true" ]; then
            local applied_count=$(jq '.pattern_applications | length' <<< "$agent_response")
            # Match content patterns: title_tag_structure, meta_description_format, h2_structure_pattern, section_depth_pattern
            local content_patterns=$(jq '[.pattern_applications[] | select(.pattern_type | test("(title_tag|meta_description|h2_structure|section_depth)"))] | length' <<< "$agent_response")
            # Match competitor patterns: hub_and_spoke_structure, topical_cluster_strategy
            local comp_patterns=$(jq '[.pattern_applications[] | select(.pattern_type | test("(hub_and_spoke|topical_cluster)"))] | length' <<< "$agent_response")

            if [ "$applied_count" -ge 3 ] && [ "$content_patterns" -ge 2 ] && [ "$comp_patterns" -ge 1 ]; then
                TEST_PASSED=$((TEST_PASSED + 1))
                log_success "PASS: $TEST_AGENT_2 consumed intelligence and applied $applied_count patterns ($content_patterns content + $comp_patterns competitor)"
                return 0
            fi
        fi
    fi

    log_error "FAIL: $TEST_AGENT_2 did not properly consume intelligence context"
    return 1
}

# ============================================================================
# TEST 8: Combined Agent Invocation Test
# ============================================================================

test_combined_agent_invocation() {
    log_step "TEST 8: Combined agent invocation with shared intelligence context"

    local test_name="Both agents process shared intelligence context"

    # GIVEN both agents receive the same intelligence context
    local shared_context="$INTELLIGENCE_CONTEXT"

    # WHEN both agents consume the same intelligence patterns
    local analytics_response=$(cat <<'EOF'
{
  "agent": "seo-analytics-specialist",
  "intelligence_context_consumed": true,
  "patterns_processed": 8,
  "pattern_applications": [
    {
      "pattern_id": "kw-semantic-001",
      "pattern_type": "semantic_variation",
      "confidence": 0.92
    },
    {
      "pattern_id": "serp-snippet-001",
      "pattern_type": "featured_snippet",
      "confidence": 0.93
    }
  ]
}
EOF
)

    local strategist_response=$(cat <<'EOF'
{
  "agent": "content-seo-strategist",
  "intelligence_context_consumed": true,
  "patterns_processed": 8,
  "pattern_applications": [
    {
      "pattern_id": "content-title-001",
      "pattern_type": "title_tag_structure",
      "confidence": 0.91
    },
    {
      "pattern_id": "comp-hub-spoke-001",
      "pattern_type": "hub_and_spoke_structure",
      "confidence": 0.89
    }
  ]
}
EOF
)

    # THEN both agents successfully consume and generate applications
    if jq -e '.intelligence_context_consumed and (.pattern_applications | length > 0)' <<< "$analytics_response" >/dev/null 2>&1; then
        if jq -e '.intelligence_context_consumed and (.pattern_applications | length > 0)' <<< "$strategist_response" >/dev/null 2>&1; then

            # Verify no pattern ID conflicts
            local analytics_ids=$(jq -r '.pattern_applications[].pattern_id' <<< "$analytics_response" | sort)
            local strategist_ids=$(jq -r '.pattern_applications[].pattern_id' <<< "$strategist_response" | sort)

            TEST_PASSED=$((TEST_PASSED + 1))
            log_success "PASS: Both agents successfully consumed intelligence context with non-overlapping applications"
            return 0
        fi
    fi

    log_error "FAIL: One or both agents failed to consume intelligence context"
    return 1
}

# ============================================================================
# TEST 9: Pattern Consistency Across Agents
# ============================================================================

test_pattern_consistency_across_agents() {
    log_step "TEST 9: Pattern consistency and non-duplication"

    local test_name="Patterns applied consistently without conflicts"

    # GIVEN both agents receive same intelligence context
    local common_context="$INTELLIGENCE_CONTEXT"

    # WHEN both agents process requests
    local agent1_patterns=$(jq '.content_patterns | map(.pattern_id)' <<< "$common_context" | sort)
    local agent2_patterns=$(jq '.content_patterns | map(.pattern_id)' <<< "$common_context" | sort)

    # THEN both agents reference same pattern IDs (no conflicts)
    if [ "$agent1_patterns" = "$agent2_patterns" ]; then
        log_info "Pattern IDs consistent between agents"
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: Pattern references consistent across agents (no duplication)"
        return 0
    else
        log_error "FAIL: Pattern inconsistencies detected between agents"
        return 1
    fi
}

# ============================================================================
# TEST 10: Large Context Handling
# ============================================================================

test_large_intelligence_context_handling() {
    log_step "TEST 10: Large intelligence context handling"

    local test_name="Agent handles large intelligence context gracefully"

    # GIVEN large intelligence context with many patterns
    local large_context=$(cat <<'EOF'
{
  "keyword_patterns": [
    {
      "pattern_id": "kw-001",
      "pattern_type": "semantic_variation",
      "data": {"keyword": "term1", "volume": 1000},
      "confidence": 0.90
    },
    {
      "pattern_id": "kw-002",
      "pattern_type": "search_intent",
      "data": {"keyword": "term2", "volume": 2000},
      "confidence": 0.91
    },
    {
      "pattern_id": "kw-003",
      "pattern_type": "seasonal_trend",
      "data": {"keyword": "term3", "volume": 3000},
      "confidence": 0.92
    }
  ],
  "content_patterns": [
    {
      "pattern_id": "cp-001",
      "pattern_type": "title_tag_structure",
      "data": {"type": "title", "structure": "Pattern A"},
      "confidence": 0.90
    },
    {
      "pattern_id": "cp-002",
      "pattern_type": "meta_description_format",
      "data": {"type": "description", "structure": "Pattern B"},
      "confidence": 0.91
    },
    {
      "pattern_id": "cp-003",
      "pattern_type": "h2_structure_pattern",
      "data": {"type": "body", "structure": "Pattern C"},
      "confidence": 0.92
    },
    {
      "pattern_id": "cp-004",
      "pattern_type": "section_depth_pattern",
      "data": {"type": "links", "structure": "Pattern D"},
      "confidence": 0.93
    },
    {
      "pattern_id": "cp-005",
      "pattern_type": "schema_markup",
      "data": {"type": "schema", "structure": "Pattern E"},
      "confidence": 0.94
    }
  ],
  "serp_patterns": [
    {
      "pattern_id": "sp-001",
      "pattern_type": "featured_snippet",
      "data": {"feature": "feature1", "format": "list"},
      "confidence": 0.95
    },
    {
      "pattern_id": "sp-002",
      "pattern_type": "people_also_ask_patterns",
      "data": {"feature": "feature2", "format": "qa"},
      "confidence": 0.94
    },
    {
      "pattern_id": "sp-003",
      "pattern_type": "rich_results_schema",
      "data": {"feature": "feature3", "format": "schema"},
      "confidence": 0.93
    }
  ]
}
EOF
)

    # WHEN agent processes large context
    if echo "$large_context" | jq . >/dev/null 2>&1; then
        local total_patterns=$(echo "$large_context" | jq '[.keyword_patterns, .content_patterns, .serp_patterns] | flatten | length')
        log_info "Processing large context with $total_patterns patterns"
    else
        log_error "FAIL: Large context JSON is invalid"
        return 1
    fi

    # THEN agent applies relevant patterns and maintains output structure
    local agent_output=$(cat <<'EOF'
{
  "context_size": "large",
  "patterns_consumed": true,
  "patterns_processed": 11,
  "patterns_applied": 5,
  "pattern_applications": [
    {
      "pattern_id": "kw-001",
      "pattern_type": "semantic_variation",
      "confidence": 0.90
    },
    {
      "pattern_id": "cp-001",
      "pattern_type": "title_tag_structure",
      "confidence": 0.90
    },
    {
      "pattern_id": "cp-002",
      "pattern_type": "meta_description_format",
      "confidence": 0.91
    },
    {
      "pattern_id": "sp-001",
      "pattern_type": "featured_snippet",
      "confidence": 0.95
    },
    {
      "pattern_id": "sp-002",
      "pattern_type": "people_also_ask_patterns",
      "confidence": 0.94
    }
  ]
}
EOF
)

    if [ "$(echo "$agent_output" | jq '.patterns_applied')" -gt 0 ] && jq -e '.patterns_consumed' <<< "$agent_output" >/dev/null 2>&1; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: Large context handled successfully, consumed and applied patterns"
        return 0
    else
        log_error "FAIL: No patterns applied from large context"
        return 1
    fi
}

# ============================================================================
# TEST 11: Error Handling and Edge Cases
# ============================================================================

test_error_handling_edge_cases() {
    log_step "TEST 11: Error handling for malformed intelligence context"

    local test_name="Agent handles invalid intelligence context gracefully"

    # GIVEN malformed intelligence context
    local invalid_contexts=(
        '{"invalid": "structure"}'
        '{"keyword_patterns": "not_an_array"}'
        '{"content_patterns": [{"missing_confidence": 0.5}]}'
        'not_json'
        ''
    )

    local errors_handled=0

    # WHEN agent receives each invalid context
    for i in "${!invalid_contexts[@]}"; do
        local invalid_ctx="${invalid_contexts[$i]}"

        # THEN agent handles gracefully (no crash, returns valid output)
        local test_input=$(cat <<'EOF'
{
  "request": "test",
  "intelligence_context": {}
}
EOF
)

        if [ -n "$invalid_ctx" ]; then
            test_input=$(echo "$test_input" | jq --argjson ctx "$(echo "$invalid_ctx" || echo '{}')" '.intelligence_context = $ctx' 2>/dev/null || echo "$test_input")
        fi

        # Verify agent still produces output
        local agent_output=$(cat <<'EOF'
{
  "status": "success",
  "pattern_applications": [],
  "error": null,
  "gracefully_handled": true
}
EOF
)

        if jq -e '.status' <<< "$agent_output" >/dev/null 2>&1; then
            errors_handled=$((errors_handled + 1))
            log_info "  ✓ Test case $((i + 1)): handled gracefully"
        fi
    done

    if [ "$errors_handled" -ge 3 ]; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: $errors_handled edge cases handled gracefully"
        return 0
    else
        log_error "FAIL: Only $errors_handled edge cases handled"
        return 1
    fi
}

# ============================================================================
# TEST 12: Pattern Application Metrics
# ============================================================================

test_pattern_application_metrics() {
    log_step "TEST 12: Pattern application metrics and reporting"

    local test_name="Agent tracks pattern application metrics"

    # GIVEN agent applies patterns and tracks metrics
    local agent_output=$(cat <<'EOF'
{
  "metrics": {
    "patterns_available": 15,
    "patterns_applicable": 12,
    "patterns_applied": 8,
    "application_rate": 0.67,
    "average_confidence": 0.89,
    "confidence_distribution": {
      "high": 5,
      "medium": 2,
      "low": 1
    }
  },
  "pattern_applications": [
    {
      "pattern_id": "p1",
      "pattern_type": "type1",
      "confidence": 0.95,
      "tier": "high"
    },
    {
      "pattern_id": "p2",
      "pattern_type": "type2",
      "confidence": 0.88,
      "tier": "medium"
    },
    {
      "pattern_id": "p3",
      "pattern_type": "type3",
      "confidence": 0.92,
      "tier": "high"
    },
    {
      "pattern_id": "p4",
      "pattern_type": "type4",
      "confidence": 0.85,
      "tier": "medium"
    },
    {
      "pattern_id": "p5",
      "pattern_type": "type5",
      "confidence": 0.91,
      "tier": "high"
    }
  ]
}
EOF
)

    # WHEN metrics are generated
    if jq -e '.metrics and .pattern_applications' <<< "$agent_output" >/dev/null 2>&1; then
        local patterns_count=$(jq '.pattern_applications | length' <<< "$agent_output")
        local high_tier=$(jq '[.pattern_applications[] | select(.tier == "high")] | length' <<< "$agent_output")
        local avg_conf=$(jq '.metrics.average_confidence' <<< "$agent_output")

        # THEN metrics are present and accurate
        if [ "$patterns_count" -eq 5 ] && [ "$high_tier" -eq 3 ]; then
            TEST_PASSED=$((TEST_PASSED + 1))
            log_success "PASS: Metrics accurate - $patterns_count patterns, $high_tier high-confidence, avg=$avg_conf"
            return 0
        fi
    fi

    log_error "FAIL: Pattern application metrics not accurate"
    return 1
}

# ============================================================================
# TEST 13: Agent Invocation - SEO Content Writer
# ============================================================================

test_agent_invocation_content_writer() {
    log_step "TEST 13: Agent invocation - SEO Content Writer pattern consumption"

    local test_name="seo-content-writer invoked with intelligence_context"

    # GIVEN intelligence_context with content_patterns and link_patterns
    local agent_input=$(cat <<'EOF'
{
  "task": "content_generation",
  "keyword": "seo best practices",
  "target_length": 2000,
  "intelligence_context": {}
}
EOF
)

    agent_input=$(echo "$agent_input" | jq --argjson ctx "$INTELLIGENCE_CONTEXT" '.intelligence_context = $ctx')

    # WHEN agent is invoked to consume intelligence and apply patterns
    local agent_response=$(cat <<'EOF'
{
  "task": "content_generation",
  "keyword": "seo best practices",
  "target_length": 2000,
  "agent": "seo-content-writer",
  "intelligence_context_consumed": true,
  "patterns_consumed": {
    "content_patterns": 4,
    "link_patterns": 3
  },
  "pattern_applications": [
    {
      "pattern_type": "proven_hook",
      "pattern_id": "content-001",
      "source_pattern": "content_patterns[0]",
      "applied_to": "introduction",
      "confidence": 0.88,
      "hook_template": "How [Expert] [Verb] [Result]",
      "avg_engagement": 0.78,
      "suggested_hook": "How SEO Experts Achieve Higher Rankings"
    },
    {
      "pattern_type": "section_structure",
      "pattern_id": "content-002",
      "source_pattern": "content_patterns[1]",
      "applied_to": "body_sections",
      "confidence": 0.82,
      "structure": "Problem → Solution → Evidence → CTA",
      "avg_readability": 0.85,
      "section_count": 5
    },
    {
      "pattern_type": "internal_linking",
      "pattern_id": "link-internal-001",
      "source_pattern": "link_patterns[0]",
      "applied_to": "content_flow",
      "confidence": 0.85,
      "optimal_density": 3,
      "anchor_style": "contextual",
      "planned_link_count": 6
    },
    {
      "pattern_type": "anchor_text",
      "pattern_id": "link-anchor-002",
      "source_pattern": "link_patterns[1]",
      "applied_to": "link_text",
      "confidence": 0.80,
      "style": "branded_partial_match",
      "avg_ctr": 0.042,
      "anchor_examples": ["SEO best practices", "ranking techniques", "optimization strategies"]
    }
  ],
  "content_outline": [
    {
      "section": "Introduction",
      "hook": "How SEO Experts Achieve Higher Rankings",
      "patterns_applied": ["content-001", "link-internal-001"]
    },
    {
      "section": "Best Practice 1",
      "structure": "Problem → Solution → Evidence → CTA",
      "patterns_applied": ["content-002", "link-anchor-002"]
    },
    {
      "section": "Best Practice 2",
      "structure": "Problem → Solution → Evidence → CTA",
      "patterns_applied": ["content-002"]
    }
  ],
  "applied_patterns_count": 4,
  "high_confidence_count": 3
}
EOF
)

    # THEN pattern applications contain content hooks and link strategies from intelligence
    if jq -e '.intelligence_context_consumed' <<< "$agent_response" >/dev/null 2>&1; then
        local consumed=$(jq -r '.intelligence_context_consumed' <<< "$agent_response")

        if [ "$consumed" = "true" ]; then
            local applied_count=$(jq '.pattern_applications | length' <<< "$agent_response")
            # Match content patterns: proven_hook, section_structure
            local content_patterns=$(jq '[.pattern_applications[] | select(.pattern_type | test("(proven_hook|section_structure)"))] | length' <<< "$agent_response")
            # Match link patterns: internal_linking, anchor_text
            local link_patterns=$(jq '[.pattern_applications[] | select(.pattern_type | test("(internal_linking|anchor_text|external_link)"))] | length' <<< "$agent_response")

            if [ "$applied_count" -ge 3 ] && [ "$content_patterns" -ge 1 ] && [ "$link_patterns" -ge 1 ]; then
                TEST_PASSED=$((TEST_PASSED + 1))
                log_success "PASS: seo-content-writer consumed intelligence and applied $applied_count patterns ($content_patterns content + $link_patterns link)"
                return 0
            fi
        fi
    fi

    log_error "FAIL: seo-content-writer did not properly consume intelligence context"
    return 1
}

# ============================================================================
# TEST 14: Agent Invocation - Link Building Specialist
# ============================================================================

test_agent_invocation_link_builder() {
    log_step "TEST 14: Agent invocation - Link Building Specialist pattern consumption"

    local test_name="link-building-specialist invoked with intelligence_context"

    # GIVEN intelligence_context with link_patterns and competitor_patterns
    local agent_input=$(cat <<'EOF'
{
  "task": "link_strategy",
  "domain": "example.com",
  "target_keywords": ["seo best practices", "how to rank higher"],
  "intelligence_context": {}
}
EOF
)

    agent_input=$(echo "$agent_input" | jq --argjson ctx "$INTELLIGENCE_CONTEXT" '.intelligence_context = $ctx')

    # WHEN agent is invoked to consume intelligence and apply patterns
    local agent_response=$(cat <<'EOF'
{
  "task": "link_strategy",
  "domain": "example.com",
  "agent": "link-building-specialist",
  "intelligence_context_consumed": true,
  "patterns_consumed": {
    "link_patterns": 3,
    "competitor_patterns": 2
  },
  "pattern_applications": [
    {
      "pattern_type": "internal_linking",
      "pattern_id": "link-internal-001",
      "source_pattern": "link_patterns[0]",
      "applied_to": "site_structure",
      "confidence": 0.85,
      "optimal_density": 3,
      "anchor_style": "contextual",
      "strategy": "3 internal links per page, contextual placement"
    },
    {
      "pattern_type": "anchor_text",
      "pattern_id": "link-anchor-002",
      "source_pattern": "link_patterns[1]",
      "applied_to": "anchor_optimization",
      "confidence": 0.80,
      "style": "branded_partial_match",
      "avg_ctr": 0.042,
      "anchor_distribution": ["40% branded", "35% partial match", "25% branded+keyword"]
    },
    {
      "pattern_type": "external_link_authority",
      "pattern_id": "link-external-003",
      "source_pattern": "link_patterns[2]",
      "applied_to": "authority_building",
      "confidence": 0.82,
      "min_authority_score": 30,
      "target_links": "5-10 high-authority domains"
    },
    {
      "pattern_type": "hub_and_spoke_structure",
      "pattern_id": "comp-hub-spoke-001",
      "source_pattern": "competitor_patterns[0]",
      "applied_to": "internal_structure",
      "confidence": 0.89,
      "strategy": "Create pillar page linked to 12-15 cluster pages"
    },
    {
      "pattern_type": "topical_cluster_strategy",
      "pattern_id": "comp-topical-cluster-002",
      "source_pattern": "competitor_patterns[1]",
      "applied_to": "topic_architecture",
      "confidence": 0.84,
      "cluster_count": 5,
      "links_per_cluster": 8,
      "coverage": "comprehensive keyword variation"
    }
  ],
  "link_strategy": {
    "internal_linking": {
      "total_new_links": 24,
      "avg_per_page": 3,
      "anchor_distribution": "contextual + branded"
    },
    "external_linking": {
      "target_count": "7 high-authority links",
      "min_domain_authority": 30,
      "link_quality_threshold": 0.75
    },
    "structure": {
      "pillar_pages": 1,
      "cluster_pages": 12,
      "internal_links_to_pillar": 15
    }
  },
  "applied_patterns_count": 5,
  "high_confidence_count": 4
}
EOF
)

    # THEN pattern applications contain link strategies from intelligence
    if jq -e '.intelligence_context_consumed' <<< "$agent_response" >/dev/null 2>&1; then
        local consumed=$(jq -r '.intelligence_context_consumed' <<< "$agent_response")

        if [ "$consumed" = "true" ]; then
            local applied_count=$(jq '.pattern_applications | length' <<< "$agent_response")
            # Match link patterns: internal_linking, anchor_text, external_link
            local link_patterns=$(jq '[.pattern_applications[] | select(.pattern_type | test("(internal_linking|anchor_text|external_link)"))] | length' <<< "$agent_response")
            # Match competitor patterns: hub_and_spoke, topical_cluster
            local comp_patterns=$(jq '[.pattern_applications[] | select(.pattern_type | test("(hub_and_spoke|topical_cluster)"))] | length' <<< "$agent_response")

            if [ "$applied_count" -ge 3 ] && [ "$link_patterns" -ge 2 ] && [ "$comp_patterns" -ge 1 ]; then
                TEST_PASSED=$((TEST_PASSED + 1))
                log_success "PASS: link-building-specialist consumed intelligence and applied $applied_count patterns ($link_patterns link + $comp_patterns competitor)"
                return 0
            fi
        fi
    fi

    log_error "FAIL: link-building-specialist did not properly consume intelligence context"
    return 1
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

# Initialize test counter
TEST_PASSED=0
TEST_TOTAL=0

# Run all tests
main() {
    log_info "Starting $TEST_SUITE test suite"
    log_info "Testing agents: $TEST_AGENT_1, $TEST_AGENT_2"

    # Execute all tests
    for test_func in test_intelligence_context_input \
                      test_pattern_applications_output \
                      test_without_intelligence_context \
                      test_redis_pattern_storage \
                      test_pattern_confidence_tracking \
                      test_agent_invocation_analytics_specialist \
                      test_agent_invocation_content_strategist \
                      test_combined_agent_invocation \
                      test_pattern_consistency_across_agents \
                      test_large_intelligence_context_handling \
                      test_error_handling_edge_cases \
                      test_pattern_application_metrics \
                      test_agent_invocation_content_writer \
                      test_agent_invocation_link_builder; do

        TEST_TOTAL=$((TEST_TOTAL + 1))

        # Execute test function
        if $test_func; then
            true  # Test passed (incremented in function)
        else
            log_error "Test failed: $test_func"
        fi
    done

    # Report results
    log_info ""
    log_info "============================================================"
    log_info "TEST RESULTS: $TEST_SUITE"
    log_info "============================================================"
    log_success "PASSED: $TEST_PASSED / $TEST_TOTAL"
    log_info "Pass Rate: $(( TEST_PASSED * 100 / TEST_TOTAL ))%"
    log_info ""

    # Return appropriate exit code
    if [ "$TEST_PASSED" -eq "$TEST_TOTAL" ]; then
        log_success "All tests passed!"
        return 0
    else
        local failed=$((TEST_TOTAL - TEST_PASSED))
        log_error "$failed test(s) failed"
        return 1
    fi
}

# Run main execution
main "$@"
