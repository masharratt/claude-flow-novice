# Testing & Automation with Claude-Flow

Comprehensive guide to testing JavaScript applications using Claude-Flow agent coordination for automated testing strategies.

## 🚀 Testing Workflow Overview

### 1. Initialize Testing Environment

```bash
# Generate comprehensive testing setup with agent
npx claude-flow-novice sparc run tester "Complete testing environment with Jest, React Testing Library, and E2E testing"

# Alternative: TDD workflow
npx claude-flow-novice sparc tdd "User authentication feature with test-driven development"
```

### 2. Agent-Driven Testing

```bash
# Parallel testing development
npx claude-flow-novice sparc batch "tester,reviewer,perf-analyzer" "Comprehensive testing strategy implementation"

# Sequential testing pipeline
npx claude-flow-novice sparc run tester "Unit tests for components and utilities"
npx claude-flow-novice sparc run tester "Integration tests for API endpoints"
npx claude-flow-novice sparc run tester "End-to-end tests for user workflows"
```

## 🏗 Testing Architecture

### 1. Testing Strategy Structure

**Agent-Generated Testing Structure**:
```
testing/
├── __tests__/             # Test files
│   ├── unit/              # Unit tests
│   │   ├── components/    # Component tests
│   │   ├── hooks/         # Hook tests
│   │   ├── utils/         # Utility tests
│   │   └── services/      # Service tests
│   ├── integration/       # Integration tests
│   │   ├── api/           # API integration tests
│   │   ├── database/      # Database tests
│   │   └── auth/          # Authentication tests
│   ├── e2e/               # End-to-end tests
│   │   ├── user-flows/    # User journey tests
│   │   ├── admin-flows/   # Admin workflow tests
│   │   └── api-flows/     # API workflow tests
│   └── performance/       # Performance tests
│       ├── load/          # Load testing
│       └── stress/        # Stress testing
├── fixtures/              # Test data
│   ├── users.json
│   ├── products.json
│   └── orders.json
├── mocks/                 # Mock implementations
│   ├── api/               # API mocks
│   ├── services/          # Service mocks
│   └── components/        # Component mocks
├── utils/                 # Testing utilities
│   ├── test-helpers.ts
│   ├── mock-factories.ts
│   └── setup.ts
├── config/                # Test configuration
│   ├── jest.config.js
│   ├── playwright.config.ts
│   └── k6.config.js
└── reports/               # Test reports
    ├── coverage/
    ├── performance/
    └── e2e/
```

### 2. Generate Testing Environment with Agent

```bash
# Complete testing environment generation
npx claude-flow-novice sparc run tester "Comprehensive testing setup with:
- Jest configuration for unit and integration tests
- React Testing Library for component testing
- Playwright for end-to-end testing
- K6 for performance testing
- MSW for API mocking
- Test utilities and helpers
- CI/CD integration
- Coverage reporting"
```

## 🧪 Unit Testing

### 1. Component Testing

**tests/unit/components/Button.test.tsx** (Agent-generated):
```typescript
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/Button';

// Mock implementations
const mockOnClick = jest.fn();

describe('Button Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders with default props', () => {
      render(<Button>Click me</Button>);

      const button = screen.getByRole('button', { name: /click me/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('bg-primary');
    });

    it('renders with custom variant', () => {
      render(<Button variant="destructive">Delete</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-destructive');
    });

    it('renders with custom size', () => {
      render(<Button size="lg">Large button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-11');
    });

    it('renders with custom className', () => {
      render(<Button className="custom-class">Custom</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });
  });

  describe('Interaction', () => {
    it('calls onClick when clicked', async () => {
      const user = userEvent.setup();
      render(<Button onClick={mockOnClick}>Click me</Button>);

      const button = screen.getByRole('button');
      await user.click(button);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', async () => {
      const user = userEvent.setup();
      render(<Button onClick={mockOnClick} disabled>Disabled</Button>);

      const button = screen.getByRole('button');
      await user.click(button);

      expect(mockOnClick).not.toHaveBeenCalled();
      expect(button).toBeDisabled();
    });

    it('handles keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<Button onClick={mockOnClick}>Press me</Button>);

      const button = screen.getByRole('button');
      button.focus();
      await user.keyboard('{Enter}');

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner when loading', () => {
      render(<Button loading>Loading</Button>);

      const button = screen.getByRole('button');
      const spinner = screen.getByRole('status', { hidden: true });

      expect(button).toBeDisabled();
      expect(spinner).toBeInTheDocument();
    });

    it('disables button when loading', () => {
      render(<Button loading onClick={mockOnClick}>Loading</Button>);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(button).toBeDisabled();
      expect(mockOnClick).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has correct ARIA attributes', () => {
      render(<Button aria-label="Custom label">Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Custom label');
    });

    it('supports ref forwarding', () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(<Button ref={ref}>Button</Button>);

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });

    it('maintains focus styles', () => {
      render(<Button>Focus me</Button>);

      const button = screen.getByRole('button');
      button.focus();

      expect(button).toHaveFocus();
    });
  });

  describe('Edge Cases', () => {
    it('handles extremely long text', () => {
      const longText = 'A'.repeat(1000);
      render(<Button>{longText}</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('handles special characters', () => {
      render(<Button>{'<>&"\\''}</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('<>&"\\\'');
    });
  });
});
```

