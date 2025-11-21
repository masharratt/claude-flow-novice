const { verifyToken, extractTokenFromRequest } = require('./auth');
const logger = require('../logger');

/**
 * Middleware to authenticate requests using JWT tokens
 * @param {Object} options - Authentication options
 * @returns {Function} - Express middleware function
 */
const authenticateRequest = (options = {}) => {
  const {
    required = true,
    roles = [],
    permissions = [],
    skipPaths = [],
    skipMethods = ['OPTIONS']
  } = options;

  return (req, res, next) => {
    try {
      // Skip authentication for certain paths
      if (skipPaths.some(path => req.path.startsWith(path))) {
        return next();
      }

      // Skip authentication for certain methods
      if (skipMethods.includes(req.method)) {
        return next();
      }

      const token = extractTokenFromRequest(req);

      if (!token) {
        if (required) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'No token provided',
            requestId: req.requestId
          });
        }
        return next();
      }

      const decoded = verifyToken(token);
      req.user = decoded;
      req.auth = {
        tokenId: decoded.tokenId,
        type: decoded.type,
        issuedAt: decoded.iat,
        expiresAt: decoded.exp
      };

      // Check role requirements
      if (roles.length > 0) {
        const userRoles = decoded.roles || [];
        const hasRequiredRole = roles.some(role => userRoles.includes(role));
        
        if (!hasRequiredRole) {
          return res.status(403).json({
            error: 'Insufficient privileges',
            message: 'Required role not found',
            requiredRoles: roles,
            userRoles,
            requestId: req.requestId
          });
        }
      }

      // Check permission requirements
      if (permissions.length > 0) {
        const userPermissions = decoded.permissions || [];
        const hasRequiredPermission = permissions.some(permission => 
          userPermissions.includes(permission)
        );
        
        if (!hasRequiredPermission) {
          return res.status(403).json({
            error: 'Insufficient privileges',
            message: 'Required permission not found',
            requiredPermissions: permissions,
            userPermissions,
            requestId: req.requestId
          });
        }
      }

      // Log successful authentication
      logger.info('Request authenticated successfully', {
        requestId: req.requestId,
        userId: decoded.sub,
        email: decoded.email,
        roles: decoded.roles,
        path: req.path,
        method: req.method
      });

      next();
    } catch (error) {
      logger.warn('Authentication failed', {
        requestId: req.requestId,
        error: error.message,
        path: req.path,
        method: req.method
      });

      if (error.message === 'Token expired') {
        return res.status(401).json({
          error: 'Token expired',
          message: 'Please refresh your token',
          requestId: req.requestId
        });
      }

      if (error.message === 'Invalid token' || error.message === 'Token has been revoked') {
        return res.status(401).json({
          error: 'Invalid token',
          message: 'Authentication failed',
          requestId: req.requestId
        });
      }

      return res.status(500).json({
        error: 'Authentication error',
        message: 'An error occurred during authentication',
        requestId: req.requestId
      });
    }
  };
};

/**
 * Middleware to require specific roles
 * @param {Array} roles - Required roles
 * @returns {Function} - Express middleware function
 */
const requireRoles = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate first',
        requestId: req.requestId
      });
    }

    const userRoles = req.user.roles || [];
    const hasRequiredRole = roles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      return res.status(403).json({
        error: 'Insufficient privileges',
        message: 'Required role not found',
        requiredRoles: roles,
        userRoles,
        requestId: req.requestId
      });
    }

    next();
  };
};

/**
 * Middleware to require specific permissions
 * @param {Array} permissions - Required permissions
 * @returns {Function} - Express middleware function
 */
const requirePermissions = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate first',
        requestId: req.requestId
      });
    }

    const userPermissions = req.user.permissions || [];
    const hasRequiredPermission = permissions.some(permission => 
      userPermissions.includes(permission)
    );

    if (!hasRequiredPermission) {
      return res.status(403).json({
        error: 'Insufficient privileges',
        message: 'Required permission not found',
        requiredPermissions: permissions,
        userPermissions,
        requestId: req.requestId
      });
    }

    next();
  };
};

/**
 * Middleware to optionally authenticate (token not required)
 * @returns {Function} - Express middleware function
 */
const optionalAuth = () => {
  return authenticateRequest({ required: false });
};

/**
 * Middleware to check if user is the owner of a resource or has admin privileges
 * @param {Function} getUserId - Function to extract user ID from request params/body
 * @returns {Function} - Express middleware function
 */
const requireOwnershipOrAdmin = (getUserId) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate first',
        requestId: req.requestId
      });
    }

    const resourceUserId = getUserId(req);
    const currentUserId = req.user.sub;
    const userRoles = req.user.roles || [];
    const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin');

    if (currentUserId !== resourceUserId && !isAdmin) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only access your own resources or need admin privileges',
        requestId: req.requestId
      });
    }

    next();
  };
};

/**
 * Middleware to validate token type
 * @param {string} expectedType - Expected token type ('access' or 'refresh')
 * @returns {Function} - Express middleware function
 */
const requireTokenType = (expectedType) => {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate first',
        requestId: req.requestId
      });
    }

    if (req.auth.type !== expectedType) {
      return res.status(401).json({
        error: 'Invalid token type',
        message: `Expected ${expectedType} token, got ${req.auth.type}`,
        requestId: req.requestId
      });
    }

    next();
  };
};

/**
 * Middleware to add CORS headers for authenticated requests
 * @returns {Function} - Express middleware function
 */
const authCorsHeaders = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID, X-Auth-User, X-Rate-Limit-Limit, X-Rate-Limit-Remaining, X-Rate-Limit-Reset');
  
  if (req.user) {
    res.setHeader('X-Auth-User', req.user.sub);
  }
  
  next();
};

/**
 * Middleware to log authentication attempts
 * @returns {Function} - Express middleware function
 */
const authLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Store original end function
  const originalEnd = res.end;
  
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      authenticated: !!req.user,
      userId: req.user?.sub,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    
    originalEnd.apply(this, args);
  };
  
  next();
};

module.exports = {
  authenticateRequest,
  requireRoles,
  requirePermissions,
  optionalAuth,
  requireOwnershipOrAdmin,
  requireTokenType,
  authCorsHeaders,
  authLogger
};