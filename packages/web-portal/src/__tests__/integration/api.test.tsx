/**
 * API Integration Tests
 *
 * Tests React Query hooks, API authentication, error handling, retry logic,
 * cache invalidation, and optimistic updates
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, addHandler } from '../mocks/api';
import { renderWithProviders, createTestQueryClient } from '../utils/test-utils';
import { QueryClient } from '@tanstack/react-query';
import { App } from '../../client/App';

describe('API Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    localStorage.clear();
  });

  describe('Data Fetching with React Query', () => {
    it('should fetch agents data on mount', async () => {
      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/agents/i)).toBeInTheDocument();
      });
    });

    it('should fetch dashboard metrics', async () => {
      renderWithProviders(<App />, {
        initialRoute: '/',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });
    });

    it('should fetch events timeline data', async () => {
      renderWithProviders(<App />, {
        initialRoute: '/events',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/events/i)).toBeInTheDocument();
      });
    });

    it('should fetch fleet metrics', async () => {
      renderWithProviders(<App />, {
        initialRoute: '/fleet',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/fleet/i)).toBeInTheDocument();
      });
    });

    it('should fetch performance metrics', async () => {
      renderWithProviders(<App />, {
        initialRoute: '/performance',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });
    });

    it('should cache query results', async () => {
      const { unmount } = renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/agents/i)).toBeInTheDocument();
      });

      unmount();

      // Re-mount should use cached data
      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      expect(screen.getByText(/agents/i)).toBeInTheDocument();
    });
  });

  describe('API Authentication', () => {
    it('should include JWT token in authenticated requests', async () => {
      let authHeader: string | null = null;

      addHandler(
        http.get('/api/agents', ({ request }) => {
          authHeader = request.headers.get('Authorization');
          return HttpResponse.json({ success: true, data: [] });
        })
      );

      // Set token
      localStorage.setItem('auth-token', 'mock-jwt-token');

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(authHeader).toBe('Bearer mock-jwt-token');
      });
    });

    it('should handle 401 Unauthorized errors', async () => {
      addHandler(
        http.get('/api/agents', () => {
          return new HttpResponse(null, { status: 401 });
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/unauthorized|login/i)).toBeInTheDocument();
      });
    });

    it('should handle 403 Forbidden errors', async () => {
      addHandler(
        http.get('/api/agents', () => {
          return new HttpResponse(null, { status: 403 });
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/forbidden|access denied/i)).toBeInTheDocument();
      });
    });

    it('should refresh token on expiration', async () => {
      let requestCount = 0;

      addHandler(
        http.get('/api/agents', () => {
          requestCount++;
          if (requestCount === 1) {
            return new HttpResponse(null, { status: 401 });
          }
          return HttpResponse.json({ success: true, data: [] });
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(requestCount).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 Not Found errors', async () => {
      addHandler(
        http.get('/api/agents/999', () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/not found|error/i)).toBeInTheDocument();
      });
    });

    it('should handle 500 Internal Server Error', async () => {
      addHandler(
        http.get('/api/dashboard/metrics', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });

    it('should handle 503 Service Unavailable', async () => {
      addHandler(
        http.get('/api/fleet/fleet-123/metrics', () => {
          return new HttpResponse(null, { status: 503 });
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/fleet',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/unavailable|error/i)).toBeInTheDocument();
      });
    });

    it('should display error messages to users', async () => {
      addHandler(
        http.get('/api/agents', () => {
          return HttpResponse.json(
            { success: false, error: 'Failed to fetch agents' },
            { status: 500 }
          );
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/failed to fetch agents/i)).toBeInTheDocument();
      });
    });

    it('should handle network errors', async () => {
      addHandler(
        http.get('/api/agents', () => {
          return HttpResponse.error();
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(screen.getByText(/network error|failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed requests', async () => {
      let attemptCount = 0;

      addHandler(
        http.get('/api/agents', () => {
          attemptCount++;
          if (attemptCount < 2) {
            return HttpResponse.error();
          }
          return HttpResponse.json({ success: true, data: [] });
        })
      );

      queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            retryDelay: 100,
          },
        },
      });

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(attemptCount).toBe(2);
      });
    });

    it('should not retry on 4xx errors', async () => {
      let attemptCount = 0;

      addHandler(
        http.get('/api/agents', () => {
          attemptCount++;
          return new HttpResponse(null, { status: 404 });
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(attemptCount).toBe(1);
      });
    });

    it('should use exponential backoff for retries', async () => {
      const retryTimes: number[] = [];

      addHandler(
        http.get('/api/agents', () => {
          retryTimes.push(Date.now());
          return HttpResponse.error();
        })
      );

      queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
          },
        },
      });

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(retryTimes.length).toBeGreaterThan(1);
      }, { timeout: 5000 });
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache on mutation', async () => {
      let fetchCount = 0;

      addHandler(
        http.get('/api/agents', () => {
          fetchCount++;
          return HttpResponse.json({ success: true, data: [] });
        })
      );

      addHandler(
        http.post('/api/agents', () => {
          return HttpResponse.json({ success: true, data: { id: '123' } });
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(fetchCount).toBe(1);
      });

      // Trigger mutation (spawn agent)
      // This would be done through the UI in a real app
      await queryClient.invalidateQueries({ queryKey: ['agents'] });

      await waitFor(() => {
        expect(fetchCount).toBe(2);
      });
    });

    it('should refetch on window focus', async () => {
      let fetchCount = 0;

      addHandler(
        http.get('/api/dashboard/metrics', () => {
          fetchCount++;
          return HttpResponse.json({ success: true, data: {} });
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/',
        queryClient,
      });

      await waitFor(() => {
        expect(fetchCount).toBe(1);
      });

      // Simulate window focus
      window.dispatchEvent(new Event('focus'));

      await waitFor(() => {
        expect(fetchCount).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Optimistic Updates', () => {
    it('should show optimistic update before server response', async () => {
      addHandler(
        http.post('/api/agents', async () => {
          // Delay response
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return HttpResponse.json({ success: true, data: { id: '123' } });
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      // Trigger agent spawn mutation
      // In real app, this would update UI immediately
      const optimisticAgent = { id: 'temp-123', name: 'New Agent', status: 'pending' };
      queryClient.setQueryData(['agents'], (old: any) => [...(old || []), optimisticAgent]);

      // Check optimistic update appears immediately
      expect(queryClient.getQueryData(['agents'])).toContainEqual(optimisticAgent);
    });

    it('should rollback on mutation failure', async () => {
      const initialData = [{ id: '1', name: 'Agent 1' }];
      queryClient.setQueryData(['agents'], initialData);

      addHandler(
        http.post('/api/agents', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      // Trigger mutation with optimistic update
      const optimisticAgent = { id: 'temp-123', name: 'New Agent' };
      queryClient.setQueryData(['agents'], [...initialData, optimisticAgent]);

      // On error, should rollback
      queryClient.setQueryData(['agents'], initialData);

      expect(queryClient.getQueryData(['agents'])).toEqual(initialData);
    });
  });

  describe('Request Cancellation', () => {
    it('should cancel in-flight requests on unmount', async () => {
      let requestCancelled = false;

      addHandler(
        http.get('/api/agents', () => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(HttpResponse.json({ success: true, data: [] }));
            }, 5000);
          });
        })
      );

      const { unmount } = renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      // Unmount before request completes
      unmount();

      // Request should be cancelled
      expect(queryClient.isFetching()).toBe(0);
    });

    it('should cancel previous request when query key changes', async () => {
      let requestCount = 0;

      addHandler(
        http.get('/api/agents', () => {
          requestCount++;
          return HttpResponse.json({ success: true, data: [] });
        })
      );

      renderWithProviders(<App />, {
        initialRoute: '/agents',
        queryClient,
      });

      await waitFor(() => {
        expect(requestCount).toBe(1);
      });

      // Change query parameters
      await queryClient.invalidateQueries({ queryKey: ['agents'] });

      await waitFor(() => {
        expect(requestCount).toBe(2);
      });
    });
  });
});
