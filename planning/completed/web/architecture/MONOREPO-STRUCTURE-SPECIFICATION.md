# Monorepo Structure Specification

**Epic**: epic-unified-web-portal
**Sprint**: 1.1
**Task**: task-1.1.1
**Created**: 2025-10-11
**Architect**: architect-1

---

## Executive Summary

This specification defines the complete directory structure for the Unified Web Portal consolidation. The design consolidates 8 duplicate web portals (714MB, 209 files) into a modular monorepo with 2 packages (300MB target, 80 files), achieving 58% size reduction and 62% file reduction.

**Key Constraints**:
- IN SCOPE: npm workspaces, 8 shared components, 5 merged WebSocket implementations, 3 unified Express servers
- OUT OF SCOPE: Mobile apps, 3D visualization, Kubernetes, multi-tenancy, i18n

---

## Directory Structure

### Root Workspace Layout

```
claude-flow-novice/
├── packages/                        # npm workspaces root (all portal code)
│   ├── web-portal/                  # Main unified SPA + server (package 1)
│   └── web-components/              # Shared component library (package 2)
├── package.json                     # Root workspace config
├── tsconfig.base.json               # Shared TypeScript config
└── turbo.json                       # Monorepo build orchestration
```

**Rationale**: Flat workspace structure with `packages/` prefix follows npm workspaces best practices, enables easy discovery, and simplifies CI/CD pipelines.

---

### Package 1: web-portal

**Path**: `packages/web-portal/`
**Purpose**: Consolidates 8 portals into single React 18 SPA with Express backend
**Size Target**: ~250MB (from 714MB total)

#### Complete Directory Tree

