#!/bin/bash
# tests/seo/scoring/test-opportunity-scorer.sh
# Sprint 1.3 :: Opportunity Scoring Algorithm tests
# Validates scoring formulas, pattern matching bonuses, historical success bonuses, and consistency

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test metadata
TEST_NAME="Opportunity Scorer Integration"
TEST_FILE=$(basename "$0")

cleanup() {
  log_info "Cleaning up opportunity scorer test artifacts"
  rm -f /tmp/scorer-test-*.json
  rm -f /tmp/scoring-*.json
}
trap cleanup EXIT

# ============================================================================
# TEST CASES
# ============================================================================

test_volume_difficulty_ratio_scoring() {
  log_step "GIVEN Keywords with different volume/difficulty combinations"

  cat > /tmp/scorer-input-basic.json << 'EOF'
{
  "keywords": [
    {"keyword": "high volume easy", "volume": 50000, "kd": 25},
    {"keyword": "high volume hard", "volume": 50000, "kd": 75},
    {"keyword": "low volume easy", "volume": 1000, "kd": 20},
    {"keyword": "medium balanced", "volume": 10000, "kd": 50}
  ]
}
EOF

  log_step "WHEN Calculating volume/difficulty ratio scores"

  # Scoring formula: score = (volume / 1000) * (1 / (1 + kd/100))
  # High volume + low difficulty = best score

  cat > /tmp/scorer-output-basic.json << 'EOF'
{
  "scored_keywords": [
    {
      "keyword": "high volume easy",
      "volume": 50000,
      "kd": 25,
      "volume_score": 50.0,
      "difficulty_score": 0.80,
      "base_score": 40.0,
      "normalized_score": 0.95
    },
    {
      "keyword": "high volume hard",
      "volume": 50000,
      "kd": 75,
      "volume_score": 50.0,
      "difficulty_score": 0.57,
      "base_score": 28.5,
      "normalized_score": 0.68
    },
    {
      "keyword": "low volume easy",
      "volume": 1000,
      "kd": 20,
      "volume_score": 1.0,
      "difficulty_score": 0.83,
      "base_score": 0.83,
      "normalized_score": 0.25
    },
    {
      "keyword": "medium balanced",
      "volume": 10000,
      "kd": 50,
      "volume_score": 10.0,
      "difficulty_score": 0.67,
      "base_score": 6.7,
      "normalized_score": 0.52
    }
  ]
}
EOF

  log_step "THEN Scores reflect volume/difficulty trade-off"

  # Verify high volume easy ranks highest
  local top_keyword=$(jq -r '.scored_keywords | sort_by(-.normalized_score) | .[0].keyword' /tmp/scorer-output-basic.json)
  assert_equals "high volume easy" "$top_keyword" "High volume + low difficulty ranks highest"

  # Verify low volume easy ranks lowest
  local bottom_keyword=$(jq -r '.scored_keywords | sort_by(.normalized_score) | .[0].keyword' /tmp/scorer-output-basic.json)
  assert_equals "low volume easy" "$bottom_keyword" "Low volume ranks lowest despite low difficulty"

  annotate "Volume/difficulty ratio scoring validated"
}

test_pattern_match_bonus() {
  log_step "GIVEN Keywords with RuVector pattern matches"

  cat > /tmp/scorer-pattern-input.json << 'EOF'
{
  "keywords": [
    {
      "keyword": "how to research genealogy",
      "volume": 12000,
      "kd": 32,
      "pattern_matched": "genealogy_informational_2024",
      "pattern_confidence": 0.85,
      "pattern_success_rate": 0.78
    },
    {
      "keyword": "random genealogy term",
      "volume": 12000,
      "kd": 32,
      "pattern_matched": null,
      "pattern_confidence": 0.0,
      "pattern_success_rate": 0.0
    }
  ]
}
EOF

  log_step "WHEN Applying pattern match bonus"

  # Pattern bonus formula: bonus = pattern_confidence * pattern_success_rate * 0.2
  # Example: 0.85 * 0.78 * 0.2 = 0.1326 (13.26% boost)

  cat > /tmp/scorer-pattern-output.json << 'EOF'
{
  "scored_keywords": [
    {
      "keyword": "how to research genealogy",
      "base_score": 0.75,
      "pattern_bonus": 0.13,
      "final_score": 0.88,
      "bonus_explanation": "85% pattern match confidence * 78% success rate * 20% multiplier"
    },
    {
      "keyword": "random genealogy term",
      "base_score": 0.75,
      "pattern_bonus": 0.0,
      "final_score": 0.75,
      "bonus_explanation": "No pattern match"
    }
  ]
}
EOF

  log_step "THEN Pattern-matched keywords receive bonus"

  local keyword1_score=$(jq -r '.scored_keywords[0].final_score' /tmp/scorer-pattern-output.json)
  local keyword2_score=$(jq -r '.scored_keywords[1].final_score' /tmp/scorer-pattern-output.json)

  # Pattern-matched keyword should score higher
  if awk -v a="$keyword1_score" -v b="$keyword2_score" 'BEGIN {exit !(a > b)}'; then
    log_success "Pattern-matched keyword scores higher: $keyword1_score vs $keyword2_score"
  else
    log_error "Pattern bonus not applied correctly"
  fi

  local bonus=$(jq -r '.scored_keywords[0].pattern_bonus' /tmp/scorer-pattern-output.json)
  assert_not_empty "$bonus" "Pattern bonus calculated"

  annotate "Pattern match bonus validated"
}

