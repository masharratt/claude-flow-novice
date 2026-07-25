# Performance Benchmarks - Quick Start Guide

## 30-Second TL;DR

```bash
# Run all socket proxy performance benchmarks
bash tests/performance/run-all-benchmarks.sh

# View results
cat planning/trigger/PERFORMANCE_BENCHMARK_REPORT.md
```

**Expected Time:** 10-15 minutes
**Expected Result:** All benchmarks pass, report generated

---

## What Do These Benchmarks Test?

Socket proxy adds a security layer between containers and Docker socket. We measure the performance impact:

| Benchmark | What | Time |
|-----------|------|------|
| **Create Latency** | Time to create+remove container | 2 min |
| **Lifecycle** | Full create→start→stop→remove | 3 min |
| **Throughput** | Concurrent operations per second | 5 min |
| **Report** | Summary and analysis | 1 min |

---

## Running Benchmarks

### All Benchmarks (Recommended)

```bash
cd /path/to/cfn-agent-orchestration
bash tests/performance/run-all-benchmarks.sh
```

Generates:
- `.artifacts/performance-benchmarks/*.txt` - Raw results
- `planning/trigger/PERFORMANCE_BENCHMARK_REPORT.md` - Full analysis

### Individual Benchmarks

```bash
# Just container creation latency
bash tests/performance/benchmark-container-create.sh

# Full lifecycle (create, start, stop, remove)
bash tests/performance/benchmark-container-lifecycle.sh

# Concurrent throughput test
bash tests/performance/benchmark-throughput.sh
```

### Validation Only (No Overhead Testing)

```bash
# Just check syntax, don't run
for script in tests/performance/*.sh; do
  bash -n "$script" && echo "✓ $script"
done
```

---

## Understanding Results

### Success Criteria

Each benchmark has specific thresholds:

| Benchmark | Pass Condition |
|-----------|----------------|
| Container Create | Overhead ≤10ms AND ≤20% |
| Container Lifecycle | Overhead ≤15% |
| Throughput | Reduction ≤25% |

### Example Output

```
Direct Socket:    75ms
Socket Proxy:     90ms
Overhead:         15ms (+20%)
Status:           ✓ PASS
```

**What this means:**
- Direct socket (baseline): 75ms
- Through proxy: 90ms
- Performance cost: 15ms per operation
- Percentage impact: 20%
- Conclusion: Acceptable for security benefit

---

## Interpreting the Report

After benchmarks complete, check: `planning/trigger/PERFORMANCE_BENCHMARK_REPORT.md`

**Key Sections:**
1. **Executive Summary** - Pass/fail and recommendation
2. **Results** - Metrics for each benchmark
3. **Impact Analysis** - Real-world CFN Loop overhead
4. **Deployment Recommendations** - Configuration and monitoring

**TL;DR:** Look for **"APPROVED FOR PRODUCTION"** and benchmark status indicators

---

## Common Issues

### Benchmarks Won't Start

```bash
# Verify Docker is running
docker ps

# If not, start it
sudo systemctl start docker  # Linux
open /Applications/Docker.app  # macOS
```

### Socket Proxy Fails to Become Healthy

```bash
# Check proxy logs
docker compose -f docker/docker-compose.yml logs socket-proxy

# Restart it
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up -d socket-proxy
```

### Benchmarks Are Slow

- Run on an idle system
- Close other applications
- Increase Docker daemon memory

### "Connection Refused" Errors

```bash
# Verify socket proxy is responding
curl http://localhost:2375/containers/json

# If not, restart services
docker compose -f docker/docker-compose.yml restart
```

---

## What Gets Tested?

### ✅ Covered

- Container creation performance
- Full container lifecycle (create, start, stop, remove)
- Concurrent operation throughput
- Latency overhead quantification
- Production socket proxy configuration

### ❌ Not Covered (Out of Scope)

- Network performance
- Memory overhead
- Disk I/O performance
- Specific agent execution time
- Application-level benchmarks

