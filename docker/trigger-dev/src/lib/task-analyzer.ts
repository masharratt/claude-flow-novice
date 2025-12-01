/**
 * Task Complexity Analyzer
 *
 * Provides keyword-based heuristics for analyzing task complexity,
 * estimating file counts, agent requirements, and suggesting execution phases.
 *
 * @module task-analyzer
 * @version 1.0.0
 */

// =============================================
// Type Definitions
// =============================================

/**
 * Result of task complexity analysis
 */
export interface TaskComplexity {
  /** Complexity classification */
  level: 'simple' | 'moderate' | 'complex' | 'large';
  /** Estimated number of files affected */
  estimatedFiles: number;
  /** Recommended number of agents */
  estimatedAgents: number;
  /** Suggested execution phases */
  suggestedPhases: string[];
  /** Whether subtasks can run in parallel */
  parallelizable: boolean;
  /** Explanation of analysis */
  reasoning: string;
  /** Raw scores for debugging */
  scores: ComplexityScores;
}

/**
 * Internal scoring breakdown
 */
interface ComplexityScores {
  simple: number;
  moderate: number;
  complex: number;
  large: number;
}

/**
 * Indicators found during analysis
 */
interface AnalysisIndicators {
  simpleIndicators: string[];
  moderateIndicators: string[];
  complexIndicators: string[];
  largeIndicators: string[];
  parallelIndicators: string[];
  phaseIndicators: string[];
}

// =============================================
// Keyword Dictionaries
// =============================================

/**
 * Simple task keywords (1-2 files, 1 agent)
 */
const SIMPLE_KEYWORDS = [
  'add function',
  'fix typo',
  'update comment',
  'rename variable',
  'add log',
  'console.log',
  'fix import',
  'update import',
  'add import',
  'remove unused',
  'fix syntax',
  'fix spacing',
  'fix indentation',
  'add type',
  'fix type',
  'add export',
  'remove export',
  'add return',
  'fix return',
  'update constant',
  'change constant',
  'add constant',
  'fix path',
  'update path',
  'simple fix',
  'quick fix',
  'minor change',
  'small change',
  'tweak',
  'adjust',
];

/**
 * Moderate task keywords (3-5 files, 2-3 agents)
 */
const MODERATE_KEYWORDS = [
  'add feature',
  'implement feature',
  'create feature',
  'refactor module',
  'implement component',
  'create component',
  'add endpoint',
  'create endpoint',
  'implement api',
  'add api',
  'create service',
  'implement service',
  'add hook',
  'create hook',
  'add util',
  'create utility',
  'implement utility',
  'add validation',
  'implement validation',
  'add handler',
  'create handler',
  'implement handler',
  'add middleware',
  'create middleware',
  'add model',
  'create model',
  'add schema',
  'create schema',
  'update feature',
  'enhance feature',
  'extend feature',
  'improve feature',
  // Single-word triggers for moderate tasks
  'implement',
  'component',
  'endpoint',
  'service',
  'middleware',
  'authentication',
  'authorization',
  'handler',
  'controller',
  'repository',
  'module',
  'refactor',
  'dashboard',
  'widget',
];

/**
 * Complex task keywords (6-10 files, 4-6 agents)
 */
const COMPLEX_KEYWORDS = [
  'redesign system',
  'redesign module',
  'add subsystem',
  'create subsystem',
  'implement subsystem',
  'integrate service',
  'integrate api',
  'integrate system',
  'build system',
  'create system',
  'implement system',
  'add authentication',
  'implement authentication',
  'add authorization',
  'implement authorization',
  'add caching',
  'implement caching',
  'add monitoring',
  'implement monitoring',
  'add logging system',
  'implement logging',
  'data pipeline',
  'event system',
  'notification system',
  'queue system',
  'message system',
  'state management',
  'implement state',
  'add state management',
  'multiple components',
  'several components',
  'multiple modules',
  'several modules',
  'across modules',
  'cross-cutting',
  'end-to-end',
];

/**
 * Large task keywords (10+ files, 7+ agents)
 */
