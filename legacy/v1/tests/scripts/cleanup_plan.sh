#!/bin/bash

# Root Directory Cleanup Execution Plan
# Claude-Flow-Novice Project
# WARNING: This script makes destructive changes. Use with caution.

set -e  # Exit on any error

echo "🧹 Claude-Flow-Novice Root Directory Cleanup"
echo "=============================================="
echo "⚠️  WARNING: This will move 80+ files from root to subdirectories"
echo "⚠️  Make sure you have a backup and are in a git branch"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Error: Not in a git repository"
    exit 1
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Current branch: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo "❌ Error: Cannot run cleanup on main/master branch"
    echo "Please create a feature branch first:"
    echo "  git checkout -b feature/root-cleanup"
    exit 1
fi

echo ""
read -p "Continue with cleanup? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cleanup cancelled."
    exit 1
fi

# Create directory structure
echo ""
echo "📁 Creating directory structure..."
mkdir -p config docs tests examples scripts data temp workspace

# Phase 1: Safe Moves (Low Risk)
echo ""
echo "🔵 Phase 1: Moving low-risk files (documentation, temp, data)..."

# Documentation files
echo "  📄 Moving documentation files..."
DOC_FILES=(
    "ACE_NPM_INTEGRATION_COMPLETE.md"
    "AGENT_SYNC_DOCUMENTATION.md"
    "AUTO_SETUP.md"
    "BACKLOG_PRIORITIZATION.md"
    "CLAUDE-DRAFT-COST-OPTIMIZATION.md"
    "ENTERPRISE_COORDINATION_FINAL_REPORT.md"
    "HYBRID_ROUTING_MVP_SUMMARY.md"
    "README-CFN-COORDINATORS.md"
    "README-COORDINATORS.md"
    "TEST_FIXES_SQLITE_ACL.md"
    "WEB_PORTAL_INSTALL.md"
    "ZAI_FORK_COMPATIBILITY_REPORT.md"
    "api-documentation.md"
    "api-structure.md"
    "claude-copy-to-main.md"
    "claude-soul.md"
    "coordination.md"
    "memory-bank.md"
)

for file in "${DOC_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "    Moving $file → docs/"
        git mv "$file" "docs/"
    fi
done

# Temporary files
echo "  🗂️  Moving temporary files..."
TEMP_FILES=(
    "output.txt"
    "test.txt"
    "post-edit-pipeline.log"
    "dev-server.pid"
    "test-fifo-results.txt"
    "test-results-converted.json"
    "test-results-final.json"
    "test-results-sprint-2.2.json"
    "test-results.json"
)

for file in "${TEMP_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "    Moving $file → temp/"
        git mv "$file" "temp/"
    fi
done

# JSON data files
echo "  📊 Moving JSON data files..."
if [ -f "package-scripts.json" ]; then
    echo "    Moving package-scripts.json → data/"
    git mv "package-scripts.json" "data/"
fi

if [ -f "sprint-1.2-implementation-plan.json" ]; then
    echo "    Moving sprint-1.2-implementation-plan.json → data/"
    git mv "sprint-1.2-implementation-plan.json" "data/"
fi

# Workspace file
if [ -f "claude-flow-novice.code-workspace" ]; then
    echo "    Moving claude-flow-novice.code-workspace → workspace/"
    git mv "claude-flow-novice.code-workspace" "workspace/"
fi

# Phase 2: Config Files (Medium Risk)
echo ""
echo "🟡 Phase 2: Moving configuration files..."
echo "  ⚠️  This may require updating build tool configurations"

CONFIG_FILES=(
    ".audit-ci.json"
    ".dockerignore"
    ".eslintignore"
    ".gitattributes"
    ".gitleaks.toml"
    ".mcp.json"
    ".npmignore"
    ".prettierignore"
    ".QuickTest"
    ".releaserc.json"
    ".swcrc"
    "tsconfig.base.json"
    "turbo.json"
    "codecov.yml"
    "claude-flow.config.json"
    "jest.config.cjs"
)

for file in "${CONFIG_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "    Moving $file → config/"
        git mv "$file" "config/"
    fi
done

# Environment files (special handling - copy first, then move)
echo "  🔐 Handling environment files..."
ENV_FILES=(
    ".env"
    ".env.keys"
    ".env.secure.template"
)

for file in "${ENV_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "    Moving $file → config/"
        git mv "$file" "config/"
    fi
