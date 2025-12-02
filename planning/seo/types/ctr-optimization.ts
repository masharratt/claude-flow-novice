/**
 * CTR Optimization Type Definitions
 *
 * Types for click-through rate optimization of title tags and meta descriptions.
 */

export type PsychologicalTrigger =
  | 'curiosity'
  | 'urgency'
  | 'benefit'
  | 'exclusivity'
  | 'trust'
  | 'emotion'
  | 'social_proof';

export interface CTRScoreFactors {
  lengthOptimal: boolean;      // 50-60 chars title, 150-160 chars meta
  keywordPresent: boolean;     // Target keyword in title
  powerWordPresent: boolean;   // At least one power word
  numberPresent: boolean;      // Contains number
  yearPresent: boolean;        // Contains current year
  bracketsPresent: boolean;    // Visual distinction [Brackets]
  ctaPresent: boolean;         // Call to action in meta
  emotionPresent: boolean;     // Emotional trigger
  uniqueness: number;          // How different from competitors (0-100)
}

export interface CTRScore {
  score: number;               // 0-100
  factors: CTRScoreFactors;
  recommendations: string[];
  estimatedImpact: 'low' | 'medium' | 'high';
}

export interface TriggerAnalysis {
  curiosity: number;           // 0-100
  urgency: number;             // 0-100
  benefit: number;             // 0-100
  emotion: number;             // 0-100
  social_proof: number;        // 0-100
  dominant_trigger: PsychologicalTrigger | null;
  trigger_count: number;
}

export interface TitleVariation {
  title: string;
  score: number;
  triggers_used: PsychologicalTrigger[];
  length: number;
  template: string;
}

export interface TitleOptimizationResult {
  original: string;
  optimized: string;
  variations: TitleVariation[];
  score_improvement: number;
  changes_made: string[];
  recommendations: string[];
}

export interface MetaOptimizationResult {
  original: string;
  optimized: string;
  score: number;
  changes_made: string[];
  recommendations: string[];
  cta_added: boolean;
  emotional_trigger: string | null;
}

export interface CTROptimizationConfig {
  targetLength?: {
    title?: { min: number; max: number };
    meta?: { min: number; max: number };
  };
  includeYear?: boolean;
  maxVariations?: number;
  brandName?: string;
  competitorTitles?: string[];
  priorityTriggers?: PsychologicalTrigger[];
}

export interface PowerWordsDatabase {
  curiosity: string[];
  urgency: string[];
  benefit: string[];
  exclusivity: string[];
  trust: string[];
  emotion: string[];
  numbers: string[];
}
