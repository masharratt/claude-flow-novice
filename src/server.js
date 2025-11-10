import express from 'express';
import { hello, healthCheck, createApiResponse } from './hello.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for JSON parsing and security
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API Routes

/**
 * GET /api/hello
 * Basic hello world endpoint
 */
app.get('/api/hello', (req, res) => {
  try {
    const message = hello();
    const response = createApiResponse({ greeting: message });
    res.json(response);
  } catch (error) {
    console.error('Error in /api/hello:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/hello/:name
 * Personalized hello endpoint
 */
app.get('/api/hello/:name', (req, res) => {
  try {
    const { name } = req.params;
    
    // Input validation
    if (!name || typeof name !== 'string' || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid name parameter',
        timestamp: new Date().toISOString()
      });
    }

    // Sanitize input (remove potential XSS)
    const sanitizedName = name.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    const message = hello(sanitizedName);
    const response = createApiResponse({ 
      greeting: message,
      name: sanitizedName 
    });
    res.json(response);
  } catch (error) {
    console.error('Error in /api/hello/:name:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  try {
    const health = healthCheck();
    const response = createApiResponse(health, 'Service is healthy');
    res.json(response);
  } catch (error) {
    console.error('Error in /api/health:', error);
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/hello
 * Hello endpoint with POST body
 */
app.post('/api/hello', (req, res) => {
  try {
    const { name, language } = req.body;
    
    // Input validation
    if (name && (typeof name !== 'string' || name.length > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid name in request body',
        timestamp: new Date().toISOString()
      });
    }

    // Support for different languages
    let greeting = 'Hello';
    if (language && typeof language === 'string') {
      const greetings = {
        'es': 'Hola',
        'fr': 'Bonjour',
        'de': 'Hallo',
        'it': 'Ciao',
        'pt': 'Olá',
        'ja': 'こんにちは',
        'zh': '你好',
        'hi': 'नमस्ते',
        'ar': 'مرحبا'
      };
      greeting = greetings[language.toLowerCase()] || greeting;
    }

    const sanitizedName = name ? name.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') : 'World';
    const message = `${greeting} ${sanitizedName}!`;
    
    const response = createApiResponse({ 
      greeting: message,
      name: sanitizedName,
      language: language || 'en'
    });
    res.json(response);
  } catch (error) {
    console.error('Error in POST /api/hello:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET / - Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Hello World Backend Service',
    version: '1.0.0',
    endpoints: [
      'GET /api/hello - Basic hello world',
      'GET /api/hello/:name - Personalized greeting',
      'POST /api/hello - Greeting with language support',
      'GET /api/health - Health check'
    ],
    timestamp: new Date().toISOString()
  });
});

/**
 * 404 handler
 */
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

/**
 * Global error handler
 */
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Hello World Backend Service running on port ${PORT}`);
  console.log(`📖 API Documentation: http://localhost:${PORT}/`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

export default app;