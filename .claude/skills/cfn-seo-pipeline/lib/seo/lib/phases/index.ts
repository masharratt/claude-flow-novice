/**
 * SEO Site Onboarding Phases
 *
 * @module seo/lib/phases
 * @description Export all onboarding phases for SEO pipeline
 *
 * Sprint 1.3-1.4 - Loop 3 Iteration 1
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

// Phase 6: Strategy Creation
export {
  executePhase6,
  type Phase6Config,
  type Phase6Result,
  type SEOStrategy,
  type ContentPillar,
  type QuickWin,
  type LinkStrategy,
  type TechnicalTask,
  type TrafficProjection,
  type PatternApplication,
} from './phase-6-strategy';

// Phase 7: Roadmap Generation
export {
  executePhase7,
  type Phase7Config,
  type Phase7Result,
  type SEORoadmap,
  type Milestone,
  type Task,
  type KPI,
  type Dependency,
} from './phase-7-roadmap';
