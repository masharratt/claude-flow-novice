# Web Portal Architecture Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Component Structure](#component-structure)
4. [Data Flow](#data-flow)
5. [State Management](#state-management)
6. [WebSocket Architecture](#websocket-architecture)
7. [API Layer](#api-layer)
8. [Security Architecture](#security-architecture)
9. [Performance Optimizations](#performance-optimizations)
10. [Technology Stack](#technology-stack)

---

## System Overview

The Web Portal is a unified React Single Page Application (SPA) with an Express backend, designed to consolidate 8 previous portal implementations into a single, efficient interface.

### Key Characteristics

- **Architecture Pattern**: Client-Server with Real-time WebSocket
- **Frontend**: React 18.3.1 SPA with TypeScript
- **Backend**: Express 4.21.1 REST API with Socket.IO WebSocket server
- **State Management**: Zustand with localStorage persistence
- **Build Tool**: Vite with SWC for fast compilation
- **Deployment**: Standalone Node.js or Docker containers

### Design Principles

1. **Separation of Concerns**: Client, server, and shared code in distinct directories
2. **Real-time First**: WebSocket for live updates, REST for initial load
3. **Type Safety**: TypeScript throughout for compile-time error prevention
4. **Performance**: Lazy loading, virtual scrolling, debouncing, memoization
5. **Scalability**: Stateless architecture, horizontal scaling support
6. **Security**: JWT authentication, RBAC, input validation, rate limiting

---

## Architecture Diagram

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Browser                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              React SPA (Port 3001 dev)                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │Dashboard │  │  Agents  │  │  Fleet   │  │CFN Loop  │  │  │
│  │  │   View   │  │   View   │  │   View   │  │   View   │  │  │
│  │  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘  │  │
│  │        │              │              │              │       │  │
│  │  ┌─────┴──────────────┴──────────────┴──────────────┘     │  │
│  │  │           Zustand State Management                      │  │
│  │  │  (agentStore, eventsStore, cfnLoopStore)                │  │
│  │  └──────────────────────┬──────────────────────────────────┘  │
│  └─────────────────────────┼─────────────────────────────────────┘
└────────────────────────────┼──────────────────────────────────────┘
                             │
                    HTTP/WebSocket
                             │
┌────────────────────────────┼──────────────────────────────────────┐
│                 Express Server (Port 3000)                        │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                    Middleware Layer                          ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       ││
│  │  │   Auth   │ │   RBAC   │ │   Rate   │ │  Error   │       ││
│  │  │   JWT    │ │  Authn   │ │ Limiting │ │ Handling │       ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       ││
│  └──────────────────────────┬───────────────────────────────────┘│
│                             │                                     │
│  ┌──────────────────────────┴───────────────────────────────────┐│
│  │                      REST API Routes                          ││
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐││
│  │  │/agents │  │/metrics│  │/events │  │ /auth  │  │/health │││
│  │  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘││
│  └──────────────────────────┬───────────────────────────────────┘│
│                             │                                     │
│  ┌──────────────────────────┴───────────────────────────────────┐│
│  │              Socket.IO WebSocket Server                       ││
│  │  ┌──────────────────────────────────────────────────────────┐││
│  │  │ Events: agent:update, metrics:update, event:stream, etc. │││
│  │  │ Rooms: agent-*, swarm-*, cfn-loop-*                      │││
│  │  │ Throttling: Per-event rate limiting                      │││
│  │  └──────────────────────────────────────────────────────────┘││
│  └──────────────────────────┬───────────────────────────────────┘│
└─────────────────────────────┼──────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
        ┌───────────▼──────┐   ┌─────▼─────────┐
        │  Redis (Optional) │   │ Transparency  │
        │  WebSocket Scaling│   │    Service    │
        └──────────────────┘   └───────────────┘
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Interaction Flow                        │
└─────────────────────────────────────────────────────────────────┘

1. Initial Load (REST API)
   User → Dashboard View → API Fetch → GET /api/agents/hierarchy
                                     → GET /api/metrics
                                     → GET /api/events
   Server Response → Zustand Store → React Re-render → Display

2. Real-time Updates (WebSocket)
   Agent Status Change → Backend → Socket.IO Emit 'agent:update'
                                 → All Connected Clients
                                 → Zustand Store Update
                                 → React Re-render → Display

3. User Action (REST API + WebSocket)
   User → Click "Terminate Agent" → POST /api/agents/:id/intervene
                                  → Server Validates → JWT Auth → RBAC
                                  → Transparency Service
                                  → Agent Terminated
                                  → Socket.IO Emit 'agent:terminated'
                                  → All Clients Updated
```

---

## Component Structure

### Directory Structure

```
packages/web-portal/
├── src/
│   ├── client/              # React frontend
│   │   ├── app/             # App component, providers, routing
│   │   │   ├── App.tsx      # Root component
│   │   │   ├── Router.tsx   # React Router configuration
│   │   │   └── providers/   # Context providers
│   │   ├── views/           # 7 main view components
│   │   │   ├── Dashboard/
│   │   │   ├── Agents/
│   │   │   ├── Hierarchy/
│   │   │   ├── Performance/
│   │   │   ├── Events/
│   │   │   ├── Fleet/
│   │   │   └── CFNLoop/
│   │   ├── components/      # Reusable UI components
│   │   │   ├── common/      # Button, Input, Modal, etc.
│   │   │   └── containers/  # Data-connected components
│   │   ├── layouts/         # Layout components
│   │   │   └── MainLayout.tsx
│   │   ├── styles/          # Global styles and themes
│   │   └── assets/          # Static assets (images, fonts)
│   ├── server/              # Express backend
│   │   ├── routes/          # API route handlers
│   │   │   └── api/
│   │   │       ├── agents.ts
│   │   │       ├── metrics.ts
│   │   │       ├── events.ts
│   │   │       ├── resources.ts
│   │   │       ├── health.ts
│   │   │       ├── auth.ts
│   │   │       └── index.ts
│   │   ├── middleware/      # Express middleware
│   │   │   ├── authentication.ts
│   │   │   ├── rbac.ts
│   │   │   ├── rate-limiter.ts
│   │   │   ├── error-handler.ts
│   │   │   ├── validation.ts
│   │   │   └── security.ts
│   │   ├── services/        # Business logic services
│   │   │   ├── transparency-service.ts
│   │   │   └── token-blacklist.ts
│   │   ├── websocket/       # Socket.IO server
│   │   │   ├── SocketIOServer.ts
│   │   │   ├── types.ts
│   │   │   ├── index.ts
│   │   │   └── integrations/
│   │   │       ├── SwarmAdapter.ts
│   │   │       ├── MetricsAggregator.ts
│   │   │       └── TransparencyAdapter.ts
│   │   ├── schemas/         # Validation schemas (Zod)
│   │   │   └── validation.ts
│   │   └── config/          # Server configuration
│   │       └── swagger.ts
│   └── shared/              # Shared code (client + server)
│       ├── types/           # TypeScript interfaces
│       ├── stores/          # Zustand stores
│       │   ├── agentStore.ts
│       │   ├── eventsStore.ts
│       │   └── cfnLoopStore.ts
│       ├── hooks/           # Custom React hooks
│       │   ├── useWebSocket.ts
│       │   ├── useWebSocketEvent.ts
│       │   └── useDashboardWebSocket.ts
│       ├── constants/       # Shared constants
│       └── utils/           # Shared utilities
├── public/                  # Static public assets
├── dist/                    # Build output
│   ├── client/              # Built React app
│   └── server/              # Compiled Express server
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .swcrc
```

### Component Hierarchy (React)

```
App.tsx
└── Router.tsx
    └── MainLayout.tsx
        ├── Sidebar (navigation)
        └── Outlet (view container)
            ├── Dashboard.tsx
            │   ├── MetricCard
            │   ├── AgentHierarchyTreeContainer
            │   ├── StatusMonitorContainer
            │   ├── PerformanceChartsContainer
            │   ├── EventTimelineContainer
            │   └── AlertsPanelContainer
            ├── Agents.tsx
            │   ├── FiltersSidebar
            │   ├── AgentCard (grid view)
            │   └── AgentListItem (list view)
            ├── Hierarchy.tsx
            │   └── TreeView
            ├── Performance.tsx
            │   ├── CPUChart
            │   ├── MemoryChart
            │   └── AgentsChart
            ├── Events.tsx
            │   ├── FiltersSidebar
            │   └── EventTimelineItem (virtual list)
            ├── Fleet.tsx
            │   ├── SwarmCard (grid view)
            │   ├── SwarmListItem (list view)
            │   └── PieChart (agent distribution)
            └── CFNLoop.tsx
                ├── MetricsCards
                ├── ProgressBars
                ├── ValidatorResults
                └── PhaseTimeline
```

---

## Data Flow

### 1. Initial Page Load

```
User opens browser
  → React app loads (index.html)
  → App.tsx initializes
  → Zustand stores initialize (check localStorage)
  → Router navigates to Dashboard
  → Dashboard component mounts
  → useEffect hooks trigger
  → REST API calls (parallel):
      GET /api/agents/hierarchy
      GET /api/metrics
      GET /api/events
  → Responses received
  → Zustand stores updated
  → React re-renders with data
  → WebSocket connection established
  → Subscribe to real-time events
```

### 2. Real-time Update Flow

```
Backend Event Occurs (e.g., agent status change)
  → Transparency Service detects change
  → Socket.IO Server emits event:
      io.emit('agent:update', data)
  → All connected clients receive event
  → Client WebSocket handler:
      socket.on('agent:update', callback)
  → Zustand store action called:
      updateAgent(agentId, data)
  → Immer middleware applies update
  → localStorage persistence triggered
  → React components subscribed to store re-render
  → UI updates immediately
```

### 3. User Action Flow

```
User clicks "Terminate Agent" button
  → onClick handler triggered
  → Modal dialog opens for confirmation
  → User confirms termination
  → REST API call:
      POST /api/agents/:id/intervene
      Body: { action: 'terminate', reason: '...' }
      Headers: { Authorization: 'Bearer <token>' }
  → Server receives request
  → Authentication middleware validates JWT
  → RBAC middleware checks admin role
  → Rate limiter checks request count
  → Validation middleware validates body
  → Route handler processes request
  → Transparency Service terminates agent
  → Response sent to client:
      { success: true, message: '...' }
  → Client receives response
  → Success toast notification displayed
  → WebSocket event emitted to all clients:
      io.emit('agent:terminated', data)
  → All clients' stores updated
  → UI re-renders across all sessions
```

---

## State Management

### Zustand Store Architecture

The application uses Zustand for state management with three main stores:

#### 1. Agent Store (`agentStore.ts`)

```typescript
interface AgentStore {
  // State
  agents: Agent[];
  selectedAgent: Agent | null;
  loading: boolean;
  error: string | null;

  // Actions
  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  removeAgent: (id: string) => void;
  selectAgent: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}
```

**Features**:
- Immer middleware for immutable updates
- DevTools integration (development only)
- Persistence: localStorage with 1-hour TTL
- Selectors for filtered/sorted data

**Usage**:
```typescript
const { agents, updateAgent } = useAgentStore();

// Subscribe to specific slice
const activeAgents = useAgentStore(
  useCallback(
    (state) => state.agents.filter(a => a.status === 'active'),
    []
  )
);
```

#### 2. Events Store (`eventsStore.ts`)

```typescript
interface EventsStore {
  // State
  events: Event[];
  loading: boolean;
  error: string | null;

  // Actions
  setEvents: (events: Event[]) => void;
  addEvent: (event: Event) => void;
  clearEvents: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}
```

**Features**:
- No persistence (ephemeral event stream)
- Max 1000 events in memory (FIFO queue)
- Debounced updates to prevent flooding

#### 3. CFN Loop Store (`cfnLoopStore.ts`)

```typescript
interface CFNLoopStore {
  // State
  currentLoopNumber: number;
  currentPhaseName: string;
  validators: number;
  phases: CFNPhase[];
  metrics: CFNLoopMetrics;
  validatorResults: ValidatorResult[];
  loop3Progress: number;
  loop2Progress: number;
  loading: boolean;
  error: string | null;

  // Actions
  setCurrentLoop: (loopNumber: number, phaseName: string) => void;
  setPhases: (phases: CFNPhase[]) => void;
  updatePhaseCompletion: (phaseId: string, completed: boolean) => void;
  setMetrics: (metrics: Partial<CFNLoopMetrics>) => void;
  setValidatorResults: (results: ValidatorResult[]) => void;
  setLoop3Progress: (progress: number) => void;
  setLoop2Progress: (progress: number) => void;
}
```

**Features**:
- Persistent state with 1-hour TTL
- Phase tracking and progress monitoring
- Validator result aggregation

### Store Patterns

#### Update Pattern (Immer)

```typescript
updateAgent: (id, updates) => set((state) => {
  const agent = state.agents.find(a => a.id === id);
  if (agent) {
    Object.assign(agent, updates);  // Immer makes this immutable
  }
})
```

#### Persistence Pattern

```typescript
persist(
  (set, get) => ({ /* store definition */ }),
  {
    name: 'agent-store',
    version: 1,
    partialize: (state) => ({
      agents: state.agents,
      selectedAgent: state.selectedAgent,
    }),
    storage: {
      getItem: (name) => {
        const item = localStorage.getItem(name);
        if (!item) return null;
        const { state, timestamp } = JSON.parse(item);
        const TTL = 60 * 60 * 1000; // 1 hour
        if (Date.now() - timestamp > TTL) {
          localStorage.removeItem(name);
          return null;
        }
        return state;
      },
      setItem: (name, value) => {
        localStorage.setItem(name, JSON.stringify({
          state: value,
          timestamp: Date.now(),
        }));
      },
      removeItem: (name) => localStorage.removeItem(name),
    },
  }
)
```

---

## WebSocket Architecture

### Socket.IO Server

**Location**: `src/server/websocket/SocketIOServer.ts`

#### Initialization

```typescript
const io = new Server(httpServer, {
  path: '/socket.io',
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1048576, // 1MB
  transports: ['websocket', 'polling'],
});
```

#### Authentication

```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    socket.authenticated = false;
    socket.role = 'guest';
    return next();
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    socket.userId = decoded.userId;
    socket.role = decoded.role;
    socket.authenticated = true;
    next();
  } catch (error) {
    return next(new Error('Authentication failed'));
  }
});
```

#### Event Throttling

```typescript
const throttle = new Map<string, number>();

function throttleEmit(event: string, data: any, delay: number) {
  const lastEmit = throttle.get(event) || 0;
  const now = Date.now();

  if (now - lastEmit < delay) {
    return; // Skip emit
  }

  throttle.set(event, now);
  io.emit(event, data);
}

// Usage
throttleEmit('metrics:update', metricsData, 5000); // Max 1 per 5 seconds
```

#### Room Management

```typescript
// Subscribe to agent updates
socket.on('subscribe', ({ type, id }, callback) => {
  const room = `${type}:${id}`;
  socket.join(room);
  callback({ success: true, subscribed: room });
});

// Emit to specific room
io.to('agent:coder-001').emit('agent:update', data);

// Emit to all clients
io.emit('metrics:update', data);
```

### Client WebSocket Hook

**Location**: `src/shared/hooks/useWebSocket.ts`

```typescript
export function useWebSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const newSocket = io('http://localhost:3000', {
      auth: { token: `Bearer ${accessToken}` },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
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
  }, []);

  const subscribe = useCallback((event, callback) => {
    socket?.on(event, callback);
    return () => socket?.off(event, callback);
  }, [socket]);

  return { socket, isConnected, subscribe };
}
```

---

## API Layer

### REST API Structure

#### Middleware Stack

```
Incoming Request
  → Security Middleware (Helmet, CORS)
  → Rate Limiter
  → Body Parser
  → Authentication (JWT)
  → RBAC (Role-Based Access Control)
  → Validation (Zod schemas)
  → Route Handler
  → Error Handler
  → Response
```

#### Route Organization

```typescript
// src/server/routes/api/index.ts
router.use('/auth', authRouter);
router.use('/agents', agentsRouter);
router.use('/metrics', metricsRouter);
router.use('/events', eventsRouter);
router.use('/resources', resourcesRouter);
router.use('/health', healthRouter);
```

#### Error Handling

```typescript
// Centralized error handler
app.use((err, req, res, next) => {
  if (err instanceof APIError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    });
  } else {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        statusCode: 500,
      },
    });
  }
});
```

---

## Security Architecture

### Authentication Flow

```
1. User Login (External Auth System)
   → Receives JWT access token (15 min expiry)
   → Receives refresh token (7 day expiry)