const LARGE_KEYWORDS = [
  'rewrite application',
  'rewrite project',
  'rewrite codebase',
  'migrate framework',
  'migrate to',
  'migration from',
  'complete overhaul',
  'full overhaul',
  'complete rewrite',
  'full rewrite',
  'rebuild entire',
  'rebuild application',
  'rebuild project',
  'redesign entire',
  'redesign application',
  'redesign architecture',
  'new architecture',
  'architecture overhaul',
  'platform migration',
  'database migration',
  'complete refactor',
  'major refactor',
  'large scale',
  'large-scale',
  'enterprise',
  'entire system',
  'entire application',
  'entire codebase',
  'from scratch',
  'ground up',
  // Single-word triggers for large tasks
  'migrate entire',
  'entire api',
  'all routes',
  'all middleware',
  'microservices',
  'monolith',
];

/**
 * Keywords indicating parallelizable work
 */
const PARALLEL_KEYWORDS = [
  ' and ',
  ', and',
  'multiple',
  'several',
  'various',
  'different',
  'independent',
  'separate',
  'parallel',
  'concurrent',
  'simultaneously',
  'at the same time',
  'in parallel',
  'both',
  'each',
  'all',
];

/**
 * Keywords indicating specific phases
 */
const PHASE_KEYWORDS: Record<string, string[]> = {
  'design': ['design', 'plan', 'architect', 'blueprint', 'specification', 'spec'],
  'setup': ['setup', 'configure', 'initialize', 'bootstrap', 'scaffold'],
  'implementation': ['implement', 'create', 'build', 'develop', 'code', 'write'],
  'testing': ['test', 'validate', 'verify', 'check', 'assert', 'spec', 'coverage'],
  'migration': ['migrate', 'transfer', 'move', 'port', 'convert', 'upgrade'],
  'refactoring': ['refactor', 'restructure', 'reorganize', 'cleanup', 'clean up'],
  'integration': ['integrate', 'connect', 'combine', 'merge', 'unify'],
  'documentation': ['document', 'readme', 'jsdoc', 'tsdoc', 'comment', 'explain'],
  'security': ['security', 'secure', 'auth', 'permission', 'access control'],
  'optimization': ['optimize', 'performance', 'speed up', 'improve performance'],
};

// =============================================
// Scoring Functions
// =============================================

/**
 * Counts keyword matches in text (case-insensitive)
 */
function countKeywordMatches(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  const matches: string[] = [];

  for (const keyword of keywords) {
    if (lower.includes(keyword.toLowerCase())) {
      matches.push(keyword);
    }
  }

  return matches;
}

/**
 * Calculates complexity scores based on keyword matches
 */
function calculateScores(description: string): {
  scores: ComplexityScores;
  indicators: AnalysisIndicators;
} {
  const simpleIndicators = countKeywordMatches(description, SIMPLE_KEYWORDS);
  const moderateIndicators = countKeywordMatches(description, MODERATE_KEYWORDS);
  const complexIndicators = countKeywordMatches(description, COMPLEX_KEYWORDS);
  const largeIndicators = countKeywordMatches(description, LARGE_KEYWORDS);
  const parallelIndicators = countKeywordMatches(description, PARALLEL_KEYWORDS);

  // Phase indicators
  const phaseIndicators: string[] = [];
  for (const [phase, keywords] of Object.entries(PHASE_KEYWORDS)) {
    const matches = countKeywordMatches(description, keywords);
    if (matches.length > 0) {
      phaseIndicators.push(phase);
    }
  }

  // Calculate weighted scores
  // Higher tiers get higher weights to break ties toward complexity
  const scores: ComplexityScores = {
    simple: simpleIndicators.length * 1.0,
    moderate: moderateIndicators.length * 1.5,
    complex: complexIndicators.length * 2.0,
    large: largeIndicators.length * 2.5,
  };

  // Boost scores based on description length (longer = more complex)
  const wordCount = description.split(/\s+/).length;
  if (wordCount > 100) {
    scores.large += 2;
    scores.complex += 1;
  } else if (wordCount > 50) {
    scores.complex += 1;
    scores.moderate += 0.5;
  } else if (wordCount > 20) {
    scores.moderate += 0.5;
  }

  // Check for numbered lists (indicates multiple distinct tasks)
  const numberedListMatches = description.match(/^\d+[.)]/gm) || [];
  if (numberedListMatches.length >= 5) {
    scores.large += 2;
    scores.complex += 1;
  } else if (numberedListMatches.length >= 3) {
    scores.complex += 1;
    scores.moderate += 0.5;
  } else if (numberedListMatches.length >= 2) {
    scores.moderate += 0.5;
  }

  // Check for bullet points
  const bulletMatches = description.match(/^[-*]/gm) || [];
  if (bulletMatches.length >= 5) {
    scores.large += 1;
    scores.complex += 0.5;
  } else if (bulletMatches.length >= 3) {
    scores.complex += 0.5;
  }

  // Boost parallelizable indicators for multi-feature detection
  if (parallelIndicators.length >= 3) {
    scores.complex += 1;
  }

  return {
    scores,
    indicators: {
      simpleIndicators,
      moderateIndicators,
      complexIndicators,
      largeIndicators,
      parallelIndicators,
      phaseIndicators,
    },
  };
}

