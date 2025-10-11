# Cron Configuration for Blocking Coordination Cleanup

This directory contains cron configuration for automated blocking coordination cleanup on systems without systemd.

## Files

- `cleanup-blocking-coordination` - Cron job configuration (runs every 5 minutes)

## Installation

### 1. Copy cleanup script to system location

```bash
sudo cp scripts/cleanup-blocking-coordination.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/cleanup-blocking-coordination.sh
```

### 2. Create service user (recommended for security)

```bash
sudo useradd -r -s /bin/false -d /opt/claude-flow-novice claude-flow
sudo mkdir -p /home/claude-flow/.claude-flow/logs
sudo chown -R claude-flow:claude-flow /home/claude-flow/.claude-flow
```

**Alternative:** Run as existing user by editing the cron file:

```bash
# Edit cron.d/cleanup-blocking-coordination
# Change: */5 * * * * claude-flow
# To:     */5 * * * * your-username
```

### 3. Configure Redis connection (if needed)

Edit the cron file to set Redis connection parameters:

```bash
vim infrastructure/cron/cleanup-blocking-coordination

# Modify:
# REDIS_HOST=your_redis_host
# REDIS_PORT=your_redis_port
# REDIS_PASSWORD=your_password  # Uncomment if using auth
```

### 4. Install cron job

```bash
sudo cp infrastructure/cron/cleanup-blocking-coordination /etc/cron.d/
sudo chmod 644 /etc/cron.d/cleanup-blocking-coordination
```

### 5. Verify installation

```bash
# Check cron file syntax
sudo crontab -u claude-flow -l 2>/dev/null || echo "Using /etc/cron.d/ (system-wide)"

# Check cron service is running
sudo systemctl status cron  # Debian/Ubuntu
# or
sudo systemctl status crond  # RHEL/CentOS
```

## Security Configuration

### BLOCKING_COORDINATION_SECRET Environment Variable

The blocking coordination system requires a cryptographic shared secret (`BLOCKING_COORDINATION_SECRET`) to prevent ACK spoofing attacks. All coordinator instances must share the same secret.

**Quick Setup**:

```bash
# Create secure environment file
sudo mkdir -p /etc/claude-flow
sudo tee /etc/claude-flow/blocking-coordination.env <<EOF
BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)
REDIS_PASSWORD=your_redis_password_here
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
EOF

# Secure permissions
sudo chmod 600 /etc/claude-flow/blocking-coordination.env
sudo chown root:root /etc/claude-flow/blocking-coordination.env

# Update cron file to source environment
sudo tee /etc/cron.d/cleanup-blocking-coordination <<'CRONEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Source environment file and run cleanup every 5 minutes
*/5 * * * * claude-flow source /etc/claude-flow/blocking-coordination.env && /usr/local/bin/cleanup-blocking-coordination.sh >> /home/claude-flow/.claude-flow/logs/blocking-cleanup.log 2>&1
CRONEOF
```

**Verification**:

```bash
# Test manual execution with environment
sudo -u claude-flow bash -c 'source /etc/claude-flow/blocking-coordination.env && /usr/local/bin/cleanup-blocking-coordination.sh --dry-run'

# Check cron execution logs
tail -f /home/claude-flow/.claude-flow/logs/blocking-cleanup.log
```

**Complete Documentation**: See [docs/deployment/blocking-coordination-secrets.md](../docs/deployment/blocking-coordination-secrets.md) for:

- Secret generation and validation
- Distribution methods (Vault, AWS Secrets Manager, manual)
- Zero-downtime rotation procedures
- Security best practices and compliance
- Troubleshooting secret issues

## Verification

### Monitor logs in real-time

```bash
tail -f /home/claude-flow/.claude-flow/logs/blocking-cleanup.log
```

### Check for cron execution

```bash
# Check syslog for cron activity
sudo grep cleanup-blocking-coordination /var/log/syslog  # Debian/Ubuntu
sudo grep cleanup-blocking-coordination /var/log/cron    # RHEL/CentOS
```

### Manually trigger cleanup (testing)

