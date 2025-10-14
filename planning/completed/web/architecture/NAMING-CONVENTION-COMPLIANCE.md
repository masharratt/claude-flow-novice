# Naming Convention Compliance Specification

**Epic**: epic-unified-web-portal
**Sprint**: 1.1
**Task**: task-1.1.1
**Created**: 2025-10-11
**Architect**: architect-1

---

## Overview

This document validates that the monorepo structure specification complies with the naming conventions defined in the implementation plan (lines 199-218).

**Reference**: `/planning/web/sprint-1.1-implementation-plan.json`

---

## File Naming Conventions

### React Components: PascalCase

**Convention**: `PascalCase` (e.g., `AgentHierarchyVisualization.tsx`)

**Rationale**:
- React convention (components are PascalCase)
- Distinguishes components from utilities
- Matches component name in code (`export default AgentHierarchyVisualization`)

**Examples from Spec**:
```
✅ packages/web-components/src/components/AgentHierarchyVisualization/
   └── AgentHierarchyVisualization.tsx

✅ packages/web-components/src/components/MetricsChart/
   └── MetricsChart.tsx

✅ packages/web-portal/src/client/app/
   ├── App.tsx
   ├── AppProviders.tsx
   └── AppRouter.tsx

✅ packages/web-portal/src/client/views/
   ├── DashboardView.tsx
   ├── TransparencyView.tsx
   └── SwarmView.tsx

✅ packages/web-portal/src/client/layouts/
   ├── MainLayout.tsx
   ├── AuthLayout.tsx
   └── ErrorBoundary.tsx
```

**Anti-Patterns** (NOT in spec):
```
❌ agent-hierarchy-visualization.tsx (kebab-case)
❌ agentHierarchyVisualization.tsx (camelCase)
❌ agent_hierarchy_visualization.tsx (snake_case)
```

**Validation Command**:
```bash
# Find all .tsx files NOT starting with capital letter
find packages -name "*.tsx" ! -path "*/node_modules/*" ! -name "[A-Z]*.tsx"
# Expected output: (empty - all files comply)
```

---

### Utilities: camelCase

**Convention**: `camelCase` (e.g., `formatMetrics.ts`)

**Rationale**:
- JavaScript/TypeScript convention for functions
- Matches exported function names
- Clear distinction from components (PascalCase)

**Examples from Spec**:
```
✅ packages/web-portal/src/client/utils/
   ├── formatters.ts
   ├── validators.ts
   └── helpers.ts

✅ packages/web-portal/src/client/hooks/
   ├── useWebSocket.ts
   ├── useAuth.ts
   ├── useTheme.ts
   └── useStore.ts

✅ packages/web-components/src/hooks/
   ├── useDebounce.ts
   └── useLocalStorage.ts

✅ packages/web-components/src/utils/
   └── componentHelpers.ts

✅ packages/web-portal/src/shared/utils/
   └── logger.ts
```

**Anti-Patterns** (NOT in spec):
```
❌ format-metrics.ts (kebab-case)
❌ FormatMetrics.ts (PascalCase)
❌ format_metrics.ts (snake_case)
```

**Validation Command**:
```bash
# Find all .ts files in utils/ or hooks/ NOT in camelCase
find packages -path "*/utils/*.ts" -o -path "*/hooks/*.ts" | grep -v "^[a-z][a-zA-Z0-9]*\.ts$"
# Expected output: (empty - all files comply)
```

---

### Types/Interfaces: kebab-case

**Convention**: `kebab-case` (e.g., `agent-types.ts`)

**Rationale**:
- Avoids confusion with PascalCase components
- URL-friendly (lowercase, hyphens)
- Groups related types (e.g., `agent-types.ts`, `metrics-types.ts`)

**Examples from Spec**:
```
✅ packages/web-portal/src/shared/types/
   ├── agent.types.ts
   ├── metrics.types.ts
   ├── swarm.types.ts
   ├── event.types.ts
   └── api.types.ts

✅ packages/web-components/src/types/
   └── component.types.ts
```

**File Content Example**:
```typescript
// agent.types.ts (file name is kebab-case)
export interface AgentType {  // interface name is PascalCase
  id: string;
  name: string;
  status: AgentStatus;
}

export type AgentStatus = 'active' | 'idle' | 'terminated';
```

**Anti-Patterns** (NOT in spec):
```
❌ AgentTypes.ts (PascalCase - conflicts with component naming)
❌ agentTypes.ts (camelCase - inconsistent with other type files)
❌ agent_types.ts (snake_case - not URL-friendly)
```

