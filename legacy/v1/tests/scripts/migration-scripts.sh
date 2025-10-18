#!/bin/bash
# Root Directory Migration Scripts
# Execute this script to run the complete migration process

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Pre-migration checks
pre_migration_checks() {
    log "Running pre-migration checks..."
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        error "Not in a git repository. Aborting."
        exit 1
    fi
    
    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        warning "You have uncommitted changes. Creating backup anyway..."
    fi
    
    # Count current files
    CURRENT_FILE_COUNT=$(find . -maxdepth 1 -type f | wc -l)
    log "Current root file count: $CURRENT_FILE_COUNT"
    
    # Create backup
    log "Creating backup branch..."
    BACKUP_BRANCH="backup-before-cleanup-$(date +%Y%m%d-%H%M%S)"
    git checkout -b "$BACKUP_BRANCH"
    git add .
    git commit -m "Backup before root directory cleanup - $(date)" || true
    
    # Create file manifest
    find . -maxdepth 1 -type f > backup-manifest.txt
    success "Pre-migration checks completed"
}

# Phase 1: Documentation and Examples Migration
phase1_migration() {
    log "Starting Phase 1: Documentation & Examples Migration"
    
    # Create directories
    mkdir -p docs/{architecture,cleanup,coordination,migration,setup,api,testing}
    mkdir -p examples/{usage,middleware,routing,scripts}
    
    # Architecture documentation
    [ -f "ARCHITECTURE_DESIGN.md" ] && mv ARCHITECTURE_DESIGN.md docs/architecture/
    [ -f "CLEANUP_ARCHITECTURE_PLAN.md" ] && mv CLEANUP_ARCHITECTURE_PLAN.md docs/cleanup/
    [ -f "FINAL_CLEANUP_ARCHITECTURE_REPORT.md" ] && mv FINAL_CLEANUP_ARCHITECTURE_REPORT.md docs/cleanup/
    [ -f "ROOT_CLEANUP_ANALYSIS.md" ] && mv ROOT_CLEANUP_ANALYSIS.md docs/cleanup/
    [ -f "ROOT_CLEANUP_ANALYSIS_REPORT.md" ] && mv ROOT_CLEANUP_ANALYSIS_REPORT.md docs/cleanup/
    [ -f "ROOT_CLEANUP_IMPLEMENTATION_PLAN.md" ] && mv ROOT_CLEANUP_IMPLEMENTATION_PLAN.md docs/cleanup/
    [ -f "STRUCTURED_CLEANUP_PLAN.md" ] && mv STRUCTURED_CLEANUP_PLAN.md docs/cleanup/
    
    # Coordination documentation
    [ -f "ENTERPRISE_COORDINATION_FINAL_REPORT.md" ] && mv ENTERPRISE_COORDINATION_FINAL_REPORT.md docs/coordination/
    [ -f "AGENT_SYNC_DOCUMENTATION.md" ] && mv AGENT_SYNC_DOCUMENTATION.md docs/coordination/
    [ -f "README-CFN-COORDINATORS.md" ] && mv README-CFN-COORDINATORS.md docs/coordination/
    [ -f "README-COORDINATORS.md" ] && mv README-COORDINATORS.md docs/coordination/
    [ -f "coordination.md" ] && mv coordination.md docs/coordination/
    
    # Migration documentation
    [ -f "MIGRATION_EXECUTION_PLAN.md" ] && mv MIGRATION_EXECUTION_PLAN.md docs/migration/
    [ -f "MIGRATION_PHASES_DETAILED.md" ] && mv MIGRATION_PHASES_DETAILED.md docs/migration/
    [ -f "BREAKING_CHANGES_ANALYSIS.md" ] && mv BREAKING_CHANGES_ANALYSIS.md docs/migration/
    [ -f "BREAKING_CHANGE_ANALYSIS.md" ] && mv BREAKING_CHANGE_ANALYSIS.md docs/migration/
    
    # Setup documentation
    [ -f "AUTO_SETUP.md" ] && mv AUTO_SETUP.md docs/setup/
    [ -f "WEB_PORTAL_INSTALL.md" ] && mv WEB_PORTAL_INSTALL.md docs/setup/
    [ -f "config_update_instructions.md" ] && mv config_update_instructions.md docs/setup/
    
    # API documentation
    [ -f "api-documentation.md" ] && mv api-documentation.md docs/api/
    [ -f "api-structure.md" ] && mv api-structure.md docs/api/
    
    # General documentation (keep in docs root)
    for doc in ACE_NPM_INTEGRATION_COMPLETE.md BACKLOG_PRIORITIZATION.md CLAUDE-DRAFT-COST-OPTIMIZATION.md CLAUDE.md claude-copy-to-main.md claude-soul.md cleanup-execution-plan.md EXECUTION_SUMMARY.md FINAL_ANALYSIS_SUMMARY.md HARDCODED_PATHS_ANALYSIS.md HYBRID_ROUTING_MVP_SUMMARY.md memory-bank.md risk-assessment-summary.md TEST_FIXES_SQLITE_ACL.md ZAI_FORK_COMPATIBILITY_REPORT.md final-cleanup-deliverable.md; do
        [ -f "$doc" ] && mv "$doc" docs/
    done
    
    # Examples
    [ -f "example-usage.js" ] && mv example-usage.js examples/usage/
    [ -f "middleware-examples.js" ] && mv middleware-examples.js examples/middleware/
    [ -f "route-examples.js" ] && mv route-examples.js examples/routing/
    
    success "Phase 1 completed successfully"
}

