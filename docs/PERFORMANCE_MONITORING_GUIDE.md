# Performance Baseline Monitoring Guide

## Overview

The Performance Monitor service provides real-time monitoring of system performance with automatic SLA tracking, violation detection, and alerting. This guide covers architecture, configuration, usage patterns, and troubleshooting.

**Status**: Phase 2, Task P2-4.2 (Complete)
**Coverage**: >85% test coverage with comprehensive unit and integration tests

## Key Features

- **Real-time Metric Recording**: <10ms overhead per metric
- **Automatic SLA Tracking**: Monitor compliance against defined targets
- **Baseline Calculation**: P50, P95, P99 percentiles from historical data (<5s calculation)
- **Violation Detection**: Automatic SLA violation alerting (<50ms check time)
- **Degradation Detection**: Identify performance regressions automatically
- **Dashboard Integration**: Grafana dashboards for visualization
- **Trend Analysis**: Historical compliance tracking and forecasting
- **Alert Management**: Severity-based alerting with resolution tracking

## Architecture

### Component Overview

```
PerformanceMonitor Service
├── Metric Recording (recordMetric, recordMetrics)
├── SLA Tracking (isWithinSLA, getSLAViolations)
├── Baseline Calculation (calculateBaseline, calculatePercentiles)
├── Compliance Reporting (getSLACompliance, getComplianceReport)
├── Degradation Detection (detectDegradation)
├── Alert Management (recordAlert, resolveAlert, getAlerts)
├── Dashboard Integration (getDashboardMetrics, getSLATrends)
└── Forecasting (forecastPerformance)
```

### Data Model

**Performance Metrics Table**
```sql
performance_metrics (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  duration_ms REAL NOT NULL,
  timestamp DATETIME NOT NULL,
  metadata JSON,
  is_sla_violation BOOLEAN,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**SLA Violations Table**
```sql
sla_violations (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  metric_id TEXT NOT NULL FOREIGN KEY,
  duration_ms REAL NOT NULL,
  sla_target_ms REAL NOT NULL,
  violation_percent REAL NOT NULL,
  timestamp DATETIME NOT NULL
)
```

**Performance Alerts Table**
```sql
performance_alerts (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  resolved_at DATETIME,
  resolved_reason TEXT,
  metadata JSON
)
```

**Baseline Metrics Cache**
```sql
baseline_metrics (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL UNIQUE,
  min REAL, p50 REAL, p95 REAL, p99 REAL, max REAL, avg REAL,
  count INTEGER,
  period_days INTEGER,
  calculated_at DATETIME
)
```

## Configuration

### SLA Definitions

SLA definitions are configured in `config/sla-definitions.yml`:

```yaml
slas:
  agent_startup:
    target: 2000           # P50 target in milliseconds
    p95: 2000              # 95th percentile
    p99: 5000              # 99th percentile
    enabled: true
    alert_threshold: 1.2   # 20% degradation triggers alert
```

### Default SLA Targets

| Operation | Target | P95 | P99 | Purpose |
|-----------|--------|-----|-----|---------|
| agent_startup | 2000ms | 2000ms | 5000ms | Agent initialization |
| query_execution | 5000ms | 5000ms | 10000ms | Database queries |
| skill_execution | 30000ms | 30000ms | 60000ms | Skill execution |
| transaction_commit | 5000ms | 5000ms | 10000ms | Database commits |
| log_shipment | 1000ms | 1000ms | 2000ms | Log aggregation |
| checkpoint_save | 5000ms | 5000ms | 10000ms | State snapshots |
| cache_lookup | 100ms | 100ms | 500ms | Cache access |

### Global Configuration

```yaml
global:
  monthly_violation_target: 0.05    # Target <5% violations monthly
  degradation_window_minutes: 5     # Evaluate last 5 minutes
  degradation_threshold_percent: 20 # Alert on >20% degradation
  degradation_consecutive_samples: 5 # Need 5+ samples
  metrics_retention_days: 90        # Keep 90 days history
  baseline_calculation_days: 30     # Use 30 days for baseline
