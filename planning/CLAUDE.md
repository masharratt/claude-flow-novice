# Planning Directory Structure Guide

## Purpose

This directory contains all planning artifacts, execution reports, and documentation for the Claude Flow Novice project. The structure mirrors the **CFN Loop execution model** with a hierarchical organization: **Phase > Sprint > Loop**.

---

## Directory Hierarchy

```
planning/
├── phases/                          # Phase-level execution (top-level organizational unit)
│   ├── PHASE_0_*.md                # Phase completion reports
│   ├── phase-*.md                  # Phase-specific summaries
│   └── sprints/                    # Sprint-level execution (mid-level organizational unit)
│       ├── SPRINT_*.{md,json}      # Sprint reports and summaries
│       └── loops/                  # Loop-level execution (atomic execution unit)
│           ├── loop2-validation/   # Loop 2 validator consensus artifacts
│           │   ├── LOOP2_*.json    # Validation reports
│           │   ├── PHASE_*_LOOP2_*.json  # Phase-specific Loop 2 results
│           │   └── SPRINT_*_LOOP2_*.json # Sprint-specific Loop 2 results
│           └── loop4-product-owner/ # Loop 4 GOAP product owner decisions
│               ├── loop4-*.md       # Product owner implementation & summaries
│               ├── PHASE_*_LOOP4_*.json  # Phase-specific Loop 4 decisions
│               └── SPRINT_*_LOOP4_*.json # Sprint-specific Loop 4 decisions
├── reports/                         # Cross-cutting operational reports
│   ├── completion/                  # Epic & consolidation completion reports
│   ├── validation/                  # CLI & coordination validation reports
│   ├── performance/                 # Metrics standardization & baseline tracking
│   └── security/                    # Security audits & Redis health reports
├── guides/                          # Implementation & operational guides
│   ├── REDIS_CLI_COORDINATION_GUIDE.md
│   ├── VALIDATOR_IMPLEMENTATION_GUIDE.md
│   ├── ROOT_DIRECTORY_CONSOLIDATION_PLAN.md
│   └── validator-agent-spawning-implementation.md
├── documentation/                   # Research, integration & reference docs
│   ├── UPSTREAM_INTEGRATION_*.md
│   ├── COMPREHENSIVE_MCP_ENDPOINTS_REFERENCE.md
│   ├── COORDINATOR_COMMUNICATION_REQUIREMENTS.md
│   └── claude-flow-research-*.{md,json}
├── cfn-loop/                        # CFN Loop flow diagrams & process docs
│   └── cfn-loop-flow-diagram.md
├── archive/                         # Outdated files for manual review before deletion
│   ├── *.backup-*                   # Backup files
│   └── CLAUDE_MD_OPTIMIZATION_ANALYSIS.md
└── [legacy-subdirs]/                # Historical subdirectories (see README.md)
```

---

## File Placement Rules

### When Creating New Files

1. **Phase-level artifacts** (e.g., `PHASE_N_COMPLETION_REPORT.md`)
   - Place directly in `/phases/`
   - Use naming: `PHASE_{number}_{description}.{md,json}`

2. **Sprint-level artifacts** (e.g., `SPRINT_N.M_SUMMARY.md`)
   - Place in `/phases/sprints/`
   - Use naming: `SPRINT_{number}.{iteration}_{description}.{md,json}`

3. **Loop 2 validation artifacts**
   - Place in `/phases/sprints/loops/loop2-validation/`
   - Use naming: `LOOP2_*.json` or `{PHASE|SPRINT}_*_LOOP2_*.json`

4. **Loop 4 product owner artifacts**
   - Place in `/phases/sprints/loops/loop4-product-owner/`
   - Use naming: `loop4-*.md` or `{PHASE|SPRINT}_*_LOOP4_*.json`

5. **Cross-phase reports** (completion, validation, performance, security)
   - Place in `/reports/{category}/`
   - Use naming: `{SCOPE}_{TYPE}_REPORT.json`

6. **Implementation guides**
   - Place in `/guides/`
   - Use naming: `{TOPIC}_GUIDE.md` or `{topic}-implementation.md`

7. **Research and documentation**
   - Place in `/documentation/`
   - Use naming: `{TOPIC}_{TYPE}.{md,json}`

8. **CFN Loop process documentation**
   - Place in `/cfn-loop/`
   - Use naming: `cfn-loop-{topic}.md`

---

## Navigation Patterns

### For CFN Loop Execution Tracking

Follow the hierarchy from top to bottom:

