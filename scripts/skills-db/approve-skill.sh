#!/usr/bin/env bash
# approve-skill.sh - Skills Database v2 Approval Workflow Engine
# Implements three-tier approval system (auto/escalate/human) with risk-based routing

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# ============================================================================
# CONFIGURATION
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DB_PATH="${DB_PATH:-${PROJECT_ROOT}/.claude/skills-database/skills.db}"

# Risk thresholds
AUTO_APPROVE_RISK_THRESHOLD=0.30
ESCALATE_RISK_THRESHOLD=0.60

# Coverage thresholds
AUTO_APPROVE_COVERAGE=0.95
ESCALATE_COVERAGE=0.85
HUMAN_COVERAGE=0.80

# Complexity threshold for auto-approval
AUTO_APPROVE_COMPLEXITY=0.30

# SLA timers (in hours)
ESCALATE_SLA_HOURS=48
HUMAN_SLA_HOURS=168  # 7 days

# Risk component weights
WEIGHT_SECURITY=0.35
WEIGHT_COMPLEXITY=0.25
WEIGHT_TEST_COVERAGE=0.20
WEIGHT_EXTERNAL_DEPS=0.15
WEIGHT_CRITICALITY=0.05

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

log_info() {
    echo "[INFO] $*" >&2
}

log_warn() {
    echo "[WARN] $*" >&2
}

log_error() {
    echo "[ERROR] $*" >&2
}

log_verbose() {
    if [[ "${VERBOSE:-false}" == "true" ]]; then
        echo "[VERBOSE] $*" >&2
    fi
}

validate_database() {
    if [[ ! -f "$DB_PATH" ]]; then
        log_error "Database not found: $DB_PATH"
        log_error "Run scripts/skills-db/init-database-v2.sh first"
        exit 1
    fi
}

validate_skill_exists() {
    local skill_id="$1"
    local count
    count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM skills WHERE id = $skill_id;")

    if [[ "$count" -eq 0 ]]; then
        log_error "Skill ID $skill_id not found in database"
        exit 1
    fi
}

get_skill_info() {
    local skill_id="$1"
    sqlite3 "$DB_PATH" <<EOF
SELECT
    name,
    version,
    category,
    content_path,
    test_coverage,
    test_suite_path,
    approval_level
FROM skills
WHERE id = $skill_id;
EOF
}

# ============================================================================
# RISK ASSESSMENT COMPONENTS
# ============================================================================

assess_security_impact() {
    local skill_path="$1"
    local security_score=0.0

    log_verbose "Assessing security impact for: $skill_path"

    if [[ ! -f "$skill_path" ]]; then
        log_verbose "  Skill file not found, defaulting to 0.0"
        echo "0.0"
        return
    fi

    # Check for security-sensitive patterns
    local has_crypto=0
    local has_secrets=0
    local has_auth=0
    local has_tokens=0

    # Crypto operations (highest risk)
    if grep -qiE '(openssl|gpg|encryption|decrypt|hash.*password|bcrypt|scrypt)' "$skill_path" 2>/dev/null; then
        has_crypto=1
        log_verbose "  Found crypto operations"
    fi

    # Secrets management (highest risk)
    if grep -qiE '(secret|credential|private.*key|api.*key|password.*store)' "$skill_path" 2>/dev/null; then
        has_secrets=1
        log_verbose "  Found secrets management"
    fi

    # Auth/token generation (high risk)
    if grep -qiE '(jwt|token.*generate|authenticate|authorize|session.*create)' "$skill_path" 2>/dev/null; then
        has_tokens=1
        log_verbose "  Found token/auth operations"
    fi

    # Read-only auth operations (medium risk)
    if grep -qiE '(verify.*token|check.*auth|validate.*session)' "$skill_path" 2>/dev/null; then
        has_auth=1
        log_verbose "  Found auth verification operations"
    fi

    # Calculate security score
    if [[ $has_crypto -eq 1 || $has_secrets -eq 1 ]]; then
        security_score=1.0
    elif [[ $has_tokens -eq 1 ]]; then
        security_score=0.6
    elif [[ $has_auth -eq 1 ]]; then
        security_score=0.3
    else
        security_score=0.0
    fi

    log_verbose "  Security score: $security_score"
    echo "$security_score"
}

