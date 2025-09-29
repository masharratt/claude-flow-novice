# Claude Code Configuration - react-typescript Development Environment

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
  Task("Research agent", "Analyze requirements and patterns...", "researcher")
  Task("Coder agent", "Implement core features...", "coder")
  Task("Tester agent", "Create comprehensive tests...", "tester")
  Task("Reviewer agent", "Review code quality...", "reviewer")
  Task("Architect agent", "Design system architecture...", "system-architect")
```

## Project Overview

**Project Type**: react-typescript
**Primary Language**: javascript
**Primary Framework**: react
**Package Manager**: npm
**Build Tools**: none

**Detected Languages**: javascript, typescript, rust, python
**Detected Frameworks**: react, express, vue, django, flask, nextjs, angular, spring, fastapi
**Project Directories**: src

*Auto-generated on 2025-09-29*

## 📁 File Organization Rules

**NEVER save to root folder. Use these directories:**
- `/src` - Source code files
- `/tests` - Test files
- `/docs` - Documentation and markdown files
- `/config` - Configuration files
- `/scripts` - Utility scripts
- `/examples` - Example code

## 🚀 Available Agent Types

### Core Development
`coder`, `reviewer`, `tester`, `planner`, `researcher`

### Backend Development
`backend-dev`, `api-docs`, `system-architect`, `code-analyzer`

### Frontend Development
`mobile-dev` (React Native), specialized frontend agents

### Testing & Validation
`tdd-london-swarm`, `production-validator`

### GitHub & Repository Management
`github-modes`, `pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`

### Performance & Optimization
`perf-analyzer`, `performance-benchmarker`, `task-orchestrator`

## 🎯 Claude Code vs MCP Tools

### Claude Code Handles ALL EXECUTION:
- **Task tool**: Spawn and run agents concurrently for actual work
- File operations (Read, Write, Edit, MultiEdit, Glob, Grep)
- Code generation and programming
- Bash commands and system operations
- Implementation work

### MCP Tools ONLY COORDINATE:
- Swarm initialization (topology setup)
- Agent type definitions (coordination patterns)
- Task orchestration (high-level planning)
- Memory management
- Performance tracking

**KEY**: MCP coordinates the strategy, Claude Code's Task tool executes with real agents.

## 📋 Agent Coordination Protocol

### Every Agent Spawned via Task Tool MUST:

**1️⃣ BEFORE Work:**
```bash
npx claude-flow@alpha hooks pre-task --description "[task]"
npx claude-flow@alpha hooks session-restore --session-id "swarm-[id]"
```

**2️⃣ DURING Work:**
```bash
npx claude-flow@alpha hooks post-edit --file "[file]" --memory-key "swarm/[agent]/[step]"
npx claude-flow@alpha hooks notify --message "[what was done]"
```

**3️⃣ AFTER Work:**
```bash
npx claude-flow@alpha hooks post-task --task-id "[task]"
npx claude-flow@alpha hooks session-end --export-metrics true
```

## Build & Development Commands

```bash
# Package management
npm install
npm run build
npm run test
npm run lint

# Claude Flow commands
npx claude-flow@alpha init
npx claude-flow@alpha hooks setup
npx claude-flow@alpha memory store
```

## Javascript Configuration

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

## Typescript Configuration

### TypeScript Configuration & Patterns

**Type Safety & Standards:**
- Use strict TypeScript configuration
- Prefer interfaces over types for object shapes
- Use utility types (Partial, Pick, Omit, Record)
- Implement proper generic constraints
- Avoid `any` type - use `unknown` when necessary

**TypeScript Config (tsconfig.json):**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "build"]
}
```

**Concurrent Agent Execution:**
```typescript
// ✅ CORRECT: TypeScript development with strict typing
[Single Message]:
  Task("TypeScript Developer", "Build type-safe modules with generics", "coder")
  Task("Interface Designer", "Design comprehensive type definitions", "system-architect")
  Task("Test Engineer", "Write typed tests with Jest and @types", "tester")
  Task("Build Engineer", "Configure TypeScript compilation pipeline", "backend-dev")
  Task("Type Reviewer", "Review type safety and consistency", "reviewer")

  // Batch file operations with TypeScript focus
  Write("src/types/api.ts")
  Write("src/services/ApiService.ts")
  Write("src/utils/validators.ts")
  Write("tests/ApiService.test.ts")

  // TypeScript-specific todos
  TodoWrite({ todos: [
    {content: "Define core type interfaces", status: "in_progress", activeForm: "Defining core type interfaces"},
    {content: "Implement generic utility functions", status: "pending", activeForm: "Implementing generic utility functions"},
    {content: "Add runtime type validation", status: "pending", activeForm: "Adding runtime type validation"},
    {content: "Configure path mapping aliases", status: "pending", activeForm: "Configuring path mapping aliases"},
    {content: "Setup strict linting rules", status: "pending", activeForm: "Setting up strict linting rules"}
  ]})
```

