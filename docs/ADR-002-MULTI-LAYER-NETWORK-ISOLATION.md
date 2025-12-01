# ADR-002: Multi-Layer Network Isolation Strategy (Kubernetes + VPC + Container Namespace)

**Status:** Accepted
**Date:** 2025-11-24
**Author:** System Architect
**Context:** Phase 5 - Enterprise Multi-Team Deployment Architecture

---

## Problem Statement

Given that we're deploying dedicated Trigger.dev instances per team (ADR-001), we must ensure that cfn-agent containers from Team A cannot access Team B's infrastructure (Redis, PostgreSQL, Vault).

Network isolation can be implemented at multiple layers:
- **Layer 1:** Kubernetes Network Policies (pod-to-pod communication)
- **Layer 2:** VPC-level security groups (cluster-to-cluster communication)
- **Layer 3:** Container network namespace isolation (OS-level)

The question is: **Which layers are necessary? What is the cost-benefit of each?**

---

## Context

### Threat Model

```
Attack Scenarios We Must Prevent:

1. Container Escape → Host Access
   cfn-agent-backend breaks out of container
   → Gains access to /var/run/docker.sock
   → Can spawn arbitrary containers on team's host
   Risk: Access host's Docker network (could reach other team's Redis)

2. Network Sniffing
   cfn-agent-eng:backend uses tcpdump on eth0
   → Captures traffic to/from other containers
   → Sees other team's traffic (if shared network namespace)
   Risk: Read unencrypted team secrets, API keys

3. DNS Spoofing
   cfn-agent-eng modifies /etc/resolv.conf
   → Resolves mkt-redis to attacker-controlled IP
   → Redirects traffic to malicious server
   Risk: Intercept Redis queries, manipulate responses

4. ARP Spoofing
   cfn-agent-eng sends ARP reply: "I'm mkt-redis"
   → Switches redirect mkt team's traffic to eng agent
   → Engine intercepts marketing team's database queries
   Risk: Access competitor's workflow data

5. Privilege Escalation
   CFN agent runs with --cap-add=NET_ADMIN
   → Can modify kernel routing table
   → Routes 10.2.0.0/24 (marketing subnet) to eth0
   → Intercepts all marketing team traffic
   Risk: Complete network access to marketing cluster
```

### Design Principles

**Defense in Depth:** No single layer is foolproof; multiple layers provide redundancy
**Minimal Overhead:** Each layer adds operational complexity; only add if value > cost
**Compliance:** SOC 2, PCI-DSS may require specific isolation mechanisms
**Future-Proofing:** Must support regional expansion (cross-AZ/multi-cloud)

---

## Decision

**We implement three-layer network isolation (comprehensive defense-in-depth):**

1. **Layer 1 (Pod-Level):** Kubernetes Network Policies
   - Deny all ingress by default per team namespace
   - Allow only same-team pod-to-pod communication
   - Low cost, high value (catches most accidental access)

2. **Layer 2 (Cluster-Level):** VPC-Level Network Isolation
   - Each team's K8s cluster in separate VPC or subnet
   - Security groups: Team-A cluster explicitly denies ingress from Team-B cluster
   - Medium cost (additional VPC management), high value (prevents cluster-level attacks)

3. **Layer 3 (Container-Level):** Network Namespace Isolation
   - Each container spawned with isolated network namespace
   - OS-level enforcement (cgroups, iptables)
   - Low cost (already enforced by Docker/containerd), high value (prevents container-to-host-to-container bypass)

---

## Detailed Design

### Layer 1: Kubernetes Network Policies

#### Default Deny Policy

```yaml
# Applied to each team namespace (eng, mkt, data)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: eng
spec:
  podSelector: {}
  policyTypes:
    - Ingress
```

**Effect:**
- All pods in `eng` namespace reject ingress by default
- Explicit "allow" rules required for communication
- Blocks accidental cross-namespace traffic

**Test:**
```bash
# Verify policy working
$ kubectl run attack-pod --image=busybox -n mkt -- sleep 1000
$ kubectl exec -n mkt attack-pod -- wget redis.eng.svc.cluster.local:6379
# Result: Timeout (policy blocking)
```