assess_complexity() {
    local skill_path="$1"
    local complexity_score=0.0

    log_verbose "Assessing complexity for: $skill_path"

    if [[ ! -f "$skill_path" ]]; then
        log_verbose "  Skill file not found, defaulting to 0.0"
        echo "0.0"
        return
    fi

    # Count functions
    local function_count=0
    function_count=$(grep -cE '^[a-zA-Z_][a-zA-Z0-9_]*\(\)' "$skill_path" 2>/dev/null || echo "0")

    # Get file size in KB
    local file_size_kb=0
    file_size_kb=$(stat -c %s "$skill_path" 2>/dev/null | awk '{print int($1/1024)}' || echo "0")

    log_verbose "  Functions: $function_count, Size: ${file_size_kb}KB"

    # Calculate complexity score based on functions and size
    if [[ $function_count -gt 10 || $file_size_kb -gt 25 ]]; then
        complexity_score=1.0
    elif [[ $function_count -ge 7 || $file_size_kb -ge 15 ]]; then
        complexity_score=0.6
    elif [[ $function_count -ge 4 || $file_size_kb -ge 10 ]]; then
        complexity_score=0.3
    else
        complexity_score=0.0
    fi

    log_verbose "  Complexity score: $complexity_score"
    echo "$complexity_score"
}

assess_external_dependencies() {
    local skill_path="$1"
    local deps_score=0.0

    log_verbose "Assessing external dependencies for: $skill_path"

    if [[ ! -f "$skill_path" ]]; then
        log_verbose "  Skill file not found, defaulting to 0.0"
        echo "0.0"
        return
    fi

    # Check for external API calls
    local has_external_api=0
    local has_critical_api=0
    local has_internal_api=0

    # Critical external APIs (payment, auth providers, etc.)
    if grep -qiE '(stripe|paypal|auth0|okta|aws.*api|gcp.*api)' "$skill_path" 2>/dev/null; then
        has_critical_api=1
        log_verbose "  Found critical external API calls"
    fi

    # General external APIs (rate-limited)
    if grep -qiE '(curl|wget|http.*request|api.*call|fetch.*http)' "$skill_path" 2>/dev/null; then
        has_external_api=1
        log_verbose "  Found external API calls"
    fi

    # Internal APIs
    if grep -qiE '(localhost|127\.0\.0\.1|internal.*api)' "$skill_path" 2>/dev/null; then
        has_internal_api=1
        log_verbose "  Found internal API calls"
    fi

    # Calculate dependencies score
    if [[ $has_critical_api -eq 1 ]]; then
        deps_score=1.0
    elif [[ $has_external_api -eq 1 ]]; then
        deps_score=0.7
    elif [[ $has_internal_api -eq 1 ]]; then
        deps_score=0.4
    else
        deps_score=0.0
    fi

    log_verbose "  Dependencies score: $deps_score"
    echo "$deps_score"
}

assess_business_criticality() {
    local category="$1"
    local criticality_score=0.0

    log_verbose "Assessing business criticality for category: $category"

    case "$category" in
        "domain"|"infrastructure")
            criticality_score=1.0
            log_verbose "  High criticality (domain/infrastructure)"
            ;;
        "coordination"|"foundation")
            criticality_score=0.6
            log_verbose "  Medium criticality (coordination/foundation)"
            ;;
        "testing")
            criticality_score=0.3
            log_verbose "  Low-medium criticality (testing)"
            ;;
        *)
            criticality_score=0.0
            log_verbose "  Low criticality (other)"
            ;;
    esac

    echo "$criticality_score"
}

# ============================================================================
# RISK CALCULATION
# ============================================================================

