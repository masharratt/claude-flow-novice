# Architecture Diagrams - Unified Express Server

**Epic**: Phase 2 - Unified Web Portal Consolidation
**Sprint**: 2.1 - Core Server Setup
**Date**: 2025-10-11

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   React      │  │   Mobile     │  │  CLI Tools   │             │
│  │  Dashboard   │  │     App      │  │  (API Key)   │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                  │                  │                      │
└─────────┼──────────────────┼──────────────────┼──────────────────────┘
          │                  │                  │
          │ REST API         │ REST API         │ REST API
          │ (JWT)            │ (JWT)            │ (API Key)
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    UNIFIED EXPRESS SERVER                           │
│                    Port 3000 (Configurable)                         │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    MIDDLEWARE STACK                            │ │
│  │  1. Helmet (Security Headers)                                  │ │
│  │  2. CORS (Cross-Origin)                                        │ │
│  │  3. Compression (gzip)                                         │ │
│  │  4. Body Parsing (JSON, urlencoded)                           │ │
│  │  5. Rate Limiting (100 req/min per IP)                        │ │
│  │  6. Request Logging (Winston)                                 │ │
│  │  7. Authentication (JWT/API Key) - Protected routes only      │ │
│  │  8. Validation (Zod schemas) - Routes with validation         │ │
│  │  9. Error Handler (Catch-all)                                 │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                      REST API LAYER                            │ │
│  │  ┌─────────────────────────────────────────────────────────┐  │ │
│  │  │  GET  /api/agents/hierarchy  (Agent hierarchy tree)     │  │ │
│  │  │  GET  /api/agents/:id/status (Individual agent status)  │  │ │
│  │  │  GET  /api/metrics           (System metrics)           │  │ │
│  │  │  GET  /api/events            (Event history + pagination)│ │
│  │  │  GET  /api/resources         (Resource utilization)     │  │ │
│  │  │  POST /api/agents/:id/intervene (Agent intervention)    │  │ │
│  │  │  GET  /api/health            (Health check)             │  │ │
│  │  └─────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                   WEBSOCKET LAYER (Socket.IO)                  │ │
│  │  ┌─────────────────────────────────────────────────────────┐  │ │
│  │  │  agent_update       - Real-time agent status changes    │  │ │
│  │  │  hierarchy_change   - Agent hierarchy modifications     │  │ │
│  │  │  metrics_update     - System metrics updates            │  │ │
│  │  │  error              - Error notifications               │  │ │
│  │  │  notification       - General notifications             │  │ │
│  │  └─────────────────────────────────────────────────────────┘  │ │
│  │  Room Management: agents, hierarchy, metrics, errors,          │ │
│  │                   notifications, agent-{agentId}              │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                     INTEGRATION LAYER                          │ │
│  │  ┌───────────────────────────┐  ┌──────────────────────────┐  │ │
│  │  │   TransparencySystem      │  │   SwarmCoordinator       │  │ │
│  │  │   - Event streaming        │  │   - Agent metrics        │  │ │
│  │  │   - Agent hierarchy        │  │   - Task status          │  │ │
│  │  │   - Lifecycle events       │  │   - Agent intervention   │  │ │
│  │  └───────────────────────────┘  └──────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
         ┌────────────────────────────────────────┐
         │   BACKEND SERVICES (Event Bus Layer)   │
         │  - TransparencySystem (Event Emitter)  │
         │  - SwarmCoordinator (Agent Management) │
         │  - Redis (Optional: Session Storage)   │
         └────────────────────────────────────────┘
