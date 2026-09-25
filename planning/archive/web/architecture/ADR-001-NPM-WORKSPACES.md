# ADR-001: Use npm Workspaces for Monorepo Management

**Status**: Accepted
**Date**: 2025-10-11
**Deciders**: architect-1
**Epic**: epic-unified-web-portal
**Sprint**: 1.1

---

## Context

The Unified Web Portal consolidation requires merging 8 separate portal codebases (714MB, 209 files) into a single monorepo with 2 packages:
1. `web-portal` - Main React SPA + Express server
2. `web-components` - Shared component library

We need a monorepo tool that:
- Manages dependencies across multiple packages
- Supports hoisting to deduplicate shared dependencies
- Enables cross-package development workflows
- Integrates with existing npm ecosystem
- Requires minimal configuration overhead

**Alternatives Considered**:
1. npm workspaces (built into npm v7+)
2. pnpm workspaces
3. Lerna
4. Nx

---

## Decision

We will use **npm workspaces** for monorepo management.

---

## Rationale

### npm Workspaces Advantages

1. **Zero Additional Dependencies**
   - Built into npm 7+ (already using npm 10.8.2 in project)
   - No extra packages to install or maintain
   - Reduces security surface area
   - Faster installation (no extra tooling overhead)

2. **Dependency Hoisting**
   - Automatically hoists shared dependencies to root `node_modules/`
   - Single version of React (18.3.1) shared across packages
   - Single version of socket.io-client (4.8.1) shared across packages
   - Estimated 40% reduction in dependency size (714MB → ~420MB)

3. **Simple Configuration**
   ```json
   {
     "name": "claude-flow-novice-web",
     "workspaces": ["packages/*"]
   }
   ```
   - One-line configuration in root `package.json`
   - Auto-discovery of packages in `packages/` directory
   - No complex configuration files required

4. **Built-in Commands**
   ```bash
   npm install --workspaces          # Install deps for all packages
   npm run build --workspace=web-portal  # Run script in specific package
   npm run test --workspaces         # Run script in all packages
   npm ls --workspaces               # List all workspace dependencies
   ```
   - Native npm CLI support
   - No learning curve for developers familiar with npm
   - Works with existing CI/CD pipelines

5. **Cross-Package References**
   ```json
   // packages/web-portal/package.json
   {
     "dependencies": {
       "@web-components": "workspace:*"
     }
   }
   ```
   - Link local packages without `npm link` or symlinks
   - Hot reload during development
   - Type-safe imports with TypeScript project references

6. **Ecosystem Compatibility**
   - Works with all npm registry packages
   - Compatible with `package-lock.json` for reproducible builds
   - Supported by all major CI/CD platforms (GitHub Actions, GitLab CI, etc.)
   - No vendor lock-in

### Why Not pnpm?

**Pros of pnpm**:
- Faster installation (content-addressable store)
- Stricter dependency isolation (no phantom dependencies)
- Better disk space efficiency (hard links)

**Cons (Decision Factors)**:
- Requires installing pnpm globally (`npm install -g pnpm`)
- Extra dependency to manage and document
- Team may not be familiar with pnpm CLI
- Disk space savings not critical for this project (714MB → 300MB target already achievable)
- Stricter isolation can break some packages expecting hoisting

**Verdict**: Benefits don't justify added complexity for this project

### Why Not Lerna?

**Pros of Lerna**:
- Powerful versioning and publishing commands
- Conventional commits integration
- Independent versioning per package

