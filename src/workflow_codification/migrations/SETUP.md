# PostgreSQL Setup for Workflow Codification

This guide explains how to set up PostgreSQL for workflow codification schema testing.

---

## Prerequisites

- **PostgreSQL 15+** installed
- **Database:** `cfn_workflow` (production) or `cfn_workflow_test` (testing)
- **User:** PostgreSQL user with CREATE/DROP privileges

---

## Quick Start (Ubuntu/Debian)

### 1. Install PostgreSQL

```bash
# Update package list
sudo apt update

# Install PostgreSQL 16
sudo apt install postgresql-16 postgresql-contrib-16

# Start PostgreSQL service
sudo service postgresql start

# Verify installation
pg_isready
```

### 2. Create Database and User

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL shell:
CREATE DATABASE cfn_workflow;
CREATE USER cfn_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE cfn_workflow TO cfn_user;

# Create test database
CREATE DATABASE cfn_workflow_test;
GRANT ALL PRIVILEGES ON DATABASE cfn_workflow_test TO cfn_user;

# Exit
\q
```

### 3. Run Migrations

```bash
cd /home/user/claude-flow-novice/src/workflow-codification/migrations

# Run all migrations in order
for file in 001_*.sql 002_*.sql 003_*.sql 004_*.sql 005_*.sql 006_*.sql 007_*.sql; do
    echo "Executing: $file"
    psql -U cfn_user -d cfn_workflow -f "$file"
done
```

### 4. Run Tests

```bash
cd /home/user/claude-flow-novice

# Set test database environment variables
export TEST_DB_NAME=cfn_workflow_test
export TEST_DB_USER=cfn_user
export TEST_DB_PASSWORD=your_secure_password
export TEST_DB_HOST=localhost
export TEST_DB_PORT=5432

# Run migrations on test database
for file in src/workflow-codification/migrations/00*.sql; do
    psql -U cfn_user -d cfn_workflow_test -f "$file"
done

# Run comprehensive test suite
bash tests/workflow-codification/database/test-schema.sh
```

---

## Alternative: Docker PostgreSQL

If you prefer Docker:

```bash
# Start PostgreSQL container
docker run -d \
    --name cfn-postgres \
    -e POSTGRES_USER=cfn_user \
    -e POSTGRES_PASSWORD=cfn_pass \
    -e POSTGRES_DB=cfn_workflow \
    -p 5432:5432 \
    postgres:16-alpine

# Wait for startup
sleep 5

# Verify connection
docker exec cfn-postgres pg_isready

# Run migrations
for file in src/workflow-codification/migrations/00*.sql; do
    docker exec -i cfn-postgres psql -U cfn_user -d cfn_workflow < "$file"
done

# Run tests
export TEST_DB_NAME=cfn_workflow
export TEST_DB_USER=cfn_user
export TEST_DB_PASSWORD=cfn_pass
export TEST_DB_HOST=localhost
export TEST_DB_PORT=5432

bash tests/workflow-codification/database/test-schema.sh
```

---

## Troubleshooting

### PostgreSQL not running

```bash
# Check status
sudo service postgresql status

# Start service
sudo service postgresql start

# Check if listening
pg_isready -h localhost -p 5432
```

### Connection refused

```bash
# Edit pg_hba.conf to allow local connections
sudo nano /etc/postgresql/16/main/pg_hba.conf

# Add this line:
# local   all             all                                     md5

# Restart PostgreSQL
sudo service postgresql restart
```

### Permission denied

```bash
# Grant privileges to user
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE cfn_workflow TO cfn_user;"
```

---

## Cleanup

### Drop Test Database

```bash
# Drop test database
psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS cfn_workflow_test;"
```

### Rollback Production Schema

```bash
# Use rollback script
psql -U cfn_user -d cfn_workflow -f 999_rollback.sql
```

---

## Without PostgreSQL (Syntax Validation Only)

If PostgreSQL is unavailable, validate SQL syntax:

```bash
bash src/workflow-codification/migrations/validate-syntax.sh
```

This checks for basic SQL syntax errors without requiring a live database.