calculate_risk_score() {
    local skill_id="$1"

    log_verbose "Calculating risk score for skill ID: $skill_id"

    # Get skill info
    local skill_info
    skill_info=$(get_skill_info "$skill_id")

    local name version category content_path test_coverage test_suite_path approval_level
    IFS='|' read -r name version category content_path test_coverage test_suite_path approval_level <<< "$skill_info"

    log_verbose "  Skill: $name (version $version)"
    log_verbose "  Category: $category"
    log_verbose "  Test coverage: ${test_coverage:-0.0}"

    # Resolve content path relative to project root
    local full_path="$PROJECT_ROOT/$content_path"

    # Calculate individual risk components
    local security_score
    security_score=$(assess_security_impact "$full_path")

    local complexity_score
    complexity_score=$(assess_complexity "$full_path")

    local deps_score
    deps_score=$(assess_external_dependencies "$full_path")

    local criticality_score
    criticality_score=$(assess_business_criticality "$category")

    # Use test coverage from database (default to 0.0 if not set)
    local coverage_value="${test_coverage:-0.0}"
    local coverage_risk
    coverage_risk=$(echo "1.0 - $coverage_value" | bc -l)

    # Calculate aggregate risk score using weighted formula
    local risk_score
    risk_score=$(echo "scale=4; \
        ($security_score * $WEIGHT_SECURITY) + \
        ($complexity_score * $WEIGHT_COMPLEXITY) + \
        ($coverage_risk * $WEIGHT_TEST_COVERAGE) + \
        ($deps_score * $WEIGHT_EXTERNAL_DEPS) + \
        ($criticality_score * $WEIGHT_CRITICALITY)" | bc -l)

    log_verbose "  Component scores:"
    log_verbose "    Security:     $security_score (weight: $WEIGHT_SECURITY)"
    log_verbose "    Complexity:   $complexity_score (weight: $WEIGHT_COMPLEXITY)"
    log_verbose "    Coverage:     $coverage_value (risk: $coverage_risk, weight: $WEIGHT_TEST_COVERAGE)"
    log_verbose "    Dependencies: $deps_score (weight: $WEIGHT_EXTERNAL_DEPS)"
    log_verbose "    Criticality:  $criticality_score (weight: $WEIGHT_CRITICALITY)"
    log_verbose "  AGGREGATE RISK: $risk_score"

    # Return risk score and component JSON
    cat <<EOF
{
  "total_risk": $risk_score,
  "security": $security_score,
  "complexity": $complexity_score,
  "test_coverage": $coverage_value,
  "coverage_risk": $coverage_risk,
  "external_deps": $deps_score,
  "business_criticality": $criticality_score
}
EOF
}

# ============================================================================
# APPROVAL LEVEL ROUTING
# ============================================================================

determine_approval_level() {
    local risk_json="$1"
    local test_coverage="$2"
    local complexity="$3"

    local total_risk
    total_risk=$(echo "$risk_json" | jq -r '.total_risk')

    log_verbose "Determining approval level:"
    log_verbose "  Risk: $total_risk, Coverage: $test_coverage, Complexity: $complexity"

    # Decision tree
    local is_auto_risk=$(echo "$total_risk <= $AUTO_APPROVE_RISK_THRESHOLD" | bc -l)
    local is_auto_coverage=$(echo "$test_coverage >= $AUTO_APPROVE_COVERAGE" | bc -l)
    local is_auto_complexity=$(echo "$complexity <= $AUTO_APPROVE_COMPLEXITY" | bc -l)

    local is_escalate_risk=$(echo "$total_risk <= $ESCALATE_RISK_THRESHOLD" | bc -l)
    local is_escalate_coverage=$(echo "$test_coverage >= $ESCALATE_COVERAGE" | bc -l)

    if [[ $is_auto_risk -eq 1 && $is_auto_coverage -eq 1 && $is_auto_complexity -eq 1 ]]; then
        log_verbose "  Decision: AUTO-APPROVE"
        echo "auto"
    elif [[ $is_escalate_risk -eq 1 && $is_escalate_coverage -eq 1 ]]; then
        log_verbose "  Decision: ESCALATE"
        echo "escalate"
    else
        log_verbose "  Decision: HUMAN REVIEW"
        echo "human"
    fi
}

# ============================================================================
# VALIDATION CHECKS
# ============================================================================

validate_skill_content() {
    local skill_path="$1"

    log_verbose "Validating skill content: $skill_path"

    if [[ ! -f "$skill_path" ]]; then
        log_error "Skill file not found: $skill_path"
        return 1
    fi

    # Check file is not empty
    if [[ ! -s "$skill_path" ]]; then
        log_error "Skill file is empty: $skill_path"
        return 1
    fi

    # Check for basic structure (at least one function or markdown heading)
    if ! grep -qE '^(#|[a-zA-Z_].*\(\))' "$skill_path" 2>/dev/null; then
        log_warn "Skill file appears to have no structure: $skill_path"
    fi

    log_verbose "  Content validation: PASSED"
    return 0
}

