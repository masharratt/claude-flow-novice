# CLI Coordination Security Considerations

**Purpose**: Security hardening and risk mitigation for production CLI bash coordination

**Source**: Extracted from archived SDK security audits and bash best practices

---

## Overview

File-based IPC using /dev/shm tmpfs introduces security considerations around race conditions, file permissions, message validation, and resource exhaustion. This document covers threat model, mitigations, and hardening recommendations.

---

## Threat Model

### Attack Surface

| Component | Exposure | Risk Level | Mitigation Priority |
|-----------|----------|------------|---------------------|
| `/dev/shm` message files | Local FS | Medium | High |
| Message bus script | Bash execution | High | Critical |
| Coordinator election | Race conditions | Medium | High |
| Agent spawning | Resource exhaustion | Medium | Medium |
| Response aggregation | Data injection | Low | Low |

### Threat Actors

**Local User**: Primary concern for CLI coordination (same-machine agents)
**Remote Attacker**: Not applicable (no network exposure)
**Malicious Agent**: Possible if agent code compromised

---

## Race Condition Mitigation

### Critical Sections

**Problem**: Multiple agents writing to /dev/shm simultaneously can corrupt files

**Solution**: Use `flock` for atomic file operations

### File Locking with flock

```bash
# Atomic message write
write_message() {
  local msg_file="$1"
  local content="$2"

  # Acquire exclusive lock, write, release
  (
    flock -x 200
    echo "$content" > "$msg_file"
    sync  # Force write to disk (tmpfs)
  ) 200>"$msg_file.lock"

  # Clean up lock file
  rm -f "$msg_file.lock"
}
```

**Properties**:
- ✅ Exclusive lock prevents concurrent writes
- ✅ `sync` forces write to tmpfs (prevents torn writes)
- ✅ Lock released automatically on subshell exit
- ✅ Lock file cleaned up after write

### Coordinator Election

**Problem**: Multiple coordinators spawning simultaneously can create split-brain

**Solution**: Atomic lock file creation

```bash
# Become coordinator (atomic election)
become_coordinator() {
  local lock_file="/dev/shm/coordinator.lock"

  # Try to create lock file atomically (O_EXCL)
  if (set -o noclobber; echo $$ > "$lock_file") 2>/dev/null; then
    echo "I am coordinator (PID: $$)"
    return 0
  else
    echo "Another coordinator exists (PID: $(cat "$lock_file"))"
    return 1
  fi
}
```

**Properties**:
- ✅ `set -o noclobber` + `echo >` is atomic (O_EXCL flag)
- ✅ First process wins, others fail gracefully
- ✅ Lock file contains coordinator PID for debugging

### Message Sequence Numbers

**Problem**: Messages can arrive out of order

**Solution**: Sequence numbers in message format

```bash
# Message with sequence number
send_message() {
  local seq_num=$(($(cat /dev/shm/seq_counter) + 1))
  echo "$seq_num" > /dev/shm/seq_counter

  local msg="SEQ:$seq_num|AGENT:$AGENT_ID|DATA:$content"
  write_message "/dev/shm/messages/$AGENT_ID.txt" "$msg"
}
```

---

## File Permission Hardening

### /dev/shm Security

**Default Permissions**: 1777 (world-writable with sticky bit)

**Problem**: Any user can read/write /dev/shm files

**Solution**: Restrictive directory and file permissions

```bash
# Create secure coordination directory
setup_coordination_dir() {
  local coord_dir="/dev/shm/claude-flow-$$"

  # Create directory with strict permissions
  mkdir -m 0700 "$coord_dir"  # rwx------

  # Verify ownership
  if [[ $(stat -c %U "$coord_dir") != "$USER" ]]; then
    echo "ERROR: Directory ownership mismatch"
    exit 1
  fi

  export COORD_DIR="$coord_dir"
}
```

**Permissions Strategy**:
- ✅ 0700 (rwx------): Owner-only access
- ✅ Unique directory per coordination session (PID-based)
- ✅ Verify ownership before use
- ✅ Clean up on exit

### File Creation Umask

**Problem**: Default umask may create world-readable files

**Solution**: Set restrictive umask

```bash
# Set restrictive umask for coordination
umask 0077  # Creates files with 0600 (rw-------)

# Create message file (will be 0600)
echo "data" > /dev/shm/message.txt
```

### Cleanup on Exit

**Problem**: Sensitive data may persist in /dev/shm after coordination

