import { readFile, stat } from 'fs/promises';
import {
  TransitionContext,
  CFNTransitionPoint, // Keep to prevent lint error
  INJECTION_CONFIG,
} from './transition-points.js';

/**
 * Injects CFN Loop rules and context information into a template at specific transition points
 *
 * This function retrieves CFN Loop rules from a configuration file and generates
 * a formatted markdown string with context, decision reminders, and iteration history.
 *
 * @param {TransitionContext} context - The current context of the CFN Loop
 * @returns {Promise<string>} A markdown-formatted string with injected rules and context
 * @throws {Error} If unable to read CFN Loop rules or process the context
 */
export async function injectCFNRulesAtTransition(
  context: TransitionContext
): Promise<string> {
  const cfnRules = await readFile('.claude/cfn-loop-rules.md', 'utf-8');
  const config = INJECTION_CONFIG[context.point];
  if (!config) {
    throw new Error(
      `No configuration found for transition point: ${context.point}`
    );
  }

  let injected = `
## CFN LOOP RULES (AUTO-INJECTED at ${context.point})

${cfnRules}

---

## CURRENT CONTEXT

- **Mode**: ${context.mode.toUpperCase()}
- **Phase**: ${context.phaseId}
- **Iteration**: ${context.iteration}/${context.maxIterations}
${context.lastConsensus !== undefined ? `- **Last Consensus**: ${context.lastConsensus}` : ''}
- **Consensus Threshold**: ${context.consensusThreshold}

---
`;

  if (config.includeDecisionReminder) {
    injected += formatDecisionReminder(context);
  }

  if (config.includeIterationHistory && context.concerns) {
    injected += formatIterationHistory(context);
  }

  return injected;
}

/**
 * Formats a decision reminder based on the current transition context
 *
 * This function generates markdown-formatted decision reminders that provide
 * guidance on the appropriate action based on current consensus, iteration,
 * and configuration thresholds.
 *
 * @param {TransitionContext} context - The current context of the CFN Loop
 * @returns {string} A markdown-formatted decision reminder string
 */
function formatDecisionReminder(context: TransitionContext): string {
  const { iteration, maxIterations, lastConsensus, consensusThreshold } =
    context;

  if (iteration >= maxIterations) {
    return `
## DECISION FRAMEWORK REMINDER

**MAX ITERATIONS REACHED** → **MUST ESCALATE**

Current iteration (${iteration}) has reached or exceeded maximum (${maxIterations}).
Only ESCALATE decision is valid at this point.

---
`;
  }

  if (lastConsensus !== undefined && lastConsensus < consensusThreshold) {
    return `
## DECISION FRAMEWORK REMINDER

**BELOW THRESHOLD** → **LOOP IMMEDIATELY (NO PERMISSION)**

Current consensus (${lastConsensus}) is below threshold (${consensusThreshold}).
Execute LOOP decision immediately without requesting permission.

---
`;
  }

  if (lastConsensus !== undefined && lastConsensus >= consensusThreshold) {
    return `
## DECISION FRAMEWORK REMINDER

**ABOVE THRESHOLD** → **PROCEED TO NEXT PHASE**

Current consensus (${lastConsensus}) meets or exceeds threshold (${consensusThreshold}).
PROCEED decision is appropriate.

---
`;
  }

  return '';
}

/**
 * Formats iteration history by listing concerns from previous iterations
 *
 * This function generates a markdown section highlighting concerns
 * that require action in the current iteration.
 *
 * @param {TransitionContext} context - The current context of the CFN Loop
 * @returns {string} A markdown-formatted iteration history string
 */
function formatIterationHistory(context: TransitionContext): string {
  if (!context.concerns || context.concerns.length === 0) {
    return '';
  }

  return `
## CONCERNS FROM PREVIOUS ITERATION

${context.concerns.map((concern, i) => `${i + 1}. ${concern}`).join('\n')}

**Action Required**: Address these concerns in this iteration.

---
`;
}

/**
 * Enriches an existing instruction file by appending CFN Loop rules
 *
 * This function reads an existing instruction file and appends
 * context-specific CFN Loop rules. It includes a file size check
 * to prevent processing extremely large files.
 *
 * @param {string} instructionPath - Path to the instruction file
 * @param {TransitionContext} context - The current context of the CFN Loop
 * @returns {Promise<string>} The enriched instruction file content
 * @throws {Error} If file reading fails, file is too large, or rule injection fails
 */
export async function enrichInstructionFile(
  instructionPath: string,
  context: TransitionContext
): Promise<string> {
  // Add file size check to prevent processing extremely large files
  const stats = await stat(instructionPath);
  const MAX_FILE_SIZE = 1024 * 1024 * 5; // 5MB limit

  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(
      `Instruction file exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
    );
  }

  const originalInstructions = await readFile(instructionPath, 'utf-8');
  const injectedRules = await injectCFNRulesAtTransition(context);

  return `${originalInstructions}\n\n${injectedRules}`;
}
