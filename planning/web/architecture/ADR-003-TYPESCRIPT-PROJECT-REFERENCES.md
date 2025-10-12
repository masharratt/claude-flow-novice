# ADR-003: TypeScript Project References Strategy

**Status**: Accepted
**Date**: 2025-10-11
**Deciders**: architect-1
**Epic**: epic-unified-web-portal
**Sprint**: 1.1
**Depends On**: ADR-001 (npm workspaces), ADR-002 (build pipeline)

---

## Context

The Unified Web Portal monorepo has 2 packages with TypeScript dependencies:
- `web-portal` depends on `web-components`
- Both packages share common types from `shared/types/`
- Cross-package imports must preserve type safety
- Build pipeline must compile packages in dependency order

**Challenges**:
1. **Type Resolution**: How does `web-portal` resolve types from `web-components`?
2. **Build Coordination**: How to ensure `web-components` builds before `web-portal`?
3. **IDE Performance**: How to prevent slow type checking across packages?
4. **Incremental Compilation**: How to avoid recompiling unchanged packages?

**Current State**:
- 8 portals have separate `tsconfig.json` files
- No cross-portal type sharing
- Each portal uses different TypeScript versions (v4.9.5, v5.3.3, v5.9.3)

---

## Decision

We will use **TypeScript Project References** with:
1. **Base configuration** (`tsconfig.base.json`) with shared compiler options
2. **Composite projects** for each package (enables project references)
3. **Path aliases** for clean cross-package imports
4. **Incremental compilation** to skip unchanged packages

---

## Rationale

### TypeScript Project References

**What Are Project References?**
- Feature in TypeScript 3.0+ for structuring large codebases
- Breaks monorepo into smaller projects with explicit dependencies
- Enables incremental compilation (only rebuild changed projects)
- Improves IDE performance (language server processes fewer files)

**Key Concepts**:
1. **Composite Projects**: `"composite": true` in `tsconfig.json`
   - Generates `.d.ts` declaration files
   - Enables project to be referenced by others
   - Enforces strict project boundaries

2. **References**: `"references": [{ "path": "../other-package" }]`
   - Declares dependency on another project
   - TypeScript ensures referenced project builds first
   - IDE resolves types from referenced project's `.d.ts` files

3. **Incremental Compilation**: `"incremental": true`
   - Caches build metadata in `.tsbuildinfo` file
   - Only recompiles changed files
   - Speeds up subsequent builds by 5-10x

### Base Configuration Strategy

