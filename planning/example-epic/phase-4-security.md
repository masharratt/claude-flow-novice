# Phase 4: Security Hardening

**Phase ID**: `phase-4-security`
**Epic**: `auth-system-v2`
**Status**: ❌ Not Started
**Dependencies**: Phase 1 (Core Auth), Phase 2 (RBAC), Phase 3 (OAuth2)
**Estimated Duration**: 1 week

## Phase Description

Comprehensive security hardening and monitoring:
- Rate limiting on authentication endpoints
- Brute force protection
- Security audit logging
- CSRF protection
- Helmet.js security headers
- Penetration testing and vulnerability fixes

## Sprint Breakdown

### Sprint 4.1: Rate Limiting & Brute Force Protection
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Phase 1 Sprint 1.3 (Login endpoint), Phase 3 Sprint 3.3 (OAuth2 endpoints)

**Cross-Phase Dependency**: This sprint depends on Phase 3 Sprint 3.3 (OAuth2 endpoints for rate limiting)

**Tasks**:
1. Install express-rate-limit and rate-limit-redis
2. Implement rate limiting:
   - Login endpoint: 5 attempts per 15 minutes per IP
   - Registration endpoint: 3 attempts per hour per IP
   - Password reset: 3 attempts per hour per email
   - OAuth2 endpoints: 10 attempts per hour per IP
3. Implement account lockout:
   - Lock account after 10 failed login attempts
   - 1-hour cooldown period
   - Email notification on account lockout
4. Add admin exemption (admins bypass rate limiting with valid token)

**Acceptance Criteria**:
- Rate limiting enforced on all auth endpoints
- Account lockout after repeated failures
- Admins can bypass rate limits
- Clear error messages for rate-limited requests
- Tests: Integration tests for rate limiting scenarios
- Coverage: ≥85%

**Deliverables**:
- `src/middleware/RateLimitMiddleware.ts`
- `src/services/AccountLockoutService.ts`
- `src/config/rate-limit.ts`
- `tests/integration/security/rate-limiting.test.ts`
- `tests/integration/security/account-lockout.test.ts`

---

### Sprint 4.2: Security Audit Logging
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Phase 1 Sprint 1.3 (Login), Phase 2 Sprint 2.2 (Permission checks)

**Tasks**:
1. Create AuditLog model (userId, action, resource, ip, userAgent, success, timestamp)
2. Implement audit logging service
3. Log security events:
   - Login attempts (success/failure)
   - Registration
   - Password changes
   - Role assignments
   - Permission changes
   - Account lockouts
   - OAuth2 linking/unlinking
4. Build admin audit log viewer:
   - GET /api/admin/audit-logs - List all logs (paginated, filterable)
   - GET /api/admin/audit-logs/user/:id - User-specific logs

**Acceptance Criteria**:
- All security events logged with full context
- Audit logs immutable (no updates/deletes)
- Admin can view and filter logs
- Logs include IP address and user agent
- Tests: Unit tests for logging service, integration tests for log viewer
- Coverage: ≥85%

**Deliverables**:
- `src/models/AuditLog.ts`
- `src/services/AuditLogService.ts`
- `src/controllers/AuditLogController.ts`
- `src/routes/admin.ts` (updated)
- `tests/unit/services/AuditLogService.test.ts`
- `tests/integration/admin/audit-logs.test.ts`

---

### Sprint 4.3: CSRF & Security Headers
**Status**: ❌ Not Started
**Duration**: 1 day
**Dependencies**: Phase 1 Sprint 1.3 (Auth middleware)

**Tasks**:
1. Install helmet and csurf
2. Configure Helmet.js security headers:
   - Content-Security-Policy
   - X-Frame-Options: DENY
   - X-Content-Type-Options: nosniff
   - Referrer-Policy: strict-origin-when-cross-origin
3. Implement CSRF protection:
   - Generate CSRF tokens for state-changing operations
   - Validate CSRF tokens on POST/PATCH/DELETE
   - Exemption for API token authentication
4. Add secure cookie configuration (httpOnly, secure, sameSite)

**Acceptance Criteria**:
- Security headers set on all responses
- CSRF protection on state-changing endpoints
- Cookies configured securely
- API token auth bypasses CSRF (stateless)
- Tests: Integration tests for CSRF validation
- Coverage: ≥85%

**Deliverables**:
- `src/middleware/SecurityMiddleware.ts`
- `src/config/helmet.ts`
- `tests/integration/security/csrf.test.ts`
- `tests/integration/security/headers.test.ts`

---

### Sprint 4.4: Penetration Testing & Fixes
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Sprint 4.1, Sprint 4.2, Sprint 4.3

**Tasks**:
1. Run automated security scans:
   - npm audit (dependency vulnerabilities)
   - OWASP ZAP (web application scanning)
   - SQLMap (SQL injection testing)
2. Manual penetration testing:
   - Test for common OWASP Top 10 vulnerabilities
   - Attempt privilege escalation
   - Test JWT token manipulation
   - Test OAuth2 flow hijacking
3. Document vulnerabilities and fix
4. Re-test after fixes
5. Generate security report

**Acceptance Criteria**:
- No critical or high-severity vulnerabilities
- All medium-severity vulnerabilities fixed or documented
- Penetration test report complete
- Fixes validated with re-testing
- Tests: Security regression tests for fixed vulnerabilities
- Coverage: ≥85%

**Deliverables**:
- `docs/security/penetration-test-report.md`
- `docs/security/vulnerability-fixes.md`
- Security patches (various files)
- `tests/integration/security/regression.test.ts`

---

## Phase 4 Acceptance Criteria

- [ ] All 4 sprints completed with ≥75% confidence
- [ ] Rate limiting and brute force protection working
- [ ] Comprehensive audit logging in place
- [ ] CSRF and security headers configured
- [ ] Penetration testing complete with no critical vulnerabilities
- [ ] Test coverage ≥85% across all sprints
- [ ] Security documentation complete
- [ ] Consensus validation ≥90% from security-specialist and reviewer

## Epic Completion Criteria

With Phase 4 complete, the entire auth-system-v2 epic is finished. Final validation:

- [ ] All phases (1-4) complete
- [ ] Cross-phase integrations validated
- [ ] End-to-end testing complete (registration → login → OAuth → RBAC → security)
- [ ] Performance benchmarks met (auth <100ms, token refresh <50ms)
- [ ] Production deployment successful
- [ ] Documentation complete (API docs, security guide, deployment guide)

## Notes

- **Rate limiting storage**: Use Redis for production (in-memory for development)
- **Audit log retention**: 90 days for regular logs, 1 year for security events
- **CSRF exemptions**: API token authentication is stateless (no CSRF needed)
- **Security testing tools**:
  - OWASP ZAP: Free web app security scanner
  - SQLMap: SQL injection testing
  - Burp Suite Community: Manual penetration testing
- **Common vulnerabilities to test**:
  - SQL Injection
  - Cross-Site Scripting (XSS)
  - CSRF
  - Broken Authentication
  - Sensitive Data Exposure
  - XML External Entities (XXE)
  - Broken Access Control
  - Security Misconfiguration
  - Insecure Deserialization
  - Insufficient Logging & Monitoring
