/**
 * Request Validation Schemas using Zod
 *
 * All API endpoint request validation schemas
 */

import { z } from 'zod';

/**
 * Query parameter schemas
 */
export const AgentHierarchyQuerySchema = z.object({
  status: z.enum(['active', 'paused', 'terminated', 'idle', 'error']).optional(),
  type: z.string().optional(),
});

export const EventsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  type: z.string().optional(),
  severity: z.enum(['warning', 'error', 'critical']).optional(),
  agentId: z.string().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
});

export const ResourcesQuerySchema = z.object({
  threshold: z.coerce.number().int().min(0).max(100).optional(),
});

/**
 * Request body schemas
 */
export const InterventionRequestSchema = z.object({
  action: z.enum(['pause', 'resume', 'terminate', 'restart']),
  reason: z.string().min(1).max(500),
});

/**
 * Path parameter schemas
 */
export const AgentIdParamSchema = z.object({
  id: z.string().min(1),
});

/**
 * Type exports for TypeScript
 */
export type AgentHierarchyQuery = z.infer<typeof AgentHierarchyQuerySchema>;
export type EventsQuery = z.infer<typeof EventsQuerySchema>;
export type ResourcesQuery = z.infer<typeof ResourcesQuerySchema>;
export type InterventionRequest = z.infer<typeof InterventionRequestSchema>;
export type AgentIdParam = z.infer<typeof AgentIdParamSchema>;
