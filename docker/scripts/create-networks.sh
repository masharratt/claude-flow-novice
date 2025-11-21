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
# create-networks.sh - Create all CFN Docker networks
#
# Usage: ./docker/scripts/create-networks.sh [--dry-run]

set -euo pipefail

DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🔍 DRY RUN MODE - No changes will be made"
  echo ""
fi

echo "🌐 Creating CFN Docker Networks"
echo ""

# Function to create a network
create_network() {
  local name=$1
  local subnet=$2
  local gateway=$3
  local network_type=$4

  if $DRY_RUN; then
    echo "  [DRY RUN] Would create: $name"
    echo "  [DRY RUN]   Subnet: $subnet"
    echo "  [DRY RUN]   Gateway: $gateway"
    echo "  [DRY RUN]   Type: $network_type"
  else
    if docker network inspect "$name" &>/dev/null; then
      echo "  ℹ️  Network already exists: $name"
    else
      docker network create \
        --driver bridge \
        --subnet "$subnet" \
        --gateway "$gateway" \
        --label cfn.network="$network_type" \
        "$name"
      echo "  ✓ Created: $name ($subnet)"
    fi
  fi
}

# Coordination network (main coordinator + team coordinators)
echo "Creating coordination network..."
create_network "cfn-coordination" "172.18.0.0/24" "172.18.0.1" "coordination"
echo ""

# Team networks
echo "Creating team networks..."

# Frontend
create_network "team-frontend" "172.18.1.0/24" "172.18.1.1" "team"

# Backend
create_network "team-backend" "172.18.2.0/24" "172.18.2.1" "team"

# DevOps
create_network "team-devops" "172.18.3.0/24" "172.18.3.1" "team"

# QA
create_network "team-qa" "172.18.4.0/24" "172.18.4.1" "team"

# SEO
create_network "team-seo" "172.18.5.0/24" "172.18.5.1" "team"

# Marketing
create_network "team-marketing" "172.18.6.0/24" "172.18.6.1" "team"

# C-Suite
create_network "team-csuite" "172.18.7.0/24" "172.18.7.1" "team"

echo ""
echo "✅ Network creation complete!"
echo ""
echo "Networks created:"
echo "  - cfn-coordination (172.18.0.0/24)"
echo "  - team-frontend (172.18.1.0/24)"
echo "  - team-backend (172.18.2.0/24)"
echo "  - team-devops (172.18.3.0/24)"
echo "  - team-qa (172.18.4.0/24)"
echo "  - team-seo (172.18.5.0/24)"
echo "  - team-marketing (172.18.6.0/24)"
echo "  - team-csuite (172.18.7.0/24)"
echo ""
echo "Verify with: docker network ls | grep 'cfn\|team'"
echo ""
