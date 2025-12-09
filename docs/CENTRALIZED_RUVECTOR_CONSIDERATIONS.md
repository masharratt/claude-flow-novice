# Centralized RuVector: Considerations and Multi-Tenant Architecture

## Potential Issues with Single Database for All Projects

### 1. **Security & Privacy Concerns**

#### Issues:
- **Intellectual Property**: Company A might not want their proprietary patterns visible to Company B
- **Sensitive Code**: Patterns from internal/proprietary projects should not be shared
- **Access Control**: Different teams need different access levels
- **GDPR/Compliance**: Personal data or customer information patterns

#### Solution: Row-Level Security + Tenancy
```sql
-- Multi-tenant schema
CREATE TABLE code_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,  -- Company/project identifier
    project_id VARCHAR(255) NOT NULL,  -- Specific project
    visibility_level VARCHAR(20) NOT NULL, -- 'public', 'company', 'private', 'secret'

    -- Pattern data
    type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(1536),

    -- Security metadata
    creator_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),

    -- Row-level security
    CONSTRAINT check_visibility CHECK (visibility_level IN ('public', 'company', 'private', 'secret'))
);

-- Enable row-level security
ALTER TABLE code_patterns ENABLE ROW LEVEL SECURITY;

-- Policy for public patterns
CREATE POLICY public_patterns_policy ON code_patterns
    FOR ALL
    TO authenticated
    USING (visibility_level = 'public');

-- Policy for company-specific patterns
CREATE POLICY company_patterns_policy ON code_patterns
    FOR ALL
    TO authenticated
    USING (
        visibility_level = 'company' AND
        tenant_id = current_setting('app.current_tenant')
    );

-- Policy for private patterns
CREATE POLICY private_patterns_policy ON code_patterns
    FOR ALL
    TO authenticated
    USING (
        visibility_level = 'private' AND
        tenant_id = current_setting('app.current_tenant') AND
        creator_id = current_user_id()
    );
```

### 2. **Performance & Scale Issues**

#### Issues:
- **Table Size**: Millions of patterns across all projects could slow down queries
- **Hot Spots**: Popular patterns queried frequently
- **Index Size**: Vector indexes on all data may be inefficient
- **Network Latency**: Centralized queries add latency

#### Solution: Schema + Partitioning Strategy
```sql
-- Partition by tenant
CREATE TABLE code_patterns (
    id UUID,
    tenant_id VARCHAR(255) NOT NULL,
    project_id VARCHAR(255) NOT NULL,
    -- ... other columns
    created_at TIMESTAMP
) PARTITION BY LIST (tenant_id);

-- Separate high-traffic tables
CREATE TABLE hot_patterns (
    LIKE code_patterns INCLUDING ALL
    -- Only store patterns with usage_count > 100
) PARTITION BY LIST (tenant_id);

CREATE TABLE pattern_usage_stats (
    pattern_id UUID REFERENCES code_patterns(id),
    tenant_id VARCHAR(255),
    query_count INTEGER DEFAULT 1,
    success_rate FLOAT,
    last_access TIMESTAMP
);

-- Materialized views for frequent queries
CREATE MATERIALIZED VIEW popular_patterns AS
SELECT *
FROM code_patterns
WHERE usage_count > 50
  AND success_rate > 0.8;
```

### 3. **Data Ownership & Governance**

#### Issues:
- **Ownership disputes**: Who owns shared patterns?
- **Quality Control**: How to prevent low-quality patterns?
- **Versioning**: How to handle pattern updates?
- **Attribution**: Credit for pattern creators

#### Solution: Governance Layer
```sql
-- Pattern ownership and attribution
CREATE TABLE pattern_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id UUID REFERENCES code_patterns(id),
    creator_tenant_id VARCHAR(255),
    original_creator VARCHAR(255),
    contribution_type VARCHAR(50), -- 'original', 'improvement', 'adaptation'
    contribution_percent FLOAT, -- How much of this is their work
    created_at TIMESTAMP DEFAULT NOW()
);

-- Pattern versioning
CREATE TABLE pattern_versions (
    pattern_id UUID REFERENCES code_patterns(id),
    version INTEGER,
    content TEXT,
    changelog TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (pattern_id, version)
);

-- Quality scores
CREATE TABLE pattern_quality_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id UUID REFERENCES code_patterns(id),
    reviewer_id VARCHAR(255),
    technical_score INTEGER CHECK (technical_score BETWEEN 0 AND 10),
   实用性评分 INTEGER CHECK (实用性评分 BETWEEN 0 AND 10),
    code_quality_score INTEGER CHECK (code_quality_score BETWEEN 0 AND 10),
    comments TEXT,
    approved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Multi-Level Sharing Strategy

### Level 1: Public Patterns
```sql
-- Universal patterns everyone can use
INSERT INTO code_patterns (
    tenant_id,
    project_id,
    visibility_level,
    type,
    content,
    metadata
) VALUES (
    'public',
    'rust-common-patterns',
    'public',
    'error-handling',
    'Result type with proper error handling',
    '{"language": "rust", "category": "error-handling", "universal": true}'
);
```

### Level 2: Company-Wide Sharing
```sql
-- Patterns shared within a company
-- Set tenant context
SET app.current_tenant = 'acme-corp';

