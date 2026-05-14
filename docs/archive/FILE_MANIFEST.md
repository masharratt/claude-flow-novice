# Code File Manifest

**Last Updated:** 2025-11-26  
**Total Code Files:** 7246  
**Scope:** TypeScript, JavaScript, YAML, Docker, SQL (excluding documentation, tests, node_modules, dist, build)

---

## Directory Structure

### Root Level
- `src/` - Core implementation
- `docker/` - Infrastructure definitions
- `packages/` - NPM workspaces
- `.claude/` - Agent coordination and skills
- `tests/` - Test infrastructure

---

## 1. Trigger.dev Task Implementations

### Location: `src/trigger/` and `packages/*/src/trigger/`

**Trigger.dev v4 Task Definitions:**
- Task entry points (*.ts files)
- Task payloads and result types
- Dependency declarations
- Error handling and retry logic

**Key Files:**
- `docker/trigger-dev/src/trigger/cfn-coordinator.ts`
- `docker/trigger-dev/src/trigger/cfn-implementer-v2.ts`
- `docker/trigger-dev/src/trigger/cfn-implementer.ts`
- `docker/trigger-dev/src/trigger/cfn-orchestrator-v2.ts`
- `docker/trigger-dev/src/trigger/cfn-orchestrator.ts`
- `docker/trigger-dev/src/trigger/cfn-test-runner.ts`
- `docker/trigger-dev/src/trigger/cfn-validator-v2.ts`
- `docker/trigger-dev/src/trigger/cfn-validator.ts`
- `docker/trigger-dev/src/trigger/claude-agent.ts`
- `docker/trigger-dev/src/trigger/hello-world.ts`
- `docker/trigger-dev/src/trigger/index.ts`
- `docker/trigger-dev/src/trigger/parallel-provider-test.ts`
- `docker/trigger-dev/src/trigger/simple-test.ts`
- `docker/trigger-dev/src/trigger/stress-test-real-ai.ts`
- `docker/trigger-dev/src/trigger/stress-test.ts`
- `docker/trigger-dev/src/trigger/test-claude-poc.ts`
- `docker/trigger-dev/src/trigger/test-coordinator.ts`
- `docker/trigger-dev/src/trigger/test-zai-agent.ts`
- `docker/trigger-dev-v4/packages/cli-v3/e2e/fixtures/emit-decorator-metadata/src/trigger/decorators.ts`
- `docker/trigger-dev-v4/packages/cli-v3/e2e/fixtures/esm-only-external/src/trigger/helloWorld.ts`
