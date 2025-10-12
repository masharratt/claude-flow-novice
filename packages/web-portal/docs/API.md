# Web Portal API Documentation

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [REST API Endpoints](#rest-api-endpoints)
4. [WebSocket Events](#websocket-events)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Response Formats](#response-formats)
8. [Code Examples](#code-examples)

---

## Overview

The Web Portal API provides both REST and WebSocket interfaces for real-time agent monitoring and management.

### Base URLs

- **REST API**: `http://localhost:3000/api`
- **WebSocket**: `ws://localhost:3000` (Socket.IO namespace: `/`)

### API Version

Current version: **v3.0.0**

### Content Type

All REST API requests and responses use `application/json` content type unless otherwise specified.

---

## Authentication

### JWT Token Authentication

Most endpoints require JWT authentication via Bearer token in the Authorization header.

#### Authorization Header Format

```
Authorization: Bearer <access_token>
```

#### Token Lifecycle

- **Access Token**: 15 minutes expiration
- **Refresh Token**: 7 days expiration

### Authentication Endpoints

#### POST /api/auth/logout

Revoke current JWT token by adding to blacklist.

**Request**:
```http
POST /api/auth/logout HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Successfully logged out"
}
```

**Error Responses**:
- `401 UNAUTHORIZED`: Missing or invalid token
- `400 INVALID_TOKEN`: Token missing jti claim
- `500 LOGOUT_FAILED`: Failed to revoke token

---

#### POST /api/auth/refresh

Refresh access token and blacklist old token.

**Request**:
```http
POST /api/auth/refresh HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** (200 OK):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

**Error Responses**:
- `400 MISSING_REFRESH_TOKEN`: Refresh token not provided
- `401 INVALID_REFRESH_TOKEN`: Token invalid or expired
- `401 TOKEN_REVOKED`: Token has been blacklisted
- `500 CONFIGURATION_ERROR`: JWT secret not configured
- `500 REFRESH_ERROR`: Internal error during refresh

---

### API Key Authentication (Alternative)

For server-to-server communication, use API keys via the `X-API-Key` header.

```http
X-API-Key: your-api-key-here
```

---

## REST API Endpoints

### Agents

#### GET /api/agents/hierarchy

Get complete agent hierarchy tree with optional filters.

**Authentication**: Optional (public endpoint)

**Query Parameters**:
- `status` (optional): Filter by agent status (`active`, `idle`, `paused`, `completed`, `failed`)
- `type` (optional): Filter by agent type (`coder`, `reviewer`, `tester`, etc.)

**Request**:
```http
GET /api/agents/hierarchy?status=active&type=coder HTTP/1.1
Host: localhost:3000
Cache-Control: public, max-age=30
```

**Response** (200 OK):
```json
{
  "data": {
    "root": {
      "id": "coordinator-001",
      "name": "Swarm Coordinator",
      "type": "coordinator",
      "status": "active",
      "children": [
        {
          "id": "coder-001",
          "name": "Implementation Agent 1",
          "type": "coder",
          "status": "active",
          "children": []
        },
        {
          "id": "coder-002",
          "name": "Implementation Agent 2",
          "type": "coder",
          "status": "active",
          "children": []
        }
      ]
    }
  }
}
```

**Caching**: 30 seconds

---

#### GET /api/agents/:id/status

Get individual agent status with metrics.

**Authentication**: Optional

**Path Parameters**:
- `id` (required): Agent unique identifier

**Request**:
```http
GET /api/agents/coder-001/status HTTP/1.1
Host: localhost:3000
Cache-Control: no-cache, no-store, must-revalidate
```

**Response** (200 OK):
```json
{
  "data": {
    "id": "coder-001",
    "name": "Implementation Agent 1",
    "type": "coder",
    "status": "active",
    "confidence": 0.85,
    "metrics": {
      "tasksCompleted": 12,
      "errorRate": 0.02,
      "avgExecutionTime": 342
    },
    "health": {
      "cpu": 45.2,
      "memory": 512,
      "uptime": 3600000
    },
    "createdAt": "2025-10-12T10:00:00.000Z",
    "updatedAt": "2025-10-12T10:30:00.000Z"
  }
}
```

**Error Responses**:
- `404 AGENT_NOT_FOUND`: Agent does not exist

**Caching**: No cache (real-time data)

---

#### POST /api/agents/:id/intervene

Trigger agent intervention (pause, resume, terminate, restart).

**Authentication**: **Required** (Admin only)

**Rate Limiting**: 10 requests/minute per IP

**Path Parameters**:
- `id` (required): Agent unique identifier

**Request Body**:
```json
{
  "action": "pause",
  "reason": "Manual intervention for debugging"
}
```

**Action Values**:
- `pause`: Temporarily pause agent execution
- `resume`: Resume paused agent
- `terminate`: Permanently stop agent
- `restart`: Restart agent with current configuration

**Request**:
```http
POST /api/agents/coder-001/intervene HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "action": "pause",
  "reason": "Manual intervention for debugging"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Agent paused successfully",
  "agentId": "coder-001",
  "action": "pause",
  "triggeredBy": "user-123"
}
```

**Error Responses**:
- `401 UNAUTHORIZED`: Missing or invalid authentication
- `403 FORBIDDEN`: Insufficient permissions (not admin)
- `404 AGENT_NOT_FOUND`: Agent does not exist
- `429 TOO_MANY_REQUESTS`: Rate limit exceeded

---

### Metrics

#### GET /api/metrics

Get system-wide metrics aggregated over the last 5 minutes.

**Authentication**: Optional

**Request**:
```http
GET /api/metrics HTTP/1.1
Host: localhost:3000
Cache-Control: public, max-age=10
```

**Response** (200 OK):
```json
{
  "data": {
    "system": {
      "cpu": 45.2,
      "memory": 2048,
      "disk": 50.5,
      "network": {
        "bytesIn": 1024000,
        "bytesOut": 512000
      }
    },
    "agents": {
      "total": 25,
      "active": 15,
      "idle": 8,
      "failed": 2
    },
    "swarms": {
      "total": 3,
      "active": 2
    },
    "events": {
      "total": 1500,
      "perSecond": 12.5
    },
    "timestamp": "2025-10-12T10:30:00.000Z"
  }
}
```

**Caching**: 10 seconds

---

### Events

#### GET /api/events

Get paginated event history with optional filters.

**Authentication**: Optional

**Query Parameters**:
- `page` (optional, default: 1): Page number (1-indexed)
- `limit` (optional, default: 50, max: 1000): Events per page
- `type` (optional): Filter by event type (e.g., `agent.spawned`, `cfn.loop.phase.start`)
- `severity` (optional): Filter by severity (`info`, `warning`, `error`, `critical`)
- `agentId` (optional): Filter by agent ID
- `startTime` (optional): Filter events after timestamp (ISO 8601)
- `endTime` (optional): Filter events before timestamp (ISO 8601)

**Request**:
```http
GET /api/events?page=1&limit=50&severity=error&startTime=2025-10-12T00:00:00Z HTTP/1.1
Host: localhost:3000
```

**Response** (200 OK):
```json
{
  "data": [
    {
      "id": "evt-001",
      "type": "agent.error",
      "severity": "error",
      "message": "Agent task execution failed",
      "agentId": "coder-001",
      "timestamp": "2025-10-12T10:25:00.000Z",
      "metadata": {
        "errorCode": "TASK_TIMEOUT",
        "taskId": "task-123"
      }
    },
    {
      "id": "evt-002",
      "type": "system.error",
      "severity": "error",
      "message": "Database connection timeout",
      "timestamp": "2025-10-12T10:20:00.000Z",
      "metadata": {
        "errorCode": "DB_TIMEOUT",
        "retries": 3
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 127,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

**Sorting**: Newest first (descending timestamp)

---

### Resources

#### GET /api/resources

Get current system resource utilization.

**Authentication**: Optional

**Request**:
```http
GET /api/resources HTTP/1.1
Host: localhost:3000
```

**Response** (200 OK):
```json
{
  "data": {
    "cpu": {
      "usage": 45.2,
      "cores": 8,
      "load": [2.1, 2.3, 2.2]
    },
    "memory": {
      "used": 2048,
      "total": 4096,
      "percentage": 50.0
    },
    "disk": {
      "used": 50000,
      "total": 100000,
      "percentage": 50.0
    },
    "network": {
      "bytesIn": 1024000,
      "bytesOut": 512000,
      "connectionsActive": 42
    },
    "timestamp": "2025-10-12T10:30:00.000Z"
  }
}
```

---

### Health

#### GET /api/health

Health check endpoint for monitoring and load balancers.

**Authentication**: None

**Request**:
```http
GET /api/health HTTP/1.1
Host: localhost:3000
```

**Response** (200 OK):
```json
{
  "status": "healthy",
  "version": "3.0.0",
  "uptime": 3600000,
  "timestamp": "2025-10-12T10:30:00.000Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "websocket": "healthy"
  }
}
```

**Status Values**:
- `healthy`: All services operational
- `degraded`: Some non-critical services down
- `unhealthy`: Critical services down

---

## WebSocket Events

### Connection

#### Client Connection

Connect to WebSocket server using Socket.IO client:

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  auth: {
    token: 'your-jwt-token', // Optional for authenticated connections
  },
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});
```

#### Authentication (Optional)

For authenticated WebSocket connections:

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  },
});
```

---

### Server-to-Client Events

#### agent:update

Agent status update.

**Event Data**:
```javascript
{
  agentId: 'coder-001',
  status: 'active',
  confidence: 0.85,
  tasks: [
    { id: 'task-1', status: 'completed', progress: 100 },
    { id: 'task-2', status: 'in-progress', progress: 45 }
  ],
  health: {
    cpu: 45.2,
    memory: 512,
    uptime: 3600000
  },
  timestamp: '2025-10-12T10:30:00.000Z'
}
```

**Client Subscription**:
```javascript
socket.on('agent:update', (data) => {
  console.log('Agent updated:', data.agentId, data.status);
});
```

**Throttling**: Maximum 1 update per second per agent

---

#### agent:spawned

New agent spawned.

**Event Data**:
```javascript
{
  agentId: 'coder-003',
  name: 'Implementation Agent 3',
  type: 'coder',
  parentId: 'coordinator-001',
  capabilities: ['coding', 'testing'],
  timestamp: '2025-10-12T10:30:00.000Z'
}
```

**Client Subscription**:
```javascript
socket.on('agent:spawned', (data) => {
  console.log('Agent spawned:', data.agentId, data.name);
});
```

---

#### agent:terminated

Agent terminated.

**Event Data**:
```javascript
{
  agentId: 'coder-002',
  reason: 'Task completed',
  finalStatus: 'completed',
  metrics: {
    tasksCompleted: 15,
    confidence: 0.92,
    totalUptime: 7200000
  },
  timestamp: '2025-10-12T10:30:00.000Z'
}
```

**Client Subscription**:
```javascript
socket.on('agent:terminated', (data) => {
  console.log('Agent terminated:', data.agentId, data.reason);
});
```

---

#### hierarchy:change

Agent hierarchy structure changed.

**Event Data**:
```javascript
{
  type: 'spawn', // or 'terminate', 'reparent'
  agentId: 'coder-003',
  parentId: 'coordinator-001',
  newParentId: null, // For reparent events
  metadata: {
    reason: 'New task assigned'
  },
  timestamp: '2025-10-12T10:30:00.000Z'
}
```

**Client Subscription**:
```javascript
socket.on('hierarchy:change', (data) => {
  console.log('Hierarchy changed:', data.type, data.agentId);
});
```

---

#### metrics:update

System-wide metrics update.

**Event Data**:
```javascript
{
  system: {
    cpu: 45.2,
    memory: 2048,
    disk: 50.5,
    network: {
      bytesIn: 1024000,
      bytesOut: 512000
    }
  },
  agents: {
    total: 25,
    active: 15,
    idle: 8,
    failed: 2
  },
  swarms: {
    total: 3,
    active: 2
  },
  timestamp: '2025-10-12T10:30:00.000Z'
}
```

**Client Subscription**:
```javascript
socket.on('metrics:update', (data) => {
  console.log('Metrics updated:', data.agents.active, 'active agents');
});
```

**Throttling**: Maximum 1 update per 5 seconds

---

#### event:stream

Real-time event stream.

**Event Data**:
```javascript
{
  id: 'evt-003',
  type: 'agent.completed',
  severity: 'info',
  message: 'Agent completed task successfully',
  agentId: 'coder-001',
  timestamp: '2025-10-12T10:30:00.000Z',
  metadata: {
    taskId: 'task-123',
    confidence: 0.92
  }
}
```

**Client Subscription**:
```javascript
socket.on('event:stream', (data) => {
  console.log('New event:', data.type, data.message);
});
```

---

#### error

Error notification.

**Event Data**:
```javascript
{
  severity: 'high', // 'low', 'medium', 'high', 'critical'
  message: 'Agent execution failed',
  agentId: 'coder-001',
  stack: 'Error: Task timeout\n  at ...',
  timestamp: '2025-10-12T10:30:00.000Z'
}
```

**Client Subscription**:
```javascript
socket.on('error', (data) => {
  console.error('Error:', data.severity, data.message);
});
```

---

#### notification

User notification.

**Event Data**:
```javascript
{
  type: 'warning', // 'info', 'warning', 'success', 'error'
  title: 'System Alert',
  message: 'CPU usage above 90%',
  action: {
    label: 'View Performance',
    url: '/performance'
  },
  timestamp: '2025-10-12T10:30:00.000Z'
}
```

**Client Subscription**:
```javascript
socket.on('notification', (data) => {
  console.log('Notification:', data.type, data.title);
});
```

---

### Client-to-Server Events

#### subscribe

Subscribe to specific agent or swarm updates.

**Client Emission**:
```javascript
socket.emit('subscribe', {
  type: 'agent', // or 'swarm', 'cfn-loop'
  id: 'coder-001'
}, (response) => {
  console.log('Subscribed:', response.success);
});
```

**Server Response**:
```javascript
{
  success: true,
  subscribed: 'agent:coder-001'
}
```

---

#### unsubscribe

Unsubscribe from specific updates.

**Client Emission**:
```javascript
socket.emit('unsubscribe', {
  type: 'agent',
  id: 'coder-001'
}, (response) => {
  console.log('Unsubscribed:', response.success);
});
```

**Server Response**:
```javascript
{
  success: true,
  unsubscribed: 'agent:coder-001'
}
```

---

#### ping

Ping server to check connection latency.

**Client Emission**:
```javascript
const startTime = Date.now();
socket.emit('ping', (response) => {
  const latency = Date.now() - startTime;
  console.log('Latency:', latency, 'ms');
});
```

**Server Response**:
```javascript
{
  timestamp: '2025-10-12T10:30:00.000Z'
}
```

---

## Error Handling

### REST API Errors

All REST API errors follow a consistent format:

```json
{
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent coder-001 not found",
    "statusCode": 404,
    "timestamp": "2025-10-12T10:30:00.000Z",
    "path": "/api/agents/coder-001/status"
  }
}
```

### HTTP Status Codes

- `200 OK`: Success
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service temporarily unavailable

### Error Codes

#### Authentication Errors
- `UNAUTHORIZED`: Missing or invalid authentication token
- `INVALID_TOKEN`: Token format invalid or missing required claims
- `TOKEN_EXPIRED`: Token has expired
- `TOKEN_REVOKED`: Token has been blacklisted
- `INVALID_REFRESH_TOKEN`: Refresh token invalid or expired
- `MISSING_REFRESH_TOKEN`: Refresh token not provided

#### Authorization Errors
- `FORBIDDEN`: Insufficient permissions
- `ADMIN_REQUIRED`: Admin role required

#### Resource Errors
- `AGENT_NOT_FOUND`: Agent does not exist
- `SWARM_NOT_FOUND`: Swarm does not exist
- `RESOURCE_NOT_FOUND`: Generic resource not found

#### Validation Errors
- `INVALID_PARAMETER`: Request parameter validation failed
- `MISSING_PARAMETER`: Required parameter not provided
- `INVALID_FORMAT`: Data format invalid

#### Rate Limiting Errors
- `RATE_LIMIT_EXCEEDED`: Too many requests

#### System Errors
- `INTERNAL_ERROR`: Unexpected server error
- `SERVICE_UNAVAILABLE`: Service temporarily unavailable
- `CONFIGURATION_ERROR`: Server misconfiguration

---

### WebSocket Errors

WebSocket errors are emitted as `error` events:

```javascript
socket.on('error', (error) => {
  console.error('WebSocket error:', error.code, error.message);
});
```

**Error Format**:
```javascript
{
  code: 'UNAUTHORIZED',
  message: 'Invalid authentication token',
  severity: 'high',
  timestamp: '2025-10-12T10:30:00.000Z'
}
```

---

## Rate Limiting

### Limits

- **Standard Endpoints**: 100 requests/minute per IP
- **Intervention Endpoint**: 10 requests/minute per IP
- **Auth Endpoints**: 10 requests/minute per IP

### Rate Limit Headers

Responses include rate limit information:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1633085400
```

### Rate Limit Exceeded Response

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 60

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 60 seconds.",
    "statusCode": 429,
    "retryAfter": 60
  }
}
```

---

## Response Formats

### Success Response

```json
{
  "data": { ... }
}
```

### Error Response

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "statusCode": 400,
    "timestamp": "2025-10-12T10:30:00.000Z",
    "path": "/api/endpoint"
  }
}
```

### Paginated Response

```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 127,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

## Code Examples

### JavaScript/TypeScript

#### REST API Request with Fetch

```javascript
async function getAgentStatus(agentId) {
  const response = await fetch(`http://localhost:3000/api/agents/${agentId}/status`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  const { data } = await response.json();
  return data;
}
```

---

#### REST API Request with Axios

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});

async function interventeAgent(agentId, action, reason) {
  try {
    const response = await api.post(`/agents/${agentId}/intervene`, {
      action,
      reason,
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.data.error);
    }
    throw error;
  }
}
```

---

#### WebSocket Connection

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  auth: {
    token: `Bearer ${accessToken}`,
  },
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);

  // Subscribe to agent updates
  socket.emit('subscribe', {
    type: 'agent',
    id: 'coder-001',
  }, (response) => {
    console.log('Subscribed:', response.success);
  });
});