```
packages/web-portal/
├── src/                             # All source code (TypeScript only)
│   ├── client/                      # Frontend React application
│   │   ├── app/                     # Root components
│   │   │   ├── App.tsx              # Main app component
│   │   │   ├── AppProviders.tsx     # Context providers wrapper
│   │   │   └── AppRouter.tsx        # React Router setup
│   │   ├── views/                   # 9 main view components
│   │   │   ├── DashboardView.tsx    # Main dashboard (default route)
│   │   │   ├── TransparencyView.tsx # Transparency system UI
│   │   │   ├── SwarmView.tsx        # Swarm coordination monitor
│   │   │   ├── EventBusView.tsx     # EventBus activity viewer
│   │   │   ├── AnalyticsView.tsx    # Analytics and metrics
│   │   │   ├── SettingsView.tsx     # Configuration settings
│   │   │   ├── AgentHierarchyView.tsx # Agent hierarchy visualization
│   │   │   ├── PerformanceView.tsx  # Performance metrics
│   │   │   └── LogsView.tsx         # Log streaming viewer
│   │   ├── layouts/                 # Layout components
│   │   │   ├── MainLayout.tsx       # Primary layout with sidebar
│   │   │   ├── AuthLayout.tsx       # Authentication layout
│   │   │   └── ErrorBoundary.tsx    # Error boundary wrapper
│   │   ├── hooks/                   # Custom React hooks
│   │   │   ├── useWebSocket.ts      # WebSocket connection hook
│   │   │   ├── useAuth.ts           # Authentication hook
│   │   │   ├── useTheme.ts          # Theme management hook
│   │   │   └── useStore.ts          # Zustand store hooks
│   │   ├── utils/                   # Client utilities
│   │   │   ├── formatters.ts        # Data formatting functions
│   │   │   ├── validators.ts        # Client-side validation
│   │   │   └── helpers.ts           # General helper functions
│   │   ├── styles/                  # Global styles
│   │   │   ├── theme.ts             # MUI theme configuration
│   │   │   ├── global.css           # Global CSS styles
│   │   │   └── variables.css        # CSS variables
│   │   └── assets/                  # Static assets
│   │       ├── images/              # Image files
│   │       ├── icons/               # Icon files
│   │       └── fonts/               # Custom fonts
│   ├── server/                      # Express backend (consolidates 3 servers)
│   │   ├── index.ts                 # Server entry point (port 3000)
│   │   ├── app.ts                   # Express app configuration
│   │   ├── api/                     # REST API endpoints
│   │   │   ├── routes/              # API route handlers
│   │   │   │   ├── agents.ts        # GET/POST /api/agents
│   │   │   │   ├── metrics.ts       # GET /api/metrics
│   │   │   │   ├── swarms.ts        # GET/POST /api/swarms
│   │   │   │   ├── events.ts        # GET /api/events
│   │   │   │   ├── transparency.ts  # GET /api/transparency
│   │   │   │   ├── auth.ts          # POST /api/auth/login, /logout
│   │   │   │   └── config.ts        # GET/PUT /api/config
│   │   │   └── index.ts             # Route aggregator
│   │   ├── middleware/              # Express middleware
│   │   │   ├── auth.middleware.ts   # JWT authentication
│   │   │   ├── validation.middleware.ts # Request validation
│   │   │   ├── error.middleware.ts  # Error handling
│   │   │   └── rateLimit.middleware.ts # Rate limiting
│   │   ├── services/                # Business logic services
│   │   │   ├── TransparencyService.ts # Transparency system integration
│   │   │   ├── SwarmService.ts      # Swarm coordination logic
│   │   │   ├── EventBusService.ts   # EventBus integration
│   │   │   └── MetricsService.ts    # Metrics aggregation
│   │   ├── websocket/               # Socket.IO server (merges 5 implementations)
│   │   │   ├── socketServer.ts      # Socket.IO initialization
│   │   │   ├── handlers/            # Socket event handlers
│   │   │   │   ├── agentEvents.ts   # Agent lifecycle events
│   │   │   │   ├── metricsEvents.ts # Metrics updates
│   │   │   │   ├── swarmEvents.ts   # Swarm coordination events
│   │   │   │   ├── transparencyEvents.ts # Transparency events
│   │   │   │   └── systemEvents.ts  # System events
│   │   │   └── index.ts             # Event handler aggregator
│   │   └── config/                  # Server configuration
│   │       ├── database.ts          # Database config (if needed)
│   │       ├── redis.ts             # Redis client config
│   │       └── environment.ts       # Environment variable parsing
│   ├── shared/                      # Shared code (client + server)
│   │   ├── types/                   # TypeScript interfaces
│   │   │   ├── agent.types.ts       # Agent-related types
│   │   │   ├── metrics.types.ts     # Metrics types
│   │   │   ├── swarm.types.ts       # Swarm types
│   │   │   ├── event.types.ts       # Event types
│   │   │   └── api.types.ts         # API request/response types
│   │   ├── constants/               # Shared constants
│   │   │   ├── apiEndpoints.ts      # API endpoint paths
│   │   │   ├── eventTypes.ts        # Socket.IO event names
│   │   │   └── config.ts            # Configuration constants
│   │   ├── validators/              # Validation schemas (Zod)
│   │   │   ├── agent.schema.ts      # Agent validation schemas
│   │   │   ├── metrics.schema.ts    # Metrics validation
│   │   │   └── config.schema.ts     # Config validation
│   │   └── utils/                   # Shared utilities
│   │       ├── logger.ts            # Logging utility
│   │       └── errors.ts            # Error definitions
│   └── integrations/                # Integration layer (core systems)
│       ├── transparency/             # Transparency system integration
│       │   ├── TransparencyClient.ts # Transparency API client
│       │   └── index.ts             # Public exports
│       ├── swarm/                   # Swarm coordination integration
│       │   ├── SwarmClient.ts       # Swarm API client
│       │   └── index.ts             # Public exports
│       ├── eventbus/                # EventBus integration
│       │   ├── EventBusClient.ts    # EventBus API client
│       │   └── index.ts             # Public exports
│       └── redis/                   # Redis client utilities
│           ├── RedisClient.ts       # Redis wrapper
│           └── index.ts             # Public exports
├── public/                          # Static files (Vite serves)
│   ├── index.html                   # SPA entry point
│   ├── favicon.ico                  # Site icon
│   ├── manifest.json                # PWA manifest
│   └── robots.txt                   # SEO robots file
├── config/                          # Build and tooling config
│   ├── vite.config.ts               # Vite bundler config
│   ├── jest.config.js               # Jest test config (if used)
│   └── .env.example                 # Environment variable template
├── tests/                           # Test files
│   ├── unit/                        # Unit tests (Vitest)
│   │   ├── components/              # Component tests
│   │   ├── services/                # Service tests
│   │   └── utils/                   # Utility tests
│   ├── integration/                 # Integration tests
│   │   ├── api/                     # API endpoint tests
│   │   └── websocket/               # WebSocket tests
│   └── e2e/                         # End-to-end tests (Playwright)
│       ├── dashboard.spec.ts        # Dashboard flow tests
│       └── auth.spec.ts             # Authentication flow tests
├── package.json                     # Package configuration
├── tsconfig.json                    # TypeScript config (extends base)
├── .swcrc                           # SWC compiler config
└── README.md                        # Package documentation
```

