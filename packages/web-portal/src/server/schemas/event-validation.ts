/**
 * Event Validation Schemas
 * 
 * Joi validation schemas for event store operations
 * Used by middleware for request validation
 */

import Joi from 'joi';

/**
 * Event payload validation schema
 */
export const eventPayloadSchema = Joi.object({
  taskId: Joi.string().optional(),
  confidence: Joi.number().min(0).max(1).optional(),
  duration: Joi.number().min(0).optional(),
  output: Joi.string().optional(),
  filePath: Joi.string().optional(),
  changes: Joi.number().optional(),
  linesAdded: Joi.number().optional(),
  linesRemoved: Joi.number().optional(),
  testFile: Joi.string().optional(),
  result: Joi.string().optional(),
  metrics: Joi.object().optional(),
  decision: Joi.string().optional(),
  rationale: Joi.string().optional(),
  loopNumber: Joi.number().integer().min(1).optional(),
  loopType: Joi.string().valid('implementation', 'validation', 'coordination').optional(),
  files: Joi.array().items(Joi.string()).optional(),
  totalFiles: Joi.number().integer().min(0).optional(),
  decisionsMade: Joi.number().integer().min(0).optional(),
  success: Joi.boolean().optional(),
  error: Joi.string().optional(),
  // Allow any additional properties
}).unknown(true);

/**
 * Event metadata validation schema
 */
export const eventMetadataSchema = Joi.object({
  source: Joi.string().optional(),
  version: Joi.string().optional(),
  environment: Joi.string().optional(),
  sessionId: Joi.string().optional(),
  requestId: Joi.string().optional(),
  userId: Joi.string().optional(),
  // Allow any additional properties
}).unknown(true);

/**
 * Single event validation schema
 */
export const singleEventSchema = Joi.object({
  timestamp: Joi.date().iso().optional().default(() => new Date()),
  phaseId: Joi.string().required().min(1).max(255),
  agentId: Joi.string().required().min(1).max(255),
  eventType: Joi.string().required().min(1).max(255),
  payload: eventPayloadSchema.required(),
  metadata: eventMetadataSchema.optional(),
});

/**
 * Batch events validation schema
 */
export const batchEventsSchema = Joi.object({
  events: Joi.array()
    .items(singleEventSchema)
    .min(1)
    .max(1000) // Limit batch size
    .required(),
});

/**
 * Event query filters validation schema
 */
export const eventQueryFiltersSchema = Joi.object({
  phaseId: Joi.string().optional(),
  agentId: Joi.string().optional(),
  eventType: Joi.string().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(1000).optional().default(100),
  offset: Joi.number().integer().min(0).optional().default(0),
}).custom((value, helpers) => {
  // Validate date range
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    return helpers.error('custom.dateRange');
  }
  
  return value;
}, 'Date range validation').messages({
  'custom.dateRange': 'startDate must be before endDate',
});

/**
 * Event ID validation schema
 */
export const eventIdSchema = Joi.object({
  eventId: Joi.string().required().min(1).max(255),
});

/**
 * Phase ID validation schema
 */
export const phaseIdSchema = Joi.object({
  phaseId: Joi.string().required().min(1).max(255),
  limit: Joi.number().integer().min(1).max(1000).optional().default(100),
});

/**
 * Agent ID validation schema
 */
export const agentIdSchema = Joi.object({
  agentId: Joi.string().required().min(1).max(255),
  limit: Joi.number().integer().min(1).max(1000).optional().default(100),
});

/**
 * CFN Loop specific event schema
 */
export const cfnLoopEventSchema = Joi.object({
  phaseId: Joi.string().required().min(1).max(255),
  agentId: Joi.string().required().min(1).max(255),
  loopNumber: Joi.number().integer().min(1).required(),
  loopType: Joi.string().valid('implementation', 'validation', 'coordination').required(),
  eventType: Joi.string().required().min(1).max(255),
  payload: eventPayloadSchema.required(),
  confidence: Joi.number().min(0).max(1).optional(),
  duration: Joi.number().min(0).optional(),
});

/**
 * Export all schemas
 */
export const eventValidationSchemas = {
  singleEvent: singleEventSchema,
  batchEvents: batchEventsSchema,
  queryFilters: eventQueryFiltersSchema,
  eventId: eventIdSchema,
  phaseId: phaseIdSchema,
  agentId: agentIdSchema,
  cfnLoopEvent: cfnLoopEventSchema,
  payload: eventPayloadSchema,
  metadata: eventMetadataSchema,
};