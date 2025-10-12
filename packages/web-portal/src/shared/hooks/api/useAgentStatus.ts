/**
 * useAgentStatus Hook
 *
 * React Query hook for fetching individual agent status with metrics and current task
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '../../services/ApiClient';
import type { ApiResponse, AgentStatusResponse } from '../../types/api';
import { queryKeys } from '../../types/api';

interface UseAgentStatusOptions {
  agentId: string;
  refetchInterval?: number | false;
  enabled?: boolean;
}

export function useAgentStatus(
  options: UseAgentStatusOptions
): UseQueryResult<ApiResponse<AgentStatusResponse>, Error> {
  const { agentId, refetchInterval = 3000, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.agents.status(agentId),
    queryFn: () => apiClient.getAgentStatus(agentId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval,
    enabled: enabled && !!agentId,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export default useAgentStatus;
