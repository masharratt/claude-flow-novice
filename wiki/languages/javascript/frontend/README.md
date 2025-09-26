# React Frontend Development with Claude-Flow

Complete guide to building modern React applications using Claude-Flow agent coordination.

## 🚀 Frontend Development Workflow

### 1. Initialize React Project

```bash
# Generate React app with agent
npx claude-flow sparc run coder "React TypeScript application with routing, state management, and UI components"

# Alternative: Next.js full-stack
npx claude-flow sparc run coder "Next.js application with App Router and TypeScript"
```

### 2. Agent-Driven Development

```bash
# Parallel frontend development
npx claude-flow sparc batch "coder,reviewer,tester" "E-commerce frontend development"

# Component-driven development
npx claude-flow sparc run coder "React component library with Storybook"
npx claude-flow sparc run tester "Component testing with React Testing Library"
```

## 🏗 React Application Architecture

### 1. Modern React Project Structure

**Agent-Generated Frontend Structure**:
```
frontend/
├── src/
│   ├── components/         # Reusable components
│   │   ├── ui/            # Base UI components
│   │   ├── forms/         # Form components
│   │   └── layout/        # Layout components
│   ├── pages/             # Page components
│   ├── hooks/             # Custom React hooks
│   ├── context/           # React context providers
│   ├── services/          # API services
│   ├── utils/             # Utility functions
│   ├── types/             # TypeScript types
│   ├── store/             # State management
│   ├── styles/            # Global styles
│   ├── assets/            # Static assets
│   └── App.tsx            # Main App component
├── public/                # Static files
├── tests/                 # Test files
│   ├── components/        # Component tests
│   ├── pages/             # Page tests
│   ├── hooks/             # Hook tests
│   └── __mocks__/         # Test mocks
├── .storybook/            # Storybook configuration
├── docs/                  # Component documentation
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

### 2. Generate Frontend with Agent

```bash
# Complete frontend generation
npx claude-flow sparc run coder "React TypeScript application with:
- Modern React 18 features
- React Router v6
- Zustand state management
- TanStack Query for API calls
- Tailwind CSS styling
- React Hook Form
- Zod validation
- React Testing Library setup"
```

## 🎨 Component Development

### 1. Base UI Components

**src/components/ui/Button.tsx** (Agent-generated):
```typescript
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'underline-offset-4 hover:underline text-primary',
      },
      size: {
        default: 'h-10 py-2 px-4',
        sm: 'h-9 px-3 rounded-md',
        lg: 'h-11 px-8 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-3 h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
```

```bash
# Generate UI component library with agent
npx claude-flow sparc run coder "Comprehensive UI component library with Tailwind CSS and TypeScript"
```

### 2. Form Components

**src/components/forms/ContactForm.tsx** (Agent-generated):
```typescript
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/hooks/useToast';

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

type ContactFormData = z.infer<typeof contactSchema>;

interface ContactFormProps {
  onSubmit: (data: ContactFormData) => Promise<void>;
}

export const ContactForm: React.FC<ContactFormProps> = ({ onSubmit }) => {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  const handleFormSubmit = async (data: ContactFormData) => {
    try {
      await onSubmit(data);
      toast({
        title: 'Success!',
        description: 'Your message has been sent successfully.',
        variant: 'default',
      });
      reset();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Name
        </label>
        <Input
          id="name"
          type="text"
          {...register('name')}
          error={errors.name?.message}
          className="mt-1"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <Input
          id="email"
          type="email"
          {...register('email')}
          error={errors.email?.message}
          className="mt-1"
        />
      </div>

      <div>
        <label htmlFor="subject" className="block text-sm font-medium text-gray-700">
          Subject
        </label>
        <Input
          id="subject"
          type="text"
          {...register('subject')}
          error={errors.subject?.message}
          className="mt-1"
        />
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700">
          Message
        </label>
        <Textarea
          id="message"
          rows={5}
          {...register('message')}
          error={errors.message?.message}
          className="mt-1"
        />
      </div>

      <Button
        type="submit"
        loading={isSubmitting}
        className="w-full"
      >
        Send Message
      </Button>
    </form>
  );
};
```

```bash
# Generate form components with agent
npx claude-flow sparc run coder "React forms with validation using React Hook Form and Zod"
```

### 3. Custom Hooks

**src/hooks/useApi.ts** (Agent-generated):
```typescript
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/apiClient';

export interface UseApiOptions<T> {
  enabled?: boolean;
  staleTime?: number;
  cacheTime?: number;
  refetchOnWindowFocus?: boolean;
}

export const useApi = <T>(
  key: string,
  url: string,
  options?: UseApiOptions<T>
) => {
  return useQuery({
    queryKey: [key],
    queryFn: () => apiClient.get<T>(url).then(res => res.data),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5 minutes
    cacheTime: options?.cacheTime ?? 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
  });
};

export const useApiMutation = <TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: {
    onSuccess?: (data: TData) => void;
    onError?: (error: Error) => void;
    invalidateKeys?: string[];
  }
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      if (options?.invalidateKeys) {
        options.invalidateKeys.forEach(key => {
          queryClient.invalidateQueries({ queryKey: [key] });
        });
      }
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
};

// Custom hook for local storage
export const useLocalStorage = <T>(
  key: string,
  initialValue: T
): [T, (value: T) => void] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
};

