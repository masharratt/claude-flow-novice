### Next.js Development Patterns

**Framework Configuration:**
- Use App Router with TypeScript for better developer experience
- Implement Server Components and Client Components appropriately
- Use Next.js built-in API routes for backend functionality
- Configure middleware for authentication and routing
- Optimize for performance with ISR and SSG where appropriate

**Concurrent Agent Execution:**
```javascript
// ✅ CORRECT: Next.js development with specialized agents
[Single Message]:
  Task("Next.js Developer", "Build app router pages with server/client components", "coder")
  Task("API Developer", "Create API routes with validation and database integration", "backend-dev")
  Task("UI Developer", "Build responsive components with Tailwind CSS", "coder")
  Task("Auth Engineer", "Implement NextAuth.js with multiple providers", "system-architect")
  Task("Performance Engineer", "Optimize with ISR, SSG, and image optimization", "perf-analyzer")

  // Batch Next.js file operations
  Write("app/layout.tsx")
  Write("app/page.tsx")
  Write("app/api/users/route.ts")
  Write("components/ui/Button.tsx")
  Write("lib/auth.ts")

  // Next.js specific todos
  TodoWrite({ todos: [
    {content: "Setup Next.js 14+ with App Router and TypeScript", status: "in_progress", activeForm: "Setting up Next.js 14+ with App Router and TypeScript"},
    {content: "Implement server and client components architecture", status: "pending", activeForm: "Implementing server and client components architecture"},
    {content: "Configure NextAuth.js with database sessions", status: "pending", activeForm: "Configuring NextAuth.js with database sessions"},
    {content: "Build API routes with validation and error handling", status: "pending", activeForm: "Building API routes with validation and error handling"},
    {content: "Optimize performance with caching and image optimization", status: "pending", activeForm: "Optimizing performance with caching and image optimization"}
  ]})
```

**Project Structure:**
```
app/
  layout.tsx           # Root layout
  page.tsx            # Home page
  globals.css         # Global styles
  api/                # API routes
    auth/
      [...nextauth]/
        route.ts
    users/
      route.ts
      [id]/
        route.ts
  (auth)/             # Route group
    login/
      page.tsx
    register/
      page.tsx
  dashboard/          # Protected pages
    layout.tsx
    page.tsx
    users/
      page.tsx
components/
  ui/                 # Reusable UI components
    Button.tsx
    Input.tsx
    Modal.tsx
  layout/             # Layout components
    Header.tsx
    Sidebar.tsx
    Footer.tsx
lib/
  auth.ts             # Auth configuration
  db.ts               # Database connection
  utils.ts            # Utility functions
  validations.ts      # Zod schemas
middleware.ts         # Next.js middleware
next.config.js        # Next.js configuration
```

