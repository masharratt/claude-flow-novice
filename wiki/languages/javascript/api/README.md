# API Development with Claude-Flow

Complete guide to building REST APIs and GraphQL endpoints using Claude-Flow agent coordination.

## 🚀 API Development Workflow

### 1. Initialize API Project

```bash
# Generate REST API with agent
npx claude-flow sparc run api-docs "Express TypeScript REST API with OpenAPI documentation"

# Alternative: GraphQL API
npx claude-flow sparc run backend-dev "GraphQL API with Apollo Server and TypeScript"
```

### 2. Agent-Driven API Development

```bash
# Parallel API development
npx claude-flow sparc batch "backend-dev,api-docs,tester" "E-commerce API with documentation and testing"

# Sequential API development for complex features
npx claude-flow sparc run backend-dev "User authentication and authorization API"
npx claude-flow sparc run api-docs "Generate comprehensive API documentation"
npx claude-flow sparc run tester "Create API integration and load tests"
```

## 🏗 REST API Architecture

### 1. RESTful API Structure

**Agent-Generated API Structure**:
```
api/
├── src/
│   ├── controllers/        # Request handlers
│   │   ├── auth.controller.ts
│   │   ├── users.controller.ts
│   │   └── products.controller.ts
│   ├── middleware/         # Custom middleware
│   │   ├── auth.middleware.ts
│   │   ├── validation.middleware.ts
│   │   └── error.middleware.ts
│   ├── models/            # Database models
│   │   ├── User.model.ts
│   │   └── Product.model.ts
│   ├── routes/            # API routes
│   │   ├── auth.routes.ts
│   │   ├── users.routes.ts
│   │   └── products.routes.ts
│   ├── services/          # Business logic
│   │   ├── auth.service.ts
│   │   └── product.service.ts
│   ├── utils/             # Utilities
│   │   ├── database.ts
│   │   ├── logger.ts
│   │   └── swagger.ts
│   ├── types/             # TypeScript types
│   │   └── api.types.ts
│   ├── config/            # Configuration
│   │   └── database.config.ts
│   └── app.ts             # Express app
├── docs/                  # API documentation
│   ├── openapi.yaml
│   └── postman/
├── tests/                 # API tests
│   ├── integration/
│   └── load/
├── package.json
└── tsconfig.json
```

### 2. Generate API with Agent

```bash
# Complete API generation
npx claude-flow sparc run backend-dev "Express TypeScript REST API with:
- RESTful endpoints for CRUD operations
- JWT authentication middleware
- Input validation with Joi
- Error handling and logging
- Rate limiting and security
- Database integration
- API documentation with Swagger
- Comprehensive test suite"
```

## 🛠 REST API Implementation

### 1. API Routes & Controllers

**src/routes/products.routes.ts** (Agent-generated):
```typescript
import { Router } from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts
} from '../controllers/products.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/authorize.middleware';
import { validateProduct } from '../middleware/validation.middleware';
import { cache } from '../middleware/cache.middleware';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       required:
 *         - name
 *         - price
 *         - category
 *       properties:
 *         id:
 *           type: string
 *           description: Product unique identifier
 *         name:
 *           type: string
 *           description: Product name
 *         description:
 *           type: string
 *           description: Product description
 *         price:
 *           type: number
 *           description: Product price
 *         category:
 *           type: string
 *           description: Product category
 *         inStock:
 *           type: boolean
 *           description: Product availability
 *         imageUrl:
 *           type: string
 *           description: Product image URL
 */

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of products per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: List of products
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 */
router.get('/', cache(300), getProducts);

/**
 * @swagger
 * /api/products/search:
 *   get:
 *     summary: Search products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', searchProducts);

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Product not found
 */
router.get('/:id', cache(600), getProductById);

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/', authenticate, authorize(['admin']), validateProduct, createProduct);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Update product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       404:
 *         description: Product not found
 */
router.put('/:id', authenticate, authorize(['admin']), validateProduct, updateProduct);

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Delete product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       404:
 *         description: Product not found
 */
router.delete('/:id', authenticate, authorize(['admin']), deleteProduct);

export { router as productsRoutes };
```