**Key Design Decisions**:
1. **`src/client/`, `src/server/`, `src/shared/`**: Clear separation of frontend, backend, and shared code prevents accidental imports and enables tree-shaking
2. **`src/integrations/`**: Isolates external system dependencies for easier testing and mocking
3. **`views/` not `pages/`**: Consistent with React terminology (pages imply routing, views are presentational)
4. **Flat `tests/` at root**: Mirrors `src/` structure for easy discovery, keeps source code clean

---

### Package 2: web-components

**Path**: `packages/web-components/`
**Purpose**: Shared React component library (extracted from 8 portals)
**Size Target**: ~50MB (deduplicated components)

#### Complete Directory Tree

```
packages/web-components/
├── src/                             # Component library source
│   ├── components/                  # 8 unified components
│   │   ├── AgentHierarchyVisualization/ # Component directory
│   │   │   ├── AgentHierarchyVisualization.tsx # Main component
│   │   │   ├── AgentHierarchyVisualization.test.tsx # Component tests
│   │   │   ├── AgentHierarchyVisualization.stories.tsx # Storybook stories
│   │   │   ├── AgentNode.tsx        # Sub-component
│   │   │   ├── useAgentHierarchy.ts # Component-specific hook
│   │   │   ├── styles.module.css    # Component styles (CSS modules)
│   │   │   └── index.ts             # Public exports
│   │   ├── MetricsChart/            # Real-time metrics chart (Recharts)
│   │   │   ├── MetricsChart.tsx
│   │   │   ├── MetricsChart.test.tsx
│   │   │   ├── MetricsChart.stories.tsx
│   │   │   ├── ChartTooltip.tsx     # Custom tooltip
│   │   │   ├── styles.module.css
│   │   │   └── index.ts
│   │   ├── SwarmStatus/             # Swarm state visualization
│   │   │   ├── SwarmStatus.tsx
│   │   │   ├── SwarmStatus.test.tsx
│   │   │   ├── SwarmStatus.stories.tsx
│   │   │   ├── SwarmBadge.tsx       # Status badge sub-component
│   │   │   ├── styles.module.css
│   │   │   └── index.ts
│   │   ├── EventBusMonitor/         # EventBus activity monitor
│   │   │   ├── EventBusMonitor.tsx
│   │   │   ├── EventBusMonitor.test.tsx
│   │   │   ├── EventBusMonitor.stories.tsx
│   │   │   ├── EventList.tsx        # Event list sub-component
│   │   │   ├── styles.module.css
│   │   │   └── index.ts
│   │   ├── TransparencyPanel/       # Transparency system UI
│   │   │   ├── TransparencyPanel.tsx
│   │   │   ├── TransparencyPanel.test.tsx
│   │   │   ├── TransparencyPanel.stories.tsx
│   │   │   ├── AuditLogViewer.tsx   # Audit log sub-component
│   │   │   ├── styles.module.css
│   │   │   └── index.ts
│   │   ├── PerformanceGraph/        # Performance metrics display
│   │   │   ├── PerformanceGraph.tsx
│   │   │   ├── PerformanceGraph.test.tsx
│   │   │   ├── PerformanceGraph.stories.tsx
│   │   │   ├── styles.module.css
│   │   │   └── index.ts
│   │   ├── LogViewer/               # Log streaming component
│   │   │   ├── LogViewer.tsx
│   │   │   ├── LogViewer.test.tsx
│   │   │   ├── LogViewer.stories.tsx
│   │   │   ├── LogEntry.tsx         # Single log entry component
│   │   │   ├── styles.module.css
│   │   │   └── index.ts
│   │   └── AuthenticationForm/      # Login/auth UI
│   │       ├── AuthenticationForm.tsx
│   │       ├── AuthenticationForm.test.tsx
│   │       ├── AuthenticationForm.stories.tsx
│   │       ├── LoginForm.tsx        # Login sub-form
│   │       ├── styles.module.css
│   │       └── index.ts
│   ├── hooks/                       # Shared React hooks
│   │   ├── useDebounce.ts           # Debounce hook
│   │   ├── useLocalStorage.ts       # LocalStorage hook
│   │   └── index.ts                 # Public exports
│   ├── utils/                       # Component utilities
│   │   ├── componentHelpers.ts      # Helper functions
│   │   └── index.ts                 # Public exports
│   ├── types/                       # Component prop types
│   │   ├── component.types.ts       # Shared component types
│   │   └── index.ts                 # Public exports
│   └── index.ts                     # Library entry point (barrel exports)
├── dist/                            # Compiled output (generated)
│   ├── index.js                     # Compiled library
│   ├── index.d.ts                   # Type definitions
│   └── index.js.map                 # Source maps
├── .storybook/                      # Storybook configuration
│   ├── main.js                      # Storybook config
│   └── preview.js                   # Global decorators
├── package.json                     # Package configuration
├── tsconfig.json                    # TypeScript config (extends base)
├── .swcrc                           # SWC compiler config
└── README.md                        # Component library docs
```

