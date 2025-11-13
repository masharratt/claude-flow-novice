# Bug Fix: Coordinator Container Entrypoint Failure

**Status:** FIXED  
**Date:** 2025-11-13  
**Engineer:** docker-specialist  
**Confidence:** 0.95

## Problem

Coordinator container (`cfn-coordinator:v3`) failed to start with error:
```
exec /app/coordinator-entrypoint.sh: no such file or directory
```

## Root Cause

**Windows CRLF Line Endings in Dockerfile Heredoc**

The entrypoint script was created inline using a Dockerfile RUN heredoc command. When the Dockerfile was checked out from git on a Windows system with `core.autocrlf=true`, the heredoc contained CRLF (`\r\n`) line endings instead of Unix LF (`\n`).

**Evidence:**
- Octal dump showed `\r\n` sequences in script
- Alpine Linux bash interpreter cannot execute scripts with CRLF
- File existed and had correct permissions (755)
- Shebang `#!/bin/bash\r\n` was invalid

## Solution

**Two-Part Fix:**

### 1. External Entrypoint Script with LF Line Endings

Created `docker/coordinator-entrypoint.sh` as external file with proper Unix line endings:
- File created via bash cat heredoc (ensures LF)
- Verified with `od -c` showing `\n` instead of `\r\n`
- Location: `/docker/coordinator-entrypoint.sh`

### 2. Updated Dockerfile to COPY External File

**Before (inline heredoc with CRLF):**
```dockerfile
RUN cat > /app/coordinator-entrypoint.sh << 'ENTRYPOINT_EOF'
#!/bin/bash
...
ENTRYPOINT_EOF
RUN chmod +x /app/coordinator-entrypoint.sh
```

**After (external file copy):**
```dockerfile
COPY docker/coordinator-entrypoint.sh /app/coordinator-entrypoint.sh
RUN chmod +x /app/coordinator-entrypoint.sh
```

### 3. Additional Fixes Required

**Python Dependencies for better-sqlite3:**
```dockerfile
# Added to Alpine base image
RUN apk add --no-cache \
    python3 \
    py3-setuptools \  # Required for distutils module
    make \
    g++
```

**Skipped Postinstall Script:**
```dockerfile
# Coordinator doesn't need full CLI initialization
RUN npm ci --only=production --ignore-scripts && npm cache clean --force
```

## Build Process

**Used Linux Native Build Script** (`scripts/docker/build-from-linux.sh`):
- Syncs files to `/tmp/cfn-build` (Linux native storage)
- Avoids slow Windows mount I/O
- Build time: 10s (vs 755s+ on Windows mount)
- 99% performance improvement

## Verification

### Line Endings Check
```bash
$ docker run --rm --entrypoint /bin/sh cfn-coordinator:v3 -c "head -1 /app/coordinator-entrypoint.sh | od -c"
0000000   #   !   /   b   i   n   /   b   a   s   h  \n
✅ LF only (no \r)
```

### Entrypoint Execution Test
```bash
$ docker run --rm --network mcp-network \
  -e "TASK_ID=test123" \
  -e "TASK_DESCRIPTION=Test task" \
  -e "MODE=standard" \
  -e "CFN_REDIS_HOST=cfn-redis" \
  cfn-coordinator:v3

🚀 CFN Docker V3 Coordinator Starting
   Task ID: test123
   Mode: standard
   Description: Test task
✅ Entrypoint executes successfully
```

## Deliverables

1. ✅ **Fixed Dockerfile** (`Dockerfile.cfn-coordinator`)
   - Python dependencies added
   - External entrypoint script copy
   - Postinstall skipped for coordinator

2. ✅ **External Entrypoint Script** (`docker/coordinator-entrypoint.sh`)
   - Unix LF line endings
   - Executable permissions
   - Validates environment and Docker access

3. ✅ **New Docker Image** (`cfn-coordinator:v3`)
   - Created: 2025-11-13 13:25:38 PST
   - Size: 723MB
   - Working entrypoint

## Lessons Learned

### Git Configuration Impact
- Windows git `core.autocrlf=true` converts LF→CRLF on checkout
- Affects inline heredocs in Dockerfiles
- External files safer for cross-platform compatibility

### Alpine Linux Requirements
- Native modules (better-sqlite3) need build tools
- Python + py3-setuptools required for node-gyp
- `--ignore-scripts` useful for coordinator-only containers

### Build Performance
- Linux native build (rsync to /tmp): 10s
- Windows mount build: 755s+ (75x slower)
- Use `scripts/docker/build-from-linux.sh` for large projects

## Prevention

### Best Practices
1. **External scripts** for all container entrypoints
2. **Verify line endings** with `od -c` before commit
3. **Use .gitattributes** to enforce LF:
   ```
   *.sh text eol=lf
   docker/**/*.sh text eol=lf
   ```
4. **Test on Alpine Linux** (stricter than Debian/Ubuntu)

## Files Modified

- `Dockerfile.cfn-coordinator` - External entrypoint, Python deps, skip postinstall
- `docker/coordinator-entrypoint.sh` - Created with LF line endings

## Related Documentation

- Docker CLAUDE.md - Section on build strategies
- BUG_4_DOCKER_COORDINATOR.md - Container completion tracking issue
- scripts/docker/build-from-linux.sh - Linux native build pattern

---

**Confidence Score: 0.95**

- ✅ Root cause identified (CRLF line endings)
- ✅ Fix verified (entrypoint executes)
- ✅ Build reproducible (Linux native script)
- ✅ Prevention documented (.gitattributes)
- ⚠️  Remaining work: Full integration test with Docker socket + workspace mount
