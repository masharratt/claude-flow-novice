# Node.js Backend Development with Claude-Flow

Complete guide to building Node.js backend applications using Claude-Flow agent coordination.

## 🚀 Backend Development Workflow

### 1. Initialize Backend Project

```bash
# Generate backend with agent
npx claude-flow-novice sparc run backend-dev "Express TypeScript API with authentication and database"

# Alternative: Full backend architecture
npx claude-flow-novice sparc run system-architect "Microservices architecture with Node.js"
```

### 2. Agent-Driven Development

```bash
# Parallel backend development
npx claude-flow-novice sparc batch "backend-dev,api-docs,tester" "E-commerce API development"

# Sequential development for complex features
npx claude-flow-novice sparc run backend-dev "User authentication system"
npx claude-flow-novice sparc run api-docs "Generate OpenAPI documentation"
npx claude-flow-novice sparc run tester "Create comprehensive API tests"
```

## 🏗 Backend Architecture Patterns

### 1. Express.js API Structure

**Agent-Generated Server Structure**:
```
server/
├── src/
│   ├── controllers/        # Route handlers
│   ├── middleware/         # Custom middleware
│   ├── models/            # Database models
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   ├── utils/             # Utilities
│   ├── types/             # TypeScript types
│   ├── config/            # Configuration
│   └── app.ts             # Express app setup
├── tests/
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── fixtures/          # Test data
├── docs/
│   └── api/               # API documentation
├── package.json
├── tsconfig.json
└── nodemon.json
```

### 2. Generate Backend with Agent

```bash
# Complete backend generation
npx claude-flow-novice sparc run backend-dev "Express TypeScript API with:
- JWT authentication
- MongoDB integration
- Input validation
- Error handling
- Rate limiting
- CORS configuration
- Environment variables
- Logging with Winston"
```

## 🛠 Core Backend Components

### 1. Express Server Setup

**src/app.ts** (Agent-generated):
```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { productRoutes } from './routes/products';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined'));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

export { app };
```

```bash
# Generate Express setup with agent
npx claude-flow-novice sparc run backend-dev "Express server with security middleware and route organization"
```

### 2. Authentication System

**src/controllers/authController.ts** (Agent-generated):
```typescript
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';

const generateToken = (id: string): string => {
  return jwt.sign({ id }, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

export const register = catchAsync(async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError('User already exists with this email', 400);
  }

  // Hash password
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create user
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
  });

  // Generate token
  const token = generateToken(user._id);

  // Remove password from response
  const userResponse = user.toObject();
  delete userResponse.password;

  res.status(201).json({
    success: true,
    token,
    data: {
      user: userResponse,
    },
  });
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    throw new AppError('Please provide email and password', 400);
  }

  // Find user and include password
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }

  // Check password
  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect) {
    throw new AppError('Invalid credentials', 401);
  }

  // Generate token
  const token = generateToken(user._id);

  // Remove password from response
  const userResponse = user.toObject();
  delete userResponse.password;

  res.status(200).json({
    success: true,
    token,
    data: {
      user: userResponse,
    },
  });
});
```

```bash
# Generate authentication system with agent
npx claude-flow-novice sparc run backend-dev "JWT authentication with registration, login, and password hashing"
```

### 3. Database Integration

**src/models/User.ts** (Agent-generated):
```typescript
import mongoose, { Document, Schema } from 'mongoose';
import validator from 'validator';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false, // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ isActive: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
```

```bash
# Generate database models with agent
npx claude-flow-novice sparc run backend-dev "MongoDB models with validation and indexing"
```

### 4. API Routes

**src/routes/users.ts** (Agent-generated):
```typescript
import { Router } from 'express';
import {
  getUsers,
  getUserById,
  updateUser,
  deleteUser
} from '../controllers/userController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { validateUser } from '../middleware/validation';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// GET /api/users - Get all users (admin only)
router.get('/', authorize('admin'), getUsers);

// GET /api/users/:id - Get user by ID
router.get('/:id', getUserById);

// PUT /api/users/:id - Update user
router.put('/:id', validateUser, updateUser);

// DELETE /api/users/:id - Delete user (admin only)
router.delete('/:id', authorize('admin'), deleteUser);

export { router as userRoutes };
```

```bash
# Generate API routes with agent
npx claude-flow-novice sparc run backend-dev "RESTful API routes with authentication and authorization"
```

## 🔒 Security Implementation

### 1. Middleware Security

**src/middleware/auth.ts** (Agent-generated):
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';

interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = catchAsync(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Get token from header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

    if (!token) {
      throw new AppError('Access token is required', 401);
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };

    // Get user from token
    const user = await User.findById(decoded.id);
    if (!user) {
      throw new AppError('User no longer exists', 401);
    }

    if (!user.isActive) {
      throw new AppError('User account is deactivated', 401);
    }

    // Grant access
    req.user = user;
    next();
  }
);

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      throw new AppError('Insufficient permissions', 403);
    }
    next();
  };
};
```

### 2. Input Validation

**src/middleware/validation.ts** (Agent-generated):
```typescript
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from '../utils/AppError';