### 2. Hook Testing

**tests/unit/hooks/useApi.test.ts** (Agent-generated):
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useApi, useApiMutation } from '@/hooks/useApi';
import { apiClient } from '@/services/apiClient';

// Mock the API client
jest.mock('@/services/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

// Create a test wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, cacheTime: 0 },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useApi Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Successful Data Fetching', () => {
    it('fetches and returns data successfully', async () => {
      const mockData = { id: 1, name: 'Test User', email: 'test@example.com' };
      mockedApiClient.get.mockResolvedValueOnce({ data: mockData });

      const { result } = renderHook(
        () => useApi('user', '/users/1'),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();
      expect(mockedApiClient.get).toHaveBeenCalledWith('/users/1');
    });

    it('handles empty response data', async () => {
      mockedApiClient.get.mockResolvedValueOnce({ data: null });

      const { result } = renderHook(
        () => useApi('empty', '/empty'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('handles API errors correctly', async () => {
      const mockError = new Error('API Error');
      mockedApiClient.get.mockRejectedValueOnce(mockError);

      const { result } = renderHook(
        () => useApi('error', '/error'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toBeUndefined();
    });

    it('handles network errors', async () => {
      const networkError = new Error('Network Error');
      networkError.name = 'NetworkError';
      mockedApiClient.get.mockRejectedValueOnce(networkError);

      const { result } = renderHook(
        () => useApi('network-error', '/network-error'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(networkError);
    });
  });

  describe('Configuration Options', () => {
    it('respects enabled option', async () => {
      const { result } = renderHook(
        () => useApi('disabled', '/disabled', { enabled: false }),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isFetching).toBe(false);
      expect(mockedApiClient.get).not.toHaveBeenCalled();
    });

    it('respects stale time option', async () => {
      const mockData = { id: 1, name: 'Test' };
      mockedApiClient.get.mockResolvedValue({ data: mockData });

      const { result, rerender } = renderHook(
        () => useApi('stale', '/stale', { staleTime: 10000 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Rerender should not trigger new fetch due to stale time
      rerender();
      expect(mockedApiClient.get).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useApiMutation Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Successful Mutations', () => {
    it('executes mutation successfully', async () => {
      const mockData = { id: 1, name: 'Created User' };
      const mutationFn = jest.fn().mockResolvedValue(mockData);
      const onSuccess = jest.fn();

      const { result } = renderHook(
        () => useApiMutation(mutationFn, { onSuccess }),
        { wrapper: createWrapper() }
      );

      const variables = { name: 'Test User', email: 'test@example.com' };
      result.current.mutate(variables);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mutationFn).toHaveBeenCalledWith(variables);
      expect(onSuccess).toHaveBeenCalledWith(mockData);
      expect(result.current.data).toEqual(mockData);
    });

    it('invalidates queries on success', async () => {
      const queryClient = new QueryClient();
      const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const mockData = { id: 1, name: 'Updated User' };
      const mutationFn = jest.fn().mockResolvedValue(mockData);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(
        () => useApiMutation(mutationFn, { invalidateKeys: ['users'] }),
        { wrapper }
      );

      result.current.mutate({ id: 1, name: 'Updated User' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['users'] });
    });
  });

  describe('Error Handling', () => {
    it('handles mutation errors', async () => {
      const mockError = new Error('Mutation failed');
      const mutationFn = jest.fn().mockRejectedValue(mockError);
      const onError = jest.fn();

      const { result } = renderHook(
        () => useApiMutation(mutationFn, { onError }),
        { wrapper: createWrapper() }
      );

      result.current.mutate({ data: 'test' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(onError).toHaveBeenCalledWith(mockError);
      expect(result.current.error).toEqual(mockError);
    });
  });
});
```

```bash
# Generate comprehensive unit tests with agent
npx claude-flow-novice sparc run tester "Complete unit testing suite for components, hooks, and utilities"
```

## 🔗 Integration Testing

### 1. API Integration Tests

**tests/integration/api/auth.test.ts** (Agent-generated):
```typescript
import request from 'supertest';
import { app } from '../../../src/app';
import { User } from '../../../src/models/User.model';
import { connectTestDB, clearTestDB, closeTestDB } from '../../utils/test-db';

describe('Authentication API Integration', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  describe('POST /api/auth/register', () => {
    const validUserData = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
    };

    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(validUserData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            name: validUserData.name,
            email: validUserData.email,
            role: 'user',
          },
        },
      });

      expect(response.body.token).toBeDefined();
      expect(response.body.data.user.password).toBeUndefined();

      // Verify user was created in database
      const user = await User.findOne({ email: validUserData.email });
      expect(user).toBeTruthy();
      expect(user?.name).toBe(validUserData.name);
    });

    it('should hash the password before saving', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(validUserData)
        .expect(201);

      const user = await User.findOne({ email: validUserData.email }).select('+password');
      expect(user?.password).not.toBe(validUserData.password);
      expect(user?.password.length).toBeGreaterThan(50); // Hashed password length
    });

    it('should reject duplicate email addresses', async () => {
      // Create first user
      await request(app)
        .post('/api/auth/register')
        .send(validUserData)
        .expect(201);

      // Attempt to create second user with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send(validUserData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    it('should validate required fields', async () => {
      const testCases = [
        { field: 'name', data: { ...validUserData, name: '' } },
        { field: 'email', data: { ...validUserData, email: '' } },
        { field: 'password', data: { ...validUserData, password: '' } },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/auth/register')
          .send(testCase.data)
          .expect(400);

        expect(response.body.success).toBe(false);
      }
    });

    it('should validate email format', async () => {
      const invalidEmails = ['invalid', 'invalid@', '@invalid.com', 'invalid.com'];

      for (const email of invalidEmails) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({ ...validUserData, email })
          .expect(400);

        expect(response.body.success).toBe(false);
      }
    });

    it('should validate password strength', async () => {
      const weakPasswords = ['123', 'pass', '12345'];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({ ...validUserData, password })
          .expect(400);

        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('POST /api/auth/login', () => {
    const userData = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
    };

    beforeEach(async () => {
      // Register user for login tests
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: userData.password,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            name: userData.name,
            email: userData.email,
          },
        },
      });

      expect(response.body.token).toBeDefined();
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrong@example.com',
          password: userData.password,
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should require email and password', async () => {
      const testCases = [
        { email: '', password: userData.password },
        { email: userData.email, password: '' },
        { email: '', password: '' },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/auth/login')
          .send(testCase)
          .expect(400);

        expect(response.body.success).toBe(false);
      }
    });

    it('should handle case-insensitive email login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email.toUpperCase(),
          password: userData.password,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/auth/me', () => {
    let authToken: string;
    const userData = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
    };

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      authToken = response.body.token;
    });

    it('should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            name: userData.name,
            email: userData.email,
          },
        },
      });

      expect(response.body.data.user.password).toBeUndefined();
    });

    it('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('token');
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject requests with malformed authorization header', async () => {
      const testCases = [
        'invalid-header',
        'Bearer',
        'Token ' + authToken,
        authToken,
      ];

      for (const header of testCases) {
        const response = await request(app)
          .get('/api/auth/me')
          .set('Authorization', header)
          .expect(401);

        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to registration endpoint', async () => {
      const requests = Array(6).fill(null).map((_, i) =>
        request(app)
          .post('/api/auth/register')
          .send({
            name: `User ${i}`,
            email: `user${i}@example.com`,
            password: 'password123',
          })
      );

      const responses = await Promise.all(requests);

      // First 5 should succeed, 6th should be rate limited
      expect(responses.slice(0, 5).every(res => res.status === 201)).toBe(true);
      expect(responses[5].status).toBe(429);
    });
  });
});
```

### 2. Database Integration Tests

**tests/integration/database/user.test.ts** (Agent-generated):
```typescript
import { User, IUser } from '../../../src/models/User.model';
import { connectTestDB, clearTestDB, closeTestDB } from '../../utils/test-db';

