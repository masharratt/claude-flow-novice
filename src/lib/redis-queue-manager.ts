// Stub: Redis queue manager
// Created to satisfy test imports

export interface QueueOptions {
  maxRetries?: number;
  retryDelay?: number;
}

export interface QueueItem<T = unknown> {
  id: string;
  data: T;
  retries: number;
  createdAt: Date;
}

export class RedisQueueManager {
  private queue: QueueItem[] = [];

  async enqueue<T>(data: T): Promise<string> {
    const item: QueueItem<T> = {
      id: `item-${Date.now()}`,
      data,
      retries: 0,
      createdAt: new Date(),
    };
    this.queue.push(item);
    return item.id;
  }

  async dequeue<T>(): Promise<QueueItem<T> | null> {
    const item = this.queue.shift();
    return (item as QueueItem<T>) || null;
  }

  async size(): Promise<number> {
    return this.queue.length;
  }

  async clear(): Promise<void> {
    this.queue = [];
  }
}
