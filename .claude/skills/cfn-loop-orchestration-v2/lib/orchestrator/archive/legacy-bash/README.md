# Legacy Bash Scripts (Deprecated 2025-11-20)

These shell scripts were replaced with TypeScript implementations in v3.1.0.

## Migration Mapping

| Legacy Shell Script | TypeScript Replacement | Location |
|---------------------|------------------------|----------|
| orchestrate-wrapper.sh | Direct call to dist/index.js | Coordinator calls TypeScript orchestrator directly |
| orchestrate.sh | src/orchestrate.ts (compiled) | .claude/skills/cfn-loop-orchestration/src/orchestrate.ts |
| orchestrate-enhanced.sh | src/orchestrate.ts (compiled) | .claude/skills/cfn-loop-orchestration/src/orchestrate.ts |
| monitor-execution.sh | Built into orchestrate.ts | Enhanced monitoring integrated into TypeScript orchestrator |
| inject-loop-context.sh | src/helpers/context-injector.ts | .claude/skills/cfn-loop-orchestration/src/helpers/context-injector.ts |

## Coordination Scripts

| Legacy Shell Script | TypeScript Replacement | Location |
|---------------------|------------------------|----------|
| coordination-wait.sh | coordination-wait.ts | src/cli/coordination-wait.ts |
| report-completion.sh | coordination-signal.ts | src/cli/coordination-signal.ts |
| execute-decision.sh | product-owner-decision.ts | .claude/skills/cfn-loop-orchestration/src/helpers/product-owner-decision.ts |

## Reason for Deprecation

TypeScript provides:
- **Type safety** - Catch errors at compile time instead of runtime
- **Better error handling** - Structured error types and stack traces
- **No shell injection vulnerabilities** - No string interpolation risks
- **Consistent execution environment** - No bash vs sh incompatibilities
- **Better testing capabilities** - Unit tests with Jest
- **IDE support** - Autocomplete, refactoring, jump-to-definition
- **Easier maintenance** - Modular code with clear dependencies

## Breaking Changes in v3.1.0

### Build Requirement Now Mandatory

**Before (v3.0.x):**
```bash
# Coordinator had fallback to shell scripts
if [ -f dist/index.js ]; then
  node dist/index.js
else
  bash orchestrate-wrapper.sh  # FALLBACK
fi
```

**After (v3.1.0):**
```bash
# TypeScript-only execution
if [ ! -f ".claude/skills/cfn-loop-orchestration/dist/index.js" ]; then
  echo "❌ ERROR: TypeScript orchestrator not built"
  echo "Run: cd .claude/skills/cfn-loop-orchestration && npm run build"
  exit 1
fi

node .claude/skills/cfn-loop-orchestration/dist/index.js \
  --task-id "$TASK_ID" \
  --mode "$MODE" \
  --loop3-agents "$LOOP3_AGENTS" \
  --loop2-agents "$LOOP2_AGENTS" \
  --product-owner "$PRODUCT_OWNER" \
  --max-iterations "$MAX_ITERATIONS"
```

### Coordination Commands Changed

**Before (v3.0.x):**
```bash
# Shell script execution from TypeScript
execSync(`bash ${coordinationScript} wait "swarm:${taskId}:gate-passed"`)

# Agent completion signaling
./.claude/skills/cfn-redis-coordination/report-completion.sh \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.95
```

**After (v3.1.0):**
```typescript
// TypeScript-only coordination
import { coordinationWait } from '../../../src/cli/coordination-wait';
await coordinationWait({
  taskId: this.config.taskId,
  channel: 'gate-passed',
  timeout: 120
});

// TypeScript completion signaling
import { reportCompletion } from '../../../src/cli/coordination-signal';
await reportCompletion({
  taskId: process.env.TASK_ID,
  agentId: process.env.AGENT_ID,
  confidence: 0.95,
  iteration: process.env.ITERATION
});
```

### Product Owner Decision Parsing

**Before (v3.0.x):**
```bash
# Shell script execution
const skillPath = path.join(projectRoot, '.claude/skills/cfn-product-owner-decision/execute-decision.sh');
const decision = execSync(`bash ${skillPath} --task-id ${taskId} --consensus ${consensus} --threshold ${threshold}`);
```

**After (v3.1.0):**
```typescript
// TypeScript module
import { parseProductOwnerDecision } from './helpers/product-owner-decision';
const decision = await parseProductOwnerDecision({
  taskId: this.config.taskId,
  iteration: this.state.iteration,
  loop3PassRate: passRate,
  loop2Consensus: consensus
});
```

## Git History

See commits tagged `bash-to-typescript-migration` for full migration history.

**Migration commit:** v3.1.0 - Complete shell script deprecation (2025-11-20)

## Archived Files

- orchestrate-wrapper.sh (deprecated 2025-11-20)
- orchestrate.sh (deprecated 2025-11-20)
- orchestrate-enhanced.sh (deprecated 2025-11-20)
- monitor-execution.sh (deprecated 2025-11-20)
- inject-loop-context.sh (deprecated 2025-11-20)

**Coordination scripts:**
- .claude/skills/cfn-coordination/coordination-wait.sh (archived)
- .claude/skills/cfn-redis-coordination/report-completion.sh (archived)
- .claude/skills/cfn-product-owner-decision/execute-decision.sh (archived)

## Recovery Instructions

If you need to reference legacy implementations:

```bash
# View archived shell scripts
cat .claude/skills/cfn-loop-orchestration/archive/legacy-bash/orchestrate.sh

# Compare with TypeScript implementation
code .claude/skills/cfn-loop-orchestration/src/orchestrate.ts

# Check git history for migration details
git log --oneline --grep="bash-to-typescript-migration"
```

## Support

For issues with TypeScript migration:
1. Ensure build completed: `cd .claude/skills/cfn-loop-orchestration && npm run build`
2. Check dist/ directory exists: `ls .claude/skills/cfn-loop-orchestration/dist/`
3. Verify TypeScript version: `npx tsc --version` (requires ≥5.0)
4. Review migration guide: `docs/migration/TYPESCRIPT_MIGRATION_HANDOFF.md`

## Related Documentation

- TypeScript Migration Handoff: `planning/docker-migration/TYPESCRIPT_MIGRATION_HANDOFF.md`
- CFN Loop Dependency Diagram: `readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt`
- Spawn Agents Implementation: `.claude/skills/cfn-loop-orchestration/SPAWN_AGENTS_IMPLEMENTATION.md`
