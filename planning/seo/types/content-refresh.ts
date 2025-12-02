/**
 * Content Refresh Trigger System - Type Definitions
 *
 * @module planning/seo/types/content-refresh
 * @description Type-safe definitions for content decay detection and refresh scheduling
 *              Enables automated content refresh workflows based on performance decay
 * @version 1.0.0
 * @phase 5
 * @sprint 2
 * @enhancement Step 13 Performance Tracking
 */

// ============================================================================
// DECAY PATTERN TYPES
// ============================================================================

/**
 * Decay pattern classifications for ranking decline
 * - gradual: < 2 positions/week for 4+ weeks (aging content)
 * - sudden: > 5 positions in 1 week (algorithm update or competitor surge)
 * - seasonal: Correlates with known seasonal traffic patterns
 * - competitor_displacement: Specific competitor content surpassed ours
 */
export type DecayPattern = 'gradual' | 'sudden' | 'seasonal' | 'competitor_displacement';

/**
 * Type guard for DecayPattern
 */
export function isValidDecayPattern(value: unknown): value is DecayPattern {
  return (
    typeof value === 'string' &&
    ['gradual', 'sudden', 'seasonal', 'competitor_displacement'].includes(value)
  );
}

// ============================================================================
// REFRESH PRIORITY TYPES
// ============================================================================

/**
 * Refresh priority levels based on decay severity
 * - URGENT: >= 10 positions drop, >= 50% traffic drop, < 2 weeks
 * - HIGH: >= 5 positions drop, >= 30% traffic drop, < 4 weeks
 * - MEDIUM: >= 3 positions drop, >= 20% traffic drop, or > 6 months age
 * - LOW: > 12 months since update, or freshness opportunity available
 */
export enum RefreshPriority {
  URGENT = 'URGENT',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Type guard for RefreshPriority
 */
export function isValidRefreshPriority(value: unknown): value is RefreshPriority {
  return (
    typeof value === 'string' &&
    Object.values(RefreshPriority).includes(value as RefreshPriority)
  );
}

/**
 * Priority threshold configuration
 */
export const REFRESH_PRIORITY_THRESHOLDS = {
  URGENT: {
    rankingDropMin: 10,
    trafficDropPercentMin: 50,
    timeframeWeeksMax: 2,
  },
  HIGH: {
    rankingDropMin: 5,
    trafficDropPercentMin: 30,
    timeframeWeeksMax: 4,
  },
  MEDIUM: {
    rankingDropMin: 3,
    trafficDropPercentMin: 20,
    ageMonthsMin: 6,
  },
  LOW: {
    ageMonthsMin: 12,
  },
} as const;

// ============================================================================
// DECAY ANALYSIS TYPES
// ============================================================================

/**
 * Comprehensive decay analysis for content performance
 */
export interface DecayAnalysis {
  /** Detected decay pattern type */
  readonly pattern: DecayPattern;

  /** Severity score (0.0-1.0, higher = more severe) */
  readonly severity: number;

  /** Decline timeline description */
  readonly timeline: string;

  /** Probable root cause of decay */
  readonly cause: string;

  /** Number of positions lost from peak */
  readonly positionsLost: number;

  /** Percentage of traffic lost from peak */
  readonly trafficLostPercent: number;

  /** Ranking drop velocity (positions per week) */
  readonly rankingDropVelocity: number;

  /** Weeks in continuous decline */
  readonly weeksInDecay: number;

  /** Competitor content that gained positions */
  readonly competitorGains: number;

  /** Analysis timestamp */
  readonly analyzedAt: string;

  /** Confidence in decay detection (0.0-1.0) */
  readonly confidence: number;
}

/**
 * Type guard for DecayAnalysis
 */
export function isValidDecayAnalysis(value: unknown): value is DecayAnalysis {
  if (typeof value !== 'object' || value === null) return false;

  const d = value as Record<string, unknown>;

  // Validate pattern
  if (!isValidDecayPattern(d.pattern)) return false;

  // Validate numeric fields
  const numericFields = [
    'severity',
    'positionsLost',
    'trafficLostPercent',
    'rankingDropVelocity',
    'weeksInDecay',
    'competitorGains',
    'confidence',
  ];

  for (const field of numericFields) {
    if (typeof d[field] !== 'number' || d[field] < 0 || !Number.isFinite(d[field])) {
      return false;
    }
  }

  // Validate severity and confidence are 0.0-1.0
  if ((d.severity as number) > 1 || (d.confidence as number) > 1) {
    return false;
  }

  // Validate string fields
  if (typeof d.timeline !== 'string' || d.timeline.length === 0) return false;
  if (typeof d.cause !== 'string' || d.cause.length === 0) return false;

  // Validate timestamp
  if (typeof d.analyzedAt !== 'string' || Number.isNaN(Date.parse(d.analyzedAt))) {
    return false;
  }

  return true;
}

// ============================================================================
// REFRESH RECOMMENDATION TYPES
// ============================================================================

/**
 * Recommended refresh action types
 */
export type RefreshAction =
  | 'full_rewrite'
  | 'content_update'
  | 'statistics_refresh'
  | 'technical_optimization'
  | 'competitor_analysis'
  | 'no_action';

/**
 * Refresh recommendation with priority and expected impact
 */
export interface RefreshRecommendation {
  /** Recommended action type */
  readonly action: RefreshAction;

