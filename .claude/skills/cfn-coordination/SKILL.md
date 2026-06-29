---
name: cfn-coordination
description: "Agent coordination patterns for task-mode multi-agent workflows (no Redis): chain, broadcast, mesh, consensus collection. Use when planning how to spawn agents, sequence dependencies, or aggregate results in a single message."
version: 1.0.0
tags: [coordination, patterns, task-mode, multi-agent]
status: production
keywords: [chain, broadcast, mesh, consensus, topology, agent-spawn]
triggers: [multi-agent-spawn, coordination-design, dependency-planning]
---

# Skill: cfn-coordination

## Purpose

Patterns for coordinating multiple Task-mode agents within a single main-chat message. Replaces the deprecated Redis pub/sub coordination model.

## Architecture Principle

**Task-mode agents return output directly. No Redis signaling.** Main chat (or a coordinator agent) reads each agent's return value and routes data to dependents. Agents never block on external coordination channels.

Anti-patterns (do not use):
- `redis-cli lpush` / `blpop` between agents
- Pub/sub `swarm:*` channels
- Agents subscribing to feedback queues mid-execution

## Core Patterns

### 1. Chain (sequential dependency: A → B → C)

Each step waits for the prior step's return value. Main chat (or coordinator) feeds output forward.

- Use when later stages need exact output of earlier stages
- Each link must be a separate spawn round; you cannot truly chain inside one message
- For 2-stage chains within one batch, the coordinator agent handles the second stage after reading the first agent's return

### 2. Broadcast (1:N: A → B, C, D)

One agent produces output; multiple agents receive the same input.

- Coordinator reads source agent's return value once, then includes it in each dependent agent's prompt
- All N dependents can spawn in the same batch after the source agent completes

### 3. Mesh (N:1 or N:N: A, B, C → D)

Multiple agents produce output in parallel; one or more downstream agents consume the aggregate.

- Spawn the N producers in a single message
- After all return, coordinator (or main chat) aggregates and spawns the consumer
- For pure parallel work with no consumer, just spawn the batch and read all returns

### 4. Consensus Collection (validators voting)

Multiple validator agents review the same artifact and return confidence scores. Used in Loop 2.

- Spawn validators in a single message with identical artifacts as input
- Aggregate confidence scores (mean, or per-rubric)
- Pass/fail against a threshold (e.g., 0.90 consensus for Loop 2)

## Topology Selection

| Agent count | Topology | Pattern |
|-------------|----------|---------|
| 2-7 | Mesh | Direct spawn, main chat aggregates |
| 8+ | Hierarchical | Coordinator agent orchestrates sub-batches |
| Validators only | Consensus | Parallel spawn, score aggregation |
| Sequential pipeline | Chain | Multi-message, output forwarded |

## Task-Type Cookbook

| Task type | Topology | Typical agents | Dependency shape |
|-----------|----------|----------------|------------------|
| Research | Hierarchical | researcher, code-analyzer, architect | (researcher + analyzer) → architect |
| Security fix | Hierarchical | analyzer, coder, reviewer, validator | analyzer → coder → reviewer → validator |
| Feature | Mesh | analyst, architect, backend, frontend, tester | analyst → architect → (backend \|\| frontend) → tester |
| Optimization | Hierarchical | perf-analyzer, code-analyzer, coder, tester | (perf + code) → coder → tester |

## Agent Prompt Template

```
Task("<agent-role>", `
  <task description>

  Inputs:
  - <data piped in from prior agents, inlined into prompt>

  Deliverables:
  - <files / artifacts / decisions to produce>

  Return format:
  - Final message must include confidence score (0.0-1.0) and list of deliverable paths
`, "<agent-type>")
```

Notes:
- No Redis channels, no blocking waits. Output is the return value.
- Confidence score is required for Loop 2/3 gate checks. See `cfn-loop-orchestration-v2` skill.
- Deliverable paths must be absolute or repo-relative, no glob patterns.

## Responsibilities Split

### Main chat / coordinator
- Pick topology based on task type and agent count
- Spawn agents in batched messages (one batch per dependency level)
- Read return values; forward data between levels
- Aggregate consensus scores for Loop 2 gate

### Individual agents
- Execute scoped task
- Return: deliverable list, confidence score, brief summary
- Never invoke another agent
- Never wait on external signal

## Related Skills

- `cfn-loop-orchestration-v2/`: full Loop 2/3 orchestration, gate checks, Product Owner decisions
- `cfn-agent-lifecycle/`: agent lifecycle (spawn, audit, transcript) and SQLite tracking via `AGENT_LIFECYCLE_DB`. Consolidates the former `cfn-agent-spawning/`.

## History

- 2026-05-13: Created. Consolidates salvaged content from deprecated docs (`coordinator-patterns.md`, `spawn-pattern-examples.md`, `coordinator-feedback-pattern.md`) which described Redis lpush/blpop coordination. Originals archived to `docs/archive/`.
