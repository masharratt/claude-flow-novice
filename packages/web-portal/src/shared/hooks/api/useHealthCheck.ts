/**
 * useHealthCheck Hook
 *
 * React Query hook for system health check with service status
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '../../services/ApiClient';
import type { ApiResponse, HealthCheckResponse } from '../../types/api';
import { queryKeys } from '../../types/api';

interface UseHealthCheckOptions {
  refetchInterval?: number | false;
  enabled?: boolean;
}

export function useHealthCheck(
  options: UseHealthCheckOptions = {}
): UseQueryResult<ApiResponse<HealthCheckResponse>, Error> {
  const { refetchInterval = 30000, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.health.check(),
    queryFn: () => apiClient.getHealthCheck(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval,
    enabled,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export default useHealthCheck;