**Why `tsconfig.base.json`?**
- DRY principle (Don't Repeat Yourself)
- Single source of truth for compiler options
- Easy to update all packages (change base, all inherit)
- Prevents configuration drift

**Base Config Contents**:
```json
{
  "compilerOptions": {
    // Language and Module Settings
    "target": "ES2022",                  // Modern JavaScript (Node.js 18+, Chrome 94+)
    "module": "ESNext",                  // ESM modules
    "moduleResolution": "Bundler",       // Vite/Rollup module resolution
    "lib": ["ES2022", "DOM", "DOM.Iterable"],

    // React Settings
    "jsx": "react-jsx",                  // New JSX transform (no React import needed)

    // Type Checking (Strict Mode)
    "strict": true,                      // Enable ALL strict checks
    "noUnusedLocals": true,              // Error on unused variables
    "noUnusedParameters": true,          // Error on unused function params
    "noImplicitReturns": true,           // Error if function doesn't return in all paths
    "noFallthroughCasesInSwitch": true,  // Error on switch fallthrough

    // Module Resolution
    "esModuleInterop": true,             // Allow default imports from CommonJS
    "allowSyntheticDefaultImports": true, // Allow `import React from 'react'`
    "resolveJsonModule": true,           // Import JSON files
    "forceConsistentCasingInFileNames": true,

    // Compilation
    "skipLibCheck": true,                // Skip type checking .d.ts files (faster)
    "isolatedModules": true,             // Ensure each file can be transpiled independently

    // Output
    "declaration": true,                 // Generate .d.ts files
    "declarationMap": true,              // Generate .d.ts.map for go-to-definition
    "sourceMap": true,                   // Generate .js.map for debugging

    // Path Aliases
    "baseUrl": ".",
    "paths": {
      "@web-portal/*": ["packages/web-portal/src/*"],
      "@web-components/*": ["packages/web-components/src/*"]
    }
  },
  "exclude": [
    "node_modules",
    "dist",
    "build",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx"
  ]
}
```

**Key Decisions**:
- **`target: ES2022`**: Modern syntax (async/await, optional chaining, top-level await)
- **`module: ESNext`**: Pure ESM modules (no CommonJS)
- **`moduleResolution: Bundler`**: Optimized for Vite/Rollup (allows extensionless imports)
- **`strict: true`**: Maximum type safety (catches bugs at compile time)
- **`skipLibCheck: true`**: Performance optimization (don't type-check dependencies)

### Package-Specific Configurations

**web-components** (`packages/web-components/tsconfig.json`):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,                   // Enable project references
    "outDir": "./dist",                  // Output directory
    "rootDir": "./src",                  // Source directory
    "declaration": true,                 // Generate .d.ts files
    "emitDeclarationOnly": false         // Also emit .js files (SWC handles this)
  },
  "include": ["src/**/*"]
}
```

**web-portal** (`packages/web-portal/tsconfig.json`):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,                   // Enable project references
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node", "vite/client"]     // Include Node.js and Vite types
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../web-components" }      // Declare dependency on web-components
  ]
}
```

**Key Features**:
1. **Composite Projects**: Both packages have `"composite": true`
2. **Cross-Package Reference**: `web-portal` references `web-components`
3. **Type Inference**: TypeScript resolves types from `web-components/dist/*.d.ts`

### Path Aliases

**Why Path Aliases?**
- Prevent brittle relative imports (`../../../components`)
- Enable clean imports (`@web-components/MetricsChart`)
- Easy refactoring (move files without updating imports)

**Alias Configuration**:
```json
{
  "baseUrl": ".",
  "paths": {
    "@web-portal/*": ["packages/web-portal/src/*"],
    "@web-components/*": ["packages/web-components/src/*"]
  }
}
```

**Usage Examples**:
```typescript
// BEFORE (brittle relative imports)
import { MetricsChart } from '../../../web-components/src/components/MetricsChart';
import { AgentType } from '../../shared/types/agent.types';

// AFTER (clean path aliases)
import { MetricsChart } from '@web-components/components/MetricsChart';
import { AgentType } from '@web-portal/shared/types/agent.types';
```

**Runtime Resolution**:
- **TypeScript**: Uses `paths` for type checking
- **Vite**: Uses `resolve.alias` in `vite.config.ts`
- **SWC**: No alias support (uses relative imports in output)
- **Node.js**: Requires path mapping plugin (not needed, SWC outputs relative paths)

**Vite Alias Config** (`vite.config.ts`):
```typescript
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@components': path.resolve(__dirname, '../web-components/src')
    }
  }
});
```

---

## Build Workflow

### Development Mode

**Type Checking** (continuous):
```bash
# Watch mode for type errors
npm run type-check -- --watch
# Runs: tsc --noEmit --watch (no compilation, only type checking)
```

**Compilation** (on-demand):
```bash
# Vite handles frontend compilation (no tsc needed)
npm run dev:client  # Vite dev server

# SWC handles backend compilation
npm run dev:server  # tsx watch src/server/index.ts
```

**What Happens**:
1. TypeScript watches files for type errors
2. Vite uses SWC to compile React components (no tsc)
3. tsx (powered by esbuild) compiles server code
4. No `.d.ts` files generated (not needed in dev mode)

### Production Build

**Build Command**:
```bash
npm run build  # Runs turbo run build
```

