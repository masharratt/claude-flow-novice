/**
 * CFN Loop Output Processor
 * Processes and aggregates agent outputs for consensus calculation
 */

export interface AgentOutput {
  agentId: string;
  output: any;
  metadata: {
    confidence?: number;
    executionTime?: number;
    success: boolean;
    errors?: string[];
  };
}

export interface ProcessedOutput {
  consensus: number;
  deliverables: string[];
  confidence: number;
  recommendations: string[];
  blockers: string[];
}

/**
 * Output Processor Class
 */
export class OutputProcessor {
  private outputs: AgentOutput[] = [];

  /**
   * Add agent output
   */
  addOutput(output: AgentOutput): void {
    this.outputs.push(output);
  }

  /**
   * Process all outputs and calculate consensus
   */
  async process(): Promise<ProcessedOutput> {
    if (this.outputs.length === 0) {
      throw new Error('No outputs to process');
    }

    // Calculate consensus based on confidence and success
    const consensus = this.calculateConsensus();

    // Extract deliverables from successful outputs
    const deliverables = this.extractDeliverables();

    // Aggregate confidence scores
    const confidence = this.aggregateConfidence();

    // Collect recommendations
    const recommendations = this.extractRecommendations();

    // Identify blockers
    const blockers = this.extractBlockers();

    return {
      consensus,
      deliverables,
      confidence,
      recommendations,
      blockers
    };
  }

  /**
   * Calculate consensus score
   */
  private calculateConsensus(): number {
    const successful = this.outputs.filter(o => o.metadata.success);
    if (successful.length === 0) return 0;

    // Weight by confidence
    const totalWeight = successful.reduce((sum, o) =>
      sum + (o.metadata.confidence || 0.5), 0);

    const maxPossible = successful.length;
    return totalWeight / maxPossible;
  }

  /**
   * Extract deliverables from outputs
   */
  private extractDeliverables(): string[] {
    const deliverables: string[] = [];

    for (const output of this.outputs) {
      if (!output.metadata.success) continue;

      // Look for deliverables in output structure
      if (output.output.deliverables) {
        deliverables.push(...output.output.deliverables);
      }

      // Look for file paths created
      if (output.output.filesCreated) {
        deliverables.push(...output.output.filesCreated);
      }
    }

    // Remove duplicates
    return [...new Set(deliverables)];
  }

  /**
   * Aggregate confidence scores
   */
  private aggregateConfidence(): number {
    const successful = this.outputs.filter(o => o.metadata.success);
    if (successful.length === 0) return 0;

    const totalConfidence = successful.reduce((sum, o) =>
      sum + (o.metadata.confidence || 0.5), 0);

    return totalConfidence / successful.length;
  }

  /**
   * Extract recommendations from outputs
   */
  private extractRecommendations(): string[] {
    const recommendations: string[] = [];

    for (const output of this.outputs) {
      if (output.output.recommendations) {
        recommendations.push(...output.output.recommendations);
      }

      if (output.output.nextSteps) {
        recommendations.push(...output.output.nextSteps);
      }
    }

    return [...new Set(recommendations)];
  }

  /**
   * Extract blockers from outputs
   */
  private extractBlockers(): string[] {
    const blockers: string[] = [];

    for (const output of this.outputs) {
      // Add explicit blockers
      if (output.output.blockers) {
        blockers.push(...output.output.blockers);
      }

      // Add errors as blockers
      if (output.metadata.errors) {
        blockers.push(...output.metadata.errors);
      }

      // Add failure reasons
      if (!output.metadata.success && output.output.failureReason) {
        blockers.push(output.output.failureReason);
      }
    }

    return [...new Set(blockers)];
  }

  /**
   * Clear all outputs
   */
  clear(): void {
    this.outputs = [];
  }

  /**
   * Get raw outputs
   */
  getOutputs(): AgentOutput[] {
    return [...this.outputs];
  }
}

// Export types
export type { AgentOutput, ProcessedOutput };