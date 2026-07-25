# Database Read-Only Skill

This skill provides read-only access to the PostgreSQL database.

## Purpose

Allows agents to query data without the ability to modify it. Suitable for teams that need to analyze data but shouldn't change it (SEO, Marketing, QA, C-Suite).

## Capabilities

✅ **Allowed:**
- SELECT queries
- JOIN operations
- Aggregate functions (COUNT, SUM, AVG, etc.)
- Views and read-only functions

❌ **Prohibited:**
- INSERT statements
- UPDATE statements
- DELETE statements
- DDL statements (CREATE, ALTER, DROP)
- Schema modifications

## Configuration

The skill uses a read-only PostgreSQL user with limited permissions.

```json
{
  "db_user": "readonly_user",
  "db_password": "readonly_password",
  "allowed_operations": ["SELECT"]
}
```

## Usage

```bash
# Query database
./query.sh "SELECT * FROM users WHERE created_at > '2024-01-01'"

# Safe - will succeed
./query.sh "SELECT COUNT(*) FROM orders"

# Blocked - will fail
./query.sh "UPDATE users SET email='new@example.com'"
```

## Teams with Access

- SEO: For content analytics
- Marketing: For campaign metrics
- QA: For test data validation
- C-Suite: For business intelligence
- Frontend: For API contract validation

## Security

- Uses separate database user with SELECT-only grants
- No write permissions at database level
- Audit logged in operational_logs table
