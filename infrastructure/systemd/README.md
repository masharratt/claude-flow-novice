# Systemd Timer Installation

This directory contains systemd service and timer files for automated blocking coordination cleanup.

## Files

- `cleanup-blocking-coordination.service` - Service unit for cleanup script execution
- `cleanup-blocking-coordination.timer` - Timer unit for 5-minute scheduling

## Installation

### 1. Copy cleanup script to system location

```bash
sudo cp scripts/cleanup-blocking-coordination.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/cleanup-blocking-coordination.sh
```

### 2. Copy systemd units to system directory

```bash
sudo cp systemd/cleanup-blocking-coordination.service /etc/systemd/system/
sudo cp systemd/cleanup-blocking-coordination.timer /etc/systemd/system/
```

### 3. Configure Redis password (if using authentication)

Create override file for secure password storage:

```bash
sudo mkdir -p /etc/systemd/system/cleanup-blocking-coordination.service.d/
sudo tee /etc/systemd/system/cleanup-blocking-coordination.service.d/override.conf <<EOF
[Service]
Environment="REDIS_PASSWORD=your_redis_password_here"
EOF
sudo chmod 600 /etc/systemd/system/cleanup-blocking-coordination.service.d/override.conf
```

### 4. Create service user (recommended for security)

```bash
sudo useradd -r -s /bin/false -d /opt/claude-flow-novice claude-flow
sudo mkdir -p /home/claude-flow/.claude-flow/logs
sudo chown -R claude-flow:claude-flow /home/claude-flow/.claude-flow
```

**Alternative:** Run as existing user by editing the service file:

```bash
sudo sed -i 's/User=claude-flow/User=your-username/g' /etc/systemd/system/cleanup-blocking-coordination.service
sudo sed -i 's/Group=claude-flow/Group=your-group/g' /etc/systemd/system/cleanup-blocking-coordination.service
```

### 5. Reload systemd and enable timer

```bash
sudo systemctl daemon-reload
sudo systemctl enable cleanup-blocking-coordination.timer
sudo systemctl start cleanup-blocking-coordination.timer
```

## Security Configuration

### BLOCKING_COORDINATION_SECRET Environment Variable

The blocking coordination system requires a cryptographic shared secret (`BLOCKING_COORDINATION_SECRET`) to prevent ACK spoofing attacks. All coordinator instances must share the same secret.

**Quick Setup**:

```bash
# Create override file for secret storage
sudo systemctl edit cleanup-blocking-coordination.service

# Add environment variables
[Service]
Environment="BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)"
Environment="REDIS_PASSWORD=your_redis_password_here"

# Save, reload, and restart
sudo systemctl daemon-reload
sudo systemctl restart cleanup-blocking-coordination.service
```

**Verification**:

```bash
# Check service status
sudo systemctl status cleanup-blocking-coordination.service

# Verify environment variable is set (without exposing value)
sudo systemctl show cleanup-blocking-coordination.service --property=Environment | grep -o 'BLOCKING_COORDINATION_SECRET=[^ ]*' | sed 's/=.*/=***REDACTED***/'
```

**Complete Documentation**: See [docs/deployment/blocking-coordination-secrets.md](../docs/deployment/blocking-coordination-secrets.md) for:

- Secret generation and validation
- Distribution methods (Vault, AWS Secrets Manager, manual)
- Zero-downtime rotation procedures
- Security best practices and compliance
- Troubleshooting secret issues

## Verification

### Check timer status

```bash
sudo systemctl status cleanup-blocking-coordination.timer
```

### List next scheduled run

```bash
sudo systemctl list-timers cleanup-blocking-coordination.timer
```

### Manually trigger cleanup (testing)

```bash
sudo systemctl start cleanup-blocking-coordination.service
```

### View logs

```bash
# journalctl logs
sudo journalctl -u cleanup-blocking-coordination.service -f

# Application logs
tail -f ~/.claude-flow/logs/blocking-cleanup.log
```

## Customization

### Change cleanup interval

Edit the timer file and modify `OnUnitActiveSec`:

```ini
[Timer]
OnUnitActiveSec=10min  # Change to 10 minutes
```

Then reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart cleanup-blocking-coordination.timer
```

### Change stale threshold

Edit the cleanup script and modify `STALE_THRESHOLD_SECONDS`:

```bash
sudo vim /usr/local/bin/cleanup-blocking-coordination.sh
# Change: STALE_THRESHOLD_SECONDS=600
# To:     STALE_THRESHOLD_SECONDS=1200  # 20 minutes
```

## Troubleshooting

### Timer not running

1. Check timer is enabled:
   ```bash
   sudo systemctl is-enabled cleanup-blocking-coordination.timer
   ```

2. Check timer status:
   ```bash
   sudo systemctl status cleanup-blocking-coordination.timer
   ```

3. Check service logs:
   ```bash
   sudo journalctl -u cleanup-blocking-coordination.service --since "1 hour ago"
   ```

### Redis connection failures

1. Verify Redis is running:
   ```bash
   redis-cli ping
   ```

2. Check Redis configuration in service file:
   ```bash
   sudo systemctl cat cleanup-blocking-coordination.service
   ```

3. Test script manually:
   ```bash
   /usr/local/bin/cleanup-blocking-coordination.sh --dry-run
   ```

## Uninstallation

```bash
sudo systemctl stop cleanup-blocking-coordination.timer
sudo systemctl disable cleanup-blocking-coordination.timer
sudo rm /etc/systemd/system/cleanup-blocking-coordination.service
sudo rm /etc/systemd/system/cleanup-blocking-coordination.timer
sudo rm -rf /etc/systemd/system/cleanup-blocking-coordination.service.d/
sudo systemctl daemon-reload
sudo rm /usr/local/bin/cleanup-blocking-coordination.sh
```
