# API Endpoint Structure and Routes

## Overview
This document outlines the RESTful API structure for our application, following best practices for scalability, maintainability, and consistency.

## Base URL
```
https://api.example.com/v1
```

## Authentication
All endpoints (except public ones) require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Response Format
All responses follow a consistent format:
```json
{
  "success": true,
  "data": {},
  "message": "Operation successful",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## API Endpoints

### 1. Authentication Routes
```
POST   /auth/register          # User registration
POST   /auth/login             # User login
POST   /auth/logout            # User logout
POST   /auth/refresh           # Refresh JWT token
POST   /auth/forgot-password   # Request password reset
POST   /auth/reset-password    # Reset password
GET    /auth/verify-email      # Verify email address
```

### 2. User Management Routes
```
GET    /users                  # Get all users (admin only)
GET    /users/{id}             # Get user by ID
PUT    /users/{id}             # Update user profile
DELETE /users/{id}             # Delete user (admin only)
GET    /users/me               # Get current user profile
PUT    /users/me               # Update current user profile
POST   /users/me/avatar        # Upload user avatar
DELETE /users/me/avatar        # Delete user avatar
```

### 3. Product Routes
```
GET    /products               # Get all products (with pagination, filtering, sorting)
GET    /products/{id}          # Get product by ID
POST   /products               # Create new product (admin only)
PUT    /products/{id}          # Update product (admin only)
DELETE /products/{id}          # Delete product (admin only)
GET    /products/{id}/reviews  # Get product reviews
POST   /products/{id}/reviews  # Add product review
GET    /products/search        # Search products
GET    /products/categories    # Get product categories
GET    /products/featured      # Get featured products
```

### 4. Order Routes
```
GET    /orders                 # Get user orders
GET    /orders/{id}            # Get order by ID
POST   /orders                 # Create new order
PUT    /orders/{id}            # Update order status
DELETE /orders/{id}            # Cancel order
GET    /orders/{id}/items      # Get order items
POST   /orders/{id}/items      # Add item to order
PUT    /orders/{id}/items/{itemId}    # Update order item
DELETE /orders/{id}/items/{itemId}    # Remove item from order
```

### 5. Payment Routes
```
POST   /payments/process       # Process payment
GET    /payments/{id}          # Get payment details
POST   /payments/webhook       # Payment webhook handler
GET    /payments/methods       # Get available payment methods
POST   /payments/refund        # Request refund
```

### 6. Cart Routes
```
GET    /cart                   # Get user cart
POST   /cart/items             # Add item to cart
PUT    /cart/items/{id}        # Update cart item quantity
DELETE /cart/items/{id}        # Remove item from cart
DELETE /cart                   # Clear cart
POST   /cart/checkout          # Initiate checkout
```

### 7. Category Routes
```
GET    /categories             # Get all categories
GET    /categories/{id}        # Get category by ID
POST   /categories             # Create category (admin only)
PUT    /categories/{id}        # Update category (admin only)
DELETE /categories/{id}        # Delete category (admin only)
GET    /categories/{id}/products    # Get products in category
```

### 8. Review Routes
```
GET    /reviews                # Get all reviews (with filtering)
GET    /reviews/{id}           # Get review by ID
PUT    /reviews/{id}           # Update review (owner only)
DELETE /reviews/{id}           # Delete review (owner or admin)
POST   /reviews/{id}/helpful   # Mark review as helpful
```

### 9. Wishlist Routes
```
GET    /wishlist               # Get user wishlist
POST   /wishlist/items         # Add item to wishlist
DELETE /wishlist/items/{id}    # Remove item from wishlist
DELETE /wishlist               # Clear wishlist
```

### 10. Notification Routes
```
GET    /notifications          # Get user notifications
PUT    /notifications/{id}/read    # Mark notification as read
PUT    /notifications/read-all     # Mark all notifications as read
DELETE /notifications/{id}     # Delete notification
DELETE /notifications          # Clear all notifications
```

### 11. Admin Routes
```
GET    /admin/dashboard        # Get dashboard statistics
GET    /admin/users            # Get all users with advanced filtering
PUT    /admin/users/{id}/ban   # Ban/unban user
GET    /admin/orders           # Get all orders with filtering
PUT    /admin/orders/{id}/status   # Update order status
GET    /admin/analytics        # Get analytics data
GET    /admin/logs             # Get system logs
```

### 12. File Upload Routes
```
POST   /upload/image           # Upload image
POST   /upload/document        # Upload document
DELETE /upload/{id}            # Delete uploaded file
GET    /upload/{id}            # Get file info
```

## Query Parameters

### Pagination
```
?page=1&limit=20
```

### Sorting
```
?sort=createdAt&order=desc
```

### Filtering
```
?category=electronics&price[min]=100&price[max]=500
```

### Searching
```
?search=laptop&fields=name,description
```

## HTTP Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `204 No Content` - Request successful, no content returned
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict
- `422 Unprocessable Entity` - Validation errors
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Rate Limiting
- General API: 1000 requests per hour
- Authentication: 10 requests per minute
- File Upload: 100 requests per hour

## Versioning
API version is included in the URL path. Current version: v1

## Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```