#!/usr/bin/env bash
# ============================================================================
# CFN Docker Infrastructure - Build All Images
# ============================================================================
# Builds all 4 required images in correct dependency order
#
# Usage:
#   ./docker/build-all.sh [--no-cache] [--verbose]
#
# Images:
#   1. cfn-redis (pulled from Docker Hub)
#   2. cfn-agent (general-purpose agent - base for others)
#   3. cfn-orchestrator (extends cfn-agent)
#   4. cfn-coordinator (extends cfn-agent)
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
NO_CACHE=""
VERBOSE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-cache)
      NO_CACHE="--no-cache"
      shift
      ;;
    --verbose)
      VERBOSE="-v"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--no-cache] [--verbose]"
      exit 1
      ;;
  esac
done

# ============================================================================
# Functions
# ============================================================================

log_info() {
  echo ""
  echo "======================================================================"
  echo "  $1"
  echo "======================================================================"
  echo ""
}

log_success() {
  echo "✅ $1"
}

log_error() {
  echo "❌ $1" >&2
}

build_image() {
  local dockerfile=$1
  local tag=$2
  local name=$3

  log_info "Building $name"

  if docker build $NO_CACHE $VERBOSE \
    -f "$SCRIPT_DIR/$dockerfile" \
    -t "$tag" \
    "$PROJECT_ROOT"; then
    log_success "$name built successfully: $tag"
    return 0
  else
    log_error "$name build failed"
    return 1
  fi
}

test_image() {
  local image=$1
  local name=$2

  log_info "Testing $name"

  if docker inspect "$image" > /dev/null 2>&1; then
    log_success "$name image exists"

    # Get image size
    local size=$(docker images "$image" --format "{{.Size}}")
    echo "  Image size: $size"

    # Get image ID
    local image_id=$(docker images "$image" --format "{{.ID}}")
    echo "  Image ID: $image_id"

    return 0
  else
    log_error "$name image not found"
    return 1
  fi
}

# ============================================================================
# Main Build Process
# ============================================================================

cd "$PROJECT_ROOT"

log_info "Starting CFN Docker Infrastructure Build"
echo "Project Root: $PROJECT_ROOT"
echo "Build Options: $NO_CACHE $VERBOSE"
echo ""

BUILD_START=$(date +%s)
FAILED_BUILDS=()

# ----------------------------------------------------------------------------
# Image 1: Pull Redis
# ----------------------------------------------------------------------------
log_info "Pulling cfn-redis (Redis 7 Alpine)"

if docker pull redis:7-alpine; then
  docker tag redis:7-alpine cfn-redis:latest
  log_success "Redis image pulled and tagged: cfn-redis:latest"
else
  log_error "Failed to pull Redis image"
  FAILED_BUILDS+=("cfn-redis")
fi

# ----------------------------------------------------------------------------
# Image 2: Build cfn-agent (CRITICAL - base for all others)
# ----------------------------------------------------------------------------
if ! build_image "Dockerfile.agent" "cfn-agent:latest" "CFN Agent"; then
  FAILED_BUILDS+=("cfn-agent")
  log_error "CRITICAL: cfn-agent build failed. Cannot proceed with dependent images."
  exit 1
fi

# ----------------------------------------------------------------------------
# Image 3: Build cfn-orchestrator (depends on cfn-agent)
# ----------------------------------------------------------------------------
if ! build_image "Dockerfile.orchestrator" "cfn-orchestrator:latest" "CFN Orchestrator"; then
  FAILED_BUILDS+=("cfn-orchestrator")
fi

# ----------------------------------------------------------------------------
# Image 4: Build cfn-coordinator (depends on cfn-agent)
# ----------------------------------------------------------------------------
if ! build_image "Dockerfile.coordinator" "cfn-coordinator:latest" "CFN Coordinator"; then
  FAILED_BUILDS+=("cfn-coordinator")
fi

# ============================================================================
# Image Validation
# ============================================================================

log_info "Validating Built Images"

test_image "cfn-redis:latest" "Redis"
test_image "cfn-agent:latest" "Agent"
test_image "cfn-orchestrator:latest" "Orchestrator"
test_image "cfn-coordinator:latest" "Coordinator"

# ============================================================================
# Build Summary
# ============================================================================

BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))

log_info "Build Summary"

echo "Total Build Time: ${BUILD_DURATION}s"
echo ""

if [ ${#FAILED_BUILDS[@]} -eq 0 ]; then
  log_success "All images built successfully!"
  echo ""
  echo "Available Images:"
  echo "  - cfn-redis:latest        (Redis 7 Alpine)"
  echo "  - cfn-agent:latest        (General-purpose agent)"
  echo "  - cfn-orchestrator:latest (Loop orchestration)"
  echo "  - cfn-coordinator:latest  (Wave coordination)"
  echo ""
  echo "Next Steps:"
  echo "  1. Start Redis: docker-compose -f docker/docker-compose.yml up -d cfn-redis"
  echo "  2. Test agent: docker run --rm --network mcp-network cfn-agent:latest"
  echo "  3. Run tests: ./docker/test-all.sh"
  exit 0
else
  log_error "Build failed for: ${FAILED_BUILDS[*]}"
  exit 1
fi
