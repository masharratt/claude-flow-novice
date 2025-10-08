# 50-Agent Swarm Stability Test

## Overview

Self-contained stability test script for validating 50-agent swarm coordination over an 8-hour period. Tests memory stability, file descriptor management, coordination performance, and crash resilience without requiring Docker.

## Architecture

### Design Philosophy
- **Single-process orchestration**: Main process spawns and manages all 50 agents
- **Inline monitoring**: Metrics captured directly using system tools (ps, df, /proc)
- **Simplicity over features**: Focus on reliability and actionable results
- **Graceful degradation**: Continue test even with partial failures

### Core Components

1. **StabilityTestRunner**: Main orchestrator class
   - Agent lifecycle management
   - Coordination cycle execution
   - Metrics collection and analysis
   - Report generation

2. **Agent Processes**: Lightweight Node.js child processes
   - Respond to coordination messages
   - Report status on demand
   - Minimal memory footprint
   - IPC-based communication

3. **Monitoring System**: System metrics collection
   - Memory (RSS/VSZ) via `ps`
   - File descriptors via `/proc/[pid]/fd`
   - tmpfs usage via `df`
   - Process health via `pgrep`

4. **Logging**: JSONL event stream
   - Real-time metric snapshots
   - Coordination results
   - Pre/post cycle deltas
   - Baseline and final reports

## Test Specifications

### Configuration
```javascript
AGENT_COUNT: 50                       // Number of concurrent agents
COORDINATION_INTERVAL: 5 minutes      // Time between coordination cycles
TOTAL_DURATION: 8 hours              // Full test duration
TOTAL_CYCLES: 96                     // Number of coordination cycles
```

### Success Criteria

| Metric | Target | Threshold |
|--------|--------|-----------|
| Memory Growth | <10% | Baseline to final RSS comparison |
| FD Variance | <10% | Coefficient of variation |
| Coordination Variance | <20% | Coefficient of variation |
| Crashes | 0 | Zero tolerance |

### Monitoring Data Schema

```json
{
  "cycle": 42,
  "timestamp": "2025-10-07T14:23:45.123Z",
  "preMetrics": {
    "memory": {
      "totalRss": 2048576000,
      "totalVsz": 4096000000,
      "processCount": 51,
      "processes": [...]
    },
    "fileDescriptors": {
      "open": 312,
      "softLimit": 1024,
      "hardLimit": 4096,
      "utilization": 30.5
    },
    "tmpfs": {
      "total": 1073741824,
      "used": 104857600,
      "available": 968884224,
      "utilizationPct": 9.7
    },
    "processes": {
      "parentPid": 12345,
      "childProcessCount": 50,
      "expectedAgents": 50,
      "agentsCrashed": 0
    }
  },
  "coordination": {
    "cycle": 42,
    "startTime": "2025-10-07T14:23:45.000Z",
    "durationMs": 2234,
    "agentsTotal": 50,
    "agentsResponded": 50,
    "agentsFailed": 0,
    "responses": [...]
  },
  "postMetrics": { ... },
  "deltas": {
    "memory": 1024000,
    "fileDescriptors": 2
  }
}
```

## Usage

### Basic Execution
```bash
# Full 8-hour test
node scripts/test/stability-test-50-agents.js

# Dry run (3 cycles, 10s intervals)
node scripts/test/stability-test-50-agents.js --dry-run

# Custom cycle count
node scripts/test/stability-test-50-agents.js --cycles 10 --interval 30000
```

### Execution in Claude Code
```javascript
// Read existing code first (required by Edit tool)
// Then execute
await Bash({
  command: "node scripts/test/stability-test-50-agents.js --dry-run",
  description: "Run stability test dry-run",
  timeout: 120000
});
```

### Monitoring Progress
```bash
# Follow real-time JSONL logs
tail -f stability-test-results.jsonl | jq .

# Monitor specific metrics
tail -f stability-test-results.jsonl | jq '.postMetrics.memory.totalRss'

# Count completed cycles
grep '"cycle":' stability-test-results.jsonl | wc -l
```

## Output Files

### Real-time Logs
- **stability-test-results.jsonl**: JSONL stream of all metrics
  - Baseline metrics
  - Per-cycle pre/post snapshots
  - Coordination results
  - Delta calculations

### Final Report
- **stability-test-report-[timestamp].json**: Complete test report
  ```json
  {
    "testConfig": {...},
    "execution": {
      "startTime": "...",
      "endTime": "...",
      "totalDurationHours": "8.00",
      "cyclesCompleted": 96
    },
    "metrics": {
      "memory": {
        "baseline": 2048576000,
        "final": 2150400000,
        "growth": 0.0497,
        "growthPct": "4.97",
        "pass": true
      },
      "fileDescriptors": { ... },
      "coordination": { ... },
      "crashes": { ... }
    },
    "success": true,
    "recommendations": [...]
  }
  ```

