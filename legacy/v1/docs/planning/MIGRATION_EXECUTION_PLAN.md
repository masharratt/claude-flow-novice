# Root Directory Cleanup - Migration Execution Plan
## Step-by-Step Implementation Guide

### Overview
This plan provides a detailed, step-by-step approach to safely reorganize 89 files from the root directory into a logical structure while maintaining all functionality.

### Prerequisites
- Git repository fully committed and clean
- All tests currently passing
- Backup branch created
- Sufficient time for complete execution (4-5 hours)
- Write access to create directories and move files

---

## Phase 0: Preparation (15 minutes)

### 0.1 Create Safety Backup
```bash
# Ensure working directory is clean
git status

# Create backup branch
git checkout -b backup-before-cleanup
git add .
git commit -m "Backup before root directory cleanup - $(date)"

# Return to working branch
git checkout main
git checkout -b root-cleanup-implementation
```

### 0.2 Verify Current State
```bash
# Count files in root
find . -maxdepth 1 -type f | wc -l

# Run tests to ensure baseline
npm test

# Check current functionality
node quick-test.js
```

### 0.3 Create Target Directories
```bash
mkdir -p docs config tests examples scripts data temp
```

---

## Phase 1: Safe Moves - Documentation (30 minutes)

### 1.1 Move Documentation Files
```bash
# Move all markdown files except essential ones
git mv ACE_NPM_INTEGRATION_COMPLETE.md docs/
git mv AGENT_SYNC_DOCUMENTATION.md docs/
git mv AUTO_SETUP.md docs/
git mv BACKLOG_PRIORITIZATION.md docs/
git mv CLAUDE-DRAFT-COST-OPTIMIZATION.md docs/
git mv ENTERPRISE_COORDINATION_FINAL_REPORT.md docs/
git mv HYBRID_ROUTING_MVP_SUMMARY.md docs/
git mv README-CFN-COORDINATORS.md docs/
git mv README-COORDINATORS.md docs/
git mv TEST_FIXES_SQLITE_ACL.md docs/
git mv WEB_PORTAL_INSTALL.md docs/
git mv ZAI_FORK_COMPATIBILITY_REPORT.md docs/
git mv api-documentation.md docs/
git mv api-structure.md docs/
git mv claude-copy-to-main.md docs/
git mv claude-soul.md docs/
git mv coordination.md docs/
git mv memory-bank.md docs/

# Commit documentation moves
git add docs/
git commit -m "Phase 1: Move 19 documentation files to docs/ directory"
```

### 1.2 Verify Phase 1
```bash
# Verify files moved
ls docs/ | wc -l  # Should show 19 files

# Check git status
git status

# Run quick test to ensure no impact
node quick-test.js
```

---

## Phase 2: Safe Moves - Temporary Files (15 minutes)

### 2.1 Delete Temporary Files
```bash
# Move to temp directory first (safer than delete)
git mv output.txt temp/
git mv test.txt temp/
git mv post-edit-pipeline.log temp/
git mv dev-server.pid temp/
git mv test-fifo-results.txt temp/
git mv test-results-converted.json temp/
git mv test-results-final.json temp/
git mv test-results-sprint-2.2.json temp/
git mv test-results.json temp/

# Commit temporary file moves
git add temp/
git commit -m "Phase 2: Move 9 temporary files to temp/ directory"
```

### 2.2 Verify Phase 2
```bash
# Verify temp directory
ls temp/

# Check root is cleaner
find . -maxdepth 1 -type f | wc -l
```

---

## Phase 3: Dependency Updates - Test Infrastructure (45 minutes)

### 3.1 Move Test Files (except quick-test.js for now)
```bash
# Move test files that don't have dependencies
git mv advanced.test.js tests/
git mv math.test.js tests/
git mv test_quick_tool.test.js tests/
git mv test-runner.js tests/
git mv test-runner.cjs tests/
git mv test-signals.js tests/
git mv test-agent-compliance.js tests/
git mv test-agent-with-zai.js tests/
git mv test-fork-zai-actual.js tests/
git mv test-fork-zai-as-provider.js tests/
git mv test-fork-zai.js tests/
git mv test-provider-routing.js tests/
git mv test-zai-direct-call.js tests/

# Commit test file moves
git add tests/
git commit -m "Phase 3.1: Move 14 test files to tests/ directory"
```

### 3.2 Update Test Dependencies
```bash
# Update import in advanced.test.js
sed -i "s|require('./quick-test')|require('./quick-test')|" tests/advanced.test.js

# Update import in example-usage.js (will be moved later)
sed -i "s|require('./quick-test')|require('./tests/quick-test')|" example-usage.js
```