validate_test_suites() {
    local skill_path="$1"
    local test_suite_path="$2"
    local required_coverage="$3"

    log_verbose "Validating test suites:"
    log_verbose "  Test path: $test_suite_path"
    log_verbose "  Required coverage: $required_coverage"

    if [[ -z "$test_suite_path" || "$test_suite_path" == "null" ]]; then
        log_warn "No test suite path specified"
        return 1
    fi

    local full_test_path="$PROJECT_ROOT/$test_suite_path"

    if [[ ! -f "$full_test_path" ]]; then
        log_warn "Test suite not found: $full_test_path"
        return 1
    fi

    # Check test file is executable
    if [[ ! -x "$full_test_path" ]]; then
        log_warn "Test suite is not executable: $full_test_path"
        return 1
    fi

    log_verbose "  Test validation: PASSED"
    return 0
}

check_security_patterns() {
    local skill_path="$1"

    log_verbose "Checking security anti-patterns: $skill_path"

    # Check for hardcoded secrets (anti-pattern)
    if grep -qiE '(password|api.*key|secret).*=.*["\x27][a-zA-Z0-9]{8,}["\x27]' "$skill_path" 2>/dev/null; then
        log_error "SECURITY VIOLATION: Potential hardcoded secret detected"
        return 1
    fi

    # Check for SQL injection risks
    if grep -qE 'sqlite3.*".*\$' "$skill_path" 2>/dev/null; then
        log_warn "Potential SQL injection risk (unescaped variables)"
    fi

    log_verbose "  Security pattern check: PASSED"
    return 0
}

# ============================================================================
# AUTO-APPROVAL WORKFLOW
# ============================================================================

execute_auto_approval() {
    local skill_id="$1"
    local risk_json="$2"
    local dry_run="${3:-false}"

    log_info "Executing AUTO-APPROVAL workflow for skill ID: $skill_id"

    # Get skill info
    local skill_info
    skill_info=$(get_skill_info "$skill_id")

    local name version category content_path test_coverage test_suite_path
    IFS='|' read -r name version category content_path test_coverage test_suite_path _ <<< "$skill_info"

    local full_path="$PROJECT_ROOT/$content_path"

    # Run validation checks
    if ! validate_skill_content "$full_path"; then
        log_error "Content validation failed - cannot auto-approve"
        return 1
    fi

    if ! validate_test_suites "$full_path" "$test_suite_path" "$AUTO_APPROVE_COVERAGE"; then
        log_error "Test validation failed - cannot auto-approve"
        return 1
    fi

    if ! check_security_patterns "$full_path"; then
        log_error "Security check failed - cannot auto-approve"
        return 1
    fi

    local total_risk
    total_risk=$(echo "$risk_json" | jq -r '.total_risk')

    if [[ "$dry_run" == "true" ]]; then
        log_info "[DRY RUN] Would auto-approve skill: $name"
        log_info "[DRY RUN] Risk score: $total_risk, Coverage: $test_coverage"
        return 0
    fi

    # Update skills table
    sqlite3 "$DB_PATH" <<EOF
UPDATE skills
SET approval_level = 'auto',
    last_approved_by = 'system',
    last_approval_date = datetime('now'),
    approval_criteria = '$risk_json'
WHERE id = $skill_id;
EOF

    # Insert approval history
    sqlite3 "$DB_PATH" <<EOF
INSERT INTO approval_history (
  skill_id, version, approval_level, approver, decision,
  reasoning, risk_assessment, timestamp
) VALUES (
  $skill_id,
  '$version',
  'auto',
  'system',
  'approved',
  'Auto-approved: Risk score $total_risk ≤ $AUTO_APPROVE_RISK_THRESHOLD, coverage $test_coverage ≥ $AUTO_APPROVE_COVERAGE',
  '$risk_json',
  datetime('now')
);
EOF

    log_info "✅ Skill auto-approved: $name (risk: $total_risk, coverage: $test_coverage)"

    # Auto-deploy if flag is set
    if [[ "${AUTO_DEPLOY:-false}" == "true" ]]; then
        log_info "Auto-deploying skill: $name"
        deploy_skill "$skill_id"
    fi

    return 0
}