describe('User Model Integration', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  describe('User Creation', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'hashedpassword',
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.name).toBe(userData.name);
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.role).toBe('user'); // Default role
      expect(savedUser.isActive).toBe(true); // Default active
      expect(savedUser.createdAt).toBeDefined();
      expect(savedUser.updatedAt).toBeDefined();
    });

    it('should enforce unique email constraint', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'hashedpassword',
      };

      await User.create(userData);

      // Attempt to create user with same email
      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should validate required fields', async () => {
      const testCases = [
        { name: '', email: 'test@example.com', password: 'password' },
        { name: 'Test', email: '', password: 'password' },
        { name: 'Test', email: 'test@example.com', password: '' },
      ];

      for (const userData of testCases) {
        await expect(User.create(userData)).rejects.toThrow();
      }
    });

    it('should validate email format', async () => {
      const invalidEmails = ['invalid', 'invalid@', '@invalid.com'];

      for (const email of invalidEmails) {
        const userData = {
          name: 'Test User',
          email,
          password: 'password123',
        };

        await expect(User.create(userData)).rejects.toThrow();
      }
    });

    it('should convert email to lowercase', async () => {
      const userData = {
        name: 'John Doe',
        email: 'JOHN@EXAMPLE.COM',
        password: 'hashedpassword',
      };

      const user = await User.create(userData);
      expect(user.email).toBe('john@example.com');
    });
  });

  describe('User Queries', () => {
    beforeEach(async () => {
      const users = [
        {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'hashedpassword',
          role: 'user',
          isActive: true,
        },
        {
          name: 'Jane Smith',
          email: 'jane@example.com',
          password: 'hashedpassword',
          role: 'admin',
          isActive: true,
        },
        {
          name: 'Bob Johnson',
          email: 'bob@example.com',
          password: 'hashedpassword',
          role: 'user',
          isActive: false,
        },
      ];

      await User.create(users);
    });

    it('should find users by email', async () => {
      const user = await User.findOne({ email: 'john@example.com' });
      expect(user).toBeTruthy();
      expect(user?.name).toBe('John Doe');
    });

    it('should find users by role', async () => {
      const adminUsers = await User.find({ role: 'admin' });
      expect(adminUsers).toHaveLength(1);
      expect(adminUsers[0].name).toBe('Jane Smith');
    });

    it('should find active users', async () => {
      const activeUsers = await User.find({ isActive: true });
      expect(activeUsers).toHaveLength(2);
    });

    it('should exclude password by default', async () => {
      const user = await User.findOne({ email: 'john@example.com' });
      expect(user?.password).toBeUndefined();
    });

    it('should include password when explicitly selected', async () => {
      const user = await User.findOne({ email: 'john@example.com' }).select('+password');
      expect(user?.password).toBeDefined();
    });
  });

  describe('User Updates', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await User.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'hashedpassword',
      });
      userId = user._id.toString();
    });

    it('should update user fields', async () => {
      const updateData = { name: 'John Smith' };
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true }
      );

      expect(updatedUser?.name).toBe('John Smith');
      expect(updatedUser?.email).toBe('john@example.com'); // Unchanged
    });

    it('should update timestamps on modification', async () => {
      const originalUser = await User.findById(userId);
      const originalUpdatedAt = originalUser?.updatedAt;

      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await User.findByIdAndUpdate(userId, { name: 'Updated Name' });
      const updatedUser = await User.findById(userId);

      expect(updatedUser?.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt?.getTime() || 0
      );
    });

    it('should validate updates', async () => {
      await expect(
        User.findByIdAndUpdate(
          userId,
          { email: 'invalid-email' },
          { runValidators: true }
        )
      ).rejects.toThrow();
    });
  });

  describe('User Indexes', () => {
    it('should have index on email field', async () => {
      const indexes = await User.collection.getIndexes();
      const emailIndex = Object.keys(indexes).find(key =>
        key.includes('email')
      );
      expect(emailIndex).toBeDefined();
    });

    it('should have index on isActive field', async () => {
      const indexes = await User.collection.getIndexes();
      const isActiveIndex = Object.keys(indexes).find(key =>
        key.includes('isActive')
      );
      expect(isActiveIndex).toBeDefined();
    });
  });
});
```

```bash
# Generate integration tests with agent
npx claude-flow-novice sparc run tester "Comprehensive integration testing for API endpoints and database operations"
```

## 🌐 End-to-End Testing

### 1. E2E Test Setup with Playwright

**tests/e2e/setup/global-setup.ts** (Agent-generated):
```typescript
import { chromium, FullConfig } from '@playwright/test';
import { connectTestDB, seedTestDB } from '../utils/test-db';

