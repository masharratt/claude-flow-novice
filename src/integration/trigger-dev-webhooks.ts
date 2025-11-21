/**
 * Trigger.dev Webhook Handlers for CFN Loop Integration
 *
 * Express router providing secure webhook endpoints for:
 * - Agent completion events
 * - Gate check results
 * - Consensus collection results
 * - Product Owner decisions
 *
 * Configuration:
 * - WEBHOOK_SECRET: Shared secret for HMAC signature verification
 * - WEBHOOK_ALGORITHM: Hash algorithm (default: sha256)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  AgentCompletePayload,
  GateResultPayload,
  ConsensusResultPayload,
  PODecisionPayload,
  WebhookContext,
  WebhookHandlerResult,
  WebhookVerificationOptions,
} from '../types/trigger-dev-events.d.js';

/**
 * Webhook validation error class
 */
export class WebhookValidationError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
    public readonly statusCode: number = 401
  ) {
    super(message);
    this.name = 'WebhookValidationError';
  }
}

/**
 * Webhook handler type
 */
export type WebhookHandler<T> = (
  context: WebhookContext<T>
) => Promise<WebhookHandlerResult>;

/**
 * Configuration for webhook handlers
 */
export interface WebhookConfig {
  secret?: string;
  algorithm?: string;
  verifySignature?: boolean;
}

/**
 * TriggerDevWebhooks - Express router for secure webhook handling
 *
 * Provides endpoints:
 * - POST /webhooks/agent-complete
 * - POST /webhooks/gate-result
 * - POST /webhooks/consensus-result
 * - POST /webhooks/po-decision
 */
export class TriggerDevWebhooks {
  private readonly router: Router;
  private readonly config: Required<WebhookConfig>;
  private readonly verificationOptions: WebhookVerificationOptions;

  // Handler maps for dependency injection
  private agentCompleteHandler?: WebhookHandler<AgentCompletePayload>;
  private gateResultHandler?: WebhookHandler<GateResultPayload>;
  private consensusResultHandler?: WebhookHandler<ConsensusResultPayload>;
  private poDecisionHandler?: WebhookHandler<PODecisionPayload>;

  constructor(config?: WebhookConfig) {
    this.router = Router();
    this.config = {
      secret: config?.secret || process.env.WEBHOOK_SECRET || 'default-secret',
      algorithm: config?.algorithm || process.env.WEBHOOK_ALGORITHM || 'sha256',
      verifySignature: config?.verifySignature !== false,
    };

    this.verificationOptions = {
      algorithmType: (this.config.algorithm as 'sha256' | 'sha512') || 'sha256',
      headerName: 'x-trigger-signature',
    };

    this.setupRoutes();
  }

  /**
   * Register handler for agent completion events
   */
  onAgentComplete(handler: WebhookHandler<AgentCompletePayload>): this {
    this.agentCompleteHandler = handler;
    return this;
  }

  /**
   * Register handler for gate result events
   */
  onGateResult(handler: WebhookHandler<GateResultPayload>): this {
    this.gateResultHandler = handler;
    return this;
  }

  /**
   * Register handler for consensus result events
   */
  onConsensusResult(handler: WebhookHandler<ConsensusResultPayload>): this {
    this.consensusResultHandler = handler;
    return this;
  }

  /**
   * Register handler for Product Owner decision events
   */
  onPODecision(handler: WebhookHandler<PODecisionPayload>): this {
    this.poDecisionHandler = handler;
    return this;
  }

  /**
   * Get Express router for mounting
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Setup all webhook routes
   *
   * @private
   */
  private setupRoutes(): void {
    // Middleware for signature verification
    this.router.use(this.signatureVerificationMiddleware.bind(this));

    // Agent completion endpoint
    this.router.post('/agent-complete', this.handleAgentComplete.bind(this));

    // Gate result endpoint
    this.router.post('/gate-result', this.handleGateResult.bind(this));

    // Consensus result endpoint
    this.router.post('/consensus-result', this.handleConsensusResult.bind(this));

    // PO decision endpoint
    this.router.post('/po-decision', this.handlePODecision.bind(this));

    // Error handling middleware
    this.router.use(this.errorHandler.bind(this));
  }