# ============================================================================
# ESCALATION WORKFLOW
# ============================================================================

assign_expert_by_category() {
    local category="$1"

    # Map categories to expert teams/individuals
    case "$category" in
        "infrastructure")
            echo "infrastructure-team@example.com"
            ;;
        "domain")
            echo "domain-expert@example.com"
            ;;
        "coordination")
            echo "coordination-expert@example.com"
            ;;
        "testing")
            echo "testing-team@example.com"
            ;;
        *)
            echo "general-expert@example.com"
            ;;
    esac
}

execute_escalation() {
    local skill_id="$1"
    local risk_json="$2"
    local dry_run="${3:-false}"

    log_info "Executing ESCALATION workflow for skill ID: $skill_id"

    # Get skill info
    local skill_info
    skill_info=$(get_skill_info "$skill_id")

    local name version category content_path test_coverage
    IFS='|' read -r name version category content_path test_coverage _ _ <<< "$skill_info"

    local total_risk
    total_risk=$(echo "$risk_json" | jq -r '.total_risk')

    # Assign expert
    local expert
    expert=$(assign_expert_by_category "$category")

    if [[ "$dry_run" == "true" ]]; then
        log_info "[DRY RUN] Would escalate skill: $name to expert: $expert"
        log_info "[DRY RUN] SLA: ${ESCALATE_SLA_HOURS}h"
        return 0
    fi

    # Update skills table
    sqlite3 "$DB_PATH" <<EOF
UPDATE skills
SET approval_level = 'escalate',
    approval_criteria = '$risk_json'
WHERE id = $skill_id;
EOF

    # Insert approval history
    sqlite3 "$DB_PATH" <<EOF
INSERT INTO approval_history (
  skill_id, version, approval_level, approver, decision,
  reasoning, risk_assessment, escalated_to, escalation_timestamp, timestamp
) VALUES (
  $skill_id,
  '$version',
  'escalate',
  NULL,
  'escalated',
  'Escalated for expert review: Risk $total_risk, coverage $test_coverage',
  '$risk_json',
  '$expert',
  datetime('now'),
  datetime('now')
);
EOF

    log_info "⚠️  Skill escalated to expert: $expert (SLA: ${ESCALATE_SLA_HOURS}h)"

    # Send notification
    if [[ "${NOTIFY:-false}" == "true" ]]; then
        send_expert_notification "$expert" "$skill_id" "$name" "escalate" "$ESCALATE_SLA_HOURS"
    fi

    # Schedule SLA reminder
    schedule_sla_reminder "$skill_id" "${ESCALATE_SLA_HOURS}h"

    return 0
}

# ============================================================================
# HUMAN APPROVAL WORKFLOW
# ============================================================================

execute_human_review() {
    local skill_id="$1"
    local risk_json="$2"
    local dry_run="${3:-false}"

    log_info "Executing HUMAN REVIEW workflow for skill ID: $skill_id"

    # Get skill info
    local skill_info
    skill_info=$(get_skill_info "$skill_id")

    local name version category content_path test_coverage
    IFS='|' read -r name version category content_path test_coverage _ _ <<< "$skill_info"

    local total_risk
    total_risk=$(echo "$risk_json" | jq -r '.total_risk')

    if [[ "$dry_run" == "true" ]]; then
        log_info "[DRY RUN] Would require human approval for skill: $name"
        log_info "[DRY RUN] SLA: ${HUMAN_SLA_HOURS}h (7 days)"
        return 0
    fi

    # Update skills table
    sqlite3 "$DB_PATH" <<EOF
UPDATE skills
SET approval_level = 'human',
    approval_criteria = '$risk_json'
WHERE id = $skill_id;
EOF

    # Insert approval history
    sqlite3 "$DB_PATH" <<EOF
INSERT INTO approval_history (
  skill_id, version, approval_level, approver, decision,
  reasoning, risk_assessment, escalated_to, escalation_timestamp, timestamp
) VALUES (
  $skill_id,
  '$version',
  'human',
  NULL,
  'escalated',
  'Requires human approval: High risk $total_risk or security-sensitive',
  '$risk_json',
  'senior-review-board@example.com',
  datetime('now'),
  datetime('now')
);
EOF

    log_info "⚠️  Skill requires human approval (SLA: ${HUMAN_SLA_HOURS}h / 7 days)"

    # Send notification to senior review board
    if [[ "${NOTIFY:-false}" == "true" ]]; then
        send_expert_notification "senior-review-board@example.com" "$skill_id" "$name" "human" "$HUMAN_SLA_HOURS"
    fi

    # Schedule SLA reminder
    schedule_sla_reminder "$skill_id" "${HUMAN_SLA_HOURS}h"

    return 0
}