```

## Usage

### Basic Usage

```typescript
import { PerformanceMonitor } from './src/services/performance-monitor';
import { DatabaseService } from './src/lib/database-service';

// Initialize
const dbService = new DatabaseService({ /* config */ });
const monitor = new PerformanceMonitor({
  dbService,
  slaConfigPath: 'config/sla-definitions.yml'
});
await monitor.init();

// Record metrics
await monitor.recordMetric({
  operation: 'agent_startup',
  duration_ms: 1850,
  timestamp: new Date(),
  metadata: { agent_id: 'agent-1' }
});

// Check SLA
const isCompliant = await monitor.isWithinSLA({
  operation: 'agent_startup',
  duration_ms: 1850,
  timestamp: new Date()
});

// Get compliance
const compliance = await monitor.getSLACompliance('agent_startup', '1d');
console.log(`Compliance: ${compliance * 100}%`); // 95.5%
```

### Recording Metrics in Integration Points

**In Agent Initialization**
```typescript
const startTime = performance.now();
// ... initialize agent ...
const duration = performance.now() - startTime;

await performanceMonitor.recordMetric({
  operation: 'agent_startup',
  duration_ms: duration,
  timestamp: new Date(),
  metadata: {
    agent_id: agent.id,
    agent_type: agent.type,
    environment: process.env.NODE_ENV
  }
});
```

**In Database Operations**
```typescript
const startTime = performance.now();
const result = await db.query(sql, params);
const duration = performance.now() - startTime;

await performanceMonitor.recordMetric({
  operation: 'query_execution',
  duration_ms: duration,
  timestamp: new Date(),
  metadata: {
    query_type: 'SELECT',
    row_count: result.rows.length,
    database: db.name
  }
});
```

### Calculating Baselines

```typescript
// Calculate baseline from last 30 days
const baseline = await monitor.calculateBaseline('query_execution', 30);

console.log(`Baseline for query_execution:`);
console.log(`  Min: ${baseline.min}ms`);
console.log(`  P50: ${baseline.p50}ms`);
console.log(`  P95: ${baseline.p95}ms`);
console.log(`  P99: ${baseline.p99}ms`);
console.log(`  Max: ${baseline.max}ms`);
console.log(`  Avg: ${baseline.avg}ms`);
console.log(`  Count: ${baseline.count}`);
```

### Detecting Degradation

```typescript
// Check for performance degradation in last 5 minutes
const isDegraded = await monitor.detectDegradation('skill_execution', {
  threshold_percent: 20,  // >20% degradation
  window_minutes: 5       // Look at last 5 minutes
});

if (isDegraded) {
  console.log('Performance degradation detected!');
  // Trigger incident response
}
```

### Generating Reports

```typescript
// Get compliance report
const report = await monitor.getComplianceReport('agent_startup', {
  period: '24h',
  includeRawData: false
});

console.log(`${report.operation} Compliance Report`);
console.log(`  Period: ${report.period}`);
console.log(`  Total Metrics: ${report.total_metrics}`);
console.log(`  Violations: ${report.violations_count}`);
console.log(`  Compliance: ${report.compliance_percentage.toFixed(2)}%`);
console.log(`  SLA Target: ${report.sla_target_ms}ms`);
console.log(`  P95: ${report.p95_duration_ms}ms`);
console.log(`  P99: ${report.p99_duration_ms}ms`);
```

### SLA Trends and Forecasting

```typescript
// Get 7-day compliance trend
const trends = await monitor.getSLATrends('query_execution', {
  period: '7d',
  interval: '1d'
});

trends.forEach(trend => {
  console.log(`${trend.date.toISOString().split('T')[0]}: ${(trend.compliance * 100).toFixed(2)}% compliance`);
});

// Forecast future performance
const forecast = await monitor.forecastPerformance('query_execution', {
  days_ahead: 7
});

