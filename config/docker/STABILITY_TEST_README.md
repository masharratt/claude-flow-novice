# 8-Hour Stability Test - Execution Guide

**Phase 2 Sprint 2.3 - Stability Validation**

## Test Objectives

Validate system stability under continuous load with 50 agents over 8 hours:

- **Memory Growth**: <5% over test duration
- **Throughput**: Sustained >1000 msg/s
- **Resource Leaks**: No FD or process leaks
- **CPU Stability**: Consistent performance throughout

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Stability Test Stack                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐      ┌──────────────┐               │
│  │  Stability   │─────▶│   Resource   │               │
│  │  Test        │      │   Monitor    │               │
│  │  (50 agents) │      │   (1s poll)  │               │
│  └──────────────┘      └──────────────┘               │
│         │                      │                        │
│         ▼                      ▼                        │
│  ┌──────────────┐      ┌──────────────┐               │
│  │  Prometheus  │◀─────│ Node Exporter│               │
│  │  (10s scrape)│      │ (sys metrics)│               │
│  └──────────────┘      └──────────────┘               │
│         │                                               │
│         ▼                                               │
│  ┌──────────────┐                                      │
│  │   Grafana    │                                      │
│  │  (realtime)  │                                      │
│  └──────────────┘                                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Prerequisites

**System Requirements:**
- 8GB+ available memory
- 20GB+ disk space
- 4+ CPU cores
- Docker 20.10+
- Docker Compose 1.29+

**Validation:**
```bash
bash scripts/monitoring/pre-test-validation.sh
```

Expected output:
```
✓ All critical checks passed
! Warnings: 1 (WSL detected - test uses Docker)
✗ Errors: 0
```

---

## Quick Start

### 1. Run Pre-Test Validation
```bash
bash scripts/monitoring/pre-test-validation.sh
```

### 2. Launch Test
```bash
bash scripts/monitoring/launch-stability-test.sh
```

### 3. Monitor Progress
- **Grafana**: http://localhost:3001 (admin/stability-test)
- **Prometheus**: http://localhost:9090
- **Logs**: `config/docker/stability-results/test-output-*.log`

### 4. Wait for Completion
Test duration: 8 hours (~28,800 seconds)

### 5. Review Results
Results automatically analyzed and saved to:
- `stability-results/resource-usage-*.csv` (raw data)
- `stability-results/stability-report-*.json` (analysis)

---

## Test Configuration

### Environment Variables
Located in `docker-compose.stability-test.yml`:

```yaml
environment:
  - CFN_MAX_AGENTS=50              # Agent count
  - TEST_DURATION_HOURS=8          # Test duration
  - MESSAGE_THROUGHPUT_TARGET=1000 # Target msg/s
  - MEMORY_GROWTH_THRESHOLD=0.05   # 5% max growth
  - ENABLE_METRICS=true            # Metrics collection
  - METRICS_INTERVAL=10            # Metrics interval (s)
```

### Resource Limits
```yaml
mem_limit: 8g          # Maximum container memory
mem_reservation: 4g    # Reserved memory
cpus: 4                # CPU allocation
```

### Monitoring Configuration

**Resource Monitor** (1s polling):
- Memory (RSS, VSZ, SHM)
- CPU usage
- File descriptors
- Process count
- Disk I/O

**Prometheus** (10s scraping):
- System metrics (node-exporter)
- Application metrics
- Docker metrics

---

## Success Criteria

| Metric | Threshold | Severity |
|--------|-----------|----------|
| Memory Growth | <5% | CRITICAL |
| File Descriptors | <10,000 | CRITICAL |
| Process Count | <500 | CRITICAL |
| CPU Average | <85% | WARNING |
| Throughput | >1000 msg/s | CRITICAL |

---

## Monitoring & Alerts

### Real-Time Monitoring