/**
 * Determines complexity level from scores
 */
function determineLevel(scores: ComplexityScores): 'simple' | 'moderate' | 'complex' | 'large' {
  // Find the highest score
  const entries = Object.entries(scores) as Array<[keyof ComplexityScores, number]>;
  entries.sort((a, b) => b[1] - a[1]);

  const [topLevel, topScore] = entries[0];
  const [secondLevel, secondScore] = entries[1];

  // If no clear winner and scores are low, default to simple
  if (topScore < 1) {
    return 'simple';
  }

  // If large score is significant, prefer it
  if (scores.large >= 2.5) {
    return 'large';
  }

  // If complex score is significant, prefer it
  if (scores.complex >= 2.0 && scores.large < 2.5) {
    return 'complex';
  }

  // If moderate score is significant, prefer it
  if (scores.moderate >= 1.5 && scores.complex < 2.0) {
    return 'moderate';
  }

  // Otherwise use top score
  return topLevel;
}

/**
 * Estimates file count based on complexity level
 */
function estimateFiles(level: 'simple' | 'moderate' | 'complex' | 'large'): number {
  switch (level) {
    case 'simple':
      return 1;
    case 'moderate':
      return 4;
    case 'complex':
      return 8;
    case 'large':
      return 15;
  }
}

/**
 * Estimates agent count based on complexity level
 */
function estimateAgents(level: 'simple' | 'moderate' | 'complex' | 'large'): number {
  switch (level) {
    case 'simple':
      return 1;
    case 'moderate':
      return 2;
    case 'complex':
      return 5;
    case 'large':
      return 8;
  }
}

/**
 * Determines if task can be parallelized
 */
function isParallelizable(
  description: string,
  parallelIndicators: string[],
  level: 'simple' | 'moderate' | 'complex' | 'large'
): boolean {
  // Simple tasks are not parallelizable (single agent)
  if (level === 'simple') {
    return false;
  }

  // Check for explicit parallel indicators
  if (parallelIndicators.length >= 2) {
    return true;
  }

  // Check for "and" separators (common pattern for multiple independent tasks)
  const andCount = (description.match(/ and /gi) || []).length;
  if (andCount >= 2) {
    return true;
  }

  // Check for comma-separated list patterns
  const commaSegments = description.split(',').filter(s => s.trim().length > 5);
  if (commaSegments.length >= 3) {
    return true;
  }

  // Complex and large tasks are likely parallelizable by default
  if (level === 'large' || level === 'complex') {
    return true;
  }

  return false;
}

/**
 * Suggests execution phases based on detected keywords
 */
function suggestPhases(
  description: string,
  phaseIndicators: string[],
  level: 'simple' | 'moderate' | 'complex' | 'large'
): string[] {
  const phases: string[] = [];

  // Always start with appropriate initial phase
  if (level === 'large' || level === 'complex') {
    phases.push('analysis');
  }

  // Add detected phases in logical order
  const phaseOrder = [
    'design',
    'setup',
    'implementation',
    'testing',
    'migration',
    'refactoring',
    'integration',
    'security',
    'optimization',
    'documentation',
  ];

  for (const phase of phaseOrder) {
    if (phaseIndicators.includes(phase)) {
      phases.push(phase);
    }
  }

  // If no specific phases detected, use defaults based on level
  if (phases.length === 0 || (phases.length === 1 && phases[0] === 'analysis')) {
    switch (level) {
      case 'simple':
        phases.push('implementation');
        break;
      case 'moderate':
        phases.push('implementation', 'testing');
        break;
      case 'complex':
        if (!phases.includes('analysis')) phases.push('analysis');
        phases.push('implementation', 'testing', 'integration');
        break;
      case 'large':
        if (!phases.includes('analysis')) phases.push('analysis');
        phases.push('design', 'implementation', 'testing', 'integration', 'validation');
        break;
    }
  }

  // Always add testing if not present and level > simple
  if (level !== 'simple' && !phases.includes('testing')) {
    // Insert testing after implementation if implementation exists
    const implIndex = phases.indexOf('implementation');
    if (implIndex >= 0) {
      phases.splice(implIndex + 1, 0, 'testing');
    } else {
      phases.push('testing');
    }
  }

  // Deduplicate while preserving order
  return [...new Set(phases)];
}