**Key Design Decisions**:
1. **Component directories (not files)**: Each component is a directory with `.tsx`, `.test.tsx`, `.stories.tsx`, and `index.ts` for clear organization
2. **CSS Modules**: Scoped styles prevent conflicts when components are used in multiple contexts
3. **Barrel exports (`index.ts`)**: Clean public API for each component and the library as a whole
4. **Storybook integration**: Every component has stories for documentation and isolated development

---

## Naming Conventions

### Files

| Type | Convention | Example |
|------|------------|---------|
| React Components | PascalCase | `AgentHierarchyVisualization.tsx` |
| Utilities | camelCase | `formatMetrics.ts` |
| Types/Interfaces | kebab-case | `agent-types.ts` |
| Tests | ComponentName.test.tsx | `AgentHierarchyVisualization.test.tsx` |
| Stories | ComponentName.stories.tsx | `MetricsChart.stories.tsx` |
| CSS Modules | styles.module.css | `styles.module.css` |
| Config files | lowercase with extension | `vite.config.ts`, `.swcrc` |

### Directories

| Type | Convention | Example |
|------|------------|---------|
| All directories | kebab-case | `agent-hierarchy`, `metrics-chart` |
| Component directories | PascalCase (matches component) | `AgentHierarchyVisualization/`, `MetricsChart/` |
| Standard directories | lowercase | `src/`, `tests/`, `config/` |

**Rationale**:
- **PascalCase components**: React convention, distinguishes components from utilities
- **kebab-case types**: Avoids import confusion with PascalCase components
- **Flat test suffix**: Jest/Vitest auto-discovery patterns
- **CSS Modules**: Scoped styles with `.module.css` extension

### Import Patterns

```typescript
// Workspace imports (via package.json "name" field)
import { AgentHierarchyVisualization } from '@web-components/components';
import { useWebSocket } from '@web-portal/client/hooks';

// Internal relative imports (explicit .js for ESM compatibility)
import { formatMetrics } from './utils/formatters.js';
import type { AgentType } from '../shared/types/agent.types.js';

// External dependencies (no extension)
import React from 'react';
import { useQuery } from '@tanstack/react-query';
```

**Rationale**:
- **`@web-components/*` and `@web-portal/*`**: TypeScript path aliases prevent brittle relative imports
- **Explicit `.js` extension**: ESM standard, ensures Node.js compatibility
- **Type imports**: `import type` for tree-shaking and faster type checking

---

## Migration Validation Checklist

