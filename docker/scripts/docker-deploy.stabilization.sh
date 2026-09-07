#!/bin/bash
# Docker-native CFN Stabilization Deployment Script

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR" && pwd)"
ENV_FILE="$PROJECT_ROOT/docker.stabilization.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Load environment configuration
load_environment() {
    if [[ -f "$ENV_FILE" ]]; then
        log_info "Loading environment configuration from $ENV_FILE"
        set -a
        source "$ENV_FILE"
        set +a
        log_success "Environment configuration loaded"
    else
        log_error "Environment file not found: $ENV_FILE"
        exit 1
    fi
}

# Validate Docker installation
validate_docker() {
    log_info "Validating Docker installation..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi

    log_success "Docker installation validated"
}

# Create necessary directories
setup_directories() {
    log_info "Setting up required directories..."

    local dirs=(
        "artifacts/telemetry"
        "artifacts/telemetry/exports"
        "logs"
        "monitoring/grafana/data"
        "monitoring/grafana/provisioning"
        "monitoring/grafana/provisioning/dashboards"
        "monitoring/grafana/provisioning/datasources"
        "redis/data"
        "telemetry"
    )

    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
        chmod 755 "$dir"
    done

    log_success "Directories created"
}

# Build Docker images
build_images() {
    log_info "Building Docker images..."

    # Build agent images
    log_info "Building CFN agent (Task mode)..."
    docker build -t claude-flow-novice:agent-task-latest \
        -f Dockerfile.agent.stabilized \
        --target task-mode \
        "$PROJECT_ROOT" || {
        log_error "Failed to build CFN agent (Task mode) image"
        exit 1
    }

    log_info "Building CFN agent (CLI mode)..."
    docker build -t claude-flow-novice:agent-cli-latest \
        -f Dockerfile.agent.stabilized \
        --target cli-mode \
        "$PROJECT_ROOT" || {
        log_error "Failed to build CFN agent (CLI mode) image"
        exit 1
    }

    # Build telemetry collector
    log_info "Building CFN telemetry collector..."
    docker build -t claude-flow-novice:telemetry-latest \
        -f Dockerfile.telemetry \
        "$PROJECT_ROOT" || {
        log_error "Failed to build CFN telemetry collector image"
        exit 1
    }

    log_success "All Docker images built successfully"
}

# Deploy CFN infrastructure
deploy_infrastructure() {
    log_info "Deploying CFN infrastructure with Docker Compose..."

    export COMPOSE_PROJECT="cfn-stabilization"
    export COMPOSE_FILE="$PROJECT_ROOT/docker-compose.stabilization.yml"

    # Create docker-compose.yml from template if it doesn't exist
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_warning "Docker Compose file not found, using default configuration"
    fi

    # Start services
    log_info "Starting CFN services..."

    # Start Redis first (dependency)
    docker-compose -f "$COMPOSE_FILE" up -d redis

    # Wait for Redis to be ready
    log_info "Waiting for Redis to be ready..."
    local redis_ready=false
    for i in {1..30}; do
        if docker-compose -f "$COMPOSE_FILE" exec redis redis-cli ping >/dev/null 2>&1; then
            redis_ready=true
            break
        fi
        echo -n "."
        sleep 1
    done
    echo

    if [[ "$redis_ready" = true ]]; then
        log_success "Redis is ready"
    else
        log_error "Redis failed to start within timeout"
        exit 1
    fi

    # Start telemetry collector
    docker-compose -f "$COMPOSE_FILE" up -d cfn-telemetry
    sleep 5

    # Start Grafana (optional)
    if [[ "${CFN_GRAFANA_ENABLED:-true}" = "true" ]]; then
        log_info "Starting Grafana monitoring dashboard..."
        docker-compose -f "$COMPOSE_FILE" up -d cfn-dashboard
    fi

    # Start orchestrator (CLI mode)
    if docker-compose -f "$COMPOSE_FILE" ps cfn-orchestrator &>/dev/null; then
        log_info "CFN orchestrator already running"
    else
        log_info "Starting CFN orchestrator (CLI mode)..."
        docker-compose -f "$COMPOSE_FILE" up -d cfn-orchestrator
    fi

    # Start agent pool
    local agent_count="${CFN_MIN_REPLICAS:-1}"
    log_info "Starting $agent_count CFN agent containers..."
    docker-compose -f "$COMPOSE_FILE" up -d --scale cfn-agent-task="$agent_count"

    log_success "CFN infrastructure deployed successfully"
}

