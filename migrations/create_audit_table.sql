/**
 * Migration: Create Audit Logging Table
 *
 * Creates PostgreSQL table for storing audit logs with:
 * - Complete audit entry information
 * - Tamper-evident checksums
 * - Efficient querying with indexes
 * - Retention and archival support
 *
 * Security: Ensures all sensitive operations can be audited and investigated
 * Compliance: Supports OWASP A09 (Security Logging & Monitoring)
 */

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  -- Unique identifier
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timestamp information
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Event classification
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('READ', 'WRITE', 'DELETE', 'AUTH', 'CONFIG', 'ERROR')),

  -- Actor (who performed the action)
  actor_id VARCHAR(255) NOT NULL,
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('user', 'service', 'system')),
  actor_role VARCHAR(255) NOT NULL,

  -- Resource (what was affected)
  collection VARCHAR(255) NOT NULL,
  document_id VARCHAR(255),
  operation_count INTEGER,

  -- Action details
  action VARCHAR(500) NOT NULL,
  result VARCHAR(20) NOT NULL CHECK (result IN ('SUCCESS', 'FAILURE')),
  error_message TEXT,

  -- Request context
  ip_address INET,
  user_agent TEXT,

  -- Additional structured data
  metadata JSONB,

  -- Tamper detection (checksums)
  checksum VARCHAR(64),
  previous_checksum VARCHAR(64),

  -- Archival tracking
  archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
  ON audit_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id
  ON audit_logs(actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_collection
  ON audit_logs(collection);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type
  ON audit_logs(event_type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_result
  ON audit_logs(result);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_collection_time
  ON audit_logs(actor_id, collection, timestamp DESC);

-- Index for tamper detection checks
CREATE INDEX IF NOT EXISTS idx_audit_logs_checksum
  ON audit_logs(checksum);

-- Partial index for errors (performance optimization)
CREATE INDEX IF NOT EXISTS idx_audit_logs_errors
  ON audit_logs(timestamp DESC)
  WHERE result = 'FAILURE';

-- Partial index for unarchived logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_active
  ON audit_logs(timestamp DESC)
  WHERE archived = FALSE;

-- Create actor_permissions table for access control
CREATE TABLE IF NOT EXISTS actor_permissions (
  -- Unique identifier
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Actor information
  actor_id VARCHAR(255) NOT NULL,

  -- Resource and permission
  collection VARCHAR(255) NOT NULL,
  permission VARCHAR(20) NOT NULL CHECK (permission IN ('READ', 'WRITE', 'DELETE', 'ADMIN')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Ensure uniqueness
  UNIQUE(actor_id, collection, permission)
);

-- Create indexes for actor_permissions
CREATE INDEX IF NOT EXISTS idx_actor_permissions_actor_id
  ON actor_permissions(actor_id);

CREATE INDEX IF NOT EXISTS idx_actor_permissions_collection
  ON actor_permissions(collection);

CREATE INDEX IF NOT EXISTS idx_actor_permissions_permission
  ON actor_permissions(permission);

-- Composite index for permission lookups
CREATE INDEX IF NOT EXISTS idx_actor_permissions_actor_collection
  ON actor_permissions(actor_id, collection);

-- Create role_hierarchy table for RBAC
CREATE TABLE IF NOT EXISTS role_hierarchy (
  -- Unique identifier
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Role names
  role_name VARCHAR(255) NOT NULL UNIQUE,

  -- Role level (for hierarchy)
  role_level INTEGER NOT NULL,

  -- Description
  description TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for role_hierarchy
CREATE INDEX IF NOT EXISTS idx_role_hierarchy_name
  ON role_hierarchy(role_name);

CREATE INDEX IF NOT EXISTS idx_role_hierarchy_level
  ON role_hierarchy(role_level);

-- Create audit_archive table for long-term storage
CREATE TABLE IF NOT EXISTS audit_archive (
  -- Unique identifier
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to original audit log
  original_audit_id UUID NOT NULL,

  -- Archived content (compressed JSON)
  archived_data BYTEA NOT NULL,
  compression_algorithm VARCHAR(50),

  -- Archive location
  s3_bucket VARCHAR(255),
  s3_key VARCHAR(1024),

  -- Timestamps
  archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for audit_archive
CREATE INDEX IF NOT EXISTS idx_audit_archive_original_id
  ON audit_archive(original_audit_id);

CREATE INDEX IF NOT EXISTS idx_audit_archive_archived_at
  ON audit_archive(archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_archive_expires_at
  ON audit_archive(expires_at)
  WHERE expires_at IS NOT NULL;

-- Create function to update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for actor_permissions
CREATE TRIGGER update_actor_permissions_updated_at
  BEFORE UPDATE ON actor_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for role_hierarchy
CREATE TRIGGER update_role_hierarchy_updated_at
  BEFORE UPDATE ON role_hierarchy
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to verify audit log checksum chain
CREATE OR REPLACE FUNCTION verify_audit_checksum(audit_id UUID)
RETURNS TABLE(valid BOOLEAN, reason VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN a.checksum IS NULL THEN true
      WHEN a.checksum = p.checksum THEN false  -- Checksum mismatch
      ELSE true
    END as valid,
    CASE
      WHEN a.checksum IS NULL THEN 'No checksum stored'::VARCHAR
      WHEN a.checksum != p.checksum THEN 'Checksum chain broken'::VARCHAR
      ELSE 'Checksum valid'::VARCHAR
    END as reason
  FROM audit_logs a
  LEFT JOIN audit_logs p ON a.previous_checksum = p.checksum
  WHERE a.id = audit_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to find suspicious access patterns
CREATE OR REPLACE FUNCTION find_suspicious_patterns(
  collection_name VARCHAR,
  time_window_minutes INTEGER DEFAULT 60,
  threshold_count INTEGER DEFAULT 10
)
RETURNS TABLE(
  actor_id VARCHAR,
  access_count BIGINT,
  failure_count BIGINT,
  event_types TEXT,
  risk_level VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.actor_id,
    COUNT(*)::BIGINT as access_count,
    SUM(CASE WHEN al.result = 'FAILURE' THEN 1 ELSE 0 END)::BIGINT as failure_count,
    STRING_AGG(DISTINCT al.event_type, ', ' ORDER BY al.event_type) as event_types,
    CASE
      WHEN COUNT(*) > threshold_count AND SUM(CASE WHEN al.result = 'FAILURE' THEN 1 ELSE 0 END) > (COUNT(*) / 2)
        THEN 'HIGH'::VARCHAR
      WHEN COUNT(*) > threshold_count THEN 'MEDIUM'::VARCHAR
      ELSE 'LOW'::VARCHAR
    END as risk_level
  FROM audit_logs al
  WHERE
    al.collection = collection_name
    AND al.timestamp > CURRENT_TIMESTAMP - (time_window_minutes || ' minutes')::INTERVAL
  GROUP BY al.actor_id
  HAVING COUNT(*) > 0
  ORDER BY access_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to audit log retention enforcement
CREATE OR REPLACE FUNCTION enforce_audit_retention(retention_days INTEGER DEFAULT 90)
RETURNS TABLE(
  deleted_count BIGINT,
  archived_count BIGINT
) AS $$
DECLARE
  cutoff_date TIMESTAMP WITH TIME ZONE;
  del_count BIGINT;
  arch_count BIGINT;
BEGIN
  cutoff_date := CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL;

  -- Archive old logs
  WITH archived_logs AS (
    INSERT INTO audit_archive (original_audit_id, archived_data, archived_at)
    SELECT
      id,
      convert_to(row_to_json(audit_logs.*)::TEXT, 'UTF8'),
      CURRENT_TIMESTAMP
    FROM audit_logs
    WHERE timestamp < cutoff_date AND archived = FALSE
    RETURNING id
  )
  UPDATE audit_logs SET archived = TRUE, archived_at = CURRENT_TIMESTAMP
  WHERE id IN (SELECT id FROM archived_logs);

  GET DIAGNOSTICS arch_count = ROW_COUNT;

  -- Delete very old logs (after archival)
  DELETE FROM audit_logs
  WHERE timestamp < (CURRENT_TIMESTAMP - ((retention_days + 30) || ' days')::INTERVAL);

  GET DIAGNOSTICS del_count = ROW_COUNT;

  RETURN QUERY SELECT del_count, arch_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions to application role (adjust role name as needed)
-- GRANT SELECT, INSERT, UPDATE ON audit_logs TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON actor_permissions TO app_user;
-- GRANT SELECT, INSERT ON audit_archive TO app_user;
-- GRANT EXECUTE ON FUNCTION verify_audit_checksum TO app_user;
-- GRANT EXECUTE ON FUNCTION find_suspicious_patterns TO app_user;
-- GRANT EXECUTE ON FUNCTION enforce_audit_retention TO app_user;

-- Add comment documentation
COMMENT ON TABLE audit_logs IS 'Primary audit log table for security event tracking and investigation';
COMMENT ON TABLE actor_permissions IS 'Collection-level access control permissions for actors (users/services)';
COMMENT ON TABLE role_hierarchy IS 'Role definitions and hierarchy for RBAC';
COMMENT ON TABLE audit_archive IS 'Long-term archive storage for old audit logs';
COMMENT ON COLUMN audit_logs.checksum IS 'SHA-256 hash for tamper detection (part of checksum chain)';
COMMENT ON COLUMN audit_logs.previous_checksum IS 'Hash of previous audit entry (forms tamper-evident chain)';
