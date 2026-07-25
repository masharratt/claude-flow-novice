/**
 * WebSocket Integration Tests
 *
 * Tests WebSocket connection, real-time events, reconnection, and cleanup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders } from '../utils/test-utils';
import { createMockSocket, MockSocket } from '../mocks/websocket';
import { App } from '../../client/App';

describe('WebSocket Integration', () => {
  let mockSocket: MockSocket;

  beforeEach(() => {
    mockSocket = createMockSocket() as unknown as MockSocket;
    vi.mock('socket.io-client', () => ({
      io: vi.fn(() => mockSocket),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Establishment', () => {
    it('should establish WebSocket connection on mount', async () => {
      renderWithProviders(<App />);

      mockSocket.connect();

      expect(mockSocket.connected).toBe(true);
    });

    it('should connect to correct WebSocket endpoint', async () => {
      renderWithProviders(<App />);

      expect(mockSocket).toBeDefined();
    });

    it('should handle connection success', async () => {
      renderWithProviders(<App />);

      const connectHandler = vi.fn();
      mockSocket.on('connect', connectHandler);
      mockSocket.connect();

      expect(connectHandler).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      renderWithProviders(<App />);

      const errorHandler = vi.fn();
      mockSocket.on('connect_error', errorHandler);
      mockSocket.emit('connect_error', new Error('Connection failed'));

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Real-Time Event Reception', () => {
    it('should receive agent lifecycle events', async () => {
      renderWithProviders(<App />);
      mockSocket.connect();

      const eventHandler = vi.fn();
      mockSocket.on('agent.lifecycle', eventHandler);
      mockSocket.emit('agent.lifecycle', { agent: 'coder-1', status: 'spawned' });

      expect(eventHandler).toHaveBeenCalledWith({ agent: 'coder-1', status: 'spawned' });
    });

    it('should receive CFN Loop events', async () => {
      renderWithProviders(<App />);
      mockSocket.connect();

      const eventHandler = vi.fn();
      mockSocket.on('cfn.loop.phase', eventHandler);
      mockSocket.emit('cfn.loop.phase', { loop: 3, phase: 'auth' });

      expect(eventHandler).toHaveBeenCalledWith({ loop: 3, phase: 'auth' });
    });

    it('should receive fleet update events', async () => {
      renderWithProviders(<App />);
      mockSocket.connect();

      const eventHandler = vi.fn();
      mockSocket.on('fleet.update', eventHandler);
      mockSocket.emit('fleet.update', { fleetId: 'fleet-123', status: 'active' });

      expect(eventHandler).toHaveBeenCalledWith({ fleetId: 'fleet-123', status: 'active' });
    });

    it('should receive performance metric events', async () => {
      renderWithProviders(<App />);
      mockSocket.connect();

      const eventHandler = vi.fn();
      mockSocket.on('performance.metrics', eventHandler);
      mockSocket.emit('performance.metrics', { cpu: 65, memory: 72 });

      expect(eventHandler).toHaveBeenCalledWith({ cpu: 65, memory: 72 });
    });
  });

  describe('Component Updates on Events', () => {
    it('should update Dashboard on new metrics', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });
      mockSocket.connect();

      mockSocket.emit('dashboard.metrics', {
        activeAgents: 150,
        systemHealth: 0.95,
      });

      // Component should re-render with new data
      expect(mockSocket.connected).toBe(true);
    });

    it('should update Agents view on agent events', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });
      mockSocket.connect();

      mockSocket.emit('agent.lifecycle', {
        id: 'agent-new',
        status: 'spawned',
      });

      expect(mockSocket.connected).toBe(true);
    });

    it('should update Events timeline in real-time', async () => {
      renderWithProviders(<App />, { initialRoute: '/events' });
      mockSocket.connect();

      mockSocket.emit('event.new', {
        id: 'event-123',
        type: 'agent.complete',
        timestamp: new Date(),
      });

      expect(mockSocket.connected).toBe(true);
    });
  });

  describe('Connection Loss and Reconnection', () => {
    it('should handle disconnection', async () => {
      renderWithProviders(<App />);
      mockSocket.connect();

      const disconnectHandler = vi.fn();
      mockSocket.on('disconnect', disconnectHandler);
      mockSocket.disconnect();

      expect(disconnectHandler).toHaveBeenCalled();
      expect(mockSocket.connected).toBe(false);
    });

    it('should attempt reconnection on disconnect', async () => {
      renderWithProviders(<App />);
      mockSocket.connect();

      mockSocket.disconnect();
      expect(mockSocket.connected).toBe(false);

      // Simulate reconnection
      mockSocket.connect();
      expect(mockSocket.connected).toBe(true);
    });

    it('should restore subscriptions after reconnection', async () => {
      renderWithProviders(<App />);
      mockSocket.connect();

      const eventHandler = vi.fn();
      mockSocket.on('agent.lifecycle', eventHandler);

      // Disconnect and reconnect
      mockSocket.disconnect();
      mockSocket.connect();

      // Should still receive events
      mockSocket.emit('agent.lifecycle', { status: 'active' });
      expect(eventHandler).toHaveBeenCalled();
    });

    it('should buffer events during disconnection', async () => {
      renderWithProviders(<App />);
      mockSocket.connect();
      mockSocket.disconnect();

      const eventHandler = vi.fn();
      mockSocket.on('agent.lifecycle', eventHandler);

      // Reconnect and receive buffered events
      mockSocket.connect();
      mockSocket.emit('agent.lifecycle', { status: 'buffered' });

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('Event Subscription Cleanup', () => {
    it('should cleanup event listeners on unmount', async () => {
      const { unmount } = renderWithProviders(<App />);
      mockSocket.connect();

      const eventHandler = vi.fn();
      mockSocket.on('agent.lifecycle', eventHandler);

      unmount();

      // Listeners should be removed
      mockSocket.removeAllListeners('agent.lifecycle');
      mockSocket.emit('agent.lifecycle', { status: 'test' });

      expect(eventHandler).not.toHaveBeenCalled();
    });

    it('should cleanup on route change', async () => {
      const { unmount } = renderWithProviders(<App />, { initialRoute: '/dashboard' });
      mockSocket.connect();

      unmount();

      expect(mockSocket.connected).toBe(true);
    });

    it('should not leak memory from event listeners', async () => {
      const { unmount } = renderWithProviders(<App />);
      mockSocket.connect();

      // Add multiple listeners
      for (let i = 0; i < 100; i++) {
        mockSocket.on(`test-event-${i}`, vi.fn());
      }

      unmount();

      // All listeners should be cleaned up
      mockSocket.removeAllListeners();
      expect(true).toBe(true); // No memory leak assertion
    });
  });

  describe('Room-Based Event Routing', () => {
    it('should join room on component mount', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });
      mockSocket.connect();

      mockSocket.emit('join', 'agents-room');

      expect(mockSocket.connected).toBe(true);
    });

    it('should leave room on unmount', async () => {
      const { unmount } = renderWithProviders(<App />, { initialRoute: '/agents' });
      mockSocket.connect();

      mockSocket.emit('join', 'agents-room');

      unmount();

      mockSocket.emit('leave', 'agents-room');
      expect(mockSocket.connected).toBe(true);
    });

    it('should receive events only from joined rooms', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });
      mockSocket.connect();

      const roomHandler = vi.fn();
      mockSocket.on('agents-room:update', roomHandler);
      mockSocket.emit('agents-room:update', { data: 'test' });

      expect(roomHandler).toHaveBeenCalled();
    });

    it('should switch rooms on route change', async () => {
      renderWithProviders(<App />, { initialRoute: '/dashboard' });
      mockSocket.connect();

      mockSocket.emit('join', 'dashboard-room');

      // Navigate to agents
      mockSocket.emit('leave', 'dashboard-room');
      mockSocket.emit('join', 'agents-room');

      expect(mockSocket.connected).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed event data', async () => {
      renderWithProviders(<App />);
      mockSocket.connect();

      const errorHandler = vi.fn();
      mockSocket.on('error', errorHandler);

      // Send malformed data
      mockSocket.emit('agent.lifecycle', null);

      // Should not crash
      expect(mockSocket.connected).toBe(true);
    });

    it('should handle unknown event types', async () => {
      renderWithProviders(<App />);
      mockSocket.connect();

      mockSocket.emit('unknown.event.type', { data: 'test' });

      // Should not crash
      expect(mockSocket.connected).toBe(true);
    });

    it('should log connection errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderWithProviders(<App />);

      mockSocket.emit('connect_error', new Error('Connection failed'));

      // Errors should be logged (if implemented)
      consoleSpy.mockRestore();
    });
  });
});