1. **Start:** `/cfn-loop/cfn-loop-flow-diagram.md` — understand the overall process
2. **Phase tracking:** `/phases/PHASE_N_*.md` — check phase completion status
3. **Sprint tracking:** `/phases/sprints/SPRINT_N.M_*.md` — check sprint execution
4. **Loop validation:** `/phases/sprints/loops/loop2-validation/` — review consensus results
5. **Product owner decisions:** `/phases/sprints/loops/loop4-product-owner/` — review GOAP decisions

### For Implementation Work

1. **Start:** `/guides/` — find relevant implementation guide
2. **Reference:** `/documentation/COMPREHENSIVE_MCP_ENDPOINTS_REFERENCE.md` — API reference
3. **Coordination:** `/guides/REDIS_CLI_COORDINATION_GUIDE.md` — Redis pub/sub patterns

### For Quality Assurance

1. **Validation:** `/reports/validation/` — check CLI and coordination validation
2. **Security:** `/reports/security/` — review security audits
3. **Performance:** `/reports/performance/` — check metrics and baselines
4. **Completion:** `/reports/completion/` — verify epic/consolidation completion

### For Research and Analysis

1. **Integration:** `/documentation/UPSTREAM_INTEGRATION_*.md` — upstream coordination
2. **Research:** `/documentation/claude-flow-research-*.{md,json}` — research findings
3. **Communication:** `/documentation/COORDINATOR_COMMUNICATION_REQUIREMENTS.md` — swarm patterns

---

## Maintenance Rules

### Archive Policy

**When to archive a file:**
- File is superseded by newer version
- File contains outdated analysis or recommendations
- File is a backup (`.backup-*` suffix)
- File is no longer referenced in active work

**Archive process:**
1. Move file to `/archive/` with original filename preserved
2. Add entry to archive manifest (future enhancement)
3. Review archive quarterly for permanent deletion candidates

**DO NOT archive:**
- Active phase/sprint/loop artifacts
- Current implementation guides
- Referenced research documentation
- Reports from last 3 months

### Cleanup Guidelines

**Delete immediately:**
- Duplicate files (after verification)
- Empty or placeholder files
- Test artifacts not in `/reports/`

**Move to archive first:**
- Completed phase/sprint artifacts (>6 months old)
- Superseded guides or documentation
- Backup files

**Never delete without review:**
- Loop 2 validation reports (consensus data)
- Loop 4 product owner decisions (GOAP analysis)
- Security audit reports
- Performance baseline data

---

## Integration with CFN Loop

This directory structure directly supports CFN Loop execution:

### Loop 0: Epic/Sprint Orchestration
- Read: `/cfn-loop/cfn-loop-flow-diagram.md`
- Write: `/phases/PHASE_N_*.md` (new phase reports)

### Loop 1: Phase Execution
- Read: `/phases/PHASE_{N-1}_*.md` (previous phase context)
- Write: `/phases/sprints/SPRINT_N.M_*.md` (sprint progress)

### Loop 2: Consensus Validation
- Read: `/phases/sprints/loops/loop2-validation/` (previous validations)
- Write: `/phases/sprints/loops/loop2-validation/{PHASE|SPRINT}_*_LOOP2_*.json`

### Loop 3: Primary Swarm Implementation
- Read: `/guides/` (implementation patterns)
- Write: `/phases/sprints/SPRINT_N.M_CONFIDENCE_REPORT.json`

### Loop 4: Product Owner Decision Gate
- Read: All loop artifacts for context
- Write: `/phases/sprints/loops/loop4-product-owner/{PHASE|SPRINT}_*_LOOP4_*.json`

### Post-Loop Reporting
- Write completion: `/reports/completion/`
- Write validation: `/reports/validation/`
- Write performance: `/reports/performance/`
- Write security: `/reports/security/`

---

## Claude Code Instructions

### When Reading Planning Artifacts

**ALWAYS** follow the hierarchy using Read or Glob tools:
```bash
# Phase context - use Glob to find files
Glob: pattern="PHASE_N_*.md" path="planning/phases"
# Then read specific file
Read: file_path="planning/phases/PHASE_7_COMPLETION_REPORT.md"

# Sprint context (within phase)
Glob: pattern="SPRINT_N.M_*.md" path="planning/phases/sprints"
Read: file_path="planning/phases/sprints/SPRINT_7.3_SUMMARY.md"

# Loop validation (within sprint)
Glob: pattern="SPRINT_N.M_LOOP2_*.json" path="planning/phases/sprints/loops/loop2-validation"
Read: file_path="planning/phases/sprints/loops/loop2-validation/SPRINT_7.3_LOOP2_VALIDATION.json"

# Product owner decisions (within sprint)
Glob: pattern="SPRINT_N.M_LOOP4_*.json" path="planning/phases/sprints/loops/loop4-product-owner"
Read: file_path="planning/phases/sprints/loops/loop4-product-owner/SPRINT_7.3_LOOP4_DECISION.json"
```

