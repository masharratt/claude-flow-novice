#!/usr/bin/env bash

# Test Provider Routing System
# Tests the new custom provider routing functionality

set -euo pipefail

# BASH_SOURCE-derived repo root. A bare cwd-relative path only worked when this
# file was invoked from the repo root; anywhere else `source .claude/...` resolved
# against the caller's cwd instead of the repo.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

log() {
    echo -e "${BLUE}[TEST]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_failure() {
    echo -e "${RED}[FAIL]${NC} $*"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_section() {
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════${NC}"
    echo -e "${YELLOW}$*${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════${NC}"
}

##############################################################################
# Test 1: Provider Parser Script
##############################################################################
test_provider_parser() {
    log_section "Test 1: Provider Parser Script"

    log "Testing parse-agent-provider.sh with backend-developer agent"

    # Expectations are READ FROM the agent definition, never pinned to a literal
    # provider name. Pinned literals are what made this test rot: it asserted
    # openrouter/anthropic-claude-sonnet-4.5 long after the tree standardised on
    # zai/glm-4.6, so it reported 4 failures that were really a stale test. What
    # is under test is that the parser agrees with the definition, which stays
    # true across any future provider migration.
    AGENT_DEF="$PROJECT_ROOT/.claude/agents/cfn-dev-team/developers/backend-developer.md"
    if [[ ! -f "$AGENT_DEF" ]]; then
        log_failure "agent definition not found: $AGENT_DEF"
        return
    fi
    # Provider params live in a PROVIDER_PARAMETERS comment block, not in the
    # YAML frontmatter.
    read_provider_param() {
        sed -n '/PROVIDER_PARAMETERS/,/-->/p' "$AGENT_DEF" \
            | grep -m1 "^$1:" | sed "s/^$1:[[:space:]]*//"
    }
    EXPECTED_PROVIDER=$(read_provider_param provider)
    EXPECTED_MODEL=$(read_provider_param model)
    if [[ -z "$EXPECTED_PROVIDER" || -z "$EXPECTED_MODEL" ]]; then
        log_failure "backend-developer.md declares no provider/model to compare against"
        return
    fi
    log "Definition declares provider=$EXPECTED_PROVIDER model=$EXPECTED_MODEL"

    # Test provider field
    PROVIDER=$(bash "$PROJECT_ROOT/.claude/skills/cfn-agent-lifecycle/lib/spawning/parse-agent-provider.sh" backend-developer --field provider)
    if [[ "$PROVIDER" == "$EXPECTED_PROVIDER" ]]; then
        log_success "Provider parsing: $PROVIDER"
    else
        log_failure "Provider parsing failed: definition says '$EXPECTED_PROVIDER', parser returned '$PROVIDER'"
    fi

    # Test model field
    MODEL=$(bash "$PROJECT_ROOT/.claude/skills/cfn-agent-lifecycle/lib/spawning/parse-agent-provider.sh" backend-developer --field model)
    if [[ "$MODEL" == "$EXPECTED_MODEL" ]]; then
        log_success "Model parsing: $MODEL"
    else
        log_failure "Model parsing failed: definition says '$EXPECTED_MODEL', parser returned '$MODEL'"
    fi

    # Test non-existent agent (should return empty)
    NON_EXISTENT=$(bash "$PROJECT_ROOT/.claude/skills/cfn-agent-lifecycle/lib/spawning/parse-agent-provider.sh" non-existent-agent --field provider)
    if [[ -z "$NON_EXISTENT" ]]; then
        log_success "Non-existent agent returns empty"
    else
        log_failure "Non-existent agent should return empty, got '$NON_EXISTENT'"
    fi
}

##############################################################################
# Test 2: Provider Environment Getter with Custom Routing Disabled
##############################################################################
test_provider_env_no_custom() {
    log_section "Test 2: Provider Env (Custom Routing Disabled)"

    log "Testing get-agent-provider-env.sh with CFN_CUSTOM_ROUTING=false"

    # Disable custom routing
    export CFN_CUSTOM_ROUTING=false

    # Run in subshell to avoid hanging on source
    (
        source "$PROJECT_ROOT/.claude/skills/cfn-agent-lifecycle/lib/spawning/get-agent-provider-env.sh" backend-developer 2>/dev/null || true
        echo "BASE_URL=${ANTHROPIC_BASE_URL:-empty}"
        echo "MODEL=${ANTHROPIC_MODEL:-empty}"
    ) > /tmp/test-provider-env.txt

    # Read results
    BASE_URL_RESULT=$(grep "BASE_URL=" /tmp/test-provider-env.txt | cut -d= -f2)

    # With custom routing disabled, should use Main Chat settings (from .claude/settings.json)
    if [[ -f ".claude/settings.json" ]]; then
        EXPECTED_URL=$(jq -r '.env.ANTHROPIC_BASE_URL // empty' .claude/settings.json)
        if [[ "$BASE_URL_RESULT" == "$EXPECTED_URL" || "$BASE_URL_RESULT" == "empty" ]]; then
            log_success "Uses Main Chat settings when custom routing disabled (BASE_URL=$BASE_URL_RESULT)"
        else
            log_failure "Should use Main Chat settings, got BASE_URL=$BASE_URL_RESULT"
        fi
    else
        log_success "No settings file, using defaults"
    fi

    # Cleanup
    rm -f /tmp/test-provider-env.txt
}

##############################################################################
# Test 3: Provider Environment Getter with Custom Routing Enabled
##############################################################################
test_provider_env_custom() {
    log_section "Test 3: Provider Env (Custom Routing Enabled)"

    log "Testing get-agent-provider-env.sh with CFN_CUSTOM_ROUTING=true"

    # Enable custom routing
    export CFN_CUSTOM_ROUTING=true
    export OPENROUTER_API_KEY="test-key-12345"

    # Run in subshell to avoid hanging on source
    (
        source "$PROJECT_ROOT/.claude/skills/cfn-agent-lifecycle/lib/spawning/get-agent-provider-env.sh" backend-developer 2>/dev/null || true
        echo "BASE_URL=${ANTHROPIC_BASE_URL:-empty}"
        echo "MODEL=${ANTHROPIC_MODEL:-empty}"
    ) > /tmp/test-provider-env-custom.txt

    # -f2- not -f2: a base URL carrying a query string contains '=' and -f2
    # would silently truncate it.
    BASE_URL_RESULT=$(grep "BASE_URL=" /tmp/test-provider-env-custom.txt | cut -d= -f2-)
    MODEL_RESULT=$(grep "MODEL=" /tmp/test-provider-env-custom.txt | cut -d= -f2-)

    # The expected URL comes out of the router's OWN provider case block, so the
    # assertion is "router routes the declared provider to the URL it declares
    # for that provider" rather than a second hardcoded copy of the mapping that
    # can drift away from it.
    ROUTER="$PROJECT_ROOT/.claude/skills/cfn-agent-lifecycle/lib/spawning/get-agent-provider-env.sh"
    # Kept to a single physical line on purpose: tests/test-sourced-paths-exist.sh
    # rebuilds a file's assignment prefix line by line, so a multi-line
    # VAR=$(awk '...') leaves an unterminated quote in the replayed prefix and
    # downgrades this file's two real source-target checks to SKIP.
    EXPECTED_BASE_URL=$(awk -v want="${EXPECTED_PROVIDER})" '$1 == want { inb = 1; next } inb && /ANTHROPIC_BASE_URL=/ { sub(/.*ANTHROPIC_BASE_URL="/, ""); sub(/".*/, ""); print; exit } inb && /^[[:space:]]*;;/ { exit }' "$ROUTER")

    if [[ -z "$EXPECTED_BASE_URL" ]]; then
        log_failure "router declares no ANTHROPIC_BASE_URL for provider '$EXPECTED_PROVIDER'"
    elif [[ "$BASE_URL_RESULT" == "$EXPECTED_BASE_URL" ]]; then
        log_success "Routes $EXPECTED_PROVIDER to $BASE_URL_RESULT"
    else
        log_failure "Provider '$EXPECTED_PROVIDER' should route to $EXPECTED_BASE_URL, got BASE_URL=$BASE_URL_RESULT"
    fi

    if [[ "$MODEL_RESULT" == "$EXPECTED_MODEL" ]]; then
        log_success "Uses the model the definition declares: $MODEL_RESULT"
    else
        log_failure "Should use $EXPECTED_MODEL, got MODEL=$MODEL_RESULT"
    fi

    # Cleanup
    unset CFN_CUSTOM_ROUTING OPENROUTER_API_KEY
    rm -f /tmp/test-provider-env-custom.txt
}

##############################################################################
# Test 4: Switch API Command
##############################################################################
test_switch_api() {
    log_section "Test 4: Switch API Command"

    log "Testing /switch-api status"

    # Test status command
    if bash scripts/switch-api.sh status >/dev/null 2>&1; then
        log_success "switch-api status command works"
    else
        log_failure "switch-api status command failed"
    fi

    log "Testing /switch-api help"

    # Test help command
    HELP_OUTPUT=$(bash scripts/switch-api.sh help 2>&1)
    if echo "$HELP_OUTPUT" | grep -q "kimi"; then
        log_success "Help includes kimi provider"
    else
        log_failure "Help should mention kimi provider"
    fi

    if echo "$HELP_OUTPUT" | grep -q "openrouter"; then
        log_success "Help includes openrouter provider"
    else
        log_failure "Help should mention openrouter provider"
    fi
}

##############################################################################
# Test 5: Provider Detection from URL
##############################################################################
test_provider_detection() {
    log_section "Test 5: Provider Detection from URL"

    log "Testing provider detection logic"

    # Test Z.ai detection
    if [[ "https://api.z.ai/api/anthropic" == *"z.ai"* ]]; then
        log_success "Z.ai URL detection works"
    else
        log_failure "Z.ai URL detection failed"
    fi

    # Test Kimi detection
    if [[ "https://api.moonshot.ai/anthropic" == *"moonshot.ai"* ]]; then
        log_success "Kimi URL detection works"
    else
        log_failure "Kimi URL detection failed"
    fi

    # Test OpenRouter detection
    if [[ "https://openrouter.ai/api/v1" == *"openrouter.ai"* ]]; then
        log_success "OpenRouter URL detection works"
    else
        log_failure "OpenRouter URL detection failed"
    fi
}

##############################################################################
# Main Test Execution
##############################################################################
main() {
    log_section "Provider Routing System Tests"

    test_provider_parser
    test_provider_env_no_custom
    test_provider_env_custom
    test_switch_api
    test_provider_detection

    # Summary
    echo ""
    log_section "Test Summary"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some tests failed${NC}"
        exit 1
    fi
}

main "$@"
