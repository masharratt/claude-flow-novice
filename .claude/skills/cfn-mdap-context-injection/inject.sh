#!/bin/bash
# MDAP Context Injection Script
# Injects full MDAP workflow code for troubleshooting
#
# Usage:
#   ./inject.sh --all           # All MDAP-related files
#   ./inject.sh --coordinator   # Main coordinator only
#   ./inject.sh --mdap          # MDAP implementer + config
#   ./inject.sh --cli           # CLI sprint implementer
#   ./inject.sh --docker        # Docker mode files
#   ./inject.sh --cfn-loop      # CFN Loop orchestration files
#   ./inject.sh --config        # Configuration files
#   ./inject.sh --decomposers   # Decomposer tasks
#   ./inject.sh --validators    # Async validators
#   ./inject.sh --codesearch      # CodeSearch integration (analytics, RAG, learning)
#   ./inject.sh --tests         # Test files (mdap-analytics, integration)
#   ./inject.sh --file <path>   # Specific file

set -euo pipefail

# Resolve project root (relative to this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# File groups
COORDINATOR_FILES=(
  "lib/mdap/cfn-coordinator.ts"
)

MDAP_FILES=(
  "lib/mdap/cfn-mdap-implementer.ts"
  "lib/mdap/mdap-config.ts"
  "lib/mdap/mdap-atomicity.ts"
  "lib/mdap/mdap-db.ts"
  "lib/mdap/mdap-container-config.ts"
  "lib/mdap/mdap-metrics-tracker.ts"
)

CLI_FILES=(
  "lib/mdap/cfn-cli-sprint-implementer.ts"
  "lib/mdap/sprint-aggregator.ts"
)

CONFIG_FILES=(
  "lib/mdap/mdap-config.ts"
  "lib/mdap/sla-enforcement.ts"
  "lib/mdap/health-check.ts"
)

DECOMPOSER_FILES=(
  "lib/mdap/cfn-architecture-decomposer.ts"
  "lib/mdap/cfn-security-decomposer.ts"
  "lib/mdap/cfn-performance-decomposer.ts"
  "lib/mdap/cfn-testing-decomposer.ts"
  "lib/mdap/cfn-decomposition-aggregator.ts"
)

VALIDATOR_FILES=(
  "lib/mdap/cfn-async-validator-orchestrator.ts"
  "lib/mdap/cfn-async-security-validator.ts"
  "lib/mdap/cfn-async-performance-validator.ts"
  "lib/mdap/cfn-async-architecture-validator.ts"
  "lib/mdap/cfn-async-code-quality-validator.ts"
  "lib/mdap/cfn-async-testing-validator.ts"
)

INDEX_FILES=(
  "lib/mdap/index.ts"
)

# CodeSearch integration files
CODESEARCH_FILES=(
  "lib/mdap/codesearch-mdap-analytics.ts"
  "lib/mdap/codesearch-rag-decomposition.ts"
  "lib/mdap/codesearch-learning-hooks.ts"
  "lib/mdap/codesearch-error-pattern-learning.ts"
  "lib/mdap/codesearch-schemas.ts"
  "lib/mdap/codesearch-init.ts"
  "lib/mdap/codesearch-auth.ts"
)

# Test files
TEST_FILES=(
  "tests/codesearch/mdap-analytics.test.ts"
  "tests/codesearch/test-utils.ts"
  "tests/integration/codesearch-mdap-integration.test.ts"
  "tests/decomposition/context-passing.test.ts"
  "tests/decomposition/sequential-flow.test.ts"
)

# Docker mode files
DOCKER_FILES=(
  "docker/Dockerfile.agent"
  "docker/Dockerfile.coordinator"
  "docker/docker-compose.yml"
  "docker/docker-compose.cli.yml"
  "docker/.env.example"
  "scripts/docker/build-from-linux.sh"
  "scripts/docker/run-in-worktree.sh"
)

# CFN Loop orchestration files
CFN_LOOP_FILES=(
  ".claude/skills/cfn-loop-orchestration/orchestrate.sh"
  ".claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/orchestrate.sh"
  ".claude/commands/cfn-loop/cfn-loop-cli.md"
  ".claude/commands/cfn-loop/cfn-loop-task.md"
  ".claude/agents/SHARED_PROTOCOL.md"
)

# CLI mode files
CLI_MODE_FILES=(
  "scripts/cli/spawn-agent.sh"
  "scripts/cli/coordinator.sh"
  ".claude/skills/cfn-agent-spawning/SKILL.md"
  "docs/CLI_MODE_ARCHITECTURE.md"
)

# Output a single file with delimiters
output_file() {
  local file="$1"
  local full_path="$PROJECT_ROOT/$file"

  if [[ -f "$full_path" ]]; then
    echo ""
    echo "=== FILE: $file ==="
    echo ""
    cat "$full_path"
    echo ""
    echo "=== END FILE ==="
    echo ""
  else
    echo "⚠️  File not found: $file" >&2
  fi
}

# Output a group of files
output_group() {
  local -n files=$1
  local group_name=$2

  echo ""
  echo "=========================================="
  echo "  $group_name"
  echo "=========================================="

  for file in "${files[@]}"; do
    output_file "$file"
  done
}