**Validation Command**:
```bash
# Find all .types.ts files NOT in kebab-case
find packages -name "*.types.ts" ! -name "*-*.types.ts" ! -name "[a-z]*.types.ts"
# Expected output: (empty - all files comply)
```

---

### Test Files: ComponentName.test.tsx

**Convention**: `ComponentName.test.tsx` or `utility.test.ts`

**Rationale**:
- Jest/Vitest auto-discovery pattern
- Co-located with source files
- Matches component/utility naming

**Examples from Spec**:
```
✅ packages/web-components/src/components/AgentHierarchyVisualization/
   └── AgentHierarchyVisualization.test.tsx

✅ packages/web-components/src/components/MetricsChart/
   └── MetricsChart.test.tsx

✅ packages/web-portal/tests/unit/components/
   └── DashboardView.test.tsx

✅ packages/web-portal/tests/unit/utils/
   └── formatters.test.ts
```

**Anti-Patterns** (NOT in spec):
```
❌ AgentHierarchyVisualization.spec.tsx (use .test.tsx, not .spec.tsx)
❌ test-agent-hierarchy.tsx (test prefix, not suffix)
❌ __tests__/AgentHierarchy.tsx (separate directory, not co-located)
```

**Validation Command**:
```bash
# Find all test files NOT matching *.test.ts or *.test.tsx
find packages -name "*test*" ! -name "*.test.ts" ! -name "*.test.tsx"
# Expected output: (empty - all files comply)
```

---

### Story Files: ComponentName.stories.tsx

**Convention**: `ComponentName.stories.tsx`

**Rationale**:
- Storybook auto-discovery pattern
- Co-located with components
- Matches component naming

**Examples from Spec**:
```
✅ packages/web-components/src/components/AgentHierarchyVisualization/
   └── AgentHierarchyVisualization.stories.tsx

✅ packages/web-components/src/components/MetricsChart/
   └── MetricsChart.stories.tsx

✅ packages/web-components/src/components/SwarmStatus/
   └── SwarmStatus.stories.tsx
```

**Anti-Patterns** (NOT in spec):
```
❌ AgentHierarchyVisualization.story.tsx (singular "story")
❌ stories/AgentHierarchy.tsx (separate directory)
❌ agent-hierarchy.stories.tsx (kebab-case)
```

**Validation Command**:
```bash
# Find all story files NOT matching *.stories.tsx
find packages -name "*stor*" ! -name "*.stories.tsx"
# Expected output: (empty - all files comply)
```

---

### CSS Module Files: styles.module.css

**Convention**: `styles.module.css`

**Rationale**:
- CSS Modules naming pattern (`.module.css` suffix)
- Generic name (each component has one styles file)
- Scoped styles (CSS Modules prevent global conflicts)

**Examples from Spec**:
```
✅ packages/web-components/src/components/AgentHierarchyVisualization/
   └── styles.module.css

✅ packages/web-components/src/components/MetricsChart/
   └── styles.module.css

✅ packages/web-portal/src/client/styles/
   ├── global.css (global styles, not scoped)
   └── variables.css (CSS variables, not scoped)
```

**Usage Example**:
```typescript
// MetricsChart.tsx
import styles from './styles.module.css';

export default function MetricsChart() {
  return <div className={styles.container}>...</div>;
}
```

**Anti-Patterns** (NOT in spec):
```
❌ MetricsChart.module.css (component name, not generic)
❌ metrics-chart.module.css (kebab-case)
❌ style.module.css (singular "style")
```

**Validation Command**:
```bash
# Find all .module.css files NOT named styles.module.css
find packages -name "*.module.css" ! -name "styles.module.css"
# Expected output: (empty - all files comply)
```

---

### Config Files: lowercase with extension

**Convention**: `lowercase.extension` (e.g., `vite.config.ts`, `.swcrc`)

**Rationale**:
- Standard config file naming (lowercase)
- Tool-specific conventions (e.g., `.swcrc`, not `swc.config.json`)
- Easy to identify config files

**Examples from Spec**:
```
✅ packages/web-portal/
   ├── package.json
   ├── tsconfig.json
   ├── .swcrc
   └── vite.config.ts

✅ packages/web-components/
   ├── package.json
   ├── tsconfig.json
   └── .swcrc

✅ Root:
   ├── package.json
   ├── tsconfig.base.json
   └── turbo.json
```