# ============================================================================
# EXPERT DECISION RECORDING
# ============================================================================

approve_skill_manual() {
    local skill_id="$1"
    local approver="$2"
    local reasoning="$3"

    log_info "Recording manual approval for skill ID: $skill_id by $approver"

    # Get current version
    local version
    version=$(sqlite3 "$DB_PATH" "SELECT version FROM skills WHERE id = $skill_id;")

    # Update skills table
    sqlite3 "$DB_PATH" <<EOF
UPDATE skills
SET last_approved_by = '$approver',
    last_approval_date = datetime('now')
WHERE id = $skill_id;
EOF

    # Update approval history (most recent pending entry)
    sqlite3 "$DB_PATH" <<EOF
UPDATE approval_history
SET approver = '$approver',
    decision = 'approved',
    reasoning = '$reasoning',
    review_duration_minutes = CAST((julianday('now') - julianday(timestamp)) * 24 * 60 AS INTEGER)
WHERE id = (
    SELECT id FROM approval_history
    WHERE skill_id = $skill_id
      AND decision IN ('escalated', 'pending')
    ORDER BY timestamp DESC
    LIMIT 1
);
EOF

    local name
    name=$(sqlite3 "$DB_PATH" "SELECT name FROM skills WHERE id = $skill_id;")

    log_info "✅ Skill approved by $approver: $name"
    echo "Approval recorded successfully"

    return 0
}

reject_skill_manual() {
    local skill_id="$1"
    local approver="$2"
    local reasoning="$3"

    log_info "Recording manual rejection for skill ID: $skill_id by $approver"

    # Update approval history (most recent pending entry)
    sqlite3 "$DB_PATH" <<EOF
UPDATE approval_history
SET approver = '$approver',
    decision = 'rejected',
    reasoning = '$reasoning',
    review_duration_minutes = CAST((julianday('now') - julianday(timestamp)) * 24 * 60 AS INTEGER)
WHERE id = (
    SELECT id FROM approval_history
    WHERE skill_id = $skill_id
      AND decision IN ('escalated', 'pending')
    ORDER BY timestamp DESC
    LIMIT 1
);
EOF

    local name
    name=$(sqlite3 "$DB_PATH" "SELECT name FROM skills WHERE id = $skill_id;")

    log_info "❌ Skill rejected by $approver: $name"
    echo "Rejection recorded: $reasoning"

    return 0
}

# ============================================================================
# NOTIFICATION SYSTEM
# ============================================================================

send_expert_notification() {
    local expert="$1"
    local skill_id="$2"
    local skill_name="$3"
    local approval_type="$4"
    local sla_hours="$5"

    log_verbose "Sending notification to $expert for skill: $skill_name"

    # Generate notification message
    local message="Skill Approval Required

Skill: $skill_name (ID: $skill_id)
Approval Level: $approval_type
SLA: ${sla_hours}h

Review at: https://skills-db.example.com/review/$skill_id

---
This is an automated notification from Skills Database v2
"

    # Email notification (placeholder - integrate with your email system)
    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "Skill Approval Required: $skill_name" "$expert" 2>/dev/null || true
    fi

    # Slack notification (placeholder - integrate with your Slack webhook)
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        curl -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d "{
                \"text\": \"Skill Approval Required\",
                \"attachments\": [{
                    \"color\": \"warning\",
                    \"fields\": [
                        {\"title\": \"Skill\", \"value\": \"$skill_name\", \"short\": true},
                        {\"title\": \"Approval Level\", \"value\": \"$approval_type\", \"short\": true},
                        {\"title\": \"SLA\", \"value\": \"${sla_hours}h\", \"short\": true},
                        {\"title\": \"Assigned To\", \"value\": \"$expert\", \"short\": true}
                    ]
                }]
            }" 2>/dev/null || true
    fi

    log_verbose "  Notification sent to $expert"
}