2. API Request
   → Client includes: Authorization: Bearer <access_token>
   → Server validates JWT signature
   → Server checks token not blacklisted
   → Server extracts userId, role from token
   → Request proceeds

3. Token Refresh
   → Client detects access token expiring
   → POST /api/auth/refresh with refresh token
   → Server validates refresh token
   → Server blacklists old refresh token
   → Server issues new access + refresh tokens
   → Client stores new tokens

4. Logout
   → POST /api/auth/logout with access token
   → Server adds token to blacklist
   → Token rejected on future requests
```

### Role-Based Access Control (RBAC)

```typescript
// Roles
type Role = 'guest' | 'user' | 'admin' | 'api';

// Permissions
const permissions = {
  guest: ['read:agents', 'read:metrics', 'read:events'],
  user: ['read:*', 'write:agents'],
  admin: ['read:*', 'write:*', 'delete:*'],
  api: ['read:*', 'write:*'],
};

// Middleware
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Admin role required' },
    });
  }
  next();
}
```

### Input Validation (Zod)

```typescript
// Schema definition
const InterventionRequestSchema = z.object({
  action: z.enum(['pause', 'resume', 'terminate', 'restart']),
  reason: z.string().min(1).max(500),
});

// Middleware
function validate({ body, query, params }) {
  return (req, res, next) => {
    try {
      if (body) req.body = body.parse(req.body);
      if (query) req.query = query.parse(req.query);
      if (params) req.params = params.parse(req.params);
      next();
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'INVALID_PARAMETER',
          message: error.errors,
        },
      });
    }
  };
}
```

---

## Performance Optimizations

### Frontend Optimizations

1. **Lazy Loading**: Routes and components loaded on demand
2. **Virtual Scrolling**: react-window for large lists (events, agents)
3. **Memoization**: useMemo, useCallback, React.memo
4. **Debouncing**: User input (search, filters)
5. **Code Splitting**: Vite automatic chunking
6. **Tree Shaking**: Unused code eliminated

### Backend Optimizations

1. **Response Compression**: gzip for >1KB responses
2. **Caching**: API response caching (30s-60s)
3. **Connection Pooling**: Reuse HTTP/WebSocket connections
4. **Event Throttling**: Limit WebSocket event frequency
5. **Pagination**: Limit query result sizes

### Network Optimizations

1. **HTTP/2**: Multiplexing, server push
2. **CDN**: Static asset delivery (production)
3. **WebSocket**: Binary transport for efficiency
4. **Batching**: Group multiple updates

---

## Technology Stack

### Frontend

- **React**: 18.3.1
- **TypeScript**: 5.6.3
- **Material-UI**: 6.1.7
- **Zustand**: 5.0.1
- **React Router**: 6.28.0
- **Socket.IO Client**: 4.8.1
- **Recharts**: 2.14.1
- **React Window**: Virtual scrolling
- **Vite**: 7.1.9

### Backend

- **Node.js**: 20+
- **Express**: 4.21.1
- **Socket.IO**: 4.8.1
- **TypeScript**: 5.6.3
- **Helmet**: Security headers
- **JWT**: jsonwebtoken 9.0.2
- **Zod**: Validation
- **SWC**: Fast compilation

### Development

- **Vitest**: Testing
- **Playwright**: E2E testing
- **ESLint**: Linting
- **Prettier**: Formatting

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-12
**Maintained By**: Claude Flow Novice Architecture Team
