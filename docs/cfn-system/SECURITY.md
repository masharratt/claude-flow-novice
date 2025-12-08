# CFN System Security Model

## Isolation Boundaries

### Process Isolation
- **Agent processes**: Separate OS processes per agent
- **PID tracking**: Global registry for cleanup
- **Signal handling**: INT/TERM/ERR trap handlers
- **Resource limits**: Per-agent memory/CPU constraints

### Network Isolation
```bash
# Docker network isolation
docker network create cfn-network
docker run --network cfn-network agent-container
# Internal communication via service names only
```

### File System Isolation
```
.artifacts/{taskId}/
├── results/ - Isolated test results
├── coverage/ - Isolated coverage reports
├── logs/ - Isolated execution logs
└── runtime/ - Isolated runtime data
/tmp/ - Temporary files only
```

### Workspace Isolation
```bash
export COMPOSE_PROJECT_NAME="cfn-${BRANCH}"
# Unique namespace per worktree
# Port auto-offset to prevent conflicts
```

## Secret Management

### Redaction Protocol
- **Pattern**: Replace all sensitive data with `[REDACTED]`
- **Scope**: Credentials, tokens, API keys, personal data
- **Implementation**: Systematic string replacement in logs
- **Validation**: Post-redaction verification

### Environment Variables
```bash
# Never log environment variables directly
env | grep -E "(TOKEN|KEY|SECRET)" >/dev/null && echo "[REDACTED]"
```

### File Access Controls
```bash
# Validate file paths and permissions
if [[ ! -f "$file" ]] || [[ ! -r "$file" ]]; then
  echo "Error: Invalid file access" >&2
  exit 1
fi
```

## Input Validation

### Path Validation
```bash
# Prevent path traversal
realpath "$file_path" | grep -q "^$SAFE_DIR/" || {
  echo "Error: Path outside safe directory" >&2
  exit 1
}
```

### Command Injection Prevention
```bash
# Use arrays for command arguments
cmd=("npx" "claude-flow-novice" "agent" "$safe_agent_type")
"${cmd[@]}"  # Safe execution
```

### Dependency Validation
```bash
# Pre-flight dependency checks
check_dependency() {
  local dep=$1
  command -v "$dep" >/dev/null || {
    echo "Error: Missing dependency: $dep" >&2
    exit 1
  }
}
```

## Resource Protection

### Memory Limits
- **CLI mode**: 1GB per agent
- **Task mode**: 2GB per agent
- **Container mode`: Docker memory constraints
- **Node heap limiter**: `--max-old-space-size`

### Disk Space Protection
```bash
# Check available disk space
MIN_DISK_MB=100
AVAILABLE_MB=$(df -m . | awk 'NR==2 {print $4}')
if (( AVAILABLE_MB < MIN_DISK_MB )); then
  echo "Error: Insufficient disk space" >&2
  exit 1
fi
```

### Process Limits
```bash
# Monitor concurrent processes
MAX_CONCURRENT=10
CURRENT=$(pgrep -cf "claude-flow-novice")
if (( CURRENT > MAX_CONCURRENT )); then
  echo "Error: Too many concurrent processes" >&2
  exit 1
fi
```

## Secure Communication

### Redis Security
```bash
# Use Redis AUTH if configured
if [[ -n "$REDIS_PASSWORD" ]]; then
  redis-cli -a "$REDIS_PASSWORD" --no-auth-warning
fi
```

### Docker Security
```bash
# Run as non-root user
docker run --user $(id -u):$(id -g) agent-image

# Read-only filesystem where possible
docker run --read-only --tmpfs /tmp agent-image

# Drop capabilities
docker run --cap-drop ALL --cap-add CHOWN agent-image
```

## Audit Trail

### SQLite Audit Schema
```sql
CREATE TABLE audit_log (
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  agent_id TEXT,
  action TEXT,
  resource TEXT,
  result TEXT,
  metadata TEXT,
  user_context TEXT
);

CREATE TABLE security_events (
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  event_type TEXT,
  severity TEXT,
  source_ip TEXT,
  agent_id TEXT,
  description TEXT,
  remediation TEXT
);
```

### Logging Security
```bash
# Sanitize logs before writing
sanitize_log() {
  local input=$1
  echo "$input" | sed -E 's/(token|key|secret|password)[=:][^[:space:]]*/\1=[REDACTED]/gi'
}
```

## Access Control

### Namespace Isolation
```bash
# Redis namespace isolation
REDIS_NAMESPACE="cfn:${taskId}"
redis-cli -n "$REDIS_NAMESPACE"
```

### Agent Sandboxing
```bash
# Restricted environment
env -i PATH=/usr/bin:/bin \
    HOME=/tmp/agent \
    TMPDIR=/tmp/agent \
    agent_command
```

### File Permissions
```bash
# Secure file creation
umask 077  # Default to rw-------
touch "$file"  # Creates with secure permissions
chmod 600 "$file"  # Explicitly set permissions
```

## Error Handling Security

### Safe Error Reporting
```bash
# Don't expose system details in error messages
error() {
  echo "Operation failed. Contact administrator." >&2
  # Log full details securely
  logger -p security.err "CFN Error: $*" 2>/dev/null
}
```

### Timeout Enforcement
```bash
# Prevent hanging processes
timeout "$TIMEOUT_SECONDS" command || {
  echo "Error: Operation timed out" >&2
  exit 124
}
```

### Signal Handling
```bash
# Secure cleanup on signals
cleanup() {
  # Kill child processes
  pkill -P $$
  # Clear sensitive data
  shred -u "$temp_file" 2>/dev/null
}
trap cleanup INT TERM EXIT
```

## Vulnerability Mitigation

### Regular Security Scans
```bash
# Dependency vulnerability scanning
npm audit --audit-level=moderate

# Docker image scanning
docker scan agent-image
```

### Code Quality Checks
```bash
# Static analysis for security issues
eslint --ext .ts,.js src/ --rule 'no-eval: error'
semgrep --config=security src/
```

### Environment Hardening
```bash
# Disable core dumps
ulimit -c 0

# Set secure umask
umask 077

# Remove SUID/SGID bits
find /path -perm /6000 -type f -exec chmod a-s {} \;
```

## Incident Response

### Security Event Categories
- **CRITICAL**: Data breach, privilege escalation
- **HIGH**: Unauthorized access, malware detection
- **MEDIUM**: Policy violation, suspicious activity
- **LOW**: Configuration drift, minor violations

### Response Procedures
1. **Containment**: Isolate affected systems
2. **Investigation**: Preserve forensic evidence
3. **Remediation**: Patch vulnerabilities
4. **Recovery**: Restore secure operations
5. **Post-mortem**: Document lessons learned

### Reporting Requirements
- Immediate notification for CRITICAL/HIGH events
- Daily summary for MEDIUM events
- Weekly report for LOW events
- All reports must redact sensitive data