**Grafana Dashboard Panels:**
1. Memory Usage (RSS) - line graph with min/max/avg
2. CPU Usage - percentage with threshold colors
3. File Descriptors - open vs max with alerts
4. Process Count - total processes over time
5. Test Duration - elapsed time counter
6. Memory Growth % - single stat with color coding
7. Avg CPU % - single stat with thresholds
8. FD Usage % - single stat with warnings

**Alert Thresholds:**
- Memory growth >3% = Yellow
- Memory growth >5% = Red
- CPU usage >70% = Yellow
- CPU usage >85% = Red
- FD usage >60% = Yellow
- FD usage >80% = Red

### Resource Monitor Warnings

Logged to `stability-results/monitor-*.log`:
- Memory RSS >5000MB
- CPU usage >80%
- File descriptors >10,000
- Process count >500

---

## Results Analysis

### Automatic Analysis

On test completion, analyzer script runs:
```bash
node tests/performance/analyze-stability-results.js ./stability-results
```

**Analysis Output:**
```
==========================================================
STABILITY TEST RESULTS
==========================================================

METRICS:
----------------------------------------------------------

Memory:
  Initial: 1024.50 MB
  Final:   1067.32 MB
  Max:     1089.45 MB
  Avg:     1045.67 MB
  Growth:  4.18% (threshold: 5.00%)

CPU:
  Max:     78.45%
  Avg:     45.23%

File Descriptors:
  Initial: 234
  Final:   241
  Max:     256
  Growth:  7

Processes:
  Initial: 12
  Final:   12
  Max:     14

Duration:
  28756s (7.99 hours)
  Samples: 28756

==========================================================
RESULT: ✅ PASS
All success criteria met.
==========================================================
```

### Manual Analysis

**Memory Growth Calculation:**
```bash
INITIAL=$(head -2 resource-usage-*.csv | tail -1 | cut -d',' -f3)
FINAL=$(tail -1 resource-usage-*.csv | cut -d',' -f3)
GROWTH=$(awk -v i=$INITIAL -v f=$FINAL 'BEGIN {printf "%.2f", ((f-i)/i)*100}')
echo "Memory growth: ${GROWTH}%"
```

**Average CPU:**
```bash
tail -n +2 resource-usage-*.csv | awk -F',' '{sum+=$6; count++} END {print sum/count}'
```

**Max File Descriptors:**
```bash
tail -n +2 resource-usage-*.csv | cut -d',' -f7 | sort -n | tail -1
```

---

## Troubleshooting

### Test Fails to Start

**Docker daemon not running:**
```bash
sudo systemctl start docker
```

**Port conflicts:**
```bash
docker-compose -f docker-compose.stability-test.yml down -v
lsof -i :3000,3001,9090,9100
```

**Insufficient memory:**
```bash
docker system prune -a --volumes
```

### Test Fails Mid-Execution

**Check container logs:**
```bash
docker logs cfn-stability-test -f
```

**Check resource monitor:**
```bash
tail -f config/docker/stability-results/monitor-*.log
```

**Prometheus not scraping:**
```bash
curl http://localhost:9090/-/healthy
docker restart cfn-stability-prometheus
```

### High Memory Growth

**Identify leak source:**
```bash
# Check memory timeline
grep "WARNING: High memory" stability-results/monitor-*.log

# Analyze growth pattern
awk -F',' 'NR>1 {print $1","$3}' resource-usage-*.csv | tail -20
```

**Common causes:**
- Event listener leaks (missing `removeAllListeners()`)
- Unclosed connections
- Cache growth without limits
- Timers not cleared (`clearInterval`)

### High CPU Usage

**Check top processes:**
```bash
docker exec cfn-stability-test ps aux --sort=-%cpu | head -10
```

**Profile application:**
```bash
docker exec cfn-stability-test node --prof app.js
```

---

## Test Lifecycle

### 1. Pre-Test Phase
```bash
✓ Validate system requirements
✓ Check Docker availability
✓ Verify configuration files
✓ Ensure ports available
✓ Create results directory
```

