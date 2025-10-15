# Detailed Migration Phases Implementation

## Phase 1: Documentation Migration (Risk: Low)

### Files to Move (23 files)

#### Analysis & Reports (12 files)
```bash
# Move to docs/reports/
ROOT_CLEANUP_ANALYSIS.md → docs/reports/ROOT_CLEANUP_ANALYSIS.md
ROOT_CLEANUP_ANALYSIS_REPORT.md → docs/reports/ROOT_CLEANUP_ANALYSIS_REPORT.md
BACKLOG_PRIORITIZATION.md → docs/reports/BACKLOG_PRIORITIZATION.md
BREAKING_CHANGE_ANALYSIS.md → docs/reports/BREAKING_CHANGE_ANALYSIS.md
EXECUTION_SUMMARY.md → docs/reports/EXECUTION_SUMMARY.md
FINAL_ANALYSIS_SUMMARY.md → docs/reports/FINAL_ANALYSIS_SUMMARY.md
MIGRATION_EXECUTION_PLAN.md → docs/reports/MIGRATION_EXECUTION_PLAN.md
risk-assessment-summary.md → docs/reports/risk-assessment-summary.md
root-cleanup-analysis.md → docs/reports/root-cleanup-analysis.md
final-cleanup-deliverable.md → docs/reports/final-cleanup-deliverable.md
cleanup-execution-plan.md → docs/reports/cleanup-execution-plan.md
config_update_instructions.md → docs/reports/config_update_instructions.md
```

#### Technical Documentation (8 files)
```bash
# Move to docs/architecture/
CLAUDE-DRAFT-COST-OPTIMIZATION.md → docs/architecture/CLAUDE-DRAFT-COST-OPTIMIZATION.md
ENTERPRISE_COORDINATION_FINAL_REPORT.md → docs/architecture/ENTERPRISE_COORDINATION_FINAL_REPORT.md
HYBRID_ROUTING_MVP_SUMMARY.md → docs/architecture/HYBRID_ROUTING_MVP_SUMMARY.md
ZAI_FORK_COMPATIBILITY_REPORT.md → docs/architecture/ZAI_FORK_COMPATIBILITY_REPORT.md
TEST_FIXES_SQLITE_ACL.md → docs/architecture/TEST_FIXES_SQLITE_ACL.md
ACE_NPM_INTEGRATION_COMPLETE.md → docs/architecture/ACE_NPM_INTEGRATION_COMPLETE.md
AGENT_SYNC_DOCUMENTATION.md → docs/architecture/AGENT_SYNC_DOCUMENTATION.md
AUTO_SETUP.md → docs/architecture/AUTO_SETUP.md
```

#### Guides & Instructions (3 files)
```bash
# Move to docs/guides/
WEB_PORTAL_INSTALL.md → docs/guides/WEB_PORTAL_INSTALL.md
README-COORDINATORS.md → docs/guides/README-COORDINATORS.md
README-CFN-COORDINATORS.md → docs/guides/README-CFN-COORDINATORS.md
```

### Validation Steps
1. Verify all files moved successfully
2. Check for any internal documentation links
3. Update any hardcoded references
4. Run link checker if available

---

## Phase 2: Test File Migration (Risk: Medium)

### Files to Move (18 files)

#### Test Files (3 files)
```bash
# Move to tests/unit/
advanced.test.js → tests/unit/advanced.test.js
math.test.js → tests/unit/math.test.js
test_quick_tool.test.js → tests/unit/test_quick_tool.test.js
```

#### Test Scripts & Utilities (8 files)
```bash
# Move to scripts/testing/
test-agent-compliance.js → scripts/testing/test-agent-compliance.js
test-agent-with-zai.js → scripts/testing/test-agent-with-zai.js
test-fork-zai.js → scripts/testing/test-fork-zai.js
test-fork-zai-actual.js → scripts/testing/test-fork-zai-actual.js
test-fork-zai-as-provider.js → scripts/testing/test-fork-zai-as-provider.js
test-provider-routing.js → scripts/testing/test-provider-routing.js
test-zai-direct-call.js → scripts/testing/test-zai-direct-call.js
test-signals.js → scripts/testing/test-signals.js
```

