/**
 * useAgentHierarchy Hook
 *
 * React Query hook for fetching agent hierarchy tree with optional filters
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '../../services/ApiClient';
import type { ApiResponse, AgentHierarchyResponse, AgentFilters } from '../../types/api';
import { queryKeys } from '../../types/api';

interface UseAgentHierarchyOptions {
  filters?: AgentFilters;
  refetchInterval?: number | false;
  enabled?: boolean;
}

export function useAgentHierarchy(
  options: UseAgentHierarchyOptions = {}
): UseQueryResult<ApiResponse<AgentHierarchyResponse>, Error> {
  const { filters, refetchInterval = 5000, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.agents.hierarchy(filters),
    queryFn: () => apiClient.getAgentHierarchy(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    refetchInterval,
    enabled,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export default useAgentHierarchy;