**Turbo Pipeline**:
```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],           // Build dependencies first
      "outputs": ["dist/**"]
    }
  }
}
```

**Build Order** (enforced by Turbo + TypeScript project references):
1. **Type Check All Packages**
   ```bash
   tsc --noEmit --project packages/web-components/tsconfig.json
   tsc --noEmit --project packages/web-portal/tsconfig.json
   ```

2. **Build web-components** (no dependencies)
   ```bash
   # Compile library
   swc src -d dist --config-file .swcrc

   # Generate type definitions
   tsc --emitDeclarationOnly --project tsconfig.json
   # Output: dist/index.d.ts, dist/components/*.d.ts
   ```

3. **Build web-portal** (depends on web-components)
   ```bash
   # Build frontend (Vite bundles React SPA)
   vite build
   # Output: dist/client/index.html, dist/client/assets/*.js

   # Build backend (SWC compiles Express server)
   swc src/server -d dist/server --config-file .swcrc
   # Output: dist/server/index.js, dist/server/api/*.js
   ```

**Incremental Compilation**:
- First build: TypeScript processes all files (~10 seconds)
- Subsequent builds: TypeScript only processes changed files (~2 seconds)
- `.tsbuildinfo` files cache metadata for incremental builds

---

## IDE Integration

### VS Code Configuration

**`.vscode/settings.json`**:
```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "editor.codeActionsOnSave": {
    "source.organizeImports": true
  }
}
```

**Benefits**:
1. **Workspace TypeScript**: Uses project's TypeScript version (not VS Code's)
2. **Non-Relative Imports**: Auto-imports use path aliases (`@web-components/...`)
3. **Organize Imports**: Auto-sorts imports on save

### IntelliSense Performance

**Project References Optimization**:
- VS Code processes each package separately
- Type errors only recomputed for changed packages
- Go-to-definition works across packages (via `.d.ts.map`)

**Performance Metrics**:
- Initial project load: ~5 seconds
- Type checking after edit: <1 second (incremental)
- Auto-complete latency: <100ms

---

## Consequences

### Positive

1. **Type Safety Across Packages**
   - `web-portal` imports from `web-components` with full type checking
   - TypeScript catches breaking changes in dependencies
   - Refactoring tools work across packages

2. **Faster Builds**
   - Incremental compilation: 5-10x faster (2s vs 10s)
   - Parallel type checking: Turbo runs `tsc --noEmit` in parallel
   - Cached `.tsbuildinfo` files skip unchanged packages

3. **Better IDE Performance**
   - Language server processes fewer files per package
   - Type errors scoped to changed packages
   - Faster auto-complete and go-to-definition

4. **Clean Imports**
   - Path aliases: `@web-components/MetricsChart` (not `../../../components`)
   - Consistent import style across codebase
   - Easy refactoring (change alias, update all imports)

5. **Enforced Build Order**
   - TypeScript ensures `web-components` builds before `web-portal`
   - Prevents runtime errors from missing dependencies
   - Turbo respects dependency order

### Negative

1. **Configuration Complexity**
   - 3 `tsconfig.json` files (base + 2 packages)
   - Path aliases must be duplicated in Vite config
   - Learning curve for project references

2. **Build Artifacts**
   - `.tsbuildinfo` files in each package (generated, gitignored)
   - `.d.ts` files in `dist/` (required for project references)
   - Larger `dist/` folders (source maps + declarations)

3. **SWC Limitations**
   - SWC doesn't use TypeScript project references
   - Must run `tsc --emitDeclarationOnly` separately for `.d.ts` files
   - Two compilation steps (SWC for .js, tsc for .d.ts)

4. **Path Alias Runtime**
   - SWC outputs relative imports (not aliases)
   - Node.js requires path mapping plugin (if using aliases at runtime)
   - Mitigation: Use relative imports in compiled output

---

## Alternatives Considered

### Why NOT These Strategies?

