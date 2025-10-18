# Resource Monitoring Scripts

Real-time system resource monitoring for agent coordination tests.

## Scripts

### resource-monitor.sh
Collects system metrics every 1 second during test execution.

**Metrics Tracked:**
- Memory: RSS, VSZ, shared memory (tmpfs)
- CPU: Total usage across all node processes
- File Descriptors: Count of open FDs
- Processes: Total node/npm process count
- Disk I/O: Read/write operations (if available)

**Output:** CSV file with timestamped metrics

**Usage:**
```bash
./resource-monitor.sh [output_dir]

# Example
./resource-monitor.sh ./reports/monitoring
```

**CSV Format:**
```
timestamp,elapsed_sec,memory_rss_mb,memory_vsz_mb,memory_shm_mb,cpu_percent,fd_count,process_count,node_processes,io_read_mb,io_write_mb
```

### analyze-resources.sh
Analyzes monitoring CSV and detects anomalies.

**Analysis:**
- Peak resource usage
- Growth rates and trends
- Memory leak detection (>1 MB/sec growth)
- CPU spike detection (>80% sustained)
- FD leak detection (unclosed descriptors)
- Process leak detection (orphaned processes)

**Usage:**
```bash
./analyze-resources.sh <csv_file>

# Example
./analyze-resources.sh ./reports/monitoring/resource-usage-20250106_120000.csv
```

**Output:** Text report with anomaly summary

### monitor-test.sh
Wrapper script that monitors a test command.

**Features:**
- Starts monitor before test
- Runs test command
- Stops monitor after test
- Auto-analyzes results

**Usage:**
```bash
./monitor-test.sh "<test_command>"

# Example - Monitor 100-agent coordination test
./monitor-test.sh "bash tests/integration/100-agent-coordination.test.sh"

# Example - Monitor with npm
./monitor-test.sh "npm test -- tests/integration/100-agent-coordination.test.sh"
```

## Leak Detection Thresholds

### Memory Leak
- **Critical**: Growth rate >1.0 MB/sec
- **Warning**: Growth rate >0.1 MB/sec
- **OK**: Growth rate ≤0.1 MB/sec

### CPU Spike
- **Critical**: >5 samples above 80% CPU
- **OK**: ≤5 samples above 80%

### File Descriptor Leak
- **Critical**: Growth >100 FDs
- **Warning**: Growth >20 FDs
- **OK**: Growth ≤20 FDs

### Process Leak
- **Critical**: Growth >50 processes
- **Warning**: Growth >10 processes
- **OK**: Growth ≤10 processes

## Example Workflow

```bash
# 1. Monitor the 100-agent coordination test
cd /mnt/c/Users/masha/Documents/claude-flow-novice
./scripts/monitoring/monitor-test.sh "bash tests/integration/100-agent-coordination.test.sh"

# 2. Review results
ls -lh reports/monitoring/

# Output files:
# - resource-usage-20250106_120000.csv (raw metrics)
# - analysis-report-20250106_120500.txt (anomaly report)
# - monitor-20250106_120000.log (event log)

# 3. Review analysis report
cat reports/monitoring/analysis-report-*.txt
```

## Interpreting Results

### Healthy System
```
Memory Growth: 0.05 MB/sec
CPU Spikes: 2 samples above 80%
FD Growth: 5
Process Growth: 2
Anomalies: 0
```

### Memory Leak Detected
```
Memory Growth: 2.3 MB/sec ⚠️
CPU Spikes: 1 sample above 80%
FD Growth: 8
Process Growth: 3
Anomalies: 1
```

### Multiple Issues
```
Memory Growth: 1.5 MB/sec ⚠️
CPU Spikes: 12 samples above 80% ⚠️
FD Growth: 150 ⚠️
Process Growth: 75 ⚠️
Anomalies: 4
```

## Troubleshooting

### Monitor doesn't start
```bash
# Check permissions
chmod +x scripts/monitoring/*.sh

# Check dependencies
which bc ps awk
```

### No data in CSV
```bash
# Check if node processes exist
pgrep -f node

# Verify output directory
ls -la reports/monitoring/
```

### Analysis fails
```bash
# Verify CSV format
head -5 reports/monitoring/resource-usage-*.csv

# Check for bc utility
which bc || sudo apt-get install bc
```

## Integration with Tests

The monitoring scripts are designed to work with:
- `tests/integration/100-agent-coordination.test.sh`
- `tests/performance/phase1-overhead-benchmark.sh`
- Any long-running agent coordination tests

Monitor results should be reviewed for each major test run to ensure system stability.
