# Phase 3: OAuth2 Integration

**Phase ID**: `phase-3-oauth`
**Epic**: `auth-system-v2`
**Status**: ❌ Not Started
**Dependencies**: Phase 1 (Core Auth), Phase 2 (RBAC)
**Estimated Duration**: 1 week

## Phase Description

Integrate third-party OAuth2 providers for social login:
- Google OAuth2 integration
- GitHub OAuth2 integration
- Account linking for existing users
- Automatic user creation for new OAuth users
- Social login UI components

## Sprint Breakdown

### Sprint 3.1: OAuth2 Infrastructure
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Phase 1 Sprint 1.1 (User model), Phase 1 Sprint 1.2 (JWT service)

**Tasks**:
1. Create OAuthProvider model (provider, providerId, userId, accessToken, refreshToken, profile)
2. Install OAuth2 libraries (passport, passport-google-oauth20, passport-github2)
3. Configure Passport strategies for Google and GitHub
4. Set up OAuth2 callback routes
5. Add OAuth2 credentials to environment variables

**Acceptance Criteria**:
- OAuthProvider model stores provider-specific data
- Passport configured with Google and GitHub strategies
- OAuth2 callback routes set up
- Credentials managed securely (environment variables)
- Tests: Model tests, strategy configuration tests
- Coverage: ≥85%

**Deliverables**:
- `src/models/OAuthProvider.ts`
- `src/config/passport.ts`
- `src/routes/oauth.ts`
- `.env.example` (updated with GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, etc.)
- `tests/unit/models/OAuthProvider.test.ts`

---

### Sprint 3.2: Google OAuth2 Flow
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Sprint 3.1

**Tasks**:
1. Implement GET /api/auth/google route (initiate OAuth flow)
2. Implement GET /api/auth/google/callback route
   - Exchange code for access token
   - Fetch user profile from Google
   - Check if user exists (by email)
   - If exists: Link OAuth provider to existing user
   - If new: Create user with OAuth data
   - Generate JWT tokens and return
3. Handle OAuth errors (user denied access, invalid credentials)

**Acceptance Criteria**:
- User can login with Google account
- Existing users can link Google account
- New users automatically created with Google data
- OAuth errors handled gracefully
- Tests: Integration tests for Google OAuth flow (mocked)
- Coverage: ≥85%

**Deliverables**:
- `src/controllers/OAuthController.ts` (Google methods)
- `src/services/OAuthService.ts`
- `tests/integration/oauth/google.test.ts`

---

### Sprint 3.3: GitHub OAuth2 Flow
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Sprint 3.2

**Tasks**:
1. Implement GET /api/auth/github route (initiate OAuth flow)
2. Implement GET /api/auth/github/callback route
   - Similar logic to Google flow
   - Fetch user profile from GitHub
   - Handle account creation/linking
3. Add email verification for GitHub users (GitHub may not provide primary email)

**Acceptance Criteria**:
- User can login with GitHub account
- Existing users can link GitHub account
- New users automatically created with GitHub data
- Email handling for GitHub users (may need to request email scope)
- Tests: Integration tests for GitHub OAuth flow (mocked)
- Coverage: ≥85%

**Deliverables**:
- `src/controllers/OAuthController.ts` (GitHub methods)
- `tests/integration/oauth/github.test.ts`

---

### Sprint 3.4: Account Linking & Management
**Status**: ❌ Not Started
**Duration**: 1 day
**Dependencies**: Sprint 3.3

**Tasks**:
1. Build account linking endpoints:
   - GET /api/users/me/oauth-providers - List linked providers
   - DELETE /api/users/me/oauth-providers/:id - Unlink provider
2. Add unlinking validation (prevent unlinking if no password set)
3. Update user profile to show linked OAuth accounts
4. Add OAuth account display in frontend (UI component)

**Acceptance Criteria**:
- User can view linked OAuth providers
- User can unlink OAuth providers (if password exists)
- Cannot unlink last authentication method
- Frontend displays linked accounts
- Tests: Integration tests for linking/unlinking
- Coverage: ≥85%

**Deliverables**:
- `src/controllers/UserController.ts` (updated)
- `src/routes/users.ts` (updated)
- `tests/integration/users/oauth-linking.test.ts`

---

## Phase 3 Acceptance Criteria

- [ ] All 4 sprints completed with ≥75% confidence
- [ ] Google and GitHub OAuth2 flows working
- [ ] Account linking and management functional
- [ ] Integration with Phase 1 (JWT) and Phase 2 (RBAC) validated
- [ ] No security vulnerabilities (OAuth token leaks, CSRF attacks)
- [ ] Test coverage ≥85% across all sprints
- [ ] API documentation complete
- [ ] Consensus validation ≥90% from security-specialist and reviewer

## Dependencies for Future Phases

**Phase 4 (Security) depends on**:
- Sprint 3.3: OAuth2 endpoints (will add rate limiting to prevent OAuth abuse)

## Notes

- **Cross-phase dependency**: Phase 4 Sprint 4.1 (Rate limiting) depends on this phase's Sprint 3.3 (OAuth2 endpoints)
- **OAuth2 scopes**:
  - Google: `profile`, `email`
  - GitHub: `user:email`, `read:user`
- **Security considerations**:
  - Store OAuth tokens encrypted
  - Implement CSRF protection for OAuth callbacks
  - Validate state parameter to prevent CSRF
- **Account linking logic**:
  - Match by email (case-insensitive)
  - If email exists but no password: Link OAuth provider
  - If email exists with password: Require login before linking
