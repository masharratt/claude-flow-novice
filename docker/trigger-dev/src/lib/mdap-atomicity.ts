/**
 * MDAP Atomicity Analyzer
 *
 * Enforces micro-task decomposition for T1 model success.
 * Tasks must be atomic enough for a small model to complete in one shot.
 *
 * Atomicity Rules:
 * 1. One decision per task (no "and" in description)
 * 2. One file change per task (max 50 lines)
 * 3. One clear action verb (create, add, fix, remove, update)
 * 4. Self-contained context (no cross-file dependencies in task scope)
 *
 * @module mdap-atomicity
 * @version 1.0.0
 */

// =============================================
// Type Definitions
// =============================================

/**
 * Atomicity violation types
 */
export type AtomicityViolation =
  | 'multiple_actions'      // Task contains "and", multiple verbs
  | 'multiple_files'        // Task mentions multiple files
  | 'vague_scope'           // Task is too broad ("build component")
  | 'missing_context'       // Task requires external knowledge
  | 'too_many_lines'        // Expected output exceeds 50 lines
  | 'cross_dependency';     // Requires coordination with other tasks

/**
 * Atomicity analysis result
 */
export interface AtomicityAnalysis {
  /** Whether the task is atomic enough for T1 */
  isAtomic: boolean;
  /** Confidence score (0.0-1.0) */
  confidence: number;
  /** List of violations found */
  violations: AtomicityViolation[];
  /** Human-readable violation explanations */
  violationDetails: string[];
  /** Suggested micro-tasks if not atomic */
  suggestedDecomposition: MicroTask[];
  /** Estimated lines of code for this task */
  estimatedLines: number;
}

/**
 * Micro-task definition
 */
export interface MicroTask {
  /** Unique identifier */
  id: string;
  /** Atomic task description */
  description: string;
  /** Target file path */
  targetFile: string;
  /** Action verb */
  action: 'create' | 'add' | 'fix' | 'remove' | 'update' | 'rename';
  /** Estimated complexity */
  complexity: 'simple' | 'moderate';
  /** Dependencies on other micro-task IDs */
  dependsOn: string[];
  /** Estimated lines of code */
  estimatedLines: number;
  /** Context hints for the model */
  contextHints: string[];
}

/**
 * Component decomposition template
 */
export interface ComponentTemplate {
  /** Component type (e.g., 'react-component', 'api-endpoint') */
  type: string;
  /** Standard micro-task breakdown */
  microTasks: Omit<MicroTask, 'id' | 'targetFile'>[];
}

// =============================================
// Atomicity Detection Patterns
// =============================================

/**
 * Patterns that indicate non-atomic tasks
 */
const NON_ATOMIC_PATTERNS = {
  // Multiple actions
  multipleActions: [
    /\band\b/i,
    /\bthen\b/i,
    /\balso\b/i,
    /\bplus\b/i,
    /,\s*(add|create|update|fix|remove)/i,
  ],

  // Vague scope - patterns for tasks that are too broad
  vagueScope: [
    /^build\s+(a\s+)?\w+\s*(component|page|feature|module|system|app)?$/i,  // "Build a dashboard component"
    /^build\s+(a\s+)?(dashboard|admin|user|auth)/i,  // "Build a dashboard..."
    /^implement\s+(the\s+)?feature/i,
    /^create\s+(the\s+)?(page|system|module|service|app)/i,  // "Create the user authentication system"
    /^create\s+(a\s+)?\w+\s*system/i,  // "Create X system"
    /^add\s+functionality/i,
    /^make\s+it\s+work/i,
    /^set\s*up/i,
    /^handle\s+(all|the)/i,
    /^refactor\s+(the\s+)?(entire|whole|full)/i,  // "Refactor the entire module"
    /authentication\s+system/i,  // Any mention of "authentication system"
    /\bsystem\b.*\bwith\b/i,  // "X system with Y" is usually too complex
  ],

  // Multiple files
  multipleFiles: [
    /\bfiles?\b.*\band\b/i,
    /\bmultiple\s+(files?|components?)/i,
    /\bacross\s+(the\s+)?(codebase|project)/i,
  ],

  // Cross-dependencies
  crossDependency: [
    /\bintegrate\s+with/i,
    /\bconnect\s+to/i,
    /\bwire\s+up/i,
    /\bcoordinate\s+with/i,
  ],
};

