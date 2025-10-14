# Available Specialized Agents

**Hybrid Routing System - Dynamic Agent Discovery**

## Architecture

**Source of Truth**: `.claude/agents/` folder (50+ agent .md files)
**Live Discovery**: `HybridWorkerSpawner.loadAgentDefinitions()` method
**This File**: Documentation snapshot for human reference

**When coordinators spawn agents**:
- Load agents dynamically from `.claude/agents/` folder (NOT from this file)
- Parse YAML frontmatter from each .md file
- Extract keywords, system prompts, categories
- In-memory cache for performance
- Select agents via keyword matching or coordinator override

**To regenerate this file**: `/list-agents-rebuild`

---

## Overview

- **Total Discovered**: 72 agent files in `.claude/agents/` folder
- **Successfully Loaded**: 58 agents (14 skipped due to missing YAML frontmatter)
- **Unique Agent Types**: 50 specialized agents
- **Categories**: 16 functional categories

## Discovery Statistics

```
🔍 Discovered 72 agent files in .claude/agents/
✅ Loaded 58 agents (14 skipped)
📋 50 unique agent types across 16 categories
```

## Agents by Category

### 📁 ANALYSIS (3 agents)

| Agent Type | Keywords |
|------------|----------|
| **code-analyzer** | analyze, review, audit, assess, evaluate, inspect, scan, check quality, find issues, bottlenecks, vulnerabilities, technical debt, performance analysis, security review, code metrics, implementation |
| **code-quality-validator** | code analysis, quality analysis, technical debt, code smells, complexity analysis, architecture conformance, anti-pattern detection, refactoring analysis, dependency analysis, validation, review |
| **perf-analyzer** | performance analysis, bottleneck detection, profiling, optimization, memory analysis, load testing, query optimization, runtime analysis, performance tuning |

---

### 📁 ARCHITECTURE (1 agent)

| Agent Type | Keywords |
|------------|----------|
| **system-architect** | enterprise architecture, system design, technical leadership, distributed systems, microservices, event-driven, scalability, cloud architecture, architectural patterns, technical strategy, adr, quality attributes, performance architecture, security design, infrastructure planning, technology evaluation |

---

### 📁 CFN-LOOP (1 agent)

| Agent Type | Keywords |
|------------|----------|
| **product-owner** | goap, product owner, scope enforcement, autonomous decision, cfn loop, consensus validation, trade-off analysis, a* search, decision authority |

---

### 📁 CONSENSUS (8 agents)

| Agent Type | Keywords |
|------------|----------|
| **byzantine-coordinator** | pbft, byzantine fault tolerance, consensus, malicious detection, cryptographic verification, view change, threshold signatures, secure coordination, distributed consensus |
| **consensus-builder** | consensus, distributed decision-making, byzantine tolerance, raft, pbft, voting, quorum, agent coordination, agreement protocols, swarm consensus |
| **crdt-synchronizer** | *(No keywords available)* |
| **gossip-coordinator** | *(No keywords available)* |
| **performance-benchmarker** | performance benchmarking, throughput measurement, latency analysis, resource monitoring, comparative analysis, adaptive tuning, consensus optimization, protocol benchmarking, bottleneck identification, performance testing |
| **quorum-manager** | *(No keywords available)* |
| **raft-manager** | *(No keywords available)* |
| **security-manager** | consensus security, threshold cryptography, zero-knowledge proof, byzantine fault tolerance, sybil attack, eclipse attack, distributed key generation, key rotation, attack detection, cryptographic signatures, secure consensus, blockchain security, distributed systems security, penetration testing |

---

### 📁 CORE-AGENTS (11 agents)

