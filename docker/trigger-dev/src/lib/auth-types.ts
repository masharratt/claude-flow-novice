/**
 * RuVector Security: Authentication and Authorization Types
 *
 * P0.3 Critical Security Fix: RBAC (Role-Based Access Control)
 *
 * @module auth-types
 */

/**
 * User roles for RBAC
 */
export enum Role {
  /** Full system access */
  ADMIN = 'ADMIN',

  /** Can create/update/delete collections and data */
  OPERATOR = 'OPERATOR',

  /** Read-only access to collections and data */
  VIEWER = 'VIEWER',
}

/**
 * Operations that can be performed on RuVector collections
 */
export enum Operation {
  /** Read collection metadata or data */
  READ = 'READ',

  /** Insert new data into collections */
  WRITE = 'WRITE',

  /** Delete data or collections */
  DELETE = 'DELETE',

  /** Create/update/delete collections */
  MANAGE_COLLECTIONS = 'MANAGE_COLLECTIONS',

  /** View audit logs */
  VIEW_AUDIT = 'VIEW_AUDIT',

  /** Manage encryption keys and backups */
  MANAGE_SECURITY = 'MANAGE_SECURITY',
}

/**
 * Authentication method used
 */
export enum AuthMethod {
  /** API key (Bearer token) */
  API_KEY = 'API_KEY',

  /** JWT token from Trigger.dev or external issuer */
  JWT = 'JWT',

  /** Internal service-to-service authentication */
  SERVICE = 'SERVICE',

  /** No authentication (local development only) */
  NONE = 'NONE',
}

/**
 * Authenticated user/service context
 */
export interface AuthContext {
  /** Unique identifier (user ID or service name) */
  id: string;

  /** Display name or service label */
  name: string;

  /** Assigned role */
  role: Role;

  /** Authentication method used */
  method: AuthMethod;

  /** Metadata (optional claims from JWT, API key metadata, etc.) */
  metadata?: Record<string, unknown>;

  /** Timestamp when authentication occurred */
  authenticatedAt: Date;

  /** Token expiration (if applicable) */
  expiresAt?: Date;
}

/**
 * API key structure
 */
export interface ApiKey {
  /** API key ID (for revocation) */
  id: string;

  /** Hashed API key (stored, never plaintext) */
  keyHash: string;

  /** Assigned role */
  role: Role;

  /** Key description/purpose */
  description: string;

  /** Key owner/creator */
  createdBy: string;

  /** Creation timestamp */
  createdAt: Date;

  /** Last used timestamp */
  lastUsedAt?: Date;

  /** Key expiration (optional) */
  expiresAt?: Date;

  /** Whether key is active */
  active: boolean;
}

/**
 * JWT token payload (standard claims)
 */
export interface JWTPayload {
  /** Subject (user ID) */
  sub: string;

  /** Issuer (auth provider) */
  iss: string;

  /** Audience (intended recipient) */
  aud: string;

  /** Issued at (Unix timestamp) */
  iat: number;

  /** Expiration (Unix timestamp) */
  exp: number;

  /** User role (custom claim) */
  role?: string;

  /** Additional claims */
  [key: string]: unknown;
}

/**
 * Permission matrix: Role → Operations
 */
export const ROLE_PERMISSIONS: Record<Role, Operation[]> = {
  [Role.ADMIN]: [
    Operation.READ,
    Operation.WRITE,
    Operation.DELETE,
    Operation.MANAGE_COLLECTIONS,
    Operation.VIEW_AUDIT,
    Operation.MANAGE_SECURITY,
  ],
  [Role.OPERATOR]: [
    Operation.READ,
    Operation.WRITE,
    Operation.DELETE,
    Operation.MANAGE_COLLECTIONS,
  ],
  [Role.VIEWER]: [
    Operation.READ,
  ],
};

/**
 * Audit log entry for authentication events
 */
export interface AuthAuditEntry {
  /** Unique entry ID */
  id: string;

  /** Timestamp */
  timestamp: Date;

  /** Event type (login, logout, access_denied, etc.) */
  event: string;

  /** Authenticated user/service ID */
  userId?: string;

  /** Role used */
  role?: Role;

  /** Operation attempted */
  operation?: Operation;

  /** Resource accessed (collection name, etc.) */
  resource?: string;

  /** Success/failure */
  success: boolean;

  /** IP address or source */
  source?: string;

  /** Error message (if failed) */
  error?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Authentication error types
 */
export class AuthenticationError extends Error {
  constructor(message: string, public readonly method?: AuthMethod) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly role?: Role,
    public readonly operation?: Operation
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class InvalidTokenError extends Error {
  constructor(message: string, public readonly reason?: string) {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

export class ExpiredTokenError extends Error {
  constructor(message: string, public readonly expiredAt?: Date) {
    super(message);
    this.name = 'ExpiredTokenError';
  }
}
