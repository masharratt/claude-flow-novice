const dotenv = require('dotenv');
const Joi = require('joi');

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),
  
  // JWT Configuration
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  JWT_ISSUER: Joi.string().default('api-gateway.example.com'),
  JWT_AUDIENCE: Joi.string().default('api-users'),
  
  // Redis Configuration
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),
  REDIS_DB: Joi.number().default(0),
  REDIS_KEY_PREFIX: Joi.string().default('jwt:'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // Token Configuration
  MAX_REFRESH_TOKENS_PER_USER: Joi.number().default(5),
  TOKEN_BLACKLIST_TTL: Joi.number().default(7 * 24 * 60 * 60), // 7 days
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json')
}).unknown(true);

// Validate environment variables
const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
}

const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
    refreshExpiresIn: envVars.JWT_REFRESH_EXPIRES_IN,
    issuer: envVars.JWT_ISSUER,
    audience: envVars.JWT_AUDIENCE,
    algorithm: 'HS256'
  },
  
  redis: {
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
    password: envVars.REDIS_PASSWORD,
    db: envVars.REDIS_DB,
    keyPrefix: envVars.REDIS_KEY_PREFIX,
    connectTimeout: 10000,
    lazyConnect: true,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    keepAlive: 30000
  },
  
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS
  },
  
  token: {
    maxRefreshTokensPerUser: envVars.MAX_REFRESH_TOKENS_PER_USER,
    blacklistTTL: envVars.TOKEN_BLACKLIST_TTL
  },
  
  logging: {
    level: envVars.LOG_LEVEL,
    format: envVars.LOG_FORMAT
  }
};

module.exports = config;