/**
 * Patterns that indicate atomic tasks
 */
const ATOMIC_PATTERNS = {
  // Single action verbs
  singleAction: [
    /^create\s+(the\s+)?(\w+)\s+(interface|type|enum)/i,
    /^add\s+(the\s+)?(\w+)\s+(prop|property|field|method)/i,
    /^fix\s+(the\s+)?(\w+)\s+(error|bug|issue)/i,
    /^remove\s+(the\s+)?(\w+)/i,
    /^update\s+(the\s+)?(\w+)\s+to/i,
    /^rename\s+(\w+)\s+to\s+(\w+)/i,
  ],

  // Single file scope
  singleFile: [
    /in\s+(\S+\.(ts|tsx|js|jsx|py|go|rs))/i,
    /^create\s+(\S+\.(ts|tsx|js|jsx|py|go|rs))/i,
  ],
};

// =============================================
// Component Templates
// =============================================

/**
 * Standard decomposition templates for common component types
 */
export const COMPONENT_TEMPLATES: Record<string, ComponentTemplate> = {
  'react-component': {
    type: 'react-component',
    microTasks: [
      {
        description: 'Create TypeScript interface for component props',
        action: 'create',
        complexity: 'simple',
        dependsOn: [],
        estimatedLines: 10,
        contextHints: ['Define all required props', 'Use descriptive prop names'],
      },
      {
        description: 'Create empty component skeleton with props type',
        action: 'create',
        complexity: 'simple',
        dependsOn: ['types'],
        estimatedLines: 15,
        contextHints: ['Import props interface', 'Export default function'],
      },
      {
        description: 'Add JSX markup structure',
        action: 'add',
        complexity: 'simple',
        dependsOn: ['skeleton'],
        estimatedLines: 20,
        contextHints: ['Use semantic HTML', 'Add className for styling'],
      },
      {
        description: 'Add click handler for primary action',
        action: 'add',
        complexity: 'simple',
        dependsOn: ['markup'],
        estimatedLines: 8,
        contextHints: ['Single onClick handler', 'Use useCallback with deps array'],
      },
      {
        description: 'Add refresh handler with loading state',
        action: 'add',
        complexity: 'simple',
        dependsOn: ['markup'],
        estimatedLines: 10,
        contextHints: ['Async handler for data refresh', 'Toggle loading before/after'],
      },
      {
        description: 'Add loading state indicator',
        action: 'add',
        complexity: 'simple',
        dependsOn: ['markup'],
        estimatedLines: 8,
        contextHints: ['Show spinner when isLoading=true', 'Add conditional rendering'],
      },
      {
        description: 'Add error state display',
        action: 'add',
        complexity: 'simple',
        dependsOn: ['markup'],
        estimatedLines: 8,
        contextHints: ['Show error message when error exists', 'Add conditional rendering'],
      },
    ],
  },

  'react-hook': {
    type: 'react-hook',
    microTasks: [
      {
        description: 'Create TypeScript interface for hook return type',
        action: 'create',
        complexity: 'simple',
        dependsOn: [],
        estimatedLines: 8,
        contextHints: ['Include data, loading, error fields'],
      },
      {
        description: 'Create hook skeleton with useState',
        action: 'create',
        complexity: 'simple',
        dependsOn: ['types'],
        estimatedLines: 15,
        contextHints: ['Initialize state with defaults'],
      },
      {
        description: 'Add useEffect for data fetching',
        action: 'add',
        complexity: 'simple',
        dependsOn: ['skeleton'],
        estimatedLines: 15,
        contextHints: ['Include cleanup function', 'Handle abort signal'],
      },
      {
        description: 'Add error handling',
        action: 'add',
        complexity: 'simple',
        dependsOn: ['fetch'],
        estimatedLines: 10,
        contextHints: ['Catch and set error state'],
      },
    ],
  },

  'api-endpoint': {
    type: 'api-endpoint',
    microTasks: [
      {
        description: 'Create request/response TypeScript types',
        action: 'create',
        complexity: 'simple',
        dependsOn: [],
        estimatedLines: 12,
        contextHints: ['Define Request and Response interfaces'],
      },
      {
        description: 'Create route handler skeleton',
        action: 'create',
        complexity: 'simple',
        dependsOn: ['types'],
        estimatedLines: 10,
        contextHints: ['Export async handler function'],
      },
      {
        description: 'Add request validation',
        action: 'add',
        complexity: 'simple',
        dependsOn: ['skeleton'],
        estimatedLines: 15,
        contextHints: ['Validate required fields', 'Return 400 on invalid'],
      },
      {
        description: 'Add database/external query',
        action: 'add',
        complexity: 'moderate',
        dependsOn: ['validation'],
        estimatedLines: 20,
        contextHints: ['Use await for async operations'],
      },
      {
        description: 'Add error handling wrapper',
        action: 'add',
        complexity: 'simple',
        dependsOn: ['query'],
        estimatedLines: 10,
        contextHints: ['Catch and return { error: string }'],
      },
    ],
  },

  'typescript-fix': {
    type: 'typescript-fix',
    microTasks: [
      {
        description: 'Add missing type annotation',
        action: 'fix',
        complexity: 'simple',
        dependsOn: [],
        estimatedLines: 3,
        contextHints: ['Infer type from usage'],
      },
    ],
  },
};