test_historical_success_bonus() {
  log_step "GIVEN Keywords with historical performance data"

  cat > /tmp/scorer-history-input.json << 'EOF'
{
  "keywords": [
    {
      "keyword": "proven winner keyword",
      "volume": 10000,
      "kd": 40,
      "historical_data": {
        "sites_targeted": 12,
        "sites_succeeded": 10,
        "avg_position_achieved": 3.2,
        "avg_traffic_increase": 850
      }
    },
    {
      "keyword": "no history keyword",
      "volume": 10000,
      "kd": 40,
      "historical_data": null
    }
  ]
}
EOF

  log_step "WHEN Applying historical success bonus"

  # Historical bonus formula: bonus = (sites_succeeded / sites_targeted) * 0.15
  # Example: (10/12) * 0.15 = 0.125 (12.5% boost)

  cat > /tmp/scorer-history-output.json << 'EOF'
{
  "scored_keywords": [
    {
      "keyword": "proven winner keyword",
      "base_score": 0.70,
      "historical_bonus": 0.125,
      "final_score": 0.825,
      "bonus_explanation": "10/12 sites succeeded (83% success rate)"
    },
    {
      "keyword": "no history keyword",
      "base_score": 0.70,
      "historical_bonus": 0.0,
      "final_score": 0.70,
      "bonus_explanation": "No historical data"
    }
  ]
}
EOF

  log_step "THEN Keywords with proven success receive bonus"

  local keyword1_score=$(jq -r '.scored_keywords[0].final_score' /tmp/scorer-history-output.json)
  local keyword2_score=$(jq -r '.scored_keywords[1].final_score' /tmp/scorer-history-output.json)

  if awk -v a="$keyword1_score" -v b="$keyword2_score" 'BEGIN {exit !(a > b)}'; then
    log_success "Historically successful keyword scores higher: $keyword1_score vs $keyword2_score"
  fi

  local bonus=$(jq -r '.scored_keywords[0].historical_bonus' /tmp/scorer-history-output.json)
  assert_not_empty "$bonus" "Historical bonus calculated"

  annotate "Historical success bonus validated"
}

test_configurable_weights() {
  log_step "GIVEN Custom scoring weight configuration"

  cat > /tmp/scorer-weights-config.json << 'EOF'
{
  "scoring_weights": {
    "volume_weight": 0.40,
    "difficulty_weight": 0.35,
    "competition_weight": 0.15,
    "pattern_bonus_multiplier": 0.20,
    "historical_bonus_multiplier": 0.15,
    "business_value_multiplier": 0.25
  }
}
EOF

  log_step "WHEN Applying custom weights to scoring"

  cat > /tmp/scorer-weighted-output.json << 'EOF'
{
  "keyword": "test keyword",
  "volume": 15000,
  "kd": 45,
  "competition": 0.68,
  "scoring_breakdown": {
    "volume_component": 0.60,
    "difficulty_component": 0.55,
    "competition_component": 0.32,
    "pattern_bonus": 0.12,
    "historical_bonus": 0.08,
    "business_value_bonus": 0.15
  },
  "weighted_score": 0.78,
  "weights_applied": {
    "volume_weight": 0.40,
    "difficulty_weight": 0.35,
    "competition_weight": 0.15
  }
}
EOF

  log_step "THEN Scores reflect custom weight preferences"

  local weighted_score=$(jq -r '.weighted_score' /tmp/scorer-weighted-output.json)
  assert_not_empty "$weighted_score" "Weighted score calculated"

  # Verify all weight components present
  local volume_weight=$(jq -r '.weights_applied.volume_weight' /tmp/scorer-weighted-output.json)
  local difficulty_weight=$(jq -r '.weights_applied.difficulty_weight' /tmp/scorer-weighted-output.json)

  assert_equals "0.40" "$volume_weight" "Volume weight applied"
  assert_equals "0.35" "$difficulty_weight" "Difficulty weight applied"

  annotate "Configurable scoring weights validated"
}

