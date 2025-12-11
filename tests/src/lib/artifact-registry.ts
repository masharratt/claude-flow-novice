// Stub: artifact registry
// Created to satisfy test imports

export interface Artifact {
  id: string;
  name: string;
  version: string;
  type: string;
  path: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface ArtifactQuery {
  name?: string;
  type?: string;
  version?: string;
}

export class ArtifactRegistry {
  private artifacts: Map<string, Artifact> = new Map();

  async register(artifact: Omit<Artifact, 'id' | 'createdAt'>): Promise<Artifact> {
    const fullArtifact: Artifact = {
      ...artifact,
      id: `artifact-${Date.now()}`,
      createdAt: new Date(),
    };
    this.artifacts.set(fullArtifact.id, fullArtifact);
    return fullArtifact;
  }

  async get(id: string): Promise<Artifact | undefined> {
    return this.artifacts.get(id);
  }

  async query(query: ArtifactQuery): Promise<Artifact[]> {
    return Array.from(this.artifacts.values()).filter((artifact) => {
      if (query.name && artifact.name !== query.name) return false;
      if (query.type && artifact.type !== query.type) return false;
      if (query.version && artifact.version !== query.version) return false;
      return true;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.artifacts.delete(id);
  }
}

export const registry = new ArtifactRegistry();