**Type Definitions Pattern:**
```typescript
// types/api.ts
export interface ApiResponse<T = unknown> {
  data: T;
  message: string;
  status: 'success' | 'error';
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
  };
}

// Generic service interface
export interface CRUDService<T, CreateT = Partial<T>, UpdateT = Partial<T>> {
  getAll(): Promise<ApiResponse<T[]>>;
  getById(id: string): Promise<ApiResponse<T>>;
  create(data: CreateT): Promise<ApiResponse<T>>;
  update(id: string, data: UpdateT): Promise<ApiResponse<T>>;
  delete(id: string): Promise<ApiResponse<void>>;
}
```

**Advanced TypeScript Patterns:**
```typescript
// Utility types for better type inference
type NonNullable<T> = T extends null | undefined ? never : T;

// Conditional types for API responses
type ApiResult<T> = T extends string
  ? ApiResponse<string>
  : T extends number
  ? ApiResponse<number>
  : ApiResponse<T>;

// Template literal types for routes
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type ApiRoute<T extends string> = `/api/${T}`;

// Branded types for stronger type safety
type UserId = string & { readonly __brand: unique symbol };
type Email = string & { readonly __brand: unique symbol };

// Factory function with proper typing
function createUserId(value: string): UserId {
  // Runtime validation here
  return value as UserId;
}
```

**Testing with TypeScript:**
```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

interface MockApiService {
  fetchUser: jest.MockedFunction<(id: string) => Promise<User>>;
}

describe('UserService', () => {
  let mockApi: MockApiService;
  let userService: UserService;

  beforeEach(() => {
    mockApi = {
      fetchUser: jest.fn()
    };
    userService = new UserService(mockApi);
  });

  it('should fetch user with proper typing', async () => {
    const mockUser: User = {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com'
    };

    mockApi.fetchUser.mockResolvedValue(mockUser);

    const result = await userService.getUser('user-123');

    expect(result).toEqual(mockUser);
    expect(mockApi.fetchUser).toHaveBeenCalledWith('user-123');
  });
});
```

**Error Handling with Types:**
```typescript
// Result pattern for better error handling
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

class ApiService {
  async fetchData<T>(url: string): Promise<Result<T, ApiError>> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return { success: false, error: new ApiError(response.statusText) };
      }
      const data = await response.json() as T;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error as ApiError };
    }
  }
}

// Usage with proper type checking
const result = await apiService.fetchData<User>('/api/users/123');
if (result.success) {
  console.log(result.data.name); // TypeScript knows this is User
} else {
  console.error(result.error.message); // TypeScript knows this is ApiError
}
```

**Module Organization:**
```
src/
  types/
    api.ts          # API response types
    domain.ts       # Business domain types
    utils.ts        # Utility types
  services/
    BaseService.ts  # Generic base service
    UserService.ts  # Concrete implementations
  utils/
    validators.ts   # Runtime type validation
    typeGuards.ts   # Type guard functions
  hooks/           # Custom hooks (if React)
    useApi.ts      # Generic API hook
```

## React Framework Configuration

### React Development Patterns

**Component Architecture:**
- Use functional components with hooks
- Implement proper component composition
- Follow single responsibility principle
- Use TypeScript for better type safety
- Implement proper error boundaries

**Concurrent Agent Execution:**
```jsx
// ✅ CORRECT: React development with specialized agents
[Single Message]:
  Task("React Developer", "Build reusable components with hooks and context", "coder")
  Task("State Manager", "Implement Redux Toolkit/Zustand state management", "system-architect")
  Task("UI Designer", "Create responsive layouts with CSS-in-JS/Tailwind", "coder")
  Task("Test Engineer", "Write React Testing Library tests with coverage", "tester")
  Task("Performance Engineer", "Optimize renders and bundle size", "perf-analyzer")

  // Batch React file operations
  Write("src/components/App.jsx")
  Write("src/hooks/useApi.js")
  Write("src/context/AppContext.jsx")
  Write("src/styles/globals.css")
  Write("tests/components/App.test.jsx")

  // React-specific todos
  TodoWrite({ todos: [
    {content: "Setup component library structure", status: "in_progress", activeForm: "Setting up component library structure"},
    {content: "Implement custom hooks for data fetching", status: "pending", activeForm: "Implementing custom hooks for data fetching"},
    {content: "Add error boundaries and loading states", status: "pending", activeForm: "Adding error boundaries and loading states"},
    {content: "Configure routing with React Router", status: "pending", activeForm: "Configuring routing with React Router"},
    {content: "Optimize performance with memoization", status: "pending", activeForm: "Optimizing performance with memoization"}
  ]})
```

