# Docker Troubleshooting Guide

## Build Issues

### Slow Builds (> 5 minutes)
**Problem**: Builds taking 10+ minutes
**Cause**: Building from Windows mount in WSL2
**Solution**:
```bash
# Verify build location
pwd  # Should be on Linux filesystem, not /mnt/c/

# Use build script (automatically uses Linux storage)
./.claude/skills/docker-build/build.sh

# Manual Linux build
DOCKERFILE="docker/Dockerfile.agent" IMAGE_NAME="cfn-agent" ./scripts/docker/build-from-linux.sh
```

### Docker Context Too Large
**Problem**: Build context > 500MB
**Cause**: .dockerignore missing or incomplete
**Solution**:
```bash
# Check .dockerignore exists
ls -la .dockerignore

# Add to .dockerignore:
node_modules/
.git/
.env.local
*.log
coverage/
.claude/agents/**/*.md
!.claude/agents/cfn-dev-team/**/*.md
```

### Out of Disk Space
**Problem**: "No space left on device" during build
**Solution**:
```bash
# Clean Docker
docker system prune -a --volumes

# Clean build cache
docker builder prune -a

# Clean /tmp/cfn-build if exists
rm -rf /tmp/cfn-build
```

## Runtime Issues

### Container Won't Start
**Problem**: Container exits immediately
**Debug**:
```bash
# Check logs
docker-compose logs <service-name>

# Run interactively
docker-compose run --rm <service-name> /bin/bash

# Check exit code
docker ps -a | grep <service-name>
```

### Port Conflicts
**Problem**: "Port already in use"
**Solution**:
```bash
# Find process using port
sudo lsof -i :6379

# Stop conflicting services
docker stop $(docker ps -q)

# Use port offsets in worktrees
export COMPOSE_PROJECT_NAME="cfn-$(git rev-parse --short HEAD)"
```

### Memory Issues
**Problem**: OOMKilled containers
**Symptoms**:
- Exit code 137
- Container disappears
- System slows down
**Solution**:
```bash
# Check container limits
docker inspect <container> | grep -A 10 "Memory"

# Increase memory tier in batching
# Move from Tier 1 (512MB) to Tier 2 (600MB) or Tier 3 (800MB)

# Monitor memory usage
docker stats
```

### Redis Connection Failed
**Problem**: "Redis connection refused"
**Debug**:
```bash
# Check Redis container
docker-compose ps redis

# Check Redis logs
docker-compose logs redis

# Test connection
docker-compose exec redis redis-cli ping

# Common fixes:
# 1. Ensure Redis is started: docker-compose up -d redis
# 2. Check port conflicts
# 3. Verify REDIS_HOST in environment
```

## Agent Issues

### Agents Not Completing
**Problem**: Tasks stuck at "0/X completed"
**Cause**: Bug #4 - Coordinator waiting for queue consumption
**Temporary Fix**:
```bash
# Check agent containers
docker ps | grep cfn-agent

# Check agent logs
docker logs <agent-container>

# Manual completion signal (temporary)
redis-cli incr "task:completed"
```

### Agent Exit Codes
| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | None |
| 1 | Task Error | Check logs for error details |
| 125 | Docker Error | Check Dockerfile |
| 126 | Command Not Found | Verify PATH in container |
| 127 | Command Not Found | Check command syntax |
| 137 | OOM Killed | Increase memory allocation |
| 143 | SIGTERM | Timeout occurred |
| 255 | Unknown Error | Full restart required |

### Duplicate Agent Containers
**Problem**: Multiple containers with same name
**Solution**:
```bash
# Clean up old containers
docker rm $(docker ps -aq --filter "name=cfn-agent")

# Restart services
docker-compose down
docker-compose up -d
```

## Performance Issues

### High CPU Usage
**Debug**:
```bash
# Check container CPU
docker stats --no-stream

# Identify busy processes
docker-compose exec <service> top

# Common causes:
# - Inefficient loops
# - Missing sleep in polling
# - Too many concurrent agents
```

### Slow Task Processing
**Optimizations**:
1. **Reduce Batch Size**: Smaller batches process faster
2. **Increase Parallelism**: More agents per wave
3. **Optimize Docker Layers**: Better caching
4. **Use SSD Storage**: Faster I/O

## Network Issues

### Container Communication Failed
**Debug**:
```bash
# Check network
docker network ls

# Test connectivity
docker-compose exec app ping redis

# Verify service names (not container names)
# Use: redis, postgres, orchestrator
# Not: cfn-redis-1, cfn-postgres-1
```

### External Access Not Working
**Problem**: Cannot access services from host
**Check**:
```bash
# Port mapping in docker-compose.yml
ports:
  - "3000:3000"  # Host:Container

# Check firewall
sudo ufw status

# Check if service actually running inside container
docker-compose exec app netstat -tulpn
```

## Recovery Procedures

### Full System Reset
```bash
# Stop all services
docker-compose down

# Remove volumes (WARNING: Deletes data)
docker-compose down -v

# Clean everything
docker system prune -a --volumes

# Restart
docker-compose up -d
```

### Data Recovery
```bash
# Backup volumes
docker run --rm -v cfn-postgres-data:/data -v $(pwd):/backup ubuntu tar czf /backup/postgres-backup.tar.gz -C /data .

# Restore volumes
docker run --rm -v cfn-postgres-data:/data -v $(pwd):/backup ubuntu tar xzf /backup/postgres-backup.tar.gz -C /data
```

## Getting Help

### Collect Debug Information
```bash
# System info
docker version
docker-compose version
docker info

# Container state
docker-compose ps
docker-compose logs

# Resource usage
docker stats --no-stream
df -h
free -h
```

### Create Issue Report
```bash
# Save diagnostics
docker diagnose > docker-diagnostics.log

# Include in issue:
# 1. OS and Docker version
# 2. docker-compose.yml (redacted)
# 3. Relevant logs
# 4. Error messages
# 5. Steps to reproduce
```