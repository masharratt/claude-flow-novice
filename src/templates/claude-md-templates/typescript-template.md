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