# Available Specialized Agents

**Generated:** 2025-11-04
**Source:** `.claude/agents/cfn-dev-team/` (live discovery)
**Total Agents:** 66

## Agent Discovery

Agents are dynamically discovered from `.claude/agents/` folder structure:
- Recursive scanning with glob patterns (`**/*.md`)
- YAML frontmatter parsing for metadata
- In-memory caching after first load
- Coordinators use `agent-loader.ts` for live discovery

## All Available Agents

- `accessibility-advocate-persona`
- `agent-builder`
- `analyst`
- `api-designer-persona`
- `api-documentation`
- `api-gateway-specialist`
- `api-testing-specialist`
- `backend-developer`
- `base-template-generator`
- `cfn-frontend-coordinator`
- `cfn-v3-coordinator`
- `chaos-engineering-specialist`
- `claude-code-expert`
- `code-booster`
- `code-quality-validator`
- `consensus-builder`
- `context-curator`
- `cto-agent`
- `cyclomatic-complexity-reducer`
- `data-engineer`
- `database-architect`
- `devops-engineer`
- `docker-specialist`
- `epic-creator`
- `github-commit-agent`
- `goal-planner`
- `graphql-specialist`
- `interaction-tester`
- `kubernetes-specialist`
- `load-testing-specialist`
- `memory-leak-specialist`
- `mobile-dev`
- `monitoring-specialist`
- `multi-sprint-coordinator`
- `perf-analyzer`
- `performance-benchmarker`
- `planner`
- `playwright-tester`
- `playwright-tester`
- `power-user-persona`
- `product-owner`
- `pseudocode`
- `quality-metrics`
- `react-frontend-engineer`
- `researcher`
- `reviewer`
- `root-cause-analyst`
- `rust-developer`
- `security-specialist`
- `specification-agent`
- `system-architect`
- `tdd-london-unit-swarm`
- `test-agent`
- `test-validation-agent`
- `tester`
- `ui-designer`
- `validation-production-validator`
- `z-ai-specialist`

## Usage

### Spawn Agent
```bash
npx claude-flow-novice agent <agent-name> --task-id <id>
```

### List Agents
```bash
# Count all agents
find .claude/agents -name "*.md" -type f | wc -l

# List all agent names
find .claude/agents -name "*.md" | sed 's|.*/||' | sed 's|\.md$||' | sort
```

## Notes

- **Live Discovery**: System reads from `.claude/agents/` at runtime
- **This File**: Documentation snapshot for reference
- **Add Agents**: Place `.md` files in `.claude/agents/` (auto-discovered)
- **Agent Names**: Must match filename (e.g., `backend-developer.md` → `backend-developer`)
