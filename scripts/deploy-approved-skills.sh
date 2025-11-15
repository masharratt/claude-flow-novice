#!/bin/bash
# Skill Deployment CLI Script
# Part of Task 1.1: Automated Skill Deployment Pipeline
#
# Usage:
#   ./scripts/deploy-approved-skills.sh <skill-path> [--deployed-by=<user>] [--version=<version>]
#
# Examples:
#   ./scripts/deploy-approved-skills.sh .claude/skills/authentication
#   ./scripts/deploy-approved-skills.sh .claude/skills/authentication --version=2.0.0
#   ./scripts/deploy-approved-skills.sh .claude/skills/authentication --deployed-by=admin@example.com

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

usage() {
  cat <<EOF
Skill Deployment CLI Script

Usage:
  $0 <skill-path> [options]

Arguments:
  skill-path        Path to skill directory (required)

Options:
  --deployed-by=<user>    User performing deployment (default: system)
  --version=<version>     Explicit version (default: auto-increment)
  --skip-validation       Skip validation checks (dangerous, admin only)
  --help                  Show this help message

Examples:
  $0 .claude/skills/authentication
  $0 .claude/skills/authentication --version=2.0.0
  $0 .claude/skills/authentication --deployed-by=admin@example.com

EOF
}

# Parse arguments
SKILL_PATH=""
DEPLOYED_BY="system"
EXPLICIT_VERSION=""
SKIP_VALIDATION=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --help)
      usage
      exit 0
      ;;
    --deployed-by=*)
      DEPLOYED_BY="${1#*=}"
      shift
      ;;
    --version=*)
      EXPLICIT_VERSION="${1#*=}"
      shift
      ;;
    --skip-validation)
      SKIP_VALIDATION=true
      shift
      ;;
    -*)
      log_error "Unknown option: $1"
      usage
      exit 1
      ;;
    *)
      if [[ -z "$SKILL_PATH" ]]; then
        SKILL_PATH="$1"
      else
        log_error "Multiple skill paths provided"
        usage
        exit 1
      fi
      shift
      ;;
  esac
done

# Validate required arguments
if [[ -z "$SKILL_PATH" ]]; then
  log_error "Skill path is required"
  usage
  exit 1
fi

# Convert to absolute path
if [[ ! "$SKILL_PATH" =~ ^/ ]]; then
  SKILL_PATH="$PROJECT_ROOT/$SKILL_PATH"
fi

# Validate skill path exists
if [[ ! -d "$SKILL_PATH" ]]; then
  log_error "Skill directory not found: $SKILL_PATH"
  exit 1
fi

log_info "Starting skill deployment"
log_info "Skill path: $SKILL_PATH"
log_info "Deployed by: $DEPLOYED_BY"
[[ -n "$EXPLICIT_VERSION" ]] && log_info "Explicit version: $EXPLICIT_VERSION"
[[ "$SKIP_VALIDATION" == "true" ]] && log_warn "Validation checks disabled"

# Create TypeScript deployment script
DEPLOY_SCRIPT=$(cat <<'TYPESCRIPT'
import { DatabaseService } from './src/lib/database-service';
import { SkillDeploymentPipeline } from './src/services/skill-deployment';
import { createLogger } from './src/lib/logging';
import * as path from 'path';

const logger = createLogger('deploy-script');

async function main() {
  const skillPath = process.env.SKILL_PATH || '';
  const deployedBy = process.env.DEPLOYED_BY || 'system';
  const explicitVersion = process.env.EXPLICIT_VERSION || undefined;
  const skipValidation = process.env.SKIP_VALIDATION === 'true';

  if (!skillPath) {
    console.error('SKILL_PATH environment variable is required');
    process.exit(1);
  }

  // Initialize database service
  const dbService = new DatabaseService({
    sqlite: {
      type: 'sqlite',
      database: path.join(process.cwd(), '.claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db'),
    },
  });

  try {
    await dbService.connect();
    logger.info('Database connected');

    // Create deployment pipeline
    const pipeline = new SkillDeploymentPipeline(dbService);

    // Deploy skill
    const result = await pipeline.deploySkill({
      skillPath,
      deployedBy,
      explicitVersion,
      skipValidation,
    });

    if (result.success) {
      console.log(JSON.stringify({
        success: true,
        skillId: result.skillId,
        skillName: result.skillName,
        version: result.version,
        deploymentId: result.deploymentId,
      }, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify({
        success: false,
        error: result.error,
        validationErrors: result.validationResult?.errors || [],
      }, null, 2));
      process.exit(1);
    }
  } catch (error) {
    logger.error('Deployment script failed', error as Error);
    console.error(JSON.stringify({
      success: false,
      error: (error as Error).message,
    }, null, 2));
    process.exit(1);
  } finally {
    await dbService.disconnect();
  }
}

main();
TYPESCRIPT
)

# Create temporary TypeScript file
TEMP_TS_FILE="$PROJECT_ROOT/.tmp-deploy-skill-$$.ts"
echo "$DEPLOY_SCRIPT" > "$TEMP_TS_FILE"

# Export environment variables for TypeScript script
export SKILL_PATH
export DEPLOYED_BY
export EXPLICIT_VERSION
export SKIP_VALIDATION

log_info "Running deployment pipeline..."

# Run TypeScript deployment script
cd "$PROJECT_ROOT"

# Check if ts-node is available
if ! command -v npx &> /dev/null; then
  log_error "npx command not found. Please install Node.js and npm."
  rm -f "$TEMP_TS_FILE"
  exit 1
fi

# Execute deployment
if OUTPUT=$(npx ts-node "$TEMP_TS_FILE" 2>&1); then
  # Parse result
  echo "$OUTPUT" | tail -1 > /tmp/deploy-result.json

  if grep -q '"success": true' /tmp/deploy-result.json; then
    SKILL_ID=$(echo "$OUTPUT" | tail -1 | grep -o '"skillId": "[^"]*"' | cut -d'"' -f4)
    SKILL_NAME=$(echo "$OUTPUT" | tail -1 | grep -o '"skillName": "[^"]*"' | cut -d'"' -f4)
    VERSION=$(echo "$OUTPUT" | tail -1 | grep -o '"version": "[^"]*"' | cut -d'"' -f4)

    log_success "Skill deployed successfully!"
    echo ""
    echo "Skill ID: $SKILL_ID"
    echo "Skill Name: $SKILL_NAME"
    echo "Version: $VERSION"
    echo ""

    rm -f "$TEMP_TS_FILE" /tmp/deploy-result.json
    exit 0
  else
    log_error "Deployment failed"
    echo "$OUTPUT" | tail -1

    rm -f "$TEMP_TS_FILE" /tmp/deploy-result.json
    exit 1
  fi
else
  log_error "Deployment script execution failed"
  echo "$OUTPUT"

  rm -f "$TEMP_TS_FILE" /tmp/deploy-result.json
  exit 1
fi
