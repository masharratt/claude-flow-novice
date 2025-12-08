
## 2.18.4 - 2025-12-07

### Breaking Changes
- **TRIGGER.DEV MIGRATION COMPLETED**: Removed all Trigger.dev infrastructure and dependencies from CFN Loop
- Trigger.dev logic migrated to `lib/mdap/` for local orchestration
- Removed `docker/trigger-dev/` directory (302MB recovered)
- Removed `@trigger.dev/sdk` from package.json

### Features
- Added local MDAP orchestrator at `lib/mdap/orchestrator.ts`
- Migrated AI decomposers to `lib/mdap/decomposers/`
- Migrated error fixer from OurStories patterns to `lib/mdap/error-fixer.ts`
- CFN now uses local Promise.all() based orchestration

### Removed
- `docker/trigger-dev/` directory and all subdirectories
- `@trigger.dev/sdk` dependency
- RuVector codebase index skills (dependency on removed trigger-dev)
- Trigger.dev specific test suites

### Migration Summary
- **CFN**: Now uses local lib/mdap/ orchestration
- **Math**: Already using Promise.all() in MDAPEngine (no changes needed)  
- **SEO**: Will receive Trigger.dev v4 for long-running tasks

### Disk Space Recovered
- 302MB from docker/trigger-dev-v4/ removal
- ~3000 lines of code removed from CFN

