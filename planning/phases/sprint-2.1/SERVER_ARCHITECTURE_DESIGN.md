# Unified Express Server Architecture Design

**Epic**: Phase 2 - Unified Web Portal Consolidation
**Sprint**: 2.1 - Core Server Setup
**Version**: 1.0.0
**Date**: 2025-10-11
**Architect**: architect-1

---

## 1. Executive Summary

### 1.1 Consolidation Objectives

**Current State**: Three separate Express servers with overlapping functionality:
1. **src/web/api/server.ts** - Transparency API server (port unknown)
2. **src/web/portal-server.ts** - Web portal server (configurable port)
3. **monitor/dashboard/secure-server.ts** - Secure monitoring dashboard (port 3001)

**Target State**: Single unified production-ready Express server at `packages/web-portal/src/server/`

### 1.2 Architecture Goals

- **Consolidation**: Merge three servers into one cohesive architecture
- **Security**: Enterprise-grade authentication, authorization, and security headers
- **Real-time**: WebSocket support for live monitoring and updates
- **Scalability**: Designed for horizontal scaling and high availability
- **Maintainability**: Clean separation of concerns, modular design
- **Observability**: Comprehensive logging, metrics, and monitoring

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Client Applications                        │
│  (React Dashboard, Mobile Apps, CLI Tools)                   │
└────────────┬──────────────────────────────┬─────────────────┘
             │                              │
             │ HTTP/HTTPS                   │ WebSocket (Socket.IO)
             │                              │
┌────────────▼──────────────────────────────▼─────────────────┐
│                  Unified Express Server                      │
│                  packages/web-portal/                        │
├──────────────────────────────────────────────────────────────┤
│  Middleware Stack (Security → Auth → Validation → Logging)  │
├──────────────────────────────────────────────────────────────┤
│           REST API Endpoints (7 total)                       │
│  /api/agents/hierarchy | /api/agents/:id/status              │
│  /api/metrics | /api/events | /api/resources                │
│  /api/agents/:id/intervene | /api/health                     │
├──────────────────────────────────────────────────────────────┤
│        Socket.IO Server (Real-time Events)                   │
│  agent_update | hierarchy_change | metrics_update            │
│  error | notification                                        │
├──────────────────────────────────────────────────────────────┤
│              Integration Layer                               │
│  TransparencySystem | SwarmCoordinator                       │
└────────────┬──────────────────────────────┬─────────────────┘
             │                              │
             │                              │
    ┌────────▼────────┐           ┌────────▼────────┐
    │  Transparency   │           │      Swarm      │
    │     System      │           │   Coordinator   │
    │  (Event Stream) │           │  (Agent State)  │
    └─────────────────┘           └─────────────────┘
```

### 2.2 Directory Structure

```
packages/web-portal/src/server/
├── index.ts                          # Main server entry point + graceful shutdown
├── app.ts                            # Express app configuration
│
├── config/
│   ├── server.config.ts              # Server configuration (port, host, env)
│   ├── middleware.config.ts          # Middleware stack configuration
│   └── swagger.config.ts             # OpenAPI/Swagger configuration
│
├── middleware/
│   ├── authentication.ts             # JWT + API key authentication
│   ├── error-handler.ts              # Centralized error handling
│   ├── validation.ts                 # Request schema validation (Zod)
│   ├── rate-limiting.ts              # Rate limiting (100 req/min per IP)
│   ├── security.ts                   # Helmet + CORS + Compression
│   └── logging.ts                    # Request/response logging (Winston)
│
├── routes/
│   ├── index.ts                      # Route aggregator
│   ├── agents.routes.ts              # Agent endpoints (hierarchy, status)
│   ├── metrics.routes.ts             # Metrics endpoint
│   ├── events.routes.ts              # Events endpoint with pagination
│   ├── resources.routes.ts           # Resources endpoint
│   ├── intervention.routes.ts        # Intervention endpoint (POST)
│   └── health.routes.ts              # Health check endpoint
│
├── websocket/
│   ├── server.ts                     # Socket.IO server setup
│   ├── handlers/
│   │   ├── agent-events.ts           # Agent update event handlers
│   │   ├── metrics-events.ts         # Metrics update event handlers
│   │   ├── hierarchy-events.ts       # Hierarchy change event handlers
│   │   ├── error-events.ts           # Error event handlers
│   │   └── notification-events.ts    # Notification event handlers
│   ├── rooms.ts                      # Room management (agent-specific channels)
│   └── authentication.ts             # WebSocket authentication middleware
│
├── integrations/
│   ├── transparency-system.ts        # TransparencySystem integration
│   └── swarm-coordinator.ts          # SwarmCoordinator integration
│
└── types/
    ├── api.types.ts                  # API request/response TypeScript types
    └── websocket.types.ts            # WebSocket event TypeScript types
