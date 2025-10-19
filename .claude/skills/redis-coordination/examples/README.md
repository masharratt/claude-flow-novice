# CFN Loop Metrics Dashboard

## Grafana Dashboard for CFN Loop Performance Monitoring

### Dashboard Overview

This Grafana dashboard is designed to visualize and monitor the performance metrics of Continuous Flow Normalization (CFN) Loop iterations. It provides insights into:

- Iteration Duration Trends
- Consensus Convergence
- Agent Latency
- Error Rates

### Prerequisites

- Prometheus as the metrics backend
- Grafana 7.3.7 or higher
- Configured Prometheus metrics for CFN Loop

### Metrics Requirements

The following Prometheus metrics must be exported:

1. `cfn_loop_iteration_duration_seconds`
   - Time series of iteration durations
   - Labels: `iteration`

2. `cfn_loop_confidence`
   - Confidence scores for Loop 3
   - Labels: `stage="loop3"`

3. `cfn_loop_consensus`
   - Consensus scores for Loop 2
   - Labels: `stage="loop2"`

4. `cfn_loop_agent_latency_seconds_bucket`
   - Histogram of agent latencies
   - Labels: `agent_id`

5. `cfn_loop_errors_total`
   - Counter for different error types
   - Labels: `error_type` (e.g., "timeout", "retry", "quorum_fallback", "gate_failure")

### Installation Steps

1. Open Grafana
2. Navigate to Dashboard > Import
3. Upload `grafana-dashboard.json`
4. Select Prometheus data source
5. Click "Import"

### Customization

- Adjust time ranges in the dashboard settings
- Modify thresholds in panel configurations as needed

### Troubleshooting

- Ensure all required Prometheus metrics are being exported
- Check data source configuration
- Verify metric naming matches exported metrics

### Performance Tuning

The dashboard is optimized for minimal performance overhead:
- Uses efficient PromQL queries
- Configurable refresh intervals
- Dark theme for reduced eye strain during long monitoring sessions

### Version

- Dashboard Version: 1.0.0
- Last Updated: 2025-10-19