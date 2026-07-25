// Stub: checkpoint manager
// Created to satisfy test imports

export interface Checkpoint {
  id: string;
  name: string;
  state: unknown;
  createdAt: Date;
}

export class CheckpointManager {
  private checkpoints: Map<string, Checkpoint> = new Map();

  async createCheckpoint(name: string, state: unknown): Promise<Checkpoint> {
    const checkpoint: Checkpoint = {
      id: `checkpoint-${Date.now()}`,
      name,
      state,
      createdAt: new Date(),
    };
    this.checkpoints.set(checkpoint.id, checkpoint);
    return checkpoint;
  }

  async restoreCheckpoint(checkpointId: string): Promise<unknown> {
    const checkpoint = this.checkpoints.get(checkpointId);
    return checkpoint?.state;
  }

  async listCheckpoints(): Promise<Checkpoint[]> {
    return Array.from(this.checkpoints.values());
  }

  async deleteCheckpoint(checkpointId: string): Promise<void> {
    this.checkpoints.delete(checkpointId);
  }
}
