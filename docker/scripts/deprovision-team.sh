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
# deprovision-team.sh - Deprovision a CFN Docker team
#
# Usage: ./docker/scripts/deprovision-team.sh --team TEAM_ID [OPTIONS]
#
# Options:
#   --team ID              Team ID to deprovision (required)
#   --archive-workspace    Archive workspace to /tmp before cleanup
#   --remove-workspace     Delete workspace directory (DESTRUCTIVE)
#   --remove-network       Remove Docker network
#   --remove-firewall      Remove firewall rules
#   --dry-run              Show what would be done without executing
#   --force                Skip confirmation prompt
#   --help                 Show this help message

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values
TEAM_ID=""
ARCHIVE_WORKSPACE=false
REMOVE_WORKSPACE=false
REMOVE_NETWORK=false
REMOVE_FIREWALL=false
DRY_RUN=false
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --team)
      TEAM_ID="$2"
      shift 2
      ;;
    --archive-workspace)
      ARCHIVE_WORKSPACE=true
      shift
      ;;
    --remove-workspace)
      REMOVE_WORKSPACE=true
      shift
      ;;
    --remove-network)
      REMOVE_NETWORK=true
      shift
      ;;
    --remove-firewall)
      REMOVE_FIREWALL=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Error: Unknown option $1" >&2
      echo "Run with --help for usage information" >&2
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$TEAM_ID" ]]; then
  echo "Error: --team is required" >&2
  echo "Run with --help for usage information" >&2
  exit 1
fi

# Confirmation prompt
if ! $FORCE && ! $DRY_RUN; then
  echo "⚠️  WARNING: You are about to deprovision team '$TEAM_ID'"
  echo ""
  echo "This will:"
  echo "  - Stop and remove team coordinator"
  echo "  - Stop and remove all team agents"
  echo "  - Stop and remove team Redis"
  echo "  - Mark team as inactive in database"
  if $REMOVE_WORKSPACE; then
    echo "  - DELETE workspace directory (IRREVERSIBLE)"
  elif $ARCHIVE_WORKSPACE; then
    echo "  - Archive workspace to /tmp"
  else
    echo "  - Preserve workspace directory"
  fi
  if $REMOVE_NETWORK; then
    echo "  - Remove Docker network"
  fi
  if $REMOVE_FIREWALL; then
    echo "  - Remove firewall rules"
  fi
  echo ""
  read -p "Are you sure? Type 'yes' to continue: " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi
  echo ""
fi

# Dry run check
if $DRY_RUN; then
  echo "🔍 DRY RUN MODE - No changes will be made"
  echo ""
fi

echo "🗑️  Deprovisioning team: $TEAM_ID"
echo ""

# Step 1: Stop team coordinator
echo "Step 1: Stopping team coordinator..."
COORDINATOR_NAME="cfn-docker-team-coordinator-$TEAM_ID"

if $DRY_RUN; then
  echo "  [DRY RUN] Would stop: $COORDINATOR_NAME"
else
  if docker ps -a --filter "name=$COORDINATOR_NAME" --format '{{.Names}}' | grep -q "$COORDINATOR_NAME"; then
    docker stop "$COORDINATOR_NAME" 2>/dev/null || true
    docker rm "$COORDINATOR_NAME" 2>/dev/null || true
    echo "  ✓ Stopped and removed: $COORDINATOR_NAME"
  else
    echo "  ℹ️  Coordinator not found: $COORDINATOR_NAME"
  fi
fi
echo ""

# Step 2: Stop all team agents
echo "Step 2: Stopping all team agents..."

if $DRY_RUN; then
  echo "  [DRY RUN] Would stop all containers with label cfn.team=$TEAM_ID"
else
  AGENT_IDS=$(docker ps -a --filter "label=cfn.team=$TEAM_ID" -q)
  if [[ -n "$AGENT_IDS" ]]; then
    echo "$AGENT_IDS" | xargs docker stop 2>/dev/null || true
    echo "$AGENT_IDS" | xargs docker rm 2>/dev/null || true
    echo "  ✓ Stopped and removed $(echo "$AGENT_IDS" | wc -l) agent(s)"
  else
    echo "  ℹ️  No agents found for team $TEAM_ID"
  fi
fi
echo ""

# Step 3: Stop team Redis
echo "Step 3: Stopping team Redis..."
REDIS_NAME="cfn-redis-$TEAM_ID"

if $DRY_RUN; then
  echo "  [DRY RUN] Would stop: $REDIS_NAME"
else
  if docker ps -a --filter "name=$REDIS_NAME" --format '{{.Names}}' | grep -q "$REDIS_NAME"; then
    docker stop "$REDIS_NAME" 2>/dev/null || true
    docker rm "$REDIS_NAME" 2>/dev/null || true
    echo "  ✓ Stopped and removed: $REDIS_NAME"
  else
    echo "  ℹ️  Redis not found: $REDIS_NAME"
  fi
fi
echo ""

# Step 4: Mark team as inactive in database
echo "Step 4: Marking team as inactive in database..."

if $DRY_RUN; then
  echo "  [DRY RUN] Would update teams table: status='inactive' WHERE id='$TEAM_ID'"