```

---

## 2. Request Flow Diagram - REST API

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ HTTP Request: GET /api/agents/hierarchy
       │ Headers: Authorization: Bearer <JWT_TOKEN>
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              MIDDLEWARE STACK                       │
├─────────────────────────────────────────────────────┤
│ 1. Helmet                                           │
│    ✓ Apply security headers (CSP, HSTS, etc.)      │
│    ↓                                                │
│ 2. CORS                                             │
│    ✓ Check origin: http://localhost:3000           │
│    ✓ Add CORS headers                              │
│    ↓                                                │
│ 3. Compression                                      │
│    ✓ Enable gzip compression for response          │
│    ↓                                                │
│ 4. Body Parsing                                     │
│    ✓ Parse JSON body (if present)                  │
│    ↓                                                │
│ 5. Rate Limiting                                    │
│    ✓ Check IP rate limit: 95/100 requests          │
│    ✓ Allow request                                 │
│    ↓                                                │
│ 6. Request Logging                                  │
│    ✓ Log: GET /api/agents/hierarchy (192.168.1.1)  │
│    ↓                                                │
│ 7. Authentication                                   │
│    ✓ Extract JWT from Authorization header         │
│    ✓ Verify JWT signature                          │
│    ✓ Decode payload: { sub: "user-123", role: "admin" }│
│    ✓ Attach user to req.user                       │
│    ↓                                                │
│ 8. Validation                                       │
│    ✓ Validate query params (if schema defined)     │
│    ↓                                                │
│ 9. Route Handler                                    │
│    ✓ Call getAgentHierarchy()                      │
│    ├─► TransparencySystem.getAgentHierarchy()      │
│    │   ↓                                            │
│    │   Fetch hierarchy from memory                 │
│    │   ↓                                            │
│    │   Return hierarchy tree                       │
│    ↓                                                │
│    Format response: { hierarchy: {...}, timestamp: "..." }│
│    ↓                                                │
│ 10. Response                                        │
│     ✓ Status: 200 OK                               │
│     ✓ Headers: Content-Type: application/json     │
│     ✓ Body: { hierarchy: {...} }                  │
└─────────────────────────────────────────────────────┘
       │
       │ HTTP Response
       │
       ▼
┌─────────────┐
│   Client    │
│   (Receive  │
│   hierarchy)│
└─────────────┘
```

---

## 3. Request Flow Diagram - WebSocket Connection

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ WebSocket Handshake:
       │ io('http://localhost:3000', {
       │   auth: { token: '<JWT_TOKEN>' }
       │ })
       │
       ▼
┌─────────────────────────────────────────────────────┐
│         WEBSOCKET AUTHENTICATION MIDDLEWARE          │
├─────────────────────────────────────────────────────┤
│ 1. Extract Token                                    │
│    ✓ Check socket.handshake.auth.token              │
│    ✓ Fallback to Authorization header               │
│    ✓ Token found: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...│
│    ↓                                                │
│ 2. Verify JWT Token                                 │
│    ✓ jwt.verify(token, JWT_SECRET)                  │
│    ✓ Decoded: { sub: "user-123", username: "admin", role: "admin" }│
│    ↓                                                │
│ 3. Attach User to Socket                            │
│    ✓ socket.data.user = decoded                     │
│    ✓ socket.data.authenticated = true               │
│    ↓                                                │
│ 4. Accept Connection                                │
│    ✓ next() - Connection established                │
└─────────────────────────────────────────────────────┘
       │
       │ Connection Established
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              WEBSOCKET EVENT FLOW                    │
├─────────────────────────────────────────────────────┤
│ 1. Client Subscribes to Channels                    │
│    Client: socket.emit('subscribe', {               │
│              channels: ['agents', 'metrics']        │
│            })                                        │
│    Server: socket.join('agents')                    │
│            socket.join('metrics')                   │
│    ↓                                                │
│ 2. TransparencySystem Event Occurs                  │
│    TransparencySystem.emit('agentStateChanged', {   │
│      agentId: 'agent-1',                            │
│      status: 'busy',                                │
│      currentTask: 'Implementing auth'               │
│    })                                               │
│    ↓                                                │
│ 3. Server Propagates Event to WebSocket             │
│    io.to('agents').emit('agent_update', {           │
│      type: 'agent_update',                          │
│      agentId: 'agent-1',                            │
│      status: 'busy',                                │
│      timestamp: '2025-10-11T12:00:00Z'              │
│    })                                               │
│    ↓                                                │
│ 4. Client Receives Event                            │
│    socket.on('agent_update', (data) => {            │
│      console.log('Agent updated:', data);           │
│      // Update UI with new agent status             │
│    })                                               │
└─────────────────────────────────────────────────────┘
       │
       │ Real-time Updates
       │
       ▼
