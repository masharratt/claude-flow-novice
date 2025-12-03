/**
 * SEO Site Onboarding Phases
 *
 * @module seo/lib/phases
 * @description Export all onboarding phases for SEO pipeline
 *
 * Sprint 1.3 - Loop 3 Iteration 1
 */

// Phase 4: Keyword Universe
export {
  executePhase4,
  type Phase4Config,
  type Phase4Result,
  type KeywordWithMetrics,
} from './phase-4-keywords';

// Phase 5: Gap Analysis
export {
  executePhase5,
  type Phase5Config,
  type Phase5Result,
  type KeywordGap,
  type ContentGap,
  type BacklinkGap,
  type SERPFeatureGap,
} from './phase-5-gaps';
