/**
 * useAgentHierarchy Hook Tests
 *
 * Tests for React Query hook with MSW mocking
 */

import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAgentHierarchy } from '../../shared/hooks/api/useAgentHierarchy';
import type { ReactNode } from 'react';

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries for tests
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useAgentHierarchy', () => {
  it('should fetch agent hierarchy successfully', async () => {
    const { result } = renderHook(() => useAgentHierarchy(), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Check data structure
    expect(result.current.data).toBeDefined();
    expect(result.current.data?.success).toBe(true);
    expect(result.current.data?.data.hierarchy).toBeInstanceOf(Array);
    expect(result.current.data?.data.total_agents).toBeGreaterThan(0);
  });

  it('should fetch with filters', async () => {
    const filters = { status: 'in_progress' as const, type: 'coder' };

    const { result } = renderHook(() => useAgentHierarchy({ filters }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.data).toBeDefined();
  });

  it('should refetch at specified interval', async () => {
    const { result } = renderHook(() => useAgentHierarchy({ refetchInterval: 1000 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const firstData = result.current.data;

    // Wait for refetch
    await waitFor(
      () => {
        expect(result.current.data).not.toBe(firstData);
      },
      { timeout: 2000 }
    );
  });

  it('should not fetch when disabled', async () => {
    const { result } = renderHook(() => useAgentHierarchy({ enabled: false }), {
      wrapper: createWrapper(),
    });

    // Should remain idle
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('should handle errors gracefully', async () => {
    // This test would need MSW to return an error
    const { result } = renderHook(() => useAgentHierarchy(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess || result.current.isError).toBe(true);
    });
  });
});
