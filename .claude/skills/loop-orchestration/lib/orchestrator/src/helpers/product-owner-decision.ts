/**
 * Product Owner Decision Parser
 *
 * Migrated from execute-decision.sh (v3.1.0)
 *
 * Purpose: Parse Product Owner decision output and validate deliverables
 *
 * Three parsing patterns supported:
 * 1. Structured: "Decision: PROCEED"
 * 2. Unstructured: "PROCEED" anywhere in text
 * 3. Case-insensitive: "proceed" or "PROCEED"
 */

export interface ProductOwnerDecisionInput {
  taskId: string;
  iteration: number;
  maxIterations: number;
  consensus: number;
  threshold: number;
  successCriteria?: string;
  loop2Feedback?: string;
  taskContext?: string;
  timeout?: number; // seconds, default 60
}

export interface ProductOwnerDecision {
  decision: 'PROCEED' | 'ITERATE' | 'ABORT';
  reasoning: string;
  confidence: number;
  auditAnalysis?: string;
  agentPerformance?: string;
  timestamp: number;
  iteration: number;
  consensus: number;
  threshold: number;
  deliverableVerificationRequired: boolean;
  deliverableVerificationPassed?: boolean;
}

export interface ProductOwnerOutput {
  rawOutput: string;
  exitCode: number;
  timedOut: boolean;
}

/**
 * Parse Product Owner decision from agent output
 *
 * Supports three parsing patterns:
 * - Pattern 1: "Decision: PROCEED"
 * - Pattern 2: "PROCEED" (standalone)
 * - Pattern 3: "proceed" (case-insensitive)
 */
export function parseProductOwnerDecision(
  output: ProductOwnerOutput,
  input: ProductOwnerDecisionInput
): ProductOwnerDecision {
  const { rawOutput, exitCode, timedOut } = output;
  const { iteration, consensus, threshold } = input;

  // Handle timeout
  if (timedOut || exitCode === 124) {
    return {
      decision: 'ABORT',
      reasoning: `Product Owner decision timeout after ${input.timeout || 60}s`,
      confidence: 0.0,
      timestamp: Date.now(),
      iteration,
      consensus,
      threshold,
      deliverableVerificationRequired: false
    };
  }

  // Parse decision using three fallback patterns
  let decisionType: 'PROCEED' | 'ITERATE' | 'ABORT' | null = null;

  // Pattern 1: Structured format "Decision: PROCEED"
  const structuredMatch = rawOutput.match(/Decision:\s*(PROCEED|ITERATE|ABORT)/i);
  if (structuredMatch?.[1]) {
    decisionType = structuredMatch[1].toUpperCase() as 'PROCEED' | 'ITERATE' | 'ABORT';
  }

  // Pattern 2: Standalone decision keyword (first occurrence)
  if (!decisionType) {
    const standaloneMatch = rawOutput.match(/\b(PROCEED|ITERATE|ABORT)\b/);
    if (standaloneMatch) {
      decisionType = standaloneMatch[1] as 'PROCEED' | 'ITERATE' | 'ABORT';
    }
  }

  // Pattern 3: Case-insensitive search
  if (!decisionType) {
    const caseInsensitiveMatch = rawOutput.match(/\b(proceed|iterate|abort)\b/i);
    if (caseInsensitiveMatch?.[1]) {
      decisionType = caseInsensitiveMatch[1].toUpperCase() as 'PROCEED' | 'ITERATE' | 'ABORT';
    }
  }

  // Default to ABORT if parsing fails
  if (!decisionType) {
    return {
      decision: 'ABORT',
      reasoning: 'Failed to parse Product Owner decision from output',
      confidence: 0.0,
      timestamp: Date.now(),
      iteration,
      consensus,
      threshold,
      deliverableVerificationRequired: false
    };
  }

  // Parse reasoning
  const reasoningMatch = rawOutput.match(/Reasoning:\s*(.+?)(?=\n[A-Z]|$)/s);
  const reasoning = reasoningMatch?.[1]?.trim() ?? 'No reasoning provided';

  // Parse confidence
  const confidenceMatch = rawOutput.match(/Confidence:\s*([0-9]+\.?[0-9]*)/);
  const confidence = confidenceMatch?.[1] ? parseFloat(confidenceMatch[1]) : 0.85;

  // Parse audit analysis (optional)
  const auditAnalysisMatch = rawOutput.match(/Audit Analysis:\s*(.+?)(?=\n[A-Z]|$)/s);
  const agentPerfMatch = rawOutput.match(/Agent Performance:\s*(.+?)(?=\n[A-Z]|$)/s);

  const result: ProductOwnerDecision = {
    decision: decisionType,
    reasoning,
    confidence,
    timestamp: Date.now(),
    iteration,
    consensus,
    threshold,
    deliverableVerificationRequired: decisionType === 'PROCEED'
  };

  // Add optional fields only if they exist
  if (auditAnalysisMatch?.[1]) {
    result.auditAnalysis = auditAnalysisMatch[1].trim();
  }
  if (agentPerfMatch?.[1]) {
    result.agentPerformance = agentPerfMatch[1].trim();
  }

  return result;
}