┌─────────────┐
│   Client    │
│   (UI updated│
│   in real-time)│
└─────────────┘
```

---

## 4. Integration Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                   UNIFIED EXPRESS SERVER                        │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             │ Integration Layer
                             │
         ┌───────────────────┴───────────────────┐
         │                                       │
         ▼                                       ▼
┌────────────────────────┐          ┌───────────────────────────┐
│  TransparencySystem    │          │   SwarmCoordinator        │
│  Integration Adapter   │          │   Integration Adapter     │
├────────────────────────┤          ├───────────────────────────┤
│ • Event Subscription   │          │ • Agent Status Queries    │
│ • WebSocket Propagation│          │ • Task Metrics            │
│ • REST API Exposure    │          │ • Agent Intervention      │
└────────────┬───────────┘          └───────────┬───────────────┘
             │                                   │
             │ Events                            │ Methods
             │                                   │
             ▼                                   ▼
┌────────────────────────┐          ┌───────────────────────────┐
│  TransparencySystem    │          │   SwarmCoordinator        │
│  (Core Service)        │          │   (Core Service)          │
├────────────────────────┤          ├───────────────────────────┤
│ Events:                │          │ Methods:                  │
│ • agentStateChanged    │          │ • getAgentMetrics(id)     │
│ • hierarchyChange      │          │ • getSwarmStatus()        │
│ • metricsUpdate        │          │ • interveneAgent(id,action)│
│ • performanceAlert     │          │                           │
│                        │          │ Events:                   │
│ Methods:               │          │ • agentStatusChange       │
│ • getAgentHierarchy()  │          │ • taskComplete            │
│ • getAgentStatus(id)   │          │ • taskFailed              │
│ • getMetrics()         │          │                           │
│ • getLifecycleEvents() │          │                           │
└────────────────────────┘          └───────────────────────────┘
```

---

## 5. Data Flow Diagram - Agent Update Event