**src/controllers/products.controller.ts** (Agent-generated):
```typescript
import { Request, Response } from 'express';
import { ProductService } from '../services/product.service';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../utils/AppError';

const productService = new ProductService();

export const getProducts = catchAsync(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const category = req.query.category as string;

  const result = await productService.getProducts({
    page,
    limit,
    category,
  });

  res.status(200).json({
    success: true,
    data: result.products,
    pagination: {
      page,
      limit,
      total: result.total,
      pages: Math.ceil(result.total / limit),
    },
  });
});

export const getProductById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const product = await productService.getProductById(id);

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  res.status(200).json({
    success: true,
    data: product,
  });
});

export const createProduct = catchAsync(async (req: Request, res: Response) => {
  const productData = req.body;
  const product = await productService.createProduct(productData);

  res.status(201).json({
    success: true,
    data: product,
    message: 'Product created successfully',
  });
});

export const updateProduct = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData = req.body;

  const product = await productService.updateProduct(id, updateData);

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  res.status(200).json({
    success: true,
    data: product,
    message: 'Product updated successfully',
  });
});

export const deleteProduct = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  await productService.deleteProduct(id);

  res.status(200).json({
    success: true,
    message: 'Product deleted successfully',
  });
});

export const searchProducts = catchAsync(async (req: Request, res: Response) => {
  const query = req.query.q as string;

  if (!query) {
    throw new AppError('Search query is required', 400);
  }

  const products = await productService.searchProducts(query);

  res.status(200).json({
    success: true,
    data: products,
    count: products.length,
  });
});
```

```bash
# Generate REST API endpoints with agent
npx claude-flow sparc run backend-dev "RESTful CRUD endpoints with OpenAPI documentation"
```

### 2. Service Layer Implementation

**src/services/product.service.ts** (Agent-generated):
```typescript
import { Product, IProduct } from '../models/Product.model';
import { AppError } from '../utils/AppError';

export interface ProductQuery {
  page: number;
  limit: number;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
}

export interface ProductResult {
  products: IProduct[];
  total: number;
}

export class ProductService {
  async getProducts(query: ProductQuery): Promise<ProductResult> {
    const { page, limit, category, priceMin, priceMax, inStock } = query;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter: any = {};
    if (category) filter.category = category;
    if (inStock !== undefined) filter.inStock = inStock;
    if (priceMin !== undefined || priceMax !== undefined) {
      filter.price = {};
      if (priceMin !== undefined) filter.price.$gte = priceMin;
      if (priceMax !== undefined) filter.price.$lte = priceMax;
    }

    // Execute queries in parallel
    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return { products, total };
  }

  async getProductById(id: string): Promise<IProduct | null> {
    const product = await Product.findById(id).lean();
    return product;
  }

  async createProduct(productData: Partial<IProduct>): Promise<IProduct> {
    const product = new Product(productData);
    await product.save();
    return product.toObject();
  }

  async updateProduct(
    id: string,
    updateData: Partial<IProduct>
  ): Promise<IProduct | null> {
    const product = await Product.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).lean();

    return product;
  }

  async deleteProduct(id: string): Promise<void> {
    const result = await Product.findByIdAndDelete(id);
    if (!result) {
      throw new AppError('Product not found', 404);
    }
  }

  async searchProducts(query: string): Promise<IProduct[]> {
    const products = await Product.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { category: { $regex: query, $options: 'i' } },
      ],
    })
      .limit(20)
      .lean();

    return products;
  }

  async getProductsByCategory(category: string): Promise<IProduct[]> {
    const products = await Product.find({ category, inStock: true })
      .sort({ name: 1 })
      .lean();

    return products;
  }

  async updateProductStock(id: string, quantity: number): Promise<void> {
    const product = await Product.findById(id);
    if (!product) {
      throw new AppError('Product not found', 404);
    }

    product.stock = quantity;
    product.inStock = quantity > 0;
    await product.save();
  }
}
```

```bash
# Generate service layer with agent
npx claude-flow sparc run backend-dev "Service layer with business logic and data access patterns"
```

## 📖 API Documentation

