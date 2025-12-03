---
name: cfn-github-workflow
description: Automated git commit workflow with CI/CD monitoring and conventional commits
version: 1.0.0
tags: [github, git, ci-cd, automation, workflow]
status: production
---

# GitHub Workflow Skill

Comprehensive git workflow automation including commits, pushes, and CI/CD pipeline monitoring.

## Purpose

Automates the complete GitHub workflow:
- Staged change analysis
- Conventional commit message generation
- Git push with error handling
- CI/CD pipeline monitoring
- Status reporting

## Usage

```bash
# Analyze all staged changes
./.claude/skills/cfn-github-workflow/commit.sh

# Only changes from current chat session
./.claude/skills/cfn-github-workflow/commit.sh --chat

# Full repository analysis with metrics
./.claude/skills/cfn-github-workflow/commit.sh --full
```

## Features

### Smart Commit Messages
- Follows conventional commits (feat, fix, refactor, docs, test, chore)
- Analyzes git history to match repository style
- Includes Co-Authored-By: Claude attribution
- Adds Claude Code generation footer

### CI/CD Integration
- Monitors pipeline status after push
- Reports test results and coverage
- Alerts on build failures
- Tracks deployment status

### Pre-commit Hooks
- Automatic formatting via hooks
- Amends commits if hooks modify files
- Verifies commit authorship before amending

## Workflow

1. **Analyze Changes**: `git status`, `git diff --staged`
2. **Draft Commit**: Generate conventional commit message
3. **Create Commit**: Add files and commit with message
4. **Push**: Push to remote with error handling
5. **Monitor CI/CD**: Track pipeline execution
6. **Report Status**: Summary of commit and pipeline results

## Safety Features

- Never updates git config
- Never force pushes to main/master
- Verifies authorship before amending
- Backup/restore on errors
- Skips committing secrets (.env, credentials.json)