```
┌─────────────────────────────────────────────────────────────────┐
│                      AGENT LIFECYCLE EVENT                       │
│  Agent "agent-1" transitions from "idle" to "busy"              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ 1. Emit Event
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     TransparencySystem                           │
│  EventEmitter.emit('agentStateChanged', {                       │
│    agentId: 'agent-1',                                          │
│    oldStatus: 'idle',                                           │
│    newStatus: 'busy',                                           │
│    currentTask: 'Implementing authentication'                  │
│  })                                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ 2. Event Listener in Integration Adapter
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│            TransparencySystem Integration Adapter               │
│  transparency.on('agentStateChanged', (data) => {               │
│    io.to('agents').emit('agent_update', {                      │
│      type: 'agent_update',                                     │
│      agentId: data.agentId,                                    │
│      status: data.newStatus,                                   │
│      currentTask: data.currentTask,                            │
│      timestamp: new Date().toISOString()                       │
│    });                                                         │
│  })                                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ 3. Emit WebSocket Event
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Socket.IO Server                            │
│  io.to('agents').emit('agent_update', {...})                   │
│  ↓                                                              │
│  Room: 'agents' (subscribed clients)                           │
│  └─► socket-1 (Dashboard User 1)                              │
│  └─► socket-2 (Dashboard User 2)                              │
│  └─► socket-3 (Mobile App)                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ 4. Clients Receive Event
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Client 1    │  │  Client 2    │  │  Client 3    │
│ (Dashboard)  │  │ (Dashboard)  │  │ (Mobile App) │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ socket.on(   │  │ socket.on(   │  │ socket.on(   │
│ 'agent_update'│  │ 'agent_update'│  │ 'agent_update'│
│ )            │  │ )            │  │ )            │
│ ↓            │  │ ↓            │  │ ↓            │
│ Update UI:   │  │ Update UI:   │  │ Update UI:   │
│ Agent 1      │  │ Agent 1      │  │ Agent 1      │
│ Status: BUSY │  │ Status: BUSY │  │ Status: BUSY │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 6. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION DEPLOYMENT                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTPS (443)
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LOAD BALANCER / REVERSE PROXY                 │
│                         (nginx / Apache)                         │
│  • SSL Termination (TLS 1.3)                                    │
│  • Load Balancing (Round Robin)                                 │
│  • Rate Limiting (Layer 7)                                      │
│  • DDoS Protection                                              │
└────────────┬──────────────────────────────┬─────────────────────┘
             │                              │
             │ HTTP (3000)                  │ HTTP (3000)
             │                              │
             ▼                              ▼
┌────────────────────────┐     ┌────────────────────────┐
│  Express Server #1     │     │  Express Server #2     │
│  (Docker Container)    │     │  (Docker Container)    │
│  Port: 3000            │     │  Port: 3000            │
│                        │     │                        │
│  • REST API            │     │  • REST API            │
│  • WebSocket Server    │     │  • WebSocket Server    │
│  • TransparencySystem  │     │  • TransparencySystem  │
│  • SwarmCoordinator    │     │  • SwarmCoordinator    │
└────────────┬───────────┘     └────────────┬───────────┘
             │                              │
             │ Event Bus (Redis Pub/Sub)    │
             │                              │
             └──────────────┬───────────────┘
                            │
                            ▼
               ┌────────────────────────┐
               │   Redis (Optional)     │
               │  • Session Storage     │
               │  • Event Bus           │
               │  • Cache               │
               └────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    MONITORING & LOGGING                          │
│  • Winston (File Logs)                                          │
│  • Prometheus (Metrics)                                         │
│  • Grafana (Dashboards)                                         │
│  • Sentry (Error Tracking)                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: NETWORK SECURITY                                        │
│  • Firewall (Allow 443, 3000 only)                              │
│  • DDoS Protection (Cloudflare, AWS Shield)                     │
│  • IP Whitelisting (Admin endpoints)                            │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: TRANSPORT SECURITY                                      │
│  • HTTPS / WSS (TLS 1.3)                                        │
│  • Certificate Pinning (Mobile apps)                            │
│  • HSTS (Strict-Transport-Security header)                      │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: APPLICATION SECURITY (Middleware)                       │
│  • Helmet (Security Headers)                                    │
│    - Content-Security-Policy                                    │
│    - X-Frame-Options: DENY                                      │
│    - X-Content-Type-Options: nosniff                            │
│    - X-XSS-Protection: 1; mode=block                            │
│  • CORS (Origin Whitelisting)                                   │
│  • Rate Limiting (100 req/min per IP)                           │
│  • Input Validation (Zod schemas)                               │
│  • Request Sanitization (XSS prevention)                        │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4: AUTHENTICATION & AUTHORIZATION                          │
│  • JWT Authentication (24-hour expiration)                      │
│  • API Key Authentication (Service accounts)                    │
│  • Role-Based Access Control (RBAC)                             │
│    - Admin: Full access (read, write, intervene)               │
│    - User: Read-only access                                     │
│    - Service: API key access                                    │
│  • Permission-Based Access Control                              │
│    - read: View data                                            │
│    - write: Modify data                                         │
│    - admin: Intervene agents                                    │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 5: DATA SECURITY                                           │
│  • Secrets Management (Environment variables)                   │
│  • JWT Secret Rotation (90 days)                                │
│  • API Key Rotation (180 days)                                  │
│  • Audit Logging (All admin actions)                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Error Flow Diagram

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ HTTP Request with Invalid Token
       │ Authorization: Bearer invalid-token
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              MIDDLEWARE STACK                       │
│                                                     │
│ 1-6. Security, CORS, Compression, Body Parsing,    │
│      Rate Limiting, Logging                        │
│      ✓ All pass                                    │
│      ↓                                             │
│ 7. Authentication Middleware                       │
│    ✓ Extract token from Authorization header      │
│    ✓ Attempt JWT verification                     │
│    ✗ jwt.verify() throws TokenExpiredError        │
│    ✓ Try API key authentication                   │
│    ✗ No API key found                             │
│    ↓                                              │
│    Return 401 Unauthorized                        │
│    ↓                                              │
│    res.status(401).json({                         │
│      error: 'Unauthorized',                       │
│      message: 'Authentication required',          │
│      timestamp: '2025-10-11T12:00:00Z'            │
│    })                                             │
│    ↓                                              │
│    SKIP Route Handler (not reached)               │
│    ↓                                              │
│ 9. Error Handler Middleware                       │
│    ✓ Log error: 401 Unauthorized                  │
│    ✓ Response already sent, skip error handler    │
└─────────────────────────────────────────────────────┘
       │
       │ HTTP Response: 401 Unauthorized
       │ { error: 'Unauthorized', message: '...' }
       │
       ▼
┌─────────────┐
│   Client    │
│   (Handle   │
│   401 error)│
└─────────────┘

──────────────────────────────────────────────────────

UNHANDLED ERROR FLOW:

┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ HTTP Request: GET /api/agents/hierarchy
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              MIDDLEWARE STACK                       │
│                                                     │
│ 1-8. All middleware pass                           │
│      ↓                                             │
│ 9. Route Handler                                   │
│    ✓ Call getAgentHierarchy()                     │
│    ✗ TransparencySystem throws Error              │
│       "Database connection failed"                │
│    ↓                                              │
│    throw new Error('Database connection failed')  │
│    ↓                                              │
│ 10. Error Handler Middleware (Catch)              │
│     ✓ logger.error('Unhandled error', { ... })    │
│     ✓ Determine status code: 500                  │
│     ✓ Check environment: production               │
│     ✓ Hide error details (security)               │
│     ↓                                             │
│     res.status(500).json({                        │
│       error: 'Internal server error',             │
│       timestamp: '2025-10-11T12:00:00Z',          │
│       requestId: 'req-abc123'                     │
│     })                                            │
└─────────────────────────────────────────────────────┘
       │
       │ HTTP Response: 500 Internal Server Error
       │ { error: 'Internal server error', ... }
       │
       ▼
┌─────────────┐
│   Client    │
│   (Display  │
│   error)    │
└─────────────┘
```

---

**END OF ARCHITECTURE DIAGRAMS**