**Solution**: Trap handlers for cleanup

```bash
# Cleanup handler
cleanup() {
  local coord_dir="${COORD_DIR:-/dev/shm/claude-flow-$$}"

  # Securely delete all coordination files
  if [[ -d "$coord_dir" ]]; then
    rm -rf "$coord_dir"
  fi
}

# Register cleanup on all exit conditions
trap cleanup EXIT SIGINT SIGTERM
```

---

## Message Validation

### Input Sanitization

**Problem**: Malicious agents could inject shell commands via messages

**Solution**: Validate message format and sanitize input

```bash
# Validate message format
validate_message() {
  local msg="$1"

  # Expected format: AGENT:id|STATUS:status|DATA:data
  if [[ ! "$msg" =~ ^AGENT:[0-9]+\|STATUS:(SUCCESS|FAILURE)\|DATA:.+$ ]]; then
    echo "ERROR: Invalid message format: $msg"
    return 1
  fi

  # Extract fields safely (no eval)
  local agent_id=$(echo "$msg" | sed -n 's/^AGENT:\([0-9]\+\)|.*/\1/p')
  local status=$(echo "$msg" | sed -n 's/.*|STATUS:\([^|]\+\)|.*/\1/p')
  local data=$(echo "$msg" | sed -n 's/.*|DATA:\(.*\)$/\1/p')

  # Validate agent ID is numeric
  if [[ ! "$agent_id" =~ ^[0-9]+$ ]]; then
    echo "ERROR: Invalid agent ID: $agent_id"
    return 1
  fi

  return 0
}
```

**Validation Rules**:
- ✅ Regex match against expected format
- ✅ No `eval` or dynamic execution
- ✅ Numeric fields validated
- ✅ Fail closed on invalid input

### Path Traversal Prevention

**Problem**: Agent ID could contain `../` to escape coordination directory

**Solution**: Sanitize agent ID and validate paths

```bash
# Sanitize agent ID (remove dangerous characters)
sanitize_agent_id() {
  local agent_id="$1"

  # Remove all non-alphanumeric characters except dash and underscore
  agent_id=$(echo "$agent_id" | tr -cd '[:alnum:]-_')

  # Enforce max length (prevent DoS)
  agent_id="${agent_id:0:64}"

  echo "$agent_id"
}

# Validate file path is within coordination directory
validate_path() {
  local file_path="$1"
  local base_dir="$2"

  # Resolve to absolute path (follows symlinks)
  local real_path=$(realpath -m "$file_path")
  local real_base=$(realpath -m "$base_dir")

  # Check if path starts with base directory
  if [[ "$real_path" != "$real_base"* ]]; then
    echo "ERROR: Path traversal attempt: $file_path"
    return 1
  fi

  return 0
}
```

### Size Limits

**Problem**: Large messages could exhaust /dev/shm space

**Solution**: Enforce message size limits

```bash
# Maximum message size (1KB)
MAX_MSG_SIZE=1024

# Write message with size check
write_message_safe() {
  local msg_file="$1"
  local content="$2"

  # Check message size
  local msg_size=${#content}
  if (( msg_size > MAX_MSG_SIZE )); then
    echo "ERROR: Message too large: $msg_size bytes (max: $MAX_MSG_SIZE)"
    return 1
  fi

  # Write with flock
  write_message "$msg_file" "$content"
}
```

---

## Resource Exhaustion Prevention

### /dev/shm Space Management

**Problem**: Filling /dev/shm can crash system processes

**Solution**: Monitor and limit /dev/shm usage

```bash
# Check /dev/shm available space
check_shm_space() {
  local min_free_mb=50  # Require 50MB free

  local free_space=$(df -m /dev/shm | awk 'NR==2 {print $4}')

  if (( free_space < min_free_mb )); then
    echo "ERROR: Insufficient /dev/shm space: ${free_space}MB (need ${min_free_mb}MB)"
    return 1
  fi

  return 0
}

# Pre-flight check before coordination
if ! check_shm_space; then
  echo "ERROR: Cannot proceed with coordination"
  exit 1
fi
```

### File Descriptor Limits

**Problem**: Opening too many files can exhaust FD limit

**Solution**: Monitor FD usage and enforce limits