```bash
# Run as the cron user
sudo -u claude-flow /usr/local/bin/cleanup-blocking-coordination.sh

# Or run with dry-run mode
sudo -u claude-flow /usr/local/bin/cleanup-blocking-coordination.sh --dry-run
```

## Customization

### Change cleanup interval

Edit the cron file and modify the schedule:

```bash
sudo vim /etc/cron.d/cleanup-blocking-coordination

# Examples:
# Every 10 minutes:  */10 * * * *
# Every 15 minutes:  */15 * * * *
# Every hour:        0 * * * *
# Every 6 hours:     0 */6 * * *
```

After editing, no restart is needed - cron automatically picks up changes.

### Change stale threshold

Edit the cleanup script:

```bash
sudo vim /usr/local/bin/cleanup-blocking-coordination.sh
# Change: STALE_THRESHOLD_SECONDS=600
# To:     STALE_THRESHOLD_SECONDS=1200  # 20 minutes
```

### Add email notifications

Cron will email output to the user by default. To customize:

```bash
# Add MAILTO at the top of the cron file
MAILTO=admin@example.com

# Or disable email notifications
MAILTO=""
```

## Troubleshooting

### Cron job not running

1. Check cron service status:
   ```bash
   sudo systemctl status cron   # Debian/Ubuntu
   sudo systemctl status crond  # RHEL/CentOS
   ```

2. Check cron file permissions:
   ```bash
   ls -l /etc/cron.d/cleanup-blocking-coordination
   # Should be: -rw-r--r-- root root
   ```

3. Check syslog for errors:
   ```bash
   sudo tail -f /var/log/syslog | grep CRON
   ```

### Script execution fails

1. Check script permissions:
   ```bash
   ls -l /usr/local/bin/cleanup-blocking-coordination.sh
   # Should be executable: -rwxr-xr-x
   ```

2. Test script manually:
   ```bash
   sudo -u claude-flow /usr/local/bin/cleanup-blocking-coordination.sh --dry-run
   ```

3. Check log file permissions:
   ```bash
   ls -ld /home/claude-flow/.claude-flow/logs
   # Should be writable by claude-flow user
   ```

### Redis connection failures

1. Verify Redis is running:
   ```bash
   redis-cli ping
   ```

2. Check Redis configuration in cron file:
   ```bash
   grep REDIS /etc/cron.d/cleanup-blocking-coordination
   ```

3. Test connection with environment variables:
   ```bash
   REDIS_HOST=127.0.0.1 REDIS_PORT=6379 /usr/local/bin/cleanup-blocking-coordination.sh --dry-run
   ```

## Comparison: Cron vs. Systemd Timers

| Feature | Cron | Systemd Timers |
|---------|------|----------------|
| **Availability** | Universal (all Linux/Unix) | Modern Linux only |
| **Configuration** | Simple text file | Separate service + timer units |
| **Logging** | Manual (redirect to file) | Integrated journalctl |
| **Missed runs** | Skipped | Can be caught up (Persistent=true) |
| **Dependencies** | None | Can depend on other services |
| **Resource limits** | Via ulimit | Built-in (TimeoutStartSec, etc.) |
| **Security** | Basic (user/group) | Advanced (sandboxing, capabilities) |

**Recommendation:**
- **Use Cron** for: Simpler deployments, maximum compatibility, quick setup
- **Use Systemd** for: Production systems, advanced logging, service dependencies, security hardening

## Uninstallation

```bash
sudo rm /etc/cron.d/cleanup-blocking-coordination
sudo rm /usr/local/bin/cleanup-blocking-coordination.sh
```

## Alternative: User Crontab

If you prefer user-level cron (instead of system-wide /etc/cron.d/):

```bash
# Add to user crontab
crontab -e

# Add this line:
*/5 * * * * /path/to/scripts/cleanup-blocking-coordination.sh >> ~/.claude-flow/logs/blocking-cleanup.log 2>&1
```

**Note:** User crontab requires the user to be logged in on some systems. System-wide /etc/cron.d/ is more reliable.