**Anti-Patterns** (NOT in spec):
```
❌ Vite.config.ts (PascalCase)
❌ VITE.CONFIG.TS (uppercase)
❌ viteConfig.ts (camelCase, missing dot)
```

**Validation Command**:
```bash
# Find all config files with incorrect casing
find packages -maxdepth 2 -name "*config*" -name "[A-Z]*"
# Expected output: (empty - all files comply)
```

---

## Directory Naming Conventions

### All Directories: kebab-case

**Convention**: `kebab-case` (lowercase with hyphens)

**Rationale**:
- URL-friendly (lowercase, no spaces)
- Avoids case-sensitivity issues on different OS
- Standard convention for directories

**Examples from Spec**:
```
✅ packages/web-portal/src/
   ├── client/
   ├── server/
   ├── shared/
   └── integrations/

✅ packages/web-portal/src/client/
   ├── app/
   ├── views/
   ├── layouts/
   ├── hooks/
   ├── utils/
   ├── styles/
   └── assets/

✅ packages/web-portal/src/server/
   ├── api/
   ├── middleware/
   ├── services/
   ├── websocket/
   └── config/

✅ packages/web-portal/tests/
   ├── unit/
   ├── integration/
   └── e2e/
```

**Exception: Component Directories** (match component name):
```
✅ packages/web-components/src/components/
   ├── AgentHierarchyVisualization/ (PascalCase - matches component)
   ├── MetricsChart/ (PascalCase - matches component)
   └── SwarmStatus/ (PascalCase - matches component)
```

**Anti-Patterns** (NOT in spec):
```
❌ WebPortal/ (PascalCase for non-component directory)
❌ web_portal/ (snake_case)
❌ WebSocket/ (should be websocket/)
```

**Validation Command**:
```bash
# Find all directories (except components/) with PascalCase or snake_case
find packages -type d ! -path "*/components/*" ! -path "*/node_modules/*" -name "*[A-Z]*"
# Expected output: (empty except component dirs)
```

---

## Import Patterns

### Workspace Imports

**Convention**: `@web-portal/*` or `@web-components/*`

**Examples from Spec**:
```typescript
✅ // Import from web-components
import { AgentHierarchyVisualization } from '@web-components/components';
import { MetricsChart } from '@web-components/components/MetricsChart';

✅ // Import from web-portal shared
import { useWebSocket } from '@web-portal/client/hooks';
import type { AgentType } from '@web-portal/shared/types/agent.types';
```

**Anti-Patterns**:
```typescript
❌ // Relative import across packages
import { MetricsChart } from '../../web-components/src/components/MetricsChart';

❌ // Direct package name (should use path alias)
import { MetricsChart } from 'web-components/components/MetricsChart';
```

---

### Internal Relative Imports

**Convention**: Relative paths with explicit `.js` extension (ESM)

**Examples from Spec**:
```typescript
✅ // Internal imports with .js extension
import { formatMetrics } from './utils/formatters.js';
import type { AgentType } from '../shared/types/agent.types.js';

✅ // Type-only imports
import type { AgentStatus } from './types/agent.types.js';
```

**Rationale**:
- ESM standard (explicit file extensions)
- Node.js compatibility
- Future-proof (ESM is the future)

**Anti-Patterns**:
```typescript
❌ // No file extension (CommonJS style)
import { formatMetrics } from './utils/formatters';

❌ // .ts extension (should be .js in output)
import { formatMetrics } from './utils/formatters.ts';
```

---

### External Dependencies

**Convention**: No file extension

**Examples from Spec**:
```typescript
✅ // External dependencies (no extension)
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import express from 'express';
```

---

## Compliance Validation Checklist

### File Naming (Sprint 1.1)

- [x] All React component files use PascalCase (`.tsx`)
- [x] All utility files use camelCase (`.ts`)
- [x] All type files use kebab-case (`*.types.ts`)
- [x] All test files use `.test.tsx` suffix
- [x] All story files use `.stories.tsx` suffix
- [x] All CSS module files named `styles.module.css`
- [x] All config files use lowercase with extension

### Directory Naming (Sprint 1.1)

- [x] All standard directories use kebab-case
- [x] Component directories match component name (PascalCase)
- [x] No PascalCase directories outside `components/`
- [x] No snake_case directories

### Import Patterns (Sprint 1.1)

- [x] Workspace imports use path aliases (`@web-portal/*`, `@web-components/*`)
- [x] Internal imports use relative paths with `.js` extension
- [x] Type imports use `import type` syntax
- [x] External imports have no file extension

---

## Validation Commands

