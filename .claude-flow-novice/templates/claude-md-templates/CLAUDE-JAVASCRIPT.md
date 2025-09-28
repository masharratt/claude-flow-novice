# Claude Code Configuration - SPARC Development Environment (JavaScript/Node.js)

## 🚨 CRITICAL: CONCURRENT EXECUTION & FILE MANAGEMENT

**ABSOLUTE RULES**:
1. ALL operations MUST be concurrent/parallel in a single message
2. **NEVER save working files, text/mds and tests to the root folder**
3. ALWAYS organize files in appropriate subdirectories
4. **USE CLAUDE CODE'S TASK TOOL** for spawning agents concurrently, not just MCP

### ⚡ GOLDEN RULE: "1 MESSAGE = ALL RELATED OPERATIONS"

**MANDATORY PATTERNS:**
- **TodoWrite**: ALWAYS batch ALL todos in ONE call (5-10+ todos minimum)
- **Task tool (Claude Code)**: ALWAYS spawn ALL agents in ONE message with full instructions
- **File operations**: ALWAYS batch ALL reads/writes/edits in ONE message
- **Bash commands**: ALWAYS batch ALL terminal operations in ONE message
- **Memory operations**: ALWAYS batch ALL memory store/retrieve in ONE message

### 🎯 CRITICAL: Claude Code Task Tool for Agent Execution

**Claude Code's Task tool is the PRIMARY way to spawn agents:**
```javascript
// ✅ CORRECT: Use Claude Code's Task tool for parallel agent execution
[Single Message]:
  Task("JS researcher", "Analyze Node.js patterns and npm ecosystem...", "researcher")
  Task("JS coder", "Implement core JavaScript modules with modern ES6+...", "coder")
  Task("JS tester", "Create comprehensive tests with Jest/Mocha...", "tester")
  Task("JS reviewer", "Review code for JavaScript best practices and ESLint...", "reviewer")
  Task("JS architect", "Design system architecture with JavaScript patterns...", "system-architect")
```

### 📁 JavaScript File Organization Rules

**NEVER save to root folder. Use JavaScript project structure:**
- `/src` - Source code files (main modules, utilities)
- `/lib` - Compiled/built JavaScript files
- `/test` or `/tests` - Test files
- `/docs` - Documentation and markdown files
- `/config` - Configuration files
- `/scripts` - Build and utility scripts
- `/public` - Static assets (for web projects)
- `/node_modules` - Dependencies (auto-generated, add to .gitignore)
- `package.json` - Project manifest and dependencies
- `package-lock.json` - Dependency lock file

## Project Overview

This JavaScript/Node.js project uses SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) methodology with Claude-Flow orchestration for systematic Test-Driven Development.

## JavaScript-Specific SPARC Commands

### Core Commands
- `npx claude-flow sparc modes` - List available modes
- `npx claude-flow sparc run <mode> "<js-task>"` - Execute JavaScript-specific mode
- `npx claude-flow sparc tdd "<js-feature>"` - Run complete TDD workflow for JavaScript
- `npx claude-flow sparc info <mode>` - Get mode details