schedule_sla_reminder() {
    local skill_id="$1"
    local sla_duration="$2"

    log_verbose "Scheduling SLA reminder for skill ID $skill_id in $sla_duration"

    # Placeholder - integrate with your scheduling system (cron, at, systemd timer, etc.)
    # For now, just log the intent
    log_verbose "  SLA reminder scheduled (placeholder)"
}

deploy_skill() {
    local skill_id="$1"

    log_info "Deploying skill ID: $skill_id"

    # Placeholder for deployment logic
    # This would integrate with your actual deployment system
    log_info "  Deployment placeholder - implement actual deployment logic"
}

# ============================================================================
# LISTING AND REPORTING
# ============================================================================

list_pending_approvals() {
    local filter="${1:-all}"

    log_info "Listing pending approvals (filter: $filter)"

    local where_clause=""
    case "$filter" in
        "escalate")
            where_clause="WHERE s.approval_level = 'escalate'"
            ;;
        "human")
            where_clause="WHERE s.approval_level = 'human'"
            ;;
        "all")
            where_clause="WHERE s.approval_level IN ('escalate', 'human')"
            ;;
        *)
            log_error "Invalid filter: $filter (use: all, escalate, human)"
            return 1
            ;;
    esac

    sqlite3 -header -column "$DB_PATH" <<EOF
SELECT
    s.id,
    s.name,
    s.category,
    s.approval_level,
    s.version,
    COALESCE(ah.escalated_to, 'unassigned') as assigned_to,
    CAST((julianday('now') - julianday(ah.timestamp)) * 24 AS INTEGER) as hours_pending
FROM skills s
LEFT JOIN (
    SELECT skill_id, escalated_to, timestamp
    FROM approval_history
    WHERE decision = 'escalated'
    GROUP BY skill_id
    HAVING timestamp = MAX(timestamp)
) ah ON s.id = ah.skill_id
$where_clause
ORDER BY hours_pending DESC;
EOF
}