1. **Single tsconfig.json for Entire Monorepo**
   - **Pros**: Simple configuration
   - **Cons**: Slow type checking (processes all files), no incremental builds, IDE slowdown
   - **Verdict**: Doesn't scale for monorepo

2. **Separate tsconfig.json Without Project References**
   - **Pros**: Simple per-package config
   - **Cons**: No cross-package type checking, manual build ordering, duplicate types
   - **Verdict**: Loses type safety benefits

3. **Path Mapping Plugin (tsconfig-paths)**
   - **Pros**: Runtime path alias resolution
   - **Cons**: Extra dependency, runtime overhead, SWC outputs relative paths anyway
   - **Verdict**: Unnecessary (Vite/SWC handle aliases at build time)

4. **Symlinks (npm link)**
   - **Pros**: No TypeScript configuration needed
   - **Cons**: Brittle (breaks on reinstall), no type checking, npm workspaces is better
   - **Verdict**: Deprecated approach

---

## Migration Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Path alias resolution issues | Medium | Medium | Test imports extensively, add Vite alias config |
| Slow IDE performance | Low | Medium | Use `skipLibCheck: true`, exclude test files |
| Incremental compilation cache corruption | Low | Low | Gitignore `.tsbuildinfo`, clean rebuild if issues |
| Cross-package type errors | Medium | High | Enforce `composite: true`, run `tsc --noEmit` in CI |

---

## Validation Criteria

Success metrics for TypeScript project references:

1. **Type Safety**
   - `web-portal` can import from `@web-components/*` with type checking
   - `tsc --noEmit` passes with 0 errors
   - VS Code shows type errors in real-time

2. **Build Performance**
   - Initial build: <15 seconds (type checking + compilation)
   - Incremental build: <5 seconds (with `.tsbuildinfo` cache)
   - Parallel type checking: <10 seconds (Turbo)

3. **IDE Performance**
   - Project load: <10 seconds
   - Type checking after edit: <2 seconds
   - Auto-complete latency: <200ms

4. **Correctness**
   - Go-to-definition works across packages
   - Refactoring (rename symbol) updates all packages
   - Declaration files (`.d.ts`) generated for `web-components`

5. **Developer Experience**
   - Path aliases work in imports
   - No relative import confusion (`../../../`)
   - Organized imports on save

---

## Validation Commands

```bash
# Type check all packages
npm run type-check
# Should complete with 0 errors

# Test cross-package import
# Create test file: packages/web-portal/src/test.ts
echo "import { MetricsChart } from '@web-components/components/MetricsChart';" > packages/web-portal/src/test.ts
tsc --noEmit --project packages/web-portal/tsconfig.json
# Should resolve types without errors

# Build with project references
npm run build --workspace=web-components
# Check: packages/web-components/dist/index.d.ts exists

npm run build --workspace=web-portal
# Should succeed (depends on web-components)

# Test incremental compilation
touch packages/web-components/src/components/MetricsChart/MetricsChart.tsx
npm run build --workspace=web-components
# Should complete in <5 seconds (incremental)

# Verify path aliases in Vite
npm run dev:client --workspace=web-portal
# Check browser console: imports should resolve correctly
```

---

## References

- TypeScript Project References: https://www.typescriptlang.org/docs/handbook/project-references.html
- TypeScript Compiler Options: https://www.typescriptlang.org/tsconfig
- Vite Path Aliases: https://vitejs.dev/config/shared-options.html#resolve-alias
- Implementation Plan: `/planning/web/sprint-1.1-implementation-plan.json` (lines 618-708)

---

## Change Log

- **2025-10-11**: Initial ADR created by architect-1
- Decision: TypeScript project references with base config and path aliases
- Rationale: Type safety, incremental builds, clean imports, IDE performance
- Configuration: `tsconfig.base.json` + 2 package configs with composite projects
- Validation: Cross-package type checking, incremental compilation, path alias resolution