**Project Structure:**
```
src/
  components/
    common/           # Reusable UI components
      Button.jsx
      Modal.jsx
      Input.jsx
    layout/           # Layout components
      Header.jsx
      Sidebar.jsx
      Footer.jsx
    pages/            # Page-level components
      HomePage.jsx
      UserProfile.jsx
  hooks/              # Custom hooks
    useApi.js
    useLocalStorage.js
    useAuth.js
  context/            # React context providers
    AuthContext.jsx
    ThemeContext.jsx
  services/           # API services
    api.js
    auth.js
  utils/              # Helper functions
    validators.js
    formatters.js
  styles/             # Global styles
    globals.css
    variables.css
```

**Component Patterns:**
```jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';

// Functional component with hooks
const UserProfile = ({ userId, onUpdate }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoized expensive calculations
  const userStats = useMemo(() => {
    if (!user) return null;
    return {
      totalPosts: user.posts?.length || 0,
      joinedDate: new Date(user.createdAt).toLocaleDateString()
    };
  }, [user]);

  // Memoized callbacks to prevent unnecessary re-renders
  const handleUpdateUser = useCallback(async (updates) => {
    try {
      const updatedUser = await updateUser(userId, updates);
      setUser(updatedUser);
      onUpdate?.(updatedUser);
    } catch (err) {
      setError(err.message);
    }
  }, [userId, onUpdate]);

  useEffect(() => {
    let cancelled = false;

    const fetchUser = async () => {
      try {
        setLoading(true);
        const userData = await getUserById(userId);
        if (!cancelled) {
          setUser(userData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchUser();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!user) return <NotFound />;

  return (
    <div className="user-profile">
      <ProfileHeader user={user} stats={userStats} />
      <ProfileContent user={user} onUpdate={handleUpdateUser} />
    </div>
  );
};

UserProfile.propTypes = {
  userId: PropTypes.string.isRequired,
  onUpdate: PropTypes.func
};

export default React.memo(UserProfile);
```

**Custom Hooks Pattern:**
```jsx
import { useState, useEffect, useCallback } from 'react';

// Generic API hook
export const useApi = (url, options = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url, options]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch };
};

// Local storage hook
export const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
};
```

**Context Pattern:**
```jsx
import React, { createContext, useContext, useReducer, useCallback } from 'react';

// State and actions
const initialState = {
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null
};

const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, loading: true, error: null };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        loading: false,
        error: null
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        loading: false,
        error: action.payload
      };
    case 'LOGOUT':
      return initialState;
    default:
      return state;
  }
};

// Context creation
const AuthContext = createContext();

// Provider component
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const login = useCallback(async (credentials) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const user = await authService.login(credentials);
      dispatch({ type: 'LOGIN_SUCCESS', payload: user });
      return user;
    } catch (error) {
      dispatch({ type: 'LOGIN_FAILURE', payload: error.message });
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    dispatch({ type: 'LOGOUT' });
  }, []);

  const value = {
    ...state,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook for using auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

**Testing with React Testing Library:**
```jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';
import UserProfile from '../UserProfile';
import * as api from '../../services/api';

// Mock the API module
jest.mock('../../services/api');

