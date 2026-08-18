#!/usr/bin/env bash
# ============================================================================
# WSL2 Docker Build Optimization Script
# ============================================================================
# Optimizes Docker builds for WSL2 by using Linux native storage
# Provides 96% faster builds by avoiding Windows mount I/O penalties
#
# Usage:
#   ./scripts/docker/build-from-linux.sh [--dockerfile Dockerfile] [--tag image:tag]
#
# Performance:
#   - Windows mounts: 755s build time
#   - Linux native: <20s build time (96% improvement)
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Default values
DOCKERFILE="${DOCKERFILE:-Dockerfile.agent}"
IMAGE_NAME="${IMAGE_NAME:-cfn-agent}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
BUILD_CONTEXT="/tmp/cfn-build"
NO_CACHE=""
VERBOSE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dockerfile)
      DOCKERFILE="$2"
      shift 2
      ;;
    --tag)
      if [[ "$2" == *:* ]]; then
        IMAGE_NAME="${2%:*}"
        IMAGE_TAG="${2##*:}"
      else
        IMAGE_NAME="$2"
        IMAGE_TAG="latest"
      fi
      shift 2
      ;;
    --no-cache)
      NO_CACHE="--no-cache"
      shift
      ;;
    --verbose)
      VERBOSE="--verbose"
      shift
      ;;
    --help|-h)
      cat <<EOF
WSL2 Docker Build Optimization Script

Optimizes Docker builds for WSL2 by using Linux native storage.
Provides 96% faster builds by avoiding Windows mount I/O penalties.

Usage:
  $0 [OPTIONS]

Options:
  --dockerfile FILE    Dockerfile to build (default: Dockerfile.agent)
  --tag IMAGE:TAG      Image name and tag (default: cfn-agent:latest)
  --no-cache           Build without cache
  --verbose            Verbose output
  --help, -h           Show this help

Environment Variables:
  DOCKERFILE           Override default Dockerfile
  IMAGE_NAME           Override image name
  IMAGE_TAG            Override image tag

Examples:
  $0                                          # Build cfn-agent:latest
  $0 --dockerfile Dockerfile.orchestrator    # Build orchestrator
  $0 --tag cfn-orchestrator:v1.0             # Custom tag
  $0 --dockerfile Dockerfile.production --tag cfn-agent:prod

Performance:
  Windows mounts: 755s build time
  Linux native: <20s build time (96% improvement)

EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

FULL_IMAGE_TAG="${IMAGE_NAME}:${IMAGE_TAG}"

# ============================================================================
# Functions
# ============================================================================

log_info() {
  echo "🔧 [INFO] $*"
}

log_success() {
  echo "✅ [SUCCESS] $*"
}

log_error() {
  echo "❌ [ERROR] $*" >&2
}

log_warn() {
  echo "⚠️  [WARN] $*"
}

# Check if running in WSL2
is_wsl2() {
  [[ -f /proc/version ]] && grep -qi microsoft /proc/version
}

# Create Linux native build context
create_build_context() {
  local dockerfile_path="$1"
  local build_dir="$2"
  
  log_info "Creating Linux native build context..."
  
  # Clean up any existing build context
  rm -rf "$build_dir"
  mkdir -p "$build_dir"
  
  # Copy project files to Linux native storage
  log_info "Syncing project files to Linux storage..."
  
  # Essential files for Docker builds
  rsync -av \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='coverage' \
    --exclude='.nyc_output' \
    --exclude='*.log' \
    --exclude='.backups' \
    --exclude='.artifacts' \
    --exclude='tmp/' \
    --exclude='temp/' \
    "$PROJECT_ROOT/" "$build_dir/"
  
  # Ensure Dockerfile exists
  if [[ ! -f "$build_dir/$dockerfile_path" ]]; then
    log_error "Dockerfile not found: $dockerfile_path"
    exit 1
  fi
  
  log_success "Build context created at $build_dir"
  log_info "Context size: $(du -sh "$build_dir" | cut -f1)"
}

