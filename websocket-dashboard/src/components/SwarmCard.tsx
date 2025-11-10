import React from 'react';
import { SwarmInfo, AgentStatus } from '../types/websocket';

interface SwarmCardProps {
  swarm: SwarmInfo;
}

export const SwarmCard: React.FC<SwarmCardProps> = ({ swarm }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600';
      case 'completed': return 'text-blue-600';
      case 'failed': return 'text-red-600';
      case 'paused': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  const getAgentStatusColor = (status: AgentStatus['status']) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'completed': return 'bg-blue-500';
      case 'error': return 'bg-red-500';
      case 'idle': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  const progressPercentage = (swarm.currentIteration / swarm.maxIterations) * 100;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4 border border-gray-200">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{swarm.id}</h3>
          <p className="text-sm text-gray-600 mb-2">{swarm.epicGoal}</p>
          <div className="flex items-center space-x-4 text-sm">
            <span className="text-gray-500">Mode: <span className="font-medium">{swarm.mode}</span></span>
            <span className={`font-medium ${getStatusColor(swarm.status)}`}>
              {swarm.status.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Progress</div>
          <div className="text-lg font-semibold">{swarm.currentIteration}/{swarm.maxIterations}</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Agents Status */}
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Agents ({swarm.agents.length})</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {swarm.agents.map((agent) => (
            <div key={agent.id} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
              <div className={`w-2 h-2 rounded-full ${getAgentStatusColor(agent.status)}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{agent.type}</div>
                <div className="text-xs text-gray-500 truncate">{agent.currentTask || 'Idle'}</div>
                {agent.confidence && (
                  <div className="text-xs text-gray-400">
                    Confidence: {(agent.confidence * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-400">
        Created: {new Date(swarm.createdAt).toLocaleString()}
      </div>
    </div>
  );
};