# @claude-flow-novice/web-components

Shared React component library for Claude Flow Novice web portal - extracted and unified from 8 separate portal implementations.

## Overview

This package provides a collection of reusable React components that were previously duplicated across 8 different portals. By consolidating these components into a single library, we achieve:

- **Code Reusability:** Single source of truth for all UI components
- **Consistency:** Unified design system across all portals
- **Maintainability:** One place to fix bugs and add features
- **Size Reduction:** Eliminate 4+ duplicate implementations

## Components

### Core Components (8 Unified Components)

1. **AgentHierarchyVisualization**
   - Consolidates 4 duplicate visualizations
   - Interactive agent tree visualization
   - Real-time status updates

2. **MetricsChart**
   - Real-time metrics with Recharts
   - Multiple chart types (line, bar, pie)
   - Customizable time ranges

3. **SwarmStatus**
   - Swarm state visualization
   - Agent coordination display
   - Health monitoring

4. **EventBusMonitor**
   - EventBus activity monitor
   - Event filtering and search
   - Real-time event stream

5. **TransparencyPanel**
   - Transparency system UI
   - Audit log viewer
   - Compliance reporting

6. **PerformanceGraph**
   - Performance metrics display
   - Multi-metric visualization
   - Historical trends

7. **LogViewer**
   - Log streaming component
   - Syntax highlighting
   - Filtering and search

8. **AuthenticationForm**
   - Login/auth UI
   - Form validation
   - Error handling

## Development

```bash
# Install dependencies
npm install

# Start Storybook (component development)
npm run dev

# Build component library
npm run build

# Build and watch for changes
npm run build:watch

# Run tests
npm test

# Type check
npm run type-check

# Lint
npm run lint
```

## Usage

### Installation

This package is part of the Claude Flow Novice monorepo and is consumed by `@claude-flow-novice/web-portal`.

```bash
npm install @claude-flow-novice/web-components
```

### Importing Components

```typescript
// Import specific components
import { AgentHierarchyVisualization } from '@claude-flow-novice/web-components';
import { MetricsChart } from '@claude-flow-novice/web-components/components/MetricsChart';

// Use in your React app
function App() {
  return (
    <div>
      <AgentHierarchyVisualization agents={agents} />
      <MetricsChart data={metrics} />
    </div>
  );
}
```

## Architecture

### Directory Structure

```
src/
├── components/      # 8 unified React components
│   ├── AgentHierarchyVisualization/
│   ├── MetricsChart/
│   ├── SwarmStatus/
│   ├── EventBusMonitor/
│   ├── TransparencyPanel/
│   ├── PerformanceGraph/
│   ├── LogViewer/
│   └── AuthenticationForm/
├── hooks/          # Shared React hooks
├── utils/          # Component utilities
├── types/          # TypeScript types and interfaces
└── styles/         # Component-specific styles
```

### Component Structure

Each component follows a consistent structure:

```
ComponentName/
├── index.tsx           # Main component export
├── ComponentName.tsx   # Component implementation
├── ComponentName.types.ts  # TypeScript types
├── ComponentName.styles.ts # Component styles
└── ComponentName.test.tsx  # Unit tests
```

## Dependencies

### Production
- React 18.3.1
- Material-UI 6.1.7
- Recharts 2.14.1
- date-fns 4.1.0

### Development
- TypeScript 5.6.3
- SWC (build tool)
- Vitest 2.1.5 (testing)
- Storybook 8.4.5 (component development)

## Peer Dependencies

This library requires React 18+ as a peer dependency:

```json
{
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  }
}
```

## Build Output

The library is compiled using SWC for fast builds:

```
dist/
├── index.js           # Main entry point
├── index.d.ts         # TypeScript declarations
├── components/        # Individual component exports
│   ├── AgentHierarchyVisualization.js
│   ├── AgentHierarchyVisualization.d.ts
│   └── ...
└── [other compiled files]
```

## Storybook

Component documentation and interactive examples are available in Storybook:

```bash
# Start Storybook development server
npm run dev

# Build Storybook static site
npm run build-storybook
```

Access at: http://localhost:6006

## Testing

Components are tested using Vitest and React Testing Library:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Migration Status

**Sprint 1.1:** Package structure created, dependencies consolidated
**Sprint 1.2:** Component extraction and migration (planned)
**Sprint 1.3:** Storybook setup and documentation (planned)

## Contributing

When adding new components:

1. Follow the established component structure
2. Include TypeScript types
3. Add unit tests
4. Create Storybook stories
5. Update this README

## License

MIT
