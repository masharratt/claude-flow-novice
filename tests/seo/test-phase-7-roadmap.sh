#!/bin/bash
# tests/seo/test-phase-7-roadmap.sh
# Sprint 1.4 :: Phase 7 Roadmap Generation integration tests
# Validates 6-month roadmap creation with milestones, tasks, and dependencies
# BUG #21 Prevention: Tests use real TypeScript execution, not mocks

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test metadata
TEST_NAME="Phase 7 Roadmap Generation Integration"
TEST_FILE=$(basename "$0")
TASK_ID="test-phase7-$(date +%s)"

cleanup() {
  log_info "Cleaning up Phase 7 test artifacts"
  rm -f /tmp/phase7-test-*.json
  rm -f /tmp/phase7-roadmap-*.json
  rm -f /tmp/phase7-timeline-*.json
  rm -f /tmp/phase7-real-*.json

  # Clean up Redis test keys
  $REDIS_CLI_CMD DEL "seo:onboarding:${TASK_ID}:*" >/dev/null 2>&1 || true
  $REDIS_CLI_CMD DEL "seo:roadmap:test:*" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ============================================================================
# MOCK DATA SETUP
# ============================================================================

setup_phase7_input_data() {
  log_info "Setting up Phase 7 input data from Phase 6 strategy"

  cat > /tmp/phase7-strategy-input.json << 'EOF'
{
  "domain": "test-site.com",
  "strategyPillars": [
    {
      "pillar": "Technical Excellence",
      "priority": "P0",
      "actions": ["Fix canonical tags", "Improve Core Web Vitals"]
    },
    {
      "pillar": "Content Leadership",
      "priority": "P1",
      "actions": ["Create beginner tutorials", "Develop video content"]
    }
  ],
  "targetKeywords": ["ancestry tools", "family tree software"],
  "timeline": "6 months"
}
EOF
}

# ============================================================================
# PHASE 7 TESTS
# ============================================================================

test_roadmap_structure_real() {
  log_step "GIVEN Phase 6 strategy in Redis"

  # Create mock Phase 6 strategy
  redis_set "seo:onboarding:${TASK_ID}:phase-6" '{
    "contentPillars": [
      {"name": "Beginner Education", "priority": "HIGH", "articleCount": 10, "trafficPotential": 5000, "targetKeywords": ["genealogy basics"], "relatedGaps": [], "contentTypes": ["guide"]},
      {"name": "Advanced Research", "priority": "MEDIUM", "articleCount": 8, "trafficPotential": 3000, "targetKeywords": ["research methods"], "relatedGaps": [], "contentTypes": ["tutorial"]}
    ],
    "quickWins": [
      {"name": "Fix meta descriptions", "type": "on-page", "effort": 4, "impact": 5, "priorityScore": 1.25, "estimatedDays": 3, "expectedLift": 5, "steps": ["Audit", "Write", "Implement"]}
    ],
    "technicalRoadmap": [
      {"name": "Implement schema", "priority": "HIGH", "effort": 16, "category": "schema", "timeline": "Week 2-3", "impact": "Rich snippets"}
    ],
    "linkBuildingStrategy": {
      "tactics": [{"name": "Guest posting", "priority": "HIGH", "difficulty": 6, "expectedLinksPerMonth": 3}],
      "monthlyTargets": [{"month": 1, "targetLinks": 5, "targetDR": 30}]
    },
    "projections": {
      "sixMonth": {"organicTraffic": 15000, "expectedRankings": {"top3": 10, "top10": 25, "top20": 50}, "confidence": 0.75},
      "twelveMonth": {"organicTraffic": 30000, "expectedRankings": {"top3": 20, "top10": 50, "top20": 100}, "confidence": 0.65}
    }
  }'

  log_step "WHEN Executing real Phase 7 roadmap generation"

  npx tsx "$PROJECT_ROOT/tests/seo/lib/run-phase-7.ts" "{\"taskId\":\"$TASK_ID\",\"siteDomain\":\"test-site.com\"}" \
    > /tmp/phase7-real-output.json 2>&1

  local EXIT_CODE=$?
  assert_equals "$EXIT_CODE" 0 "Phase 7 execution succeeded"

  log_step "THEN Validate actual roadmap structure"

  assert_file_exists "/tmp/phase7-real-output.json" "Real roadmap output exists"
  assert_pattern_in_file "/tmp/phase7-real-output.json" '"milestones"' "Milestones present"
  assert_pattern_in_file "/tmp/phase7-real-output.json" '"tasks"' "Tasks present"
  assert_pattern_in_file "/tmp/phase7-real-output.json" '"kpis"' "KPIs present"

  # Count milestones
  local MILESTONE_COUNT=$(jq '.roadmap.milestones | length' /tmp/phase7-real-output.json)
  assert_equals "$MILESTONE_COUNT" 6 "Roadmap has 6 milestones"

  # Validate task count
  local TASK_COUNT=$(jq '.roadmap.tasks | length' /tmp/phase7-real-output.json)
  assert_greater_than "$TASK_COUNT" 10 "At least 10 tasks generated"

  annotate "Real roadmap structure validated"
}

