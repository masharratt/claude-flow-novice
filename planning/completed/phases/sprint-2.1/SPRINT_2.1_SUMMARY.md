# Sprint 2.1 Summary - Core Server Architecture Design

**Epic**: Phase 2 - Unified Web Portal Consolidation
**Sprint**: 2.1 - Core Server Setup (Architecture Design)
**Agent**: architect-1
**Status**: Complete - Ready for Loop 2 Validation
**Date**: 2025-10-11
**Confidence**: 0.90

---

## Executive Summary

Complete architecture design for unified Express server consolidating three separate servers (src/web/api/server.ts, src/web/portal-server.ts, monitor/dashboard/secure-server.ts) into a single production-ready backend at packages/web-portal/src/server/.

**Key Achievements**:
- ✅ 32 file specifications (complete directory structure)
- ✅ 7 REST API endpoints (fully documented with OpenAPI schemas)
- ✅ 5 WebSocket event types (real-time monitoring)
- ✅ 3 Architecture Decision Records (ADRs)
- ✅ 8 architecture diagrams (system, request flow, WebSocket, integration, data flow, deployment, security, error handling)
- ✅ Security hardening (Helmet + CORS + rate limiting + JWT/API key auth + RBAC)
- ✅ Integration patterns (TransparencySystem + SwarmCoordinator event flow)
- ✅ Migration strategy (4-phase plan)

---

## Deliverables

### 1. Core Architecture Document
**File**: `SERVER_ARCHITECTURE_DESIGN.md` (47,905 bytes)

**Contents** (21 sections):
1. Executive Summary (consolidation objectives, architecture goals)
2. System Architecture (high-level diagram, directory structure, port configuration)
3. REST API Specification (7 endpoints with request/response schemas)
4. WebSocket Event Specification (5 event types, room management)
5. Middleware Architecture (9-layer ordered stack with rationale)
6. Integration Architecture (TransparencySystem + SwarmCoordinator)
7. Security Architecture (5-layer defense-in-depth)
8. Performance Optimization (caching, compression, connection pooling)
9. OpenAPI/Swagger Specification (configuration + endpoint documentation)
10. Error Handling Strategy (consistent error format, HTTP status codes)
11. Logging Strategy (Winston configuration, structured logging)
12. Deployment Architecture (Docker + nginx + load balancing)
13. Migration Strategy (4-phase plan)
14. Testing Strategy (unit/integration/E2E)
15. Monitoring and Observability (health checks, Prometheus metrics)
16. Files to Create (32 files across 8 subdirectories)
17. Architecture Decision Records (ADRs)
18. Integration Points Summary (TransparencySystem + SwarmCoordinator)
19. Performance Recommendations (10 optimizations)
20. Security Recommendations (10 hardening measures)
21. Confidence Score (0.90 with detailed reasoning)

### 2. Architecture Decision Records (ADRs)
**Files**: 3 ADRs totaling 40,368 bytes

#### ADR-001: Middleware Stack Ordering (9,258 bytes)
**Decision**: Security → Logging → Auth → Business Logic

**Key Rationale**:
- Security headers on ALL responses (including errors)
- Logging captures ALL requests (including failed auth, rate limits)
- Rate limiting BEFORE expensive auth checks (DDoS protection)
- Error handler LAST to catch all exceptions

**Middleware Order**:
1. Helmet (Security Headers)
2. CORS (Cross-Origin)
3. Compression (gzip)
4. Body Parsing (JSON, urlencoded)
5. Rate Limiting (100 req/min per IP)
6. Request Logging (Winston)
7. Authentication (JWT/API Key) - Protected routes only
8. Validation (Zod schemas) - Routes with validation
9. Error Handler (Catch-all)

#### ADR-002: Authentication Strategy (13,810 bytes)
**Decision**: Hybrid (JWT + API Key + Basic Auth)

**Authentication Methods**:
1. **JWT (Primary)**: User authentication (web, mobile)
   - 24-hour expiration
   - Self-contained (user ID, role, permissions)
   - Stateless (horizontally scalable)
2. **API Key**: Service-to-service authentication (CLI tools)
   - Long-lived (no expiration)
   - Simple (single HTTP header: X-API-Key)
3. **Basic Auth**: Development only
   - Quick testing (username: admin, password: admin)
   - Disabled in production

**Role-Based Access Control (RBAC)**:
- **Admin**: Full access (read, write, intervene)
- **User**: Read-only access
- **Service**: API key access for automation

#### ADR-003: WebSocket Authentication (17,300 bytes)
**Decision**: Hybrid (Auth Object + Authorization Header Fallback)

