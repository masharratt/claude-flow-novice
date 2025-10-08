#!/usr/bin/env node

/**
 * Enterprise Authentication & Authorization Service
 * Provides enterprise-grade security for department coordinators and agents
 * Supports role-based access control, token management, and security auditing
 */

import EventEmitter from 'events';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnterpriseAuth extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      tokenExpiration: config.tokenExpiration || 3600000, // 1 hour
      refreshTokenExpiration: config.refreshTokenExpiration || 86400000, // 24 hours
      maxFailedAttempts: config.maxFailedAttempts || 5,
      lockoutDuration: config.lockoutDuration || 900000, // 15 minutes
      sessionTimeout: config.sessionTimeout || 1800000, // 30 minutes
      passwordMinLength: config.passwordMinLength || 12,
      auditLogPath: config.auditLogPath || './logs/auth-audit.log',
      enableMFA: config.enableMFA !== false,
      encryptionKeyPath: config.encryptionKeyPath || './keys/encryption.key',
      ...config
    };

    // User and session storage
    this.users = new Map(); // userId -> user data
    this.sessions = new Map(); // sessionId -> session data
    this.tokens = new Map(); // tokenId -> token data
    this.departmentCoordinators = new Map(); // departmentId -> coordinator auth data
    this.agentCredentials = new Map(); // agentId -> credentials

    // Security tracking
    this.failedAttempts = new Map(); // userId -> failed login attempts
    this.lockedAccounts = new Map(); // userId -> lockout info
    this.auditLog = [];
    this.securityEvents = [];

    // Role definitions with enterprise-grade permissions
    this.roles = {
      'super-admin': {
        name: 'Super Administrator',
        permissions: [
          'system:*', // All system permissions
          'department:*', // All department management
          'agent:*', // All agent management
          'resource:*', // All resource management
          'security:*', // All security operations
          'audit:*' // All audit operations
        ],
        level: 10
      },
      'department-admin': {
        name: 'Department Administrator',
        permissions: [
          'department:read',
          'department:manage',
          'agent:create',
          'agent:read',
          'agent:update',
          'agent:delete',
          'resource:allocate',
          'resource:read',
          'task:assign',
          'task:read',
          'task:update'
        ],
        level: 7
      },
      'department-coordinator': {
        name: 'Department Coordinator',
        permissions: [
          'department:read',
          'agent:create',
          'agent:read',
          'agent:update',
          'resource:allocate',
          'resource:read',
          'task:assign',
          'task:read',
          'task:update'
        ],
        level: 6
      },
      'agent-supervisor': {
        name: 'Agent Supervisor',
        permissions: [
          'agent:read',
          'agent:update',
          'task:read',
          'task:update',
          'resource:read'
        ],
        level: 4
      },
      'agent': {
        name: 'Agent',
        permissions: [
          'agent:self',
          'task:self',
          'resource:self'
        ],
        level: 2
      },
      'auditor': {
        name: 'Auditor',
        permissions: [
          'audit:read',
          'system:read',
          'department:read',
          'agent:read',
          'task:read',
          'resource:read'
        ],
        level: 5
      },
      'readonly': {
        name: 'Read Only',
        permissions: [
          'system:read',
          'department:read',
          'agent:read',
          'task:read',
          'resource:read'
        ],
        level: 1
      }
    };

    // Department-specific permission sets
    this.departmentPermissions = {
      'engineering': ['code-analysis', 'system-design', 'deployment', 'infrastructure'],
      'marketing': ['content-creation', 'campaign-management', 'analytics', 'brand-management'],
      'sales': ['customer-data', 'crm-access', 'lead-management', 'communication'],
      'finance': ['financial-data', 'budgeting', 'reporting', 'compliance'],
      'hr': ['employee-data', 'recruitment', 'performance-management', 'benefits'],
      'operations': ['process-control', 'logistics', 'quality-control', 'supply-chain'],
      'research': ['research-data', 'experimental-tools', 'innovation', 'prototyping'],
      'legal': ['legal-documents', 'compliance', 'risk-management', 'contract-management'],
      'it': ['system-administration', 'security-tools', 'infrastructure', 'monitoring'],
      'analytics': ['data-access', 'analytics-tools', 'reporting', 'business-intelligence']
    };

    this.state = 'initializing';
    this.startTime = Date.now();
    this.encryptionKey = null;

    this.metrics = {
      totalAuthAttempts: 0,
      successfulAuths: 0,
      failedAuths: 0,
      activeSessions: 0,
      lockedAccounts: 0,
      securityEvents: 0
    };
  }

  async initialize() {
    console.log('🔐 Initializing Enterprise Authentication Service...');

    try {
      // Initialize encryption
      await this.initializeEncryption();

      // Create directories
      await this.ensureDirectories();

      // Setup default users and coordinators
      await this.setupDefaultUsers();

      // Load existing data if available
      await this.loadExistingData();

      // Start security monitoring
      this.startSecurityMonitoring();

      this.state = 'active';
      console.log('✅ Enterprise Authentication Service initialized and active');

      this.emit('initialized', {
        timestamp: Date.now(),
        roles: Object.keys(this.roles).length,
        departments: Object.keys(this.departmentPermissions).length
      });

    } catch (error) {
      console.error('❌ Failed to initialize Authentication Service:', error);
      this.state = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  async initializeEncryption() {
    try {
      // Try to load existing encryption key
      const keyExists = await fs.access(this.config.encryptionKeyPath).then(() => true).catch(() => false);

      if (keyExists) {
        const keyData = await fs.readFile(this.config.encryptionKeyPath, 'utf8');
        this.encryptionKey = Buffer.from(keyData, 'base64');
      } else {
        // Generate new encryption key
        this.encryptionKey = crypto.randomBytes(32);
        await fs.writeFile(this.config.encryptionKeyPath, this.encryptionKey.toString('base64'));
      }

      console.log('🔑 Encryption initialized');
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
      throw error;
    }
  }

  async ensureDirectories() {
    const directories = [
      path.dirname(this.config.auditLogPath),
      path.dirname(this.config.encryptionKeyPath)
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        console.error(`Failed to create directory ${dir}:`, error);
      }
    }
  }

  async setupDefaultUsers() {
    // Setup default super admin
    const superAdmin = {
      id: 'admin',
      username: 'admin',
      email: 'admin@enterprise.local',
      role: 'super-admin',
      department: 'system',
      isActive: true,
      createdAt: Date.now(),
      lastLogin: null,
      passwordHash: await this.hashPassword('admin123!@#'), // Default password - change in production
      mfaEnabled: false,
      permissions: this.roles['super-admin'].permissions
    };

    this.users.set('admin', superAdmin);

    // Setup department coordinators
    const departmentCoordinatorDefaults = {
      'engineering': {
        username: 'eng-coordinator',
        email: 'eng-coordinator@enterprise.local',
        password: 'EngCoord123!@#'
      },
      'marketing': {
        username: 'mkt-coordinator',
        email: 'mkt-coordinator@enterprise.local',
        password: 'MktCoord123!@#'
      },
      'sales': {
        username: 'sales-coordinator',
        email: 'sales-coordinator@enterprise.local',
        password: 'SalesCoord123!@#'
      },
      'finance': {
        username: 'finance-coordinator',
        email: 'finance-coordinator@enterprise.local',
        password: 'FinanceCoord123!@#'
      },
      'hr': {
        username: 'hr-coordinator',
        email: 'hr-coordinator@enterprise.local',
        password: 'HrCoord123!@#'
      },
      'operations': {
        username: 'ops-coordinator',
        email: 'ops-coordinator@enterprise.local',
        password: 'OpsCoord123!@#'
      },
      'research': {
        username: 'research-coordinator',
        email: 'research-coordinator@enterprise.local',
        password: 'ResearchCoord123!@#'
      },
      'legal': {
        username: 'legal-coordinator',
        email: 'legal-coordinator@enterprise.local',
        password: 'LegalCoord123!@#'
      },
      'it': {
        username: 'it-coordinator',
        email: 'it-coordinator@enterprise.local',
        password: 'ItCoord123!@#'
      },
      'analytics': {
        username: 'analytics-coordinator',
        email: 'analytics-coordinator@enterprise.local',
        password: 'AnalyticsCoord123!@#'
      }
    };

    for (const [deptId, config] of Object.entries(departmentCoordinatorDefaults)) {
      const coordinator = {
        id: `${deptId}-coordinator`,
        username: config.username,
        email: config.email,
        role: 'department-coordinator',
        department: deptId,
        isActive: true,
        createdAt: Date.now(),
        lastLogin: null,
        passwordHash: await this.hashPassword(config.password),
        mfaEnabled: false,
        permissions: [
          ...this.roles['department-coordinator'].permissions,
          ...this.departmentPermissions[deptId]
        ]
      };

      this.users.set(coordinator.id, coordinator);
      this.departmentCoordinators.set(deptId, coordinator);
    }

    console.log(`👥 Created ${Object.keys(departmentCoordinatorDefaults).length + 1} default users`);
  }

  async loadExistingData() {
    // In a real implementation, this would load from a database
    // For now, we'll use in-memory storage
    console.log('📂 Using in-memory storage (implement database persistence for production)');
  }

  startSecurityMonitoring() {
    // Periodic security checks
    setInterval(() => {
      this.checkSecurityThreats();
      this.cleanupExpiredSessions();
      this.updateMetrics();
    }, 60000); // Every minute

    // Audit log persistence
    setInterval(() => {
      this.persistAuditLog();
    }, 300000); // Every 5 minutes
  }

  async authenticate(username, password, context = {}) {
    this.metrics.totalAuthAttempts++;

    const auditEvent = {
      timestamp: Date.now(),
      type: 'authentication_attempt',
      username,
      ip: context.ip || 'unknown',
      userAgent: context.userAgent || 'unknown',
      success: false
    };

    try {
      // Check if account is locked
      const isLocked = await this.isAccountLocked(username);
      if (isLocked) {
        auditEvent.reason = 'account_locked';
        this.logSecurityEvent('account_locked', { username, ip: context.ip });
        return { success: false, error: 'Account is locked' };
      }

      // Find user
      const user = this.findUserByUsername(username);
      if (!user) {
        auditEvent.reason = 'user_not_found';
        this.recordFailedAttempt(username);
        return { success: false, error: 'Invalid credentials' };
      }

      // Check if user is active
      if (!user.isActive) {
        auditEvent.reason = 'account_inactive';
        return { success: false, error: 'Account is inactive' };
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        auditEvent.reason = 'invalid_password';
        this.recordFailedAttempt(username);
        return { success: false, error: 'Invalid credentials' };
      }

      // Clear failed attempts
      this.clearFailedAttempts(username);

      // Generate tokens
      const tokens = await this.generateTokens(user);

      // Create session
      const session = await this.createSession(user, tokens, context);

      // Update user last login
      user.lastLogin = Date.now();

      auditEvent.success = true;
      auditEvent.userId = user.id;
      auditEvent.role = user.role;

      this.metrics.successfulAuths++;

      console.log(`✅ Successful authentication: ${username} (${user.role})`);
      this.emit('user_authenticated', { userId: user.id, username, role: user.role });

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          department: user.department,
          permissions: user.permissions
        },
        tokens,
        sessionId: session.id
      };

    } catch (error) {
      auditEvent.reason = 'system_error';
      auditEvent.error = error.message;
      this.metrics.failedAuths++;
      console.error('Authentication error:', error);
      return { success: false, error: 'Authentication failed' };
    } finally {
      this.addAuditEvent(auditEvent);
    }
  }

  async authenticateDepartmentCoordinator(departmentId, credentials, context = {}) {
    const auditEvent = {
      timestamp: Date.now(),
      type: 'department_auth_attempt',
      departmentId,
      ip: context.ip || 'unknown',
      success: false
    };

    try {
      const coordinator = this.departmentCoordinators.get(departmentId);
      if (!coordinator) {
        auditEvent.reason = 'department_not_found';
        return { success: false, error: 'Department not found' };
      }

      // Authenticate using the standard authentication flow
      const authResult = await this.authenticate(
        coordinator.username,
        credentials.password || credentials,
        context
      );

      if (!authResult.success) {
        auditEvent.reason = 'invalid_credentials';
        return authResult;
      }

      // Add department-specific permissions
      const departmentPerms = this.departmentPermissions[departmentId] || [];
      authResult.user.permissions = [
        ...new Set([...authResult.user.permissions, ...departmentPerms])
      ];

      auditEvent.success = true;
      auditEvent.coordinatorId = coordinator.id;

      console.log(`✅ Department coordinator authenticated: ${departmentId}`);
      this.emit('department_coordinator_authenticated', { departmentId, coordinatorId: coordinator.id });

      return {
        ...authResult,
        permissions: authResult.user.permissions,
        departmentCapabilities: this.getDepartmentCapabilities(departmentId)
      };

    } catch (error) {
      auditEvent.reason = 'system_error';
      auditEvent.error = error.message;
      console.error('Department authentication error:', error);
      return { success: false, error: 'Department authentication failed' };
    } finally {
      this.addAuditEvent(auditEvent);
    }
  }

  async authenticateAgent(agentId, credentials, context = {}) {
    const auditEvent = {
      timestamp: Date.now(),
      type: 'agent_auth_attempt',
      agentId,
      ip: context.ip || 'unknown',
      success: false
    };

    try {
      // For agents, we use a simpler token-based authentication
      const expectedToken = this.generateAgentToken(agentId, credentials.departmentId);

      if (credentials.token !== expectedToken) {
        auditEvent.reason = 'invalid_token';
        return { success: false, error: 'Invalid agent credentials' };
      }

      // Get agent permissions based on department and type
      const agentPermissions = this.getAgentPermissions(credentials.departmentId, credentials.type);

      auditEvent.success = true;

      console.log(`✅ Agent authenticated: ${agentId} (${credentials.departmentId})`);
      this.emit('agent_authenticated', { agentId, departmentId: credentials.departmentId });

      return {
        success: true,
        agentId,
        departmentId: credentials.departmentId,
        type: credentials.type,
        permissions: agentPermissions,
        token: expectedToken
      };

    } catch (error) {
      auditEvent.reason = 'system_error';
      auditEvent.error = error.message;
      console.error('Agent authentication error:', error);
      return { success: false, error: 'Agent authentication failed' };
    } finally {
      this.addAuditEvent(auditEvent);
    }
  }

  async generateTokens(user) {
    const tokenId = crypto.randomBytes(16).toString('hex');
    const refreshTokenId = crypto.randomBytes(16).toString('hex');

    const accessToken = this.generateJWT({
      sub: user.id,
      username: user.username,
      role: user.role,
      department: user.department,
      permissions: user.permissions,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (this.config.tokenExpiration / 1000)
    });

    const refreshToken = this.generateJWT({
      sub: user.id,
      type: 'refresh',
      tokenId: refreshTokenId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (this.config.refreshTokenExpiration / 1000)
    });

    // Store token info
    this.tokens.set(tokenId, {
      userId: user.id,
      type: 'access',
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.tokenExpiration
    });

    this.tokens.set(refreshTokenId, {
      userId: user.id,
      type: 'refresh',
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.refreshTokenExpiration
    });

    return {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + this.config.tokenExpiration
    };
  }

  generateJWT(payload) {
    // Simple JWT implementation for demo
    // In production, use a proper JWT library
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const signature = crypto
      .createHmac('sha256', this.encryptionKey)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  async createSession(user, tokens, context) {
    const sessionId = crypto.randomBytes(32).toString('hex');

    const session = {
      id: sessionId,
      userId: user.id,
      username: user.username,
      role: user.role,
      department: user.department,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      expiresAt: Date.now() + this.config.sessionTimeout,
      ip: context.ip || 'unknown',
      userAgent: context.userAgent || 'unknown',
      isActive: true
    };

    this.sessions.set(sessionId, session);
    this.metrics.activeSessions++;

    return session;
  }

  async validateToken(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const [header, payload, signature] = parts;

      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', this.encryptionKey)
        .update(`${header}.${payload}`)
        .digest('base64url');

      if (signature !== expectedSignature) {
        return null;
      }

      // Decode payload
      const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString());

      // Check expiration
      if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return decodedPayload;
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  }

  async hasPermission(userId, permission) {
    const user = this.users.get(userId);
    if (!user) {
      return false;
    }

    // Super admin has all permissions
    if (user.role === 'super-admin') {
      return true;
    }

    // Check for wildcard permissions
    const hasWildcard = user.permissions.some(p => {
      if (p.endsWith(':*')) {
        const prefix = p.slice(0, -1);
        return permission.startsWith(prefix);
      }
      return false;
    });

    if (hasWildcard) {
      return true;
    }

    // Check exact permission match
    return user.permissions.includes(permission);
  }

  async checkAgentAllocationPermission(coordinatorId, agentSpec) {
    const coordinator = this.users.get(coordinatorId);
    if (!coordinator) {
      return false;
    }

    // Check if coordinator can allocate agents to the specified department
    if (agentSpec.departmentId && agentSpec.departmentId !== coordinator.department) {
      // Only super-admins can allocate to other departments
      return coordinator.role === 'super-admin';
    }

    // Check resource allocation permission
    return await this.hasPermission(coordinatorId, 'resource:allocate');
  }

  generateAgentToken(agentId, departmentId) {
    const payload = {
      sub: agentId,
      departmentId,
      type: 'agent',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    return this.generateJWT(payload);
  }

  getAgentPermissions(departmentId, agentType) {
    const basePermissions = [
      'agent:self',
      'task:self',
      'resource:self'
    ];

    const departmentPerms = this.departmentPermissions[departmentId] || [];

    // Add agent type specific permissions
    const typePermissions = {
      'development': ['code-analysis', 'system-design', 'testing'],
      'analysis': ['data-access', 'analytics-tools', 'reporting'],
      'creative': ['content-creation', 'design-tools', 'media-access'],
      'research': ['research-tools', 'data-analysis', 'experimental-access'],
      'coordination': ['task-management', 'team-communication', 'resource-monitoring']
    };

    return [
      ...basePermissions,
      ...departmentPerms,
      ...(typePermissions[agentType] || [])
    ];
  }

  getDepartmentCapabilities(departmentId) {
    return {
      maxAgents: this.getDepartmentMaxAgents(departmentId),
      availableResources: this.getDepartmentResources(departmentId),
      specializations: this.departmentPermissions[departmentId] || [],
      scalingEnabled: this.isDepartmentScalingEnabled(departmentId)
    };
  }

  getDepartmentMaxAgents(departmentId) {
    const maxAgents = {
      'engineering': 100,
      'marketing': 60,
      'sales': 80,
      'finance': 40,
      'hr': 30,
      'operations': 70,
      'research': 50,
      'legal': 25,
      'it': 60,
      'analytics': 45
    };

    return maxAgents[departmentId] || 50;
  }

  getDepartmentResources(departmentId) {
    const resources = {
      'engineering': ['compute', 'memory', 'storage', 'network', 'database'],
      'marketing': ['compute', 'storage', 'network', 'analytics', 'communication'],
      'sales': ['network', 'crm-access', 'communication'],
      'finance': ['database', 'secure-storage', 'compliance-tools'],
      'hr': ['database', 'document-storage', 'communication'],
      'operations': ['compute', 'network', 'workflow-engines'],
      'research': ['compute', 'storage', 'analytics-tools', 'experimental-tools'],
      'legal': ['secure-storage', 'document-management', 'compliance-tools'],
      'it': ['infrastructure-access', 'monitoring', 'security-tools'],
      'analytics': ['compute', 'data-warehouse', 'analytics-tools']
    };

    return resources[departmentId] || ['compute', 'memory'];
  }

  isDepartmentScalingEnabled(departmentId) {
    const scalingDepts = ['engineering', 'marketing', 'operations', 'research', 'it', 'analytics'];
    return scalingDepts.includes(departmentId);
  }

  findUserByUsername(username) {
    for (const user of this.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return null;
  }

  async hashPassword(password) {
    return crypto.pbkdf2Sync(password, 'salt', 10000, 64, 'sha512').toString('hex');
  }

  async verifyPassword(password, hash) {
    const hashVerify = crypto.pbkdf2Sync(password, 'salt', 10000, 64, 'sha512').toString('hex');
    return hash === hashVerify;
  }

  async isAccountLocked(username) {
    const lockInfo = this.lockedAccounts.get(username);
    if (!lockInfo) {
      return false;
    }

    if (Date.now() > lockInfo.expiresAt) {
      this.lockedAccounts.delete(username);
      return false;
    }

    return true;
  }

  recordFailedAttempt(username) {
    const attempts = (this.failedAttempts.get(username) || 0) + 1;
    this.failedAttempts.set(username, attempts);

    if (attempts >= this.config.maxFailedAttempts) {
      this.lockedAccounts.set(username, {
        attempts,
        lockedAt: Date.now(),
        expiresAt: Date.now() + this.config.lockoutDuration
      });

      this.metrics.lockedAccounts++;
      this.logSecurityEvent('account_locked', { username, attempts });
    }

    this.metrics.failedAuths++;
  }

  clearFailedAttempts(username) {
    this.failedAttempts.delete(username);
  }

  logSecurityEvent(eventType, details) {
    const event = {
      timestamp: Date.now(),
      type: eventType,
      details,
      severity: this.getEventSeverity(eventType)
    };

    this.securityEvents.push(event);
    this.metrics.securityEvents++;

    // Keep only last 1000 events
    if (this.securityEvents.length > 1000) {
      this.securityEvents = this.securityEvents.slice(-1000);
    }

    this.emit('security_event', event);
  }

  getEventSeverity(eventType) {
    const severityMap = {
      'account_locked': 'high',
      'brute_force_detected': 'critical',
      'unauthorized_access': 'high',
      'suspicious_activity': 'medium',
      'password_change': 'low',
      'mfa_enabled': 'info'
    };

    return severityMap[eventType] || 'medium';
  }

  addAuditEvent(event) {
    this.auditLog.push(event);

    // Keep only last 10000 events
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }
  }

  async persistAuditLog() {
    try {
      const logData = this.auditLog.map(event => JSON.stringify(event)).join('\n');
      await fs.writeFile(this.config.auditLogPath, logData);
    } catch (error) {
      console.error('Failed to persist audit log:', error);
    }
  }

  checkSecurityThreats() {
    // Check for brute force attacks
    const recentFailures = this.auditLog.filter(event =>
      event.type === 'authentication_attempt' &&
      !event.success &&
      Date.now() - event.timestamp < 300000 // Last 5 minutes
    );

    const failuresByIP = {};
    for (const failure of recentFailures) {
      const ip = failure.ip;
      failuresByIP[ip] = (failuresByIP[ip] || 0) + 1;
    }

    for (const [ip, count] of Object.entries(failuresByIP)) {
      if (count >= 10) {
        this.logSecurityEvent('brute_force_detected', { ip, attempts: count });
      }
    }

    // Check for unusual login patterns
    const successfulLogins = this.auditLog.filter(event =>
      event.type === 'authentication_attempt' &&
      event.success &&
      Date.now() - event.timestamp < 3600000 // Last hour
    );

    const loginsByUser = {};
    for (const login of successfulLogins) {
      const userId = login.userId;
      loginsByUser[userId] = (loginsByUser[userId] || 0) + 1;
    }

    for (const [userId, count] of Object.entries(loginsByUser)) {
      if (count >= 5) {
        this.logSecurityEvent('suspicious_activity', {
          type: 'multiple_logins',
          userId,
          attempts: count
        });
      }
    }
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    // Clean expired tokens
    for (const [tokenId, token] of this.tokens) {
      if (now > token.expiresAt) {
        this.tokens.delete(tokenId);
      }
    }

    if (cleanedCount > 0) {
      this.metrics.activeSessions = this.sessions.size;
      console.log(`🧹 Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  updateMetrics() {
    this.metrics.activeSessions = this.sessions.size;
    this.metrics.lockedAccounts = this.lockedAccounts.size;
  }

  async refreshToken(refreshToken) {
    try {
      const payload = await this.validateToken(refreshToken);
      if (!payload || payload.type !== 'refresh') {
        return { success: false, error: 'Invalid refresh token' };
      }

      const user = this.users.get(payload.sub);
      if (!user || !user.isActive) {
        return { success: false, error: 'User not found or inactive' };
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      // Invalidate old refresh token
      for (const [tokenId, token] of this.tokens) {
        if (token.type === 'refresh' && tokenId === payload.tokenId) {
          this.tokens.delete(tokenId);
          break;
        }
      }

      this.addAuditEvent({
        timestamp: Date.now(),
        type: 'token_refresh',
        userId: user.id,
        success: true
      });

      return { success: true, tokens };

    } catch (error) {
      console.error('Token refresh error:', error);
      return { success: false, error: 'Token refresh failed' };
    }
  }

  async logout(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Remove session
    this.sessions.delete(sessionId);
    this.metrics.activeSessions--;

    // Invalidate tokens
    for (const [tokenId, token] of this.tokens) {
      if (token.userId === session.userId) {
        this.tokens.delete(tokenId);
      }
    }

    this.addAuditEvent({
      timestamp: Date.now(),
      type: 'logout',
      userId: session.userId,
      sessionId,
      success: true
    });

    console.log(`👋 User logged out: ${session.username}`);
    return { success: true };
  }

  getStatus() {
    return {
      state: this.state,
      uptime: Date.now() - this.startTime,
      metrics: this.metrics,
      users: this.users.size,
      sessions: this.sessions.size,
      tokens: this.tokens.size,
      departmentCoordinators: this.departmentCoordinators.size,
      securityEvents: this.securityEvents.length
    };
  }

  async shutdown() {
    console.log('🔄 Shutting down Authentication Service...');

    this.state = 'shutting_down';

    // Persist audit log
    await this.persistAuditLog();

    // Clear all sessions
    this.sessions.clear();
    this.tokens.clear();

    this.state = 'shutdown';
    console.log('✅ Authentication Service shutdown complete');

    this.emit('shutdown');
  }
}

export { EnterpriseAuth };

// CLI interface for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const authService = new EnterpriseAuth({
    tokenExpiration: 300000, // 5 minutes for testing
    enableMFA: false
  });

  authService.initialize().then(() => {
    console.log('🔐 Authentication Service running in test mode...');

    // Test authentication
    setTimeout(async () => {
      console.log('\n🧪 Testing authentication...');

      // Test department coordinator login
      const deptAuth = await authService.authenticateDepartmentCoordinator(
        'engineering',
        { password: 'EngCoord123!@#' },
        { ip: '127.0.0.1', userAgent: 'test-client' }
      );

      console.log('Department auth result:', deptAuth);

      if (deptAuth.success) {
        // Test token validation
        const tokenValidation = await authService.validateToken(deptAuth.tokens.accessToken);
        console.log('Token validation:', tokenValidation ? '✅ Valid' : '❌ Invalid');

        // Test permission check
        const hasPermission = await authService.hasPermission(deptAuth.user.id, 'agent:create');
        console.log('Permission check (agent:create):', hasPermission ? '✅ Granted' : '❌ Denied');
      }

      // Test agent authentication
      const agentAuth = await authService.authenticateAgent(
        'test-agent-1',
        {
          departmentId: 'engineering',
          type: 'development',
          token: authService.generateAgentToken('test-agent-1', 'engineering')
        }
      );

      console.log('Agent auth result:', agentAuth);
    }, 2000);

    // Shutdown after 15 seconds
    setTimeout(() => {
      authService.shutdown();
      process.exit(0);
    }, 15000);

  }).catch(error => {
    console.error('Failed to start Authentication Service:', error);
    process.exit(1);
  });
}