### 1. OpenAPI/Swagger Setup

**src/utils/swagger.ts** (Agent-generated):
```typescript
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'E-commerce API',
      version: '1.0.0',
      description: 'A comprehensive e-commerce API built with Express and TypeScript',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3001',
        description: 'Development server',
      },
      {
        url: 'https://api.example.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  message: { type: 'string', example: 'Unauthorized' },
                },
              },
            },
          },
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  message: { type: 'string', example: 'Validation failed' },
                  errors: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string' },
                        message: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/models/*.ts'],
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Express): void => {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'E-commerce API Documentation',
  }));

  // Serve OpenAPI spec as JSON
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};

export { specs };
```

```bash
# Generate API documentation with agent
npx claude-flow sparc run api-docs "OpenAPI 3.0 documentation with Swagger UI integration"
```

### 2. Postman Collection Generation

```bash
# Generate Postman collection with agent
npx claude-flow sparc run api-docs "Postman collection with environment variables and test scripts"
```

## 🔍 GraphQL API Implementation

### 1. GraphQL Schema & Resolvers

**src/graphql/schema.ts** (Agent-generated):
```typescript
import { buildSchema } from 'graphql';

export const schema = buildSchema(`
  type User {
    id: ID!
    name: String!
    email: String!
    role: String!
    createdAt: String!
    updatedAt: String!
  }

  type Product {
    id: ID!
    name: String!
    description: String
    price: Float!
    category: String!
    inStock: Boolean!
    imageUrl: String
    createdAt: String!
    updatedAt: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  input RegisterInput {
    name: String!
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input ProductInput {
    name: String!
    description: String
    price: Float!
    category: String!
    inStock: Boolean
    imageUrl: String
  }

  input ProductFilter {
    category: String
    priceMin: Float
    priceMax: Float
    inStock: Boolean
  }

  type Query {
    # User queries
    me: User
    users: [User!]!
    user(id: ID!): User

    # Product queries
    products(filter: ProductFilter, limit: Int, offset: Int): [Product!]!
    product(id: ID!): Product
    searchProducts(query: String!): [Product!]!
  }

  type Mutation {
    # Authentication
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!

    # Product mutations
    createProduct(input: ProductInput!): Product!
    updateProduct(id: ID!, input: ProductInput!): Product!
    deleteProduct(id: ID!): Boolean!
  }

  type Subscription {
    productAdded: Product!
    productUpdated: Product!
  }
`);
```

**src/graphql/resolvers.ts** (Agent-generated):
```typescript
import { AuthService } from '../services/auth.service';
import { ProductService } from '../services/product.service';
import { UserService } from '../services/user.service';
import { AppError } from '../utils/AppError';
import { pubsub } from './pubsub';

const authService = new AuthService();
const productService = new ProductService();
const userService = new UserService();

export const resolvers = {
  Query: {
    me: async (parent: any, args: any, context: any) => {
      if (!context.user) {
        throw new AppError('Authentication required', 401);
      }
      return context.user;
    },

    users: async (parent: any, args: any, context: any) => {
      if (!context.user || context.user.role !== 'admin') {
        throw new AppError('Admin access required', 403);
      }
      return userService.getAllUsers();
    },

    user: async (parent: any, { id }: { id: string }, context: any) => {
      if (!context.user) {
        throw new AppError('Authentication required', 401);
      }
      return userService.getUserById(id);
    },

    products: async (
      parent: any,
      { filter, limit = 10, offset = 0 }: any
    ) => {
      const result = await productService.getProducts({
        page: Math.floor(offset / limit) + 1,
        limit,
        ...filter,
      });
      return result.products;
    },

    product: async (parent: any, { id }: { id: string }) => {
      const product = await productService.getProductById(id);
      if (!product) {
        throw new AppError('Product not found', 404);
      }
      return product;
    },

    searchProducts: async (parent: any, { query }: { query: string }) => {
      return productService.searchProducts(query);
    },
  },

  Mutation: {
    register: async (parent: any, { input }: any) => {
      const result = await authService.register(input);
      return result;
    },

    login: async (parent: any, { input }: any) => {
      const result = await authService.login(input.email, input.password);
      return result;
    },

    createProduct: async (parent: any, { input }: any, context: any) => {
      if (!context.user || context.user.role !== 'admin') {
        throw new AppError('Admin access required', 403);
      }

      const product = await productService.createProduct(input);

      // Publish subscription
      pubsub.publish('PRODUCT_ADDED', { productAdded: product });

      return product;
    },

    updateProduct: async (
      parent: any,
      { id, input }: { id: string; input: any },
      context: any
    ) => {
      if (!context.user || context.user.role !== 'admin') {
        throw new AppError('Admin access required', 403);
      }

      const product = await productService.updateProduct(id, input);
      if (!product) {
        throw new AppError('Product not found', 404);
      }

      // Publish subscription
      pubsub.publish('PRODUCT_UPDATED', { productUpdated: product });

      return product;
    },

    deleteProduct: async (
      parent: any,
      { id }: { id: string },
      context: any
    ) => {
      if (!context.user || context.user.role !== 'admin') {
        throw new AppError('Admin access required', 403);
      }

      await productService.deleteProduct(id);
      return true;
    },
  },

  Subscription: {
    productAdded: {
      subscribe: () => pubsub.asyncIterator(['PRODUCT_ADDED']),
    },

    productUpdated: {
      subscribe: () => pubsub.asyncIterator(['PRODUCT_UPDATED']),
    },
  },
};
```

```bash
# Generate GraphQL API with agent
npx claude-flow sparc run backend-dev "GraphQL API with Apollo Server, subscriptions, and TypeScript"
```

### 2. Apollo Server Setup

**src/graphql/server.ts** (Agent-generated):
```typescript
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { Express } from 'express';
import { createServer } from 'http';
import { schema } from './schema';
import { resolvers } from './resolvers';
import { authenticateGraphQL } from '../middleware/auth.middleware';

export const setupGraphQL = async (app: Express) => {
  const httpServer = createServer(app);

  // Create executable schema
  const executableSchema = makeExecutableSchema({
    typeDefs: schema,
    resolvers,
  });

  // Create WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  const serverCleanup = useServer(
    {
      schema: executableSchema,
      context: async (ctx) => {
        // Add authentication context for subscriptions
        return { user: await authenticateGraphQL(ctx.connectionParams) };
      },
    },
    wsServer
  );

  // Create Apollo Server
  const server = new ApolloServer({
    schema: executableSchema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await server.start();

  // Apply middleware
  app.use(
    '/graphql',
    expressMiddleware(server, {
      context: async ({ req }) => {
        const user = await authenticateGraphQL(req.headers.authorization);
        return { user };
      },
    })
  );

  return httpServer;
};
```

```bash
# Generate GraphQL server setup with agent
npx claude-flow sparc run backend-dev "Apollo Server setup with subscriptions and authentication"
```

## 🧪 API Testing Strategies

### 1. Integration Testing

**tests/integration/products.test.ts** (Agent-generated):
```typescript
import request from 'supertest';
import { app } from '../../src/app';
import { Product } from '../../src/models/Product.model';
import { User } from '../../src/models/User.model';
import { generateToken } from '../../src/utils/jwt';

describe('Products API', () => {
  let authToken: string;
  let adminToken: string;
  let productId: string;

  beforeAll(async () => {
    // Create test user
    const user = await User.create({
      name: 'Test User',
      email: 'user@test.com',
      password: 'password123',
      role: 'user',
    });
    authToken = generateToken(user._id);

    // Create admin user
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'password123',
      role: 'admin',
    });
    adminToken = generateToken(admin._id);
  });

  describe('GET /api/products', () => {
    beforeEach(async () => {
      await Product.create([
        {
          name: 'Product 1',
          description: 'Test product 1',
          price: 29.99,
          category: 'electronics',
          inStock: true,
        },
        {
          name: 'Product 2',
          description: 'Test product 2',
          price: 19.99,
          category: 'books',
          inStock: false,
        },
      ]);
    });

    it('should get all products', async () => {
      const response = await request(app)
        .get('/api/products')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toBeDefined();
    });

    it('should filter products by category', async () => {
      const response = await request(app)
        .get('/api/products?category=electronics')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].category).toBe('electronics');
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/products?page=1&limit=1')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(1);
    });
  });

  describe('POST /api/products', () => {
    const productData = {
      name: 'New Product',
      description: 'A new test product',
      price: 39.99,
      category: 'electronics',
      inStock: true,
    };

    it('should create product with admin token', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(productData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(productData.name);
      productId = response.body.data._id;
    });

    it('should reject creation without auth', async () => {
      await request(app)
        .post('/api/products')
        .send(productData)
        .expect(401);
    });

    it('should reject creation with user token', async () => {
      await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send(productData)
        .expect(403);
    });

    it('should validate required fields', async () => {
      const invalidData = { name: 'Test' }; // Missing required fields

      await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidData)
        .expect(400);
    });
  });

  describe('GET /api/products/:id', () => {
    beforeEach(async () => {
      const product = await Product.create({
        name: 'Test Product',
        price: 29.99,
        category: 'test',
        inStock: true,
      });
      productId = product._id.toString();
    });

    it('should get product by ID', async () => {
      const response = await request(app)
        .get(`/api/products/${productId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe(productId);
    });

    it('should return 404 for non-existent product', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      await request(app)
        .get(`/api/products/${fakeId}`)
        .expect(404);
    });
  });

  describe('PUT /api/products/:id', () => {
    beforeEach(async () => {
      const product = await Product.create({
        name: 'Test Product',
        price: 29.99,
        category: 'test',
        inStock: true,
      });
      productId = product._id.toString();
    });

    it('should update product with admin token', async () => {
      const updateData = { name: 'Updated Product', price: 35.99 };

      const response = await request(app)
        .put(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.price).toBe(updateData.price);
    });

    it('should reject update without auth', async () => {
      await request(app)
        .put(`/api/products/${productId}`)
        .send({ name: 'Updated' })
        .expect(401);
    });
  });

  describe('DELETE /api/products/:id', () => {
    beforeEach(async () => {
      const product = await Product.create({
        name: 'Test Product',
        price: 29.99,
        category: 'test',
        inStock: true,
      });
      productId = product._id.toString();
    });

    it('should delete product with admin token', async () => {
      await request(app)
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify product was deleted
      const product = await Product.findById(productId);
      expect(product).toBeNull();
    });

    it('should reject deletion without auth', async () => {
      await request(app)
        .delete(`/api/products/${productId}`)
        .expect(401);
    });
  });

  describe('GET /api/products/search', () => {
    beforeEach(async () => {
      await Product.create([
        {
          name: 'iPhone 14',
          description: 'Latest smartphone',
          price: 999.99,
          category: 'electronics',
          inStock: true,
        },
        {
          name: 'Samsung Galaxy',
          description: 'Android smartphone',
          price: 799.99,
          category: 'electronics',
          inStock: true,
        },
      ]);
    });

    it('should search products by name', async () => {
      const response = await request(app)
        .get('/api/products/search?q=iPhone')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toContain('iPhone');
    });

    it('should search products by description', async () => {
      const response = await request(app)
        .get('/api/products/search?q=smartphone')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    it('should return empty array for no matches', async () => {
      const response = await request(app)
        .get('/api/products/search?q=nonexistent')
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('should require search query', async () => {
      await request(app)
        .get('/api/products/search')
        .expect(400);
    });
  });
});
```

```bash
# Generate comprehensive API tests with agent
npx claude-flow sparc run tester "Complete API testing suite with Jest, Supertest, and test database"
```

### 2. Load Testing

**tests/load/products.load.test.js** (Agent-generated):
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 50 },    // Increase to 50 users
    { duration: '2m', target: 100 },   // Peak at 100 users
    { duration: '1m', target: 50 },    // Scale down to 50 users
    { duration: '30s', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.05'],   // Error rate under 5%
    errors: ['rate<0.1'],             // Custom error rate under 10%
  },
};

const BASE_URL = 'http://localhost:3001/api';

export default function () {
  // Test scenarios
  const scenarios = [
    () => testGetProducts(),
    () => testSearchProducts(),
    () => testGetProductById(),
  ];

  // Randomly select a scenario
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  scenario();

  sleep(1);
}

function testGetProducts() {
  const response = http.get(`${BASE_URL}/products?page=1&limit=10`);

  const success = check(response, {
    'products list status is 200': (r) => r.status === 200,
    'products list has data': (r) => JSON.parse(r.body).data.length > 0,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(!success);
}

function testSearchProducts() {
  const searchTerms = ['phone', 'laptop', 'book', 'electronics'];
  const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

  const response = http.get(`${BASE_URL}/products/search?q=${term}`);

  const success = check(response, {
    'search status is 200': (r) => r.status === 200,
    'search returns results': (r) => JSON.parse(r.body).success,
    'response time < 300ms': (r) => r.timings.duration < 300,
  });

  errorRate.add(!success);
}

function testGetProductById() {
  // Use a list of known product IDs
  const productIds = [
    '507f1f77bcf86cd799439011',
    '507f1f77bcf86cd799439012',
    '507f1f77bcf86cd799439013',
  ];

  const productId = productIds[Math.floor(Math.random() * productIds.length)];
  const response = http.get(`${BASE_URL}/products/${productId}`);

  const success = check(response, {
    'product detail status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  errorRate.add(!success);
}

export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    stdout: `
    Load Test Summary:
    ==================
    Total Requests: ${data.metrics.http_reqs.count}
    Failed Requests: ${data.metrics.http_req_failed.count}
    Average Response Time: ${data.metrics.http_req_duration.avg.toFixed(2)}ms
    95th Percentile: ${data.metrics['http_req_duration{p=95}'].value.toFixed(2)}ms
    Error Rate: ${(data.metrics.errors.rate * 100).toFixed(2)}%
    `,
  };
}
```

```bash
# Generate load testing with agent
npx claude-flow sparc run tester "Load testing with K6 for API performance validation"
```

## 🔄 MCP Integration for API Development

### Initialize API Development Swarm

```javascript
// Setup swarm for API development
await mcp__claude_flow__swarm_init({
  topology: "hierarchical",
  maxAgents: 6,
  strategy: "balanced"
});

// Spawn API development agents
await mcp__claude_flow__agent_spawn({
  type: "backend-dev",
  capabilities: ["express", "graphql", "api-design", "openapi"]
});

await mcp__claude_flow__agent_spawn({
  type: "api-docs",
  capabilities: ["swagger", "postman", "documentation"]
});

await mcp__claude_flow__agent_spawn({
  type: "tester",
  capabilities: ["api-testing", "load-testing", "integration-testing"]
});
```

### Orchestrate API Development

```javascript
// Orchestrate API development tasks
await mcp__claude_flow__task_orchestrate({
  task: "Build comprehensive API with REST and GraphQL endpoints, documentation, and testing",
  strategy: "parallel",
  priority: "high",
  maxAgents: 4
});

// Monitor API development progress
const status = await mcp__claude_flow__task_status({
  taskId: "api-dev-task-id",
  detailed: true
});
```

## 🚀 Performance & Security

### 1. API Rate Limiting

```bash
# Generate rate limiting with agent
npx claude-flow sparc run backend-dev "Advanced rate limiting with Redis and tiered limits"
```

### 2. API Security

```bash
# Generate security middleware with agent
npx claude-flow sparc run reviewer "API security with helmet, CORS, input validation, and SQL injection prevention"
```

### 3. API Monitoring

```bash
# Generate monitoring setup with agent
npx claude-flow sparc run backend-dev "API monitoring with metrics, logging, and health checks"
```

## 📦 API Deployment

### 1. Docker Configuration

```bash
# Generate Docker setup for API with agent
npx claude-flow sparc run cicd-engineer "Docker configuration for API deployment with multi-stage builds"
```

### 2. CI/CD Pipeline

```bash
# Generate CI/CD pipeline with agent
npx claude-flow sparc run cicd-engineer "GitHub Actions pipeline for API testing and deployment"
```

---

**Next**: Explore [Testing & Automation](../testing/) for comprehensive testing strategies with agent coordination.