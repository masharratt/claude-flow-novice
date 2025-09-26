/**
 * Agent Type Validation and Fallback System
 * Prevents swarm coordination gaps by validating agent types before spawning
 */

import {
  isValidAgentType,
  resolveLegacyAgentType,
  getAvailableAgentTypes,
  searchAgents,
  getAgent
} from './agent-loader.js';

export interface AgentValidationResult {
  isValid: boolean;
  resolvedType: string;
  originalType: string;
  fallbackUsed: boolean;
  warnings: string[];
}

export interface AgentCapabilityMap {
  [key: string]: string[];
}

// Expected capabilities for common invalid agent types
const CAPABILITY_EXPECTATIONS: AgentCapabilityMap = {
  'analyst': ['code-analysis', 'debugging', 'pattern-detection'],
  'consensus-builder': ['consensus-algorithms', 'distributed-decision-making', 'agreement-protocols'],
  'monitor': ['monitoring', 'metrics', 'performance-tracking'],
  'coordinator': ['task-orchestration', 'coordination', 'workflow-management'],
  'optimizer': ['performance-optimization', 'bottleneck-analysis', 'efficiency'],
  'documenter': ['documentation', 'api-docs', 'technical-writing'],
  'specialist': ['domain-expertise', 'specialized-knowledge', 'advanced-analysis'],
  'architect': ['system-design', 'architecture', 'high-level-design']
};

// Primary fallback mapping for common invalid types
const FALLBACK_MAPPING: { [key: string]: string } = {
  'analyst': 'code-analyzer',
  'consensus-builder': 'byzantine-coordinator',
  'monitor': 'performance-benchmarker',
  'coordinator': 'hierarchical-coordinator',
  'optimizer': 'perf-analyzer',
  'documenter': 'api-docs',
  'specialist': 'system-architect',
  'architect': 'system-architect'
};

/**
 * Comprehensive agent type validation with intelligent fallbacks
 */
export class AgentValidator {
  private validationCache = new Map<string, AgentValidationResult>();
  private cacheExpiry = 300000; // 5 minutes
  private lastCacheUpdate = 0;

  /**
   * Validate agent type and provide fallbacks if needed
   */
  async validateAgentType(type: string): Promise<AgentValidationResult> {
    const cacheKey = type.toLowerCase();

    // Check cache first
    if (this.validationCache.has(cacheKey) && this.isCacheValid()) {
      return this.validationCache.get(cacheKey)!;
    }

    const result = await this.performValidation(type);

    // Cache result
    this.validationCache.set(cacheKey, result);
    this.lastCacheUpdate = Date.now();

    return result;
  }

  /**
   * Perform the actual validation logic
   */
  private async performValidation(type: string): Promise<AgentValidationResult> {
    const originalType = type;
    const warnings: string[] = [];

    // Step 1: Check if type is directly valid
    const isDirectlyValid = await isValidAgentType(type);
    if (isDirectlyValid) {
      return {
        isValid: true,
        resolvedType: type,
        originalType,
        fallbackUsed: false,
        warnings: []
      };
    }

    // Step 2: Try legacy mapping
    const legacyResolved = resolveLegacyAgentType(type);
    if (legacyResolved !== type) {
      const isLegacyValid = await isValidAgentType(legacyResolved);
      if (isLegacyValid) {
        warnings.push(`Agent type '${type}' is deprecated. Using '${legacyResolved}' instead.`);
        return {
          isValid: true,
          resolvedType: legacyResolved,
          originalType,
          fallbackUsed: true,
          warnings
        };
      }
    }

    // Step 3: Try direct fallback mapping
    const directFallback = FALLBACK_MAPPING[type.toLowerCase()];
    if (directFallback) {
      const isFallbackValid = await isValidAgentType(directFallback);
      if (isFallbackValid) {
        warnings.push(`Agent type '${type}' not found. Using '${directFallback}' as fallback.`);
        return {
          isValid: true,
          resolvedType: directFallback,
          originalType,
          fallbackUsed: true,
          warnings
        };
      }
    }

    // Step 4: Capability-based matching
    const capabilityFallback = await this.findCapabilityBasedFallback(type);
    if (capabilityFallback) {
      warnings.push(`Agent type '${type}' not found. Using '${capabilityFallback}' based on capability matching.`);
      return {
        isValid: true,
        resolvedType: capabilityFallback,
        originalType,
        fallbackUsed: true,
        warnings
      };
    }

    // Step 5: Fuzzy matching
    const fuzzyFallback = await this.findFuzzyMatch(type);
    if (fuzzyFallback) {
      warnings.push(`Agent type '${type}' not found. Using '${fuzzyFallback}' as closest match.`);
      return {
        isValid: true,
        resolvedType: fuzzyFallback,
        originalType,
        fallbackUsed: true,
        warnings
      };
    }

    // Step 6: Ultimate fallback to researcher
    warnings.push(`Agent type '${type}' not found. Using 'researcher' as default fallback.`);
    return {
      isValid: true,
      resolvedType: 'researcher',
      originalType,
      fallbackUsed: true,
      warnings
    };
  }

