# Frontend-Backend Coordination Interfaces

**Version**: 1.0.0
**Date**: September 25, 2025
**Purpose**: Define coordination protocols between frontend-dev and backend-dev agents

## Overview

This document defines the interfaces, protocols, and coordination mechanisms between the React Frontend Developer Agent and Backend Developer Agent in the claude-flow-novice ecosystem.

## Coordination Architecture

### 1. Memory-Based Coordination
```javascript
// Shared memory namespace structure
const coordinationMemory = {
  namespaces: {
    'swarm/api': 'API specifications and contracts',
    'swarm/types': 'Shared TypeScript type definitions',
    'swarm/auth': 'Authentication and authorization patterns',
    'swarm/data': 'Data models and validation schemas',
    'swarm/testing': 'Integration testing contracts'
  }
};
```

### 2. Hook-Based Communication
```bash
# Frontend agent notifies backend of API requirements
npx claude-flow@alpha hooks notify --message "Frontend requires user profile API" --target "backend-dev"

# Backend agent responds with API specification
npx claude-flow@alpha hooks post-edit --file "api/users.js" --memory-key "swarm/api/users"
```

## API Contract Definitions

### 1. OpenAPI Integration
```typescript
// Shared API contract definition
interface APIContract {
  openapi: '3.0.3';
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: ServerConfig[];
  paths: {
    [endpoint: string]: EndpointDefinition;
  };
  components: {
    schemas: TypeDefinitions;
    securitySchemes: SecurityDefinitions;
  };
}

// Example endpoint definition
const userEndpoint: EndpointDefinition = {
  '/api/users/{id}': {
    get: {
      summary: 'Get user by ID',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' }
        }
      ],
      responses: {
        '200': {
          description: 'User found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/User' }
            }
          }
        },
        '404': {
          description: 'User not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        }
      }
    }
  }
};
```

### 2. TypeScript Type Sharing
```typescript
// Shared type definitions
// File: /shared/types.ts
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserRequest {
  email: string;
  name: string;
  password: string;
}

export interface UpdateUserRequest {
  name?: string;
  avatar?: string;
}

export interface APIResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface APIError {
  error: string;
  code: string;
  details?: Record<string, any>;
}
```

## Authentication Coordination

### 1. JWT Token Management
```typescript
// Frontend authentication service
interface AuthService {
  login(credentials: LoginCredentials): Promise<AuthResponse>;
  logout(): void;
  refreshToken(): Promise<string>;
  getToken(): string | null;
  isAuthenticated(): boolean;
}

// Backend authentication contract
interface AuthContract {
  endpoints: {
    login: '/auth/login';
    logout: '/auth/logout';
    refresh: '/auth/refresh';
    verify: '/auth/verify';
  };
  tokenFormat: 'JWT';
  tokenLocation: 'Authorization header';
  refreshStrategy: 'automatic';
}
```

### 2. Role-Based Access Control
```typescript
// Shared permission definitions
interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete';
  conditions?: Record<string, any>;
}

interface Role {
  id: string;
  name: string;
  permissions: Permission[];
}

interface UserWithRoles extends User {
  roles: Role[];
}
```

## Data Validation Coordination

### 1. Shared Validation Schemas
```typescript
// Using Zod for shared validation
import { z } from 'zod';

// Shared schema definitions
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2).max(50),
  avatar: z.string().url().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(50),
  password: z.string().min(8).max(100)
});

// Export types from schemas
export type User = z.infer<typeof UserSchema>;
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
```

### 2. Runtime Validation
```typescript
// Frontend validation hook
const useValidation = <T>(schema: z.ZodSchema<T>) => {
  const validate = (data: unknown): { success: boolean; data?: T; errors?: string[] } => {
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      errors: result.error.errors.map(err => err.message)
    };
  };

  return { validate };
};
```

## Real-Time Communication

### 1. WebSocket Integration
```typescript
// WebSocket event definitions
interface WebSocketEvents {
  // User events
  'user:updated': { userId: string; changes: Partial<User> };
  'user:deleted': { userId: string };

  // System events
  'notification:new': { userId: string; notification: Notification };
  'system:maintenance': { message: string; scheduledTime: Date };
}

// Frontend WebSocket service
interface WebSocketService {
  connect(token: string): Promise<void>;
  disconnect(): void;
  subscribe<T extends keyof WebSocketEvents>(
    event: T,
    handler: (data: WebSocketEvents[T]) => void
  ): () => void;
  emit<T extends keyof WebSocketEvents>(
    event: T,
    data: WebSocketEvents[T]
  ): void;
}
```

