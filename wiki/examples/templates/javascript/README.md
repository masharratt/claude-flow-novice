# JavaScript/Node.js Template

**Complexity**: 🟢 Beginner to 🟡 Intermediate
**Technologies**: JavaScript (ES2022), Node.js 18+, Jest, ESLint, Prettier
**Agents**: Configurable (1-5 agents)

Modern JavaScript/Node.js template with best practices, testing setup, and claude-flow-novice integration.

## Features

✅ **Modern JavaScript** - ES2022 features, modules, async/await
✅ **Development Tools** - ESLint, Prettier, Nodemon
✅ **Testing Suite** - Jest with coverage reporting
✅ **Build System** - ESBuild for fast bundling
✅ **Error Handling** - Robust error patterns
✅ **Logging** - Winston for structured logging
✅ **Configuration** - Environment variables with validation
✅ **Claude Flow Integration** - Pre-configured agent workflows

## Quick Start

```bash
# Download template
npx claude-flow@alpha template download javascript my-js-project
cd my-js-project

# Install dependencies
npm install

# Start development
npm run dev
```

## Project Structure

```
my-js-project/
├── src/
│   ├── index.js              # Main entry point
│   ├── config/
│   │   ├── index.js          # Configuration management
│   │   └── validation.js     # Config validation
│   ├── services/
│   │   ├── logger.js         # Logging service
│   │   └── health.js         # Health check service
│   ├── utils/
│   │   ├── errors.js         # Custom error classes
│   │   └── helpers.js        # Utility functions
│   └── middlewares/
│       └── errorHandler.js   # Error handling middleware
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── fixtures/             # Test data
├── docs/                     # Documentation
├── .claude-flow.json         # Claude Flow configuration
├── .env.example              # Environment template
├── package.json              # Dependencies and scripts
└── README.md                 # Project documentation
```

## Available Scripts

```bash
# Development
npm run dev              # Start with hot reload
npm start               # Production start
npm run build           # Build for production

# Testing
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report

# Code Quality
npm run lint            # Check code style
npm run lint:fix        # Fix linting issues
npm run format          # Format with Prettier

# Claude Flow
npm run claude-flow:init     # Initialize claude-flow
npm run claude-flow:agents   # List available agents
npm run claude-flow:swarm    # Start agent swarm
```

## Agent Workflows

### Single Agent Development
```bash
# Simple development with one coder agent
npx claude-flow@alpha agent spawn coder \
  --capability \"JavaScript development\" \
  --task \"Add new feature to the application\"
```

### Multi-Agent Team
```javascript
// Coordinate multiple agents for complex development
Task(\"Backend Developer\", \"Implement API endpoints with Express.js\", \"backend-dev\")
Task(\"Testing Engineer\", \"Create comprehensive test suite\", \"tester\")
Task(\"Code Reviewer\", \"Review code quality and security\", \"reviewer\")
Task(\"Performance Optimizer\", \"Optimize application performance\", \"performance-optimizer\")
```

### SPARC Workflow
```bash
# Complete Test-Driven Development workflow
npx claude-flow@alpha sparc tdd \"user authentication system\"
```

## Configuration

### Environment Variables
```bash
# Copy example environment
cp .env.example .env

# Required variables
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Optional variables
API_KEY=your-api-key
DATABASE_URL=mongodb://localhost:27017/myapp
REDIS_URL=redis://localhost:6379
```

### Claude Flow Configuration
```json
{
  \"version\": \"2.0.0\",
  \"project\": {
    \"name\": \"my-js-project\",
    \"type\": \"javascript\",
    \"framework\": \"nodejs\"
  },
  \"agents\": {
    \"coder\": {
      \"type\": \"coder\",
      \"capabilities\": [\"JavaScript\", \"Node.js\", \"ES6+\"],
      \"files\": [\"src/**/*.js\"],
      \"tests\": [\"tests/**/*.test.js\"]
    },
    \"tester\": {
      \"type\": \"tester\",
      \"framework\": \"jest\",
      \"coverage\": 80,
      \"patterns\": [\"unit\", \"integration\"]
    }
  },
  \"workflows\": {
    \"development\": {
      \"steps\": [
        \"analyze requirements\",
        \"design architecture\",
        \"implement features\",
        \"write tests\",
        \"review code\",
        \"optimize performance\"
      ]
    }
  }
}
```

## Example Usage

### Basic Application
```javascript
// src/index.js
import { createServer } from './services/server.js';
import { logger } from './services/logger.js';
import { config } from './config/index.js';

async function main() {
  try {
    const server = createServer();

    server.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

main();
```

### Service Layer
```javascript
// src/services/userService.js
import { logger } from './logger.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

export class UserService {
  constructor(database) {
    this.db = database;
  }

  async createUser(userData) {
    try {
      // Validation
      if (!userData.email) {
        throw new ValidationError('Email is required');
      }

      // Business logic
      const user = await this.db.users.create(userData);

      logger.info('User created successfully', { userId: user.id });
      return user;

    } catch (error) {
      logger.error('Failed to create user', {
        error: error.message,
        userData: userData.email
      });
      throw error;
    }
  }

  async getUserById(id) {
    const user = await this.db.users.findById(id);

    if (!user) {
      throw new NotFoundError(`User with id ${id} not found`);
    }

    return user;
  }
}
```

