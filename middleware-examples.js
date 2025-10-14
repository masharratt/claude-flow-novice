// Middleware Examples for API Routes
// This file shows the middleware used to implement the API structure

const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

// Authentication Middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_TOKEN',
          message: 'Access token is required'
        }
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token'
      }
    });
  }
};

// Authorization Middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
    }

    next();
  };
};

// Resource Ownership Middleware
const checkOwnership = (resourceModel) => {
  return async (req, res, next) => {
    try {
      const resource = await resourceModel.findById(req.params.id);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Resource not found'
          }
        });
      }

      // Admin can access any resource
      if (req.user.role === 'admin') {
        req.resource = resource;
        return next();
      }

      // Check if user owns the resource
      if (resource.userId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only access your own resources'
          }
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error'
        }
      });
    }
  };
};

// Validation Middleware
const validateRequest = {
  register: [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
    body('firstName').trim().isLength({ min: 1, max: 50 }),
    body('lastName').trim().isLength({ min: 1, max: 50 }),
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array().map(error => ({
              field: error.path,
              message: error.msg
            }))
          }
        });
      }
      next();
    }
  ],

  login: [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array().map(error => ({
              field: error.path,
              message: error.msg
            }))
          }
        });
      }
      next();
    }
  ],

  createProduct: [
    body('name').trim().isLength({ min: 1, max: 200 }),
    body('description').trim().isLength({ min: 10, max: 2000 }),
    body('price').isFloat({ min: 0 }),
    body('category').isIn(['electronics', 'clothing', 'books', 'home', 'sports']),
    body('stock').isInt({ min: 0 }),
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array().map(error => ({
              field: error.path,
              message: error.msg
            }))
          }
        });
      }
      next();
    }
  ],

  createOrder: [
    body('items').isArray({ min: 1 }),
    body('items.*.productId').isMongoId(),
    body('items.*.quantity').isInt({ min: 1 }),
    body('shippingAddress.street').notEmpty(),
    body('shippingAddress.city').notEmpty(),
    body('shippingAddress.zipCode').notEmpty(),
    body('paymentMethod').isIn(['credit_card', 'paypal', 'stripe']),
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array().map(error => ({
              field: error.path,
              message: error.msg
            }))
          }
        });
      }
      next();
    }
  ]
};

// Rate Limiting Middleware
const rateLimitConfig = {
  // General API rate limiting
  general: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 1000, // 1000 requests per hour
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later'
      }
    },
    standardHeaders: true,
    legacyHeaders: false
  }),

  // Authentication endpoints
  auth: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts, please try again later'
      }
    },
    skipSuccessfulRequests: true
  }),

  // File upload rate limiting
  upload: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // 100 uploads per hour
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Upload limit exceeded, please try again later'
      }
    }
  })
};

// Pagination Middleware
const paginate = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Validate pagination parameters
  if (page < 1 || limit < 1 || limit > 100) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PAGINATION',
        message: 'Invalid pagination parameters'
      }
    });
  }

  req.pagination = { page, limit, skip };
  next();
};

// Sorting Middleware
const sort = (req, res, next) => {
  const allowedSortFields = ['createdAt', 'updatedAt', 'name', 'price', 'rating'];
  const sortField = req.query.sort || 'createdAt';
  const sortOrder = req.query.order || 'desc';

  if (!allowedSortFields.includes(sortField)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_SORT_FIELD',
        message: 'Invalid sort field'
      }
    });
  }

  if (!['asc', 'desc'].includes(sortOrder.toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_SORT_ORDER',
        message: 'Sort order must be asc or desc'
      }
    });
  }

  req.sort = {
    field: sortField,
    order: sortOrder.toLowerCase() === 'asc' ? 1 : -1
  };

  next();
};

// Error Handling Middleware
const errorHandler = (err, req, res, next) => {
  console.error(err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));

    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors
      }
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ERROR',
        message: `${field} already exists`
      }
    });
  }

  // JWT error
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid token'
      }
    });
  }

  // Default error
  res.status(500).json({
    success: false,
    error: {
      code: 'SERVER_ERROR',
      message: 'Internal server error'
    }
  });
};

// Request Logging Middleware
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
};

// CORS Middleware
const corsMiddleware = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  checkOwnership,
  validateRequest,
  rateLimit: rateLimitConfig,
  paginate,
  sort,
  errorHandler,
  requestLogger,
  corsMiddleware
};