// =============================================
// Analysis Functions
// =============================================

/**
 * Analyze a task description for atomicity
 *
 * @param taskDescription - The task description to analyze
 * @returns AtomicityAnalysis with violations and suggestions
 */
export function analyzeAtomicity(taskDescription: string): AtomicityAnalysis {
  const violations: AtomicityViolation[] = [];
  const violationDetails: string[] = [];

  // Check for multiple actions
  for (const pattern of NON_ATOMIC_PATTERNS.multipleActions) {
    if (pattern.test(taskDescription)) {
      violations.push('multiple_actions');
      violationDetails.push(`Contains multiple actions: "${taskDescription.match(pattern)?.[0]}"`);
      break;
    }
  }

  // Check for vague scope
  for (const pattern of NON_ATOMIC_PATTERNS.vagueScope) {
    if (pattern.test(taskDescription)) {
      violations.push('vague_scope');
      violationDetails.push(`Scope too vague: "${taskDescription.match(pattern)?.[0]}"`);
      break;
    }
  }

  // Check for multiple files
  for (const pattern of NON_ATOMIC_PATTERNS.multipleFiles) {
    if (pattern.test(taskDescription)) {
      violations.push('multiple_files');
      violationDetails.push(`Affects multiple files: "${taskDescription.match(pattern)?.[0]}"`);
      break;
    }
  }

  // Check for cross-dependencies
  for (const pattern of NON_ATOMIC_PATTERNS.crossDependency) {
    if (pattern.test(taskDescription)) {
      violations.push('cross_dependency');
      violationDetails.push(`Requires cross-component coordination: "${taskDescription.match(pattern)?.[0]}"`);
      break;
    }
  }

  // Estimate lines of code
  const estimatedLines = estimateLinesOfCode(taskDescription);
  if (estimatedLines > 50) {
    violations.push('too_many_lines');
    violationDetails.push(`Estimated ${estimatedLines} lines exceeds 50-line limit`);
  }

  // Calculate confidence
  const isAtomic = violations.length === 0;
  const confidence = isAtomic ? calculateAtomicConfidence(taskDescription) : 0.3;

  // Generate decomposition suggestions if not atomic
  const suggestedDecomposition = isAtomic ? [] : suggestDecomposition(taskDescription);

  return {
    isAtomic,
    confidence,
    violations,
    violationDetails,
    suggestedDecomposition,
    estimatedLines,
  };
}

/**
 * Calculate confidence score for atomic tasks
 */