socket.on('agent:update', (data) => {
  console.log('Agent update:', data);
});

socket.on('metrics:update', (data) => {
  console.log('Metrics update:', data);
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});
```

---

#### WebSocket with React Hook

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function useWebSocket(url, accessToken) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const newSocket = io(url, {
      auth: { token: `Bearer ${accessToken}` },
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [url, accessToken]);

  return { socket, isConnected };
}

// Usage in component
function Dashboard() {
  const { socket, isConnected } = useWebSocket('http://localhost:3000', accessToken);

  useEffect(() => {
    if (!socket) return;

    socket.on('metrics:update', (data) => {
      console.log('Metrics:', data);
    });

    return () => {
      socket.off('metrics:update');
    };
  }, [socket]);

  return (
    <div>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
    </div>
  );
}
```

---

### Python

#### REST API Request with requests

```python
import requests

def get_agent_status(agent_id, access_token):
    url = f'http://localhost:3000/api/agents/{agent_id}/status'
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
    }

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    return response.json()['data']

# Usage
try:
    status = get_agent_status('coder-001', 'your-access-token')
    print(f"Agent status: {status['status']}")
    print(f"Confidence: {status['confidence']}")
except requests.HTTPError as e:
    print(f"Error: {e.response.json()['error']['message']}")
```

