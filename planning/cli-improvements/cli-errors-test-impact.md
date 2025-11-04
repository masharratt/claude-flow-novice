# CLI Mode Errors - Test Suite Impact Analysis

## Status Check: Already Fixed Issues

### 1. Missing `store-context.sh`
- **Status**: ❌ NOT FIXED
- Evidence: 
  - Script still not found in repo
  - Referenced in orchestration scripts
  - No implementation exists

### 2. `npx claude-flow-novice` Availability
- **Status**: ❌ NEEDS RESOLUTION
- Evidence:
  - No CLI binary discovered
  - No npm package installation process verified

### 3. WSL2 Line Ending Issues
- **Status**: ⚠️ PARTIALLY MITIGATED
- Evidence:
  - No comprehensive line ending strategy implemented
  - Requires explicit `dos2unix` for scripts

## Test Gap Analysis

### Test Coverage Needed

1. **CLI Binary Validation**
   - Test that `npx claude-flow-novice` command exists after initialization
   - Validate binary can spawn agents
   - Check version compatibility

2. **Orchestrator Environment Detection**
   - Verify orchestrator can detect missing CLI infrastructure
   - Test fallback mechanism to Task mode
   - Validate cost-optimization pathway

3. **Redis Context Storage**
   - Test `store-context.sh` implementation
   - Validate context retrieval from Redis
   - Check error handling for missing context

4. **WSL2 Compatibility**
   - Script executability test
   - Line ending conversion verification
   - Path handling in Windows/Linux hybrid environments

## Recommendations: Test Improvements

### Immediate Priorities (High Impact)

1. Create E2E test script:
```bash
#!/bin/bash
# tests/cfn-v3/test-cli-infrastructure.sh

# Test 1: CLI Binary Availability
npx claude-flow-novice --version || exit 1

# Test 2: Agent Spawning Capability
npx claude-flow-novice agent test-agent \
  --task-id "test-infra-123" \
  --context "CLI infrastructure test" || exit 1

# Test 3: Redis Context Storage
task_id=$(uuidgen)
./.claude/skills/cfn-redis-coordination/store-context.sh "$task_id" "test context"
redis-cli HGET "cfn_loop:task:${task_id}:context" "task_description" | grep "test context" || exit 1
```

2. Modify `tests/cfn-v3/test-e2e-cfn-loop.sh` to include:
   - Explicit CLI mode infrastructure checks
   - Fallback mode validation
   - Cost optimization pathway testing

### Secondary Priorities

1. Add script validation hook:
```bash
#!/bin/bash
# .claude/hooks/validate-cli-scripts.sh
find .claude/skills -type f -name "*.sh" | while read -r script; do
  dos2unix "$script"
  chmod +x "$script"
  shellcheck "$script"
done
```

## Priority Matrix

| Priority | Area | Test Focus | Estimated Effort |
|----------|------|------------|-----------------|
| High | CLI Binary | Existence, Spawning | 2-4 hours |
| High | Orchestrator Detection | Environment Fallback | 3-5 hours |
| Medium | Redis Context | Storage, Retrieval | 2-3 hours |
| Low | WSL2 Compatibility | Line Endings, Paths | 1-2 hours |

## Confidence Assessment

**Overall Confidence**: 0.82 
- Comprehensive error report
- Clear infrastructure gaps identified
- Practical test recommendations
- Minimal assumptions about future changes

**Confidence Breakdown**:
- Issue Understanding: 0.95
- Test Coverage Strategy: 0.80
- Implementation Feasibility: 0.75

## Next Actions

1. Validate current project state
2. Implement recommended test scripts
3. Run comprehensive infrastructure test
4. Document findings in project test documentation