check_sla_compliance() {
    log_info "Checking SLA compliance for pending approvals"

    sqlite3 -header -column "$DB_PATH" <<EOF
SELECT
    s.id,
    s.name,
    s.approval_level,
    ah.escalated_to,
    CAST((julianday('now') - julianday(ah.timestamp)) * 24 AS INTEGER) as hours_elapsed,
    CASE s.approval_level
        WHEN 'escalate' THEN $ESCALATE_SLA_HOURS
        WHEN 'human' THEN $HUMAN_SLA_HOURS
    END as sla_hours,
    CASE
        WHEN s.approval_level = 'escalate' AND (julianday('now') - julianday(ah.timestamp)) * 24 > $ESCALATE_SLA_HOURS THEN 'BREACHED'
        WHEN s.approval_level = 'human' AND (julianday('now') - julianday(ah.timestamp)) * 24 > $HUMAN_SLA_HOURS THEN 'BREACHED'
        ELSE 'COMPLIANT'
    END as sla_status
FROM skills s
JOIN (
    SELECT skill_id, escalated_to, timestamp
    FROM approval_history
    WHERE decision = 'escalated'
    GROUP BY skill_id
    HAVING timestamp = MAX(timestamp)
) ah ON s.id = ah.skill_id
WHERE s.approval_level IN ('escalate', 'human')
ORDER BY sla_status DESC, hours_elapsed DESC;
EOF
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

show_usage() {
    cat <<EOF
Usage: $0 <mode> [options]

MODES:
  assess <skill-id>                     Calculate risk score only (no approval)
  approve <skill-id>                    Execute approval workflow
  accept <skill-id> <approver> <reason> Manual expert approval
  reject <skill-id> <approver> <reason> Manual expert rejection
  list-pending [escalate|human|all]     List skills awaiting approval
  check-sla                             Check SLA compliance for pending approvals

FLAGS:
  --auto-deploy      Deploy immediately after auto-approval
  --notify           Send email/Slack notifications
  --dry-run          Show what would happen without executing
  --verbose          Detailed risk calculation logging

EXAMPLES:
  # Assess risk for skill ID 5
  $0 assess 5 --verbose

  # Approve skill with notifications
  $0 approve 5 --notify

  # Manual expert approval
  $0 accept 5 "expert@example.com" "Reviewed and approved - tests passing"

  # List pending escalations
  $0 list-pending escalate

  # Check SLA compliance
  $0 check-sla

ENVIRONMENT VARIABLES:
  AUTO_DEPLOY         Auto-deploy after approval (true/false)
  NOTIFY              Send notifications (true/false)
  VERBOSE             Enable verbose logging (true/false)
  SLACK_WEBHOOK_URL   Slack webhook for notifications
EOF
}

main() {
    # Parse environment flags
    export AUTO_DEPLOY="${AUTO_DEPLOY:-false}"
    export NOTIFY="${NOTIFY:-false}"
    export VERBOSE="${VERBOSE:-false}"
    local DRY_RUN=false

    # Parse command-line flags
    local args=()
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --auto-deploy)
                AUTO_DEPLOY=true
                shift
                ;;
            --notify)
                NOTIFY=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                args+=("$1")
                shift
                ;;
        esac
    done

    # Restore positional parameters
    set -- "${args[@]}"

    if [[ $# -lt 1 ]]; then
        show_usage
        exit 1
    fi

    validate_database

    local mode="$1"
    shift

    case "$mode" in
        assess)
            if [[ $# -lt 1 ]]; then
                log_error "Missing skill ID for assess mode"
                show_usage
                exit 1
            fi

            local skill_id="$1"
            validate_skill_exists "$skill_id"

            local risk_json
            risk_json=$(calculate_risk_score "$skill_id")

            echo "$risk_json" | jq .

            # Show recommended approval level
            local skill_info
            skill_info=$(get_skill_info "$skill_id")
            local test_coverage complexity_score
            IFS='|' read -r _ _ _ content_path test_coverage _ _ <<< "$skill_info"

            complexity_score=$(assess_complexity "$PROJECT_ROOT/$content_path")

            local recommended_level
            recommended_level=$(determine_approval_level "$risk_json" "${test_coverage:-0.0}" "$complexity_score")

            echo ""
            echo "Recommended approval level: $recommended_level"
            ;;

        approve)
            if [[ $# -lt 1 ]]; then
                log_error "Missing skill ID for approve mode"
                show_usage
                exit 1
            fi

            local skill_id="$1"
            validate_skill_exists "$skill_id"

            # Calculate risk
            local risk_json
            risk_json=$(calculate_risk_score "$skill_id")

            # Get skill info for coverage and complexity
            local skill_info
            skill_info=$(get_skill_info "$skill_id")
            local test_coverage complexity_score
            IFS='|' read -r _ _ _ content_path test_coverage _ _ <<< "$skill_info"

            complexity_score=$(assess_complexity "$PROJECT_ROOT/$content_path")

            # Determine approval level
            local approval_level
            approval_level=$(determine_approval_level "$risk_json" "${test_coverage:-0.0}" "$complexity_score")

            log_info "Approval level determined: $approval_level"

            # Execute appropriate workflow
            case "$approval_level" in
                auto)
                    execute_auto_approval "$skill_id" "$risk_json" "$DRY_RUN"
                    ;;
                escalate)
                    execute_escalation "$skill_id" "$risk_json" "$DRY_RUN"
                    ;;
                human)
                    execute_human_review "$skill_id" "$risk_json" "$DRY_RUN"
                    ;;
            esac
            ;;

        accept)
            if [[ $# -lt 3 ]]; then
                log_error "Missing arguments for accept mode"
                echo "Usage: $0 accept <skill-id> <approver> <reason>"
                exit 1
            fi

            local skill_id="$1"
            local approver="$2"
            local reason="$3"

            validate_skill_exists "$skill_id"
            approve_skill_manual "$skill_id" "$approver" "$reason"
            ;;

        reject)
            if [[ $# -lt 3 ]]; then
                log_error "Missing arguments for reject mode"
                echo "Usage: $0 reject <skill-id> <approver> <reason>"
                exit 1
            fi

            local skill_id="$1"
            local approver="$2"
            local reason="$3"

            validate_skill_exists "$skill_id"
            reject_skill_manual "$skill_id" "$approver" "$reason"
            ;;

        list-pending)
            local filter="${1:-all}"
            list_pending_approvals "$filter"
            ;;

        check-sla)
            check_sla_compliance
            ;;

        *)
            log_error "Unknown mode: $mode"
            show_usage
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"
