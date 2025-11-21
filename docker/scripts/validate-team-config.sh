#!/bin/bash
#
# DEPRECATION NOTICE
# ==================
# This shell script is DEPRECATED and should no longer be used.
# Please use the TypeScript implementation instead:
#
#   src/docker/build/   - TypeScript build modules
#   src/docker/scripts/ - TypeScript script modules
#
# The TypeScript versions provide:
#   - Full type safety with TypeScript
#   - Better error handling and validation
#   - Unit test coverage
#   - Consistent environment variable contracts
#
# Migration guide: See docs/SHELL_TO_TYPESCRIPT_MIGRATION.md
#
#!/bin/bash
# validate-team-config.sh - Validate a team configuration file
#
# Usage: ./docker/scripts/validate-team-config.sh CONFIG_FILE

set -euo pipefail

CONFIG_FILE="${1:-}"

if [[ -z "$CONFIG_FILE" ]]; then
  echo "Usage: $0 CONFIG_FILE" >&2
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: File not found: $CONFIG_FILE" >&2
  exit 1
fi

echo "Validating team configuration: $CONFIG_FILE"
echo ""

# Check if yq is available
if ! command -v yq &>/dev/null; then
  echo "Error: yq not found. Install with: brew install yq" >&2
  exit 1
fi

# Validation counters
ERRORS=0
WARNINGS=0

# Required fields
echo "Checking required fields..."
REQUIRED_FIELDS=(
  ".team.id"
  ".team.name"
  ".team.workspace.path"
  ".team.resources.memory"
  ".team.resources.cpu_cores"
  ".team.resources.max_agents"
  ".team.network.subnet_id"
  ".team.network.coordinator_ip"
)

for field in "${REQUIRED_FIELDS[@]}"; do
  value=$(yq -r "$field" "$CONFIG_FILE" 2>/dev/null || echo "null")
  if [[ "$value" == "null" || -z "$value" ]]; then
    echo "  ✗ Missing required field: $field"
    ((ERRORS++))
  else
    echo "  ✓ Found: $field = $value"
  fi
done
echo ""

# Validate team ID format
echo "Validating team ID format..."
TEAM_ID=$(yq -r '.team.id' "$CONFIG_FILE")
if [[ "$TEAM_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "  ✓ Team ID format valid: $TEAM_ID"
else
  echo "  ✗ Team ID must be lowercase alphanumeric with hyphens: $TEAM_ID"
  ((ERRORS++))
fi
echo ""

# Validate subnet ID range
echo "Validating network configuration..."
SUBNET_ID=$(yq -r '.team.network.subnet_id' "$CONFIG_FILE")
if [[ "$SUBNET_ID" -ge 1 && "$SUBNET_ID" -le 254 ]]; then
  echo "  ✓ Subnet ID in valid range: $SUBNET_ID"
else
  echo "  ✗ Subnet ID must be between 1 and 254: $SUBNET_ID"
  ((ERRORS++))
fi

# Validate coordinator IP matches subnet
COORDINATOR_IP=$(yq -r '.team.network.coordinator_ip' "$CONFIG_FILE")
EXPECTED_NETWORK="172.18.0"
if [[ "$COORDINATOR_IP" == "$EXPECTED_NETWORK."* ]]; then
  echo "  ✓ Coordinator IP in coordination network: $COORDINATOR_IP"
else
  echo "  ⚠ Coordinator IP should be in $EXPECTED_NETWORK.0/24 network: $COORDINATOR_IP"
  ((WARNINGS++))
fi
echo ""

# Validate resource allocations
echo "Validating resource allocations..."
MEMORY=$(yq -r '.team.resources.memory' "$CONFIG_FILE")
CPU_CORES=$(yq -r '.team.resources.cpu_cores' "$CONFIG_FILE")
MAX_AGENTS=$(yq -r '.team.resources.max_agents' "$CONFIG_FILE")

if [[ "$MEMORY" =~ ^[0-9]+GB$ ]]; then
  echo "  ✓ Memory format valid: $MEMORY"
else
  echo "  ✗ Memory must be in format '12GB': $MEMORY"
  ((ERRORS++))
fi

if [[ "$CPU_CORES" =~ ^[0-9]+$ && "$CPU_CORES" -gt 0 ]]; then
  echo "  ✓ CPU cores valid: $CPU_CORES"
else
  echo "  ✗ CPU cores must be positive integer: $CPU_CORES"
  ((ERRORS++))
fi

if [[ "$MAX_AGENTS" =~ ^[0-9]+$ && "$MAX_AGENTS" -gt 0 ]]; then
  echo "  ✓ Max agents valid: $MAX_AGENTS"
else
  echo "  ✗ Max agents must be positive integer: $MAX_AGENTS"
  ((ERRORS++))
fi
echo ""

# Validate allowed_skills is an array
echo "Validating skills configuration..."
SKILLS_COUNT=$(yq -r '.team.allowed_skills | length' "$CONFIG_FILE" 2>/dev/null || echo "0")
if [[ "$SKILLS_COUNT" -gt 0 ]]; then
  echo "  ✓ Found $SKILLS_COUNT allowed skill(s)"
else
  echo "  ⚠ No allowed skills defined"
  ((WARNINGS++))
fi
echo ""

# Summary
echo "==================================="
if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
  echo "✅ Validation PASSED"
  echo "   Configuration is valid and ready to use."
  exit 0
elif [[ $ERRORS -eq 0 ]]; then
  echo "✅ Validation PASSED (with warnings)"
  echo "   Errors: 0"
  echo "   Warnings: $WARNINGS"
  exit 0
else
  echo "❌ Validation FAILED"
  echo "   Errors: $ERRORS"
  echo "   Warnings: $WARNINGS"
  exit 1
fi