### 2. Server-Sent Events
```typescript
// SSE event stream definitions
interface SSEEvents {
  'progress:update': { taskId: string; progress: number; status: string };
  'data:changed': { entity: string; operation: 'create' | 'update' | 'delete' };
}

// Frontend SSE hook
const useServerSentEvents = (endpoint: string) => {
  const [events, setEvents] = useState<SSEEvents[keyof SSEEvents][]>([]);

  useEffect(() => {
    const eventSource = new EventSource(endpoint);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setEvents(prev => [...prev, data]);
    };

    return () => eventSource.close();
  }, [endpoint]);

  return events;
};
```

## Error Handling Coordination

### 1. Standardized Error Formats
```typescript
// Standard error response format
interface StandardError {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    traceId?: string;
  };
}

// Error codes coordination
enum ErrorCodes {
  // Authentication errors
  UNAUTHORIZED = 'AUTH_001',
  FORBIDDEN = 'AUTH_002',
  TOKEN_EXPIRED = 'AUTH_003',

  // Validation errors
  VALIDATION_ERROR = 'VAL_001',
  MISSING_FIELD = 'VAL_002',
  INVALID_FORMAT = 'VAL_003',

  // Business logic errors
  RESOURCE_NOT_FOUND = 'BUS_001',
  DUPLICATE_RESOURCE = 'BUS_002',
  OPERATION_NOT_ALLOWED = 'BUS_003',

  // System errors
  INTERNAL_ERROR = 'SYS_001',
  SERVICE_UNAVAILABLE = 'SYS_002',
  RATE_LIMIT_EXCEEDED = 'SYS_003'
}
```

### 2. Frontend Error Handling
```typescript
// Global error handling hook
const useErrorHandler = () => {
  const handleError = (error: StandardError | Error) => {
    if ('error' in error) {
      // Handle standard API error
      const { code, message, details } = error.error;

      switch (code) {
        case ErrorCodes.UNAUTHORIZED:
          // Redirect to login
          window.location.href = '/login';
          break;
        case ErrorCodes.VALIDATION_ERROR:
          // Show form validation errors
          showFormErrors(details);
          break;
        default:
          // Show generic error message
          showErrorToast(message);
      }
    } else {
      // Handle generic JavaScript error
      showErrorToast('An unexpected error occurred');
      console.error(error);
    }
  };

  return { handleError };
};
```

## API Client Generation

### 1. Automatic Client Generation
```typescript
// Generated API client from OpenAPI spec
interface GeneratedAPIClient {
  users: {
    getUser(id: string): Promise<APIResponse<User>>;
    createUser(data: CreateUserRequest): Promise<APIResponse<User>>;
    updateUser(id: string, data: UpdateUserRequest): Promise<APIResponse<User>>;
    deleteUser(id: string): Promise<APIResponse<void>>;
  };
  auth: {
    login(credentials: LoginCredentials): Promise<APIResponse<AuthResponse>>;
    logout(): Promise<APIResponse<void>>;
    refreshToken(): Promise<APIResponse<{ token: string }>>;
  };
}

// Configuration for client generation
const clientConfig = {
  baseURL: process.env.REACT_APP_API_URL,
  timeout: 30000,
  retries: 3,
  interceptors: {
    request: [authInterceptor, loggingInterceptor],
    response: [errorInterceptor, cacheInterceptor]
  }
};
```

### 2. Type-Safe API Hooks
```typescript
// React Query integration with generated types
const useUser = (id: string) => {
  return useQuery({
    queryKey: ['user', id],
    queryFn: () => apiClient.users.getUser(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000 // 10 minutes
  });
};

const useCreateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateUserRequest) => apiClient.users.createUser(data),
    onSuccess: (response) => {
      // Invalidate users list query
      queryClient.invalidateQueries({ queryKey: ['users'] });
      // Add new user to cache
      queryClient.setQueryData(['user', response.data.id], response);
    }
  });
};
```

## Testing Coordination