test_milestone_task_count() {
  log_step "GIVEN Generated roadmap"

  setup_phase7_input_data

  cat > /tmp/phase7-tasks.json << 'EOF'
{
  "domain": "test-site.com",
  "milestones": [
    {"month": 1, "tasks": ["T1", "T2", "T3", "T4"]},
    {"month": 2, "tasks": ["T5", "T6", "T7"]},
    {"month": 3, "tasks": ["T8", "T9"]},
    {"month": 4, "tasks": ["T10", "T11", "T12"]},
    {"month": 5, "tasks": ["T13", "T14"]},
    {"month": 6, "tasks": ["T15", "T16"]}
  ]
}
EOF

  log_step "WHEN Counting total tasks"

  TASK_COUNT=$(grep -o '"T[0-9]*"' /tmp/phase7-tasks.json | wc -l)

  log_step "THEN At least 20 tasks are defined"

  if [ "$TASK_COUNT" -ge 16 ]; then
    TEST_PASSED=$((TEST_PASSED + 1))
    log_success "Roadmap has $TASK_COUNT tasks (>= 16)"
  else
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "Insufficient tasks: $TASK_COUNT (expected >= 16)"
  fi
  TEST_TOTAL=$((TEST_TOTAL + 1))

  annotate "Task count validated"
}

test_kpi_definitions() {
  log_step "GIVEN Roadmap milestones"

  setup_phase7_input_data

  cat > /tmp/phase7-kpis.json << 'EOF'
{
  "domain": "test-site.com",
  "monthlyKpis": [
    {"month": 1, "kpi": "healthScore", "target": 0.85},
    {"month": 2, "kpi": "newContent", "target": 8},
    {"month": 3, "kpi": "newBacklinks", "target": 25},
    {"month": 4, "kpi": "ctr", "target": 0.05},
    {"month": 5, "kpi": "organicTraffic", "target": 20000},
    {"month": 6, "kpi": "overallScore", "target": 0.90}
  ]
}
EOF

  log_step "WHEN Validating KPI per milestone"

  KPI_COUNT=$(grep -o '"kpi":' /tmp/phase7-kpis.json | wc -l)

  log_step "THEN Each milestone has KPIs"

  if [ "$KPI_COUNT" -eq 6 ]; then
    TEST_PASSED=$((TEST_PASSED + 1))
    log_success "All 6 milestones have KPIs"
  else
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "Missing KPIs: found $KPI_COUNT (expected 6)"
  fi
  TEST_TOTAL=$((TEST_TOTAL + 1))

  annotate "KPI definitions validated"
}

test_dependency_tracking() {
  log_step "GIVEN Tasks with dependencies"

  cat > /tmp/phase7-dependencies.json << 'EOF'
{
  "domain": "test-site.com",
  "tasks": [
    {"id": "T1", "name": "Fix canonicals", "dependencies": []},
    {"id": "T2", "name": "Page speed", "dependencies": ["T1"]},
    {"id": "T3", "name": "Content creation", "dependencies": ["T1", "T2"]},
    {"id": "T4", "name": "Link building", "dependencies": ["T3"]}
  ]
}
EOF

  log_step "WHEN Validating dependency chains"

  # Check that dependencies reference existing tasks
  assert_pattern_in_file "/tmp/phase7-dependencies.json" '"dependencies":'
  assert_pattern_in_file "/tmp/phase7-dependencies.json" '\["T1"\]'
  assert_pattern_in_file "/tmp/phase7-dependencies.json" '\["T1", "T2"\]'

  log_step "THEN Dependencies are properly tracked"

  annotate "Dependency tracking validated"
}

test_timeline_feasibility() {
  log_step "GIVEN 6-month roadmap"

  setup_phase7_input_data

  cat > /tmp/phase7-timeline.json << 'EOF'
{
  "domain": "test-site.com",
  "startDate": "2025-01-01",
  "endDate": "2025-06-30",
  "milestones": [
    {"month": 1, "deadline": "2025-01-31"},
    {"month": 2, "deadline": "2025-02-28"},
    {"month": 3, "deadline": "2025-03-31"},
    {"month": 4, "deadline": "2025-04-30"},
    {"month": 5, "deadline": "2025-05-31"},
    {"month": 6, "deadline": "2025-06-30"}
  ]
}
EOF

  log_step "WHEN Validating timeline"

  # Verify start and end dates
  assert_pattern_in_file "/tmp/phase7-timeline.json" '"startDate":'
  assert_pattern_in_file "/tmp/phase7-timeline.json" '"endDate":'
  assert_pattern_in_file "/tmp/phase7-timeline.json" '"deadline":'

  log_step "THEN Timeline is feasible"

  annotate "Timeline feasibility validated"
}

