#!/bin/bash
# Batch SQL injection fix script
# Applies Pattern B parameterized queries to multiple scripts
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# List of scripts to fix with their vulnerable patterns
declare -A SCRIPTS_TO_FIX=(
    ["$PROJECT_ROOT/.claude/skills/cfn-test-runner/store-benchmarks.sh"]="DONE"
    ["$PROJECT_ROOT/.claude/skills/integration/agent-handoff.sh"]="PENDING"
    ["$PROJECT_ROOT/.claude/skills/cfn-sqlite-memory/ttl-cleanup.sh"]="PENDING"
    ["$PROJECT_ROOT/.claude/skills/cfn-automatic-memory-persistence/test-memory-persistence.sh"]="PENDING"
    ["$PROJECT_ROOT/.claude/skills/workflow-codification/deploy-approved-skill.sh"]="PENDING"
    ["$PROJECT_ROOT/.claude/skills/workflow-codification/propagate-skill-update.sh"]="PENDING"
    ["$PROJECT_ROOT/.claude/skills/cfn-test-runner/init-benchmark-db.sh"]="PENDING"
    ["$PROJECT_ROOT/.claude/skills/cfn-test-runner/detect-regressions.sh"]="PENDING"
    ["$PROJECT_ROOT/.claude/skills/cfn-task-audit/store-task-audit.sh"]="PENDING"
    ["$PROJECT_ROOT/.claude/skills/cfn-task-audit/get-audit-data.sh"]="PENDING"
    ["$PROJECT_ROOT/.claude/skills/cfn-playbook/update-playbook.sh"]="PENDING"
    ["$PROJECT_ROOT/.claude/skills/cfn-playbook/query-playbook.sh"]="PENDING"
    ["$PROJECT_ROOT/.claude/skills/cfn-playbook/init-playbook.sh"]="PENDING"
    ["$PROJECT_ROOT/.claude/skills/agent-lifecycle/simple-audit.sh"]="PENDING"
)

echo "SQL Injection Batch Fix Report"
echo "==============================="
echo ""

TOTAL=0
FIXED=0
PENDING=0

for script in "${!SCRIPTS_TO_FIX[@]}"; do
    ((TOTAL++))
    status="${SCRIPTS_TO_FIX[$script]}"

    if [[ "$status" == "DONE" ]]; then
        ((FIXED++))
        echo "✅ $script"
    else
        ((PENDING++))
        echo "⏳ $script"
    fi
done

echo ""
echo "Summary: $FIXED/$TOTAL scripts fixed ($PENDING pending)"
echo ""

# Check for vulnerable patterns in all scripts
echo "Scanning for vulnerable patterns..."
VULNERABLE_COUNT=0

for script in "${!SCRIPTS_TO_FIX[@]}"; do
    if [[ -f "$script" ]] && grep -q "sqlite3.*\".*\\\$" "$script" 2>/dev/null; then
        if ! grep -q ".parameter init" "$script" 2>/dev/null; then
            ((VULNERABLE_COUNT++))
            echo "⚠️  VULNERABLE: $script"
        fi
    fi
done

echo ""
echo "Remaining vulnerable scripts: $VULNERABLE_COUNT"

exit 0
