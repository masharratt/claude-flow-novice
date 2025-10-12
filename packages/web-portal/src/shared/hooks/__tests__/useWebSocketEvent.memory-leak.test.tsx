/**
 * Memory Leak Test for useWebSocketEvent Hook
 * Tests that subscriptions are properly cleaned up on component unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useWebSocketEvent } from '../useWebSocketEvent';
import { useWebSocket } from '../useWebSocket';

// Mock the useWebSocket hook
vi.mock('../useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

describe('useWebSocketEvent - Memory Leak Prevention', () => {
  let mockUnsubscribe: ReturnType<typeof vi.fn>;
  let mockSubscribe: ReturnType<typeof vi.fn>;
  let mockWebSocket: any;

  beforeEach(() => {
    // Create mock unsubscribe function
    mockUnsubscribe = vi.fn();

    // Create mock subscribe function that returns unsubscribe
    mockSubscribe = vi.fn(() => mockUnsubscribe);

    // Mock WebSocket implementation
    mockWebSocket = {
      isConnected: true,
      subscribe: mockSubscribe,
      send: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    (useWebSocket as any).mockReturnValue(mockWebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should cleanup subscription on component unmount', () => {
    const handler = vi.fn();

    // Render the hook
    const { unmount } = renderHook(() =>
      useWebSocketEvent('test:event', handler)
    );

    // Verify subscription was created
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledWith('test:event', expect.any(Function));

    // Unmount to trigger cleanup
    unmount();

    // CRITICAL: Verify unsubscribe was called to prevent memory leak
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('should cleanup subscription when eventType changes', () => {
    const handler = vi.fn();

    // Render the hook with initial eventType
    const { rerender } = renderHook(
      ({ eventType }) => useWebSocketEvent(eventType, handler),
      { initialProps: { eventType: 'event:one' } }
    );

    // Verify initial subscription
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledWith('event:one', expect.any(Function));

    // Change the eventType to trigger cleanup and new subscription
    rerender({ eventType: 'event:two' });

    // Verify old subscription was cleaned up
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);

    // Verify new subscription was created
    expect(mockSubscribe).toHaveBeenCalledTimes(2);
    expect(mockSubscribe).toHaveBeenCalledWith('event:two', expect.any(Function));
  });

  it('should cleanup debounce timeout on unmount', () => {
    vi.useFakeTimers();
    const handler = vi.fn();

    // Render hook with debounce option
    const { unmount } = renderHook(() =>
      useWebSocketEvent('test:event', handler, { debounceMs: 500 })
    );

    // Get the event handler that was registered
    const eventHandler = mockSubscribe.mock.calls[0][1];

    // Trigger event to start debounce timer
    eventHandler({ test: 'data' });

    // Unmount before debounce completes
    unmount();

    // Fast-forward time to after debounce would complete
    vi.advanceTimersByTime(600);

    // Handler should NOT be called because component unmounted
    expect(handler).not.toHaveBeenCalled();

    // Verify unsubscribe was called
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should not leak memory with multiple mount/unmount cycles', () => {
    const handler = vi.fn();

    // Simulate 10 mount/unmount cycles
    for (let i = 0; i < 10; i++) {
      const { unmount } = renderHook(() =>
        useWebSocketEvent('test:event', handler)
      );
      unmount();
    }

    // Verify subscriptions were created and cleaned up for each cycle
    expect(mockSubscribe).toHaveBeenCalledTimes(10);
    expect(mockUnsubscribe).toHaveBeenCalledTimes(10);
  });

  it('should handle unsubscribe being null or undefined gracefully', () => {
    const handler = vi.fn();

    // Mock subscribe to return null instead of function
    mockWebSocket.subscribe = vi.fn(() => null);

    // This should not throw an error
    const { unmount } = renderHook(() =>
      useWebSocketEvent('test:event', handler)
    );

    expect(() => unmount()).not.toThrow();
  });

  it('should cleanup subscription even if not connected', () => {
    const handler = vi.fn();

    // Mock disconnected state
    mockWebSocket.isConnected = false;

    const { unmount } = renderHook(() =>
      useWebSocketEvent('test:event', handler)
    );

    // Subscription should not be created when disconnected
    expect(mockSubscribe).not.toHaveBeenCalled();

    // Unmount should not throw
    expect(() => unmount()).not.toThrow();
  });

  it('should call external handler when event is received', () => {
    const handler = vi.fn();

    renderHook(() =>
      useWebSocketEvent('test:event', handler)
    );

    // Get the internal event handler
    const eventHandler = mockSubscribe.mock.calls[0][1];

    // Trigger event
    const testData = { message: 'test data' };
    eventHandler(testData);

    // Verify external handler was called
    expect(handler).toHaveBeenCalledWith(testData);
  });

  it('should apply filter before calling handler', () => {
    const handler = vi.fn();
    const filter = vi.fn((data: any) => data.value > 5);

    renderHook(() =>
      useWebSocketEvent('test:event', handler, { filter })
    );

    const eventHandler = mockSubscribe.mock.calls[0][1];

    // Event that passes filter
    eventHandler({ value: 10 });
    expect(handler).toHaveBeenCalledWith({ value: 10 });

    // Event that fails filter
    eventHandler({ value: 3 });
    expect(handler).toHaveBeenCalledTimes(1); // Still only 1 call
  });

  it('should apply transform before calling handler', () => {
    const handler = vi.fn();
    const transform = vi.fn((data: any) => ({ ...data, transformed: true }));

    renderHook(() =>
      useWebSocketEvent('test:event', handler, { transform })
    );

    const eventHandler = mockSubscribe.mock.calls[0][1];

    eventHandler({ value: 10 });

    expect(handler).toHaveBeenCalledWith({ value: 10, transformed: true });
  });
});
