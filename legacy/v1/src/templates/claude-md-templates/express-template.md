### Express.js API Development

**Framework Configuration:**
- Use Express.js with TypeScript for better type safety
- Implement middleware for logging, CORS, and error handling
- Use environment variables for configuration
- Implement proper routing structure
- Add input validation and sanitization

**Concurrent Agent Execution:**
```javascript
// ✅ CORRECT: Express API development with specialized agents
[Single Message]:
  Task("API Developer", "Build RESTful endpoints with Express and middleware", "backend-dev")
  Task("Database Designer", "Design MongoDB/PostgreSQL schema with Mongoose/Prisma", "code-analyzer")
  Task("Auth Engineer", "Implement JWT authentication and authorization", "system-architect")
  Task("Test Engineer", "Write Supertest integration tests with Jest", "tester")
  Task("Security Reviewer", "Implement security headers and input validation", "reviewer")

  // Batch Express file operations
  Write("src/app.js")
  Write("src/routes/users.js")
  Write("src/middleware/auth.js")
  Write("src/models/User.js")
  Write("tests/routes/users.test.js")

  // Express API todos
  TodoWrite({ todos: [
    {content: "Setup Express server with middleware stack", status: "in_progress", activeForm: "Setting up Express server with middleware stack"},
    {content: "Implement RESTful API routes with validation", status: "pending", activeForm: "Implementing RESTful API routes with validation"},
    {content: "Add JWT authentication and protected routes", status: "pending", activeForm: "Adding JWT authentication and protected routes"},
    {content: "Configure database connection and models", status: "pending", activeForm: "Configuring database connection and models"},
    {content: "Write comprehensive API integration tests", status: "pending", activeForm": "Writing comprehensive API integration tests"}
  ]})
```

**Project Structure:**
```
src/
  app.js              # Main application setup
  server.js           # Server startup
  routes/             # API routes
    index.js
    users.js
    auth.js
    posts.js
  middleware/         # Custom middleware
    auth.js
    validation.js
    errorHandler.js
    logger.js
  models/            # Database models
    User.js
    Post.js
    index.js
  services/          # Business logic
    userService.js
    authService.js
  utils/             # Helper functions
    validators.js
    crypto.js
  config/            # Configuration
    database.js
    passport.js
```

**Express Application Setup:**
```javascript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import userRoutes from './routes/users.js';
import authRoutes from './routes/auth.js';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

export default app;
```

**Route Implementation:**
```javascript
import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.js';
import userService from '../services/userService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// Input validation middleware
const validateUser = [
  body('name').isLength({ min: 2, max: 50 }).trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
];

const validateUserId = [
  param('id').isUUID().withMessage('Invalid user ID format')
];

// GET /api/users - Get all users (Admin only)
router.get('/',
  authenticate,
  authorize(['admin']),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search } = req.query;

    const users = await userService.getAllUsers({
      page: parseInt(page),
      limit: parseInt(limit),
      search
    });

    res.json({
      success: true,
      data: users.data,
      pagination: users.pagination
    });
  })
);

// GET /api/users/:id - Get user by ID
router.get('/:id',
  authenticate,
  validateUserId,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const user = await userService.getUserById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  })
);

// POST /api/users - Create new user
router.post('/',
  validateUser,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const newUser = await userService.createUser(req.body);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: newUser
    });
  })
);

// PUT /api/users/:id - Update user
router.put('/:id',
  authenticate,
  validateUserId,
  validateUser,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if user can update this profile
    if (req.user.id !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const updatedUser = await userService.updateUser(req.params.id, req.body);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  })
);

export default router;
```

**Authentication Middleware:**
```javascript
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../utils/asyncHandler.js';
import User from '../models/User.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token is missing or invalid'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token refers to non-existent user'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token is invalid or expired'
    });
  }
});

export const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }

    next();
  };
};
```

**Error Handling Middleware:**
```javascript
export const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error(err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};
```

**Testing with Supertest:**
```javascript
import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../../src/app.js';
import User from '../../src/models/User.js';

// Mock the User model
jest.mock('../../src/models/User.js');

describe('User API Endpoints', () => {
  let authToken;

  beforeAll(async () => {
    // Setup test database connection
    await setupTestDB();
  });

  beforeEach(async () => {
    // Create test user and get auth token
    const testUser = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password123!'
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'Password123!'
      });

    authToken = response.body.token;
  });

  afterEach(async () => {
    // Clean up database
    await User.deleteMany({});
  });

  describe('GET /api/users/:id', () => {
    it('should return user data for valid ID', async () => {
      const user = await User.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!'
      });

      const response = await request(app)
        .get(`/api/users/${user.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('John Doe');
      expect(response.body.data.email).toBe('john@example.com');
      expect(response.body.data.password).toBeUndefined();
    });

    it('should return 404 for non-existent user', async () => {
      const nonExistentId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .get(`/api/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/users/123')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/token/i);
    });
  });

  describe('POST /api/users', () => {
    it('should create user with valid data', async () => {
      const userData = {
        name: 'New User',
        email: 'newuser@example.com',
        password: 'Password123!'
      };

      const response = await request(app)
        .post('/api/users')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('New User');
      expect(response.body.data.email).toBe('newuser@example.com');
      expect(response.body.data.password).toBeUndefined();
    });

    it('should return 400 for invalid email', async () => {
      const userData = {
        name: 'New User',
        email: 'invalid-email',
        password: 'Password123!'
      };

      const response = await request(app)
        .post('/api/users')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].path).toBe('email');
    });
  });
});
```

**Environment Configuration:**
```javascript
// config/environment.js
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/myapp',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpire: process.env.JWT_EXPIRE || '30d',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Email configuration
  emailHost: process.env.EMAIL_HOST,
  emailPort: process.env.EMAIL_PORT || 587,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,

  // Redis configuration
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Rate limiting
  rateLimitWindow: process.env.RATE_LIMIT_WINDOW || 15 * 60 * 1000,
  rateLimitMax: process.env.RATE_LIMIT_MAX || 100
};
```