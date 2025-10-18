# CFN Loop Documentation Wiki

**Version:** 1.5.22
**Last Updated:** 2025-10-02
**Compatible With:** Claude Flow Novice v1.5.22+

## Welcome to the CFN Loop Wiki

The **CFN (Claude Flow Novice) Loop** is a self-correcting development loop that ensures high-quality deliverables through automated validation, consensus verification, and Byzantine fault tolerance.

---

## Quick Navigation

### Core Documentation
- **[CFN Loop Overview](CFN-Loop-Overview.md)** - Architecture, benefits, and use cases
- **[Getting Started](Getting-Started.md)** - Installation and first CFN loop execution
- **[Confidence Scores](Confidence-Scores.md)** - Detailed scoring system and thresholds

### Implementation Guides
- **[Agent Coordination](Agent-Coordination.md)** - Swarm initialization and memory sharing
- **[Agent Profiles](Agent-Profiles.md)** - Agent configuration and provider routing
- **[Provider Routing](Provider-Routing.md)** - Tiered provider routing for cost optimization
- **[Security](Security.md)** - CVE fixes and security best practices
- **[Troubleshooting](Troubleshooting.md)** - Common issues and solutions

### Reference
- **[API Reference](API-Reference.md)** - Complete API documentation and examples
- **[Slash Commands](Slash-Commands.md)** - Quick command reference
- **[Cost Optimization](Cost-Optimization.md)** - Cost reduction strategies

---

## Key Features

### 🔄 Self-Correcting Development
- **3 nested validation loops** (Initialization → Execution → Consensus)
- **Automatic retry** with feedback injection (max 10 rounds)
- **Byzantine consensus voting** across validator agents

### 📊 Confidence-Based Gating
- **Self-validation threshold:** 75% minimum confidence
- **Consensus threshold:** 90% agreement + 90% average confidence
- **Multi-dimensional validation:** tests, coverage, security, performance

### 🛡️ Security & Performance
- **Input validation** (CVE-CFN-2025-001 fixed)
- **Prompt injection protection** (CVE-CFN-2025-002 fixed)
- **Memory leak prevention** (CVE-CFN-2025-003 fixed)
- **Parallel confidence collection** (20x speedup for large swarms)

### 🧠 Memory Coordination
- **SwarmMemory** for cross-agent learning
- **Pattern recognition** and error avoidance
- **Structured namespacing** for task isolation

---

## Quick Start

### Installation
```bash
npm install -g claude-flow-novice
```

### First CFN Loop
```bash
# Using slash command
/cfn-loop "Implement JWT authentication"

# Using npx
npx claude-flow-novice cfn-loop "Build REST API endpoint"
```

### Manual Execution
```javascript
[Single Message]:
  // Step 1: Initialize swarm (MANDATORY for multi-agent tasks)
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 3,
    strategy: "balanced"
  })

  // Step 2: Spawn agents
  Task("Backend Dev", "Implement feature", "backend-dev")
  Task("Tester", "Write tests", "tester")
  Task("Reviewer", "Review code", "reviewer")
```

---

## System Architecture

```
┌─────────────────────────────────────────┐
│  LOOP 1: Swarm Initialization           │
│  (Topology setup, memory coordination)  │
└─────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────┐
│  LOOP 2: Execution Loop                 │
│  • Primary agents (3-20)                │
│  • File edits + post-edit hooks         │
│  • Self-validation (75% threshold)      │
│  • Max 10 retries with feedback         │
└─────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────┐
│  LOOP 3: Consensus Verification         │
│  • Validator swarm (2-4)                │
│  • Byzantine voting                     │
│  • 90% agreement threshold              │
│  • Max 10 rounds with feedback          │
└─────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────┐
│  EXIT: Next Steps Guidance              │
│  • Summary of completed work            │
│  • Validation results                   │
│  • Identified issues                    │
│  • Recommended next steps               │
└─────────────────────────────────────────┘
```

---

## Agent Types

| Type | Role | Use Cases |
|------|------|-----------|
| `coder` | General implementation | Feature development, bug fixes |
| `tester` | Test writing | Unit tests, integration tests |
| `reviewer` | Code review | Quality, architecture |
| `security-specialist` | Security audit | Auth, encryption, vulnerabilities |
| `system-architect` | Architecture design | System design, scalability |
| `backend-dev` | Backend implementation | APIs, databases |
| `frontend-dev` | Frontend implementation | UI, client logic |
| `devops-engineer` | Infrastructure | Docker, K8s, CI/CD |
| `perf-analyzer` | Performance | Profiling, optimization |

---

## Version Information

**Current Version:** 1.5.22

**Recent Changes:**
- ✅ Fixed CVE-CFN-2025-001: Input validation for iteration limits
- ✅ Fixed CVE-CFN-2025-002: Prompt injection sanitization
- ✅ Fixed CVE-CFN-2025-003: Memory leak prevention with LRU cache
- ✅ Parallel confidence collection (20x speedup)
- ✅ Circuit breaker for infinite loop prevention
- ✅ Enhanced post-edit pipeline with TDD support

---

## Support

- **GitHub Issues:** [Report bugs or request features](https://github.com/masharratt/claude-flow-novice/issues)
- **Documentation:** [Main README](../README.md)
- **Examples:** See [examples/](../examples/) directory

---

## Contributing

We welcome contributions! Please see:
- [Troubleshooting Guide](Troubleshooting.md) for common issues
- [API Reference](API-Reference.md) for implementation details
- [Security Guide](Security.md) for security best practices

---

**License:** MIT
**Author:** Claude Flow Novice Team