async function globalSetup(config: FullConfig) {
  // Setup test database
  await connectTestDB();
  await seedTestDB();

  // Create browser instance for authentication
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login as admin and save auth state
  await page.goto('http://localhost:3000/login');
  await page.fill('[data-testid="email"]', 'admin@example.com');
  await page.fill('[data-testid="password"]', 'admin123');
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('**/dashboard');

  // Save admin auth state
  await context.storageState({ path: 'tests/e2e/auth/admin-auth.json' });

  // Login as regular user and save auth state
  await page.goto('http://localhost:3000/logout');
  await page.goto('http://localhost:3000/login');
  await page.fill('[data-testid="email"]', 'user@example.com');
  await page.fill('[data-testid="password"]', 'user123');
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('**/dashboard');

  // Save user auth state
  await context.storageState({ path: 'tests/e2e/auth/user-auth.json' });

  await browser.close();
}

export default globalSetup;
```

### 2. User Journey Tests

**tests/e2e/user-flows/authentication.spec.ts** (Agent-generated):
```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should allow user to register and login', async ({ page }) => {
    const timestamp = Date.now();
    const email = `test${timestamp}@example.com`;
    const password = 'testpassword123';
    const name = 'Test User';

    // Navigate to registration
    await page.click('[data-testid="register-link"]');
    await expect(page).toHaveURL('/register');

    // Fill registration form
    await page.fill('[data-testid="name"]', name);
    await page.fill('[data-testid="email"]', email);
    await page.fill('[data-testid="password"]', password);
    await page.fill('[data-testid="confirm-password"]', password);

    // Submit registration
    await page.click('[data-testid="register-button"]');

    // Should redirect to dashboard after successful registration
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="user-name"]')).toContainText(name);

    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');
    await expect(page).toHaveURL('/');

    // Login with the same credentials
    await page.click('[data-testid="login-link"]');
    await page.fill('[data-testid="email"]', email);
    await page.fill('[data-testid="password"]', password);
    await page.click('[data-testid="login-button"]');

    // Should be redirected to dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="user-name"]')).toContainText(name);
  });

  test('should show validation errors for invalid registration', async ({ page }) => {
    await page.click('[data-testid="register-link"]');

    // Submit empty form
    await page.click('[data-testid="register-button"]');

    // Check for validation errors
    await expect(page.locator('[data-testid="name-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-error"]')).toBeVisible();

    // Test invalid email format
    await page.fill('[data-testid="email"]', 'invalid-email');
    await page.blur('[data-testid="email"]');
    await expect(page.locator('[data-testid="email-error"]')).toContainText('valid email');

    // Test password mismatch
    await page.fill('[data-testid="password"]', 'password123');
    await page.fill('[data-testid="confirm-password"]', 'different');
    await page.blur('[data-testid="confirm-password"]');
    await expect(page.locator('[data-testid="confirm-password-error"]')).toContainText('match');
  });

  test('should show error for invalid login credentials', async ({ page }) => {
    await page.click('[data-testid="login-link"]');

    // Try to login with invalid credentials
    await page.fill('[data-testid="email"]', 'invalid@example.com');
    await page.fill('[data-testid="password"]', 'wrongpassword');
    await page.click('[data-testid="login-button"]');

    // Should show error message
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Invalid credentials');
    await expect(page).toHaveURL('/login');
  });

  test('should handle forgot password flow', async ({ page }) => {
    await page.click('[data-testid="login-link"]');
    await page.click('[data-testid="forgot-password-link"]');
    await expect(page).toHaveURL('/forgot-password');

    // Fill email for password reset
    await page.fill('[data-testid="email"]', 'user@example.com');
    await page.click('[data-testid="reset-button"]');

    // Should show success message
    await expect(page.locator('[data-testid="success-message"]')).toContainText('reset link sent');
  });

  test('should persist authentication across page refreshes', async ({ page }) => {
    // Login
    await page.click('[data-testid="login-link"]');
    await page.fill('[data-testid="email"]', 'user@example.com');
    await page.fill('[data-testid="password"]', 'user123');
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL('/dashboard');

    // Refresh page
    await page.reload();

    // Should still be authenticated
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="user-name"]')).toBeVisible();
  });
});
```

### 3. E2E Product Management Tests

**tests/e2e/admin-flows/product-management.spec.ts** (Agent-generated):
```typescript
import { test, expect } from '@playwright/test';

