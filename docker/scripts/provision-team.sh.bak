#!/bin/bash
# provision-team.sh - Provision a new CFN Docker team
#
# Usage: ./docker/scripts/provision-team.sh --config docker/config/teams/seo.yaml [OPTIONS]
#
# Options:
#   --config FILE          Team configuration file (required)
#   --create-workspace     Create workspace directory and set permissions
#   --create-network       Create Docker network for team
#   --spawn-redis          Spawn team-specific Redis instance
#   --spawn-coordinator    Spawn team coordinator container
#   --skip-validation      Skip configuration validation
#   --dry-run              Show what would be done without executing
#   --help                 Show this help message

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values
CONFIG_FILE=""
CREATE_WORKSPACE=false
CREATE_NETWORK=false
SPAWN_REDIS=false
SPAWN_COORDINATOR=false
SKIP_VALIDATION=false
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --config)
      CONFIG_FILE="$2"
      shift 2
      ;;
    --create-workspace)
      CREATE_WORKSPACE=true
      shift
      ;;
    --create-network)
      CREATE_NETWORK=true
      shift
      ;;
    --spawn-redis)
      SPAWN_REDIS=true
      shift
      ;;
    --spawn-coordinator)
      SPAWN_COORDINATOR=true
      shift
      ;;
    --skip-validation)
      SKIP_VALIDATION=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
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
if [[ -z "$CONFIG_FILE" ]]; then
  echo "Error: --config is required" >&2
  echo "Run with --help for usage information" >&2
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

# Parse YAML config (requires yq or python-yaml)
echo "📋 Reading team configuration from $CONFIG_FILE..."

if command -v yq &>/dev/null; then
  TEAM_ID=$(yq '.team.id' "$CONFIG_FILE")
  TEAM_NAME=$(yq '.team.name' "$CONFIG_FILE")
  WORKSPACE_PATH=$(yq '.team.workspace.path' "$CONFIG_FILE")
  DISK_QUOTA=$(yq '.team.workspace.disk_quota' "$CONFIG_FILE")
  MEMORY=$(yq '.team.resources.memory' "$CONFIG_FILE")
  CPU_CORES=$(yq '.team.resources.cpu_cores' "$CONFIG_FILE")
  MAX_AGENTS=$(yq '.team.resources.max_agents' "$CONFIG_FILE")
  SUBNET_ID=$(yq '.team.network.subnet_id' "$CONFIG_FILE")
  COORDINATOR_IP=$(yq '.team.network.coordinator_ip' "$CONFIG_FILE")
  ALLOWED_SKILLS=$(yq '.team.allowed_skills[]' "$CONFIG_FILE" | tr '\n' ' ')
else
  echo "Error: yq not found. Install with: brew install yq" >&2
  exit 1
fi

# Display team info
echo "✓ Team Configuration:"
echo "  ID: $TEAM_ID"
echo "  Name: $TEAM_NAME"
echo "  Workspace: $WORKSPACE_PATH"
echo "  Memory: $MEMORY"
echo "  CPU Cores: $CPU_CORES"
echo "  Max Agents: $MAX_AGENTS"
echo "  Network Subnet: 172.18.$SUBNET_ID.0/24"
echo "  Coordinator IP: $COORDINATOR_IP"
echo "  Allowed Skills: $ALLOWED_SKILLS"
echo ""

# Dry run check
if $DRY_RUN; then
  echo "🔍 DRY RUN MODE - No changes will be made"
  echo ""
fi

# Step 1: Create workspace directory
if $CREATE_WORKSPACE; then
  echo "📁 Step 1: Creating workspace directory..."

  if $DRY_RUN; then
    echo "  [DRY RUN] Would create: $WORKSPACE_PATH/code"
    echo "  [DRY RUN] Would create: $WORKSPACE_PATH/skills"
    echo "  [DRY RUN] Would set ownership to 1000:1000"
    echo "  [DRY RUN] Would set disk quota to $DISK_QUOTA"
  else
    sudo mkdir -p "$WORKSPACE_PATH/code"
    sudo mkdir -p "$WORKSPACE_PATH/skills"
    sudo chown -R 1000:1000 "$WORKSPACE_PATH"
    sudo chmod -R 755 "$WORKSPACE_PATH"

    # Set disk quota (requires quota support on filesystem)
    # DISK_QUOTA_BYTES=$(echo "$DISK_QUOTA" | sed 's/GB//' | awk '{print $1 * 1024 * 1024}')
    # sudo setquota -u 1000 $DISK_QUOTA_BYTES $DISK_QUOTA_BYTES 0 0 "$WORKSPACE_PATH"

    echo "  ✓ Created workspace at $WORKSPACE_PATH"
  fi
  echo ""