// Custom hook for debounced values
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};
```

```bash
# Generate custom hooks with agent
npx claude-flow sparc run coder "Custom React hooks for API calls, local storage, and common patterns"
```

## 🛠 State Management

### 1. Zustand Store Setup

**src/store/authStore.ts** (Agent-generated):
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/services/apiClient';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  checkAuth: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // State
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.post('/auth/login', { email, password });
          const { user, token } = response.data.data;

          // Set auth header for future requests
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.message || 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (name: string, email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.post('/auth/register', { name, email, password });
          const { user, token } = response.data.data;

          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.message || 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: () => {
        delete apiClient.defaults.headers.common['Authorization'];
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      clearError: () => set({ error: null }),

      checkAuth: async () => {
        const { token } = get();
        if (!token) return;

        try {
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          const response = await apiClient.get('/auth/me');
          set({ user: response.data.data.user, isAuthenticated: true });
        } catch (error) {
          get().logout();
        }
      },
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated
      }),
    }
  )
);
```

```bash
# Generate state management with agent
npx claude-flow sparc run coder "Zustand state management with persistence and TypeScript"
```

### 2. React Query Setup

**src/services/apiClient.ts** (Agent-generated):
```typescript
import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API service functions
export const authAPI = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),

  register: (name: string, email: string, password: string) =>
    apiClient.post('/auth/register', { name, email, password }),

  getProfile: () => apiClient.get('/auth/me'),

  updateProfile: (data: any) => apiClient.put('/auth/profile', data),
};

export const productsAPI = {
  getProducts: (params?: any) => apiClient.get('/products', { params }),

  getProduct: (id: string) => apiClient.get(`/products/${id}`),

  createProduct: (data: any) => apiClient.post('/products', data),

  updateProduct: (id: string, data: any) => apiClient.put(`/products/${id}`, data),

  deleteProduct: (id: string) => apiClient.delete(`/products/${id}`),
};
```

## 🎨 Styling & UI Framework

### 1. Tailwind CSS Configuration

**tailwind.config.js** (Agent-generated):
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

```bash
# Generate Tailwind configuration with agent
npx claude-flow sparc run coder "Tailwind CSS configuration with design system and dark mode"
```

### 2. Component Styling System

```bash
# Generate comprehensive styling system with agent
npx claude-flow sparc run coder "Component styling system with Tailwind CSS, CSS variables, and theme support"
```

## 🧪 Frontend Testing

### 1. Component Testing Setup

**src/components/__tests__/Button.test.tsx** (Agent-generated):
```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../ui/Button';

describe('Button', () => {
  it('renders correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('displays loading state', () => {
    render(<Button loading>Loading button</Button>);

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveClass('opacity-50');
  });

  it('applies different variants', () => {
    const { rerender } = render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-destructive');

    rerender(<Button variant="outline">Outline</Button>);
    expect(screen.getByRole('button')).toHaveClass('border');
  });

  it('applies different sizes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-9');

    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-11');
  });
});
```

### 2. Hook Testing

**src/hooks/__tests__/useApi.test.ts** (Agent-generated):
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useApi } from '../useApi';
import { apiClient } from '@/services/apiClient';