  /**
   * Find fallback based on expected capabilities
   */
  private async findCapabilityBasedFallback(type: string): Promise<string | null> {
    const expectedCapabilities = CAPABILITY_EXPECTATIONS[type.toLowerCase()];
    if (!expectedCapabilities) {
      return null;
    }

    // Search for agents with matching capabilities
    for (const capability of expectedCapabilities) {
      const matchingAgents = await searchAgents(capability);
      if (matchingAgents.length > 0) {
        return matchingAgents[0].name;
      }
    }

    return null;
  }

  /**
   * Find closest agent name using fuzzy matching
   */
  private async findFuzzyMatch(type: string): Promise<string | null> {
    const availableTypes = await getAvailableAgentTypes();
    const lowerType = type.toLowerCase();

    // Look for partial matches
    for (const availableType of availableTypes) {
      const lowerAvailable = availableType.toLowerCase();

      // Check if either contains the other
      if (lowerAvailable.includes(lowerType) || lowerType.includes(lowerAvailable)) {
        return availableType;
      }
    }

    // Look for similar words
    for (const availableType of availableTypes) {
      if (this.calculateSimilarity(type, availableType) > 0.6) {
        return availableType;
      }
    }

    return null;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }
    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // insertion
          matrix[j - 1][i] + 1, // deletion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    return (maxLength - matrix[str2.length][str1.length]) / maxLength;
  }

  /**
   * Get detailed information about available agent types
   */
  async getAgentTypeInfo(): Promise<{ available: string[], legacy: string[], missing: string[] }> {
    const availableTypes = await getAvailableAgentTypes();
    const legacyTypes = Object.keys(FALLBACK_MAPPING);
    const missingTypes: string[] = [];

    // Check which legacy types don't resolve to valid agents
    for (const legacyType of legacyTypes) {
      const resolved = resolveLegacyAgentType(legacyType);
      const isValid = await isValidAgentType(resolved);
      if (!isValid) {
        missingTypes.push(legacyType);
      }
    }

    return {
      available: availableTypes,
      legacy: legacyTypes,
      missing: missingTypes
    };
  }

  /**
   * Validate multiple agent types in batch
   */
  async validateAgentTypes(types: string[]): Promise<Map<string, AgentValidationResult>> {
    const results = new Map<string, AgentValidationResult>();

    // Process in parallel for better performance
    const validationPromises = types.map(async (type) => {
      const result = await this.validateAgentType(type);
      return [type, result] as const;
    });

    const validationResults = await Promise.all(validationPromises);

    for (const [type, result] of validationResults) {
      results.set(type, result);
    }

    return results;
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.validationCache.clear();
    this.lastCacheUpdate = 0;
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() - this.lastCacheUpdate < this.cacheExpiry;
  }
}

// Singleton instance
export const agentValidator = new AgentValidator();

// Convenience functions
export const validateAgentType = (type: string) => agentValidator.validateAgentType(type);
export const validateAgentTypes = (types: string[]) => agentValidator.validateAgentTypes(types);
export const getAgentTypeInfo = () => agentValidator.getAgentTypeInfo();
export const clearValidationCache = () => agentValidator.clearCache();