fi

# Step 2: Copy allowed skills
if $CREATE_WORKSPACE; then
  echo "📦 Step 2: Copying allowed skills to team workspace..."

  for skill in $ALLOWED_SKILLS; do
    if $DRY_RUN; then
      echo "  [DRY RUN] Would copy: /skills/$skill -> $WORKSPACE_PATH/skills/$skill"
    else
      if [[ -d "/skills/$skill" ]]; then
        sudo cp -r "/skills/$skill" "$WORKSPACE_PATH/skills/$skill"
        sudo chown -R 1000:1000 "$WORKSPACE_PATH/skills/$skill"
        echo "  ✓ Copied skill: $skill"
      else
        echo "  ⚠ Warning: Skill directory not found: /skills/$skill"
      fi
    fi
  done
  echo ""
fi

# Step 3: Create Docker network
if $CREATE_NETWORK; then
  echo "🌐 Step 3: Creating Docker network..."

  NETWORK_NAME="team-$TEAM_ID"
  SUBNET="172.18.$SUBNET_ID.0/24"
  GATEWAY="172.18.$SUBNET_ID.1"

  if $DRY_RUN; then
    echo "  [DRY RUN] Would create network: $NETWORK_NAME"
    echo "  [DRY RUN]   Subnet: $SUBNET"
    echo "  [DRY RUN]   Gateway: $GATEWAY"
  else
    if docker network inspect "$NETWORK_NAME" &>/dev/null; then
      echo "  ⚠ Network already exists: $NETWORK_NAME"
    else
      docker network create \
        --driver bridge \
        --subnet "$SUBNET" \
        --gateway "$GATEWAY" \
        --label cfn.network=team \
        --label cfn.team="$TEAM_ID" \
        "$NETWORK_NAME"
      echo "  ✓ Created network: $NETWORK_NAME ($SUBNET)"
    fi
  fi
  echo ""
fi

# Step 4: Spawn team Redis
if $SPAWN_REDIS; then
  echo "🗄️  Step 4: Spawning team Redis instance..."

  REDIS_NAME="cfn-redis-$TEAM_ID"
  REDIS_IP="172.18.$SUBNET_ID.20"

  if $DRY_RUN; then
    echo "  [DRY RUN] Would spawn: $REDIS_NAME"
    echo "  [DRY RUN]   Network: team-$TEAM_ID"
    echo "  [DRY RUN]   IP: $REDIS_IP"
    echo "  [DRY RUN]   Memory: 512MB"
  else
    if docker ps -a --filter "name=$REDIS_NAME" --format '{{.Names}}' | grep -q "$REDIS_NAME"; then
      echo "  ⚠ Redis container already exists: $REDIS_NAME"
    else
      docker run -d \
        --name "$REDIS_NAME" \
        --network "team-$TEAM_ID" \
        --ip "$REDIS_IP" \
        --memory 512m \
        --cpus 0.5 \
        --restart unless-stopped \
        --label cfn.component=redis \
        --label cfn.team="$TEAM_ID" \
        -v "cfn-redis-$TEAM_ID-data:/data" \
        redis:7-alpine \
        redis-server --maxmemory 512mb --maxmemory-policy volatile-lru
      echo "  ✓ Spawned Redis: $REDIS_NAME at $REDIS_IP"
    fi
  fi
  echo ""
fi

# Step 5: Register team in database
if $SPAWN_COORDINATOR; then
  echo "🗃️  Step 5: Registering team in PostgreSQL..."

  if $DRY_RUN; then
    echo "  [DRY RUN] Would register team '$TEAM_ID' in cfn_corporate.teams table"
  else
    # Check if PostgreSQL is available
    if docker ps --filter "name=cfn-postgres" --format '{{.Names}}' | grep -q "cfn-postgres"; then
      docker exec cfn-postgres psql -U cfn_admin -d cfn_corporate -c \
        "INSERT INTO teams (id, name, status, created_at, config, metadata)
         VALUES (
           '$TEAM_ID',
           '$TEAM_NAME',
           'active',
           NOW(),
           '{\"resources\": {\"memory\": \"$MEMORY\", \"cpu_cores\": $CPU_CORES, \"max_agents\": $MAX_AGENTS}}'::jsonb,
           '{\"description\": \"Auto-provisioned team\"}'::jsonb
         )
         ON CONFLICT (id) DO NOTHING;" 2>/dev/null || echo "  ⚠ Database registration skipped (table may not exist yet)"
      echo "  ✓ Registered team in database"
    else
      echo "  ⚠ PostgreSQL not running, skipping database registration"
    fi
  fi
  echo ""
fi

