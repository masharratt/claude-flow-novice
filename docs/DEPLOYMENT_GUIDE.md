# Deployment Guide

## Quick Start

This guide explains how to set up and manage deployments for Claude Flow Novice using the automated CD pipeline.

## Prerequisites

- GitHub repository access with write permissions
- SSH access to staging and production servers
- Knowledge of your infrastructure setup
- Valid DNS records pointing to deployment servers

## Initial Setup (One-Time)

### 1. Generate Deployment SSH Keys

Create passwordless SSH key pairs for automated deployments:

```bash
# Generate staging deployment key
ssh-keygen -t ed25519 -C "claude-flow-novice-staging" -f ~/staging_deploy_key -N ""

# Generate production deployment key
ssh-keygen -t ed25519 -C "claude-flow-novice-prod" -f ~/prod_deploy_key -N ""

# Display keys for copying
cat ~/staging_deploy_key
cat ~/prod_deploy_key
```

### 2. Configure Server Access

On staging server:
```bash
# Add deployment key to authorized_keys
echo "ssh-ed25519 AAAA..." >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Create deployment directory
sudo mkdir -p /opt/claude-flow-novice-staging
sudo chown $USER:$USER /opt/claude-flow-novice-staging

# Create systemd service
sudo tee /etc/systemd/system/claude-flow-staging.service > /dev/null <<'EOF'
[Unit]
Description=Claude Flow Novice Staging
After=network.target

[Service]
User=deploy
WorkingDirectory=/opt/claude-flow-novice-staging
ExecStart=/usr/bin/node dist/cli/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable claude-flow-staging
```

On production server:
```bash
# Same setup as staging
echo "ssh-ed25519 AAAA..." >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

sudo mkdir -p /opt/claude-flow-novice
sudo mkdir -p /opt/backups
sudo chown $USER:$USER /opt/claude-flow-novice
sudo chown $USER:$USER /opt/backups

sudo tee /etc/systemd/system/claude-flow-prod.service > /dev/null <<'EOF'
[Unit]
Description=Claude Flow Novice Production
After=network.target

[Service]
User=deploy
WorkingDirectory=/opt/claude-flow-novice/current
ExecStart=/usr/bin/node dist/cli/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable claude-flow-prod
```

### 3. Configure GitHub Secrets

1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"

**Add Staging Secrets:**

| Secret | Value | Example |
|--------|-------|---------|
| STAGING_HOST | Hostname or IP | staging.example.com |
| STAGING_USER | SSH username | deploy |
| STAGING_DEPLOY_KEY | Private SSH key | (paste entire key file) |
| STAGING_URL | Health check URL | https://staging.example.com |

**Add Production Secrets:**

| Secret | Value | Example |
|--------|-------|---------|
| PROD_HOST | Hostname or IP | prod.example.com |
| PROD_USER | SSH username | deploy |
| PROD_DEPLOY_KEY | Private SSH key | (paste entire key file) |
| PRODUCTION_URL | Health check URL | https://example.com |

### 4. Configure GitHub Environments

1. Go to Settings → Environments
2. Click "New environment"
3. Name: `staging`
   - No required reviewers
   - Deployment branches: All branches
4. Name: `production`
   - Required reviewers: 1+ team members
   - Deployment branches: `main` only

## Deployment Workflows

### Automatic Staging Deployment

**Triggered:** Automatically on merge to `main` after CI passes

**Process:**
1. CI pipeline completes and all checks pass
2. Workflow automatically runs `cd.yml` staging-deployment job
3. Creates backup of previous version
4. Builds and transfers new package
5. Extracts and installs dependencies
6. Restarts service via systemctl
7. Runs health checks (5 retries, 10s interval)

**Monitoring:**
- View progress in GitHub Actions tab
- Check server logs: `journalctl -u claude-flow-staging -f`
- Test endpoint: `curl https://staging.example.com/health`

**Rollback if needed:**
```bash
cd /opt/claude-flow-novice-staging
cp -r /path/to/backup/* .
systemctl restart claude-flow-staging
```

### Manual Production Deployment

**Triggered:** Manual approval in GitHub + must be from `main` branch

**Process:**

#### Option 1: Via GitHub Actions UI

1. Go to Actions → CD Pipeline
2. Click "Run workflow"
3. Select `production` from dropdown
4. Click "Run workflow"
5. Workflow runs with environment approval:
   - Pre-deployment backup created
   - Comprehensive tests run
   - Manual approval required
   - Deployment proceeds
   - Health checks verify
   - Automatic rollback on failure

#### Option 2: Via Command Line

```bash
# Trigger production deployment via gh CLI
gh workflow run cd.yml \
  --ref main \
  -f environment=production

# Monitor progress
gh run list --workflow cd.yml --limit 1
```

#### Option 3: Automatic after Staging Success

