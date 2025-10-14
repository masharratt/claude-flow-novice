# API Documentation Template

## Getting Started

### Base URL
```
https://api.example.com/v1
```

### Authentication
Most endpoints require authentication using JWT tokens.

#### How to authenticate:
1. Login using `/auth/login` endpoint
2. Receive JWT token in response
3. Include token in Authorization header for subsequent requests:

```http
Authorization: Bearer <your_jwt_token>
```

### Response Format
All API responses follow this structure:

```json
{
  "success": true,
  "data": {},
  "message": "Operation successful",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Common Error Codes
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Validation Error
- `429` - Too Many Requests
- `500` - Internal Server Error

## Endpoints

### Authentication

#### Register User
```http
POST /auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "User registered successfully"
}
```

#### Login
```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "refresh_token_here"
  },
  "message": "Login successful"
}
```

### Products

#### Get All Products
```http
GET /products?page=1&limit=20&category=electronics&sort=price&order=asc
```

**Query Parameters:**
- `page` (optional): Page number for pagination
- `limit` (optional): Number of items per page
- `category` (optional): Filter by category
- `sort` (optional): Field to sort by
- `order` (optional): Sort order (asc/desc)
- `minPrice` (optional): Minimum price filter
- `maxPrice` (optional): Maximum price filter

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "123",
        "name": "Wireless Headphones",
        "description": "High-quality wireless headphones",
        "price": 99.99,
        "category": "electronics",
        "stock": 50,
        "images": ["image1.jpg", "image2.jpg"],
        "rating": 4.5,
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "pages": 5
    }
  }
}
```

#### Get Product by ID
```http
GET /products/{id}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "123",
    "name": "Wireless Headphones",
    "description": "High-quality wireless headphones with noise cancellation",
    "price": 99.99,
    "category": "electronics",
    "stock": 50,
    "images": ["image1.jpg", "image2.jpg"],
    "rating": 4.5,
    "reviews": 125,
    "specifications": {
      "brand": "TechBrand",
      "model": "WH-1000XM4",
      "color": "Black"
    },
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-15T00:00:00Z"
  }
}
```

### Orders

#### Create Order
```http
POST /orders
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "items": [
    {
      "productId": "123",
      "quantity": 2,
      "price": 99.99
    }
  ],
  "shippingAddress": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  },
  "paymentMethod": "credit_card"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "ORD-123456",
    "status": "pending",
    "total": 199.98,
    "items": [
      {
        "productId": "123",
        "quantity": 2,
        "price": 99.99,
        "subtotal": 199.98
      }
    ],
    "estimatedDelivery": "2024-01-05T00:00:00Z"
  },
  "message": "Order created successfully"
}
```

### Cart

#### Get Cart
```http
GET /cart
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "cart_item_123",
        "product": {
          "id": "123",
          "name": "Wireless Headphones",
          "price": 99.99,
          "image": "image1.jpg"
        },
        "quantity": 2,
        "subtotal": 199.98
      }
    ],
    "total": 199.98,
    "itemCount": 2
  }
}
```

#### Add Item to Cart
```http
POST /cart/items
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "productId": "123",
  "quantity": 1
}
```

### Users

#### Get Current User Profile
```http
GET /users/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "avatar": "avatar.jpg",
    "role": "customer",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

## Rate Limiting
- **General API**: 1000 requests per hour
- **Authentication endpoints**: 10 requests per minute
- **File uploads**: 100 requests per hour

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## SDK Examples

### JavaScript/Node.js
```javascript
const API_BASE_URL = 'https://api.example.com/v1';

class APIClient {
  constructor(token = null) {
    this.token = token;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    return response.json();
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    this.token = data.data.token;
    return data;
  }

  async getProducts(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/products?${queryString}`);
  }

  async addToCart(productId, quantity) {
    return this.request('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity })
    });
  }
}

// Usage
const client = new APIClient();
await client.login('user@example.com', 'password123');
const products = await client.getProducts({ category: 'electronics' });
```