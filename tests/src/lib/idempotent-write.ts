// Stub: idempotent write
// Created to satisfy test imports

export interface WriteOptions {
  checksum?: string;
  force?: boolean;
}

export class IdempotentWriter {
  private writes: Map<string, string> = new Map();

  async write(path: string, content: string, options?: WriteOptions): Promise<boolean> {
    const existing = this.writes.get(path);

    if (existing === content && !options?.force) {
      // Already written with same content
      return false;
    }

    this.writes.set(path, content);
    return true;
  }

  async hasBeenWritten(path: string, content: string): Promise<boolean> {
    return this.writes.get(path) === content;
  }
}
