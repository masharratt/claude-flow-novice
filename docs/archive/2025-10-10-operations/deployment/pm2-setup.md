# PM2 Cluster Setup - Production Deployment Guide

## Overview

Production cluster configuration for claude-flow-novice hierarchical coordination system. Implements PM2 cluster mode for high-availability, failover, and graceful shutdown.

## Prerequisites

- Node.js 20+ (LTS recommended)
- PM2 installed globally: `npm install -g pm2`
- Built project: `npm run build`
- Production environment configured

## Quick Start

### 1. Install PM2 (Global)

```bash
npm install -g pm2
```

### 2. Verify Build

```bash
npm run build
ls -la dist/src/coordination/queen-agent.js
```

### 3. Start Cluster

```bash
# Start in production mode
pm2 start ecosystem.config.cjs --env production

# Verify cluster status
pm2 status
pm2 logs claude-flow-queen
```

### 4. Monitor Cluster

```bash
# Real-time monitoring dashboard
pm2 monit

# Process details
pm2 show claude-flow-queen

# Resource usage
pm2 info claude-flow-queen
```

## Cluster Configuration

### Instance Management

**Default**: Uses all CPU cores (`instances: 'max'`)

**Custom instance count**:
```bash
# Start with specific instance count
pm2 start ecosystem.config.cjs --env production -i 4

# Scale cluster (add/remove instances)
pm2 scale claude-flow-queen 6
```

**Recommended**: 2-4 instances for PM failover

### Memory Management

**Auto-restart on memory threshold**:
- Threshold: 2GB per instance
- Configured: `max_memory_restart: '2G'`

**Monitor memory usage**:
```bash
pm2 monit
pm2 info claude-flow-queen
```

### Graceful Shutdown

**Shutdown sequence**:
1. SIGTERM signal sent (5s timeout)
2. Application cleanup (workers terminate, tasks reassign)
3. SIGKILL if not stopped after 5s

**Configuration**:
- `kill_timeout: 5000` (5s SIGTERM timeout)
- `wait_ready: true` (wait for process.send('ready'))
- `listen_timeout: 10000` (10s max wait for ready signal)

**Test graceful shutdown**:
```bash
# Reload with zero-downtime
pm2 reload claude-flow-queen

# Graceful stop
pm2 stop claude-flow-queen
```

## Auto-Restart Configuration

### Crash Recovery

**Settings**:
- Max restarts: 10 within 60s window
- Min uptime: 60s to be considered stable
- Exponential backoff: 100ms, 200ms, 400ms...

**Monitor restart behavior**:
```bash
pm2 logs claude-flow-queen --lines 100
pm2 info claude-flow-queen | grep "restarts"
```

### Daily Restart (Optional)

**Scheduled restart at 3 AM**:
```javascript
cron_restart: '0 3 * * *'
```

**Disable cron restart**:
```bash
pm2 delete claude-flow-queen
# Edit ecosystem.config.cjs - remove cron_restart line
pm2 start ecosystem.config.cjs --env production
```

## Logging

### Log Configuration

**Log files**:
- Error log: `./logs/pm2-error.log`
- Output log: `./logs/pm2-out.log`
- Format: JSON with timestamps

**Create log directory**:
```bash
mkdir -p logs
```

### Log Management

**View logs**:
```bash
# Tail logs (all instances)
pm2 logs claude-flow-queen

# Tail specific instance
pm2 logs claude-flow-queen --instance 0

# JSON formatted logs
pm2 logs claude-flow-queen --json

# Lines limit
pm2 logs claude-flow-queen --lines 1000
```

**Log rotation**:
```bash
# Install PM2 log rotation module
pm2 install pm2-logrotate

# Configure rotation (optional)
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

## Health Monitoring

### PM2 Monitoring Integration

**Enable PM2 Plus (optional - paid service)**:
```bash
pm2 link [secret-key] [public-key]
```

**Custom health checks**:
- Queen agent exposes health endpoint
- PM failover manager monitors process health
- Auto-restart on consecutive failures (3+ failures)

### Metrics Collection

**Built-in metrics**:
```bash
pm2 info claude-flow-queen
```

**Metrics exposed**:
- CPU usage per instance
- Memory usage per instance
- Restart count
- Uptime

### External Monitoring (Optional)

**Prometheus integration**:
```bash
npm install pm2-prometheus-exporter
pm2 install pm2-prometheus-exporter
```

**Access metrics**: `http://localhost:9209/metrics`

## Production Deployment

### Initial Deployment

```bash
# 1. Clone repository
git clone git@github.com:masharratt/claude-flow-novice.git
cd claude-flow-novice

# 2. Install dependencies
npm install

# 3. Build project
npm run build

# 4. Start cluster
pm2 start ecosystem.config.cjs --env production

# 5. Save PM2 process list
pm2 save

# 6. Setup PM2 startup script (auto-start on reboot)
pm2 startup
```

### Zero-Downtime Updates

