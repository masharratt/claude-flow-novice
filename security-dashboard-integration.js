/**
 * Security Dashboard Integration for Redis Transparency Enhancement
 * 
 * Phase 4 - React Frontend Engineer Integration Support
 * Security Specialist Implementation
 * 
 * Provides secure API endpoints and data structures for security dashboard visualization
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { SecurityAnomalyDetector } = require('./security-anomaly-detector');

class SecurityDashboardIntegration {
  constructor(config = {}) {
    this.config = {
      port: config.port || 3001,
      jwtSecret: config.jwtSecret || process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      rateLimitWindow: 15 * 60 * 1000, // 15 minutes
      rateLimitMax: 100, // 100 requests per window
      ...config
    };
    
    // Initialize Express app with security middleware
    this.app = express();
    this.setupSecurityMiddleware();
    
    // Initialize security detector
    this.securityDetector = new SecurityAnomalyDetector(config.security);
    
    // Setup routes
    this.setupRoutes();
    
    // User roles and permissions
    this.userRoles = {
      SECURITY_ADMIN: ['read', 'write', 'delete', 'admin', 'escalate'],
      SECURITY_ANALYST: ['read', 'write', 'investigate'],
      VIEWER: ['read'],
      SYSTEM_ADMIN: ['read', 'write', 'admin']
    };
    
    // Start server
    this.startServer();
  }

  /**
   * Setup security middleware
   */
  setupSecurityMiddleware() {
    // Helmet for security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimitWindow,
      max: this.config.rateLimitMax,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Body parser with size limits
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // CORS configuration
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Authentication routes
    this.app.post('/api/auth/login', this.handleLogin.bind(this));
    this.app.post('/api/auth/logout', this.authenticateToken, this.handleLogout.bind(this));
    this.app.post('/api/auth/refresh', this.handleTokenRefresh.bind(this));

    // Security dashboard routes
    this.app.get('/api/security/status', this.authenticateToken, this.getSecurityStatus.bind(this));
    this.app.get('/api/security/anomalies', this.authenticateToken, this.getSecurityAnomalies.bind(this));
    this.app.get('/api/security/alerts', this.authenticateToken, this.getSecurityAlerts.bind(this));
    this.app.get('/api/security/metrics', this.authenticateToken, this.getSecurityMetrics.bind(this));
    this.app.get('/api/security/trends', this.authenticateToken, this.getSecurityTrends.bind(this));
    this.app.get('/api/security/agents/:agentId/behavior', this.authenticateToken, this.getAgentBehavior.bind(this));

    // Alert management routes
    this.app.post('/api/security/alerts/:alertId/acknowledge', this.authenticateToken, this.acknowledgeAlert.bind(this));
    this.app.post('/api/security/alerts/:alertId/resolve', this.authenticateToken, this.resolveAlert.bind(this));
    this.app.post('/api/security/alerts/:alertId/escalate', this.authenticateToken, this.escalateAlert.bind(this));

    // Security event logging
    this.app.post('/api/security/events', this.authenticateToken, this.logSecurityEvent.bind(this));
    this.app.get('/api/security/events', this.authenticateToken, this.getSecurityEvents.bind(this));

    // Agent collaboration tracking
    this.app.get('/api/security/collaboration', this.authenticateToken, this.getCollaborationSecurity.bind(this));
    this.app.post('/api/security/collaboration/:agentId/update', this.authenticateToken, this.updateCollaborationSecurity.bind(this));

    // Historical analysis
    this.app.get('/api/security/historical', this.authenticateToken, this.getHistoricalAnalysis.bind(this));
    this.app.get('/api/security/compliance', this.authenticateToken, this.getComplianceStatus.bind(this));

    // Health check
    this.app.get('/api/health', this.getHealthStatus.bind(this));

    // Error handling
    this.app.use(this.handleErrors.bind(this));
  }

  /**
   * Authentication middleware
   */
  authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, this.config.jwtSecret, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
      req.user = user;
      next();
    });
  }

  /**
   * Role-based authorization middleware
   */
  authorizeRole(requiredPermissions) {
    return (req, res, next) => {
      const userRole = req.user.role;
      const userPermissions = this.userRoles[userRole] || [];
      
      const hasPermission = requiredPermissions.every(permission => 
        userPermissions.includes(permission)
      );

      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: requiredPermissions,
          userRole,
          userPermissions
        });
      }

      next();
    };
  }

  /**
   * Handle user login
   */
  async handleLogin(req, res) {
    try {
      const { username, password } = req.body;

      // Validate credentials (in production, use proper authentication)
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      // Mock user authentication (replace with real authentication)
      const user = await this.authenticateUser(username, password);
      if (!user) {
        // Log failed authentication attempt
        this.securityDetector.recordSecurityEvent({
          type: 'AUTHENTICATION_FAILURE',
          source: req.ip,
          data: { username, timestamp: Date.now() }
        });
        
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          username: user.username, 
          role: user.role 
        },
        this.config.jwtSecret,
        { expiresIn: '1h' }
      );

      // Log successful authentication
      this.securityDetector.recordSecurityEvent({
        type: 'AUTHENTICATION_SUCCESS',
        userId: user.id,
        source: req.ip,
        data: { timestamp: Date.now() }
      });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: this.userRoles[user.role]
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Handle user logout
   */
  async handleLogout(req, res) {
    try {
      // Log logout event
      this.securityDetector.recordSecurityEvent({
        type: 'LOGOUT',
        userId: req.user.userId,
        source: req.ip,
        data: { timestamp: Date.now() }
      });

      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get security status for dashboard
   */
  async getSecurityStatus(req, res) {
    try {
      const status = this.securityDetector.getSecurityStatus();
      
      // Add user-specific data filtering
      const filteredStatus = this.filterDataForRole(status, req.user.role);
      
      res.json(filteredStatus);
    } catch (error) {
      console.error('Error getting security status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get security anomalies
   */
  async getSecurityAnomalies(req, res) {
    try {
      const { limit = 50, offset = 0, severity, type } = req.query;
      
      let anomalies = this.securityDetector.securityState.anomalies;
      
      // Filter by severity
      if (severity) {
        anomalies = anomalies.filter(a => a.severity === severity.toUpperCase());
      }
      
      // Filter by type
      if (type) {
        anomalies = anomalies.filter(a => a.type === type);
      }
      
      // Sort by timestamp (most recent first)
      anomalies.sort((a, b) => b.timestamp - a.timestamp);
      
      // Apply pagination
      const paginatedAnomalies = anomalies.slice(
        parseInt(offset), 
        parseInt(offset) + parseInt(limit)
      );
      
      // Filter data for user role
      const filteredAnomalies = paginatedAnomalies.map(anomaly => 
        this.filterDataForRole(anomaly, req.user.role)
      );
      
      res.json({
        anomalies: filteredAnomalies,
        total: anomalies.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
    } catch (error) {
      console.error('Error getting security anomalies:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get security alerts
   */
  async getSecurityAlerts(req, res) {
    try {
      const { limit = 20, offset = 0, resolved = false } = req.query;
      
      let alerts = this.securityDetector.securityState.alerts;
      
      // Filter by resolved status
      const isResolved = resolved === 'true';
      alerts = alerts.filter(a => a.resolved === isResolved);
      
      // Sort by creation time (most recent first)
      alerts.sort((a, b) => b.createdAt - a.createdAt);
      
      // Apply pagination
      const paginatedAlerts = alerts.slice(
        parseInt(offset), 
        parseInt(offset) + parseInt(limit)
      );
      
      // Filter data for user role
      const filteredAlerts = paginatedAlerts.map(alert => 
        this.filterDataForRole(alert, req.user.role)
      );
      
      res.json({
        alerts: filteredAlerts,
        total: alerts.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
    } catch (error) {
      console.error('Error getting security alerts:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get security metrics for dashboard
   */
  async getSecurityMetrics(req, res) {
    try {
      const { timeRange = '24h' } = req.query;
      
      const now = Date.now();
      let timeRangeMs;
      
      switch (timeRange) {
        case '1h':
          timeRangeMs = 60 * 60 * 1000;
          break;
        case '24h':
          timeRangeMs = 24 * 60 * 60 * 1000;
          break;
        case '7d':
          timeRangeMs = 7 * 24 * 60 * 60 * 1000;
          break;
        case '30d':
          timeRangeMs = 30 * 24 * 60 * 60 * 1000;
          break;
        default:
          timeRangeMs = 24 * 60 * 60 * 1000;
      }
      
      const startTime = now - timeRangeMs;
      
      // Get metrics from security detector
      const anomalies = this.securityDetector.securityState.anomalies.filter(
        a => a.timestamp > startTime
      );
      
      const alerts = this.securityDetector.securityState.alerts.filter(
        a => a.createdAt > startTime
      );
      
      const events = this.securityDetector.securityState.securityEvents.filter(
        e => e.timestamp > startTime
      );
      
      // Calculate metrics
      const metrics = {
        timeRange,
        timestamp: now,
        securityScore: this.securityDetector.calculateSecurityScore(),
        anomalyMetrics: {
          total: anomalies.length,
          bySeverity: this.groupBySeverity(anomalies),
          byType: this.groupByType(anomalies),
          trend: this.calculateTrend(anomalies, timeRangeMs)
        },
        alertMetrics: {
          total: alerts.length,
          active: alerts.filter(a => !a.resolved).length,
          resolved: alerts.filter(a => a.resolved).length,
          bySeverity: this.groupBySeverity(alerts),
          averageResolutionTime: this.calculateAverageResolutionTime(alerts)
        },
        eventMetrics: {
          total: events.length,
          byType: this.groupByType(events),
          rate: events.length / (timeRangeMs / (60 * 60 * 1000)) // events per hour
        }
      };
      
      // Filter data for user role
      const filteredMetrics = this.filterDataForRole(metrics, req.user.role);
      
      res.json(filteredMetrics);
      
    } catch (error) {
      console.error('Error getting security metrics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get security trends
   */
  async getSecurityTrends(req, res) {
    try {
      const { timeRange = '7d', granularity = '1h' } = req.query;
      
      const trends = this.calculateSecurityTrends(timeRange, granularity);
      
      // Filter data for user role
      const filteredTrends = this.filterDataForRole(trends, req.user.role);
      
      res.json(filteredTrends);
      
    } catch (error) {
      console.error('Error getting security trends:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get agent behavior data
   */
  async getAgentBehavior(req, res) {
    try {
      const { agentId } = req.params;
      
      const behavior = this.securityDetector.getAgentBehavior(agentId);
      
      if (!behavior) {
        return res.status(404).json({ error: 'Agent behavior data not found' });
      }
      
      // Filter data for user role
      const filteredBehavior = this.filterDataForRole(behavior, req.user.role);
      
      res.json(filteredBehavior);
      
    } catch (error) {
      console.error('Error getting agent behavior:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Acknowledge security alert
   */
  async acknowledgeAlert(req, res) {
    try {
      const { alertId } = req.params;
      
      this.securityDetector.alertManager.acknowledgeAlert(alertId);
      
      // Log acknowledgment
      this.securityDetector.recordSecurityEvent({
        type: 'ALERT_ACKNOWLEDGED',
        userId: req.user.userId,
        data: { alertId, timestamp: Date.now() }
      });
      
      res.json({ message: 'Alert acknowledged successfully' });
      
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Resolve security alert
   */
  async resolveAlert(req, res) {
    try {
      const { alertId } = req.params;
      const { resolution } = req.body;
      
      this.securityDetector.alertManager.resolveAlert(alertId);
      
      // Log resolution
      this.securityDetector.recordSecurityEvent({
        type: 'ALERT_RESOLVED',
        userId: req.user.userId,
        data: { alertId, resolution, timestamp: Date.now() }
      });
      
      res.json({ message: 'Alert resolved successfully' });
      
    } catch (error) {
      console.error('Error resolving alert:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Escalate security alert
   */
  async escalateAlert(req, res) {
    try {
      const { alertId } = req.params;
      const { reason, escalationLevel } = req.body;
      
      // Check escalation permissions
      if (!this.userRoles[req.user.role].includes('escalate')) {
        return res.status(403).json({ error: 'Insufficient permissions to escalate alerts' });
      }
      
      // Find and update alert
      const alert = this.securityDetector.securityState.alerts.find(a => a.id === alertId);
      if (alert) {
        alert.escalated = true;
        alert.escalatedAt = Date.now();
        alert.escalatedBy = req.user.userId;
        alert.escalationReason = reason;
        alert.escalationLevel = escalationLevel || 'HIGH';
      }
      
      // Log escalation
      this.securityDetector.recordSecurityEvent({
        type: 'ALERT_ESCALATED',
        userId: req.user.userId,
        data: { alertId, reason, escalationLevel, timestamp: Date.now() }
      });
      
      res.json({ message: 'Alert escalated successfully' });
      
    } catch (error) {
      console.error('Error escalating alert:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get collaboration security data
   */
  async getCollaborationSecurity(req, res) {
    try {
      const collaborationData = {
        timestamp: Date.now(),
        agentInteractions: this.securityDetector.securityState.collaborationPatterns,
        securityMetrics: {
          totalInteractions: Object.keys(this.securityDetector.securityState.collaborationPatterns).length,
          suspiciousActivities: Object.values(this.securityDetector.securityState.collaborationPatterns)
            .filter(p => p.unusualActivity).length,
          lastAnalysis: this.securityDetector.securityState.lastHistoricalAnalysis?.timestamp
        }
      };
      
      // Filter data for user role
      const filteredData = this.filterDataForRole(collaborationData, req.user.role);
      
      res.json(filteredData);
      
    } catch (error) {
      console.error('Error getting collaboration security:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get health status
   */
  async getHealthStatus(req, res) {
    try {
      const health = {
        status: 'healthy',
        timestamp: Date.now(),
        services: {
          securityDetector: 'operational',
          alertManager: 'operational',
          database: 'operational'
        },
        metrics: {
          securityScore: this.securityDetector.calculateSecurityScore(),
          activeAlerts: this.securityDetector.securityState.alerts.filter(a => !a.resolved).length,
          recentAnomalies: this.securityDetector.securityState.anomalies.filter(
            a => Date.now() - a.timestamp < 60 * 60 * 1000
          ).length
        }
      };
      
      res.json(health);
      
    } catch (error) {
      console.error('Error getting health status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Mock user authentication (replace with real implementation)
   */
  async authenticateUser(username, password) {
    // Mock user database
    const users = {
      'admin': { id: 1, username: 'admin', password: 'admin123', role: 'SECURITY_ADMIN' },
      'analyst': { id: 2, username: 'analyst', password: 'analyst123', role: 'SECURITY_ANALYST' },
      'viewer': { id: 3, username: 'viewer', password: 'viewer123', role: 'VIEWER' }
    };
    
    const user = users[username];
    if (user && user.password === password) {
      return { id: user.id, username: user.username, role: user.role };
    }
    
    return null;
  }

  /**
   * Filter data based on user role
   */
  filterDataForRole(data, role) {
    const permissions = this.userRoles[role] || [];
    
    // Remove sensitive data for viewers
    if (role === 'VIEWER') {
      if (data.data) {
        // Remove detailed data for viewers
        return {
          ...data,
          data: data.data ? 'REDACTED' : undefined
        };
      }
    }
    
    return data;
  }

  /**
   * Group items by severity
   */
  groupBySeverity(items) {
    return items.reduce((acc, item) => {
      const severity = item.severity || 'UNKNOWN';
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Group items by type
   */
  groupByType(items) {
    return items.reduce((acc, item) => {
      const type = item.type || 'UNKNOWN';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Calculate trend data
   */
  calculateTrend(items, timeRangeMs) {
    const timeSlots = 24; // 24 time slots
    const slotDuration = timeRangeMs / timeSlots;
    const now = Date.now();
    
    const trend = Array(timeSlots).fill(0);
    
    items.forEach(item => {
      const slotIndex = Math.floor((now - item.timestamp) / slotDuration);
      if (slotIndex >= 0 && slotIndex < timeSlots) {
        trend[timeSlots - 1 - slotIndex]++;
      }
    });
    
    return trend;
  }

  /**
   * Calculate average resolution time
   */
  calculateAverageResolutionTime(alerts) {
    const resolvedAlerts = alerts.filter(a => a.resolved && a.resolvedAt);
    
    if (resolvedAlerts.length === 0) return 0;
    
    const totalTime = resolvedAlerts.reduce((sum, alert) => {
      return sum + (alert.resolvedAt - alert.createdAt);
    }, 0);
    
    return totalTime / resolvedAlerts.length;
  }

  /**
   * Calculate security trends
   */
  calculateSecurityTrends(timeRange, granularity) {
    // Implementation for trend calculation
    return {
      timeRange,
      granularity,
      data: [],
      timestamp: Date.now()
    };
  }

  /**
   * Handle errors
   */
  handleErrors(error, req, res, next) {
    console.error('Unhandled error:', error);
    
    // Log security event for errors
    this.securityDetector.recordSecurityEvent({
      type: 'SYSTEM_ERROR',
      data: { 
        error: error.message, 
        stack: error.stack,
        url: req.url,
        method: req.method,
        timestamp: Date.now()
      }
    });
    
    res.status(500).json({ error: 'Internal server error' });
  }

  /**
   * Start the server
   */
  startServer() {
    this.app.listen(this.config.port, () => {
      console.log(`Security Dashboard API server running on port ${this.config.port}`);
      console.log(`Security monitoring active with anomaly detection`);
    });
  }
}

module.exports = SecurityDashboardIntegration;