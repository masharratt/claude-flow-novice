# Database Migration Scripts

Command-line tools for managing database migrations with rollback support.

## Available Commands

### Apply Migrations

```bash
# Apply all pending migrations
npm run db:migrate

# Simulate migrations without applying (dry-run)
npm run db:migrate:dry-run

# Apply with verbose logging
npm run db:migrate -- --verbose
```

### Rollback Migrations

```bash
# Rollback last migration
npm run db:rollback -- --last=1 --reason="Bug fix"

# Rollback last 3 migrations
npm run db:rollback -- --last=3 --reason="Feature removal"

# Rollback to specific version
npm run db:rollback -- --to=005 --reason="Revert to stable"

# Rollback all migrations
npm run db:rollback -- --all --reason="Database reset"

# Simulate rollback without applying (dry-run)
npm run db:rollback:dry-run -- --last=1
```

### Query Migration Status

```bash
# List all migrations with status
npm run db:migrations:list

# Show only pending migrations
npm run db:migrations:list -- --pending

# Show only applied migrations
npm run db:migrations:list -- --applied
```

### Validate Migrations

```bash
# Validate all applied migrations (check checksums)
npm run db:migrations:validate
```

### View Rollback History

```bash
# Show all rollback history
npm run db:migrations:history

# Show last 10 rollbacks
npm run db:migrations:history -- --limit=10
```

## Script Details

### migrate.ts

Apply all pending database migrations in order.

**Usage:**
```bash
tsx scripts/migrations/migrate.ts [options]

Options:
  --dry-run    Simulate migrations without applying
  --verbose    Enable detailed logging
```

### rollback.ts

Rollback applied migrations.

**Usage:**
```bash
tsx scripts/migrations/rollback.ts [options]

Options:
  --last=N           Rollback last N migrations
  --to=VERSION       Rollback to specific version (exclusive)
  --all              Rollback all migrations
  --reason="..."     Reason for rollback (recorded in history)
  --dry-run          Simulate rollback without applying
  --verbose          Enable detailed logging
```

### list-migrations.ts

List all migrations with their application status.

**Usage:**
```bash
tsx scripts/migrations/list-migrations.ts [options]

Options:
  --pending    Show only pending migrations
  --applied    Show only applied migrations
```

### validate.ts

Validate integrity of applied migrations by checking checksums.

**Usage:**
```bash
tsx scripts/migrations/validate.ts
```

Exits with code 0 if valid, 1 if validation fails.

### history.ts

Display rollback history.

**Usage:**
```bash
tsx scripts/migrations/history.ts [options]

Options:
  --limit=N    Show only last N rollbacks
```

## Environment Variables

```bash
# Optional: Override default database path
export DATABASE_PATH=/path/to/database.db

# Default if not set: ./data/app.db
```

## Examples

### Standard Workflow

```bash
# 1. List pending migrations
npm run db:migrations:list -- --pending

# 2. Apply migrations
npm run db:migrate

# 3. Validate applied migrations
npm run db:migrations:validate

# 4. View current status
npm run db:migrations:list
```

### Rollback Workflow

```bash
# 1. View applied migrations
npm run db:migrations:list -- --applied

# 2. Test rollback (dry-run)
npm run db:rollback:dry-run -- --last=1

# 3. Execute rollback
npm run db:rollback -- --last=1 --reason="Production issue XYZ"

# 4. Verify rollback
npm run db:migrations:history
npm run db:migrations:list
```

### Emergency Rollback

```bash
# Immediate rollback of last migration
npm run db:rollback -- --last=1 --reason="EMERGENCY: Critical bug"

# Verify rollback succeeded
npm run db:migrations:validate
```

## Migration Files

Migration files are located in:
- **Forward migrations:** `src/db/migrations/up/`
- **Rollback migrations:** `src/db/migrations/down/`

Each migration consists of two files:
- `XXX-migration-name.sql` (up migration - create/modify)
- `XXX-migration-name.sql` (down migration - rollback)

## See Also

- **Migration Manager API:** `src/db/migration-manager.ts`
- **Comprehensive Documentation:** `docs/MIGRATION_ROLLBACK.md`
- **Test Suite:** `tests/database/migration-rollback.test.ts`

## Support

For issues or questions, refer to the comprehensive documentation at `docs/MIGRATION_ROLLBACK.md`.