# Main execution
main() {
  local inject_all=false
  local inject_coordinator=false
  local inject_mdap=false
  local inject_cli=false
  local inject_docker=false
  local inject_cfn_loop=false
  local inject_config=false
  local inject_decomposers=false
  local inject_validators=false
  local inject_index=false
  local inject_codesearch=false
  local inject_tests=false
  local specific_file=""

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --all)
        inject_all=true
        shift
        ;;
      --coordinator)
        inject_coordinator=true
        shift
        ;;
      --mdap)
        inject_mdap=true
        shift
        ;;
      --cli)
        inject_cli=true
        shift
        ;;
      --docker)
        inject_docker=true
        shift
        ;;
      --cfn-loop)
        inject_cfn_loop=true
        shift
        ;;
      --config)
        inject_config=true
        shift
        ;;
      --decomposers)
        inject_decomposers=true
        shift
        ;;
      --validators)
        inject_validators=true
        shift
        ;;
      --index)
        inject_index=true
        shift
        ;;
      --codesearch)
        inject_codesearch=true
        shift
        ;;
      --tests)
        inject_tests=true
        shift
        ;;
      --file)
        specific_file="$2"
        shift 2
        ;;
      -h|--help)
        echo "CFN Context Injection - Immediate system context for troubleshooting"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Context Options:"
        echo "  --all           All MDAP files (~90K tokens)"
        echo "  --coordinator   Main coordinator flow only"
        echo "  --mdap          MDAP implementer + config"
        echo "  --cli           CLI mode files (~25K tokens)"
        echo "  --docker        Docker mode files (~30K tokens)"
        echo "  --cfn-loop      CFN Loop orchestration (~40K tokens)"
        echo "  --config        Configuration files"
        echo "  --decomposers   Decomposer tasks"
        echo "  --validators    Async validators"
        echo "  --index         Index exports (types)"
        echo "  --codesearch      CodeSearch integration (~88K tokens)"
        echo "  --tests         Test files (~40K tokens)"
        echo "  --file <path>   Specific file"
        echo ""
        echo "Quick Examples:"
        echo "  $0 --docker           # For Docker issues"
        echo "  $0 --cli              # For CLI mode problems"
        echo "  $0 --all              # For full MDAP debugging"
        echo "  $0 --docker --cli    # Combined contexts"
        echo ""
        echo "Used By:"
        echo "  cfn-docker-expert     --> --docker"
        echo "  cfn-loops-cli-expert  --> --cli [+ --cfn-loop]"
        echo "  mdap-trigger-specialist --> --all [+ --codesearch --tests]"
        echo ""
        echo "  -h, --help      Show this help"
        exit 0
        ;;
      *)
        echo "Unknown option: $1" >&2
        echo "Use --help for usage information" >&2
        exit 1
        ;;
    esac
  done

  # Default to --all if no options specified
  if [[ "$inject_all" == "false" && "$inject_coordinator" == "false" && \
        "$inject_mdap" == "false" && "$inject_cli" == "false" && \
        "$inject_docker" == "false" && "$inject_cfn_loop" == "false" && \
        "$inject_config" == "false" && "$inject_decomposers" == "false" && \
        "$inject_validators" == "false" && "$inject_index" == "false" && \
        "$inject_codesearch" == "false" && "$inject_tests" == "false" && \
        -z "$specific_file" ]]; then
    inject_all=true
  fi

  echo "# MDAP Context Injection"
  echo "# Project root: $PROJECT_ROOT"
  echo ""

  # Handle specific file
  if [[ -n "$specific_file" ]]; then
    output_file "$specific_file"
    exit 0
  fi

  # Handle --all (core MDAP workflow only - ~90K tokens)
  # Use --codesearch and --tests explicitly for extended context
  if [[ "$inject_all" == "true" ]]; then
    inject_coordinator=true
    inject_mdap=true
    inject_cli=true
    inject_decomposers=true
    inject_validators=true
    inject_index=true
    # Note: codesearch and tests not included in --all by default
  fi

  # Output requested groups
  if [[ "$inject_index" == "true" ]]; then
    output_group INDEX_FILES "INDEX / TYPE EXPORTS"
  fi

  if [[ "$inject_coordinator" == "true" ]]; then
    output_group COORDINATOR_FILES "COORDINATOR"
  fi

  if [[ "$inject_mdap" == "true" ]]; then
    output_group MDAP_FILES "MDAP MODE"
  fi

  if [[ "$inject_cli" == "true" ]]; then
    output_group CLI_FILES "CLI SPRINT MODE"
  fi

  if [[ "$inject_docker" == "true" ]]; then
    output_group DOCKER_FILES "DOCKER MODE"
  fi

  if [[ "$inject_cfn_loop" == "true" ]]; then
    output_group CFN_LOOP_FILES "CFN LOOP ORCHESTRATION"
  fi

  if [[ "$inject_config" == "true" ]]; then
    output_group CONFIG_FILES "CONFIGURATION"
  fi

  if [[ "$inject_decomposers" == "true" ]]; then
    output_group DECOMPOSER_FILES "DECOMPOSERS"
  fi

  if [[ "$inject_validators" == "true" ]]; then
    output_group VALIDATOR_FILES "VALIDATORS"
  fi

  if [[ "$inject_codesearch" == "true" ]]; then
    output_group CODESEARCH_FILES "CODESEARCH INTEGRATION"
  fi

  if [[ "$inject_tests" == "true" ]]; then
    output_group TEST_FILES "TESTS"
  fi

  echo ""
  echo "# Context injection complete"
}

main "$@"