#!/bin/bash
# Build all team-specific Docker images
# Usage: ./build-all-teams.sh [--no-cache] [--push]

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

# Parse arguments
NO_CACHE=""
PUSH=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --push)
            PUSH=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--no-cache] [--push]"
            exit 1
            ;;
    esac
done

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "Building Team-Specific CFN Agent Images"
echo "========================================"
echo ""

# Build base image first
echo -e "${YELLOW}Building base image...${NC}"
if ./.claude/skills/docker-build/build.sh \
    --dockerfile docker/teams/base/Dockerfile.base \
    --tag cfn-agent:base \
    ${NO_CACHE}; then
    echo -e "${GREEN}✓ Base image built successfully${NC}"
else
    echo -e "${RED}✗ Base image build failed${NC}"
    exit 1
fi

echo ""

# Define teams to build
TEAMS=("engineering" "marketing" "data")

# Build each team image
for team in "${TEAMS[@]}"; do
    echo -e "${YELLOW}Building ${team} team image...${NC}"

    if docker build ${NO_CACHE} \
        -f "docker/teams/${team}/Dockerfile" \
        -t "cfn-agent-${team}:latest" \
        --build-arg TEAM_NAME="${team}" \
        "docker/teams/${team}/"; then
        echo -e "${GREEN}✓ ${team} team image built successfully${NC}"

        # Tag with date
        DATE_TAG=$(date +%Y-%m-%d)
        docker tag "cfn-agent-${team}:latest" "cfn-agent-${team}:${DATE_TAG}"
        echo -e "${GREEN}  Tagged as cfn-agent-${team}:${DATE_TAG}${NC}"
    else
        echo -e "${RED}✗ ${team} team image build failed${NC}"
        exit 1
    fi

    echo ""
done

# Show built images
echo "========================================"
echo "Built Images:"
echo "========================================"
docker images | grep "cfn-agent" | head -10

# Push to registry if requested
if [[ "$PUSH" == true ]]; then
    echo ""
    echo -e "${YELLOW}Pushing images to registry...${NC}"

    # Check if DOCKER_REGISTRY is set
    if [[ -z "${DOCKER_REGISTRY:-}" ]]; then
        echo -e "${RED}Error: DOCKER_REGISTRY environment variable not set${NC}"
        echo "Set it to your registry URL (e.g., docker.io/company or myregistry.com)"
        exit 1
    fi

    for team in "${TEAMS[@]}"; do
        echo -e "${YELLOW}Pushing ${team} team image...${NC}"

        # Tag for registry
        docker tag "cfn-agent-${team}:latest" "${DOCKER_REGISTRY}/cfn-agent-${team}:latest"

        # Push
        if docker push "${DOCKER_REGISTRY}/cfn-agent-${team}:latest"; then
            echo -e "${GREEN}✓ ${team} team image pushed successfully${NC}"
        else
            echo -e "${RED}✗ ${team} team image push failed${NC}"
            exit 1
        fi
    done
fi

echo ""
echo -e "${GREEN}========================================"
echo "All team images built successfully!"
echo "========================================${NC}"
echo ""
echo "To run an agent:"
echo "  docker run --rm cfn-agent-engineering:latest backend-developer \"Fix auth bug\""
echo ""
echo "To validate images:"
echo "  ./docker/teams/scripts/validate-team-image.sh engineering"