```bash
# Check file descriptor usage
check_fd_limit() {
  local max_fds=1000  # Coordinator limit

  # Count open FDs for current process
  local open_fds=$(ls /proc/$$/fd | wc -l)

  if (( open_fds > max_fds )); then
    echo "ERROR: Too many open FDs: $open_fds (max: $max_fds)"
    return 1
  fi

  return 0
}
```

### Agent Spawn Limits

**Problem**: Spawning too many agents can exhaust memory

**Solution**: Rate limiting and max agent count

```bash
# Maximum agents per coordinator
MAX_AGENTS=50

# Rate limit: max 10 spawns per second
SPAWN_RATE_LIMIT=10
SPAWN_INTERVAL=$((1000 / SPAWN_RATE_LIMIT))  # ms

spawn_agents_safely() {
  local agent_count="$1"

  # Enforce max agent limit
  if (( agent_count > MAX_AGENTS )); then
    echo "ERROR: Agent count $agent_count exceeds max $MAX_AGENTS"
    return 1
  fi

  # Spawn with rate limiting
  for i in $(seq 1 "$agent_count"); do
    bash agent-wrapper.sh "$i" &
    sleep 0.$SPAWN_INTERVAL  # Rate limit
  done
}
```

---

## Bash Script Hardening

### Strict Mode

**Problem**: Bash defaults are permissive and hide errors

**Solution**: Enable strict mode in all scripts

```bash
#!/usr/bin/env bash

# Strict mode
set -euo pipefail  # Exit on error, undefined var, pipe failure
IFS=$'\n\t'        # Sane word splitting

# Enable debug mode if DEBUG env var set
[[ "${DEBUG:-0}" == "1" ]] && set -x
```

**Properties**:
- ✅ `-e`: Exit immediately on command failure
- ✅ `-u`: Error on undefined variable access
- ✅ `-o pipefail`: Propagate errors through pipes
- ✅ `IFS`: Prevent word splitting issues

### Variable Quoting

**Problem**: Unquoted variables enable command injection

**Solution**: Always quote variables

```bash
# ❌ BAD: Unquoted variables
agent_id=$1
echo $agent_id  # Vulnerable to word splitting

# ✅ GOOD: Quoted variables
agent_id="$1"
echo "$agent_id"  # Safe

# ✅ GOOD: Array expansion
args=("$@")  # All arguments as array
for arg in "${args[@]}"; do  # Quote array expansion
  echo "$arg"
done
```

### Command Substitution Safety

**Problem**: `eval` and backticks enable code injection

**Solution**: Use `$()` and avoid `eval`

```bash
# ❌ BAD: eval (arbitrary code execution)
eval "response_$agent_id='$data'"  # NEVER DO THIS

# ✅ GOOD: Associative array
declare -A responses
responses[$agent_id]="$data"

# ❌ BAD: Backticks (deprecated)
files=`ls /dev/shm`

# ✅ GOOD: $() (modern, nestable)
files=$(ls /dev/shm)
```

### Temporary File Safety

**Problem**: Predictable temp file names enable race attacks

**Solution**: Use `mktemp` for unique temp files

```bash
# ❌ BAD: Predictable temp file
tmpfile="/tmp/coordination-$$"

# ✅ GOOD: mktemp (unique, secure)
tmpfile=$(mktemp /dev/shm/coord.XXXXXX)

# Clean up on exit
trap "rm -f '$tmpfile'" EXIT
```

---

## Monitoring and Auditing

### Logging

**Strategy**: Log security-relevant events for audit trail

```bash
# Security log function
sec_log() {
  local level="$1"
  local message="$2"

  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local log_entry="[$timestamp] [$level] [PID:$$] $message"

  # Write to security log (append-only)
  echo "$log_entry" >> /var/log/claude-flow-security.log

  # Also log to syslog
  logger -t claude-flow -p "user.$level" "$message"
}

# Usage
sec_log "INFO" "Coordinator started (agent_count: $N)"
sec_log "WARN" "Invalid message received from agent $agent_id"
sec_log "ERROR" "Path traversal attempt: $file_path"
```

**Log Events**:
- Coordinator election (who became coordinator)
- Invalid messages (format, size, content)
- Path traversal attempts
- Resource limit violations
- Agent spawn/completion

### Metrics

**Key Security Metrics**:

| Metric | Threshold | Alert Action |
|--------|-----------|--------------|
| Invalid messages | >10/min | Investigate agent code |
| Path traversal attempts | >0 | Security incident |
| /dev/shm usage | >80% | Cleanup or expand |
| FD leaks | >1000 | Restart coordinator |
| Agent spawn failures | >5% | Check resource limits |

