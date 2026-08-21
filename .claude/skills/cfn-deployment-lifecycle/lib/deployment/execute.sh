#!/usr/bin/env bash
# CFN Deployment Skill - Execute Script
# Part of Task 1.1: Automated Skill Deployment Pipeline

set -euo pipefail

# Get skill path from argument or environment
SKILL_PATH="${1:-}"

if [[ -z "$SKILL_PATH" ]]; then
  echo "Error: Skill path is required"
  echo "Usage: $0 <skill-path> [--deployed-by=<user>] [--version=<version>]"
  exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

# Forward to deployment script
exec "$PROJECT_ROOT/scripts/deploy-approved-skills.sh" "$@"
