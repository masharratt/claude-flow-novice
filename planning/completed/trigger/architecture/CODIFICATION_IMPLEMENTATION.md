# Codification Implementation Guide

Codification is the formalized process of transforming successful, ad-hoc agent behaviors into reusable, version-controlled patterns that become institutional knowledge within the system.

**Status:** Implementation Framework
**Version:** 1.0.0
**Last Updated:** 2025-11-21

---

## Table of Contents

1. [Overview](#overview)
2. [Pattern Extraction](#pattern-extraction)
3. [Codification Pipeline](#codification-pipeline)
4. [Pattern Schema](#pattern-schema)
5. [Validation Requirements](#validation-requirements)
6. [Version Control Integration](#version-control-integration)
7. [trigger.dev Integration](#triggerdev-integration)
8. [Deprecation & Evolution](#deprecation--evolution)
9. [Metrics & Analytics](#metrics--analytics)
10. [Example: Codifying REST Endpoint Pattern](#example-codifying-rest-endpoint-pattern)

---

## 1. Overview

### What Codification Means

Codification transforms operational knowledge from ad-hoc execution into formalized, testable, reusable patterns:

```
Ad-Hoc Execution          →  Codified Pattern
├─ One-off task           →  ├─ Formalized steps
├─ Specific context       →  ├─ Generalized preconditions
├─ Manual decision-making →  ├─ Decision rules
└─ Tribal knowledge       →  └─ Version-controlled, testable
```

**Key Principles:**

- **Observability**: All agent executions produce extraction signals
- **Generalizability**: Patterns abstract task-specific details
- **Validation**: Patterns must pass quality gates before publication
- **Traceability**: Every pattern links back to source executions
- **Evolution**: Patterns versioned and updated based on performance

### The Codification Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                   CODIFICATION LIFECYCLE                        │
└─────────────────────────────────────────────────────────────────┘

PHASE 1: OBSERVATION
  ↓
  ├─ Task execution completes successfully
  ├─ Execution log captured with decision points
  ├─ Agent behavior analyzed for generalizable patterns
  └─ Pattern candidate identified

PHASE 2: EXTRACTION
  ↓
  ├─ Extract preconditions (task type, context)
  ├─ Extract execution steps (with variants)
  ├─ Identify decision points and conditions
  ├─ Document postconditions and outcomes
  └─ Generate candidate pattern (draft)

PHASE 3: VALIDATION
  ↓
  ├─ Minimum sample size check (≥3 executions)
  ├─ Success rate threshold validation (≥85%)
  ├─ Test case generation from logs
  ├─ Edge case identification
  └─ Human review gate (for critical patterns)

PHASE 4: PUBLICATION
  ↓
  ├─ Pattern merged to git (skills/ or playbooks/)
  ├─ Registered in patterns database
  ├─ Injected into trigger.dev payloads
  ├─ Agent training updated
  └─ Metrics baseline established

PHASE 5: USAGE & FEEDBACK
  ↓
  ├─ Pattern applied to similar tasks
  ├─ Success/failure captured
  ├─ Usage metrics updated
  ├─ Performance trends analyzed
  └─ Evolution decisions made (update/deprecate/replace)
```

### Relationship to Playbooks

**Playbooks** are the published output of codification:

- **Skill**: Focused, reusable implementation (e.g., "add JWT auth")
- **Playbook**: Orchestrated sequence of steps + decision logic (e.g., "implement auth system")
- **Pattern**: Generalized behavior rule (e.g., "when task requires external API, call pattern X")

```
Successful Execution
        ↓
   Codification
        ↓
    Pattern
  (YAML/JSON in git)
        ↓
   Playbook/Skill
  (Injected to agents)
        ↓
   Agent Behavior
   (Informed decisions)
```

---

## 2. Pattern Extraction

### Analyzing Successful Task Completions

#### 2.1 Execution Log Analysis

Every successful task execution produces an extraction signal containing:

```yaml
# Example extraction signal
extraction:
  task_id: "cfn-2025-11-21-001"
  task_type: "implement-feature"
  duration_seconds: 1847
  success: true
  exit_code: 0

  # Structured execution data
  agent_type: "backend-developer"
  steps_executed:
    - action: "analyze_requirements"
      duration: 120
      success: true
    - action: "design_api"
      duration: 300
      success: true
    - action: "implement_endpoint"
      duration: 900
      success: true
    - action: "write_tests"
      duration: 400
      success: true
    - action: "validate"
      duration: 127
      success: true

  # Decision points
  decisions:
    - decision_point: "authentication_required"
      context: "endpoint accesses user data"
      chosen_option: "jwt_bearer_token"
      rationale: "stateless, scalable"
    - decision_point: "error_handling_strategy"
      chosen_option: "detailed_error_codes"
      rationale: "client debugging"
    - decision_point: "response_format"
      chosen_option: "json_with_metadata"
      rationale: "pagination support"

  # Measurable outcomes
  deliverables:
    - file: "src/routes/api.ts"
      lines: 250
      complexity: "medium"
    - file: "tests/api.test.ts"
      lines: 180
      test_count: 12

  metrics:
    success_rate: 1.0
    test_pass_rate: 1.0
    coverage: 0.92
    performance: "147ms avg response time"
```

#### 2.2 Identifying Generalizable Steps

Extract steps that are **context-agnostic** vs. **task-specific**:

```typescript
// TASK-SPECIFIC (not generalizable)
"Create /api/users endpoint to fetch user data from database"

// GENERALIZABLE STEP (codifiable)
"When implementing a read endpoint:
  1. Define request schema (parameters, validation)
  2. Define response schema (fields, error cases)
  3. Implement handler with auth check
  4. Add error handling (404, 500, validation)
  5. Write integration tests"
```

**Decision criteria for generalizability:**

| Characteristic | Generalizable | Specific | Action |
|---|---|---|---|
| Appears in ≥3 tasks | Yes | No | EXTRACT |
| Applies to task class | Yes | No | EXTRACT |
| Tool/tech specific | No | Yes | Keep specific |
| Decision pattern | Yes | No | Extract as rule |
| Performance-critical | Variable | Variable | Include as option |

#### 2.3 Extracting Decision Points and Conditions

Decision points represent branching logic that agents could encapsulate:

```yaml
decision_point: "authentication_method"
  description: "Choose authentication strategy for endpoint"
  applicable_when:
    - task_requires: "secure_data_access"
    - endpoint_type: "read" | "write" | "admin"
  options:
    - id: "jwt_bearer"
      preconditions:
        - "stateless auth required"
        - "client can store tokens"
      postconditions:
        - "token refresh endpoint needed"
      implementation: "Bearer token in Authorization header"

    - id: "api_key"
      preconditions:
        - "simple auth needed"
        - "client can store static key"
      postconditions:
        - "key rotation mechanism needed"
      implementation: "X-API-Key header"

    - id: "session_based"
      preconditions:
        - "traditional web app"
        - "cookie storage acceptable"
      implementation: "Set-Cookie with session ID"
```

#### 2.4 Handling Edge Cases and Variants

Capture edge cases discovered during execution:

```yaml
pattern: "implement_rest_endpoint"
  base_implementation:
    steps: [...]

  edge_cases:
    - name: "pagination_on_large_datasets"
      condition: "response_size > 10000 records"
      handling: "implement cursor-based pagination"
      risk: "performance degradation without this"

    - name: "rate_limiting_for_public_endpoints"
      condition: "endpoint is unauthenticated"
      handling: "implement rate limiting (10 req/sec/IP)"
      risk: "DoS vulnerability without this"

    - name: "field_masking_for_sensitive_data"
      condition: "response contains PII"
      handling: "mask fields based on requester role"
      risk: "data exposure without this"

  variants:
    - variant_id: "with_caching"
      precondition: "data stable for ≥5 min"
      modification: "add Cache-Control header"

    - variant_id: "with_async_processing"
      precondition: "processing time > 5 seconds"
      modification: "return 202 Accepted + job ID"
```

---

## 3. Codification Pipeline

### Overview

```
┌──────────────┐
│ Raw Execution│
│    Log       │
└──────┬───────┘
       ↓
┌──────────────────────┐
│ Pattern Extractor    │
│ (identify generalizable
│  steps & decisions)  │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Candidate Pattern    │
│ (draft, unvalidated) │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Validation Suite     │
│ • Sample size ≥3     │
│ • Success rate ≥85%  │
│ • Test generation    │
│ • Edge case review   │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Human Review Gate    │
│ (critical patterns   │
│  only: security,     │
│  performance)        │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Published Pattern    │
│ (git + DB)           │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Pattern Registration │
│ • Skills DB entry    │
│ • Agent injection    │
│ • trigger.dev sync   │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Live Usage & Metrics │
│ (success %, adoption)│
└──────────────────────┘
```

### Implementation Steps

#### Step 1: Pattern Extraction

```bash
#!/bin/bash
# .claude/skills/codification/extract-pattern.sh

set -euo pipefail

TASK_ID="$1"
TASK_TYPE="$2"  # e.g., "implement-endpoint", "fix-bug"
OUTPUT_DIR="${3:-.patterns/candidates}"

mkdir -p "$OUTPUT_DIR"

# 1. Fetch execution log from Redis/database
EXECUTION_LOG=$(redis-cli GET "task:${TASK_ID}:execution_log")

# 2. Analyze for generalizable steps
STEPS=$(echo "$EXECUTION_LOG" | jq '.steps[] | select(.is_generalizable == true)')

# 3. Extract decision points
DECISIONS=$(echo "$EXECUTION_LOG" | jq '.decisions')

# 4. Generate candidate pattern YAML
cat > "$OUTPUT_DIR/${TASK_ID}-candidate.yaml" <<EOF
id: "${TASK_TYPE}-$(date +%s)"
extracted_from:
  - task_id: "${TASK_ID}"
    task_type: "${TASK_TYPE}"
source_execution:
  steps: ${STEPS}
  decisions: ${DECISIONS}
validation:
  sample_size: 1
  success_rate: 1.0
  status: "pending_validation"
EOF

echo "Pattern candidate created: $OUTPUT_DIR/${TASK_ID}-candidate.yaml"
```

#### Step 2: Candidate Aggregation

Gather multiple executions before validation:

```bash
#!/bin/bash
# .claude/skills/codification/aggregate-candidates.sh

PATTERN_TYPE="$1"  # e.g., "implement-rest-endpoint"
CONFIDENCE_THRESHOLD="${2:-0.85}"

# Collect all similar task executions from last 7 days
EXECUTIONS=$(redis-cli KEYS "task:*:execution_log" | \
  xargs -I {} redis-cli GET {} | \
  jq "select(.task_type == \"$PATTERN_TYPE\")")

EXECUTION_COUNT=$(echo "$EXECUTIONS" | jq -s 'length')

if [ "$EXECUTION_COUNT" -lt 3 ]; then
  echo "Insufficient samples ($EXECUTION_COUNT < 3), skipping aggregation"
  exit 1
fi

# Calculate aggregate metrics
SUCCESS_RATE=$(echo "$EXECUTIONS" | jq '[.success] | add / length')

if (( $(echo "$SUCCESS_RATE < $CONFIDENCE_THRESHOLD" | bc -l) )); then
  echo "Success rate too low ($SUCCESS_RATE < $CONFIDENCE_THRESHOLD)"
  exit 1
fi

# Extract common steps and decisions
COMMON_STEPS=$(echo "$EXECUTIONS" | jq -s \
  '.[].steps | group_by(.action) | map(select(length > 2))')

# Generate aggregated pattern
cat > ".patterns/aggregated/${PATTERN_TYPE}-v1.yaml" <<EOF
id: "${PATTERN_TYPE}-v1"
extracted_from:
  count: ${EXECUTION_COUNT}
  success_rate: ${SUCCESS_RATE}
common_steps: ${COMMON_STEPS}
validation_status: "ready_for_validation"
EOF
```

#### Step 3: Validation

```bash
#!/bin/bash
# .claude/skills/codification/validate-pattern.sh

PATTERN_FILE="$1"
VALIDATION_MODE="${2:-standard}"  # standard, strict, enterprise

# Parse pattern YAML
PATTERN=$(yq eval '.' "$PATTERN_FILE")
SAMPLE_SIZE=$(echo "$PATTERN" | yq '.metadata.sample_size')
SUCCESS_RATE=$(echo "$PATTERN" | yq '.metadata.success_rate')
STEP_COUNT=$(echo "$PATTERN" | yq '.steps | length')

# 1. Sample size validation
MIN_SAMPLES=$(case "$VALIDATION_MODE" in
  standard) echo "3" ;;
  strict) echo "5" ;;
  enterprise) echo "10" ;;
esac)

if [ "$SAMPLE_SIZE" -lt "$MIN_SAMPLES" ]; then
  echo "FAIL: Insufficient samples ($SAMPLE_SIZE < $MIN_SAMPLES)"
  exit 1
fi

# 2. Success rate validation
MIN_SUCCESS=$(case "$VALIDATION_MODE" in
  standard) echo "0.85" ;;
  strict) echo "0.92" ;;
  enterprise) echo "0.98" ;;
esac)

if (( $(echo "$SUCCESS_RATE < $MIN_SUCCESS" | bc -l) )); then
  echo "FAIL: Success rate too low ($SUCCESS_RATE < $MIN_SUCCESS)"
  exit 1
fi

# 3. Test case generation
TEST_COUNT=$(echo "$PATTERN" | yq '.test_cases | length')
if [ "$TEST_COUNT" -eq 0 ]; then
  echo "FAIL: No test cases defined"
  exit 1
fi

# 4. Precondition completeness
PRECONDITIONS=$(echo "$PATTERN" | yq '.preconditions | length')
if [ "$PRECONDITIONS" -eq 0 ]; then
  echo "WARN: No preconditions defined (may be too generic)"
fi

# 5. Edge case review
EDGE_CASES=$(echo "$PATTERN" | yq '.edge_cases | length')
if [ "$EDGE_CASES" -eq 0 ]; then
  echo "WARN: No edge cases documented"
fi

# All validations passed
echo "PASS: Pattern validation successful"
yq eval '.validation.status = "ready_for_publication"' -i "$PATTERN_FILE"
```

---

## 4. Pattern Schema

### Core Structure

```typescript
interface CodifiedPattern {
  // Identification
  id: string;                    // "implement-rest-endpoint-v1"
  version: string;               // "1.0.0"
  name: string;                  // "REST Endpoint Implementation"
  description: string;           // One sentence purpose

  // Pattern Definition
  preconditions: Condition[];    // When this applies
  steps: CodifiedStep[];        // Ordered execution steps
  postconditions: Condition[];  // Guaranteed outcomes
  variants?: PatternVariant[];   // Alternative implementations

  // Decision Logic
  decision_rules: DecisionRule[];  // Branching logic
  edge_cases: EdgeCase[];          // Known issues & handling

  // Quality & Testing
  testCases: TestCase[];
  examples: ExecutionExample[];

  // Metadata & Tracking
  metadata: PatternMetadata;

  // Governance
  security_review?: SecurityReview;
  deprecation?: DeprecationInfo;
}
```

### YAML Schema Example

```yaml
# .patterns/rest-endpoint-implementation-v1.yaml

---
kind: Pattern
apiVersion: v1
metadata:
  id: rest-endpoint-implementation-v1
  version: 1.0.0
  name: "REST Endpoint Implementation"
  description: "Create a new REST API endpoint with proper validation, error handling, and tests"

  # Tracking
  extracted_from:
    - task_id: cfn-2025-11-15-001
      task_type: implement-feature
      confidence: 0.98
    - task_id: cfn-2025-11-14-008
      task_type: implement-feature
      confidence: 0.95
    - task_id: cfn-2025-11-10-003
      task_type: implement-feature
      confidence: 0.91

  created_at: 2025-11-21T10:30:00Z
  created_by: "codification-pipeline"
  last_updated_at: 2025-11-21T10:30:00Z

  # Performance metrics
  success_rate: 0.95
  average_duration_seconds: 1847
  total_usages: 0
  last_used: null

# Pattern Applicability
spec:
  preconditions:
    - name: "Task requires new endpoint"
      description: "Implementation task targets REST API endpoint"
      check: "task.type == 'implement-endpoint'"

    - name: "Requirements defined"
      description: "Endpoint requirements must be clear (method, path, params)"
      check: "requirements.endpoint.method && requirements.endpoint.path"

    - name: "Project uses TypeScript/Express"
      description: "Current implementation strategy"
      check: "project.framework == 'express' && project.language == 'typescript'"

  postconditions:
    - name: "Endpoint responds on specified path"
      description: "HTTP endpoint is accessible at the defined route"
      verification: "curl -X {method} http://localhost:{port}/{path}"

    - name: "Input validation active"
      description: "Request parameters/body validated before processing"
      verification: "send_invalid_request -> 400 Bad Request"

    - name: "Error handling implemented"
      description: "All error paths return appropriate HTTP status + error details"
      verification: "test_error_conditions() passes"

    - name: "Tests passing"
      description: "Test suite for endpoint passes completely"
      verification: "npm test -- endpoint.test.ts -> 100% pass"

# Execution Steps
  steps:
    - id: step-1
      name: "Analyze Requirements"
      description: "Extract endpoint requirements from task description"
      actions:
        - "Parse request method (GET, POST, PUT, DELETE, PATCH)"
        - "Parse URL path and path parameters"
        - "Identify query parameters and their constraints"
        - "Identify request body schema"
        - "Identify response schema and status codes"
      duration_estimate_seconds: 120

      # Decision point within this step
      decision_point:
        name: "Auth requirement"
        question: "Does this endpoint require authentication?"
        options:
          - value: true
            condition: "endpoint.requires_auth == true"
            impact: "Add Bearer token validation"
          - value: false
            condition: "endpoint.is_public == true"
            impact: "Skip auth, consider rate limiting"

    - id: step-2
      name: "Design Request/Response Schemas"
      description: "Define TypeScript interfaces for request and response"
      actions:
        - "Create RequestDTO interface with all required fields"
        - "Add field-level validation decorators"
        - "Create ResponseDTO interface"
        - "Document all response status codes"
        - "Validate against OpenAPI 3.0 spec if available"
      depends_on: ["step-1"]
      duration_estimate_seconds: 300

      output_artifact:
        type: "typescript_interfaces"
        location: "src/dtos/{feature}.dto.ts"
        pattern: |
          export interface {Feature}RequestDTO {
            [field: string]: [type];
          }
          export interface {Feature}ResponseDTO {
            [field: string]: [type];
          }

    - id: step-3
      name: "Implement Handler Function"
      description: "Create the actual endpoint handler"
      actions:
        - "Create Express route handler"
        - "Add input validation using class-validator"
        - "Implement business logic"
        - "Handle errors with try-catch"
        - "Return appropriate HTTP status"
      depends_on: ["step-2"]
      duration_estimate_seconds: 600

      # Embedded decision point
      decision_point:
        name: "Error handling strategy"
        question: "How detailed should error responses be?"
        options:
          - value: "detailed"
            rationale: "Public API - client needs debugging info"
            implementation: |
              res.status(400).json({
                code: "VALIDATION_ERROR",
                message: "Invalid request format",
                details: validationErrors
              })
          - value: "minimal"
            rationale: "Internal API - basic status sufficient"
            implementation: |
              res.status(400).json({
                error: "Bad Request"
              })

      output_artifact:
        type: "typescript_handler"
        location: "src/routes/{feature}.ts"

    - id: step-4
      name: "Write Integration Tests"
      description: "Create comprehensive tests covering success and error paths"
      actions:
        - "Write happy path test (valid request -> correct response)"
        - "Write validation error tests (invalid input)"
        - "Write error path tests (500, 404, auth failure)"
        - "Write edge case tests (empty data, max limits)"
        - "Verify test coverage ≥90%"
      depends_on: ["step-3"]
      duration_estimate_seconds: 400

      test_template: |
        describe('POST /api/{endpoint}', () => {
          it('should create resource with valid input', async () => {
            const res = await request(app)
              .post('/api/{endpoint}')
              .send(validInput);
            expect(res.status).toBe(201);
            expect(res.body).toMatchSchema(ResponseDTO);
          });

          it('should reject invalid input', async () => {
            const res = await request(app)
              .post('/api/{endpoint}')
              .send({ invalid: 'data' });
            expect(res.status).toBe(400);
          });
        });

    - id: step-5
      name: "Validate and Document"
      description: "Final review and documentation"
      actions:
        - "Run full test suite"
        - "Check code coverage (target: 90%+)"
        - "Update API documentation (OpenAPI/Swagger)"
        - "Add inline code comments for complex logic"
        - "Verify error handling for all status codes"
      depends_on: ["step-4"]
      duration_estimate_seconds: 127

  # Pattern Variants
  variants:
    - id: with-pagination
      name: "GET endpoint with pagination"
      precondition: "Response may contain >100 items"
      modification: |
        Add query parameters:
        - limit (default: 20, max: 100)
        - offset or cursor
        Add response wrapper:
        {
          data: [...],
          pagination: {
            limit: 20,
            offset: 0,
            total: 500
          }
        }

    - id: with-filtering
      name: "GET endpoint with filter parameters"
      precondition: "Response set can be filtered by multiple criteria"
      modification: |
        Add filter query parameters based on resource fields
        Validate filter values against allowed values
        Apply filters in database query

    - id: with-async-processing
      name: "Long-running operation as async job"
      precondition: "Processing time > 5 seconds"
      modification: |
        Return 202 Accepted immediately with job ID
        Process in background worker
        Provide status check endpoint at /jobs/{jobId}

  # Decision Rules
  decision_rules:
    - name: "Authentication Strategy"
      description: "Choose auth mechanism based on endpoint type"
      rules:
        - if: "endpoint.is_public == true"
          then: "skip_auth"
        - if: "endpoint.requires_user_data == true"
          then: "require_jwt_bearer"
        - if: "endpoint.requires_admin == true"
          then: "require_jwt_bearer_with_admin_role"

    - name: "Response Format"
      description: "Choose response structure based on requirements"
      rules:
        - if: "requires_pagination == true"
          then: "use_paginated_response_wrapper"
        - if: "is_bulk_operation == true"
          then: "use_batch_response_format"
        - if: "async_processing == true"
          then: "return_202_with_job_id"

  # Edge Cases
  edge_cases:
    - name: "Concurrent modification"
      condition: "Multiple clients request same resource simultaneously"
      risk_level: "high"
      handling: |
        Implement optimistic locking or version checks
        Return 409 Conflict with version info
        Require client to retry with updated version

    - name: "Rate limiting"
      condition: "Endpoint exposed publicly without auth"
      risk_level: "high"
      handling: |
        Implement rate limiting: 100 req/min per IP
        Return 429 Too Many Requests with Retry-After header

    - name: "Large response payload"
      condition: "Response >1MB before compression"
      risk_level: "medium"
      handling: |
        Implement pagination or streaming
        Enable gzip compression (Content-Encoding: gzip)
        Document max payload size

    - name: "Missing required fields"
      condition: "Request lacks required body fields"
      risk_level: "medium"
      handling: |
        Validate with schema validator
        Return 400 with field-level error messages
        Example: { errors: { name: 'is required' } }

    - name: "Invalid enumeration values"
      condition: "Request provides invalid enum value"
      risk_level: "low"
      handling: |
        Validate against allowed values list
        Return 400 with allowed values
        Example: { error: 'status must be one of: active, inactive, pending' }

# Testing
  test_cases:
    - id: test-happy-path
      name: "Happy path: valid request returns 201"
      scenario: "Client sends valid request to create resource"
      steps:
        - name: "Send request"
          action: "POST /api/{endpoint}"
          payload: "{ name: 'Test', active: true }"
        - name: "Verify response"
          assertion: "status == 201"
          assertion: "response.id is defined"
      expected_outcome: "Resource created successfully"

    - id: test-validation-error
      name: "Validation error: invalid input returns 400"
      scenario: "Client sends request with missing required field"
      steps:
        - name: "Send request with missing 'name'"
          action: "POST /api/{endpoint}"
          payload: "{ active: true }"
        - name: "Verify error response"
          assertion: "status == 400"
          assertion: "response.errors contains 'name required'"
      expected_outcome: "Validation error returned with details"

    - id: test-auth-error
      name: "Auth error: missing token returns 401"
      precondition: "endpoint.requires_auth == true"
      scenario: "Client sends request without Bearer token"
      steps:
        - name: "Send request without auth header"
          action: "POST /api/{endpoint}"
          headers: "{}"
        - name: "Verify 401 response"
          assertion: "status == 401"
          assertion: "response.error == 'Unauthorized'"
      expected_outcome: "Auth error with clear message"

    - id: test-edge-case-concurrent
      name: "Edge case: concurrent modification detected"
      precondition: "endpoint supports updates"
      scenario: "Two clients try to update same resource"
      steps:
        - name: "Client A reads resource (v1)"
          action: "GET /api/{endpoint}/{id}"
        - name: "Client B updates resource (v1 -> v2)"
          action: "PUT /api/{endpoint}/{id}"
          payload: "{ version: 1, data: {...} }"
        - name: "Client A attempts update with stale version"
          action: "PUT /api/{endpoint}/{id}"
          payload: "{ version: 1, data: {...} }"
        - name: "Verify conflict response"
          assertion: "status == 409"
          assertion: "response.current_version == 2"
      expected_outcome: "Conflict detected, client must retry"

# Examples
  examples:
    - name: "GET /api/users/{id} example"
      description: "Fetch single user by ID"
      preconditions:
        - "User exists with given ID"
      execution:
        request:
          method: GET
          path: "/api/users/123"
          headers:
            Authorization: "Bearer eyJhbGc..."
        response:
          status: 200
          body:
            id: 123
            name: "John Doe"
            email: "john@example.com"
            created_at: "2025-11-15T10:30:00Z"

    - name: "POST /api/users example"
      description: "Create new user"
      execution:
        request:
          method: POST
          path: "/api/users"
          headers:
            Content-Type: "application/json"
            Authorization: "Bearer eyJhbGc..."
          body:
            name: "Jane Smith"
            email: "jane@example.com"
            password: "secure_password"
        response:
          status: 201
          body:
            id: 124
            name: "Jane Smith"
            email: "jane@example.com"
            created_at: "2025-11-21T14:22:00Z"

---

# Governance

governance:
  # Security considerations
  security:
    review_required: true
    critical_areas:
      - "Input validation completeness"
      - "Authentication enforcement"
      - "Authorization checks"
      - "Error message information leakage"
      - "Rate limiting effectiveness"

    checklist:
      - "All inputs validated"
      - "Auth required where needed"
      - "Errors don't leak system info"
      - "Rate limiting implemented"
      - "SQL injection prevention verified"

  # Performance considerations
  performance:
    review_required: true
    targets:
      - "Response time: <200ms (p95)"
      - "Throughput: >100 req/sec"
      - "Database queries: <2 per request"

    recommendations:
      - "Add caching for read endpoints"
      - "Use pagination for large datasets"
      - "Index frequently queried fields"

  # Maintainability
  maintainability:
    code_quality:
      - "Follow project code style"
      - "Add JSDoc comments"
      - "Keep functions focused (single responsibility)"

    documentation:
      - "Update OpenAPI/Swagger spec"
      - "Document rate limits and auth"
      - "Document error codes and meanings"

# Deprecation (if applicable)
deprecation: null
# Example if pattern becomes deprecated:
# deprecation:
#   status: deprecated
#   deprecated_at: 2025-12-01T00:00:00Z
#   replacement_pattern: "rest-endpoint-implementation-v2"
#   migration_notes: "V2 includes OpenAPI 3.1 support and async validation"
#   sunset_date: 2026-01-15T00:00:00Z
```

---

## 5. Validation Requirements

### Quality Gates by Mode

| Criterion | MVP | Standard | Enterprise |
|-----------|-----|----------|-----------|
| **Minimum samples** | 2 | 3 | 5 |
| **Success rate** | 75% | 85% | 95% |
| **Test coverage** | 60% | 85% | 95% |
| **Preconditions** | 1+ | 2+ | 3+ |
| **Edge cases identified** | 2+ | 3+ | 5+ |
| **Human review required** | No | Yes (security/perf) | Yes (all) |
| **Performance benchmarked** | No | Yes | Yes |

### Validation Checklist

```yaml
# .patterns/validation-checklist.yaml

validation_gate_standard:
  sample_size:
    required: true
    threshold: 3
    rationale: "Ensures pattern isn't based on one-off anomaly"

  success_rate:
    required: true
    threshold: 0.85
    rationale: "Pattern must succeed majority of times"

  test_coverage:
    required: true
    threshold: 0.85
    rationale: "Ensures pattern behavior is testable"

  preconditions:
    required: true
    minimum_count: 2
    rationale: "Prevents over-generalization"
    check: "Pattern has clear applicability boundaries"

  postconditions:
    required: true
    minimum_count: 1
    rationale: "Clear outcome definition"

  edge_cases:
    required: true
    minimum_count: 3
    rationale: "Identifies handling for known issues"

  security_review:
    required: true
    for_patterns: ["authentication", "data_handling", "api_endpoint"]
    checklist:
      - "Input validation comprehensive"
      - "Auth enforcement verified"
      - "Error messages don't leak info"
      - "No hardcoded secrets"

  performance_review:
    required: true
    for_patterns: ["data_heavy", "io_intensive"]
    benchmarks:
      - "Execute pattern 10+ times"
      - "Record response times"
      - "Identify bottlenecks"
      - "Document resource usage"

automation:
  # Automated validation scripts
  sample_size_check: |
    COUNT=$(yq '.metadata.extracted_from | length' pattern.yaml)
    [ "$COUNT" -ge 3 ] || exit 1

  success_rate_check: |
    RATE=$(yq '.metadata.success_rate' pattern.yaml)
    python3 -c "exit(0 if float('$RATE') >= 0.85 else 1)"

  test_coverage_check: |
    COVERAGE=$(yq '.test_cases | length' pattern.yaml)
    [ "$COVERAGE" -ge 5 ] || exit 1

  precondition_completeness: |
    COUNT=$(yq '.spec.preconditions | length' pattern.yaml)
    [ "$COUNT" -ge 2 ] || exit 1
```

### Human Review Gate

For patterns involving security or performance-critical operations:

```markdown
# Pattern Security Review Checklist

- [ ] All external inputs validated
- [ ] Authentication/authorization checks present
- [ ] Error messages don't expose system details
- [ ] No hardcoded API keys or credentials
- [ ] SQL injection prevention verified
- [ ] XSS protection implemented (if applicable)
- [ ] Rate limiting applied to public endpoints
- [ ] Request size limits enforced
- [ ] Output encoding correct for context

# Pattern Performance Review Checklist

- [ ] Database queries optimized (explain plan reviewed)
- [ ] N+1 query problems eliminated
- [ ] Caching strategy defined
- [ ] Response time targets met (<200ms p95)
- [ ] Throughput requirements verified
- [ ] Resource usage acceptable (memory, CPU)
- [ ] Pagination implemented for large datasets
- [ ] Batch operations supported where needed
```

---

## 6. Version Control Integration

### Directory Structure

```
.patterns/
├── README.md                          # Patterns overview
├── REGISTRY.yaml                      # Central pattern index
│
├── rest-endpoints/
│   ├── rest-endpoint-implementation-v1.yaml
│   ├── rest-endpoint-implementation-v2.yaml
│   └── CHANGELOG.md
│
├── authentication/
│   ├── jwt-bearer-auth-v1.yaml
│   └── api-key-validation-v1.yaml
│
├── database/
│   ├── migration-pattern-v1.yaml
│   └── query-optimization-v1.yaml
│
├── error-handling/
│   └── consistent-error-responses-v1.yaml
│
└── security/
    ├── input-validation-v1.yaml
    └── rate-limiting-v1.yaml

.claude/skills/
└── codification/
    ├── extract-pattern.sh
    ├── validate-pattern.sh
    ├── publish-pattern.sh
    └── templates/
        └── pattern-template.yaml
```

### Git Workflow for Patterns

```bash
#!/bin/bash
# Workflow: Adding/updating a pattern

# 1. Extract candidate from successful execution
./extract-pattern.sh cfn-2025-11-21-001 implement-feature

# 2. Review and refine candidate
# - Add preconditions and postconditions
# - Document edge cases
# - Create test cases
# - Update version number

# 3. Run validation
./validate-pattern.sh .patterns/candidates/implement-feature-candidate.yaml

# 4. Open PR for human review
git checkout -b pattern/implement-feature-v1
git add .patterns/
git commit -m "feat(patterns): add 'implement REST endpoint' pattern"
git push origin pattern/implement-feature-v1

# gh pr create \
#   --title "Pattern: REST Endpoint Implementation v1" \
#   --body "Extracted from 5 successful executions, 92% success rate"

# 5. Once merged, publish pattern
./publish-pattern.sh .patterns/rest-endpoint-implementation-v1.yaml

# 6. Register in patterns database
redis-cli SET pattern:rest-endpoint-implementation-v1 \
  "$(cat .patterns/rest-endpoint-implementation-v1.yaml)"

# 7. Update registry
yq eval '.patterns += {"rest-endpoint-implementation": "v1"}' -i .patterns/REGISTRY.yaml
```

### Pattern Registry (REGISTRY.yaml)

```yaml
# .patterns/REGISTRY.yaml

registry_version: 1
last_updated: 2025-11-21T10:30:00Z
total_patterns: 24

patterns:
  # REST API Patterns
  rest-endpoints:
    - id: rest-endpoint-implementation
      latest_version: v1
      versions:
        v1:
          status: active
          released: 2025-11-21T10:30:00Z
          adoption_rate: 0.0
          description: "Create REST endpoint with validation and tests"

  # Authentication Patterns
  authentication:
    - id: jwt-bearer-auth
      latest_version: v1
      versions:
        v1:
          status: active
          released: 2025-11-15T14:22:00Z
          adoption_rate: 0.87
          description: "Implement JWT bearer token authentication"

    - id: api-key-validation
      latest_version: v2
      versions:
        v2:
          status: active
          released: 2025-11-10T08:15:00Z
          adoption_rate: 0.56
          description: "Validate and manage API keys"
        v1:
          status: deprecated
          released: 2025-09-20T12:00:00Z
          replacement: api-key-validation-v2
          sunset_date: 2026-01-01T00:00:00Z

# Analytics
analytics:
  total_extractions_this_month: 47
  patterns_published_this_month: 3
  average_adoption_rate: 0.67
  average_time_to_codification_hours: 36
```

### PR Template for Patterns

```markdown
# New Pattern: [Pattern Name]

## Overview
[One sentence description]

## Extraction Summary
- Extracted from: [N] successful executions
- Success rate: [X]%
- Date range: [From] to [To]

## Pattern Definition
[Brief overview of pattern structure]

## Validation Results
- Sample size: [N] ✓
- Success rate: [X]% ✓
- Test coverage: [Y]% ✓
- Edge cases documented: [N] ✓

## Security/Performance Review
- [Security checklist items]
- [Performance benchmarks]

## Examples
[1-2 concrete examples of pattern usage]

## Related Patterns
- Links to related/dependent patterns
```

---

## 7. trigger.dev Integration

### Pattern Injection Architecture

```
┌─────────────────────────────┐
│  Job Submission to trigger  │
│  (with task description)    │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│ Pattern Classifier          │
│ (LLM-based classification)  │
│ ├─ Task type detection      │
│ ├─ Complexity estimation    │
│ └─ Applicable patterns list │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│ Pattern Selector            │
│ ├─ Rank by relevance        │
│ ├─ Filter by success rate   │
│ ├─ A/B test considerations  │
│ └─ Return top 3 patterns    │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│ Job Payload Enrichment      │
│ ├─ Add selected patterns    │
│ ├─ Pattern context JSON     │
│ └─ Usage metadata           │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│ Agent Execution             │
│ (with pattern guidance)     │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│ Job Completion              │
│ ├─ Success/failure recorded │
│ ├─ Pattern effectiveness    │
│ │   data collected          │
│ └─ Metrics updated          │
└─────────────────────────────┘
```

### Job Payload Enhancement

```json
{
  "task": {
    "id": "cfn-2025-11-21-042",
    "type": "implement-feature",
    "description": "Add REST endpoint to fetch user profile...",
    "requirements": {
      "endpoint_method": "GET",
      "endpoint_path": "/api/users/{id}",
      "requires_auth": true
    }
  },

  "patterns": {
    "recommended": [
      {
        "id": "rest-endpoint-implementation-v1",
        "score": 0.96,
        "reason": "Exact match: GET endpoint with auth",
        "metrics": {
          "success_rate": 0.95,
          "adoption_rate": 0.67,
          "avg_duration_seconds": 1847
        },
        "context": {
          "preconditions": ["endpoint.requires_auth == true"],
          "key_steps": [
            "Analyze Requirements",
            "Design Request/Response Schemas",
            "Implement Handler Function",
            "Write Integration Tests"
          ],
          "decision_points": [
            {
              "name": "authentication_strategy",
              "options": ["jwt_bearer", "api_key", "session"]
            },
            {
              "name": "error_response_format",
              "options": ["detailed", "minimal"]
            }
          ]
        }
      },
      {
        "id": "input-validation-v1",
        "score": 0.88,
        "reason": "Path parameter validation needed"
      },
      {
        "id": "error-handling-standard-v1",
        "score": 0.85,
        "reason": "HTTP error codes and formats"
      }
    ],

    "ab_test": {
      "enabled": true,
      "variant": "pattern_v1",  // or "control"
      "test_id": "rest-endpoint-ab-001"
    }
  },

  "tracking": {
    "pattern_usage": {
      "session_id": "cfn-2025-11-21-042",
      "patterns_injected": [
        "rest-endpoint-implementation-v1",
        "input-validation-v1"
      ],
      "timestamp": "2025-11-21T10:30:00Z"
    }
  }
}
```

### Pattern Classification (trigger.dev)

```typescript
// services/pattern-classifier.ts

import { PatternRegistry } from '@/patterns/registry';
import { LLM } from '@/llm';

interface ClassificationResult {
  task_type: string;
  complexity: 'low' | 'medium' | 'high';
  applicable_patterns: {
    id: string;
    score: number;
    reason: string;
  }[];
}

export async function classifyAndSelectPatterns(
  taskDescription: string,
  requirements?: Record<string, unknown>
): Promise<ClassificationResult> {
  // 1. Classify task
  const classification = await llm.classify(taskDescription, {
    categories: [
      'implement-endpoint',
      'fix-bug',
      'refactor',
      'add-test',
      'optimize-performance'
    ]
  });

  // 2. Get applicable patterns from registry
  const registry = await PatternRegistry.load();
  const candidates = registry.getPatternsForTaskType(classification.task_type);

  // 3. Score patterns by relevance
  const scored = await Promise.all(
    candidates.map(async (pattern) => ({
      id: pattern.id,
      score: await scorePatternRelevance(pattern, requirements),
      reason: generateReason(pattern, requirements)
    }))
  );

  // 4. Sort and return top 3
  const top3 = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    task_type: classification.task_type,
    complexity: classification.complexity,
    applicable_patterns: top3
  };
}

async function scorePatternRelevance(
  pattern: Pattern,
  requirements?: Record<string, unknown>
): Promise<number> {
  let score = 0;

  // Factor 1: Success rate (0-0.3 points)
  score += pattern.metadata.success_rate * 0.3;

  // Factor 2: Precondition match (0-0.4 points)
  const matchedPreconditions = pattern.spec.preconditions.filter((cond) =>
    cond.check ? evaluateCheck(cond.check, requirements) : false
  ).length;
  score +=
    (matchedPreconditions / pattern.spec.preconditions.length) * 0.4;

  // Factor 3: Recent usage (0-0.2 points)
  const daysSinceLastUse = daysSince(pattern.metadata.last_used);
  score += Math.max(0, (1 - daysSinceLastUse / 30)) * 0.2;

  // Factor 4: Adoption (0-0.1 points)
  score += pattern.metadata.usageCount > 0 ? 0.1 : 0;

  return Math.min(1.0, score);
}
```

### Feedback Loop: Job Results → Pattern Metrics

```typescript
// services/pattern-feedback.ts

export async function recordPatternUsage(
  jobId: string,
  jobResult: JobResult,
  patternsUsed: string[]
): Promise<void> {
  const success = jobResult.exit_code === 0;
  const duration = jobResult.duration_seconds;

  // Update each pattern's metrics
  for (const patternId of patternsUsed) {
    const pattern = await PatternRegistry.get(patternId);

    // Update success rate (sliding window)
    pattern.metadata.usageCount += 1;
    if (success) {
      pattern.metadata.successfulUsages = (pattern.metadata.successfulUsages || 0) + 1;
    }
    pattern.metadata.success_rate =
      pattern.metadata.successfulUsages / pattern.metadata.usageCount;

    // Update last used
    pattern.metadata.last_used = new Date();

    // Record duration sample
    pattern.metadata.duration_samples ||= [];
    pattern.metadata.duration_samples.push(duration);

    // Persist updated pattern
    await PatternRegistry.update(patternId, pattern);

    // Log for analytics
    await analyticsService.recordPatternUsage({
      pattern_id: patternId,
      job_id: jobId,
      success,
      duration,
      timestamp: new Date()
    });
  }
}
```

### A/B Testing Patterns

```typescript
// services/pattern-ab-test.ts

interface ABTestConfig {
  pattern_id: string;
  test_id: string;
  enabled: boolean;
  control_rate: number; // % of traffic to control (no pattern)
  variant_rate: number; // % of traffic to pattern
}

export function selectPatternVariant(
  patternId: string,
  testConfig: ABTestConfig,
  sessionId: string
): 'control' | 'variant' {
  if (!testConfig.enabled) {
    return 'variant'; // Always use pattern
  }

  // Deterministic assignment based on session ID
  const hash = hashFunction(sessionId);
  const bucket = hash % 100;

  if (bucket < testConfig.control_rate * 100) {
    return 'control'; // Send to control group (no pattern)
  } else {
    return 'variant'; // Send to variant group (with pattern)
  }
}

// Analyze test results
export async function analyzeABTestResults(
  testId: string,
  days: number = 7
): Promise<{
  variant_success_rate: number;
  control_success_rate: number;
  improvement_percentage: number;
  statistical_significance: boolean;
}> {
  const variant = await analyticsService.getResults(testId, 'variant', days);
  const control = await analyticsService.getResults(testId, 'control', days);

  const variant_success_rate = variant.successful / variant.total;
  const control_success_rate = control.successful / control.total;
  const improvement_percentage =
    ((variant_success_rate - control_success_rate) / control_success_rate) * 100;

  // Chi-square test for statistical significance
  const significance = await chisquareTest(variant, control);

  return {
    variant_success_rate,
    control_success_rate,
    improvement_percentage,
    statistical_significance: significance > 0.95
  };
}
```

---

## 8. Deprecation & Evolution

### Pattern Lifecycle States

```
ACTIVE (normal usage)
  ├─ Performance: >= 85% success rate
  ├─ Adoption: >= 50% of applicable tasks
  └─ Maintenance: Regular performance monitoring

        ↓ [deprecation trigger]

DEPRECATION_NOTICE (issued, still active)
  ├─ Reason: New pattern, performance issue, or replacement
  ├─ Grace period: 30 days minimum
  ├─ Recommendation: Migrate to replacement pattern
  └─ Support: Full support during grace period

        ↓ [grace period expires]

DEPRECATED (no longer recommended)
  ├─ New tasks: Do not use for new tasks
  ├─ Existing tasks: Can continue using
  ├─ Support: Bug fixes only
  └─ Sunset: 90 days until removal

        ↓ [sunset date reached]

RETIRED (removed from production)
  ├─ Code: Removed from codebase
  ├─ Registry: Historical record only
  ├─ Migration: Documents migration path for any remaining usage
  └─ Reference: Archived docs for learning/audit
```

### Deprecation Notice

```yaml
# Example: Deprecating API Key v1 pattern

deprecation:
  status: deprecation_notice
  issued_at: 2025-11-21T10:30:00Z
  deprecated_at: 2025-11-21T10:30:00Z
  grace_period_days: 30
  sunset_date: 2025-12-21T00:00:00Z

  reason: "api-key-validation-v2 provides better security and flexibility"

  impact:
    new_tasks: "Do not use for new tasks starting 2025-11-21"
    existing_usage: "5 active patterns depend on this; migration guides provided"
    breaking_changes: "Config format changed; migration script available"

  replacement_pattern: "api-key-validation-v2"

  migration:
    guide: "docs/migrations/api-key-validation-v1-to-v2.md"
    automated_script: "scripts/migrate-api-key-v1-to-v2.sh"
    expected_duration_minutes: 30
    testing_required: true

  support:
    during_grace_period: "Full support; bug fixes prioritized"
    after_sunset: "No support; code removed"

  questions_contact: "architecture-team@company.com"
```

### Deprecation Timeline

```bash
#!/bin/bash
# Monitor pattern deprecation lifecycle

# T+0 (Issue Notice)
# - Mark pattern as deprecated in YAML
# - Update pattern registry
# - Notify dependent patterns
# - Create migration guide

PATTERN="api-key-validation-v1"
SUNSET_DATE=$(date -d "+90 days" +%Y-%m-%d)

yq eval ".governance.deprecation.status = 'deprecation_notice'" -i ".patterns/${PATTERN}.yaml"
yq eval ".governance.deprecation.sunset_date = '${SUNSET_DATE}T00:00:00Z'" -i ".patterns/${PATTERN}.yaml"

# T+30 (Grace Period Expires)
# - Stop recommending for new tasks
# - Alert existing users of deadline
# - Escalate unfinished migrations

# T+60 (Warning Period)
# - Final migration nudge
# - Start planning code removal

# T+90 (Sunset)
# - Remove code from codebase
# - Archive pattern documentation
# - Complete all migrations

yq eval ".governance.deprecation.status = 'retired'" -i ".patterns/${PATTERN}.yaml"
```

### Migration Path Example

```markdown
# Migrating from api-key-validation-v1 to v2

## What Changed

| Aspect | v1 | v2 |
|--------|----|----|
| Config format | Inline in env | YAML file |
| Validation | Regex | Schema-based |
| Rotation | Manual | Automated |
| Expiration | Not supported | Full support |

## Migration Checklist

1. **Backup existing configuration**
   - [ ] Export current API keys
   - [ ] Document current validation rules

2. **Install v2**
   - [ ] Update pattern reference in `.patterns/REGISTRY.yaml`
   - [ ] Run automated migration script

3. **Update configuration**
   - [ ] Create new YAML config file
   - [ ] Map existing keys to new format
   - [ ] Test validation rules

4. **Run migration script**
   ```bash
   ./scripts/migrate-api-key-v1-to-v2.sh --old-config .env --new-config config/api-keys.yaml
   ```

5. **Test thoroughly**
   - [ ] Valid keys accepted
   - [ ] Invalid keys rejected
   - [ ] Error messages clear
   - [ ] Performance acceptable

6. **Deploy to production**
   - [ ] Create PR with migration changes
   - [ ] Peer review
   - [ ] Deploy to staging first
   - [ ] Monitor for issues
   - [ ] Deploy to production

## Rollback Plan

If issues occur:

```bash
# Revert to v1 temporarily
git revert <commit-sha>
rm config/api-keys.yaml
```

## Performance Impact

- **Memory**: +2% (additional caching)
- **CPU**: -5% (faster validation)
- **Latency**: Same (< 1ms per check)

## Support

Questions? Contact: architecture-team@company.com
```

---

## 9. Metrics & Analytics

### Pattern Metrics Dashboard

```yaml
# Analytics for pattern performance

metrics:
  adoption:
    definition: "% of applicable tasks using pattern"
    target: ">= 70%"
    calculation: "tasks_using_pattern / tasks_of_pattern_type"

  success_rate:
    definition: "% of pattern usages that succeeded"
    target: ">= 85%"
    calculation: "successful_usages / total_usages"
    trend: "monitor for degradation"

  time_to_codification:
    definition: "Days from execution to published pattern"
    target: "<= 3 days"
    calculation: "pattern_published_date - first_observation_date"

  pattern_coverage:
    definition: "% of tasks supported by codified patterns"
    target: ">= 80%"
    calculation: "tasks_with_applicable_pattern / total_tasks"

  performance_impact:
    definition: "% change in task duration with pattern"
    baseline: "execution time without pattern"
    calculation: "((time_with - time_without) / time_without) * 100"
    target: ">= -20% (faster)"

  user_satisfaction:
    definition: "Agent feedback on pattern usefulness"
    scale: 1-5
    target: ">= 4.0"

  error_rate:
    definition: "% of pattern usages with errors"
    target: "<= 5%"

  deprecation_velocity:
    definition: "Time from deprecation notice to retirement"
    target: "90-120 days"

analytics_queries:
  # Get top patterns by adoption
  top_patterns_by_adoption: |
    SELECT pattern_id, adoption_rate, success_rate
    FROM pattern_metrics
    WHERE status = 'active'
    ORDER BY adoption_rate DESC
    LIMIT 10

  # Get patterns with degrading success rate
  degrading_patterns: |
    SELECT pattern_id,
           success_rate_30d,
           success_rate_7d,
           (success_rate_7d - success_rate_30d) as trend
    FROM pattern_metrics
    WHERE status = 'active'
    AND success_rate_7d < success_rate_30d * 0.9

  # Get time to codification
  codification_velocity: |
    SELECT
      DATE(pattern_published) as date,
      AVG(DATEDIFF(pattern_published, first_execution)) as avg_days,
      COUNT(*) as patterns_published
    FROM patterns
    WHERE pattern_published >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY DATE(pattern_published)
```

### Metrics Collection Architecture

```
Job Completion
  ↓
Execution Log Captured
  ├─ Duration
  ├─ Success/failure
  ├─ Error details
  └─ Resource usage
  ↓
Pattern Usage Detected
  ├─ Patterns used
  ├─ Pattern variants
  └─ A/B test assignment
  ↓
Metrics Event Emitted
  {
    job_id, pattern_id, success, duration,
    timestamp, ab_test_variant
  }
  ↓
Analytics Service
  ├─ Store in time-series DB
  ├─ Update pattern aggregates
  ├─ Calculate trends
  └─ Trigger alerts if degraded
  ↓
Dashboard Updated
  ├─ Real-time metrics
  ├─ Trend analysis
  └─ Alert notifications
```

### Sample Metrics Report

```yaml
# Sample weekly metrics report

report:
  period: "2025-11-14 to 2025-11-21"
  generated_at: 2025-11-21T15:00:00Z

summary:
  total_tasks: 487
  tasks_using_patterns: 358
  pattern_coverage: "73.5%"

  average_success_rate: "87.2%"
  average_adoption_rate: "62.1%"

top_patterns:
  - rank: 1
    id: rest-endpoint-implementation-v1
    usage_count: 94
    success_rate: "95.7%"
    adoption_rate: "89.4%"
    avg_duration_seconds: 1847
    trend: "stable"

  - rank: 2
    id: jwt-bearer-auth-v1
    usage_count: 67
    success_rate: "92.5%"
    adoption_rate: "78.2%"
    avg_duration_seconds: 312
    trend: "increasing (+12%)"

  - rank: 3
    id: input-validation-v1
    usage_count: 112
    success_rate: "88.4%"
    adoption_rate: "68.5%"
    trend: "stable"

concerning_patterns:
  - id: api-key-validation-v1
    success_rate: "79.2%"
    alert: "Below 85% threshold"
    recommendation: "Investigate failures or deprecate"

codification_metrics:
  patterns_published_this_week: 2
  avg_time_to_codification_days: 2.3
  total_patterns_active: 24
  patterns_deprecated_this_week: 1

performance_metrics:
  avg_task_duration_with_patterns: 1456
  avg_task_duration_without_patterns: 1687
  performance_improvement: "-13.7%"

trend_analysis:
  adoption_trend: "increasing (+8% month-over-month)"
  quality_trend: "stable (88.1% baseline)"
  coverage_trend: "increasing (+5% month-over-month)"
```

---

## 10. Example: Codifying REST Endpoint Pattern

### Phase 1: Raw Execution Logs

```yaml
# Execution 1: cfn-2025-11-15-001

execution:
  task_id: cfn-2025-11-15-001
  task_type: implement-feature
  status: completed
  success: true

  description: "Implement GET /api/users/{id} endpoint to fetch user profile"

  steps_executed:
    - step: 1
      name: "Analyze Requirements"
      status: completed
      duration_seconds: 145
      actions_taken:
        - "Extracted endpoint method: GET"
        - "Extracted path: /api/users/{id}"
        - "Identified path parameter: id (UUID)"
        - "Determined response includes: id, name, email, created_at"
        - "Determined endpoint requires JWT auth"
      decisions_made:
        - decision: "auth_required"
          chosen: true
          rationale: "Endpoint accesses user-specific data"

    - step: 2
      name: "Design Schemas"
      status: completed
      duration_seconds: 287
      actions_taken:
        - "Created UserProfileDTO interface"
        - "Added field validation: id (UUID), name (string), email (email)"
        - "Defined error responses: 401 Unauthorized, 404 Not Found"
      output:
        file: "src/dtos/user-profile.dto.ts"
        lines_written: 25

    - step: 3
      name: "Implement Handler"
      status: completed
      duration_seconds: 523
      actions_taken:
        - "Created Express route handler for GET /api/users/:id"
        - "Added JWT token validation"
        - "Implemented user lookup from database"
        - "Added error handling for 404, 401"
        - "Returned JSON response"
      decisions_made:
        - decision: "error_response_format"
          chosen: "detailed"
          rationale: "Client needs specific error codes for debugging"
      output:
        file: "src/routes/users.ts"
        lines_written: 48

    - step: 4
      name: "Write Tests"
      status: completed
      duration_seconds: 387
      actions_taken:
        - "Wrote happy path test (valid ID, valid token)"
        - "Wrote error test (invalid ID -> 404)"
        - "Wrote auth test (missing token -> 401)"
        - "Wrote validation test (invalid token -> 401)"
        - "All tests passing"
      output:
        file: "tests/routes/users.test.ts"
        test_count: 5
        coverage: "100%"

    - step: 5
      name: "Validate"
      status: completed
      duration_seconds: 78
      actions_taken:
        - "Ran full test suite: 5 passed"
        - "Updated API docs"
        - "Verified error messages"

  total_duration_seconds: 1420
  deliverables:
    - file: "src/routes/users.ts"
      lines: 48
      complexity: "medium"
    - file: "src/dtos/user-profile.dto.ts"
      lines: 25
    - file: "tests/routes/users.test.ts"
      lines: 180
      test_count: 5

  metrics:
    success: true
    test_pass_rate: 1.0
    code_review_approved: true
    performance_acceptable: true

---

# Execution 2: cfn-2025-11-17-003

execution:
  task_id: cfn-2025-11-17-003
  task_type: implement-feature
  status: completed
  success: true

  description: "Implement POST /api/posts endpoint to create new post"

  # Similar structure, but for POST endpoint
  # Decision on "error_response_format" again chose "detailed"
  # All core steps same sequence
  # Tests covered success + error cases

  total_duration_seconds: 1756
  metrics:
    success: true
    test_pass_rate: 1.0

---

# Execution 3: cfn-2025-11-19-005

execution:
  task_id: cfn-2025-11-19-005
  task_type: implement-feature
  status: completed
  success: true

  description: "Implement DELETE /api/posts/{id} endpoint"

  # Same pattern: analyze → design → implement → test → validate

  total_duration_seconds: 1634
  metrics:
    success: true
    test_pass_rate: 1.0
```

### Phase 2: Pattern Extraction

```yaml
# Extract common steps and decisions

EXTRACTED PATTERN: "REST Endpoint Implementation"

Common Steps (all 3 executions):
  1. Analyze Requirements (avg 145 sec, 100% present)
     - Extract HTTP method
     - Extract URL path
     - Extract parameters
     - Extract response schema
     - Determine auth requirements

  2. Design Request/Response Schemas (avg 287 sec, 100% present)
     - Create DTO interfaces
     - Add validation rules
     - Define error responses

  3. Implement Handler (avg 523 sec, 100% present)
     - Create route handler
     - Add input validation
     - Implement business logic
     - Add error handling

  4. Write Tests (avg 387 sec, 100% present)
     - Happy path test
     - Error case tests
     - Auth/validation tests

  5. Validate (avg 78 sec, 100% present)
     - Run test suite
     - Update documentation
     - Code review

Decision Points (recurring):
  - authentication_required: True in all 3 cases
  - error_response_detail: "detailed" chosen 3/3 times
  - test_coverage_target: 90%+ in all cases

Generalization Level: HIGH
  ✓ All steps context-agnostic (applies to any HTTP method)
  ✓ Technology-specific (Express/TypeScript) but generalizable to other frameworks
  ✓ Clear decision criteria
  ✓ Measurable postconditions
```

### Phase 3: Candidate Pattern

```yaml
# .patterns/candidates/rest-endpoint-candidate-001.yaml

id: rest-endpoint-implementation-candidate
extracted_from:
  executions:
    - cfn-2025-11-15-001  # GET /api/users/{id}
    - cfn-2025-11-17-003  # POST /api/posts
    - cfn-2025-11-19-005  # DELETE /api/posts/{id}

  extraction_date: 2025-11-21T08:00:00Z
  extractors: ["codification-pipeline"]

metadata:
  sample_size: 3
  success_rate: 1.0
  avg_duration_seconds: 1603
  avg_test_coverage: 0.98

  validation_status: pending

# [Use full schema from section 4]
```

### Phase 4: Validation

```bash
#!/bin/bash
# Validation results

PATTERN_FILE=".patterns/candidates/rest-endpoint-candidate-001.yaml"

# Test 1: Sample Size Check
echo "Test 1: Sample size >= 3"
SAMPLE_SIZE=$(yq '.metadata.sample_size' "$PATTERN_FILE")
[ "$SAMPLE_SIZE" -ge 3 ] && echo "✓ PASS ($SAMPLE_SIZE samples)" || echo "✗ FAIL"

# Test 2: Success Rate Check
echo "Test 2: Success rate >= 85%"
SUCCESS_RATE=$(yq '.metadata.success_rate' "$PATTERN_FILE")
python3 -c "exit(0 if float('$SUCCESS_RATE') >= 0.85 else 1)" && \
  echo "✓ PASS ($SUCCESS_RATE)" || echo "✗ FAIL"

# Test 3: Test Coverage
echo "Test 3: Test coverage >= 85%"
COVERAGE=$(yq '.metadata.avg_test_coverage' "$PATTERN_FILE")
python3 -c "exit(0 if float('$COVERAGE') >= 0.85 else 1)" && \
  echo "✓ PASS ($COVERAGE)" || echo "✗ FAIL"

# Test 4: Preconditions defined
echo "Test 4: Preconditions >= 2"
PRECONDITIONS=$(yq '.spec.preconditions | length' "$PATTERN_FILE")
[ "$PRECONDITIONS" -ge 2 ] && echo "✓ PASS ($PRECONDITIONS)" || echo "✗ FAIL"

# Test 5: Edge cases documented
echo "Test 5: Edge cases >= 3"
EDGE_CASES=$(yq '.spec.edge_cases | length' "$PATTERN_FILE")
[ "$EDGE_CASES" -ge 3 ] && echo "✓ PASS ($EDGE_CASES)" || echo "✗ FAIL"

# All tests passed
echo ""
echo "VALIDATION RESULT: ✓ PASSED"
echo "Pattern ready for human review and publication"
```

### Phase 5: Publication (Sample)

```bash
#!/bin/bash
# Publish approved pattern

# 1. Move from candidates to published
mv .patterns/candidates/rest-endpoint-candidate-001.yaml \
   .patterns/rest-endpoints/rest-endpoint-implementation-v1.yaml

# 2. Update REGISTRY
yq eval '.patterns.rest_endpoints += [{"id": "rest-endpoint-implementation", "latest_version": "v1"}]' \
   -i .patterns/REGISTRY.yaml

# 3. Commit to git
git add .patterns/
git commit -m "feat(patterns): publish REST endpoint implementation pattern v1

- Extracted from 3 successful executions (100% success rate)
- Covers GET, POST, DELETE methods
- Includes validation, error handling, test strategy
- Ready for production use"

# 4. Register in Redis
redis-cli SET "pattern:rest-endpoint-implementation:v1" \
  "$(cat .patterns/rest-endpoints/rest-endpoint-implementation-v1.yaml)"

# 5. Register in trigger.dev
curl -X POST https://api.trigger.dev/patterns/register \
  -H "Authorization: Bearer $TRIGGER_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "id": "rest-endpoint-implementation-v1",
  "name": "REST Endpoint Implementation",
  "success_rate": 1.0,
  "avg_duration_seconds": 1603,
  "applicable_task_types": ["implement-feature", "implement-endpoint"]
}
EOF

echo "✓ Pattern published and registered"
```

---

## Appendix: Quick Reference

### Pattern Extraction Checklist

```
□ Gather 3+ successful executions of same task type
□ Analyze execution logs for common steps
□ Identify generalizable vs. task-specific actions
□ Extract decision points and branching logic
□ Document preconditions and postconditions
□ Identify edge cases
□ Create candidate pattern (YAML)
□ Generate test cases from execution logs
```

### Validation Checklist

```
□ Sample size >= 3
□ Success rate >= 85%
□ Test coverage >= 85%
□ Preconditions (>= 2) clearly defined
□ Postconditions (>= 1) defined
□ Edge cases documented (>= 3)
□ Decision rules explicit
□ Examples provided (>= 2)
□ Security review (if applicable)
□ Performance review (if applicable)
```

### Publication Checklist

```
□ Validation passed (all gates)
□ Human review approved
□ PR merged to main branch
□ Pattern registered in git (.patterns/)
□ Pattern registered in Redis
□ Pattern registered in trigger.dev
□ REGISTRY.yaml updated
□ Documentation complete
□ Agent training updated
```

### Key Files

| File | Purpose |
|------|---------|
| `.patterns/REGISTRY.yaml` | Central pattern index |
| `.patterns/*/v*.yaml` | Published patterns |
| `.claude/skills/codification/` | Codification tools |
| `.patterns/validation-checklist.yaml` | Validation rules |
| `docs/migrations/` | Deprecation migration guides |

---

## Related Documents

- [CFN Loop Architecture](../guides/CFN_LOOP_ARCHITECTURE.md)
- [Agent Decision Framework](./AGENT_DECISION_FRAMEWORK.md)
- [trigger.dev Integration](./TRIGGER_DEV_INTEGRATION.md)
- [Playbook Development](./PLAYBOOK_DEVELOPMENT.md)