#### Test Results & Data (7 files)
```bash
# Move to tests/results/
test-results.json → tests/results/test-results.json
test-results-final.json → tests/results/test-results-final.json
test-results-converted.json → tests/results/test-results-converted.json
test-results-sprint-2.2.json → tests/results/test-results-sprint-2.2.json
test-fifo-results.txt → tests/results/test-fifo-results.txt
test-debug.db-shm → tests/results/test-debug.db-shm
test-debug.db-wal → tests/results/test-debug.db-wal
```

### Required Code Updates

#### Package.json Script Updates
```json
{
  "scripts": {
    "test:agent-compliance": "node scripts/testing/test-agent-compliance.js",
    "test:fork-zai": "node scripts/testing/test-fork-zai.js",
    "test:provider-routing": "node scripts/testing/test-provider-routing.js"
  }
}
```

#### Import Path Updates
```javascript
// Update in files that import test utilities
import { testAgent } from './test-agent-compliance.js';
// Becomes:
import { testAgent } from './scripts/testing/test-agent-compliance.js';
```

### Validation Steps
1. Update all import statements
2. Modify package.json scripts
3. Run test suite to ensure no failures
4. Verify test result files are accessible

---

## Phase 3: Script Migration (Risk: Medium)

### Files to Move (12 files)

#### Worker Scripts (3 files)
```bash
# Move to scripts/utilities/
spawn-workers.cjs → scripts/utilities/spawn-workers.cjs
spawn-workers-enterprise.js → scripts/utilities/spawn-workers-enterprise.js
coordinator-runner.cjs → scripts/deployment/coordinator-runner.cjs
```

#### Validation Scripts (2 files)
```bash
# Move to scripts/testing/
validate-cfn-section4.mjs → scripts/testing/validate-cfn-section4.mjs
test-runner.cjs → scripts/testing/test-runner.cjs
```

#### Utility Scripts (4 files)
```bash
# Move to scripts/utilities/
example-usage.js → scripts/utilities/example-usage.js
quick-test.js → scripts/utilities/quick-test.js
middleware-examples.js → scripts/utilities/middleware-examples.js
route-examples.js → scripts/utilities/route-examples.js
```

#### Cleanup Scripts (3 files)
```bash
# Move to scripts/migration/
cleanup_plan.sh → scripts/migration/cleanup_plan.sh
cleanup-verification-script.js → scripts/migration/cleanup-verification-script.js
root-cleanup-analysis.md → scripts/migration/root-cleanup-analysis.md
```

### Required Code Updates

#### Package.json Script Updates
```json
{
  "scripts": {
    "spawn:workers": "node scripts/utilities/spawn-workers.cjs",
    "spawn:enterprise": "node scripts/utilities/spawn-workers-enterprise.js",
    "validate:cfn": "node scripts/testing/validate-cfn-section4.mjs",
    "test:runner": "node scripts/testing/test-runner.cjs"
  }
}
```

#### Import Path Updates
```javascript
// Update in files that import these scripts
import { spawnWorkers } from './spawn-workers.cjs';
// Becomes:
import { spawnWorkers } from './scripts/utilities/spawn-workers.cjs';
```

### Validation Steps
1. Update all script references
2. Modify executable permissions if needed
3. Test each script individually
4. Verify package.json scripts work correctly

---

## Phase 4: Configuration Migration (Risk: Low)

### Files to Move (6 files)

#### Environment Templates (3 files)
```bash
# Move to config/templates/
.env.keys → config/templates/.env.keys
.env.secure.template → config/templates/.env.secure.template
claude-flow.config.json → config/development/claude-flow.config.json
```

#### Build Configuration (2 files)
```bash
# Move to config/build/
package-scripts.json → config/build/package-scripts.json
tsconfig.base.json → config/build/tsconfig.base.json
```

#### CI/CD Configuration (1 file)
```bash
# Move to config/ci/
.releaserc.json → config/ci/.releaserc.json
```

### Required Code Updates

#### Configuration Loading Updates
```javascript
// Update in files that load these configs
const config = loadConfig('./claude-flow.config.json');
// Becomes:
const config = loadConfig('./config/development/claude-flow.config.json');
```

#### Environment Setup Updates
```bash
# Update documentation or setup scripts
cp .env.secure.template .env
# Becomes:
cp config/templates/.env.secure.template .env
```

### Validation Steps
1. Update configuration loading code
2. Test application startup
3. Verify environment variable loading
4. Check build process functionality

---

## Phase 5: Database Migration (Risk: High)

### Files to Move (7 files)

#### Production Databases (1 file)
```bash
# Move to database/production/
coordinator-registry.db → database/production/coordinator-registry.db
```