### 3.3 Move Quick Test and Update Remaining References
```bash
# Move quick-test.js to tests/
git mv quick-test.js tests/

# Update advanced.test.js import
sed -i "s|require('./quick-test')|require('./quick-test')|" tests/advanced.test.js

# Commit quick-test move and updates
git add tests/
git commit -m "Phase 3.2: Move quick-test.js to tests/ and update imports"
```

### 3.4 Verify Phase 3
```bash
# Test that moved tests still work
cd tests/
node test-runner.js
cd ..

# Test quick-test from new location
node tests/quick-test.js

# Test advanced.test.js
node tests/advanced.test.js
```

---

## Phase 4: Database Migration (30 minutes)

### 4.1 Move Database Files
```bash
# Move database files to data/
git mv claude-flow.db data/
git mv coordinator-registry.db data/
git mv test-memory-acl.db data/
git mv test-memory-acl.db-shm data/
git mv test-memory-acl.db-wal data/
git mv test-debug.db-shm data/
git mv test-debug.db-wal data/

# Commit database moves
git add data/
git commit -m "Phase 4.1: Move 7 database files to data/ directory"
```

### 4.2 Update Database Path References
```bash
# Update coordinator-runner.cjs database path
sed -i "s|new sqlite('./coordinator-registry.db')|new sqlite('./data/coordinator-registry.db')|" coordinator-runner.cjs

# Commit database path updates
git add coordinator-runner.cjs
git commit -m "Phase 4.2: Update database path in coordinator-runner.cjs"
```

### 4.3 Verify Phase 4
```bash
# Test coordinator runner with new database path
node coordinator-runner.cjs --help

# Verify database files are accessible
ls -la data/
```

---

## Phase 5: Configuration Files (45 minutes)

### 5.1 Move Configuration Files
```bash
# Move dotfiles to config/
git mv .QuickTest config/
git mv .audit-ci.json config/
git mv .dockerignore config/
git mv .eslintignore config/
git mv .gitattributes config/
git mv .gitleaks.toml config/
git mv .mcp.json config/
git mv .npmignore config/
git mv .prettierignore config/
git mv .releaserc.json config/
git mv .swcrc config/
git mv codecov.yml config/
git mv jest.config.cjs config/
git mv turbo.json config/
git mv tsconfig.base.json config/
git mv claude-flow.config.json config/
git mv package-scripts.json config/
git mv sprint-1.2-implementation-plan.json config/

# Move environment files (handle with care)
git mv .env.keys config/
git mv .env.secure.template config/

# NOTE: .env file should be kept in root for now (may have runtime dependencies)

# Commit configuration moves
git add config/
git commit -m "Phase 5.1: Move 19 configuration files to config/ directory"
```

### 5.2 Update Configuration References
```bash
# Update jest.config.cjs path references (if needed)
# Most configs use <rootDir> which should still work

# Check if any scripts reference moved config files
grep -r "\./config/" . --exclude-dir=node_modules --exclude-dir=.git
```

### 5.3 Handle Special Environment Files
```bash
# Keep .env in root for now (many tools expect it here)
# Create a note in docs about environment configuration
echo "# Environment Configuration
The .env file must remain in the project root as it's referenced by various tools and runtime processes.
Environment templates and keys are stored in config/ for reference." > docs/environment-setup.md

git add docs/environment-setup.md
git commit -m "Phase 5.2: Add environment setup documentation"
```

### 5.4 Verify Phase 5
```bash
# Test that configuration files are still accessible
ls -la config/

# Check if any tools break with moved configs
npm test  # May fail due to jest.config.cjs move
```

---

## Phase 6: Scripts and Examples (30 minutes)

### 6.1 Move Example Files
```bash
# Move example files to examples/
git mv example-usage.js examples/
git mv middleware-examples.js examples/
git mv route-examples.js examples/

# Commit example moves
git add examples/
git commit -m "Phase 6.1: Move 3 example files to examples/ directory"
```

### 6.2 Move Script Files
```bash
# Move script files to scripts/
git mv claude-flow.bat scripts/
git mv claude-flow.ps1 scripts/
git mv spawn-workers-enterprise.js scripts/
git mv spawn-workers.cjs scripts/
git mv coordinator-runner.cjs scripts/
git mv validate-cfn-section4.mjs scripts/

# Move workspace file
git mv claude-flow-novice.code-workspace scripts/

# Commit script moves
git add scripts/
git commit -m "Phase 6.2: Move 7 script files to scripts/ directory"
```

### 6.3 Update Script Path References
```bash
# Scripts may need to be updated to reference files in new locations
# Check for hardcoded paths in moved scripts
grep -r "\./" scripts/ --exclude-dir=node_modules

# Update any relative paths found
# (This will need manual review based on grep results)
```

### 6.4 Verify Phase 6
```bash
# Test that examples work from new location
cd examples/
node example-usage.js
cd ..

# Test that scripts work from new location
cd scripts/
./claude-flow.bat  # May not work in Linux environment, but check syntax
node spawn-workers.cjs --help
cd ..
```

