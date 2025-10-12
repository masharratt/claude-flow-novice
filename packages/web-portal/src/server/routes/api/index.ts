/**
 * API Routes Index
 *
 * Central router for all API endpoints
 */

import { Router } from 'express';
import compression from 'compression';
import cors from 'cors';
import { standardRateLimiter } from '../../middleware/rate-limiter.js';
import { errorHandler, notFoundHandler } from '../../middleware/error-handler.js';
import {
  securityHeaders,
  permissionsPolicyHeader,
  securityAuditLogger,
  corsOptions,
  payloadSizeValidator,
} from '../../middleware/security.js';

// Import route modules
import authRouter from './auth.js';
import agentsRouter from './agents.js';
import metricsRouter from './metrics.js';
import eventsRouter from './events.js';
import resourcesRouter from './resources.js';
import healthRouter from './health.js';

const router = Router();

// MED-001 Fix: Apply security headers (Helmet configuration)
router.use(securityHeaders);
router.use(permissionsPolicyHeader);
router.use(securityAuditLogger);

// Apply middleware
router.use(cors(corsOptions));

router.use(compression()); // Response compression for >1KB payloads
router.use(standardRateLimiter); // Rate limiting
router.use(payloadSizeValidator(1024 * 1024)); // 1MB max payload

// Mount route modules
router.use('/auth', authRouter); // MED-002: Authentication endpoints (logout, refresh)
router.use('/agents', agentsRouter);
router.use('/metrics', metricsRouter);
router.use('/events', eventsRouter);
router.use('/resources', resourcesRouter);
router.use('/health', healthRouter);

// Error handlers (must be last)
router.use(notFoundHandler);
router.use(errorHandler);

export default router;
