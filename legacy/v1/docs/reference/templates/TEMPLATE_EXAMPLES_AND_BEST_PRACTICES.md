# Template Configuration Examples and Best Practices

## Overview

This guide provides comprehensive examples and best practices for configuring and using the Claude Flow Novice template system. It includes real-world scenarios, configuration patterns, and optimization strategies.

## Table of Contents

1. [Basic Configuration Examples](#basic-configuration-examples)
2. [Language-Specific Templates](#language-specific-templates)
3. [Framework Integration Patterns](#framework-integration-patterns)
4. [Advanced Configuration Strategies](#advanced-configuration-strategies)
5. [Team and Enterprise Configurations](#team-and-enterprise-configurations)
6. [Performance Optimization](#performance-optimization)
7. [Troubleshooting Common Issues](#troubleshooting-common-issues)

## Basic Configuration Examples

### Example 1: Beginner JavaScript Developer

#### Preference Configuration
```json
{
  "experience": {
    "level": "beginner",
    "background": ["Frontend Development"],
    "goals": "Learn modern JavaScript development with AI assistance"
  },
  "documentation": {
    "verbosity": "detailed",
    "explanations": true,
    "codeComments": "detailed",
    "stepByStep": true
  },
  "feedback": {
    "tone": "friendly",
    "errorHandling": "guided",
    "notifications": true,
    "confirmations": "important"
  },
  "workflow": {
    "defaultAgents": ["researcher", "coder"],
    "concurrency": 2,
    "autoSave": true,
    "testRunning": "completion"
  },
  "advanced": {
    "memoryPersistence": false,
    "neuralLearning": false,
    "hookIntegration": false,
    "customAgents": ""
  },
  "project": {
    "language": "javascript",
    "frameworks": ["React"],
    "buildTool": "vite",
    "packageManager": "npm"
  }
}
```

#### Generated CLAUDE.md Template
```markdown
# Claude Code Configuration - React Development Environment

## 🚨 CRITICAL: CONCURRENT EXECUTION & FILE MANAGEMENT

**ABSOLUTE RULES**:
1. ALL operations MUST be concurrent/parallel in a single message
2. **NEVER save working files, text/mds and tests to the root folder**
3. ALWAYS organize files in appropriate subdirectories
4. **USE CLAUDE CODE'S TASK TOOL** for spawning agents concurrently

### ⚡ GOLDEN RULE: "1 MESSAGE = ALL RELATED OPERATIONS"

**MANDATORY PATTERNS:**
- **TodoWrite**: ALWAYS batch ALL todos in ONE call (5-10+ todos minimum)
- **Task tool (Claude Code)**: ALWAYS spawn ALL agents in ONE message with full instructions
- **File operations**: ALWAYS batch ALL reads/writes/edits in ONE message

## Project Overview

**Project Type**: React Web Application
**Primary Language**: JavaScript
**Primary Framework**: React
**Package Manager**: npm
**Build Tools**: Vite

### Beginner-Friendly Development Patterns

**Recommended Agent Workflow:**
```javascript
// ✅ CORRECT: Beginner-friendly React development
[Single Message]:
  Task("Research Agent", "Analyze React best practices for beginners. Provide detailed explanations of component patterns.", "researcher")
  Task("React Developer", "Build components using functional patterns. Include detailed comments explaining each step.", "coder")
  Task("Test Engineer", "Create Jest tests with clear explanations of testing strategies.", "tester")

  // Batch todos with educational focus
  TodoWrite({ todos: [
    {content: "Learn React component fundamentals", status: "in_progress", activeForm: "Learning React component fundamentals"},
    {content: "Understand state management with hooks", status: "pending", activeForm: "Understanding state management with hooks"},
    {content: "Practice component composition", status: "pending", activeForm: "Practicing component composition"},
    {content: "Learn testing strategies", status: "pending", activeForm: "Learning testing strategies"},
    {content: "Understand build process", status: "pending", activeForm: "Understanding build process"}
  ]})
```

### Learning-Focused Code Patterns

**Component Development:**
```jsx
// Beginner-friendly component with detailed comments
import React, { useState, useEffect } from 'react';

/**
 * UserProfile Component
 *
 * This component displays user information and demonstrates:
 * - useState hook for local state management
 * - useEffect hook for side effects
 * - Props destructuring for cleaner code
 * - Conditional rendering patterns
 *
 * @param {Object} props - Component props
 * @param {string} props.userId - The ID of the user to display
 * @param {Function} props.onUserUpdate - Callback when user data changes
 */
const UserProfile = ({ userId, onUserUpdate }) => {
  // State to hold user data - starts as null to indicate loading
  const [user, setUser] = useState(null);
  // State to track loading status for better UX
  const [loading, setLoading] = useState(true);
  // State to handle any errors that might occur
  const [error, setError] = useState(null);

  // useEffect runs after component mounts and when userId changes
  useEffect(() => {
    // Define async function inside useEffect (best practice)
    const fetchUser = async () => {
      try {
        setLoading(true);
        setError(null);

        // API call to fetch user data
        const response = await fetch(`/api/users/${userId}`);

        // Check if request was successful
        if (!response.ok) {
          throw new Error(`Failed to fetch user: ${response.statusText}`);
        }

        const userData = await response.json();
        setUser(userData);

        // Notify parent component of user data
        onUserUpdate?.(userData);
      } catch (err) {
        // Handle errors gracefully
        setError(err.message);
        console.error('Error fetching user:', err);
      } finally {
        // Always stop loading, regardless of success or failure
        setLoading(false);
      }
    };

    // Only fetch if we have a userId
    if (userId) {
      fetchUser();
    }
  }, [userId, onUserUpdate]); // Dependencies array - effect runs when these change

  // Early return patterns for different states
  if (loading) {
    return (
      <div className="user-profile loading">
        <p>Loading user profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="user-profile error">
        <p>Error: {error}</p>
        <button onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="user-profile not-found">
        <p>User not found</p>
      </div>
    );
  }

  // Main render - user data is available
  return (
    <div className="user-profile">
      <div className="user-header">
        <img
          src={user.avatar || '/default-avatar.png'}
          alt={`${user.name}'s avatar`}
          className="user-avatar"
        />
        <h2>{user.name}</h2>
      </div>

      <div className="user-details">
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Role:</strong> {user.role}</p>
        <p><strong>Joined:</strong> {new Date(user.createdAt).toLocaleDateString()}</p>
      </div>

      {user.bio && (
        <div className="user-bio">
          <h3>About</h3>
          <p>{user.bio}</p>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
```

## Build Commands

```bash
# Development server with hot reloading
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm test

# Claude Flow commands
npx claude-flow@alpha init --enhanced
npx claude-flow@alpha hooks setup
npx claude-flow@alpha memory store
```
```

### Example 2: Advanced TypeScript Developer

#### Preference Configuration
```json
{
  "experience": {
    "level": "advanced",
    "background": ["Full-Stack Development", "DevOps/Infrastructure"],
    "goals": "Optimize development workflows with advanced AI agent coordination"
  },
  "documentation": {
    "verbosity": "minimal",
    "explanations": false,
    "codeComments": "minimal",
    "stepByStep": false
  },
  "feedback": {
    "tone": "direct",
    "errorHandling": "immediate",
    "notifications": false,
    "confirmations": "destructive"
  },
  "workflow": {
    "defaultAgents": ["researcher", "coder", "reviewer", "tester"],
    "concurrency": 6,
    "autoSave": true,
    "testRunning": "continuous"
  },
  "advanced": {
    "memoryPersistence": true,
    "neuralLearning": true,
    "hookIntegration": true,
    "customAgents": "performance-analyzer,security-auditor"
  }
}
```

#### Generated Advanced Template
```markdown
# Claude Code Configuration - Advanced TypeScript Environment

## Concurrent Execution & Performance Optimization

**High-Performance Patterns:**
```typescript
// ✅ OPTIMIZED: Advanced concurrent agent execution
[Single Message]:
  Task("System Architect", "Design scalable TypeScript architecture with advanced patterns", "system-architect")
  Task("Performance Optimizer", "Implement optimization strategies", "performance-analyzer")
  Task("Security Auditor", "Conduct comprehensive security analysis", "security-auditor")
  Task("Advanced Coder", "Implement with advanced TypeScript features", "coder")
  Task("Test Engineer", "Parallel test execution with coverage analysis", "tester")
  Task("Code Reviewer", "Static analysis and performance review", "reviewer")

  // High-velocity development todos
  TodoWrite({ todos: [
    {content: "Architect type-safe system", status: "in_progress", activeForm: "Architecting type-safe system"},
    {content: "Implement advanced patterns", status: "pending", activeForm: "Implementing advanced patterns"},
    {content: "Optimize bundle performance", status: "pending", activeForm: "Optimizing bundle performance"},
    {content: "Security audit", status: "pending", activeForm: "Conducting security audit"},
    {content: "Parallel test execution", status: "pending", activeForm: "Setting up parallel test execution"},
    {content: "CI/CD optimization", status: "pending", activeForm: "Optimizing CI/CD pipeline"}
  ]})
```

### Advanced TypeScript Patterns

**Generic Service Architecture:**
```typescript
interface ApiResponse<T = unknown> {
  data: T;
  status: 'success' | 'error';
  message: string;
  timestamp: string;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
  };
}

abstract class BaseService<T, CreateT = Partial<T>, UpdateT = Partial<T>> {
  protected abstract endpoint: string;

  protected async request<R>(method: string, url: string, data?: unknown): Promise<R> {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  async getAll(): Promise<ApiResponse<T[]>> {
    return this.request('GET', this.endpoint);
  }

  async getById(id: string): Promise<ApiResponse<T>> {
    return this.request('GET', `${this.endpoint}/${id}`);
  }

  async create(data: CreateT): Promise<ApiResponse<T>> {
    return this.request('POST', this.endpoint, data);
  }

  async update(id: string, data: UpdateT): Promise<ApiResponse<T>> {
    return this.request('PUT', `${this.endpoint}/${id}`, data);
  }

  async delete(id: string): Promise<ApiResponse<void>> {
    return this.request('DELETE', `${this.endpoint}/${id}`);
  }
}
```
```

## Language-Specific Templates

### JavaScript/Node.js Project Templates

#### Express API Template
```javascript
// Generated for: Node.js Express API project
// Detection: package.json with express dependency

### Express API Development Patterns

**Project Structure:**
```
src/
├── controllers/          # Route handlers
├── middleware/          # Custom middleware
├── models/             # Data models
├── routes/             # Route definitions
├── services/           # Business logic
├── utils/              # Helper functions
└── config/             # Configuration files
```

**Concurrent Development Workflow:**
```javascript
[Single Message]:
  Task("API Architect", "Design RESTful API structure with OpenAPI specs", "system-architect")
  Task("Backend Developer", "Implement Express routes with middleware", "backend-dev")
  Task("Database Designer", "Design schema and migrations", "code-analyzer")
  Task("Security Engineer", "Implement auth and security middleware", "reviewer")
  Task("Test Engineer", "Create API tests with supertest", "tester")
  Task("Documentation Writer", "Generate API documentation", "api-docs")

  // API-focused development todos
  TodoWrite({ todos: [
    {content: "Design API endpoints", status: "in_progress", activeForm: "Designing API endpoints"},
    {content: "Implement authentication", status: "pending", activeForm: "Implementing authentication"},
    {content: "Add input validation", status: "pending", activeForm: "Adding input validation"},
    {content: "Error handling middleware", status: "pending", activeForm: "Creating error handling middleware"},
    {content: "Rate limiting", status: "pending", activeForm: "Implementing rate limiting"},
    {content: "API documentation", status: "pending", activeForm: "Writing API documentation"}
  ]})
```

**Express Best Practices:**
```javascript
// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: {
      message,
      status,
      timestamp: new Date().toISOString(),
      path: req.path
    }
  });
};

// Async route wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Route with validation
app.post('/api/users',
  validateSchema(userSchema),
  asyncHandler(async (req, res) => {
    const user = await userService.create(req.body);
    res.status(201).json({ success: true, data: user });
  })
);
```
```

#### React Component Library Template
```javascript
// Generated for: React component library project
// Detection: package.json with react in peerDependencies

### Component Library Development

**Library Structure:**
```
src/
├── components/
│   ├── Button/
│   │   ├── Button.jsx
│   │   ├── Button.test.jsx
│   │   ├── Button.stories.jsx
│   │   └── index.js
│   └── index.js           # Main export
├── hooks/                 # Custom hooks
├── utils/                 # Shared utilities
└── themes/               # Design tokens
```

**Component Development Workflow:**
```javascript
[Single Message]:
  Task("Design System Architect", "Define design tokens and component API", "system-architect")
  Task("Component Developer", "Build reusable React components", "coder")
  Task("Accessibility Expert", "Ensure WCAG compliance", "reviewer")
  Task("Storybook Engineer", "Create interactive documentation", "api-docs")
  Task("Test Engineer", "Component testing with RTL", "tester")

  // Component library todos
  TodoWrite({ todos: [
    {content: "Define design system tokens", status: "in_progress", activeForm: "Defining design system tokens"},
    {content: "Build base components", status: "pending", activeForm: "Building base components"},
    {content: "Add accessibility features", status: "pending", activeForm: "Adding accessibility features"},
    {content: "Create Storybook stories", status: "pending", activeForm: "Creating Storybook stories"},
    {content: "Write component tests", status: "pending", activeForm: "Writing component tests"},
    {content: "Bundle optimization", status: "pending", activeForm: "Optimizing bundle"}
  ]})
```
```

### Python Project Templates

#### Django REST API Template
```python
# Generated for: Django REST API project
# Detection: requirements.txt with Django and djangorestframework

### Django REST API Development

**Project Structure:**
```
project/
├── apps/
│   ├── users/            # User management app
│   ├── authentication/   # Auth logic
│   └── core/            # Shared utilities
├── config/
│   ├── settings/        # Environment-specific settings
│   ├── urls.py         # URL configuration
│   └── wsgi.py         # WSGI application
└── requirements/        # Environment-specific requirements
```

**Django Development Workflow:**
```python
[Single Message]:
  Task("Django Architect", "Design Django app structure and models", "system-architect")
  Task("API Developer", "Implement DRF serializers and viewsets", "backend-dev")
  Task("Database Engineer", "Create migrations and optimize queries", "code-analyzer")
  Task("Security Auditor", "Implement Django security best practices", "reviewer")
  Task("Test Engineer", "Write pytest tests with factories", "tester")

  # Django-specific todos
  TodoWrite({ todos: [
    {content: "Design model relationships", status: "in_progress", activeForm: "Designing model relationships"},
    {content: "Create DRF serializers", status: "pending", activeForm: "Creating DRF serializers"},
    {content: "Implement authentication", status: "pending", activeForm: "Implementing authentication"},
    {content: "Add input validation", status: "pending", activeForm: "Adding input validation"},
    {content: "Query optimization", status: "pending", activeForm: "Optimizing database queries"},
    {content: "API documentation", status: "pending", activeForm: "Writing API documentation"}
  ]})
```

**Django Best Practices:**
```python
# Model best practices
from django.db import models
from django.contrib.auth.models import AbstractUser

class TimestampedModel(models.Model):
    """Abstract base class with created/updated timestamps."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

class User(AbstractUser):
    """Custom user model with additional fields."""
    email = models.EmailField(unique=True)
    is_verified = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

# DRF ViewSet with proper permissions
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

class UserViewSet(viewsets.ModelViewSet):
    """User management endpoints."""
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        """Set permissions based on action."""
        if self.action == 'create':
            permission_classes = [permissions.AllowAny]
        elif self.action in ['update', 'partial_update', 'destroy']:
            permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
        else:
            permission_classes = self.permission_classes
        return [permission() for permission in permission_classes]

    @action(detail=True, methods=['post'])
    def set_password(self, request, pk=None):
        """Change user password."""
        user = self.get_object()
        serializer = PasswordSerializer(data=request.data)
        if serializer.is_valid():
            user.set_password(serializer.validated_data['password'])
            user.save()
            return Response({'status': 'password set'})
        return Response(serializer.errors, status=400)
```
```

## Framework Integration Patterns

### React + TypeScript + Vite Template

#### Advanced Integration Configuration
```typescript
// Generated for: React + TypeScript + Vite project
// Detection: vite.config.ts with @vitejs/plugin-react

### React TypeScript Vite Development

**Optimized Development Environment:**
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@hooks': resolve(__dirname, 'src/hooks'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@types': resolve(__dirname, 'src/types'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

**Component Development Patterns:**
```typescript
// Advanced React TypeScript patterns
import React, { createContext, useContext, useReducer, ReactNode } from 'react';

// Type-safe context pattern
interface AppState {
  user: User | null;
  theme: 'light' | 'dark';
  loading: boolean;
}

type AppAction =
  | { type: 'SET_USER'; payload: User }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' }
  | { type: 'SET_LOADING'; payload: boolean };

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

// Custom hook with type safety
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

// Reducer with exhaustive type checking
const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      // TypeScript ensures this is unreachable
      const _exhaustive: never = action;
      return state;
  }
};

// Provider component with proper typing
interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, {
    user: null,
    theme: 'light',
    loading: false,
  });

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};
```

**Agent Coordination for React Development:**
```typescript
[Single Message]:
  Task("React Architect", "Design component hierarchy and state management", "system-architect")
  Task("TypeScript Engineer", "Implement type-safe patterns and interfaces", "coder")
  Task("Performance Optimizer", "Optimize bundle size and runtime performance", "performance-analyzer")
  Task("Accessibility Engineer", "Ensure WCAG compliance and screen reader support", "reviewer")
  Task("Test Engineer", "Create comprehensive tests with RTL and MSW", "tester")
  Task("Build Engineer", "Optimize Vite configuration and build pipeline", "backend-dev")

  // React TypeScript development todos
  TodoWrite({ todos: [
    {content: "Design component architecture", status: "in_progress", activeForm: "Designing component architecture"},
    {content: "Implement type-safe state management", status: "pending", activeForm: "Implementing type-safe state management"},
    {content: "Create reusable component library", status: "pending", activeForm: "Creating reusable component library"},
    {content: "Add accessibility features", status: "pending", activeForm: "Adding accessibility features"},
    {content: "Optimize bundle performance", status: "pending", activeForm: "Optimizing bundle performance"},
    {content: "Write comprehensive tests", status: "pending", activeForm: "Writing comprehensive tests"},
    {content: "Setup CI/CD pipeline", status: "pending", activeForm: "Setting up CI/CD pipeline"}
  ]})
```
```

### Next.js Full-Stack Template

#### App Router Configuration
```typescript
// Generated for: Next.js 13+ with App Router
// Detection: next.config.js with app directory

### Next.js App Router Development

**Project Structure:**
```
app/
├── (auth)/              # Route groups
│   ├── login/
│   └── register/
├── api/                # API routes
│   ├── auth/
│   └── users/
├── dashboard/          # Dashboard pages
├── globals.css        # Global styles
├── layout.tsx         # Root layout
└── page.tsx          # Home page
```

**Full-Stack Development Workflow:**
```typescript
[Single Message]:
  Task("Full-Stack Architect", "Design Next.js app structure with API routes", "system-architect")
  Task("Frontend Developer", "Build React components with Server Components", "coder")
  Task("Backend Developer", "Implement API routes with proper validation", "backend-dev")
  Task("Database Engineer", "Set up Prisma schema and migrations", "code-analyzer")
  Task("SEO Specialist", "Optimize metadata and page performance", "reviewer")
  Task("Test Engineer", "E2E testing with Playwright", "tester")

  // Next.js full-stack todos
  TodoWrite({ todos: [
    {content: "Configure app router structure", status: "in_progress", activeForm: "Configuring app router structure"},
    {content: "Implement server components", status: "pending", activeForm: "Implementing server components"},
    {content: "Create API routes", status: "pending", activeForm: "Creating API routes"},
    {content: "Set up database schema", status: "pending", activeForm: "Setting up database schema"},
    {content: "Add authentication system", status: "pending", activeForm: "Adding authentication system"},
    {content: "Optimize SEO and performance", status: "pending", activeForm: "Optimizing SEO and performance"},
    {content: "Deploy to Vercel", status: "pending", activeForm: "Deploying to Vercel"}
  ]})
```

**Next.js Best Practices:**
```typescript
// app/layout.tsx - Root layout with proper metadata
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    template: '%s | My App',
    default: 'My App',
  },
  description: 'A modern web application built with Next.js',
  keywords: ['Next.js', 'React', 'TypeScript'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <main>{children}</main>
      </body>
    </html>
  );
}

// app/api/users/route.ts - API route with validation
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = createUserSchema.parse(body);

    // Create user logic here
    const user = await createUser(validatedData);

    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// app/dashboard/page.tsx - Server component with data fetching
import { Suspense } from 'react';

async function getUserData() {
  // This runs on the server
  const res = await fetch('http://localhost:3000/api/users', {
    cache: 'no-store', // Disable caching for dynamic data
  });

  if (!res.ok) {
    throw new Error('Failed to fetch user data');
  }

  return res.json();
}

export default async function DashboardPage() {
  const userData = await getUserData();

  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<div>Loading user data...</div>}>
        <UserProfile data={userData} />
      </Suspense>
    </div>
  );
}
```
```

## Advanced Configuration Strategies

### Multi-Environment Configuration

#### Development vs Production Settings
```json
{
  "development": {
    "documentation": {
      "verbosity": "detailed",
      "explanations": true
    },
    "workflow": {
      "concurrency": 2,
      "confirmations": "important"
    },
    "advanced": {
      "memoryPersistence": true,
      "neuralLearning": false
    }
  },
  "production": {
    "documentation": {
      "verbosity": "minimal",
      "explanations": false
    },
    "workflow": {
      "concurrency": 6,
      "confirmations": "destructive"
    },
    "advanced": {
      "memoryPersistence": true,
      "neuralLearning": true
    }
  }
}
```

### Context-Aware Templates

#### Dynamic Template Selection
```javascript
// Template selection based on project context
const selectTemplate = (context) => {
  const { projectType, teamSize, complexity, timeline } = context;

  if (teamSize <= 2 && complexity === 'low') {
    return 'minimal-solo-dev';
  }

  if (teamSize > 5 && complexity === 'high') {
    return 'enterprise-team';
  }

  if (timeline === 'tight' && projectType === 'mvp') {
    return 'rapid-prototype';
  }

  return 'standard-development';
};

// Context-specific agent configurations
const getAgentConfig = (template) => {
  const configs = {
    'minimal-solo-dev': {
      agents: ['researcher', 'coder'],
      concurrency: 1,
      verbosity: 'standard'
    },
    'enterprise-team': {
      agents: ['system-architect', 'backend-dev', 'frontend-dev', 'reviewer', 'tester', 'documenter'],
      concurrency: 6,
      verbosity: 'minimal'
    },
    'rapid-prototype': {
      agents: ['researcher', 'coder', 'reviewer'],
      concurrency: 3,
      verbosity: 'minimal',
      skipTests: false,
      skipDocs: true
    }
  };

  return configs[template] || configs['standard-development'];
};
```

### Performance-Optimized Templates

#### High-Throughput Configuration
```json
{
  "performance": {
    "workflow": {
      "concurrency": 8,
      "batchSize": 50,
      "parallelExecution": true,
      "streamingOutput": true
    },
    "memory": {
      "cacheSize": "1GB",
      "persistentSessions": true,
      "compressionEnabled": true
    },
    "agents": {
      "preloadModels": true,
      "reuseConnections": true,
      "optimizeForSpeed": true
    }
  }
}
```

## Team and Enterprise Configurations

### Team Standardization Template

#### Shared Team Configuration
```json
{
  "team": {
    "name": "Frontend Team Alpha",
    "standards": {
      "codeStyle": "airbnb",
      "testCoverage": 85,
      "reviewRequired": true,
      "cicdIntegration": true
    },
    "workflow": {
      "defaultAgents": ["researcher", "coder", "reviewer", "tester"],
      "branchingStrategy": "gitflow",
      "deploymentStrategy": "blue-green"
    },
    "tools": {
      "linter": "eslint",
      "formatter": "prettier",
      "bundler": "webpack",
      "testing": "jest"
    }
  }
}
```

#### Enterprise Security Configuration
```json
{
  "security": {
    "authentication": {
      "required": true,
      "provider": "azure-ad",
      "mfa": true
    },
    "authorization": {
      "rbac": true,
      "permissions": ["read", "write", "deploy"],
      "auditLogging": true
    },
    "compliance": {
      "standards": ["SOX", "GDPR", "HIPAA"],
      "dataRetention": "7-years",
      "encryptionRequired": true
    }
  }
}
```

### Multi-Project Configuration

#### Portfolio Management
```json
{
  "portfolio": {
    "projects": [
      {
        "name": "frontend-app",
        "type": "react-spa",
        "template": "react-typescript-advanced",
        "agents": ["frontend-specialist", "accessibility-expert"]
      },
      {
        "name": "backend-api",
        "type": "node-api",
        "template": "express-typescript-enterprise",
        "agents": ["backend-specialist", "security-auditor"]
      },
      {
        "name": "mobile-app",
        "type": "react-native",
        "template": "react-native-expo",
        "agents": ["mobile-specialist", "performance-optimizer"]
      }
    ],
    "sharedResources": {
      "designSystem": "shared-design-tokens",
      "apiSchema": "openapi-spec",
      "testUtils": "shared-test-helpers"
    }
  }
}
```

## Performance Optimization

### Template Generation Optimization

#### Caching Strategies
```javascript
// Template caching for faster generation
class TemplateCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 100;
    this.ttl = 1000 * 60 * 60; // 1 hour
  }

  getCachedTemplate(key, language, framework) {
    const cacheKey = `${key}-${language}-${framework}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.template;
    }

    return null;
  }

  setCachedTemplate(key, language, framework, template) {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    const cacheKey = `${key}-${language}-${framework}`;
    this.cache.set(cacheKey, {
      template,
      timestamp: Date.now()
    });
  }
}
```

#### Lazy Loading Templates
```javascript
// Lazy template loading for better startup performance
const templateLoader = {
  async loadTemplate(templateName) {
    if (!this.templates.has(templateName)) {
      const module = await import(`./templates/${templateName}.js`);
      this.templates.set(templateName, module.default);
    }
    return this.templates.get(templateName);
  },

  async preloadCommonTemplates() {
    const common = ['javascript', 'typescript', 'react', 'node'];
    await Promise.all(common.map(name => this.loadTemplate(name)));
  }
};
```

### Memory Usage Optimization

#### Efficient Preference Storage
```javascript
// Compressed preference storage
class CompressedPreferences {
  constructor() {
    this.compression = require('compression');
  }

  async savePreferences(preferences) {
    const compressed = await this.compression.gzip(JSON.stringify(preferences));
    await fs.writeFile(this.preferencePath, compressed);
  }

  async loadPreferences() {
    const compressed = await fs.readFile(this.preferencePath);
    const decompressed = await this.compression.gunzip(compressed);
    return JSON.parse(decompressed.toString());
  }
}
```

## Troubleshooting Common Issues

### Template Generation Failures

#### Issue: Template Not Found
```bash
# Problem: Template variant doesn't exist
Error: Template 'CLAUDE.md.custom' not found

# Solution: Check available templates
claude-flow-novice template list

# Or use fallback
claude-flow-novice init --template=enhanced
```

#### Issue: Language Detection Failure
```bash
# Problem: Project language not detected correctly
Warning: Could not detect project language

# Solution: Manual language specification
claude-flow-novice preferences set project.language javascript
claude-flow-novice preferences set project.frameworks '["React", "Express"]'
```

### Performance Issues

#### Issue: Slow Template Generation
```bash
# Problem: Template generation takes too long
# Solution: Enable caching and optimize settings

# Enable template caching
claude-flow-novice preferences set advanced.templateCaching true

# Reduce template complexity
claude-flow-novice init --minimal

# Use optimized templates
claude-flow-novice init --optimized
```

### Configuration Conflicts

#### Issue: Preference Validation Errors
```bash
# Problem: Invalid preference values
Error: Invalid documentation verbosity. Must be: minimal, standard, detailed, or verbose

# Solution: Check valid values
claude-flow-novice preferences list

# Reset problematic preferences
claude-flow-novice preferences reset --scope=project
```

#### Issue: Template Conflicts
```bash
# Problem: Multiple templates trying to create same file
Warning: File 'CLAUDE.md' already exists

# Solution: Use force flag or backup existing files
claude-flow-novice init --force

# Or backup first
cp CLAUDE.md CLAUDE.md.backup
claude-flow-novice init
```

## Best Practices Summary

### For Template Creation
1. **Use Descriptive Names**: Clear, hierarchical naming conventions
2. **Include Metadata**: Version, description, requirements
3. **Support Multiple Variants**: Beginner, intermediate, advanced versions
4. **Test Thoroughly**: Multiple environments and project types
5. **Document Variables**: Clear documentation for all placeholders

### For Configuration Management
1. **Start Simple**: Begin with basic configurations and grow
2. **Use Environment-Specific Settings**: Different configs for dev/prod
3. **Regular Validation**: Periodically validate preference settings
4. **Team Standards**: Establish shared configurations for teams
5. **Performance Monitoring**: Track template generation performance

### For User Experience
1. **Progressive Disclosure**: Introduce features gradually
2. **Context Awareness**: Adapt to user experience level
3. **Clear Documentation**: Provide examples and explanations
4. **Error Recovery**: Graceful handling of configuration issues
5. **Community Standards**: Follow established patterns and practices

This comprehensive guide provides the foundation for effectively using and extending the Claude Flow Novice template system, ensuring optimal development experiences across all skill levels and project types.