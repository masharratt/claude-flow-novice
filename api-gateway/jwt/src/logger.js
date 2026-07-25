const winston = require('winston');
const config = require('./config');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'jwt-auth-service',
    environment: config.env
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: config.logging.format === 'json' 
        ? logFormat 
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
    })
  ]
});

// Add file transports in production
if (config.env === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  }));

  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10
  }));
}

// Add request logging function
logger.logRequest = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?.userId || 'anonymous'
    };

    if (res.statusCode >= 400) {
      logger.warn('HTTP Request', logData);
    } else {
      logger.info('HTTP Request', logData);
    }
  });

  if (next) next();
};

// Add security event logging
logger.logSecurityEvent = (event, details = {}) => {
  logger.warn('Security Event', {
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Add token event logging
logger.logTokenEvent = (event, userId, tokenId, details = {}) => {
  logger.info('Token Event', {
    event,
    userId,
    tokenId,
    timestamp: new Date().toISOString(),
    ...details
  });
};

module.exports = logger;