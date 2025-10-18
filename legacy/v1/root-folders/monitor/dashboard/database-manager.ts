/**
 * Database Manager for Secure Dashboard
 * Provides persistent storage for users, sessions, and security events
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

// Database interfaces
interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'viewer' | 'operator';
  permissions: string[];
  lastLogin?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface Session {
  id: string;
  userId: string;
  expires: Date;
  createdAt: Date;
  lastAccess: Date;
  ipAddress: string;
  userAgent: string;
}

interface SecurityEvent {
  id: string;
  timestamp: Date;
  event: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ip: string;
  userAgent?: string;
  details: string;
  userId?: string;
}

interface RateLimitRecord {
  id: string;
  key: string;
  count: number;
  windowStart: Date;
  windowEnd: Date;
  blocked: boolean;
}

class DatabaseManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || this.getDefaultDatabasePath();
    this.initializeDatabase();
  }

  private getDefaultDatabasePath(): string {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'dashboard.db');
  }

  private initializeDatabase() {
    try {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      // Create tables
      this.createTables();

      // Create indexes for performance
      this.createIndexes();

      // Initialize default admin user
      this.initializeDefaultAdmin();

      console.log('🗄️ Database initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw error;
    }
  }

  private createTables() {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'viewer', 'operator')),
        permissions TEXT NOT NULL,
        last_login DATETIME,
        login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_access DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Security events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS security_events (
        id TEXT PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        event TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        ip TEXT NOT NULL,
        user_agent TEXT,
        details TEXT,
        user_id TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // Rate limiting table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        count INTEGER DEFAULT 0,
        window_start DATETIME NOT NULL,
        window_end DATETIME NOT NULL,
        blocked BOOLEAN DEFAULT FALSE
      )
    `);

    // User preferences table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        theme TEXT DEFAULT 'dark',
        notifications BOOLEAN DEFAULT TRUE,
        refresh_interval INTEGER DEFAULT 1000,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
  }

  private createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires)',
      'CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON security_events(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_security_events_event ON security_events(event)',
      'CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity)',
      'CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key)',
      'CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start, window_end)'
    ];

    indexes.forEach(sql => this.db.exec(sql));
  }

  private initializeDefaultAdmin() {
    const existingAdmin = this.db.prepare('SELECT id FROM users WHERE username = ?').get('admin');

    if (!existingAdmin) {
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || this.generateSecurePassword();
      const passwordHash = bcrypt.hashSync(defaultPassword, 12);
      const adminId = crypto.randomUUID();

      this.db.prepare(`
        INSERT INTO users (id, username, password_hash, role, permissions)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        adminId,
        'admin',
        passwordHash,
        'admin',
        JSON.stringify(['read', 'write', 'admin', 'benchmark', 'system', 'users'])
      );

      // Log the default password for initial setup
      if (!process.env.DEFAULT_ADMIN_PASSWORD) {
        console.log('🔐 DEFAULT ADMIN CREDENTIALS:');
        console.log(`Username: admin`);
        console.log(`Password: ${defaultPassword}`);
        console.log('⚠️  Change this password immediately after first login!');
      }
    }
  }

  private generateSecurePassword(): string {
    return crypto.randomBytes(16).toString('hex') + crypto.randomBytes(8).toString('hex').toUpperCase();
  }

  // User management
  createUser(username: string, password: string, role: 'admin' | 'viewer' | 'operator' = 'viewer'): User {
    const existingUser = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const passwordHash = bcrypt.hashSync(password, 12);
    const userId = crypto.randomUUID();
    const permissions = this.getRolePermissions(role);

    this.db.prepare(`
      INSERT INTO users (id, username, password_hash, role, permissions)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, username, passwordHash, role, JSON.stringify(permissions));

    return this.getUserById(userId)!;
  }

  getUserByUsername(username: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!row) return null;

    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role,
      permissions: JSON.parse(row.permissions),
      lastLogin: row.last_login ? new Date(row.last_login) : undefined,
      loginAttempts: row.login_attempts,
      lockedUntil: row.locked_until ? new Date(row.locked_until) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  getUserById(userId: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!row) return null;

    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role,
      permissions: JSON.parse(row.permissions),
      lastLogin: row.last_login ? new Date(row.last_login) : undefined,
      loginAttempts: row.login_attempts,
      lockedUntil: row.locked_until ? new Date(row.locked_until) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  getAllUsers(): User[] {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at').all() as any[];
    return rows.map(row => ({
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role,
      permissions: JSON.parse(row.permissions),
      lastLogin: row.last_login ? new Date(row.last_login) : undefined,
      loginAttempts: row.login_attempts,
      lockedUntil: row.locked_until ? new Date(row.locked_until) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  updateUserLoginAttempts(username: string, attempts: number): void {
    this.db.prepare(`
      UPDATE users SET login_attempts = ?, updated_at = CURRENT_TIMESTAMP
      WHERE username = ?
    `).run(attempts, username);
  }

  lockUser(username: string, lockDuration: number): void {
    const lockedUntil = new Date(Date.now() + lockDuration);
    this.db.prepare(`
      UPDATE users SET locked_until = ?, updated_at = CURRENT_TIMESTAMP
      WHERE username = ?
    `).run(lockedUntil.toISOString(), username);
  }

  updateUserLastLogin(userId: string): void {
    this.db.prepare(`
      UPDATE users SET last_login = CURRENT_TIMESTAMP, login_attempts = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId);
  }

  deleteUser(userId: string): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  private getRolePermissions(role: string): string[] {
    const permissions = {
      admin: ['read', 'write', 'admin', 'benchmark', 'system', 'users'],
      operator: ['read', 'write', 'benchmark'],
      viewer: ['read']
    };
    return permissions[role as keyof typeof permissions] || [];
  }

  // Session management
  createSession(userId: string, expires: Date, ipAddress: string, userAgent: string): string {
    const sessionId = crypto.randomUUID();

    this.db.prepare(`
      INSERT INTO sessions (id, user_id, expires, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, userId, expires.toISOString(), ipAddress, userAgent);

    return sessionId;
  }

  getSession(sessionId: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      expires: new Date(row.expires),
      createdAt: new Date(row.created_at),
      lastAccess: new Date(row.last_access),
      ipAddress: row.ip_address,
      userAgent: row.user_agent
    };
  }

  updateSessionAccess(sessionId: string): void {
    this.db.prepare(`
      UPDATE sessions SET last_access = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(sessionId);
  }

  deleteSession(sessionId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  deleteExpiredSessions(): number {
    const result = this.db.prepare('DELETE FROM sessions WHERE expires < CURRENT_TIMESTAMP').run();
    return result.changes;
  }

  getUserSessions(userId: string): Session[] {
    const rows = this.db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      expires: new Date(row.expires),
      createdAt: new Date(row.created_at),
      lastAccess: new Date(row.last_access),
      ipAddress: row.ip_address,
      userAgent: row.user_agent
    }));
  }

  // Security events
  logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high' | 'critical', ip: string, details: any, userId?: string): void {
    const eventId = crypto.randomUUID();

    this.db.prepare(`
      INSERT INTO security_events (id, event, severity, ip, details, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(eventId, event, severity, ip, JSON.stringify(details), userId || null);
  }

  getSecurityEvents(limit: number = 100, offset: number = 0): SecurityEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM security_events
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    return rows.map(row => ({
      id: row.id,
      timestamp: new Date(row.timestamp),
      event: row.event,
      severity: row.severity,
      ip: row.ip,
      userAgent: row.user_agent,
      details: row.details,
      userId: row.user_id
    }));
  }

  getSecurityEventsBySeverity(severity: 'low' | 'medium' | 'high' | 'critical', limit: number = 50): SecurityEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM security_events
      WHERE severity = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(severity, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      timestamp: new Date(row.timestamp),
      event: row.event,
      severity: row.severity,
      ip: row.ip,
      userAgent: row.user_agent,
      details: row.details,
      userId: row.user_id
    }));
  }

  // Rate limiting
  checkRateLimit(key: string, windowMs: number, maxRequests: number): { allowed: boolean; remaining: number; resetTime: Date } {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);
    const windowEnd = now;

    // Clean old records
    this.db.prepare('DELETE FROM rate_limits WHERE window_end < ?').run(windowStart.toISOString());

    // Get existing record
    const existing = this.db.prepare('SELECT * FROM rate_limits WHERE key = ?').get(key) as any;

    if (existing) {
      const recordWindowStart = new Date(existing.window_start);
      const recordWindowEnd = new Date(existing.window_end);

      // Check if we're in the same window
      if (recordWindowStart <= now && now <= recordWindowEnd) {
        const remaining = Math.max(0, maxRequests - existing.count);
        const allowed = existing.count < maxRequests && !existing.blocked;

        return {
          allowed,
          remaining,
          resetTime: recordWindowEnd
        };
      }
    }

    // Create new record
    const resetTime = new Date(now.getTime() + windowMs);
    this.db.prepare(`
      INSERT OR REPLACE INTO rate_limits (id, key, count, window_start, window_end, blocked)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), key, 1, windowStart.toISOString(), resetTime.toISOString(), false);

    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime
    };
  }

  incrementRateLimit(key: string): void {
    this.db.prepare(`
      UPDATE rate_limits SET count = count + 1
      WHERE key = ?
    `).run(key);
  }

  blockRateLimit(key: string, duration: number): void {
    const blockedUntil = new Date(Date.now() + duration);
    this.db.prepare(`
      UPDATE rate_limits SET blocked = true, window_end = ?
      WHERE key = ?
    `).run(blockedUntil.toISOString(), key);
  }

  // Cleanup
  cleanup(): void {
    const expiredSessions = this.deleteExpiredSessions();
    const oldEvents = this.cleanupOldSecurityEvents();
    const oldRateLimits = this.cleanupOldRateLimits();

    console.log(`🧹 Database cleanup: ${expiredSessions} sessions, ${oldEvents} events, ${oldRateLimits} rate limits removed`);
  }

  private cleanupOldSecurityEvents(daysToKeep: number = 30): number {
    const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000));
    const result = this.db.prepare('DELETE FROM security_events WHERE timestamp < ?').run(cutoffDate.toISOString());
    return result.changes;
  }

  private cleanupOldRateLimits(): number {
    const now = new Date();
    const result = this.db.prepare('DELETE FROM rate_limits WHERE window_end < ?').run(now.toISOString());
    return result.changes;
  }

  // Statistics
  getDatabaseStats(): any {
    const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
    const sessionCount = this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as any;
    const eventCount = this.db.prepare('SELECT COUNT(*) as count FROM security_events').get() as any;
    const rateLimitCount = this.db.prepare('SELECT COUNT(*) as count FROM rate_limits').get() as any;

    const recentEvents = this.db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM security_events
      WHERE timestamp > datetime('now', '-24 hours')
      GROUP BY severity
    `).all() as any[];

    return {
      users: userCount.count,
      sessions: sessionCount.count,
      securityEvents: eventCount.count,
      rateLimits: rateLimitCount.count,
      recentEvents: recentEvents.reduce((acc, event) => {
        acc[event.severity] = event.count;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  // Backup and restore
  backup(backupPath: string): void {
    try {
      const backup = new Database(backupPath);
      this.db.backup(backup).then(() => {
        backup.close();
        console.log(`✅ Database backed up to: ${backupPath}`);
      });
    } catch (error) {
      console.error('❌ Backup failed:', error);
      throw error;
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      console.log('🔐 Database connection closed');
    }
  }
}

export { DatabaseManager, User, Session, SecurityEvent, RateLimitRecord };