function calculateAtomicConfidence(taskDescription: string): number {
  let confidence = 0.7; // Base confidence

  // Boost for single action patterns
  for (const pattern of ATOMIC_PATTERNS.singleAction) {
    if (pattern.test(taskDescription)) {
      confidence += 0.1;
      break;
    }
  }

  // Boost for single file scope
  for (const pattern of ATOMIC_PATTERNS.singleFile) {
    if (pattern.test(taskDescription)) {
      confidence += 0.1;
      break;
    }
  }

  // Boost for short descriptions (< 80 chars)
  if (taskDescription.length < 80) {
    confidence += 0.05;
  }

  // Boost for specific technical terms
  if (/interface|type|prop|function|method|class|import|export/.test(taskDescription)) {
    confidence += 0.05;
  }

  return Math.min(confidence, 0.95);
}

/**
 * Estimate lines of code for a task
 */
function estimateLinesOfCode(taskDescription: string): number {
  const lower = taskDescription.toLowerCase();

  // Simple tasks: 5-15 lines
  if (/^(add|create|fix)\s+(a\s+)?(type|interface|prop|field)/.test(lower)) {
    return 10;
  }

  // Component skeleton: 15-25 lines
  if (/skeleton|empty\s+component|basic\s+component/.test(lower)) {
    return 20;
  }

  // Markup/JSX: 20-40 lines
  if (/markup|jsx|html|template|structure/.test(lower)) {
    return 30;
  }

  // Hook/handler: 15-30 lines
  if (/hook|handler|event|callback/.test(lower)) {
    return 25;
  }

  // Full component: 100+ lines (too big)
  if (/^build\s+(a\s+)?component|^create\s+(the\s+)?page|^implement\s+feature/.test(lower)) {
    return 150;
  }

  // Default estimate
  return 35;
}

/**
 * Suggest micro-task decomposition for non-atomic tasks
 */
function suggestDecomposition(taskDescription: string): MicroTask[] {
  const lower = taskDescription.toLowerCase();

  // Detect component type
  if (/component|panel|grid|view|card|list|table|form/.test(lower)) {
    return generateMicroTasks('react-component', taskDescription);
  }

  if (/hook|useFetch|useQuery|use[A-Z]/.test(lower)) {
    return generateMicroTasks('react-hook', taskDescription);
  }

  if (/api|endpoint|route|handler/.test(lower)) {
    return generateMicroTasks('api-endpoint', taskDescription);
  }

  if (/typescript\s+error|type\s+error|fix\s+type/.test(lower)) {
    return generateMicroTasks('typescript-fix', taskDescription);
  }

  // Generic decomposition
  return generateGenericDecomposition(taskDescription);
}

/**
 * Generate micro-tasks from a template
 */
function generateMicroTasks(templateType: string, taskDescription: string): MicroTask[] {
  const template = COMPONENT_TEMPLATES[templateType];
  if (!template) {
    return generateGenericDecomposition(taskDescription);
  }

  // Extract component/feature name from description
  const nameMatch = taskDescription.match(/(?:build|create|implement|add)\s+(?:a\s+)?(\w+)/i);
  const componentName = nameMatch?.[1] || 'Feature';
  const basePath = `src/${templateType === 'api-endpoint' ? 'api' : 'components'}/${componentName}`;

  return template.microTasks.map((task, index) => ({
    ...task,
    id: `${componentName.toLowerCase()}-${index + 1}`,
    targetFile: getTargetFile(task, basePath, componentName),
    dependsOn: task.dependsOn.map(dep => `${componentName.toLowerCase()}-${getDepIndex(dep, template.microTasks) + 1}`),
  }));
}

/**
 * Get target file path for a micro-task
 */
function getTargetFile(
  task: Omit<MicroTask, 'id' | 'targetFile'>,
  basePath: string,
  componentName: string
): string {
  if (task.description.includes('interface') || task.description.includes('type')) {
    return `${basePath}/types.ts`;
  }
  if (task.description.includes('hook')) {
    return `${basePath}/use${componentName}.ts`;
  }
  if (task.description.includes('route') || task.description.includes('endpoint')) {
    return `${basePath}/route.ts`;
  }
  return `${basePath}/${componentName}.tsx`;
}

/**
 * Get dependency index from dependency name
 */
function getDepIndex(depName: string, tasks: Omit<MicroTask, 'id' | 'targetFile'>[]): number {
  const depMap: Record<string, number> = {
    types: 0,
    skeleton: 1,
    markup: 2,
    fetch: 2,
    validation: 2,
    query: 3,
  };
  return depMap[depName] ?? 0;
}

