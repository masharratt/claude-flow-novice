# Legacy System Migration Examples

Proven strategies and patterns for migrating legacy systems to modern architectures using Claude Flow.

## 🔄 Migration Strategies

### Strangler Fig Pattern
```typescript
// Gradual migration using strangler fig pattern
interface StranglerFigConfig {
  legacySystem: {
    endpoints: string[];
    database: string;
    authentication: string;
  };
  modernSystem: {
    microservices: string[];
    database: string;
    authentication: string;
  };
  migrationRoutes: RouteConfig[];
}

Task("Migration Architect", `
  Design strangler fig migration strategy:
  - Analyze legacy system architecture and dependencies
  - Create migration roadmap with incremental phases
  - Design API gateway routing for gradual cutover
  - Plan data migration and synchronization strategy
  - Establish rollback procedures for each phase
`, "migration-architect");

Task("Legacy Analyst", `
  Analyze existing legacy system:
  - Document current API endpoints and data flows
  - Identify business logic and critical dependencies
  - Assess code quality and technical debt
  - Create dependency mapping and risk assessment
  - Identify candidates for first migration wave
`, "code-analyzer");

Task("Modernization Engineer", `
  Build modern replacement components:
  - Create microservices for identified business domains
  - Implement modern authentication and authorization
  - Set up event-driven architecture with message queues
  - Build new database schemas with migration scripts
  - Implement monitoring and observability tools
`, "backend-dev");
```

### Database Migration Patterns
```sql
-- Dual-write pattern for database migration
-- Phase 1: Dual Write Setup
CREATE TABLE legacy_customers (
    id SERIAL PRIMARY KEY,
    customer_data TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE modern_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    address JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dual-write trigger for data synchronization
CREATE OR REPLACE FUNCTION sync_customer_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Parse legacy data and insert into modern table
    INSERT INTO modern_customers (
        first_name,
        last_name,
        email,
        phone,
        address
    )
    SELECT
        (customer_data::json->>'first_name'),
        (customer_data::json->>'last_name'),
        (customer_data::json->>'email'),
        (customer_data::json->>'phone'),
        customer_data::json->'address'
    FROM (SELECT NEW.customer_data) AS data;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_sync_trigger
    AFTER INSERT OR UPDATE ON legacy_customers
    FOR EACH ROW EXECUTE FUNCTION sync_customer_data();
```

## 🏛️ Monolith to Microservices

### Domain-Driven Design Migration
```javascript
// Microservices extraction using DDD
Task("Domain Expert", `
  Perform domain modeling and bounded context identification:
  - Conduct event storming sessions with stakeholders
  - Identify business domains and subdomains
  - Define bounded contexts and their relationships
  - Create domain models and ubiquitous language
  - Map existing code to domain boundaries
`, "domain-analyst");

Task("Microservices Architect", `
  Design microservices architecture:
  - Define service boundaries based on business domains
  - Design inter-service communication patterns
  - Plan data partitioning and service databases
  - Design API contracts and service interfaces
  - Create deployment and scaling strategies
`, "system-architect");

Task("Extraction Engineer", `
  Extract microservices from monolith:
  - Implement branch by abstraction pattern
  - Create adapter layers for service communication
  - Migrate business logic to service boundaries
  - Implement distributed transaction management
  - Set up service testing and monitoring
`, "backend-dev");
```

