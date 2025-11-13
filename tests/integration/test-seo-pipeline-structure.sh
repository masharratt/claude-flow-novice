#!/bin/bash
set -e

# SEO Pipeline Structure Validation Test
# Validates that all components exist and are properly configured

echo "🧪 SEO Pipeline Structure Validation"
echo "======================================"
echo ""

FAILED=0

# Test 1: SEO Agents Exist
echo "Test 1: Validating SEO agents..."
REQUIRED_AGENTS=(
  "seo-analytics-specialist"
  "competitive-seo-analyst"
  "content-seo-strategist"
  "technical-seo-specialist"
  "programmatic-seo-engineer"
  "schema-markup-engineer"
)

for agent in "${REQUIRED_AGENTS[@]}"; do
  if [ -f ".claude/agents/cfn-seo-team/${agent}.md" ]; then
    echo "  ✅ ${agent}.md"
  else
    echo "  ❌ ${agent}.md NOT FOUND"
    FAILED=1
  fi
done

# Test 2: SEO Validators Exist
echo ""
echo "Test 2: Validating SEO validators..."
VALIDATORS=(
  "humanizer-validator"
  "branding-validator"
  "audience-validator"
)

for validator in "${VALIDATORS[@]}"; do
  if [ -f ".claude/agents/cfn-seo-team/seo-validators/${validator}.md" ]; then
    echo "  ✅ ${validator}.md"
  else
    echo "  ❌ ${validator}.md NOT FOUND"
    FAILED=1
  fi
done

# Test 3: SEO Coordinator Exists
echo ""
echo "Test 3: Validating SEO coordinator..."
if [ -f ".claude/agents/cfn-seo-team/cfn-seo-coordinator.md" ]; then
  echo "  ✅ cfn-seo-coordinator.md"
else
  echo "  ❌ cfn-seo-coordinator.md NOT FOUND"
  FAILED=1
fi

# Test 4: Orchestration Skill Exists
echo ""
echo "Test 4: Validating orchestration skill..."
if [ -f ".claude/skills/seo-orchestration/orchestrate-seo.sh" ]; then
  echo "  ✅ orchestrate-seo.sh"
  if [ -x ".claude/skills/seo-orchestration/orchestrate-seo.sh" ]; then
    echo "  ✅ orchestrate-seo.sh is executable"
  else
    echo "  ❌ orchestrate-seo.sh NOT executable"
    FAILED=1
  fi
else
  echo "  ❌ orchestrate-seo.sh NOT FOUND"
  FAILED=1
fi

if [ -f ".claude/skills/seo-orchestration/SKILL.md" ]; then
  echo "  ✅ SKILL.md documentation"
else
  echo "  ❌ SKILL.md NOT FOUND"
  FAILED=1
fi

# Test 5: Slash Commands Exist
echo ""
echo "Test 5: Validating slash commands..."
COMMANDS=(
  "seo-blog"
  "seo-landing"
  "seo-product"
)

for cmd in "${COMMANDS[@]}"; do
  if [ -f ".claude/commands/seo/${cmd}.md" ]; then
    echo "  ✅ ${cmd}.md"
  else
    echo "  ❌ ${cmd}.md NOT FOUND"
    FAILED=1
  fi
done

# Test 6: Humanizer Prompts Documentation
echo ""
echo "Test 6: Validating humanizer prompts..."
if [ -f ".claude/agents/cfn-seo-team/HUMANIZER_PROMPTS.md" ]; then
  echo "  ✅ HUMANIZER_PROMPTS.md"

  # Check for key sections
  if grep -q "15-Point Humanization Checklist" ".claude/agents/cfn-seo-team/HUMANIZER_PROMPTS.md"; then
    echo "  ✅ Contains humanization checklist"
  else
    echo "  ❌ Missing humanization checklist"
    FAILED=1
  fi

  if grep -q "Anti-AI Detection Prompts" ".claude/agents/cfn-seo-team/HUMANIZER_PROMPTS.md"; then
    echo "  ✅ Contains anti-AI prompts"
  else
    echo "  ❌ Missing anti-AI prompts"
    FAILED=1
  fi
