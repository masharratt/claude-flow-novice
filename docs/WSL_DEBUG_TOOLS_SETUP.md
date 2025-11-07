# WSL Debug Tools Setup Guide

**Purpose:** Install and configure debugging tools (strace, perf) for memory leak analysis in WSL environments.

## Overview

The memory leak analysis identified that critical debugging tools were missing from the WSL environment. This guide provides step-by-step instructions to install and configure these tools for effective memory leak detection.

## Prerequisites

- WSL2 environment (Ubuntu/Debian preferred)
- sudo access for system package installation
- Internet connection for package downloads

## Installation

### Method 1: Automatic Installation (Recommended)

Use the built-in memory leak prevention script:

```bash
./scripts/memory-leak-prevention.sh install-tools
```

### Method 2: Manual Installation

#### For Ubuntu/Debian:

```bash
# Update package lists
sudo apt-get update

# Install debugging tools
sudo apt-get install -y strace linux-tools-generic linux-perf

# Configure perf for non-root users
echo -1 | sudo tee /proc/sys/kernel/perf_event_paranoid
echo 0 | sudo tee /proc/sys/kernel/kptr_restrict
```

#### For CentOS/RHEL/Fedora:

```bash
# Install debugging tools
sudo yum install -y strace perf

# Or for newer systems with dnf
sudo dnf install -y strace perf

# Configure perf for non-root users
echo -1 | sudo tee /proc/sys/kernel/perf_event_paranoid
echo 0 | sudo tee /proc/sys/kernel/kptr_restrict
```

#### For Alpine Linux:

```bash
# Install debugging tools
sudo apk add strace perf

# Configure perf for non-root users
echo -1 | sudo tee /proc/sys/kernel/perf_event_paranoid
echo 0 | sudo tee /proc/sys/kernel/kptr_restrict
```

## Configuration

### Permanent Perf Configuration

To make perf configuration persistent across reboots:

```bash
# Create sysctl configuration
sudo tee /etc/sysctl.d/99-perf.conf << EOF
kernel.perf_event_paranoid = -1
kernel.kptr_restrict = 0
EOF

# Apply configuration
sudo sysctl -p /etc/sysctl.d/99-perf.conf
```

### User Configuration

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Debug tools aliases
alias strace-p='strace -f -e trace=all -o /tmp/strace.log'
alias perf-record='perf record -g -o /tmp/perf.data'
alias perf-report='perf report -i /tmp/perf.data'

# Memory monitoring aliases
alias mem-monitor='watch -n 5 "free -h && ps aux --sort=-%mem | head -10"'
alias proc-monitor='watch -n 2 "ps auxf | grep claude"'
```

## Usage Examples

### Using strace for System Call Tracing

```bash
# Trace all system calls for a process
strace -f -e trace=all -o /tmp/claude-strace.log -p <PID>

# Trace specific operations (file I/O, memory)
strace -f -e trace=file,desc,memory -o /tmp/claude-memory.log -p <PID>

# Start a process with strace attached
strace -f -o /tmp/claude-startup.log npx claude-flow-novice
```

### Using perf for Performance Analysis

```bash
# Record CPU performance data
perf record -g -p <PID> -o /tmp/claude-perf.data

# Record memory-related events
perf record -e mem:* -p <PID> -o /tmp/claude-memory-perf.data

# Analyze recorded data
perf report -i /tmp/claude-perf.data

# Generate flame graph (requires flamegraph.pl)
perf script | stackcollapse-perf.pl | flamegraph.pl > claude-flamegraph.svg
```

### Combined Debugging Workflow

```bash
# 1. Start monitoring before running Claude
sudo strace -f -o /tmp/claude-syscalls.log &
strace_pid=$!

sudo perf record -e mem:* -o /tmp/claude-memory-perf.data &
perf_pid=$!

# 2. Run Claude with memory profiling
export NODE_OPTIONS="--max-old-space-size=8192 --inspect=0.0.0.0:9229 --heap-prof"
npx claude-flow-novice "$@"

# 3. Stop monitoring
kill $strace_pid $perf_pid 2>/dev/null || true

# 4. Analyze results
echo "System call trace saved to: /tmp/claude-syscalls.log"
echo "Memory performance data saved to: /tmp/claude-memory-perf.data"
```

## WSL-Specific Considerations

### Memory Limits

WSL has memory limits that can affect debugging:

```bash
# Check current WSL memory usage
free -h
cat /proc/meminfo

# Monitor WSL memory pressure
watch -n 5 'cat /proc/zoneinfo | grep -A 3 "Node"'
```

### Performance Considerations

WSL adds overhead to system calls. For accurate profiling:

```bash
# Use strace with timing information
strace -f -T -tt -o /tmp/claude-timing.log -p <PID>