  /**
   * Signature verification middleware
   *
   * TODO: RUNTIME_TEST: Verify HMAC signature validation with valid/invalid keys
   *
   * @private
   */
  private async signatureVerificationMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!this.config.verifySignature) {
        return next();
      }

      const signature = req.headers[this.verificationOptions.headerName];

      if (!signature) {
        throw new WebhookValidationError(
          'Missing webhook signature',
          'MISSING_SIGNATURE'
        );
      }

      const body = JSON.stringify(req.body);
      const isValid = await this.verifySignature(body, signature as string);

      if (!isValid) {
        throw new WebhookValidationError(
          'Invalid webhook signature',
          'INVALID_SIGNATURE'
        );
      }

      next();
    } catch (error) {
      if (error instanceof WebhookValidationError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
          reason: error.reason,
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Signature verification failed',
        reason: 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * Handle agent completion webhook
   *
   * @private
   */
  private async handleAgentComplete(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const payload = req.body as AgentCompletePayload;

      // Validate required fields
      if (!payload.agentId || !payload.taskId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          data: null,
        });
      }

      const context: WebhookContext<AgentCompletePayload> = {
        payload,
        isVerified: this.config.verifySignature,
        timestamp: Date.now(),
        signature: req.headers[this.verificationOptions.headerName] as string,
      };

      if (this.agentCompleteHandler) {
        const result = await this.agentCompleteHandler(context);
        return res.status(200).json(result);
      }

      res.status(200).json({
        success: true,
        message: 'Agent completion event received',
        data: { agentId: payload.agentId },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to handle agent completion',
        data: null,
      });
    }
  }

  /**
   * Handle gate result webhook
   *
   * @private
   */
  private async handleGateResult(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body as GateResultPayload;

      if (!payload.taskId || payload.gateType === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          data: null,
        });
      }

      const context: WebhookContext<GateResultPayload> = {
        payload,
        isVerified: this.config.verifySignature,
        timestamp: Date.now(),
        signature: req.headers[this.verificationOptions.headerName] as string,
      };

      if (this.gateResultHandler) {
        const result = await this.gateResultHandler(context);
        return res.status(200).json(result);
      }

      res.status(200).json({
        success: true,
        message: 'Gate result received',
        data: { taskId: payload.taskId, passed: payload.passed },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to handle gate result',
        data: null,
      });
    }
  }

  /**
   * Handle consensus result webhook
   *
   * @private
   */
  private async handleConsensusResult(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const payload = req.body as ConsensusResultPayload;

      if (!payload.taskId || payload.validatorCount === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          data: null,
        });
      }

      const context: WebhookContext<ConsensusResultPayload> = {
        payload,
        isVerified: this.config.verifySignature,
        timestamp: Date.now(),
        signature: req.headers[this.verificationOptions.headerName] as string,
      };

      if (this.consensusResultHandler) {
        const result = await this.consensusResultHandler(context);
        return res.status(200).json(result);
      }

      res.status(200).json({
        success: true,
        message: 'Consensus result received',
        data: {
          taskId: payload.taskId,
          consensusScore: payload.consensusScore,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to handle consensus result',
        data: null,
      });
    }
  }

  /**
   * Handle Product Owner decision webhook
   *
   * @private
   */
  private async handlePODecision(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body as PODecisionPayload;

      if (!payload.taskId || !payload.decision) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          data: null,
        });
      }

      // Validate decision enum
      if (!['PROCEED', 'ITERATE', 'ABORT'].includes(payload.decision)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid decision value',
          data: null,
        });
      }

      const context: WebhookContext<PODecisionPayload> = {
        payload,
        isVerified: this.config.verifySignature,
        timestamp: Date.now(),
        signature: req.headers[this.verificationOptions.headerName] as string,
      };

      if (this.poDecisionHandler) {
        const result = await this.poDecisionHandler(context);
        return res.status(200).json(result);
      }

      res.status(200).json({
        success: true,
        message: 'PO decision received',
        data: { taskId: payload.taskId, decision: payload.decision },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to handle PO decision',
        data: null,
      });
    }
  }

  /**
   * Verify HMAC signature of webhook payload
   *
   * @private
   * @param payload Raw request body as string
   * @param signature Signature header value
   * @returns Promise resolving to true if signature is valid
   */
  private async verifySignature(
    payload: string,
    signature: string
  ): Promise<boolean> {
    try {
      const hmac = createHmac(
        this.verificationOptions.algorithmType,
        this.config.secret
      );
      hmac.update(payload, 'utf8');
      const expectedSignature = hmac.digest('hex');

      // Use timing-safe comparison
      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Error handling middleware
   *
   * @private
   */
  private errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    console.error('Webhook error:', error);

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null,
    });
  }
}

/**
 * Create webhook router with optional handlers
 */
export const createWebhookRouter = (
  config?: WebhookConfig,
  handlers?: {
    onAgentComplete?: WebhookHandler<AgentCompletePayload>;
    onGateResult?: WebhookHandler<GateResultPayload>;
    onConsensusResult?: WebhookHandler<ConsensusResultPayload>;
    onPODecision?: WebhookHandler<PODecisionPayload>;
  }
): Router => {
  const webhooks = new TriggerDevWebhooks(config);

  if (handlers?.onAgentComplete) {
    webhooks.onAgentComplete(handlers.onAgentComplete);
  }
  if (handlers?.onGateResult) {
    webhooks.onGateResult(handlers.onGateResult);
  }
  if (handlers?.onConsensusResult) {
    webhooks.onConsensusResult(handlers.onConsensusResult);
  }
  if (handlers?.onPODecision) {
    webhooks.onPODecision(handlers.onPODecision);
  }

  return webhooks.getRouter();
};

export default TriggerDevWebhooks;
