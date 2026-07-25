# Database Read-Write Skill

This skill provides full read-write access to the PostgreSQL database.

## Purpose

Allows agents to query and modify data. Suitable for teams that need to manage database operations (Backend, DevOps).

## Capabilities

✅ **Allowed:**
- SELECT queries
- INSERT statements
- UPDATE statements
- DELETE statements
- Transaction management
- Schema migrations (with restrictions)

⚠️ **With Caution:**
- DDL statements (CREATE, ALTER, DROP)
- Bulk operations
- Foreign key modifications

## Configuration

The skill uses an admin PostgreSQL user with full permissions.

```json
{
  "db_user": "admin_user",
  "db_password": "admin_password",
  "allowed_operations": ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP"]
}
```

## Usage

```bash
# Query database
./query.sh "SELECT * FROM users"

# Insert data
./query.sh "INSERT INTO users (name, email) VALUES ('John', 'john@example.com')"

# Update data
./query.sh "UPDATE users SET email='new@example.com' WHERE id=123"

# Delete data
./query.sh "DELETE FROM temp_data WHERE created_at < NOW() - INTERVAL '30 days'"

# Run migration
./migrate.sh up
```

## Teams with Access

- Backend: For API data operations
- DevOps: For database migrations and maintenance

## Security

- Uses admin database user with full permissions
- **All operations are audit logged**
- Requires explicit team authorization
- Should be used with caution in production

## Best Practices

1. **Use transactions** for multi-statement operations
2. **Test migrations** in dev environment first
3. **Backup before DDL** changes
4. **Review audit logs** regularly
5. **Use parameterized queries** to prevent SQL injection
