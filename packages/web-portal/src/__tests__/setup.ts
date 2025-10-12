/**
 * Vitest Setup File
 *
 * Global test setup including MSW, React Query, and testing utilities
 */

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { server } from './mocks/api';

// Mock socket.io-client to prevent WebSocket connection attempts in tests
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    const mockSocket = {
      on: vi.fn(function(this: any) { return this; }),
      once: vi.fn(function(this: any) { return this; }),
      off: vi.fn(function(this: any) { return this; }),
      emit: vi.fn(function(this: any) { return this; }),
      connect: vi.fn(function(this: any) { return this; }),
      disconnect: vi.fn(function(this: any) { return this; }),
      connected: false,
      disconnected: true,
      id: 'mock-socket-id',
      removeListener: vi.fn(function(this: any) { return this; }),
      removeAllListeners: vi.fn(function(this: any) { return this; })
    };
    return mockSocket;
  })
}));

// Mock web-components package to prevent loading heavy UI library during tests
vi.mock('@claude-flow-novice/web-components', () => ({
  AgentHierarchyTree: () => null,
  StatusMonitor: () => null,
  PerformanceCharts: () => null,
  EventTimeline: () => null,
  AlertsPanel: () => null,
}));

// Setup MSW server
beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'bypass' // Changed from 'warn' to prevent hanging on unhandled requests
  });
}, 10000);
afterEach(() => {
  server.resetHandlers();
  cleanup();
  localStorage.clear();
});
afterAll(() => {
  server.close();
}, 10000);

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// Suppress console errors in tests (unless explicitly needed)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
        args[0].includes('Not implemented: HTMLFormElement.prototype.submit'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