else
  echo "  ❌ HUMANIZER_PROMPTS.md NOT FOUND"
  FAILED=1
fi

# Test 7: Orchestrator Script Structure
echo ""
echo "Test 7: Validating orchestrator script structure..."
if [ -f ".claude/skills/seo-orchestration/orchestrate-seo.sh" ]; then
  # Check for required functions/sections
  if grep -q "step_1_keyword_research" ".claude/skills/seo-orchestration/orchestrate-seo.sh"; then
    echo "  ✅ Step 1 (Keyword Research) defined"
  else
    echo "  ❌ Step 1 missing"
    FAILED=1
  fi

  if grep -q "step_7_validation_loop" ".claude/skills/seo-orchestration/orchestrate-seo.sh"; then
    echo "  ✅ Step 7 (Validation Loop) defined"
  else
    echo "  ❌ Step 7 missing"
    FAILED=1
  fi

  if grep -q "calculate_consensus" ".claude/skills/seo-orchestration/orchestrate-seo.sh"; then
    echo "  ✅ Consensus calculation defined"
  else
    echo "  ❌ Consensus calculation missing"
    FAILED=1
  fi

  if grep -q "redis-cli" ".claude/skills/seo-orchestration/orchestrate-seo.sh"; then
    echo "  ✅ Redis coordination implemented"
  else
    echo "  ❌ Redis coordination missing"
    FAILED=1
  fi
fi

# Test 8: Task Mode Documentation
echo ""
echo "Test 8: Validating task mode documentation..."
if [ -f ".claude/commands/seo/SEO_TASK_MODE.md" ]; then
  echo "  ✅ SEO_TASK_MODE.md"

  if grep -q "8-Step Pipeline" ".claude/commands/seo/SEO_TASK_MODE.md"; then
    echo "  ✅ Contains pipeline documentation"
  else
    echo "  ❌ Missing pipeline documentation"
    FAILED=1
  fi
else
  echo "  ❌ SEO_TASK_MODE.md NOT FOUND"
  FAILED=1
fi

# Test 9: Redis Availability
echo ""
echo "Test 9: Checking Redis availability..."
if command -v redis-cli &> /dev/null; then
  echo "  ✅ redis-cli installed"

  if redis-cli ping &> /dev/null; then
    echo "  ✅ Redis server running"
  else
    echo "  ⚠️  Redis server NOT running (required for pipeline execution)"
    echo "      Start with: redis-server &"
  fi
else
  echo "  ⚠️  redis-cli NOT installed (required for pipeline execution)"
  echo "      Install with: sudo apt-get install redis-server"
fi

# Test 10: Agent Count Summary
echo ""
echo "Test 10: SEO agent inventory..."
AGENT_COUNT=$(find .claude/agents/cfn-seo-team -name "*.md" -type f ! -name "HUMANIZER_PROMPTS.md" ! -name "AGENT_CREATION_REPORT.md" ! -name "DELEGATION_MATRIX.md" ! -name "INTEGRATION_REQUIREMENTS.md" | wc -l)
echo "  ℹ️  Total SEO agents: $AGENT_COUNT"
echo "  ℹ️  Expected: 14 (10 specialists + 3 validators + 1 coordinator)"

if [ "$AGENT_COUNT" -eq 14 ]; then
  echo "  ✅ Agent count correct"
else
  echo "  ⚠️  Agent count mismatch (expected 14, found $AGENT_COUNT)"
fi

# Summary
echo ""
echo "======================================"
if [ $FAILED -eq 0 ]; then
  echo "✅ All structure tests passed!"
  echo ""
  echo "Next steps:"
  echo "1. Configure API keys in .env:"
  echo "   - DATA_FOR_SEO_API_KEY"
  echo "   - OPENROUTER_API_KEY"
  echo "   - PEXELS_API_KEY (optional)"
  echo ""
  echo "2. Start Redis server:"
  echo "   redis-server &"
  echo ""
  echo "3. Test pipeline with sample:"
  echo "   /seo-blog \"how to preserve family stories\" --brand=ourstories"
  exit 0
else
  echo "❌ Some tests failed. Review errors above."
  exit 1
fi
