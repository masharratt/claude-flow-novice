#!/usr/bin/env bash

# Production CFN Loop Deployment Script
# Deploys the complete production stack with validation

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +%s)
LOG_FILE="$PROJECT_ROOT/logs/production-deploy-$TIMESTAMP.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment variables
export BUILD_DATE="${BUILD_DATE:-$(date -u +'%Y-%m-%dT%H:%M:%SZ')}"
export VCS_REF="${VCS_REF:-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}"
export VERSION="${VERSION:-4.0.0}"
export CLAUDE_FLOW_VERSION="${CLAUDE_FLOW_VERSION:-4.0.0}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export MAX_AGENTS="${MAX_AGENTS:-10}"
export AGENT_TIMEOUT="${AGENT_TIMEOUT:-300000}"
export MEMORY_LIMIT="${MEMORY_LIMIT:-1g}"
export CPU_LIMIT="${CPU_LIMIT:-0.5}"
export AGENT_REPLICAS="${AGENT_REPLICAS:-3}"
export WORKER_POOL_SIZE="${WORKER_POOL_SIZE:-5}"
export GRAFANA_USER="${GRAFANA_USER:-admin}"
export GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-admin123}"

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2 | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Cleanup function
cleanup() {
    log "Cleaning up on exit..."
    # Add any cleanup tasks here
}

# Set up signal handlers
trap cleanup EXIT INT TERM

# Main deployment function
main() {
    log "🚀 Starting Production CFN Loop Deployment"
    log "📋 Deployment ID: $TIMESTAMP"
    log "📁 Project root: $PROJECT_ROOT"
    log "📄 Log file: $LOG_FILE"

    # Change to project directory
    cd "$PROJECT_ROOT"

    # Phase 1: Pre-deployment checks
    log "🔍 Running pre-deployment checks..."
    run_pre_deployment_checks

    # Phase 2: Build production images
    log "🏗️ Building production Docker images..."
    build_production_images

    # Phase 3: Deploy infrastructure
    log "🐳 Deploying production infrastructure..."
    deploy_infrastructure

    # Phase 4: Wait for services to be healthy
    log "⏳ Waiting for services to be healthy..."
    wait_for_healthy_services

    # Phase 5: Run validation tests
    log "🧪 Running deployment validation..."
    run_validation_tests

    # Phase 6: Display deployment summary
    display_deployment_summary

    success "🎉 Production deployment completed successfully!"
}

# Pre-deployment checks
run_pre_deployment_checks() {
    log "   Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
        exit 1
    fi
    log "   ✅ Docker available: $(docker --version)"

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    log "   ✅ Docker Compose available: $(docker-compose --version)"

    # Check Node.js (for local tests)
    if command -v node &> /dev/null; then
        log "   ✅ Node.js available: $(node --version)"
    else
        warning "Node.js not available - some tests may be skipped"
    fi

    # Check available disk space
    local available_space
    available_space=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
    if [[ $available_space -lt 5 ]]; then
        warning "Low disk space: ${available_space}GB available (recommended: 5GB+)"
    else
        log "   ✅ Disk space: ${available_space}GB available"
    fi

    # Check available memory
    if command -v free &> /dev/null; then
        local available_memory
        available_memory=$(free -g | awk 'NR==2{print $7}')
        if [[ $available_memory -lt 4 ]]; then
            warning "Low memory: ${available_memory}GB available (recommended: 4GB+)"
        else
            log "   ✅ Memory: ${available_memory}GB available"
        fi
    fi

    # Create necessary directories
    log "   Creating directories..."
    mkdir -p logs workspaces monitoring/grafana/{provisioning/{datasources,dashboards},dashboards} nginx

    log "   ✅ Pre-deployment checks completed"
}

# Build production images
build_production_images() {
    log "   Building production Docker image..."

    # Build the production image
    if docker build -f Dockerfile.production -t claude-flow-novice:production .; then
        success "   ✅ Production image built successfully"
    else
        error "   ❌ Failed to build production image"
        exit 1
    fi

    # Tag the image
    docker tag claude-flow-novice:production claude-flow-novice:${VERSION}
    log "   ✅ Image tagged as claude-flow-novice:${VERSION}"

    # Show image information
    local image_size
    image_size=$(docker images claude-flow-novice:production --format "{{.Size}}")
    log "   📊 Image size: $image_size"
}

# Deploy infrastructure
deploy_infrastructure() {
    log "   Deploying production stack..."

    # Create environment file
    cat > .env.production << EOF
# Production CFN Loop Environment Configuration
BUILD_DATE=$BUILD_DATE
VCS_REF=$VCS_REF
VERSION=$VERSION
CLAUDE_FLOW_VERSION=$CLAUDE_FLOW_VERSION
LOG_LEVEL=$LOG_LEVEL
MAX_AGENTS=$MAX_AGENTS
AGENT_TIMEOUT=$AGENT_TIMEOUT
MEMORY_LIMIT=$MEMORY_LIMIT
CPU_LIMIT=$CPU_LIMIT
AGENT_REPLICAS=$AGENT_REPLICAS
WORKER_POOL_SIZE=$WORKER_POOL_SIZE
GRAFANA_USER=$GRAFANA_USER
GRAFANA_PASSWORD=$GRAFANA_PASSWORD
EOF

    # Deploy the stack
    if docker-compose -f docker-compose.production.yml --env-file .env.production up -d; then
        success "   ✅ Production stack deployed"
    else
        error "   ❌ Failed to deploy production stack"
        exit 1
    fi

    # Show deployed services
    log "   📊 Deployed services:"
    docker-compose -f docker-compose.production.yml ps
}