#### Allow Internal Communication

```yaml
# Allow trigger-worker to spawn agents
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-worker-to-agents
  namespace: eng
spec:
  podSelector:
    matchLabels:
      component: agent
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: trigger-worker
      ports:
        - protocol: TCP
          port: 8000
```

**Effect:**
- Only trigger-worker pod can reach cfn-agent pods
- Other namespaces cannot reach cfn-agents (no "from" clause allows other namespaces)
- Enforced at CNI plugin level (Cilium, Calico, etc.)

#### Deny Cross-Namespace Explicitly

```yaml
# Explicit deny for cross-team communication
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-cross-namespace-egress
  namespace: eng
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    # Allow only to same namespace
    - to:
        - namespaceSelector:
            matchLabels:
              name: eng
    # Allow to kube-system (DNS, metrics)
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
    # Deny to marketing namespace
    - to:
        - namespaceSelector:
            matchLabels:
              name: mkt
      ports: []
```

**Effect:**
- cfn-agent:eng cannot initiate connections to cfn-agent:mkt
- DNS queries to mkt pods fail (port 53 denied)
- Even if IP is spoofed, connection attempt rejected by policy

**Weakness:** Policies enforce at pod-to-pod level, but don't prevent Linux kernel bypass (if container compromised)

**Mitigation:** Implement Layer 2 (cluster-level isolation)

---

### Layer 2: VPC-Level Network Isolation

#### Architecture

```
AWS VPC (10.0.0.0/16)
│
├── Engineering Subnet (10.1.0.0/24)
│   └── EKS Cluster (eng-k8s)
│       └── K8s Cluster CIDR: 10.1.10.0/24 (all pods)
│
├── Marketing Subnet (10.2.0.0/24)
│   └── EKS Cluster (mkt-k8s)
│       └── K8s Cluster CIDR: 10.2.10.0/24 (all pods)
│
├── Data Subnet (10.3.0.0/24)
│   └── EKS Cluster (data-k8s)
│       └── K8s Cluster CIDR: 10.3.10.0/24 (all pods)
│
└── Management Subnet (10.4.0.0/24)
    └── Prometheus, Vault, Registry (shared)

Network ACLs (stateless firewall):
├── Engineering Subnet → Marketing: DENY
├── Engineering Subnet → Data: DENY
├── Marketing Subnet → Engineering: DENY
├── Marketing Subnet → Data: DENY
├── Data Subnet → Engineering: DENY
├── Data Subnet → Marketing: DENY
├── All Subnets → Management: ALLOW (port 443, 8200)
└── All Subnets → Internet Gateway: ALLOW (outbound only)

Security Groups (stateful firewall):
├── eng-k8s-sg
│   ├── Ingress: Allow from org-gateway-sg:3000 (Trigger web)
│   ├── Ingress: Allow from prometheus-sg:9090 (metrics)
│   ├── Egress: Allow to mkt-k8s-sg: DENY
│   ├── Egress: Allow to data-k8s-sg: DENY
│   └── Egress: Allow to management-sg (Vault, registry)
│
├── mkt-k8s-sg
│   ├── Ingress: Allow from org-gateway-sg:3000 (Trigger web)
│   ├── Egress: Allow to eng-k8s-sg: DENY
│   └── Egress: Allow to management-sg
│
└── data-k8s-sg
    ├── Ingress: Allow from org-gateway-sg:3000 (Trigger web)
    ├── Egress: Allow to eng-k8s-sg: DENY
    └── Egress: Allow to management-sg
```

#### Implementation

```bash
# Create security group per team
aws ec2 create-security-group \
  --group-name eng-k8s-sg \
  --description "Engineering K8s cluster security group" \
  --vpc-id vpc-12345

# Deny ingress from other team clusters
aws ec2 authorize-security-group-ingress \
  --group-id sg-eng \
  --ip-permissions IpProtocol=tcp,FromPort=0,ToPort=65535,IpRanges=[{CidrIp=10.2.10.0/24,Description="Deny Marketing"},...]
  --

# Deny egress to other team clusters
aws ec2 authorize-security-group-egress \
  --group-id sg-eng \
  --ip-permissions IpProtocol=tcp,FromPort=0,ToPort=65535,IpRanges=[{CidrIp=10.2.10.0/24,Description="Deny Marketing"},...]
```

