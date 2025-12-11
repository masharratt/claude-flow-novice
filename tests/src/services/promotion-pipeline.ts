// Stub: promotion pipeline service
// Created to satisfy test imports

export interface PipelineStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
}

export class PromotionPipeline {
  private stages: Map<string, PipelineStage> = new Map();

  async execute(skillName: string): Promise<void> {
    // Stub implementation
  }

  async getStage(name: string): Promise<PipelineStage | undefined> {
    return this.stages.get(name);
  }

  async listStages(): Promise<PipelineStage[]> {
    return Array.from(this.stages.values());
  }
}
