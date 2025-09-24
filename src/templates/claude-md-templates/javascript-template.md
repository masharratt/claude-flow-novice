### JavaScript Development Patterns

**Code Style & Standards:**
- Use ES6+ features (arrow functions, destructuring, modules)
- Prefer `const`/`let` over `var`
- Use async/await over Promise chains
- Implement proper error boundaries
- Follow ESLint/Prettier configurations

**Concurrent Agent Execution:**
```javascript
// ✅ CORRECT: JavaScript development with concurrent agents
[Single Message]:
  Task("Frontend Developer", "Build responsive UI with modern JavaScript", "coder")
  Task("API Developer", "Create REST endpoints with Express/Fastify", "backend-dev")
  Task("Test Engineer", "Write Jest/Vitest tests with >85% coverage", "tester")
  Task("Build Engineer", "Configure Webpack/Vite build system", "system-architect")
  Task("Quality Reviewer", "Review code quality and performance", "reviewer")

  // Batch all file operations
  Write("src/app.js")
  Write("src/api/routes.js")
  Write("tests/app.test.js")
  Write("webpack.config.js")

  // Batch todos for tracking
  TodoWrite({ todos: [
    {content: "Set up project structure", status: "in_progress", activeForm: "Setting up project structure"},
    {content: "Implement core modules", status: "pending", activeForm: "Implementing core modules"},
    {content: "Add error handling", status: "pending", activeForm: "Adding error handling"},
    {content: "Write comprehensive tests", status: "pending", activeForm: "Writing comprehensive tests"},
    {content: "Configure build pipeline", status: "pending", activeForm: "Configuring build pipeline"}
  ]})
```

**Module Organization:**
```javascript
// Preferred module structure
src/
  components/         # Reusable components
  utils/             # Helper functions
  services/          # API and business logic
  config/            # Configuration files
  hooks/             # Custom hooks (if React)
  types/             # Type definitions (if TypeScript)
```

**Testing Patterns:**
```javascript
import { jest } from '@jest/globals';

describe('Module Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('handles async operations correctly', async () => {
    const mockFn = jest.fn().mockResolvedValue({ success: true });
    const result = await asyncOperation(mockFn);

    expect(result).toEqual({ success: true });
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  test('handles errors gracefully', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));

    await expect(asyncOperation(mockFn)).rejects.toThrow('Test error');
  });
});
```

**Performance Best Practices:**
- Use code splitting for large applications
- Implement lazy loading for routes/components
- Minimize bundle size with tree shaking
- Use Web Workers for heavy computations
- Implement proper caching strategies

**Error Handling:**
```javascript
// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging logic here
});

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

**Environment Configuration:**
```javascript
// config/index.js
const config = {
  development: {
    api: {
      baseURL: 'http://localhost:3000',
      timeout: 5000
    }
  },
  production: {
    api: {
      baseURL: process.env.API_BASE_URL,
      timeout: 10000
    }
  }
};

export default config[process.env.NODE_ENV || 'development'];
```