else
  if docker ps --filter "name=cfn-postgres" --format '{{.Names}}' | grep -q "cfn-postgres"; then
    docker exec cfn-postgres psql -U cfn_admin -d cfn_corporate -c \
      "UPDATE teams SET status='inactive', deprovisioned_at=NOW() WHERE id='$TEAM_ID';" 2>/dev/null || echo "  ⚠ Database update skipped (table may not exist yet)"
    echo "  ✓ Marked team as inactive in database"
  else
    echo "  ⚠ PostgreSQL not running, skipping database update"
  fi
fi
echo ""

# Step 5: Handle workspace
echo "Step 5: Handling workspace..."

# Find workspace path from config
WORKSPACE_PATH="/workspace/$TEAM_ID"

if $ARCHIVE_WORKSPACE; then
  if $DRY_RUN; then
    echo "  [DRY RUN] Would archive: $WORKSPACE_PATH -> /tmp/${TEAM_ID}-workspace-$(date +%Y%m%d).tar.gz"
  else
    if [[ -d "$WORKSPACE_PATH" ]]; then
      ARCHIVE_FILE="/tmp/${TEAM_ID}-workspace-$(date +%Y%m%d-%H%M%S).tar.gz"
      sudo tar -czf "$ARCHIVE_FILE" -C "$(dirname "$WORKSPACE_PATH")" "$(basename "$WORKSPACE_PATH")"
      echo "  ✓ Archived workspace to: $ARCHIVE_FILE"
    else
      echo "  ℹ️  Workspace not found: $WORKSPACE_PATH"
    fi
  fi
elif $REMOVE_WORKSPACE; then
  if $DRY_RUN; then
    echo "  [DRY RUN] Would DELETE: $WORKSPACE_PATH (IRREVERSIBLE)"
  else
    if [[ -d "$WORKSPACE_PATH" ]]; then
      sudo rm -rf "$WORKSPACE_PATH"
      echo "  ✓ Deleted workspace: $WORKSPACE_PATH"
    else
      echo "  ℹ️  Workspace not found: $WORKSPACE_PATH"
    fi
  fi
else
  echo "  ℹ️  Workspace preserved at: $WORKSPACE_PATH"
fi
echo ""

# Step 6: Remove Docker network (optional)
if $REMOVE_NETWORK; then
  echo "Step 6: Removing Docker network..."
  NETWORK_NAME="team-$TEAM_ID"

  if $DRY_RUN; then
    echo "  [DRY RUN] Would remove network: $NETWORK_NAME"
  else
    if docker network inspect "$NETWORK_NAME" &>/dev/null; then
      docker network rm "$NETWORK_NAME" 2>/dev/null || echo "  ⚠ Network still in use by containers"
      echo "  ✓ Removed network: $NETWORK_NAME"
    else
      echo "  ℹ️  Network not found: $NETWORK_NAME"
    fi
  fi
  echo ""
fi

# Step 7: Remove firewall rules (optional)
if $REMOVE_FIREWALL; then
  echo "Step 7: Removing firewall rules..."

  # Find subnet ID from config or use default pattern
  SUBNET_ID=$(grep -l "id: $TEAM_ID" "$PROJECT_ROOT"/docker/config/teams/*.yaml 2>/dev/null | head -1 | xargs yq '.team.network.subnet_id' 2>/dev/null || echo "")

  if [[ -n "$SUBNET_ID" ]]; then
    if $DRY_RUN; then
      echo "  [DRY RUN] Would remove iptables rules for subnet 172.18.$SUBNET_ID.0/24"
    else
      sudo iptables -D DOCKER-USER -s "172.18.$SUBNET_ID.11/28" -d "172.18.$SUBNET_ID.10" -j ACCEPT 2>/dev/null || true
      sudo iptables -D DOCKER-USER -s "172.18.$SUBNET_ID.11/28" -d "172.18.$SUBNET_ID.20" -j ACCEPT 2>/dev/null || true

      for other_subnet in 1 2 3 4 5 6 7; do
        if [[ $other_subnet -ne $SUBNET_ID ]]; then
          sudo iptables -D DOCKER-USER -s "172.18.$SUBNET_ID.11/28" -d "172.18.$other_subnet.0/24" -j DROP 2>/dev/null || true
        fi
      done

      sudo iptables -D DOCKER-USER -s "172.18.$SUBNET_ID.11/28" -d "172.18.0.0/24" -j DROP 2>/dev/null || true

      echo "  ✓ Removed firewall rules"
    fi
  else
    echo "  ⚠ Could not determine subnet ID, skipping firewall cleanup"
  fi
  echo ""
fi

# Summary
echo "✅ Team deprovisioning complete!"
echo ""
echo "Summary:"
echo "  Team ID: $TEAM_ID"
echo "  Status: inactive"
if $ARCHIVE_WORKSPACE; then
  echo "  Workspace: archived to /tmp"
elif $REMOVE_WORKSPACE; then
  echo "  Workspace: deleted"
else
  echo "  Workspace: preserved at $WORKSPACE_PATH"
fi
echo ""
echo "Containers removed:"
echo "  - cfn-docker-team-coordinator-$TEAM_ID"
echo "  - cfn-redis-$TEAM_ID"
echo "  - All team agents"
echo ""
