// Stub: atomic file writer
// Created to satisfy test imports

import { promises as fs } from 'fs';
import { dirname, join } from 'path';

export interface WriteOptions {
  encoding?: BufferEncoding;
  mode?: number;
  backup?: boolean;
}

export class AtomicFileWriter {
  async write(path: string, content: string, options?: WriteOptions): Promise<void> {
    // Stub implementation - write to temp file then rename
    const tempPath = `${path}.tmp`;
    const encoding = options?.encoding || 'utf-8';

    try {
      await fs.writeFile(tempPath, content, encoding);
      await fs.rename(tempPath, path);
    } catch (error) {
      // Cleanup temp file on error
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  async writeJson(path: string, data: unknown, options?: WriteOptions): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await this.write(path, content, options);
  }
}
