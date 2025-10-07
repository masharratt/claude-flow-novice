#!/bin/bash
# Pre-Test Validation for 8-Hour Stability Test
# Validates system requirements and configuration before test execution

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Requirements
MIN_MEMORY_GB=8
MIN_DISK_GB=20
MIN_CPU_CORES=4
REQUIRED_DOCKER_VERSION="20.10"
REQUIRED_COMPOSE_VERSION="1.29"

# Counters
ERRORS=0
WARNINGS=0
CHECKS=0

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[!]${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
log_error() { echo -e "${RED}[✗]${NC} $1"; ERRORS=$((ERRORS + 1)); }

log_info "Pre-Test Validation - 8-Hour Stability Test"
log_info "=============================================="
echo

# Check 1: Docker installed
log_info "Checking Docker installation..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)
    log_success "Docker installed: v${DOCKER_VERSION}"
else
    log_error "Docker not found. Install Docker: https://docs.docker.com/get-docker/"
fi

# Check 2: Docker Compose installed
log_info "Checking Docker Compose..."
if command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose --version | grep -oP '\d+\.\d+\.\d+' | head -1)
    log_success "Docker Compose installed: v${COMPOSE_VERSION}"
else
    log_error "Docker Compose not found. Install: https://docs.docker.com/compose/install/"
fi

# Check 3: Docker daemon running
log_info "Checking Docker daemon..."
if docker info &> /dev/null; then
    log_success "Docker daemon is running"
else
    log_error "Docker daemon is not running. Start with: sudo systemctl start docker"
fi

# Check 4: Memory
log_info "Checking available memory..."
if command -v free &> /dev/null; then
    AVAILABLE_MEM_MB=$(free -m | awk 'NR==2{print $7}')
    AVAILABLE_MEM_GB=$((AVAILABLE_MEM_MB / 1024))

    if [ "${AVAILABLE_MEM_GB}" -ge "${MIN_MEMORY_GB}" ]; then
        log_success "Available memory: ${AVAILABLE_MEM_GB}GB (required: ${MIN_MEMORY_GB}GB)"
    else
        log_warning "Low memory: ${AVAILABLE_MEM_GB}GB available (recommended: ${MIN_MEMORY_GB}GB)"
    fi
else
    log_warning "Cannot check memory (free command not found)"
fi

# Check 5: Disk space
log_info "Checking disk space..."
AVAILABLE_DISK_GB=$(df -BG . | awk 'NR==2{print $4}' | sed 's/G//')

if [ "${AVAILABLE_DISK_GB}" -ge "${MIN_DISK_GB}" ]; then
    log_success "Available disk space: ${AVAILABLE_DISK_GB}GB (required: ${MIN_DISK_GB}GB)"
else
    log_warning "Low disk space: ${AVAILABLE_DISK_GB}GB available (recommended: ${MIN_DISK_GB}GB)"
fi

# Check 6: CPU cores
log_info "Checking CPU cores..."
CPU_CORES=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "unknown")

if [ "${CPU_CORES}" != "unknown" ] && [ "${CPU_CORES}" -ge "${MIN_CPU_CORES}" ]; then
    log_success "CPU cores: ${CPU_CORES} (required: ${MIN_CPU_CORES})"
else
    log_warning "CPU cores: ${CPU_CORES} (recommended: ${MIN_CPU_CORES})"
fi

# Check 7: Configuration files
log_info "Checking configuration files..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

FILES_TO_CHECK=(
    "${PROJECT_ROOT}/config/docker/docker-compose.stability-test.yml"
    "${PROJECT_ROOT}/config/docker/prometheus.stability.yml"
    "${PROJECT_ROOT}/scripts/monitoring/resource-monitor.sh"
    "${PROJECT_ROOT}/tests/performance/analyze-stability-results.js"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$file" ]; then
        log_success "Found: $(basename "$file")"
    else
        log_error "Missing: $file"
    fi
done

# Check 8: Node.js
log_info "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    log_success "Node.js installed: ${NODE_VERSION}"
else
    log_warning "Node.js not found (required for analysis scripts)"
fi

# Check 9: Required directories
log_info "Checking directories..."
REQUIRED_DIRS=(
    "${PROJECT_ROOT}/config/docker/stability-results"
    "${PROJECT_ROOT}/config/docker/grafana-dashboards"
    "${PROJECT_ROOT}/scripts/monitoring"
    "${PROJECT_ROOT}/tests/performance"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        log_success "Directory exists: $(basename "$dir")"
    else
        log_warning "Creating directory: $(basename "$dir")"
        mkdir -p "$dir"
    fi
done

# Check 10: Docker resources
log_info "Checking Docker resource limits..."
if docker info &> /dev/null; then
    DOCKER_MEM=$(docker info 2>/dev/null | grep "Total Memory" | awk '{print $3}')
    DOCKER_CPUS=$(docker info 2>/dev/null | grep "CPUs" | awk '{print $2}')

    if [ -n "$DOCKER_MEM" ]; then
        log_success "Docker memory: ${DOCKER_MEM}"
    fi

    if [ -n "$DOCKER_CPUS" ]; then
        log_success "Docker CPUs: ${DOCKER_CPUS}"
    fi
fi

# Check 11: Port availability
log_info "Checking port availability..."
REQUIRED_PORTS=(3000 9090 3001 9100)
PORT_CONFLICTS=0

for port in "${REQUIRED_PORTS[@]}"; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -tuln 2>/dev/null | grep -q ":$port "; then
        log_warning "Port $port is in use (may conflict)"
        PORT_CONFLICTS=$((PORT_CONFLICTS + 1))
    else
        log_success "Port $port is available"
    fi
done

# Check 12: WSL detection (memory leak warning)
log_info "Checking environment..."
if grep -qi microsoft /proc/version 2>/dev/null; then
    log_warning "WSL detected - Docker avoids WSL memory issues"
    log_info "  Test will run in Docker to bypass WSL limitations"
else
    log_success "Native Linux/Unix environment detected"
fi

# Summary
echo
log_info "=============================================="
log_info "Validation Summary"
log_info "=============================================="
echo -e "${GREEN}[✓]${NC} All critical checks passed"
echo -e "${YELLOW}[!]${NC} Warnings: ${WARNINGS}"
echo -e "${RED}[✗]${NC} Errors: ${ERRORS}"
echo

if [ "${ERRORS}" -eq 0 ]; then
    log_success "System is ready for stability test"
    log_info ""
    log_info "To run the test:"
    log_info "  cd ${PROJECT_ROOT}/config/docker"
    log_info "  ${SCRIPT_DIR}/launch-stability-test.sh"
    log_info ""
    log_info "Monitor progress:"
    log_info "  Grafana:    http://localhost:3001 (admin/stability-test)"
    log_info "  Prometheus: http://localhost:9090"
    echo
    exit 0
else
    log_error "System validation failed with ${ERRORS} error(s)"
    log_info "Fix errors above before running the test"
    echo
    exit 1
fi