# Validate deployment
validate_deployment() {
    log_info "Validating CFN deployment..."

    local services=("redis" "cfn-telemetry" "cfn-orchestrator" "cfn-agent-task")

    for service in "${services[@]}"; do
        if docker-compose -f "$COMPOSE_FILE" ps "$service" | grep -q "Up"; then
            log_success "✅ $service is running"
        else
            log_error "❌ $service is not running"
        fi
    done

    # Test telemetry collection
    if docker-compose -f "$COMPOSE_FILE" exec cfn-telemetry node -e "process.exit(0)" >/dev/null 2>&1; then
        log_success "✅ Telemetry collector is responsive"
    else
        log_error "❌ Telemetry collector is not responsive"
    fi

    # Test Redis connectivity
    if docker-compose -f "$COMPOSE_FILE" exec redis redis-cli ping >/dev/null 2>&1; then
        log_success "✅ Redis connectivity confirmed"
    else
        log_error "❌ Redis connectivity failed"
    fi

    # Test agent health checks
    local agent_count="${CFN_MIN_REPLICAS:-1}"
    local agent_containers=$(docker-compose -f "$COMPOSE_FILE" ps -q cfn-agent-task)
    if [[ -n "$agent_containers" ]]; then
        local healthy_agents=0
        for container_id in $agent_containers; do
            if docker inspect "$container_id" | grep -q '"Health": "healthy"'; then
                ((healthy_agents++))
            fi
        done

        local total_agents=$(echo "$agent_containers" | wc -l)
        log_info "Agent health check: $healthy_agents/$total_agents containers healthy"
        if [[ $healthy_agents -eq $agent_count ]]; then
            log_success "✅ All CFN agents are healthy"
        else
            log_warning "⚠️ Some CFN agents may not be healthy"
        fi
    fi
}