---

#### WebSocket Connection with python-socketio

```python
import socketio

sio = socketio.Client()

@sio.event
def connect():
    print('Connected')
    sio.emit('subscribe', {
        'type': 'agent',
        'id': 'coder-001'
    })

@sio.on('agent:update')
def on_agent_update(data):
    print(f"Agent update: {data['agentId']} - {data['status']}")

@sio.on('metrics:update')
def on_metrics_update(data):
    print(f"Metrics: {data['agents']['active']} active agents")

@sio.event
def disconnect():
    print('Disconnected')

# Connect with authentication
sio.connect('http://localhost:3000',
            auth={'token': f'Bearer {access_token}'},
            transports=['websocket'])

# Keep connection alive
sio.wait()
```

---

### cURL

#### GET Request

```bash
curl -X GET http://localhost:3000/api/agents/coder-001/status \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

#### POST Request

```bash
curl -X POST http://localhost:3000/api/agents/coder-001/intervene \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "action": "pause",
    "reason": "Manual intervention for debugging"
  }'
```

#### Token Refresh

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

---

## Appendix

### Event Type Reference

#### Agent Events
- `agent.spawned`: New agent created
- `agent.started`: Agent started execution
- `agent.paused`: Agent paused
- `agent.resumed`: Agent resumed from pause
- `agent.completed`: Agent completed successfully
- `agent.failed`: Agent execution failed
- `agent.terminated`: Agent terminated
- `agent.error`: Agent encountered error

#### CFN Loop Events
- `cfn.loop.phase.start`: CFN Loop phase started
- `cfn.loop.phase.complete`: CFN Loop phase completed
- `cfn.loop.validation`: Validation event
- `cfn.loop.gate.pass`: Gate threshold passed
- `cfn.loop.gate.fail`: Gate threshold not met
- `cfn.loop.consensus`: Consensus reached
- `cfn.loop.decision`: Product Owner decision

#### System Events
- `system.startup`: System started
- `system.shutdown`: System shutting down
- `system.error`: System-level error
- `system.warning`: System-level warning

---

### Severity Levels

- **info**: Informational events, normal operations
- **warning**: Potential issues, monitor closely
- **error**: Errors occurred, investigate
- **critical**: Critical failures, immediate action required

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-12
**Maintained By**: Claude Flow Novice API Team