/**
 * Builds reasoning string explaining the analysis
 */
function buildReasoning(
  level: 'simple' | 'moderate' | 'complex' | 'large',
  indicators: AnalysisIndicators,
  scores: ComplexityScores
): string {
  const parts: string[] = [];

  // Explain level determination
  parts.push(`Complexity level: ${level}`);

  // List key indicators
  const allIndicators = [
    ...indicators.largeIndicators.map(i => `large: "${i}"`),
    ...indicators.complexIndicators.map(i => `complex: "${i}"`),
    ...indicators.moderateIndicators.map(i => `moderate: "${i}"`),
    ...indicators.simpleIndicators.map(i => `simple: "${i}"`),
  ].slice(0, 5); // Top 5 indicators

  if (allIndicators.length > 0) {
    parts.push(`Key indicators: ${allIndicators.join(', ')}`);
  } else {
    parts.push('No specific keywords matched; using default classification');
  }

  // Explain parallelization
  if (indicators.parallelIndicators.length > 0) {
    parts.push(`Parallel indicators: ${indicators.parallelIndicators.slice(0, 3).join(', ')}`);
  }

  // Explain phases
  if (indicators.phaseIndicators.length > 0) {
    parts.push(`Detected phases: ${indicators.phaseIndicators.join(', ')}`);
  }

  // Score summary
  const scoreStr = `Scores: simple=${scores.simple.toFixed(1)}, moderate=${scores.moderate.toFixed(1)}, complex=${scores.complex.toFixed(1)}, large=${scores.large.toFixed(1)}`;
  parts.push(scoreStr);

  return parts.join('. ');
}

// =============================================
// Main Analysis Function
// =============================================

/**
 * Analyzes task complexity based on description and working directory context
 *
 * @param description - Human-readable task description
 * @param workDir - Working directory for file context (reserved for future file-based analysis)
 * @returns TaskComplexity analysis result
 *
 * @example
 * ```typescript
 * const result = await analyzeTaskComplexity(
 *   "Add console.log to main.ts",
 *   "/path/to/project"
 * );
 * // result.level === 'simple'
 * // result.estimatedFiles === 1
 * // result.estimatedAgents === 1
 * ```
 */
export async function analyzeTaskComplexity(
  description: string,
  workDir: string
): Promise<TaskComplexity> {
  // Calculate scores and indicators
  const { scores, indicators } = calculateScores(description);

  // Determine complexity level
  const level = determineLevel(scores);

  // Estimate resource requirements
  const estimatedFiles = estimateFiles(level);
  const estimatedAgents = estimateAgents(level);

  // Determine parallelization potential
  const parallelizable = isParallelizable(description, indicators.parallelIndicators, level);

  // Suggest execution phases
  const suggestedPhases = suggestPhases(description, indicators.phaseIndicators, level);

  // Build reasoning explanation
  const reasoning = buildReasoning(level, indicators, scores);

  return {
    level,
    estimatedFiles,
    estimatedAgents,
    suggestedPhases,
    parallelizable,
    reasoning,
    scores,
  };
}

// =============================================
// Utility Exports
// =============================================

/**
 * Quick complexity check without full analysis
 */
export function quickComplexityLevel(description: string): 'simple' | 'moderate' | 'complex' | 'large' {
  const { scores } = calculateScores(description);
  return determineLevel(scores);
}

/**
 * Check if description indicates parallel work
 */
export function checkParallelizable(description: string): boolean {
  const matches = countKeywordMatches(description, PARALLEL_KEYWORDS);
  return matches.length >= 2 || (description.match(/ and /gi) || []).length >= 2;
}

/**
 * Extract suggested phases only
 */
export function extractPhases(description: string): string[] {
  const phaseIndicators: string[] = [];
  for (const [phase, keywords] of Object.entries(PHASE_KEYWORDS)) {
    const matches = countKeywordMatches(description, keywords);
    if (matches.length > 0) {
      phaseIndicators.push(phase);
    }
  }
  const level = quickComplexityLevel(description);
  return suggestPhases(description, phaseIndicators, level);
}
