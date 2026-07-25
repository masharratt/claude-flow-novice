# TypeScript Migration FAQ

**Version:** v2.16.0+
**Last Updated:** 2025-11-20
**Audience:** All Team Members

## Table of Contents

1. [General Questions](#general-questions)
2. [Technical Questions](#technical-questions)
3. [Development Workflow](#development-workflow)
4. [Troubleshooting](#troubleshooting)
5. [Timeline and Rollout](#timeline-and-rollout)
6. [Team and Training](#team-and-training)

---

## General Questions

### Why TypeScript instead of bash?

**Short Answer:** Type safety, better error handling, easier testing, and maintainability.

**Detailed Answer:**

1. **Type Safety**
   - Bash: No type checking, runtime errors common
   - TypeScript: Compile-time type checking, catches errors before execution
   - Example:
     ```bash
     # Bash - no type checking
     TIMEOUT="300"
     TIMEOUT="not a number"  # No error until runtime
     ```
     ```typescript
     // TypeScript - compile-time error
     let timeout: number = 300;
     timeout = "not a number";  // ERROR: Type 'string' not assignable to 'number'
     ```

2. **Better Error Handling**
   - Bash: Silent failures, difficult to debug
   - TypeScript: Structured errors with stack traces
   - Example:
     ```bash
     # Bash - error handling verbose
     if ! redis-cli ping > /dev/null 2>&1; then
       echo "ERROR: Redis unavailable" >&2
       exit 1
     fi
     ```
     ```typescript
     // TypeScript - clean error handling
     try {
       await redis.ping();
     } catch (error) {
       throw new RedisConnectionError('Redis unavailable', { cause: error });
     }
     ```

3. **Easier Testing**
   - Bash: Limited testing frameworks, hard to mock
   - TypeScript: Jest, comprehensive testing, easy mocking
   - Test coverage: 92.8% (TypeScript) vs ~30% (bash)

4. **Maintainability**
   - Bash: Hard to refactor, unclear interfaces
   - TypeScript: Easy refactoring, clear contracts
   - IDE support: Autocomplete, inline docs, jump-to-definition

5. **Team Productivity**
   - Bash: Steep learning curve, cryptic syntax
   - TypeScript: Familiar to most developers, excellent tooling

### Is TypeScript slower than bash?

**Short Answer:** No, TypeScript is actually slightly faster in most cases.

**Detailed Answer:**

Based on preliminary benchmarks:

| Operation | Bash | TypeScript | Difference |
|-----------|------|------------|------------|
| Agent Spawning | 2.3s ± 0.2s | 2.1s ± 0.1s | 9% faster |
| Coordination | 1.8s ± 0.3s | 1.7s ± 0.2s | 6% faster |
| Validation | 3.2s ± 0.4s | 3.0s ± 0.2s | 6% faster |

**Why TypeScript is faster:**
- Fewer subprocess spawns (bash calls many external tools)
- Better error handling reduces retries
- More consistent performance (less variance)

**Memory trade-off:**
- Bash: ~15MB per process
- TypeScript: ~45MB per process (Node.js overhead)
- Acceptable trade-off for type safety and maintainability

### What if I find a bug in TypeScript code?

**Immediate Actions:**
1. Create GitHub issue with label `typescript-migration`
2. Post in #typescript-migration Slack channel
3. Include error logs, steps to reproduce

**Issue Triage:**
- Reviewed within 4 hours
- Critical bugs (P0): Fixed within 8 hours
- High priority (P1): Fixed within 24 hours
- Medium/Low: Scheduled for next sprint

**Temporary Workaround:**
During soft launch (Weeks 1-6), you can use bash fallback:
```bash
export USE_TYPESCRIPT=false
pkill -f cfn-v3-coordinator
```

**GitHub Issue Template:**
```markdown
## Bug Description
[What went wrong]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happened]

## Error Logs
```
[Paste error logs]
```

## Environment
- Node.js version: [version]
- TypeScript version: [version]
- OS: [WSL2/Linux/Mac]
```

### When will bash be completely removed?

**Timeline:**

- **Now (Nov 20):** TypeScript default, bash fallback available
- **Week 7 (Jan 1):** Bash fallback removed from code
- **Week 9 (Jan 15):** Bash scripts archived
- **Week 13 (Feb 20):** Bash scripts deleted

**After Week 7 (Jan 1, 2026):**
- Bash scripts no longer supported
- TypeScript-only codebase
- Rollback requires reverting to v2.15.x

**Recommendation:**
- Start using TypeScript immediately
- Report any issues during soft launch (Weeks 1-6)
- Bash fallback available until Jan 1, 2026

---

## Technical Questions

### How do I use TypeScript implementations?

**Agent Spawning:**
```bash
# Old (bash)
./.claude/skills/cfn-agent-spawning/spawn-agent.sh backend-dev --task-id abc-123

# New (TypeScript)
npx claude-flow-novice agent-spawn backend-dev --task-id abc-123
```

**Coordination:**
```bash
# Old (bash)
./.claude/skills/cfn-coordination/coordination-wait.sh "signal-name"

# New (TypeScript)
npx claude-flow-novice coord-wait "signal-name"
```

**File Hooks:**
```bash
# Old (bash)
./.claude/hooks/cfn-invoke-pre-edit.sh "file.ts"

# New (TypeScript)
npx claude-flow-novice pre-edit "file.ts"
```

**See:** `docs/DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md` for complete examples

### Can I opt out of TypeScript?

**During Soft Launch (Weeks 1-6):** Yes
```bash
export USE_TYPESCRIPT=false
```

**After Jan 1, 2026:** No
- TypeScript-only codebase
- Bash fallback removed
- Must use TypeScript or revert to v2.15.x

**Why opt-out is temporary:**
- TypeScript provides critical improvements
- Maintaining both codebases is expensive
- Team consensus on TypeScript migration

### What about my custom bash scripts?

**Custom scripts are unaffected.**

This migration only affects CFN Loop core components:
- Agent spawning
- Coordination layer
- Validation logic
- File hooks
- Agent selection

**Your custom scripts continue to work:**
- Project-specific automation
- Build scripts
- Deployment scripts
- Testing scripts

**Migration recommendation:**
- Continue using bash for one-off scripts
- Consider TypeScript for complex logic (> 100 LOC)
- Use TypeScript for shared utilities

### How do I debug TypeScript code?

**Enable Debug Logging:**
```bash
export DEBUG=cfn:*
npx claude-flow-novice agent-spawn backend-dev --task-id test
```

**View Stack Traces:**
```bash
node --enable-source-maps dist/agent-spawner/index.js
```

**VSCode Debugging:**
1. Set breakpoints in TypeScript files
2. Run debug configuration (F5)
3. Step through code, inspect variables

**Common Debug Commands:**
```bash
# Check TypeScript compilation
npm run build

# Run tests with coverage
npm test -- --coverage

# View error logs
tail -f .artifacts/logs/typescript-errors.log

# Verify TypeScript execution
grep "agent-executor.ts" /tmp/coordinator-*.log
```

**See:** `docs/DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md` for detailed debugging guide

### What TypeScript version is required?

**Minimum:** TypeScript 5.3.3
**Recommended:** TypeScript 5.7+ (latest stable)

**Check your version:**
```bash
npx tsc --version
```

**Update TypeScript:**
```bash
npm install -D typescript@latest
```

**Node.js requirement:**
- Minimum: Node.js 18.0.0
- Recommended: Node.js 20.x LTS

**Check Node.js version:**
```bash
node --version
```

### Are CLI arguments compatible with bash versions?

**Yes, 100% compatible.**

TypeScript implementations maintain exact CLI argument compatibility:

```bash
# Bash and TypeScript accept identical arguments
--task-id VALUE
--agent-id VALUE
--confidence 0.95
--timeout 300
--mode standard
--role implementer
```

**Environment variables also compatible:**
```bash
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379
export DEBUG=cfn:*
```

**No changes required to:**
- Coordinator profiles
- Orchestrator scripts
- Agent spawning calls
- Coordination signals

---

## Development Workflow

### Do I need to rebuild after TypeScript changes?

**Yes, always rebuild:**
```bash
npm run build
```

**Watch mode for development:**
```bash
npm run build:watch
```

**Auto-rebuild on save:**
- VSCode: Use "TypeScript: Watch" task
- IntelliJ: Enable "Build project automatically"

### How do I add new TypeScript modules?

**1. Create module file:**
```typescript
// src/my-feature/my-module.ts
export function myFunction(param: string): number {
  return param.length;
}
```

**2. Add tests:**
```typescript
// src/my-feature/my-module.test.ts
import { myFunction } from './my-module';

describe('myFunction', () => {
  it('returns string length', () => {
    expect(myFunction('hello')).toBe(5);
  });
});
```

**3. Export from index:**
```typescript
// src/my-feature/index.ts
export * from './my-module';
```

**4. Build and test:**
```bash
npm run build
npm test
```

### What's the code review process for TypeScript?

**Same as bash, plus:**

1. **Type Safety Check:**
   - No `any` types (use `unknown` instead)
   - All functions have explicit return types
   - All parameters have explicit types

2. **Test Coverage:**
   - Minimum 90% coverage
   - All edge cases tested
   - Integration tests for complex logic

3. **Documentation:**
   - JSDoc comments for public functions
   - README for new modules
   - Update CHANGELOG.md

4. **Linting:**
   - ESLint must pass
   - No TypeScript errors
   - No unused imports

**Run before submitting PR:**
```bash
npm run lint
npm test -- --coverage
npm run build
```

### How do I handle TypeScript errors?

**Compilation Errors:**
```bash
# View all errors
npx tsc --noEmit

# Fix common issues
npm run lint:fix
```

**Runtime Errors:**
```bash
# Enable source maps
node --enable-source-maps dist/file.js

# View full stack trace
export NODE_OPTIONS="--enable-source-maps"
```

**Type Errors:**
```typescript
// ❌ BAD: Using 'any'
function process(data: any) { }

// ✅ GOOD: Explicit types
interface Data {
  id: string;
  value: number;
}
function process(data: Data) { }
```

---

## Troubleshooting

### "Cannot find module" errors

**Symptom:**
```
Error: Cannot find module './src/agent-spawner'
```

**Solution:**
```bash
# Rebuild TypeScript
npm run build

# Verify dist/ exists
ls -la dist/

# Check tsconfig.json
grep outDir tsconfig.json
```

### TypeScript not being used

**Symptom:**
```
Using bash fallback for agent spawning
```

**Solution:**
```bash
# Check environment
echo $USE_TYPESCRIPT  # Should be empty or "true"

# Remove override
unset USE_TYPESCRIPT

# Verify in logs
grep "agent-executor.ts" /tmp/coordinator-*.log
```

### Redis connection failures

**Symptom:**
```
Error: Redis connection failed: ECONNREFUSED
```

**Solution:**
```bash
# Check Redis running
redis-cli ping  # Should return "PONG"

# Start Redis
redis-server --daemonize yes

# Verify connection
redis-cli -h localhost -p 6379 ping
```

### Performance degradation

**Symptom:**
Agent spawning slower than expected

**Solution:**
```bash
# Enable profiling
node --prof dist/agent-spawner/index.js

# Generate report
node --prof-process isolate-*.log > profile.txt

# Check bottlenecks
grep -A 5 "ticks" profile.txt

# Report issue with profile
gh issue create \
  --title "TypeScript performance issue" \
  --body-file profile.txt \
  --label typescript-migration,performance
```

### Memory leaks

**Symptom:**
Memory usage increasing over time

**Solution:**
```bash
# Monitor memory
while true; do
  ps aux | grep coordinator | awk '{print $6}'
  sleep 60
done

# Heap snapshot
node --inspect dist/agent-spawner/index.js
# Chrome DevTools → Memory → Take heap snapshot

# Report with heap dump
gh issue create \
  --title "TypeScript memory leak" \
  --label typescript-migration,P1
```

---

## Timeline and Rollout

### What's the rollout timeline?

**13-week timeline:**

- **Weeks 1-2 (Now):** Soft launch, bash fallback available
- **Weeks 3-4:** Validation, testing, feedback
- **Weeks 5-6:** Hard cutover preparation
- **Weeks 7-8:** Remove bash fallback
- **Weeks 9-10:** Archive bash scripts
- **Weeks 11-12:** Final cleanup
- **Week 13:** Completion

**See:** `docs/BASH_DEPRECATION_TIMELINE.md` for detailed schedule

### What are the success metrics?

**Technical Metrics:**

| Metric | Target | Current |
|--------|--------|---------|
| Test Coverage | ≥90% | 92.8% |
| Error Rate | <1% | TBD |
| Performance | Within 10% | Better |
| Compilation Errors | 0 | 0 |

**Team Metrics:**

| Metric | Target | Method |
|--------|--------|--------|
| Satisfaction | ≥4/5 | Weekly survey |
| Training | 100% complete | Attendance |
| Adoption | 100% | Usage tracking |

### What happens if we need to rollback?

**Rollback triggers:**
- Critical errors (>5%)
- Performance degradation (>20%)
- Data corruption
- Security issues

**Rollback process:**
1. Disable TypeScript: `export USE_TYPESCRIPT=false`
2. Restart coordinators
3. Verify bash execution
4. Monitor for 1 hour

**Rollback timeline:**
- Immediate: < 5 minutes
- Short-term: < 1 hour
- Long-term: < 1 day

**See:** `docs/TYPESCRIPT_ROLLBACK_PLAN.md` for complete procedures

### Can I start using TypeScript now?

**Yes, TypeScript is default.**

No action required - TypeScript is enabled by default in v2.16.0+.

**To verify:**
```bash
# Check logs for TypeScript execution
grep "agent-executor.ts" /tmp/coordinator-*.log
```

**To opt-out (temporary):**
```bash
# Only during soft launch (Weeks 1-6)
export USE_TYPESCRIPT=false
```

---

## Team and Training

### What training is available?

**Documentation:**
- Developer Guide: `docs/DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md`
- Training Guide: `docs/TYPESCRIPT_TRAINING_GUIDE.md`
- Rollout Overview: `docs/TYPESCRIPT_ROLLOUT_OVERVIEW.md`

**Live Training:**
- Week 2: TypeScript fundamentals (2 hours)
- Week 4: CFN Loop architecture (1.5 hours)
- Week 6: Debugging techniques (1 hour)
- Week 11: Best practices (1 hour)

**Self-Paced:**
- TypeScript Handbook: https://www.typescriptlang.org/docs/
- Node.js TypeScript Guide: https://nodejs.org/en/docs/guides/typescript/
- Internal examples: `src/` directory

### Who can I ask for help?

**Slack Channels:**
- #typescript-migration - General questions
- #typescript-alerts - Automated alerts
- #typescript-metrics - Daily metrics

**GitHub:**
- Create issue with label `typescript-migration`
- Mention @tech-lead or @cto-agent

**Team Members:**
- Tech Lead: TypeScript architecture
- On-Call Engineer: Emergency issues
- CTO Agent: Strategic decisions

**Office Hours:**
- Every Wednesday 2-3pm: Open Q&A
- Every Friday 4-5pm: Code review session

### How do I contribute to TypeScript codebase?

**Prerequisites:**
1. Read `docs/DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md`
2. Complete TypeScript fundamentals training
3. Review existing TypeScript code in `src/`

**Process:**
1. Create feature branch
2. Write TypeScript code
3. Add tests (≥90% coverage)
4. Run linting and tests
5. Create pull request
6. Address review comments
7. Merge after approval

**Code Standards:**
- Explicit types (no `any`)
- JSDoc comments for public APIs
- Test coverage ≥90%
- ESLint compliant

**See:** `CONTRIBUTING.md` for complete guidelines

### Will there be more TypeScript migrations?

**Yes, planned Phases 2-4:**

**Phase 2: CLI Tooling (6 weeks)**
- Agent builder scripts
- Backlog management
- Changelog management

**Phase 3: Testing Infrastructure (8 weeks)**
- Test runners
- Coverage reporting
- Performance benchmarking

**Phase 4: Deployment Scripts (4 weeks)**
- Docker build helpers
- CI/CD integration
- Release automation

**Total timeline:** ~7 months (Phase 1-4)

**Phase 1 must succeed before starting Phase 2.**

### How do I stay updated on migration progress?

**Weekly Updates:**
- Every Monday: Status email
- Every Wednesday: Metrics dashboard review
- Every Friday: Issue triage summary

**Slack Notifications:**
- #typescript-migration: Daily updates
- #typescript-alerts: Critical issues
- #typescript-metrics: Performance metrics

**GitHub:**
- Watch repository for updates
- Subscribe to `typescript-migration` label
- Review weekly milestone progress

**Meetings:**
- Daily standup: Migration blockers
- Weekly retrospective: Progress review
- Monthly planning: Phase 2-4 roadmap

---

## Additional Resources

- **Rollout Overview:** `docs/TYPESCRIPT_ROLLOUT_OVERVIEW.md`
- **Developer Guide:** `docs/DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md`
- **Deprecation Timeline:** `docs/BASH_DEPRECATION_TIMELINE.md`
- **Rollback Plan:** `docs/TYPESCRIPT_ROLLBACK_PLAN.md`
- **Training Guide:** `docs/TYPESCRIPT_TRAINING_GUIDE.md`
- **Metrics Dashboard:** `docs/TYPESCRIPT_METRICS_DASHBOARD.md`

## Contact

- **Slack:** #typescript-migration
- **GitHub Issues:** Label `typescript-migration`
- **Email:** team@yourcompany.com
- **Emergency:** Page on-call engineer

---

**Last Updated:** 2025-11-20
**Next Review:** 2025-12-01
**Document Owner:** CTO Agent

**Have a question not answered here?**
Create an issue or post in #typescript-migration Slack channel.