### 2. Startup Phase (0-2 minutes)
```bash
✓ Build Docker images
✓ Start monitoring stack (Prometheus, Grafana)
✓ Wait for services to be ready
✓ Launch stability test container
✓ Start resource monitor
```

### 3. Execution Phase (8 hours)
```bash
→ Continuous load: 50 agents
→ Resource monitoring: 1s polling
→ Metrics collection: 10s scraping
→ Real-time dashboards updating
→ Alert threshold monitoring
```

### 4. Completion Phase
```bash
✓ Test completes (28,800s elapsed)
✓ Stop resource monitor
✓ Analyze results automatically
✓ Generate report JSON
✓ Display summary to console
```

### 5. Cleanup Phase
```bash
✓ Stop containers gracefully
✓ Preserve logs and results
✓ Generate final report
✓ Exit with status code
```

---

## File Structure

```
config/docker/
├── docker-compose.stability-test.yml    # Main test configuration
├── prometheus.stability.yml             # Prometheus config
├── grafana-dashboards/
│   ├── dashboard.yml                   # Dashboard provisioning
│   └── stability-monitoring.json       # Dashboard definition
└── stability-results/                  # Test output (created)
    ├── resource-usage-*.csv            # Raw monitoring data
    ├── monitor-*.log                   # Resource monitor log
    ├── test-output-*.log               # Test execution log
    └── stability-report-*.json         # Analysis results

scripts/monitoring/
├── launch-stability-test.sh            # Test launcher
├── pre-test-validation.sh              # Pre-test checks
└── resource-monitor.sh                 # Resource monitoring

tests/performance/
└── analyze-stability-results.js        # Results analyzer
```

---

## Performance Baselines

**Expected Resource Usage (50 agents):**

| Metric | Expected Range |
|--------|----------------|
| Memory (RSS) | 2-4 GB |
| CPU (avg) | 30-60% |
| File Descriptors | 200-500 |
| Process Count | 10-30 |
| Disk I/O | <100 MB/s |

**Acceptable Growth:**
- Memory: <5% (e.g., 2GB → 2.1GB)
- File Descriptors: <50 (e.g., 250 → 300)
- Processes: 0 (no orphaned processes)

---

## Next Steps After Test

### If Test Passes ✅
1. Document baseline metrics in `PERFORMANCE_BASELINE.md`
2. Store results for regression comparison
3. Proceed to next sprint phase
4. Consider scaling test (100 agents, 24 hours)

### If Test Fails ❌
1. Analyze failure mode (memory leak, CPU spike, crash)
2. Review resource monitor logs for patterns
3. Identify root cause (code review, profiling)
4. Implement fixes with targeted agents
5. Re-run test after validation

---

## Support & References

**Documentation:**
- `MEMORY_LEAK_ROOT_CAUSE.md` - Memory leak analysis guide
- `AGENT_PERFORMANCE_GUIDELINES.md` - Performance best practices
- `CLAUDE.md` - Project coordination patterns

**Commands:**
- Validation: `bash scripts/monitoring/pre-test-validation.sh`
- Launch: `bash scripts/monitoring/launch-stability-test.sh`
- Analysis: `node tests/performance/analyze-stability-results.js ./stability-results`
- Cleanup: `docker-compose -f docker-compose.stability-test.yml down -v`

**Monitoring URLs:**
- Grafana: http://localhost:3001
- Prometheus: http://localhost:9090
- Node Exporter: http://localhost:9100/metrics

---

## Test Execution Log

**Date:** [To be filled on execution]
**Duration:** 8 hours
**Agents:** 50
**Result:** [PASS/FAIL]

**Metrics Summary:**
- Memory Growth: __%
- Avg CPU: __%
- Max FD: __
- Throughput: __ msg/s

**Notes:** [Add observations here]
