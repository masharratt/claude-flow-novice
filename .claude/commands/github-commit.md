---
description: "Analyze staged changes, commit, push, and monitor CI/CD pipeline status"
argument-hint: "[--chat|--full]"
allowed-tools: ["Task"]
---

# GitHub Commit - Automated Git Workflow with CI/CD Monitoring

Analyze staged changes, create commits, push to remote, and monitor CI/CD pipeline execution using specialized GitHub commit agent.

🚨 **DELEGATED TO SPECIALIZED GITHUB COMMIT AGENT**

**Options**: $ARGUMENTS

## Command Modes

```bash
/github-commit              # Analyze all staged changes in repository
/github-commit --chat       # Only analyze changes made in current chat session
/github-commit --full       # Full repository analysis with detailed metrics
```

## Execution Pattern

**This command delegates all work to the specialized `github-commit-agent`:**

```javascript
Task("github-commit-agent", `
  Execute GitHub commit workflow with the following parameters:

  **Mode**: ${ARGUMENTS.includes('--chat') ? 'chat' : ARGUMENTS.includes('--full') ? 'full' : 'standard'}

  **Scope**:
  ${ARGUMENTS.includes('--chat') ? '- Analyze changes made in current chat session only' : ''}
  ${ARGUMENTS.includes('--full') ? '- Perform comprehensive repository analysis with detailed metrics' : ''}
  ${!ARGUMENTS.includes('--chat') && !ARGUMENTS.includes('--full') ? '- Analyze all staged changes in repository' : ''}

  **Required Steps**:
  1. Analyze git repository changes (staged and unstaged)
  2. Generate conventional commit message from change analysis
  3. Create commit with proper formatting and co-authorship
  4. Push changes to remote repository with upstream tracking
  5. Monitor CI/CD pipeline status (GitHub Actions, GitLab CI, CircleCI)
  6. Handle pipeline failures with actionable recommendations
  7. Provide rollback options on failure

  **Safety Requirements**:
  - Detect and warn about potential secrets in commits
  - Respect protected branch policies (no force push to main/master/production)
  - Run pre-commit hooks if configured
  - Handle hook-modified files appropriately (amend if safe, new commit otherwise)

  **Conventional Commit Types**:
  - feat: New features, capabilities, slash commands
  - fix: Bug fixes, error corrections
  - docs: Documentation updates only
  - refactor: Code restructuring without behavior change
  - test: Test additions or modifications
  - chore: Maintenance, version bumps, config changes
  - perf: Performance improvements

  **Commit Message Template**:
  <type>(<scope>): <subject>

  <body - explain WHY not WHAT>

  <footer - breaking changes, references>

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>

  **Output Requirements**:
  - Show files to be committed
  - Display generated commit message
  - Report commit hash
  - Show push status
  - Monitor and report CI/CD pipeline status
  - Provide rollback options on failure

  **Confidence Scoring**:
  Report confidence (0.0-1.0) based on:
  - Commit message quality
  - CI/CD pipeline status
  - Secret detection results
  - Pre-commit hook success
  - Push success
`, "github-commit-agent")
```

## Agent Responsibilities

The `github-commit-agent` handles the complete commit workflow:

### 1. Change Analysis
- Detects scope based on flags (chat/full/standard)
- Analyzes staged and unstaged changes
- Reviews recent commit history for style consistency
- Generates change impact metrics (files changed, lines added/removed)

### 2. Commit Message Generation
- Follows conventional commit format
- Analyzes changes to determine commit type automatically
- Extracts scope from affected files/features
- Generates descriptive subject and body
- Explains WHY changes were made, not WHAT was changed

### 3. Safety Validation
- Scans for potential secrets (API keys, tokens, passwords)
- Runs pre-commit hooks if configured
- Validates against protected branch policies
- Handles hook-modified files appropriately

### 4. Commit Creation
- Stages relevant files
- Creates commit with proper formatting
- Includes co-authorship attribution
- Handles amend vs new commit based on context

### 5. Push to Remote
- Detects current branch
- Respects protected branch policies
- Sets upstream tracking
- Verifies push success

### 6. CI/CD Monitoring
- Detects CI/CD platform (GitHub Actions, GitLab CI, etc.)
- Monitors pipeline status in real-time
- Reports job progress
- Provides detailed logs on failure
- Offers rollback options on pipeline failure

## Expected Output

```
Analyzing staged changes...

Files to commit (standard scope):
  M .claude/agents/github/github-commit-agent.md
  M .claude/commands/github-commit.md
  A tests/github/commit-agent.test.ts

Commit message:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
feat(github): Add specialized GitHub commit agent

Create dedicated agent for git commit workflows with
CI/CD monitoring, conventional commit formatting, and
automated pipeline tracking.

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

Confidence: 0.92
All checks passed. Changes successfully deployed.
```

## Integration

### CFN Loop Integration
- Auto-triggered after epic/sprint completion
- Includes CFN Loop metadata in commit footer
- Links to phase documentation

### Documentation Integration
- Triggers `/cfn-loop-document` for epic completion
- Updates component status automatically
- Syncs README files

## Error Handling

The agent handles common failure scenarios:

### Push Failures
- Branch divergence → Suggests pull --rebase
- Rejected push → Suggests PR creation
- Protected branch → Redirects to PR workflow

### CI/CD Failures
- Shows failed job logs
- Offers rollback options (revert, amend, fix locally)
- Provides actionable next steps

### Secret Detection
- Warns on potential secrets
- Requires confirmation to proceed
- Logs detection for audit

## Agent Configuration

See `.claude/agents/github/github-commit-agent.md` for complete agent implementation details including:
- Detailed execution patterns
- Safety validation logic
- CI/CD platform integrations
- Error handling strategies
- Confidence scoring algorithm