### Testing
```javascript
// tests/unit/userService.test.js
import { UserService } from '../../src/services/userService.js';
import { ValidationError, NotFoundError } from '../../src/utils/errors.js';

describe('UserService', () => {
  let userService;
  let mockDatabase;

  beforeEach(() => {
    mockDatabase = {
      users: {
        create: jest.fn(),
        findById: jest.fn()
      }
    };
    userService = new UserService(mockDatabase);
  });

  describe('createUser', () => {
    it('should create user successfully', async () => {
      const userData = { email: 'test@example.com', name: 'Test User' };
      const expectedUser = { id: 1, ...userData };

      mockDatabase.users.create.mockResolvedValue(expectedUser);

      const result = await userService.createUser(userData);

      expect(result).toEqual(expectedUser);
      expect(mockDatabase.users.create).toHaveBeenCalledWith(userData);
    });

    it('should throw ValidationError when email is missing', async () => {
      const userData = { name: 'Test User' };

      await expect(userService.createUser(userData))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const userId = 1;
      const expectedUser = { id: userId, email: 'test@example.com' };

      mockDatabase.users.findById.mockResolvedValue(expectedUser);

      const result = await userService.getUserById(userId);

      expect(result).toEqual(expectedUser);
    });

    it('should throw NotFoundError when user not found', async () => {
      const userId = 999;

      mockDatabase.users.findById.mockResolvedValue(null);

      await expect(userService.getUserById(userId))
        .rejects.toThrow(NotFoundError);
    });
  });
});
```

## Agent Coordination Examples

### Web API Development
```javascript
// Spawn specialized agents for API development
Task(\"API Architect\", \"Design RESTful API structure with OpenAPI specification\", \"system-architect\")
Task(\"Backend Developer\", \"Implement Express.js routes and middleware\", \"backend-dev\")
Task(\"Database Designer\", \"Design MongoDB schema and models\", \"database-architect\")
Task(\"Security Expert\", \"Implement authentication and authorization\", \"security-manager\")
Task(\"Testing Engineer\", \"Create API tests with Jest and Supertest\", \"tester\")
```

### Full-Stack Application
```javascript
// Coordinate full-stack development
Task(\"Frontend Developer\", \"Create React.js user interface\", \"frontend-dev\")
Task(\"Backend Developer\", \"Build Node.js API with Express\", \"backend-dev\")
Task(\"DevOps Engineer\", \"Setup Docker containers and CI/CD\", \"cicd-engineer\")
Task(\"Performance Engineer\", \"Optimize bundle size and API response times\", \"performance-optimizer\")
```

### Microservices Architecture
```javascript
// Develop microservices with multiple agents
Task(\"Service Architect\", \"Design microservice boundaries and communication\", \"system-architect\")
Task(\"Auth Service Dev\", \"Build authentication microservice\", \"backend-dev\")
Task(\"User Service Dev\", \"Build user management microservice\", \"backend-dev\")
Task(\"Gateway Dev\", \"Implement API gateway with routing\", \"backend-dev\")
Task(\"Monitoring Engineer\", \"Setup distributed tracing and metrics\", \"performance-optimizer\")
```

## Best Practices

### Code Quality
- Use ESLint and Prettier for consistent code style
- Maintain 80%+ test coverage
- Follow semantic versioning
- Write meaningful commit messages

### Error Handling
```javascript
// Custom error classes
export class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

// Global error handler
export function handleError(error, req, res, next) {
  if (error.isOperational) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code
    });
  }

  logger.error('Unexpected error', { error: error.stack });
  res.status(500).json({ error: 'Internal server error' });
}
```

### Performance Optimization
```javascript
// Use caching for expensive operations
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 600 });

export function withCache(key, fn) {
  return async (...args) => {
    const cacheKey = `${key}:${JSON.stringify(args)}`;

    let result = cache.get(cacheKey);
    if (result) return result;

    result = await fn(...args);
    cache.set(cacheKey, result);
    return result;
  };
}
```

## Deployment

### Docker Setup
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

EXPOSE 3000

CMD [\"npm\", \"start\"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - \"3000:3000\"
    environment:
      - NODE_ENV=production
    depends_on:
      - mongodb
      - redis

  mongodb:
    image: mongo:6
    ports:
      - \"27017:27017\"

  redis:
    image: redis:7-alpine
    ports:
      - \"6379:6379\"
```

## Extensions

### Add Express.js
```bash
# Agent task for Express integration
Task(\"Backend Developer\",
     \"Add Express.js framework with routes, middleware, and API endpoints\",
     \"backend-dev\")
```

### Add Database Support
```bash
# Agent task for database integration
Task(\"Database Architect\",
     \"Integrate MongoDB with Mongoose ODM and implement data models\",
     \"database-architect\")
```

### Add Authentication
```bash
# Agent task for authentication
Task(\"Security Manager\",
     \"Implement JWT authentication with passport.js and role-based access\",
     \"security-manager\")
```

## Learning Resources

- [JavaScript Best Practices](../../learning/intermediate/javascript-patterns/README.md)
- [Node.js Architecture](../../learning/advanced/nodejs-architecture/README.md)
- [Testing Strategies](../../learning/intermediate/testing/README.md)
- [Performance Optimization](../../learning/advanced/performance/README.md)

## Related Templates

- [TypeScript Template](../typescript/README.md) - Type-safe development
- [Express API Template](../../projects/express-api/README.md) - Web API development
- [React App Template](../react/README.md) - Frontend development
- [Full-Stack Template](../../projects/fullstack-js/README.md) - Complete application

---

**Ready to build?** This template provides a solid foundation for JavaScript development with claude-flow-novice integration. Choose your complexity level and let the agents help you build!

## Support

- **Template Issues**: [GitHub Issues](https://github.com/ruvnet/claude-flow-novice/issues)
- **Documentation**: [Claude Flow Docs](../../../README.md)
- **Community**: [Discord Server](https://discord.gg/claude-flow)