export const validateUser = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(50).trim(),
    email: Joi.string().email().lowercase(),
    password: Joi.string().min(6).max(128),
    role: Joi.string().valid('user', 'admin'),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  next();
};

export const validateProduct = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(500),
    price: Joi.number().positive().required(),
    category: Joi.string().required(),
    inStock: Joi.boolean(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  next();
};
```

```bash
# Generate security middleware with agent
npx claude-flow-novice sparc run backend-dev "Authentication, authorization, and input validation middleware"
```

## 🧪 Testing Backend APIs

### 1. Test Setup

**tests/setup.ts** (Agent-generated):
```typescript
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
```

### 2. API Testing

**tests/integration/auth.test.ts** (Agent-generated):
```typescript
import request from 'supertest';
import { app } from '../../src/app';
import { User } from '../../src/models/User';

describe('Authentication Endpoints', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('should not register user with invalid email', async () => {
      const userData = {
        name: 'John Doe',
        email: 'invalid-email',
        password: 'password123',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      const user = new User({
        name: 'John Doe',
        email: 'john@example.com',
        password: await bcrypt.hash('password123', 12),
      });
      await user.save();
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'password123',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });
  });
});
```

```bash
# Generate API tests with agent
npx claude-flow-novice sparc run tester "Comprehensive API testing with Jest and Supertest"
```

## 🚀 Performance & Optimization

### 1. Database Optimization

```bash
# Generate database optimization with agent
npx claude-flow-novice sparc run perf-analyzer "MongoDB query optimization and indexing strategies"
```

### 2. Caching Implementation

**src/middleware/cache.ts** (Agent-generated):
```typescript
import redis from 'redis';
import { Request, Response, NextFunction } from 'express';

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

export const cache = (duration: number = 300) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `cache:${req.originalUrl}`;

    try {
      const cached = await client.get(key);
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      // Store original json method
      const originalJson = res.json;

      // Override json method to cache response
      res.json = function(data: any) {
        client.setex(key, duration, JSON.stringify(data));
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache error:', error);
      next();
    }
  };
};
```

### 3. Rate Limiting

```bash
# Generate rate limiting with agent
npx claude-flow-novice sparc run backend-dev "Advanced rate limiting with Redis and different tiers"
```

## 🔄 MCP Integration for Backend Development

### Initialize Backend Swarm

```javascript
// Setup swarm for backend development
await mcp__claude_flow__swarm_init({
  topology: "mesh",
  maxAgents: 6,
  strategy: "adaptive"
});

// Spawn backend development agents
await mcp__claude_flow__agent_spawn({
  type: "backend-dev",
  capabilities: ["express", "mongodb", "authentication", "api-design"]
});

await mcp__claude_flow__agent_spawn({
  type: "api-docs",
  capabilities: ["openapi", "swagger", "documentation"]
});

await mcp__claude_flow__agent_spawn({
  type: "tester",
  capabilities: ["jest", "supertest", "integration-testing"]
});
```

### Orchestrate Backend Development

```javascript
// Orchestrate backend development tasks
await mcp__claude_flow__task_orchestrate({
  task: "Build Express TypeScript API with authentication, database integration, and comprehensive testing",
  strategy: "parallel",
  priority: "high",
  maxAgents: 4
});

// Monitor development progress
const status = await mcp__claude_flow__task_status({
  taskId: "backend-dev-task-id",
  detailed: true
});
```

## 📦 Deployment & DevOps

### 1. Docker Configuration

**Dockerfile** (Agent-generated):
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["npm", "start"]
```

### 2. Environment Configuration

**.env.example** (Agent-generated):
```bash
# Server Configuration
NODE_ENV=development
PORT=3000
API_VERSION=v1

# Database
MONGODB_URI=mongodb://localhost:27017/myapp
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# External APIs
STRIPE_SECRET_KEY=sk_test_...
SENDGRID_API_KEY=SG....

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Logging
LOG_LEVEL=info
```

```bash
# Generate deployment configuration with agent
npx claude-flow-novice sparc run cicd-engineer "Docker and environment configuration for Node.js API"
```

## 📚 Advanced Backend Patterns

### 1. Microservices Architecture

```bash
# Generate microservices with agent
npx claude-flow-novice sparc run system-architect "Microservices architecture with API Gateway and service discovery"
```

### 2. GraphQL API

```bash
# Generate GraphQL API with agent
npx claude-flow-novice sparc run backend-dev "GraphQL API with Apollo Server and TypeScript"
```

### 3. Real-time Features

```bash
# Generate WebSocket implementation with agent
npx claude-flow-novice sparc run backend-dev "WebSocket integration with Socket.io for real-time features"
```

---

**Next**: Explore [Frontend Development](../frontend/) for React application development with agent coordination.