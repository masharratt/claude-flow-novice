/**
 * useMetrics Hook
 *
 * React Query hook for fetching system-wide metrics (CPU, memory, agents, tasks, etc.)
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '../../services/ApiClient';
import type { ApiResponse, MetricsResponse } from '../../types/api';
import { queryKeys } from '../../types/api';

interface UseMetricsOptions {
  refetchInterval?: number | false;
  enabled?: boolean;
}

export function useMetrics(
  options: UseMetricsOptions = {}
): UseQueryResult<ApiResponse<MetricsResponse>, Error> {
  const { refetchInterval = 10000, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.metrics.all(),
    queryFn: () => apiClient.getMetrics(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval,
    enabled,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export default useMetrics;