### JavaScript Build Commands
- `npm install` - Install dependencies
- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run format` - Format code with Prettier
- `npm run dev` - Development mode with hot reload
- `npm audit` - Security audit
- `npm outdated` - Check outdated dependencies

### JavaScript Quality Commands
- `npm run lint -- --fix` - Auto-fix linting issues
- `npm run test -- --coverage` - Generate test coverage report
- `npm run validate` - Run all quality checks
- `npx madge --circular src/` - Check for circular dependencies

## JavaScript SPARC Workflow Phases

1. **Specification** - Requirements analysis with JavaScript ecosystem (`sparc run spec-pseudocode`)
2. **Pseudocode** - Algorithm design with async/await patterns (`sparc run spec-pseudocode`)
3. **Architecture** - System design with Node.js patterns (`sparc run architect`)
4. **Refinement** - TDD implementation with Jest/Mocha (`sparc tdd`)
5. **Completion** - Integration with npm scripts (`sparc run integration`)

## JavaScript Code Style & Best Practices

- **Modern ES6+**: Use const/let, arrow functions, destructuring, modules
- **Async Programming**: Prefer async/await over callbacks and promises
- **Error Handling**: Use try/catch blocks and proper error objects
- **Functional Programming**: Immutable data, pure functions, higher-order functions
- **Testing**: Comprehensive unit and integration tests
- **Documentation**: JSDoc comments for public APIs
- **Linting**: ESLint with Airbnb or Standard config
- **Formatting**: Prettier for consistent code style

## 🚀 JavaScript-Specific Agents (78+ Total)

### Core JavaScript Development
`js-coder`, `node-developer`, `frontend-dev`, `js-tester`, `js-reviewer`, `js-architect`

### Frontend Specialists
`react-dev`, `vue-dev`, `angular-dev`, `vanilla-js-expert`, `dom-specialist`

### Backend Specialists
`express-dev`, `fastify-dev`, `nest-developer`, `api-designer`, `microservices-architect`

### Testing & Quality
`jest-expert`, `cypress-tester`, `playwright-tester`, `unit-test-specialist`, `e2e-tester`

### Build & Tooling
`webpack-expert`, `vite-specialist`, `babel-config`, `npm-expert`, `yarn-specialist`

### All Standard Agents Available
`coder`, `reviewer`, `tester`, `planner`, `researcher`, `system-architect`, `code-analyzer`, `performance-benchmarker`, `cicd-engineer`, `security-manager`

## 🎯 JavaScript Development Patterns

### ✅ CORRECT JAVASCRIPT WORKFLOW

```javascript
// Step 1: Set up JavaScript project coordination
[Single Message - Coordination Setup]:
  mcp__claude-flow__swarm_init { topology: "mesh", maxAgents: 6 }
  mcp__claude-flow__agent_spawn { type: "js-architect" }
  mcp__claude-flow__agent_spawn { type: "node-developer" }
  mcp__claude-flow__agent_spawn { type: "js-tester" }

// Step 2: Parallel JavaScript development execution
[Single Message - Parallel Agent Execution]:
  Task("JS architect", "Design modular architecture with ES6 modules. Store patterns in memory.", "js-architect")
  Task("Node developer", "Implement server with Express/Fastify. Use async/await patterns.", "node-developer")
  Task("Frontend developer", "Create responsive UI with modern JavaScript. Coordinate via hooks.", "frontend-dev")
  Task("JS tester", "Create comprehensive test suite with Jest. Include unit and integration tests.", "js-tester")
  Task("Build engineer", "Set up webpack/vite build process. Configure for development and production.", "webpack-expert")

  // Batch ALL JavaScript todos
  TodoWrite { todos: [
    {content: "Set up package.json with dependencies", status: "in_progress", activeForm: "Setting up package.json"},
    {content: "Implement core modules with ES6+", status: "pending", activeForm: "Implementing core modules"},
    {content: "Add comprehensive Jest tests", status: "pending", activeForm: "Adding comprehensive Jest tests"},
    {content: "Configure ESLint and Prettier", status: "pending", activeForm: "Configuring ESLint and Prettier"},
    {content: "Set up build process with Webpack/Vite", status: "pending", activeForm: "Setting up build process"},
    {content: "Add JSDoc documentation", status: "pending", activeForm: "Adding JSDoc documentation"},
    {content: "Configure CI/CD pipeline", status: "pending", activeForm: "Configuring CI/CD pipeline"},
    {content: "Add security scanning with npm audit", status: "pending", activeForm: "Adding security scanning"}
  ]}

  // Parallel JavaScript file operations
  Write "package.json"
  Write "src/index.js"
  Write "src/server.js"
  Write "test/index.test.js"
  Write ".eslintrc.js"
  Write "webpack.config.js"
