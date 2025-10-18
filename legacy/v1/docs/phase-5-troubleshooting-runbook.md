# Phase 5 Monitoring Infrastructure - Troubleshooting Runbook

## 1. Quick Diagnostics

### Health Check Commands
```bash
# Check server status
curl http://localhost:3001/health

# Check Redis connection
redis-cli ping

# Check WebSocket connectivity
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://localhost:3001/ws

# Check metrics
curl http://localhost:3001/api/redis/metrics | jq .
```

### Log Locations
- Server logs: `/var/log/redis-monitoring/server.log`
- Redis logs: `/var/log/redis/redis-server.log`
- PM2 logs: `~/.pm2/logs/`
- Application logs: `.artifacts/logs/`

## 2. Common Issues

### Issue 1: WebSocket Connection Refused

**Symptoms:**
- Dashboard shows "Disconnected"
- Console error: "WebSocket connection failed"
- Network tab shows 503 errors

**Diagnosis:**
```bash
# Check if server is running
pm2 status
netstat -tulpn | grep 3001

# Check firewall
sudo ufw status
```

**Solutions:**
1. Restart server: `pm2 restart redis-monitoring-server`
2. Check firewall: `sudo ufw allow 3001/tcp`
3. Verify CORS settings in environment variables
4. Check SSL certificate validity

---

### Issue 2: Redis Connection Timeout

**Symptoms:**
- Monitoring service logs: "Redis connection error"
- No feedback messages appearing
- API returns 503 Service Unavailable

**Diagnosis:**
```bash
# Test Redis connectivity
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping

# Check Redis server status
redis-cli INFO | grep redis_version

# Monitor Redis connections
redis-cli CLIENT LIST
```

**Solutions:**
1. Verify Redis credentials in environment
2. Check network connectivity: `telnet $REDIS_HOST $REDIS_PORT`
3. Verify Redis server is running: `sudo systemctl status redis`
4. Check Redis maxclients: `redis-cli CONFIG GET maxclients`
5. Restart Redis: `sudo systemctl restart redis`

---

### Issue 3: High Memory Usage

**Symptoms:**
- Server memory >500MB
- Slow dashboard loading
- Out of memory errors

**Diagnosis:**
```bash
# Check memory usage
pm2 list
ps aux | grep node | awk '{print $6}'

# Check Redis memory
redis-cli INFO memory

# Node.js heap dump
node --inspect dist/src/web/dashboard/realtime/server.js
```

**Solutions:**
1. Restart server to clear accumulated memory
2. Reduce MAX_HISTORY_SIZE in configuration
3. Implement circular buffer fixes (if not applied)
4. Check for memory leaks: Run heap profiler
5. Scale horizontally: Add more server instances

---

### Issue 4: Stale Messages in Queue

**Symptoms:**
- Dashboard shows many stale keys
- Old messages not processed
- Agents not receiving feedback

**Diagnosis:**
```bash
# Check queue lengths
redis-cli KEYS "*:feedback" | xargs -I {} redis-cli LLEN {}

# Check oldest messages
redis-cli LINDEX "agent:coder-1:feedback" -1

# Monitor CLI script
./scripts/monitor-swarm-redis.sh queues
```

**Solutions:**
1. Check if agents are still running
2. Clear stale queues: `redis-cli LTRIM agent:coder-1:feedback 0 0`
3. Verify coordinator is polling (Task agents)
4. Check agent IDs match Redis channel patterns
5. Restart monitoring service

---

### Issue 5: Dashboard Not Updating

**Symptoms:**
- Dashboard loads but data is static
- No real-time updates
- Metrics show 0 values

**Diagnosis:**
```bash
# Check WebSocket events
# Open browser console and look for:
# - WebSocket connection status
# - Incoming message events
# - JavaScript errors

# Check monitoring service
curl http://localhost:3001/api/redis/metrics

# Monitor Redis pub/sub
redis-cli PSUBSCRIBE "agent:*:feedback"
```

**Solutions:**
1. Refresh dashboard (Ctrl+R)
2. Clear browser cache
3. Check browser console for errors
4. Verify WebSocket URL in dashboard config
5. Check if monitoring service is subscribed to Redis

---

### Issue 6: Slow Performance

**Symptoms:**
- Dashboard lags
- High latency (>100ms)
- CPU usage >50%

**Diagnosis:**
```bash
# Check CPU usage
top -p $(pgrep -f redis-monitoring)

# Check Node.js performance
clinic doctor -- node dist/src/web/dashboard/realtime/server.js

# Profile with Chrome DevTools
node --inspect dist/src/web/dashboard/realtime/server.js
```