**Cons (Decision Factors)**:
- Maintenance mode since 2022 (community fork Nx took over)
- Adds 50+ dependencies to project
- Primarily designed for publishing npm packages (we're building internal tooling)
- Versioning features unnecessary (single version for entire project)
- npm workspaces provides 90% of Lerna features with 0% overhead

**Verdict**: Overkill for internal monorepo

### Why Not Nx?

**Pros of Nx**:
- Advanced caching and task orchestration
- Dependency graph visualization
- Sophisticated build pipelines
- Supports multiple frameworks

**Cons (Decision Factors)**:
- Heavyweight (100+ dependencies)
- Steep learning curve (proprietary configuration format)
- Designed for large enterprises with 10+ packages
- Caching features overlap with Turbo (already using Turbo for builds)
- Migration cost not justified for 2-package monorepo

**Verdict**: Too complex for our needs

---

## Implementation Plan

### Phase 1: Root Workspace Setup
```bash
# Update root package.json
{
  "name": "claude-flow-novice-web",
  "version": "3.0.0",
  "private": true,
  "workspaces": ["packages/*"]
}

# Create workspace directories
mkdir -p packages/web-portal
mkdir -p packages/web-components
```

### Phase 2: Package Initialization
```bash
# Initialize packages
npm init -w packages/web-portal
npm init -w packages/web-components

# Set package names
# packages/web-portal/package.json: { "name": "@web-portal" }
# packages/web-components/package.json: { "name": "@web-components" }
```

### Phase 3: Dependency Migration
```bash
# Install shared dependencies at root
npm install react@^18.3.1 react-dom@^18.3.1 --workspace-root

# Install package-specific dependencies
npm install express@^4.21.1 --workspace=web-portal
npm install recharts@^2.14.1 --workspace=web-components

# Verify hoisting worked
npm ls react --all  # Should show single version
```

### Phase 4: Cross-Package Linking
```json
// packages/web-portal/package.json
{
  "dependencies": {
    "@web-components": "workspace:*"
  }
}
```

### Phase 5: Validation
```bash
# List all workspaces
npm ls --workspaces

# Check dependency tree
npm ls react socket.io-client --all

# Verify no duplicates
npm dedupe --dry-run

# Test builds
npm run build --workspaces
```

---

## Consequences

### Positive

1. **Simplified Dependency Management**
   - Single `node_modules/` at root reduces disk usage by ~40%
   - One `package-lock.json` ensures consistent dependency versions
   - Eliminates version conflicts between packages

2. **Improved Developer Experience**
   - Familiar npm CLI (no new commands to learn)
   - Hot reload works across packages
   - TypeScript types shared automatically

3. **Faster CI/CD**
   - Single `npm install` installs all dependencies
   - Cached `node_modules/` speeds up subsequent builds
   - No complex build orchestration setup

4. **Easier Maintenance**
   - Update shared dependencies once (e.g., React 18 → 19)
   - Security patches apply to all packages simultaneously
   - No tool-specific migrations when npm updates

### Negative

1. **Limited Task Orchestration**
   - No built-in task caching (mitigated by Turbo)
   - No dependency graph visualization (mitigated by `npm ls`)
   - No selective package testing (mitigated by `npm run test --workspace=X`)

2. **Hoisting Gotchas**
   - Some packages may break if they expect nested `node_modules/`
   - Phantom dependencies possible (importing non-declared deps)
   - Mitigation: Strict TypeScript config, linting, peer dependency declarations

3. **No Built-in Versioning**
   - Manual version bumps in `package.json`
   - Mitigation: Not needed (internal tooling, single version for entire project)

4. **Single Lock File**
   - All packages share one `package-lock.json`
   - Updating one package's deps affects entire workspace
   - Mitigation: Pin critical dependencies, use `npm audit` regularly

---

## Migration Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Dependency version conflicts | Medium | High | Use `npm ls --all` to audit before migration, resolve conflicts with `npm dedupe` |
| Breaking peer dependencies | Low | Medium | Explicitly declare all peer dependencies in package.json |
| Phantom dependencies | Low | Low | Enable TypeScript `strict` mode, use ESLint import rules |
| Hoisting breaks packages | Low | Medium | Test all packages after migration, use `installConfig.hoistingLimits` if needed |

---

## Alternatives Revisited

We will **not** use:
- **pnpm**: Requires global install, team unfamiliarity outweighs benefits
- **Lerna**: Maintenance mode, versioning features unnecessary
- **Nx**: Too heavyweight for 2-package monorepo, overlaps with Turbo

We **will** use complementary tools:
- **Turbo**: Build orchestration and caching (already planned)
- **TypeScript Project References**: Cross-package type checking
- **SWC**: Fast compilation (already planned)

---

## Validation Criteria

Success metrics for npm workspaces implementation:

1. **Dependency Deduplication**
   - Single version of React (`npm ls react --all` shows one version)
   - Single version of socket.io-client (`npm ls socket.io-client --all` shows one version)
   - No duplicate TypeScript compiler (`npm ls typescript --all` shows one version)

2. **Workspace Recognition**
   - `npm ls --workspaces` shows both packages
   - `npm run build --workspace=web-portal` executes successfully
   - `npm run test --workspaces` runs tests in all packages

3. **Cross-Package Linking**
   - `web-portal` can import from `@web-components` without errors
   - TypeScript resolves types from `web-components` correctly
   - Hot reload works when editing `web-components` code

4. **Build Performance**
   - `npm install --workspaces` completes in <2 minutes
   - No errors during `npm dedupe`
   - `npm audit` shows no critical vulnerabilities

5. **Size Reduction**
   - Total `node_modules/` size <500MB (down from ~1GB with duplicates)
   - Single `package-lock.json` file (not per-package locks)

---

## References

- npm Workspaces Documentation: https://docs.npmjs.com/cli/v10/using-npm/workspaces
- Implementation Plan: `/planning/web/sprint-1.1-implementation-plan.json` (lines 36-270)
- Epic Scope: `/planning/web/epic-scope-boundaries.json`

---

## Change Log

- **2025-10-11**: Initial ADR created by architect-1
- Decision: npm workspaces over pnpm, Lerna, Nx
- Rationale: Zero overhead, built-in npm feature, sufficient for 2-package monorepo
- Implementation plan defined with 5 phases
- Validation criteria established