test.describe('Product Management', () => {
  test.use({ storageState: 'tests/e2e/auth/admin-auth.json' });

  test('should create, edit, and delete products', async ({ page }) => {
    await page.goto('/admin/products');

    // Create new product
    await page.click('[data-testid="add-product-button"]');
    await expect(page).toHaveURL('/admin/products/new');

    const productName = `Test Product ${Date.now()}`;
    await page.fill('[data-testid="product-name"]', productName);
    await page.fill('[data-testid="product-description"]', 'Test product description');
    await page.fill('[data-testid="product-price"]', '29.99');
    await page.selectOption('[data-testid="product-category"]', 'electronics');
    await page.check('[data-testid="product-in-stock"]');

    // Upload product image
    await page.setInputFiles(
      '[data-testid="product-image"]',
      'tests/e2e/fixtures/test-image.jpg'
    );

    // Save product
    await page.click('[data-testid="save-product-button"]');
    await expect(page).toHaveURL('/admin/products');

    // Verify product appears in list
    await expect(page.locator('[data-testid="product-list"]')).toContainText(productName);

    // Edit product
    await page.click(`[data-testid="edit-product-${productName}"]`);
    const updatedName = `${productName} Updated`;
    await page.fill('[data-testid="product-name"]', updatedName);
    await page.click('[data-testid="save-product-button"]');

    // Verify updated name appears
    await expect(page.locator('[data-testid="product-list"]')).toContainText(updatedName);

    // Delete product
    await page.click(`[data-testid="delete-product-${updatedName}"]`);
    await page.click('[data-testid="confirm-delete"]');

    // Verify product is removed
    await expect(page.locator('[data-testid="product-list"]')).not.toContainText(updatedName);
  });

  test('should search and filter products', async ({ page }) => {
    await page.goto('/admin/products');

    // Search for products
    await page.fill('[data-testid="search-input"]', 'iPhone');
    await page.press('[data-testid="search-input"]', 'Enter');

    // Verify search results
    const productItems = page.locator('[data-testid="product-item"]');
    await expect(productItems).toHaveCountGreaterThan(0);

    // Filter by category
    await page.selectOption('[data-testid="category-filter"]', 'electronics');
    await expect(productItems).toHaveCountGreaterThan(0);

    // Filter by stock status
    await page.selectOption('[data-testid="stock-filter"]', 'in-stock');
    await expect(productItems).toHaveCountGreaterThan(0);

    // Clear filters
    await page.click('[data-testid="clear-filters"]');
    await expect(productItems).toHaveCountGreaterThan(0);
  });

  test('should bulk manage products', async ({ page }) => {
    await page.goto('/admin/products');

    // Select multiple products
    await page.check('[data-testid="select-all-products"]');

    // Verify bulk actions are enabled
    await expect(page.locator('[data-testid="bulk-actions"]')).toBeVisible();

    // Bulk update status
    await page.selectOption('[data-testid="bulk-action-select"]', 'update-stock');
    await page.click('[data-testid="execute-bulk-action"]');

    // Fill bulk update form
    await page.check('[data-testid="bulk-in-stock"]');
    await page.click('[data-testid="confirm-bulk-update"]');

    // Verify success message
    await expect(page.locator('[data-testid="success-message"]')).toContainText('updated successfully');
  });

  test('should handle product image upload and preview', async ({ page }) => {
    await page.goto('/admin/products/new');

    // Upload image
    await page.setInputFiles(
      '[data-testid="product-image"]',
      'tests/e2e/fixtures/test-image.jpg'
    );

    // Verify image preview appears
    await expect(page.locator('[data-testid="image-preview"]')).toBeVisible();

    // Remove image
    await page.click('[data-testid="remove-image"]');
    await expect(page.locator('[data-testid="image-preview"]')).not.toBeVisible();
  });

  test('should validate product form inputs', async ({ page }) => {
    await page.goto('/admin/products/new');

    // Submit empty form
    await page.click('[data-testid="save-product-button"]');

    // Check validation errors
    await expect(page.locator('[data-testid="name-error"]')).toContainText('required');
    await expect(page.locator('[data-testid="price-error"]')).toContainText('required');
    await expect(page.locator('[data-testid="category-error"]')).toContainText('required');

    // Test invalid price
    await page.fill('[data-testid="product-price"]', 'invalid');
    await page.blur('[data-testid="product-price"]');
    await expect(page.locator('[data-testid="price-error"]')).toContainText('valid number');

    // Test negative price
    await page.fill('[data-testid="product-price"]', '-10');
    await page.blur('[data-testid="product-price"]');
    await expect(page.locator('[data-testid="price-error"]')).toContainText('positive');
  });
});
```

```bash
# Generate E2E tests with agent
npx claude-flow-novice sparc run tester "Comprehensive end-to-end testing with Playwright for user journeys and admin workflows"
```

## ⚡ Performance Testing

### 1. Load Testing with K6

**tests/performance/load/api-load.test.js** (Agent-generated):
```javascript
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiCalls = new Counter('api_calls');
const responseTime = new Trend('response_time');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Ramp up to 200 users
    { duration: '5m', target: 200 },  // Stay at 200 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
    http_req_failed: ['rate<0.05'],                 // Error rate under 5%
    errors: ['rate<0.1'],                           // Custom error rate under 10%
    api_calls: ['count>10000'],                     // Minimum API calls
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3001/api';
let authToken = '';

