# CLI Coordination Configuration

**Phase 1 Sprint 1.3** - Centralized configuration system for CLI coordination

## Overview

The `coordination-config.sh` file provides a centralized configuration system for the CLI coordination infrastructure. All configuration options have sensible defaults optimized for 100-agent production swarms.

## Usage

### Source Configuration

```bash
# Source in your script
source config/coordination-config.sh

# Configuration auto-loads and validates
# All CFN_* environment variables are now available
```

### View Configuration

```bash
# Execute directly to print current configuration
bash config/coordination-config.sh
```

### Override Defaults

```bash
# Override before sourcing
export CFN_MAX_AGENTS=200
export CFN_SHARD_COUNT=32
source config/coordination-config.sh
```

## Configuration Options

### Storage Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CFN_BASE_DIR` | `/dev/shm/cfn` | Base directory for coordination infrastructure |
| `CFN_METRICS_DIR` | `$CFN_BASE_DIR/metrics` | Metrics storage directory |
| `CFN_METRICS_FILE` | `$CFN_METRICS_DIR/cfn-metrics.jsonl` | Metrics data file |
| `CFN_HEALTH_DIR` | `$CFN_BASE_DIR/health` | Health monitoring directory |
| `CFN_HEALTH_FILE` | `$CFN_HEALTH_DIR/agent-health.jsonl` | Health data file |
| `CFN_ALERT_DIR` | `$CFN_BASE_DIR/alerts` | Alert storage directory |
| `CFN_ALERT_FILE` | `$CFN_ALERT_DIR/cfn-alerts.jsonl` | Alert data file |

**Why `/dev/shm`?** In-memory filesystem for minimal I/O latency (<1ms vs 5-20ms for disk).

### Performance Configuration

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `CFN_MAX_AGENTS` | `100` | 1-1000 | Maximum concurrent agents supported |
| `CFN_SHARD_COUNT` | `16` | 1-64 | Number of shards for metrics distribution |
| `CFN_BATCH_SIZE` | `10` | 1-100 | Metrics per batch for processing |

**Tuning Guidelines:**
- **10-50 agents**: `CFN_SHARD_COUNT=8`
- **50-100 agents**: `CFN_SHARD_COUNT=16` (default)
- **100-200 agents**: `CFN_SHARD_COUNT=32`
- **200+ agents**: `CFN_SHARD_COUNT=64`

### Timeout Configuration

| Variable | Default | Range (ms) | Description |
|----------|---------|------------|-------------|
| `CFN_COORDINATION_TIMEOUT` | `10000` | 100-300000 | Coordination phase timeout |
| `CFN_HEALTH_TIMEOUT` | `30` | 1-300 | Health check timeout (seconds) |
| `CFN_MESSAGE_TIMEOUT` | `5000` | 100-60000 | Message delivery timeout |

**Production Recommendations:**
- **LAN deployment**: Keep defaults
- **WAN/cloud deployment**: `CFN_COORDINATION_TIMEOUT=30000`, `CFN_MESSAGE_TIMEOUT=10000`
- **Low-latency requirement**: `CFN_COORDINATION_TIMEOUT=5000`, `CFN_MESSAGE_TIMEOUT=2000`

### Monitoring Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CFN_METRICS_ENABLED` | `true` | Enable metrics collection |
| `CFN_ALERTING_ENABLED` | `true` | Enable alerting system |
| `CFN_ALERT_INTERVAL` | `30` | Alert check interval (seconds) |

**Performance Impact:**
- Metrics collection: <1% overhead
- Alerting: <0.1% overhead (background monitoring)

### Alerting Thresholds

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `CFN_ALERT_COORD_TIME_MS` | `10000` | 100-60000 | Coordination time threshold (ms) |
| `CFN_ALERT_DELIVERY_RATE` | `90` | 1-100 | Minimum delivery rate (%) |
| `CFN_ALERT_CONSENSUS_SCORE` | `90` | 1-100 | Minimum consensus score (%) |
| `CFN_ALERT_CONFIDENCE_SCORE` | `75` | 1-100 | Minimum confidence score (%) |

**Threshold Tuning:**
- **Critical systems**: Increase thresholds (95% delivery, 95% consensus)
- **Development**: Decrease for more alerts (85% delivery, 80% consensus)
- **Production (default)**: Balanced thresholds for actionable alerts

### Data Retention Configuration

| Variable | Default | Range (hours) | Description |
|----------|---------|---------------|-------------|
| `CFN_METRICS_RETENTION_HOURS` | `48` | 1-720 | Metrics retention period |
| `CFN_ALERT_RETENTION_HOURS` | `24` | 1-720 | Alert retention period |
| `CFN_HEALTH_RETENTION_HOURS` | `12` | 1-720 | Health check retention period |

**Storage Estimates** (100 agents, default retention):
- Metrics: ~50MB (48h × 100 agents × 10KB/h)
- Alerts: ~5MB (24h × average 5 alerts/h × 40KB)
- Health: ~12MB (12h × 100 agents × 10KB/h)
- **Total**: ~67MB in `/dev/shm`