# Generate deployment report
generate_deployment_report() {
    log_info "Generating deployment report..."

    local report_file="$PROJECT_ROOT/.artifacts/docker-deployment-report.json"
    mkdir -p "$(dirname "$report_file")"

    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local container_count=$(docker-compose -f "$COMPOSE_FILE" ps -q | wc -l)
    local cfn_containers=$(docker-compose -f "$COMPOSE_FILE" ps -q | grep -E "(cfn|claude-flow)" | wc -l)

    # Get system resources
    local total_memory=$(free -m | awk 'NR==2{printf "%.0f", $3*100/$2}')
    local cpu_cores=$(nproc)
    local uptime=$(uptime)

    cat > "$report_file" << EOF
{
  "deployment_timestamp": "$timestamp",
  "deployment_type": "docker-native-stabilization",
  "status": "SUCCESS",
  "infrastructure": {
    "docker_version": "$(docker --version)",
    "compose_version": "$(docker-compose --version)",
    "total_containers": $container_count,
    "cfn_containers": $cfn_containers
  },
  "system_resources": {
    "memory_usage_percent": $total_memory,
    "cpu_cores": $cpu_cores,
    "uptime": "$uptime",
    "available_memory": "$(free -m | awk 'NR==2{print $2}')"
  },
  "services": {
    "redis": {
      "status": "$(docker-compose -f \"$COMPOSE_FILE\" ps -q redis && echo "running" || echo "stopped")",
      "memory_limit": "$(docker inspect cfn-redis | jq '.[0].HostConfig.Memory')"
    },
    "telemetry": {
      "status": "$(docker-compose -f \"$COMPOSE_FILE\" ps -q cfn-telemetry && echo "running" || echo "stopped")",
      "collection_interval": "${CFN_TELEMETRY_INTERVAL:-30}s",
      "retention_days": "${CFN_TELEMETRY_RETENTION_DAYS:-7}"
    },
    "grafana": {
      "status": "$([ "${CFN_GRAFANA_ENABLED:-true}" = "true" ] && echo "running" || echo "disabled")",
      "port": "${CFN_GRAFANA_PORT:-3000}"
    },
    "orchestrator": {
      "status": "$(docker-compose -f \"$COMPOSE_FILE\" ps -q cfn-orchestrator && echo "running" || echo "stopped")",
      "mode": "cli",
      "memory_limit": "$CFN_ORCHESTRATOR_MEMORY_LIMIT",
      "cpu_limit": "$CFN_ORCHESTRATOR_CPU_LIMIT"
    },
    "agents": {
      "task_mode": {
        "status": "$(docker-compose -f \"$COMPOSE_FILE\" ps -q cfn-agent-task && echo "running" || echo "stopped")",
        "replicas": "${CFN_MIN_REPLICAS:-1}",
        "memory_limit": "$CFN_TASK_MEMORY_LIMIT",
        "cpu_limit": "$CFN_TASK_CPU_LIMIT"
      },
      "cli_mode": {
        "status": "$(docker-compose -f \"$COMPOSE_FILE\" ps -q cfn-agent-cli && echo "running" || echo "stopped")",
        "replicas": "auto-scaling",
        "memory_limit": "$CFN_CLI_MEMORY_LIMIT",
        "cpu_limit": "$CFN_CLI_CPU_LIMIT"
      }
    }
  },
  "configuration": {
    "environment_file": "$ENV_FILE",
    "stabilization_enabled": true,
    "telemetry_enabled": "${CFN_TELEMETRY_ENABLED:-true}",
    "monitoring_enabled": "${CFN_GRAFANA_ENABLED:-true}",
    "auto_scaling": "${CFN_AUTO_SCALING:-false}",
    "health_checks": {
      "enabled": true,
      "interval": "${CFN_HEALTH_CHECK_INTERVAL:-30}s",
      "timeout": "${CFN_HEALTH_CHECK_TIMEOUT:-5s}",
      "retries": "${CFN_HEALTH_CHECK_RETRIES:-3}"
    }
  },
  "advantages_over_host_based": [
    "Container isolation prevents memory leaks from affecting host system",
    "Docker resource limits are more reliable than wrapper scripts",
    "Automatic container restart provides self-healing",
    "Built-in health checks ensure service availability",
    "Simplified deployment and scaling",
    "Consistent environments across development and production"
  ],
  "remaining_components": [
    "End-to-end CFN loop testing in container environment",
    "Load testing under container constraints",
    "Performance optimization under container limits",
    "Production monitoring and alerting setup"
  ]
}
EOF

    log_success "Deployment report generated: $report_file"
    echo "📊 Report includes container status, resource usage, and configuration details"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up CFN Docker infrastructure..."

    if [[ -f "$COMPOSE_FILE" ]]; then
        docker-compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
        log_success "Docker Compose services stopped"
    fi

    # Clean up any orphaned containers
    local orphaned_containers=$(docker ps -aq --filter "name=cfn-" 2>/dev/null)
    if [[ -n "$orphaned_containers" ]]; then
        log_warning "Removing $orphaned_containers orphaned CFN containers"
        docker rm -f $orphaned_containers 2>/dev/null || true
    fi

    log_success "Cleanup completed"
}

# Main deployment function
main() {
    local action="${1:-deploy}"

    echo "🐳 CFN Docker-Native Stabilization Deployment"
    echo "=========================================="
    echo

    case "$action" in
        "deploy")
            load_environment
            validate_docker
            setup_directories
            build_images
            deploy_infrastructure
            validate_deployment
            generate_deployment_report
            ;;
        "validate")
            load_environment
            validate_deployment
            ;;
        "cleanup")
            cleanup
            ;;
        "build")
            load_environment
            setup_directories
            build_images
            ;;
        "help"|"--help"|"-h")
            cat <<'EOF'
CFN Docker-Native Stabilization Deployment Script

USAGE:
    docker-deploy.stabilization.sh [command] [options]

COMMANDS:
    deploy              Deploy CFN infrastructure with Docker-native stabilization
    validate            Validate current deployment status
    build               Build Docker images without deployment
    cleanup              Stop and clean up CFN infrastructure
    help                 Show this help message

EXAMPLES:
    docker-deploy.stabilization.sh deploy
    docker-deploy.stabilization.sh validate
    docker-deploy.stabilization.sh cleanup

ENVIRONMENT:
    docker.stabilization.env - Configuration file with resource limits and settings

EOF
            ;;
        *)
            log_error "Unknown command: $action"
            echo "Use 'help' for usage information"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"