export function setup() {
  // Login to get auth token
  const loginRes = http.post(`${BASE_URL}/auth/login`, {
    email: 'test@example.com',
    password: 'password123',
  });

  if (loginRes.status === 200) {
    authToken = JSON.parse(loginRes.body).token;
  }

  return { authToken };
}

export default function (data) {
  const token = data.authToken;

  group('API Load Test', () => {
    // Test product listing
    group('Product Listing', () => {
      const res = http.get(`${BASE_URL}/products?page=1&limit=20`);
      apiCalls.add(1);
      responseTime.add(res.timings.duration);

      const success = check(res, {
        'products list status is 200': (r) => r.status === 200,
        'products list has data': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.data && body.data.length > 0;
          } catch {
            return false;
          }
        },
        'response time < 500ms': (r) => r.timings.duration < 500,
      });

      errorRate.add(!success);
    });

    // Test product search
    group('Product Search', () => {
      const searchTerms = ['phone', 'laptop', 'book', 'electronics'];
      const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

      const res = http.get(`${BASE_URL}/products/search?q=${term}`);
      apiCalls.add(1);
      responseTime.add(res.timings.duration);

      const success = check(res, {
        'search status is 200': (r) => r.status === 200,
        'search response is valid': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.success !== undefined;
          } catch {
            return false;
          }
        },
        'response time < 300ms': (r) => r.timings.duration < 300,
      });

      errorRate.add(!success);
    });

    // Test authenticated endpoints
    if (token) {
      group('Authenticated Requests', () => {
        const headers = { Authorization: `Bearer ${token}` };

        const res = http.get(`${BASE_URL}/auth/me`, { headers });
        apiCalls.add(1);
        responseTime.add(res.timings.duration);

        const success = check(res, {
          'auth check status is 200': (r) => r.status === 200,
          'user data is returned': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.data && body.data.user;
            } catch {
              return false;
            }
          },
          'response time < 200ms': (r) => r.timings.duration < 200,
        });

        errorRate.add(!success);
      });
    }

    // Test database-heavy operations
    group('Database Operations', () => {
      const categoryRes = http.get(`${BASE_URL}/products?category=electronics&limit=50`);
      apiCalls.add(1);
      responseTime.add(categoryRes.timings.duration);

      const success = check(categoryRes, {
        'category filter status is 200': (r) => r.status === 200,
        'category filter works': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.data && Array.isArray(body.data);
          } catch {
            return false;
          }
        },
        'response time < 400ms': (r) => r.timings.duration < 400,
      });

      errorRate.add(!success);
    });
  });

  sleep(Math.random() * 2 + 1); // Random sleep between 1-3 seconds
}

