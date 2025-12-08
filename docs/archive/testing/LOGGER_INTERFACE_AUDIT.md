# Logger Interface Audit

**Date**: 2025-01-19
**Status**: Documentation of known issue from PR #21 review
**Priority**: Medium (maintainability concern, not blocking)

## Problem Statement

Multiple incompatible `Logger` and `ILogger` interfaces exist across CFN skills, leading to:
- Inability to share logger implementations between skills
- Confusion when importing logger types
- Potential type mismatches when refactoring

## Current State

### Interface Variations

**1. cfn-error-logging** (`.claude/skills/cfn-error-logging/src/types.ts:327`)
```typescript
export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
```
- Uses `meta?: Record<string, unknown>` for structured data
- Most comprehensive signature

**2. cfn-docker-redis-coordination** (`.claude/skills/cfn-docker-redis-coordination/src/types.ts:174`)
```typescript
export interface ILogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
```
- No optional parameter
- Simplest signature

**3. cfn-redis-coordination** (`.claude/skills/cfn-redis-coordination/src/types.ts:150`)
```typescript
export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: unknown): void;
}
```
- Uses `data?: unknown` for most methods
- Special `error?: unknown` for error method
- Different name: `Logger` vs `ILogger`

**4. cfn-skill-propagation** (`.claude/skills/cfn-skill-propagation/src/types.ts:137`)
```typescript
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```
- Uses rest parameters `...args: unknown[]`
- Most flexible signature

**5. workflow-codification** (`.claude/skills/workflow-codification/src/types.ts:111`)
```typescript
export interface ILogger {
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void;
}
```
- Completely different API (single `log` method with level parameter)
- Incompatible with all others

**6. cfn-loop-orchestration** (`.claude/skills/cfn-loop-orchestration/src/utils/logger.ts`)
```typescript
class Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: unknown): void;
}
```
- Concrete class, not interface
- Similar to cfn-redis-coordination signature

## Impact Assessment

### Current Impact
- **Low**: Each skill is isolated and uses its own logger
- Skills don't currently share logger implementations
- No cross-skill logger dependencies

### Future Impact (If Not Addressed)
- **Medium**: Will become problematic when:
  - Extracting logger to shared utilities
  - Creating cross-skill logging infrastructure
  - Implementing centralized logging backends
  - Refactoring skills to use common types

## Recommendations

### Short Term (Current State)
✅ **Document the inconsistency** (this file)
✅ **No immediate action required** - skills are isolated

### Long Term (Future Standardization)

**Option 1: Adopt Most Flexible Signature (Recommended)**
```typescript
// Shared location: src/common/types/logger.ts
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}
```

**Benefits:**
- Supports structured logging (JSON metadata)
- Type-safe metadata keys
- Special error handling in error method
- Backward compatible (meta is optional)

**Option 2: Console-Compatible Signature**
```typescript
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```

**Benefits:**
- Compatible with `console.*` methods
- Maximum flexibility
- Easy to implement adapters

**Option 3: Leveled Logger (workflow-codification style)**
- Not recommended - incompatible with most TypeScript logging libraries
- Breaks IDE autocomplete benefits

### Migration Strategy (When Needed)

1. **Create shared logger interface** in `src/common/types/logger.ts`
2. **Add compatibility adapters** for each existing interface
3. **Migrate skills incrementally** (non-breaking)
4. **Deprecate old interfaces** with warnings
5. **Remove deprecated interfaces** in major version bump

## Related Issues

- PR #21 Review Comment: "Logger interface duplication and inconsistency across modules"
- Future work: Centralized logging infrastructure
- Future work: Structured logging with metadata

## Decision

**Status**: Documented, no action required yet
**Rationale**: Skills are isolated; premature standardization adds complexity without benefit
**Review Date**: When implementing cross-skill utilities or shared logging infrastructure

---

**Last Updated**: 2025-01-19
**Reviewers**: N/A (documentation only)