```

### 2.3 Port Configuration

**Production Port**: 3000 (configurable via `SERVER_PORT` environment variable)

**Rationale**:
- Standard port for Node.js applications
- Allows reverse proxy (nginx/Apache) on port 80/443
- Avoids port conflicts with existing servers during migration

---

## 3. REST API Specification

### 3.1 API Endpoints (7 Total)

#### 3.1.1 Agent Hierarchy

```http
GET /api/agents/hierarchy
Authorization: Bearer <JWT_TOKEN> | X-API-Key: <API_KEY>
```

**Response**:
```json
{
  "hierarchy": {
    "id": "root",
    "name": "Root Coordinator",
    "type": "coordinator",
    "status": "active",
    "children": [
      {
        "id": "agent-1",
        "name": "Coder Agent",
        "type": "coder",
        "status": "busy",
        "children": []
      }
    ]
  },
  "timestamp": "2025-10-11T12:00:00Z"
}
```

#### 3.1.2 Agent Status

```http
GET /api/agents/:id/status
Authorization: Bearer <JWT_TOKEN> | X-API-Key: <API_KEY>
```

**Response**:
```json
{
  "agentId": "agent-1",
  "name": "Coder Agent",
  "status": "busy",
  "currentTask": "Implementing authentication",
  "metrics": {
    "tasksCompleted": 15,
    "tasksFailed": 2,
    "uptime": 3600000,
    "memoryUsage": 134217728
  },
  "timestamp": "2025-10-11T12:00:00Z"
}
```

#### 3.1.3 System Metrics

```http
GET /api/metrics
Authorization: Bearer <JWT_TOKEN> | X-API-Key: <API_KEY>
```

**Response**:
```json
{
  "system": {
    "uptime": 86400000,
    "memory": {
      "total": 8589934592,
      "used": 4294967296,
      "free": 4294967296
    },
    "cpu": {
      "usage": 45.5,
      "cores": 8
    }
  },
  "agents": {
    "total": 50,
    "active": 35,
    "idle": 10,
    "failed": 5
  },
  "tasks": {
    "pending": 100,
    "running": 35,
    "completed": 1500,
    "failed": 25
  },
  "timestamp": "2025-10-11T12:00:00Z"
}
```

#### 3.1.4 Event History

```http
GET /api/events?page=1&limit=50&type=agent_update&agentId=agent-1
Authorization: Bearer <JWT_TOKEN> | X-API-Key: <API_KEY>
```

**Query Parameters**:
- `page` (optional, default: 1): Page number
- `limit` (optional, default: 50, max: 100): Events per page
- `type` (optional): Filter by event type (agent_update, hierarchy_change, error, etc.)
- `agentId` (optional): Filter by agent ID

**Response**:
```json
{
  "events": [
    {
      "id": "evt-123",
      "type": "agent_update",
      "agentId": "agent-1",
      "timestamp": "2025-10-11T12:00:00Z",
      "data": {
        "status": "busy",
        "task": "Implementing authentication"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1500,
    "totalPages": 30
  },
  "timestamp": "2025-10-11T12:00:00Z"
}
```

#### 3.1.5 Resource Utilization

```http
GET /api/resources
Authorization: Bearer <JWT_TOKEN> | X-API-Key: <API_KEY>
```

**Response**:
```json
{
  "memory": {
    "total": 8589934592,
    "used": 4294967296,
    "free": 4294967296,
    "usagePercent": 50.0
  },
  "cpu": {
    "usage": 45.5,
    "cores": 8,
    "loadAverage": [2.5, 2.3, 2.1]
  },
  "network": {
    "bytesIn": 1073741824,
    "bytesOut": 536870912
  },
  "timestamp": "2025-10-11T12:00:00Z"
}
```

#### 3.1.6 Agent Intervention

```http
POST /api/agents/:id/intervene
Authorization: Bearer <JWT_TOKEN> (admin role required)
Content-Type: application/json

{
  "action": "pause" | "resume" | "restart" | "terminate",
  "reason": "Manual intervention for debugging"
}
```

**Response**:
```json
{
  "success": true,
  "agentId": "agent-1",
  "action": "pause",
  "timestamp": "2025-10-11T12:00:00Z",
  "message": "Agent paused successfully"
}
```

#### 3.1.7 Health Check

```http
GET /api/health
```

**No authentication required** (public endpoint for load balancers)

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-11T12:00:00Z",
  "uptime": 86400000,
  "version": "2.0.0",
  "dependencies": {
    "transparencySystem": "connected",
    "swarmCoordinator": "connected",
    "database": "connected"
  }
}
```

---

## 4. WebSocket Event Specification

### 4.1 Socket.IO Events (5 Types)

#### 4.1.1 Agent Update Event

**Event**: `agent_update`

**Payload**:
```json
{
  "type": "agent_update",
  "agentId": "agent-1",
  "status": "busy",
  "currentTask": "Implementing authentication",
  "timestamp": "2025-10-11T12:00:00Z"
}
```

**Subscription**:
```javascript
socket.on('agent_update', (data) => {
  console.log('Agent updated:', data);
});
```

#### 4.1.2 Hierarchy Change Event

**Event**: `hierarchy_change`

**Payload**:
```json
{
  "type": "hierarchy_change",
  "action": "agent_added" | "agent_removed" | "agent_moved",
  "agentId": "agent-1",
  "parentId": "coordinator-1",
  "timestamp": "2025-10-11T12:00:00Z"
}
```

#### 4.1.3 Metrics Update Event

**Event**: `metrics_update`

**Payload**:
```json
{
  "type": "metrics_update",
  "metrics": {
    "cpu": 45.5,
    "memory": 4294967296,
    "activeAgents": 35
  },
  "timestamp": "2025-10-11T12:00:00Z"
}
```

#### 4.1.4 Error Event

**Event**: `error`

**Payload**:
```json
{
  "type": "error",
  "severity": "critical" | "warning" | "info",
  "message": "Agent agent-1 failed to complete task",
  "agentId": "agent-1",
  "timestamp": "2025-10-11T12:00:00Z"
}
```

#### 4.1.5 Notification Event

**Event**: `notification`

**Payload**:
```json
{
  "type": "notification",
  "category": "info" | "success" | "warning" | "error",
  "title": "Task Completed",
  "message": "Authentication implementation completed successfully",
  "timestamp": "2025-10-11T12:00:00Z"
}
```

### 4.2 Room Management

**Rooms** allow clients to subscribe to specific event channels:

- `agents` - All agent update events
- `hierarchy` - Hierarchy change events
- `metrics` - System metrics updates
- `errors` - Error events
- `notifications` - Notification events
- `agent-{agentId}` - Events for specific agent (e.g., `agent-agent-1`)

**Subscription Example**:
```javascript
// Client-side subscription
socket.emit('subscribe', { channels: ['agents', 'metrics', 'agent-agent-1'] });

// Unsubscribe
socket.emit('unsubscribe', { channels: ['agent-agent-1'] });
```

---

## 5. Middleware Architecture

### 5.1 Middleware Stack (Ordered Execution)

```
Request
  ↓
1. Helmet (Security Headers)
  ↓
2. CORS (Cross-Origin Resource Sharing)
  ↓
3. Compression (gzip)
  ↓
4. Body Parsing (JSON, urlencoded)
  ↓
5. Rate Limiting (100 req/min per IP)
  ↓
6. Request Logging (Winston)
  ↓
7. Authentication (JWT/API Key) - Applied to protected routes
  ↓
8. Validation (Zod schema validation) - Applied to routes with schemas
  ↓
Route Handler
  ↓
9. Error Handler (Catch-all)
  ↓
Response
```

### 5.2 Middleware Configuration

#### 5.2.1 Security Headers (Helmet)

```typescript
// middleware/security.ts
import helmet from 'helmet';

export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  xssFilter: true
});
```

#### 5.2.2 CORS Configuration

```typescript
// middleware/security.ts
import cors from 'cors';

export const corsMiddleware = cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
});
```

#### 5.2.3 Rate Limiting

```typescript
// middleware/rate-limiting.ts
import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
      retryAfter: Math.ceil(req.rateLimit.resetTime! / 1000),
      timestamp: new Date().toISOString()
    });
  }
});
```

#### 5.2.4 Authentication

```typescript
// middleware/authentication.ts
import jwt from 'jsonwebtoken';

export const authMiddleware = (req, res, next) => {
  // Skip authentication for public endpoints
  if (req.path === '/api/health') {
    return next();
  }

  // Try JWT authentication
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      req.user = decoded;
      return next();
    } catch (error) {
      // Invalid JWT, try API key
    }
  }

  // Try API key authentication
  const apiKey = req.headers['x-api-key'];
  if (apiKey === process.env.API_KEY) {
    req.apiKey = apiKey;
    return next();
  }

  // No valid authentication
  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication required',
    timestamp: new Date().toISOString()
  });
};
```

#### 5.2.5 Request Validation

```typescript
// middleware/validation.ts
import { z } from 'zod';

export const validateRequest = (schema: z.ZodSchema) => {
  return (req, res, next) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      });
      next();
    } catch (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.errors,
        timestamp: new Date().toISOString()
      });
    }
  };
};
```

#### 5.2.6 Error Handling

```typescript
// middleware/error-handler.ts
export const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(err.status || 500).json({
    error: message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};
```

#### 5.2.7 Request Logging

```typescript
// middleware/logging.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

export const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });

  next();
};
```

---

## 6. Integration Architecture

### 6.1 TransparencySystem Integration

**Purpose**: Real-time agent lifecycle event streaming

**Integration Points**:
1. **Event Subscription**: Subscribe to TransparencySystem events on server startup
2. **WebSocket Propagation**: Forward events to connected WebSocket clients
3. **API Endpoints**: Expose TransparencySystem data via REST API

**Event Flow**:
```
TransparencySystem
  ↓ (emits)
agentStateChanged → WebSocket → agent_update event → Clients
hierarchyChange → WebSocket → hierarchy_change event → Clients
metricsUpdate → WebSocket → metrics_update event → Clients
```

**Implementation**:
```typescript
// integrations/transparency-system.ts
import { TransparencySystem } from '@/coordination/shared/transparency/transparency-system';

export class TransparencyIntegration {
  private transparency: TransparencySystem;
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.transparency = new TransparencySystem();
    this.io = io;
  }

  async initialize() {
    await this.transparency.initialize({
      enableRealTimeMonitoring: true,
      enableEventStreaming: true,
      metricsUpdateIntervalMs: 5000,
      heartbeatIntervalMs: 10000
    });

    // Subscribe to events
    this.transparency.on('agentStateChanged', (data) => {
      this.io.to('agents').emit('agent_update', {
        type: 'agent_update',
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    this.transparency.on('hierarchyChange', (data) => {
      this.io.to('hierarchy').emit('hierarchy_change', {
        type: 'hierarchy_change',
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    this.transparency.on('metricsUpdate', (data) => {
      this.io.to('metrics').emit('metrics_update', {
        type: 'metrics_update',
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    await this.transparency.startMonitoring();
  }

  async cleanup() {
    await this.transparency.stopMonitoring();
    await this.transparency.cleanup();
  }

  getHierarchy() {
    return this.transparency.getAgentHierarchy();
  }

  getAgentStatus(agentId: string) {
    return this.transparency.getAgentStatus(agentId);
  }

  getMetrics() {
    return this.transparency.getMetrics();
  }

  getEvents(filter: { type?: string; agentId?: string; page?: number; limit?: number }) {
    return this.transparency.getLifecycleEvents(filter);
  }
}
```

### 6.2 SwarmCoordinator Integration

**Purpose**: Expose swarm status and agent metrics

**Integration Points**:
1. **Agent Status**: Retrieve real-time agent status from SwarmCoordinator
2. **Task Metrics**: Expose task completion, failure rates
3. **Resource Metrics**: CPU, memory usage per agent

**Implementation**:
```typescript
// integrations/swarm-coordinator.ts
import { SwarmCoordinator } from '@/coordination/swarm-coordinator';

export class SwarmIntegration {
  private swarm: SwarmCoordinator;

  constructor() {
    this.swarm = new SwarmCoordinator({
      maxAgents: 50,
      enableMonitoring: true
    });
  }

  async initialize() {
    // Subscribe to swarm events
    this.swarm.on('agentStatusChange', (data) => {
      // Propagate to TransparencySystem
    });
  }

  getAgentMetrics(agentId: string) {
    return this.swarm.getAgentMetrics(agentId);
  }

  getSwarmStatus() {
    return this.swarm.getStatus();
  }

  async interveneAgent(agentId: string, action: string) {
    return this.swarm.interveneAgent(agentId, action);
  }
}
```

---

## 7. Security Architecture

### 7.1 Authentication Strategy

**Supported Methods**:
1. **JWT (JSON Web Token)**: Primary method for user authentication
2. **API Key**: Service-to-service authentication
3. **Basic Auth**: Development/testing only

**JWT Token Structure**:
```json
{
  "sub": "user-123",
  "username": "admin",
  "role": "admin",
  "permissions": ["read", "write", "admin"],
  "iat": 1633024800,
  "exp": 1633111200
}
```

**Token Generation**:
```typescript
import jwt from 'jsonwebtoken';

export function generateToken(user: User): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: '24h',
      issuer: 'web-portal-server',
      audience: 'web-portal-client'
    }
  );
}
```

### 7.2 Authorization Strategy

**Role-Based Access Control (RBAC)**:
- **Admin**: Full access (read, write, intervene)
- **User**: Read-only access
- **Service**: API key access for automation

**Permission Enforcement**:
```typescript
// Require admin role for intervention endpoint
router.post('/api/agents/:id/intervene',
  authMiddleware,
  requireRole('admin'),
  interventionHandler
);
```

### 7.3 WebSocket Authentication

**Challenge**: Socket.IO authentication before connection established

**Solution**: JWT token in handshake

```typescript
// websocket/authentication.ts
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token ||
                socket.handshake.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    socket.data.user = decoded;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});
```

### 7.4 Security Headers (Helmet)

**Headers Applied**:
- `Content-Security-Policy`: Restrict resource loading
- `Strict-Transport-Security`: Force HTTPS (1 year)
- `X-Frame-Options`: Prevent clickjacking (DENY)
- `X-Content-Type-Options`: Prevent MIME sniffing
- `X-XSS-Protection`: Enable XSS filter

### 7.5 Rate Limiting Strategy

**Global Rate Limit**: 100 requests/minute per IP
**Endpoint-Specific Limits**:
- `/api/agents/:id/intervene`: 10 requests/minute (admin action)
- `/api/events`: 50 requests/minute (pagination endpoint)

**Implementation**:
```typescript
const interventionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Intervention rate limit exceeded'
});

router.post('/api/agents/:id/intervene', interventionLimiter, handler);
```

---

## 8. Performance Optimization

### 8.1 Caching Strategy

**In-Memory Cache** (for frequently accessed data):
- Agent hierarchy (5-second TTL)
- System metrics (10-second TTL)
- Agent status (3-second TTL)

**Implementation**:
```typescript
const cache = new Map<string, { data: any; expiry: number }>();

function getCached<T>(key: string, ttl: number, fetchFn: () => T): T {
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  const data = fetchFn();
  cache.set(key, { data, expiry: Date.now() + ttl });
  return data;
}
```

### 8.2 Compression

**gzip compression** for all responses > 1KB

```typescript
import compression from 'compression';

app.use(compression({
  level: 6, // Balance between speed and compression ratio
  threshold: 1024 // Only compress responses > 1KB
}));
```

### 8.3 Connection Pooling

**HTTP Keep-Alive**: Enabled by default in Node.js
**WebSocket Connection Limits**: Max 1000 concurrent connections

```typescript
io = new SocketIOServer(server, {
  maxHttpBufferSize: 1e6, // 1MB max payload
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});
```

---

## 9. OpenAPI/Swagger Specification

### 9.1 API Documentation Setup

**Library**: `swagger-jsdoc` + `swagger-ui-express`

**Configuration**:
```typescript
// config/swagger.config.ts
import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Unified Web Portal API',
      version: '2.0.0',
      description: 'REST API for agent monitoring and management',
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.production.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      }
    },
    security: [
      { bearerAuth: [] },
      { apiKeyAuth: [] }
    ]
  },
  apis: ['./src/server/routes/*.ts']
});
```

**Endpoint Documentation Example**:
```typescript
/**
 * @swagger
 * /api/agents/hierarchy:
 *   get:
 *     summary: Get agent hierarchy tree
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Agent hierarchy tree
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hierarchy:
 *                   $ref: '#/components/schemas/AgentHierarchyNode'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get('/hierarchy', getHierarchyHandler);
```

---

## 10. Error Handling Strategy

### 10.1 Error Response Format

**Consistent JSON Structure**:
```json
{
  "error": "Error Type",
  "message": "Human-readable error message",
  "details": { /* Optional error details */ },
  "timestamp": "2025-10-11T12:00:00Z",
  "path": "/api/agents/invalid-id",
  "requestId": "req-123"
}
```

### 10.2 HTTP Status Codes

- `200 OK`: Successful request
- `201 Created`: Resource created
- `400 Bad Request`: Validation error
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

### 10.3 Error Classes

```typescript
// types/errors.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(details: any) {
    super(400, 'Validation Error', details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Insufficient permissions') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}
```

---

## 11. Logging Strategy

### 11.1 Winston Logger Configuration

```typescript
// middleware/logging.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'web-portal-server',
    version: '2.0.0'
  },
  transports: [
    // Error logs
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    // Combined logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760,
      maxFiles: 10
    }),
    // Console (development)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});
```

### 11.2 Log Levels

- `error`: Critical errors requiring immediate attention
- `warn`: Warning messages (rate limit approaching, deprecated API usage)
- `info`: General information (server startup, shutdown, API calls)
- `debug`: Detailed debugging information (middleware execution, cache hits)

### 11.3 Structured Logging

```typescript
logger.info('Request processed', {
  method: 'GET',
  path: '/api/agents/hierarchy',
  status: 200,
  duration: 45,
  ip: '192.168.1.100',
  userId: 'user-123'
});
```

---

## 12. Deployment Architecture

### 12.1 Environment Variables

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

### 12.2 Docker Configuration

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
```

**Docker Compose**:
```yaml
# docker-compose.yml
version: '3.8'

services:
  web-portal:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - SERVER_PORT=3000
      - JWT_SECRET=${JWT_SECRET}
      - API_KEY=${API_KEY}
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 12.3 Reverse Proxy (nginx)

```nginx
# nginx.conf
upstream web_portal {
    server localhost:3000;
}

server {
    listen 80;
    server_name dashboard.example.com;

    location / {
        proxy_pass http://web_portal;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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

## 13. Migration Strategy

### 13.1 Server Consolidation Plan

**Phase 1**: Build unified server (Sprint 2.1)
- Implement directory structure
- Configure middleware stack
- Implement REST API endpoints
- Implement WebSocket server
- Integrate TransparencySystem and SwarmCoordinator

**Phase 2**: Parallel deployment (Sprint 2.2)
- Deploy unified server on new port (3000)
- Keep existing servers running (3001, etc.)
- Test unified server in isolation

**Phase 3**: Traffic migration (Sprint 2.3)
- Update frontend to connect to unified server
- Monitor for errors and performance issues
- Gradual traffic shift (10% → 50% → 100%)

**Phase 4**: Deprecation (Sprint 2.4)
- Shut down old servers
- Remove legacy code
- Update documentation

### 13.2 Feature Parity Checklist

- [ ] All endpoints from `src/web/api/server.ts` migrated
- [ ] All endpoints from `src/web/portal-server.ts` migrated
- [ ] All endpoints from `monitor/dashboard/secure-server.ts` migrated
- [ ] Authentication methods migrated (JWT, API key, Basic Auth)
- [ ] Rate limiting migrated
- [ ] WebSocket events migrated
- [ ] Logging migrated
- [ ] Error handling migrated
- [ ] Security headers migrated
- [ ] CORS configuration migrated
- [ ] Health check endpoint migrated
- [ ] API documentation migrated

---

## 14. Testing Strategy

### 14.1 Unit Tests

**Test Coverage**: 80% minimum

**Test Areas**:
- Middleware functions (auth, validation, rate limiting)
- Route handlers (agents, metrics, events)
- WebSocket handlers (agent updates, metrics)
- Integration adapters (TransparencySystem, SwarmCoordinator)

**Example**:
```typescript
// __tests__/middleware/authentication.test.ts
describe('Authentication Middleware', () => {
  it('should accept valid JWT token', async () => {
    const token = generateToken({ id: 'user-123', role: 'admin' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {};
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
  });

  it('should reject invalid JWT token', async () => {
    const req = { headers: { authorization: 'Bearer invalid-token' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

### 14.2 Integration Tests

**Test Areas**:
- Full API endpoint workflows (request → middleware → handler → response)
- WebSocket connection and event propagation
- Error handling across middleware stack
- Rate limiting behavior

**Example**:
```typescript
// __tests__/routes/agents.integration.test.ts
describe('GET /api/agents/hierarchy', () => {
  let server: Server;
  let token: string;

  beforeAll(async () => {
    server = await createTestServer();
    token = generateToken({ id: 'admin', role: 'admin' });
  });

  it('should return agent hierarchy', async () => {
    const response = await request(server)
      .get('/api/agents/hierarchy')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveProperty('hierarchy');
    expect(response.body.hierarchy).toHaveProperty('id');
    expect(response.body.hierarchy).toHaveProperty('children');
  });

  afterAll(async () => {
    await server.close();
  });
});
```

### 14.3 End-to-End Tests

**Test Areas**:
- Full user workflows (login → fetch data → logout)
- WebSocket subscriptions and real-time updates
- Error recovery scenarios

**Tools**: Playwright or Cypress

---

## 15. Monitoring and Observability

### 15.1 Health Checks

**Endpoint**: `GET /api/health`

**Checks**:
- Server uptime
- TransparencySystem connection
- SwarmCoordinator connection
- Memory usage (< 80% threshold)
- CPU usage (< 80% threshold)

### 15.2 Metrics Collection

**Prometheus Integration** (optional for production):

```typescript
// config/prometheus.ts
import prometheus from 'prom-client';

const register = new prometheus.Registry();

export const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

export const activeWebSocketConnections = new prometheus.Gauge({
  name: 'websocket_active_connections',
  help: 'Number of active WebSocket connections',
  registers: [register]
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### 15.3 Alerting Rules

**Critical Alerts**:
- Server down (health check fails for > 1 minute)
- Memory usage > 90%
- Error rate > 5% (5xx responses)
- WebSocket disconnection rate > 10%

**Warning Alerts**:
- Memory usage > 80%
- CPU usage > 80%
- Rate limit hit rate > 20%

---

## 16. Files to Create

### 16.1 Server Core (3 files)

1. **packages/web-portal/src/server/index.ts** - Main entry point with graceful shutdown
2. **packages/web-portal/src/server/app.ts** - Express app configuration
3. **packages/web-portal/src/server/config/server.config.ts** - Server configuration

### 16.2 Configuration (3 files)

4. **packages/web-portal/src/server/config/middleware.config.ts** - Middleware stack configuration
5. **packages/web-portal/src/server/config/swagger.config.ts** - OpenAPI/Swagger configuration
6. **packages/web-portal/src/server/types/api.types.ts** - TypeScript types for API

### 16.3 Middleware (6 files)

7. **packages/web-portal/src/server/middleware/authentication.ts** - JWT + API key authentication
8. **packages/web-portal/src/server/middleware/error-handler.ts** - Centralized error handling
9. **packages/web-portal/src/server/middleware/validation.ts** - Request schema validation (Zod)
10. **packages/web-portal/src/server/middleware/rate-limiting.ts** - Rate limiting configuration
11. **packages/web-portal/src/server/middleware/security.ts** - Helmet + CORS + Compression
12. **packages/web-portal/src/server/middleware/logging.ts** - Request/response logging (Winston)

### 16.4 Routes (7 files)

13. **packages/web-portal/src/server/routes/index.ts** - Route aggregator
14. **packages/web-portal/src/server/routes/agents.routes.ts** - Agent hierarchy + status endpoints
15. **packages/web-portal/src/server/routes/metrics.routes.ts** - Metrics endpoint
16. **packages/web-portal/src/server/routes/events.routes.ts** - Events endpoint with pagination
17. **packages/web-portal/src/server/routes/resources.routes.ts** - Resources endpoint
18. **packages/web-portal/src/server/routes/intervention.routes.ts** - Agent intervention endpoint
19. **packages/web-portal/src/server/routes/health.routes.ts** - Health check endpoint

### 16.5 WebSocket (7 files)

20. **packages/web-portal/src/server/websocket/server.ts** - Socket.IO server setup
21. **packages/web-portal/src/server/websocket/authentication.ts** - WebSocket authentication
22. **packages/web-portal/src/server/websocket/rooms.ts** - Room management
23. **packages/web-portal/src/server/websocket/handlers/agent-events.ts** - Agent update handlers
24. **packages/web-portal/src/server/websocket/handlers/metrics-events.ts** - Metrics update handlers
25. **packages/web-portal/src/server/websocket/handlers/hierarchy-events.ts** - Hierarchy change handlers
26. **packages/web-portal/src/server/websocket/handlers/error-events.ts** - Error event handlers
27. **packages/web-portal/src/server/websocket/handlers/notification-events.ts** - Notification handlers
28. **packages/web-portal/src/server/types/websocket.types.ts** - WebSocket event types

### 16.6 Integrations (2 files)

29. **packages/web-portal/src/server/integrations/transparency-system.ts** - TransparencySystem integration
30. **packages/web-portal/src/server/integrations/swarm-coordinator.ts** - SwarmCoordinator integration

### 16.7 Documentation (2 files)

31. **packages/web-portal/docs/API.md** - REST API documentation
32. **packages/web-portal/docs/WEBSOCKET.md** - WebSocket events documentation

**Total Files**: 32 files

---

## 17. Architecture Decision Records (ADRs)

See separate ADR documents:
1. **ADR-001-MIDDLEWARE-ORDERING.md** - Middleware stack ordering rationale
2. **ADR-002-AUTHENTICATION-STRATEGY.md** - JWT + API key authentication decision
3. **ADR-003-WEBSOCKET-AUTH.md** - WebSocket authentication approach
4. **ADR-004-ERROR-HANDLING.md** - Centralized error handling strategy
5. **ADR-005-LOGGING-STRATEGY.md** - Winston logging configuration
6. **ADR-006-RATE-LIMITING.md** - Rate limiting implementation
7. **ADR-007-PORT-SELECTION.md** - Port 3000 selection rationale

---

## 18. Integration Points Summary

### 18.1 TransparencySystem
- **Events**: `agentStateChanged`, `hierarchyChange`, `metricsUpdate`, `performanceAlert`
- **Methods**: `getAgentHierarchy()`, `getAgentStatus(id)`, `getMetrics()`, `getLifecycleEvents(filter)`
- **Initialization**: `initialize()`, `startMonitoring()`, `stopMonitoring()`, `cleanup()`

### 18.2 SwarmCoordinator
- **Events**: `agentStatusChange`, `taskComplete`, `taskFailed`
- **Methods**: `getAgentMetrics(id)`, `getSwarmStatus()`, `interveneAgent(id, action)`
- **Initialization**: SwarmCoordinator auto-initializes on import

---

## 19. Performance Recommendations

1. **Enable HTTP/2**: Multiplexing for better performance
2. **Use Redis for Session Storage**: Horizontal scaling support
3. **Implement CDN**: Static asset delivery
4. **Database Connection Pooling**: If using SQL database for persistence
5. **Lazy Load Routes**: Code splitting for faster startup
6. **Enable gzip Compression**: Reduce response sizes by 70-80%
7. **Implement Request Coalescing**: Batch similar requests
8. **Use Worker Threads**: Offload CPU-intensive tasks
9. **Implement Circuit Breaker**: Prevent cascade failures
10. **Monitor Memory Leaks**: Regular heap snapshots

---

## 20. Security Recommendations

1. **Rotate JWT Secrets**: Monthly rotation in production
2. **Implement IP Whitelisting**: For admin endpoints
3. **Enable HTTPS Only**: Enforce TLS 1.3+
4. **Implement CSP Nonces**: Dynamic nonce generation for inline scripts
5. **Add Request Signing**: HMAC signatures for critical endpoints
6. **Enable Audit Logging**: Log all admin actions
7. **Implement Rate Limit by User**: Per-user rate limits, not just per-IP
8. **Add Input Sanitization**: Strip HTML/XSS from inputs
9. **Implement CAPTCHA**: For public endpoints (if any)
10. **Regular Security Audits**: Quarterly penetration testing

---

## 21. Confidence Score

```json
{
  "agent": "architect-1",
  "confidence": 0.90,
  "reasoning": "Complete unified server architecture with comprehensive middleware stack, REST API specification (7 endpoints), WebSocket events (5 types), security hardening (Helmet + CORS + rate limiting + JWT/API key auth), integration patterns (TransparencySystem + SwarmCoordinator), error handling strategy, logging strategy (Winston), OpenAPI/Swagger documentation, deployment configuration (Docker + nginx), and migration strategy. All 32 files specified with clear implementation paths.",
  "files_to_create": [
    "packages/web-portal/src/server/index.ts",
    "packages/web-portal/src/server/app.ts",
    "packages/web-portal/src/server/config/server.config.ts",
    "packages/web-portal/src/server/config/middleware.config.ts",
    "packages/web-portal/src/server/config/swagger.config.ts",
    "packages/web-portal/src/server/types/api.types.ts",
    "packages/web-portal/src/server/middleware/authentication.ts",
    "packages/web-portal/src/server/middleware/error-handler.ts",
    "packages/web-portal/src/server/middleware/validation.ts",
    "packages/web-portal/src/server/middleware/rate-limiting.ts",
    "packages/web-portal/src/server/middleware/security.ts",
    "packages/web-portal/src/server/middleware/logging.ts",
    "packages/web-portal/src/server/routes/index.ts",
    "packages/web-portal/src/server/routes/agents.routes.ts",
    "packages/web-portal/src/server/routes/metrics.routes.ts",
    "packages/web-portal/src/server/routes/events.routes.ts",
    "packages/web-portal/src/server/routes/resources.routes.ts",
    "packages/web-portal/src/server/routes/intervention.routes.ts",
    "packages/web-portal/src/server/routes/health.routes.ts",
    "packages/web-portal/src/server/websocket/server.ts",
    "packages/web-portal/src/server/websocket/authentication.ts",
    "packages/web-portal/src/server/websocket/rooms.ts",
    "packages/web-portal/src/server/websocket/handlers/agent-events.ts",
    "packages/web-portal/src/server/websocket/handlers/metrics-events.ts",
    "packages/web-portal/src/server/websocket/handlers/hierarchy-events.ts",
    "packages/web-portal/src/server/websocket/handlers/error-events.ts",
    "packages/web-portal/src/server/websocket/handlers/notification-events.ts",
    "packages/web-portal/src/server/types/websocket.types.ts",
    "packages/web-portal/src/server/integrations/transparency-system.ts",
    "packages/web-portal/src/server/integrations/swarm-coordinator.ts",
    "packages/web-portal/docs/API.md",
    "packages/web-portal/docs/WEBSOCKET.md"
  ],
  "integration_points": [
    "TransparencySystem (events: agentStateChanged, hierarchyChange, metricsUpdate, performanceAlert)",
    "SwarmCoordinator (methods: getAgentMetrics, getSwarmStatus, interveneAgent)"
  ],
  "blockers": []
}
```

---

**END OF ARCHITECTURE DESIGN DOCUMENT**
