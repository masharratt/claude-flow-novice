# Approval Tier System - Implementation Requirements

**Version:** 1.0.0
**Status:** FINAL
**Date:** 2025-11-15
**Dependencies:** Phase 3 Workflow Codification System

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Tier Definitions](#2-tier-definitions)
3. [Risk Assessment Engine](#3-risk-assessment-engine)
4. [Implementation Requirements](#4-implementation-requirements)
5. [Success Criteria](#5-success-criteria)
6. [Integration Requirements](#6-integration-requirements)
7. [Testing Requirements](#7-testing-requirements)

---

## 1. Executive Summary

### 1.1 Purpose

The Approval Tier System introduces **three-level risk-based governance** for automatically generated skills, balancing automation efficiency with human oversight.

### 1.2 Business Value

**Problem:** All generated skills currently require expert human approval (48h-7d SLA), creating bottlenecks for low-risk, high-frequency operations.

**Solution:** Automatic risk classification routes skills through appropriate approval paths:
- **Tier 1 (Auto):** Immediate deployment (< 60s) for low-risk operations
- **Tier 2 (Escalate):** Team Coordinator review (24h SLA) for medium-risk operations
- **Tier 3 (Human Required):** Expert approval (48h-7d SLA) for high-risk operations

**Impact:**
- **70-80% of skills auto-approved** (based on read-only, validation patterns)
- **90% reduction in expert review burden** (focus on high-risk only)
- **Faster time-to-production** for low/medium-risk skills (< 24h vs 7 days)
- **Maintained security posture** through rule-based risk assessment

---

## 2. Tier Definitions

### 2.1 Tier 1: Auto-Approval

**Risk Level:** Low
**Approval Process:** Automatic after tier assessment
**Notification:** Informational (team Slack channel)
**SLA:** Immediate deployment (< 60 seconds)
**Rollback Authority:** Team Coordinator or Expert

**Qualifying Criteria:**
1. **Read-only operations** (no state modification)
2. **Deterministic** (same inputs → same outputs)
3. **No external side effects** (no API writes, no file modifications)
4. **Team-isolated scope** (no cross-team data access)
5. **Test coverage ≥ 90%** (comprehensive edge case handling)
6. **Shellcheck validation passed** (no security warnings)

**Example Skills:**
- Content generation (documentation, reports, summaries)
- Database read queries (team-scoped, no joins across teams)
- Validation and linting (code style, security headers, CORS config)
- File system reads (logs, configuration files)
- Static analysis (dependency checks, vulnerability scanning)

**Risk Mitigation:**
- All auto-approved skills logged in audit trail
- Weekly review report sent to experts (summary of auto-approvals)
- Automatic rollback if skill execution failure rate > 5%
- Team Coordinator can override and escalate to expert review

**Success Metrics:**
- Auto-approval rate: 70-80% of total skills
- False positive rate (escalated after deployment): < 2%
- Time to production: < 60 seconds
- Expert review time saved: 90%

---

### 2.2 Tier 2: Escalate to Team Coordinator

**Risk Level:** Medium
**Approval Process:** Team Coordinator review (Slack approval button)
**Notification:** Slack message to Team Coordinator
**SLA:** 24 hours
**Rollback Authority:** Team Coordinator or Expert

**Qualifying Criteria:**
1. **Constrained write operations** (temp directories, team-scoped databases)
2. **Authenticated external API calls** (read or limited writes)
3. **MCP server invocations** (team-approved servers only)
4. **File modifications** (limited to temporary or team-specific directories)
5. **Database writes** (team-scoped, with validation rules)
6. **Test coverage ≥ 80%**

**Example Skills:**
- External API read calls (CRM, marketing platforms with authentication)
- Temporary file writes (build artifacts, test outputs)
- Database writes within team scope (feature flags, user preferences)
- MCP server invocations (Playwright for UI testing, Redis for caching)
- Log aggregation and storage (team-scoped)

**Team Coordinator Actions:**
1. **Approve:** Deploy skill to production immediately
2. **Escalate to Expert:** Forward to expert for deeper review
3. **Reject:** Archive skill with feedback (reason required)

**Coordinator Review Checklist:**
- [ ] Skill operates within team boundaries (no cross-team access)
- [ ] External API credentials are team-scoped (not shared)
- [ ] Write operations are reversible or logged
- [ ] Test coverage includes failure scenarios
- [ ] Skill documentation is clear and accurate

**Risk Mitigation:**
- Coordinator training on risk assessment criteria
- Expert notification on all coordinator approvals (audit trail)
- Automatic escalation to expert if coordinator inactive for 24h
- Rollback authority retained by coordinator and expert

**Success Metrics:**
- Coordinator approval rate: 15-20% of total skills
- Escalation to expert rate: < 5% (most medium-risk handled by coordinator)
- Time to production: < 24 hours
- Coordinator review overhead: < 5 minutes per skill

---

### 2.3 Tier 3: Human Required (Expert Approval)

**Risk Level:** High to Critical
**Approval Process:** Expert deep code review
**Notification:** Email + Slack (high-priority)
**SLA:** 48 hours (high priority) / 7 days (medium/low priority)
**Rollback Authority:** Expert only

**Qualifying Criteria:**
1. **Cross-team data access** (reads or writes affecting multiple teams)
2. **Production file modifications** (application code, configuration)
3. **External API write operations** (CRM updates, payment processing)
4. **Docker/Kubernetes operations** (container/cluster management)
5. **Security-sensitive operations** (authentication, authorization, secrets)
6. **Database schema changes** (migrations, index creation)

**Example Skills:**
- Cross-team database writes (shared tables, analytics aggregation)
- Production deployment automation (CI/CD pipelines)
- External API writes (Salesforce opportunity updates, Stripe payments)
- Container orchestration (Docker builds, Kubernetes deployments)
- Authentication/authorization logic (OAuth flows, JWT validation)
- Security scanning with remediation (automated patching)

**Expert Review Process:**
1. **Code Review:** Deep inspection of generated bash script
2. **Test Validation:** Review test suite coverage and edge cases
3. **Security Analysis:** Identify injection risks, secrets exposure, privilege escalation
4. **Impact Assessment:** Evaluate blast radius (what breaks if skill fails?)
5. **Documentation Review:** Ensure usage instructions are clear and complete

**Expert Actions:**
1. **Approve:** Deploy skill to production (with or without modifications)
2. **Reject:** Archive skill with detailed feedback (skill unsuitable for codification)
3. **Request Corrections:** Provide feedback for AI regeneration (edge cases, logic errors)
4. **Edit Directly:** Modify generated skill and approve edited version

**Expert Review Checklist:**
- [ ] No command injection vulnerabilities (all inputs validated)
- [ ] No secrets hardcoded (environment variables used)
- [ ] No path traversal risks (all paths validated)
- [ ] Error handling comprehensive (all failure modes covered)
- [ ] Rollback procedure documented (how to undo skill execution)
- [ ] Monitoring and alerting in place (log analysis, metrics)

**Risk Mitigation:**
- Mandatory expert approval (no bypass mechanism)
- Peer review option (second expert for critical operations)
- Canary deployment (gradual rollout to 10% → 50% → 100% of teams)
- Automatic rollback on error rate spike (> 10% failure rate)
- Post-deployment review (7-day check-in on skill health)

**Success Metrics:**
- Expert approval rate: 5-10% of total skills
- Rejection rate: < 20% (most skills suitable after corrections)
- Time to production: 48 hours (high priority) / 7 days (medium/low)
- Post-deployment incident rate: < 1%

---

## 3. Risk Assessment Engine

### 3.1 Automatic Tier Classification

**Process:** After skill generation, automatic risk assessment analyzes skill components to determine approval tier.

**Assessment Inputs:**
1. **Workflow Steps:** Parse workflow_steps JSONB for operations (read, write, invoke)
2. **Skill Parameters:** Analyze parameter types and validation rules
3. **File Access Patterns:** Identify file paths and operations (read/write)
4. **Database Operations:** Detect SQL queries and transaction types
5. **External Dependencies:** Identify API calls, MCP server invocations
6. **Shellcheck Results:** Analyze security warnings and error codes

**Risk Scoring Algorithm:**

```python
def calculate_approval_tier(skill):
    risk_score = 0
    risk_categories = []

    # RULE 1: Database operations
    if has_database_writes(skill):
        if is_cross_team_scope(skill):
            risk_score += 1000  # CRITICAL
            risk_categories.append('database-write-unrestricted')
        elif is_team_scoped_with_validation(skill):
            risk_score += 100   # MEDIUM
            risk_categories.append('database-write-constrained')
        else:
            risk_score += 10    # LOW
            risk_categories.append('database-readonly')

    # RULE 2: File system operations
    if has_file_writes(skill):
        if is_production_path(skill):
            risk_score += 1000  # CRITICAL
            risk_categories.append('file-system-privileged')
        elif is_temp_directory(skill):
            risk_score += 100   # MEDIUM
            risk_categories.append('file-write-limited')
        else:
            risk_score += 10    # LOW
            risk_categories.append('file-readonly')

    # RULE 3: External API calls
    if has_external_api_calls(skill):
        if has_write_operations(skill):
            risk_score += 1000  # CRITICAL
            risk_categories.append('external-api-write')
        else:
            risk_score += 100   # MEDIUM
            risk_categories.append('api-calls-readonly')

    # RULE 4: Docker/Kubernetes operations
    if has_container_operations(skill):
        risk_score += 1000      # CRITICAL
        risk_categories.append('docker-operations')

    # RULE 5: Security-sensitive operations
    if has_security_operations(skill):
        risk_score += 1000      # CRITICAL
        risk_categories.append('security-sensitive')

    # RULE 6: MCP server invocations
    if has_mcp_invocations(skill):
        risk_score += 100       # MEDIUM
        risk_categories.append('mcp-invocation')

    # RULE 7: Test coverage
    if skill.test_coverage < 0.80:
        risk_score += 100       # MEDIUM (insufficient testing)

    # RULE 8: Shellcheck warnings
    if skill.shellcheck_warnings > 0:
        risk_score += 100       # MEDIUM (potential security issues)

    # FINAL TIER ASSIGNMENT
    if risk_score >= 1000:
        return 'human_required'
    elif risk_score >= 100:
        return 'escalate'
    else:
        return 'auto'
```

**Tier Assignment:**
- **risk_score < 100:** Auto-approval (Tier 1)
- **100 ≤ risk_score < 1000:** Escalate to Team Coordinator (Tier 2)
- **risk_score ≥ 1000:** Human Expert Required (Tier 3)

### 3.2 Risk Category Mapping

| Risk Category | Operations Detected | Tier Assignment |
|---------------|---------------------|-----------------|
| `content-generation` | Read-only, no side effects | Auto |
| `database-readonly` | SELECT queries, team-scoped | Auto |
| `validation-checks` | Linting, shellcheck, no writes | Auto |
| `file-readonly` | File reads, no modifications | Auto |
| `api-calls-readonly` | External API GETs with auth | Escalate |
| `file-write-limited` | Writes to /tmp, team dirs | Escalate |
| `database-write-constrained` | Team-scoped INSERTs/UPDATEs | Escalate |
| `mcp-invocation` | MCP server calls (approved) | Escalate |
| `database-write-unrestricted` | Cross-team writes, JOINs | Human Required |
| `file-system-privileged` | Writes to /app, /etc, production | Human Required |
| `external-api-write` | POST/PUT/DELETE to external APIs | Human Required |
| `docker-operations` | Docker build, run, exec | Human Required |
| `kubernetes-operations` | kubectl apply, delete | Human Required |
| `security-sensitive` | Auth, secrets, credentials | Human Required |

### 3.3 Override Mechanism

**Expert Override:** Experts can manually reassign approval tier if automatic classification is incorrect.

**Override Process:**
```bash
./.claude/skills/workflow-codification/override-tier.sh \
  --skill-id "uuid" \
  --new-tier "human_required" \
  --reason "Skill accesses shared customer data, requires expert review"
```

**Audit Trail:**
- All tier overrides logged in `approval_log` table
- Weekly report sent to product owner (tier override summary)
- Threshold alert if override rate > 10% (automatic classification accuracy issue)

---

## 4. Implementation Requirements

### 4.1 Database Schema Updates

**Required Tables:** (Already implemented in ARCHITECTURE.md)
- `workflow_patterns` table: Add `approval_tier` and `risk_level` columns
- `skill_metadata` table: Add `approval_tier`, `risk_assessment`, `auto_approved` columns
- `approval_tier_rules` table: Define tier classification rules
- Indexes on `approval_tier` and `risk_level` columns

**Migration Script:**
```sql
-- Add approval tier columns to existing tables
ALTER TABLE workflow_patterns ADD COLUMN approval_tier VARCHAR(20) DEFAULT 'escalate';
ALTER TABLE workflow_patterns ADD COLUMN risk_level VARCHAR(20);
ALTER TABLE skill_metadata ADD COLUMN approval_tier VARCHAR(20);
ALTER TABLE skill_metadata ADD COLUMN risk_assessment JSONB;
ALTER TABLE skill_metadata ADD COLUMN auto_approved BOOLEAN DEFAULT FALSE;

-- Create indexes
CREATE INDEX idx_workflow_patterns_approval_tier ON workflow_patterns(approval_tier);
CREATE INDEX idx_workflow_patterns_risk_level ON workflow_patterns(risk_level);
CREATE INDEX idx_skill_metadata_approval_tier ON skill_metadata(approval_tier);

-- Insert default approval tier rules (see ARCHITECTURE.md for full INSERT statements)
```

### 4.2 Risk Assessment Component

**Location:** `.claude/skills/workflow-codification/assess-risk-tier.sh`

**Inputs:**
- Skill ID (UUID)
- Generated skill files (execute.sh, test.sh, SKILL.md)
- Workflow pattern metadata

**Processing:**
1. Parse skill files for operations (database, file, API, MCP)
2. Query `approval_tier_rules` table for matching risk categories
3. Calculate risk score based on priority-ordered rules
4. Assign approval tier (auto, escalate, human_required)
5. Store risk assessment in `skill_metadata.risk_assessment` JSONB
6. Update `workflow_patterns.approval_tier` and `skill_metadata.approval_tier`

**Output:**
- Risk assessment report (JSON)
- Approval tier assignment
- Risk categories identified

**Performance Target:** < 2 seconds per skill

### 4.3 Tier-Based Notification System

**Auto-Approval Notification (Tier 1):**
```bash
# Slack informational message
curl -X POST "$SLACK_WEBHOOK_URL" -d '{
  "channel": "#team-frontend",
  "text": "✅ Auto-Approved Skill Deployed",
  "blocks": [{
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "*Skill:* `validate-cors-headers`\n*Tier:* Auto-Approval\n*Risk:* Low (read-only validation)\n*Action:* No action required, skill deployed to production"
    }
  }]
}'
```

**Team Coordinator Notification (Tier 2):**
```bash
# Slack approval request with buttons
curl -X POST "$SLACK_WEBHOOK_URL" -d '{
  "channel": "#team-coordinators",
  "text": "🔔 Skill Pending Coordinator Review",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Skill:* `database-backup-team-scoped`\n*Tier:* Escalate (Team Coordinator Approval)\n*Risk:* Medium (team-scoped database writes)\n*Review:* .claude/skills/staging/codified-database-backup/"
      }
    },
    {
      "type": "actions",
      "elements": [
        {"type": "button", "text": {"type": "plain_text", "text": "✅ Approve"}, "value": "approve_uuid", "style": "primary"},
        {"type": "button", "text": {"type": "plain_text", "text": "⬆️ Escalate to Expert"}, "value": "escalate_uuid"},
        {"type": "button", "text": {"type": "plain_text", "text": "❌ Reject"}, "value": "reject_uuid", "style": "danger"}
      ]
    }
  ]
}'
```

**Expert Notification (Tier 3):**
```bash
# Email + Slack high-priority notification
SUBJECT="[URGENT] High-Risk Skill Requires Expert Approval"
BODY="Skill: production-deployment-automation\nTier: Human Required\nRisk: CRITICAL (production file modifications, CI/CD integration)\nDeadline: 48 hours\nReview: .claude/skills/staging/codified-production-deployment/"

echo "$BODY" | mail -s "$SUBJECT" expert@company.com

# Slack notification with @mention
curl -X POST "$SLACK_WEBHOOK_URL" -d '{
  "channel": "#skill-approvals",
  "text": "🚨 CRITICAL: High-Risk Skill Requires Expert Approval",
  "blocks": [{
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "<@expert-user-id> *URGENT:* `production-deployment-automation` requires your approval\n*Risk:* CRITICAL\n*SLA:* 48 hours\n*Review:* .claude/skills/staging/codified-production-deployment/"
    }
  }]
}'
```

### 4.4 Approval Workflow Updates

**Enhanced Approval Script:** `.claude/skills/workflow-codification/approval-workflow.sh`

**New Workflow Steps:**
1. **Skill Generated:** Status = GENERATING → TIER_ASSESSMENT
2. **Risk Assessment:** Call `assess-risk-tier.sh` → Determine tier
3. **Tier Routing:**
   - **IF tier = 'auto':** Deploy immediately, send informational notification
   - **IF tier = 'escalate':** Send coordinator notification, wait 24h, auto-escalate if no response
   - **IF tier = 'human_required':** Send expert notification, wait per SLA
4. **Approval/Rejection:** Update status, log audit trail
5. **Deployment:** Deploy approved skills to production

**SLA Monitoring Enhancement:**
```bash
# Enhanced SLA monitor (runs every 6 hours)
psql -c "
  SELECT skill_id, approval_tier, created_at
  FROM skill_metadata
  WHERE
    (approval_tier = 'auto' AND status = 'TIER_ASSESSMENT' AND created_at < NOW() - INTERVAL '5 minutes') OR
    (approval_tier = 'escalate' AND status = 'PENDING_COORDINATOR_REVIEW' AND created_at < NOW() - INTERVAL '24 hours') OR
    (approval_tier = 'human_required' AND priority = 'high' AND status = 'PENDING_EXPERT_REVIEW' AND created_at < NOW() - INTERVAL '48 hours') OR
    (approval_tier = 'human_required' AND priority != 'high' AND status = 'PENDING_EXPERT_REVIEW' AND created_at < NOW() - INTERVAL '7 days')
" | while read skill_id tier created_at; do
  escalate-sla-breach --skill-id "$skill_id" --tier "$tier"
done
```

---

## 5. Success Criteria

### 5.1 Functional Success Criteria

**SC-1:** Auto-approval tier correctly identifies 70-80% of skills as low-risk
- **Measurement:** Auto-approval rate = (auto-approved skills) / (total skills) ≥ 0.70
- **Validation:** Weekly analysis of approval tier distribution

**SC-2:** False positive rate for auto-approvals < 2%
- **Measurement:** False positives = (auto-approved skills rolled back) / (auto-approved skills) < 0.02
- **Validation:** Track rollback reasons, classify as false positive if "should have required review"

**SC-3:** Team Coordinator approval handles 90% of medium-risk skills without expert escalation
- **Measurement:** Coordinator approval rate = (coordinator approvals) / (escalate tier skills) ≥ 0.90
- **Validation:** Track escalation rate from coordinators to experts

**SC-4:** Expert review time reduced by 90%
- **Measurement:** Expert time saved = (total skills - expert reviews) * avg_review_time / (total skills * avg_review_time)
- **Validation:** Compare expert review hours before/after tier system

**SC-5:** Time to production for auto-approved skills < 60 seconds
- **Measurement:** Deployment time = deployed_at - generated_at < 60s
- **Validation:** Database query on auto-approved skills

**SC-6:** Time to production for coordinator-approved skills < 24 hours
- **Measurement:** Deployment time = deployed_at - generated_at < 24h
- **Validation:** Database query on escalate tier skills

**SC-7:** Expert-approved skills maintain < 1% post-deployment incident rate
- **Measurement:** Incident rate = (skills with incidents) / (expert-approved skills) < 0.01
- **Validation:** Track incidents (error rate spike, rollback, manual intervention)

### 5.2 Performance Success Criteria

**SC-8:** Risk assessment completes in < 2 seconds per skill
- **Measurement:** Assessment time = assessment_completed_at - assessment_started_at < 2s
- **Validation:** Log assessment timing in workflow-codification logs

**SC-9:** Notification delivery < 5 seconds (Slack, email)
- **Measurement:** Notification time = notification_sent_at - event_triggered_at < 5s
- **Validation:** Webhook response time monitoring

**SC-10:** Database tier classification query < 100ms
- **Measurement:** Query execution time for approval_tier_rules lookup < 100ms
- **Validation:** PostgreSQL EXPLAIN ANALYZE on tier classification queries

### 5.3 Security Success Criteria

**SC-11:** Zero auto-approved skills with security vulnerabilities
- **Measurement:** Shellcheck warnings = 0 for auto-approved skills
- **Validation:** Mandatory shellcheck validation before tier assessment

**SC-12:** All tier overrides logged and auditable
- **Measurement:** Audit trail completeness = (logged overrides) / (total overrides) = 1.0
- **Validation:** Database audit log verification

**SC-13:** No privilege escalation via auto-approved skills
- **Measurement:** Post-deployment security scan detects 0 privilege escalation risks
- **Validation:** Monthly security audit of auto-approved skills

### 5.4 Operational Success Criteria

**SC-14:** Coordinator training completion within 7 days of tier system launch
- **Measurement:** Coordinators trained = (trained count) / (total coordinators) ≥ 0.95
- **Validation:** Training attendance tracking

**SC-15:** Expert satisfaction with tier system ≥ 4.0/5.0
- **Measurement:** Expert survey score (ease of use, accuracy, time savings)
- **Validation:** Quarterly expert feedback survey

**SC-16:** System uptime ≥ 99.9% for tier assessment and approval workflows
- **Measurement:** Uptime = (available time) / (total time) ≥ 0.999
- **Validation:** Monitoring dashboard (Prometheus, Grafana)

---

## 6. Integration Requirements

### 6.1 Integration with Phase 3 Workflow Codification

**Pattern Analyzer Integration:**
- Pattern analyzer includes risk assessment during pattern detection
- High-risk patterns flagged early (before skill generation)
- Pattern priority influenced by approval tier (auto-approved patterns = higher value)

**Skill Generator Integration:**
- Skill generator receives approval tier context
- Generated scripts include tier-specific comments and documentation
- Test suite coverage requirements vary by tier (auto=90%, escalate=80%, human=70%)

**Deployment Pipeline Integration:**
- Deployment script checks approval tier before deployment
- Auto-approved skills bypass expert notification
- Coordinator-approved skills include coordinator ID in metadata

### 6.2 Integration with Phase 1 (Corporate Organization)

**Team Coordinator Interface:**
- Coordinators receive Slack notifications for escalate tier skills
- CLI command for coordinator approval: `./.claude/skills/workflow-codification/coordinator-approve.sh`
- Coordinator approval logged in team resource budget (approval activity metric)

**Team Network Isolation:**
- Auto-approved skills restricted to team-scoped operations (enforced by tier rules)
- Cross-team skills automatically escalated to human_required tier
- Network firewall rules validate skill scope matches tier classification

### 6.3 Integration with Existing MCP Isolation

**MCP Server Whitelisting:**
- Escalate tier skills can request new MCP server access (coordinator approval)
- Auto-approved skills use only pre-approved MCP servers
- Human_required tier skills can request unrestricted MCP access (expert approval)

**Token-Based Authentication:**
- Auto-approved skills use team-scoped MCP tokens
- Escalate tier skills can request elevated token permissions (coordinator approval)
- Human_required tier skills can request admin-level tokens (expert approval)

---

## 7. Testing Requirements

### 7.1 Unit Tests

**Test Coverage:** ≥ 95% for tier assessment logic

**Test Cases:**
1. **Auto-Approval Detection:**
   - Read-only database query → tier = 'auto'
   - Validation-only script → tier = 'auto'
   - Content generation → tier = 'auto'

2. **Escalate Detection:**
   - Team-scoped database write → tier = 'escalate'
   - Temp directory file write → tier = 'escalate'
   - Authenticated API read → tier = 'escalate'

3. **Human Required Detection:**
   - Cross-team database write → tier = 'human_required'
   - Production file modification → tier = 'human_required'
   - Docker operations → tier = 'human_required'

4. **Edge Cases:**
   - Skill with mixed operations (read + write) → highest risk tier
   - Skill with insufficient test coverage → escalate tier (minimum)
   - Skill with shellcheck warnings → escalate tier (minimum)

### 7.2 Integration Tests

**Test Coverage:** End-to-end workflows for each tier

**Test Scenarios:**
1. **Auto-Approval Flow:**
   - Generate low-risk skill → tier assessment → auto-deploy → notification
   - Verify deployment time < 60 seconds
   - Verify informational notification sent to team

2. **Coordinator Approval Flow:**
   - Generate medium-risk skill → tier assessment → coordinator notification → approve → deploy
   - Verify coordinator receives Slack notification
   - Verify deployment after coordinator approval
   - Verify deployment time < 24 hours

3. **Expert Approval Flow:**
   - Generate high-risk skill → tier assessment → expert notification → approve → deploy
   - Verify expert receives email + Slack notification
   - Verify deployment after expert approval
   - Verify SLA enforcement (48h high priority)

4. **Tier Override Flow:**
   - Expert overrides tier (auto → human_required)
   - Verify tier updated in database
   - Verify audit log entry created
   - Verify skill routed to expert approval

5. **SLA Breach Flow:**
   - Coordinator inactive for 24h → auto-escalate to expert
   - Expert inactive for 48h → product owner notification
   - Verify escalation notifications sent
   - Verify audit log entries

### 7.3 Security Tests

**Test Coverage:** Validation of tier classification accuracy

**Test Scenarios:**
1. **Command Injection Prevention:**
   - Skill with unvalidated user input → tier = 'human_required'
   - Skill with shellcheck SC2086 warning → tier ≥ 'escalate'

2. **Secrets Exposure Prevention:**
   - Skill with hardcoded API key → tier = 'human_required'
   - Skill with git-secrets violation → reject (not deployed)

3. **Privilege Escalation Prevention:**
   - Skill requesting sudo access → tier = 'human_required'
   - Skill modifying system files → tier = 'human_required'

4. **Cross-Team Access Prevention:**
   - Skill accessing multiple team databases → tier = 'human_required'
   - Skill with cross-team MCP token → tier = 'human_required'

### 7.4 Performance Tests

**Test Coverage:** Tier assessment and notification performance

**Test Scenarios:**
1. **Risk Assessment Benchmark:**
   - Assess 100 skills in parallel
   - Verify average assessment time < 2 seconds
   - Verify no database query timeout errors

2. **Notification Delivery Benchmark:**
   - Send 100 Slack notifications in parallel
   - Verify average delivery time < 5 seconds
   - Verify 100% delivery success rate

3. **Database Query Performance:**
   - Query approval_tier_rules with 1000 rules
   - Verify query execution time < 100ms
   - Verify index usage (EXPLAIN ANALYZE)

---

## 8. Rollout Plan

### 8.1 Phase 1: Database Schema Deployment (Week 1)

**Tasks:**
- Deploy database schema updates (approval_tier columns, approval_tier_rules table)
- Insert default approval tier rules
- Create database indexes
- Validate schema with integration tests

**Success Criteria:**
- Schema deployment successful (zero downtime)
- Default rules inserted (13 rules)
- Query performance < 100ms

### 8.2 Phase 2: Risk Assessment Engine (Week 2)

**Tasks:**
- Implement `assess-risk-tier.sh` script
- Integrate with skill generation pipeline
- Deploy unit tests and integration tests
- Validate tier classification accuracy

**Success Criteria:**
- Risk assessment completes < 2 seconds
- Tier classification accuracy ≥ 95%
- Zero false negatives (high-risk skills classified as low-risk)

### 8.3 Phase 3: Notification System (Week 3)

**Tasks:**
- Implement tier-specific notification templates (Slack, email)
- Integrate with approval workflow
- Deploy coordinator approval CLI command
- Train team coordinators on approval process

**Success Criteria:**
- Notification delivery < 5 seconds
- Coordinator approval rate ≥ 90% (of escalate tier)
- Coordinator training completion ≥ 95%

### 8.4 Phase 4: Production Rollout (Week 4)

**Tasks:**
- Enable auto-approval for low-risk skills (tier = 'auto')
- Monitor auto-approval rate and false positive rate
- Collect expert feedback on tier accuracy
- Adjust tier rules based on feedback

**Success Criteria:**
- Auto-approval rate 70-80%
- False positive rate < 2%
- Expert review time reduced by 90%
- Zero security incidents from auto-approved skills

---

## 9. Monitoring and Metrics

### 9.1 Real-Time Dashboards

**Dashboard 1: Approval Tier Distribution**
- Pie chart: Auto (70-80%), Escalate (15-20%), Human Required (5-10%)
- Trend line: Tier distribution over time (weekly)

**Dashboard 2: Approval Flow Metrics**
- Time to production by tier (auto: < 60s, escalate: < 24h, human: < 7d)
- SLA compliance rate (percentage within SLA)
- Escalation rate (coordinator → expert)

**Dashboard 3: Risk Assessment Accuracy**
- False positive rate (auto-approved skills rolled back)
- False negative rate (high-risk skills classified as low-risk)
- Tier override rate (expert manual reclassification)

**Dashboard 4: Expert Efficiency**
- Expert review time saved (hours/week)
- Expert review queue depth (pending human_required skills)
- Expert approval rate (approved / total reviewed)

### 9.2 Weekly Reports

**Report 1: Auto-Approval Summary**
- List of all auto-approved skills (skill name, team, risk score)
- False positive incidents (skills rolled back)
- Recommendations for rule adjustments

**Report 2: Coordinator Performance**
- Coordinator approval rate by team
- Average approval time by coordinator
- Escalation reasons (why coordinator escalated to expert)

**Report 3: Expert Review Summary**
- Expert review time by skill
- Rejection reasons (why expert rejected skill)
- Correction requests (feedback provided to skill generator)

### 9.3 Monthly Audits

**Audit 1: Security Review**
- All auto-approved skills scanned for security vulnerabilities
- Shellcheck validation results
- Secrets exposure detection (git-secrets)

**Audit 2: Tier Classification Accuracy**
- Sample 10% of skills, manually review tier classification
- Calculate classification accuracy (correct tier / total sampled)
- Identify rule improvements

**Audit 3: ROI Analysis**
- Cost savings from auto-approval (expert time saved * hourly rate)
- Time to production improvement (before/after tier system)
- Incident rate comparison (auto vs expert approved)

---

**End of Approval Tier Requirements Document**

**Next Steps:**
1. Review and approval by Product Owner and CTO
2. Database schema deployment (Week 1)
3. Risk assessment engine implementation (Week 2)
4. Notification system deployment (Week 3)
5. Production rollout and monitoring (Week 4)