---

## Phase 7: Handle Special Files (30 minutes)

### 7.1 Handle Symlinks
```bash
# Check symlink targets
ls -la swarm-memory.db*

# Symlinks point to database/ directory - ensure that directory exists
if [ ! -d "database" ]; then
  mkdir -p database
  echo "Created database directory for symlinks"
fi

# Symlinks should remain in root as they're reference points
```

### 7.2 Handle Remaining Root Files
```bash
# Move any remaining non-essential files
# (Check what's left after previous phases)

# Keep essential files in root:
# - package.json, package-lock.json, README.md, CLAUDE.md, LICENSE
# - .gitignore, tsconfig.json, vitest.config.ts, docker-compose.yml
# - Dockerfile, .env, and the symlinks
```

### 7.3 Verify Final Structure
```bash
# Check final root file count
find . -maxdepth 1 -type f | wc -l

# Should have approximately 8-10 essential files left

# List root files
ls -la

# Verify directory structure
tree -L 2 -d
```

---

## Phase 8: Final Validation and Cleanup (60 minutes)

### 8.1 Comprehensive Testing
```bash
# Run all tests
npm test

# If tests fail due to moved jest.config.cjs, update package.json test script:
# "test": "node --experimental-vm-modules node_modules/vitest/vitest.mjs run --config config/vitest.config.ts"

# Test key functionality
node examples/example-usage.js
node scripts/coordinator-runner.cjs --help

# Test application startup (if applicable)
npm start
```

### 8.2 Update Documentation
```bash
# Update README.md with new directory structure
cat >> README.md << 'EOF'

## Project Structure

```
claude-flow-novice/
├── Essential Files (Root)
│   ├── package.json          # Node.js configuration
│   ├── README.md            # Project documentation
│   ├── CLAUDE.md            # Claude-specific documentation
│   └── ...                  # Other essential files
├── config/                  # Configuration files
├── docs/                    # Documentation
├── tests/                   # Test files
├── examples/                # Example code
├── scripts/                 # Utility scripts
├── data/                    # Database files
└── temp/                    # Temporary files
```
EOF

git add README.md
git commit -m "Phase 8.1: Update README.md with new project structure"
```

### 8.3 Git Cleanup
```bash
# Review all changes
git log --oneline

# Ensure clean working directory
git status

# Create final summary commit
git add .
git commit -m "Phase 8.2: Complete root directory cleanup - 89 files organized into logical directories"
```

### 8.4 Final Verification
```bash
# Final test run
npm test

# Check file organization
echo "Files in root: $(find . -maxdepth 1 -type f | wc -l)"
echo "Files in docs: $(find docs/ -type f | wc -l)"
echo "Files in config: $(find config/ -type f | wc -l)"
echo "Files in tests: $(find tests/ -type f | wc -l)"
echo "Files in examples: $(find examples/ -type f | wc -l)"
echo "Files in scripts: $(find scripts/ -type f | wc -l)"
echo "Files in data: $(find data/ -type f | wc -l)"
echo "Files in temp: $(find temp/ -type f | wc -l)"
```

---

## Rollback Plan

If critical issues occur:

### Immediate Rollback
```bash
# Return to backup
git checkout backup-before-cleanup

# Create rollback branch
git checkout -b rollback-needed

# Investigate issues
git checkout root-cleanup-implementation
```

### Partial Rollback
```bash
# Rollback specific phases using git revert
git revert HEAD~1  # Rollback last commit
# Continue as needed
```

---

## Success Criteria

### Quantitative Metrics
- [ ] Root directory reduced from 89 to ~10 files (89% reduction)
- [ ] All 81 moved files properly categorized
- [ ] Zero broken imports or path references
- [ ] All tests pass after migration
- [ ] Clean git history with descriptive commits

### Qualitative Metrics
- [ ] Improved project organization and maintainability
- [ ] Clear separation of concerns
- [ ] Easier navigation for new developers
- [ ] Better file discoverability
- [ ] Reduced cognitive load when viewing root directory

### Functional Metrics
- [ ] All scripts execute without errors
- [ ] All tests run successfully
- [ ] Application starts correctly
- [ ] Database connectivity maintained
- [ ] Configuration files load properly

---

## Post-Migration Recommendations

### Immediate Actions
1. **Update CI/CD pipelines** to reference new file locations
2. **Update deployment scripts** with new paths
3. **Communicate changes** to team members
4. **Update documentation** with new structure

### Long-term Maintenance
1. **Establish conventions** for new file placement
2. **Add linting rules** to prevent root clutter
3. **Schedule regular cleanup** reviews
4. **Maintain documentation** of project structure

---

**Migration Plan Complete**: Ready for execution with comprehensive safety measures
**Estimated Total Time**: 4.5-5 hours
**Risk Level**: Medium (mitigated by incremental approach and backups)