---
name: cfn-session-handoff
description: Session handoff documentation generator for team transitions and context resets
version: 1.0.0
tags: [handoff, documentation, session-transition, context-preservation]
status: production
---

# Session Handoff Skill

**Version:** 1.0.0
**Purpose:** Generate comprehensive handoff documentation for transitioning work between sessions or teams
**Status:** Production

---

## Overview

Creates structured handoff documentation by:
- Extracting git commits and file changes
- Documenting key decisions and trade-offs
- Generating executable smoke tests
- Creating quick-start resume guides
- Calculating confidence scores

---

## Directory Structure

```
cfn-session-handoff/
├── SKILL.md                 # This file
├── extract-context.sh       # Git commit and file analysis
├── generate-handoff.sh      # Main handoff document generator
├── create-smoke-test.sh     # Executable validation script creator
├── calculate-confidence.sh  # Confidence scoring engine
└── lib/
    ├── git-analyzer.sh      # Git history analysis
    ├── decision-extractor.sh # Key decision identification
    └── templates/
        ├── handoff-template.md
        └── quickstart-template.md
```

---

## Usage

### Direct Invocation

```bash
# Basic handoff for domain
./.claude/skills/cfn-session-handoff/generate-handoff.sh \
  --domain docker \
  --duration 24

# With specific focus
./.claude/skills/cfn-session-handoff/generate-handoff.sh \
  --domain cfn-v3 \
  --duration 48 \
  --focus "Loop 3 implementation and validation"

# Full options
./.claude/skills/cfn-session-handoff/generate-handoff.sh \
  --domain security \
  --duration 72 \
  --focus "P1 vulnerability remediation" \
  --output planning/security/handoff
```

---

## Process Flow

### 1. Context Extraction
- Scans git commits from specified duration
- Analyzes modified files with change summaries
- Extracts key decisions and trade-offs
- Identifies bugs fixed and issues deferred

### 2. Document Generation
Creates structured handoff with:
- Executive summary (90-second read)
- Technical details with file changes
- Validation procedures and smoke tests
- Next steps with clear criteria
- Confidence scoring (0.0-1.0)

### 3. Quick Reference Creation
Generates 5-minute resume guide:
- Critical context only
- Executable smoke test
- Immediate next actions

### 4. Artifact Output
Produces:
- `SESSION_HANDOFF_[timestamp].md` (full document)
- `QUICK_START_[domain].md` (resume guide)
- `smoke-test.sh` (executable validation)
- Backlog entry (if work incomplete)

---

## Output Structure

### Executive Summary
- Session scope and objectives
- Key achievements
- Critical decisions
- Current state

### Work Completed
- Commits with hashes and messages
- Files changed with line counts
- Tests created/updated
- Documentation written

### Key Decisions
- Decision description
- Alternatives considered
- Trade-offs accepted
- Rationale and confidence

### Technical Details
- Root cause analyses
- Fix implementations
- Validation procedures
- Test results

### Current State
- What's working
- What needs attention
- What's blocked
- What's deferred

### Next Steps
- Immediate actions (today)
- Short-term goals (24-48 hours)
- Medium-term roadmap (next week)

### Validation Procedures
- Pre-handoff checklist
- Smoke test script
- Integration test
- Rollback procedure

### Confidence & Risk Assessment
- Component-level confidence scores
- Overall handoff confidence
- Risk classification (low/medium/high)
- Mitigation strategies

---

## When to Use

**Use this skill when:**
- ✅ Ending a multi-hour session with significant progress
- ✅ Transitioning work to another team
- ✅ Resetting context for a fresh session
- ✅ Documenting complex bug fixes or architectural decisions
- ✅ Creating checkpoints during long-running epics

**Don't use for:**
- ❌ Simple single-file edits
- ❌ Trivial bug fixes with no architectural impact
- ❌ Work that's already fully documented
- ❌ Sessions with no significant decisions or changes

---

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `--domain` | Yes | - | Work domain (docker, cfn-v3, testing, security) |
| `--duration` | No | 24 | Session duration in hours |
| `--focus` | No | - | Session focus description |
| `--output` | No | `planning/[domain]/handoff` | Output directory |
| `--confidence-threshold` | No | 0.90 | Minimum confidence score |

---

## Success Criteria

The handoff is complete when:
- ✅ Handoff document follows template structure
- ✅ All commits referenced with valid hashes
- ✅ All file changes documented
- ✅ Key decisions include rationale
- ✅ Smoke test is executable
- ✅ Rollback procedure documented
- ✅ Confidence scores calculated
- ✅ Quick start guide created
- ✅ Overall confidence ≥0.90

---

## Examples

### Example 1: Docker Work
```bash
./.claude/skills/cfn-session-handoff/generate-handoff.sh \
  --domain docker \
  --focus "Alpine Linux shell compatibility fix"
```

**Output:**
```
planning/docker/handoff/
├── SESSION_HANDOFF_20251202_143000.md
├── QUICK_START_docker.md
└── smoke-test.sh
```

### Example 2: Multi-Day CFN Work
```bash
./.claude/skills/cfn-session-handoff/generate-handoff.sh \
  --domain cfn-v3 \
  --duration 72 \
  --focus "Three-loop validation implementation"
```

### Example 3: Security Audit
```bash
./.claude/skills/cfn-session-handoff/generate-handoff.sh \
  --domain security \
  --duration 48 \
  --focus "P1 vulnerability remediation and validation"
```

---

## Integration

### With CFN Loop
```bash
# After completing CFN loop phase
./.claude/skills/cfn-session-handoff/generate-handoff.sh \
  --domain "phase-2-auth" \
  --focus "Authentication implementation complete"
```

### With Git Workflows
```bash
# Before major commit
git add .
./.claude/skills/cfn-session-handoff/generate-handoff.sh \
  --domain current-feature
git commit -m "feat: Complete feature with handoff documentation"
```

---

## Dependencies

- **Git**: For commit and file analysis
- **jq**: JSON processing for structured data
- **Bash 4.0+**: Shell scripting
- **find/grep**: File analysis

---

## Version History

### 1.0.0 (2025-12-02)
- Initial skill implementation
- Moved from command to skill
- Added modular structure (extract, generate, test, score)

---

**Status:** ✅ Production Ready