export function teardown(data) {
  // Cleanup operations if needed
  console.log('Load test completed');
}

export function handleSummary(data) {
  const avgResponseTime = data.metrics.response_time.avg;
  const p95ResponseTime = data.metrics['http_req_duration{p=95}'].value;
  const errorRate = data.metrics.errors.rate;
  const totalRequests = data.metrics.api_calls.count;

  return {
    'load-test-summary.json': JSON.stringify(data, null, 2),
    stdout: `
╔══════════════════════════════════════════════════════════════╗
║                       LOAD TEST RESULTS                      ║
╠══════════════════════════════════════════════════════════════╣
║ Total API Calls: ${String(totalRequests).padStart(10)} requests                  ║
║ Average Response Time: ${String(avgResponseTime.toFixed(2)).padStart(10)}ms                     ║
║ 95th Percentile: ${String(p95ResponseTime.toFixed(2)).padStart(10)}ms                        ║
║ Error Rate: ${String((errorRate * 100).toFixed(2)).padStart(10)}%                           ║
║                                                              ║
║ Status: ${errorRate < 0.05 ? 'PASSED ✅' : 'FAILED ❌'}                                ║
╚══════════════════════════════════════════════════════════════╝
    `,
  };
}
```

### 2. Frontend Performance Testing

**tests/performance/frontend/lighthouse.test.js** (Agent-generated):
```javascript
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const fs = require('fs');
const path = require('path');

const performanceConfig = {
  extends: 'lighthouse:default',
  settings: {
    onlyAudits: [
      'first-contentful-paint',
      'largest-contentful-paint',
      'cumulative-layout-shift',
      'total-blocking-time',
      'speed-index',
    ],
  },
};

async function runLighthouseTest(url, options = {}) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });

  try {
    const result = await lighthouse(url, {
      port: chrome.port,
      disableDeviceEmulation: false,
      ...options,
    }, performanceConfig);

    return result.lhr;
  } finally {
    await chrome.kill();
  }
}

