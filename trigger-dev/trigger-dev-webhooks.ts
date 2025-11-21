/**
 * Trigger.dev v2 Webhook Handler
 * Handles webhook events with HMAC signature verification
 */

import { createHmac } from 'crypto';

export type WebhookEventType = 'run.completed' | 'run.failed' | 'run.cancelled';

export interface WebhookPayload {
  id: string;
  event: WebhookEventType;
  timestamp: string;
  data: {
    runId: string;
    jobId: string;
    status: string;
    output?: unknown;
    error?: string;
    taskId?: string;
    agentType?: string;
  };
}

export interface AgentCompleteEvent {
  runId: string;
  jobId: string;
  taskId: string;
  agentType: string;
  success: boolean;
  output?: unknown;
  error?: string;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export class WebhookPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookPayloadError';
  }
}

/**
 * Verify HMAC signature from X-Trigger-Signature header
 * @param payload - Raw request body as string
 * @param signature - X-Trigger-Signature header value
 * @param secret - Webhook secret (from TRIGGER_WEBHOOK_SECRET env)
 * @returns true if signature is valid
 * @throws WebhookVerificationError if verification fails
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret?: string
): boolean {
  const webhookSecret = secret || process.env.TRIGGER_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new WebhookVerificationError('TRIGGER_WEBHOOK_SECRET not configured');
  }

  if (!signature) {
    throw new WebhookVerificationError('Missing X-Trigger-Signature header');
  }

  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) {
    throw new WebhookVerificationError('Invalid signature');
  }

  let match = true;
  for (let i = 0; i < sigBuffer.length; i++) {
    if (sigBuffer[i] !== expectedBuffer[i]) {
      match = false;
    }
  }

  if (!match) {
    throw new WebhookVerificationError('Invalid signature');
  }

  return true;
}

/**
 * Validate and parse webhook payload
 * @param body - Parsed JSON body
 * @returns Validated WebhookPayload
 * @throws WebhookPayloadError if payload is invalid
 */
export function validatePayload(body: unknown): WebhookPayload {
  if (!body || typeof body !== 'object') {
    throw new WebhookPayloadError('Invalid payload: expected object');
  }

  const payload = body as Record<string, unknown>;

  if (!payload.id || typeof payload.id !== 'string') {
    throw new WebhookPayloadError('Invalid payload: missing id');
  }

  if (!payload.event || typeof payload.event !== 'string') {
    throw new WebhookPayloadError('Invalid payload: missing event');
  }

  const validEvents: WebhookEventType[] = ['run.completed', 'run.failed', 'run.cancelled'];
  if (!validEvents.includes(payload.event as WebhookEventType)) {
    throw new WebhookPayloadError(`Invalid payload: unknown event type ${payload.event}`);
  }

  if (!payload.data || typeof payload.data !== 'object') {
    throw new WebhookPayloadError('Invalid payload: missing data');
  }

  const data = payload.data as Record<string, unknown>;
  if (!data.runId || typeof data.runId !== 'string') {
    throw new WebhookPayloadError('Invalid payload: missing data.runId');
  }

  if (!data.jobId || typeof data.jobId !== 'string') {
    throw new WebhookPayloadError('Invalid payload: missing data.jobId');
  }

  return payload as unknown as WebhookPayload;
}

/**
 * Parse agent-complete event from webhook payload
 * @param payload - Validated webhook payload
 * @returns AgentCompleteEvent if applicable, null otherwise
 */
export function parseAgentCompleteEvent(payload: WebhookPayload): AgentCompleteEvent | null {
  const { event, data } = payload;

  // Only process terminal events
  if (!['run.completed', 'run.failed', 'run.cancelled'].includes(event)) {
    return null;
  }

  return {
    runId: data.runId,
    jobId: data.jobId,
    taskId: data.taskId || '',
    agentType: data.agentType || '',
    success: event === 'run.completed',
    output: data.output,
    error: data.error,
  };
}

/**
 * Handle incoming webhook request
 * @param rawBody - Raw request body string
 * @param signature - X-Trigger-Signature header
 * @returns Parsed AgentCompleteEvent or null
 */
export function handleWebhook(
  rawBody: string,
  signature: string
): AgentCompleteEvent | null {
  verifySignature(rawBody, signature);
  const payload = validatePayload(JSON.parse(rawBody));
  return parseAgentCompleteEvent(payload);
}