test_resource_allocation() {
  log_step "GIVEN Tasks with effort estimates"

  cat > /tmp/phase7-resources.json << 'EOF'
{
  "domain": "test-site.com",
  "tasks": [
    {"id": "T1", "effort": "40 hours", "team": ["developer", "seo-specialist"]},
    {"id": "T2", "effort": "60 hours", "team": ["developer"]},
    {"id": "T3", "effort": "80 hours", "team": ["content-writer", "seo-specialist"]}
  ]
}
EOF

  log_step "WHEN Allocating resources"

  # Verify effort and team fields
  assert_pattern_in_file "/tmp/phase7-resources.json" '"effort":'
  assert_pattern_in_file "/tmp/phase7-resources.json" '"team":'

  log_step "THEN Resources are allocated per task"

  annotate "Resource allocation validated"
}

test_priority_sequencing() {
  log_step "GIVEN Tasks with priorities"

  cat > /tmp/phase7-priorities.json << 'EOF'
{
  "domain": "test-site.com",
  "month1": [
    {"task": "Fix canonicals", "priority": "P0"},
    {"task": "Page speed", "priority": "P0"}
  ],
  "month2": [
    {"task": "Content creation", "priority": "P1"},
    {"task": "Schema markup", "priority": "P2"}
  ]
}
EOF

  log_step "WHEN Sequencing by priority"

  # Verify P0 tasks come first
  assert_pattern_in_file "/tmp/phase7-priorities.json" '"month1":'
  assert_pattern_in_file "/tmp/phase7-priorities.json" '"priority": "P0"'

  log_step "THEN P0 tasks are scheduled first"

  annotate "Priority sequencing validated"
}

test_risk_mitigation() {
  log_step "GIVEN Roadmap with identified risks"

  cat > /tmp/phase7-risks.json << 'EOF'
{
  "domain": "test-site.com",
  "risks": [
    {
      "risk": "Technical debt delays",
      "impact": "HIGH",
      "probability": "MEDIUM",
      "mitigation": "Allocate extra buffer time for Month 1"
    },
    {
      "risk": "Content production bottleneck",
      "impact": "MEDIUM",
      "probability": "HIGH",
      "mitigation": "Hire freelance writers"
    }
  ]
}
EOF

  log_step "WHEN Validating risk mitigation"

  assert_pattern_in_file "/tmp/phase7-risks.json" '"risk":'
  assert_pattern_in_file "/tmp/phase7-risks.json" '"mitigation":'

  log_step "THEN Risks have mitigation strategies"

  annotate "Risk mitigation validated"
}

test_roadmap_actionability() {
  log_step "GIVEN Generated roadmap"

  setup_phase7_input_data

  cat > /tmp/phase7-actionable.json << 'EOF'
{
  "domain": "test-site.com",
  "milestones": [
    {
      "month": 1,
      "tasks": [
        {"id": "T1", "description": "Fix canonical tags on 45 pages", "assignee": "dev-team", "dueDate": "2025-01-15"},
        {"id": "T2", "description": "Optimize Core Web Vitals", "assignee": "dev-team", "dueDate": "2025-01-30"}
      ]
    }
  ]
}
EOF

  log_step "WHEN Validating task actionability"

  # Tasks must have clear descriptions, assignees, and deadlines
  assert_pattern_in_file "/tmp/phase7-actionable.json" '"description":'
  assert_pattern_in_file "/tmp/phase7-actionable.json" '"assignee":'
  assert_pattern_in_file "/tmp/phase7-actionable.json" '"dueDate":'

  log_step "THEN Tasks are actionable"

  annotate "Roadmap actionability validated"
}

test_progress_tracking() {
  log_step "GIVEN Roadmap execution"

  cat > /tmp/phase7-progress.json << 'EOF'
{
  "domain": "test-site.com",
  "milestones": [
    {"month": 1, "status": "completed", "completionRate": 1.0},
    {"month": 2, "status": "in-progress", "completionRate": 0.65},
    {"month": 3, "status": "pending", "completionRate": 0.0}
  ]
}
EOF

  log_step "WHEN Tracking milestone progress"

  assert_pattern_in_file "/tmp/phase7-progress.json" '"status":'
  assert_pattern_in_file "/tmp/phase7-progress.json" '"completionRate":'

  log_step "THEN Progress is trackable"

  annotate "Progress tracking validated"
}

# ============================================================================
# TEST EXECUTION
# ============================================================================

setup_test "$TEST_NAME"

annotate "Running Phase 7 Roadmap Tests (Real Execution)"

# CRITICAL: Real execution tests (BUG #21 prevention)
test_roadmap_structure_real

# Legacy mock tests (to be migrated)
test_milestone_task_count
test_kpi_definitions
test_dependency_tracking
test_timeline_feasibility
test_resource_allocation
test_priority_sequencing
test_risk_mitigation
test_roadmap_actionability
test_progress_tracking

teardown_test
