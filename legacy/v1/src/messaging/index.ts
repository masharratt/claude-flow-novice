/**
 * Enhanced Redis Messaging Infrastructure - Entry Point
 * 
 * This module provides a comprehensive messaging and progress tracking infrastructure
 * for agent coordination with granular progress updates and real-time visibility.
 */

export { EnhancedProgressTracker } from './enhanced-progress-tracker.js';
export { RedisMessagingInfrastructure } from './redis-messaging-infrastructure.js';

export type {
  ProgressStep,
  TaskProgress,
  ProgressUpdateMessage,
  AgentVisibility,
  SwarmProgressOverview
} from './enhanced-progress-tracker.js';

export type {
  BaseMessage,
  CoordinationMessage,
  TaskAssignmentMessage,
  HeartbeatMessage,
  MessageOptions,
  MessagingConfig,
  MessageType
} from './redis-messaging-infrastructure.js';

export { REDIS_CHANNELS, REDIS_KEYS } from './enhanced-progress-tracker.js';

// Factory functions
export { createEnhancedProgressTracker } from './enhanced-progress-tracker.js';
export { createRedisMessagingInfrastructure } from './redis-messaging-infrastructure.js';

// Default export
export { EnhancedProgressTracker as default } from './enhanced-progress-tracker.js';