#!/bin/bash
# MDAP Context Injection Script
# Injects full MDAP/Trigger workflow code for troubleshooting
#
# Usage:
#   ./inject.sh --all           # All MDAP-related files
#   ./inject.sh --coordinator   # Main coordinator only
#   ./inject.sh --mdap          # MDAP implementer + config
#   ./inject.sh --cli           # CLI sprint implementer
#   ./inject.sh --config        # Configuration files
#   ./inject.sh --decomposers   # Decomposer tasks
#   ./inject.sh --validators    # Async validators
#   ./inject.sh --file <path>   # Specific file

set -euo pipefail

# Resolve project root (relative to this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# File groups
COORDINATOR_FILES=(
  "docker/trigger-dev/src/trigger/cfn-coordinator.ts"
)

MDAP_FILES=(
  "docker/trigger-dev/src/trigger/cfn-mdap-implementer.ts"
  "docker/trigger-dev/src/lib/mdap-config.ts"
  "docker/trigger-dev/src/lib/mdap-atomicity.ts"
)

CLI_FILES=(
  "docker/trigger-dev/src/trigger/cfn-cli-sprint-implementer.ts"
  "docker/trigger-dev/src/lib/sprint-aggregator.ts"
)

CONFIG_FILES=(
  "docker/trigger-dev/src/lib/mdap-config.ts"
  "docker/trigger-dev/src/lib/sla-enforcement.ts"
  "docker/trigger-dev/src/lib/health-check.ts"
)

DECOMPOSER_FILES=(
  "docker/trigger-dev/src/trigger/cfn-architecture-decomposer.ts"
  "docker/trigger-dev/src/trigger/cfn-security-decomposer.ts"
  "docker/trigger-dev/src/trigger/cfn-performance-decomposer.ts"
  "docker/trigger-dev/src/trigger/cfn-testing-decomposer.ts"
  "docker/trigger-dev/src/trigger/cfn-decomposition-aggregator.ts"
)

VALIDATOR_FILES=(
  "docker/trigger-dev/src/trigger/cfn-async-validator-orchestrator.ts"
  "docker/trigger-dev/src/trigger/cfn-async-security-validator.ts"
  "docker/trigger-dev/src/trigger/cfn-async-performance-validator.ts"
  "docker/trigger-dev/src/trigger/cfn-async-architecture-validator.ts"
  "docker/trigger-dev/src/trigger/cfn-async-code-quality-validator.ts"
  "docker/trigger-dev/src/trigger/cfn-async-testing-validator.ts"
)

INDEX_FILES=(
  "docker/trigger-dev/src/trigger/index.ts"
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
  local inject_config=false
  local inject_decomposers=false
  local inject_validators=false
  local inject_index=false
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
      --file)
        specific_file="$2"
        shift 2
        ;;
      -h|--help)
        echo "MDAP Context Injection"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --all           Inject all MDAP-related files"
        echo "  --coordinator   Main coordinator (cfn-coordinator.ts)"
        echo "  --mdap          MDAP implementer + config"
        echo "  --cli           CLI sprint implementer"
        echo "  --config        Configuration files"
        echo "  --decomposers   Decomposer tasks"
        echo "  --validators    Async validators"
        echo "  --index         Index exports (types)"
        echo "  --file <path>   Specific file"
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
        "$inject_config" == "false" && "$inject_decomposers" == "false" && \
        "$inject_validators" == "false" && "$inject_index" == "false" && \
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

  # Handle --all
  if [[ "$inject_all" == "true" ]]; then
    inject_coordinator=true
    inject_mdap=true
    inject_cli=true
    inject_decomposers=true
    inject_validators=true
    inject_index=true
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

  if [[ "$inject_config" == "true" ]]; then
    output_group CONFIG_FILES "CONFIGURATION"
  fi

  if [[ "$inject_decomposers" == "true" ]]; then
    output_group DECOMPOSER_FILES "DECOMPOSERS"
  fi

  if [[ "$inject_validators" == "true" ]]; then
    output_group VALIDATOR_FILES "VALIDATORS"
  fi

  echo ""
  echo "# Context injection complete"
}

main "$@"
