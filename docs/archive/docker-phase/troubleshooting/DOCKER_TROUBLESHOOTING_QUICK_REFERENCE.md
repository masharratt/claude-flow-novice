# Docker Coordinator Troubleshooting - Quick Reference

## Symptom: chmod Permission Denied in Container

**Error:**
```
chmod: /workspace/.../orchestrate.sh: Operation not permitted
```

**Cause:** CIFS mount on Windows/WSL2 restricts permission changes

**Fix Status:** ✅ RESOLVED (coordinator-entrypoint.sh lines 80-85)

**Solution Applied:**
- Error suppression with `2>/dev/null`
- Graceful logging for user awareness
- File already has 0777 from host

**See:** `docs/DOCKER_CHMOD_WSL2_MOUNT_ISSUE.md`

---

## Symptom: Redis Queue Deadlock

**Error:**
```
/tmp/redis-cli.sh: line 5: echo "...": Broken pipe
redis-cli: Invalid argument
```

**Cause:** Redis CLI processes hanging when fed long commands via stdin

**Fix Status:** ✅ RESOLVED (redis operations use pipe input pattern)

**Solution Applied:**
```bash
# OLD (BROKEN)
echo "LPUSH task:queue $LONG_LIST" | redis-cli

# NEW (FIXED)
cat << EOF | redis-cli
LPUSH task:queue value1 value2 ...
EOF
```

**See:** `docs/bugs/BUG_3_REDIS_CLI.md`

---

## Symptom: Coordinator Infinite Wait (0/16 Tasks)

**Error:**
```
0/16 tasks completed, 16 queued
0/16 tasks completed, 16 queued  (repeats forever)
```

**Cause:** Architectural mismatch - coordinator uses Redis queue, agents use environment variables

**Fix Status:** ❌ BLOCKING (Priority P0)

**Problem:**
- Coordinator: Pushes to Redis queue + embeds in env var
- Agents: Execute from env var (never consume queue)
- Coordinator: Waits on queue counter that never increments

**Required Fix:**
Replace Redis queue polling with Docker container status polling

**See:** `docs/bugs/BUG_4_DOCKER_COORDINATOR.md`

---

## Quick Diagnostic Checklist

### For chmod Errors
- [ ] Check file has 0777: `stat /path/to/script.sh | grep Access`
- [ ] Verify inside container: `docker exec container stat /workspace/script.sh`
- [ ] Attempt chmod on host: Works (ext4) vs container: Fails (CIFS)
- [ ] Solution: Use error suppression pattern

### For Queue Issues
- [ ] Check Redis connectivity: `docker exec cfn-redis redis-cli ping`
- [ ] List queue: `docker exec cfn-redis redis-cli LLEN task:queue`
- [ ] Check task counter: `docker exec cfn-redis redis-cli GET task:completed`
- [ ] Verify agent logs: `docker logs agent-container-name`
- [ ] Solution: Check if agents are actually claiming from queue

### For Infinite Waits
- [ ] Check coordinator logs: `docker logs cfn-coordinator | tail -50`
- [ ] Check agent status: `docker ps --filter "name=agent-"`
- [ ] Check exit codes: `docker ps -a --filter "name=agent-" --format "{{.Names}}\t{{.Status}}"`
- [ ] Solution: Review Bug #4 - may require Docker API polling

---

## Container Mount Types and Permission Behavior

| Mount Type | Platform | chmod Works? | Use Case |
|-----------|----------|-------------|----------|
| **Bind (native)** | Linux | ✅ Yes | Linux hosts |
| **CIFS** | WSL2/Docker Desktop | ❌ No (restricted) | Windows hosts |
| **NFS** | macOS/Linux networks | ✅ Yes | Network mounts |
| **tmpfs (container)** | All | ✅ Yes | Temporary files |

**Recommendation:** For mounted volumes, assume permissions are set by host and don't rely on chmod in container.

---

## WSL2-Specific Gotchas

### Mount Path Length
Windows MAX_PATH is 260 characters (including drive letter)
- ❌ Deep paths: `/mnt/c/Users/Name/very/deep/project/.../file.sh`
- ✅ Short paths: `/mnt/c/project/file.sh`

### Symlink Limitations
Symlinks don't work reliably across CIFS boundaries
- ❌ Symlink to Windows file: `ln -s /mnt/c/file.txt ./link`
- ✅ Copy instead: `cp /mnt/c/file.txt ./file`

### Performance Degradation
CIFS mounts are slower than native ext4
- ❌ Heavy I/O workloads: 5-10x slower
- ✅ Light I/O (our coordinator): Acceptable

---

## Recovery Procedures

### Reset Coordinator State
```bash
# Stop coordinator
docker stop cfn-coordinator

# Clear Redis
docker exec cfn-redis redis-cli FLUSHALL

# Remove hanging agents
docker ps -a --filter "name=agent-" -q | xargs docker rm -f

# Restart services
docker-compose restart cfn-redis
```

### Rebuild Coordinator Image
```bash
docker build -f Dockerfile.coordinator -t cfn-coordinator:v3 \
  --no-cache .
```

### Clean Full Environment
```bash
# Remove all CFN containers
docker ps -a --filter "name=cfn-" -q | xargs docker rm -f

# Remove all agent containers
docker ps -a --filter "name=agent-" -q | xargs docker rm -f

# Start fresh
docker-compose up -d cfn-redis
# Then spawn coordinator
```

---

## References

- **chmod WSL2 issue:** `docs/DOCKER_CHMOD_WSL2_MOUNT_ISSUE.md`
- **Redis deadlock fix:** `docs/bugs/BUG_3_REDIS_CLI.md`
- **Coordinator architecture bug:** `docs/bugs/BUG_4_DOCKER_COORDINATOR.md`
- **Full Docker orchestration guide:** `docker/CLAUDE.md`