| Agent Type | Keywords |
|------------|----------|
| **analyst** | analyze, review, audit, assess, evaluate, inspect, scan, check quality, find issues, bottlenecks, vulnerabilities, technical debt, performance analysis, security review, code metrics |
| **architect** | design, architect, structure, plan, infrastructure, schema, api design, scalability, microservices, system design, technical decisions, cloud architecture, integration, performance, technology evaluation, architectural patterns |
| **base-template-generator** | template, boilerplate, scaffold, generate, starter, skeleton, base structure, foundational code, setup, initialization, configuration template, component template, api template, model template, test template, documentation template, project setup, module template, starter kit, base configuration |
| **coder** | implement, code, build, develop, create function, write class, refactor, optimize, fix, integrate, api, component, database, algorithm, security, authentication, validation, error handling, feature development, bug fix, performance, technical debt |
| **coordinator** | general coordination, fallback coordinator, basic orchestration, simple delegation, project planning, task breakdown, dependency management, progress tracking, resource allocation |
| **coordinator-hybrid** | *(No keywords available)* |
| **planner** | general planning, task breakdown, fallback planner, basic coordination |
| **researcher** | general research, investigate, explore, broad analysis, technology comparison, fallback researcher |
| **reviewer** | general review, fallback reviewer, basic code review, simple quality check |
| **task-coordinator** | task coordination, multi-agent orchestration, workflow management, agent spawning, swarm coordination, dependency management, progress tracking, consensus validation, task decomposition, specialist selection |
| **tester** | test, validate, tdd, unit test, integration test, e2e test, coverage, test suite, quality assurance, qa, bug validation, test-driven development, test strategy, test automation, regression test, acceptance test |

---

### 📁 DEVELOPMENT (1 agent)

| Agent Type | Keywords |
|------------|----------|
| **backend-dev** | api, rest, graphql, endpoint, route, controller, middleware, backend, server, express, authentication, validation, http |

---

### 📁 DEVOPS (1 agent)

| Agent Type | Keywords |
|------------|----------|
| **devops-engineer** | ci/cd, pipeline, deploy, infrastructure, docker, kubernetes, terraform, iac, automation, devops, monitoring, observability, gitops, container, orchestration, cloud, aws, azure, gcp, security automation, platform engineering, sre |

---

### 📁 DOCUMENTATION (1 agent)

| Agent Type | Keywords |
|------------|----------|
| **api-docs** | api documentation, openapi, swagger, rest api, endpoints, api spec, schema, authentication docs, api reference, request/response, error codes, security schemes, api versioning, interactive docs, swagger ui |

---

### 📁 FRONTEND (3 agents)

| Agent Type | Keywords |
|------------|----------|
| **react-frontend-engineer** | *(No keywords available)* |
| **state-architect** | *(No keywords available)* |
| **ui-designer** | *(No keywords available)* |

---

### 📁 GOAL (1 agent)

| Agent Type | Keywords |
|------------|----------|
| **goal-planner** | goap, planning, a* search, state space, goal decomposition, adaptive replanning, action sequencing, strategic planning |

---

### 📁 PLANNING-TEAM (3 agents)

| Agent Type | Keywords |
|------------|----------|
| **api-designer-persona** | *(No keywords available)* |
| **security-architect-persona** | *(No keywords available)* |
| **system-architect-persona** | *(No keywords available)* |

---

### 📁 SECURITY (1 agent)

| Agent Type | Keywords |
|------------|----------|
| **security-specialist** | security audit, vulnerability, threat model, penetration test, encryption, authentication, authorization, cve, owasp, zero trust, cryptography, incident response, compliance, gdpr, hipaa, pci dss, siem, waf, edr, dlp, nist, iso 27001 |

---

### 📁 SPARC (4 agents)

| Agent Type | Keywords |
|------------|----------|
| **architecture** | sparc, architecture, system design, components, scalability, infrastructure, microservices, api, database, deployment, tech stack, design patterns |
| **pseudocode** | sparc, pseudocode, algorithm, logic flow, data structures, complexity analysis, o(n), big-o, sorting, searching, optimization, computational thinking |
| **refinement** | sparc, refinement, tdd, testing, refactoring, optimization, performance, quality, code coverage, unit tests, integration tests, debugging |
| **specification** | sparc, specification, requirements, functional specs, acceptance criteria, user stories, use cases, constraints, system behavior |

---

### 📁 SPECIALIZED (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **code-booster** | performance optimization, code refactoring, efficiency, caching, parallelization, lazy loading, memoization, algorithmic improvement, resource management, wasm |
| **mobile-dev** | react native, mobile, ios, android, cross-platform, mobile app, expo, native module, mobile ui, touchableopacity, flatlist, navigation |

---

### 📁 SWARM (5 agents)

