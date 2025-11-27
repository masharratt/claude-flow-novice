/**
 * MDAP Container Configuration Module
 *
 * Maps MDAP tiers (1-5) to container resource allocations and defines escalation
 * logic for handling OOM, timeout, and CPU throttling conditions.
 *
 * Tier 1: Minimal (testing, 256MB)
 * Tier 2: Standard (typical tasks, 512MB)
 * Tier 3: Heavy (complex workloads, 1GB)
 * Tier 4: Extra Heavy (stress tests, 2GB)
 * Tier 5: Maximum (enterprise, 4GB)
 *
 * @module mdap-container-config
 * @version 2.0.0
 */

import type { ModelTier } from './mdap-config.js';
import type { ContainerResult } from './docker-spawner.js';

// =============================================
// Type Definitions
// =============================================

/**
 * Container resource allocation for a specific tier
 */
export interface ContainerResources {
  /** Memory limit in human-readable format (e.g., "256m", "1g") */
  memory: string;
  /** Memory limit in bytes for byte-level comparisons */
  memoryBytes: number;
  /** CPU cores allocated (0.5, 1.0, 2.0, etc.) */
  cpus: number;
  /** Execution timeout in milliseconds */
  timeout: number;
  /** Maximum number of processes allowed */
  pidsLimit: number;
}

/**
 * Escalation trigger defines a condition that may warrant tier escalation
 */
export interface EscalationTrigger {
  /** Type of failure that triggers escalation */
  type: 'oom' | 'timeout' | 'cpu_throttle' | 'exit_code';
  /** Threshold value (percentage for timeout/cpu, exit code number for exit_code) */
  threshold?: number;
  /** Number of tiers to escalate (typically 1) */
  escalateBy: number;
}

/**
 * Complete MDAP container configuration including resources and escalation policy
 */
export interface MdapContainerConfig {
  /** Tier level (1-5) */
  tier: 1 | 2 | 3 | 4 | 5;
  /** Resource allocation for this tier */
  resources: ContainerResources;
  /** Escalation triggers and rules */
  escalationTriggers: EscalationTrigger[];
}

/**
 * Escalation decision result
 */
export interface EscalationDecision {
  /** Whether escalation should occur */
  shouldEscalate: boolean;
  /** New tier if escalating (current tier if not escalating) */
  newTier: number;
  /** Reason for escalation decision */
  reason: string;
}

/**
 * Exit codes with special handling
 */
const EXIT_CODES = {
  /** Out of memory kill signal */
  OOM: 137,
  /** Timeout command exit code */
  TIMEOUT: 124,
} as const;

/**
 * Container resource allocation for each tier
 *
 * Tier progression: 2x memory, 2x CPU (up to tier 3), longer timeout per tier
 * - Tier 1: Minimal resources for testing and simple tasks
 * - Tier 2: Moderate resources for standard tasks
 * - Tier 3: Higher resources for complex workloads
 * - Tier 4: Substantial resources for difficult tasks
 * - Tier 5: Maximum resources for critical enterprise tasks
 */
const TIER_RESOURCES: Record<1 | 2 | 3 | 4 | 5, ContainerResources> = {
  1: {
    memory: '256m',
    memoryBytes: 256 * 1024 * 1024,
    cpus: 0.5,
    timeout: 120_000, // 2 minutes
    pidsLimit: 50,
  },
  2: {
    memory: '512m',
    memoryBytes: 512 * 1024 * 1024,
    cpus: 1.0,
    timeout: 300_000, // 5 minutes
    pidsLimit: 100,
  },
  3: {
    memory: '1g',
    memoryBytes: 1024 * 1024 * 1024,
    cpus: 2.0,
    timeout: 600_000, // 10 minutes
    pidsLimit: 200,
  },
  4: {
    memory: '2g',
    memoryBytes: 2 * 1024 * 1024 * 1024,
    cpus: 4.0,
    timeout: 900_000, // 15 minutes
    pidsLimit: 300,
  },
  5: {
    memory: '4g',
    memoryBytes: 4 * 1024 * 1024 * 1024,
    cpus: 8.0,
    timeout: 1_800_000, // 30 minutes
    pidsLimit: 500,
  },
};

/**
 * Default escalation triggers for each tier
 *
 * Defines under which conditions a task should be escalated to the next tier.
 * Tier 5 has no triggers as it's the maximum tier.
 */
