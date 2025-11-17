# Branch Protection Rules Configuration

## Overview

Branch protection rules enforce code quality and security standards by requiring automated checks to pass before code can be merged to protected branches. This guide explains how to configure these rules for the Claude Flow Novice repository.

## Why Branch Protection?

1. **Quality Assurance:** Prevents untested or low-quality code from reaching production
2. **Security:** Blocks code with known vulnerabilities or exposed secrets
3. **Consistency:** Ensures all PRs follow the same validation standards
4. **Accountability:** Creates an audit trail of approvals and checks

## Protected Branches

**Recommended:** main, develop, release/*

```
main (production)
  ├── Strictest rules
  ├── All CI checks required
  ├── 1+ code review
  └── Up-to-date with develop

develop (integration)
  ├── All CI checks required
  ├── Coverage gates enforced
  └── Up-to-date before merge

release/* (release candidate)
  ├── All CI checks required
  └── Requires admin approval
```

## Setup Steps

### Step 1: Navigate to Branch Protection Rules

1. Go to your GitHub repository
2. Click **Settings** (gear icon)
3. In left sidebar, click **Branches**
4. Click **Add rule** button

### Step 2: Configure Main Branch Protection

**Branch name pattern:** `main`

#### Basic Settings

1. **Require a pull request before merging**
   - ☑ Check this box
   - Required pull request reviews before merging: **1**
   - ☑ Require reviews from code owners
   - ☑ Require approval of the most recent reviewable push

2. **Require status checks to pass before merging**
   - ☑ Check this box
   - ☑ Require branches to be up to date before merging

3. **Require status checks**

   Select these status checks (required):
   ```
   ☑ lint
   ☑ unit-tests (Node 18)
   ☑ unit-tests (Node 20)
   ☑ integration-tests
   ☑ build-verification
   ☑ coverage-gates
   ```

4. **Other protections**
   - ☑ Require code owners review
   - ☑ Require approval of the most recent reviewable push
   - ☑ Allow auto-merge (optional)
   - ☑ Allow force pushes to: Do not allow force pushes
   - ☑ Allow deletions: Unchecked

#### Security Settings

```
☑ Require status checks to pass before merging
  └─ Require branches to be up to date before merging

☑ Include administrators
  └─ Enforce all rules on administrators
```

#### Review Settings

```
Require code reviews: 1

☑ Require reviews from code owners

☑ Require approval of the most recent reviewable push

☑ Require status checks to pass before merging
```

#### Save

Click **Create** to apply the rule.

### Step 3: Configure Develop Branch Protection

**Branch name pattern:** `develop`

Repeat Step 2 with these modifications:

- Required pull request reviews: **0** (less strict than main)
- All same status checks required
- Require branches up to date: **Yes**

### Step 4: Configure Release Branch Protection

**Branch name pattern:** `release/*`

- Required pull request reviews: **1**
- Status checks required: **All CI checks**
- Require admin approval: **Yes**
- Require branches up to date: **Yes**

## Status Check Configuration

The CI/CD pipeline automatically registers these status checks:

### Critical (must pass)

```yaml
lint:
  - ESLint
  - TypeScript type checking
  - Markdown linting

unit-tests-18:
  - Jest on Node 18
  - Coverage reporting

unit-tests-20:
  - Jest on Node 20
  - Coverage reporting

integration-tests:
  - Integration test suite
  - Redis & PostgreSQL services

build-verification:
  - TypeScript compilation
  - dist/ directory verification

coverage-gates:
  - Lines coverage >= 80%
  - Statements >= 80%
  - Functions >= 80%
  - Branches >= 75%
```

### Optional (can fail, but visible in PR)

```yaml
performance-tests:
  - Load testing
  - Baseline comparison

security-scan:
  - Dependency vulnerabilities (warning level)
  - License compliance
```

## Environment Configuration

### GitHub Secrets Required

For deployment automation, configure these secrets in Settings → Secrets and variables → Actions:

**Staging Environment:**
```
STAGING_HOST=staging.example.com
STAGING_USER=deploy
STAGING_DEPLOY_KEY=-----BEGIN OPENSSH PRIVATE KEY-----
STAGING_URL=https://staging.example.com
```

**Production Environment:**
```
PROD_HOST=prod.example.com
PROD_USER=deploy
PROD_DEPLOY_KEY=-----BEGIN OPENSSH PRIVATE KEY-----
PRODUCTION_URL=https://example.com
```

### Environment Protection

Create GitHub Environments with approval requirements:

**Steps:**
1. Settings → Environments → New environment
2. Name: `staging`
3. Required reviewers: (optional)
4. Name: `production`
5. Required reviewers: **1+ person for approval**
6. Deployment branches: `main` only

## Code Owners Configuration

Create `.github/CODEOWNERS` file to require reviews from specific team members:

```
# Global owners
* @team/core

# Critical paths
/src/cli/ @team/core
/src/coordination/ @team/core
/src/agents/ @team/core

# Documentation
/docs/ @team/docs
/README.md @team/core

# Configuration
/.github/ @team/core
package.json @team/core
```

## Workflow

### For Feature Development

```
1. Create feature branch from develop
   git checkout -b feature/my-feature develop

2. Implement feature and push
   git push origin feature/my-feature

3. Create Pull Request against develop
   - Title: Clear description
   - Description: Why this change?
   - Link to issues if applicable

4. Automatic checks run
   - Lint check
   - Unit tests
   - Integration tests
   - Coverage verification
   - Security scan
   → Takes 6-8 minutes

5. Code review
   - At least 1 approval required
   - Address feedback
   - Push fixes (checks re-run automatically)

6. Merge to develop
   - Requires:
     ✓ All status checks pass
     ✓ 1+ code review approval
     ✓ Branch up to date with develop

7. Auto-merge option
   - Enable to auto-merge when conditions met
   - Useful for dependabot PRs
```

### For Release to Production

```
1. Create release branch from develop
   git checkout -b release/v1.2.0 develop

2. Version bumps and changelog updates
   - Update package.json version
   - Update CHANGELOG.md
   - Commit: "chore: release v1.2.0"

3. Create Pull Request against main
   - All CI checks must pass
   - All status checks required

4. Code review & approval
   - Need coverage verification
   - Need security sign-off
   - Need product owner approval

5. Merge to main
   - Triggers automatic deployment to staging

6. Test in staging
   - Run smoke tests
   - Verify functionality
   - Check performance

7. Manual production approval
   - Review staging test results
   - Click "Approve and deploy" in GitHub
   - Production deployment starts
   - Automatic rollback on failure

8. Post-deployment verification
   - Health checks pass
   - All critical features working
   - No error spikes
```

## Troubleshooting

### "Required status check is missing"

**Cause:** The expected status check hasn't reported yet

**Solution:**
1. Rerun failed jobs in Actions tab
2. Wait for workflow to complete
3. Check workflow file syntax

### "Merge button disabled"

**Cause:** One or more required checks failed

**Reasons:**
- Tests didn't pass
- Coverage below threshold
- Linting errors
- Type check errors

**Fix:**
1. Click on failed check for details
2. Fix issues locally
3. Push fixes to PR branch
4. Checks re-run automatically

### "Require code owner review" not working

**Cause:** CODEOWNERS file not found or malformed

**Fix:**
```bash
# Verify file exists
ls -la .github/CODEOWNERS

# Check syntax
cat .github/CODEOWNERS

# Users should be: @org/team or @username
```

### Status check not showing up

**Cause:** Workflow hasn't run yet

**Solutions:**
1. Ensure workflow file is in .github/workflows/
2. Check trigger conditions (branches, paths)
3. Verify workflow syntax with `git push --dry-run`
4. Check Actions tab for errors

## Best Practices

### For Repository Administrators

1. **Review configuration quarterly**
   - Remove deprecated checks
   - Add new required validations
   - Update Node.js versions

2. **Monitor status checks**
   - Track false positive rate
   - Adjust timeout limits if too restrictive
   - Keep CI fast (<10 min)

3. **Document requirements**
   - Update CONTRIBUTING.md
   - Link to CI/CD documentation
   - Explain gate thresholds

4. **Communicate changes**
   - Announce new requirements
   - Give teams time to adapt
   - Provide training on new tools

### For Contributors

1. **Run tests locally before pushing**
   ```bash
   npm run test
   npm run typecheck
   npm run lint:skills
   ```

2. **Check PR status immediately**
   - Fix failures quickly
   - Don't wait for other reviews

3. **Follow contribution guidelines**
   - Update tests with new code
   - Add documentation
   - Update CHANGELOG

4. **Communicate blockers**
   - Ask for help in PR comments
   - Request guidance from code owners
   - Escalate if tools are broken

## Temporary Bypass (Admin Emergency Only)

**Should rarely be used:**

1. Go to branch settings
2. Temporarily uncheck required status checks
3. Merge (document reason)
4. **Immediately** re-enable protections
5. Create follow-up issue to fix underlying problem

**Example reason:**
```
EMERGENCY: Production outage, rolling back v1.2.0

Disabling protection for 15 minutes to deploy hotfix v1.2.1

Follow-up: Fix issue preventing normal CI flow
```

## Audit & Compliance

### Viewing Protection History

```bash
# Check who approved PR
git log --oneline main..develop

# View all merges with approval info
git log --oneline --all --graph

# Check specific protection rules
gh api repos/:owner/:repo/branches/main/protection
```

### Compliance Reporting

Branch protection enforcement ensures:
- ✅ Code review process
- ✅ Automated testing
- ✅ Security scanning
- ✅ Version control audit trail

**For compliance documentation:**
1. Export branch protection rules
2. Document CI/CD pipeline configuration
3. Maintain approval records
4. Track any overrides

## Integration with CI/CD

Branch protection rules work together with CI/CD pipelines:

```
Feature Branch
    ↓
CI Tests Run (parallel)
    ↓ All Pass
PR Created
    ↓
Code Review + Status Check Pass
    ↓ Approved
Merge to Main
    ↓
CD Pipeline Triggers
    ↓
Staging Deployment
    ↓
Production Approval
    ↓
Production Deployment
```

## Advanced Configuration

### Conditional Requirements

Some organizations require different checks based on:

**File changes:**
- Docs-only: Skip integration tests
- Core changes: Require extra review
- Dependency updates: Run security scan

**Implement via workflow:**
```yaml
- name: Determine required checks
  run: |
    if git diff --quiet src/; then
      echo "skip-integration=true" >> $GITHUB_OUTPUT
    fi
```

### Automatic PR Actions

**Auto-merge dependabot PRs:**
```yaml
- name: Enable auto-merge
  if: github.actor == 'dependabot[bot]'
  run: gh pr merge --auto --squash "${{ github.event.pull_request.number }}"
```

**Auto-close stale PRs:**
```yaml
- name: Close stale PR
  if: github.event_name == 'schedule'
  run: gh pr close -c "Closing due to inactivity"
```

## References

- [GitHub Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [About Status Checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [CodeOwners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)

## Questions?

See [CI/CD Pipeline Documentation](CI_CD_PIPELINE.md) for detailed workflow information.