| Agent Type | Keywords |
|------------|----------|
| **adaptive-coordinator** | *(No keywords available)* |
| **adaptive-coordinator-enhanced** | adaptive coordination, machine learning, predictive analytics, topology optimization, swarm intelligence, real-time optimization, self-organizing |
| **blocking-coordinator-example** | coordinator, blocking, signal ack, cfn loop, timeout, agent lifecycle, swarm coordination, hmac, redis pub/sub |
| **hierarchical-coordinator** | *(No keywords available)* |
| **mesh-coordinator** | mesh coordination, distributed systems, peer-to-peer, fault tolerance, consensus |

---

### 📁 TESTING (4 agents)

| Agent Type | Keywords |
|------------|----------|
| **interaction-tester** | interaction testing, integration tests, e2e, ui testing, accessibility, user flows, functional testing, cross-browser |
| **playwright-tester** | playwright, e2e testing, browser automation, web testing, ui automation, test frameworks, screenshot testing, accessibility testing |
| **production-validator** | production validation, deployment ready, real implementation, no mocks, real database, real api, infrastructure testing, production testing, deployment verification, end-to-end validation, implementation completeness |
| **tdd-london-swarm** | tdd london school, mock-driven, outside-in tdd, behavior verification, interaction testing, mock-first, collaboration testing, behavior testing, mockist approach, test doubles, interaction verification, contract testing |

---

## Usage

### List All Agents (Flat View)

```bash
node src/cli/hybrid-routing/spawn-workers.js --list-agents
```

### List Agents by Category

```bash
node src/cli/hybrid-routing/spawn-workers.js --agents-by-category
```

### Use Specific Agent Types (Coordinator Override)

```bash
# Single agent type
node src/cli/hybrid-routing/spawn-workers.js "Task" --agents=coder

# Multiple agent types
node src/cli/hybrid-routing/spawn-workers.js "Task" \
  --max-agents=3 \
  --agents=architect,coder,tester
```

### Automatic Agent Selection (Keyword Matching)

```bash
# System automatically selects best agents based on task keywords
node src/cli/hybrid-routing/spawn-workers.js "Build authentication system" --max-agents=5

# Example: "authentication" keyword would match:
#   - security-specialist (keywords: authentication, security audit, ...)
#   - coder (keywords: implement, authentication, ...)
#   - tester (keywords: test, tdd, ...)
```

---

## Technical Implementation

### Discovery Process

1. **Recursive scanning** of `.claude/agents/` folder
2. **YAML frontmatter parsing** from each `.md` file
3. **Agent type extraction** from `name:` field
4. **Keyword extraction** from `description:` field
5. **Category preservation** from directory structure
6. **In-memory caching** for performance
7. **Lazy loading** on first access

### Agent Definition Format

Each agent file follows this structure:

```markdown
---
name: agent-type-name
description: |
  Agent description with embedded keywords.
  Keywords - keyword1, keyword2, keyword3
---

# Agent system prompt and capabilities
...
```

### Whitelist/Blacklist Support

```javascript
// Programmatic usage
const spawner = new HybridWorkerSpawner({
  agentWhitelist: ['coder', 'architect', 'tester'], // Only allow these
  agentBlacklist: ['deprecated-agent']              // Block these
});
```

---

## Notes

- **8 agents with missing keywords**: Some agents (crdt-synchronizer, gossip-coordinator, quorum-manager, raft-manager, coordinator-hybrid, react-frontend-engineer, state-architect, ui-designer, api-designer-persona, security-architect-persona, system-architect-persona, adaptive-coordinator) are missing keyword definitions. These can still be used via coordinator override mode but won't be selected by automatic keyword matching.

- **14 skipped files**: Documentation files without proper YAML frontmatter (CLAUDE.md, README*.md, *-GUIDELINES.md, etc.) are automatically skipped during discovery.

- **Category structure**: Categories are inferred from directory structure (e.g., `.claude/agents/core-agents/coder.md` → category: "core-agents").

---

**Generated**: 2025-10-13
**Source**: `node src/cli/hybrid-routing/spawn-workers.js --agents-by-category`
**Implementation**: Dynamic discovery with recursive scanning, in-memory caching, and lazy loading