const DEFAULT_ESCALATION_TRIGGERS: Record<1 | 2 | 3 | 4 | 5, EscalationTrigger[]> = {
  1: [
    { type: 'oom', escalateBy: 1 },
    { type: 'timeout', escalateBy: 1 },
  ],
  2: [
    { type: 'oom', escalateBy: 1 },
    { type: 'timeout', escalateBy: 1 },
    { type: 'cpu_throttle', threshold: 80, escalateBy: 1 },
  ],
  3: [
    { type: 'oom', escalateBy: 1 },
    { type: 'timeout', escalateBy: 1 },
    { type: 'cpu_throttle', threshold: 80, escalateBy: 1 },
  ],
  4: [
    { type: 'oom', escalateBy: 1 },
    { type: 'timeout', escalateBy: 1 },
    { type: 'cpu_throttle', threshold: 85, escalateBy: 1 },
  ],
  5: [
    // Tier 5 is the maximum; no further escalation
  ],
};

// =============================================
// Public Functions - Core Tier Configuration
// =============================================

/**
 * Get container resources for a specific tier
 *
 * @param tier Tier level (1-5)
 * @returns Container resources configuration
 * @throws Error if tier is out of bounds
 */
export function getContainerResourcesForTier(tier: number): ContainerResources {
  if (tier < 1 || tier > 5) {
    throw new Error(`Invalid tier: ${tier}. Must be between 1 and 5.`);
  }

  return TIER_RESOURCES[tier as 1 | 2 | 3 | 4 | 5];
}

/**
 * Get complete container configuration for an MDAP tier
 *
 * Maps from a ModelTier (which represents an LLM capability tier)
 * to container resource allocation and escalation policy.
 *
 * @param mdapTier MDAP ModelTier object
 * @returns Complete container configuration for the tier
 * @throws Error if tier is invalid
 */
export function getContainerConfigForMdapTier(mdapTier: ModelTier): MdapContainerConfig {
  const tier = mdapTier.tier;

  if (tier < 1 || tier > 5) {
    throw new Error(`Invalid MDAP tier: ${tier}. Must be between 1 and 5.`);
  }

  return {
    tier,
    resources: TIER_RESOURCES[tier as 1 | 2 | 3 | 4 | 5],
    escalationTriggers: DEFAULT_ESCALATION_TRIGGERS[tier as 1 | 2 | 3 | 4 | 5],
  };
}

/**
 * Determine the next tier when escalating
 *
 * Calculates the new tier by summing escalation amounts from triggered conditions.
 * Caps the result at tier 5 (maximum).
 *
 * @param currentTier Current tier (1-5)
 * @param triggers Escalation triggers that have been activated
 * @returns New tier (capped at 5)
 */
export function calculateNextTier(currentTier: number, triggers: EscalationTrigger[]): number {
  let escalateBy = 0;

  for (const trigger of triggers) {
    escalateBy += trigger.escalateBy;
  }

  const nextTier = Math.min(currentTier + escalateBy, 5);
  return nextTier;
}

/**
 * Evaluate whether a container execution result should trigger escalation
 *
 * Analyzes exit codes, execution time, and other metrics to determine if
 * the current tier's resources are insufficient and escalation is needed.
 *
 * Exit code detection:
 *   - 137: OOM kill (memory exceeded)
 *   - 124: Timeout (execution time exceeded)
 *
 * Timeout detection:
 *   - durationMs >= configured timeout threshold
 *
 * @param result Container execution result
 * @param currentTier Current tier (1-5)
 * @returns Escalation decision with new tier and reason
 */
export function shouldEscalate(result: ContainerResult, currentTier: number): EscalationDecision {
  if (currentTier < 1 || currentTier > 5) {
    return {
      shouldEscalate: false,
      newTier: currentTier,
      reason: 'Invalid tier provided',
    };
  }

  const triggers: EscalationTrigger[] = [];
  const reasons: string[] = [];

  // Check for OOM (exit code 137)
  if (result.exitCode === EXIT_CODES.OOM) {
    triggers.push({ type: 'oom', escalateBy: 1 });
    reasons.push('Container killed due to out-of-memory (exit code 137)');
  }

  // Check for timeout (exit code 124 or duration exceeds limit)
  if (result.exitCode === EXIT_CODES.TIMEOUT) {
    triggers.push({ type: 'timeout', escalateBy: 1 });
    reasons.push('Container killed due to timeout (exit code 124)');
  } else {
    const tierConfig = getContainerResourcesForTier(currentTier);
    if (result.durationMs >= tierConfig.timeout) {
      triggers.push({ type: 'timeout', escalateBy: 1 });
      reasons.push(
        `Execution time (${result.durationMs}ms) exceeded tier ${currentTier} timeout (${tierConfig.timeout}ms)`
      );
    }
  }

  // Check for CPU throttle signals in stderr (common in Docker)
  // This is a heuristic check since we don't have direct cgroup stats
  if (result.stderr.includes('cpu throttle') || result.stderr.includes('cpu limit')) {
    triggers.push({ type: 'cpu_throttle', threshold: 80, escalateBy: 1 });
    reasons.push('CPU throttling detected in container output');
  }

  // If no triggers, no escalation needed
  if (triggers.length === 0) {
    return {
      shouldEscalate: false,
      newTier: currentTier,
      reason: 'No escalation triggers detected',
    };
  }

  // Calculate new tier and cap at 5
  const newTier = calculateNextTier(currentTier, triggers);
  const escalationNeeded = newTier > currentTier;

  if (!escalationNeeded) {
    return {
      shouldEscalate: false,
      newTier: currentTier,
      reason: 'Already at maximum tier',
    };
  }

  return {
    shouldEscalate: true,
    newTier,
    reason: `Escalating from tier ${currentTier} to tier ${newTier}: ${reasons.join('; ')}`,
  };
}