The CD workflow can automatically trigger production deployment if:
1. Staging deployment succeeds
2. Manual approval is provided in the GitHub environment

**Workflow:**
```
main → CI passes → Staging deploys → Production approval → Prod deploys
                     ✅ Success          (manual click)      ✅ Live
```

### Deployment Checklist

Before deploying to production:

- [ ] All CI checks pass (coverage, tests, security)
- [ ] Code review approval (minimum 1)
- [ ] Staging deployment successful
- [ ] Staging smoke tests passed
- [ ] Feature verification in staging
- [ ] No blocking issues from team
- [ ] Database migrations ready (if any)
- [ ] Documentation updated
- [ ] Changelog updated

## Monitoring Deployments

### GitHub Actions Dashboard

1. Go to Actions tab
2. Click CD Pipeline workflow
3. View:
   - Job execution timeline
   - Log output from each step
   - Artifacts created
   - Deployment status

### Server Logs

```bash
# Staging logs
ssh deploy@staging.example.com
journalctl -u claude-flow-staging -f

# Production logs
ssh deploy@prod.example.com
journalctl -u claude-flow-prod -f

# View recent deployments
ls -lht /opt/claude-flow-novice*/
```

### Health Checks

```bash
# Test staging
curl -i https://staging.example.com/health

# Test production
curl -i https://example.com/health

# Expected response
HTTP/1.1 200 OK
{"status":"healthy","uptime":123.456}
```

## Rollback Procedures

### Automatic Rollback

The CD pipeline automatically rolls back if:
- Post-deployment health checks fail
- Service fails to start
- Critical processes crash

**Rollback happens:**
1. Detects failure
2. Restores from backup
3. Restarts service
4. Verifies restoration
5. Notifies team

**Check status:**
```bash
# View rollback in workflow logs
gh run view <run-id> --log

# Check deployed version
curl https://prod.example.com/version
```

### Manual Rollback

If automatic rollback doesn't work:

```bash
ssh deploy@prod.example.com

# Stop service
systemctl stop claude-flow-prod

# List available backups
ls -lht /opt/backups/

# Restore from most recent backup
LATEST_BACKUP=$(ls -td /opt/backups/* | head -1)
cp -r $LATEST_BACKUP/claude-flow-novice /opt/claude-flow-novice
rm -rf /opt/claude-flow-novice/current
cp -r /opt/claude-flow-novice /opt/claude-flow-novice/current

# Start service
systemctl start claude-flow-prod

# Verify
journalctl -u claude-flow-prod -f
curl https://example.com/health
```

### Rollback via Git

If you need to deploy a previous version:

```bash
# Create release tag for previous version
git tag production-rollback-v1.2.0 <commit-hash>
git push origin production-rollback-v1.2.0

# Force deploy that version
git checkout production-rollback-v1.2.0
git checkout -b hotfix/rollback
git push origin hotfix/rollback

# Create PR to main
gh pr create --title "ROLLBACK: v1.2.0 to v1.1.0" --body "..."

# After CI passes, merge to main (triggers auto-deploy)
```

## Troubleshooting

### Deployment Fails: "SSH key rejected"

**Cause:** Incorrect key or wrong server configuration

**Fix:**
```bash
# Test SSH connection manually
ssh -i ~/prod_deploy_key deploy@prod.example.com "echo 'SSH works!'"

# If it works, regenerate GitHub secret:
1. Copy output from: cat ~/prod_deploy_key
2. Update PROD_DEPLOY_KEY secret in GitHub
3. Rerun workflow
```

### Deployment Fails: "Service failed to start"

**Cause:** Missing dependencies or configuration

**Debug:**
```bash
ssh deploy@prod.example.com

# Check logs
journalctl -u claude-flow-prod -n 50 --no-pager

# Manual start to see errors
cd /opt/claude-flow-novice/current
npm ci --production
npm run build 2>&1 | tail -20

# Check Node version
node --version
npm --version
```

### Health Checks Timing Out

**Cause:** Service takes longer to start than expected

**Solution:**
```bash
# Increase health check retry count in cd.yml
# Change: for i in {1..10}  →  for i in {1..20}
# Change: sleep 15  →  sleep 30

# Test manually
curl -v https://prod.example.com/health
sleep 5
curl -v https://prod.example.com/health
```

### Backup Directory Full

**Cause:** Too many backup versions accumulated

**Solution:**
```bash
ssh deploy@prod.example.com

# Check backup size
du -sh /opt/backups/

# Remove old backups (keep last 10)
ls -td /opt/backups/* | tail -n +11 | xargs rm -rf

# Verify
ls -lht /opt/backups/ | head -10
```

## Performance Tuning

### Faster Deployments

**Reduce package transfer time:**
```bash
# In cd.yml, optimize package creation
- name: Create deployment package
  run: |
    # Exclude unnecessary files
    tar --exclude=node_modules \
        --exclude=.git \
        --exclude=coverage \
        --exclude=.env.* \
        -czf prod-deployment-${{ github.sha }}.tar.gz \
        dist/ claude-assets/ package.json package-lock.json
```