// Mock the API client
jest.mock('@/services/apiClient');
const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches data successfully', async () => {
    const mockData = { id: 1, name: 'Test User' };
    mockedApiClient.get.mockResolvedValueOnce({ data: mockData });

    const { result } = renderHook(
      () => useApi('user', '/users/1'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(mockedApiClient.get).toHaveBeenCalledWith('/users/1');
  });

  it('handles error states', async () => {
    const mockError = new Error('API Error');
    mockedApiClient.get.mockRejectedValueOnce(mockError);

    const { result } = renderHook(
      () => useApi('user', '/users/1'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(mockError);
  });
});
```

```bash
# Generate comprehensive frontend tests with agent
npx claude-flow sparc run tester "React Testing Library setup with component, hook, and integration tests"
```

## 🚀 Performance Optimization

### 1. Code Splitting & Lazy Loading

**src/pages/LazyPages.tsx** (Agent-generated):
```typescript
import React, { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';

// Lazy load page components
const HomePage = React.lazy(() => import('./Home'));
const AboutPage = React.lazy(() => import('./About'));
const ProductsPage = React.lazy(() => import('./Products'));
const ProductDetailPage = React.lazy(() => import('./ProductDetail'));
const ProfilePage = React.lazy(() => import('./Profile'));

const LazyPageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<Spinner className="flex justify-center items-center h-64" />}>
    {children}
  </Suspense>
);

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <LazyPageWrapper>
            <HomePage />
          </LazyPageWrapper>
        }
      />
      <Route
        path="/about"
        element={
          <LazyPageWrapper>
            <AboutPage />
          </LazyPageWrapper>
        }
      />
      <Route
        path="/products"
        element={
          <LazyPageWrapper>
            <ProductsPage />
          </LazyPageWrapper>
        }
      />
      <Route
        path="/products/:id"
        element={
          <LazyPageWrapper>
            <ProductDetailPage />
          </LazyPageWrapper>
        }
      />
      <Route
        path="/profile"
        element={
          <LazyPageWrapper>
            <ProfilePage />
          </LazyPageWrapper>
        }
      />
    </Routes>
  );
};
```

### 2. Image Optimization

```bash
# Generate image optimization with agent
npx claude-flow sparc run perf-analyzer "Image optimization with lazy loading and responsive images"
```

### 3. Bundle Analysis

```bash
# Generate bundle analysis with agent
npx claude-flow sparc run perf-analyzer "Webpack bundle analysis and optimization strategies"
```

## 🔄 MCP Integration for Frontend Development

### Initialize Frontend Swarm

```javascript
// Setup swarm for frontend development
await mcp__claude_flow__swarm_init({
  topology: "star",
  maxAgents: 5,
  strategy: "adaptive"
});

// Spawn frontend development agents
await mcp__claude_flow__agent_spawn({
  type: "coder",
  capabilities: ["react", "typescript", "tailwind", "testing"]
});

await mcp__claude_flow__agent_spawn({
  type: "reviewer",
  capabilities: ["code-quality", "performance", "accessibility"]
});

await mcp__claude_flow__agent_spawn({
  type: "tester",
  capabilities: ["react-testing-library", "jest", "e2e"]
});
```

### Orchestrate Frontend Development

```javascript
// Orchestrate frontend development tasks
await mcp__claude_flow__task_orchestrate({
  task: "Build React TypeScript application with modern tooling, state management, and comprehensive testing",
  strategy: "parallel",
  priority: "high",
  maxAgents: 3
});

// Monitor development progress
const status = await mcp__claude_flow__task_status({
  taskId: "frontend-dev-task-id",
  detailed: true
});
```

## 📱 Responsive Design & Accessibility

### 1. Responsive Components

```bash
# Generate responsive design with agent
npx claude-flow sparc run coder "Responsive React components with mobile-first design"
```

### 2. Accessibility Implementation

```bash
# Generate accessibility features with agent
npx claude-flow sparc run reviewer "WCAG 2.1 compliance and accessibility testing"
```

## 🔧 Build & Deployment

### 1. Vite Production Build

**vite.config.ts** (Production optimized):
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  preview: {
    port: 3000,
    host: true,
  },
});
```

### 2. Docker Configuration

**Dockerfile** (Agent-generated):
```dockerfile
# Multi-stage build for React app
FROM node:18-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built app
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

```bash
# Generate production deployment with agent
npx claude-flow sparc run cicd-engineer "Production Docker build and deployment configuration"
```

---

**Next**: Explore [API Development](../api/) for Express REST APIs and GraphQL with agent coordination.