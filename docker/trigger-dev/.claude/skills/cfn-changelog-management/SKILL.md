---
skill_id: cfn-changelog-management
name: CFN Changelog Management
version: 1.0.0
category: documentation
tags: [changelog, versioning, release-notes, sparse-logging]
dependencies: []
---

# CFN Changelog Management Skill

## Purpose
Systematically track implementation changes with sparse, structured entries appended to project changelog. Enables quick visibility into what changed, when, and why without verbose commit-style messages.

## Problem Solved
Traditional changelogs require manual curation and often become stale or inconsistent. Agents completing features, fixing bugs, or making architectural changes need a lightweight way to document impact without context-switching to git commits or detailed documentation.

## When to Use

### ✅ REQUIRED Usage Scenarios
- **After feature implementation** - Agent completes feature work
- **After bug fix** - Agent resolves issue with code changes
- **After breaking change** - API/interface modifications that affect consumers
- **After dependency update** - Major version bumps or security patches
- **After architectural change** - Coordination pattern modifications, skill refactors

### ⚠️ OPTIONAL Usage Scenarios
- **After performance optimization** - Measurable improvements (>10% speedup)
- **After security enhancement** - Hardening, vulnerability fixes
- **Internal refactoring** - Code cleanup without behavioral changes (use judgment)

### ❌ DO NOT USE For
- **Routine maintenance** - Formatting, linting, comment updates
- **Work-in-progress** - Incomplete features or experimental changes
- **Test-only changes** - Adding tests without production code changes
- **Documentation-only updates** - README edits, comment clarifications

## Interface

### Primary Script: `add-changelog-entry.sh`

**Required Parameters:**
- `--type`: Entry type (feature|bugfix|breaking|dependency|architecture|performance|security)
- `--summary`: One-line description (10-100 chars)
- `--impact`: What changed and why it matters

**Optional Parameters:**
- `--version`: Target version (default: auto-increment patch)
- `--issue`: Related issue/bug number (e.g., "BUG-123", "#456")
- `--files`: Key files affected (comma-separated, max 5)
- `--migration`: Migration notes for breaking changes

**Usage:**
```bash
./.claude/skills/cfn-changelog-management/add-changelog-entry.sh \
  --type "feature" \
  --summary "Add backlog management skill for deferred work tracking" \
  --impact "Agents can now systematically capture deferred items with structured metadata instead of losing context in chat history" \
  --files ".claude/skills/cfn-backlog-management/SKILL.md,readme/BACKLOG.md"
```

### Output Location
All entries appended to: `readme/CHANGELOG.md`

## Changelog File Structure

```markdown
# Claude Flow Novice Changelog

## [Unreleased]

### Features
- Add backlog management skill (2025-10-31)
  - Impact: Systematic deferred work tracking with priority/tag organization
  - Files: `.claude/skills/cfn-backlog-management/`

### Bug Fixes

### Breaking Changes

### Dependencies

### Architecture

### Performance

### Security

---

## [2.11.0] - 2025-10-31

### Features
- Backlog management skill implementation
  - Impact: Centralized tracking of deferred work items
  - Files: `.claude/skills/cfn-backlog-management/add-backlog-item.sh`

...
```

## Entry Types

### Feature
New functionality, skills, commands, or capabilities.
```bash
--type "feature"
--summary "Implement Redis pub/sub coordination for zero-token waiting"
--impact "Agents block on BLPOP instead of polling, eliminating API calls during wait cycles"
```

### Bug Fix
Defect resolution, error handling improvements.
```bash
--type "bugfix"
--summary "Fix race condition in Loop 3 confidence collection"
--impact "Orchestrator now uses synchronous temp file capture instead of polling Redis keys"
--issue "BUG-10"
```

### Breaking Change
Incompatible changes requiring user/agent migration.
```bash
--type "breaking"
--summary "Rename skill cfn-redis-coordination → cfn-swarm-coordination"
--impact "All agent spawn commands must update skill references"
--migration "Run: sed -i 's/cfn-redis-coordination/cfn-swarm-coordination/g' .claude/agents/**/*.md"
```

### Dependency
Package updates, version bumps, security patches.
```bash
--type "dependency"
--summary "Upgrade redis 5.0.0 → 5.8.3"
--impact "Fixes CVE-2024-1234, adds BLPOP timeout parameter support"
```

### Architecture
Coordination pattern changes, skill refactors, system design updates.
```bash
--type "architecture"
--summary "Extract output processing into dedicated skill"
--impact "95% code reuse between Loop 3 and Loop 2 consensus collection"
--files ".claude/skills/cfn-agent-output-processing/SKILL.md"
```

### Performance
Optimizations with measurable impact.
```bash
--type "performance"
--summary "Parallel agent spawning with background processes"
--impact "3x speedup for 3-agent coordination (sequential: 15s → parallel: 5s max latency)"
```

### Security
Hardening, vulnerability fixes, audit improvements.
```bash
--type "security"
--summary "Add pre-edit backup hook for safe file revert"
--impact "Prevents git conflicts in parallel sessions, 24h backup retention"
```

## Validation Rules

1. **Type validation**: Must be one of 7 defined types
2. **Summary length**: 10-100 characters (enforces brevity)
3. **Impact required**: Cannot be empty (enforces "why it matters")
4. **File limit**: Max 5 files (prevents noise)
5. **Version format**: Semantic versioning (X.Y.Z)

## Sparse Language Guidelines

