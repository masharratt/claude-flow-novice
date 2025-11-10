import request from 'supertest';
import app from '../src/server.js';

describe('Hello World Backend Service', () => {
  describe('GET /', () => {
    it('should return service information', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Hello World Backend Service');
      expect(response.body.endpoints).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.timestamp).toBeDefined();
      expect(response.body.data.uptime).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/hello', () => {
    it('should return basic hello world greeting', async () => {
      const response = await request(app)
        .get('/api/hello')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.greeting).toBe('Hello World!');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/hello/:name', () => {
    it('should return personalized greeting', async () => {
      const response = await request(app)
        .get('/api/hello/John')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.greeting).toBe('Hello John!');
      expect(response.body.data.name).toBe('John');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should sanitize XSS attempts in name parameter', async () => {
      const maliciousName = '<script>alert("xss")</script>John';
      const response = await request(app)
        .get(`/api/hello/${encodeURIComponent(maliciousName)}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.greeting).not.toContain('<script>');
      expect(response.body.data.name).not.toContain('<script>');
      expect(response.body.data.greeting).toBe('Hello John!');
    });

    it('should handle empty name', async () => {
      const response = await request(app)
        .get('/api/hello/')
        .expect(404);
    });

    it('should reject names longer than 100 characters', async () => {
      const longName = 'a'.repeat(101);
      const response = await request(app)
        .get(`/api/hello/${longName}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid name parameter');
    });
  });

  describe('POST /api/hello', () => {
    it('should return greeting with name from request body', async () => {
      const response = await request(app)
        .post('/api/hello')
        .send({ name: 'Alice' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.greeting).toBe('Hello Alice!');
      expect(response.body.data.name).toBe('Alice');
      expect(response.body.data.language).toBe('en');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should handle greeting without name', async () => {
      const response = await request(app)
        .post('/api/hello')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.greeting).toBe('Hello World!');
      expect(response.body.data.name).toBe('World');
    });

    it('should support different languages', async () => {
      const testCases = [
        { language: 'es', expected: 'Hola' },
        { language: 'fr', expected: 'Bonjour' },
        { language: 'de', expected: 'Hallo' },
        { language: 'it', expected: 'Ciao' },
        { language: 'pt', expected: 'Olá' },
        { language: 'ja', expected: 'こんにちは' },
        { language: 'zh', expected: '你好' },
        { language: 'hi', expected: 'नमस्ते' },
        { language: 'ar', expected: 'مرحبا' },
        { language: 'invalid', expected: 'Hello' }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/hello')
          .send({ name: 'World', language: testCase.language })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.greeting).toBe(`${testCase.expected} World!`);
        expect(response.body.data.language).toBe(testCase.language);
      }
    });

    it('should sanitize XSS attempts in POST request body', async () => {
      const maliciousPayload = {
        name: '<script>alert("xss")</script>Bob',
        language: 'en'
      };

      const response = await request(app)
        .post('/api/hello')
        .send(maliciousPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.greeting).not.toContain('<script>');
      expect(response.body.data.name).not.toContain('<script>');
      expect(response.body.data.greeting).toBe('Hello Bob!');
    });

    it('should reject names longer than 100 characters', async () => {
      const longName = 'a'.repeat(101);
      const response = await request(app)
        .post('/api/hello')
        .send({ name: longName })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid name');
    });

    it('should reject invalid language types', async () => {
      const response = await request(app)
        .post('/api/hello')
        .send({ name: 'World', language: 123 })
        .expect(200); // Should still work, language defaults to English

      expect(response.body.success).toBe(true);
      expect(response.body.data.greeting).toBe('Hello World!');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Endpoint not found');
      expect(response.body.path).toBe('/api/nonexistent');
    });

    it('should return 404 for nested non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/hello/nonexistent/deep')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Endpoint not found');
    });

    it('should handle malformed JSON in POST requests', async () => {
      const response = await request(app)
        .post('/api/hello')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/api/hello')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = Array(10).fill().map(() => 
        request(app).get('/api/hello')
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.greeting).toBe('Hello World!');
      });
    });

    it('should handle requests with small delays', async () => {
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .get('/api/hello/TestUser')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.greeting).toBe('Hello TestUser!');
      }
    });
  });

  describe('Content-Type Handling', () => {
    it('should handle form-urlencoded data', async () => {
      const response = await request(app)
        .post('/api/hello')
        .send('name=FormUser&language=es')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.greeting).toBe('Hola FormUser!');
      expect(response.body.data.language).toBe('es');
    });
  });
});