-- Store pattern
INSERT INTO code_patterns (
    tenant_id,
    visibility_level,
    ...
) VALUES (
    'acme-corp',
    'company',
    ...
);
```

### Level 3: Project-Specific
```sql
-- Private to a specific project
INSERT INTO code_patterns (
    tenant_id,
    project_id,
    visibility_level,
    ...
) VALUES (
    'acme-corp',
    'payment-processor',
    'private',
    ...
);
```

### Level 4: Secret Patterns
```sql
-- Never shared, only for creator
INSERT INTO code_patterns (
    visibility_level,
    ...
) VALUES (
    'secret',
    ...
);
```

## Hybrid Architecture: Multiple Databases

### Option 1: Separate Databases per Tier
```yaml
# docker-compose.yml
services:
  ruvector-public:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: ruvector_public
      POSTGRES_USER: ruvector
    ports:
      - "5432:5432"
    volumes:
      - public_data:/var/lib/postgresql

  ruvector-companies:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: ruvector_companies
      POSTGRES_USER: ruvector
    ports:
      - "5433:5432"
    volumes:
      - company_data:/var/lib/postgresql

  ruvector-private:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: ruvector_private
      POSTGRES_USER: ruvector
    ports:
      - "5434:5434"
    volumes:
      - private_data:/var/lib/postgresql
```

### Option 2: Schema-Based Isolation
```sql
-- Public schema for universal patterns
CREATE SCHEMA ruvector_public;
SET search_path TO ruvector_public;

-- Company schemas
CREATE SCHEMA acme_corp_patterns;
CREATE SCHEMA tech_startup_patterns;

-- Create tables in each schema
CREATE TABLE ruvector_public.patterns (...);
CREATE TABLE acme_corp_patterns.patterns (...);
CREATE TABLE tech_startup_patterns.patterns (...);

-- User can search across schemas they have access to
CREATE OR REPLACE FUNCTION search_patterns(query vector, schemas text[])
RETURNS TABLE(...) AS $$
    SELECT * FROM search_patterns_recursive(query, schemas);
$$ LANGUAGE plpgsql;
```

## Query Layer for Access Control

### API Route with Visibility Filter
```typescript
// pattern-service.ts
class PatternService {
  async searchPatterns(query: SearchQuery, user: User): Promise<Pattern[]> {
    let visibilityFilter = this.buildVisibilityFilter(user);

    const query = `
      SELECT * FROM code_patterns
      WHERE vector_search(embedding, $1)
        AND ${visibilityFilter}
      ORDER BY similarity DESC
      LIMIT $2
    `;

    return this.db.query(query, [query.embedding, query.limit]);
  }

  private buildVisibilityFilter(user: User): string {
    const filters = [];

    // Always include public patterns
    filters.push("visibility_level = 'public'");

    // Add company patterns if user belongs to company
    if (user.companyId) {
      filters.push(`(tenant_id = '${user.companyId}' AND visibility_level = 'company')`);
    }

    // Add project patterns if user has access
    if (user.projectIds && user.projectIds.length > 0) {
      const projectList = user.projectIds.map(id => `'${id}'`).join(',');
      filters.push(`project_id IN (${projectList}) AND visibility_level = 'private'`);
    }

    return filters.join(' OR ');
  }
}
```

## Performance Optimizations

### 1. Caching Layer
```redis
# Redis cache for hot patterns
GET pattern:rust:auth:middleware → cache hit
SET pattern:rust:auth:middleware → cache miss → query DB → cache result

# TTL based on popularity
TTL public_patterns: 86400      # 1 day
TTL company_patterns: 3600       # 1 hour
TTL private_patterns: 300        # 5 minutes
```

### 2. Smart Query Routing
```python
class QueryRouter:
    def route_query(self, query: Query) -> str:
        # Route to appropriate database based on query context
        if query.is_public_only():
            return 'postgresql://localhost:5432/ruvector_public'
        elif query.company_id:
            return f'postgresql://localhost:5433/{query.company_id}'
        else:
            return 'postgresql://localhost:5434/ruvector_private'
```

## Implementation Recommendation

### 1. Start with Schema-Based Isolation
```sql
-- Easier to manage, single database instance
-- Clear ownership boundaries
-- Easy to migrate data between levels
```

### 2. Implement Row-Level Security
```sql
-- Fine-grained control
-- Security at database level
-- Easy to audit access
```

### 3. Add Caching Layer
```python
# Redis cache for performance
# Reduces database load
-- Improves query speed
```

### 4. Monitor Usage Patterns
```sql
-- Track what's being shared
-- Identify hot patterns
-- Optimize based on usage
```

This multi-level approach gives you the benefits of shared learning while maintaining security, privacy, and control over your intellectual property!