#!/bin/bash
# Push team-specific Docker images to registry
# Usage: ./push-team-images.sh [team-name|all] [--registry <url>]

set -euo pipefail

# Parse arguments
TEAM="${1:-all}"
REGISTRY="${DOCKER_REGISTRY:-}"

shift || true

while [[ $# -gt 0 ]]; do
    case $1 in
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [team-name|all] [--registry <url>]"
            exit 1
            ;;
    esac
done

# Validate registry
if [[ -z "$REGISTRY" ]]; then
    echo "Error: No registry specified"
    echo ""
    echo "Specify registry using:"
    echo "  - Environment variable: export DOCKER_REGISTRY=myregistry.com"
    echo "  - Command line flag: --registry myregistry.com"
    echo ""
    echo "Example registries:"
    echo "  - Docker Hub: docker.io/company"
    echo "  - AWS ECR: 123456789.dkr.ecr.us-east-1.amazonaws.com"
    echo "  - GCP Artifact Registry: us-docker.pkg.dev/project-id/repo"
    echo "  - Azure ACR: myregistry.azurecr.io"
    exit 1
fi

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Determine teams to push
if [[ "$TEAM" == "all" ]]; then
    TEAMS=("engineering" "marketing" "data")
else
    # Validate team exists
    if [[ ! -d "docker/teams/${TEAM}" ]]; then
        echo -e "${RED}Error: Team '${TEAM}' not found${NC}"
        echo ""
        echo "Available teams:"
        ls -1 docker/teams/ | grep -v base | grep -v scripts | grep -v README.md
        exit 1
    fi
    TEAMS=("$TEAM")
fi

echo "========================================"
echo "Pushing Team Images to Registry"
echo "========================================"
echo "Registry: $REGISTRY"
echo "Teams: ${TEAMS[*]}"
echo ""

# Push each team image
for team in "${TEAMS[@]}"; do
    IMAGE_NAME="cfn-agent-${team}"

    echo -e "${YELLOW}Processing ${team} team...${NC}"

    # Check if local image exists
    if ! docker image inspect "${IMAGE_NAME}:latest" >/dev/null 2>&1; then
        echo -e "${RED}✗ Local image ${IMAGE_NAME}:latest not found${NC}"
        echo "  Build it first: ./docker/teams/scripts/build-team.sh ${team}"
        continue
    fi

    # Get image tags
    DATE_TAG=$(docker image inspect "${IMAGE_NAME}:latest" --format '{{.Created}}' | cut -d'T' -f1)

    # Tag for registry
    echo "  Tagging for registry..."
    docker tag "${IMAGE_NAME}:latest" "${REGISTRY}/${IMAGE_NAME}:latest"
    docker tag "${IMAGE_NAME}:latest" "${REGISTRY}/${IMAGE_NAME}:${DATE_TAG}"

    # Push latest tag
    echo "  Pushing ${IMAGE_NAME}:latest..."
    if docker push "${REGISTRY}/${IMAGE_NAME}:latest"; then
        echo -e "${GREEN}  ✓ Pushed ${IMAGE_NAME}:latest${NC}"
    else
        echo -e "${RED}  ✗ Failed to push ${IMAGE_NAME}:latest${NC}"
        continue
    fi

    # Push date tag
    echo "  Pushing ${IMAGE_NAME}:${DATE_TAG}..."
    if docker push "${REGISTRY}/${IMAGE_NAME}:${DATE_TAG}"; then
        echo -e "${GREEN}  ✓ Pushed ${IMAGE_NAME}:${DATE_TAG}${NC}"
    else
        echo -e "${RED}  ✗ Failed to push ${IMAGE_NAME}:${DATE_TAG}${NC}"
        continue
    fi

    echo -e "${GREEN}✓ ${team} team image pushed successfully${NC}"
    echo ""
done

echo "========================================"
echo "Push Complete"
echo "========================================"
echo ""
echo "Pushed images to: $REGISTRY"
echo ""
echo "To pull an image:"
echo "  docker pull ${REGISTRY}/cfn-agent-engineering:latest"
echo ""
echo "To run from registry:"
echo "  docker run --rm ${REGISTRY}/cfn-agent-engineering:latest backend-developer \"Fix bug\""