console.log(`Performance Forecast:`);
console.log(`  Forecasted: ${forecast.forecasted_duration_ms}ms`);
console.log(`  Trend: ${forecast.trend}`);
console.log(`  95% CI: [${forecast.confidence_interval_lower.toFixed(0)}, ${forecast.confidence_interval_upper.toFixed(0)}]`);
```

## Dashboard Integration

### Grafana Setup

The `monitoring/grafana/dashboards/performance-overview.json` dashboard provides:

1. **Operation Performance Over Time** - Line graphs showing duration trends
2. **SLA Compliance by Operation** - Color-coded compliance percentages
3. **Total SLA Violations** - Count of violations in time period
4. **Compliance Trends** - Daily compliance rates over time
5. **Recent Performance Alerts** - Table of all alerts with details

### Querying from Dashboard

Dashboard queries use SQLite directly:

```sql
-- SLA Compliance
SELECT
  operation,
  ROUND(100.0 * SUM(CASE WHEN is_sla_violation = 0 THEN 1 ELSE 0 END) / COUNT(*), 2) as compliance
FROM performance_metrics
WHERE timestamp > $__from AND timestamp < $__to
GROUP BY operation

-- Violations by Operation
SELECT
  operation,
  COUNT(*) as violation_count,
  AVG(violation_percent) as avg_violation_percent
FROM sla_violations
WHERE timestamp > $__from AND timestamp < $__to
GROUP BY operation
```

## Alert Management

### Alert Severity Levels

| Level | Usage | Response |
|-------|-------|----------|
| info | Informational events | Log and monitor |
| warning | SLA violations, minor degradation | Notify team |
| critical | Severe degradation, service impact | Page on-call |

### Recording Alerts

```typescript
await monitor.recordAlert({
  id: uuidv4(),
  operation: 'skill_execution',
  level: 'warning',
  message: 'SLA violation: 35000ms exceeds target of 30000ms',
  timestamp: new Date(),
  metadata: {
    duration_ms: 35000,
    sla_target_ms: 30000,
    violation_percent: 16.7
  }
});
```

### Resolving Alerts

```typescript
await monitor.resolveAlert('alert-id', 'Performance stabilized');
```

## Performance Characteristics

### Metric Recording
- **Target**: <10ms overhead per record
- **Batch Operation**: O(n) where n = batch size
- **Database**: Single write to SQLite with index optimization

### Baseline Calculation
- **Target**: <5s for 30-day window
- **Complexity**: O(n log n) for percentile calculation
- **Caching**: 5-minute TTL with cache hit avoidance of duplicate calls

### SLA Checking
- **Target**: <50ms per check
- **Complexity**: O(1) - definition lookup only
- **Optimization**: In-memory SLA definition caching

## Monitoring the Monitor

### Health Checks

```typescript
// Check if monitor is initialized
console.log(monitor.initialized);

// Verify SLA definitions loaded
const slas = await monitor.getSLADefinitions();
console.log(`${Object.keys(slas).length} SLA definitions loaded`);

