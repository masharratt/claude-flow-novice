# Agent Compliance Test Suite

Comprehensive test suite to validate agent adherence to SQLite/Redis/CLI integration guidelines and hook validation requirements.

## Test Results Summary

**Current State (2025-10-11):**
- **Total Agents:** 25 production agents (19 agents failed to parse due to frontmatter YAML issues)
- **Compliant:** 0 agents (0%)
- **Non-Compliant:** 25 agents (100%)
- **Average Compliance Score:** 55.2%

### Compliance by Category

| Category | Total | Compliant | Avg Score | Priority |
|----------|-------|-----------|-----------|----------|
| **Implementer** | 10 | 0/10 (0%) | 64.0% | HIGH |
| **Coordinator** | 6 | 0/6 (0%) | 40.0% | CRITICAL |
| **Validator** | 2 | 0/2 (0%) | 70.0% | HIGH |
| **Strategic** | 1 | 0/1 (0%) | 50.0% | CRITICAL |
| **SPARC** | 4 | 0/4 (0%) | 50.0% | MEDIUM |
| **Researcher** | 1 | 0/1 (0%) | 50.0% | LOW |
| **Documentation** | 1 | 0/1 (0%) | 60.0% | LOW |

### Top 10 Violations

1. **25 agents**: Missing `validation_hooks` array
2. **25 agents**: Missing `acl_level` declaration
3. **22 agents**: Missing `lifecycle` hooks (pre_task, post_task)
4. **14 agents**: Missing `model` field
5. **8 agents**: Missing `tools` field
6. **6 coordinators**: Missing `BlockingCoordinationSignals` import
7. **6 coordinators**: Missing `CoordinatorTimeoutHandler` import
8. **6 coordinators**: Missing HMAC secret usage
9. **6 coordinators**: Missing `sendSignal` pattern
10. **6 coordinators**: Missing `waitForAck` pattern

---

## Test Files

### 1. Quick Agent Check (`quick-agent-check.cjs`)

**Purpose:** Fast compliance check without dependencies

**Usage:**
```bash
# Run quick check (exits with code 1 if non-compliant agents found)
node tests/agents/quick-agent-check.cjs

# Use in CI/CD pipeline
npm run test:agents:quick
```

**Output:**
- Summary statistics (total, compliant, average score)
- Category breakdown
- Top 10 violations
- Non-compliant agents detail (up to 20 agents)

**Performance:** ~100ms for 40+ agents

---

### 2. Comprehensive Test Suite (`agent-compliance-validator.test.ts`)

**Purpose:** Jest-based comprehensive validation with detailed test cases

**Usage:**
```bash
# Run full test suite
npm test -- tests/agents/agent-compliance-validator.test.ts

# Run with coverage
npm test -- --coverage tests/agents/agent-compliance-validator.test.ts

# Run specific category
npm test -- tests/agents/agent-compliance-validator.test.ts -t "Implementer Agents"
```

**Test Categories:**

1. **Universal Requirements** (applies to all 41+ agents)
   - Required frontmatter fields
   - `validation_hooks` array
   - `agent-template-validator` hook (mandatory)
   - `lifecycle.pre_task` SQLite registration
   - `lifecycle.post_task` SQLite completion
   - `acl_level` declaration

2. **Implementer Agents** (~15 agents)
   - ACL level 1 (Private)
   - `test-coverage-validator` hook
   - CFN Loop 3 integration patterns
   - Confidence score persistence

3. **Coordinator Agents** (~12 agents)
   - ACL level 3 (Swarm)
   - `blocking-coordination-validator` hook
   - `BlockingCoordinationSignals` import
   - HMAC secret usage
   - Signal ACK patterns (sendSignal, waitForAck)
   - Heartbeat broadcasting
   - Dead coordinator detection

4. **Validator Agents** (~8 agents)
   - ACL level 3 (Swarm)
   - `test-coverage-validator` hook
   - CFN Loop 2 consensus validation patterns
   - Validation vote persistence
   - Consensus calculation

5. **Strategic Agents** (product-owner, goal-planner)
   - ACL level 4 (Project)
   - CFN Loop 4 GOAP decision patterns
   - 365-day retention policy
   - GOAP decision persistence

6. **Compliance Report**
   - Comprehensive validation report
   - Score calculation per agent
   - Category-wise breakdown
   - Top violations analysis

---

## Test Architecture

### Agent Discovery