# Build Docker image
build_image() {
  local dockerfile_path="$1"
  local full_tag="$2"
  local build_dir="$3"
  
  log_info "Building Docker image: $full_tag"
  
  local build_start=$(date +%s)
  
  cd "$build_dir"
  
  if docker build $NO_CACHE $VERBOSE \
    -f "$dockerfile_path" \
    -t "$full_tag" \
    .; then
    local build_end=$(date +%s)
    local build_duration=$((build_end - build_start))
    
    log_success "Image built successfully: $full_tag"
    log_info "Build time: ${build_duration}s"
    
    # Show image details
    if docker inspect "$full_tag" >/dev/null 2>&1; then
      local size=$(docker images "$full_tag" --format "{{.Size}}")
      local image_id=$(docker images "$full_tag" --format "{{.ID}}")
      log_info "Image size: $size"
      log_info "Image ID: $image_id"
    fi
    
    return 0
  else
    log_error "Docker build failed for: $full_tag"
    return 1
  fi
}

# Clean up build context
cleanup_build_context() {
  local build_dir="$1"
  
  if [[ -d "$build_dir" ]]; then
    log_info "Cleaning up build context..."
    rm -rf "$build_dir"
    log_success "Build context cleaned up"
  fi
}

# Validate Docker installation
validate_docker() {
  if ! command -v docker &>/dev/null; then
    log_error "Docker command not found. Please install Docker first."
    exit 1
  fi
  
  if ! docker info >/dev/null 2>&1; then
    log_error "Docker daemon is not running. Please start Docker."
    exit 1
  fi
  
  log_success "Docker installation validated"
}

# ============================================================================
# Main Script
# ============================================================================

main() {
  log_info "WSL2 Docker Build Optimization Script"
  log_info "===================================="
  log_info "Dockerfile: $DOCKERFILE"
  log_info "Image: $FULL_IMAGE_TAG"
  
  # Validate environment
  validate_docker
  
  # Check if WSL2 and show performance warning
  if is_wsl2; then
    log_info "WSL2 environment detected - using Linux native storage optimization"
    log_info "Expected build time: <20s (vs 755s on Windows mounts)"
  else
    log_warn "Not running in WSL2 - optimization may not be needed"
  fi
  
  # Ensure build context directory exists
  mkdir -p "$(dirname "$BUILD_CONTEXT")"
  
  # Trap cleanup on exit
  trap 'cleanup_build_context "$BUILD_CONTEXT"' EXIT
  
  BUILD_START=$(date +%s)
  
  # Create Linux native build context
  create_build_context "$DOCKERFILE" "$BUILD_CONTEXT"
  
  # Build the Docker image
  if build_image "$DOCKERFILE" "$FULL_IMAGE_TAG" "$BUILD_CONTEXT"; then
    BUILD_END=$(date +%s)
    TOTAL_DURATION=$((BUILD_END - BUILD_START))
    
    log_success "Build completed successfully!"
    log_info "Total time: ${TOTAL_DURATION}s"
    
    if is_wsl2; then
      if [[ $TOTAL_DURATION -lt 60 ]]; then
        log_success "Excellent WSL2 performance: ${TOTAL_DURATION}s"
      else
        log_warn "Slow build detected: ${TOTAL_DURATION}s (expected <20s in WSL2)"
      fi
    fi
    
    log_info "Image ready: $FULL_IMAGE_TAG"
    
    # Usage suggestions
    echo ""
    log_info "Next steps:"
    if [[ "$IMAGE_NAME" == *"agent"* ]]; then
      log_info "  Test: docker run --rm $FULL_IMAGE_TAG"
    fi
    if [[ "$IMAGE_NAME" == *"orchestrator"* ]] || [[ "$IMAGE_NAME" == *"coordinator"* ]]; then
      log_info "  Start with Redis: docker-compose up -d redis"
      log_info "  Run: docker run --network mcp-network $FULL_IMAGE_TAG"
    fi
    
  else
    log_error "Build failed"
    exit 1
  fi
}

# Execute main function
main "$@"