/**
 * Verify deliverables exist when decision is PROCEED
 *
 * Prevents "consensus on vapor" anti-pattern
 *
 * Checks:
 * - Task requires implementation (keywords: create, build, implement, generate)
 * - Git status shows file changes
 *
 * Returns: true if deliverables verified, false otherwise
 */
export async function verifyDeliverables(
  taskContext: string
): Promise<{ verified: boolean; filesChanged: number; message: string }> {
  const { execSync } = await import('child_process');

  // Check if task requires implementation
  const requiresImplementation = /\b(create|build|implement|generate|write|add)\b/i.test(taskContext);

  if (!requiresImplementation) {
    return {
      verified: true,
      filesChanged: 0,
      message: 'Task does not require implementation (planning/documentation only)'
    };
  }

  // Check git status for file changes
  try {
    const gitStatus = execSync('git status --short', { encoding: 'utf-8' });
    const filesChanged = gitStatus.split('\n').filter(line => /^(A|M|\?\?)/.test(line)).length;

    if (filesChanged === 0) {
      return {
        verified: false,
        filesChanged: 0,
        message: 'No deliverables created despite implementation task (consensus on plans only)'
      };
    }

    return {
      verified: true,
      filesChanged,
      message: `Deliverables verified: ${filesChanged} files changed`
    };
  } catch (error) {
    // If git command fails, assume no verification needed
    return {
      verified: true,
      filesChanged: 0,
      message: 'Git verification skipped (not a git repository or error)'
    };
  }
}

/**
 * Override PROCEED to ITERATE if deliverables missing
 *
 * Implements deliverable verification logic from execute-decision.sh
 */
export async function applyDeliverableVerification(
  decision: ProductOwnerDecision,
  taskContext: string
): Promise<ProductOwnerDecision> {
  if (decision.decision !== 'PROCEED' || !decision.deliverableVerificationRequired) {
    return decision;
  }

  const verification = await verifyDeliverables(taskContext);

  if (!verification.verified) {
    return {
      ...decision,
      decision: 'ITERATE',
      reasoning: `Override PROCEED → ITERATE: ${verification.message}. Validators approved plans without actual code.`,
      confidence: 0.70,
      deliverableVerificationPassed: false
    };
  }

  return {
    ...decision,
    deliverableVerificationPassed: true
  };
}

/**
 * Extract deferred items from Product Owner output
 *
 * Looks for sections: "Out of Scope", "Deferred", "Future Work", "Defer:"
 * Returns list of items to add to backlog
 */
export function extractDeferredItems(output: string): string[] {
  const deferredItems: string[] = [];

  // Find deferred section
  const deferredSectionMatch = output.match(
    /(?:out of scope|deferred|future work|defer:).{0,1000}/is
  );

  if (!deferredSectionMatch) {
    return deferredItems;
  }

  const deferredSection = deferredSectionMatch[0];

  // Extract bullet points (lines starting with -, *, or •)
  const bulletPoints = deferredSection.match(/^\s*[-*•]\s*(.+)$/gm);

  if (!bulletPoints) {
    return deferredItems;
  }

  for (const line of bulletPoints) {
    const item = line.replace(/^\s*[-*•]\s*/, '').trim();

    // Skip empty lines, section headers, and very short items
    if (
      item.length >= 10 &&
      !/^(out of scope|deferred|future work)/i.test(item)
    ) {
      deferredItems.push(item);
    }
  }

  return deferredItems;
}

/**
 * Build enhanced Product Owner context with audit insights
 *
 * Replicates context building from execute-decision.sh
 */
export function buildProductOwnerContext(input: ProductOwnerDecisionInput): string {
  const {
    iteration,
    maxIterations,
    consensus,
    threshold,
    successCriteria,
    loop2Feedback,
    taskContext
  } = input;

  return `
You are the Product Owner making a strategic decision for CFN Loop iteration ${iteration} of ${maxIterations}.

CURRENT ITERATION DATA:
Loop 2 Consensus: ${consensus}
Threshold: ${threshold}
Success Criteria: ${successCriteria || 'Not specified'}

Loop 2 Feedback:
${loop2Feedback || 'No feedback provided'}

Task Context:
${taskContext || 'No context provided'}

DECISION OPTIONS:
- PROCEED: Quality threshold met, deliverables complete
- ITERATE: Improvements needed, iterations remaining
- ABORT: Max iterations reached or systematic failure

Output format:
Decision: PROCEED|ITERATE|ABORT
Reasoning: [your explanation]
Confidence: [0.0-1.0]
`.trim();
}