```

## JavaScript Agent Coordination Protocol

### Every JavaScript Agent MUST:

**1️⃣ BEFORE Work:**
```bash
npx claude-flow@alpha hooks pre-task --description "[js-task]"
npm install  # Install dependencies
```

**2️⃣ DURING Work:**
```bash
npm run lint  # Check code quality
npm test  # Run tests
npx claude-flow@alpha hooks post-edit --file "[file]" --memory-key "js/[agent]/[step]"
```

**3️⃣ AFTER Work:**
```bash
npm run build  # Build project
npm audit  # Security check
npx claude-flow@alpha hooks post-task --task-id "[task]"
```

## JavaScript-Specific Configurations

### package.json Template
```json
{
  "name": "project-name",
  "version": "1.0.0",
  "description": "Project description",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "build": "webpack --mode production",
    "build:dev": "webpack --mode development",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write src/",
    "validate": "npm run lint && npm run test",
    "audit:fix": "npm audit fix"
  },
  "keywords": ["javascript", "node", "api"],
  "author": "Your Name <email@example.com>",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "helmet": "^6.0.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "eslint": "^8.0.0",
    "eslint-config-airbnb-base": "^15.0.0",
    "eslint-plugin-import": "^2.25.0",
    "jest": "^29.0.0",
    "nodemon": "^2.0.0",
    "prettier": "^2.7.0",
    "supertest": "^6.2.0",
    "webpack": "^5.70.0",
    "webpack-cli": "^4.9.0"
  },
  "engines": {
    "node": ">=16.0.0",
    "npm": ">=8.0.0"
  }
}
```

### .gitignore for JavaScript
```
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# Build output
dist/
build/
lib/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo
```

### ESLint Configuration (.eslintrc.js)
```javascript
module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-console': 'warn',
    'no-unused-vars': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-arrow-callback': 'error',
  },
};
```

### Prettier Configuration (.prettierrc)
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false
}
```

### Jest Configuration (jest.config.js)
```javascript
module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/test/**/*.js',
    '**/?(*.)+(spec|test).js',
  ],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
};
```

## Testing Strategies

### Unit Tests with Jest
```javascript
// test/math.test.js
const { add, multiply } = require('../src/math');

describe('Math functions', () => {
  describe('add', () => {
    test('should add two numbers correctly', () => {
      expect(add(2, 3)).toBe(5);
    });

    test('should handle negative numbers', () => {
      expect(add(-1, 1)).toBe(0);
    });
  });

  describe('multiply', () => {
    test('should multiply two numbers correctly', () => {
      expect(multiply(3, 4)).toBe(12);
    });
  });
});
```

### Integration Tests
```javascript
// test/server.test.js
const request = require('supertest');
const app = require('../src/app');

describe('API endpoints', () => {
  test('GET /api/users should return users list', async () => {
    const response = await request(app)
      .get('/api/users')
      .expect(200);

    expect(response.body).toHaveProperty('users');
    expect(Array.isArray(response.body.users)).toBe(true);
  });

  test('POST /api/users should create a new user', async () => {
    const newUser = {
      name: 'John Doe',
      email: 'john@example.com',
    };

    const response = await request(app)
      .post('/api/users')
      .send(newUser)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.name).toBe(newUser.name);
  });
});
```

### Async Testing
```javascript
describe('Async operations', () => {
  test('should handle async function', async () => {
    const result = await asyncFunction();
    expect(result).toBe('expected value');
  });

  test('should handle promises', () => {
    return promiseFunction().then(result => {
      expect(result).toBe('expected value');
    });
  });

  test('should handle rejected promises', async () => {
    await expect(failingAsyncFunction()).rejects.toThrow('Error message');
  });
});
```

## Error Handling Patterns

### Express Error Handling
```javascript
// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
    });
  }

  if (err.name === 'MongoError' && err.code === 11000) {
    return res.status(400).json({
      error: 'Duplicate Key Error',
      message: 'Resource already exists',
    });
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong'
      : err.message,
  });
};

module.exports = errorHandler;
```

### Async Error Handling
```javascript
// Async wrapper for error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Usage
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find();
  res.json({ users });
});
```

### Custom Error Classes
```javascript
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

module.exports = { AppError, ValidationError, NotFoundError };
```

## Performance Optimization

### Profiling Commands
```bash
# Node.js built-in profiler
node --prof src/index.js
node --prof-process isolate-*.log > profiling-output.txt

# Memory usage
node --inspect src/index.js
# Connect Chrome DevTools to chrome://inspect

# Performance monitoring
npm install -g clinic
clinic doctor -- node src/index.js
clinic bubbleprof -- node src/index.js
```

