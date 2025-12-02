# CFN Math MDAP Dogfooding Test - Implementation Plan

## Objective
Test the npm distribution of `claude-flow-novice` by creating a clean project (`cfn-math`) that uses MDAP within Trigger.dev for mathematical problem decomposition. Verify minimal setup requirements and document any blocking issues.

## Success Criteria
1. **Clean Installation**: `npm install claude-flow-novice` works without errors
2. **Minimal Configuration**: Only API keys required (no manual setup)
3. **MDAP Execution**: Successfully decompose and solve math problems via Trigger.dev
4. **Integration Verification**: RuVector, Trigger.dev, and MDAP work together
5. **Documentation**: Clear setup guide for external users

## Test Scope

### In Scope
- Fresh npm install from registry
- Minimal .env configuration (API keys only)
- MDAP math problem decomposition
- Trigger.dev task orchestration
- RuVector integration (if used in MDAP flow)
- Error identification and resolution

### Out of Scope
- Development environment setup (assume Node.js, Docker installed)
- Custom MDAP configuration beyond defaults
- Non-math problem domains
- Performance benchmarking

## Implementation Phases

### Phase 1: Project Setup (Sprint 1)
**Goal**: Create clean test environment with npm package

**Tasks**:
1. Create `/mnt/c/Users/masha/Documents/cfn-math` directory
2. Initialize Node.js project (`npm init -y`)
3. Install `claude-flow-novice` from npm registry
4. Copy minimal .env template (API keys only)
5. Verify package structure and dependencies installed

**Success Metrics**:
- Directory created successfully
- Package installed without errors
- Dependencies resolved (Trigger.dev, RuVector, etc.)
- .env template configured

**Deliverables**:
- `cfn-math/package.json`
- `cfn-math/.env` (API keys configured)
- `cfn-math/README.md` (setup instructions)

---

### Phase 2: MDAP Configuration Verification (Sprint 2)
**Goal**: Verify MDAP is accessible and configured correctly

**Tasks**:
1. Check if `/cfn-loop-trigger` command is available
2. Verify MDAP coordinator task exists in installed package
3. Test Trigger.dev connection (health check)
4. Verify Groq API key configuration
5. Verify Cerebras API key configuration (fallback)
6. Check RuVector initialization (if applicable)

**Success Metrics**:
- MDAP commands discoverable
- Trigger.dev reachable
- API keys validated
- No missing dependencies

**Deliverables**:
- Health check script (`cfn-math/scripts/health-check.sh`)
- Configuration validation log
- Issue tracker (if problems found)

---

### Phase 3: Simple Math Problem Test (Sprint 3)
**Goal**: Execute MDAP decomposition on a basic math problem

**Test Problem**: "Calculate the sum of squares of integers from 1 to 100, then find the prime factorization of the result"

**Tasks**:
1. Create test input file with math problem description
2. Execute `/cfn-loop-trigger` with MDAP mode
3. Monitor Trigger.dev task execution
4. Verify micro-task decomposition occurs
5. Check Groq API usage (primary)
6. Verify Cerebras fallback (if Groq fails)
7. Validate final result correctness

**Success Metrics**:
- Task spawns successfully
- Micro-tasks created and executed
- Groq API called (cost tracking)
- Result mathematically correct
- No errors in execution logs

**Deliverables**:
- Test problem file (`cfn-math/tests/sum-of-squares-factorization.txt`)
- Execution logs (`cfn-math/logs/mdap-test-run-1.log`)
- Results validation script
- Cost analysis (Groq vs Cerebras usage)

---

### Phase 4: Integration Testing (Sprint 4)
**Goal**: Verify all components work together seamlessly

**Test Cases**:
1. **RuVector Integration**: If MDAP uses semantic search for code patterns
2. **Trigger.dev Coordination**: Task spawning, polling, completion
3. **API Fallback**: Force Groq failure, verify Cerebras takes over
4. **Error Handling**: Invalid input, timeout, API key missing
5. **Multi-Step Problems**: Problem requiring sequential micro-tasks