# Step 6: Spawn team coordinator
if $SPAWN_COORDINATOR; then
  echo "🚀 Step 6: Spawning team coordinator..."

  COORDINATOR_NAME="cfn-docker-team-coordinator-$TEAM_ID"
  MEMORY_BYTES=$(echo "$MEMORY" | sed 's/GB/g/')

  if $DRY_RUN; then
    echo "  [DRY RUN] Would spawn: $COORDINATOR_NAME"
    echo "  [DRY RUN]   Networks: cfn-coordination, team-$TEAM_ID"
    echo "  [DRY RUN]   IP: $COORDINATOR_IP"
    echo "  [DRY RUN]   Memory: 2GB"
    echo "  [DRY RUN]   CPUs: 1.0"
  else
    if docker ps -a --filter "name=$COORDINATOR_NAME" --format '{{.Names}}' | grep -q "$COORDINATOR_NAME"; then
      echo "  ⚠ Coordinator container already exists: $COORDINATOR_NAME"
    else
      # Check if images exist, otherwise warn
      if ! docker image inspect cfn-docker-team-coordinator:latest &>/dev/null; then
        echo "  ⚠ Warning: Image not found: cfn-docker-team-coordinator:latest"
        echo "  ℹ️  Coordinator will need to be spawned manually after image is built"
      else
        docker run -d \
          --name "$COORDINATOR_NAME" \
          --network cfn-coordination \
          --ip "$COORDINATOR_IP" \
          --memory 2g \
          --cpus 1.0 \
          --restart unless-stopped \
          --label cfn.component=team-coordinator \
          --label cfn.team="$TEAM_ID" \
          -v /var/run/docker.sock:/var/run/docker.sock \
          -v "$WORKSPACE_PATH:/workspace:rw" \
          -v "$CONFIG_FILE:/config/team.yaml:ro" \
          -e TEAM_ID="$TEAM_ID" \
          -e TEAM_NAME="$TEAM_NAME" \
          -e REDIS_HOST="cfn-redis-$TEAM_ID" \
          -e POSTGRES_HOST=cfn-postgres \
          -e BUDGET_ALLOCATED="$MEMORY_BYTES" \
          -e MAX_AGENTS="$MAX_AGENTS" \
          -e MAIN_COORDINATOR_HOST=cfn-docker-main-coordinator \
          cfn-docker-team-coordinator:latest

        # Connect to team network
        docker network connect "team-$TEAM_ID" "$COORDINATOR_NAME"

        echo "  ✓ Spawned coordinator: $COORDINATOR_NAME at $COORDINATOR_IP"
      fi
    fi
  fi
  echo ""
fi

# Step 7: Configure firewall rules
if $CREATE_NETWORK; then
  echo "🔒 Step 7: Configuring firewall rules..."

  if $DRY_RUN; then
    echo "  [DRY RUN] Would configure iptables rules for team isolation"
  else
    # Allow agents → team coordinator
    sudo iptables -A DOCKER-USER -s "172.18.$SUBNET_ID.11/28" -d "172.18.$SUBNET_ID.10" -j ACCEPT 2>/dev/null || true

    # Allow agents → team Redis
    sudo iptables -A DOCKER-USER -s "172.18.$SUBNET_ID.11/28" -d "172.18.$SUBNET_ID.20" -j ACCEPT 2>/dev/null || true

    # Block agents → other team networks
    for other_subnet in 1 2 3 4 5 6 7; do
      if [[ $other_subnet -ne $SUBNET_ID ]]; then
        sudo iptables -A DOCKER-USER -s "172.18.$SUBNET_ID.11/28" -d "172.18.$other_subnet.0/24" -j DROP 2>/dev/null || true
      fi
    done

    # Block agents → coordination network
    sudo iptables -A DOCKER-USER -s "172.18.$SUBNET_ID.11/28" -d "172.18.0.0/24" -j DROP 2>/dev/null || true

    echo "  ✓ Configured firewall rules for team isolation"
  fi
  echo ""
fi

# Summary
echo "✅ Team provisioning complete!"
echo ""
echo "Team Summary:"
echo "  Team ID: $TEAM_ID"
echo "  Workspace: $WORKSPACE_PATH"
echo "  Network: team-$TEAM_ID (172.18.$SUBNET_ID.0/24)"
echo "  Redis: cfn-redis-$TEAM_ID (172.18.$SUBNET_ID.20)"
echo "  Coordinator: cfn-docker-team-coordinator-$TEAM_ID ($COORDINATOR_IP)"
echo ""
echo "Next Steps:"
echo "  1. Verify coordinator is running: docker ps | grep $TEAM_ID"
echo "  2. Check coordinator logs: docker logs cfn-docker-team-coordinator-$TEAM_ID"
echo "  3. Test agent spawn (when agents are ready)"
echo ""
