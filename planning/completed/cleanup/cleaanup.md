prehensive cleanup plan.

  Repository .md File Cleanup Plan

  Based on analysis from 10 parallel agents covering the entire     
  repository, here's a comprehensive cleanup plan for the
  markdown files:

  Executive Summary

  - Total .md files analyzed: ~4,000+ files across all
  directories
  - Estimated files for deletion: ~300-400
  - Estimated files for archiving: ~600-800
  - Estimated files to keep: ~2,500-3,000

  1. Immediate Actions (Critical Cleanup)

  Root Directory

  DELETE: 1 file
  - claude-copy.md - Exact duplicate of CLAUDE.md

  ARCHIVE: ~100 files
  - Move all SECURITY_*.md, LOOP2_*.md, CODE_REVIEW_*.md files      
  to archive/security-audits-2025-12/
  - Move all TRIGGER_DEV_*.md research files to
  archive/trigger-dev-research-2025-12/
  - Move phase-specific files to planning/phases/

  .claude Directory

  DELETE: ~100 files
  - /cfn-extras/ - 121 duplicate/extra files
  - Deprecated commands in /commands/deprecated/
  - Skills marked as deprecated with existing replacements

  ARCHIVE: ~300 files
  - /agents/agents-mdap-test/ - 83 test agent copies
  - /backups/ - 98 old backup files
  - Deprecated skills with potential reference value

  2. Major Consolidation Opportunities

  Documentation Consolidation

  readme/ Directory (38 → 8 files)
  Consolidate into:
  readme/
  ├── README.md
  ├── CLAUDE.md
  ├── CHANGELOG.md
  ├── BACKLOG.md
  ├── CLI_MODE_ARCHITECTURE.md
  ├── CFN_LOOP_CHEATSHEET.md
  ├── COMPONENT_NPM_STATUS.md
  ├── LESSONS_LEARNED.md
  └── archive/ (deprecated files)

  docs/ Directory
  - CONSOLIDATE: ~200-300 implementation summary files into
  phase-specific indexes
  - ARCHIVE: ~300-400 outdated research reports and resolved        
  bugs > 30 days old
  - KEEP: ~800-900 current documentation, active bugs, security     
  audits

  Skills Consolidation (.claude/skills/)

  - MERGE: Multiple similar validation skills into unified
  frameworks
  - DELETE: ~100 clearly redundant skills
  - ARCHIVE: Deprecated skills with potential reference value       

  3. Directory-Specific Actions

  /docker/

  KEEP:
  - CLAUDE.md (critical orchestration guide)
  - CI_CD_TEST_INTEGRATION.md
  - DOCKER_ACCESS_CONTROL.md
  - MCP_AGENT_INTEGRATION_COMPLETE.md
  - trigger-dev/ and trigger-dev-v4/ (active work)

  ARCHIVE:
  - TEST_INFRASTRUCTURE_README.md
  - PLAYWRIGHT_FIX_SUMMARY.md
  - All PHASE_*.md files (move to planning/completed/)

  DELETE:
  - PLAYWRIGHT_TEST_RESULTS.md
  - ENVIRONMENT_CONTRACT_ALIGNMENT_REPORT.md

  /tests/

  KEEP: ~95% of files (current test documentation)
  ARCHIVE: ~5% (completed sprint results, POC results)
  - /tests/cfn-v3/SPRINT_5_TEST_RESULTS.md
  - /tests/docker/docs/results/POC_*.md

  /planning/

  KEEP: Active planning files (~50)
  ARCHIVE:
  - legion/ (outdated marketplace planning)
  - global/marketing/ (move to docs/)
  - side-projects/ and kortix/ (non-core)
  - Old research analysis

  /lib/

  DELETE: Entire /lib/mdap/ directory
  - Standalone library that was never implemented
  - Implementation exists inline in docker/trigger-dev/src/lib/     

  4. Archive Structure Proposal

  Create the following archive structure:
  archive/
  ├── 2025-12-security-audits/
  ├── 2025-12-loop-validation/
  ├── 2025-12-code-reviews/
  ├── 2025-12-trigger-research/
  ├── deprecated-skills/
  ├── test-results/
  └── planning-completed/

  5. Implementation Phases

  Phase 1: Critical Cleanup (Day 1)

  1. Delete obvious duplicates
    - claude-copy.md
    - /lib/mdap/ directory
    - /cfn-extras/ directory
  2. Archive completed work
    - Move /planning/completed/ content to /archive/
    - Archive security audit reports
    - Archive test results from completed sprints

  Phase 2: Consolidation (Day 2-3)

  1. Consolidate readme/ directory
  2. Merge duplicate documentation in docs/
  3. Consolidate skills in .claude/skills/

  Phase 3: Organization (Day 4)

  1. Create archive structure
  2. Update references in remaining files
  3. Add documentation index for archived content

  6. Expected Impact

  Before Cleanup:
  - ~4,000+ .md files scattered across directories
  - Significant duplication and outdated content
  - Difficult navigation and maintenance

  After Cleanup:
  - ~2,500-3,000 focused .md files
  - Clear organization by status (active/archive)
  - Improved discoverability and reduced maintenance overhead       

  7. Risk Mitigation

  1. Backup Before Deletion: Create git tag
  pre-md-cleanup-2025-12-07
  2. Reference Check: Search for references before deletion
  3. Gradual Approach: Implement in phases with validation
  4. Archive First: Move to archive before deletion

  8. Success Metrics

  - Reduce .md file count by 30-40%
  - Eliminate all obvious duplicates
  - Clear separation between active and archived content
  - No broken references in remaining files

● The analysis is complete. This plan provides a structured
  approach to cleaning up the repository's .md files while
  preserving valuable documentation and historical context. The     
  three-phase implementation allows for careful execution with      
  minimal risk to active operations.