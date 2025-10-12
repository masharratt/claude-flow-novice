# @claude-flow-novice/web-portal

Unified web portal for Claude Flow Novice - consolidates 8 portals into a single React SPA with Express backend.

## Overview

This package provides a comprehensive web interface for monitoring and managing Claude Flow Novice agents, swarms, and system metrics.

### Consolidated Portals

This unified portal replaces the following 8 separate implementations:
- Transparency Portal (src/web/frontend) - 671MB
- Web Dashboard (src/web/dashboard)
- Fleet Dashboard (src/dashboard) - 204KB
- Console UI (src/ui/console)
- Web UI (src/ui/web-ui)
- Premium Monitoring Dashboard (monitor/dashboard) - 9.3MB
- Analytics Dashboard (.claude-flow/dashboard)
- Phase 4 Dashboard (referenced in planning)

### Architecture

#### Client (React SPA)
- **Port:** 3001
- **Build Tool:** Vite with SWC
- **Framework:** React 18.3.1 with TypeScript
- **UI Library:** Material-UI (MUI) 6.1.7
- **State Management:** Zustand 5.0.1
- **Routing:** React Router 6.28.0

#### Server (Express API)
- **Port:** 3000
- **Runtime:** Node.js 20+
- **Framework:** Express 4.21.1
- **WebSocket:** Socket.IO 4.8.1
- **Build Tool:** SWC for fast compilation

### Directory Structure

```
src/
├── client/          # React frontend application
│   ├── app/         # App component, providers, routing
│   ├── views/       # 9 main view components
│   ├── layouts/     # Layout components
│   ├── hooks/       # Custom React hooks
│   ├── utils/       # Client utilities
│   ├── styles/      # Global styles and themes
│   └── assets/      # Static assets
├── server/          # Express backend server
│   ├── api/         # REST API endpoints (7 routes)
│   ├── middleware/  # Express middleware
│   ├── services/    # Business logic services
│   ├── websocket/   # Socket.IO server
│   └── config/      # Server configuration
├── shared/          # Shared code (client + server)
│   ├── types/       # TypeScript interfaces
│   ├── constants/   # Shared constants
│   ├── validators/  # Validation schemas (Zod)
│   └── utils/       # Shared utilities
└── integrations/    # Core system integrations
    ├── transparency/
    ├── swarm/
    ├── eventbus/
    └── redis/
```

## Development

```bash
# Install dependencies
npm install

# Start development servers (client + server)
npm run dev

# Start client only (port 3001)
npm run dev:client

# Start server only (port 3000)
npm run dev:server

# Build for production
npm run build

# Run tests
npm test

# Run e2e tests
npm run test:e2e

# Type check
npm run type-check

# Lint
npm run lint
```

## Production

```bash
# Build
npm run build

# Start production server
npm start
```

## Key Features

### 9 Main Views
1. **Dashboard** - Overview and metrics
2. **Transparency** - System transparency and audit logs
3. **Swarm** - Swarm coordination and status
4. **EventBus** - Event bus monitoring
5. **Analytics** - Performance analytics
6. **Settings** - Configuration management
7. **Agent Hierarchy** - Agent organization visualization
8. **Performance** - Performance metrics and graphs
9. **Logs** - Real-time log streaming

### 7 API Routes
- `/api/agents` - Agent management
- `/api/metrics` - System metrics
- `/api/swarms` - Swarm coordination
- `/api/events` - Event bus integration
- `/api/transparency` - Transparency system
- `/api/auth` - Authentication
- `/api/config` - Configuration

### Real-time Features
- WebSocket connections via Socket.IO
- Live metrics updates
- Real-time log streaming
- Agent status monitoring

## Dependencies

### Production
- React 18.3.1 with TypeScript
- Material-UI 6.1.7 (unified UI components)
- Socket.IO 4.8.1 (WebSocket)
- Express 4.21.1 (server)
- Zustand 5.0.1 (state management)
- Recharts 2.14.1 (data visualization)

### Development
- Vite 6.0.3 (build tool)
- SWC (fast compilation)
- TypeScript 5.6.3
- Vitest 2.1.5 (testing)
- Playwright 1.49.0 (e2e testing)

## Migration Status

**Sprint 1.1:** Structure created, dependencies consolidated
**Sprint 1.2:** Component migration (planned)
**Sprint 1.3:** Integration and testing (planned)

## License

MIT
