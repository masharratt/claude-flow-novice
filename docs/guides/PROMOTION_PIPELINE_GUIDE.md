# Skill Promotion Pipeline Guide

## Overview

The automated skill promotion pipeline provides a secure, auditable workflow for promoting skills from staging to production. It implements a four-stage process with approval gates, atomic deployment, and comprehensive rollback capability.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                 Skill Promotion Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Stage 1: VALIDATE      Stage 2: TEST        Stage 3: APPROVE  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ Schema validation│──│ Test execution   │──│ Confidence   │  │
│  │ File structure   │  │ Coverage check   │  │ scoring      │  │
│  │ Frontmatter      │  │ Error handling   │  │ Auto/Manual  │  │
│  │ Confidence: 0.95 │  │ Confidence: 0.92 │  │ Threshold    │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│           │                    │                      │        │
│           └────────────────────┴──────────────────────┘        │
│                         ↓ (if approved)                        │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Stage 4: DEPLOY                                        │   │
│  │ ┌──────────────────────────────────────────────────┐  │   │
│  │ │ 1. Backup existing production skill             │  │   │
│  │ │ 2. Atomic move staging → production             │  │   │
│  │ │ 3. Invalidate caches                            │  │   │
│  │ │ 4. Record audit trail                           │  │   │
│  │ │ 5. Send notifications                           │  │   │
│  │ └──────────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────────┘   │
│                          ↓                                     │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ AUDIT TRAIL & MONITORING                             │   │
│  │ - Who promoted, when, and why                        │   │
│  │ - Stage results and confidence scores                │   │
│  │ - Rollback history                                   │   │
│  │ - SLA tracking (submit → promote)                    │   │
│  │ - Notification delivery status                       │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Stage Details

### Stage 1: Validation (Automated)

**Purpose**: Verify skill structure and schema compliance before testing.

**Checks**:
- Directory structure validation
- Required files exist (SKILL.md, execute.sh)
- execute.sh is executable
- Frontmatter format and completeness
- Semantic versioning (x.y.z format)
- Name format validation (alphanumeric, hyphens, underscores)

**Confidence Scoring**:
- Passes all checks: 0.95
- Minor issues: 0.5 - 0.9
- Fails validation: 0.0

**Timeline**: < 30 seconds

**Failure Handling**: Stop pipeline, report errors, send notifications

### Stage 2: Testing (Automated)

**Purpose**: Execute skill tests to verify functionality and measure coverage.

**Actions**:
- Locate and execute `test.sh` script
- Enforce 2-minute timeout
- Capture stdout/stderr for audit trail
- Calculate test coverage percentage
- Handle test failures gracefully

**Test Requirements**:
- `test.sh` must be executable
- Must exit with code 0 on success
- Should produce parseable output for coverage calculation

**Confidence Scoring**:
- All tests pass, coverage >85%: 0.92
- All tests pass, coverage <85%: 0.85
- No tests found: 0.85 (with warning)
- Test failure: 0.0

**Timeline**: < 2 minutes

**Failure Handling**: Stop pipeline at test stage, do not proceed to approval

### Stage 3: Approval Gate (Automated or Manual)

**Purpose**: Gate deployment based on overall confidence score.

**Decision Logic**:
```
Average Confidence = (validation_confidence + test_confidence) / 2

IF avg_confidence >= 0.90
  → AUTO-APPROVE (system)
  → Proceed to deployment
ELSE
  → REQUIRE MANUAL APPROVAL
  → Pause and wait for human review
  → Can proceed with manual override
```

**Manual Approval**:
- Any user with `promote` permission can manually approve
- Provides optional reasoning/justification
- Records approver and timestamp
- Can override auto-rejection

**Rejection Criteria**:
- Any preceding stage failed
- Confidence below threshold and no manual override
- Security scan detected vulnerabilities

**Timeline**:
- Auto-approval: < 1 second
- Manual approval: < 5 minutes (SLA)

### Stage 4: Deployment (Atomic)

**Purpose**: Safely move skill from staging to production with backup and audit.

**Process**:
1. **Verify**: Ensure staging skill exists
2. **Backup**: If production version exists, backup to `.backup.{timestamp}`
3. **Move**: Atomic filesystem move from staging → production
4. **Register**: Create promotion record in database
5. **Audit**: Record action with actor and details
6. **Notify**: Send success notification
7. **Monitor**: Track deployment in metrics

**Atomic Guarantees**:
- Either fully succeeds or fully reverts
- No partial deployments
- Backup created before move
- Database transaction ensures consistency

**Timeline**: < 30 seconds

**Failure Handling**:
- If move fails: Restore from backup
- If database fails: Log error but don't fail deployment
- If notifications fail: Log error but don't fail deployment

