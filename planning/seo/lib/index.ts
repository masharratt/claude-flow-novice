/**
 * SEO Research Service - Main Export
 *
 * @module planning/seo/lib
 * @description Unified exports for ResearchService, Intelligence Curator, cache, and rate limiting
 */

// Core service
export {
  ResearchService,
  researchService,
  searchSerp,
  fetchContent,
  hybridResearch,
} from './research-service';

// Intelligence Curator (Phase 1 Sprint 2)
export {
  IntelligenceCurator,
  intelligenceCurator,
  loadIntelligence,
  captureLearning,
} from './intelligence-curator';

// Cache layer
export { ResearchCache, researchCache } from './research-cache';

// Rate limiting
export {
  RateLimiter,
  RateLimiterManager,
  rateLimiterManager,
} from './rate-limiter';

// Types
export {
  ResearchQuery,
  ResearchResult,
  SerpResult,
  ContentResult,
  CacheEntry,
  RateLimitConfig,
  RateLimiterState,
  QueuedRequest,
  ResearchError,
  ResearchErrorCode,
  CacheStats,
  RateLimiterStats,
} from '../types/research';

// Intelligence Curator Types
export type {
  IntelligenceQuery,
  CompetitiveIntelligence,
  SERPPattern,
  LearningCapture,
  IntelligenceLoadResult,
} from '../types';

// Pattern Manager (Phase 1 Sprint 3)
export { PatternManager } from './pattern-manager';
export { RedisContextStore } from './redis-context-store';

// Pipeline Orchestrator (Phase 1 Sprint 4)
export { PipelineOrchestrator } from './pipeline-orchestrator';
export { executeStep0 } from './steps/step-0-intelligence-preload';
export { executeStep12 } from './steps/step-12-learning-capture';

// Pipeline Types
export type {
  PipelineTask,
  PipelineContext,
  PipelineResult,
  PipelineStep,
  PipelineOrchestratorConfig,
  PatternApplication,
} from '../types';
