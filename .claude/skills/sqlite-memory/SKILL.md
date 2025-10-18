# SQLite Memory Access Skill

## Overview
This skill provides secure SQLite memory access with a 5-level Access Control List (ACL) system, integrating with Redis for session management and caching. The implementation includes encrypted query patterns, TTL-based expiration, and comprehensive test coverage.

## Architecture
- **Database**: SQLite for persistent storage
- **Cache/Session**: Redis for authentication and temporary data
- **Security**: 5-tier ACL model with encryption
- **Automation**: TTL cleanup script for automatic data expiration

## 5-Level ACL Model

### Level 1: Public Access
- **Description**: Read-only access to non-sensitive public data
- **Encryption**: None required for public data
- **Use Cases**: Public content, metadata, non-personal information

### Level 2: Authenticated User
- **Description**: Basic user authentication with read/write access to personal data
- **Encryption**: AES-256 for sensitive personal information
- **Use Cases**: User profiles, preferences, personal settings

### Level 3: Privileged User
- **Description**: Enhanced permissions with access to shared resources
- **Encryption**: AES-256 + additional data masking
- **Use Cases**: Shared workspaces, team collaboration, group data

### Level 4: Administrator
- **Description**: Full system access with user management capabilities
- **Encryption**: AES-256 + complete audit logging
- **Use Cases**: User management, system configuration, security policies

### Level 5: Super Administrator
- **Description**: Ultimate system access with all permissions
- **Encryption**: AES-256 + end-to-end encryption for all operations
- **Use Cases**: System maintenance, disaster recovery, security oversight

## Query Patterns

### Public Queries (Level 1)
```sql
-- Public content access
SELECT id, title, created_at, public_status 
FROM memory_content 
WHERE public_status = 'public' 
ORDER BY created_at DESC;

-- Public metadata
SELECT id, name, type, public_count 
FROM memory_metadata 
WHERE type IN ('public', 'shared');
```

### Authenticated User Queries (Level 2)
```sql
-- Personal data access with user context
SELECT id, content, metadata, created_at 
FROM memory_content 
WHERE user_id = :user_id 
AND (access_level >= 2 OR created_by = :user_id);

-- User preferences
SELECT id, key, value, encrypted 
FROM user_preferences 
WHERE user_id = :user_id;
```

### Privileged User Queries (Level 3)
```sql
-- Shared resource access
SELECT mc.id, mc.content, mc.created_by, mc.created_at
FROM memory_content mc
JOIN shared_access sa ON mc.id = sa.content_id
WHERE sa.user_id = :user_id
AND mc.access_level >= 3;

-- Group collaboration data
SELECT id, name, description, member_count 
FROM collaboration_groups 
WHERE user_id IN (SELECT member_id FROM group_members 
                 WHERE group_id IN (SELECT id FROM user_groups 
                                   WHERE user_id = :user_id));
```

### Administrator Queries (Level 4)
```sql
-- User management
SELECT id, username, email, role, last_login, created_at 
FROM users 
WHERE role IN ('user', 'privileged') 
ORDER BY last_login DESC;

-- System configuration
SELECT id, key, value, description, modified_by 
FROM system_config 
WHERE category = 'security' OR category = 'performance';

-- Audit logs
SELECT id, action, user_id, target_id, ip_address, timestamp 
FROM audit_logs 
WHERE action IN ('create', 'update', 'delete') 
ORDER BY timestamp DESC;
```

### Super Administrator Queries (Level 5)
```sql
-- Complete system access
SELECT * FROM memory_content 
WHERE access_level >= 5 
ORDER BY created_at DESC;

-- All system logs
SELECT * FROM audit_logs 
ORDER BY timestamp DESC 
LIMIT 1000;

-- User activity monitoring
SELECT u.id, u.username, COUNT(a.id) as action_count, MAX(a.timestamp) as last_action
FROM users u
LEFT JOIN audit_logs a ON u.id = a.user_id
GROUP BY u.id, u.username
ORDER BY last_action DESC;
```

## Security Features

### Encryption Standards
- **AES-256**: All sensitive data encrypted using industry-standard AES-256
- **Key Management**: Redis-based key rotation and management
- **Data Masking**: Partial data exposure for non-privileged users

