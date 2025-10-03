# Phase 2: Role-Based Access Control (RBAC)

**Phase ID**: `phase-2-rbac`
**Epic**: `auth-system-v2`
**Status**: ❌ Not Started
**Dependencies**: Phase 1 (Core Authentication)
**Estimated Duration**: 1 week

## Phase Description

Implement comprehensive role-based access control system:
- Role and permission management
- User-role assignments
- Route-level permission enforcement
- Admin panel for role management
- Hierarchical roles (admin > moderator > user)

## Sprint Breakdown

### Sprint 2.1: Role & Permission Models
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Phase 1 Sprint 1.1 (User model)

**Tasks**:
1. Create Role model (name, description, priority, created_at)
2. Create Permission model (resource, action, description)
3. Create role-permission association table (many-to-many)
4. Create user-role association table (many-to-many)
5. Seed default roles (admin, moderator, user) and permissions
6. Add helper methods (user.hasRole(), user.hasPermission())

**Acceptance Criteria**:
- Role and Permission models with proper relationships
- Default roles and permissions seeded
- User can have multiple roles
- Role can have multiple permissions
- Tests: Model tests for relationships, helper method tests
- Coverage: ≥85%

**Deliverables**:
- `src/models/Role.ts`
- `src/models/Permission.ts`
- `src/models/associations.ts` (updated)
- `src/seeders/RolePermissionSeeder.ts`
- `tests/unit/models/Role.test.ts`
- `tests/unit/models/Permission.test.ts`

---

### Sprint 2.2: Permission Enforcement Middleware
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Phase 1 Sprint 1.3 (Token validation middleware), Sprint 2.1

**Cross-Phase Dependency**: This sprint depends on Phase 1 Sprint 1.3 (token validation infrastructure)

**Tasks**:
1. Create permission middleware factory
   - `requirePermission('users:read')` decorator
   - `requireRole('admin')` decorator
   - `requireAnyRole(['admin', 'moderator'])` decorator
2. Integrate with existing AuthMiddleware
3. Add permission caching (avoid DB query on every request)
4. Implement permission inheritance (admin inherits all permissions)

**Acceptance Criteria**:
- Routes can be protected by permission or role
- Unauthorized access returns 403 Forbidden
- Permission checks cached efficiently
- Admin role bypasses permission checks
- Tests: Middleware tests for various permission scenarios
- Coverage: ≥85%

**Deliverables**:
- `src/middleware/PermissionMiddleware.ts`
- `src/services/PermissionCacheService.ts`
- `tests/integration/middleware/permission.test.ts`

---

### Sprint 2.3: Role Management API
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Sprint 2.2

**Tasks**:
1. Build role management endpoints (admin only):
   - GET /api/admin/roles - List all roles
   - POST /api/admin/roles - Create new role
   - PATCH /api/admin/roles/:id - Update role
   - DELETE /api/admin/roles/:id - Delete role
2. Build permission management endpoints (admin only):
   - GET /api/admin/permissions - List all permissions
   - POST /api/admin/permissions - Create permission
3. Build role-permission assignment:
   - POST /api/admin/roles/:id/permissions - Assign permissions to role
   - DELETE /api/admin/roles/:id/permissions/:permId - Remove permission

**Acceptance Criteria**:
- Only admins can manage roles and permissions
- CRUD operations for roles and permissions
- Role-permission assignments working
- Input validation (unique role names, valid permission format)
- Tests: Integration tests for all endpoints
- Coverage: ≥85%

**Deliverables**:
- `src/controllers/RoleController.ts`
- `src/controllers/PermissionController.ts`
- `src/routes/admin.ts`
- `tests/integration/admin/roles.test.ts`
- `tests/integration/admin/permissions.test.ts`

---

### Sprint 2.4: User Role Assignment
**Status**: ❌ Not Started
**Duration**: 1 day
**Dependencies**: Sprint 2.3

**Tasks**:
1. Build user role assignment endpoints (admin only):
   - POST /api/admin/users/:id/roles - Assign role to user
   - DELETE /api/admin/users/:id/roles/:roleId - Remove role from user
   - GET /api/admin/users/:id/roles - Get user's roles
2. Update user profile endpoint to include roles
3. Add role assignment validation (prevent circular dependencies)

**Acceptance Criteria**:
- Admins can assign/remove roles from users
- User profile includes assigned roles
- Cannot create role hierarchy loops
- Tests: Integration tests for user role management
- Coverage: ≥85%

**Deliverables**:
- `src/controllers/UserController.ts` (updated)
- `src/routes/admin.ts` (updated)
- `tests/integration/admin/user-roles.test.ts`

---

## Phase 2 Acceptance Criteria

- [ ] All 4 sprints completed with ≥75% confidence
- [ ] RBAC system fully functional (roles, permissions, assignments)
- [ ] Integration with Phase 1 authentication validated
- [ ] No security vulnerabilities (permission bypass, privilege escalation)
- [ ] Test coverage ≥85% across all sprints
- [ ] API documentation complete
- [ ] Consensus validation ≥90% from security-specialist and reviewer

## Dependencies for Future Phases

**Phase 3 (OAuth2) depends on**:
- Sprint 2.1: Role model (OAuth users will be assigned default 'user' role)

**Phase 4 (Security) depends on**:
- Sprint 2.2: Permission middleware (rate limiting will check admin exemption)

## Notes

- **Permission format**: `resource:action` (e.g., `users:read`, `posts:write`, `admin:manage`)
- **Role hierarchy**: admin (priority 100) > moderator (priority 50) > user (priority 1)
- Higher priority roles inherit permissions from lower priority roles
- Permission caching: Cache user permissions in memory (invalidate on role change)
