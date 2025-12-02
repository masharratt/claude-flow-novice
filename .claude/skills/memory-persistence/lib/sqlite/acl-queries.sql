-- SQLite Memory Access Skill - ACL Queries
-- This file contains pre-built queries for each of the 5 ACL levels
-- Queries include encryption handling, access validation, and data filtering

-- =================================================================
-- LEVEL 1: PUBLIC ACCESS QUERIES
-- =================================================================

-- Get public content with basic filtering
-- No encryption required for public data
CREATE VIEW IF NOT EXISTS public_content_view AS
SELECT id, title, content_summary, created_at, updated_at, 
       public_status, view_count, category
FROM memory_content 
WHERE public_status = 'public' 
AND access_level = 1
ORDER BY created_at DESC;

-- Get public metadata without sensitive information
CREATE VIEW IF NOT EXISTS public_metadata_view AS
SELECT id, name, type, description, created_at, 
       public_count, shared_count, category
FROM memory_metadata 
WHERE type IN ('public', 'shared')
ORDER BY created_at DESC;

-- Public search functionality
CREATE PROCEDURE IF NOT EXISTS search_public_content(IN search_term TEXT)
BEGIN
    SELECT id, title, content_summary, created_at, view_count
    FROM memory_content
    WHERE public_status = 'public'
    AND (title LIKE '%' || search_term || '%'
         OR content_summary LIKE '%' || search_term || '%')
    ORDER BY view_count DESC, created_at DESC
    LIMIT 50;
END;

-- Get public categories and counts
CREATE PROCEDURE IF NOT EXISTS get_public_categories()
BEGIN
    SELECT category, COUNT(*) as count
    FROM memory_content
    WHERE public_status = 'public'
    GROUP BY category
    ORDER BY count DESC;
END;

-- =================================================================
-- LEVEL 2: AUTHENTICATED USER QUERIES
-- =================================================================

-- Get user's personal data with encryption handling
CREATE PROCEDURE IF NOT EXISTS get_personal_data(IN user_id INTEGER, IN include_encrypted BOOLEAN)
BEGIN
    SELECT id, title, content_summary, created_at, updated_at,
           CASE WHEN encrypted = 1 AND include_encrypted = 0 
                THEN '[ENCRYPTED DATA]' 
                ELSE content_summary END as display_content,
           public_status, view_count, category, created_by
    FROM memory_content 
    WHERE (user_id = user_id OR created_by = user_id)
    AND (access_level >= 2 OR created_by = user_id)
    ORDER BY updated_at DESC;
END;

-- Get user preferences with encryption handling
CREATE PROCEDURE IF NOT EXISTS get_user_preferences(IN user_id INTEGER)
BEGIN
    SELECT id, key, 
           CASE WHEN encrypted = 1 THEN '[ENCRYPTED]' ELSE value END as display_value,
           encrypted, created_at, updated_at
    FROM user_preferences 
    WHERE user_id = user_id
    ORDER BY key;
END;