**App Layout and Pages:**
```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'My Next.js App',
  description: 'A modern web application built with Next.js',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

// app/page.tsx
import { Suspense } from 'react';
import { Button } from '@/components/ui/Button';
import { UserList } from '@/components/UserList';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default async function HomePage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to My App
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          A modern web application built with Next.js 14+
        </p>
        <Button href="/dashboard" variant="primary" size="lg">
          Get Started
        </Button>
      </div>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold mb-6">Recent Users</h2>
        <Suspense fallback={<LoadingSpinner />}>
          <UserList limit={5} />
        </Suspense>
      </section>
    </main>
  );
}

// app/dashboard/layout.tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { DashboardNav } from '@/components/layout/DashboardNav';
import { DashboardHeader } from '@/components/layout/DashboardHeader';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader user={session.user} />
      <div className="flex">
        <DashboardNav />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

**API Routes:**
```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { userCreateSchema, type User } from '@/lib/validations';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
    const search = searchParams.get('search') || '';

    const offset = (page - 1) * limit;

    // Build query with search
    let query = `
      SELECT id, email, name, created_at, updated_at
      FROM users
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      query += ` AND (email ILIKE $${params.length + 1} OR name ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const users = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
    const countParams: any[] = [];

    if (search) {
      countQuery += ` AND (email ILIKE $1 OR name ILIKE $1)`;
      countParams.push(`%${search}%`);
    }

    const totalResult = await db.query(countQuery, countParams);
    const total = parseInt(totalResult.rows[0].count);

    return NextResponse.json({
      users: users.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validatedData = userCreateSchema.parse(body);

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [validatedData.email]
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);

    // Create user
    const result = await db.query(
      `INSERT INTO users (email, name, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, email, name, created_at, updated_at`,
      [validatedData.email, validatedData.name, hashedPassword]
    );

    const newUser = result.rows[0];

    return NextResponse.json(
      {
        message: 'User created successfully',
        user: newUser,
      },
      { status: 201 }
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = params;

    // Users can only view their own profile unless they're admin
    if (!session.user.isAdmin && session.user.id !== id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const result = await db.query(
      'SELECT id, email, name, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user: result.rows[0] });

  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = params;

    // Users can only update their own profile unless they're admin
    if (!session.user.isAdmin && session.user.id !== id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate input (only allow name updates for now)
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required and must be a string' },
        { status: 400 }
      );
    }

    const result = await db.query(
      `UPDATE users
       SET name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, name, created_at, updated_at`,
      [body.name, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'User updated successfully',
      user: result.rows[0],
    });

  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Authentication with NextAuth.js:**
```typescript
// lib/auth.ts
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const result = await db.query(
            'SELECT id, email, name, password_hash, is_admin FROM users WHERE email = $1',
            [credentials.email]
          );

          const user = result.rows[0];

          if (!user) {
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password_hash
          );

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            isAdmin: user.is_admin,
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.isAdmin = user.isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.isAdmin = token.isAdmin as boolean;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google' || account?.provider === 'github') {
        try {
          // Check if user exists
          const existingUser = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [user.email]
          );

          if (existingUser.rows.length === 0) {
            // Create new user
            await db.query(
              `INSERT INTO users (email, name, created_at, updated_at)
               VALUES ($1, $2, NOW(), NOW())`,
              [user.email, user.name]
            );
          }

          return true;
        } catch (error) {
          console.error('Sign in error:', error);
          return false;
        }
      }

      return true;
    },
  },
  pages: {
    signIn: '/login',
    signUp: '/register',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

**Components:**
```tsx
// components/ui/Button.tsx
import Link from 'next/link';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  href?: string;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  href,
  className,
  type = 'button',
}: ButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';

  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const classes = cn(
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    disabled && 'opacity-50 cursor-not-allowed',
    className
  );

  const content = (
    <>
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={classes}
    >
      {content}
    </button>
  );
}

// components/UserList.tsx (Server Component)
import { db } from '@/lib/db';
import { UserCard } from './UserCard';

interface UserListProps {
  limit?: number;
}

export async function UserList({ limit = 10 }: UserListProps) {
  const result = await db.query(
    'SELECT id, email, name, created_at FROM users ORDER BY created_at DESC LIMIT $1',
    [limit]
  );

  const users = result.rows;

  if (users.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No users found.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}
```

**Middleware:**
```typescript
// middleware.ts
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    // Redirect authenticated users away from auth pages
    if (req.nextauth.token && req.nextUrl.pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    // Admin-only routes
    if (req.nextUrl.pathname.startsWith('/admin') &&
        !req.nextauth.token?.isAdmin) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Public routes
        if (req.nextUrl.pathname === '/' ||
            req.nextUrl.pathname.startsWith('/api/auth') ||
            req.nextUrl.pathname.startsWith('/login') ||
            req.nextUrl.pathname.startsWith('/register')) {
          return true;
        }

        // Protected routes require authentication
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

**Testing:**
```typescript
// __tests__/api/users.test.ts
import { createMocks } from 'node-mocks-http';
import { GET, POST } from '@/app/api/users/route';
import { getServerSession } from 'next-auth';

// Mock next-auth
jest.mock('next-auth');
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;

// Mock database
jest.mock('@/lib/db', () => ({
  db: {
    query: jest.fn(),
  },
}));

import { db } from '@/lib/db';
const mockQuery = db.query as jest.MockedFunction<typeof db.query>;

describe('/api/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('should return users for admin user', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: '1', isAdmin: true },
      } as any);

      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: '1', email: 'user1@example.com', name: 'User 1' },
          { id: '2', email: 'user2@example.com', name: 'User 2' },
        ],
      } as any);

      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '2' }],
      } as any);

      const { req } = createMocks({
        method: 'GET',
        url: '/api/users?page=1&limit=10',
      });

      const response = await GET(req as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.users).toHaveLength(2);
      expect(data.pagination.total).toBe(2);
    });

    it('should return 401 for non-admin user', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: '1', isAdmin: false },
      } as any);

      const { req } = createMocks({
        method: 'GET',
        url: '/api/users',
      });

      const response = await GET(req as any);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('POST', () => {
    it('should create user with valid data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] } as any); // No existing user
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            email: 'newuser@example.com',
            name: 'New User',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      } as any);

      const { req } = createMocks({
        method: 'POST',
        body: {
          email: 'newuser@example.com',
          name: 'New User',
          password: 'Password123!',
        },
      });

      const response = await POST(req as any);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.message).toBe('User created successfully');
      expect(data.user.email).toBe('newuser@example.com');
    });

    it('should return 409 for existing email', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: '1' }],
      } as any);

      const { req } = createMocks({
        method: 'POST',
        body: {
          email: 'existing@example.com',
          name: 'User',
          password: 'Password123!',
        },
      });

      const response = await POST(req as any);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe('User with this email already exists');
    });
  });
});
```

**Next.js Configuration:**
```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['images.unsplash.com', 'avatars.githubusercontent.com'],
    formats: ['image/webp', 'image/avif'],
  },
  experimental: {
    serverActions: true,
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/docs/:path*',
        destination: '/api-docs/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
```