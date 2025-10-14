/**
 * Event Validation Middleware
 * 
 * Custom validation middleware for event store operations
 * Uses Joi schemas for request validation
 */

import { Request, Response, NextFunction } from 'express';
import { Schema } from 'joi';
import { eventValidationSchemas } from '../schemas/event-validation.js';

/**
 * Generic validation middleware factory
 */
function validate(schema: Schema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[source];
    
    const { error, value } = schema.validate(data, {
      abortEarly: false, // Return all validation errors
      stripUnknown: true, // Remove unknown properties
      convert: true, // Convert types automatically
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors,
      });
    }

    // Replace the original data with validated and cleaned data
    req[source] = value;
    next();
  };
}

/**
 * Validation middleware for single event
 */
export const validateSingleEvent = validate(eventValidationSchemas.singleEvent, 'body');

/**
 * Validation middleware for batch events
 */
export const validateBatchEvents = validate(eventValidationSchemas.batchEvents, 'body');

/**
 * Validation middleware for event query filters
 */
export const validateEventQueryFilters = validate(eventValidationSchemas.queryFilters, 'query');

/**
 * Validation middleware for event ID in params
 */
export const validateEventId = validate(eventValidationSchemas.eventId, 'params');

/**
 * Validation middleware for phase ID in params
 */
export const validatePhaseId = validate(eventValidationSchemas.phaseId, 'params');

/**
 * Validation middleware for agent ID in params
 */
export const validateAgentId = validate(eventValidationSchemas.agentId, 'params');

/**
 * Validation middleware for CFN loop events
 */
export const validateCFNLoopEvent = validate(eventValidationSchemas.cfnLoopEvent, 'body');

/**
 * Custom validation for event payload size
 */
export const validateEventPayloadSize = (maxSize: number = 1024 * 1024) => { // 1MB default
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.body.payload) {
      const payloadSize = JSON.stringify(req.body.payload).length;
      
      if (payloadSize > maxSize) {
        return res.status(413).json({
          error: 'Payload too large',
          message: `Event payload size (${payloadSize} bytes) exceeds maximum allowed size (${maxSize} bytes)`,
        });
      }
    }
    
    next();
  };
};

/**
 * Custom validation for batch event count
 */
export const validateBatchEventCount = (maxCount: number = 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.body.events && Array.isArray(req.body.events)) {
      if (req.body.events.length > maxCount) {
        return res.status(400).json({
          error: 'Too many events',
          message: `Batch event count (${req.body.events.length}) exceeds maximum allowed count (${maxCount})`,
        });
      }
    }
    
    next();
  };
};

/**
 * Custom validation for date range
 */
export const validateDateRange = (req: Request, res: Response, next: NextFunction) => {
  const { startDate, endDate } = req.query;
  
  if (startDate && endDate) {
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'startDate and endDate must be valid ISO date strings',
      });
    }
    
    if (start > end) {
      return res.status(400).json({
        error: 'Invalid date range',
        message: 'startDate must be before endDate',
      });
    }
    
    // Limit date range to prevent excessive queries
    const maxDays = 30;
    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > maxDays) {
      return res.status(400).json({
        error: 'Date range too large',
        message: `Date range (${Math.round(daysDiff)} days) exceeds maximum allowed range (${maxDays} days)`,
      });
    }
  }
  
  next();
};

/**
 * Custom validation for pagination parameters
 */
export const validatePagination = (req: Request, res: Response, next: NextFunction) => {
  const { limit, offset } = req.query;
  
  if (limit) {
    const limitNum = parseInt(limit as string, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
      return res.status(400).json({
        error: 'Invalid limit parameter',
        message: 'limit must be a number between 1 and 1000',
      });
    }
  }
  
  if (offset) {
    const offsetNum = parseInt(offset as string, 10);
    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        error: 'Invalid offset parameter',
        message: 'offset must be a non-negative number',
      });
    }
  }
  
  next();
};

/**
 * Combined validation middleware for event queries
 */
export const validateEventQuery = [
  validateEventQueryFilters,
  validateDateRange,
  validatePagination,
];

/**
 * Combined validation middleware for event creation
 */
export const validateEventCreation = [
  validateSingleEvent,
  validateEventPayloadSize(),
];

/**
 * Combined validation middleware for batch event creation
 */
export const validateBatchEventCreation = [
  validateBatchEvents,
  validateBatchEventCount(),
  validateEventPayloadSize(512 * 1024), // 512KB per event for batch
];