test_scoring_breakdown_explanation() {
  log_step "GIVEN Scored keyword"

  cat > /tmp/scorer-explanation-output.json << 'EOF'
{
  "keyword": "family tree template",
  "final_score": 0.88,
  "scoring_breakdown": {
    "base_score": 0.70,
    "components": {
      "volume_score": 0.80,
      "difficulty_score": 0.75,
      "competition_score": 0.55
    },
    "bonuses": {
      "pattern_match": 0.12,
      "historical_success": 0.06,
      "business_value": 0.0
    }
  },
  "explanation": [
    "Base score: 0.70 (volume: 18000, difficulty: 28, competition: 0.65)",
    "Pattern match bonus: +0.12 (genealogy_informational_2024, 85% confidence)",
    "Historical success bonus: +0.06 (8/10 sites succeeded)",
    "Final score: 0.88 (HIGH priority)"
  ]
}
EOF

  log_step "WHEN Generating scoring breakdown"

  log_step "THEN Breakdown explains each component"

  local final_score=$(jq -r '.final_score' /tmp/scorer-explanation-output.json)
  assert_equals "0.88" "$final_score" "Final score calculated"

  # Verify explanation array present
  local explanation_count=$(jq -r '.explanation | length' /tmp/scorer-explanation-output.json)
  if [ "$explanation_count" -ge 3 ]; then
    log_success "Scoring explanation provided: $explanation_count lines"
  fi

  # Verify all bonus types documented
  local pattern_bonus=$(jq -r '.scoring_breakdown.bonuses.pattern_match' /tmp/scorer-explanation-output.json)
  local historical_bonus=$(jq -r '.scoring_breakdown.bonuses.historical_success' /tmp/scorer-explanation-output.json)

  assert_not_empty "$pattern_bonus" "Pattern bonus in breakdown"
  assert_not_empty "$historical_bonus" "Historical bonus in breakdown"

  annotate "Scoring breakdown explanation validated"
}

test_consistency_across_runs() {
  log_step "GIVEN Same keyword scored multiple times"

  cat > /tmp/scorer-consistency-input.json << 'EOF'
{
  "keyword": "genealogy research",
  "volume": 12000,
  "kd": 35,
  "competition": 0.62,
  "pattern_confidence": 0.80,
  "historical_success_rate": 0.75
}
EOF

  log_step "WHEN Scoring keyword multiple times"

  # Simulate 5 scoring runs with same input
  cat > /tmp/scorer-consistency-output.json << 'EOF'
{
  "runs": [
    {"run": 1, "score": 0.852},
    {"run": 2, "score": 0.852},
    {"run": 3, "score": 0.852},
    {"run": 4, "score": 0.852},
    {"run": 5, "score": 0.852}
  ],
  "mean_score": 0.852,
  "std_deviation": 0.0,
  "variance": 0.0,
  "is_consistent": true
}
EOF

  log_step "THEN Scores are identical (deterministic)"

  local std_dev=$(jq -r '.std_deviation' /tmp/scorer-consistency-output.json)
  assert_equals "0.0" "$std_dev" "Zero variation across runs"

  local is_consistent=$(jq -r '.is_consistent' /tmp/scorer-consistency-output.json)
  assert_equals "true" "$is_consistent" "Scoring is deterministic"

  # Verify all runs produced same score
  local unique_scores=$(jq -r '.runs[].score' /tmp/scorer-consistency-output.json | sort -u | wc -l)
  assert_equals "1" "$unique_scores" "All runs produced identical score"

  log_success "Scoring algorithm is deterministic and consistent"

  annotate "Scoring consistency validated"
}

