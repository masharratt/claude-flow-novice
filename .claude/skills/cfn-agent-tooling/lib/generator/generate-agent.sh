#!/usr/bin/env bash
#
# Agent Template Generator
# Creates new agent profiles with consistent structure and validation patterns
#
# Usage:
#   ./generate-agent.sh --name <agent-name> --type <agent-type> --description <description>
#
# Example:
#   ./generate-agent.sh \
#     --name "api-security-specialist" \
#     --type "specialist" \
#     --description "MUST BE USED for API security audits and penetration testing"
#
# Agent Types:
#   - specialist: Domain-specific implementation agent (Loop 3)
#   - validator: Code review and quality validation agent (Loop 2)
#   - coordinator: Multi-agent orchestration and planning agent
#   - utility: Supporting tools and helper agents

set -euo pipefail

# Default values
AGENT_NAME=""
AGENT_TYPE="specialist"
AGENT_DESCRIPTION=""
AGENT_TOOLS="[Read, Write, Edit, Bash, Grep, Glob, TodoWrite]"
AGENT_MODEL="sonnet"
AGENT_ACL_LEVEL="1"
OUTPUT_DIR=""
PROVIDER="zai"
PROVIDER_MODEL="glm-4.6"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --name)
            AGENT_NAME="$2"
            shift 2
            ;;
        --type)
            AGENT_TYPE="$2"
            shift 2
            ;;
        --description)
            AGENT_DESCRIPTION="$2"
            shift 2
            ;;
        --tools)
            AGENT_TOOLS="$2"
            shift 2
            ;;
        --model)
            AGENT_MODEL="$2"
            shift 2
            ;;
        --acl-level)
            AGENT_ACL_LEVEL="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --provider)
            PROVIDER="$2"
            shift 2
            ;;
        --provider-model)
            PROVIDER_MODEL="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 --name <agent-name> --type <agent-type> --description <description>"
            echo ""
            echo "Required arguments:"
            echo "  --name              Agent name (lowercase with hyphens)"
            echo "  --description       Agent description (MUST BE USED pattern)"
            echo ""
            echo "Optional arguments:"
            echo "  --type              Agent type (specialist|validator|coordinator|utility) [default: specialist]"
            echo "  --tools             Tool list in JSON array format [default: [Read, Write, Edit, Bash, Grep, Glob, TodoWrite]]"
            echo "  --model             Claude model (sonnet|opus|haiku) [default: sonnet]"
            echo "  --acl-level         Access control level 1-3 [default: 1]"
            echo "  --output-dir        Output directory [default: .claude/agents/cfn-dev-team/<type>s/]"
            echo "  --provider          AI provider (zai|kimi|openrouter|anthropic) [default: zai]"
            echo "  --provider-model    Provider-specific model [default: glm-4.6]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$AGENT_NAME" ]]; then
    echo "Error: --name is required"
    exit 1
fi

if [[ -z "$AGENT_DESCRIPTION" ]]; then
    echo "Error: --description is required"
    exit 1
fi

# Validate AGENT_MODEL (must be sonnet, opus, or haiku)
if [[ ! "$AGENT_MODEL" =~ ^(sonnet|opus|haiku)$ ]]; then
    echo "❌ ERROR: Invalid model specified: '$AGENT_MODEL'" >&2
    echo "   Allowed values: sonnet, opus, haiku" >&2
    exit 1
fi

# Validate AGENT_ACL_LEVEL (must be 1, 2, or 3)
if [[ ! "$AGENT_ACL_LEVEL" =~ ^[1-3]$ ]]; then
    echo "❌ ERROR: Invalid ACL level specified: '$AGENT_ACL_LEVEL'" >&2
    echo "   Allowed values: 1, 2, 3" >&2
    exit 1
fi

# Validate AGENT_TOOLS (must be valid JSON array)
if command -v jq >/dev/null 2>&1; then
    if ! echo "$AGENT_TOOLS" | jq -e 'if type == "array" then true else false end' >/dev/null 2>&1; then
        echo "❌ ERROR: Invalid tools format: '$AGENT_TOOLS'" >&2
        echo "   Expected: JSON array of tool names" >&2
        echo "   Example: '[Read, Write, Edit, Bash]'" >&2
        exit 1
    fi
else
    # Fallback: basic bracket check if jq not available
    if [[ ! "$AGENT_TOOLS" =~ ^\[.*\]$ ]]; then
        echo "❌ ERROR: Invalid tools format: '$AGENT_TOOLS'" >&2
        echo "   Expected: JSON array of tool names" >&2
        echo "   Example: '[Read, Write, Edit, Bash]'" >&2
        echo "   Note: jq not available for full JSON validation" >&2
        exit 1
    fi
fi

# Determine output directory based on agent type
if [[ -z "$OUTPUT_DIR" ]]; then
    case "$AGENT_TYPE" in
        specialist)
            OUTPUT_DIR=".claude/agents/cfn-dev-team/developers"
            ;;
        validator)
            OUTPUT_DIR=".claude/agents/cfn-dev-team/reviewers/quality"
            ;;
        coordinator)
            OUTPUT_DIR=".claude/agents/cfn-dev-team/coordinators"
            ;;
        utility)
            OUTPUT_DIR=".claude/agents/cfn-dev-team/utility"
            ;;
        *)
            echo "Error: Invalid agent type: $AGENT_TYPE"
            echo "Valid types: specialist, validator, coordinator, utility"
            exit 1
            ;;
    esac
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Output file path
OUTPUT_FILE="$OUTPUT_DIR/${AGENT_NAME}.md"

# Check if file already exists
if [[ -f "$OUTPUT_FILE" ]]; then
    echo "Error: Agent file already exists: $OUTPUT_FILE"
    echo "Remove existing file or choose a different name"
    exit 1
