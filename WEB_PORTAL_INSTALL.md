# Web Portal Installation Guide

The **Unified Web Portal** is an optional monitoring and visualization interface for Claude Flow Novice. It provides real-time insights into agent coordination, swarm performance, and CFN Loop execution.

## Prerequisites

- Node.js ≥20.0.0
- npm ≥9.0.0
- Claude Flow Novice installed (`npm install -g claude-flow-novice`)

## Installation

The web portal is **not installed by default**. Install it separately:

```bash
npm run portal:install
```

This will:
1. Install all web portal dependencies
2. Build the React frontend application
3. Set up the visualization components

## Running the Portal

### Development Mode

Start the development server with hot reload:

```bash
npm run portal:dev
```

The portal will be available at: **http://localhost:3002**

### Production Build

Build optimized production bundle:

```bash
npm run portal:build
```

The production build will be in `packages/web-portal/dist/`

## Features

The Unified Web Portal consolidates 8 legacy monitoring tools into one interface:

### 1. **Dashboard** (`/`)
- System health overview
- Active agents count
- Swarm status
- Real-time performance metrics

### 2. **Agents View** (`/agents`)
- List/grid view of all agents
- Search and filter by type, status
- Spawn new agents
- Terminate agents with confirmation

### 3. **Hierarchy View** (`/hierarchy`)
- Tree visualization of swarm structure
- Expand/collapse nodes
- Agent relationships
- Export JSON/CSV

### 4. **Performance View** (`/performance`)
- CPU usage chart (dual Y-axis)
- Memory usage chart (area fill)
- Active agents chart (stacked bar)
- Real-time metrics updates

### 5. **Events View** (`/events`)
- Event timeline with virtual scrolling (10K+ events)
- Full-text search on event data, agent ID, type
- Category filters (5 types: lifecycle, task, consensus, error, system)
- Severity filters (4 levels: info, warning, error, critical)
- Date range filtering
- Real-time WebSocket updates

### 6. **Fleet View** (`/fleet`)
- Fleet aggregation metrics (4 cards)
  - Total agents
  - Active swarms
  - Average confidence
  - Tasks completed
- Grid/list toggle for swarm display
- Virtual scrolling for large datasets
- Pie chart for agent distribution
- Real-time WebSocket updates

### 7. **CFN Loop View** (`/cfn-loop`)
- Phase timeline (horizontal, 4 phases with sprint indicators)
- Current loop status card (Loop 0-4, phase name, confidence, validators)
- Metrics cards (4 cards)
  - Gate threshold
  - Consensus threshold
  - Average Loop 3 confidence
  - Average Loop 2 consensus
- Progress bars for Loop 3 and Loop 2 with threshold indicators
- Real-time WebSocket updates

## Testing

### Unit Tests (121 tests)

Run unit tests with coverage:

```bash
npm run portal:test
```

Includes tests for:
- All 7 views
- Zustand stores
- Custom hooks (useWebSocket, useWebSocketEvent)
- Services (API client, WebSocket client)

### E2E Tests (32 tests - 21 passing)

Run Playwright end-to-end tests:

```bash
npm run portal:test:e2e
```

**Test Coverage:**
- ✅ CFN Loop View: 11/11 (100%)
- ✅ Events View: 10/10 (100%)
- ⚠️ Fleet View: 0/11 (requires Chart.js debugging in test env)

## Architecture

### Technology Stack

- **Frontend**: React 18.3.1, Material-UI v6, React Router v6
- **State Management**: Zustand 5.0.1 with Immer middleware
- **Real-time**: Socket.IO 4.8.1, WebSocket subscriptions
- **Charts**: Chart.js 4.4.7, react-chartjs-2 5.2.0
- **Virtual Scrolling**: react-window 1.8.10
- **Testing**: Vitest 2.1.5, Playwright 1.49.0
- **Build**: Vite 7.1.9, Turbo 2.5.8

### Project Structure