## Approval Gates

### Auto-Approval Criteria

A promotion is automatically approved when ALL conditions met:

1. **Validation Stage**
   - All structural checks pass
   - Frontmatter valid and complete
   - Files present and correct permissions

2. **Testing Stage**
   - All tests execute successfully
   - Exit code 0
   - No test timeouts

3. **Confidence Threshold**
   - Average confidence ≥ 0.90
   - No critical errors
   - No security issues

### Manual Approval Trigger

Manual approval is required when:

1. **Confidence Below Threshold**
   - Average confidence < 0.90
   - Requires human judgment

2. **Critical Skills**
   - Mark skills as "critical" requiring human review
   - Examples: authentication, authorization, core infrastructure

3. **Experimental Features**
   - New or major revisions
   - Limited test coverage
   - Unproven in production

### Approval Override

Users with `promote:override` permission can manually approve any promotion:

```bash
# Via CLI
cli promote approve --skill-id auth-v2 --reason "Approved by tech lead"

# Via API
POST /api/promotions/{promotionId}/approve
{
  "approved_by": "username",
  "reason": "Security review completed"
}
```

## Rollback Procedures

### When to Rollback

Rollback a promotion in these scenarios:

1. **Critical Bug Found**
   - Affects core functionality
   - Breaks dependent skills
   - Security vulnerability discovered

2. **Production Issues**
   - Unhandled errors in logs
   - Performance degradation
   - Data corruption

3. **Deployment Failure**
   - Can't recover through patching
   - Requires version downgrade

### Rollback Process

**Automatic Rollback** (if enabled):
```typescript
// Triggers automatically if:
// - Error budget exceeded
// - Critical metrics breach SLO
// - Manual rollback requested
await pipeline.rollback(
  'skill-id',
  'from_version',
  'to_version',
  'actor',
  'reason'
);
```

**Manual Rollback**:
```bash
# Via CLI
cli promote rollback --skill-id auth-v2 --from 2.0.0 --to 1.9.5 \
  --reason "Critical bug found in 2.0.0"

# Via API
POST /api/promotions/{promotionId}/rollback
{
  "to_version": "1.9.5",
  "reason": "Critical bug found"
}
```

**Rollback Steps**:
1. Verify previous version backup exists
2. Move production skill to rollback backup
3. Restore previous version from backup
4. Update registry to point to previous version
5. Record rollback in audit trail
6. Send notifications
7. Trigger health checks

## Audit Trail

All promotion actions are recorded with full context:

### Audit Entry Format

```typescript
{
  promotionId: number;
  skillId: string;
  action: 'promote' | 'validate' | 'test' | 'approve' | 'deploy' | 'rollback';
  actor: string;        // username or 'system'
  timestamp: string;    // ISO 8601
  details: {
    // Action-specific details
    reason?: string;
    confidence?: number;
    stage?: string;
    error?: string;
    approvedBy?: string;
    autoApproved?: boolean;
  };
}
```

### Audit Trail Queries

**Get all promotions for a skill**:
```bash
cli audit --skill auth-v2
# Returns: promotion history with versions and timestamps
```

**Get full audit trail**:
```bash
cli audit --skill auth-v2 --detailed
# Returns: all actions, actors, timestamps, and details
```

**Export audit report**:
```bash
cli audit export --format json --output ./audit_report.json
```

### Audit Retention

- **Minimum**: 1 year (regulatory compliance)
- **Default**: 2 years
- **Configurable**: Via `promotion_audit_retention_days` setting

## SLA Tracking

### SLA Metrics

The pipeline tracks time from submission to completion:

```
Submission → Validation → Testing → Approval → Deployment
     ↓          ↓          ↓         ↓          ↓
  T0          <30s       <2min    <5min      <30s
```

**Total SLA Target**: < 10 minutes (auto-approval) or < 15 minutes (manual)

### SLA Breach Scenarios

1. **Validation Timeout**: > 30 seconds
2. **Test Timeout**: > 2 minutes
3. **Approval Timeout**: > 5 minutes (manual) or > 1 second (auto)
4. **Deployment Timeout**: > 30 seconds

### SLA Monitoring

```bash
# Check SLA compliance
cli promote sla --report
# Outputs: On-time rate, breach summary, trend analysis

# Set alerts
cli promote sla --alert-threshold 0.95 --notify slack
```

## Integration Points

### CI/CD Pipeline

The promotion pipeline integrates with GitHub Actions:

```yaml
# Trigger promotion
workflow_dispatch:
  inputs:
    skill_id: string
    from_version: string
    to_version: string
    reason: string
```