/**
 * Generate generic decomposition for unknown task types
 */
function generateGenericDecomposition(taskDescription: string): MicroTask[] {
  // Split on "and" if present
  const parts = taskDescription.split(/\s+and\s+/i);

  if (parts.length > 1) {
    return parts.map((part, index) => ({
      id: `task-${index + 1}`,
      description: part.trim(),
      targetFile: 'TBD',
      action: 'update' as const,
      complexity: 'simple' as const,
      dependsOn: index > 0 ? [`task-${index}`] : [],
      estimatedLines: 25,
      contextHints: ['Complete this single step'],
    }));
  }

  // Single vague task - suggest investigation first
  return [
    {
      id: 'task-1',
      description: `Identify the specific file and location for: ${taskDescription}`,
      targetFile: 'TBD',
      action: 'update',
      complexity: 'simple',
      dependsOn: [],
      estimatedLines: 0,
      contextHints: ['Read relevant files first'],
    },
    {
      id: 'task-2',
      description: `Make the minimal change to address: ${taskDescription}`,
      targetFile: 'TBD',
      action: 'update',
      complexity: 'simple',
      dependsOn: ['task-1'],
      estimatedLines: 30,
      contextHints: ['One file, one change'],
    },
  ];
}

// =============================================
// Decomposition Enforcement
// =============================================

/**
 * Force a task to be atomic by decomposing it
 *
 * @param taskDescription - Original task description
 * @param forceDecompose - Always decompose even if appears atomic
 * @returns Array of atomic micro-tasks
 */
export function enforceAtomicity(
  taskDescription: string,
  forceDecompose: boolean = false
): MicroTask[] {
  const analysis = analyzeAtomicity(taskDescription);

  if (analysis.isAtomic && !forceDecompose) {
    // Already atomic, return as single micro-task
    return [{
      id: 'task-1',
      description: taskDescription,
      targetFile: extractTargetFile(taskDescription),
      action: extractAction(taskDescription),
      complexity: 'simple',
      dependsOn: [],
      estimatedLines: analysis.estimatedLines,
      contextHints: [],
    }];
  }

  // Return suggested decomposition
  return analysis.suggestedDecomposition;
}

/**
 * Extract target file from task description
 */
function extractTargetFile(taskDescription: string): string {
  const fileMatch = taskDescription.match(/(\S+\.(ts|tsx|js|jsx|py|go|rs))/i);
  return fileMatch?.[1] || 'TBD';
}

/**
 * Extract action verb from task description
 */
function extractAction(taskDescription: string): MicroTask['action'] {
  const lower = taskDescription.toLowerCase();

  if (/^create|^add\s+new/.test(lower)) return 'create';
  if (/^add/.test(lower)) return 'add';
  if (/^fix|^resolve|^correct/.test(lower)) return 'fix';
  if (/^remove|^delete/.test(lower)) return 'remove';
  if (/^rename/.test(lower)) return 'rename';
  return 'update';
}

// =============================================
// Utility Functions
// =============================================

/**
 * Validate that a task description meets atomicity requirements
 * Throws error if not atomic
 *
 * @param taskDescription - Task to validate
 * @throws Error if task is not atomic
 */
export function requireAtomic(taskDescription: string): void {
  const analysis = analyzeAtomicity(taskDescription);

  if (!analysis.isAtomic) {
    const violations = analysis.violationDetails.join('; ');
    throw new Error(
      `Task is not atomic: ${violations}. ` +
      `Decompose into ${analysis.suggestedDecomposition.length} micro-tasks.`
    );
  }
}

/**
 * Get atomicity summary for logging
 */
export function getAtomicitySummary(analysis: AtomicityAnalysis): string {
  if (analysis.isAtomic) {
    return `Atomic (confidence: ${(analysis.confidence * 100).toFixed(0)}%, ~${analysis.estimatedLines} lines)`;
  }

  return `Non-atomic: ${analysis.violations.join(', ')} → decompose into ${analysis.suggestedDecomposition.length} micro-tasks`;
}
