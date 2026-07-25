# Success Criteria Examples Library

**Version:** 1.0
**Date:** 2025-11-16
**Purpose:** Reference library of 25+ success criteria examples for common CFN Loop tasks

---

## Table of Contents

1. [Simple Tasks](#simple-tasks)
2. [API Development](#api-development)
3. [Frontend Development](#frontend-development)
4. [Security Implementation](#security-implementation)
5. [Database & Data](#database--data)
6. [Testing & Quality](#testing--quality)
7. [DevOps & Infrastructure](#devops--infrastructure)
8. [Refactoring & Optimization](#refactoring--optimization)
9. [Documentation](#documentation)
10. [Complex Multi-Phase](#complex-multi-phase)

---

## Simple Tasks

### Example 1: Add Input Validation

**Complexity:** Low
**Duration:** 5-10 minutes
**Mode:** Task Mode (MVP)

```json
{
  "task_description": "Add input validation to user registration endpoint",
  "deliverables": [
    "src/api/validation/user-validation.ts",
    "tests/api/validation/user-validation.test.ts"
  ],
  "tests": [
    {
      "name": "User Validation Tests",
      "command": "npm test -- tests/api/validation/user-validation.test.ts",
      "pass_threshold": 1.0
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95
  }
}
```

**Expected Test Coverage:**
- Email format validation
- Password strength requirements
- Username uniqueness
- Required fields check
- Edge cases (empty strings, special characters)

---

### Example 2: Fix Bug in Payment Processing

**Complexity:** Low
**Duration:** 10-15 minutes
**Mode:** Task Mode (Standard)

```json
{
  "task_description": "Fix transaction rollback bug in payment processor (Bug #123)",
  "deliverables": [
    "src/services/payment-processor.ts",
    "tests/services/payment-processor.test.ts"
  ],
  "tests": [
    {
      "name": "Payment Processor Tests",
      "command": "npm test -- tests/services/payment-processor.test.ts",
      "pass_threshold": 1.0
    },
    {
      "name": "Regression Test - Bug #123",
      "command": "npm test -- tests/regression/bug-123-rollback.test.ts",
      "pass_threshold": 1.0
    }
  ],
  "quality_gates": {
    "test_coverage": 1.0,
    "security_scan": "zero_high_vulnerabilities"
  }
}
```

**Key Requirements:**
- Specific regression test for Bug #123
- 100% test coverage (critical payment logic)
- Security scan (financial data handling)

---

## API Development

### Example 3: REST API Endpoint

**Complexity:** Medium
**Duration:** 20-30 minutes
**Mode:** CLI Mode (Standard)

```json
{
  "task_description": "Create RESTful API endpoint for user profile management",
  "deliverables": [
    "src/routes/user-profile.ts",
    "src/controllers/user-profile-controller.ts",
    "src/middleware/profile-validation.ts",
    "tests/routes/user-profile.test.ts",
    "tests/integration/user-profile-flow.test.ts",
    "docs/api/USER_PROFILE_API.md"
  ],
  "tests": [
    {
      "name": "Unit Tests - User Profile Routes",
      "command": "npm test -- tests/routes/user-profile.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.4
    },
    {
      "name": "Integration Tests - Profile CRUD Flow",
      "command": "npm test -- tests/integration/user-profile-flow.test.ts",
      "pass_threshold": 0.95,
      "weight": 0.6
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "security_scan": "zero_high_vulnerabilities",
    "eslint": "zero_errors"
  }
}
```

**API Requirements:**
- GET /api/users/:id/profile
- PUT /api/users/:id/profile
- PATCH /api/users/:id/profile
- DELETE /api/users/:id/profile
- Input validation middleware
- Authentication required
- Rate limiting

---

### Example 4: GraphQL API

**Complexity:** Medium-High
**Duration:** 30-45 minutes
**Mode:** CLI Mode (Standard)

```json
{
  "task_description": "Implement GraphQL API for blog post management",
  "deliverables": [
    "src/graphql/schema/post.graphql",
    "src/graphql/resolvers/post-resolvers.ts",
    "src/graphql/types/post-types.ts",
    "tests/graphql/post-queries.test.ts",
    "tests/graphql/post-mutations.test.ts",
    "tests/integration/graphql-auth.test.ts"
  ],
  "tests": [
    {
      "name": "Unit Tests - GraphQL Queries",
      "command": "npm test -- tests/graphql/post-queries.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.3
    },
    {
      "name": "Unit Tests - GraphQL Mutations",
      "command": "npm test -- tests/graphql/post-mutations.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.3
    },
    {
      "name": "Integration Tests - Auth + N+1 Prevention",
      "command": "npm test -- tests/integration/graphql-auth.test.ts",
      "pass_threshold": 0.95,
      "weight": 0.4
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "security_scan": "zero_high_vulnerabilities",
    "complexity": 10
  }
}
```

**GraphQL Schema:**
```graphql
type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
  createdAt: DateTime!
}

type Query {
  posts: [Post!]!
  post(id: ID!): Post
}

type Mutation {
  createPost(input: CreatePostInput!): Post!
  updatePost(id: ID!, input: UpdatePostInput!): Post!
  deletePost(id: ID!): Boolean!
}
```

---

## Frontend Development

### Example 5: React Component with Tests

**Complexity:** Medium
**Duration:** 25-35 minutes
**Mode:** CLI Mode (Standard)

```json
{
  "task_description": "Create reusable authentication form component in React",
  "deliverables": [
    "src/components/AuthForm/AuthForm.tsx",
    "src/components/AuthForm/AuthForm.module.css",
    "src/components/AuthForm/types.ts",
    "src/components/AuthForm/index.ts",
    "tests/components/AuthForm.test.tsx",
    "tests/components/AuthForm.accessibility.test.tsx"
  ],
  "tests": [
    {
      "name": "Unit Tests - AuthForm Component",
      "command": "npm test -- tests/components/AuthForm.test.tsx",
      "pass_threshold": 1.0,
      "weight": 0.6
    },
    {
      "name": "Accessibility Tests - WCAG Compliance",
      "command": "npm test -- tests/components/AuthForm.accessibility.test.tsx",
      "pass_threshold": 1.0,
      "weight": 0.4
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "eslint": "zero_errors",
    "accessibility": "wcag_aa_compliant"
  }
}
```

**Component Requirements:**
- Email + password fields
- Form validation (client-side)
- Error message display
- Loading state handling
- Accessible (ARIA labels, keyboard nav)
- Responsive design (mobile-first)

---

### Example 6: State Management with Redux

**Complexity:** Medium-High
**Duration:** 40-50 minutes
**Mode:** CLI Mode (Standard)

```json
{
  "task_description": "Implement Redux store for shopping cart management",
  "deliverables": [
    "src/store/cart/cartSlice.ts",
    "src/store/cart/cartSelectors.ts",
    "src/store/cart/cartTypes.ts",
    "src/store/cart/cartThunks.ts",
    "tests/store/cart/cartSlice.test.ts",
    "tests/store/cart/cartSelectors.test.ts",
    "tests/store/cart/cartThunks.test.ts"
  ],
  "tests": [
    {
      "name": "Unit Tests - Cart Slice",
      "command": "npm test -- tests/store/cart/cartSlice.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.4
    },
    {
      "name": "Unit Tests - Cart Selectors",
      "command": "npm test -- tests/store/cart/cartSelectors.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.3
    },
    {
      "name": "Integration Tests - Cart Thunks",
      "command": "npm test -- tests/store/cart/cartThunks.test.ts",
      "pass_threshold": 0.95,
      "weight": 0.3
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "eslint": "zero_errors"
  }
}
```

**State Management Features:**
- Add/remove items
- Update quantities
- Calculate totals
- Apply discounts/coupons
- Persist to localStorage
- Sync with backend API

---

## Security Implementation

### Example 7: JWT Authentication

**Complexity:** High
**Duration:** 45-60 minutes
**Mode:** CLI Mode (Enterprise)

```json
{
  "task_description": "Implement JWT-based authentication system with refresh tokens",
  "deliverables": [
    "src/middleware/auth.ts",
    "src/services/jwt-service.ts",
    "src/services/token-refresh-service.ts",
    "src/config/auth-config.ts",
    "tests/middleware/auth.test.ts",
    "tests/services/jwt-service.test.ts",
    "tests/integration/auth-flow.test.ts",
    "tests/security/auth-security.test.ts",
    "docs/AUTH_IMPLEMENTATION.md"
  ],
  "tests": [
    {
      "name": "Unit Tests - Auth Middleware",
      "command": "npm test -- tests/middleware/auth.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.25
    },
    {
      "name": "Unit Tests - JWT Service",
      "command": "npm test -- tests/services/jwt-service.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.25
    },
    {
      "name": "Integration Tests - Auth Flow",
      "command": "npm test -- tests/integration/auth-flow.test.ts",
      "pass_threshold": 0.95,
      "weight": 0.3
    },
    {
      "name": "Security Tests - Auth Vulnerabilities",
      "command": "npm test -- tests/security/auth-security.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.2
    }
  ],
  "quality_gates": {
    "test_coverage": 0.98,
    "security_scan": "zero_high_vulnerabilities",
    "mutation_score": 0.85,
    "eslint": "zero_errors"
  }
}
```

**Security Requirements:**
- JWT signature validation
- Token expiration enforcement
- Refresh token rotation
- Rate limiting (login attempts)
- Secure password hashing (bcrypt)
- CSRF protection
- XSS prevention

**Security Test Cases:**
- Invalid JWT signature rejection
- Expired token rejection
- Token replay attack prevention
- SQL injection prevention
- Password timing attack prevention

---

### Example 8: OAuth2 Integration

**Complexity:** High
**Duration:** 60-90 minutes
**Mode:** CLI Mode (Enterprise)

```json
{
  "task_description": "Implement OAuth2 authentication with Google/GitHub providers",
  "deliverables": [
    "src/auth/oauth2-strategy.ts",
    "src/auth/providers/google-provider.ts",
    "src/auth/providers/github-provider.ts",
    "src/auth/oauth2-callback-handler.ts",
    "src/config/oauth2-config.ts",
    "tests/auth/oauth2-strategy.test.ts",
    "tests/auth/providers/google-provider.test.ts",
    "tests/auth/providers/github-provider.test.ts",
    "tests/integration/oauth2-flow.test.ts",
    "docs/OAUTH2_SETUP.md"
  ],
  "tests": [
    {
      "name": "Unit Tests - OAuth2 Strategy",
      "command": "npm test -- tests/auth/oauth2-strategy.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.3
    },
    {
      "name": "Unit Tests - Google Provider",
      "command": "npm test -- tests/auth/providers/google-provider.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.2
    },
    {
      "name": "Unit Tests - GitHub Provider",
      "command": "npm test -- tests/auth/providers/github-provider.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.2
    },
    {
      "name": "Integration Tests - OAuth2 Flow",
      "command": "npm test -- tests/integration/oauth2-flow.test.ts",
      "pass_threshold": 0.90,
      "weight": 0.3
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "security_scan": "zero_high_vulnerabilities",
    "eslint": "zero_errors"
  }
}
```

**OAuth2 Flow:**
1. User clicks "Login with Google/GitHub"
2. Redirect to provider authorization
3. User authorizes application
4. Callback with authorization code
5. Exchange code for access token
6. Retrieve user profile
7. Create/update user account
8. Issue JWT session token

---

## Database & Data

### Example 9: Database Migration

**Complexity:** Medium
**Duration:** 20-30 minutes
**Mode:** CLI Mode (Standard)

```json
{
  "task_description": "Create database migration for user roles and permissions",
  "deliverables": [
    "migrations/20251116_add_user_roles.sql",
    "src/models/role.ts",
    "src/models/permission.ts",
    "tests/migrations/20251116_add_user_roles.test.ts",
    "tests/models/role.test.ts"
  ],
  "tests": [
    {
      "name": "Migration Tests - Schema Validation",
      "command": "npm test -- tests/migrations/20251116_add_user_roles.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.5
    },
    {
      "name": "Model Tests - Role CRUD",
      "command": "npm test -- tests/models/role.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.5
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "migration_reversible": true
  }
}
```

**Migration Requirements:**
- CREATE TABLE roles
- CREATE TABLE permissions
- CREATE TABLE user_roles (many-to-many)
- Add indexes for performance
- Seed default roles (admin, user, guest)
- Rollback script included

---

### Example 10: Data Processing Pipeline

**Complexity:** High
**Duration:** 60-90 minutes
**Mode:** CLI Mode (Enterprise)

```json
{
  "task_description": "Build ETL pipeline for analytics data processing",
  "deliverables": [
    "src/pipelines/analytics-etl.ts",
    "src/extractors/raw-data-extractor.ts",
    "src/transformers/data-cleaner.ts",
    "src/loaders/warehouse-loader.ts",
    "tests/pipelines/analytics-etl.test.ts",
    "tests/extractors/raw-data-extractor.test.ts",
    "tests/transformers/data-cleaner.test.ts",
    "tests/integration/etl-pipeline.test.ts",
    "docs/ETL_ARCHITECTURE.md"
  ],
  "tests": [
    {
      "name": "Unit Tests - Data Extractor",
      "command": "npm test -- tests/extractors/raw-data-extractor.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.25
    },
    {
      "name": "Unit Tests - Data Transformer",
      "command": "npm test -- tests/transformers/data-cleaner.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.25
    },
    {
      "name": "Unit Tests - Data Loader",
      "command": "npm test -- tests/loaders/warehouse-loader.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.25
    },
    {
      "name": "Integration Tests - End-to-End Pipeline",
      "command": "npm test -- tests/integration/etl-pipeline.test.ts",
      "pass_threshold": 0.95,
      "weight": 0.25
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "performance": "1000_records_per_second",
    "data_quality": "zero_validation_errors"
  }
}
```

**Pipeline Stages:**
1. **Extract:** Pull raw data from source databases
2. **Transform:** Clean, deduplicate, aggregate
3. **Load:** Insert into data warehouse
4. **Validate:** Data quality checks

---

## Testing & Quality

### Example 11: Contract Testing Suite

**Complexity:** Medium
**Duration:** 30-40 minutes
**Mode:** CLI Mode (Standard)

```json
{
  "task_description": "Implement Pact contract tests for microservice communication",
  "deliverables": [
    "tests/contracts/user-service-consumer.pact.ts",
    "tests/contracts/user-service-provider.pact.ts",
    "pacts/consumer-user-service.json"
  ],
  "tests": [
    {
      "name": "Consumer Contract Tests",
      "command": "npm test -- tests/contracts/user-service-consumer.pact.ts",
      "pass_threshold": 1.0,
      "weight": 0.5
    },
    {
      "name": "Provider Contract Verification",
      "command": "npm run test:pact:verify",
      "pass_threshold": 1.0,
      "weight": 0.5
    }
  ],
  "quality_gates": {
    "test_coverage": 1.0,
    "contract_published": true
  }
}
```

**Contract Requirements:**
- Consumer expectations defined
- Provider verification passes
- Pact published to broker
- Breaking changes detected

---

### Example 12: Mutation Testing Implementation

**Complexity:** Medium-High
**Duration:** 40-60 minutes
**Mode:** CLI Mode (Standard)

```json
{
  "task_description": "Implement mutation testing for authentication module",
  "deliverables": [
    "stryker.conf.json",
    "tests/mutation/auth-mutation.test.ts",
    "docs/MUTATION_TESTING_REPORT.md"
  ],
  "tests": [
    {
      "name": "Unit Tests - Auth Module (Pre-Mutation)",
      "command": "npm test -- tests/middleware/auth.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.3
    },
    {
      "name": "Mutation Testing - Auth Module",
      "command": "npm run test:mutation -- src/middleware/auth.ts",
      "pass_threshold": 0.85,
      "weight": 0.7
    }
  ],
  "quality_gates": {
    "mutation_score": 0.85,
    "test_coverage": 0.95,
    "zero_survivors": false
  }
}
```

**Mutation Score Target:** ≥85%
**Mutation Operators:**
- Arithmetic operators (+ → -, * → /)
- Relational operators (> → ≥, === → !==)
- Conditional boundaries
- Statement removal

---

## DevOps & Infrastructure

### Example 13: Docker Containerization

**Complexity:** Medium
**Duration:** 30-45 minutes
**Mode:** CLI Mode (Standard)

```json
{
  "task_description": "Containerize Node.js application with multi-stage Docker build",
  "deliverables": [
    "Dockerfile",
    "docker-compose.yml",
    ".dockerignore",
    "scripts/docker-build.sh",
    "scripts/docker-test.sh",
    "tests/docker/container-health.test.sh",
    "docs/DOCKER_DEPLOYMENT.md"
  ],
  "tests": [
    {
      "name": "Docker Build Test",
      "command": "bash scripts/docker-test.sh",
      "pass_threshold": 1.0,
      "weight": 0.4
    },
    {
      "name": "Container Health Check",
      "command": "bash tests/docker/container-health.test.sh",
      "pass_threshold": 1.0,
      "weight": 0.3
    },
    {
      "name": "Image Security Scan",
      "command": "docker scan app:latest",
      "pass_threshold": 0.95,
      "weight": 0.3
    }
  ],
  "quality_gates": {
    "image_size": "200MB",
    "security_scan": "zero_high_vulnerabilities",
    "build_time": "60_seconds"
  }
}
```

**Docker Requirements:**
- Multi-stage build (builder + runtime)
- Non-root user
- Health check endpoint
- .dockerignore optimized
- Layer caching optimized
- Security scan passes

---

### Example 14: CI/CD Pipeline

**Complexity:** High
**Duration:** 60-90 minutes
**Mode:** CLI Mode (Enterprise)

```json
{
  "task_description": "Implement GitHub Actions CI/CD pipeline with automated testing and deployment",
  "deliverables": [
    ".github/workflows/ci.yml",
    ".github/workflows/cd.yml",
    "scripts/ci/run-tests.sh",
    "scripts/ci/build-docker.sh",
    "scripts/cd/deploy-staging.sh",
    "tests/ci/pipeline-validation.test.sh",
    "docs/CICD_PIPELINE.md"
  ],
  "tests": [
    {
      "name": "Pipeline Validation Tests",
      "command": "bash tests/ci/pipeline-validation.test.sh",
      "pass_threshold": 1.0,
      "weight": 0.4
    },
    {
      "name": "Smoke Tests - Staging Deployment",
      "command": "npm run test:smoke:staging",
      "pass_threshold": 1.0,
      "weight": 0.6
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "security_scan": "zero_high_vulnerabilities",
    "deploy_time": "5_minutes"
  }
}
```

**CI Pipeline Stages:**
1. Lint (ESLint, Prettier)
2. Unit Tests (Jest)
3. Integration Tests (Supertest)
4. Security Scan (Snyk)
5. Build Docker Image
6. Push to Registry

**CD Pipeline Stages:**
1. Pull from Registry
2. Deploy to Staging
3. Run Smoke Tests
4. Deploy to Production (manual approval)
5. Health Check Validation

---

## Refactoring & Optimization

### Example 15: Code Refactoring

**Complexity:** Medium
**Duration:** 30-45 minutes
**Mode:** CLI Mode (Standard)

```json
{
  "task_description": "Refactor legacy user authentication module to improve maintainability",
  "deliverables": [
    "src/services/auth-service-refactored.ts",
    "tests/services/auth-service-refactored.test.ts",
    "tests/regression/auth-behavior-preservation.test.ts"
  ],
  "tests": [
    {
      "name": "Unit Tests - Refactored Auth Service",
      "command": "npm test -- tests/services/auth-service-refactored.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.5
    },
    {
      "name": "Regression Tests - Behavior Preservation",
      "command": "npm test -- tests/regression/auth-behavior-preservation.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.5
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "complexity": 8,
    "duplicate_code": 0.03,
    "eslint": "zero_errors"
  }
}
```

**Refactoring Goals:**
- Reduce cyclomatic complexity (15 → 8)
- Eliminate code duplication
- Extract helper functions
- Improve error handling
- Add TypeScript strict mode

**Critical:** Regression tests must pass 100% (no behavior changes)

---

### Example 16: Performance Optimization

**Complexity:** High
**Duration:** 60-90 minutes
**Mode:** CLI Mode (Enterprise)

```json
{
  "task_description": "Optimize database query performance for user dashboard",
  "deliverables": [
    "src/repositories/user-dashboard-repository.ts",
    "src/services/cache-service.ts",
    "migrations/20251116_add_dashboard_indexes.sql",
    "tests/repositories/user-dashboard-repository.test.ts",
    "tests/performance/dashboard-load-time.test.ts",
    "docs/PERFORMANCE_OPTIMIZATION_REPORT.md"
  ],
  "tests": [
    {
      "name": "Unit Tests - Dashboard Repository",
      "command": "npm test -- tests/repositories/user-dashboard-repository.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.3
    },
    {
      "name": "Performance Tests - Load Time",
      "command": "npm test -- tests/performance/dashboard-load-time.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.7
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "response_time": "200ms",
    "database_queries": 3,
    "cache_hit_rate": 0.80
  }
}
```

**Performance Targets:**
- Dashboard load time: <200ms (was 1500ms)
- Database queries: ≤3 (was 15 - N+1 problem)
- Cache hit rate: ≥80%
- Memory usage: <50MB per request

**Optimization Techniques:**
- Add database indexes
- Implement Redis caching
- Batch database queries
- Use database views
- Lazy loading for non-critical data

---

## Documentation

### Example 17: API Documentation

**Complexity:** Low-Medium
**Duration:** 20-30 minutes
**Mode:** Task Mode (Standard)

```json
{
  "task_description": "Generate comprehensive API documentation with OpenAPI/Swagger",
  "deliverables": [
    "docs/api/openapi.yaml",
    "docs/api/README.md",
    "docs/api/AUTHENTICATION.md",
    "docs/api/ENDPOINTS.md",
    "tests/docs/openapi-validation.test.ts"
  ],
  "tests": [
    {
      "name": "OpenAPI Spec Validation",
      "command": "npm test -- tests/docs/openapi-validation.test.ts",
      "pass_threshold": 1.0
    },
    {
      "name": "API Contract Compliance",
      "command": "npm run test:api:compliance",
      "pass_threshold": 1.0
    }
  ],
  "quality_gates": {
    "spec_valid": true,
    "examples_provided": true,
    "all_endpoints_documented": true
  }
}
```

**Documentation Requirements:**
- OpenAPI 3.0 specification
- All endpoints documented
- Request/response examples
- Authentication flows
- Error codes and messages
- Rate limiting information

---

### Example 18: Architecture Documentation

**Complexity:** Medium
**Duration:** 30-45 minutes
**Mode:** Task Mode (Standard)

```json
{
  "task_description": "Document microservices architecture with C4 diagrams",
  "deliverables": [
    "docs/architecture/SYSTEM_ARCHITECTURE.md",
    "docs/architecture/diagrams/c4-context.puml",
    "docs/architecture/diagrams/c4-container.puml",
    "docs/architecture/diagrams/c4-component.puml",
    "docs/architecture/DATA_FLOW.md",
    "docs/architecture/DEPLOYMENT.md"
  ],
  "tests": [
    {
      "name": "Diagram Validation",
      "command": "bash tests/docs/validate-diagrams.sh",
      "pass_threshold": 1.0
    },
    {
      "name": "Documentation Completeness Check",
      "command": "bash tests/docs/completeness-check.sh",
      "pass_threshold": 1.0
    }
  ],
  "quality_gates": {
    "all_services_documented": true,
    "diagrams_renderable": true,
    "deployment_steps_complete": true
  }
}
```

**Architecture Documentation:**
- C4 Context Diagram (system landscape)
- C4 Container Diagram (services, databases)
- C4 Component Diagram (internal structure)
- Data flow diagrams
- Deployment architecture
- Service dependencies

---

## Complex Multi-Phase

### Example 19: E-Commerce Checkout System

**Complexity:** Very High
**Duration:** 2-3 hours
**Mode:** CLI Mode (Enterprise)

```json
{
  "task_description": "Build complete e-commerce checkout system with payment processing",
  "deliverables": [
    "src/services/checkout-service.ts",
    "src/services/payment-processor.ts",
    "src/services/inventory-service.ts",
    "src/services/order-service.ts",
    "src/workflows/checkout-workflow.ts",
    "tests/services/checkout-service.test.ts",
    "tests/services/payment-processor.test.ts",
    "tests/integration/checkout-flow.test.ts",
    "tests/integration/payment-flow.test.ts",
    "tests/e2e/complete-checkout.e2e.test.ts",
    "tests/security/payment-security.test.ts",
    "docs/CHECKOUT_ARCHITECTURE.md",
    "docs/PAYMENT_INTEGRATION.md"
  ],
  "tests": [
    {
      "name": "Unit Tests - Checkout Service",
      "command": "npm test -- tests/services/checkout-service.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.15
    },
    {
      "name": "Unit Tests - Payment Processor",
      "command": "npm test -- tests/services/payment-processor.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.15
    },
    {
      "name": "Unit Tests - Inventory Service",
      "command": "npm test -- tests/services/inventory-service.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.1
    },
    {
      "name": "Integration Tests - Checkout Flow",
      "command": "npm test -- tests/integration/checkout-flow.test.ts",
      "pass_threshold": 0.95,
      "weight": 0.2
    },
    {
      "name": "Integration Tests - Payment Flow",
      "command": "npm test -- tests/integration/payment-flow.test.ts",
      "pass_threshold": 0.95,
      "weight": 0.2
    },
    {
      "name": "E2E Tests - Complete Checkout",
      "command": "npm test -- tests/e2e/complete-checkout.e2e.test.ts",
      "pass_threshold": 0.90,
      "weight": 0.15
    },
    {
      "name": "Security Tests - Payment Security",
      "command": "npm test -- tests/security/payment-security.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.05
    }
  ],
  "quality_gates": {
    "test_coverage": 0.98,
    "security_scan": "zero_high_vulnerabilities",
    "mutation_score": 0.85,
    "performance": "checkout_complete_2000ms",
    "pci_dss_compliant": true
  }
}
```

**Checkout Workflow:**
1. Cart validation
2. Inventory reservation
3. Price calculation (discounts, taxes)
4. Payment processing
5. Order creation
6. Inventory update
7. Confirmation email
8. Webhook notifications

**Critical Requirements:**
- PCI DSS compliance (no card data storage)
- Transaction rollback on failure
- Idempotency (prevent duplicate orders)
- Rate limiting (prevent abuse)
- Comprehensive error handling

---

### Example 20: Real-Time Chat Application

**Complexity:** Very High
**Duration:** 2-4 hours
**Mode:** CLI Mode (Enterprise)

```json
{
  "task_description": "Build scalable real-time chat application with WebSocket support",
  "deliverables": [
    "src/services/websocket-service.ts",
    "src/services/chat-service.ts",
    "src/services/presence-service.ts",
    "src/services/message-queue-service.ts",
    "src/repositories/message-repository.ts",
    "src/repositories/room-repository.ts",
    "tests/services/websocket-service.test.ts",
    "tests/services/chat-service.test.ts",
    "tests/integration/websocket-flow.test.ts",
    "tests/integration/multi-user-chat.test.ts",
    "tests/load/concurrent-connections.test.ts",
    "docs/CHAT_ARCHITECTURE.md",
    "docs/SCALABILITY_DESIGN.md"
  ],
  "tests": [
    {
      "name": "Unit Tests - WebSocket Service",
      "command": "npm test -- tests/services/websocket-service.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.2
    },
    {
      "name": "Unit Tests - Chat Service",
      "command": "npm test -- tests/services/chat-service.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.2
    },
    {
      "name": "Integration Tests - WebSocket Flow",
      "command": "npm test -- tests/integration/websocket-flow.test.ts",
      "pass_threshold": 0.95,
      "weight": 0.2
    },
    {
      "name": "Integration Tests - Multi-User Chat",
      "command": "npm test -- tests/integration/multi-user-chat.test.ts",
      "pass_threshold": 0.95,
      "weight": 0.2
    },
    {
      "name": "Load Tests - Concurrent Connections",
      "command": "npm test -- tests/load/concurrent-connections.test.ts",
      "pass_threshold": 0.90,
      "weight": 0.2
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "security_scan": "zero_high_vulnerabilities",
    "performance": "message_latency_100ms",
    "scalability": "1000_concurrent_connections"
  }
}
```

**Chat Features:**
- Real-time messaging (WebSocket)
- User presence (online/offline/typing)
- Message persistence (PostgreSQL)
- Message history pagination
- Read receipts
- Typing indicators
- Room/channel support
- Private messages

**Scalability Requirements:**
- Support 1,000+ concurrent connections
- Message latency <100ms
- Horizontal scaling (Redis pub/sub)
- Message queue (RabbitMQ/Redis Streams)
- Database connection pooling

---

## Additional Examples (Quick Reference)

### Example 21: Webhook Integration
```json
{
  "task_description": "Implement webhook system for third-party integrations",
  "tests": [
    {"name": "Unit Tests", "command": "npm test -- tests/webhooks/", "pass_threshold": 1.0},
    {"name": "Integration Tests", "command": "npm test -- tests/integration/webhook-flow.test.ts", "pass_threshold": 0.95}
  ],
  "quality_gates": {"test_coverage": 0.95, "security_scan": "zero_high_vulnerabilities"}
}
```

### Example 22: Rate Limiting Middleware
```json
{
  "task_description": "Add rate limiting to prevent API abuse",
  "tests": [
    {"name": "Unit Tests", "command": "npm test -- tests/middleware/rate-limit.test.ts", "pass_threshold": 1.0},
    {"name": "Load Tests", "command": "npm run test:load:rate-limit", "pass_threshold": 1.0}
  ],
  "quality_gates": {"test_coverage": 1.0, "performance": "10000_requests_per_minute"}
}
```

### Example 23: File Upload System
```json
{
  "task_description": "Implement secure file upload with S3 integration",
  "tests": [
    {"name": "Unit Tests", "command": "npm test -- tests/services/file-upload.test.ts", "pass_threshold": 1.0},
    {"name": "Security Tests", "command": "npm test -- tests/security/file-validation.test.ts", "pass_threshold": 1.0}
  ],
  "quality_gates": {"test_coverage": 0.95, "security_scan": "zero_high_vulnerabilities", "max_file_size": "10MB"}
}
```

### Example 24: Search Functionality (Elasticsearch)
```json
{
  "task_description": "Implement full-text search with Elasticsearch",
  "tests": [
    {"name": "Unit Tests", "command": "npm test -- tests/services/search-service.test.ts", "pass_threshold": 1.0},
    {"name": "Integration Tests", "command": "npm test -- tests/integration/search-flow.test.ts", "pass_threshold": 0.95}
  ],
  "quality_gates": {"test_coverage": 0.95, "performance": "search_latency_200ms"}
}
```

### Example 25: Notification System
```json
{
  "task_description": "Build multi-channel notification system (email, SMS, push)",
  "tests": [
    {"name": "Unit Tests - Email", "command": "npm test -- tests/notifications/email.test.ts", "pass_threshold": 1.0, "weight": 0.4},
    {"name": "Unit Tests - SMS", "command": "npm test -- tests/notifications/sms.test.ts", "pass_threshold": 1.0, "weight": 0.3},
    {"name": "Unit Tests - Push", "command": "npm test -- tests/notifications/push.test.ts", "pass_threshold": 1.0, "weight": 0.3}
  ],
  "quality_gates": {"test_coverage": 0.95, "delivery_rate": 0.99}
}
```

---

## Best Practices Summary

### 1. **Deliverables**
- List ALL files that will be created/modified
- Include tests alongside implementation files
- Add documentation for complex features
- Use specific file paths (relative to project root)

### 2. **Tests**
- Separate unit, integration, and E2E tests
- Set realistic pass thresholds (1.0 for unit, 0.95 for integration, 0.90 for E2E)
- Use weighted scoring for multi-suite testing
- Include security/performance tests when relevant

### 3. **Quality Gates**
- Always include `test_coverage` (≥0.95 recommended)
- Add `security_scan: "zero_high_vulnerabilities"` for production code
- Set `mutation_score` for critical business logic (≥0.85)
- Include performance gates for latency-sensitive features

### 4. **Task Description**
- Be specific and actionable
- Include business context when relevant
- Reference bug IDs for fixes
- Specify technology stack if non-standard

### 5. **Mode Selection**
- Use **MVP mode** for simple tasks (<10 min, ≤2 deliverables)
- Use **Standard mode** for typical features (10-60 min, 3-7 deliverables)
- Use **Enterprise mode** for complex systems (60+ min, 8+ deliverables, strict quality)

---

**See Also:**
- `docs/guides/TEST_DRIVEN_CFN_LOOP_GUIDE.md` - Comprehensive test-driven development guide
- `docs/migration/CONFIDENCE_TO_TEST_DRIVEN_MIGRATION.md` - Migration from confidence-based scoring
- `planning/cli-improvements/COMPREHENSIVE_TDD_GATE_IMPLEMENTATION_PLAN.md` - Full implementation plan

---

**Document Version:** 1.0
**Last Updated:** 2025-11-16
**Examples Count:** 25
**Next Review:** 2025-12-01
