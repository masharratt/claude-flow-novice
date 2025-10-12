/**
 * useResources Hook
 *
 * React Query hook for fetching resource utilization for all agents
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '../../services/ApiClient';
import type { ApiResponse, ResourcesResponse } from '../../types/api';
import { queryKeys } from '../../types/api';

interface UseResourcesOptions {
  refetchInterval?: number | false;
  enabled?: boolean;
}

export function useResources(
  options: UseResourcesOptions = {}
): UseQueryResult<ApiResponse<ResourcesResponse>, Error> {
  const { refetchInterval = 5000, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.resources.all(),
    queryFn: () => apiClient.getResources(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval,
    enabled,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export default useResources;