done

# Phase 3: Example Files (Medium Risk)
echo ""
echo "🟠 Phase 3: Moving example and script files..."

EXAMPLE_FILES=(
    "example-usage.js"
    "middleware-examples.js"
    "route-examples.js"
)

for file in "${EXAMPLE_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "    Moving $file → examples/"
        git mv "$file" "examples/"
    fi
done

# Script files
SCRIPT_FILES=(
    "spawn-workers-enterprise.js"
    "spawn-workers.cjs"
    "coordinator-runner.cjs"
    "validate-cfn-section4.mjs"
    "claude-flow.bat"
    "claude-flow.ps1"
)

for file in "${SCRIPT_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "    Moving $file → scripts/"
        git mv "$file" "scripts/"
    fi
done

# Phase 4: Database Files (High Risk)
echo ""
echo "🔴 Phase 4: Moving database files (HIGH RISK)..."
echo "  ⚠️  This may break hardcoded database connections"

DATABASE_FILES=(
    "claude-flow.db"
    "coordinator-registry.db"
    "test-memory-acl.db"
    "test-memory-acl.db-shm"
    "test-memory-acl.db-wal"
    "test-debug.db-shm"
    "test-debug.db-wal"
)

for file in "${DATABASE_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "    Moving $file → data/"
        git mv "$file" "data/"
    fi
done

# Phase 5: Test Files (High Risk - SPECIAL HANDLING)
echo ""
echo "🔴 Phase 5: Moving test files (HIGH RISK)..."
echo "  ⚠️  quick-test.js is the package.json main entry point"

# Check if quick-test.js is referenced in package.json
if grep -q "quick-test.js" package.json; then
    echo "  ⚠️  WARNING: quick-test.js is referenced in package.json"
    echo "  📝 This requires updating package.json main and scripts fields"
    
    # Create a note about this
    echo "IMPORTANT: Update package.json to reference tests/quick-test.js" > temp/PACKAGE_JSON_UPDATE_NOTE.txt
fi

TEST_FILES=(
    "advanced.test.js"
    "math.test.js"
    "test_quick_tool.test.js"
    "test-runner.js"
    "test-runner.cjs"
    "test-signals.js"
    "test-agent-compliance.js"
    "test-agent-with-zai.js"
    "test-fork-zai-actual.js"
    "test-fork-zai-as-provider.js"
    "test-fork-zai.js"
    "test-provider-routing.js"
    "test-zai-direct-call.js"
)

for file in "${TEST_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "    Moving $file → tests/"
        git mv "$file" "tests/"
    fi
done

# Special handling for quick-test.js
if [ -f "quick-test.js" ]; then
    echo "  🚨 SPECIAL CASE: quick-test.js (package.json main entry)"
    echo "  Options:"
    echo "    1. Keep quick-test.js in root (recommended)"
    echo "    2. Move to tests/ and update package.json"
    
    read -p "Move quick-test.js to tests/? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "    Moving quick-test.js → tests/"
        git mv "quick-test.js" "tests/"
        echo "    ⚠️  Remember to update package.json main field!"
    else
        echo "    Keeping quick-test.js in root (recommended)"
    fi
fi

echo ""
echo "✅ File moves completed!"
echo ""
echo "📋 Next Steps:"
echo "1. Review the changes: git status"
echo "2. Test the build: npm run build (if available)"
echo "3. Run tests: npm test"
echo "4. Update any configuration files that reference old paths"
echo "5. Commit changes: git commit -m 'feat: reorganize root directory structure'"
echo ""
echo "🔧 Required Updates:"
echo "- package.json (if quick-test.js was moved)"
echo "- tsconfig.json (may reference specific paths)"
echo "- vitest.config.ts (may reference test file locations)"
echo "- jest.config.cjs (now in config/ directory)"
echo "- Any hardcoded file paths in source code"
echo ""
echo "📁 Files remaining in root:"
echo "  - package.json"
echo "  - package-lock.json"
echo "  - README.md"
echo "  - CLAUDE.md"
echo "  - LICENSE"
echo "  - .gitignore"
echo "  - tsconfig.json"
echo "  - vitest.config.ts"
echo "  - docker-compose.yml"
echo "  - Dockerfile"
echo "  - quick-test.js (if kept)"
echo ""
echo "🎉 Cleanup script completed successfully!"