---

## Performance Expectations

### Latency Overhead

**Per operation:** ~5-15ms
**Per agent spawn:** ~40-80ms
**Per CFN Loop iteration:** ~0.5-2s (across all waves)
**Percentage impact:** <1% of 15-25 minute execution

### Throughput Impact

**Direct socket:** 35-45 ops/sec
**Socket proxy:** 28-38 ops/sec
**Reduction:** 15-20%

### Verdict

✅ **Acceptable** - Security benefits outweigh minimal performance cost

---

## Benchmark Details

### Container Create Latency

**What it does:**
1. Creates a container 10 times with direct socket
2. Records each operation time
3. Starts socket proxy
4. Creates a container 10 times through proxy
5. Compares results

**Why it matters:**
- Coordinator creates 10-100 containers per iteration
- Direct impact on agent spawning speed
- Most frequent operation

### Container Lifecycle

**What it does:**
1. Full workflow: create → start → sleep 1s → stop → remove
2. Repeats 5 times with each approach
3. Compares total times

**Why it matters:**
- Simulates real agent spawning
- Tests cumulative overhead
- Multiple socket operations

### Throughput

**What it does:**
1. 5 concurrent workers
2. Each creates containers repeatedly
3. Runs 10 iterations (50 total operations)
4. Measures operations per second

**Why it matters:**
- Coordinator spawns multiple agents in parallel
- Tests performance under concurrent load
- Simulates production workload

---

## Next Steps After Running

1. **Review Report** → `planning/trigger/PERFORMANCE_BENCHMARK_REPORT.md`
2. **Check Status** → Look for "APPROVED FOR PRODUCTION"
3. **Validate Metrics** → Confirm all benchmarks passed thresholds
4. **Deploy** → Update production docker-compose (if approved)
5. **Monitor** → Track socket proxy health in production

---

## Files Generated

### Benchmark Results

```
.artifacts/performance-benchmarks/
├── benchmark-container-create.txt      (latency results)
├── benchmark-container-lifecycle.txt   (lifecycle results)
└── benchmark-throughput.txt            (throughput results)
```

### Final Report

```
planning/trigger/PERFORMANCE_BENCHMARK_REPORT.md
```

---

## Reference Documentation

**More Details:**
- `tests/performance/README.md` - Complete benchmark documentation
- `planning/trigger/SOCKET_PROXY_PERFORMANCE_ANALYSIS.md` - Detailed analysis
- `docker/SOCKET_PROXY_DEPLOYMENT_SUMMARY.md` - Deployment guide
- `docker/DOCKER_ACCESS_CONTROL.md` - Security architecture

**Related Code:**
- `docker/docker-compose.yml` - Socket proxy configuration
- `.claude/hooks/cfn-invoke-post-edit.sh` - Post-edit validation hook

---

## Tips & Tricks

### Run on Specific System

```bash
# Test on WSL2 (where we run)
bash tests/performance/run-all-benchmarks.sh

# Compare across systems for regression testing
mkdir -p results/$(hostname)-$(date +%Y%m%d)
cp .artifacts/performance-benchmarks/* results/$(hostname)-$(date +%Y%m%d)/
```

### Parse Just Overhead Numbers

```bash
# Extract overhead from create benchmark
grep "Overhead:" .artifacts/performance-benchmarks/benchmark-container-create.txt

# Extract throughput
grep "Reduction:" .artifacts/performance-benchmarks/benchmark-throughput.txt
```

### Watch Progress in Real-time

```bash
# In another terminal while benchmarks run
watch -n 2 'docker stats cfn-socket-proxy'
```

---

## Success = What You Want to See

```
✅ All benchmarks passed
✅ Report generated successfully
✅ Metrics within acceptable thresholds
✅ Status shows "APPROVED FOR PRODUCTION"
✅ No errors in Docker operations
```

---

**Questions?** See `tests/performance/README.md` for complete documentation