```javascript
// Automatic discovery of all agent files
.claude/agents/
├── core-agents/           // coder, coordinator, reviewer, etc.
├── swarm/                 // swarm coordinators
├── consensus/             // consensus coordinators
├── security/              // security-specialist
├── testing/               // tester, playwright-agent
├── development/backend/   // backend-dev
├── specialized/mobile/    // mobile-dev
├── sparc/                 // SPARC methodology agents
├── cfn-loop/              // product-owner
└── ...

Excludes:
- agent-principles/        // Documentation
- examples/                // Examples
- predesign-negotiation/   // Pre-design agents
- README*.md, *GUIDELINES.md, *PRINCIPLES.md
```

### Agent Categorization

Agents are automatically categorized based on file path patterns:

```javascript
const CATEGORY_PATTERNS = [
  [/core-agents\/(coder|tester)\.md/, 'implementer'],
  [/swarm\/.*coordinator.*\.md/, 'coordinator'],
  [/core-agents\/reviewer\.md/, 'validator'],
  [/cfn-loop\/product-owner\.md/, 'strategic'],
  [/sparc\//, 'sparc'],
  // ... more patterns
];
```

### Validation Requirements by Category

Each category has specific requirements defined in `CATEGORY_REQUIREMENTS`:

```typescript
interface CategoryRequirements {
  requiredValidationHooks: string[];      // Mandatory hooks
  requiredACLLevel: number | number[];    // Expected ACL level(s)
  requiresBlockingCoordination: boolean;  // Coordinator-specific
  requiresCFNLoopIntegration: boolean;    // Loop 3/2/4 patterns
  requiresTestCoverage: boolean;          // Test coverage validator
  minBodySections: string[];              // Required documentation sections
}
```

### Scoring Algorithm

```javascript
// Score = (passed checks / total checks) * 100
const totalChecks = 10 + minBodySections.length + (coordinator ? 5 : 0);
const passedChecks = totalChecks - violations.length;
const score = Math.round((passedChecks / totalChecks) * 100);
```

---

## Running Tests

### Quick Check (Recommended for Development)

```bash
# Fast check during development
node tests/agents/quick-agent-check.cjs

# Watch mode (re-run on agent file changes)
nodemon --watch .claude/agents --exec "node tests/agents/quick-agent-check.cjs"
```

### Full Test Suite (CI/CD)

```bash
# Run Jest test suite
npm test -- tests/agents/agent-compliance-validator.test.ts

# Run with coverage
npm test -- --coverage tests/agents/

# Run in CI mode (fail on warnings)
npm test -- --coverage --ci tests/agents/
```

### NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test:agents": "npm test -- tests/agents/agent-compliance-validator.test.ts",
    "test:agents:quick": "node tests/agents/quick-agent-check.cjs",
    "test:agents:watch": "npm test -- --watch tests/agents/",
    "test:agents:coverage": "npm test -- --coverage tests/agents/"
  }
}
```

---

## Interpreting Results

### Compliance Score Ranges

- **90-100%**: Excellent - Agent is fully compliant
- **80-89%**: Good - Minor violations, low priority fixes
- **70-79%**: Fair - Moderate violations, should address soon
- **60-69%**: Poor - Major violations, high priority
- **0-59%**: Critical - Urgent updates required

### Priority Levels

Based on category and current score:

1. **CRITICAL** (Coordinators, Strategic): Blocking coordination essential for CFN Loop
2. **HIGH** (Implementers, Validators): Core functionality agents
3. **MEDIUM** (SPARC, Specialized): Methodology-specific agents
4. **LOW** (Researchers, Documentation): Support agents

---

## Fixing Violations

### Universal Fixes (All Agents)

**1. Add `validation_hooks` to frontmatter:**

```yaml
---
name: agent-name
# ... existing fields ...
validation_hooks:
  - agent-template-validator        # MANDATORY for all
  - cfn-loop-memory-validator       # MANDATORY for all
  # + category-specific validators
---
```

**2. Add `lifecycle` hooks:**

```yaml
lifecycle:
  pre_task: |
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', '${AGENT_TYPE}', 'active', CURRENT_TIMESTAMP)"
  post_task: |
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed', confidence = ${CONFIDENCE_SCORE},
                         completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"
```

**3. Add `acl_level`:**

```yaml
acl_level: 1  # 1=Private, 3=Swarm, 4=Project (see matrix in AGENT_UPDATE_MASTER_PLAN.md)
```

### Category-Specific Fixes

**Implementers:**
```yaml
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - test-coverage-validator
acl_level: 1
```

**Coordinators:**
```yaml
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - blocking-coordination-validator
acl_level: 3
type: coordinator
```

Add to body:
```markdown
## Blocking Coordination Integration

