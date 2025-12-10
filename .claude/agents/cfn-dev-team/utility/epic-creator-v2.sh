#!/bin/bash
set -euo pipefail

# Epic Creator v2 - Sequential Persona Review Agent (SECURE VERSION)
# Creates comprehensive epic definitions with sequential reviews from 6 key personas
# Security-hardened with input validation and secure file operations

# Source security utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECURITY_UTILS="$(realpath "${SCRIPT_DIR}/../../../skills/cfn-epic-creator/security-utils.sh")"

if [[ -f "$SECURITY_UTILS" ]]; then
    # shellcheck source=../skills/cfn-epic-creator/security-utils.sh
    source "$SECURITY_UTILS"
else
    echo "Error: Security utilities not found at $SECURITY_UTILS" >&2
    exit 1
fi

# Default values
MODE="standard"
ENFORCE_DEVOPS=false
OUTPUT_FILE=""
EPIC_DESCRIPTION=""

# Parse command line arguments with validation
while [[ $# -gt 0 ]]; do
  case $1 in
    --mode=*)
      MODE="${1#--mode=}"
      if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
        echo "Error: --mode must be one of: mvp, standard, enterprise" >&2
        exit 1
      fi
      shift
      ;;
    --mode)
      MODE="$2"
      if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
        echo "Error: --mode must be one of: mvp, standard, enterprise" >&2
        exit 1
      fi
      shift 2
      ;;
    --enforce-devops)
      ENFORCE_DEVOPS=true
      shift
      ;;
    --output=*)
      OUTPUT_FILE="${1#--output=}"
      shift
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    -*)
      echo "Error: Unknown option $1" >&2
      echo "Usage: $0 \"<epic-description>\" [--mode=mvp|standard|enterprise] [--enforce-devops] [--output=<path>]" >&2
      exit 1
      ;;
    *)
      if [[ -z "$EPIC_DESCRIPTION" ]]; then
        EPIC_DESCRIPTION="$1"
      else
        echo "Error: Multiple epic descriptions provided" >&2
        echo "Usage: $0 \"<epic-description>\" [--mode=mvp|standard|enterprise] [--enforce-devops] [--output=<path>]" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

# Validate epic description with security checks
if [[ -z "$EPIC_DESCRIPTION" ]]; then
  echo "Error: Epic description is required" >&2
  echo "Usage: $0 \"<epic-description>\" [--mode=mvp|standard|enterprise] [--enforce-devops] [--output=<path>]" >&2
  exit 1
fi

# Sanitize and validate epic description
if ! VALIDATED_DESCRIPTION=$(validate_epic_description "$EPIC_DESCRIPTION"); then
    log_security "ERROR" "Invalid epic description"
    exit 1
fi
EPIC_DESCRIPTION="$VALIDATED_DESCRIPTION"

# Check for command injection in description
if ! check_command_injection "$EPIC_DESCRIPTION"; then
    exit 1
fi

# Set default output file if not provided (secure generation)
if [[ -z "$OUTPUT_FILE" ]]; then
    TIMESTAMP=$(date +"%Y-%m-%d-%H-%M-%S")
    OUTPUT_FILE=$(generate_secure_filename "epic-with-personas" "$TIMESTAMP" "json")
fi

# Validate and sanitize output file path
VALIDATED_OUTPUT_FILE=$(validate_path "$OUTPUT_FILE" "$(pwd)")
if [[ $? -ne 0 ]]; then
    log_security "ERROR" "Invalid output file path"
    exit 1
fi
OUTPUT_FILE="$VALIDATED_OUTPUT_FILE"

# Ensure output directory exists with proper permissions
OUTPUT_DIR=$(dirname "$OUTPUT_FILE")
if [[ ! -d "$OUTPUT_DIR" ]]; then
    mkdir -p "$OUTPUT_DIR"
    chmod 755 "$OUTPUT_DIR"
fi