### Event-Driven Migration
```python
# Event sourcing migration pattern
from typing import Dict, List, Any
from dataclasses import dataclass
from datetime import datetime

@dataclass
class DomainEvent:
    event_id: str
    event_type: str
    aggregate_id: str
    data: Dict[str, Any]
    metadata: Dict[str, Any]
    timestamp: datetime

class LegacyToEventMigrator:
    def __init__(self, legacy_db, event_store):
        self.legacy_db = legacy_db
        self.event_store = event_store

    async def migrate_customer_data(self):
        """Migrate legacy customer data to event sourcing"""
        legacy_customers = await self.legacy_db.fetch_all_customers()

        for customer in legacy_customers:
            # Generate creation event from legacy data
            creation_event = DomainEvent(
                event_id=generate_uuid(),
                event_type="CustomerCreated",
                aggregate_id=customer.id,
                data={
                    "customer_id": customer.id,
                    "first_name": customer.first_name,
                    "last_name": customer.last_name,
                    "email": customer.email,
                    "registration_date": customer.created_at
                },
                metadata={
                    "source": "legacy_migration",
                    "migration_batch": "initial",
                    "legacy_id": customer.legacy_id
                },
                timestamp=customer.created_at
            )

            await self.event_store.append_event(creation_event)

            # Generate update events from audit log
            updates = await self.legacy_db.fetch_customer_updates(customer.id)
            for update in updates:
                update_event = DomainEvent(
                    event_id=generate_uuid(),
                    event_type="CustomerUpdated",
                    aggregate_id=customer.id,
                    data=update.changes,
                    metadata={
                        "source": "legacy_migration",
                        "original_timestamp": update.timestamp
                    },
                    timestamp=update.timestamp
                )
                await self.event_store.append_event(update_event)
```

## 🔧 API Migration Patterns

### API Gateway Migration
```yaml
# Kong API Gateway configuration for legacy migration
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: legacy-migration-routing
plugin: request-transformer
config:
  add:
    headers:
      - "X-Migration-Source:legacy"
  remove:
    headers:
      - "X-Legacy-Auth"

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: legacy-migration-ingress
  annotations:
    konghq.com/plugins: legacy-migration-routing
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"
spec:
  rules:
  - host: api.company.com
    http:
      paths:
      - path: /api/v1/customers
        pathType: Prefix
        backend:
          service:
            name: modern-customer-service
            port:
              number: 80
      - path: /api/legacy
        pathType: Prefix
        backend:
          service:
            name: legacy-api-service
            port:
              number: 8080
```

### API Versioning Strategy
```typescript
// API versioning for legacy migration
interface ApiVersionConfig {
  v1: {
    // Legacy API format
    endpoint: '/api/v1/customers';
    format: 'xml';
    authentication: 'basic';
    deprecated: true;
    sunsetDate: '2024-12-31';
  };
  v2: {
    // Transitional API format
    endpoint: '/api/v2/customers';
    format: 'json';
    authentication: 'jwt';
    features: ['pagination', 'filtering'];
  };
  v3: {
    // Modern API format
    endpoint: '/api/v3/customers';
    format: 'json';
    authentication: 'oauth2';
    features: ['graphql', 'real-time', 'webhooks'];
  };
}

Task("API Migration Engineer", `
  Implement API versioning strategy:
  - Create version detection middleware
  - Implement format transformation layers
  - Set up authentication bridging
  - Create deprecation notices and migration guides
  - Implement usage tracking and migration metrics
`, "api-engineer");
```

## 💾 Data Migration Strategies

### Zero-Downtime Data Migration
```python
# Zero-downtime migration with CDC (Change Data Capture)
import asyncio
from typing import Dict, Any
import logging

class ZeroDowntimeMigrator:
    def __init__(self, source_db, target_db, cdc_stream):
        self.source_db = source_db
        self.target_db = target_db
        self.cdc_stream = cdc_stream
        self.logger = logging.getLogger(__name__)

    async def execute_migration(self):
        """Execute zero-downtime migration process"""
        try:
            # Phase 1: Initial bulk copy
            self.logger.info("Starting initial bulk data copy")
            await self.bulk_copy_data()

            # Phase 2: Real-time CDC streaming
            self.logger.info("Starting real-time change streaming")
            await self.start_cdc_streaming()

            # Phase 3: Cutover validation
            self.logger.info("Validating data consistency")
            await self.validate_data_consistency()

            # Phase 4: Switch traffic
            self.logger.info("Switching application traffic")
            await self.switch_application_traffic()

        except Exception as e:
            self.logger.error(f"Migration failed: {e}")
            await self.rollback_migration()
            raise

    async def bulk_copy_data(self):
        """Copy existing data in batches"""
        batch_size = 10000
        offset = 0

        while True:
            batch = await self.source_db.fetch_batch(offset, batch_size)
            if not batch:
                break

            transformed_batch = [self.transform_record(record) for record in batch]
            await self.target_db.bulk_insert(transformed_batch)

            offset += batch_size
            self.logger.info(f"Copied {offset} records")

    async def start_cdc_streaming(self):
        """Stream real-time changes"""
        async for change in self.cdc_stream:
            transformed_change = self.transform_change(change)
            await self.apply_change_to_target(transformed_change)

    def transform_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Transform legacy record to modern format"""
        return {
            'id': record.get('legacy_id'),
            'first_name': record.get('fname'),
            'last_name': record.get('lname'),
            'email': record.get('email_address'),
            'phone': record.get('phone_number'),
            'created_at': record.get('registration_date'),
            'updated_at': record.get('last_modified'),
            'metadata': {
                'migrated_from': 'legacy_system',
                'migration_timestamp': datetime.utcnow().isoformat()
            }
        }
```