**Solutions:**
1. Reduce monitoring interval (increase from 5s to 10s)
2. Limit concurrent connections (reduce MAX_CONNECTIONS)
3. Enable compression
4. Implement message batching
5. Add caching layer for metrics
6. Scale horizontally

---

## 3. Emergency Procedures

### Total System Restart
```bash
# Stop everything
pm2 stop all
sudo systemctl stop redis

# Clear temporary data
rm -rf .artifacts/temp/*
redis-cli FLUSHDB  # CAUTION: Clears all Redis data

# Start services
sudo systemctl start redis
pm2 start ecosystem.config.js
```

### Rollback to Previous Version
```bash
# Stop current version
pm2 stop redis-monitoring-server

# Restore backup
tar -xzf /backups/redis-monitoring-backup-20251016.tar.gz

# Start previous version
pm2 start ecosystem.config.js
```

## 4. Performance Optimization

### Redis Tuning
```bash
# Optimize for monitoring workload
redis-cli CONFIG SET maxmemory-policy allkeys-lru
redis-cli CONFIG SET save ""  # Disable persistence if not needed
redis-cli CONFIG SET appendonly no
```

### Node.js Tuning
```bash
# Increase heap size if needed
node --max-old-space-size=2048 dist/src/web/dashboard/realtime/server.js
```

## 5. Monitoring Commands

### Real-time Monitoring
```bash
# Watch metrics
watch -n 1 'curl -s http://localhost:3001/api/redis/metrics | jq .'

# Monitor connections
watch -n 1 'redis-cli CLIENT LIST | wc -l'

# Monitor memory
watch -n 1 'pm2 jlist | jq ".[0].monit"'
```

### CLI Monitoring Script
```bash
# Monitor all channels
./scripts/monitor-swarm-redis.sh all

# Monitor specific mode
./scripts/monitor-swarm-redis.sh feedback
./scripts/monitor-swarm-redis.sh coordination
./scripts/monitor-swarm-redis.sh queues
```

## 6. Escalation Procedures

### Level 1: Self-Service (5 mins)
- Check health endpoints
- Review recent logs
- Restart services

### Level 2: Operations Team (15 mins)
- Deep log analysis
- Resource investigation
- Configuration review

### Level 3: Engineering Team (30 mins)
- Code-level debugging
- Performance profiling
- Architecture review

## 7. Contact Information

- On-call Engineer: [Contact]
- DevOps Team: [Email/Slack]
- Documentation: [Wiki URL]

## 8. Appendix: Monitoring Best Practices

### Proactive Monitoring
1. Set up automated alerts for:
   - Memory usage > 80%
   - High latency requests
   - Dropped WebSocket connections
   - Redis connection failures

2. Implement periodic health checks:
   ```bash
   # Automated health check script
   #!/bin/bash

   # Check Redis
   if ! redis-cli ping; then
     send_alert "Redis connection failed"
   fi

   # Check WebSocket server
   if ! curl -f http://localhost:3001/health; then
     send_alert "Monitoring server unresponsive"
   fi

   # Check message queue
   QUEUE_LENGTH=$(redis-cli LLEN "agent:feedback")
   if [ "$QUEUE_LENGTH" -gt 1000 ]; then
     send_alert "Message queue backlog detected"
   fi
   ```

### Log Analysis Tips
- Use `grep` and `awk` for quick log filtering
- Set up log rotation to prevent disk space issues
- Use `jq` for parsing JSON logs
- Create custom log parsing scripts for common troubleshooting patterns

### Performance Logging
```bash
# Create performance snapshot
function capture_performance_snapshot() {
  echo "--- System Performance Snapshot ---"
  date
  echo "\n--- CPU Usage ---"
  top -bn1 | head -n 5
  echo "\n--- Memory Usage ---"
  free -h
  echo "\n--- Disk Usage ---"
  df -h
  echo "\n--- Node.js Processes ---"
  pm2 list
  echo "\n--- Redis Info ---"
  redis-cli INFO | grep -E "used_memory|connected_clients|blocked_clients"
}

# Run periodically or on-demand
capture_performance_snapshot > .artifacts/logs/performance-$(date +%Y%m%d-%H%M%S).log
```

## 9. Future Improvements
- Implement automated recovery scripts
- Enhance real-time monitoring dashboard
- Create machine learning-based anomaly detection
- Develop more comprehensive health check mechanisms

**Revision Date:** 2025-10-17
**Version:** 1.0.0