## Key Functions

### Orchestration
```javascript
async runStabilityTest()
  -> spawnAllAgents()
  -> captureSystemMetrics() // baseline
  -> Loop: runCoordinationCycle()
     -> captureSystemMetrics() // pre
     -> coordinateAgents()
     -> captureSystemMetrics() // post
     -> writeLogEntry()
  -> generateReport()
  -> cleanup()
```

### Monitoring
```javascript
async captureSystemMetrics(): SystemSnapshot
  -> getMemoryMetrics()      // ps -o pid,rss,vsz
  -> getFileDescriptorMetrics() // /proc/[pid]/fd
  -> getTmpfsMetrics()       // df -B1 /tmp
  -> getProcessMetrics()     // pgrep -P [pid]
```

### Agent Coordination
```javascript
async coordinateAgents(cycle): CoordinationResult
  -> Send 'coordinate' message to all agents
  -> Wait for responses (5s timeout)
  -> Aggregate results
  -> Return coordination metrics
```

### Report Generation
```javascript
async generateReport(): TestReport
  -> Calculate memory growth
  -> Calculate FD variance
  -> Calculate coordination variance
  -> Count crashes
  -> Evaluate success criteria
  -> Generate recommendations
  -> Print console report
  -> Write JSON report file
```

## Success Criteria Detection

### Memory Growth
```javascript
memoryGrowth = (finalRss - baselineRss) / baselineRss
memoryPass = memoryGrowth < 0.10 // 10% threshold
```

### File Descriptor Variance
```javascript
fdMean = sum(fdValues) / count(fdValues)
fdStdDev = sqrt(sum((value - mean)²) / count)
fdVariance = fdStdDev / fdMean  // Coefficient of variation
fdPass = fdVariance < 0.10 // 10% threshold
```

### Coordination Time Variance
```javascript
coordMean = sum(coordTimes) / count(coordTimes)
coordStdDev = sqrt(sum((time - mean)²) / count)
coordVariance = coordStdDev / coordMean
coordPass = coordVariance < 0.20 // 20% threshold
```

### Crash Detection
```javascript
totalCrashes = count(agents.filter(a => a.crashed))
crashPass = totalCrashes === 0 // Zero tolerance
```

### Overall Result
```javascript
overallPass = memoryPass && fdPass && coordPass && crashPass
```

## Failure Recovery

### Agent Crash Handling
- Agents mark themselves as crashed on exit
- Coordination continues with remaining agents
- Crashed agents logged but not restarted (measure stability, not mask failures)
- Test fails if any agent crashes

### Graceful Shutdown
- SIGINT/SIGTERM handlers registered
- All agents sent SIGTERM, then SIGKILL if needed
- Wait 1 second for cleanup
- Generate report before exit if metrics available

### Orphan Process Prevention
- All agents spawned with `detached: false`
- Parent death terminates children
- Explicit kill in cleanup handler
- Process group termination

## Recommendations Engine

The test automatically generates actionable recommendations based on results:

### Memory Issues (≥10% growth)
- Investigate memory leaks in agent processes
- Review coordination message handling
- Consider periodic agent restart strategy

### FD Issues (≥10% variance)
- Review FD cleanup in coordination cycles
- Check for unclosed file handles
- Implement FD monitoring strategy

### Coordination Issues (≥20% variance)
- Investigate coordination bottlenecks
- Optimize message passing strategy
- Review timeout handling

### Crash Issues (>0 crashes)
- Review crash logs for patterns
- Implement better error handling
- Consider health monitoring and recovery

## WSL2-Specific Considerations

### Memory Monitoring
- WSL2 reports memory differently than native Linux
- Use RSS (Resident Set Size) for accurate tracking
- VSZ (Virtual Size) may show high values due to WSL memory subsystem

### File Descriptors
- WSL2 has lower default FD limits than native Linux
- Check limits: `ulimit -n`
- Increase if needed: `ulimit -n 4096`

### tmpfs
- WSL2 tmpfs is on `/tmp` by default
- May be smaller than native Linux
- Monitor to avoid disk full errors

### Process Management
- `pgrep` and `ps` work normally in WSL2
- `/proc` filesystem available
- IPC and child process spawning identical to native Linux

## Troubleshooting

### "Agent spawn timeout" errors
```bash
# Increase spawn timeout in code (line 244)
setTimeout(() => reject(new Error(`Agent ${index} spawn timeout`)), 10000);
# Change 10000 to 30000 for slower systems
```

### "Too many open files" error
```bash
# Check current limit
ulimit -n

# Increase limit (temporary)
ulimit -n 4096

# Increase limit (permanent)
echo "* soft nofile 4096" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 8192" | sudo tee -a /etc/security/limits.conf
```