async function runPerformanceTests() {
  const baseUrl = process.env.APP_URL || 'http://localhost:3000';

  const testPages = [
    { name: 'Homepage', url: `${baseUrl}/` },
    { name: 'Products', url: `${baseUrl}/products` },
    { name: 'Product Detail', url: `${baseUrl}/products/1` },
    { name: 'Login', url: `${baseUrl}/login` },
    { name: 'Dashboard', url: `${baseUrl}/dashboard` },
  ];

  const results = [];

  for (const page of testPages) {
    console.log(`Testing ${page.name}...`);

    try {
      const result = await runLighthouseTest(page.url);

      const metrics = {
        name: page.name,
        url: page.url,
        timestamp: new Date().toISOString(),
        scores: {
          performance: result.categories.performance.score * 100,
        },
        metrics: {
          firstContentfulPaint: result.audits['first-contentful-paint'].numericValue,
          largestContentfulPaint: result.audits['largest-contentful-paint'].numericValue,
          cumulativeLayoutShift: result.audits['cumulative-layout-shift'].numericValue,
          totalBlockingTime: result.audits['total-blocking-time'].numericValue,
          speedIndex: result.audits['speed-index'].numericValue,
        },
        thresholds: {
          performance: 90,
          firstContentfulPaint: 1500,
          largestContentfulPaint: 2500,
          cumulativeLayoutShift: 0.1,
          totalBlockingTime: 200,
          speedIndex: 1300,
        },
      };

      // Check if metrics meet thresholds
      metrics.passed = {
        performance: metrics.scores.performance >= metrics.thresholds.performance,
        firstContentfulPaint: metrics.metrics.firstContentfulPaint <= metrics.thresholds.firstContentfulPaint,
        largestContentfulPaint: metrics.metrics.largestContentfulPaint <= metrics.thresholds.largestContentfulPaint,
        cumulativeLayoutShift: metrics.metrics.cumulativeLayoutShift <= metrics.thresholds.cumulativeLayoutShift,
        totalBlockingTime: metrics.metrics.totalBlockingTime <= metrics.thresholds.totalBlockingTime,
        speedIndex: metrics.metrics.speedIndex <= metrics.thresholds.speedIndex,
      };

      metrics.allPassed = Object.values(metrics.passed).every(passed => passed);

      results.push(metrics);

      console.log(`✅ ${page.name} completed`);
    } catch (error) {
      console.error(`❌ Error testing ${page.name}:`, error.message);
      results.push({
        name: page.name,
        url: page.url,
        error: error.message,
        allPassed: false,
      });
    }
  }

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalPages: results.length,
      passedPages: results.filter(r => r.allPassed).length,
      failedPages: results.filter(r => !r.allPassed).length,
    },
    results,
  };

  // Save report
  const reportsDir = path.join(__dirname, '../../reports/performance');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const reportPath = path.join(reportsDir, `lighthouse-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log('\n📊 Performance Test Summary:');
  console.log(`Total Pages: ${report.summary.totalPages}`);
  console.log(`Passed: ${report.summary.passedPages}`);
  console.log(`Failed: ${report.summary.failedPages}`);
  console.log(`Report saved: ${reportPath}`);

  // Exit with error code if any tests failed
  if (report.summary.failedPages > 0) {
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runPerformanceTests().catch(console.error);
}

module.exports = { runLighthouseTest, runPerformanceTests };
```

```bash
# Generate performance testing with agent
npx claude-flow-novice sparc run perf-analyzer "Comprehensive performance testing with Lighthouse and K6"
```

## 🔄 MCP Integration for Testing

### Initialize Testing Swarm

```javascript
// Setup swarm for comprehensive testing
await mcp__claude_flow__swarm_init({
  topology: "star",
  maxAgents: 8,
  strategy: "balanced"
});

// Spawn testing agents
await mcp__claude_flow__agent_spawn({
  type: "tester",
  capabilities: ["unit-testing", "integration-testing", "e2e-testing"]
});

await mcp__claude_flow__agent_spawn({
  type: "perf-analyzer",
  capabilities: ["load-testing", "performance-monitoring", "lighthouse"]
});

await mcp__claude_flow__agent_spawn({
  type: "reviewer",
  capabilities: ["test-review", "coverage-analysis", "quality-gates"]
});
```

### Orchestrate Testing Workflow

```javascript
// Orchestrate comprehensive testing
await mcp__claude_flow__task_orchestrate({
  task: "Implement comprehensive testing strategy with unit, integration, E2E, and performance tests",
  strategy: "sequential",
  priority: "high",
  maxAgents: 6
});

// Monitor testing progress
const status = await mcp__claude_flow__task_status({
  taskId: "testing-task-id",
  detailed: true
});
```

## 📊 Test Reporting & Coverage

### 1. Coverage Configuration

**jest.config.js** (Agent-generated):
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/utils/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/vite-env.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/components/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/hooks/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  testMatch: [
    '<rootDir>/tests/**/*.test.{ts,tsx}',
    '<rootDir>/src/**/*.test.{ts,tsx}',
  ],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
```

### 2. Test Reporting Dashboard

```bash
# Generate test reporting dashboard with agent
npx claude-flow-novice sparc run tester "Test reporting dashboard with coverage metrics and trend analysis"
```

## 🚀 CI/CD Integration

### 1. GitHub Actions Testing Workflow

```bash
# Generate CI/CD testing pipeline with agent
npx claude-flow-novice sparc run cicd-engineer "GitHub Actions workflow for automated testing pipeline"
```

### 2. Test Automation Scripts

```bash
# Generate test automation scripts with agent
npx claude-flow-novice sparc run tester "Test automation scripts for local development and CI/CD"
```

---

This completes the comprehensive JavaScript documentation covering project setup, backend development, frontend development, API development, and testing automation with Claude-Flow agent coordination. Each section includes practical examples, best practices, and real-world scenarios for modern JavaScript development.