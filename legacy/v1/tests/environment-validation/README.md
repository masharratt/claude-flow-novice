# Sprint 0 - Day 1: Environment Validation

## Quick Start

### Local Testing (WSL/Linux)

```bash
# 1. Validate environment
bash tests/environment-validation/validate-environment-simple.sh

# 2. Run 100-agent coordination test
bash tests/environment-validation/test-100-agents-simple.sh
```

### Docker Testing

#### Build Image
```bash
cd tests/environment-validation
docker build -f Dockerfile -t cli-coordination-test:latest ../..
```

#### Test Default Environment (64MB /dev/shm)
```bash
docker run --rm cli-coordination-test:latest bash -c "
  cd /app/tests/environment-validation && \
  bash validate-environment-simple.sh && \
  bash test-100-agents-simple.sh
"
```

#### Test Expanded Environment (1GB /dev/shm)
```bash
docker run --rm --shm-size=1g cli-coordination-test:latest bash -c "
  cd /app/tests/environment-validation && \
  bash validate-environment-simple.sh && \
  bash test-100-agents-simple.sh
"
```

### Cloud VM Testing

#### AWS EC2
```bash
# Launch t3.micro instance (Ubuntu 22.04)
# SSH into instance
git clone <repository>
cd claude-flow-novice/tests/environment-validation
bash validate-environment-simple.sh
bash test-100-agents-simple.sh
```

#### GCP Compute Engine
```bash
# Launch e2-micro instance (Ubuntu 22.04)
# SSH into instance
git clone <repository>
cd claude-flow-novice/tests/environment-validation
bash validate-environment-simple.sh
bash test-100-agents-simple.sh
```

## Acceptance Criteria

- Works in ≥2 production environments
- Coordination time <10s for 100 agents
- Delivery rate ≥90%
- Zero critical errors (permission denied, tmpfs unavailable)

## Test Results Format

### Environment Validation
```
CLI Coordination Environment Validation Results
Timestamp: 2025-10-06T23:45:00Z
Environment: Linux hostname 6.6.87.2-microsoft-standard-WSL2

CHECKS:
  [PASS] /dev/shm directory exists
  [PASS] /dev/shm is tmpfs
  [PASS] /dev/shm size adequate (32G)
  [PASS] /dev/shm is writable
  [PASS] /dev/shm is readable
  [PASS] Performance adequate (603ms for 1000 ops)
  [PASS] Node.js available (v24.6.0)
  [PASS] bash available

SUMMARY:
  Critical Errors: 0
  Warnings: 0
  Status: READY
```

### Coordination Performance
```
100-Agent Coordination Performance Test
Agent Count: 100
Coordination Time: 3.5s
Delivery Rate: 98%

ACCEPTANCE CRITERIA:
  ✓ Coordination time <10s: PASS
  ✓ Delivery rate ≥90%: PASS
  ✓ Zero critical errors: PASS

Overall Status: PASS
```

## Next Steps

### If PASS (GO)
- Proceed to Sprint 0 - Day 2: Hybrid topology validation
- Begin Phase 1 implementation planning
- Allocate resources for 4-6 month development

### If FAIL (NO-GO)
- Document blocking issues
- Evaluate alternative approaches (HTTP, gRPC, WebSockets)
- Reassess feasibility and timeline

### If PIVOT
- Test alternative coordination mechanisms
- Hybrid approach: /dev/shm where available, fallback to HTTP
- Retest with adjusted architecture