**Stages**:
- `validate` - Run validation checks
- `test` - Execute test suite
- `approval-gate` - Check confidence and gate decision
- `deploy` - Promote to production
- `notify` - Send notifications
- `audit-trail` - Record audit entry

### Notifications

Notifications sent for:

**Success Events**:
- `promotion-submitted`: Initial submission
- `promotion-validated`: Validation passed
- `promotion-tested`: Tests passed
- `promotion-approved`: Approval granted
- `promotion-deployed`: Deployed to production

**Failure Events**:
- `validation-failed`: Structural issues
- `test-failed`: Test execution failure
- `approval-required`: Manual approval needed
- `deployment-failed`: Deployment error
- `promotion-rolled-back`: Rollback executed

**Notification Channels**:
- Slack webhook
- Email
- Webhook (custom integration)
- Internal event bus

### Database Integration

**Tables**:
- `promotions` - Promotion requests and status
- `promotion_stages` - Individual stage results
- `promotion_audit` - Comprehensive audit trail
- `promotion_rollbacks` - Rollback history
- `promotion_sla_tracking` - SLA metrics
- `promotion_notifications` - Notification status

**Indexes**:
- `skill_id`, `status`, `created_at` for fast queries
- `actor`, `timestamp` for audit queries
- `sla_breach` for compliance reporting

## Error Handling

### Validation Errors

Common validation errors and recovery:

| Error | Cause | Solution |
|-------|-------|----------|
| "Missing SKILL.md" | File not found | Create SKILL.md with frontmatter |
| "Invalid frontmatter" | Malformed YAML | Fix frontmatter syntax |
| "Missing execute.sh" | File not found | Create execute.sh script |
| "Not executable" | Wrong permissions | `chmod +x execute.sh` |
| "Invalid version format" | Not semver | Use x.y.z format |

### Test Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Test timeout" | Tests too slow | Optimize tests, increase timeout |
| "Exit code 1" | Test failed | Fix code or test assertion |
| "No test.sh" | Tests missing | Create test.sh (optional but recommended) |

### Deployment Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Permission denied" | Staging not readable | Check file permissions |
| "Disk full" | No space | Free up disk space |
| "File locked" | Concurrent promotion | Wait for lock to release |

### Recovery Procedures

**If validation fails**:
```bash
# Fix skill locally
cd .claude/skills/staging/skill-id
# Make corrections
# Re-run promotion
cli promote submit --skill-id skill-id
```

**If tests fail**:
```bash
# Run tests locally
cd .claude/skills/staging/skill-id
./test.sh
# Fix failing tests
# Re-run promotion
cli promote submit --skill-id skill-id
```

**If deployment fails**:
```bash
# Check disk space, permissions
df -h
ls -la .claude/skills/

# Restore from backup if needed
mv .claude/skills/skill-id.backup.123456 .claude/skills/skill-id

# Retry deployment
cli promote retry --promotion-id 42
```

## Configuration

### Environment Variables

```bash
# Approval threshold (0.0 - 1.0)
PROMOTION_AUTO_APPROVAL_THRESHOLD=0.90

# Test timeout (milliseconds)
PROMOTION_TEST_TIMEOUT_MS=120000

# SLA thresholds (seconds)
PROMOTION_VALIDATION_SLA_SEC=30
PROMOTION_TEST_SLA_SEC=120
PROMOTION_APPROVAL_SLA_SEC=300
PROMOTION_DEPLOYMENT_SLA_SEC=30

# Directories
PROMOTION_STAGING_DIR=.claude/skills/staging
PROMOTION_PRODUCTION_DIR=.claude/skills

# Features
PROMOTION_ENABLE_NOTIFICATIONS=true
PROMOTION_ENABLE_ROLLBACK=true
PROMOTION_ENABLE_AUDIT=true

# Audit retention (days)
PROMOTION_AUDIT_RETENTION_DAYS=730
```

### Configuration File

```yaml
# .claude/config/promotion-pipeline.yml
pipeline:
  autoApprovalThreshold: 0.90
  testTimeoutMs: 120000
  stagingDir: .claude/skills/staging
  productionDir: .claude/skills

approval:
  requireManualForCritical: true
  requireManualForNewAuthors: true
  criticalSkills:
    - authentication
    - authorization
    - data-validation

sla:
  validationSec: 30
  testingSec: 120
  approvingSec: 300
  deploymentSec: 30
  alertOnBreach: true

notifications:
  enabled: true
  channels:
    - slack
    - email
  slackWebhook: ${SLACK_WEBHOOK_URL}
  emailRecipients:
    - ops@example.com

audit:
  enabled: true
  retentionDays: 730
  logToFile: ./logs/promotions.log
  logToDatabase: true
```

