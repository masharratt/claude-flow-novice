/**
 * useEvents Hook
 *
 * React Query hook for fetching event history with pagination and filters
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '../../services/ApiClient';
import type { PaginatedResponse, EventsResponse, EventsParams } from '../../types/api';
import { queryKeys } from '../../types/api';

interface UseEventsOptions {
  params?: EventsParams;
  refetchInterval?: number | false;
  enabled?: boolean;
}

export function useEvents(
  options: UseEventsOptions = {}
): UseQueryResult<PaginatedResponse<EventsResponse>, Error> {
  const { params, refetchInterval = false, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.events.list(params),
    queryFn: () => apiClient.getEvents(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval,
    enabled,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export default useEvents;
