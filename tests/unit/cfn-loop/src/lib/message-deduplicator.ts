// Stub: message deduplicator
// Created to satisfy test imports

export interface DeduplicationResult {
  isDuplicate: boolean;
  originalId?: string;
}

export class MessageDeduplicator {
  private seen: Set<string> = new Set();

  checkDuplicate(messageId: string): DeduplicationResult {
    if (this.seen.has(messageId)) {
      return { isDuplicate: true, originalId: messageId };
    }

    this.seen.add(messageId);
    return { isDuplicate: false };
  }

  clear(): void {
    this.seen.clear();
  }
}