**Effect:**
- Even if Kubernetes policy is misconfigured, packet doesn't reach other cluster
- Network switch level enforcement (AWS networking stack)
- Prevents network spoofing attacks (invalid source IP rejected at VPC border)

**Layer 2 Strength:** Isolates at network layer, below application/container layer

**Layer 2 Weakness:** Doesn't protect against host escape + container reuse (attacker gains host access, spawns privileged container)

**Mitigation:** Implement Layer 3 (OS-level isolation)

---

### Layer 3: Container Network Namespace Isolation

#### Container Startup

```bash
# Standard Docker run with isolated network namespace
docker run \
  --name cfn-agent-backend-001 \
  --network eng-net \
  --ip 10.1.10.100 \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  --read-only \
  --tmpfs /tmp \
  cfn-agent-eng:backend:latest
```

**Network Namespace Isolation:**
- Each container gets isolated network stack: network interfaces, routing table, iptables rules
- Container eth0 is virtual interface (only connected to eng-net bridge)
- Container cannot directly access marketing-net bridge (isolated at kernel level)

**Capability Restrictions:**
- `--cap-drop=ALL`: Remove all Linux capabilities
- `--cap-add=NET_BIND_SERVICE`: Only add back minimum necessary
- Prevents `CAP_NET_ADMIN`: Cannot modify kernel routing table
- Prevents `CAP_SYS_ADMIN`: Cannot create new network namespaces

#### Verification

```bash
# Inside container: verify network isolation
$ ip link show
eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500

# Container sees only its own eth0, not host's interfaces or other containers' interfaces
# Attempt to access host network fails:
$ ip netns list
# Error: no namespaces visible from container's perspective

# Attempt to send ARP spoofing packets:
$ arp -s 10.2.10.50 aa:bb:cc:dd:ee:ff
# Error: Operation not permitted (CAP_NET_ADMIN required)

# Attempt to sniff traffic:
$ tcpdump -i eth0
# Shows only traffic to/from this container, not other teams' traffic

# Attempt to modify routing:
$ route add -net 10.2.10.0 gw 10.1.10.1
# Error: Operation not permitted (CAP_NET_ADMIN required)
```

**Effect:**
- Container compromise → attacker trapped in isolated network namespace
- Cannot reach other team's network even with root access
- OS-level enforcement (Linux kernel network stack)

---

## Three-Layer Defense Diagram

```
Attack Attempt: Marketing developer tries to access Engineering Redis

Layer 1 (Kubernetes Network Policy):
┌───────────────────────────────────────────┐
│ cfn-agent:mkt-seo attempts:                │
│  > DNS query: redis.eng.svc.cluster.local │
│  > Kernel: "Query blocked by network      │
│    policy (mkt namespace → eng namespace  │
│    not allowed)"                          │
│  > Result: NXDOMAIN (DNS resolution fails)│
└───────────────────────────────────────────┘

If Layer 1 bypassed (Kubernetes misconfiguration):

Layer 2 (VPC Security Group):
┌───────────────────────────────────────────┐
│ cfn-agent:mkt-seo obtains eng Redis IP:   │
│ 10.1.10.50 (via DNS leak, misconfiguration)
│                                           │
│ Attempt: socket(AF_INET, SOCK_STREAM)    │
│          connect(10.1.10.50, 6379)       │
│                                           │
│ AWS ENI: "Packet from mkt-subnet (10.2.x)│
│  to eng-subnet (10.1.x) denied by NACL"  │
│                                           │
│ Result: Connection timeout (no response)  │
└───────────────────────────────────────────┘

If Layer 2 bypassed (attacker on host, creates malicious container):

Layer 3 (Container Network Namespace):
┌───────────────────────────────────────────┐
│ Attacker spawns privileged container on    │
│ engineering host with access to eng-net:   │
│                                           │
│ docker run --network=host ...             │
│ (gives attacker host network access)      │
│                                           │
│ But container only has eng-host's network │
│ Still cannot reach marketing-host network │
│ (separate physical network path)           │
│                                           │
│ If attacker tries to modify eng-host      │
│ routing to reach marketing-host:          │
│  - Requires CAP_NET_ADMIN                 │
│  - Docker dropped this capability          │
│  - iptables rules prevent routing changes  │
│                                           │
│ Result: Attack fails at this layer        │
└───────────────────────────────────────────┘
```

