# CI/CD Pipeline Architecture

## Overview

Claude Flow Novice implements a comprehensive, production-ready CI/CD pipeline using GitHub Actions. The pipeline automates testing, code quality checks, security scanning, coverage verification, and deployment with zero-downtime capability.

**Performance Target:** CI runs complete in <10 minutes (typical: 6-8 minutes)

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Trigger Events                            │
│  • Push to main/develop  • Pull Requests  • Scheduled (nightly)  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
    ┌────────┐   ┌───────────┐  ┌────────────┐
    │  Lint  │   │  Unit     │  │ Integration│
    │ Check  │   │  Tests    │  │   Tests    │
    └────────┘   └───────────┘  └────────────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  Coverage Analysis   │
            │  (Merge Reports)     │
            │  (Gate Checks)       │
            └──────────────────────┘
                       │
            ┌──────────┴──────────┐
            │                     │
            ▼                     ▼
      ┌──────────┐          ┌──────────────┐
      │  Security│          │ Performance  │
      │  Scans   │          │  Tests       │
      └──────────┘          └──────────────┘
            │                     │
            └──────────┬──────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  Quality Gate        │
            │  (All Checks Pass)   │
            └──────────────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  Staging Deployment  │
            │  (Automatic on main) │
            └──────────────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  Production Approval │
            │  (Manual + Tests)    │
            └──────────────────────┘