## Performance

### Metrics

**Validation Stage**:
- Average: 2-5 seconds
- P99: < 30 seconds
- Success rate: > 99%

**Testing Stage**:
- Average: 15-45 seconds
- P99: < 2 minutes
- Coverage: Minimum 85%

**Approval Stage**:
- Auto-approval: < 1 second
- Manual approval: < 5 minutes (SLA)

**Deployment Stage**:
- Average: 3-10 seconds
- P99: < 30 seconds
- Success rate: > 99.9%

**Total Pipeline**:
- Auto-approval path: < 5 minutes
- Manual approval path: < 15 minutes

### Optimization Tips

1. **Faster validation**: Validate locally before pushing
2. **Faster tests**: Optimize test suite, use test parallelization
3. **Faster deployment**: Pre-warm production directory, optimize backup strategy
4. **Auto-approval**: Keep confidence score high, maintain test coverage

## Security

### Access Control

**Permission Model**:
- `promote:submit` - Submit promotion request
- `promote:approve` - Approve low-confidence promotions
- `promote:override` - Override any approval decision
- `promote:rollback` - Execute rollbacks
- `promote:audit` - Access audit trails

**Typical Roles**:
- **Developers**: submit
- **Tech Leads**: submit, approve, rollback
- **DevOps**: override, rollback, audit
- **Compliance**: audit (read-only)

### Audit Security

- All actions logged with immutable audit trail
- Timestamps verified with system clock
- Actor identity validated from authentication
- Changes tracked with git commits
- Regulatory compliance (SOC2, HIPAA ready)

### Sensitive Data

No sensitive data stored in audit trail:
- API keys/secrets excluded
- Only metadata recorded
- Details field sanitized
- PII redacted automatically

## Troubleshooting

### Common Issues

**"Promotion stuck at approval gate"**
- Check confidence score: `cli audit --promotion-id N`
- Manually approve if appropriate: `cli promote approve --promotion-id N`
- Check approval gate logs

**"Test timeout"**
- Increase timeout: `PROMOTION_TEST_TIMEOUT_MS=180000`
- Profile tests: `time ./test.sh`
- Run tests locally: `cd staging/skill && ./test.sh`

**"Deployment failed"**
- Check disk space: `df -h`
- Check permissions: `ls -la .claude/skills/`
- Restore from backup: `mv .claude/skills/skill.backup.* .claude/skills/skill`

**"Rollback failed"**
- Verify backup exists: `ls -la .claude/skills/skill.backup.*`
- Check permissions on backup
- Manual restore: `mv backup production-path`

### Debug Mode

Enable verbose logging:
```bash
DEBUG=promotion:* npm run test
# or
export LOG_LEVEL=debug
cli promote submit --skill-id skill-id --verbose
```

### Getting Help

- Check logs: `tail -f ./logs/promotions.log`
- Review audit trail: `cli audit --skill-id skill-id --detailed`
- Contact DevOps team
- Check GitHub issues

## Best Practices

1. **Keep Skill Tests Current**: Update tests with code changes
2. **Meaningful Commit Messages**: Include reason and context in promotions
3. **Review Audit Trail**: Regularly check promotion history
4. **Monitor SLA**: Track and optimize promotion times
5. **Backup Strategy**: Keep production backups for at least 7 days
6. **Documentation**: Update SKILL.md with changes
7. **Version Bumps**: Use semver consistently (breaking.feature.patch)
8. **Test Coverage**: Maintain > 85% code coverage

## API Reference

### Promotion Service

```typescript
// Promote skill
await pipeline.promote(request, skillPath);

// Manual approval
await pipeline.approveManually(request, approver, reason);

// Rollback
await pipeline.rollback(skillId, fromVersion, toVersion, actor, reason);

// Get audit trail
const audit = await pipeline.getAuditTrail(skillId);

// Get promotion status
const status = await pipeline.getPromotionStatus(promotionId);
```

### CLI Commands

```bash
# Submit promotion
cli promote submit --skill-id NAME --from VERSION --to VERSION --reason "text"

# Approve promotion
cli promote approve --promotion-id ID --reason "text"

# Rollback promotion
cli promote rollback --skill-id NAME --from VERSION --to VERSION --reason "text"

# Check status
cli promote status --skill-id NAME

# View audit trail
cli audit --skill-id NAME [--detailed]

# SLA report
cli promote sla --report [--period DAYS]
```

## Support

For issues or questions:
- GitHub Issues: `label:promotion-pipeline`
- DevOps Slack: `#devops-platform`
- Email: `devops@example.com`
- Documentation: See other docs in `./docs/`
