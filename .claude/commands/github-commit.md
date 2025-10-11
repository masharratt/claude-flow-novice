---
description: "Analyze staged changes, commit, push, and monitor CI/CD pipeline status"
argument-hint: "[--chat|--full]"
allowed-tools: ["Bash", "Read", "Grep", "Glob", "BashOutput", "TodoWrite"]
---

# GitHub Commit - Automated Git Workflow with CI/CD Monitoring

Analyze staged changes, create commits, push to remote, and monitor CI/CD pipeline execution.

🚨 **AUTOMATED GIT WORKFLOW WITH CI/CD MONITORING**

**Options**: $ARGUMENTS

## Command Modes

```bash
/github-commit              # Analyze all staged changes in repository
/github-commit --chat       # Only analyze changes made in current chat session
/github-commit --full       # Full repository analysis with detailed metrics
```

## Execution Pattern

### Step 1: Analyze Changes
```bash
# Determine scope based on flags
if [[ "$ARGUMENTS" == *"--chat"* ]]; then
  # Get files modified in current session
  git diff --name-only HEAD
else
  # Get all staged changes
  git status --porcelain
  git diff --staged
fi
```

### Step 2: Generate Commit Message
```bash
# Analyze changes and draft commit message
git diff --staged --stat
git log -3 --oneline  # Match repository commit style

# Generate commit message following conventional commits:
# - feat: New feature
# - fix: Bug fix
# - refactor: Code refactoring
# - docs: Documentation updates
# - test: Test additions/modifications
# - chore: Maintenance tasks
```

### Step 3: Create Commit
```bash
git add <relevant-files>
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

<body - explain WHY not WHAT>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Step 4: Push to Remote
```bash
# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Push with upstream tracking
git push -u origin "$BRANCH"
```

### Step 5: Monitor CI/CD Pipeline
```bash
# Wait for CI/CD to start (5 second delay)
sleep 5

# Monitor GitHub Actions workflow status
gh run list --branch "$BRANCH" --limit 1 --json status,conclusion,name,databaseId

# Poll every 10 seconds until completion
while true; do
  STATUS=$(gh run view --json status,conclusion -q '.status,.conclusion')

  if [[ "$STATUS" == *"completed"* ]]; then
    # Check if successful or failed
    if [[ "$STATUS" == *"success"* ]]; then
      echo "✅ CI/CD Pipeline PASSED"
      break
    else
      echo "❌ CI/CD Pipeline FAILED"
      gh run view --log-failed
      exit 1
    fi
  fi

  sleep 10
done
```

## Flags

### --chat (Session Scope)
**Purpose**: Only commit changes made during current chat session

**Implementation**:
```bash
# Get session start time (approximate)
SESSION_START=$(date -d "30 minutes ago" +%s)

# Find files modified after session start
git diff --name-only HEAD | while read file; do
  FILE_MTIME=$(stat -c %Y "$file")
  if [ "$FILE_MTIME" -gt "$SESSION_START" ]; then
    echo "$file"
  fi
done
```

### --full (Comprehensive Analysis)
**Purpose**: Full repository analysis with metrics

**Implementation**:
```bash
# Generate comprehensive change analysis
echo "## Change Summary"
git diff --staged --stat
git diff --staged --shortstat

echo "## File Changes"
git diff --staged --name-status

echo "## Impact Analysis"
# Count lines added/removed by file type
git diff --staged --numstat | awk '
  {
    files++
    add += $1
    del += $2

    if ($3 ~ /\.ts$|\.tsx$/) ts++
    if ($3 ~ /\.js$|\.jsx$/) js++
    if ($3 ~ /\.md$/) docs++
  }
  END {
    print "Files modified: " files
    print "Lines added: " add
    print "Lines removed: " del
    print "TypeScript files: " ts
    print "JavaScript files: " js
    print "Documentation: " docs
  }
'
```

## CI/CD Monitoring

### Supported Platforms
- **GitHub Actions** (via `gh` CLI)
- **GitLab CI** (via `glab` CLI)
- **CircleCI** (via API)
- **Jenkins** (via API)

### Failure Handling
```bash
# On CI/CD failure
if [[ "$CI_STATUS" == "failure" ]]; then
  echo "❌ Pipeline failed. Retrieving logs..."

  # Get failed job logs
  gh run view --log-failed

  # Offer rollback option
  echo ""
  echo "Options:"
  echo "1. Fix locally and push again"
  echo "2. Revert commit: git revert HEAD && git push"
  echo "3. Force fix: git commit --amend && git push --force-with-lease"
fi
```

## Output Format

```
Analyzing staged changes...

Files to commit (--chat scope):
  M src/cfn-loop/crash-detector.ts
  M src/cli/commands/recovery-resume.ts
  A tests/cfn-loop/crash-detection.test.ts

Commit message:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
feat(cfn-loop): Add crash detection and recovery

Implement crash detection system with automatic
recovery and resume capabilities for interrupted
CFN Loop executions.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Creating commit...
✅ Commit created: abc1234

Pushing to origin/main...
✅ Push successful

Monitoring CI/CD pipeline...
⏳ GitHub Actions workflow starting...
⏳ Running tests (1/3 jobs complete)...
⏳ Running build (2/3 jobs complete)...
⏳ Running deploy (3/3 jobs complete)...

✅ CI/CD Pipeline PASSED (2m 34s)

All checks passed. Changes successfully deployed.
```

## Safety Features

### Pre-Commit Validation
```bash
# Run pre-commit hooks if configured
if [ -f .git/hooks/pre-commit ]; then
  .git/hooks/pre-commit
fi

# Validate no secrets in staged files
git diff --staged | grep -i -E "(api[_-]?key|password|secret|token)" && {
  echo "⚠️  Warning: Potential secrets detected in staged changes"
  echo "Please review before committing"
  exit 1
}
```

### Branch Protection
```bash
# Never force push to protected branches
PROTECTED_BRANCHES=("main" "master" "production")

if [[ " ${PROTECTED_BRANCHES[@]} " =~ " ${BRANCH} " ]]; then
  echo "⚠️  Warning: Pushing to protected branch '$BRANCH'"
  echo "Force push disabled for safety"
  git push origin "$BRANCH"  # No --force
fi
```

## Integration with Other Commands

- **Pre-commit**: Runs `/hooks post-edit` validation
- **Post-push**: Triggers `/github workflow status` monitoring
- **On failure**: Suggests `/github pr create` for review before merge
- **Documentation**: Auto-triggers `/cfn-loop-document` on epic completion

## Example Workflows

### Daily Development
```bash
# Make changes throughout the day
# Ready to commit
/github-commit --chat

# Output: Commits only files modified in current session
```

### Feature Completion
```bash
# Completed feature implementation
/github-commit --full

# Output: Full analysis with metrics, CI/CD monitoring
```

### Hotfix Deployment
```bash
# Critical bug fix
/github-commit

# Monitors CI/CD closely
# On success: Auto-deploys to production
# On failure: Immediately shows logs and rollback options
```