# Use perf with higher sampling rate
perf record -F 1000 -g -p <PID> -o /tmp/claude-highfreq.data
```

### File System Differences

WSL file system performance differs from native Linux:

```bash
# Monitor file system operations specifically
strace -f -e trace=file,desc -o /tmp/claude-fs.log -p <PID>

# Check WSL mount points
mount | grep -E "(drvfs|wsl)"

# Monitor Windows file access
strace -f -e trace=file -o /tmp/claude-windows.log -p <PID> | grep -i "/mnt/c"
```

## Troubleshooting

### Common Issues

#### 1. Permission Denied Errors

```bash
# Fix perf permission issues
sudo sysctl -w kernel.perf_event_paranoid=-1
sudo sysctl -w kernel.kptr_restrict=0

# For temporary fix (lasts until reboot)
echo -1 | sudo tee /proc/sys/kernel/perf_event_paranoid
echo 0 | sudo tee /proc/sys/kernel/kptr_restrict
```

#### 2. Strace Not Found

```bash
# Install strace for your distribution
sudo apt-get install strace          # Ubuntu/Debian
sudo yum install strace              # CentOS/RHEL
sudo dnf install strace              # Fedora
sudo apk add strace                  # Alpine
```

#### 3. Perf Not Available

```bash
# Check kernel support
grep CONFIG_PERF_EVENTS /boot/config-$(uname -r)

# Install perf tools
sudo apt-get install linux-tools-generic linux-perf    # Ubuntu
sudo yum install perf                                   # CentOS/RHEL
```

#### 4. WSL Performance Issues

```bash
# Check WSL version
wsl.exe --list --verbose

# Optimize WSL configuration
# Add to %USERPROFILE%\.wslconfig:
[wsl2]
memory=16GB
processors=8
swap=4GB
```

### Verification

Test that tools are working correctly:

```bash
# Test strace
strace -e openat true 2>&1 | grep -q "openat" && echo "strace working" || echo "strace broken"

# Test perf
perf stat true 2>&1 | grep -q "Performance counter stats" && echo "perf working" || echo "perf broken"

# Test with Claude
timeout 10s strace -e trace=all npx claude-flow-novice --help 2>/tmp/test-strace.log
test -s /tmp/test-strace.log && echo "strace with Claude working" || echo "strace with Claude failed"
```

## Integration with CFN Loop

### Pre-execution Hook

```bash
#!/bin/bash
# .claude/hooks/cfn-pre-execution/debug-setup.sh

# Ensure debug tools are available
command -v strace >/dev/null || {
    echo "ERROR: strace not found. Run: ./scripts/memory-leak-prevention.sh install-tools"
    exit 1
}

command -v perf >/dev/null || {
    echo "ERROR: perf not found. Run: ./scripts/memory-leak-prevention.sh install-tools"
    exit 1
}

# Start background monitoring
strace -f -o "/tmp/cfn-strace-$$.log" &
STRACE_PID=$!

perf record -e mem:* -o "/tmp/cfn-perf-$$.data" &
PERF_PID=$!

# Save PIDs for cleanup
echo "$STRACE_PID $PERF_PID" > "/tmp/cfn-debug-pids-$$"
```

### Post-execution Hook

```bash
#!/bin/bash
# .claude/hooks/cfn-post-execution/debug-cleanup.sh

if [[ -f "/tmp/cfn-debug-pids-$$" ]]; then
    read -r strace_pid perf_pid < "/tmp/cfn-debug-pids-$$"

    # Stop monitoring
    kill $strace_pid $perf_pid 2>/dev/null || true

    # Generate reports
    echo "strace log: /tmp/cfn-strace-$$.log"
    echo "perf data: /tmp/cfn-perf-$$.data"

    # Cleanup PID file
    rm -f "/tmp/cfn-debug-pids-$$"
fi
```

## Best Practices

1. **Always use with Claude CLI**: Combine debugging tools with the memory leak prevention script
2. **Monitor system resources**: Debugging tools consume additional CPU and memory
3. **Clean up log files**: Debugging files can become large quickly
4. **Use specific trace events**: Avoid tracing all events unless necessary
5. **Store results in /tmp**: Temporary directory is automatically cleaned up

## Security Considerations

- strace and perf can capture sensitive data including passwords and API keys
- Store debug logs securely and delete them after analysis
- Run debugging tools only on processes you own
- Be cautious with strace on multi-user systems

## Resources

- [strace man page](https://man7.org/linux/man-pages/man1/strace.1.html)
- [perf documentation](https://perf.wiki.kernel.org/index.php/Tutorial)
- [WSL performance considerations](https://docs.microsoft.com/en-us/windows/wsl/wsl-config)
- [Node.js debugging with perf](https://nodejs.org/en/docs/guides/simple-profiling/)