**Authentication Flow**:
1. Try Socket.IO auth object: `socket.handshake.auth.token` (preferred, Socket.IO v3+)
2. Fallback to Authorization header: `Authorization: Bearer <token>` (legacy clients)
3. Also supports API key: `socket.handshake.auth.apiKey` or `X-API-Key` header

**Security Considerations**:
- Authentication BEFORE connection establishment
- WSS (WebSocket Secure) required in production
- Token expiration handling (24-hour JWT)
- Rate limiting (max 5 connections per user, max 1000 total)

### 3. Architecture Diagrams
**File**: `ARCHITECTURE_DIAGRAMS.md` (40,604 bytes)

**8 Comprehensive Diagrams**:
1. **System Architecture Overview**: Client layer → Unified server → Integration layer → Backend services
2. **REST API Request Flow**: Middleware stack execution (9 layers) → Route handler → Response
3. **WebSocket Connection Flow**: Authentication → Subscription → Event propagation → Client receive
4. **Integration Architecture**: TransparencySystem + SwarmCoordinator event flow
5. **Data Flow - Agent Update Event**: Event emission → Integration adapter → WebSocket broadcast → Client update
6. **Deployment Architecture**: Internet → Load balancer → Express servers (Docker) → Redis
7. **Security Architecture**: 5-layer defense (Network → Transport → Application → Auth → Data)
8. **Error Flow**: Valid request vs. unhandled error handling

### 4. Structured Output
**File**: `ARCHITECT_OUTPUT.json` (14,274 bytes)

**Contents**:
- Confidence score (0.90) with detailed reasoning
- 32 files to create (complete file list)
- Integration points (TransparencySystem + SwarmCoordinator)
- 3 Architecture decisions (ADRs summary)
- 7 API endpoints (method, path, auth, response)
- 5 WebSocket events (event name, description, payload)
- 13 Security features (Helmet, CORS, rate limiting, JWT, RBAC, etc.)
- 7 Performance optimizations (caching, compression, connection pooling)
- Deployment strategy (Docker, nginx, environment variables)
- 4-phase migration plan
- Testing strategy (unit/integration/E2E)
- 6 documentation files delivered
- Next steps (Loop 2 validation, Loop 4 Product Owner decision)

---

## REST API Specification

### 7 Endpoints

1. **GET /api/agents/hierarchy** - Agent hierarchy tree
   - Auth: JWT or API Key
   - Response: AgentHierarchyNode with nested children

2. **GET /api/agents/:id/status** - Individual agent status
   - Auth: JWT or API Key
   - Response: Agent status with metrics (tasksCompleted, tasksFailed, uptime, memory)

3. **GET /api/metrics** - System metrics
   - Auth: JWT or API Key
   - Response: CPU, memory, agent counts, task counts

4. **GET /api/events** - Event history with pagination
   - Auth: JWT or API Key
   - Query: page, limit, type, agentId
   - Response: Paginated event list with metadata

5. **GET /api/resources** - Resource utilization
   - Auth: JWT or API Key
   - Response: Memory, CPU, network metrics

6. **POST /api/agents/:id/intervene** - Agent intervention
   - Auth: JWT (admin role required)
   - Body: { action: "pause|resume|restart|terminate", reason: "string" }
   - Response: Intervention result with success status

7. **GET /api/health** - Health check
   - Auth: None (public)
   - Response: Health status with uptime, version, dependencies

---

## WebSocket Events

### 5 Event Types

1. **agent_update** - Real-time agent status changes
   - Payload: { type, agentId, status, currentTask, timestamp }

2. **hierarchy_change** - Agent hierarchy modifications
   - Payload: { type, action, agentId, parentId, timestamp }

3. **metrics_update** - System metrics updates
   - Payload: { type, metrics: { cpu, memory, activeAgents }, timestamp }

4. **error** - Error notifications
   - Payload: { type, severity, message, agentId, timestamp }

5. **notification** - General notifications
   - Payload: { type, category, title, message, timestamp }

### Room Management
- `agents` - All agent update events
- `hierarchy` - Hierarchy change events
- `metrics` - System metrics updates
- `errors` - Error events
- `notifications` - Notification events
- `agent-{agentId}` - Agent-specific events (e.g., `agent-agent-1`)

---

## Security Features (13 Total)