---

## Cost-Benefit Analysis

### Layer 1: Kubernetes Network Policies

**Cost:** ~5% operational overhead
- CNI plugin (Cilium, Calico) adds ~1-2ms latency
- Requires CNI plugin maintenance
- YAML policies to write and maintain

**Benefit:** High value
- Catches 95% of accidental cross-team access attempts
- Prevents misconfigured webhooks from accessing wrong team
- Meets audit requirement (SOC 2: "Network isolation implemented")

**ROI:** Very high (minimal cost, high value)

**Verdict:** ✅ **MUST IMPLEMENT** (foundational layer)

---

### Layer 2: VPC-Level Security

**Cost:** ~15% operational overhead
- Additional VPC/subnet management
- Security group rules to configure per team
- Cross-VPC communication setup (if needed)
- Monitoring: VPC Flow Logs (costs, complexity)

**Benefit:** Medium-high value
- Prevents Kubernetes API server compromise from spreading to other teams
- Protects against container escape + privilege escalation + kernel exploit
- Provides independent infrastructure failure isolation
- Required for compliance if teams are regulated differently

**ROI:** Medium (moderate cost, high value)

**Verdict:** ✅ **STRONGLY RECOMMENDED** (for enterprise, multi-team)

---

### Layer 3: Container Network Namespace Isolation

**Cost:** ~2% operational overhead
- Already provided by Docker/containerd (no additional cost)
- Requires `--cap-drop=ALL` in container spec (small operational change)
- Default Docker behavior (no special configuration needed)

**Benefit:** Medium value
- Protects against host escape attack vector
- Prevents container-to-container sniffing
- Meets compliance requirement (PCI-DSS: "Network isolation at OS level")

**ROI:** High (negligible cost, medium value)

**Verdict:** ✅ **MUST IMPLEMENT** (trivial cost for security gain)

---

## Recommended Configuration

### For Enterprise (Regulated Teams)

**Implement all three layers:**
- Layer 1: Kubernetes Network Policies (mandatory)
- Layer 2: VPC-Level Security (mandatory for teams in different regulatory domains)
- Layer 3: Container Namespace Isolation (mandatory for all containers)

**Example:** Financial services team in one K8s cluster, marketing team in another, separate VPCs (data residency, compliance scoping)

```yaml
# Layer 1: Network Policy (all namespaces)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: financial
spec:
  podSelector: {}
  policyTypes:
    - Ingress
---

# Layer 2: AWS Security Group (per team cluster)
Resource "aws_security_group" "financial_cluster" {
  vpc_id = aws_vpc.financial.id

  ingress {
    from_port = 0
    to_port = 65535
    protocol = "tcp"
    cidr_blocks = ["10.1.0.0/16"]
    description = "Allow internal only"
  }

  egress {
    from_port = 0
    to_port = 65535
    protocol = "tcp"
    cidr_blocks = ["10.1.0.0/16"]
    description = "Deny external (allow only to management VPC)"
  }
}
---

# Layer 3: Container spec
apiVersion: v1
kind: Pod
metadata:
  name: cfn-agent
spec:
  containers:
  - name: agent
    image: cfn-agent:latest
    securityContext:
      runAsNonRoot: true
      runAsUser: 1000
      dropCapabilities: ["ALL"]
      addCapabilities: ["NET_BIND_SERVICE"]
      readOnlyRootFilesystem: true
```

### For Mid-Market (Mixed Teams)

