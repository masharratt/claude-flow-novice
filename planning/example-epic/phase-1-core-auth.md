# Phase 1: Core Authentication System

**Phase ID**: `phase-1-core-auth`
**Epic**: `auth-system-v2`
**Status**: ❌ Not Started
**Dependencies**: None
**Estimated Duration**: 1 week

## Phase Description

Implement foundational JWT-based authentication system with:
- User registration and login endpoints
- Password hashing with bcrypt (cost factor: 12)
- JWT access tokens (15min TTL) and refresh tokens (7d TTL)
- Token validation middleware
- Basic user profile management

## Sprint Breakdown

### Sprint 1.1: User Registration & Password Security
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: None

**Tasks**:
1. Create User model (username, email, password hash, created_at, updated_at)
2. Implement password hashing service (bcrypt with salt rounds: 12)
3. Build POST /api/auth/register endpoint
   - Input validation (email format, password strength)
   - Duplicate email/username check
   - Store hashed password
4. Add email verification placeholder (Phase 4 will implement actual verification)

**Acceptance Criteria**:
- User can register with email, username, password
- Passwords hashed with bcrypt (never stored plaintext)
- Duplicate registrations prevented
- Input validation with clear error messages
- Tests: Unit tests for password hashing, integration tests for registration endpoint
- Coverage: ≥85%

**Deliverables**:
- `src/models/User.ts`
- `src/services/PasswordService.ts`
- `src/controllers/AuthController.ts` (register method)
- `src/validators/AuthValidator.ts`
- `tests/unit/services/PasswordService.test.ts`
- `tests/integration/auth/registration.test.ts`

---

### Sprint 1.2: JWT Token Generation
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Sprint 1.1

**Tasks**:
1. Implement JWT service (jsonwebtoken library)
2. Generate access tokens (payload: userId, username, role; TTL: 15min)
3. Generate refresh tokens (payload: userId; TTL: 7d)
4. Store refresh tokens in database with user association
5. Add token secret management (environment variables)

**Acceptance Criteria**:
- JWT access tokens generated with correct payload
- Refresh tokens generated and stored securely
- Token secrets loaded from environment variables (never hardcoded)
- Token expiration enforced
- Tests: Unit tests for token generation/verification, edge cases (expired tokens, invalid signatures)
- Coverage: ≥85%

**Deliverables**:
- `src/services/JWTService.ts`
- `src/models/RefreshToken.ts`
- `tests/unit/services/JWTService.test.ts`
- `.env.example` (updated with JWT_SECRET, JWT_REFRESH_SECRET)

---

### Sprint 1.3: Login Endpoint & Token Validation
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Sprint 1.1, Sprint 1.2

**Tasks**:
1. Build POST /api/auth/login endpoint
   - Validate credentials (username/email + password)
   - Compare password with bcrypt
   - Generate access + refresh tokens on success
2. Implement authentication middleware
   - Extract token from Authorization header
   - Verify token signature and expiration
   - Attach user data to request object
3. Add error handling (invalid credentials, expired tokens, missing tokens)

**Acceptance Criteria**:
- User can login with valid credentials
- Invalid credentials return 401 Unauthorized
- Access token and refresh token returned on successful login
- Authentication middleware protects routes
- Expired tokens rejected with clear error message
- Tests: Integration tests for login flow, middleware tests for protected routes
- Coverage: ≥85%

**Deliverables**:
- `src/controllers/AuthController.ts` (login method)
- `src/middleware/AuthMiddleware.ts`
- `tests/integration/auth/login.test.ts`
- `tests/integration/middleware/auth.test.ts`

---

### Sprint 1.4: Token Refresh & Logout
**Status**: ❌ Not Started
**Duration**: 1 day
**Dependencies**: Sprint 1.3

**Tasks**:
1. Build POST /api/auth/refresh endpoint
   - Accept refresh token
   - Validate refresh token (signature, expiration, database record)
   - Generate new access token
2. Build POST /api/auth/logout endpoint
   - Invalidate refresh token (delete from database)
   - Optional: Blacklist access token (Redis recommended for production)
3. Add token cleanup job (delete expired refresh tokens daily)

**Acceptance Criteria**:
- User can refresh access token with valid refresh token
- Invalid/expired refresh tokens rejected
- Logout invalidates refresh token
- Expired tokens automatically cleaned up
- Tests: Integration tests for refresh and logout flows
- Coverage: ≥85%

**Deliverables**:
- `src/controllers/AuthController.ts` (refresh, logout methods)
- `src/jobs/TokenCleanupJob.ts`
- `tests/integration/auth/refresh.test.ts`
- `tests/integration/auth/logout.test.ts`

---

### Sprint 1.5: User Profile Management
**Status**: ❌ Not Started
**Duration**: 1 day
**Dependencies**: Sprint 1.3

**Tasks**:
1. Build GET /api/users/me endpoint (protected route)
   - Return current user profile (exclude password hash)
2. Build PATCH /api/users/me endpoint
   - Allow updating username, email (with validation)
   - Prevent password updates (separate endpoint in Phase 4)
3. Add input validation and duplicate checks

**Acceptance Criteria**:
- Authenticated user can view own profile
- User can update username/email with validation
- Password hash never exposed in API responses
- Duplicate username/email prevented on update
- Tests: Integration tests for profile endpoints
- Coverage: ≥85%

**Deliverables**:
- `src/controllers/UserController.ts`
- `src/routes/users.ts`
- `tests/integration/users/profile.test.ts`

---

## Phase 1 Acceptance Criteria

- [ ] All 5 sprints completed with ≥75% confidence
- [ ] Integration between sprints validated (login uses registration data, refresh uses login tokens)
- [ ] No critical security vulnerabilities (bcrypt used, secrets in env, no plaintext passwords)
- [ ] Test coverage ≥85% across all sprints
- [ ] API documentation complete (endpoints, request/response formats, error codes)
- [ ] Consensus validation ≥90% from security-specialist and reviewer

## Dependencies for Future Phases

**Phase 2 (RBAC) depends on**:
- Sprint 1.3: Token validation middleware (will add role checks)
- User model (will add role field)

**Phase 3 (OAuth2) depends on**:
- Sprint 1.1: User model (will add OAuth provider fields)
- Sprint 1.2: JWT service (will generate tokens for OAuth users)

**Phase 4 (Security) depends on**:
- Sprint 1.3: Login endpoint (will add rate limiting)
- Sprint 1.4: Token refresh (will add suspicious activity detection)

## Notes

- **Cross-phase dependency**: Phase 2 Sprint 2.2 (Role-based route protection) depends on this phase's Sprint 1.3 (token validation infrastructure)
- Refresh token storage: Database for MVP, migrate to Redis in Phase 4 for performance
- Email verification: Placeholder in Sprint 1.1, actual implementation in Phase 4 Sprint 4.2