describe('UserProfile', () => {
  const mockUser = {
    id: '123',
    name: 'John Doe',
    email: 'john@example.com',
    posts: [{ id: 1, title: 'Test Post' }]
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders user profile after loading', async () => {
    api.getUserById.mockResolvedValue(mockUser);

    render(<UserProfile userId="123" />);

    // Check loading state
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    // Wait for user data to load
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('1 Posts')).toBeInTheDocument();
  });

  test('handles update user interaction', async () => {
    const user = userEvent.setup();
    const onUpdate = jest.fn();

    api.getUserById.mockResolvedValue(mockUser);
    api.updateUser.mockResolvedValue({ ...mockUser, name: 'Jane Doe' });

    render(<UserProfile userId="123" onUpdate={onUpdate} />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    const nameInput = screen.getByDisplayValue('John Doe');
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({ ...mockUser, name: 'Jane Doe' });
    });
  });

  test('displays error message on API failure', async () => {
    api.getUserById.mockRejectedValue(new Error('Network error'));

    render(<UserProfile userId="123" />);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
```

**Performance Optimization:**
```jsx
import React, { memo, lazy, Suspense } from 'react';

// Lazy loading for code splitting
const LazyUserProfile = lazy(() => import('./UserProfile'));
const LazyUserSettings = lazy(() => import('./UserSettings'));

// Memoized component to prevent unnecessary re-renders
const UserCard = memo(({ user, onUpdate }) => {
  return (
    <div className="user-card">
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      <button onClick={() => onUpdate(user.id)}>
        Update
      </button>
    </div>
  );
});

// Main app with lazy loading
const App = () => {
  return (
    <div className="app">
      <Suspense fallback={<div>Loading...</div>}>
        <Routes>
          <Route path="/profile" element={<LazyUserProfile />} />
          <Route path="/settings" element={<LazyUserSettings />} />
        </Routes>
      </Suspense>
    </div>
  );
};
```

**State Management with Zustand:**
```jsx
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

const useUserStore = create(
  devtools(
    persist(
      (set, get) => ({
        users: [],
        currentUser: null,
        loading: false,

        fetchUsers: async () => {
          set({ loading: true });
          try {
            const users = await api.getUsers();
            set({ users, loading: false });
          } catch (error) {
            set({ loading: false });
            throw error;
          }
        },

        setCurrentUser: (user) => set({ currentUser: user }),

        updateUser: async (userId, updates) => {
          const updatedUser = await api.updateUser(userId, updates);
          set((state) => ({
            users: state.users.map((user) =>
              user.id === userId ? updatedUser : user
            ),
            currentUser: state.currentUser?.id === userId ? updatedUser : state.currentUser
          }));
          return updatedUser;
        }
      }),
      { name: 'user-store' }
    )
  )
);

// Usage in component
const UserList = () => {
  const { users, loading, fetchUsers } = useUserStore();

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
};
```

## 🚀 Concurrent Execution Patterns

### JavaScript/TypeScript Patterns

```javascript
// ✅ CORRECT: Batch all operations in single message
[Single Message]:
  Task("Frontend Developer", "Build React components with hooks", "coder")
  Task("Backend Developer", "Create Express API endpoints", "backend-dev")
  Task("Test Engineer", "Write Jest tests with >80% coverage", "tester")
  
  // Batch file operations
  Write("src/components/App.jsx")
  Write("src/api/server.js")
  Write("tests/App.test.js")
```

### Python Patterns

```python
# ✅ CORRECT: Parallel agent execution
[Single Message]:
  Task("Django Developer", "Build models and views with DRF", "backend-dev")
  Task("Frontend Developer", "Create React frontend with API integration", "coder")
  Task("Test Engineer", "Write pytest tests with fixtures", "tester")
  
  # Batch Python operations
  Write("apps/models.py")
  Write("apps/views.py")
  Write("tests/test_models.py")
```

### React Development Patterns

```javascript
// React-specific concurrent patterns
[Single Message]:
  Task("Component Developer", "Build reusable components with TypeScript", "coder")
  Task("State Manager", "Implement Redux/Context state management", "coder")
  Task("Test Engineer", "Write React Testing Library tests", "tester")
  Task("Style Developer", "Create responsive CSS/Styled Components", "coder")
```

### API Development Patterns

```bash
# API-focused concurrent execution
[Single Message]:
  Task("API Developer", "Build RESTful endpoints with validation", "backend-dev")
  Task("Database Designer", "Design schema and migrations", "code-analyzer")
  Task("Security Engineer", "Implement authentication and authorization", "reviewer")
  Task("API Tester", "Create integration and unit tests", "tester")
  Task("Documentation Writer", "Generate OpenAPI/Swagger docs", "researcher")
```



## 📋 Best Practices

### General Development
- **Modular Design**: Keep files under 500 lines
- **Environment Safety**: Never hardcode secrets
- **Test-First**: Write tests before implementation
- **Clean Architecture**: Separate concerns
- **Documentation**: Keep updated

### JavaScript/TypeScript
- **ES6+ Features**: Use modern JavaScript syntax
- **Type Safety**: Prefer TypeScript for larger projects
- **Async/Await**: Use async/await over Promise chains
- **Error Handling**: Implement proper error boundaries
- **Code Splitting**: Lazy load components and routes

### Python
- **PEP 8**: Follow Python style guidelines
- **Type Hints**: Use type annotations for clarity
- **Virtual Environments**: Always use venv or conda
- **Docstrings**: Document all functions and classes
- **Error Handling**: Use specific exception types



## 🧪 Testing Patterns

### React Testing

```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Component testing pattern
describe('Component', () => {
  test('renders and handles interaction', async () => {
    const user = userEvent.setup();
    render(<Component />);
    
    const button = screen.getByRole('button');
    await user.click(button);
    
    expect(screen.getByText(/result/i)).toBeInTheDocument();
  });
});
```

### Python Testing

```python
import pytest
from unittest.mock import patch, MagicMock

class TestAPI:
    @pytest.fixture
    def client(self):
        return TestClient()

    def test_endpoint(self, client):
        response = client.get("/api/endpoint")
        assert response.status_code == 200
        assert response.json()["status"] == "success"
```

