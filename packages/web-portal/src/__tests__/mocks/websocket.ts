import { vi } from 'vitest';
import type { Socket } from 'socket.io-client';

export class MockSocket {
  private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  public connected = false;
  public id = 'mock-socket-id';

  on(event: string, callback: (...args: any[]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
    return this;
  }

  off(event: string, callback?: (...args: any[]) => void) {
    if (callback) {
      this.listeners.get(event)?.delete(callback);
    } else {
      this.listeners.delete(event);
    }
    return this;
  }

  emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((callback) => callback(...args));
    return this;
  }

  connect() {
    this.connected = true;
    this.emit('connect');
    return this;
  }

  disconnect() {
    this.connected = false;
    this.emit('disconnect');
    return this;
  }

  removeAllListeners(event?: string) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}

export const createMockSocket = (): Socket => {
  return new MockSocket() as unknown as Socket;
};

export const mockSocketIO = {
  connect: vi.fn(() => createMockSocket()),
  Socket: MockSocket,
};