### Optimization Techniques
```javascript
// Use streams for large data processing
const fs = require('fs');
const readline = require('readline');

const processLargeFile = async (filename) => {
  const fileStream = fs.createReadStream(filename);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    // Process line by line
    processLine(line);
  }
};

// Connection pooling for databases
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'user',
  password: 'password',
  database: 'database',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Caching strategies
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 }); // 10 minutes

const getCachedData = (key) => {
  const cached = cache.get(key);
  if (cached) return cached;

  const data = fetchFromDatabase(key);
  cache.set(key, data);
  return data;
};
```

## Documentation Standards

### JSDoc Comments
```javascript
/**
 * Calculates the area of a rectangle.
 * @param {number} width - The width of the rectangle.
 * @param {number} height - The height of the rectangle.
 * @returns {number} The area of the rectangle.
 * @throws {Error} When width or height is negative.
 * @example
 * // Calculate area of a 5x3 rectangle
 * const area = calculateArea(5, 3);
 * console.log(area); // 15
 */
function calculateArea(width, height) {
  if (width < 0 || height < 0) {
    throw new Error('Width and height must be positive numbers');
  }
  return width * height;
}

/**
 * User service for managing user operations.
 * @namespace UserService
 */
const UserService = {
  /**
   * Creates a new user.
   * @memberof UserService
   * @param {Object} userData - The user data.
   * @param {string} userData.name - The user's name.
   * @param {string} userData.email - The user's email.
   * @returns {Promise<Object>} The created user object.
   */
  async createUser(userData) {
    // Implementation
  }
};
```

## Build Configuration

### Webpack Configuration (webpack.config.js)
```javascript
const path = require('path');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  mode: process.env.NODE_ENV || 'development',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.json'],
  },
  devServer: {
    contentBase: './dist',
    hot: true,
  },
};
```

### Babel Configuration (.babelrc)
```json
{
  "presets": [
    [
      "@babel/preset-env",
      {
        "targets": {
          "node": "16"
        }
      }
    ]
  ],
  "plugins": [
    "@babel/plugin-proposal-optional-chaining",
    "@babel/plugin-proposal-nullish-coalescing-operator"
  ]
}
```

## CI/CD Configuration

### GitHub Actions (.github/workflows/node.yml)
```yaml
name: Node.js CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [16.x, 18.x, 20.x]

    steps:
    - uses: actions/checkout@v3

    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'

    - run: npm ci
    - run: npm run lint
    - run: npm run test:coverage
    - run: npm run build
    - run: npm audit

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

## Advanced JavaScript Patterns

### Module Pattern
```javascript
// ES6 Modules
export const config = {
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  port: process.env.PORT || 3000,
};

export const utils = {
  formatDate: (date) => date.toISOString(),
  validateEmail: (email) => /\S+@\S+\.\S+/.test(email),
};

export default class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async get(endpoint) {
    // Implementation
  }
}
```

### Async/Await Patterns
```javascript
// Parallel execution
const fetchAllData = async () => {
  try {
    const [users, posts, comments] = await Promise.all([
      fetchUsers(),
      fetchPosts(),
      fetchComments(),
    ]);

    return { users, posts, comments };
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
};

// Sequential execution with error handling
const processDataSequentially = async (items) => {
  const results = [];

  for (const item of items) {
    try {
      const result = await processItem(item);
      results.push(result);
    } catch (error) {
      console.error(`Error processing item ${item.id}:`, error);
      // Continue with next item or break depending on requirements
    }
  }

  return results;
};
```

## Support Resources

- **Node.js Documentation**: https://nodejs.org/docs/
- **NPM Documentation**: https://docs.npmjs.com/
- **JavaScript MDN**: https://developer.mozilla.org/en-US/docs/Web/JavaScript
- **Jest Documentation**: https://jestjs.io/docs/
- **ESLint Documentation**: https://eslint.org/docs/
- **Express.js Guide**: https://expressjs.com/en/guide/

---

Remember: **Claude Flow coordinates, Claude Code creates JavaScript!**