fi

# Generate agent template
cat > "$OUTPUT_FILE" << EOF
---
name: $AGENT_NAME
description: $AGENT_DESCRIPTION
tools: $AGENT_TOOLS
model: $AGENT_MODEL
type: $AGENT_TYPE
acl_level: $AGENT_ACL_LEVEL
validation_hooks:
  - agent-template-validator
  - test-coverage-validator
---

<!-- PROVIDER_PARAMETERS
provider: $PROVIDER
model: $PROVIDER_MODEL
-->

# ${AGENT_NAME^} Agent

You are a ${AGENT_TYPE} agent specialized in [DOMAIN EXPERTISE - TO BE CUSTOMIZED].

## Core Responsibilities

[CUSTOMIZE: List 3-5 primary responsibilities]

1. [Responsibility 1]
2. [Responsibility 2]
3. [Responsibility 3]

---

## Success Criteria Integration (REQUIRED)

### Validation Pattern

All agents MUST use the centralized JSON validation skill:

\`\`\`bash
# Source centralized validation skill
source .claude/skills/json-validation/validate-success-criteria.sh

# Validate on startup (exits on invalid JSON)
validate_success_criteria || exit 1

# Access parsed criteria
if [[ -n "\${CRITERIA:-}" ]]; then
    # List all test suites
    list_test_suites

    # Get specific test command
    TEST_CMD=\$(get_test_command "unit-tests")

    # Get pass threshold
    THRESHOLD=\$(get_pass_threshold "unit-tests")
fi
\`\`\`

### TDD Protocol (Test-Driven Development)

**Write Tests First:**
- Extract test requirements from success criteria
- Write failing tests for each requirement
- Ensure test coverage ≥80%
- *Guidance: Typically ~15-20 min, adjust based on complexity*

**Implement:**
- Write minimum code to pass tests
- Run tests continuously (\`npm test --watch\` or framework equivalent)
- Refactor for quality
- *Guidance: Typically ~30-40 min, adjust based on complexity*

**Validate:**
- Run full test suite from success criteria
- Verify pass rate meets threshold (Standard: ≥95%)
- Check coverage metrics
- *Guidance: Typically ~5 min for validation*

---

## Test-Driven Validation (NOT Confidence Scores)

### Execute Tests

\`\`\`bash
# Get test command from success criteria
TEST_CMD=\$(get_test_command "primary-test-suite")

if [[ -n "\$TEST_CMD" ]]; then
    # Execute tests and capture output
    TEST_OUTPUT=\$(eval "\$TEST_CMD" 2>&1)

    # Parse test results using CFN helper
    RESULTS=\$(./.claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh \\
        "jest" "\$TEST_OUTPUT")
else
    echo "⚠️  No test command found in success criteria"
    echo "   Proceeding without test validation"
fi
\`\`\`

### Completion Protocol

**DO NOT** report subjective confidence scores (0.0-1.0).

**DO** report objective test metrics:

\`\`\`bash
echo "Test Results:"
echo "  Test Suite: [suite-name]"
echo "  Total Tests: [count]"
echo "  Passed: [count]"
echo "  Failed: [count]"
echo "  Pass Rate: [percentage]%"
echo "  Threshold: [required-rate]%"
echo "  Status: [PASS|FAIL]"
\`\`\`

---

## Domain-Specific Guidelines

[CUSTOMIZE: Add domain-specific best practices, patterns, anti-patterns]

### Best Practices

1. [Practice 1]
2. [Practice 2]
3. [Practice 3]

### Common Pitfalls

1. [Pitfall 1]
2. [Pitfall 2]
3. [Pitfall 3]

### Recommended Tools

- [Tool 1]: [Use case]
- [Tool 2]: [Use case]
- [Tool 3]: [Use case]

---

## Success Metrics

[CUSTOMIZE: Define objective success metrics]

- [Metric 1]: [Target]
- [Metric 2]: [Target]
- [Metric 3]: [Target]
- Overall test pass rate: ≥ 0.95 (Standard mode)

---

## Example Workflows

### Workflow 1: [Scenario Name]

\`\`\`bash
# Step 1: [Description]
[command or action]

# Step 2: [Description]
[command or action]

# Step 3: [Description]
[command or action]
\`\`\`

### Workflow 2: [Scenario Name]

\`\`\`bash
# Step 1: [Description]
[command or action]

# Step 2: [Description]
[command or action]
\`\`\`

---

## Integration Points

[CUSTOMIZE: Document how this agent integrates with other agents]

- **Loop 3 (Implementation)**: [How this agent participates]
- **Loop 2 (Validation)**: [How this agent validates]
- **Dependencies**: [Other agents or services required]

---

## References

[CUSTOMIZE: Add relevant documentation links]

- Internal Docs: [Link]
- External Docs: [Link]
- Related Agents: [List]

---

**Status:** Generated template - requires customization
**Version:** 1.0.0
**Created:** $(date +%Y-%m-%d)
EOF

echo "✅ Agent template created: $OUTPUT_FILE"
echo ""
echo "Next steps:"
echo "1. Customize the [DOMAIN EXPERTISE] placeholder"
echo "2. Fill in Core Responsibilities"
echo "3. Customize Domain-Specific Guidelines"
echo "4. Define Success Metrics"
echo "5. Add Example Workflows"
echo "6. Document Integration Points"
echo "7. Add relevant references"
echo ""
echo "Validation Pattern: ✅ Automatically included"
echo "Test-Driven Protocol: ✅ Automatically included"
echo "Provider Configuration: ✅ Set to $PROVIDER ($PROVIDER_MODEL)"