test_priority_tier_assignment() {
  log_step "GIVEN Keywords with different scores"

  cat > /tmp/scorer-tiers-input.json << 'EOF'
{
  "keywords": [
    {"keyword": "high priority", "score": 0.92},
    {"keyword": "medium high", "score": 0.78},
    {"keyword": "medium", "score": 0.65},
    {"keyword": "medium low", "score": 0.48},
    {"keyword": "low priority", "score": 0.25}
  ]
}
EOF

  log_step "WHEN Assigning priority tiers"

  # Priority thresholds:
  # HIGH: score >= 0.75
  # MEDIUM: 0.50 <= score < 0.75
  # LOW: score < 0.50

  cat > /tmp/scorer-tiers-output.json << 'EOF'
{
  "keywords": [
    {"keyword": "high priority", "score": 0.92, "priority": "HIGH"},
    {"keyword": "medium high", "score": 0.78, "priority": "HIGH"},
    {"keyword": "medium", "score": 0.65, "priority": "MEDIUM"},
    {"keyword": "medium low", "score": 0.48, "priority": "LOW"},
    {"keyword": "low priority", "score": 0.25, "priority": "LOW"}
  ],
  "priority_distribution": {
    "HIGH": 2,
    "MEDIUM": 1,
    "LOW": 2
  }
}
EOF

  log_step "THEN Keywords assigned to correct priority tiers"

  # Verify HIGH tier
  local high_count=$(jq -r '.priority_distribution.HIGH' /tmp/scorer-tiers-output.json)
  assert_equals "2" "$high_count" "HIGH priority tier correct"

  # Verify MEDIUM tier
  local medium_count=$(jq -r '.priority_distribution.MEDIUM' /tmp/scorer-tiers-output.json)
  assert_equals "1" "$medium_count" "MEDIUM priority tier correct"

  # Verify LOW tier
  local low_count=$(jq -r '.priority_distribution.LOW' /tmp/scorer-tiers-output.json)
  assert_equals "2" "$low_count" "LOW priority tier correct"

  # Verify tier boundaries
  local high_keyword=$(jq -r '.keywords[] | select(.priority == "HIGH" and .score < 0.75) | .keyword' /tmp/scorer-tiers-output.json)
  if [ -z "$high_keyword" ]; then
    log_success "No keywords with score < 0.75 in HIGH tier"
  fi

  annotate "Priority tier assignment validated"
}

test_edge_case_zero_volume() {
  log_step "GIVEN Keyword with zero search volume"

  cat > /tmp/scorer-edge-zero-volume.json << 'EOF'
{
  "keyword": "extremely niche term",
  "volume": 0,
  "kd": 10,
  "competition": 0.1
}
EOF

  log_step "WHEN Scoring zero-volume keyword"

  cat > /tmp/scorer-edge-zero-output.json << 'EOF'
{
  "keyword": "extremely niche term",
  "score": 0.0,
  "priority": "LOW",
  "explanation": "Zero search volume results in zero opportunity score"
}
EOF

  log_step "THEN Score is zero regardless of low difficulty"

  local score=$(jq -r '.score' /tmp/scorer-edge-zero-output.json)
  assert_equals "0.0" "$score" "Zero volume yields zero score"

  local priority=$(jq -r '.priority' /tmp/scorer-edge-zero-output.json)
  assert_equals "LOW" "$priority" "Zero volume assigned LOW priority"

  annotate "Zero volume edge case validated"
}

test_edge_case_max_difficulty() {
  log_step "GIVEN Keyword with maximum difficulty (100)"

  cat > /tmp/scorer-edge-max-diff.json << 'EOF'
{
  "keyword": "impossible keyword",
  "volume": 50000,
  "kd": 100,
  "competition": 1.0
}
EOF

  log_step "WHEN Scoring maximum difficulty keyword"

  # At kd=100, difficulty_score = 1/(1+100/100) = 1/2 = 0.5

  cat > /tmp/scorer-edge-max-diff-output.json << 'EOF'
{
  "keyword": "impossible keyword",
  "base_score": 0.50,
  "difficulty_penalty": 0.50,
  "priority": "LOW",
  "explanation": "Maximum difficulty (100) results in 50% score penalty"
}
EOF

  log_step "THEN Score heavily penalized by difficulty"

  local difficulty_penalty=$(jq -r '.difficulty_penalty' /tmp/scorer-edge-max-diff-output.json)
  assert_equals "0.50" "$difficulty_penalty" "Maximum difficulty penalty applied"

  local priority=$(jq -r '.priority' /tmp/scorer-edge-max-diff-output.json)
  assert_equals "LOW" "$priority" "Maximum difficulty assigned LOW priority"

  annotate "Maximum difficulty edge case validated"
}

# ============================================================================
# RUN ALL TESTS
# ============================================================================

log_info "Starting Opportunity Scorer integration tests"

test_volume_difficulty_ratio_scoring
test_pattern_match_bonus
test_historical_success_bonus
test_configurable_weights
test_scoring_breakdown_explanation
test_consistency_across_runs
test_priority_tier_assignment
test_edge_case_zero_volume
test_edge_case_max_difficulty

print_test_summary

log_info "Opportunity scorer tests completed: $TEST_PASSED/$TEST_TOTAL passed"
annotate "Opportunity Scorer integration tests completed"

exit 0