1. **Helmet Security Headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
2. **CORS with Origin Whitelisting**: Configurable allowed origins (production: https only)
3. **Rate Limiting**: 100 req/min per IP (configurable per endpoint)
4. **JWT Authentication**: 24-hour expiration, HS256 algorithm
5. **API Key Authentication**: Service-to-service authentication
6. **Role-Based Access Control (RBAC)**: admin, user, service roles
7. **Permission-Based Access Control**: read, write, admin permissions
8. **WebSocket Authentication**: JWT + API key support
9. **Request Validation**: Zod schema validation
10. **Input Sanitization**: XSS prevention
11. **HTTPS Enforcement**: Production only (TLS 1.3)
12. **Secrets Management**: Environment variables (production: secrets manager)
13. **Audit Logging**: All admin actions logged

---

## Performance Optimizations (7 Total)

1. **In-Memory Caching**:
   - Agent hierarchy: 5-second TTL
   - System metrics: 10-second TTL
   - Agent status: 3-second TTL

2. **gzip Compression**: 70-80% size reduction for responses > 1KB

3. **HTTP Keep-Alive**: Connection reuse (enabled by default)

4. **WebSocket Connection Pooling**: Max 1000 concurrent connections

5. **Async Logging**: Winston async logging to minimize latency

6. **Request Coalescing**: Batch similar requests

7. **Lazy Route Loading**: Code splitting for faster startup

---

## Integration Points

### TransparencySystem
**Location**: `src/coordination/shared/transparency/transparency-system.ts`

**Events** (subscribed by integration adapter):
- `agentStateChanged` → WebSocket: `agent_update`
- `hierarchyChange` → WebSocket: `hierarchy_change`
- `metricsUpdate` → WebSocket: `metrics_update`
- `performanceAlert` → WebSocket: `error`

**Methods** (exposed via REST API):
- `getAgentHierarchy()` → GET /api/agents/hierarchy
- `getAgentStatus(agentId)` → GET /api/agents/:id/status
- `getMetrics()` → GET /api/metrics
- `getLifecycleEvents(filter)` → GET /api/events

**Initialization**:
```typescript
await transparencySystem.initialize({
  enableRealTimeMonitoring: true,
  enableEventStreaming: true,
  metricsUpdateIntervalMs: 5000,
  heartbeatIntervalMs: 10000
});
await transparencySystem.startMonitoring();
```

### SwarmCoordinator
**Location**: `src/coordination/swarm-coordinator.ts`

**Events** (subscribed by integration adapter):
- `agentStatusChange` → WebSocket: `agent_update`
- `taskComplete` → WebSocket: `notification`
- `taskFailed` → WebSocket: `error`

**Methods** (exposed via REST API):
- `getAgentMetrics(agentId)` → GET /api/agents/:id/status
- `getSwarmStatus()` → GET /api/metrics
- `interveneAgent(agentId, action)` → POST /api/agents/:id/intervene

**Initialization**:
```typescript
swarmCoordinator = new SwarmCoordinator({
  maxAgents: 50,
  enableMonitoring: true
});
```

---

## Files to Create (32 Total)

### Server Core (3 files)
1. `packages/web-portal/src/server/index.ts` - Main entry point + graceful shutdown
2. `packages/web-portal/src/server/app.ts` - Express app configuration
3. `packages/web-portal/src/server/config/server.config.ts` - Server configuration

### Configuration (3 files)
4. `packages/web-portal/src/server/config/middleware.config.ts` - Middleware stack
5. `packages/web-portal/src/server/config/swagger.config.ts` - OpenAPI/Swagger
6. `packages/web-portal/src/server/types/api.types.ts` - TypeScript types

### Middleware (6 files)
7. `packages/web-portal/src/server/middleware/authentication.ts` - JWT + API key auth
8. `packages/web-portal/src/server/middleware/error-handler.ts` - Error handling
9. `packages/web-portal/src/server/middleware/validation.ts` - Request validation (Zod)
10. `packages/web-portal/src/server/middleware/rate-limiting.ts` - Rate limiting
11. `packages/web-portal/src/server/middleware/security.ts` - Helmet + CORS + Compression
12. `packages/web-portal/src/server/middleware/logging.ts` - Winston logging

### Routes (7 files)
13. `packages/web-portal/src/server/routes/index.ts` - Route aggregator
14. `packages/web-portal/src/server/routes/agents.routes.ts` - Agent endpoints
15. `packages/web-portal/src/server/routes/metrics.routes.ts` - Metrics endpoint
16. `packages/web-portal/src/server/routes/events.routes.ts` - Events endpoint
17. `packages/web-portal/src/server/routes/resources.routes.ts` - Resources endpoint
18. `packages/web-portal/src/server/routes/intervention.routes.ts` - Intervention endpoint
19. `packages/web-portal/src/server/routes/health.routes.ts` - Health check

