#!/bin/bash

# Build Claude Flow Novice Agent Docker Image
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

IMAGE_NAME="claude-flow-novice:agent"
DOCKERFILE="$PROJECT_ROOT/docker/agent/Dockerfile"

echo "🐳 Building Claude Flow Novice Agent Docker Image..."
echo "Project Root: $PROJECT_ROOT"
echo "Image Name: $IMAGE_NAME"
echo "Dockerfile: $DOCKERFILE"

# Check if Dockerfile exists
if [ ! -f "$DOCKERFILE" ]; then
    echo "❌ Dockerfile not found at $DOCKERFILE"
    exit 1
fi

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Change to project directory
cd "$PROJECT_ROOT"

# Build the image
echo "🔨 Building Docker image..."
docker build \
    -f "$DOCKERFILE" \
    -t "$IMAGE_NAME" \
    .

# Verify the image was built
if docker images --format "table {{.Repository}}:{{.Tag}}" | grep -q "$IMAGE_NAME"; then
    echo "✅ Docker image '$IMAGE_NAME' built successfully!"

    # Show image details
    echo ""
    echo "📋 Image Details:"
    docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

    echo ""
    echo "🚀 You can now spawn agents using CFN Docker!"
else
    echo "❌ Failed to build Docker image '$IMAGE_NAME'"
    exit 1
fi