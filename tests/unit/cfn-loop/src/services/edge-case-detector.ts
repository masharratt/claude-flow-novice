// Stub: edge case detector service
// Created to satisfy test imports

export interface DetectedEdgeCase {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  location?: string;
}

export class EdgeCaseDetector {
  async detect(code: string): Promise<DetectedEdgeCase[]> {
    // Stub implementation
    return [];
  }

  async detectInFile(filePath: string): Promise<DetectedEdgeCase[]> {
    // Stub implementation
    return [];
  }
}
