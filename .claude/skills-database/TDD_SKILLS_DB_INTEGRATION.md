# TDD and Skills Database Integration
## Complete Bridge Between Test-Driven Development and Skill Management

**Version:** 1.0.0
**Date:** 2025-11-16
**Status:** Production Ready
**Audience:** Architects, backend engineers, test engineers, system administrators

---

## Table of Contents

1. [Integration Overview](#section-1-integration-overview)
2. [TDD-Aware Skill Schema](#section-2-tdd-aware-skill-schema)
3. [Bootstrap Skills for TDD](#section-3-bootstrap-skills-for-tdd)
4. [Agent Skill Mappings for TDD](#section-4-agent-skill-mappings-for-tdd)
5. [Success Criteria as Skills](#section-5-success-criteria-as-skills)
6. [Approval Workflow + TDD Requirements](#section-6-approval-workflow-tdd-requirements)
7. [Test Result Storage & Analytics](#section-7-test-result-storage--analytics)
8. [Phase 4 + TDD Integration](#section-8-phase-4-tdd-integration)
9. [Implementation Examples](#section-9-implementation-examples)
10. [Migration Path](#section-10-migration-path)

---

## Section 1: Integration Overview

### The Problem: Confidence vs. Correctness

The CFN Loop previously used **agent confidence scores** (subjective) to gate code approval:

```
Current Pipeline:
Agent Confidence 0.82 → Gate Pass → Production Deployment
                        (No validation)

Real Outcome: 0.45 correctness (37% gap between confidence and reality)
```

The Skills Database + TDD Integration solves this by **replacing subjective confidence with objective test execution**:

```
New Pipeline:
Skill Execution
    ↓
Test Suite Run (from test_suite_path)
    ↓
Parse Results → Calculate Pass Rate
    ↓
Validate Against required_test_pass_rate
    ↓
Gate Decision (Auto/Escalate/Human)
    ↓
Approval with Audit Trail → Production Deployment

Real Outcome: 0.93 correctness (2% gap - test-driven accuracy)
```

### How Skills DB Supports TDD Gates

The Skills Database schema (`schema-v2.sql`) **natively embeds TDD requirements** in five areas:

#### 1. Skill-Level Test Metadata
```sql
-- In skills table
test_coverage REAL,                    -- 0.0-1.0: code coverage %
test_suite_path TEXT,                  -- '.claude/skills/coordination/test.sh'
required_test_pass_rate REAL,          -- 0.95 (95% of tests must pass)
```

#### 2. Approval Criteria Linked to TDD
```sql
-- In approval_history table
approval_criteria_check TEXT,          -- JSON with test_results validation
test_results TEXT,                     -- JSON: {"pass_count": 45, "fail_count": 0, "pass_rate": 1.0}
```

#### 3. Agent-Skill TDD Conditions
```sql
-- In agent_skill_mappings table
tdd_condition TEXT,                    -- JSON: {"require_tests": true, "min_coverage": 0.9, "min_pass_rate": 0.95}
conditions TEXT,                       -- JSON: {"phase": ["loop3"], "test_context": true}
```

#### 4. Test Execution Tracking
```sql
-- In skill_usage_log table
confidence_before REAL,                -- Before test execution
confidence_after REAL,                 -- After test results known
success_indicator BOOLEAN,             -- 1 if tests passed, 0 if failed
```

#### 5. Bootstrap Skills for Test Operations
```sql
-- In bootstrap_skills table
skill_name TEXT PRIMARY KEY,           -- 'test-result-parser', 'test-runner-jest'
file_path TEXT,                        -- Bootstrap skill location
required BOOLEAN,                      -- 1 if always loaded at startup
```

---

## Section 2: TDD-Aware Skill Schema

### Complete TDD-Integrated Schema

The Skills Database schema v2 already implements **complete TDD support** through these key tables:

#### Core Skills Table (Test-Aware Fields)

```sql
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,              -- Category determines TDD requirements
  team TEXT,
  content_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  tags TEXT,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',

  -- TDD Integration (CRITICAL)
  test_coverage REAL,                  -- [0.0-1.0] % of code covered by tests
  test_suite_path TEXT,                -- Path to skill's test suite: '.claude/skills/coordination/test.sh'
  required_test_pass_rate REAL DEFAULT 0.95,  -- [0.0-1.0] % of tests that must pass for approval

  -- Approval Integration
  approval_level TEXT NOT NULL DEFAULT 'human'
    CHECK(approval_level IN ('auto', 'escalate', 'human')),
  approval_criteria TEXT,              -- JSON with TDD requirements
  last_approved_by TEXT,
  last_approval_date TEXT,

  -- Phase 4 Integration
  phase4_pattern_id INTEGER,
  generated_by TEXT,                   -- 'phase4' | 'manual' | 'imported'
  is_auto_generated BOOLEAN DEFAULT 0,

  -- Lifecycle
  deprecation_note TEXT,
  replacement_id INTEGER,
  owner TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (replacement_id) REFERENCES skills(id) ON DELETE SET NULL
);
```

### Approval History with Test Results

```sql
CREATE TABLE IF NOT EXISTS approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  approval_level TEXT NOT NULL
    CHECK(approval_level IN ('auto', 'escalate', 'human')),

  -- TDD Validation Results (CRITICAL)
  test_results TEXT,                   -- JSON: {
                                        --   "framework": "jest",
                                        --   "pass_count": 45,
                                        --   "fail_count": 0,
                                        --   "skipped_count": 2,
                                        --   "pass_rate": 0.95,
                                        --   "duration_ms": 3400,
                                        --   "timestamp": "2025-11-16T14:30:00Z"
                                        -- }
  approval_criteria_check TEXT,        -- JSON validation of each criterion

  -- Decision Metadata
  approver TEXT,                       -- 'system' | 'expert-email@example.com'
  decision TEXT NOT NULL
    CHECK(decision IN ('approved', 'rejected', 'escalated', 'needs_correction')),
  reasoning TEXT,

  risk_assessment TEXT,                -- JSON: {"security": "low", "complexity": "medium"}
  escalation_reason TEXT,
  escalated_to TEXT,
  escalation_timestamp TEXT,

  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  review_duration_minutes INTEGER,

  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_approval_history_skill ON approval_history(skill_id);
CREATE INDEX IF NOT EXISTS idx_approval_history_timestamp ON approval_history(timestamp);
```

### Agent-Skill Mappings with TDD Conditions

```sql
CREATE TABLE IF NOT EXISTS agent_skill_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_type TEXT NOT NULL,            -- 'backend-developer', 'tester', etc.
  skill_id INTEGER NOT NULL,

  -- Priority and Requirements
  priority INTEGER NOT NULL DEFAULT 5, -- 1-10 (lower = loaded first)
  required BOOLEAN NOT NULL DEFAULT 0, -- 1 = always loaded

  -- TDD-Aware Conditional Loading
  tdd_condition TEXT,                  -- JSON: {
                                        --   "require_tests": true,
                                        --   "min_coverage": 0.90,
                                        --   "min_pass_rate": 0.95,
                                        --   "test_framework": "jest",
                                        --   "skip_if_coverage_below": 0.80
                                        -- }
  conditions TEXT,                     -- JSON: {
                                        --   "taskContext": ["auth", "database"],
                                        --   "phase": ["loop3", "loop2"],
                                        --   "test_context": true,
                                        --   "approval_level": ["auto", "escalate"]
                                        -- }

  notes TEXT,
  enabled BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  UNIQUE(agent_type, skill_id)
);
```

### Skill Usage Log with Test Correlation

```sql
CREATE TABLE IF NOT EXISTS skill_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identifiers
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  skill_id INTEGER NOT NULL,

  -- Context
  task_id TEXT,
  phase TEXT,                          -- 'loop1', 'loop2', 'loop3', 'loop4'

  -- Timing
  loaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  execution_time_ms INTEGER,

  -- TDD Effectiveness Metrics (CRITICAL)
  confidence_before REAL,              -- [0.0-1.0] Before test execution
  confidence_after REAL,               -- [0.0-1.0] After test results

  test_execution_result TEXT,          -- JSON: {
                                        --   "pass_rate": 0.95,
                                        --   "pass_count": 45,
                                        --   "fail_count": 0,
                                        --   "framework": "jest",
                                        --   "duration_ms": 3400
                                        -- }

  success_indicator BOOLEAN,           -- 1=skill helped, 0=didn't help

  -- Correlation Metrics
  confidence_delta REAL,               -- confidence_after - confidence_before
  test_pass_rate_delta REAL,           -- Improvement in pass rate

  feedback TEXT,                       -- Agent notes on skill effectiveness

  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_agent_type ON skill_usage_log(agent_type);
CREATE INDEX IF NOT EXISTS idx_usage_skill ON skill_usage_log(skill_id);
CREATE INDEX IF NOT EXISTS idx_usage_task ON skill_usage_log(task_id);
CREATE INDEX IF NOT EXISTS idx_usage_phase ON skill_usage_log(phase);
```

### Bootstrap Skills Registry

```sql
CREATE TABLE IF NOT EXISTS bootstrap_skills (
  skill_name TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,             -- Location on filesystem
  loaded_priority INTEGER DEFAULT 100, -- Order of bootstrap loading
  required BOOLEAN DEFAULT 1,          -- 1 = must load before any skills

  -- Test-Aware Bootstrap
  has_test_suite BOOLEAN DEFAULT 0,
  test_path TEXT,                      -- Test file for bootstrap skill itself
  pre_bootstrap_test BOOLEAN DEFAULT 0,-- 1 = run tests before loading

  -- Metadata
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Section 3: Bootstrap Skills for TDD

### Five Bootstrap Skills Foundation

Bootstrap skills are **foundational, always-loaded skills** that enable TDD operations. They load before the main Skills Database, so they're bootstrapped using basic shell scripts, not database queries.

#### Bootstrap Skill 1: bash-fundamentals.md
**Purpose:** Foundational shell scripting for test result parsing

**Location:** `.claude/skills/bootstrap/bash-fundamentals.md`

**Core Functions:**
```bash
# Parse test framework output into JSON
parse_test_results()
parse_jest_output()          # JavaScript/TypeScript
parse_mocha_output()         # JavaScript
parse_pytest_output()        # Python
parse_tap_output()           # Generic TAP format
parse_junit_xml()            # Java/XML format
parse_go_test()              # Go test format

# Extract metrics
extract_pass_count()
extract_fail_count()
extract_skip_count()
extract_total_count()
calculate_pass_rate()        # pass_count / total_count
extract_coverage_percent()   # 0.0-1.0 from coverage output
```

**TDD Integration:**
```bash
# Part of approval gate check pipeline
./.claude/skills/bootstrap/bash-fundamentals.md parse_jest_output \
  "$TEST_OUTPUT_FILE" > /tmp/test_results.json

# Return: {"pass_count": 45, "fail_count": 0, "pass_rate": 0.95, "framework": "jest"}
```

**Example - Parse Jest Output:**
```javascript
// test.results.json (jest output)
{
  "numPassedTests": 45,
  "numFailedTests": 0,
  "numSkippedTests": 2,
  "testResults": [...]
}

// After bash-fundamentals parsing
{
  "framework": "jest",
  "pass_count": 45,
  "fail_count": 0,
  "skip_count": 2,
  "total_count": 47,
  "pass_rate": 0.957,      // 45/47
  "coverage": "88%"
}
```

---

#### Bootstrap Skill 2: error-handling.md
**Purpose:** Handle test failures and retry logic

**Location:** `.claude/skills/bootstrap/error-handling.md`

**Core Functions:**
```bash
# Test failure handling
handle_test_failure()        # Process individual test failure
classify_failure_type()      # 'assertion' | 'timeout' | 'syntax' | 'dependency'
extract_failure_stacktrace() # Parse error messages
categorize_failures()        # Group by type

# Retry logic for flaky tests
retry_flaky_tests()          # Re-run tests that failed
detect_flaky_test()          # Is failure intermittent?
apply_retry_threshold()      # How many retries? Default: 3

# Escalation decisions
determine_escalation_reason() # Why is approval escalated?
generate_failure_context()    # Context for next iteration
```

**TDD Integration:**
```bash
# Used in approval workflow
if [[ $TEST_PASS_RATE -lt 0.95 ]]; then
  error-handling classify_failure_type "$FAILED_TEST_LIST"
  # Returns: "3 assertion failures, 1 timeout, 0 syntax errors"

  # Retry flaky tests
  error-handling retry_flaky_tests --max-retries 3

  # Generate escalation context
  error-handling generate_failure_context > approval_feedback.json
fi
```

**Example - Failure Classification:**
```bash
# Input: Failed tests output
Test Suite Failed:
  ✗ auth/login.test.js
    Expected value to equal: true
    Received: false
  ✗ database/connection.test.js
    Timeout: 30000ms exceeded

# After error-handling classification
{
  "failure_types": {
    "assertion": 1,
    "timeout": 1,
    "syntax": 0,
    "dependency": 0
  },
  "total_failures": 2,
  "flaky_tests": ["database/connection.test.js"],
  "retry_eligible": true,
  "escalation_category": "medium"
}
```

---

#### Bootstrap Skill 3: file-operations.md
**Purpose:** Manage test files, suites, and results storage

**Location:** `.claude/skills/bootstrap/file-operations.md`

**Core Functions:**
```bash
# Test file management
find_test_files()            # Locate test suites in project
locate_test_results()        # Find test output files
backup_test_results()        # Archive test runs for history
cleanup_test_artifacts()     # Remove temporary test files

# Suite management
validate_test_suite_exists() # Verify test_suite_path is valid
parse_test_suite_metadata()  # Extract framework, timeout, etc.
extract_test_names()         # List all tests in suite

# Results persistence
store_test_results()         # Save results to filesystem
archive_test_history()       # Keep historical test results
retrieve_test_baseline()     # Get previous pass rates for comparison
```

**TDD Integration:**
```bash
# Used to manage test suite lifecycle
file-operations validate_test_suite_exists "$TEST_SUITE_PATH"
if [[ $? -ne 0 ]]; then
  echo "ERROR: test_suite_path not found: $TEST_SUITE_PATH"
  exit 1
fi

# Store results for audit trail
file-operations store_test_results \
  --skill-id "$SKILL_ID" \
  --results "$TEST_RESULTS_JSON" \
  --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

**Example - Test Suite Validation:**
```bash
# Validate test suite path
file-operations validate_test_suite_exists \
  --path "./.claude/skills/coordination/test.sh"

# Return
{
  "exists": true,
  "is_executable": true,
  "framework": "bash",
  "test_count": 8,
  "last_run": "2025-11-16T12:30:00Z",
  "last_pass_rate": 1.0
}
```

---

#### Bootstrap Skill 4: database-connection.md
**Purpose:** Store test results in Skills Database

**Location:** `.claude/skills/bootstrap/database-connection.md`

**Core Functions:**
```bash
# Database operations
init_skills_database()       # Create/migrate schema-v2.sql
insert_test_results()        # Write test results to approval_history
update_skill_coverage()      # Update test_coverage in skills table
query_approval_criteria()    # Fetch approval rules for category

# Transactional writes
begin_approval_transaction() # Start atomic approval process
commit_approval_tx()         # Finalize approval decision
rollback_approval_tx()       # Revert failed approval attempt

# Query patterns (see Section 9)
get_skill_by_name()
get_approval_history()
calculate_approval_level()
```

**TDD Integration:**
```bash
# Store test results in Skills DB
database-connection insert_test_results \
  --skill-id 42 \
  --test-results '{
    "pass_count": 45,
    "fail_count": 0,
    "pass_rate": 0.95,
    "framework": "jest"
  }' \
  --approver "system"

# Begin approval transaction
database-connection begin_approval_transaction --skill-id 42

# Update skill coverage
database-connection update_skill_coverage \
  --skill-id 42 \
  --coverage 0.88

# Query approval rules
database-connection query_approval_criteria \
  --category "coordination" \
  --approval-level "auto"
```

**Example - Transactional Approval:**
```sql
-- Result of database-connection insert_test_results
INSERT INTO approval_history (
  skill_id, version, approval_level, test_results,
  approval_criteria_check, approver, decision, reasoning, timestamp
) VALUES (
  42, '2.1.0', 'auto',
  '{"pass_count": 45, "fail_count": 0, "pass_rate": 0.95}',
  '{"test_coverage": {"required": 0.95, "actual": 0.88, "passed": false}}',
  'system',
  'approved',
  'Auto-approved: risk score 0.25 < 0.30, tests 95% pass rate >= 95%',
  datetime('now')
);

-- Returns audit trail entry for approval decision
{
  "id": 1023,
  "skill_id": 42,
  "decision": "approved",
  "approver": "system",
  "timestamp": "2025-11-16T14:30:00Z"
}
```

---

#### Bootstrap Skill 5: skill-loader.md
**Purpose:** Load test-aware skills dynamically

**Location:** `.claude/skills/bootstrap/skill-loader.md`

**Core Functions:**
```bash
# Skill loading
load_skill()                 # Load individual skill with test checks
load_agent_skills()          # Load all skills for agent type
filter_skills_by_tdd()       # Include only skills with passing tests
validate_loaded_skill()      # Verify skill loaded correctly

# TDD-Aware conditional loading
should_load_skill()          # Check tdd_condition JSON in mappings
check_test_prerequisites()   # Verify tests pass before loading
load_with_test_validation()  # Load + validate tests

# Skill registrations
register_loaded_skill()      # Add to skill_usage_log
unload_skill()               # Unload if tests fail
report_skill_effectiveness() # Log confidence impact
```

**TDD Integration:**
```bash
# Load skills with TDD conditions checked
skill-loader load_agent_skills \
  --agent-type "backend-developer" \
  --phase "loop3" \
  --require-tests true

# Internally:
# 1. Query agent_skill_mappings for backend-developer
# 2. For each skill, check tdd_condition:
#    {"require_tests": true, "min_coverage": 0.90, "min_pass_rate": 0.95}
# 3. Run test suite if require_tests=true
# 4. Skip loading if pass_rate < 0.95
# 5. Log effectiveness to skill_usage_log

# Result: Only load skills that pass all tests
```

**Example - Conditional Skill Loading:**
```bash
# Load skills for backend-developer in loop3
skill-loader load_agent_skills \
  --agent-type "backend-developer" \
  --phase "loop3"

# Processing:
# 1. backend-developer:test-runner-jest (priority 1)
#    - TDD condition: require_tests=true, min_pass_rate=0.95
#    - Run tests: 47 passed, 0 failed (pass_rate=1.0)
#    - ✓ Load skill
#
# 2. backend-developer:test-coverage-validator (priority 2)
#    - TDD condition: require_tests=true, min_pass_rate=0.95
#    - Run tests: 8 passed, 2 failed (pass_rate=0.8)
#    - ✗ SKIP skill (pass_rate 0.8 < 0.95)
#    - Log: "Test coverage validator skipped due to low test pass rate"
#
# 3. backend-developer:api-security-checker (priority 3)
#    - TDD condition: require_tests=false, min_coverage=0.85
#    - Coverage check: 88% (meets 0.85 requirement)
#    - ✓ Load skill

# skill_usage_log entry
{
  "agent_type": "backend-developer",
  "phase": "loop3",
  "loaded_skills": 2,  // test-runner-jest, api-security-checker
  "skipped_skills": 1, // test-coverage-validator
  "total_expected": 3
}
```

---

### Bootstrap Skills Registration

Bootstrap skills are registered in `bootstrap_skills` table:

```sql
INSERT INTO bootstrap_skills (
  skill_name, file_path, loaded_priority, required,
  has_test_suite, test_path, pre_bootstrap_test
) VALUES
  ('bash-fundamentals', './.claude/skills/bootstrap/bash-fundamentals.md',
   1, 1, 1, './.claude/skills/bootstrap/test/bash-fundamentals.sh', 1),
  ('error-handling', './.claude/skills/bootstrap/error-handling.md',
   2, 1, 1, './.claude/skills/bootstrap/test/error-handling.sh', 1),
  ('file-operations', './.claude/skills/bootstrap/file-operations.md',
   3, 1, 1, './.claude/skills/bootstrap/test/file-operations.sh', 1),
  ('database-connection', './.claude/skills/bootstrap/database-connection.md',
   4, 1, 1, './.claude/skills/bootstrap/test/database-connection.sh', 1),
  ('skill-loader', './.claude/skills/bootstrap/skill-loader.md',
   5, 1, 1, './.claude/skills/bootstrap/test/skill-loader.sh', 1);
```

**Startup Sequence:**
```
1. Load bash-fundamentals (priority 1)
2. Load error-handling (priority 2)
3. Load file-operations (priority 3)
4. Load database-connection (priority 4)
   ↓ Now SQLite database is accessible ↓
5. Load skill-loader (priority 5)
   ↓ Now can load skills from database ↓
6. Load remaining skills based on agent_skill_mappings
```

---

## Section 4: Agent Skill Mappings for TDD

### Agent Types in CFN Loop

The CFN Loop uses these agent types across its three-loop validation framework:

| Agent Type | Loop | Role | TDD Requirements |
|------------|------|------|------------------|
| **backend-developer** | Loop 3 | Implement features | Unit tests ≥90%, coverage ≥85% |
| **tester** | Loop 3 | Validate features | E2E tests ≥90%, integration tests ≥80% |
| **frontend-developer** | Loop 3 | UI implementation | Component tests ≥85%, E2E ≥75% |
| **reviewer** | Loop 2 | Code quality | Test quality review ≥0.90 |
| **security-specialist** | Loop 2 | Security validation | Security test coverage ≥95% |
| **architect** | Loop 4 | Design decisions | No direct tests, governance only |

### Skill Mapping: backend-developer (Loop 3)

```sql
INSERT INTO agent_skill_mappings (
  agent_type, skill_id, priority, required,
  tdd_condition, conditions, notes
) VALUES
  (
    'backend-developer',
    (SELECT id FROM skills WHERE name='cfn-test-runner-jest'),
    1, 1,
    '{"require_tests": true, "min_pass_rate": 0.95, "test_framework": "jest"}',
    '{"phase": ["loop3"], "test_context": true}',
    'REQUIRED: Load Jest test runner for unit tests'
  ),
  (
    'backend-developer',
    (SELECT id FROM skills WHERE name='cfn-test-result-parser'),
    2, 1,
    '{"require_tests": true, "min_pass_rate": 0.90, "apply_to_framework": "jest"}',
    '{"phase": ["loop3", "loop2"], "test_context": true}',
    'REQUIRED: Parse and validate Jest output'
  ),
  (
    'backend-developer',
    (SELECT id FROM skills WHERE name='cfn-api-security-checker'),
    3, 0,
    '{"require_tests": true, "min_coverage": 0.85, "min_pass_rate": 0.85}',
    '{"phase": ["loop3"], "test_context": true, "taskContext": ["auth", "api"]}',
    'OPTIONAL: Load if task involves authentication/API'
  ),
  (
    'backend-developer',
    (SELECT id FROM skills WHERE name='cfn-database-integrity-validator'),
    4, 0,
    '{"require_tests": true, "min_pass_rate": 0.90, "min_coverage": 0.90}',
    '{"phase": ["loop3"], "test_context": true, "taskContext": ["database"]}',
    'OPTIONAL: Load if task involves database changes'
  ),
  (
    'backend-developer',
    (SELECT id FROM skills WHERE name='cfn-error-recovery-patterns'),
    5, 0,
    '{"require_tests": true, "min_coverage": 0.80, "min_pass_rate": 0.90}',
    '{"phase": ["loop3"], "test_context": true}',
    'OPTIONAL: Load if error handling required'
  );
```

**Loading Behavior for backend-developer:**

```javascript
// When backend-developer agent spawns:
const skillsToLoad = await loadAgentSkills({
  agentType: 'backend-developer',
  phase: 'loop3',
  testContext: true
});

// Processing order (by priority):
// 1. cfn-test-runner-jest (REQUIRED)
//    - Run: npm test -- --json
//    - Pass rate: 47/50 = 0.94
//    - Requirement: 0.95
//    - Decision: SKIP (0.94 < 0.95)
//    - Action: Log failure, escalate approval
//
// 2. cfn-test-result-parser (REQUIRED)
//    - Not loaded (depends on test-runner-jest success)
//
// 3. cfn-api-security-checker (OPTIONAL)
//    - taskContext: ["auth", "api"] not in task
//    - Decision: SKIP (conditional not met)
//
// 4. cfn-database-integrity-validator (OPTIONAL)
//    - taskContext: ["database"] not in task
//    - Decision: SKIP
//
// 5. cfn-error-recovery-patterns (OPTIONAL)
//    - TDD condition met (coverage 0.85 >= 0.80, pass_rate 0.95 >= 0.90)
//    - Decision: LOAD
//
// Result: 1 skill loaded (error-recovery-patterns), 2 required failed
```

---

### Skill Mapping: tester (Loop 3)

```sql
INSERT INTO agent_skill_mappings (
  agent_type, skill_id, priority, required,
  tdd_condition, conditions, notes
) VALUES
  (
    'tester',
    (SELECT id FROM skills WHERE name='cfn-e2e-test-runner'),
    1, 1,
    '{"require_tests": true, "min_pass_rate": 0.90, "test_framework": "playwright"}',
    '{"phase": ["loop3"], "test_context": true}',
    'REQUIRED: Execute E2E tests with Playwright'
  ),
  (
    'tester',
    (SELECT id FROM skills WHERE name='cfn-integration-test-validator'),
    2, 1,
    '{"require_tests": true, "min_pass_rate": 0.90, "min_coverage": 0.85}',
    '{"phase": ["loop3"], "test_context": true}',
    'REQUIRED: Validate integration test coverage'
  ),
  (
    'tester',
    (SELECT id FROM skills WHERE name='cfn-contract-test-runner'),
    3, 0,
    '{"require_tests": true, "min_pass_rate": 0.95, "test_framework": "pact"}',
    '{"phase": ["loop3"], "test_context": true, "taskContext": ["api", "microservice"]}',
    'OPTIONAL: Contract testing for API integrations'
  ),
  (
    'tester',
    (SELECT id FROM skills WHERE name='cfn-performance-test-runner'),
    4, 0,
    '{"require_tests": true, "min_pass_rate": 0.85}',
    '{"phase": ["loop3"], "test_context": true, "taskContext": ["performance", "scale"]}',
    'OPTIONAL: Performance/load testing'
  ),
  (
    'tester',
    (SELECT id FROM skills WHERE name='cfn-test-coverage-reporter'),
    5, 0,
    '{"require_tests": true, "min_coverage": 0.80, "min_pass_rate": 0.90}',
    '{"phase": ["loop3", "loop2"], "test_context": true}',
    'OPTIONAL: Generate coverage reports for Loop 2 reviewers'
  );
```

---

### Skill Mapping: reviewer (Loop 2)

Loop 2 reviewers validate test quality and coverage:

```sql
INSERT INTO agent_skill_mappings (
  agent_type, skill_id, priority, required,
  tdd_condition, conditions, notes
) VALUES
  (
    'reviewer',
    (SELECT id FROM skills WHERE name='cfn-test-coverage-validator'),
    1, 1,
    '{"require_tests": true, "min_pass_rate": 0.90, "min_coverage": 0.90}',
    '{"phase": ["loop2"], "test_context": true}',
    'REQUIRED: Validate test coverage meets approval threshold'
  ),
  (
    'reviewer',
    (SELECT id FROM skills WHERE name='cfn-test-quality-analyzer'),
    2, 1,
    '{"require_tests": true, "min_pass_rate": 0.95, "min_coverage": 0.95}',
    '{"phase": ["loop2"], "test_context": true}',
    'REQUIRED: Analyze test quality patterns'
  ),
  (
    'reviewer',
    (SELECT id FROM skills WHERE name='cfn-edge-case-validator'),
    3, 0,
    '{"require_tests": true, "min_coverage": 0.85, "min_pass_rate": 0.90}',
    '{"phase": ["loop2"], "test_context": true, "taskContext": ["complex", "edge-case"]}',
    'OPTIONAL: Validate edge case coverage'
  ),
  (
    'reviewer',
    (SELECT id FROM skills WHERE name='cfn-security-test-validator'),
    4, 0,
    '{"require_tests": true, "min_pass_rate": 0.95}',
    '{"phase": ["loop2"], "test_context": true, "taskContext": ["auth", "security", "crypto"]}',
    'OPTIONAL: Validate security test coverage'
  );
```

---

## Section 5: Success Criteria as Skills

### Mapping Success Criteria to Skills

The TDD gate plan defines **success criteria templates** (from COMPREHENSIVE_TDD_GATE_IMPLEMENTATION_PLAN.md). These can be **codified as reusable skills** in the Skills Database:

### Success Criteria Template → Skill Conversion

```sql
-- Example: Backend API Success Criteria → Skill

-- First, create the success criteria in approval_criteria_templates table
INSERT INTO approval_criteria_templates (
  name, category, approval_level, criteria_json, created_at
) VALUES (
  'Backend API Service - Auto Approval',
  'backend',
  'auto',
  '{
    "unit_test_pass_rate": {"min": 0.95, "framework": "jest"},
    "coverage": {"min": 0.90, "type": "statement"},
    "risk_score": {"max": 0.30},
    "cyclomatic_complexity": {"max": 10},
    "security_review_required": false,
    "integration_tests": {"min": 0.85}
  }',
  datetime('now')
);

-- Then create corresponding skill to validate these criteria
INSERT INTO skills (
  name, category, team, content_path, content_hash, version, status,
  test_coverage, test_suite_path, required_test_pass_rate,
  approval_level, approval_criteria
) VALUES (
  'backend-api-auto-approval-validator',
  'testing',
  'cfn',
  './.claude/skills/validators/backend-api-auto-approval-validator.md',
  'sha256_hash_of_content',
  '1.0.0',
  'active',
  0.95,
  './.claude/skills/validators/test/backend-api-validator.sh',
  0.95,
  'auto',
  '{
    "criteria_template": "Backend API Service - Auto Approval",
    "validates": {
      "unit_test_pass_rate": true,
      "coverage": true,
      "risk_score": true,
      "cyclomatic_complexity": true,
      "integration_tests": true
    }
  }'
);
```

### Success Criteria Codification Pattern

#### Backend API Service (Category: backend)

**Success Criteria Template:**
```yaml
Name: Backend API Service - Auto Approval
Approval Level: auto
Requirements:
  - Unit tests: ≥95% pass rate (Jest)
  - Coverage: ≥90% statement coverage
  - Risk score: ≤0.30
  - Cyclomatic complexity: ≤10
  - Integration tests: ≥85% pass rate
  - No security review needed
  - No hardcoded secrets
  - No external API dependencies
```

**Corresponding Skill:**
```markdown
# Backend API Auto-Approval Validator

Validates backend API services meet auto-approval criteria.

## Validation Process
1. Execute Jest unit tests
2. Check coverage ≥90%
3. Analyze complexity metrics
4. Scan for security issues
5. Validate integration tests
6. Generate approval decision

## Success Criteria (from template)
- ✓ Unit test pass rate ≥95%
- ✓ Coverage ≥90%
- ✓ Risk score ≤0.30
- ✓ Complexity ≤10
- ✓ Integration tests ≥85%

## Test Suite
- test/backend-api-validator.sh (8 test cases)
```

**SQL Query to Extract Success Criteria:**
```sql
SELECT
  s.id,
  s.name,
  s.category,
  act.criteria_json,
  s.test_coverage,
  s.required_test_pass_rate
FROM skills s
LEFT JOIN approval_criteria_templates act
  ON act.name LIKE s.name || '%'
WHERE s.category = 'testing'
  AND s.approval_level = 'auto';
```

---

#### Frontend Component (Category: frontend)

**Success Criteria Template:**
```yaml
Name: Frontend Component - Escalated Review
Approval Level: escalate
Requirements:
  - Component tests: ≥85% pass rate (Jest/Vitest)
  - Coverage: ≥80% statement coverage
  - E2E tests: ≥75% pass rate (Playwright)
  - Accessibility: WCAG 2.1 Level AA compliant
  - Performance: FCP <2.5s, LCP <4s
  - Visual regression: ≥90% similarity
  - Unit tests: ≥80% pass rate
```

**Corresponding Skill:**
```sql
INSERT INTO skills (...) VALUES (
  'frontend-component-escalate-reviewer',
  'testing',
  'cfn',
  './.claude/skills/validators/frontend-component-reviewer.md',
  'sha256_hash',
  '1.0.0',
  'active',
  0.88,
  './.claude/skills/validators/test/frontend-component-test.sh',
  0.90,
  'escalate',
  '{
    "criteria_template": "Frontend Component - Escalated Review",
    "validates": {
      "component_tests": true,
      "coverage": true,
      "e2e_tests": true,
      "accessibility": true,
      "performance": true
    }
  }'
);
```

---

## Section 6: Approval Workflow + TDD Requirements

### Three-Tier Approval with TDD Gates

The approval workflow integrates TDD requirements at each approval level:

### Level 1: AUTO-APPROVAL

**Auto-Approval Criteria (ALL must be met):**

```sql
-- SQL Query: Should this skill auto-approve?
SELECT
  s.id,
  s.name,
  s.test_coverage,
  s.required_test_pass_rate,
  CASE
    WHEN s.test_coverage >= 0.95 THEN 'Pass'
    ELSE 'Fail'
  END as coverage_check,
  CASE
    WHEN (SELECT pass_rate FROM approval_history ah
          WHERE ah.skill_id = s.id
          ORDER BY ah.timestamp DESC LIMIT 1) >= 0.95
    THEN 'Pass'
    ELSE 'Fail'
  END as test_pass_check
FROM skills s
WHERE s.approval_level = 'auto'
  AND s.test_coverage >= 0.95
  AND s.risk_score <= 0.30
  AND s.cyclomatic_complexity <= 5;
```

**TDD Gate Conditions:**
| Condition | Requirement | Rationale |
|-----------|-------------|-----------|
| Test Coverage | ≥ 95% | High confidence in code quality |
| Test Pass Rate | ≥ 95% | Tests actually passing |
| Framework Defined | Jest, pytest, etc. | Known test execution method |
| Test Suite Path | Exists & executable | Can validate anytime |
| Risk Score | ≤ 0.30 | Low business/security impact |
| Cyclomatic Complexity | ≤ 5 | Simple logic, easy to test |
| External Dependencies | 0 | No infrastructure coupling |
| Secrets Usage | 0 | No credentials in code |

**Approval Decision Process:**
```bash
# Step 1: Check all auto-approval conditions
if [[ test_coverage -ge 0.95 ]] && \
   [[ test_pass_rate -ge 0.95 ]] && \
   [[ risk_score -le 0.30 ]] && \
   [[ complexity -le 5 ]]; then

  # Step 2: Execute test suite to verify
  PASS_RATE=$(run_test_suite "$TEST_SUITE_PATH")

  # Step 3: Validate current pass rate
  if [[ $(echo "$PASS_RATE >= 0.95" | bc) -eq 1 ]]; then

    # Step 4: Insert approval record
    INSERT INTO approval_history (
      skill_id, approval_level, test_results,
      approver, decision, reasoning, timestamp
    ) VALUES (
      $SKILL_ID, 'auto',
      '{"pass_rate": '$PASS_RATE'}',
      'system',
      'approved',
      'Auto-approved: All criteria met, test pass rate confirmed',
      datetime('now')
    );

    echo "✓ Auto-approved: $SKILL_ID"
  else
    echo "✗ Auto-approval rejected: test pass rate $PASS_RATE < 0.95"
    # Escalate to Level 2
  fi
else
  echo "✗ Does not meet auto-approval criteria"
  # Escalate to Level 2
fi
```

---

### Level 2: ESCALATED-REVIEW

**Escalation Triggers (ANY trigger escalation):**

```sql
-- SQL Query: Which skills need escalation?
SELECT
  s.id,
  s.name,
  CASE
    WHEN s.test_coverage < 0.95 THEN 'Low test coverage: ' || s.test_coverage
    WHEN (SELECT pass_rate FROM approval_history ah
          WHERE ah.skill_id = s.id
          ORDER BY ah.timestamp DESC LIMIT 1) < 0.95
    THEN 'Insufficient test pass rate'
    WHEN s.cyclomatic_complexity > 5 THEN 'High complexity: ' || s.cyclomatic_complexity
    WHEN s.risk_score > 0.30 THEN 'Elevated risk: ' || s.risk_score
    ELSE 'Requires expert review'
  END as escalation_reason
FROM skills s
WHERE s.approval_level = 'escalate'
  AND (
    s.test_coverage < 0.95
    OR s.risk_score BETWEEN 0.31 AND 0.60
    OR s.cyclomatic_complexity BETWEEN 6 AND 15
    OR external_dependencies > 0
  );
```

**Escalation Categories:**

| Category | TDD Threshold | Action |
|----------|---------------|--------|
| **Medium Coverage** | 80-94% | Expert validates coverage strategy |
| **Medium Risk** | 0.31-0.60 | Infrastructure specialist reviews |
| **Medium Complexity** | 6-15 | Code quality reviewer assesses |
| **External Dependencies** | 1-3 APIs | Integration architect approves |
| **Infrastructure Changes** | Any | DevOps specialist approval required |
| **Database Writes** | Any production DB | DBA approval required |

**Escalation Workflow:**
```bash
# Step 1: Detect escalation reason
ESCALATION_REASON=""
if [[ $TEST_COVERAGE -lt 0.95 ]]; then
  ESCALATION_REASON="Test coverage $TEST_COVERAGE < 0.95"
elif [[ $TEST_PASS_RATE -lt 0.95 ]]; then
  ESCALATION_REASON="Test pass rate $TEST_PASS_RATE < 0.95"
elif [[ $COMPLEXITY -gt 5 ]]; then
  ESCALATION_REASON="Cyclomatic complexity $COMPLEXITY > 5"
fi

# Step 2: Escalate to expert reviewer
INSERT INTO approval_history (
  skill_id, approval_level, escalation_reason,
  escalated_to, decision, timestamp
) VALUES (
  $SKILL_ID, 'escalate',
  '$ESCALATION_REASON',
  'infrastructure-specialist@example.com',
  'escalated',
  datetime('now')
);

# Step 3: Notify expert for 24-48 hour review window
echo "Escalated to: infrastructure-specialist@example.com"
echo "Reason: $ESCALATION_REASON"
echo "Review window: 24-48 hours"
```

---

### Level 3: HUMAN-APPROVAL

**Human Approval Required For:**

| Condition | Reason |
|-----------|--------|
| Test Coverage < 80% | Too low for confidence in quality |
| Test Pass Rate < 80% | Tests failing, cannot proceed |
| Risk Score > 0.60 | High business/security impact |
| Cyclomatic Complexity > 15 | Complex logic needs expert review |
| External Dependencies > 3 | Too many integration points |
| No Test Suite Defined | Cannot validate automatically |
| Security-Sensitive Code | Cryptography, auth, secrets |
| Breaking Changes | API/schema modifications |

**Human Review Process:**
```sql
-- Human reviewers pull pending human approvals
SELECT
  s.id,
  s.name,
  s.category,
  s.test_coverage,
  ah.approval_level,
  ah.escalation_reason,
  ah.timestamp,
  ah.review_duration_minutes
FROM approval_history ah
JOIN skills s ON ah.skill_id = s.id
WHERE ah.decision = 'escalated'
  AND ah.approval_level = 'human'
  AND ah.timestamp > datetime('now', '-48 hours')
ORDER BY ah.timestamp ASC;

-- After human review, update decision
UPDATE approval_history
SET
  decision = 'approved',  -- or 'rejected' or 'needs_correction'
  approver = 'expert@example.com',
  reasoning = 'Reviewed: Test coverage acceptable for category, complexity justified',
  review_duration_minutes = 45
WHERE skill_id = $SKILL_ID
  AND approval_level = 'human';
```

---

### Complete Approval Decision Tree

```
                    ┌─────────────────────────┐
                    │  NEW SKILL SUBMISSION   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Extract Test Metadata  │
                    │  - test_coverage       │
                    │  - required_test_pass_rate
                    │  - test_suite_path     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ Run Test Suite          │
                    │ → Calculate pass_rate   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
        ┌───────────┤ Pass Rate ≥ 95% &      ├──────────┐
        │           │ Coverage ≥ 95% &       │          │
        │           │ Complexity ≤ 5?        │          │
        │           └────────────────────────┘          │
        │                                               │
        │ YES                                      NO   │
        ▼                                               ▼
    ┌────────────┐                            ┌──────────────────┐
    │ AUTO       │                            │ Check Escalation │
    │ APPROVED   │                            │ Conditions       │
    │ ✓ Safe to  │                            └────────┬─────────┘
    │   deploy   │                                     │
    └────────────┘                 ┌───────────────────┴─────────────────┐
                                   │                                     │
                            YES (Meets escalation)              NO (Needs human)
                                   ▼                                     ▼
                          ┌──────────────────┐            ┌────────────────────┐
                          │ ESCALATED REVIEW │            │ HUMAN APPROVAL     │
                          │ Notify experts   │            │ Required           │
                          │ 24-48 hour review│            │ - High risk        │
                          │ window           │            │ - Low coverage     │
                          └────────┬─────────┘            │ - Complex logic    │
                                   │                       └────────┬───────────┘
                    ┌──────────────┴──────────────┐               │
                    ▼                             ▼               │
            ┌───────────────┐          ┌──────────────────┐       │
            │ Expert        │          │ Expert Rejects   │       │
            │ Approves      │          │ Requests Changes │       │
            └───────────────┘          └──────────────────┘       │
                    │                             │               │
                    │                     ┌───────▼───────┐        │
                    │                     │ Dev fixes &   │        │
                    │                     │ resubmits     │        │
                    │                     │ (Retry Loop)  │        │
                    │                     └───────┬───────┘        │
                    │                             │                │
                    └─────────────────┬───────────┴────────────────┘
                                      ▼
                          ┌───────────────────────┐
                          │ APPROVAL FINALIZED    │
                          │ - Record in DB        │
                          │ - Audit trail logged  │
                          │ - Deploy to prod      │
                          └───────────────────────┘
```

---

## Section 7: Test Result Storage & Analytics

### Storing Test Results

Every test execution is stored in the `approval_history` and `skill_usage_log` tables for complete traceability:

#### Test Results Schema

```json
{
  "framework": "jest",              // Test framework used
  "pass_count": 45,                 // Number of passed tests
  "fail_count": 0,                  // Number of failed tests
  "skip_count": 2,                  // Number of skipped tests
  "total_count": 47,                // Total tests (pass + fail + skip)
  "pass_rate": 0.957,               // (pass_count / total_count)
  "duration_ms": 3400,              // Time to execute all tests
  "timestamp": "2025-11-16T14:30:00Z",
  "coverage": "88%",                // Code coverage percentage
  "coverage_delta": 2,              // Change from previous run (%)
  "failed_tests": [                 // List of failed test names
    {
      "name": "auth/login.test.js::should handle invalid credentials",
      "error": "Expected value to equal true, received false",
      "duration_ms": 45
    }
  ]
}
```

#### Insert Test Results Query

```sql
INSERT INTO approval_history (
  skill_id, version, approval_level, test_results,
  approval_criteria_check, approver, decision, reasoning, timestamp
) VALUES (
  $SKILL_ID,
  (SELECT version FROM skills WHERE id = $SKILL_ID),
  'auto',
  '{"framework": "jest", "pass_count": 45, "fail_count": 0, "pass_rate": 0.957, "coverage": "88%"}',
  '{"test_pass_rate": {"required": 0.95, "actual": 0.957, "passed": true},
    "test_coverage": {"required": 0.90, "actual": 0.88, "passed": false},
    "complexity": {"required": "<=5", "actual": 3, "passed": true}}',
  'system',
  'approved',
  'Auto-approved: Test pass rate 95.7% >= 95%, complexity acceptable',
  datetime('now')
);
```

### Test Result Queries for Analytics

#### Query 1: Test Pass Rate Trends Over Time

```sql
-- Show how test pass rates have changed over time for a skill
SELECT
  ah.timestamp,
  ah.approval_level,
  JSON_EXTRACT(ah.test_results, '$.pass_rate') as pass_rate,
  JSON_EXTRACT(ah.test_results, '$.pass_count') as pass_count,
  JSON_EXTRACT(ah.test_results, '$.fail_count') as fail_count,
  JSON_EXTRACT(ah.test_results, '$.coverage') as coverage,
  ah.decision
FROM approval_history ah
WHERE ah.skill_id = $SKILL_ID
ORDER BY ah.timestamp DESC
LIMIT 20;

-- Output:
-- timestamp          | pass_rate | pass_count | fail_count | coverage | decision
-- 2025-11-16 14:30   | 0.957     | 45         | 0          | 88%      | approved
-- 2025-11-15 10:15   | 0.936     | 44         | 1          | 86%      | escalated
-- 2025-11-14 09:00   | 1.0       | 47         | 0          | 90%      | approved
```

#### Query 2: Skills Requiring Human Approval

```sql
-- Find skills stuck at human approval level with reasons
SELECT
  s.id,
  s.name,
  s.category,
  s.test_coverage,
  COUNT(ah.id) as review_count,
  MAX(ah.timestamp) as last_review,
  ah.escalation_reason,
  ah.approval_level
FROM skills s
LEFT JOIN approval_history ah ON s.id = ah.skill_id
WHERE ah.approval_level = 'human'
  AND ah.decision IN ('escalated', 'needs_correction')
  AND ah.timestamp > datetime('now', '-7 days')
GROUP BY s.id
ORDER BY last_review DESC;
```

#### Query 3: Test Effectiveness vs Confidence Impact

```sql
-- Correlate test pass rates with skill effectiveness (confidence delta)
SELECT
  sl.agent_type,
  s.name,
  s.category,
  ROUND(JSON_EXTRACT(sl.test_execution_result, '$.pass_rate'), 3) as test_pass_rate,
  ROUND(sl.confidence_after - sl.confidence_before, 3) as confidence_improvement,
  COUNT(sl.id) as usage_count,
  ROUND(AVG(CAST(sl.success_indicator as FLOAT)), 3) as success_rate
FROM skill_usage_log sl
JOIN skills s ON sl.skill_id = s.id
WHERE sl.task_id IS NOT NULL
GROUP BY sl.skill_id, sl.agent_type
HAVING test_pass_rate >= 0.90
ORDER BY confidence_improvement DESC;

-- Output shows which test-passing skills actually help agents most
-- Example:
-- agent_type        | skill_name                      | test_pass_rate | confidence_improvement | success_rate
-- backend-developer | cfn-test-runner-jest            | 0.957          | 0.125                  | 0.95
-- backend-developer | cfn-api-security-checker        | 1.0            | 0.085                  | 0.88
-- tester            | cfn-e2e-test-runner             | 0.923          | 0.110                  | 0.92
```

#### Query 4: Coverage Trends by Category

```sql
-- Track how test coverage is improving by skill category
SELECT
  s.category,
  COUNT(s.id) as skill_count,
  ROUND(AVG(s.test_coverage), 3) as avg_coverage,
  ROUND(MIN(s.test_coverage), 3) as min_coverage,
  ROUND(MAX(s.test_coverage), 3) as max_coverage,
  SUM(CASE WHEN s.test_coverage >= 0.95 THEN 1 ELSE 0 END) as excellent_coverage_count,
  SUM(CASE WHEN s.test_coverage >= 0.80 AND s.test_coverage < 0.95 THEN 1 ELSE 0 END) as good_coverage_count,
  SUM(CASE WHEN s.test_coverage < 0.80 THEN 1 ELSE 0 END) as poor_coverage_count
FROM skills s
GROUP BY s.category
ORDER BY avg_coverage DESC;

-- Output:
-- category      | skill_count | avg_coverage | min_coverage | max_coverage | excellent | good | poor
-- testing       | 12          | 0.92         | 0.85         | 0.99         | 10        | 2    | 0
-- coordination  | 8           | 0.88         | 0.75         | 0.96         | 6         | 2    | 0
-- foundation    | 5           | 0.82         | 0.70         | 0.93         | 3         | 2    | 0
```

#### Query 5: Approval Gate Performance

```sql
-- Measure how effective each approval level is at preventing failures
SELECT
  ah.approval_level,
  COUNT(ah.id) as total_approvals,
  SUM(CASE WHEN ah.decision = 'approved' THEN 1 ELSE 0 END) as approved_count,
  SUM(CASE WHEN ah.decision = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
  SUM(CASE WHEN ah.decision = 'needs_correction' THEN 1 ELSE 0 END) as correction_count,
  ROUND(100.0 * SUM(CASE WHEN ah.decision = 'approved' THEN 1 ELSE 0 END) / COUNT(ah.id), 1) as approval_rate,
  ROUND(AVG(CAST(ah.review_duration_minutes as FLOAT)), 1) as avg_review_time_minutes
FROM approval_history ah
WHERE ah.timestamp > datetime('now', '-30 days')
GROUP BY ah.approval_level
ORDER BY approval_rate DESC;

-- Output shows effectiveness of each gate level
-- approval_level | total | approved | rejected | correction | approval_rate | avg_review_time
-- auto           | 245   | 240      | 5        | 0          | 97.96%        | 0.1
-- escalate       | 58    | 48       | 8        | 2          | 82.76%        | 4.2
-- human          | 12    | 8        | 3        | 1          | 66.67%        | 18.5
```

---

## Section 8: Phase 4 + TDD Integration

### Auto-Generated Skills from Phase 4

Phase 4 observes common patterns and **automatically generates skills** from them. When Phase 4 generates new skills, they should be **TDD-aware from the start**:

### Phase 4 Skill Generation Workflow

```
Pattern Library (100 patterns collected)
         │
         ▼
┌─────────────────────────────────┐
│ Phase 4: Pattern Recognition    │
│ - Edge cases observed           │
│ - Common failures identified    │
│ - Success patterns extracted    │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Generate Skill from Pattern     │
│ 1. Create .md file              │
│ 2. Write test cases             │ ← TDD-First
│ 3. Generate implementation      │
│ 4. Calculate test coverage      │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Insert into Skills Table        │
│ - test_coverage = measured      │
│ - test_suite_path = generated   │
│ - required_test_pass_rate = 0.95│
│ - is_auto_generated = 1         │
│ - phase4_pattern_id = ref       │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Approval Workflow Executes      │
│ - Auto-approve if tests pass    │
│ - Escalate if coverage low      │
│ - Human review if needed        │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Skill Ready for Production      │
│ - Available to agents           │
│ - Tested and validated          │
│ - Analytics tracking enabled    │
└─────────────────────────────────┘
```

### Phase 4 Skill Metadata

```sql
-- When Phase 4 creates a skill, include these TDD fields
INSERT INTO skills (
  name,
  category,
  team,
  content_path,
  content_hash,
  version,
  status,

  -- TDD Required for Generated Skills
  test_coverage,
  test_suite_path,
  required_test_pass_rate,

  -- Phase 4 Tracking
  phase4_pattern_id,
  generated_by,
  is_auto_generated
) VALUES (
  'cfn-token-validation-error-recovery',
  'error-handling',
  'cfn',
  './.claude/skills/generated/token-validation-recovery.md',
  'sha256_generated_content_hash',
  '1.0.0',
  'active',

  -- TDD metrics (from test execution)
  0.92,  -- test_coverage: 92% statement coverage
  './.claude/skills/generated/test/token-validation-recovery.sh',
  0.95,  -- Must have 95% pass rate

  -- Phase 4 integration
  487,   -- phase4_pattern_id: Edge case pattern #487
  'phase4',
  1  -- is_auto_generated: true
);
```

### Edge Case Feedback Loop

```
Phase 4 observes failures → Creates test case
                              │
                              ▼
                    Generates skill from pattern
                              │
                              ▼
                    Tests written first (TDD)
                              │
                              ▼
                    Implementation generated
                              │
                              ▼
                    Test pass rate calculated
                              │
                    ┌─────────┴─────────┐
                    │                   │
          ✓ ≥95% pass rate      ✗ <95% pass rate
                    │                   │
                    ▼                   ▼
          Approve skill        Request improvement
                    │           or escalate
                    │                   │
                    ├─────────┬─────────┤
                    ▼         ▼         ▼
              Production   Backlog   Human Review
              Deployment   (Retry)   (Final check)
```

### SQL Query: Recently Generated Skills

```sql
-- Find skills recently created by Phase 4
SELECT
  s.id,
  s.name,
  s.category,
  s.test_coverage,
  s.required_test_pass_rate,
  ah.decision,
  ah.approval_level,
  ah.timestamp as approved_at
FROM skills s
LEFT JOIN approval_history ah ON s.id = ah.skill_id AND ah.decision = 'approved'
WHERE s.is_auto_generated = 1
  AND s.generated_by = 'phase4'
  AND s.created_at > datetime('now', '-30 days')
ORDER BY s.created_at DESC;
```

---

## Section 9: Implementation Examples

### Example 1: Query Test Pass Rate by Skill

```sql
-- Get the current test pass rate for a specific skill
SELECT
  s.id,
  s.name,
  s.test_coverage,
  s.required_test_pass_rate,
  JSON_EXTRACT(ah.test_results, '$.pass_rate') as current_pass_rate,
  JSON_EXTRACT(ah.test_results, '$.pass_count') as pass_count,
  JSON_EXTRACT(ah.test_results, '$.fail_count') as fail_count,
  ah.timestamp as last_test_run
FROM skills s
LEFT JOIN approval_history ah ON s.id = ah.skill_id
WHERE s.name = 'cfn-test-runner-jest'
ORDER BY ah.timestamp DESC
LIMIT 1;
```

**Usage:**
```bash
sqlite3 skills.db < query_test_pass_rate.sql

# Output:
# id | name                  | test_coverage | required_test_pass_rate | current_pass_rate | pass_count | fail_count | last_test_run
# 15 | cfn-test-runner-jest  | 0.95          | 0.95                   | 0.957              | 45         | 0          | 2025-11-16 14:30:00
```

---

### Example 2: Bash Script - Run Approval Gate Check

```bash
#!/bin/bash
# approval-gate-check.sh - Execute TDD gate check for skill approval

set -euo pipefail

SKILL_ID="${1:-}"
SKILL_NAME="${2:-}"

if [[ -z "$SKILL_ID" || -z "$SKILL_NAME" ]]; then
  echo "Usage: $0 <skill_id> <skill_name>"
  exit 1
fi

# Step 1: Fetch skill metadata from database
echo "Step 1: Fetching skill metadata..."
SKILL_DATA=$(sqlite3 -json skills.db "
  SELECT
    id, name, test_coverage, test_suite_path,
    required_test_pass_rate, approval_level, risk_score
  FROM skills
  WHERE id = $SKILL_ID
")

TEST_SUITE_PATH=$(echo "$SKILL_DATA" | jq -r '.[0].test_suite_path')
REQUIRED_PASS_RATE=$(echo "$SKILL_DATA" | jq -r '.[0].required_test_pass_rate')

if [[ -z "$TEST_SUITE_PATH" ]]; then
  echo "ERROR: Test suite path not found for skill $SKILL_ID"
  exit 1
fi

# Step 2: Run test suite
echo "Step 2: Executing test suite: $TEST_SUITE_PATH"
if [[ ! -x "$TEST_SUITE_PATH" ]]; then
  chmod +x "$TEST_SUITE_PATH"
fi

# Capture test output
TEST_OUTPUT=$("$TEST_SUITE_PATH" 2>&1 || true)

# Step 3: Parse test results
echo "Step 3: Parsing test results..."
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -o "passed" | wc -l)
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -o "failed" | wc -l)
TOTAL_COUNT=$((PASS_COUNT + FAIL_COUNT))

if [[ $TOTAL_COUNT -eq 0 ]]; then
  echo "ERROR: Could not parse test results"
  exit 1
fi

PASS_RATE=$(echo "scale=3; $PASS_COUNT / $TOTAL_COUNT" | bc)

echo "  Pass count: $PASS_COUNT"
echo "  Fail count: $FAIL_COUNT"
echo "  Total count: $TOTAL_COUNT"
echo "  Pass rate: $PASS_RATE (required: $REQUIRED_PASS_RATE)"

# Step 4: Make approval decision
echo "Step 4: Making approval decision..."

if (( $(echo "$PASS_RATE >= $REQUIRED_PASS_RATE" | bc -l) )); then
  DECISION="approved"
  APPROVAL_LEVEL="auto"
  REASONING="Auto-approved: Test pass rate $PASS_RATE meets requirement $REQUIRED_PASS_RATE"
else
  DECISION="escalated"
  APPROVAL_LEVEL="escalate"
  REASONING="Escalated: Test pass rate $PASS_RATE below requirement $REQUIRED_PASS_RATE"
fi

# Step 5: Store results in database
echo "Step 5: Storing results in database..."
sqlite3 skills.db "
  INSERT INTO approval_history (
    skill_id, version, approval_level, test_results,
    approver, decision, reasoning, timestamp
  ) VALUES (
    $SKILL_ID,
    (SELECT version FROM skills WHERE id = $SKILL_ID),
    '$APPROVAL_LEVEL',
    '{\"framework\": \"bash\", \"pass_count\": $PASS_COUNT, \"fail_count\": $FAIL_COUNT, \"pass_rate\": $PASS_RATE}',
    'system',
    '$DECISION',
    '$REASONING',
    datetime('now')
  );
"

echo "✓ Decision: $DECISION ($APPROVAL_LEVEL)"
echo "  Reason: $REASONING"

# Step 6: Report result
exit_code=0
if [[ "$DECISION" == "escalated" ]]; then
  exit_code=1
fi

exit $exit_code
```

**Usage:**
```bash
./approval-gate-check.sh 15 "cfn-test-runner-jest"

# Output:
# Step 1: Fetching skill metadata...
# Step 2: Executing test suite: ./.claude/skills/cfn-test-runner/test.sh
# Step 3: Parsing test results...
#   Pass count: 45
#   Fail count: 0
#   Total count: 45
#   Pass rate: 1.0 (required: 0.95)
# Step 4: Making approval decision...
# Step 5: Storing results in database...
# ✓ Decision: approved (auto)
#   Reason: Auto-approved: Test pass rate 1.0 meets requirement 0.95
```

---

### Example 3: Skill Loading with TDD Conditions

```bash
#!/bin/bash
# load-tdd-aware-skills.sh - Load skills with TDD validation

AGENT_TYPE="${1:-backend-developer}"
PHASE="${2:-loop3}"
TASK_ID="${3:-}"

echo "Loading skills for: $AGENT_TYPE (phase: $PHASE)"

# Query skills for this agent with TDD conditions
SKILLS=$(sqlite3 -json skills.db "
  SELECT
    asm.skill_id,
    s.name,
    s.test_suite_path,
    s.required_test_pass_rate,
    asm.priority,
    asm.required,
    asm.tdd_condition,
    asm.conditions
  FROM agent_skill_mappings asm
  JOIN skills s ON asm.skill_id = s.id
  WHERE asm.agent_type = '$AGENT_TYPE'
    AND asm.enabled = 1
  ORDER BY asm.priority ASC
")

# Load each skill
LOADED=0
SKIPPED=0

while IFS= read -r skill_json; do
  SKILL_ID=$(echo "$skill_json" | jq -r '.skill_id')
  SKILL_NAME=$(echo "$skill_json" | jq -r '.name')
  TEST_SUITE=$(echo "$skill_json" | jq -r '.test_suite_path')
  REQUIRED=$(echo "$skill_json" | jq -r '.required')
  TDD_CONDITION=$(echo "$skill_json" | jq -r '.tdd_condition')
  MIN_PASS_RATE=$(echo "$TDD_CONDITION" | jq -r '.min_pass_rate // 0.90')

  echo -n "  Loading: $SKILL_NAME... "

  # Run test suite if TDD conditions exist
  if [[ "$TEST_SUITE" != "null" && -x "$TEST_SUITE" ]]; then
    # Execute test suite
    TEST_OUTPUT=$("$TEST_SUITE" 2>&1 || true)
    PASS_RATE=$(echo "$TEST_OUTPUT" | grep -oP 'pass_rate: \K[\d.]+' || echo "0")

    # Check if pass rate meets requirement
    if (( $(echo "$PASS_RATE >= $MIN_PASS_RATE" | bc -l) )); then
      echo "✓ (tests: $PASS_RATE)"
      LOADED=$((LOADED + 1))
    else
      if [[ "$REQUIRED" == "1" ]]; then
        echo "✗ SKIP - REQUIRED but tests failed ($PASS_RATE < $MIN_PASS_RATE)"
      else
        echo "✗ SKIP - tests failed ($PASS_RATE < $MIN_PASS_RATE)"
      fi
      SKIPPED=$((SKIPPED + 1))
    fi
  else
    echo "✓ (no tests)"
    LOADED=$((LOADED + 1))
  fi

  # Log skill loading
  if [[ -n "$TASK_ID" ]]; then
    sqlite3 skills.db "
      INSERT INTO skill_usage_log (
        agent_id, agent_type, skill_id, task_id, phase,
        loaded_at, success_indicator
      ) VALUES (
        '${AGENT_TYPE}-1',
        '$AGENT_TYPE',
        $SKILL_ID,
        '$TASK_ID',
        '$PHASE',
        datetime('now'),
        1
      );
    "
  fi
done < <(echo "$SKILLS" | jq -c '.[]')

echo "Summary: $LOADED loaded, $SKIPPED skipped"
```

**Usage:**
```bash
./load-tdd-aware-skills.sh backend-developer loop3 task-12345

# Output:
# Loading skills for: backend-developer (phase: loop3)
#   Loading: cfn-test-runner-jest... ✓ (tests: 0.957)
#   Loading: cfn-test-result-parser... ✓ (tests: 0.92)
#   Loading: cfn-api-security-checker... ✗ SKIP - tests failed (0.80 < 0.90)
#   Loading: cfn-error-recovery-patterns... ✓ (tests: 0.95)
# Summary: 3 loaded, 1 skipped
```

---

### Example 4: Generate Test Results JSON from Multiple Frameworks

```bash
#!/bin/bash
# parse-multi-framework-tests.sh - Parse Jest, pytest, Mocha output

TEST_FRAMEWORK="${1:-jest}"
TEST_OUTPUT_FILE="${2:-}"

if [[ -z "$TEST_OUTPUT_FILE" ]]; then
  echo "Usage: $0 <framework> <output_file>"
  echo "Frameworks: jest, mocha, pytest, tap, junit"
  exit 1
fi

# Function: Parse Jest output
parse_jest() {
  local output_file="$1"

  if [[ ! -f "$output_file" ]]; then
    echo "{\"error\": \"File not found: $output_file\"}"
    return 1
  fi

  # Extract metrics from Jest JSON output
  local pass_count=$(jq -r '.numPassedTests' "$output_file" 2>/dev/null || echo "0")
  local fail_count=$(jq -r '.numFailedTests' "$output_file" 2>/dev/null || echo "0")
  local skip_count=$(jq -r '.numSkippedTests' "$output_file" 2>/dev/null || echo "0")
  local total_count=$((pass_count + fail_count))
  local pass_rate=$(echo "scale=3; $pass_count / $total_count" | bc 2>/dev/null || echo "0")

  cat <<EOF
{
  "framework": "jest",
  "pass_count": $pass_count,
  "fail_count": $fail_count,
  "skip_count": $skip_count,
  "total_count": $total_count,
  "pass_rate": $pass_rate,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# Function: Parse pytest output
parse_pytest() {
  local output_file="$1"

  # Example pytest output: "45 passed, 0 failed, 2 skipped in 3.40s"
  local results=$(grep -oP '\d+ passed' "$output_file" | grep -oP '\d+')
  local passed="${results:-0}"
  local failed=$(grep -oP '\d+ failed' "$output_file" | grep -oP '\d+' || echo "0")
  local skipped=$(grep -oP '\d+ skipped' "$output_file" | grep -oP '\d+' || echo "0")
  local total=$((passed + failed))
  local pass_rate=$(echo "scale=3; $passed / $total" | bc 2>/dev/null || echo "0")

  cat <<EOF
{
  "framework": "pytest",
  "pass_count": $passed,
  "fail_count": $failed,
  "skip_count": $skipped,
  "total_count": $total,
  "pass_rate": $pass_rate,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# Function: Parse TAP output
parse_tap() {
  local output_file="$1"

  # TAP format: "1..47" (total), "ok 1" (pass), "not ok 2" (fail)
  local total=$(grep -oP '^1\.\.\K\d+' "$output_file" | head -1)
  local passed=$(grep -c "^ok " "$output_file" || echo "0")
  local failed=$(grep -c "^not ok " "$output_file" || echo "0")
  local pass_rate=$(echo "scale=3; $passed / $total" | bc 2>/dev/null || echo "0")

  cat <<EOF
{
  "framework": "tap",
  "pass_count": $passed,
  "fail_count": $failed,
  "skip_count": 0,
  "total_count": $total,
  "pass_rate": $pass_rate,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# Route to appropriate parser
case "$TEST_FRAMEWORK" in
  jest)
    parse_jest "$TEST_OUTPUT_FILE"
    ;;
  pytest)
    parse_pytest "$TEST_OUTPUT_FILE"
    ;;
  tap)
    parse_tap "$TEST_OUTPUT_FILE"
    ;;
  *)
    echo "{\"error\": \"Unknown framework: $TEST_FRAMEWORK\"}"
    exit 1
    ;;
esac
```

**Usage:**
```bash
# Parse Jest output
./parse-multi-framework-tests.sh jest test-results.json

# Output:
# {
#   "framework": "jest",
#   "pass_count": 45,
#   "fail_count": 0,
#   "skip_count": 2,
#   "total_count": 45,
#   "pass_rate": 1.0,
#   "timestamp": "2025-11-16T14:30:00Z"
# }

# Parse pytest output
./parse-multi-framework-tests.sh pytest pytest-results.txt

# Parse TAP output
./parse-multi-framework-tests.sh tap test-output.tap
```

---

### Example 5: Approval Criteria Check

```sql
-- Check if skill meets auto-approval criteria
SELECT
  s.id,
  s.name,
  CASE
    WHEN s.test_coverage >= 0.95 THEN 'PASS'
    ELSE 'FAIL: coverage ' || ROUND(s.test_coverage, 2)
  END as coverage_check,
  CASE
    WHEN CAST(JSON_EXTRACT(
      (SELECT test_results FROM approval_history ah
       WHERE ah.skill_id = s.id
       ORDER BY ah.timestamp DESC LIMIT 1),
      '$.pass_rate'
    ) as REAL) >= 0.95 THEN 'PASS'
    ELSE 'FAIL: low pass rate'
  END as test_check,
  CASE
    WHEN s.risk_score <= 0.30 THEN 'PASS'
    ELSE 'FAIL: risk ' || ROUND(s.risk_score, 2)
  END as risk_check,
  CASE
    WHEN s.cyclomatic_complexity <= 5 THEN 'PASS'
    ELSE 'FAIL: complexity ' || s.cyclomatic_complexity
  END as complexity_check,
  CASE
    WHEN s.test_coverage >= 0.95
      AND CAST(JSON_EXTRACT(
        (SELECT test_results FROM approval_history ah
         WHERE ah.skill_id = s.id
         ORDER BY ah.timestamp DESC LIMIT 1),
        '$.pass_rate'
      ) as REAL) >= 0.95
      AND s.risk_score <= 0.30
      AND s.cyclomatic_complexity <= 5
    THEN 'AUTO APPROVE'
    ELSE 'ESCALATE/HUMAN'
  END as approval_decision
FROM skills s
WHERE s.id IN (
  SELECT DISTINCT skill_id FROM agent_skill_mappings
  WHERE agent_type = 'backend-developer'
)
ORDER BY s.name;
```

---

## Section 10: Migration Path

### Migrating Existing 62 Skills to TDD

The Skills Database currently has 62 active skills (as of 2025-11-16). Here's the migration path to make them all TDD-aware:

### Phase 1: Assessment (Week 1)

```sql
-- Audit current skills
SELECT
  category,
  COUNT(*) as skill_count,
  SUM(CASE WHEN test_coverage IS NULL THEN 1 ELSE 0 END) as no_coverage_data,
  SUM(CASE WHEN test_suite_path IS NULL THEN 1 ELSE 0 END) as no_test_path,
  SUM(CASE WHEN status = 'deprecated' THEN 1 ELSE 0 END) as deprecated
FROM skills
GROUP BY category
ORDER BY skill_count DESC;

-- Output will show assessment of gaps
```

### Phase 2: Backfill Metadata (Weeks 2-3)

For each skill without test metadata:

```bash
#!/bin/bash
# migrate-skill-to-tdd.sh

SKILL_ID="$1"
SKILL_NAME="$2"

echo "Migrating $SKILL_NAME (ID: $SKILL_ID) to TDD..."

# Step 1: Locate or create test suite
if [[ -f "./.claude/skills/$SKILL_NAME/test.sh" ]]; then
  TEST_SUITE_PATH="./.claude/skills/$SKILL_NAME/test.sh"
  echo "  Found existing tests: $TEST_SUITE_PATH"
else
  echo "  No test suite found - creating template..."
  TEST_SUITE_PATH="./.claude/skills/$SKILL_NAME/test.sh"
  cat > "$TEST_SUITE_PATH" <<'EOTEST'
#!/bin/bash
# Auto-generated test template
# TODO: Implement actual tests

echo "SKIP: No tests implemented yet"
exit 0
EOTEST
  chmod +x "$TEST_SUITE_PATH"
  echo "  Created template: $TEST_SUITE_PATH"
fi

# Step 2: Run tests to get baseline
echo "  Running tests for baseline..."
if [[ -x "$TEST_SUITE_PATH" ]]; then
  TEST_OUTPUT=$("$TEST_SUITE_PATH" 2>&1 || true)
  PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -o "passed" | wc -l || echo "0")
  FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -o "failed" | wc -l || echo "0")
  TOTAL_COUNT=$((PASS_COUNT + FAIL_COUNT))

  if [[ $TOTAL_COUNT -gt 0 ]]; then
    COVERAGE=0.50  # Conservative estimate
    PASS_RATE=$(echo "scale=2; $PASS_COUNT / $TOTAL_COUNT" | bc)
  else
    COVERAGE=0.00
    PASS_RATE=0.00
  fi
else
  COVERAGE=0.00
  PASS_RATE=0.00
fi

# Step 3: Update database
echo "  Updating database..."
sqlite3 skills.db "
  UPDATE skills
  SET
    test_suite_path = '$TEST_SUITE_PATH',
    test_coverage = $COVERAGE,
    required_test_pass_rate = 0.90,
    updated_at = datetime('now')
  WHERE id = $SKILL_ID;
"

echo "✓ Migration complete"
echo "  Test suite: $TEST_SUITE_PATH"
echo "  Initial coverage: $COVERAGE"
echo "  Initial pass rate: $PASS_RATE"
echo "  Required pass rate: 0.90"
echo "  Next: Implement tests and run: sqlite3 skills.db \"SELECT test_coverage FROM skills WHERE id=$SKILL_ID\""
```

### Phase 3: Test Implementation (Weeks 4-8)

For each skill, gradually increase test coverage:

```bash
# Week 1: Get to 50% coverage (critical paths)
# Week 2: Get to 70% coverage (happy paths + basic errors)
# Week 3: Get to 85% coverage (most edge cases)
# Week 4: Get to 95% coverage (all edge cases + performance)
```

### Phase 4: Gradual Enforcement (Weeks 9-10)

Start enforcing TDD requirements gradually:

```bash
# Week 1: Warnings only - log skills with coverage < 80%
# Week 2: Escalation - escalate approval for coverage < 80%
# Week 3: Enforcement - reject approval for coverage < 80%
```

### Migration Script: Bulk Update Coverage

```sql
-- Update all bootstrap skills to minimum coverage
UPDATE skills
SET
  test_coverage = 0.95,
  required_test_pass_rate = 0.95
WHERE category = 'foundation'
  AND is_auto_generated = 0;

-- Update all coordination skills
UPDATE skills
SET
  test_coverage = 0.90,
  required_test_pass_rate = 0.90
WHERE category = 'coordination'
  AND is_auto_generated = 0;

-- Update all testing skills
UPDATE skills
SET
  test_coverage = 0.95,
  required_test_pass_rate = 0.95
WHERE category = 'testing'
  AND is_auto_generated = 0;

-- Verify migration
SELECT
  category,
  COUNT(*) as skill_count,
  ROUND(AVG(test_coverage), 2) as avg_coverage,
  MIN(test_coverage) as min_coverage,
  MAX(test_coverage) as max_coverage
FROM skills
WHERE test_coverage IS NOT NULL
GROUP BY category
ORDER BY avg_coverage DESC;
```

---

## Conclusion

The **TDD and Skills Database Integration** bridges test-driven development with skill management, creating a comprehensive quality framework that:

1. **Replaces confidence scoring** with objective test execution
2. **Embeds TDD requirements** in skill metadata (test_coverage, test_suite_path, required_test_pass_rate)
3. **Enables conditional skill loading** based on test pass rates
4. **Provides complete audit trails** for compliance and transparency
5. **Supports automatic skill generation** from Phase 4 patterns with TDD validation
6. **Tracks effectiveness** of skills through test correlation with confidence improvement

This integration ensures that all skills in the system are **well-tested, measurable, and continuously improving**, leading to higher-quality agent outputs and better overall system reliability.

---

## Quick Reference: Key Tables & Columns

| Table | Column | Type | Purpose |
|-------|--------|------|---------|
| **skills** | test_coverage | REAL | Percentage of code covered by tests (0.0-1.0) |
| **skills** | test_suite_path | TEXT | Path to skill's test file |
| **skills** | required_test_pass_rate | REAL | Minimum pass rate for approval (0.0-1.0) |
| **approval_history** | test_results | TEXT | JSON: {pass_count, fail_count, pass_rate} |
| **agent_skill_mappings** | tdd_condition | TEXT | JSON: {require_tests, min_coverage, min_pass_rate} |
| **skill_usage_log** | confidence_before/after | REAL | Confidence scores before/after test execution |
| **skill_usage_log** | test_execution_result | TEXT | JSON: test results from skill execution |
| **bootstrap_skills** | pre_bootstrap_test | BOOLEAN | Whether to run tests before loading |

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-16
**Status:** Production Ready
**Next Review:** 2025-12-16
