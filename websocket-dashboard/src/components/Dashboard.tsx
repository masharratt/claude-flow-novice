import React from 'react';
import { SwarmInfo } from '../types/websocket';
import { SwarmCard } from './SwarmCard';

interface DashboardProps {
  swarms: SwarmInfo[];
  isLoading: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ swarms, isLoading }) => {
  const activeSwarms = swarms.filter(s => s.status === 'active');
  const completedSwarms = swarms.filter(s => s.status === 'completed');
  const failedSwarms = swarms.filter(s => s.status === 'failed');
  const pausedSwarms = swarms.filter(s => s.status === 'paused');

  const StatCard: React.FC<{ title: string; value: number; color: string }> = ({ title, value, color }) => (
    <div className={`${color} rounded-lg p-4 text-white`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-90">{title}</div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="text-2xl mb-4">🔄</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Loading CFN Loop Dashboard</h2>
          <p className="text-gray-600">Connecting to WebSocket server and gathering swarm data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">CFN Loop Monitoring Dashboard</h2>
        <p className="text-gray-600">Real-time monitoring of active CFN Loop swarms and agent coordination</p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Swarms" value={activeSwarms.length} color="bg-blue-600" />
        <StatCard title="Completed Swarms" value={completedSwarms.length} color="bg-green-600" />
        <StatCard title="Failed Swarms" value={failedSwarms.length} color="bg-red-600" />
        <StatCard title="Total Swarms" value={swarms.length} color="bg-purple-600" />
      </div>

      {/* Active Swarms */}
      {activeSwarms.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Swarms ({activeSwarms.length})</h3>
          <div className="space-y-4">
            {activeSwarms.map(swarm => (
              <SwarmCard key={swarm.id} swarm={swarm} />
            ))}
          </div>
        </div>
      )}

      {/* Completed Swarms */}
      {completedSwarms.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Completed Swarms ({completedSwarms.length})</h3>
          <div className="space-y-4">
            {completedSwarms.map(swarm => (
              <SwarmCard key={swarm.id} swarm={swarm} />
            ))}
          </div>
        </div>
      )}

      {/* Failed Swarms */}
      {failedSwarms.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Failed Swarms ({failedSwarms.length})</h3>
          <div className="space-y-4">
            {failedSwarms.map(swarm => (
              <SwarmCard key={swarm.id} swarm={swarm} />
            ))}
          </div>
        </div>
      )}

      {/* Paused Swarms */}
      {pausedSwarms.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Paused Swarms ({pausedSwarms.length})</h3>
          <div className="space-y-4">
            {pausedSwarms.map(swarm => (
              <SwarmCard key={swarm.id} swarm={swarm} />
            ))}
          </div>
        </div>
      )}

      {/* No Swarms */}
      {swarms.length === 0 && (
        <div className="bg-white rounded-lg shadow-md p-12 text-center border border-gray-200">
          <div className="text-4xl mb-4">📡</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Swarms</h3>
          <p className="text-gray-600 mb-4">
            No CFN Loop swarms are currently running or have been recorded.
          </p>
          <p className="text-sm text-gray-500">
            Swarms will appear here when CFN Loop processes are executed.
          </p>
        </div>
      )}
    </div>
  );
};