### Comprehensive Validation Script

```bash
#!/bin/bash
# naming-validation.sh - Validate naming conventions

echo "Validating file naming conventions..."

# Check for non-PascalCase component files
echo "✓ Component files (PascalCase):"
INVALID_COMPONENTS=$(find packages -name "*.tsx" ! -path "*/node_modules/*" ! -path "*test*" ! -path "*stories*" ! -name "[A-Z]*.tsx" | wc -l)
if [ "$INVALID_COMPONENTS" -eq 0 ]; then
  echo "  ✅ All component files comply"
else
  echo "  ❌ Found $INVALID_COMPONENTS non-PascalCase component files"
  find packages -name "*.tsx" ! -path "*/node_modules/*" ! -path "*test*" ! -path "*stories*" ! -name "[A-Z]*.tsx"
fi

# Check for non-camelCase utility files
echo "✓ Utility files (camelCase):"
INVALID_UTILS=$(find packages -path "*/utils/*.ts" -o -path "*/hooks/*.ts" | grep -v "\.test\.ts" | grep -v "^[a-z][a-zA-Z0-9]*\.ts$" | wc -l)
if [ "$INVALID_UTILS" -eq 0 ]; then
  echo "  ✅ All utility files comply"
else
  echo "  ❌ Found $INVALID_UTILS non-camelCase utility files"
fi

# Check for non-kebab-case type files
echo "✓ Type files (kebab-case):"
INVALID_TYPES=$(find packages -name "*.types.ts" ! -name "*-*.types.ts" ! -name "[a-z]*.types.ts" | wc -l)
if [ "$INVALID_TYPES" -eq 0 ]; then
  echo "  ✅ All type files comply"
else
  echo "  ❌ Found $INVALID_TYPES non-kebab-case type files"
fi

# Check for incorrect test file naming
echo "✓ Test files (*.test.tsx):"
INVALID_TESTS=$(find packages -name "*test*" ! -name "*.test.ts" ! -name "*.test.tsx" ! -path "*/node_modules/*" | wc -l)
if [ "$INVALID_TESTS" -eq 0 ]; then
  echo "  ✅ All test files comply"
else
  echo "  ❌ Found $INVALID_TESTS incorrectly named test files"
fi

# Check for incorrect CSS module naming
echo "✓ CSS module files (styles.module.css):"
INVALID_CSS=$(find packages -name "*.module.css" ! -name "styles.module.css" | wc -l)
if [ "$INVALID_CSS" -eq 0 ]; then
  echo "  ✅ All CSS module files comply"
else
  echo "  ❌ Found $INVALID_CSS incorrectly named CSS module files"
fi

# Check directory naming
echo "✓ Directory naming (kebab-case):"
INVALID_DIRS=$(find packages -type d ! -path "*/components/*" ! -path "*/node_modules/*" -name "*[A-Z]*" | wc -l)
if [ "$INVALID_DIRS" -eq 0 ]; then
  echo "  ✅ All directories comply"
else
  echo "  ❌ Found $INVALID_DIRS incorrectly named directories"
fi

echo ""
echo "Validation complete!"
```

**Usage**:
```bash
chmod +x naming-validation.sh
./naming-validation.sh
```

---

## Migration Checklist

When migrating files from old portals to new structure:

### For Components
- [ ] Rename file to PascalCase if needed
- [ ] Create component directory with PascalCase name
- [ ] Add `.test.tsx` file with same PascalCase prefix
- [ ] Add `.stories.tsx` file with same PascalCase prefix
- [ ] Add `styles.module.css` file
- [ ] Add `index.ts` barrel export

### For Utilities
- [ ] Rename file to camelCase if needed
- [ ] Move to `utils/` or `hooks/` directory
- [ ] Add `.test.ts` file with same camelCase prefix

### For Types
- [ ] Rename file to `kebab-case.types.ts` format
- [ ] Move to `shared/types/` directory
- [ ] Update all imports to use new path alias

### For Directories
- [ ] Rename to kebab-case if needed
- [ ] Update all import paths
- [ ] Update TypeScript path aliases if needed

---

## References

- Implementation Plan: `/planning/web/sprint-1.1-implementation-plan.json` (lines 199-218)
- Structure Spec: `/planning/web/architecture/MONOREPO-STRUCTURE-SPECIFICATION.md`

---

## Change Log

- **2025-10-11**: Initial compliance spec created by architect-1
- All naming conventions validated against implementation plan
- Comprehensive validation script provided
- Migration checklist created for Sprint 1.2
