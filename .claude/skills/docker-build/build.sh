#!/bin/bash
# Docker Build Skill - Fast builds using Linux native storage
set -euo pipefail

# Defaults
DOCKERFILE="docker/agent/Dockerfile"
TAG="claude-flow-novice:agent"
NO_CACHE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dockerfile)
            DOCKERFILE="$2"
            shift 2
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--dockerfile <path>] [--tag <name>] [--no-cache]"
            exit 1
            ;;
    esac
done

echo "🐳 Docker Build Skill"
echo "===================="
echo "Dockerfile: $DOCKERFILE"
echo "Tag: $TAG"
echo "No Cache: ${NO_CACHE:-false}"
echo ""

# Get project root (skill is in .claude/skills/docker-build/)
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

cd "$PROJECT_ROOT"

# Check if Linux build script exists
if [ ! -f "./scripts/docker/build-from-linux.sh" ]; then
    echo "❌ Error: scripts/docker/build-from-linux.sh not found"
    exit 1
fi

# Export settings for build script
export DOCKERFILE
export TAG
export DOCKER_BUILD_ARGS="$NO_CACHE"

# Run the build
echo "🚀 Starting build process..."
./scripts/docker/build-from-linux.sh

BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ]; then
    echo ""
    echo "✅ Build complete!"
    echo "   Image: $TAG"
    echo ""
    docker images | grep "$(echo $TAG | cut -d: -f1)" | head -3
else
    echo ""
    echo "❌ Build failed with exit code $BUILD_EXIT"
    exit $BUILD_EXIT
fi
