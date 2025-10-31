# Operational Runbooks - Hybrid Architecture Deployment

## Deployment Operations

### 1. Initial Deployment
- **Prerequisite Checks**
  - Verify all team configurations
  - Confirm Redis coordination endpoints
  - Validate Z.ai provider routing

- **Deployment Steps**
  ```bash
  npx cfn-flow deploy --mode=hybrid --teams=5
  ./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
    --validate-teams \
    --cost-optimization-mode
  ```

### 2. Scaling Operations
- **Horizontal Scaling**
  ```bash
  /cfn-loop-scale --add-team=marketing \
    --routing-provider=z.ai \
    --cost-mode=optimized
  ```

- **Vertical Scaling**
  ```bash
  /cfn-loop-scale --increase-resources \
    --team=engineering \
    --memory=+4GB \
    --cpu=+2cores
  ```

### 3. Monitoring Activation
- **Activation Command**
  ```bash
  ./.claude/skills/p1-monitoring/activate.sh \
    --mode=comprehensive \
    --teams=5
  ```

## Backup & Recovery

### 1. State Recovery
- **Redis Snapshot Recovery**
  ```bash
  ./.claude/skills/cfn-redis-coordination/recover-swarm.sh \
    --task-id="$LAST_KNOWN_TASK" \
    --recovery-point=latest
  ```

### 2. Rollback Procedure
- **Rollback to Previous Stable Version**
  ```bash
  npx cfn-rollback \
    --version="v2.9.0" \
    --teams=5 \
    --confirm
  ```

## Operational Checkpoints

### Daily Operations Checklist
- [ ] Verify Redis coordination health
- [ ] Check Z.ai provider routing status
- [ ] Review cost optimization metrics
- [ ] Validate team-level performance
- [ ] Inspect error logs

### Performance Tuning
- **Cost Optimization Trigger**
  ```bash
  /switch-api optimize \
    --threshold=40% \
    --action=auto-scale
  ```

## Troubleshooting Quick Reference
- Refer to `docs/operations/TROUBLESHOOTING.md` for detailed issue resolution