```
packages/web-portal/
├── src/
│   ├── client/              # Frontend React application
│   │   ├── views/          # 7 feature views
│   │   ├── components/     # Shared components
│   │   └── routes/         # React Router configuration
│   ├── shared/             # Shared utilities
│   │   ├── stores/         # Zustand state management
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API and WebSocket clients
│   │   └── types/          # TypeScript type definitions
│   └── __tests__/          # Test suites
│       ├── views/          # View unit tests (7 files)
│       ├── stores/         # Store tests
│       ├── hooks/          # Hook tests
│       ├── services/       # Service tests
│       └── e2e/            # Playwright E2E tests (3 files)
├── docs/                   # Documentation (139KB)
│   ├── USER_GUIDE.md       # User guide (41KB)
│   ├── API.md              # API documentation (26KB)
│   ├── DEPLOYMENT.md       # Deployment guide (21KB)
│   ├── ARCHITECTURE.md     # Architecture docs (28KB)
│   └── TROUBLESHOOTING.md  # Troubleshooting (23KB)
└── playwright.config.ts    # E2E test configuration
```

## Legacy Portal Migration

The following 8 legacy portals have been archived in `/archive/legacy-portals/`:

1. **dashboard/** (23 files) - Basic dashboard → New Dashboard view
2. **monitoring/** (17 files) - Monitoring UI → New Performance view
3. **consensus-monitoring/** (3 files) → New CFN Loop view
4. **feature-flags-monitoring/** (3 files) → New Dashboard view
5. **fleet-manager-monitoring/** (4 files) → New Fleet view
6. **gossip-monitoring/** (2 files) → New Events view
7. **sovereignty-monitoring/** (2 files) → New Agents view

All legacy URLs redirect to the new unified portal with appropriate notices.

## Configuration

### Environment Variables

Create `.env` file in `packages/web-portal/`:

```env
# Server
VITE_API_BASE_URL=http://localhost:3000/api
VITE_WS_URL=http://localhost:3000

# Feature Flags
VITE_ENABLE_WEBSOCKET=true
VITE_ENABLE_REAL_TIME_UPDATES=true

# Monitoring
VITE_ENABLE_PERFORMANCE_MONITORING=true
```

### Port Configuration

Default ports:
- **Development**: 3002 (Vite dev server)
- **Production**: 80 (Nginx)
- **WebSocket**: 3000 (Socket.IO server)

To change ports, update:
- `packages/web-portal/vite.config.ts` (dev server)
- `packages/web-portal/playwright.config.ts` (E2E tests)

## Deployment

### Docker Deployment

The portal includes Docker configuration:

```bash
# Build Docker image
cd packages/web-portal
docker build -t claude-flow-portal .

# Run container
docker run -p 80:80 claude-flow-portal
```

Access at: **http://localhost**

### CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/web-portal-deploy.yml`):

1. **Build and Test** - Run unit tests, build production bundle
2. **Security Scan** - npm audit, dependency scanning
3. **Build Docker Image** - Multi-stage build with caching
4. **Deploy to Staging** - Automatic staging deployment
5. **Deploy to Production** - Manual approval required
6. **Post-Deployment Verification** - Health checks, smoke tests

## Troubleshooting

### Port 3002 already in use

```bash
# Find process using port
lsof -ti:3002

# Kill process
kill -9 $(lsof -ti:3002)

# Or use different port
PORT=3003 npm run portal:dev
```

### WebSocket connection failures

Check that Socket.IO server is running on port 3000:

```bash
# Start WebSocket server
npm run dev:server
```

### Build failures

Clear cache and rebuild:

```bash
# Clean build artifacts
npm run clean:web

# Reinstall dependencies
cd packages/web-portal
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### E2E tests failing

Ensure dev server is running:

```bash
# Terminal 1: Start dev server
npm run portal:dev

# Terminal 2: Run E2E tests (after server starts)
npm run portal:test:e2e
```

## Documentation

Full documentation available in `packages/web-portal/docs/`:

- **[USER_GUIDE.md](packages/web-portal/docs/USER_GUIDE.md)** - Complete user guide for all 7 views
- **[API.md](packages/web-portal/docs/API.md)** - REST API and WebSocket documentation
- **[DEPLOYMENT.md](packages/web-portal/docs/DEPLOYMENT.md)** - Production deployment guide
- **[ARCHITECTURE.md](packages/web-portal/docs/ARCHITECTURE.md)** - System architecture and design
- **[TROUBLESHOOTING.md](packages/web-portal/docs/TROUBLESHOOTING.md)** - Common issues and solutions

## Support

For issues or questions:

1. Check [TROUBLESHOOTING.md](packages/web-portal/docs/TROUBLESHOOTING.md)
2. Search existing [GitHub Issues](https://github.com/masharratt/claude-flow-novice/issues)
3. Create new issue with bug report template

## License

MIT License - See [LICENSE](LICENSE) for details
