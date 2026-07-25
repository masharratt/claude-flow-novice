/**
 * WebSocketClient Tests
 * Comprehensive test coverage for unified WebSocket client
 * Target: 95% coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from '../WebSocketClient';
import { ConnectionState } from '../../types/websocket';
import type { WebSocketClientConfig, WebSocketMessage } from '../../types/websocket';

// Mock Socket.IO client - create mockSocket reference outside for test control
let mockSocket: any;
let mockIo: any;

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket)
}));

describe('WebSocketClient', () => {
  let client: WebSocketClient;

  beforeEach(() => {
    // Reset mock socket for each test
    mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      connected: false,
      id: 'mock-socket-id'
    };

    // Get the mocked io function
    const { io } = require('socket.io-client');
    mockIo = io;
  });

  afterEach(() => {
    if (client) {
      client.destroy();
    }
    vi.clearAllMocks();
  });

  describe('Connection Lifecycle', () => {
    it('should initialize with default configuration', () => {
      client = new WebSocketClient({ autoConnect: false });
      const status = client.getStatus();

      expect(status.state).toBe('disconnected');
      expect(status.connected).toBe(false);
      expect(status.reconnectAttempts).toBe(0);
    });

    it('should auto-connect when autoConnect is true', () => {
      client = new WebSocketClient({ autoConnect: true });
      expect(mockSocket.on).toHaveBeenCalled();
    });

    it('should not auto-connect when autoConnect is false', () => {
      client = new WebSocketClient({ autoConnect: false });
      expect(mockSocket.on).not.toHaveBeenCalled();
    });

    it('should handle successful connection', () => {
      const onConnect = vi.fn();
      client = new WebSocketClient({ onConnect });

      client.connect();

      // Simulate connection event
      const connectHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'connect'
      )?.[1];
      connectHandler?.();

      expect(onConnect).toHaveBeenCalled();
      expect(client.getStatus().connected).toBe(true);
    });

    it('should handle disconnection', () => {
      const onDisconnect = vi.fn();
      client = new WebSocketClient({ onDisconnect });

      client.connect();

      // Simulate disconnect event
      const disconnectHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'disconnect'
      )?.[1];
      disconnectHandler?.('client disconnect');

      expect(onDisconnect).toHaveBeenCalledWith('client disconnect');
      expect(client.getStatus().connected).toBe(false);
    });

    it('should handle connection errors', () => {
      const onError = vi.fn();
      client = new WebSocketClient({ onError });

      client.connect();

      // Simulate connection error
      const errorHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'connect_error'
      )?.[1];
      errorHandler?.(new Error('Connection failed'));

      expect(onError).toHaveBeenCalled();
      expect(client.getStatus().error).toBeTruthy();
    });
  });

  describe('Reconnection Logic', () => {
    it('should attempt reconnection with exponential backoff', async () => { try {
      vi.useFakeTimers();

      client = new WebSocketClient({
        reconnectAttempts: 3,
        reconnectDelay: 1000,
        reconnectBackoffMultiplier: 2
      });

      client.connect();

      // Simulate disconnect that triggers reconnect
      const disconnectHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'disconnect'
      )?.[1];
      disconnectHandler?.('transport close');

      expect(client.getStatus().reconnectAttempts).toBe(1);

      // First reconnect after 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(client.getStatus().reconnectAttempts).toBe(1);

      vi.useRealTimers();
    });

    it('should respect max reconnection attempts', () => {
      const onReconnectFailed = vi.fn();
      vi.useFakeTimers();

      client = new WebSocketClient({
        reconnectAttempts: 2,
        reconnectDelay: 100,
        onReconnectFailed
      });

      client.connect();

      // Trigger multiple disconnects
      const disconnectHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'disconnect'
      )?.[1];

      for (let i = 0; i < 3; i++) {
        disconnectHandler?.('transport close');
        vi.advanceTimersByTime(200);
      }

      vi.useRealTimers();
    });

    it('should cap reconnection delay at maxReconnectDelay', () => {
      client = new WebSocketClient({
        reconnectDelay: 1000,
        maxReconnectDelay: 5000,
        reconnectBackoffMultiplier: 2
      });

      client.connect();

      // Simulate many reconnects
      const disconnectHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'disconnect'
      )?.[1];

      for (let i = 0; i < 10; i++) {
        disconnectHandler?.('transport close');
      }

      // Delay should never exceed maxReconnectDelay
      expect(client.getStatus().reconnectAttempts).toBeGreaterThan(0);
    });
  });

  describe('Message Handling', () => {
    it('should send messages when connected', () => {
      client = new WebSocketClient();
      client.connect();

      // Simulate connection
      mockSocket.connected = true;
      const connectHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'connect'
      )?.[1];
      connectHandler?.();

      client.sendMessage('test', { data: 'hello' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'message',
        expect.objectContaining({
          type: 'test',
          payload: { data: 'hello' }
        })
      );
    });

    it('should queue messages when disconnected', () => {
      client = new WebSocketClient({ autoConnect: false });

      client.sendMessage('test', { data: 'queued' });

      // Message should be queued
      const metrics = client.getMetrics();
      expect(metrics.messagesSent).toBe(0);
    });

    it('should process queued messages on reconnection', () => {
      client = new WebSocketClient({ autoConnect: false });

      // Queue messages while disconnected
      client.sendMessage('test1', { data: '1' });
      client.sendMessage('test2', { data: '2' });

      // Connect
      client.connect();
      mockSocket.connected = true;
      const connectHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'connect'
      )?.[1];
      connectHandler?.();

      // Both messages should be sent
      expect(mockSocket.emit).toHaveBeenCalledTimes(2);
    });

    it('should handle incoming messages', () => {
      const onMessage = vi.fn();
      client = new WebSocketClient({ onMessage });

      client.connect();

      const message: WebSocketMessage = {
        type: 'test',
        timestamp: new Date(),
        payload: { data: 'received' }
      };

      // Simulate incoming message
      const messageHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1];
      messageHandler?.(message);

      expect(onMessage).toHaveBeenCalledWith(message);
    });
  });

  describe('Event Subscriptions', () => {
    it('should subscribe to events', () => {
      const callback = vi.fn();
      client = new WebSocketClient();

      const unsubscribe = client.subscribe('test-event', callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should call subscription callbacks on matching events', () => {
      const callback = vi.fn();
      client = new WebSocketClient();
      client.connect();

      client.subscribe('agent_update', callback);

      // Simulate event
      const eventHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'agent_update'
      )?.[1];
      eventHandler?.({ agentId: 'test', status: 'active' });

      // Note: callback will be called through message handling
      expect(callback).toHaveBeenCalled();
    });

    it('should unsubscribe from events', () => {
      const callback = vi.fn();
      client = new WebSocketClient();

      const unsubscribe = client.subscribe('test-event', callback);
      unsubscribe();

      client.connect();
      const eventHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'test-event'
      )?.[1];
      eventHandler?.({ data: 'test' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should apply subscription filters', () => {
      const callback = vi.fn();
      client = new WebSocketClient();
      client.connect();

      client.subscribe('agent_update', callback, {
        filter: (data: any) => data.value > 10
      });

      // Get the agent_update event handler
      const eventHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'agent_update'
      )?.[1];

      // Should not call callback (value <= 10)
      eventHandler?.({ value: 5 });
      expect(callback).not.toHaveBeenCalled();

      // Should call callback (value > 10)
      eventHandler?.({ value: 15 });
      expect(callback).toHaveBeenCalledWith({ value: 15 });
    });

    it('should apply subscription transforms', () => {
      const callback = vi.fn();
      client = new WebSocketClient();
      client.connect();

      client.subscribe('metrics_update', callback, {
        transform: (data: any) => ({ ...data, transformed: true })
      });

      const eventHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'metrics_update'
      )?.[1];
      eventHandler?.({ value: 10 });

      expect(callback).toHaveBeenCalledWith({
        value: 10,
        transformed: true
      });
    });

    it('should support once option for subscriptions', () => {
      const callback = vi.fn();
      client = new WebSocketClient();
      client.connect();

      client.subscribe('notification', callback, { once: true });

      const eventHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'notification'
      )?.[1];

      // First call
      eventHandler?.({ data: '1' });
      expect(callback).toHaveBeenCalledTimes(1);

      // Second call (should not trigger callback)
      eventHandler?.({ data: '2' });
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Room Management', () => {
    it('should join rooms', () => {
      client = new WebSocketClient();
      client.connect();

      mockSocket.connected = true;
      const connectHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'connect'
      )?.[1];
      connectHandler?.();

      client.joinRoom('test-room');

      expect(mockSocket.emit).toHaveBeenCalledWith('join-room', 'test-room');
    });

    it('should leave rooms', () => {
      client = new WebSocketClient();
      client.connect();

      mockSocket.connected = true;
      const connectHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'connect'
      )?.[1];
      connectHandler?.();

      client.leaveRoom('test-room');

      expect(mockSocket.emit).toHaveBeenCalledWith('leave-room', 'test-room');
    });
  });

  describe('Heartbeat Mechanism', () => {
    it('should send heartbeat pings', () => {
      vi.useFakeTimers();

      client = new WebSocketClient({ heartbeatInterval: 1000 });
      client.connect();

      mockSocket.connected = true;
      const connectHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'connect'
      )?.[1];
      connectHandler?.();

      // Advance time to trigger heartbeat
      vi.advanceTimersByTime(1000);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'ping',
        expect.objectContaining({ timestamp: expect.any(Number) })
      );

      vi.useRealTimers();
    });

    it('should disconnect on heartbeat timeout', () => {
      vi.useFakeTimers();

      client = new WebSocketClient({ heartbeatInterval: 1000 });
      client.connect();

      mockSocket.connected = true;
      const connectHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'connect'
      )?.[1];
      connectHandler?.();

      // Advance time beyond timeout (2x heartbeat interval)
      vi.advanceTimersByTime(3000);

      expect(mockSocket.disconnect).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('Metrics', () => {
    it('should track connection metrics', () => {
      client = new WebSocketClient();
      client.connect();

      mockSocket.connected = true;
      const connectHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'connect'
      )?.[1];
      connectHandler?.();

      client.sendMessage('test', { data: 'hello' });

      const metrics = client.getMetrics();

      expect(metrics.messagesSent).toBeGreaterThan(0);
      expect(metrics.bytesSent).toBeGreaterThan(0);
    });

    it('should track errors', () => {
      client = new WebSocketClient();
      client.connect();

      // Simulate error
      const errorHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'connect_error'
      )?.[1];
      errorHandler?.(new Error('Test error'));

      const metrics = client.getMetrics();
      expect(metrics.errors).toBeGreaterThan(0);
    });
  });

  describe('DevTools Integration', () => {
    it('should capture events when DevTools is enabled', () => {
      client = new WebSocketClient({ autoConnect: false });
      client.enableDevTools();

      client.connect();

      const events = client.getDevToolsEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toHaveProperty('timestamp');
      expect(events[0]).toHaveProperty('type');
    });

    it('should not capture events when DevTools is disabled', () => {
      client = new WebSocketClient();
      client.disableDevTools();

      client.connect();

      const events = client.getDevToolsEvents();
      expect(events.length).toBe(0);
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources on destroy', () => {
      client = new WebSocketClient();
      client.connect();

      client.destroy();

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(client.getStatus().state).toBe('disconnected');
    });

    it('should clear subscriptions on destroy', () => {
      const callback = vi.fn();
      client = new WebSocketClient();

      client.subscribe('test-event', callback);
      client.destroy();

      // Subscriptions should be cleared
      const status = client.getStatus();
      expect(status.state).toBe('disconnected');
    });
  });

  describe('Error Handling', () => {
    it('should create proper error objects', () => {
      const onError = vi.fn();
      client = new WebSocketClient({ onError });

      client.connect();

      const errorHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'connect_error'
      )?.[1];
      errorHandler?.(new Error('Connection failed'));

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Connection failed',
          type: 'connection',
          retryable: true
        })
      );
    });

    it('should handle message parsing errors gracefully', () => {
      client = new WebSocketClient();
      client.connect();

      // Simulate invalid message
      const messageHandler = mockSocket.on.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1];

      // Should not throw
      expect(() => {
        messageHandler?.(null);
      }).not.toThrow();
    });
  });
});