### 1. Contract Testing
```typescript
// Pact contract testing setup
describe('User API Contract', () => {
  const provider = new Pact({
    consumer: 'Frontend App',
    provider: 'User API',
    port: 1234,
    log: path.resolve(process.cwd(), 'logs', 'mockserver-integration.log'),
    dir: path.resolve(process.cwd(), 'pacts')
  });

  beforeAll(() => provider.setup());
  afterEach(() => provider.verify());
  afterAll(() => provider.finalize());

  test('should get user by id', async () => {
    await provider.addInteraction({
      state: 'user with id 123 exists',
      uponReceiving: 'a request to get user by id',
      withRequest: {
        method: 'GET',
        path: '/api/users/123',
        headers: {
          Authorization: 'Bearer token123'
        }
      },
      willRespondWith: {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          id: '123',
          email: 'user@example.com',
          name: 'John Doe'
        }
      }
    });

    const user = await apiClient.users.getUser('123');
    expect(user.data.id).toBe('123');
  });
});
```

### 2. Integration Testing
```typescript
// Full-stack integration test
describe('User Management Integration', () => {
  beforeAll(async () => {
    // Start test database
    await setupTestDatabase();
    // Start backend server
    await startTestServer();
  });

  test('should create and retrieve user', async () => {
    // Create user via API
    const createResponse = await apiClient.users.createUser({
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123'
    });

    expect(createResponse.success).toBe(true);
    const userId = createResponse.data.id;

    // Retrieve user via API
    const getResponse = await apiClient.users.getUser(userId);
    expect(getResponse.data.email).toBe('test@example.com');
    expect(getResponse.data.name).toBe('Test User');
  });
});
```

## Documentation Coordination

### 1. Interactive API Documentation
```typescript
// Swagger/OpenAPI documentation integration
const apiDocumentation = {
  spec: '/api/docs/swagger.json',
  ui: '/api/docs/',
  examples: {
    requests: 'Generated from frontend usage',
    responses: 'Generated from backend implementation'
  },
  tryItOut: true
};
```

### 2. Component Documentation
```typescript
// Storybook integration with API mocks
export default {
  title: 'Components/UserProfile',
  component: UserProfile,
  parameters: {
    msw: {
      handlers: [
        rest.get('/api/users/:id', (req, res, ctx) => {
          return res(
            ctx.json({
              id: req.params.id,
              email: 'user@example.com',
              name: 'John Doe'
            })
          );
        })
      ]
    }
  }
};
```

## Deployment Coordination

### 1. Environment Synchronization
```yaml
# Shared environment configuration
version: '3.8'
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_API_URL=http://backend:8000
      - REACT_APP_WS_URL=ws://backend:8000
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - CORS_ORIGIN=http://localhost:3000
```

### 2. CI/CD Pipeline Coordination
```yaml
# Coordinated deployment pipeline
name: Full-Stack Deployment
on:
  push:
    branches: [main]

jobs:
  test-contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run contract tests
        run: |
          npm run test:contracts
          npm run test:integration

  deploy-backend:
    needs: test-contracts
    runs-on: ubuntu-latest
    steps:
      - name: Deploy Backend
        run: |
          docker build -t backend ./backend
          docker push ${{ secrets.REGISTRY }}/backend

  deploy-frontend:
    needs: [test-contracts, deploy-backend]
    runs-on: ubuntu-latest
    steps:
      - name: Build Frontend
        run: |
          npm run build
          npm run deploy
```

## Memory Coordination Examples

### 1. API Specification Sharing
```javascript
// Backend agent stores API specification
await memory.store('swarm/api/users', {
  endpoints: {
    'GET /api/users': { response: 'User[]', auth: true },
    'GET /api/users/:id': { response: 'User', auth: true },
    'POST /api/users': { request: 'CreateUserRequest', response: 'User', auth: true }
  },
  types: {
    User: 'shared/types.ts#User',
    CreateUserRequest: 'shared/types.ts#CreateUserRequest'
  }
}, { namespace: 'coordination' });

// Frontend agent retrieves and uses specification
const apiSpec = await memory.get('swarm/api/users', { namespace: 'coordination' });
generateAPIClient(apiSpec);
```

### 2. Testing Coordination
```javascript
// Frontend agent stores testing requirements
await memory.store('swarm/testing/frontend-requirements', {
  endpoints: ['/api/users', '/api/auth/login'],
  scenarios: ['user-registration', 'user-profile-update'],
  coverage: 'integration-tests'
}, { namespace: 'testing' });

// Backend agent creates matching test data
const frontendNeeds = await memory.get('swarm/testing/frontend-requirements');
generateTestFixtures(frontendNeeds.scenarios);
```

## Conclusion

This coordination interface ensures seamless collaboration between frontend and backend agents while maintaining type safety, consistency, and reliability across the full-stack development process. The memory-based coordination and hook system enable real-time synchronization and efficient development workflows.