### When Writing New Artifacts

**ALWAYS** place files in the correct hierarchy level using Write tool:
```bash
# Phase completion
Write: file_path="planning/phases/PHASE_7_COMPLETION_REPORT.md" content="$REPORT"

# Sprint summary
Write: file_path="planning/phases/sprints/SPRINT_7.3_SUMMARY.md" content="$SUMMARY"

# Loop 2 validation
Write: file_path="planning/phases/sprints/loops/loop2-validation/SPRINT_7.3_LOOP2_VALIDATION.json" content="$VALIDATION"

# Loop 4 decision
Write: file_path="planning/phases/sprints/loops/loop4-product-owner/SPRINT_7.3_LOOP4_DECISION.json" content="$DECISION"

# Cross-cutting report
Write: file_path="planning/reports/performance/SPRINT_7.3_PERFORMANCE_REPORT.json" content="$REPORT"
```

### When Searching for Context

**Use hierarchy-aware search with Glob or Grep tools:**
```bash
# Find all artifacts for Phase 7
Glob: pattern="PHASE_7_*" path="planning/phases"
Glob: pattern="phase-7-*" path="planning/phases"

# Find all artifacts for Sprint 7.3
Glob: pattern="SPRINT_7.3_*" path="planning/phases/sprints"

# Find all Loop 2 validations for current phase
Glob: pattern="PHASE_7_*" path="planning/phases/sprints/loops/loop2-validation"
Glob: pattern="SPRINT_7.*_*" path="planning/phases/sprints/loops/loop2-validation"

# Find all product owner decisions for current sprint
Glob: pattern="SPRINT_7.*_*" path="planning/phases/sprints/loops/loop4-product-owner"

# Search file contents for specific text
Grep: pattern="confidence.*0.9" path="planning/phases/sprints/loops" output_mode="files_with_matches"
```

---

## Anti-Patterns (DO NOT DO THIS)

❌ **Placing loop artifacts at phase level**
```
# WRONG - file in wrong location
planning/phases/LOOP2_VALIDATION.json
```

✅ **Correct: Place in loop hierarchy**
```
# CORRECT - file in proper hierarchy
planning/phases/sprints/loops/loop2-validation/PHASE_7_LOOP2_VALIDATION.json
```

❌ **Mixing phase/sprint/loop artifacts in same directory**
```
# WRONG - no hierarchy
planning/mixed/PHASE_7_REPORT.md
planning/mixed/SPRINT_7.1_SUMMARY.md
planning/mixed/LOOP2_VALIDATION.json
```

✅ **Correct: Maintain hierarchy**
```
# CORRECT - proper hierarchy
planning/phases/PHASE_7_REPORT.md
planning/phases/sprints/SPRINT_7.1_SUMMARY.md
planning/phases/sprints/loops/loop2-validation/LOOP2_VALIDATION.json
```

❌ **Using blocked commands (find, cat, echo)**
```bash
# WRONG - find command is blocked
find planning/phases -name "PHASE_7_*"

# WRONG - cat for reading files
cat planning/phases/PHASE_7_REPORT.md

# WRONG - echo for writing files
echo "$REPORT" > planning/phases/PHASE_7_REPORT.md
```

✅ **Correct: Use Claude Code tools**
```bash
# CORRECT - use Glob for finding files
Glob: pattern="PHASE_7_*" path="planning/phases"

# CORRECT - use Read for reading files
Read: file_path="planning/phases/PHASE_7_REPORT.md"

# CORRECT - use Write for creating files
Write: file_path="planning/phases/PHASE_7_REPORT.md" content="$REPORT"

# CORRECT - use Edit for modifying files
Edit: file_path="planning/phases/PHASE_7_REPORT.md" old_string="..." new_string="..."
```

❌ **Creating flat archive structure**
```
# WRONG - no hierarchy in archive
planning/archive/old-everything-mixed-together/
```

✅ **Correct: Preserve original hierarchy in archive**
```
# CORRECT - maintain hierarchy in archive
planning/archive/phases/PHASE_0_OLD.md
planning/archive/sprints/SPRINT_1.0_OLD.md
```

---

## Version History

- **2025-10-11**: Initial CLAUDE.md created with Phase > Sprint > Loop hierarchy
- Structure supports CFN Loop execution model with clear file placement rules
- Archive policy defined for long-term maintenance