### Structure Creation (Sprint 1.1)

- [ ] `packages/` directory exists
- [ ] `packages/web-portal/` structure matches spec exactly
- [ ] `packages/web-components/` structure matches spec exactly
- [ ] All subdirectories created with proper casing
- [ ] `.gitkeep` files in empty directories (preserve structure in git)
- [ ] No source files migrated yet (empty `src/` directories)
- [ ] `package.json` files exist in root and both packages
- [ ] `README.md` files exist with placeholder content

### Naming Convention Compliance

- [ ] All component files use PascalCase
- [ ] All utility files use camelCase
- [ ] All type files use kebab-case
- [ ] All directories use kebab-case (except component dirs)
- [ ] Test files follow `ComponentName.test.tsx` pattern
- [ ] Story files follow `ComponentName.stories.tsx` pattern
- [ ] CSS module files named `styles.module.css`

### Build Pipeline Setup (Sprint 1.1)

- [ ] `tsconfig.base.json` created at root
- [ ] `packages/web-portal/tsconfig.json` extends base config
- [ ] `packages/web-components/tsconfig.json` extends base config
- [ ] TypeScript project references configured
- [ ] Path aliases configured (`@web-portal/*`, `@web-components/*`)
- [ ] SWC configs created (`.swcrc` in each package)
- [ ] Vite config created for `web-portal`
- [ ] Turbo config created at root (`turbo.json`)

### Validation Commands

```bash
# Verify directory structure
tree packages/ -L 3

# Verify npm workspaces recognized
npm ls --workspaces

# Check package.json files exist
test -f package.json && echo "Root package.json exists"
test -f packages/web-portal/package.json && echo "web-portal package.json exists"
test -f packages/web-components/package.json && echo "web-components package.json exists"

# Verify TypeScript configs
tsc --showConfig --project packages/web-portal/tsconfig.json
tsc --showConfig --project packages/web-components/tsconfig.json

# Check naming conventions (should return 0 errors)
# Component files should be PascalCase
find packages/web-components/src/components -name "*.tsx" -not -name "[A-Z]*.tsx" | wc -l
# Type files should be kebab-case
find packages -name "*types.ts" -not -name "*-*" | wc -l
```

---

## Size Reduction Targets

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Total Size | 714MB | 300MB | 58% |
| File Count | 209 files | 80 files | 62% |
| Portal Codebases | 8 portals | 1 portal | 88% |
| Component Duplication | 4x duplicates | 1x shared | 75% |
| WebSocket Implementations | 5 implementations | 1 unified | 80% |
| Express Servers | 3 servers | 1 server | 67% |

**Validation**:
```bash
# Measure current portal size
du -sh src/web/frontend src/dashboard src/ui monitor/dashboard .claude-flow/dashboard
# After migration: measure new size
du -sh packages/
# Calculate reduction percentage
echo "scale=2; (714 - $(du -sm packages/ | awk '{print $1}')) / 714 * 100" | bc
```

---

## Next Steps

After structure validation (Sprint 1.1 completion):

1. **Sprint 1.2**: Migrate 8 components from old portals to `packages/web-components/`
2. **Sprint 1.3**: Setup Zustand stores and unified WebSocket client in `packages/web-portal/`
3. **Sprint 2.1**: Migrate Express servers to `packages/web-portal/src/server/`
4. **Sprint 2.2**: Implement 7 REST API endpoints and authentication middleware
5. **Sprint 3.x**: Migrate React views and integrate components
6. **Sprint 4.x**: Cleanup old portals, achieve 80%+ test coverage, deployment configs

---

## References

- Implementation Plan: `/planning/web/sprint-1.1-implementation-plan.json`
- Epic Scope: `/planning/web/epic-scope-boundaries.json`
- Migration Guide: `/planning/web/MIGRATION-GUIDE.md`
- Phase 1 Guide: `/planning/web/PHASE-1-CONSOLIDATED-GUIDE.md`

---

## Change Log

- **2025-10-11**: Initial specification created by architect-1
- Structure validated against 8 portal consolidation requirements
- Naming conventions aligned with TypeScript/React best practices
- Size reduction targets defined with validation commands
