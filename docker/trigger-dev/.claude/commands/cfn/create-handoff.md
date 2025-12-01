---
description: "Create session handoff documentation for team transitions or context resets (project)"
tags: ["handoff", "session-transition", "documentation", "context-preservation"]
---

# Create Session Handoff Documentation

Generate comprehensive handoff documentation for transitioning work between sessions or teams.

## Usage

```bash
/create-handoff [domain] [--duration=hours] [--focus="description"]
```

## Parameters

- `domain` (required): Work domain (e.g., docker, cfn-v3, testing, security)
- `--duration` (optional): Session duration in hours (default: 24)
- `--focus` (optional): Session focus description

## Examples

```bash
# Create handoff for Docker work
/create-handoff docker

# Create handoff with specific focus
/create-handoff cfn-v3 --focus="Loop 3 implementation and validation"

# Create handoff for longer session
/create-handoff security --duration=48 --focus="Security audit and remediation"
```

## What This Does

The handoff-coordinator agent will:

1. **Extract session context:**
   - Git commits from specified duration
   - Modified files with change summaries
   - Key decisions and trade-offs
   - Bugs fixed and issues deferred

2. **Generate structured handoff:**
   - Executive summary (90-second read)
   - Technical details with file changes
   - Validation procedures and smoke tests
   - Next steps with clear criteria
   - Confidence scoring (0.0-1.0)

3. **Create quick reference:**
   - 5-minute "resume work immediately" guide
   - Critical context only
   - Executable smoke test

4. **Output artifacts:**
   - `planning/[domain]/handoff/SESSION_HANDOFF_[timestamp].md`
   - `planning/[domain]/handoff/QUICK_START_[domain].md`
   - Backlog entry (if work incomplete)

## When to Use This

**Use /create-handoff when:**
- ✅ Ending a multi-hour session with significant progress
- ✅ Transitioning work to another team
- ✅ Resetting context for a fresh session
- ✅ Documenting complex bug fixes or architectural decisions
- ✅ Creating checkpoints during long-running epics

**Don't use /create-handoff for:**
- ❌ Simple single-file edits
- ❌ Trivial bug fixes with no architectural impact
- ❌ Work that's already fully documented
- ❌ Sessions with no significant decisions or changes

## Output Structure

The generated handoff document includes:

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

## Command Implementation

**YOU MUST IMMEDIATELY EXECUTE THE TASK TOOL AFTER READING THIS COMMAND.**

Do not just explain what would happen - actually spawn the agent.

```javascript
// Extract parameters
const domain = args[0] || "general";
const duration = extractFlag(args, "--duration") || "24";
const focus = extractFlag(args, "--focus") || "Recent session work";

// Spawn handoff-coordinator agent
Task("handoff-coordinator", `
  Create session handoff documentation for ${domain} domain.

  Session context:
  - Focus: ${focus}
  - Duration: Last ${duration} hours
  - Domain: ${domain}

  Requirements:
  - Extract git commits from last ${duration} hours
  - Document all file changes with summaries
  - Identify and document key decisions
  - Create executable smoke test
  - Include rollback procedure
  - Generate quick start guide

  Output location: planning/${domain}/handoff/
  Target confidence: ≥0.90

  Deliverables:
  1. SESSION_HANDOFF_[timestamp].md (full handoff document)
  2. QUICK_START_${domain}.md (5-minute resume guide)
  3. Backlog entry (if work incomplete)
  4. Smoke test script (executable validation)
`)
```

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

## Related Commands

- `/cfn-loop-task` - Execute CFN Loop workflows
- `/github-commit` - Create git commits
- `/suggest-improvements` - Analyze codebase quality

## Anti-Patterns

**Don't do this:**
```bash
# ❌ Creating handoff without context
/create-handoff unknown

# ❌ Handoff for trivial work
/create-handoff typo-fix

# ❌ Handoff without domain
/create-handoff
```

**Do this instead:**
```bash
# ✅ Clear domain and focus
/create-handoff docker --focus="Alpine Linux shell compatibility fix"

# ✅ Specific duration for multi-day work
/create-handoff cfn-v3 --duration=72 --focus="Three-loop validation implementation"

# ✅ Detailed context for complex work
/create-handoff security --focus="P1 vulnerability remediation and validation"
```

## Notes

- Handoff documents are stored in `planning/[domain]/handoff/`
- Git context is extracted automatically (no manual commit listing required)
- Smoke tests are generated as executable shell scripts
- Confidence scoring is calculated automatically
- Backlog entries are created only if work is incomplete

## Version History

- **v1.0 (2025-11-14):** Initial command creation with handoff-coordinator agent integration
