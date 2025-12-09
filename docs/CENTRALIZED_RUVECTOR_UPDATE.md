# Centralized RuVector Implementation Update

## PostgreSQL Support Added!

Based on the latest information, [RuVector codebase-index](https://github.com/ruvector/codebase-index) now has full PostgreSQL support as of 2024.

## Updated Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Project A      │    │   Project B      │    │   Project C      │
│  (User Auth)      │    │   (E-commerce)   │    │   (Analytics)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │ Query Patterns      │ Query Patterns      │ Query Patterns
          │ Store Successes      │ Store Successes      │ Store Successes
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CENTRALIZED RUVECTOR INSTANCE                  │
│                        (WITH POSTGRES)                         │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ PostgreSQL DB   │  │    Vector Store  │  │   Analytics     │   │
│  │                 │  │                 │  │                 │   │
│  • Vectors        │  • pgvector ext    │  • Usage Stats    │   │
│  • Metadata       │  • Fast search     │  • Success Rates  │   │
│  • Relationships  │  • Indexing       │  • Trends        │   │
│  • pg_vector ext   │  • Real-time       │  • Predictions    │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                   RuVector Codebase Index API                 │ │
│  │                                                               │ │
│  • Local sync for patterns                                         │ │
│  • Vector embeddings                                               │ │
│  • Similarity search                                              │ │
│  • Indexing operations                                           │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## PostgreSQL Storage Implementation

Based on RuVector's PostgreSQL storage backend (`src/storage/postgres.rs`), the system now includes:

### 1. **PostgreSQL with pgvector Extension**
```sql
-- Required PostgreSQL setup
CREATE EXTENSION IF NOT EXISTS vector;

-- Vector storage table
CREATE TABLE code_vectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path TEXT NOT NULL,
    file_type VARCHAR(50),
    content_hash VARCHAR(64),
    embedding vector(1536),  -- For OpenAI embeddings
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Similarity search index
CREATE INDEX code_vectors_embedding_idx ON code_vectors
USING ivfflat (embedding vector_cosine_ops);

-- Text search indexes
CREATE INDEX code_vectors_search_idx ON code_vectors
USING gin(to_tsvector('english', file_path || ' ' || (metadata->>'type')));
```

### 2. **Vector Operations**
```sql
-- Store vector embedding
INSERT INTO code_vectors (file_path, embedding, metadata)
VALUES ('src/auth.rs', '[0.1,0.2,...]', '{"type": "auth", "language": "rust"}');

-- Semantic search
SELECT file_path, metadata, 1 - (embedding <=> '[0.1,0.2,...]') as similarity
FROM code_vectors
ORDER BY embedding <=> '[0.1,0.2,...]'
LIMIT 10;
```

## Integration with Existing Project

Since you already have RuVector codebase-index in your project (`./.claude/skills/cfn-ruvector-codebase-index/`), let's set up PostgreSQL as the backend:

### 1. Docker Compose Configuration
```yaml
# docker-compose.postgres.yml
version: '3.8'

services:
  ruvector-postgres:
    image: pgvector/pgvector:pg15
    container_name: ruvector-postgres
    environment:
      POSTGRES_DB: ruvector
      POSTGRES_USER: ruvector
      POSTGRES_PASSWORD: ruvector_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    command: >
      postgres
      -c shared_preload_libraries=vector
      -c 'max_connections=200'
      -c 'shared_buffers=256MB'

  ruvector-server:
    build:
      context: .
      dockerfile: docker/ruvector-postgres/Dockerfile
    container_name: ruvector-server
    environment:
      - DATABASE_URL=postgresql://ruvector:ruvector_password@ruvector-postgres:5432/ruvector
      - EMBEDDING_MODEL=text-embedding-ada-002
      - EMBEDDING_DIMENSION=1536
    ports:
      - "8000:8000"
    depends_on:
      - ruvector-postgres
    volumes:
      - ./codebase:/codebase
      - ruvector_data:/data

volumes:
  postgres_data:
  ruvector_data:
```

### 2. Environment Configuration
```bash
# .env.local
RUVECTOR_STORAGE_TYPE=postgres
RUVECTOR_POSTGRES_URL=postgresql://ruvector:ruvector_password@localhost:5432/ruvector
RUVECTOR_POSTGRES_POOL_SIZE=20
RUVECTOR_EMBEDDING_MODEL=text-embedding-ada-002
```

### 3. Database Migration Script
```bash
#!/bin/bash
# setup-ruvector-postgres.sh

# Create pgvector extension
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Create tables
psql $DATABASE_URL <<'EOF'
CREATE TABLE IF NOT EXISTS code_vectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path TEXT NOT NULL,
    file_type VARCHAR(50),
    content_hash VARCHAR(64),
    embedding vector(1536),
    metadata JSONB,
    project_id VARCHAR(255),
    agent_id VARCHAR(100),
    success_rate FLOAT DEFAULT 0.0,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS code_vectors_embedding_idx
ON code_vectors USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS code_vectors_project_idx
ON code_vectors (project_id);

CREATE TABLE IF NOT EXISTS pattern_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_vector_id UUID REFERENCES code_vectors(id),
    target_vector_id UUID REFERENCES code_vectors(id),
    relationship_type VARCHAR(50),
    weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT NOW()
);
EOF

echo "PostgreSQL schema created successfully!"
```

## Enhanced Query Capabilities

### 1. Semantic + Metadata Search
```sql
-- Find patterns by semantic similarity AND filter by success
SELECT
    file_path,
    metadata,
    1 - (embedding <=> query_embedding) as similarity,
    success_rate,
    usage_count
FROM code_vectors
WHERE file_type = 'rust'
  AND success_rate > 0.8
  AND metadata->>'language' = 'rust'
ORDER BY similarity DESC, success_rate DESC
LIMIT 20;
```

### 2. Cross-Project Pattern Discovery
```sql
-- Find successful patterns used across multiple projects
WITH pattern_usage AS (
  SELECT
    file_path,
    metadata,
    COUNT(DISTINCT project_id) as project_count,
    AVG(success_rate) as avg_success,
    COUNT(*) as total_usage
  FROM code_vectors
  WHERE success_rate > 0.7
  GROUP BY file_path, metadata
)
SELECT *
FROM pattern_usage
WHERE project_count >= 2
ORDER BY avg_success DESC, project_count DESC;
```

## Performance Optimizations

### 1. Vector Indexing
```sql
-- Create HNSW index for faster approximate search
CREATE INDEX code_vectors_embedding_hnsw
ON code_vectors
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Reindex if needed
REINDEX INDEX code_vectors_embedding_hnsw;
```

### 2. Batch Operations
```sql
-- Batch insert vectors
INSERT INTO code_vectors (file_path, embedding, metadata)
VALUES
  ('src/auth1.rs', '[0.1,...]', '{"type": "auth", "success": true}'),
  ('src/auth2.rs', '[0.2,...]', '{"type": "auth", "success": true}'),
  ('src/auth3.rs', '[0.3,...]', '{"type": "auth", "success": true}')
ON CONFLICT (file_path)
DO UPDATE SET
    embedding = EXCLUDED.embedding,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();
```

## Usage Examples

### 1. Query Patterns from Centralized DB
```bash
# Using the existing RuVector CLI
ruvector query --type "postgres" \
  --pattern "authentication middleware" \
  --file-type "rust" \
  --min-success-rate 0.8 \
  --limit 5
```

### 2. Store New Pattern
```bash
# Store successful pattern with metadata
ruvector store \
  --file "src/auth/jwt_middleware.rs" \
  --metadata '{"type": "auth", "success": true, "confidence": 0.95}' \
  --project-id "user-management-system"
```

### 3. Find Similar Code Across Projects
```bash
# Search for similar implementations
ruvector similarity \
  --file "src/api/user_handler.rs" \
  --threshold 0.8 \
  --include-projects "auth-system, e-commerce, analytics"
```

## Benefits of PostgreSQL Backend

1. **Persistence**: Patterns survive across sessions and projects
2. **Scalability**: pgvector handles millions of vectors efficiently
3. **SQL Queries**: Complex queries combining vector and metadata search
4. **ACID Transactions**: Reliable storage and retrieval
5. **Indexing**: Multiple index types (HNSW, IVFFLAT, GIN)
6. **Analytics**: Built-in aggregation and reporting
7. **Backup & Restore**: Standard PostgreSQL tools

## Migration from File-based Storage

If you have existing file-based RuVector data:

```bash
# Migrate existing patterns to PostgreSQL
./migrate-ruvector-to-postgres.sh \
  --source ./data/ruvector \
  --target $DATABASE_URL \
  --batch-size 1000
```

This PostgreSQL integration makes the centralized RuVector system even more powerful, providing enterprise-grade storage and search capabilities for your code patterns!