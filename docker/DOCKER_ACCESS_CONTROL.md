# Docker Access Control Policy

## Security Rationale

Docker socket access (`/var/run/docker.sock`) grants **root-equivalent privileges** on the host system. Unrestricted access allows:
- Container escape
- Host filesystem manipulation
- Privilege escalation
- Full system compromise

This document defines strict access controls to minimize attack surface while enabling CFN Loop agent lifecycle management.

---

## Access Control Matrix

| Service | Docker Socket | Justification | Restrictions |
|---------|--------------|---------------|--------------|
| **cfn-coordinator** | ✅ GRANTED | Agent spawning/termination required | Seccomp + cap restrictions |
| **cfn-redis** | ❌ DENIED | Data storage only | N/A |
| **cfn-telemetry** | ⚠️ READ-ONLY | Container metrics collection | Remove in production |
| **cfn-agent-\*** | ❌ DENIED | Execution sandbox isolation | N/A |

---

## Coordinator Permitted Actions

The `cfn-coordinator` service is the **ONLY** service with Docker daemon access. Permitted operations:

### 1. Agent Lifecycle Management
```javascript
// ALLOWED: Spawn CFN agent containers
docker.run('cfn-agent:latest', {
  Env: ['AGENT_TYPE=backend-developer', 'TASK_ID=...'],
  HostConfig: {
    Memory: 1073741824,  // 1GB limit
    NetworkMode: 'mcp-network'
  }
});

// ALLOWED: Monitor agent status
docker.getContainer('agent-id').inspect();

// ALLOWED: Terminate completed agents
docker.getContainer('agent-id').stop();
docker.getContainer('agent-id').remove();
```

### 2. Container Introspection (Read-Only)
```javascript
// ALLOWED: List running CFN agents
docker.listContainers({ filters: { label: ['cfn.agent=true'] } });

// ALLOWED: Read agent logs
docker.getContainer('agent-id').logs();
```

### 3. PROHIBITED Actions
```javascript
// ❌ FORBIDDEN: Host filesystem manipulation
docker.run('alpine', { Binds: ['/:/host'] });

// ❌ FORBIDDEN: Privileged containers
docker.run('cfn-agent', { Privileged: true });

// ❌ FORBIDDEN: Host network access
docker.run('cfn-agent', { NetworkMode: 'host' });

// ❌ FORBIDDEN: Mounting docker.sock in agents
docker.run('cfn-agent', { Binds: ['/var/run/docker.sock:/var/run/docker.sock'] });

// ❌ FORBIDDEN: Modifying coordinator itself
docker.getContainer('cfn-coordinator').stop();
```

---

## Security Enforcement Layers

### 1. Capability Restrictions
```yaml
cap_drop:
  - ALL               # Drop all capabilities
cap_add:
  - NET_BIND_SERVICE  # Only network binding (required for API server)
```

**Capabilities Denied:**
- `SYS_ADMIN` - Prevents namespace manipulation
- `SYS_PTRACE` - Prevents process inspection
- `DAC_OVERRIDE` - Prevents permission bypass
- `CHOWN` - Prevents ownership changes
- All other capabilities

### 2. Seccomp Profile
Location: `docker/seccomp/agent-lifecycle.json`

**Allowed Syscalls:**
- File operations: open, read, write, close
- Network operations: socket, bind, connect, accept
- Process management: fork, execve, wait4
- IPC: pipe, eventfd, futex
- Docker API: All required for Docker SDK operations

**Blocked Syscalls:**
- `mount` - Prevents filesystem manipulation
- `reboot` - Prevents system control
- `swapon`/`swapoff` - Prevents resource manipulation
- `setns` - Prevents namespace escape (partially allowed for clone)
- Kernel module operations

### 3. Network Isolation
```yaml
networks:
  - mcp-network  # Isolated bridge network
```

- No host network access
- Containers communicate only via `mcp-network`
- External access controlled by container rules

### 4. Resource Limits
```yaml
mem_limit: 2g        # Maximum 2GB RAM
cpu_count: 2         # Maximum 2 CPU cores
```

Prevents resource exhaustion attacks.

---

## Telemetry Service (Stabilization Only)

**Location:** `docker/docker-compose.stabilization.yml`

**Current State:** Docker socket mounted for container metrics

**Security Issue:** Read-only monitoring doesn't require socket access

**Recommended Action:**
```yaml
# REMOVE this mount in production:
# - /var/run/docker.sock:/var/run/docker.sock

# REPLACE with cAdvisor or metrics endpoint:
cfn-cadvisor:
  image: gcr.io/cadvisor/cadvisor:latest
  volumes:
    - /:/rootfs:ro
    - /var/run:/var/run:ro
    - /sys:/sys:ro
    - /var/lib/docker/:/var/lib/docker:ro
  # NO docker.sock mount required
```

**Justification for Current Mount:**
- Development/debugging use only
- Stabilization environment (not production)
- Should be removed before production deployment

---

## Validation Checklist

Before deploying to production:

- [ ] Only `cfn-coordinator` has docker.sock mounted
- [ ] Coordinator has `cap_drop: ALL` + `cap_add: [NET_BIND_SERVICE]`
- [ ] Seccomp profile is referenced and enforced
- [ ] No agent containers have docker.sock access
- [ ] Telemetry docker.sock mount removed (or replaced with cAdvisor)
- [ ] All containers use `mcp-network` isolation
- [ ] Memory/CPU limits are enforced
- [ ] No privileged containers exist

---

## Audit Commands

Verify Docker access control compliance:

```bash
# 1. Check docker.sock mounts
docker-compose config | grep -A2 "docker.sock"
# Should only show cfn-coordinator (main) or cfn-telemetry (stabilization)

# 2. Verify capability restrictions
docker inspect cfn-coordinator | jq '.[0].HostConfig.CapDrop'
# Should output: ["ALL"]

docker inspect cfn-coordinator | jq '.[0].HostConfig.CapAdd'
# Should output: ["NET_BIND_SERVICE"]

# 3. Check seccomp profile
docker inspect cfn-coordinator | jq '.[0].HostConfig.SecurityOpt'
# Should reference: seccomp=agent-lifecycle.json

# 4. Verify no agents have docker.sock
docker ps --filter "label=cfn.agent=true" --format "{{.Names}}" | \
  xargs -I{} docker inspect {} | grep docker.sock
# Should return empty (no matches)
```

---

## Incident Response

If unauthorized Docker socket access is detected:

1. **Immediate:** Stop the compromised container
   ```bash
   docker stop <container-id>
   docker rm <container-id>
   ```

2. **Investigate:** Review container configuration
   ```bash
   docker inspect <container-id> > incident-$(date +%s).json
   ```

3. **Audit:** Check for unauthorized mounts
   ```bash
   grep -r "docker.sock" docker/*.yml
   ```

4. **Remediate:** Remove socket mounts, add capability restrictions
5. **Monitor:** Enable Docker API audit logging

---

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Seccomp in Docker](https://docs.docker.com/engine/security/seccomp/)
- [Linux Capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html)
- [CWE-250: Execution with Unnecessary Privileges](https://cwe.mitre.org/data/definitions/250.html)

**Document Version:** 1.0
**Last Updated:** 2025-11-17
**Owner:** Security Team