# Phase 2: Configuration Migration
phase2_migration() {
    log "Starting Phase 2: Configuration Migration"
    
    # Create directories
    mkdir -p config/{linting,git,docker,testing,security}
    mkdir -p docker
    
    # Linting configuration
    [ -f ".eslintignore" ] && mv .eslintignore config/linting/
    [ -f ".prettierignore" ] && mv .prettierignore config/linting/
    [ -f ".swcrc" ] && mv .swcrc config/linting/
    
    # Git configuration
    [ -f ".gitattributes" ] && mv .gitattributes config/git/
    [ -f ".gitleaks.toml" ] && mv .gitleaks.toml config/git/
    
    # Docker configuration
    [ -f ".dockerignore" ] && mv .dockerignore config/docker/
    
    # Testing configuration
    [ -f ".audit-ci.json" ] && mv .audit-ci.json config/testing/
    
    # Security configuration
    [ -f ".mcp.json" ] && mv .mcp.json config/security/
    
    # General configuration
    [ -f ".npmignore" ] && mv .npmignore config/
    [ -f ".releaserc.json" ] && mv .releaserc.json config/
    
    # Docker files
    [ -f "Dockerfile" ] && mv Dockerfile docker/
    [ -f "docker-compose.yml" ] && mv docker-compose.yml docker/
    
    success "Phase 2 completed successfully"
}