```bash
# 1. Pull latest changes
git pull origin main

# 2. Install dependencies
npm install

# 3. Rebuild
npm run build

# 4. Reload cluster (zero-downtime)
pm2 reload ecosystem.config.cjs --env production
```

### Rollback Deployment

```bash
# 1. Revert to previous commit
git reset --hard HEAD~1

# 2. Rebuild
npm run build

# 3. Reload cluster
pm2 reload ecosystem.config.cjs --env production
```

## Cluster Management Commands

### Start/Stop Operations

```bash
# Start cluster
pm2 start ecosystem.config.cjs --env production

# Stop cluster (graceful)
pm2 stop claude-flow-queen

# Delete cluster (removes from PM2)
pm2 delete claude-flow-queen

# Restart cluster (downtime)
pm2 restart claude-flow-queen

# Reload cluster (zero-downtime)
pm2 reload claude-flow-queen
```

### Scaling Operations

```bash
# Scale to specific instance count
pm2 scale claude-flow-queen 8

# Add instances (+2)
pm2 scale claude-flow-queen +2

# Remove instances (-2)
pm2 scale claude-flow-queen -2
```

### Process Management

```bash
# List all processes
pm2 list

# Process details
pm2 show claude-flow-queen

# Real-time monitoring
pm2 monit

# Process logs
pm2 logs claude-flow-queen
```

## Troubleshooting

### Common Issues

**Issue**: Cluster not starting
```bash
# Check build output
ls -la dist/src/coordination/queen-agent.js

# Validate ecosystem.config.cjs
pm2 ecosystem

# Check logs
pm2 logs claude-flow-queen --err
```

**Issue**: High memory usage
```bash
# Check memory per instance
pm2 info claude-flow-queen

# Reduce instance count
pm2 scale claude-flow-queen 2

# Increase memory limit
# Edit ecosystem.config.cjs: max_memory_restart: '4G'
pm2 reload ecosystem.config.cjs --env production
```

**Issue**: Frequent restarts
```bash
# Check restart count
pm2 info claude-flow-queen | grep "restarts"

# View error logs
pm2 logs claude-flow-queen --err --lines 200

# Increase min_uptime threshold
# Edit ecosystem.config.cjs: min_uptime: 120000 (2 min)
pm2 reload ecosystem.config.cjs --env production
```

### Performance Optimization

**CPU-bound workloads**:
- Use `instances: 'max'` (all cores)
- Enable cluster mode: `exec_mode: 'cluster'`

**Memory-bound workloads**:
- Reduce instances: `pm2 scale claude-flow-queen 2`
- Increase memory limit: `max_memory_restart: '4G'`

**I/O-bound workloads**:
- Increase instances beyond CPU cores
- Monitor disk I/O with `pm2 monit`

## Advanced Configuration

### Custom Environment Variables

**Edit ecosystem.config.cjs**:
```javascript
env_production: {
  NODE_ENV: 'production',
  PORT: 8080,
  CUSTOM_VAR: 'value'
}
```

**Reload with new variables**:
```bash
pm2 reload ecosystem.config.cjs --env production --update-env
```

### Load Balancing

**PM2 cluster mode auto-balances** across instances using round-robin.

**Custom load balancing** (requires reverse proxy):
- Nginx upstream configuration
- HAProxy backend servers
- AWS ELB/ALB target groups

### Process Isolation

**Run multiple queen agents**:
```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'queen-primary',
      script: './dist/src/coordination/queen-agent.js',
      instances: 4,
      env_production: { INSTANCE_TYPE: 'primary' }
    },
    {
      name: 'queen-secondary',
      script: './dist/src/coordination/queen-agent.js',
      instances: 2,
      env_production: { INSTANCE_TYPE: 'secondary' }
    }
  ]
};
```

## Success Criteria

**Cluster is production-ready when**:
- ✅ All instances show "online" status: `pm2 status`
- ✅ No errors in logs: `pm2 logs claude-flow-queen --err --lines 100`
- ✅ Memory usage below threshold: `pm2 info claude-flow-queen`
- ✅ Graceful shutdown works: `pm2 reload claude-flow-queen` (zero errors)
- ✅ Auto-restart on crash: kill instance, verify restart: `pm2 info claude-flow-queen`
- ✅ Health checks passing: verify queen agent health endpoint

## Next Steps

1. **Configure monitoring**: Set up Prometheus/Grafana or PM2 Plus
2. **Setup alerting**: Configure alerts for high memory, crashes, errors
3. **Load testing**: Validate cluster performance under load
4. **Backup strategy**: Implement automated backups for logs and state
5. **Disaster recovery**: Test failover scenarios and recovery procedures

## References

- PM2 Documentation: https://pm2.keymetrics.io/docs/
- PM2 Cluster Mode: https://pm2.keymetrics.io/docs/usage/cluster-mode/
- PM2 Deployment: https://pm2.keymetrics.io/docs/usage/deployment/
- PM2 Monitoring: https://pm2.keymetrics.io/docs/usage/monitoring/
