/**
 * Agent Status Monitor Component
 * Real-time monitoring of agent statuses with live updates
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, Clock, Cpu, MemoryStick, AlertTriangle, CheckCircle, XCircle, Pause, Play, RefreshCw } from 'lucide-react';
import { AgentStatus, AgentState, ComponentProps } from '../types';

interface StatusCardProps {
  agentId: string;
  status: AgentStatus;
  onRefresh?: (agentId: string) => void;
  selected?: boolean;
  onClick?: (agentId: string) => void;
}

const StatusCard: React.FC<StatusCardProps> = ({
  agentId,
  status,
  onRefresh,
  selected,
  onClick
}) => {
  const getStateIcon = (state: AgentState) => {
    switch (state) {
      case 'active':
        return <Activity className="w-5 h-5 text-green-500" />;
      case 'paused':
        return <Pause className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'terminated':
        return <CheckCircle className="w-5 h-5 text-gray-400" />;
      default:
        return <Clock className="w-5 h-5 text-blue-500" />;
    }
  };

  const getStateColor = (state: AgentState) => {
    switch (state) {
      case 'active':
        return 'border-green-200 bg-green-50';
      case 'paused':
        return 'border-yellow-200 bg-yellow-50';
      case 'error':
        return 'border-red-200 bg-red-50';
      case 'terminated':
        return 'border-gray-200 bg-gray-50';
      default:
        return 'border-blue-200 bg-blue-50';
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getProgressBarColor = (progress: number) => {
    if (progress >= 80) return 'bg-green-500';
    if (progress >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const lastHeartbeat = new Date(status.lastHeartbeat);
  const timeSinceHeartbeat = Date.now() - lastHeartbeat.getTime();
  const isStale = timeSinceHeartbeat > 30000; // 30 seconds

  return (
    <div
      className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md ${getStateColor(status.state)} ${selected ? 'ring-2 ring-blue-500' : ''}`}
      onClick={() => onClick?.(agentId)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {getStateIcon(status.state)}
          <div>
            <h4 className="font-semibold text-gray-900">{agentId}</h4>
            <p className="text-xs text-gray-500">{status.activity}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isStale && (
            <AlertTriangle className="w-4 h-4 text-orange-500" title="Stale heartbeat" />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh?.(agentId);
            }}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress */}
      {status.progress > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>Progress</span>
            <span>{status.progress.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(status.progress)}`}
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="flex items-center space-x-2">
          <MemoryStick className="w-4 h-4 text-blue-500" />
          <div>
            <p className="text-xs text-gray-500">Memory</p>
            <p className="text-sm font-medium text-gray-900">
              {formatBytes(status.memoryUsage)}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-purple-500" />
          <div>
            <p className="text-xs text-gray-500">CPU</p>
            <p className="text-sm font-medium text-gray-900">
              {status.cpuUsage.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Token Usage */}
      <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
        <span>Token Usage</span>
        <div className="text-right">
          <p className="font-medium">{status.tokensUsed.toLocaleString()}</p>
          <p className="text-xs text-gray-500">{status.tokenUsageRate.toFixed(1)} /s</p>
        </div>
      </div>

      {/* Current Message */}
      {status.currentMessage && (
        <div className="mb-3 p-2 bg-white bg-opacity-50 rounded border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Current Message</p>
          <p className="text-sm text-gray-700">{status.currentMessage.type}</p>
          <p className="text-xs text-gray-500">
            Started: {formatDuration(Date.now() - status.currentMessage.startedAt.getTime())} ago
          </p>
        </div>
      )}

      {/* Recent Errors */}
      {status.recentErrors.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Recent Errors</p>
          {status.recentErrors.slice(0, 2).map((error, index) => (
            <div
              key={index}
              className={`p-2 rounded text-xs ${
                error.severity === 'critical' ? 'bg-red-100 text-red-700' :
                error.severity === 'error' ? 'bg-red-50 text-red-600' :
                'bg-yellow-50 text-yellow-700'
              }`}
            >
              <p className="font-medium truncate">{error.error}</p>
              <p className="text-xs opacity-75">
                {formatDuration(Date.now() - error.timestamp.getTime())} ago
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-3 border-t border-gray-200">
        <span>
          Last seen: {formatDuration(timeSinceHeartbeat)} ago
        </span>
        {status.estimatedCompletion && (
          <span>
            ETA: {formatDuration(status.estimatedCompletion.getTime() - Date.now())}
          </span>
        )}
      </div>
    </div>
  );
};

interface AgentStatusMonitorProps extends Partial<ComponentProps> {
  statuses: Record<string, AgentStatus>;
  onAgentSelect?: (agentId: string) => void;
  onRefresh?: (agentId?: string) => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
  filterByState?: AgentState[];
  maxCardsPerRow?: number;
  showErrorsOnly?: boolean;
}

export const AgentStatusMonitor: React.FC<AgentStatusMonitorProps> = ({
  statuses,
  onAgentSelect,
  onRefresh,
  autoRefresh = true,
  refreshInterval = 5000,
  filterByState,
  maxCardsPerRow = 3,
  showErrorsOnly = false,
  ...props
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string>();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter statuses based on criteria
  const filteredStatuses = useMemo(() => {
    let entries = Object.entries(statuses);

    if (filterByState && filterByState.length > 0) {
      entries = entries.filter(([_, status]) => filterByState.includes(status.state));
    }

    if (showErrorsOnly) {
      entries = entries.filter(([_, status]) =>
        status.state === 'error' || status.recentErrors.length > 0
      );
    }

    return entries;
  }, [statuses, filterByState, showErrorsOnly]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setLastUpdated(new Date());
      onRefresh?.();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, onRefresh]);

  const handleAgentSelect = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    onAgentSelect?.(agentId);
  }, [onAgentSelect]);

  const handleRefresh = useCallback(async (agentId?: string) => {
    setIsRefreshing(true);
    try {
      await onRefresh?.(agentId);
      setLastUpdated(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh]);

  const handleRefreshAll = useCallback(() => {
    handleRefresh();
  }, [handleRefresh]);

  // Summary statistics
  const stats = useMemo(() => {
    const allStatuses = Object.values(statuses);
    return {
      total: allStatuses.length,
      active: allStatuses.filter(s => s.state === 'active').length,
      paused: allStatuses.filter(s => s.state === 'paused').length,
      error: allStatuses.filter(s => s.state === 'error').length,
      terminated: allStatuses.filter(s => s.state === 'terminated').length,
      withErrors: allStatuses.filter(s => s.recentErrors.length > 0).length,
      avgProgress: allStatuses.reduce((sum, s) => sum + s.progress, 0) / (allStatuses.length || 1),
      totalTokens: allStatuses.reduce((sum, s) => sum + s.tokensUsed, 0),
      avgMemoryUsage: allStatuses.reduce((sum, s) => sum + s.memoryUsage, 0) / (allStatuses.length || 1),
      avgCpuUsage: allStatuses.reduce((sum, s) => sum + s.cpuUsage, 0) / (allStatuses.length || 1),
    };
  }, [statuses]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Agent Status Monitor</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefreshAll}
              disabled={isRefreshing}
              className="px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh All</span>
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            <p className="text-xs text-gray-500">Active</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.paused}</p>
            <p className="text-xs text-gray-500">Paused</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{stats.error}</p>
            <p className="text-xs text-gray-500">Errors</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {(stats.totalTokens / 1000).toFixed(1)}K
            </p>
            <p className="text-xs text-gray-500">Tokens</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">
              {stats.avgProgress.toFixed(0)}%
            </p>
            <p className="text-xs text-gray-500">Avg Progress</p>
          </div>
        </div>

        {/* Last Updated */}
        <div className="flex items-center justify-between text-xs text-gray-500 mt-4 pt-4 border-t border-gray-200">
          <span>
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
          <span>
            Showing {filteredStatuses.length} of {stats.total} agents
          </span>
        </div>
      </div>

      {/* Status Cards */}
      {filteredStatuses.length > 0 ? (
        <div
          className={`grid gap-4 ${
            maxCardsPerRow === 1 ? 'grid-cols-1' :
            maxCardsPerRow === 2 ? 'grid-cols-1 md:grid-cols-2' :
            maxCardsPerRow === 3 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' :
            'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          }`}
        >
          {filteredStatuses.map(([agentId, status]) => (
            <StatusCard
              key={agentId}
              agentId={agentId}
              status={status}
              selected={selectedAgentId === agentId}
              onRefresh={handleRefresh}
              onClick={handleAgentSelect}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium text-gray-900 mb-1">No agents found</p>
          <p className="text-sm text-gray-500">
            {showErrorsOnly
              ? 'No agents with errors found'
              : filterByState && filterByState.length > 0
                ? 'No agents match the current filters'
                : 'Agent statuses will appear here when agents are active'
            }
          </p>
        </div>
      )}
    </div>
  );
};

export default AgentStatusMonitor;