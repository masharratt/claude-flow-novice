/**
 * SEO Output Module
 *
 * Exports strategy document generators and formatters for SEO onboarding results.
 *
 * @module seo/lib/output
 */

export { default as StrategyDocumentGenerator } from './strategy-document';
export type {
  PhaseOutputs,
  SEOStrategy,
  SEORoadmap,
  StrategyDocument,
  StrategyJSON,
  DocumentMetadata,
  RuVectorIntelligenceSummary,
} from './strategy-document';

export { generateExampleStrategyDocument } from './strategy-document-example';