**Tasks**:
1. Run comprehensive integration test suite
2. Test API failover scenarios
3. Verify error messages are user-friendly
4. Check cleanup behavior (no orphaned tasks)
5. Test with 3+ micro-task decomposition

**Success Metrics**:
- All test cases pass
- Failover works automatically
- Errors surfaced clearly
- No resource leaks
- Multi-step decomposition completes

**Deliverables**:
- Integration test suite (`cfn-math/tests/integration/`)
- API fallback test script
- Error handling test cases
- Cleanup verification script

---

### Phase 5: Documentation & Issue Resolution (Sprint 5)
**Goal**: Document setup process and resolve any blocking issues

**Tasks**:
1. Write step-by-step setup guide for external users
2. Document all API key requirements
3. List known issues and workarounds
4. Create troubleshooting guide
5. File GitHub issues for blocking problems
6. Write quickstart example (minimal code)

**Success Metrics**:
- Setup guide is <200 lines
- External user can follow guide without prior knowledge
- All blocking issues documented
- Workarounds provided for known issues
- Quickstart example runs in <5 minutes

**Deliverables**:
- `cfn-math/SETUP_GUIDE.md`
- `cfn-math/TROUBLESHOOTING.md`
- `cfn-math/examples/quickstart-math-problem.md`
- GitHub issues for unresolved blockers
- Summary report: `planning/dogfooding/DOGFOODING_RESULTS.md`

---

## Risk Assessment

### High Risk
- **npm package missing dependencies**: Trigger.dev or RuVector not bundled correctly
- **API key validation**: No clear error if keys invalid
- **Docker requirement**: MDAP might require Docker (not just npm install)

### Medium Risk
- **Trigger.dev setup complexity**: Might need self-hosted setup, not just API keys
- **RuVector initialization**: Database setup might be required
- **Path resolution**: npm global vs local install path issues

### Low Risk
- **Documentation gaps**: Can be fixed quickly
- **Example complexity**: Math problems are well-defined
- **Error messages**: Can improve messaging based on test results

---

## Acceptance Criteria (Overall)

### Must Have
- [ ] `npm install claude-flow-novice` completes successfully
- [ ] MDAP executes math problem decomposition
- [ ] Groq API used as primary (billing confirmed)
- [ ] Cerebras fallback works on Groq failure
- [ ] Results are mathematically correct
- [ ] Setup requires ≤5 API keys

### Should Have
- [ ] Setup guide is <30 minutes for new user
- [ ] RuVector integration verified (if used)
- [ ] Error messages are actionable
- [ ] Cleanup is automatic

### Nice to Have
- [ ] Cost comparison (Groq vs Cerebras)
- [ ] Performance metrics (decomposition time)
- [ ] Multiple example problems

---

## Timeline Estimate

- **Phase 1**: 30 minutes (setup)
- **Phase 2**: 30 minutes (verification)
- **Phase 3**: 45 minutes (basic test)
- **Phase 4**: 60 minutes (integration)
- **Phase 5**: 45 minutes (docs + issues)

**Total**: ~3.5 hours (assumes no major blockers)

---

## Dependencies

### External
- npm registry access
- Groq API account + key
- Cerebras API account + key
- Trigger.dev instance (self-hosted or cloud)
- Docker (if required by MDAP)

### Internal
- `claude-flow-novice` package published to npm
- MDAP coordinator task included in package
- RuVector bundled (if used in MDAP)

---

## Open Questions

1. **Trigger.dev Setup**: Does npm package include Trigger.dev setup, or is external instance required?
2. **RuVector Dependency**: Is RuVector needed for math MDAP, or only for code-related tasks?
3. **Docker Requirement**: Can MDAP run without Docker, or is container orchestration required?
4. **API Key Storage**: Should .env be in cfn-math root, or in a specific subdirectory?
5. **Test Problem Complexity**: Should we test simple (1 micro-task) or complex (5+ micro-tasks) first?

---

## Next Steps

1. Create epic config JSON (`planning/dogfooding/cfn-math-dogfooding-epic.json`)
2. Execute Phase 1: Create cfn-math directory and install npm package
3. Document initial setup experience (blockers, surprises, ease of use)
4. Iterate on Phase 2-5 based on findings