  /** Priority level for this refresh */
  readonly priority: RefreshPriority;

  /** Reason for this recommendation */
  readonly reason: string;

  /** Expected impact description */
  readonly expectedImpact: string;

  /** Estimated ranking recovery (positions) */
  readonly estimatedRankingRecovery: number;

  /** Estimated traffic recovery (percentage) */
  readonly estimatedTrafficRecovery: number;

  /** Recommended completion deadline (ISO 8601) */
  readonly deadline: string;

  /** Specific tasks to complete */
  readonly tasks: ReadonlyArray<string>;

  /** Recommendation timestamp */
  readonly recommendedAt: string;

  /** Confidence in recommendation (0.0-1.0) */
  readonly confidence: number;
}

/**
 * Type guard for RefreshRecommendation
 */
export function isValidRefreshRecommendation(value: unknown): value is RefreshRecommendation {
  if (typeof value !== 'object' || value === null) return false;

  const r = value as Record<string, unknown>;

  // Validate action
  const validActions: RefreshAction[] = [
    'full_rewrite',
    'content_update',
    'statistics_refresh',
    'technical_optimization',
    'competitor_analysis',
    'no_action',
  ];
  if (typeof r.action !== 'string' || !validActions.includes(r.action as RefreshAction)) {
    return false;
  }

  // Validate priority
  if (!isValidRefreshPriority(r.priority)) return false;

  // Validate string fields
  if (typeof r.reason !== 'string' || r.reason.length === 0) return false;
  if (typeof r.expectedImpact !== 'string' || r.expectedImpact.length === 0) return false;

  // Validate numeric fields
  if (
    typeof r.estimatedRankingRecovery !== 'number' ||
    r.estimatedRankingRecovery < 0 ||
    !Number.isFinite(r.estimatedRankingRecovery)
  ) {
    return false;
  }

  if (
    typeof r.estimatedTrafficRecovery !== 'number' ||
    r.estimatedTrafficRecovery < 0 ||
    !Number.isFinite(r.estimatedTrafficRecovery)
  ) {
    return false;
  }

  // Validate confidence (0.0-1.0)
  if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) {
    return false;
  }

  // Validate tasks array
  if (!Array.isArray(r.tasks) || r.tasks.length === 0) return false;

  // Validate timestamps
  if (typeof r.deadline !== 'string' || Number.isNaN(Date.parse(r.deadline))) {
    return false;
  }
  if (typeof r.recommendedAt !== 'string' || Number.isNaN(Date.parse(r.recommendedAt))) {
    return false;
  }

  return true;
}

// ============================================================================
// REFRESH SCHEDULE TYPES
// ============================================================================

/**
 * Scheduled refresh for content
 */
export interface RefreshSchedule {
  /** Content ID to refresh */
  readonly contentId: string;

  /** Content URL */
  readonly contentUrl: string;

  /** Target keyword */
  readonly targetKeyword: string;

  /** Scheduled refresh date (ISO 8601) */
  readonly scheduledDate: string;

  /** Refresh priority */
  readonly priority: RefreshPriority;

  /** Decay triggers that prompted this schedule */
  readonly triggers: ReadonlyArray<string>;

  /** Recommended actions */
  readonly recommendedActions: ReadonlyArray<RefreshAction>;

  /** Estimated effort hours */
  readonly estimatedEffortHours: number;

  /** Assigned to (optional) */
  readonly assignedTo?: string;

  /** Schedule status */
  readonly status: 'pending' | 'in_progress' | 'completed' | 'cancelled';

  /** Schedule creation timestamp */
  readonly createdAt: string;