### ✅ Good Examples
```
Summary: "Add Redis coordination skill"
Impact: "Zero-token agent waiting via BLPOP"

Summary: "Fix confidence parsing edge case"
Impact: "Handles percentage format (85%) in addition to decimal (0.85)"

Summary: "Upgrade better-sqlite3 to v12.4.1"
Impact: "Node 22 compatibility, fixes installation errors on WSL2"
```

### ❌ Bad Examples (Too Verbose)
```
Summary: "We have implemented a comprehensive Redis-based coordination system..."
Impact: "This change allows agents to coordinate more efficiently by using a blocking..."

Summary: "Fixed a bug"
Impact: "There was an issue that has been resolved"
```

### Sparse Pattern Rules
- **Active voice**: "Add feature" not "Feature added"
- **No articles**: "Fix bug" not "Fix the bug"
- **No fluff**: "Enables X" not "This change enables X"
- **Measurable impact**: Include numbers when relevant (3x speedup, 95% reduction)

## Integration Examples

### Loop 3 Agent (After Feature Implementation)
```bash
# Agent completes feature work
Edit: file_path="src/new-feature.ts" ...

# Document change
./.claude/skills/cfn-changelog-management/add-changelog-entry.sh \
  --type "feature" \
  --summary "JWT authentication middleware" \
  --impact "Stateless auth reduces session storage by 80%" \
  --files "src/middleware/auth.ts,src/types/jwt.ts"
```

### Loop 2 Validator (After Identifying Bug Fix)
```bash
# Validator reviews fix
./.claude/skills/cfn-changelog-management/add-changelog-entry.sh \
  --type "bugfix" \
  --summary "Prevent null pointer in Redis connection retry" \
  --impact "Eliminates crashes during Redis unavailability" \
  --issue "BUG-42" \
  --files "src/redis/client.ts"
```

### Product Owner (After Architectural Decision)
```bash
# Product Owner approves design change
./.claude/skills/cfn-changelog-management/add-changelog-entry.sh \
  --type "architecture" \
  --summary "Split orchestrator into modular helper scripts" \
  --impact "78% code reduction, improved testability" \
  --files ".claude/skills/cfn-loop-orchestration/helpers/"
```

## Versioning Strategy

### Auto-Increment (Default)
Script reads current version from `package.json`, increments patch:
- Current: `2.11.0` → Entry added to: `[Unreleased]`
- On release: Move `[Unreleased]` → `[2.11.1] - YYYY-MM-DD`

### Manual Version (Override)
```bash
--version "3.0.0"  # Specify major/minor bump explicitly
```

### Release Workflow
1. Agents add entries to `[Unreleased]` section
2. On release trigger (manual or automated):
   - Rename `[Unreleased]` → `[X.Y.Z] - DATE`
   - Create new empty `[Unreleased]` section
   - Update `package.json` version

## Query Interface

**Filter by type:**
```bash
sed -n '/### Features/,/### Bug Fixes/p' readme/CHANGELOG.md
```

**Recent entries (last 10):**
```bash
grep -A 2 "^- " readme/CHANGELOG.md | head -30
```

**Search by keyword:**
```bash
grep -i "redis" readme/CHANGELOG.md
```

**Entries for specific version:**
```bash
sed -n '/## \[2.11.0\]/,/## \[2.10.0\]/p' readme/CHANGELOG.md
```

## Best Practices

1. **Immediate logging**: Add entry immediately after completing work, not batched
2. **User perspective**: Describe impact from user/agent consumer viewpoint
3. **File references**: Include key files for context (not exhaustive list)
4. **Link issues**: Reference bug numbers or GitHub issues when applicable
5. **Migration notes**: Always include for breaking changes

## Anti-Patterns

❌ **Verbose commit messages**: "This commit implements a new feature that..."
❌ **Generic summaries**: "Fixed bugs", "Updated code", "Improvements"
❌ **Missing impact**: "Added function X" (Why does it matter?)
❌ **Duplicate entries**: Check existing changelog before adding
❌ **Version conflicts**: Don't manually edit version, use --version flag

## Example Entry Lifecycle

**Step 1: Agent completes feature**
```bash
add-changelog-entry.sh \
  --type "feature" \
  --summary "Multi-pattern confidence parsing" \
  --impact "100% extraction success, supports explicit/percentage/qualitative formats"
```

**Result in CHANGELOG.md:**
```markdown
## [Unreleased]

### Features
- Multi-pattern confidence parsing (2025-10-31)
  - Impact: 100% extraction success, supports explicit/percentage/qualitative formats
  - Files: `.claude/skills/cfn-agent-output-processing/parse-confidence.sh`
```

**Step 2: Release triggered**
```bash
# Manual or automated
npm version minor  # 2.11.0 → 2.12.0
```

**Result:**
```markdown
## [2.12.0] - 2025-11-01

### Features
- Multi-pattern confidence parsing (2025-10-31)
  - Impact: 100% extraction success, supports explicit/percentage/qualitative formats
  - Files: `.claude/skills/cfn-agent-output-processing/parse-confidence.sh`

---

## [Unreleased]

### Features

### Bug Fixes
...
```

## Success Metrics

- **Entry quality**: ≥90% of entries include measurable impact
- **Sparse language**: Average summary length ≤60 characters
- **Timeliness**: ≥80% of entries added within same sprint as implementation
- **Coverage**: 100% of features/breaking changes documented
- **Queryability**: Users can find relevant changes in <30 seconds

## References

- **Sparse Language**: readme/CLAUDE.md - Documentation Guidelines
- **Backlog Management**: `.claude/skills/cfn-backlog-management/SKILL.md`
- **Versioning**: `package.json` - Single source of truth
