# Metrics Infrastructure - Phase 1 Sprint 1.1

## Overview

Core metrics emission and monitoring infrastructure for CLI coordination. Provides structured metrics collection in JSONL format with real-time alerting and analysis capabilities.

## Files

- **metrics.sh** - Core metrics emission library
- **analyze-metrics.sh** - Metrics analysis and reporting tool
- **alerting.sh** - Real-time threshold monitoring and alerting

## Quick Start

### 1. Emit a Metric

```bash
source lib/metrics.sh

# Basic emission
emit_metric "coordination.time" "150" "milliseconds" '{"phase":"coordination"}'

# Using convenience functions
emit_coordination_time 150 3 "coordination"
emit_agent_count 5 "active"
emit_delivery_rate 95 100 95
emit_consensus_score 93 4 "validation"
emit_confidence_score 85 "agent-1" 2
```

### 2. Analyze Metrics

```bash
# View aggregated statistics
bash lib/analyze-metrics.sh

# Output: Metrics by type, time series, threshold analysis
```

### 3. Monitor Alerts

```bash
# Check for threshold violations
bash lib/alerting.sh monitor

# Generate alerting report
bash lib/alerting.sh report
```

## Metrics Format (JSONL)

Each metric is a JSON object on a single line:

```json
{
  "timestamp": "2025-10-06T17:44:00.123Z",
  "metric": "coordination.time",
  "value": 150,
  "unit": "milliseconds",
  "tags": {"phase": "coordination", "agent_count": 3}
}
```

## Available Metrics

### Coordination Metrics
- **coordination.time** - Time to complete coordination operation (ms)
- **coordination.agents** - Number of active agents (count)
- **coordination.delivery_rate** - Message delivery success rate (%)
- **coordination.messages** - Message count by direction (count)

### Quality Metrics
- **consensus.score** - Validator consensus percentage (%)
- **agent.confidence** - Agent self-assessed confidence (%)

## Alert Thresholds (Default)

- **Coordination Time**: <100ms (WARNING if exceeded)
- **Delivery Rate**: ≥90% (CRITICAL if below)
- **Consensus Score**: ≥90% (WARNING if below)
- **Confidence Score**: ≥75% (WARNING if below)

## Performance

- **Overhead**: <1% of total execution time (target)
- **Thread Safety**: Uses `flock` for atomic writes
- **Storage**: JSONL format in `/dev/shm` (in-memory, fast)

## Integration Example

See `tests/cli-coordination/example-metrics-integration.sh` for a complete integration demo.

```bash
bash tests/cli-coordination/example-metrics-integration.sh
```

## Testing

Unit tests validate:
- emit_metric() functionality
- JSONL format correctness
- Convenience functions
- Concurrent write safety
- Timestamp format (ISO 8601)

Run tests:
```bash
bash tests/cli-coordination/test-metrics.sh
```

## Configuration

Environment variables:

```bash
# Metrics file location (default: /dev/shm/cfn-metrics.jsonl)
export METRICS_FILE="/path/to/metrics.jsonl"

# Alert thresholds
export THRESHOLD_COORDINATION_TIME_MS=100
export THRESHOLD_DELIVERY_RATE_PCT=90
export THRESHOLD_CONSENSUS_SCORE_PCT=90
export THRESHOLD_CONFIDENCE_SCORE_PCT=75
```

## API Reference

### Core Functions

#### emit_metric()
```bash
emit_metric "metric_name" "value" "unit" "tags_json"
```

Emits a structured metric in JSONL format.

**Parameters:**
- `metric_name` (required) - Metric identifier (e.g., "coordination.time")
- `value` (required) - Numeric value
- `unit` (optional) - Unit of measurement (default: "count")
- `tags` (optional) - JSON object with metadata (default: {})

**Returns:** 0 on success, 1 on error

#### Convenience Functions

```bash
# Coordination time
emit_coordination_time <duration_ms> [agent_count] [phase]

# Agent count
emit_agent_count <count> [status]

# Delivery rate
emit_delivery_rate <rate_percent> [total] [delivered]

# Message count
emit_message_count <count> [direction] [agent_id]

# Consensus score
emit_consensus_score <score> [validator_count] [phase]

# Confidence score
emit_confidence_score <score> [agent_id] [iteration]
```

### Analysis Functions

#### analyze-metrics.sh
```bash
bash lib/analyze-metrics.sh
```

Generates comprehensive metrics analysis:
- Aggregated statistics (avg, min, max, P50, P95, P99)
- Time series trends (last 10 entries)
- Performance threshold analysis
- Tag-based breakdowns

#### alerting.sh
```bash
# Monitor for threshold violations
bash lib/alerting.sh monitor

# Generate alerting report
bash lib/alerting.sh report
```

## File Locations

```
lib/
├── metrics.sh                 # Core library
├── analyze-metrics.sh         # Analysis tool
├── alerting.sh                # Alerting monitor
└── README-METRICS.md          # This file

tests/cli-coordination/
├── test-metrics.sh            # Unit tests
└── example-metrics-integration.sh  # Integration demo
```

## Future Enhancements (Sprint 1.2+)

- [ ] Metrics aggregation pipeline
- [ ] Time-series database integration
- [ ] Grafana/Prometheus exporters
- [ ] Automated alerting actions
- [ ] Metrics retention policies
- [ ] Performance profiling hooks

## Support

For issues or questions, see:
- Sprint 1.1 deliverables in `planning/agent-coordination-v2/`
- Integration tests in `tests/cli-coordination/`
- Post-edit hook logs in `post-edit-pipeline.log`
