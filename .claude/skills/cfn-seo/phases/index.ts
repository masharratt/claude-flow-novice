/**
 * SEO Onboarding Phases
 *
 * Sprint: 1.2
 * Purpose: Export all phase modules for SEO site onboarding pipeline
 */

// Phase 1: Technical Foundation
export {
  executePhase1,
  TechnicalFoundationInput,
  TechnicalFoundationOutput,
  CriticalIssue,
  PerformanceMetrics,
  IndexabilityMetrics,
  SiteArchitecture,
  CrawlResults
} from './phase-1-technical.js';

// Phase 2: Content Inventory
export {
  executePhase2,
  ContentInventoryInput,
  ContentInventoryOutput,
  ContentByType,
  ContentCluster,
  InternalLinkingMetrics
} from './phase-2-content.js';
