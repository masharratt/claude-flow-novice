import { describe, test, it, expect, beforeEach, beforeAll } from '@jest/globals';
const request = require('supertest');
const app = require('../../server');
const User = require('../../src/models/User');
const Product = require('../../src/models/product.model');
const authService = require('../../src/services/auth.service');

describe('Product Endpoints', () => {
  let server;
  let adminToken;
  let userToken;
  let adminUser;
  let normalUser;

  beforeAll(() => {
    server = app;
  });

  beforeEach(async () => { try {
    // Clear data
    await User.deleteMany({});
    await Product.deleteMany({});

    // Create admin user
    adminUser = await User.create({
      email: 'admin@example.com',
      password: 'AdminPass123!',
      name: 'Admin User',
      role: 'admin',
      isEmailVerified: true,
    });
    adminToken = authService.generateAccessToken(adminUser);

    // Create normal user
    normalUser = await User.create({
      email: 'user@example.com',
      password: 'UserPass123!',
      name: 'Normal User',
      role: 'user',
      isEmailVerified: true,
    });
    userToken = authService.generateAccessToken(normalUser);

    // Create some test products
    await Product.create([
      {
        name: 'Laptop',
        description: 'High-performance laptop',
        price: 999.99,
        category: 'Electronics',
        sku: 'LAP001',
        stock: 10,
        tags: ['new', 'featured'],
        isActive: true,
      },
      {
        name: 'Mouse',
        description: 'Wireless mouse',
        price: 29.99,
        category: 'Electronics',
        sku: 'MOU001',
        stock: 50,
        isActive: true,
      },
      {
        name: 'Keyboard',
        description: 'Mechanical keyboard',
        price: 79.99,
        category: 'Electronics',
        sku: 'KEY001',
        stock: 0,
        isActive: true,
      },
    ]);
  });

  describe('GET /api/products', () => {
    it('should get all products with pagination', async () => { try {
      const response = await request(server)
        .get('/api/products')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.meta).toMatchObject({
        total: 3,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should filter products by category', async () => { try {
      // Add a product in different category
      await Product.create({
        name: 'Book',
        price: 19.99,
        category: 'Books',
        sku: 'BOK001',
        stock: 100,
      });

      const response = await request(server)
        .get('/api/products')
        .query({ category: 'Electronics' })
        .expect(200);

      expect(response.body.data).toHaveLength(3);
      expect(response.body.data.every(p => p.category === 'Electronics')).toBe(true);
    });

    it('should filter products by price range', async () => { try {
      const response = await request(server)
        .get('/api/products')
        .query({ minPrice: 50, maxPrice: 100 })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Keyboard');
    });

    it('should search products by name', async () => { try {
      const response = await request(server)
        .get('/api/products')
        .query({ search: 'lap' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Laptop');
    });

    it('should sort products', async () => { try {
      const response = await request(server)
        .get('/api/products')
        .query({ sort: '-price' })
        .expect(200);

      expect(response.body.data[0].name).toBe('Laptop');
      expect(response.body.data[response.body.data.length - 1].name).toBe('Mouse');
    });

    it('should only return active products to non-admin users', async () => { try {
      // Create inactive product
      await Product.create({
        name: 'Inactive Product',
        price: 49.99,
        category: 'Electronics',
        sku: 'INA001',
        stock: 5,
        isActive: false,
      });

      const response = await request(server)
        .get('/api/products')
        .expect(200);

      expect(response.body.data).toHaveLength(3);
      expect(response.body.data.every(p => p.isActive === true)).toBe(true);
    });
  });

  describe('GET /api/products/:id', () => {
    let testProduct;

    beforeEach(async () => { try {
      testProduct = await Product.findOne({ name: 'Laptop' });
    });

    it('should get product by ID', async () => { try {
      const response = await request(server)
        .get(`/api/products/${testProduct._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: 'Laptop',
        price: 999.99,
        category: 'Electronics',
      });
    });

    it('should return 404 for non-existent product', async () => { try {
      const fakeId = '507f1f77bcf86cd799439999';
      const response = await request(server)
        .get(`/api/products/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    it('should return 400 for invalid ID format', async () => { try {
      const response = await request(server)
        .get('/api/products/invalid-id')
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/products', () => {
    const newProductData = {
      name: 'New Product',
      description: 'A brand new product',
      price: 149.99,
      category: 'Electronics',
      sku: 'NEW001',
      stock: 20,
      tags: ['new'],
      specifications: {
        weight: '500g',
        dimensions: '10x10x5cm',
      },
    };

    it('should create product as admin', async () => { try {
      const response = await request(server)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newProductData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: newProductData.name,
        price: newProductData.price,
        category: newProductData.category,
      });

      // Verify product was created
      const product = await Product.findById(response.body.data._id);
      expect(product).toBeTruthy();
    });

    it('should not create product as normal user', async () => { try {
      const response = await request(server)
        .post('/api/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send(newProductData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');
    });

    it('should not create product without authentication', async () => { try {
      await request(server)
        .post('/api/products')
        .send(newProductData)
        .expect(401);
    });

    it('should validate required fields', async () => { try {
      const response = await request(server)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'Missing required fields',
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({ field: 'name' })
      );
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({ field: 'price' })
      );
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({ field: 'category' })
      );
    });

    it('should not create product with duplicate SKU', async () => { try {
      const response = await request(server)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...newProductData,
          sku: 'LAP001', // Already exists
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('SKU already exists');
    });
  });

  describe('PUT /api/products/:id', () => {
    let testProduct;

    beforeEach(async () => { try {
      testProduct = await Product.findOne({ name: 'Laptop' });
    });

    it('should update product as admin', async () => { try {
      const updateData = {
        name: 'Updated Laptop',
        price: 899.99,
        stock: 15,
      };

      const response = await request(server)
        .put(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject(updateData);

      // Verify product was updated
      const updated = await Product.findById(testProduct._id);
      expect(updated.name).toBe(updateData.name);
      expect(updated.price).toBe(updateData.price);
    });

    it('should not update product as normal user', async () => { try {
      await request(server)
        .put(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ price: 899.99 })
        .expect(403);
    });

    it('should validate update data', async () => { try {
      const response = await request(server)
        .put(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: -10 }) // Invalid price
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('DELETE /api/products/:id', () => {
    let testProduct;

    beforeEach(async () => { try {
      testProduct = await Product.findOne({ name: 'Mouse' });
    });

    it('should delete product as admin', async () => { try {
      const response = await request(server)
        .delete(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify product was deleted
      const deleted = await Product.findById(testProduct._id);
      expect(deleted).toBeNull();
    });

    it('should not delete product as normal user', async () => { try {
      await request(server)
        .delete(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('Product Reviews', () => {
    let testProduct;

    beforeEach(async () => { try {
      testProduct = await Product.findOne({ name: 'Laptop' });
    });

    describe('POST /api/products/:id/reviews', () => {
      it('should add review as authenticated user', async () => { try {
        const reviewData = {
          rating: 5,
          title: 'Excellent product!',
          comment: 'Very satisfied with this laptop.',
        };

        const response = await request(server)
          .post(`/api/products/${testProduct._id}/reviews`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(reviewData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.reviews).toHaveLength(1);
        expect(response.body.data.reviews[0]).toMatchObject({
          rating: reviewData.rating,
          title: reviewData.title,
          comment: reviewData.comment,
          user: normalUser._id.toString(),
        });
      });

      it('should not add review without authentication', async () => { try {
        await request(server)
          .post(`/api/products/${testProduct._id}/reviews`)
          .send({ rating: 5, comment: 'Great!' })
          .expect(401);
      });

      it('should validate review data', async () => { try {
        const response = await request(server)
          .post(`/api/products/${testProduct._id}/reviews`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ rating: 6 }) // Invalid rating
          .expect(400);

        expect(response.body.errors).toBeDefined();
      });

      it('should not allow duplicate reviews from same user', async () => { try {
        // Add first review
        await request(server)
          .post(`/api/products/${testProduct._id}/reviews`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ rating: 5, comment: 'Great!' })
          .expect(201);

        // Try to add second review
        const response = await request(server)
          .post(`/api/products/${testProduct._id}/reviews`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ rating: 4, comment: 'Good!' })
          .expect(400);

        expect(response.body.message).toContain('already reviewed');
      });
    });

    describe('PUT /api/products/:id/reviews', () => {
      beforeEach(async () => { try {
        // Add a review
        testProduct.reviews.push({
          user: normalUser._id,
          rating: 4,
          title: 'Good product',
          comment: 'Initial review',
        });
        await testProduct.save();
      });

      it('should update own review', async () => { try {
        const updateData = {
          rating: 5,
          title: 'Updated: Excellent product',
          comment: 'Changed my mind, it\'s excellent!',
        };

        const response = await request(server)
          .put(`/api/products/${testProduct._id}/reviews`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateData)
          .expect(200);

        expect(response.body.success).toBe(true);
        const userReview = response.body.data.reviews.find(
          r => r.user === normalUser._id.toString()
        );
        expect(userReview).toMatchObject(updateData);
      });

      it('should not update non-existent review', async () => { try {
        const response = await request(server)
          .put(`/api/products/${testProduct._id}/reviews`)
          .set('Authorization', `Bearer ${adminToken}`) // Admin hasn't reviewed
          .send({ rating: 5, comment: 'Updated' })
          .expect(404);

        expect(response.body.message).toContain('Review not found');
      });
    });

    describe('DELETE /api/products/:id/reviews', () => {
      beforeEach(async () => { try {
        // Add a review
        testProduct.reviews.push({
          user: normalUser._id,
          rating: 4,
          comment: 'Good product',
        });
        await testProduct.save();
      });

      it('should delete own review', async () => { try {
        const response = await request(server)
          .delete(`/api/products/${testProduct._id}/reviews`)
          .set('Authorization', `Bearer ${userToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.reviews).toHaveLength(0);
      });
    });
  });

  describe('Inventory Management', () => {
    let testProduct;

    beforeEach(async () => { try {
      testProduct = await Product.findOne({ name: 'Mouse' });
    });

    describe('PUT /api/products/:id/inventory', () => {
      it('should update inventory as admin', async () => { try {
        const response = await request(server)
          .put(`/api/products/${testProduct._id}/inventory`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ stock: 100, operation: 'set' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.stock).toBe(100);
      });

      it('should increment inventory', async () => { try {
        const initialStock = testProduct.stock;

        const response = await request(server)
          .put(`/api/products/${testProduct._id}/inventory`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ stock: 10, operation: 'increment' })
          .expect(200);

        expect(response.body.data.stock).toBe(initialStock + 10);
      });

      it('should decrement inventory', async () => { try {
        const initialStock = testProduct.stock;

        const response = await request(server)
          .put(`/api/products/${testProduct._id}/inventory`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ stock: 5, operation: 'decrement' })
          .expect(200);

        expect(response.body.data.stock).toBe(initialStock - 5);
      });

      it('should not allow negative inventory', async () => { try {
        const response = await request(server)
          .put(`/api/products/${testProduct._id}/inventory`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ stock: 100, operation: 'decrement' })
          .expect(400);

        expect(response.body.message).toContain('Insufficient stock');
      });
    });

    describe('GET /api/products/inventory/report', () => {
      it('should get inventory report as admin', async () => { try {
        const response = await request(server)
          .get('/api/products/inventory/report')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toMatchObject({
          totalProducts: expect.any(Number),
          totalValue: expect.any(Number),
          outOfStock: expect.any(Array),
          lowStock: expect.any(Array),
        });
      });

      it('should not get inventory report as normal user', async () => { try {
        await request(server)
          .get('/api/products/inventory/report')
          .set('Authorization', `Bearer ${userToken}`)
          .expect(403);
      });
    });
  });

  describe('Special Product Endpoints', () => {
    describe('GET /api/products/featured', () => {
      it('should get featured products', async () => { try {
        const response = await request(server)
          .get('/api/products/featured')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.every(p => p.tags.includes('featured'))).toBe(true);
      });
    });

    describe('GET /api/products/popular', () => {
      it('should get popular products', async () => { try {
        const response = await request(server)
          .get('/api/products/popular')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
      });
    });

    describe('GET /api/products/categories/list', () => {
      it('should get all categories', async () => { try {
        // Add products in different categories
        await Product.create([
          { name: 'Book', price: 19.99, category: 'Books', sku: 'BOK001' },
          { name: 'Shirt', price: 29.99, category: 'Clothing', sku: 'SHI001' },
        ]);

        const response = await request(server)
          .get('/api/products/categories/list')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toContain('Electronics');
        expect(response.body.data).toContain('Books');
        expect(response.body.data).toContain('Clothing');
      });
    });
  });
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});