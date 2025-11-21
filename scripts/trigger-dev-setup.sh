#!/bin/bash
# trigger.dev Self-Hosted Infrastructure Setup Script
# Initializes and starts trigger.dev with all required services

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
TRIGGER_DEV_DIR="$PROJECT_ROOT/docker/trigger-dev"
ENV_FILE="$TRIGGER_DEV_DIR/.env"
ENV_TEMPLATE="$TRIGGER_DEV_DIR/.env.template"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
  log_info "Checking prerequisites..."

  # Check Docker
  if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
  fi
  log_success "Docker found: $(docker --version)"

  # Check Docker Compose
  if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose is not installed. Please install Docker Compose from https://docs.docker.com/compose/install/"
    exit 1
  fi
  log_success "Docker Compose found: $(docker-compose --version)"

  # Check Docker daemon is running
  if ! docker info &> /dev/null; then
    log_error "Docker daemon is not running. Please start Docker and try again."
    exit 1
  fi
  log_success "Docker daemon is running"

  # Check git
  if ! command -v git &> /dev/null; then
    log_error "Git is not installed. Please install Git."
    exit 1
  fi
  log_success "Git found: $(git --version)"
}

# Generate a secure random secret
generate_secret() {
  local length=${1:-32}
  if command -v openssl &> /dev/null; then
    openssl rand -base64 "$length"
  elif command -v python3 &> /dev/null; then
    python3 -c "import secrets; print(secrets.token_urlsafe($length))"
  elif command -v node &> /dev/null; then
    node -e "console.log(require('crypto').randomBytes($length).toString('base64'))"
  else
    log_error "Cannot generate secrets. Install openssl, python3, or node.js"
    exit 1
  fi
}

# Create .env file from template
create_env_file() {
  if [ -f "$ENV_FILE" ]; then
    log_warning ".env file already exists at $ENV_FILE"
    log_info "Skipping .env creation. To regenerate, delete $ENV_FILE and re-run this script."
    return 0
  fi

  if [ ! -f "$ENV_TEMPLATE" ]; then
    log_error ".env.template not found at $ENV_TEMPLATE"
    exit 1
  fi

  log_info "Creating .env file from template..."
  cp "$ENV_TEMPLATE" "$ENV_FILE"

  # Generate secure secrets
  log_info "Generating secure secrets..."
  POSTGRES_PASSWORD=$(generate_secret)
  MINIO_PASSWORD=$(generate_secret)
  CLICKHOUSE_PASSWORD=$(generate_secret)
  TRIGGER_SECRET_KEY=$(generate_secret)
  AUTH_SECRET=$(generate_secret)
  ENCRYPTION_KEY=$(generate_secret)
  MAGIC_LINK_SECRET=$(generate_secret)
  JWT_SECRET=$(generate_secret)

  # Update .env file with generated secrets
  sed -i.bak "s/your_secure_postgres_password_here/$POSTGRES_PASSWORD/g" "$ENV_FILE"
  sed -i.bak "s/your_secure_minio_password_here/$MINIO_PASSWORD/g" "$ENV_FILE"
  sed -i.bak "s/your_secure_clickhouse_password_here/$CLICKHOUSE_PASSWORD/g" "$ENV_FILE"
  sed -i.bak "s/your_secure_trigger_secret_key_here/$TRIGGER_SECRET_KEY/g" "$ENV_FILE"
  sed -i.bak "s/your_secure_auth_secret_here/$AUTH_SECRET/g" "$ENV_FILE"
  sed -i.bak "s/your_secure_encryption_key_here/$ENCRYPTION_KEY/g" "$ENV_FILE"
  sed -i.bak "s/your_secure_magic_link_secret_here/$MAGIC_LINK_SECRET/g" "$ENV_FILE"
  sed -i.bak "s/your_secure_jwt_secret_here/$JWT_SECRET/g" "$ENV_FILE"

  # Remove backup files
  rm -f "$ENV_FILE.bak"

  log_success ".env file created successfully at $ENV_FILE"
  log_warning "Store these secrets in a secure location (password manager, vault, etc.)"
}

# Stop existing containers
stop_existing() {
  log_info "Checking for existing trigger.dev containers..."
  if docker-compose -f "$TRIGGER_DEV_DIR/docker-compose.yml" ps 2>/dev/null | grep -q "trigger-dev-"; then
    log_warning "Found existing trigger.dev containers. Stopping them..."
    docker-compose -f "$TRIGGER_DEV_DIR/docker-compose.yml" down --remove-orphans || true
    sleep 2
  else
    log_info "No existing containers found"
  fi
}

# Start infrastructure
start_infrastructure() {
  log_info "Starting trigger.dev infrastructure..."

  cd "$TRIGGER_DEV_DIR"
  docker-compose --env-file "$ENV_FILE" up -d --pull always

  log_success "Infrastructure started"
}

# Wait for health checks
wait_for_health() {
  log_info "Waiting for services to be healthy..."

  local max_attempts=60
  local attempt=0
  local all_healthy=false

  while [ $attempt -lt $max_attempts ]; do
    attempt=$((attempt + 1))

    log_info "Health check attempt $attempt/$max_attempts..."

    # Check PostgreSQL
    if docker-compose -f "$TRIGGER_DEV_DIR/docker-compose.yml" exec -T postgres pg_isready -U postgres &> /dev/null; then
      log_success "PostgreSQL is healthy"
    else
      log_warning "PostgreSQL not ready yet"
      sleep 2
      continue
    fi

    # Check Redis
    if docker-compose -f "$TRIGGER_DEV_DIR/docker-compose.yml" exec -T redis redis-cli ping &> /dev/null; then
      log_success "Redis is healthy"
    else
      log_warning "Redis not ready yet"
      sleep 2
      continue
    fi

    # Check MinIO
    if docker-compose -f "$TRIGGER_DEV_DIR/docker-compose.yml" exec -T minio curl -f http://localhost:9000/minio/health/live &> /dev/null; then
      log_success "MinIO is healthy"
    else
      log_warning "MinIO not ready yet"
      sleep 2
      continue
    fi

    # Check ClickHouse
    if docker-compose -f "$TRIGGER_DEV_DIR/docker-compose.yml" exec -T clickhouse wget --spider -q http://localhost:8123/ping &> /dev/null; then
      log_success "ClickHouse is healthy"
    else
      log_warning "ClickHouse not ready yet"
      sleep 2
      continue
    fi

    # Check trigger-webapp
    if docker-compose -f "$TRIGGER_DEV_DIR/docker-compose.yml" exec -T trigger-webapp wget --spider -q http://localhost:3000/health &> /dev/null; then
      log_success "Trigger.dev Web App is healthy"
    else
      log_warning "Trigger.dev Web App not ready yet"
      sleep 2
      continue
    fi

    all_healthy=true
    break
  done

  if [ "$all_healthy" = false ]; then
    log_error "Services failed to become healthy within timeout. Showing logs:"
    docker-compose -f "$TRIGGER_DEV_DIR/docker-compose.yml" logs --tail=50
    exit 1
  fi

  log_success "All services are healthy"
}

# Print access information
print_access_info() {
  log_info "=========================================="
  log_success "Trigger.dev is ready!"
  log_info "=========================================="
  echo ""
  echo -e "${GREEN}Access URLs:${NC}"
  echo "  Web Dashboard: http://localhost:3040"
  echo "  API Endpoint:  http://localhost:3000"
  echo "  MinIO Console: http://localhost:9001"
  echo ""
  echo -e "${GREEN}Service Endpoints (internal):${NC}"
  echo "  PostgreSQL: postgres:5432"
  echo "  Redis:      redis:6379"
  echo "  MinIO:      minio:9000"
  echo "  ClickHouse: clickhouse:8123"
  echo ""
  echo -e "${YELLOW}Configuration:${NC}"
  echo "  Environment file: $ENV_FILE"
  echo "  Docker Compose:   $TRIGGER_DEV_DIR/docker-compose.yml"
  echo ""
  echo -e "${YELLOW}Useful Commands:${NC}"
  echo "  View logs:        docker-compose -f $TRIGGER_DEV_DIR/docker-compose.yml logs -f"
  echo "  Stop services:    docker-compose -f $TRIGGER_DEV_DIR/docker-compose.yml down"
  echo "  Restart services: docker-compose -f $TRIGGER_DEV_DIR/docker-compose.yml restart"
  echo ""
}

# Main execution
main() {
  log_info "=========================================="
  log_info "Trigger.dev Self-Hosted Setup"
  log_info "=========================================="
  echo ""

  check_prerequisites
  create_env_file
  stop_existing
  start_infrastructure
  wait_for_health
  print_access_info

  log_success "Setup complete! You can now use trigger.dev."
}

# Execute main function
main
