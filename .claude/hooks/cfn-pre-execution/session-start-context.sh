#!/bin/bash

# CFN Session Start Context Hook
# Automatically reads CLAUDE.md at session start to provide project context
#
# Purpose: Ensures Main Chat and agents have immediate access to project
#          guidelines, CFN Loop patterns, and coordination protocols
#
# Triggered: Automatically at session initialization
# Location: .claude/hooks/cfn-pre-execution/session-start-context.sh

set -euo pipefail

# === Configuration ===

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLAUDE_MD="${PROJECT_ROOT}/CLAUDE.md"
CFN_EXPERT="${PROJECT_ROOT}/.claude/agents/cfn-dev-team/cfn-system-expert.md"

# === Session Context Output ===

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 SESSION START: Loading Project Context"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# === Read CLAUDE.md ===

if [[ -f "$CLAUDE_MD" ]]; then
    echo "✅ CLAUDE.md loaded"
    echo "   Location: $CLAUDE_MD"
    echo ""

    # Extract key sections for quick reference
    echo "📌 Quick Reference:"
    echo ""

    # Extract CFN Loop modes
    if grep -q "CFN Loop Execution Modes" "$CLAUDE_MD"; then
        echo "   CFN Loop Modes Available:"
        echo "   • /cfn-loop-task (Task Mode - Debugging, Full Visibility)"
        echo "   • /cfn-loop-cli  (CLI Mode - Production, 64% Cost Savings)"
        echo ""
    fi

    # Extract delegation pattern
    if grep -q "CTO Delegation Persona" "$CLAUDE_MD"; then
        echo "   Active Persona: CTO Delegation"
        echo "   • Delegate all non-trivial work (>3 steps)"
        echo "   • Use CFN Loop slash commands for complex tasks"
        echo "   • Define success criteria, not adoption metrics"
        echo ""
    fi

    # Extract test-driven requirements
    if grep -q "Test-Driven Gates" "$CLAUDE_MD"; then
        echo "   Test-Driven Gates (v3.0+):"
        echo "   • Standard Mode: ≥0.95 pass rate (Loop 3), ≥0.90 consensus (Loop 2)"
        echo "   • MVP Mode: ≥0.70 pass rate, ≥0.80 consensus"
        echo "   • Enterprise: ≥0.98 pass rate, ≥0.95 consensus"
        echo ""
    fi

else
    echo "⚠️  WARNING: CLAUDE.md not found at $CLAUDE_MD"
    echo ""
fi

# === CFN System Expert Reference ===

if [[ -f "$CFN_EXPERT" ]]; then
    echo "✅ CFN System Expert agent available"
    echo "   Use for: CFN-specific troubleshooting, methodology questions"
    echo ""
else
    echo "ℹ️  CFN System Expert agent not found (optional)"
    echo ""
fi

# === Environment Check ===

echo "🔧 Environment Status:"

# Check for custom routing
if [[ -f "${PROJECT_ROOT}/.env" ]] && grep -q "CFN_CUSTOM_ROUTING=true" "${PROJECT_ROOT}/.env" 2>/dev/null; then
    echo "   • Custom Provider Routing: ENABLED"
else
    echo "   • Custom Provider Routing: DISABLED (default)"
fi

# Check for Redis coordination
if command -v redis-cli &>/dev/null; then
    echo "   • Redis CLI: Available"
else
    echo "   • Redis CLI: Not found (CLI mode may need Docker)"
fi

# Check for Docker
if command -v docker &>/dev/null; then
    echo "   • Docker: Available"
else
    echo "   • Docker: Not found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Ready to delegate. Use /cfn-loop-cli or /cfn-loop-task for complex work."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit 0