  /** Last updated timestamp */
  readonly updatedAt: string;

  /** Additional notes */
  readonly notes?: string;
}

/**
 * Type guard for RefreshSchedule
 */
export function isValidRefreshSchedule(value: unknown): value is RefreshSchedule {
  if (typeof value !== 'object' || value === null) return false;

  const s = value as Record<string, unknown>;

  // Validate string fields
  const requiredStringFields = [
    'contentId',
    'contentUrl',
    'targetKeyword',
    'scheduledDate',
    'createdAt',
    'updatedAt',
  ];
  for (const field of requiredStringFields) {
    if (typeof s[field] !== 'string' || (s[field] as string).length === 0) {
      return false;
    }
  }

  // Validate priority
  if (!isValidRefreshPriority(s.priority)) return false;

  // Validate arrays
  if (!Array.isArray(s.triggers)) return false;
  if (!Array.isArray(s.recommendedActions)) return false;

  // Validate numeric field
  if (
    typeof s.estimatedEffortHours !== 'number' ||
    s.estimatedEffortHours < 0 ||
    !Number.isFinite(s.estimatedEffortHours)
  ) {
    return false;
  }

  // Validate status
  const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
  if (typeof s.status !== 'string' || !validStatuses.includes(s.status)) {
    return false;
  }

  // Validate timestamps
  if (Number.isNaN(Date.parse(s.scheduledDate as string))) return false;
  if (Number.isNaN(Date.parse(s.createdAt as string))) return false;
  if (Number.isNaN(Date.parse(s.updatedAt as string))) return false;

  return true;
}

// ============================================================================
// FRESHNESS OPPORTUNITY TYPES
// ============================================================================

/**
 * Freshness opportunity classifications
 */
export type FreshnessOpportunityType =
  | 'outdated_statistics'
  | 'outdated_year_reference'
  | 'new_competitor_content'
  | 'algorithm_update'
  | 'industry_news'
  | 'new_tools_resources'
  | 'unanswered_paa';

/**
 * Identified freshness opportunity for content
 */
export interface FreshnessOpportunity {
  /** Type of freshness opportunity */
  readonly type: FreshnessOpportunityType;

  /** Current (outdated) value or reference */
  readonly currentValue: string;

  /** Suggested updated value */
  readonly suggestedUpdate: string;

  /** Expected impact on rankings (0.0-1.0) */
  readonly impact: number;

  /** Opportunity detection timestamp */
  readonly detectedAt: string;

  /** Supporting evidence or source */
  readonly evidence?: string;

  /** Confidence in opportunity (0.0-1.0) */
  readonly confidence: number;
}

/**
 * Type guard for FreshnessOpportunity
 */
export function isValidFreshnessOpportunity(value: unknown): value is FreshnessOpportunity {
  if (typeof value !== 'object' || value === null) return false;

  const f = value as Record<string, unknown>;

  // Validate type
  const validTypes: FreshnessOpportunityType[] = [
    'outdated_statistics',
    'outdated_year_reference',
    'new_competitor_content',
    'algorithm_update',
    'industry_news',
    'new_tools_resources',
    'unanswered_paa',
  ];
  if (typeof f.type !== 'string' || !validTypes.includes(f.type as FreshnessOpportunityType)) {
    return false;
  }

  // Validate string fields
  if (typeof f.currentValue !== 'string' || f.currentValue.length === 0) return false;
  if (typeof f.suggestedUpdate !== 'string' || f.suggestedUpdate.length === 0) return false;

  // Validate numeric fields (0.0-1.0)
  if (typeof f.impact !== 'number' || f.impact < 0 || f.impact > 1) {
    return false;
  }
  if (typeof f.confidence !== 'number' || f.confidence < 0 || f.confidence > 1) {
    return false;
  }

  // Validate timestamp
  if (typeof f.detectedAt !== 'string' || Number.isNaN(Date.parse(f.detectedAt))) {
    return false;
  }

  return true;
}

// ============================================================================
// REFRESH WORKFLOW TYPES
// ============================================================================

/**
 * Result of triggering refresh workflow
 */
export interface RefreshWorkflowResult {
  /** Whether workflow was successfully triggered */
  readonly success: boolean;

  /** Content ID being refreshed */
  readonly contentId: string;

  /** Workflow ID or task ID */
  readonly workflowId: string;

  /** Refresh schedule created */
  readonly schedule: RefreshSchedule;

  /** Decay analysis that triggered this */
  readonly decayAnalysis: DecayAnalysis;

