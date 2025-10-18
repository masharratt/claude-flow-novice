# File Categorization for Cleanup Phases

## Phase 1: Critical Console Statement Removal (HIGH PRIORITY)

### Files with Console Statements (1,483 occurrences across 52 files)

#### Root Level Files
- `/build-consolidated.js` (48 console statements)
- `/byzantine-verification.js` (28 console statements)

#### Examples Directory (High Console Usage)
- `/examples/yoga-integration-example.js` (30 statements)
- `/examples/fullstack-demo.ts` (82 statements)
- `/examples/validation/rust-quality-example.js` (78 statements)
- `/examples/validate-gossip.js` (67 statements)
- `/examples/cargo-build-validation-example.js` (148 statements)
- `/examples/shadcn-demo.ts` (83 statements)
- `/examples/chrome-mcp-demo.ts` (70 statements)
- `/examples/prompt-copier-demo.ts` (86 statements)

#### Benchmark Directory
- `/benchmark/archive/old-files/hello_world.js` (2 statements)
- `/benchmark/archive/old-files/test_hello_world.js` (5 statements)
- `/benchmark/archive/old-files/hello_world.test.js` (6 statements)

**Action Required:** Replace console.* calls with proper logging framework (Winston already available)

## Phase 2: Large File Refactoring (72 files >500 lines)

### Critical Files for Immediate Attention

#### Scripts Directory (Large Files)
- `/scripts/claude-sparc.sh` (25,129 bytes - very large shell script)
- `/scripts/coverage-report.ts` (24,406 bytes)
- `/scripts/claude-monitor.py` (16,353 bytes)
- `/scripts/check-links.ts` (7,599 bytes)
- `/scripts/build-monitor.js` (6,987 bytes)

#### Source Code Files (Estimated >500 lines)
**Note:** Exact line counts unavailable due to I/O errors, but these are candidates based on file sizes and complexity patterns detected:

- Core orchestration files in `/src/swarm/`
- CLI command files in `/src/cli/`
- Integration test files in `/src/testing/`
- MCP server implementations in `/src/mcp/`

**Action Required:** Break into smaller, focused modules following single responsibility principle

## Phase 3: Build System & Configuration Simplification

### Package.json Script Consolidation

#### Current: 98 npm scripts → Target: <20 essential scripts

**Essential Scripts to Keep:**
- `dev`, `build`, `test`, `clean`
- `typecheck`, `lint`, `format`
- `mcp:start`, `mcp:status`

**Scripts to Consolidate/Remove:**
- **Performance Scripts (12):** Merge into single performance command
- **Phase-specific Tests (16):** Consolidate into unified test suite
- **Multiple Build Variants (8):** Standardize on single build system
- **Debug Variants (6):** Reduce to essential debugging only

### Configuration File Audit

#### JSON Configuration Files (13 files in root)
- `package.json` - Keep (core)
- `package-lock.json` - Keep (core)
- `tsconfig.json` - Keep (standardize TypeScript config)
- `tsconfig.cli.json` - Evaluate if needed
- `tsconfig.cjs.json` - Evaluate if needed
- `jest.config.js` - Keep (standardize test config)
- `claude-flow.config.json` - Keep (core functionality)
- `web-portal.config.json` - Evaluate necessity
- `integration-test-remediation-report.json` - Archive or remove

**Action Required:** Reduce configuration complexity, standardize on minimal viable config set

## Phase 4: Documentation Organization

### Documentation Files (233 total)

#### Root Markdown Files (9) - High Priority
- `README.md` - Keep, update
- `CLAUDE.md` - Keep (project instructions)
- `CHANGELOG.md` - Keep
- `CONTRIBUTING.md` - Keep, consolidate
- `CONSOLIDATED_CLI_COMPLETE.md` - Evaluate for archival
- `PHASE2-CLI-WIZARD-IMPLEMENTATION.md` - Archive after completion
- `PHASE3-CRITICAL-FIX-SUMMARY.md` - Archive after completion
- `PHASE4_IMPLEMENTATION_REPORT.md` - Archive after completion
- `PHASE5_COMPLETION_REPORT.md` - Archive after completion

#### Documentation Directory Structure
- `/docs/` (171 files) - Reorganize by topic
- `/examples/` (53 documentation files) - Consolidate overlapping content

**Action Required:** Create unified documentation structure, archive phase-specific reports

## Phase 5: Script Directory Optimization (57 files in /scripts/)

### Script Categories for Cleanup

#### Build Scripts (15 files)
**Keep Essential:**
- `build-config.js`
- `build-migration.sh`

**Evaluate for Removal:**
- `build-with-filter.sh`
- `build-workaround.sh`
- `batch-fix-ts.sh`

