# Coordinator Spawn Patterns (Task-Tool Mode)

**This file contains coordinator spawn templates when cost-savings mode is DISABLED.**

---

## When to Use Task-Tool Mode

Task-tool mode is used when:
- Cost-savings mode is explicitly disabled (`/cost-savings-off`)
- Maximum coordinator intelligence is required
- All agents use main provider (Claude Max or z.ai)
- Direct Task tool orchestration preferred over CLI spawning

---

## coordinator-hybrid (PRIMARY)

```javascript
Task("coordinator-hybrid",
  `Coordinate task: [description]

   Spawn workers via Task tool:
   - Task("analyst", "Analyze requirements", "analyst")
   - Task("coder", "Implement solution", "coder")
   - Task("tester", "Validate tests", "tester")

   Coordinate via Redis pub/sub on swarm:task channel`,
  "coordinator"
)
```

---

## cfn-coordinator-mvp

```javascript
Task("cfn-coordinator-mvp",
  `Execute MVP phase: [description]

   MVP Parameters:
   - Gate threshold: 0.70
   - Consensus: 0.80
   - Validators: 2
   - Max iterations: 5

   Spawn 2-3 workers via Task tool`,
  "coordinator"
)
```

---

## cfn-coordinator-standard

```javascript
Task("cfn-coordinator-standard",
  `Execute standard phase: [description]

   Standard Parameters:
   - Gate threshold: 0.75
   - Consensus: 0.90
   - Validators: 4
   - Max iterations: 10

   Spawn 3-5 workers via Task tool`,
  "coordinator"
)
```

---

## cfn-coordinator-enterprise

```javascript
Task("cfn-coordinator-enterprise",
  `Execute enterprise phase: [description]

   Enterprise Parameters:
   - Gate threshold: 0.75
   - Consensus: 0.95
   - Validators: 4
   - Max iterations: 15
   - Loop 0.5: Planning consensus

   Spawn 5-8 workers via Task tool`,
  "coordinator"
)
```

---

## adaptive-coordinator

```javascript
Task("adaptive-coordinator",
  `Coordinate with adaptive topology:

   Topology: mesh (2-7) | hierarchical (8+)
   Dynamic switching based on agent count

   Spawn workers via Task tool`,
  "coordinator"
)
```

---

## Cost Structure (Task-Tool Mode)

- All agents use main provider (Claude Max or z.ai based on `/switch-api`)
- Higher cost but maximum coordinator intelligence
- Direct Task tool orchestration
- No CLI spawning overhead

---

## CLI Mode vs Task-Tool Mode

| Aspect | CLI Mode (Cost-Savings ON) | Task-Tool Mode (Cost-Savings OFF) |
|--------|---------------------------|----------------------------------|
| **Coordinator Cost** | $0 (Claude Max subscription) | $0-2/1M tokens (provider-based) |
| **Worker Cost** | $0.10-2/1M (z.ai) | Same as coordinator provider |
| **Spawning** | CLI with `--agents` flag | Task tool with agent type |
| **Intelligence** | Coordinator layer + workers | All agents same intelligence |
| **Use Case** | Production, cost optimization | Development, maximum quality |