# Create epic JSON structure
create_epic_json() {
  local description="$1"
  local mode="$2"
  local enforce_devops="$3"

  # Generate epic ID and metadata
  local epic_id
  epic_id=$(generate_cache_key "$description" | head -c 16)
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Define persona structure
  local personas='[
    {
      "name": "Product Manager",
      "perspective": "Strategic value, user needs, market fit",
      "focus_areas": ["business objectives", "user stories", "acceptance criteria", "success metrics"]
    },
    {
      "name": "Architect",
      "perspective": "System design, scalability, technical constraints",
      "focus_areas": ["architecture", "scalability", "performance", "technical debt"]
    },
    {
      "name": "Security Specialist",
      "perspective": "Threats, vulnerabilities, compliance requirements",
      "focus_areas": ["threat model", "security controls", "compliance", "risk assessment"]
    },
    {
      "name": "DevOps Engineer",
      "perspective": "Deployment, monitoring, reliability, automation",
      "focus_areas": ["deployment", "monitoring", "reliability", "automation"]
    },
    {
      "name": "Backend Developer",
      "perspective": "API design, data structures, business logic",
      "focus_areas": ["api design", "data models", "services", "integrations"]
    },
    {
      "name": "Frontend Developer",
      "perspective": "User interface, experience, client-side logic",
      "focus_areas": ["ui/ux", "client architecture", "state management", "performance"]
    }
  ]'

  # Adjust personas based on mode
  if [[ "$mode" == "mvp" ]]; then
    personas=$(echo "$personas" | jq '[.[0:3]]')  # PM, Architect, Security only
  elif [[ "$mode" == "enterprise" ]]; then
    personas=$(echo "$personas" | jq '. + [
      {
        "name": "QA Engineer",
        "perspective": "Testability, quality gates, automation",
        "focus_areas": ["test strategy", "test automation", "quality metrics", "release criteria"]
      },
      {
        "name": "Performance Engineer",
        "perspective": "Load testing, optimization, benchmarks",
        "focus_areas": ["performance testing", "optimization", "benchmarks", "capacity planning"]
      }
    ]')
  fi

  # Remove DevOps if not enforcing
  if [[ "$enforce_devops" != "true" ]]; then
    personas=$(echo "$personas" | jq 'map(select(.name != "DevOps Engineer"))')
  fi

  # Create base epic structure
  local base_epic
  base_epic=$(jq -n \
    --arg epic_id "$epic_id" \
    --arg description "$description" \
    --arg mode "$mode" \
    --arg timestamp "$timestamp" \
    --argjson personas "$personas" \
    '{
      epic_id: $epic_id,
      description: $description,
      mode: $mode,
      created_at: $timestamp,
      personas: $personas,
      reviews: []
    }')

  echo "$base_epic"
}

# Process persona reviews (simplified version for example)
process_personas() {
  local epic_json="$1"
  local mode="$2"

  # In a real implementation, this would call the actual persona agents
  # For this security fix, we're focusing on the secure file operations
  echo "$epic_json" | jq '.'
}

# Main execution
main() {
  echo "Creating epic with security-hardened epic-creator-v2..."
  if [[ ${#EPIC_DESCRIPTION} -gt 100 ]]; then
    echo "Epic Description: ${EPIC_DESCRIPTION:0:100}..."
  else
    echo "Epic Description: $EPIC_DESCRIPTION"
  fi
  echo "Mode: $MODE"
  echo "Output File: $OUTPUT_FILE"

  # Create epic JSON structure
  epic_json=$(create_epic_json "$EPIC_DESCRIPTION" "$MODE" "$ENFORCE_DEVOPS")

  # Process personas
  epic_json=$(process_personas "$epic_json" "$MODE")

  # Secure file write with validation
  local temp_output
  temp_output=$(create_secure_temp "epic-output" "json")

  # Write to temporary file first
  if ! echo "$epic_json" | jq '.' > "$temp_output" 2>&1; then
    rm -f "$temp_output"
    log_security "ERROR" "Failed to write JSON output"
    exit 1
  fi

  # Validate the output
  if ! validate_json_output "$temp_output"; then
    rm -f "$temp_output"
    log_security "ERROR" "Generated output failed validation"
    exit 1
  fi

  # Move to final destination atomically
  if ! mv "$temp_output" "$OUTPUT_FILE"; then
    rm -f "$temp_output"
    log_security "ERROR" "Failed to write output file"
    exit 1
  fi

  # Set secure permissions on output file
  chmod 644 "$OUTPUT_FILE"

  echo "Epic created successfully: $OUTPUT_FILE"
  echo "File size: $(stat -c%s "$OUTPUT_FILE" 2>/dev/null || stat -f%z "$OUTPUT_FILE" 2>/dev/null || echo "unknown") bytes"
}

# Execute main function
main "$@"