### Data Validation and Reconciliation
```sql
-- Data validation queries for migration verification
-- Check record counts
SELECT
    'legacy' as source,
    COUNT(*) as total_records,
    MIN(created_at) as earliest_record,
    MAX(created_at) as latest_record
FROM legacy_customers
UNION ALL
SELECT
    'modern' as source,
    COUNT(*) as total_records,
    MIN(created_at) as earliest_record,
    MAX(created_at) as latest_record
FROM modern_customers;

-- Check for data inconsistencies
WITH legacy_summary AS (
    SELECT
        id,
        customer_data::json->>'email' as email,
        created_at
    FROM legacy_customers
),
modern_summary AS (
    SELECT
        metadata->>'legacy_id' as id,
        email,
        created_at
    FROM modern_customers
    WHERE metadata->>'migrated_from' = 'legacy_system'
)
SELECT
    l.id,
    l.email as legacy_email,
    m.email as modern_email,
    l.created_at as legacy_created,
    m.created_at as modern_created
FROM legacy_summary l
FULL OUTER JOIN modern_summary m ON l.id = m.id
WHERE l.id IS NULL
   OR m.id IS NULL
   OR l.email != m.email
   OR ABS(EXTRACT(EPOCH FROM (l.created_at - m.created_at))) > 1;
```

## 🧪 Testing Migration

### Migration Testing Strategy
```javascript
// Comprehensive migration testing
Task("Migration Test Engineer", `
  Create comprehensive migration test suite:
  - Unit tests for data transformation logic
  - Integration tests for API compatibility
  - Performance tests for migration speed
  - Chaos engineering tests for failure scenarios
  - User acceptance tests for feature parity
`, "tester");

Task("Quality Assurance Engineer", `
  Validate migration quality:
  - Data integrity and consistency checks
  - Performance regression testing
  - Security vulnerability assessment
  - User experience validation
  - Business process verification
`, "qa-engineer");

// Migration test scenarios
describe('Legacy Migration Tests', () => {
  describe('Data Migration', () => {
    test('should migrate all customer records', async () => {
      const legacyCount = await legacyDb.count('customers');
      await migrator.migrateCustomers();
      const modernCount = await modernDb.count('customers');

      expect(modernCount).toBe(legacyCount);
    });

    test('should preserve data integrity', async () => {
      const legacyCustomer = await legacyDb.findById('customer_123');
      await migrator.migrateCustomer(legacyCustomer);
      const modernCustomer = await modernDb.findByLegacyId('customer_123');

      expect(modernCustomer.email).toBe(legacyCustomer.email);
      expect(modernCustomer.firstName).toBe(legacyCustomer.fname);
    });
  });

  describe('API Compatibility', () => {
    test('should maintain backward compatibility', async () => {
      const legacyResponse = await legacyApi.get('/customers/123');
      const modernResponse = await modernApi.get('/api/v1/customers/123');

      expect(modernResponse.data).toMatchObject(legacyResponse.data);
    });
  });
});
```

## 📊 Migration Monitoring