### WebSocket (8 files)
20. `packages/web-portal/src/server/websocket/server.ts` - Socket.IO server
21. `packages/web-portal/src/server/websocket/authentication.ts` - WebSocket auth
22. `packages/web-portal/src/server/websocket/rooms.ts` - Room management
23. `packages/web-portal/src/server/websocket/handlers/agent-events.ts` - Agent handlers
24. `packages/web-portal/src/server/websocket/handlers/metrics-events.ts` - Metrics handlers
25. `packages/web-portal/src/server/websocket/handlers/hierarchy-events.ts` - Hierarchy handlers
26. `packages/web-portal/src/server/websocket/handlers/error-events.ts` - Error handlers
27. `packages/web-portal/src/server/websocket/handlers/notification-events.ts` - Notification handlers
28. `packages/web-portal/src/server/types/websocket.types.ts` - WebSocket types

### Integrations (2 files)
29. `packages/web-portal/src/server/integrations/transparency-system.ts` - TransparencySystem integration
30. `packages/web-portal/src/server/integrations/swarm-coordinator.ts` - SwarmCoordinator integration

### Documentation (2 files)
31. `packages/web-portal/docs/API.md` - REST API documentation
32. `packages/web-portal/docs/WEBSOCKET.md` - WebSocket events documentation

---

## Migration Strategy (4 Phases)

### Phase 1: Build Unified Server (Sprint 2.1) ✅
**Status**: Architecture design complete

**Deliverables**:
- ✅ Complete directory structure specification (32 files)
- ✅ REST API specification (7 endpoints)
- ✅ WebSocket event specification (5 event types)
- ✅ Middleware stack design (9 layers)
- ✅ Integration architecture (TransparencySystem + SwarmCoordinator)
- ✅ Security architecture (5 layers)
- ✅ ADRs (3 decision records)
- ✅ Architecture diagrams (8 diagrams)

**Next**: Loop 2 validation → Loop 4 Product Owner decision → Sprint 2.2 implementation

### Phase 2: Parallel Deployment (Sprint 2.2)
**Objective**: Deploy unified server without disrupting existing servers

**Tasks**:
- [ ] Implement 32 files per architecture design
- [ ] Deploy unified server on port 3000
- [ ] Keep existing servers running (3001, etc.)
- [ ] Test unified server in isolation (unit + integration tests)
- [ ] Validate API endpoints with existing clients
- [ ] Validate WebSocket events with dashboard

### Phase 3: Traffic Migration (Sprint 2.3)
**Objective**: Gradual traffic shift to unified server

**Tasks**:
- [ ] Update frontend to connect to unified server (port 3000)
- [ ] Monitor for errors and performance issues
- [ ] Gradual traffic shift:
  - 10% traffic → unified server (monitor 24 hours)
  - 50% traffic → unified server (monitor 48 hours)
  - 100% traffic → unified server (monitor 1 week)
- [ ] Rollback plan if issues detected

### Phase 4: Deprecation (Sprint 2.4)
**Objective**: Remove legacy servers

**Tasks**:
- [ ] Shut down old servers (src/web/api/server.ts, src/web/portal-server.ts, monitor/dashboard/secure-server.ts)
- [ ] Remove legacy code (delete old server files)
- [ ] Update documentation (remove references to old servers)
- [ ] Archive old server code (git tag)

---

## Testing Strategy

### Unit Tests (80% coverage target)
**Test Areas**:
- Middleware functions (auth, validation, rate limiting, error handling)
- Route handlers (agents, metrics, events, resources, intervention, health)
- WebSocket handlers (agent updates, metrics, hierarchy, errors, notifications)
- Integration adapters (TransparencySystem, SwarmCoordinator)

**Example**:
```typescript
describe('Authentication Middleware', () => {
  it('should accept valid JWT token', () => { /* ... */ });
  it('should reject invalid JWT token', () => { /* ... */ });
  it('should accept valid API key', () => { /* ... */ });
  it('should reject missing auth', () => { /* ... */ });
});
```

### Integration Tests
**Test Areas**:
- Full API endpoint workflows (request → middleware → handler → response)
- WebSocket connection and event propagation
- Error handling across middleware stack
- Rate limiting behavior

**Example**:
```typescript
describe('GET /api/agents/hierarchy', () => {
  it('should return agent hierarchy with valid JWT', async () => {
    const response = await request(server)
      .get('/api/agents/hierarchy')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('hierarchy');
  });
});
```

### End-to-End Tests
**Test Areas**:
- Full user workflows (login → fetch data → logout)
- WebSocket subscriptions and real-time updates
- Error recovery scenarios

**Tools**: Playwright or Cypress

---

## Deployment Configuration