## Validation

Configuration is automatically validated when loaded:

```bash
source config/coordination-config.sh
# Output on success:
# Configuration loaded successfully

# Output on error:
# ERROR: CFN_MAX_AGENTS must be 1-1000, got 2000
# ERROR: Configuration validation failed
```

### Validation Rules

1. **Numeric ranges**: All numeric values validated against min/max
2. **Boolean values**: Must be `true` or `false`
3. **Directory permissions**: Parent directories must exist and be writable
4. **Dependencies**: Directories created automatically if missing

## Functions

### `validate_config()`

Validates all configuration values against defined ranges.

**Returns:** `0` on success, error count on failure

**Example:**
```bash
source config/coordination-config.sh
if validate_config; then
  echo "Configuration valid"
fi
```

### `load_config()`

Loads and validates configuration, creates required directories.

**Returns:** `0` on success, `1` on failure

**Example:**
```bash
if load_config; then
  # Configuration loaded successfully
  echo "Ready to start coordination"
fi
```

### `print_config()`

Displays current configuration values in human-readable format.

**Example:**
```bash
source config/coordination-config.sh
print_config
# Outputs formatted configuration table
```

### `init_directories()`

Creates all required directories for coordination infrastructure.

**Returns:** `0` on success, `1` on failure

**Example:**
```bash
if init_directories; then
  echo "Directories initialized"
fi
```

## Environment-Specific Configurations

### Development Environment

```bash
export CFN_MAX_AGENTS=10
export CFN_SHARD_COUNT=4
export CFN_ALERT_DELIVERY_RATE=80
export CFN_METRICS_RETENTION_HOURS=12
source config/coordination-config.sh
```

### Staging Environment

```bash
export CFN_MAX_AGENTS=50
export CFN_SHARD_COUNT=8
export CFN_COORDINATION_TIMEOUT=15000
export CFN_METRICS_RETENTION_HOURS=24
source config/coordination-config.sh
```

### Production Environment (High-Scale)

```bash
export CFN_MAX_AGENTS=200
export CFN_SHARD_COUNT=32
export CFN_ALERT_CONSENSUS_SCORE=95
export CFN_METRICS_RETENTION_HOURS=72
source config/coordination-config.sh
```

## Integration Examples

### Metrics Library Integration

```bash
#!/usr/bin/env bash
source config/coordination-config.sh
source lib/metrics.sh

# Metrics automatically use CFN_METRICS_FILE from config
emit_coordination_time 150 5 "coordination-phase"
```

### Health Monitoring Integration

```bash
#!/usr/bin/env bash
source config/coordination-config.sh
source lib/health.sh

# Health checks automatically use CFN_HEALTH_FILE from config
check_agent_health "agent-1"
```

### Alerting Integration

```bash
#!/usr/bin/env bash
source config/coordination-config.sh
source lib/alerting.sh

# Alerting uses thresholds from config
check_thresholds "$CFN_METRICS_FILE"
```

## Troubleshooting

### Configuration Validation Fails

**Symptom:** `ERROR: Configuration validation failed`

**Solution:**
1. Check error messages for specific failures
2. Verify environment variable values are within ranges
3. Ensure parent directories exist and are writable

### Directory Creation Fails

**Symptom:** `ERROR: Failed to create directory: /dev/shm/cfn`

**Solution:**
1. Verify `/dev/shm` is mounted: `df -h /dev/shm`
2. Check permissions: `ls -ld /dev/shm`
3. Try alternative base directory: `export CFN_BASE_DIR=/tmp/cfn`

### Performance Issues

**Symptom:** High coordination times or low delivery rates

**Solution:**
1. Increase shard count for agent count
2. Increase timeout values for network latency
3. Monitor `/dev/shm` space: `df -h /dev/shm`

## Best Practices

1. **Environment Variables First**: Set overrides before sourcing
2. **Validate Early**: Source config at script start to catch errors early
3. **Document Overrides**: Comment why production values differ from defaults
4. **Monitor Retention**: Adjust retention based on `/dev/shm` size
5. **Test Validation**: Run with invalid values to verify validation works

## Migration from Hardcoded Values

### Before (Hardcoded)

```bash
METRICS_FILE="/dev/shm/cfn-metrics.jsonl"
MAX_AGENTS=100
COORD_TIMEOUT=10000
```

### After (Centralized Config)

```bash
source config/coordination-config.sh
# All values available as CFN_* variables
# Defaults match previous hardcoded values
# Can override with environment variables
```

## Related Documentation

- [Metrics Infrastructure](../lib/README-METRICS.md)
- [Health Monitoring](../lib/README-HEALTH.md)
- [Alerting System](../lib/README-ALERTING.md)
- [CLI Coordination Architecture](../planning/agent-coordination-v2/METRICS_COLLECTION_ARCHITECTURE.md)

## Version History

- **v1.0.0** (Sprint 1.3): Initial centralized configuration system
  - Environment variable overrides
  - Comprehensive validation
  - Auto-initialization of directories
  - Default values optimized for 100-agent swarm
