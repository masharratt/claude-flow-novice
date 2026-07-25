/**
 * Mock for socket.io-client to prevent WebSocket connections in tests
 */
import { vi } from 'vitest';

export const io = vi.fn(() => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
  id: 'mock-socket-id'
}));