#### Development Databases (3 files)
```bash
# Move to database/development/
claude-flow.db → database/development/claude-flow.db
test-memory-acl.db → database/development/test-memory-acl.db
test-memory-acl.db-shm → database/development/test-memory-acl.db-shm
test-memory-acl.db-wal → database/development/test-memory-acl.db-wal
```

#### Symlink Handling (3 files)
```bash
# Handle existing symlinks carefully
swarm-memory.db → database/production/swarm-memory.db (update symlink target)
swarm-memory.db-shm → database/production/swarm-memory.db-shm (update symlink target)
swarm-memory.db-wal → database/production/swarm-memory.db-wal (update symlink target)
```

### Required Code Updates

#### Database Connection Updates
```javascript
// Update in all database connection code
const db = new SQLite('./coordinator-registry.db');
// Becomes:
const db = new SQLite('./database/production/coordinator-registry.db');

const devDb = new SQLite('./claude-flow.db');
// Becomes:
const devDb = new SQLite('./database/development/claude-flow.db');
```

#### Environment-Specific Database Paths
```javascript
// Add environment detection
const getDatabasePath = (filename, env = 'development') => {
  return `./database/${env}/${filename}`;
};

const db = new SQLite(getDatabasePath('coordinator-registry.db', 'production'));
```

### Validation Steps
1. **CRITICAL**: Backup all databases before migration
2. Update all database connection strings
3. Test application database connectivity
4. Verify data integrity after migration
5. Test symlink functionality
6. Run comprehensive database tests

---

## Phase 6: Temporary File Migration (Risk: Low)

### Files to Move (15 files)

#### Log Files (5 files)
```bash
# Move to temp/logs/
post-edit-pipeline.log → temp/logs/post-edit-pipeline.log
dev-server.pid → temp/logs/dev-server.pid
output.txt → temp/logs/output.txt
test.txt → temp/logs/test.txt
# Any other log files found
```

#### Cache & Runtime Files (4 files)
```bash
# Move to temp/cache/
test-memory-acl.db-shm → temp/cache/test-memory-acl.db-shm
test-memory-acl.db-wal → temp/cache/test-memory-acl.db-wal
test-debug.db-shm → temp/cache/test-debug.db-shm
test-debug.db-wal → temp/cache/test-debug.db-wal
```

#### Build Artifacts (3 files)
```bash
# Move to temp/build/
# Any build output files
```

#### Runtime Temporary Files (3 files)
```bash
# Move to temp/runtime/
.QuickTest → temp/runtime/.QuickTest
# Any other runtime temp files
```

### Validation Steps
1. Clear any active processes using these files
2. Move files safely
3. Update any hardcoded temp file paths
4. Verify application can create new temp files

---

## Migration Script Implementation

### Automated Migration Script Structure
```bash
#!/bin/bash
# migration-script.sh

set -e  # Exit on any error

# Backup function
backup_project() {
    echo "Creating backup..."
    tar -czf "backup-$(date +%Y%m%d-%H%M%S).tar.gz" .
}

# Phase execution function
execute_phase() {
    local phase_name=$1
    local phase_script=$2
    
    echo "Executing Phase: $phase_name"
    bash "$phase_script"
    
    # Run validation
    if bash "validate-$phase_name.sh"; then
        echo "✅ Phase $phase_name completed successfully"
    else
        echo "❌ Phase $phase_name validation failed"
        echo "Rolling back..."
        rollback_phase "$phase_name"
        exit 1
    fi
}

# Main execution
main() {
    backup_project
    
    execute_phase "documentation" "phase1-documentation.sh"
    execute_phase "tests" "phase2-tests.sh"
    execute_phase "scripts" "phase3-scripts.sh"
    execute_phase "config" "phase4-config.sh"
    execute_phase "database" "phase5-database.sh"
    execute_phase "temp" "phase6-temp.sh"
    
    echo "🎉 All phases completed successfully!"
}

main "$@"
```

### Validation Script Template
```bash
#!/bin/bash
# validate-phase.sh

validate_documentation_phase() {
    # Check all files moved
    # Check for broken links
    # Validate file integrity
}

validate_tests_phase() {
    # Run test suite
    # Check import resolution
    # Validate test results
}

# Add validation functions for each phase
```

This detailed phase-by-phase plan ensures systematic migration with proper validation and rollback capabilities for each phase.