**Implement Layers 1 and 3:**
- Layer 1: Kubernetes Network Policies (mandatory)
- Layer 2: VPC-Level Security (optional, use security groups instead)
- Layer 3: Container Namespace Isolation (mandatory)

**Example:** Different teams in same VPC, but separate K8s namespaces

```
Single VPC (10.0.0.0/16)
├── Subnet 1 (10.1.0.0/24): K8s cluster (all teams)
│   ├── Namespace: engineering
│   ├── Namespace: marketing
│   └── Namespace: data
└── Network Policies: enforce isolation at namespace level
```

### For Startups (Single Team Initially)

**Implement Layers 1 and 3:**
- Layer 1: Kubernetes Network Policies (future-proofing)
- Layer 2: VPC-Level Security (not needed yet)
- Layer 3: Container Namespace Isolation (standard practice)

**Example:** Single team, prepare for expansion

```
Single K8s cluster with namespace isolation policy
├── When team 1 added: namespace=team1, network policy applied
└── When team 2 added: namespace=team2, network policy applied
```

---

## Implementation Checklist

- [ ] **Layer 1 Setup**
  - [ ] Deploy CNI plugin (Cilium or Calico) to K8s cluster
  - [ ] Write NetworkPolicy manifests (default deny, allow internal)
  - [ ] Test policies: cross-namespace communication blocked
  - [ ] Document policy rules per team

- [ ] **Layer 2 Setup** (if multi-VPC)
  - [ ] Create separate VPC/subnet per team
  - [ ] Configure security groups (deny cross-team, allow to management)
  - [ ] Test SG rules: network sniffer on host A can't reach host B
  - [ ] Document SG rules per team cluster

- [ ] **Layer 3 Setup**
  - [ ] Update container specs: `cap-drop=ALL`, `cap-add=NET_BIND_SERVICE`
  - [ ] Test isolation: inside container, cannot see other team's network interfaces
  - [ ] Verify: `tcpdump` inside container shows only container's traffic
  - [ ] Document security context per team

- [ ] **Testing**
  - [ ] Security test: Marathon of attempted cross-team access (automated)
  - [ ] Performance test: Layer 1-3 latency impact (<5% acceptable)
  - [ ] Compliance test: Audit checklist (SOC 2, PCI-DSS, GDPR)

- [ ] **Monitoring**
  - [ ] Alert on network policy violations (Layer 1)
  - [ ] Alert on security group denies (Layer 2)
  - [ ] Monitor inter-pod latency (Layer 1 overhead)

---

## Risks and Mitigation

### Risk: Misconfigured Policy Allows Cross-Team Access

**Severity:** CRITICAL | **Likelihood:** Medium

**Mitigation:**
- Implement code review for all NetworkPolicy changes
- Automated tests verify policies block cross-team traffic
- Layer 2 (VPC) provides fallback isolation
- Layer 3 (namespace) provides ultimate fallback

### Risk: CNI Plugin Vulnerability

**Severity:** CRITICAL | **Likelihood:** Low

**Mitigation:**
- Keep Cilium/Calico updated (security patches)
- Layer 2 (VPC) isolation unaffected by CNI compromise
- Regular security audits of CNI configuration

### Risk: Performance Impact

**Severity:** LOW | **Likelihood:** Low

**Mitigation:**
- Monitor latency: alert if >10% increase
- Optimize policy rules (specificity over complexity)
- Use label selectors (faster than CIDR matching)

---

## Related Decisions

- **ADR-001:** Dedicated Trigger.dev per team (enables this isolation strategy)
- **ADR-003:** Team-scoped Vault (complements network isolation with secret isolation)
- **ADR-004:** Prometheus federation (monitoring strategy for isolated networks)

---

## References

- Kubernetes Network Policies: https://kubernetes.io/docs/concepts/services-networking/network-policies/
- Cilium Documentation: https://docs.cilica.io/
- AWS Security Groups: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html
- Container Network Namespace: https://man7.org/linux/man-pages/man7/namespaces.7.html

---

**Approval:** System Architect, Security Review
**Implementation Owner:** Infrastructure/DevOps Team
**Timeline:** Phase 5 (Weeks 1-4)
