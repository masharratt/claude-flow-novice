# Sprint 1.5 MCP Migration - Quick Reference

## Agent Audit Results

**Total:** 54 agent files | **Affected:** 11 agents | **Clean:** 43 agents

### Priority Order

```
HIGH RISK (13h)
1. hierarchical-coordinator.md    36 MCP refs  4h  ⚠️ CRITICAL
2. test-coordinator.md             34 MCP refs  4h  ⚠️ CRITICAL  
3. adaptive-coordinator.md         20 MCP refs  5h  ⚠️ CRITICAL

MEDIUM RISK (6.5h)
4. adaptive-coordinator-enhanced   11 MCP refs  3h
5. security-specialist.md           7 MCP refs  2h
6. product-owner.md                 4 MCP refs  1.5h

LOW RISK (3.5h)
7-11. Documentation & Examples      23 MCP refs  3.5h
```

## Critical CLI Replacements

### Agent Spawning (MOST IMPORTANT!)
```markdown
OLD: mcp__claude-flow__agent_spawn coder --capabilities="code"
NEW: Use Task tool with role="coder", instructions="..."
```

### Swarm Init
```bash
OLD: mcp__claude-flow__swarm_init hierarchical --maxAgents=10
NEW: node tests/manual/test-swarm-direct.js "Objective" --executor --max-agents 10
```

### Memory Operations
```bash
OLD: mcp__claude-flow__memory_usage store "key" "value" --namespace=swarm
NEW: /sqlite-memory store --key "swarm/key" --data '{"value":"..."}' --level project
```

### Performance Monitoring
```bash
OLD: mcp__claude-flow__performance_report --format=detailed
NEW: /performance analyze --component swarm --timeframe 24h
```

## Timeline

**Week 1:** Docs + High-priority coordinators (13h)
**Week 2:** Medium/Low priority agents (10h)
**Week 3:** Testing + Deployment
**Sprint 1.6:** ML pipeline architecture

## Special Notes

⚠️ **ML Tools:** Defer neural_* tools to Sprint 1.6 (needs architecture)
⚠️ **Backwards Compat:** Implement shim for 1 release cycle
⚠️ **Hooks:** Update all lifecycle hooks to CLI/Bash

## Success Criteria

- [ ] Zero MCP references in agent profiles
- [ ] Agent spawn success rate >95%
- [ ] <5% performance degradation
- [ ] Comprehensive CLI documentation
- [ ] Rollback plan tested

---
**Confidence:** 0.92 | **Total Effort:** 23h | **Agent:** coder-1