// =============================================
// Public Functions - Utility and Inspection
// =============================================

/**
 * Get escalation triggers for a specific tier
 *
 * @param tier Tier level (1-5)
 * @returns Array of escalation triggers for the tier
 * @throws Error if tier is out of bounds
 */
export function getEscalationTriggersForTier(tier: number): EscalationTrigger[] {
  if (tier < 1 || tier > 5) {
    throw new Error(`Invalid tier: ${tier}. Must be between 1 and 5.`);
  }

  return DEFAULT_ESCALATION_TRIGGERS[tier as 1 | 2 | 3 | 4 | 5];
}

/**
 * Check if a tier is at the maximum capacity
 *
 * @param tier Tier level (1-5)
 * @returns True if tier is 5 (maximum)
 */
export function isMaximumTier(tier: number): boolean {
  return tier === 5;
}

/**
 * Get human-readable description of tier resources
 *
 * @param tier Tier level (1-5)
 * @returns Description string
 * @throws Error if tier is out of bounds
 */
export function describeTierResources(tier: number): string {
  const resources = getContainerResourcesForTier(tier);
  return `Tier ${tier}: ${resources.memory} memory, ${resources.cpus} CPU, ${resources.timeout}ms timeout, max ${resources.pidsLimit} processes`;
}

/**
 * Validate tier value and clamp to valid range
 *
 * @param tier Tier value to validate
 * @returns Validated tier (1-5), defaults to 2 if undefined
 */
export function validateTier(tier: number | undefined): number {
  if (tier === undefined) {
    return 2; // Default to tier 2
  }

  return Math.max(1, Math.min(5, Math.floor(tier)));
}

/**
 * Get tier name for display
 *
 * @param tier Tier number (1-5)
 * @returns Human-readable tier name
 */
export function getTierName(tier: number): string {
  const tierNames: Record<number, string> = {
    1: 'Minimal (Testing)',
    2: 'Standard',
    3: 'Heavy',
    4: 'Extra Heavy',
    5: 'Maximum (Enterprise)',
  };

  return tierNames[Math.max(1, Math.min(5, tier))] || 'Unknown';
}

/**
 * Extract memory peak usage from container logs/stderr
 *
 * Docker stats typically appear in container stderr with format:
 * "Memory: 256.5 MB" or similar patterns
 *
 * @param result Container execution result
 * @returns Peak memory usage in bytes (null if cannot be extracted)
 */
export function extractMemoryPeak(result: ContainerResult): number | null {
  // Try to parse memory info from stderr or stdout
  const output = result.stderr || result.stdout;

  // Look for patterns like "Memory: 256.5 MB" or "memory=256MB"
  const memoryMatch = output.match(/memory[:\s=]+([0-9.]+)\s*(?:gb|mb|kb|b)?/i);
  if (memoryMatch) {
    const value = parseFloat(memoryMatch[1]);
    if (!isNaN(value)) {
      // Assume MB if no unit specified
      return Math.round(value * 1024 * 1024);
    }
  }

  return null;
}

/**
 * Extract CPU time from container logs
 *
 * Docker stats may include CPU info. This is a placeholder for actual
 * CPU time extraction from container runtime statistics.
 *
 * @param result Container execution result
 * @returns CPU time in milliseconds (null if cannot be extracted)
 */
export function extractCpuTime(result: ContainerResult): number | null {
  // Try to parse CPU info from stderr or stdout
  const output = result.stderr || result.stdout;

  // Look for patterns like "CPU: 1234ms" or "cpu=1234"
  const cpuMatch = output.match(/cpu[:\s=]+([0-9.]+)\s*(?:ms|s)?/i);
  if (cpuMatch) {
    const value = parseFloat(cpuMatch[1]);
    if (!isNaN(value)) {
      return Math.round(value);
    }
  }

  return null;
}

/**
 * Calculate memory usage percentage based on peak usage and limit
 *
 * @param peakMemoryBytes Peak memory used in bytes
 * @param limitBytes Memory limit in bytes
 * @returns Usage percentage (0-100)
 */
export function calculateMemoryUsagePercent(
  peakMemoryBytes: number | null,
  limitBytes: number
): number {
  if (peakMemoryBytes === null || limitBytes <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((peakMemoryBytes / limitBytes) * 100));
}