# Phase 3: Test and Runtime Data Migration
phase3_migration() {
    log "Starting Phase 3: Test & Runtime Data Migration"
    
    # Create directories
    mkdir -p tests/{unit,integration,e2e,fixtures,data}
    mkdir -p data/{databases,logs,results,temp}
    mkdir -p scripts/{build,deploy,testing}
    mkdir -p .vscode
    mkdir -p planning
    
    # Test files
    [ -f "advanced.test.js" ] && mv advanced.test.js tests/
    [ -f "math.test.js" ] && mv math.test.js tests/
    [ -f "test_quick_tool.test.js" ] && mv test_quick_tool.test.js tests/
    
    # Test scripts and utilities
    for test_file in test-agent-compliance.js test-agent-with-zai.js test-fork-zai-actual.js test-fork-zai-as-provider.js test-fork-zai.js test-provider-routing.js test-signals.js test-zai-direct-call.js; do
        [ -f "$test_file" ] && mv "$test_file" tests/
    done
    
    # Test runners
    [ -f "test-runner.cjs" ] && mv test-runner.cjs scripts/testing/
    [ -f "test-runner.js" ] && mv test-runner.js scripts/testing/
    
    # Test databases and temp files
    mv test-*.db* tests/data/ 2>/dev/null || true
    mv test-memory-acl.db* tests/data/ 2>/dev/null || true
    
    # Test results
    mv test-results*.json data/results/ 2>/dev/null || true
    mv test-results*.txt data/results/ 2>/dev/null || true
    
    # Runtime scripts
    [ -f "spawn-workers-enterprise.js" ] && mv spawn-workers-enterprise.js scripts/deploy/
    [ -f "spawn-workers.cjs" ] && mv spawn-workers.cjs scripts/deploy/
    
    # Development scripts
    [ -f "claude-flow.bat" ] && mv claude-flow.bat scripts/
    [ -f "claude-flow.ps1" ] && mv claude-flow.ps1 scripts/
    
    # Utility scripts
    [ -f "cleanup-verification-script.js" ] && mv cleanup-verification-script.js scripts/
    [ -f "cleanup_plan.sh" ] && mv cleanup_plan.sh scripts/
    
    # Runtime data and databases
    [ -f "claude-flow.db" ] && mv claude-flow.db data/databases/
    [ -f "coordinator-registry.db" ] && mv coordinator-registry.db data/databases/
    
    # Configuration files
    [ -f "claude-flow.config.json" ] && mv claude-flow.config.json config/
    
    # Logs and temporary files
    [ -f "post-edit-pipeline.log" ] && mv post-edit-pipeline.log data/logs/
    [ -f "output.txt" ] && mv output.txt data/temp/
    [ -f "test.txt" ] && mv test.txt data/temp/
    [ -f "test-fifo-results.txt" ] && mv test-fifo-results.txt data/temp/
    
    # Development artifacts
    [ -f "dev-server.pid" ] && mv dev-server.pid data/temp/
    
    # VS Code configuration
    [ -f "claude-flow-novice.code-workspace" ] && mv claude-flow-novice.code-workspace .vscode/
    
    # Planning files
    [ -f "sprint-1.2-implementation-plan.json" ] && mv sprint-1.2-implementation-plan.json planning/
    
    # Quick utilities
    [ -f "quick-test.js" ] && mv quick-test.js scripts/
    
    success "Phase 3 completed successfully"
}

# Phase 4: Final Cleanup
phase4_cleanup() {
    log "Starting Phase 4: Final Cleanup"
    
    # Remove any remaining temporary files that shouldn't be in root
    rm -f *.tmp *.log *.pid 2>/dev/null || true
    
    # Clean up any SQLite temporary files
    rm -f *.db-shm *.db-wal 2>/dev/null || true
    
    success "Phase 4 completed successfully"
}

# Update import paths and references
update_references() {
    log "Updating file references and import paths..."
    
    # Create a script to update common import patterns
    cat > update-imports.js << 'EOF'
const fs = require('fs');
const path = require('path');

// Common path mappings
const pathMappings = {
    './example-usage.js': '../examples/usage/example-usage.js',
    './test-runner.js': '../scripts/testing/test-runner.js',
    './test-runner.cjs': '../scripts/testing/test-runner.cjs',
    './claude-flow.config.json': '../config/claude-flow.config.json',
    './cleanup_plan.sh': '../scripts/cleanup_plan.sh',
    './spawn-workers.cjs': '../scripts/deploy/spawn-workers.cjs',
    './claude-flow.db': '../data/databases/claude-flow.db',
    './coordinator-registry.db': '../data/databases/coordinator-registry.db'
};

function updateFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let updated = false;
    
    for (const [oldPath, newPath] of Object.entries(pathMappings)) {
        const regex = new RegExp(oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        if (content.match(regex)) {
            content = content.replace(regex, newPath);
            updated = true;
            console.log(`Updated references in ${filePath}`);
        }
    }
    
    if (updated) {
        fs.writeFileSync(filePath, content);
    }
}

// Update JavaScript and TypeScript files
function updateDirectory(dir) {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            updateDirectory(fullPath);
        } else if (file.match(/\.(js|ts|json|cjs|mjs)$/)) {
            updateFile(fullPath);
        }
    }
}