### Environment Variables
```bash
# Server Configuration
NODE_ENV=production
SERVER_PORT=3000
SERVER_HOST=0.0.0.0

# Security
JWT_SECRET=<strong-random-secret>
API_KEY=<strong-random-api-key>
CORS_ORIGINS=https://dashboard.example.com,https://app.example.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs

# WebSocket
WS_MAX_CONNECTIONS=1000
WS_PING_TIMEOUT=60000
WS_PING_INTERVAL=25000

# Integrations
TRANSPARENCY_SYSTEM_ENABLED=true
SWARM_COORDINATOR_ENABLED=true
```

### Docker Configuration
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
```

### nginx Configuration
```nginx
upstream web_portal {
    server localhost:3000;
}

server {
    listen 80;
    server_name dashboard.example.com;

    location / {
        proxy_pass http://web_portal;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://web_portal;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Confidence Score: 0.90

### Rationale
**Strengths**:
1. ✅ Complete directory structure (32 files across 8 subdirectories)
2. ✅ Comprehensive REST API specification (7 endpoints with OpenAPI schemas)
3. ✅ WebSocket events fully documented (5 event types, room management)
4. ✅ Security hardening (13 features: Helmet, CORS, rate limiting, JWT, RBAC, etc.)
5. ✅ Integration patterns documented (TransparencySystem + SwarmCoordinator event flow)
6. ✅ ADRs with clear rationale (middleware ordering, auth strategy, WebSocket auth)
7. ✅ Architecture diagrams (8 diagrams covering all aspects)
8. ✅ Migration strategy (4-phase plan with clear tasks)
9. ✅ Testing strategy (unit/integration/E2E with examples)
10. ✅ Deployment configuration (Docker + nginx + environment variables)

**Minor Gaps** (deferred to later sprints):
- JWT refresh token endpoint (Sprint 2.2)
- Login endpoint with username/password (Sprint 2.2)
- Token blacklist for immediate revocation (Phase 3)
- Per-service API keys (Phase 3)

**Confidence Breakdown**:
- Architecture completeness: 0.95 (comprehensive, all aspects covered)
- Security design: 0.90 (production-ready, minor enhancements deferred)
- Integration design: 0.85 (event flow documented, implementation details to be validated)
- Overall: 0.90 (ready for Loop 2 validation)

---

## Next Steps

### Loop 2 Validation (Consensus Target: ≥0.90)
**Validators**: 2-4 agents (security-specialist, reviewer, backend-dev)

**Review Areas**:
1. **Security Review**: Authentication strategy, middleware ordering, WebSocket auth, CORS, rate limiting
2. **Integration Review**: TransparencySystem event flow, SwarmCoordinator methods, error handling
3. **API Review**: Endpoint specifications, OpenAPI schema validation, response formats
4. **Performance Review**: Caching strategy, compression, connection pooling, rate limiting

**Exit Criteria**:
- Consensus ≥0.90 → Proceed to Loop 4 (Product Owner decision)
- Consensus <0.90 → Relaunch Loop 3 (targeted improvements based on validator feedback)

### Loop 4 Product Owner Decision
**Product Owner Agent**: Autonomous GOAP decision

**Options**:
1. **PROCEED**: Move to Sprint 2.2 implementation
2. **DEFER**: Approve architecture, backlog minor enhancements
3. **ESCALATE**: Critical ambiguity → human review

**Recommendation**: PROCEED to Sprint 2.2 (implementation of 32 files per architecture design)

---

## Blockers

**None**. Architecture design complete with no blockers identified.

---

## Assumptions

1. TransparencySystem is already implemented at `src/coordination/shared/transparency/transparency-system.ts`
2. SwarmCoordinator is already implemented at `src/coordination/swarm-coordinator.ts`
3. `packages/web-portal/` directory will be created for monorepo structure
4. Node.js 20+ (ES Modules support required)
5. Environment variables managed via .env files (development) or secrets manager (production)
6. Port 3000 is available and not in use
7. Frontend will be updated separately in Sprint 2.2
8. Database (if needed) will be added in Phase 3

---

## Deferred Features

### Sprint 2.2
- JWT refresh token endpoint
- Login endpoint (username/password → JWT)
- Logout endpoint (optional token blacklist)

### Phase 3
- Per-service API keys (separate keys per CLI tool)
- Token blacklist (Redis-based, immediate revocation)
- Multi-factor authentication (MFA)
- OAuth 2.0 integration (Google, GitHub SSO)
- Database persistence (events, metrics history)

### Phase 4
- GraphQL API
- Real-time collaborative editing

---

**END OF SPRINT 2.1 SUMMARY**