**Parallel dependency installation:**
```bash
# On server, use npm ci with increased concurrency
npm ci --production --legacy-peer-deps --prefer-offline --concurrency=10
```

**Skip unnecessary tests in CD:**
```yaml
- name: Skip full test suite in CD (tests ran in CI)
  run: echo "Tests already verified in CI pipeline"
```

### Faster Rollbacks

**Pre-backup critical paths:**
```bash
# Create hot standby backup
systemctl stop claude-flow-prod-standby || true
cp -r /opt/claude-flow-novice/current /opt/claude-flow-novice-standby

# On failure, swap in <5 seconds
systemctl stop claude-flow-prod
mv /opt/claude-flow-novice/current /opt/claude-flow-novice/failed
mv /opt/claude-flow-novice-standby /opt/claude-flow-novice/current
systemctl start claude-flow-prod
```

## Secrets Management

### Rotating Deployment Keys

Every 90 days or after staff changes:

```bash
# 1. Generate new keys
ssh-keygen -t ed25519 -C "claude-flow-prod-$(date +%Y%m%d)" -f ~/prod_deploy_key_new -N ""

# 2. Add new public key to server
ssh deploy@prod.example.com "echo '$(cat ~/prod_deploy_key_new.pub)' >> ~/.ssh/authorized_keys"

# 3. Update GitHub secret
# Settings → Secrets → Update PROD_DEPLOY_KEY with new private key

# 4. Test deployment
# Trigger test deployment via Actions

# 5. Once verified, remove old key from server
ssh deploy@prod.example.com "sed -i '/old-key-comment/d' ~/.ssh/authorized_keys"

# 6. Cleanup local files
rm ~/prod_deploy_key_old*
```

### Revoking Access

If team member leaves:

```bash
# Remove their SSH key from all servers
for server in staging.example.com prod.example.com; do
  ssh deploy@$server "sed -i '/<member-key>/d' ~/.ssh/authorized_keys"
done

# Rotate all deployment keys
# (Follow rotation process above)
```

## Auditing

### Deployment Records

GitHub Actions creates automatic records:

```bash
# View all deployments via gh CLI
gh deployment list

# View deployment history
gh deployment list --environment production --limit 10

# View specific deployment
gh deployment view <id>
```

### Log Retention

Deployment logs are retained for:
- 90 days on GitHub Actions
- Archive in your logging system

**Export logs:**
```bash
# Export workflow run
gh run download <run-id>

# Store in S3 or archive
aws s3 cp <file> s3://your-archive-bucket/deployments/
```

## Best Practices

1. **Always test in staging first**
   - Deploy to staging automatically
   - Run manual smoke tests
   - Get team verification

2. **Require code review before production**
   - Branch protection rules enforce this
   - Approval shows ownership

3. **Deploy during business hours**
   - Easier to rollback if issues arise
   - Team available to monitor
   - Less impact on 24/7 systems

4. **Use semantic versioning**
   - Tag releases: v1.2.3
   - Update CHANGELOG.md
   - Document breaking changes

5. **Monitor after deployment**
   - Watch error logs for 5 minutes
   - Check key metrics (latency, errors)
   - Verify user-facing functionality

6. **Keep runbooks updated**
   - Document deployment process
   - Update troubleshooting guides
   - Share with team

## Emergency Procedures

### Production Outage - Immediate Rollback

```bash
# 1. Stop affected service
ssh deploy@prod.example.com
systemctl stop claude-flow-prod

# 2. Restore from backup
LATEST_BACKUP=$(ls -td /opt/backups/* | head -1)
cp -r $LATEST_BACKUP/claude-flow-novice /opt/claude-flow-novice
rm -rf /opt/claude-flow-novice/current
cp -r /opt/claude-flow-novice /opt/claude-flow-novice/current

# 3. Start service
systemctl start claude-flow-prod

# 4. Verify
curl -i https://example.com/health
journalctl -u claude-flow-prod -n 20

# 5. Notify team
# Post in #incidents Slack channel
# Create incident post-mortem issue
```

### GitHub Actions Cannot Access Secrets

```bash
# 1. Check secret exists
gh secret list

# 2. Verify it's not empty
gh secret view PROD_DEPLOY_KEY | head -5

# 3. Re-create if corrupted
1. Copy private key: cat ~/prod_deploy_key
2. GitHub Settings → Secrets → Update PROD_DEPLOY_KEY
3. Paste full key content
4. Save and retry workflow
```

## References

- [CD Pipeline Workflow](../.github/workflows/cd.yml)
- [CI/CD Architecture](CI_CD_PIPELINE.md)
- [Branch Protection Rules](BRANCH_PROTECTION_RULES.md)
- [GitHub Deployment Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