  /** Refresh recommendation */
  readonly recommendation: RefreshRecommendation;

  /** Workflow trigger timestamp */
  readonly triggeredAt: string;

  /** Error message if failed */
  readonly error?: string;
}

/**
 * Type guard for RefreshWorkflowResult
 */
export function isValidRefreshWorkflowResult(value: unknown): value is RefreshWorkflowResult {
  if (typeof value !== 'object' || value === null) return false;

  const w = value as Record<string, unknown>;

  // Validate boolean
  if (typeof w.success !== 'boolean') return false;

  // Validate string fields
  if (typeof w.contentId !== 'string' || w.contentId.length === 0) return false;
  if (typeof w.workflowId !== 'string' || w.workflowId.length === 0) return false;

  // Validate nested objects
  if (!isValidRefreshSchedule(w.schedule)) return false;
  if (!isValidDecayAnalysis(w.decayAnalysis)) return false;
  if (!isValidRefreshRecommendation(w.recommendation)) return false;

  // Validate timestamp
  if (typeof w.triggeredAt !== 'string' || Number.isNaN(Date.parse(w.triggeredAt))) {
    return false;
  }

  return true;
}

// ============================================================================
// DECAY METRICS TYPES
// ============================================================================

/**
 * Metrics used to detect and analyze decay
 */
export interface DecayMetrics {
  /** Current ranking position */
  readonly currentPosition: number;

  /** Peak ranking position */
  readonly peakPosition: number;

  /** Ranking drop percentage from peak */
  readonly rankingDropPercent: number;

  /** Positions lost per week */
  readonly rankingDropVelocity: number;

  /** Current traffic (impressions + clicks) */
  readonly currentTraffic: number;

  /** Peak traffic */
  readonly peakTraffic: number;

  /** Traffic drop percentage from peak */
  readonly trafficDropPercent: number;

  /** Positions gained by top competitor */
  readonly competitorGains: number;

  /** Weeks of continuous decline */
  readonly timeInDecay: number;

  /** Days since last content update */
  readonly daysSinceLastUpdate: number;

  /** Measurement timestamp */
  readonly measuredAt: string;
}

/**
 * Type guard for DecayMetrics
 */
export function isValidDecayMetrics(value: unknown): value is DecayMetrics {
  if (typeof value !== 'object' || value === null) return false;

  const d = value as Record<string, unknown>;

  // Validate numeric fields
  const numericFields = [
    'currentPosition',
    'peakPosition',
    'rankingDropPercent',
    'rankingDropVelocity',
    'currentTraffic',
    'peakTraffic',
    'trafficDropPercent',
    'competitorGains',
    'timeInDecay',
    'daysSinceLastUpdate',
  ];

  for (const field of numericFields) {
    if (typeof d[field] !== 'number' || d[field] < 0 || !Number.isFinite(d[field])) {
      return false;
    }
  }

  // Validate timestamp
  if (typeof d.measuredAt !== 'string' || Number.isNaN(Date.parse(d.measuredAt))) {
    return false;
  }

  return true;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default decay detection thresholds
 */
export const DECAY_DETECTION_THRESHOLDS = {
  GRADUAL_VELOCITY_MAX: 2, // positions per week
  GRADUAL_DURATION_MIN: 4, // weeks
  SUDDEN_DROP_MIN: 5, // positions in 1 week
  SEVERE_TRAFFIC_DROP: 50, // percent
  MODERATE_TRAFFIC_DROP: 30, // percent
  MILD_TRAFFIC_DROP: 20, // percent
} as const;

/**
 * Default freshness opportunity impact weights
 */
export const FRESHNESS_IMPACT_WEIGHTS = {
  OUTDATED_STATISTICS: 0.7,
  OUTDATED_YEAR_REFERENCE: 0.5,
  NEW_COMPETITOR_CONTENT: 0.8,
  ALGORITHM_UPDATE: 0.9,
  INDUSTRY_NEWS: 0.6,
  NEW_TOOLS_RESOURCES: 0.6,
  UNANSWERED_PAA: 0.7,
} as const;

/**
 * Default refresh effort estimates (hours)
 */
export const REFRESH_EFFORT_ESTIMATES = {
  FULL_REWRITE: 8,
  CONTENT_UPDATE: 4,
  STATISTICS_REFRESH: 2,
  TECHNICAL_OPTIMIZATION: 3,
  COMPETITOR_ANALYSIS: 3,
} as const;