\`\`\`typescript
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals.js';
import { CoordinatorTimeoutHandler } from '../cfn-loop/coordinator-timeout-handler.js';

const signals = new BlockingCoordinationSignals({
  redis,
  swarmId,
  coordinatorId,
  hmacSecret: process.env.BLOCKING_COORDINATION_SECRET
});
\`\`\`
```

**Validators:**
```yaml
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - test-coverage-validator
acl_level: 3
```

**Strategic (Product Owner):**
```yaml
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
acl_level: 4
```

---

## Update Templates

Use the pre-built templates in `planning/redis-finalization/templates/`:

- `implementer-template.md` - For implementers (ACL 1)
- `coordinator-template.md` - For coordinators (ACL 3)
- `validator-template.md` - For validators (ACL 3)
- `strategic-template.md` - For strategic agents (ACL 4)

### Template Usage

```bash
# 1. Copy template
cp planning/redis-finalization/templates/implementer-template.md temp-agent.md

# 2. Replace placeholders
# ${AGENT_TYPE}, ${AGENT_ID}, ${AGENT_NAME}, etc.

# 3. Merge with existing agent
# Copy frontmatter + add body sections

# 4. Validate
node tests/agents/quick-agent-check.cjs

# 5. Run validators
node config/hooks/post-edit-agent-template.js .claude/agents/your-agent.md
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Agent Compliance Check

on:
  push:
    paths:
      - '.claude/agents/**/*.md'
  pull_request:
    paths:
      - '.claude/agents/**/*.md'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run agent compliance tests
        run: npm run test:agents

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash

# Run quick agent check
node tests/agents/quick-agent-check.cjs

if [ $? -ne 0 ]; then
  echo "❌ Agent compliance check failed"
  echo "   Fix violations before committing"
  exit 1
fi

echo "✅ Agent compliance check passed"
```

---

## Maintenance

### Adding New Tests

1. **Add new validation check** in `validateAgent()` function
2. **Update `CATEGORY_REQUIREMENTS`** if category-specific
3. **Add test case** in `agent-compliance-validator.test.ts`
4. **Run tests** to verify

### Updating Requirements

When requirements change:

1. Update `CATEGORY_REQUIREMENTS` object
2. Update `AGENT_UPDATE_MASTER_PLAN.md`
3. Update templates in `planning/redis-finalization/templates/`
4. Re-run test suite: `npm run test:agents`

---

## References

- **Master Plan:** `planning/redis-finalization/AGENT_UPDATE_MASTER_PLAN.md`
- **Audit Report:** `planning/redis-finalization/AGENT_AUDIT_DETAILED_REPORT.md`
- **Hook Guide:** `planning/redis-finalization/HOOK_INTEGRATION_GUIDE.md`
- **Templates:** `planning/redis-finalization/templates/`
- **Handoff Guide:** `planning/redis-finalization/AGENT_PROMPT_REWRITE_HANDOFF.md`

---

## Troubleshooting

### "Error parsing agent file"

**Cause:** Invalid YAML in frontmatter

**Fix:**
```bash
# Validate YAML syntax
yamllint .claude/agents/your-agent.md

# Common issues:
# - Unescaped colons in description
# - Incorrect indentation
# - Missing quotes around special characters
```

### "Agent not discovered"

**Cause:** Agent file in excluded directory or matches skip pattern

**Fix:**
- Move agent to included directory (e.g., `core-agents/`)
- Check filename doesn't include `README`, `GUIDELINES`, etc.
- Add pattern to `CATEGORY_PATTERNS` if new location

### "Wrong category assigned"

**Cause:** File path doesn't match any category pattern

**Fix:**
- Add pattern to `CATEGORY_PATTERNS` array
- Move agent to appropriate directory
- Agent defaults to `implementer` if no match

---

## Future Enhancements

- [ ] Add performance benchmarking (hook execution time)
- [ ] Add ACL violation detection (runtime checks)
- [ ] Add memory key pattern validation
- [ ] Add Redis pub/sub coordination validation
- [ ] Add integration tests with SQLite
- [ ] Add chaos testing (coordinator death scenarios)
- [ ] Add compliance dashboard (web UI)
- [ ] Add auto-fix suggestions

---

**Last Updated:** 2025-10-11
**Maintained By:** Claude Flow Core Team
**Version:** 1.0.0