-- Update user preference with encryption
CREATE PROCEDURE IF NOT EXISTS update_user_preference(
    IN user_id INTEGER, 
    IN key TEXT, 
    IN value TEXT, 
    IN encrypt_data BOOLEAN
)
BEGIN
    -- Check if preference exists
    SELECT COUNT(*) INTO @pref_count 
    FROM user_preferences 
    WHERE user_id = user_id AND key = key;
    
    IF @pref_count > 0 THEN
        UPDATE user_preferences 
        SET value = CASE WHEN encrypt_data = 1 
                        THEN encrypt(value, :encryption_key) 
                        ELSE value END,
            encrypted = encrypt_data,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = user_id AND key = key;
    ELSE
        INSERT INTO user_preferences (user_id, key, value, encrypted, created_at, updated_at)
        VALUES (user_id, key, 
               CASE WHEN encrypt_data = 1 
                    THEN encrypt(value, :encryption_key) 
                    ELSE value END,
               encrypt_data, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    END IF;
END;

-- Get user's activity history
CREATE PROCEDURE IF NOT EXISTS get_user_activity(IN user_id INTEGER)
BEGIN
    SELECT action_type, target_id, description, timestamp, ip_address
    FROM user_activity_log
    WHERE user_id = user_id
    ORDER BY timestamp DESC
    LIMIT 100;
END;

-- =================================================================
-- LEVEL 3: PRIVILEGED USER QUERIES
-- =================================================================

-- Get shared resources accessible to privileged users
CREATE PROCEDURE IF NOT EXISTS get_shared_resources(IN user_id INTEGER)
BEGIN
    SELECT mc.id, mc.title, mc.content_summary, mc.created_at, 
           mc.created_by, mc.view_count,
           u.username as creator_name,
           sa.access_level as user_access_level
    FROM memory_content mc
    JOIN shared_access sa ON mc.id = sa.content_id
    JOIN users u ON mc.created_by = u.id
    WHERE sa.user_id = user_id
    AND mc.access_level >= 3
    ORDER BY mc.updated_at DESC;
END;

-- Get collaboration groups user belongs to
CREATE PROCEDURE IF NOT EXISTS get_user_groups(IN user_id INTEGER)
BEGIN
    SELECT g.id, g.name, g.description, g.created_at,
           COUNT(gm.member_id) as member_count,
           CASE WHEN gm.role = 'admin' THEN 'Administrator' 
                WHEN gm.role = 'moderator' THEN 'Moderator' 
                ELSE 'Member' END as user_role
    FROM collaboration_groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = user_id
    GROUP BY g.id, g.name, g.description, g.created_at, gm.role
    ORDER BY g.name;
END;

-- Get group members with access levels
CREATE PROCEDURE IF NOT EXISTS get_group_members(IN group_id INTEGER)
BEGIN
    SELECT gm.user_id, u.username, u.email, gm.role, gm.joined_at,
           gm.last_activity
    FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = group_id
    ORDER BY gm.role DESC, gm.joined_at DESC;
END;

-- Grant shared access to content
CREATE PROCEDURE IF NOT EXISTS grant_shared_access(
    IN content_id INTEGER,
    IN user_id INTEGER,
    IN access_level INTEGER,
    IN granted_by INTEGER
)
BEGIN
    -- Check if user already has access
    SELECT COUNT(*) INTO @access_count 
    FROM shared_access 
    WHERE content_id = content_id AND user_id = user_id;
    
    IF @access_count = 0 THEN
        INSERT INTO shared_access (content_id, user_id, access_level, granted_by, granted_at)
        VALUES (content_id, user_id, access_level, granted_by, CURRENT_TIMESTAMP);
        
        -- Log the access grant
        INSERT INTO audit_logs (action_type, target_id, user_id, description, timestamp)
        VALUES ('grant_access', content_id, granted_by, 
               'Granted access to content ' || content_id || ' for user ' || user_id, 
               CURRENT_TIMESTAMP);
    END IF;
END;

-- =================================================================
-- LEVEL 4: ADMINISTRATOR QUERIES
-- =================================================================

-- Get all users with their current status
CREATE PROCEDURE IF NOT EXISTS get_all_users(IN limit_count INTEGER DEFAULT 100)
BEGIN
    SELECT u.id, u.username, u.email, u.role, u.status, 
           u.last_login, u.created_at, u.updated_at,
           COUNT(ua.id) as activity_count,
           MAX(ua.timestamp) as last_activity
    FROM users u
    LEFT JOIN audit_logs ua ON u.id = ua.user_id
    WHERE u.role IN ('user', 'privileged', 'admin')
    GROUP BY u.id, u.username, u.email, u.role, u.status, 
            u.last_login, u.created_at, u.updated_at
    ORDER BY u.last_login DESC
    LIMIT limit_count;
END;

-- Get system configuration
CREATE PROCEDURE IF NOT EXISTS get_system_config(IN category_filter TEXT DEFAULT NULL)
BEGIN
    SELECT id, key, value, description, category, modified_by, modified_at
    FROM system_config
    WHERE category_filter IS NULL OR category = category_filter
    ORDER BY category, key;
END;

-- Update system configuration with validation
CREATE PROCEDURE IF NOT EXISTS update_system_config(
    IN config_key TEXT,
    IN new_value TEXT,
    IN category TEXT,
    IN modified_by INTEGER
)
BEGIN
    -- Validate the configuration change
    IF category = 'security' THEN
        -- Security-related configurations need special validation
        IF config_key = 'session_timeout' THEN
            -- Validate session timeout is reasonable
            IF CAST(new_value AS INTEGER) < 60 OR CAST(new_value AS INTEGER) > 86400 THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid session timeout value';
            END IF;
        END IF;
    END IF;
    
    UPDATE system_config
    SET value = new_value,
        modified_by = modified_by,
        modified_at = CURRENT_TIMESTAMP
    WHERE key = config_key;
    
    -- Log the configuration change
    INSERT INTO audit_logs (action_type, target_id, user_id, description, timestamp)
    VALUES ('config_update', (SELECT id FROM system_config WHERE key = config_key), 
           modified_by, 'Updated config: ' || config_key || ' = ' || new_value, 
           CURRENT_TIMESTAMP);
END;

-- Get audit logs with filtering
CREATE PROCEDURE IF NOT EXISTS get_audit_logs(
    IN start_date DATETIME DEFAULT NULL,
    IN end_date DATETIME DEFAULT NULL,
    IN action_type_filter TEXT DEFAULT NULL,
    IN user_id_filter INTEGER DEFAULT NULL,
    IN limit_count INTEGER DEFAULT 1000
)
BEGIN
    SELECT id, action_type, target_id, user_id, description, 
           ip_address, timestamp, additional_info
    FROM audit_logs
    WHERE (start_date IS NULL OR timestamp >= start_date)
    AND (end_date IS NULL OR timestamp <= end_date)
    AND (action_type_filter IS NULL OR action_type = action_type_filter)
    AND (user_id_filter IS NULL OR user_id = user_id_filter)
    ORDER BY timestamp DESC
    LIMIT limit_count;
END;

-- User management operations
CREATE PROCEDURE IF NOT EXISTS deactivate_user(IN user_id INTEGER, IN deactivated_by INTEGER)
BEGIN
    UPDATE users
    SET status = 'inactive',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = user_id;
    
    -- Log deactivation
    INSERT INTO audit_logs (action_type, target_id, user_id, description, timestamp)
    VALUES ('user_deactivate', user_id, deactivated_by, 
           'Deactivated user ' || user_id, CURRENT_TIMESTAMP);
END;

-- =================================================================
-- LEVEL 5: SUPER ADMINISTRATOR QUERIES
-- =================================================================

-- Get all system data with full access
CREATE PROCEDURE IF NOT EXISTS get_all_memory_content(IN limit_count INTEGER DEFAULT 1000)
BEGIN
    SELECT mc.*, u.username as creator_name,
           COUNT(sa.user_id) as shared_count,
           MAX(sa.granted_at) as last_shared_at
    FROM memory_content mc
    LEFT JOIN users u ON mc.created_by = u.id
    LEFT JOIN shared_access sa ON mc.id = sa.content_id
    WHERE mc.access_level >= 5
    GROUP BY mc.id, mc.title, mc.content, mc.created_by, mc.created_at
    ORDER BY mc.created_at DESC
    LIMIT limit_count;
END;

-- Complete audit log access
CREATE PROCEDURE IF NOT EXISTS get_complete_audit_logs(IN limit_count INTEGER DEFAULT 5000)
BEGIN
    SELECT al.*, u.username as action_user
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.timestamp DESC
    LIMIT limit_count;
END;

-- System health monitoring
CREATE PROCEDURE IF NOT EXISTS get_system_health()
BEGIN
    -- Database statistics
    SELECT 
        'database_stats' as metric_type,
        COUNT(*) as total_records,
        COUNT(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 END) as recent_records,
        MAX(created_at) as last_record,
        MIN(created_at) as first_record
    FROM memory_content
    
    UNION ALL
    
    -- User statistics
    SELECT 
        'user_stats' as metric_type,
        COUNT(*) as total_records,
        COUNT(CASE WHEN last_login >= datetime('now', '-7 days') THEN 1 END) as active_users,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_records,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_records
    FROM users
    
    UNION ALL
    
    -- System performance
    SELECT 
        'performance_stats' as metric_type,
        AVG(query_time) as avg_query_time,
        MAX(query_time) as max_query_time,
        COUNT(*) as total_queries,
        COUNT(CASE WHEN query_time > 1000 THEN 1 END) as slow_queries
    FROM query_performance_log
    WHERE timestamp >= datetime('now', '-1 hour');
END;

-- User activity monitoring
CREATE PROCEDURE IF NOT EXISTS monitor_user_activity(IN days INTEGER DEFAULT 30)
BEGIN
    SELECT 
        u.id, u.username, u.email, u.role,
        COUNT(a.id) as total_actions,
        COUNT(CASE WHEN a.timestamp >= datetime('now', '-7 days') THEN 1 END) as recent_actions,
        MAX(a.timestamp) as last_action,
        COUNT(DISTINCT DATE(a.timestamp)) as active_days,
        GROUP_CONCAT(DISTINCT a.action_type) as action_types
    FROM users u
    LEFT JOIN audit_logs a ON u.id = a.user_id
    WHERE a.timestamp >= datetime('now', '-' || days || ' days')
    GROUP BY u.id, u.username, u.email, u.role
    ORDER BY last_action DESC;
END;

-- Data integrity check
CREATE PROCEDURE IF NOT EXISTS perform_data_integrity_check()
BEGIN
    -- Check orphaned records
    SELECT 'orphaned_content' as check_type, COUNT(*) as issue_count
    FROM memory_content mc
    LEFT JOIN users u ON mc.created_by = u.id
    WHERE u.id IS NULL
    
    UNION ALL
    
    -- Check inconsistent access levels
    SELECT 'inconsistent_access' as check_type, COUNT(*) as issue_count
    FROM memory_content mc
    WHERE mc.access_level < 1 OR mc.access_level > 5
    
    UNION ALL
    
    -- Check expired shared access
    SELECT 'expired_shared_access' as check_type, COUNT(*) as issue_count
    FROM shared_access sa
    WHERE sa.granted_at < datetime('now', '-90 days')
    AND sa.access_level < 5;
END;

-- =================================================================
-- SECURITY AND ENCRYPTION HELPERS
-- =================================================================

-- Encryption function (placeholder - implement with actual encryption)
CREATE FUNCTION IF NOT EXISTS encrypt(data TEXT, key TEXT) RETURNS TEXT
BEGIN
    -- Implement actual encryption logic here
    -- This is a placeholder that returns encrypted data
    RETURN '[ENCRYPTED:' || data || ']';
END;

-- Decryption function (placeholder - implement with actual decryption)
CREATE FUNCTION IF NOT EXISTS decrypt(encrypted_data TEXT, key TEXT) RETURNS TEXT
BEGIN
    -- Implement actual decryption logic here
    -- This is a placeholder that returns decrypted data
    RETURN SUBSTR(encrypted_data, 12, LENGTH(encrypted_data) - 13);
END;

-- Access validation function
CREATE FUNCTION IF NOT EXISTS validate_access(user_id INTEGER, content_id INTEGER, required_level INTEGER) RETURNS BOOLEAN
BEGIN
    DECLARE user_level INTEGER;
    DECLARE content_level INTEGER;
    DECLARE is_owner BOOLEAN;
    
    -- Get user's access level
    SELECT role INTO user_level FROM users WHERE id = user_id;
    
    -- Get content's access level
    SELECT access_level INTO content_level FROM memory_content WHERE id = content_id;
    
    -- Check if user is the owner
    SELECT (created_by = user_id) INTO is_owner FROM memory_content WHERE id = content_id;
    
    -- Grant access if user has sufficient level or is the owner
    RETURN (user_level >= required_level OR is_owner) AND content_level >= required_level;
END;

-- =================================================================
-- INDEXES FOR PERFORMANCE
-- =================================================================

-- Create indexes for ACL queries
CREATE INDEX IF NOT EXISTS idx_memory_content_access_level ON memory_content(access_level);
CREATE INDEX IF NOT EXISTS idx_memory_content_public_status ON memory_content(public_status);
CREATE INDEX IF NOT EXISTS idx_memory_content_user_id ON memory_content(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_content_created_by ON memory_content(created_by);
CREATE INDEX IF NOT EXISTS idx_memory_content_created_at ON memory_content(created_at);

CREATE INDEX IF NOT EXISTS idx_shared_access_content_id ON shared_access(content_id);
CREATE INDEX IF NOT EXISTS idx_shared_access_user_id ON shared_access(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_access_access_level ON shared_access(access_level);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);