#### Test Automation (12 files)
**Consolidate Into Unified Test Runner:**
- `performance-test-runner.js`
- `generate-swarm-tests.js`
- Various fix scripts

#### Validation Scripts (10 files)
**Keep Core Validation:**
- `validate-examples.ts`
- `check-performance-regression.ts`

**Archive Phase-Specific:**
- `validate-phase2.cjs`
- `validate-phase4.js`

#### Migration Tools (8 files)
**Evaluate Necessity Post-Migration:**
- `migration-examples.ts`
- `migrate-hooks.js`
- Various fix utilities

#### Cleanup Utilities (5 files)
**Keep Essential:**
- `cleanup-root.sh`

**Merge Similar:**
- Various fix and install scripts

**Action Required:** Reduce script count by 50-70%, consolidate similar functionality

## Phase 6: Source Code Quality (693 TypeScript/JavaScript files)

### TODO/FIXME Resolution (28 occurrences across 11 files)

#### High Priority Files with Technical Debt
- `/src/mcp/server.ts` (2 TODOs)
- `/src/swarm/direct-executor.ts` (3 TODOs)
- `/tests/enhanced-todo-detector.js` (9 TODOs)
- `/tests/fixed-todo-detector.js` (6 TODOs)
- `/scripts/validation-summary.ts` (2 TODOs)

**Action Required:** Address technical debt markers with proper implementation or documentation

### Directory Structure Simplification

#### Complex Nested Structures
- `/src/cli/consolidated/` - Flatten if possible
- `/src/cli/simple-commands/init/templates/` - Very deep nesting
- `/dist/src/` - Mirror source complexity

**Action Required:** Reduce nesting depth, improve module organization

## Phase 7: Example Code Consolidation (53 files)

### Example Categories

#### REST API Examples (Multiple Implementations)
- `/examples/rest-api-simple/`
- `/examples/05-swarm-apps/rest-api/`
- `/examples/05-swarm-apps/rest-api-advanced/`
- `/examples/blog-api/`
- `/examples/user-api/`

**Action Required:** Consolidate into single, comprehensive REST API example

#### Chat Application Examples (Duplicates)
- `/examples/chat-app/`
- `/examples/chat-app-2/`

**Action Required:** Merge into single, best-practice example

#### Hello World Variations
- `/examples/hello-world.js`
- `/examples/hello-time/`
- `/examples/hello2/`

**Action Required:** Keep single, comprehensive "getting started" example

## Phase 8: Dependency Optimization (985M node_modules)

### Dependency Audit Categories

#### Production Dependencies (30 packages)
**Core Dependencies (Keep):**
- `@tensorflow/tfjs-node`
- `express`, `socket.io`
- `chalk`, `commander`, `inquirer`
- `joi`, `zod` (validation)
- `winston` (logging)

**Evaluate for Removal:**
- `boxen` (UI formatting - may be optional)
- `table` (display formatting - may be optional)
- `p-queue`, `p-retry`, `p-timeout` (async utilities - evaluate usage)

#### Development Dependencies (38 packages)
**Essential Dev Dependencies (Keep):**
- TypeScript toolchain
- Jest testing framework
- ESLint, Prettier
- SWC compiler

**Evaluate for Removal:**
- Multiple testing frameworks (choose one)
- Duplicate TypeScript tools
- Unused type definitions

**Action Required:** Reduce dependency count by 20-30%, eliminate unused packages

## Cleanup Phase Timeline

### Week 1: Critical Issues
- [ ] Console statement removal (52 files)
- [ ] Package.json script consolidation (98 → 20 scripts)
- [ ] TypeScript compiler fix

### Week 2: Code Quality
- [ ] Large file refactoring (priority files)
- [ ] TODO/FIXME resolution (28 occurrences)
- [ ] Build system standardization

### Week 3: Organization
- [ ] Script directory optimization (57 → 20 scripts)
- [ ] Documentation reorganization (233 files)
- [ ] Example consolidation (remove duplicates)

### Week 4: Optimization
- [ ] Dependency audit and removal
- [ ] Dead code elimination
- [ ] Performance optimization
- [ ] Final validation and testing

## Success Criteria

### Quantitative Targets
- **Repository Size Reduction:** 150-250M (15-25%)
- **File Count Reduction:** 1,000+ files removed/consolidated
- **Script Consolidation:** 98 → <20 npm scripts
- **Console Statements:** 1,483 → 0 occurrences
- **Large Files:** 72 → <20 files >500 lines

### Qualitative Improvements
- Simplified developer onboarding
- Consistent tooling and configuration
- Improved code maintainability
- Enhanced development experience
- Stable, reliable build system

---

**Document Created:** September 26, 2025
**Phase 2 Status:** Baseline Documentation Complete
**Next Action:** Begin Phase 1 Critical Console Statement Removal