### Session Management
- **Redis Integration**: Session storage and validation
- **Token-based Authentication**: JWT-style tokens with expiration
- **IP Binding**: Optional IP address binding for enhanced security

### Audit Logging
- **Complete Activity Tracking**: All access attempts logged
- **User Accountability**: User-level activity monitoring
- **Security Alerts**: Suspicious activity detection

## Integration Points

### Redis Integration
- **Session Storage**: User authentication sessions
- **Cache Layer**: Frequently accessed data caching
- **Rate Limiting**: API endpoint protection
- **TTL Management**: Automatic data expiration

### SQLite Integration
- **Persistent Storage**: Long-term data storage
- **Transaction Support**: ACID-compliant operations
- **Index Optimization**: Performance-optimized queries
- **Backup/Recovery**: Automated backup capabilities

## Performance Considerations

### Caching Strategy
- **Multi-level Caching**: Redis + SQLite query optimization
- **TTL-based Expiration**: Automatic cache invalidation
- **Query Result Caching**: Expensive query result caching

### Database Optimization
- **Index Design**: Proper indexing for ACL queries
- **Connection Pooling**: Efficient connection management
- **Query Optimization**: Plan analysis and optimization

## Monitoring and Maintenance

### Health Checks
- **Database Connectivity**: SQLite and Redis connection monitoring
- **Performance Metrics**: Query response time tracking
- **Error Logging**: Comprehensive error tracking
- **Resource Usage**: Memory and CPU monitoring

### Backup Strategy
- **Automated Backups**: Scheduled SQLite database backups
- **Redis Persistence**: RDB/AOF configuration for data persistence
- **Point-in-time Recovery**: Transaction log-based recovery

## API Endpoints

### Authentication
- `POST /auth/login` - User authentication
- `POST /auth/refresh` - Token refresh
- `POST /auth/logout` - Session termination

### Data Access
- `GET /memory/public` - Public content (Level 1)
- `GET /memory/personal` - Personal data (Level 2)
- `GET /memory/shared` - Shared resources (Level 3)
- `GET /memory/admin` - Administrative data (Level 4)
- `GET /memory/super` - Super admin data (Level 5)

### Management
- `POST /memory` - Create new content
- `PUT /memory/:id` - Update existing content
- `DELETE /memory/:id` - Delete content
- `GET /memory/stats` - System statistics

## Testing Coverage

### Unit Tests
- **ACL Logic**: Each access level validation
- **Encryption**: Data encryption/decryption tests
- **Query Patterns**: SQL query execution validation
- **Session Management**: Authentication flow testing

### Integration Tests
- **Redis Integration**: Session and caching functionality
- **SQLite Operations**: Database CRUD operations
- **API Endpoints**: HTTP request/response validation
- **Error Handling**: Edge case and error scenario testing

### Security Tests
- **Access Control**: Unauthorized access prevention
- **Data Encryption**: Encryption strength validation
- **Session Security**: Session hijacking protection
- **Input Validation**: SQL injection prevention

## Deployment Configuration

### Environment Variables
- `SQLITE_DB_PATH`: Path to SQLite database file
- `REDIS_HOST`: Redis server hostname
- `REDIS_PORT`: Redis server port
- `ENCRYPTION_KEY`: Master encryption key
- `SESSION_SECRET`: Session signing secret
- `LOG_LEVEL`: Application logging level

### Docker Configuration
- **Multi-stage Build**: Optimized production image
- **Health Checks**: Container health monitoring
- **Volume Mounts**: Database persistence
- **Environment Variables**: Runtime configuration

## Maintenance Schedule

### Regular Tasks
- **Daily**: Log rotation, backup verification
- **Weekly**: Performance analysis, index optimization
- **Monthly**: Security audit, key rotation
- **Quarterly**: System review, capacity planning

### Emergency Procedures
- **Database Corruption**: Restore from backup
- **Redis Failure**: Fallback to direct SQLite access
- **Security Breach**: Immediate lockdown and investigation
- **Performance Degradation**: Cache and query optimization