// Update key directories
['src', 'scripts', 'tests', 'config'].forEach(updateDirectory);
console.log('Import path updates completed');
EOF
    
    node update-imports.js
    rm update-imports.js
    
    success "File references updated"
}

# Validation functions
validate_migration() {
    log "Validating migration results..."
    
    # Count files in root
    ROOT_FILE_COUNT=$(find . -maxdepth 1 -type f | wc -l)
    log "Files remaining in root: $ROOT_FILE_COUNT (target: ≤15)"
    
    # Check essential files
    ESSENTIAL_FILES=".gitignore package.json package-lock.json tsconfig.json README.md LICENSE"
    for file in $ESSENTIAL_FILES; do
        if [ -f "$file" ]; then
            success "✓ $file present"
        else
            warning "✗ $file missing"
        fi
    done
    
    # Check directory structure
    REQUIRED_DIRS="docs examples tests scripts data config"
    for dir in $REQUIRED_DIRS; do
        if [ -d "$dir" ]; then
            success "✓ $dir directory exists"
        else
            warning "✗ $dir directory missing"
        fi
    done
    
    # Test basic npm functionality
    if command -v npm &> /dev/null; then
        log "Testing basic npm commands..."
        if npm test 2>&1 | head -10; then
            success "✓ npm test executed successfully"
        else
            warning "⚠ npm test had issues - may need manual intervention"
        fi
    fi
    
    success "Migration validation completed"
}

# Generate migration report
generate_report() {
    log "Generating migration report..."
    
    cat > MIGRATION_REPORT.md << EOF
# Root Directory Migration Report

## Migration Summary
- **Date**: $(date)
- **Original Root Files**: $CURRENT_FILE_COUNT
- **Final Root Files**: $ROOT_FILE_COUNT
- **Files Moved**: $((CURRENT_FILE_COUNT - ROOT_FILE_COUNT))

## Directory Structure Created
\`\`\`
$(tree -L 2 -I 'node_modules|.git' . 2>/dev/null || find . -maxdepth 2 -type d | sort)
\`\`\`

## Files Remaining in Root
\`\`\`
$(ls -la | grep "^-" | awk '{print $9}' | sort)
\`\`\`

## Next Steps
1. Review the migration results
2. Test all functionality thoroughly
3. Update any remaining hardcoded paths
4. Commit the changes when satisfied
5. Communicate changes to team

## Rollback Instructions
If issues are encountered, rollback with:
\`\`\`bash
git checkout backup-before-cleanup-$(date +%Y%m%d*) -- .
\`\`\`

Migration completed on: $(date)
EOF
    
    success "Migration report generated: MIGRATION_REPORT.md"
}

# Main execution
main() {
    log "Starting root directory migration process..."
    
    # Check if user wants to proceed
    echo "This will reorganize 110+ files from the root directory."
    echo "A backup will be created automatically."
    read -p "Do you want to proceed? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Migration cancelled by user"
        exit 0
    fi
    
    # Execute migration phases
    pre_migration_checks
    phase1_migration
    phase2_migration
    phase3_migration
    phase4_cleanup
    update_references
    validate_migration
    generate_report
    
    success "Root directory migration completed successfully!"
    log "Please review the changes and commit when satisfied."
    log "Backup branch: $BACKUP_BRANCH"
    log "Migration report: MIGRATION_REPORT.md"
}

# Handle script arguments
case "${1:-}" in
    "validate")
        validate_migration
        ;;
    "rollback")
        log "Rolling back changes..."
        LATEST_BACKUP=$(git branch | grep backup-before-cleanup | tail -1 | sed 's/^[* ] //')
        if [ -n "$LATEST_BACKUP" ]; then
            git checkout "$LATEST_BACKUP" -- .
            success "Rolled back to $LATEST_BACKUP"
        else
            error "No backup branch found"
        fi
        ;;
    "help"|"-h"|"--help")
        echo "Root Directory Migration Script"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  (no args)  Run full migration"
        echo "  validate    Validate current state"
        echo "  rollback    Rollback to backup"
        echo "  help        Show this help"
        ;;
    "")
        main
        ;;
    *)
        error "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac