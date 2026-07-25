# Docker Reference Configurations

This directory contains reference Docker Compose configurations and environment templates for different deployment scenarios.

## Files

### Docker Compose Files
- `docker-compose.logging.yml` - Centralized logging stack (ELK/Loki)
- `docker-compose.monitoring.yml` - Monitoring stack (Prometheus, Grafana)
- `docker-compose.production.yml` - Production-ready configuration
- `docker-compose.vault.yml` - HashiCorp Vault integration

### Environment Files
- `docker.stabilization.env` - Environment variables for stabilization tests

## Usage

### Development Stack
```bash
# Main development environment
docker-compose up -d

# With monitoring
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# With logging
docker-compose -f docker-compose.yml -f docker-compose.logging.yml up -d
```

### Production Stack
```bash
# Full production stack
docker-compose -f docs/docker/reference/docker-compose.production.yml up -d

# Production with Vault
docker-compose -f docs/docker/reference/docker-compose.production.yml \
              -f docs/docker/reference/docker-compose.vault.yml up -d
```

### Stabilization Testing
```bash
# Load stabilization environment
source docs/docker/reference/docker.stabilization.env

# Run with stabilization config
docker-compose -f docker-compose.yml up -d
```

## Configuration Details

### Production Differences
- Resource limits enforced
- Health checks enabled
- Security contexts applied
- Read-only filesystems where applicable
- Non-root users enforced

### Monitoring Stack
- Prometheus: Metrics collection
- Grafana: Visualization dashboards
- AlertManager: Alert routing
- Node Exporter: Host metrics

### Logging Stack
- Elasticsearch: Log storage
- Logstash: Log processing
- Kibana: Log visualization
- Fluentd: Log forwarding

### Vault Integration
- Secrets management
- Dynamic credentials
- Audit logging
- Key rotation support