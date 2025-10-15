# Root Directory Cleanup Execution Plan

## Current Status
✅ **Critical root files verified** - All 11 essential files present  
⚠️ **Directory structure ready** - 6/7 directories created (temp/ missing)  
⚠️ **Files not yet moved** - All 80+ files still in root  
⚠️ **Git has changes** - 41 deleted planning files need commit

## Phase 1: Safe Setup (Ready to Execute)

### Step 1: Create Missing temp/ Directory
```bash
mkdir -p temp
```

### Step 2: Commit Current Git State
```bash
git add .
git commit -m "Cleanup planning: Remove deleted planning files, prepare for root reorganization"
```

### Step 3: Move Documentation Files (Low Risk)
```bash
# Move all .md files except essential ones
mkdir -p docs
mv ACE_NPM_INTEGRATION_COMPLETE.md docs/
mv AGENT_SYNC_DOCUMENTATION.md docs/
mv AUTO_SETUP.md docs/
mv BACKLOG_PRIORITIZATION.md docs/
mv CLAUDE-DRAFT-COST-OPTIMIZATION.md docs/
mv ENTERPRISE_COORDINATION_FINAL_REPORT.md docs/
mv HYBRID_ROUTING_MVP_SUMMARY.md docs/
mv README-CFN-COORDINATORS.md docs/
mv README-COORDINATORS.md docs/
mv TEST_FIXES_SQLITE_ACL.md docs/
mv WEB_PORTAL_INSTALL.md docs/
mv ZAI_FORK_COMPATIBILITY_REPORT.md docs/
mv api-documentation.md docs/
mv api-structure.md docs/
mv claude-copy-to-main.md docs/
mv claude-soul.md docs/
mv coordination.md docs/
mv memory-bank.md docs/
```

### Step 4: Move Example Files (Low Risk)
```bash
mkdir -p examples
mv example-usage.js examples/
mv middleware-examples.js examples/
mv route-examples.js examples/
mv spawn-workers-enterprise.js examples/
mv spawn-workers.cjs examples/
mv coordinator-runner.cjs examples/
mv validate-cfn-section4.mjs examples/
```

### Step 5: Move Temporary/Output Files (Low Risk)
```bash
mkdir -p temp
mv output.txt temp/
mv test.txt temp/
mv post-edit-pipeline.log temp/
mv dev-server.pid temp/
mv test-fifo-results.txt temp/
mv test-results-converted.json temp/
mv test-results-final.json temp/
mv test-results-sprint-2.2.json temp/
mv test-results.json temp/
```

### Step 6: Move JSON Config Files (Low Risk)
```bash
mkdir -p config
mv package-scripts.json config/
mv sprint-1.2-implementation-plan.json config/
```

## Phase 2: Medium Risk Moves (Test After Each)

### Step 7: Move Test Files
```bash
mkdir -p tests
mv advanced.test.js tests/
mv math.test.js tests/
mv test_quick_tool.test.js tests/
mv test-runner.cjs tests/
mv test-runner.js tests/
mv test-signals.js tests/
mv test-agent-compliance.js tests/
mv test-agent-with-zai.js tests/
mv test-fork-zai-actual.js tests/
mv test-fork-zai-as-provider.js tests/
mv test-fork-zai.js tests/
mv test-provider-routing.js tests/
mv test-zai-direct-call.js tests/

# Test: npm test
```

### Step 8: Move Database Files
```bash
mkdir -p data
mv claude-flow.db data/
mv coordinator-registry.db data/
mv test-memory-acl.db data/
mv test-memory-acl.db-shm data/
mv test-memory-acl.db-wal data/
mv test-debug.db-shm data/
mv test-debug.db-wal data/

# Test: Application startup
```

### Step 9: Move Shell Scripts & Workspace
```bash
mkdir -p scripts
mv claude-flow.bat scripts/
mv claude-flow.ps1 scripts/
mv claude-flow-novice.code-workspace scripts/
```

## Phase 3: High Risk Config Moves (Careful Testing)

### Step 10: Move Config Dotfiles
```bash
mkdir -p config
mv .QuickTest config/
mv .audit-ci.json config/
mv .dockerignore config/
mv .env config/
mv .env.keys config/
mv .env.secure.template config/
mv .eslintignore config/
mv .gitattributes config/
mv .gitleaks.toml config/
mv .mcp.json config/
mv .npmignore config/
mv .prettierignore config/
mv .releaserc.json config/
mv .swcrc config/
mv tsconfig.base.json config/
mv jest.config.cjs config/
mv turbo.json config/
mv codecov.yml config/
mv claude-flow.config.json config/

# Test: npm test, application startup, CI/CD pipeline
```

## Validation Steps

### After Each Phase:
1. **Run verification script**: `node cleanup-verification-script.js`
2. **Test core functionality**: `npm test`
3. **Check imports**: Look for any broken file references
4. **Git status**: Review changes before commit

### Final Validation:
1. **Full test suite**: `npm test`
2. **Application startup**: Test main entry points
3. **Documentation verification**: Ensure links work
4. **CI/CD pipeline**: If applicable, test pipeline
5. **Code formatting**: Run linter/formatter

## Rollback Plan

If issues occur:
```bash
# Git reset to before cleanup
git log --oneline -5  # Find commit hash before cleanup
git reset --hard <commit-hash>

# Or manually move files back
mv docs/* .  # Move all docs back to root
mv examples/* .  # Move all examples back
# ... etc for other directories
```

## Risk Mitigation

### Backup Strategy
- **Git commit before each phase**
- **Manual backup of critical files**
- **Test in branch before main**

### Testing Strategy
- **Incremental testing** after each phase
- **Automated validation** using verification script
- **Manual testing** of critical functionality

### Import Path Updates Required
Monitor and update:
- **Test imports** referencing moved files
- **Config files** with hardcoded paths
- **Database connections** with file paths
- **Scripts** with relative imports

## Expected Outcome

After completion:
- **Root files**: 11 essential files only
- **Organized structure**: 7 directories with logical grouping
- **No broken functionality**: All tests passing
- **Clean git history**: Proper commits for each phase
- **Maintainable layout**: Easy to navigate and understand

## Time Estimate
- **Phase 1**: 30 minutes (safe moves)
- **Phase 2**: 45 minutes (medium risk, with testing)
- **Phase 3**: 60 minutes (high risk, careful testing)
- **Total**: ~2.5 hours including validation