### High memory usage
```bash
# Monitor in real-time
watch -n 1 'ps aux | grep node | grep -v grep'

# Check for leaks
node --expose-gc scripts/test/stability-test-50-agents.js
```

### Coordination timeouts
```bash
# Increase coordination timeout (line 264)
const timeout = setTimeout(() => {
  resolve({ agentId: agent.id, error: 'Timeout', responded: false });
}, 5000); // Change to 10000 for slower systems
```

## Performance Expectations

### Typical Metrics (WSL2 on Windows 11, 16GB RAM)
- Initial memory: ~200-300MB (50 agents + orchestrator)
- Memory per agent: ~4-6MB
- Coordination time: 100-500ms (50 agents)
- FD count: 100-200 (stable)
- tmpfs usage: <100MB

### Resource Requirements
- RAM: 2GB minimum, 4GB recommended
- CPU: 2 cores minimum, 4+ recommended
- Disk: 1GB free for logs
- Network: None (local IPC only)

## Example Execution

```bash
$ node scripts/test/stability-test-50-agents.js --dry-run

[2025-10-07T14:00:00.000Z] Starting 8-hour stability test for 50-agent swarm
[2025-10-07T14:00:00.001Z] Configuration: 3 cycles, 0 min interval
[2025-10-07T14:00:00.002Z] DRY RUN MODE - Test will complete after 3 cycles
[2025-10-07T14:00:00.003Z] Spawning 50 agents...
[2025-10-07T14:00:05.234Z] Spawned 50/50 agents in 5231ms
[2025-10-07T14:00:05.456Z] Baseline metrics captured: 245.23MB RSS, 156 FDs
[2025-10-07T14:00:05.567Z] Running coordination cycle 1/3
[2025-10-07T14:00:07.891Z] Cycle 1: 50/50 agents responded in 2234ms (mem: +1.2MB, fds: +0)
[2025-10-07T14:00:17.892Z] Waiting 0s until next cycle (2025-10-07T14:00:17.892Z)
[2025-10-07T14:00:17.893Z] Running coordination cycle 2/3
[2025-10-07T14:00:20.127Z] Cycle 2: 50/50 agents responded in 2234ms (mem: +0.8MB, fds: +0)
[2025-10-07T14:00:30.128Z] Running coordination cycle 3/3
[2025-10-07T14:00:32.362Z] Cycle 3: 50/50 agents responded in 2234ms (mem: +0.5MB, fds: +0)
[2025-10-07T14:00:32.363Z] All coordination cycles completed, generating report...

================================================================================
  8-HOUR STABILITY TEST REPORT - 50-AGENT SWARM
================================================================================

Execution Summary:
  Start Time: 2025-10-07T14:00:05.456Z
  End Time: 2025-10-07T14:00:32.363Z
  Duration: 0.01 hours
  Cycles Completed: 3/3
  Agents Spawned: 50

Metrics:
  Memory Growth: 1.02% (threshold: 10%) [PASS]
  FD Variance: 0.00% (threshold: 10%) [PASS]
  Coordination Variance: 0.00% (threshold: 20%) [PASS]
  Crashes: 0 (threshold: 0) [PASS]

Coordination Performance:
  Mean: 2234.00ms
  Min: 2234ms
  Max: 2234ms
  Std Dev: 0.00ms

Overall Result: PASS

Recommendations:

  1. [INFO] success
     All stability criteria passed
     - System is stable for 50-agent swarm operations
     - Consider testing with larger agent counts
     - Monitor production deployments for similar patterns

================================================================================

Detailed logs written to: stability-test-results.jsonl
Full report written to: stability-test-report-1759868432363.json

[2025-10-07T14:00:32.500Z] Cleaning up resources...
[2025-10-07T14:00:33.500Z] Cleanup completed
```

## Integration with claude-flow-novice

This test can be integrated into the existing test suite:

```javascript
// In package.json
{
  "scripts": {
    "test:stability": "node scripts/test/stability-test-50-agents.js --dry-run",
    "test:stability:full": "node scripts/test/stability-test-50-agents.js"
  }
}

// In CI pipeline
npm run test:stability  // Quick validation
npm run test:stability:full  // Full 8-hour test (nightly)
```

## Future Enhancements

Potential improvements (not implemented for simplicity):

1. **Multi-swarm testing**: Test multiple isolated swarms
2. **Dynamic agent spawning**: Add/remove agents during test
3. **Failure injection**: Intentionally crash agents to test recovery
4. **Network simulation**: Add latency/packet loss to IPC
5. **Resource limits**: Test with constrained memory/CPU
6. **Visualization**: Real-time dashboard for metrics
7. **Historical comparison**: Compare results across test runs
8. **Alert integration**: Send notifications on failure

---

**Note**: This is a diagnostic tool, not a production monitoring system. Use for development and validation, not operational monitoring.