### Migration Metrics Dashboard
```yaml
# Grafana dashboard configuration for migration monitoring
apiVersion: v1
kind: ConfigMap
metadata:
  name: migration-dashboard
data:
  dashboard.json: |
    {
      "dashboard": {
        "title": "Legacy Migration Dashboard",
        "panels": [
          {
            "title": "Migration Progress",
            "type": "stat",
            "targets": [
              {
                "expr": "migration_records_completed / migration_records_total * 100"
              }
            ]
          },
          {
            "title": "Data Consistency",
            "type": "graph",
            "targets": [
              {
                "expr": "rate(migration_validation_errors[5m])"
              }
            ]
          },
          {
            "title": "API Traffic Split",
            "type": "piechart",
            "targets": [
              {
                "expr": "sum by (version) (rate(api_requests_total[5m]))"
              }
            ]
          }
        ]
      }
    }
```

### Migration Alerts
```yaml
# Prometheus alerting rules for migration
groups:
- name: migration-alerts
  rules:
  - alert: MigrationDataLoss
    expr: migration_records_completed < migration_records_total * 0.95
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Migration data loss detected"
      description: "Only {{ $value }}% of records have been migrated"

  - alert: MigrationPerformanceDegraded
    expr: rate(migration_records_per_second[5m]) < 100
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "Migration performance degraded"
      description: "Migration speed is {{ $value }} records/second"

  - alert: APICompatibilityBroken
    expr: rate(api_compatibility_errors[5m]) > 0.01
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "API compatibility broken"
      description: "API compatibility error rate is {{ $value }}"
```

## 🚀 Migration Automation

### Automated Migration Pipeline
```yaml
# GitLab CI/CD pipeline for automated migration
stages:
  - validation
  - migration-test
  - migration-staging
  - migration-production
  - verification

variables:
  MIGRATION_BATCH_SIZE: "10000"
  VALIDATION_THRESHOLD: "99.9"

migration-validation:
  stage: validation
  script:
    - python scripts/validate_migration_readiness.py
    - python scripts/check_data_quality.py
    - python scripts/validate_dependencies.py
  artifacts:
    reports:
      junit: validation-results.xml

migration-dry-run:
  stage: migration-test
  script:
    - python scripts/migration_dry_run.py
    - python scripts/validate_results.py
  artifacts:
    paths:
      - migration-report.html
    expire_in: 1 week

migration-staging:
  stage: migration-staging
  environment:
    name: staging
  script:
    - python scripts/execute_migration.py --env staging
    - python scripts/run_integration_tests.py
  only:
    - main

migration-production:
  stage: migration-production
  environment:
    name: production
  script:
    - python scripts/execute_migration.py --env production
    - python scripts/switch_traffic.py --gradual
  when: manual
  only:
    - main

post-migration-verification:
  stage: verification
  script:
    - python scripts/verify_migration_success.py
    - python scripts/cleanup_legacy_data.py
  when: manual
```

## 📋 Migration Checklist

### Pre-Migration Preparation
- [ ] Complete legacy system analysis and documentation
- [ ] Design modern architecture and data models
- [ ] Create migration strategy and timeline
- [ ] Set up monitoring and alerting systems
- [ ] Prepare rollback procedures and contingency plans
- [ ] Train operations team on new systems
- [ ] Create communication plan for stakeholders

### Migration Execution
- [ ] Execute migration in non-production environments
- [ ] Validate data integrity and consistency
- [ ] Test API compatibility and performance
- [ ] Conduct user acceptance testing
- [ ] Perform security and compliance validation
- [ ] Execute production migration with monitoring
- [ ] Gradually switch traffic to new system

### Post-Migration Tasks
- [ ] Verify all systems are functioning correctly
- [ ] Monitor performance and error rates
- [ ] Address any issues or data inconsistencies
- [ ] Complete user training and documentation
- [ ] Plan legacy system decommissioning
- [ ] Conduct retrospective and lessons learned

## 🔗 Related Documentation

- [Enterprise Integration Patterns](../enterprise-integration/README.md)
- [Multi-Cloud Deployment](../multi-cloud/README.md)
- [Performance Optimization](../performance-optimization/README.md)
- [Troubleshooting Guide](../troubleshooting/README.md)

---

**Migration Success Factors:**
1. Thorough planning and risk assessment
2. Comprehensive testing at every stage
3. Gradual migration with rollback capabilities
4. Continuous monitoring and validation
5. Clear communication and stakeholder management