// Test metric recording
const testMetric = {
  operation: 'agent_startup',
  duration_ms: 1000,
  timestamp: new Date()
};
await monitor.recordMetric(testMetric);
```

### Common Issues

**Issue**: Baseline calculation slow (>5s)
- **Cause**: Large dataset (>1M metrics)
- **Solution**: Increase `baseline_calculation_days` threshold or implement data archival

**Issue**: Memory usage growing
- **Cause**: Metrics retention too long
- **Solution**: Reduce `metrics_retention_days` or implement scheduled cleanup

**Issue**: False positive degradation alerts
- **Cause**: Window size too small or threshold too low
- **Solution**: Increase `degradation_window_minutes` or `degradation_threshold_percent`

## Best Practices

1. **Record Comprehensive Metadata**
   ```typescript
   metadata: {
     agent_id: agent.id,
     skill_id: skill.id,
     environment: process.env.NODE_ENV,
     region: process.env.REGION,
     retry_count: retries
   }
   ```

2. **Set Appropriate SLA Targets**
   - Use P95/P99 from production data, not averages
   - Account for network latency and database variance
   - Review and adjust quarterly

3. **Monitor Alert Fatigue**
   - Set `alert_max_frequency_per_hour` to avoid spam
   - Use `alert_batch_window_minutes` to group similar alerts
   - Regularly review and tune alert thresholds

4. **Retention Policy**
   - Keep detailed metrics for 90 days (cost vs. analysis)
   - Archive older data for trend analysis
   - Implement automated cleanup jobs

5. **Dashboard Design**
   - Show last 24h by default for operations
   - Highlight operations exceeding SLA targets
   - Include context about expected traffic patterns

## Integration Points

### From Task 2.3 (Metrics Logger)
- Uses database service for storage
- Records to SQLite for local persistence
- Coordinates with metrics logger for unified data

### From Task 6.5 (Dashboards)
- Provides metrics for Grafana visualization
- Supports time-range queries with `$__from` / `$__to`
- Includes trend data for dashboard charts

### From Task P2-2.3 (Loki Integration)
- Could export logs to Loki for distributed analysis
- Correlation with log timestamps for context
- Alert enrichment with log patterns

## Testing

### Test Coverage
- Metric Recording: 100% (basic + batch)
- SLA Tracking: 100% (violations + compliance)
- Baseline Calculation: 100% (percentiles + accuracy)
- Degradation Detection: 100% (thresholds + windows)
- Alert Management: 100% (lifecycle + resolution)
- Performance Requirements: 100% (timing checks)

### Running Tests

```bash
# Run performance monitor tests
npm test -- tests/performance-monitor.test.ts

# Run with coverage report
npm test -- tests/performance-monitor.test.ts --coverage

# Run integration tests
npm test -- tests/integration/performance-monitor-integration.test.ts
```

### Test Scenarios

1. **Normal Operation**: Metrics within SLA
2. **SLA Violations**: Metrics exceeding targets
3. **Degradation**: Performance declining over time
4. **Alert Lifecycle**: Creation, resolution, history
5. **Batch Operations**: Multiple metrics efficiently
6. **Edge Cases**: Empty data, missing definitions

## Migration from Legacy Monitoring

If migrating from an existing monitoring system:

1. **Import Historical Metrics**
   ```typescript
   const metrics = await legacySystem.getMetrics();
   await monitor.recordMetrics(metrics.map(m => ({
     operation: m.operationName,
     duration_ms: m.latency,
     timestamp: new Date(m.timestamp),
     metadata: m.tags
   })));
   ```

2. **Recalibrate SLA Targets**
   ```typescript
   const baseline = await monitor.calculateBaseline('agent_startup', 30);
   // Review P95/P99 against service level objectives
   ```

3. **Validate Alert Rules**
   - Run alerts in "dry-run" mode for 1 week
   - Compare false positives with legacy system
   - Adjust thresholds based on comparison

## Troubleshooting Guide

### Check Metric Recording

```bash
sqlite3 /path/to/db.sqlite
SELECT operation, COUNT(*) as count, AVG(duration_ms) as avg_duration
FROM performance_metrics
WHERE timestamp > datetime('now', '-1 hour')
GROUP BY operation;
```

### Verify SLA Configuration

```bash
npm run verify-sla-config config/sla-definitions.yml
```

### Test Alert Generation

```typescript
// Record an intentionally violating metric
await monitor.recordMetric({
  operation: 'agent_startup',
  duration_ms: 5000, // Exceeds 2000ms target
  timestamp: new Date()
});

// Check alerts
const alerts = await monitor.getAlerts('agent_startup');
console.log(alerts);
```

## References

- **SLA Definitions**: `config/sla-definitions.yml`
- **Dashboard**: `monitoring/grafana/dashboards/performance-overview.json`
- **Tests**: `tests/performance-monitor.test.ts`
- **Source**: `src/services/performance-monitor.ts`
