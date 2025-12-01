#!/bin/bash
# Build a single team-specific Docker image
# Usage: ./build-team.sh <team-name> [--no-cache] [--push]

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

# Validate arguments
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <team-name> [--no-cache] [--push]"
    echo ""
    echo "Available teams:"
    ls -1 docker/teams/ | grep -v base | grep -v scripts | grep -v README.md
    exit 1
fi

TEAM_NAME="$1"
shift

# Parse additional arguments
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
            echo "Usage: $0 <team-name> [--no-cache] [--push]"
            exit 1
            ;;
    esac
done

# Validate team exists
if [[ ! -d "docker/teams/${TEAM_NAME}" ]]; then
    echo "Error: Team '${TEAM_NAME}' not found"
    echo ""
    echo "Available teams:"
    ls -1 docker/teams/ | grep -v base | grep -v scripts | grep -v README.md
    exit 1
fi

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "Building ${TEAM_NAME} Team Agent Image"
echo "========================================"
echo ""

# Check if base image exists
if ! docker image inspect cfn-agent:base >/dev/null 2>&1; then
    echo -e "${YELLOW}Base image not found, building it first...${NC}"
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
fi

# Build team image
echo -e "${YELLOW}Building ${TEAM_NAME} team image...${NC}"

BUILD_START=$(date +%s)

if docker build ${NO_CACHE} \
    -f "docker/teams/${TEAM_NAME}/Dockerfile" \
    -t "cfn-agent-${TEAM_NAME}:latest" \
    --build-arg TEAM_NAME="${TEAM_NAME}" \
    "docker/teams/${TEAM_NAME}/"; then

    BUILD_END=$(date +%s)
    BUILD_DURATION=$((BUILD_END - BUILD_START))

    echo -e "${GREEN}✓ ${TEAM_NAME} team image built successfully${NC}"
    echo -e "${GREEN}  Build time: ${BUILD_DURATION}s${NC}"

    # Tag with date
    DATE_TAG=$(date +%Y-%m-%d)
    docker tag "cfn-agent-${TEAM_NAME}:latest" "cfn-agent-${TEAM_NAME}:${DATE_TAG}"
    echo -e "${GREEN}  Tagged as cfn-agent-${TEAM_NAME}:${DATE_TAG}${NC}"

    # Show image info
    echo ""
    echo "Image details:"
    docker images "cfn-agent-${TEAM_NAME}:latest" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
else
    echo -e "${RED}✗ ${TEAM_NAME} team image build failed${NC}"
    exit 1
fi

# Push to registry if requested
if [[ "$PUSH" == true ]]; then
    echo ""
    echo -e "${YELLOW}Pushing image to registry...${NC}"

    # Check if DOCKER_REGISTRY is set
    if [[ -z "${DOCKER_REGISTRY:-}" ]]; then
        echo -e "${RED}Error: DOCKER_REGISTRY environment variable not set${NC}"
        echo "Set it to your registry URL (e.g., docker.io/company or myregistry.com)"
        exit 1
    fi

    # Tag for registry
    docker tag "cfn-agent-${TEAM_NAME}:latest" "${DOCKER_REGISTRY}/cfn-agent-${TEAM_NAME}:latest"
    docker tag "cfn-agent-${TEAM_NAME}:${DATE_TAG}" "${DOCKER_REGISTRY}/cfn-agent-${TEAM_NAME}:${DATE_TAG}"

    # Push both tags
    if docker push "${DOCKER_REGISTRY}/cfn-agent-${TEAM_NAME}:latest" && \
       docker push "${DOCKER_REGISTRY}/cfn-agent-${TEAM_NAME}:${DATE_TAG}"; then
        echo -e "${GREEN}✓ ${TEAM_NAME} team image pushed successfully${NC}"
    else
        echo -e "${RED}✗ ${TEAM_NAME} team image push failed${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}========================================"
echo "${TEAM_NAME} team image ready!"
echo "========================================${NC}"
echo ""
echo "To run an agent:"
echo "  docker run --rm cfn-agent-${TEAM_NAME}:latest <agent-type> \"<task>\""
echo ""
echo "To validate the image:"
echo "  ./docker/teams/scripts/validate-team-image.sh ${TEAM_NAME}"
echo ""
echo "To view configuration:"
echo "  docker run --rm cfn-agent-${TEAM_NAME}:latest cat /etc/cfn/team/agents.json"
