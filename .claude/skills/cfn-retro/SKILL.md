---
name: cfn-retro
description: "Weekly retrospective from git history. Analyzes velocity, session patterns, file hotspots, commit types, and streaks. Use for understanding development patterns and improving workflow."
version: 1.0.0
tags: [retrospective, analytics, git, workflow]
status: production
---

# CFN Retro

**Purpose:** Analyze git history to surface development patterns, velocity trends, and improvement opportunities.

## Usage

Invoke as `/retro` or `/retro <window>` where window is: 7d (default), 24h, 14d, 30d

## Analysis Phases

### Phase 1: Data Collection
- `git log --format` for the specified window
- Parse commits by: author, timestamp, type (feat/fix/refactor/chore/docs/test), files changed, insertions/deletions

### Phase 2: Metrics
Output a metrics table:
- Total commits
- Lines changed (insertions + deletions)
- Test ratio (test commits / total commits)
- Feat/fix/refactor breakdown
- Files touched

### Phase 3: Session Analysis
Group commits by 45-minute gaps to identify work sessions:
- Deep work sessions (3+ commits, 1+ hour)
- Micro sessions (1-2 commits, quick fixes)
- Peak hours (when most commits happen)

### Phase 4: Hotspot Analysis
Most frequently changed files in the window. Files changed 5+ times are hotspots worth investigating for:
- Instability (frequent bug fixes)
- Active development (new feature work)
- Potential extraction (doing too many things)

### Phase 5: Streak Tracking
Count consecutive days with at least one commit. Surface current streak and longest streak in window.

### Phase 6: Commit Type Analysis
Categorize using conventional commit prefixes. Flag:
- High fix ratio (>40% of commits are fixes, may indicate instability)
- Low test ratio (<10% of commits touch tests, may indicate coverage gaps)
- Refactor clusters (3+ refactors in a row, good sign of paying down debt)

### Phase 7: Summary
Concrete, specific observations. No generic praise. Each observation anchored to actual data from the analysis.

Format: 3-5 bullet points, each citing specific numbers and file names.

## Output Format

```
## Retro: <project> (<window>)

### Metrics
| Metric | Value |
|--------|-------|
| Commits | N |
| Lines changed | +X / -Y |
| Test ratio | N% |
| Streak | N days |

### Sessions
- N deep work sessions, N micro sessions
- Peak hours: HH:00-HH:00

### Hotspots
1. path/to/file (N changes)
2. ...

### Commit Types
feat: N | fix: N | refactor: N | chore: N | test: N | docs: N

### Observations
- ...
```

## Integration
- No external dependencies. Uses only git log and bash.
- Results are ephemeral (displayed, not persisted) unless user asks to save.