---

## Production Hardening Checklist

### Pre-Deployment

- [ ] All bash scripts use strict mode (`set -euo pipefail`)
- [ ] All variables quoted (`"$var"`, not `$var`)
- [ ] No `eval` usage (use associative arrays instead)
- [ ] `flock` used for all file writes
- [ ] Agent ID sanitization implemented
- [ ] Path traversal validation enabled
- [ ] Message size limits enforced (<1KB)
- [ ] /dev/shm space checks before coordination
- [ ] FD limit monitoring enabled
- [ ] Security logging implemented

### Runtime

- [ ] Restrictive umask set (0077)
- [ ] Coordination directory permissions 0700
- [ ] Cleanup trap handlers registered
- [ ] Rate limiting enabled (agent spawning)
- [ ] Max agent count enforced (50/coordinator)
- [ ] Timeout enforcement (30s default)

### Post-Deployment

- [ ] Security logs reviewed daily
- [ ] /dev/shm usage monitored
- [ ] FD leaks checked weekly
- [ ] Invalid message rate tracked
- [ ] Agent failure rate <5%

---

## Known Vulnerabilities and Mitigations

### 1. /dev/shm World-Readable (Medium Risk)

**Problem**: Default /dev/shm permissions (1777) allow any user to read files

**Mitigation**:
- Create per-session directory with 0700 permissions
- Use unique directory names (PID-based)
- Clean up on exit

**Residual Risk**: Low (directory-level isolation effective)

### 2. Coordinator Split-Brain (Low Risk)

**Problem**: Multiple coordinators could spawn if lock file race

**Mitigation**:
- Atomic lock file creation with `O_EXCL` (noclobber)
- Lock file contains PID for debugging
- Agents check coordinator heartbeat

**Residual Risk**: Very Low (atomic operations prevent race)

### 3. Message Injection (Low Risk)

**Problem**: Malicious agent could inject shell commands in messages

**Mitigation**:
- Message format validation (regex)
- No `eval` usage
- Variables always quoted
- Agent ID sanitization

**Residual Risk**: Very Low (defense-in-depth approach)

### 4. Resource Exhaustion (Medium Risk)

**Problem**: Malicious agent could fill /dev/shm or spawn too many processes

**Mitigation**:
- Pre-flight /dev/shm space check (require 50MB free)
- Max agent count enforced (50/coordinator)
- Message size limits (1KB)
- Rate limiting (10 spawns/sec)

**Residual Risk**: Low (multiple limits in place)

---

## Incident Response

### Security Incident Playbook

#### Path Traversal Detection

```bash
# Detected in logs: "ERROR: Path traversal attempt: ../../etc/passwd"

# 1. Identify attacker agent ID
attacker_id=$(grep "Path traversal" /var/log/claude-flow-security.log | tail -1 | grep -oP 'agent \K[0-9]+')

# 2. Kill attacker process
pkill -f "agent-wrapper.sh $attacker_id"

# 3. Review recent messages from attacker
grep "AGENT:$attacker_id" /dev/shm/claude-flow-*/messages/*

# 4. Clean up attacker files
rm -f /dev/shm/claude-flow-*/messages/agent-$attacker_id.*

# 5. Report incident
sec_log "CRITICAL" "Path traversal attack from agent $attacker_id - agent killed"
```

#### Resource Exhaustion

```bash
# Detected: /dev/shm usage >90%

# 1. Find largest files
du -sh /dev/shm/* | sort -h | tail -10

# 2. Identify coordination sessions
ls -la /dev/shm/claude-flow-*/

# 3. Kill oldest sessions (preserve active)
for dir in /dev/shm/claude-flow-*; do
  age=$(($(date +%s) - $(stat -c %Y "$dir")))
  if (( age > 3600 )); then  # >1 hour old
    rm -rf "$dir"
    sec_log "WARN" "Cleaned up old session: $dir (age: ${age}s)"
  fi
done

# 4. Restart coordination if needed
```

---

## References

- **Bash Best Practices**: https://mywiki.wooledge.org/BashGuide/Practices
- **flock Usage**: `man flock`
- **Secure Temp Files**: `man mktemp`
- **MVP Implementation**: `tests/cli-coordination/message-bus.sh`
- **Production Plan**: `planning/agent-coordination-v2/CLI_COORDINATION_PRODUCTION_PLAN.md`
