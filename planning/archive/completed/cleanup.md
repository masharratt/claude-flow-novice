🚀 Repository Cleanup Plan: 20 Phases

  PROGRESS STATUS: 3/20 Phases Completed (15%)

  Critical Issues Identified:

  - ✅ 871 files in benchmark directory (conflicts resolved)
  - ✅ Test duplicates and obsolete files (RESOLVED)
  - 49 loose files in root directory
  - 65+ scripts with duplicates and build artifacts
  - ✅ Conflicting claude-flow initialization in benchmark/ (RESOLVED)
  - 934MB node_modules + 13MB dist with build artifacts

  COMPLETED WORK:
  - Phase 1: Benchmark claude-flow conflicts eliminated
  - Phase 2: Repository baseline documented, emergency backup secured
  - Phase 3: Test duplicates removed, cleanup analysis documented
  - Total files removed: ~325 (conflicts + test duplicates)
  - Space recovered: ~1.2MB (ongoing cleanup)

  ---
  Phase 1-5: Critical Conflicts & Safety

  Phase 1: Remove Benchmark Claude-Flow Conflicts ✅ COMPLETED

  Swarm: code-analyzer + system-architect (approved)
  ✅ Removed benchmark/.claude/ and benchmark/.claude-flow/
  ✅ Removed benchmark/.github/ (conflicts with main)
  ✅ Backed up unique configurations to backups/phase1-benchmark-conflicts/
  Status: Successfully eliminated claude-flow initialization conflicts

  Phase 2: Git Safety & Backup ✅ COMPLETED

  Swarm: reviewer + code-analyzer (approved)
  ✅ Emergency backup created for critical files
  ✅ Documented current state metrics (7,397 files, ~1.0GB total)
  ✅ Created comprehensive baseline reports in docs/
  Note: Repository corruption detected during Phase 2 analysis - emergency protocols activated

  Phase 3: Remove Test Duplicates ✅ COMPLETED

  Swarm: tester + code-analyzer (approved)
  ✅ Removed root test.utils.ts (485 lines, unused duplicate)
  ✅ Removed 12 compiled test files from dist/ directory
  ✅ Removed 15+ obsolete benchmark test files and archives
  ✅ Removed demo testing reports and old test outputs
  Status: Successfully eliminated 25+ test duplicates, maintained test coverage

  Phase 4: Clean Build Artifacts (approved)

  Swarm: cicd-engineer + perf-analyzer
  - Clean dist/ directory of old builds
  - Remove temporary .cache files
  - Remove build logs and reports

  Phase 5: Remove Workspace Files (conditionally approved)

  Swarm: system-architect
  - Delete .code-workspace files (IDE-specific) (denied)
  - Remove temporary shell scripts in root (approved)
  - Clean up VS Code artifacts (denied)

  ---
  Phase 6-10: Configuration Organization

  Phase 6: Create Config Structure  (approved)

  Swarm: system-architect + code-analyzer
  mkdir -p config/{typescript,jest,linting,build,apps}

  Phase 7: Move Core Configurations  (approved)

  Swarm: cicd-engineer + reviewer
  - Move .eslintrc.json → config/linting/
  - Move .prettierrc.json → config/linting/
  - Move babel.config.cjs → config/build/
  - Update package.json references

  Phase 8: Migrate TypeScript Configs  (approved)

  Swarm: backend-dev + code-analyzer
  - Move all tsconfig.*.json → config/typescript/
  - Update import paths in build scripts
  - Test compilation still works

  Phase 9: Consolidate Jest Configuration  (approved)

  Swarm: tester + system-architect
  - Move jest.config.js → config/jest/
  - Move jest.setup.* → config/jest/
  - Update test discovery paths

  Phase 10: App-Specific Configs (Denied)

  Swarm: system-architect
  - Move claude-flow.config.json → config/apps/
  - Move web-portal.config.json → config/apps/
  - Move .mcp.json → config/apps/ (or keep in root)

  ---
  Phase 11-15: Scripts & Documentation

  Phase 11: Identify Script Duplicates

  Swarm: code-analyzer + perf-analyzer  (approved)
  - Audit 65+ scripts for duplicates and relevancy
  - Remove redundant TypeScript fixers (6+ similar scripts)
  - Consolidate performance monitoring scripts (4+ similar)

  Phase 12: Organize Build Scripts  (approved)

  Swarm: cicd-engineer + backend-dev
  - Move build-consolidated.js → scripts/build/
  - Move byzantine-verification.js → scripts/security/
  - Move server.js → scripts/dev/server.js

  Phase 13: Clean Script Categories  (approved)

  Swarm: system-architect + reviewer
  - Create scripts/{build,test,dev,security,migration}/
  - Categorize all scripts into logical groups
  - Remove scripts not used in last 6 months

  Phase 14: Documentation Organization  (approved)

  Swarm: api-docs + system-architect
  - Move PHASE*.md → docs/implementation/
  - Move technical reports → docs/reports/
  - Keep core docs in root (README, CLAUDE, CONTRIBUTING)

  Phase 15: Reports & Metrics Cleanup (conditionally approved)

  Swarm: performance-benchmarker + code-analyzer
  - Move JSON reports → reports/  (approved)
  - Clean up .claude-flow/metrics/ (3 files have modifications) (denied)
  - Archive old performance data  (approved)

  ---
  Phase 16-20: Benchmark & Final Cleanup

  Phase 16: Benchmark Restructure  (approved)

  Swarm: performance-benchmarker + system-architect
  - Keep core benchmark engine (100-150 files)
  - Remove 7 root markdown files (move to benchmark/docs/)
  - Remove duplicate Python requirements files

  Phase 17: Archive Historical Data  (approved)

  Swarm: code-analyzer + reviewer
  - Compress benchmark/archive/ (200+ old files)
  - Remove redundant test results
  - Keep only last 2 weeks of data

  Phase 18: Dependencies Cleanup  (approved with lots of testing)

  Swarm: cicd-engineer + security-manager
  - Audit package.json dependencies (remove unused)
  - Clean node_modules cache
  - Update lock files after removals

  Phase 19: Final Structure Validation  (approved)

  Swarm: system-architect + tester
  - Test all build commands work with new paths
  - Verify imports and references
  - Run test suite to ensure functionality

  Phase 20: Git Commit & PR  (approved)

  Swarm: pr-manager + reviewer
  - Stage all changes systematically
  - Create comprehensive commit message
  - Create PR with cleanup summary
  - Update documentation with new structure