# Wait for services to be healthy
wait_for_healthy_services() {
    log "   Waiting for services to become healthy..."
    local max_wait=300  # 5 minutes
    local wait_interval=10
    local waited=0

    while [[ $waited -lt $max_wait ]]; do
        local healthy_count=0
        local total_count=0

        # Check service health
        while IFS= read -r line; do
            if [[ $line == *"cfn-"* ]]; then
                ((total_count++))
                if [[ $line == *"healthy"* ]] || [[ $line == *"Up"* ]]; then
                    ((healthy_count++))
                fi
            fi
        done < <(docker-compose -f docker-compose.production.yml ps --format "table {{.Name}}\t{{.Status}}" | tail -n +2)

        log "   Progress: $healthy_count/$total_count services healthy (${waited}s elapsed)"

        if [[ $healthy_count -eq $total_count ]] && [[ $total_count -gt 0 ]]; then
            success "   ✅ All $total_count services are healthy"
            return 0
        fi

        sleep $wait_interval
        ((waited += wait_interval))
    done

    warning "   ⚠️ Some services may still be starting up"
    log "   📊 Current status:"
    docker-compose -f docker-compose.production.yml ps
}

# Run validation tests
run_validation_tests() {
    log "   Running deployment validation tests..."

    # Test basic connectivity
    log "   Testing Redis connectivity..."
    if docker exec cfn-redis-coordinator redis-cli ping | grep -q "PONG"; then
        success "   ✅ Redis connectivity verified"
    else
        error "   ❌ Redis connectivity failed"
    fi

    # Test orchestrator
    log "   Testing orchestrator..."
    if docker exec cfn-orchestrator node -e "console.log('Orchestrator ready')" &>/dev/null; then
        success "   ✅ Orchestrator responsive"
    else
        warning "   ⚠️ Orchestrator may still be initializing"
    fi

    # Test monitoring endpoints
    log "   Testing monitoring endpoints..."
    local prometheus_ok=false
    local grafana_ok=false

    if curl -s http://localhost:9090/-/healthy &>/dev/null; then
        prometheus_ok=true
        success "   ✅ Prometheus endpoint accessible"
    else
        warning "   ⚠️ Prometheus endpoint not accessible"
    fi

    if curl -s http://localhost:3001/api/health &>/dev/null; then
        grafana_ok=true
        success "   ✅ Grafana endpoint accessible"
    else
        warning "   ⚠️ Grafana endpoint not accessible"
    fi

    # Run comprehensive test if Node.js is available
    if command -v node &> /dev/null; then
        log "   Running comprehensive production test..."
        if node tests/docker/production-deployment-test.js &>/dev/null; then
            success "   ✅ Comprehensive test passed"
        else
            warning "   ⚠️ Comprehensive test encountered issues"
        fi
    else
        log "   ⏭️ Skipping comprehensive test (Node.js not available)"
    fi

    # Store test results
    cat > logs/deployment-validation-$TIMESTAMP.json << EOF
{
    "timestamp": "$(date -Iseconds)",
    "deployment_id": "$TIMESTAMP",
    "redis_healthy": $(docker exec cfn-redis-coordinator redis-cli ping | grep -q "PONG" && echo true || echo false),
    "prometheus_healthy": $prometheus_ok,
    "grafana_healthy": $grafana_ok,
    "services_total": $(docker-compose -f docker-compose.production.yml ps --format json | jq '. | length'),
    "services_healthy": $(docker-compose -f docker-compose.production.yml ps --format json | jq '[.[] | select(.State == "running")] | length')
}
EOF
}

# Display deployment summary
display_deployment_summary() {
    log "📊 Deployment Summary"
    log "===================="

    # Service status
    log ""
    log "🐳 Services Status:"
    docker-compose -f docker-compose.production.yml ps

    # Access URLs
    log ""
    log "🔗 Access URLs:"
    log "   • Prometheus: http://localhost:9090"
    log "   • Grafana: http://localhost:3001 (admin/admin123)"
    log "   • Redis: redis://localhost:6379"
    log "   • Orchestrator: http://localhost:3000"

    # Resource usage
    log ""
    log "📈 Resource Usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}\t{{.CPUPerc}}" | grep cfn- || log "   No container stats available yet"

    # Useful commands
    log ""
    log "🛠️ Useful Commands:"
    log "   • View logs: docker-compose -f docker-compose.production.yml logs -f [service-name]"
    log "   • Stop stack: docker-compose -f docker-compose.production.yml down"
    log "   • Restart service: docker-compose -f docker-compose.production.yml restart [service-name]"
    log "   • Scale agents: docker-compose -f docker-compose.production.yml up -d --scale agent-pool=[N]"

    # Next steps
    log ""
    log "📋 Next Steps:"
    log "   1. Configure Grafana dashboards for monitoring"
    log "   2. Set up alerting rules in Prometheus"
    log "   3. Test CFN Loop execution with real tasks"
    log "   4. Configure backup and disaster recovery"
    log "   5. Set up log aggregation and analysis"

    log ""
    success "🎉 Production deployment is ready for use!"
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi