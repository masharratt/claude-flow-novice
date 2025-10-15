# Root Directory Cleanup Analysis - Backend API Developer

## Current State Analysis
- **Total Files**: 89 files (not counting directories)
- **Git Status**: Multiple deleted planning files (already cleaned)
- **Project Type**: quick-test utility (per package.json)

## File Categorization

### ESSENTIAL ROOT FILES (KEEP)
- **package.json** - Core project definition
- **package-lock.json** - Dependency lock file  
- **README.md** - Project documentation
- **CLAUDE.md** - Project-specific documentation
- **LICENSE** - Legal requirements
- **.gitignore** - Git ignore rules (MUST stay in root)
- **tsconfig.json** - TypeScript configuration (MUST stay in root)
- **vitest.config.ts** - Test configuration (MUST stay in root)
- **docker-compose.yml** - Docker configuration (MUST stay in root)

### Config Files (.* dotfiles) - MOVE TO config/
- .QuickTest, .audit-ci.json, .dockerignore, .env, .env.keys, .env.secure.template
- .eslintignore, .gitattributes, .gitleaks.toml, .mcp.json
- .npmignore, .prettierignore, .releaserc.json, .swcrc
- tsconfig.base.json, jest.config.cjs, turbo.json, codecov.yml
- claude-flow.config.json

### Documentation Files (*.md) - MOVE TO docs/
- ACE_NPM_INTEGRATION_COMPLETE.md
- AGENT_SYNC_DOCUMENTATION.md
- AUTO_SETUP.md
- BACKLOG_PRIORITIZATION.md
- CLAUDE-DRAFT-COST-OPTIMIZATION.md
- ENTERPRISE_COORDINATION_FINAL_REPORT.md
- HYBRID_ROUTING_MVP_SUMMARY.md
- README-CFN-COORDINATORS.md
- README-COORDINATORS.md
- TEST_FIXES_SQLITE_ACL.md
- WEB_PORTAL_INSTALL.md
- ZAI_FORK_COMPATIBILITY_REPORT.md
- api-documentation.md
- api-structure.md
- claude-copy-to-main.md
- claude-soul.md
- coordination.md
- memory-bank.md

### Test Files - MOVE TO tests/
- advanced.test.js
- math.test.js
- test_quick_tool.test.js
- test-runner.cjs
- test-runner.js
- test-signals.js
- test-agent-compliance.js
- test-agent-with-zai.js
- test-fork-zai-actual.js
- test-fork-zai-as-provider.js
- test-fork-zai.js
- test-provider-routing.js
- test-zai-direct-call.js

### Example/Script Files - MOVE TO examples/
- example-usage.js
- middleware-examples.js
- route-examples.js
- spawn-workers-enterprise.js
- spawn-workers.cjs
- coordinator-runner.cjs
- validate-cfn-section4.mjs

### Database Files - MOVE TO data/
- claude-flow.db
- coordinator-registry.db
- test-memory-acl.db
- test-memory-acl.db-shm
- test-memory-acl.db-wal
- test-debug.db-shm
- test-debug.db-wal

### Shell Scripts & Workspace - MOVE TO scripts/
- claude-flow.bat
- claude-flow.ps1
- claude-flow-novice.code-workspace

### Temporary/Output Files - MOVE TO temp/ OR DELETE
- output.txt
- test.txt
- post-edit-pipeline.log
- dev-server.pid
- test-fifo-results.txt
- test-results-converted.json
- test-results-final.json
- test-results-sprint-2.2.json
- test-results.json

### JSON Config/Data - MOVE TO config/
- package-scripts.json
- sprint-1.2-implementation-plan.json

### Special Cases
- **Dockerfile** - Keep in root (standard practice)
- **quick-test.js** - Keep in root (main entry point per package.json)

## Risk Assessment

### HIGH RISK MOVES (Require careful testing)
- **tsconfig.json** - May break TypeScript compilation if referenced by absolute path
- **vitest.config.ts** - May break test runner if expecting root location
- **Environment files (.env.*)** - May break application startup if not found

### MEDIUM RISK MOVES
- **Test files** - May break test scripts if they expect root location
- **Database files** - May break application if hardcoded paths used

### LOW RISK MOVES
- **Documentation files** - Safe to move
- **Example files** - Safe to move
- **Temporary files** - Safe to move or delete

## Proposed Directory Structure
```
claude-flow-novice/
├── package.json
├── package-lock.json
├── README.md
├── CLAUDE.md
├── LICENSE
├── .gitignore
├── tsconfig.json
├── vitest.config.ts
├── docker-compose.yml
├── Dockerfile
├── quick-test.js
├── config/
│   ├── .env
│   ├── .env.keys
│   ├── .env.secure.template
│   ├── jest.config.cjs
│   ├── turbo.json
│   └── ...
├── docs/
│   ├── ACE_NPM_INTEGRATION_COMPLETE.md
│   ├── AGENT_SYNC_DOCUMENTATION.md
│   └── ...
├── tests/
│   ├── advanced.test.js
│   ├── math.test.js
│   └── ...
├── examples/
│   ├── example-usage.js
│   ├── middleware-examples.js
│   └── ...
├── scripts/
│   ├── claude-flow.bat
│   ├── claude-flow.ps1
│   └── ...
├── data/
│   ├── claude-flow.db
│   ├── coordinator-registry.db
│   └── ...
└── temp/
    ├── output.txt
    ├── test-results.json
    └── ...
```

## Recommended Cleanup Order

### Phase 1: Safe Moves (Low Risk)
1. Create directory structure
2. Move documentation files to docs/
3. Move example files to examples/
4. Move temporary files to temp/ (or delete)
5. Move JSON config files to config/

### Phase 2: Medium Risk
1. Move test files to tests/
2. Update test scripts if needed
3. Move database files to data/
4. Move shell scripts to scripts/

### Phase 3: High Risk (Requires Testing)
1. Move config dotfiles to config/
2. Test application startup
3. Update any hardcoded paths
4. Verify all functionality works

## Git Impact Analysis
- **Files to move**: ~80 files
- **Files to keep**: 9 essential files
- **Risk**: Medium - mostly file moves, no code changes
- **Recommendation**: Commit current state before cleanup

## Backend API Developer Recommendations

### Security Considerations
- **Environment files** (.env.*) contain sensitive data - ensure proper permissions
- **Database files** may contain sensitive data - handle with care
- **API keys** in .env.keys should be secured

### API/Service Impact
- **Test files** moving may affect CI/CD pipelines
- **Configuration files** moving may require path updates
- **Database files** moving may break hardcoded connections

### Validation Steps
1. **Backup current state**
2. **Test application startup** after each phase
3. **Run test suite** to ensure functionality
4. **Check imports** for hardcoded paths
5. **Verify CI/CD** still works

## Files Requiring Import Path Updates
- Test files importing from root
- Scripts referencing config files
- Database connections with hardcoded paths
- Any relative imports from moved files

## Summary
- **Total files to move**: ~80
- **Essential files to keep**: 9
- **Risk level**: Medium (mostly file organization)
- **Estimated effort**: 2-3 hours with testing
- **Recommended approach**: Phased cleanup with testing after each phase