```

## Workflow Files

### 1. CI Pipeline (.github/workflows/ci.yml)

**Purpose:** Automated testing, linting, and build verification on every push and PR

**Jobs:**
- **lint** (15 min): ESLint, TypeScript type checking, skill markdown linting
- **unit-tests** (20 min): Jest unit tests across Node 18 & 20 with coverage
- **integration-tests** (30 min): Full integration tests with Redis & PostgreSQL services
- **performance-tests** (30 min): Load and performance benchmarks
- **coverage-gates** (15 min): Merge coverage reports and enforce thresholds
- **build-verification** (15 min): Verify dist build outputs
- **quality-gate** (5 min): Summary check of all jobs
- **notify** (5 min): Status summary to GitHub

**Concurrency:**
- Cancels in-progress runs on new pushes (except main)
- Prevents duplicate runs

**Coverage Thresholds:**
- Lines: ≥80%
- Statements: ≥80%
- Functions: ≥80%
- Branches: ≥75%

### 2. Deployment Pipeline (.github/workflows/cd.yml)

**Purpose:** Automated staging deployment and controlled production deployment

**Environments:**
1. **Staging** (Automatic)
   - Triggers on main branch after CI passes
   - Backs up previous version
   - Performs smoke tests
   - Zero-downtime deployment via systemctl

2. **Production** (Manual Approval)
   - Requires environment approval
   - Creates backup before deployment
   - Runs comprehensive post-deployment tests
   - Automatic rollback on failure
   - Creates deployment records with git commits

**Deployment Process:**
```
1. Pre-deployment backup
2. Package build artifacts
3. Transfer to deployment server
4. Extract and install dependencies
5. Zero-downtime swap (systemctl restart)
6. Health check verification (retry 10x with 15s interval)
7. On failure: automatic rollback from backup
8. Post-deployment record creation
```

**Configuration:**
Requires GitHub Actions secrets:
- `STAGING_HOST`, `STAGING_USER`, `STAGING_DEPLOY_KEY`
- `PROD_HOST`, `PROD_USER`, `PROD_DEPLOY_KEY`
- `STAGING_URL`, `PRODUCTION_URL`

### 3. Coverage Pipeline (.github/workflows/coverage.yml)

**Purpose:** Comprehensive coverage reporting with badges and trends

**Jobs:**
- **generate-coverage** (30 min): Merge unit + integration coverage, upload to Codecov
- **critical-paths-coverage** (20 min): Strict 85% coverage for critical paths
- **coverage-trends** (15 min): Historical tracking of coverage metrics
- **coverage-badge** (10 min): Auto-generate and commit coverage badge

**Badge URL:**
```
![Coverage](https://raw.githubusercontent.com/yourusername/claude-flow-novice/main/coverage-badge.svg)
```

**Critical Paths:**
- Orchestration (coordinator, agent spawning)
- Coordination (protocol validation, consensus)
- Core CLI functionality

### 4. Security Pipeline (.github/workflows/security-enhanced.yml)

**Purpose:** Multi-layer security scanning covering vulnerabilities, secrets, and supply chain

**Jobs:**

#### a. Dependency Vulnerability Scan
- `npm audit` with full JSON report
- Fails on critical vulnerabilities
- Warns on high severity issues
- Archives JSON report for auditing

#### b. Static Application Security Testing (SAST)
- ESLint with security rules plugin
- Detects:
  - `eval()` usage
  - Unsafe regex patterns
  - Buffer unsafe operations
  - Child process spawning
  - Unsafe file operations
- Hardcoded secret pattern detection
- Dependency confusion checks

#### c. License Compliance
- Scans all dependencies for license types
- Identifies problematic licenses (GPL, AGPL, SSPL)
- Requires manual review for copyleft licenses

#### d. Supply Chain Security
- NPM package authenticity verification
- Typosquatting detection (unusual package names)
- Package-lock.json integrity checks

#### e. Secret Detection
- TruffleHog: verified secret scanning
- Custom pattern detection for API keys
- Git history scanning (looks back 50 commits)

**Thresholds:**
- Critical vulnerabilities: ❌ FAIL
- High vulnerabilities: ⚠️ Warn (continue with visibility)
- Hardcoded secrets: ❌ FAIL

## Coverage Gates Explained

### Why Coverage Gates Matter

Coverage gates prevent degradation of code quality by:
1. Ensuring new code meets minimum standards
2. Blocking merges that reduce overall coverage
3. Focusing extra scrutiny on critical paths
4. Creating accountability for test completeness

### Gate Configuration

**Standard Thresholds:**
```json
{
  "lines": 80,
  "statements": 80,
  "functions": 80,
  "branches": 75
}
```

**Critical Paths (Orchestration, Coordination):**
```json
{
  "lines": 85,
  "statements": 85,
  "functions": 85,
  "branches": 80
}
```

### How Gates Work

1. **Merge Coverage:** Reports from unit and integration tests are merged using nyc
2. **Threshold Check:** Each metric compared against thresholds
3. **Fail Gate:** If any metric below threshold, CI fails
4. **PR Comment:** Coverage report posted to PR with metric breakdown
5. **Badge Generation:** SVG badge created and committed to main

### Coverage Calculation

**Line Coverage:** % of source lines executed
**Statement Coverage:** % of statements executed (more granular)
**Function Coverage:** % of functions called
**Branch Coverage:** % of conditional branches taken (if/else, switch cases)

### Reading Coverage Reports

```
Coverage Summary:
  Lines:       82.4% ✅ (>=80%)
  Statements:  82.1% ✅ (>=80%)
  Functions:   81.7% ✅ (>=80%)
  Branches:    76.3% ✅ (>=75%)
```

### Common Coverage Gaps

**Uncovered Lines:**
- Error handling paths (catch blocks)
- Fallback logic
- Platform-specific code

**Strategies to Improve:**
- Add negative test cases for error paths
- Use integration tests to exercise complex flows
- Mock external services for edge cases
- Test rollback/recovery scenarios

## Security Scanning Details

### Dependency Vulnerability Scanning

**How it works:**
1. npm audit checks against known vulnerability database
2. Generates JSON report with severity levels
3. Critical: Immediate fix required
4. High: Schedule for next sprint
5. Moderate: Consider in backlog
6. Low: Monitor for mass updates

**Remediation:**
```bash
# View vulnerabilities
npm audit

# Auto-fix if available
npm audit fix

# Fix specific package
npm install package@new-version
```

### SAST (Static Analysis)

**Checked Issues:**
- Eval with expressions (code injection risk)
- Unsafe regular expressions (DoS risk)
- Buffer operations without assertions
- Child process without input validation
- File operations with unsanitized paths

**False Positives:**
SAST may flag safe patterns in test/mock code. Review warnings before dismissing.

### Secret Detection

**Method 1 - TruffleHog:**
- Verified secrets only (high entropy, known patterns)
- Scans git history, not just current code
- Fails workflow if verified secret found

**Method 2 - Custom Patterns:**
- API key patterns (ANTHROPIC_, OPENAI_, etc.)
- Bearer tokens
- Private key formats

**Prevention:**
```bash
# Use environment variables
export ANTHROPIC_API_KEY=sk-...

# Reference in code
const apiKey = process.env.ANTHROPIC_API_KEY;
```

### License Compliance

**MIT (Permissive):** ✅ Safe to use
**Apache 2.0:** ✅ Safe to use
**BSD:** ✅ Safe to use
**GPL 2.0:** ⚠️ Code must be open source
**AGPL 3.0:** ⚠️ Network services must release source
**SSPL:** ❌ Generally avoided in commercial projects

**Check your dependencies:**
```bash
npm list --depth=0
```

## PR Workflow

### Automatic Checks on Every PR

When you create a PR against main or develop:

1. **CI Pipeline** runs immediately (6-8 min)
   - All tests execute in parallel
   - Coverage must meet thresholds
   - Linting and type checking pass
   - Build verification succeeds

2. **Coverage Report** posted as PR comment
   ```
   ## Coverage Analysis
   | Metric | Coverage | Threshold | Status |
   |--------|----------|-----------|--------|
   | Lines | 82.4% | 80% | ✅ |
   ```

3. **Security Scan** runs
   - Dependency vulnerabilities flagged
   - Secrets checked against git history
   - Licenses reviewed

4. **Status Checks** block merge if:
   - Tests fail
   - Coverage below threshold
   - Type errors detected
   - Security vulnerabilities found (critical only)

### PR Merging Strategy

**Requirements to merge to main:**
- ✅ All CI checks pass
- ✅ Coverage >= thresholds
- ✅ No critical security issues
- ✅ Code review approval
- ✅ Branch up-to-date with main

## Performance Optimization

### Why <10 Minutes?

1. **Parallel Job Execution**
   - Lint, unit, integration, performance run simultaneously
   - Node 18 & 20 matrix split across runners
   - Reduces 40 min sequential to 8 min parallel

2. **Caching**
   - npm dependencies cached per branch
   - Previous builds used for incremental compilation
   - Saves ~2 minutes per run

3. **Matrix Strategy**
   - Tests run on Node 18 & 20 in parallel
   - Integration tests limited to Node 20 (4 workers)
   - Performance tests on single runner (2 workers)

4. **Artifact Management**
   - Coverage reports retained 30 days
   - Build artifacts retained 7 days
   - Prevents storage bloat

### Timeout Configuration

| Job | Timeout | Typical |
|-----|---------|---------|
| Lint | 15 min | 2 min |
| Unit Tests | 20 min | 5 min |
| Integration | 30 min | 10 min |
| Performance | 30 min | 8 min |
| Coverage | 15 min | 3 min |
| Build | 15 min | 2 min |
| Deployment | 20-30 min | 10-15 min |

## Branch Protection Rules

**Recommended for main branch:**

```yaml
Require status checks to pass before merging:
  - lint
  - unit-tests (Node 18)
  - unit-tests (Node 20)
  - integration-tests
  - build-verification
  - coverage-gates

Require code reviews: 1 approval required

Require branches to be up to date before merging: Yes

Require CI pipeline status: required
```

**Configure in GitHub:**
1. Repository → Settings → Branches
2. Add rule for `main`
3. Check "Require status checks to pass"
4. Select all CI checks

## Troubleshooting

### Coverage Gates Failing

**Symptom:** "Coverage X% < YY% threshold"

**Solutions:**
1. Add missing test cases for untested code paths
2. Run locally: `npm run test:coverage`
3. Review report: `coverage/lcov-report/index.html`
4. Focus on critical paths first (coordin, agents)

### Tests Timing Out

**Symptom:** "Jest timeout of 5000ms exceeded"

**Solutions:**
```bash
# Increase timeout for specific test
jest.setTimeout(10000);

# Check for hanging connections
# - Redis not closed
// - Database connections not released
// - Event listeners not cleaned up
```

### Security Scan False Positives

**Harmless patterns to ignore:**
- Test code with intentional vulnerabilities
- Mock API keys in fixtures
- Example patterns in documentation

**Suppress warnings:**
```json
{
  "eslintignore": ["tests/", "docs/"],
  "security/detect-eval-with-expression": "off"
}
```

### Deployment Rollback

If production deployment fails:

1. **Automatic:** Rollback script runs, restores from backup
2. **Manual:** SSH to production server
   ```bash
   systemctl stop claude-flow-prod
   cp -r /opt/backups/latest/* /opt/claude-flow-novice/
   systemctl start claude-flow-prod
   ```

### Performance Regression

**Detect:** Performance test fails with baseline comparison

**Investigate:**
```bash
npm run test:performance
# Check perf-results.json for slow operations
```

**Fix:**
- Profile with Node inspector: `node --inspect`
- Check for new dependencies
- Optimize hot paths
- Review git diff for logic changes

## Environment Configuration

### CI Environment Variables

```bash
# Set in GitHub secrets or .env
NODE_ENV=test
REDIS_HOST=localhost
REDIS_PORT=6379
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=test
POSTGRES_PASSWORD=test
POSTGRES_DB=cfn_test
```

### Deployment Secrets

Required in GitHub repository secrets:

**Staging:**
- `STAGING_HOST` - SSH hostname
- `STAGING_USER` - SSH username
- `STAGING_DEPLOY_KEY` - SSH private key
- `STAGING_URL` - Health check URL (optional)

**Production:**
- `PROD_HOST` - SSH hostname
- `PROD_USER` - SSH username
- `PROD_DEPLOY_KEY` - SSH private key
- `PRODUCTION_URL` - Health check URL (optional)

**Add secrets:**
1. Repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: STAGING_HOST
4. Value: your.staging.host

## Maintenance

### Regular Tasks

**Weekly:**
- Review security scan results
- Check for deprecated dependencies
- Monitor deployment times

**Monthly:**
- Update dependency versions
- Review coverage trends
- Analyze performance metrics

**Quarterly:**
- Update Node.js versions in matrix
- Review branch protection rules
- Audit security policies

### Updating Workflows

When modifying workflows:

1. Test in a branch first
2. Reference updated file in PR
3. Verify jobs run as expected
4. Merge to main

```bash
# Example: Test updated ci.yml
git checkout -b workflow/update-ci
# Edit .github/workflows/ci.yml
git push origin workflow/update-ci
# Create PR and check jobs
```

## Metrics & Reporting

### Key Metrics

**CI Performance:**
- Average run time: 6-8 minutes
- Pass rate: >99%
- Build cache hit rate: >80%

**Coverage:**
- Overall: ~82%
- Critical paths: >85%
- Month-over-month trend: +1-2%

**Security:**
- Critical vulnerabilities: 0
- High vulnerabilities: <3
- Coverage of SAST checks: 100%

### Accessing Reports

**Codecov:** https://app.codecov.io/gh/yourusername/claude-flow-novice

**GitHub Actions:** https://github.com/yourusername/claude-flow-novice/actions

**Test Results:** Workflow run → Artifacts → coverage-report

## Cost Optimization

**GitHub Actions Pricing:**
- Free tier: 2000 min/month (public repo)
- Shared runners: $0.008/min (private)
- Typical monthly usage: 200-400 min

**Optimize costs:**
1. Use scheduled runs during off-hours (cron)
2. Skip CI for docs-only PRs
3. Cache dependencies aggressively
4. Limit matrix to essential node versions
5. Use concurrency to cancel redundant runs

## Next Steps

1. Configure branch protection rules
2. Add deployment secrets to GitHub
3. Update README with coverage badge
4. Create runbook for deployment issues
5. Set up Codecov organization sync
