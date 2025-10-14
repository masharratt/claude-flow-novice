// Express.js Route Implementation Examples
// This file demonstrates how the API structure would be implemented in practice

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const productController = require('../controllers/productController');
const orderController = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { rateLimit } = require('../middleware/rateLimit');

// Authentication Routes
router.post('/auth/register', 
  rateLimit.auth, 
  validateRequest.register, 
  authController.register
);

router.post('/auth/login', 
  rateLimit.auth, 
  validateRequest.login, 
  authController.login
);

router.post('/auth/logout', 
  authenticate, 
  authController.logout
);

router.post('/auth/refresh', 
  authController.refreshToken
);

router.post('/auth/forgot-password', 
  rateLimit.auth, 
  validateRequest.forgotPassword, 
  authController.forgotPassword
);

router.post('/auth/reset-password', 
  validateRequest.resetPassword, 
  authController.resetPassword
);

router.get('/auth/verify-email', 
  authController.verifyEmail
);

// User Management Routes
router.get('/users', 
  authenticate, 
  authorize('admin'), 
  userController.getAllUsers
);

router.get('/users/:id', 
  authenticate, 
  userController.getUserById
);

router.put('/users/:id', 
  authenticate, 
  validateRequest.updateUser, 
  userController.updateUser
);

router.delete('/users/:id', 
  authenticate, 
  authorize('admin'), 
  userController.deleteUser
);

router.get('/users/me', 
  authenticate, 
  userController.getCurrentUser
);

router.put('/users/me', 
  authenticate, 
  validateRequest.updateProfile, 
  userController.updateProfile
);

router.post('/users/me/avatar', 
  authenticate, 
  userController.uploadAvatar
);

router.delete('/users/me/avatar', 
  authenticate, 
  userController.deleteAvatar
);

// Product Routes
router.get('/products', 
  productController.getProducts
);

router.get('/products/search', 
  productController.searchProducts
);

router.get('/products/categories', 
  productController.getCategories
);

router.get('/products/featured', 
  productController.getFeaturedProducts
);

router.get('/products/:id', 
  productController.getProductById
);

router.post('/products', 
  authenticate, 
  authorize('admin'), 
  validateRequest.createProduct, 
  productController.createProduct
);

router.put('/products/:id', 
  authenticate, 
  authorize('admin'), 
  validateRequest.updateProduct, 
  productController.updateProduct
);

router.delete('/products/:id', 
  authenticate, 
  authorize('admin'), 
  productController.deleteProduct
);

router.get('/products/:id/reviews', 
  productController.getProductReviews
);

router.post('/products/:id/reviews', 
  authenticate, 
  validateRequest.createReview, 
  productController.createReview
);

// Order Routes
router.get('/orders', 
  authenticate, 
  orderController.getUserOrders
);

router.get('/orders/:id', 
  authenticate, 
  orderController.getOrderById
);

router.post('/orders', 
  authenticate, 
  validateRequest.createOrder, 
  orderController.createOrder
);

router.put('/orders/:id', 
  authenticate, 
  authorize(['admin', 'customer']), 
  orderController.updateOrderStatus
);

router.delete('/orders/:id', 
  authenticate, 
  orderController.cancelOrder
);

// Cart Routes
router.get('/cart', 
  authenticate, 
  cartController.getCart
);

router.post('/cart/items', 
  authenticate, 
  validateRequest.addToCart, 
  cartController.addToCart
);

router.put('/cart/items/:id', 
  authenticate, 
  validateRequest.updateCartItem, 
  cartController.updateCartItem
);

router.delete('/cart/items/:id', 
  authenticate, 
  cartController.removeFromCart
);

router.delete('/cart', 
  authenticate, 
  cartController.clearCart
);

router.post('/cart/checkout', 
  authenticate, 
  validateRequest.checkout, 
  cartController.checkout
);

// Category Routes
router.get('/categories', 
  categoryController.getCategories
);

router.get('/categories/:id', 
  categoryController.getCategoryById
);

router.get('/categories/:id/products', 
  categoryController.getCategoryProducts
);

router.post('/categories', 
  authenticate, 
  authorize('admin'), 
  validateRequest.createCategory, 
  categoryController.createCategory
);

router.put('/categories/:id', 
  authenticate, 
  authorize('admin'), 
  validateRequest.updateCategory, 
  categoryController.updateCategory
);

router.delete('/categories/:id', 
  authenticate, 
  authorize('admin'), 
  categoryController.deleteCategory
);

// Admin Routes
router.get('/admin/dashboard', 
  authenticate, 
  authorize('admin'), 
  adminController.getDashboard
);

router.get('/admin/users', 
  authenticate, 
  authorize('admin'), 
  adminController.getUsers
);

router.put('/admin/users/:id/ban', 
  authenticate, 
  authorize('admin'), 
  adminController.banUser
);

router.get('/admin/orders', 
  authenticate, 
  authorize('admin'), 
  adminController.getOrders
);

router.put('/admin/orders/:id/status', 
  authenticate, 
  authorize('admin'), 
  adminController.updateOrderStatus
);

router.get('/admin/analytics', 
  authenticate, 
  authorize('admin'), 
  adminController.getAnalytics
);

router.get('/admin/logs', 
  authenticate, 
  authorize('admin'), 
  adminController.getLogs
);

module.exports = router;