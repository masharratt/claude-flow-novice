# Mini-Models: MDAP Paper Summary

**Source:** [Solving a Million-Step LLM Task with Zero Errors](https://arxiv.org/pdf/2511.09030) (Meyerson et al., 2025)

---

## Core Insight

Large LLMs fail at long sequential tasks due to error compounding. A 1% per-step error rate over 1000 steps = ~0% success. The solution is **extreme decomposition + voting + red-flagging**, not bigger models.

---

## Key Framework: MDAP (Massively Decomposed Agentic Processes)

### Three Core Components

1. **Extreme Decomposition** - Break tasks to single-step micro-agents
2. **Error Correction** - Voting among parallel micro-agents
3. **Red-Flagging** - Discard suspicious outputs (long responses, misformatting)

### Concrete Implementation: MAKER

- **M**aximal **A**gentic decomposition
- First-to-ahead-by-**k** **E**rror correction
- **R**ed-flagging

---

## Proof of Concept

**Task:** Towers of Hanoi with 20 discs (~1,048,575 moves)

**Result:** Zero errors over ~1 million steps using gpt-4.1-mini

**Cost scaling:** Θ(s ln s) for s steps - tractable even at massive scale

---

## Key Findings

| Finding | Implication |
|---------|-------------|
| Error rates stable as task size grows | Scaling works |
| Smaller models match larger ones in micro-agent regime | Cost optimization possible |
| Per-step success p > 0.5 sufficient with enough k | Don't need perfection |
| Red-flagging raises effective p | Detect errors before propagation |

---

## Translation to Coding

### Mapping MDAP → Code Factory

| MDAP Concept | Coding Equivalent |
|--------------|-------------------|
| Micro-step | Single-file diff |
| Voting | Test pass/fail |
| Red-flagging | Diff size limits, syntax check |
| Context | AST-extracted snippets |

### Architecture

```
1. Planner (strong model, 1 call)
   ↓ subtask list + DAG
2. Scheduler (topological sort)
   ↓ parallel batches
3. Micro-agents (cheap model per subtask)
   ↓ patches
4. Verification (tests + linters)
   ↓ pass/fail
5. Global checkpoint (full test suite)
```

---

## Cost Optimization Rules

1. **Use small, cheap models** - Micro-tasks are pattern-based
2. **Minimal context** - Only relevant function/region
3. **Tests as voters** - Cheaper than multiple LLM calls
4. **Tiered escalation** - 90%+ stays on cheap tier
5. **Caching** - Reuse parsed ASTs, project summaries

---

## Speed Optimization Rules

1. **Parallel micro-steps** - Independent tasks run simultaneously
2. **Adaptive k** - k=1 for simple, higher k for critical
3. **First-ahead-by-k voting** - Stop early when winner clear
4. **Shallow pipeline** - 2-3 LLM layers max
5. **Selective tests** - Only impacted, not full suite

---

## Limitations

- Assumes task can be decomposed (not always trivial)
- Assumes error independence (correlated errors undermine voting)
- Decomposition itself costs effort
- Generalizing beyond algorithmic tasks remains open
- Automatic decomposition discovery is unsolved

---

## Application to CFN Loop

This framework transforms CFN Loop's agent coordination:

**Before:** Single strong agent → long task → error accumulation

**After:** Decomposer → many cheap micro-agents → test voting → aggregated result

The MDAP approach is especially powerful combined with trigger.dev's job queuing for parallel execution and webhook-based result collection.

---

## Quick Reference

```typescript
// MDAP in one function
async function mdap(task: string): Promise<Result> {
  const subtasks = decompose(task);           // 1. Break down
  const batches = topologicalSort(subtasks);  // 2. Order by deps

  for (const batch of batches) {
    const results = await Promise.all(        // 3. Parallel exec
      batch.map(t => microAgent(t))
    );

    for (const r of results) {
      if (redFlag(r)) r = retry(r);           // 4. Red-flag check
      if (!testPass(r)) r = escalate(r);      // 5. Test as voter
    }
  }

  return aggregate(results);                   // 6. Combine
}
```

---

**Last Updated:** 2024-11-21
